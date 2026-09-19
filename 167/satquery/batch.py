"""Batch mode: manifest in, results out, offline (audit B1).

ISRO scores the delivered system on a hidden set; this is how an evaluator
runs it without the web app:

    satquery batch manifest.json --out results/

The manifest is JSON — `{"items": [...]}` or a bare list — or JSON Lines, one
item per line. Each item:

    {"id": "q-001",
     "query": "Highlight the water body referred to in the query.",
     "inputs": {"optical": "scenes/a.tif", "sar": "scenes/a_sar.tif"},   # or t1/t2
     "threshold": 0.45}                                                    # optional

Paths are relative to the manifest. Every image goes through the same reader,
roles and normalisation as an upload. The run writes:

    results.jsonl         one line per item, in manifest order
    geojson/<id>.geojson  the item's evidence, EPSG:4326 (georeferenced inputs)
    summary.json          counts, timing, version, engine

Each result line carries the answer, flags, confidence, task, tools, every
evidence record with its boxes in **both** pixel and geographic coordinates,
and the trace. An item that fails is written as `{"id", "error": {...}}` and
the batch continues — one bad file must not cost the other results.
"""

from __future__ import annotations

import json
import time
from pathlib import Path
from typing import Any, Iterable

from . import __version__
from .errors import SatQueryError
from .pipeline import Pipeline
from .raster import fit_for_analysis, read as read_raster
from .router import Inputs
from .store import ROLES

SENSOR = {"optical": "optical", "sar": "sar", "t1": "", "t2": ""}


def load_manifest(path: str | Path) -> list[dict[str, Any]]:
    p = Path(path)
    text = p.read_text(encoding="utf-8").strip()
    if not text:
        return []
    if text[0] in "[{" and not (text[0] == "{" and "\n{" in text):
        data = json.loads(text)
        items = data["items"] if isinstance(data, dict) else data
    else:
        items = [json.loads(line) for line in text.splitlines() if line.strip()]
    for i, it in enumerate(items):
        it.setdefault("id", f"item-{i + 1:04d}")
    return items


def _inputs(spec: dict[str, str], base: Path) -> Inputs:
    got = {}
    for role, rel in (spec or {}).items():
        if role not in ROLES:
            raise SatQueryError("bad_role", f"{role!r} is not an input role.", f"Use one of: {', '.join(ROLES)}.")
        f = (base / rel) if not Path(rel).is_absolute() else Path(rel)
        if not f.exists():
            raise SatQueryError("missing_file", f"{rel} does not exist.", "Check the path; it is relative to the manifest.")
        try:
            got[role] = fit_for_analysis(read_raster(f, sensor=SENSOR[role]))
        except SatQueryError:
            raise
        except Exception as exc:                                  # noqa: BLE001
            raise SatQueryError("unreadable", f"{rel} could not be read as imagery ({type(exc).__name__}).",
                                "Check it is a valid GeoTIFF, PNG or JPEG.") from exc
    return Inputs(**got)


def _record(item: dict[str, Any], r: dict[str, Any]) -> dict[str, Any]:
    ev = []
    for e in r["evidence"].get("items", []):
        ev.append({
            "claim": e["claim"], "value": e["value"], "unit": e["unit"],
            "confidence": e["confidence"], "passed": e["confidence"] >= r["evidence"].get("threshold", 0.45),
            "modality": e["modality"], "source_model": e["source_model"],
            "area_ha": e["mask_area_ha"], "conflicts": e["conflicts"],
            "boxes": [{"pixel": [b["x0"], b["y0"], b["x1"], b["y1"]],
                       "geo": ([b["lon0"], b["lat1"], b["lon1"], b["lat0"]] if b.get("lon0") is not None else None),
                       "area_px": b["area_px"], "area_ha": b["area_ha"]} for b in e.get("boxes", [])],
        })
    return {"id": item["id"], "query": r["query"], "answer": r["answer"],
            "refused": r["refused"], "abstained": r["abstained"], "confidence": r["confidence"],
            "task": r["task"], "tools": r["tools"], "engine": r["engine"], "evidence": ev,
            "trace": [{"step": s["step"], "detail": s["detail"], "ok": s["ok"]} for s in r["trace"]],
            "elapsed_ms": r["elapsed_ms"]}


def run(manifest: str | Path, out: str | Path, pipeline: Pipeline | None = None,
        progress: bool = False) -> dict[str, Any]:
    base = Path(manifest).resolve().parent
    items = load_manifest(manifest)
    out = Path(out)
    (out / "geojson").mkdir(parents=True, exist_ok=True)
    pipe = pipeline or Pipeline()
    t0 = time.time()
    counts = {"answered": 0, "refused": 0, "abstained": 0, "errors": 0}
    with (out / "results.jsonl").open("w", encoding="utf-8") as fh:
        for n, item in enumerate(items, 1):
            try:
                if not str(item.get("query", "")).strip():
                    raise SatQueryError("no_query", "The item has no query.", "Add a 'query' field.")
                r = pipe.run(item["query"], _inputs(item.get("inputs", {}), base), item.get("threshold")).to_dict()
                line = _record(item, r)
                safe = "".join(ch if ch.isalnum() or ch in "-_." else "_" for ch in str(item["id"]))[:120]
                (out / "geojson" / f"{safe}.geojson").write_text(json.dumps(r["geojson"]), encoding="utf-8")
                counts["refused" if r["refused"] else "abstained" if r["abstained"] else "answered"] += 1
            except SatQueryError as exc:
                line = {"id": item["id"], **exc.payload()}
                counts["errors"] += 1
            fh.write(json.dumps(line, default=str) + "\n")
            if progress:
                state = "error" if "error" in line else "refused" if line.get("refused") else "ok"
                print(f"  [{n}/{len(items)}] {item['id']}: {state}")
    summary = {"items": len(items), **counts, "seconds": round(time.time() - t0, 2),
               "version": __version__, "engine": getattr(pipe.runtime, "transport", "inproc"),
               "manifest": str(Path(manifest)), "finished": time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime())}
    (out / "summary.json").write_text(json.dumps(summary, indent=2), encoding="utf-8")
    return summary


def write_example(path: str | Path, scenes_dir: str | Path) -> Path:
    """A starter manifest over the built-in scenes, for trying the format."""
    rel = lambda f: str(Path(scenes_dir) / f)                     # noqa: E731
    items: Iterable[dict[str, Any]] = [
        {"id": "rq1-describe", "query": "Describe the land-cover and major objects visible in this image.", "inputs": {"optical": rel("t2.tif")}},
        {"id": "rq2-water", "query": "Highlight the water body referred to in the query.", "inputs": {"optical": rel("t2.tif")}},
        {"id": "rq3-change", "query": "What changed between these two dates, and where did the change occur?", "inputs": {"t1": rel("t1.tif"), "t2": rel("t2.tif")}},
        {"id": "rq4-fusion", "query": "Use the optical and SAR images together to identify built-up and water-covered regions.", "inputs": {"optical": rel("optical.tif"), "sar": rel("sar.tif")}},
        {"id": "rq5-trend", "query": "Has the built-up area increased, decreased, or remained unchanged?", "inputs": {"t1": rel("t1.tif"), "t2": rel("t2.tif")}},
        {"id": "refuse-one-image", "query": "What changed between these two dates?", "inputs": {"optical": rel("t2.tif")}},
    ]
    p = Path(path)
    p.write_text(json.dumps({"items": list(items)}, indent=2) + "\n", encoding="utf-8")
    return p
