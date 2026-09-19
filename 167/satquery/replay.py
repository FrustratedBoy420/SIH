"""Replay a stored run from its record and say whether it came out the same (OPS-01, OPS-02).

A run directory keeps the request that produced it (`request.json`: the
query, the raster ids by role, the threshold). Replaying resolves those ids
through the same path a live request takes — uploads from the raster store,
built-in scenes as `demo:<role>` — runs the pipeline again, and compares
everything a user could have read: the answer, the flags, the confidence,
each evidence record and the trace's steps. Only identity and timing fields
are exempt, because they are supposed to differ.
"""

from __future__ import annotations

from typing import Any, Callable

from .errors import SatQueryError

#: Fields that identify or time a run — expected to differ on a replay.
VOLATILE = {"run_id", "created", "elapsed_ms", "ms", "precomputed"}


def _strip(v: Any) -> Any:
    if isinstance(v, dict):
        return {k: _strip(x) for k, x in v.items() if k not in VOLATILE}
    if isinstance(v, list):
        return [_strip(x) for x in v]
    if isinstance(v, float):
        return round(v, 6)
    return v


def compare(a: dict[str, Any], b: dict[str, Any]) -> list[str]:
    """Readable differences between two results, ignoring identity and timing."""
    diffs: list[str] = []
    for key in ("answer", "refused", "abstained", "confidence", "task", "tools", "params", "engine"):
        if _strip(a.get(key)) != _strip(b.get(key)):
            diffs.append(f"{key}: {a.get(key)!r} → {b.get(key)!r}")
    ea, eb = a.get("evidence", {}).get("items", []), b.get("evidence", {}).get("items", [])
    if len(ea) != len(eb):
        diffs.append(f"evidence: {len(ea)} records → {len(eb)}")
    for i, (x, y) in enumerate(zip(ea, eb)):
        if _strip(x) != _strip(y):
            diffs.append(f"evidence[{i}] {x.get('claim')!r}: "
                         f"{x.get('value')!r} @ {x.get('confidence')} → {y.get('value')!r} @ {y.get('confidence')}")
    sa = [s.get("step") for s in a.get("trace", [])]
    sb = [s.get("step") for s in b.get("trace", [])]
    if sa != sb:
        diffs.append(f"trace steps: {sa} → {sb}")
    return diffs


def replay(record: dict[str, Any], request: dict[str, Any] | None,
           run: Callable[[str, dict[str, str], float | None], dict[str, Any]]) -> dict[str, Any]:
    """Re-run `request` with `run` and compare it with `record`."""
    if not request:
        raise SatQueryError(
            "not_replayable", "This run was stored without its request, so it cannot be replayed.",
            "Runs saved by this version record their request; re-run the query to get a replayable record.",
            status=409)
    again = run(str(request.get("query", "")), dict(request.get("inputs") or {}), request.get("threshold"))
    diffs = compare(record, again)
    return {"run_id": record.get("run_id"), "identical": not diffs, "differences": diffs,
            "request": request, "replayed": again}
