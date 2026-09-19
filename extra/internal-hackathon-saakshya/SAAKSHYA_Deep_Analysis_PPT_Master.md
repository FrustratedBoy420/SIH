# SAAKSHYA --- Deep Analysis & PPT Master Document

## SIH PS 25108 \| AI-powered FRA Atlas + WebGIS DSS

> **Purpose of this document:** This is the master content and strategy
> document for building the SAAKSHYA SIH idea PPT. It combines the
> current PRD, PPT content pack, team brief, and PS 25108 requirements
> into one judge-oriented narrative.
>
> **Important:** Source-supported facts are preserved as facts. Proposed
> redesigns, recommendations, scoring logic, and inferred strategy are
> explicitly presented as recommendations---not as claims from the
> source material.

------------------------------------------------------------------------

# 0. Executive Summary

## What SAAKSHYA should become

SAAKSHYA should **not** be presented as merely an FRA dashboard and
should **not** be presented as an autonomous legal/claim adjudication
system.

The strongest version is:

> **SAAKSHYA is an Evidence-to-Action Intelligence Platform for FRA
> implementation that connects legacy records, historical evidence,
> present-day spatial assets, the FRA Atlas and explainable decision
> support.**

Its unique wedge remains:

> **Reconstructing historical spatial evidence for disputed/rejected
> claims.**

Its PS-compliance backbone remains:

1.  Legacy FRA data digitization
2.  AI/satellite asset mapping
3.  Interactive FRA WebGIS Atlas
4.  DSS for scheme convergence and development planning

The source PRD explicitly requires all four components while identifying
the rejected/disputed-claim evidence workflow as the differentiator.
fileciteturn12file1L157-L170

------------------------------------------------------------------------

# 1. What the Judge Must Understand in 90 Seconds

A judge should leave the first 90 seconds knowing exactly five things:

### 1. The problem

FRA information is fragmented across legacy documents, spatial records
and administrative workflows, while decision-makers lack an integrated
visual and decision-support layer.

The PS specifically identifies scattered/non-digitized IFR, CR and CFR
records, absence of a centralized FRA Atlas, missing integration with
satellite asset mapping, and lack of DSS-based scheme convergence.
fileciteturn11file2L112-L114

### 2. The unique insight

Most systems naturally move **forward**:

> granted title → scheme delivery → monitoring

SAAKSHYA additionally moves **backward**:

> rejected/disputed claim → historical evidence → human review

The existing concept deliberately positions this as the empty quadrant:
backward evidence recovery + Gram Sabha-facing workflow.
fileciteturn12file1L135-L141

### 3. The technology

Historical Landsat time-series + temporal change detection + present-day
satellite segmentation + OCR/NER + PostGIS + WebGIS + rule-based DSS.

### 4. The trust mechanism

AI does **not** decide legal rights.

It generates:

> **dated, confidence-scored, provenance-aware corroborating evidence
> for human review.**

### 5. The impact

The same spatial intelligence can move from:

> **"What happened to this claim?"**

to:

> **"What exists in this FRA village?"**

to:

> **"What intervention should be prioritized?"**

------------------------------------------------------------------------

# 2. Judge-Oriented Critique of the Current Concept

## What is already very strong

### A. Clear differentiation

The rejected/disputed-claim focus is more memorable than a generic GIS
dashboard.

### B. Strong technical wedge

The historical time-series approach is technically interesting and
directly tied to the evidence problem.

### C. Real artifact

A generated evidence dossier is much stronger than showing only
architecture.

The PRD explicitly defines the internal-round proof artifact as one real
evidence dossier generated from the KAAL spike.
fileciteturn12file1L189-L198

### D. Honest limitations

The concept explicitly states that satellite evidence cannot satisfy the
complete OTFD historical requirement and does not resolve
eligibility/procedural defects. fileciteturn12file1L145-L153

### E. PS compliance

The PRD explicitly commits to all four mandated PS components.
fileciteturn12file1L157-L163

------------------------------------------------------------------------

# 3. What a Tough National Hackathon Judge May Attack

## Attack 1 --- "Isn't this just another FRA Atlas?"

### Judge concern

The PS literally asks for an FRA Atlas.

A generic map is easy to reproduce.

### Our answer

> **"The Atlas is the platform surface; the differentiator is the
> evidence engine behind it."**

The Atlas shows:

-   granted
-   pending
-   rejected
-   conflict
-   evidence strength
-   assets
-   development gaps

The unique workflow is:

``` text
Rejected Claim
      ↓
Historical Evidence
      ↓
Spatial Context
      ↓
Human Review
      ↓
Dossier
```

------------------------------------------------------------------------

# 4. Attack 2 --- "Can satellite imagery actually prove occupation?"

## Answer

**No.**

And SAAKSHYA must never claim that it can.

The current PRD already correctly distinguishes ST and OTFD
applicability:

-   ST: pre-2005 evidence can be supported by the historical archive.
-   OTFD: the much longer historical requirement cannot be proven by the
    available satellite archive.
-   Other eligibility/procedural issues require other
    evidence/workflows. fileciteturn12file1L145-L153

### PPT wording

> **"Satellite evidence corroborates historical land-use continuity; it
> does not adjudicate rights."**

This is stronger than making an aggressive legal claim.

------------------------------------------------------------------------

# 5. Attack 3 --- "Why not simply use modern satellite imagery?"

Because the problem is **historical**.

Current imagery can answer:

> What exists today?

It cannot by itself answer:

> When did this land-use transition occur?

SAAKSHYA therefore uses a temporal archive:

``` text
1972
 ↓
1985
 ↓
1995
 ↓
2005
 ↓
2015
 ↓
Present
```

and analyzes the trajectory.

The current PRD specifies annual Landsat stacks,
NDVI/NBR/Tasseled-Cap-Wetness and LandTrendr/CCDC temporal segmentation.
fileciteturn12file1L206-L215

------------------------------------------------------------------------

# 6. Attack 4 --- "What happens when the imagery is cloudy or low quality?"

SAAKSHYA should respond through confidence rather than pretending
certainty.

Confidence should depend on:

-   valid observations
-   break magnitude
-   classifier probability
-   registration RMSE

The current PRD explicitly defines this confidence basis.
fileciteturn12file1L279-L280

### UI

``` text
Evidence Strength
████████████████  HIGH

Drivers
✓ 31 valid observations
✓ strong temporal break
✓ classifier probability 0.91
✓ low registration error
```

------------------------------------------------------------------------

# 7. Attack 5 --- "What if the AI is wrong?"

This is where SAAKSHYA should differentiate itself.

### Do not hide uncertainty.

Every output contains:

``` text
Finding
Confidence
Evidence sources
Model version
Processing method
Limitations
Human review
```

### Negative control

A continuously forested parcel must produce:

> **No conversion detected**

rather than inventing a change.

The current acceptance criteria already include this negative-control
requirement. fileciteturn12file1L358-L363

------------------------------------------------------------------------

# 8. Attack 6 --- "What exactly does the DSS do?"

Do not answer:

> "It recommends government schemes."

Too generic.

Split DSS into two concrete functions.

## DSS 1 --- Claim Review

``` text
Rejection reason
       ↓
Available evidence
       ↓
Evidence gap
       ↓
Next action
```

## DSS 2 --- Development Planning

``` text
Village state
       ↓
Asset/infrastructure gaps
       ↓
Scheme rules
       ↓
Priority intervention
       ↓
Explanation
```

The existing PRD already contains rejection-reason mapping and scheme
recommendation logic; the PPT should make the two workflows visually
distinct. fileciteturn12file1L249-L280

------------------------------------------------------------------------

# 9. Attack 7 --- "Why would a government department trust this?"

Because the system is:

### Explainable

Every recommendation has reasons.

### Auditable

Every evidence item has source/provenance.

### Human-controlled

Officer can review/override.

### Privacy-aware

Public view is aggregate; sensitive parcel information is gated.

### Rule-based where appropriate

Scheme eligibility is not delegated blindly to an LLM.

The PRD already specifies explainability, dual-use safeguards, privacy
and scalability requirements. fileciteturn12file1L325-L330

------------------------------------------------------------------------

# 10. The Core Product Model

## Four pillars

``` text
┌─────────────────────────────────────────┐
│               SAAKSHYA                  │
│     FRA Evidence-to-Action Platform     │
└─────────────────────────────────────────┘

      1. DIGITIZE
 Legacy FRA records → structured data

      2. EVIDENCE
 Historical imagery → corroborating evidence

      3. ATLAS
 FRA + assets + conflicts → WebGIS

      4. ACT
 Village gaps + scheme rules → DSS
```

------------------------------------------------------------------------

# 11. Recommended Final Architecture

``` text
                         SAAKSHYA
                            │
          ┌─────────────────┼─────────────────┐
          ↓                 ↓                 ↓
     EVIDENCE           FRA ATLAS          DECISION
      ENGINE           + SPATIAL            ENGINE
          │            INTELLIGENCE             │
          │                 │                   │
      KAAL/VAANI          SEEMA            NYAYA/SETU
          │                 │                   │
          └─────────────────┼───────────────────┘
                            ↓
                    EXPLAINABLE OUTPUT
                            │
                ┌───────────┼───────────┐
                ↓           ↓           ↓
             DOSSIER     REVIEW      PLANNING
```

## Internal modules

### KAAL

Historical evidence.

### VAANI

Document digitization + rejection classification.

### SEEMA

Present-day spatial assets + conflict detection.

### NYAYA

Rejection/evidence/appeal workflow.

### SETU

Scheme convergence.

### Atlas

The central user-facing spatial interface.

------------------------------------------------------------------------

# 12. The Most Important Flow in the Entire PPT

Use this flow as the central visual:

``` text
LEGACY RECORDS
      +
HISTORICAL SATELLITE
      ↓
   EVIDENCE
      ↓
   FRA ATLAS
      ↓
CURRENT ASSETS
      ↓
 DEVELOPMENT GAPS
      ↓
      DSS
      ↓
EXPLAINABLE ACTION
```

For a rejected claim:

``` text
Rejected Claim
      ↓
Rejection Reason
      ↓
Historical Evidence
      ↓
Evidence Strength
      ↓
Human Review
      ↓
Evidence Dossier
```

------------------------------------------------------------------------

# 13. The Six-Slide PPT --- Final Recommended Structure

The source PPT pack requires a maximum of six slides including the
title, no paragraphs, PDF output and blind assessment.
fileciteturn12file0L10-L16

Do not attempt to fit the entire PRD into six slides.

The PPT is not documentation.

It is a **persuasion system**.

------------------------------------------------------------------------

# SLIDE 1 --- TITLE / THE PROMISE

## Objective

Make the judge understand the domain + product + differentiator
immediately.

## Heading

**SAAKSHYA**

### Subtitle

> **AI-powered FRA Evidence-to-Action Intelligence Platform**

### Smaller PS title

> Development of AI-powered FRA Atlas and WebGIS-based Decision Support
> System (DSS) for Integrated Monitoring of FRA Implementation

### PS

**PS 25108 · Software · Miscellaneous**

## Hero line

> **"From rejected claims to evidence. From village data to action."**

Alternative sharper hook:

> **"Reconstructing historical evidence for the forest claims that were
> rejected."**

The source deck currently uses the rejected-claim hook.
fileciteturn12file0L35-L42

## Visual

Dark satellite map.

Center:

``` text
SAAKSHYA
```

Under it:

``` text
PAST → PRESENT → ACTION
```

No architecture on this slide.

No team name.

No college name.

No names.

------------------------------------------------------------------------

# SLIDE 2 --- THE PROBLEM

## Objective

Create urgency and establish that the problem is larger than "we need a
map."

## Layout

### Left: Rejection funnel

``` text
FRA CLAIMS
    ↓
VERIFICATION
    ↓
DECISIONS
    ↓
┌──────────────────────┐
│ REJECTED COMMUNITY   │
│ CLAIMS                │
│ ≈47,901               │
└──────────────────────┘
```

The current source pack identifies ≈47,901 community claims as the
headline figure and says it must be labelled as community CFR/CFRR
claims. fileciteturn12file0L44-L50

### Right: Four failure points

``` text
LEGACY RECORDS
Scattered / non-digitized

HISTORICAL EVIDENCE
Hard to reconstruct

SPATIAL INTELLIGENCE
Disconnected from FRA records

DECISION SUPPORT
Scheme convergence is fragmented
```

These correspond directly to the PS background.
fileciteturn11file2L112-L114

## Bottom punchline

Instead of:

> "Nobody rebuilds the rejected ones."

Use the safer, stronger version:

> **"FRA monitoring moves forward from granted rights. SAAKSHYA adds a
> backward evidence-recovery workflow for disputed and rejected
> claims."**

This avoids an absolute claim about every existing system.

------------------------------------------------------------------------

# SLIDE 3 --- THE IDEA / WHY SAAKSHYA IS DIFFERENT

## Objective

Answer:

> Why this team?

## Main visual: 2×2 innovation matrix

### X-axis

``` text
FORWARD
Scheme delivery
       ←→
BACKWARD
Evidence recovery
```

### Y-axis

``` text
OFFICER
       ↑
       ↓
GRAM SABHA
```

Place:

``` text
Existing FRA atlas / state systems
       → forward + officer

SAAKSHYA
       → backward + Gram Sabha
```

The existing PPT pack uses this "empty quadrant" concept.
fileciteturn12file0L52-L58

## Under matrix: SAAKSHYA architecture

``` text
VAANI
Legacy documents
      ↓
KAAL
Historical evidence
      ↓
SEEMA
Current assets + conflicts
      ↓
FRA ATLAS
Spatial intelligence
      ↓
NYAYA + SETU
Decision support
```

## PS compliance ribbon

``` text
DIGITIZE → VAANI
SATELLITE AI → KAAL + SEEMA
WEBGIS → ATLAS
DSS → NYAYA + SETU
```

## Small trust badge

> **Corroborating evidence · confidence-scored · human-reviewed**

------------------------------------------------------------------------

# SLIDE 4 --- THE MONEY SHOT: HOW THE EVIDENCE ENGINE WORKS

## Objective

This is the slide that should make the judge think:

> "They actually know how to build this."

The source deck already makes the real dossier the hero artifact.
fileciteturn12file0L60-L65

## Hero visual

Show an actual generated dossier screenshot.

Inside it:

``` text
CLAIM #XXXX

Historical Evidence
1975 | 1985 | 1995 | 2005 | 2015

        ↓

Temporal breakpoint
~1993

Trajectory:
Forest → Cultivation

Confidence:
87%

Evidence:
Corroborating

Review:
Human verification required
```

## Method ribbon

``` text
Landsat Archive
      ↓
Cloud Masking
      ↓
NDVI / NBR / Wetness
      ↓
LandTrendr / CCDC
      ↓
Temporal Breakpoint
      ↓
Trajectory Classification
      ↓
Confidence
      ↓
Evidence Dossier
```

## Three honest-limit chips

### Chip 1

> **ST:** pre-2005 continuity can be corroborated.

### Chip 2

> **OTFD:** longer historical requirement cannot be fully established
> from satellite archives.

### Chip 3

> **Satellite = supplementary evidence, not legal adjudication.**

These limitations are directly supported by the PRD.
fileciteturn12file1L145-L153

## Important

Do not use the old "winning claims" language.

The output is:

> **Evidence bundle for review.**

------------------------------------------------------------------------

# SLIDE 5 --- THE PLATFORM: ATLAS + DSS

## Objective

This slide proves that you didn't ignore the actual PS.

## Left 60%

### FRA Atlas

Map with:

``` text
LAYERS
☑ IFR
☑ CR
☑ CFR
☑ Granted
☑ Pending
☑ Rejected
☑ Conflict
☑ Evidence Strength
☑ Agriculture
☑ Forest
☑ Water
```

Click a parcel:

``` text
CLAIM #1028

Status:
Rejected

Reason:
Historical evidence gap

Historical evidence:
1993 transition

Confidence:
87%

[Generate Dossier]
```

The current PRD explicitly requires IFR/CR/CFR layers,
rejection/conflict/evidence-strength layers, filters and a claim drawer.
fileciteturn12file1L236-L245

## Right 40%

### Village Intelligence + DSS

``` text
VILLAGE X

FRA
183 IFR
12 CR
4 CFR

ASSETS
42 ha agriculture
7 ponds
Low irrigation

DSS
Priority #1
Water Infrastructure

WHY?
✓ low water index
✓ agricultural area
✓ infrastructure gap

SCHEME CONVERGENCE
JJM
MGNREGA
DAJGUA
```

## Bottom

``` text
CLAIM REVIEW
What happened?

       +

DEVELOPMENT PLANNING
What should happen next?
```

This is the conceptual improvement that makes the PS requirements
visible instead of hidden inside architecture.

------------------------------------------------------------------------

# SLIDE 6 --- FEASIBILITY / TECH / SCALE / VALIDATION

## Objective

Remove the fear:

> "Great idea, impossible to build."

## Section 1 --- Tech stack

``` text
GEE
50-year satellite archive

PyTorch
Present-day asset segmentation

PostGIS
Spatial topology + conflicts

FastAPI
ML/GIS backend

React + MapLibre
WebGIS + dashboards

OCR + NER
Legacy FRA digitization

JSON Rules
Scheme DSS
```

The PRD provides these stack choices and their FRA-specific
justification. fileciteturn12file1L306-L321

## Section 2 --- Data

``` text
Landsat
Corona*
Sentinel-2
Bhuvan
SRTM / DEM
LGD/Census
MoTA datasets
```

### Important

Do not write "zero data cost" as if all data is guaranteed to be
sufficient for every workflow.

Say:

> **Open/public data sources for the MVP**

The PRD identifies these as free/public sources and also notes the
Corona georeferencing and per-claim polygon caveats.
fileciteturn12file1L301-L302

## Section 3 --- Scale

``` text
1 DISTRICT
    ↓
1 STATE
    ↓
4 TARGET STATES
MP · Tripura · Odisha · Telangana
```

The PRD explicitly proposes one-district end-to-end first and scaling
through GEE + COG without re-architecture.
fileciteturn12file1L325-L330

## Section 4 --- Validation

Show:

``` text
TARGETS
±3 yr
historical dating

≥80%
rejection NER

Per-class IoU
asset mapping

1 → 1
claim → dossier
```

Label them:

> **Validation targets / spike-validated objectives**

Never call them achieved results unless actually measured.

The current PRD explicitly warns that these are projected targets, not
results. fileciteturn12file1L334-L340

## Section 5 --- Risks

Three small chips:

``` text
OTFD 75-year gap
→ continuity only

AI uncertainty
→ confidence + human review

Legacy records
→ OCR/NER + structured correction
```

------------------------------------------------------------------------

# 14. Why the PPT Should NOT Become Too Detailed

The source rules explicitly prohibit paragraph-heavy slides and require
graphics/infographics. fileciteturn12file0L10-L16

Therefore:

### This document is detailed.

### The PPT is not.

Think:

``` text
MASTER DOCUMENT
       ↓
      PPT
       ↓
    6 slides
       ↓
     1 idea
       ↓
   1 visual/message
```

Do not copy paragraphs from this document into the deck.

------------------------------------------------------------------------

# 15. The Three Visuals That Matter Most

If the designer has limited time, prioritize these three.

## Visual 1 --- Rejection Funnel

Purpose:

> Establish problem magnitude.

## Visual 2 --- Historical Evidence Timeline

Purpose:

> Prove technical uniqueness.

## Visual 3 --- FRA Atlas + DSS

Purpose:

> Prove PS compliance and practical impact.

Everything else supports these three.

------------------------------------------------------------------------

# 16. The Single Best Demo Artifact

The source plan says the internal round needs one real evidence dossier.
fileciteturn12file1L189-L198

Do not build ten mediocre screenshots.

Build **one excellent dossier**.

It should contain:

### Cover

``` text
SAAKSHYA
Evidence Dossier
Claim #XXXX
```

### Historical strip

``` text
1975
1985
1995
2005
2015
```

### Change chart

``` text
Vegetation index
       │
       │       ______
       │      /
       │_____/
            ↑
         ~1993
```

### Finding

> Forest-to-cultivation trajectory detected around 1993.

### Confidence

> 87%

### Reason match

``` text
Rejection reason:
No pre-2005 occupation evidence

Evidence:
Historical land-use transition detected
```

### Limitation

> Supplementary evidence; human verification required.

This single artifact should dominate Slide 4.

------------------------------------------------------------------------

# 17. Recommended User Journey for the PPT

Show this as a small 6-step diagram.

``` text
01
DIGITIZE
Legacy FRA document

      ↓

02
IDENTIFY
Claim + rejection reason

      ↓

03
RECONSTRUCT
Historical evidence

      ↓

04
MAP
Current assets + conflicts

      ↓

05
DECIDE
Explainable DSS

      ↓

06
ACT
Dossier / review / scheme convergence
```

------------------------------------------------------------------------

# 18. Data Flow

``` text
                DATA SOURCES
                     │
     ┌───────────────┼────────────────┐
     ↓               ↓                ↓
 Legacy Docs     Satellite          Admin Data
     │               │                │
     ↓               ↓                ↓
   VAANI           KAAL/SEEMA      Structured DB
     │               │                │
     └───────────────┼────────────────┘
                     ↓
                  POSTGIS
                     ↓
                 FRA ATLAS
                     ↓
            ┌────────┴────────┐
            ↓                 ↓
        Claim DSS         Village DSS
            ↓                 ↓
        Dossier          Scheme Priority
```

------------------------------------------------------------------------

# 19. AI Architecture

## Document AI

``` text
Scanned Form
   ↓
OCR
   ↓
NER
   ↓
Structured Claim
   ↓
Rejection Classifier
```

## Historical AI

``` text
Landsat
   ↓
Annual Composite
   ↓
Indices
   ↓
Temporal Segmentation
   ↓
Breakpoint
   ↓
Trajectory
```

## Present-day CV

``` text
Sentinel-2
   ↓
Segmentation
   ↓
Farm / Forest / Water / Homestead
   ↓
PostGIS
```

## Decision layer

``` text
Structured facts
   ↓
Deterministic rules
   ↓
Recommendation
   ↓
Explanation
```

------------------------------------------------------------------------

# 20. Why LandTrendr / CCDC Instead of YOLO

If a judge asks:

> "Why not use YOLO?"

Answer:

> **"The core problem is not object detection. It is temporal change
> detection."**

YOLO can answer:

> What object is visible?

SAAKSHYA needs:

> When did the land-use trajectory change?

Therefore:

``` text
Temporal problem
      ↓
Temporal segmentation
      ↓
LandTrendr / CCDC
```

The PRD explicitly identifies this distinction and rejects
YOLO-on-Landsat as the wrong tool for the task.
fileciteturn12file1L306-L321

------------------------------------------------------------------------

# 21. Why PostGIS Matters

Do not say:

> "We use PostgreSQL because it is popular."

Say:

> **"FRA implementation is spatial. PostGIS lets us treat boundaries and
> overlaps as computable topology rather than just map graphics."**

Examples:

``` text
Claim ↔ Claim overlap
Claim ↔ Forest boundary
Claim ↔ Village
Asset ↔ Claim
Asset ↔ Infrastructure
```

The current requirements explicitly use spatial intersection/area
operations for conflict detection. fileciteturn12file1L217-L221

------------------------------------------------------------------------

# 22. Why WebGIS Matters

The map is not decoration.

It is the **shared operating surface** for:

-   claims
-   evidence
-   conflicts
-   assets
-   village status
-   development priorities

The Atlas therefore becomes:

> **the interface between evidence and decision-making.**

------------------------------------------------------------------------

# 23. Why the Gram Sabha View Is Important

The PS's direct users include government/departmental stakeholders.

SAAKSHYA adds a second perspective:

> Gram Sabha / FRA facilitator.

This is a differentiator because the evidence generated by the system
must eventually be understandable to the people whose claim is being
reviewed.

The PRD explicitly treats officer and Gram Sabha views as peer
interfaces. fileciteturn12file1L174-L185

------------------------------------------------------------------------

# 24. Privacy and Dual-Use Story

This can become a surprisingly strong judge point.

Spatial data can help communities.

The same data can also create risk if exposed irresponsibly.

Therefore:

``` text
PUBLIC
Village-level aggregates

       ↓

ROLE-GATED
Parcel-level evidence

       ↓

CONSENT-GATED
Sensitive claimant information
```

Do not expose "absence of evidence" as a negative public label.

The current PRD explicitly treats this as a safety requirement.
fileciteturn12file1L325-L330

------------------------------------------------------------------------

# 25. What SAAKSHYA Does NOT Claim

This should be internally memorized by every team member.

## It does NOT:

-   decide whether someone legally owns forest land
-   replace Gram Sabha
-   replace government verification
-   prove the complete OTFD historical requirement
-   automatically approve claims
-   automatically reject claims
-   treat satellite imagery as decisive
-   replace documentary evidence
-   replace field verification

## It DOES:

-   organize evidence
-   reconstruct historical spatial patterns
-   identify present-day assets
-   surface spatial conflicts
-   classify rejection reasons
-   map evidence to rejection reasons
-   provide explainable recommendations
-   generate review-ready dossiers

------------------------------------------------------------------------

# 26. Suggested Judge Q&A

## Q1. "Why is this different from a GIS dashboard?"

**Answer:**

> "A dashboard visualizes records. SAAKSHYA creates an evidence chain. A
> rejected claim can be connected to its rejection reason, historical
> satellite evidence, confidence, present spatial context and a
> review-ready dossier."

------------------------------------------------------------------------

## Q2. "Can satellite imagery prove the claim?"

**Answer:**

> "No. We intentionally do not make that claim. We use satellite data as
> corroborating evidence for historical spatial continuity, with
> confidence and limitations, and leave adjudication to the appropriate
> human process."

------------------------------------------------------------------------

## Q3. "What about OTFD?"

**Answer:**

> "The available satellite archive cannot establish the complete longer
> historical requirement. For OTFD, SAAKSHYA strengthens continuity
> evidence but does not claim to prove the full eligibility test."

------------------------------------------------------------------------

## Q4. "What happens if the AI is wrong?"

**Answer:**

> "Every output carries confidence and evidence provenance.
> Low-confidence results are flagged for verification, and the system
> supports human override. We also use negative controls so stable
> forest should not produce a fabricated change."

------------------------------------------------------------------------

## Q5. "Why is this AI and not just GIS?"

**Answer:**

> "There are multiple AI components: OCR/NER for legacy records,
> temporal satellite change detection for historical evidence,
> segmentation for current assets, and AI-assisted classification. GIS
> is the spatial integration layer."

------------------------------------------------------------------------

## Q6. "Why use AI for scheme recommendation?"

**Answer:**

> "Eligibility is rule-driven, not hallucination-driven. Scheme criteria
> are encoded as configurable rules. AI can explain the result, but the
> underlying eligibility logic remains deterministic and auditable."

------------------------------------------------------------------------

## Q7. "Can this scale?"

**Answer:**

> "We build one district end-to-end first. GEE handles archive-scale
> processing, PostGIS handles spatial data, and the map uses tiled
> geospatial formats. The architecture then scales to the four target
> states without redesigning the core pipeline."

------------------------------------------------------------------------

## Q8. "Where will you get the rejected claim data?"

**Answer:**

> "That is one of our implementation risks. The internal prototype uses
> digitized/curated or synthetic claim geometry where official
> parcel-level data is unavailable, while the architecture accepts
> official datasets when provided. We do not pretend that bulk
> rejection-order data is already guaranteed."

This is consistent with the PRD's explicit input-data caveat.
fileciteturn12file1L301-L302

------------------------------------------------------------------------

# 27. What NOT to Put on the PPT

## Avoid

### Too many Sanskrit module names

A judge should understand the system without memorizing KAAL, SEEMA,
VAANI, NYAYA and SETU.

### Giant architecture diagrams

Architecture should support the story, not become the story.

### Generic AI icons

Do not use:

> brain + satellite + chatbot

Use real data flow.

### Long legal paragraphs

Use one-line limitations.

### Fake metrics

Never show target values as achieved.

### Unverified legal claims

Especially around court judgments.

### "100% accurate"

Never.

### "Real-time"

Only if the underlying data is genuinely real-time.

### "Nationwide"

Not for the MVP.

------------------------------------------------------------------------

# 28. Slide Design System

The current PPT pack recommends a dark forest-green/near-black visual
system with one warm accent and one original graphic per slide.
fileciteturn12file0L91-L96

## Recommended visual language

### Background

Near-black / deep forest.

### Primary

Forest green.

### Accent

Amber/saffron for:

> evidence found / transition / recommendation.

### Evidence

Use a subtle glow.

### Uncertainty

Use neutral gradients rather than "green = good, red = bad" legal
semantics.

------------------------------------------------------------------------

# 29. Typography Hierarchy

Every slide:

``` text
TITLE
↓
ONE BIG MESSAGE
↓
VISUAL
↓
2–4 supporting labels
```

Avoid:

``` text
TITLE
↓
paragraph
↓
paragraph
↓
paragraph
```

The current format rules explicitly prohibit paragraph-heavy slides.
fileciteturn12file0L10-L16

------------------------------------------------------------------------

# 30. Numbers That Can Be Powerful

Only use numbers that are source-verified.

Current source pack identifies:

-   ≈47,901 community rejected claims
-   22 lakh FRA patta holders as the DAJGUA target figure
-   ±3 year dating target
-   ≥80% rejection-reason target
-   1972 archive starting point

The PPT pack explicitly recommends big-number treatment for these
values. fileciteturn12file0L91-L96

## But:

Every number must trace to the Claims Ledger.

The source documents explicitly require this.
fileciteturn12file0L14-L16

------------------------------------------------------------------------

# 31. The "Evidence Dossier" Narrative

This should be the emotional + technical center.

### Before SAAKSHYA

``` text
Rejected claim
     ↓
“Insufficient historical evidence”
     ↓
Fragmented records
     ↓
Difficult review
```

### With SAAKSHYA

``` text
Rejected claim
     ↓
Rejection reason identified
     ↓
Historical archive searched
     ↓
Temporal change reconstructed
     ↓
Confidence calculated
     ↓
Current spatial context added
     ↓
Evidence dossier generated
     ↓
Human review
```

This is much more compelling than:

> "We built an AI platform."

------------------------------------------------------------------------

# 32. The Full Product Story

## Chapter 1 --- Understand

Digitize legacy records.

## Chapter 2 --- Reconstruct

Use historical satellite archives.

## Chapter 3 --- Visualize

Put everything on the FRA Atlas.

## Chapter 4 --- Contextualize

Map present-day assets and infrastructure.

## Chapter 5 --- Decide

Use explainable rules for review and development planning.

## Chapter 6 --- Act

Generate evidence/review dossiers and scheme-convergence
recommendations.

------------------------------------------------------------------------

# 33. The "Past → Present → Future" Model

This is the best conceptual model for the whole project.

``` text
              SAAKSHYA

PAST                 PRESENT              ACTION
────                 ───────              ──────
Records              Assets               DSS
Satellite            FRA status           Schemes
Evidence             Conflicts             Priorities
History              Gaps                 Review

        ↓                 ↓                  ↓

      WHAT HAPPENED → WHAT EXISTS → WHAT NEXT
```

Use this as the product's mental model.

------------------------------------------------------------------------

# 34. Build Priority After PPT Submission

If selected, build in this order.

## Phase 1 --- Evidence spike

-   Lock district
-   Verify imagery coverage
-   Generate one real dossier
-   Validate temporal workflow

## Phase 2 --- WebGIS

-   Claim layers
-   Village layers
-   Historical evidence
-   Asset layers
-   Conflict layers

## Phase 3 --- Document intelligence

-   OCR
-   NER
-   Rejection classifier

## Phase 4 --- DSS

-   Rejection/evidence mapping
-   Scheme rules
-   Explainable recommendation

## Phase 5 --- Integration

``` text
Claim
 ↓
Dossier
 ↓
Atlas
 ↓
DSS
```

## Phase 6 --- Scale

One district → state → four states.

------------------------------------------------------------------------

# 35. Current MVP Acceptance Criteria

The source PRD defines:

### AC1

Claim polygon → dossier with:

-   dated finding
-   confidence + drivers
-   decade evidence strip
-   rejection-reason match
-   appeal forum + deadline

### AC2

Continuous dense forest → no fabricated conversion.

### AC3

Overlapping polygons → PostGIS conflict detection.

### AC4

Rejection reason classification → ≥80% target.

### AC5

Every deck number traces to the evidence ledger.

These acceptance criteria are already defined in the PRD and should
remain the technical backbone. fileciteturn12file1L358-L363

------------------------------------------------------------------------

# 36. What Must Be Actually Real Before the PPT

If you can only build three things before submission:

## 1. One real evidence dossier

Highest priority.

## 2. One high-fidelity FRA Atlas mockup

Second priority.

## 3. One DSS screen

Third priority.

Everything else can be communicated through architecture.

------------------------------------------------------------------------

# 37. Internal Team Responsibilities for the PPT

The current team brief assigns:

-   MVP/tech → KAAL + dossier
-   GIS/remote sensing → GEE + historical imagery
-   ML/CV → segmentation + NER
-   Full-stack → Atlas
-   Design → six-slide deck
-   Research/legal → claims ledger + legal verification

These roles are already defined in the source team brief.
fileciteturn11file8L379-L389

## Recommended coordination

### MVP lead

Owns the final story.

### GIS

Must provide the historical visual evidence.

### ML

Must provide validation logic.

### Full-stack

Must make Atlas screenshots.

### Design

Must make all six slides visually coherent.

### Research

Must approve every legal/statistical claim.

------------------------------------------------------------------------

# 38. Final Pre-PPT Checklist

## Story

-   [ ] Judge understands problem in 20 seconds.
-   [ ] Judge understands differentiator in 40 seconds.
-   [ ] Judge understands technical method in 60 seconds.
-   [ ] Judge understands impact in 90 seconds.

## PS compliance

-   [ ] Digitization visible.
-   [ ] Satellite asset mapping visible.
-   [ ] FRA Atlas visible.
-   [ ] DSS visible.

## Innovation

-   [ ] Historical evidence recovery clearly visible.
-   [ ] Rejected/disputed claims clearly visible.
-   [ ] Gram Sabha workflow visible.

## Technical credibility

-   [ ] Real dossier.
-   [ ] Historical timeline.
-   [ ] Temporal model.
-   [ ] Confidence.
-   [ ] Validation target.

## Safety

-   [ ] No "AI proves rights."
-   [ ] No legal adjudication claim.
-   [ ] OTFD limitation visible.
-   [ ] Human review visible.
-   [ ] Privacy visible.

## Blind submission

-   [ ] Maximum 6 slides.
-   [ ] No team/college/member identifiers.
-   [ ] PDF only.
-   [ ] Metadata scrubbed.
-   [ ] Every statistic sourced.
-   [ ] No paragraph-heavy slide.

The source PPT pack explicitly lists these blind-mode requirements.
fileciteturn12file0L98-L106

------------------------------------------------------------------------

# 39. Final Recommended PPT Text --- Condensed Version

## Slide 1

### SAAKSHYA

**AI-powered FRA Evidence-to-Action Intelligence Platform**

> **From rejected claims to evidence. From village data to action.**

PS 25108

------------------------------------------------------------------------

## Slide 2

### THE GAP

**FRA data is fragmented. Historical evidence is hard to reconstruct.
Spatial assets and scheme planning remain disconnected.**

``` text
LEGACY RECORDS
      +
HISTORICAL EVIDENCE
      +
CURRENT ASSETS
      +
SCHEME DATA
      ↓
     ????
```

### SAAKSHYA fills the gap.

------------------------------------------------------------------------

## Slide 3

### THE DIFFERENCE

``` text
Existing approach
GRANTED → DELIVERY

SAAKSHYA
REJECTED → EVIDENCE → REVIEW
```

Then:

``` text
VAANI → KAAL → SEEMA → ATLAS → NYAYA/SETU
```

------------------------------------------------------------------------

## Slide 4

### THE EVIDENCE ENGINE

``` text
Landsat
 ↓
Indices
 ↓
Temporal segmentation
 ↓
Breakpoint
 ↓
Trajectory
 ↓
Confidence
 ↓
Dossier
```

### Output

> **"Historical transition detected around 1993 --- confidence 87%."**

Then:

> **Corroborating evidence. Human review required.**

------------------------------------------------------------------------

## Slide 5

### FROM EVIDENCE TO ACTION

``` text
FRA ATLAS

Claims
Assets
Conflicts
Evidence
```

↓

``` text
DSS

Why was it rejected?
What evidence exists?
What is missing?
What intervention should be prioritized?
Which schemes can converge?
```

------------------------------------------------------------------------

## Slide 6

### BUILDABLE. AUDITABLE. SCALABLE.

``` text
GEE + Landsat
PyTorch + Sentinel-2
PostGIS
FastAPI
React + MapLibre
OCR/NER
Rule-based DSS
```

``` text
1 District
    ↓
1 State
    ↓
4 States
```

### Validation

> ±3 yr dating target · ≥80% NER target · per-class IoU · claim →
> dossier

### Trust

> **Confidence + provenance + human review**

------------------------------------------------------------------------

# 40. Final Judge-Level Positioning

If asked:

> **"What exactly is SAAKSHYA?"**

The best answer is:

> **"SAAKSHYA is an Evidence-to-Action platform for FRA implementation.
> It digitizes legacy records, reconstructs historical spatial evidence
> for disputed or rejected claims, maps present-day assets through
> satellite AI, brings everything into a WebGIS FRA Atlas, and uses
> explainable DSS rules to support claim review and targeted scheme
> convergence. It does not adjudicate rights; it makes the evidence and
> decision process more structured, auditable and actionable."**

------------------------------------------------------------------------

# 41. Final Strategic Verdict

## The project should be judged on four layers

### Layer 1 --- Problem relevance

**Very strong**

Directly connected to PS 25108.

### Layer 2 --- Differentiation

**Strongest component**

Rejected/disputed claim evidence recovery is the memorable wedge.

### Layer 3 --- Technical credibility

**Strong if the dossier is real**

Historical temporal analysis is much more convincing when accompanied by
an actual output.

### Layer 4 --- Scope risk

**Main weakness**

Too many modules can make the project look larger than a six-person team
can realistically deliver.

### Solution

Use:

> **One district + one vertical slice + four PS pillars.**

------------------------------------------------------------------------

# 42. The Final One-Sentence Story

> **SAAKSHYA connects the past, present and next action of FRA
> implementation --- reconstructing historical evidence for disputed
> claims, mapping today's village assets through satellite AI, and
> turning that evidence into an explainable WebGIS and development
> decision-support workflow.**

------------------------------------------------------------------------

# 43. Golden Rule for the Team

Every team member should remember this:

> **We are not building an AI that decides forest rights.**
>
> **We are building an intelligence layer that makes FRA evidence
> discoverable, spatially understandable, auditable and actionable.**

And the memorable hook remains:

> **"When a claim is rejected because the evidence is hard to
> reconstruct, SAAKSHYA reconstructs the evidence --- and connects it to
> the larger FRA decision system."**
