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


def cmd_serve(a):
    server.serve(a.out, a.port)


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

    v = sub.add_parser("serve", help="serve the workstation and the narrative view")
    v.add_argument("--port", type=int, default=8000)
    v.set_defaults(fn=cmd_serve)

    a = ap.parse_args(argv)
    a.fn(a)


if __name__ == "__main__":
    main()
