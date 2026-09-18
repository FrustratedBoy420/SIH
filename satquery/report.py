"""The downloadable report — OUT-02, OUT-03.

Built from the stored run and nothing else, so what downloads is what was on
screen. Recomputing it would be faster to write and would eventually produce a
report that disagrees with the answer it claims to document.

One self-contained HTML file: no stylesheet, no font, no script, no image
fetched from anywhere. It opens on a machine with the network unplugged
(OPS-06), which is the machine it will be opened on. `to_pdf` upgrades it when
ReportLab happens to be installed and is never required.

The section the report exists for is the last one. *"What this cannot
establish"* is generated from the run's own limits — the sensors that were
absent, the coordinates that are pixels rather than degrees, the conflicts
that survived, the confidence that was gated — because a report that only
lists findings invites the reader to assume everything else was checked.
"""

from __future__ import annotations

import html
import json
from typing import Any

CSS = """
:root { --ink:#14181f; --dim:#5b6572; --line:#dde3ea; --bg:#fff; --accent:#1c4f8f;
        --warn:#8a4b00; }
* { box-sizing:border-box; }
body { margin:0; padding:48px 56px; background:var(--bg); color:var(--ink);
       font:15px/1.6 "IBM Plex Sans","Segoe UI",system-ui,sans-serif; max-width:60rem; }
h1 { font-size:26px; margin:0 0 4px; letter-spacing:-0.01em; }
h2 { font-size:13px; text-transform:uppercase; letter-spacing:.09em;
     color:var(--dim); margin:34px 0 10px; font-weight:600; }
.sub { color:var(--dim); font-size:13px; margin:0 0 6px; }
.answer { font-size:18px; line-height:1.55; border-left:3px solid var(--accent);
          padding:10px 0 10px 16px; margin:8px 0 0; }
.badge { display:inline-block; font:11px/1 "IBM Plex Mono",ui-monospace,monospace;
         border:1px solid var(--line); border-radius:99px; padding:5px 9px;
         margin:0 6px 6px 0; color:var(--dim); }
table { border-collapse:collapse; width:100%; font-size:13px; }
th,td { text-align:left; padding:7px 10px; border-bottom:1px solid var(--line);
        vertical-align:top; }
th { color:var(--dim); font-weight:600; font-size:11px; text-transform:uppercase;
     letter-spacing:.06em; }
td.num, th.num { text-align:right; font-family:"IBM Plex Mono",ui-monospace,monospace; }
.mono { font-family:"IBM Plex Mono",ui-monospace,monospace; font-size:12px; }
.fail { color:var(--warn); }
.limits li { margin:5px 0; }
footer { margin-top:40px; padding-top:14px; border-top:1px solid var(--line);
         color:var(--dim); font-size:12px; }
@media print { body { padding:0; } h2 { break-after:avoid; } tr { break-inside:avoid; } }
"""


def _e(v: Any) -> str:
    return html.escape("" if v is None else str(v))


def _rows(headers: list[str], rows: list[list[str]], numeric: set[int] | None = None) -> str:
    numeric = numeric or set()
    head = "".join(f'<th class="{"num" if i in numeric else ""}">{_e(h)}</th>'
                   for i, h in enumerate(headers))
    body = "".join(
        "<tr>" + "".join(f'<td class="{"num" if i in numeric else ""}">{c}</td>'
                         for i, c in enumerate(r)) + "</tr>"
        for r in rows)
    return f"<table><thead><tr>{head}</tr></thead><tbody>{body}</tbody></table>"


def limits(run: dict[str, Any]) -> list[str]:
    """"What this cannot establish", derived from the run (OUT-02).

    Every line here is a fact about *this* run. Nothing is boilerplate, which
    is the only reason a reader has to keep reading it.
    """
    out: list[str] = []
    manifest = run.get("manifest", {}) or {}
    rasters = manifest.get("rasters", []) or []
    sensors = {str(r.get("sensor", "")) for r in rasters}
    ev = run.get("evidence", {}) or {}
    items = ev.get("items", []) or []

    if run.get("refused"):
        out.append("No analysis was run. The question was refused before any "
                   "model was invoked, so nothing below is a measurement of "
                   "the imagery.")
    if run.get("abstained"):
        out.append(f"No claim cleared the confidence threshold of "
                   f"{ev.get('threshold', 0):.2f}. The system abstained rather "
                   "than answering at low confidence.")
    if "sar" not in sensors:
        out.append("No SAR imagery was supplied, so nothing here is established "
                   "under cloud or at night.")
    if "optical" not in sensors:
        out.append("No optical imagery was supplied, so no statement about "
                   "colour, vegetation index or visible land cover is made.")
    if manifest.get("modality") != "bi_temporal":
        out.append("A single date was analysed. Nothing here establishes a "
                   "trend, a rate or a direction of change over time.")
    if rasters and not all(r.get("georeferenced") for r in rasters):
        out.append("At least one input carries no coordinate reference system. "
                   "Its geometry is reported in pixel coordinates; distances "
                   "and areas derived from it are not ground measurements.")
    conflicts = sorted({c for i in items for c in (i.get("conflicts") or [])})
    out.extend(conflicts)
    if any(not s.get("ok", True) for s in run.get("trace", []) or []):
        out.append("At least one step in the trace did not pass; read the "
                   "execution trace below before relying on these numbers.")
    if not out:
        out.append("Every claim above rests on a measurement that passed the "
                   "confidence gate. Confidence is calibrated on synthetic "
                   "scenes, so it ranks reliability; it is not a probability "
                   "of being correct on ISRO imagery.")
    return out


def to_html(run: dict[str, Any], environment: dict[str, Any] | None = None) -> str:
    """One self-contained file: query, answer, evidence, inputs, trace, limits."""
    env = environment or {}
    ev = run.get("evidence", {}) or {}
    items = ev.get("items", []) or []
    outcome = ("Refused" if run.get("refused")
               else "Abstained" if run.get("abstained") else "Answered")

    badges = [
        f"run {run.get('run_id', '')}",
        f"task {run.get('task') or 'n/a'}",
        f"tools {', '.join(run.get('tools') or []) or 'none'}",
        f"engine {run.get('engine', 'classical')}",
        f"confidence {float(run.get('confidence') or 0):.2f}",
        f"threshold {float(ev.get('threshold') or 0):.2f}",
        f"{float(run.get('elapsed_ms') or 0):.0f} ms",
        f"satquery {run.get('version', '')}",
    ]
    if run.get("precomputed"):
        badges.insert(0, "PRE-COMPUTED RESULT")

    ev_rows = [[
        _e(i.get("claim")),
        _e(i.get("value")) + (f" {_e(i.get('unit'))}" if i.get("unit") else ""),
        f"{float(i.get('confidence') or 0):.3f}",
        _e(i.get("modality")),
        f'{_e(i.get("source_model"))} <span class="mono">{_e(i.get("source_version"))}</span>',
        f"{float(i.get('mask_area_ha') or 0):.2f}",
        str(len(i.get("boxes") or [])),
    ] for i in items]

    r_rows = [[
        f'{_e(r.get("role"))} · {_e(r.get("source"))}',
        _e(r.get("sensor")),
        f'{_e(r.get("width"))}x{_e(r.get("height"))}',
        _e(r.get("bands")) + f' ({_e(", ".join(r.get("band_names") or []))})',
        _e(r.get("crs")) + ("" if r.get("georeferenced") else " <span class='fail'>— none</span>"),
        f'{float(r.get("gsd_m") or 0):.2f}',
        _e(r.get("acquired")),
    ] for r in (run.get("manifest", {}) or {}).get("rasters", []) or []]

    t_rows = [[
        _e(s.get("step")),
        _e(s.get("detail")),
        "ok" if s.get("ok", True) else '<span class="fail">failed</span>',
        f'{float(s.get("ms") or 0):.1f}',
    ] for s in run.get("trace", []) or []]

    params = run.get("params", {}) or {}
    param_line = ", ".join(f"{k} = {v}" for k, v in params.items()) or "defaults"
    feature_count = len((run.get("geojson", {}) or {}).get("features", []) or [])

    return f"""<!doctype html>
<html lang="en"><head><meta charset="utf-8">
<title>SatQuery run {_e(run.get('run_id'))}</title>
<style>{CSS}</style></head><body>
<h1>SatQuery AI — analysis report</h1>
<p class="sub">{_e(run.get('created'))} · {outcome}</p>
<div>{''.join(f'<span class="badge">{_e(b)}</span>' for b in badges)}</div>

<h2>Query</h2>
<p class="mono">{_e(run.get('query'))}</p>

<h2>Answer</h2>
<p class="answer">{_e(run.get('answer'))}</p>

<h2>Evidence — {len(items)} record(s), {ev.get('passing', 0)} passed the gate</h2>
{_rows(["Claim", "Value", "Confidence", "Modality", "Source model", "Area (ha)", "Boxes"],
       ev_rows, {2, 5, 6}) if ev_rows else "<p class='sub'>No evidence records.</p>"}

<h2>Inputs</h2>
{_rows(["Role and file", "Sensor", "Size", "Bands", "CRS", "GSD (m)", "Acquired"],
       r_rows, {5}) if r_rows else "<p class='sub'>No imagery was supplied.</p>"}

<h2>Parameters</h2>
<p class="mono">{_e(param_line)}</p>

<h2>Execution trace</h2>
{_rows(["Step", "Detail", "Status", "ms"], t_rows, {3})
 if t_rows else "<p class='sub'>No trace recorded.</p>"}

<h2>Geometry</h2>
<p class="sub">{feature_count} feature(s) exported as GeoJSON alongside this
report, in the coordinate system stated per input above.</p>

<h2>What this cannot establish</h2>
<ul class="limits">{''.join(f'<li>{_e(l)}</li>' for l in limits(run))}</ul>

<footer>
SatQuery AI {_e(run.get('version'))} · engine {_e(run.get('engine'))} ·
python {_e(env.get('python', ''))} · {_e(env.get('platform', ''))}<br>
Generated offline from the stored run. Reproduce it with
<span class="mono">satquery replay {_e(run.get('run_id'))}</span>.
</footer>
</body></html>"""


def to_pdf(run: dict[str, Any], environment: dict[str, Any] | None = None) -> bytes | None:
    """PDF when ReportLab is installed, None when it is not.

    Returning None rather than raising is deliberate: the HTML report is the
    deliverable and the PDF is a convenience, so a machine without ReportLab
    still exports everything OUT-02 asks for.
    """
    try:                                                    # pragma: no cover
        from io import BytesIO
        from reportlab.lib.pagesizes import A4
        from reportlab.lib.styles import getSampleStyleSheet
        from reportlab.platypus import Paragraph, SimpleDocTemplate, Spacer
    except ImportError:
        return None

    buf = BytesIO()                                         # pragma: no cover
    doc = SimpleDocTemplate(buf, pagesize=A4, title=f"SatQuery {run.get('run_id')}")
    st = getSampleStyleSheet()
    flow = [Paragraph("SatQuery AI — analysis report", st["Title"]),
            Paragraph(_e(run.get("created", "")), st["Normal"]), Spacer(1, 12),
            Paragraph("Query", st["Heading2"]), Paragraph(_e(run.get("query")), st["Normal"]),
            Paragraph("Answer", st["Heading2"]), Paragraph(_e(run.get("answer")), st["Normal"]),
            Paragraph("Evidence", st["Heading2"])]
    for i in run.get("evidence", {}).get("items", []):
        flow.append(Paragraph(
            f"{_e(i.get('claim'))} — {_e(i.get('value'))} {_e(i.get('unit'))} "
            f"(confidence {float(i.get('confidence') or 0):.3f}, "
            f"{_e(i.get('source_model'))})", st["Normal"]))
    flow.append(Paragraph("What this cannot establish", st["Heading2"]))
    for line in limits(run):
        flow.append(Paragraph("• " + _e(line), st["Normal"]))
    doc.build(flow)
    return buf.getvalue()


def geojson_bytes(run: dict[str, Any]) -> bytes:
    """The stored FeatureCollection, byte-for-byte what the run recorded."""
    return json.dumps(run.get("geojson", {"type": "FeatureCollection", "features": []}),
                      indent=2).encode("utf-8")
