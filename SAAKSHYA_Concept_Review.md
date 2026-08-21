# SAAKSHYA — Concept Review & Fact-Check Dossier

**Problem Statement:** SIH 2025 / SIH 2026 Internal — PS **25108**, Ministry of Tribal Affairs.
*"Development of AI-powered FRA Atlas and WebGIS-based Decision Support System (DSS) for Integrated Monitoring of Forest Rights Act (FRA) Implementation."* (Target states: Madhya Pradesh, Tripura, Odisha, Telangana.)

**Status:** Draft concept for internal review. NOT finalized.
**Purpose of this document:** Explain the SAAKSHYA concept in full, plain language, so (a) the team understands it end-to-end, and (b) other reviewers/agents can **fact-check every load-bearing claim**. Section 13 is a **Claims Ledger** — every factual assertion with a verification status and source. Challenge anything marked `UNVERIFIED` or `NEEDS-CHECK`.

> **How to review this:** read §2–§7 for the idea, then attack §12 (limitations) and §13 (claims ledger). If a claim in §13 is wrong, the concept may need to move to its fallback (§11). Reviewers should try to *break* the legal and technical premises, not just confirm them.

---

## 1. TL;DR (one paragraph)

Existing FRA tools — the government's Bhuvan FRA layers, emerging state atlases, and open-source clones — map claims that were **granted** and help deliver schemes to title-holders. SAAKSHYA inverts this: it targets the claims that were **rejected** (≈47,901 *community* claims nationally) and the disputes that block them. Its core is a "time-machine" that uses **free 50+ year satellite archives** to reconstruct *when* a piece of forest was converted to cultivation or settlement, relative to the FRA's **13 December 2005** legal cutoff — a key evidentiary gap many rejected claimants face (see §12 for the honest scope: this fully serves ST claims and the "no pre-2005 proof" / boundary-dispute rejection categories, not all five). It still delivers all four components the PS demands (digitization, satellite asset-mapping, WebGIS atlas, scheme DSS), but re-points them at rejection, dispute, and appeal. Positioning line: **"Existing FRA tools map the claims that were granted. SAAKSHYA rebuilds the proof for claims that were rejected."**

---

## 2. The problem, precisely (with sources)

The Forest Rights Act (FRA), 2006 recognizes the rights of forest-dwelling Scheduled Tribes (FDST) and Other Traditional Forest Dwellers (OTFD) over land they occupied **before 13 December 2005** [§13-C1, C2]. Three claim types: **IFR** (Individual Forest Rights), **CR** (Community Rights), **CFR** (Community Forest Resource rights).

The real-world failure is not a lack of maps of granted land. It is **mass rejection of valid claims**:

- **≈47,901 CFR/CFRR claims rejected** nationally (MoTA Monthly Progress Report, March 2026) [§13-C3]. Highest in West Bengal, J&K, Madhya Pradesh, Karnataka, Chhattisgarh.
- Documented root causes: claimants **cannot prove pre-2005 occupation** (no documents); **arbitrary/opaque rejections**; forest departments **illegally insisting on specific evidence** they are barred from demanding; Gram Sabha recommendations ignored; legal illiteracy; weak appeal support [§13-C4, C5, C6].

The PS itself lists the gaps (fragmented legacy records, no unified atlas, no satellite-FRA integration, no DSS) — but the *human* impact and the *novelty* both sit on the rejection/evidence/dispute side, which no shipped tool addresses.

---

## 3. Why the obvious solution scores badly (prior-art audit)

The internal round is judged on an 8-criterion rubric where **Criterion 2 = "Innovativeness & Uniqueness: clear differentiation from existing solutions."** The literal PS build fails there because it already exists:

- **Bhuvan (ISRO) hosts FRA-related layers**, and **state-level FRA atlases exist** (e.g., Tripura launched "the Northeast's *first* digital FRA Atlas," May 2026) [§13-C7]. Note: a single shipped *national* named "FRA Atlas" product is **not confirmed** — the PS itself asks teams to *build* one. This actually **helps** our differentiation argument (the gap is real), but do not claim a finished national competitor exists.
- At least one **open-source clone of the exact PS** is public on GitHub (OCR + CNN land-classification + Bhuvan + LangChain DSS + Mapbox + PostGIS) [§13-C8].

So a team that rebuilds "OCR → CNN → atlas → scheme-DSS" is presenting something a reviewer can find already built. **Differentiation is mandatory, not optional.**

**Differentiation matrix (the empty quadrant):** plot solutions on two axes — *forward scheme-delivery ↔ backward evidence-recovery* and *officer-facing ↔ Gram-Sabha-facing*. Existing tools cluster in "forward + officer." SAAKSHYA occupies **"backward + Gram Sabha,"** which is empty. This matrix should be a slide.

---

## 4. The reframe

| | Vanilla FRA-NEXUS | SAAKSHYA |
|---|---|---|
| Primary user | District officer | **Gram Sabha + claimant** (officer is secondary) |
| Core job | Monitor granted claims, deliver schemes | **Win rightful claims; resolve disputes; support appeals** |
| Data centre-of-gravity | Present-day satellite + records | **50-year historical satellite time-series** |
| Novelty | Low (already built) | High (empty quadrant) |
| Social-impact story | Better targeting | **Restoring wrongly-denied rights** |

The reframe is what lifts Criterion 2 (uniqueness) and Criterion 4 (social impact) simultaneously. It stays inside the FRA domain, so it is not "off-brief."

---

## 5. Architecture — three bands (plain English)

Kept to **three bands, not five modules**, so the story stays sharp.

### Band A — EVIDENCE ("KAAL", = "time")
The flagship. Reconstructs the **history** of a claimed parcel from satellite archives to find *when* forest became farm/home, and whether that was **before or after 13 Dec 2005**. Output: a dated finding + a decade-by-decade image strip + a confidence score. (Full mechanism in §6.)

### Band B — CONFLICT ("SEEMA", = "boundary")
Present-day view. Runs computer-vision **segmentation on current Sentinel-2 imagery** (10 m) to map farms, forest, water, homesteads (this is the PS's mandated "asset mapping"). Then uses **PostGIS spatial topology** to auto-detect **overlapping/competing claims** and **claim-vs-forest-boundary conflicts** — a common rejection reason.

### Band C — DELIVERY ("VAANI / NYAYA / SETU")
- **VAANI** (OCR/NER): reads scanned FRA forms **and rejection orders** (Indic OCR) and extracts fields + the **stated reason for rejection**.
- **NYAYA** (appeal DSS): maps each rejection reason to (a) the evidence that would answer it, and (b) the correct appeal forum + **60-day deadline** [§13-C2]. Outputs "evidence held / evidence gap / next action."
- **SETU** (scheme convergence): the PS-mandated DSS layer — links title-holders to eligible central schemes (PM-KISAN, Jal Jeevan Mission, MGNREGA, DAJGUA).

### The Atlas (glue)
A WebGIS map carrying the standard IFR/CR/CFR layers **plus new Rejection, Conflict, and Evidence-strength layers**. This is the PS's "FRA Atlas + WebGIS" component, extended.

---

## 6. The flagship evidence engine, explained fully

**Question it answers:** *"Was this parcel already being cultivated / settled before 13 Dec 2005?"* — the exact fact that decides many claims.

**Why satellites can answer it:** the U.S. Landsat program has imaged the entire Earth **since 1972** [§13-C9]. That means for the 2005 cutoff, we have **33 years of imagery (1972–2005)** covering the whole legally-relevant window — *before* the cutoff, not just after. **Resolution caveat (be precise on the slide):** the earliest sensor, Landsat **MSS (1972–~1982), is ~79 m** (often resampled to 60 m); the finer **30 m only begins with Landsat TM in 1982**. So the 1972–1982 decade — the one nearest to "nothing else exists" — is the *coarsest*. Declassified **Corona KH-4B** spy imagery (**flew 1967–1972**, ~1.8 m; the full Corona program ran 1960–72 with coarser earlier cameras) [§13-C10] fills the pre-Landsat gap and adds the sharpness needed to spot settlement clusters.

**How it works (step by step):**
1. Pull an annual, cloud-masked image stack for the parcel from **Google Earth Engine** (Landsat MSS 1972→, TM/ETM+/OLI later; Sentinel-2 for present).
2. Compute a vegetation/greenness index per year (NDVI / NBR / Tasseled-Cap Wetness).
3. Run a **time-series segmentation algorithm — LandTrendr and/or CCDC** — established, peer-reviewed methods on GEE that fit the multi-year trajectory as straight-line segments and report the **Year-Of-Detection of a change (a "breakpoint")** [§13-C11].
4. Classify the break: forest → persistent low-greenness seasonal pattern = **cultivation**; forest → stable bare/built = **settlement cluster**.
5. Emit per parcel: `conversion_year`, `confidence`, and an `evidence_strip` (image chips 1975/85/95/2005/2015/now).

**Honest resolution limit (must be on the slide):** Landsat pixels are **30–80 m (≈79 m in the oldest MSS era, 30 m only from 1982)**, so a *single hut* is sub-pixel and cannot be seen. The engine reliably detects **cultivation/clearing patches ≥ ~0.5–1 ha and settlement clusters**, not individual houses. Corona (~1.8 m, 1967–72) carries pre-1980 habitation better. State this openly — honesty reads as rigor to a reviewer.

**Honest legal-scope limit (equally important):** the archive dates occupation back to **1972 (Landsat) / ~1967 (Corona)**. For **Scheduled-Tribe** claimants the bar is occupation **before 13 Dec 2005** — fully inside the archive. For **Other Traditional Forest Dwellers (OTFD)** the bar is **three generations / ~75 years** (back to ~1930) — which **no satellite can reach**. So KAAL *proves* the ST cutoff and *strengthens* (never fully proves) OTFD continuity. Scope every claim accordingly; do not imply imagery settles the 75-year test.

**The legal logic (and its honest ceiling):** Under **Rule 13 of the Forest Rights Rules (amended 6 Sept 2012)**, satellite imagery is admissible — but as **one of 13+ evidence types**, and it **"may supplement, not replace" other evidence**; a claimant submits **any two** evidences [§13-C12]. Also, the SDLC/DLC **cannot legally insist on a particular evidence** (Rule 12A(11)) [§13-C13]. **Therefore SAAKSHYA's honest claim is: it produces a strong, dated, map-based evidence exhibit that strengthens the Gram Sabha's Rule-13 bundle — NOT "decisive/automatic proof."** Overclaiming legality is the #1 trap a competent judge will probe (see §12).

**Money-shot output:** an **Evidence Dossier PDF** for one real claim — Corona 1967 → Landsat decade strip → breakpoint chart landing before 2005 → confidence dial → cited Rule-13 evidence category → rejection-reason match table. One image communicates the entire idea.

---

## 7. What makes the DSS *novel* (not decorative)

Most FRA "DSS" layers just recommend schemes. SAAKSHYA's DSS is different because it is driven by the **rejection reason**:
1. VAANI reads the rejection order and classifies the reason (≥5 categories: no pre-2005 proof / boundary dispute / Gram Sabha procedure defect / non-ST-OTFD status / incomplete form).
2. A rule table maps each reason → the evidence type that answers it.
3. NYAYA checks whether KAAL/SEEMA already produced that evidence → outputs "gap remaining" + "next action" + appeal deadline.

This closes the loop between *why a claim failed* and *what evidence now exists to fix it* — which no shipped FRA tool does. (State it as "no shipped FRA tool," not an absolute "nobody" — see §13-C18.)

---

## 8. Data sources (all free / public)

| Data | Use | Access | Note |
|---|---|---|---|
| Landsat MSS/TM/ETM+/OLI (1972→) | Historic breakpoint dating | Google Earth Engine / USGS | Covers full pre-2005 window [§13-C9] |
| Corona KH-4B (1967–72, ~1.8 m) | Pre-1980 settlement proof | USGS EarthExplorer (declassified) | Needs manual georeferencing (not zero-touch) [§13-C10] |
| Sentinel-2 (10 m, 2015→) | Present-day asset segmentation | Copernicus / GEE | For SEEMA |
| Bhuvan (ISRO/NRSC) | Base layers, LULC | Bhuvan portal | Hosts FRA layers; state atlases exist — no confirmed national product [§13-C7] |
| SRTM / CartoDEM | Terrain | USGS / Bhuvan | |
| Census village directory, LGD codes | Joins, boundaries | data.gov.in, LGD | Spelling mismatches likely |
| MoTA MPR rejection stats | Problem sizing | tribal.nic.in | Source of 47,901 [§13-C3] |
| FSI forest cover, NRSC LULC 50k | Forest baseline | FSI / Bhuvan | |

---

## 9. Tech stack & justification (Criterion 6)

| Layer | Choice | Why (FRA-specific reason) |
|---|---|---|
| Archive compute | Google Earth Engine + STAC / rasterio / xarray | 50-yr petabyte archive with **zero local storage cost**; no way to self-host this |
| Change detection | LandTrendr / CCDC | Peer-reviewed, standard; **not hand-rolled** → defensible |
| Present-day CV | PyTorch segmentation (U-Net/DeepLab) on Sentinel-2 | 10 m is the resolution where asset mapping is valid |
| Spatial DB | PostGIS | `ST_Intersects`/`ST_Area` topology for overlap/conflict detection |
| Map | MapLibre GL + TiTiler/COG + PMTiles | Open; **no Mapbox licence lock**; offline packs possible |
| OCR/NER | PaddleOCR/Tesseract + IndicNER | Devanagari/Odia/Telugu forms + rejection orders |
| Oral testimony | AI4Bharat IndicWhisper | Gram Sabha voice testimony (low-literacy users) |
| Rules | Declarative JSON DSL | FRA amendments become **config, not code** |
| API | FastAPI | Lightweight, Python-native (shares ML stack) |

Rejected alternatives to state on the slide: *not ArcGIS* (licence cost, not deployable to a Gram Sabha), *not YOLO-on-Landsat* (object detection is the wrong tool; the task is temporal segmentation).

---

## 10. How it satisfies the PS (anti-disqualification ribbon)

| PS-mandated component | Delivered by |
|---|---|
| (a) OCR/NER digitization of FRA records | **VAANI** |
| (b) CV satellite asset mapping | **SEEMA** (present) + **KAAL** (historic) |
| (c) WebGIS FRA Atlas, IFR/CR/CFR layers, progress tracking | **Atlas** + Rejection/Conflict/Evidence layers |
| (d) Rule-based + AI DSS, scheme layering (DAJGUA etc.) | **SETU** (schemes) + **NYAYA** (appeals) |

Put this table on the architecture slide so a strict reviewer confirms brief-compliance in seconds.

---

## 11. Expected outcomes / metrics (Criterion 8 — measurable)

**These are PROJECTED targets, not results** — the internal round is a blind idea PDF with no build yet, so label every number "target / to be validated in the spike." Presenting a target as an achieved result is a Criterion-8 integrity risk.
- **Conversion-year accuracy:** breakpoint year within ±3 years of truth on ≥70% of a labelled subset (spike target). **Validation caveat:** high-res reference imagery (Google Earth) often starts only ~2003–06 in tribal India, so pre-2000 dates are validated by Corona↔Landsat cross-check, and accuracy is reported only where reference exists.
- **Rejection-reason NER:** ≥80% correct reason category on a labelled holdout.
- **Asset segmentation:** per-class IoU reported (not aggregate accuracy).
- **Dossier generation:** one claim polygon in → complete evidence dossier PDF out, no manual step.
- **Coverage:** ≥30-year annual composite stack for the demo district.

**Fallback (if the spike underperforms):** demote KAAL (historic engine) to a labelled "roadmap/research" track and promote **SEEMA conflict-detection + NYAYA rejection-matching** as the differentiator — still novel, no imagery-dating risk.

---

## 12. Risks & honest limitations (attack these)

1. **Legal admissibility is asserted, not proven — AND the case law runs the *opposite* way (verified).** There is **no documented precedent of an appeal reversed *in a claimant's favour* on remote-sensing evidence** [§13-C14]. Worse: the actual FRA satellite case law is about imagery being used to **wrongly reject** claims — **Gujarat High Court, 2013** (PIL, Van Kanun Bachau Samiti) held satellite/BISAG imagery may be *one of several* evidences but **cannot be mandatory**, and ordered re-review of 1,00,000+ rejected claims; reaffirmed in **R/Special Civil Application 4162/2024**. So courts view this exact evidence type with *suspicion as a rejection instrument*.
   → **Turn this into the pitch's spine, not a liability:** SAAKSHYA uses the very imagery the state used *against* forest-dwellers, but *for* them — and builds to the exact standard the courts demanded ("supplementary, never mandatory/decisive"). Cite the 2013 Gujarat judgment **affirmatively** on the slide: *"Even the courts agree imagery is supplementary — SAAKSHYA is engineered to that standard, and points it at winning claims, not denying them."* Word every slide as *"strengthens the Gram Sabha's Rule-13 bundle,"* never *"decisive proof."*
2. **Dual-use harm.** The same engine could let a forest department manufacture *proof-of-absence* to mass-reject. → Architecture emits **only corroborating evidence**; absence-of-signal is never rendered as an artifact; dossiers are Gram-Sabha-owned + consent-gated. Stated as a design principle → converts risk into a Criterion-4 point.
3. **Sub-pixel homesteads** at 30–80 m (≈79 m in the MSS era; see §6). → Claim only patch-scale cultivation + Corona for settlement; state the limit.
   - **3b. OTFD 75-year bar is unreachable by satellite** (archive starts 1967/1972; OTFD needs ~1930). → Scope KAAL to ST claims + OTFD *continuity strengthening*; never claim it proves the 75-year test. [§13-C17]
9. **KAAL addresses only ~2 of 5 rejection reasons** (no-pre-2005-proof, boundary-dispute). Eligibility/procedure/incomplete-form rejections are untouched by imagery. → Frame KAAL as the *evidentiary* engine; VAANI/NYAYA handle the rest. Do not imply satellite is a master key. [§13-C16]
10. **Input data may not exist digitally** — KAAL needs the claim polygon + rejection order per claim, and both are often only on paper (the PS's own premise). This is the top feasibility threat, not a footnote. → MVP ingests digitized/synthetic claims for one district; state the digitization dependency openly and position VAANI as the on-ramp.
11. **Pre-2000 dating may be hard to validate** — high-res reference imagery (Google Earth) often starts ~2003–06 in tribal India, so ground truth for old breakpoints is thin. → Use Corona↔Landsat cross-validation as truth; report accuracy only where reference exists; present ±3-yr as a *projected* spike target, not a result.
4. **Shifting cultivation (podu/jhum)** in Odisha/Tripura: cyclic clear→regrow can read as false "loss then recovery." → Must be modelled as a **distinct positive evidence class of traditional occupation**, not noise. (This is also the highest-value "deep understanding" point for the slide.)
5. **Parcel-level rejection data may not be openly available.** → MVP uses curated/synthetic village data, stated openly.
6. **Sensitive geodata:** precise tribal habitation polygons could enable eviction targeting. → Public tier shows village-level aggregates; parcel geometry gated behind Gram Sabha consent.
7. **Cloud cover (monsoon):** → dry-season (Nov–Mar) composites; publish per-year valid-observation counts; never silently interpolate.
8. **Scope inflation:** ASR + OCR + CV + historic + DSS is not 6-person-feasible in a hackathon. → MVP fixed to **evidence engine + atlas + NYAYA**; the rest is roadmap.

---

## 13. CLAIMS LEDGER (fact-check target)

Status key: **CONFIRMED** / **VERIFIED** (authoritative source found) · **PARTIALLY CORRECT / OVERSTATED** (mostly right, a detail is wrong — see note) · **NEEDS-CHECK** (plausible, confirm before slide) · **UNVERIFIED-negative** (absence of evidence found, not proof of absence) · **KNOWN-LIMITATION** (true constraint we must disclose, not a sourcing gap).

| # | Claim | Status | Source / Note |
|---|---|---|---|
| C1 | FRA recognizes rights of FDST/OTFD who occupied forest land **before 13 Dec 2005** (Sec 4(3)). | **VERIFIED** | Vajiram/Drishti/Wikipedia FRA summaries; MoTA FAQ. The "75-yr/3-generation" test for OTFD is guidance, not a rigid cutoff. |
| C2 | Appeals under Sec 6(2)/6(4) filed within **60 days**; three tiers Gram Sabha → SDLC → DLC. | **VERIFIED** | FRA implementation guides; thelaw.institute; MoTA FAQ. |
| C3 | **≈47,901** CFR/CFRR claims rejected nationally. | **PARTIALLY CORRECT** (independently checked) | It is **community (CFR/CFRR) cumulative-national** rejections — NOT total FRA rejections (IFR+CR total runs ~1.9 million+; **do not conflate**). Figure traceable only to **secondary** source (Down To Earth citing MoTA MPR March 2026; WB 9,254 / J&K 7,197 / MP 6,285 / Karnataka 4,270 / Chhattisgarh 3,658). Primary MoTA MPR PDF was not independently openable. Label slide "community claims rejected." |
| C4 | Root causes of rejection: no pre-2005 proof, arbitrary rejections, forest-dept resistance, ignored Gram Sabha. | **VERIFIED** | Down To Earth; Oxfam India; Vidhi Legal Policy; GRAAM. |
| C5 | Forest depts illegally insisted on specific evidence (e.g. satellite imagery, caste certs). | **VERIFIED** | The Wire Science; Rule 12A(11) analysis. |
| C6 | GPS/boundary mapping helps resolve competing CFR claims. | **VERIFIED** | Oxfam India (GPS training for boundary demarcation). |
| C7 | Government **FRA Atlas** exists on ISRO **Bhuvan**. | **PARTIALLY CORRECT / OVERSTATED** | Bhuvan hosts FRA-related layers and **state atlases exist** (Tripura launched NE's *first* digital FRA Atlas, May 2026, indiatodayne.in) — but a **shipped national "FRA Atlas" product is NOT confirmed**; the PS asks teams to *build* one. Reword to state-atlases-only. (Helps our differentiation.) |
| C8 | An open-source clone of PS-25108 (OCR+CNN+Bhuvan+LangChain DSS) is public on GitHub. | **VERIFIED** | github.com/jeetgoyal80/FRA-Portal (readme matches). |
| C9 | Landsat has imaged Earth since **1972**, covering the full pre-2005 window. | **CONFIRMED w/ caveat** | Landsat 1 launched 23 Jul 1972 (science.nasa.gov). **BUT** MSS 1972–~1982 is **~79 m** (not 30–60 m); 30 m starts with TM in 1982. The earliest, most valuable decade is the coarsest — state this. |
| C10 | Corona KH-4B declassified imagery, **1960–72, ~1.8 m** at nadir, usable for historic land-cover. | **PARTIALLY CORRECT** | ~1.8 m is right, but **KH-4B flew 1967–1972**, not 1960–72. Full Corona *program* = 1960–72 with coarser earlier cameras (KH-1…4, ~7.5–3 m). Fix the dates. |
| C11 | **LandTrendr / CCDC** are established GEE algorithms that detect the **year** of a land-cover change. | **VERIFIED** | MDPI RS 2018 (LandTrendr on GEE); Google Earth Engine CCDC catalog; ScienceDirect temporal-segmentation review. |
| C12 | Rule 13 (amended **6 Sept 2012**): satellite imagery is **one of 13+** evidence types; **"may supplement, not replace"**; any **two** evidences submitted. | **VERIFIED** | MoTA FAQ; FRA Rules book (tribal.nic.in); Foresters' Guide. Quote the exact sub-clause verbatim before slide use. |
| C13 | SDLC/DLC **cannot insist** on a particular evidence (Rule 12A(11)); upheld by Gujarat HC. | **VERIFIED** | The Wire Science; legal analyses. Confirm the Gujarat HC citation before printing. |
| C14 | **No documented FRA appeal has reversed a rejection on remote-sensing evidence.** | **CONFIRMED — with a critical twist** | Independent check: no claimant-favourable precedent found (claim holds). BUT the actual case law runs **opposite** — satellite imagery is documented as the tool that *wrongly rejected* claims: **Gujarat HC 2013** (Van Kanun Bachau Samiti PIL) + **R/SCA 4162/2024** ruled imagery cannot be mandatory/decisive and ordered re-review. Courts are *skeptical* of this evidence type. See §12 risk #1 for the flip-narrative that turns this into the pitch's spine. Source: landconflictwatch.org; newslaundry.com. |
| C13b | Gujarat High Court barred mandatory satellite-only verification. | **CONFIRMED** | Gujarat HC 2013 (Van Kanun Bachau Samiti) + R/Special Civil Application 4162/2024. landconflictwatch.org. |
| C15 | DAJGUA convergence with FRA-patta holders (PM-JANMAN, PM-KISAN, JJM, MGNREGA). | **CONFIRMED** | DAJGUA launched 2 Oct 2024, ₹79,156 cr, 25 interventions, 17 ministries, **special focus on 22 lakh FRA patta holders** (PIB PRID 2061196). *(Note: PS text says "3 ministries" — the umbrella spans 17; don't over-index on the PS number.)* |
| C16 | "No pre-2005 proof" is the **most common** rejection reason; KAAL addresses the largest share of rejections. | **NEEDS-CHECK** | Ranking of rejection reasons NOT verified. KAAL provably answers only 2 of 5 reason categories (evidentiary + boundary). Do not claim "most common" without a source; frame KAAL as attacking the *evidentiary* category. |
| C17 | Satellite can prove pre-2005 occupation for FRA claims. | **KNOWN-LIMITATION** | True for **ST** (bar = pre-13-Dec-2005, inside 1972 archive). **False for OTFD** (bar = ~75 yrs / ~1930, beyond any satellite). Scope KAAL to ST + OTFD-continuity-strengthening. |
| C18 | **No shipped FRA tool** uses historical satellite time-series for evidence recovery. | **VERIFIED (shipped-tools) / UNVERIFIED (academia)** | No shipped/known FRA product does this (prior-art audit). NOT confirmed that no *academic* work exists on historical-RS land-tenure dating — soften absolute "nobody does this" to "no shipped FRA tool." |

---

## 14. Open questions for reviewers (resolve before finalising)

1. **[Highest leverage]** Does *any* documented FRA appeal cite remote-sensing/satellite evidence as decisive or contributory? Decides whether S4 says "decisive proof" or "strengthens the bundle." (C14)
2. Is the 47,901 figure traceable to the primary MoTA MPR, and is it national-cumulative or a subset? (C3)
3. Exact verbatim text of Rule 13 sub-clause admitting imagery + elder testimony. (C12)
4. Are rejection orders obtainable in bulk (RTI / state portal) to train VAANI's NER, or must the training set be synthesized?
5. Does the internal rubric award marks for an appendix beyond slide 6, or is anything past slide 6 discarded?
6. Confirm Corona KH-4B scene coverage over the chosen district (Dindori/Mandla MP or Kandhamal Odisha) via EarthExplorer *before* committing.

---

## 15. Glossary (for non-experts & agents)

- **FRA** — Forest Rights Act, 2006. Gives forest-dwellers legal rights over land they occupied pre-13-Dec-2005.
- **IFR / CR / CFR** — Individual / Community / Community-Forest-Resource rights (the three claim types).
- **Patta** — a land-title document.
- **Gram Sabha** — village assembly; the FRA's grassroots decision body that verifies claims.
- **SDLC / DLC** — Sub-Divisional / District Level Committees; the appeal tiers above the Gram Sabha.
- **Rule 13** — the FRA Rules clause listing acceptable evidence types (incl. satellite imagery, supplementary).
- **Landsat / Sentinel-2 / Corona** — satellite imagery archives (1972→ / 2015→ / 1960–72 declassified).
- **LandTrendr / CCDC** — algorithms that find the *year* land cover changed from a time-series of images.
- **NDVI / NBR** — greenness / burn indices computed from imagery to track vegetation.
- **PostGIS** — spatial database; here used to detect overlapping claim polygons.
- **NER** — Named Entity Recognition; pulls names/dates/reasons out of scanned text.
- **DAJGUA** — Dharti Aaba Janjatiya Gram Utkarsh Abhiyan (tribal village development mission; scheme-convergence umbrella named in the PS).

---

*Sources are listed inline in the Claims Ledger (§13). All statistics trace to a named source; none are invented. Anything a reviewer cannot re-verify should be treated as NEEDS-CHECK and kept off the final slides until confirmed.*
