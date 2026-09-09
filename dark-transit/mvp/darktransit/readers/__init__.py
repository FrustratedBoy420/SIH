"""Readers that turn real files into the types the pipeline already speaks.

Every reader in this package returns a `scene.Scene` and nothing else, so a
stage that consumes a scene cannot tell whether the pixels came from a
generator or from ESA. That is the boundary named in TECHNICAL_SPEC section 18,
delta 1, and it is the reason detection did not have to be rewritten when the
real reader landed.
"""

from __future__ import annotations

from .sentinel1 import (
    HAVE_RASTERIO,
    Sentinel1ReadError,
    available,
    read_geotiff,
    read_pair,
)

__all__ = [
    "HAVE_RASTERIO",
    "Sentinel1ReadError",
    "available",
    "read_geotiff",
    "read_pair",
]
