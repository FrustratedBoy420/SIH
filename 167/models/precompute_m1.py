"""Produce M1's answers ahead of time, for a machine that cannot run it live.

The venue laptop has 4 GB of VRAM; a 4-bit Qwen2-VL-7B needs about 6 GB. The
specification's answer (03 §12, ML plan §5) is to pre-compute results "from the
real model" for every demonstration image, so a missing GPU degrades the demo
rather than ending it. This script is that step. It runs the *serving* code —
`satquery.runtime.M1Live`, the same class the server uses on a GPU — so a
pre-computed answer and a live answer are the same computation, done earlier.

Run it on Kaggle, where the GPU is:

    python models/precompute_m1.py \\
        --adapter-dir /kaggle/working/adapters/qwen2vl_rung2/adapter \\
        --out /kaggle/working/precomputed.jsonl

    # optionally, the GeoTIFFs you intend to demonstrate with, too
    python models/precompute_m1.py --adapter-dir ... --out ... \\
        --images demo/cartosat_a.tif demo/cartosat_b.tif

Then, on the laptop, copy the file beside the pack and check it:

    copy precomputed.jsonl models/adapters/m1-rs-vqa/
    python models/precompute_m1.py --check models/adapters/m1-rs-vqa/precomputed.jsonl

`--check` needs no GPU. It recomputes, on this machine, the key of every image
the demo shows, and reports which answers will be found. A key is a hash of the
exact pixels M1 sees; if this machine renders a scene one grey level
differently, that answer misses — and the pipeline falls back to the classical
path and says so, rather than serving an answer for a different image.
"""

from __future__ import annotations

import argparse
import datetime as dt
import json
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(ROOT))

from satquery.router import Inputs, plan  # noqa: E402
from satquery.runtime import (  # noqa: E402
    AdapterPack, image_key, normalise_question, raster_rgb_u8,
)

PACK_JSON = ROOT / "models" / "adapters" / "m1-rs-vqa" / "pack.json"

# The questions the web app offers (web/src/lib/examples.ts), plus the kinds of
# question VRSBench measured M1 on. Only those the router actually sends to
# `rs_vqa` with a single optical image are kept — see `m1_questions`.
CANDIDATE_QUESTIONS = [
    "Describe the land-cover and major objects visible in this image.",
    "How many built-up areas are visible?",
    "How much vegetation is there?",
    "Where is the bare soil?",
    "What type of area is shown in this image?",
    "What is the main structure visible in the image?",
    "Is this a rural or urban area?",
    "Is there a water body in this image?",
    "Are there any residential areas visible?",
    "Is there a road in this image?",
    "What is the dominant land cover?",
    "Are there any buildings in this image?",
]


def demo_images() -> list[tuple[str, object]]:
    """The optical rasters the demo shows, built by the server's own code."""
    from satquery.server import DEMO_SEED, scene_bundle

    b = scene_bundle(512, DEMO_SEED)
    return [("demo:optical", b["optical"]),
            ("demo:t1", b["t1"]), ("demo:t2", b["t2"])]


def m1_questions(raster) -> list[str]:
    keep = []
    for q in CANDIDATE_QUESTIONS:
        p = plan(q, Inputs(optical=raster))
        if p.valid and "rs_vqa" in p.tools:
            keep.append(q)
    return keep


def load_images(paths: list[str]) -> list[tuple[str, object]]:
    from satquery.raster import read

    return [(Path(p).name, read(p, sensor="optical")) for p in paths]


def check(cache_path: Path) -> int:
    rows = [json.loads(l) for l in cache_path.read_text(encoding="utf-8").splitlines() if l.strip()]
    have = {(r["image_key"], normalise_question(r["question"])) for r in rows}
    print(f"{cache_path}: {len(rows)} pre-computed answers")
    hits = misses = 0
    for name, raster in demo_images():
        key = image_key(raster_rgb_u8(raster))
        for q in m1_questions(raster):
            found = (key, normalise_question(q)) in have
            hits += found
            misses += not found
            print(f"  {'hit ' if found else 'MISS'}  {name:<14} {q}")
    print(f"\n{hits} will be answered by M1 here; {misses} will fall back to classical.")
    if misses and not hits:
        print("No demo image matched. This machine renders the scenes differently "
              "from the one that produced the cache; re-run precompute on the same "
              "code and library versions, or pre-compute the GeoTIFFs you will "
              "actually upload (--images).")
    return 0


def produce(adapter_dir: Path, out: Path, images: list[str]) -> int:
    from satquery.runtime import M1Live

    manifest = json.loads(PACK_JSON.read_text(encoding="utf-8"))
    artefacts = sorted(p.name for p in adapter_dir.iterdir())
    pack = AdapterPack(pack_id=manifest["pack_id"], component="M1",
                       adapter=manifest["adapter"], base_model=manifest["base_model"],
                       revision=manifest.get("revision", ""), path=str(adapter_dir),
                       artefacts=artefacts)
    ok, why = M1Live.possible(pack)
    if not ok:
        print(f"cannot run M1 here: {why}")
        return 1

    m1 = M1Live(pack)
    sources = demo_images() + load_images(images)
    stamp = dt.datetime.now(dt.timezone.utc).isoformat(timespec="seconds")
    n = 0
    with out.open("w", encoding="utf-8") as sink:
        for name, raster in sources:
            rgb = raster_rgb_u8(raster)
            key = image_key(rgb)
            for q in m1_questions(raster):
                ans, conf = m1.answer(rgb, q)
                sink.write(json.dumps({
                    "image_key": key, "question": q, "answer": ans,
                    "confidence": round(conf, 4), "image": name,
                    "pack_id": pack.pack_id, "produced": stamp,
                }) + "\n")
                n += 1
                print(f"  {name:<14} {q[:52]:<54} -> {ans!r} ({conf:.2f})")
    print(f"\n{n} answers written to {out}")
    print(f"Copy it to {PACK_JSON.parent}/precomputed.jsonl, then run --check there.")
    return 0


def main() -> int:
    ap = argparse.ArgumentParser(description=__doc__,
                                 formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("--adapter-dir", type=Path, help="folder with adapter_config.json + weights")
    ap.add_argument("--out", type=Path, default=Path("precomputed.jsonl"))
    ap.add_argument("--images", nargs="*", default=[], help="GeoTIFFs to pre-compute as well")
    ap.add_argument("--check", type=Path, help="report which demo answers this machine will find")
    args = ap.parse_args()

    if args.check:
        return check(args.check)
    if not args.adapter_dir:
        ap.error("--adapter-dir is required unless --check is given")
    return produce(args.adapter_dir, args.out, args.images)


if __name__ == "__main__":
    raise SystemExit(main())
