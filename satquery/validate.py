"""Input validation and refusal — VAL-01 to VAL-08.

The problem statement asks the system to "check the number, modality, format,
metadata, and compatibility of the input images" before it analyses anything.
This module is that check, and the order matters: **nothing here touches a
model** (VAL-02). A refusal costs one comparison, not one forward pass, which
is why an impossible question comes back in under a second.

Three separable jobs:

    manifest          what was supplied, described
    compatibility     is the task answerable from it — the superset rule
    co-registration   are a pair actually aligned, validated not solved

The third never silently corrects anything. Warping imagery to make an answer
possible would produce a confident number resting on an assumption the user
never made. Instead the offset is measured, recorded as a conflict, and the
confidence drops (VAL-05, VAL-06).
"""

from __future__ import annotations

from dataclasses import dataclass, field
from typing import Any

from .raster import Raster, coregistration_offset
from .router import Inputs, SATISFIES

#: Above this, a pair is reported as misaligned. Two pixels is the tolerance
#: the stress suite uses (EVL-08) and roughly the registration error a
#: well-orthorectified pair carries in practice.
TOLERANCE_PX = 2.0


@dataclass
class Check:
    ok: bool
    reason: str = ""
    remedy: str = ""
    data: dict[str, Any] = field(default_factory=dict)


# --------------------------------------------------------------------------- #
# 1 — the manifest
# --------------------------------------------------------------------------- #

def manifest(inputs: Inputs) -> dict[str, Any]:
    """Count, modality, formats and metadata of what was supplied (VAL-01)."""
    m = inputs.manifest()
    m["georeferenced"] = all(r.get("georeferenced", False) for r in m["rasters"]) \
        if m["rasters"] else False
    m["sensors"] = sorted({str(r.get("sensor", "unknown")) for r in m["rasters"]})
    return m


def supplied(inputs: Inputs) -> Check:
    """Refuse an empty request before anything else looks at it."""
    if inputs.manifest()["count"] == 0:
        return Check(False,
                     "No imagery was supplied.",
                     "Upload at least one image, or load a built-in scene.")
    return Check(True)


# --------------------------------------------------------------------------- #
# 2 — compatibility (the superset rule, VAL-04)
# --------------------------------------------------------------------------- #

def satisfies(required: str, found: str) -> bool:
    """Does what was supplied satisfy what the task requires?

    A superset counts. A bi-temporal pair contains a perfectly good single
    image, so "highlight the water body" is answerable from it. The reverse
    is not true, and that asymmetry is the whole refusal path.
    """
    return found in SATISFIES.get(required, set())


# --------------------------------------------------------------------------- #
# 3 — co-registration, validated not solved (VAL-05, VAL-06)
# --------------------------------------------------------------------------- #

def _pair(inputs: Inputs) -> tuple[str, Raster, Raster] | None:
    if inputs.t1 is not None and inputs.t2 is not None:
        return "t1/t2", inputs.t1, inputs.t2
    if inputs.optical is not None and inputs.sar is not None:
        return "optical/sar", inputs.optical, inputs.sar
    return None


def coregistration(inputs: Inputs, tolerance: float = TOLERANCE_PX) -> dict[str, Any] | None:
    """Measure alignment for whichever pair is present. None when single-image.

    Shape and CRS disagreement are reported alongside the sub-pixel offset,
    because they are the two failures that make the offset itself meaningless:
    two rasters of different extents can correlate beautifully and still be
    pictures of different places.
    """
    p = _pair(inputs)
    if p is None:
        return None
    label, a, b = p
    r = coregistration_offset(a, b)
    r["pair"] = label
    r["tolerance_px"] = tolerance
    r["aligned"] = bool(r["offset_px"] <= tolerance and r["same_shape"])
    notes: list[str] = []
    if not r["same_shape"]:
        notes.append(f"The two {label} rasters differ in size "
                     f"({a.width}x{a.height} against {b.width}x{b.height}); "
                     "per-pixel comparison is not valid across them.")
    if not r["same_crs"]:
        notes.append(f"The two {label} rasters declare different coordinate "
                     f"reference systems ({a.crs} and {b.crs}).")
    if r["offset_px"] > tolerance and r["same_shape"]:
        notes.append(f"The {label} pair is misaligned by "
                     f"{r['offset_px']:.1f} px, above the {tolerance:.0f} px "
                     "tolerance; boundaries of detected regions are less "
                     "reliable than the confidence alone suggests.")
    r["conflicts"] = notes
    return r


def penalty(coreg: dict[str, Any] | None) -> float:
    """How much confidence a misalignment costs.

    Proportional to the offset and capped, because a 3 px slip degrades an
    answer and a 40 px slip invalidates it — but neither should ever drive a
    confidence negative.
    """
    if not coreg or coreg["aligned"]:
        return 0.0
    if not coreg["same_shape"]:
        return 0.35
    over = max(0.0, float(coreg["offset_px"]) - float(coreg["tolerance_px"]))
    return round(min(0.30, 0.04 * over), 3)
