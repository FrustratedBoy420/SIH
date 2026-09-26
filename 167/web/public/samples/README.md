# Sample photographs

Eight photos from the **VRSBench validation split**, served unmodified so the
workstation's "Try a real photo" gallery works without a file hunt. M1 was
never trained on them (train/val image overlap counted at zero).

M1's answers for these exact files are pre-computed in
`models/adapters/m1-rs-vqa/precomputed.jsonl`, keyed by the images' pixels — so
do not resize, re-save or convert them. `models/precompute_m1.py --check`
confirms each one is found.

Questions, true answers and M1's answers (including the ones it gets wrong):
`demo/real_vrsbench/guide.md`.

VRSBench — Li, Ding and Elhoseiny, *VRSBench: A Versatile Vision-Language
Benchmark Dataset for Remote Sensing Image Understanding*, NeurIPS 2024
Datasets and Benchmarks. Distributed under **CC-BY-4.0**:
https://huggingface.co/datasets/xiang709/VRSBench.
