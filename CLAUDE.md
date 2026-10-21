# model_flow: project instructions for agents

Read `docs/ROADMAP.md` (plan of record, milestone statuses maintained in place) and `docs/DECISIONS.md`
before doing anything. Statuses are claims: grep the tree before acting on an "open" row or skipping a
"done" row.

## Working rules
- Personal open-source project (MIT), $0 hosting. Cheapest viable path: local gate first, one push per
  milestone or logical unit, no cloud fleets, Sonnet or Haiku workers for implementation.
- TDD for every engine, data and UI change: failing test first, then the implementation. Fixture
  tolerances are only widened with a DECISIONS.md entry.
- Clean room: implement from the primary publication; the RISC5 manual is a map of RISC5's choices
  only. Never copy its prose, figures or tables. Never inspect the RISC5 binary. No GPL code vendored.
- Every registered method declares citations that exist in `packages/engine/src/references/references.json`
  with status `used`; the test suite enforces it. Never invent DOIs, volumes, pages or report numbers.
- Attributions (science, data provenance) and third-party software licences are separate generated
  documents: `docs/ATTRIBUTIONS.md` and `docs/THIRD_PARTY_LICENSES.md`. Regenerate with
  `corepack pnpm docs:generate`; their "Generated" date moves only when content changes.
- SI units inside the engine; RISC-style units only at input and output boundaries. All randomness seeded.
- Web: mobile and desktop, light and dark, no UI framework. Before calling a screen done, verify at a
  true 390x844 viewport through CDP device emulation with zero overflowing elements.
- Never use an em dash in any text. No personal contact addresses on any public surface.

## Commands
```
corepack pnpm install
corepack pnpm gate                          # lint, format check, typecheck, tests, docs check, build
corepack pnpm --filter @model-flow/engine test
corepack pnpm --filter @model-flow/web dev
BASE_PATH=/model_flow/ corepack pnpm --filter @model-flow/web build
```

## CI
Workflows: `.github/workflows/ci.yml` (push to main and PRs; docs and markdown ignored; cancel in
progress) and `pages.yml` (deploy to GitHub Pages on main). CI confirms, it does not discover: push only
after a green local gate. Measured cost per push to main (2026-10-18, runs 39154922836 and 39154922957): CI gate job 2 min 50 s, Pages
build 26 s plus deploy 10 s, so about 5 billed minutes per push (each job rounds up to a minute). It was about 3
before M8: the surface water web tests (`apps/web/src/surfaceWater/compute.test.ts`) dominated the gate job until wave G cut that file from 205 s to 11.7 s.
Re-measured 2026-10-19 after M7, M9, M10 and M11 (runs 39260793655 and 39260793635): gate 2 min 38 s, Pages
build 24 s plus deploy 42 s, still about 5 billed minutes. Re-measured 2026-10-19 after waves G and H (runs
39298427676 and 39298427401): gate 2 min 26 s, Pages build 20 s plus deploy 11 s, about 5 billed minutes (3 for the
gate, 1 each for build and deploy). Re-measured 2026-10-19 after wave I (runs 39317507123 and 39317507269): gate
3 min 46 s, Pages build 23 s plus deploy 8 s, about 6 billed minutes (4 for the gate); the gate job grew by about
80 s with wave I. Wave J measured the local suites at engine 21 s and web 40 s (from 41 s and 128 s on a loaded machine); Re-measured 2026-10-21 after wave J (runs 39627501560 and 39627501542): gate 3 min 19 s, Pages build 19 s plus deploy 10 s, about 6 billed minutes (4 for the gate, 1 each for build and deploy). The repo is public, so standard-runner minutes do not count
against the account's included minutes; keep the local-gate-first rule anyway.
Pushes that touch only docs or markdown trigger nothing.
