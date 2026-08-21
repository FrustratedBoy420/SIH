"""SAAKSHYA end-to-end demo runner.

Loads the demo district, runs KAAL -> NYAYA -> Dossier for every rejected claim,
writes dossiers to out/, and prints a summary table.

Offline (uses mock KAAL):
    .venv/bin/python run_demo.py
    .venv/bin/python run_demo.py FRA-DND-0007        # single claim

To use REAL Earth Engine, set up spike/01_kaal_gee.py and change the import below.
"""
from __future__ import annotations
import json
import sys
from pathlib import Path

ROOT = Path(__file__).parent
sys.path.insert(0, str(ROOT / "src"))

from kaal.mock import mock_kaal                # swap -> spike.kaal_gee.kaal_gee for real
from nyaya.engine import match_evidence
from dossier.generate import build_dossier


def main():
    data = json.loads((ROOT / "data" / "demo_district.json").read_text())
    vmap = {v["lgd_code"]: v for v in data["villages"]}
    only = sys.argv[1] if len(sys.argv) > 1 else None

    claims = [c for c in data["claims"] if c.get("rejection_order")]
    if only:
        claims = [c for c in data["claims"] if c["claim_id"] == only]

    print(f"\n{'CLAIM':16} {'CAT':5} {'REASON':22} {'CONV':5} {'CONF':5} VERDICT")
    print("-" * 84)
    rows = []
    for c in claims:
        c["_village"] = vmap.get(c["village_lgd"], {}).get("name", c["village_lgd"])
        c["_district"] = data["district"]["name"]
        k = mock_kaal(c)
        m = match_evidence(c, k)
        paths = build_dossier(c, k, m, ROOT / "out")
        cy = k["conversion_year"]
        print(f"{c['claim_id']:16} {c['claimant_category']:5} "
              f"{m['reason_category']:22} {cy!s:5} {k['confidence']:<5} {m['verdict']}")
        rows.append({"claim": c["claim_id"], "verdict": m["verdict"], **paths})

    print("-" * 84)
    print(f"{len(rows)} dossiers written to {ROOT/'out'}\n")
    (ROOT / "out" / "summary.json").write_text(json.dumps(rows, indent=2))


if __name__ == "__main__":
    main()
