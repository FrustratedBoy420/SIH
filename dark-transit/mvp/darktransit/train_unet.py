"""Training the DT-3 segmentation model, and proving the export is faithful.

This is the module PRD section 22 listed as *Not in MVP*. It closes that row.

**What it trains.** The small U-Net of `unet.py`: one σ⁰ channel in, one oil
logit per pixel out, ~0.5 M parameters. Not a large model, deliberately — the
PS names a labelled dataset and a solved recipe, and the risk register (R-1)
says the detector must not be allowed to eat a week.

**What it trains on.** Two corpora, and the pack records which one produced the
weights in force:

`zenodo` — *Sentinel-1 SAR Oil spill image dataset for train, validate and test
deep learning models* (Zenodo 8253899 / 8346860 / 13761290, CC-BY-4.0):
2048x2048 σ⁰ tiles in decibels with per-pixel ground truth, plus labelled
look-alike and oil-free tiles. This is the dataset the problem statement names.

`synthetic` — scenes from `fit.sample_scene`, whose `truth.oil_mask` is a real
per-pixel label. Available with no download, and the reason this module is
testable on a machine that has never seen the corpus.

**Splitting.** By source tile, never by patch. Patches from one 2048² tile
share speckle statistics, wind field and often the same slick; letting them
straddle the split would report a memorisation score as a generalisation score.
`_split_by_group` is the only place the split is made.

**Export.** Batch-norm is folded into the preceding convolution and the result
is written as `.npz` for the numpy runtime. `verify_export` then runs both
implementations on the same tensors and refuses to write if they disagree by
more than 1e-4 — the export is checked, not assumed.
"""

from __future__ import annotations

import json
import math
import time
from dataclasses import dataclass, asdict
from pathlib import Path

import numpy as np

from . import unet

try:                                                    # pragma: no cover
    import torch
    import torch.nn as nn
    import torch.nn.functional as F
    HAVE_TORCH = True
    _TORCH_ERROR = None
except Exception as exc:                                # pragma: no cover
    torch = None
    nn = None
    F = None
    HAVE_TORCH = False
    _TORCH_ERROR = f"{type(exc).__name__}: {exc}"

PACK_VERSION = "unet.v1"
PATCH = 256                     # a multiple of 8, so no pooling level rounds
DEFAULT_WEIGHTS = "detector.unet.v2.npz"
DEFAULT_REPORT = "detector.unet.v2.json"


def available() -> dict:
    """TR-G1 capability report for training. Inference never needs torch."""
    return {"torch": HAVE_TORCH, "error": _TORCH_ERROR,
            "version": torch.__version__ if HAVE_TORCH else None}


# --------------------------------------------------------------------------- #
# the torch twin of unet.UNet
# --------------------------------------------------------------------------- #

if HAVE_TORCH:                                          # pragma: no cover

    class _Block(nn.Module):
        """conv-bn-relu twice, reflect-padded to match the numpy forward pass.

        Reflect rather than zero padding because a zero in a decibel raster is
        a bright return, and a border of them teaches the network that scene
        edges are interesting.
        """

        def __init__(self, cin, cout):
            super().__init__()
            self.c1 = nn.Conv2d(cin, cout, 3, padding=0, bias=False)
            self.b1 = nn.BatchNorm2d(cout)
            self.c2 = nn.Conv2d(cout, cout, 3, padding=0, bias=False)
            self.b2 = nn.BatchNorm2d(cout)

        def forward(self, x):
            x = F.relu(self.b1(self.c1(F.pad(x, (1, 1, 1, 1), mode="reflect"))))
            x = F.relu(self.b2(self.c2(F.pad(x, (1, 1, 1, 1), mode="reflect"))))
            return x

    class TorchUNet(nn.Module):
        def __init__(self, channels=unet.CHANNELS):
            super().__init__()
            self.depth = len(channels) - 1
            self.enc = nn.ModuleList()
            cin = 1
            for i in range(self.depth):
                self.enc.append(_Block(cin, channels[i]))
                cin = channels[i]
            self.bottleneck = _Block(cin, channels[-1])
            self.dec = nn.ModuleList()
            cin = channels[-1]
            for i in reversed(range(self.depth)):
                self.dec.append(_Block(cin + channels[i], channels[i]))
                cin = channels[i]
            self.head = nn.Conv2d(cin, 1, 1)

        def forward(self, x):
            skips = []
            for blk in self.enc:
                x = blk(x)
                skips.append(x)
                x = F.max_pool2d(x, 2)
            x = self.bottleneck(x)
            for k, blk in enumerate(self.dec):
                s = skips[self.depth - 1 - k]
                x = F.interpolate(x, size=s.shape[-2:], mode="nearest")
                x = blk(torch.cat([x, s], dim=1))
            return self.head(x)


# --------------------------------------------------------------------------- #
# corpora
# --------------------------------------------------------------------------- #

@dataclass
class Sample:
    image: np.ndarray          # (H, W) sigma0 dB
    mask: np.ndarray           # (H, W) bool ground truth
    group: str                 # split key — the source tile
    kind: str                  # oil | lookalike | clean


def corpus_synthetic(n_scenes: int = 40, seed: int = 20260909,
                     oil_fraction: float = 0.7, verbose: bool = True) -> list[Sample]:
    """Labelled scenes from the generator, with their per-pixel oil masks."""
    from . import fit

    rng = np.random.default_rng(seed)
    out: list[Sample] = []
    for i in range(n_scenes):
        with_oil = rng.random() < oil_fraction
        sc = fit.sample_scene(rng, with_oil=with_oil)
        truth = sc.truth.get("oil_mask")
        mask = (np.zeros(sc.sigma0_db.shape, dtype=bool)
                if truth is None else np.asarray(truth, dtype=bool))
        out.append(Sample(np.asarray(sc.sigma0_db, dtype=np.float32), mask,
                          group=f"syn-{i:03d}",
                          kind="oil" if with_oil else "lookalike"))
        if verbose and (i + 1) % 10 == 0:
            print(f"  synthetic corpus {i + 1}/{n_scenes}")
    return out


def corpus_zenodo(root, limit: int | None = None, max_side: int = 1024,
                  verbose: bool = True) -> list[Sample]:
    """The Zenodo tiles, read through the Sentinel-1 reader.

    Layout, as the archives extract: a directory of σ⁰ TIFFs and a sibling
    directory of ground-truth TIFFs whose stems match. Tiles under a directory
    named for look-alike or oil-free surfaces are labelled as such and carry an
    all-zero mask, which is the label — those tiles are the false-alarm test,
    and dropping them would train a detector that has never been shown a dark
    patch that is not oil.
    """
    from .readers import sentinel1

    root = Path(root)
    if not root.exists():
        raise FileNotFoundError(f"no Zenodo corpus at {root}")

    images = sorted([p for p in root.rglob("*.tif") if _is_image_path(p)] +
                    [p for p in root.rglob("*.tiff") if _is_image_path(p)])
    if not images:
        raise FileNotFoundError(f"no image TIFFs under {root}")

    out: list[Sample] = []
    for i, img in enumerate(images):
        if limit and len(out) >= limit:
            break
        kind = _kind_of(img)
        mpath = _mask_for(img)
        try:
            scene, mask = sentinel1.read_pair(
                img, mpath,
                centre_lonlat=(69.20, 22.45), pixel_m=10.0,
                max_side=max_side, radiometry="auto")
        except Exception as exc:
            if verbose:
                print(f"  skipped {img.name}: {type(exc).__name__}: {exc}")
            continue
        if mask is None:
            mask = np.zeros(scene.shape, dtype=bool)
        out.append(Sample(np.asarray(scene.sigma0_db, dtype=np.float32),
                          np.asarray(mask, dtype=bool),
                          group=img.stem, kind=kind))
        if verbose and (i + 1) % 25 == 0:
            print(f"  zenodo corpus {len(out)} tiles read")
    return out


def _is_image_path(p: Path) -> bool:
    low = str(p).lower()
    return "mask" not in low and "ground" not in low and "truth" not in low


def _kind_of(p: Path) -> str:
    low = str(p).lower()
    if "lookalike" in low or "look_alike" in low or "look-alike" in low:
        return "lookalike"
    if "no_oil" in low or "nooil" in low or "no oil" in low:
        return "clean"
    return "oil"


def _mask_for(img: Path) -> Path | None:
    """The ground-truth tile beside an image tile, if one is there."""
    stem = img.stem
    for parent in (img.parent, img.parent.parent):
        for pat in (f"**/{stem}.tif", f"**/{stem}.tiff",
                    f"**/{stem}_mask.tif", f"**/{stem}_mask.tiff"):
            for cand in parent.glob(pat):
                if cand != img and not _is_image_path(cand):
                    return cand
    return None


# --------------------------------------------------------------------------- #
# patches and splits
# --------------------------------------------------------------------------- #

def _patches(samples: list[Sample], patch: int = PATCH, per_tile: int = 6,
             positive_bias: float = 0.6, seed: int = 7):
    """Cut fixed-size patches, over-sampling those that contain oil.

    A slick occupies a small share of a scene, so uniform sampling produces a
    corpus that is ~99 % water and a model that predicts water. `positive_bias`
    is the share of patches drawn from tiles that have a mask, centred on it.
    Reported in the pack, because a sampling scheme is part of the method.
    """
    rng = np.random.default_rng(seed)
    X, Y, G = [], [], []
    for s in samples:
        h, w = s.image.shape
        if h < patch or w < patch:
            continue
        ys, xs = np.nonzero(s.mask)
        for _ in range(per_tile):
            if len(ys) and rng.random() < positive_bias:
                j = int(rng.integers(len(ys)))
                cy = int(np.clip(ys[j] - patch // 2, 0, h - patch))
                cx = int(np.clip(xs[j] - patch // 2, 0, w - patch))
            else:
                cy = int(rng.integers(0, h - patch + 1))
                cx = int(rng.integers(0, w - patch + 1))
            X.append(s.image[cy:cy + patch, cx:cx + patch])
            Y.append(s.mask[cy:cy + patch, cx:cx + patch])
            G.append(s.group)
    return np.asarray(X, dtype=np.float32), np.asarray(Y, dtype=np.float32), np.asarray(G)


def _standardise(x: np.ndarray) -> np.ndarray:
    """Per-patch, matching `unet.predict`."""
    mu = np.nanmedian(x, axis=(-2, -1), keepdims=True)
    sd = np.nanstd(x, axis=(-2, -1), keepdims=True)
    return np.clip((x - mu) / np.maximum(sd, 1e-3), -6.0, 6.0).astype(np.float32)


def _split_by_group(groups: np.ndarray, holdout: float = 0.30, seed: int = 11):
    """The only split in this module. By source tile, never by patch."""
    uniq = np.array(sorted(set(groups.tolist())))
    rng = np.random.default_rng(seed)
    rng.shuffle(uniq)
    n_hold = max(1, int(round(len(uniq) * holdout)))
    hold = set(uniq[:n_hold].tolist())
    is_hold = np.array([g in hold for g in groups])
    return ~is_hold, is_hold, sorted(hold)


# --------------------------------------------------------------------------- #
# metrics
# --------------------------------------------------------------------------- #

def segmentation_metrics(prob: np.ndarray, truth: np.ndarray,
                         threshold: float = 0.5) -> dict:
    pred = prob >= threshold
    t = truth.astype(bool)
    tp = int((pred & t).sum())
    fp = int((pred & ~t).sum())
    fn = int((~pred & t).sum())
    tn = int((~pred & ~t).sum())
    prec = tp / (tp + fp) if tp + fp else 0.0
    rec = tp / (tp + fn) if tp + fn else 0.0
    f1 = 2 * prec * rec / (prec + rec) if prec + rec else 0.0
    iou = tp / (tp + fp + fn) if tp + fp + fn else 0.0
    return {"precision": round(prec, 4), "recall": round(rec, 4),
            "f1": round(f1, 4), "iou": round(iou, 4),
            "false_alarm_rate": round(fp / (fp + tn), 6) if fp + tn else 0.0,
            "tp": tp, "fp": fp, "fn": fn, "tn": tn}


# --------------------------------------------------------------------------- #
# batch-norm folding and export
# --------------------------------------------------------------------------- #

def _fold(conv, bn):                                    # pragma: no cover
    """W' = W·γ/√(σ²+ε), b' = β − μ·γ/√(σ²+ε). Exact at inference."""
    w = conv.weight.detach().cpu().numpy().astype(np.float32)
    gamma = bn.weight.detach().cpu().numpy().astype(np.float32)
    beta = bn.bias.detach().cpu().numpy().astype(np.float32)
    mean = bn.running_mean.detach().cpu().numpy().astype(np.float32)
    var = bn.running_var.detach().cpu().numpy().astype(np.float32)
    scale = gamma / np.sqrt(var + bn.eps)
    return w * scale[:, None, None, None], beta - mean * scale


def export_weights(model, meta: dict) -> dict:          # pragma: no cover
    """Flatten the torch module into the key layout `unet.UNet` expects."""
    model.eval()
    out: dict[str, np.ndarray] = {}
    for i, blk in enumerate(model.enc):
        out[f"enc{i}.0.w"], out[f"enc{i}.0.b"] = _fold(blk.c1, blk.b1)
        out[f"enc{i}.1.w"], out[f"enc{i}.1.b"] = _fold(blk.c2, blk.b2)
    out["bottleneck.0.w"], out["bottleneck.0.b"] = _fold(model.bottleneck.c1, model.bottleneck.b1)
    out["bottleneck.1.w"], out["bottleneck.1.b"] = _fold(model.bottleneck.c2, model.bottleneck.b2)
    for k, blk in enumerate(model.dec):
        i = model.depth - 1 - k
        out[f"dec{i}.0.w"], out[f"dec{i}.0.b"] = _fold(blk.c1, blk.b1)
        out[f"dec{i}.1.w"], out[f"dec{i}.1.b"] = _fold(blk.c2, blk.b2)
    out["head.w"] = model.head.weight.detach().cpu().numpy().astype(np.float32)
    out["head.b"] = model.head.bias.detach().cpu().numpy().astype(np.float32)
    for k, v in meta.items():
        out[f"meta__{k}"] = np.asarray(v)
    return out


def verify_export(model, weights: dict, n: int = 3, size: int = 128,
                  tol: float = 1e-4, seed: int = 3) -> dict:   # pragma: no cover
    """Run torch and numpy on the same tensors. Disagreement blocks the write.

    Folding batch-norm by hand is exactly the kind of step that is silently
    wrong — a transposed axis, a missing epsilon — and produces a model that
    trains well and ships broken. This is the check that catches it.
    """
    net = unet.UNet({k: v for k, v in weights.items() if not k.startswith("meta__")})
    rng = np.random.default_rng(seed)
    worst = 0.0
    model.eval()
    with torch.no_grad():
        for _ in range(n):
            x = rng.normal(0.0, 1.0, size=(1, 1, size, size)).astype(np.float32)
            ref = model(torch.from_numpy(x)).numpy()[0, 0]
            got = net.forward(x[0])
            worst = max(worst, float(np.max(np.abs(ref - got))))
    return {"max_abs_diff": worst, "tolerance": tol, "agrees": worst <= tol,
            "trials": n, "size": size}


# --------------------------------------------------------------------------- #
# training
# --------------------------------------------------------------------------- #

def train(corpus: str = "synthetic",
          zenodo_root=None,
          n_scenes: int = 40,
          epochs: int = 8,
          batch: int = 8,
          lr: float = 2e-3,
          per_tile: int = 6,
          seed: int = 20260909,
          out_weights: str = DEFAULT_WEIGHTS,
          out_report: str = DEFAULT_REPORT,
          limit: int | None = None,
          verbose: bool = True) -> dict:                # pragma: no cover
    """Fit, measure on a tile-disjoint holdout, verify the export, write."""
    if not HAVE_TORCH:
        raise RuntimeError(
            "training needs PyTorch; inference does not. "
            f"import failed with: {_TORCH_ERROR}"
        )

    t0 = time.time()
    torch.manual_seed(seed)

    if corpus == "zenodo":
        if not zenodo_root:
            raise ValueError("corpus='zenodo' needs zenodo_root")
        samples = corpus_zenodo(zenodo_root, limit=limit, verbose=verbose)
        source = {"corpus": "zenodo", "root": str(zenodo_root),
                  "citation": "Zenodo 8253899 / 8346860 / 13761290, CC-BY-4.0",
                  "tiles": len(samples)}
    else:
        samples = corpus_synthetic(n_scenes=n_scenes, seed=seed, verbose=verbose)
        source = {"corpus": "synthetic", "generator": "fit.sample_scene",
                  "tiles": len(samples),
                  "caveat": "labels are the generator's own; a real-data number "
                            "is not claimed from this pack"}

    if not samples:
        raise RuntimeError("corpus is empty")

    X, Y, G = _patches(samples, per_tile=per_tile, seed=seed)
    if len(X) < batch * 2:
        raise RuntimeError(f"only {len(X)} patches; need at least {batch * 2}")

    tr, ho, hold_groups = _split_by_group(G, seed=seed % 1000)
    Xtr, Ytr = _standardise(X[tr]), Y[tr]
    Xho, Yho = _standardise(X[ho]), Y[ho]
    if verbose:
        print(f"  {len(Xtr)} train patches, {len(Xho)} holdout, "
              f"{len(hold_groups)} holdout tiles")

    model = TorchUNet()
    opt = torch.optim.Adam(model.parameters(), lr=lr)
    pos = float(Ytr.mean())
    pos_weight = torch.tensor([min(20.0, (1 - pos) / max(pos, 1e-4))])
    if verbose:
        print(f"  positive pixel share {pos:.4f}, pos_weight {float(pos_weight):.2f}")

    xt = torch.from_numpy(Xtr)[:, None]
    yt = torch.from_numpy(Ytr.astype(np.float32))[:, None]
    n = len(xt)
    rng = np.random.default_rng(seed)
    history = []

    for ep in range(epochs):
        model.train()
        order = rng.permutation(n)
        total = 0.0
        for i in range(0, n, batch):
            idx = order[i:i + batch]
            xb, yb = xt[idx], yt[idx]
            logits = model(xb)
            bce = F.binary_cross_entropy_with_logits(logits, yb, pos_weight=pos_weight)
            p = torch.sigmoid(logits)
            inter = (p * yb).sum()
            dice = 1.0 - (2 * inter + 1.0) / (p.sum() + yb.sum() + 1.0)
            loss = bce + dice
            opt.zero_grad()
            loss.backward()
            opt.step()
            total += float(loss) * len(idx)
        history.append({"epoch": ep + 1, "loss": round(total / n, 5)})
        if verbose:
            print(f"  epoch {ep + 1}/{epochs}  loss {total / n:.5f}")

    # -- holdout ---------------------------------------------------------- #
    model.eval()
    with torch.no_grad():
        probs = []
        for i in range(0, len(Xho), batch):
            xb = torch.from_numpy(Xho[i:i + batch])[:, None]
            probs.append(torch.sigmoid(model(xb)).numpy()[:, 0])
        prob = np.concatenate(probs) if probs else np.zeros_like(Yho)

    sweep = {f"{t:.2f}": segmentation_metrics(prob, Yho, t)
             for t in (0.3, 0.4, 0.5, 0.6, 0.7)}
    best_t = max(sweep, key=lambda k: sweep[k]["f1"])

    meta = {
        "pack_version": PACK_VERSION,
        "architecture": unet.ARCH_VERSION,
        "corpus": source["corpus"],
        "threshold": float(best_t),
        "trained_utc": time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime()),
    }
    weights = export_weights(model, meta)
    parity = verify_export(model, weights)
    if not parity["agrees"]:
        raise AssertionError(
            f"numpy export disagrees with torch by {parity['max_abs_diff']:.2e} "
            f"(tolerance {parity['tolerance']:.0e}); refusing to write weights"
        )

    wpath = Path(out_weights)
    np.savez_compressed(wpath, **weights)

    net = unet.UNet.from_npz(wpath)
    report = {
        "pack_version": PACK_VERSION,
        "architecture": net.describe(),
        "source": source,
        "sampling": {"patch": PATCH, "per_tile": per_tile,
                     "positive_bias": 0.6, "patches": int(len(X))},
        "split": {"by": "source tile", "holdout_fraction": 0.30,
                  "train_patches": int(len(Xtr)), "holdout_patches": int(len(Xho)),
                  "holdout_tiles": hold_groups},
        "training": {"epochs": epochs, "batch": batch, "lr": lr,
                     "loss": "BCE(pos_weight) + soft Dice",
                     "pos_weight": round(float(pos_weight), 3),
                     "history": history},
        "holdout_metrics": sweep,
        "operating_threshold": float(best_t),
        "export_parity": parity,
        "weights_file": wpath.name,
        "elapsed_s": round(time.time() - t0, 1),
    }
    Path(out_report).write_text(json.dumps(report, indent=2))
    if verbose:
        m = sweep[best_t]
        print(f"\n  holdout at threshold {best_t}: "
              f"IoU {m['iou']:.4f}  F1 {m['f1']:.4f}  "
              f"precision {m['precision']:.4f}  recall {m['recall']:.4f}")
        print(f"  export parity: max |torch - numpy| = {parity['max_abs_diff']:.2e}")
        print(f"  weights {wpath}   report {out_report}")
    return report
