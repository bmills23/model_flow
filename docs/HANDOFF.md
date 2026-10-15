# HANDOFF (written from the tree, 2026-10-15, end of M0 session)

Resume: start a fresh session in `~/repos/model_flow`, run `/architect on`, read this file, then
`docs/ROADMAP.md` (sections 7 and 8) and `docs/DECISIONS.md`. Statuses are claims: grep before acting.

## State of the tree
- `main` at the commit after bcfce84 (CI cost recorded), pushed; working tree clean; branch
  `m0-foundation` fully merged (safe to delete).
- Gate green locally and in CI: lint, prettier, typecheck, 49 engine + 11 data + 7 web tests,
  `docs:check`, build. Pages live at https://bmills23.github.io/model_flow/ (build_type workflow).
- CI cost: about 3 billed minutes per push to main; docs-only pushes trigger nothing.

## M0 landed
- Monorepo (pnpm 12.11.2 via `corepack pnpm`, Node 24, TypeScript 6.0.3, Vite 8, vitest 5, React 19).
- `packages/engine`: numerics (special functions, Gauss-Kronrod and tanh-sinh quadrature, Brent and
  secant, xoshiro128** PRNG, Latin hypercube, units), `MethodRegistry`, references (75 entries, 4 used),
  dispersivity process (legacy Gelhar 1985 + API 1987 ratios; modern Xu and Eckstein 1995 + BIOSCREEN
  ratios).
- `packages/data`: `renderAttributions`, `renderThirdPartyLicenses`, `renderStable` (date moves only
  on content change), `generate-docs.ts`; generated `docs/ATTRIBUTIONS.md` and
  `docs/THIRD_PARTY_LICENSES.md` are committed and checked by the gate.
- `apps/web`: responsive shell (six-step nav placeholders, Methods & References page, non-affiliation
  footer), zero overflow at 390x844 (CDP check).

## Known debt
- 42 of 75 references have square-bracketed descriptor titles (status `planned`). Replace each with its
  verified published title when a milestone marks it `used` (a test enforces this for `used` entries).
- Manual text extraction lived in a per-session scratchpad; re-extract when needed:
  `pdftotext -layout "~/Downloads/RISC5 Users Guide -- Nov 2014 (2).pdf" <out>.txt`
  (appendix line index in ROADMAP section 3 refers to that extraction).

## In flight: M1 groundwater transport (ROADMAP section 7)
Bryan's directive (2026-10-15, verbatim, in reply to the proposed four-agent shape): "go, engine first,
UI as a second wave".

- Wave 1 (engine), dispatched 2026-10-15 as Dispatch 2 (Sonnet, architect-worker-medium) on branch
  `m1-groundwater-engine`: AT123D-class Green's-function kernel (3-D ADE, box source, pulse and
  time-varying loading, well-screen averaging), Wexler 1992 PATCHI/PATCHF option with USGS ANALGWST
  fixtures (gfortran 15 at /usr/local/bin/gfortran), Domenico comparison mode with validity warnings,
  mibitrans cross-check fixtures if the package installs, methods note, references marked `used`,
  ATTRIBUTIONS regenerated, local gate green. No push, no UI.
- Wave 2 (UI), queued: scenario form, plan-view plume map, breakthrough chart, legacy-vs-modern overlay
  (dataviz skill; Observable Plot + d3 or ECharts), CDP check at 390x844 with zero overflow. One Sonnet
  worker.
- Then: one Haiku doc-validity check, one Fable review pass (timing decided at wave 1 close), one push.

## Session log
- Dispatch 1 (Sonnet, architect-worker-medium): all M0 implementation, about 240K tokens including one
  resume for the date-stability, retrieval-year and used-title fixes.
- Dispatch 2 (Sonnet, architect-worker-medium): M1 wave 1 engine. Launched 2026-10-15; in flight.
