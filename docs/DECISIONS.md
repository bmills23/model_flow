# Decisions

Append new decisions at the bottom with the date. Correct a superseded decision in place and say what replaced it.

## 2026-10-15: Project scope and direction (Bryan)

| Question | Decision | Consequence |
|---|---|---|
| Revenue vs personal | Personal, open source, free | $0 hosting (GitHub Pages), local gates before any push, minimal CI, no cloud fleets |
| Scope | Full RISC5 parity as the long-run goal | 12 milestones (docs/ROADMAP.md section 7); each ships a usable increment |
| Validation | Manual plus public references; no RISC5 licence | Fixtures from the Appendix R peer-review tables, USGS ANALGWST, van Genuchten & Alves 1982, EPA spreadsheets, mibitrans cross-checks |
| Architecture | TypeScript engine plus static single-page app | All computation in the browser (Web Worker); no backend; the Python tkinter shell is retired |
| Methods | RISC5's legacy methods by default, with a per-process switch to a modern method | The method registry is the central engine abstraction; legacy-vs-modern comparison overlays are a headline feature |
| Attribution | Thorough scientific references for legacy and modern methods, kept separate from third-party software licences | `docs/ATTRIBUTIONS.md` (science and data provenance) and `docs/THIRD_PARTY_LICENSES.md` (software), both generated from `data/references.json` and the lockfile; in-app Methods & References page |

## 2026-10-15: Standing assumptions

- Licence stays MIT. No GPL code is vendored (HYDRUS-1D is GPLv3: use the papers, not the code). Public-domain US government code (USGS, EPA) may be used for fixtures and may be ported with its notice.
- The product is not called "RISC" or any variant. The repo name stays `model_flow` until a product name is chosen. The README carries a non-affiliation notice.
- Personal project: no employer time, resources, or implied endorsement. No personal contact addresses on public surfaces; use GitHub issues.
- Clean room: every model is implemented from its primary publication. The RISC5 user's guide is used only as a map of which published choices RISC5 made. No manual prose, figures, or database tables are copied. The RISC5 binary is never inspected.
- Root solver for cleanup-level back-calculation is Brent's method; a secant variant is kept only for parity checks against RISC5's documented behaviour.
- SI units inside the engine; RISC-style units (cm/d, mg/kg, mg/L) only at the input and output boundary.

## 2026-10-15: Domenico comparison deviation threshold (M1 wave 1)

The Domenico 1987 comparison mode emits `domenico.deviates-from-exact` when its result differs from the
exact Wexler PATCHI solution for the same inputs by more than 10 percent (`DOMENICO_DEVIATION_THRESHOLD`
in `packages/engine/src/processes/groundwater/domenico.ts`). The published validity papers (West et al.
2007, Guyonnet and Neville 2004, Srinivasan et al. 2007) give qualitative conditions rather than a single
numeric bound, so the threshold is a screening choice made during implementation and kept after independent
review raised no objection. It is a UI signal, not a scientific claim; change it with a new
entry here.

## 2026-10-15: M1 groundwater screen, chart library and design (wave 2)

| Question | Decision | Why |
|---|---|---|
| Chart library | d3-contour and d3-scale (both ISC) drawing React-rendered SVG. Observable Plot and ECharts not used | The initial plan named Plot plus d3. Plot builds its SVG imperatively and, for a filled-and-isolined plan map, would still need d3-contour plus `Plot.geo`; it also brings its own colour handling that cannot follow the page theme tokens. Rendering the SVG in React keeps both themes on CSS custom properties (the plume ramp is a CSS `color-mix` between two theme tokens), keeps the test render in jsdom simple, and costs about 21 kB gzip on the main bundle (119.6 to 140.9 kB). ECharts was unnecessary because the contour map renders acceptably this way |
| Where the engine runs | Module Web Worker (`compute.worker.ts`); a newer request terminates the worker and starts a fresh one; without Worker support (tests) it computes on a timer tick | A 100 by 60 map plus three curves never blocks input; input is debounced 300 ms (first compute is immediate). The worker chunk duplicates the engine (about 273 kB, loaded only for the screen) |
| Pulse and stepped loading for Wexler and Domenico | The engine applies it: the screen passes `ConcentrationStep` lists (c0 times the step factor, zero-length steps dropped) to `patchiConcentration`, `patchfConcentration`, `patchiGrid`, `patchfGrid`, `domenicoConcentration` and `domenicoWarnings`, which superpose F(t - start) minus F(t - end) | Both solutions are linear in the source; the engine rejects overlapping, unordered, negative or NaN steps with RangeError, which the screen shows as an input error beside the last good result. The screen's earlier own superposition and its `ui.superposition` note are removed; `loadingParity.test.ts` pins pulse and stepped values recorded from that code to 1e-9 relative. The AT123D kernel takes the loading steps directly |
| Source strength | The UI source concentration is the held concentration for Wexler and Domenico; for AT123D the mass rate is concentration times Darcy flux (K i, equal to seepage velocity times porosity) times source cross-section. A mass-rate input back-calculates the held concentration the same way | The two methods are therefore comparable from one set of inputs; the screen warns (`ui.source-basis`) that they differ near the source |
| Geometry | x measured from the downgradient source face (source occupies x in [-L, 0]), y centred on the source, depth positive down from the water table; finite aquifers map to engine z from the base; PATCHF shifts y by half the aquifer width | One coordinate story for the three methods; Domenico already measures depth down from the top |
| Screen average on the map | Trapezoid over 5 depths for the map (cost is five grids), 4 intervals for curve points and 10 for the receptor readout | Keeps the worker time bounded; the readout uses the finer average |
| Finite thickness without a width | Wexler uses PATCHI with the layer's no-flux top and bottom (`VerticalBounds { thickness }`) and the screen warns (`ui.wexler-infinite-width`); a width selects PATCHF | The engine's PATCHF needs both; the unbounded PATCHI it used first ignored both boundaries (see 2026-10-16, Wexler no-flux water table) |
| Domenico | Optional overlay only, labelled a BIOSCREEN/RBCA-compatible comparison, with the engine's validity warnings listed | Not a recommended method (see docs/methods/groundwater-transport.md) |

## 2026-10-15: Schulze-Makuch 2005 dispersivity coefficients (M1)

`dispersivity.schulze-makuch2005` uses alpha_L = 0.20 L^0.44 (unconsolidated media, the paper's most
reliable subset) with the BIOSCREEN ratios alpha_T = alpha_L/10 and alpha_V = alpha_L/100. The
publication (Ground Water 43(3), 443-456, doi 10.1111/j.1745-6584.2005.0051.x) was verified through
Crossref, but the coefficients were taken from lecture notes that quote the paper, not from the paper's
own table, and the per-medium coefficients and the stated data range were not verified, so they are not
encoded and the method carries no range warning. The reference entry's notes field says so. Replace the
coefficients or add the range warning only after checking the paper, and record that check here.

Check attempted 2026-10-16, not closed: the full text is behind the publisher's paywall (Wiley and
ResearchGate both refused access), so the only primary text read was the abstract (Europe PMC, PMID
15882337). The abstract gives exponent ranges only, 0.40 to 0.92 for consolidated and 0.44 to 0.94 for
unconsolidated media, says the higher-reliability subsets have exponents close to 0.5, and finds no clear
evidence of an upper scale bound; it gives no (c, m) pairs and no data range. Two DTU lecture notes
(Bjerg 2008; version 2.0, 2025) quote 0.20 L^0.44 for the most reliable unconsolidated data without
citing a table, and may share one lineage. The coefficients therefore stay as encoded, still
secondary-sourced. Closing this needs the paper's PDF (institutional access, interlibrary loan, or the
author); Neuman's 2006 comment on the paper and the author's reply should be read at the same time.

## 2026-10-16: M2 vadose leaching scope and validation (Bryan)

Three calls from the methods note (`docs/methods/vadose-leaching.md`), each settled on the recommended
default:

- **Table R-7 fixture:** "Year-10 average at 3%". The water-table target of 10.8 mg/L is compared with
  the mean of the month-end values over year 10, within 3 percent, using the RISC4 manual's benzene
  properties because Table R-7 does not list them; the review's independent 11.0 mg/L value is not used.
  The point value at 10 years (about 14.1 mg/L) does not match, and the year-10 value is badly
  conditioned (a 5 percent change in Koc moves it about 25 percent), so the fixture is a reproduction
  check of the review's arithmetic, not evidence of model accuracy.
  Fixture provenance (`packages/engine/test/fixtures/vadose/README.md`): the six benzene values
  (M 78 g/mol, S 1750 mg/L, H 0.228, Koc 59 mL/g, D_a 0.088 and D_w 9.8e-6 cm^2/s) come from the RISC4
  chemical database and are fixture inputs for this case only, not a product database. The independent
  11.0 mg/L is unused because the review says it was computed with an approximate erf (error up to 0.7
  percent), so it is not a reference-grade value. Other readings: the 4.0 m above the source includes the
  0.2 m lens, L_d = 5.5 m, decay acts on the dissolved phase only, and the table's TPH "molecular weight
  [mg/kg]" is g/mol.
- **EPA Soil Screening Guidance leaching with a dilution attenuation factor:** "Defer to M5". It is a
  back-calculation of screening levels and belongs with cleanup levels. M2 ships the legacy model, the
  van Genuchten-Mualem k(theta) option, the multi-layer profile and the flux-type inlet.
- **Layered transport:** "Finite volume, analytic for 1 layer". A finite-volume solver handles profiles
  with more than one layer; the van Genuchten and Alves 1982 case C14 closed form is used for a single
  layer, and tests require the two to agree.

## 2026-10-16: M2 tolerance rulings and engine screening choices

Bryan's rulings on two acceptance gaps found while building the M2 engine:

- **van Genuchten and Alves 1982 Table 6:** "Named exceptions at 1.5e-4". Eight of the 110 printed values
  (first-type t = 5, x = 18; third-type t:x = 10:8, 10:18, 15:20, 20:20, 25:16, 25:18, 25:20) differ from
  the exact closed forms by more than 5e-5, at most 1.27e-4 (third-type t = 25, x = 20: printed 0.6334,
  exact 0.63353). The closed forms agree with an independent convolution form to 1e-9, with
  finite-difference checks of the PDE and inlet condition, and with the finite-volume solver, and the
  digits were re-read from a 300 dpi render, so the differences are attributed to the 1982 program's
  printed output. Those eight points are asserted at 1.5e-4 and listed by (t, x) in the test; the other
  102 stay at 5e-5.
- **Finite-volume versus closed-form agreement:** "Accept current criteria". The planned target (1e-4
  relative wherever C > 1e-6 c0) is replaced by: 1e-4 c0 absolute everywhere, 1e-2 relative where
  C > 1e-2 c0, and a measured second-order convergence rate under grid halving. The scheme is second
  order; the relative error in the far leading tail of a front stays near 2.7e-4 even at 5334 cells.

Screening choices made while building the engine (defaults; open to change):

- `vadose.tph-constant-approximation` fires when F / F_T > 0.1.
- `vadose.inlet-mass-excess` fires when the first-type inlet admits more than 1.05 times the source's
  leaching loss, judged on the ratio over the whole release (closed form from the Laplace transform; 1.019
  for Table R-7) rather than at the end of the run (1.060 for Table R-7 at 10 years), because the
  finite-time ratio grows without bound as t approaches zero and would flag every short run.
- Infiltration is clamped to the smallest saturated conductivity among the layers present, since under
  unit gradient every layer carries the same flux.
- The layered solver continues the deepest layer 20 dispersion lengths (D/v) below the water table and
  reports the flux across the water-table face; a free exit at the water table gave outlet
  concentrations up to 25 percent high and made one layer and two identical layers disagree.
- The layered solver halves the time step, then the grid, until results change by less than 1e-3 of their
  peak, and warns `vadose.numerics-not-converged` if either loop runs out of halvings.

## 2026-10-16: No-flux water table for infinitely deep AT123D aquifers (Bryan)

Building the M2 coupling showed that M1's infinite-thickness AT123D kernel modelled an unbounded medium,
so a source at the water table lost half its mass upward and concentrations within a few vertical
dispersion lengths of the water table were up to a factor of two low. Yeh 1981 (ORNL-5602) places an
exchange condition on the top surface with image terms in the infinite-depth vertical functions; with a
zero exchange coefficient that is a no-flux water table. The kernel gained `aquifer.top: 'no-flux'`.
Bryan's ruling on the default: "Default to no-flux". Infinite-thickness AT123D runs use the no-flux water
table unless a caller asks for `top: 'unbounded'`; the ANALGWST point-source fixtures and the kernel
tests that need a whole-space medium request it explicitly. Results from the M1 screen near the water
table change accordingly.

## 2026-10-16: Wexler PATCHI honours the no-flux water table (Bryan: "Fix first, one push")

Following the AT123D no-flux ruling above, the transport screen's Wexler path still leaked the held
concentration upward through z = 0 (whole-space PATCHI read 0.50 to 0.82 of the no-flux value at depths
0 to 6 m). `patchiConcentration` and `patchiGrid` gained an optional `VerticalBounds` argument
(`{ waterTable }` or `{ thickness }`, images inside the time integral), the screen passes it for every
infinitely deep aquifer and for a finite thickness without a width, and PATCHF and every ANALGWST
fixture are unchanged. `loadingParity.test.ts` now pins its recorded whole-space Wexler values by
dropping the screen's no-flux flag, because those values predate the change.

## 2026-10-16: M3 saturated soil source scope and screening choices

Bryan approved starting M3 (Appendix C) with a methods note first ("yes"). The note is
`docs/methods/saturated-soil-source.md`; the scope it records:

- **In M3:** the legacy two-region source (`saturatedSource.two-region`: equilibrium partitioning with a
  per-chemical residual-phase test and Raoult's law, region 1 flushed by infiltration and region 2 by
  groundwater flow, one well-mixed pool released at a constant rate until exhausted), the water-table
  fluctuation on both methods, and the modern mass-consistent exponential decline
  (`saturatedSource.exponential`, the first-order source of BIOSCREEN, Newell et al. 1996, and the
  unit-exponent case of Falta et al. 2005). Transport reuses the M1 methods through the coupling.
- **Not in M3:** the general power-law exponent (with the groundwater power-law option, ROADMAP row B),
  volatilization from region 1 (M6), the mixture-wide residual test and multicomponent dissolution
  (the TPH mass is held constant, as in M2), and cleanup-level back-calculation (M5).
- **Validation:** no manual worked example and no Appendix R table covers this model. Fixtures are the
  EPA 1996 Soil Screening Guidance Table 3-A soil saturation limits (six chemicals, half a unit in the
  second printed figure), the BIOSCREEN source-decay derivation and soluble-mass example (zone masses
  within 0.5 kg), the Falta et al. 2005 zero- and unit-exponent source functions (1e-12), two hand
  calculations (1e-9), and identities with M1 and M2 (1e-12; aquifer mass 1e-6 as in M2).

DEFAULT rulings (applied in the note, Bryan's to overturn):

1. **Water-table fluctuation:** the release rate is the time-weighted annual mean of the high-water and
   low-water rates; a seasonal schedule (high water for the first fraction f of each year) is an
   option. The manual says both that the rates shift during the year and that the fluctuation
   apportions the mass loss; without source decay the annual mean removes the same mass each year
   (with a source decay it does not, see the stage 3 entry).
2. **Region 1 water content:** computed with the M2 unit-gradient helper from a residual water content
   and van Genuchten n entered for the source soil, with the aquifer's hydraulic conductivity as Ks
   (Brooks-Corey with the Lenhard conversion by default). The model's data list has neither input,
   while the manual's input chapter says n is used for this model.
3. **Where the release enters the aquifer:** an AT123D box of the source's plan size from the water
   table down to the high-water saturated thickness, carrying both regions' release; a source that never
   submerges collapses to the water-table patch of the vadose coupling. Wexler and Domenico use the
   cross-section width times that thickness.

Screening choices (not rulings): one well-mixed pool for both regions; region 1 leachate reaches the
aquifer immediately and undiluted, and its rate does not depend on region 1's thickness (RISC5 choice);
one porosity serves partitioning and transport (RISC5 choice); no source decay in the legacy method, an
optional first-order source decay in the modern one; the legacy method warns
`saturatedSource.constant-dissolved-source` when a contributing region holds no separate phase, because
a constant pore-water concentration then contradicts the partitioning it came from; the
`tph-constant-approximation` threshold stays at 0.1 as in M2. Raoult's law was attributed to Cline et al.
1991 only provisionally because the paper was not readable; stage 2 dropped it from the citations (see
the stage 2 entry).

## 2026-10-16: M3 engine built (stage 2)

- `cline1991` is not cited. Only Crossref metadata could be read (no abstract anywhere, full text behind
  the paywall), so its support for the ideal Raoult's law form is unconfirmed. Both methods drop it from
  their citations and the entry stays `planned`; the Raoult form is the RISC5 choice and the M2 vadose
  source's, with no reference attached. `feenstra1991` and `falta2005` are `used`.
- The engine is `packages/engine/src/processes/saturatedSource/`: `saturatedSource.two-region` (legacy,
  exponent 0) and `saturatedSource.exponential` (modern, exponent 1), the DEFAULT rulings above applied as
  written. The release schedule is closed form for both exponents and both fluctuation schedules, in O(1)
  per query for any horizon (the seasonal modern schedule uses the geometric sum over whole years).
- Screening readings made while building it: a legacy infiltration above K is clamped and warned, equal
  to K is silently saturated, and the modern method refuses infiltration at or above K only when region 1
  exists; region 1 and region 2 are evaluated only where the water levels give them thickness; a legacy
  loading list stops at the depletion time rather than carrying a zero-rate tail; the default modern step
  length is one month; the constant-dissolved-source warning needs a contributing region (nonzero rate)
  without a separate phase.
- Hand-case fixture values are stored at full double precision from an independent script, because the
  eight significant digits printed in the methods note cannot support a 1e-9 relative comparison.

## 2026-10-16: M3 web screen and the step cap for seasonal schedules (stage 3)

- The saturated soil source screen is `#/saturated` (`apps/web/src/saturated/`). It follows the vadose
  screen: form, compute in a worker, an in-memory feed, charts, and a feed into the groundwater screen,
  which draws the receptor breakthrough curve and the plan-view plume with the M1 components. The screen
  opens on hand case A of the methods note and checks its M0, depletion time and decline constant against
  the hand-calculation values.
- **Step cap.** The groundwater feed uses the vadose feed's bound of 48 loading steps with exact mass per
  step. A legacy annual mean is one step and a modern annual mean is cut into steps of at least a month
  (lengthened to stay within 48). A **seasonal** schedule has two segments a year that must stay separate
  steps, so stage 3 keeps it by lengthening the steps (up to one step per season) while the count stays
  within 48, which holds up to about 24 years of release. Past that, the feed falls back to whole-year
  steps (boundaries at multiples of n years, n chosen so the count stays within 48), each carrying the
  seasonal schedule's exact delivered mass, so the cumulative mass is exact at every step boundary, with
  or without source decay, and only the timing within a step is lost. (A first version fed the annual
  mean and claimed equal mass at year ends; that holds only without source decay, because the faster
  high-water release leaves less mass to decay, 4.1 percent low for case A with decay 0.001/d over 30
  years.) The fallback is
  never silent: the saturated screen's coupling panel states it for the current horizon, and the
  groundwater screen's warnings carry `ui.saturated-seasonal-fallback`. A legacy seasonal source that is
  exhausted early (few years) never reaches the cap.
- **Aquifer travels with the feed.** The methods note says one porosity, bulk density and organic carbon
  serve partitioning and transport, so a saturated-fed groundwater run takes its porosity, Darcy flux
  (K times the gradient) and retardation (1 + rho_b Koc f_oc / porosity) from the saturated screen and
  disables the typed aquifer fields. The source box is the plan size by the high-water saturated
  thickness; a source that never submerges keeps the typed mixing depth. This deliberately differs from the engine
  coupling (`saturatedSourceBox`, a zero-thickness water-table patch when the high-water saturated
  thickness is zero): the engine API has no mixing depth to take, while the screen follows the vadose
  screen, whose Wexler and Domenico cross-section and AT123D box need a finite thickness the user
  chooses. The groundwater screen states this in its `ui.saturated-feed` note, so the two never
  disagree silently.
- The legacy method has no source decay, so the screen drops a typed decay rate from the legacy run
  rather than refusing it; only the modern run uses it.
- `TimeLineChart` gained an optional `vlines` prop for the depletion-time markers; vadose charts do not
  pass it and are unchanged.

## 2026-10-16: M4 exposure, risk and chemical database scope (stage 1)

Bryan's "continue" started M4 with a methods note first. The notes are
`docs/methods/exposure-and-risk.md` and `docs/methods/chemical-database.md`. The current RSL edition was
checked on the EPA site on 2026-10-16: November 2024 (no 2025 or 2026 edition exists), recorded as
`epa2024rsl` (the placeholder `epa2026rsl` entry was renamed). No engine, data or web code is written in
this stage.

DEFAULT rulings (applied in the notes, Bryan's to overturn):

1. **Pathways and deferred media.** M4 ships the nine direct pathways of the ROADMAP row, each in a
   legacy and a modern variant. Bathroom air (until M7), indoor and outdoor air (until M6) and surface
   water (until M8) are user-entered constants; the RSL tap-water inhalation term (Andelman factor) and
   the RSL soil inhalation term (volatilization and particulate emission factors) are not offered. Each
   EPC records its origin so a later milestone can supply it without changing M4.
2. **Legacy method** `exposure.rags-a-1989`: RAGS Part A doses for every pathway, inhalation as a dose
   with SFi and RfDi converted from the IUR and RfC at 20 m^3/d and 70 kg (RISC5 choice), oral toxicity
   values for dermal routes with absorption through AAF and Kp, soil bioavailability 1, and
   route-to-route extrapolation off by default (a switch, warned when used).
3. **Legacy presets** come from EPA's 1991 standard default exposure factors and the RAGS Part A
   exhibits, not from RISC5's receptor database, which is not reproduced.
4. **Time-varying EPCs.** Legacy: RISC5's windows (largest 7-year average for noncancer, or the
   duration when shorter; largest duration-long average for cancer). Modern: the exposure start time
   that maximizes the cancer risk, with life stages in sequence inside that window; each stage's HQ uses
   the largest average over that stage's duration. A series shorter than the window is averaged over
   its span and warned.
5. **Modern resident is age-segmented.** Child 6 yr plus adult 20 yr; for mutagens 0-2, 2-6, 6-16 and
   16-26 yr with ADAF 10, 3, 3, 1, child factors before 6 and adult factors after (the RSL convention).
   The headline HI is the larger of the life stages' HIs, both shown, never added. The additive
   two-receptor option with a modern age-segmented resident is a RangeError (it would count the child
   twice). Age-segmented means the receptor covers both a child and an adult (stages or mutagen segments
   in more than one noncancer group); a child alone, split into its two mutagen segments (0-2, 2-6), is
   not, so child plus worker may be added.
6. **Dermal water event time for cancer.** The modern cancer dose, for mutagens as well as other
   carcinogens, uses the one time-weighted resident event time (0.6708 h), as the RSL tables do (amended
   in slice E2: the RSL check for methylene chloride fails with per-segment mutagen times); every HQ uses
   each life stage's own event time.
7. **Outside the RAGS E prediction domain** a dermal-water dose is computed and warned
   (`exposure.dermal-outside-epd`), where the RSL tables omit it.
8. **Additivity.** Within a receptor, risks and HQs each sum over pathways and chemicals; across
   receptors nothing sums except the additive option's cancer risks. No target-organ segregation (a
   warning when a total HI exceeds 1). Linear risk in both methods, warned above 0.01. A missing
   toxicity value gives "not quantified", never zero.
9. **Raw RSL spreadsheets are committed** (`packages/data/raw/rsl/2024-11/`, three files, about 600 kB,
   public domain) with a SHA-256 manifest; the build reads only those and fails on a checksum mismatch;
   a hand-run fetch script adds a new edition as a new directory.
10. **No CompTox gap filling in M4.** A value the RSL leaves blank stays absent; a user-entered project
    value is tagged `user`.
11. **Database units.** `chemicals.json` and `tox.json` keep the RSL's published units with a units
    block; the engine converts to SI on the way in. The risk screen loads a derived subset,
    `risk-chemicals.json` (the dermal water inputs, fraction absorbed, prediction-domain flag and dermal
    form, values without references), generated by the same build and covered by `data:check`.
12. **Fixtures.** Table R-9 follows the Table R-7 convention: inputs not in the table come from the
    RISC4 manual (Table 6-2 adult resident factors, Table 11-1 values for the four chemicals) for this
    case only; the dermal-soil product SA x AF = 5,750 cm^2 mg/cm^2 is back-solved from the table
    because no RISC4 default reproduces it; targets are the review's calculated row within half a unit
    in its last printed digit; only page 1 of 3 is available, and its shower inhalation and vegetable
    rows wait for M7 and M9. The RSL independent check requires the engine's screening level to round
    to the published two-figure value.
13. **RSL special cases** (trichloroethylene, vinyl chloride) are computed as ordinary chemicals and
    warned (`exposure.special-case-not-modelled`).
14. **Smaller calls.** Exposure years are 365 days (the guidance convention), so averaging windows on
    the transport time axis are not corrected for the 365.25-day year (the window length only: a pinned
    exposure start and the start year shown are on the transport axis, 365.25-day years); swimming frequency and event
    time have no default in either method and are required; soil EPCs are constants (RISC5 choice, no
    depleting-soil coupling in M4); the arsenic relative bioavailability of 0.6 is a modern default
    only.

## 2026-10-16: M4 slice D1, xlsx reader for the RSL build

The RSL build needs to read three .xlsx files. `read-excel-file` 9.3.12 (MIT, maintained, last release
2026-10-07, eight small packages in total, no native code) is a devDependency of `@model-flow/data`,
pinned exactly. It is build-time only, so it does not enter `docs/THIRD_PARTY_LICENSES.md` (the shipped
production set) and nothing ships in the web bundle. Rejected: SheetJS `xlsx` (the npm registry copy is
stale and has known advisories; current releases are distributed outside npm) and `exceljs` (much larger
tree for a read-only job). Raw files are committed and verified by SHA-256 against
`packages/data/raw/rsl/2024-11/manifest.json` before every build; all three downloads matched the
checksums in the data plan. The root gate gained `data:check` (regenerate, then `git diff --quiet` on
`packages/data/generated`). Generated JSON and raw files are excluded from Prettier.

## 2026-10-16: M4 slice E1, legacy exposure kernels and presets

Implemented `exposure/{units,legacy,receptorsLegacy}.ts` (not yet registered as a method; the registry
and `index.ts` exports wait for the modern kernels). Judgment calls, open to overturn:

- **Exhibit readings (RAGS A 6-12, 6-13, 6-15).** Read from page renders (see the methods note's table
  of printed pages). Two values are ambiguous. (1) Surface area is given for males and females; the
  presets use the male values (adult 1.94 m^2, child 3 to under 6 yr 0.728 m^2) because the exhibit
  lists males first and its 70 kg adult is the male reference. A female value is a user entry. (2) The
  exhibits give 2.6 h/d and 7 d/yr as national swimming averages and two single-soil adherence values
  for hands. Ruling 14 stands (no national default for recreational time or frequency), so none of
  them is a preset, and soil skin area and adherence are blank; the values are recorded in the methods
  note. A pathway lacking a factor is not computed and warned, never computed as zero.
- **Child body weight 15 kg** (`epa1991sdef`, as the methods note's table) although the 1989 exhibit
  6-14 lists 16 kg; the 1991 directive supersedes it.
- **Legacy kernels take SI and EPC averages.** The receptor is built from RISC-style units by
  `legacyReceptor`; an EPC is a constant or the two window averages (cancer, noncancer). Reducing a
  series to those windows is a separate piece and is not in this slice.
- **Inhalation breathing rate is entered per hour while exposed** (m^3/h, as the note's table), so the
  20 m^3 of a workday is 2.5 m^3/h over an 8 h exposure time.

## 2026-10-16: M4 slice E2, modern exposure kernels and presets

Implemented `exposure/{modern,dermal,lifeStages,receptorsModern}.ts` (not yet registered or exported
from the package index). Judgment calls, open to overturn:

- **Ruling 6 amended: mutagens use the 0.6708 h cancer event time too.** The independent check against
  the RSL tap water table fails for methylene chloride (dermal cancer SL 364 against the published 350)
  when each ADAF segment uses its own event time, and passes with the single time-weighted value; the
  RSL default-parameter file lists the same 0.6708 h for the mutagenic case (`ETevent-res-madj`). The
  resident preset carries it as `cancerBathingTimeHr: 0.6708` (the exact ED-weighted mean is 0.67077 h,
  which misses the printed hand case M1 by 2e-5 relative); a receptor without one falls back to the
  ED-weighted mean. No tolerance was widened.
- **Surface-water ingestion rates follow the RSL file, not the methods note's two numbers.** Child
  0.12 L/h and adult 0.11 L/h for the non-mutagen stages (as the note); the mutagen segments use the
  file's own 0.12, 0.12, 0.124 and 0.0985 L/h. Swimming time, frequency and the outdoor air time stay
  blank (ruling 14); swimming skin area equals the bathing area.
- **Noncancer groups.** Each life stage carries a group (child, adult, worker). A hazard quotient is
  computed per group with that group's own frequency (the duration cancels in the averaging time), the
  headline HQ and HI are the largest over groups, and groups are never added. A mutagen's four cancer
  segments therefore still give two hazard quotients.
- **Dermal-water organic or inorganic comes from the database, and an unknown form is never defaulted.**
  (Amended 2026-10-16 after review: the earlier rule defaulted to organic whenever tau, t* and B were
  present, which the RSL fills for all but 9 of 863 Kp rows, so every inorganic except arsenic ran the
  lag-time model and its dermal hazard quotient came out 1.8 to 7 times too high: mercuric chloride tap
  water dermal SL 13.6 against the published 96 ug/L, cadmium 9.0 against 23, Cr(VI) 29 against 51,
  nickel soluble salts 9,947 against 18,000, zinc 1.2e6 against 2.3e6.) The RSL tables have no organic
  flag and the RAGS Part E guidance gives no list, so the classification is read from the published
  November 2024 tap water table (SEMS 405290): for every analyte with a Kp and a published dermal value
  (690 rows) exactly one form reproduces it, 569 the lag-time form and 121 the inorganic form (the metals,
  but also cyanides, phosphates, perchlorates, thallium salts, fluoride, hydrazine and others, so no
  element or formula rule works; nickel acetate and carbonate are lag-time while nickel soluble salts
  are inorganic). The 121 ids are a committed list, `packages/data/src/rsl/dermal-form.ts`; the data
  build writes `dermalForm` ('organic' or 'inorganic') on each analyte, 'organic' for a published value
  not on the list, and leaves it absent when the table publishes no dermal value (173 rows with a Kp, such
  as cadmium (diet) and antimony trioxide). `packages/data/test/rsl.test.ts` re-derives the split from the
  raw table with the engine on every run, so a new edition that moves an analyte fails the test. The
  chemical boundary's `organic` flag has no default: absent, dermal water is not quantified and the
  pathway is reported as not quantified, never as zero and never guessed. The screen starts each chemical
  at the database form and offers organic, inorganic or not set; for an analyte with no database form the
  user may state one. The RSL check fixture states `organic` for each chemical from the build and adds
  cadmium (water), Cr(VI), mercuric chloride, nickel soluble salts and zinc with their published values;
  the web `build.test.ts` runs the default path for those and benzene to the published dermal level.
- **Arsenic RBA 0.6 is applied by CAS number in `modernChemical`** (id or cas equal to 7440-38-2) unless
  the caller gives an RBA; the kernels default to 1.
- **EPCs are constants or per-stage averages.** The kernels take a number, or one concentration per cancer
  stage and per noncancer group, so the series windows (not in this slice) plug in without changing the
  kernels. Linear coefficients are returned per stage and per group.

## 2026-10-16: M4 slice E3, scenario runner, series windows and registration

Implemented `exposure/{averaging,epc,checks,scenario,index}.ts` and `risk/{additivity,summary}.ts`, and
registered `exposure.rags-a-1989` (legacy) and `exposure.rags-e-f-2014` (modern) in the engine registry
(there is no separate `risk` method: risk characterization is part of each exposure method's run). The
ten references the two methods cite were marked `used`. Judgment calls, open to overturn:

- **The maximizing start is exact, not sampled.** The moving average of a piecewise-linear series is
  piecewise quadratic in the window start, so its maximum can sit strictly between sample-aligned starts
  (the methods note said "the sample times and the times at which a window edge meets a sample", which
  misses it for a hump-shaped plume). The scan also visits the root of the derivative inside each piece.
  The note's sentence is corrected in place.
- **Starts are confined to fully covered windows.** The start scans from the latest first sample to the
  earliest last sample minus the longest reach, so no window is partly outside a series (a partly
  covered window would let a tiny end span dominate a rising plume). When no such start exists the start
  is the latest first sample, the covered span is averaged, a stage the series does not reach at all
  gets a concentration of zero, and `exposure.series-shorter-than-window` is warned. A pinned
  `exposureStart` (modern only) skips the scan and warns the same way.
- **One start per receptor.** The start maximizes the receptor's total cancer risk over every series
  EPC (each chemical and pathway weighted by its per-stage risk coefficient, mutagens on their four
  segments). Noncancer groups do not follow the start: each takes the largest average over a window of
  its own duration anywhere in the series.
- **Series are for non-soil media only.** A series on a soil pathway is a RangeError (soil is constant,
  RISC5 choice). A chemical listed twice in one receptor is a RangeError (it would be counted twice).
- **The M1 adapter is generic.** `groundwaterBreakthrough(run, times, origin)` takes a function that
  evaluates a groundwater method at one time and returns the concentrations at the well-screen points,
  averages them with equal weights and clips round-off below zero. It does not choose the screen points
  or times.
- **EPCs in the scenario are SI specs.** `constantEpc` converts the pathway's boundary unit (mg/kg,
  mg/L, mg/m3); `seriesEpc` and the adapter are already SI. Every EPC record in the result carries its
  origin.
- **Legacy hazard summary.** The legacy method has no life stages, so its summary reports one group
  named `total`.

## 2026-10-16: M4 review fixes (independent review of the branch)

An independent review of the M4 branch ran after slice E3. Its findings are fixed in the commits after
`d9613db`, each with a test that failed first; the earlier rulings above are amended in place where a
finding changed them (E2 dermal form, 5, 11 and 14). Judgment calls, open to overturn:

- **Timing checks allow for load.** A speed check is a regression tripwire, not a benchmark, so it takes
  the best of several runs after a warm-up. The vadose speed test (`vadose-legacy.test.ts`) uses the best
  of nine runs under 250 ms, a 5x margin on its 50 ms design budget; the plan-view grid check
  (`groundwater-kernel.test.ts`) uses the best of three under 1 s. The mass-conservation quadrature there has
  a 30 s wall-clock timeout (vitest's 5 s default failed under load); it asserts mass, not time. An
  order-of-magnitude slowdown still fails.
- **Generated document dates use the local calendar day.** `toISOString` gives the UTC day, which is a day
  ahead in the evening in Mountain time. `localIsoDate` fixes this, and the attributions header moves to
  2026-10-16 (the content change day). The date still moves only when the content changes.
- **`epa2003toxhier` is a `data` reference.** The RSL tables apply its tiers; the memorandum is not a
  method citation, so it is not `planned` (a planned status reads as an unverified citation).

## 2026-10-16: M5 cleanup levels scope (stage 1)

Bryan's "continue" started M5 with a methods note first: `docs/methods/cleanup-levels.md` (scope,
equations, root finding, allocation options, MCL and RSL columns, the Soil Screening Guidance leaching
level, warnings, fixture plan, and the stage 2 and stage 3 slice plan). No engine, data or web code is
written in this stage. Four references were added as `planned` (`brent1973`, `ragsb1991`,
`epa1996ssgug`, `epanpdwr`); the notes of `epa1996ssg` and `epa2002ssg` record the sections read. The
EPA SEMS host did not answer on 2026-10-16, so the three Soil Screening Guidance documents were read from
Internet Archive captures of their SEMS URLs, and RAGS Part B from the copy on epa-dccs.ornl.gov that
EPA's RAGS Part B page points to through SEMS.

Rulings (DEFAULT means open for Bryan to overturn; the others are forced by the source named):

1. **Scope.** DEFAULT. M5 covers the nine M4 direct pathways (legacy and modern), the modeled chains of
   M1 (dissolved source), M2 (VADSAT and layered) and M3 (two-region and exponential) through the M1
   receptor well into drinking water and bathing, and the Soil Screening Guidance soil-to-groundwater
   level. Deferred: vapour chains (M6), shower inhalation from tap water, particulates and irrigation
   (M7), surface water as a target medium (M8), plant uptake and TPH fraction levels (M9), probabilistic
   levels (M10), target-organ segregation, pH-dependent Kd and Koc.
2. **Solver.** Brent's method is forced by the standing assumption of 2026-10-15; the details are
   DEFAULT: solve in u = ln C with g(u) = metric(e^u) / target - 1; try the linear shortcut first and
   accept it only when one more forward run meets |g| <= 1e-9; bracket upward against the cap (or with
   `bracketRoot`, growth 10, 40 expansions) and downward with `bracketRoot` on 1 / C; `brent` with an
   absolute tolerance of 1e-12 in u and 200 iterations, non-convergence an Error. The secant is a
   diagnostic only (`secantParity`), never the reported value. `numerics/roots.ts` is not changed.
3. **One cleanup level per source medium.** DEFAULT. Pathways of the same medium are summed; media are
   not summed (`ragsb1991` combines pathways for a given medium; the manual says both "per medium" and
   "all media summed").
4. **Individual is the default allocation.** DEFAULT (RISC5 opens on it; the RSL and SSG levels are per
   chemical). Cumulative proportional scaling (RISC5 choice) and equal allocation (TR / N and THQ / N,
   after `epa1996ssgug` section 2.5.3) are options.
5. **Cumulative scaling is solved for one scale factor directly**, s = min(s_cancer, s_noncancer), closed
   form for direct pathways and one Brent solve per endpoint for modeled ones. DEFAULT; it reaches the
   fixed point of RISC5's limiting-chemical procedure. The summed HI is over all organs and is warned.
6. **A soil source is linked to the receptor's direct soil pathways** (their EPC is the source
   concentration), so both kinds of pathway count toward the target. DEFAULT, following RISC5's rule that
   all pathways of a source add.
7. **TPH-bearing sources keep the original mole fraction** (TPH scaled with the chemical), with the
   implied TPH reported in individual mode; holding TPH fixed is an option. DEFAULT (RISC5 choice).
8. **A groundwater concentration target is met by the peak well concentration** (moving-average window 0),
   with a user window in years as an option. DEFAULT.
9. **Receptors.** One or two; with two non-additive receptors the lower level is reported; the legacy
   additive option sums cancer coefficients only, and is refused (RangeError) with an age-segmented modern
   receptor, as in M4. DEFAULT (RISC5 allows one receptor for modeled chains).
10. **SSG dilution.** The default DAF is 1, the RSL's choice, with 20 (the guidance's 0.5-acre default)
    and the site-specific equations as options: DEFAULT. Capping the mixing depth at the aquifer
    thickness and keeping the higher of the partition and mass-limit levels are forced by
    `epa1996ssgug` and `epa1996ssg`.
11. **SSG target groundwater concentration**: the MCL, a user value, or the back-calculated risk-based tap
    water level (drinking plus bathing), in that order of offer; the guidance's nonzero MCLG is not
    offered because the database has none. DEFAULT. The tap water level omits the household-use
    inhalation term (M7) and warns for volatile chemicals with an inhalation value, on the SSG panel and on
    the direct-pathway table alike (the screen passes the database `volatile` flag to the engine).
12. **Csat for the SSG check uses the partition equation's own soil inputs** (theta_w 0.3, f_oc 0.002),
    through the M3 helper; a level above Csat is reported unchanged and warned. DEFAULT.
13. **Targets.** TR 1e-6 and THQ 1 by default (DEFAULT; the values of `ragsb1991` section 2.7 and the
    RSL). The lower of the cancer and noncancer levels is the cleanup level (forced by `ragsb1991`). A
    concentration target replaces the risk targets for that chemical and is refused with cumulative or
    equal allocation (DEFAULT, RISC5 choice). An MCL with the RSL "(G)" marker is used as printed and
    warned. An MCL not in mass per volume (asbestos, fibers/L) is flagged `mclUnit` in `tox.json` and
    never used as a target. A cumulative chemical with a blank or zero entered concentration has no
    level (not a level of zero) and is listed as not quantified.
14. **Search caps.** Soil at 1e6 mg/kg (pure substance, RISC5 choice); a dissolved source at its
    solubility when known; a target not met at the cap is reported as not reachable, never capped
    silently. DEFAULT.
15. **Data plan.** The data build (slice D2) reads the summary table's MCL (108 rows, ug/L, 25 "(G)"
    cells, two of them bare) and published SSL columns (risk-based 747 rows with a c / n key, MCL-based 91 rows, both at
    DAF 1) into `tox.json`, the published SSLs as comparison values only, and writes a derived
    `cleanup-chemicals.json`. Kd comes from the parameters table (56 rows) for metals and PFAS, Koc times
    f_oc otherwise; no pH table. DEFAULT.
16. **Air-filled porosity is n - theta_w unrounded** (0.1340 with rho_s 2.65), as the RSL computes it, not
    the TBD's printed 0.13; every fixture reproduces either way. DEFAULT.
17. **Tolerances.** DEFAULT. SSG Table A-1: the table's own rounding (two significant figures from 10 up,
    one below), half a unit in the last printed digit. RSL MCL-based SSL (91 rows), risk-based SSL (6
    rows) and combined tap water levels: half a unit in the second significant figure, as the M4 RSL
    check. Hand cases 1e-9 relative, except H1 at 1e-7 (it inherits the eight printed figures of M4 case
    M1) and H4 at 1e-12. Round trip 1e-9 for analytic chains and 1e-3 for the layered finite-volume chain
    (its own convergence level); verified shortcut against Brent 1e-10; secant parity 1e-8; ratio
    preservation and SSG identities 1e-12.
18. **Fixture selection.** DEFAULT. Volatile chemicals with an inhalation value are left out of the RSL
    risk-based SSL check and the resident soil totals are not used (both include M6 or M7 terms);
    benzo(a)pyrene is left out of the tap water checks (the RSL drops its dermal term outside the
    prediction domain, M4 computes and warns). There is no RISC5 fixture: chapter 8 has no worked example
    and Appendix R no back-calculation table.
19. **Method ids and citations.** DEFAULT. `cleanup.rags-b-1991` (legacy: `ragsb1991`, `rags1989`,
    `epa1991sdef`, `epa1992dea`), `cleanup.rags-e-f-2014` (modern: `ragsb1991`, `ragse2004`, `ragsf2009`,
    `epa2014ef`, `epa2005adaf`), `cleanup.ssg-leaching` (modern: `epa1996ssg`, `epa1996ssgug`, `epa2002ssg`)
    and `cleanup.modeled-chains` (modern: `brent1973`), registered in slice C4, which flips the new
    citations to `used`. The two RAGS methods are the closed-form direct back-calculation and describe only
    that; the Brent solve over the modeled chains is its own registered method (`solveModeled`), so the
    registry cites the root finder exactly where it runs.

## 2026-10-16: M6 vapor models scope (stage 1)

The M6 track was approved to start with a methods note first. The note is `docs/methods/vapor-models.md`
(scope, equations in our own words, coupling, the outdoor interface for M7, data plan, fixture plan and
the stage 2 and stage 3 slice plan). No engine, data or web code is written in this stage. Nine planned
references received their verified published titles and six were added (`abreu2006`, `jury1990`,
`lahvis2013`, `epa2017je`, `epavisl`, `api2012biovapor`), all `planned`.

Rulings, each DEFAULT (Bryan's to overturn) unless marked as forced by a source:

1. **Scope.** M6 ships `vapor.je-1991` (legacy J&E, soil, soil gas or groundwater to indoor air),
   `vapor.dominant-layer-1998`, `outdoorAir.box`, `vapor.je-epa` (modern EPA J&E), `vapor.devaull-2007`,
   `vapor.attenuation-factor-2015`, `vapor.pvi-screen-2015`, `outdoorAir.ssg-vf-1996` and `vapor.jury-bam`.
   Deferred: PVIScreen sampling (M10), shower, sprinkler and particulates (M7), vapor cleanup levels (M5),
   Jury with nonzero water flux, lateral offsets and three-dimensional models.
2. **The legacy oxygen-limited model (Appendix K) is not implemented.** Its only source is an unpublished
   draft, so there is no primary publication to implement from (forced by the clean-room rule), and the
   Appendix R review says its output was never validated. DeVaull 2007 is the oxygen-limited option.
3. **One legacy indoor method for all three source kinds.** Appendices D and E share the J&E physics; the
   groundwater source adds a Henry's-law source and an entered capillary fringe layer.
4. **Residual-phase source vapor is x S H**, not x P_v M / (R T), matching the M2 and M3 residual test;
   the vapor-pressure form is reported for comparison only.
5. **Crack diffusion.** Legacy: the foundation layer's own Millington-Quirk coefficient from its entered
   porosity and moisture (RISC5 choice, as Tables R-3 and R-5 list the foundation as a layer). Modern: the
   coefficient of the soil layer at the floor, and L_T excludes the floor (forced by `epa2004je`).
6. **Legacy air viscosity 1.8e-4 g/(cm s)**, the value with which Tables R-3 and R-4 both reproduce to
   their printed figures (1.81e-4 gives 8.565 and 7.272, so Table R-4 would round to 7.27 instead of 7.28;
   both values pass the 0.5 percent tolerance of ruling 17).
7. **Quasi-steady coupling.** Steady vapor models applied to a source series give an air series at the
   same times, with `vapor.quasi-steady` warned when the source changes by more than 10 percent within
   the vapor equilibration time.
8. **No volatilization loss is added to M3.** Region 1 pore water may serve as a vapor source, but the M3
   mass balance and its results stay as they are (conservative for groundwater).
9. **Modern J&E** uses the `epa2004je` equations with the Version 6.0 defaults of `epa2017je` (Q_soil / Q_B
   0.003 scaled by 0.45 / ER, foundation types, building defaults). The soil-source option, which Version
   6.0 removed, is kept for M2 and M3 sources and warned (`vapor.soil-source-not-recommended`).
10. **Chemical data.** RSL values stay primary for every property they carry. T_B, T_C and dH_v,b for the
    temperature correction come from the lookup table in `epa2004je` (Appendix C copy, 108 chemicals),
    transcribed with the PDF checksum into the derived `vapor-chemicals.json` (slice V0, built);
    enthalpies not at the normal boiling point, and crotonaldehyde's misprinted one, are omitted from the
    merged row. Without them the modern method uses H at 25 deg C and warns (when the system temperature is not 25 deg C; at 25 deg C there is nothing to correct). DeVaull rates by class from
    `api2012biovapor` Appendix C (one rate per class; the alkylbenzene class is applied to the propyl and
    butyl benzenes as well as the six chemicals Appendix C names, a reading of its heading); a chemical
    with no class is non-degrading and warned. Oxygen mass ratios come from committed formulas for the
    classed chemicals. Oxygen diffusivities are required inputs until a verifiable source is found.
11. **DeVaull oxygen options:** entered aerobic depth, fast-reaction depth (closed form without respiration, a
    bracketed root with it), and the coupled solution (a bracketed root find); both use one oxygen balance,
    derived from D_O O'' = R + Y kappa C with the oxygen and its flux zero at the aerobic base, so the supply
    D_O O meets the first moment of the demand (option 2 is its point-sink limit); baseline respiration 1.69 mg O2/(g organic carbon day) times f_oc
    (forced by `api2012biovapor`).
12. **Empirical attenuation factors** are those of `epa2015vi` Table 6-1 (forced by the source); the
    groundwater factor applies to H'(T_gw) C_gw at 25 deg C unless a temperature is entered, as VISL does.
13. **The PVI screen is a verdict, not a concentration**, with the `epa2015pvi` Table 3 thresholds and the
    6 ft and 15 ft separations stored in feet as published (forced by the source); precluding factors
    force further assessment.
14. **Outdoor air.** Legacy box C = sum(E) / (u delta W) (an area flux over the footprint gives F L / (u
    delta)). Modern SSG volatilization factor (Equations 6 and 55 of `epa1996ssg`) with Q/C user-entered
    and the guidance default 68.81; Table 3 of the guidance (29 cities, six areas) is transcribed as data.
    The box could not be attributed to `astme1739` from a public source, so it cites the RISC5 review
    references only and a ruling on citing the standard is requested. The SSG equation prints pi as 3.14;
    the code uses pi (0.02 percent).
15. **Jury volatilization:** the closed form derived in the note for zero water flux (semi-infinite soil,
    clean cover, finite layer, optional boundary layer, first-order decay), checked against the published reduced
    solution and Jury 1983 flux as reproduced in `epa1996ssg` Appendix C, an independent finite-volume
    solution and mass balance, because neither paper's full text was read; no boundary layer by default.
16. **Outdoor interface for M7:** `outdoorAirEpc({ box, emissions, direct })`, with emissions as area
    fluxes or mass rates into the box and direct contributions as concentrations from dispersion-factor
    models; contributions keep their origins, and mixing a box emission and a Q/C contribution for the
    same area is warned. M9 needs no vapor interface.
17. **Tolerances.** Tables R-3, R-4 and R-5: 0.5 percent of the RISC column (trial reproductions are
    within 0.12 percent; tighter than the ROADMAP's 2 to 3 percent maximum). Table R-6: not asserted; its
    printed output repeats Table R-5's and no box reading reproduces it, so the box hand value (2.5444e-6
    mg/m^3) is asserted at 1e-9 and the printed value is a named exception. Appendix J example: 0.01
    absolute on the normalized concentrations (they are figure readings). EPA 2004 Appendix C example:
    half a unit in the third printed figure, viscosity not asserted. VISL calculator values: not obtained
    (calculator not run), so identity 8c against the RSL resident air values stands in at 1e-12. Identities 1e-12 (1e-9 for limits, 1e-6 for quadrature mass balances);
    hand cases 1e-9. SSG volatilization factor against Table 3-A: 4 percent (the printed values have two
    significant figures and the table's Koc, H' and diffusivity inputs are rounded; observed 0.8 to 3.6
    percent). Jury against the finite-volume solution: 2e-4 (observed 6e-5 at most).

Fixture readings recorded in the note: Table R-3 takes its source soil from Table R-4's source block and
places the lens outside the 2.60 m vadose zone (L_T 2.80 m); Table R-5 is a diffusion-only run (Q_soil 0);
Table R-4's degradation rate is 0.09 /d in the water-phase form. With RISC4 benzene properties these
reproduce 8.57, 8.57e-2, 3.23e5, 7.28, 7.27 and 2.27e-3 as printed.

Slice V4 (modern EPA J&E, built 2026-10-17) readings, all verified against the Appendix C worked example
(`test/fixtures/vapor/epa2004-sl-adv.json`):

- **Millington and Quirk exponent 3.33 in the modern method.** The guide prints 3.33 (Equation 6 and the
  soil equation); the worked example's coefficients (5.54e-3 and 1.42e-2 cm^2/s, total 7.97e-3) reproduce
  only with 3.33, whereas the exact 10/3 gives 5.51e-3, 1.41e-2 and 7.94e-3. The legacy methods and the
  vadose process keep 10/3. The fixture tolerance was not widened.
- **Strata run from grade and the floor trims them.** Layers above the floor drop out of the diffusion
  column, the crack coefficient is that of the layer in contact with the floor, and the source soil for
  C_source and the finite source is the deepest stratum (the example reproduces with the bulk density of
  stratum C, 1.66 g/cm^3). For a groundwater source the capillary zone is carved from the bottom of the
  column and must leave its top below the floor (a RangeError otherwise, as the guide states).
- **Registration.** `vapor.je-1991` and `vapor.dominant-layer-1998` (slice V2) are registered together with
  `vapor.je-epa`, as the registry test pairs each legacy process with a modern one; `johnsonettinger1991`,
  `johnson1998`, `epa2004je` and `epa2017je` are now `used`. The outdoor air and Jury descriptors were
  registered in slice V7.
- **Air viscosity** is an input (default 1.75e-5 Pa s, the value the guide prints at 10 deg C), because
  the guide gives no temperature formula; it is not asserted by the fixture.
- **Building presets** are the Version 6.0 residential defaults (Table 9: 150 m^2 square floor, mixing
  height 2.44, 3.66 or 1.30 m by foundation, 0.45 exchanges per hour, crack fraction 0.001, Q_soil / Q_B
  0.003). The commercial floor area (1,500 m^2) and mixing height (3 m, basement) are in the document but
  its commercial air exchange rate was not found, so no commercial preset is built; they are entered.

## 2026-10-16: M8 surface water and sediment scope (stage 1)

M8 started with a methods note first, on the parallel track Bryan approved ("M8" as its own track). The
note is `docs/methods/surface-water.md` (scope, equations, validity checks, coupling, criteria data plan,
fixture plan and the slice plan for stages 2 and 3). No engine, data or web code is written in this stage.
Current criteria sources were checked on the official sites on 2026-10-16. Rulings, each DEFAULT (open for
Bryan to overturn) unless marked forced by a source:

1. **Scope (DEFAULT).** In M8: the legacy well-mixed box for a river reach or a lake
   (`surfaceWater.well-mixed`) with Darcy discharge across the bed, the 5 percent Domenico reach width and
   equilibrium-partitioning sediment; the modern method (`surfaceWater.mass-discharge`) with the M1
   bank-plane mass discharge, the transient well-mixed box, plug flow with first-order decay to a
   downstream river receptor, and equilibrium-partitioning sediment with a selectable pore water and an
   organic-carbon-normalized output; comparison with the EPA national recommended water quality criteria
   (aquatic life and human health) and with sediment benchmarks. Deferred: incomplete lateral mixing,
   estuaries and stratified lakes, site-chemistry criteria (biotic ligand copper, aluminum, ammonia,
   selenium; shown as site-specific), international criteria, EPA equilibrium partitioning sediment
   benchmarks and the `long1995` marine ERL and ERM, sediment processes beyond partitioning, runoff and
   point discharges, and cleanup back-calculation (M5).
2. **Mixing fraction on flow and volume (forced by Table R-8).** C_sw = W / (f Q_u + Q_gw + k f V_b). The
   review's lake value (3.93 mg/L) is reproduced only with f on both the upstream flow and the volume; f on
   the volume alone gives 2.60 and on neither 1.34. The manual's own adjusted-volume lake example is not
   reproduced by its stated form and is not used.
3. **Centreline concentration at the bank (DEFAULT).** The legacy C_gw is the M1 centreline profile at the
   bank averaged over the discharge thickness (water table to depth d) with the M1 well-screen trapezoid
   rule, not a single depth.
4. **Reach width (DEFAULT, RISC5 choice kept).** Linked runs use the full width between the points where the
   steady Domenico concentration falls to 5 percent of the centreline, with RISC5's alpha_x = 0.1 x_s and
   alpha_y = alpha_x / 3 (the groundwater run's alpha_T is an option), x_s measured from the downgradient
   source face; the user may enter the reach length instead.
5. **Storage (DEFAULT).** The legacy box is quasi-steady at each sample time (RISC5 choice); the modern box
   is the exact transient solution for a piecewise-linear loading, starting from the steady state of the
   first sample unless an initial concentration is given.
6. **Modern loading (DEFAULT).** The advective mass flux q C integrated over the reach and the discharge
   thickness at the bank plane; the dispersive flux across the plane is neglected and the plane passes the
   plume through (the M1 aquifer is unbounded downstream). This conserves the mass M1 delivers (fixture 4
   of the note).
7. **Modern groundwater flow (DEFAULT).** Q_gw = q d L_r with the M1 Darcy flux; the legacy method keeps
   K_b d L_r i_b (RISC5 choice) and warns when K_b i_b differs from q by more than a factor of 2.
8. **Sediment (DEFAULT).** Kd = f_oc Koc when the database has a Koc, otherwise the database Kd; neither
   means not quantified. Pore water: legacy the centreline groundwater (RISC5 choice); modern the
   flux-averaged discharging groundwater by default, with the centreline or the mixed surface water as
   options.
9. **No fish ingestion pathway (DEFAULT).** RISC5 has none and M4 has none; it needs a bioaccumulation
   factor source. The human health "organism only" criterion is offered as the fish consumption screen.
10. **No human sediment pathways in M8 (DEFAULT).** RISC5 routes sediment through its soil equations;
    adding pathways to M4's pathway list now would collide with the parallel M5 track. They follow once
    M8 and M5 merge; meanwhile a sediment value can be typed into the M4 soil pathways as a constant. The
    surface water series feeds the existing M4 swimming pathways unchanged (`seriesEpc` with origin
    `surfaceWater.<method>`).
11. **Criteria comparison on the peak (DEFAULT).** The peak of the surface water series is compared with
    every criterion (acute, chronic and human health), because the model's steps cannot resolve one-hour or
    four-day averages and the peak is never below them; ratios are reported per chemical and criterion and
    never summed across chemicals.
12. **Hardness-dependent metals (DEFAULT).** Computed from the aquatic life table's Appendix A and B
    parameters at a user hardness, default 100 mg/L as CaCO3 (the table's basis); outside 25 to 400 mg/L is
    warned (a screening choice to be replaced if the appendix states other bounds). Metals criteria are
    dissolved and the model concentration is taken as dissolved (warned).
13. **Sediment benchmark sources (DEFAULT, amended in slice D2b).** EPA Region 4 Ecological Risk Assessment
    Supplemental Guidance, March 2018 update (Tables 2a, 2b, 2c; public domain). The MacDonald et al. 2000
    consensus TEC and PEC were part of this ruling (numeric values with the citation, as facts) but are not
    shipped: the first build typed them from recall because the article is paywalled, and recalled values
    must never ship. Open until a copy of the article or a complete public reproduction is available.
    NOAA SQuiRTs are not a data source: NOAA's Office of Response and Restoration removed them on April 4,
    2024 as out of date, and they may be redistributed only whole and unmodified. This departs from the
    ROADMAP rows M, N, which name SQuiRTs; their TEC and PEC columns may serve as a transcription
    cross-check only.
14. **Raw criteria files committed (DEFAULT).** As for the RSL (M4 ruling 9): the two NRWQC HTML pages as
    served, the Region 4 PDF (about 1.3 MB) and transcribed CSVs, each
    under a SHA-256 manifest; the build reads only committed files and fails on a mismatch. The PDF is
    never parsed in the build or CI: a hand-run extraction script writes the CSVs; HTML is read without a new dependency if the markup allows, otherwise with
    an exact-pinned build-time devDependency recorded here.
15. **Edition naming (DEFAULT).** The NRWQC pages are not numbered editions, so the raw and generated
    directories are named by the date of the first check (2026-10-16), the manifest records the date the
    committed bytes were fetched (2026-10-17, same sizes as the first check), and each page's last-updated
    date (aquatic life June 9, 2026; human health December 18, 2025) is recorded as its edition. The raw HTML
    keeps the pages' own em dash glyphs for empty cells; the generated JSON stores no em dash. Rows are keyed by hyphenated
    CAS number (the NRWQC prints them without hyphens) so they join the RSL database.
16. **Tolerances (DEFAULT).** Table R-8 and the manual's two Appendix L examples: half a unit in the last
    printed digit, stricter than the 2 to 3 percent of ROADMAP section 6 because no approximate erf is
    involved and the review reports exact agreement; hand cases 1e-9 relative; mass balance with M1 1e-6
    relative (the M2 and M3 aquifer-mass tolerance); box identities 1e-9; hardness equations reproduce the
    printed table values to the table's two significant figures. The Table R-8 Koc (59 mL/g, benzene) comes
    from the RISC4 database for this case only, following the Table R-7 convention.
17. **Background (DEFAULT).** The upstream background enters as f Q_u C_u, consistent with the share of the
    flow it rides in; Table R-8 has zero background and cannot decide it.

Slice E3 (registration and coupling, 2026-10-17) implementation choices, none overturning a ruling above:
the runs for both methods are in `surfaceWater/scenario.ts` and take SI inputs (boundary conversions stay
in `units.ts`); the surface water series becomes a swimming EPC through `surfaceWaterEpc` (one time gives a
constant EPC, since M4 series need two samples); the modern run reads the bank either as a plane
concentration function (computing `bankPlaneDischarge`) or as a given discharge series; a ratio within 1e-12
of 1 is not an exceedance (unit-conversion rounding), found when a concentration equal to its criterion
computed 1.0000000000000002; the legacy plume-underflow check takes its depth fraction from the caller (the screen passes the share
the modern bank plane measured, and declares a full plane of eight spreading standard deviations so both
methods warn of reach truncation and underflow). The plane integral narrows to the extent of the field
before its fixed panels, so a narrow plume over a long reach is not lost; the legacy C_gw follows ruling 3
(trapezoid, end points at half weight). Pentachlorophenol's freshwater criteria are flagged pH-dependent
(`criteria.ph-dependent`) and saltwater aluminum, which the table does not tabulate, reads "no criterion".

Screening thresholds in the note's warning table (99 percent reach capture, 95 percent depth capture, a
30-day residence time, groundwater above the mixing upstream flow, a factor of 2 on the Darcy flux) are
screening choices, not rulings, as in M2 and M3.

M8 slice D2 (sediment benchmark data build, 2026-10-17) implementation choices, none overturning a ruling
above:
- **Region 4 PDF.** Fetched 2026-10-17; the bytes match the checksum recorded on 2026-10-16
  (SHA-256 `7c89bc7c...2d0889`, 1,284,613 bytes). Tables 2a, 2b and 2c are on PDF pages 81 to 89. The CSVs
  are written by `scripts/extract-r4-sediment.ts` from `pdftotext -layout`, with blank cells placed by the
  horizontal position of each token against its page's column headings; every row carries its PDF page. The
  extraction was reviewed row by row against the page text, and the build tests read spot values from the
  pages.
- **Basis of a value.** The report marks the unit of each Table 2a and 2b value by the fill of its cell:
  the notes under the tables (PDF pages 84 and 87) say a gray shaded cell is ug/kg dry weight, and the
  organic section headings read "ug/kg @ 1% OC unless denoted by shading". The fill does not survive text
  extraction, so `scripts/read-r4-shading.ts` renders each table page at 150 dpi, finds every printed value
  by its word box and records the fill behind it (`none`, `gray`, `tan`) in shade columns of the CSVs; every
  row keeps its PDF page. A gray cell is dry weight; an unshaded cell under a "1% OC" heading is at 1 percent
  OC. The fill decides, not the source letter. A first build inferred the basis from the source letter and
  had 45 values wrong against the shading, among them every individual compound marine value with Table 2b
  letter d (benzo(a)pyrene 89, chrysene 108, bis(2-ethylhexyl)phthalate 182 and 2,647, unshaded, so 1
  percent OC) and the dioxins/furans values (Table 2a letter k, gray, so dry weight). `basisInferred` is kept
  only where the report is ambiguous about a cell: (1) the note of the cell's own letter states the other
  unit (for example bis(2-ethylhexyl)phthalate freshwater 2,600, unshaded with letter f, whose note says dry
  weight; Dicamba marine 630, unshaded with letter l; a gray Table 2a l value of a wildlife based row, which
  note l makes 1 percent OC); (2) the cell is shaded tan, the fill of the heading rows, which the legend does
  not name: the PAH totals 600, 1,000 and 1,610 freshwater and 655 and 1,684 marine are taken as dry weight
  because they are shaded ("unless denoted by shading"), flagged (the gray marine total LMW-PAHs, 312, is dry
  weight unflagged); (3) an unshaded cell under the heading "Other SVOCs - ug/kg", which states no basis,
  with no source letter (Triphenyl phosphate marine, 0.55): it takes the letter of the other value in its row,
  1 percent OC. Under that heading a letter whose note states a unit gives the basis. Table 2c is unshaded
  under a "1% OC" heading throughout, and the build fails on any other fill there. The inorganic sections
  are dry weight whatever the letter or fill. The Table 2b note for letter d (Florida coastal) states no
  unit while the Table 2a note for the same citation says dry weight; the Table 2b cells' fill governs.
- **Application of the values.** Section 6.2.3 of the report applies the Step 2 values as ug/kg dry weight,
  which equals the 1 percent organic carbon normalization at f_oc 0.01. The rows keep the published basis
  (`ocBasis` 0.01) and the criteria comparison normalizes by the user's f_oc, as the methods note says.
- **Transposed CAS.** The report prints sulfide as 18946-25-8, which fails the CAS check digit; the
  registry number of sulfide, 18496-25-8, passes it and is used, with the printed form kept in `casPrinted`.
  Every other printed CAS number passes. Monobutyltin is printed `78763-54 -9` and is repaired by removing
  the space.
- **MacDonald values (slice D2b, 2026-10-17).** The D2 build typed the 28 TEC and PEC pairs from recall and
  checked them only against each other and against Region 4 b-source rows; that is not provenance, so all
  MacDonald values, both CSVs, the manifest and the generated rows were removed (811 rows remain, Region 4
  only). Verification was tried against public-domain documents: EPA 905/R-00/007 (June 2000, Ingersoll et
  al., USGS report for EPA GLNPO) prints only the consensus PEC column in its Table 1, no TEC, and the USGS
  fact sheet 068-01 table covers trace metals only, so neither verifies all 28 pairs. `macdonald2000` is back
  to status `planned`. Open item: enter the values, each with a page, when a copy of the article or a
  complete public reproduction is available. NOAA SQuiRTs were not used.
- **Duplicates.** Rows the report prints twice (acrolein in two Table 2a sections with different values,
  phenanthrene and 4-bromophenyl phenyl ether in two Table 2b sections with equal values) are both kept; ids
  carry a `#2` suffix for the repeat.

M8 slice W2 (criteria panel and risk feed, 2026-10-17) implementation choices, none overturning a ruling above:

- **Criteria loaded on demand.** `criteriaDb.ts` imports the four generated files (aquatic, human health,
  hardness, benchmarks) dynamically, so each is a chunk of its own; the panel mounts only after the user asks
  for the comparison, so the surface water screen itself never fetches them.
- **Record mapping.** A freshwater cell of a metal in Appendix B becomes a hardness criterion (the equation,
  no tabulated value, dissolved); other value cells keep their printed value; a cell with no value on a row
  marked site-specific for that water type becomes a site-specific criterion (shown, never computed). Cells
  whose unit is not a water concentration (pH in standard units, million fibers/L, mg/kg tissue values) are
  dropped. Water type is passed to the comparison, so freshwater and saltwater criteria and benchmarks are
  never mixed. The organic carbon fraction for benchmarks at a stated basis is the screen's f_oc, entered with
  the sediment inputs; when it is missing or invalid the comparison reports that instead of a ratio.
- **Risk feed.** The surface water screen holds the legacy or modern surface water series in memory
  (`surfaceWater/feed.ts`, like the transport well feed) and the risk screen offers a per-chemical checkbox
  "Use the surface water result for the swimming concentration". The series goes through `surfaceWaterEpc`
  with origin `surfaceWater.well-mixed` (legacy) or `surfaceWater.mass-discharge` (modern), replacing the
  typed surface water concentration for that chemical, for both risk methods. Swimming time, frequency and
  skin area still come from the receptor panel.

## 2026-10-17: M6 web slices W2 and W3

The `#/vapor` screen gained its plot and screening panels (W2) and its feeds (W3). No engine process changed.
Rulings, DEFAULT (Bryan's to overturn):

1. **The profile plot draws the engine's points.** Both indoor methods return one profile point per layer
   boundary (three points for the Table R-3 case), so the plot joins them with straight segments on a log
   concentration axis, with the strata between the source and the floor as bands, and offers the points as a
   data table. It is not a smooth profile; no interpolation is invented.
2. **Outdoor air on the vapor screen.** Legacy: the outdoor box (2.25 m/s wind, 2 m mixing height, 10 m box,
   the Table R-6 inputs) over the steady diffusion flux from the legacy source vapor through the whole soil
   column to grade (the legacy capillary fringe, when entered, is the lowest layer and replaces the
   lowest strata, as in the indoor runs). Modern: the Soil
   Screening Guidance volatilization factor, offered for a soil source only, with the deepest stratum as the
   source soil and the soil's own porosity, moisture, density and Koc times f_oc; Q/C is entered (default
   68.81). The factor treats the source as exposed at grade, so a buried source is warned
   (`outdoorAir.ssg-surface-source`).
3. **Attenuation factor panel.** The 2015 factors act on soil gas and groundwater, so a soil source has none
   and the panel says so. Groundwater uses the entered Henry constant at 25 deg C (no temperature
   correction). The depth below the foundation is the source to building distance of the indoor air run.
4. **Petroleum screen panel.** Concentrations are optional entries; the separation defaults to the source to
   building distance and the shortest side to the side of a square floor of the entered area. The verdict,
   the LNAPL indicators and the precluding factors are shown as the engine returns them.
5. **Feeds into the vapor screen** (in memory for the session, like the existing feeds): the transport screen
   offers the groundwater concentration at the water table under the receptor point (the building is taken
   to stand there), 32 steps plus t = 0, built with `groundwaterWaterTableSeries`; the vadose screen offers
   the source pore water series and the saturated screen the region 1 pore water as one value. A pore water
   source gives the soil gas H times its concentration: the legacy method uses the entered H at 25 deg C, the
   modern method uses H'(T) from the boiling point data when they are entered (the same H' it diffuses with)
   and the entered H at 25 deg C otherwise. A long
   series is thinned to 120 times (ends kept). The steady methods are run at each time; `vapor.quasi-steady`
   uses L_T^2 R_g / D_T for the establishment time, R_g the thickness-weighted gas-referenced capacity of the
   column from the modern run (`capacityRg`), or 1 when that run failed. The tables above the feed panel keep using the entered source. The vadose
   volatilization flux series is not fed to the outdoor box (the vadose screen does not publish the
   volatilization velocity); the outdoor series is the box over the steady flux from each time's source vapor.
6. **Feed into exposure and risk.** The vapor screen sends the shown method's indoor and outdoor air for one
   database chemical (a CAS id; the Table R-3 benzene test values are not a chemical and cannot be sent).
   Indoor origins are `vapor.je-1991` and `vapor.je-epa`. Outdoor origins are the producing method ids
   `outdoorAir.box` and `outdoorAir.ssg-vf-1996`, not `vapor.<method>`, because they are not vapor methods
   (conflict with the slice brief's wording, resolved to the coupling section of the methods note). The
   outdoor series comes from the legacy box only; the modern factor gives a constant from the entered soil
   source. The risk screen offers a chemical's checkboxes only when the held feed is for that chemical.

Web form rulings that keep the two methods on one site (DEFAULT, Bryan's to overturn):

- **One water table.** The water table is the base of the entered strata for both methods. An entered
  capillary fringe replaces the lowest strata (the modern method carves its capillary zone from the bottom;
  the form now carves the legacy fringe the same way before the engine prepends it), so the comparison
  table, the profile plot and the outdoor column describe the same site. A fringe that leaves no soil
  between its top and the floor is refused in the form.
- **Soil gas flow.** The form offers "Modern default ratio": the modern run takes the Version 6.0 default
  Q_soil = 0.003 x 0.45 / ER x Q_B (ruling 9, default c) and the legacy run, which has no such default,
  keeps using the pressure-difference inputs. The modern run has its own air viscosity field (default
  1.75e-4 g/(cm s), the engine default); the legacy field keeps 1.8e-4 (ruling 6).

## 2026-10-18: M7 shower, irrigation and particulates scope (stage 1)

The M7 track was approved to start with a methods note first. The note is
`docs/methods/shower-irrigation-particulates.md` (scope, equations in our own words, coupling, the
irrigation interface for M9, validity checks, fixture plan and the slice plan). No engine, data or web
code is written in this stage. `little1992` and `waldenspence1997` received their verified published
titles, venues and DOIs (Crossref, 2026-10-18); both were `planned` at this stage and are `used` since slice E4.

Rulings, each DEFAULT (Bryan's to overturn) unless marked as forced by a source:

1. **Scope.** M7 ships `shower.fc-1986`, `shower.little-1992`, `shower.rsl-household`,
   `irrigation.sprinkler-fc`, `irrigation.pathways`, `particulate.box-emission`,
   `particulate.ssg-pef-1996` and `particulate.ssg-pef-2002`. Deferred: plant uptake and soil
   accumulation from irrigation (M9), probabilistic parameters (M10), construction-phase PEFs, multi-zone
   house models and gas-phase dermal uptake.
2. **One droplet kernel.** The two-resistance droplet fraction is shared by the legacy shower and the
   sprinkler; the film coefficients scale from water vapour and carbon dioxide by the square root of the
   molecular weight ratio. Outcome (S0, 2026-10-18): the reference values could not be verified, because
   `foster1986` has no confirmed published record. They ship as warned defaults and are overridable
   inputs; `little1992` is cited for the film theory only.
3. **Legacy stall is stagnant** (RISC5 choice): all mass volatilized during the shower is in the stall
   from the start, no exchange; a stall value above H C_w is warned, not clipped.
4. **Modern stall is Little's back-pressure and ventilation balance**, time-averaged over the time in
   the stall, solved in closed form (linear first-order ODE). Outcome (S0, 2026-10-18): the full text of
   `little1992` could not be read, so the equations are our statement of the theory, checked by the limit
   identities only, not line by line against the paper; no printed Little values are fixtures.
5. **The RSL household term** (`shower.rsl-household`, the Andelman factor as the RSL user's guide states
   it) is a separate modern screening method for the whole-house term of the RSL tap water level for
   volatiles, sent to the 24 h/day indoor air pathway (not the shower stall pathway). Outcome (S0,
   2026-10-18): the volatility criterion was verified in `epa2024rslug`; the factor K could not be
   verified (the equations are images), so K is a required, always-warned input with no default, and no
   RSL tap water level is reproduced by a fixture.
6. **Sprinkler width.** The sprinkler emission enters the M6 box as a `massRate` through
   `outdoorAirEpc` (no interface change); the box width is an input defaulting to the RISC5 1 m, warned
   when left at the default.
7. **No modern sprinkler model.** ROADMAP row I keeps Walden and Spence; the modern variant differs only
   in its exposure factors, which come from `epa2011efh` once its chapters are read. Until then all
   irrigation factors are required inputs, with no invented defaults.
8. **Particulates feed the outdoor interface unchanged:** legacy as an `areaFlux` (entered PM10 flux, or
   the wind-erosion flux, times the soil concentration), modern as a `direct` contribution C_s / PEF;
   the existing `outdoorAir.mixed-dispersion` warning covers using both for one area.
9. **F(x) is entered**, not computed; a digitised Cowherd function is deferred. The RISC5-listed SSG
   defaults (V, U_m, U_t, F(x)) become presets only after S0 verifies each against `epa1996ssg`.
10. **The 2002 Q/C regression is added as an option** for the PEF and, optionally, the M6 volatilization
    factor; the M6 default (1996 table, M6 ruling 14) is unchanged.
11. **Linearity.** Every M7 method is linear in its source concentration and returns its coefficient, so
    M5 cleanup levels are the target over the coefficient (no root find); M5 wrappers land in slice E4.
12. **M9 interface.** M7 exposes `IrrigationSource { origin, waterConcentration(t), applicationRate,
    season?, chemical }`; uptake, interception and soil accumulation belong to M9.
13. **Tolerances.** Identities 1e-12 (1e-9 for limits), hand cases 1e-9, published Little 1992, RSL and
    SSG values at half a unit in the last printed figure, Table R-9 shower rows at 3 percent (or a named
    exception if the review lacks the shower inputs).
14. **Not cited until verified:** the CRC water viscosity source, the 1994 EQ memo and the Andelman paper
    are not added to `references.json`; `astme1739` is not cited for the entered PM10 flux default, as in
    M6 ruling 14.

## 2026-10-18: M7 slice E1, shower engine

Implemented `processes/shower/{droplet,common,legacyStall,little,household}.ts` (not yet registered; E4
registers and flips citations). Calls, open to overturn:

1. **Unverified constants are inputs.** The film reference coefficients (3000 cm/h gas, 20 cm/h liquid) are
   RISC5 choices that S0 could not verify; they are the `filmReferences` input, defaulting to
   `RISC5_FILM_REFERENCES` with the warning `shower.film-reference-unverified`. The household factor K
   has no default (required input, always warned `shower.household-factor-unverified`). Water viscosity
   has no default: the optional temperature correction takes both viscosities from the caller and scales
   k_l only.
2. **Droplet diameter and fall time are required inputs**, no defaults.
3. **Little's model** is implemented from the note's own mass balance in closed form, with the exposure
   average taken over shower plus an optional post-shower stay (decay at Q_g / V_s). Not checked against
   the paper, which S0 could not read.
4. **Fixtures.** Published Little results and RSL tap water levels for volatiles (note fixtures 3 and 5)
   are not asserted in E1 (no readable source for the first, no verified K for the second); identities and
   hand cases at 1e-9 to 1e-15 only. No tolerance was widened.

## 2026-10-18: M7 slice E2, sprinkler and irrigation engine

Implemented `processes/irrigation/{sprinkler,pathways}.ts` (not yet registered; E4 registers and flips
citations). Calls, open to overturn:

1. **Sprinkler emission** reuses the E1 droplet kernel unchanged: E = f_v Q_spr C_w as a `massRate`
   `OutdoorEmission` (origin `irrigation.sprinkler-fc`), constant in time because the water concentration
   is evaluated per sample. Droplet diameter, fall time and flow are required inputs with no defaults; the
   film references carry the E1 default and warning.
2. **Box width** is an optional input; when omitted `sprinklerAir` uses the RISC5 1 m and warns
   `irrigation.box-width-default`. The mass rate itself does not depend on the width.
3. **Irrigation EPCs.** Ingestion and dermal EPCs are the water concentration itself (the M4 kernels take
   it unchanged); spray inhalation is the sprinkler box concentration. The irrigation exposure factors
   (contact times, ingestion volumes, skin areas) are not computed here: the Walden and Spence factors were
   never read in S0 and no invented defaults are supplied, so they remain M4 scenario inputs.
4. **M9 interface.** `irrigationSource` returns the `IrrigationSource` of the note; the application rate is
   a required input, the season is validated (nonnegative, end not before start), and the chemical is an
   opaque string because the engine has no chemical id type.
5. **Fixtures.** Identity and hand cases only (note fixtures 1 and 2); no tolerance widened.

## 2026-10-18: M7 slice E4, coupling, cleanup wrappers and registration

Registered the eight M7 methods (`shower.fc-1986`, `shower.little-1992`, `shower.rsl-household`,
`irrigation.sprinkler-fc`, `irrigation.pathways`, `particulate.box-emission`, `particulate.ssg-pef-1996`,
`particulate.ssg-pef-2002`), added `processes/household/{coupling,cleanup}.ts` and exported the three
process folders from the package root. Calls, open to overturn:

1. **Kinds.** The registry gate requires a legacy and a modern method per process. Shower has one legacy
   and two modern, particulates one legacy and two modern. Irrigation has only the legacy-style sprinkler
   (ruling 7: no modern sprinkler model), so `irrigation.pathways` is registered as the modern member
   (the note already calls it "legacy and modern presets"); its factors are still caller inputs.
2. **Citations and status flips.** Flipped to `used`: `little1992` (shower.little-1992), `waldenspence1997`
   (irrigation.*), `cowherd1985` (particulate.box-emission), `eq1994pef` (particulate.ssg-pef-1996) and
   `epa2024rslug` (shower.rsl-household, from `fixture`). `foster1986` stays `planned`: its title is still a
   descriptor and the registry test forbids citing it. So `shower.fc-1986` and `irrigation.sprinkler-fc`
   cite `little1992` for the shared two-resistance theory (and the sprinkler cites `waldenspence1997`),
   and the unverified Foster and Chrostowski coefficients appear only in their `risc5Choice` text as
   unverified RISC5 values. `little1992` is cited for the theory only; its mass balance is still our own
   statement, unverified against the paper.
3. **Coupling.** `waterDrivenEpc` evaluates any forward function per sample of a constant or series water
   source (the M1 breakthrough adapter), tagging the EPC with the method id; `irrigationEpcSpecs` tags
   ingestion and dermal `irrigation.pathways` and spray air `irrigation.sprinkler-fc`;
   `sprinklerOutdoorEmission` is the `massRate` emission for `outdoorAirEpc`. Particulate contributions
   use the E3 functions unchanged. Soil stays constant.
4. **Table R-9 shower inhalation rows are a named exception.** The review's shower inputs are not in the
   table or the RISC5 guide and the RISC4 manual that carries them was not available, so the four rows
   (one per chemical) cannot be reproduced without inventing droplet size, fall time, flow, stall volume
   and film coefficients. The fixture records them under `namedExceptions` (removed from `deferred`), as
   Table R-6 was in M6. The shower model keeps its identity and hand cases (fixtures 1 and 2); fixtures 3
   and 5 stay pending a readable source. No tolerance was widened.
5. **M5 wrappers.** `sourceLevelsOverCoefficient` divides the direct back-calculation's bathroom-air or
   outdoor-air level by the model coefficient (water or soil to air), with `cleanup.zero-coefficient`
   when the model transfers nothing. The test checks level equals target over (pathway coefficient times
   model coefficient) and that the forward run returns the air level. No root find.
6. **Particulate method inputs.** The method wrappers add a `volatile` flag that raises
   `particulate.volatile-chemical`; the `particulate.wind-below-threshold` warning of the note is not
   implemented (no bound was set from a source), and the note says so.

## 2026-10-18: M7 slice W1, household screen

Added the lazy route `#/household` (`apps/web/src/household/`, nav link and home button). Calls, open to overturn:

1. **Blank by default.** Only the soil screening guidance wind erosion defaults (V, U_m, U_t, F(x), from the
   engine constants verified in S0) are prefilled. The chemical, shower and sprinkler geometry, flows, the
   household factor K and the box are entered, because no source supplied defaults for them; the screen lists
   what is missing per section instead of showing an invented example.
2. **Units at the boundary.** mg/L, mg/kg, mm, L/min, min, cm/h and mm/h are converted to SI before the engine
   call (division by the factor, so the result is bit-equal to the engine at the SI inputs); results show mg/m3.
3. **Film references.** Both blank uses the RISC5 choice and keeps the `shower.film-reference-unverified`
   warning; entering both removes it; one alone is an error.
4. **Irrigation.** Spray air is the registered `irrigation.sprinkler-fc`; ingestion and dermal EPCs are the
   water concentration (E2 ruling 3). The application rate is optional and only feeds the M9 handoff object.
5. **Comparison.** Each process shows every method in a table with the chosen one marked; the warnings panel
   merges one warning code across the methods that raise it.
6. **Not in W1.** No chemical database, no feeds from other screens or into risk and cleanup, and no series
   input (constant water and soil only). Feeds and series were added in slice W2 (below); there is still no
   chemical database.

## 2026-10-18: M7 slice W2, feeds into and out of the household screen

Calls, open to overturn:

1. **Sources in.** The shower tap water can come from the held transport well series and the irrigation water
   from the well series or the held surface water series, chosen per process (`showerWaterSource`,
   `irrigationWaterSource`); the entered concentration stays the default. The result tables show a held
   series at its peak (a constant-source view); the full series goes out through the feed. A chosen source that
   is not held is an error naming it, never a silent fall back to the entered value. Soil stays constant.
2. **Series out.** Every M7 forward function is linear (ruling 11), so a series source gives the EPC series
   `coefficient * c(t)` through the engine's `waterDrivenEpc`, tagged with the method id (for example
   `shower.little-1992`); a constant source sends the screen's own value unchanged.
3. **Into risk.** The household feed (`household/feeds.ts`) carries bathroom air, sprinkler spray air and
   windblown particulate air for one chemical id (a CAS number entered on the screen, since the screen has no
   chemical database). The risk card offers shower air for the bathroom air medium (stall methods only; the
   RSL whole-house term goes to the indoor air medium instead, as a separate option, see item 6) and a choice of none,
   sprinkler or particulates for outdoor air; choosing one outdoor source clears the vapor outdoor option and
   the reverse, because the pathway takes one EPC. Irrigation ingestion and dermal EPCs are not sent: M4 has
   nine pathways and none is irrigation contact, so adding one is M4 work, not W2.
4. **Into cleanup.** The cleanup screen's direct mode shows, for the chemical of the household run, the tap
   water, irrigation water and soil level as the M5 air level over the model coefficient
   (`sourceLevelsOverCoefficient`, no root find), one row per receptor method (legacy, modern) per household
   term, naming the household method that produced the coefficient (item 7). Air levels still need the receptor's bathing and
   outdoor times; without them the level reads not quantified.
5. **Nothing held across a reload**, as for the other feeds. No tolerance was widened and no value was added
   from memory.
6. **RSL term goes to indoor air (review fix, 2026-10-18).** The RSL whole-house term is applied for 24 h/day
   (RSL User's Guide, Table 1, read 2026-10-18), so the feed carries it as `indoorAir` (risk option
   `indoorFromHousehold`, the 24 h indoor inhalation pathway; cleanup row "Tap water (household air)"),
   never as shower stall air whose time is the bathing time. The earlier routing overstated that pathway's
   time by about 44 times. The claim that the term reproduces RSL tap water levels is unproven until K is
   verified (item 4 of the E1 block).
7. **Method column (review fix).** `HouseholdRiskFeed.methods` carries the household method id behind each
   coefficient; the cleanup table prints it as "Household method" and the legacy/modern column is renamed
   "Receptor method".
8. **Volatility on the screen (review fix).** The self-declared checkbox is replaced by Henry (atm m3/mol)
   and vapor pressure (mm Hg) fields, `rslVolatile` gives the verdict shown on the screen, and an explicit
   override (force volatile or not volatile) wins. With neither field entered the chemical is treated as not
   volatile and the screen says what to enter. No unit conversion of the dimensionless Henry constant is done
   (it would need a stated temperature), so the atm m3/mol value is its own field.

## 2026-10-18: M10 uncertainty scope (stage 1)

Bryan approved M10 ("Yes, M7 and M10"). Stage 1 writes the methods note `docs/methods/uncertainty.md`
(scope, equations, algorithms, warnings, fixture plan, slice plan) and corrects or adds references. No
engine, data or web code is written in this stage. Four descriptor titles were replaced by verified
bibliographic data (`mckay1979`, `imanconover1982`, `saltelli2010`, `morris1991`) and seven references were
added as `planned` (`sobol2001`, `jansen1999`, `ishigami1990`, `hyndmanfan1996`, `wichura1988`,
`blackman2021`, `roseberry1992`), all checked through Crossref on 2026-10-18 with full texts not read.

Rulings (DEFAULT means open for Bryan to overturn; the others are forced by the source named):

1. **Scope** (DEFAULT). In: distribution library, parameter registry, legacy simple random sampling over
   exposure parameters, modern Latin hypercube with Iman-Conover rank correlation over exposure and
   transport parameters, Sobol indices with bootstrap intervals, tornado and Spearman, percentile fans and
   CDFs, probabilistic cleanup levels, worker pool with a run budget, Table R-2 case (a smoke test since the review fix to ruling 12). Deferred:
   Morris screening, quasi-random base sequences, two-dimensional Monte Carlo, distribution fitting and a
   cited default distribution library, toxicity-value sampling, M7 and M9 inputs until those land.
2. **Parameter registry** (DEFAULT). A method declares `uncertainInputs`, each with a stable dotted id,
   label, SI unit, category (exposure, transport, site, chemical), physical bounds, and pure `get` and `set`
   accessors; chains prefix ids by link so one sample drives the whole chain.
3. **Distributions** (DEFAULT). Constant, uniform, log-uniform, triangular, normal, lognormal (geometric
   or arithmetic parameters), empirical; inverse-CDF sampling only; truncation by mapping u into
   [F(lo), F(hi)], never by rejection; a support outside the input's bounds must be truncated or is refused.
   Phi^-1 by AS 241.
4. **Legacy method.** Exposure parameters only with simple random sampling (forced by the RISC5 manual's
   description of its Monte Carlo option); default n = 500, the count of the Table R-2 comparison (DEFAULT).
5. **Modern method.** Latin hypercube with Iman-Conover rank correlation (the ROADMAP section 3 plan of
   record); the sample correlation of the scores is corrected (T = Q Q'), not assumed to be the identity;
   default n = 1000 (DEFAULT).
6. **Transport sampling** (DEFAULT). Each iteration runs the whole deterministic chain; iterations refused
   by deterministic checks are counted, not dropped silently, and above 1 percent the run is flagged.
7. **Sobol estimator** (DEFAULT). Saltelli 2010 design, Saltelli first order and Jansen total effect
   estimators, N = 512, two independent LHS base matrices, indices on log10 Y by default, 500-resample
   bootstrap intervals with a 0.05 half-width convergence flag, correlations removed with a warning.
8. **Tornado** (DEFAULT). One at a time between each input's 5th and 95th percentiles around the base run,
   shown beside the Spearman rank correlations from the sample.
9. **Percentiles** (DEFAULT). Hyndman and Fan definition 7; fans at 5, 25, 50, 75 and 95 percent with the
   deterministic curve overlaid.
10. **Probabilistic cleanup level.** The level protecting a fraction p is the (1 - p) quantile of the
    per-iteration M5 cleanup levels (forced by M5's per-realization monotonicity); p = 0.95 by default, with
    0.5 and 0.9 shown, and unreachable iterations censored at the cap (DEFAULT).
11. **Seeding and budget** (DEFAULT). Explicit seed with the default `model-flow`; purpose-labelled streams;
    the whole sample built on one thread before any run so results are independent of worker count; pool of
    min(4, cores - 1) workers, 5-row pilot, confirm above 60 s, refuse above 10 minutes.
12. **Table R-2 case** (DEFAULT). Smoke test only, no comparison with the printed percentiles: the manual gives
    no input distributions and none has been taken from a read source yet, so any band around the printed
    values could be met by tuning unsourced spreads and would prove nothing. The test runs the legacy method
    on the printed case (0.005 mg/L, 500 iterations) with three sampled receptor factors and asserts no
    failed iteration and monotone, non-degenerate percentiles. Review fix: as first written the ruling asked
    for the 5th, 50th and 95th percentiles within a factor of 3 of the printed geometric mean, and slice E4
    widened unsourced spreads until that held, which made the band circular; the band was removed. The
    analytic lognormal, Ishigami and identity fixtures carry the real validation.
13. **Deferred methods** (DEFAULT). Morris 1991 screening and low-discrepancy sequences are deferred: with
    the input counts of these models (about 5 to 15) the Sobol design is affordable in the browser.

M10 slice E3 (samplers, 2026-10-18) implementation choices, none overturning a ruling above:

- Samplers live in `packages/engine/src/processes/uncertainty/samplers.ts` and are pure over a passed-in
  seeded stream. `seedStream(seed, purpose)` is `new Xoshiro128ss("<seed>:<purpose>")`.
- Iman-Conover takes the full k columns it is given (callers pass an identity block for uncorrelated
  inputs). A target that is asymmetric, lacks a unit diagonal, is not positive definite, or a sample with
  n <= k is refused with `uncertainty.correlation-not-positive-definite`; n < 5k warns
  `uncertainty.small-sample-correlation`. Ties in the reordering are broken by row index (stable).
- Spearman uses average ranks for ties. Sample standard deviation uses the n - 1 denominator.
- E3 registered nothing; `wichura1988`, `hyndmanfan1996`, `mckay1979` and `imanconover1982` became `used` when
  E4 registered the methods that cite them.

M10 slice E4 (runner and registered methods, 2026-10-18) implementation choices, none overturning a ruling above:

- `processes/uncertainty/runner.ts` holds a pure row runner. `buildSampleMatrix` makes the whole matrix on
  one thread (streams `<seed>:srs`, `<seed>:lhs`, `<seed>:ic`); `evaluateRows` applies the sampled values
  through the declared setters to a copy of the base input and runs the model over any slice of rows, so
  the web worker pool (W1) can call it per chunk; `runUncertainty` chunks (default 50) and writes back by
  row index. Chunking never changes the result (tested at one and four chunks).
- The registered methods `uncertainty.srs-exposure` (legacy) and `uncertainty.lhs-ic` (modern) are process
  `montecarlo`. Their input is a specification holding the model descriptor object, the base input, the
  distributions in SI keyed by input id, a scalar output extractor and optional n, seed, chunk size and
  correlation (modern only). Defaults: n 500 and 1000, seed `model-flow`. Callers build one with
  `uncertaintySpec`. A worker that cannot receive functions resolves the model and extractor by id on its
  side and calls `evaluateRows` with the rows it was sent.
- Refusals throw `UncertaintyError` (a `RangeError` with a `code`), matching the engine's other thrown
  refusals. A correlation on the legacy method, an unknown id, an empty specification and a bad n are
  refused as `uncertainty.bad-specification` or `uncertainty.unknown-input`. Both are added to the note's
  warning table, as is `uncertainty.non-finite-output` (a non-finite model output marks that iteration
  failed, like a thrown refusal).
- The legacy exposure method now declares water ingestion rate and exposure frequency per receptor next to
  body weight and exposure duration (E2 declared only the latter two), because the Table R-2 case samples
  the water intake. An absent optional factor reads as NaN, so the registry contract needs a base input
  that carries every declared factor.
- Table R-2 fixture values are the printed ones (RISC5 guide, section R.7.2). The input distributions the
  test samples are scaffolding with no source. Review fix: they had been widened until a factor-of-3 band
  around the printed percentiles held, which made the band circular, so the band assertion was removed (see
  ruling 12); the test is a smoke test of the runner and the legacy exposure method over three sampled
  factors, not evidence about RISC. See `packages/engine/test/fixtures/uncertainty/README.md`.
- `hyndmanfan1996` and `wichura1988` are cited by both methods because both use the percentile
  definition and the AS 241 inverse; the note's citation lists were updated in place.

M10 slice E5 (sensitivity, 2026-10-18) implementation choices, none overturning a ruling above:

- `processes/uncertainty/sensitivity.ts` holds `runSobol`, `runTornado` and `spearmanWithOutput`; the registered
  method `uncertainty.sobol-saltelli` (process `montecarlo`, modern) wraps `runSobol`. Its input is the E4
  specification plus optional `scale` and `bootstrap`; `n` is N (default 512). A and B use the streams
  `<seed>:sobol-A` and `<seed>:sobol-B`, the bootstrap `<seed>:bootstrap`.
- A row with a refused or non-finite run in any of the N (k + 2) evaluations is dropped from all designs together
  and counted (`failedRows`); above 1 percent it raises `uncertainty.failed-iterations`. Intervals are the 2.5th and
  97.5th bootstrap percentiles (definition 7); a first order estimate that is negative with an interval reaching
  zero is shown as 0 and the raw value is kept in `firstRaw`.
- The tornado uses `distributionQuantile` at 0.05 and 0.95, so truncation is respected; it costs 2k + 1 runs
  (the base run included). `spearmanWithOutput` uses the E3 average-rank Spearman over rows with a finite output.
- The first order sum centres f(B) on the pooled mean of f(A) and f(B) over the rows in use (recomputed per
  bootstrap resample). Review fix: the first implementation used f(B) uncentred, which is unbiased but whose noise
  grows with the output mean, so on log10 risk (mean near -6) the intervals spanned several units and every run was
  flagged not converged whatever N. Ishigami and the linear fixture have means near zero, so they could not see it;
  tests now assert indices and intervals are unchanged (to 1e-9) by adding 100 to the output and by a 1e-6 factor
  on the log10 scale, and that doubling N clears the flag. The Jansen total is shift invariant already.
- Fixture 5 passed at its stated tolerances (Ishigami N = 8192 within 0.03, linear additive within 0.02); no
  tolerance was widened. `saltelli2010`, `jansen1999` and `sobol2001` are `used`.

M10 slice E6 (probabilistic cleanup, 2026-10-18) implementation choices, none overturning a ruling above:

- `processes/uncertainty/cleanup.ts` holds `runProbabilisticCleanup`, `solveCleanupRows` (the pure row solver a
  worker can call) and `protectionQuantile`; the registered method `uncertainty.cleanup-probabilistic` (process
  `montecarlo`, modern) wraps it. The sample is the E4 Latin hypercube matrix (optional Iman-Conover), built
  on one thread; each row sets the sampled inputs through the declared setters and calls M5's
  `solveSourceLevel` (a `problem` builder) or any caller solver returning level, reachability and forward runs
  (`solve`, for example a chemical of `solveModeled` under cumulative or equal allocation). M5 numerics are unchanged.
- Censoring: an unreachable iteration is counted and held at the cap (infinity when no cap is known) above every
  solved level. The reported level at p is the Hyndman and Fan definition 7 (1 - p) quantile; when the
  interpolation touches a censored iteration the level is null ("not reachable below the cap"). A refused or
  non-positive solve is a failed iteration, counted like the other methods (above 1 percent
  `uncertainty.failed-iterations`).
- Protection fractions reported are the chosen one (default 0.95, must lie strictly in (0, 1)) plus 0.5 and 0.9.
  `forwardRuns` sums the solver evaluations, the figure the run budget (ruling 11) counts.
- Fixture 6 passed at its stated tolerances (quantiles within 2 percent of the analytic lognormal ones at
  n = 4000; exceedance fraction inside the binomial 99 percent band); no tolerance was widened. No reference
  changed status.

M10 slice E7 (registry coverage, 2026-10-18) implementation choices, none overturning a ruling above:

- Declarations use a `pathInput` helper in the registry (a scalar at a fixed path of the method input). An
  absent optional scalar reads NaN and is created by `set`; an absent parent object, an array index past the
  end or a false guard (the other variant of a union: river or lake, entered or Domenico reach, flow or Darcy
  discharge, soil, soil gas or groundwater source, oxygen mode, soil gas flow specification) reads NaN and
  `set` throws a RangeError, so a sample is never silently dropped. A caller samples only inputs whose base
  value is finite.
- Declared: `vadose.vadsat` and `vadose.layered` (infiltration, per-layer soil properties and thicknesses,
  source geometry, concentration and decay, chemical Koc, H, S, Da, Dw and mu, dispersivity),
  `saturatedSource.two-region` and `.exponential` (geometry, fluctuation, soil, aquifer, infiltration,
  chemical; the decay rate only on the exponential method because the legacy method refuses it), the seven
  `vapor.*` methods (chemical diffusion and Henry constants, layers or strata, building and soil gas flow,
  source, and for PVI the screen's own continuous inputs, which is the PVIScreen sampling M6 deferred),
  `outdoorAir.box`, `outdoorAir.ssg-vf-1996`, `surfaceWater.well-mixed` and `.mass-discharge`.
- Not declared: molar masses, the TPH pair, foundation type and user flags (constants or switches, not
  parameters), concentration and discharge series (outputs of the chain, not parameters) and the bank-plane
  quadrature source of the modern surface water method. Layer lists declare four slots per side (four layers
  or strata for vapor and layered vadose); a base with fewer layers reads NaN for the rest.
- The M1 groundwater methods were not declared in E7: E2 named them in the slice plan but declared only the
  exposure methods, and E7's scope lists M2, M3, M6 and M8. Closed by slice E8 (entry below).
- The coverage tests use runnable base inputs written for the test (`test/uncertainBases.ts`); their numbers
  are scaffolding, not data and not a validation. No reference changed status and no assumption text changed.

M10 slice E8 (registry coverage, remainder, 2026-10-18) implementation choices, none overturning a ruling above:

- The same `pathInput` and row helper as E7 declare the M1 groundwater methods (`groundwater.at123d`,
  `.wexler1992`, `.domenico1987`; velocity, retardation, decay, dispersion or dispersivities, source or patch
  geometry, finite aquifer width and thickness, the boundary concentration or release rate of four loading
  steps), the three `dispersivity.*` correlations (the transport distance), the M7 shower, irrigation and
  particulate methods, and the M9 plant uptake, eco and TPH methods. The full id lists are in
  `docs/methods/uncertainty.md`, slice E8.
- Not declared, with the reason: molecular weights and user switches or flags (constants and modes); receptor
  and station names and citations (labels); observation points and evaluation times (scenario choices); the
  TPH mass fractions (one composition that must sum to one; only the fraction levels and the target hazard
  index are declared); the shower temperature correction's calibration temperature and viscosities (constants
  of water, only the water temperature is declared); the irrigation season.
- Slot counts for list inputs: four loading steps, four benchmarks, two wildlife receptors with four food items
  each, eight TPH fractions. A base with fewer entries reads NaN for the rest and `set` refuses, as in E7.
- The film reference coefficients and the water temperature are declared even though the shower and sprinkler
  defaults are unverified RISC5 choices: they read NaN when the base omits them, so a default is never silently
  turned into a sampled value, and a caller who enters them can sample them.
- Categories stay transport, site or chemical (never exposure), which ruling 2 reserves for the legacy
  exposure method's receptor factors. The wildlife ingestion rates, shower time and similar receptor-side
  values are therefore categorised as site.
- The coverage tests use runnable base inputs written for the test (`test/uncertainBases.ts`); their numbers
  are scaffolding, not data and not a validation. No reference changed status and no assumption text changed.
- Still not sampled on a screen: modeled cleanup sources. The engine now declares the transport inputs, but no
  screen wires a transport chain into the cleanup solver; the W4 notes above describe the panel as shipped.

M10 slice W1 (worker pool and budget, 2026-10-18) implementation choices, none overturning a ruling above:

- `apps/web/src/uncertainty/` holds `budget.ts` (pool size, the 5-row pilot, the 60 s and 10 minute limits,
  the projection and the `uncertainty.run-budget` refusal), `protocol.ts` (the chunk message and `handleRows`, the
  pure handler the worker and the tests share), `pool.ts` (`runPooled`) and `uncertainty.worker.ts`.
- The worker resolves the model from the engine registry by method id and takes the scalar output as a property
  path into the result, because functions do not cross the worker boundary. The sample matrix is still built on
  one thread by the caller (`buildSampleMatrix`) and passed in as rows.
- The pilot is the first 5 rows, run alone on one worker; its results are kept, not discarded. Time is measured
  inside the worker around the model rows, so engine load is excluded. Projected wall time is the mean per-row
  time times all rows divided by the pool size (an estimate: it assumes the pool scales linearly). Above 60 s the
  caller's `confirm` decides (no callback means decline); above 10 minutes the run is refused with
  `UncertaintyError` code `uncertainty.run-budget` (added to the engine's code union) before any further chunk is sent.
- Cancel is an `AbortSignal`: every worker is terminated at once and the run rejects with `RunCancelledError`; a
  declined confirmation rejects the same way. A worker error or an error response also terminates the pool.
- Chunking, pool size and completion order never change the result: tested bit-identical to `runUncertainty`
  for 1 and 4 workers and with completion order reversed. The budget counts timed rows, so a probabilistic
  cleanup row that costs many forward runs is covered by its measured time rather than by a forward-run count.

M10 slice W2 (distribution editor and correlation input, 2026-10-18) implementation choices, none overturning a ruling above:

- `apps/web/src/uncertainty/editor.ts` is pure: text rows to SI distributions (`buildDistribution`), the CDF preview
  grid (`cdfCurve`, truncation limits or the 0.1th to 99.9th percentile, log spaced for lognormal and log-uniform), the
  correlation builder (`buildCorrelation`) and `buildEditorSpec`, which returns the `distributions` and `correlation`
  of the E4 specification plus sentences for the form. `DistributionEditor.tsx` is the controlled-by-itself component
  that calls `onChange` with that result; it is not mounted on a screen until W3.
- Each input defaults to "point value" (not sampled). A distribution is checked with the engine's `checkDistribution`
  against the input's physical bounds, so an untruncated normal on a bounded input is refused with the engine's message.
- Entered units are an optional per-input `{ unit, factor }` from the caller (default: the input's SI unit, factor 1);
  values are converted at the boundary with `convertDistributionUnits`. A lognormal given by arithmetic moments is
  converted with `lognormalFromArithmetic` in the entered unit first. No unit factor table is added here.
- The correlation is entered as pairs (a nonzero Spearman value strictly inside (-1, 1)); the matrix is built over the
  inputs that appear in a pair, with unit diagonal and zero elsewhere, and refused unless the engine's `cholesky` succeeds.
  A constant or an unsampled input in a pair is refused. A phone-width pair list was chosen over a full k by k grid.
- No new registry entry, assumption or reference changed, so no docs regeneration was needed.

M10 slice W3 (results charts and panel on the exposure screen, 2026-10-18) implementation choices, none overturning a ruling above:

- `UncertaintyPanel` (apps/web/src/uncertainty) is generic over a model, its base input and a list of scalar outputs as property paths; `risk/RiskUncertainty.tsx` mounts it on the exposure screen for the legacy method (`exposure.rags-a-1989`) with cancer risk and hazard index per receptor. The modern exposure method declares no uncertain inputs, so it is not sampled; the screen says so.
- The pooled run produces the sample outputs; the tornado (2k + 1 runs) and the optional Sobol analysis run on the main thread, which is acceptable for the exposure methods because a run costs microseconds. Sobol N is its own field (default 512).
- Entered units: exposure duration in years (365 days, the exposure convention) and water ingestion in L/day (factor 1e-3 / 86400), converted at the boundary.
- The percentile fan (`FanChart`, `fanBands`) is built and unit tested but not mounted: no exposure output is a time series yet. Open for a screen that has one.
- Results are marked stale with a notice when the scenario inputs change after a run. Charts are inline SVG with the shared theme tokens; when a Sobol interval is flagged not converged the panel reports it with the advice to double N. (Before the E5 centring fix the first order intervals on log10 risk were flagged at every N; that was the estimator, not the sample size. After it, the benzene example with three uniform factors is flagged at N = 512 and clears at N = 2048.)
- Viewport check (review fix, 2026-10-18; the slice had not recorded one): `#/risk` with the benzene example, three receptor factors sampled, Latin hypercube with one rank correlation pair, 300 iterations and Sobol at N = 64 (so the long not-converged and correlated-inputs warnings show), through CDP device emulation at 390x844 (mobile, scale 2) in light and dark and at 1280x900 light: 5 charts and the summary table rendered, overflowing elements 0 in all three, scroll width equal to client width.
- No registry entry, assumption or reference changed, so no docs regeneration was needed.

M10 slice W4 (probabilistic cleanup panel on the cleanup screen, 2026-10-18) implementation choices, none overturning a ruling above:

- `CleanupUncertainty` (apps/web/src/cleanup) mounts under the direct-source results of `#/cleanup`; pure logic is in `cleanup/probabilistic.ts`. For a chosen chemical and medium it builds the legacy exposure scenario with that chemical held at the source concentration C in every switched-on pathway of the medium, and hands the engine's `runProbabilisticCleanup` (E6) a `problem` whose metric is the largest of cancer risk over its target and hazard index over its target (and the summed risk of two additive receptors over its target). The root is therefore the lower of the cancer and noncancer levels, as in the closed-form back-calculation; a test pins the deterministic level to `backCalculateLegacy` within 1e-8 relative for tap water, soil with explicit targets, and two additive receptors.
- Only the legacy receptor factors are sampled (the inputs `exposureLegacy` declares: body weight, exposure duration, water ingestion rate, exposure frequency), with the W3 units. The modern method and modeled sources (dissolved, vadose, saturated) are not sampled: the modern exposure method declares no uncertain inputs, and the transport methods now declare theirs (E7, E8) but no screen builds a transport chain around the cleanup solver. The screen says so.
- Each chemical is solved alone against its full risk and hazard targets (individual allocation) whatever allocation the screen uses; a groundwater concentration target (MCL) is not applied.
- The run is on the main thread, not in the worker pool: a direct-pathway row costs microseconds (two forward runs by the linear shortcut). The W1 budget still applies: the first 5 rows are timed alone, the projection is mean row time times rows (one worker), confirm above 60 s and refuse above 10 minutes with `uncertainty.run-budget`. Cancel exists for the confirm dialog only.
- The protected fraction is entered in percent (default 95) and must lie strictly between 0 and 100; 50 and 90 percent are always shown. Sampling is Latin hypercube with the optional rank correlation of the editor. Charts show the solved levels only; censored iterations are counted and the level is reported as not reachable when its quantile lands on one.
- Viewport check (review fix, 2026-10-18; the slice had not recorded one): `#/cleanup` with the benzene example, body weight, exposure duration and ingestion rate sampled, one rank correlation pair, 300 iterations, through CDP device emulation at 390x844 (mobile, scale 2) in light and dark and at 1280x900 light: the level table and 3 charts rendered, overflowing elements 0 in all three, scroll width equal to client width.
- No registry entry, assumption or reference changed, so no docs regeneration was needed.

## 2026-10-18: M9 plant uptake and ecological screening scope (stage 1)

M9 started with a methods note first, on the parallel track Bryan approved. The note is
`docs/methods/plants-and-eco.md` (scope, equations, validity checks, coupling, Eco-SSL data plan, fixture
plan and slice plan). The note was written before any code; slices D1, R1, E1, E3 and E4 have since landed. M9 does not depend on M7,
which is scoped in parallel. Eco-SSL sources were checked on the EPA site on 2026-10-18. Rulings, each
DEFAULT (open for Bryan to overturn) unless marked forced by a source:

1. **Scope (DEFAULT).** In M9: neutral-organic plant uptake (legacy `plantUptake.trapp-matthies-1995` with
   the `briggs1982` root and transpiration factors; modern method `plantUptake.hhrap-2005` after ruling 11; the `trapp-2015` id was dropped), a `produce` pathway
   into M4 and closed-form into M5, plant and invertebrate hazard quotients against Eco-SSLs, the Eco-SSL
   wildlife food web, a legacy user-entered benchmark screen, and TPH fraction forward risk and total-TPH
   cleanup levels through M5. Deferred: ionizable organics, metals uptake beyond a user BCF, meat and milk,
   time-dependent plants inside the M5 Brent chain, aquatic food webs and fish, shipping the ORNL benchmark
   tables, probabilistic parameters (M10), and soil build-up from irrigation (M7).
2. **Trapp 2015 must be identified before E1 (DEFAULT).** The modern reference is a descriptor only. Slice
   R1 verifies it; if it cannot be verified, the modern method becomes the EPA 2005 HHRAP produce
   equations (`epa2005hhrap`) under a new ruling, never silently.
3. **Pore water from the M2 and M3 partitioning (DEFAULT).** C_pw = C_s rho_b / (theta_w + rho_b K_d), with
   the same chemical record, so a soil gives the same pore water in every milestone.
4. **Irrigation as a plain interface (DEFAULT).** `PlantIrrigationInput { concentration_mg_per_L,
   applicationRate_L_per_m2_per_d, source }` (renamed from `IrrigationInput`, which is the M7 sprinkler
   input), typed in or converted from the M7 `IrrigationSource` since slice E2; used only as an optional
   root-zone water concentration and a foliar interception term. Every user-entered run raises
   `IRRIGATION_USER_ENTERED`.
5. **Produce pathway shape (DEFAULT).** Three produce classes (above-ground exposed, above-ground
   protected, root) with preparation loss and fraction homegrown; legacy and modern presets follow the M4
   split, modern intake rates from `epa2011efh`; risk adds into the M4 totals with the existing additivity
   rules.
6. **Legacy eco screen ships no benchmark table (DEFAULT).** Benchmarks are user entered with a citation;
   `sample1996` is the expected citation until its fields are verified.
7. **No ecological cleanup level (forced by `epaecosslguidance`).** The guidance states Eco-SSLs are
   screening values and inappropriate as cleanup standards; M9 reports hazard quotients only, and
   `ECO_SCREENING_ONLY` is always shown.
8. **Eco-SSL data slice by hand entry with a checksummed manifest (DEFAULT).** No machine-readable table
   exists (checked 2026-10-18), so values are hand entered with document, table and page, cross-checked
   against `pdftotext` extracts of the checksummed PDFs, and generated into
   `packages/data/generated/ecossl-<date>/ecossl.json` with provenance and public-domain status. Decided in
   slice D1 (2026-10-18): the PDFs (about 26 MB) are not committed; the manifest with SHA-256 and byte size is,
   and a script fetches the PDFs and fails on a mismatch. Printed inconsistencies inside a document (seven
   wildlife rows whose inputs do not reproduce their printed value, listed in the methods note) are
   transcribed as printed and flagged, not corrected, and sit outside the 5 percent reproduction check of
   ruling 10; no fixture of the wildlife back-calculation uses one.
9. **TPH fractions map onto the RSL surrogates (DEFAULT).** TPHCWG and MADEP fraction sets map onto the
   five RSL November 2024 TPH records; no new toxicity values are entered; an unmapped fraction is
   reported. The total level is HI_t / sum_j( f_j / CL_j ), each fraction checked against its saturation
   limit.
10. **Fixture tolerances (DEFAULT).** Closed forms 1e-10 relative; ODE against linear solve 1e-8; published
    worked examples at printed precision (1 percent); Eco-SSL wildlife back-calculation 5 percent because
    the published values carry two significant figures. Wider tolerances need a new entry here.

### M9 slice E1 rulings (2026-10-18)

11. **Modern plant model is the HHRAP 2005 fallback (DEFAULT, ruling 2 applied).** Neither candidate for
    Trapp 2015 (Environ. Sci. Pollut. Res. 11(1), 33-39, a 2004 review, or Environ. Sci. Technol. 49(1),
    395-402) could be read: the first is behind a subscription wall and the second was not available. No
    modern equation set was verified, so the modern method is the HHRAP produce equations
    (`epa2005hhrap`, chapter 5 Equations 5-18, 5-20A, 5-20B and appendix A-2 Equations A-2-14 to A-2-20,
    read from the EPA archive PDFs). It registers as `plantUptake.hhrap-2005`, not `plantUptake.trapp-2015`;
    `trapp2015` stays a `planned` descriptor and is not cited.
12. **Unreadable constants are user inputs, not typed from memory (DEFAULT).** The Briggs transpiration
    stream concentration factor regression and the Trapp and Matthies leaf-air partition coefficient
    could not be read from a primary source, so TSCF and K_la are required inputs of the legacy leaf model
    (no default). The Briggs root concentration factor constants are entered as the HHRAP appendix
    prints them for the Briggs correlation (a secondary account of `briggs1982`); `briggs1982` and
    `trappmatthies1995` are marked `used` on that basis, with notes saying what was and was not read.
13. **Dry weight HHRAP outputs (DEFAULT).** The modern method returns dry weight concentrations as HHRAP
    states them; the fresh weight conversion for the produce pathway was done in slice E2 (ruling 18). The soil
    gas-phase vapor term takes a user or M6 vapor air concentration directly (no Fv split) and ignores
    particle deposition.

### M9 slice E3 rulings (2026-10-18)

14. **Ecological screening engine shape (DEFAULT).** `eco.benchmark-hq` (legacy, cites `sample1996`) and
    `eco.ecossl-2005` (modern, cites `epaecossl` and `epaecosslguidance`) register under a new process id
    `eco`. Both report hazard quotients only (ruling 7): the Eco-SSL screen returns `ECO_SCREENING_ONLY` on
    every run and `ECO_NO_SSL` for a group with status NA, NC or procedure; the benchmark screen returns
    `ECO_BENCHMARK_USER_ENTERED`. The wildlife dose is [sum(C_i P_i) + C_s P_s] IR AUF per kg body weight,
    where the surrogate adapter uses a diet fraction of one for the prey term, as the data slice's
    reproduction check does, so the printed derivation inputs reproduce.
15. **No default receptor table (DEFAULT).** The guidance Attachment 4-1 receptor parameters were not read, so
    the engine carries none; callers supply the food web (from `ecossl.json` derivation rows or by hand).
    The three references above move to `used` because registered methods now cite them. `sample1996` is cited
    for its role as the expected user benchmark source; its text was not read and no value from it ships.

### M9 slice E4 rulings (2026-10-18)

16. **TPH fractions are two registered methods over one kernel; no default fraction table (DEFAULT).**
    The registry requires a legacy and a modern method per process, so `tph.tphcwg` (legacy, `tphcwg1997`)
    and `tph.madep` (modern, `madep2002`) register under process `tph` with identical arithmetic. The
    TPHCWG and MADEP carbon-range tables were not read, so none ships: the caller names each fraction and
    its RSL surrogate record id (ruling 9), and a fraction without one is reported as unmapped and excluded.
    The saturation check uses the pure-phase limit (mole fraction 1) per fraction.

### M9 slice E2 rulings (2026-10-18)

17. **The produce pathway is a tenth M4 pathway on the soil medium (DEFAULT).** `produce` is added to
    `PATHWAY_IDS` (ten entries); `DIRECT_PATHWAY_IDS` keeps the nine, and the web risk and cleanup forms
    still list only the direct nine until slice W1 builds the produce inputs. Its EPC is the soil
    concentration and the chemical carries a fresh-weight plant factor per produce class
    (`produceFactors`), so the pathway is linear in C_s and M5 inverts it in closed form with the other
    soil pathways. Intake per class is a rate (kg/d) or a rate per kg body weight (g/kg-d); the preparation
    loss defaults to 0 and the homegrown fraction has no default. A class with an intake and no factor is a
    chemical gap (not quantified), a receptor with no produce intake is a site gap.
18. **Plant factors come from the uptake engines at a unit soil concentration (DEFAULT).** The HHRAP route
    converts dry to fresh weight with a user-entered moisture fraction in [0, 1); no moisture content is
    assumed (the 87 percent HHRAP root value stays inside the root factor conversion only). The factor is
    soil-derived: vapor and irrigation uptake are reported by the uptake engines but are not part of the
    pathway.
19. **EFH presets by age group, sourced from chapter 13 (DEFAULT).** Chapter 13 of `epa2011efh` was read on
    2026-10-18 (PDF SHA-256 2d393f4459cb6fba518aa64ee8ccd92dc4bd6557f2ebf10706200df6dfc3decc, through
    pdftotext). The preset is the consumer-only mean home-produced intake (Tables 13-58 to 13-62) net of the
    Table 13-69 mean net preparation/cooking loss, homegrown fraction 1; exposed fruit and exposed
    vegetables sum into above-ground exposed, protected fruits and vegetables into protected, root
    vegetables are root. Withheld cells (fewer than 20 observations) omit the class and say so. It is not
    attached to any receptor preset (age group to life stage is the caller's call), and no legacy preset
    ships (the RAGS Part A produce exhibit was not read). The post-cooking loss column is not applied.
    Consumer-only means describe consumers, so the preset overstates a population mean.
20. **Irrigation-derived plant concentration stays out of the pathway (DEFAULT, open).** Irrigation water
    as root-zone water replaces the pore water term and the foliar term is a constant source, so neither
    is proportional to the soil concentration; adding them would make the pathway affine and break the
    closed-form inversion. The plant engines accept the interface (`irrigation` on `legacyPlantUptake`,
    `irrigationInputFromSource` for the M7 source) and report the concentration; folding it into M4 and M5
    is deferred. The irrigation season is carried but not applied (`IRRIGATION_SEASON_NOT_APPLIED`).
    Tolerances: hand-computed doses 1e-10, the M5 inversion 1e-9, as ruling 10; no fixture was widened.

## 2026-10-18: M11 projects, reports and polish scope (stage 1)

M11 is built last, after M7, M9 and M10, on the parallel tracks Bryan approved; its plan is written now. The
note is `docs/methods/projects-and-reports.md` (current state, project format, save and share, persisted
feeds, CSV, report and methods statement, responsive and accessibility passes, docs site, bundle targets,
scope and the slice plan). No code is written in this stage. Rulings, each DEFAULT (open for Bryan to
overturn):

1. **Project file (DEFAULT).** One versioned JSON document (`format: "model_flow.project"`, `version: 1`)
   holding each screen's form as typed, the chosen method per screen, the feeds and the data editions. It
   is the single source for save, load, share, autosave and the report.
2. **Feeds stored as values (DEFAULT).** A saved feed keeps its series and a hash of the source form; on
   load a changed source is warned, never silently recomputed.
3. **Validation and migration (DEFAULT).** zod schemas per version in `apps/web/src/project/` (zod is a new
   MIT runtime dependency); pure migrations n to n + 1, each with a fixture test; a newer version than the
   app knows is refused, never half loaded; unknown keys dropped with a warning.
4. **Local file is the durable store (DEFAULT).** Save downloads JSON; open uses a file input. No File
   System Access API, no accounts, no server, no upload.
5. **Share link (DEFAULT).** The project without feed values, deflated with the built-in
   `CompressionStream` and base64url, in the hash as `#/p=`. Links over 8000 characters are not offered;
   the user is told to save a file. lz-string is the fallback only if a target browser lacks the API.
6. **Browser storage as convenience only (DEFAULT).** One debounced, versioned `localStorage` autosave of
   the current project and its feeds, failing quietly to today's behaviour; no named project list. This
   closes the HANDOFF item on persisting feeds across reloads once built.
7. **CSV (DEFAULT).** One CSV per screen plus a time series CSV where the result is a series; RFC 4180,
   UTF-8 without BOM, units in headers, full precision, a method column, and formula-injection prefixes
   defused.
8. **Report (DEFAULT).** A `#/report` HTML screen printed to PDF by the browser, no PDF library. The
   methods statement is generated from the registry for the methods actually run: name, kind, summary,
   assumptions, RISC5 choice, deduplicated citations from `references.json`, warnings and data editions.
   No author or contact line is printed; an optional user-filled "prepared by" field starts empty.
   Built (S6, closed 2026-10-18): the generator, and a report of each used screen's inputs, result tables,
   engine warnings and the statement. The methods are decided from the forms, not from computed results;
   the result tables are each screen's own CSV tables, computed again from the saved forms and stored
   feeds. Charts are not in the report (they stay on the screens), and the report says so; see the
   methods note, section 6. Superseded 2026-10-19 by Wave G slice G2: the report now draws each screen's
   main charts with their data tables.
9. **Mobile check in the repo (DEFAULT).** `scripts/mobile-check.mjs` drives Chrome through CDP at a true
   390x844 viewport, light and dark, every route, overflow count 0. Run locally before each milestone push;
   not in `gate` or CI (needs a real browser).
10. **Accessibility target (DEFAULT).** WCAG 2.2 AA: keyboard order and focus, labels tested per field,
    contrast checked by a token-pair test, and a data table for every chart.
11. **Docs site (DEFAULT).** An in-app `#/docs` reader over the committed methods notes, attributions and a
    user guide, lazy loaded; no second static generator.
12. **Bundle (DEFAULT).** Lazy load every screen, keep generated data and `references.json` out of the
    entry, check engine tree shaking; entry under 200 kB and no chunk over 500 kB, enforced by a
    build-size test on the Vite manifest, with numbers set from the first measurement.
13. **Deferred (DEFAULT).** Named projects in storage, cloud or gist sharing, a PDF library, RISC5 project
    import, comparing two saved projects, offline install, translation, and the mobile check in CI.
14. **Slices.** S1 (feeds onto `createFeed`), S5 (CSV helper), S7 (bundle) and the S9 script start now;
    S2 (format) follows S1; S3, S4 and S6 follow S2; S8 (M7, M9 and M10 screens) is done (see the S8
    block below), S9, S10 and S11 are done (2026-10-18; see the S11 block below).

### M11 accessibility pass, S10 (2026-10-18)

- **Three light-theme chart colours darkened (DEFAULT).** The token-pair test found the categorical
  slots `--b-source`, `--b-volatilized`, `--b-transit` (vadose mass budget) and `--r-2`, `--r-3`, `--r-4`
  (risk bars) under 3:1 against the white surface. They are now `#19a673`, `#c48500` and `#d77298`
  (3.1:1 or better). Dark-theme values already passed and are unchanged. The mass budget and the risk
  bars also have data tables, so colour is never the only channel.
- **Skip link does not navigate (DEFAULT).** The hash is the router, so the link's click handler moves
  focus to `main` (`id="main"`, `tabindex="-1"`) instead of changing the hash.
- **Charts without a separate table (DEFAULT).** The saturated cross-section and the distribution
  editor's cumulative preview keep their numbers in the label, caption or input table instead of a toggle.

### M9 review fixes (2026-10-18)

- **TPH saturation is checked for the mixture (DEFAULT).** The fractions share one separate phase, so the
  Raoult condition is sum_j( f_j C_TPH / Csat_j(x = 1) ) > 1. `checkMixtureSaturation` raises
  `TPH_CSAT_EXCEEDED` on it; the per-fraction check stays but is non-conservative alone.
- **DDT Eco-SSL applies to DDT plus DDE plus DDD combined (DEFAULT).** The mapping note and `ecossl.json`
  say to screen the sum of the three records, not each against the one value.
- **The Eco-SSL screen requires all four receptor groups.** A missing group throws instead of being
  reported as an EPA NA; the earlier test that omitted groups was rewritten to supply all four.
- **PAH group membership** is deferred to a named future slice, not to the E3 slice that is already done.

### M11 review fixes (2026-10-18)

- **A feed never refuses a project (DEFAULT).** `parseProject` validates the screens with the strict
  schema and each feed entry on its own; an unusable or unknown feed is dropped with a warning and listed
  in `droppedFeeds`, and the autosave and opened files still seed every form. The page names the dropped
  feeds in a dismissible note.
- **The four vapor feeds are four entries (DEFAULT).** `vaporVadose`, `vaporWaterTable`, `vaporSaturated`
  and `vaporRisk`, each hashed against its own source form (vadose, transport, saturated, vapor). The old
  single `vapor` key is an unknown feed key: dropped with a warning, no version bump (feeds are
  convenience copies and the format is unreleased).
- **Autosave flushes on pagehide and when the page becomes hidden**, not only after the debounce.
- **The methods statement counts a screen as used when it sent a feed**, and a cleanup chain adds the
  groundwater methods (and the vadose or saturated methods for a soil source) it runs.
- **CSV files are named with app version, data edition and date**, so a saved file ties to a build and
  an RSL, criteria or sediment edition without a metadata row inside the file.
- **Opening a share link replaces the history entry** (`history.replaceState`) and keeps the handled
  payload, so Back does not open it again.
- **`cloneData` and `mergeDefaults` define own properties**, so a `__proto__` key in an untrusted file is a
  plain property, never a prototype.
- No fixture was widened, removed or rewritten for tolerance. Two project tests that expected a bad feed
  to refuse the whole file were rewritten to expect the feed dropped and the forms kept.

## 2026-10-18: M11 slice S8, project keys, CSV and report sections for the household, plants and uncertainty screens

Rulings (DEFAULT unless noted), built on the wave branch. Method note: `docs/methods/projects-and-reports.md`
(sections 2, 5, 6 and 12).

1. **Three new screen keys, no version bump.** `household`, `plantsEco` and `uncertainty` join the
   version 1 `screens` object. Every field is optional on load and takes the screen default, so a file
   written before S8 loads unchanged; the migration table stays empty.
2. **The uncertainty setup is project state, results are not.** The `uncertainty` key holds, per panel
   (`risk`, `cleanup`), the distribution editor rows as typed, the correlation pairs and the run settings.
   A run is reproducible from the setup and the seed, so no sample or result is stored (the file would
   grow by the iteration count for nothing). The panel writes its setup to the project store on every
   change and reads it back on mount.
3. **Two new feed entries.** `household` (the received air concentrations and coefficients, fingerprinted
   against the household form) and `produce` (plant factors and intake, against the plants form). They
   follow the existing rule: a feed that cannot be used is dropped with a warning, never refusing the
   file, and a feed whose source form changed is flagged stale, never recomputed.
4. **CSV tables per screen.** Household: one long table. Plants and ecology: plant factors, ecological
   screening (Eco-SSL rows and user benchmark rows together, with a status column so an Eco-SSL NA or NC is
   kept and not dropped) and TPH. Uncertainty: summary, sample and sensitivity tables for the exposure
   panel, levels, sample and sensitivity for the cleanup panel. The sample tables hold every iteration at
   full precision. A table with no rows is not offered. The household file name carries no data edition
   (no dataset is read); the plants, TPH and uncertainty files carry the RSL edition.
5. **Report sections.** The report lists the three screens like the others (inputs as typed, methods
   run) and decides the methods from the forms: the household screen runs its seven methods side by side;
   the plants screen runs both plant uptake methods and the Eco-SSL screen, plus the benchmark method when
   a benchmark row exists and the chosen TPH set when a total or a fraction is entered; the uncertainty
   section names the sampling method of each panel whose setup differs from the defaults and the Sobol
   method when it is switched on. (The result tables and engine warnings per screen that were open here
   landed with S6c; see ruling 8.)
6. **Not verified here.** No data value or constant was typed. The units written in the new CSV headers
   are the units the screens display today, read from the screens, not from a source.

### M11 docs reader and user guide, S11 (2026-10-18)

1. **`#/docs` reader (as ruled in 11).** `apps/web/src/docs/`: `markdown.ts` reads the Markdown subset the
   committed notes use (headings, paragraphs, nested lists, fenced code, tables, block quotes, rules,
   inline code, bold, italic, links) into a plain tree, and `DocsPage.tsx` renders it as React elements, so
   no HTML string is injected. `catalog.ts` imports `docs/USER_GUIDE.md`, `docs/ATTRIBUTIONS.md` and every
   `docs/methods/*.md` as raw text, one lazy chunk each. A test parses every committed document and fails
   if a table, fence, heading or list mark is left in a paragraph. Routes: `#/docs` is the index,
   `#/docs/<slug>` a document; the slug is the file name, with `user-guide` and `attributions` for the two
   top-level files.
2. **Only the guide, the attributions and the methods notes are offered (DEFAULT).** DECISIONS, ROADMAP,
   HANDOFF and the third-party licences stay repository documents; offering them would add large chunks
   for text that is about the project's working state, not its use.
3. **Links in a document.** A web address opens in a new tab with `noopener`; a link to another offered
   Markdown file becomes a reader link; any other target (including a `javascript:` address) renders as
   plain text.
4. **Narrow screens.** Document tables stack to one block per row below 640 px, each cell labelled by its
   column header, so no table scrolls sideways. The mobile check script now also visits four document
   pages (the guide, a table-heavy note, a long note and the attributions).
5. **User guide.** `docs/USER_GUIDE.md` covers navigation, legacy versus modern, saving, opening and
   sharing (including the 8000 character limit and what a link leaves out), every screen, the uncertainty
   panels, the report, CSV download and where to report a problem (the repository issue tracker, no
   personal address). A test requires a heading for every screen route.
6. **Not verified here.** No data value or constant was typed. The one-line summaries on the index are
   descriptions of each note's subject, written from the file names and headings.

## 2026-10-19: Wave G slice G4, surface water performance

Measured with a profile (`node --cpu-prof`), call counts and per-call timings of the bank plane integral,
24 sample times, the AT123D bank plane of the default 5 year transport run, discharge thickness 3 m.

1. **Root cause.** Not repeated solves per time step, not the screen average and not the quadrature
   resolution. About 90 percent of a 2000 m linked run was the time integral of the AT123D kernel
   (`at123dConcentration`, tanh-sinh at 1e-8 relative, absolute tolerance 0) evaluated at plane points far out
   in the plume tail. The plane range is narrowed to where the field is above 1e-12 of its largest probe, so
   on a 2000 m reach the lateral quadrature visits points 100 to 1000 m out where the value is many orders of
   magnitude below the peak; with no absolute floor each of those 22,000 calls refined to the deepest level
   (6.3 ms per call, against 0.16 ms for the central points). The rest of the cost was the three axis profiles
   being recomputed for every point although, at one time and one bank x, they depend only on the release age.
2. **Fix 1, tail tolerance (DEFAULT 1e-9).** `at123dConcentration` takes an optional absolute tolerance
   (`absTol`, default 0, so every other caller is unchanged) and `at123dBankPlane` an optional
   `tailTolerance`: the absolute tolerance of a plane point as a share of the centreline surface
   concentration at the same time. The web calculation sets `BANK_TAIL_TOLERANCE = 1e-9`. A point is
   therefore only converged to 1e-9 of the peak, which the plane quadrature (1e-3) cannot see. Measured
   against the unchanged code on the 2000 m run, the largest relative difference over every result series
   is 2.1e-11. The value 1e-9 was chosen as 1e-6 of the plane tolerance and is not tuned.
3. **Fix 2, remembered axis factors (identical numbers).** `createAt123dMemo` and the `memo` option of
   `at123dConcentration` keep the x, y and depth profiles by release age for one time and one aquifer and
   source, so a plane's points reuse them. The operations and their order are those of the plain path, and a
   test requires exact (`toBe`) agreement over a sweep of points and two times. Used by `at123dBankPlane`
   only; it is valid for one aquifer and source.
4. **Tolerances.** No fixture tolerance was widened, no test input was shrunk and no test was skipped. The
   `timeout` values in `apps/web/src/surfaceWater/compute.test.ts` were lowered to 30 s (from 60 to 180 s) so
   a return of the slowness fails the test. The existing 1 percent check of the fast plane quadrature against
   the tight integral is unchanged and passes. The 40 m run is bit-identical to before (the tail tolerance
   never engages there); the 2000 m run differs by at most 2.1e-11 relative.
5. **Responsiveness.** The run already executes in a Web Worker (`compute.worker.ts`, a newer request
   terminates the old one), so the interface was never blocked; only the wait shrank. No change there.
6. **Measured, same harness before and after** (a script calling `compute()` with the default transport
   scenario at 5 years, linked, bank 50 m, thickness 3 m, in Node; the 81 s in the handoff is a browser
   figure, not comparable): 2000 m reach 178 s before, 2.0 s after; 40 m reach 22 s before, 1.9 s after.
   Vitest wall time per file, before and after: `compute.test.ts` 205 s to 11.7 s,
   `SurfaceWaterScreen.test.tsx` 22.8 s to 5.7 s; `criteriaDb`, `csv`, `feed` and `inputs` test files are
   under 20 ms each and unchanged.
7. **Not verified here.** The browser time of a linked run was not re-measured (no browser was launched);
   the figures above are Node. Browser time should be re-measured before the handoff's "slow run" note is
   dropped.

## 2026-10-19: Wave G slice G1, produce and total TPH levels on the cleanup screen

1. **Produce inputs come through the existing feed from `#/plants-eco` (DEFAULT).** The cleanup screen reads
   the same `ProduceRiskFeed` the risk screen reads, and reuses the existing per-chemical switch
   (`produceFromPlantsEco`) and per-receptor switch (`produce`). Evidence: the risk screen already follows
   this pattern, the plant factors need the soil and plant inputs (TSCF, leaf-air partition coefficient,
   Kd, moisture) that live on `#/plants-eco`, and entering them a second time on the cleanup screen would
   let two screens hold two answers for one chemical. Cleanup-screen entry of plant inputs is not added.
2. **Produce is part of the soil level, not a separate column (DEFAULT).** The produce pathway is a soil
   pathway in the engine (closed form, coefficients add), so with both switches on the soil cleanup level
   includes it and the existing "each pathway alone" table and CSV show the produce-only level. Test:
   1/L(with produce) = 1/L(without) + 1/L(produce alone) at 1e-9. A chemical that opts in with no held feed
   for it is an input error; a receptor that switches it on with no opting chemical gets a skip note. Old
   projects load unchanged (both switches already exist in the saved risk and receptor schemas, default off).
3. **Produce applies to direct sources only (DEFAULT).** Modeled sources (groundwater, vadose, saturated)
   ignore the switches; the modeled chains were not extended. The probabilistic panel holds the produce
   pathway at its point values (test: its deterministic level equals the closed form).
4. **Unverified inputs keep their warnings.** The produce feed now carries the plant engine's warnings
   (`warnings`, optional so earlier saved feeds still load); the cleanup warnings list shows them under the
   origin "Plant uptake" and the report carries them with the same codes. The feed's method id
   (`plantUptake.hhrap-2005` for the HHRAP fallback of Trapp 2015, `plantUptake.trapp-matthies-1995` for
   legacy) names which engine produced the factors, and TSCF and the leaf-air partition coefficient remain
   required user inputs on `#/plants-eco` (M9 ruling 12); nothing was defaulted here.
5. **Total TPH level through a new `tph` feed (DEFAULT).** The composition editor, fraction levels and
   saturation check live on `#/plants-eco`, so that screen gains "Send total level to cleanup" and the
   cleanup screen shows a "Total TPH level" panel (method id `tph.tphcwg` or `tph.madep`, the target
   hazard index, the total in mg/kg, the fraction table, the engine warnings). The cleanup screen does not
   recompute it. The feed key `tph` was added to the project file's optional feeds (still format version 1:
   a project without it loads as before, and it goes stale with the plants screen form like the produce
   feed). The modeled-chain `impliedTph` and `tphHeld` are a different feature and are unchanged.
6. **Exports.** `cleanup-tph` CSV table (total first, then one row per fraction); the pathway CSV already
   carries produce. The `#/report` cleanup section adds the TPH table and both warning sets from the saved
   feeds. When the cleanup form has no chemical but a TPH feed is held, the section shows the TPH table
   with the note that the chemical levels were not computed.
7. **Phone check of the fed screen (DEFAULT).** The held feeds are in memory only, so `scripts/mobile-check.mjs`
   visits `#/cleanup` a second time as a fed route: it opens `#/plants-eco`, picks lead, sends the produce
   factors and the TPH total, changes the hash without a reload, adds lead on the cleanup screen and ticks
   the produce switch. At 390x844 light and dark and at 1280x900 the "Total TPH level" panel and the produce
   switch are on screen with 0 overflowing elements and 0 axe violations; the run fails if either is
   missing. The seeded press step no longer clicks "Start from the five RSL surrogates" or "Add a fraction",
   which would overwrite the seeded fractions.
8. **Not done.** No cancer endpoint for TPH fractions (the fraction levels are hazard quotient levels
   entered by the user); no TPH level inside a modeled source's soil chain beyond the existing implied TPH.

## 2026-10-19: Wave G slice G2, report charts and uncertainty results

1. **Uncertainty results reach the report through an explicit "Include uncertainty results" control
   that repeats the run from the saved setup and seed (DEFAULT).** Off until ticked; once on, it shows
   progress, can be cancelled and asks before a run projected over 60 s, as the screens do. Evidence for
   the choice: (a) a project saves a setup and seed, never a run (M11 ruling), and the runs are seeded and
   independent of pool size and chunk order (`pool.test.ts`, and `uncertaintyReport.test.ts` runs the same
   plan on 1 and 2 workers and compares every value), so a re-run is the same numbers the screen showed,
   and an in-session result adds nothing a re-run does not; (b) an in-session result lives in the panel
   component's state and is gone once the reader navigates to the report, so using it would need a new
   module store and would show a stale run after an input changed; (c) running on every report build
   would cost up to the run budget each time the page opens, against "keep report generation responsive";
   (d) the control keeps the cost with the reader. Rejected: always re-running on open, and including the
   in-session result.
2. **Never on the main thread for the exposure panel.** The sample goes through the existing worker pool
   (pilot timing, run budget, progress, cancel). The one-at-a-time and Sobol runs and the probabilistic
   cleanup solve are synchronous, exactly as on their screens, and are bounded by the same budget check;
   the cleanup solve is not cancellable once started (DEFAULT, a worker protocol for the cleanup solver is
   a separate change). Because those runs block the page, the control's copy and the user guide say so
   (the page may stop responding, only the exposure sample can be cancelled) rather than claiming the
   report stays usable; the review finding on this was resolved by correcting the claim, not by moving the
   solve to a worker (DEFAULT, Bryan's to overturn). The report builds the cleanup inputs with the held
   produce feed, exactly as the screen does.
3. **One run implementation for the screens and the report.** `uncertainty/headless.ts` holds the run of
   the exposure panel and of the cleanup panel with no component state; `UncertaintyPanel` and
   `CleanupUncertainty` now call it, so the report cannot drift from the screens. Behaviour of both panels
   is unchanged (their tests pass untouched).
4. **Charts reuse the screens' components, each with its data table open (DEFAULT).** `ChartItem`
   (`report/chartItems.ts`) holds the data a screen's chart takes; `results.ts` fills it from the compute
   result the tables come from. In the report every chart's table is open with no toggle, through the
   `TablesAlwaysOpen` context read by the shared data table, the breakthrough chart's own table and the
   exposure bars' details. Included: groundwater breakthrough, vadose depth profile, water table and
   depletion, saturated release rate and remaining mass, surface water and sediment, vapor profile and the
   exposure bars. Left out (DEFAULT): the plume map (a map with a long table of its own) and the modeled
   cleanup chart (a modeled cleanup source is not computed in the report, see S6c).
5. **Print styling (DEFAULT).** In print the chart palette tokens are pinned to grey shades, svg is drawn
   with a grayscale filter, pointer readouts and table buttons are hidden, and charts, tables and
   uncertainty figures avoid page breaks. Series stay apart by shade plus the screens' markers and dashes;
   the data table is the fallback. Dark theme prints as light (the print block already pins the surface
   tokens).
6. **Shown for uncertainty:** percentile summary, CDF, histogram, tornado, Spearman and (when switched on)
   Sobol indices with their N, the seed, the iteration count and sampling kind, warnings, and for the
   cleanup panel the protective level table, CDF, histogram and Spearman. A panel with no sampled input, an
   invalid setup or an uncomputable screen is skipped with a sentence. Results are not saved in the project.
7. **Not verified here.** No data value or constant was typed. Viewport check run through CDP at 390x844
   (light, dark) and 1280x900 with both panels run on the real worker pool: overflowing elements 0. The
   print check was a screenshot under print media emulation of the breakthrough chart and table (grey, legible),
   not a printed page.

## 2026-10-19: Wave G slice G3, accessibility pass

1. **axe-core runs in the mobile check (DEFAULT).** `scripts/mobile-check.mjs` injects axe-core into every
   route at 390x844 light, 390x844 dark and 1280x900, after the compute buttons are pressed so result
   tables and charts are on screen. Any serious or critical violation fails the run; moderate and minor
   ones are printed but do not fail it. `--no-axe` skips the pass and `--axe-json <file>` writes every
   violation. axe-core 4.14.0 (MPL-2.0) is a root dev dependency only; it is not imported by any app
   code and not bundled. The generated third-party licence document lists production dependencies only,
   so it is unchanged.
2. **Before and after.** Before: 4 routes failed in all three views (12 route-view failures, 12 nodes),
   all one rule: `color-contrast` (serious) on the `.status` compute line of `#/transport`, `#/vadose`,
   `#/saturated` and `#/surface-water`. The other 13 routes had 0. After: 0 violations of any impact on
   all 17 routes in all three views.
3. **Fix (DEFAULT).** The idle status line faded its text with `opacity: 0.6`, which pushed the muted
   token below 4.5:1. The fade is removed; the active state is shown with the full text token and a
   heavier weight instead. A test reads the rule so opacity cannot return.
3a. **Late finding on `#/report` (DEFAULT).** The wave's final mobile check found one serious
   `scrollable-region-focusable` violation (3 nodes) on `#/report`: the opened chart data tables scroll
   but were not keyboard reachable. The three `table-scroll` containers (vadose `DataTable`, transport
   breakthrough chart, cleanup modeled chart) are now focusable regions with a label.
4. **Moderate and minor violations.** None were reported, so there is nothing to defer.
5. **Keyboard-order tests (DEFAULT).** `apps/web/src/a11y/screenKeyboard.test.tsx` renders all 17
   routes and checks: no positive tabindex, no native control with `tabindex="-1"`, the skip link is the
   first tab stop and navigation precedes main, nothing outside main sits between main's first and last
   stop, the skip link moves focus to main without changing the hash, and main's tab order equals its
   document order. Visual order is guarded by a stylesheet scan for CSS `order` and `*-reverse`
   (none exist). Disclosure buttons keep focus and flip `aria-expanded`; every `details` summary on
   `#/transport` is a tab stop (the test fails if it finds none; it first ran on `#/risk`, which draws no
   `details` until results exist, and asserted nothing). The only dialogs are the three "Long run"
   confirmations, drawn by the shared `ui/AlertDialog.tsx` (DEFAULT): focus moves to its Cancel button
   when it opens, Escape cancels, and focus returns to the triggering control when it closes (waiting
   for the control to be enabled again, since it is disabled while the run winds down). A test fails if
   any other file draws a `dialog`, `alertdialog` or `aria-modal` element, so a new one needs its own
   focus tests.
6. **Not verified here.** axe-core does not judge screen reader output or cognitive load, and jsdom does
   not apply CSS, so tab order is tested from the DOM; the real-browser pass covers rendering only.
   The chart SVGs that take `tabindex="0"` were not walked with arrow keys in this slice.

## 2026-10-19: Wave H UI near-parity scope (Bryan)

Plan of record: `docs/UI_PARITY.md` (gap table and slices U1 to U10), built on the paraphrased feature map
`docs/RISC5_UI_INVENTORY.md`. Bryan's answers to the three open calls and the scope question:

1. **Database edits are per project only** (Bryan: "Per-project only"). Toxicity values, exposure factors and
   receptor names can be overridden inside one project; no reusable library carries across projects.
2. **Multi-chemical fate runs are deferred** (Bryan: "Defer (Recommended)"). The fate screens stay one chemical
   at a time with a fill-from-database control; running many chemicals through transport at once waits for a
   design session.
3. **The site model screen is advisory** (Bryan: "Advisory (as planned)"). `#/site` builds a checklist of the
   screens to visit; no step is locked.
4. **Scope: all ten slices**, U1 to U10, including the optional decimal comma entry (U10).


## 2026-10-19: Wave H slice U8, fill chemical properties from the database

1. **Shared helper (DEFAULT).** `ui/chemicalFill.ts` (`fateFill`, `useChemicalRows`) and
   `ui/ChemicalPicker.tsx` reuse the vapor chemical file and its loader. A property the record lacks is
   left as typed rather than blanked, so a fill never removes a value.
2. **Vadose and saturated (DEFAULT).** The select fills molar mass, solubility, Henry constant, Koc and
   (vadose only) both diffusivities. Decay stays a user input and the note says so. Each form gains an
   optional `chemicalId` key, inside project format version 1.
3. **Groundwater transport (DEFAULT).** The screen has no chemical properties, only Kd, so the select sets
   Kd to the database Koc times a new optional organic carbon fraction field (`foc`, default 0.001) and
   switches retardation to "From Kd". Editing the fraction while a chemical is chosen recomputes Kd. The
   half-life stays a user input. New optional keys `chemicalId` and `foc`, inside format version 1.
   Feed fingerprints leave these keys out (DEFAULT, wave H fix): `chemicalId` always (it only records where
   Kd or the properties were filled from, and the filled values are fingerprinted), `foc` while it equals
   0.001. See `FINGERPRINT_SKIP` in `project/hash.ts`; a project saved before this wave opens with no feed
   flagged stale. Every later form key must be added to that table.
   A record without a Koc (74-90-8 hydrogen cyanide, 7439-97-6 mercury) leaves the retardation mode and
   values unchanged and shows a note naming the chemical (DEFAULT, a fix to the first draft that switched to
   "From Kd" with no database value behind it).
4. **Not changed.** Surface water is excluded until G4; no feed changes meaning; choosing "Entered by hand"
   keeps the current values.

## 2026-10-19: Wave H slice U1, working step bar

1. **Single definition of step targets (DEFAULT).** `apps/web/src/steps.ts` holds the six steps, each with
   one `href` and the list of route hashes it owns. U3 retargets Chemicals to `#/chemicals` and U2
   retargets Site model to `#/site` by changing that one line (and adding the route to `owns`).
2. **Targets until then (per the plan).** Chemicals to `#/risk`, Site model to `#/transport`, Transport to
   `#/transport`, Receptors to `#/risk`, Risk and cleanup to `#/cleanup`, Results to `#/report`. Steps
   that share a target do not both light up: `aria-current` goes only to the step that owns the route, so
   Chemicals and Site model show no current mark until their own routes exist.
3. **Route ownership (DEFAULT).** The fate screens (`#/transport`, `#/vadose`, `#/saturated`, `#/vapor`,
   `#/surface-water`) belong to Transport as the plan says. The plan did not place `#/household` and
   `#/plants-eco`; both are fate and exposure-medium screens, so they are Transport too. Home, Methods
   and Documentation own no step. A test asserts every screen route has exactly one owner.
4. **Presentation.** The disabled buttons are gone; every step is a link styled as before, with the
   current step drawn with an accent border and heavier weight (not colour alone). No new route, so the
   mobile check route list and keyboard-order tests needed no change.
5. **Home page.** The lede no longer says other steps are placeholders, and an "Open the report" button
   is added.

## 2026-10-19: Wave H slice U3, chemical database browser

Read-only `#/chemicals` (features C1, C4, C5, D5, J1, J2, J4, J7); edits per project come in U4.

1. **Route and navigation (DEFAULT).** The screen is reached from a "Chemical database" link in the nav
   links and a button on the landing page. The numbered step bar is untouched because U1 is changing it;
   retargeting the Chemicals step is one line in `apps/web/src/App.tsx` (point it at `CHEMICALS_HASH`).
2. **Data loading (DEFAULT).** The full property file (`chemicals.json`, 1,218,894 bytes pretty-printed in the repo, 633,152 bytes as shipped because a build plugin in `vite.config.ts` minifies emitted JSON assets; the committed data is untouched) is over
   the 500 kB chunk limit as a script chunk, so it is imported as an asset URL and fetched on first
   visit; the toxicity file is the chunk the risk screen already uses. The limit is not widened, and `bundleSize.test.ts` caps built JSON assets at 700 kB. The
   cost is that the screen needs the network the first time it opens. Tests serve the same file from
   disk through a fetch stub in `test-setup.ts`.
3. **Layout (DEFAULT).** A searchable list of 25 chemicals at a time ("Show more"), each an expandable
   card holding a captioned table (Property, Value, Unit, Source) in a keyboard-reachable scroll region.
   Search is a case-blind substring match on name or CAS number.
4. **Values shown (DEFAULT).** Numbers appear at full stored precision so what is on screen equals the
   data file. A property with no reference column says "not stated". Values the tables give without a
   per-value reference (fraction absorbed in water, volatile and mutagen flags, absorption fractions,
   soil saturation, MCL) carry the source "RSL table (no per-value reference)". Published soil screening
   levels are left out: they are comparison values, not inputs.
5. **J7 gap.** The generated data has no carcinogen weight-of-evidence class, so none is shown and none
   is invented. Adding one needs a data build change and a source.
6. **CSV (DEFAULT).** One row per value (Chemical, CAS, Group, Property, Value, Unit, Source). The edition
   and date are in the file name like the other CSVs. When a search is active a second button saves only
   the matching chemicals.
7. **Schema.** No new saved state; the project file is unchanged.

## 2026-10-19: Wave H slice U9, wildlife dose panel

Scope: the site-specific wildlife hazard quotient panel on `#/plants-eco` (inventory C9), built on the engine's
`wildlifeDose`, `wildlifeHazardQuotient` and `backCalculateEcoSsl`. No engine or data change.

1. **Rows come from the generated Eco-SSL derivation rows (DEFAULT).** "Load the surrogates from the Eco-SSL
   document" copies each surrogate's printed inputs, with its table and page, into editable form rows. The two
   rows the documents print NA (nickel, no uptake model) are left out. The load replaces the saved rows; there
   is no automatic reload on a chemical change, so edits are never overwritten silently.
2. **One food item per row, area use factor added (DEFAULT).** A row is the single-item diet the Eco-SSL
   derivation uses (diet fraction 1). The area use factor defaults to 1, which reproduces the Eco-SSL; the
   panel states that. Users can add rows of their own with no source.
3. **Reproduction uses the existing tolerance (DEFAULT).** A test back-calculates every prefilled lead and
   cadmium row and requires 5 percent of the printed value, the same tolerance as the engine reproduction
   test. No tolerance was widened. Rows the data flags as not reproduced are shown with their printed value
   beside the back-calculated one rather than hidden.
4. **Screening only (DEFAULT).** The panel carries the `ECO_SCREENING_ONLY` warning and offers no cleanup
   level; the soil level at a hazard quotient of one is labelled a screening back-calculation.
5. **Saved state.** An optional `wildlifeRows` key inside the existing `plantsEco` form, format version 1,
   left out of the feed fingerprints (DEFAULT, wave H fix: the produce and TPH feeds do not read it),
   with a round-trip case in `project/screens.test.ts`. CSV table `wildlife-dose` is added to the screen's
   downloads. No new route, so the mobile check route list and keyboard-order tests are unchanged.


## 2026-10-19: Wave H slice U7, soil texture presets on vadose and saturated

Scope: a texture select on each vadose layer and on the saturated soil group (inventory C8, F4), filled from the
engine's `SOIL_TEXTURES` as the vapor screen does. No engine or data change.

1. **Field mapping confirmed against the vadose definitions.** Porosity is `thetaS`, residual moisture is
   `thetaR`, N is the van Genuchten `n`, saturated conductivity (m/s in the table) is `Ks` shown in m/d, and bulk
   density (kg/m3 in the table) is `rhoB` shown in g/cm3. The vadose checks (`thetaR` in [0, `thetaS`), `n` above 1,
   `Ks` positive) hold for all twelve classes, so no mapping stopped the slice.
2. **Kept as the site's own (DEFAULT).** Thickness and organic carbon on vadose layers; organic carbon and the
   aquifer conductivity on saturated (the table is a soil texture, not an aquifer). The saturated screen takes no
   `Ks`, so it fills four values, not five.
3. **Values shown to six significant figures (DEFAULT)** so the unit conversion does not leave float noise in the field.
4. **Selection stays after an edit (DEFAULT).** As on the vapor screen, editing a filled value keeps the preset name
   chosen; Custom values only stops filling. There is no automatic refill.
5. **Schema.** An optional `texture` key on each vadose layer and on the saturated form, format version 1, with
   round-trip cases in `project/screens.test.ts`. A file without the key loads as Custom values. The Table R-7 case
   and hand case A stay Custom, so both validation cases still load unchanged. No new route. The `texture` key is left out of the feed fingerprints (DEFAULT, wave H fix) because the values it filled are fingerprinted themselves, so an older file's feeds are not flagged stale.

## 2026-10-19: Wave H slice U4, project toxicity overrides

Features D3, D4, G9 and J8 (per project only, as Bryan ruled: no edits to the master database).

1. **One project-level key (DEFAULT shape).** `overrides` is a new optional top-level key inside format
   version 1, beside `screens`, `feeds` and `data`. It is absent when empty, so a project with no edits is
   byte-for-byte as before. Its `toxicity` set maps a chemical id to a field (`sfo`, `iur`, `rfdo`,
   `rfci`) to `{ value, note }`, with the value kept as typed text. A round trip test sits in
   `project/store.test.ts` and `overrides/overrides.test.ts`; no version bump.
2. **Applied to the database, not to each builder (DEFAULT).** `applyToxOverrides(db, state)` lays the
   usable edits over the loaded chemical database and returns a database whose records carry the user
   value (source key `user`) and the unedited entry in `dbTox`. The risk and cleanup pages, the cleanup
   groundwater and modeled builders, the report results and the uncertainty report all build from that
   database, so `buildInputs` and `buildCleanup` needed no change and every screen shows one value. The
   master data and the engine are untouched.
3. **Usable means number above zero and a non-blank note (DEFAULT).** An incomplete edit stays in the project and in
   the report (marked "not used") but does not change a result. A zero value is refused because a zero
   slope factor or reference dose is not a toxicity value the engine accepts.
4. **Fields offered (DEFAULT).** The four toxicity values the pathways read. Absorption fractions, the
   MCL and soil saturation are not offered; the inventory asks for the toxicity values the chosen
   pathways use. A value the database lacks can be supplied.
5. **Marking.** An edited field shows the word "Edited" and a tint (never colour alone) in the panel and in
   the card table, whose source column reads "User value (this project)". J8 is a note in the panel: the
   database is chronic, enter the short-term reference dose and say so.
6. **Report.** A "Values supplied by the user" section lists chemical, value, database value, value used
   and note. Results in the report and the uncertainty runs use the overridden point values.
7. **Feed staleness.** No feed is built from a toxicity value (feeds fingerprint their source screen
   form), so an override cannot make a feed stale; a test confirms a changed source form still flags its
   feed in a project that holds overrides.
8. **Reuse by U5.** The mechanism is general: `overrides/model.ts` holds `FieldOverrides` (subject to field
   to `{ value, note }`) with `setField` and `resetField`; U5 adds a sibling set (for example `receptors`,
   keyed by receptor tag) to `OverridesState`, `overrides/project.ts` and a function that lays it over the
   presets, and reuses `usableValue`, `entryProblem`, `useOverrides` and the panel's Edited and reset
   pattern. The store, autosave, file and report plumbing already carry the whole `overrides` object.
9. **No new route.** The mobile check route list and keyboard-order tests are unchanged; the panel is a
   disclosure inside an existing card.


## 2026-10-19: Wave H slice U5, editable exposure factors and receptor names

Features G5, G7 and G8 (per project only, as Bryan ruled: the presets are not edited, a project overrides them).

1. **Where the edits live (DEFAULT shape).** `OverridesState` gains `receptors` (the U4 `FieldOverrides` shape: subject
   to field to `{ value, note }`) and `receptorNames` (subject to name), saved as optional keys inside the
   existing `overrides` key of format version 1, absent when empty. No version bump. Round trip cases sit in
   `overrides/receptors.test.ts`. The subject is `<screen>.<a|b>` (`risk.a`, `cleanup.b`), so the exposure and
   cleanup screens keep separate receptors, matching how each screen already has its own receptor forms.
2. **No source note for a factor (DEFAULT).** Unlike a toxicity value, which replaces a published number, a
   receptor factor describes the site's own receptor. The `note` field is kept empty; the edit is marked
   "Edited", reset per field, and listed in the report. A non-numeric or negative entry is an error naming the
   receptor and factor; a value the engine refuses (a zero body weight) is reported as that receptor's error.
3. **Which factors are editable (DEFAULT).** Legacy: body weight, exposure duration, exposure frequency, soil
   ingestion rate, swimming water ingestion (the preset boundary fields not already on the form). Modern: body
   weight, exposure frequency and soil ingestion rate, per life-stage group (child, adult, worker). Both: the
   cancer averaging time (lifetime). The existing "Site-specific factors" entries (skin areas, adherence, water,
   breathing rate, times) were already editable and stay where they are. Modern exposure duration is not editable
   because the stages and a mutagen's age segments must keep adding up to the same period. An edit to a stage
   group applies to the mutagen segments of that group too.
4. **Applied by laying edits on the form, not by threading a parameter (DEFAULT).** `withReceptorEdits` returns
   the form with a runtime-only `edits` on each receptor (never saved in the screen form); the existing builders
   read it in `parseEdits`, `legacyBoundary` and `modernBoundary`. The pages, the report results and the
   uncertainty report each call it once, so the cleanup SSG, modeled and tap-water builds see the edits without
   signature changes. Uncertainty sampling reads the built legacy receptor, so it centres on the edited value.
5. **Names.** A name replaces the default tag ("Receptor A") in the result labels, errors, notes, CSV and report;
   the preset in brackets stays after it. Limited to 60 characters; blank returns to the default.
6. **Preset switch (DEFAULT).** Switching the preset of a receptor with edited factors opens an `AlertDialog`:
   "Switch and reset edits" clears that receptor's factor edits (the name is kept), "Keep <preset>" cancels. With no
   edits the switch is immediate. The factor keys are per preset family, so keeping stale edits across presets was
   judged more confusing than asking.
7. **Report.** A "Receptor factors supplied by the user" section lists receptor, factor, preset value and value used.
8. **Mobile check.** One seeded route (`#/risk` with benzene, the Edit values disclosure and the receptor
   exposure factor panel open and edited) is added to `scripts/mobile-check.mjs`. No new route, so the
   keyboard-order tests are unchanged.

## 2026-10-19: Wave H slice U2, site model screen

Features E1 to E8. Advisory only, nothing locked (Bryan): the screen changes no other screen and no result.

1. **Saved as a top-level optional `site` key (DEFAULT shape).** Inside format version 1, beside `overrides`, not
   under `screens`: it holds no form for a calculation, so it takes no part in feeds or staleness. It is absent at
   the defaults, so a project that never opened the screen is byte-for-byte as before. Round trips are tested in
   `project/store.test.ts`; no version bump.
2. **Choices that can be wrong are representable (DEFAULT).** Source media and the two produce sources are
   tick boxes, so a two-medium or soil-plus-irrigation choice can be made and is explained on the page instead of
   being made impossible. A problem hides the checklist; it does not alter the saved choices.
3. **Five direct media, four modeled sources (DEFAULT).** Direct: soil, groundwater, surface water, indoor air,
   outdoor air (bathroom air stays on the household screen). Modeled: soil, groundwater, soil to indoor air, soil gas
   to indoor air. Soil gas is named the better basis when both vapor sources are ticked (E6).
4. **Vapor method is the app's two methods (DEFAULT).** Legacy Johnson and Ettinger or modern EPA, not RISC5's three
   models; the choice only words the vapor step.
5. **Produce must match its medium for humans (DEFAULT).** Produce from soil needs soil as the source, from irrigation
   water needs groundwater. Both together is refused (E7). Produce is a note, not a problem, for ecological receptors.
6. **Ecological path is soil only (DEFAULT, revised after review).** The ecological screen on Plants, ecology and
   TPH takes one input, "Soil concentration (mg/kg dry weight)", and reads no feed, and no screen compares a
   groundwater, surface water or air concentration with ecological benchmarks. So ecological receptors are served
   for a soil source only (direct or modeled): the checklist is Chemical database, Plants, ecology and TPH
   (enter the soil concentration), then the report, with no fate, risk or cleanup step. A modeled soil source adds a
   note that the screen does not read the vadose or transport results. Any other medium is a problem
   (`eco-medium-unsupported`) that says plainly it is not supported, instead of a step that names a missing control.
   Answer to the author's question (DEFAULT, chosen without Bryan): the flow of fate screens, then plants and
   ecology, then report, with no risk or cleanup step, is right in its ending, because ecological hazard quotients
   have no cleanup-level screen here. What was wrong is the fate-to-ecology link, which does not exist, so the fate
   screens are not listed for ecological receptors. Produce is a note, not a problem, for ecological receptors. A
   test reads each named screen's source to guard every feed label and the soil field name.
7. **Report.** `buildReport` gains `site`, one line shown above the screen sections, null at the defaults.
8. **Route.** `#/site` is owned by the Site model step in `steps.ts`, listed in the nav links, the mobile check route
   list and the keyboard-order tests.

## 2026-10-19: Wave H slice U6, help link per screen

1. **Target by heading text (DEFAULT).** Each screen names its user guide heading once, in `apps/web/src/docs/help.ts`
   (`HELP_TARGETS`). A heading's id is `sectionId` of its text, so `#/docs/user-guide/<id>` is the link. The test
   checks every target against `docs/USER_GUIDE.md`.
2. **Screens covered (DEFAULT).** Twelve screens get the link: transport, vadose, saturated, vapor, surface water,
   household, plants-eco, chemicals, risk, cleanup and report, plus the Site model screen (`#/site`) once U2 merged,
   twelve in all. Home, Methods and Documentation get none, since they are not calculation screens.
3. **Reader scroll and focus (DEFAULT).** Every heading in the reader gets its id and `tabIndex=-1`. A section hash
   scrolls to that heading and moves focus to it. The route parsing accepts one optional section segment, and
   `#/docs/<slug>` is unchanged.
4. **Shared component.** `HelpLink` (`apps/web/src/docs/HelpLink.tsx`) is the only Help link; the link is 44 px
   high and sits in a paragraph under the screen title. No new route, so the mobile check and keyboard lists are
   unchanged.
5. **No project file change.** Help links carry no state, so the project file format and its version are untouched.

## 2026-10-19: Wave H slice U10, decimal comma entry

1. **One change point (DEFAULT).** Every numeric field already goes through `Field` in `apps/web/src/ui/controls.tsx`
   (206 uses), so the setting and the parser live in `apps/web/src/ui/decimalComma.ts` and `Field` is the only
   caller. The per-form `Number(s)` helpers are untouched: form state, saved files, share links and CSV always hold
   the point form, so nothing about them changes.
2. **Per-viewer setting (DEFAULT).** A checkbox in the project bar, stored in localStorage under
   `model_flow.decimalComma.v1` inside try and catch. It is off by default and is never written to a project file.
   With it off, `Field` behaves exactly as before.
3. **Parsing rules when on (DEFAULT).** One comma reads as the decimal point ("1,5" is 1.5, "1,5e-3" is 1.5e-3). A
   lone point is kept as a decimal ("1.5", "0.125"). Rejected as ambiguous: both separators, more than one comma,
   more than one point, and a lone point shaped like a thousands group (one to three digits starting 1 to 9, a
   point, exactly three digits, for example "1.234").
4. **Rejection never guesses (DEFAULT).** A rejected string stays as typed in the box, with an alert message and
   `aria-invalid`. The form receives a fixed marker (`REJECTED_ENTRY`, "ambiguous entry, not a number") that holds none
   of the typed text and is not a number, so the form's own validation flags it and no stale or guessed value is
   computed. The marker is in memory only: the project build replaces it with an empty value, so files, share links
   and the autosave never hold it. After a remount the box is empty and still shows the alert. (DEFAULT, revised
   2026-10-19 after review: the first version appended " (ambiguous)" to the typed text and let it be saved.)
   Free-text boxes (benchmark receptor and citation, wildlife surrogate name, TPH fraction name, household chemical
   name) use `TextField`, which never reads the setting, so "Vole, meadow" is stored as typed.
5. **No project file change.** Format version 1 is untouched; there is no new route, so the mobile check and keyboard
   lists are unchanged.


## 2026-10-19: Wave I scope and the wave H open questions (Bryan delegated)

Asked to answer the wave H open questions and pick the next wave, Bryan replied "whatever you recommend". The
calls below are the recommended ones, recorded as DEFAULT (delegated) so Bryan can still overturn any of them.

1. **Transport Kd = Koc x foc stays** (DEFAULT, delegated), with foc entered by the user and the retardation
   following from Kd.
2. **Wildlife rows that do not reproduce get a visible flag** (DEFAULT, delegated): a row whose back-calculated
   soil level differs from the printed Eco-SSL by more than 5 percent (the reproduction tolerance) is marked in
   text, not by colour alone. Slice I2.
3. **The ecological site checklist stays soil source only** (DEFAULT, delegated).
4. **Database edits stay per project only** (DEFAULT, delegated; Bryan already chose this for wave H).
5. **Homegrown produce stays off for modeled cleanup sources** (DEFAULT, delegated).
6. **No total TPH cancer endpoint** (DEFAULT, delegated): the TPHCWG and MADEP fractions carry noncancer values
   only, and carcinogenic constituents such as benzene and the carcinogenic PAHs are screened as individual
   chemicals.
7. **The plume map goes into the report** (DEFAULT, delegated), overturning the wave G slice G2 exclusion.
   Slice I1.
8. **The M7, M9, M10 and M11 DEFAULT rulings stay DEFAULT** and unreviewed.

Wave I slices: I1 plume map in the report, I2 wildlife reproduction flag, I3 close-tab warning for unsaved
project changes, I4 arrow-key navigation walk over every chart, I5 transport charts sized from the content box
rather than the padded figure, I6 uncertainty sampling of modeled cleanup sources. Per-slice rulings follow in
their own blocks.

## 2026-10-19: Wave I slice I1, plume map in the report

1. **Printed table thinned to 20 rows (DEFAULT).** The report's plume map table keeps 20 evenly spaced centreline
   rows (first and last x always kept) and its caption says "20 of 100 x positions". Reason: 100 rows is about two
   print pages at 9 pt and breaks the no-page-break-inside rule; 20 rows keeps the figure and table on one page. The
   full 100-row table stays on the groundwater screen. `PlumeMap` gained an optional `tableMaxRows`; `thinIndices`
   lives in `transport/chartData.ts` (the react-refresh lint rule).
2. **No plume grid in the transport CSV (open question answered).** The transport CSV does not carry the plume
   grid. Superseded in part by wave J slice J1: the plume grid is now a separate download under the plume map.
3. **Chart item (DEFAULT).** The plume chart item carries the scenario and the method, time and depth labels, built
   in `results.ts` with the same wording as `TransportPage`, and sits before the breakthrough chart to match screen
   order. It is absent when transport did not compute, so no Charts heading comes from the plume.
4. **Overturns the G2 exclusion** as ruled in the wave I scope block (ruling 7). Grayscale, break-inside and the
   hidden probe rules already applied; no CSS change.

## 2026-10-19: Wave I slice I2, wildlife reproduction flag

1. **One named tolerance (DEFAULT).** `REPRODUCTION_TOLERANCE = 0.05` in `apps/web/src/plantsEco/wildlife.ts`; the
   engine test keeps its literal 0.05 and the engine is unchanged. No fixture tolerance was widened.
2. **Inclusive bound (DEFAULT).** A relative difference of 0.05 or less reproduces; beyond it is flagged.
3. **Text flag (DEFAULT).** The printed-value cell carries the line "Not reproduced within 5 percent", not colour.
4. **CSV column (DEFAULT).** "reproduces printed value within 5 percent (yes or no)", values yes, no or blank.
5. **Rows without a printed value (DEFAULT)** (user rows) have reproduces null: no flag, blank CSV cell.
6. **Corrected after review (F6).** The first version flagged a row that has a printed value but no back-calculated
   level (the bisection bracket was not met). `reproducesPrinted` now returns null there, so the row shows no flag
   and the CSV cell is blank; the "out of range" cell carries the distinct meaning. Chosen over a new "could not
   back-calculate" text (ruling). Test added, red first.
7. **Corrected after review (F1).** The new `.repro-flag` rule had been spliced into the shared `table.compare th,
   table.compare td` list, so `th` lost its alignment, padding, rule and wrapping. `plantsEco.css` restores the
   shared declarations, `th` keeps `font-weight: 600` in its own rule, and `.repro-flag` has its own rule. Regression
   test `plantsEco.css.test.ts` failed before the fix.

## 2026-10-19: Wave I slice I3, warning on closing the tab with unsaved changes

1. **Small pure helper (DEFAULT).** `warnBeforeUnload(hasChanges, target)` in `project/unloadGuard.ts` returns its
   cleanup. `ProjectBar` registers it once in a `useEffect` with `[]` (it already owns the unsaved-changes prompts
   and is mounted once) and removes it on unmount. The guard calls `preventDefault` and sets `returnValue` only
   while `hasUnsavedChanges()` is true.
2. **A restored autosave counted as unsaved (DEFAULT; open question answered). Overturned by Bryan in wave J
   slice J3.** This block recorded `startProjectStore` setting `savedSnapshot` to null for a restored project, so
   every reload or close prompted until a file was saved. J3 seeds the saved snapshot from the restored state, so
   a restored autosave no longer raises the close or reload warning until an edit follows the restore (see slice
   J3 for the second baseline that keeps the replace confirm).
3. **Fixed wording (DEFAULT).** The browser prompt text is a fixed string; browsers may show their own.
4. **Process note.** The test and module were written in one pass, so the red stage was not observed separately.

## 2026-10-19: Wave I slice I4, arrow-key navigation walk over every chart

1. **Per-chart result.** Already worked: `vadose/TimeLineChart`, `vadose/SourceDepletionChart`,
   `vadose/DepthProfileChart` (Up and Down), `vapor/ProfileChart` (Up and Down). Fixed: `transport/BreakthroughChart`
   (Left, Right, Home, End) and `transport/PlumeMap` (four arrows, one grid cell per press). Data table only, no
   readout: `cleanup/ModeledChart`, `uncertainty/ResultsCharts`, `uncertainty/DistributionEditor`;
   `saturated/CrossSection` is aria-hidden decoration; the inline svgs in `TransportPage` and `VadosePage` are 14 px
   aria-hidden legend swatches.
2. **No shared hook (DEFAULT).** Only two charts needed a fix and the working four use different axes and probe
   state; each fix mirrors the `TimeLineChart` pattern inline.
3. **Home and End on the breakthrough chart (DEFAULT)**, an extra the existing four do not have.
4. **Plume map keyboard (DEFAULT).** Starts at the centre cell and clamps at the edges; ArrowUp moves to larger y,
   matching the plot; the probe text uses the pointer readout format. Both probe paragraphs are now
   `aria-live="polite"` (PlumeMap was off) and the idle hint mentions arrow keys.
5. **Corrected after review (F7).** `onPointerLeave` now also clears the cell, so arrow keys start from the centre
   after a hover. Red test first.
6. **Corrected after review (F8, ruling).** The four existing charts tell screen readers about the keys only through
   the probe paragraph, not their accessible names, so they were not the model and the fallback applied: the key
   hint is added to the accessible names of all six focusable charts. Tests in `chartKeyboard`, `VadosePage` and
   `VaporPage`.
7. `report/ReportCharts.tsx` was not walked (not in the candidate list).

## 2026-10-19: Wave I slice I5, transport charts sized from the content box

1. **Cause verified.** `figure.chart` in `transport.css` has 12 px side padding and a 1 px border, and `useWidth`
   read `getBoundingClientRect` (the border box), so the svg was 26 px too wide for its content area and
   `max-width: 100%` clipped it.
2. **Fixed in the shared hook (DEFAULT).** `useWidth` subtracts padding and border, so `ModeledChart` is fixed too;
   unpadded containers measure unchanged. A test with a 400 px border box, 12 px padding and 1 px border expects
   374 (failed with 400 before); a plain div still reads 400.
3. The roughly 7 percent figure was not re-measured as a number; the 26 px offset is the verified cause on a phone
   content width near 370 px. The wave I browser check found zero overflow at 390 on the cleanup route.

## 2026-10-19: Wave I slice I6, uncertainty sampling of modeled cleanup sources

1. **Sampled inputs (DEFAULT).** The engine's own declarations for the methods the chain runs, lifted onto the
   plain-data `ModeledRequest`: groundwater `at123d` or `wexler1992` scalars (velocity, porosity on legacy only,
   retardation, decay rate, dx, dy, dz), the vadose or saturated source inputs, and on the legacy side the
   `exposure.receptorN` factors. Only inputs with a finite base value are offered. Dispersion coefficients are
   sampled independently of velocity, as the engine declares them; the guide says so.
2. **Solved source concentration never offered**: the chain sets it on every forward run.
3. **One transport method per run (DEFAULT)**, legacy or modern among those the screen solved, stored in the
   setup's `choice` field. The modern side samples no receptor factors because the modern exposure method declares
   none.
4. **Off the main thread.** Each row is one modeled solve sent to the existing worker pool through a new
   `modeled-cleanup` message; pilot, budget (confirm over 60 s, refuse over 10 min), progress and cancel are
   unchanged. The deterministic level and cap come from the screen's own worker solve. An inline stand-in runs when
   `Worker` is undefined.
5. **Engine refactor, not a method change.** The `runProbabilisticCleanup` summary is split into the exported
   `summarizeCleanup`; the pooled run uses it and is tested equal to the in-line engine run and bit-identical on
   one and two workers.
6. **Bounded version (DEFAULT; open question answered).** Default n = 200 for a modeled source (1000 for a direct
   one), which keeps 10 draws below the 95 percent level, with the warning `uncertainty.small-sample-tail` when
   fewer than 10 draws lie at or below the chosen protection quantile. The run budget, not a hard cap, bounds slow
   chains.
7. **Measured solve costs** (Node, benzene, default screen forms, `solveModeled` only, host load 5 to 11):
   dissolved legacy 84 ms and modern 41 ms (2 forward runs each); saturated legacy 0.36 s (17 runs) and modern
   7.8 s (18 runs); vadose legacy 2.0 s and modern 1.9 s (3 runs, default target not reachable). Fit on a 3-worker
   pool: dissolved n = 200 about 3 to 6 s, n = 1000 under 30 s; saturated legacy n = 200 about 24 s, n = 1000 about
   2 min (asks first); vadose n = 200 about 2 min 13 s (asks first), n = 1000 about 11 min (refused); saturated
   modern n = 200 about 8 to 9 min (asks first), n = 1000 refused. Measured under load from other slices, so read
   them as upper bounds.
8. **Browser check (wave close).** Dissolved benzene source, uniform seepage velocity 10 to 60 m/yr, 200 iterations,
   390x844 emulation on a production build: finished in about 2 s on 4 workers (800 forward runs), deterministic
   level 0.0258 mg/L, protected levels 0.0294 (50 percent), 0.0148 (90) and 0.0139 (95, chosen) mg/L. The module
   worker loaded from the built assets with no error, zero overflowing elements, Cancel run stopped a run at
   0.7 s with "The run was cancelled." and a later run completed.
9. **Saved setup (DEFAULT).** A new optional `modeled` key in the uncertainty project state, separate from the
   direct-source `cleanup` key; format version 1 files still load. The run is disabled while the screen re-solves a
   changed request, so it never samples a stale request.
10. **Report (DEFAULT).** Modeled-source uncertainty was not repeated in the report, consistent with G2 (the report
    does not compute a modeled source). Superseded by wave J slice J2: the report prints the result kept from the
    cleanup screen, without recomputing it.
11. **Corrected after review (F2).** `report/methodsRun.ts` now also counts the `modeled` setup for
    `uncertainty.cleanup-probabilistic`, so the methods statement and references cite the method when only the
    modeled panel ran. Red test first.
12. **Corrected after review (F3).** The "bit-identical on one and two workers" test never used two workers (one
    post-pilot chunk). It now uses 12 rows and `chunkSize` 2 (four post-pilot chunks) and asserts 1 and 2 workers;
    the cancellation test uses 40 rows and `chunkSize` 4 and asserts 2 workers. `RunHooks` in `headless.ts` gained an
    optional `chunkSize`.
13. **Deviations.** `docs/methods/uncertainty.md` status paragraph edited (it named modeled sources as open). The
    component is `ModeledSourceUncertainty.tsx` because the case-insensitive filesystem resolves
    `./ModeledUncertainty` to `modeledUncertainty.ts`.


## 2026-10-19: Wave J scope

Bryan armed the work and directed, verbatim: "do 1, 2 and 3 as one wave". The three items were:

1. Small UI follow-ups: a plume CSV download, modeled-source uncertainty in the report, and stopping a restored
   autosave from prompting on every reload. Slices J1, J2 and J3.
2. Gate speed: profile the slowest test files and cut the test time (the CI gate job grew by about 80 s in wave I).
   Slice J4.
3. Check the two unchecked local branches (`m1-groundwater-ui`, `ui-u9-wildlife`) against main and delete or keep
   them. Slice J5.

Per-slice rulings follow in their own blocks. Rulings a slice made on its own are DEFAULT; J3 is Bryan's decision.

## 2026-10-19: Wave J slice J1, plume grid CSV

1. **Separate download (DEFAULT).** A button under the plume map on the transport screen writes the plume grid.
   The existing transport CSV is unchanged. A lone button reads "Download CSV: plume grid" (optional `showLabel`
   prop on `DownloadCsv`); it is disabled whenever the shown result is stale (computing, invalid input, or an
   engine error that keeps the last good result on screen), so the file can never describe a grid it was not
   computed for. The transport CSV (results and breakthrough) had the same last-good mislabel (its time column used
   the current form time) and follows the same rule. The plume table is memoized on result, map method and time.
   A page-level test checks both buttons are enabled after load, the plume button sits after the map and before the
   breakthrough chart, and both are disabled after an engine overlap error.
2. **Long format at full resolution (DEFAULT).** One row per grid cell (x outer, y inner), every cell of the map
   grid (100 columns in x). A long format fits `exportCsv` and `DownloadCsv`, which write one header row plus flat
   rows, and opens cleanly in a spreadsheet; a wide grid would need ragged headers.
3. **One time (DEFAULT).** Only the time shown on the map is written, in the header ("concentration at 12.5 yr
   (mg/L)"), because the result holds a grid for one time only.
4. **Columns (DEFAULT).** method (registered id of the map method), x downgradient (m), y (m), concentration at
   the shown time (mg/L, the computed grid times 1e3).
5. **File name (DEFAULT).** From the shared `csvFileName` helper, `transport-plume-v<version>-<date>.csv`, with no
   dataset editions. The depth the grid is evaluated at is not in the file.
6. **390 px.** `#/transport` computes by default, so the plume button is on screen when `mobile:check` visits the
   route (charts=6), and it is inside the overflow and axe counts at 390 light, 390 dark and 1280 (0 and 0). The
   script does not look for the button by name and does not click it, so the download itself and its label were
   not exercised in a browser. The keyboard test checks `tabIndex` and `focus()` on the real button, not a
   simulated Tab press.

## 2026-10-19: Wave J slice J2, modeled-source uncertainty in the report

1. **Session only, not persisted (DEFAULT).** The modeled request is built from the transport chain feed, which
   holds a closure and is memory-only, so after a reload a saved summary could not be checked against current
   inputs. Project feeds are a closed key set at format version 1. No format bump and no autosave change. The
   kept summary is dropped by `newProject` and `loadProject` (`clearAllFeeds`).
2. **Summary contents (DEFAULT).** Label, unit, deterministic level, n, succeeded, seed, forward runs, workers,
   chosen protection fraction, the 50, 90, 95 and chosen levels, warnings and the Spearman ranking. No draws and no
   per-iteration levels, so the report prints no distribution chart for a modeled source.
3. **Fingerprint (DEFAULT).** `stableStringify` of the full `ModeledRequest` plus the whole modeled uncertainty
   setup, taken at click time. The report rebuilds the current request from the project's cleanup form, the
   toxicity override database and the live transport, vadose and saturated feeds. A mismatch, or no chain
   available, reads as out of date and the numbers are not printed.
4. **Report states (DEFAULT).** Current (summary printed, labeled as computed on the cleanup screen), out of date
   (re-run on the cleanup screen, numbers not printed), none (no run yet). The entry shows only when the cleanup
   source is modeled. A modeled-source-only report no longer says there is nothing to run.
5. **Methods statement unchanged.** `methodsRun` already lists `uncertainty.cleanup-probabilistic` when the modeled
   setup is edited.
6. **Shared table (DEFAULT).** The protective-levels table is a shared `LevelsTable` in `UncertaintyResults.tsx`,
   used by the direct and modeled blocks.
7. **Known limit.** The cleanup screen holds the unscrubbed setup and the report's project snapshot the scrubbed
   one, so a row with a rejected decimal-comma entry can read as out of date. This errs toward "out of date"; no
   wrong number is printed.
8. **Not verified.** The red step was skipped for the report-side view tests, and the report's current-state block
   was not rendered in a browser at 390 px (the summary exists only after an in-browser modeled run); the wave
   close mobile check does not reach it.
9. **Summary cleared at run start (corrective pass).** `ModeledSourceUncertainty` clears the kept summary when a
   new run starts, so a run that is cancelled or fails cannot leave the previous result on screen or in the
   report. A test covers it.

## 2026-10-19: Wave J slice J3, restored autosave no longer prompts

1. **Bryan's decision; overturns the I3 DEFAULT.** The I3 block ruled that a restored autosave counts as unsaved.
   Bryan chose to stop the prompt on every reload. The I3 block is amended in place.
2. **Two baselines (corrective pass).** The first J3 build moved the one saved snapshot on a restore, which also
   silenced the confirm before replacing the current project with an opened file, a dropped file or a share link.
   The store now keeps `savedSnapshot` (moves on a save to file, an open or a new project) and `warnedSnapshot`
   (also moves on a restore, through a private `markRestored()`). `hasUnsavedChanges()` compares against
   `warnedSnapshot` first and drives the close or reload warning; the new exported `hasUnfiledChanges()` compares
   against `savedSnapshot` only and drives the replace confirm in `ProjectBar.replaceWith`. `markSaved` sets both
   and `forgetMemory` resets both.
3. **Final behaviour.** A reload that only restores the autosave does not raise the close or reload warning, which
   appears after the next edit. A restored project that was never saved to a file still counts as having changes
   not saved to a file, so opening a file, dropping a file or opening a share link asks first, as before J3.
   Starting a new project always confirms. With no autosave, or one that cannot be parsed, the baseline equals the
   blank state and behaviour is unchanged. Saving to a file sets both baselines.
4. Tests that failed before the change: in `project/store.test.ts`, a restore with no edit does not warn and a
   later edit does, no autosave starts clean and a first edit flags, and a restored project reads as unfiled;
   in `ProjectBar.test.tsx`, restored then open file asks, restored then share link asks, restored then
   `beforeunload` does not warn.

## 2026-10-19: Wave J slice J4, test time

1. **Method.** The slowest engine and web test files were profiled, then cut without touching any assertion,
   tolerance, timing bound or iteration count, and without changing pool, isolation or thread settings.
2. **Engine cleanup level searches (DEFAULT).** Each transport was re-run cold at every trial source concentration.
   The per-step AT123D time integrals (optional `integrals` map on `at123dConcentration`) and the PATCHI unit step
   responses (optional `unitResponse` map on `patchiConcentration`) are now cached per transport, point and age
   window in `wellConcentrations`, in a `WeakMap`, and They do not depend on the
   concentration. The AT123D integrals map is used only when `absTol` is 0 (guard in `kernel.ts`); the PATCHI
   `unitResponse` map has no tolerance concept and is always used when passed. `test/repeat-evaluation.test.ts` (3 tests, red first) shows the cached numbers are bitwise
   those of a cold evaluation. Engine numerics are unchanged.
3. **Engine file splits.** `surfacewater-discharge` into `-4b` and `-4c`, `vadose-coupling` into `-free-space` and
   `-water-table`, `uncertain-coverage` into the rest and `-layered`, so heavy tests run side by side. Tests moved
   unchanged (22, 16, 175).
4. **Web setup (DEFAULT).** `test-setup.ts` no longer imports the project store or React Testing Library for every
   file; its `afterEach` cleans up only modules the file already loaded (found through
   `__vitest_worker__.evaluatedModules`). 38 pure-logic web test files got a `// @vitest-environment node` pragma,
   picked by a static import-graph scan (no `.tsx`, no DOM identifiers, nothing reaching `project/store`).
5. **Web file splits.** `screenKeyboard` into 4 files (its 19 route settle waits now overlap), `surfaceWater/compute`
   into 3, `TransportPage` into 3. Counts identical (101, 11, 5).
6. **Rejected.** `isolate: false` in the web package: one a11y skip-link test failed on the first run and passed on
   the next, so it is order-dependent. Reverted before any commit. The corrective pass could not reproduce the
   failure in six full runs, so its cause is not proven. The one verified leak is the route hash: the skip-link
   tests set it and a failed assertion skips their own reset, so the next `App` render starts on the wrong
   screen. The shared `afterEach` in `test-setup.ts` now resets the hash (red-first test in `testIsolation.test.tsx`).
   The conditional cleanup stays: a temporary diagnostic over the full suite found no mounted nodes left behind
   where the testing library was not loaded.
7a. **Test helper naming (corrective pass).** Test-only helpers carry a `.testkit.` infix
   (`surfaceWater/linkedRun.testkit.ts`, `a11y/screenKeyboard.testkit.tsx`, formerly `computeLinked.ts` and
   `screenKeyboardOrder.tsx`), and `testIsolation.test.tsx` fails if any file in `src` that is neither a test nor
   a testkit imports vitest or the testing library.
7. **Measured.** The before timings were taken on a loaded machine and are noisy. Before: engine 41 s, web 128 s
   (76 s on a second plain run); `cleanup/modeled.test.ts` 97 s (48 s alone). After, at load average about 4:
   engine 21 s, web 40 s; `cleanup/modeled.test.ts` about 3 s. Full gate 128 s, exit 0. CI minutes were not
   measured in the slice.
8. **Floors.** The engine is bound by single 15 to 18 s tests (layered perturbation sweep, two infinite-depth mass
   sums, `-4b` and `-4c`); cutting them further needs engine numerics changes such as caching the x and y profiles
   across z in `at123dGrid`. The web suite is CPU bound, with jsdom creation the largest remaining share.

## 2026-10-19: Wave J slice J5, local branches

Both branches were checked against main and deleted. Restore either with `git branch <name> <tip>`.
1. **`m1-groundwater-ui` (tip `5d6c6c7b42c10568b0a190a02808fe84c5d215bc`), deleted.** 10 commits, none
   patch-equivalent. The branch-only hunks in `apps/web/src/App.tsx` (lazy `TransportPage` import, `#/transport`
   route, shell-wide class, step link, transport button) and `apps/web/package.json` (d3-contour, d3-scale and
   types) are all on main in later form. `transport.css`, the `transport/` files, the groundwater engine, the
   analgwst and mibitrans fixtures and the M1 DECISIONS heading are on main. The check covered those hunks plus
   file presence for the other files, not a line-by-line diff of every file.
2. **`ui-u9-wildlife` (tip `34b1229f29b3a4fbd092c5348207abfd25203f51`), deleted.** 1 commit, not an ancestor of
   main. The wildlife dose panel in `PlantsEcoPage.tsx`, the `wildlife.ts` exports, `WILDLIFE_COLUMNS` in `csv.ts`,
   the same test names and the U9 DECISIONS heading are on main, with later fixes (`2c7e895`, `792e011`).
3. No remote branch was touched in J5. The 15 stale `origin/` milestone branches were deleted on 2026-10-21, after
   each was checked to be an ancestor of main (names, tips and restore commands in `docs/HANDOFF.md`).

## 2026-10-21: Wave K scope

Bryan directed, verbatim: "go for it, whatever you recommend", in reply to a proposal listing the open items. The
recommended wave closes the cleanup screen gap that the tree still shows (ROADMAP line 1, item 3): the cleanup
screen offers household source levels (`cleanup/HouseholdPanel.tsx`, M7 slice E4 ruling 5) but no vapor or surface
water source levels, and none of the three panels reach the report. Every ruling below is DEFAULT.

1. **K1 vapor source levels.** A vapor panel on `#/cleanup`, built like the household panel: the indoor or outdoor
   air level from the direct back-calculation divided by the vapor run's air-over-source coefficient, for methods
   where the air concentration is linear in the source. A method or mode that is not linear in the source (DeVaull
   2007 outside its entered-depth mode, a finite or mass-limited source when that limit binds) is reported as not
   quantified with its reason, never solved by a root find in this wave.
2. **K2 surface water source levels.** A surface water panel on `#/cleanup`: the surface water level from the direct
   back-calculation divided by the linked run's coefficient (peak surface water concentration per unit of the
   groundwater source that drove it), where the chain is linear in that source; otherwise not quantified.
3. **K3 report and CSV.** The household, vapor and surface water panels print in the report and write to the cleanup
   CSV when their feed exists.
4. **K4 mobile check.** `scripts/mobile-check.mjs` also performs an in-browser modeled cleanup run and checks the
   report's modeled-source block at 390 light, 390 dark and 1280, which no check has rendered so far.

Per-slice rulings follow in their own blocks.

## 2026-10-21: Wave K slice K1, vapor source levels on the cleanup screen

Every ruling below is DEFAULT. Evidence: `packages/engine/test/vapor-linearity.test.ts` (each method doubles the
source and checks the air doubles) and `apps/web/src/vapor/coefficients.test.ts` (the screen's own paths).

1. **What the vapor screen publishes.** `VaporRiskFeed` gains an optional `coefficients: { indoor?, outdoor? }`.
   Each is either `{ quantified: true, methodId, value, source, maxSource? }`, with `value` the air concentration
   (kg/m3) per unit source in SI and `source` one of soil (kg/kg), groundwater, soil gas or soil pore water (kg/m3),
   or `{ quantified: false, methodId, reason }`. The feed carries a coefficient only for a path whose air it also
   carries. The cleanup panel (`cleanup/VaporPanel.tsx`, `vaporLevels.ts`) divides the direct indoor and outdoor air
   levels by it with the existing `sourceLevelsOverCoefficient`, one row per receptor method and path, and skips
   a chemical the feed was not run for. A feed saved before this key existed gets rows that say to send it again.
   The key is optional and no vapor form key was added, so `FINGERPRINT_SKIP` needs no entry and an older project
   does not flag stale.
2. **Linearity of the listed methods (open question a).** Linear in the source, so quantified: `vapor.je-1991`
   (infinite source), `vapor.je-epa` (the screen never requests `finiteSource`, which is the only nonlinear mode),
   `vapor.jury-bam` (flux at every time proportional to the initial concentration, so the time-varying coefficient
   is a fixed function of time), `vapor.attenuation-factor-2015` (the factor times the vapor, H prime fixed at the
   groundwater temperature), `outdoorAir.box` (the steady diffusion flux is source vapor over a resistance, and the
   box is proportional to the flux), and `outdoorAir.ssg-vf-1996` in both branches: the factor takes no
   concentration, so `air = F / VF`, and the mass-limit branch (`VF = Q/C T / (rho_b d_s)`) depends on the source
   depth and time, not on F. The risk feed carries only the Johnson and Ettinger indoor methods (`vapor.je-1991`
   as legacy, `vapor.je-epa` as modern, `VaporPage.tsx` `riskMethod`) and the box and SSG outdoor factors, so
   `vapor.jury-bam` and `vapor.attenuation-factor-2015` are linear but produce no coefficient and no cleanup row
   on the web. `vapor.pvi-screen-2015` returns a verdict, not an air concentration, so it has no
   coefficient and is never quantified. `vapor.devaull-2007` is nonlinear in its fast-reaction and coupled modes
   (`oxygenDepth` root-finds a depth that depends on the source) and is not on the web vapor screen, so it never
   reaches the feed; a future screen offering it must publish `quantified: false` for those modes.
3. **Two limits inside the linear methods.** A soil source stops giving more vapor once the equilibrium pore water
   passes the solubility (the residual phase, `sourceVapor` fixed at H S). The soil coefficient is measured below
   that point (a probe divided by ten from 1000 mg/kg until no separate phase shows) and carries `maxSource`, the soil
   level where the vapor stops rising. A level above it is reported as not quantified with that reason, and a
   cancer or noncancer level above it is kept with a warning. A soil source with a TPH mixture sets the mole
   fraction from the source, so it is published as not quantified. The Soil Screening Guidance factor has no
   residual cap, so it carries no `maxSource`.
4. **A guard on the linear assumption.** Every probe is run at the source and at half the source and the air must
   halve within 1e-9 relative; a failure is published as not quantified with that reason, so a path that is
   nonlinear for a reason not foreseen here is never divided.
5. **Time series source (open question b).** The coefficient is defined at a reference source (1 kg/m3, or the
   below-residual soil probe), never as a ratio of a series value to its air. The steady method is applied at each
   time (vapor ruling 7), so the model is linear and time invariant and the ratio of air to source is the same
   number at every time; a test checks that each series value over its source equals the coefficient, so a zero
   source value cannot break it. The source kind is the series kind (groundwater, or pore water through the soil
   gas H times it). The Soil Screening Guidance factor needs a soil concentration, so with a series it is
   published as not quantified; the series feed has no modern outdoor path in any case.
6. **Where it is computed (open question c).** On the vapor side, in `vapor/coefficients.ts`, and carried on the
   feed. The coefficient needs the parsed engine inputs (strata, building, Henry constant at the soil
   temperature, the capillary zone), which only the vapor screen holds; recomputing on the cleanup side would
   duplicate the form parser. `series.ts` exports the `seriesSources` it already used so the epc and the coefficient
   build their sources the same way.
7. **Save behaviour.** As the household panel: the feed is a plain JSON feed in the project file, fingerprinted
   against the vapor form, and the panel reads whatever feed is held. No new cleanup form key exists.

## 2026-10-21: Wave K slice K2, surface water source levels on the cleanup screen

Every ruling below is DEFAULT.

1. **What the source is, per origin of the feed (DEFAULT).** The source is the dissolved groundwater concentration
   that drove the run, in kg/m3 and printed in mg/L. Unlinked run: the typed groundwater concentration. Run linked
   to a transport plume: the held source concentration c0 of the transport scenario; a mass rate source is the same
   source (c0 is the rate over the Darcy flux times the source cross-section, and the engine uses the rate). A plume
   fed by a vadose or saturated source screen has no groundwater source concentration on the feed (the drive is a
   soil or leachate schedule of mass steps, and the feed records neither the soil level nor its units), so that origin
   is not quantified, with the reason, rather than guessed. The level therefore always means "a dissolved
   groundwater source alone at this concentration just meets the surface water target", the same reading as the
   household panel's tap water level.
2. **Peak over source is the right ratio (DEFAULT).** The chain is linear in the source: AT123D-class transport and
   the plane quadrature, the legacy box (loading over flow plus decay), and the modern mass discharge are all
   proportional to c0. `coefficient.test.ts` doubles the source (the concentration, and for a linked run c0 and the
   mass rate together) and checks that the surface water peak doubles for both methods, unlinked and linked, to 9 and 6
   decimals respectively. Since every sample of the series scales by the same factor, the peak over the 24 sample
   times scales too, and the ratio is one constant. The peak is the maximum of the sampled series, not a continuous
   maximum. An upstream background is affine, not proportional, so a run with a background above zero is not
   quantified. A zero source or a zero peak is not quantified, never a zero coefficient.
3. **Solubility (DEFAULT).** The engine only warns above solubility; it does not cap the chain, so the ratio stays
   linear. The limit is applied to the answer: when the source level exceeds the solubility entered on the surface
   water run (carried on the coefficient), a dissolved source cannot reach it and the level is not quantified with
   that reason. A run with no solubility entered is not checked, as on the surface water screen.
4. **Where the coefficient is computed (DEFAULT).** In the web layer, `surfaceWater/coefficient.ts`, when the
   surface water screen sends a series (the same click that sets the feed), from the request and the result that
   produced the series. It is not recomputed by a second run (the linked bank plane is expensive), the doubling
   test is the evidence of linearity. It is attached only when the result on screen is the current computed one.
   It is stored on `SurfaceWaterFeed.coefficient` (optional): value, reason, method id, source medium, unit, the
   source and the solubility. The project schema accepts it as an optional key, and no form key was added, so
   `FINGERPRINT_SKIP` is unchanged and older project files and feeds neither fail to load nor read as stale
   (`project/store.test.ts`). A feed without a coefficient shows every level as not quantified, asking for the result
   to be sent again.
5. **Division and chemical (DEFAULT).** `cleanup/surfaceWaterLevels.ts` divides the direct surface water level by the
   coefficient through the engine's `sourceLevelsOverCoefficient`, whose medium union gained `surfaceWater` (no other
   change); cancer and noncancer levels scale the same way, so the governing endpoint is unchanged. The feed carries
   no chemical id (the surface water screen has none), so the coefficient is applied only when the cleanup run holds
   exactly one chemical; with two or more every row is not quantified with a reason (corrective pass, item 2). Its Koc, decay and solubility are the run's
   own. Both receptor methods are shown against the one surface water method that was sent.
6. **Save and screen behaviour (DEFAULT).** Like the household panel: a panel with the same markup, classes and
   data-label table on narrow screens, shown when a feed exists and the cleanup run has a surface water medium, held
   with the project through the existing surface water feed envelope. The CSV and report are K3.

## 2026-10-21: Wave K slice K4, modeled-source block in the mobile check

Every ruling below is DEFAULT.

1. **A new "modeled" visit in `scripts/mobile-check.mjs`.** The check opens `#/transport` and presses "Use for
   cleanup levels", moves to `#/cleanup` by hash change (the kept feed and result are session memory, so no step
   reloads), adds benzene (the seed already sets a dissolved cleanup source), samples the seepage velocity as
   uniform 5 to 40, runs "Run probabilistic cleanup" at the default 200 iterations, waits for the results table,
   moves to `#/report` by hash and ticks "Include uncertainty results". It runs at 390 light, 390 dark and 1280
   with the existing overflow and axe checks.
2. **Pass condition.** The visit fails unless the report's "Modeled source uncertainty results" section shows the
   current result (text with "iterations ran" and "Which inputs matter"), never "No run yet" or "out of date".
   The line printed for it carries the flags as `modeledBlock={...}`.
3. **No generic button pass on this visit.** The shared button presser would also click run buttons on the
   cleanup screen, so the visit is driven only by its own steps (`noPress`); the cleanup screen prints one
   diagnostic line ("mid: ...") if the run button never enables.
4. **No component change was needed.** The block rendered with no overflowing element and no axe violation in all
   three views, so no component or test changed.

## 2026-10-21: Wave K slice K3, source levels in the report and CSV

Every ruling below is DEFAULT.

1. **One table per panel.** The household, vapor and surface water panels each write one CSV table, named
   `cleanup-household-levels`, `cleanup-vapor-levels` and `cleanup-surface-water-levels`, built in
   `cleanup/sourceLevelsCsv.ts` from the same row functions the panels use, so the file and the screen cannot
   disagree. A table exists only when its feed is held; the order is household, vapor, surface water.
2. **Same rows, screen units.** Levels are written in the panel's unit (mg/L, mg/kg or mg/m3, named in a unit column)
   at full precision, with the receptor method id (`cleanup.rags-b-1991` or `cleanup.rags-e-f-2014`) and the source
   run's method id in their own columns. The surface water table adds the surface water level the source level
   reproduces.
3. **Not quantified keeps its row.** A path with no level is written with empty level cells and the reason in a
   "not quantified because" column, never zero and never dropped. A household row whose coefficient is zero is written
   the same way, with the engine's zero-coefficient warning as its reason (corrective pass, item 3).
4. **Same place in the app.** The tables are added to the cleanup screen's Download CSV controls and to the cleanup
   section of the report (`report/results.ts`), after the cleanup levels and pathways. The report computes them
   from the project's held feeds, so a project saved and reopened prints the same rows. The report note that the
   household panel is on the screen only is removed, since it is false.
5. **No new saved keys.** The feeds already live in the project file; nothing is added to a form or feed, so
   `FINGERPRINT_SKIP` is unchanged and older project files do not read as stale.
6. **Warnings.** Panel row warnings stay on the screen; the report carries the engine warnings of the receptor
   methods as before.
7. **Roadmap.** `docs/ROADMAP.md` line 1, item (3), is corrected in place: the vapor, shower and surface water gap
   it named is closed for linear paths. This follows the task's numbered step 3, which conflicts with the generic
   rule not to edit the roadmap; the numbered step was followed.

## 2026-10-21: Wave K corrective pass

An independent review of wave K produced four fixes (branches wave-k-fix-a, -b, -c, merged in that order) and two
rulings. Items 1 to 4 are fix A, 5 and 6 are fix B, 7 and 8 are fix C. Earlier K1 ruling 2, K2 ruling 5 and K3
ruling 3 were corrected in place.

1. **Multi-chemical cleanup runs threw.** The household, vapor and surface water panels passed every chemical of the
   medium to the engine, which throws on a chemical with no coefficient (RangeError with benzene and toluene).
   `cleanup/chemicalLevel.ts` (`sourceLevelOfChemical`) now narrows the medium to the chemical the screen was run for
   before the engine call. Test: `multiChemicalLevels.test.ts`.
2. **Surface water coefficient applied to every chemical.** The surface water screen has no chemical id, so the
   coefficient is applied only when the run holds exactly one chemical; otherwise rows are not quantified, with a
   reason.
3. **Zero household coefficient lost its reason in the CSV.** `HouseholdLevelRow` gained a reason field taken from the
   engine warning, and the CSV writes it.
4. **Stale surface water series sent after an engine error.** Both send buttons are disabled while an engine error
   shows, and nothing is sent. Test: `SurfaceWaterScreen.engineError.test.tsx`.
5. **A sent coefficient outlived its inputs.** Vapor and surface water screens drop the sent coefficient when an input
   it depends on (for vapor also the source or method) changes; the air or series stays on the feed, so cleanup, CSV
   and report say to send again.
6. **Vapor Send ignored an invalid form.** Send is disabled with a reason while the form is invalid.
7. **K1 ruling 2 overstated reachable methods.** `jury-bam` and `attenuation-factor-2015` are linear but never reach
   the feed from the web (the screen maps legacy and modern to the Johnson and Ettinger and box/SSG methods). Ruling
   corrected in place; guard test in `vapor/coefficients.test.ts`.
8. **Mobile check printed `mid: ran` on every visit.** `midSetup` returns null on success, so the diagnostic prints only
   when the run button never enables.

Rulings, all DEFAULT:

- **Chemical scoping.** Household and vapor coefficients are chemical-scoped by chemical id, so other chemicals in a
  run have no rows. The engine's `sourceLevelsOverCoefficient` is unchanged and still throws on a missing
  coefficient; the web narrows instead.
- **Surface water chemical.** A chemical picker on the surface water screen is a possible future change.
- **Household CSV reason** is the engine's `cleanup.zero-coefficient` warning text.
- **Send disabled on engine error** rather than sending the last good series.
- **Live staleness is not extended.** The `stale` list in `project/store.ts` is set only on open and restore, so the
  household, groundwater, vadose, saturated, produce and tph feeds still show no stale indication after an in-session
  edit. Fix B scoped itself to the two wave K feeds; extending live staleness to every feed is a separate decision.
- **Drop the coefficient, keep the series**, rather than flagging the whole feed stale; no schema or
  `FINGERPRINT_SKIP` change.

## 2026-10-21: Waves L and M scope

Bryan agreed with a product assessment ("i agree") whose recommended next work was a live stale mark on every
feed (wave L) and a validation page (wave M), then directed, verbatim: "go ahead with waves L and M in parallel".
Every ruling below is DEFAULT unless marked otherwise.

1. **Wave L, live feed staleness.** Today a feed is flagged stale only when a project is opened or restored
   (`apps/web/src/project/store.ts`). Wave L makes the mark live: the moment a sending screen's inputs no longer
   match the inputs recorded when the feed was sent, every consumer (the receiving screens, the cleanup panels,
   the report and the CSV files) marks the values as computed from out-of-date inputs. The values stay visible
   with the mark; re-sending clears it, and so does editing the inputs back to what was sent. Slice L1 builds the
   mechanism and connects every sender; slice L2 shows the mark in every consumer. Whether the wave K rule that
   drops a vapor or surface water coefficient on an input change stays, or is replaced by the shared mark, is
   L1's call, recorded in its block.
2. **Wave M, validation page.** A page in the app that shows, for each published worked example the test suite
   reproduces (the engine fixtures and the RSL reproductions), its source, what is compared, the tolerance and
   the result, plus a plain list of what is unverified (references not yet read, warned defaults, named
   exceptions, smoke-test-only tables). The content is generated from the fixtures and `references.json` by a
   script with a gate check, as `docs/ATTRIBUTIONS.md` is, so the page cannot drift from what the tests check.
   No new published values are added in this wave. Slice M1 builds the generator and the generated document;
   slice M2 builds the page.
3. **UI parity document.** The gap table in `docs/UI_PARITY.md` section 2 is corrected in place against the tree
   (several rows still read open for slices that landed).

## 2026-10-21: Wave L slice L1, live feed staleness

Slice L1 makes the stale mark live for every value passed between screens and exposes it to the consumers
(slice L2 shows it in the cleanup panels, the report and the CSV files). Every ruling below is DEFAULT.

1. **The mark is computed, not stored at open.** `project/store.ts` keeps, for each held feed, the fingerprint of
   its source form taken at send (the `inputsHash` the file already carries) and a session-only record of what else
   the feed read (ruling 2). A feed is stale while it is held and either differs from the live screens. The list is
   recomputed on every screen edit (`setScreen`), every send or clear of any feed, and on open, restore and new
   project, and subscribers are told only when the set changes. Edit back, or send again, and the mark clears.
2. **Inputs beyond the source form are part of the mark, in the session only.** A form fingerprint alone misses
   inputs a sender reads from beside its form or from another screen. The extras (`heldInputs` in `store.ts`) are:
   the well method on the transport screen (well and water table feeds), the vadose or saturated feed the transport
   screen reads while its feed toggles are on (well, water table, bank and cleanup run), the saturated method picked
   for sending (saturated and its vapor feed), the outdoor box, source choice and the chosen source series on the vapor
   screen (the vapor feed; the attenuation-factor and PVI panels feed nothing and are left out), the bank run while
   the surface water screen is linked to it, and the well and surface water feeds a household section reads while its
   source is set to them. A held feed that is compared is compared by content (a short fingerprint worked out once per
   feed object), so sending an upstream feed again with the same content is not a change. The extras are never written
   to the file: no schema change, and `FINGERPRINT_SKIP` is untouched.
3. **An opened or restored file reports what it always did.** The file's recorded fingerprints decide which feeds are
   stale on open, exactly as before. The extras of a file's feeds are taken as they are at open, since a file does not
   record them, so only a change made after the open can add a mark. After the open the mark is live: a stale feed
   clears when its inputs are edited back or it is sent again.
4. **The wave K coefficient-dropping effects are replaced by the shared mark.** Evidence: those effects (vapor and
   surface water screens) removed the sent coefficient by calling the feed setter again, and the store records a new
   fingerprint on every set, so the drop also reset the feed's mark; with both in place the edit made the coefficient
   vanish and left the air or series looking current (tests `keeps the sent run ... marks it stale` in
   `vapor/VaporScreens.test.tsx` and `surfaceWater/SurfaceWaterScreen.test.tsx` failed against the old effects, and
   pass once they are removed). The effects also only ran while their screen was mounted and compared the coefficient
   only, so an edit that left it unchanged (or moved the series but not the coefficient) went unmarked. Wave scope
   ruling 1 says the values stay visible with the mark. The sent run, series and coefficient therefore stay on the feed
   untouched after an edit, and the mark is the only signal. **Until slice L2 lands, the cleanup panels, report and CSV
   use the sent coefficient without a mark; L2 must show it** (this branch does not merge alone).
5. **The groundwater run for cleanup levels is a feed too.** `transportChain` (the transport screen's "Use for
   cleanup levels", held in `transport/chainFeed.ts`) is session only and was in no list. It joins the stale keys, and
   opening a project or starting a new one now clears it with the other feeds: before, it survived both and kept
   driving the cleanup screen from a different project's aquifer.
6. **The banner is live and dismissal is per value.** `App.tsx` lists each stale value by name and the screen that sends
   it (`FEED_INFO` in `project/staleFeeds.ts`) instead of the raw feed keys. Dismiss hides the values listed at that
   moment; a value that clears and goes stale again is shown again. The dropped-feed note is unchanged.
7. **The mark is as coarse as the source form.** Any edit to the sending screen's form marks its feeds, including a
   field the sent values do not read (the same conservative rule the open check always used). Staleness does not cascade
   through chains: a stale well feed does not mark the household feed that read it until the well feed is sent again with
   different content.
8. **API for consumers.** `project/store.ts`: `getStaleFeeds()` (a stable array until the set changes), `isFeedStaleNow(key)`,
   `subscribeStale(fn)`, type `StaleFeedKey`. `project/staleFeeds.ts`: hooks `useStaleFeeds()` and `useFeedStale(key)`, and
   `FEED_INFO` (label, sending screen, route per key).
