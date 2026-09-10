"""Acceptance criteria, executable (PRD 19).

`python3 -m darktransit.cli selftest` runs these. They are the criteria from
the PRD, not a proxy for them -- in particular the dual-use safeguards of PRD 16
are enforced here rather than asserted in prose.
"""

from __future__ import annotations

import json
import re
from pathlib import Path

from . import incident, pipeline

WEB = Path(__file__).resolve().parent.parent / "web"

_results = []


def check(name, ok, detail=""):
    _results.append((name, bool(ok), detail))
    print(f"  {'PASS' if ok else 'FAIL'}  {name}" + (f"  -- {detail}" if detail else ""))
    return ok


def run_all(out_root="runs"):
    global _results
    _results = []
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
