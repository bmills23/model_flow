# Saturated soil source (methods note for M3)

Equations implemented in `packages/engine/src/processes/saturatedSource/`, in our own words, derived
from the primary publications cited by reference key (see `docs/ATTRIBUTIONS.md` for full entries). The
RISC5 manual was used only as a map of which choices RISC5 made; none of its text, figures or tables is
reproduced and its equation labels are not used here. Where a choice is RISC5's rather than a paper's, it
is marked "RISC5 choice" and becomes the method's `risc5Choice` metadata.

Status: methods note, reference check and fixture plan done 2026-10-16; engine and coupling built 2026-10-16
(`packages/engine/src/processes/saturatedSource/`). Screen built 2026-10-16 (`apps/web/src/saturated/`, route `#/saturated`).

## What the process is

A soil source sits at the water table: part of it may lie above the water table, part below, and the
water table may move seasonally. The process turns a measured total soil concentration and the source
dimensions into a mass release rate into the aquifer, which the groundwater process (M1) then
transports. Two flushing mechanisms remove the chemical:

- **Region 1, above the water table:** infiltration percolates down through it and carries pore water
  of the region's equilibrium concentration straight into the aquifer below.
- **Region 2, below the water table:** groundwater flows horizontally through it and leaves with the
  region's equilibrium concentration.

The source is one well-mixed pool of chemical mass shared by both regions. The process is not linked to
the vadose process (M2): there is no unsaturated transport path, because the source rests on the water
table.

## Scope of M3

| Option (ROADMAP section 3, row C) | M3? | Reason |
|---|---|---|
| Legacy two-region source, constant release until the mass is exhausted, Raoult's law and equilibrium partitioning | Yes | The legacy default for the process |
| Water-table fluctuation (minimum saturated thickness, fluctuation height, fraction of the year at high water) | Yes, on both methods | Named by the M3 row; the annual-mean form is the default and a seasonal schedule is an option (see "Water-table fluctuation") |
| Modern: mass-consistent exponential source decline | Yes | Named by the M3 row; it is the first-order source of `newell1996` and the unit-exponent member of the `falta2005` source-strength family |
| Transport of the released mass (AT123D, Wexler, Domenico) | Reused from M1 | The coupling turns the release into M1 loading; no new transport code |
| General power-law exponent (`falta2005`, REMChlor lineage) | No; with the groundwater power-law option (ROADMAP row B, modern option 4) | The step and the exponential are the two members RISC5 parity and the M3 row ask for. The API takes the exponent as a field so a later milestone can open it up without a new method shape |
| Volatilization loss from region 1, and region 1 as a source for vapour models | No; M6 | Not part of the source mass balance the legacy model describes; it needs the M6 vapour machinery. Omitting it overstates the groundwater load slightly (conservative) |
| Mixture-wide residual-phase test (sum over every component of the mixture, `feenstra1991`) and multicomponent dissolution with changing mole fractions | No | The user enters a few chemicals of concern, not the whole mixture, so the per-chemical test is the one that can be evaluated; the TPH mass is held constant, as in M2 |
| Back-calculation of soil cleanup levels for this source | No; M5 | Belongs with cleanup levels |

## Units

SI inside the engine: metres, seconds, kilograms; concentrations in kg/m^3 (numerically equal to g/L);
Koc in m^3/kg; Henry's constant dimensionless; rates in 1/s. Conversions happen only at the boundary,
using `numerics/units`:

| Quantity | Unit at the boundary | Engine unit |
|---|---|---|
| Infiltration q | cm/yr (as on the vadose screen) | m/s (Darcy flux) |
| Hydraulic conductivity K | m/d | m/s |
| Hydraulic gradient i | m/m | m/m |
| Source length, width, total thickness, minimum saturated thickness, fluctuation height | m | m |
| Fraction of the year at high water | fraction | fraction |
| Bulk density | g/cm^3 | kg/m^3 |
| Soil concentration (chemical, TPH) | mg/kg | kg/kg |
| Molar masses | g/mol | kg/mol |
| Solubility, pore-water concentration | mg/L | kg/m^3 |
| Koc | mL/g (= L/kg) | m^3/kg |
| Optional source decay rate (modern only) | 1/d | 1/s |
| Release rate | kg/d | kg/s |
| Masses | kg | kg |
| Time | yr (365.25 d), d | s |

## Notation

Source: plan length L and width W (plan area A_h = L W), total thickness H_s, minimum saturated thickness
h_min, fluctuation height dh, fraction of the year at high water f. Soil (one material for the source and
the aquifer, RISC5 choice): porosity phi, bulk density rho_b, organic carbon fraction f_oc, residual
water content theta_r and van Genuchten n (region 1 moisture only). Aquifer: hydraulic conductivity K
and gradient i, Darcy flux U = K i. Infiltration q. Chemical: total soil concentration F, solubility S,
molar mass M, Henry's constant H, Koc; optional TPH mass fraction F_T and TPH molar mass M_T. K_d =
Koc f_oc.

## Geometry and the water table

The water table spends a fraction 1 - f of each year low and f high. The saturated thickness of the
source is

    h_lo = h_min                      (low water)
    h_hi = min(h_min + dh, H_s)       (high water)

and the unsaturated thickness is H_s - h at either level. When h_min + dh exceeds H_s the water table
rises above the top of the source at high water; the engine caps h_hi at H_s and reports it
(`saturatedSource.fluctuation-capped`). Inputs with h_min > H_s are a RangeError. h_min = 0 with dh = 0
is a source wholly above the water table (region 1 only); h_min = H_s is a source wholly submerged
(region 2 only).

RISC5 choice: the fluctuation changes only the partition of the source between the two regions; it does
not change the aquifer's flow field, and the water table used by the transport model stays fixed.

## Legacy method: two-region source, constant until exhausted (`saturatedSource.two-region`)

Citations: `feenstra1991`, `epa1996ssg`, `brookscorey1964`, `lenhard1989`, plus
`vangenuchten1980` and `mualem1976` when the van Genuchten-Mualem moisture option is selected (stage 2
lists them on the method because the option is selectable on it).

### Initial mass

The pool holds

    M0 = F rho_b H_s L W

of the chemical (kg). F is measured on the whole source, so one mass serves both regions.

### Region pore-water concentrations

Equilibrium partitioning between the sorbed, dissolved and vapour phases with no separate phase present
(the soil-water partition equation of `epa1996ssg`, with K_d = Koc f_oc) gives the pore-water
concentration in a region with water content theta and air-filled porosity theta_a:

    C_eq = F rho_b / (rho_b K_d + theta + theta_a H)

- Region 2 is saturated: theta = phi, theta_a = 0, so C_eq,2 = F rho_b / (rho_b K_d + phi).
- Region 1 carries infiltration under a unit hydraulic gradient. Its water content theta_1 follows from
  q = K k_r(S_e) exactly as in the vadose note (`unitGradientMoisture`, Brooks-Corey with the Lenhard
  conversion from n by default, van Genuchten-Mualem selectable), with theta_s = phi and Ks = K.
  theta_a,1 = phi - theta_1.

Residual-phase test, per chemical and per region (`feenstra1991` assess separate phase from soil
concentrations by comparing the partitioning prediction with the solubility limit; the RISC5 choice is
to apply the comparison to each chemical alone). Raoult's law for an ideal mixture sets the effective
solubility to x S, with x the chemical's mole fraction in the hydrocarbon (the ideal-mixture form is the RISC5
choice and the M2 vadose source's; no reference is cited for it, see the references table):

    x = (F / M) / (F_T / M_T)     (x = 1 when no TPH is entered)

If C_eq,k > x S a separate phase is present in region k and its pore water is held at C_k = x S;
otherwise C_k = C_eq,k. This is the same test and the same helpers (`equilibriumPoreWater`,
`residualPhaseTest`) as the vadose source. The soil concentration at which the two branches meet is the
soil saturation limit of `epa1996ssg`:

    F_sat,k = x S (rho_b K_d + theta + theta_a H) / rho_b

which the engine exposes (`soilSaturationConcentration`) because it is the quantity the published
fixture checks.

### Release rate in each region

Region 1 loses mass at the rate infiltration carries pore water out of its base, region 2 at the rate
groundwater carries pore water out of its downgradient face:

    Q_1(h) = q A_h C_1      if H_s - h > 0, else 0
    Q_2(h) = U W h C_2

Q_2 is the same product as M1's `massRateFromConcentration(C_2, U, W h)`, and the engine computes it with
that function. RISC5 choice: the region 1 leachate reaches the aquifer immediately and undiluted (no
transit time, no attenuation), and its rate does not depend on the thickness of region 1, only on
whether region 1 exists. When q = 0, region 1 contributes nothing and its moisture is not computed.

RISC5 choice: when q exceeds K, q is reduced to K for both the moisture and Q_1 and region 1 is
saturated; the legacy method reports it (`saturatedSource.infiltration-clamped`), as the vadose legacy
method does.

### Water-table fluctuation

The rate at each water level is Q(h) = Q_1(h) + Q_2(h). Two schedules:

- `annual-mean` (default, DEFAULT ruling, DECISIONS.md 2026-10-16): a constant rate
  Qbar = (1 - f) Q(h_lo) + f Q(h_hi). The mass removed per year is exactly that of the seasonal schedule;
  only its timing inside each year is averaged.
- `seasonal`: Q(h_hi) during the first fraction f of every year and Q(h_lo) for the rest. The phase
  (high water first) is a convention; within-year timing matters only for receptors with travel times
  shorter than a year.

### Depletion: constant until exhausted

RISC5 choice: each region's concentration stays at its initial value until the pool is empty, then the
release stops. With the annual-mean schedule

    release rate = Qbar for 0 <= t < t_d,   0 afterwards,   t_d = M0 / Qbar

and with the seasonal schedule the release stops at the instant the cumulative release reaches M0. The
remaining mass is M0 minus the cumulative release. Qbar = 0 (no infiltration and no submerged thickness,
or zero gradient and no infiltration) means no release (`saturatedSource.no-release`), and t_d is
infinite.

This is the zero-exponent member of the source-strength family of `falta2005`, in which the source
concentration is C0 (M / M0)^Gamma: Gamma = 0 keeps the concentration constant until the mass is gone.
When no separate phase is present the constant concentration contradicts the partitioning it was
computed from: with half of the mass gone the pore water should be at half its initial value. The
legacy method reproduces RISC5 and warns (`saturatedSource.constant-dissolved-source`) whenever a
contributing region holds no separate phase.

## Modern method: mass-consistent exponential decline (`saturatedSource.exponential`)

Citations: those of the legacy method plus `newell1996` and `falta2005`.

The well-mixed pool keeps its regions' pore water in proportion to the remaining mass m(t):

- with no separate phase, C_k = C_eq,k m / M0, because C_eq is linear in F;
- with a separate phase and the TPH mass held constant (as in the vadose source), x is proportional to
  the remaining moles of the chemical, so C_k = x S m / M0 as well.

Both cases scale the same way, so the outcome of the residual-phase test does not change as the source
depletes, and the whole release is proportional to m:

    dm/dt = -(Q(h(t)) / M0) m - lambda_s m

with lambda_s an optional first-order source decay (default 0; decayed mass is not delivered). With the
annual-mean schedule this gives m(t) = M0 exp(-gamma t), gamma = Qbar / M0 + lambda_s, and the release
rate (Qbar / M0) m(t). The cumulative delivered mass is (Qbar / (M0 gamma)) M0 (1 - exp(-gamma t)),
which tends to M0 when lambda_s = 0. The initial rate equals the legacy rate, so the two methods start
together and release the same total mass; the legacy method front-loads it (by t_d the legacy source has
released everything, the exponential source 1 - 1/e of it). The seasonal schedule is piecewise
exponential with rate constant Q(h_hi)/M0 + lambda_s or Q(h_lo)/M0 + lambda_s in each part of the year,
evaluated in closed form segment by segment.

This is the first-order source of `newell1996` (its source half-life ln 2 M0 / (Q C0) is ln 2 / gamma
here, obtained by the same mass balance with concentration proportional to mass) and the unit-exponent
member (Gamma = 1) of `falta2005`, whose abstract notes that with discharge linear in source mass the
plume responds linearly to source depletion. The constant-TPH assumption understates the decline by at
most F / F_T, reported as in the vadose process (`saturatedSource.tph-constant-approximation`, the same
threshold of 0.1).

Infiltration at or above K is a RangeError in the modern method (no clamp), as in the vadose modern
method.

## Where the manual is ambiguous, and what we chose

| Point | Reading adopted | Status |
|---|---|---|
| The region release rates are labelled as fluxes per unit area per day, but their defining products (rate times area times concentration) are mass per time | Mass rates (kg/s inside the engine) | Unit typo; no choice needed |
| The region 1 concentration is described as the concentration "at the water table" | Region 1's own equilibrium pore-water concentration, delivered without transit or attenuation | Screening choice |
| How the fluctuation enters: rates said to shift during the year, but also used to apportion mass loss | Annual-mean rate by default, seasonal schedule optional | DEFAULT ruling 1 |
| Region 1 water content: the partitioning needs water-filled and air-filled porosity of the unsaturated soil, but the data list for this model has no residual water content or n; the manual's input chapter says n is used here | Unit-gradient moisture from the M2 helpers with theta_r and n entered for the source soil and Ks = the aquifer K | DEFAULT ruling 2 |
| Where the released mass enters the aquifer for the transport model | A box of plan L by W from the water table down to h_hi; both regions load into it (see "Coupling") | DEFAULT ruling 3 |
| One pool or one pool per region | One pool: the soil concentration is measured on the whole source, and the fluctuating water table moves soil between regions | Screening choice |
| One porosity in the data list | Used both as the saturated water content for partitioning and as the transport porosity in M1 | RISC5 choice |
| Source decay | None in the legacy method (the data list's degradation rate is the dissolved-phase rate used by M1); optional lambda_s in the modern method only | Screening choice |
| Region 1 thickness | Matters only through whether it is positive (Q_1 does not scale with it) | RISC5 choice, reproduced; noted in the method's assumptions |
| Volatilization from region 1 | Not a loss term | RISC5 choice; M6 |

## Validity checks

RangeError (both methods): non-finite inputs; phi outside (0, 1]; rho_b <= 0; f_oc, Koc, H or F
negative; S or M not positive; F greater than F_T; a TPH mole fraction above 1; L, W or H_s <= 0; h_min
outside [0, H_s]; dh < 0; f outside [0, 1]; q < 0; K <= 0; i < 0; theta_r outside [0, phi); n <= 1;
lambda_s < 0 (modern); negative or NaN time; a zero region 1 water content when q > 0 (the M2 helper's
error).

Warnings (codes are part of the result):

| Code | Method | Condition |
|---|---|---|
| `saturatedSource.residual-phase` | both | a separate phase is present in a region; reports the region, x, x S and C_eq |
| `saturatedSource.tph-constant-approximation` | both | F / F_T > 0.1 (same screening threshold as the vadose process) |
| `saturatedSource.constant-dissolved-source` | legacy | a contributing region has no separate phase, so a constant concentration is not mass-consistent |
| `saturatedSource.fluctuation-capped` | both | h_min + dh > H_s; the high-water saturated thickness is capped at H_s |
| `saturatedSource.infiltration-clamped` | legacy | q > K; q reduced to K and region 1 saturated (RISC5 choice) |
| `saturatedSource.no-release` | both | the time-weighted mean release rate Qbar is zero |

Assumptions listed on both methods (not warnings): one homogeneous soil for the source and the aquifer;
equilibrium partitioning and instantaneous dissolution; no NAPL migration; immediate delivery of region
1 leachate; the water table fluctuation does not change the flow field; the source starts at t = 0 with
its measured concentration.

## Coupling to the groundwater process (M1)

Output of both methods: the release schedule in closed form, exposing the cumulative delivered mass
`delivered(t)` exactly, the depletion time (legacy; infinite when Qbar = 0), the remaining mass, the
region concentrations and rates at both water levels, and the mass budget (initial = remaining +
delivered + decayed in the source).

What carries over from the vadose coupling unchanged:

- The `LoadingStep` list as the hand-off to the AT123D-class kernel, and `ConcentrationStep` lists for
  Wexler and Domenico through the existing `toConcentrationSteps` (rate / (U times cross-section)) and the
  screen's `ui.source-basis` warning.
- `loadedMass` and the mass-conservation contract: the steps carry exactly the mass the source delivers
  in each step, so the loaded mass equals `delivered(tEnd)` to 1e-12 relative.
- The no-flux water table: the source touches the water table, so an infinitely deep aquifer must use
  `top: 'no-flux'` (the default) and `top: 'unbounded'` is a RangeError, as in `waterTableSource`.
- Loading after tEnd is not needed, so the list stops at tEnd.

What does not fit, and replaces it:

- **No flux series.** The vadose coupling cuts a sampled flux per unit area (`fluxToLoadingSteps`) and
  interpolates between samples. The saturated source is a mass rate with a closed-form cumulative, and
  the legacy rate has a jump at t_d that an interpolant would smear. A new `releaseToLoadingSteps(result,
  tEnd, stepLength)` builds steps whose boundaries always include t_d and the seasonal switch times that
  fall before tEnd: for the legacy method the steps are the natural constant segments (stepLength is not
  needed, one step for the annual-mean schedule); for the modern method each natural segment is cut
  into steps no longer than stepLength. Every step's rate is its exact delivered mass over its length.
- **Source geometry.** The vadose load enters on a zero-thickness patch at the water table. The
  saturated source is a box: plan L by W, from the water table down to h_hi (DEFAULT ruling 3), with
  both regions' release distributed over it. In engine coordinates it is z in [-h_hi, 0] for an
  infinitely deep aquifer and z in [b - h_hi, b] for a layer of thickness b; h_hi greater than b is a
  RangeError. When h_hi = 0 (a source wholly above the water table) the box collapses to the
  `waterTableSource` patch. The groundwater screen does not follow this for AT123D: it uses a box of
  the mixing depth typed there (as the vadose screen does and as it does for the Wexler and Domenico
  cross-section), because the screen needs a finite thickness the user chooses; it says so in its
  feed note (DECISIONS.md, 2026-10-16, stage 3).
- **Cross-section for Wexler and Domenico.** The held concentration uses the cross-section W h_hi. With
  h_hi = 0 there is no cross-section; the screen then uses its user-entered mixing depth, as the vadose
  screen does, and says so.
- **Identity with the M1 dissolved-phase source.** A wholly submerged source with no infiltration and no
  fluctuation, holding a separate phase, releases exactly massRateFromConcentration(x S, U, W H_s) until
  t_d, so its Wexler held concentration is x S: the legacy saturated source is the M1 constant source
  switched off at t_d.

## Fixture plan

Fixtures live in `packages/engine/test/fixtures/saturatedSource/` with a README recording sources,
pages and every interpretation below. No manual worked example and no Appendix R table covers this
model (the review's tables cover the vapour models, vadose leaching, surface water and direct
pathways), so the fixtures are one published table for the partitioning, a published derivation and
example for the depletion, analytic identities, and hand calculations.

1. **Soil saturation limits, `epa1996ssg` Table 3-A (page 29).** The published Csat of six chemicals
   with the document's default soil (rho_b 1.5 kg/L, f_oc 0.006, theta_w 0.15, theta_a 0.28; equation
   9 and its parameter table) is F_sat with x = 1 and those moisture values. Chemical inputs: S and H'
   from Table 36, Koc from the calculated column of Table 39 (the measured column does not reproduce
   Table 3-A; this reading is recorded in the README). Expected, printed (engine value from those
   inputs): toluene 650 (653.7), ethylbenzene 400 (395.2), styrene 1500 (1481), 1,1,1-trichloroethane
   1200 (1186), 1,2-dichlorobenzene 600 (595.4), 1,4-dichlorobenzene 280 (282.0) mg/kg. Tolerance: half a
   unit in the second printed significant figure (the table prints two). Ethylbenzene and
   1,2-dichlorobenzene sit within 0.4 mg/kg of the band edge, so input digits must be exactly those
   printed.
2. **BIOSCREEN source decay, `newell1996`.** Appendix A.3 derives k_s = Q C0 / M0 from a mass balance;
   the test asserts that the modern method's gamma equals Qbar / M0 and its half-life equals ln 2 M0 /
   (Q C0) for the same inputs (1e-12 relative). The soluble-mass example in the "Soluble Mass in NAPL,
   Soil" entry (zones of 100, 220 and 400 ft^2, 20 ft deep, 1.7 kg/L, at 600, 50 and 10 mg/kg) checks the
   initial-mass equation: 58, 11 and 4 kg, each within 0.5 kg, with 1 ft = 0.3048 m exactly. The
   printed total of 73 kg is the sum of the rounded zone masses (unrounded 72.2 kg) and is not used.
3. **Source-strength functions, `falta2005`.** Legacy: cumulative release min(Qbar t, M0) and
   concentration ratio (m / M0)^0 = 1 until t_d; modern: m = M0 exp(-gamma t) and C / C0 = m / M0 at
   sample times; both to 1e-12 relative.
4. **Hand calculations** (constructed here; arithmetic tolerance 1e-9 relative). Common inputs: L = W =
   10 m, H_s = 2 m, phi 0.30, rho_b 1.7 g/cm^3, f_oc 0.002, K 5 m/d, i 0.01, q 20 cm/yr, theta_r 0.05,
   n 1.5 (Brooks-Corey with the Lenhard conversion), chemical M 78 g/mol, S 1750 mg/L, H 0.228, Koc
   59 mL/g (the benzene values of the M2 Table R-7 fixture), years of 365.25 d.
   - Case A, separate phase with fluctuation: F 50 mg/kg, F_T 5000 mg/kg, M_T 100 g/mol, h_min 0.5 m,
     dh 1.0 m, f 0.25. Expected: lambda 0.4375, S_e 0.29985487, theta_1 0.12496372; x 0.012820513,
     x S 22.435897 mg/L; C_eq,1 232.57596 and C_eq,2 169.79624 mg/L (both regions hold a separate phase);
     M0 17.000 kg; Q_1 1.2285228e-3, Q_2 at low water 5.6089744e-3 and at high water 1.6826923e-2 kg/d;
     Qbar 9.6419843e-3 kg/d; legacy t_d 1763.1226 d (annual mean) and 1737.2300 d (seasonal); modern
     gamma 0.20716087 1/yr, m(10 yr)/M0 0.12598295, delivered by 10 yr 14.858290 kg.
   - Case B, no separate phase, steady water table: F 100 mg/kg, no TPH, h_min 1.0 m, dh 0. Expected:
     C_1 465.15193 and C_2 339.59249 mg/L; M0 34.000 kg; Q_1 2.5470331e-2 and Q_2 0.16979624 kg/d; Qbar
     0.19526658 kg/d; legacy t_d 174.12094 d with the `constant-dissolved-source` warning; modern gamma
     2.0976799 1/yr.
5. **Cross-process identities.** (a) The M1 dissolved-phase identity in "Coupling" (rates equal to
   1e-12, AT123D concentrations equal to 1e-12 before t_d). (b) A modern source wholly above the water
   table (h_min = dh = 0) has the same depletion rate as the vadose legacy source for the same soil with
   no vapour loss (`sourceDepletionRate`, 1e-12). (c) With zero decay in both processes the aquifer mass
   equals the loaded mass within 1e-6, for a finite layer and for the no-flux infinite aquifer (the M2
   coupling tolerance). (d) Annual-mean and seasonal schedules deliver equal mass at every year end
   before depletion (1e-12). (e) Halving the modern step length changes a downstream receptor value by
   less than 0.1 percent (case A at 10 yr, as in M2).

## References and verification (2026-10-16)

| Key | Verified against | Full text read |
|---|---|---|
| `newell1996` | The manual (EPA NEPIS copy) | Yes (cover, source half-life and soluble mass entries, Appendix A.3) |
| `epa1996ssg` | The document (EPA SEMS copy) | Yes (section 2.4.4, equations 9 and 22, Table 3-A, Tables 36 and 39) |
| `feenstra1991` | Crossref, with abstract | No, paywalled |
| `falta2005` | Crossref and Europe PMC (PMID 16019108), with abstract | No, paywalled |
| `cline1991` | Crossref | No; no abstract available. Not cited: its support for the ideal Raoult's law form could not be confirmed, so stage 2 dropped it from the method citations (DECISIONS.md, 2026-10-16 M3 engine) |
| `brookscorey1964`, `lenhard1989`, `vangenuchten1980`, `mualem1976` | As in the vadose note | As in the vadose note |

`feenstra1991` and `falta2005` became `used` when the two methods were registered; `cline1991` stays `planned` and uncited. The
appendix's own citations (Galya 1987, Gelhar et al. 1985, API 1987) are transport and dispersivity
sources already used by M1.
