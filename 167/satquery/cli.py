"""Command-line entry point.

    python -m satquery.cli selftest       run every check
    python -m satquery.cli demo           one cross-modal run, printed
    python -m satquery.cli ask "..."      one query against the demo scene
    python -m satquery.cli scenes         write demo GeoTIFFs to data/demo/
    python -m satquery.cli datasets       what data is staged on this machine
    python -m satquery.cli models         the model registry and weight status
    python -m satquery.cli eval           metrics and the A-E ablation
    python -m satquery.cli serve          the HTTP API on :8000
"""

from __future__ import annotations

import argparse
import json
import sys
from pathlib import Path

from . import __version__, datasets, evaluate, scene as scenes
from .pipeline import Pipeline, save_run
from .raster import write_geotiff
from .router import Inputs

DEMO = Path("data/demo")


def _scene_inputs(size: int = 384, seed: int = 7, bitemporal: bool = False) -> Inputs:
    if bitemporal:
        t1, t2, _ = scenes.bitemporal(size=size, seed=seed)
        return Inputs(t1=t1.optical(seed, with_cloud=False),
                      t2=t2.optical(seed, with_cloud=False))
    sc = scenes.build(size=size, seed=seed)
    return Inputs(optical=sc.optical(seed), sar=sc.sar(seed))


def _print_result(r) -> None:
    print(f"\n  query    {r.query}")
    print(f"  task     {r.task or '-'}    tools: {', '.join(r.tools) or '-'}")
    print(f"  engine   {r.engine}    {r.elapsed_ms:.0f} ms")
    print("\n  TRACE")
    for s in r.trace:
        mark = "✓" if s["ok"] else "✗"
        print(f"    {mark} {s['step']:<22} {s['detail']}")
    print(f"\n  ANSWER\n    {r.answer}")
    if r.refused:
        print("\n  REFUSED — no model was invoked.")
    elif r.abstained:
        print("\n  ABSTAINED — nothing cleared the confidence gate.")
    else:
        print(f"\n  confidence {r.confidence:.2f}"
              f"    {len(r.geojson.get('features', []))} georeferenced feature(s)")
        for it in r.evidence["items"]:
            if it["confidence"] >= r.evidence["threshold"]:
                v = f"{it['value']} {it['unit']}".strip()
                print(f"    · {it['claim']:<46} {v:<18} "
                      f"{it['confidence']:.2f}  [{it['modality']}]")


def main(argv: list[str] | None = None) -> int:
    ap = argparse.ArgumentParser(prog="satquery",
                                 description="SatQuery AI — SIH26167 reference implementation")
    ap.add_argument("--version", action="version", version=__version__)
    sub = ap.add_subparsers(dest="cmd", required=True)

    sub.add_parser("selftest", help="run every check")
    sub.add_parser("demo", help="one cross-modal run against the demo scene")
    sub.add_parser("datasets", help="what data is staged on this machine")
    sub.add_parser("models", help="model registry and weight status")

    a = sub.add_parser("ask", help="one query")
    a.add_argument("query")
    a.add_argument("--bitemporal", action="store_true")
    a.add_argument("--size", type=int, default=384)
    a.add_argument("--save", action="store_true", help="write the run to runs/")

    s = sub.add_parser("scenes", help="write demo GeoTIFFs")
    s.add_argument("--size", type=int, default=512)
    s.add_argument("--out", default=str(DEMO))

    e = sub.add_parser("eval", help="metrics and the A-E ablation")
    e.add_argument("--size", type=int, default=256)
    e.add_argument("--json", action="store_true")

    sv = sub.add_parser("serve", help="HTTP API")
    sv.add_argument("--port", type=int, default=8000)
    sv.add_argument("--host", default="127.0.0.1")
    sv.add_argument("--var", default=None,
                    help="where rasters and runs are stored (default ./var)")
    sv.add_argument("--adapters", default="adapters",
                    help="directory of adapter packs")
    sv.add_argument("--build", action="store_true",
                    help="build the web interface first if web/dist is missing (needs npm)")

    bt = sub.add_parser("batch", help="run a manifest of queries offline; write results.jsonl")
    bt.add_argument("manifest", nargs="?", help="JSON or JSON Lines manifest (paths relative to it)")
    bt.add_argument("--out", default="batch-results", help="output directory")
    bt.add_argument("--example", metavar="PATH", help="write a starter manifest over the built-in scenes and exit")

    st = sub.add_parser("stress", help="EVL-08 stress suite: behaviour under bad input")
    st.add_argument("--out", default=None, help="also record it (default web/public/stress.json with --record)")
    st.add_argument("--record", action="store_true", help="write web/public/stress.json for the Results page")

    cb = sub.add_parser("calibrate", help="per-record calibration study (>= 200 predictions), written for the Results page")
    cb.add_argument("--out", default=None, help="default: web/public/calibration.json in the repo")

    rp = sub.add_parser("replay", help="re-run a stored run and report any difference")
    rp.add_argument("run_id")
    rp.add_argument("--var", default=None, help="where rasters and runs are stored (default ./var)")

    rt = sub.add_parser("runtime", help="serve adapter packs over HTTP (the venue model runtime)")
    rt.add_argument("--port", type=int, default=8100)
    rt.add_argument("--host", default="127.0.0.1")
    rt.add_argument("--adapters", default="adapters", help="directory of adapter packs")

    args = ap.parse_args(argv)

    if args.cmd == "batch":
        from pathlib import Path
        from . import batch
        if args.example:
            from .paths import scenes as scenes_path
            scenes_dir = scenes_path()
            p = batch.write_example(args.example, Path(scenes_dir).resolve())
            print(f"  example manifest -> {p}")
            return 0
        if not args.manifest:
            print("  give a manifest, or --example PATH to write one")
            return 2
        s = batch.run(args.manifest, args.out, progress=True)
        print(f"\n  {s['items']} items · {s['answered']} answered · {s['refused']} refused · "
              f"{s['abstained']} abstained · {s['errors']} errors · {s['seconds']} s -> {args.out}/results.jsonl")
        return 1 if s["errors"] else 0

    if args.cmd == "stress":
        import json
        from pathlib import Path
        from . import stress
        cases = stress.run_suite()
        for c in cases:
            print(f"  {'✓' if c.ok else '✗'} {c.name:28s} {c.expect}")
            print(f"      {c.observed}")
        out = stress.summary(cases)
        print(f"\n  {out['passed']}/{out['total']} behave as expected")
        if args.out or args.record:
            Path(args.out or stress.STRESS_PATH).write_text(json.dumps(out, indent=2) + "\n", encoding="utf-8")
        return 0 if out["passed"] == out["total"] else 1

    if args.cmd == "calibrate":
        import json
        from pathlib import Path
        from . import evaluate
        r = evaluate.calibration_study()
        args.out = args.out or str(evaluate.CALIBRATION_PATH)
        Path(args.out).write_text(json.dumps(r, indent=2) + "\n", encoding="utf-8")
        print(f"  ECE {r['ece']} over n = {r['n']} records ({r['design']['scenes']} scenes) -> {args.out}")
        for k, v in r["by_kind"].items():
            print(f"    {k:22s} n {v['n']:3d}  accuracy {v['accuracy']:.3f}  mean confidence {v['mean_confidence']:.3f}")
        return 0

    if args.cmd == "replay":
        from pathlib import Path
        from .replay import replay
        from .server import resolve_inputs
        from .store import RasterStore, RunStore
        root = Path(args.var) if args.var else None
        rasters = RasterStore(root / "rasters" if root else None)
        runs = RunStore(root / "runs" if root else None)
        pipe = Pipeline()
        out = replay(runs.get(args.run_id), runs.request(args.run_id),
                     lambda q, spec, thr: pipe.run(q, resolve_inputs(spec, rasters), thr).to_dict())
        print(f"  {args.run_id}: {'identical' if out['identical'] else 'DIFFERS'}")
        for d in out["differences"]:
            print(f"    - {d}")
        return 0 if out["identical"] else 1

    if args.cmd == "runtime":
        from .runtime import serve_runtime
        srv = serve_runtime(args.host, args.port, args.adapters)
        print(f"  model runtime -> http://{args.host}:{args.port}  (packs from {args.adapters}/)")
        print(f"  point the API at it:  SATQUERY_RUNTIME=http://{args.host}:{args.port} satquery serve")
        try:
            srv.serve_forever()
        except KeyboardInterrupt:
            pass
        return 0

    if args.cmd == "selftest":
        from . import tests
        print(f"\n  SatQuery {__version__} — self-test\n")
        _, failed = tests.run()
        return 1 if failed else 0

    if args.cmd == "demo":
        r = Pipeline().run(
            "use the optical and SAR images together to identify built-up regions",
            _scene_inputs())
        _print_result(r)
        return 0

    if args.cmd == "ask":
        r = Pipeline().run(args.query, _scene_inputs(args.size, bitemporal=args.bitemporal))
        _print_result(r)
        if args.save:
            print(f"\n  saved to {save_run(r)}")
        return 0

    if args.cmd == "scenes":
        out = Path(args.out)
        out.mkdir(parents=True, exist_ok=True)
        sc = scenes.build(size=args.size)
        t1, t2, _ = scenes.bitemporal(size=args.size)
        written = [
            write_geotiff(sc.optical(7), out / "scene_optical.tif"),
            write_geotiff(sc.sar(7), out / "scene_sar.tif"),
            write_geotiff(t1.optical(7, with_cloud=False), out / "scene_t1.tif"),
            write_geotiff(t2.optical(7, with_cloud=False), out / "scene_t2.tif"),
        ]
        print(f"\n  wrote {len(written)} georeferenced GeoTIFFs to {out}/")
        for p in written:
            print(f"    {p.name:<22} {p.stat().st_size/1024:8.0f} KB")
        print("\n  These are real GeoTIFFs — they open in QGIS with their "
              "coordinates intact.")
        return 0

    if args.cmd == "datasets":
        s = datasets.summary(".")
        print(f"\n  Datasets — {s['counts']['complete']}/{s['counts']['total']} complete\n")
        for d in s["datasets"]:
            mark = {"complete": "●", "partial": "◐",
                    "absent": "○", "unavailable": "✕"}[d["status"]]
            print(f"  {mark} {d['name']:<26} {d['role']:<10} {d['status']}")
            print(f"      {d['requirement']}")
            print(f"      {d['records']}")
            if d["status"] in ("absent", "partial") and d.get("huggingface"):
                print(f"      hf: {d['huggingface']}")
            print()
        return 0

    if args.cmd == "models":
        print(f"\n  Model registry\n")
        for m in datasets.models():
            w = {"loaded": "●", "not trained": "○",
                 "frozen": "◇", "rule-based": "◆"}[m["status"]]
            print(f"  {w} {m['id']}  {m['name']:<26} {m['kind']:<11} {m['status']}")
            if m.get("requirement"):
                print(f"      {m['requirement']}")
            print(f"      {m['note']}")
            print()
        return 0

    if args.cmd == "eval":
        rep = evaluate.full_report(size=args.size)
        if args.json:
            print(json.dumps(rep, indent=2))
            return 0
        print(f"\n  Task metrics\n")
        for t in rep["tasks"]:
            print(f"    {t['task']:<24} {t['metric']:<10} {t['value']:.4f}")
        print(f"\n    calibration ECE       {rep['calibration']['ece']:.4f}"
              f"  (n={rep['calibration']['n']})")
        print(f"\n  Ablation — same scene, layers added in turn\n")
        print(f"    {'':<4}{'configuration':<34}{'seg F1':>8}{'router':>8}"
              f"{'x-modal':>9}{'capability':>12}{'Δ vs A':>9}")
        for r in rep["ablation"]["rows"]:
            ra = f"{r['router_accuracy']:.2f}" if r["router_accuracy"] else "—"
            xm = "yes" if r["recovered_under_cloud_pct"] is not None else "—"
            print(f"    {r['config']:<4}{r['name']:<34}{r['mean_f1']:>8.4f}{ra:>8}"
                  f"{xm:>9}{r['capability']:>12.4f}{r['delta_vs_A']:>+9.4f}")
        print(f"\n    {rep['ablation']['capability_formula']}")
        print(f"    {rep['ablation']['engine']}")
        print(f"\n    {rep['ablation']['note']}")
        rec = rep["ablation"]["rows"][-1]["recovered_under_cloud_pct"]
        if rec is not None:
            print(f"\n    structures recovered under cloud: {rec:.1f}% "
                  "(config E only — the cross-modal measurement)")
        print(f"\n  {rep['note']}\n")
        return 0

    if args.cmd == "serve":
        from .server import serve
        serve(host=args.host, port=args.port, var=args.var,
              adapters=args.adapters, build=args.build)
        return 0

    return 1


if __name__ == "__main__":
    sys.exit(main())
