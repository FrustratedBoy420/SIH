"""PDF rendering for the incident dossier.

TECHNICAL_SPEC section 18, delta 8. `dossier.render` was written print-first —
`@page { size: A4 }`, page breaks between sections, no dependence on a viewport
— so this module adds a renderer and changes no template.

The requirement being satisfied is RP-1: the dossier is the artefact that
leaves the system, and a body that has to act on it wants a file it can file,
sign and attach, not a URL that renders differently in two browsers.

Capability check per TR-G1: WeasyPrint is optional. Absent it, `render_pdf`
returns `None` and the caller logs a degradation and keeps the HTML. A venue
machine missing a wheel produces a dossier without a PDF; it does not produce
no dossier.
"""

from __future__ import annotations

from pathlib import Path

try:                                                    # pragma: no cover
    from weasyprint import HTML as _WeasyHTML
    HAVE_WEASYPRINT = True
    _IMPORT_ERROR = None
except Exception as exc:                                # pragma: no cover
    _WeasyHTML = None
    HAVE_WEASYPRINT = False
    _IMPORT_ERROR = f"{type(exc).__name__}: {exc}"


def available() -> dict:
    """The TR-G1 capability report, for the manifest and the run log."""
    return {
        "weasyprint": HAVE_WEASYPRINT,
        "error": _IMPORT_ERROR,
        "engine": "WeasyPrint" if HAVE_WEASYPRINT else None,
    }


def render_pdf(html: str, out_path, base_url=None) -> dict | None:
    """Write `html` to `out_path` as PDF. Returns a receipt, or None if absent.

    `base_url` lets relative asset references — the run's own scene rasters —
    resolve against the run directory, so the PDF embeds the same images the
    HTML shows rather than silently dropping them.

    The page count comes from the layout document rather than from the written
    bytes, because WeasyPrint packs its page objects into a compressed object
    stream and counting `/Type /Page` in the file finds nothing. Asking the
    renderer is both exact and cheaper than decompressing to guess.
    """
    if not HAVE_WEASYPRINT:
        return None

    out_path = Path(out_path)
    base = str(base_url) if base_url is not None else str(out_path.parent)
    doc = _WeasyHTML(string=html, base_url=base).render()
    doc.write_pdf(str(out_path))
    return {
        "path": out_path,
        "pages": len(doc.pages),
        "bytes": out_path.stat().st_size,
        "engine": "WeasyPrint",
    }


def page_count(pdf_path) -> int | None:
    """Page count of a PDF already on disk, for the self-test.

    Reads the page tree's `/Count`, decompressing object streams when the
    writer used them. Returns None when the file cannot be parsed rather than
    raising, because a missing count is a weaker claim than a wrong one.
    """
    import re
    import zlib

    p = Path(pdf_path)
    if not p.exists():
        return None
    blob = p.read_bytes()

    chunks = [blob]
    for m in re.finditer(rb"stream\r?\n", blob):
        start = m.end()
        end = blob.find(b"endstream", start)
        if end < 0:
            continue
        try:
            chunks.append(zlib.decompress(blob[start:end]))
        except Exception:
            continue

    for chunk in chunks:
        n = chunk.count(b"/Type /Page") - chunk.count(b"/Type /Pages")
        if n <= 0:
            n = chunk.count(b"/Type/Page") - chunk.count(b"/Type/Pages")
        if n > 0:
            return n
    return None
