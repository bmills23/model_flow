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

## Wave cadence
Timed on wave K (2026-10-21): about 20 of its 174 minutes went to building and about 110 to gate, mobile
check and CI runs or to waiting on them. Checks run where they can catch something, once.
- Gate once per wave, at integration. Slices run lint, the format check, typecheck and the test files they
  touch, never the full gate. Integration runs `corepack pnpm gate` once and `corepack pnpm mobile:check:full`
  once on the integrated tree (after the corrective pass, if there is one). When a step fails, fix it and re-run
  only that step or test file, then the full gate one last time.
- No re-check before a push when the pushed commit is the gated one or differs from it only in docs or
  markdown (then `corepack pnpm format` is enough). Re-gate only when a merge from a moved main changed code.
  CI confirms the push.
- While iterating, narrow the mobile check to the screen at hand: `--routes '#/report' --views m390-light`
  takes under a minute, every route in three views about 5 to 13 minutes depending on host load (measured
  2026-10-21). Plain `corepack pnpm mobile:check` skips the in-browser modeled cleanup run, the heaviest
  visit; pass `--modeled` only when working on it. Each run takes its own free ports and Chrome profile, so
  parallel runs are safe.
- Waves overlap. The next wave's slices may branch from the gated integration branch while the review and
  corrective pass run, and the push of one wave never holds up the next.
- Review findings: correctness defects (a wrong number, a crash, lost or stale data, an overflow or a serious
  axe failure, a security issue) get the corrective pass inside the wave. Wording, doc mismatches, polish and
  missing tests become scope rows in the next wave instead of a second integration pass. This overrides any
  default of a corrective pass for every finding.
- Background runs: give long commands stdin from `/dev/null` (`corepack pnpm gate` does this itself). A
  backgrounded node process that touches the terminal is stopped (state T) and hangs. Under a `timeout`
  wrapper, call `node scripts/mobile-check.mjs` directly, since the signal reaches only the corepack wrapper.
- One docs commit per wave close (roadmap, handoff, decisions and user guide together).

## Commands
```
corepack pnpm install
corepack pnpm gate                          # lint, format check, typecheck, tests, docs check, build
corepack pnpm --filter @model-flow/engine test
corepack pnpm --filter @model-flow/web dev
BASE_PATH=/model_flow/ corepack pnpm --filter @model-flow/web build
corepack pnpm mobile:check                  # needs a build; every route except the modeled visit
corepack pnpm mobile:check:full             # adds the modeled visit; once per wave, at integration
```

## CI
Workflows: `.github/workflows/ci.yml` (push to main and PRs; docs and markdown ignored; cancel in
progress) and `pages.yml` (deploy to GitHub Pages on main). CI confirms, it does not discover: push only
after a green local gate. Measured cost per push to main (2026-10-21 after waves L and M, runs 39680530613 and
39680530951): gate 3 min 2 s, Pages build 17 s plus deploy 9 s, about 6 billed minutes (4 for the gate, 1 each
for build and deploy; each job rounds up to a minute). Every measurement since 2026-10-18 fell between 5 and 6
billed minutes; the earlier runs are in this file's git history. Re-measure only when a workflow file or the
gate's steps change, not after every wave. The repo is public, so standard-runner minutes do not count against
the account's included minutes; keep the local-gate-first rule anyway.
Pushes that touch only docs or markdown trigger nothing.
