"""The model-runtime seam — ARC-01, CON-03/04, ADP-05/06/09.

One interface, two transports. In development the runtime runs in this
process; at the venue it may be a separate service on the same machine, and
switching between them is configuration rather than code:

    SATQUERY_RUNTIME=inproc                     (default)
    SATQUERY_RUNTIME=http://127.0.0.1:8100

The pipeline only ever holds a `ModelRuntime`. It does not know which one it
has, it never imports training code (CON-04), and it converts whatever comes
back into evidence records at this boundary — so nothing downstream reads raw
model output (CON-01).

What a pack is
--------------
A directory of standard PEFT artefacts plus a manifest (§4.6):

    adapters/adapter_A_rs_general/
        pack.json                  the manifest
        adapter_config.json        PEFT
        adapter_model.safetensors  PEFT

The manifest is keyed by the same `adapter` names the registry uses, which is
what makes "the real M1 pack arrives" a one-line configuration change rather
than an integration. Until a pack exists, `available()` is False for that
adapter and the classical specialist serves the capability — stated in the
result as `engine`, and in the trace, rather than implied.
"""

from __future__ import annotations

import base64
import hashlib
import io
import json
import math
import os
import urllib.error
import urllib.request
from dataclasses import dataclass, field
from pathlib import Path
from typing import Any, Protocol

from . import __version__
from .errors import SatQueryError

#: Which component serves each capability today (audit B2). Updated as packs
#: land; `/api/health` reports it so the claim is never louder than the state.
SERVING_PLAN: dict[str, str] = {
    "rs_vqa": "M1 for optical imagery when its pack can serve (live, or pre-computed for known images); classical VQA otherwise, and always for SAR",
    "grounding": "classical specialist until M2 lands",
    "change_vqa": "classical specialist until M3 lands",
    "optical_sar": "classical late fusion until M4 lands",
}

REQUIRED_MANIFEST_KEYS = ("pack_id", "component", "adapter", "base_model")


# --------------------------------------------------------------------------- #
# pack
# --------------------------------------------------------------------------- #

@dataclass
class AdapterPack:
    """One loaded pack, described by its own manifest and nothing else."""

    pack_id: str
    component: str                      # M1 | M2 | M3 | M4
    adapter: str                        # the registry's adapter name
    base_model: str
    revision: str = ""
    corpus: str = ""
    split: str = ""
    zero_shot: float | None = None
    adapted: float | None = None
    gain: float | None = None
    date: str = ""
    licence: str = ""
    path: str = ""
    artefacts: list[str] = field(default_factory=list)
    stub: bool = False
    #: Answers produced by this pack ahead of time (`precomputed.jsonl`), for
    #: machines that cannot run a 4-bit 7B. Counted here, served by the runtime.
    precomputed: int = 0

    def to_dict(self) -> dict[str, Any]:
        return {k: v for k, v in self.__dict__.items()}


def load_packs(directory: str | Path = "adapters") -> dict[str, AdapterPack]:
    """Read every pack under `directory`, keyed by adapter name (CON-04).

    A malformed pack is skipped loudly rather than crashing the server: on a
    venue machine, one bad directory must not take the demo down with it.
    """
    root = Path(directory)
    packs: dict[str, AdapterPack] = {}
    if not root.is_dir():
        return packs
    for d in sorted(p for p in root.iterdir() if p.is_dir()):
        manifest = d / "pack.json"
        if not manifest.exists():
            continue
        try:
            m = json.loads(manifest.read_text(encoding="utf-8"))
        except json.JSONDecodeError:
            continue
        if any(k not in m for k in REQUIRED_MANIFEST_KEYS):
            continue
        artefacts = sorted(p.name for p in d.iterdir() if p.name != "pack.json")
        packs[str(m["adapter"])] = AdapterPack(
            pack_id=str(m["pack_id"]), component=str(m["component"]),
            adapter=str(m["adapter"]), base_model=str(m["base_model"]),
            revision=str(m.get("revision", "")), corpus=str(m.get("corpus", "")),
            split=str(m.get("split", "")),
            zero_shot=m.get("zero_shot"), adapted=m.get("adapted"),
            gain=m.get("gain"), date=str(m.get("date", "")),
            licence=str(m.get("licence", "")), path=str(d),
            artefacts=artefacts, stub=bool(m.get("stub", False)),
            precomputed=len(_read_precomputed(d)))
    return packs


# --------------------------------------------------------------------------- #
# the interface
# --------------------------------------------------------------------------- #

class ModelRuntime(Protocol):
    """What the pipeline is allowed to ask a model for."""

    transport: str

    def packs(self) -> dict[str, AdapterPack]: ...

    def available(self, adapter: str) -> bool: ...

    def infer(self, adapter: str, task: str, payload: dict[str, Any]) -> dict[str, Any]: ...


# --------------------------------------------------------------------------- #
# M1 — how the adapted VQA model is actually run
# --------------------------------------------------------------------------- #
#
# Two ways to serve the pack, one contract. LIVE runs the base model with the
# adapter on a CUDA GPU (a 4-bit 7B needs ~6 GB). PRECOMPUTED serves answers the
# same live path produced earlier, on Kaggle, for known images and questions —
# the spec's own instruction for a venue laptop (03 §12, ML plan §5). Either way
# the answer came from M1; the trace says which, and a query that neither can
# answer falls back to the classical specialist and says so.

#: The prompt suffix M1 was trained and measured with. It MUST equal
#: `models/common/config.SHORT_ANSWER_SUFFIX`; a check in tests.py fails if the
#: two drift, because a different prompt at serving time is a different model.
M1_PROMPT_SUFFIX = "Answer the question using a single word or short phrase."

M1_MAX_NEW_TOKENS = 32


def raster_rgb_u8(raster: Any) -> Any:
    """The exact pixels M1 is shown: the raster's display RGB, as uint8."""
    import numpy as np

    rgb = np.clip(np.asarray(raster.rgb(), dtype=np.float32), 0.0, 1.0)
    return (rgb * 255.0 + 0.5).astype(np.uint8)


def image_key(rgb_u8: Any) -> str:
    """Content address of the image M1 sees. Same pixels, same key, any machine."""
    h = hashlib.sha256()
    h.update(str(tuple(rgb_u8.shape)).encode())
    h.update(rgb_u8.tobytes())
    return h.hexdigest()


def normalise_question(q: str) -> str:
    return " ".join((q or "").lower().strip().rstrip("?").split())


def png_b64(rgb_u8: Any) -> str:
    from PIL import Image

    buf = io.BytesIO()
    Image.fromarray(rgb_u8, mode="RGB").save(buf, format="PNG")
    return base64.b64encode(buf.getvalue()).decode("ascii")


def _read_precomputed(pack_dir: Path) -> dict[tuple[str, str], dict[str, Any]]:
    path = Path(pack_dir) / "precomputed.jsonl"
    rows: dict[tuple[str, str], dict[str, Any]] = {}
    if not path.is_file():
        return rows
    for line in path.read_text(encoding="utf-8").splitlines():
        if not line.strip():
            continue
        try:
            r = json.loads(line)
            rows[(r["image_key"], normalise_question(r["question"]))] = r
        except (json.JSONDecodeError, KeyError):
            continue
    return rows


class M1Live:
    """Base model + adapter, loaded once, run greedily — the evaluated path.

    Mirrors `models/eval_baseline.py`, which measured the 0.660 this pack
    reports: same auto-class probe, 4-bit NF4 with fp16 compute, default
    processor, chat template, prompt suffix and greedy decoding. Serving it any
    other way would serve a model nobody measured.
    """

    def __init__(self, pack: "AdapterPack") -> None:
        self.pack = pack
        self._model: Any = None
        self._processor: Any = None

    @staticmethod
    def possible(pack: "AdapterPack") -> tuple[bool, str]:
        if "adapter_model.safetensors" not in pack.artefacts:
            return False, "the adapter weights are not on this machine"
        try:
            import peft  # noqa: F401
            import torch
            import transformers  # noqa: F401
        except ImportError:
            return False, "torch, transformers and peft are not installed here"
        if not torch.cuda.is_available():
            return False, "no CUDA GPU here; a 4-bit 7B needs about 6 GB of VRAM"
        return True, ""

    def _load(self) -> None:
        import torch
        import transformers
        from peft import PeftModel
        from transformers import AutoProcessor, BitsAndBytesConfig

        cls = next(getattr(transformers, n) for n in
                   ("AutoModelForImageTextToText", "AutoModelForVision2Seq")
                   if hasattr(transformers, n))
        kw: dict[str, Any] = {
            "device_map": "auto",
            "quantization_config": BitsAndBytesConfig(
                load_in_4bit=True, bnb_4bit_compute_dtype=torch.float16,
                bnb_4bit_quant_type="nf4", bnb_4bit_use_double_quant=True),
        }
        if self.pack.revision:
            kw["revision"] = self.pack.revision
        self._processor = AutoProcessor.from_pretrained(self.pack.base_model,
                                                        trust_remote_code=True)
        try:
            base = cls.from_pretrained(self.pack.base_model, trust_remote_code=True,
                                       dtype=torch.float16, **kw)
        except TypeError:
            base = cls.from_pretrained(self.pack.base_model, trust_remote_code=True,
                                       torch_dtype=torch.float16, **kw)
        self._model = PeftModel.from_pretrained(base, self.pack.path).eval()

    def answer(self, rgb_u8: Any, question: str) -> tuple[str, float]:
        """(answer, confidence). Confidence is the geometric mean probability of
        the generated tokens — a model-internal score, not yet calibrated
        against outcomes (audit B8), and reported as exactly that."""
        import torch
        from PIL import Image

        if self._model is None:
            self._load()
        text = f"{question}\n{M1_PROMPT_SUFFIX}"
        messages = [{"role": "user", "content": [{"type": "image"},
                                                 {"type": "text", "text": text}]}]
        prompt = self._processor.apply_chat_template(messages, tokenize=False,
                                                     add_generation_prompt=True)
        inputs = self._processor(text=[prompt], images=[Image.fromarray(rgb_u8, "RGB")],
                                 return_tensors="pt").to(self._model.device)
        with torch.inference_mode():
            out = self._model.generate(**inputs, max_new_tokens=M1_MAX_NEW_TOKENS,
                                       do_sample=False, output_scores=True,
                                       return_dict_in_generate=True)
        start = inputs["input_ids"].shape[1]
        tokens = out.sequences[0][start:]
        logps = [torch.log_softmax(sc[0].float(), dim=-1)[tok].item()
                 for sc, tok in zip(out.scores, tokens)]
        conf = math.exp(sum(logps) / len(logps)) if logps else 0.0
        return self._processor.decode(tokens, skip_special_tokens=True).strip(), conf


class InProcessRuntime:
    """The default. Packs are read from disk; inference runs here.

    With no pack for an adapter, `available()` is False and the caller falls
    back to its classical specialist. Nothing pretends: a stub pack reports
    itself as a stub, and its inference result says so (ADP-06).
    """

    transport = "inproc"

    def __init__(self, directory: str | Path = "adapters") -> None:
        self.directory = str(directory)
        self.reload()

    def reload(self) -> None:
        self._packs = load_packs(self.directory)
        self._cache = {a: _read_precomputed(Path(p.path))
                       for a, p in self._packs.items() if not p.stub}
        self._live: dict[str, M1Live] = {}
        self._live_why: dict[str, str] = {}
        for a, p in self._packs.items():
            if p.stub or p.component != "M1":
                continue
            ok, why = M1Live.possible(p)
            if ok:
                self._live[a] = M1Live(p)
            else:
                self._live_why[a] = why

    def mode(self, adapter: str) -> str | None:
        """How this adapter is served here: stub, live, precomputed, or None."""
        pack = self._packs.get(adapter)
        if pack is None:
            return None
        if pack.stub:
            return "stub"
        if adapter in self._live:
            return "live"
        if self._cache.get(adapter):
            return "precomputed"
        return None

    def not_serving_reason(self, adapter: str) -> str:
        return self._live_why.get(adapter, "") or "no inference path for this pack"

    def packs(self) -> dict[str, AdapterPack]:
        return dict(self._packs)

    def available(self, adapter: str) -> bool:
        """True only if this runtime can *serve* the adapter, not merely hold it.

        The pipeline turns this into `adapter_loaded`, and from there into
        `engine: "neural+classical"` on every result. When it returned True for
        any pack on disk, staging the real M1 pack made the system report a
        neural path on answers produced entirely by the classical specialist —
        measured, 23 Sep: `engine: neural+classical` on a reply citing a
        three-class Otsu split. A loaded pack is reported by `describe()`; it
        is only *available* when `infer()` can actually run it.
        """
        return self.mode(adapter) is not None

    def infer(self, adapter: str, task: str, payload: dict[str, Any]) -> dict[str, Any]:
        pack = self._packs.get(adapter)
        if pack is None:
            raise SatQueryError(
                "no_adapter", f"No adapter pack named {adapter!r} is loaded.",
                "Stage the pack under adapters/ and restart, or let the "
                "classical specialist serve this capability.", status=503)
        if pack.stub:
            # A stub pack exercises the whole path — loader, keying, engine
            # reporting, trace — before any weights exist. It returns nothing
            # that could be mistaken for a measurement.
            return {"engine": "neural+classical", "pack": pack.pack_id,
                    "stub": True, "task": task, "claims": []}
        if task != "vqa" or pack.component != "M1":
            raise SatQueryError(
                "not_implemented", f"Pack {pack.pack_id!r} has no {task!r} inference path.",
                "The classical specialist serves this capability.", status=501)

        rgb, question = payload["_rgb_u8"], payload["question"]
        if adapter in self._live:
            ans, conf = self._live[adapter].answer(rgb, question)
            return {"engine": "neural+classical", "pack": pack.pack_id, "stub": False,
                    "source": "live", "answer": ans, "confidence": round(conf, 4)}

        row = self._cache.get(adapter, {}).get(
            (payload["image_key"], normalise_question(question)))
        if row is None:
            raise SatQueryError(
                "not_precomputed",
                f"M1 has no pre-computed answer for this image and question, and "
                f"cannot run live here: {self.not_serving_reason(adapter)}.",
                "The classical specialist answers instead. Pre-compute the demo "
                "questions on a GPU with models/precompute_m1.py.", status=404)
        return {"engine": "neural+classical", "pack": pack.pack_id, "stub": False,
                "source": "precomputed", "answer": row["answer"],
                "confidence": float(row.get("confidence", 0.0)),
                "produced": row.get("produced", "")}


class HttpRuntime:
    """The venue transport: the same interface over one local HTTP hop.

    Deliberately stdlib-only and offline by construction — the base URL is a
    loopback address on the venue machine, and a timeout falls back rather
    than hanging the request (ADP-09, NFR-05).
    """

    transport = "http"

    def __init__(self, base: str, timeout: float = 20.0) -> None:
        self.base = base.rstrip("/")
        self.timeout = timeout
        self._packs: dict[str, AdapterPack] | None = None

    def _get(self, path: str) -> Any:
        with urllib.request.urlopen(f"{self.base}{path}", timeout=self.timeout) as r:
            return json.loads(r.read().decode("utf-8"))

    def packs(self) -> dict[str, AdapterPack]:
        if self._packs is not None:
            return dict(self._packs)
        try:
            raw = self._get("/packs")
        except (urllib.error.URLError, OSError, json.JSONDecodeError):
            self._packs = {}
            return {}
        self._packs = {str(p["adapter"]): AdapterPack(**p) for p in raw.get("packs", [])}
        return dict(self._packs)

    def available(self, adapter: str) -> bool:
        return adapter in self.packs()

    def infer(self, adapter: str, task: str, payload: dict[str, Any]) -> dict[str, Any]:
        # Private keys (`_rgb_u8`) are in-process conveniences, not wire data;
        # a remote runtime receives the same pixels as a PNG.
        wire = {k: v for k, v in payload.items() if not k.startswith("_")}
        if "_rgb_u8" in payload:
            wire["image_png_b64"] = png_b64(payload["_rgb_u8"])
        body = json.dumps({"adapter": adapter, "task": task, **wire}).encode()
        req = urllib.request.Request(f"{self.base}/infer", data=body,
                                     headers={"Content-Type": "application/json"})
        try:
            with urllib.request.urlopen(req, timeout=self.timeout) as r:
                return json.loads(r.read().decode("utf-8"))
        except (urllib.error.URLError, OSError) as exc:
            raise SatQueryError(
                "runtime_unreachable",
                "The model runtime did not answer.",
                "The classical path still serves this query; restart the "
                "model runtime to restore the adapted path.", status=503) from exc


def load_runtime(spec: str | None = None, directory: str | Path = "adapters") -> ModelRuntime:
    """Build the runtime named by `spec` or by SATQUERY_RUNTIME."""
    spec = spec or os.environ.get("SATQUERY_RUNTIME", "inproc")
    if spec.startswith("http://") or spec.startswith("https://"):
        return HttpRuntime(spec)
    return InProcessRuntime(directory)


def describe(runtime: ModelRuntime) -> dict[str, Any]:
    """What `/api/health` says about the model side (API-05)."""
    packs = runtime.packs()
    # Loaded and serving are different claims. A pack on disk whose inference
    # path is not wired is loaded, reported with its measured numbers, and
    # serves nothing — so it must not move `engine`.
    serving = sorted(a for a in packs if runtime.available(a))
    return {
        "version": __version__,
        "transport": runtime.transport,
        "adapters_loaded": bool(packs),
        "adapters": sorted(packs),
        "adapters_serving": serving,
        "stub_packs": sorted(a for a, p in packs.items() if p.stub),
        "packs": {a: {"pack_id": p.pack_id, "component": p.component,
                      "zero_shot": p.zero_shot, "adapted": p.adapted,
                      "gain": p.gain, "serving": a in serving,
                  "mode": (runtime.mode(a) if hasattr(runtime, "mode")
                           else ("remote" if a in serving else None)),
                  "precomputed": p.precomputed}
                  for a, p in sorted(packs.items())},
        "engine": "neural+classical" if serving else "classical",
        "serving_plan": SERVING_PLAN,
    }
