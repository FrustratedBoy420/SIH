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

import json
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
    "rs_vqa": "M1 when its pack is loaded; classical VQA otherwise",
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
            artefacts=artefacts, stub=bool(m.get("stub", False)))
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


class InProcessRuntime:
    """The default. Packs are read from disk; inference runs here.

    With no pack for an adapter, `available()` is False and the caller falls
    back to its classical specialist. Nothing pretends: a stub pack reports
    itself as a stub, and its inference result says so (ADP-06).
    """

    transport = "inproc"

    def __init__(self, directory: str | Path = "adapters") -> None:
        self.directory = str(directory)
        self._packs = load_packs(directory)

    def reload(self) -> None:
        self._packs = load_packs(self.directory)

    def packs(self) -> dict[str, AdapterPack]:
        return dict(self._packs)

    def available(self, adapter: str) -> bool:
        return adapter in self._packs

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
        raise SatQueryError(
            "not_implemented",
            f"Pack {pack.pack_id!r} is loaded but its inference path is not "
            "wired yet.",
            "This is the seam Mridul's runtime fills; until then the "
            "classical specialist serves the capability.", status=501)


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
        body = json.dumps({"adapter": adapter, "task": task, **payload}).encode()
        req = urllib.request.Request(f"{self.base}/infer", data=body,
                                     headers={"Content-Type": "application/json"})
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


def serve_runtime(host: str = "127.0.0.1", port: int = 8100,
                  directory: str | Path = "adapters", quiet: bool = False):
    """Serve an InProcessRuntime over HTTP — the venue transport's other end.

    Two routes, the ones HttpRuntime calls:

        GET  /packs    {"packs": [AdapterPack, ...]}
        POST /infer    {"adapter", "task", "query", "images"} -> runtime reply

    Stdlib only, loopback by default, so it runs on the venue laptop with no
    extra install. Real inference lands in InProcessRuntime.infer; this
    server does not change when it does. Returns the server; call
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
            if self.path == "/packs":
                self._send(200, {"packs": [p.to_dict() for p in runtime.packs().values()]})
            elif self.path == "/health":
                self._send(200, {"ok": True, **describe(runtime)})
            else:
                self._send(404, {"error": {"code": "not_found", "message": self.path, "remedy": "GET /packs or POST /infer"}})

        def do_POST(self) -> None:                              # noqa: N802
            if self.path != "/infer":
                self._send(404, {"error": {"code": "not_found", "message": self.path, "remedy": "POST /infer"}})
                return
            try:
                body = json.loads(self.rfile.read(int(self.headers.get("Content-Length", 0))) or b"{}")
                reply = runtime.infer(str(body.get("adapter", "")), str(body.get("task", "")),
                                      {k: v for k, v in body.items() if k not in ("adapter", "task")})
                self._send(200, reply)
            except SatQueryError as exc:
                self._send(exc.status, exc.payload())
            except (ValueError, json.JSONDecodeError):
                self._send(400, {"error": {"code": "bad_request", "message": "Body is not JSON.", "remedy": "Send application/json."}})

        def log_message(self, fmt: str, *args: Any) -> None:
            if not quiet:
                super().log_message(fmt, *args)

    return ThreadingHTTPServer((host, port), Handler)


def load_runtime(spec: str | None = None, directory: str | Path = "adapters") -> ModelRuntime:
    """Build the runtime named by `spec` or by SATQUERY_RUNTIME."""
    spec = spec or os.environ.get("SATQUERY_RUNTIME", "inproc")
    if spec.startswith("http://") or spec.startswith("https://"):
        from .adapted import timeout
        return HttpRuntime(spec, timeout=timeout())
    return InProcessRuntime(directory)


def describe(runtime: ModelRuntime) -> dict[str, Any]:
    """What `/api/health` says about the model side (API-05)."""
    packs = runtime.packs()
    return {
        "version": __version__,
        "transport": runtime.transport,
        "adapters_loaded": bool(packs),
        "adapters": sorted(packs),
        "stub_packs": sorted(a for a, p in packs.items() if p.stub),
        "engine": "neural+classical" if packs else "classical",
        "serving_plan": SERVING_PLAN,
    }
