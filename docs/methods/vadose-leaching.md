# Vadose zone leaching (methods note for M2)

Equations implemented in `packages/engine/src/processes/vadose/`, in our own words, derived from the primary
publications cited by reference key (see `docs/ATTRIBUTIONS.md` for full entries). The RISC5 manual was
used only as a map of which published choices RISC5 made; none of its text or tables is reproduced and
its equation labels are not used here. Where a choice is RISC5's rather than a paper's, it is marked
"RISC5 choice" and becomes the method's `risc5Choice` metadata.

Status: methods note and reference check done 2026-10-16; fixtures, hydraulics helpers, the legacy
method `vadose.vadsat`, the groundwater coupling and the modern method `vadose.layered` implemented
2026-10-16; the screen (`apps/web/src/vadose`, with the groundwater feed) implemented 2026-10-16.

## Scope of M2

| Option (ROADMAP section 3, row A) | M2? | Reason |
|---|---|---|
| Legacy compartmental model (depleting well-mixed source, Raoult's law, lens, unit-gradient Brooks-Corey moisture, analytic 1-D transport) | Yes | The legacy default for the process |
| (1) Mualem-van Genuchten k(theta) from the entered n | Yes | Named by the M2 row ("modern k(theta)"); selectable on both methods so its effect can be isolated |
| (3) Multi-layer profile, above and below the source | Yes | Named by the M2 row ("multi-layer options"); generalises the single lens |
| Flux-type (third-type) inlet, van Genuchten and Alves case C14 | Yes, inside the modern method | Makes the column inflow equal the source's leaching loss (mass consistent); the bulletin gives the solution, so it costs little |
| (2) EPA Soil Screening Guidance leaching with a dilution-attenuation factor | Deferred to M5 | It is a back-calculation of a soil screening level from a target groundwater concentration, so it belongs with cleanup levels; its forward part (equilibrium pore-water partitioning) is already the legacy source equation |
| (4) 1-D Richards-equation column (Celia et al. 1990 scheme) | Deferred, after M2 | ROADMAP marks it "later". The M2 finite-volume transport solver is written so a later flow solver can supply theta(z, t) and q(z, t) |
| (5) Jury et al. 1983 behaviour-assessment volatilization | Deferred to M6 | It is a soil volatilization model shared with the vapour pathways (Appendix D lineage) and needs the vapour machinery M6 builds |

## Units

SI inside the engine: metres, seconds, kilograms; concentrations in kg/m^3 (numerically equal to g/L);
Koc in m^3/kg; Henry's constant dimensionless (concentration in air over concentration in water); decay
and depletion rates in 1/s. Conversions happen only at the boundary, using `numerics/units`:

| Quantity | Input or output unit at the boundary | Engine unit |
|---|---|---|
| Infiltration q | cm/yr | m/s (Darcy flux) |
| Saturated conductivity Ks | m/d | m/s |
| Thicknesses, depths, source length and width | m | m |
| Bulk density | g/cm^3 | kg/m^3 |
| Soil concentration (chemical, TPH) | mg/kg | kg/kg (mass fraction) |
| Molar masses | g/mol | kg/mol |
| Solubility, pore-water concentration | mg/L | kg/m^3 |
| Koc | mL/g (= L/kg) | m^3/kg |
| Diffusion coefficients in air and water | cm^2/s | m^2/s |
| Decay rate in the leachate, optional source decay | 1/d | 1/s |
| Time | yr (output series), d | s |
| Flux to the water table | g/m^2/d | kg/m^2/s |
| Mass rate to groundwater | kg/d | kg/s |
| Masses in the budget | kg | kg |

## Notation

Soil layer i: total porosity theta_s, residual water content theta_r, van Genuchten n, saturated
conductivity Ks, bulk density rho_b, organic carbon fraction f_oc. Chemical: aqueous solubility S, molar
mass M, Henry's constant H, Koc, diffusion coefficients D_a (air) and D_w (water), leachate decay rate mu.
Source: depth to its top, thickness L_s, plan length and width (area A), total soil concentration F
(mass fraction), optional TPH mass fraction F_T and TPH molar mass M_T. Infiltration q. Distance from the
base of the source to the water table L_u.

## Legacy method: VADSAT-type compartmental model (`vadose.vadsat`)

Citations: `unlu1992`, `vangenuchten1982`, `brookscorey1964`, `lenhard1989`, `millingtonquirk1961`,
`gelhar1985`, `epa1996ssg` (for the Millington-Quirk effective diffusion form). The compartments are a
well-mixed source that depletes, clean soil above it (vapour diffusion only) and clean soil below it
(1-D leachate transport).

### Moisture content under unit gradient

With a unit hydraulic gradient the downward Darcy flux equals the unsaturated conductivity, so the
relative conductivity is fixed by the infiltration rate:

    k_r(S_e) = q / Ks,      S_e = (theta - theta_r) / (theta_s - theta_r)

Brooks and Corey (`brookscorey1964`) give the wetting-phase relative conductivity
k_r = S_e^((2 + 3 lambda)/lambda), which inverts in closed form:

    S_e = (q / Ks)^(lambda / (2 + 3 lambda))

The pore-size index lambda is obtained from the van Genuchten n the user enters. `lenhard1989` match the
two retention curves by equating their differential saturation capacity at S_e = 0.5. Taking that
capacity as dS_e/d(ln h), the Brooks-Corey curve gives -lambda S_e and the van Genuchten curve gives
-(m n) S_e (1 - S_e^(1/m)) with m = 1 - 1/n, so

    lambda = (n - 1) (1 - 0.5^(n/(n - 1)))

This derivation is ours, from the principle stated in the paper's abstract (the full text is paywalled
and was not read); it agrees with the conversion the RISC5 manual attributes to the paper. The engine
stage tests both the formula and the round trip S_e -> k_r -> S_e.

The seepage velocity is v = q / theta and the water content is theta = theta_r + S_e (theta_s - theta_r),
computed separately for the soil below the source, the source itself, the clean soil above and the lens.

RISC5 choice: when q exceeds Ks, q is reduced to Ks (the excess is treated as runoff) and the soil is
saturated. The legacy method reproduces this clamp and reports it (`vadose.infiltration-clamped`). Under
unit gradient every layer carries the same flux, so the engine clamps q to the smallest Ks among the
layers present (clean soil above, lens, source, soil below); layers whose Ks equals that flux are saturated.

### Partitioning and the residual-phase test

With K_d = Koc f_oc and air-filled porosity theta_a = theta_s - theta, the pore-water concentration in
equilibrium with a total soil concentration F (no separate phase) is

    C_eq = F rho_b / (rho_b K_d + theta + theta_a H)

Raoult's law sets the effective solubility of a component in a hydrocarbon mixture to x S, where x is its
mole fraction in the mixture. With a TPH concentration entered, x = (F / M) / (F_T / M_T); without one the
comparison uses S (x = 1). A separate phase is present when C_eq exceeds x S; the source pore-water
concentration is then C_s0 = x S, otherwise C_s0 = C_eq (`vadose.residual-phase` reports which case
applies and the values of x, x S and C_eq). F greater than F_T is a RangeError.

### Source depletion

Per unit plan area the source holds m0 = rho_b L_s F of the chemical. It loses mass by leaching, at the
advective rate q C_s, and by vapour diffusion to the ground surface, at H D_eff C_s / L_d (Fick's law with
a linear gradient and zero concentration at the surface, pseudo-steady). In both source cases the source
pore-water concentration is proportional to the remaining mass:

- without a separate phase, C_s = m / (L_s (rho_b K_d + theta + theta_a H));
- with a separate phase, C_s = x S and x is proportional to the remaining moles when the TPH mass is
  treated as constant (RISC5 choice, after `unlu1992`, who assume a separate phase is always present).

So the source decays exponentially, C_s(t) = C_s0 exp(-gamma t), with a single expression for both cases:

    gamma = (q + H D_eff / L_d) C_s0 / m0  (+ optional source decay rate)

The leached share of the lost mass is q / (q + H D_eff / L_d) and the volatilized share is the rest, so the
cumulative leached and volatilized masses are closed-form. Source biodegradation is off by default (RISC5
choice); the RISC4-era input for a source decay rate is kept as an optional term, default zero.

The constant-TPH assumption understates the depletion rate by at most F / F_T (the share of the mixture
that leaves with the chemical). The engine reports this bound and warns (`vadose.tph-constant-approximation`)
when it exceeds 0.1. The threshold is a screening choice to be recorded in DECISIONS.md when implemented,
not a published limit; Table R-7 sits exactly at 0.1 and does not warn.

### Vapour diffusion through the clean soil and the lens

Each layer's effective diffusion coefficient follows the Millington and Quirk tortuosity model
(`millingtonquirk1961`, in the form `epa1996ssg` uses):

    D_eff,i = [D_a theta_a,i^(10/3) + (D_w / H) theta_i^(10/3)] / theta_s,i^2

Steady flux continuity through layers in series gives the overall coefficient

    D_eff = (h_soil + h_lens) / (h_soil / D_eff,soil + h_lens / D_eff,lens)

where h_soil + h_lens is the clean thickness above the source and the lens moisture is computed from the
lens's own hydraulic parameters under the same q. RISC5 choice: the diffusion path length L_d is the
distance from the ground surface to the middle of the source, while D_eff averages only the clean soil
above it. The legacy method keeps that pairing; the modern method makes it consistent (below).

### Leachate transport below the source

Dissolved concentration C(x, t), x measured down from the base of the source, obeys

    R dC/dt = D d2C/dx2 - v dC/dx - mu C,     R = 1 + rho_b K_d / theta,     D = alpha_L v

with decay acting on the dissolved phase only (RISC5 choice; sorbed mass does not decay), a clean initial
profile, the first-type inlet C(0, t) = C_s0 exp(-gamma t), and a zero gradient at great depth. This is
case C13 of `vangenuchten1982` (zero initial and constant parts, zero production), whose solution is

    C(x, t) = C_s0 exp(-gamma t) (1/2) [ exp((v - w) x / (2D)) erfc((R x - w t) / (2 sqrt(D R t)))
                                       + exp((v + w) x / (2D)) erfc((R x + w t) / (2 sqrt(D R t))) ]

    w = sqrt(v^2 + 4 D (mu - gamma R))

Terms are evaluated as exp(a) erfc(b) through the scaled complementary error function, as in the
groundwater kernel, so large exponents do not overflow. When gamma R > mu + v^2 / (4 D), w is imaginary
and the closed form does not apply as written. The engine then evaluates the same solution as a Duhamel
convolution of the inlet history with the first-type impulse response used by the Wexler kernel:

    C(x, t) = C_s0 integral_0^t exp(-gamma (t - tau)) x / (2 sqrt(pi D' tau^3))
              exp(-(x - v' tau)^2 / (4 D' tau) - (mu / R) tau) dtau,     D' = D/R, v' = v/R

with tanh-sinh quadrature (`integrateTanhSinh`), and reports `evaluation: 'convolution'` in the result.
Where w is real the two evaluations must agree to 1e-9 relative (a test).

RISC5 choice: retardation is set to one when f_oc is below 0.001; the legacy method does this and reports
it (`vadose.low-foc-retardation-ignored`). The modern method does not.

### Dispersivity

Dispersivity is a required entry. A new project starts on "Entered value" with no number and the screen does
not compute until a positive longitudinal dispersivity (m) is typed; the one value is used for the whole
column by both methods. No open primary source for a vadose-zone dispersivity rule was found (the EPA
Soil Screening Guidance gives a rule for the aquifer only), so there is no sourced suggestion.

The other choice is "RISC5 regression (no primary source)". RISC5 choice: the longitudinal dispersivity is a
two-branch regression in the distance x (metres) from the source base to the observation depth, attributed
to the field data compiled by `gelhar1985`:

    ln alpha_L = -4.933 + 3.811 ln x    (x <= 2 m)
    ln alpha_L = -2.727 + 0.584 ln x    (x > 2 m)

These coefficients are taken from the RISC5 manual's statement of its choice. The EPRI report (EA-4190) was
read in full on 2026-10-21 and does not print them: its unsaturated section gives a table and a plot of
field-scale dispersivity against scale of observation, with no fitted equation, so no primary source for the
coefficients has been located. The reference entry for `gelhar1985` supports only the field data compilation,
not the numbers. Both methods warn `vadose.dispersivity-regression-unsourced` whenever the regression is used,
which is whenever no dispersivity was entered. The two branches do not
meet exactly at 2 m (0.101 m versus 0.098 m). RISC5 evaluates alpha_L at each observation depth, so a depth
profile is a family of solutions with different D; the water-table flux uses alpha_L(L_u). The legacy
method reproduces this, and the per-depth profile exists only with the regression: an entered alpha_L
replaces it at every depth. Molecular diffusion is not added (RISC5 choice). The Table R-7 case gives no
dispersivity, so its reproduction runs on the regression, chosen on purpose.

A project saved before the choice existed opens with a blank dispersivity as the regression (chosen
explicitly, numbers unchanged, now warned) and with a typed one as an entered value.

### Flux to the water table

RISC5 choice: the mass flux per unit area at the water table is the advective term only,
J(t) = q C(L_u, t). The legacy method reproduces it. Note that the first-type inlet admits a dispersive
influx -theta D dC/dx at x = 0 that is not debited from the source, so the column receives slightly more
mass than the source loses by leaching. The engine reports the ratio of the cumulative column influx
(analytic derivative, integrated in time) to the cumulative leaching loss at the end of the run. That
finite-time ratio grows without bound as t approaches zero, so the warning (`vadose.inlet-mass-excess`,
threshold 1.05, a screening choice recorded in DECISIONS.md) tests the same ratio over the whole release
instead. Setting the Laplace variable to zero in the transformed inlet gradient gives the closed form

    ratio over the release = 1 + (sqrt(v^2 + 4 D mu) - v) / (2 v)

independent of R and gamma: with mu = 0 the early dispersive influx is returned later and the ratio is
one. For Table R-7 it is 1.019, while the ratio at 10 yr is 1.060.

## Modern method: layered profile (`vadose.layered`)

Citations: `vangenuchten1982`, `vangenuchten1980`, `mualem1976`, `brookscorey1964`, `lenhard1989`,
`millingtonquirk1961`, `epa1996ssg`.

### Mualem-van Genuchten k(theta) (selectable on both methods)

With m = 1 - 1/n (`vangenuchten1980`, from the conductivity model of `mualem1976`):

    k_r(S_e) = S_e^(1/2) [1 - (1 - S_e^(1/m))^m]^2

k_r is monotonic in S_e on (0, 1), so S_e for k_r = q/Ks is found with the Brent solver in
`numerics/roots` (bracket (0, 1), tolerance 1e-12 in S_e). The closed form was checked numerically against
Mualem's integral during this note (agreement to quadrature precision for n = 1.5, 2 and 2.68); the engine
stage confirms it against van Genuchten's 1978 Princeton report, which derives it and is publicly
available (the 1980 paper is paywalled). Using it removes the n-to-lambda conversion, so the moisture model
is the one the entered n belongs to. A `hydraulicModel` input ('brooksCorey1964' or 'vanGenuchten1980')
selects it on either method; the legacy default is Brooks-Corey.

### Layers

Any number of layers above the source (replacing the single lens) and below it. Each layer carries its own
theta_s, theta_r, n, Ks, rho_b and f_oc; the chemical and q are shared. Under unit gradient every layer
carries the same q, so each layer's theta, v, R and D_eff follow independently from the equations above.
Infiltration at or above the smallest Ks in the profile violates the unit-gradient assumption and is a
RangeError in the modern method (no clamp).

Vapour: D_eff is the series average over the layers above the source plus the upper half of the source at
the source soil's own D_eff, and L_d is the distance from the surface to the middle of the source. Path and
coefficient therefore describe the same column.

### Transport through layers

There is no compact closed form for the layered problem, so it is solved numerically: cell-centred finite
volumes in depth with interface fluxes q C - theta D dC/dx (D harmonically averaged in theta D across an
interface, advection by distance-weighted central interpolation), a flux-type inlet q C_s(t) at the base
of the source whose step inflow is the exact integral of the leaching loss, and Crank-Nicolson time
stepping with two backward Euler start-up steps. The outlet keeps the semi-infinite convention of the
analytic solutions: the deepest layer continues below the water table for 20 dispersion lengths D/v and
ends in a free exit (zero dispersive flux, outflow q C), which perturbs the solution upstream by about
exp(-20). The water-table flux is the total flux across the water-table face and mass that crosses it
counts as delivered. A free exit placed at the water table itself was tried first; it raised the
water-table concentration by up to 25 percent and the flux by about 2 percent of its peak relative to
the analytic solution, so one layer and two identical layers gave different answers. The starting grid
keeps the cell Peclet number at or below 2 with at least 20 cells per layer; the time step is refined on it
until halving the step changes the water-table flux (and any profile value) by less than 1e-4 of its peak.
That grid is coarse for accuracy (the scheme is second order, and a 3 m column at 20 cells left an error
of 2.7 percent of the peak flux), so every cell is then halved until halving changes the results by less
than 1e-3 of their peak. Either loop that runs out of halvings warns (`vadose.numerics-not-converged`).
The solver keeps a running mass budget (stored, decayed, outflow) and the result reports its closure
error; above 1e-9 relative it warns (`vadose.mass-balance`), which should never happen. Dispersivity is one value per run (alpha_L(L_u) from
the regression or user-entered), so the profile is a single solution. Pore-water diffusion
D_w theta^(7/3) / theta_s^2 is added to alpha_L v (the liquid-phase counterpart of the Millington-Quirk form).

When the profile below the source is one homogeneous layer, the method evaluates the analytic solution of
`vangenuchten1982` case C14 (third-type inlet q C_s0 exp(-gamma t), same equation, zero initial
concentration) instead, and reports `evaluation: 'analytic-c14'`. Where w is imaginary, or within 1e-3
relative of the removable singularity w = v (mu = gamma R, where the general expression cancels), it is
evaluated as a Duhamel convolution of the inlet history with the flux-type impulse response, as for C13.
The total flux at depth x is theta v times the C13 solution with the same parameters, because the
flux-averaged concentration C - (D/v) dC/dx obeys the same equation and equals the inlet concentration at
x = 0; the analytic path uses this for the water-table flux. The finite-volume solver is tested against
C14 on a homogeneous column: it converges at second order, agrees to 1e-4 of the inlet concentration at a
fine grid, and matches the analytic water-table flux to 1e-3 of its peak with its default refinement. The
fixture plan's stricter target (1e-4 relative wherever C exceeds 1e-6 of the inlet) is not met: a second
order scheme's relative error grows in the leading tail of a front (2.7e-4 at 5334 cells on a 16 m test
column). The agreement standard is therefore 1e-4 of the inlet concentration absolute, 1e-2 relative where
C exceeds 1e-2 of the inlet, and a measured second-order rate (DECISIONS.md, 2026-10-16 tolerance
rulings).

With the third-type inlet the column inflow equals the source's leaching loss, so mass is conserved from
source to aquifer.

## Validity checks

RangeError (both methods): non-finite inputs; theta_s outside (0, 1]; theta_r outside [0, theta_s);
n <= 1; Ks <= 0; q < 0; rho_b <= 0; f_oc, Koc, H, D_a, D_w, mu or a source decay rate negative; S or M not
positive; F negative; F greater than F_T; a TPH mole fraction (F / M) / (F_T / M_T) above 1 (the chemical's moles
exceed the mixture's, inconsistent TPH inputs; never clamped or reported); zero water content (q = 0 with
theta_r = 0, no mobile water, so v and R are undefined); a layer or source thickness <= 0; lens or layers thicker than the
clean soil above the source; L_u <= 0 (contamination at the water table is the saturated-source process,
M3); negative or NaN time.

Warnings (codes are part of the result):

| Code | Method | Condition |
|---|---|---|
| `vadose.infiltration-clamped` | legacy | q > Ks; q reduced to Ks (RISC5 choice) |
| `vadose.residual-phase` | both | separate phase present; Raoult's law used (reports x, x S, C_eq) |
| `vadose.tph-constant-approximation` | both | F / F_T > 0.1 (screening choice) |
| `vadose.low-foc-retardation-ignored` | legacy | f_oc < 0.001; R set to 1 (RISC5 choice) |
| `vadose.inlet-mass-excess` | legacy | first-type inlet admits more than 1.05 times the leaching loss (screening choice) |
| `vadose.mass-balance` | modern | finite-volume budget closure worse than 1e-9 relative |
| `vadose.numerics-not-converged` | modern | the finite-volume time-step or grid halvings ran out before the results settled |

Assumptions listed on both methods (not warnings): steady unit-gradient flow with uniform moisture per
layer; no NAPL migration; dissolved-phase decay only below the source; vapour concentrations below the
surface are not computed; fixed water table; the vertical extent of the source is known and the soil
below it starts clean.

## Coupling to the groundwater process (M1)

The vadose result is a mass flux per unit area J(t) at the water table. Projected over the source footprint
(RISC5 choice: the vadose source's length and width become the groundwater source's plan dimensions), the
mass rate is Mdot(t) = J(t) A.

- AT123D-class kernel (mass-rate source, `LoadingStep`): the coupling builds piecewise-constant steps over
  [0, t_end]. Default step length is one month (365.25/12 d). The vadose methods expose their exact
  cumulative delivery to the water table at every series node (legacy: quadrature of the C13 flux;
  modern: the analytic integral or the finite-volume outflow), and each step's rate is the mass delivered
  during it divided by its length, with the flux samples supplying only the shape inside a node interval.
  Every step therefore carries exactly the mass that crossed the water table during it, and the loaded
  mass equals `budget.deliveredToWaterTable` to 1e-12 (the trapezoid of the monthly flux samples, used
  when a series carries no cumulative, differs from it by up to 6e-2 relative at 3 yr). The screen caps
  the schedule at 48 steps to stay responsive (cost is linear in the step count; monthly steps over 25
  years took about 45 s), so beyond 4 yr a step is time/48 long (12.5 months at 50 yr); the mass per step
  stays exact and only the timing within a step is lumped. Loading after t_end cannot affect concentrations at or before
  t_end, so the list stops there and needs no open-ended step. The groundwater source box keeps its
  user-entered thickness below the water table (the mixing depth); its plan dimensions come from the
  vadose source.
- Aquifer top for vadose-fed runs: the delivered mass enters through the water table, which must be a
  no-flux boundary of the AT123D-class aquifer or part of the mass diffuses upward out of it. With a finite
  thickness H the water table is the layer's no-flux top (z = H); with infinite depth the aquifer uses
  `top: 'no-flux'` (Yeh's semi-infinite case, aquifer z <= 0, water table at z = 0), which is now the
  kernel's default for infinite depth. An explicit `top: 'unbounded'` has no water table and keeps only
  half of a water-table load below z = 0, so `waterTableSource` rejects it with a RangeError when given
  the aquifer. The patch from `waterTableSource` lies on the water
  table in both cases (z = H, or z = 0).
- Wexler and Domenico (boundary-concentration sources): each step is converted to a held concentration
  with the existing M1 rule (concentration = mass rate / (Darcy flux times source cross-section)), giving a
  `ConcentrationStep` list; the screen's existing `ui.source-basis` warning applies.
- Mass conservation, tested: the sum of rate times duration over the steps equals the vadose run's exact
  delivered mass (`budget.deliveredToWaterTable`, an independent quantity) to 1e-12 relative; with mu = 0 in both processes the aquifer's dissolved plus sorbed mass (n R times the
  volume integral of C) equals the loaded mass; halving the step length changes a downstream receptor
  value by less than 0.1 percent for the Table R-7 case at 10 yr, and the screen's capped 12.5-month steps
  at 50 yr change the receptor value by less than 0.2 percent against steps four times finer (measured 0.07
  and 0.09 percent, legacy and modern); the vadose budget closes, initial source mass =
  source mass + volatilized + decayed in transit + held in the profile + delivered to the water table.

## Fixture plan

Fixtures live in `packages/engine/test/fixtures/vadose/` with a README that records sources, pages and
every interpretation below.

1. Table R-7 (`arcadis2001`). The table gives the soil, source and loading inputs but not the benzene
   properties. They come from the RISC4 chemical database (`spence2001`, public): M = 78 g/mol,
   S = 1750 mg/L, H = 0.228, Koc = 59 mL/g, D_a = 0.088 cm^2/s, D_w = 9.8e-6 cm^2/s. Interpretation:
   the 4.0 m above the source includes the 0.2 m lens (3.8 m of vadose soil plus the lens); L_d = 5.5 m;
   L_u = 2.8 m; the source and the soil below it use the vadose soil's hydraulic parameters; mu = 0.001/d
   acts on the dissolved phase. Targets:
   - source pore water 224 mg/L, tolerance 1 percent (a separate phase is present; x S = 224.4 mg/L);
   - water table at 10 yr, 10.8 mg/L (the RISC result), tolerance 3 percent, compared with the mean of the
     twelve month-end values in year 10. The review states that RISC reports each year as the average of
     its monthly time steps. A reconstruction made while writing this note gives 10.69 mg/L that way
     (-1.1 percent) but 14.1 mg/L as the point value at exactly 10 yr, because the front is still rising
     steeply. The "independent calculation" of 11.0 mg/L used an approximate erf and is not used.
   - The 10-yr value is ill-conditioned: a 5 percent change in Koc moves it by about 25 percent, so the
     properties must be exactly those above. The tolerance is the review's own, applied to the averaged
     value; if the engine misses it, report the gap rather than widening it without a DECISIONS.md entry.
2. `vangenuchten1982`, Table 6 (sample output of program A1, printed page 118, page 121 of the ARS scan):
   v = 1, D = 4, R = 1, zero initial concentration, unit inlet concentration held beyond the listed times,
   concentration versus distance at several times, printed to four decimals, for the first-type
   (cases A1 = C13 with no decay or depletion) and third-type (A2 = C14 likewise) inlets. Hand-entered;
   tolerance half a unit in the last printed digit. This is the only tabulated output in the bulletin that
   matches a vadose kernel; the decaying-input cases (C13, C14) have no tables, so their decay and
   depletion terms are checked analytically (next item).
3. Analytic and property tests: closed form versus convolution for C13 where w is real; a finite-difference
   residual of the PDE at sample points; the gamma -> 0, mu -> 0 limits; the moisture inversions (both
   models) round trip; Millington-Quirk limits (dry soil gives D_a theta_s^(4/3), water term vanishes for
   theta = 0); the finite-volume solver against C14 on an extended column (1e-4 relative where the value
   exceeds 1e-6 of the inlet); two identical layers equal one layer; vadose and coupling mass budgets as
   listed above.

## References and verification (2026-10-16)

| Key | Verified against | Full text read |
|---|---|---|
| `vangenuchten1982` | The bulletin (USDA ARS scan) and DataCite record | Yes (cases C13, C14, program A1 output) |
| `brookscorey1964` | The paper (Colorado State University repository) | Yes (relative permeability) |
| `epa1996ssg`, `epa2002ssg` | Document covers (EPA SEMS) | Covers and the diffusion and dilution sections of the 1996 document |
| `unlu1992`, `lenhard1989`, `millingtonquirk1961`, `vangenuchten1980`, `mualem1976`, `celia1990`, `jury1983` | Crossref | No, paywalled; abstracts only where Crossref holds one |
| `spence2001` | The manual (ISPRA copy) | Cover and chemical database page |
| `gelhar1985` | Unchanged from M1 | Not for the vadose regression (see Dispersivity) |

All remain `planned` (or `fixture`) until the engine stage cites them from a registered method.
