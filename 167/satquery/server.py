"""The HTTP API — API-01 to API-13.

One origin. The API serves the built web application from `web/dist`, so a
judge who follows the README sees the interface rather than a blank page and a
CORS error (NFR-14). There is no second base URL to configure anywhere.

Every response the frontend consumes is defined in `docs/08_TRD.md` §5.2 and
mirrored in `web/src/lib/contract.ts`; that file is the acceptance test for
this one. Two conventions it already assumes and this module honours:

    inputs: {"optical": "demo:optical"}     built-in scenes are addressed
                                            as `demo:<role>`
    /api/scenes/demo/optical.png            and their layers live here

Errors are typed and readable (API-12): `{error: {code, message, remedy}}`,
never a stack trace. An unknown `/api/*` path returns JSON 404 rather than the
HTML shell (API-10) — without that guard the frontend reports "unexpected
token <" instead of "no such endpoint", which sends a debugging session in
entirely the wrong direction.

Single implementation, deliberately. The prototype carried a standard-library
fallback server for venue machines with nothing installed; the dependency
manifest pins FastAPI now, so the fallback bought a second copy of a much
larger API surface and the drift between them was the more likely failure.
"""

# No `from __future__ import annotations` in this file, on purpose. FastAPI
# reads route annotations at runtime to decide what is a body, a form field or
# an upload; stringified annotations are resolved against the *module*
# namespace, so any type imported inside `build_app()` (UploadFile, a request
# model) silently becomes unresolvable and every request fails with "class not
# fully defined". Eager annotations make that impossible.

import io
import time
from pathlib import Path
from typing import Any

import numpy as np
from PIL import Image

from . import __version__, datasets, evaluate, report as reports, runtime as rt
from .errors import SatQueryError, not_found
from .pipeline import Pipeline, Result
from .router import Inputs, REGISTRY
from .store import ACCEPTED, MAX_BYTES, MAX_PIXELS, RasterStore, RunStore, ROLES

# --------------------------------------------------------------------------- #
# built-in scenes
# --------------------------------------------------------------------------- #

DEMO_SEED = 7          # the synthetic evaluation scene's seed (/api/evaluation)
DEMO_SIZE = 512
LAYERS = ("optical", "sar", "fusion", "t1", "t2")

# Real Sentinel imagery, baked by tools/fetch_scenes.mjs + tools/bake_scenes.py.
# The same files the browser engine fetches from /scenes/, read here through
# the same reader an upload goes through.
from .paths import dist as _dist, scenes as _scenes, web as _web
SCENES_DIR = _scenes()
_SENSOR = {"optical": "optical", "sar": "sar", "t1": "optical", "t2": "optical"}

_CACHE: dict[str, Any] = {}


def scene_bundle(size: int = DEMO_SIZE, seed: int = DEMO_SEED) -> dict[str, Any]:
    """The built-in scenes, read once from web/public/scenes/.

    `size` and `seed` are kept for the signature; the scenes are real 512 px
    Sentinel crops and are not generated.
    """
    if "real" not in _CACHE:
        import json
        from . import raster
        manifest = json.loads((SCENES_DIR / "scenes.json").read_text(encoding="utf-8"))
        bundle: dict[str, Any] = {"manifest": manifest}
        for role, sc in manifest["scenes"].items():
            r = raster.read(SCENES_DIR / sc["file"], sensor=_SENSOR[role], band_names=list(sc["bands"]))
            r.source = f"{sc['product']}.tif"
            r.acquired = sc["acquired"]
            r.meta.update({"platform": sc["platform"], "product": sc["product"], "builtin": True,
                           "attribution": sc["attribution"],
                           **({"cloud_pct": sc["cloud_pct"]} if "cloud_pct" in sc else {}),
                           **({"orbit": sc["orbit"]} if "orbit" in sc else {})})
            bundle[role] = r
        _CACHE["real"] = bundle
    return _CACHE["real"]


def _png(arr: np.ndarray) -> bytes:
    img = Image.fromarray((np.clip(arr, 0, 1) * 255).astype(np.uint8), mode="RGB")
    buf = io.BytesIO()
    img.save(buf, format="PNG", optimize=True)
    return buf.getvalue()


def layer_png(layer: str, size: int = DEMO_SIZE, seed: int = DEMO_SEED) -> bytes:
    """Render one demo layer.

    `fusion` is the only derived one: the optical scene with SAR-detected
    built-up areas overlaid, and the areas SAR recovered from beneath cloud
    marked more strongly. That distinction is the point of the cross-modal
    requirement, so it is shown rather than described.
    """
    b = scene_bundle(size, seed)
    if layer in ("optical", "sar", "t1", "t2"):
        return _png(b[layer].rgb())
    if layer == "fusion":
        from . import cv
        opt, sar = b["optical"], b["sar"]
        base = opt.rgb().copy()
        vv = cv.lee_filter(sar.named("vv"), 7, 4)
        hard = cv.closing(cv.opening(vv >= cv.otsu_multi(cv.tail_clip(vv), 3)[-1], 1), 1)
        cloud = cv.closing(cv.opening(cv.cloud_mask(opt.data, opt.meta.get("display_gain", 1.0)), 1), 2)
        crimson = np.array([0.77, 0.20, 0.16])     # recovered from under cloud
        cyan = np.array([0.21, 0.88, 0.91])        # seen by both
        recovered, clear = hard & cloud, hard & ~cloud
        base[clear] = base[clear] * 0.42 + cyan * 0.58
        base[recovered] = base[recovered] * 0.25 + crimson * 0.75
        return _png(base)
    raise not_found("layer")


# --------------------------------------------------------------------------- #
# input resolution
# --------------------------------------------------------------------------- #

def resolve_inputs(spec: dict[str, str], store: RasterStore) -> Inputs:
    """`{role: raster_id}` → rasters, uploaded and built-in through one path.

    VAL-07: a built-in scene takes exactly the same route as an upload. If the
    demo had a shortcut around validation, the demo would be the only thing
    that ever worked.
    """
    got: dict[str, Any] = {}
    for role, ident in (spec or {}).items():
        if role not in ROLES:
            raise SatQueryError("bad_role", f"{role!r} is not an input role.",
                                f"Use one of: {', '.join(ROLES)}.")
        if not ident:
            continue
        if isinstance(ident, str) and ident.startswith("demo:"):
            want = ident.split(":", 1)[1]
            bundle = scene_bundle()
            if want not in ("optical", "sar", "t1", "t2"):
                raise not_found("built-in scene layer")
            got[role] = bundle[want]
        else:
            got[role] = store.get(str(ident))
    return Inputs(optical=got.get("optical"), sar=got.get("sar"),
                  t1=got.get("t1"), t2=got.get("t2"))


# --------------------------------------------------------------------------- #
# request body
# --------------------------------------------------------------------------- #

from pydantic import BaseModel, Field  # noqa: E402


M1_ADAPTER = "adapter_A_rs_general"


def m1_questions_for(optical: str, rasters: RasterStore, runtime: Any,
                     gate: float) -> dict[str, Any]:
    """What M1 can answer for the optical input `optical` names, right now.

    `live`: anything — the model runs here. `precomputed`: exactly the questions
    on file for these pixels, each marked `withheld` if its confidence is below
    the gate (the system will not use it, and says so). Otherwise nothing, with
    the reason, so the interface never offers a question M1 will not answer.
    """
    mode = runtime.mode(M1_ADAPTER) if hasattr(runtime, "mode") else None
    if mode == "live":
        return {"mode": "live", "questions": [],
                "note": "M1 runs live here; any optical question reaches it."}
    if mode != "precomputed":
        return {"mode": mode, "questions": [],
                "note": "M1 is not serving on this machine."}
    raster = resolve_inputs({"optical": optical}, rasters).optical
    if raster is None:
        return {"mode": mode, "questions": [], "note": "No optical image."}
    key = rt.image_key(rt.raster_rgb_u8(raster))
    qs = [{"question": q["question"], "withheld": q["confidence"] < gate}
          for q in runtime.questions_for(M1_ADAPTER, key)]
    note = (f"{len(qs)} question(s) pre-computed for this image." if qs else
            "No M1 answers are on file for this image; the classical path "
            "will answer, and the trace will say why.")
    return {"mode": mode, "questions": qs, "note": note}


class QueryBody(BaseModel):
    """POST /api/query (API-02, API-11).

    Not named `Query`, which FastAPI exports for query-string parameters —
    shadowing it produces errors that read like client bugs.
    """

    query: str = Field(..., min_length=1, max_length=500)
    inputs: dict[str, str] = Field(default_factory=dict)
    threshold: float | None = Field(None, ge=0.0, le=1.0)
    save: bool = True


# --------------------------------------------------------------------------- #
# application
# --------------------------------------------------------------------------- #

def build_app(var: str | Path | None = None, adapters: str = "adapters"):
    from fastapi import Body, FastAPI, File, Form, Request, Response, UploadFile
    from fastapi.responses import JSONResponse

    root = Path(var) if var else None
    rasters = RasterStore(root / "rasters" if root else None)
    runs = RunStore(root / "runs" if root else None)
    model_runtime = rt.load_runtime(directory=adapters)
    pipeline = Pipeline(runtime=model_runtime)

    app = FastAPI(
        title="SatQuery AI", version=__version__,
        description="Agentic vision-language analysis of remote-sensing "
                    "imagery. SIH PS26167 (ISRO).")

    # -- errors, uniformly typed (API-12) -------------------------------- #
    @app.exception_handler(SatQueryError)
    async def _typed(_: Request, exc: SatQueryError):
        return JSONResponse(exc.payload(), status_code=exc.status)

    @app.exception_handler(Exception)
    async def _unexpected(_: Request, exc: Exception):
        # The trace is logged, never served. A client gets a sentence.
        import traceback
        traceback.print_exc()
        return JSONResponse(
            {"error": {"code": "internal",
                       "message": "The API failed while handling that request.",
                       "remedy": "Retry; if it persists the server log has the "
                                 "detail."}}, status_code=500)

    # -- health ----------------------------------------------------------- #
    @app.get("/api/health")
    def health() -> dict[str, Any]:
        d = rt.describe(model_runtime)
        idle = [a for a in d["adapters"] if a not in d["adapters_serving"]]
        if not d["adapters_loaded"]:
            note = ("No adapter packs staged. Every number is measured by the "
                    "classical path; the adapted path activates when a pack is "
                    "placed under adapters/.")
        else:
            note = "Adapter packs loaded: " + ", ".join(d["adapters"]) + "."
            for a in d["adapters_serving"]:
                info = d["packs"].get(a, {})
                if info.get("mode") == "precomputed":
                    # Serving from a cache is real M1 output, but only for the
                    # images and questions it was produced for. Say so, so
                    # "serving" is never read as "answers anything".
                    note += (f" {a} serves {info.get('precomputed', 0)} pre-computed "
                             "M1 answers; any other image or question falls back "
                             "to the classical specialist, and the trace says which.")
                elif info.get("mode") == "live":
                    note += f" {a} runs live on this machine's GPU."
            if idle:
                # Loaded is not serving. Saying only "loaded" beside a real
                # pack invites the reader to assume it answered the query.
                note += (" Not serving: " + ", ".join(idle) + " — no inference "
                         "path can run them here (no GPU, and no pre-computed "
                         "answers), so the classical specialist answers and "
                         "`engine` says so.")
        if d["stub_packs"]:
            note += (" Stub pack(s) present (" + ", ".join(d["stub_packs"]) +
                     ") — these exercise the loader and report no measurements.")
        return {"ok": True, "version": __version__, "engine": d["engine"],
                "adapters_loaded": d["adapters_loaded"],
                "adapters_serving": d["adapters_serving"],
                "packs": d["packs"], "note": note,
                "adapters": d["adapters"],
                "runtime_reachable": d["runtime_reachable"],
                "transport": d["transport"], "serving_plan": d["serving_plan"],
                "rasters_stored": len(rasters), "runs_stored": len(runs.ids()),
                "limits": {"max_bytes": MAX_BYTES, "max_pixels": MAX_PIXELS,
                           "accepted": list(ACCEPTED)}}

    # -- upload (API-01, ING-01/09) --------------------------------------- #
    @app.post("/api/rasters")
    async def upload(file: UploadFile = File(...), role: str = Form(...),
                     sensor: str = Form("")) -> dict[str, Any]:
        data = await file.read()
        raster_id, summary = rasters.put(data, file.filename or "upload", role, sensor)
        return {"raster_id": raster_id, "summary": summary}

    @app.get("/api/rasters/{raster_id}")
    def raster_summary(raster_id: str) -> dict[str, Any]:
        return {"raster_id": raster_id, "summary": rasters.summary(raster_id)}

    @app.get("/api/m1/questions")
    def m1_questions(optical: str) -> dict[str, Any]:
        return m1_questions_for(optical, rasters, model_runtime, pipeline.threshold)

    # -- query (API-02, API-11) ------------------------------------------- #
    @app.post("/api/query")
    def query(body: QueryBody = Body(...)) -> dict[str, Any]:
        inputs = resolve_inputs(body.inputs, rasters)
        result: Result = pipeline.run(body.query, inputs, body.threshold)
        payload = result.to_dict()
        if body.save:
            runs.save(payload, seed=DEMO_SEED,
                      request={"query": body.query, "inputs": body.inputs, "threshold": body.threshold})
        return payload

    @app.post("/api/runs/{run_id}/replay")
    def run_replay(run_id: str) -> dict[str, Any]:
        """Re-run a stored run from its request and report any difference (OPS-01/02)."""
        from .replay import replay

        def again(q: str, spec: dict[str, str], thr: float | None) -> dict[str, Any]:
            return pipeline.run(q, resolve_inputs(spec, rasters), thr).to_dict()
        return replay(runs.get(run_id), runs.request(run_id), again)

    # -- runs and exports (API-03, API-04) -------------------------------- #
    @app.get("/api/runs")
    def run_list(limit: int = 25) -> dict[str, Any]:
        return {"runs": [{"run_id": r.get("run_id"), "created": r.get("created"),
                          "query": r.get("query"), "task": r.get("task"),
                          "refused": r.get("refused"),
                          "abstained": r.get("abstained"),
                          "confidence": r.get("confidence")}
                         for r in runs.recent(limit)]}

    @app.get("/api/runs/{run_id}")
    def run_one(run_id: str) -> dict[str, Any]:
        return runs.get(run_id)

    @app.get("/api/runs/{run_id}/geojson")
    def run_geojson(run_id: str):
        body = reports.geojson_bytes(runs.get(run_id))
        return Response(
            body, media_type="application/geo+json",
            headers={"Content-Disposition":
                     f'attachment; filename="{run_id}.geojson"'})

    @app.get("/api/runs/{run_id}/report")
    def run_report(run_id: str, format: str = "html"):
        run = runs.get(run_id)
        env = runs.environment(run_id)
        if format == "pdf":
            pdf = reports.to_pdf(run, env)
            if pdf is None:
                raise SatQueryError(
                    "pdf_unavailable",
                    "PDF export needs ReportLab, which is not installed.",
                    "Download the HTML report instead — it is self-contained "
                    "and prints to PDF from any browser.", status=501)
            return Response(pdf, media_type="application/pdf",
                            headers={"Content-Disposition":
                                     f'attachment; filename="{run_id}.pdf"'})
        return Response(reports.to_html(run, env), media_type="text/html",
                        headers={"Content-Disposition":
                                 f'inline; filename="{run_id}.html"'})

    # -- transparency (API-06, API-07, API-08) ---------------------------- #
    @app.get("/api/registry")
    def registry() -> dict[str, Any]:
        return {"tools": REGISTRY,
                "note": "The router selects from this table and cannot invent "
                        "a tool. Only the listed parameters are configurable, "
                        "and they are clamped to the stated range."}

    @app.get("/api/datasets")
    def api_datasets() -> dict[str, Any]:
        return datasets.summary(".")

    @app.get("/api/models")
    def api_models() -> dict[str, Any]:
        # Rows are keyed by component (M1–M4); a pack names its component in
        # its manifest, so that is the join — not the adapter directory name.
        by_component = {p.component: p for p in model_runtime.packs().values()}
        rows = datasets.models()
        for row in rows:
            pack = by_component.get(str(row.get("id", "")))
            if pack is not None:
                # Three facts, kept apart because each was once reported as
                # another: a manifest exists (trained and measured), its
                # weights are on this machine (they are gitignored, so a fresh
                # clone has the first without the second), and something can
                # run them. Only the last may be called serving.
                has_weights = pack.stub or "adapter_model.safetensors" in pack.artefacts
                serving = model_runtime.available(pack.adapter)
                row["adapter"] = pack.adapter
                row["weights_present"] = has_weights
                row["weights_path"] = pack.path
                row["serving"] = serving
                row["mode"] = (model_runtime.mode(pack.adapter)
                               if hasattr(model_runtime, "mode") else None)
                row["status"] = ("serving" if serving
                                 else "loaded" if has_weights else "trained")
                row["pack"] = pack.to_dict()
        return {"models": rows}

    @app.get("/api/evaluation")
    def api_evaluation(size: int = 192) -> dict[str, Any]:
        return evaluate.contract_report(size=size, seed=DEMO_SEED, source="api")

    # -- demo layers (API-09) --------------------------------------------- #
    @app.get("/api/scenes")
    def scene_list() -> dict[str, Any]:
        b = scene_bundle()
        return {"scenes": [{
            "id": "demo", "layers": list(LAYERS), "size": DEMO_SIZE,
            "rasters": {r: b[r].summary() for r in ("optical", "sar", "t1", "t2")},
            "note": "Real Sentinel-2 L2A and Sentinel-1 RTC crops over west "
                    "Hyderabad (EPSG:32644, 10 m). No ground truth exists for "
                    "them; measured accuracy comes from the synthetic scene "
                    "at /api/evaluation. " + b["manifest"]["scenes"]["optical"]["attribution"],
        }]}

    @app.get("/api/scenes/{scene_id}/{layer}.png")
    def scene_layer(scene_id: str, layer: str):
        if scene_id != "demo":
            raise not_found("scene")
        return Response(layer_png(layer), media_type="image/png",
                        headers={"Cache-Control": "public, max-age=3600"})

    # -- unknown /api paths are JSON, never the shell (API-10) ------------ #
    @app.api_route("/api/{rest:path}",
                   methods=["GET", "POST", "PUT", "DELETE", "PATCH"])
    def api_404(rest: str):
        raise SatQueryError("no_such_endpoint", f"/api/{rest} is not an endpoint.",
                            "See /docs for the API surface.", status=404)

    _mount_web(app)
    return app


def _mount_web(app) -> None:
    """Serve the built frontend from the same origin (NFR-14)."""
    dist = _dist()
    if not (dist / "index.html").exists():
        # A clean clone has no build. Say so at "/" instead of a blank page or
        # a JSON 404 — the first thing a judge following the README opens.
        from fastapi.responses import HTMLResponse

        @app.get("/", include_in_schema=False)
        def unbuilt() -> HTMLResponse:
            return HTMLResponse(UNBUILT_PAGE, status_code=503)
        return

    from fastapi.staticfiles import StaticFiles
    # Starlette's HTTPException is the PARENT of FastAPI's, so catching the
    # FastAPI one here silently never fires and a refresh on a client-side
    # route 404s — the exact moment a judge would try it.
    from starlette.exceptions import HTTPException as StarletteHTTPException

    class SinglePageApp(StaticFiles):
        """Static files, falling back to index.html for client-side routes."""

        async def get_response(self, path: str, scope):
            try:
                return await super().get_response(path, scope)
            except StarletteHTTPException as exc:
                if exc.status_code != 404:
                    raise
                return await super().get_response("index.html", scope)

    app.mount("/", SinglePageApp(directory=str(dist), html=True), name="web")


UNBUILT_PAGE = """<!doctype html><meta charset="utf-8"><title>SatQuery — interface not built</title>
<body style="font:16px/1.55 system-ui,sans-serif;max-width:640px;margin:10vh auto;padding:0 20px;color:#0e2129;background:#efeeec">
<h1 style="font-family:Georgia,serif">The API is running; the interface is not built yet</h1>
<p>This checkout has no <code>web/dist</code>. Build it once (needs Node 20+), then reload:</p>
<pre style="background:#f8f7f5;border:1px solid #0e2129;padding:12px">satquery serve --build</pre>
<p>or by hand: <code>cd web &amp;&amp; npm ci &amp;&amp; npm run build</code>. With Docker instead: <code>docker compose up</code>.</p>
<p>The API itself is live: <a href="/api/health">/api/health</a> · <a href="/docs">/docs</a></p>
</body>"""


def build_web(force: bool = False) -> bool:
    """Build web/dist with npm if it is missing (or `force`). True if a build exists after."""
    import shutil
    import subprocess
    web = _web()
    if (web / "dist" / "index.html").exists() and not force:
        return True
    npm = shutil.which("npm")
    if npm is None:
        print("  npm not found — install Node 20+ to build the interface, or use `docker compose up`.")
        return False
    install = ["ci"] if (web / "package-lock.json").exists() else ["install"]
    for step in (install, ["run", "build"]):
        print(f"  web/: npm {' '.join(step)}")
        if subprocess.run([npm, *step], cwd=web).returncode != 0:
            print(f"  npm {' '.join(step)} failed; the API will still start.")
            return False
    return (web / "dist" / "index.html").exists()


def serve(host: str = "127.0.0.1", port: int = 8000,
          var: str | None = None, adapters: str = "adapters", build: bool = False) -> None:
    import uvicorn
    if build:
        build_web()
    app = build_app(var=var, adapters=adapters)
    dist = _dist()
    print(f"\n  SatQuery {__version__}  ->  http://{host}:{port}")
    print(f"  API docs               ->  http://{host}:{port}/docs")
    print("  web/dist               ->  " +
          ("served from this origin" if dist.exists()
           else "not built — `satquery serve --build`, or `cd web && npm ci && npm run build`"))
    print()
    uvicorn.run(app, host=host, port=port, log_level="warning")
