# Shower, irrigation and particulates (methods note for M7)

Equations to be implemented in `packages/engine/src/processes/shower/`,
`packages/engine/src/processes/irrigation/` and `packages/engine/src/processes/particulate/`, in our own
words, derived from the primary publications and agency documents cited by reference key (see
`docs/ATTRIBUTIONS.md` for full entries). The RISC5 manual (Appendices G, H and I) was used only as a map
of which choices RISC5 made; none of its text, figures or tables is reproduced and its equation labels
are not used here. Where a choice is RISC5's rather than a paper's, it is marked "RISC5 choice" and
becomes the method's `risc5Choice` metadata.

Status: stage 1 (scope, equations, citations, validity checks, coupling, fixture plan and slice plan)
written 2026-10-18. No engine, data or web code is written in this stage. The scope calls below are the
DEFAULT rulings recorded in `docs/DECISIONS.md` (2026-10-18, M7 shower, irrigation and particulates
scope, stage 1), open to Bryan's overturn. Several equations below are written from the two-resistance
theory and the agency documents as far as they were read; each place where the primary paper must still
be read before code is written is marked "verify in S0".

## What the processes are

- **Shower volatilization.** Water from the tap (the M1 receptor well, or a constant) sprays through the
  shower; volatile chemicals cross the droplet surface into the stall or bathroom air, which the
  receptor breathes for the shower time (M4 pathway 5, `showerInhalation`).
- **Household water volatilization.** The RSL tap water level adds an inhalation term for volatiles in
  whole-house air, a fixed transfer factor from water to indoor air (the Andelman factor). It is the
  modern counterpart of a stall model for screening comparisons.
- **Sprinkler volatilization and irrigation.** Contaminated well water used only for irrigation (the
  potable supply is municipal) reaches people through spray inhalation, incidental ingestion and dermal
  contact (children in a sprinkler, an adult gardener, a pool filled from the well) and through garden
  vegetables (M9).
- **Particulate emissions.** Wind lifts respirable particles (PM10) from bare contaminated surface soil;
  the chemical sorbed on them is inhaled outdoors. Relevant mainly for nonvolatile organics and metals.

## Scope of M7

| Method id | Kind | What it computes | Citation |
|---|---|---|---|
| `shower.fc-1986` | legacy | stall air concentration from the tap water concentration, stagnant stall, two-resistance droplet transfer | `foster1986` (verify in S0), RISC5 choices marked |
| `shower.little-1992` | modern | stall air concentration with gas-phase back-pressure and stall ventilation, time-averaged over the exposure | `little1992` |
| `shower.rsl-household` | modern (screening) | whole-house air concentration as a fixed fraction of the water concentration | `epa2024rslug` |
| `irrigation.sprinkler-fc` | legacy | sprinkler emission rate into the outdoor box | `foster1986` via the shared droplet fraction; `waldenspence1997` for the scenario |
| `irrigation.pathways` | legacy and modern presets | irrigation water EPCs for M4 pathways (incidental ingestion, dermal, spray inhalation) | `waldenspence1997`; `epa2011efh` for modern factors once read |
| `particulate.box-emission` | legacy | particulate mass flux (entered, or wind erosion) times soil concentration into the outdoor box | `cowherd1985` (verify in S0), `epa1996ssg` |
| `particulate.ssg-pef-1996` | modern | particulate emission factor PEF from Q/C and the wind erosion flux; air = soil / PEF | `epa1996ssg` |
| `particulate.ssg-pef-2002` | modern | the same with the site-specific Q/C regression on source area and climate | `epa2002ssg` |

Deferred, and where it goes:

| Item | Where | Reason |
|---|---|---|
| Plant uptake from irrigation water and soil accumulation from irrigation | M9 | M7 exposes the irrigation water series and application rate (interface below) |
| Probabilistic shower and PEF parameters | M10 | sampling layer |
| Construction-phase PEFs (unpaved road traffic, excavation, wind during construction) of `epa2002ssg` chapter 5 | later (not scheduled) | not in RISC5; large parameter set; the residential and commercial wind-erosion PEF is the regulatory screening default |
| Whole-house multi-zone models (shower, bathroom, house, with exchange rates between zones) | later | Little's single stall with ventilation is the modern option; the RSL factor covers whole-house screening |
| Dermal uptake from shower air (gas-phase dermal) | not planned | not in RISC5 or the RSL method |
| Cleanup levels for these pathways | M5 extension inside M7 slice E4 | the forward functions are linear, so the M5 coefficient route applies |

## Units

SI inside the engine: water concentration kg/m^3, air kg/m^3, soil kg/kg, flow m^3/s, time s, lengths m,
mass transfer coefficients m/s. Inputs at the boundary in RISC-style units: mg/L, mg/m^3, mg/kg, L/min,
minutes, cm droplet diameter, cm/h transfer coefficients, g/(cm^2 s) for an entered particulate flux,
m^3/kg for PEF, g/(m^2 s) per kg/m^3 for Q/C, degrees C for water temperature. Henry's constant is
dimensionless (air over water) inside the engine.

## Notation

C_w tap or irrigation water concentration; C_a air concentration; H dimensionless Henry's constant;
k_l, k_g liquid- and gas-film transfer coefficients; K_L overall liquid-referenced coefficient; M
molecular weight (g/mol); d droplet diameter; t_d droplet fall time; f_v fraction volatilized from a
droplet; Q_w water flow; t_s shower time; V_s stall or bathroom volume; Q_g stall ventilation flow; u wind
speed; delta box height; W box width; C_s soil concentration; PEF particulate emission factor; Q/C
dispersion factor; V vegetative cover fraction; U_m mean wind speed; U_t threshold wind speed; F(x) the
wind speed distribution function.

## Shared kernel: droplet transfer (two-resistance theory)

Two films in series resist transfer across the droplet surface, one on the liquid side and one on the gas
side, so the overall liquid-referenced coefficient is

    1 / K_L = 1 / k_l + 1 / (H k_g)

The film coefficients for a chemical are scaled from reference compounds by the square root of the
molecular weight ratio: the gas film from water vapour (M = 18) and the liquid film from carbon dioxide
(M = 44),

    k_g = k_g,ref (18 / M)^(1/2),    k_l = k_l,ref (44 / M)^(1/2)

RISC5 choice: k_g,ref = 3000 cm/h and k_l,ref = 20 cm/h (verify in S0 that these are the Foster and
Chrostowski values). The coefficient is corrected from the calibration temperature T_1 to the water
temperature T_2 by the ratio (T_2 mu_1 / (T_1 mu_2))^(1/2), mu the water viscosity (the Stokes-Einstein
scaling of the liquid diffusivity). The viscosity comes from a cited correlation or table chosen in S0
(RISC5 cites the CRC Handbook; the reference is not yet in `references.json`).

A droplet of diameter d has surface over volume 6 / d. With a first-order loss at rate K_L 6 / d into air
treated as clean (no back-pressure), the fraction leaving the droplet during its fall time t_d is

    f_v = 1 - exp(-6 K_L t_d / d)

This kernel is shared by `shower.fc-1986` and `irrigation.sprinkler-fc`. It does not depend on C_w, so
the methods built on it are linear in C_w.

## Legacy method: stagnant stall (`shower.fc-1986`)

RISC5 choices (marked as such): the whole mass volatilized during the shower is present in the stall from
the start and stays there (no exchange with the bathroom), and the stall air is fully mixed:

    m = f_v Q_w t_s C_w,        C_a = m / V_s

The receptor's exposure time in M4 pathway 5 is the shower time. The stall air concentration can exceed
the equilibrium value H C_w when V_s is small; that is a property of the stagnant assumption, not a
defect, and is warned (`shower.exceeds-equilibrium`), not clipped.

Verify in S0: whether the Foster and Chrostowski paper itself includes a post-shower period and room
exchange; if it does, the paper's form is implemented and the stagnant form above is the RISC5 choice
offered as an option.

## Modern method: two-resistance stall with back-pressure and ventilation (`shower.little-1992`)

Little (`little1992`) applies the same two-resistance theory but keeps the gas-phase driving force: as
the stall air approaches equilibrium with the water, transfer slows. Our statement of the mass balance
(to be checked line by line against the paper in S0): with N = K_L A / Q_w the number of transfer units of
the spray (A the total droplet surface present, so N = 6 K_L t_d / d for a single fall), the water leaves
with

    C_out = C_w - (C_w - C_a / H) (1 - exp(-N))

and the stall air, ventilated at Q_g, obeys

    V_s dC_a/dt = Q_w (C_w - C_out) - Q_g C_a

which is linear and first order in C_a: dC_a/dt = alpha - beta C_a with alpha = Q_w f C_w / V_s,
beta = (Q_w f / H + Q_g) / V_s and f = 1 - exp(-N). From clean air at the start,

    C_a(t) = (alpha / beta) (1 - exp(-beta t))

and the exposure EPC is its average over the time the receptor is in the stall (shower time, plus an
optional post-shower stay with the water off, when C_a decays at Q_g / V_s). Limits used as identity
tests: with H to infinity and Q_g to zero, the end-of-shower concentration equals the legacy stall value
(the legacy model holds that value for the whole shower, so its average is twice Little's in this limit);
Q_g to zero and long times give C_a = H C_w (equilibrium).

## Modern screening: household water term (`shower.rsl-household`)

The RSL tap water level for a volatile chemical adds inhalation of indoor air whose concentration is the
water concentration times a volatilization factor K (L/m^3, the Andelman factor, `epa2024rslug`). The
value and the volatility criterion that decides which chemicals get the term are transcribed from the
RSL user's guide in S0 (not stated here until read). This method lets M5 reproduce the RSL tap water
levels for volatiles, which the M5 fixtures currently exclude.

## Legacy method: sprinkler volatilization (`irrigation.sprinkler-fc`)

The droplet fraction f_v of the shared kernel, with outdoor parameters (larger droplets, cooler water,
a fall time that includes any ponding while the water stays in the box), gives a mass rate

    E = f_v Q_spr C_w

which enters the M6 outdoor box as a `massRate` emission through `outdoorAirEpc` (no interface change):
C_a = E / (u delta W). RISC5 choice: W fixed at 1 m (the manual argues that the source width does not
matter). DEFAULT ruling: W is an entered input defaulting to 1 m, recorded as the RISC5 choice, because
for a real sprinkler the plume width does matter and the box gives a concentration inversely
proportional to it.

## Irrigation pathways (`irrigation.pathways`)

Irrigation water (the M1 well series or a constant) feeds four exposures, all through existing M4
kernels with irrigation-specific factors:

1. incidental ingestion (sprinkler play, gardening, pool), M4 pathway 8 kernel with an irrigation EPC;
2. dermal contact, M4 pathway 9 kernel;
3. spray inhalation, M4 pathway 7 (outdoor air) with the sprinkler box concentration;
4. garden vegetables, M9 (interface below).

Legacy presets follow the receptor list of `waldenspence1997` (child in a sprinkler, adult gardener,
pool) once its factors are read in S0; modern presets use `epa2011efh` values once the handbook chapters
are read. Until then all irrigation factors are required inputs (no invented defaults).

## Legacy method: particulate flux into the box (`particulate.box-emission`)

Two RISC5 options, both feeding the outdoor box as an `areaFlux` emission of chemical mass:

- an entered PM10 emission flux J (g/(cm^2 s)), RISC5 choice of the ASTM RBCA default (not cited: the
  ASTM text could not be read, as for M6 ruling 14);
- the wind-erosion flux of Cowherd et al. as used in `epa1996ssg`:
  J = 0.036 (1 - V) (U_m / U_t)^3 F(x), in g/(m^2 h) in the source, converted to SI.

The chemical flux is J C_s (the particles carry the bulk soil concentration). C_a = J C_s L / (u delta)
for a box of length L.

## Modern method: SSG particulate emission factor (`particulate.ssg-pef-1996`)

`epa1996ssg` defines PEF (m^3/kg) as Q/C divided by the same wind-erosion flux expressed per second:

    PEF = (Q/C) / J,    C_a = C_s / PEF

Q/C for particulates is entered, defaulting to the guidance value for the default source (transcribed
from the guidance in S0 with page and equation numbers; the M6 `qOverC.ts` table is reused if the same
Table 3 applies to particulates, verify in S0). RISC5's map lists V 0.5, U_m 4.69 m/s, U_t 11.32 m/s and
F(x) 0.194 as the guidance defaults; S0 verifies each against `epa1996ssg` before they become presets.
F(x) is an entered value in M7; a digitised Cowherd function of U_m / U_t is deferred (DEFAULT ruling 9).

## Modern method: site-specific Q/C (`particulate.ssg-pef-2002`)

`epa2002ssg` replaces the table lookup with a regression of Q/C on the source area A_s (acres) with three
constants chosen by climate zone and city: Q/C = A exp[(ln A_s - B)^2 / C]. The constants table is
transcribed in S0 into `processes/particulate/qOverC2002.ts` with the page reference; the same Q/C serves
the PEF above and, as an option, the M6 volatilization factor (M6 ruling 14 kept the 1996 table; this
adds the 2002 regression without changing the M6 default).

## Linearity and the forward-function contract (for M5)

Every method exposes a pure forward function from one source concentration to a receptor medium, plus the
coefficient (receptor per unit source) and warnings:

    showerAir(cw, params)        -> { concentration | series, coefficient, warnings }
    householdAir(cw, params)     -> { concentration, coefficient, warnings }
    sprinklerEmission(cw, params)-> OutdoorEmission (massRate)
    irrigationEpcs(cw, params)   -> { ingestion, dermal, sprayAir, forPlants }
    particulateAir(cs, params)   -> { concentration | OutdoorEmission, coefficient, warnings }

| Method | Linear in the source concentration? |
|---|---|
| `shower.fc-1986` | Yes |
| `shower.little-1992` | Yes (the ODE is linear in C_a and C_w; H and the flows do not depend on C_w) |
| `shower.rsl-household` | Yes |
| `irrigation.sprinkler-fc`, `irrigation.pathways` | Yes |
| `particulate.*` | Yes |

So M5's cleanup level for each is the target over the coefficient, as for the M4 direct pathways; no root
find is needed. A chain from the M1 well series is linear in the source through M1 as well.

## Coupling

- **Inputs.** Tap and irrigation water: a constant, or the M1 receptor-well series through the existing
  `groundwaterBreakthrough` adapter (M8 surface water may feed irrigation as a constant). Soil: the M4
  surface-soil constant (RISC5 choice: soil is constant).
- **Quasi-steady.** The stall and box models are evaluated per sample of the water series (minutes against
  years), giving an EPC series at the same times; no warning is needed.
- **Outputs to M4.** `showerInhalation` EPC with origin `shower.<method>`; `outdoorInhalation` through
  `outdoorAirEpc` with sprinkler (`massRate`) and particulate (`areaFlux` legacy, `direct` modern)
  contributions; irrigation ingestion and dermal EPCs. The existing `outdoorAir.mixed-dispersion`
  warning covers a box particulate emission and a PEF contribution for the same area.

## Interface M9 needs from irrigation

M9 (plant uptake) owns the uptake equations; M7 only provides the irrigation source:

    IrrigationSource = {
      origin: 'irrigation.pathways',
      waterConcentration: (t) => kg/m^3,      // constant or the M1 well series
      applicationRate: m/s,                    // water depth applied per unit time while irrigating
      season?: { startDay, endDay },           // irrigation period within the year
      chemical: ChemicalId
    }

M7 does not compute soil accumulation from irrigation or interception on leaves; both are M9.

## Validity checks and warning codes

| Code or error | When |
|---|---|
| RangeError | nonpositive flow, time, volume, droplet diameter, wind speed or box size; V outside [0, 1]; U_t not positive |
| `shower.exceeds-equilibrium` | legacy stall C_a above H C_w |
| `shower.temperature-out-of-range` | water outside 20 to 45 deg C (the range of the viscosity correlation, verify in S0) |
| `shower.not-volatile` | the chemical fails the RSL volatility criterion; the shower and household terms return zero with the warning |
| `irrigation.potable-source` | the irrigation source is also the potable supply (the indoor pathways will dominate, per the scenario of `waldenspence1997`) |
| `irrigation.box-width-default` | the sprinkler box width is left at the 1 m RISC5 default |
| `particulate.volatile-chemical` | a particulate pathway for a chemical that the volatility criterion calls volatile (the SSG uses VF for those) |
| `particulate.wind-below-threshold` | U_m / U_t small enough that F(x) is outside the entered range the user confirmed (stage 2 sets the bound from the source) |
| `outdoorAir.mixed-dispersion` | existing M6 warning, reused |

## Fixture plan and tolerances

1. **Identities (1e-12; 1e-9 for limits).** Droplet fraction limits (t_d to 0 gives 0; large t_d gives 1);
   Little's end-of-shower value equals the legacy stall when H is large and Q_g is 0; Little at long times
   with Q_g 0 gives H C_w; box sprinkler E / (u delta W); PEF and box particulate agree when Q/C is set to
   the box's equivalent (Q/C = u delta / L in consistent units).
2. **Hand cases (1e-9).** One worked case per method from the note's equations.
3. **Little 1992 published results** (S0 reads the paper): its model comparisons for the chemicals it
   tabulates, at half a unit in the last printed figure.
4. **Table R-9 shower inhalation rows** (`arcadis2001`, the M4 deferred rows), at the ROADMAP's 3
   percent, if the review lists the shower inputs; otherwise a named exception like Table R-6 in M6.
5. **RSL tap water levels for volatiles** (benzene, trichloroethylene, chloroform; `epa2024rsl`) through
   `shower.rsl-household` and the M5 coefficient route, at half a unit in the third printed figure.
6. **SSG 1996 default PEF** reproduced from the guidance's printed inputs, and the RSL resident soil
   inhalation level for one nonvolatile (arsenic), at half a unit in the last printed figure.
7. **2002 Q/C regression** against the worked values printed in `epa2002ssg`, at half a unit in the last
   printed figure.

Tolerances are not widened without a DECISIONS.md entry.

## Slice plan

Stage 2 (engine and data), each slice sized for one worker, failing tests first:

| Slice | Files | Failing tests first | Depends on |
|---|---|---|---|
| S0 sources | `references.json` (verify `foster1986`, `cowherd1985`, add the viscosity source and any EQ 1994 memo only if verified), transcriptions with page numbers into the note | none (docs and data) | none |
| E1 shower | `processes/shower/{droplet,legacyStall,little,household,index}.ts`, `test/shower.test.ts` | identities 1, hand cases, Little fixtures (3), RSL fixtures (5) | S0 |
| E2 sprinkler and irrigation | `processes/irrigation/{sprinkler,pathways,index}.ts`, `test/irrigation.test.ts` | sprinkler box identity; irrigation EPCs through M4 kernels; the M9 `IrrigationSource` shape | E1 (droplet kernel) |
| E3 particulates | `processes/particulate/{windErosion,pef,qOverC2002,index}.ts`, `test/particulate.test.ts` | PEF and box identity; SSG default PEF (6); 2002 regression (7) | S0 |
| E4 coupling, cleanup and registration | `exposure` EPC adapters (origin tags), `outdoorAirEpc` contributions, M5 coefficient wrappers, registry entries, reference status flips, `docs:generate` | Table R-9 rows (4); registry test with every cited key `used`; M5 levels equal target over coefficient | E1, E2, E3 |

Stage 3 (web), new lazy route `#/household` (shower, irrigation, particulates):

| Slice | Files | Failing tests first | Depends on |
|---|---|---|---|
| W1 screen | `apps/web/src/household/` (water and soil inputs, method switch with comparison, warnings), `App.tsx` route and nav | route renders; results equal the engine; zero overflow at 390x844 and 1280, light and dark | E4 |
| W2 feeds | from `#/transport` (well series) and `#/surface-water` into the screen; from the screen into `#/risk` (shower, outdoor, irrigation EPCs with origin) and `#/cleanup` | the risk screen shows the M7 origin; a series feed gives a series EPC | W1 |

## References and verification (2026-10-18)

- `little1992`: title, journal, volume, issue, pages and DOI verified through Crossref (2026-10-18);
  full text not read (S0 reads it).
- `waldenspence1997`: title, journal, volume, issue, pages and DOI verified through Crossref (2026-10-18);
  full text not read.
- `foster1986`, `cowherd1985`: still descriptors; S0 finds the published titles or leaves them planned.
- `epa1996ssg`, `epa2002ssg`, `epa2011efh`, `epa2024rslug`, `epa2024rsl`, `arcadis2001`: already in
  `references.json`; the sections M7 needs are listed above for S0 to read.
- Not added (not verified): the CRC Handbook edition RISC5 cites for water viscosity, the 1994 EQ memo on
  VF and PEF revisions, and the Andelman paper behind the RSL factor (the RSL user's guide is cited
  instead).
