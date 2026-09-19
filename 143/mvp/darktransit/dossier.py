"""The dossier (RP-1 ... RP-4).

Page one is the limitations, above the finding. A system that hides what it
cannot establish is not evidence, it is decoration -- and a reader who only
gets as far as page one should have read the caveats, not the accusation.

HTML rather than PDF in this build; WeasyPrint renders this same template to
PDF in the full build, which is why the template is print-oriented.
"""

from __future__ import annotations

import html


def _esc(s):
    return html.escape(str(s))


def _rows(rows, cols):
    out = []
    for r in rows:
        tds = "".join(f"<td>{_esc(r.get(c[0], ''))}</td>" for c in cols)
        out.append(f"<tr>{tds}</tr>")
    return "".join(out)


CSS = """
@page { size: A4; margin: 18mm 16mm; }
* { box-sizing: border-box; }
body { font: 11pt/1.5 "IBM Plex Serif", Georgia, serif; color: #16202a; margin: 0;
       background: #f6f5f1; }
.page { background: #fff; max-width: 190mm; margin: 0 auto 10mm; padding: 16mm 14mm;
        border: 1px solid #d8d5cc; }
h1 { font: 600 21pt/1.15 "IBM Plex Sans", Helvetica, sans-serif; margin: 0 0 2mm; }
h2 { font: 600 13pt/1.2 "IBM Plex Sans", Helvetica, sans-serif; margin: 8mm 0 2mm;
     border-bottom: 1px solid #c9c5bb; padding-bottom: 1.5mm; }
h3 { font: 600 10.5pt "IBM Plex Sans", Helvetica, sans-serif; margin: 5mm 0 1.5mm; }
.meta { font: 9pt "IBM Plex Mono", ui-monospace, monospace; color: #5c6672; }
.stamp { display:inline-block; font: 8.5pt "IBM Plex Mono", monospace; letter-spacing:.08em;
         text-transform: uppercase; border:1px solid #8a5410; color:#8a5410;
         padding: 1mm 2mm; margin-bottom: 4mm; }
.limits { border-left: 3px solid #a8203f; padding-left: 5mm; }
.limits li { margin-bottom: 2.5mm; }
table { width: 100%; border-collapse: collapse; font-size: 9pt; margin-top: 2mm; }
th, td { text-align: left; padding: 1.5mm 2mm; border-bottom: 1px solid #e2dfd7;
         vertical-align: top; }
th { font: 600 8.5pt "IBM Plex Sans", sans-serif; text-transform: uppercase;
     letter-spacing: .06em; color: #5c6672; border-bottom: 1px solid #b9b4a8; }
tr.lead td { background: #fdf3e6; }
.mono { font-family: "IBM Plex Mono", ui-monospace, monospace; font-size: 9pt; }
.small { font-size: 9pt; color: #4b5561; }
.factor { display: grid; grid-template-columns: 30mm 18mm 1fr; gap: 2mm;
          padding: 1.2mm 0; border-bottom: 1px dotted #e2dfd7; font-size: 9pt; }
.factor b { font-weight: 600; }
.gate { display: grid; grid-template-columns: 8mm 42mm 1fr; gap: 2mm; font-size: 9pt;
        padding: 1.2mm 0; border-bottom: 1px dotted #e2dfd7; }
.fired { color: #a8203f; font-weight: 600; }
.ok { color: #0f6f5c; }
footer { font: 8.5pt "IBM Plex Mono", monospace; color: #77808b; margin-top: 6mm;
         border-top: 1px solid #d8d5cc; padding-top: 2mm; }
"""


def render(doc) -> str:
    d = doc
    prov = d.get("provenance", {})
    att = d.get("attribution", {})
    geom = d.get("geometry", {})
    drift = d.get("drift", {})
    dark = d.get("dark", {})
    traffic = d.get("traffic", {})
    det = d.get("detection", {})
    halted = d.get("halted") or {}
    n_pages = 4 if att else 2

    lim_items = "".join(
        f"<li><b>{_esc(x['title'])}.</b> {_esc(x['text'])}</li>"
        for x in d.get("limitations", []))

    parts = [f"<!doctype html><html><head><meta charset='utf-8'>"
             f"<title>Dark Transit dossier {_esc(d['run_id'])}</title>"
             f"<style>{CSS}</style></head><body>"]

    # ---------------- page 1: limitations, above the finding ----------------
    parts.append(f"""
<section class="page">
  <div class="stamp">Ranking for investigation &middot; not a finding of responsibility</div>
  <h1>Spill attribution assessment</h1>
  <div class="meta">
    Run {_esc(d['run_id'])} &middot; generated {_esc(d['generated_utc'])}<br>
    Incident {_esc(d.get('scenario_label', ''))} &middot; detection
    {_esc(d.get('detection_utc', ''))}<br>
    AIS provenance: <b>{_esc(prov.get('ais', 'unknown'))}</b> &middot;
    imagery: <b>{_esc(prov.get('scene', 'unknown'))}</b> &middot;
    forcing: <b>{_esc(prov.get('forcing', 'unknown'))}</b><br>
    Weight pack {_esc(att.get('weight_pack', 'n/a'))}
    ({_esc(att.get('weight_pack_version', 'n/a'))}) &middot;
    manifest {_esc(d.get('manifest_hash', '')[:16])}
  </div>

  <h2>What this assessment cannot establish</h2>
  <ol class="limits">{lim_items}</ol>

  <h2>Finding</h2>
  <p>{_esc(att.get('finding') or halted.get('detail') or 'The run halted before attribution.')}</p>

  <h2>Recommended action</h2>
  <p class="small">Where a vessel is ranked, the appropriate step is a boarding inspection at
  next port call with sampling of slop-tank contents for comparison against a slick sample if
  one can still be recovered. Transmission of this document to an enforcement body is a human
  action taken outside this system, with a human name attached to it.</p>
  <footer>Page 1 of {n_pages} &middot; Dark Transit {_esc(d.get('version', ''))}</footer>
</section>""")

    # ---------------- page 2: method and gates ----------------
    gates_html = "".join(
        f"<div class='gate'><span>{g['id']}</span><span>{_esc(g['name'])}</span>"
        f"<span class='{'fired' if g['fired'] else 'ok'}'>"
        f"{'FIRED' if g['fired'] else 'not fired'} &mdash; {_esc(g['detail'])}</span></div>"
        for g in d.get("gates", []))

    p = d.get("parameters", {})
    parts.append(f"""
<section class="page">
  <h1>Method and parameters</h1>
  <p class="small">A run is fully described by its inputs, its parameters, its forcing sources,
  its seed and its weight-pack version. Two runs with the same manifest produce the same
  scores.</p>

  <h3>Detection</h3>
  <p class="small">{_esc(det.get('method', 'not run'))}</p>
  <table>
    <tr><th>Dark candidates</th><td>{_esc(det.get('candidates', '-'))}</td>
        <th>Retained</th><td>{_esc(det.get('retained', '-'))}</td></tr>
    <tr><th>Confidence</th><td>{_esc(det.get('confidence', '-'))}</td>
        <th>Background / slick</th><td>{_esc(det.get('sea_db', '-'))} dB /
        {_esc(det.get('slick_db', '-'))} dB</td></tr>
  </table>

  <h3>Geometry</h3>
  <table>
    <tr><th>Area</th><td>{_esc(geom.get('area_km2', '-'))} km&sup2;</td>
        <th>Perimeter</th><td>{_esc(geom.get('perimeter_km', '-'))} km</td></tr>
    <tr><th>Principal axis</th><td>{_esc(geom.get('principal_axis_deg', '-'))}&deg; true</td>
        <th>Elongation</th><td>{_esc(geom.get('elongation', '-'))}</td></tr>
    <tr><th>Age</th><td colspan="3">{_esc(geom.get('age_hours', '-'))} h
        (range {_esc(geom.get('age_hours_lo', '-'))}&ndash;{_esc(geom.get('age_hours_hi', '-'))} h).
        {_esc(geom.get('age_notes', ''))}</td></tr>
  </table>

  <h3>Drift</h3>
  <table>
    <tr><th>Integrator</th><td>{_esc(p.get('integrator', '-'))}, dt {_esc(p.get('dt_s', '-'))} s</td>
        <th>Particles</th><td>{_esc(p.get('n_particles', '-'))}</td></tr>
    <tr><th>Leeway &alpha;</th><td>{_esc(p.get('leeway_alpha', '-'))}</td>
        <th>K_h</th><td>{_esc(p.get('k_h', '-'))} m&sup2;/s</td></tr>
    <tr><th>Ensemble spread</th><td colspan="3">current &sigma;
        {_esc(p.get('sigma_current', '-'))}, leeway &sigma; {_esc(p.get('sigma_alpha', '-'))}
        &mdash; representing forcing error, which dominates hindcast uncertainty</td></tr>
    <tr><th>Origin window</th><td colspan="3" class="mono">
        {_esc((drift.get('origin_window') or ['-', '-'])[0])} &rarr;
        {_esc((drift.get('origin_window') or ['-', '-'])[1])}</td></tr>
    <tr><th>Origin region r&#8325;&#8325;</th><td>{_esc(drift.get('r95_union_km', '-'))} km</td>
        <th>Local shear</th><td>{_esc(drift.get('shear_per_hour', '-'))} /h</td></tr>
  </table>
  <p class="small">{_esc(drift.get('note', ''))}</p>

  <h3>Dark channel</h3>
  <p class="small">{_esc(dark.get('reason') or dark.get('note', 'not run'))}
  {'' if not dark.get('available') else
   f"Targets {dark.get('targets')}, matched {dark.get('matched')}, unmatched {dark.get('unmatched')}, P_fa {dark.get('cfar', {}).get('pfa')}."}</p>

  <h3>Gates</h3>
  {gates_html}
  <footer>Page 2 of {n_pages} &middot; forcing: {_esc(d.get('forcing', {}).get('current', ''))};
  {_esc(d.get('forcing', {}).get('wind', ''))}</footer>
</section>""")

    if not att:
        parts.append("</body></html>")
        return "".join(parts)

    # ---------------- page 3: ranked shortlist ----------------
    w = att.get("weights", {})
    hdr = "".join(f"<th>{_esc(k)}<br><span class='small'>{_esc(v)}</span></th>"
                  for k, v in w.items())
    body = []
    for r in att.get("ranked", []):
        f = r.get("factors", {})
        cells = "".join(
            f"<td>{'&mdash;' if k in r.get('suppressed', []) else format(f.get(k, 0), '.2f')}</td>"
            for k in w)
        body.append(
            f"<tr class=\"{'lead' if r['rank'] == 1 else ''}\">"
            f"<td>{r['rank']}</td><td>{_esc(r['name'])}<br>"
            f"<span class='mono small'>{_esc(r['mmsi'])}</span></td>"
            f"<td>{_esc(r['ship_type'].replace('_', ' '))}<br>"
            f"<span class='small'>{_esc(r['length_m'])} m</span></td>"
            f"<td>{'&mdash;' if r.get('cog') is None else _esc(r['cog'])}</td>"
            f"<td>{'&mdash;' if r.get('delta_axis') is None else _esc(r['delta_axis'])}</td>"
            f"{cells}<td><b>{r['score']:.3f}</b></td></tr>")

    parts.append(f"""
<section class="page">
  <h1>Ranked shortlist</h1>
  <p class="small">All vessels intersecting the origin region within the origin window, with the
  factor scores that produced the ranking. Weights are reproduced in the header so any reader
  can recompute. A factor that could not be computed is shown as &mdash; and is excluded from
  both the numerator and the denominator rather than scored as zero.</p>
  <table>
    <tr><th>#</th><th>Vessel</th><th>Type</th><th>COG</th><th>&Delta;axis</th>{hdr}<th>Score</th></tr>
    {''.join(body)}
  </table>
  <p class="small">Leader margin <b>{_esc(att.get('leader_margin'))}</b>
  &middot; vessels in window {_esc(traffic.get('in_window', '-'))}
  &middot; dropped {_esc(traffic.get('dropped', '-'))}.</p>

  <h3>Vessels dropped, and why</h3>
  <table>
    <tr><th>Vessel</th><th>Type</th><th>Basis</th></tr>
    {''.join(f"<tr><td>{_esc(v['name'])} <span class='mono small'>{_esc(v['mmsi'])}</span></td>"
             f"<td>{_esc(v['ship_type'].replace('_', ' '))}</td><td>{_esc(v['basis'])}</td></tr>"
             for v in traffic.get('dropped_vessels', []))}
  </table>
  <footer>Page 3 of {n_pages} &middot; weight pack {_esc(att.get('weight_pack'))}</footer>
</section>""")

    # ---------------- page 4: per-factor justification ----------------
    blocks = []
    for r in att.get("ranked", [])[:4]:
        js = r.get("justifications", {})
        rows = "".join(
            f"<div class='factor'><b>{_esc(k)}</b>"
            f"<span class='mono'>{'suppressed' if k in r.get('suppressed', []) else format(r['factors'].get(k, 0), '.3f')}</span>"
            f"<span>{_esc(v)}</span></div>" for k, v in js.items())
        corr = r.get("corroboration")
        blocks.append(
            f"<h3>{r['rank']}. {_esc(r['name'])} "
            f"<span class='mono small'>{_esc(r['mmsi'])}</span> &middot; "
            f"{r['score']:.3f}</h3>{rows}"
            + (f"<p class='small'><b>Second channel:</b> {_esc(corr['text'])}.</p>" if corr else ""))

    abl = att.get("ablation", {})
    abl_rows = "".join(
        f"<tr><td>{_esc(k)}</td><td class='mono'>{_esc(v.get('leader'))}</td>"
        f"<td class='mono'>{_esc(v.get('margin'))}</td>"
        f"<td>{'leader changes' if v.get('leader_changed') else ''}</td></tr>"
        for k, v in abl.items() if k != "baseline")

    parts.append(f"""
<section class="page">
  <h1>Why each vessel scored as it did</h1>
  <p class="small">Every factor carries a written justification. No bare numbers appear in this
  product.</p>
  {''.join(blocks)}

  <h2>Sensitivity</h2>
  <p class="small">Each factor zeroed in turn, and the effect on the leader and the margin.
  Any weighting is an assumption; this table measures how much of the conclusion rests on
  each one. Baseline leader
  <span class="mono">{_esc(abl.get('baseline', {}).get('leader', '-'))}</span>,
  margin <span class="mono">{_esc(abl.get('baseline', {}).get('margin', '-'))}</span>.</p>
  <table>
    <tr><th>Factor removed</th><th>Leader</th><th>Margin</th><th></th></tr>
    {abl_rows}
  </table>
  <footer>Page 4 of {n_pages} &middot; run {_esc(d['run_id'])} &middot; reproducible from
  manifest {_esc(d.get('manifest_hash', '')[:16])}</footer>
</section>
</body></html>""")
    return "".join(parts)
