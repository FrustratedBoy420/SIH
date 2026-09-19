"""Bake the land mask the landing globe samples its dots from.

Downloads Natural Earth 1:110m land polygons (public domain) and rasterises
them to a 360 x 180 equirectangular PNG: one pixel per degree, white = land.
Run once from 167/; the PNG is committed, so the web build needs no network.

    python3 tools/make_landmask.py
"""

import json
import urllib.request
from pathlib import Path

from PIL import Image, ImageDraw

SRC = "https://raw.githubusercontent.com/nvkelso/natural-earth-vector/master/geojson/ne_110m_land.geojson"
OUT = Path(__file__).resolve().parent.parent / "web" / "public" / "landmask.png"
W, H, SS = 360, 180, 4  # drawn at 4x, then downsampled, so coastal cells are majority-land


def main() -> None:
    with urllib.request.urlopen(SRC, timeout=60) as r:
        gj = json.load(r)
    img = Image.new("L", (W * SS, H * SS), 0)
    draw = ImageDraw.Draw(img)
    to_px = lambda lon, lat: ((lon + 180) / 360 * W * SS, (90 - lat) / 180 * H * SS)
    for f in gj["features"]:
        g = f["geometry"]
        polys = g["coordinates"] if g["type"] == "MultiPolygon" else [g["coordinates"]]
        for poly in polys:
            draw.polygon([to_px(*p) for p in poly[0]], fill=255)
            for hole in poly[1:]:
                draw.polygon([to_px(*p) for p in hole], fill=0)
    img = img.resize((W, H), Image.Resampling.BOX).point(lambda v: 255 if v >= 128 else 0).convert("1")
    OUT.parent.mkdir(parents=True, exist_ok=True)
    img.save(OUT, optimize=True)
    land = sum(img.getdata()) / 255 / (W * H)
    print(f"{OUT} · {W}x{H} · land {land:.1%} · {OUT.stat().st_size} bytes")


if __name__ == "__main__":
    main()
