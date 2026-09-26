"""SatQuery model runtime on Modal — M0 + M1 on a T4 (doc 12, §4.2).

    modal run    deploy/modal_runtime.py::fetch --adapter-repo <hf-user>/<repo>   once
    modal deploy deploy/modal_runtime.py                                          each release
    SATQUERY_WARM=1 modal deploy deploy/modal_runtime.py                          judging window

Run from `167/`. This file adds nothing to the contract: the routes are
`satquery.runtime.handle`, the model is `InProcessRuntime` + `M1Live` — the path
that measured 0.660. Serving M1 any other way serves a model nobody measured.
"""

# No `from __future__ import annotations`: `build_asgi` imports FastAPI's
# `Request` inside the function, and FastAPI must see the class, not the string.

import os
import shutil
from pathlib import Path

import modal

HERE = Path(__file__).resolve().parent
ROOT = HERE.parent                                    # 167/
PACK = "m1-rs-vqa"
SEED = f"/adapter-seed/{PACK}"                        # manifest + pre-computed, from the image
MODELS = "/models"                                    # the volume: base weights + adapter weights
PACKS = "/tmp/adapters"                               # assembled per container, see Runtime.load

#: 1 keeps a container loaded (judging window); 0 lets it scale to zero (§7.2).
WARM = 1 if os.environ.get("SATQUERY_WARM") else 0
#: Name of a Modal secret holding HF_TOKEN. Only needed if the adapter repo is private.
HF_SECRET = os.environ.get("SATQUERY_HF_SECRET", "")

app = modal.App("satquery-runtime")
volume = modal.Volume.from_name("satquery-models", create_if_missing=True)
secrets = [modal.Secret.from_name(HF_SECRET)] if HF_SECRET else []

image = (
    modal.Image.debian_slim(python_version="3.11")
    .pip_install_from_requirements(str(HERE / "requirements-runtime.txt"))
    .env({"HF_HOME": f"{MODELS}/hf"})
    .add_local_dir(str(ROOT / "models" / "adapters" / PACK), SEED, copy=True,
                   ignore=["*.safetensors", "training_record.json"])
    .add_local_python_source("satquery")
)


# --------------------------------------------------------------------------- #
# one-off: put the weights on the volume
# --------------------------------------------------------------------------- #

@app.function(image=image, volumes={MODELS: volume}, secrets=secrets,
              timeout=3600, cpu=2, memory=8192)
def fetch_weights(adapter_repo: str) -> dict:
    """Base model at the pinned revision, and the adapter's weights, onto the volume."""
    import json

    from huggingface_hub import hf_hub_download, snapshot_download

    pack = json.loads(Path(SEED, "pack.json").read_text(encoding="utf-8"))
    base = snapshot_download(pack["base_model"], revision=pack.get("revision") or None,
                             allow_patterns=["*.json", "*.safetensors", "*.txt", "*.model"])
    dest = Path(MODELS, "adapters", PACK)
    dest.mkdir(parents=True, exist_ok=True)
    weights = hf_hub_download(adapter_repo, "adapter_model.safetensors")
    shutil.copyfile(weights, dest / "adapter_model.safetensors")
    volume.commit()
    return {"base": base, "revision": pack.get("revision"),
            "adapter_bytes": (dest / "adapter_model.safetensors").stat().st_size}


@app.local_entrypoint()
def fetch(adapter_repo: str):
    print(fetch_weights.remote(adapter_repo))


# --------------------------------------------------------------------------- #
# the runtime
# --------------------------------------------------------------------------- #

def build_asgi(runtime):
    """The three routes of doc 12 §3, as an ASGI app over the shared handler."""
    from fastapi import FastAPI, Request, Response
    from starlette.concurrency import run_in_threadpool

    from satquery.runtime import handle

    api = FastAPI(title="SatQuery model runtime", docs_url=None, redoc_url=None)

    @api.api_route("/{path:path}", methods=["GET", "POST"])
    async def wire(request: Request, path: str) -> Response:
        import json
        body = await request.body()
        # generate() blocks on the GPU: keep it off the event loop
        status, reply = await run_in_threadpool(handle, runtime, request.method, "/" + path, body)
        return Response(json.dumps(reply), status_code=status, media_type="application/json")

    return api


@app.cls(image=image, gpu="T4", volumes={MODELS: volume}, secrets=secrets,
         max_containers=1, min_containers=WARM, scaledown_window=20 * 60, timeout=120,
         startup_timeout=15 * 60)      # the ~6 GB load is `enter`, not a request
@modal.concurrent(max_inputs=1)
class Runtime:
    @modal.enter()
    def load(self):
        """Load M0 + M1 once per container, before the first request (~6 GB, 4-bit)."""
        from satquery.runtime import InProcessRuntime

        weights = Path(MODELS, "adapters", PACK, "adapter_model.safetensors")
        if not weights.is_file():
            raise RuntimeError(f"{weights} is missing: run `modal run deploy/modal_runtime.py::fetch` first")
        # pack = the manifest and pre-computed answers shipped with this deploy,
        # plus the weights from the volume — so a changed pack.json needs a
        # deploy, not a re-fetch of 16 GB.
        pack = Path(PACKS, PACK)
        shutil.copytree(SEED, pack, dirs_exist_ok=True)
        (pack / "adapter_model.safetensors").symlink_to(weights)

        self.runtime = InProcessRuntime(PACKS)
        live = getattr(self.runtime, "_live", {})
        if not live:
            why = getattr(self.runtime, "_live_why", {})
            raise RuntimeError(f"M1 cannot run live in this container: {why}")
        for m1 in live.values():
            m1._load()

    @modal.asgi_app(label="satquery-runtime-web", requires_proxy_auth=True)
    def web(self):
        return build_asgi(self.runtime)
