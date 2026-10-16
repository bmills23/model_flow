# HANDOFF (written from the tree, 2026-10-16, end of M3)

Resume: start a fresh session in `~/repos/model_flow`, read this file, then `docs/ROADMAP.md` (sections 7
and 8) and `docs/DECISIONS.md`. Statuses are claims: grep the tree before acting on an open row or skipping
a done one.

## State of the tree
- `main` carries M3 (merged from `m3-saturated-source`). Gate green locally: lint, prettier, typecheck,
  engine 360 + data 11 + web 179 tests, `docs:check`, build. Pages deploys from main:
  https://bmills23.github.io/model_flow/
- Branches: `m0-foundation`, `m1-groundwater-engine`, `m2-vadose-leaching` and `m3-saturated-source` are
  ancestors of main (safe to delete). `m1-groundwater-ui` is NOT an ancestor of main (its commits from
  10931c1 to 5d6c6c7 carry different hashes from what landed); confirm its content is on main before
  deleting it.
- CI cost: about 3 billed minutes per push to main; docs-only pushes trigger nothing.

## M3 landed (saturated soil source, Appendix C)
- Methods note `docs/methods/saturated-soil-source.md` (scope, equations in our words, validity checks,
  warning codes, coupling, fixture plan). Scope: legacy `saturatedSource.two-region` (constant release
  until exhausted) and modern `saturatedSource.exponential` (first-order source, the exponent-1 case of
  Falta 2005), both with water-table fluctuation. Deferred: general power-law exponent, mixture-wide
  residual test and multicomponent dissolution; region 1 volatilization to M6; cleanup back-calculation
  to M5.
- Default rulings applied (in DECISIONS.md, open to overturn): fluctuation at the annual-mean release rate
  with an optional seasonal schedule; region 1 water content from the M2 unit-gradient helper; release
  into an AT123D box of the source plan size from the water table down to the high-water saturated
  thickness.
- Engine `packages/engine/src/processes/saturatedSource/` (geometry, partitioning, release, coupling,
  checks). Fixtures in `packages/engine/test/fixtures/saturatedSource/`: SSG 1996 Table 3-A soil
  saturation limits for six chemicals, the BIOSCREEN source-mass example, Falta 2005 exponent 0 and 1,
  two hand cases at 1e-9, and mass identities with M1 and M2 at 1e-12 and 1e-6.
- Web `apps/web/src/saturated/` at `#/saturated`: inputs, cross-section sketch, release-rate and
  remaining-mass charts with the depletion time marked, region table with warnings, and a feed into the
  transport screen. Seasonal schedules keep their seasons while the feed fits 48 steps; beyond that they
  fall back to whole-year steps carrying the seasonal schedule's exact delivered mass (with or without
  decay). A saturated-fed transport run takes porosity, Darcy flux and retardation from the saturated
  run. For a source that never reaches the water table the screen keeps its typed mixing depth while the
  engine coupling uses a patch (recorded in DECISIONS.md and the methods note). Zero overflowing elements
  at 390x844 and 1280, light and dark.
- The M2 speed test now asserts on the fastest of five timed runs (it flaked under full-suite load).
- References: 22 `used`, 50 `planned`, 4 `fixture`, 3 `data`. `cline1991` stays `planned` and is not
  cited (only its Crossref metadata could be checked); `feenstra1991` and `falta2005` were checked against
  their abstracts only.

## Open items
- Schulze-Makuch 2005 coefficients (0.20, 0.44) come from lecture notes quoting the paper, not from the
  paper's own table; per-medium coefficients and the data range are not encoded, so the method has no
  range warning. Stays open until someone supplies the paper's PDF.
- The Gelhar et al. 1985 vadose dispersivity regression coefficients come from the manual's account only;
  they were not checked against the EPRI report.
- Galya 1987 is a horizontal plane-source paper; the box source derives from Yeh 1981 (the methods note
  says so; the ROADMAP section 3 row is annotated).
- 28 references still carry square-bracketed descriptor titles (status `planned`); replace each with its
  verified published title when a milestone marks it `used` (a test enforces this).
- Optional extras, not scheduled: persist the vadose and saturated feeds across reloads; the transport
  charts measure the padded figure and render about 7 percent small; the web bundle is over 500 kB.
- The 390x844 viewport check script is not in the repo. Recreate it when needed: headless Chrome with
  remote debugging, Emulation.setDeviceMetricsOverride (390x844, mobile, scale 2) before navigating,
  count elements whose bounding rect right edge exceeds clientWidth; the count must be 0.
- Manual text extraction lives outside the repo; re-extract when needed:
  `pdftotext -layout "~/Downloads/RISC5 Users Guide -- Nov 2014 (2).pdf" <out>.txt`
  (the appendix line index in ROADMAP section 3 refers to that extraction).

## Queued: M4 chemical and toxicity database, direct exposure and forward risk (ROADMAP section 7)
Not started.
