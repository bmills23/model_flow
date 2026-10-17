# HANDOFF (written from the tree, 2026-10-16, end of M4)

Resume: start a fresh session in `~/repos/model_flow`, read this file, then `docs/ROADMAP.md` (sections 7
and 8) and `docs/DECISIONS.md`. Statuses are claims: grep the tree before acting on an open row or skipping
a done one.

## State of the tree
- `m4-exposure-risk` carries M4 (not yet merged to main; merge and push are Bryan's call). Before M4 the
  tree was `main` at M3. Gate: lint, prettier, typecheck, engine 551 (40 files), data 33 (3 files), web 224
  (29 files), `docs:check`, `data:check`, build. Pages deploys from main:
  https://bmills23.github.io/model_flow/
- Branches: `m0-foundation`, `m1-groundwater-engine`, `m2-vadose-leaching` and `m3-saturated-source` are
  ancestors of main (safe to delete). `m1-groundwater-ui` is NOT an ancestor of main (its commits from
  10931c1 to 5d6c6c7 carry different hashes from what landed); confirm its content is on main before
  deleting it.
- CI cost: about 3 billed minutes per push to main; docs-only pushes trigger nothing.

## M4 landed (chemical and toxicity database, direct exposure and forward risk, Ch. 3, 6, 7)
- Methods note `docs/methods/exposure-and-risk.md` and data plan `docs/methods/chemical-database.md`
  (RSL November 2024, the current edition as checked on EPA's site 2026-10-16). Rulings: DECISIONS.md M4
  block and the E1, E2, E3 and D1 blocks.
- Data: `packages/data/src/rsl/` reads the three raw RSL files (`packages/data/raw/rsl/2024-11/`, checksummed
  by `manifest.json`) with `read-excel-file` 9.3.12 (exact-pinned devDependency). Output
  `packages/data/generated/rsl-2024-11/{chemicals,tox}.json`, 890 rows each. `id` is the CAS number, or
  `<cas>-<name-slug>` where one CAS has several rows; blank values are omitted; `special` is
  `trichloroethylene` or `vinyl-chloride`. Scripts: `pnpm data:generate` (`build-rsl.ts`) and
  `fetch-rsl.ts` (manual; refuses an existing edition directory). Root `data:check` is in the gate.
- Engine `packages/engine/src/processes/exposure/`: `units.ts` (SI, 365-day year), `legacy.ts` and
  `receptorsLegacy.ts` (RAGS 1989), `dermal.ts`, `lifeStages.ts`, `modern.ts` and `receptorsModern.ts`
  (RAGS E/F, 2014 defaults, ADAF), `averaging.ts`, `epc.ts` (`constantEpc`, `seriesEpc`,
  `groundwaterBreakthrough`, the M1 adapter), `checks.ts`, `scenario.ts` (`runLegacyScenario`,
  `runModernScenario`), `index.ts`. Risk in `packages/engine/src/processes/risk/` (`additivity.ts`,
  `summary.ts`). Registered as `exposure.rags-a-1989` (legacy) and `exposure.rags-e-f-2014` (modern); there
  is no separate risk method.
- Web `apps/web/src/risk/` at `#/risk` (lazy-loaded): chemical picker over the RSL JSON (separate chunks,
  loaded on demand; the physical-property chunk is the derived `risk-chemicals.json`, about a quarter
  of the full `chemicals.json`), receptor panels (one or two), legacy versus modern comparison, stacked contribution
  bars, warnings and toxicity sources. `transport/wellFeed.ts` lets a transport result feed the well
  concentration, with origin shown as `transport.<method>`. Zero overflowing elements at 390x844 and 1280,
  light and dark (check script `scratchpad/cdp-check.mjs`, outside the repo).
- References: 32 `used`, 45 `planned`, 5 `fixture`, 3 `data`. Ten references were flipped to `used` by the
  M4 methods (titles were already real). The 28 `planned` references with square-bracketed descriptor
  titles are unchanged.
- Deferred from M4 (the ROADMAP row says so too): target-organ segregation of the hazard index (the total HI
  is reported with a warning above 1), CompTox gap filling (a blank RSL value stays absent), series EPCs on
  soil pathways (RangeError, soil is constant).
- Dermal water: the organic or inorganic form comes from the database (`dermalForm`, derived from the
  published tap water dermal values, see DECISIONS.md slice E2). The screen starts at that form and lets
  the user change it; with no database form the dermal water pathway is not quantified until one is set.

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
- `docs/ATTRIBUTIONS.md` reads "Generated 2026-10-17", a date after this tree's 2026-10-16 work. The
  generator reproduces that file byte for byte, so the date source needs checking before the next docs pass.
- `groundwater-kernel.test.ts` (one 5 s timeout) failed once in the closing gate under machine load and
  passed alone (22 of 22). Re-run that file alone before treating it as a regression.
- Optional extras, not scheduled: persist the vadose, saturated and well feeds across reloads; the transport
  charts measure the padded figure and render about 7 percent small; the web bundle is over 500 kB.
- The 390x844 viewport check scripts are not in the repo. Recreate them when needed: headless Chrome with
  remote debugging, Emulation.setDeviceMetricsOverride (390x844, mobile, scale 2) before navigating,
  count elements whose bounding rect right edge exceeds clientWidth; the count must be 0.
- Manual text extraction lives outside the repo; re-extract when needed:
  `pdftotext -layout "~/Downloads/RISC5 Users Guide -- Nov 2014 (2).pdf" <out>.txt`
  (the appendix line index in ROADMAP section 3 refers to that extraction).

## Queued: M5 cleanup levels (ROADMAP section 7)
- Back-calculation for direct and modeled pathways, individual vs cumulative options, MCL and user targets;
  Brent solver (secant for parity checks). EPA Soil Screening Guidance 1996/2002 leaching with a dilution
  attenuation factor. Start from `docs/ROADMAP.md` section 7 and `docs/DECISIONS.md`.
