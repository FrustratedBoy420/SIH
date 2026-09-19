"""The adapted path, on the pipeline's side of the seam (ARC-01, CON-01, audit A3).

When the runtime holds a pack for a tool's adapter, the pipeline still runs the
classical specialist first — measurement is the floor, never skipped — and then
asks the runtime. What comes back is converted into evidence records *here*,
so nothing downstream ever reads raw model output.

The runtime's reply contract (both transports):

    {
      "engine": "neural+classical",
      "pack":   "<pack_id>",
      "stub":   false,                       # a stub pack says so
      "answer": "free text, optional",       # never shown as a claim
      "claims": [
        {"claim": "built-up areas", "value": 64, "unit": "areas",
         "confidence": 0.81, "modality": "optical",
         "boxes": [[x0, y0, x1, y1], ...],    # pixel coordinates, optional
         "method": "…"}
      ]
    }

A claim whose text names a claim the classical path also measured is compared
with it: a numeric disagreement beyond `AGREE` is recorded as a conflict on
both records and the adapted record loses `DISAGREE_PENALTY` — a model's number
never silently outranks a measurement (audit A3).
"""

from __future__ import annotations

import base64
import io
import os
from typing import Any

import numpy as np
from PIL import Image

from .errors import SatQueryError
from .evidence import Evidence, EvidenceSet, GeoBox
from .raster import Raster

#: Relative difference within which a model number agrees with a measurement.
AGREE = 0.25
#: What an adapted record pays when it disagrees with the measurement.
DISAGREE_PENALTY = 0.15


def _png_b64(r: Raster) -> str:
    rgb = (np.clip(r.rgb(), 0, 1) * 255).astype(np.uint8)
    buf = io.BytesIO()
    Image.fromarray(rgb, mode="RGB").save(buf, format="PNG", optimize=True)
    return base64.b64encode(buf.getvalue()).decode("ascii")


def payload(query: str, rasters: dict[str, Raster]) -> dict[str, Any]:
    """The request body: the query and each input as a display PNG plus its geometry.

    PNG rather than arrays so that the in-process and HTTP transports carry the
    same bytes, and the model sees what the user saw.
    """
    return {
        "query": query,
        "images": {role: {"png_b64": _png_b64(r), "width": r.width, "height": r.height,
                          "sensor": r.sensor, "bands": r.band_names, "crs": r.crs}
                   for role, r in rasters.items()},
    }


def _number(v: Any) -> float | None:
    try:
        return float(v)
    except (TypeError, ValueError):
        return None


def to_evidence(reply: dict[str, Any], measured: EvidenceSet, ref: Raster | None,
                version: str = "") -> list[Evidence]:
    """Convert a runtime reply into evidence, reconciling it with what was measured."""
    pack = str(reply.get("pack", "adapter"))
    out: list[Evidence] = []
    for c in reply.get("claims") or []:
        claim = str(c.get("claim", "")).strip()
        if not claim:
            continue
        boxes: list[GeoBox] = []
        for b in c.get("boxes") or []:
            if ref is not None and len(b) == 4:
                boxes.append(GeoBox.from_pixels([int(v) for v in b], ref.transform,
                                                georeferenced=ref.georeferenced))
        e = Evidence(claim=claim, value=c.get("value"), unit=str(c.get("unit", "")),
                     confidence=float(np.clip(float(c.get("confidence", 0.0)), 0.0, 1.0)),
                     modality=c.get("modality", "derived"), source_model=pack,
                     source_version=version or str(reply.get("revision", "")),
                     boxes=boxes, method=str(c.get("method", f"adapted model ({pack})")),
                     supporting=[f"runtime reply from {pack}"])
        # audit A3: a model number is checked against the measurement it restates
        mine = _number(e.value)
        for m in measured.items:
            if m.claim.lower() != claim.lower() or mine is None:
                continue
            theirs = _number(m.value)
            if theirs is None:
                continue
            gap = abs(mine - theirs) / max(abs(theirs), 1e-9)
            if gap > AGREE:
                note = (f"{pack} says {mine:g} {e.unit}".rstrip() +
                        f"; measured {theirs:g} {m.unit}".rstrip() + f" ({gap:.0%} apart)")
                e.conflicts.append(note)
                m.conflicts.append(note)
                e.confidence = round(max(0.0, e.confidence - DISAGREE_PENALTY), 3)
            else:
                e.supporting.append(f"agrees with the measured {theirs:g} within {AGREE:.0%}")
        out.append(e)
    return out


def consult(runtime: Any, adapter: str, task: str, query: str,
            rasters: dict[str, Raster], measured: EvidenceSet,
            ref: Raster | None) -> tuple[list[Evidence], dict[str, Any]]:
    """Ask the runtime; return (evidence, outcome) and never raise.

    The outcome feeds the trace: whether the adapted path actually ran, which
    pack answered, and — when it did not — why, in words a judge can read.
    """
    try:
        reply = runtime.infer(adapter, task, payload(query, rasters))
    except SatQueryError as exc:
        return [], {"ran": False, "reason": exc.message, "code": exc.code}
    except Exception as exc:                                      # noqa: BLE001
        return [], {"ran": False, "reason": f"runtime error ({type(exc).__name__})",
                    "code": "runtime_error"}
    items = to_evidence(reply, measured, ref)
    return items, {"ran": True, "pack": reply.get("pack", ""), "stub": bool(reply.get("stub")),
                   "engine": reply.get("engine", "neural+classical"), "claims": len(items)}


def timeout() -> float:
    """Seconds the pipeline waits for the runtime before serving classical only."""
    try:
        return float(os.environ.get("SATQUERY_RUNTIME_TIMEOUT", "20"))
    except ValueError:
        return 20.0
