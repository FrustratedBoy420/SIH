"""M1 — QLoRA adaptation of the base VLM on VRSBench VQA.

This is the component the problem statement makes compulsory:

    "At least one visual or vision-language component must be fine-tuned or
     otherwise adapted using BigEarthNet.txt or the any open source training
     data."

What is trained is a LoRA adapter, 20-80 MB. The 7B base underneath is frozen
and quantised to 4 bit. `docs/03_Model_Specification.md` section 4 is the
contract; the deviations from it are deliberate and are noted where they occur.

Measured starting point (models/MANIFEST.md): Qwen2-VL-7B-Instruct scores
0.5270 exact-match zero-shot on 2,000 held-out VRSBench VQA items. The errors
are overwhelmingly vocabulary rather than perception -- `ground-track-field`
answered as "Stadium", `small-vehicle` as "Car", image-relative `Top` answered
as "North". Teaching the dataset's vocabulary is what this run is for, and it
is the cheap half of adaptation.

Train and evaluation splits
---------------------------
Training reads `Annotations_train/`; `eval_baseline.py` reads
`Annotations_val/`. That is VRSBench's own published split, which section 10 of
the specification requires: where a benchmark publishes a split, use it, because
deviating invalidates every comparison drawn against published numbers.

The data ladder
---------------
Section 4 says climb, do not leap. A T4 runs roughly 1.0-1.5 s per sample with
4-bit weights and gradient checkpointing, so the budget is samples, not epochs:

    rung 1   --limit 4000  --epochs 1    ~1.5 h   does a gain appear at all?
    rung 2   --limit 12000 --epochs 2    ~8 h     fits ONE Kaggle session
    rung 3   more, and only while the curve is still rising

Run rung 1 first and evaluate it. A run that produces no gain at 4,000 samples
will not produce one at 40,000 either, and finding that out costs 1.5 hours
rather than a weekly quota.

Usage
-----
    python models/train_rs_vqa.py --data /kaggle/working/VRSBench \\
        --limit 4000 --epochs 1

    # after a session timeout, the same command:
    python models/train_rs_vqa.py --data /kaggle/working/VRSBench \\
        --limit 4000 --epochs 1 --resume

    # then measure it
    python models/eval_baseline.py --data /kaggle/working/VRSBench \\
        --limit 2000 --load-in-4bit --adapter /kaggle/working/adapters/<run>
"""

from __future__ import annotations

import argparse
import json
import sys
import time
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))

from common import config, vrsbench  # noqa: E402


# --------------------------------------------------------------------------
# Data
# --------------------------------------------------------------------------

class VQADataset:
    """VRSBench QA pairs as (image, question, answer), nothing more.

    Tokenisation happens in the collator rather than here: the processor
    expands an image into several hundred visual tokens, and doing that once
    per epoch in a worker is cheaper to reason about than caching it.
    """

    def __init__(self, items) -> None:
        self.items = items

    def __len__(self) -> int:
        return len(self.items)

    def __getitem__(self, index: int):
        item = self.items[index]
        return {
            "image": str(item.image),
            "question": item.question,
            "answer": item.answer,
        }


class Collator:
    """Build one training example: prompt masked out, answer supervised.

    Only the answer tokens carry a loss. Supervising the prompt as well teaches
    the model to reproduce the question, which is both useless and a quiet way
    to waste a training budget.
    """

    def __init__(self, processor) -> None:
        self.processor = processor

    def _chat(self, question: str, answer: str | None):
        content = [
            {"type": "image"},
            {"type": "text", "text": f"{question}\n{config.SHORT_ANSWER_SUFFIX}"},
        ]
        messages = [{"role": "user", "content": content}]
        if answer is None:
            return self.processor.apply_chat_template(
                messages, tokenize=False, add_generation_prompt=True
            )
        messages.append(
            {"role": "assistant", "content": [{"type": "text", "text": answer}]}
        )
        return self.processor.apply_chat_template(messages, tokenize=False)

    def __call__(self, batch):
        import torch
        from PIL import Image

        if len(batch) != 1:
            raise ValueError(
                "this collator handles one example at a time. Qwen2-VL emits a "
                "different number of visual tokens per image, so padding a real "
                "batch needs care that gradient accumulation makes unnecessary."
            )

        row = batch[0]
        image = Image.open(row["image"]).convert("RGB")

        prompt_only = self._chat(row["question"], None)
        full = self._chat(row["question"], row["answer"])

        prompt_ids = self.processor(
            text=[prompt_only], images=[image], return_tensors="pt"
        )["input_ids"]
        inputs = self.processor(text=[full], images=[image], return_tensors="pt")

        labels = inputs["input_ids"].clone()
        labels[:, : prompt_ids.shape[1]] = -100
        labels[labels == self.processor.tokenizer.pad_token_id] = -100
        inputs["labels"] = labels

        return {k: (v if isinstance(v, torch.Tensor) else v) for k, v in inputs.items()}


# --------------------------------------------------------------------------
# Model
# --------------------------------------------------------------------------

def build_model(model_id: str, dtype: str, lora_r: int, lora_alpha: int,
                lora_dropout: float, max_pixels: int):
    import torch
    import transformers
    from peft import LoraConfig, get_peft_model, prepare_model_for_kbit_training
    from transformers import AutoProcessor, BitsAndBytesConfig

    sys.path.insert(0, str(Path(__file__).resolve().parent))
    from eval_baseline import auto_model_class

    model_cls, cls_name = auto_model_class()
    torch_dtype = {"fp16": torch.float16, "bf16": torch.bfloat16}[dtype]

    print(f"transformers {transformers.__version__}, using {cls_name}")

    # Capping the pixel budget caps the visual token count, which is the single
    # biggest lever on activation memory for this architecture. VRSBench images
    # are 512x512; leaving the default dynamic resolution uncapped is what turns
    # a fitting run into an out-of-memory one on a 16 GB card.
    processor = AutoProcessor.from_pretrained(
        model_id, trust_remote_code=True, max_pixels=max_pixels
    )

    quant = BitsAndBytesConfig(
        load_in_4bit=True,
        bnb_4bit_compute_dtype=torch_dtype,
        bnb_4bit_quant_type="nf4",
        bnb_4bit_use_double_quant=True,
    )

    try:
        model = model_cls.from_pretrained(
            model_id, trust_remote_code=True, dtype=torch_dtype,
            quantization_config=quant, device_map="auto",
        )
    except TypeError:
        model = model_cls.from_pretrained(
            model_id, trust_remote_code=True, torch_dtype=torch_dtype,
            quantization_config=quant, device_map="auto",
        )

    model = prepare_model_for_kbit_training(model, use_gradient_checkpointing=True)
    model.config.use_cache = False          # incompatible with checkpointing

    # Attention projections only, per specification section 4. Widening this to
    # the MLP raises both memory and adapter size for a gain nobody here has
    # measured -- and an unmeasured change is not an improvement.
    lora = LoraConfig(
        r=lora_r,
        lora_alpha=lora_alpha,
        lora_dropout=lora_dropout,
        target_modules=["q_proj", "k_proj", "v_proj", "o_proj"],
        bias="none",
        task_type="CAUSAL_LM",
    )
    model = get_peft_model(model, lora)

    trainable = sum(p.numel() for p in model.parameters() if p.requires_grad)
    total = sum(p.numel() for p in model.parameters())
    print(f"trainable: {trainable:,} / {total:,}  ({trainable / total * 100:.3f} %)")

    return model, processor


# --------------------------------------------------------------------------
# Wall-clock guard
# --------------------------------------------------------------------------

def stop_after(seconds: float):
    """Stop cleanly before Kaggle's 9-hour cut, so the checkpoint survives.

    A run killed by the platform loses whatever happened since the last save.
    A run that stops itself saves first. The difference is an hour of GPU quota
    per timeout, and there will be timeouts.
    """
    from transformers import TrainerCallback

    class Guard(TrainerCallback):
        def __init__(self) -> None:
            self.started = time.time()

        def on_step_end(self, args, state, control, **kwargs):
            if time.time() - self.started > seconds:
                elapsed = (time.time() - self.started) / 3600
                print(f"\n  wall-clock guard: {elapsed:.2f} h elapsed, "
                      f"stopping and saving. Re-run with --resume.\n")
                control.should_training_stop = True
                control.should_save = True
            return control

    return Guard()


# --------------------------------------------------------------------------
# Run
# --------------------------------------------------------------------------

def main() -> int:
    parser = argparse.ArgumentParser(
        description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter
    )
    parser.add_argument("--base", default=config.DEFAULT_BASE)
    parser.add_argument("--data", default=None, help="VRSBench root")
    parser.add_argument("--split", default="train", help="annotation folder to train on")
    parser.add_argument("--limit", type=int, default=4000, help="training samples — see the ladder")
    parser.add_argument("--seed", type=int, default=0)
    parser.add_argument("--epochs", type=float, default=1.0)
    parser.add_argument("--lr", type=float, default=2e-4)
    parser.add_argument("--grad-accum", type=int, default=32, help="effective batch size")
    parser.add_argument("--lora-r", type=int, default=8)
    parser.add_argument("--lora-alpha", type=int, default=16)
    parser.add_argument("--lora-dropout", type=float, default=0.05)
    parser.add_argument("--dtype", default=config.DEFAULT_DTYPE, choices=["fp16", "bf16"])
    parser.add_argument("--max-pixels", type=int, default=512 * 512)
    parser.add_argument("--save-steps", type=int, default=25, help="optimizer steps between saves")
    parser.add_argument("--max-hours", type=float, default=8.0, help="stop and save before this")
    parser.add_argument("--out", default=None, help="adapter output directory")
    parser.add_argument("--resume", action="store_true", help="continue from the last checkpoint")
    args = parser.parse_args()

    if args.split == "val":
        raise SystemExit(
            "refusing to train on the split the baseline was measured on. "
            "That would make the reported gain meaningless."
        )

    from transformers import Trainer, TrainingArguments

    root = vrsbench.find_root(args.data)
    items = vrsbench.load_vqa(root, limit=args.limit, split=args.split, seed=args.seed)
    if not items:
        print("no training data")
        return 1

    out_dir = Path(args.out) if args.out else (
        config.default_out_dir().parent / "adapters" / f"{args.base}_rs_vqa"
    )
    out_dir.mkdir(parents=True, exist_ok=True)

    model_id = config.BASES.get(args.base, args.base)
    model, processor = build_model(
        model_id, args.dtype, args.lora_r, args.lora_alpha,
        args.lora_dropout, args.max_pixels,
    )

    micro_steps = int(len(items) * args.epochs)
    print(f"\n  {len(items):,} samples x {args.epochs} epochs = {micro_steps:,} "
          f"forward/backward passes")
    print(f"  effective batch {args.grad_accum}, "
          f"{micro_steps // args.grad_accum:,} optimizer steps")
    print(f"  output: {out_dir}\n")

    targs = TrainingArguments(
        output_dir=str(out_dir),
        per_device_train_batch_size=1,
        gradient_accumulation_steps=args.grad_accum,
        num_train_epochs=args.epochs,
        learning_rate=args.lr,
        warmup_ratio=0.03,
        lr_scheduler_type="cosine",
        logging_steps=5,
        save_strategy="steps",
        save_steps=args.save_steps,
        save_total_limit=2,
        fp16=(args.dtype == "fp16"),
        bf16=(args.dtype == "bf16"),
        gradient_checkpointing=True,
        remove_unused_columns=False,      # the collator needs the raw columns
        dataloader_num_workers=2,
        report_to=[],
        seed=args.seed,
    )

    trainer = Trainer(
        model=model,
        args=targs,
        train_dataset=VQADataset(items),
        data_collator=Collator(processor),
        callbacks=[stop_after(args.max_hours * 3600)],
    )

    resume = args.resume and any(out_dir.glob("checkpoint-*"))
    if args.resume and not resume:
        print("  --resume given but no checkpoint found; starting from scratch\n")

    started = time.time()
    trainer.train(resume_from_checkpoint=resume)
    wall = time.time() - started

    pack_dir = out_dir / "adapter"
    model.save_pretrained(str(pack_dir))
    processor.save_pretrained(str(pack_dir))

    size_mb = sum(p.stat().st_size for p in pack_dir.rglob("*") if p.is_file()) / 1e6
    record = {
        "base": model_id,
        "corpus": "VRSBench",
        "split": args.split,
        "samples": len(items),
        "epochs": args.epochs,
        "seed": args.seed,
        "lora": {"r": args.lora_r, "alpha": args.lora_alpha, "dropout": args.lora_dropout,
                 "targets": ["q_proj", "k_proj", "v_proj", "o_proj"]},
        "lr": args.lr,
        "effective_batch": args.grad_accum,
        "dtype": args.dtype,
        "load_in_4bit": True,
        "wall_hours": round(wall / 3600, 2),
        "pack_mb": round(size_mb, 1),
        "zero_shot_reference": "see models/MANIFEST.md",
    }
    (out_dir / "training_record.json").write_text(json.dumps(record, indent=2))

    print(f"\n  adapter saved: {pack_dir}  ({size_mb:.1f} MB)")
    print(f"  record:        {out_dir / 'training_record.json'}")
    print(
        "\n  Next: measure it on the SAME split and subset as the baseline —\n"
        f"    python models/eval_baseline.py --data {root} --limit 2000 \\\n"
        f"        --load-in-4bit --adapter {pack_dir}\n"
        "\n  Then put both numbers and their difference in models/MANIFEST.md.\n"
        "  The gain is the evidence for requirement 1; the absolute is not.\n"
    )
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
