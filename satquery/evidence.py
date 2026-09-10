"""The evidence layer.

Every specialist writes into one normalised record. That record is the contract
between the machine-learning half of the system and the product half, and it is
what makes ADR-007 enforceable rather than aspirational: the answer generator
is handed `Evidence`, never pixels, so it cannot invent a number it was not
given.

Three things happen here that matter:

1. **Pixel coordinates become Earth coordinates.** A box at pixels
   (120, 50, 220, 170) is not useful. The same box at 23.41 N 85.32 E,
   exported as GeoJSON, opens in QGIS.

2. **Confidence is gated.** Below threshold the system abstains rather than
   answering. Abstention is a feature, and its precision is measured.

3. **Conflicts are recorded, not resolved silently.** When optical and SAR
   disagree, the disagreement is part of the evidence and the confidence drops.
"""

from __future__ import annotations

import json
import math
from dataclasses import dataclass, field, asdict
from typing import Any, Literal

import numpy as np

from .raster import GeoTransform, Raster

Modality = Literal["optical", "sar", "fused", "temporal", "derived"]


# --------------------------------------------------------------------------- #
# geometry
# --------------------------------------------------------------------------- #

@dataclass
class GeoBox:
    """A rectangle, carried in both pixel and world coordinates."""

    x0: int
    y0: int
    x1: int
    y1: int
    lon0: float = 0.0
    lat0: float = 0.0
    lon1: float = 0.0
    lat1: float = 0.0
    area_px: int = 0
    area_ha: float = 0.0

    @classmethod
    def from_pixels(cls, bbox: list[int], transform: GeoTransform,
                    area_px: int = 0) -> "GeoBox":
        x0, y0, x1, y1 = bbox
        lon0, lat0 = transform.pixel_to_world(x0, y0)
        lon1, lat1 = transform.pixel_to_world(x1 + 1, y1 + 1)
        gsd = transform.ground_sample_distance
        area = area_px or ((x1 - x0 + 1) * (y1 - y0 + 1))
        return cls(x0, y0, x1, y1,
                   round(lon0, 6), round(lat0, 6), round(lon1, 6), round(lat1, 6),
                   int(area), round(area * gsd * gsd / 10_000.0, 3))

    def centre(self) -> tuple[float, float]:
        return (self.lat0 + self.lat1) / 2, (self.lon0 + self.lon1) / 2

    def to_geojson(self, props: dict | None = None) -> dict:
        return {
            "type": "Feature",
            "geometry": {"type": "Polygon", "coordinates": [[
                [self.lon0, self.lat0], [self.lon1, self.lat0],
                [self.lon1, self.lat1], [self.lon0, self.lat1],
                [self.lon0, self.lat0]]]},
            "properties": {"area_ha": self.area_ha, "area_px": self.area_px,
                           **(props or {})},
        }


# --------------------------------------------------------------------------- #
# evidence
# --------------------------------------------------------------------------- #

@dataclass
class Evidence:
    """One claim, its support, and where it came from."""

    claim: str
    value: Any = None
    unit: str = ""
    confidence: float = 0.0
    modality: Modality = "derived"
    source_model: str = ""
    source_version: str = ""
    boxes: list[GeoBox] = field(default_factory=list)
    mask_area_ha: float = 0.0
    supporting: list[str] = field(default_factory=list)
    conflicts: list[str] = field(default_factory=list)
    method: str = ""

    def to_dict(self) -> dict:
        d = asdict(self)
        d["boxes"] = [asdict(b) for b in self.boxes]
        d["confidence"] = round(float(self.confidence), 3)
        return d


@dataclass
class EvidenceSet:
    """Everything gathered for one query, plus the gate applied to it."""

    items: list[Evidence] = field(default_factory=list)
    threshold: float = 0.45
    crs: str = "EPSG:4326"

    def add(self, ev: Evidence) -> "EvidenceSet":
        self.items.append(ev)
        return self

    # -- gating ------------------------------------------------------------ #
    @property
    def passing(self) -> list[Evidence]:
        return [e for e in self.items if e.confidence >= self.threshold]

    @property
    def abstain(self) -> bool:
        """True when nothing cleared the gate — the system declines to answer."""
        return len(self.items) > 0 and len(self.passing) == 0

    @property
    def confidence(self) -> float:
        """Area-weighted mean over passing evidence, penalised for conflict.

        Weighted by area because a claim resting on one 12-pixel blob should
        not carry the same weight as one resting on a hectare, and penalised
        for conflict because two sensors disagreeing is a real reason to be
        less sure.
        """
        p = self.passing
        if not p:
            return 0.0
        weights = [max(e.mask_area_ha, 0.01) if e.mask_area_ha else 1.0 for e in p]
        total = sum(weights)
        base = sum(e.confidence * w for e, w in zip(p, weights)) / max(total, 1e-9)
        conflicts = sum(len(e.conflicts) for e in p)
        return round(float(max(0.0, base - 0.08 * conflicts)), 3)

    # -- export ------------------------------------------------------------ #
    def geojson(self) -> dict:
        feats = []
        for e in self.passing:
            for b in e.boxes:
                feats.append(b.to_geojson({
                    "claim": e.claim, "confidence": round(e.confidence, 3),
                    "modality": e.modality, "model": e.source_model,
                }))
        return {"type": "FeatureCollection",
                "crs": {"type": "name", "properties": {"name": self.crs}},
                "features": feats}

    def to_dict(self) -> dict:
        return {
            "threshold": self.threshold,
            "confidence": self.confidence,
            "abstain": self.abstain,
            "count": len(self.items),
            "passing": len(self.passing),
            "items": [e.to_dict() for e in self.items],
        }

    def dumps(self) -> str:
        return json.dumps(self.to_dict(), indent=2)


# --------------------------------------------------------------------------- #
# helpers
# --------------------------------------------------------------------------- #

def boxes_from_props(props: list[dict], transform: GeoTransform,
                     limit: int = 24) -> list[GeoBox]:
    return [GeoBox.from_pixels(p["bbox"], transform, p["area_px"])
            for p in props[:limit]]


def mask_area_ha(mask: np.ndarray, transform: GeoTransform) -> float:
    gsd = transform.ground_sample_distance
    return round(float(mask.sum()) * gsd * gsd / 10_000.0, 3)


def confidence_from_separation(values: np.ndarray, threshold: float) -> float:
    """Confidence derived from how cleanly a threshold splits the data.

    A threshold sitting in a deep valley between two well-separated modes is
    trustworthy. One sitting inside a single broad blob is not, and the answer
    that rests on it should say so. This is what stops every detection being
    reported at a flat, meaningless 0.9.
    """
    v = values[np.isfinite(values)]
    if v.size < 16:
        return 0.35
    below, above = v[v < threshold], v[v >= threshold]
    if below.size < 4 or above.size < 4:
        return 0.40
    m0, m1 = float(below.mean()), float(above.mean())
    s0, s2 = float(below.std()), float(above.std())
    pooled = math.sqrt((s0 * s0 + s2 * s2) / 2) or 1e-6
    d = abs(m1 - m0) / pooled                       # Cohen's d
    return round(float(min(0.97, 0.42 + 0.16 * d)), 3)
