"""Parity gate (doc 12, §8.1): does the deployed runtime give the answers M1 gave on Kaggle?

    python deploy/parity.py --url https://<workspace>--satquery-runtime-web.modal.run \\
        --data /path/to/VRSBench

Re-asks the questions recorded in models/results/m1_calibration.jsonl — the same
seeded, ordered items `models/calibrate_m1.py` used — on their images, through
the deployed `/infer`, and compares each answer with the recorded one. Modal
proxy-auth comes from SATQUERY_RUNTIME_KEY / SATQUERY_RUNTIME_SECRET.

Passes at >= 299/300 identical answers. Every difference is printed: decide each
one before accepting the deployment (a changed answer on a changed stack is the
risk P1-4 exists for).
"""

from __future__ import annotations

import argparse
import json
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(ROOT))
sys.path.insert(0, str(ROOT / "models"))

PASS_AT = 299


def compare(recorded: list[dict], got: dict[str, tuple[str, float]]) -> tuple[int, list[str]]:
    """(identical answers, one line per difference). Missing answers are differences."""
    same, diffs = 0, []
    for r in recorded:
        a = got.get(r["uid"])
        if a is not None and a[0] == r["answer"]:
            same += 1
        else:
            diffs.append(f"{r['uid']}  {r['question']!r}  recorded {r['answer']!r} "
                         f"({r['confidence']})  deployed {a[0]!r} ({a[1]})" if a else
                         f"{r['uid']}  {r['question']!r}  recorded {r['answer']!r}  deployed: no answer")
    return same, diffs


def main() -> int:
    ap = argparse.ArgumentParser(description=__doc__,
                                 formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("--url", required=True, help="the runtime's base URL")
    ap.add_argument("--data", default=None, help="VRSBench root (as for models/calibrate_m1.py)")
    ap.add_argument("--recorded", type=Path, default=ROOT / "models" / "results" / "m1_calibration.jsonl")
    ap.add_argument("--seed", type=int, default=0)
    ap.add_argument("--timeout", type=float, default=600.0, help="per request; the first may be a cold start")
    args = ap.parse_args()

    import numpy as np
    from PIL import Image
    from common import vrsbench
    from satquery.errors import SatQueryError
    from satquery.runtime import HttpRuntime, image_key

    recorded = [json.loads(l) for l in args.recorded.read_text(encoding="utf-8").splitlines() if l.strip()]
    items = {it.uid: it for it in vrsbench.load_vqa(vrsbench.find_root(args.data),
                                                     limit=len(recorded), split="val", seed=args.seed)}
    missing = [r["uid"] for r in recorded if r["uid"] not in items]
    if missing:
        print(f"  {len(missing)} recorded questions are not in this VRSBench copy (first: {missing[0]}); "
              f"the run would not compare like with like")
        return 2

    remote = HttpRuntime(args.url, timeout=args.timeout)
    got: dict[str, tuple[str, float]] = {}
    for i, r in enumerate(recorded, 1):
        rgb = np.asarray(Image.open(items[r["uid"]].image).convert("RGB"), dtype=np.uint8)
        try:
            out = remote.infer("adapter_A_rs_general", "vqa",
                               {"question": r["question"], "image_key": image_key(rgb), "_rgb_u8": rgb})
        except SatQueryError as exc:
            print(f"  [{i}] {r['uid']}: {exc.code}: {exc.message}")
            continue
        if out.get("source") != "live":
            print(f"  [{i}] {r['uid']}: answered {out.get('source')!r}, not live — this is not a parity run")
            return 2
        got[r["uid"]] = (out["answer"], out["confidence"])
        if i % 25 == 0:
            print(f"  [{i}/{len(recorded)}] identical so far: {compare(recorded[:i], got)[0]}", flush=True)

    same, diffs = compare(recorded, got)
    for d in diffs:
        print("  DIFF", d)
    print(f"\n  {same}/{len(recorded)} identical  ·  need {PASS_AT}  ·  "
          f"{'PASS' if same >= PASS_AT else 'FAIL — do not continue the deployment'}")
    return 0 if same >= PASS_AT else 1


if __name__ == "__main__":
    raise SystemExit(main())
