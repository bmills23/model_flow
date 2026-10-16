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
   apportions the mass loss; the annual mean removes the same mass each year.
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
`tph-constant-approximation` threshold stays at 0.1 as in M2. Raoult's law is attributed to Cline et al.
1991 only provisionally: the paper was not readable, so stage 2 cites it only after confirming it, or
drops it and records why.

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
  within 48, which holds up to about 24 years of release. Past that, the feed falls back to the annual
  mean, which delivers the same mass at every year end and differs only within a year. The fallback is
  never silent: the saturated screen's coupling panel states it for the current horizon, and the
  groundwater screen's warnings carry `ui.saturated-seasonal-fallback`. A legacy seasonal source that is
  exhausted early (few years) never reaches the cap.
- **Aquifer travels with the feed.** The methods note says one porosity, bulk density and organic carbon
  serve partitioning and transport, so a saturated-fed groundwater run takes its porosity, Darcy flux
  (K times the gradient) and retardation (1 + rho_b Koc f_oc / porosity) from the saturated screen and
  disables the typed aquifer fields. The source box is the plan size by the high-water saturated
  thickness; a source that never submerges keeps the typed mixing depth.
- The legacy method has no source decay, so the screen drops a typed decay rate from the legacy run
  rather than refusing it; only the modern run uses it.
- `TimeLineChart` gained an optional `vlines` prop for the depletion-time markers; vadose charts do not
  pass it and are unchanged.
