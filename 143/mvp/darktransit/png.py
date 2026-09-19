"""Minimal PNG writer, stdlib only (TR-D1).

The workstation has to show the operator the actual radar scene, not a cartoon
of it. That means getting a raster out of the pipeline and into a browser, and
the dependency policy rules out Pillow. A greyscale or paletted PNG is a
container format with four chunks and a zlib stream, so we write it directly.

Scope is deliberately tiny: 8-bit greyscale and 8-bit RGB, no interlacing, no
alpha, filter type 0. That is everything the two views need.
"""

from __future__ import annotations

import struct
import zlib

import numpy as np


def _chunk(tag: bytes, data: bytes) -> bytes:
    return (struct.pack(">I", len(data)) + tag + data
            + struct.pack(">I", zlib.crc32(tag + data) & 0xFFFFFFFF))


def _encode(rows: bytes, w: int, h: int, colour_type: int, level: int = 6) -> bytes:
    ihdr = struct.pack(">IIBBBBB", w, h, 8, colour_type, 0, 0, 0)
    return (b"\x89PNG\r\n\x1a\n"
            + _chunk(b"IHDR", ihdr)
            + _chunk(b"IDAT", zlib.compress(rows, level))
            + _chunk(b"IEND", b""))


def _scanlines(a: np.ndarray) -> bytes:
    """Prepend the per-row filter byte (0 = None) that PNG requires."""
    h = a.shape[0]
    flat = a.reshape(h, -1)
    out = np.zeros((h, flat.shape[1] + 1), dtype=np.uint8)
    out[:, 1:] = flat
    return out.tobytes()


def write_gray(path, a: np.ndarray, flip_y: bool = True, level: int = 6) -> str:
    """8-bit greyscale. `a` is uint8 (h, w).

    flip_y because our rasters are stored with row 0 at the south edge (the
    tangent-plane convention, TECHNICAL_SPEC 8.3) while PNG puts row 0 at the
    top. Getting this backwards mirrors the scene about the equator and every
    overlay lands in the wrong place, so it is a parameter with a default
    rather than an assumption.
    """
    a = np.ascontiguousarray(a, dtype=np.uint8)
    if flip_y:
        a = a[::-1]
    h, w = a.shape
    with open(path, "wb") as f:
        f.write(_encode(_scanlines(a), w, h, 0, level))
    return str(path)


def write_rgb(path, a: np.ndarray, flip_y: bool = True, level: int = 6) -> str:
    """8-bit RGB. `a` is uint8 (h, w, 3)."""
    a = np.ascontiguousarray(a, dtype=np.uint8)
    if flip_y:
        a = a[::-1]
    h, w = a.shape[:2]
    with open(path, "wb") as f:
        f.write(_encode(_scanlines(a), w, h, 2, level))
    return str(path)


def stretch_db(a: np.ndarray, lo_pct: float = 1.0, hi_pct: float = 99.0):
    """Percentile stretch of a dB raster to uint8, returning the mapping.

    The mapping is returned and emitted alongside the image so a reader can
    invert it. A rendered SAR scene with no stated stretch is a picture, not
    a measurement.
    """
    finite = a[np.isfinite(a)]
    lo = float(np.percentile(finite, lo_pct))
    hi = float(np.percentile(finite, hi_pct))
    if hi <= lo:
        hi = lo + 1.0
    v = np.clip((a - lo) / (hi - lo), 0.0, 1.0)
    return (v * 255.0 + 0.5).astype(np.uint8), dict(
        lo_db=round(lo, 2), hi_db=round(hi, 2),
        note="linear stretch of sigma-nought dB to 0-255; invert with lo + v/255*(hi-lo)")
