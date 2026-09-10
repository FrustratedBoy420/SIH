# SIH 2026 — National Round

VIT Bhopal team, 6 members. Won the internal hackathon (result 31 Aug 2026) and
nominated to Smart India Hackathon 2026 nationals.

**Portal submission closes 20 September 2026.** Grand finale is a 36-hour build.

## Status

Starting fresh. The internal-round entry (SAAKSHYA — FRA rejection-recovery
platform, built against SIH 2025's PS 25108) is **not** being continued: there is
no Ministry of Tribal Affairs / Forest Rights problem statement in the SIH 2026
list. All of that work is archived in `internal-hackathon/`.

Problem statement for the national round: **not yet chosen.**

## Layout

| Path | What |
|---|---|
| `research/problem-statements/` | All 229 SIH 2026 problem statements, scraped and parsed |
| `internal-hackathon/` | Archive of the internal round (SAAKSHYA / FRA-NEXUS) |

## The problem statement dataset

Scraped from <https://www.sih.gov.in/sih2026PS> on 1 Sep 2026 — the portal ships
all 229 statements in one page and paginates client-side.

- `sih2026_ps.json` — 229 records: id, title, org, department, category, theme,
  full description, dataset link, deadline
- `chunks/` — the same content as 16 readable markdown files
- `parse_ps.py` — the parser (re-run against a fresh `ps1.html` to refresh)

Breakdown: 175 software, 54 hardware, 17 themes, 30 sponsoring organisations.
Largest sponsors: AICTE (34), Ministry of Earth Sciences (30), NTRO (23),
ISRO (11), Ministry of Home Affairs (11). Every statement is due 20 Sep 2026.
