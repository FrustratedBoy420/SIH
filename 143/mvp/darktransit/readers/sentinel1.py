"""Sentinel-1 GRD reader — real σ⁰ pixels in, a `Scene` out.

TECHNICAL_SPEC section 18, delta 1. The contract this file must not break is
the `Scene` dataclass together with `px_of` / `lonlat_of_px`; everything
downstream of stage 02 is written against those and nothing else.

Two source shapes are supported.

**Georeferenced GRD.** A calibrated GeoTIFF carrying a CRS and an affine
geotransform. Pixel spacing and the scene centre are read from the file.

**The Zenodo corpus.** `Sentinel-1 SAR Oil spill image dataset for train,
validate, and test deep learning models` (Zenodo 8253899 / 8346860 / 13761290,
CC-BY-4.0) — 2048x2048x2 σ⁰ tiles in decibels with 2048x2048 ground truth,
distributed *without* a geotransform. For those the caller states the centre
and the pixel spacing, and the scene records `georeferenced: False` so no
downstream consumer can mistake an assumed location for a surveyed one.

**Wind.** A real scene arrives with pixels and no wind field, and `detect`
needs one — the strongest single look-alike discriminator is "is this dark
because the wind dropped". Absent a CMEMS or ERA5 field, `wind_proxy_ms`
inverts the Bragg-like forward model that `scene.py` uses:

    σ⁰_dB = -22 + 12·log10(U10)   =>   U10 = 10^((σ⁰_dB + 22) / 12)

evaluated on a heavily smoothed σ⁰ so a slick does not read as its own calm.
This is a **proxy, not a measurement**, it is labelled as one in the scene
truth block and in the run log, and `read_geotiff(wind_field=...)` takes a real
field the moment one is available.
"""

from __future__ import annotations

import math
import re
from dataclasses import dataclass
from pathlib import Path

import numpy as np

from .. import geo, raster
from ..scene import Scene

try:                                                    # pragma: no cover
    import rasterio
    from rasterio.crs import CRS as _RioCRS
    HAVE_RASTERIO = True
except Exception:                                       # pragma: no cover
    rasterio = None
    _RioCRS = None
    HAVE_RASTERIO = False

try:                                                    # pragma: no cover
    from PIL import Image
    HAVE_PIL = True
except Exception:                                       # pragma: no cover
    Image = None
    HAVE_PIL = False


class Sentinel1ReadError(RuntimeError):
    """Raised when a file cannot be read as a σ⁰ raster."""


def available() -> dict:
    """What this reader can do on this machine — the TR-G1 capability check."""
    return {
        "rasterio": HAVE_RASTERIO,
        "pillow": HAVE_PIL,
        "georeferenced_input": HAVE_RASTERIO,
        "plain_tiff_input": HAVE_RASTERIO or HAVE_PIL,
    }


# --------------------------------------------------------------------------- #
# raw pixel access
# --------------------------------------------------------------------------- #

@dataclass
class _Raw:
    bands: np.ndarray            # (nb, ny, nx) float32
    transform: tuple | None      # affine (a, b, c, d, e, f) or None
    crs: str | None
    path: Path

    @property
    def shape(self):
        return self.bands.shape[1], self.bands.shape[2]


def _read_raw(path: Path) -> _Raw:
    if HAVE_RASTERIO:
        with rasterio.open(path) as ds:
            arr = ds.read().astype(np.float32)
            t = ds.transform
            tr = (t.a, t.b, t.c, t.d, t.e, t.f)
            crs = str(ds.crs) if ds.crs else None
            return _Raw(arr, tr, crs, path)

    if HAVE_PIL:
        frames = []
        with Image.open(path) as img:
            try:
                while True:
                    frames.append(np.array(img, dtype=np.float32))
                    img.seek(img.tell() + 1)
            except EOFError:
                pass
        if not frames:
            raise Sentinel1ReadError(f"no readable frame in {path}")
        a = frames[0] if len(frames) > 1 else frames[0]
        if a.ndim == 3:                       # (ny, nx, nb) -> (nb, ny, nx)
            arr = np.transpose(a, (2, 0, 1))
        elif len(frames) > 1:
            arr = np.stack(frames)
        else:
            arr = a[None]
        return _Raw(arr.astype(np.float32), None, None, path)

    raise Sentinel1ReadError(
        "reading a real GeoTIFF needs rasterio or Pillow; neither is installed. "
        "The synthetic path is unaffected — see TR-G1."
    )


# --------------------------------------------------------------------------- #
# radiometry
# --------------------------------------------------------------------------- #

def to_db(band: np.ndarray, *, assume: str = "auto") -> tuple[np.ndarray, str]:
    """Return σ⁰ in decibels, and the name of the conversion that was applied.

    `assume` is one of `auto`, `db`, `linear`, `dn16`. Auto reads the value
    distribution: decibel σ⁰ over water is negative and lives in roughly
    [-40, +5]; linear σ⁰ is positive and small; a 16-bit digital number is
    positive and large.
    """
    b = np.asarray(band, dtype=np.float32)
    finite = b[np.isfinite(b)]
    if finite.size == 0:
        raise Sentinel1ReadError("band is entirely non-finite")

    if assume == "auto":
        lo, hi = np.percentile(finite, [2.0, 98.0])
        if lo < -1.0 and hi < 20.0:
            assume = "db"
        elif hi > 300.0:
            assume = "dn16"
        else:
            assume = "linear"

    if assume == "db":
        return b, "already decibels"
    if assume == "linear":
        return 10.0 * np.log10(np.maximum(b, 1e-6)), "10*log10(linear sigma0)"
    if assume == "dn16":
        lin = (b / 65535.0) ** 2
        return 10.0 * np.log10(np.maximum(lin, 1e-9)), "DN^2 scaled, then 10*log10"
    raise Sentinel1ReadError(f"unknown radiometry {assume!r}")


def wind_proxy_ms(sigma0_db: np.ndarray, pixel_m: float,
                  smooth_km: float = 8.0) -> np.ndarray:
    """Invert the Bragg-like forward model for an apparent wind speed.

    A proxy. Smoothing at `smooth_km` — several times a slick's width — keeps a
    slick from lowering the wind it is scored against, which would let every
    dark patch excuse itself as a calm.
    """
    r = max(1, int(round((smooth_km * 1000.0) / max(pixel_m, 1.0) / 2.0)))
    smooth = raster.box_mean(sigma0_db, r)
    u = np.power(10.0, (smooth + 22.0) / 12.0)
    return np.clip(u, 0.5, 25.0).astype(np.float32)


# --------------------------------------------------------------------------- #
# geometry
# --------------------------------------------------------------------------- #

def _plane_and_axes(raw: _Raw, centre_lonlat, pixel_m):
    """Build the tangent plane and the metric pixel-centre axes.

    Returns (plane, x, y, pixel_m, georeferenced, note).
    """
    ny, nx = raw.shape

    if raw.transform is not None and raw.crs:
        a, b, c, d, e, f = raw.transform
        is_geographic = _is_geographic(raw.crs)
        cx = c + a * (nx / 2.0) + b * (ny / 2.0)
        cy = f + d * (nx / 2.0) + e * (ny / 2.0)

        if is_geographic:
            lon0, lat0 = float(cx), float(cy)
            plane = geo.TangentPlane(lat0, lon0)
            mx = abs(a) * plane._mlon
            my = abs(e) * plane._mlat
            px = float((mx + my) / 2.0)
            note = "geotransform in degrees, converted on the local tangent plane"
        else:
            px = float((abs(a) + abs(e)) / 2.0)
            lon0, lat0 = _projected_centre_to_lonlat(raw.crs, cx, cy, centre_lonlat)
            plane = geo.TangentPlane(lat0, lon0)
            note = f"geotransform in projected metres ({raw.crs})"

        x = (np.arange(nx, dtype=float) - (nx - 1) / 2.0) * px
        y = (np.arange(ny, dtype=float) - (ny - 1) / 2.0) * px
        return plane, x, y, px, True, note

    if centre_lonlat is None or pixel_m is None:
        raise Sentinel1ReadError(
            f"{raw.path.name} carries no geotransform, so centre_lonlat and "
            "pixel_m must be supplied. The Zenodo tiles are distributed this "
            "way; state where you are placing them rather than letting the "
            "reader invent a location."
        )

    lon0, lat0 = float(centre_lonlat[0]), float(centre_lonlat[1])
    plane = geo.TangentPlane(lat0, lon0)
    px = float(pixel_m)
    x = (np.arange(nx, dtype=float) - (nx - 1) / 2.0) * px
    y = (np.arange(ny, dtype=float) - (ny - 1) / 2.0) * px
    return plane, x, y, px, False, "no geotransform; centre and spacing supplied by caller"


def _is_geographic(crs: str) -> bool:
    if _RioCRS is not None:                              # pragma: no cover
        try:
            return bool(_RioCRS.from_string(crs).is_geographic)
        except Exception:
            pass
    return "4326" in str(crs)


def _projected_centre_to_lonlat(crs, cx, cy, fallback):
    """Centre of a projected raster as lon/lat, without a projection library."""
    if rasterio is not None:                             # pragma: no cover
        try:
            from rasterio.warp import transform as _t
            lon, lat = _t(crs, "EPSG:4326", [cx], [cy])
            return float(lon[0]), float(lat[0])
        except Exception:
            pass
    m = re.search(r"EPSG:326(\d\d)", str(crs)) or re.search(r"EPSG:327(\d\d)", str(crs))
    if m:                                # UTM, invert the transverse Mercator centre
        zone = int(m.group(1))
        lon0 = (zone - 1) * 6.0 - 180.0 + 3.0
        north = "326" in str(crs)
        lat = (cy if north else cy - 10_000_000.0) / 111_320.0
        lon = lon0 + (cx - 500_000.0) / (111_320.0 * max(math.cos(math.radians(lat)), 0.2))
        return float(lon), float(lat)
    if fallback is not None:
        return float(fallback[0]), float(fallback[1])
    raise Sentinel1ReadError(
        f"cannot place a raster in {crs} without rasterio.warp; pass centre_lonlat"
    )


# --------------------------------------------------------------------------- #
# the public reader
# --------------------------------------------------------------------------- #

def read_geotiff(path,
                 *,
                 band: int = 0,
                 centre_lonlat: tuple[float, float] | None = None,
                 pixel_m: float | None = None,
                 acquired_h: float = 0.0,
                 radiometry: str = "auto",
                 wind_field: np.ndarray | None = None,
                 land_mask: np.ndarray | None = None,
                 scene_id: str | None = None,
                 truth: dict | None = None,
                 max_side: int | None = None) -> Scene:
    """Read one calibrated σ⁰ raster as a `Scene`.

    `band` selects the polarisation channel; the Zenodo tiles carry two, and
    band 0 is the co-polarised channel that oil damping is read from.
    `max_side` decimates by an integer stride so a 2048² tile can be worked at
    the 640² the stages were budgeted against (TECHNICAL_SPEC section 14).
    """
    path = Path(path)
    if not path.exists():
        raise Sentinel1ReadError(f"no such raster: {path}")

    raw = _read_raw(path)
    nb = raw.bands.shape[0]
    if not 0 <= band < nb:
        raise Sentinel1ReadError(f"{path.name} has {nb} band(s); band {band} requested")

    db, radio_note = to_db(raw.bands[band], assume=radiometry)
    db = np.where(np.isfinite(db), db, np.nan).astype(np.float32)

    plane, x, y, px, georef, geo_note = _plane_and_axes(raw, centre_lonlat, pixel_m)

    stride = 1
    if max_side:
        stride = max(1, int(math.ceil(max(db.shape) / float(max_side))))
        if stride > 1:
            db = db[::stride, ::stride]
            x, y = x[::stride], y[::stride]
            px = px * stride
            if land_mask is not None:
                land_mask = land_mask[::stride, ::stride]
            if wind_field is not None:
                wind_field = wind_field[::stride, ::stride]

    # A real tile can carry no-data at the swath edge. Filling with the scene
    # median keeps the adaptive threshold from treating the border as the
    # darkest thing in the image.
    if np.isnan(db).any():
        db = np.where(np.isnan(db), float(np.nanmedian(db)), db).astype(np.float32)

    if wind_field is not None:
        wind = np.asarray(wind_field, dtype=np.float32)
        wind_source = "supplied field"
    else:
        wind = wind_proxy_ms(db, px)
        wind_source = "proxy inverted from smoothed sigma0 — not a measurement"

    if land_mask is None:
        land_mask = np.zeros(db.shape, dtype=bool)

    tr = dict(truth or {})
    tr.update({
        "source": "sentinel1-reader",
        "file": path.name,
        "georeferenced": bool(georef),
        "geometry_note": geo_note,
        "radiometry_note": radio_note,
        "wind_source": wind_source,
        "band_index": int(band),
        "band_count": int(nb),
        "decimation_stride": int(stride),
        "crs": raw.crs,
    })

    return Scene(
        scene_id=scene_id or path.stem,
        sigma0_db=db,
        wind_ms=wind,
        plane=plane,
        x=np.asarray(x, dtype=float),
        y=np.asarray(y, dtype=float),
        pixel_m=float(px),
        acquired_h=float(acquired_h),
        sensor="Sentinel-1",
        mode="GRD",
        polarisation="VV" if band == 0 else "VH",
        looks=4.4,
        noise_floor_db=-26.0,
        truth=tr,
        land_mask=land_mask,
    )


def read_pair(image_path, mask_path=None, **kw) -> tuple[Scene, np.ndarray | None]:
    """Read a σ⁰ tile and, when given, its ground-truth mask.

    The mask is returned separately and never attached to the scene, for the
    same reason `incident.truth` is kept out of the stages: a module that can
    see the answer cannot be said to have found it.
    """
    scene = read_geotiff(image_path, **kw)
    if mask_path is None:
        return scene, None

    raw = _read_raw(Path(mask_path))
    m = raw.bands[0]
    stride = int(scene.truth.get("decimation_stride", 1))
    if stride > 1:
        m = m[::stride, ::stride]
    if m.shape != scene.shape:
        raise Sentinel1ReadError(
            f"mask {Path(mask_path).name} is {m.shape}, scene is {scene.shape}"
        )
    return scene, m > (0.5 * float(np.nanmax(m)) if np.nanmax(m) > 1.5 else 0.5)
