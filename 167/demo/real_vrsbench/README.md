# Genuine imagery for demonstrating M1

Photos from the **VRSBench validation split** — Google Earth imagery that M1 was
never trained on (train/val image overlap counted: zero). Each comes with its
own questions and true answers; `guide.md` lists them beside M1's answers,
including the ones M1 gets wrong and the ones the confidence gate withholds.

M1's answers for these exact files are in
`models/adapters/m1-rs-vqa/precomputed.jsonl`, produced on a Kaggle T4 by
`models/precompute_m1.py --vrsbench-val 8`. They are keyed by the images'
pixels, so upload **these files unchanged** — a resized, re-saved or
screenshotted copy is a different image and falls back to the classical path.

To demonstrate: start the server with `--adapters models/adapters`, upload a
photo in the **Optical** slot, ask a question from `guide.md` as written.

## Licence and attribution

VRSBench — Li, Ding and Elhoseiny, *VRSBench: A Versatile Vision-Language
Benchmark Dataset for Remote Sensing Image Understanding*, NeurIPS 2024
Datasets and Benchmarks. Distributed under **CC-BY-4.0**:
https://huggingface.co/datasets/xiang709/VRSBench. The images are redistributed
here unmodified, for demonstration, under that licence.
