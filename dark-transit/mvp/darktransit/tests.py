"""Acceptance criteria, executable (PRD 19).

`python3 -m darktransit.cli selftest` runs these. They are the criteria from
the PRD, not a proxy for them -- in particular the dual-use safeguards of PRD 16
are enforced here rather than asserted in prose.
"""

from __future__ import annotations

import json
import re
from pathlib import Path

import math

import numpy as np

from . import drift, forcing, geo, incident, pipeline, png, raster

WEB = Path(__file__).resolve().parent.parent / "web"

_results = []


def check(name, ok, detail=""):
    _results.append((name, bool(ok), detail))
    print(f"  {'PASS' if ok else 'FAIL'}  {name}" + (f"  -- {detail}" if detail else ""))
    return ok


def primitives():
    """Layer-0 checks and properties.

    These live here because the geometry is where a silent numerical defect
    would hide, and because two of them are regressions: the rectangle
    perimeter caught a contour tracer that oscillated between two pixels, and
    the focal-sum property caught a degenerate reachable-set ellipse.
    """
    print("Layer 0 -- primitives and properties\n")
    rng = np.random.default_rng(20260908)

    # tangent plane round trip
    tp = geo.TangentPlane(22.55, 69.41)
    lon = 69.41 + rng.uniform(-0.4, 0.4, 500)
    lat = 22.55 + rng.uniform(-0.4, 0.4, 500)
    x, y = tp.to_xy(lon, lat)
    blon, blat = tp.to_lonlat(x, y)
    check("geo   tangent plane round-trips to under a millimetre",
          float(np.max(np.abs(blon - lon))) < 1e-9 and float(np.max(np.abs(blat - lat))) < 1e-9)

    # shoelace area and perimeter against a known square
    sq = np.array([[0, 0], [1000, 0], [1000, 1000], [0, 1000]], dtype=float)
    check("geo   shoelace area of a 1 km square is 1e6 m2",
          abs(geo.polygon_area_m2(sq) - 1e6) < 1e-6)
    check("geo   perimeter of a 1 km square is 4 km",
          abs(geo.polygon_perimeter_m(sq) - 4000.0) < 1e-6)

    # property: point-in-polygon agrees with the shoelace area by Monte Carlo
    ang = np.sort(rng.uniform(0, 2 * math.pi, 9))
    rad = rng.uniform(400, 1000, 9)
    poly = np.stack([rad * np.cos(ang), rad * np.sin(ang)], axis=1)
    pts = rng.uniform(-1000, 1000, (60000, 2))
    mc = geo.points_in_polygon(pts, poly).mean() * (2000.0 ** 2)
    exact = geo.polygon_area_m2(poly)
    check("geo   point-in-polygon agrees with shoelace area (Monte Carlo, 60k pts)",
          abs(mc - exact) / exact < 0.03, f"{mc:.0f} vs {exact:.0f} m2")

    # property: every ellipse vertex satisfies the focal-sum definition
    f1, f2, ssum = np.array([0.0, 0.0]), np.array([9000.0, 3000.0]), 20000.0
    ring = geo.ellipse_from_foci(f1, f2, ssum)
    d = (np.linalg.norm(ring - f1, axis=1) + np.linalg.norm(ring - f2, axis=1))
    check("geo   reachable-set ellipse satisfies |q-f1| + |q-f2| = sum",
          float(np.max(np.abs(d - ssum))) < 1e-6, f"max deviation {np.max(np.abs(d - ssum)):.2e} m")
    a = ssum / 2
    c = float(np.linalg.norm(f2 - f1) / 2)
    check("geo   ellipse area matches pi*a*b",
          abs(geo.polygon_area_m2(ring) - math.pi * a * math.sqrt(a * a - c * c))
          / (math.pi * a * math.sqrt(a * a - c * c)) < 0.002)
    degen = geo.ellipse_from_foci([0, 0], [10000, 0], 5000.0)
    check("geo   an unreachable gap returns a degenerate ring, not an exception",
          len(degen) == 3)

    # overlap fraction bounds
    check("geo   overlap of a region with itself is 1",
          abs(geo.overlap_fraction(sq, sq) - 1.0) < 1e-9)
    far = sq + np.array([50000.0, 0.0])
    check("geo   overlap of disjoint polygons is 0", geo.overlap_fraction(sq, far) == 0.0)

    # angle folding
    check("geo   axis delta folds onto [0, 90]",
          geo.axis_delta_deg(47, 41) == 6.0 and geo.axis_delta_deg(268, 41) == 47.0
          and geo.axis_delta_deg(221, 41) == 0.0)

    # simplify keeps the extremes
    line = np.stack([np.linspace(0, 1000, 200), np.zeros(200)], axis=1)
    line[100, 1] = 500.0
    simp = geo.simplify(line, tol_m=10.0)
    check("geo   Douglas-Peucker keeps the endpoints and the spike",
          len(simp) < 10 and np.allclose(simp[0], line[0]) and np.allclose(simp[-1], line[-1])
          and any(abs(p[1] - 500.0) < 1e-9 for p in simp), f"{len(simp)} of 200 points kept")

    # raster: contour tracing regressions
    m = np.zeros((40, 40), dtype=bool)
    m[10:20, 12:30] = True
    check("raster 10x18 rectangle traces to a 52-pixel perimeter",
          abs(raster.perimeter_pixels(m) - 52.0) < 1e-9,
          f"{raster.perimeter_pixels(m)}")
    yy, xx = np.mgrid[0:60, 0:60]
    ell = (((xx - 30) / 18.0) ** 2 + ((yy - 30) / 7.0) ** 2) < 1
    ram = math.pi * (3 * (18 + 7) - math.sqrt((3 * 18 + 7) * (18 + 3 * 7)))
    check("raster ellipse perimeter is within 2 % of Ramanujan",
          abs(raster.perimeter_pixels(ell) - ram) / ram < 0.02,
          f"{raster.perimeter_pixels(ell):.1f} vs {ram:.1f}")

    # raster: labelling and box statistics
    two = np.zeros((30, 30), dtype=bool)
    two[2:8, 2:8] = True
    two[20:28, 20:28] = True
    lab, n = raster.label(two)
    check("raster labels two disjoint blobs as two components", n == 2)
    check("raster box_mean of a constant field is that constant",
          np.allclose(raster.box_mean(np.full((20, 20), 3.5), 3), 3.5))
    check("raster erode(dilate(x)) leaves a thick blob unchanged",
          np.array_equal(raster.close(two, 1), two))

    # drift: with a constant field and no diffusion, RK4 must be exact
    hours = np.arange(-5.0, 5.0, 1.0)
    bbox = (68.0, 21.5, 71.0, 23.5)
    cur = forcing.make_current(bbox, hours, mean_speed=0.5, mean_dir_deg=90.0,
                               tide_amp=0.0, eddy=False)
    wnd = forcing.make_wind(bbox, hours, base_speed=0.0, veer_deg_per_h=0.0)
    params = drift.DriftParams(k_h=0.0, sigma_current=0.0, sigma_alpha=0.0, alpha=0.0)
    snaps = drift.integrate(np.array([69.5]), np.array([22.5]), 0.0, 2.0, cur, wnd,
                            params, rng=None)
    plane = geo.TangentPlane(22.5, 69.5)
    ex, ey = plane.to_xy(float(snaps[-1].lons[0]), float(snaps[-1].lats[0]))
    check("drift  RK4 in a uniform 0.5 m/s eastward field moves exactly u*t",
          abs(float(ex) - 0.5 * 2 * 3600) < 1.0 and abs(float(ey)) < 1.0,
          f"{float(ex):.1f} m east, {float(ey):.1f} m north, expected 3600.0 / 0.0")

    # drift: r95 of a known Gaussian cloud
    n = 40000
    lat0, lon0 = 22.5, 69.5
    pl = geo.TangentPlane(lat0, lon0)
    gx = rng.normal(0, 5000.0, n)
    gy = rng.normal(0, 5000.0, n)
    glon, glat = pl.to_lonlat(gx, gy)
    # 95th percentile of a 2-D isotropic Gaussian radius is sigma*sqrt(-2 ln 0.05)
    expect = 5000.0 * math.sqrt(-2 * math.log(0.05)) / 1000.0
    got = drift.r95_km(glon, glat)
    check("drift  r95 of a Gaussian cloud matches the analytic Rayleigh quantile",
          abs(got - expect) / expect < 0.02, f"{got:.3f} km vs {expect:.3f} km")

    # png round trip
    a = (rng.integers(0, 256, (37, 53))).astype(np.uint8)
    import io, struct, zlib, tempfile, os
    fd, path = tempfile.mkstemp(suffix=".png")
    os.close(fd)
    png.write_gray(path, a)
    raw = open(path, "rb").read()
    os.unlink(path)
    idat = b""
    i = 8
    while i < len(raw):
        ln = struct.unpack(">I", raw[i:i + 4])[0]
        if raw[i + 4:i + 8] == b"IDAT":
            idat += raw[i + 8:i + 8 + ln]
        i += 12 + ln
    rows = np.frombuffer(zlib.decompress(idat), dtype=np.uint8).reshape(37, 53 + 1)
    check("png   greyscale round-trips byte for byte",
          raw[:8] == b"\x89PNG\r\n\x1a\n" and np.array_equal(rows[:, 1:][::-1], a))

    print()


def run_all(out_root="runs"):
    global _results
    _results = []
    primitives()
    print("Dark Transit -- acceptance criteria\n")

    docs = {}
    for name in incident.SCENARIOS:
        doc, out = pipeline.run(name, out_root=out_root, quiet=True)
        docs[name] = (doc, out)

    doc, out = docs["kutch"]

    # AC-1 unattended end to end, dossier emitted
    check("AC-1  pipeline runs end to end and emits a dossier",
          (out / "dossier.html").exists() and (out / "run.json").exists()
          and doc.get("attribution") is not None)

    # AC-2 limitations above the finding, provenance named
    html = (out / "dossier.html").read_text()
    i_lim = html.find("What this assessment cannot establish")
    i_fin = html.find("<h2>Finding</h2>")
    check("AC-2  dossier page 1 puts the limitations above the finding",
          0 < i_lim < i_fin, f"limitations at {i_lim}, finding at {i_fin}")
    check("AC-2  dossier declares AIS provenance",
          "AIS provenance" in html and "synthetic" in html)

    # AC-3 five factors, five justifications, weight pack version
    att = doc["attribution"]
    ok = all(
        len(set(r["factors"]) | set(r.get("suppressed", []))) == 5
        and len(r["justifications"]) == 5
        for r in att["ranked"])
    check("AC-3  every ranked vessel carries five factors and five justifications", ok)
    check("AC-3  weight pack version is reported",
          bool(att.get("weight_pack_version")), att.get("weight_pack"))

    # AC-4 rescore is a pure function of stored factors
    from . import score as scoring
    zeroed = dict(att["weights"])
    zeroed["heading"] = 0
    alt = scoring.rescore([dict(r) for r in att["ranked"]], zeroed)
    check("AC-4  re-scoring with a changed weight re-ranks without re-running the pipeline",
          alt["leader_margin"] != att["leader_margin"],
          f"margin {att['leader_margin']} -> {alt['leader_margin']} with heading zeroed")

    # AC-5 every gate fires on its scenario
    expect = {"lookalike": 1, "clean": 1, "wide": 2, "no-radar": 3,
              "ambiguous": 4, "short-archive": 5}
    fired_ok = True
    for sc, gid in expect.items():
        d, _ = docs[sc]
        got = any(g["id"] == gid and g["fired"] for g in d["gates"])
        fired_ok &= got
        if not got:
            check(f"AC-5  gate {gid} fires on scenario '{sc}'", False)
    check("AC-5  all five gates fire on their adversarial scenarios", fired_ok,
          "gates 1-5 across lookalike/clean/wide/no-radar/ambiguous/short-archive")

    # AC-6 negative control
    clean, _ = docs["clean"]
    check("AC-6  negative control: clean scene names no vessel",
          clean.get("attribution") is None and clean["halted"]["gate"] == 1,
          clean["halted"]["detail"])

    # AC-8 determinism
    d1, o1 = pipeline.run("kutch", out_root=out_root, quiet=True)
    d2, o2 = pipeline.run("kutch", out_root=out_root, quiet=True)
    s1 = [(r["mmsi"], r["score"]) for r in d1["attribution"]["ranked"]]
    s2 = [(r["mmsi"], r["score"]) for r in d2["attribution"]["ranked"]]
    check("AC-8  two runs with identical inputs produce identical scores", s1 == s2)

    # AC-10 no responsibility language anywhere in generated output
    lang_ok = True
    for name, (d, o) in docs.items():
        for f in list(o.glob("*.html")) + list(o.glob("*.json")):
            low = f.read_text().lower()
            for phrase in pipeline.FORBIDDEN:
                if phrase in low:
                    lang_ok = False
                    check(f"AC-10  '{phrase}' appears in {name}/{f.name}", False)
    check("AC-10  no generated output asserts responsibility", lang_ok,
          f"forbidden phrases: {', '.join(pipeline.FORBIDDEN)}")

    # AC-11 the narrative view holds no numbers of its own
    idx = WEB / "index.html"
    if idx.exists():
        src = idx.read_text()
        check("AC-11  narrative view fetches run.json", "run.json" in src)
        # Scan the markup only: shader constants and gate thresholds legitimately
        # live in script, invented incident numbers do not.
        markup = re.sub(r"<script[\s\S]*?</script>", "", src)
        markup = re.sub(r"<style[\s\S]*?</style>", "", markup)
        stale = re.findall(r"(?<![\w.])(?:12\.4|0\.87|419•|2 600|−11\.4|−23\.8|14\.9|041°)(?![\w])",
                           markup)
        check("AC-11  narrative view markup carries no hardcoded incident numbers", not stale,
              f"found {stale}" if stale else "")
        check("AC-11  narrative view holds no vessel data of its own",
              "const V=[" not in src and "Kestrel Ridge" not in src)
    else:
        check("AC-11  narrative view present", False, "web/index.html missing")

    # UI-1, UI-2, UI-4: the workstation is a live view, not a mockup
    ws = WEB / "workstation.html"
    if ws.exists():
        wsrc = ws.read_text()
        check("UI-1  workstation reads run.json and the run's own rasters",
              "run.json" in wsrc and "cloud.json" in wsrc and "rasters" in wsrc)
        check("UI-2  workstation has a time slider over the whole horizon",
              'id="tslider"' in wsrc and "setHour" in wsrc)
        check("UI-3  workstation posts weight changes to /rescore",
              "/rescore" in wsrc and 'type="range"' in wsrc)
        check("UI-4  workstation shows the run log and every gate decision",
              "log.jsonl" in wsrc and "gateBox" in wsrc)
        wmark = re.sub(r"<script[\s\S]*?</script>", "", wsrc)
        wmark = re.sub(r"<style[\s\S]*?</style>", "", wmark)
        stale_ws = re.findall(r"(?<![\w.])(?:12\.4|0\.87|419•|2 600)(?![\w])", wmark)
        check("UI-1  workstation markup carries no hardcoded incident numbers",
              not stale_ws, f"found {stale_ws}" if stale_ws else "")
    else:
        check("UI-1  workstation present", False, "web/workstation.html missing")

    # the map needs a basemap and a cloud to animate
    ras = doc.get("rasters", {}).get("detection")
    check("UI-1  pipeline emits the SAR scene as a georeferenced raster",
          bool(ras) and (out / ras["file"]).exists() and "bounds" in ras and "stretch" in ras,
          ras["file"] if ras else "")
    cloudf = out / "cloud.json"
    check("UI-2  pipeline emits per-hour particle clouds for the slider",
          cloudf.exists() and len(json.loads(cloudf.read_text())["backward"]) > 20)

    # DR-5 landfall is computed, not stubbed
    fwd = doc["drift"]["forward"]
    check("DR-5  forward forecast runs the landfall test against a coastline",
          fwd.get("available") is True and "ashore_series" in fwd,
          f"landfall={fwd.get('landfall')} eta={fwd.get('eta_utc')}")
    series = [s["ashore_fraction"] for s in fwd.get("ashore_series", [])]
    check("DR-5  ashore fraction is cumulative and never falls",
          all(b >= a - 1e-9 for a, b in zip(series, series[1:])))

    # TR-8 is exercised by a scenario, not merely implemented
    sp, _ = docs["spoofed"]
    kf_sp = sp["traffic"]["kinematic_flags"]
    kf_nom = doc["traffic"]["kinematic_flags"]
    check("TR-8  the spoofed scenario trips the kinematic plausibility check",
          kf_sp["vessels_flagged"] >= 1 and kf_nom["vessels_flagged"] == 0,
          f"spoofed {kf_sp['total_fixes_flagged']} fixes, nominal {kf_nom['total_fixes_flagged']}")

    # DT-4: report which coefficients are in force
    disc = doc["detection"].get("discriminator", {})
    check("DT-4  the detector reports whether its coefficients are fitted or hand-set",
          disc.get("source") in ("fitted", "hand-set"), disc.get("source"))

    # NFR-6 uncertainty is first class: no scalar origin point anywhere
    drift_art = json.loads((out / "04_drift.json").read_text())
    check("NFR-6  no origin point is emitted, only a region and a window",
          "origin_point" not in json.dumps(drift_art) and bool(drift_art["origin_region"])
          and bool(drift_art["origin_window"]))
    check("NFR-6  the 95 % radius is reported for every hour rewound",
          len(drift_art["r95_series"]) >= int(drift_art["horizon_h"]))

    # NFR-3 absence is not evidence: a hull with no gap is never scored on one
    ok = all(r["factors"].get("broadcast", 0) == 0
             for r in att["ranked"] if not r["gaps"])
    check("NFR-3  vessels with no broadcast gap score zero on that factor, never negative", ok)

    # closed loop: the hindcast recovers a truth it was never shown
    check("closed loop: top-1 attribution matches the injected culprit",
          doc["truth"].get("top1_correct") is True,
          f"culprit {doc['truth']['culprit_mmsi']}")
    win = doc["drift"]["origin_window_h"]
    age_true = -doc["truth"]["release_age_h"]
    check("closed loop: the true release time falls inside the origin window",
          win[0] <= age_true <= win[1], f"{win[0]} <= {age_true} <= {win[1]}")

    n_pass = sum(1 for _, ok, _ in _results if ok)
    print(f"\n  {n_pass}/{len(_results)} checks passed")
    return n_pass == len(_results)
