# How this repo is organised

*Proposed by Shreyash, 8 September 2026. Mridul has not agreed to this yet — if any of it is wrong for how you want to work, change it and say so rather than working around it.*

## The model

Two long-lived branches, one per person. `main` receives finished products.

```
main ──────────●─────────────────────●────────────────▶   only complete products
                \                   /
   shreyash ─────●───●───●───●───●─┘   ← my day-to-day work, pushed freely
                  \
   mridul ─────────●───●───●───●───●──▶ ← his day-to-day work, pushed freely
```

- **Work on your own branch. Push to it as often as you like.** It is yours; nobody reviews it, nothing has to be finished.
- **`main` is not a working branch.** A product lands there once, whole, when it is actually done — not incrementally.
- **Nobody commits to the other person's branch.** Read it, borrow from it, never write to it.

## The one rule that makes it safe

**Only ever add or edit files under your own product folders. Never touch anyone else's.**

This is not politeness, it is mechanics: git merges by path. If your branch *deletes* a file the other person owns, merging your branch into `main` deletes it there too — your "clean tidy-up" silently removes his work. As long as each branch only ever touches its own paths, every merge to `main` is a pure addition and can never conflict, no matter how long the branches diverge.

Concretely: nothing on `shreyash` has ever modified or deleted anything under `Mridul/`, and it never will.

## Layout

`main` is organised by **product**, not by person. A product folder is self-contained — its own README, its own docs, its own code.

```
dark-transit/          Shreyash · SIH26143 (NTRO) — oil-spill detection + vessel attribution
Mridul/                Mridul's work, in his own layout
analyses/<name>/       problem statements each of us worked up and did not take
research/              shared reference, see below
BRANCHING.md           this file
PS26143_Brief.md       shared
sih_2026_problem_statements.{html,json}, SIH_2026_Problem_Statements.pdf   shared
```

**`research/problem-statements/`** is shared reference, not anyone's product: all 229 SIH 2026 problem statements scraped, parsed and chunked, plus `parse_ps.py` and a first-pass ranked shortlist of 89. It is the parsed form of `sih_2026_problem_statements.html`, which is already at the root of `main`. Use it instead of re-scraping; re-run the parser against a fresh `ps1.html` if it needs refreshing. If you touch it, expect the other person to be reading it.

**`analyses/`** is namespaced per person (`analyses/shreyash/`, `analyses/mridul/`) precisely so two write-ups of the same problem statement cannot collide. See `analyses/shreyash/README.md` — my PS26073 and PS26167 copies are a later edit of the same documents that sit under `Mridul/`, and that is worth resolving deliberately rather than by whoever pushes last.

## Landing a product on main

When it is genuinely finished:

```bash
git fetch origin
git rebase origin/main            # or merge; either way, resolve on your branch
# open a PR from your branch to main, or:
git checkout main && git merge --no-ff shreyash
git push origin main
```

`--no-ff` so the merge is one commit on `main` and the product reads as a single unit, which is the point.

**Nothing has landed on `main` yet.** `dark-transit/` is a product requirements document, a technical spec and a working MVP — not a finished product. It stays on `shreyash` until the SIH portal submission is made (deadline 20 September 2026).

## Reading the other branch

```bash
git fetch origin
git log --oneline origin/mridul
git show origin/mridul:<path>              # one file, without switching
git diff origin/main origin/mridul --stat  # what he has added
git worktree add ../SIH-read origin/mridul # a whole checkout, read-only in practice
```

Do not `git merge origin/mridul` into your own branch. There is no reason to carry his work in your history, and it makes your eventual merge to `main` harder to read.

## Local setup on my side

`shreyash` is checked out in a git worktree at `~/Work/SIH-shreyash`, so my private local repo can stay on its own branch in `~/Work/SIH` without either interfering with the other.
