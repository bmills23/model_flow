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

## Queued: M1 groundwater transport (ROADMAP section 7)
Proposed dispatch shape (Bryan has not yet said go): one Sonnet worker for the AT123D-class kernel
(Appendix B: Green's-function 3-D ADE, finite volume source, pulse and time-varying loading, well-screen
averaging) plus the Wexler 1992 PATCHI/PATCHF option with USGS ANALGWST fixtures (gfortran 15 is
installed); one Sonnet worker for the scenario form, plan-view plume map and breakthrough chart (load the
dataviz skill first; choose Observable Plot + d3 or ECharts); one Haiku doc-validity check; one Fable
review pass; then one push. TDD throughout; fixtures before implementation.

## Session log
- Dispatch 1 (Sonnet, architect-worker-medium): all M0 implementation, about 240K tokens including one
  resume for the date-stability, retrieval-year and used-title fixes.
