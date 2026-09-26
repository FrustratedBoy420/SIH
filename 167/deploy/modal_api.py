"""SatQuery API + interface on Modal — the CPU half of the online demo (doc 12, D4 option A).

    modal deploy deploy/modal_api.py        from 167/, after deploy/modal_runtime.py

The image is the repository's own `Dockerfile`, so the hosted site is the venue
image: the built web bundle, the classical specialists, and M1's pre-computed
pack. It reaches the GPU app over HTTPS with the proxy-auth pair, and falls back
to the pre-computed answers when the GPU is cold or down (`FallbackRuntime`).

Settings arrive as a Modal secret named `satquery-api-env` holding
SATQUERY_RUNTIME, SATQUERY_RUNTIME_KEY and SATQUERY_RUNTIME_SECRET; the two
plain settings below are set here. Keys never live in the repository.
"""

from pathlib import Path

import modal

ROOT = Path(__file__).resolve().parent.parent          # 167/

app = modal.App("satquery-api")

image = (
    modal.Image.from_dockerfile(str(ROOT / "Dockerfile"), context_dir=str(ROOT))
    .env({"SATQUERY_RUNTIME_TIMEOUT": "20", "SATQUERY_MAX_UPLOAD_MB": "100"})
)


@app.function(
    image=image,
    secrets=[modal.Secret.from_name("satquery-api-env")],
    # One container: uploads and stored runs live in that container's /data, so
    # a second container would not see them. It scales to zero when idle.
    max_containers=1, min_containers=0, scaledown_window=20 * 60, timeout=300,
)
@modal.concurrent(max_inputs=16)
@modal.asgi_app(label="satquery")
def web():
    from satquery.server import build_app

    return build_app(var="/data", adapters="/app/adapters")
