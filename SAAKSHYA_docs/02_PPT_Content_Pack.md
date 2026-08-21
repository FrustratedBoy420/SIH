# SAAKSHYA — PPT Content Pack (6-slide blind idea PDF)

**For:** whoever builds the deck. **Format rules (from the official template + guide):** max **6 slides incl. title**, **no paragraphs** (points/diagrams/infographics), export **PDF only**, keep the template's heading pointers. **BLIND** assessment → **zero team/college identifiers anywhere, including PDF metadata** (`exiftool` scrub before submit). No live demo — screenshots + one optional QR-to-video carry everything.

**Scored on 8 criteria** (each 1–5): 1 Problem-understanding & relevance · 2 Innovativeness & uniqueness · 3 Technical feasibility · 4 Social/business impact · 5 Scalability & sustainability · 6 Tech-stack justification · 7 Clarity of presentation · 8 Evidence/validation & expected outcomes.

> **Golden rule:** every stat must trace to `../SAAKSHYA_Concept_Review.md` §13. If it's not in the ledger, it does not go on a slide.

---

## Rubric → slide coverage matrix (make sure nothing is orphaned)

| Criterion | Primary slide(s) |
|---|---|
| 1 Problem & relevance | S2 (rejection funnel), S1 |
| 2 Innovation & uniqueness | S3 (empty-quadrant matrix), S4 (evidence engine) |
| 3 Technical feasibility | S4, S6 |
| 4 Social impact | S2, S5, dual-use principle on S3 |
| 5 Scalability | S6 |
| 6 Tech-stack justification | S6 |
| 7 Clarity/presentation | ALL (one original graphic per slide, ≤2-line points) |
| 8 Evidence & outcomes | S4 (real dossier), S6 (projected metrics table) |

---

## SLIDE 1 — TITLE
**Heading pointer:** Title page.
- Problem Statement Title (verbatim): *Development of AI-powered FRA Atlas and WebGIS-based Decision Support System (DSS) for Integrated Monitoring of Forest Rights Act (FRA) Implementation.* (States: MP, Tripura, Odisha, Telangana)
- PS ID **25108** · Theme **Miscellaneous** · Category **Software**
- **Project name:** SAAKSHYA — बड़ा (large) neon wordmark
- Tagline: *"Rebuilding the proof for the forest claims that were **rejected**."*
- **NO team name / college / member names** (blind).
- Visual: dark slide, faint satellite-forest map, orbital feel.

## SLIDE 2 — THE PROBLEM (Criterion 1 + 4)
**Heading pointer:** Proposed Solution → "How it addresses the problem" (problem framing here).
- **Rejection funnel infographic** (the emotional hook): claims filed → titles granted → **≈47,901 community claims REJECTED** (label "community CFR/CFRR", source MoTA MPR Mar-2026 [C3]).
- Root-cause callouts (icons, ≤3 words each): "can't prove pre-2005" · "arbitrary rejection" · "Gram Sabha ignored" · "no appeal help" [C4–C6].
- One contrast line: *"Every existing tool maps GRANTED claims. Nobody rebuilds the REJECTED ones."*
- Big number treatment on 47,901.
- ⚠️ Do NOT write "most common reason" for pre-2005 (unverified — C16). Say "a key evidentiary gap."

## SLIDE 3 — THE IDEA & ARCHITECTURE (Criterion 1, 2, 3, 4)
**Heading pointer:** Proposed Solution → detailed explanation + innovation/uniqueness.
- **Empty-quadrant matrix** (the uniqueness proof): axes *forward scheme-delivery ↔ backward evidence-recovery* × *officer ↔ Gram Sabha*. Plot Bhuvan/state-atlas/GitHub-clone in "forward+officer"; **SAAKSHYA alone in "backward+Gram Sabha."**
- **Architecture diagram** — three bands: **EVIDENCE (KAAL)** · **CONFLICT (SEEMA)** · **DELIVERY (VAANI/NYAYA/SETU)** + the Atlas glue.
- **PS-compliance ribbon** along one edge (anti-disqualification): (a)→VAANI · (b)→SEEMA+KAAL · (c)→Atlas+new layers · (d)→SETU+NYAYA.
- **Dual-use safety principle** as a small badge: *"emits only corroborating evidence; consent-gated"* (Criterion-4 signal).
- Dual-user note: officer dashboard + Gram Sabha view (peers).

## SLIDE 4 — THE EVIDENCE ENGINE (money-shot) (Criterion 2, 3, 8)
**Heading pointer:** Technical Approach → methodology/working prototype.
- **The real dossier** (from the MVP spike) as the hero image: **Corona 1967 → Landsat decade strip (75/85/95/05/15) → breakpoint chart landing before 2005 → confidence dial → cited Rule-13 category → rejection-reason match.**
- Method flow (icons): GEE stack → NDVI/NBR series → **LandTrendr/CCDC breakpoint** → classify → dated finding [C11].
- **Honest-limit chips** (rigor = points): "≥0.5–1 ha patches, not single huts (30–80 m)" · "**ST cutoff provable; OTFD 75-yr strengthened, not proven**" [C17] · "supplementary evidence, Rule 13 — never decisive" [C12].
- **The legal-flip line (your strongest slide moment):** *"Courts (Gujarat HC 2013) ruled satellite imagery can't be decisive — used to WRONGLY REJECT claims. SAAKSHYA points that same imagery at WINNING them, built to exactly that standard."* [C14/C13b]

## SLIDE 5 — THE PLATFORM (atlas + DSS mockups) (Criterion 2, 4, 5)
**Heading pointer:** Impact & Benefits (+ solution walkthrough).
- **Atlas mockup:** layer tree (IFR/CR/CFR + **Rejected + Conflict + Evidence-strength**), claim drawer with evidence timeline. Real district names/geometry, labelled "illustrative data."
- **NYAYA panel:** rejection-reason → evidence-held/gap → appeal forum + **60-day deadline** [C2].
- **Impact infographic (big numbers, beneficiaries):** who = tribal/forest families + officers; social = wrongly-denied rights restored; the DAJGUA hook = **"22 lakh FRA patta holders"** targeted [C15].
- Dual view thumbnails: officer heatmap vs Gram-Sabha dossier.

## SLIDE 6 — FEASIBILITY, STACK, SCALE, OUTCOMES (Criterion 3, 5, 6, 8)
**Heading pointer:** Feasibility & Viability + Technical Approach (tech) + expected outcomes.
- **Stack table** with per-choice justification (from PRD §10) + rejected alternatives (not ArcGIS, not YOLO-on-Landsat).
- **All-free dataset table** (Landsat/Corona/Sentinel-2/Bhuvan) — "zero data cost."
- **Scale path:** 1 district → 4 states, GEE+COG, no re-architecture.
- **Projected outcomes table** — label **"targets, spike-validated"**: ±3 yr dating, ≥80% NER, per-class IoU, dossier end-to-end [PRD §12].
- **Risks + mitigations** (2–3, shows maturity): OTFD 75-yr limit → scope to ST + continuity; dual-use → consent-gating; input digitization → VAANI on-ramp.

**Delete slide 7** (the instructions slide).

---

## RESEARCH & REFERENCES (if a 6th content area is needed, fold into S6 footer or an allowed appendix)
FRA 2006 (Sec 4(3), 6) · FRA Rules Rule 13/12A (amd. 2012) · MoTA MPR Mar-2026 · Gujarat HC 2013 (Van Kanun Bachau Samiti) + R/SCA 4162/2024 · Landsat/USGS · Corona KH-4B/USGS EROS · LandTrendr (MDPI RS 2018) / CCDC (GEE) · DAJGUA (PIB PRID 2061196). Full URLs in Concept Review §13.

---

## Design system (keep it cohesive = Criterion 7)
- **Palette:** deep forest-green / near-black ground, one warm accent (amber or saffron) for the "evidence found" moments. Consistent across all 6.
- **One original graphic per slide**, no stock clip-art, no lorem, no paragraph >2 lines.
- Same icon set, same type scale throughout.
- **Big-number treatment** on 47,901 / 22 lakh / ±3 yr / 1972.
- Optional: QR on S4 → 60-sec screen-recording of the dossier being generated (online review, clickable).

## Pre-submission checklist (blind-mode compliance — miss = disqualification)
- [ ] ≤6 slides, slide 7 deleted.
- [ ] No team name, college, member names, roll numbers on any slide.
- [ ] `exiftool -all= deck.pdf` → Author/Creator/Producer scrubbed.
- [ ] Every stat traces to Concept Review §13.
- [ ] No paragraph over 2 lines; ≥1 graphic per slide.
- [ ] Wedge (evidence engine) owns S2 + S4.
- [ ] Blind dry-run: hand PDF to 2 outsiders, 90 sec, each states the idea + its differentiator in one sentence. If they can't → simplify S3/S4.
- [ ] Exported as **PDF** (no PPT/DOCX), uploaded to the Google Form before 21 Aug.
