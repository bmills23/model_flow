# HANDOFF (written from the tree, 2026-10-17, end of M5, M6 and M8)

Resume: start a fresh session in `~/repos/model_flow`, read this file, then `docs/ROADMAP.md` (sections 7
and 8) and `docs/DECISIONS.md`. Statuses are claims: grep the tree before acting on an open row or skipping
a done one.

## State of the tree
- Branch `wave-m5-m6-m8` holds M5, M6 and M8 merged on top of main at M4 (`2d1a452`). It
  is not on main and not pushed; merging to main and pushing are Bryan's call. Gate on the branch: lint,
  prettier, typecheck, engine 954 tests (62 files), data 130 (6 files), web 407 (54 files), `docs:check`,
  `data:check`, build. Pages deploys from main: https://bmills23.github.io/model_flow/
- Branches that are ancestors of this branch (safe to delete once it lands): `m0-foundation`,
  `m1-groundwater-engine`, `m2-vadose-leaching`, `m3-saturated-source`, `m4-exposure-risk`,
  `m5-cleanup-levels`, `m6-vapor-models`, `m8-surface-water`. `m1-groundwater-ui` is NOT an ancestor (its
  commits from 10931c1 to 5d6c6c7 carry different hashes from what landed); confirm its content is on main
  before deleting it.
- Test time: `apps/web/src/surfaceWater/compute.test.ts` takes about 200 s, the web suite about 206 s, and
  the full local gate about 4 min 45 s.
- CI cost: about 5 billed minutes per push to main (measured 2026-10-18: gate job 2 min 50 s, Pages
  build 26 s, deploy 10 s); about 3 before M8. Docs-only pushes trigger nothing.
- Reference counts (`packages/engine/src/references/references.json`, 102 entries): 51 `used`, 38
  `planned`, 8 `data`, 5 `fixture`. The 18 `planned` entries with square-bracketed descriptor titles are
  the only bracketed titles.

## M5 landed (cleanup levels, Ch. 8)
- Methods note `docs/methods/cleanup-levels.md`. Rulings: DECISIONS.md "M5 cleanup levels scope" block
  (19 rulings).
- Engine `packages/engine/src/processes/cleanup/`: `direct.ts` (closed-form inversion of the nine M4
  direct pathways), `chains.ts` (modeled chains from the M1 dissolved source, the M2 vadose source and the
  M3 saturated source through the receptor well), `solve.ts` (Brent in ln C with a verified linear shortcut,
  secant as a parity diagnostic only), `targets.ts` (cancer risk, hazard quotient, MCL and user
  concentrations; individual, cumulative and equal allocation), `ssg.ts` (Soil Screening Guidance
  soil-to-groundwater level, DAF 1, 20 or site-specific, mass-limit level, Csat check), `checks.ts`,
  `index.ts`. Registered: `cleanup.rags-b-1991` (legacy), `cleanup.rags-e-f-2014`, `cleanup.ssg-leaching`
  and `cleanup.modeled-chains` (modern; the Brent solve is its own method so the root finder is cited where
  it runs).
- Web `apps/web/src/cleanup/` at `#/cleanup`: direct-pathway table, the soil screening leaching panel (DAF,
  MCL, user or tap water target, mass-limit level, published RSL SSL beside the computed level) and the
  modeled-chain section (worker run, convergence panel, metric chart on log axes). A blank or zero
  cumulative entry is shown as not quantified; an MCL not in mass per volume is never a target.
- Data: the RSL build (`packages/data/src/rsl/`) now carries the MCL (106 rows with a value, 25 `(G)`
  flagged by `mclGroup`, one `mclUnit` for asbestos fibers/L) and the published SSL columns (750 rows) in
  `generated/rsl-2024-11/tox.json`, and writes `cleanup-chemicals.json` (864 rows). Same RSL November 2024
  provenance as M4.
- Fixtures: SSG 1996 Table A-1 (30 values), the RSL MCL-based SSL (91 of 91 rows, in the data package
  test), RSL risk-based SSL and tap water levels, hand cases, round trips and identities.
- Deferred (the methods note and ROADMAP row list them): vapor chains as modeled targets, shower inhalation
  from tap water, particulates, irrigation, surface water as a target medium, plant uptake, TPH fractions,
  probabilistic levels, target-organ segregation, pH-dependent Kd and Koc.
- References: wave totals above (51 used, 38 planned, 8 data, 5 fixture).

## M6 landed (vapor models, App. D, E, F, J; K replaced)
- Methods note `docs/methods/vapor-models.md`. Rulings: DECISIONS.md "M6 vapor models scope" block and
  "M6 web slices W2 and W3" block.
- Engine `packages/engine/src/processes/vapor/` (`legacyJe.ts`, `dominantLayer.ts`, `epaJe.ts`,
  `devaull.ts`, `attenuationFactor.ts`, `pviScreen.ts`, `jury.ts`, `coupling.ts`, `source.ts`,
  `building.ts`, `henry.ts`, `textures.ts`, `units.ts`, `index.ts`) and
  `packages/engine/src/processes/outdoorAir/` (`box.ts`, `ssgVf.ts`, `qOverC.ts`, `emissions.ts`,
  `index.ts`; the interface M7 plugs into). Registered: `vapor.je-1991` (soil, soil gas and groundwater
  sources), `vapor.dominant-layer-1998`, `vapor.je-epa`, `vapor.devaull-2007`,
  `vapor.attenuation-factor-2015`, `vapor.pvi-screen-2015` (a verdict, not a concentration),
  `vapor.jury-bam` (zero water flux only), `outdoorAir.box` and `outdoorAir.ssg-vf-1996`.
- Web `apps/web/src/vapor/` at `#/vapor`: legacy and modern J&E on one input set, chemical picker over the
  vapor chemical data, log-axis vapor profile with strata bands, outdoor air box and SSG volatilization
  factor, attenuation factor and petroleum screen panels, Table R-3 check. Feeds: water table, vadose and
  saturated sources into the vapor screen; indoor and outdoor air (with method origins) into exposure and
  risk.
- Data: `packages/data/src/vapor/` builds `generated/vapor/vapor-chemicals.json` (112 chemicals) from the
  committed EPA 2004 J&E lookup table (`packages/data/raw/vapor/epa2004je/`, checksummed PDF and CSV)
  merged with the RSL values, plus the BioVapor k_w classes. Two lookup entries fail the plausibility
  screen and are listed in `screenedEpa2004je`; three rows are unmatched.
- Fixtures: Tables R-3, R-4 and R-5 (0.5 percent), the Appendix J example (loose), the EPA 2004 Appendix C
  worked example, VISL identity fallback, identities and hand cases, DeVaull against a finite-difference
  oxygen solve. Table R-6 is a named exception (printed value duplicates R-5).
- Deferred: Appendix K (see open items), PVIScreen sampling (M10), shower, sprinkler and particulates (M7),
  vapor cleanup levels, Jury with nonzero water flux, lateral offsets and three-dimensional models.
- References: wave totals above.

## M8 landed (surface water and sediment, App. L, M, N)
- Methods note `docs/methods/surface-water.md`. Rulings: DECISIONS.md "M8 surface water and sediment scope"
  block (stage 1 and the data slices D1 and D2).
- Engine `packages/engine/src/processes/surfaceWater/`: `legacy.ts` (well-mixed box), `discharge.ts`
  (Darcy), `reach.ts`, `sediment.ts`, `modern.ts` (bank-plane mass discharge), `transient.ts`,
  `downstream.ts`, `coupling.ts` (M1 and M4), `criteria.ts` (comparison, hardness equation), `scenario.ts`,
  `checks.ts`, `units.ts`, `index.ts`. Registered: `surfaceWater.well-mixed` (legacy) and
  `surfaceWater.mass-discharge` (modern).
- Web `apps/web/src/surfaceWater/` at `#/surface-water`: river and lake inputs, Darcy or entered discharge,
  legacy and modern curves overlaid for surface water and sediment, Table R-8 check, criteria panel with
  hardness input, and a surface water series offered to the risk screen as the swimming EPC (origin
  `surfaceWater.well-mixed` or `surfaceWater.mass-discharge`).
- Data: `packages/data/src/nrwqc/` builds `generated/nrwqc-2026-10-16/` (aquatic life 61 rows, human health
  128 rows, hardness table for 6 metals) from the committed EPA NRWQC pages in
  `packages/data/raw/nrwqc/2026-10-16/` (public domain, checksum manifest). `packages/data/src/sediment/`
  builds `generated/sediment-2026-10-16/benchmarks.json` (811 rows) from EPA Region 4 2018 Tables 2a, 2b and
  2c (committed PDF with checksum, CSVs with PDF pages and cell shading). 28 rows carry `basisInferred`.
- Fixtures: Table R-8, kernel identities (box limit, mass balance), hand cases, NRWQC and Region 4 spot
  values from the pages.
- Deferred: MacDonald et al. 2000 TEC and PEC (see open items), two-dimensional river mixing, estuaries,
  site-chemistry criteria, international criteria, ESBs and marine ERL and ERM, human contact with
  sediment, fish ingestion.
- References: wave totals above; `epanrwqc`, `epanrwqchh` and `epa2018r4era` are `data`.

## M4 landed (chemical and toxicity database, direct exposure and forward risk, Ch. 3, 6, 7)
- Methods note `docs/methods/exposure-and-risk.md` and data plan `docs/methods/chemical-database.md`
  (RSL November 2024, the current edition as checked on EPA's site 2026-10-16). Rulings: DECISIONS.md M4
  block and the E1, E2, E3 and D1 blocks.
- Review of M4: an independent review ran on the branch and its findings were fixed in the commits
  after `d9613db` (dermal form, receptor inputs, age segmentation, transport-year start, risk-only
  chemical subset, the generated-document date, the reference status of `epa2003toxhier`, and two
  timing checks made robust to load). Each fix has a test that failed first; the rulings are amended in
  place in DECISIONS.md.
- Data: `packages/data/src/rsl/` reads the three raw RSL files (`packages/data/raw/rsl/2024-11/`, checksummed
  by `manifest.json`) with `read-excel-file` 9.3.12 (exact-pinned devDependency). Output
  `packages/data/generated/rsl-2024-11/{chemicals,tox}.json`, 890 rows each. `id` is the CAS number, or
  `<cas>-<name-slug>` where one CAS has several rows; blank values are omitted; `special` is
  `trichloroethylene` or `vinyl-chloride`. Each analyte with a published dermal water value carries
  `dermalForm` ('organic' or 'inorganic', from the committed id list `packages/data/src/rsl/dermal-form.ts`).
  The build also writes `generated/rsl-2024-11/risk-chemicals.json` (about 27 percent of `chemicals.json`):
  the physical-property subset the web risk screen loads, checked byte for byte by the data test. Scripts: `pnpm data:generate` (`build-rsl.ts`) and
  `fetch-rsl.ts` (manual; refuses an existing edition directory). Root `data:check` is in the gate.
- Engine `packages/engine/src/processes/exposure/`: `units.ts` (SI; exposure years are 365 days, and the
  365.25-day `TRANSPORT_YEAR_S` is used only for a pinned exposure start and the start year shown; ruling 14), `legacy.ts` and
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
- References at the end of M4: 32 `used`, 44 `planned`, 5 `fixture`, 4 `data` (`epa2003toxhier` is `data`).
- Deferred from M4 (the ROADMAP row says so too): target-organ segregation of the hazard index (the total HI
  is reported with a warning above 1), CompTox gap filling (a blank RSL value stays absent), series EPCs on
  soil pathways (RangeError, soil is constant).
- Dermal water: the organic or inorganic form comes from the database (`dermalForm`, derived from the
  published tap water dermal values, see DECISIONS.md slice E2). The screen starts at that form and lets
  the user change it; with no database form the dermal water pathway is not quantified until one is set.
  The engine has no default form (`organic` is required), so an unknown form is never read as zero.
- Receptor panel: drinking water (L/day), skin area for water (cm2, also the swimming skin area) and
  breathing rate (m3/h, legacy only) are site-specific inputs; a blank keeps the preset. Age segmentation
  means a child plus an adult (more than one noncancer group); a child alone is not segmented, so the
  additive option runs for a child plus a worker.

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
- The M2 speed test asserts on the fastest of nine timed runs with a 250 ms bound (it flaked under full-suite
  load at a 50 ms bound; see the M4 review fixes for the rationale).
- `cline1991` stays `planned` and is not cited (only its Crossref metadata could be checked);
  `feenstra1991` and `falta2005` were checked against their abstracts only.

## Open items
- Schulze-Makuch 2005 coefficients (0.20, 0.44) come from lecture notes quoting the paper, not from the
  paper's own table; per-medium coefficients and the data range are not encoded, so the method has no
  range warning. Stays open until someone supplies the paper's PDF.
- The Gelhar et al. 1985 vadose dispersivity regression coefficients come from the manual's account only;
  they were not checked against the EPRI report.
- Galya 1987 is a horizontal plane-source paper; the box source derives from Yeh 1981 (the methods note
  says so; the ROADMAP section 3 row is annotated).
- 18 references still carry square-bracketed descriptor titles (all status `planned`); replace each with
  its verified published title when a milestone marks it `used` (a test enforces this).
- MacDonald et al. 2000 TEC and PEC values are not shipped. They were removed because they could not be
  verified; EPA 905/R-00/007 lists the PEC column only. Enter them, each with a page, when the article or a
  full public reproduction is available (`macdonald2000` is `planned`).
- The outdoor box cites Hanna, Briggs and Hosker 1982 (`hanna1982`). An ASTM E1739 attribution is
  unconfirmed and not cited.
- The Region 4 2018 sediment basis (dry weight or 1 percent OC) comes from cell shading. Rows flagged
  `basisInferred` (28) include the tan-shaded totals. The report contradicts itself on Florida coastal
  (Table 2a note says dry weight, the Table 2b note states no unit); recorded in DECISIONS.md.
- DeVaull 2007: no published numeric example was verified and the Appendix B text was unavailable. The
  oxygen balances are derived from the governing equation and checked against a numerical solve.
- VISL calculator values were not obtained. The attenuation-factor identity (against the RSL resident air
  values) covers two chemicals, benzene and naphthalene. Running the calculator for benzene,
  trichloroethylene, tetrachloroethylene, naphthalene and ethylbenzene remains open.
- SSG 1996 Table A-1 fixture: its Koc and H' inputs are unverified, so it checks the partition formula only.
  The RSL MCL-based SSL fixture (91 of 91) is the binding check.
- The SSG Appendix H benzene volatilization factor does not reproduce from its printed inputs and is not
  used. The RISC5 Table R-6 printed value duplicates R-5 and is a named exception.
- RISC5 Appendix K (oxygen-limited, degradation) is not implemented: its only source is an unpublished
  draft. DeVaull 2007 is the modern alternative.
- Two EPA 2004 lookup values fail the plausibility screen and are omitted: the sec-butylbenzene enthalpy and
  the tert-butylbenzene row. No substitutes.
- Test time: `apps/web/src/surfaceWater/compute.test.ts` takes about 200 s, the web suite about 206 s, and
  the full local gate about 4 min 45 s. CI cost per push rose from about 3 to about 5 billed minutes
  (2026-10-18). A linked surface water run on the screen also takes about 81 s at a 2000 m reach (N_TIMES
  bank-plane series in `apps/web/src/surfaceWater/compute.ts`); profile it before changing tests.
- Timing checks under load: `vadose-legacy.test.ts` (speed, best of nine under 250 ms) and
  `groundwater-kernel.test.ts` (plan-view grid, best of three under 1 s) were made robust to parallel test
  load. The mass-conservation test in `groundwater-kernel.test.ts` has a 30 s timeout. If a timing check
  fails again, re-run that file alone before treating it as a regression.
- Optional extras, not scheduled: persist the vadose, saturated and well feeds across reloads; the transport
  charts measure the padded figure and render about 7 percent small; the web bundle is over 500 kB.
- The 390x844 viewport check scripts are not in the repo. Recreate them when needed: headless Chrome with
  remote debugging, Emulation.setDeviceMetricsOverride (390x844, mobile, scale 2) before navigating,
  count elements whose bounding rect right edge exceeds clientWidth; the count must be 0.
- Manual text extraction lives outside the repo; re-extract when needed:
  `pdftotext -layout "~/Downloads/RISC5 Users Guide -- Nov 2014 (2).pdf" <out>.txt`
  (the appendix line index in ROADMAP section 3 refers to that extraction).

## Queued: three tracks (ROADMAP section 7), approved by Bryan
- M7 (shower, irrigation, particulates, App. G, H, I) after M6. It depends on the outdoor box interface in
  `packages/engine/src/processes/outdoorAir/` (`outdoorAir.box` and the emission source types): M7 sources
  plug in through it. M5 follow-up: shower inhalation from tap water joins the cleanup levels then.
- M9 (plant uptake, ecological screening, TPH fractions) after M7.
- M10 (uncertainty: Monte Carlo, LHS, Sobol) after M5. PVIScreen sampling lands here.
- M11 (projects, reports, polish) last.
