"""Render report pages to PNG for visual checks.

python preview.py <pdf> <outdir> sheets          contact sheets, 12 pages each
python preview.py <pdf> <outdir> pages 15 18 30  single pages at 70 dpi
"""
import os
import sys

import pymupdf
from PIL import Image

pdf, out, mode, *nums = sys.argv[1:]
os.makedirs(out, exist_ok=True)
doc = pymupdf.open(pdf)
if mode == "pages":
    for n in map(int, nums):
        doc[n - 1].get_pixmap(dpi=70).save(os.path.join(out, f"p{n}.png"))
else:
    ims = []
    for p in doc:
        pix = p.get_pixmap(dpi=45)
        ims.append(Image.frombytes("RGB", [pix.width, pix.height], pix.samples))
    w, h = ims[0].size
    for s in range(0, len(ims), 12):
        sheet = Image.new("RGB", (w * 6, h * 2), "white")
        for i, im in enumerate(ims[s:s + 12]):
            sheet.paste(im, ((i % 6) * w, (i // 6) * h))
        sheet.save(os.path.join(out, f"sheet{s // 12 + 1}.png"))
print(len(doc), "pages")
