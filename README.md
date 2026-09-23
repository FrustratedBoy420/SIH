# SIH 2026 — National Round

VIT Bhopal team. Two idea submissions, one folder each. Nothing belonging to one
problem statement lives in the other's folder.

| Folder | What |
|---|---|
| [`167/`](167/) | **PS26167 — SatQuery AI** (ISRO). Multimodal satellite-imagery question answering: the `satquery` package, the web workstation, model training, docs, ADRs and the idea deck. Start with [`167/README.md`](167/README.md). |
| [`143/`](143/) | **PS26143 — Dark Transit.** PRD, technical spec, model orchestration plan, MVP and artifacts. Start with [`143/README.md`](143/README.md). |
| [`extra/`](extra/) | Everything that belongs to neither: the official problem-statement dump and shortlist, the SIH idea-presentation template and past winning decks, the PS26073 analyses that were not taken forward, and the archived internal-hackathon entry (SAAKSHYA, PS 25108). |

## Rule: `main` only

**Work on `main` and nowhere else.** Do not create branches, and do not commit
to one. Pull before you start (`git pull --rebase`), commit small, push when
selftest passes. This applies to people and to coding agents alike.

The earlier branches' histories are merged into `main`, so `git log` still
reaches all of their commits.
