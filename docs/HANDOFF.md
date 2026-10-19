# HANDOFF (written from the tree, 2026-10-19, end of wave I)

Resume: start a fresh session in `~/repos/model_flow`, read this file, then `docs/ROADMAP.md` (line 1 and
sections 7 and 8) and `docs/DECISIONS.md`. Statuses are claims: grep the tree before acting on an open row or
skipping a done one.

## State of the tree
- Main holds M0 to M11, wave G (parity gaps, built on branch `wave-gaps`) and wave H (UI near-parity, built on
  branch `wave-ui`), all pushed 2026-10-19. Wave I (six slices, built on branch `wave-i`) is committed locally on
  `wave-i`, NOT yet merged to main and NOT pushed. Pages deploys from main: https://bmills23.github.io/model_flow/
- Final full `corepack pnpm gate` on `wave-i` after the review fixes: green 2026-10-19 (exit 0, build included).
  Test counts from the wave I integration (after merging all six slices, before the review fixes added a few
  tests): engine 1379 tests (79 files), web 1503
  tests (140 files), data and other packages 149 passed and 3 skipped (7 files; the skipped three are the Eco-SSL
  `pdftotext` cross-checks, which need the fetched PDFs). Last full gate before wave I (`wave-ui`, 2026-10-19):
  engine 1377, web 1475. The wave I browser check (production build, 390x844 emulation, cleanup modeled run and
  cancel) found zero overflow and no console errors; `corepack pnpm mobile:check` on the final wave I tree was green
  2026-10-19 (0 overflowing elements, 0 axe violations on every route, including the seeded
  `#/risk` route that needs benzene, two open override panels and two edited marks); run it with `--url` when
  port 5178 is busy.
- Branches that are ancestors of this branch (safe to delete once it lands; add the wave I slice branches `wave-i-i1` to `wave-i-i6`): `m0-foundation` to
  `m6-vapor-models`, `m8-surface-water`, `wave-m5-m6-m8`, `m7-*`, `m9-*`, `m10-*`, `m11-*`, `t-m7`, `t-m9`,
  `t-m10`, `t-m11`, `wave-gaps`, the wave H slice branches (`ui-u*`, `fix-h-*`) and the `worktree-*` working
  branches. `m1-groundwater-ui` is NOT an ancestor (its commits carry different hashes from what landed);
  confirm its content is on main before deleting it.
- Test time on this run: engine suite 34 s, web suite 53 s.
- CI cost: about 5 billed minutes per push to main (measured 2026-10-18 and 2026-10-19 on main: gate job
  2 min 38 s to 2 min 50 s, Pages build about 25 s, deploy 10 to 42 s). Re-measured 2026-10-19 after waves G
  and H (runs 39298427676 and 39298427401): gate 2 min 26 s, Pages build 20 s plus deploy 11 s, still about 5
  billed minutes (recorded in CLAUDE.md). Docs-only pushes trigger nothing.
- Reference counts (`packages/engine/src/references/references.json`, 111 entries): 74 `used`, 25
  `planned`, 8 `data`, 4 `fixture`. Six entries still carry square-bracketed descriptor titles, all
  `planned`: `srinivasan2008a`, `srinivasan2008b`, `gelhar1992`, `foster1986`, `trapp2015`, `sobol1993`.

## Wave I landed (2026-10-19)
Rulings in the DECISIONS.md "Wave I scope" block and its "Wave I slice" blocks, all DEFAULT (delegated by Bryan).
- I1 plume map in the report, before the breakthrough chart; the printed table is 20 evenly spaced rows, the screen
  keeps all 100; the transport CSV carries no plume grid.
- I2 wildlife flag "Not reproduced within 5 percent" (text, 5 percent via `REPRODUCTION_TOLERANCE`), CSV column
  yes, no or blank; no flag when no level was back-calculated or no printed value exists.
- I3 close-tab and reload warning while there are unsaved changes; a restored autosave counts as unsaved, so it
  prompts on every reload until a file is saved.
- I4 chart arrow keys: breakthrough curves (with Home and End) and the plume map fixed; the key hint is in the
  accessible names of all six focusable charts.
- I5 transport charts size from the content box (`useWidth`), which removes the roughly 7 percent undersize.
- I6 uncertainty on modeled cleanup sources (`#/cleanup`, `apps/web/src/cleanup/ModeledSourceUncertainty.tsx`),
  worker pool message `modeled-cleanup`, default 200 iterations, saved under the `modeled` key; engine
  `summarizeCleanup` split out of `runProbabilisticCleanup`.
- Review fixes: compare table header styling restored, no reproduction flag without a back-calculated level,
  methods statement cites the probabilistic cleanup method for a modeled-only run, two-worker tests really use two
  workers, plume probe cell resets on pointer leave.

## Wave H landed (UI near-parity, 2026-10-19)
Plan `docs/UI_PARITY.md` (a status line per slice); rulings in the DECISIONS.md "Wave H" blocks, DEFAULT where marked.
- U1 step bar: all six steps are links (`apps/web/src/steps.ts`), the step owning the current route is marked,
  the home page names no placeholder and links the report.
- U2 `#/site`: advisory checklist of screens and feed buttons from six choices; forbidden combinations are
  explained; saved under a `site` key; one line in the report. Nothing is locked.
- U3 `#/chemicals`: read-only RSL 2024-11 browser with a source per value and CSV. The built JSON asset ships
  minified (633,152 B against 1,218,894 B in the repo) under a 700 kB cap in `bundleSize.test.ts`.
- U4 per-project toxicity overrides (an `overrides` key shared by risk and cleanup, a required source note,
  listed in the report). U5 per-project exposure factors and receptor names; risk and cleanup keep their own
  receptor edits.
- U6 Help link on every screen into its user guide section.
- U7 texture presets on the vadose layers and the saturated Soil group.
- U8 fill from the database on transport, vadose and saturated; transport Kd = Koc x foc (DEFAULT). A record
  with no Koc leaves transport retardation unchanged and says so.
- U9 wildlife dose panel on `#/plants-eco`, rows from the Eco-SSL derivation rows, reproduced within 5 percent.
- U10 decimal comma entry, off by default, per browser; an ambiguous entry blocks the calculation and is never
  saved; text boxes ignore the setting.
- Corrections made while closing the wave: feed fingerprints skip keys added in this wave (`FINGERPRINT_SKIP`
  in `project/hash.ts`) so older project files are not flagged stale; `screenUsed` judges the saved screens;
  the ecological checklist serves a soil source only.

## Wave G landed (parity gaps, 2026-10-19)
- Cleanup (`#/cleanup`): homegrown produce level (does not apply to modeled sources, DEFAULT) and TPHCWG and
  MADEP total TPH levels, with CSV, project and report support.
- Report (`#/report`): each screen's main charts with data tables, and an on-request "Include uncertainty
  results" control that re-runs from the saved setup and seed (plume map excluded, DEFAULT; overturned in wave I). Only the exposure
  sample runs in the background and can be cancelled; the one-at-a-time, Sobol and cleanup solves block the page.
- Accessibility: `scripts/mobile-check.mjs` runs axe-core (dev dependency, MPL-2.0) on every route at 390 light,
  390 dark and 1280, including the fed cleanup screen; per-screen keyboard-order tests exist; the long-run
  confirmations use `ui/AlertDialog.tsx` (focus to Cancel, Escape cancels, focus returns to the trigger); the
  scrollable chart data tables are keyboard-focusable regions.
- Surface water performance: the bank-plane integral got a tail tolerance and remembered axis factors (a 2000 m
  linked run 178 s to 2.0 s in Node; `compute.test.ts` 205 s to 11.7 s). Rulings in the DECISIONS.md G1 to G4
  blocks.
- Generated `.vitest` output is ignored.

## M7 landed (shower, irrigation, particulates, App. G, H, I)
- Methods note `docs/methods/shower-irrigation-particulates.md`. Rulings: DECISIONS.md "M7 shower,
  irrigation and particulates scope" block and its E1, E2, E4, W1 and W2 blocks.
- Engine: `packages/engine/src/processes/shower/` (`droplet.ts`, `legacyStall.ts`, `little.ts`,
  `household.ts`, `common.ts`, `methods.ts`), `irrigation/` (`sprinkler.ts`, `pathways.ts`, `methods.ts`),
  `particulate/` (`windErosion.ts`, `pef.ts`, `qOverC2002.ts`, `methods.ts`) and `household/` (`coupling.ts`,
  `cleanup.ts`: EPC adapters with origin tags and the M5 coefficient wrappers). Registered:
  `shower.fc-1986` (legacy), `shower.little-1992`, `shower.rsl-household`, `irrigation.sprinkler-fc`,
  `irrigation.pathways`, `particulate.box-emission`, `particulate.ssg-pef-1996`, `particulate.ssg-pef-2002`.
- Web `apps/web/src/household/` at `#/household`: shower, sprinkler and particulate inputs with every method
  side by side, water sources from the held transport or surface water series, feeds into the risk screen
  (bathroom air, indoor air for the RSL term, outdoor air) and the cleanup screen (levels as the air level
  over the coefficient). The screen has no chemical database (a CAS number is typed).
- Data: none new. Fixtures: identities, hand cases, SSG 1996 default PEF; the Table R-9 shower rows are a
  named exception.
- Not verified: `foster1986` has no confirmed published record (film coefficients 3000 and 20 cm/h ship as
  warned defaults, `shower.film-reference-unverified`); the full text of `little1992` was not read, so its
  equations are checked by limit identities only; the household factor K could not be verified (required,
  always warned, `shower.household-factor-unverified`), so no RSL tap water level is reproduced. No
  Walden and Spence or EFH irrigation factors were read, so every irrigation factor is an input.
- Deferred: see the ROADMAP M7 row.

## M9 landed (plant uptake, ecological screening, TPH fractions, App. O, P, Q)
- Methods note `docs/methods/plants-and-eco.md`. Rulings: DECISIONS.md "M9 plant uptake and ecological
  screening scope" block, its E1, E2, E3 and E4 blocks and "M9 review fixes".
- Engine: `packages/engine/src/processes/plantUptake/` (`briggs.ts`, `leaf.ts`, `legacy.ts`, `hhrap.ts`,
  `partition.ts`, `produceFactor.ts`, `irrigation.ts`, `checks.ts`), `eco/` (`screen.ts`, `wildlife.ts`,
  `uptake.ts`) and `tph/` (`fractions.ts`). Registered: `plantUptake.trapp-matthies-1995` (legacy),
  `plantUptake.hhrap-2005` (modern fallback), `eco.benchmark-hq`, `eco.ecossl-2005`, `tph.tphcwg`, `tph.madep`.
  The homegrown `produce` pathway was added to the M4 exposure kernels and the M5 closed form.
- Web `apps/web/src/plantsEco/` at `#/plants-eco`: plant factors and intake sent to the risk screen (a
  receptor and a per-chemical switch turn `produce` on), Eco-SSL and user-benchmark hazard quotient tables,
  TPH composition editor with total level, forward hazard index and the mixture saturation check. `log Kow`
  was added to `cleanup-chemicals.json` for it.
- Data: `packages/data/src/ecossl/` builds `generated/ecossl-2026-10-18/ecossl.json` (21 substances, 2
  unmapped) from hand-entered, page-cited values with a checksummed manifest of the EPA PDFs (the PDFs are
  not committed; `pnpm fetch:ecossl` verifies them). Public domain. `epaecossl` is `data`.
- DEFAULT rulings Bryan has not reviewed: ruling 11 (Trapp 2015 could not be identified or read, so the
  modern method is the HHRAP 2005 equations), ruling 12 (TSCF and the leaf-air partition coefficient are
  required inputs), ruling 9 (TPH fractions map onto the five RSL TPH records), ruling 8 (Eco-SSLs by hand
  entry; seven printed wildlife rows that do not reproduce are flagged, not corrected).
- Deferred: the produce and TPH total levels reached the cleanup screen in wave G and the Eco-SSL wildlife
  surrogate rows reached `#/plants-eco` in wave H; see the ROADMAP M9 row for what remains.

## M10 landed (uncertainty, Monte Carlo)
- Methods note `docs/methods/uncertainty.md`. Rulings: DECISIONS.md "M10 uncertainty scope (stage 1)" block
  and its slice entries.
- Engine `packages/engine/src/processes/uncertainty/` (`distributions.ts`, `samplers.ts`, `runner.ts`,
  `sensitivity.ts`, `cleanup.ts`), the AS 241 inverse normal in `numerics/special.ts`, and `uncertainInputs`
  declarations on the registry for the exposure, transport, vapor, surface water, shower, irrigation,
  particulate, plant uptake, eco and TPH methods. Registered: `uncertainty.srs-exposure` (legacy),
  `uncertainty.lhs-ic`, `uncertainty.sobol-saltelli`, `uncertainty.cleanup-probabilistic`.
- Web `apps/web/src/uncertainty/` (distribution editor, panel, worker pool with a run budget, charts): panel
  on `#/risk` (legacy exposure method only) and the probabilistic cleanup panel on `#/cleanup` (direct
  sources only). The percentile fan is built and not mounted.
- Fixtures: distribution and sampler identities, Ishigami for Sobol, Table R-2 as a smoke test only (ruling
  12: the manual gives no input distributions).
- Deferred: see the ROADMAP M10 row.

## M11 landed (projects, reports, polish)
- Methods note `docs/methods/projects-and-reports.md`. Rulings: DECISIONS.md "M11 projects, reports and
  polish scope", the S8 block, "M11 accessibility pass, S10", "M11 review fixes" and "M11 docs reader and
  user guide, S11".
- Web: `apps/web/src/project/` (format v1 with zod, migrations, save and open, share link in the hash with an
  8000 character limit, debounced autosave with persisted feeds), `export/` (CSV helper and file names),
  `report/` at `#/report` (generated methods statement, inputs, result tables and engine warnings per
  screen, print CSS), `a11y/` (labels test, contrast token test, shell keyboard test), `docs/` at `#/docs`
  (reader over `docs/USER_GUIDE.md`, the attributions and `docs/methods/*.md`) and `bundleSize.test.ts`
  (entry chunk under 200 kB, no chunk over 500 kB).
- `scripts/mobile-check.mjs` (`corepack pnpm mobile:check`, needs a built app and a local Chrome): true
  390x844 viewport through CDP, light and dark, every route plus four document pages, and once at 1280x900.
  Last result 2026-10-18: zero overflowing elements. It is not in `gate` or CI.
- Routes (wave H adds `#/site` and `#/chemicals`): `#/` and `#/methods`, `#/transport`, `#/vadose`, `#/saturated`, `#/risk`, `#/cleanup`,
  `#/vapor`, `#/surface-water`, `#/household`, `#/plants-eco`, `#/report`, `#/docs`.
- Deferred: see the ROADMAP M11 row.

## M5, M6 and M8 landed (condensed)
- M5 cleanup levels (`docs/methods/cleanup-levels.md`, `#/cleanup`): `packages/engine/src/processes/cleanup/`
  (`direct.ts`, `chains.ts`, `solve.ts`, `targets.ts`, `ssg.ts`, `checks.ts`); registered
  `cleanup.rags-b-1991`, `cleanup.rags-e-f-2014`, `cleanup.ssg-leaching`, `cleanup.modeled-chains`. The RSL
  build carries the MCL and published SSL columns and writes `cleanup-chemicals.json` (864 rows).
  Fixtures: SSG 1996 Table A-1 (partition formula only; its Koc and H' inputs are unverified) and the RSL
  MCL-based SSL (91 of 91 rows, the binding check). Deferred: vapor chains as modeled targets, shower
  inhalation, particulates, irrigation (M7 supplies wrappers, see above), surface water as a target, plant
  uptake and TPH levels in the screen (the produce and TPH total levels landed in wave G), target-organ segregation, pH-dependent Kd and Koc.
- M6 vapor models (`docs/methods/vapor-models.md`, `#/vapor`): `processes/vapor/` and `processes/outdoorAir/`;
  registered `vapor.je-1991`, `vapor.dominant-layer-1998`, `vapor.je-epa`, `vapor.devaull-2007`,
  `vapor.attenuation-factor-2015`, `vapor.pvi-screen-2015`, `vapor.jury-bam` (zero water flux only),
  `outdoorAir.box`, `outdoorAir.ssg-vf-1996`. Data: `packages/data/src/vapor/` builds
  `generated/vapor/vapor-chemicals.json` (112 chemicals) from the committed EPA 2004 J&E table merged with
  the RSL. Tables R-3, R-4, R-5 reproduce; Table R-6 is a named exception (printed value duplicates R-5).
  Appendix K is not implemented (see open items).
- M8 surface water and sediment (`docs/methods/surface-water.md`, `#/surface-water`):
  `processes/surfaceWater/`; registered `surfaceWater.well-mixed` (legacy) and `surfaceWater.mass-discharge`.
  Data: `generated/nrwqc-2026-10-16/` (aquatic life 61 rows, human health 128, hardness table for 6 metals)
  and `generated/sediment-2026-10-16/benchmarks.json` (811 rows, 28 flagged `basisInferred`) from committed
  public EPA sources. Table R-8 reproduces. A surface water series feeds the M4 swimming pathways and the
  M7 irrigation water.

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
- Unverified values and sources that ship as warned defaults or required inputs: `foster1986` (film
  coefficients), `little1992` (equations checked by identities only), the household factor K, the HHRAP
  fallback for `trapp2015`, TSCF and the leaf-air partition coefficient, the Briggs root factor constants
  (from the HHRAP appendix, a secondary account). Each stays open until the primary source is read.
- DEFAULT rulings Bryan has not reviewed: every block marked DEFAULT in DECISIONS.md for M7, M9, M10 and
  M11 (the M7 and M9 lists above are the ones that change numbers).
- Table R-2 (uncertainty) is a smoke test only; Table R-6 and the Table R-9 shower rows are named exceptions.
- Schulze-Makuch 2005 coefficients (0.20, 0.44) come from lecture notes quoting the paper, not from the
  paper's own table; per-medium coefficients and the data range are not encoded. Open until someone supplies
  the paper's PDF.
- The Gelhar et al. 1985 vadose dispersivity regression coefficients come from the manual's account only.
- Galya 1987 is a horizontal plane-source paper; the box source derives from Yeh 1981 (the methods note
  says so; the ROADMAP section 3 row is annotated).
- Six references still carry square-bracketed descriptor titles (all `planned`, listed above); replace each
  with its verified published title when a milestone marks it `used` (a test enforces this).
- MacDonald et al. 2000 TEC and PEC values are not shipped (could not be verified; `macdonald2000` is
  `planned`). The Region 4 2018 sediment basis comes from cell shading (28 rows `basisInferred`; the report
  contradicts itself on Florida coastal; DECISIONS.md).
- The outdoor box cites Hanna, Briggs and Hosker 1982; an ASTM E1739 attribution is unconfirmed and not cited.
- DeVaull 2007: no published numeric example was verified; the oxygen balances are checked against a
  numerical solve. VISL calculator values were not obtained (the identity covers benzene and naphthalene);
  running it for benzene, trichloroethylene, tetrachloroethylene, naphthalene and ethylbenzene remains open.
- The SSG Appendix H benzene volatilization factor does not reproduce from its printed inputs and is not used.
- RISC5 Appendix K (oxygen-limited, degradation) is not implemented: its only source is an unpublished
  draft. DeVaull 2007 is the modern alternative.
- Two EPA 2004 lookup values fail the plausibility screen and are omitted (sec-butylbenzene enthalpy,
  tert-butylbenzene row).
- Cleanup screen gaps: produce does not apply to modeled sources (DEFAULT, delegated ruling in wave I); no total
  TPH cancer endpoint (DEFAULT, delegated). Modeled cleanup sources are sampled since wave I.
- Report gaps: modeled-source uncertainty is not repeated in the report (DEFAULT, I6); the report does not compute
  a modeled source. The plume map is in the report since wave I.
- Plume CSV: the transport CSV carries no plume grid and the report prints 20 of 100 centreline rows, so the full
  plume data is on screen only. Add a plume CSV if the full data is wanted as a download.
- The wave I modeled-uncertainty timings were measured under host load (other slices running); the dissolved
  source run was re-checked in a browser (about 2 s for 200 iterations on 4 workers), but the slow chains (vadose,
  saturated modern, which ask first or are refused) were not run in a browser.
- Restored autosave prompts on every reload until a file is saved (I3, DEFAULT). If that proves annoying, seed the
  saved snapshot from the restored state; it is Bryan's call.
- Wave H open questions are answered by DEFAULT delegated rulings (DECISIONS.md "Wave I scope" block): Kd = Koc x
  foc stays, the wildlife flag exists, the checklist stays soil only, database edits stay per project. Bryan can
  still overturn any of them. Multi-chemical fate runs and user-defined chemicals as project entries remain
  unbuilt; RISC5 project import is not built.
- `report/ReportCharts.tsx` was not walked for keyboard behaviour in I4 (report figures are print output).
- Slow run: a linked surface water run at a 2000 m reach takes 2.0 s in Node after the wave G fix (178 s
  before); the browser time was not re-measured (81 s measured 2026-10-18 before the fix). Profile before
  changing tests.
- CI cost per push to main is about 5 billed minutes (see State of the tree); push once per logical unit,
  and the heavy mobile check is local only.
- `scripts/mobile-check.mjs` is committed and run by hand (`corepack pnpm mobile:check`); it is not in the
  gate. Re-run it before any push that changes a screen.
- Timing checks under load: `vadose-legacy.test.ts` (best of nine under 250 ms) and
  `groundwater-kernel.test.ts` (best of three under 1 s, mass conservation 30 s timeout) were made robust to
  parallel load. Other timing tests also fail under heavy host load (the methods citation test now has a 30 s
  timeout). If one fails, re-run that file alone before treating it as a regression.
- Lingering worktrees of finished milestones: the local worktree directories next to the repo (`../model_flow_wt/`: m7, m9, m10, m11,
  wave) and the extra working copies inside it. Remove them once nothing needs resuming; `git worktree list` shows all of them.
- Manual text extraction lives outside the repo; re-extract when needed:
  `pdftotext -layout "~/Downloads/RISC5 Users Guide -- Nov 2014 (2).pdf" <out>.txt`
  (the appendix line index in ROADMAP section 3 refers to that extraction).

## Next
- Run the full gate on `wave-i`, run `corepack pnpm mobile:check`, merge to main and push once (about 5 billed
  minutes), then delete the merged slice branches and worktrees.
- Then the open items above: read the unverified sources; decide on a plume CSV, modeled-source uncertainty in
  the report, and whether a restored autosave should prompt on reload.
