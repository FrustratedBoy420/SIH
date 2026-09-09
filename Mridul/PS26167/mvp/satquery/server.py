"""HTTP API.

FastAPI when it is installed; a standard-library server when it is not. The
fallback exists because a venue machine is not guaranteed to have anything, and
a demo that cannot start is worth nothing regardless of what it would have shown.

Routes:

    GET  /api/health                    liveness, versions, engine
    GET  /api/scene                     the demo scene metadata
    GET  /api/scene/{layer}.png         optical | sar | fusion | t1 | t2
    GET  /api/datasets                  what data is staged, honestly
    GET  /api/models                    model registry and weight status
    GET  /api/registry                  the tool registry the router selects from
    GET  /api/evaluation                metrics and the A-E ablation
    POST /api/query                     run one query
    GET  /api/runs                      saved runs
    GET  /api/runs/{id}                 one run
"""

from __future__ import annotations

import io
import json
import time
from pathlib import Path
from typing import Any

import numpy as np
from PIL import Image

from . import __version__, datasets, evaluate, scene as scenes
from .pipeline import Pipeline, Result, save_run
from .router import Inputs, REGISTRY

# --------------------------------------------------------------------------- #
# scene cache — generating a 512px scene takes ~0.4 s, so do it once
# --------------------------------------------------------------------------- #

_CACHE: dict[str, Any] = {}


def scene_bundle(size: int = 512, seed: int = 7) -> dict[str, Any]:
    key = f"{size}:{seed}"
    if key in _CACHE:
        return _CACHE[key]

    sc = scenes.build(size=size, seed=seed)
    t1s, t2s, truth_mask = scenes.bitemporal(size=size, seed=seed)
    bundle = {
        "scene": sc,
        "optical": sc.optical(seed),
        "sar": sc.sar(seed),
        "t1": t1s.optical(seed, with_cloud=False),
        "t2": t2s.optical(seed, with_cloud=False),
        "truth_change": truth_mask,
    }
    _CACHE[key] = bundle
    return bundle


def _png(arr: np.ndarray) -> bytes:
    """(h, w, 3) float [0,1] -> PNG bytes."""
    img = Image.fromarray((np.clip(arr, 0, 1) * 255).astype(np.uint8), mode="RGB")
    buf = io.BytesIO()
    img.save(buf, format="PNG", optimize=True)
    return buf.getvalue()


def layer_png(layer: str, size: int = 512, seed: int = 7) -> bytes:
    """Render one layer.

    `fusion` is the only derived one: the optical scene with SAR-detected
    built-up areas overlaid, and the areas that SAR recovered from beneath
    cloud marked more strongly. That distinction is the point of the whole
    cross-modal requirement, so it is visible rather than described.
    """
    b = scene_bundle(size, seed)
    if layer in ("optical", "sar", "t1", "t2"):
        return _png(b[layer].rgb())

    if layer == "fusion":
        from . import cv
        opt, sar = b["optical"], b["sar"]
        base = opt.rgb().copy()
        vv = cv.lee_filter(sar.named("vv"), 7, 4)
        hard = cv.closing(cv.opening(vv >= cv.otsu_multi(vv, 3)[-1], 1), 1)
        cloud = cv.closing(cv.opening(cv.cloud_mask(opt.data), 1), 2)

        nir = np.array([0.77, 0.20, 0.16])      # NIR crimson — the change colour
        cyan = np.array([0.21, 0.88, 0.91])     # SAR cyan
        recovered = hard & cloud
        clear_hit = hard & ~cloud
        base[clear_hit] = base[clear_hit] * 0.42 + cyan * 0.58
        base[recovered] = base[recovered] * 0.25 + nir * 0.75
        return _png(base)

    raise KeyError(layer)


def _inputs(mode: str, size: int = 512, seed: int = 7) -> Inputs:
    b = scene_bundle(size, seed)
    if mode == "bi_temporal":
        return Inputs(t1=b["t1"], t2=b["t2"])
    if mode == "optical":
        return Inputs(optical=b["optical"])
    if mode == "sar":
        return Inputs(sar=b["sar"])
    return Inputs(optical=b["optical"], sar=b["sar"])


def _scene_payload(size: int = 512, seed: int = 7) -> dict[str, Any]:
    b = scene_bundle(size, seed)
    sc = b["scene"]
    return {
        "size": size,
        "layers": ["optical", "sar", "fusion", "t1", "t2"],
        "optical": b["optical"].summary(),
        "sar": b["sar"].summary(),
        "t1": b["t1"].summary(),
        "t2": b["t2"].summary(),
        "truth": sc.truth,
        "note": "Pixel values are generated — Cartosat-2S and RISAT imagery "
                "cannot be obtained and the ISRO/SAC evaluation set is "
                "undisclosed. The rasters are real GeoTIFFs with a correct "
                "affine geotransform, and every algorithm operating on them is "
                "a real implementation.",
    }


def run_query(query: str, mode: str = "optical_sar", threshold: float = 0.45,
              size: int = 512, seed: int = 7, save: bool = False) -> dict[str, Any]:
    r: Result = Pipeline(threshold=threshold).run(query, _inputs(mode, size, seed))
    if save:
        save_run(r)
    return r.to_dict()


try:                                                  # pragma: no cover
    from pydantic import BaseModel, Field

    class QueryRequest(BaseModel):
        """The POST /api/query body.

        Defined at MODULE level, and that placement is load-bearing.

        This file uses `from __future__ import annotations`, so every annotation
        is a string at runtime and FastAPI resolves it with
        `typing.get_type_hints()`. That call looks the name up in the *module*
        namespace. A model declared inside `build_app()` is invisible there, so
        resolution fails, FastAPI falls back to treating the parameter as a
        scalar, and every POST is rejected with
        `{"loc": ["query", "req"], "msg": "Field required"}` — which reads like
        a client bug and is not one.

        Also deliberately not named `Query`: FastAPI exports its own `Query` for
        query-string parameters, and shadowing it invites the same confusion for
        a different reason.
        """

        query: str = Field(..., min_length=1, max_length=500)
        mode: str = Field("optical_sar",
                          pattern="^(optical_sar|bi_temporal|optical|sar)$")
        threshold: float = Field(0.45, ge=0.0, le=1.0)
        save: bool = False

except ImportError:                                   # pragma: no cover
    QueryRequest = None                               # stdlib fallback path


# --------------------------------------------------------------------------- #
# FastAPI
# --------------------------------------------------------------------------- #

def build_app():                                     # pragma: no cover
    from fastapi import FastAPI, HTTPException, Response
    from fastapi.middleware.cors import CORSMiddleware

    app = FastAPI(title="SatQuery AI", version=__version__,
                  description="Agentic vision-language analysis of remote-sensing "
                              "imagery. SIH26167 (ISRO).")
    app.add_middleware(CORSMiddleware, allow_origins=["*"],
                       allow_methods=["*"], allow_headers=["*"])

    @app.get("/api/health")
    def health():
        return {"ok": True, "version": __version__,
                "engine": "classical",
                "adapters_loaded": False,
                "note": "No LoRA adapters present. Measurements are real; the "
                        "neural path activates when weights are staged."}

    @app.get("/api/scene")
    def scene():
        return _scene_payload()

    @app.get("/api/scene/{layer}.png")
    def scene_layer(layer: str):
        try:
            return Response(content=layer_png(layer), media_type="image/png",
                            headers={"Cache-Control": "public, max-age=3600"})
        except KeyError:
            raise HTTPException(404, f"unknown layer {layer!r}")

    @app.get("/api/datasets")
    def ds():
        return datasets.summary(".")

    @app.get("/api/models")
    def models():
        return {"models": datasets.models()}

    @app.get("/api/registry")
    def registry():
        return {"tools": REGISTRY,
                "note": "The router selects from this list and cannot invent a "
                        "tool. Only 'threshold' is configurable."}

    @app.get("/api/evaluation")
    def evaluation(size: int = 192):
        return evaluate.full_report(size=size)

    @app.post("/api/query")
    def query(req: QueryRequest):
        return run_query(req.query, req.mode, req.threshold, save=req.save)

    @app.get("/api/runs")
    def runs():
        root = Path("runs")
        if not root.exists():
            return {"runs": []}
        return {"runs": sorted((p.name for p in root.iterdir() if p.is_dir()),
                               reverse=True)}

    @app.get("/api/runs/{run_id}")
    def run(run_id: str):
        p = Path("runs") / run_id / "run.json"
        if not p.exists():
            raise HTTPException(404, "no such run")
        return json.loads(p.read_text(encoding="utf-8"))

    # serve the built frontend when it exists
    dist = Path(__file__).resolve().parent.parent / "web" / "dist"
    if dist.exists():
        from fastapi.staticfiles import StaticFiles
        # Starlette's StaticFiles raises *starlette's* HTTPException, which is
        # the PARENT of FastAPI's. `except fastapi.HTTPException` therefore does
        # not catch it, and the fallback below never fires. Catch the base.
        from starlette.exceptions import HTTPException as StarletteHTTPException

        class SinglePageApp(StaticFiles):
            """Static files, falling back to index.html for client-side routes.

            `StaticFiles(html=True)` serves index.html for a *directory*. A
            React Router path such as /workstation is not a directory, so a
            page refresh or a pasted link 404s -- which is exactly the moment a
            judge would try it. The router can only read the URL if the server
            hands back the shell for paths it does not recognise.

            /api is excluded deliberately. Without the guard an unknown API
            path returns the HTML shell with status 200, and the frontend
            reports "unexpected token <" instead of "no such endpoint".
            """

            async def get_response(self, path: str, scope):
                # `path` arrives OS-normalised -- on Windows StaticFiles hands
                # over "api\nope", not "api/nope", so a startswith("api/")
                # test silently never matches and every mistyped API path
                # returns the HTML shell. Test the request path from the ASGI
                # scope, which is always slash-separated.
                request_path = scope.get("path", "")
                if request_path == "/api" or request_path.startswith("/api/"):
                    raise HTTPException(404, "no such endpoint")
                try:
                    return await super().get_response(path, scope)
                except StarletteHTTPException as exc:
                    if exc.status_code != 404:
                        raise
                    return await super().get_response("index.html", scope)

        app.mount("/", SinglePageApp(directory=str(dist), html=True), name="web")

    return app


def serve(host: str = "127.0.0.1", port: int = 8000) -> None:
    try:
        import uvicorn
        app = build_app()
        print(f"\n  SatQuery {__version__}  ->  http://{host}:{port}")
        print(f"  docs                   ->  http://{host}:{port}/docs\n")
        uvicorn.run(app, host=host, port=port, log_level="warning")
    except ImportError:
        _serve_stdlib(host, port)


# --------------------------------------------------------------------------- #
# stdlib fallback
# --------------------------------------------------------------------------- #

def _serve_stdlib(host: str, port: int) -> None:          # pragma: no cover
    from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
    from urllib.parse import urlparse

    class Handler(BaseHTTPRequestHandler):
        def _send(self, obj, code=200, ctype="application/json"):
            body = obj if isinstance(obj, bytes) else json.dumps(obj).encode()
            self.send_response(code)
            self.send_header("Content-Type", ctype)
            self.send_header("Content-Length", str(len(body)))
            self.send_header("Access-Control-Allow-Origin", "*")
            self.send_header("Access-Control-Allow-Headers", "Content-Type")
            self.end_headers()
            self.wfile.write(body)

        def do_OPTIONS(self):
            self._send(b"", 204, "text/plain")

        def do_GET(self):
            path = urlparse(self.path).path
            try:
                if path == "/api/health":
                    return self._send({"ok": True, "version": __version__,
                                       "engine": "classical", "server": "stdlib"})
                if path == "/api/scene":
                    return self._send(_scene_payload())
                if path.startswith("/api/scene/") and path.endswith(".png"):
                    layer = path[len("/api/scene/"):-4]
                    return self._send(layer_png(layer), 200, "image/png")
                if path == "/api/datasets":
                    return self._send(datasets.summary("."))
                if path == "/api/models":
                    return self._send({"models": datasets.models()})
                if path == "/api/registry":
                    return self._send({"tools": REGISTRY})
                if path == "/api/evaluation":
                    return self._send(evaluate.full_report(size=192))
                self._send({"error": "not found"}, 404)
            except Exception as exc:                       # noqa: BLE001
                self._send({"error": str(exc)}, 500)

        def do_POST(self):
            if urlparse(self.path).path != "/api/query":
                return self._send({"error": "not found"}, 404)
            n = int(self.headers.get("Content-Length", 0))
            try:
                body = json.loads(self.rfile.read(n) or b"{}")
                self._send(run_query(body.get("query", ""),
                                     body.get("mode", "optical_sar"),
                                     float(body.get("threshold", 0.45))))
            except Exception as exc:                       # noqa: BLE001
                self._send({"error": str(exc)}, 500)

        def log_message(self, *a):
            pass

    print(f"\n  SatQuery {__version__} (stdlib server)  ->  http://{host}:{port}\n")
    ThreadingHTTPServer((host, port), Handler).serve_forever()
