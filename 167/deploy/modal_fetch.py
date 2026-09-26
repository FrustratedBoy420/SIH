"""One-off: put the model weights on Modal's `satquery-models` volume (doc 12, §4.2).

    modal run deploy/modal_fetch.py --adapter-repo <hf-user>/<repo>

Run from `167/`. Downloads Qwen2-VL-7B-Instruct at the revision `pack.json`
pins (~16 GB) into the volume's HF cache, and the adapter's weights beside it.
A separate app from the runtime on purpose: this needs no GPU and no torch, so
it builds in a minute, costs CPU-seconds only, and runs on an account that has
not yet added the payment method a T4 requires. The runtime app reads the same
volume by name.
"""

import os
import shutil
from pathlib import Path

import modal

ROOT = Path(__file__).resolve().parent.parent         # 167/
PACK = "m1-rs-vqa"
MODELS = "/models"
HF_SECRET = os.environ.get("SATQUERY_HF_SECRET", "")

app = modal.App("satquery-fetch")
volume = modal.Volume.from_name("satquery-models", create_if_missing=True)
secrets = [modal.Secret.from_name(HF_SECRET)] if HF_SECRET else []

image = (
    modal.Image.debian_slim(python_version="3.12")
    .pip_install("huggingface_hub")
    .env({"HF_HOME": f"{MODELS}/hf"})
    .add_local_file(str(ROOT / "models" / "adapters" / PACK / "pack.json"), "/seed/pack.json")
)


@app.function(image=image, volumes={MODELS: volume}, secrets=secrets,
              timeout=3600, cpu=2, memory=8192)
def fetch_weights(adapter_repo: str) -> dict:
    """Base model at the pinned revision, and the adapter's weights, onto the volume."""
    import json

    from huggingface_hub import hf_hub_download, snapshot_download

    pack = json.loads(Path("/seed/pack.json").read_text(encoding="utf-8"))
    base = snapshot_download(pack["base_model"], revision=pack.get("revision") or None,
                             allow_patterns=["*.json", "*.safetensors", "*.txt", "*.model"])
    dest = Path(MODELS, "adapters", PACK)
    dest.mkdir(parents=True, exist_ok=True)
    weights = hf_hub_download(adapter_repo, "adapter_model.safetensors")
    shutil.copyfile(weights, dest / "adapter_model.safetensors")
    volume.commit()
    files = sorted(p.name for p in Path(base).iterdir())
    return {"base": base, "revision": pack.get("revision"), "base_files": files,
            "adapter_bytes": (dest / "adapter_model.safetensors").stat().st_size}


@app.local_entrypoint()
def main(adapter_repo: str):
    print(fetch_weights.remote(adapter_repo))
