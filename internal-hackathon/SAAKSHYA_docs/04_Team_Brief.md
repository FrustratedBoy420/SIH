# SAAKSHYA — Team Brief (read this first, 2 min)

**What we're building:** SAAKSHYA — an FRA platform that **rebuilds the proof for forest-rights claims that were rejected**, using 50-year satellite archives to date land occupation against the 13-Dec-2005 legal cutoff.

**The one-line pitch:** *"Existing FRA tools map the claims that were granted. SAAKSHYA rebuilds the proof for the claims that were rejected."*

**PS 25108** (Ministry of Tribal Affairs) · Theme **Miscellaneous** · **Software** · States: MP, Tripura, Odisha, Telangana.

**Why we win (the rubric levers):**
- **Unique** — everyone else builds the granted-claims atlas (it already exists, even open-sourced). We own the empty quadrant: rejection-recovery + Gram Sabha.
- **Impact** — attacks ≈47,901 rejected community claims, not just scheme delivery.
- **Defensible** — court-grounded (the Gujarat HC "imagery can't be decisive" flip is our strongest slide), and honest about its limits.

---

## The docs (in this folder)
1. `01_PRD_SAAKSHYA.md` — the master spec (features, DSS rules, data model, stack). **Source of truth.**
2. `02_PPT_Content_Pack.md` — slide-by-slide content for the deck, rubric-mapped.
3. `03_MVP_Build_Spec.md` — the build (KAAL spike + dossier + mockups).
4. `../SAAKSHYA_Concept_Review.md` — full concept + **Claims Ledger (§13)**. *Every stat on any slide must trace here.*

---

## Team (6 members — compliance is mandatory)
Hard rules from the VIT Bhopal guide (violation = disqualification): **exactly 6 members · ≥1 female · unique team name · ≤2 mentors · one idea per team · all same university · PDF-only upload.**

| Role | Owns | Person |
|---|---|---|
| **MVP / tech lead** (you) | KAAL spike, dossier generator, repo | ___ |
| **GIS / remote-sensing** | GEE stack, Corona georef, LandTrendr/CCDC | ___ |
| **ML / CV** | Sentinel-2 segmentation (SEEMA), NER plan (VAANI) | ___ |
| **Full-stack / web** | Atlas + dual-user UI mockups (MapLibre/React) | ___ |
| **Design / deck** | The 6-slide PDF, infographics, money-shot layout | ___ |
| **Research / legal fact-check** | Ledger upkeep, Rule 13 verbatim, precedent hunt, sourcing | ___ |

> Ensure ≥1 female member and a unique team name registered on the portal.

---

## Timeline vs deadlines

| Date | What | Owner |
|---|---|---|
| 8 Aug ✅ | Team + domain (**Miscellaneous**) + title registered | Lead |
| now → ~19 Aug | KAAL spike → **1 real dossier**; mockups; deck content | MVP + GIS + ML + design |
| ~19–20 Aug | Deck assembly + blind dry-run + metadata scrub | Design + research |
| **21 Aug** | **Submit 6-slide idea PDF (blind, online)** | Design |
| 22–30 Aug | Blind assessment (nothing to do) | — |
| **31 Aug** | Internal result — top 50 advance | — |
| 8 Sep | (if selected) refine to SIH prescribed format | All |
| 13 Sep | Upload to SIH portal | Lead |

---

## Immediate next actions (this week)
1. **Lock the demo district** + confirm Corona coverage on EarthExplorer — *GIS lead* (blocks the spike).
2. **KAAL spike** → first real dated dossier — *MVP lead + GIS*.
3. **Mockups v1** (atlas + NYAYA + dual-user) — *full-stack + design*.
4. **Ledger upkeep** — resolve the 6 open questions (PRD §15), especially the precedent hunt (C14) — *research*.
5. **Deck skeleton** from `02_PPT_Content_Pack.md` — *design*.

---

## Non-negotiables (don't lose points / don't get DQ'd)
- Every stat traces to the Claims Ledger. No invented numbers.
- Honest limits ON the slides (ST vs OTFD; supplementary-not-decisive; ±3-yr is a *target*). Honesty scores; overclaiming gets caught.
- Blind mode: **no team/college identity anywhere, including PDF metadata.**
- Officer view stays first-class (dual-user) — don't drift off the PS's named users.
- Never render "absence of evidence" (dual-use safety) — it's also a Criterion-4 point.
