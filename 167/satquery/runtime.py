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
    try:
        if not root.is_dir():
            return packs
        dirs = sorted(p for p in root.iterdir() if p.is_dir())
    except OSError as exc:
        # e.g. a bind mount the container may not read (SELinux without :z)
        import sys
        print(f"  adapter packs: cannot read {root} ({exc.strerror}); serving none", file=sys.stderr)
        return packs
    for d in dirs:
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

    rgb = np.clip(np.asarray(raster.rgb(stretch=False), dtype=np.float32), 0.0, 1.0)
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


def decode_png_b64(b64: str) -> Any:
    """The uint8 RGB array a `png_b64` payload carries — the inverse of `png_b64`.

    PNG is lossless, so these are the pixels the sender hashed into `image_key`.
    """
    import numpy as np
    from PIL import Image

    try:
        with Image.open(io.BytesIO(base64.b64decode(b64, validate=True))) as im:
            return np.array(im.convert("RGB"), dtype=np.uint8)
    except Exception as exc:                                      # noqa: BLE001
        raise SatQueryError(
            "bad_image", "The image in the request is not a decodable PNG.",
            "Send the image as a base64-encoded PNG in `image_png_b64`.", status=400) from exc


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

    def questions_for(self, adapter: str, key: str) -> list[dict[str, Any]]:
        """The questions this runtime already holds M1 answers for, on one image.

        Questions and confidences only — never the answers. The list is a
        prompt for the presenter, not a preview of the result.
        """
        seen: dict[str, dict[str, Any]] = {}
        for (k, _), row in self._cache.get(adapter, {}).items():
            if k == key:
                seen.setdefault(row["question"], {"question": row["question"],
                                                  "confidence": float(row.get("confidence", 0.0))})
        return sorted(seen.values(), key=lambda q: -q["confidence"])

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

        rgb, question = payload.get("_rgb_u8"), payload["question"]
        key = payload.get("image_key")
        if rgb is None and payload.get("image_png_b64"):
            # a remote caller: the same pixels as a PNG, and the key they hashed
            rgb = decode_png_b64(payload["image_png_b64"])
            if key and image_key(rgb) != key:
                raise SatQueryError(
                    "bad_image", "The image decoded from the request does not match its image_key.",
                    "Send the exact uint8 RGB pixels the key was computed from, "
                    "losslessly (PNG).", status=400)
        if key is None and rgb is not None:
            key = image_key(rgb)
        if adapter in self._live:
            if rgb is None:
                raise SatQueryError(
                    "bad_image", "A live M1 answer needs the image, and the request has none.",
                    "Send `image_png_b64`.", status=400)
            ans, conf = self._live[adapter].answer(rgb, question)
            return {"engine": "neural+classical", "pack": pack.pack_id, "stub": False,
                    "source": "live", "answer": ans, "confidence": round(conf, 4)}

        row = self._cache.get(adapter, {}).get((key, normalise_question(question)))
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

    #: After a failed /packs, wait this long before asking again — so a runtime
    #: that starts after the API is picked up, without hammering one that is down.
    RETRY_S = 5.0

    #: How long a successful /health answer is trusted for `mode()`. Short, so a
    #: runtime that finishes loading is noticed within a page interaction.
    HEALTH_TTL_S = 30.0

    def __init__(self, base: str, timeout: float = 20.0) -> None:
        self.base = base.rstrip("/")
        self.timeout = timeout
        self._packs: dict[str, AdapterPack] | None = None
        self._failed_at = 0.0
        self._health: dict[str, Any] | None = None
        self._health_at = 0.0
        self.reachable = False

    @staticmethod
    def _auth() -> dict[str, str]:
        """Modal proxy-auth headers, when configured. Unset (the venue): none."""
        key = os.environ.get("SATQUERY_RUNTIME_KEY")
        secret = os.environ.get("SATQUERY_RUNTIME_SECRET")
        return {"Modal-Key": key, "Modal-Secret": secret} if key and secret else {}

    def _get(self, path: str) -> Any:
        req = urllib.request.Request(f"{self.base}{path}", headers=self._auth())
        with urllib.request.urlopen(req, timeout=self.timeout) as r:
            return json.loads(r.read().decode("utf-8"))

    def mode(self, adapter: str) -> str | None:
        """How the runtime serves this adapter (`live`, `precomputed`, None), from /health."""
        import time
        now = time.time()
        if self._health is None or now - self._health_at > self.HEALTH_TTL_S:
            if self._health is None and now - self._failed_at < self.RETRY_S:
                return None
            try:
                self._health, self._health_at = self._get("/health"), now
                self.reachable = True
            except (urllib.error.URLError, OSError, json.JSONDecodeError):
                self._failed_at, self._health, self.reachable = now, None, False
                return None
        return ((self._health or {}).get("packs", {}).get(adapter) or {}).get("mode")

    def packs(self) -> dict[str, AdapterPack]:
        # Only a successful answer is cached. A failure is not "no packs
        # forever": at the venue the runtime may come up after the API.
        import time
        if self._packs is not None:
            return dict(self._packs)
        if time.time() - self._failed_at < self.RETRY_S:
            return {}
        try:
            raw = self._get("/packs")
        except (urllib.error.URLError, OSError, json.JSONDecodeError):
            self._failed_at, self.reachable = time.time(), False
            return {}
        self._packs = {str(p["adapter"]): AdapterPack(**p) for p in raw.get("packs", [])}
        self.reachable = True
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
                                     headers={"Content-Type": "application/json", **self._auth()})
        try:
            with urllib.request.urlopen(req, timeout=self.timeout) as r:
                return json.loads(r.read().decode("utf-8"))
        except urllib.error.HTTPError as exc:
            # the runtime answered with a typed error — pass it on as it was said
            try:
                err = json.loads(exc.read().decode("utf-8"))["error"]
                raise SatQueryError(err["code"], err["message"], err["remedy"], status=exc.code) from exc
            except (KeyError, ValueError, TypeError):
                raise SatQueryError("runtime_error", f"The model runtime returned HTTP {exc.code}.",
                                    "The classical path still serves this query.", status=503) from exc
        except (urllib.error.URLError, OSError) as exc:
            raise SatQueryError(
                "runtime_unreachable",
                "The model runtime did not answer.",
                "The classical path still serves this query; restart the "
                "model runtime to restore the adapted path.", status=503) from exc


def handle(runtime: ModelRuntime, method: str, path: str,
           body: bytes = b"") -> tuple[int, dict[str, Any]]:
    """The runtime's wire contract as one function: (status, JSON reply).

    Every server that fronts a runtime — the stdlib one below, the Modal ASGI
    app — calls this and only this, so there is one behaviour, not two.

        GET  /packs    {"packs": [AdapterPack, ...]}
        GET  /health   {"ok": true, ...describe(runtime)}
        POST /infer    {"adapter", "task", ...payload} -> runtime reply
        errors         {"error": {"code", "message", "remedy"}}
    """
    def err(status: int, code: str, message: str, remedy: str) -> tuple[int, dict[str, Any]]:
        return status, {"error": {"code": code, "message": message, "remedy": remedy}}

    if method == "GET" and path == "/packs":
        return 200, {"packs": [p.to_dict() for p in runtime.packs().values()]}
    if method == "GET" and path == "/health":
        return 200, {"ok": True, **describe(runtime)}
    if method == "POST" and path == "/infer":
        try:
            req = json.loads(body or b"{}")
            if not isinstance(req, dict):
                raise ValueError("not an object")
        except ValueError:
            return err(400, "bad_request", "Body is not a JSON object.", "Send application/json.")
        try:
            return 200, runtime.infer(str(req.get("adapter", "")), str(req.get("task", "")),
                                      {k: v for k, v in req.items() if k not in ("adapter", "task")})
        except SatQueryError as exc:
            return exc.status, exc.payload()
        except Exception as exc:                                  # noqa: BLE001
            # Answered, not dropped: a closed connection reads as "unreachable".
            return err(500, "runtime_error", f"The model runtime failed ({type(exc).__name__}).",
                       "The classical path still serves this query.")
    return err(404, "not_found", path, "GET /packs, GET /health or POST /infer")


def serve_runtime(host: str = "127.0.0.1", port: int = 8100,
                  directory: str | Path = "adapters", quiet: bool = False):
    """Serve an InProcessRuntime over HTTP — the venue transport's other end.

    Stdlib only, loopback by default, so it runs on the venue laptop with no
    extra install. The routes are `handle()`'s. Returns the server; call
    `serve_forever()` on it, or run it in a thread for tests.
    """
    from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer

    runtime = InProcessRuntime(directory)

    class Handler(BaseHTTPRequestHandler):
        def _send(self, status: int, body: dict[str, Any]) -> None:
            data = json.dumps(body).encode("utf-8")
            self.send_response(status)
            self.send_header("Content-Type", "application/json")
            self.send_header("Content-Length", str(len(data)))
            self.end_headers()
            self.wfile.write(data)

        def do_GET(self) -> None:                               # noqa: N802
            self._send(*handle(runtime, "GET", self.path))

        def do_POST(self) -> None:                              # noqa: N802
            raw = self.rfile.read(int(self.headers.get("Content-Length", 0)))
            self._send(*handle(runtime, "POST", self.path, raw))

        def log_message(self, fmt: str, *args: Any) -> None:
            if not quiet:
                super().log_message(fmt, *args)

    return ThreadingHTTPServer((host, port), Handler)


class FallbackRuntime:
    """A remote runtime with a local pre-computed cache behind it (NFR-05, ADP-09).

    The hosted API reaches a GPU that may be cold, down, or out of credit. When
    it does not answer, M1's pre-computed answers for known images are still
    served — labelled `precomputed`, as always — and anything else falls back
    to the classical specialist, with the trace saying why. A typed error the
    remote *did* return (a bad image, no pre-computed answer) is passed on:
    that runtime is up and has said what it means.
    """

    transport = "http+local"

    #: Remote failures that mean "no answer", not "an answer that was no".
    UNREACHABLE = ("runtime_unreachable", "runtime_error")

    def __init__(self, primary: HttpRuntime, local: InProcessRuntime) -> None:
        self.primary, self.local = primary, local

    @property
    def reachable(self) -> bool:
        return self.primary.reachable

    def packs(self) -> dict[str, AdapterPack]:
        return self.primary.packs() or self.local.packs()

    def mode(self, adapter: str) -> str | None:
        return self.primary.mode(adapter) or self.local.mode(adapter)

    def available(self, adapter: str) -> bool:
        return self.primary.available(adapter) or self.local.available(adapter)

    def questions_for(self, adapter: str, key: str) -> list[dict[str, Any]]:
        return self.local.questions_for(adapter, key)

    def not_serving_reason(self, adapter: str) -> str:
        return self.local.not_serving_reason(adapter)

    def infer(self, adapter: str, task: str, payload: dict[str, Any]) -> dict[str, Any]:
        try:
            return self.primary.infer(adapter, task, payload)
        except SatQueryError as exc:
            if exc.code not in self.UNREACHABLE or not self.local.available(adapter):
                raise
            try:
                return self.local.infer(adapter, task, payload)
            except SatQueryError as local_exc:
                raise SatQueryError(
                    local_exc.code,
                    f"The model runtime did not answer. {local_exc.message}",
                    local_exc.remedy, status=local_exc.status) from local_exc


def load_runtime(spec: str | None = None, directory: str | Path = "adapters") -> ModelRuntime:
    """Build the runtime named by `spec` or by SATQUERY_RUNTIME."""
    spec = spec or os.environ.get("SATQUERY_RUNTIME", "inproc")
    if spec.startswith("http://") or spec.startswith("https://"):
        from .adapted import timeout
        remote = HttpRuntime(spec, timeout=timeout())
        # A hosted API keeps the pre-computed answers of any pack it carries, so
        # a cold or unreachable GPU degrades to "known images only", not to nothing.
        if spec.startswith("https://") and load_packs(directory):
            return FallbackRuntime(remote, InProcessRuntime(directory))
        return remote
    return InProcessRuntime(directory)


def classical_only() -> InProcessRuntime:
    """A runtime holding no packs, for measuring the classical path.

    The evaluation and stress harnesses run synthetic scenes against ground
    truth. They measure the classical specialists, and must neither depend on
    whichever runtime the deployment configures nor pay a network round trip to
    it per pipeline — hosted, that made `/api/evaluation` three times slower.
    """
    return InProcessRuntime("/nonexistent/satquery-no-packs")


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
        "runtime_reachable": getattr(runtime, "reachable", True),
        "engine": "neural+classical" if serving else "classical",
        "serving_plan": SERVING_PLAN,
    }
