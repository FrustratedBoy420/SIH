// Single source for the SatQuery AI technical report.
// Consumed by build.mjs (HTML -> PDF) and docx.mjs (Word).
//
// Inline markup inside strings:
//   **bold**   *italic*   ~code~   [text](https://url)   [12] -> citation link to reference 12

export const meta = {
  title: "SatQuery AI",
  subtitle: "An Agentic Vision-Language Assistant for Multimodal Remote-Sensing Image Analysis through Text Queries",
  docType: "Technical Report — Approach, Architecture and Evidence",
  team: "BUGHEBUG",
  psId: "26167",
  org: "Indian Space Research Organisation (ISRO)",
  dept: "Department of Space",
  theme: "Space Technology",
  category: "Software",
  event: "Smart India Hackathon 2026",
  date: "26 September 2026",
  version: "1.0",
};

// Figures that use a screenshot reference this folder (relative to report/).
export const ASSET_DIR = "assets";

export const blocks = [
  // ───────────────────────────────────────────── DOCUMENT CONTROL
  { h: 1, text: "Document Control", id: "doc-control", unnumbered: true },
  {
    table: {
      head: ["Field", "Value"],
      widths: [0.3, 0.7],
      rows: [
        ["Document", "SatQuery AI — Technical Report: Approach, Architecture and Evidence"],
        ["Problem Statement", "PS 26167 · SatQuery AI — An Interactive Vision-Language Assistant for Multimodal Remote Sensing Image Analysis through Text Queries"],
        ["Organisation", "Indian Space Research Organisation (ISRO), Department of Space"],
        ["Theme / Category", "Space Technology / Software"],
        ["Team", "**BUGHEBUG**"],
        ["Version / Date", "1.0 / 26 September 2026"],
        ["Status", "Submission baseline. Every number in this report was measured; none is a target presented as a result."],
        ["Source of record", "The team repository: ~167/docs/~ (problem statement, PRD, TRD, system design, ADRs, decision record) and ~167/models/MANIFEST.md~ (measured model results)."],
      ],
    },
  },
  { h: 3, text: "How to read this report", unnumbered: true },
  { p: "The report is written so that a reader with no background in satellite imagery or machine learning can follow the whole approach. Section 1 explains the problem, Section 2 teaches the minimum domain knowledge needed, and Sections 3 onward describe what we built, why, and how well it works. A reader in a hurry should read the **Executive Summary**, then **Section 3.2** (how a question travels through the system) and **Section 8** (results)." },
  {
    table: {
      head: ["Label", "Meaning in this report"],
      widths: [0.22, 0.78],
      rows: [
        ["**Built**", "Implemented, running in the repository, and covered by tests."],
        ["**Measured**", "A number produced by a script whose predictions are stored on disk and can be recomputed."],
        ["**Planned**", "Designed and specified, not yet implemented. Always labelled as such."],
        ["**Synthetic**", "Demo scenes whose pixels are generated, because Cartosat-2S and RISAT imagery is not publicly available. The algorithms that read those pixels are real."],
        ["[n]", "A citation to entry n in Section 15, *Research and References*. Every reference carries a hyperlink."],
      ],
    },
  },
  { pagebreak: true },

  // ───────────────────────────────────────────── INDEX (TOC)
  { toc: true },
  { pagebreak: true },

  // ───────────────────────────────────────────── EXECUTIVE SUMMARY
  { h: 1, text: "Executive Summary", id: "exec", unnumbered: true },
  { p: "Satellite imagery answers questions that matter to India every day — how far a flood has spread, how much a city has grown, whether a forest is intact — but today each answer needs a specialist who knows which software, model and parameters to use. **SatQuery AI removes that barrier.** A user uploads imagery and asks in plain English; the system picks the right remote-sensing specialist, checks that the imagery can answer the question, and returns the answer with its evidence: a map, a calibrated confidence value and an auditable record of exactly what ran." },
  { callout: { kind: "key", title: "The rule that governs the whole design", text: "**Vision models produce the facts. The language layer only phrases them. Never the reverse.** The component that writes the answer receives validated measurements and never sees a pixel, so it cannot invent a number that no model measured." } },
  { kpis: [
    { v: "+13.3 pts", l: "Measured gain from remote-sensing adaptation (VQA 0.527 → 0.660)" },
    { v: "p = 1.2e-35", l: "Paired McNemar significance of that gain on 2,000 held-out items" },
    { v: "0.107 %", l: "Share of model parameters trained (QLoRA adapter, 20 MB)" },
    { v: "0 of 29,614", l: "Images shared between training and evaluation splits (counted)" },
  ] },
  { h: 3, text: "What ISRO asked for, and what we deliver", unnumbered: true },
  {
    table: {
      head: ["#", "Mandatory capability (PS 26167)", "Our answer", "State"],
      widths: [0.05, 0.3, 0.45, 0.2],
      rows: [
        ["1", "Remote-sensing adaptation of at least one visual / vision-language component", "**M1**: a QLoRA adapter on Qwen2-VL-7B trained on VRSBench; zero-shot 0.5270 → adapted 0.6600", "**Built · Measured**"],
        ["2", "Single-image VQA plus one more single-image task", "VQA (M1 + classical measurement) and text-guided **region grounding** with georeferenced boxes", "**Built**"],
        ["3", "Bi-temporal change analysis", "Change detection, change description and change-VQA with a change map in hectares", "**Built** (classical)"],
        ["4", "Optical–SAR cross-modal analysis", "Separate SAR path (speckle filter, backscatter) and late fusion; quantifies built-up area hidden under cloud", "**Built** (classical)"],
        ["5", "Agentic orchestration", "A constrained router: classify → validate → select from a fixed registry → sequence → execute, with a full execution trace", "**Built**"],
      ],
    },
  },
  { h: 3, text: "Why it is different", unnumbered: true },
  { ul: [
    "**It refuses impossible questions before any model runs** — and tells the user what to upload instead.",
    "**It sees under clouds:** radar + optical fusion measured 1,466.7 ha of built-up area hidden beneath cloud in the demo.",
    "**Every number traces to a measurement,** with calibrated confidence; below the gate, it abstains.",
    "**It shows an auditable execution trace, not chain-of-thought** — exactly what ISRO says it evaluates.",
    "**It runs fully offline on one laptop;** the only GPU-bound part is isolated behind a fallback.",
  ] },
  { pagebreak: true },

  // ───────────────────────────────────────────── 1. PROBLEM
  { h: 1, text: "Problem Statement Understanding", id: "ps" },
  { h: 2, text: "The problem statement at a glance", id: "ps-record" },
  {
    table: {
      head: ["Field", "Value"],
      widths: [0.28, 0.72],
      rows: [
        ["Problem Statement ID", "26167"],
        ["Title", "SatQuery AI — An Interactive Vision-Language Assistant for Multimodal Remote Sensing Image Analysis through Text Queries"],
        ["Organisation", "Indian Space Research Organisation (ISRO), Department of Space"],
        ["Category / Theme", "Software / Space Technology"],
        ["Primary adaptation dataset", "BigEarthNet.txt [1]"],
        ["Public evaluation benchmarks", "VRSBench [4] and RSVQA [5] (single image); CDVQA [7] (change)"],
        ["Hidden evaluation set", "ISRO/SAC: co-registered Cartosat-2S optical + RISAT SAR pairs; annotations not disclosed"],
      ],
    },
  },
  { h: 2, text: "The problem in plain words", id: "ps-plain" },
  { p: "A district officer wants to know whether construction has increased near a reservoir since 2024. The imagery exists — much of it free — but extracting an answer requires knowing which model applies, how the sensors behave, how GIS software works and which parameters to set. Existing tools are built **one task at a time**: land-cover classification here, building detection there, change detection somewhere else. None of them accepts a question." },
  { fig: { mermaid: `flowchart LR
    subgraph NOW["TODAY"]
        direction TB
        A1["Officer has a question"] --> A2["Needs a GIS specialist"]
        A2 --> A3["Specialist picks a model<br/>and sets parameters"]
        A3 --> A4["Isolated single-task report<br/>days later"]
    end
    subgraph AFTER["WITH SATQUERY AI"]
        direction TB
        B1["Officer has a question"] --> B2["Types it and<br/>uploads imagery"]
        B2 --> B3["System picks the model<br/>and validates the inputs"]
        B3 --> B4["Answer in seconds:<br/>evidence + confidence + trace"]
    end
    NOW ==> AFTER
    class A2,A3,A4 bad
    class B3,B4 good`, caption: "Today's workflow compared with the SatQuery AI workflow." } },
  { callout: { kind: "note", title: "The real gap", text: "The gap is not model capability. It is that **no interface accepts a question, checks whether the imagery can answer it, and shows its working.**" } },

  { h: 2, text: "The five mandatory capabilities", id: "ps-five" },
  { p: "The problem statement makes five capabilities compulsory. The system must satisfy all five; the table maps each to where it is addressed in this report." },
  {
    table: {
      head: ["#", "Capability", "What the PS requires", "Section"],
      widths: [0.06, 0.24, 0.52, 0.18],
      rows: [
        ["R1", "Remote-sensing adaptation", "At least one visual or vision-language component fine-tuned or adapted using BigEarthNet.txt **or any open-source training data**. “A generic LLM or VLM without remote-sensing adaptation will not satisfy the requirements.”", "§4"],
        ["R2", "Single-image baseline", "VQA mandatory, plus captioning/scene description **or** text-guided region grounding.", "§3.5"],
        ["R3", "Multi-image change analysis", "Change description or change-based VQA from a bi-temporal pair; a change map where masks exist.", "§3.5"],
        ["R4", "Cross-modal pair analysis", "Extract **complementary** information from a co-registered optical/multispectral + SAR pair.", "§3.5"],
        ["R5", "Agentic orchestration", "Automatically select, sequence and execute specialist models/tools from a **predefined registry**, with **only permitted parameters**, and emit an auditable execution summary.", "§3.4"],
      ],
    },
  },

  { h: 2, text: "The three input modes", id: "ps-inputs" },
  { fig: { mermaid: `flowchart TD
    IN["User input: GeoTIFF / TIFF<br/>(PNG / JPEG only for public benchmarks)"] --> M1
    IN --> M2
    IN --> M3
    M1["<b>Mode 1 · Single image</b><br/>one optical/multispectral<br/>OR one SAR image"] --> T1["VQA<br/>+ text-guided grounding"]
    M2["<b>Mode 2 · Cross-modal pair</b><br/>co-registered optical + SAR<br/>of the same area"] --> T2["Joint extraction of<br/>complementary information"]
    M3["<b>Mode 3 · Bi-temporal pair</b><br/>same area,<br/>two dates T1 and T2"] --> T3["Change detection, description<br/>and change-based VQA"]
    class M1,M2,M3 accent`, caption: "The three input configurations defined by the problem statement and the tasks each one supports." } },

  { h: 2, text: "Representative queries and how SatQuery routes them", id: "ps-queries" },
  {
    table: {
      head: ["Representative query (from the PS)", "Task classified", "Tool from registry", "Inputs required"],
      widths: [0.43, 0.17, 0.17, 0.23],
      rows: [
        ["“Describe the land-cover and major objects visible in this image.”", "single_vqa", "~rs_vqa~", "one image"],
        ["“Highlight the water body referred to in the query.”", "grounding", "~grounding~", "one image"],
        ["“What changed between these two dates, and where did the change occur?”", "temporal_change", "~change_vqa~", "bi-temporal pair"],
        ["“Use the optical and SAR images together to identify built-up and water-covered regions.”", "cross_modal", "~optical_sar~", "optical + SAR pair"],
        ["“Has the built-up area increased, decreased, or remained unchanged?”", "temporal_change", "~change_vqa~", "bi-temporal pair"],
      ],
    },
  },
  { p: "The last query is a deliberate trap: it names no date and no second image, yet it can only be answered by comparing two. The router treats a verb of change over a quantity (*increased*, *shrunk*, *encroached*) as a temporal question; routing it to single-image VQA would return a confident area that answers a different question." },

  { h: 2, text: "How the solution will be evaluated — and what the PS does not say", id: "ps-eval" },
  { p: "Evaluation uses the prescribed public benchmark test splits plus an ISRO/SAC set of pre-georeferenced, co-registered **Cartosat-2S optical and RISAT SAR** pairs [20][21] whose answers are hidden. Scores are normalised before combining. A careful reading of the official record surfaced three facts that shaped our plan:" },
  {
    table: {
      head: ["Finding in the official text", "Consequence for our design"],
      widths: [0.45, 0.55],
      rows: [
        ["**The judging-criteria table is an unfilled placeholder** — the text literally reads “Add ‘Evaluation/Judging Criteria’ table here”.", "Weights are unknown. We built a balanced, separately visible and separately measured result for all five capabilities instead of optimising one."],
        ["**The dataset field is truncated at 355 characters**, cutting off ISRO's guidance for VRSBench, RSVQA and CDVQA.", "We default to each benchmark's official published split and never re-split it."],
        ["**Only the observable execution trace is evaluated**; “internal reasoning text is neither required nor evaluated”.", "The interface shows a factual audit log (task, tools, parameters, outputs) and never streams chain-of-thought (ADR-008)."],
        ["**The scored imagery is Indian, sub-metre and unseen.**", "The objective is robustness to unseen data, not a benchmark peak: input validation, calibrated confidence and abstention."],
      ],
    },
  },

  { h: 2, text: "Why this is hard, and why a generic AI model is not enough", id: "ps-hard" },
  { p: "Any one of the following is a respectable project; the problem statement asks for all three, orchestrated:" },
  { ol: [
    "**Two sensor types.** Optical imagery records reflected sunlight — colour and material. SAR emits its own radar pulse and records *backscatter* — structure and roughness, through cloud and at night. They are different physical measurements and must be reasoned over together.",
    "**Time.** Two images of the same place on different dates, and an understanding of *what* changed and *where* — not merely that some pixels differ.",
    "**Choice, including refusal.** The system must pick the specialist from the question and the inputs, and must refuse when the inputs cannot support the question.",
  ] },
  { p: "A general-purpose vision-language model (for example GPT-4V) fails for concrete technical reasons: it accepts three colour channels where satellites carry up to thirteen; it reads bright SAR pixels as “bright things” rather than strong backscatter; a building may be four pixels at 10 m resolution; the viewpoint is overhead; a coordinate reference system means nothing to it; and it can state a number that nothing measured. It also needs the internet, which a venue demo cannot rely on. A general language model still has a place — interpreting the query at the front and phrasing verified facts at the end — but **never as the thing that looks at pixels and decides what is there.**" },
  { pagebreak: true },

  // ───────────────────────────────────────────── 2. PRIMER
  { h: 1, text: "Background Primer — Satellites, Sensors and AI in Plain Words", id: "primer" },
  { p: "This section gives a reader new to remote sensing the minimum vocabulary needed for the rest of the report." },
  { h: 2, text: "Two kinds of satellite eyes: optical and SAR", id: "primer-sensors" },
  {
    table: {
      head: ["", "Optical / multispectral", "Synthetic Aperture Radar (SAR)"],
      widths: [0.2, 0.4, 0.4],
      rows: [
        ["How it sees", "Records sunlight reflected from the ground, in several wavelength bands (red, green, blue, near-infrared …)", "Sends its own microwave pulse and records how much energy bounces back (*backscatter*)"],
        ["What it tells you", "Colour and material — vegetation, water, soil", "Structure, roughness and geometry"],
        ["Clouds and night", "Blocked by cloud; needs daylight", "Sees through cloud, day and night"],
        ["Noise", "Mostly additive sensor noise", "*Speckle* — multiplicative noise that needs its own filter (Lee filter [34])"],
        ["Indian missions", "Cartosat-2S [21]", "RISAT / EOS-04 [20]"],
        ["Open data used", "Sentinel-2 [28]", "Sentinel-1 (paired with Sentinel-2 in BigEarthNet.txt [1] and SEN12MS [18])"],
      ],
    },
  },
  { p: "**What SAR brightness means.** Calm water reflects the radar pulse away and looks very dark; smooth bare soil is dark; vegetation scatters diffusely and looks mid-grey; buildings and metal act as corner reflectors and look very bright. This is why a model trained on ordinary photographs misreads radar — and why SatQuery gives SAR its own processing path (ADR-003)." },
  { h: 2, text: "Co-registration, GeoTIFF and coordinates", id: "primer-geo" },
  { ul: [
    "**Co-registration** means two images are aligned pixel-for-pixel over the same ground. ISRO's scored pairs arrive already co-registered, so SatQuery *verifies* alignment (phase correlation, tolerance 2 px) rather than solving it [19].",
    "**GeoTIFF** is an image file that also carries its location: a *coordinate reference system* (CRS, e.g. EPSG:4326 latitude/longitude, or UTM in metres) and a *geotransform* that maps each pixel to a ground coordinate [17]. This is what lets SatQuery turn a box in pixels into latitude/longitude on a map and an area in hectares.",
    "**Ground sample distance (GSD)** is the ground size of one pixel — 10 m for Sentinel-2, sub-metre for Cartosat-2S.",
  ] },
  { h: 2, text: "The AI tasks", id: "primer-tasks" },
  {
    table: {
      head: ["Term", "Plain meaning", "Example"],
      widths: [0.22, 0.48, 0.3],
      rows: [
        ["Visual Question Answering (VQA)", "Answer a natural-language question about an image", "“How many bridges are visible?” → 2"],
        ["Grounding", "Find and outline the thing the text refers to", "“Highlight the water body” → a box/mask on the map"],
        ["Captioning", "Describe an image in a sentence", "“A river crossing farmland”"],
        ["Change detection", "Find what differs between two dates, and where", "“10 changed regions, 1,663 ha”"],
        ["Vision-language model (VLM)", "A neural network that reads images and text together", "Qwen2-VL [32], GeoChat [9]"],
        ["Fine-tuning / adaptation", "Further training of a pre-trained model on domain data", "Training on satellite VQA pairs"],
        ["LoRA / QLoRA", "Train a small add-on (*adapter*) instead of the whole model; QLoRA also compresses the frozen model to 4 bits [12][33]", "20 MB adapter on a 7-billion-parameter model"],
        ["Calibration", "Whether a stated confidence matches real accuracy", "Answers given at 0.9 are right ~90 % of the time"],
      ],
    },
  },
  { h: 2, text: "The five levels of a change answer", id: "primer-change" },
  { p: "Subtracting two images tells you pixels changed; it cannot tell you a field became a warehouse, because a seasonal crop change and a construction project produce similar pixel differences. A real change answer climbs five levels:" },
  {
    table: {
      head: ["Level", "Question", "Example output", "Produced by"],
      widths: [0.1, 0.3, 0.35, 0.25],
      rows: [
        ["1", "Did anything change?", "yes / no", "vision"],
        ["2", "What changed?", "Vegetation → built-up", "vision"],
        ["3", "How much?", "+4.37 percentage points built-up", "vision"],
        ["4", "Where?", "boxes / mask in lat-long", "vision"],
        ["5", "What does it mean?", "“consistent with construction”", "**language layer, phrasing facts only**"],
      ],
    },
  },
  { pagebreak: true },

  // ───────────────────────────────────────────── 3. SOLUTION
  { h: 1, text: "Proposed Solution", id: "solution" },
  { h: 2, text: "Our answer in one sentence", id: "sol-one" },
  { callout: { kind: "key", title: "SatQuery AI in one sentence", text: "**Do not build a chatbot that looks at satellite images. Build a remote-sensing analysis system that happens to accept natural language.** A constrained agent routes each question to a registry of remote-sensing specialists, validates the inputs first, fuses the measured evidence, and phrases only what was measured — with confidence, a map and an auditable trace." } },
  { fig: { mermaid: `flowchart LR
    Q["Question<br/>+ imagery"] --> R["Constrained<br/>router"]
    R --> S1["RS-adapted VQA<br/>(M1)"]
    R --> S2["Grounding"]
    R --> S3["Change analysis"]
    R --> S4["Optical–SAR fusion"]
    S1 --> E["Evidence fusion<br/>+ confidence gate"]
    S2 --> E
    S3 --> E
    S4 --> E
    E --> A["Answer phrased<br/>from evidence only"]
    A --> O["Answer · map · confidence<br/>trace · report · GeoJSON"]
    class R accent
    class E accent
    class O good`, caption: "The solution at the highest level: one entry point, a fixed set of specialists, and evidence-gated answers." } },

  { h: 2, text: "How a question travels through the system", id: "sol-flow" },
  { p: "Every request follows the same fixed nine-step path. Each step writes one line into the execution trace — which step ran, what it decided and how long it took." },
  { fig: { mermaid: `flowchart TD
    U["User uploads imagery<br/>and types a question"] --> V1
    V1["<b>1 · Validate inputs</b><br/>How many images? Optical or SAR?<br/>Georeferenced? Readable?"] --> C2
    C2["<b>2 · Classify the task</b><br/>VQA, grounding, change<br/>or cross-modal?"] --> C3
    C3{"<b>3 · Compatibility</b><br/>Can THESE inputs<br/>answer this question?"}
    C3 -->|no| REF["<b>REFUSE</b><br/>explain why, say what to upload<br/><i>no model is run</i>"]
    C3 -->|yes| S4
    S4["<b>4 · Select tools</b><br/>from a fixed registry of four"] --> P5
    P5["<b>5 · Set parameters</b><br/>only the permitted one: threshold"] --> X6
    X6["<b>6 · Execute</b><br/>the specialist measures the pixels"] --> F7
    F7["<b>7 · Fuse evidence</b><br/>combine outputs, record conflicts"] --> G8
    G8{"<b>8 · Confidence gate</b><br/>did anything clear<br/>the threshold?"}
    G8 -->|no| ABS["<b>ABSTAIN</b><br/>not confident enough to answer"]
    G8 -->|yes| A9["<b>9 · Phrase the answer</b><br/>from evidence only — no pixels"]
    A9 --> OUT["Answer + map overlay + confidence<br/>+ execution trace + report"]
    REF --> OUT2["Refusal / abstention shown<br/>with its reason and trace"]
    ABS --> OUT2
    class REF bad
    class ABS warn
    class OUT good
    class C3,G8 accent`, caption: "The nine-step request path. Two of the three possible outcomes are the system saying “no” — which is what makes the “yes” answers trustworthy.", tall: true } },
  { fig: { mermaid: `stateDiagram-v2
    direction LR
    [*] --> Received
    Received --> Refused: inputs cannot answer
    Received --> Executed: inputs compatible
    Executed --> Abstained: nothing cleared the gate
    Executed --> Answered: evidence cleared the gate
    Refused --> [*]
    Abstained --> [*]
    Answered --> [*]`, caption: "The three outcomes of every query." } },

  { h: 2, text: "Three principles that make the answers trustworthy", id: "sol-principles" },
  {
    table: {
      head: ["Principle", "What it means", "How it is enforced"],
      widths: [0.22, 0.43, 0.35],
      rows: [
        ["**Refuse rather than guess**", "Incompatible inputs are refused before any model runs, with what to upload instead.", "Router step 2 (validate) precedes selection; the refusal path has no call into the model runtime."],
        ["**Facts before words**", "Vision specialists produce structured evidence; the language layer only phrases it.", "~pipeline.answer()~ accepts an ~EvidenceSet~ and no raster — enforced by the type signature and asserted by a test (ADR-007)."],
        ["**Abstain below threshold**", "If no evidence clears the confidence gate, the system declines rather than guesses.", "Gate at 0.45, chosen from measured calibration data (§4.7)."],
      ],
    },
  },
  { fig: { mermaid: `flowchart TD
    V["Specialist vision model<br/>(M1 / grounding / change / SAR)"] --> F["Structured facts<br/>{count: 14, confidence: 0.93, regions: [...]}"]
    F --> G{"Evidence validator<br/>confidence ≥ gate?<br/>geometry valid?"}
    G -->|fails| NO["“I am not sufficiently confident<br/>to answer that from this imagery.”"]
    G -->|passes| L["Constrained phrasing layer<br/><b>never sees pixels</b>"]
    L --> ANS["“14 buildings were detected,<br/>concentrated in the north-east.”"]
    class G accent
    class NO warn
    class ANS good`, caption: "Evidence-gated generation (ADR-007): the language layer cannot invent a number because it never had the image." } },

  { h: 2, text: "The agentic router", id: "sol-router" },
  { p: "The problem statement calls the router the novelty of the whole system. It is deliberately **a constrained agent, not an open-ended one**: ISRO asks for tools selected “from a predefined registry” with “only permitted task parameters”. SatQuery's router is a plain, readable Python function (ADR-004) that performs five jobs in strict order:" },
  {
    table: {
      head: ["#", "Job", "What it does", "PS wording it satisfies"],
      widths: [0.05, 0.14, 0.43, 0.38],
      rows: [
        ["1", "**Classify**", "Reads the question and decides the task (single_vqa, grounding, temporal_change, cross_modal).", "“interpret the query and classify the requested task”"],
        ["2", "**Validate**", "Checks number, modality, format, CRS and alignment of the uploads against what the task requires.", "“check the number, modality, format, metadata, and compatibility of the input images”"],
        ["3", "**Select**", "Picks tools only from the registry — never invents one.", "“select one or more models or tools from a predefined registry”"],
        ["4", "**Sequence**", "Orders tools when more than one is needed.", "“select, sequence, and execute”"],
        ["5", "**Execute**", "Runs with permitted parameters only (the confidence threshold).", "“configure only permitted task parameters”"],
      ],
    },
  },
  { fig: { mermaid: `flowchart TD
    Q["Query + input manifest"] --> C["1 · CLASSIFY the task"]
    C --> V["2 · VALIDATE compatibility"]
    V --> D{"Which inputs does<br/>this task need?"}
    D -->|bi-temporal| D1{"T1 and T2<br/>present?"}
    D -->|optical + SAR| D2{"Both sensors<br/>present?"}
    D -->|single image| D3{"At least one<br/>image present?"}
    D1 -->|no| REF["REFUSE with reason<br/>and what to upload"]
    D2 -->|no| REF
    D3 -->|no| REF
    D1 -->|yes| S["3 · SELECT from the<br/>predefined registry"]
    D2 -->|yes| S
    D3 -->|yes| S
    S --> SEQ["4 · SEQUENCE"]
    SEQ --> EX["5 · EXECUTE with<br/>permitted parameters only"]
    EX --> TR["Emit the observable<br/>execution trace"]
    class REF bad
    class S accent`, caption: "The router's five jobs, including the refusal branch that runs no model.", tall: true } },
  { h: 3, text: "The tool registry — the only tools the router may select" },
  {
    table: {
      head: ["Tool", "Task", "Requires", "Outputs", "Model slot", "Permitted parameter"],
      widths: [0.14, 0.17, 0.2, 0.2, 0.14, 0.15],
      rows: [
        ["~rs_vqa~", "single-image VQA", "single image", "text, confidence", "M1 (trained)", "threshold ∈ [0, 1]"],
        ["~grounding~", "text-guided grounding", "single image", "georeferenced boxes, confidence", "M2 (planned)", "threshold ∈ [0, 1]"],
        ["~change_vqa~", "change, change-VQA", "bi-temporal pair", "text, change regions, area", "M3 (planned)", "threshold ∈ [0, 1]"],
        ["~optical_sar~", "cross-modal", "co-registered optical + SAR", "per-modality evidence, fused evidence", "M4 (planned)", "threshold ∈ [0, 1]"],
      ],
    },
  },
  { p: "Adding a capability means adding one registry row that declares its inputs, outputs and permitted parameters; a tool without a row cannot be selected. Classification today is a deterministic, rule-based stand-in with the same interface as the trained classifier specified for M5, so replacing it is a one-line change and the trace records which one ran." },
  { h: 3, text: "The refusal matrix" },
  {
    table: {
      head: ["Task asked", "Inputs needed", "If missing, the system says"],
      widths: [0.28, 0.3, 0.42],
      rows: [
        ["Single-image VQA / grounding", "≥ 1 image (a pair also satisfies it)", "“Upload at least one image.”"],
        ["Change analysis", "a bi-temporal pair", "“Change analysis needs a bi-temporal pair. Upload an image for T1 and an image for T2.”"],
        ["Cross-modal analysis", "co-registered optical + SAR", "“Upload a co-registered optical image and a SAR image of the same area.”"],
        ["Anything needing geography", "a georeferenced raster", "Refuses, naming the missing field (e.g. no CRS)"],
        ["Target outside the vocabulary", "—", "Proceeds, then abstains at the confidence gate"],
      ],
    },
  },

  { h: 2, text: "The four specialists", id: "sol-specialists" },
  { h: 3, text: "Single-image VQA — the remote-sensing-adapted model (M1)" },
  { p: "Questions about one image (“how many bridges?”, “is there water?”, “what type of area is this?”) are answered by **M1**, our QLoRA-adapted Qwen2-VL-7B (Section 4), alongside classical measurements (spectral indices, segmentation). For *what / where / which* questions M1 leads the answer; for *counts and areas* a **measured** value leads, because M1 counts less reliably (object-quantity accuracy 0.56). When M1 disagrees with a measurement, the disagreement is recorded as a conflict and confidence drops. SAR is never shown to M1, which was trained on optical imagery." },
  { h: 3, text: "Text-guided region grounding (second single-image task)" },
  { p: "“Highlight the water body” returns boxes and masks that are converted through the GeoTIFF geotransform into latitude/longitude, drawn on the map and exported as GeoJSON. We chose grounding over captioning (ADR-002) because a box is verifiable in one second, it feeds the map and the evidence layer, and it is scored by an objective geometric metric (IoU) rather than word-overlap metrics. The current implementation uses NDVI/NDWI spectral indices and multi-level Otsu thresholding [35] with connected components; the M2 adapter is planned." },
  { h: 3, text: "Bi-temporal change analysis" },
  { p: "Given images for T1 and T2 of the same area, the change specialist performs change vector analysis, finds changed regions, measures them in hectares and characterises the change (for example, a mean NDVI drop of −0.707 inside the changed region is consistent with construction). The planned M3 model is a Siamese encoder with a difference head, trained on CDVQA [7]." },
  { fig: { mermaid: `flowchart TD
    T1["Image T1"] --> CO["Check alignment<br/>(phase correlation)"]
    T2["Image T2"] --> CO
    CO --> CVA["Change vector analysis<br/>+ index differences (NDVI, NDWI)"]
    CVA --> TH["Threshold + connected components<br/>→ changed regions"]
    TH --> Q["Measure area (ha) in the image CRS<br/>and characterise change type"]
    Q --> EV["Evidence: regions (EPSG:4326),<br/>area, change type, confidence"]
    subgraph PLAN["Planned M3 (CDVQA)"]
      direction LR
      E1["Shared encoder T1"] --> DH["Difference<br/>head"]
      E2["Shared encoder T2"] --> DH
      DH --> H["Mask head (where)<br/>+ VQA head (what, how much)"]
    end
    class EV good`, caption: "Change analysis: the built classical path and the planned learned model." } },
  { h: 3, text: "Optical–SAR cross-modal fusion" },
  { p: "This is where SatQuery shows why two sensors beat one. SAR is processed on its own path — Lee speckle filtering [34] followed by Otsu thresholding [35] on backscatter — never converted to a greyscale photograph (ADR-003). Optical imagery provides cloud masks and vegetation indices. The two conclusions are combined by **late fusion** (ADR-005), which keeps “optical said X, SAR said Y” visible and lets conflicts lower confidence instead of being silently resolved." },
  { fig: { mermaid: `flowchart TD
    O["Optical image"] --> CL["Find cloud<br/>bright + spectrally flat pixels"]
    O --> NV["Vegetation index (NDVI)<br/>on cloud-free pixels"]
    S["SAR image"] --> LF["Remove speckle<br/>(Lee filter)"]
    LF --> ST["Find strong structure<br/>(Otsu on backscatter)"]
    O --> CO["Verify the pair is aligned<br/>(phase correlation)"]
    S --> CO
    ST --> HID["Structure UNDER cloud =<br/>built-up area the camera cannot see"]
    CL --> HID
    ST --> AGR["Where both sensors see:<br/>agree or conflict?"]
    NV --> AGR
    HID --> EV["Evidence: hectares of built-up area<br/>recovered from beneath cloud"]
    AGR --> EV2["Evidence: conflicts recorded,<br/>confidence reduced"]
    class HID accent
    class EV good`, caption: "Optical–SAR late fusion. The key output is the built-up area that only radar can see." } },

  { h: 2, text: "Evidence, confidence and the execution trace", id: "sol-evidence" },
  { p: "Every specialist returns the same normalised **evidence record**, so fusion, the map, the report and the answer layer all read one format:" },
  { code: `{
  "claim": "built-up areas recovered by SAR beneath cloud",
  "value": 1, "unit": "areas", "confidence": 0.93,
  "modality": "fused",                      // optical | sar | fused | temporal | derived
  "source": { "model": "fusion_late_v0", "version": "0.1.0" },
  "spatial_evidence": [
    { "geometry": "POLYGON((...))", "crs": "EPSG:4326", "area_ha": 1466.7 }
  ],
  "supporting": ["cloud obscures 6.0 % of the optical scene"],
  "conflicts": [],                          // each disagreement lowers confidence
  "method": "Lee filter + Otsu on backscatter, late fusion"
}` },
  { p: "The **execution trace** is a factual audit log — the observable record the problem statement says it will evaluate. Below is a real trace produced by the running system for the cross-modal query (from ~python -m satquery.cli demo~):" },
  { code: `query    use the optical and SAR images together to identify built-up regions
task     cross_modal    tools: optical_sar    engine: classical    64 ms

  ✓ Input validated          2 raster(s) · optical_sar
  ✓ Task identified          cross_modal · matched /optical and/
  ✓ Compatibility check      optical_sar satisfies optical_sar
  ✓ Tool selected            optical_sar (fusion_late_v0)
  ✓ Parameters               threshold=0.45
  ✓ Co-registration checked  optical/sar · offset 0.00 px (tolerance 2 px)
  ✓ Executed optical_sar     5 evidence item(s) · path classical
  ✓ Confidence               0.93 · 5/5 items passed the gate
  ✓ Evidence returned        7 feature(s) · EPSG:4326` },
  { h: 2, text: "Worked example — seeing under cloud", id: "sol-example" },
  { p: "For the query *“Use the optical and SAR images together to identify built-up regions”* on the cross-modal demo scene, the system answered:" },
  { callout: { kind: "note", title: "System answer (confidence 0.93)", text: "“SAR detects 6 built-up areas totalling 2,539.0 ha. Cloud obscures 6.0 % of the optical scene. 1 of them — 1,466.7 ha — lies beneath that cloud and is invisible to the optical sensor. Radar recovered it because radar penetrates cloud and built structures return strongly from corner reflection. That is information neither sensor provides alone.”" } },
  {
    table: {
      head: ["Evidence item", "Value", "Confidence", "Modality"],
      widths: [0.46, 0.18, 0.16, 0.2],
      rows: [
        ["Co-registration verified", "0.0 px offset", "0.95", "fused"],
        ["Optical scene obscured by cloud", "6.0 %", "0.88", "optical"],
        ["Built-up areas detected by backscatter", "6 areas", "0.97", "SAR"],
        ["Built-up areas recovered by SAR beneath cloud", "1 area (1,466.7 ha)", "0.93", "fused"],
        ["Cross-modal agreement in clear sky", "98.36 %", "0.94", "fused"],
      ],
    },
  },
  { callout: { kind: "warn", title: "Disclosure", text: "The demo scene is **synthetic**: pixels are generated on a real EPSG:4326 geotransform, and the cloud deck is placed over the settlement **on purpose**, because that is the case where the two sensors genuinely differ. It is a designed scenario, not a discovery. The algorithms that read the pixels are real, and uploaded GeoTIFFs are analysed as supplied." } },
  { pagebreak: true },

  // ───────────────────────────────────────────── 4. MODEL
  { h: 1, text: "The Remote-Sensing-Adapted Model (M1)", id: "model" },
  { p: "Requirement R1 is the one the problem statement calls disqualifying to omit. This section documents the adapted component end to end: what was trained, on what, how, and — most importantly — the **measured gain** over the same model without adaptation." },
  { h: 2, text: "Model inventory", id: "model-inventory" },
  {
    table: {
      head: ["#", "Component", "Type", "State"],
      widths: [0.07, 0.28, 0.4, 0.25],
      rows: [
        ["M0", "Base vision-language model", "Qwen/Qwen2-VL-7B-Instruct [32], frozen, 4-bit", "**Selected by benchmark**"],
        ["M1", "RS-adapted VQA", "QLoRA adapter on M0, trained on VRSBench", "**Trained · measured · serving**"],
        ["M2", "Grounding", "LoRA adapter on M0 (VRSBench)", "Planned — classical path serves today"],
        ["M3", "Change / change-VQA", "LoRA adapter + Siamese difference head (CDVQA)", "Planned — classical path serves today"],
        ["M4", "SAR encoder + fusion", "Separate small encoder (Sentinel-1), late fusion", "Planned — classical path serves today"],
        ["M5", "Router", "Rule-based classifier; trained classifier planned", "**Built** (rules)"],
        ["M6", "Answer phrasing", "Constrained templates over evidence records", "**Built**"],
      ],
    },
  },
  { fig: { mermaid: `flowchart TD
    BASE["<b>M0 · Base VLM — FROZEN</b><br/>Qwen2-VL-7B-Instruct · 4-bit NF4<br/>loaded ONCE (~6 GB VRAM)"]
    BASE --> A1["<b>Adapter A · M1 RS-VQA</b><br/>VRSBench · 20 MB<br/>TRAINED"]
    BASE -.-> A2["Adapter B · M2 Grounding<br/>planned"]
    BASE -.-> A3["Adapter C · M3 Change<br/>planned"]
    SAR["M4 · SAR encoder<br/>SEPARATE — radar is not a photo<br/>planned"]
    A1 --> FUSE["Evidence fusion"]
    A2 -.-> FUSE
    A3 -.-> FUSE
    SAR -.-> FUSE
    R["M5 · Router"] -. "selects which adapter<br/>is active" .-> BASE
    FUSE --> GEN["M6 · Answer phrasing<br/>from verified facts"]
    class A1 good
    class BASE accent`, caption: "One frozen base, many swappable adapters (ADR-001). Solid lines are built; dashed lines are planned." } },
  { p: "**Why one base with adapters:** four separately fine-tuned 7B models would need ~60 GB of GPU memory; one frozen base with swappable adapters needs ~15 GB at 16-bit or ~6 GB at 4-bit, each adapter is a few tens of MB, swaps take milliseconds, and each capability can be ablated independently." },

  { h: 2, text: "Choosing the base model by benchmark, not reputation", id: "model-base" },
  { p: "The base model is the least reversible decision — every adapter is trained against it — so ADR-010 required it to be chosen by measurement. Two candidates were evaluated:" },
  {
    table: {
      head: ["Candidate", "Outcome", "Decision"],
      widths: [0.28, 0.47, 0.25],
      rows: [
        ["~MBZUAI/geochat-7B~ [9]", "Could not be loaded: the checkpoint declares ~model_type: geochat~ with no ~auto_map~, and its code pins transformers ~4.31, which breaks Qwen2-VL. A base an evaluator cannot load is not a deliverable.", "Rejected (recorded, not worked around)"],
        ["~Qwen/Qwen2-VL-7B-Instruct~ [32]", "Loads cleanly; zero-shot VRSBench VQA 0.5270; licence Apache-2.0 (verified) — suitable for handing weights to a government agency.", "**Selected**"],
      ],
    },
  },
  { p: "A generic base also makes the adaptation **visible**: requirement R1 asks for evidence of adaptation, and a model that starts generic leaves a measurable gain to demonstrate." },

  { h: 2, text: "How the adapter was trained (LoRA / QLoRA)", id: "model-lora" },
  { p: "LoRA [12] freezes the pre-trained model and learns two small low-rank matrices beside selected weight matrices; only those are trained. QLoRA [33] additionally stores the frozen model in 4-bit precision so a 7-billion-parameter model fits on a free 16 GB GPU. The result is a 20 MB adapter file that turns the generic model into a remote-sensing one." },
  { fig: { mermaid: `flowchart LR
    D["VRSBench<br/>Annotations_train<br/>(never val)"] --> S["Seeded shuffle<br/>seed 0 · 12,000 samples"]
    S --> T["QLoRA training<br/>Kaggle T4 · fp16<br/>checkpoint + resume"]
    B["Qwen2-VL-7B<br/>frozen, 4-bit NF4"] --> T
    T --> AD["Adapter<br/>20.2 MB · r=8"]
    AD --> EV["Evaluate on<br/>Annotations_val · n=2,000<br/>same script, same prompt"]
    B --> ZS["Zero-shot baseline<br/>same 2,000 items"]
    EV --> G["Gain = adapted − zero-shot<br/>+ McNemar paired test"]
    ZS --> G
    class G good
    class AD accent`, caption: "The M1 training and evaluation pipeline. The zero-shot baseline and the adapted model are scored by the same script on the same items." } },
  {
    table: {
      head: ["Setting", "Value"],
      widths: [0.35, 0.65],
      rows: [
        ["Method", "QLoRA — 4-bit NF4 frozen base, fp16 compute (the Kaggle T4 has no bf16)"],
        ["LoRA rank / alpha / dropout", "r = 8, α = 16, dropout = 0.05"],
        ["Target modules", "~q_proj~, ~k_proj~, ~v_proj~, ~o_proj~ (attention projections)"],
        ["Trainable parameters", "5,046,272 of 4,696,922,624 packed — **0.107 %**"],
        ["Optimiser", "learning rate 2e-4, cosine schedule, 3 % warm-up, effective batch 32 (1 × 32 accumulation)"],
        ["Samples / epochs / steps", "12,000 / 1 / 375 optimiser steps (shipped rung 2)"],
        ["Hardware and time", "Kaggle T4 (free tier), ~2.2 s per sample, ~7.4 h wall time; interrupted and resumed from checkpoint with optimiser, scheduler and RNG state restored"],
        ["Artefact", "~models/adapters/m1-rs-vqa/~ — PEFT adapter + ~pack.json~ manifest; SHA-256 prefix ~2ea5192277839e63~ matches checkpoint-375"],
      ],
    },
  },

  { h: 2, text: "The data ladder and the result", id: "model-result" },
  { p: "Rather than training on everything at once, the adapter was trained in **rungs**, measuring after each. The first 4,000 samples bought ten points; the next 8,000 bought three. The curve is still rising but flattening; a third rung would cost ~7 more GPU-hours for an expected point or two, so the climb stopped by decision, not by hitting a ceiling." },
  {
    table: {
      head: ["Rung", "Training samples", "VRSBench VQA accuracy (exact match)", "Gain over zero-shot"],
      widths: [0.16, 0.2, 0.38, 0.26],
      rows: [
        ["zero-shot", "0", "0.5270", "—"],
        ["rung 1", "4,000", "0.6305", "+10.35 points"],
        ["**rung 2 (shipped)**", "**12,000**", "**0.6600**", "**+13.30 points**"],
      ],
    },
  },
  { fig: { chart: "anchors", caption: "VRSBench VQA accuracy: our measurements (blue) beside published anchors (grey). Our figures are on a 2,000-item subset of the validation split; published figures are on the full test set." } },
  { callout: { kind: "warn", title: "Stated carefully", text: "This is **not an apples-to-apples comparison**. At n = 2,000 the 95 % interval on 0.6600 is roughly 0.639–0.681, which contains GPT-4V's 0.6560. The defensible claim is **“above the published GeoChat fine-tuned result and level with GPT-4V, on our subset”** — not “beats GPT-4V”." } },

  { h: 2, text: "Is the gain real? Significance and split integrity", id: "model-sig" },
  { p: "Because the zero-shot and adapted runs answered **the same 2,000 question IDs**, the gain can be tested item by item with McNemar's paired test [36] rather than as a difference of two percentages:" },
  {
    table: {
      head: ["Outcome per item", "Count"],
      widths: [0.7, 0.3],
      rows: [
        ["Zero-shot wrong → adapted right (fixed)", "**359**"],
        ["Zero-shot right → adapted wrong (broken)", "93"],
        ["Right in both", "961"],
        ["Net improvement", "+266 items = +13.30 points"],
        ["McNemar χ² / p-value", "155.4 / **1.2 × 10⁻³⁵**"],
      ],
    },
  },
  { p: "The adapter breaks some answers and fixes nearly four times as many; reporting both is what makes the net credible. **Leakage was counted, not assumed:** training reads VRSBench's ~Annotations_train~ (20,264 images) and evaluation reads ~Annotations_val~ (9,350 images); the overlap is **zero**. Every figure is recomputable from prediction rows stored in ~models/results/~." },

  { h: 2, text: "Where the gain came from", id: "model-cats" },
  { fig: { chart: "categories", caption: "Per-category VQA accuracy, zero-shot versus the shipped adapter (rung 2). Categories sorted by number of evaluation items." } },
  { p: "The gain landed where the pre-training error analysis predicted. Before adaptation, the dominant failure was **vocabulary rather than perception**: ~ground-track-field~ answered as *Stadium*, ~small-vehicle~ as *Car*, *rectangular* as *Square*, image-relative *Top* answered as *North*. The three weakest categories — shape (+34 points), position (+22) and category (+20) — are the three that moved most. Two small categories (reasoning, n = 44; object size, n = 62) moved within their ±13-point noise band; every category with more than 180 items improved." },

  { h: 2, text: "Calibration and the confidence gate", id: "model-calib" },
  { p: "A confidence value is only useful if it means something. On 300 questions asked directly of M1, accuracy rises with confidence in every band:" },
  { fig: { chart: "calibration", caption: "M1 accuracy by confidence band (n = 300). Above 0.6 the stated confidence closely tracks accuracy; below 0.6 it overstates it." } },
  {
    table: {
      head: ["Gate", "Answers withheld", "Of which wrong", "Abstention precision", "Right answers lost"],
      widths: [0.12, 0.2, 0.2, 0.26, 0.22],
      rows: [
        ["0.40", "12", "11", "91.7 %", "1"],
        ["**0.45 (chosen)**", "**23**", "**19**", "**82.6 %**", "**4**"],
        ["0.50", "38", "29", "76.3 %", "9"],
        ["0.60", "74", "52", "70.3 %", "22"],
      ],
    },
  },
  { p: "At 0.45 the system withholds 7.7 % of M1's answers, 83 % of which would have been wrong, raising answered accuracy from 0.673 to 0.715 at a cost of 4 correct answers in 300. The serving class (~M1Live~) gave **300 of 300 answers identical** to the run that measured 0.660, proving that what runs in the product is the model that was evaluated." },

  { h: 2, text: "How M1 is served", id: "model-serve" },
  { fig: { mermaid: `flowchart TD
    Q["Optical VQA question"] --> SAR{"Is the input SAR?"}
    SAR -->|yes| CLS["Classical specialist answers<br/>engine: classical<br/>(M1 never sees radar)"]
    SAR -->|no| GPU{"CUDA GPU with<br/>torch + peft available?"}
    GPU -->|yes| LIVE["<b>LIVE</b><br/>base + adapter, greedy decoding<br/>same path that measured 0.660"]
    GPU -->|no| PRE{"Pre-computed answer for<br/>these exact pixels + question?<br/>(SHA-256 key)"}
    PRE -->|yes| PC["<b>PRE-COMPUTED</b><br/>produced earlier by the same<br/>live code on Kaggle — flagged in UI"]
    PRE -->|no| CLS
    LIVE --> EV["Evidence record → confidence gate<br/>→ conflict check vs measurements"]
    PC --> EV
    CLS --> EV
    class LIVE good
    class PC warn`, caption: "M1 serving modes. The result's ~engine~ and ~precomputed~ fields always disclose which path answered.", tall: true } },
  { p: "On real imagery the whole system was run end to end over every question on 10 VRSBench validation images (38 questions): exact match **0.605**; M1 answered 30 and was right on 23 (77 %). This small sample (±16 points) is used to find *where* answers are lost — it is not a headline figure." },
  { fig: { img: "m1-palette.png", caption: "The workstation answering “How many bridges are visible?” on a real VRSBench validation photograph with M1 (answer: 2, confidence 0.74, clearly labelled PRE-COMPUTED)." } },
  { pagebreak: true },

  // ───────────────────────────────────────────── 5. SYSTEM DESIGN
  { h: 1, text: "System Design and Architecture", id: "design" },
  { p: "The structure is described with the **C4 model** [38] — context, containers and components — followed by the deployment and runtime views that matter most for a hackathon system that must survive a venue." },
  { h: 2, text: "System context", id: "design-context" },
  { fig: { mermaid: `flowchart LR
    U1["<b>Analyst / officer / judge</b><br/>uploads imagery,<br/>asks a question"]
    U2["<b>ISRO / SAC evaluator</b><br/>runs the hidden<br/>benchmark"]
    SYS["<b>SatQuery AI</b><br/>agentic vision-language<br/>analysis of<br/>remote-sensing imagery"]
    E1["Hugging Face<br/>base weights · VRSBench · BigEarthNet.txt"]
    E2["Benchmark hosts<br/>RSVQA · CDVQA"]
    E3["ISRO/SAC evaluation set<br/>Cartosat-2S + RISAT<br/><b>annotations undisclosed</b>"]
    U1 -->|"imagery + query"| SYS
    SYS -->|"answer, evidence,<br/>confidence, trace"| U1
    U2 -->|"scored run"| SYS
    E1 -.->|"build time only"| SYS
    E2 -.->|"build time only"| SYS
    E3 -.->|"never available to us"| SYS
    class SYS accent
    class E3 bad`, caption: "Level 1 — system context. Every external dependency is build-time only; at run time the system needs no network." } },
  { h: 2, text: "Containers", id: "design-containers" },
  { fig: { mermaid: `flowchart TD
    U(["Analyst / Judge"]) -->|HTTPS| WEB
    WEB["<b>Web application</b><br/>React 19 · TypeScript · Vite<br/>three.js modality stack · geotiff.js"]
    API["<b>API service</b><br/>Python · FastAPI<br/>ingestion · validation · routing<br/>evidence fusion · trace · reports"]
    MODEL["<b>Model runtime</b><br/>PyTorch · Transformers · PEFT<br/>bitsandbytes 4-bit<br/><i>the ONLY GPU-bound unit</i>"]
    DB[("Results store<br/>SQLite today ·<br/>PostGIS at scale")]
    OBJ[("Raster store<br/>filesystem / S3")]
    ADP[("Adapter packs<br/>PEFT + manifest")]
    WEB -->|"REST / JSON"| API
    API -->|"in-process or HTTP"| MODEL
    API --> DB
    API --> OBJ
    MODEL -->|"load, hot-swap"| ADP
    class MODEL warn
    class WEB,API accent`, caption: "Level 2 — containers. The model runtime is isolated because it is the only unit that needs a GPU and the only one that can run out of memory." } },
  {
    table: {
      head: ["Container", "Technology", "Scales", "If it fails"],
      widths: [0.2, 0.34, 0.2, 0.26],
      rows: [
        ["Web application", "React 19, TypeScript, Vite, Tailwind, three.js", "CDN, stateless", "Answer text still renders"],
        ["API service", "Python, FastAPI, uvicorn", "Horizontally, stateless", "Total outage"],
        ["**Model runtime**", "PyTorch, Transformers, PEFT, bitsandbytes", "**Vertically — bound by GPU memory**", "**Falls back to pre-computed or classical, disclosed**"],
        ["Results store", "SQLite (today); PostgreSQL + PostGIS (ADR-009)", "Single instance is ample", "Results not persisted; live queries still answer"],
        ["Raster / adapter stores", "Filesystem or S3-compatible; PEFT packs", "—", "Base model only, degraded accuracy"],
      ],
    },
  },
  { h: 2, text: "Components and the six processing layers", id: "design-components" },
  { fig: { mermaid: `flowchart TD
    subgraph L1["Layer 1 · Ingestion & validation"]
      RAS["raster.py<br/>GeoTIFF · CRS · geotransform · bands"]
      VAL["validate.py<br/>compatibility · refusal"]
    end
    subgraph L2["Layer 2 · Query understanding"]
      CLS["router.classify()<br/>structured intent"]
    end
    subgraph L3["Layer 3 · Agentic router"]
      ROU["router.py<br/>validate → select → sequence → execute<br/>REGISTRY"]
    end
    subgraph L4["Layer 4 · Specialists"]
      SPC["specialists.py · cv.py<br/>VQA · grounding · change · optical–SAR"]
      RT["runtime.py<br/>M1 live / pre-computed"]
    end
    subgraph L5["Layer 5 · Evidence fusion"]
      EVI["evidence.py<br/>schema · confidence · conflicts<br/>pixel → EPSG:4326"]
    end
    subgraph L6["Layer 6 · Answer & outputs"]
      ANS["pipeline.answer()<br/>phrases evidence only"]
      REP["report.py · GeoJSON · trace"]
    end
    RAS --> VAL --> CLS --> ROU --> SPC
    ROU --> RT
    SPC --> EVI
    RT --> EVI
    EVI --> ANS --> REP
    class ROU accent
    class ANS good`, caption: "Level 3 — components, mapped one-to-one onto modules of the ~satquery~ Python package.", tall: true } },
  { p: "Two structural rules are checkable by following the arrows: the answer layer is downstream of **evidence**, never of a model (ADR-007); and SAR processing sits on its own path rather than inside the optical model (ADR-003)." },

  { h: 2, text: "Deployment view", id: "design-deploy" },
  { fig: { mermaid: `flowchart LR
    subgraph DEV["DEVELOPMENT · laptop"]
      D1["All units in one process<br/>classical path + pre-computed M1<br/>4 GB GPU is enough"]
    end
    subgraph TRAIN["TRAINING · Kaggle T4 (free)"]
      T1["Model runtime only<br/>QLoRA, fp16, checkpoint/resume<br/>outputs: adapter + predictions"]
    end
    subgraph VENUE["VENUE · demo laptop"]
      V1["All units, one command<br/>4-bit model on 6–8 GB GPU<br/><b>NO NETWORK ASSUMED</b><br/>pre-computed answers staged"]
    end
    TRAIN -->|"adapter pack, 20 MB"| VENUE
    DEV -->|"code"| VENUE
    class VENUE bad
    class TRAIN warn`, caption: "Three environments with genuinely different constraints." } },
  {
    table: {
      head: ["Venue constraint", "Consequence for the design"],
      widths: [0.3, 0.7],
      rows: [
        ["No network", "Every weight, dataset sample and map asset is local; no CDN fonts, remote basemaps or model downloads."],
        ["6–8 GB GPU", "4-bit quantisation is mandatory, not an optimisation."],
        ["One machine", "One command must bring everything up, cold, first time."],
        ["Ten-minute slot", "Latency budget of seconds; the model is warmed before the judge arrives."],
        ["Unreliable conditions", "Pre-computed results for demo scenes, labelled as such in the trace."],
      ],
    },
  },

  { h: 2, text: "Runtime views", id: "design-runtime" },
  { h: 3, text: "Nominal path — a bi-temporal change query" },
  { fig: { mermaid: `sequenceDiagram
    autonumber
    actor U as User
    participant W as Web app
    participant A as API service
    participant R as Router
    participant M as Specialist
    participant E as Evidence
    U->>W: T1 + T2 + "what changed?"
    W->>A: POST /api/query
    A->>A: read CRS, bands
    A->>R: query + manifest
    R->>R: classify: change
    R->>R: validate: T1, T2 ✓
    R->>R: select change_vqa
    R->>M: execute (threshold 0.45)
    M-->>E: regions, area, type
    E->>E: gate + to EPSG:4326
    E-->>A: evidence + GeoJSON
    A->>A: phrase from evidence
    A-->>W: answer + map + trace
    W->>U: answer, map, confidence, trace`, caption: "Sequence of a nominal change query. The answer is written from evidence, never from the image.", tall: true } },
  { h: 3, text: "The refusal path" },
  { fig: { mermaid: `sequenceDiagram
    autonumber
    actor U as User
    participant W as Web app
    participant A as API service
    participant R as Router
    participant M as Model runtime
    U->>W: ONE image + "what changed between these two dates?"
    W->>A: POST /api/query
    A->>R: query + manifest (1 image)
    R->>R: classify → temporal_change
    R->>R: validate → needs bi_temporal, found single ✗
    R--xM: NOT CALLED
    R-->>A: refused, reason, remedy
    A-->>W: refusal + what to upload
    W->>U: "Change analysis needs a bi-temporal pair. Upload T1 and T2."`, caption: "The refusal path completes in under a second and invokes no model." } },
  { h: 3, text: "The degraded path — venue fallback" },
  { fig: { mermaid: `flowchart LR
    REQ["Query arrives"] --> CHK{"Model runtime<br/>healthy and warm?"}
    CHK -->|yes| LIVE["Run live inference"]
    CHK -->|"no / timeout"| PRE{"Staged demo<br/>scene?"}
    PRE -->|yes| CACHE["Serve pre-computed result<br/><b>labelled in the trace</b>"]
    PRE -->|no| DEG["Classical answer or honest<br/>degradation notice —<br/>never a fabricated answer"]
    LIVE --> OUT["Answer + evidence + trace"]
    CACHE --> OUT
    DEG --> OUT
    class CACHE warn
    class DEG bad`, caption: "Degraded operation. A pre-computed result presented as live would be a fabrication; disclosed, it is engineering prudence." } },

  { h: 2, text: "API and result contract", id: "design-api" },
  {
    table: {
      head: ["Operation", "Purpose"],
      widths: [0.32, 0.68],
      rows: [
        ["Upload imagery with a role", "optical, SAR, T1 or T2; returns a raster summary (CRS, bands, GSD, size)"],
        ["Query", "query text + input set + threshold → the result contract below"],
        ["Get run / trace", "replay and audit any stored run"],
        ["Download report and GeoJSON", "hand-off artefacts that open in QGIS"],
        ["Health", "version, engine, each adapter pack's serving mode (live / pre-computed / not serving, with reason)"],
        ["Registry", "the tool registry exactly as the router sees it"],
        ["Evaluation", "metrics, ablation, calibration — with composite formulas printed"],
      ],
    },
  },
  { code: `{
  "query": "...", "answer": "...",
  "refused": false, "abstained": false, "confidence": 0.93,
  "task": "cross_modal", "tools": ["optical_sar"], "params": {"threshold": 0.45},
  "evidence": { "count": 5, "passing": 5, "items": [ /* evidence records */ ] },
  "geojson":  { "type": "FeatureCollection", "features": [ /* EPSG:4326 */ ] },
  "trace":    [ { "step": "...", "detail": "...", "ok": true, "ms": 0.1 } ],
  "manifest": { "modality": "optical_sar", "count": 2, "rasters": [ ... ] },
  "elapsed_ms": 64, "engine": "classical | neural+classical", "precomputed": false
}` },
  { h: 2, text: "Cross-cutting concerns", id: "design-cross" },
  {
    table: {
      head: ["Concern", "Rule"],
      widths: [0.25, 0.75],
      rows: [
        ["Coordinate integrity", "Every spatial output carries its CRS. UTM uploads (how Cartosat and Sentinel-2 are delivered) are converted to WGS84 and measured in metres; unsupported projections are refused into pixel space with a stated reason, never guessed. Areas on geographic imagery account for latitude."],
        ["Confidence", "Every claim carries one; it is calibrated and measured (ECE), not decorative."],
        ["Auditability", "Every request emits a trace — never chain-of-thought (ADR-008)."],
        ["Abstention", "Below threshold, decline; abstention precision is measured alongside accuracy."],
        ["Failure", "Flag with a reason, never silently drop. A malformed GeoTIFF produces a readable error naming the missing field, not a stack trace."],
        ["Determinism", "Seeds are recorded; a run replayed from its record gives an identical result."],
      ],
    },
  },
  { h: 2, text: "Quality-attribute targets", id: "design-nfr" },
  {
    table: {
      head: ["#", "Scenario", "Target"],
      widths: [0.08, 0.6, 0.32],
      rows: [
        ["QA-1", "Single-image VQA on the venue laptop, no network", "< 8 s at p95"],
        ["QA-2", "Bi-temporal or cross-modal query, same machine", "< 15 s at p95 (classical path measured ~64–90 ms)"],
        ["QA-3", "One image uploaded with a change question", "Refusal in < 1 s, no model invoked"],
        ["QA-4", "Malformed GeoTIFF with no CRS", "Readable error naming the field; no crash"],
        ["QA-5", "Model runtime unavailable", "Staged scenes answer, labelled pre-computed"],
        ["QA-6", "System states confidence 0.9", "Correct on ≈ 90 %; ECE reported"],
        ["QA-7", "4-bit model on a 6 GB laptop GPU", "Loads and serves without running out of memory"],
        ["QA-8", "Adapter swapped between requests", "< 200 ms added"],
      ],
    },
  },
  { pagebreak: true },

  // ───────────────────────────────────────────── 6. TECH STACK
  { h: 1, text: "Technology Stack", id: "stack" },
  { p: "Every component is open source and runs offline. The stack was chosen for three properties: the ML and the backend share one language, the geospatial path preserves coordinates end to end, and nothing at run time needs the internet." },
  {
    table: {
      head: ["Layer", "Technology", "Why this choice"],
      widths: [0.18, 0.37, 0.45],
      rows: [
        ["Base model", "Qwen2-VL-7B-Instruct (Apache-2.0) [32]", "Loads on current libraries; licence permits handing weights to ISRO; measured zero-shot baseline"],
        ["Adaptation", "PEFT LoRA / QLoRA, bitsandbytes 4-bit NF4, Hugging Face Transformers, PyTorch [12][33]", "0.107 % of parameters trained; fits a free 16 GB GPU; 20 MB artefact"],
        ["Training compute", "Kaggle T4 (free tier), fp16, checkpoint + resume", "No paid GPU required; 9-hour sessions handled by resume"],
        ["Classical vision", "NumPy, Pillow; Lee speckle filter [34], multi-level Otsu [35], NDVI/NDWI, change vector analysis, phase correlation, connected components", "Transparent, fast (~90 ms), and physically correct for SAR"],
        ["Geospatial", "GeoTIFF/TIFF reader with CRS + geotransform; WGS84/UTM conversion; GeoJSON (EPSG:4326)", "Every box becomes lat/long; areas in hectares; opens in QGIS"],
        ["Agent", "Plain Python router + declarative registry (ADR-004)", "The requirement is constraint, not capability; explainable on one slide; no framework drift"],
        ["Backend API", "Python, FastAPI, uvicorn", "Same language as the ML stack; typed JSON contract"],
        ["Web application", "React 19, TypeScript 6, Vite 8, Tailwind CSS 4, three.js, geotiff.js", "Fast, typed UI; 3D modality stack to pull optical, SAR and fusion layers apart"],
        ["Storage", "SQLite today; PostgreSQL + PostGIS and S3-compatible object storage at scale (ADR-009)", "Spatial queries (“every change in this district”) come free; rasters never stored as blobs"],
        ["Quality", "49-check self-test, headless UI verification, stored prediction rows", "Every number recomputable; regressions caught before a demo"],
      ],
    },
  },
  { pagebreak: true },

  // ───────────────────────────────────────────── 7. WEB APP
  { h: 1, text: "The Web Application", id: "webapp" },
  { p: "The workstation is laid out as a map table: inputs and demo scenes on the left, the imagery plate in the centre, and the answer, evidence and execution trace on the right. A permanent disclosure bar states which scenes are synthetic." },
  { fig: { img: "01-hero.png", caption: "Landing page: “From raw imagery to answers you can check.”" } },
  { fig: { img: "10-ws-crossmodal.png", caption: "Cross-modal query: SAR-detected built-up areas, the area recovered beneath cloud, confidence 0.93 and the execution trace." } },
  { fig: { img: "11-ws-refusal.png", caption: "The refusal: a change question with an optical + SAR pair loaded. The compatibility check fails, no model runs, and the system states what is missing and what to upload." } },
  { fig: { img: "12-ws-change.png", caption: "Bi-temporal change: 10 changed regions covering 1,663 ha, a mean NDVI drop consistent with construction, built-up share up 4.37 percentage points." } },
  { fig: { img: "14-ws-stack.png", caption: "The 3D modality stack: optical, fusion and SAR plates pulled apart to show what optical loses under cloud and SAR recovers." } },
  { pagebreak: true },

  // ───────────────────────────────────────────── 8. RESULTS
  { h: 1, text: "Evaluation and Results", id: "results" },
  { h: 2, text: "Remote-sensing adaptation (M1)", id: "res-m1" },
  {
    table: {
      head: ["Measurement", "Value"],
      widths: [0.6, 0.4],
      rows: [
        ["VRSBench VQA, zero-shot (n = 2,000, held-out)", "0.5270"],
        ["VRSBench VQA, adapted — rung 2 (shipped)", "**0.6600**"],
        ["Adaptation gain", "**+13.30 points**"],
        ["Paired McNemar test", "χ² = 155.4, p = 1.2 × 10⁻³⁵"],
        ["Train/val image overlap", "0 of 20,264 / 9,350"],
        ["Latency (Kaggle T4, 4-bit)", "~0.8–0.9 s per item (p50)"],
        ["End-to-end on real VRSBench photos (38 questions)", "0.605 exact match (small sample; diagnostic)"],
      ],
    },
  },
  { h: 2, text: "Classical specialists — against ground truth the pipeline never reads", id: "res-classical" },
  { p: "Reproduce with ~python -m satquery.cli eval~. These are measured on **synthetic test scenes**, so they show that each method works on the populations it was designed for — not accuracy on real Cartosat imagery." },
  {
    table: {
      head: ["Task", "Metric", "Value", "Meaning"],
      widths: [0.28, 0.14, 0.14, 0.44],
      rows: [
        ["Water grounding", "IoU", "1.0000", "Outline matches the true water area"],
        ["Vegetation grounding", "IoU", "0.9958", "Near-perfect overlap"],
        ["SAR built-up detection", "F1", "0.9450", "Radar finds built-up area accurately"],
        ["Bi-temporal change", "F1", "0.7698", "Change found, with errors at boundaries"],
        ["Calibration", "ECE", "0.0328", "Stated confidence matches accuracy (n = 4 bins; small)"],
        ["Cross-modal query", "Latency", "~64–90 ms", "At 512 × 512 px, CPU"],
        ["Built-up structures recovered under cloud", "share", "57.0 %", "Only possible with SAR + optical together"],
      ],
    },
  },
  { h: 2, text: "Ablation — what each layer adds", id: "res-ablation" },
  { p: "An ablation switches parts on one at a time to show what each contributes. All five rows are classical computer vision (no neural model is loaded in any row), and the rows are named for what actually runs." },
  { fig: { chart: "ablation", caption: "Ablation A–E on the same scene. Capability = 0.50 × mean segmentation F1 + 0.25 × router accuracy + 0.25 × cross-modal recovery present — a composite defined by this project, not a standard metric." } },
  {
    table: {
      head: ["Row", "Configuration", "Seg. F1", "Router", "Cross-modal", "Capability"],
      widths: [0.07, 0.38, 0.13, 0.12, 0.14, 0.16],
      rows: [
        ["A", "Panchromatic brightness only", "0.1711", "—", "—", "0.0856"],
        ["B", "+ spectral indices", "0.2109", "—", "—", "0.1055"],
        ["C", "+ specialists, no router", "0.9240", "—", "—", "0.4620"],
        ["D", "+ router", "0.9240", "1.00†", "—", "0.7120"],
        ["E", "+ evidence fusion and gating", "0.9240", "1.00†", "yes", "**0.9620**"],
      ],
    },
  },
  { p: "† Router accuracy of 1.00 is measured on the same labelled queries the rules were written from, so it reports construction, not generalisation. It is shown only inside this ablation and is **not claimed** as a result until a held-out paraphrase set exists." },
  { h: 2, text: "What we deliberately do not claim", id: "res-notclaimed" },
  { ul: [
    "**Router accuracy on unseen phrasings** — not yet measured on a held-out set.",
    "**RSVQA and CDVQA scores** — no benchmark loader exists yet; these are planned.",
    "**Accuracy on Cartosat-2S / RISAT** — that imagery is not publicly available and the ISRO/SAC set is hidden.",
    "**“Beats GPT-4V”** — our 0.660 is level with GPT-4V's 0.656 within the confidence interval, on a subset.",
  ] },
  { pagebreak: true },

  // ───────────────────────────────────────────── 9. NOVELTY
  { h: 1, text: "Novelty and Differentiation", id: "novelty" },
  { h: 2, text: "The research gap", id: "nov-gap" },
  {
    table: {
      head: ["What prior work does", "The measured gap", "What SatQuery AI adds"],
      widths: [0.33, 0.32, 0.35],
      rows: [
        ["Each benchmark targets one capability in isolation: RSVQA [5] → question answering; CDVQA [7] → change detection + VQA; GeoChat [9] → object grounding.", "VRSBench [4] reports general-purpose VLMs trailing remote-sensing-adapted models on captioning, grounding and VQA.", "**One natural-language entry point** over remote-sensing-adapted specialists, with a **constrained router** and **geo-referenced, auditable evidence**."],
      ],
    },
  },
  { h: 2, text: "Six differentiators", id: "nov-six" },
  {
    table: {
      head: ["#", "Differentiator", "Why it matters", "How to see it"],
      widths: [0.05, 0.27, 0.4, 0.28],
      rows: [
        ["1", "**Refuses impossible questions — no model runs**", "Proves validation is real, not decorative; most systems answer anyway.", "One image + “what changed?”"],
        ["2", "**Sees under clouds** with radar + optical", "Makes R4's “complementary information” a number in hectares.", "Cross-modal query; pull the 3D stack apart"],
        ["3", "**Facts from vision, words from language** — enforced in code", "The answer cannot contain a number no measurement produced.", "One evidence item beside the sentence"],
        ["4", "**Auditable trace, not fake reasoning**", "Matches exactly what ISRO says it scores.", "The trace panel"],
        ["5", "**Calibrated confidence and abstention**", "“0.9” means about 90 %; low-confidence answers are withheld.", "Raise the gate and watch it abstain"],
        ["6", "**Fully offline, adaptation proven by a measured gain**", "Survives venue Wi-Fi; R1 evidenced by +13.3 points with p = 1.2e-35.", "Unplug the network"],
      ],
    },
  },
  { h: 2, text: "Comparison with existing approaches", id: "nov-compare" },
  {
    table: {
      head: ["Capability", "Single-task RS tool", "Generic AI chatbot", "SatQuery AI"],
      widths: [0.4, 0.2, 0.2, 0.2],
      rows: [
        ["Ask in plain language", "✗", "✓", "✓"],
        ["Picks the right analysis automatically", "✗", "✗", "✓"],
        ["Checks inputs, refuses impossible questions", "✗", "✗", "✓"],
        ["Optical + SAR together (sees under cloud)", "partial", "✗", "✓"],
        ["Every number traceable to a measurement", "✓", "✗", "✓"],
        ["Remote-sensing adapted", "✓", "✗", "✓"],
        ["Works offline", "✓", "✗", "✓"],
      ],
    },
  },
  { h: 2, text: "How the research literature maps onto our pipeline", id: "nov-map" },
  { fig: { mermaid: `flowchart TD
    A["<b>Natural-language query</b><br/>VRSBench [4] · RSVQA [5] · CDVQA [7]"] --> B
    B["<b>Constrained router</b><br/>Change-Agent [13] · RS-Agent [14]<br/>Multi-agent copilots [15] · Agentic RS survey [16]"] --> C
    C["<b>RS-adapted specialists</b><br/>BigEarthNet.txt [1] · GeoChat [9]<br/>EarthGPT [10] · LoRA [12]"] --> D
    D["<b>Geo-referenced evidence</b><br/>GeoGround [11] · GeoTIFF [17]<br/>SEN12MS [18] · SAR–optical fusion [19]"]
    class A,B,C,D accent`, caption: "Pipeline mapping: each stage of SatQuery AI and the published work it builds on." } },
  { p: "Change-Agent [13] established the pattern of an LLM as the controller with vision models as the eyes; we adopt it with a stricter constraint. RS-Agent [14] demonstrated a tool registry with structured task planning; our registry is closed and declarative. Multi-agent geospatial copilots [15] validate dispatching to specialists; the agentic remote-sensing survey [16] served as our failure-mode checklist (hallucinated tools, unchecked inputs, unverifiable outputs). GeoChat [9] is the grounded remote-sensing VLM baseline, EarthGPT [10] demonstrates multi-sensor feasibility, and GeoGround [11] informs the box/mask output format." },
  { pagebreak: true },

  // ───────────────────────────────────────────── 10. FEASIBILITY
  { h: 1, text: "Feasibility and Viability", id: "feasibility" },
  { p: "Feasibility is not argued here — it is demonstrated. Every capability claimed in this report runs in the repository today, and the one component that needed GPU training was trained on free compute." },
  {
    table: {
      head: ["Dimension", "Evidence"],
      widths: [0.22, 0.78],
      rows: [
        ["**Technical**", "All five mandatory capabilities built and tested (49-check self-test). M1 trained, measured and wired into the pipeline, served live on a GPU or from pre-computed answers on any laptop."],
        ["**Compute**", "M1 trained on a free Kaggle T4 in ~9.6 GPU-hours across two rungs. Inference needs ~6 GB of GPU memory at 4-bit; the classical path runs on a CPU in under 100 ms."],
        ["**Data**", "All training and evaluation data is open: VRSBench (12.5 GB) [4], BigEarthNet.txt annotations [1][3], RSVQA [5], CDVQA [7], Sentinel-1/2 [28]. The PS explicitly permits “any open-source training data”, which avoided a 155 GB BigEarthNet image download."],
        ["**Economic**", "Zero licence cost: every dependency is open source; the base model is Apache-2.0. No paid GPU was required to reach the submitted result."],
        ["**Operational**", "Browser application, drag-and-drop GeoTIFF upload, downloadable report and GeoJSON, fully offline, one command to start."],
        ["**Trust**", "Refusal before any model runs; answers phrased only from measured evidence; calibrated confidence; complete execution trace; synthetic scenes disclosed on screen."],
      ],
    },
  },
  { h: 2, text: "Risks and mitigations", id: "feas-risks" },
  {
    table: {
      head: ["Risk", "Impact", "Mitigation"],
      widths: [0.3, 0.28, 0.42],
      rows: [
        ["Domain gap: Sentinel / Google Earth → Cartosat-2S / RISAT", "Public scores may not transfer", "Robustness over peak: input validation, calibrated confidence, abstention; Indian imagery from Bhuvan / Bhoonidhi [21][29] where obtainable"],
        ["SAR treated as a greyscale photo", "Confident nonsense; exposed by an ISRO panel", "Separate SAR path; M1 never sees SAR (ADR-003)"],
        ["Data leakage from random splits", "Inflated scores, failure on the day", "Official splits; overlap counted (zero); geographic tile-level splits for new data (ADR-006)"],
        ["A metric measured on its own construction", "One caught number discredits all others", "Router accuracy not claimed until held-out; composite formulas printed; ablation rows named for what runs"],
        ["Venue compute or network fails", "Demo cannot run", "4-bit model; offline by design; labelled pre-computed fallback; classical path always available"],
        ["Judging weights unknown", "Cannot optimise one metric", "All five capabilities separately visible and measured"],
        ["Licence blocks delivery of weights", "Deliverable includes models", "Apache-2.0 base verified on the model card"],
        ["Kaggle limits (no bf16, 9-hour sessions)", "Lost training days", "fp16; checkpoint and resume built from day one — both runs survived interruption"],
      ],
    },
  },
  { pagebreak: true },

  // ───────────────────────────────────────────── 11. SCALABILITY
  { h: 1, text: "Scalability and Future Roadmap", id: "scale" },
  { p: "The architecture was drawn so that growth is a configuration change rather than a rewrite. Scaling happens along four independent axes:" },
  {
    table: {
      head: ["Axis", "How SatQuery scales"],
      widths: [0.24, 0.76],
      rows: [
        ["**More users**", "The API service is stateless and scales horizontally behind a load balancer; the web app is static and served from a CDN."],
        ["**More models / tasks**", "A new capability is one registry row plus one adapter pack (tens of MB) on the same frozen base — no new 7B model, no router rewrite. The pack contract (PEFT files + manifest with measured scores) is already defined."],
        ["**More GPU throughput**", "The model runtime is the only GPU-bound unit and sits behind its own interface, so it can move to a separate GPU server or a pool of them without touching the API; adapters hot-swap per request."],
        ["**Larger imagery and archives**", "Rasters live in S3-compatible object storage and are read as tiles; results with geometry go to PostGIS, so spatial questions (“every change in this district since 2024”) become SQL rather than application code."],
      ],
    },
  },
  { fig: { mermaid: `flowchart TD
    U["Users (browser)"] --> CDN["CDN<br/>static web app"]
    U --> LB["Load balancer"]
    LB --> API["API service × N<br/>stateless · FastAPI"]
    API --> Q["Job queue"]
    API --> PG[("PostGIS<br/>results · geometry")]
    Q --> G["GPU workers × N<br/>one frozen base +<br/>hot-swapped adapters"]
    G --> S3[("Object store<br/>cloud-optimised tiles")]
    BH["ISRO Bhoonidhi / Bhuvan<br/>Cartosat · RISAT · LULC"] -->|ingest| S3
    class Q,G accent`, caption: "Target production architecture: stateless API replicas, a queue feeding GPU workers that share one base model with hot-swapped adapters, and spatial storage." } },
  { h: 2, text: "Roadmap", id: "scale-roadmap" },
  {
    table: {
      head: ["Phase", "Window", "Deliverables"],
      widths: [0.18, 0.2, 0.62],
      rows: [
        ["**Selection** (done)", "Sep 2026", "All five capabilities built; M1 trained and measured (+13.3 points); web workstation; upload; reports; this document"],
        ["**Build**", "Oct – Nov 2026", "M2 grounding adapter (VRSBench); M3 change adapter + Siamese head (CDVQA); M4 SAR encoder on Sentinel-1 with late fusion; RSVQA and CDVQA loaders; held-out router paraphrase set; stress suite; venue-laptop test in November"],
        ["**Grand Finale**", "Dec 2026", "Integration, rehearsal, labelled venue fallback — not new construction"],
        ["**Beyond**", "2027", "Trained router classifier (M5); Indian-sensor adaptation on Cartosat/RISAT via Bhoonidhi [21]; PostGIS-backed archive queries; historical time-series tools (LandTrendr [30], CCDC [31])"],
      ],
    },
  },
  { pagebreak: true },

  // ───────────────────────────────────────────── 12. IMPACT
  { h: 1, text: "Impact and Benefits", id: "impact" },
  { h: 2, text: "Who benefits", id: "impact-users" },
  {
    table: {
      head: ["User", "Situation today", "With SatQuery AI"],
      widths: [0.24, 0.36, 0.4],
      rows: [
        ["District and disaster officers", "Operational decisions, no GIS training", "Flood extent, damage and construction questions answered with a map, hectares and a confidence value"],
        ["Agriculture and water departments", "Depend on specialist analysis cycles", "Vegetation and water-body extent from imagery, on demand"],
        ["Urban planners", "Manual comparison of dates", "Built-up growth between two dates, mapped and measured"],
        ["ISRO / SAC analysts", "Routine questions consume expert time", "Skip manual model selection; inspect exactly which tool ran with which parameters"],
        ["Students and researchers", "Specialist software barrier", "Remote sensing through plain-language questions"],
      ],
    },
  },
  { h: 2, text: "Benefits", id: "impact-benefits" },
  {
    table: {
      head: ["Dimension", "Benefit"],
      widths: [0.22, 0.78],
      rows: [
        ["**Social**", "Faster, evidence-backed answers in disasters — including through cloud, when optical satellites are blind and decisions are most urgent; wider access to India's space data."],
        ["**Economic**", "Less specialist time per question; open-source stack with no licence cost; trainable on free compute."],
        ["**Environmental**", "Monitoring of vegetation, water bodies and land-use change over time."],
        ["**Governance**", "Every answer traceable to a measurement, with an audit trail — fit for official use where a wrong number stated confidently is worse than no answer."],
      ],
    },
  },
  { h: 2, text: "Application case study — supporting Forest Rights Act claims (proposed extension)", id: "impact-fra" },
  { callout: { kind: "note", title: "Status", text: "This is a **proposed application** of the SatQuery architecture, showing how its evidence-first design serves a real governance need. It is not part of the built system." } },
  { p: "The **Forest Rights Act, 2006** [22] recognises the rights of forest-dwelling communities over land occupied **before 13 December 2005**, with appeal through Sub-Divisional and District Level Committees (SDLC / DLC). The **FRA Amendment Rules, 2012** [23] allow satellite imagery to **supplement — not replace —** other evidence, with the final decision resting with the human authority. The scale of the need is large: the Ministry of Tribal Affairs' March 2026 progress report records **47,901 community forest-rights claims rejected** nationally [24], and the DAJGUA programme commits **₹79,156 crore across 17 ministries** focused on **22 lakh FRA patta holders** [25]." },
  { p: "SatQuery's design fits this setting unusually well, because the legal framework demands exactly what ADR-007 enforces — evidence that informs a human decision without replacing it:" },
  { fig: { mermaid: `flowchart TD
    Q["Question: “Was this plot cultivated<br/>or occupied before 13 December 2005?”"] --> R["Router: temporal_change<br/>validate: historical + present imagery present?"]
    R -->|missing| REF["Refuse: name the archive<br/>imagery needed"]
    R --> H["Historical archive<br/>CORONA 1967–72 [27]<br/>Landsat since 1972 [26]"]
    R --> P["Present-day mapping<br/>Sentinel-2 10 m [28]<br/>Bhuvan LULC [29]"]
    H --> T["Year-of-change detection<br/>LandTrendr [30] · CCDC [31]"]
    P --> T
    T --> EV["Evidence packet: dated land-cover history,<br/>maps, confidence, execution trace"]
    EV --> G{"Confident?"}
    G -->|no| AB["Abstain — imagery insufficient;<br/>rely on other evidence"]
    G -->|yes| HUM["SDLC / DLC reviews as<br/><b>supplementary evidence</b><br/>(FRA Rules 2012)"]
    class HUM good
    class REF bad
    class AB warn`, caption: "Proposed FRA evidence-support workflow: SatQuery supplies a dated, auditable land-cover history; the statutory authority decides.", tall: true } },
  { ul: [
    "**Registry extension, not redesign:** archive-imagery ingestion and year-of-change tools (LandTrendr, CCDC) become new registry rows.",
    "**Supplement, not replace:** the output is an evidence packet with confidence and trace for the committee, never a verdict — matching the 2012 Rules.",
    "**Abstention protects claimants:** where imagery cannot establish the history, the system says so rather than producing a confident negative that could wrongly count against a claim.",
  ] },
  { pagebreak: true },

  // ───────────────────────────────────────────── 13. ADRs
  { h: 1, text: "Key Design Decisions", id: "adr" },
  { p: "Every contested, non-obvious or expensive-to-reverse choice is recorded as an Architecture Decision Record (ADR) with the alternatives that were rejected. They double as answers to “why not …?” questions." },
  {
    table: {
      head: ["ADR", "Decision", "Main alternative rejected, and why"],
      widths: [0.08, 0.36, 0.56],
      rows: [
        ["001", "One frozen base VLM, swappable LoRA adapters", "Four fully fine-tuned models: ~60 GB GPU memory, four full training runs, no per-capability ablation"],
        ["002", "Grounding, not captioning, as the second single-image task", "Captioning: slow to verify, produces nothing the map can use, scored by word-overlap metrics"],
        ["003", "SAR gets its own processing path", "SAR as a greyscale PNG into an optical model: reads backscatter as brightness, no speckle prior"],
        ["004", "Plain Python router, not an agent framework", "LangGraph-style framework: built for capability, but the PS asks for constraint; hides the judged component"],
        ["005", "Late fusion for optical–SAR", "Feature-level / cross-attention fusion: destroys the “optical said X, SAR said Y” separability the ablation needs"],
        ["006", "Geographic tile-level splits, never random", "Random 80/10/10: neighbouring tiles leak; measures memorisation"],
        ["007", "The language layer phrases validated evidence only", "End-to-end VLM generation: no meaningful confidence, no abstention, no audit trail"],
        ["008", "Show the execution trace, hide chain-of-thought", "Streaming reasoning: explicitly not evaluated, adds latency, invites attack"],
        ["009", "PostgreSQL + PostGIS; rasters in object storage (proposed)", "MongoDB: weaker geospatial support; rasters as blobs: bloats everything"],
        ["010", "Base model chosen by benchmark, not reputation", "Pick GeoChat by reputation: it could not even be loaded on current libraries"],
      ],
    },
  },
  { h: 2, text: "What is real and what is simulated", id: "adr-honesty" },
  {
    table: {
      head: ["Category", "What"],
      widths: [0.22, 0.78],
      rows: [
        ["**Real**", "Every algorithm that reads pixels: Lee speckle filter, multi-level Otsu, connected components, change vector analysis, NDVI/NDWI, phase-correlation co-registration, inverse geotransform, the router's classify–validate–select–sequence–execute cycle, and the confidence gate. Uploaded GeoTIFFs are analysed as supplied."],
        ["**Trained**", "M1 — the QLoRA adapter on Qwen2-VL-7B, measured at 0.660 on held-out VRSBench."],
        ["**Synthetic**", "Pixel values of the built-in demo scenes, because Cartosat-2S and RISAT imagery cannot be obtained and the ISRO/SAC set is undisclosed."],
        ["**Constructed on purpose**", "The cloud placement over the settlement in the cross-modal scene — the case where the sensors genuinely differ."],
        ["**Planned**", "M2 grounding, M3 change and M4 SAR adapters; RSVQA/CDVQA loaders; trained router classifier."],
      ],
    },
  },
  { pagebreak: true },

  // ───────────────────────────────────────────── 14. TEAM
  { h: 1, text: "Team BUGHEBUG", id: "team" },
  { p: "The work is split along the architecture's own seam: the model runtime is the only GPU-bound unit and sits behind a defined adapter-pack contract, so the two halves meet in one agreed place." },
  {
    table: {
      head: ["Area", "Responsibilities"],
      widths: [0.3, 0.7],
      rows: [
        ["**Models and training** (Mridul)", "Base-model benchmark and selection; M1 training and the measured adaptation gain; later M2–M4; data preparation, splits and licences; benchmark runs; quantisation for the venue"],
        ["**Systems, orchestration and interface** (Shreyash)", "Ingestion, upload, validation and refusal; router and registry; evidence layer, confidence gate, answer layer and trace; API, reports and GeoJSON; web application; evaluation harness and ablation integrity; venue deployment and fallback"],
      ],
    },
  },
  { h: 2, text: "Anticipated questions", id: "team-qa" },
  {
    table: {
      head: ["Question", "Answer"],
      widths: [0.3, 0.7],
      rows: [
        ["Why not just use GPT-4V?", "The PS disqualifies a generic model without remote-sensing adaptation; it needs the internet; and it can invent numbers — our architecture structurally cannot (ADR-007)."],
        ["Where is your fine-tuning?", "M1: QLoRA on Qwen2-VL-7B, VRSBench, 0.527 → 0.660 on 2,000 held-out items, p = 1.2e-35, zero train/val overlap (§4)."],
        ["How do you know the confidence is honest?", "Calibration is measured; accuracy rises with confidence in every band, and the 0.45 gate was chosen from data (§4.7)."],
        ["Is this real imagery?", "Demo scenes are synthetic and disclosed on screen; every algorithm is real; M1 is shown on real VRSBench photographs; uploads accept real GeoTIFFs."],
        ["What is “agentic” here?", "Classify → validate → select from a fixed registry → sequence → execute with permitted parameters, all in the trace (§3.4)."],
        ["Why show no reasoning?", "ISRO scores only the observable trace and says reasoning text is “neither required nor evaluated” (ADR-008)."],
        ["What if the sensors disagree?", "The conflict is recorded in the evidence and confidence is reduced — never silently resolved."],
        ["How will it handle the hidden ISRO data?", "Official and geographic splits, input validation, calibrated confidence and abstention — built for data we have not seen."],
      ],
    },
  },
  { pagebreak: true },

  // ───────────────────────────────────────────── 15. REFERENCES
  { h: 1, text: "Research and References", id: "refs" },
  { refs: [
    { group: "Datasets", items: [
      { n: 1, t: "BigEarthNet.txt — Large-Scale Multi-Sensor Image-Text Dataset. BIFOLD / TU Berlin, 2026. 464,044 Sentinel-1/Sentinel-2 image pairs · 9.6M text annotations.", role: "Our adaptation set", url: "https://arxiv.org/abs/2603.29630" },
      { n: 2, t: "BigEarthNet.txt — Project Portal. Official project portal for the BigEarthNet.txt dataset.", url: "https://txt.bigearth.net/" },
      { n: 3, t: "BigEarthNet.txt — Hugging Face Dataset Card. BIFOLD-BigEarthNetv2-0 dataset resource.", url: "https://huggingface.co/datasets/BIFOLD-BigEarthNetv2-0/BigEarthNet.txt" },
      { n: 4, t: "VRSBench — NeurIPS 2024. 29,614 images · 123,221 VQA.", role: "Single-image benchmark; M1 training and evaluation corpus", url: "https://github.com/lx709/VRSBench" },
      { n: 5, t: "S. Lobry et al., RSVQA: Visual Question Answering for Remote Sensing Data — IEEE TGRS 2020. 772 images · 77,232 QA.", role: "VQA sanity check", url: "https://arxiv.org/abs/2003.07333" },
      { n: 6, t: "RSVQA Dataset Portal. LR + HR dataset resources.", url: "https://rsvqa.sylvainlobry.com/" },
      { n: 7, t: "CDVQA — Change Detection Meets Visual Question Answering. IEEE TGRS, 2022. 2,968 image pairs · 122k QA.", role: "Bi-temporal benchmark", url: "https://arxiv.org/abs/2112.06343" },
      { n: 8, t: "CDVQA — Official Code & Dataset Splits. Official GitHub repository.", url: "https://github.com/YZHJessica/CDVQA" },
    ] },
    { group: "Model baselines", items: [
      { n: 9, t: "GeoChat — Grounded Large Vision-Language Model for Remote Sensing. CVPR 2024. First grounded remote-sensing vision-language model.", role: "Our grounding baseline", url: "https://github.com/mbzuai-oryx/GeoChat" },
      { n: 10, t: "EarthGPT — Multi-Sensor MLLM (optical · SAR · infrared). IEEE TGRS 2024.", role: "Demonstrates multi-sensor feasibility", url: "https://arxiv.org/abs/2401.16822" },
      { n: 11, t: "GeoGround — Unified LVLM for Remote-Sensing Visual Grounding, 2024.", role: "Our box and mask output", url: "https://arxiv.org/abs/2411.11904" },
      { n: 12, t: "E. Hu et al., LoRA — Low-Rank Adaptation of Large Language Models. ICLR 2022. Freeze backbone · train lightweight adapters.", role: "Our adaptation method", url: "https://arxiv.org/abs/2106.09685" },
    ] },
    { group: "Agentic orchestration", items: [
      { n: 13, t: "Change-Agent — Interactive Change Interpretation, 2024. LLM as the brain · vision model as the eyes.", role: "Our router pattern", url: "https://arxiv.org/abs/2403.19646" },
      { n: 14, t: "RS-Agent — Automating Remote-Sensing Tasks through an Intelligent Agent. Tool registry + structured task planning.", role: "Our closed tool set", url: "https://arxiv.org/abs/2406.07089" },
      { n: 15, t: "Multi-Agent Geospatial Copilots for Remote-Sensing Workflows.", role: "Validates specialist dispatch", url: "https://arxiv.org/abs/2501.16254" },
      { n: 16, t: "Agentic AI for Remote Sensing — Challenges and Directions. Survey of open problems.", role: "Our failure-mode checklist", url: "https://arxiv.org/abs/2604.24919" },
    ] },
    { group: "Optical–SAR and ISRO data", items: [
      { n: 17, t: "OGC GeoTIFF Standard — georeferencing tags (CRS and geotransform) for raster imagery.", role: "Our coordinate-integrity contract", url: "https://www.ogc.org/standard/geotiff/" },
      { n: 18, t: "SEN12MS — Georeferenced Sentinel-1/Sentinel-2 fusion corpus.", role: "Our cross-modal design", url: "https://arxiv.org/abs/1906.07789" },
      { n: 19, t: "Chen & Bruzzone, Self-Supervised SAR-Optical Data Fusion. Co-registration and joint feature learning.", role: "Our alignment check", url: "https://arxiv.org/abs/2103.05543" },
      { n: 20, t: "EOS-04 (RISAT-1A) Handbook — NRSC / ISRO. SAR product specifications.", role: "Sensor in the evaluation set", url: "https://bhoonidhi.nrsc.gov.in/" },
      { n: 21, t: "ISRO Bhoonidhi EO Data Hub — Cartosat-2S and RISAT data access.", role: "Our test-imagery source", url: "https://bhoonidhi.nrsc.gov.in/" },
    ] },
    { group: "Legal and policy basis", items: [
      { n: 22, t: "Forest Rights Act, 2006 — pre-13 December 2005 occupation and SDLC/DLC appeal mechanism.", url: "https://tribal.nic.in/fra.aspx" },
      { n: 23, t: "FRA Amendment Rules, 2012 — satellite imagery can supplement, not replace, other evidence; final decision remains with the human authority.", url: "https://www.tribal.mp.gov.in/CMS/Uploaded%20Document/RTI/Rules%20%26%20Regulation/Forest%20Rights%20Amendment%20Rules%202012.pdf" },
      { n: 24, t: "Ministry of Tribal Affairs — Monthly Progress Report, March 2026. 47,901 community forest-rights claims rejected nationally.", url: "https://tribal.nic.in/downloads/FRA/MPR/2026/%28B%29%20MPR%20Mar%202026.pdf" },
      { n: 25, t: "DAJGUA — ₹79,156 crore · 17 ministries · focus on 22 lakh FRA patta holders (PIB).", url: "https://archive.pib.gov.in/newsite/PrintRelease.aspx?relid=259904" },
    ] },
    { group: "Satellite data and time-series research", items: [
      { n: 26, t: "Landsat — USGS. Historical satellite imagery available from 1972.", url: "https://www.usgs.gov/landsat-missions/landsat-1" },
      { n: 27, t: "CORONA — USGS EROS Archive. Declassified historical satellite imagery, 1967–1972.", url: "https://www.usgs.gov/centers/eros/science/usgs-eros-archive-declassified-data-declassified-satellite-imagery-1" },
      { n: 28, t: "Sentinel-2 — Copernicus Data Space. 10 m imagery for present-day asset mapping.", url: "https://dataspace.copernicus.eu/data-collections/copernicus-sentinel-missions/sentinel-2" },
      { n: 29, t: "ISRO Bhuvan — Indian geospatial and LULC layers for present-day mapping.", url: "https://bhuvan.nrsc.gov.in/" },
      { n: 30, t: "Kennedy et al., LandTrendr, 2018 — detects the year of land-cover change from Landsat time-series.", url: "https://doi.org/10.3390/rs10050691" },
      { n: 31, t: "Zhu & Woodcock, CCDC, 2014 — continuous land-cover change detection using Landsat observations.", url: "https://doi.org/10.1016/j.rse.2014.01.011" },
    ] },
    { group: "Additional references used in this report", items: [
      { n: 32, t: "Qwen Team, Qwen2-VL: Enhancing Vision-Language Model's Perception of the World at Any Resolution, 2024.", role: "Our base model (M0)", url: "https://arxiv.org/abs/2409.12191" },
      { n: 33, t: "T. Dettmers et al., QLoRA: Efficient Finetuning of Quantized LLMs, NeurIPS 2023.", role: "4-bit training on a free GPU", url: "https://arxiv.org/abs/2305.14314" },
      { n: 34, t: "J.-S. Lee, Digital Image Enhancement and Noise Filtering by Use of Local Statistics, IEEE TPAMI, 1980.", role: "SAR speckle filter", url: "https://doi.org/10.1109/TPAMI.1980.4766994" },
      { n: 35, t: "N. Otsu, A Threshold Selection Method from Gray-Level Histograms, IEEE Trans. SMC, 1979.", role: "Segmentation thresholds", url: "https://doi.org/10.1109/TSMC.1979.4310076" },
      { n: 36, t: "Q. McNemar, Note on the Sampling Error of the Difference Between Correlated Proportions, Psychometrika, 1947.", role: "Paired significance test", url: "https://doi.org/10.1007/BF02295996" },
      { n: 37, t: "VRSBench on Hugging Face — dataset files used for training and evaluation.", url: "https://huggingface.co/datasets/xiang709/VRSBench" },
      { n: 38, t: "S. Brown, The C4 Model for Visualising Software Architecture.", role: "Architecture notation in §5", url: "https://c4model.com/" },
      { n: 39, t: "Smart India Hackathon 2026 — official portal (problem statement 26167, ISRO).", url: "https://sih.gov.in/" },
    ] },
  ] },
  { pagebreak: true },

  // ───────────────────────────────────────────── APPENDICES
  { h: 1, text: "Appendix A — Glossary", id: "glossary", unnumbered: true },
  {
    table: {
      head: ["Term", "Meaning"],
      widths: [0.26, 0.74],
      rows: [
        ["Ablation", "Switching parts of a system on one at a time to measure what each contributes"],
        ["Abstention", "Declining to answer because no evidence cleared the confidence threshold"],
        ["Adapter (LoRA)", "A small set of trained weights added to a frozen model to specialise it"],
        ["Backscatter", "The radar energy returned to a SAR sensor; bright for buildings, dark for calm water"],
        ["Calibration / ECE", "Agreement between stated confidence and actual accuracy; Expected Calibration Error measures the gap"],
        ["Co-registration", "Pixel-for-pixel alignment of two images of the same ground"],
        ["CRS / EPSG code", "Coordinate reference system, e.g. EPSG:4326 (latitude/longitude) or UTM (metres)"],
        ["Execution trace", "The factual audit log of what the system ran — the part ISRO evaluates"],
        ["F1 / IoU", "Standard accuracy measures for detection (F1) and overlap of regions (Intersection over Union)"],
        ["GeoJSON", "Open format for map features; opens directly in QGIS and web maps"],
        ["GeoTIFF", "An image file that also stores where on Earth each pixel is"],
        ["Grounding", "Locating the region an instruction refers to"],
        ["Late fusion", "Analysing each sensor separately, then combining their conclusions"],
        ["McNemar's test", "A significance test for paired right/wrong outcomes on the same items"],
        ["NDVI / NDWI", "Spectral indices that highlight vegetation and water"],
        ["QLoRA", "LoRA training on a model stored in 4-bit precision, to fit small GPUs"],
        ["SAR", "Synthetic Aperture Radar — an active sensor that sees through cloud, day and night"],
        ["Speckle", "Grainy multiplicative noise inherent to SAR images"],
        ["VQA", "Visual Question Answering"],
        ["Zero-shot", "A model evaluated without any training on the target task — the baseline for measuring adaptation"],
      ],
    },
  },
  { h: 1, text: "Appendix B — Reproducing the Results", id: "repro", unnumbered: true },
  { p: "All commands run from the ~167/~ folder of the team repository." },
  { code: `python -m satquery.cli selftest     # 49 checks, ~2 s
python -m satquery.cli demo         # one cross-modal run with its trace
python -m satquery.cli eval         # task metrics and the A–E ablation
python -m satquery.cli serve --adapters models/adapters   # UI + API on :8000

# M1 — zero-shot and adapted, same script, same 2,000 items
python models/eval_baseline.py --seed 0 --limit 2000
python models/eval_baseline.py --seed 0 --limit 2000 --adapter <adapter-dir>

# M1 — training (Kaggle T4, resumable)
python models/train_rs_vqa.py --resume` },
  {
    table: {
      head: ["Path", "Contents"],
      widths: [0.34, 0.66],
      rows: [
        ["~docs/~", "Official problem statement, deep analysis, model specification, system design, PRD, TRD, decision record, ADRs"],
        ["~satquery/~", "The Python package: raster, validate, router, specialists, runtime, evidence, pipeline, report, server"],
        ["~web/~", "React + three.js workstation"],
        ["~models/~", "Training, evaluation, calibration and pre-compute scripts; ~MANIFEST.md~; stored prediction rows in ~results/~; the M1 pack"],
      ],
    },
  },
];
