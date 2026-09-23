"""The raster store and the run store — ING-01, OPS-01.

Two stores, one idea: nothing the API answered with may be recomputed later
and silently differ. An uploaded raster keeps its bytes; a finished run keeps
its result, its GeoJSON and the environment that produced it, so an export
matches what was on screen (OUT-03) and a figure can be traced to a run
(EVL-10).

Both are plain directories under `var/`. Filesystem for the submission;
PostGIS for spatial queries is a Build-phase item (ADR-009, OPS-05).

Identifiers
-----------
`r-<12 hex>` for an upload, `run-<utc>-<6 hex>` for a run, and the four
built-in demo rasters are addressed as `demo:<role>` — the convention the
frontend already assumes (`web/src/lib/api.ts`). A client-supplied filename
is never used to build a path (API-13); it is stored as metadata only.
"""

from __future__ import annotations

import json
import os
import platform
import secrets
import time
from pathlib import Path
from typing import Any, Iterator

from . import __version__
from .errors import SatQueryError, not_found, too_large, unsupported
from .raster import Raster, fit_for_analysis, read as read_raster

# --------------------------------------------------------------------------- #
# limits — declared here, enforced at the door, reported in the error
# --------------------------------------------------------------------------- #

ACCEPTED = (".tif", ".tiff", ".png", ".jpg", ".jpeg")

def _max_upload_mb() -> int:
    """SATQUERY_MAX_UPLOAD_MB, default 200. Lower it on a small host: a 512 MB
    free tier cannot hold a 200 MB upload and the raster decoded from it."""
    try:
        return max(1, int(os.environ.get("SATQUERY_MAX_UPLOAD_MB", "200")))
    except ValueError:
        return 200


MAX_BYTES = _max_upload_mb() * 1024 * 1024
MAX_PIXELS = 120_000_000              # ~11k x 11k; guards decompression bombs
MAX_BANDS = 16
ROLES = ("optical", "sar", "t1", "t2")

ROOT = Path(os.environ.get("SATQUERY_VAR", "var"))


def _new_id(prefix: str, n: int = 6) -> str:
    return f"{prefix}-{secrets.token_hex(n)}"


def _human(n: float, unit: str = "B") -> str:
    for suffix in ("", " K", " M", " G"):
        if n < 1024 or suffix == " G":
            return f"{n:.0f}{suffix}{unit}"
        n /= 1024
    return f"{n:.0f}{unit}"


# --------------------------------------------------------------------------- #
# raster store
# --------------------------------------------------------------------------- #

class RasterStore:
    """Uploaded rasters, keyed by `raster_id`.

    Bytes go to disk so a run can be replayed after a restart; decoded arrays
    are cached in memory because decoding a large GeoTIFF twice in one query
    is the difference between 3 s and 9 s.
    """

    def __init__(self, root: Path | str | None = None, cache: int = 8) -> None:
        self.root = Path(root) if root is not None else ROOT / "rasters"
        self.root.mkdir(parents=True, exist_ok=True)
        self._cache: dict[str, Raster] = {}
        self._order: list[str] = []
        self._limit = cache

    # -- writing ----------------------------------------------------------- #
    def put(self, data: bytes, filename: str, role: str,
            sensor: str = "") -> tuple[str, dict[str, Any]]:
        """Validate, persist, decode, summarise. Returns (raster_id, summary).

        The role is declared by the caller and is authoritative (audit B4).
        `sensor` is separate because a bi-temporal pair may be optical or SAR:
        role says *what the image is for*, sensor says *what took it*.
        """
        if role not in ROLES:
            raise SatQueryError(
                "bad_role", f"{role!r} is not a role this system accepts.",
                f"Declare one of: {', '.join(ROLES)}.")

        suffix = Path(filename or "").suffix.lower()
        if suffix not in ACCEPTED:
            raise unsupported(filename or "that file", list(ACCEPTED))
        if len(data) > MAX_BYTES:
            raise too_large("size", _human(len(data)), _human(MAX_BYTES))
        if not data:
            raise SatQueryError("empty_file", "That file is empty.",
                                "Check the file and upload it again.")

        raster_id = _new_id("r")
        d = self.root / raster_id
        d.mkdir(parents=True, exist_ok=True)
        # The stored name is ours, not the client's — a filename is never a
        # path component (API-13). The original is kept as metadata.
        path = d / f"source{suffix}"
        path.write_bytes(data)

        if sensor not in ("optical", "sar"):
            sensor = "sar" if role == "sar" else ("optical" if role == "optical" else "")

        try:
            raster = fit_for_analysis(read_raster(path, sensor=sensor))
        except SatQueryError:
            raise
        except Exception as exc:                                  # noqa: BLE001
            self.forget(raster_id)
            # The decoder's own message names the server-side path; the user
            # gets what kind of failure it was, never where the file sits (API-13).
            kind = type(exc).__name__
            raise SatQueryError(
                "unreadable", f"That file could not be read as imagery ({kind}): the "
                "header is not a TIFF, PNG or JPEG the reader recognises.",
                "Check that it is a valid GeoTIFF, PNG or JPEG and not "
                "truncated.") from exc

        self._check_decoded(raster, raster_id)

        summary = raster.summary()
        summary.update({"raster_id": raster_id, "role": role,
                        "source": filename or path.name,
                        "stored_bytes": len(data),
                        "uploaded_at": time.strftime("%Y-%m-%dT%H:%M:%SZ",
                                                     time.gmtime())})
        if not raster.georeferenced:
            # Permitted for benchmark data (ING-03), but never silently — the
            # UI and the evidence layer both need to know the coordinates are
            # pixels, not degrees (audit A1).
            summary["georeferenced"] = False
            summary["note"] = ("No coordinate reference system. Accepted as "
                               "benchmark imagery; geometry is reported in "
                               "pixel coordinates, not degrees.")

        (d / "summary.json").write_text(json.dumps(summary, indent=2),
                                        encoding="utf-8")
        self._remember(raster_id, raster)
        return raster_id, summary

    def _check_decoded(self, raster: Raster, raster_id: str) -> None:
        pixels = raster.width * raster.height
        if pixels > MAX_PIXELS:
            self.forget(raster_id)
            raise too_large("pixel count", f"{pixels:,} px", f"{MAX_PIXELS:,} px")
        if raster.bands > MAX_BANDS:
            self.forget(raster_id)
            raise too_large("band count", str(raster.bands), str(MAX_BANDS))

    # -- reading ----------------------------------------------------------- #
    def get(self, raster_id: str) -> Raster:
        if raster_id in self._cache:
            return self._cache[raster_id]
        d = self.root / raster_id
        if not raster_id.startswith("r-") or not d.is_dir():
            raise not_found("raster")
        candidates = [p for p in d.iterdir() if p.suffix.lower() in ACCEPTED]
        if not candidates:
            raise not_found("raster")
        meta = self.summary(raster_id)
        raster = fit_for_analysis(read_raster(candidates[0], sensor=str(meta.get("sensor", ""))))
        self._remember(raster_id, raster)
        return raster

    def summary(self, raster_id: str) -> dict[str, Any]:
        p = self.root / raster_id / "summary.json"
        if not p.exists():
            raise not_found("raster")
        return json.loads(p.read_text(encoding="utf-8"))

    def forget(self, raster_id: str) -> None:
        self._cache.pop(raster_id, None)
        if raster_id in self._order:
            self._order.remove(raster_id)
        d = self.root / raster_id
        if d.is_dir():
            for p in d.iterdir():
                p.unlink()
            d.rmdir()

    def _remember(self, raster_id: str, raster: Raster) -> None:
        self._cache[raster_id] = raster
        self._order.append(raster_id)
        while len(self._order) > self._limit:
            self._cache.pop(self._order.pop(0), None)

    def __len__(self) -> int:
        return sum(1 for p in self.root.iterdir() if p.is_dir())


# --------------------------------------------------------------------------- #
# run store
# --------------------------------------------------------------------------- #

class RunStore:
    """Finished runs, newest first.

    A run directory holds `run.json` (the exact response the client received),
    `evidence.geojson` (what QGIS opens) and `environment.json` (version,
    engine, seed, platform — OPS-01/OPS-02). Nothing is regenerated on read,
    which is the only way an export can be guaranteed to match the screen.
    """

    def __init__(self, root: Path | str | None = None) -> None:
        self.root = Path(root) if root is not None else ROOT / "runs"
        self.root.mkdir(parents=True, exist_ok=True)

    @staticmethod
    def new_id() -> str:
        return f"run-{time.strftime('%Y%m%dT%H%M%S', time.gmtime())}-{secrets.token_hex(3)}"

    def save(self, result: dict[str, Any], seed: int | None = None,
             request: dict[str, Any] | None = None) -> str:
        run_id = str(result.get("run_id") or self.new_id())
        d = self.root / run_id
        d.mkdir(parents=True, exist_ok=True)
        (d / "run.json").write_text(json.dumps(result, indent=2, default=str),
                                    encoding="utf-8")
        (d / "evidence.geojson").write_text(
            json.dumps(result.get("geojson", {}), indent=2), encoding="utf-8")
        if request is not None:
            # what produced it — the query, raster ids by role, threshold — so
            # the run can be replayed and checked (satquery/replay.py)
            (d / "request.json").write_text(json.dumps(request, indent=2), encoding="utf-8")
        (d / "environment.json").write_text(json.dumps({
            "version": __version__,
            "engine": result.get("engine", "classical"),
            "seed": seed,
            "python": platform.python_version(),
            "platform": platform.platform(),
            "recorded_at": time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime()),
        }, indent=2), encoding="utf-8")
        return run_id

    def get(self, run_id: str) -> dict[str, Any]:
        # Defence in depth: a run id is our own token, so anything carrying a
        # separator cannot be one and is refused before it touches the path.
        if "/" in run_id or "\\" in run_id or ".." in run_id:
            raise not_found("run")
        p = self.root / run_id / "run.json"
        if not p.exists():
            raise not_found("run")
        return json.loads(p.read_text(encoding="utf-8"))

    def request(self, run_id: str) -> dict[str, Any] | None:
        self.get(run_id)                               # validates the id
        p = self.root / run_id / "request.json"
        return json.loads(p.read_text(encoding="utf-8")) if p.exists() else None

    def environment(self, run_id: str) -> dict[str, Any]:
        p = self.root / run_id / "environment.json"
        return json.loads(p.read_text(encoding="utf-8")) if p.exists() else {}

    def ids(self) -> list[str]:
        return sorted((p.name for p in self.root.iterdir() if p.is_dir()),
                      reverse=True)

    def recent(self, limit: int = 25) -> Iterator[dict[str, Any]]:
        for run_id in self.ids()[:limit]:
            try:
                yield self.get(run_id)
            except SatQueryError:
                continue
