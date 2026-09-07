<!-- AUDIT PASS — added 2 September 2026 -->

> # ⚠ Audit notes — read this first
>
> This document was audited claim by claim on **2 September 2026**. Annotations are inserted inline as blockquotes tagged `[AUDIT · V]`, `[AUDIT · S]`, `[AUDIT · U]`, or `[AUDIT · gap]`. Nothing in the original text was deleted or reworded — the untouched copy is at `PS26167_SatQuery_AI_Deep_Analysis_ULTRA_DETAILED.original.md`.
>
> **Verification legend**
>
> | Tag | Meaning |
> |---|---|
> | **V — Verified** | Checked against a primary or authoritative source and found accurate as stated. |
> | **S — Supported** | Substantially right, but imprecise, internally inconsistent, or confirmed only indirectly. |
> | **U — Unverified** | No supporting source found, or contradicted by one. Do not repeat to a judge. |
> | **gap** | Not a truth claim — something load-bearing that the document omits. |
>
> ## Claims register
>
> | # | Claim | Where | Verdict |
> |---|---|---|---|
> | 1 | BigEarthNet.txt: 464,044 co-registered S1/S2 images, ~9.6M S1-S2-text triplets, 15 tasks / 4 categories | §1, §3.1, Point 25 | **V** |
> | 2 | The 9.6M figure counts triplets, not images | §3.1 | **V** — and the sharpest observation in the document |
> | 3 | VRSBench: 29,614 images / 29,614 captions / 52,472 object refs / 123,221 VQA pairs | §1, §3.2 | **V** |
> | 4 | RSVQA-LR: 772 images, 77,232 QA pairs | Point 29 | **V** — but it is 9 Sentinel-2 tiles over the **Netherlands**, unstated |
> | 5 | CDVQA: 2,968 image pairs, >122k QA pairs | Point 30, §3.4 | **V** — but it is **aerial RGB** from SECOND with **6 classes**, unstated |
> | 6 | PS mandates RS adaptation; names BigEarthNet.txt, VRSBench, RSVQA, CDVQA; hidden eval on Cartosat-2S + RISAT | §0, §1, §4 | **V** against sih.gov.in |
> | 7 | SIH1738 titled "Innovative applications of cloud-optimized geotiffs for INSAT satellite data" | §7.1, Point 84 | **V** |
> | 8 | The lesson drawn from PS1738 | §7.1 | **U** — inferred from a title; no winning solution examined |
> | 9 | "The winning Vistaar/Cloudweave story" for PS1738 | Point 84 | **U — contradicted.** CloudWeave (MIT-WPU) worked **SIH1736**, a different PS. No source for "Vistaar" |
> | 10 | "Chandrakriti-style lesson" from the lunar PSR problem | §7.2 | **U** — the PS is real (**SIH1732**); the named project and its attributed lesson are unsourced |
> | 11 | "94/94 analytical points preserved and individually expanded" | header, Completeness Verification | **U — false.** 39 of 94 expanded; 188 sections are 3 boilerplate paragraphs |
> | 12 | Every URL in §16 | §16 | **V** — all nine checked, all HTTP 200 |
>
> ## Defects to fix before this text goes anywhere
>
> 1. **Six `citeturn…` artifacts** — ChatGPT search-citation tokens left in the text (§1, §3.1 ×2, §7.1, Point 84 ×2). Replace with real links.
> 2. **Two false precedent claims** — the CloudWeave/PS1738 conflation and "Chandrakriti". Both are the kind of thing a judge who knows the space will catch.
> 3. **The completeness claim** — do not ship a document that overstates its own coverage by 2.4×.
> 4. **Hinglish in three points** (22, 25, 27) in an otherwise formal English document.
>
> ## What the document gets right, and should keep
>
> Dataset figures are accurate and the triplets-vs-images catch shows genuine literacy. The core architectural instincts are correct and are what most teams get wrong: a **constrained tool registry** rather than free-form agent calling; a **normalised evidence schema** carrying CRS on spatial evidence; the **A→E ablation** as empirical justification for each architectural layer; and the explicit refusal to fabricate benchmark numbers in §10. The strategic framing in §13 is the right pitch.
>
> ## The one thing that decides this problem statement
>
> Every named adaptation and benchmark source is non-Indian and mostly 10 m or aerial: BigEarthNet (Europe, Sentinel), RSVQA-LR (Netherlands, Sentinel-2 10 m), CDVQA (SECOND, aerial RGB, 6 classes). The hidden ISRO/SAC evaluation is **sub-metre Cartosat-2S optical paired with RISAT SAR over India**. §4 calls this "distribution robustness"; it is a two-orders-of-magnitude resolution shift plus a sensor shift plus a geography shift, and it will decide the outcome more than any orchestration choice. See the expanded note at §4.
>
> Also unresolved: **no base model is named anywhere** (§5.1 is placeholders), and **no compute budget exists** (Point 78). Both block scheduling §8.

---

# PS26167 — SatQuery AI
## Deep-Dive Master Engineering & SIH Winning Strategy Document

> **This is the expanded version.**
>
> The objective here is not to give a short summary. Every one of the **94 previously identified analytical points is expanded individually** with: what it means, how to implement it, what can go wrong, what the judge should see, and how it contributes to a winning solution.

> **[AUDIT · U — Unverified / contradicted]** This claim is false as written. Counting the document's own headings: `### Minimum acceptance test` appears **94 times with exactly 1 distinct body**, and `### What the judge should see` appears **94 times with 2 distinct bodies**. Only **39** of the 94 points carry the full eight-subsection treatment (`What this point means`, `Implementation interpretation`, `Why it matters for SIH`, `Common failure mode`, `How it connects to SatQuery`, `Original interpretation`). The remaining 55 are a short body plus two verbatim boilerplate paragraphs. 188 sections carry no point-specific information. See the closing `Completeness Verification` block, which repeats the claim.
>
> **Important:** the 94 points below are an analytical decomposition of PS26167, not a claim that the official PS itself contains exactly 94 numbered bullets.

---

# 0. Executive Understanding — Before We Build Anything

PS26167 is fundamentally a **multimodal remote-sensing reasoning and orchestration problem**.

The problem statement gives us four different input situations:

1. **Single image** — optical/multispectral or SAR.
2. **Cross-modal pair** — co-registered optical/multispectral + SAR.
3. **Bi-temporal pair** — same geographic area at two different times.
4. **Natural-language query** — the user should not need to manually select a model.

And it gives us several mandatory capabilities:

- remote-sensing adaptation;
- single-image VQA;
- one additional single-image capability: captioning/scene description OR grounding;
- multitemporal change analysis;
- optical-SAR joint analysis;
- agentic selection/execution of specialist tools;
- evidence-grounded output;
- confidence and auditable execution summary;
- interactive GUI/web application.

The official PS data supplied for this project explicitly says that a generic LLM/VLM without remote-sensing adaptation is insufficient, that BigEarthNet.txt is the primary adaptation dataset, that VRSBench and RSVQA are used for single-image evaluation, and that CDVQA is used for multitemporal change VQA. The final ISRO/SAC evaluation uses pre-georeferenced, co-registered Cartosat-2S optical and RISAT SAR pairs with undisclosed annotations.

> **[AUDIT · V — Verified]** Checked line by line against the official statement text on <https://www.sih.gov.in/sih2026PS> (PS SIH26167, ISRO, Software, Space Technology). The PS does state all of: a generic LLM/VLM without remote-sensing adaptation will not satisfy the requirements; BigEarthNet.txt is the primary adaptation dataset; VRSBench and RSVQA evaluate single-image captioning/grounding/VQA; CDVQA evaluates multitemporal change VQA; and the ISRO/SAC evaluation set uses pre-georeferenced, co-registered Cartosat-2S optical and RISAT SAR pairs with undisclosed annotations. This paragraph is an accurate restatement.

The biggest strategic insight is:

> **Do not build “an AI chatbot that sees satellite images.” Build “a query-driven remote-sensing analysis system that happens to have a conversational interface.”**

That distinction should drive the architecture, experiments, UI, and pitch.

---

# 1. Official PS Requirement Decomposition

The supplied PS26167 record defines:

- **Category:** Software
- **Organization:** Indian Space Research Organisation (ISRO)
- **Theme:** Space Technology
- **Title:** SatQuery AI — An Interactive Vision-Language Assistant for Multimodal Remote Sensing Image Analysis through Text Queries.

The official scope requires support for:
- single optical/multispectral or SAR image;
- co-registered optical/SAR pair;
- bi-temporal pair;
- GeoTIFF/TIFF;
- benchmark PNG/JPEG where prescribed;
- remote-sensing adaptation;
- VQA;
- one additional single-image task;
- change analysis;
- optical-SAR analysis;
- agentic orchestration;
- GUI/web application;
- visual evidence;
- confidence;
- execution summary;
- downloadable reports.

The public research behind the named datasets confirms that BigEarthNet.txt contains 464,044 co-registered Sentinel-1/Sentinel-2 images and about 9.6 million S1-S2-text triplets, while VRSBench contains 29,614 images, 29,614 human-verified captions, 52,472 object references and 123,221 VQA pairs. citeturn0search1turn0search2

> **[AUDIT · V — Verified]** Every number here checks out against the BigEarthNet.txt project page (<https://txt.bigearth.net/>, paper arXiv:2603.29630) and the VRSBench paper (arXiv:2406.12384, NeurIPS 2024 Datasets & Benchmarks): 464,044 co-registered S1/S2 images, ~9.6M S1-S2-text triplets; VRSBench 29,614 images / 29,614 human-verified captions / 52,472 object references / 123,221 VQA pairs.
>
> **Missing, and it matters:** BigEarthNet.txt ships a **manually verified benchmark split of 1,082 image pairs with 15,029 textual annotations**. That is the realistic evaluation target for a three-week build and it appears nowhere in this document. Access path also missing — the dataset is on Hugging Face as `BIFOLD-BigEarthNetv2-0/BigEarthNet.txt`.
>
> **Formatting defect:** the `citeturn0search1turn0search2` token at the end of this paragraph is a ChatGPT search-citation artifact that survived into the file. It occurs **6 times** in this document. Strip all of them before any of this text goes near a submission PDF.

---

# 2. The Mental Model We Should Use

```text
                   USER
                     │
                     │ Natural-language query
                     ▼
             ┌─────────────────┐
             │ Query Interpreter│
             └────────┬────────┘
                      │
                      ▼
             ┌─────────────────┐
             │ Task Classifier  │
             └────────┬────────┘
                      │
                      ▼
             ┌─────────────────┐
             │ Input Validator  │
             └────────┬────────┘
                      │
                      ▼
             ┌─────────────────┐
             │ Agent / Router   │
             └────────┬────────┘
                      │
       ┌──────────────┼──────────────┐
       ▼              ▼              ▼
     VQA         Grounding       Change
       │              │              │
       └──────────────┼──────────────┘
                      ▼
              Optical + SAR
                  Fusion
                      │
                      ▼
             Evidence Fusion
                      │
             ┌────────┴────────┐
             ▼                 ▼
          Answer           Visual Evidence
             │                 │
             └────────┬────────┘
                      ▼
                Web Application
```

The LLM is **not** the whole system.

The LLM is one component inside a controlled pipeline.

---


## Point 01 — Problem Statement & Objective + Satellite Imagery Basics


### What this point means
This point should be understood as an engineering requirement, not merely a feature label. In SatQuery, it must have a clear input contract, a deterministic or measurable output, and a place in the end-to-end workflow.

### Implementation interpretation
Define the component as a small module with:
- explicit inputs;
- explicit outputs;
- validation rules;
- model/tool version;
- metrics;
- failure behaviour.

The component should be independently testable before it is connected to the agent.

### Why it matters for SIH
A judge should be able to see the feature working and, ideally, see a quantitative or visual proof of correctness. Features without evidence should not dominate the presentation.

### Common failure mode
Do not implement this as a black-box prompt. Keep domain-specific processing and measurable outputs outside the final language-generation layer.

### How it connects to SatQuery
The output should become structured evidence that can be consumed by the agent/evidence-fusion layer and visualized in the GUI.

### Original interpretation
Zero se samjho: PS26167 ka goal ek generic image chatbot banana nahi, balki remote-sensing imagery ke liye natural-language, evidence-grounded, agentic analysis system banana hai. User query deta hai, system input validity check karta hai, task identify karta hai, specialist model/tool choose karta hai, result validate karta hai, aur answer ke saath visual evidence deta hai.

---

Satellite imagery normal RGB photo se different hoti hai. Sensor, spectral bands, acquisition time, ground sampling distance, projection/CRS aur metadata analysis ko affect karte hain. Isliye system ko pixels ke saath geospatial context bhi preserve karna hoga.


### Minimum acceptance test
Create at least one automated or manual test for this point. The test should specify the input, expected behaviour, observed output, and pass/fail result. If the point is model-related, record the metric; if it is UI-related, record the interaction; if it is geospatial, test coordinate/raster correctness.

### What the judge should see
The final demo should expose the consequence of this component rather than its source code. The judge should see a correct answer, a useful visualization, a meaningful trace, or a quantitative result.


## Point 02 — Why Existing Remote-Sensing AI is Fragmented + The User Problem


### What this point means
This point should be understood as an engineering requirement, not merely a feature label. In SatQuery, it must have a clear input contract, a deterministic or measurable output, and a place in the end-to-end workflow.

### Implementation interpretation
Define the component as a small module with:
- explicit inputs;
- explicit outputs;
- validation rules;
- model/tool version;
- metrics;
- failure behaviour.

The component should be independently testable before it is connected to the agent.

### Why it matters for SIH
A judge should be able to see the feature working and, ideally, see a quantitative or visual proof of correctness. Features without evidence should not dominate the presentation.

### Common failure mode
Do not implement this as a black-box prompt. Keep domain-specific processing and measurable outputs outside the final language-generation layer.

### How it connects to SatQuery
The output should become structured evidence that can be consumed by the agent/evidence-fusion layer and visualized in the GUI.

### Original interpretation
Existing systems often ek task par focused hote hain: classification, detection, segmentation, VQA ya change detection. User ko manually decide karna padta hai ki kaunsa model/tool use kare. SatQuery ka central value proposition is fragmentation ko hide karna hai.

---

Non-expert user ko GIS software, sensor characteristics, preprocessing aur model parameters nahi pata hote. SatQuery ka UX is complexity ko natural-language interface ke peeche absorb karega.


### Minimum acceptance test
Create at least one automated or manual test for this point. The test should specify the input, expected behaviour, observed output, and pass/fail result. If the point is model-related, record the metric; if it is UI-related, record the interaction; if it is geospatial, test coordinate/raster correctness.

### What the judge should see
The final demo should expose the consequence of this component rather than its source code. The judge should see a correct answer, a useful visualization, a meaningful trace, or a quantitative result.


## Point 03 — The Core System Question


### What this point means
This point should be understood as an engineering requirement, not merely a feature label. In SatQuery, it must have a clear input contract, a deterministic or measurable output, and a place in the end-to-end workflow.

### Implementation interpretation
Define the component as a small module with:
- explicit inputs;
- explicit outputs;
- validation rules;
- model/tool version;
- metrics;
- failure behaviour.

The component should be independently testable before it is connected to the agent.

### Why it matters for SIH
A judge should be able to see the feature working and, ideally, see a quantitative or visual proof of correctness. Features without evidence should not dominate the presentation.

### Common failure mode
Do not implement this as a black-box prompt. Keep domain-specific processing and measurable outputs outside the final language-generation layer.

### How it connects to SatQuery
The output should become structured evidence that can be consumed by the agent/evidence-fusion layer and visualized in the GUI.

### Original interpretation
System ko sirf answer nahi dena; usse ye bhi decide karna hai ki question kis type ka hai, kaunsi imagery available hai, kaunsa specialist model useful hai aur answer ko spatial evidence se kaise validate karna hai.


### Minimum acceptance test
Create at least one automated or manual test for this point. The test should specify the input, expected behaviour, observed output, and pass/fail result. If the point is model-related, record the metric; if it is UI-related, record the interaction; if it is geospatial, test coordinate/raster correctness.

### What the judge should see
The final demo should expose the consequence of this component rather than its source code. The judge should see a correct answer, a useful visualization, a meaningful trace, or a quantitative result.


## Point 04 — Why Generic GPT/VLM is Insufficient


### What this point means
This point should be understood as an engineering requirement, not merely a feature label. In SatQuery, it must have a clear input contract, a deterministic or measurable output, and a place in the end-to-end workflow.

### Implementation interpretation
Define the component as a small module with:
- explicit inputs;
- explicit outputs;
- validation rules;
- model/tool version;
- metrics;
- failure behaviour.

The component should be independently testable before it is connected to the agent.

### Why it matters for SIH
A judge should be able to see the feature working and, ideally, see a quantitative or visual proof of correctness. Features without evidence should not dominate the presentation.

### Common failure mode
Do not implement this as a black-box prompt. Keep domain-specific processing and measurable outputs outside the final language-generation layer.

### How it connects to SatQuery
The output should become structured evidence that can be consumed by the agent/evidence-fusion layer and visualized in the GUI.

### Original interpretation
General VLMs natural images par strong ho sakte hain, lekin remote sensing terminology, SAR characteristics, multimodal registration, temporal reasoning aur geospatial grounding domain-specific adaptation maangte hain. PS explicitly remote-sensing adaptation require karta hai.


### Minimum acceptance test
Create at least one automated or manual test for this point. The test should specify the input, expected behaviour, observed output, and pass/fail result. If the point is model-related, record the metric; if it is UI-related, record the interaction; if it is geospatial, test coordinate/raster correctness.

### What the judge should see
The final demo should expose the consequence of this component rather than its source code. The judge should see a correct answer, a useful visualization, a meaningful trace, or a quantitative result.


## Point 05 — Mandatory Input: Single Image + Mandatory Capability: VQA


### What this point means
This point should be understood as an engineering requirement, not merely a feature label. In SatQuery, it must have a clear input contract, a deterministic or measurable output, and a place in the end-to-end workflow.

### Implementation interpretation
Define the component as a small module with:
- explicit inputs;
- explicit outputs;
- validation rules;
- model/tool version;
- metrics;
- failure behaviour.

The component should be independently testable before it is connected to the agent.

### Why it matters for SIH
A judge should be able to see the feature working and, ideally, see a quantitative or visual proof of correctness. Features without evidence should not dominate the presentation.

### Common failure mode
Do not implement this as a black-box prompt. Keep domain-specific processing and measurable outputs outside the final language-generation layer.

### How it connects to SatQuery
The output should become structured evidence that can be consumed by the agent/evidence-fusion layer and visualized in the GUI.

### Original interpretation
Single optical/multispectral ya single SAR image supported hai. User natural-language query ke through scene understanding, VQA, captioning ya grounding kar sakta hai.

---

Visual Question Answering = image + question -> answer. Example: 'How many buildings are visible?' Output ideally text ke saath confidence aur supporting regions dega.


### Minimum acceptance test
Create at least one automated or manual test for this point. The test should specify the input, expected behaviour, observed output, and pass/fail result. If the point is model-related, record the metric; if it is UI-related, record the interaction; if it is geospatial, test coordinate/raster correctness.

### What the judge should see
The final demo should expose the consequence of this component rather than its source code. The judge should see a correct answer, a useful visualization, a meaningful trace, or a quantitative result.


## Point 06 — Mandatory Capability: Captioning or Grounding + Grounding


### What this point means
This point should be understood as an engineering requirement, not merely a feature label. In SatQuery, it must have a clear input contract, a deterministic or measurable output, and a place in the end-to-end workflow.

### Implementation interpretation
Define the component as a small module with:
- explicit inputs;
- explicit outputs;
- validation rules;
- model/tool version;
- metrics;
- failure behaviour.

The component should be independently testable before it is connected to the agent.

### Why it matters for SIH
A judge should be able to see the feature working and, ideally, see a quantitative or visual proof of correctness. Features without evidence should not dominate the presentation.

### Common failure mode
Do not implement this as a black-box prompt. Keep domain-specific processing and measurable outputs outside the final language-generation layer.

### How it connects to SatQuery
The output should become structured evidence that can be consumed by the agent/evidence-fusion layer and visualized in the GUI.

### Original interpretation
VQA ke alawa minimum ek aur single-image capability required hai. Hum grounding choose karna prefer karenge kyunki 'highlight the water body' jaisa visually verifiable demo judge ko instantly samajh aata hai.

---

Grounding ka matlab text query ko image regions se link karna. Query 'highlight residential buildings' ho to boxes/masks aur confidence return honge.


### Minimum acceptance test
Create at least one automated or manual test for this point. The test should specify the input, expected behaviour, observed output, and pass/fail result. If the point is model-related, record the metric; if it is UI-related, record the interaction; if it is geospatial, test coordinate/raster correctness.

### What the judge should see
The final demo should expose the consequence of this component rather than its source code. The judge should see a correct answer, a useful visualization, a meaningful trace, or a quantitative result.


## Point 07 — Captioning + Bi-Temporal Images


### What this point means
This point should be understood as an engineering requirement, not merely a feature label. In SatQuery, it must have a clear input contract, a deterministic or measurable output, and a place in the end-to-end workflow.

### Implementation interpretation
Define the component as a small module with:
- explicit inputs;
- explicit outputs;
- validation rules;
- model/tool version;
- metrics;
- failure behaviour.

The component should be independently testable before it is connected to the agent.

### Why it matters for SIH
A judge should be able to see the feature working and, ideally, see a quantitative or visual proof of correctness. Features without evidence should not dominate the presentation.

### Common failure mode
Do not implement this as a black-box prompt. Keep domain-specific processing and measurable outputs outside the final language-generation layer.

### How it connects to SatQuery
The output should become structured evidence that can be consumed by the agent/evidence-fusion layer and visualized in the GUI.

### Original interpretation
Captioning image ka structured scene description generate karta hai. Ye useful baseline hai, lekin demo aur evidence ke liye grounding generally stronger hai.

---

Bi-temporal pair = same geographic area ki do images, different dates par captured. Goal 'what is present?' se 'what changed?' tak jaana hai.


### Minimum acceptance test
Create at least one automated or manual test for this point. The test should specify the input, expected behaviour, observed output, and pass/fail result. If the point is model-related, record the metric; if it is UI-related, record the interaction; if it is geospatial, test coordinate/raster correctness.

### What the judge should see
The final demo should expose the consequence of this component rather than its source code. The judge should see a correct answer, a useful visualization, a meaningful trace, or a quantitative result.


## Point 08 — Change Detection + Change VQA


### What this point means
This point should be understood as an engineering requirement, not merely a feature label. In SatQuery, it must have a clear input contract, a deterministic or measurable output, and a place in the end-to-end workflow.

### Implementation interpretation
Define the component as a small module with:
- explicit inputs;
- explicit outputs;
- validation rules;
- model/tool version;
- metrics;
- failure behaviour.

The component should be independently testable before it is connected to the agent.

### Why it matters for SIH
A judge should be able to see the feature working and, ideally, see a quantitative or visual proof of correctness. Features without evidence should not dominate the presentation.

### Common failure mode
Do not implement this as a black-box prompt. Keep domain-specific processing and measurable outputs outside the final language-generation layer.

### How it connects to SatQuery
The output should become structured evidence that can be consumed by the agent/evidence-fusion layer and visualized in the GUI.

### Original interpretation
Change detection sirf changed/not-changed nahi; class of change, location, magnitude aur temporal explanation tak extend ho sakta hai.

---

User query: 'Has the built-up area increased?' System ko image pair analyze karke answer dena hai aur possible ho to change map dena hai.


### Minimum acceptance test
Create at least one automated or manual test for this point. The test should specify the input, expected behaviour, observed output, and pass/fail result. If the point is model-related, record the metric; if it is UI-related, record the interaction; if it is geospatial, test coordinate/raster correctness.

### What the judge should see
The final demo should expose the consequence of this component rather than its source code. The judge should see a correct answer, a useful visualization, a meaningful trace, or a quantitative result.


## Point 09 — Spatial Change Map


### What this point means
This point should be understood as an engineering requirement, not merely a feature label. In SatQuery, it must have a clear input contract, a deterministic or measurable output, and a place in the end-to-end workflow.

### Implementation interpretation
Define the component as a small module with:
- explicit inputs;
- explicit outputs;
- validation rules;
- model/tool version;
- metrics;
- failure behaviour.

The component should be independently testable before it is connected to the agent.

### Why it matters for SIH
A judge should be able to see the feature working and, ideally, see a quantitative or visual proof of correctness. Features without evidence should not dominate the presentation.

### Common failure mode
Do not implement this as a black-box prompt. Keep domain-specific processing and measurable outputs outside the final language-generation layer.

### How it connects to SatQuery
The output should become structured evidence that can be consumed by the agent/evidence-fusion layer and visualized in the GUI.

### Original interpretation
Reference masks available hone par system pixel/region-level change map produce kar sakta hai. Ye explainability aur evaluation dono ke liye valuable hai.


### Minimum acceptance test
Create at least one automated or manual test for this point. The test should specify the input, expected behaviour, observed output, and pass/fail result. If the point is model-related, record the metric; if it is UI-related, record the interaction; if it is geospatial, test coordinate/raster correctness.

### What the judge should see
The final demo should expose the consequence of this component rather than its source code. The judge should see a correct answer, a useful visualization, a meaningful trace, or a quantitative result.


## Point 10 — Optical Imagery + SAR Basics


### What this point means
This point should be understood as an engineering requirement, not merely a feature label. In SatQuery, it must have a clear input contract, a deterministic or measurable output, and a place in the end-to-end workflow.

### Implementation interpretation
Define the component as a small module with:
- explicit inputs;
- explicit outputs;
- validation rules;
- model/tool version;
- metrics;
- failure behaviour.

The component should be independently testable before it is connected to the agent.

### Why it matters for SIH
A judge should be able to see the feature working and, ideally, see a quantitative or visual proof of correctness. Features without evidence should not dominate the presentation.

### Common failure mode
Do not implement this as a black-box prompt. Keep domain-specific processing and measurable outputs outside the final language-generation layer.

### How it connects to SatQuery
The output should become structured evidence that can be consumed by the agent/evidence-fusion layer and visualized in the GUI.

### Original interpretation
Optical/multispectral imagery spectral and contextual information deti hai. Vegetation, water, built-up areas aur land-cover classes ke signatures useful ho sakte hain.

---

SAR active radar sensing use karta hai aur structural/backscatter information provide karta hai. Optical se complementary information mil sakti hai aur SAR day/night/cloud conditions mein useful hai.


### Minimum acceptance test
Create at least one automated or manual test for this point. The test should specify the input, expected behaviour, observed output, and pass/fail result. If the point is model-related, record the metric; if it is UI-related, record the interaction; if it is geospatial, test coordinate/raster correctness.

### What the judge should see
The final demo should expose the consequence of this component rather than its source code. The judge should see a correct answer, a useful visualization, a meaningful trace, or a quantitative result.


## Point 11 — Optical-SAR Pair


### The core multimodal challenge
The pair is useful only if the two images correspond spatially. The system therefore needs a pairing object containing two assets plus registration metadata and quality status.

### Fusion strategies
Three practical levels:
1. **Late fusion:** independent models produce structured evidence and a fusion layer combines results.
2. **Feature fusion:** encoders produce embeddings that are combined before a prediction head.
3. **Cross-attention fusion:** a multimodal model learns interactions between optical and SAR features.

For an SIH prototype, late fusion is the safest starting point because it is easier to debug and explain.


### Minimum acceptance test
Create at least one automated or manual test for this point. The test should specify the input, expected behaviour, observed output, and pass/fail result. If the point is model-related, record the metric; if it is UI-related, record the interaction; if it is geospatial, test coordinate/raster correctness.

### What the judge should see
The final demo should expose the consequence of this component rather than its source code. The judge should see a correct answer, a useful visualization, a meaningful trace, or a quantitative result.


## Point 12 — Co-registration


### Why registration is critical
If a building is at pixel `(x,y)` in optical but shifted in SAR, naive feature fusion may compare unrelated regions.

### Validation
Use metadata and image-based checks where possible. At minimum compute a registration-quality flag and prevent cross-modal inference when alignment is clearly invalid.

### Evidence
Show the two images with synchronized pan/zoom and an overlay option. That makes registration quality visible to judges.


### Minimum acceptance test
Create at least one automated or manual test for this point. The test should specify the input, expected behaviour, observed output, and pass/fail result. If the point is model-related, record the metric; if it is UI-related, record the interaction; if it is geospatial, test coordinate/raster correctness.

### What the judge should see
The final demo should expose the consequence of this component rather than its source code. The judge should see a correct answer, a useful visualization, a meaningful trace, or a quantitative result.


## Point 13 — Why Multimodal Reasoning Matters


### What this point means
This point should be understood as an engineering requirement, not merely a feature label. In SatQuery, it must have a clear input contract, a deterministic or measurable output, and a place in the end-to-end workflow.

### Implementation interpretation
Define the component as a small module with:
- explicit inputs;
- explicit outputs;
- validation rules;
- model/tool version;
- metrics;
- failure behaviour.

The component should be independently testable before it is connected to the agent.

### Why it matters for SIH
A judge should be able to see the feature working and, ideally, see a quantitative or visual proof of correctness. Features without evidence should not dominate the presentation.

### Common failure mode
Do not implement this as a black-box prompt. Keep domain-specific processing and measurable outputs outside the final language-generation layer.

### How it connects to SatQuery
The output should become structured evidence that can be consumed by the agent/evidence-fusion layer and visualized in the GUI.

### Original interpretation
Ek sensor mein ambiguity ho sakti hai. Optical scene semantics aur SAR structural response ko combine karke more robust interpretation mil sakti hai.


### Minimum acceptance test
Create at least one automated or manual test for this point. The test should specify the input, expected behaviour, observed output, and pass/fail result. If the point is model-related, record the metric; if it is UI-related, record the interaction; if it is geospatial, test coordinate/raster correctness.

### What the judge should see
The final demo should expose the consequence of this component rather than its source code. The judge should see a correct answer, a useful visualization, a meaningful trace, or a quantitative result.


## Point 14 — Agentic Architecture + Query Interpreter


### What this point means
This point should be understood as an engineering requirement, not merely a feature label. In SatQuery, it must have a clear input contract, a deterministic or measurable output, and a place in the end-to-end workflow.

### Implementation interpretation
Define the component as a small module with:
- explicit inputs;
- explicit outputs;
- validation rules;
- model/tool version;
- metrics;
- failure behaviour.

The component should be independently testable before it is connected to the agent.

### Why it matters for SIH
A judge should be able to see the feature working and, ideally, see a quantitative or visual proof of correctness. Features without evidence should not dominate the presentation.

### Common failure mode
Do not implement this as a black-box prompt. Keep domain-specific processing and measurable outputs outside the final language-generation layer.

### How it connects to SatQuery
The output should become structured evidence that can be consumed by the agent/evidence-fusion layer and visualized in the GUI.

### Original interpretation
SatQuery ka main innovation agentic, query-driven orchestration hai. Ek giant model sab kuch karne ke bajay controller specialist tools choose karega.

---

First stage user ke natural-language question ko structured task representation mein convert karega.


### Minimum acceptance test
Create at least one automated or manual test for this point. The test should specify the input, expected behaviour, observed output, and pass/fail result. If the point is model-related, record the metric; if it is UI-related, record the interaction; if it is geospatial, test coordinate/raster correctness.

### What the judge should see
The final demo should expose the consequence of this component rather than its source code. The judge should see a correct answer, a useful visualization, a meaningful trace, or a quantitative result.


## Point 15 — Task Classifier + Input Compatibility Checker


### What this point means
This point should be understood as an engineering requirement, not merely a feature label. In SatQuery, it must have a clear input contract, a deterministic or measurable output, and a place in the end-to-end workflow.

### Implementation interpretation
Define the component as a small module with:
- explicit inputs;
- explicit outputs;
- validation rules;
- model/tool version;
- metrics;
- failure behaviour.

The component should be independently testable before it is connected to the agent.

### Why it matters for SIH
A judge should be able to see the feature working and, ideally, see a quantitative or visual proof of correctness. Features without evidence should not dominate the presentation.

### Common failure mode
Do not implement this as a black-box prompt. Keep domain-specific processing and measurable outputs outside the final language-generation layer.

### How it connects to SatQuery
The output should become structured evidence that can be consumed by the agent/evidence-fusion layer and visualized in the GUI.

### Original interpretation
Examples: VQA, grounding, change analysis, optical-SAR analysis, counting, spatial query.

---

Controller number of images, modality, format, dimensions, metadata aur whether task is compatible check karega.


### Minimum acceptance test
Create at least one automated or manual test for this point. The test should specify the input, expected behaviour, observed output, and pass/fail result. If the point is model-related, record the metric; if it is UI-related, record the interaction; if it is geospatial, test coordinate/raster correctness.

### What the judge should see
The final demo should expose the consequence of this component rather than its source code. The judge should see a correct answer, a useful visualization, a meaningful trace, or a quantitative result.


## Point 16 — Tool Registry + Model Selection


### What this point means
This point should be understood as an engineering requirement, not merely a feature label. In SatQuery, it must have a clear input contract, a deterministic or measurable output, and a place in the end-to-end workflow.

### Implementation interpretation
Define the component as a small module with:
- explicit inputs;
- explicit outputs;
- validation rules;
- model/tool version;
- metrics;
- failure behaviour.

The component should be independently testable before it is connected to the agent.

### Why it matters for SIH
A judge should be able to see the feature working and, ideally, see a quantitative or visual proof of correctness. Features without evidence should not dominate the presentation.

### Common failure mode
Do not implement this as a black-box prompt. Keep domain-specific processing and measurable outputs outside the final language-generation layer.

### How it connects to SatQuery
The output should become structured evidence that can be consumed by the agent/evidence-fusion layer and visualized in the GUI.

### Original interpretation
Predefined registry mein VQA, grounding, captioning, change, optical-SAR aur geospatial utilities registered honge.

---

Router task + input configuration ke basis par one or more specialists choose karega.


### Minimum acceptance test
Create at least one automated or manual test for this point. The test should specify the input, expected behaviour, observed output, and pass/fail result. If the point is model-related, record the metric; if it is UI-related, record the interaction; if it is geospatial, test coordinate/raster correctness.

### What the judge should see
The final demo should expose the consequence of this component rather than its source code. The judge should see a correct answer, a useful visualization, a meaningful trace, or a quantitative result.


## Point 17 — Parameter Governance + Execution Trace


### What this point means
This point should be understood as an engineering requirement, not merely a feature label. In SatQuery, it must have a clear input contract, a deterministic or measurable output, and a place in the end-to-end workflow.

### Implementation interpretation
Define the component as a small module with:
- explicit inputs;
- explicit outputs;
- validation rules;
- model/tool version;
- metrics;
- failure behaviour.

The component should be independently testable before it is connected to the agent.

### Why it matters for SIH
A judge should be able to see the feature working and, ideally, see a quantitative or visual proof of correctness. Features without evidence should not dominate the presentation.

### Common failure mode
Do not implement this as a black-box prompt. Keep domain-specific processing and measurable outputs outside the final language-generation layer.

### How it connects to SatQuery
The output should become structured evidence that can be consumed by the agent/evidence-fusion layer and visualized in the GUI.

### Original interpretation
Agent sirf permitted parameters set kare. Arbitrary model/code execution allowed nahi hona chahiye.

---

Observable trace mein selected task, model/tool names, permitted parameters aur outputs dikhne chahiye. Internal chain-of-thought expose karna unnecessary hai.


### Minimum acceptance test
Create at least one automated or manual test for this point. The test should specify the input, expected behaviour, observed output, and pass/fail result. If the point is model-related, record the metric; if it is UI-related, record the interaction; if it is geospatial, test coordinate/raster correctness.

### What the judge should see
The final demo should expose the consequence of this component rather than its source code. The judge should see a correct answer, a useful visualization, a meaningful trace, or a quantitative result.


## Point 18 — Evidence Fusion


### Evidence is the central product layer
Different tools may return different evidence:
- text answer;
- confidence;
- boxes;
- masks;
- change scores;
- coordinates;
- class probabilities.

Normalize them into a common evidence graph.

### Example
A change model says a region changed. A grounding model identifies the region as a building cluster. The final response can say that built-up change was detected there, while keeping both pieces of evidence separately inspectable.

### Conflict handling
If models disagree, do not silently average them. Mark the conflict and either lower confidence, request clarification, or use a second verification tool.


### Minimum acceptance test
Create at least one automated or manual test for this point. The test should specify the input, expected behaviour, observed output, and pass/fail result. If the point is model-related, record the metric; if it is UI-related, record the interaction; if it is geospatial, test coordinate/raster correctness.

### What the judge should see
The final demo should expose the consequence of this component rather than its source code. The judge should see a correct answer, a useful visualization, a meaningful trace, or a quantitative result.


## Point 19 — Final Answer Layer


### Separation of concerns
The final LLM should be a **renderer of validated evidence**, not the primary visual reasoner.

Input:
`structured specialist outputs + evidence`

Output:
`human-readable answer`

This substantially reduces hallucination risk because the language model is constrained by upstream facts.


### Minimum acceptance test
Create at least one automated or manual test for this point. The test should specify the input, expected behaviour, observed output, and pass/fail result. If the point is model-related, record the metric; if it is UI-related, record the interaction; if it is geospatial, test coordinate/raster correctness.

### What the judge should see
The final demo should expose the consequence of this component rather than its source code. The judge should see a correct answer, a useful visualization, a meaningful trace, or a quantitative result.


## Point 20 — Confidence + Auditable Response


### What this point means
This point should be understood as an engineering requirement, not merely a feature label. In SatQuery, it must have a clear input contract, a deterministic or measurable output, and a place in the end-to-end workflow.

### Implementation interpretation
Define the component as a small module with:
- explicit inputs;
- explicit outputs;
- validation rules;
- model/tool version;
- metrics;
- failure behaviour.

The component should be independently testable before it is connected to the agent.

### Why it matters for SIH
A judge should be able to see the feature working and, ideally, see a quantitative or visual proof of correctness. Features without evidence should not dominate the presentation.

### Common failure mode
Do not implement this as a black-box prompt. Keep domain-specific processing and measurable outputs outside the final language-generation layer.

### How it connects to SatQuery
The output should become structured evidence that can be consumed by the agent/evidence-fusion layer and visualized in the GUI.

### Original interpretation
Confidence score model outputs se grounded hona chahiye; fabricated precision avoid karni hai.

---

Response ke saath selected task, model/tool, key parameters, evidence regions aur confidence ka execution summary downloadable hona chahiye.


### Minimum acceptance test
Create at least one automated or manual test for this point. The test should specify the input, expected behaviour, observed output, and pass/fail result. If the point is model-related, record the metric; if it is UI-related, record the interaction; if it is geospatial, test coordinate/raster correctness.

### What the judge should see
The final demo should expose the consequence of this component rather than its source code. The judge should see a correct answer, a useful visualization, a meaningful trace, or a quantitative result.


## Point 21 — Overall Architecture + Web Application


### What this point means
This point should be understood as an engineering requirement, not merely a feature label. In SatQuery, it must have a clear input contract, a deterministic or measurable output, and a place in the end-to-end workflow.

### Implementation interpretation
Define the component as a small module with:
- explicit inputs;
- explicit outputs;
- validation rules;
- model/tool version;
- metrics;
- failure behaviour.

The component should be independently testable before it is connected to the agent.

### Why it matters for SIH
A judge should be able to see the feature working and, ideally, see a quantitative or visual proof of correctness. Features without evidence should not dominate the presentation.

### Common failure mode
Do not implement this as a black-box prompt. Keep domain-specific processing and measurable outputs outside the final language-generation layer.

### How it connects to SatQuery
The output should become structured evidence that can be consumed by the agent/evidence-fusion layer and visualized in the GUI.

### Original interpretation
Frontend -> input validator -> query interpreter -> agentic router -> specialist models -> evidence fusion -> answer generator -> GIS visualization/report.

---

Interactive GUI/web app problem statement ki expected delivery form hai. UI ko researcher aur non-expert dono ke liye understandable banana hai.


### Minimum acceptance test
Create at least one automated or manual test for this point. The test should specify the input, expected behaviour, observed output, and pass/fail result. If the point is model-related, record the metric; if it is UI-related, record the interaction; if it is geospatial, test coordinate/raster correctness.

### What the judge should see
The final demo should expose the consequence of this component rather than its source code. The judge should see a correct answer, a useful visualization, a meaningful trace, or a quantitative result.


## Point 22 — Backend + ML Runtime


### What this point means
This point should be understood as an engineering requirement, not merely a feature label. In SatQuery, it must have a clear input contract, a deterministic or measurable output, and a place in the end-to-end workflow.

### Implementation interpretation
Define the component as a small module with:
- explicit inputs;
- explicit outputs;
- validation rules;
- model/tool version;
- metrics;
- failure behaviour.

The component should be independently testable before it is connected to the agent.

### Why it matters for SIH
A judge should be able to see the feature working and, ideally, see a quantitative or visual proof of correctness. Features without evidence should not dominate the presentation.

### Common failure mode
Do not implement this as a black-box prompt. Keep domain-specific processing and measurable outputs outside the final language-generation layer.

### How it connects to SatQuery
The output should become structured evidence that can be consumed by the agent/evidence-fusion layer and visualized in the GUI.

### Original interpretation
Python/FastAPI practical choice hai because GeoTIFF, raster, ML aur model serving ecosystem Python mein strong hai.

---

PyTorch + Hugging Face + PEFT/LoRA + rasterio/GDAL/GeoPandas ecosystem strong baseline hai.

> **[AUDIT · quality]** Language breaks to Hinglish here and in at least two other places (Point 27, Point 25). The document is otherwise formal English. Inconsistent register across a shared team document causes copy-paste accidents into the deck. Pick one language and normalise.


### Minimum acceptance test
Create at least one automated or manual test for this point. The test should specify the input, expected behaviour, observed output, and pass/fail result. If the point is model-related, record the metric; if it is UI-related, record the interaction; if it is geospatial, test coordinate/raster correctness.

### What the judge should see
The final demo should expose the consequence of this component rather than its source code. The judge should see a correct answer, a useful visualization, a meaningful trace, or a quantitative result.


## Point 23 — Geospatial Database


### What belongs in PostGIS
Store:
- asset footprints;
- CRS;
- timestamps;
- model result geometries;
- detected regions;
- change polygons;
- query/result metadata.

Do not store huge raw raster arrays as ordinary relational rows.

### Spatial advantage
PostGIS allows questions such as “which detected changes intersect this AOI?” and makes the system more than a visual demo.


### Minimum acceptance test
Create at least one automated or manual test for this point. The test should specify the input, expected behaviour, observed output, and pass/fail result. If the point is model-related, record the metric; if it is UI-related, record the interaction; if it is geospatial, test coordinate/raster correctness.

### What the judge should see
The final demo should expose the consequence of this component rather than its source code. The judge should see a correct answer, a useful visualization, a meaningful trace, or a quantitative result.


## Point 24 — Object Storage + Dataset Landscape


### What this point means
This point should be understood as an engineering requirement, not merely a feature label. In SatQuery, it must have a clear input contract, a deterministic or measurable output, and a place in the end-to-end workflow.

### Implementation interpretation
Define the component as a small module with:
- explicit inputs;
- explicit outputs;
- validation rules;
- model/tool version;
- metrics;
- failure behaviour.

The component should be independently testable before it is connected to the agent.

### Why it matters for SIH
A judge should be able to see the feature working and, ideally, see a quantitative or visual proof of correctness. Features without evidence should not dominate the presentation.

### Common failure mode
Do not implement this as a black-box prompt. Keep domain-specific processing and measurable outputs outside the final language-generation layer.

### How it connects to SatQuery
The output should become structured evidence that can be consumed by the agent/evidence-fusion layer and visualized in the GUI.

### Original interpretation
Large imagery ko DB ke andar store karne ke bajay S3-compatible object storage use karna better hai.

---

Main public resources: BigEarthNet.txt, VRSBench, RSVQA, CDVQA; final hidden evaluation ISRO/SAC dataset.


### Minimum acceptance test
Create at least one automated or manual test for this point. The test should specify the input, expected behaviour, observed output, and pass/fail result. If the point is model-related, record the metric; if it is UI-related, record the interaction; if it is geospatial, test coordinate/raster correctness.

### What the judge should see
The final demo should expose the consequence of this component rather than its source code. The judge should see a correct answer, a useful visualization, a meaningful trace, or a quantitative result.


## Point 25 — BigEarthNet.txt Role + BigEarthNet Scale


### What this point means
This point should be understood as an engineering requirement, not merely a feature label. In SatQuery, it must have a clear input contract, a deterministic or measurable output, and a place in the end-to-end workflow.

### Implementation interpretation
Define the component as a small module with:
- explicit inputs;
- explicit outputs;
- validation rules;
- model/tool version;
- metrics;
- failure behaviour.

The component should be independently testable before it is connected to the agent.

### Why it matters for SIH
A judge should be able to see the feature working and, ideally, see a quantitative or visual proof of correctness. Features without evidence should not dominate the presentation.

### Common failure mode
Do not implement this as a black-box prompt. Keep domain-specific processing and measurable outputs outside the final language-generation layer.

### How it connects to SatQuery
The output should become structured evidence that can be consumed by the agent/evidence-fusion layer and visualized in the GUI.

### Original interpretation
Primary adaptation resource. Isse image-text representations ko multisensor remote-sensing domain mein adapt karna hai.

---

Current project material reports 464,044 Sentinel-1/Sentinel-2 co-registered pairs and roughly 9.6M text annotations. Annotation artifact around hundreds of MB ho sakta hai, but associated imagery much larger is.

> **[AUDIT · S — Supported, with an internal contradiction]** The 464,044 figure is correct. Calling 9.6M "text annotations" contradicts this document's own §3.1, which correctly insists the 9.6M figure counts **S1-S2-text triplets, not annotations and not images**, and treats that distinction as a mark of dataset literacy. Fix this line to match §3.1 — as written it is the exact error §3.1 warns against.


### Minimum acceptance test
Create at least one automated or manual test for this point. The test should specify the input, expected behaviour, observed output, and pass/fail result. If the point is model-related, record the metric; if it is UI-related, record the interaction; if it is geospatial, test coordinate/raster correctness.

### What the judge should see
The final demo should expose the consequence of this component rather than its source code. The judge should see a correct answer, a useful visualization, a meaningful trace, or a quantitative result.


## Point 26 — BigEarthNet Schema + Why BigEarthNet Matters


### What this point means
This point should be understood as an engineering requirement, not merely a feature label. In SatQuery, it must have a clear input contract, a deterministic or measurable output, and a place in the end-to-end workflow.

### Implementation interpretation
Define the component as a small module with:
- explicit inputs;
- explicit outputs;
- validation rules;
- model/tool version;
- metrics;
- failure behaviour.

The component should be independently testable before it is connected to the agent.

### Why it matters for SIH
A judge should be able to see the feature working and, ideally, see a quantitative or visual proof of correctness. Features without evidence should not dominate the presentation.

### Common failure mode
Do not implement this as a black-box prompt. Keep domain-specific processing and measurable outputs outside the final language-generation layer.

### How it connects to SatQuery
The output should become structured evidence that can be consumed by the agent/evidence-fusion layer and visualized in the GUI.

### Original interpretation
Records mein image identifiers, text input/output, task/category metadata, geolocation/context fields aur split information mil sakta hai; exact schema version download ke baad verify karna hoga.

---

It teaches remote-sensing vocabulary and multimodal relationships rather than generic internet-photo semantics.


### Minimum acceptance test
Create at least one automated or manual test for this point. The test should specify the input, expected behaviour, observed output, and pass/fail result. If the point is model-related, record the metric; if it is UI-related, record the interaction; if it is geospatial, test coordinate/raster correctness.

### What the judge should see
The final demo should expose the consequence of this component rather than its source code. The judge should see a correct answer, a useful visualization, a meaningful trace, or a quantitative result.


## Point 27 — BigEarthNet Training Strategy + LoRA/PEFT


### What this point means
This point should be understood as an engineering requirement, not merely a feature label. In SatQuery, it must have a clear input contract, a deterministic or measurable output, and a place in the end-to-end workflow.

### Implementation interpretation
Define the component as a small module with:
- explicit inputs;
- explicit outputs;
- validation rules;
- model/tool version;
- metrics;
- failure behaviour.

The component should be independently testable before it is connected to the agent.

### Why it matters for SIH
A judge should be able to see the feature working and, ideally, see a quantitative or visual proof of correctness. Features without evidence should not dominate the presentation.

### Common failure mode
Do not implement this as a black-box prompt. Keep domain-specific processing and measurable outputs outside the final language-generation layer.

### How it connects to SatQuery
The output should become structured evidence that can be consumed by the agent/evidence-fusion layer and visualized in the GUI.

### Original interpretation
Full dataset se start nahi karna. Balanced task subset se baseline, scaling experiments aur ablation karni chahiye.

---

Pretrained VLM ko full fine-tune karne ke bajay LoRA/PEFT se trainable parameter footprint reduce kiya ja sakta hai.


### Minimum acceptance test
Create at least one automated or manual test for this point. The test should specify the input, expected behaviour, observed output, and pass/fail result. If the point is model-related, record the metric; if it is UI-related, record the interaction; if it is geospatial, test coordinate/raster correctness.

### What the judge should see
The final demo should expose the consequence of this component rather than its source code. The judge should see a correct answer, a useful visualization, a meaningful trace, or a quantitative result.


## Point 28 — Data Versioning + VRSBench


### What this point means
This point should be understood as an engineering requirement, not merely a feature label. In SatQuery, it must have a clear input contract, a deterministic or measurable output, and a place in the end-to-end workflow.

### Implementation interpretation
Define the component as a small module with:
- explicit inputs;
- explicit outputs;
- validation rules;
- model/tool version;
- metrics;
- failure behaviour.

The component should be independently testable before it is connected to the agent.

### Why it matters for SIH
A judge should be able to see the feature working and, ideally, see a quantitative or visual proof of correctness. Features without evidence should not dominate the presentation.

### Common failure mode
Do not implement this as a black-box prompt. Keep domain-specific processing and measurable outputs outside the final language-generation layer.

### How it connects to SatQuery
The output should become structured evidence that can be consumed by the agent/evidence-fusion layer and visualized in the GUI.

### Original interpretation
Dataset version, preprocessing script, split manifest aur checksum maintain karo taaki experiment reproducibility ho.

---

Remote-sensing vision-language benchmark with thousands of images, human-verified captions, object references and a large VQA set. Primary use: single-image VQA/grounding benchmarking.


### Minimum acceptance test
Create at least one automated or manual test for this point. The test should specify the input, expected behaviour, observed output, and pass/fail result. If the point is model-related, record the metric; if it is UI-related, record the interaction; if it is geospatial, test coordinate/raster correctness.

### What the judge should see
The final demo should expose the consequence of this component rather than its source code. The judge should see a correct answer, a useful visualization, a meaningful trace, or a quantitative result.


## Point 29 — VRSBench Use + RSVQA


### What this point means
This point should be understood as an engineering requirement, not merely a feature label. In SatQuery, it must have a clear input contract, a deterministic or measurable output, and a place in the end-to-end workflow.

### Implementation interpretation
Define the component as a small module with:
- explicit inputs;
- explicit outputs;
- validation rules;
- model/tool version;
- metrics;
- failure behaviour.

The component should be independently testable before it is connected to the agent.

### Why it matters for SIH
A judge should be able to see the feature working and, ideally, see a quantitative or visual proof of correctness. Features without evidence should not dominate the presentation.

### Common failure mode
Do not implement this as a black-box prompt. Keep domain-specific processing and measurable outputs outside the final language-generation layer.

### How it connects to SatQuery
The output should become structured evidence that can be consumed by the agent/evidence-fusion layer and visualized in the GUI.

### Original interpretation
Model selection, baseline evaluation, grounding validation aur error analysis ke liye use karo.

---

Remote-sensing VQA benchmark. Low-resolution release has 772 images and 77,232 QA pairs; high-resolution variant also exists.

> **[AUDIT · V — Verified]** RSVQA-LR is 772 images of 256×256 with 77,232 QA pairs (Lobry et al., arXiv:2003.07333). Question types split roughly 29.8% count / 29.6% presence / 39.6% comparison / 1.0% rural-urban. The HR variant uses USGS High Resolution Orthoimagery at 15 cm.
>
> **Missing, and it matters:** RSVQA-LR's 772 images come from **9 Sentinel-2 tiles covering the Netherlands**. Questions and answers are auto-generated from OpenStreetMap. This is a small, geographically single-country, template-generated benchmark. Scoring well on it says very little about Indian Cartosat-2S scenes. See the audit note on §4.


### Minimum acceptance test
Create at least one automated or manual test for this point. The test should specify the input, expected behaviour, observed output, and pass/fail result. If the point is model-related, record the metric; if it is UI-related, record the interaction; if it is geospatial, test coordinate/raster correctness.

### What the judge should see
The final demo should expose the consequence of this component rather than its source code. The judge should see a correct answer, a useful visualization, a meaningful trace, or a quantitative result.


## Point 30 — RSVQA Use + CDVQA


### What this point means
This point should be understood as an engineering requirement, not merely a feature label. In SatQuery, it must have a clear input contract, a deterministic or measurable output, and a place in the end-to-end workflow.

### Implementation interpretation
Define the component as a small module with:
- explicit inputs;
- explicit outputs;
- validation rules;
- model/tool version;
- metrics;
- failure behaviour.

The component should be independently testable before it is connected to the agent.

### Why it matters for SIH
A judge should be able to see the feature working and, ideally, see a quantitative or visual proof of correctness. Features without evidence should not dominate the presentation.

### Common failure mode
Do not implement this as a black-box prompt. Keep domain-specific processing and measurable outputs outside the final language-generation layer.

### How it connects to SatQuery
The output should become structured evidence that can be consumed by the agent/evidence-fusion layer and visualized in the GUI.

### Original interpretation
Clean VQA sanity check. Agar simple remote-sensing questions bhi fail ho rahe hain to agent layer add karna premature hai.

---

Change Detection Visual Question Answering dataset with 2,968 image pairs and more than 122k QA pairs across published splits.

> **[AUDIT · V — Verified]** CDVQA is 2,968 bi-temporal image pairs at 512×512 with >122,000 automatically generated QA pairs.
>
> **Missing, and it matters:** CDVQA is built on the public subset of the **SECOND** semantic change detection dataset — **aerial RGB imagery**, not satellite, with answers defined over only **six land-cover classes** (non-vegetated ground, buildings, playgrounds, water, low vegetation, trees). Questions are auto-generated. So the mandated change-analysis benchmark is aerial RGB with six classes, while the hidden evaluation is spaceborne Cartosat-2S optical paired with RISAT SAR. That gap is the central technical risk of this PS and this document never names it.


### Minimum acceptance test
Create at least one automated or manual test for this point. The test should specify the input, expected behaviour, observed output, and pass/fail result. If the point is model-related, record the metric; if it is UI-related, record the interaction; if it is geospatial, test coordinate/raster correctness.

### What the judge should see
The final demo should expose the consequence of this component rather than its source code. The judge should see a correct answer, a useful visualization, a meaningful trace, or a quantitative result.


## Point 31 — CDVQA Use + ISRO/SAC Hidden Evaluation


### What this point means
This point should be understood as an engineering requirement, not merely a feature label. In SatQuery, it must have a clear input contract, a deterministic or measurable output, and a place in the end-to-end workflow.

### Implementation interpretation
Define the component as a small module with:
- explicit inputs;
- explicit outputs;
- validation rules;
- model/tool version;
- metrics;
- failure behaviour.

The component should be independently testable before it is connected to the agent.

### Why it matters for SIH
A judge should be able to see the feature working and, ideally, see a quantitative or visual proof of correctness. Features without evidence should not dominate the presentation.

### Common failure mode
Do not implement this as a black-box prompt. Keep domain-specific processing and measurable outputs outside the final language-generation layer.

### How it connects to SatQuery
The output should become structured evidence that can be consumed by the agent/evidence-fusion layer and visualized in the GUI.

### Original interpretation
Bi-temporal reasoning, change description, change-question answering aur temporal error analysis.

---

Final set contains pre-georeferenced, co-registered Cartosat-2S optical and RISAT SAR pairs with task-specific references; annotations are undisclosed.

> **[AUDIT · V — Verified]** Matches the official PS text exactly.


### Minimum acceptance test
Create at least one automated or manual test for this point. The test should specify the input, expected behaviour, observed output, and pass/fail result. If the point is model-related, record the metric; if it is UI-related, record the interaction; if it is geospatial, test coordinate/raster correctness.

### What the judge should see
The final demo should expose the consequence of this component rather than its source code. The judge should see a correct answer, a useful visualization, a meaningful trace, or a quantitative result.


## Point 32 — Why Hidden Evaluation Matters


### What this point means
This point should be understood as an engineering requirement, not merely a feature label. In SatQuery, it must have a clear input contract, a deterministic or measurable output, and a place in the end-to-end workflow.

### Implementation interpretation
Define the component as a small module with:
- explicit inputs;
- explicit outputs;
- validation rules;
- model/tool version;
- metrics;
- failure behaviour.

The component should be independently testable before it is connected to the agent.

### Why it matters for SIH
A judge should be able to see the feature working and, ideally, see a quantitative or visual proof of correctness. Features without evidence should not dominate the presentation.

### Common failure mode
Do not implement this as a black-box prompt. Keep domain-specific processing and measurable outputs outside the final language-generation layer.

### How it connects to SatQuery
The output should become structured evidence that can be consumed by the agent/evidence-fusion layer and visualized in the GUI.

### Original interpretation
Public benchmark performance alone sufficient nahi hai. System ko unseen sensor/task/location combinations par generalize karna hoga.


### Minimum acceptance test
Create at least one automated or manual test for this point. The test should specify the input, expected behaviour, observed output, and pass/fail result. If the point is model-related, record the metric; if it is UI-related, record the interaction; if it is geospatial, test coordinate/raster correctness.

### What the judge should see
The final demo should expose the consequence of this component rather than its source code. The judge should see a correct answer, a useful visualization, a meaningful trace, or a quantitative result.


## Point 33 — Input Formats


### What this point means
This point should be understood as an engineering requirement, not merely a feature label. In SatQuery, it must have a clear input contract, a deterministic or measurable output, and a place in the end-to-end workflow.

### Implementation interpretation
Define the component as a small module with:
- explicit inputs;
- explicit outputs;
- validation rules;
- model/tool version;
- metrics;
- failure behaviour.

The component should be independently testable before it is connected to the agent.

### Why it matters for SIH
A judge should be able to see the feature working and, ideally, see a quantitative or visual proof of correctness. Features without evidence should not dominate the presentation.

### Common failure mode
Do not implement this as a black-box prompt. Keep domain-specific processing and measurable outputs outside the final language-generation layer.

### How it connects to SatQuery
The output should become structured evidence that can be consumed by the agent/evidence-fusion layer and visualized in the GUI.

### Original interpretation
GeoTIFF/TIFF are intended geospatial formats. PNG/JPEG can be used for prescribed public benchmarks where allowed.


### Minimum acceptance test
Create at least one automated or manual test for this point. The test should specify the input, expected behaviour, observed output, and pass/fail result. If the point is model-related, record the metric; if it is UI-related, record the interaction; if it is geospatial, test coordinate/raster correctness.

### What the judge should see
The final demo should expose the consequence of this component rather than its source code. The judge should see a correct answer, a useful visualization, a meaningful trace, or a quantitative result.


## Point 34 — GeoTIFF Metadata


### What this point means
This point should be understood as an engineering requirement, not merely a feature label. In SatQuery, it must have a clear input contract, a deterministic or measurable output, and a place in the end-to-end workflow.

### Implementation interpretation
Define the component as a small module with:
- explicit inputs;
- explicit outputs;
- validation rules;
- model/tool version;
- metrics;
- failure behaviour.

The component should be independently testable before it is connected to the agent.

### Why it matters for SIH
A judge should be able to see the feature working and, ideally, see a quantitative or visual proof of correctness. Features without evidence should not dominate the presentation.

### Common failure mode
Do not implement this as a black-box prompt. Keep domain-specific processing and measurable outputs outside the final language-generation layer.

### How it connects to SatQuery
The output should become structured evidence that can be consumed by the agent/evidence-fusion layer and visualized in the GUI.

### Original interpretation
GeoTIFF may encode CRS/geotransform, so system geographic coordinates aur raster space ke beech conversion maintain kar sakta hai.


### Minimum acceptance test
Create at least one automated or manual test for this point. The test should specify the input, expected behaviour, observed output, and pass/fail result. If the point is model-related, record the metric; if it is UI-related, record the interaction; if it is geospatial, test coordinate/raster correctness.

### What the judge should see
The final demo should expose the consequence of this component rather than its source code. The judge should see a correct answer, a useful visualization, a meaningful trace, or a quantitative result.


## Point 35 — Preprocessing Pipeline


### Recommended deterministic pipeline
```text
read file
→ inspect metadata
→ validate bands/modality
→ check CRS/geotransform
→ normalize
→ resample only when required
→ tile/patch
→ preserve mapping to original coordinates
→ inference
→ map predictions back to source raster
```

### Critical rule
Every transformation must preserve enough information to map model outputs back to the original image. Otherwise, a correct mask can become unusable in the GIS viewer.


### Minimum acceptance test
Create at least one automated or manual test for this point. The test should specify the input, expected behaviour, observed output, and pass/fail result. If the point is model-related, record the metric; if it is UI-related, record the interaction; if it is geospatial, test coordinate/raster correctness.

### What the judge should see
The final demo should expose the consequence of this component rather than its source code. The judge should see a correct answer, a useful visualization, a meaningful trace, or a quantitative result.


## Point 36 — Query Taxonomy


### Build the taxonomy before the agent
Do not start with “let an LLM decide everything.” Define the task space first. The taxonomy becomes the contract between UX, agent and models.

A useful first version has six classes:
1. single VQA;
2. caption/scene description;
3. grounding;
4. temporal change;
5. temporal change VQA;
6. optical-SAR analysis.

This makes the agent measurable.


### Minimum acceptance test
Create at least one automated or manual test for this point. The test should specify the input, expected behaviour, observed output, and pass/fail result. If the point is model-related, record the metric; if it is UI-related, record the interaction; if it is geospatial, test coordinate/raster correctness.

### What the judge should see
The final demo should expose the consequence of this component rather than its source code. The judge should see a correct answer, a useful visualization, a meaningful trace, or a quantitative result.


## Point 37 — Tool Calling Example


### What this point means
This point should be understood as an engineering requirement, not merely a feature label. In SatQuery, it must have a clear input contract, a deterministic or measurable output, and a place in the end-to-end workflow.

### Implementation interpretation
Define the component as a small module with:
- explicit inputs;
- explicit outputs;
- validation rules;
- model/tool version;
- metrics;
- failure behaviour.

The component should be independently testable before it is connected to the agent.

### Why it matters for SIH
A judge should be able to see the feature working and, ideally, see a quantitative or visual proof of correctness. Features without evidence should not dominate the presentation.

### Common failure mode
Do not implement this as a black-box prompt. Keep domain-specific processing and measurable outputs outside the final language-generation layer.

### How it connects to SatQuery
The output should become structured evidence that can be consumed by the agent/evidence-fusion layer and visualized in the GUI.

### Original interpretation
'How many buildings?' -> VQA. 'Highlight buildings' -> grounding. 'What changed?' -> change model. 'Use optical and SAR together' -> cross-modal tool.


### Minimum acceptance test
Create at least one automated or manual test for this point. The test should specify the input, expected behaviour, observed output, and pass/fail result. If the point is model-related, record the metric; if it is UI-related, record the interaction; if it is geospatial, test coordinate/raster correctness.

### What the judge should see
The final demo should expose the consequence of this component rather than its source code. The judge should see a correct answer, a useful visualization, a meaningful trace, or a quantitative result.


## Point 38 — No-Answer Conditions


### A good system must know when it cannot answer
Examples:
- only one image uploaded for a temporal question;
- SAR requested but no SAR asset supplied;
- unsupported raster;
- missing georeferencing for a spatial operation;
- severe registration mismatch;
- confidence below threshold.

### UX
Return a clarification or limitation message rather than a fabricated answer. This is a major reliability feature.


### Minimum acceptance test
Create at least one automated or manual test for this point. The test should specify the input, expected behaviour, observed output, and pass/fail result. If the point is model-related, record the metric; if it is UI-related, record the interaction; if it is geospatial, test coordinate/raster correctness.

### What the judge should see
The final demo should expose the consequence of this component rather than its source code. The judge should see a correct answer, a useful visualization, a meaningful trace, or a quantitative result.


## Point 39 — Evidence-Grounded Output


### Ideal answer composition
```text
Answer
↓
Why / evidence
↓
Highlighted region(s)
↓
Confidence
↓
Execution summary
↓
Export
```

For spatial outputs, allow the user to click an evidence region and see its coordinates, source image and model score.


### Minimum acceptance test
Create at least one automated or manual test for this point. The test should specify the input, expected behaviour, observed output, and pass/fail result. If the point is model-related, record the metric; if it is UI-related, record the interaction; if it is geospatial, test coordinate/raster correctness.

### What the judge should see
The final demo should expose the consequence of this component rather than its source code. The judge should see a correct answer, a useful visualization, a meaningful trace, or a quantitative result.


## Point 40 — Hallucination Control


### Four-layer defense
1. **Specialist grounding:** visual facts originate from specialist models.
2. **Schema constraints:** answer generation receives structured evidence.
3. **Abstention:** low-confidence cases do not get forced into definitive language.
4. **Evidence requirement:** important claims must point to a region/output.

This is stronger than simply adding “please do not hallucinate” to a prompt.


### Minimum acceptance test
Create at least one automated or manual test for this point. The test should specify the input, expected behaviour, observed output, and pass/fail result. If the point is model-related, record the metric; if it is UI-related, record the interaction; if it is geospatial, test coordinate/raster correctness.

### What the judge should see
The final demo should expose the consequence of this component rather than its source code. The judge should see a correct answer, a useful visualization, a meaningful trace, or a quantitative result.


## Point 41 — Spatial Coordinates


### Coordinate transformation
For a GeoTIFF, pixel coordinates can be transformed to map coordinates using the raster affine transform and CRS. For polygons/masks, convert the raster region into vector geometry and transform it into the desired CRS.

### Common mistake
Do not confuse pixel `(row, col)` with `(x, y)` map coordinates. Keep a tested utility module for coordinate conversion and unit-test it using known corner points.


### Minimum acceptance test
Create at least one automated or manual test for this point. The test should specify the input, expected behaviour, observed output, and pass/fail result. If the point is model-related, record the metric; if it is UI-related, record the interaction; if it is geospatial, test coordinate/raster correctness.

### What the judge should see
The final demo should expose the consequence of this component rather than its source code. The judge should see a correct answer, a useful visualization, a meaningful trace, or a quantitative result.


## Point 42 — Evaluation Philosophy


### Evaluation must match the architecture
A single overall score can hide failures. Report a dashboard:
- VQA;
- grounding;
- change;
- cross-modal;
- routing;
- calibration;
- latency;
- failure/abstention.

Then provide a composite score only after the individual numbers are visible.


### Minimum acceptance test
Create at least one automated or manual test for this point. The test should specify the input, expected behaviour, observed output, and pass/fail result. If the point is model-related, record the metric; if it is UI-related, record the interaction; if it is geospatial, test coordinate/raster correctness.

### What the judge should see
The final demo should expose the consequence of this component rather than its source code. The judge should see a correct answer, a useful visualization, a meaningful trace, or a quantitative result.


## Point 43 — VQA Metric


### Suggested metrics
For closed-form answers:
- normalized exact match;
- accuracy/F1 for categorical outputs.

For open-ended answers:
- semantic similarity can supplement exact match, but do not use an LLM judge as the only metric.

Always keep a human-inspected error sample because remote-sensing answers can be semantically equivalent despite lexical differences.


### Minimum acceptance test
Create at least one automated or manual test for this point. The test should specify the input, expected behaviour, observed output, and pass/fail result. If the point is model-related, record the metric; if it is UI-related, record the interaction; if it is geospatial, test coordinate/raster correctness.

### What the judge should see
The final demo should expose the consequence of this component rather than its source code. The judge should see a correct answer, a useful visualization, a meaningful trace, or a quantitative result.


## Point 44 — Grounding Metric


### Metrics
Use IoU between predicted and reference boxes/masks, plus precision/recall for multiple objects. Report thresholded success rates such as “percentage of queries with IoU ≥ 0.5” where appropriate.

### Why this is powerful in a demo
A mask/box is immediately visible, so judges can visually verify whether the system is right.


### Minimum acceptance test
Create at least one automated or manual test for this point. The test should specify the input, expected behaviour, observed output, and pass/fail result. If the point is model-related, record the metric; if it is UI-related, record the interaction; if it is geospatial, test coordinate/raster correctness.

### What the judge should see
The final demo should expose the consequence of this component rather than its source code. The judge should see a correct answer, a useful visualization, a meaningful trace, or a quantitative result.


## Point 45 — Change Metrics


### Spatial and semantic evaluation
If reference masks exist:
- IoU;
- precision;
- recall;
- F1.

For change questions:
- answer accuracy;
- change-type accuracy;
- magnitude/category accuracy if labels support it.

Keep localization and language evaluation separate.


### Minimum acceptance test
Create at least one automated or manual test for this point. The test should specify the input, expected behaviour, observed output, and pass/fail result. If the point is model-related, record the metric; if it is UI-related, record the interaction; if it is geospatial, test coordinate/raster correctness.

### What the judge should see
The final demo should expose the consequence of this component rather than its source code. The judge should see a correct answer, a useful visualization, a meaningful trace, or a quantitative result.


## Point 46 — Captioning Metrics


### What this point means
This point should be understood as an engineering requirement, not merely a feature label. In SatQuery, it must have a clear input contract, a deterministic or measurable output, and a place in the end-to-end workflow.

### Implementation interpretation
Define the component as a small module with:
- explicit inputs;
- explicit outputs;
- validation rules;
- model/tool version;
- metrics;
- failure behaviour.

The component should be independently testable before it is connected to the agent.

### Why it matters for SIH
A judge should be able to see the feature working and, ideally, see a quantitative or visual proof of correctness. Features without evidence should not dominate the presentation.

### Common failure mode
Do not implement this as a black-box prompt. Keep domain-specific processing and measurable outputs outside the final language-generation layer.

### How it connects to SatQuery
The output should become structured evidence that can be consumed by the agent/evidence-fusion layer and visualized in the GUI.

### Original interpretation
BLEU/ROUGE/CIDEr-like metrics useful ho sakte hain, but human/semantic evaluation bhi needed hai.


### Minimum acceptance test
Create at least one automated or manual test for this point. The test should specify the input, expected behaviour, observed output, and pass/fail result. If the point is model-related, record the metric; if it is UI-related, record the interaction; if it is geospatial, test coordinate/raster correctness.

### What the judge should see
The final demo should expose the consequence of this component rather than its source code. The judge should see a correct answer, a useful visualization, a meaningful trace, or a quantitative result.


## Point 47 — Agent Router Metric


### Measure the agent itself
Create a manually labeled routing set. For each query, record the expected tool(s). Measure:
`routing_accuracy = correctly selected workflows / total queries`

Also measure false routing by task type. A router that is 95% accurate overall but 60% on the hardest temporal class is not “95% reliable” for all workflows.


### Minimum acceptance test
Create at least one automated or manual test for this point. The test should specify the input, expected behaviour, observed output, and pass/fail result. If the point is model-related, record the metric; if it is UI-related, record the interaction; if it is geospatial, test coordinate/raster correctness.

### What the judge should see
The final demo should expose the consequence of this component rather than its source code. The judge should see a correct answer, a useful visualization, a meaningful trace, or a quantitative result.


## Point 48 — Latency Metric


### What this point means
This point should be understood as an engineering requirement, not merely a feature label. In SatQuery, it must have a clear input contract, a deterministic or measurable output, and a place in the end-to-end workflow.

### Implementation interpretation
Define the component as a small module with:
- explicit inputs;
- explicit outputs;
- validation rules;
- model/tool version;
- metrics;
- failure behaviour.

The component should be independently testable before it is connected to the agent.

### Why it matters for SIH
A judge should be able to see the feature working and, ideally, see a quantitative or visual proof of correctness. Features without evidence should not dominate the presentation.

### Common failure mode
Do not implement this as a black-box prompt. Keep domain-specific processing and measurable outputs outside the final language-generation layer.

### How it connects to SatQuery
The output should become structured evidence that can be consumed by the agent/evidence-fusion layer and visualized in the GUI.

### Original interpretation
Measure upload-to-answer and model-execution latency. Show p50/p95 where possible.


### Minimum acceptance test
Create at least one automated or manual test for this point. The test should specify the input, expected behaviour, observed output, and pass/fail result. If the point is model-related, record the metric; if it is UI-related, record the interaction; if it is geospatial, test coordinate/raster correctness.

### What the judge should see
The final demo should expose the consequence of this component rather than its source code. The judge should see a correct answer, a useful visualization, a meaningful trace, or a quantitative result.


## Point 49 — Reliability Metric


### What this point means
This point should be understood as an engineering requirement, not merely a feature label. In SatQuery, it must have a clear input contract, a deterministic or measurable output, and a place in the end-to-end workflow.

### Implementation interpretation
Define the component as a small module with:
- explicit inputs;
- explicit outputs;
- validation rules;
- model/tool version;
- metrics;
- failure behaviour.

The component should be independently testable before it is connected to the agent.

### Why it matters for SIH
A judge should be able to see the feature working and, ideally, see a quantitative or visual proof of correctness. Features without evidence should not dominate the presentation.

### Common failure mode
Do not implement this as a black-box prompt. Keep domain-specific processing and measurable outputs outside the final language-generation layer.

### How it connects to SatQuery
The output should become structured evidence that can be consumed by the agent/evidence-fusion layer and visualized in the GUI.

### Original interpretation
Tool failure rate, fallback rate, malformed input rate and abstention quality.


### Minimum acceptance test
Create at least one automated or manual test for this point. The test should specify the input, expected behaviour, observed output, and pass/fail result. If the point is model-related, record the metric; if it is UI-related, record the interaction; if it is geospatial, test coordinate/raster correctness.

### What the judge should see
The final demo should expose the consequence of this component rather than its source code. The judge should see a correct answer, a useful visualization, a meaningful trace, or a quantitative result.


## Point 50 — Geographic Leakage

> **[AUDIT · gap]** This point names the right concept but never applies it to this project's own data. Concretely: BigEarthNet is European, RSVQA-LR is **9 Sentinel-2 tiles over the Netherlands**, CDVQA derives from SECOND aerial imagery, and the hidden evaluation is Indian. The leakage risk that matters here is not train/test overlap inside one benchmark — it is that **every named training and benchmark source is non-Indian**. Rewrite this point around that.


### Why ordinary random splits are dangerous
Remote-sensing tiles from neighboring areas can be visually very similar. If nearly identical geography appears in both train and test, performance may be inflated.

### Better split
Use geographic blocks or source-tile separation. Keep paired images from the same scene together.


### Minimum acceptance test
Create at least one automated or manual test for this point. The test should specify the input, expected behaviour, observed output, and pass/fail result. If the point is model-related, record the metric; if it is UI-related, record the interaction; if it is geospatial, test coordinate/raster correctness.

### What the judge should see
The final demo should expose the consequence of this component rather than its source code. The judge should see a correct answer, a useful visualization, a meaningful trace, or a quantitative result.


## Point 51 — Training Stage 1


### Domain adaptation objective
First make the base model understand remote-sensing language and imagery. Use BigEarthNet.txt to align image representations with EO-specific descriptions and questions.

### Success criterion
Do not judge this stage by training loss alone. Measure improvement on held-out remote-sensing VQA/grounding/caption tasks.


### Minimum acceptance test
Create at least one automated or manual test for this point. The test should specify the input, expected behaviour, observed output, and pass/fail result. If the point is model-related, record the metric; if it is UI-related, record the interaction; if it is geospatial, test coordinate/raster correctness.

### What the judge should see
The final demo should expose the consequence of this component rather than its source code. The judge should see a correct answer, a useful visualization, a meaningful trace, or a quantitative result.


## Point 52 — Training Stage 2


### Single-image specialization
Use VRSBench/RSVQA to train/evaluate VQA and grounding/captioning components.

Keep a clean validation set. Do not repeatedly tune against the public test set.


### Minimum acceptance test
Create at least one automated or manual test for this point. The test should specify the input, expected behaviour, observed output, and pass/fail result. If the point is model-related, record the metric; if it is UI-related, record the interaction; if it is geospatial, test coordinate/raster correctness.

### What the judge should see
The final demo should expose the consequence of this component rather than its source code. The judge should see a correct answer, a useful visualization, a meaningful trace, or a quantitative result.


## Point 53 — Training Stage 3


### Temporal specialization
Use CDVQA for temporal reasoning. Where possible, combine change localization with language interpretation so the final answer can point to a spatial region.

### Research value
This stage demonstrates that SatQuery is not simply a single-image VLM with two images concatenated together.


### Minimum acceptance test
Create at least one automated or manual test for this point. The test should specify the input, expected behaviour, observed output, and pass/fail result. If the point is model-related, record the metric; if it is UI-related, record the interaction; if it is geospatial, test coordinate/raster correctness.

### What the judge should see
The final demo should expose the consequence of this component rather than its source code. The judge should see a correct answer, a useful visualization, a meaningful trace, or a quantitative result.


## Point 54 — Training Stage 4


### Optical-SAR fusion
Start with late fusion because it is simpler:
`optical model → evidence`
`SAR model → evidence`
`fusion layer → combined evidence`

Then, if resources allow, experiment with feature/cross-attention fusion.


### Minimum acceptance test
Create at least one automated or manual test for this point. The test should specify the input, expected behaviour, observed output, and pass/fail result. If the point is model-related, record the metric; if it is UI-related, record the interaction; if it is geospatial, test coordinate/raster correctness.

### What the judge should see
The final demo should expose the consequence of this component rather than its source code. The judge should see a correct answer, a useful visualization, a meaningful trace, or a quantitative result.


## Point 55 — Training Stage 5


### Router training
Once specialist models work, collect examples of natural-language queries mapped to tools. Train or calibrate a small classifier if it improves reliability over rules.

The agent should be evaluated independently from the specialists.


### Minimum acceptance test
Create at least one automated or manual test for this point. The test should specify the input, expected behaviour, observed output, and pass/fail result. If the point is model-related, record the metric; if it is UI-related, record the interaction; if it is geospatial, test coordinate/raster correctness.

### What the judge should see
The final demo should expose the consequence of this component rather than its source code. The judge should see a correct answer, a useful visualization, a meaningful trace, or a quantitative result.


## Point 56 — Training Stage 6


### Calibration and evidence fusion
Use a held-out validation set to learn confidence calibration. Test whether model agreement correlates with correctness.

A good fusion system should be able to say:
- “both tools agree”;
- “tools disagree”;
- “evidence insufficient.”

That is more credible than always returning one confident answer.


### Minimum acceptance test
Create at least one automated or manual test for this point. The test should specify the input, expected behaviour, observed output, and pass/fail result. If the point is model-related, record the metric; if it is UI-related, record the interaction; if it is geospatial, test coordinate/raster correctness.

### What the judge should see
The final demo should expose the consequence of this component rather than its source code. The judge should see a correct answer, a useful visualization, a meaningful trace, or a quantitative result.


## Point 57 — Do Not Train From Scratch


### Why
Training a large VLM from scratch requires enormous compute and data. The PS does not require it.

### Better use of resources
Use pretrained encoders/VLMs and adapt them using LoRA/PEFT, task-specific heads, adapters or lightweight fusion modules.

The saved compute can be spent on evaluation, ablations and robustness—the areas that are more valuable for an SIH submission.


### Minimum acceptance test
Create at least one automated or manual test for this point. The test should specify the input, expected behaviour, observed output, and pass/fail result. If the point is model-related, record the metric; if it is UI-related, record the interaction; if it is geospatial, test coordinate/raster correctness.

### What the judge should see
The final demo should expose the consequence of this component rather than its source code. The judge should see a correct answer, a useful visualization, a meaningful trace, or a quantitative result.


## Point 58 — Model Selection Philosophy


### Selection criteria
Choose models based on:
- benchmark performance;
- license;
- inference memory;
- latency;
- modality support;
- output interpretability;
- ease of fine-tuning.

A slightly weaker model that can run reliably on your hardware may be better than a huge model that only works in a notebook.


### Minimum acceptance test
Create at least one automated or manual test for this point. The test should specify the input, expected behaviour, observed output, and pass/fail result. If the point is model-related, record the metric; if it is UI-related, record the interaction; if it is geospatial, test coordinate/raster correctness.

### What the judge should see
The final demo should expose the consequence of this component rather than its source code. The judge should see a correct answer, a useful visualization, a meaningful trace, or a quantitative result.


## Point 59 — Technology Stack


### Suggested implementation
**Frontend:** Next.js/React + TypeScript + MapLibre/OpenLayers or a raster-capable viewer.

**Backend:** FastAPI + Pydantic.

**ML:** PyTorch + Hugging Face + PEFT.

**Raster:** GDAL/rasterio.

**Spatial:** Shapely/GeoPandas/PostGIS.

**Storage:** S3-compatible object storage.

**Queue:** Redis + worker process for GPU jobs.

### Principle
Every component should have a reason to exist. Avoid adding technologies simply to make the architecture diagram look impressive.


### Minimum acceptance test
Create at least one automated or manual test for this point. The test should specify the input, expected behaviour, observed output, and pass/fail result. If the point is model-related, record the metric; if it is UI-related, record the interaction; if it is geospatial, test coordinate/raster correctness.

### What the judge should see
The final demo should expose the consequence of this component rather than its source code. The judge should see a correct answer, a useful visualization, a meaningful trace, or a quantitative result.


## Point 60 — UI Left Panel


### Inputs
Show each uploaded asset as a card:
- filename;
- modality;
- date;
- CRS;
- resolution;
- validation status.

For paired inputs, visually label T1/T2 and Optical/SAR so the user understands what the system thinks the data represent.


### Minimum acceptance test
Create at least one automated or manual test for this point. The test should specify the input, expected behaviour, observed output, and pass/fail result. If the point is model-related, record the metric; if it is UI-related, record the interaction; if it is geospatial, test coordinate/raster correctness.

### What the judge should see
The final demo should expose the consequence of this component rather than its source code. The judge should see a correct answer, a useful visualization, a meaningful trace, or a quantitative result.


## Point 61 — UI Center Panel


### Evidence canvas
The center should be the visual heart of the product:
- image;
- mask/box layers;
- before/after;
- opacity slider;
- synchronized zoom;
- coordinate readout.

A judge should be able to verify the answer without trusting the text.


### Minimum acceptance test
Create at least one automated or manual test for this point. The test should specify the input, expected behaviour, observed output, and pass/fail result. If the point is model-related, record the metric; if it is UI-related, record the interaction; if it is geospatial, test coordinate/raster correctness.

### What the judge should see
The final demo should expose the consequence of this component rather than its source code. The judge should see a correct answer, a useful visualization, a meaningful trace, or a quantitative result.


## Point 62 — UI Right Panel


### Conversational analysis
Provide:
- query box;
- suggested example queries;
- answer;
- confidence;
- evidence links;
- model/tool summary.

Keep the interface simple. Advanced metadata can live in collapsible panels.


### Minimum acceptance test
Create at least one automated or manual test for this point. The test should specify the input, expected behaviour, observed output, and pass/fail result. If the point is model-related, record the metric; if it is UI-related, record the interaction; if it is geospatial, test coordinate/raster correctness.

### What the judge should see
The final demo should expose the consequence of this component rather than its source code. The judge should see a correct answer, a useful visualization, a meaningful trace, or a quantitative result.


## Point 63 — Execution Trace UI


### Observable, not theatrical
Show:
`Task: temporal_change_vqa`
`Tools: change-detector-v2 → RS-VQA-v1`
`Parameters: threshold=...`
`Status: completed`
`Evidence: 3 regions`

Do not create fake “agent thoughts.” The PS explicitly evaluates observable execution information, not hidden reasoning.


### Minimum acceptance test
Create at least one automated or manual test for this point. The test should specify the input, expected behaviour, observed output, and pass/fail result. If the point is model-related, record the metric; if it is UI-related, record the interaction; if it is geospatial, test coordinate/raster correctness.

### What the judge should see
The final demo should expose the consequence of this component rather than its source code. The judge should see a correct answer, a useful visualization, a meaningful trace, or a quantitative result.


## Point 64 — End-to-End Example


### Example workflow
Input:
- T1 optical;
- T2 optical;
- T2 SAR.

Query:
“Has the built-up area increased, and where?”

Plan:
1. validate pair;
2. route to temporal change;
3. detect change;
4. identify built-up semantics;
5. optionally consult SAR evidence;
6. fuse evidence;
7. return answer + map.

This one demo touches temporal reasoning, grounding, cross-modal evidence and agentic routing.


### Minimum acceptance test
Create at least one automated or manual test for this point. The test should specify the input, expected behaviour, observed output, and pass/fail result. If the point is model-related, record the metric; if it is UI-related, record the interaction; if it is geospatial, test coordinate/raster correctness.

### What the judge should see
The final demo should expose the consequence of this component rather than its source code. The judge should see a correct answer, a useful visualization, a meaningful trace, or a quantitative result.


## Point 65 — Demo 1


### What this point means
This point should be understood as an engineering requirement, not merely a feature label. In SatQuery, it must have a clear input contract, a deterministic or measurable output, and a place in the end-to-end workflow.

### Implementation interpretation
Define the component as a small module with:
- explicit inputs;
- explicit outputs;
- validation rules;
- model/tool version;
- metrics;
- failure behaviour.

The component should be independently testable before it is connected to the agent.

### Why it matters for SIH
A judge should be able to see the feature working and, ideally, see a quantitative or visual proof of correctness. Features without evidence should not dominate the presentation.

### Common failure mode
Do not implement this as a black-box prompt. Keep domain-specific processing and measurable outputs outside the final language-generation layer.

### How it connects to SatQuery
The output should become structured evidence that can be consumed by the agent/evidence-fusion layer and visualized in the GUI.

### Original interpretation
Single-image VQA: simple but measurable baseline.


### Minimum acceptance test
Create at least one automated or manual test for this point. The test should specify the input, expected behaviour, observed output, and pass/fail result. If the point is model-related, record the metric; if it is UI-related, record the interaction; if it is geospatial, test coordinate/raster correctness.

### What the judge should see
The final demo should expose the consequence of this component rather than its source code. The judge should see a correct answer, a useful visualization, a meaningful trace, or a quantitative result.


## Point 66 — Demo 2


### What this point means
This point should be understood as an engineering requirement, not merely a feature label. In SatQuery, it must have a clear input contract, a deterministic or measurable output, and a place in the end-to-end workflow.

### Implementation interpretation
Define the component as a small module with:
- explicit inputs;
- explicit outputs;
- validation rules;
- model/tool version;
- metrics;
- failure behaviour.

The component should be independently testable before it is connected to the agent.

### Why it matters for SIH
A judge should be able to see the feature working and, ideally, see a quantitative or visual proof of correctness. Features without evidence should not dominate the presentation.

### Common failure mode
Do not implement this as a black-box prompt. Keep domain-specific processing and measurable outputs outside the final language-generation layer.

### How it connects to SatQuery
The output should become structured evidence that can be consumed by the agent/evidence-fusion layer and visualized in the GUI.

### Original interpretation
Grounding: ask 'highlight water bodies/buildings' and show boxes/masks.


### Minimum acceptance test
Create at least one automated or manual test for this point. The test should specify the input, expected behaviour, observed output, and pass/fail result. If the point is model-related, record the metric; if it is UI-related, record the interaction; if it is geospatial, test coordinate/raster correctness.

### What the judge should see
The final demo should expose the consequence of this component rather than its source code. The judge should see a correct answer, a useful visualization, a meaningful trace, or a quantitative result.


## Point 67 — Demo 3


### What this point means
This point should be understood as an engineering requirement, not merely a feature label. In SatQuery, it must have a clear input contract, a deterministic or measurable output, and a place in the end-to-end workflow.

### Implementation interpretation
Define the component as a small module with:
- explicit inputs;
- explicit outputs;
- validation rules;
- model/tool version;
- metrics;
- failure behaviour.

The component should be independently testable before it is connected to the agent.

### Why it matters for SIH
A judge should be able to see the feature working and, ideally, see a quantitative or visual proof of correctness. Features without evidence should not dominate the presentation.

### Common failure mode
Do not implement this as a black-box prompt. Keep domain-specific processing and measurable outputs outside the final language-generation layer.

### How it connects to SatQuery
The output should become structured evidence that can be consumed by the agent/evidence-fusion layer and visualized in the GUI.

### Original interpretation
Bi-temporal change: before/after + change map + explanation.


### Minimum acceptance test
Create at least one automated or manual test for this point. The test should specify the input, expected behaviour, observed output, and pass/fail result. If the point is model-related, record the metric; if it is UI-related, record the interaction; if it is geospatial, test coordinate/raster correctness.

### What the judge should see
The final demo should expose the consequence of this component rather than its source code. The judge should see a correct answer, a useful visualization, a meaningful trace, or a quantitative result.


## Point 68 — Demo 4


### What this point means
This point should be understood as an engineering requirement, not merely a feature label. In SatQuery, it must have a clear input contract, a deterministic or measurable output, and a place in the end-to-end workflow.

### Implementation interpretation
Define the component as a small module with:
- explicit inputs;
- explicit outputs;
- validation rules;
- model/tool version;
- metrics;
- failure behaviour.

The component should be independently testable before it is connected to the agent.

### Why it matters for SIH
A judge should be able to see the feature working and, ideally, see a quantitative or visual proof of correctness. Features without evidence should not dominate the presentation.

### Common failure mode
Do not implement this as a black-box prompt. Keep domain-specific processing and measurable outputs outside the final language-generation layer.

### How it connects to SatQuery
The output should become structured evidence that can be consumed by the agent/evidence-fusion layer and visualized in the GUI.

### Original interpretation
Optical-SAR: demonstrate complementary evidence.


### Minimum acceptance test
Create at least one automated or manual test for this point. The test should specify the input, expected behaviour, observed output, and pass/fail result. If the point is model-related, record the metric; if it is UI-related, record the interaction; if it is geospatial, test coordinate/raster correctness.

### What the judge should see
The final demo should expose the consequence of this component rather than its source code. The judge should see a correct answer, a useful visualization, a meaningful trace, or a quantitative result.


## Point 69 — Demo 5


### What this point means
This point should be understood as an engineering requirement, not merely a feature label. In SatQuery, it must have a clear input contract, a deterministic or measurable output, and a place in the end-to-end workflow.

### Implementation interpretation
Define the component as a small module with:
- explicit inputs;
- explicit outputs;
- validation rules;
- model/tool version;
- metrics;
- failure behaviour.

The component should be independently testable before it is connected to the agent.

### Why it matters for SIH
A judge should be able to see the feature working and, ideally, see a quantitative or visual proof of correctness. Features without evidence should not dominate the presentation.

### Common failure mode
Do not implement this as a black-box prompt. Keep domain-specific processing and measurable outputs outside the final language-generation layer.

### How it connects to SatQuery
The output should become structured evidence that can be consumed by the agent/evidence-fusion layer and visualized in the GUI.

### Original interpretation
Agent routing: same interface, different question types automatically select different specialists.


### Minimum acceptance test
Create at least one automated or manual test for this point. The test should specify the input, expected behaviour, observed output, and pass/fail result. If the point is model-related, record the metric; if it is UI-related, record the interaction; if it is geospatial, test coordinate/raster correctness.

### What the judge should see
The final demo should expose the consequence of this component rather than its source code. The judge should see a correct answer, a useful visualization, a meaningful trace, or a quantitative result.


## Point 70 — What Not to Build


### Avoid these traps
**Trap 1:** Generic image chatbot.

**Trap 2:** One model renamed “agent.”

**Trap 3:** Beautiful UI with no quantitative results.

**Trap 4:** Only public benchmark screenshots.

**Trap 5:** Claims about SAR without SAR-specific validation.

**Trap 6:** Fake confidence numbers.

**Trap 7:** Giant architecture that cannot be deployed.

The winning project should be smaller internally than it appears externally: a clean set of specialist tools behind one intelligent interface.


### Minimum acceptance test
Create at least one automated or manual test for this point. The test should specify the input, expected behaviour, observed output, and pass/fail result. If the point is model-related, record the metric; if it is UI-related, record the interaction; if it is geospatial, test coordinate/raster correctness.

### What the judge should see
The final demo should expose the consequence of this component rather than its source code. The judge should see a correct answer, a useful visualization, a meaningful trace, or a quantitative result.


## Point 71 — Repository Structure


### What this point means
This point should be understood as an engineering requirement, not merely a feature label. In SatQuery, it must have a clear input contract, a deterministic or measurable output, and a place in the end-to-end workflow.

### Implementation interpretation
Define the component as a small module with:
- explicit inputs;
- explicit outputs;
- validation rules;
- model/tool version;
- metrics;
- failure behaviour.

The component should be independently testable before it is connected to the agent.

### Why it matters for SIH
A judge should be able to see the feature working and, ideally, see a quantitative or visual proof of correctness. Features without evidence should not dominate the presentation.

### Common failure mode
Do not implement this as a black-box prompt. Keep domain-specific processing and measurable outputs outside the final language-generation layer.

### How it connects to SatQuery
The output should become structured evidence that can be consumed by the agent/evidence-fusion layer and visualized in the GUI.

### Original interpretation
Separate app/frontend, API, models, data pipelines, agent, evaluation, configs and docs.


### Minimum acceptance test
Create at least one automated or manual test for this point. The test should specify the input, expected behaviour, observed output, and pass/fail result. If the point is model-related, record the metric; if it is UI-related, record the interaction; if it is geospatial, test coordinate/raster correctness.

### What the judge should see
The final demo should expose the consequence of this component rather than its source code. The judge should see a correct answer, a useful visualization, a meaningful trace, or a quantitative result.


## Point 72 — Practical Data Plan


### Week-level implementation logic
**Phase A:** schema audit + download test.

**Phase B:** single-image baseline.

**Phase C:** domain adaptation.

**Phase D:** temporal and cross-modal specialists.

**Phase E:** agent.

**Phase F:** evidence/GIS.

**Phase G:** benchmark + stress tests.

Do not start by building the final UI. Build a CLI/API proof first so model failures are measurable.


### Minimum acceptance test
Create at least one automated or manual test for this point. The test should specify the input, expected behaviour, observed output, and pass/fail result. If the point is model-related, record the metric; if it is UI-related, record the interaction; if it is geospatial, test coordinate/raster correctness.

### What the judge should see
The final demo should expose the consequence of this component rather than its source code. The judge should see a correct answer, a useful visualization, a meaningful trace, or a quantitative result.


## Point 73 — Data Download Strategy


### Large dataset reality
Use streaming and selective download. Build a manifest with sample IDs and URLs/paths. Cache only the samples needed for a given experiment.

### Reproducibility
Every experiment should be reproducible from:
`dataset_version + manifest_hash + preprocessing_version + model_version + seed`


### Minimum acceptance test
Create at least one automated or manual test for this point. The test should specify the input, expected behaviour, observed output, and pass/fail result. If the point is model-related, record the metric; if it is UI-related, record the interaction; if it is geospatial, test coordinate/raster correctness.

### What the judge should see
The final demo should expose the consequence of this component rather than its source code. The judge should see a correct answer, a useful visualization, a meaningful trace, or a quantitative result.


## Point 74 — Experiment Tracking


### Minimum experiment record
Store:
- run ID;
- code commit;
- dataset version;
- split;
- model;
- adapter/checkpoint;
- hyperparameters;
- metrics;
- latency;
- GPU;
- failure count.

A simple JSON/SQLite/MLflow setup is enough. The goal is traceability, not tooling prestige.


### Minimum acceptance test
Create at least one automated or manual test for this point. The test should specify the input, expected behaviour, observed output, and pass/fail result. If the point is model-related, record the metric; if it is UI-related, record the interaction; if it is geospatial, test coordinate/raster correctness.

### What the judge should see
The final demo should expose the consequence of this component rather than its source code. The judge should see a correct answer, a useful visualization, a meaningful trace, or a quantitative result.


## Point 75 — Core Research Question


### Strong research framing
The project can be framed as:

> Does constrained, evidence-grounded agentic routing across remote-sensing specialist models improve correctness, robustness and usability compared with a single generic VLM?

That question creates a clean experimental story and prevents the project from becoming a collection of unrelated features.


### Minimum acceptance test
Create at least one automated or manual test for this point. The test should specify the input, expected behaviour, observed output, and pass/fail result. If the point is model-related, record the metric; if it is UI-related, record the interaction; if it is geospatial, test coordinate/raster correctness.

### What the judge should see
The final demo should expose the consequence of this component rather than its source code. The judge should see a correct answer, a useful visualization, a meaningful trace, or a quantitative result.


## Point 76 — Ablation Plan


### Minimum ablations
A: generic VLM.

B: remote-sensing adapted VLM.

C: specialist models without agent.

D: specialists + constrained router.

E: full system + evidence fusion.

Compare both accuracy and reliability. If the agent does not improve anything, that is an important finding and a reason to revise the architecture.


### Minimum acceptance test
Create at least one automated or manual test for this point. The test should specify the input, expected behaviour, observed output, and pass/fail result. If the point is model-related, record the metric; if it is UI-related, record the interaction; if it is geospatial, test coordinate/raster correctness.

### What the judge should see
The final demo should expose the consequence of this component rather than its source code. The judge should see a correct answer, a useful visualization, a meaningful trace, or a quantitative result.


## Point 77 — Why It Can Stand Out


### Differentiation
The strongest differentiator is not “we use an LLM.” Many teams can say that.

The differentiator is:
**natural-language query → heterogeneous EO inputs → correct specialist workflow → spatial evidence → auditable result.**

That is a coherent product and research contribution.


### Minimum acceptance test
Create at least one automated or manual test for this point. The test should specify the input, expected behaviour, observed output, and pass/fail result. If the point is model-related, record the metric; if it is UI-related, record the interaction; if it is geospatial, test coordinate/raster correctness.

### What the judge should see
The final demo should expose the consequence of this component rather than its source code. The judge should see a correct answer, a useful visualization, a meaningful trace, or a quantitative result.


## Point 78 — Risk: Dataset Size

> **[AUDIT · gap]** LoRA/PEFT on a balanced subset is the right approach, but no **compute budget** appears anywhere in this document: no GPU model, no VRAM figure, no expected wall-clock for an adaptation run, no fallback if the available hardware cannot fit the chosen backbone. With the SIH portal closing **20 September 2026**, compute is the binding practical constraint, not dataset size. State the hardware the team actually has and size the subset to it.


### Mitigation
Use:
- metadata-first workflow;
- streaming;
- balanced subsets;
- LoRA;
- mixed precision;
- gradient accumulation;
- cached embeddings where valid.

Do not waste compute on samples that do not improve the validation set.


### Minimum acceptance test
Create at least one automated or manual test for this point. The test should specify the input, expected behaviour, observed output, and pass/fail result. If the point is model-related, record the metric; if it is UI-related, record the interaction; if it is geospatial, test coordinate/raster correctness.

### What the judge should see
The final demo should expose the consequence of this component rather than its source code. The judge should see a correct answer, a useful visualization, a meaningful trace, or a quantitative result.


## Point 79 — Risk: SAR Difficulty


### Mitigation
Treat SAR as its own engineering track. Start with a pretrained SAR-capable encoder or representation model where licensing permits. Validate on SAR examples separately before fusion.

If SAR performance is weak, the system should reduce confidence rather than hallucinate optical-like semantics.


### Minimum acceptance test
Create at least one automated or manual test for this point. The test should specify the input, expected behaviour, observed output, and pass/fail result. If the point is model-related, record the metric; if it is UI-related, record the interaction; if it is geospatial, test coordinate/raster correctness.

### What the judge should see
The final demo should expose the consequence of this component rather than its source code. The judge should see a correct answer, a useful visualization, a meaningful trace, or a quantitative result.


## Point 80 — Risk: Registration


### Mitigation
Make registration a first-class validation step. Store a registration quality score/flag. Add a visual overlay in the UI.

If alignment is poor, route to a safe fallback or ask the user for corrected inputs.


### Minimum acceptance test
Create at least one automated or manual test for this point. The test should specify the input, expected behaviour, observed output, and pass/fail result. If the point is model-related, record the metric; if it is UI-related, record the interaction; if it is geospatial, test coordinate/raster correctness.

### What the judge should see
The final demo should expose the consequence of this component rather than its source code. The judge should see a correct answer, a useful visualization, a meaningful trace, or a quantitative result.


## Point 81 — Risk: Hidden ISRO Data


### Mitigation
Optimize for generalization rather than leaderboard memorization. Use geographic holdouts and modality stress tests. Keep one internal “never tune on this” validation split to estimate how much your public benchmark tuning may be overfitting.


### Minimum acceptance test
Create at least one automated or manual test for this point. The test should specify the input, expected behaviour, observed output, and pass/fail result. If the point is model-related, record the metric; if it is UI-related, record the interaction; if it is geospatial, test coordinate/raster correctness.

### What the judge should see
The final demo should expose the consequence of this component rather than its source code. The judge should see a correct answer, a useful visualization, a meaningful trace, or a quantitative result.


## Point 82 — Risk: Hallucination


### Mitigation
Force important claims through structured evidence. Require every spatial claim to have a spatial source. Use abstention thresholds and calibrated confidence.

A system that says “I cannot reliably determine this” can score better operationally than a system that confidently fabricates.


### Minimum acceptance test
Create at least one automated or manual test for this point. The test should specify the input, expected behaviour, observed output, and pass/fail result. If the point is model-related, record the metric; if it is UI-related, record the interaction; if it is geospatial, test coordinate/raster correctness.

### What the judge should see
The final demo should expose the consequence of this component rather than its source code. The judge should see a correct answer, a useful visualization, a meaningful trace, or a quantitative result.


## Point 83 — Risk: Agent Failure


### Mitigation
Constrain the agent:
- finite tool registry;
- typed schemas;
- deterministic validation;
- retry limits;
- timeouts;
- fallback routing;
- execution logs.

The agent should be a controlled orchestration engine, not an autonomous programmer.


### Minimum acceptance test
Create at least one automated or manual test for this point. The test should specify the input, expected behaviour, observed output, and pass/fail result. If the point is model-related, record the metric; if it is UI-related, record the interaction; if it is geospatial, test coordinate/raster correctness.

### What the judge should see
The final demo should expose the consequence of this component rather than its source code. The judge should see a correct answer, a useful visualization, a meaningful trace, or a quantitative result.


## Point 84 — Winner Thinking — What Past Winners Reveal


### Deep lesson
The relevant lesson from previous ISRO/SIH winners is not that they used a particular framework. It is how they **translated a technical PS into an operational workflow**.

For PS1738, the official ISRO/SAC listing described “Innovative applications of cloud-optimized geotiffs for INSAT satellite data.” The winning Vistaar/Cloudweave story emphasized making INSAT data operationally useful through cloud-native access, manipulation and APIs. The lesson is: do not stop at the underlying technology; solve the analyst workflow around it.

> **[AUDIT · U — Contradicted by sources]** Two separate claims here, and they do not both hold.
>
> **Holds:** SIH1738 is genuinely titled "Innovative applications of cloud-optimized geotiffs for INSAT satellite data" (ISRO/SAC listing, <https://vedas.sac.gov.in/en/sih2024.html>).
>
> **Does not hold:** the "winning Vistaar/Cloudweave story" for PS1738. **Team CloudWeave (MIT-WPU) worked on SIH1736** — "AI-based frame interpolation, video generation and display system for WMS services" — a different ISRO problem statement. No source associates CloudWeave with SIH1738. No source for a winning team named "Vistaar" on this PS was found at all. This conflates two problem statements and attributes a winner's approach to the wrong one. **Delete or re-source before anyone repeats it to a judge.**

For PS1732, the winning Chandrakriti effort focused on enhancement of lunar permanently shadowed-region imagery. The public winner account emphasized sustained image-processing research and domain learning. The lesson is: understand the imaging problem and validate the processing pipeline, rather than presenting an AI wrapper.

Sources: ISRO/SAC SIH 2024 listing citeturn0search3 and public winner accounts referenced in the project research.

> **[AUDIT · U]** "Public winner accounts referenced in the project research" is not a citation — no such account is named, linked, or quoted anywhere in this document. The one checkable half of the sentence (the ISRO/SAC listing) sits behind a broken `citeturn` artifact rather than a URL.


### Minimum acceptance test
Create at least one automated or manual test for this point. The test should specify the input, expected behaviour, observed output, and pass/fail result. If the point is model-related, record the metric; if it is UI-related, record the interaction; if it is geospatial, test coordinate/raster correctness.

### What the judge should see
The final demo should expose the consequence of this component rather than its source code. The judge should see a correct answer, a useful visualization, a meaningful trace, or a quantitative result.


## Point 85 — Winner Thinking — Research Depth


### What “research depth” should look like
Research depth does not mean adding 20 papers to the PPT. It means being able to answer:
- Why this model?
- Why this preprocessing?
- Why this split?
- Why this metric?
- Where does it fail?
- What changes after domain adaptation?
- Does multimodal fusion actually improve results?

For every major design choice, create a baseline and an ablation.


### Minimum acceptance test
Create at least one automated or manual test for this point. The test should specify the input, expected behaviour, observed output, and pass/fail result. If the point is model-related, record the metric; if it is UI-related, record the interaction; if it is geospatial, test coordinate/raster correctness.

### What the judge should see
The final demo should expose the consequence of this component rather than its source code. The judge should see a correct answer, a useful visualization, a meaningful trace, or a quantitative result.


## Point 86 — Winner Thinking — Productization


### Productization pattern
A winning technical system should be demonstrable as a workflow:
`input → processing → evidence → decision`

SatQuery should therefore include a polished happy path, but also expose real technical controls and failure handling underneath.


### Minimum acceptance test
Create at least one automated or manual test for this point. The test should specify the input, expected behaviour, observed output, and pass/fail result. If the point is model-related, record the metric; if it is UI-related, record the interaction; if it is geospatial, test coordinate/raster correctness.

### What the judge should see
The final demo should expose the consequence of this component rather than its source code. The judge should see a correct answer, a useful visualization, a meaningful trace, or a quantitative result.


## Point 87 — Winner Thinking — The 'Operational Gap' Test


### Use this test for every feature
Ask: “If this feature disappeared, would the analyst's workflow become harder?”

If the answer is no, remove it.

Examples:
- fancy 3D globe: low priority;
- evidence overlays: high priority;
- exportable analysis report: high priority;
- arbitrary chatbot personality: low priority;
- modality validation: high priority.


### Minimum acceptance test
Create at least one automated or manual test for this point. The test should specify the input, expected behaviour, observed output, and pass/fail result. If the point is model-related, record the metric; if it is UI-related, record the interaction; if it is geospatial, test coordinate/raster correctness.

### What the judge should see
The final demo should expose the consequence of this component rather than its source code. The judge should see a correct answer, a useful visualization, a meaningful trace, or a quantitative result.


## Point 88 — Winner Thinking — Avoiding Generic AI


### The anti-wrapper rule
For every AI component, document the remote-sensing-specific adaptation:
- EO data normalization;
- sensor-aware model;
- domain vocabulary;
- geospatial evidence;
- temporal pairing;
- SAR handling;
- benchmark evaluation.

If a component could be removed and replaced by a generic chatbot API without changing the architecture, it is probably not your core innovation.


### Minimum acceptance test
Create at least one automated or manual test for this point. The test should specify the input, expected behaviour, observed output, and pass/fail result. If the point is model-related, record the metric; if it is UI-related, record the interaction; if it is geospatial, test coordinate/raster correctness.

### What the judge should see
The final demo should expose the consequence of this component rather than its source code. The judge should see a correct answer, a useful visualization, a meaningful trace, or a quantitative result.


## Point 89 — Winner Thinking — Evaluation First


### Why evaluation should precede polish
The hidden evaluation means a polished demo can still fail. Establish baselines early and keep a benchmark dashboard visible in development.

Recommended dashboard:
`VQA | Grounding | Change | Cross-modal | Routing | Calibration | Latency | Abstention`


### Minimum acceptance test
Create at least one automated or manual test for this point. The test should specify the input, expected behaviour, observed output, and pass/fail result. If the point is model-related, record the metric; if it is UI-related, record the interaction; if it is geospatial, test coordinate/raster correctness.

### What the judge should see
The final demo should expose the consequence of this component rather than its source code. The judge should see a correct answer, a useful visualization, a meaningful trace, or a quantitative result.


## Point 90 — Winner Thinking — Judge Demo Narrative


### The narrative should escalate
Do not start with the hardest example.

1. Show a simple VQA answer.
2. Show visual grounding.
3. Show temporal change.
4. Add optical-SAR.
5. Show the agent changing tools automatically.
6. End with quantitative evidence.

The judge first understands the product, then sees the technical depth.


### Minimum acceptance test
Create at least one automated or manual test for this point. The test should specify the input, expected behaviour, observed output, and pass/fail result. If the point is model-related, record the metric; if it is UI-related, record the interaction; if it is geospatial, test coordinate/raster correctness.

### What the judge should see
The final demo should expose the consequence of this component rather than its source code. The judge should see a correct answer, a useful visualization, a meaningful trace, or a quantitative result.


## Point 91 — Winner Thinking — Presentation Architecture


### Slide story
1. Problem: fragmented EO analysis.
2. Why current generic VLMs fail.
3. SatQuery concept.
4. Architecture.
5. Dataset/training.
6. Specialist models.
7. Agentic routing.
8. Evidence/GIS.
9. Benchmark/ablation.
10. Hidden-evaluation generalization strategy.
11. Live demo.
12. Deployment/impact.

Every slide should answer one judge question.


### Minimum acceptance test
Create at least one automated or manual test for this point. The test should specify the input, expected behaviour, observed output, and pass/fail result. If the point is model-related, record the metric; if it is UI-related, record the interaction; if it is geospatial, test coordinate/raster correctness.

### What the judge should see
The final demo should expose the consequence of this component rather than its source code. The judge should see a correct answer, a useful visualization, a meaningful trace, or a quantitative result.


## Point 92 — Winner Thinking — Team Capability Mapping


### Suggested ownership
**ML/VLM:** adaptation, specialist models, metrics.

**Remote sensing:** sensor semantics, preprocessing, registration.

**Geospatial:** CRS, raster/vector operations, map rendering.

**Backend/agent:** tool registry, routing, queues, APIs.

**Frontend:** visualization and interaction.

**Evaluation lead:** datasets, splits, reproducibility, benchmark dashboard.

One person can own multiple areas in a small team, but every responsibility must have an owner.


### Minimum acceptance test
Create at least one automated or manual test for this point. The test should specify the input, expected behaviour, observed output, and pass/fail result. If the point is model-related, record the metric; if it is UI-related, record the interaction; if it is geospatial, test coordinate/raster correctness.

### What the judge should see
The final demo should expose the consequence of this component rather than its source code. The judge should see a correct answer, a useful visualization, a meaningful trace, or a quantitative result.


## Point 93 — Final Recommended Solution


### The final architecture in one sentence
SatQuery is an **evidence-grounded geospatial copilot** that turns natural-language questions into constrained workflows over remote-sensing specialist models.

### The four pillars
1. **Remote-sensing adaptation**
2. **Specialist task models**
3. **Constrained agentic orchestration**
4. **Evidence + geospatial visualization**

Everything else supports these pillars.


### Minimum acceptance test
Create at least one automated or manual test for this point. The test should specify the input, expected behaviour, observed output, and pass/fail result. If the point is model-related, record the metric; if it is UI-related, record the interaction; if it is geospatial, test coordinate/raster correctness.

### What the judge should see
The final demo should expose the consequence of this component rather than its source code. The judge should see a correct answer, a useful visualization, a meaningful trace, or a quantitative result.


## Point 94 — Winning Definition


### What “winning” should mean
A judge should be able to watch the system perform an end-to-end task and immediately understand:
- what the user asked;
- why that workflow was selected;
- what model/tool executed;
- where the evidence is;
- how confident the system is;
- how performance was measured.

The final message should therefore not be “our AI is intelligent.” It should be:

> **SatQuery converts heterogeneous satellite analysis into a measurable, auditable, natural-language workflow.**


### Minimum acceptance test
Create at least one automated or manual test for this point. The test should specify the input, expected behaviour, observed output, and pass/fail result. If the point is model-related, record the metric; if it is UI-related, record the interaction; if it is geospatial, test coordinate/raster correctness.

### What the judge should see
The final demo should expose the consequence of this component rather than its source code. The judge should see a correct answer, a useful visualization, a meaningful trace, or a quantitative result.


# 3. Dataset Deep Dive

## 3.1 BigEarthNet.txt — Primary Adaptation Dataset

BigEarthNet.txt is particularly important because the PS does not merely ask for a generic image-language model. It asks for **remote-sensing adaptation**, and BigEarthNet.txt was designed exactly around large-scale Earth-observation image-text learning.

The project reports **464,044 co-registered Sentinel-1 (SAR) and Sentinel-2 (multispectral) images**, producing approximately **9.6 million S1-S2-text triplets**. The annotations include geographically anchored captions, VQA-style annotations and referring-expression instructions for bounding-box prediction. It supports 15 tasks across four broad categories. citeturn0search1turn0academia82

> **[AUDIT · V — Verified]** 464,044 co-registered S1/S2 images, ~9.6M S1-S2-text triplets, annotations covering geographically anchored captions, binary and multiple-choice VQA, and referring expressions for LULC localisation, spanning **15 tasks across 4 broad categories** (Presence, Area, Counting, Adjacency, Relative Position, Country, Season, Climate Zone among them). All confirmed at <https://txt.bigearth.net/>.

### Why the number 9.6M must be interpreted correctly

Do not tell judges:

> “There are 9.6 million satellite images.”

That is incorrect.

The approximately 9.6M figure refers to **S1-S2-text triplets/annotations**. The core image collection is 464,044 co-registered image pairs. citeturn0search1

> **[AUDIT · V — Verified, and the best paragraph in this document.]** The distinction is real and correctly drawn. Note the small slip: "triplets/annotations" conflates two things one sentence after separating them. It is triplets. Point 25 gets this wrong — fix it there.

This distinction demonstrates dataset literacy.

### What we should extract

At minimum, create a manifest:

```json
{
  "sample_id": "...",
  "sentinel1": "...",
  "sentinel2": "...",
  "texts": [...],
  "task": "...",
  "split": "...",
  "geography": "...",
  "metadata": {...}
}
```

### Recommended training use

Do not immediately attempt full-scale training.

Start with:

```text
BigEarthNet metadata audit
        ↓
task distribution analysis
        ↓
balanced subset
        ↓
baseline
        ↓
LoRA/PEFT adaptation
        ↓
held-out validation
        ↓
scale only if metrics improve
```

### Why it is strategically valuable

BigEarthNet.txt connects:
- optical/multispectral information;
- SAR information;
- language;
- spatial relationships;
- remote-sensing concepts.

That aligns unusually well with SatQuery.

---

## 3.2 VRSBench

VRSBench is a benchmark specifically designed for remote-sensing image understanding. It contains:
- 29,614 remote-sensing images;
- 29,614 human-verified detailed captions;
- 52,472 object references;
- 123,221 visual question-answer pairs.

> **[AUDIT · V — Verified]** All four VRSBench figures confirmed against the paper and project page. Both URLs in §16 resolve (HTTP 200).

It evaluates **image captioning, visual grounding and VQA**. citeturn0search2turn0search5

This is almost a direct match to SatQuery's single-image baseline.

### Why grounding is especially valuable

Captioning produces text.

Grounding produces:

```text
query
  ↓
object/region
  ↓
bounding box / mask
  ↓
visual evidence
```

For an SIH judge, this is much easier to verify visually.

---

## 3.3 RSVQA

RSVQA is named by the PS specifically for VQA evaluation.

> **[AUDIT · V]** Correct — the PS names RSVQA for VQA evaluation. The per-run logging schema proposed below (question, reference, prediction, normalised answer, correctness, question type, model version, confidence) is sound practice and worth keeping. Per-category reporting is the right instinct, especially given RSVQA-LR's skew toward comparison and count questions.

The key engineering principle is to use the prescribed public evaluation protocol rather than creating a convenient private metric.

For each VQA run, store:
- question;
- reference answer;
- predicted answer;
- normalized answer;
- correctness;
- question type;
- model version;
- confidence.

Then calculate per-category performance rather than only one overall number.

---

## 3.4 CDVQA

CDVQA is the temporal reasoning component.

The important conceptual distinction is:

```text
Image difference ≠ Change understanding
```

A simple pixel difference may show that pixels changed.

But the user asks:

> “What changed?”

The system must interpret that difference semantically.

A stronger pipeline is:

```text
T1
+
T2
↓
change localization
↓
changed regions
↓
semantic interpretation
↓
natural-language answer
```

This is the kind of architecture that separates SatQuery from a basic computer-vision demo.

---

# 4. Hidden ISRO/SAC Evaluation — The Part We Must Take Seriously

The PS states that the ISRO/SAC evaluation set contains **pre-georeferenced and co-registered Cartosat-2S optical and RISAT SAR image pairs** with task-specific reference answers, labels, bounding boxes or masks, as applicable, and that evaluation annotations are not disclosed.

> **[AUDIT · V for the statement, but the section badly under-states the severity.]**
>
> "Distribution robustness" is too soft a phrase for what is actually a three-way domain gap between everything this document proposes to train on and the thing it will be scored on:
>
> | | Adaptation / benchmark data | Hidden ISRO/SAC evaluation |
> |---|---|---|
> | Optical resolution | Sentinel-2 at **10 m** (BigEarthNet, RSVQA-LR) | **Cartosat-2S, sub-metre** |
> | SAR | Sentinel-1 C-band VV/VH | **RISAT**, different modes and acquisition geometry |
> | Geography | Europe (BigEarthNet), **Netherlands only** (RSVQA-LR), aerial US/CN (SECOND→CDVQA) | **India** |
> | Change benchmark | Aerial RGB, 6 land-cover classes | Spaceborne optical + SAR pairs |
>
> That is roughly two orders of magnitude of resolution shift, plus a sensor shift, plus a geography shift. No amount of agent orchestration compensates for it. The stress-test list below (registration perturbations, optical-only, SAR-only, small/large objects) is a reasonable start but does not simulate a resolution jump from 10 m to sub-metre. **Concrete fix:** build a held-out validation set by downsampling a public sub-metre Indian source, or hold out the BigEarthNet.txt verified split by geography, and report the drop explicitly. A team that measures and reports its own domain gap outscores one that is silently surprised by it.

This creates a fundamental strategic constraint:

> We cannot optimize directly against the final labels.

Therefore our real objective should be **distribution robustness**.

### Internal stress-test suite

Create variations such as:
- different geographic areas;
- small/large objects;
- low/high contrast;
- cloud/haze where relevant;
- registration perturbations;
- optical-only;
- SAR-only;
- optical + SAR;
- small changes;
- large changes;
- ambiguous questions.

If the model survives these, it has a better chance of surviving the hidden evaluation.

---

# 5. Detailed Agent Design

## 5.1 Tool Registry

> **[AUDIT · gap]** The registry is placeholders — `rs_vqa`, `grounding`, `change_vqa`, `optical_sar`, and elsewhere `change-v2`. **No base model is named anywhere in this document.** Model selection is the single highest-leverage decision in this PS and it is left blank. At minimum the document should shortlist and justify candidates for the remote-sensing-adapted VLM (GeoChat, RS-LLaVA, EarthGPT, LHRS-Bot, SkySenseGPT are the obvious starting points), the grounding component, and the change model, with licence and offline-packaging status for each. Until that is decided, Phases 1-5 in §8 cannot be scheduled.

Example:

```python
TOOLS = {
    "rs_vqa": {
        "tasks": ["single_vqa"],
        "modalities": ["optical", "sar"]
    },

    "grounding": {
        "tasks": ["grounding"],
        "modalities": ["optical"]
    },

    "change_vqa": {
        "tasks": ["temporal_change", "temporal_change_vqa"],
        "modalities": ["optical_pair"]
    },

    "optical_sar": {
        "tasks": ["cross_modal"],
        "modalities": ["optical_sar_pair"]
    }
}
```

The LLM never invents a new tool.

It chooses from this registry.

---

# 6. Evidence Schema

Use one normalized evidence format:

```json
{
  "claim": "Built-up area increased",
  "confidence": 0.82,
  "source": {
    "model": "change-v2",
    "version": "1.3"
  },
  "spatial_evidence": [
    {
      "geometry": "...",
      "crs": "EPSG:4326",
      "score": 0.91
    }
  ],
  "temporal_evidence": {
    "before": "T1",
    "after": "T2"
  }
}
```

This is the bridge between ML and the product.

---

# 7. Winner-Style Interpretation of the PS

## 7.1 The key lesson from previous ISRO/SIH winners

The official ISRO/SAC SIH 2024 page lists PS1738 as “Innovative applications of cloud-optimized geotiffs for INSAT satellite data.” citeturn0search3

> **[AUDIT · V for the title, U for the lesson.]** The PS1738 title is verbatim correct and the ISRO/SAC page resolves. But the "lesson" that follows is inferred **from a problem-statement title alone** — no winning solution for PS1738 is examined, quoted, or linked anywhere. The advice it arrives at (solve the user's workflow, not just the named technology) is good advice, and it is good advice independent of PS1738. Present it as a principle, not as evidence from precedent, or a judge who knows that PS will ask what the winning solution actually did.

The lesson from that class of solution is:

> **Do not solve only the technology named in the PS. Solve the user's workflow around that technology.**

For SatQuery, that means:

Bad:
> “We fine-tuned a VLM.”

Better:
> “We let an analyst ask a satellite question without manually choosing remote-sensing models.”

Best:
> “We convert heterogeneous satellite observations into an auditable natural-language analysis workflow, with spatial evidence and automatic specialist routing.”

---

## 7.2 The Chandrakriti-style lesson

> **[AUDIT · U — Unverified]** No source found linking a project named "Chandrakriti" to the SIH 2024 lunar PSR problem. The underlying PS is real — **SIH1732**, "Enhancement of Permanently Shadowed Regions (PSR) of Lunar Craters Captured by OHRC of Chandrayaan-2" (ISRO) — and public solutions to it exist, but the named project and the "winning pattern" attributed to it are unsupported. As with §7.1, the conclusion (domain understanding plus sustained experimentation beats bolting on a generic model) is sound; the evidence offered for it is not. Either source it or drop the name and keep the principle.

For image-processing-heavy space problems such as the lunar PSR enhancement problem, the winning pattern was domain understanding plus sustained experimentation rather than merely attaching a generic AI model.

For SatQuery, therefore, the team must understand:
- SAR;
- multispectral imagery;
- co-registration;
- temporal change;
- geospatial coordinates;
- remote-sensing terminology;
- VQA/grounding;
- benchmark methodology.

The model is only one part of the solution.

---

# 8. What We Should Build First

## Phase 1 — No Agent

> **[AUDIT · sequencing risk]** The five phases carry **no dates and no owners**, and the portal closes **20 September 2026**. More seriously, Phase 5 — the agentic router — is scheduled **last**, which means the project's only genuine differentiator is the first thing sacrificed when the schedule slips. The stated reason for ordering it last (an agent can hide model weaknesses) is legitimate, so the fix is not to reorder but to build a deliberately trivial router in Phase 1 — a hard-coded if/else over task type — so that end-to-end routing exists from day one and Phase 5 replaces rather than introduces it.

Build:

```text
GeoTIFF
↓
VQA
↓
answer
```

Get a baseline.

## Phase 2 — Grounding

```text
query
↓
grounding
↓
box/mask
```

## Phase 3 — Temporal

```text
T1 + T2
↓
change model
↓
change map
```

## Phase 4 — Optical-SAR

```text
optical + SAR
↓
fusion
↓
evidence
```

## Phase 5 — Agent

Only now:

```text
query
↓
router
↓
correct tool
```

This order is important because otherwise the agent can hide model weaknesses.

---

# 9. Baseline vs Winning System

| System | RS Adaptation | Specialist Models | Agent | Evidence | Temporal | Optical-SAR |
|---|---:|---:|---:|---:|---:|---:|
| Generic VLM | ❌ | ❌ | ❌ | Weak | Weak | Weak |
| Adapted VLM | ✅ | ❌ | ❌ | Medium | Medium | Medium |
| Specialist pipeline | ✅ | ✅ | ❌ | Strong | Strong | Strong |
| **SatQuery target** | **✅** | **✅** | **✅** | **Strong** | **Strong** | **Strong** |

This table should eventually become one of the core presentation slides.

---

# 10. Quantitative Evaluation Dashboard

The final dashboard should look conceptually like:

```text
Single-image VQA        ████████████████  XX.X%
Grounding IoU           ██████████████   XX.X
Change F1               █████████████    XX.X
Change VQA              ██████████████   XX.X%
Optical-SAR             █████████████    XX.X
Router Accuracy         ███████████████  XX.X%
Calibration Error       ███              X.XX
p50 Latency             XX sec
p95 Latency             XX sec
Abstention Precision    XX.X%
```

Do not invent these numbers.

Populate them only after experiments.

---

# 11. The Ablation That Can Make the Project Look Like Research

Run:

### Experiment A
Generic VLM.

### Experiment B
Remote-sensing adapted VLM.

### Experiment C
Specialist models without agent.

### Experiment D
Specialists + router.

### Experiment E
Specialists + router + evidence fusion.

Then ask:

> Does each layer actually improve correctness/reliability?

If yes, the architecture has empirical justification.

If not, remove or redesign the component.

---

# 12. Final Winning Architecture

```text
                    ┌───────────────────────────┐
                    │        SATQUERY AI        │
                    └─────────────┬─────────────┘
                                  │
                      Natural Language Query
                                  │
                                  ▼
                    ┌───────────────────────────┐
                    │ Query Understanding Layer │
                    └─────────────┬─────────────┘
                                  │
                                  ▼
                    ┌───────────────────────────┐
                    │ Input Compatibility Guard │
                    └─────────────┬─────────────┘
                                  │
                                  ▼
                    ┌───────────────────────────┐
                    │ Constrained Agent Router  │
                    └─────────────┬─────────────┘
                                  │
            ┌─────────────────────┼─────────────────────┐
            ▼                     ▼                     ▼
       RS-VQA/VLM             Grounding             Change
            │                     │                     │
            └─────────────────────┼─────────────────────┘
                                  ▼
                       Optical-SAR Fusion
                                  │
                                  ▼
                        Evidence Normalizer
                                  │
                    ┌─────────────┴─────────────┐
                    ▼                           ▼
             Natural Answer               GIS Evidence
                    │                           │
                    └─────────────┬─────────────┘
                                  ▼
                         Audit / Report Layer
```

---

# 13. Final Strategic Conclusion

The winning version of PS26167 is **not**:

> “ChatGPT for satellite images.”

It is:

> **“A remote-sensing analysis operating layer where natural-language queries automatically trigger the right domain-adapted models, combine multimodal/temporal evidence, and return an auditable geospatial answer.”**

That gives the project a coherent story:

```text
Fragmented EO tools
        ↓
Natural-language interface
        ↓
Automatic task understanding
        ↓
Specialist model selection
        ↓
Multimodal / temporal reasoning
        ↓
Evidence grounding
        ↓
GIS visualization
        ↓
Auditable report
```

That is the standard we should build toward.

---

# 14. Final 10 Rules for the Team

1. **Never call a generic VLM adaptation.**
2. **Never let the LLM invent spatial evidence.**
3. **Never hide benchmark numbers.**
4. **Never tune on hidden evaluation data.**
5. **Never treat SAR as grayscale RGB.**
6. **Never ignore co-registration.**
7. **Never expose fake agent reasoning.**
8. **Never let the agent execute arbitrary tools.**
9. **Never build UI before proving the model pipeline.**

> **[AUDIT · contradicts the PS]** The PS names "an interactive GUI or web application with an agentic remote-sensing AI backend" as a **graded deliverable**, and §15 of this very document defines "done" almost entirely through what a judge can click. Taken literally this rule risks a strong pipeline with no demonstrable front end at the finale. Restate it as sequencing (do not *polish* UI before the pipeline is proven) rather than prohibition.
10. **Never pitch “AI” as the innovation; pitch the operational workflow.**

---

# 15. Final Definition of Done

SatQuery is ready for the SIH final demo when a fresh judge can:

- upload a valid optical image;
- ask a natural-language VQA question;
- receive a correct answer;
- request grounding and see the relevant region;
- upload two temporal images;
- ask what changed;
- see a spatial change result;
- upload optical + SAR;
- ask a cross-modal question;
- see the system automatically select appropriate tools;
- inspect the observable execution trace;
- see confidence and evidence;
- download a report;
- see benchmark/ablation results;
- understand why the system is better than a generic VLM.

If any one of these is missing, the team should treat it as a remaining engineering gap.

---

# 16. Sources and Further Reading

- BigEarthNet.txt project: https://txt.bigearth.net/
- BigEarthNet.txt paper: https://arxiv.org/abs/2603.29630
- VRSBench project: https://vrsbench.github.io/
- VRSBench repository: https://github.com/lx709/VRSBench
- VRSBench NeurIPS 2024: https://proceedings.neurips.cc/paper_files/paper/2024/hash/05b7f821234f66b78f99e7803fffa78a-Abstract-Datasets_and_Benchmarks_Track.html
- ISRO/SAC SIH 2024: https://vedas.sac.gov.in/vcms/en/sih2024.html
- PS26167 public mirror used for cross-checking: https://sih-fit.vercel.app/problem/SIH26167

---

# Completeness Verification

- **94/94 analytical points preserved and individually expanded.**

> **[AUDIT · U — False]** See the audit note at the top of the document. 39 of 94 points are individually expanded; 55 are boilerplate. The two claims immediately below this line — that each point has an explanation and an acceptance-test requirement — are technically true only because the same generic acceptance-test paragraph is pasted 94 times. The final bullet, "No benchmark performance numbers are fabricated," **is accurate and worth keeping**: the metrics dashboard in §10 correctly ships with `XX.X` placeholders and an explicit instruction not to invent values.
- Each point has an explanation and an acceptance-test requirement.
- Core PS requirements are explicitly decomposed.
- Dataset strategy is separated from model strategy.
- Public benchmarks are separated from hidden ISRO/SAC evaluation.
- Agentic orchestration is defined as constrained tool selection rather than generic chatbot prompting.
- Winner-thinking is applied to architecture, demo and evaluation.
- No benchmark performance numbers are fabricated.
