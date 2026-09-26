"""Page lookup and bookmarks for the report PDF.

find    <pdf> <heads.json> <out.json>    map heading id -> printed page number
outline <pdf> <heads.json> <pages.json>  write PDF bookmarks (levels 1 and 2) and metadata
"""
import json
import os
import re
import sys

import pymupdf


def norm(s):
    return re.sub(r"\s+", " ", s).strip().lower()


def find(pdf, heads_path, out_path):
    doc = pymupdf.open(pdf)
    heads = json.load(open(heads_path, encoding="utf-8"))
    pages = {}
    # 1. named destinations Chrome writes for every id that an internal link targets
    try:
        names = doc.resolve_names()
    except Exception:
        names = {}
    for h in heads:
        d = names.get(h["id"])
        if d and d.get("page", -1) >= 0:
            pages[h["id"]] = d["page"] + 1
    by_name = len(pages)
    # 2. fallback: sequential text search after the index
    if len(pages) < len(heads):
        texts = [norm(p.get_text()) for p in doc]
        start = 2
        for h in heads:
            if h["id"] in pages:
                start = pages[h["id"]] - 1
                continue
            key = norm(h["text"])[:48]
            for i in range(start, len(texts)):
                if key in texts[i]:
                    pages[h["id"]] = i + 1
                    start = i
                    break
    json.dump(pages, open(out_path, "w", encoding="utf-8"))
    print(f"pages: {len(pages)}/{len(heads)} headings located ({by_name} by named destination); {len(doc)} pages")


def outline(pdf, heads_path, pages_path):
    doc = pymupdf.open(pdf)
    heads = json.load(open(heads_path, encoding="utf-8"))
    pages = json.load(open(pages_path, encoding="utf-8"))
    toc = [[1, "Cover", 1]]
    for h in heads:
        if h["id"] in pages:
            title = f'{h["num"]}  {h["text"]}' if h["num"] else h["text"]
            toc.append([h["level"], title, pages[h["id"]]])
    # keep document order; a level-2 entry must follow a level-1 entry
    doc.set_toc(toc)
    doc.set_metadata({
        "title": "SatQuery AI — Technical Report",
        "author": "Team BUGHEBUG",
        "subject": "SIH 2026 · PS 26167 · ISRO — agentic vision-language assistant for multimodal remote sensing",
        "keywords": "SatQuery AI, remote sensing, SAR, VQA, LoRA, QLoRA, agentic, ISRO, SIH 2026",
        "creator": "SatQuery report build",
    })
    tmp = pdf + ".tmp"
    doc.save(tmp, garbage=3, deflate=True)
    doc.close()
    os.replace(tmp, pdf)
    print(f"outline: {len(toc)} bookmarks")


def check(pdf):
    doc = pymupdf.open(pdf)
    ext, internal, dangling = set(), 0, 0
    for page in doc:
        for ln in page.get_links():
            if ln["kind"] == pymupdf.LINK_URI:
                ext.add(ln["uri"])
            elif ln["kind"] in (pymupdf.LINK_GOTO, pymupdf.LINK_NAMED):
                internal += 1
                if ln.get("page", -1) < 0:
                    dangling += 1
    print(f"external URLs: {len(ext)} unique · internal links: {internal} · unresolved: {dangling} · bookmarks: {len(doc.get_toc())}")


if __name__ == "__main__":
    cmd, *args = sys.argv[1:]
    {"find": find, "outline": outline, "check": check}[cmd](*args)
