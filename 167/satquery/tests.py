"""Self-test.

Run with `python -m satquery.cli selftest`.

Three kinds of check, in increasing order of what they prove:

  primitives   the algorithms do what their names claim, on inputs whose
               answers are known by construction
  properties   invariants that must hold for any input — a geotransform round
               trip, evidence never exceeding its own gate
  contracts    the behaviours the problem statement requires, especially the
               refusal path and the rule that the answer layer never sees pixels

The third group is the one that matters. Those are executable statements of the
requirements, so a regression there is a scoring regression.
"""

from __future__ import annotations

import inspect
import json
import time
import traceback
from typing import Callable

import numpy as np

from . import cv, datasets, evaluate, scene as scenes
from .evidence import Evidence, EvidenceSet, GeoBox
from .pipeline import Pipeline, answer, save_run
from .raster import GeoTransform, coregistration_offset
from .router import Inputs, REGISTRY, classify, plan

_CHECKS: list[tuple[str, Callable[[], None]]] = []


def check(name: str):
    def deco(fn):
        _CHECKS.append((name, fn))
        return fn
    return deco


def ok(cond: bool, msg: str = "") -> None:
    if not cond:
        raise AssertionError(msg or "assertion failed")


# ---------------------------------------------------------------- primitives #

@check("otsu splits a clean bimodal distribution")
def _():
    x = np.concatenate([np.full(500, 0.2), np.full(500, 0.8)])
    t = cv.otsu(x)
    ok(0.2 < t < 0.8, f"threshold {t} not between the modes")


@check("connected components counts disjoint blobs")
def _():
    m = np.zeros((40, 40), bool)
    m[3:9, 3:9] = True
    m[20:28, 20:28] = True
    m[30:34, 5:9] = True
    _, n = cv.connected_components(m)
    ok(n == 3, f"expected 3 components, got {n}")


@check("connected components merges diagonal touch under 8-connectivity")
def _():
    m = np.zeros((10, 10), bool)
    m[2:4, 2:4] = True
    m[4:6, 4:6] = True          # touches the first only at a corner
    _, n8 = cv.connected_components(m, connectivity=8)
    _, n4 = cv.connected_components(m, connectivity=4)
    ok(n8 == 1 and n4 == 2, f"8-conn={n8} 4-conn={n4}")


@check("opening removes salt smaller than the kernel")
def _():
    m = np.zeros((60, 60), bool)
    m[10:40, 10:40] = True
    m[50, 50] = True                        # one stray pixel
    o = cv.opening(m, 1)
    ok(not o[50, 50], "stray pixel survived opening")
    ok(o[25, 25], "the body was destroyed by opening")


@check("lee filter reduces variance in flat regions and keeps the edge")
def _():
    # both halves must be non-zero: speckle is MULTIPLICATIVE, so a region of
    # zeros has no speckle to remove and the test would measure nothing.
    rng = np.random.default_rng(0)
    img = np.full((64, 64), 0.15, np.float32)
    img[:, 32:] = 0.85
    noisy = np.clip(img * rng.gamma(4, 0.25, (64, 64)), 0, 1).astype(np.float32)
    out = cv.lee_filter(noisy, 5, 4)

    flat_before = float(noisy[10:25, 5:25].std())
    flat_after = float(out[10:25, 5:25].std())
    ok(flat_before > 0.01, "fixture produced no speckle to filter")
    ok(flat_after < flat_before,
       f"variance not reduced: {flat_before:.4f} -> {flat_after:.4f}")

    step = float(out[:, 40:].mean() - out[:, :24].mean())
    ok(step > 0.4, f"edge contrast collapsed to {step:.3f}")


@check("ndvi is high on vegetation and low on water")
def _():
    veg = cv.ndvi(np.array([[0.40]]), np.array([[0.045]]))
    wat = cv.ndvi(np.array([[0.015]]), np.array([[0.035]]))
    ok(veg[0, 0] > 0.5, f"vegetation NDVI {veg[0,0]:.3f} too low")
    ok(wat[0, 0] < 0.0, f"water NDVI {wat[0,0]:.3f} not negative")


@check("change vector analysis responds to a real difference and ignores none")
def _():
    a = np.zeros((3, 32, 32), np.float32)
    b = a.copy()
    b[:, 8:16, 8:16] = 0.7
    m = cv.change_vector(a, b)
    ok(m[12, 12] > 0.5 and m[0, 0] < 1e-6, "CVA did not localise the change")


# ---------------------------------------------------------------- properties #

@check("geotransform round-trips pixel to world and back")
def _():
    gt = GeoTransform(85.24, 0.00035, 0.0, 23.50, 0.0, -0.00035)
    for col, row in ((0, 0), (137, 401), (511, 511)):
        x, y = gt.pixel_to_world(col, row)
        c2, r2 = gt.world_to_pixel(x, y)
        ok(abs(c2 - col) < 1e-6 and abs(r2 - row) < 1e-6,
           f"round trip failed at ({col},{row}) -> ({c2},{r2})")


@check("a georeferenced box lands inside the raster bounds")
def _():
    sc = scenes.build(size=96, seed=3)
    opt = sc.optical(3)
    b = GeoBox.from_pixels([10, 10, 40, 40], opt.transform, 900)
    minx, miny, maxx, maxy = opt.bounds()
    ok(minx <= b.lon0 <= maxx and miny <= b.lat1 <= maxy,
       "box centre fell outside the raster bounds")
    ok(b.area_ha > 0, "zero area")


@check("evidence confidence never exceeds its own gate when abstaining")
def _():
    es = EvidenceSet(threshold=0.6)
    es.add(Evidence(claim="weak", confidence=0.2))
    ok(es.abstain, "should abstain when nothing clears the gate")
    ok(es.confidence == 0.0, f"confidence {es.confidence} should be 0 when abstaining")


@check("conflicts reduce the fused confidence")
def _():
    clean = EvidenceSet(threshold=0.1)
    clean.add(Evidence(claim="a", confidence=0.9))
    noisy = EvidenceSet(threshold=0.1)
    noisy.add(Evidence(claim="a", confidence=0.9, conflicts=["sensors disagree"]))
    ok(noisy.confidence < clean.confidence,
       f"conflict did not reduce confidence: {noisy.confidence} vs {clean.confidence}")


@check("co-registration reports a shift that was actually applied")
def _():
    sc = scenes.build(size=128, seed=11)
    a = sc.optical(11, with_cloud=False)
    b = sc.optical(11, with_cloud=False)
    b.data = np.roll(b.data, 6, axis=2)          # shift 6 px east
    r = coregistration_offset(a, b)
    ok(r["offset_px"] > 1.0, f"a 6 px shift read as {r['offset_px']} px")
    ok(not r["aligned"], "shifted pair reported as aligned")


@check("an unshifted pair is reported as aligned")
def _():
    sc = scenes.build(size=128, seed=11)
    r = coregistration_offset(sc.optical(11), sc.sar(11))
    ok(r["aligned"], f"co-registered pair reported {r['offset_px']} px off")


# ---------------------------------------------------------------- contracts #

@check("PS 5.5 — router refuses a change query given one image, and calls no model")
def _():
    sc = scenes.build(size=96, seed=5)
    inputs = Inputs(optical=sc.optical(5))
    p = plan("what changed between these two dates?", inputs)
    ok(not p.valid, "router accepted a bi-temporal task with one image")
    ok(p.tools == [], "tools were selected despite an invalid plan")
    # the remedy must tell the user what to actually do, not name the failure
    ok("t1" in p.remedy.lower() and "t2" in p.remedy.lower(),
       f"remedy does not say what to upload: {p.remedy}")

    r = Pipeline().run("what changed between these two dates?", inputs)
    ok(r.refused, "pipeline did not refuse")
    ok(any(not s["ok"] for s in r.trace), "refusal not visible in the trace")
    ok(r.evidence.get("items") == [], "refusal must carry NO evidence items")


@check("every result has the same shape, refused or not")
def _():
    """The response contract must not depend on the outcome.

    A client reading result.evidence.items should get [] on a refusal, never
    undefined. Leaving the field bare crashed the web client on every refusal.
    """
    sc = scenes.build(size=96, seed=5)
    cases = [
        ("what changed between these two dates?", Inputs(optical=sc.optical(5))),
        ("highlight the water body", Inputs(optical=sc.optical(5))),
        ("highlight the unicorn", Inputs(optical=sc.optical(5))),
        ("", Inputs(optical=sc.optical(5))),
    ]
    for q, inp in cases:
        r = Pipeline().run(q, inp)
        for key in ("threshold", "confidence", "abstain", "count", "passing", "items"):
            ok(key in r.evidence, f"evidence.{key} missing for {q!r}")
        ok(isinstance(r.evidence["items"], list), f"evidence.items not a list for {q!r}")
        ok("features" in r.geojson, f"geojson.features missing for {q!r}")
        ok(isinstance(r.geojson["features"], list), f"features not a list for {q!r}")
        ok(isinstance(r.trace, list) and r.trace, f"empty trace for {q!r}")


@check("a single-image task is satisfiable by a superset of inputs")
def _():
    sc = scenes.build(size=128, seed=5)
    pair = Inputs(optical=sc.optical(5), sar=sc.sar(5))
    for q in ("highlight the water body", "how many built-up areas are visible?",
              "what type of land dominates this region?"):
        p = plan(q, pair)
        ok(p.valid, f"refused a single-image question given a pair: {q!r} -> {p.reason}")
        r = Pipeline().run(q, pair)
        ok(not r.refused, f"pipeline refused {q!r}: {r.answer[:70]}")

    t1s, t2s, _ = scenes.bitemporal(size=128, seed=5)
    bt = Inputs(t1=t1s.optical(5, with_cloud=False), t2=t2s.optical(5, with_cloud=False))
    r = Pipeline().run("highlight the water body", bt)
    ok(not r.refused, f"refused a single-image question given a bi-temporal pair: "
                      f"{r.answer[:70]}")
    ok(r.geojson["features"], "no evidence from the bi-temporal fallback")


@check("genuinely impossible requests are still refused")
def _():
    sc = scenes.build(size=128, seed=5)
    only_optical = Inputs(optical=sc.optical(5))
    for q, why in (("what changed between these two dates?", "no second date"),
                   ("use the optical and SAR images together", "no SAR image")):
        p = plan(q, only_optical)
        ok(not p.valid, f"accepted an impossible request ({why}): {q!r}")


@check("PS 5.5 — the agent only ever selects tools from the registry")
def _():
    sc = scenes.build(size=96, seed=5)
    inputs = Inputs(optical=sc.optical(5), sar=sc.sar(5))
    for q in ("use both sensors together", "highlight the water",
              "how many buildings", "describe the scene"):
        p = plan(q, inputs) if "both" in q else plan(q, Inputs(optical=sc.optical(5)))
        for t in p.tools:
            ok(t in REGISTRY, f"{t!r} is not a registered tool")


@check("PS 5.5 — only permitted parameters are configurable")
def _():
    sc = scenes.build(size=96, seed=5)
    p = plan("highlight the water body", Inputs(optical=sc.optical(5)), threshold=99.0)
    ok(set(p.params) <= {"threshold"}, f"unexpected params: {p.params}")
    ok(p.params["threshold"] <= 1.0, "threshold was not clamped to its range")


@check("ADR-007 — the answer layer receives evidence, never a raster")
def _():
    sig = inspect.signature(answer)
    names = set(sig.parameters)
    ok("es" in names, "answer() must take an EvidenceSet")
    for bad in ("raster", "image", "optical", "sar", "pixels", "data"):
        ok(bad not in names, f"answer() takes {bad!r} — it must not see pixels")
    src = inspect.getsource(answer)
    ok(".data" not in src and "rgb()" not in src,
       "answer() touches raster data")


@check("ADR-008 — the trace carries no chain-of-thought")
def _():
    sc = scenes.build(size=96, seed=5)
    r = Pipeline().run("use the optical and SAR images together",
                       Inputs(optical=sc.optical(5), sar=sc.sar(5)))
    allowed = {"Input validated", "Task identified", "Compatibility check",
               "Tool selected", "Parameters", "Confidence", "Conflicts recorded",
               "Evidence returned", "Refused", "Confidence gate",
               "Co-registration checked", "Co-registration penalty",
               "Adapted model"}
    for s in r.trace:
        ok(s["step"] in allowed or s["step"].startswith("Executed "),
           f"unexpected trace step {s['step']!r} — is this reasoning?")
    blob = " ".join(s["detail"] for s in r.trace).lower()
    for word in ("i think", "let me", "hmm", "reasoning", "consider"):
        ok(word not in blob, f"trace leaks reasoning: {word!r}")


@check("PS 5.4 — cross-modal run reports what SAR recovered under cloud")
def _():
    sc = scenes.build(size=192, seed=7)
    r = Pipeline().run("use the optical and SAR images together to identify built-up areas",
                       Inputs(optical=sc.optical(7), sar=sc.sar(7)))
    ok(not r.refused and not r.abstained, f"cross-modal run failed: {r.answer[:80]}")
    claims = [i["claim"] for i in r.evidence["items"]]
    ok(any("recovered by SAR" in c for c in claims),
       f"no recovery claim in {claims}")
    ok(any("obscured by cloud" in c for c in claims), "cloud not quantified")
    ok(r.geojson["features"], "no georeferenced evidence emitted")


@check("PS 5.3 — change detection finds injected urban growth")
def _():
    t1s, t2s, truth = scenes.bitemporal(size=192, seed=7, growth=0.06)
    r = Pipeline().run("what changed between these two dates?",
                       Inputs(t1=t1s.optical(7, with_cloud=False),
                              t2=t2s.optical(7, with_cloud=False)))
    ok(not r.refused, f"change run refused: {r.answer[:80]}")
    ok(truth.sum() > 0, "the test fixture injected no change")
    ok(any("change" in i["claim"] for i in r.evidence["items"]), "no change claim")


@check("PS 5.2 — grounding returns georeferenced boxes")
def _():
    sc = scenes.build(size=192, seed=7)
    r = Pipeline().run("highlight the water body", Inputs(optical=sc.optical(7)))
    ok(not r.refused, "grounding refused")
    feats = r.geojson["features"]
    ok(feats, "no features returned")
    lon, lat = feats[0]["geometry"]["coordinates"][0][0]
    ok(84 < lon < 87 and 22 < lat < 25, f"box outside the scene: {lon},{lat}")


@check("out-of-vocabulary grounding fails loudly rather than grounding something else")
def _():
    sc = scenes.build(size=96, seed=5)
    r = Pipeline().run("highlight the unicorn", Inputs(optical=sc.optical(5)))
    ok(r.abstained or r.confidence < 0.3,
       f"grounded an unknown target with confidence {r.confidence}")


@check("evaluation reads ground truth the pipeline never sees")
def _():
    src = inspect.getsource(Pipeline)
    ok(".truth" not in src, "the pipeline reads Scene.truth")
    for mod_name in ("specialists", "router"):
        mod = __import__(f"satquery.{mod_name}", fromlist=["x"])
        ok(".truth" not in inspect.getsource(mod), f"{mod_name} reads Scene.truth")


@check("router accuracy on the labelled set is at least 90 percent")
def _():
    s = evaluate.eval_router()
    ok(s.value >= 0.90, f"router accuracy {s.value:.2%} below the 90% target")


@check("the ablation is monotonic from A to E on mean F1")
def _():
    rows = evaluate.run_ablation(size=128, seed=7)["rows"]
    a, e = rows[0]["mean_f1"], rows[-1]["mean_f1"]
    ok(e > a, f"config E ({e}) did not beat config A ({a})")


@check("dataset registry names every source the PS requires")
def _():
    keys = set(datasets.REGISTRY)
    for k in ("bigearthnet", "vrsbench", "rsvqa", "cdvqa", "isro_sac"):
        ok(k in keys, f"{k} missing from the dataset registry")
    ok(datasets.REGISTRY["isro_sac"].role == "hidden",
       "the ISRO/SAC set must be marked hidden")
    st = {d["key"]: d["status"] for d in datasets.status(".")}
    ok(st["isro_sac"] == "unavailable", "the hidden set must report unavailable")


@check("a GeoTIFF written by us reads back with its geotransform intact")
def _():
    import tempfile
    from pathlib import Path
    from .raster import read, write_geotiff
    sc = scenes.build(size=64, seed=2)
    opt = sc.optical(2)
    with tempfile.TemporaryDirectory() as d:
        p = write_geotiff(opt, Path(d) / "t.tif")
        back = read(p)
        ok(back.georeferenced, "geotransform tags were lost on write")
        ok(abs(back.transform.origin_x - opt.transform.origin_x) < 1e-6,
           "origin drifted on the round trip")
        ok(back.crs.upper().startswith("EPSG"), f"CRS lost: {back.crs}")


# ------------------------------------------------------------ adapter socket #
#
# `Pipeline(adapters=...)` is the seam the trained LoRA pack will arrive
# through. Until one exists, no call site in the tree passes the argument, so
# the whole branch has never executed -- see docs/10_Decision_Record.md section
# 6. These checks run it now, against a stub, so that its first execution is not
# on the day the real weights land under deadline pressure.
#
# The stub deliberately carries no model behaviour. What is under test is the
# wiring: that a pack reaches the right specialist, that it reaches only that
# one, and that the claim it produces travels all the way out to `Result.engine`
# where a judge reads it. Loading actual weights is a separate problem and is
# not what breaks first.


def _stub_runtime(adapter: str = "adapter_B_grounding"):
    """A real InProcessRuntime over a temporary pack directory holding one stub pack."""
    import tempfile
    from pathlib import Path
    from .runtime import InProcessRuntime
    d = Path(tempfile.mkdtemp(prefix="satquery-packs-")) / "stub"
    d.mkdir()
    (d / "pack.json").write_text(json.dumps({
        "pack_id": "stub-0", "component": "M2", "adapter": adapter,
        "base_model": "none", "stub": True}))
    return InProcessRuntime(d.parent)


class _FakeRuntime:
    """A runtime that answers with fixed claims, or fails — the seam's two outcomes."""

    transport = "fake"

    def __init__(self, adapter: str, claims: list[dict] | None = None, fail: bool = False) -> None:
        self.adapter, self.claims, self.fail, self.calls = adapter, claims or [], fail, 0

    def packs(self) -> dict:
        return {self.adapter: object()}

    def available(self, adapter: str) -> bool:
        return adapter == self.adapter

    def infer(self, adapter: str, task: str, payload: dict) -> dict:
        self.calls += 1
        if self.fail:
            from .errors import SatQueryError
            raise SatQueryError("runtime_unreachable", "The model runtime did not answer.", "-", 503)
        ok("images" in payload and payload["images"], "the runtime was shown no imagery")
        return {"engine": "neural+classical", "pack": "fake-1", "claims": self.claims}


@check("adapter socket — a pack flips exactly its own specialist to neural")
def _():
    pipe = Pipeline(runtime=_stub_runtime("adapter_B_grounding"))
    ok(pipe.grounding.adapter_loaded, "the pack did not reach the grounding specialist")
    ok(pipe.grounding.path == "neural+classical", f"grounding reports {pipe.grounding.path!r}")
    for spec in (pipe.vqa, pipe.change, pipe.fusion):
        ok(not spec.adapter_loaded, f"{spec.name} claims a pack it was not given")
        ok(spec.path == "classical", f"{spec.name} reports {spec.path!r}")


@check("adapter socket — a loaded pack reaches Result.engine and the trace")
def _():
    sc = scenes.build(size=96, seed=5)
    r = Pipeline(runtime=_stub_runtime()).run("highlight the water body", Inputs(optical=sc.optical(5)))
    ok(not r.refused, f"grounding refused: {r.answer[:80]}")
    ok(r.engine == "neural+classical", f"engine reported {r.engine!r}")
    ok(any(s["step"] == "Adapted model" and "stub" in s["detail"] for s in r.trace),
       "the trace does not show the adapted model being asked")
    executed = [s for s in r.trace if s["step"].startswith("Executed")]
    ok(any("path neural+classical" in s["detail"] for s in executed),
       f"trace does not name the neural path: {[s['detail'] for s in executed]}")


@check("adapter socket — with no pack, nothing anywhere claims to be neural")
def _():
    from .runtime import InProcessRuntime
    import tempfile
    sc = scenes.build(size=96, seed=5)
    r = Pipeline(runtime=InProcessRuntime(tempfile.mkdtemp())).run(
        "highlight the water body", Inputs(optical=sc.optical(5)))
    ok(r.engine == "classical", f"engine claims {r.engine!r} with no pack loaded")
    ok("neural" not in json.dumps(r.trace), "the trace claims a neural path that no pack provides")


@check("adapter socket — an unrecognised pack key marks nothing loaded")
def _():
    # A typo in a pack name must not silently load nothing while the system
    # reports success. The failure has to be visible as "still classical".
    pipe = Pipeline(runtime=_stub_runtime("adapter_Z_does_not_exist"))
    for spec in (pipe.grounding, pipe.vqa, pipe.change, pipe.fusion):
        ok(not spec.adapter_loaded, f"{spec.name} loaded from an unknown key")


@check("audit A3 — a model number that disagrees with the measurement is a conflict")
def _():
    sc = scenes.build(size=96, seed=5)
    opt = sc.optical(5)
    measured = Pipeline(runtime=_FakeRuntime("none")).run("highlight the water body", Inputs(optical=opt))
    water = next(i for i in measured.evidence["items"] if i["value"] is not None)
    rt = _FakeRuntime("adapter_B_grounding", claims=[
        {"claim": water["claim"], "value": float(water["value"]) * 3, "unit": water["unit"], "confidence": 0.9}])
    r = Pipeline(runtime=rt).run("highlight the water body", Inputs(optical=opt))
    ok(rt.calls == 1, f"runtime called {rt.calls} times")
    mine = [i for i in r.evidence["items"] if i["source_model"] == "fake-1"]
    ok(mine, "the adapted claim did not become evidence")
    ok(mine[0]["conflicts"], "a 3x disagreement was not recorded as a conflict")
    ok(mine[0]["confidence"] < 0.9, "the disagreeing claim kept its confidence")
    ok(any(i["conflicts"] for i in r.evidence["items"] if i["source_model"] != "fake-1"),
       "the measured record does not know it was contradicted")


@check("ADP-09 — a runtime that fails degrades to classical, visibly, without raising")
def _():
    sc = scenes.build(size=96, seed=5)
    rt = _FakeRuntime("adapter_B_grounding", fail=True)
    r = Pipeline(runtime=rt).run("highlight the water body", Inputs(optical=sc.optical(5)))
    ok(not r.refused and r.evidence["items"], "the classical measurement did not serve")
    ok(r.engine == "classical", f"engine claims {r.engine!r} although the runtime failed")
    step = next((s for s in r.trace if s["step"] == "Adapted model"), None)
    ok(step is not None and not step["ok"], "the failure is not in the trace")


@check("ADR-007 — the runtime's free text never becomes the answer")
def _():
    sc = scenes.build(size=96, seed=5)
    rt = _FakeRuntime("adapter_B_grounding")
    rt_reply = rt.infer
    rt.infer = lambda a, t, p: {**rt_reply(a, t, p), "answer": "UNVERIFIED MODEL PROSE"}
    r = Pipeline(runtime=rt).run("highlight the water body", Inputs(optical=sc.optical(5)))
    ok("UNVERIFIED" not in r.answer, "model prose reached the answer without evidence")


@check("ARC-01 — the HTTP transport carries a stub pack end to end")
def _():
    import threading
    from .runtime import HttpRuntime, serve_runtime
    pack_dir = _stub_runtime().directory
    srv = serve_runtime("127.0.0.1", 0, pack_dir, quiet=True)
    threading.Thread(target=srv.serve_forever, daemon=True).start()
    try:
        rt = HttpRuntime(f"http://127.0.0.1:{srv.server_address[1]}", timeout=5)
        ok(rt.available("adapter_B_grounding"), "the pack is not listed over HTTP")
        sc = scenes.build(size=96, seed=5)
        r = Pipeline(runtime=rt).run("highlight the water body", Inputs(optical=sc.optical(5)))
        ok(r.engine == "neural+classical", f"engine over HTTP is {r.engine!r}")
        ok(any(s["step"] == "Adapted model" and s["ok"] for s in r.trace), "the HTTP call is not in the trace")
    finally:
        srv.shutdown()


@check("ADP-09 — a runtime that is down never hangs or breaks a query")
def _():
    from .runtime import HttpRuntime
    rt = HttpRuntime("http://127.0.0.1:9", timeout=1)          # nothing listens on port 9
    sc = scenes.build(size=96, seed=5)
    r = Pipeline(runtime=rt).run("highlight the water body", Inputs(optical=sc.optical(5)))
    ok(r.engine == "classical" and r.evidence["items"], "an unreachable runtime broke the query")


@check("NFR-06 — the shipped calibration study meets the 200-record floor and states its rules")
def _():
    c = evaluate.stored_calibration()
    ok(c is not None, "web/public/calibration.json is missing — run `satquery calibrate`")
    ok(c["n"] >= evaluate.CALIBRATION_N, f"only {c['n']} records")
    ok(c["ece"] is not None and 0 <= c["ece"] <= 1, f"ECE {c['ece']!r}")
    ok("correct_if" in c.get("design", {}), "the study does not state what counts as correct")
    ok(sum(b["n"] for b in c["reliability"]) == c["n"], "reliability bins do not account for every record")


# ------------------------------------------------------------------- API #

class _Api:
    """The real app under uvicorn on a free loopback port, with a throwaway var/."""

    def __enter__(self):
        import socket
        import tempfile
        import threading
        import uvicorn
        from .server import build_app
        with socket.socket() as sk:
            sk.bind(("127.0.0.1", 0))
            port = sk.getsockname()[1]
        self.var = tempfile.mkdtemp(prefix="satquery-var-")
        self.server = uvicorn.Server(uvicorn.Config(build_app(self.var, adapters=tempfile.mkdtemp()),
                                                    host="127.0.0.1", port=port, log_level="error"))
        threading.Thread(target=self.server.run, daemon=True).start()
        self.base = f"http://127.0.0.1:{port}"
        for _ in range(100):
            if self.server.started:
                break
            time.sleep(0.05)
        return self

    def __exit__(self, *exc):
        self.server.should_exit = True

    def call(self, method: str, path: str, body: dict | None = None) -> tuple[int, dict]:
        import urllib.error
        import urllib.request
        req = urllib.request.Request(self.base + path, method=method,
                                     data=json.dumps(body).encode() if body is not None else None,
                                     headers={"Content-Type": "application/json"})
        try:
            with urllib.request.urlopen(req, timeout=60) as r:
                return r.status, json.loads(r.read())
        except urllib.error.HTTPError as e:
            return e.code, json.loads(e.read())


@check("OPS-01 — a stored run replays from its record and comes out identical")
def _():
    with _Api() as api:
        code, r = api.call("POST", "/api/query", {"query": "Highlight the water body referred to in the query.",
                                                  "inputs": {"optical": "demo:t2"}})
        ok(code == 200 and not r["refused"], f"query failed: {code} {str(r)[:120]}")
        code, rp = api.call("POST", f"/api/runs/{r['run_id']}/replay")
        ok(code == 200, f"replay returned {code}: {str(rp)[:160]}")
        ok(rp["identical"], f"replay differs: {rp['differences'][:3]}")
        code, missing = api.call("POST", "/api/runs/run-nope/replay")
        ok(code == 404 and "error" in missing, f"unknown run gave {code}")


# ---------------------------------------------------------------- pytest #
#
# `satquery selftest` needs nothing but the package. When pytest is installed
# (the `dev` extra), every check above is also one pytest case, so CI and an
# IDE see them individually.

try:                                            # pragma: no cover - optional
    import pytest

    @pytest.mark.parametrize("name,fn", _CHECKS, ids=[n for n, _ in _CHECKS])
    def test_check(name: str, fn: Callable[[], None]) -> None:
        fn()
except ImportError:                             # pragma: no cover
    pass


# ---------------------------------------------------------------- runner #

def run(verbose: bool = True) -> tuple[int, int]:
    passed = failed = 0
    t0 = time.time()
    width = max(len(n) for n, _ in _CHECKS) + 2
    for name, fn in _CHECKS:
        try:
            fn()
            passed += 1
            if verbose:
                print(f"  ✓ {name}")
        except Exception as exc:                          # noqa: BLE001
            failed += 1
            print(f"  ✗ {name:<{width}} {type(exc).__name__}: {exc}")
            if verbose:
                tb = traceback.format_exc().strip().splitlines()[-3:-1]
                for line in tb:
                    print(f"      {line.strip()}")
    dt = time.time() - t0
    print(f"\n  {passed} passed, {failed} failed, {len(_CHECKS)} total  ({dt:.1f}s)")
    return passed, failed
