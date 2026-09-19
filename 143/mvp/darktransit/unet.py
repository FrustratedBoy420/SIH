"""A U-Net that runs its forward pass in numpy.

Training needs PyTorch. Inference does not, and that asymmetry is deliberate.
`TECHNICAL_SPEC` section 2 commits the runtime to numpy alone; a detector that
demanded a 200 MB wheel at a venue machine would have broken that commitment to
buy nothing, because a forward pass is nine matrix multiplications per
convolution and numpy already does those well.

So: `train_unet.py` fits with torch and exports an `.npz`; this module loads the
`.npz` and runs it. The two must agree, and `train_unet.verify_export` checks
that they do on real tensors before the weights are written — a numeric parity
test, not a promise.

**Batch-norm is folded at export.** Every convolution here is
`conv + bias`, with the batch-norm scale and shift already multiplied into the
kernel:

    W' = W · γ / sqrt(σ² + ε)          b' = β − μ · γ / sqrt(σ² + ε)

which is exact at inference, where batch-norm is an affine map with frozen
statistics. It removes a layer type from this file and makes the forward pass
a straight alternation of convolution and ReLU.

**Convolution, without im2col.** A 3x3 convolution is a sum over nine spatial
offsets of a dense `(out_ch x in_ch)` matrix applied across all pixels. Written
that way it is nine `matmul` calls over views of the padded input, and it never
materialises the `H·W·9·C` column matrix that would cost hundreds of megabytes
at 640² with 64 channels.
"""

from __future__ import annotations

from pathlib import Path

import numpy as np

ARCH_VERSION = "unet-s-v1"

# (level channels). Depth 3 with a 128-channel bottleneck: small enough to
# train on a CPU in minutes, deep enough that the receptive field at the
# bottleneck covers ~45 px, which at 100 m pixels is 4.5 km — the scale a
# slick's context lives at.
CHANNELS = (16, 32, 64, 128)


# --------------------------------------------------------------------------- #
# primitives
# --------------------------------------------------------------------------- #

# How much memory one im2col block may take. 64 MB keeps the working set in
# reach of a laptop's cache hierarchy and bounds the peak regardless of scene
# size; the block count adjusts instead.
_BLOCK_BYTES = 64 << 20


def conv2d(x: np.ndarray, w: np.ndarray, b: np.ndarray) -> np.ndarray:
    """`same`-padded 2-D convolution. x (C,H,W), w (O,C,kh,kw), b (O,).

    Blocked im2col. Two other formulations were measured on a 640² scene first:

    · nine `(O x C) @ (C x HW)` products, one per kernel offset — 15.6 s. The
      inner dimension is 16 to 128, far too thin for a BLAS kernel, and each
      offset allocates a full-size temporary.
    · the same with the shift moved to the output side — 12.5 s.

    This version is 8.3 s: the product becomes `(O x 9C) @ (9C x RW)`, whose
    inner dimension is 9 to 1152, and the block height R keeps the column
    matrix inside `_BLOCK_BYTES` rather than the 675 MB an unblocked im2col
    would need at the widest decoder layer. Output is identical in all three.

    8 s is still slow, and no numpy arrangement fixes it: the M dimension is
    the channel count, which is 16 at the outermost layers, and OpenBLAS
    reaches roughly a seventh of its peak on a matrix that thin. The answer is
    not a faster kernel but a smaller input — `detect_ml.refine` runs the
    network over a crop around each candidate rather than the whole scene,
    which is also all it is permitted to decide about. In the pipeline the
    learned pass costs tens of milliseconds.
    """
    c, h, width = x.shape
    o, ci, kh, kw = w.shape
    if ci != c:
        raise ValueError(f"conv channel mismatch: input {c}, kernel {ci}")
    ph, pw = kh // 2, kw // 2

    xp = np.pad(x, ((0, 0), (ph, ph), (pw, pw)), mode="reflect") if (ph or pw) else x
    xp = np.ascontiguousarray(xp, dtype=np.float32)

    wm = np.ascontiguousarray(w.reshape(o, c * kh * kw), dtype=np.float32)
    bias = b.astype(np.float32)[:, None]
    out = np.empty((o, h, width), dtype=np.float32)

    per_row = c * kh * kw * width * 4
    rows = max(1, min(h, _BLOCK_BYTES // max(per_row, 1)))

    cols = np.empty((c, kh, kw, rows, width), dtype=np.float32)
    for y0 in range(0, h, rows):
        r = min(rows, h - y0)
        view = cols[:, :, :, :r, :]
        for ky in range(kh):
            for kx in range(kw):
                view[:, ky, kx] = xp[:, y0 + ky:y0 + ky + r, kx:kx + width]
        out[:, y0:y0 + r, :] = (
            wm @ view.reshape(c * kh * kw, r * width) + bias
        ).reshape(o, r, width)
    return out


def relu(x: np.ndarray) -> np.ndarray:
    return np.maximum(x, 0.0, out=x)


def maxpool2(x: np.ndarray) -> np.ndarray:
    """2x2 max pool. Odd sizes are reflect-padded so the shape halves cleanly
    and `upsample2` can put them back without an off-by-one."""
    c, h, w = x.shape
    ph, pw = h % 2, w % 2
    if ph or pw:
        x = np.pad(x, ((0, 0), (0, ph), (0, pw)), mode="edge")
        h, w = h + ph, w + pw
    x = x.reshape(c, h // 2, 2, w // 2, 2)
    return x.max(axis=(2, 4))


def upsample2(x: np.ndarray, out_hw=None) -> np.ndarray:
    """Nearest-neighbour 2x, cropped to `out_hw` when the encoder was padded."""
    y = np.repeat(np.repeat(x, 2, axis=1), 2, axis=2)
    if out_hw is not None:
        y = y[:, :out_hw[0], :out_hw[1]]
    return y


def sigmoid(x: np.ndarray) -> np.ndarray:
    return 1.0 / (1.0 + np.exp(-np.clip(x, -60.0, 60.0)))


# --------------------------------------------------------------------------- #
# the network
# --------------------------------------------------------------------------- #

class UNet:
    """Forward-only U-Net over a stack of `(W, b)` pairs loaded from `.npz`.

    Weight keys are positional and flat — `enc0.0.w`, `enc0.0.b`, `enc0.1.w`, …
    — because a named-module tree buys nothing when the only operation is a
    forward pass, and a flat namespace is trivially checkable against the
    exporter.
    """

    def __init__(self, weights: dict, meta: dict | None = None):
        self.w = {k: np.asarray(v, dtype=np.float32) for k, v in weights.items()}
        self.meta = dict(meta or {})
        self.depth = len(CHANNELS) - 1

    # -- construction ------------------------------------------------------ #

    @classmethod
    def from_npz(cls, path) -> "UNet":
        path = Path(path)
        with np.load(path, allow_pickle=False) as z:
            weights = {k: z[k] for k in z.files if not k.startswith("meta__")}
            meta = {}
            for k in z.files:
                if k.startswith("meta__"):
                    v = z[k]
                    meta[k[6:]] = v.item() if v.shape == () else v.tolist()
        return cls(weights, meta)

    def exists(self) -> bool:
        return bool(self.w)

    # -- inference --------------------------------------------------------- #

    def _block(self, x, tag):
        x = relu(conv2d(x, self.w[f"{tag}.0.w"], self.w[f"{tag}.0.b"]))
        x = relu(conv2d(x, self.w[f"{tag}.1.w"], self.w[f"{tag}.1.b"]))
        return x

    def forward(self, x: np.ndarray) -> np.ndarray:
        """(1,H,W) standardised input -> (H,W) logits."""
        if x.ndim == 2:
            x = x[None]
        skips, shapes = [], []

        for i in range(self.depth):
            x = self._block(x, f"enc{i}")
            skips.append(x)
            shapes.append(x.shape[1:])
            x = maxpool2(x)

        x = self._block(x, "bottleneck")

        for i in reversed(range(self.depth)):
            x = upsample2(x, out_hw=shapes[i])
            x = np.concatenate([x, skips[i]], axis=0)
            x = self._block(x, f"dec{i}")

        logits = conv2d(x, self.w["head.w"], self.w["head.b"])
        return logits[0]

    def predict(self, sigma0_db: np.ndarray) -> np.ndarray:
        """σ⁰ decibels -> per-pixel oil probability.

        Standardisation is per-scene, matching training. A σ⁰ raster's absolute
        level moves with incidence angle and wind; what carries the signal is
        how far a pixel sits below its own scene, so the network is never asked
        to memorise an absolute decibel value it will not see again.
        """
        a = np.asarray(sigma0_db, dtype=np.float32)
        mu = float(np.nanmedian(a))
        sd = float(np.nanstd(a)) or 1.0
        z = np.clip((a - mu) / sd, -6.0, 6.0)[None]
        return sigmoid(self.forward(z))

    def predict_tiled(self, sigma0_db: np.ndarray, tile: int = 768,
                      overlap: int = 64) -> np.ndarray:
        """`predict` over overlapping tiles, blended, for large rasters.

        Standardisation stays global — retiling the normalisation would make a
        tile of open water look like a tile of slick, which is exactly the
        artefact that gives tiled segmenters their seams.
        """
        a = np.asarray(sigma0_db, dtype=np.float32)
        h, w = a.shape
        if max(h, w) <= tile:
            return self.predict(a)

        mu = float(np.nanmedian(a))
        sd = float(np.nanstd(a)) or 1.0
        z = np.clip((a - mu) / sd, -6.0, 6.0)

        acc = np.zeros((h, w), dtype=np.float32)
        wgt = np.zeros((h, w), dtype=np.float32)
        step = max(16, tile - overlap)

        # A cosine window makes neighbouring tiles cross-fade instead of butting
        # against each other, which is what removes the seam.
        def window(n):
            if n <= 1:
                return np.ones(n, dtype=np.float32)
            return (0.5 - 0.5 * np.cos(2 * np.pi * np.arange(n) / (n - 1))).astype(np.float32) + 1e-3

        for y0 in range(0, max(h - overlap, 1), step):
            for x0 in range(0, max(w - overlap, 1), step):
                y1, x1 = min(y0 + tile, h), min(x0 + tile, w)
                y0c, x0c = max(0, y1 - tile), max(0, x1 - tile)
                sub = z[y0c:y1, x0c:x1]
                p = sigmoid(self.forward(sub[None]))
                m = window(p.shape[0])[:, None] * window(p.shape[1])[None, :]
                acc[y0c:y1, x0c:x1] += p * m
                wgt[y0c:y1, x0c:x1] += m

        return acc / np.maximum(wgt, 1e-6)

    # -- reporting --------------------------------------------------------- #

    def parameter_count(self) -> int:
        return int(sum(v.size for k, v in self.w.items()))

    def describe(self) -> dict:
        return {
            "architecture": ARCH_VERSION,
            "channels": list(CHANNELS),
            "depth": self.depth,
            "parameters": self.parameter_count(),
            **self.meta,
        }
