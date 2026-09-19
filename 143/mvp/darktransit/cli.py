"""Command line entry point.

    python3 -m darktransit.cli run [--scenario kutch] [--seed N]
    python3 -m darktransit.cli scenarios
    python3 -m darktransit.cli selftest
    python3 -m darktransit.cli ablate [--run latest]
    python3 -m darktransit.cli serve [--port 8000]
"""

from __future__ import annotations

import argparse
import json
import sys
from pathlib import Path

import numpy as np

from . import incident, pipeline, score as scoring, server


def _latest(root):
    d = server.latest_run(Path(root))
    if d is None:
        sys.exit("no runs yet -- run `python3 -m darktransit.cli run` first")
    return d


def cmd_run(a):
    doc, out = pipeline.run(a.scenario, seed=a.seed, out_root=a.out,
                            weight_pack=a.weights, n_particles=a.particles)
    halted = doc.get("halted")
    print()
    print(f"  scenario      {doc['scenario']}  ({doc['scenario_label']})")
    print(f"  provenance    ais={doc['provenance']['ais']} scene={doc['provenance']['scene']}"
          f" forcing={doc['provenance']['forcing']}")
    for g in doc["gates"]:
        mark = "FIRED " if g["fired"] else "  ok  "
        print(f"  gate {g['id']} {mark} {g['name']}: {g['detail']}")
    if halted:
        print(f"\n  HALTED at gate {halted['gate']} ({halted['name']}). "
              f"A halt is a successful outcome.")
    else:
        att = doc["attribution"]
        geom = doc["geometry"]
        print(f"\n  slick         {geom['area_km2']} km2, axis {geom['principal_axis_deg']} deg,"
              f" elongation {geom['elongation']}, age {geom['age_hours']} h"
              f" [{geom['age_hours_lo']}-{geom['age_hours_hi']}]")
        print(f"  origin        {doc['drift']['origin_window'][0]} -> "
              f"{doc['drift']['origin_window'][1]}, r95 {doc['drift']['r95_union_km']} km")
        print(f"  traffic       {doc['traffic']['in_window']} in window, "
              f"{doc['traffic']['dropped']} dropped")
        dk = doc["dark"]
        print(f"  dark channel  " + ("unavailable" if not dk.get("available") else
              f"{dk['targets']} targets, {dk['matched']} matched, {dk['unmatched']} unmatched"))
        print(f"  leader margin {att['leader_margin']}")
        print()
        print(f"  {'#':<3}{'vessel':<20}{'mmsi':<12}{'type':<16}{'cog':>6}{'dax':>6}{'score':>8}")
        for r in att["ranked"]:
            print(f"  {r['rank']:<3}{r['name'][:19]:<20}{r['mmsi']:<12}"
                  f"{r['ship_type'][:15]:<16}"
                  f"{('-' if r['cog'] is None else round(r['cog'])):>6}"
                  f"{('-' if r['delta_axis'] is None else round(r['delta_axis'])):>6}"
                  f"{r['score']:>8.3f}")
        print(f"\n  {att['finding']}")
    print(f"\n  dossier       {out / 'dossier.html'}")
    print(f"  run.json      {out / 'run.json'}")


def cmd_scenarios(a):
    for name, sc in incident.SCENARIOS.items():
        print(f"  {name:<15}{sc.notes or 'Nominal incident: detect, hindcast, attribute.'}")


def cmd_ablate(a):
    d = _latest(a.out) if a.run in (None, "latest") else Path(a.out) / a.run
    doc = json.loads((d / "run.json").read_text())
    att = doc.get("attribution")
    if not att:
        sys.exit(f"run {d.name} halted before attribution")
    abl = scoring.ablate(att["ranked"], att["weights"])
    base = abl.pop("baseline")
    print(f"  baseline leader {base['leader']}  margin {base['margin']}")
    for k, v in abl.items():
        flag = "  <- leader changes" if v["leader_changed"] else ""
        print(f"  without {k:<14} leader {v['leader']}  margin {v['margin']}{flag}")


def cmd_selftest(a):
    from .tests import run_all
    sys.exit(0 if run_all(out_root=a.out) else 1)


def cmd_validate(a):
    from . import validate
    print("Drift validation -- the AC-7 method, against synthetic drifters\n")
    validate.run(n_drifters=a.drifters, hours_back=a.hours, seed=a.seed, alpha=a.alpha)


def cmd_fit(a):
    from . import fit
    fit.run_fit(n_scenes=a.scenes, seed=a.seed, out=a.pack)


def cmd_serve(a):
    server.serve(a.out, a.port)


def cmd_train(a):
    """Fit the DT-3 segmentation model. Needs torch; inference never does."""
    from . import train_unet

    cap = train_unet.available()
    if not cap["torch"]:
        raise SystemExit(
            "Training needs PyTorch, which is not installed here.\n"
            f"  {cap['error']}\n"
            "Inference does not: a weights pack trained elsewhere runs on numpy alone."
        )
    train_unet.train(
        corpus=a.corpus, zenodo_root=a.zenodo, n_scenes=a.scenes, epochs=a.epochs,
        batch=a.batch, lr=a.lr, per_tile=a.per_tile, seed=a.seed, limit=a.limit,
        out_weights=a.weights_out, out_report=a.report_out)


def cmd_capabilities(a):
    """What is live on this machine, and what is running degraded (TR-G1)."""
    caps = server.capabilities()
    print("\n  Optional paths on this machine\n")

    seg = caps["segmentation"]
    if seg.get("source") == "unet":
        hold = seg.get("holdout") or {}
        extra = (f"  holdout IoU {hold['iou']:.3f} F1 {hold['f1']:.3f}"
                 if hold.get("iou") is not None else "")
        print(f"    DT-3 segmentation   ok   {seg['architecture']}, "
              f"{seg['parameters']:,} params, {seg.get('corpus')} corpus{extra}")
    else:
        print(f"    DT-3 segmentation   --   {seg.get('error') or seg.get('note')}")

    pdf = caps["pdf"]
    print(f"    dossier PDF         {'ok' if pdf['weasyprint'] else '--'}   "
          f"{pdf['engine'] or pdf['error']}")

    rd = caps["sentinel1_reader"]
    print(f"    Sentinel-1 reader   {'ok' if rd['georeferenced_input'] else '--'}   "
          f"rasterio={rd['rasterio']} pillow={rd['pillow']}")

    print(f"    workstation build   {'ok' if caps['workstation_built'] else '--'}   "
          f"{'web-app/dist' if caps['workstation_built'] else 'run: cd web-app && npm install && npm run build'}")

    print(f"\n  {caps['note']}\n")


def cmd_ingest(a):
    """Read a real Sentinel-1 GeoTIFF and report what came back."""
    from .readers import sentinel1

    centre = (a.lon, a.lat) if a.lon is not None and a.lat is not None else None
    sc = sentinel1.read_geotiff(a.path, band=a.band, centre_lonlat=centre,
                                pixel_m=a.pixel_m, max_side=a.max_side)
    t = sc.truth
    print(f"\n  {sc.scene_id}  {sc.shape[1]} x {sc.shape[0]} px  "
          f"{sc.pixel_m:.1f} m  {sc.polarisation}")
    print(f"    georeferenced   {t['georeferenced']}   {t['geometry_note']}")
    print(f"    radiometry      {t['radiometry_note']}")
    print(f"    wind            {t['wind_source']}")
    print(f"    sigma0 dB       median {float(np.median(sc.sigma0_db)):.2f}  "
          f"p2 {float(np.percentile(sc.sigma0_db, 2)):.2f}  "
          f"p98 {float(np.percentile(sc.sigma0_db, 98)):.2f}")
    lon, lat = sc.lonlat_of_px(sc.shape[1] / 2, sc.shape[0] / 2)
    print(f"    centre          {float(lon):.5f}, {float(lat):.5f}")

    if a.detect:
        from . import detect
        cands, retained, raw = detect.detect(sc)
        print(f"\n    {raw} raw components, {len(cands)} candidates, "
              f"{len(retained)} retained")
        for c in cands:
            print(f"      {c.cid}  {c.area_km2:8.2f} km2  {c.verdict:9s}  "
                  f"confidence {c.confidence:.3f}  {c.rejection_basis or ''}")
    print()


def main(argv=None):
    ap = argparse.ArgumentParser(prog="darktransit", description=__doc__)
    ap.add_argument("--out", default="runs", help="run directory root")
    sub = ap.add_subparsers(dest="cmd", required=True)

    r = sub.add_parser("run", help="run the pipeline end to end")
    r.add_argument("--scenario", "--incident", dest="scenario", default="kutch",
                   choices=list(incident.SCENARIOS))
    r.add_argument("--seed", type=int, default=None)
    r.add_argument("--weights", default=None, help="path to a weight pack JSON")
    r.add_argument("--particles", type=int, default=2600)
    r.set_defaults(fn=cmd_run)

    s = sub.add_parser("scenarios", help="list the incidents and what each demonstrates")
    s.set_defaults(fn=cmd_scenarios)

    b = sub.add_parser("ablate", help="re-rank with each factor zeroed in turn")
    b.add_argument("--run", default="latest")
    b.set_defaults(fn=cmd_ablate)

    t = sub.add_parser("selftest", help="acceptance criteria from PRD 19")
    t.set_defaults(fn=cmd_selftest)

    vd = sub.add_parser("validate", help="hindcast known drifter tracks and check r95 coverage")
    vd.add_argument("--drifters", type=int, default=25)
    vd.add_argument("--hours", type=float, default=24.0)
    vd.add_argument("--seed", type=int, default=11)
    vd.add_argument("--alpha", type=float, default=0.0,
                    help="leeway of the hindcast object; 0 for a drogued buoy, "
                         "0.03 for oil (a deliberate mismatch, see the docstring)")
    vd.set_defaults(fn=cmd_validate)

    fp = sub.add_parser("fit", help="fit the look-alike discriminator and measure it")
    fp.add_argument("--scenes", type=int, default=140)
    fp.add_argument("--seed", type=int, default=4242)
    fp.add_argument("--pack", default="detector.v1.json")
    fp.set_defaults(fn=cmd_fit)

    v = sub.add_parser("serve", help="serve the workstation and the narrative view")
    v.add_argument("--port", type=int, default=8000)
    v.set_defaults(fn=cmd_serve)

    tr = sub.add_parser("train", help="fit the DT-3 segmentation model (needs torch)")
    tr.add_argument("--corpus", default="synthetic", choices=["synthetic", "zenodo"])
    tr.add_argument("--zenodo", default=None,
                    help="root of the extracted Zenodo tiles, for --corpus zenodo")
    tr.add_argument("--scenes", type=int, default=64)
    tr.add_argument("--epochs", type=int, default=26)
    tr.add_argument("--batch", type=int, default=8)
    tr.add_argument("--lr", type=float, default=2e-3)
    tr.add_argument("--per-tile", dest="per_tile", type=int, default=8)
    tr.add_argument("--limit", type=int, default=None, help="cap the tiles read")
    tr.add_argument("--seed", type=int, default=20260909)
    tr.add_argument("--weights-out", dest="weights_out", default="detector.unet.v2.npz")
    tr.add_argument("--report-out", dest="report_out", default="detector.unet.v2.json")
    tr.set_defaults(fn=cmd_train)

    cp = sub.add_parser("capabilities", help="which optional paths are live here")
    cp.set_defaults(fn=cmd_capabilities)

    ig = sub.add_parser("ingest", help="read a real Sentinel-1 GeoTIFF and report it")
    ig.add_argument("path")
    ig.add_argument("--band", type=int, default=0)
    ig.add_argument("--lon", type=float, default=None, help="scene centre, if ungeoreferenced")
    ig.add_argument("--lat", type=float, default=None)
    ig.add_argument("--pixel-m", dest="pixel_m", type=float, default=None)
    ig.add_argument("--max-side", dest="max_side", type=int, default=640)
    ig.add_argument("--detect", action="store_true", help="also run stage 02 on it")
    ig.set_defaults(fn=cmd_ingest)

    a = ap.parse_args(argv)
    a.fn(a)


if __name__ == "__main__":
    main()
