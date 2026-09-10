# FRA-NEXUS — Product Requirements Document

**Problem Statement:** SIH 25108 — AI-powered FRA Atlas and WebGIS-based Decision Support System for Integrated Monitoring of Forest Rights Act Implementation
**Ministry:** Ministry of Tribal Affairs
**Category:** Software
**Event:** VIT Bhopal Internal Hackathon 2026 → SIH 2026
**Status:** Draft v0.1
**Owner:** _(team lead)_
**Last updated:** 14 Aug 2026

---

## 0. Document Purpose

This PRD defines *what* FRA-NEXUS is, *who* it serves, *what must be built*, and *in what order*. It is the single source of truth that feeds:

1. The 6-slide idea PDF (due **21 Aug 2026**)
2. The build plan if the team is selected (SIH portal submission **13 Sep 2026**)
3. Judge Q&A defense

It is not an architecture document. Implementation detail lives in a separate technical design doc.

---

## 1. Context & Problem

### 1.1 The domain problem

The Forest Rights Act, 2006 (FRA) grants forest-dwelling communities legal rights over land they occupy and use — Individual Forest Rights (IFR), Community Rights (CR), and Community Forest Resource Rights (CFR). Enacting the law was step one. Tracking implementation and routing development schemes to the recognized beneficiaries is where the system breaks down.

### 1.2 The operational problem

Today a district officer answering "which village needs which intervention first?" must manually stitch together:

| Source | Format | Owner |
|---|---|---|
| FRA claims, pattas, verification records | Scanned PDFs, handwritten registers | Tribal Welfare / DLC |
| Land & revenue records | Separate department database | Revenue Dept |
| Satellite / land-use imagery | GIS files, no FRA linkage | Forest Dept |
| Scheme coverage (water, agri, employment) | Scheme-wise portals | Multiple ministries |

**Consequences:**
- Weeks of turnaround per query
- Two officers can reach different conclusions from the same data — no unified evidence base
- No state-level visibility into where FRA implementation is stalled
- Schemes reach the wrong villages, or the right villages too late
- No audit trail explaining why a given prioritisation was made

### 1.3 Root cause

**Data is not missing — it is fragmented and unlinked.** No system joins the legal record (who holds rights) to the spatial record (what the land actually looks like) to the development record (what the village already receives).

### 1.4 Target geography (Phase 1)

Madhya Pradesh, Tripura, Odisha, Telangana.

> ⚠️ **Verify before submission:** confirm the exact state list and named schemes against the official SIH 25108 statement on the SIH portal. Do not cite specifics we have not read directly.

---

## 2. Product Vision

> FRA-NEXUS converts fragmented FRA records and geospatial evidence into an explainable, map-first decision intelligence workflow — where AI supplies evidence, and a human officer always makes the decision.

**Positioning:** not a map. Not a dashboard. Not a chatbot. A **decision support system** with an auditable evidence trail behind every recommendation.

---

## 3. Goals & Non-Goals

### 3.1 Goals

| # | Goal | Measured by |
|---|---|---|
| G1 | Digitise legacy FRA documents into structured, queryable records | % of fields extracted at ≥ threshold confidence |
| G2 | Attach real-world land context to every FRA parcel from satellite imagery | Asset layers generated per village |
| G3 | Present legal + spatial + development data on one interactive map | Officer completes village lookup in a single session |
| G4 | Recommend prioritised interventions with full reasoning | Every recommendation carries reasons + evidence + confidence + rule version |
| G5 | Keep the human in the loop and the system auditable | 100% of recommendations are acceptable/overridable, every action logged |

### 3.2 Non-Goals (explicit — defend these in Q&A)

- **Not** a replacement for the statutory FRA claim adjudication process. The system informs; the Gram Sabha / SDLC / DLC still decide rights.
- **Not** an autonomous decision-maker. No recommendation is auto-applied.
- **Not** a conversational assistant. No free-form chat interface over government records.
- **Not** a land-titling or legal-boundary authority. Digitised geometry is advisory and flagged as such.
- **Not** solving data entry for *new* claims — scope is legacy record digitisation plus decision support. New-claim intake is a future extension.

---

## 4. Users

| Persona | Role | Primary job-to-be-done | Success looks like |
|---|---|---|---|
| **District Officer** (primary) | Tribal Welfare / District Collectorate | "Which villages in my district need which intervention first, and can I justify it?" | Runs DSS, reviews evidence, exports a defensible report |
| **State Nodal Officer** | State Tribal Dept | "Where is FRA implementation stalled across districts?" | Sees aggregate pending/granted/rejected + gap heatmap |
| **Field Verifier / Data Operator** | Block-level staff | "Correct what the OCR got wrong" | Works a review queue of low-confidence extractions |
| **Policy Maker** (MoTA) | National | "Is the Act being implemented, and is convergence happening?" | State-level rollup, trend over time |
| **Auditor / RTI Reviewer** | Oversight | "Why was this village prioritised?" | Retrieves the full decision trail with rule version |

**Beneficiaries (indirect, not users):** tribal and forest-dwelling families whose scheme delivery gets faster and better targeted.

---

## 5. Success Metrics

### 5.1 Product metrics (post-deployment)

| Metric | Baseline (today) | Target |
|---|---|---|
| Time to produce a village prioritisation | Weeks (manual, multi-department) | Minutes (single session) |
| FRA records queryable in structured form | ~0% in target districts | Pilot district digitised |
| Recommendations with a complete evidence trail | 0% | 100% |
| Officer override rate | n/a | Tracked — a *falling* rate over time indicates growing model trust |

### 5.2 Prototype metrics (what we can actually claim at the hackathon)

| Metric | Target for demo |
|---|---|
| OCR + NER field extraction accuracy on a sample document set | Report measured number — do not claim a number we have not measured |
| Land-use segmentation accuracy on held-out tiles | Report measured IoU / accuracy |
| End-to-end demo: village select → DSS run → report export | Under 60 seconds, no manual steps |
| Villages loaded in demo dataset | ≥ 1 district, target 50+ villages |

> **Rule for the whole team:** every number that appears on a slide must be traceable to something we ran. Rubric criterion 8 rewards measured evidence and punishes vague claims.

---

## 6. Scope & Phasing

### P0 — Hackathon demo (must exist to demo credibly)

- Ingest a sample set of scanned FRA documents → structured records with confidence scores
- Land-use classification over a pilot area producing 4 asset layers: forest, agriculture, water, settlement
- WebGIS map with state → district → block → village drilldown
- Village profile panel: IFR/CR/CFR counts, granted/pending/rejected split, asset summary
- DSS: rule-based scoring producing ranked interventions with reasons + evidence + confidence
- Officer accept / override with mandatory reason on override
- One-click report export (PDF)

### P1 — Post-selection build

- Human-in-the-loop review queue for low-confidence extractions
- Full audit log with rule/model versioning and replay
- Role-based access (state / district / block scoping)
- Scheme eligibility rule editor (versioned, non-developer editable)
- Bulk document ingestion pipeline

### P2 — Future / roadmap slide

- Change detection over time (encroachment, forest loss, new settlement)
- Mobile field-verification app with offline capture
- API integration with existing state land-record and scheme portals
- Multilingual document support beyond the pilot script set
- New-claim intake workflow

**Cut list (say no loudly):** real-time satellite feeds, blockchain land registry, drone capture, a chatbot, mobile app in P0.

---

## 7. Functional Requirements

### F1 — Document Intelligence (paper → data)

| ID | Requirement | Priority |
|---|---|---|
| F1.1 | Accept scanned FRA documents (PDF, JPG, PNG), including handwritten and legacy register scans | P0 |
| F1.2 | Preprocess: deskew, denoise, contrast normalise, page segmentation | P0 |
| F1.3 | OCR to raw text, retaining per-token positional data | P0 |
| F1.4 | NER extraction of: village name, block, district, state, claimant name, claim type (IFR/CR/CFR), claimed area, survey/khasra number, claim status, decision date | P0 |
| F1.5 | Attach a **per-field confidence score** to every extraction | P0 |
| F1.6 | Validation rules: area within plausible bounds, status ∈ enum, village name matched against a gazetteer/LGD master | P0 |
| F1.7 | Route any record with a field below the confidence threshold to a human review queue rather than committing it silently | P1 |
| F1.8 | Store original document alongside extracted record — provenance link is never broken | P0 |

**Design rule:** the system never presents extracted data as fact without its confidence attached.

### F2 — Satellite / Remote-Sensing Intelligence (land → truth)

| ID | Requirement | Priority |
|---|---|---|
| F2.1 | Ingest multi-band satellite imagery for the pilot area | P0 |
| F2.2 | Semantic segmentation into land-use classes: forest cover, agricultural land, water bodies, settlements/homesteads | P0 |
| F2.3 | Derive per-village asset indicators: forest cover %, cultivable area, water body count and proximity, settlement density | P0 |
| F2.4 | Attach confidence to every derived layer; flag tiles degraded by cloud cover or resolution limits | P0 |
| F2.5 | Store outputs as spatial geometries joinable to FRA parcels and village boundaries | P0 |
| F2.6 | Change detection across two time periods | P2 |

**Design rule:** AI does not invent geometry. Every polygon traces back to pixel evidence, with a confidence score and a source scene ID.

### F3 — WebGIS FRA Atlas (everything on one map)

| ID | Requirement | Priority |
|---|---|---|
| F3.1 | Interactive map with administrative drilldown: state → district → block → village | P0 |
| F3.2 | Toggleable layers: FRA parcels, forest, agriculture, water, settlements, roads | P0 |
| F3.3 | Click any parcel or village to open a detail panel | P0 |
| F3.4 | Village profile: claim counts by type and status, asset summary, existing scheme coverage, computed gap indicators | P0 |
| F3.5 | Filter by claim status, claim type, date range | P1 |
| F3.6 | District/state aggregate view — implementation-gap heatmap | P1 |
| F3.7 | Performance: layer render under 2s at district zoom on a standard laptop | P0 |

### F4 — Decision Support System (the differentiator)

| ID | Requirement | Priority |
|---|---|---|
| F4.1 | Compute village-level indicators from F1 + F2 + scheme coverage data | P0 |
| F4.2 | Apply a **versioned, transparent rule-based scoring model** to rank candidate interventions | P0 |
| F4.3 | Output for each recommendation: priority rank, intervention type, confidence, contributing reasons, supporting evidence links, rule-set version | P0 |
| F4.4 | Officer actions: **Accept**, **Override** (reason mandatory), **Defer for review** | P0 |
| F4.5 | Log every action with user, timestamp, rule version, and input snapshot | P1 |
| F4.6 | Export a report containing the recommendation, its full reasoning, and the officer's decision | P0 |
| F4.7 | Rule sets editable by a non-developer administrator, with version history | P1 |

#### F4.8 — Scoring model (initial, illustrative — calibrate against real data before claiming accuracy)

For each village, compute normalised indicators in [0,1], then score each candidate intervention as a weighted sum:

```
score(intervention) = Σ (weight_i × indicator_i)
```

| Intervention | Driving indicators |
|---|---|
| Water / irrigation (e.g. Jal Jeevan Mission–type) | high cultivable area, low irrigation coverage, low water-body proximity, low existing water-scheme coverage |
| Agricultural support (e.g. PM-KISAN–type) | high IFR-granted area under cultivation, low current agri-scheme enrolment |
| Employment / livelihood (e.g. MGNREGA–type) | low asset development, high pending-claim ratio, low road connectivity |
| Land-rights process intervention | high pending/rejected claim ratio, long time-since-filing |

Confidence is a function of **input data quality** (extraction confidence × imagery confidence × completeness of indicators), not of the score magnitude. A high score computed from low-confidence inputs must surface as **high priority, low confidence** — never as false certainty.

> **Weights are policy, not code.** They must be externalised, versioned, and reviewable — a district's priorities are a governance decision, not a developer's constant.

---

## 8. Where AI Is Used — and Where It Is Not

This is the central design decision and the strongest defensive answer in Q&A.

**AI does:**
- Read text and entities from documents (OCR + NER)
- Detect and classify land features from imagery (computer vision)
- Convert a computed recommendation into plain-language explanation text

**AI does not:**
- Decide geometry — that comes from CV/GIS pixel evidence
- Invent scheme eligibility — that comes from versioned, human-authored rules
- Make the final government decision — the officer always does
- Operate as an open-ended chatbot over government records

**Why this matters:** a black-box recommendation in a government workflow is unusable. If an officer cannot answer "why?", they will not act on it — correctly, because real people's entitlements are at stake. Bounding AI to evidence extraction, and keeping eligibility logic in inspectable rules, is what makes the system defensible and auditable.

---

## 9. Explainability Requirements (non-negotiable)

Every recommendation surfaced to a user MUST carry:

1. **Reasons** — which factors drove it, in plain language (e.g. "low irrigation coverage + high cultivable land")
2. **Evidence** — links to the specific satellite layer, FRA record, and village indicator supporting the claim
3. **Confidence** — derived from input data quality, displayed prominently
4. **Version** — the rule-set and model versions used, so a past decision can be reconstructed
5. **Override path** — the officer can disagree and record why

A recommendation missing any of these five must not be displayed. This is a hard product constraint, not a nice-to-have.

---

## 10. Technology Stack & Justification

| Layer | Choice | Why this, over alternatives |
|---|---|---|
| Document OCR | Open-source OCR engine, fine-tuned for Indic scripts and degraded scans | Government scans are low quality and multilingual; generic cloud OCR handles neither well and raises data-residency questions |
| Entity extraction | Transformer NER fine-tuned on FRA document schema | FRA forms have domain-specific fields no general model recognises |
| Imagery segmentation | CNN/U-Net-family semantic segmentation on multi-band imagery | Standard, proven for land-use classification; interpretable per-pixel output supports our evidence requirement |
| Spatial database | PostgreSQL + PostGIS | Mature spatial indexing and joins; the join between FRA parcels and asset polygons *is* the product |
| Backend API | Python service layer | Same runtime as the ML pipeline; no cross-language serving overhead |
| Map frontend | Open-source web mapping library with vector tiles | No per-call licensing, works with government-hosted tiles, deployable on NIC infrastructure |
| DSS engine | Rule-based scoring with externalised versioned weights | Auditability beats accuracy here — an unexplainable model cannot be used for a government entitlement decision |
| Report generation | Server-side PDF | Officers need an artefact to file, not just a screen |

**Justification principle to state on the slide:** every choice is open-source and deployable on government-controlled infrastructure — no data leaves, no per-query licensing at scale, no vendor lock-in for a ministry deployment.

> **Fill in before submission:** replace generic descriptions with the specific libraries we actually use. Rubric criterion 6 scores *justified* choices, and vague stack lists score 3 at best.

---

## 11. Non-Functional Requirements

| Category | Requirement |
|---|---|
| **Data residency** | All data processed and stored on government-controlled infrastructure. No PII leaves the deployment boundary. |
| **Privacy** | Claimant names are PII. Access is role-scoped; aggregate views must not expose individual identity. |
| **Auditability** | Every recommendation and officer action is logged immutably with version stamps. |
| **Performance** | District-level map render < 2s; DSS run for one village < 5s. |
| **Scalability** | Architecture must extend from one pilot district to state scale without redesign — spatial indexing and tiled layer serving from day one. |
| **Availability** | Not mission-critical real-time; standard business-hours availability is sufficient. |
| **Accessibility** | Officer-facing UI in English plus the relevant regional language; usable at 1366×768 (typical government desktop). |
| **Sustainability** | Open-source stack, documented rule format, no recurring licence cost — a state can maintain it without the original team. |

---

## 12. Risks & Mitigations

| # | Risk | Impact | Mitigation |
|---|---|---|---|
| R1 | **Real FRA documents are not publicly available** for training/demo | Blocks P0 | Use published sample formats + synthetic degraded documents; state this openly rather than implying access we lack |
| R2 | OCR accuracy on handwritten legacy registers is poor | Core pipeline underdelivers | Confidence thresholds + human review queue are designed in, not bolted on — low accuracy degrades to *human verification*, not to *wrong data* |
| R3 | High-resolution imagery is licensed/costly | Limits segmentation quality | Use open imagery (Sentinel/Landsat-class) for P0; document what higher resolution would add |
| R4 | Cloud cover corrupts imagery-derived layers | Wrong indicators | Cloud masking + explicit confidence flagging; degraded tiles are marked, not silently used |
| R5 | Scoring weights are contested by domain officials | Adoption failure | Weights are externalised and version-editable by administrators — the product does not hard-code policy |
| R6 | Scope overrun before 21 Aug | Missed deadline | P0 is deliberately narrow; P1/P2 are explicitly roadmap, not promises |
| R7 | Judges read "AI + GIS" as a generic dashboard | Low innovation score | Lead every framing with the *linkage* and *explainability*, not the components |
| R8 | Ground-truth data for validating recommendations does not exist | Cannot claim accuracy | Validate the *pipeline* (extraction accuracy, segmentation accuracy), be explicit that end-to-end prioritisation accuracy requires a field pilot |

---

## 13. Differentiation

| Typical approach | FRA-NEXUS |
|---|---|
| Static FRA map showing records | Interactive, evidence-driven decision system |
| OCR that only extracts text | OCR + structured data linked to a spatial layer |
| Satellite dashboard sitting separately | Satellite data connected to FRA records and development context |
| AI as a chatbot answering questions | AI producing evidence-based, auditable recommendations |
| One-shot prediction | Human review, override, and version history — a continuous system |

**The one-sentence differentiator:** existing tools digitise *or* map *or* recommend. FRA-NEXUS joins the legal record to the spatial record to the development record, and shows its working.

---

## 14. Timeline

### Hard external dates

| Date | Milestone | Source |
|---|---|---|
| 8 Aug 2026 | Team registration | ✅ presumed done — **confirm** |
| **21 Aug 2026** | **Internal hackathon idea submission (PDF, blind assessment)** | Hard deadline |
| 22–30 Aug 2026 | Assessment period (online) | — |
| 31 Aug 2026 | Internal hackathon result | — |
| 8 Sep 2026 | SIH-format idea submission (if selected) | — |
| 13 Sep 2026 | Upload to SIH Portal | — |

### Internal plan to 21 Aug (7 days)

| Day | Deliverable | Owner |
|---|---|---|
| D1 (15 Aug) | Verify PS 25108 wording, state list, named schemes from the official portal. Lock team name/ID. | |
| D2 (16 Aug) | Architecture diagram + data flow diagram (slide 3 assets) | |
| D3 (17 Aug) | Any runnable evidence: OCR on a sample document, segmentation on a sample tile — measured numbers | |
| D4 (18 Aug) | Map/UI mockup or working screenshot for slide 2 | |
| D5 (19 Aug) | Draft all 6 slides against the rubric | |
| D6 (20 Aug) | Internal review pass, tighten visuals, remove paragraphs | |
| D7 (21 Aug) | Export to PDF, upload to Google Form | |

---

## 15. Submission Constraints (do not violate — these disqualify)

From the official template and process documents:

- **Max 6 slides**, including the title slide (a 7th "instructions" slide exists in the template and must be deleted)
- **Provided template only** — do not change the idea-detail pointers on each slide
- **Upload as PDF only** — no PPT, DOC, or other format
- Avoid paragraphs — use points, diagrams, infographics, pictures
- Team: exactly **6 members**, at least **1 female member**, single university, unique team name, one idea per team
- Up to 2 mentors permitted
- Late or non-compliant submission ⇒ disqualification
- Queries: sih@vitbhopal.ac.in

### Required slide structure

| Slide | Required content |
|---|---|
| 1 | Title: PS title, theme, PS category (Software), Team ID, Team Name |
| 2 | **Idea/Solution** — detailed explanation, how it addresses the problem, innovation and uniqueness |
| 3 | **Technical Approach** — technologies, methodology, flowcharts/images/prototype |
| 4 | **Feasibility & Viability** — feasibility analysis, challenges and risks, mitigation strategies |
| 5 | **Impact & Benefits** — impact on target audience; social/economic/environmental benefits |
| 6 | **Research & References** — links and reference work |

---

## 16. Rubric Mapping

Assessment is 8 criteria scored 1–5 each (max 40). Where each is earned:

| # | Criterion | Where addressed | Risk of losing points |
|---|---|---|---|
| 1 | Problem Understanding & Relevance | §1 root cause, §4 users, slide 2 | Describing symptoms instead of the fragmentation root cause |
| 2 | Innovativeness & Uniqueness | §13 differentiation, §8 AI boundary, slide 2 | Reading as "another GIS dashboard" — lead with linkage + explainability |
| 3 | Technical Feasibility & Approach | §7 requirements, §10 stack, slide 3 diagram | No architecture diagram, or hand-waved pipeline |
| 4 | Business / Social Impact | §4 beneficiaries, §5 metrics, slide 5 | Unquantified impact claims |
| 5 | Scalability & Sustainability | §11 NFRs, §6 phasing, slide 4 | Not addressing deployment, maintenance, or who runs it after us |
| 6 | Technology Stack Justification | §10 with per-choice reasoning, slide 3 | Listing tech without saying *why that one* |
| 7 | Clarity of Presentation | Whole deck — diagrams over paragraphs | Dense text walls; template violations |
| 8 | Evidence, Validation & Expected Outcomes | §5.2 measured prototype numbers, slide 3 | Claiming numbers we did not measure — the single most common failure |

**Highest-leverage effort:** criteria 3, 6, and 8. A clear architecture diagram, per-choice stack justification, and one honestly measured prototype result move more points than any amount of prose polish.

---

## 17. Open Questions

| # | Question | Blocking? | Owner |
|---|---|---|---|
| Q1 | Exact PS 25108 wording, target states, and named schemes from the official SIH portal | Yes — all specifics depend on it | |
| Q2 | Team ID and registered team name | Yes — slide 1 | |
| Q3 | Which sample FRA document set can we legitimately obtain for the demo? | Yes — gates §5.2 evidence | |
| Q4 | Which imagery source for the pilot area (open vs. licensed)? | No — open imagery is a workable default | |
| Q5 | Do we have a mentor with FRA/GIS domain familiarity? | No, but strengthens criterion 1 | |
| Q6 | Are scheme coverage datasets available per village, or must they be assumed for the demo? | No — assume + label clearly if unavailable | |

---

## Appendix A — Reference Walkthrough

The demo narrative, end to end:

1. Officer logs in and selects their district
2. Map shows all villages with digitised, geo-tagged FRA claims
3. Clicking a village opens its profile: IFR/CR/CFR counts, granted vs. pending
4. Satellite layer shows high agricultural land, low water access
5. Officer clicks **Run DSS**
6. System returns: *"Priority 1 — Water/Irrigation intervention, confidence 0.87"* with reasons: high cultivable land + low irrigation coverage + poor water access
7. Officer inspects the evidence and accepts — or overrides with a written reason
8. One click generates a report ready for review or submission

Before: weeks, across departments, manually. After: minutes, guided, evidence-backed.

---

## Appendix B — Source Documents

| File | Contains |
|---|---|
| `FRA-NEXUS_Idea_Explained_Detailed.docx` | Original concept explainer (Hinglish), 4-layer model, walkthrough |
| `guide_flow.pdf` | Process flow, dates, team formation rules |
| `assessment-internal hack-blind mode.pdf` | 8-criterion assessment rubric |
| `SIH2026-IDEA-Presentation Internal Hackathon-Format.pptx` | Mandatory 6-slide template |
