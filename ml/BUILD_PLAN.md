# ML Build Plan — everything model

**Owner: Mridul.** Scope: every model in SatQuery AI — base selection (M0), the mandatory adapter (M1), the Build-phase adapters and encoder (M2–M4), the router classifier (M5), quantisation for the venue, and every benchmark number the project reports.

Derived from `docs/07_PRD.md`, `docs/08_TRD.md` (requirement IDs cited throughout), `docs/03_Model_Specification.md`, `docs/10_Decision_Record.md` and ADR-001/002/003/005/006/010. Where an item depends on an open audit finding it is marked **[audit B*n*]**.

---

## 0. The one thing

Requirement R1 is the only mandatory capability the PS calls disqualifying to miss:

> *"A generic LLM or VLM without remote-sensing adaptation will not satisfy the requirements."*

It is evidenced by **the gain over zero-shot**, not by an absolute score (`10` §2). Everything in Phase 1 below exists to produce one number pair — zero-shot and adapted, on the same VRSBench test split — and to ship the adapter that produced it.

---

## 1. What you own

| Component | What | Phase | TRD |
|---|---|---|---|
| M0 | Base VLM — chosen by benchmark, frozen | S | ADP-01, ADP-02, TRN-01–03 |
| **M1** | **RS-adapted VQA — LoRA on M0, the mandatory adaptation** | **S** | VQA-01–06, ADP-03–06, TRN-04–08 |
| M2 | Grounding adapter (VRSBench) | B | GRD-06 |
| M3 | Change / change-VQA adapter + Siamese difference head (CDVQA) | B | CHG-07 |
| M4 | SAR encoder (Sentinel-1) + late-fusion model | B | XMD-02, XMD-07 |
| M5 | Router classifier on synthetic paraphrases (Shreyash owns the held-out set and integration) | B | RTR-08 |
| — | Quantisation, adapter-swap latency, venue VRAM | F | ADP-07, ADP-08, NFR-07, NFR-08 |
| — | Every benchmark run and ablation row that involves a model | S → F | VQA-05, EVL-03, EVL-04, EVL-06 |

**Not yours:** M6 answer generator (Shreyash — it phrases evidence, it is not trained), the evidence layer, the router logic, the API, the interface.

---

## 2. Environment — set up once, correctly

| Fact | Consequence | Source |
|---|---|---|
| Dev laptop: 4 GB VRAM, ~1 MB/s link, ~17 GB free disk | **Nothing trains or benchmarks locally.** The corpus lives where the GPU lives; only adapters (20–80 MB each) come back down | `09` §3.1–3.2 |
| Kaggle: 2×T4 (16 GB) or P100, ~30 GPU-h/week | QLoRA + gradient checkpointing | `03` §12 |
| **T4/P100 do not support bf16** | **fp16 everywhere** — `03` §4's config says bf16; override it | `10` §6, TRN-05 |
| **Sessions cap at 9 hours** | Checkpoint and resume before the first real run; persist checkpoints to a Kaggle Dataset (not only `/kaggle/working`) | TRN-06, TRN-07 |
| ~16 GPU-h per adapter; ~40–60 for all four | M1 fits in week one; M2–M4 fit across the Build phase | TRN-11 |

**Day-one checklist**

- [ ] Kaggle notebook with GPU enabled; `transformers`, `peft`, `bitsandbytes`, `trl`, `datasets`, `accelerate` pinned
- [ ] A 20-step dummy run that saves a checkpoint, kills the kernel, and **resumes** — proven before any real run
- [ ] Checkpoint target that survives a session boundary, verified by restarting the session
- [ ] A run log: seed, base revision, corpus, split, config, metrics (TRN-08)

---

## 3. Phase 1 — Submission: M0 + M1

### 3.1 Zero-shot benchmark — **due 13 Sep, the real gate**

No training and no quota pressure. If this slips, everything downstream slips (`10` §8).

| Candidate | HF id | Licence | Expectation |
|---|---|---|---|
| GeoChat-7B | `MBZUAI/geochat-7B` | Apache-2.0 | Higher absolute; already RS-adapted, so **smaller gain** to show; native grounding |
| Qwen2-VL-7B-Instruct | `Qwen/Qwen2-VL-7B-Instruct` | Apache-2.0 | Lower absolute; generic, so **larger gain** to show |

Steps:

1. Load each candidate frozen, 4-bit, on the training GPU.
2. Run the **VRSBench official test split** — VQA accuracy **per question category**, and grounding Acc@0.5 **[audit B7]** (ADR-010 asks for both; grounding matters because M2 is Build-phase, so submission grounding may lean on the base).
3. Record both tables. Note latency and VRAM per candidate — it foreshadows the venue.
4. Choose: prefer the base that leaves room to demonstrate adaptation (`10` §5 favours the generic base), unless its grounding is unusable for submission. **Write the reasoning next to the numbers** — that table is a slide.

Deliverable: `models/MANIFEST.md` zero-shot column filled; a short `ml/results/zero_shot.md`.

### 3.2 Corpus — VRSBench, not BigEarthNet imagery

- `xiang709/VRSBench` — 12.5 GB, CC-BY-4.0, 29,614 images, 123,221 VQA pairs. Download **on Kaggle**, never locally.
- **Use the official train/test split unmodified** (DAT-02, ADR-006). No custom splitter is needed for this corpus.
- Normalise to the unified training record (`08_TRD.md` §7.3) so M2–M4 reuse one loader (DAT-05).
- Why not BigEarthNet.txt: 467 MB of annotations keyed into a separate ~155 GB imagery set; the PS permits "any open source training data" (`10` §4). Say the numbers right if asked: **464,044 pairs, ~9.6 M annotations** (DAT-01).

### 3.3 Train M1 — **converging by 18 Sep**

```yaml
model:
  base: <benchmark winner>
  load_in_4bit: true
lora:
  r: 8
  alpha: 16
  dropout: 0.05
  target_modules: [q_proj, k_proj, v_proj, o_proj]
training:
  precision: fp16            # not bf16 — T4/P100
  gradient_checkpointing: true
  per_device_batch_size: 1
  gradient_accumulation_steps: 32
  learning_rate: 2.0e-4
  epochs: 3
  warmup_ratio: 0.03
  save_strategy: steps       # resume across 9-hour sessions
data:
  source: xiang709/VRSBench
  split: official
```

Watch validation accuracy per epoch, not just loss. If it is not converging by 18 Sep, the fallback is honest framing of the specialist pipeline (`07` §14.2) — not a quietly easier metric.

### 3.4 Evaluate M1 — **adapted number and gain by 22 Sep**

| Metric | Target | Anchor |
|---|---|---|
| VQA accuracy, VRSBench | 55–62 % | GeoChat fine-tuned 60.6 %; GPT-4V 65.6 % |
| **Gain, zero-shot → adapted** | **+10 to +20 points** | GeoChat 40.8 → 60.6 = +19.8 |

- Same split, same prompt template, same decoding settings as the zero-shot run — otherwise the gain measures the prompt.
- Report per category (VQA-05). Do not adopt targets above the anchors — 80 % is above GPT-4V (`10` §3).
- Model confidence: expose token-probability confidence so the evidence layer can calibrate it (VQA-04). Hand Shreyash ≥ 200 scored predictions for the calibration check **[audit B8]**.
- **Numeric claims:** when M1 answers a count or an area, the pipeline cross-checks against the measured value; a disagreement is recorded as a conflict and lowers confidence **[audit A3]**. Make M1's numeric answers parseable so that check can run.
- **Descriptive queries** (RQ-1, *"Describe the land-cover and major objects…"*) must produce a structured scene summary, not a one-word answer — include descriptive prompts in the evaluation set **[audit B3]**.

### 3.5 Ship the pack — the seam with the pipeline

Per `08_TRD.md` §4.6 (CON-03–05):

```
models/adapters/m1-rs-vqa/
├── adapter_config.json
├── adapter_model.safetensors
└── pack.json    # pack id, component, base id + revision, corpus, split,
                 # zero-shot, adapted, gain, date, licence
```

- **Before real weights exist:** agree the pack layout and the loader interface with Shreyash, and prove the load path with a **stub pack** in a test (ADP-06). The first real load must not happen on 22 Sep.
- One row in `models/MANIFEST.md`, measured numbers only (CON-05, `10` §9 rule 1).

### Phase 1 exit

- [ ] Zero-shot table for both bases (VQA per category + grounding)
- [ ] Base chosen, reasoning written, licence confirmed
- [ ] M1 trained with fp16 + verified resume
- [ ] Adapted score and gain on the same split, per category
- [ ] Pack shipped; stub test passing; MANIFEST row filled
- [ ] M1 serving VQA in the running system (with Shreyash)

---

## 4. Phase 2 — Build (Oct–Nov): M2, M3, M4, M5

Order follows `03` §13 and the curriculum in `01` §34 — **measure each standing alone before the router uses it.**

### 4.1 M2 — Grounding adapter
- Corpus: VRSBench object references (52,472), official split.
- Contract: `{boxes, scores, labels}` in pixel space; Shreyash's evidence layer converts to EPSG:4326 when the input is georeferenced **[audit A1]**.
- Report Acc@0.5 and mAP@0.5 **with the 39.6 % anchor beside it** — 40 % is state of the art, not failure (ADR-002).
- Define the target vocabulary with Shreyash: which classes at submission, which after M2 **[audit B9]**.

### 4.2 M3 — Change / change-VQA
- Architecture: shared (Siamese) encoder → difference module → mask head + change-VQA head (`03` §6).
- Corpus: CDVQA (2,968 pairs, 122k+ QA), official split.
- Output levels 1–4 of the change hierarchy; level 5 stays with the answer layer (CHG-02).
- Robustness: a deliberate 2-px misregistration must lower confidence, not create change (CHG-06, EVL-08).
- Consider SAR bi-temporal pairs (flood extent) — high value for Indian disaster use (audit C).

### 4.3 M4 — SAR encoder + late fusion
- Separate small encoder (ResNet-50 or small ViT) on Sentinel-1 — **never** SAR as a greyscale PNG into the optical path (ADR-003).
- Data: BigEarthNet v2 S1 patches — start with the 2.5 GB Lithuania-summer subset, stream the rest on the GPU host; geographic tile-level splits (DAT-03, DAT-04).
- **Generalise beyond Sentinel-1 VV/VH:** RISAT uses C-band with HH/HV-type polarisations; Cartosat-2S optical includes a single panchromatic band. Train and test with polarisation- and band-agnostic inputs **[audit B4]**.
- The cross-modal ablation is yours: optical-only, SAR-only, optical + SAR on the same set — the third must beat both (EVL-06). If fusion adds < 2 points, revisit per ADR-005.

### 4.4 M5 — Router classifier (optional upgrade)
- 5–20k synthetic paraphrases across the four tasks plus refusal-bait and two-tool queries (`03` §8).
- Shreyash writes the **held-out** set blind to both the rules and your training data; you never see it before the final number (RTR-07, EVL-02). Include implicit-temporal phrasings like RQ-5 (*"has the built-up area increased…"*).
- Swap in only if it beats the rules on the held-out set.

### 4.5 Benchmarks for the scored suites
- RSVQA (LR/HR) and CDVQA loaders on official splits; per-category reporting.
- Output in the batch format the evaluator will use **[audit B1]** — the same format feeds the results dashboard.

---

## 5. Phase 3 — Venue readiness (Nov → Dec)

| Item | Target | TRD |
|---|---|---|
| 4-bit quantised base + adapters | loads on a **6 GB** laptop GPU, no OOM | ADP-08, NFR-07 |
| Adapter swap | < 200 ms between requests | ADP-07, NFR-08 |
| Single-image latency with the model | < 8 s p95 | NFR-01 |
| Pre-computed results for every demo scene | produced from the real model, labelled in the trace | ADP-09, TRC-04 |
| Test on the **actual venue laptop** | November, not December | `05` §4 |

A 4-bit 7B is ~4.5 GB — it does not fit 4 GB. If the venue machine is weaker than 6 GB: CPU inference (slow), a 2B-class base (costs accuracy), or pre-computed results (`09` §3.2). Decide in November.

---

## 6. Calendar

| When | Deliverable | Gate |
|---|---|---|
| 11–12 Sep | Environment + resume proof; VRSBench on Kaggle | — |
| **13 Sep** | **Zero-shot table, both bases** | **the real gate** |
| 14 Sep | Base chosen; stub pack agreed with Shreyash | — |
| 14–18 Sep | M1 training | converging by 18 Sep |
| 19–22 Sep | M1 evaluation, gain, pack, MANIFEST | **22 Sep** |
| Oct | M2, M3; RSVQA/CDVQA loaders | each measured standing alone |
| early Nov | M4 + cross-modal ablation; M5 if pursued | fusion beats both singles |
| mid Nov | Quantisation; venue-laptop test | fits 6 GB |
| Dec | Finale — no new training | — |

> **Deadline caveat.** If the portal deadline is confirmed as **20 Sep**, the submission carries the zero-shot table and M1-in-progress evidence; the 22 Sep adapted number becomes Build-phase work. Confirm with the SPOC.

---

## 7. Rules you work under

1. **Report what was measured** — `XX.X` until a run fills it (EVL-01).
2. **The gain, not the absolute** — no adapted number without its zero-shot twin (ADP-04).
3. **Official splits unmodified; self-built splits geographic at tile level; never random** (ADR-006).
4. **SAR has its own path** (ADR-003).
5. **One adapter before four** — no M2 work until M1's Phase-1 exit is ticked (`10` rule 5).
6. **Anchors beside every number** — 39.6 % grounding is state of the art (EVL-03).
7. **Nothing heavy on the laptop** — the corpus lives where the GPU lives.

---

## 8. Risks

| Risk | Mitigation |
|---|---|
| Zero-shot slips past 13 Sep | Start it before anything else; it needs no training |
| A run dies at hour 8 | Resume proven on day one |
| bf16 errors on T4 | fp16 from the first config |
| Gain looks small because GeoChat was chosen | That is why both bases are benchmarked first |
| Domain gap to Cartosat/RISAT | Band/polarisation-agnostic inputs; stress suite; Indian imagery where obtainable |
| Venue GPU < 6 GB | Decide in November: CPU, smaller base, or pre-computed |
