"""GeoTIFF and TIFF ingestion.

A raster is not an image. The difference is the geotransform: six numbers that
convert a pixel position into a position on Earth. Everything downstream that
reports *where* something is depends on this module reading those numbers
correctly.

rasterio is used when available. It usually is not — it pulls GDAL, which is a
large native dependency and not something a hackathon venue machine will have.
So there is a fallback that reads the GeoTIFF tags directly through Pillow,
which covers the tags this project needs:

    33550  ModelPixelScale      (sx, sy, sz)
    33922  ModelTiepoint        (i, j, k, x, y, z)
    34737  GeoAsciiParams       CRS name
    34735  GeoKeyDirectory      CRS code

That is enough to build an affine transform and name the coordinate system,
which is all the evidence layer asks for.
"""

from __future__ import annotations

import math
from dataclasses import dataclass, field, replace
from pathlib import Path
from typing import Any

import numpy as np

try:                                    # pragma: no cover - environment dependent
    import rasterio                     # type: ignore
    _HAVE_RASTERIO = True
except Exception:
    _HAVE_RASTERIO = False

from PIL import Image, TiffImagePlugin

Image.MAX_IMAGE_PIXELS = None


# --------------------------------------------------------------------------- #
# Affine geotransform
# --------------------------------------------------------------------------- #

@dataclass(frozen=True)
class GeoTransform:
    """GDAL-order affine transform.

    x = c + a*col + b*row
    y = f + d*col + e*row

    Stored in GDAL's six-element order (c, a, b, f, d, e) because that is what
    every geospatial tool and every piece of documentation uses. Naming them
    after their role rather than their index keeps the arithmetic readable.
    """

    origin_x: float          # c
    pixel_width: float       # a
    row_rotation: float      # b
    origin_y: float          # f
    col_rotation: float      # d
    pixel_height: float      # e   (negative for north-up imagery)
    #: What the six numbers are measured in. Bound from `Raster.crs` so that a
    #: transform can never be read in the wrong units - see `pixel_to_lonlat`.
    crs: str = "EPSG:4326"

    @classmethod
    def identity(cls, width: int, height: int) -> "GeoTransform":
        """A transform for imagery with no georeferencing.

        Maps the raster onto the unit square. Used so that non-georeferenced
        benchmark imagery (the PNG/JPEG path the problem statement permits for
        prescribed datasets) still flows through the same code, with the
        `georeferenced` flag telling downstream code not to trust the numbers.
        """
        return cls(0.0, 1.0 / max(width, 1), 0.0, 0.0, 0.0, -1.0 / max(height, 1))

    def pixel_to_world(self, col: float, row: float) -> tuple[float, float]:
        x = self.origin_x + self.pixel_width * col + self.row_rotation * row
        y = self.origin_y + self.col_rotation * col + self.pixel_height * row
        return x, y

    def world_to_pixel(self, x: float, y: float) -> tuple[float, float]:
        det = self.pixel_width * self.pixel_height - self.row_rotation * self.col_rotation
        if abs(det) < 1e-15:
            raise ValueError("geotransform is not invertible")
        dx, dy = x - self.origin_x, y - self.origin_y
        col = (self.pixel_height * dx - self.row_rotation * dy) / det
        row = (-self.col_rotation * dx + self.pixel_width * dy) / det
        return col, row

    # -- what the coordinates mean ------------------------------------- #
    #
    # The six numbers are in the units of the raster's CRS: degrees for
    # EPSG:4326, metres for UTM. Everything that reports a place on Earth or an
    # area must know which. Before this, every transform was read as degrees:
    # a 10 m UTM pixel became 1,113 km wide, a 164 ha scene reported
    # 48,948,962,480 ha, and eastings were printed as longitudes under an
    # EPSG:4326 label. Real Cartosat and Sentinel products are UTM, so that was
    # the common case, not an edge case.

    @property
    def kind(self) -> str:
        """`geographic`, `utm`, or `unsupported`."""
        return crs_kind(self.crs)

    @property
    def can_georeference(self) -> bool:
        """Whether positions can be expressed as longitude/latitude."""
        return self.kind in ("geographic", "utm")

    def pixel_to_lonlat(self, col: float, row: float) -> tuple[float, float]:
        """(lon, lat) in WGS84 for a pixel position, whatever the source CRS."""
        x, y = self.pixel_to_world(col, row)
        kind = self.kind
        if kind == "geographic":
            return x, y
        if kind == "utm":
            zone, north = utm_zone(self.crs)
            return utm_to_lonlat(x, y, zone, north)
        raise ValueError(
            f"{self.crs} is a projection this build cannot convert to "
            "longitude/latitude; positions stay in pixel space"
        )

    def pixel_area_m2(self, col: float = 0.0, row: float = 0.0) -> float:
        """Ground area of one pixel, in square metres, at a pixel position.

        Projected CRSs are metric, so the area is the transform's determinant.
        For degrees, a degree of longitude shrinks with latitude: ignoring
        cos(latitude) overstated every area by ~9 % at the demo scene's 23 N.
        """
        det = abs(self.pixel_width * self.pixel_height
                  - self.row_rotation * self.col_rotation)
        if self.kind == "geographic":
            _, lat = self.pixel_to_world(col, row)
            return det * _M_PER_DEG_LAT * _M_PER_DEG_LON_EQ * math.cos(math.radians(lat))
        return det

    @property
    def ground_sample_distance(self) -> float:
        """Metres per pixel along a row.

        Exact for projected (metric) CRSs. For EPSG:4326 it is the east-west
        size at the origin latitude - an approximation, reported as one: good
        enough to state a scene's resolution, not to measure with. Areas use
        `pixel_area_m2`, which does not share this approximation.
        """
        if self.kind == "geographic":
            return (abs(self.pixel_width) * _M_PER_DEG_LON_EQ
                    * math.cos(math.radians(self.origin_y)))
        return abs(self.pixel_width)

    def as_tuple(self) -> tuple[float, ...]:
        return (self.origin_x, self.pixel_width, self.row_rotation,
                self.origin_y, self.col_rotation, self.pixel_height)


# --------------------------------------------------------------------------- #
# Coordinate reference systems
# --------------------------------------------------------------------------- #
#
# Only what this project meets: geographic WGS84, and UTM on WGS84 (EPSG:326zz
# north, 327zz south), which is how Cartosat, Sentinel-2 and most RISAT
# products are delivered. Anything else is refused explicitly rather than
# guessed - a projection read in the wrong units produces confident numbers
# that are wrong by orders of magnitude, and nothing downstream can tell.

_WGS84_A = 6_378_137.0
_WGS84_F = 1 / 298.257_223_563
_UTM_K0 = 0.9996
_M_PER_DEG_LON_EQ = 111_320.0
_M_PER_DEG_LAT = 110_574.0

_GEOGRAPHIC = {"EPSG:4326", "EPSG:4979", "OGC:CRS84", "CRS84", "WGS84"}


def crs_kind(crs: str) -> str:
    code = (crs or "").upper().replace(" ", "")
    if code in _GEOGRAPHIC:
        return "geographic"
    if code.startswith("EPSG:"):
        try:
            n = int(code.split(":", 1)[1])
        except ValueError:
            return "unsupported"
        if 32601 <= n <= 32660 or 32701 <= n <= 32760:
            return "utm"
    return "unsupported"


def utm_zone(crs: str) -> tuple[int, bool]:
    n = int(crs.upper().split(":", 1)[1])
    return (n - 32600, True) if n < 32700 else (n - 32700, False)


def utm_to_lonlat(easting: float, northing: float, zone: int,
                  north: bool = True) -> tuple[float, float]:
    """Inverse transverse Mercator on WGS84 - Snyder, USGS PP 1395, section 8.

    Millimetre-accurate inside a zone, far below a pixel. Written out rather
    than imported because the venue machine is not guaranteed pyproj, and a
    dependency that only this function needs is not worth that risk.
    """
    a, f, k0 = _WGS84_A, _WGS84_F, _UTM_K0
    e2 = f * (2 - f)
    ep2 = e2 / (1 - e2)
    x = easting - 500_000.0
    y = northing if north else northing - 10_000_000.0

    m = y / k0
    mu = m / (a * (1 - e2 / 4 - 3 * e2 ** 2 / 64 - 5 * e2 ** 3 / 256))
    e1 = (1 - math.sqrt(1 - e2)) / (1 + math.sqrt(1 - e2))
    phi1 = (mu + (3 * e1 / 2 - 27 * e1 ** 3 / 32) * math.sin(2 * mu)
            + (21 * e1 ** 2 / 16 - 55 * e1 ** 4 / 32) * math.sin(4 * mu)
            + (151 * e1 ** 3 / 96) * math.sin(6 * mu)
            + (1097 * e1 ** 4 / 512) * math.sin(8 * mu))

    sin1, cos1, tan1 = math.sin(phi1), math.cos(phi1), math.tan(phi1)
    c1 = ep2 * cos1 ** 2
    t1 = tan1 ** 2
    n1 = a / math.sqrt(1 - e2 * sin1 ** 2)
    r1 = a * (1 - e2) / (1 - e2 * sin1 ** 2) ** 1.5
    d = x / (n1 * k0)

    lat = phi1 - (n1 * tan1 / r1) * (
        d ** 2 / 2
        - (5 + 3 * t1 + 10 * c1 - 4 * c1 ** 2 - 9 * ep2) * d ** 4 / 24
        + (61 + 90 * t1 + 298 * c1 + 45 * t1 ** 2 - 252 * ep2 - 3 * c1 ** 2) * d ** 6 / 720)
    lon0 = math.radians((zone - 1) * 6 - 180 + 3)
    lon = lon0 + (
        d - (1 + 2 * t1 + c1) * d ** 3 / 6
        + (5 - 2 * c1 + 28 * t1 - 3 * c1 ** 2 + 8 * ep2 + 24 * t1 ** 2) * d ** 5 / 120) / cos1
    return math.degrees(lon), math.degrees(lat)


def lonlat_to_utm(lon: float, lat: float, zone: int) -> tuple[float, float]:
    """Forward transverse Mercator on WGS84 - for writing UTM test data and for
    checking `utm_to_lonlat` by round trip."""
    a, f, k0 = _WGS84_A, _WGS84_F, _UTM_K0
    e2 = f * (2 - f)
    ep2 = e2 / (1 - e2)
    phi = math.radians(lat)
    lam = math.radians(lon) - math.radians((zone - 1) * 6 - 180 + 3)
    n = a / math.sqrt(1 - e2 * math.sin(phi) ** 2)
    t = math.tan(phi) ** 2
    c = ep2 * math.cos(phi) ** 2
    aa = math.cos(phi) * lam
    m = a * ((1 - e2 / 4 - 3 * e2 ** 2 / 64 - 5 * e2 ** 3 / 256) * phi
             - (3 * e2 / 8 + 3 * e2 ** 2 / 32 + 45 * e2 ** 3 / 1024) * math.sin(2 * phi)
             + (15 * e2 ** 2 / 256 + 45 * e2 ** 3 / 1024) * math.sin(4 * phi)
             - (35 * e2 ** 3 / 3072) * math.sin(6 * phi))
    x = k0 * n * (aa + (1 - t + c) * aa ** 3 / 6
                  + (5 - 18 * t + t ** 2 + 72 * c - 58 * ep2) * aa ** 5 / 120)
    y = k0 * (m + n * math.tan(phi) * (
        aa ** 2 / 2 + (5 - t + 9 * c + 4 * c ** 2) * aa ** 4 / 24
        + (61 - 58 * t + t ** 2 + 600 * c - 330 * ep2) * aa ** 6 / 720))
    northing = y if lat >= 0 else y + 10_000_000.0
    return x + 500_000.0, northing


# --------------------------------------------------------------------------- #
# Raster
# --------------------------------------------------------------------------- #

@dataclass
class Raster:
    """One scene: pixels plus the metadata that makes them locatable."""

    data: np.ndarray                       # (bands, rows, cols), float32 in [0, 1]
    transform: GeoTransform
    crs: str = "EPSG:4326"
    georeferenced: bool = True
    sensor: str = "unknown"                # optical | sar | unknown
    band_names: list[str] = field(default_factory=list)
    source: str = ""
    acquired: str = ""
    meta: dict[str, Any] = field(default_factory=dict)

    def __post_init__(self) -> None:
        # One source of truth for units: the raster's CRS, copied into its
        # transform so no caller can read metres as degrees again.
        if self.transform.crs != self.crs:
            self.transform = replace(self.transform, crs=self.crs)
        if self.georeferenced and not self.transform.can_georeference:
            # Positions in an unconvertible projection would be printed as
            # longitude/latitude and be wrong by orders of magnitude. Degrade to
            # the pixel-space path (audit A1) and say why.
            self.georeferenced = False
            self.meta.setdefault(
                "crs_note",
                f"{self.crs} cannot be converted to longitude/latitude by this "
                "build (geographic WGS84 and UTM are supported); results are "
                "reported in pixel space.")

    # -- shape ------------------------------------------------------------- #
    @property
    def bands(self) -> int:
        return self.data.shape[0]

    @property
    def height(self) -> int:
        return self.data.shape[1]

    @property
    def width(self) -> int:
        return self.data.shape[2]

    @property
    def shape_hw(self) -> tuple[int, int]:
        return self.height, self.width

    # -- extent ------------------------------------------------------------ #
    def _to_place(self, col: float, row: float) -> tuple[float, float]:
        t = self.transform
        return t.pixel_to_lonlat(col, row) if t.can_georeference else t.pixel_to_world(col, row)

    def bounds(self) -> tuple[float, float, float, float]:
        """(min_lon, min_lat, max_lon, max_lat) over the four corners.

        In WGS84 degrees whatever the source CRS; a UTM raster's corners are
        converted, not relabelled. Native units only for an unconvertible CRS.
        """
        corners = [self._to_place(c, r)
                   for c, r in ((0, 0), (self.width, 0),
                                (0, self.height), (self.width, self.height))]
        xs = [c[0] for c in corners]
        ys = [c[1] for c in corners]
        return min(xs), min(ys), max(xs), max(ys)

    def centre(self) -> tuple[float, float]:
        return self._to_place(self.width / 2, self.height / 2)

    # -- pixels ------------------------------------------------------------ #
    def band(self, index: int) -> np.ndarray:
        return self.data[index]

    def named(self, name: str) -> np.ndarray:
        """Fetch a band by name, e.g. 'nir' or 'vv'.

        Raises rather than guessing. A silent wrong-band selection produces
        results that look plausible and are wrong, which is the worst failure
        mode this pipeline can have.
        """
        try:
            return self.data[self.band_names.index(name)]
        except ValueError as exc:
            raise KeyError(
                f"band {name!r} not in {self.band_names} for {self.source or 'raster'}"
            ) from exc

    def has(self, name: str) -> bool:
        return name in self.band_names

    def rgb(self, stretch: bool = True) -> np.ndarray:
        """(rows, cols, 3) float32 in [0, 1] for display.

        `stretch=False` returns the optical bands as they are: what M1 is shown.
        Its pre-computed answers are keyed by a hash of those exact pixels, so a
        display stretch here would turn every known image into a cache miss.

        Optical uses true colour where the bands exist. SAR is single-channel
        and is returned as greyscale — deliberately *not* colourised, because
        a false colour map on backscatter invites the reader to interpret it
        as reflectance. See ADR-003.
        """
        if self.sensor == "sar":
            # display stretch only — analysis always uses the linear values
            from .cv import percentile_stretch
            g = percentile_stretch(self.data[0], 1.0, 97.0)
            return np.repeat(g[:, :, None], 3, axis=2)
        # Real imagery gets the browser engine's display stretch (each band
        # 2nd–98th percentile, web/src/engine/render.ts); the generator's
        # pixels are already display-stretched and say so with display_gain.
        # Surface reflectance from Sentinel-style digital numbers caps the top
        # at 0.3, as the missions' true-colour products do, so cloud does not
        # take the whole range and leave the ground black.
        from .cv import percentile_stretch
        refl = self.meta.get("normalisation") == "digital numbers divided by 10000"

        def show(x: np.ndarray) -> np.ndarray:
            if not stretch or self.meta.get("display_gain"):
                return x
            if not refl:
                return percentile_stretch(x, 2.0, 98.0)
            a, b = np.percentile(x, [2.0, 98.0])
            b = min(b, 0.3)
            return np.clip((x - a) / max(b - a, 1e-9), 0, 1).astype(np.float32)
        for combo in (("red", "green", "blue"), ("r", "g", "b")):
            if all(self.has(b) for b in combo):
                return np.stack([show(self.named(b)) for b in combo], axis=2)
        if self.bands >= 3:
            return np.transpose(self.data[:3], (1, 2, 0))
        g = self.data[0]
        return np.repeat(g[:, :, None], 3, axis=2)

    def summary(self) -> dict[str, Any]:
        minx, miny, maxx, maxy = self.bounds()
        cx, cy = self.centre()
        return {
            "source": self.source,
            "sensor": self.sensor,
            "bands": self.bands,
            "band_names": self.band_names,
            "width": self.width,
            "height": self.height,
            # Without a georeference the transform maps the image onto a unit
            # square, and any CRS or metres-per-pixel read from it is invented:
            # a plain PNG was reported as EPSG:4326 at 217.4 m, with a 20 km
            # scale bar drawn over a photo of one bridge.
            "crs": self.crs if self.georeferenced else "none",
            "georeferenced": self.georeferenced,
            "geotransform": [round(v, 10) for v in self.transform.as_tuple()],
            "crs_kind": self.transform.kind,
            "gsd_m": (round(self.transform.ground_sample_distance, 2)
                      if self.georeferenced else None),
            "bounds": [round(v, 6) for v in (minx, miny, maxx, maxy)],
            "centre": [round(cy, 6), round(cx, 6)],   # lat, lon
            "acquired": self.acquired,
            **self.meta,
        }


# --------------------------------------------------------------------------- #
# Reading
# --------------------------------------------------------------------------- #

def _geokeys_from_pillow(img: Image.Image) -> tuple[GeoTransform | None, str, bool]:
    """Pull the GeoTIFF tags Pillow exposes.

    Returns (transform, crs, georeferenced). Absent tags are not an error —
    the problem statement permits PNG/JPEG for prescribed benchmark datasets,
    which carry no georeferencing at all.
    """
    tags = getattr(img, "tag_v2", {}) or {}

    scale = tags.get(33550)         # ModelPixelScale  (sx, sy, sz)
    tiepoint = tags.get(33922)      # ModelTiepoint    (i, j, k, x, y, z)

    transform = None
    if scale and tiepoint and len(scale) >= 2 and len(tiepoint) >= 6:
        sx, sy = float(scale[0]), float(scale[1])
        i, j, _k, x, y, _z = (float(v) for v in tiepoint[:6])
        # north-up: pixel height is negative
        transform = GeoTransform(
            origin_x=x - i * sx, pixel_width=sx, row_rotation=0.0,
            origin_y=y + j * sy, col_rotation=0.0, pixel_height=-sy,
        )

    crs = "EPSG:4326"
    ascii_params = tags.get(34737)
    if isinstance(ascii_params, str) and ascii_params.strip():
        crs = ascii_params.strip().strip("|")
    keydir = tags.get(34735)
    if keydir:
        # GeoKeyDirectory is flat groups of 4 shorts; 3072 = ProjectedCSType,
        # 2048 = GeographicType. The value sits in the fourth slot.
        for n in range(4, len(keydir), 4):
            key = keydir[n]
            if key in (2048, 3072):
                code = keydir[n + 3]
                if code and code != 32767:
                    crs = f"EPSG:{code}"
                break

    return transform, crs, transform is not None


def read(path: str | Path, sensor: str = "", band_names: list[str] | None = None) -> Raster:
    """Read a raster, preferring rasterio and falling back to Pillow."""
    path = Path(path)
    if not path.exists():
        raise FileNotFoundError(f"no such raster: {path}")

    if _HAVE_RASTERIO:                                   # pragma: no cover
        with rasterio.open(path) as ds:
            arr = ds.read().astype(np.float32)
            resolved = sensor or _guess_sensor(path.name, arr.shape[0])
            arr, how = normalise(arr, resolved, ds.dtypes[0])
            t = ds.transform
            gt = GeoTransform(t.c, t.a, t.b, t.f, t.d, t.e)
            return Raster(
                data=arr, transform=gt,
                crs=str(ds.crs) if ds.crs else "EPSG:4326",
                georeferenced=ds.crs is not None,
                sensor=resolved,
                band_names=band_names or _default_band_names(arr.shape[0], resolved),
                source=path.name, meta={"normalisation": how},
            )

    with Image.open(path) as img:
        transform, crs, geo = _geokeys_from_pillow(img)
        eight_bit = img.mode in ("1", "L", "P", "RGB", "RGBA", "CMYK")
        frames = []
        try:
            while True:
                frames.append(np.array(img.convert("F"), dtype=np.float32))
                img.seek(img.tell() + 1)
        except EOFError:
            pass
        if len(frames) == 1:
            a = np.array(Image.open(path).convert("RGB"), dtype=np.float32)
            arr = np.transpose(a, (2, 0, 1)) if a.ndim == 3 else frames[0][None]
        else:
            arr = np.stack(frames)

    resolved = sensor or _guess_sensor(path.name, arr.shape[0])
    arr, how = normalise(arr, resolved, "uint8" if eight_bit else "")

    height, width = arr.shape[1], arr.shape[2]
    return Raster(
        data=arr,
        transform=transform or GeoTransform.identity(width, height),
        crs=crs,
        georeferenced=geo,
        sensor=resolved,
        band_names=band_names or _default_band_names(arr.shape[0], resolved),
        source=path.name, meta={"normalisation": how},
    )


def normalise(arr: np.ndarray, sensor: str, dtype: str = "") -> tuple[np.ndarray, str]:
    """Per-sensor radiometric normalisation (ING-05), stated, never silent.

    The same rules as the browser engine's `normalise` in web/src/engine/
    upload.ts, so an upload reads identically through either engine:

      SAR      negative values are dB → linear power; linear values above 1.5
               are scaled by the 99.5th percentile of the first band
      optical  0–1 reflectance is kept; 8-bit is /255; Sentinel-2 L1C/L2A
               digital numbers (99.9th pct ≤ 12 000) are /10 000; 16-bit is
               /65 535
    """
    arr = arr.astype(np.float32)
    mx, mn = float(np.nanmax(arr)), float(np.nanmin(arr))
    if sensor == "sar":
        if mn < 0:
            return (10.0 ** (arr / 10.0)).astype(np.float32), "backscatter supplied in dB; converted to linear power"
        if mx > 1.5:
            p = float(np.percentile(arr[0], 99.5))
            return np.minimum(arr / p, 1.5).astype(np.float32), f"linear DN scaled by the 99.5th percentile ({p:.1f})"
        return arr, "linear backscatter, unscaled"
    if mx <= 1.5:
        return np.clip(arr, 0.0, 1.5).astype(np.float32), "reflectance 0–1, unscaled"
    # judged from the 99.9th percentile of the first band, not the brightest
    # pixel, so saturated cloud cannot flip a Sentinel-2 scene to /65 535
    top = float(np.percentile(arr[0], 99.9))
    div = 255.0 if (dtype == "uint8" or top <= 255) else 10000.0 if top <= 12000 else 65535.0 if top <= 65535 else top
    return np.clip(arr / div, 0.0, 1.0).astype(np.float32), f"digital numbers divided by {div:g}"


def analysis_max_side() -> int:
    """Longest side the API analyses at (SATQUERY_ANALYSIS_MAX_SIDE, default 2048)."""
    import os
    try:
        return max(256, int(os.environ.get("SATQUERY_ANALYSIS_MAX_SIDE", "2048")))
    except ValueError:
        return 2048


def fit_for_analysis(r: Raster, max_side: int | None = None) -> Raster:
    """Block-average a large raster down to the analysis size, and say so (ING-06).

    A full Sentinel-2 tile is ~120 MP; analysed at full size it is gigabytes
    of float32 and minutes of filtering on a venue laptop. The factor is an
    integer, so the geotransform stays exact — each output pixel is the mean
    of a k x k block and its pixel size is k times the original. The result
    carries `analysed_at` and `original_size`, as the browser engine's do.
    Full-resolution tiling with stitching is not done: the classical
    thresholds are global, and tiling would change them.
    """
    limit = max_side or analysis_max_side()
    side = max(r.width, r.height)
    if side <= limit:
        return r
    k = -(-side // limit)                                   # ceil division
    h, w = (r.height // k) * k, (r.width // k) * k
    data = r.data[:, :h, :w].reshape(r.bands, h // k, k, w // k, k).mean(axis=(2, 4)).astype(np.float32)
    t = r.transform
    transform = GeoTransform(t.origin_x, t.pixel_width * k, t.row_rotation * k,
                             t.origin_y, t.col_rotation * k, t.pixel_height * k, crs=t.crs)
    meta = dict(r.meta, original_size=f"{r.width}x{r.height}",
                analysed_at=f"{w // k}x{h // k} px (block mean {k}x{k} of {r.width}x{r.height}; "
                            f"SATQUERY_ANALYSIS_MAX_SIDE={limit})")
    return Raster(data=data, transform=transform, crs=r.crs, georeferenced=r.georeferenced,
                  sensor=r.sensor, band_names=list(r.band_names), source=r.source,
                  acquired=r.acquired, meta=meta)


def write_geotiff(raster: Raster, path: str | Path) -> Path:
    """Write EVERY band, one TIFF page each, carrying the geotransform tags.

    Written through Pillow so the demo data is real, georeferenced, readable
    by QGIS — not a PNG pretending to be a raster.

    It used to write `raster.rgb()`: a three-channel 8-bit *rendering*. For
    optical that was lossy; for SAR it was wrong. A two-band VV/VH scene came
    back as three bands named red, green, blue, `vh` was gone, and the first
    specialist to ask for `named("vv")` raised `KeyError`. The file looked like
    a raster and was a picture of one.

    One float page per band round-trips through `read()` unchanged, which is
    what the reader was already written to expect.
    """
    path = Path(path)
    path.parent.mkdir(parents=True, exist_ok=True)

    bands = np.clip(np.asarray(raster.data, dtype=np.float32), 0, 1)
    pages = [Image.fromarray(band, mode="F") for band in bands]
    img = pages[0]

    t = raster.transform
    info = TiffImagePlugin.ImageFileDirectory_v2()
    info[33550] = (abs(t.pixel_width), abs(t.pixel_height), 0.0)
    info[33922] = (0.0, 0.0, 0.0, t.origin_x, t.origin_y, 0.0)
    info[34737] = raster.crs + "|"
    code = 4326
    if raster.crs.upper().startswith("EPSG:"):
        try:
            code = int(raster.crs.split(":")[1])
        except ValueError:
            code = 4326
    if crs_kind(raster.crs) == "geographic":
        # GTModelType = geographic (2), GeographicType (2048)
        info[34735] = (1, 1, 0, 2, 1024, 0, 1, 2, 2048, 0, 1, code)
    else:
        # GTModelType = projected (1), ProjectedCSType (3072). Writing a UTM code
        # under GeographicType, as before, produced a file every GIS misreads.
        info[34735] = (1, 1, 0, 2, 1024, 0, 1, 1, 3072, 0, 1, code)

    img.save(path, tiffinfo=info, save_all=True, append_images=pages[1:])
    return path


def _guess_sensor(name: str, bands: int) -> str:
    """Filename evidence only, defaulting to optical — audit B4.

    Band count is not evidence of sensor type. A Cartosat-2S panchromatic
    scene is one band and entirely optical; treating it as SAR would send it
    down the speckle-filtering path and produce confident nonsense. The
    declared role from the upload always wins over this function; it is
    consulted only when nothing was declared.
    """
    low = name.lower()
    if any(k in low for k in ("s1", "sar", "grd", "risat", "vv", "vh")):
        return "sar"
    return "optical"


def _default_band_names(n: int, sensor: str = "optical") -> list[str]:
    """Names for unlabelled bands, which depend on the sensor, not the count.

    SAR polarisations are reported as supplied: VV/VH and HH/HV are both
    ordinary, and single-pol is as common as dual-pol (audit B4). A one-band
    optical raster is panchromatic, not VV.
    """
    if sensor == "sar":
        if n == 1:
            return ["vv"]
        if n == 2:
            return ["vv", "vh"]
        return [f"pol{i}" for i in range(1, n + 1)]
    if n == 1:
        return ["pan"]
    if n == 2:
        return ["b1", "b2"]
    if n == 3:
        return ["red", "green", "blue"]
    if n >= 4:
        return ["red", "green", "blue", "nir"] + [f"b{i}" for i in range(5, n + 1)]
    return [f"b{i}" for i in range(1, n + 1)]


# --------------------------------------------------------------------------- #
# Co-registration check
# --------------------------------------------------------------------------- #

def coregistration_offset(a: Raster, b: Raster) -> dict[str, Any]:
    """Estimate the misalignment between two rasters.

    The ISRO/SAC evaluation pairs arrive pre-georeferenced and co-registered,
    so this validates rather than solves — see ADR-003's note and the
    co-registration section of the analysis. Two independent signals:

      geometric  the two geotransforms should agree on the same ground extent
      phase      normalised cross-correlation peak offset, in pixels

    Phase correlation is computed on downsampled gradient magnitude, which is
    robust to the radiometric difference between optical and SAR — the two
    look nothing alike in brightness but share edges. It is trusted only when
    its peak stands out: a peak-to-sidelobe ratio below 8 means the edges did
    not match (cloud edges in the optical plate have no SAR counterpart), and
    the estimate is reported as inconclusive rather than as a misalignment.
    Measured: real Sentinel optical/SAR under 52 % cloud 5.1, pure noise 3.5;
    synthetic optical/SAR 9.4–10.7, real T1/T2 22.5, a real 6 px shift 120.
    """
    ax0, ay0, ax1, ay1 = a.bounds()
    bx0, by0, bx1, by1 = b.bounds()
    span = max(ax1 - ax0, 1e-9)
    geo_off_px = (max(abs(ax0 - bx0), abs(ay0 - by0)) / span) * a.width

    def prep(r: Raster, size: int = 128) -> np.ndarray:
        g = r.rgb().mean(axis=2)
        ys = np.linspace(0, g.shape[0] - 1, size).astype(int)
        xs = np.linspace(0, g.shape[1] - 1, size).astype(int)
        s = g[np.ix_(ys, xs)]
        gy, gx = np.gradient(s)
        m = np.hypot(gx, gy)
        m -= m.mean()
        sd = m.std()
        return m / sd if sd > 1e-8 else m

    fa, fb = np.fft.fft2(prep(a)), np.fft.fft2(prep(b))
    cross = fa * np.conj(fb)
    mag = np.abs(cross)
    corr = np.fft.ifft2(cross / np.where(mag < 1e-12, 1e-12, mag)).real
    peak = np.unravel_index(np.argmax(corr), corr.shape)
    psr = float((corr.max() - corr.mean()) / max(corr.std(), 1e-12))
    reliable = psr >= 8.0
    dy = peak[0] if peak[0] <= 64 else peak[0] - 128
    dx = peak[1] if peak[1] <= 64 else peak[1] - 128
    scale = a.width / 128.0
    phase_off_px = math.hypot(dx * scale, dy * scale)

    offset = max(geo_off_px, phase_off_px) if reliable else geo_off_px
    return {
        "aligned": bool(offset < 1.0),
        "offset_px": round(float(offset), 3),
        "geometric_px": round(float(geo_off_px), 3),
        "phase_px": round(float(phase_off_px), 3),
        "phase_psr": round(psr, 1),
        "phase_reliable": reliable,
        "shift": [int(dx * scale), int(dy * scale)] if reliable else [0, 0],
        "same_crs": a.crs == b.crs,
        "same_shape": a.shape_hw == b.shape_hw,
    }
