# SAAKSHYA 2.0 — Change Specification
## PS 25108 | FRA Evidence-to-Action Intelligence Platform

> **Purpose:** Exact changes required in the current SAAKSHYA concept, PRD, architecture, MVP, UI, pitch and implementation plan.

## 1. Executive Decision

### Keep the core idea

The strongest part of SAAKSHYA is the **reconstruction of historical evidence for disputed/rejected FRA claims**.

### Change the product scope

Do not make SAAKSHYA only a rejected-claim/appeal product. PS 25108 requires digitization, satellite/AI asset mapping, WebGIS FRA Atlas and DSS/scheme convergence. fileciteturn10file0L11-L13

### Final positioning

> **SAAKSHYA is an AI-powered FRA Evidence-to-Action Intelligence Platform that connects historical evidence, FRA records, spatial intelligence and explainable development planning.**

### Core story

```text
PAST
Historical Evidence
       ↓
PRESENT
FRA Atlas + Current Assets
       ↓
ACTION
Explainable DSS + Scheme Convergence
```

Secondary hook:

> **For disputed and rejected claims, SAAKSHYA reconstructs historical spatial evidence to support human review.**

---

## 2. Product Architecture — CHANGE

The current PRD uses KAAL, SEEMA, VAANI, NYAYA, SETU and Atlas. fileciteturn10file1L42-L48 Keep those names internally, but simplify the external architecture.

```text
                         SAAKSHYA
                            │
             ┌──────────────┼──────────────┐
             ↓              ↓              ↓
        EVIDENCE        FRA ATLAS       DECISION
         ENGINE          / SPATIAL       ENGINE
                            │
             └──────────────┼──────────────┘
                            ↓
                     ACTION / DOSSIER
```

### Internal mapping

```text
EVIDENCE ENGINE
 ├── KAAL
 └── VAANI

FRA ATLAS / SPATIAL INTELLIGENCE
 └── SEEMA

DECISION ENGINE
 ├── NYAYA
 └── SETU
```

**Rule:** Do not force judges to remember five Sanskrit/Hindi module names.

---

## 3. Make FRA Atlas the Central Product

The existing PRD calls Atlas the “WebGIS glue.” fileciteturn10file5L248-L253 Change this: **Atlas becomes the central interface and the visible PS-compliance backbone.**

### Mandatory layers

- IFR
- CR
- CFR
- Granted claims
- Rejected claims
- Pending claims
- Village/block/district boundaries
- Forest
- Agriculture
- Water bodies
- Homesteads
- Roads
- Irrigation infrastructure
- Relevant infrastructure/PM Gati Shakti layers where available
- Historical evidence strength
- Land-use change
- Boundary/conflict zones
- Development gaps
- Priority villages

### Architecture

```text
                    FRA ATLAS / WEBGIS
                           │
       ┌───────────────────┼───────────────────┐
       ↓                   ↓                   ↓
 HISTORICAL             CURRENT             DECISION
 EVIDENCE               ASSETS              SUPPORT
       │                   │                   │
       ↓                   ↓                   ↓
  KAAL / VAANI          SEEMA              NYAYA / SETU
```

---

## 4. ADD — Village FRA Intelligence Profile

Every FRA village should have a profile containing:

```text
Village: XYZ
District: Mandla
State: Madhya Pradesh

FRA STATUS
IFR | CR | CFR | Rejected | Pending

LAND
Agriculture | Forest | Settlement | Water

INFRASTRUCTURE
Ponds | Roads | Irrigation | Water access

EVIDENCE
Claims with historical evidence | Conflicts | Evidence strength

DEVELOPMENT PRIORITIES
1. Water infrastructure
2. Land development
3. Road connectivity
```

This turns SAAKSHYA from a claim-only tool into an FRA monitoring/planning platform.

---

## 5. ADD — Past → Present → Action

Make this the primary system narrative:

```text
Historical Documents + Historical Satellite
                    ↓
          HISTORICAL EVIDENCE
                    ↓
                FRA ATLAS
                    ↓
     Current Satellite + Infrastructure
                    ↓
          CURRENT VILLAGE STATE
                    ↓
                   DSS
                    ↓
          DEVELOPMENT PRIORITY
```

Example:

> Historical transition around 1994 → current agricultural area → low irrigation coverage → water/irrigation becomes a development priority.

---

## 6. SEEMA — UPGRADE

Current SEEMA already covers agriculture, forest, water, homesteads and conflict detection. fileciteturn10file1L235-L237

Add infrastructure intelligence:

```text
SEEMA
├── Agriculture
├── Forest
├── Water bodies
├── Homesteads
├── Roads
├── Irrigation structures
└── Selected infrastructure
```

**MVP rule:** start with 4–6 reliable classes instead of attempting dozens.

---

## 7. Evidence Engine — KEEP as the Unique Wedge

The historical evidence engine remains the most differentiated component.

```text
Claim Polygon
      ↓
Historical Imagery
      ↓
Cloud masking
      ↓
NDVI / NBR / Tasseled-Cap
      ↓
Temporal analysis
      ↓
Breakpoint detection
      ↓
Land-use classification
      ↓
Confidence
      ↓
Evidence timeline
```

The current build already makes the real KAAL breakpoint dating, Corona georeferencing and dossier the primary proof artifact. fileciteturn10file8L379-L388 Keep that strategy.

---

## 8. CRITICAL LANGUAGE CHANGE — “PROOF”

### Never say

- “SAAKSHYA proves the claim.”
- “AI proves occupation.”
- “SAAKSHYA proves ownership.”
- “The system decides whether the claim is valid.”

### Say

- “SAAKSHYA reconstructs historical spatial evidence.”
- “The evidence can corroborate a claim.”
- “The output is supplementary evidence.”
- “The system supports human/legal/administrative review.”
- “Confidence indicates evidence strength, not legal validity.”

### Required principle

> **SAAKSHYA does not adjudicate forest rights. It produces an auditable, confidence-scored evidence bundle for human review.**

This matches the current PRD non-goal that the output is an evidence bundle, never proof of right. fileciteturn10file4L186-L199

---

## 9. ST vs OTFD — MAKE EXPLICIT

The current PRD correctly notes that satellite evidence can support ST pre-2005 analysis but cannot prove the full OTFD historical period. fileciteturn10file1L52-L60

### ST

```text
Pre-2005 requirement
        ↓
Historical satellite evidence
        ↓
May corroborate pre-2005 spatial continuity
```

### OTFD

```text
Longer historical occupation requirement
        ↓
Satellite archive insufficient for full period
        ↓
Continuity-strengthening evidence only
        ↓
Additional documentary/testimonial evidence required
```

Make this distinction visible in the UI and pitch.

---

## 10. Legal Positioning — CHANGE

Do not use an unverified claim such as “courts wrongly rejected claims using satellite imagery.”

Use:

> **“Satellite imagery is treated as supplementary evidence, not a standalone determination of rights.”**

If a precedent is shown, the research/legal member must verify the exact case, paragraph and legal proposition before it enters the deck.

---

## 11. DSS — SPLIT INTO TWO MODES

### DSS A — Claim Review

```text
Rejected Claim
      ↓
Rejection reason
      ↓
Evidence available
      ↓
Evidence limitations
      ↓
Recommended next action
```

### DSS B — Development Planning

```text
FRA Village
      ↓
Land + Water + Forest + Infrastructure
      ↓
Development Gap Score
      ↓
Scheme Eligibility
      ↓
Priority Intervention
```

This directly strengthens compliance with the PS's DSS/scheme-convergence requirement. fileciteturn10file0L11-L13

---

## 12. ADD — Explainable DSS

Never show only:

> Recommended: Jal Jeevan Mission

Show:

```text
RECOMMENDATION
Priority: WATER INFRASTRUCTURE
Confidence: 84%

WHY?
✓ FRA households
✓ Low water-access indicator
✓ Agricultural area
✓ Limited nearby water assets
✓ Infrastructure gap

POSSIBLE CONVERGENCE
→ Jal Jeevan Mission
→ MGNREGA
→ DAJGUA
```

Add a **“Why this recommendation?”** action that opens:

```text
DATA
 ↓
RULE
 ↓
CALCULATION
 ↓
EVIDENCE
 ↓
RECOMMENDATION
```

---

## 13. ADD — Configurable Priority Score

Prototype example:

```text
Priority Score =
0.30 × Water Gap
+ 0.25 × Infrastructure Gap
+ 0.20 × Agricultural Potential
+ 0.15 × FRA Beneficiary Coverage
+ 0.10 × Scheme Eligibility
```

Label this clearly:

> **Prototype decision model — configurable by department.**

Do not claim the weights are government-approved.

---

## 14. Scheme Engine — KEEP RULE-BASED

Do not make an LLM the final eligibility decision maker.

```text
Village/Holder Data
       ↓
Structured Rules
       ↓
Eligibility
       ↓
Priority
       ↓
Evidence
       ↓
Recommendation
       ↓
LLM/Template Explanation
       ↓
Human Officer
```

The current PRD already keeps SETU as a declarative rules layer for scheme eligibility. fileciteturn10file5L281-L289 Keep this design.

---

## 15. Evidence Dossier — MAKE IT THE FLAGSHIP OUTPUT

Current dossier requirements already include claim ID, map, image strip, conversion-year finding, confidence, Rule-13 category, rejection match, testimony and Gram Sabha resolution. fileciteturn10file5L255-L257

### Recommended structure

**Page 1 — Claim Summary**
- Claim ID
- Village
- District
- Claim type
- Status
- Rejection reason

**Page 2 — Spatial Evidence**
- Claim polygon
- Satellite image
- Forest boundary
- Conflict layers
- Asset layers

**Page 3 — Historical Timeline**
- 1972 → 1985 → 1995 → 2005 → 2015 → 2025

**Page 4 — AI Findings**
- detected transition
- confidence
- confidence drivers
- model/version

**Page 5 — Evidence Limitations**
- available evidence
- unavailable evidence
- uncertainty
- additional verification recommended

**Page 6 — Human Review**
- Gram Sabha testimony
- resolution
- officer remarks
- verification status

---

## 16. ADD — Evidence Provenance

Every evidence item should carry:

```text
Source
Acquisition date
Resolution
Processing method
Model/version
Confidence
Georeferencing quality
```

Example:

```text
Source: Landsat MSS
Acquisition: 1985-02-17
Resolution: 60m
Processing: Cloud masking + NDVI
Analysis: Temporal breakpoint
Confidence: 82%
```

The existing build already proposes confidence drivers including valid observations, break magnitude, classifier probability and registration RMSE. fileciteturn10file9L410-L414 Surface those drivers in the dossier/UI.

---

## 17. ADD — Uncertainty on the Map

```text
Claim A → 91% High
Claim B → 73% Medium
Claim C → 41% Low
```

Rule:

> Low confidence → human verification recommended.

Confidence must never be presented as legal validity.

---

## 18. ADD — Human-in-the-Loop

```text
AI
 ↓
Evidence
 ↓
Confidence
 ↓
Human Review
 ↓
Accept / Reject / Request Verification
 ↓
Administrative Action
```

Officer actions:

- accept evidence
- reject evidence
- request field verification
- add remarks
- override recommendation
- attach document

Record:

```text
Who
When
What changed
Why
```

---

## 19. Dual-User System — KEEP, IMPROVE

### Officer

- district analytics
- rejection heatmap
- review queue
- village intelligence profiles
- scheme priorities
- evidence review

### Gram Sabha / facilitator

- claim status
- historical evidence
- dossier
- testimony
- boundary/dispute view
- correction/review workflow

### Forest / Revenue

- boundary conflicts
- verification
- evidence quality

### State / MoTA

- aggregate analytics
- district comparison
- implementation monitoring
- policy planning

The existing PRD already treats the officer and Gram Sabha as first-class users. fileciteturn10file4L203-L214

---

## 20. Privacy — STRENGTHEN

### Public layer

- village-level aggregate statistics
- FRA progress
- anonymized spatial information

### Restricted layer

- claimant identity
- sensitive parcel information
- personal records
- sensitive community information
- detailed rejected-claim evidence

Keep parcel/claimant-level access role/consent gated. The current PRD already identifies consent-gated parcel geometry as a safeguard. fileciteturn10file1L54-L60

---

## 21. DO NOT ADD

Keep these outside MVP:

- Blockchain
- Court-filing integration
- IoT
- Real-time sensor infrastructure
- Full mobile app
- Nationwide production deployment
- Fully autonomous legal adjudication
- LLM-based final eligibility decisions

IoT is future scope, not a core requirement. fileciteturn10file0L11-L13

---

## 22. Historical Imagery Strategy — CHANGE

Do not make Corona imagery mandatory for every claim.

### Tier 1
Landsat historical archive → present.

### Tier 2
Corona imagery where coverage, quality and georeferencing permit.

### Tier 3
Documents, testimonies and other historical sources.

The current MVP correctly flags manual Corona georeferencing as a limitation; do not call the pipeline “zero-touch.” fileciteturn10file8L397-L400

---

## 23. MVP — CHANGE THE VERTICAL SLICE

### New ideal vertical slice

```text
Claim Polygon
      ↓
Rejection Reason
      ↓
Historical Evidence
      ↓
Current Satellite Assets
      ↓
FRA WebGIS
      ↓
Village Intelligence Profile
      ↓
DSS
      ↓
Evidence / Decision Dossier
```

This demonstrates all four PS components while retaining the unique evidence-recovery wedge.

---

## 24. MVP BUILD PRIORITY

### MUST BE REAL

1. Historical Evidence Engine
2. Real generated evidence dossier
3. WebGIS core
4. One real asset-mapping use case
5. One real DSS use case

### CAN BE MOCKED EARLY

- Full Atlas UI
- Full NYAYA workflow
- Full VAANI OCR pipeline
- Full multi-state analytics
- Complete scheme catalog
- Full Gram Sabha interface
- Advanced infrastructure detection

The current internal build spec already uses a real KAAL/dossier proof artifact while allowing Atlas/NYAYA mockups and SEEMA/VAANI/SETU stubs for the early round. fileciteturn10file8L379-L388

---

## 25. DATA STRATEGY

### Demo

- one district
- 15–20 representative claims
- granted/rejected mix
- ST/OTFD examples
- curated/synthetic administrative metadata where necessary

Clearly label anything non-official as:

> **Illustrative / curated / synthetic data**

### Scale

```text
1 District
   ↓
1 State
   ↓
4 Target States
```

The current PRD already defines one-district validation and a four-state target scope. fileciteturn10file1L26-L28

---

## 26. AI VALIDATION — ADD

### Document AI

- OCR accuracy
- NER precision/recall/F1
- rejection-reason classification accuracy

### Satellite segmentation

- IoU
- F1
- precision
- recall

### Change detection

- temporal error
- false positive rate
- confidence calibration

### GIS

- geometry validity
- overlap accuracy

### Dossier

- generation time
- reproducibility

---

## 27. NEGATIVE CONTROLS — KEEP AND EXPAND

Current acceptance criteria already require a negative control where stable forest returns “no conversion.” fileciteturn10file8L390-L395

Add:

```text
Stable forest → no conversion
Known agriculture → agriculture
Known settlement → settlement
Synthetic overlap → conflict detected
Cloud-heavy image → confidence decreases
Poor georeferencing → confidence decreases
```

---

## 28. METRICS — LABEL CORRECTLY

Never call projected targets “results.”

Use:

> **Target / projected / validation objective**

Examples:

```text
NER F1 target: ≥80%
Segmentation IoU target: ≥0.70
Change-date target: ±3 years where reference exists
Dossier generation target: <60 sec
```

Once tested, show target versus observed.

---

## 29. CLAIMS TO REMOVE FROM THE PITCH

### Replace

> “Nobody rebuilds the rejected ones.”

with:

> **“Existing approaches largely emphasize recorded/granted claims; SAAKSHYA adds an evidence-recovery workflow for disputed and rejected claims.”**

### Replace

> “Winning rejected claims.”

with:

> **“Strengthening the evidence bundle for review.”**

### Replace

> “AI proves occupation.”

with:

> **“AI reconstructs historical spatial evidence that may corroborate occupation continuity.”**

---

## 30. PPT — CHANGE SLIDE 3

### New architecture story

```text
PAST → PRESENT → ACTION

PAST
Evidence Engine
KAAL + VAANI

↓

PRESENT
FRA Atlas + Spatial Intelligence
SEEMA

↓

ACTION
Explainable DSS
NYAYA + SETU
```

Add a PS-compliance ribbon:

> **Digitization + Satellite AI + WebGIS + DSS**

---

## 31. PPT — CHANGE SLIDE 4

Keep the historical evidence money-shot.

End with:

> **“Corroborating evidence generated for human review.”**

Do not end with “claim proven.”

The current PPT already uses the real Corona/Landsat decade strip, breakpoint chart and confidence as the hero artifact. fileciteturn10file6L327-L330

---

## 32. PPT — CHANGE SLIDE 5

Use:

```text
┌───────────────────────────────┐
│ FRA ATLAS                     │
│ Claims | Forest | Water |     │
│ Agriculture | Evidence        │
└──────────────┬────────────────┘
               ↓
┌───────────────────────────────┐
│ Village Intelligence Profile  │
│ FRA + Assets + Gaps           │
└──────────────┬────────────────┘
               ↓
┌───────────────────────────────┐
│ DSS                           │
│ Priority + Why + Schemes      │
└───────────────────────────────┘
```

Keep a smaller rejected-claim evidence panel.

---

## 33. PPT — CHANGE SLIDE 6

Show:

### Feasibility
- GEE
- PostGIS
- React/MapLibre
- FastAPI
- Python ML/CV
- Object storage

### Scale

```text
1 District → 4 States → State/Ministry scale
```

### Validation

Show targets and observed values separately.

---

## 34. Recommended Technical Stack

```text
Frontend
React / Next.js
MapLibre GL JS

Backend
FastAPI
Python

GIS
PostGIS
GeoPandas
Rasterio

Remote Sensing
Google Earth Engine
Sentinel-2
Landsat
Corona where available

ML/CV
PyTorch / TensorFlow
scikit-learn
OpenCV

Document AI
OCR
NER
Structured extraction

Storage
PostgreSQL/PostGIS
Object storage

Reporting
Python PDF generation

Deployment
Docker
AWS/Azure/GCP as appropriate
```

Do not add technology merely to make the stack look impressive.

---

## 35. Database Concept

```text
Village
 ├── Claim
 │    ├── ClaimStatus
 │    ├── ClaimType
 │    ├── RejectionReason
 │    └── Geometry
 │
 ├── HistoricalEvidence
 │    ├── Source
 │    ├── Date
 │    ├── Finding
 │    └── Confidence
 │
 ├── SpatialAsset
 │    ├── Type
 │    ├── Geometry
 │    └── Confidence
 │
 ├── Infrastructure
 │
 ├── Scheme
 │    └── EligibilityRule
 │
 ├── Recommendation
 │    ├── Score
 │    ├── Reason
 │    └── Evidence
 │
 └── Review
      ├── Reviewer
      ├── Decision
      └── AuditTrail
```

---

## 36. Final User Journey

```text
Officer opens SAAKSHYA
        ↓
Selects district → village
        ↓
Village Intelligence Profile
        ↓
Sees rejected claims
        ↓
Opens Claim #1028
        ↓
Rejection reason
        ↓
Historical evidence timeline
        ↓
Confidence + provenance
        ↓
Current assets / infrastructure
        ↓
Development DSS
        ↓
“Why this recommendation?”
        ↓
Generate Evidence & Decision Dossier
        ↓
Human review / action
```

---

## 37. Final Product Definition

# SAAKSHYA 2.0

> **An AI-powered FRA Evidence-to-Action Intelligence Platform for integrated monitoring, historical evidence reconstruction, spatial asset mapping and explainable development planning.**

### Four pillars

```text
1. DIGITIZE
Legacy FRA documents → structured records

2. EVIDENCE
Historical satellite + documents → corroborating evidence

3. ATLAS
FRA + land + water + forest + infrastructure → WebGIS

4. ACT
Village gaps + scheme rules → explainable DSS
```

---

## 38. Winning Differentiator

Do not pitch SAAKSHYA as another FRA dashboard.

Pitch it as:

> **“SAAKSHYA creates an evidence-to-action chain: historical evidence for disputed claims, a unified FRA Atlas for present conditions, and an explainable DSS for what should happen next.”**

### Unique wedge

> **Historical evidence reconstruction for disputed/rejected claims.**

### PS-compliance backbone

> **Digitization + satellite asset mapping + FRA Atlas + DSS.**

### Trust layer

> **Confidence + provenance + limitations + human review.**

### Impact layer

> **Scheme convergence + village-level development prioritization.**

---

# 39. Final Change Checklist

## Product
- [ ] Rename positioning to Evidence-to-Action
- [ ] Make FRA Atlas central
- [ ] Add Village Intelligence Profile
- [ ] Add current asset intelligence
- [ ] Add Development DSS
- [ ] Keep rejected-claim evidence as differentiator

## AI
- [ ] Historical change detection
- [ ] Asset segmentation
- [ ] OCR/NER
- [ ] Confidence
- [ ] Negative controls
- [ ] Validation metrics

## GIS
- [ ] IFR/CR/CFR
- [ ] Rejected/pending
- [ ] Forest
- [ ] Agriculture
- [ ] Water
- [ ] Infrastructure
- [ ] Conflict
- [ ] Evidence strength
- [ ] Development gaps

## DSS
- [ ] Claim Review DSS
- [ ] Development Planning DSS
- [ ] Scheme rules
- [ ] Priority score
- [ ] Explainability
- [ ] Human override

## Evidence
- [ ] Source
- [ ] Date
- [ ] Resolution
- [ ] Processing
- [ ] Confidence
- [ ] Provenance
- [ ] Limitations

## Safety / legal
- [ ] Never claim legal adjudication
- [ ] Never claim ownership proof
- [ ] Never claim satellite alone proves OTFD requirement
- [ ] Human review mandatory
- [ ] Sensitive data role-gated
- [ ] Avoid unverified “nobody does this” claims
- [ ] Verify every legal precedent

## MVP
- [ ] One district
- [ ] One real historical evidence dossier
- [ ] One real asset-mapping use case
- [ ] One real DSS use case
- [ ] Working WebGIS core
- [ ] Synthetic/curated demo data clearly labelled
- [ ] No fake measured results

---

# 40. Final Recommendation

**Do not rebuild SAAKSHYA from zero.**

Refactor it around:

> **Evidence Recovery → FRA Atlas → Spatial Intelligence → Explainable DSS**

The rejected-claim evidence engine remains the **innovation hook**.

The FRA Atlas, satellite asset mapping and DSS become the **PS compliance backbone**.

The confidence/provenance/human-review layer becomes the **trust mechanism**.

The village intelligence profile and scheme-priority engine become the **impact mechanism**.

### Final narrative

> **“SAAKSHYA connects what happened, what exists today, and what should happen next — while keeping every AI output explainable, auditable and subject to human review.”**
