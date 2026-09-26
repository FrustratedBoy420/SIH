# SatQuery AI — Technical Report (Team BUGHEBUG)

The full written account of the PS26167 approach: problem understanding, a
domain primer, the solution, the adapted model (M1) and its measured gain,
system design, tech stack, results, novelty, feasibility, scalability, impact,
design decisions, and the research references with hyperlinks.

| File | What |
|---|---|
| `SatQuery_AI_Technical_Report_Team_BUGHEBUG.pdf` | A4, clickable index with page numbers, PDF bookmarks, linked citations |
| `SatQuery_AI_Technical_Report_Team_BUGHEBUG.docx` | Same content, editable in Word; the index links to each section |
| `assets/` | Workstation screenshots used as figures |
| `build/` | The generator — edit `build/content.mjs`, never the outputs |

## Rebuild

Needs Node 20+, Google Chrome, and Python with `pymupdf`.

```bash
cd build
npm install          # docx, puppeteer-core (uses the installed Chrome), mermaid
node build.mjs       # writes both files into this folder
```

Set `CHROME_PATH` if Chrome is not at the default Windows location.

`content.mjs` is the single source: headings, tables, Mermaid diagrams, charts
and references are defined once and rendered to both formats, so the PDF and
the Word file cannot drift apart. Every number in it is taken from
`../models/MANIFEST.md`, `../models/results/` or `python -m satquery.cli eval`
— update it from those sources, not by hand.
