"""Constants for the adaptation work — one place, so a number changes once.

Every value here is traceable to a document in `../../docs/`. Where a figure
came from a measurement rather than a decision, the source is named beside it.
"""

from __future__ import annotations

import os
from pathlib import Path

# --- Base model candidates -------------------------------------------------
# docs/10_Decision_Record.md section 5: benchmark both, do not assume.
#
# GeoChat is already remote-sensing adapted, so it scores higher but has little
# adaptation gain left to demonstrate. Qwen2-VL starts generic. Requirement 1 of
# the problem statement is evidenced by the GAIN, not the absolute score, so the
# generic base may make the better submission even at a lower final number.
# Measure both zero-shot, then decide. Do not assume which wins.

BASES: dict[str, str] = {
    "qwen2vl":    "Qwen/Qwen2-VL-7B-Instruct",
    "qwen2vl-2b": "Qwen/Qwen2-VL-2B-Instruct",   # fits 4 GB VRAM — demo fallback
    "llava":      "llava-hf/llava-1.5-7b-hf",
    "geochat":    "MBZUAI/geochat-7B",           # does not load — see below
}

DEFAULT_BASE = "qwen2vl"

# GeoChat, measured 18 September 2026 on transformers 5.18.0.dev0:
#
#   ValueError: The checkpoint you are trying to load has model type `geochat`
#   but Transformers does not recognize this architecture.
#
# The checkpoint declares `model_type: "geochat"` and ships no `auto_map`, so
# `trust_remote_code` has nothing to fetch — the architecture lives only in
# github.com/mbzuai-oryx/GeoChat, which pins transformers ~4.31. Installing that
# pin breaks Qwen2-VL, which needs a modern release.
#
# Recorded rather than worked around. The deliverable is "codes and models
# including test and demonstration": a base that will not load in the stack we
# ship is a base we cannot hand to an evaluator, and that is a measurement
# result about the candidate, not a defect in the harness. If a GeoChat number
# is wanted later it needs its own pinned environment, not this one.

VRSBENCH_REPO = "xiang709/VRSBench"

# --- Precision -------------------------------------------------------------
# docs/10_Decision_Record.md section 6. Kaggle provides T4 (Turing) or P100
# (Pascal); neither supports bf16, and the config in specification section 12
# specifies bf16. Using it there fails or silently degrades. fp16 is the default
# for that reason — override only on Ampere or newer.

DEFAULT_DTYPE = "fp16"

# --- Published anchors -----------------------------------------------------
# docs/03_Model_Specification.md sections 4-5, docs/10_Decision_Record.md s.3.
# Printed beside a measured result so a number is read in context rather than
# against intuition. A target above these converts a good result into a
# perceived failure.

ANCHORS = {
    "vrsbench_vqa": {
        "MiniGPT-v2":          0.371,
        "GeoChat zero-shot":   0.408,
        "GeoChat fine-tuned":  0.606,
        "GPT-4V":              0.656,
    },
    "target_band":  (0.55, 0.62),
    "target_gain":  (0.10, 0.20),
}

# --- Answer style ----------------------------------------------------------
# VRSBench VQA answers are single words or short phrases. Left to itself a
# chat-tuned VLM replies "The image shows a large residential area with...",
# which is a correct observation and scores zero under exact match. This suffix
# is the standard instruction used by the LLaVA and GeoChat evaluations; without
# it a baseline reads as far worse than the model actually is.

SHORT_ANSWER_SUFFIX = "Answer the question using a single word or short phrase."


def default_out_dir() -> Path:
    """Kaggle's writable, session-surviving directory when on Kaggle; else local."""
    kaggle = Path("/kaggle/working")
    return kaggle / "baseline" if kaggle.is_dir() else Path("runs") / "baseline"


def on_kaggle() -> bool:
    return Path("/kaggle").is_dir() or "KAGGLE_KERNEL_RUN_TYPE" in os.environ
