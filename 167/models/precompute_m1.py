"""Produce M1's answers ahead of time, for a machine that cannot run it live.

The venue laptop has 4 GB of VRAM; a 4-bit Qwen2-VL-7B needs about 6 GB. The
specification's answer (03 §12, ML plan §5) is to pre-compute results "from the
real model" for every demonstration image, so a missing GPU degrades the demo
rather than ending it. This script is that step. It runs the *serving* code —
`satquery.runtime.M1Live`, the same class the server uses on a GPU — so a
pre-computed answer and a live answer are the same computation, done earlier.

Three sources of images, combinable:

    (always)          the built-in demo scenes, with the questions the web app
                      offers that the router sends to M1
    --vrsbench-val N  N genuine VRSBench validation photos (Google Earth imagery
                      M1 never trained on), each with ITS OWN questions and
                      ground-truth answers
    --images a b ...  any image files, with the web app's questions plus any
                      given in --questions

On Kaggle (GPU), from the repo's 167/ folder:

    python models/precompute_m1.py \\
        --adapter-dir /kaggle/working/adapters/qwen2vl_rung2/adapter \\
        --vrsbench-val 8 --data /kaggle/working/VRSBench \\
        --out /kaggle/working/real_demo/precomputed.jsonl \\
        --bundle /kaggle/working/real_demo

`--bundle` collects everything the laptop needs in one folder: the photos
themselves (the laptop must upload the *same* files — answers are keyed by
exact pixels), the answers, and `guide.md`, a presenter's sheet listing each
photo's questions with the true answer beside M1's.

On the laptop, copy precomputed.jsonl into models/adapters/m1-rs-vqa/ and:

    python models/precompute_m1.py --check models/adapters/m1-rs-vqa/precomputed.jsonl \\
        --images path/to/real_demo/images/*.png

`--check` needs no GPU. It recomputes each image's key on this machine and
reports which answers will be found. A miss is not an error: the pipeline falls
back to the classical path and says so, rather than serving an answer for a
different image.
"""

from __future__ import annotations

import argparse
import datetime as dt
import json
import random
import shutil
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(ROOT))
sys.path.insert(0, str(ROOT / "models"))

from satquery.router import Inputs, plan  # noqa: E402
from satquery.runtime import (  # noqa: E402
    AdapterPack, image_key, normalise_question, raster_rgb_u8,
)

PACK_JSON = ROOT / "models" / "adapters" / "m1-rs-vqa" / "pack.json"

# The questions the web app offers (web/src/lib/examples.ts), plus the kinds of
# question VRSBench measured M1 on. For the demo scenes and --images, only those
# the router actually sends to `rs_vqa` are kept — see `m1_questions`.
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


class Source:
    """One image and the questions to ask of it, with truth when known."""

    def __init__(self, name: str, raster, path: Path | None,
                 questions: list[tuple[str, str | None, str]]) -> None:
        self.name, self.raster, self.path = name, raster, path
        self.questions = questions            # (question, truth or None, qtype)


def m1_questions(raster, extra: list[str] = ()) -> list[str]:
    keep = []
    for q in list(CANDIDATE_QUESTIONS) + list(extra):
        p = plan(q, Inputs(optical=raster))
        if p.valid and "rs_vqa" in p.tools and q not in keep:
            keep.append(q)
    return keep


def demo_sources() -> list[Source]:
    """The optical rasters the demo shows, built by the server's own code."""
    from satquery.server import DEMO_SEED, scene_bundle

    b = scene_bundle(512, DEMO_SEED)
    out = []
    for name in ("optical", "t1", "t2"):
        r = b[name]
        out.append(Source(f"demo:{name}", r, None,
                          [(q, None, "demo") for q in m1_questions(r)]))
    return out


def file_sources(paths: list[str], extra: list[str]) -> list[Source]:
    from satquery.raster import read

    out = []
    for p in paths:
        r = read(p, sensor="optical")
        out.append(Source(Path(p).name, r, Path(p),
                          [(q, None, "asked") for q in m1_questions(r, extra)]))
    return out


def vrsbench_sources(n: int, data: str | None, seed: int) -> list[Source]:
    """N genuine validation photos with their own questions and true answers.

    Every question on the image is kept, whatever the router does with it: a
    "where is the tank?" goes to grounding, which falls back to M1 for objects
    outside its vocabulary, and that lookup must find its answer too.
    """
    from common import vrsbench
    from satquery.raster import read

    found = vrsbench.scan(vrsbench.find_root(data))
    _, files = vrsbench.choose_group(found, "val")
    files = sorted(files)
    random.Random(seed).shuffle(files)

    out = []
    for f in files:
        ann = json.loads(f.read_text(encoding="utf-8"))
        img = vrsbench._resolve_image(str(ann.get("image", "")), found.images, found.root)
        qas = [(qa["question"], str(qa["answer"]), qa.get("type", ""))
               for qa in ann.get("qa_pairs", []) if qa.get("question")]
        if img is None or not qas:
            continue
        r = read(img, sensor="optical")
        own = {q for q, _, _ in qas}
        qas += [(q, None, "general") for q in m1_questions(r) if q not in own]
        out.append(Source(img.name, r, img, qas))
        if len(out) >= n:
            break
    return out


def check(cache_path: Path, images: list[str]) -> int:
    rows = [json.loads(l) for l in cache_path.read_text(encoding="utf-8").splitlines() if l.strip()]
    by_key: dict[str, set[str]] = {}
    for r in rows:
        by_key.setdefault(r["image_key"], set()).add(normalise_question(r["question"]))
    print(f"{cache_path}: {len(rows)} pre-computed answers for {len(by_key)} images\n")
    hits = misses = 0
    for s in demo_sources() + file_sources(images, []):
        key = image_key(raster_rgb_u8(s.raster))
        have = by_key.get(key, set())
        n = len(have) if have else 0
        hits += bool(have)
        misses += not have
        print(f"  {'hit ' if have else 'MISS'}  {s.name:<28} {n} answers on file")
    print(f"\n{hits} images will be answered by M1 here; {misses} will fall back to classical.")
    return 0


def produce(adapter_dir: Path, out: Path, sources: list[Source],
            bundle: Path | None) -> int:
    from satquery.runtime import M1Live

    manifest = json.loads(PACK_JSON.read_text(encoding="utf-8"))
    pack = AdapterPack(pack_id=manifest["pack_id"], component="M1",
                       adapter=manifest["adapter"], base_model=manifest["base_model"],
                       revision=manifest.get("revision", ""), path=str(adapter_dir),
                       artefacts=sorted(p.name for p in adapter_dir.iterdir()))
    ok, why = M1Live.possible(pack)
    if not ok:
        print(f"cannot run M1 here: {why}")
        return 1

    m1 = M1Live(pack)
    stamp = dt.datetime.now(dt.timezone.utc).isoformat(timespec="seconds")
    out.parent.mkdir(parents=True, exist_ok=True)
    rows = []
    with out.open("w", encoding="utf-8") as sink:
        for s in sources:
            rgb = raster_rgb_u8(s.raster)
            key = image_key(rgb)
            for q, truth, qtype in s.questions:
                ans, conf = m1.answer(rgb, q)
                row = {"image_key": key, "question": q, "answer": ans,
                       "confidence": round(conf, 4), "image": s.name, "qtype": qtype,
                       "pack_id": pack.pack_id, "produced": stamp}
                if truth is not None:
                    row["truth"] = truth
                rows.append(row)
                sink.write(json.dumps(row, ensure_ascii=False) + "\n")
                mark = "" if truth is None else f"   truth {truth!r}"
                print(f"  {s.name:<18} {q[:50]:<52} -> {ans!r} ({conf:.2f}){mark}")
    print(f"\n{len(rows)} answers written to {out}")

    if bundle:
        write_bundle(bundle, out, sources, rows)
    print(f"Copy the answers to {PACK_JSON.parent}/precomputed.jsonl, then run --check there.")
    return 0


def write_bundle(bundle: Path, cache: Path, sources: list[Source], rows: list[dict]) -> None:
    """Photos + answers + a presenter's sheet, in one folder to download."""
    from common import metrics

    images = bundle / "images"
    images.mkdir(parents=True, exist_ok=True)
    if cache.resolve() != (bundle / "precomputed.jsonl").resolve():
        shutil.copy(cache, bundle / "precomputed.jsonl")

    lines = ["# M1 on genuine imagery — presenter's sheet", "",
             "Upload each photo in the **Optical** slot and ask its questions exactly",
             "as written. *Gate* marks answers below 0.45, which the system withholds.", ""]
    for s in sources:
        if s.path is None:
            continue
        shutil.copy(s.path, images / s.path.name)
        own = [r for r in rows if r["image"] == s.name and "truth" in r]
        if not own:
            continue
        right = sum(metrics.exact(r["answer"], r["truth"]) for r in own)
        lines += [f"## {s.path.name}  ·  M1 right on {right} of {len(own)}", "",
                  "| Question | True answer | M1 | Confidence | |", "|---|---|---|---|---|"]
        for r in own:
            ok = "✓" if metrics.exact(r["answer"], r["truth"]) else "✗"
            gate = " · gate" if r["confidence"] < 0.45 else ""
            lines.append(f"| {r['question']} | {r['truth']} | {r['answer']} | "
                         f"{r['confidence']:.2f}{gate} | {ok} |")
        lines.append("")
    (bundle / "guide.md").write_text("\n".join(lines), encoding="utf-8")
    print(f"bundle: {bundle}  (images/, precomputed.jsonl, guide.md)")


def main() -> int:
    ap = argparse.ArgumentParser(description=__doc__,
                                 formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("--adapter-dir", type=Path, help="folder with adapter_config.json + weights")
    ap.add_argument("--out", type=Path, default=Path("precomputed.jsonl"))
    ap.add_argument("--images", nargs="*", default=[], help="image files to pre-compute as well")
    ap.add_argument("--questions", type=Path, help="extra questions for --images, one per line")
    ap.add_argument("--vrsbench-val", type=int, default=0, metavar="N",
                    help="N genuine VRSBench validation photos with their own questions")
    ap.add_argument("--data", default=None, help="VRSBench root (for --vrsbench-val)")
    ap.add_argument("--seed", type=int, default=0)
    ap.add_argument("--bundle", type=Path, help="folder to collect photos, answers and guide.md")
    ap.add_argument("--check", type=Path, help="report which answers this machine will find")
    args = ap.parse_args()

    if args.check:
        return check(args.check, args.images)
    if not args.adapter_dir:
        ap.error("--adapter-dir is required unless --check is given")

    extra = []
    if args.questions:
        extra = [l.strip() for l in args.questions.read_text(encoding="utf-8").splitlines() if l.strip()]
    sources = (demo_sources()
               + vrsbench_sources(args.vrsbench_val, args.data, args.seed)
               + file_sources(args.images, extra))
    return produce(args.adapter_dir, args.out, sources, args.bundle)


if __name__ == "__main__":
    raise SystemExit(main())
