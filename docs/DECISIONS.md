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
titles, venues and DOIs (Crossref, 2026-10-18), both still `planned`.

Rulings, each DEFAULT (Bryan's to overturn) unless marked as forced by a source:

1. **Scope.** M7 ships `shower.fc-1986`, `shower.little-1992`, `shower.rsl-household`,
   `irrigation.sprinkler-fc`, `irrigation.pathways`, `particulate.box-emission`,
   `particulate.ssg-pef-1996` and `particulate.ssg-pef-2002`. Deferred: plant uptake and soil
   accumulation from irrigation (M9), probabilistic parameters (M10), construction-phase PEFs, multi-zone
   house models and gas-phase dermal uptake.
2. **One droplet kernel.** The two-resistance droplet fraction is shared by the legacy shower and the
   sprinkler; the film coefficients scale from water vapour and carbon dioxide by the square root of the
   molecular weight ratio, with the reference values verified against `foster1986` in slice S0 before
   code.
3. **Legacy stall is stagnant** (RISC5 choice): all mass volatilized during the shower is in the stall
   from the start, no exchange; a stall value above H C_w is warned, not clipped.
4. **Modern stall is Little's back-pressure and ventilation balance**, time-averaged over the time in
   the stall, solved in closed form (linear first-order ODE); the equations in the note are checked line
   by line against `little1992` in S0 before code.
5. **The RSL household term** (`shower.rsl-household`, the Andelman factor as the RSL user's guide states
   it) is a separate modern screening method so M5 can reproduce the RSL tap water levels for volatiles;
   its factor and volatility criterion are transcribed from `epa2024rslug` in S0 (forced by the source
   once read).
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
