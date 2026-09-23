"""How often is M1 right at a given confidence? Measure it; don't assume it.

The pipeline gates every evidence record at 0.45. That threshold was chosen for
the classical specialists, whose confidence comes from how cleanly a threshold
splits an index. M1's confidence is a different quantity — the geometric mean
probability of the tokens it generated — and it runs lower on longer answers by
construction. Applying one scale's cut-off to another is a guess.

On 10 VRSBench validation images the pipeline answered 30 of 38 questions and
was right on 23 of them (77 %), while five M1 answers were gated out unseen.
Whether the gate removed mostly wrong answers or discarded right ones is the
question this script answers.

On Kaggle (GPU), from the repo's 167/ folder:

    python models/calibrate_m1.py \\
        --adapter-dir /kaggle/working/adapters/qwen2vl_rung2/adapter \\
        --data /kaggle/working/VRSBench --limit 300 \\
        --out /kaggle/working/m1_calibration.jsonl

It asks M1 directly (no router, no gate) and writes one row per question:
question, truth, answer, confidence, correct. It then prints accuracy by
confidence band and, for each candidate gate, how many questions M1 would answer
and how often it would be right. Choose the gate from that table, and record
both the table and the choice in models/MANIFEST.md.

Items are the same seeded shuffle of Annotations_val as eval_baseline.py, so the
figures are comparable with the reported 0.660.
"""

from __future__ import annotations

import argparse
import json
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(ROOT))
sys.path.insert(0, str(ROOT / "models"))

from common import metrics, vrsbench  # noqa: E402


def table(rows: list[dict]) -> None:
    n = len(rows)
    print(f"\n  {n} questions · M1 alone, every answer kept: "
          f"{sum(r['correct'] for r in rows) / n:.3f}\n")
    print("  confidence band   n     accuracy")
    edges = [0.0, 0.2, 0.3, 0.4, 0.5, 0.6, 0.7, 0.8, 0.9, 1.01]
    for lo, hi in zip(edges, edges[1:]):
        band = [r for r in rows if lo <= r["confidence"] < hi]
        if band:
            acc = sum(r["correct"] for r in band) / len(band)
            print(f"  {lo:.1f} - {min(hi, 1.0):.1f}        {len(band):>4}   {acc:.3f}")
    print("\n  gate   answered   coverage   right when answered   right overall")
    for g in (0.0, 0.2, 0.3, 0.35, 0.4, 0.45, 0.5, 0.6):
        kept = [r for r in rows if r["confidence"] >= g]
        right = sum(r["correct"] for r in kept)
        sel = right / len(kept) if kept else 0.0
        print(f"  {g:.2f}   {len(kept):>8}   {len(kept) / n:>8.1%}   "
              f"{sel:>19.3f}   {right / n:>13.3f}")


def main() -> int:
    ap = argparse.ArgumentParser(description=__doc__,
                                 formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("--adapter-dir", type=Path)
    ap.add_argument("--data", default=None, help="VRSBench root")
    ap.add_argument("--limit", type=int, default=300)
    ap.add_argument("--seed", type=int, default=0)
    ap.add_argument("--out", type=Path, default=Path("m1_calibration.jsonl"))
    ap.add_argument("--report", type=Path, help="print the table for an existing JSONL and stop")
    args = ap.parse_args()

    if args.report:
        table([json.loads(l) for l in args.report.read_text(encoding="utf-8").splitlines() if l.strip()])
        return 0
    if not args.adapter_dir:
        ap.error("--adapter-dir is required unless --report is given")

    from PIL import Image
    import numpy as np
    from satquery.runtime import AdapterPack, M1Live

    manifest = json.loads((ROOT / "models" / "adapters" / "m1-rs-vqa" / "pack.json").read_text())
    pack = AdapterPack(pack_id=manifest["pack_id"], component="M1", adapter=manifest["adapter"],
                       base_model=manifest["base_model"], revision=manifest.get("revision", ""),
                       path=str(args.adapter_dir),
                       artefacts=sorted(p.name for p in args.adapter_dir.iterdir()))
    ok, why = M1Live.possible(pack)
    if not ok:
        print(f"cannot run M1 here: {why}")
        return 1
    m1 = M1Live(pack)

    items = vrsbench.load_vqa(vrsbench.find_root(args.data), limit=args.limit,
                              split="val", seed=args.seed)
    rows = []
    with args.out.open("w", encoding="utf-8") as sink:
        for i, it in enumerate(items, 1):
            rgb = np.asarray(Image.open(it.image).convert("RGB"), dtype=np.uint8)
            ans, conf = m1.answer(rgb, it.question)
            row = {"uid": it.uid, "qtype": it.qtype, "question": it.question,
                   "truth": it.answer, "answer": ans, "confidence": round(conf, 4),
                   "correct": metrics.exact(ans, it.answer)}
            rows.append(row)
            sink.write(json.dumps(row, ensure_ascii=False) + "\n")
            if i % 25 == 0:
                print(f"  [{i}/{len(items)}] running accuracy "
                      f"{sum(r['correct'] for r in rows) / len(rows):.3f}")
    table(rows)
    print(f"\n  rows: {args.out}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
