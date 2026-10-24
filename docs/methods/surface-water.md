# Surface water and sediment (methods note for M8)

Equations implemented in `packages/engine/src/processes/surfaceWater/`, in our own words, derived
from the primary publications cited by reference key (see `docs/ATTRIBUTIONS.md` for full entries). The
RISC5 manual (Appendix L for the models, Appendices M and N for the criteria databases, and Table R-8 of
its Appendix R review) was used only as a map of which choices RISC5 made; none of its text, figures or
tables is reproduced, its equation labels are not used here, and its criteria databases are not a data
source. Where a choice is RISC5's rather than a publication's, it is marked "RISC5 choice" and becomes the
method's `risc5Choice` metadata.

Status: stage 1 done 2026-10-16 (this note, the reference check, the data plan, the fixture plan and the
slice plan). Slice E1 (legacy kernels: units, box, Darcy discharge, reach length, sediment, checks;
fixtures 1, 2, H3 and H4) and slice E2 (modern kernels: `bankPlaneDischarge`, the transient box, plug-flow
downstream, the selectable-pore-water sediment; fixtures 3 H1 and H2, 4a to 4d, 5a to 5d) are implemented,
and so is slice E3 (coupling to M1 and M4, criteria comparison, registration of `surfaceWater.well-mixed`
and `surfaceWater.mass-discharge`; fixtures 5e, 6b and 6c; the two runs live in `surfaceWater/scenario.ts`).
Slice D1 (the NRWQC criteria build: raw pages with a checksum manifest, reader, generated JSON, `data:check`) is implemented, so fixture 6a no longer waits on it, and so is slice D2 (the sediment benchmark build: Region 4 Tables 2a, 2b and 2c, generated `benchmarks.json`; the MacDonald et al. TEC and PEC landed in wave V, see "International criteria sets (wave V)"); slice W1 (the screen at `#/surface-water`, `apps/web/src/surfaceWater/`, and the transport screen's "Use as surface water source" feed) is implemented, and so is slice W2 (the criteria panel, `CriteriaPanel.tsx` and `criteriaDb.ts`, which loads the four generated criteria files on demand as separate chunks and compares the peak of each method's series with the aquatic life, human health and sediment criteria of a chosen chemical at a user hardness, and the surface water feed to the risk screen, `surfaceWater/feed.ts`, which sets the swimming EPC as a series with origin `surfaceWater.well-mixed` or `surfaceWater.mass-discharge`). The criteria panel shows a hardness-dependent freshwater metal from the Appendix B equation, an aluminum-type criterion as site-specific, and drops a table cell whose unit is not a water concentration (pH in standard units; a fiber count). When a transport run is linked the screen reads the legacy AT123D-class solution at the bank for both methods (a Wexler or Domenico map selection does not change the feed), and the bank plane integral uses a relative tolerance of 1e-3 with one panel per axis, held within 1 percent of the engine's tight default by a test, to keep a 24-point curve near 4 s in the browser. The scope calls below are the rulings recorded in
`docs/DECISIONS.md` (2026-10-16, M8 stage 1 block); those marked DEFAULT are open to Bryan's overturn.

## What the process is

A dissolved groundwater plume reaches a river, stream or lake and discharges through the bed. The process
turns the groundwater arriving at the bank into three things:

- a **surface water concentration** in the part of the water body the discharge mixes into, and, for a
  river, at a receptor further downstream;
- a **sediment concentration** where the plume passes through the bed deposits, by equilibrium
  partitioning between the sediment solids and the pore water;
- a **comparison against criteria**: surface water against the EPA national recommended water quality
  criteria for aquatic life and human health, sediment against public sediment screening benchmarks.

The groundwater arriving at the bank is either entered (a measured concentration at the edge, held
constant) or produced by an M1 groundwater run (which M2 and M3 can feed). The surface water
concentration is also an exposure point concentration for the M4 swimming pathways.

## Scope of M8

| Option (ROADMAP section 3, rows L, M and N) | M8? | Reason |
|---|---|---|
| Legacy well-mixed surface water box for a river reach or a lake, with upstream flow, background concentration, a mixing fraction and first-order decay, applied quasi-steadily at each time | Yes | The legacy default (RISC5 choice) |
| Legacy groundwater discharge rate by Darcy's law across the bed, and the impacted reach length from a steady Domenico plume width | Yes | The legacy linkage to a groundwater run (RISC5 choice) |
| Legacy sediment concentration by equilibrium partitioning with the groundwater concentration | Yes | The legacy sediment model |
| Modern: mass discharge integrated across the bank plane from the M1 run, conserving the mass M1 delivers | Yes | The legacy loading (centreline concentration times a Darcy flow over a conservative width) is not tied to the mass the plume carries; this is the mass-consistent alternative |
| Modern: transient well-mixed solution (the residence time of a lake is not ignored) | Yes | Exact for a piecewise-linear loading; reduces to the legacy box at steady state |
| Modern: first-order decay downstream of the reach for a river receptor (plug flow) | Yes | Named by the ROADMAP row L ("add first-order in-stream decay") |
| Modern: equilibrium-partitioning sediment with a selectable pore water (discharging groundwater or the mixed surface water) and an organic-carbon-normalized output | Yes | The equilibrium partitioning framework of `ditoro1991`, which sediment benchmarks normalized to organic carbon assume |
| Comparison with EPA national recommended water quality criteria (aquatic life, freshwater and saltwater, acute and chronic; human health, water plus organism and organism only), with the hardness-dependent metals computed at a user hardness | Yes | Named by the ROADMAP row L ("EPA NRWQC comparison") and rows M, N |
| Comparison with sediment benchmarks: EPA Region 4 (2018) freshwater and marine screening and refinement values, and from wave V the MacDonald et al. (2000) consensus TEC and PEC and the CCME sediment guidelines | Yes | Public sources; NOAA SQuiRTs replaced, see "Criteria data" |
| Incomplete lateral mixing in a river (a two-dimensional bank-source mixing zone with a transverse mixing coefficient) | No; later | The mixing fraction stays the user's control of partial mixing, as in RISC5 |
| Estuaries and tidal exchange; stratified lakes | No; later | Not in RISC5; needs tidal or layered mass balances |
| Site-chemistry criteria: copper by the biotic ligand model, aluminum by the multiple linear regression, ammonia by pH and temperature, selenium as fish tissue | No | Reported as "site-specific criterion, not computed"; the user may enter a value |
| International criteria: the current successors of the sets RISC5 Appendix M lists (Canada CCME, European Union, United Kingdom, Australia and New Zealand ANZG) and, for sediment, the CCME guidelines and the MacDonald et al. (2000) consensus TEC and PEC beside Region 4 (RISC5 Appendices M, N were read as a map of which sets matter, never for values) | Yes, from wave V | See "International criteria sets (wave V)"; the 1990s sediment sets that later sets superseded are not rebuilt |
| EPA equilibrium partitioning sediment benchmarks (ESBs) and the marine ERL and ERM of `long1995` | No; later | The organic-carbon-normalized output makes them a data addition, not a model change |
| Human contact with sediment (ingestion, dermal) | No; after M8 and M5 merge | RISC5 routes sediment through its soil equations; adding pathways to M4's pathway list in M8 would collide with the parallel M5 track. Meanwhile the sediment value can be typed into the M4 soil pathways as a constant |
| Fish ingestion by people | No | Not a RISC5 pathway and M4 has none; it needs a bioaccumulation factor source. The human health "organism only" criterion, which already embeds fish consumption, is the screen offered instead |
| Sediment processes beyond partitioning (burial, resuspension, sediment-water diffusion, biodegradation in the bed) and surface runoff, erosion or point discharges | No | Not modelled by RISC5 either |
| Back-calculation of a groundwater or soil cleanup level from a surface water target | Yes (cleanup screen) | The target over the run's unit-source response where the run is linear in a dissolved groundwater source; otherwise (an upstream background, a plume fed by a vadose or saturated source screen, a soil source carried to the bank) the source concentration whose forward run meets the target, found with the cleanup solve ("Source levels on paths that are not linear", below) |

## Units

SI inside the engine: kilograms, metres, seconds. Boundary units follow RISC style for the models and the
publishing agency's own units for criteria; conversions happen only at the boundary.

| Quantity | Unit at the boundary | Engine unit |
|---|---|---|
| Flows (upstream, groundwater discharge) | m^3/d | m^3/s |
| Concentrations in water (groundwater, surface water, background) | mg/L | kg/m^3 |
| Mass loading | mg/d | kg/s |
| Volume, cross-section, lengths | m^3, m^2, m | m^3, m^2, m |
| Bed hydraulic conductivity, Darcy flux | m/d | m/s |
| First-order decay in surface water | 1/d | 1/s |
| Kd, Koc | L/kg (equal to mL/g) | m^3/kg |
| Fraction organic carbon | g/g | kg/kg |
| Sediment concentration | mg/kg dry weight | kg/kg |
| Water quality criteria | ug/L (as EPA publishes them) | kg/m^3 |
| Sediment benchmarks | ug/kg or mg/kg dry weight, some at 1 percent organic carbon (as each source publishes them) | kg/kg |
| Hardness | mg/L as CaCO3 | mg/L as CaCO3 (an equation argument, never converted) |
| Time | days or years on charts | s, on the 365.25-day transport time axis |

## Notation

Water body: upstream (inflow) flow Q_u, upstream background concentration C_u, mixing fraction f (the
share of the water body the discharge mixes into, 0 < f <= 1), body volume V_b (a river: cross-section A
times reach length L_r; a lake: entered), first-order decay k. Groundwater at the bank: discharge flow
Q_gw, concentration C_gw, thickness of aquifer discharging into the water body d (measured down from the
water table), reach length L_r, distance from the downgradient source face to the bank x_s. Legacy
interface: bed conductivity K_b and gradient i_b between groundwater head and water level. M1 aquifer:
porosity n, seepage velocity v, Darcy flux q = n v, retardation R, decay lambda, dispersivities alpha_L,
alpha_T, alpha_V. Sediment: fraction organic carbon f_oc, Koc, Kd. Mixing quantities: Q_mix = f Q_u + Q_gw,
V = f V_b, loading W.

## Legacy method: well-mixed box (`surfaceWater.well-mixed`)

Citations: `chapra1997` (completely mixed system mass balance), `domenico1987` (plume width for the reach
length), `ditoro1991` (equilibrium partitioning for sediment).

### Groundwater discharge to the water body

Darcy's law across the bed (RISC5 choice): the groundwater flow entering the reach is

    Q_gw = K_b d L_r i_b

with i_b the head difference between the aquifer and the water surface over the flow-path length between
them. A gradient of zero or less means the water body does not receive groundwater (a losing reach) and
the model does not apply: RangeError.

The groundwater concentration C_gw is either entered (constant) or taken from an M1 run at the bank on the
plume centreline. RISC5 says "centreline" without a depth; DEFAULT ruling 3 averages the M1 profile over
the discharge thickness, from the water table to depth d, with the M1 well-screen trapezoid rule
(`wellScreenAverage`), so a shallow plume is not read at a single point.

The loading is the discharging groundwater times its concentration, plus the background carried in by the
share of the upstream flow that mixes:

    W = f Q_u C_u + Q_gw C_gw

### Impacted reach length

Entered, or, when the model is linked to a groundwater run, the full width of the plume at the bank
between the two points where the steady-state concentration falls to 5 percent of the centreline value
(RISC5 choice). The width comes from the steady Domenico (1987) form for a vertical source of width Y: the
lateral factor is

    g(y) = erf( (y + Y/2) / (2 sqrt(alpha_y x_s)) ) - erf( (y - Y/2) / (2 sqrt(alpha_y x_s)) )

and the half-width y* solves g(y*) / g(0) = 0.05 (Brent's method on [0, Y/2 + 20 sqrt(alpha_y x_s)]), so
L_r = 2 y*. The longitudinal and vertical factors and the source concentration cancel in the ratio, so the
width depends only on Y, x_s and alpha_y. RISC5 uses its own dispersivities for this step, not the
groundwater run's: alpha_x = 0.1 x_s and alpha_y = alpha_x / 3 (the vertical ratio does not enter). DEFAULT
ruling 4 keeps that choice and offers the groundwater run's own alpha_T as an option. The concentrations of
the groundwater run, not of this Domenico form, set the loading; the Domenico form only fixes the width.
Because the plume is treated as a step of centreline concentration across the whole width, the legacy
loading can exceed what the source releases (warned, see "Validity checks").

### Surface water concentration

A box of volume V, flushed by Q_mix and losing mass by first-order decay, at steady state for the current
loading:

    C_sw = W / (Q_mix + k V),   Q_mix = f Q_u + Q_gw,   V = f V_b

For a river V_b = A L_r; for a lake V_b is entered. The mixing fraction scales both the upstream flow and
the volume. This form is forced by Table R-8 (ruling 2): the lake case reproduces the review's value only
with f on both (f on the volume alone, or on neither, misses it by a factor of 1.5 and 2.9).

With a time-varying C_gw the box is re-evaluated at each sample time with no storage (quasi-steady, RISC5
choice); the modern method keeps the storage term.

### Sediment concentration

Equilibrium between the sediment solids and the groundwater passing through the bed (RISC5 choice, no
degradation in the bed):

    C_sed = Kd C_gw,   Kd = f_oc Koc   when the chemical has a Koc, otherwise the database Kd

RISC5 enters Kd for inorganics and uses f_oc Koc otherwise; DEFAULT ruling 8 reads that as "Koc when the
database has one, else the database Kd" (the RSL chemical-specific parameter table carries Koc and Kd); a
chemical with neither is not quantified (`surfaceWater.sediment-not-quantified`), never zero. With
mg/L and L/kg the result is mg/kg dry weight.

## Modern method: mass discharge and transient mixing (`surfaceWater.mass-discharge`)

Citations: `chapra1997` (transient completely mixed system, plug flow with first-order decay),
`ditoro1991` (equilibrium partitioning and organic-carbon normalization).

### Mass discharge across the bank plane

The loading is the advective mass flux the M1 plume carries across the vertical plane at the bank, over
the reach and the discharge thickness:

    W(t) = q * integral over y in [-L_r/2, L_r/2], z in [0, d] of C(x_s, y, z, t) dy dz

with C the M1 dissolved concentration (z down from the water table, y from the centreline, x_s from the
downgradient source face, the M1 screen's geometry). The dispersive flux across the plane is neglected and
the plane passes the plume through without reflection, as the M1 solutions assume an aquifer unbounded
downstream (DEFAULT ruling 6). The groundwater flow carrying it is the M1 Darcy flux over the same area,
Q_gw = q d L_r (DEFAULT ruling 7), so the modern method needs no bed conductivity or gradient, and the flux
of water and of mass are consistent. The flux-averaged groundwater concentration at the bank is
C_gw = W / Q_gw.

Why this conserves mass: for the AT123D solution with a source releasing mass at rate W_0 and no decay, the
concentration integrated over an entire plane downstream of the source tends, at steady state, to
W_0 / q, so the advective flux across the plane equals the release rate; for a pulse, the time integral of
the advective flux equals the released mass (the time integral of the one-dimensional Green's function at
a downstream point is 1/(n v)). With first-order decay acting on the total mass (the M1 kernel's
convention), the steady ratio for a point source at distance x is

    W(infinity) / W_0 = (v / s) exp( (v - s) x / (2 D_x) ),   s = sqrt(v^2 + 4 D_x lambda R)

with D_x the longitudinal dispersion coefficient; the same ratio holds for the time integral of a pulse.
These give the mass-balance fixtures below.

Reach and depth checks: the plane integral over the reach and depth is compared with the integral over the
full plane (all y, and all depths for a finite aquifer or a depth well below the plume for an infinite
one); less than 99 percent of the full-width flux inside the reach is warned
(`surfaceWater.reach-truncates-plume`) and less than 95 percent of the full-depth flux above d is warned
(`surfaceWater.plume-underflow`, RISC5's own limitation: a plume passing beneath the water body). The
linked screen declares a full plane of eight spreading standard deviations (and the aquifer thickness
when finite), runs the modern bank first and hands its measured depth share to the legacy run as
`link.plumeDepthFraction`, so both methods warn. The plane quadrature first narrows each range to the
extent of the field, found by probes on geometric ladders (two per decade, eight decades) from the
centreline and the ends plus a uniform set, then integrates over that extent cut at y = 0; without that
a plume much narrower than the range falls between the nodes of a fixed number of panels and reads about
zero (a 2 m source and a 2,000 m reach lost 100 percent). Tests compare the result with a closed-form
oracle for plume widths of 1 m to 10 m over reaches up to 200 km. For
AT123D the full-width integral is exact in closed form (the lateral factor integrates to 1), which the
tests use as an oracle for the general adaptive quadrature over y and z of the point function.

### Transient well-mixed mixing

The box with storage:

    V dC/dt = W(t) + f Q_u C_u - (Q_mix + k V) C

With a loading that is piecewise linear between sample times t_i (W_i at t_i, slope s_i on the interval)
and lambda_w = (Q_mix + k V) / V, the exact solution on each interval, with tau = t - t_i and B = f Q_u C_u
the background loading, is

    C(t) = a + b tau + (C_i - a) exp(-lambda_w tau),
    b = s_i / (lambda_w V),   a = (W_i + B - s_i / lambda_w) / (lambda_w V)

starting from the steady state of the first sample's loading unless an initial concentration is given
(DEFAULT ruling 5). At steady state it equals
the legacy box. Its hydraulic residence time 1 / lambda_w is reported; for the R-8 lake it is 31.4 d.

### River receptor downstream of the reach

Downstream of the reach the whole river is taken as mixed and moves as plug flow with first-order decay:

    C_down(x_r, t) = C_full(t - x_r / U) exp(-k x_r / U),
    C_full = (Q_mix C + (1 - f) Q_u C_u) / (Q_u + Q_gw),   U = (Q_u + Q_gw) / A

with x_r the distance from the downstream end of the reach and A the river cross-section. With f = 1,
C_full is the box concentration. Before the first sample time shifted by the travel time the initial
steady state applies.

### Sediment

Equilibrium partitioning as in the legacy method, C_sed = Kd C_pw with the same Kd rule, but the pore water
is selectable (DEFAULT ruling 8): the flux-averaged discharging groundwater W / Q_gw (default: the bed where
the plume discharges), the centreline groundwater (the legacy reading), or the mixed surface water (a
depositional bed away from the discharge, the setting the equilibrium partitioning sediment benchmarks
address). For a chemical with a Koc the organic-carbon-normalized concentration C_sed / f_oc is reported
too, which is what a benchmark expressed per unit organic carbon is compared with.

## Forward functions and linearity (hand-off to M5)

Each model is exposed as a forward function from source to receptor concentration, so M5 can wrap it:

| Function | From, to | Linear? |
|---|---|---|
| `legacyBox` | C_gw (or a series) to C_sw | Affine: C_sw = a C_gw + b with b = f Q_u C_u / (Q_mix + k V); linear when the background is zero |
| `sedimentConcentration` (legacy), `modernSediment` | pore-water concentration to C_sed | Linear |
| `domenicoReachLength` | geometry to L_r | Independent of concentration |
| `bankPlaneDischarge` | M1 run to W(t) | Linear in the M1 source strength |
| `transientBox` | W(t) series to C(t) | Affine in W (linear with zero background) |
| `plugFlowDownstream` | C(t) to C_down(t) | Linear |
| `compareToCriteria` | concentration to ratio against each criterion | Linear |

So the surface water or sediment concentration at any time scales with the source strength; with a
background it is affine in it. Its maximum over time is the coefficient times the source only without a
background, and only while the source is a dissolved groundwater concentration or a loading proportional
to one.

### Source levels on paths that are not linear

The cleanup screen's surface water source level is the source concentration whose surface water peak
equals the target. Where the run is linear in a dissolved groundwater source it is the target over the
run's coefficient (peak over source), with no root find. The paths that are not linear are solved against
the forward run itself (wave V slice V2b), with the root find of the modeled cleanup (`cleanup.modeled-chains`,
`solveSourceLevel`: the verified linear shortcut, otherwise a bracket and Brent's method in the logarithm of
the source, `brent1973`), never from a table or an extrapolation:

- **Upstream background.** The source is the groundwater concentration (typed, or the held concentration c0
  of a linked transport run). The peak is the larger of the affine series, so the shortcut's check fails and
  Brent solves it. A target at or below what the background alone gives has no source level, and says so.
- **Plume fed by a vadose or saturated source screen.** The source is that screen's soil concentration F
  (kg/kg, printed in mg/kg). The screen's own run (VADSAT or layered; two-region or exponential) is repeated
  for each trial F, its loading steps feed the same aquifer, bank plane and surface water model, and the
  TPH rule of the screen is kept (scaled with the chemical, or held when the cleanup form holds it).
- **Soil source of the cleanup.** A vadose or saturated source sent to the cleanup screen is carried through
  the linked aquifer and bank of the surface water run (the same loading steps, the run's own transport,
  background and receptor); the method pair follows the surface water method (well-mixed with VADSAT and
  two-region, mass-discharge with the layered and exponential). A surface water run that is not linked has no
  aquifer to carry it and is not quantified.

The search ceiling is the solubility entered on the surface water run for a dissolved source, and the pure
substance (1 kg/kg, or the bound the TPH sets) for soil. A target the surface water does not reach at the
ceiling is shown as not reached, with the ceiling and the most the surface water gets to there; a source that
moves nothing to the surface water stays not quantified; a soil level above the soil saturation concentration
carries the free product warning.

Cost and exactness. A linked run costs seconds (the bank plane quadrature) and a fed one tens of seconds,
too dear to repeat in a root find. The aquifer response is exactly linear in the loading, so it is computed
once and a trial source is that response times the trial loading (for a fed chain, the sum of the responses
of the single loading steps, each computed once), sent through the same mixing, decay and sediment model.
The test suite holds this to the screen's full run (a forward run of each solved level through the screen's own `compute`) within 1e-8 of the target. Only when the step boundaries of
a trial differ from the reference (a depletion time that moves with F) is the trial a full run. The solves
run in the cleanup worker.

## Criteria comparison

Not a registered method (it is a comparison against data, like risk in M4, and has no science citation of
its own). For each chemical and each criterion the screen reports the ratio of the modelled concentration
to the criterion and flags ratios above 1. Ratios are never summed across chemicals.

- **Which concentration** (DEFAULT ruling 11): the peak of the surface water series is compared with every
  criterion. The criteria are averages over one hour (acute, criterion maximum concentration), four days
  (chronic, criterion continuous concentration) or a lifetime (human health), as defined by `stephan1985`
  for aquatic life; the model's time steps cannot resolve one hour or four days, and the peak is never
  lower than any of those averages, so the comparison is conservative.
- **Water type**: freshwater or saltwater criteria by the water body type the user sets; human health
  criteria "water plus organism" (a drinking water source) and "organism only" (fish consumption only).
- **Hardness-dependent metals** (DEFAULT ruling 12): for the metals listed in the aquatic life table's
  Appendix B (cadmium, chromium III, lead, nickel, silver, zinc), the dissolved criteria are computed from
  the published form, exp(m ln(hardness) + b) times the conversion factor of Appendix A (some conversion
  factors depend on hardness themselves, as the appendix states), at a user hardness, default 100 mg/L as
  CaCO3, the hardness at which the table prints its values. A hardness outside 25 to 400 mg/L is warned
  (`criteria.hardness-range`, a screening choice; slice D1 read the page and its appendices and found no
  stated range, so the bounds stay).
- **Dissolved metals**: the criteria are for the dissolved metal; the model's concentration is taken as all
  dissolved (`criteria.dissolved-assumed`, conservative).
- **Site-chemistry criteria** (copper, aluminum, ammonia, selenium and any row whose table note says the
  criterion depends on site water chemistry): "site-specific criterion, not computed"
  (`criteria.site-specific`); the user may enter a value, tagged `user`. The flag applies to a water type
  only where the table tabulates no value for it and the row's note covers it: aluminum has no saltwater
  criterion, so saltwater aluminum reads "no criterion", while ammonia (whose note names both) is
  site-specific in both.
- **pH-dependent criteria**: pentachlorophenol's freshwater values (19 and 15 ug/L) are one point of a
  function of pH, printed at pH 7.8. They are compared as printed and warned (`criteria.ph-dependent`);
  the pH function is not computed.
- **Sediment benchmarks**: dry-weight concentration against dry-weight benchmarks; a benchmark published at
  1 percent organic carbon is compared with C_sed times 0.01 / f_oc (`criteria.oc-normalized`).
- **No criterion**: "no criterion" (`criteria.not-available`), never a pass.
- **Exactly 1**: a ratio within 1e-12 of 1 is rounding from the unit conversions, not an exceedance, so a
  concentration equal to its criterion is not flagged.
- **Record shape** (`Criterion` in `surfaceWater/criteria.ts`, which D1 and D2 emit): chemical id, medium,
  endpoint, value and unit as published, a `hardness` equation record (slope, intercept, conversion factor
  constant or intercept plus slope times ln hardness), `siteSpecific`, `dissolved`, `waterType`, `ocBasis`
  and `source` (`database` or `user`; a user value replaces a site-specific one through `withUserValue`).

## Criteria data (plan for the data slices)

Public sources only; RISC5's Appendices M and N are not consulted for values. Checked on the official sites
on 2026-10-16.

| Source (reference key) | Current edition and location | Format | Licence or status |
|---|---|---|---|
| EPA National Recommended Water Quality Criteria, Aquatic Life Criteria Table (`epanrwqc`) | Web page last updated June 9, 2026: https://www.epa.gov/wqc/national-recommended-water-quality-criteria-aquatic-life-criteria-table. Columns: pollutant, CAS number (printed without hyphens, for example 7440666), freshwater CMC and CCC, saltwater CMC and CCC (ug/L), publication year (latest 2024), notes. Appendix A (conversion factors) and Appendix B (hardness parameters mA, bA, mC, bC) are tables on the same page | HTML only (no CSV, XLSX or PDF of the table); 85,901 bytes served on 2026-10-16 | U.S. government work, public domain in the United States; the page states no restriction |
| EPA National Recommended Water Quality Criteria, Human Health Criteria Table (`epanrwqchh`) | Web page last updated December 18, 2025: https://www.epa.gov/wqc/national-recommended-water-quality-criteria-human-health-criteria-table. Columns: pollutant, CAS number, water plus organism and organism only (ug/L; a few rows in other units, such as methylmercury in mg/kg fish tissue and asbestos in million fibres/L), publication year (latest 2019), notes. About 128 rows | HTML only; 113,915 bytes served on 2026-10-16 | Public domain, as above |
| EPA Region 4 Ecological Risk Assessment Supplemental Guidance, March 2018 Update (`epa2018r4era`) | Linked from https://www.epa.gov/risk/regional-ecological-risk-assessment-era-supplemental-guidance (page last updated March 3, 2026; no newer version listed): https://www.epa.gov/sites/default/files/2018-03/documents/era_regional_supplemental_guidance_report-march-2018_update.pdf. Table 2a (non-narcotic sediment values) and Table 2b (narcotic, many at 1 percent organic carbon), each with freshwater and marine/estuarine screening values (ESV) and refinement values (RSV); Table 2c (PAH Step 3a values). Units differ by section (ug/kg for organics, mg/kg for inorganics) | PDF, 98 pages, 1,284,613 bytes, SHA-256 `7c89bc7c5022595c9c09a79fc6726c173c3d2e7d2607186676e5dd52a42d0889` as served on 2026-10-16 (EPA's SEMS copy has different bytes and the same 98 pages) | U.S. government work, public domain |
| MacDonald, Ingersoll and Berger (2000) consensus-based TEC and PEC for freshwater sediment (`macdonald2000`) | Archives of Environmental Contamination and Toxicology 39(1):20-31, doi 10.1007/s002440010075. Tables 2 and 3 (journal pages 23 and 24) read from a complete copy of the article hosted at rais.ornl.gov and cross-checked value by value against a second complete copy in the EPA Superfund records (document 40168746) | Journal article, copies as PDF | **Shipped in wave V** (29 TEC and 28 PEC values; dibenz[a,h]anthracene has a TEC and no PEC). The article is Springer copyright and no redistribution licence was found, so the copies are not committed; only the values ship, as facts, with the citation. The earlier removal of values typed from recall (slice D2b) stands: none of these values is from recall |
| NOAA Screening Quick Reference Tables (`noaasquirts`) | Buchman 2008, NOAA OR&R Report 08-1; NOAA repository record https://repository.library.noaa.gov/view/noaa/9327 (rights "Public Domain") | PDF | **Not used as a data source.** NOAA's Office of Response and Restoration removed the cards from its site on April 4, 2024 as out of date, and the document allows redistribution only "in their entirety, without modification". Its TEC and PEC columns reproduce MacDonald et al. 2000 and may serve as a transcription cross-check |

Slice plan for the data (the RSL build in `packages/data/src/rsl/` is the model):

- **Raw files committed with a checksummed manifest** (DEFAULT ruling 14): `packages/data/raw/nrwqc/2026-10-16/`
  holds the two HTML pages as served, with `manifest.json` recording each URL, the retrieval date, the
  page's "last updated" date, size and SHA-256. The directory is named by the date of the first check (2026-10-16) because the pages
  are not numbered editions, and the manifest records the actual fetch date of the committed bytes
  (2026-10-17, same sizes as the first check); each page's last-updated date is its edition (DEFAULT ruling 15).
  `packages/data/raw/sediment/epa-r4-2018/` holds the Region 4 PDF and the transcribed CSVs of Tables 2a,
  2b and 2c. The international sets and MacDonald are under `packages/data/raw/` in their own directories (see "International criteria sets (wave V)"). The build never touches the network and fails on a checksum mismatch.
- **Reader**: the HTML tables (`id="datatable"` and the two appendix tables) are read in TypeScript at build
  time, with no new dependency if the markup allows (it is regular: one row per `<tr>`); if a parser is
  needed it is an exact-pinned, build-time-only devDependency recorded in DECISIONS.md as in slice D1 of
  M4. The PDF is not parsed in the build or in CI: a hand-run script (`extract-r4-sediment.ts`, needs
  `pdftotext`) writes the CSVs, which are committed and checksummed.
- **Generated JSON**: `packages/data/generated/nrwqc-2026-10-16/{aquatic,human-health,hardness}.json` and
  `packages/data/generated/sediment-2026-10-16/benchmarks.json`, each with an edition block (source
  reference key, URL, retrieval date, page date), a units block, and rows keyed by hyphenated CAS number
  (the NRWQC prints CAS numbers without hyphens; the build inserts them and checks the digit), so rows join
  the RSL `chemicals.json` by CAS. Rows that are not chemicals (colour, temperature, pH) are kept with
  `kind: "parameter"`; rows whose note makes the criterion site-specific carry `siteSpecific: true`;
  benchmarks normalized to organic carbon carry `ocBasis: 0.01`.
- **Gate**: `data:check` regenerates these outputs too.
- **Attribution wording**: `docs/ATTRIBUTIONS.md` lists the sources under data provenance with edition
  dates; the screen and exports carry, for the criteria, "Water quality criteria are from the U.S. EPA
  National Recommended Water Quality Criteria (aquatic life table, page dated June 9, 2026; human health
  table, page dated December 18, 2025; retrieved 2026-10-17), a work of the U.S. federal government in the
  public domain in the United States. Their use does not imply endorsement by EPA." and the equivalent for
  the Region 4 values.

## International criteria sets (wave V)

The criteria comparison on `#/surface-water` has a choice of set (DECISIONS, "Wave V scope", rulings 3 to 5).
The United States pair (EPA national recommended criteria and Region 4 sediment benchmarks) stays the default.
The choice is one of: the US pair, Canada (CCME), the European Union (the 2013 annex, `eu`), the European Union
as amended by Directive (EU) 2026/805 (`eu2026`, wave W), the United Kingdom, Australia and New Zealand (ANZG),
the MacDonald et al. (2000) consensus guidelines, or all of them side by side. A project saved with `eu` keeps
loading the 2013 set unchanged. The choice is
saved with the project as optional state (`criteriaSet`, written only when it is not the default), inside
the current format version.

| Set (reference key) | What it holds | Source and terms |
|---|---|---|
| Canada (`ccme2026summary`) | Aquatic life guidelines for freshwater and marine water, long-term and short-term (ug/L), and sediment guidelines for freshwater and marine sediment, the interim sediment quality guideline (ISQG) and the probable effect level (PEL) (ug/kg dry weight). 286 rows | The CCME online summary table, exported as CSV on 2026-10-23. No reuse licence is stated (all rights reserved), so the export is not committed; the transcribed CSV is |
| European Union (`eudir2008105`, `eudir201339`) | Annex I Part A environmental quality standards: annual average (AA-EQS) and maximum allowable concentration (MAC-EQS) for inland and other surface waters (ug/L). 180 rows | The consolidated text of Directive 2008/105/EC as amended by Directive 2013/39/EU (version of 2013-09-13), committed under Commission Decision 2011/833/EU. Kept as it was; the 2026 revision is the next row |
| European Union as amended by Directive (EU) 2026/805 (`eudir2008105`, `eudir201339`, `eudir2026805`) | Annex I Part A as replaced by the amending act (252 rows, 70 numbered entries, 25 of them new) and the six substances moved to Annex II Part C at unchanged values (20 rows), the same AA-EQS and MAC-EQS water columns (ug/L). 272 rows printed, 270 built (fluoranthene is printed twice, see below) | The consolidated text 2008L0105 of 2026-05-10 (CELEX 02008L0105-20260510), committed under Commission Decision 2011/833/EU, with the amending act (CELEX 32026L0805, OJ L series 2026/805, 20.4.2026) read for the dates. Standards as amended, which is not the same as in force at every date: the row note of a revised or new standard carries its date of application (revised EQS from 22 December 2027 with good status by 22 December 2033; entries 46 to 70 from 22 December 2027 with good status by 22 December 2039). The Annex II Part C rows say they take effect from the start of the following river basin management plan period. The text keeps no 2013 value in force until a date; it is silent, and so is the set |
| United Kingdom (`ukwfdstandards2015`) | The England and Wales standards directions of 2015: specific pollutants (long-term mean and short-term 95 percentile, fresh and salt water) and priority substances (AA-EQS and MAC-EQS). 263 rows | The Directions as made, committed under the Open Government Licence v3.0. No later version is served; none was found |
| Australia and New Zealand (`anzg2018`, `warne2018`) | Toxicant default guideline values for fresh and marine water at 99, 95, 90 and 80 percent species protection and a value of unknown protection level, with the reliability class and the year of origin. 841 rows | The department's master table workbook, retrieved 2026-10-23. No open licence mark, so the workbook is not committed; the transcribed CSV is. Sediment values are a separate ANZG document and are not in the set |
| MacDonald et al. (`macdonald2000`) | Consensus threshold effect concentration (TEC, 29 values) and probable effect concentration (PEC, 28 values) for freshwater sediment (mg/kg or ug/kg dry weight). 57 rows | Tables 2 and 3 of the article, from two complete copies compared value by value; Springer copyright, so only the values ship |

**Build** (`packages/data/src/criteria/`, `scripts/build-criteria.ts`; `data:check` regenerates it). The build
reads only committed files: the transcribed CSV of each set, pinned by size and SHA-256 in
`packages/data/raw/criteria-sets.manifest.json`, and the generated US files it joins to. It fails on a
mismatch and never touches the network. For a set whose source file is not committed the manifest records the
fetched file's SHA-256 as provenance. Output: `generated/criteria-2026-10-23/{ccme,eu,eu2026,uk,macdonald2000}.json`
and `anzg-fresh.json` and `anzg-salt.json` (the ANZG set is one file per water type so that no web chunk
passes 500 kB). A row keeps the value as printed (`printedValue`, `printedUnit`), the value in the engine's unit,
its basis (as printed and in words), the table, page or worksheet cell it was read from, and a shared note.

**Rules of the build.**

- Each source medium maps to the engine's: freshwater (EU and UK "inland surface waters") is `fresh`, marine
  (EU and UK "other surface waters", a term the annex does not define further) is `salt`; sediment rows carry
  the water type of their source column.
- Units are converted only at the build: ug/L and mg/L stay; ng/L becomes ug/L by exact decimal shift (ANZG
  dioxins); ug Sn/L (tributyltin) is ug/L with the note "expressed as tin"; ng TEQ/kg (CCME dioxins and furans)
  becomes ug/kg with the note "expressed as toxic equivalents". Sediment values are dry weight; none is organic
  carbon normalized.
- A value the source gives only as an equation or a site-chemistry rule (CCME cells printed Equation, Variable or
  Table: cadmium, copper, lead, nickel, zinc, manganese, aluminium, ammonia) is a row with no value, shown as
  "site-specific, not computed", because no equation is transcribed with the set. A cell with no number (a
  narrative guideline, a guidance framework, a range, a printed "No PEL derived") produces no row and is
  counted in the file's `omitted` block; two cells the source prints oddly (metribuzin "1,0", nitrite
  "60 NO2-N") are left out the same way and are reported, not interpreted.
- A value printed with a condition is compared at the value printed. For the UK copper (bioavailable), zinc
  (plus an ambient background) and manganese (bioavailable) that value is never higher than the standard that
  applies, so the comparison is conservative; the condition is shown with the value. Cadmium has one row per
  hardness class (EU and UK), and the ANZG zinc, nickel and nitrate values one row per labelled condition.
- Chemical identity: a printed CAS number is used when it is well formed (two ANZG numbers that a spreadsheet
  stored with a leading zero are restored, with the printed form kept); two printed numbers that fail the check
  digit (CCME imidacloprid, ANZG vanadium) are kept as printed and flagged. A group standard that prints several
  CAS numbers (the cyclodiene pesticides, heptachlor with its epoxide) has no single CAS number and takes a slug
  of its name. A row with no CAS number is joined by name to a chemical of the US files when the name matches
  exactly and the match is unique (then to the other sets), so one search finds a chemical in every set; six
  MacDonald names that the Region 4 file prints differently are tied to the Region 4 row by an alias table that
  the build checks against the name Region 4 itself prints. A name with no unique match keeps a slug of its name.

**Comparison.** The engine comparison is unchanged: the peak of each series against every criterion of the
chemical, one ratio per criterion, never summed, with the dissolved, hardness, pH, site-specific and organic
carbon rules above. The panel shows with each value its basis in words, the set, the water type and the
table it was read from, with the set's note in a disclosure. A set with no water values is not compared with
water; a chemical a set does not name says so. Choosing a set loads that set only, in a chunk of its own; the
default loads none of them.

**The revised EU set (wave W).** `eu2026` is built from `raw/eu-eqs-2026/eqs.csv` (extracted from the consolidated text
by `scripts/extract-eu-eqs-2026.ts`) in the same way as `eu`; the table of a row says `Annex I Part A table` or
`Annex II Part C table`. Water cells only: a biota or sediment EQS is not transcribed, and footnote 6 to Annex I Part A applies
that EQS instead of the water EQS where Part A prints one, so the water row of such a substance is not always the
standard applied; the water rows of entries 5, 15, 16, 17, 21, 28, 30, 34, 43, 44, 51 and 65 say so in their note.
Where an entry named by Article 3(1a)(iii) prints water cells equal to 2013 (5, 21, 30 and the PAH sub-rows
benzo(b)fluoranthene, benzo(k)fluoranthene and benzo(g,h,i)perylene), the note says the revision is to the biota
cell. The six Part C rows say their value is the same as the 2013 Part A value. Fluoranthene is printed twice with the same cells (entry 15, and a PAH sub-row of entry 28); the build keeps one row
per water type and basis whose note says "entries 15 and 28" (the two MAC rows; the AA rows are printed once, under
entry 15), so the ids ending `#2` of those two rows no longer exist. A saved project holds only the `criteriaSet`
key, never a row id, so none is affected. The same rule applies to every set (same chemical, medium, endpoint,
basis, unit and value under two entries); the scan of all six sets found only this case (the ANZG arsenic and
chromium duplicates carry different values and stay separate rows). PFOS (entry 35) prints no water cells and
prints "Covered by substance group 65 (Per- and polyfluoroalkyl substances (PFAS) – sum of 25)", the PFAS group
(entry 65, a sum expressed as PFOA equivalents). The build lists each such printed pointer in a small explicit
table (`GROUP_POINTERS` in `packages/data/src/criteria/build.ts`, written to the set file as `coveredBy`; PFOS is
the only one in any set) and fails if the group has no rows or the covered chemical has rows of its own. For a
covered chemical the comparison names the covering row and shows its value (0.0044 ug/L, annual average, as PFOA
equivalents) instead of saying the set does not name the chemical, computes no ratio (the value is a sum over the
listed substances weighted by relative potency, so the peak of one substance is not compared with it), and the CSV
and report carry the row with the status "covered by group". Glyphosate inland has two annual averages (drinking water abstraction and otherwise) and
silver other waters two salinity values; each is its own basis row. The two entries whose water cells differ from
2013 but are named in neither Article 3(1a)(iii) nor (iv) (hexachlorobenzene MAC, heptachlor) carry no date; Annex VI
of the Official Journal act was compared cell by cell and prints the same cells, so they ship as printed and say so.
A printed pair of CAS numbers for one substance (acetamiprid, imidacloprid, diclofenac: an alternate registry number
or salt) takes the first as the row's CAS number and keeps the pair in `casPrinted`, so imidacloprid joins on the valid
138261-41-3, not on the CCME misprint 13826-41-3. Triclosan,
which the 2013 set did not name, gives the UK triclosan row a CAS number by the name join, so that row's id changed.

**CSV and report.** The comparison is a CSV table of its own (`surface-water-criteria-<set>`), one row per
criterion and method with the criteria set, basis, medium, water type, source table, status, criterion value,
peak, ratio and note; the file name carries the data edition (`criteria-2026-10-23`, and the US editions when the
US pair is read). The report prints the same table for the chemical of the run, freshwater and saltwater alike
at the default hardness of 100 mg/L as CaCO3 (the report has no hardness or water type state), lists the chosen
set among the screen's inputs, and cites the references of the sets read in its methods statement; the US
criteria are cited only while the US pair is among the sets chosen.

## Where the manual is ambiguous, and what we chose

| Point | Reading adopted | Status |
|---|---|---|
| How the mixing fraction enters | On the upstream flow and the volume, and therefore on the decay term | Forced by Table R-8 (ruling 2) |
| The manual's adjusted-volume lake example | Its printed result is not reproduced by its own stated form (that form gives about 251 mg/L for its inputs); not used as a fixture | Recorded, not used |
| Whether the background concentration is scaled by the mixing fraction | Yes, f Q_u C_u, consistent with the flow it rides in (Table R-8 has zero background and cannot decide it) | DEFAULT ruling 17 |
| Depth at which the "centreline" groundwater concentration is read | Average over the discharge thickness from the water table | DEFAULT ruling 3 |
| Which groundwater concentration the sediment sees | The same centreline value as the loading (legacy); selectable in the modern method | RISC5 choice; DEFAULT ruling 8 |
| Kd for chemicals with both a Koc and a Kd | f_oc Koc | DEFAULT ruling 8 |
| Dispersivities for the reach width | RISC5's own (alpha_x = 0.1 x_s, alpha_y = alpha_x / 3), not the groundwater run's | RISC5 choice; DEFAULT ruling 4 |
| Origin of x_s | The downgradient source face (the Domenico convention and the M1 screen's geometry) | DEFAULT ruling 4 |

## Validity checks

RangeError (both methods): non-finite inputs; negative flows, concentrations, volumes, Kd, Koc or decay
rates; f outside (0, 1]; f_oc outside [0, 1]; a zero mixing volume with a nonzero decay; a bed gradient of
zero or less (a losing reach, legacy); K_b, d or L_r not positive where used; x_s at or upstream of the
downgradient source face; a lake without a volume or a river without a cross-section; a series with
unordered times.

Warnings (codes are part of the result; thresholds are screening choices, not rulings):

| Code | Method | Condition |
|---|---|---|
| `surfaceWater.loading-exceeds-source` | legacy, linked | the legacy loading exceeds the M1 source release rate at some time (the centreline-step width overstates the mass discharged) |
| `surfaceWater.discharge-flux-mismatch` | legacy, linked | K_b i_b differs from the M1 Darcy flux by more than a factor of 2 |
| `surfaceWater.domenico-reach` | legacy, linked | the reach length came from the steady Domenico width; the M1 Domenico validity warnings for that geometry are attached |
| `surfaceWater.quasi-steady` | legacy | the box's residence time V / (Q_mix + k V) exceeds 30 d, so ignoring storage may misstate a changing loading (compare with the modern method) |
| `surfaceWater.reach-truncates-plume` | modern | the reach holds less than 99 percent of the full-width discharge |
| `surfaceWater.plume-underflow` | both, linked | less than 95 percent of the full-depth discharge lies above the discharge thickness (the modern run measures it on the bank plane; the legacy run takes the share from the caller's M1 plane check, `link.plumeDepthFraction`) |
| `surfaceWater.low-dilution` | both | Q_gw exceeds f Q_u (groundwater supplies most of the mixing flow) |
| `surfaceWater.above-solubility` | both | C_gw or C_sw exceeds the chemical's solubility |
| `surfaceWater.sediment-not-quantified` | both | no Koc and no Kd for a chemical |
| `criteria.not-available` | comparison | no criterion or benchmark for a chemical and medium |
| `criteria.site-specific` | comparison | the criterion depends on site water chemistry and is not computed |
| `criteria.hardness-range` | comparison | hardness outside 25 to 400 mg/L as CaCO3 |
| `criteria.ph-dependent` | comparison | a criterion that is a function of pH (pentachlorophenol, freshwater) is compared at the pH its value is printed for (7.8) |
| `criteria.dissolved-assumed` | comparison | a dissolved-metal criterion compared with a total modelled concentration |
| `criteria.oc-normalized` | comparison | a benchmark at 1 percent organic carbon compared after normalization |

Assumptions listed on both methods (not warnings): the plume discharges into the water body (a gaining
reach); no degradation or sorption kinetics in the bed (equilibrium); no runoff, erosion, point
discharges or upstream sources other than the background; the mixing volume is uniformly mixed.

## Coupling to M1 and M4

- **M1 functions.** M1 produces point concentrations, not fluxes: `at123dConcentration(input, p)` and
  `at123dGrid` (`packages/engine/src/processes/groundwater/kernel.ts`, legacy AT123D, mass-loading
  source), `patchiConcentration` and `patchfConcentration` (`wexler.ts`, fixed-concentration patch),
  `domenicoConcentration` (`domenico.ts`), each also reachable through the registered methods
  `groundwater.at123d`, `groundwater.wexler1992` and `groundwater.domenico1987` (`index.ts`, `run` with a
  list of points at one time). The Darcy flux is the aquifer's n v (`At123dAquifer.velocity` times
  `porosity`; for AT123D the mass rate is concentration times Darcy flux times source area,
  `massRateFromConcentration`).
- **What M8 takes from them.** Legacy: the screen-averaged centreline concentration at the bank,
  C_gw(t) = trapezoid average over equally spaced points in [0, d] at (x_s, 0), at the sample times, the
  M1 well-screen rule (`wellScreenAverage`: end points at half weight, so a plume confined to the water
  table reads 1/8 of its top value with five points, not 1/5); `bankScreenAverage` in
  `surfaceWater/coupling.ts` applies it to the bank points (the M4 adapter `groundwaterBreakthrough` takes a
  plain mean of its own screen points and is a different reduction). Modern: the plane integral W(t) of q C over [-L_r/2, L_r/2] and
  [0, d] at x_s, computed by a new `bankPlaneDischarge(runPoint, plane, times)` in
  `surfaceWater/discharge.ts` that calls the point function. For a Wexler run the source is a held
  concentration, not a release rate, so the mass identities below apply to AT123D only; Wexler and Domenico
  runs are checked for internal consistency (the same discharge at two planes with no decay at steady
  state).
- **Geometry.** x_s is measured from the downgradient source face (for AT123D the plane sits at the box's
  downgradient face plus x_s), y from the centreline, z down from the water table, mapped to each M1
  method's own coordinates as the transport screen does.
- **Times.** The sample times are the transport time axis (365.25-day years); decay rates are entered per
  day and converted.
- **Output to M4.** The surface water series becomes the swimming EPC with no change to M4:
  `seriesEpc({ times, values }, 'surfaceWater.well-mixed')` (or the modern id, or the downstream receptor
  series) for `swimIngestion` and `swimDermal`, which accept series (`exposure/units.ts`, medium
  `surfaceWater`); an unlinked run gives a constant, `constantEpc`. Sediment has no M4 pathway (DEFAULT
  ruling 10) and fish ingestion is not added (DEFAULT ruling 9).

## Fixture plan

Fixtures go in `packages/engine/test/fixtures/surfaceWater/` with a README recording sources, pages and
every reading below.

1. **Table R-8 of the review (`arcadis2001`), legacy method.** River and lake cases, numeric values only
   (ROADMAP section 6). Inputs from the table: bed conductivity 10 m/d, f_oc 0.01, discharge thickness 5 m
   (the table's "depth of SW", read as d because it reproduces the printed mass flux), reach 100 m, bed
   gradient 0.05, river cross-section 5 m^2, lake volume 100,000 m^3, mixing fraction 1 (river) and 0.1
   (lake), upstream flow 180 m^3/d, decay 0 (river) and 0.005 /d (lake), benzene in groundwater 5 mg/L, zero
   background. The table lists no Koc; following the Table R-7 convention the RISC4 benzene value (Koc 59
   mL/g, `spence2001`) is a fixture input for this case only. Expected (engine value from those inputs):
   Q_gw 250 m^3/d; mass flux 1.25e6 mg/d (exact); river C_sw 2.91 mg/L (2.906977); lake 3.93 mg/L
   (3.930818); sediment 2.95 mg/kg (2.95, exact). Tolerance: half a unit in the last printed digit
   (DEFAULT ruling 16). The review reports exact agreement between RISC and its hand calculation, so this
   reproduces arithmetic; it is not evidence of model accuracy.
2. **Manual worked examples, Appendix L (numeric values only, as the Appendix J example is used in M6).**
   River: upstream 900 m^3/d, groundwater 100 m^3/d at 316 mg/L, decay 0.05 /d, reach 100 m, cross-section
   5 m^2: 30.8 mg/L (30.8293). Lake: volume 50,000 m^3, groundwater 100 m^3/d at 316 mg/L, upstream 100
   m^3/d, decay 0.05 /d, f = 1: 11.7 mg/L (11.7037). Half a unit in the last printed digit. The adjusted-
   volume lake example is not used (see the ambiguity table).
3. **Hand calculations** (constructed here; 1e-9 relative).
   - H1, transient box, step loading on the R-8 lake (Q_mix 268 m^3/d, V 10,000 m^3, k 0.005 /d, W 1.25e6
     mg/d held constant from t = 0, with the initial concentration given explicitly as 0 instead of the
     default initial steady state): residence time 31.4465409 d; C at 10, 30 and 100 d = 1.07074376,
     2.41667787 and 3.76735198 mg/L; the limit is the R-8 lake value.
   - H2, plug flow downstream: the R-8 river with k = 0.1 /d, receptor 1,000 m below the reach: U 86 m/d,
     travel time 11.627907 d, box 2.60416667 mg/L, downstream 0.814095196 mg/L.
   - H3, legacy reach length from the 5 percent Domenico width: (x_s, Y) = (100 m, 10 m): alpha_y
     3.33333333 m, L_r 127.188644 m; (50 m, 20 m): 69.2042413 m; (200 m, 5 m): 252.900937 m.
   - H4, modern sediment: Koc 59 L/kg, f_oc 0.02, pore water 0.05 mg/L: C_sed 0.059 mg/kg and 2.95 mg/kg
     of organic carbon.
4. **Mass balance with M1** (AT123D, 1e-6 relative, the M2 and M3 aquifer-mass tolerance).
   (a) Continuous source, no decay, full plane (all y; all z for a finite layer and for the no-flux infinite
   aquifer): W at late time equals the release rate. (b) A pulse with no decay: the time integral of W
   equals the released mass. (c) With decay, a point source: the steady ratio and the pulse time-integral
   ratio both equal (v / s) exp((v - s) x / (2 D_x)); for v = 0.1 m/d, alpha_L = 10 m (D_x = 1 m^2/d), x =
   100 m: 1 (lambda = 0), 0.338133023 (lambda = 0.001 /d, R = 1), 0.135051747 (lambda = 0.001 /d, R = 2).
   (d) The adaptive plane quadrature over all y equals the AT123D closed-form full-width integral.
5. **Box identities** (1e-9). (a) The transient box under constant loading tends to the legacy box. (b) Over
   any interval, the loading integral equals the change in stored mass plus the outflow and decay integrals.
   (c) With f = 1, C_full equals the box concentration. (d) Linearity: doubling C_gw (zero background)
   doubles C_sw, C_sed and C_down, legacy and modern. (e) A constant series through the M4 swimming pathways
   gives the same risk as the constant EPC (the M4 identity, now with origin `surfaceWater.*`).
6. **Criteria checks against the official tables.** (a) For each hardness-dependent metal, the Appendix A
   and B equation at 100 mg/L reproduces the aquatic life table's printed CMC and CCC to the table's two
   significant figures (zinc, for example, computes to 117.2 and 118.1 ug/L against the printed 120 and
   120). (b) A ratio of exactly 1 is not flagged, above 1 is. (c) A benchmark at 1 percent organic carbon
   with f_oc = 0.01 compares unchanged.

No public EPA worked example of a groundwater-to-surface-water mixing calculation with printed results was
found in stage 1; the fixtures above are the review table, the manual's examples, hand cases and
identities.

### Sediment benchmark data as built (slice D2, 2026-10-17)

`packages/data/generated/sediment-2026-10-16/benchmarks.json` holds one row per published value (811 rows:
Region 4 Tables 2a and 2b freshwater and marine screening and refinement values and Table 2c toxic unit
refinement values), each shaped like the engine `Criterion`
(`medium: "sediment"`, `endpoint`, `value`, `unit`, `ocBasis`, `waterType`) plus provenance (table, PDF page,
section, source letter, `basis`). Endpoints: `region4-{freshwater,marine}-{screening,refinement}`,
`region4-pah-toxic-unit-refinement`. A blank cell and the PAH refinement
"*" ("see Total below", Table 2b) produce no row. Rows are keyed by hyphenated CAS number; the group codes
the report prints in the CAS column (DDD, DDE, DDT, DDTR) become `code-<code>`, and a row with neither is a
slug of its name. Aquatic life and wildlife based values of one chemical are separate rows with a `variant`.

**Closed in wave V (was open item D2b).** The MacDonald et al. 2000 consensus TEC and PEC are built with the international sets (`packages/data/generated/criteria-2026-10-23/macdonald2000.json`), from the article itself and not from recall; see "International criteria sets (wave V)". The Region 4 rows that cite the Florida TEC and PEC (source letter b) stay as they are.

The unit of a Region 4 value is decided by the fill of its cell, the report's own unit marker: the notes
under Tables 2a and 2b (PDF pages 84 and 87) say a gray shaded cell is ug/kg dry weight, and the organic
section headings read "ug/kg @ 1% OC unless denoted by shading". The fill does not survive text extraction,
so `scripts/read-r4-shading.ts` reads it from the committed PDF rendered at 150 dpi into shade columns of the
CSVs. A gray cell is dry weight, an unshaded cell under a "1% OC" heading is at 1 percent organic carbon, and
the inorganic sections (mg/kg dry weight) are always dry weight. A row carries `basisInferred` only where the
report is ambiguous: the note of the cell's own source letter states the other unit, the cell is shaded tan
(five PAH totals, taken as dry weight), or the heading states no basis and the cell has no letter. What each
letter's note says is in the file's `sourceLetters` block (DECISIONS.md, "M8 slice D2"). Region 4 applies the
Step 2 values as ug/kg dry weight (section 6.2.3), which is the 1 percent organic carbon case of the
normalization above (f_oc 0.01); the rows keep the published basis so the criteria comparison can normalize.

## Slice plan (stages 2 and 3)

Each slice is sized for one implementation worker; tests are written first and must fail before the
implementation. Method ids to register: `surfaceWater.well-mixed` (legacy, citations `chapra1997`,
`domenico1987`, `ditoro1991`) and `surfaceWater.mass-discharge` (modern, citations `chapra1997`,
`ditoro1991`). The registering slice marks those references `used` (they are `planned` now; titles are
already verified, a test enforces both). The data references (`epanrwqc`, `epanrwqchh`, `epa2018r4era`,
`macdonald2000`) move to status `data` when their build lands (`epanrwqc`, `epanrwqchh` and `epa2018r4era` have, with D1 and D2; `macdonald2000` moved to `data` in wave V when its values landed); `stephan1985` is cited by this note only and
stays `planned`.

| Slice | Stage | Files to create or touch | Failing tests first | Depends on |
|---|---|---|---|---|
| D1 NRWQC criteria build | 2 | `packages/data/raw/nrwqc/2026-10-16/{aquatic-life.html,human-health.html,manifest.json}`; `packages/data/src/nrwqc/{types,parse,build,index}.ts`; `packages/data/scripts/{fetch-nrwqc,build-nrwqc}.ts`; `packages/data/generated/nrwqc-2026-10-16/*.json`; `packages/data/package.json` (scripts, exports); root `data:check`; Prettier ignore for raw and generated; `references.json` (`epanrwqc`, `epanrwqchh` to `data`) | `packages/data/test/nrwqc.test.ts`: checksum mismatch fails the build; hyphenated CAS with a valid check digit on every chemical row; zinc freshwater CMC and CCC 120, saltwater 90 and 81 ug/L; copper, aluminum, ammonia flagged site-specific; Appendix B has six metals; the hardness equation reproduces each printed value at 100 mg/L to two significant figures; generated output matches the committed JSON byte for byte | none |
| D2 Sediment benchmarks build | 2 | `packages/data/raw/sediment/epa-r4-2018/{report.pdf,table-2a.csv,table-2b.csv,table-2c.csv,manifest.json}`; `packages/data/scripts/{extract-r4-sediment,read-r4-shading,build-sediment}.ts`; `packages/data/src/sediment/{types,build,index}.ts`; `packages/data/generated/sediment-2026-10-16/benchmarks.json`; `references.json` (`epa2018r4era` to `data`) | `packages/data/test/sediment.test.ts`: checksums; every row has units and a basis (dry weight or 1 percent OC) taken from the cell shading, with spot checks of the shading against the pages; spot values read from the PDF pages (each CSV row carries its PDF page, the header the page range); after slice D2b, no MacDonald row, source block or raw directory | none |
| E1 Legacy kernels | 2 | `packages/engine/src/processes/surfaceWater/{units,legacy,reach,sediment,checks}.ts`; `packages/engine/test/fixtures/surfaceWater/{r8.json,manual-l4.json,README.md}` | `surfacewater-legacy.test.ts` (box, Darcy discharge, background, RangeErrors, H3 reach lengths to 1e-9, H4); `surfacewater-r8.test.ts` (fixtures 1 and 2) | none |
| E2 Modern kernels and M1 discharge | 2 | `surfaceWater/{discharge,transient,downstream,modern}.ts` | `surfacewater-transient.test.ts` (H1, box identities 5a to 5d); `surfacewater-discharge.test.ts` (mass balance 4a to 4d, reach and underflow fractions with their warnings); H2 | E1 (units, sediment) |
| E3 Coupling, criteria comparison, registration | 2 | `surfaceWater/{coupling,criteria,index}.ts`; `packages/engine/src/index.ts` (register two methods); `references.json` (`chapra1997`, `ditoro1991` to `used`) | `surfacewater-registry.test.ts` (ids, citations used, validity warnings surfaced); `surfacewater-coupling.test.ts` (legacy edge series equals the screen-averaged M1 value; the series feeds `runModernScenario` swimming pathways with origin `surfaceWater.*`; identity 5e); `surfacewater-criteria.test.ts` (ratios, peak rule, hardness equation from a parameter record, site-specific and missing criteria, OC normalization; fixture 6b and 6c). The engine defines the criterion record type; D1 and D2 emit that shape | E1, E2 |
| W1 Screen and run | 3 | `apps/web/src/surfaceWater/{SurfaceWaterScreen,inputs,compute.worker,charts}.tsx` and tests; `apps/web/src/App.tsx` (route `#/surface-water`, lazy-loaded); a feed from the transport screen like `transport/wellFeed.ts` | App routing test for `#/surface-water`; the screen opens on the R-8 river case and shows 2.91 mg/L and 2.95 mg/kg; linked to a transport run it draws C_sw and C_sed against time with the legacy and modern curves overlaid and the warnings listed; zero overflowing elements at 390x844 and 1280, light and dark (CDP check) | E3 |
| W2 Criteria panel and risk feed | 3 | `apps/web/src/surfaceWater/CriteriaPanel.tsx`, `apps/web/src/surfaceWater/criteriaDb.ts`; `apps/web/src/risk/` (accept a surface water feed for the swimming EPC) | the criteria JSON loads on demand as separate chunks; ratios and exceedance flags for a chosen chemical; hardness input changes the zinc criterion; feeding the risk screen sets the swimming EPC with origin `surfaceWater.well-mixed` and the series drives the swimming risk; overflow check as W1 | W1, D1, D2 |

D1, D2 and E1 can run in parallel; E2 follows E1; E3 follows E2; W1 follows E3; W2 follows W1 and both data
slices.

## References and verification (2026-10-16)

| Key | Verified against | Full text read |
|---|---|---|
| `domenico1987` | As in the groundwater note | As in the groundwater note |
| `chapra1997` | Library catalogue records (McGraw-Hill, New York, 1997, ISBN 0-07-011364-5) | No; the completely mixed and plug-flow mass balances are textbook material, cited without page numbers |
| `ditoro1991` | Crossref (Environmental Toxicology and Chemistry 10(12):1541-1583, doi 10.1002/etc.5620101203) | No, paywalled |
| `stephan1985` | EPA copy (cover: PB85-227049; the 2010 electronic version's cover prints the first author as "Stephen") | Cover and contents |
| `epanrwqc`, `epanrwqchh` | The two EPA pages (titles, last-updated dates, columns, appendices) | Yes, the pages |
| `epa2018r4era` | The EPA PDF (cover and table list) and the Regional ERA supplemental guidance page | Cover, table list, section 6.2 headings |
| `macdonald2000` | Crossref (authors, title, volume, pages, doi), and the two complete copies of the article read in wave V (Tables 2 and 3) | Yes, the tables (wave V); the reference is `data` |
| `macdonald2000copy`, `macdonald2000epacopy` | The two copies of the article (rais.ornl.gov and EPA Superfund record 40168746) | Yes, Tables 2 and 3 |
| `ccme2026summary`, `eudir2008105`, `eudir201339`, `eudir2026805`, `ukwfdstandards2015`, `anzg2018`, `warne2018` | The documents named by each entry, fetched 2026-10-23 (`warne2018` only by the title the ANZG table prints; its venue and URL are not recorded) | Yes, the tables; see "International criteria sets (wave V)" |
| `long1995` | Crossref (Environmental Management 19(1):81-97, doi 10.1007/BF02472006) | No; deferred benchmark source |
| `noaasquirts` | NOAA repository record (Buchman 2008, OR&R Report 08-1, public domain) and the OR&R page recording the removal on April 4, 2024 | Yes (introduction and terms of use) |
| `arcadis2001`, `spence2001` | As in the vadose note; Table R-8 read in the RISC5 guide | Fixture use only |
