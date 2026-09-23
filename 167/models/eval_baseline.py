"""Measure the UNADAPTED base model on VRSBench VQA.

This is the "before" number, and it is the reason the whole file exists.

Problem statement requirement 1 asks for evidence of remote-sensing adaptation.
An adapted model reporting 58 % evidences nothing on its own — 58 % of what?
The evidence is the gain:

    zero-shot   41 %
    adapted     58 %
    gain       +17 points

`docs/10_Decision_Record.md` section 8 makes this the gate the schedule turns
on, because it is the one measurement that needs no training and almost no GPU
quota. Run it first. Record it in `models/MANIFEST.md`. Then train.

Usage
-----
    # 1. look at what the download actually contains (do this once)
    python models/eval_baseline.py --inspect

    # 2. smoke test — 20 items, confirms the whole path works
    python models/eval_baseline.py --limit 20 --load-in-4bit

    # 3. the real run
    python models/eval_baseline.py --base qwen2vl --limit 2000 --load-in-4bit

    # 4. the SAME command plus a trained pack — this is the "after" number
    python models/eval_baseline.py --limit 2000 --load-in-4bit \
        --adapter /kaggle/working/adapters/qwen2vl_rs_vqa/adapter

The adapted run must use the same --limit, --split and --seed as the baseline.
Change any of them and the difference between the two numbers stops being the
adaptation and starts being the subset.

Results append to a JSONL as they are produced, so a killed Kaggle session
resumes with `--resume` instead of starting over.
"""

from __future__ import annotations

import argparse
import json
import sys
import time
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))

from common import config, metrics, vrsbench  # noqa: E402


# --------------------------------------------------------------------------
# Model
# --------------------------------------------------------------------------

def auto_model_class():
    """The auto-class for image+text models, whatever this transformers calls it.

    Renamed across major versions: `AutoModelForVision2Seq` through 4.x,
    `AutoModelForImageTextToText` from 4.47 and the only one left in 5.x. Kaggle
    upgrades its image without warning, so both names are probed rather than
    pinned — a hard import here fails the run before a single item is scored.
    """
    import transformers

    for name in ("AutoModelForImageTextToText", "AutoModelForVision2Seq"):
        cls = getattr(transformers, name, None)
        if cls is not None:
            return cls, name

    raise ImportError(
        f"transformers {transformers.__version__} exposes neither "
        "AutoModelForImageTextToText nor AutoModelForVision2Seq. "
        "Install a supported release: pip install -U 'transformers>=4.47'"
    )


def load_model(model_id: str, dtype: str, load_in_4bit: bool, adapter: str | None = None):
    """Load a vision-language model for inference, nothing trainable.

    `device_map="auto"` lets accelerate spill layers to CPU RAM when VRAM runs
    out. On a 4 GB laptop GPU that is the difference between running slowly and
    not running; on a 16 GB T4 it changes nothing.
    """
    import torch
    import transformers
    from transformers import AutoProcessor

    model_cls, cls_name = auto_model_class()
    torch_dtype = {"fp16": torch.float16, "bf16": torch.bfloat16, "fp32": torch.float32}[dtype]

    kwargs: dict = {"device_map": "auto"}

    if load_in_4bit:
        from transformers import BitsAndBytesConfig

        kwargs["quantization_config"] = BitsAndBytesConfig(
            load_in_4bit=True,
            bnb_4bit_compute_dtype=torch_dtype,
            bnb_4bit_quant_type="nf4",
            bnb_4bit_use_double_quant=True,
        )

    print(f"transformers {transformers.__version__}, using {cls_name}")
    print(f"loading {model_id}  (dtype={dtype}, 4bit={load_in_4bit})")

    processor = AutoProcessor.from_pretrained(model_id, trust_remote_code=True)

    # `torch_dtype` was renamed to `dtype` in transformers 5. Try the current
    # spelling, fall back to the old one rather than guessing from a version
    # string — the argument name is the fact, the version is a proxy for it.
    try:
        try:
            model = model_cls.from_pretrained(
                model_id, trust_remote_code=True, dtype=torch_dtype, **kwargs
            )
        except TypeError:
            model = model_cls.from_pretrained(
                model_id, trust_remote_code=True, torch_dtype=torch_dtype, **kwargs
            )
    except ValueError as exc:
        if "does not recognize this architecture" not in str(exc):
            raise
        raise SystemExit(
            f"\n  {model_id} declares an architecture this transformers "
            f"({transformers.__version__}) does not implement, and the "
            "checkpoint ships no remote code to supply it.\n\n"
            "  This is a property of the candidate, not of the harness: a base "
            "that will not load here cannot be shipped as part of the "
            "deliverable either. Measuring it needs its own pinned "
            "environment.\n\n"
            "  See the note beside BASES in models/common/config.py.\n"
        ) from exc

    if adapter:
        # The same base weights, plus the trained pack. Measuring the adapted
        # model through this identical path is the whole point: if the loader,
        # the prompt or the scoring differed between the two runs, the
        # difference between them would not be the adaptation.
        from peft import PeftModel

        print(f"applying adapter {adapter}")
        model = PeftModel.from_pretrained(model, adapter)

    model.eval()
    return model, processor


def build_prompt(processor, question: str) -> str:
    """Wrap the question in whatever conversation format this model expects.

    Chat-tuned models ignore a bare question and answer the template instead.
    Most modern processors carry their own template; the fallback is the
    LLaVA-1.5 format, which is what GeoChat inherits.
    """
    text = f"{question}\n{config.SHORT_ANSWER_SUFFIX}"

    if getattr(processor, "chat_template", None) or hasattr(processor, "apply_chat_template"):
        try:
            messages = [
                {
                    "role": "user",
                    "content": [{"type": "image"}, {"type": "text", "text": text}],
                }
            ]
            return processor.apply_chat_template(
                messages, tokenize=False, add_generation_prompt=True
            )
        except Exception:
            pass

    return f"USER: <image>\n{text}\nASSISTANT:"


def answer(model, processor, image_path: Path, question: str, max_new_tokens: int) -> str:
    import torch
    from PIL import Image

    image = Image.open(image_path).convert("RGB")
    prompt = build_prompt(processor, question)
    inputs = processor(text=[prompt], images=[image], return_tensors="pt").to(model.device)

    with torch.inference_mode():
        generated = model.generate(
            **inputs,
            max_new_tokens=max_new_tokens,
            do_sample=False,          # greedy: a baseline must be reproducible
        )

    # Decode only what was generated, not the echoed prompt.
    prompt_length = inputs["input_ids"].shape[1]
    new_tokens = generated[0][prompt_length:]
    return processor.decode(new_tokens, skip_special_tokens=True).strip()


# --------------------------------------------------------------------------
# Run
# --------------------------------------------------------------------------

def load_done(path: Path) -> dict[str, dict]:
    """Every result already written, so a resumed run does not redo work."""
    if not path.exists():
        return {}
    done = {}
    for line in path.read_text(encoding="utf-8").splitlines():
        if line.strip():
            try:
                row = json.loads(line)
                done[row["uid"]] = row
            except json.JSONDecodeError:
                continue          # a half-written final line after a hard kill
    return done


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    parser.add_argument("--base", default=config.DEFAULT_BASE,
                        help=f"one of {list(config.BASES)}, or a HuggingFace id")
    parser.add_argument("--data", default=None, help="VRSBench root (default: HF cache)")
    parser.add_argument("--json", default=None, help="specific VQA json (default: auto-detect)")
    parser.add_argument("--limit", type=int, default=None, help="evaluate only N items")
    parser.add_argument("--split", default="auto",
                        help="annotation folder to read: auto (prefers val), train, val, test")
    parser.add_argument("--seed", type=int, default=0,
                        help="shuffle seed for subset selection — keep it fixed across runs")
    parser.add_argument("--out", default=None, help="output directory")
    parser.add_argument("--dtype", default=config.DEFAULT_DTYPE, choices=["fp16", "bf16", "fp32"])
    parser.add_argument("--load-in-4bit", action="store_true", help="QLoRA-style 4-bit weights")
    parser.add_argument("--adapter", default=None,
                        help="trained LoRA pack to apply — omit for the zero-shot baseline")
    parser.add_argument("--max-new-tokens", type=int, default=32)
    parser.add_argument("--resume", action="store_true", help="skip items already in the JSONL")
    parser.add_argument("--inspect", action="store_true", help="print dataset layout and exit")
    parser.add_argument("--every", type=int, default=25, help="progress line interval")
    args = parser.parse_args()

    root = vrsbench.find_root(args.data)

    if args.inspect:
        vrsbench.inspect(root)
        return 0

    model_id = config.BASES.get(args.base, args.base)
    out_dir = Path(args.out) if args.out else config.default_out_dir()
    out_dir.mkdir(parents=True, exist_ok=True)

    # Adapted results never overwrite the baseline they are compared against.
    tag = args.base.replace("/", "_")
    if args.adapter:
        tag += "_adapted_" + Path(args.adapter).parent.name
    jsonl_path = out_dir / f"{tag}_predictions.jsonl"
    summary_path = out_dir / f"{tag}_summary.json"

    items = vrsbench.load_vqa(
        root,
        json_path=Path(args.json) if args.json else None,
        limit=args.limit,
        split=args.split,
        seed=args.seed,
    )
    if not items:
        print("nothing to evaluate")
        return 1

    done = load_done(jsonl_path) if args.resume else {}
    if done:
        print(f"resuming: {len(done):,} items already scored")

    model, processor = load_model(model_id, args.dtype, args.load_in_4bit, args.adapter)

    score = metrics.Score()
    for row in done.values():
        score.add(row["prediction"], row["truth"], row.get("qtype", "unspecified"))

    started = time.time()
    latencies: list[float] = []

    with jsonl_path.open("a", encoding="utf-8") as sink:
        for index, item in enumerate(items, 1):
            if item.uid in done:
                continue

            tick = time.time()
            try:
                prediction = answer(model, processor, item.image, item.question, args.max_new_tokens)
            except Exception as exc:
                print(f"  [{index}] failed on {item.image.name}: {exc}")
                prediction = ""
            elapsed = time.time() - tick
            latencies.append(elapsed)

            hit = score.add(prediction, item.answer, item.qtype)
            sink.write(json.dumps({
                "uid": item.uid,
                "image": item.image.name,
                "question": item.question,
                "truth": item.answer,
                "prediction": prediction,
                "qtype": item.qtype,
                "correct": hit,
                "seconds": round(elapsed, 3),
            }, ensure_ascii=False) + "\n")
            sink.flush()          # a killed session keeps everything up to here

            if index % args.every == 0:
                rate = sum(latencies) / len(latencies)
                remaining = (len(items) - index) * rate / 60
                print(f"  [{index:,}/{len(items):,}] acc={score.accuracy:.4f} "
                      f"{rate:.1f}s/item  ~{remaining:.0f} min left")

    wall = time.time() - started
    summary = {
        "model": model_id,
        "base_key": args.base,
        "adapter": args.adapter,
        "condition": "adapted" if args.adapter else "zero-shot",
        "dataset": "VRSBench VQA",
        "dataset_root": str(root),
        "split": args.split,
        "seed": args.seed,
        "limit": args.limit,
        "dtype": args.dtype,
        "load_in_4bit": args.load_in_4bit,
        "wall_seconds": round(wall, 1),
        "latency_p50": round(sorted(latencies)[len(latencies) // 2], 3) if latencies else None,
        **score.as_dict(),
    }
    summary_path.write_text(json.dumps(summary, indent=2), encoding="utf-8")

    print(metrics.report(score, config.ANCHORS["vrsbench_vqa"]))
    print(f"\n  predictions  {jsonl_path}")
    print(f"  summary      {summary_path}")
    # The closing note used to say "This is the BEFORE number" on every run,
    # adapted ones included — a label contradicting the `--adapter` two lines
    # up. Which side of the comparison a number is on is the whole point of
    # the comparison, so the note says the side it is on.
    if args.adapter:
        print(
            "\n  This is an AFTER number — adapted, with the pack above. It is\n"
            "  only evidence beside the zero-shot run on the same --limit,\n"
            "  --split and --seed; record both, and the gain between them, in\n"
            "  models/MANIFEST.md."
        )
    else:
        print(
            "\n  This is the BEFORE number. Put it in models/MANIFEST.md now,\n"
            "  while it is measured rather than remembered. The adapted run goes\n"
            "  in the column beside it, and the gain between them is what\n"
            "  requirement 1 is evidenced by."
        )
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
