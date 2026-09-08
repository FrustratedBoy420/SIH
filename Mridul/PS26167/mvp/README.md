# SatQuery AI — reference implementation

Runnable pipeline for **SIH26167** (ISRO): satellite imagery plus a natural-language question in, an evidence-grounded answer with an auditable execution trace out.

**Status: scaffold.** The package exists, no modules are written yet. The build contract is `../docs/03_Model_Specification.md` — every architectural decision, dataset URL, Hugging Face ID, LoRA config and accuracy target lives there, and this README does not repeat them.

---

## The one rule this implementation exists to enforce

> Vision models produce the facts. The language model only phrases them. **Never the reverse.**

A count of 14 buildings comes from a vision model and is validated before a sentence is written about it. The language layer never sees pixels, so it can never invent a number. Everything in the module map below follows from that.

---

## Planned module map

Flat package, one module per concern, matching the convention in `dark-transit/mvp/`.

| Module | Does | Spec component |
|---|---|---|
| `raster.py` | GeoTIFF/TIFF reading — CRS, geotransform, bands, sensor identification | supporting |
| `validate.py` | Input compatibility checking, and the **refusal** path | requirement 5 |
| `registry.py` | The predefined tool registry — the agent picks from it, never invents | requirement 5 |
| `router.py` | Classify → validate → select → sequence → execute | **M5** |
| `base.py` | Base VLM loader, 4-bit quantisation, LoRA adapter swapping | **M0** |
| `vqa.py` | Remote-sensing VQA | **M1** ← the mandatory adaptation |
| `grounding.py` | Text-guided region grounding, boxes and scores | **M2** |
| `change.py` | Bi-temporal change detection and change-VQA | **M3** |
| `sar.py` | SAR encoder and optical–SAR late fusion | **M4** |
| `evidence.py` | Normalised evidence schema, confidence, pixel → geographic coordinates | supporting |
| `answer.py` | Constrained generation and abstention below threshold | **M6** |
| `trace.py` | The observable execution trace — this is what ISRO scores | requirement 5 |
| `pipeline.py` | Orchestration, stage artefacts | — |
| `cli.py` | Subcommands | — |
| `server.py` | HTTP API | — |
| `tests.py` | Selftest | — |

## Directory layout

```
mvp/
├── README.md          this file
├── .gitignore
├── satquery/          the package
├── configs/           LoRA YAML, model registry, thresholds
├── web/               front end — map viewer, chat, trace panel
├── data/              datasets                    (gitignored)
├── adapters/          trained LoRA weights        (gitignored)
└── runs/              pipeline outputs            (gitignored)
```

`data/`, `adapters/` and `runs/` are gitignored deliberately — see below.

---

## Build order — the router comes LAST

From spec §13. This ordering is not a preference:

```
1. raster + validate      the pipeline can read a GeoTIFF and refuse a bad one
2. vqa (M1)               single image → answer.  MEASURE IT.
3. grounding (M2)         now you have spatial evidence
4. change (M3)            T1 + T2 → change map
5. sar (M4)               complementary evidence
6. router (M5)            ← LAST
7. evidence + trace + web + server
```

**Build the router first and it becomes a place for weakness to hide.** A wrong answer could be a bad route or a bad model, and from the outside those look identical. Measure each specialist standing alone, then add the router and measure dispatch accuracy — now every failure has exactly one address.

Steps 2–5 also hand you ablation rows B through D for free.

---

## What will be real and what will be simulated

State this honestly in the README as the code lands, the way `dark-transit/mvp` does. A judge who finds an undisclosed simulation stops believing the disclosed ones.

Known in advance:

- **The ISRO/SAC evaluation set cannot be obtained.** Cartosat-2S and RISAT pairs with undisclosed annotations. Every number this package reports comes from public benchmarks, and the domain gap to Indian sub-metre imagery is real and should be stated.
- **Co-registration is not implemented as research.** The scored data arrives pre-registered. `validate.py` checks alignment; it does not solve it.

---

## Why `data/`, `adapters/` and `runs/` are gitignored

BigEarthNet's full imagery is **~145 GB**. A single LoRA adapter is 50–200 MB and there will be several. Neither belongs in a git repository, and a stray `git add .` that pulls in a checkpoint is painful to undo once pushed.

Fetch datasets by streaming from Hugging Face — see spec §2. Adapters are build artefacts: reproduce them from `configs/` rather than committing them.

---

## Repository etiquette

This folder is inside `Mridul/`, which is Mridul's lane under the model in `../../../BRANCHING.md`. Work here lands on the `mridul` branch. Nothing here should ever add, edit or delete a path outside `Mridul/` — that rule is what keeps every merge to `main` a pure addition that cannot conflict.

---

## Reference

- `../docs/00_Official_Problem_Statement.md` — the authoritative problem statement
- `../docs/01_Complete_Deep_Analysis.md` — domain foundations, datasets, architecture, evaluation
- `../docs/03_Model_Specification.md` — **the build contract.** Start here
