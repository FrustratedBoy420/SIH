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


def capabilities():
    """The four optional paths, and the degraded route each one falls back to.

    Every check here is written so it passes on a machine that has none of the
    optional wheels installed. That is deliberate: TR-G1 says a venue machine
    missing a dependency degrades rather than fails, and a suite that only
    passed on the developer's laptop would not be testing that claim.
    """
    print("Optional paths -- DT-3, the PDF, the reader, and their degradations\n")

    from . import detect_ml, pdf, unet
    from .readers import sentinel1

    # -- the numpy U-Net ---------------------------------------------------- #
    det = detect_ml.load()
    if det.available:
        d = det.describe()
        check("DT-3  a weights pack is present and describes itself",
              d["source"] == "unet" and d["parameters"] > 0,
              f"{d['architecture']}, {d['parameters']:,} params, {d.get('corpus')} corpus")

        rep = det.report or {}
        split = (rep.get("split") or {}).get("by")
        check("DT-3  the holdout split is by source tile, not by patch",
              split == "source tile", str(split))

        hold = (rep.get("holdout_metrics") or {}).get(f"{det.threshold:.2f}") or {}
        check("DT-3  holdout IoU and F1 are measured and reported",
              hold.get("iou") is not None and hold.get("f1") is not None,
              f"IoU {hold.get('iou')} F1 {hold.get('f1')}")

        parity = rep.get("export_parity") or {}
        check("DT-3  the numpy export was checked against torch before it shipped",
              parity.get("agrees") is True,
              f"max |torch - numpy| = {parity['max_abs_diff']:.2e}"
              if parity.get("max_abs_diff") is not None else "no parity record")

        # The forward pass runs here, on numpy alone -- the property that keeps
        # the runtime dependency list at one entry.
        rng = np.random.default_rng(5)
        probe = rng.normal(-12.0, 2.0, size=(64, 64)).astype(np.float32)
        p = det.net.predict(probe)
        check("DT-3  inference needs numpy and nothing else",
              p.shape == probe.shape and float(p.min()) >= 0.0 and float(p.max()) <= 1.0,
              f"probabilities in [{float(p.min()):.3f}, {float(p.max()):.3f}]")

        # Refinement must not be able to originate a detection: with no
        # candidates there is nothing to refine and nothing may appear.
        notes, prob = detect_ml.refine(_ProbeScene(), [], detector=det)
        check("DT-3  the network cannot originate a candidate, only redraw one",
              notes == [] and prob is None)
    else:
        check("DT-3  absent a pack, the detector says so instead of guessing",
              det.describe()["source"] == "absent" and bool(det.error), det.error)

    # the primitives hold whether or not a pack exists
    x = np.zeros((1, 8, 8), dtype=np.float32)
    x[0, 4, 4] = 1.0
    w = np.ones((1, 1, 3, 3), dtype=np.float32)
    conv = unet.conv2d(x, w, np.zeros(1, dtype=np.float32))
    check("DT-3  same-padded convolution preserves shape and sums its window",
          conv.shape == (1, 8, 8) and abs(float(conv[0, 4, 4]) - 1.0) < 1e-6
          and abs(float(conv.sum()) - 9.0) < 1e-5)

    pooled = unet.maxpool2(np.arange(16, dtype=np.float32).reshape(1, 4, 4))
    check("DT-3  pooling halves the grid and keeps the maximum",
          pooled.shape == (1, 2, 2) and float(pooled[0, 1, 1]) == 15.0)

    check("DT-3  upsampling crops back to the encoder's odd shape",
          unet.upsample2(pooled, out_hw=(3, 3)).shape == (1, 3, 3))

    # -- RP-1, the PDF and its fallback ------------------------------------- #
    cap = pdf.available()
    latest = _latest_run(Path("runs"))
    if cap["weasyprint"]:
        pdf_path = (latest / "dossier.pdf") if latest else None
        check("RP-1  a run emits a PDF dossier beside the HTML",
              bool(pdf_path and pdf_path.exists()),
              pdf_path.name if pdf_path else "no run found")
        if pdf_path and pdf_path.exists():
            # Counting pages out of the written bytes and asking the renderer
            # are independent routes to the same number. Requiring them to
            # agree catches a PDF that was truncated after the page count was
            # recorded -- which a fixed lower bound would not.
            doc = json.loads((latest / "run.json").read_text())
            pages = pdf.page_count(pdf_path)
            check("RP-1  the written PDF has the page count the renderer reported",
                  pages is not None and pages == doc.get("dossier_pdf_pages"),
                  f"{pages} in the file, {doc.get('dossier_pdf_pages')} recorded")
            check("RP-1  the PDF is a PDF, not HTML with the wrong suffix",
                  pdf_path.read_bytes()[:5] == b"%PDF-")

        # A run that halts at a gate emits a shorter dossier on purpose, so the
        # page-break check belongs on a run that reached attribution.
        complete = _latest_complete_run(Path("runs"))
        cpdf = (complete / "dossier.pdf") if complete else None
        if cpdf and cpdf.exists():
            check("RP-1  a complete run's dossier keeps its section page breaks",
                  (pdf.page_count(cpdf) or 0) >= 4,
                  f"{pdf.page_count(cpdf)} pages, {complete.name}")
    else:
        check("RP-1  absent WeasyPrint the run still emits the HTML dossier",
              bool(latest and (latest / "dossier.html").exists()), cap["error"])

    # -- the Sentinel-1 reader ---------------------------------------------- #
    rd = sentinel1.available()
    check("IN-1  the reader reports what it can read on this machine",
          isinstance(rd, dict) and "rasterio" in rd,
          f"rasterio={rd['rasterio']} pillow={rd['pillow']}")

    db, note = sentinel1.to_db(np.full((4, 4), 0.05, dtype=np.float32), assume="auto")
    check("IN-1  linear sigma-nought is recognised and converted to decibels",
          "log10" in note and abs(float(db[0, 0]) + 13.01) < 0.05, note)

    db2, note2 = sentinel1.to_db(np.full((4, 4), -14.0, dtype=np.float32), assume="auto")
    check("IN-1  a raster already in decibels is not converted twice",
          note2.startswith("already") and float(db2[0, 0]) == -14.0)

    # A slick must not be allowed to lower the wind it is scored against.
    field = np.full((96, 96), -11.5, dtype=np.float32)
    field[40:56, 40:56] = -23.5
    wind = sentinel1.wind_proxy_ms(field, pixel_m=100.0)
    check("IN-1  the wind proxy is smoothed, so a slick cannot excuse itself as calm",
          float(wind[48, 48]) > 0.75 * float(wind[5, 5]),
          f"{float(wind[48, 48]):.2f} m/s inside vs {float(wind[5, 5]):.2f} outside")

    check("IN-1  an ungeoreferenced tile is refused rather than placed at a guess",
          _raises(sentinel1.Sentinel1ReadError,
                  lambda: sentinel1._plane_and_axes(
                      sentinel1._Raw(np.zeros((1, 4, 4), np.float32), None, None,
                                     Path("x.tif")), None, None)))

    # -- the Zenodo corpus loader ------------------------------------------- #
    #
    # The archive is 96 GB across three records, so the corpus itself is not a
    # test fixture. What is testable without it -- and what actually breaks --
    # is the layout convention: which files are imagery, which are ground
    # truth, and what class a directory name implies. Getting `_is_image_path`
    # wrong would silently train the model on its own labels.
    from . import train_unet

    check("DT-3  ground-truth tiles are not mistaken for imagery",
          not train_unet._is_image_path(Path("a/Images_ground_truth/t.tif"))
          and not train_unet._is_image_path(Path("a/Oil_mask/t.tif"))
          and train_unet._is_image_path(Path("a/Images/t.tif")))

    check("DT-3  a tile's class is read from the directory the archive puts it in",
          train_unet._kind_of(Path("x/01_Train_Val_Lookalike_images/t.tif")) == "lookalike"
          and train_unet._kind_of(Path("x/01_Train_Val_No_Oil_Images/t.tif")) == "clean"
          and train_unet._kind_of(Path("x/02_Test_images/t.tif")) == "oil")

    # A look-alike tile's label is an all-zero mask, and that is the label --
    # dropping those tiles would train a detector that has never been shown a
    # dark patch which is not oil.
    check("DT-3  look-alike and oil-free tiles are kept, not filtered out",
          train_unet._kind_of(Path("x/Lookalike/t.tif")) != "oil"
          and train_unet._kind_of(Path("x/No_oil/t.tif")) != "oil")
    print()


class _ProbeScene:
    """The smallest object satisfying what `detect_ml.refine` reads off a scene."""
    sigma0_db = np.full((32, 32), -12.0, dtype=np.float32)
    pixel_m = 100.0


def _latest_run(root: Path):
    runs = sorted([p for p in root.glob("*") if (p / "run.json").exists()],
                  key=lambda p: p.stat().st_mtime)
    return runs[-1] if runs else None


def _latest_complete_run(root: Path):
    """The newest run that reached attribution rather than halting at a gate."""
    for p in sorted([p for p in root.glob("*") if (p / "run.json").exists()],
                    key=lambda p: p.stat().st_mtime, reverse=True):
        try:
            doc = json.loads((p / "run.json").read_text())
        except Exception:
            continue
        if doc.get("halted") is None and doc.get("attribution"):
            return p
    return None


def _raises(exc, fn):
    try:
        fn()
    except exc:
        return True
    except Exception:
        return False
    return False


def run_all(out_root="runs"):
    global _results
    _results = []
    primitives()
    capabilities()
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
