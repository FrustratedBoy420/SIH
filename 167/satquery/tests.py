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

import contextlib
import inspect
import json
import pathlib
import tempfile
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
    # "Co-registration checked" reports a measured offset between a pair
    # (VAL-05/06) — an observation of the inputs, not a line of reasoning, so it
    # belongs on the list of steps a trace may show.
    allowed = {"Input validated", "Task identified", "Compatibility check",
               "Co-registration checked",
               "Tool selected", "Parameters", "Confidence", "Conflicts recorded",
               "Evidence returned", "Refused", "Confidence gate"}
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



@check("a quantity question gets a quantity, not a yes")
def _():
    sc = scenes.build(size=96, seed=5)
    r = Pipeline(runtime=InProcessRuntime_empty()).run(
        "How much vegetation is there?", Inputs(optical=sc.optical(5)))
    first = r.evidence["items"][0]
    ok(first["unit"] == "ha", f"answered with {first['claim']!r} = {first['value']!r}")
    ok("hectares" in r.answer, f"answer is not an area: {r.answer[:80]}")


# ------------------------------------------------------------ projections #
#
# Every demo scene is EPSG:4326, so for most of this project's life nothing
# exercised a projected CRS — and a UTM upload reported 48,948,962,480 ha for
# a 164 ha image, printed eastings as longitudes, and labelled metres EPSG:4326.
# Every check here asserts a VALUE that is physically possible, not merely that
# an answer appeared: the UI suite passed on exactly that answer.


def _utm_raster(zone: int = 44, lon: float = 79.09, lat: float = 21.15,
                size: int = 96, px: float = 10.0):
    from .raster import GeoTransform, Raster, lonlat_to_utm

    e0, n0 = lonlat_to_utm(lon, lat, zone)
    sc = scenes.build(size=size, seed=5)
    opt = sc.optical(5)
    return Raster(data=opt.data, crs=f"EPSG:326{zone}", sensor="optical",
                  band_names=opt.band_names, source="utm_test.tif",
                  transform=GeoTransform(e0, px, 0.0, n0, 0.0, -px))


@check("UTM maths matches the published and defined reference values")
def _():
    from .raster import lonlat_to_utm, utm_to_lonlat

    e, n = lonlat_to_utm(3.0, 0.0, 31)
    ok(abs(e - 500_000) < 1e-6 and abs(n) < 1e-6, f"equator on the CM gave {e}, {n}")
    # WGS84 meridian arc to 45 deg is 4,984,944.378 m; UTM scales it by 0.9996.
    _, n45 = lonlat_to_utm(3.0, 45.0, 31)
    ok(abs(n45 - 4_982_950.400) < 0.01, f"45N northing {n45:.3f}, expected 4982950.400")
    for zone, lon in ((43, 72.2), (44, 81.0), (45, 89.8)):
        for lat in (8.0, 23.35, 35.0):
            back = utm_to_lonlat(*lonlat_to_utm(lon, lat, zone), zone, True)
            ok(abs(back[0] - lon) < 1e-7 and abs(back[1] - lat) < 1e-7,
               f"round trip {lon},{lat} -> {back}")


@check("a UTM raster reports metres as metres and places as degrees")
def _():
    r = _utm_raster()
    s = r.summary()
    ok(s["crs_kind"] == "utm", f"kind {s['crs_kind']}")
    ok(abs(s["gsd_m"] - 10.0) < 1e-9, f"10 m pixels reported as {s['gsd_m']} m")
    lat, lon = s["centre"]
    ok(20.5 < lat < 21.5 and 78.8 < lon < 79.5,
       f"centre {lat},{lon} is not near the scene (21.15 N, 79.09 E)")


@check("no area can exceed the ground the image covers")
def _():
    import tempfile
    from .runtime import InProcessRuntime

    r = _utm_raster()
    footprint_ha = r.width * r.height * 100 / 10_000          # 10 m pixels
    res = Pipeline(runtime=InProcessRuntime(tempfile.mkdtemp())).run(
        "highlight the water body", Inputs(optical=r))
    ok(not res.refused, f"refused: {res.answer[:80]}")
    for item in res.evidence["items"]:
        area = item.get("mask_area_ha") or 0.0
        ok(0.0 <= area <= footprint_ha,
           f"{item['claim']!r} covers {area} ha in a {footprint_ha} ha image")
    for feat in res.geojson["features"]:
        for lon, lat in feat["geometry"]["coordinates"][0]:
            ok(-180 <= lon <= 180 and -90 <= lat <= 90,
               f"GeoJSON vertex {lon},{lat} is not a longitude/latitude")


@check("areas on a geographic raster account for latitude")
def _():
    import math
    from .raster import GeoTransform

    t = GeoTransform(85.0, 0.001, 0.0, 23.35, 0.0, -0.001)
    got = t.pixel_area_m2(0, 0)
    expect = 0.001 * 0.001 * 110_574 * 111_320 * math.cos(math.radians(23.35))
    ok(abs(got - expect) / expect < 1e-6, f"{got:.2f} m2, expected {expect:.2f}")
    ok(got < 0.001 * 0.001 * 111_320 ** 2 * 0.93,
       "pixel area ignores latitude — every area ~9 % high at 23 N")


@check("a projection that cannot be converted is not reported as a place")
def _():
    from .raster import GeoTransform, Raster

    sc = scenes.build(size=64, seed=5)
    r = Raster(data=sc.optical(5).data, crs="EPSG:3857",
               transform=GeoTransform(9_440_000.0, 10.0, 0.0, 2_670_000.0, 0.0, -10.0))
    ok(not r.georeferenced, "an unconvertible projection was treated as georeferenced")
    ok("crs_note" in r.meta, "no note saying why positions are in pixel space")


@check("a UTM GeoTIFF round-trips with its projection intact")
def _():
    import tempfile
    from pathlib import Path
    from .raster import read, write_geotiff

    r = _utm_raster()
    with tempfile.TemporaryDirectory() as d:
        back = read(write_geotiff(r, Path(d) / "utm.tif"), sensor="optical")
    ok(back.crs == "EPSG:32644", f"CRS came back as {back.crs}")
    ok(back.georeferenced and back.transform.kind == "utm", "projection lost on write")
    ok(abs(back.summary()["centre"][0] - r.summary()["centre"][0]) < 1e-6,
       "the scene moved on the round trip")



# ---------------------------------------------------------------- M1 serving #
#
# The adapted model reaches a result through the runtime (live on a GPU, or
# pre-computed for known images). No GPU here, so these checks drive the whole
# path with a pre-computed pack — the same runtime code, the same keying, the
# same evidence record a live answer produces.


@contextlib.contextmanager
def _m1_pack(rows: list[dict]):
    """A real (non-stub) M1 pack whose answers are pre-computed."""
    from .runtime import InProcessRuntime

    with tempfile.TemporaryDirectory() as d:
        folder = pathlib.Path(d) / "m1"
        folder.mkdir()
        (folder / "pack.json").write_text(json.dumps({
            "pack_id": "m1-test", "component": "M1",
            "adapter": "adapter_A_rs_general", "base_model": "test/base",
        }), encoding="utf-8")
        (folder / "precomputed.jsonl").write_text(
            "\n".join(json.dumps(r) for r in rows), encoding="utf-8")
        yield InProcessRuntime(d)


def _key_for(raster) -> str:
    from .runtime import image_key, raster_rgb_u8
    return image_key(raster_rgb_u8(raster))


@check("M1 prompt at serving time is the prompt it was trained and measured with")
def _():
    import importlib.util
    from .runtime import M1_PROMPT_SUFFIX

    cfg = pathlib.Path(__file__).resolve().parent.parent / "models" / "common" / "config.py"
    spec = importlib.util.spec_from_file_location("_m1cfg", cfg)
    mod = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(mod)
    ok(M1_PROMPT_SUFFIX == mod.SHORT_ANSWER_SUFFIX,
       "serving prompt differs from training prompt — that is a different model")


@check("M1 answers a known image, and the result says M1 ran")
def _():
    sc = scenes.build(size=96, seed=5)
    opt = sc.optical(5)
    q = "What type of area is shown in this image?"
    with _m1_pack([{"image_key": _key_for(opt), "question": q,
                    "answer": "Industrial", "confidence": 0.81}]) as rt:
        r = Pipeline(runtime=rt).run(q, Inputs(optical=opt))
    ok(r.engine == "neural+classical", f"engine {r.engine!r} after M1 answered")
    first = r.evidence["items"][0]
    ok(first["claim"] == "M1 answer" and first["value"] == "Industrial",
       f"M1 did not lead the evidence: {first['claim']!r} = {first['value']!r}")
    ok(r.answer.startswith("Industrial"), f"answer does not lead with M1: {r.answer[:60]}")
    ok(any("M1 precomputed" in s["detail"] for s in r.trace),
       "the trace does not say M1 answered from pre-computed output")
    ok(r.precomputed, "a pre-computed M1 answer was not flagged as staged (ADP-09)")


@check("a structured scene summary still says what M1 read")
def _():
    sc = scenes.build(size=96, seed=5)
    opt = sc.optical(5)
    q = "Describe the land-cover and major objects visible in this image."
    with _m1_pack([{"image_key": _key_for(opt), "question": q,
                    "answer": "Residential area near a river", "confidence": 0.8}]) as rt:
        r = Pipeline(runtime=rt).run(q, Inputs(optical=opt))
    ok(r.engine == "neural+classical", f"engine {r.engine!r}")
    ok("Residential area near a river" in r.answer,
       f"engine claims M1 ran but the answer never says what it read: {r.answer[:120]}")
    ok("Detected:" in r.answer, "the structured summary (audit B3) was lost")


@check("an image M1 has no answer for falls back to classical, and says so")
def _():
    sc = scenes.build(size=96, seed=5)
    with _m1_pack([{"image_key": "not-this-image", "question": "anything",
                    "answer": "x", "confidence": 0.9}]) as rt:
        r = Pipeline(runtime=rt).run("what type of area is shown?",
                                     Inputs(optical=sc.optical(5)))
    ok(r.engine == "classical", f"engine {r.engine!r} on a cache miss")
    ok(all(i["claim"] != "M1 answer" for i in r.evidence["items"]),
       "an M1 record appeared for an image M1 never saw")
    ok(any("M1 not used" in s["detail"] for s in r.trace),
       "the fallback is not stated in the trace")


@check("SAR is never shown to M1 as a photograph")
def _():
    sc = scenes.build(size=96, seed=5)
    sar = sc.sar(5)
    q = "is there a built-up area in this image?"
    with _m1_pack([{"image_key": _key_for(sar), "question": q,
                    "answer": "Yes", "confidence": 0.9}]) as rt:
        r = Pipeline(runtime=rt).run(q, Inputs(sar=sar))
    ok(r.engine == "classical", "M1 answered a SAR-only query")
    ok(any("SAR input" in s["detail"] for s in r.trace), "the reason is not in the trace")


@check("M1 disagreeing with a measured count is a recorded conflict, not an answer")
def _():
    sc = scenes.build(size=96, seed=5)
    opt = sc.optical(5)
    q = "How many water bodies are there?"
    with _m1_pack([{"image_key": _key_for(opt), "question": q,
                    "answer": "7", "confidence": 0.9}]) as rt:
        r = Pipeline(runtime=rt).run(q, Inputs(optical=opt))
        base = Pipeline(runtime=InProcessRuntime_empty()).run(q, Inputs(optical=opt))
    items = r.evidence["items"]
    ok(items[0]["claim"] != "M1 answer", "M1 led a count — measurement must lead counts")
    m1 = next((i for i in items if i["claim"] == "M1 answer"), None)
    ok(m1 is not None, "M1 corroboration missing")
    measured = items[0]["value"]
    if measured != 7:
        ok(m1["conflicts"], f"M1 said 7, measurement {measured}, and no conflict was recorded")
        ok(r.confidence < base.confidence,
           f"a conflict did not lower confidence: {r.confidence} vs {base.confidence}")


def InProcessRuntime_empty():
    from .runtime import InProcessRuntime
    return InProcessRuntime(tempfile.mkdtemp())


@check("an M1 answer below the confidence gate did not answer, and says so")
def _():
    sc = scenes.build(size=96, seed=5)
    opt = sc.optical(5)
    q = "What type of area is shown in this image?"
    with _m1_pack([{"image_key": _key_for(opt), "question": q,
                    "answer": "Space", "confidence": 0.24}]) as rt:
        r = Pipeline(runtime=rt).run(q, Inputs(optical=opt))
    ok(r.engine == "classical", f"engine {r.engine!r} for an answer the gate rejected")
    ok("Space" not in r.answer, f"a gated M1 answer reached the user: {r.answer[:80]}")
    ok(any("below the" in s["detail"] for s in r.trace), "the gate decision is not in the trace")
    ok(not r.precomputed, "flagged as staged though nothing staged reached the answer")


@check("when M1 contradicts a measurement, the measurement leads")
def _():
    sc = scenes.build(size=96, seed=5)
    opt = sc.optical(5)
    q = "Is there a water body in this image?"
    base = Pipeline(runtime=InProcessRuntime_empty()).run(q, Inputs(optical=opt))
    measured = base.evidence["items"][0]["value"]
    contrary = "No" if measured == "yes" else "Yes"
    with _m1_pack([{"image_key": _key_for(opt), "question": q,
                    "answer": contrary, "confidence": 0.95}]) as rt:
        r = Pipeline(runtime=rt).run(q, Inputs(optical=opt))
    ok(r.evidence["items"][0]["claim"] != "M1 answer",
       "a contradicted M1 answer led over the measurement")
    ok(r.answer.lower().startswith(measured), f"answer does not lead with the measurement: {r.answer[:60]}")
    ok("M1 said" in r.answer, "the disagreement is not shown")


@check("a classification question is not answered with a measurement")
def _():
    sc = scenes.build(size=96, seed=5)
    for q in ("Is this a rural or urban area?", "What type of area is shown in this image?"):
        r = Pipeline(runtime=InProcessRuntime_empty()).run(q, Inputs(optical=sc.optical(5)))
        ok(r.evidence["items"][0]["unit"] != "ha", f"{q!r} was answered in hectares: {r.answer[:60]}")


@check("a remote runtime is sent pixels as PNG, never a raw array")
def _():
    from .errors import SatQueryError
    from .runtime import HttpRuntime, raster_rgb_u8

    sc = scenes.build(size=32, seed=5)
    rt = HttpRuntime("http://127.0.0.1:9", timeout=0.5)       # nothing listens
    try:
        rt.infer("adapter_A_rs_general", "vqa",
                 {"question": "q", "image_key": "k", "_rgb_u8": raster_rgb_u8(sc.optical(5))})
        ok(False, "an unreachable runtime returned a result")
    except SatQueryError as exc:
        ok(exc.code == "runtime_unreachable", f"failed as {exc.code}, not unreachable")
    except TypeError as exc:
        ok(False, f"payload was not serialisable: {exc}")


# ------------------------------------------------------------ adapter socket #
#
# `Pipeline(runtime=...)` is the seam a trained LoRA pack arrives through
# (TRD §4.6, CON-03). These checks build real pack directories -- a `pack.json`
# on disk, read by `load_packs` -- so the loader, the keying by registry adapter
# name, and the claim that reaches `Result.engine` are all exercised together.
#
# Two kinds of pack. A *stub* pack serves by construction (ADP-06): it proves
# the wiring before weights exist. A *real* pack is loaded and reported, but
# serves only once an inference path can run it. The last check below exists
# because that distinction was once missing: staging the real M1 pack made
# every result claim `neural+classical` on answers the classical specialist
# produced alone.


@contextlib.contextmanager
def _runtime(*packs: tuple[str, bool]):
    """An in-process runtime over temporary packs: (adapter name, is_stub)."""
    from .runtime import InProcessRuntime

    with tempfile.TemporaryDirectory() as d:
        for i, (adapter, stub) in enumerate(packs):
            folder = pathlib.Path(d) / f"pack-{i}"
            folder.mkdir()
            (folder / "pack.json").write_text(json.dumps({
                "pack_id": f"test-{i}", "component": "M1", "adapter": adapter,
                "base_model": "test/base", "stub": stub,
            }), encoding="utf-8")
        yield InProcessRuntime(d)


@check("adapter socket — a pack flips exactly its own specialist to neural")
def _():
    with _runtime(("adapter_B_grounding", True)) as rt:
        pipe = Pipeline(runtime=rt)
    ok(pipe.grounding.adapter_loaded, "the pack did not reach the grounding specialist")
    ok(pipe.grounding.path == "neural+classical",
       f"grounding reports {pipe.grounding.path!r}")
    for spec in (pipe.vqa, pipe.change, pipe.fusion):
        ok(not spec.adapter_loaded, f"{spec.name} claims a pack it was not given")
        ok(spec.path == "classical", f"{spec.name} reports {spec.path!r}")


@check("adapter socket — a loaded pack reaches Result.engine and the trace")
def _():
    sc = scenes.build(size=96, seed=5)
    with _runtime(("adapter_B_grounding", True)) as rt:
        r = Pipeline(runtime=rt).run("highlight the water body",
                                     Inputs(optical=sc.optical(5)))
    ok(not r.refused, f"grounding refused: {r.answer[:80]}")
    ok(r.engine == "neural+classical", f"engine reported {r.engine!r}")
    executed = [s for s in r.trace if s["step"].startswith("Executed")]
    ok(executed, "no execution step in the trace")
    ok(any("path neural+classical" in s["detail"] for s in executed),
       f"trace does not name the neural path: {[s['detail'] for s in executed]}")


@check("adapter socket — with no pack, nothing anywhere claims to be neural")
def _():
    sc = scenes.build(size=96, seed=5)
    # An explicit empty runtime, so the check does not depend on whether an
    # `adapters/` directory happens to exist in the working directory.
    with _runtime() as rt:
        r = Pipeline(runtime=rt).run("highlight the water body",
                                     Inputs(optical=sc.optical(5)))
    ok(r.engine == "classical", f"engine claims {r.engine!r} with no pack loaded")
    ok("neural" not in json.dumps(r.trace),
       "the trace claims a neural path that no pack provides")


@check("adapter socket — an unrecognised pack key marks nothing loaded")
def _():
    # A typo in a pack name must not silently load nothing while the system
    # reports success. The failure has to be visible as "still classical".
    with _runtime(("adapter_Z_does_not_exist", True)) as rt:
        pipe = Pipeline(runtime=rt)
    for spec in (pipe.grounding, pipe.vqa, pipe.change, pipe.fusion):
        ok(not spec.adapter_loaded, f"{spec.name} loaded from an unknown key")


@check("adapter socket — a real pack with no inference path claims nothing")
def _():
    from .runtime import describe

    sc = scenes.build(size=96, seed=5)
    with _runtime(("adapter_A_rs_general", False)) as rt:
        health = describe(rt)
        r = Pipeline(runtime=rt).run("is there a water body in this image?",
                                     Inputs(optical=sc.optical(5)))
    ok(health["adapters"] == ["adapter_A_rs_general"],
       f"a real pack on disk was not reported as loaded: {health['adapters']}")
    ok(health["adapters_serving"] == [],
       f"a pack with no inference path is reported serving: {health['adapters_serving']}")
    ok(health["engine"] == "classical", f"health claims {health['engine']!r}")
    ok(r.engine == "classical",
       f"result claims {r.engine!r} for an answer the classical specialist produced")


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
