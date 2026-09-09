"""DT-3: the learned mask refinement, and the seam it plugs into.

`TECHNICAL_SPEC` section 18, delta 2 fixed this boundary before the model
existed: *called between `candidates()` and `features()`*, and *`Candidate.mask`
semantics must not change — the six features are computed on the refined mask*.
That is what this module does and all it does.

**Refine, do not replace.** The classical pass finds dark regions; it is good at
that and it is cheap. What it is weak at is the *boundary* — a fixed adaptive
threshold cuts a slick where the local statistics happen to cross, not where
the film ends. The network is asked only to redraw that boundary inside a
generous dilation of the candidate. Three consequences, all deliberate:

1. The network cannot invent a slick where the classical pass found nothing, so
   a mis-trained model degrades the geometry rather than fabricating incidents.
2. Every downstream number — area, principal axis, elongation, the six
   discriminator features — is computed on the refined mask, so the model's
   contribution shows up in the attribution, not just in a picture.
3. If refinement would empty a candidate, the classical mask is kept and the
   candidate records that refinement was rejected. An empty mask is not a
   better answer than a rough one.

**TR-G1.** Absent a weights pack the module reports itself unavailable, `detect`
runs exactly as before, and the pipeline logs the degradation. That path is
tested, because it is the one a machine without the pack takes.
"""

from __future__ import annotations

from dataclasses import dataclass
from pathlib import Path

import numpy as np

from . import raster, unet

DEFAULT_WEIGHTS = "detector.unet.v1.npz"
DEFAULT_REPORT = "detector.unet.v1.json"

# How far outside the classical mask the network is allowed to look, and to
# grow. 12 px at 100 m is 1.2 km — comfortably wider than the boundary error a
# threshold makes, far narrower than the distance to the next dark feature.
DILATE_PX = 12

# Refinement is rejected below this share of the classical area. A mask that
# collapses to a tenth of what the classical pass found is the model failing,
# not the model being precise.
MIN_RETAINED_FRACTION = 0.10


@dataclass
class Refinement:
    """What the network did to one candidate, for the trace and the dossier."""
    cid: str
    applied: bool
    reason: str
    area_before_km2: float
    area_after_km2: float
    mean_probability: float
    iou_with_classical: float

    def to_dict(self) -> dict:
        return {
            "cid": self.cid, "applied": self.applied, "reason": self.reason,
            "area_before_km2": round(self.area_before_km2, 3),
            "area_after_km2": round(self.area_after_km2, 3),
            "mean_probability": round(self.mean_probability, 4),
            "iou_with_classical": round(self.iou_with_classical, 4),
        }


class Detector:
    """A loaded pack, or an honest report that there is none."""

    def __init__(self, weights_path=DEFAULT_WEIGHTS, report_path=DEFAULT_REPORT):
        self.weights_path = Path(weights_path)
        self.report_path = Path(report_path)
        self.net: unet.UNet | None = None
        self.report: dict = {}
        self.error: str | None = None
        self.threshold = 0.5

        if not self.weights_path.exists():
            self.error = f"no weights pack at {self.weights_path}"
            return
        try:
            self.net = unet.UNet.from_npz(self.weights_path)
        except Exception as exc:
            self.error = f"{type(exc).__name__}: {exc}"
            self.net = None
            return

        if self.report_path.exists():
            import json
            try:
                self.report = json.loads(self.report_path.read_text())
                self.threshold = float(self.report.get("operating_threshold", 0.5))
            except Exception:
                self.report = {}

    @property
    def available(self) -> bool:
        return self.net is not None

    def describe(self) -> dict:
        """What went into the run manifest — DT-4's obligation, extended to the
        learned path: say which weights are in force and what they scored."""
        if not self.available:
            return {"source": "absent", "error": self.error,
                    "note": "classical path only; DT-3 degraded per section 10.4"}
        d = {
            "source": "unet",
            "weights_file": self.weights_path.name,
            "threshold": self.threshold,
            **self.net.describe(),
        }
        if self.report:
            d["corpus"] = self.report.get("source", {}).get("corpus")
            d["holdout"] = self.report.get("holdout_metrics", {}).get(
                f"{self.threshold:.2f}")
            d["export_parity"] = self.report.get("export_parity", {}).get("max_abs_diff")
            d["split"] = self.report.get("split", {}).get("by")
        return d


_CACHE: dict[str, Detector] = {}


def load(weights_path=DEFAULT_WEIGHTS, report_path=DEFAULT_REPORT) -> Detector:
    """Cached load. The pack is read once per process; the forward pass is not."""
    key = str(weights_path)
    if key not in _CACHE:
        _CACHE[key] = Detector(weights_path, report_path)
    return _CACHE[key]


def reset_cache():
    _CACHE.clear()


# --------------------------------------------------------------------------- #
# the refinement itself
# --------------------------------------------------------------------------- #

# Context the network is given around a candidate's window. The receptive
# field at the bottleneck spans about 45 px, so 48 means every pixel it must
# decide sees as much of its surroundings as training gave it.
CONTEXT_PX = 48


def _crop_box(mask: np.ndarray, margin: int) -> tuple[slice, slice]:
    """The smallest window around `mask`, grown by `margin`, inside the scene."""
    ys, xs = np.nonzero(mask)
    h, w = mask.shape
    y0 = max(0, int(ys.min()) - margin)
    y1 = min(h, int(ys.max()) + margin + 1)
    x0 = max(0, int(xs.min()) - margin)
    x1 = min(w, int(xs.max()) + margin + 1)
    return slice(y0, y1), slice(x0, x1)


def refine(scene, cands, detector: Detector | None = None,
           probability: np.ndarray | None = None):
    """Redraw each candidate's boundary with the network.

    Returns `(refinements, probability_map)`. `cands` is mutated in place —
    `Candidate.mask` keeps its meaning, which is the contract section 18 froze.

    The network is run over a **crop** around each candidate, not the whole
    scene. That is a performance decision and a correctness one at once: a
    numpy forward pass over 640² costs seconds, a crop costs tens of
    milliseconds, and the crop is also the only region this module is allowed
    to change. Standardisation is still computed from the full scene, because
    a crop that is mostly slick would otherwise normalise the slick away.

    Pass `probability` to score against a precomputed whole-scene map instead;
    `ingest --detect` does that when it wants the map itself.
    """
    det = detector or load()
    if not det.available or not cands:
        return [], None

    px_km2 = (scene.pixel_m / 1000.0) ** 2
    full = np.asarray(scene.sigma0_db, dtype=np.float32)
    mu = float(np.nanmedian(full))
    sd = float(np.nanstd(full)) or 1.0
    notes: list[Refinement] = []

    for c in cands:
        classical = c.mask
        before = float(classical.sum() * px_km2)
        # The network decides only inside a dilation of what the classical pass
        # already proposed. It redraws a boundary; it does not go looking.
        window = raster.dilate(classical, DILATE_PX)

        if probability is not None:
            prob_full = probability
        else:
            if not classical.any():
                continue
            ys, xs = _crop_box(window, CONTEXT_PX)
            z = np.clip((full[ys, xs] - mu) / sd, -6.0, 6.0)
            prob_full = np.zeros(classical.shape, dtype=np.float32)
            prob_full[ys, xs] = unet.sigmoid(det.net.forward(z[None]))

        refined = (prob_full >= det.threshold) & window

        # Keep the component that overlaps the classical mask. Thresholding a
        # probability map inside a window can leave specks; the candidate is
        # the piece that was already there.
        if refined.any():
            lab, n = raster.label(refined)
            best, best_overlap = None, 0
            for k in range(1, n + 1):
                m = lab == k
                ov = int((m & classical).sum())
                if ov > best_overlap:
                    best, best_overlap = m, ov
            refined = best if best is not None else np.zeros_like(refined)

        after = float(refined.sum() * px_km2)
        inter = int((refined & classical).sum())
        union = int((refined | classical).sum())
        iou = inter / union if union else 0.0
        mean_p = float(prob_full[classical].mean()) if classical.any() else 0.0

        if after <= 0.0 or after < MIN_RETAINED_FRACTION * before:
            notes.append(Refinement(c.cid, False,
                                    "refined mask collapsed; classical mask kept",
                                    before, after, mean_p, iou))
            continue

        c.mask = refined
        c.area_km2 = after
        notes.append(Refinement(c.cid, True, "boundary redrawn by the U-Net",
                                before, after, mean_p, iou))

    return notes, probability


def summary(notes, det: Detector) -> dict:
    """The block that goes into `02_detection.json` and the run log."""
    applied = [n for n in notes if n.applied]
    return {
        "detector": det.describe(),
        "candidates_seen": len(notes),
        "candidates_refined": len(applied),
        "mean_iou_with_classical": (
            round(float(np.mean([n.iou_with_classical for n in applied])), 4)
            if applied else None),
        "dilation_px": DILATE_PX,
        "refinements": [n.to_dict() for n in notes],
    }
