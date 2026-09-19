"""Bake the built-in demo scenes into GeoTIFFs under web/public/scenes/.

Reads what tools/fetch_scenes.mjs left in var/scenes-raw/ and writes one
GeoTIFF per role, in the formats the missions actually ship:

    optical, t1, t2   Sentinel-2 L2A digital numbers, uint16, R G B NIR
    sar               Sentinel-1 RTC γ⁰, float32 linear power, VV VH

One band per page, which both engines read (satquery/raster.py through
Pillow, web/src/engine/upload.ts through geotiff.js). The georeference is a
real UTM 44N tiepoint + pixel scale + ProjectedCSType 32644 on the first page.
scenes.json beside them carries the provenance the interface shows.

    node tools/fetch_scenes.mjs && python3 tools/bake_scenes.py
"""

import json
from pathlib import Path

import numpy as np
from PIL import Image, TiffImagePlugin

ROOT = Path(__file__).resolve().parent.parent
RAW = ROOT / "var" / "scenes-raw"
OUT = ROOT / "web" / "public" / "scenes"

ATTRIBUTION = "Contains modified Copernicus Sentinel data {year}, processed by ESA; via Element84 Earth Search and Microsoft Planetary Computer."


def geotags(m: dict, description: str) -> TiffImagePlugin.ImageFileDirectory_v2:
    info = TiffImagePlugin.ImageFileDirectory_v2()
    minx, _miny, _maxx, maxy = m["bbox"]
    res = float(m["resolution_m"])
    info[33550] = (res, res, 0.0)                              # ModelPixelScale
    info[33922] = (0.0, 0.0, 0.0, float(minx), float(maxy), 0.0)  # ModelTiepoint: top-left
    info[34737] = f"WGS 84 / UTM zone 44N|"                    # GeoAsciiParams
    # GeoKeyDirectory: header + GTModelType=Projected, GTRasterType=PixelIsArea, ProjectedCSType
    info[34735] = (1, 1, 0, 3, 1024, 0, 1, 1, 1025, 0, 1, 1, 3072, 0, 1, int(m["epsg"]))
    info[270] = description                                    # ImageDescription
    return info


def main() -> None:
    m = json.loads((RAW / "manifest.json").read_text())
    n = int(m["size"])
    OUT.mkdir(parents=True, exist_ok=True)
    public = {"epsg": m["epsg"], "resolution_m": m["resolution_m"], "bbox": m["bbox"], "scenes": {}}
    for role, sc in m["scenes"].items():
        dtype = np.uint16 if sc["dtype"] == "Uint16Array" else np.float32
        pages = [np.fromfile(RAW / f"{role}_{b}.bin", dtype=dtype).reshape(n, n) for b in sc["bands"]]
        imgs = [Image.fromarray(p) for p in pages]
        year = sc["acquired"][:4]
        desc = f"SatQuery built-in scene · {role} · {sc['product']} · {sc['acquired']} · bands {','.join(sc['bands'])} · {ATTRIBUTION.format(year=year)}"
        path = OUT / f"{role}.tif"
        imgs[0].save(path, save_all=True, append_images=imgs[1:], tiffinfo=geotags(m, desc), compression="tiff_adobe_deflate")
        public["scenes"][role] = {**{k: v for k, v in sc.items() if k != "dtype"}, "file": f"{role}.tif",
                                  "attribution": ATTRIBUTION.format(year=year)}
        print(f"{path.relative_to(ROOT)}  {len(pages)} × {pages[0].dtype}  {path.stat().st_size // 1024} KB")
    (OUT / "scenes.json").write_text(json.dumps(public, indent=2, ensure_ascii=False) + "\n")
    print(f"{(OUT / 'scenes.json').relative_to(ROOT)}")


if __name__ == "__main__":
    main()
