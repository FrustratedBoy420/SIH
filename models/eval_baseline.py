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

    # 4. the other candidate, same command, different base
    python models/eval_baseline.py --base geochat --limit 2000 --load-in-4bit

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

def load_model(model_id: str, dtype: str, load_in_4bit: bool):
    """Load a vision-language model for inference, nothing trainable.

    `device_map="auto"` lets accelerate spill layers to CPU RAM when VRAM runs
    out. On a 4 GB laptop GPU that is the difference between running slowly and
    not running; on a 16 GB T4 it changes nothing.
    """
    import torch
    from transformers import AutoModelForVision2Seq, AutoProcessor

    torch_dtype = {"fp16": torch.float16, "bf16": torch.bfloat16, "fp32": torch.float32}[dtype]

    kwargs: dict = {"torch_dtype": torch_dtype, "device_map": "auto"}

    if load_in_4bit:
        from transformers import BitsAndBytesConfig

        kwargs["quantization_config"] = BitsAndBytesConfig(
            load_in_4bit=True,
            bnb_4bit_compute_dtype=torch_dtype,
            bnb_4bit_quant_type="nf4",
            bnb_4bit_use_double_quant=True,
        )

    print(f"loading {model_id}  (dtype={dtype}, 4bit={load_in_4bit})")
    processor = AutoProcessor.from_pretrained(model_id, trust_remote_code=True)
    model = AutoModelForVision2Seq.from_pretrained(model_id, trust_remote_code=True, **kwargs)
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
    parser.add_argument("--limit", type=int, default=None, help="evaluate only the first N items")
    parser.add_argument("--out", default=None, help="output directory")
    parser.add_argument("--dtype", default=config.DEFAULT_DTYPE, choices=["fp16", "bf16", "fp32"])
    parser.add_argument("--load-in-4bit", action="store_true", help="QLoRA-style 4-bit weights")
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

    tag = args.base.replace("/", "_")
    jsonl_path = out_dir / f"{tag}_predictions.jsonl"
    summary_path = out_dir / f"{tag}_summary.json"

    items = vrsbench.load_vqa(
        root,
        json_path=Path(args.json) if args.json else None,
        limit=args.limit,
    )
    if not items:
        print("nothing to evaluate")
        return 1

    done = load_done(jsonl_path) if args.resume else {}
    if done:
        print(f"resuming: {len(done):,} items already scored")

    model, processor = load_model(model_id, args.dtype, args.load_in_4bit)

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
        "adapter": None,
        "condition": "zero-shot",
        "dataset": "VRSBench VQA",
        "dataset_root": str(root),
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
    print(
        "\n  This is the BEFORE number. Put it in models/MANIFEST.md now,\n"
        "  while it is measured rather than remembered. The adapted run goes\n"
        "  in the column beside it, and the gain between them is what\n"
        "  requirement 1 is evidenced by."
    )
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
