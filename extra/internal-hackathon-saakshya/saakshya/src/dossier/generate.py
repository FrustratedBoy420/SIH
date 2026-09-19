"""SAAKSHYA evidence-dossier generator (the money-shot).

Renders a single A4 page (PDF + PNG) from a claim + a KAAL result + a NYAYA match.
Pure matplotlib so it has zero cloud dependency and produces a real artifact today.
Satellite "chips" are synthetic textures standing in for the real decade strip;
swap them for real GEE thumbnails once the spike runs (see spike/01_kaal_gee.py).
"""
from __future__ import annotations
import json
from pathlib import Path

import numpy as np
import matplotlib
matplotlib.use("Agg")
import matplotlib.pyplot as plt
from matplotlib.patches import FancyBboxPatch, Polygon, Wedge, Rectangle
from matplotlib.gridspec import GridSpec

# --- palette (forest / evidence theme) ---
INK = "#12241c"; GREEN = "#1f5136"; MOSS = "#3f7d54"; AMBER = "#d98a2b"
PAPER = "#f6f4ec"; LINE = "#c9c3b2"; MUTED = "#5c6b60"; RED = "#b5462f"; GOOD = "#2f7d4f"
CUTOFF_YEAR = 2005


def _chip(label: str, kind: str, rng) -> np.ndarray:
    """Synthetic 64x64 RGB 'satellite chip'. forest=green texture, cultivated=tan+furrows."""
    n = 64
    if label == "forest":
        base = np.array([0.13, 0.34, 0.18])
        tex = rng.normal(0, 0.06, (n, n, 3))
        img = np.clip(base + tex, 0, 1)
    else:  # cultivated
        base = np.array([0.55, 0.47, 0.28])
        tex = rng.normal(0, 0.05, (n, n, 3))
        img = np.clip(base + tex, 0, 1)
        # faint furrows
        for c in range(0, n, 6):
            img[:, c:c + 1, :] *= 0.9
    if kind == "corona":  # grainy panchromatic look
        g = img.mean(axis=2, keepdims=True)
        img = np.repeat(np.clip(g + rng.normal(0, 0.08, g.shape), 0, 1), 3, axis=2)
    return img


def _rounded(ax, x, y, w, h, fc, ec="none", r=0.02, lw=0):
    ax.add_patch(FancyBboxPatch((x, y), w, h, boxstyle=f"round,pad=0,rounding_size={r}",
                                fc=fc, ec=ec, lw=lw, transform=ax.transAxes, clip_on=False))


def build_dossier(claim: dict, kaal: dict, match: dict, out_dir: Path) -> dict:
    out_dir = Path(out_dir); out_dir.mkdir(parents=True, exist_ok=True)
    rng = np.random.default_rng(7)
    fig = plt.figure(figsize=(8.27, 11.69), dpi=150)
    fig.patch.set_facecolor(PAPER)
    gs = GridSpec(100, 100, figure=fig, left=0.045, right=0.955, top=0.985, bottom=0.03)

    # ---------- header ----------
    ax = fig.add_axes([0, 0, 1, 1]); ax.axis("off"); ax.set_xlim(0, 1); ax.set_ylim(0, 1)
    ax.add_patch(Rectangle((0, 0.915), 1, 0.085, fc=GREEN, transform=ax.transAxes))
    ax.text(0.045, 0.958, "SAAKSHYA", color=PAPER, fontsize=23, fontweight="bold", va="center")
    ax.text(0.045, 0.930, "Evidence Dossier  ·  Forest Rights Act, 2006", color="#cfe6d6", fontsize=9.5, va="center")
    ax.text(0.955, 0.958, claim["claim_id"], color=AMBER, fontsize=15, fontweight="bold", ha="right", va="center")
    v = claim.get("_village", claim.get("village_lgd", ""))
    ax.text(0.955, 0.930,
            f"{v}, {claim.get('_district','Dindori')}  ·  {claim['claim_type']}  ·  {claim['claimant_category']}",
            color="#cfe6d6", fontsize=9, ha="right", va="center")

    # ---------- verdict banner ----------
    verdict = match.get("verdict", "")
    vcolor = {"ANSWERED": GOOD, "STRENGTHENED_NOT_PROVEN": AMBER,
              "CONTRADICTED": RED, "ROUTE_TO_SEEMA": MOSS}.get(verdict, MUTED)
    vtext = {"ANSWERED": "REJECTION ANSWERED — pre-2005 occupation evidenced",
             "STRENGTHENED_NOT_PROVEN": "CONTINUITY STRENGTHENED (OTFD 75-yr bar beyond satellite)",
             "CONTRADICTED": "IMAGERY DOES NOT SUPPORT CLAIM (withheld from adverse use)",
             "ROUTE_TO_SEEMA": "BOUNDARY DISPUTE — routed to conflict analysis",
             }.get(verdict, verdict)
    ax.add_patch(Rectangle((0.045, 0.878), 0.91, 0.03, fc=vcolor, alpha=0.14, ec=vcolor, lw=1.2))
    ax.text(0.06, 0.893, vtext, color=vcolor, fontsize=10.5, fontweight="bold", va="center")
    if "MOCK" in kaal.get("_source", ""):
        ax.text(0.945, 0.893, "◆ DEMO DATA", color=vcolor, fontsize=7.5, ha="right", va="center", fontweight="bold")

    # ---------- decade evidence strip ----------
    ax.text(0.045, 0.858, "DECADE EVIDENCE STRIP", color=INK, fontsize=10, fontweight="bold", va="center")
    strip = kaal["evidence_strip"]
    n = len(strip); x0, w, gap = 0.045, 0.118, 0.0195
    for i, s in enumerate(strip):
        xi = x0 + i * (w + gap)
        cax = fig.add_axes([xi, 0.775, w, 0.068])
        cax.imshow(_chip(s["label"], s["kind"], rng)); cax.axis("off")
        border = AMBER if s["year"] == CUTOFF_YEAR else "#00000022"
        for sp in cax.spines.values():
            sp.set_visible(True); sp.set_color(border); sp.set_linewidth(2 if s["year"] == CUTOFF_YEAR else 0.5)
        cax.patch.set_edgecolor(border)
        ax.text(xi + w / 2, 0.767, f"{s['year']}", color=INK, fontsize=8, ha="center", va="top", fontweight="bold")
        ax.text(xi + w / 2, 0.753, s["kind"], color=MUTED, fontsize=6.2, ha="center", va="top")
    ax.text(0.955, 0.858, "◍ 2005 = legal cutoff", color=AMBER, fontsize=8, ha="right", va="center")

    # ---------- NDVI breakpoint chart ----------
    cax = fig.add_axes([0.045, 0.505, 0.60, 0.205]);
    yrs = np.array(kaal["years"]); nd = np.array(kaal["ndvi"]); conv = kaal["conversion_year"]
    cax.plot(yrs, nd, color=MUTED, lw=0.8, alpha=0.5, zorder=1)
    cax.scatter(yrs, nd, s=6, color=MOSS, zorder=2)
    # segmented (LandTrendr-style) fit
    pre = yrs < conv; post = yrs >= conv
    cax.hlines(nd[pre].mean(), yrs.min(), conv, color=GREEN, lw=2.5, zorder=3)
    cax.hlines(nd[post].mean(), conv, yrs.max(), color=AMBER, lw=2.5, zorder=3)
    cax.axvline(conv, color=RED, lw=1.6, ls="--", zorder=4)
    cax.axvline(CUTOFF_YEAR, color=INK, lw=1.2, ls=":", zorder=4)
    cax.text(conv, 0.9, f" breakpoint {conv}", color=RED, fontsize=8.5, fontweight="bold", va="top")
    cax.text(CUTOFF_YEAR, 0.12, " 2005 cutoff", color=INK, fontsize=8, va="bottom", rotation=90)
    cax.set_ylim(0, 1); cax.set_xlim(yrs.min(), yrs.max())
    cax.set_ylabel("NDVI (greenness)", fontsize=8.5); cax.tick_params(labelsize=7.5)
    cax.set_title("Land-cover trajectory  ·  LandTrendr/CCDC temporal segmentation", fontsize=9,
                  color=INK, loc="left", pad=4)
    for sp in cax.spines.values(): sp.set_color(LINE)
    cax.set_facecolor("#ffffff")

    # ---------- confidence dial ----------
    dax = fig.add_axes([0.68, 0.505, 0.275, 0.205]); dax.axis("off"); dax.set_aspect("equal")
    dax.set_xlim(-1.2, 1.2); dax.set_ylim(-0.35, 1.2)
    conf = kaal["confidence"]
    dax.add_patch(Wedge((0, 0), 1, 0, 180, width=0.32, fc="#e7e2d4"))
    ccol = GOOD if conf >= 0.75 else AMBER if conf >= 0.6 else RED
    dax.add_patch(Wedge((0, 0), 1, 180 - conf * 180, 180, width=0.32, fc=ccol))
    dax.text(0, 0.30, f"{conf:.2f}", ha="center", fontsize=22, fontweight="bold", color=INK)
    dax.text(0, 0.03, "confidence", ha="center", fontsize=9, color=MUTED)
    d = kaal["confidence_drivers"]
    dax.text(0, -0.28,
             f"{d['valid_observation_years']} cloud-free yrs · ΔNDVI {d['break_magnitude_ndvi']} · "
             f"georef ±{d['corona_registration_rmse_m']}m",
             ha="center", fontsize=6.6, color=MUTED)

    # ---------- finding ----------
    ax.add_patch(Rectangle((0.045, 0.40), 0.91, 0.085, fc="#ffffff", ec=LINE, lw=1))
    ax.text(0.06, 0.470, "FINDING", color=GREEN, fontsize=10, fontweight="bold", va="center")
    finding = match.get("finding", "")
    ax.text(0.06, 0.432, _wrap(finding, 96), color=INK, fontsize=9, va="center", linespacing=1.4)

    # ---------- rejection-reason match table ----------
    ax.text(0.045, 0.378, "REJECTION-REASON MATCH", color=INK, fontsize=10, fontweight="bold", va="center")
    rows = [
        ("Stated rejection reason", match.get("reason_label", "")),
        ("Answered by", match.get("answered_by_evidence", "")),
        ("Producing module", match.get("producing_band", "")),
        ("Verdict", verdict.replace("_", " ")),
    ]
    ry = 0.360
    for k, val in rows:
        ax.text(0.06, ry, k, color=MUTED, fontsize=8.5, va="center")
        ax.text(0.34, ry, _wrap(str(val), 82), color=INK, fontsize=8.5, va="center")
        ax.hlines(ry - 0.011, 0.06, 0.94, color="#e6e1d3", lw=0.6, transform=ax.transAxes)
        ry -= 0.026

    # ---------- appeal box ----------
    ay = 0.235
    ax.add_patch(Rectangle((0.045, ay - 0.045), 0.44, 0.075, fc="#eef4ee", ec=MOSS, lw=1))
    ax.text(0.06, ay + 0.012, "APPEAL", color=GREEN, fontsize=9.5, fontweight="bold", va="center")
    ws = match.get("window_status", "N/A")
    wcol = GOOD if ws == "OPEN" else RED if ws == "LAPSED" else MUTED
    ax.text(0.06, ay - 0.012,
            f"Forum: {match.get('appeal_forum','—')}  ({match.get('appeal_statute','')})",
            color=INK, fontsize=8.3, va="center")
    ax.text(0.06, ay - 0.033,
            f"Deadline: {match.get('appeal_deadline','—')}   [{ws}]",
            color=wcol, fontsize=8.3, fontweight="bold", va="center")

    # ---------- slots ----------
    ax.add_patch(Rectangle((0.515, ay - 0.045), 0.44, 0.075, fc="none", ec=LINE, lw=1, ls="--"))
    ax.text(0.53, ay + 0.012, "TO ATTACH (Rule 13 · any two)", color=MUTED, fontsize=8.5, fontweight="bold", va="center")
    ax.text(0.53, ay - 0.013, "☐ Oral testimony of elders (IndicWhisper)", color=MUTED, fontsize=7.8, va="center")
    ax.text(0.53, ay - 0.032, "☐ Gram Sabha resolution", color=MUTED, fontsize=7.8, va="center")

    # ---------- legal basis + disclaimer ----------
    ax.hlines(0.135, 0.045, 0.955, color=LINE, lw=0.8, transform=ax.transAxes)
    ax.text(0.045, 0.118, "LEGAL BASIS", color=INK, fontsize=8.5, fontweight="bold", va="center")
    ax.text(0.045, 0.088, _wrap(match.get("legal_basis", ""), 118), color=MUTED, fontsize=7.4, va="center", linespacing=1.4)
    ax.text(0.045, 0.040,
            _wrap("This is decision-support evidence, NOT legal proof of right and NOT legal advice. "
                  "Satellite imagery is supplementary under Rule 13 and cannot be the sole/decisive "
                  "basis for a claim. Demo uses synthetic data.", 128),
            color=RED, fontsize=6.8, va="center", style="italic", linespacing=1.5)

    pdf = out_dir / f"dossier_{claim['claim_id']}.pdf"
    png = out_dir / f"dossier_{claim['claim_id']}.png"
    fig.savefig(pdf); fig.savefig(png, dpi=150); plt.close(fig)
    return {"pdf": str(pdf), "png": str(png)}


def _wrap(text: str, width: int) -> str:
    import textwrap
    return "\n".join(textwrap.wrap(text, width)) if text else ""


if __name__ == "__main__":
    import sys
    root = Path(__file__).parents[2]
    sys.path.insert(0, str(root / "src"))
    from kaal.mock import mock_kaal
    from nyaya.engine import match_evidence
    data = json.loads((root / "data" / "demo_district.json").read_text())
    vmap = {v["lgd_code"]: v["name"] for v in data["villages"]}
    cid = sys.argv[1] if len(sys.argv) > 1 else "FRA-DND-0007"
    claim = next(c for c in data["claims"] if c["claim_id"] == cid)
    claim["_village"] = vmap.get(claim["village_lgd"], claim["village_lgd"])
    claim["_district"] = data["district"]["name"]
    k = mock_kaal(claim); m = match_evidence(claim, k)
    print(build_dossier(claim, k, m, root / "out"))
