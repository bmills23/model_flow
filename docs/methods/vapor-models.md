# Vapor models (methods note for M6)

Equations to be implemented in `packages/engine/src/processes/vapor/` and
`packages/engine/src/processes/outdoorAir/`, in our own words, derived from the primary publications
and agency documents cited by reference key (see `docs/ATTRIBUTIONS.md` for full entries). The RISC5
manual (Appendices D, E, F, J and K, and Tables R-3 to R-6 of its Appendix R review) was used only as a
map of which choices RISC5 made; none of its text, figures or tables is reproduced and its equation
labels are not used here. Where a choice is RISC5's rather than a paper's, it is marked "RISC5 choice"
and becomes the method's `risc5Choice` metadata.

Status: stage 1 (methods note, reference check, data plan, fixture plan and slice plan) done 2026-10-16.
Slices V0 (vapor chemical data in `packages/data`), V1 (shared kernels in
`packages/engine/src/processes/vapor`: units, Henry correction, building coupling, source vapor), V2
(`vapor.je-1991` and `vapor.dominant-layer-1998` as method descriptors; Tables R-3, R-4, R-5 and Appendix J
reproduce) and V4 (`vapor.je-epa`; the Appendix C example reproduces) are built. The V2 descriptors and
`vapor.je-epa` are registered in the default registry (V4 registered them together, because the registry
test requires a modern method for every process that has a legacy one), and V4 flipped
`johnsonettinger1991`, `johnson1998`, `epa2004je` and `epa2017je` to `used`. The outdoor air and Jury
descriptors (V3) are registered by V7. No web code exists yet. The scope calls below are the DEFAULT rulings
recorded in `docs/DECISIONS.md` (2026-10-16, M6 vapor models scope, stage 1), open to Bryan's overturn.

## What the process is

A volatile chemical in soil, in soil gas or dissolved in groundwater produces a vapor that diffuses
upward through the unsaturated zone. Under a building, soil gas is also drawn in through cracks in the
foundation by a small indoor depressurization; in the open, the vapor leaves the ground surface and is
diluted by the wind. The process turns a source concentration into an indoor air concentration or an
outdoor (breathing-zone) air concentration, which M4's inhalation pathways (`indoorInhalation`,
`outdoorInhalation`) use as exposure point concentrations. Along the way vapor may biodegrade where
oxygen is available, which is what the petroleum models add.

Every model here is steady state in the soil (the vapor profile is assumed to adjust instantly to the
source), except the Jury soil-volatilization model and the EPA finite-source option, which are
transient. A time-varying source (a groundwater breakthrough, a depleting vadose source) is handled by
applying a steady model at each time ("quasi-steady"; see "Coupling").

## Scope of M6

| Option (ROADMAP section 3, rows D, E, F, J, K; row A item 5) | M6? | Reason |
|---|---|---|
| Legacy Johnson and Ettinger, soil or soil gas source to indoor air, no degradation, optional lens (App. D) | Yes, `vapor.je-1991` | Legacy default for indoor air |
| Legacy groundwater to indoor air with a capillary fringe layer (App. E) | Yes, the groundwater source of `vapor.je-1991` | Same physics as App. D with a Henry's-law source and one more layer; one method with three source kinds (DEFAULT ruling 3) |
| Legacy dominant-layer model with first-order degradation in a middle layer, indoor or outdoor (App. J) | Yes, `vapor.dominant-layer-1998` | Named by the M6 row; Tables R-4 and the App. J example reproduce |
| Legacy oxygen-limited model (App. K) | No (DEFAULT ruling 2) | Its only source is an unpublished draft (a "written communication" in the references of `epa2015pvi`), so there is no primary publication to implement from, and the review says its output was never validated. DeVaull 2007 covers the same physics and is published |
| Legacy outdoor air box model fed by soil, groundwater and vadose emissions (App. F) | Yes, `outdoorAir.box` | Legacy default for outdoor air |
| Modern EPA Johnson and Ettinger implementation (2004 equations, 2017 Version 6.0 defaults), groundwater, soil gas and soil sources, temperature-corrected Henry's constant, capillary zone from the van Genuchten curve, finite-source option | Yes, `vapor.je-epa` | Named by the M6 row (DEFAULT ruling 9 for the 2017 defaults) |
| Modern oxygen-limited biodegradation, DeVaull 2007 in the BioVapor formulation | Yes, `vapor.devaull-2007` | Named by the M6 row |
| EPA 2015 empirical attenuation factors as used by the VISL calculator | Yes, `vapor.attenuation-factor-2015` | Named by the M6 row |
| EPA 2015 petroleum vapor intrusion vertical-separation screen | Yes, `vapor.pvi-screen-2015` (a verdict, not a concentration) | Named by the M6 row |
| Modern outdoor air: Soil Screening Guidance volatilization factor with a dispersion factor Q/C | Yes, `outdoorAir.ssg-vf-1996` | ROADMAP row F modern option |
| Jury et al. behaviour-assessment soil volatilization (transient, depleting, optional clean cover and boundary layer), as an outdoor emission source | Yes, `vapor.jury-bam`, zero water flux only | Moved here from M2 (row A item 5). Nonzero water flux deferred (DEFAULT ruling 15) |
| PVIScreen Monte Carlo wrapper | No; M10 | It is a sampling wrapper around the DeVaull equations; M10 owns sampling |
| Abreu and Johnson 2005/2006, Abreu, Ettinger and McAlary 2009, Yao et al. 2011/2013 three-dimensional results | Cited in applicability warnings only | They bound the one-dimensional models; nothing is computed from them |
| Volatilization as a loss term in the M3 saturated source mass balance | No (DEFAULT ruling 8) | Region 1 pore water can be a vapor source, but adding a loss to M3 would change M3's results; omitting it stays conservative for groundwater |
| Shower and sprinkler volatilization, particulate emissions | No; M7 | M7 plugs into the outdoor interface defined here |
| Back-calculation of vapor-based cleanup levels | No; M5 | M5 wraps the forward functions defined here ("Linearity") |
| Lateral source-building offset, three-dimensional or transient soil-gas models | No | Outside every model in the RISC5 inventory |

## Units

SI inside the engine: metres, seconds, kilograms; vapor and water concentrations in kg/m^3; Henry's
constant dimensionless (gas over water, both kg/m^3); diffusion coefficients in m^2/s; permeability in
m^2; pressure in Pa; viscosity in Pa s; temperatures in K. Conversions happen only at the boundary,
through `numerics/units` and the exposure `units.ts`:

| Quantity | Unit at the boundary | Engine unit |
|---|---|---|
| Layer thicknesses, depths, building dimensions | m (legacy), cm or m (modern, as EPA prints) | m |
| Diffusion coefficients in air and water | cm^2/s (as the RSL tables) | m^2/s |
| Henry's constant | dimensionless H' (RSL `hPrime`) or atm m^3/mol (RSL `hlc`) | dimensionless |
| Soil concentration | mg/kg | kg/kg |
| Groundwater concentration | mg/L (as M1) | kg/m^3 |
| Soil gas, indoor and outdoor air | mg/m^3 at the M4 boundary; ug/m^3 shown alongside | kg/m^3 |
| Pressure difference | Pa (legacy input g/(cm s^2) accepted: 1 g/(cm s^2) = 0.1 Pa) | Pa |
| Soil vapor permeability | cm^2 | m^2 |
| Hydraulic conductivity (to estimate permeability) | m/d | m/s |
| Building air exchange | 1/d (legacy), 1/h (modern) | 1/s |
| Soil gas flow into the building Qsoil | cm^3/s or L/min | m^3/s |
| Degradation rates | 1/d (legacy), 1/h (DeVaull, as BioVapor) | 1/s |
| Wind speed | m/s | m/s |
| Temperature | deg C | K |
| Enthalpy of vaporization | cal/mol (as EPA prints) | J/mol |
| Time | yr (365.25 d for transport, 365 d for exposure, as M4), s | s |

## Notation

Soil layer i: thickness h_i, total porosity n_i, water-filled porosity theta_w,i, air-filled porosity
theta_a,i = n_i - theta_w,i. Chemical: molar mass M, solubility S, dimensionless Henry's constant H,
diffusion coefficients in air D_a and water D_w, Koc, first-order degradation rate lambda (water
phase). Source: soil concentration F (and TPH F_T, M_T), soil gas C_sg, groundwater C_gw; source vapor
concentration C_vs. Building: floor and below-grade wall area in contact with soil A_B, crack fraction
eta, crack area A_crack = eta A_B, foundation thickness L_crack, floor-wall seam perimeter X_crack, depth
of the cracks below grade Z_crack, building volume V_B (or floor area times mixing height), air exchange
rate ER, ventilation Q_B = V_B ER, soil gas flow into the building Q_soil, indoor-outdoor pressure
difference dP, soil vapor permeability k_v, air viscosity mu. L_T is the distance from the top of the
source to the base of the foundation (indoor) or to the ground surface (outdoor).

## Shared building blocks

### Effective diffusion coefficients

Each soil layer's effective diffusion coefficient, referred to the gas-phase concentration, follows the
Millington and Quirk tortuosity model in the form `epa1996ssg` and `epa2004je` use
(`millingtonquirk1961`; the engine already has it as `millingtonQuirkDeff` in `processes/vadose`):

    D_i = [ D_a theta_a,i^(10/3) + (D_w / H) theta_w,i^(10/3) ] / n_i^2

The modern EPA method uses the exponent 3.33 the guide prints instead of 10/3 (see its section).

Layers in series between the source and the foundation (or the ground surface) combine as resistances:

    D_T = L_T / sum_i (h_i / D_i),   L_T = sum_i h_i

(`seriesDeff`). Order does not matter for steady diffusion without reaction, which is why Table R-3's
vadose zone plus lens can be laid out in any order (see "Fixture plan").

### Source vapor concentration

Three source kinds, shared by every vapor method:

- **Soil.** The pore-water concentration C_w in the source soil (porosity, moisture, bulk density and
  f_oc of the source zone, which may differ from the transport layers: RISC5 choice for the dominant-layer
  model, applied to all legacy vapor methods) comes from the equilibrium partitioning and residual-phase
  test of the vadose and saturated processes (`equilibriumPoreWater`, `residualPhaseTest`), then
  C_vs = H C_w. With a separate phase present, C_w = x S, so C_vs = x S H (DEFAULT ruling 4: Raoult's law
  expressed through the effective solubility rather than through the pure-component vapor pressure,
  x P_v M / (R T), which gives the same value only when H equals P_v M / (R T S); the vapor-pressure
  form is reported for comparison, not used).
- **Soil gas.** C_vs = C_sg as measured; L_T is measured from the sample depth.
- **Groundwater.** C_vs = H C_gw at the water table (`epa2004je`, and the legacy groundwater model). The
  diffusion column then includes the capillary fringe as its deepest layer. A groundwater concentration
  above x S is warned (`vapor.source-above-solubility`), never clamped: RISC5 does not check it, and the
  modern method follows EPA in warning.

### Building and foundation (Johnson and Ettinger 1991)

`johnsonettinger1991` couple steady one-dimensional diffusion from the source to the foundation with
steady advection and diffusion through the foundation cracks, and a well-mixed building. With

    A  = D_T A_B / (Q_B L_T)                 (diffusive conductance of the soil, relative to ventilation)
    B  = Q_soil / Q_B
    xi = Q_soil L_crack / (D_crack A_crack)  (Peclet number of the cracks)

the ratio of indoor air to source vapor concentration (the attenuation coefficient) is

    alpha = A e^xi / ( e^xi + A + (A / B) (e^xi - 1) )

which we evaluate in the overflow-free form alpha = A / (1 + A e^-xi + (A / B)(1 - e^-xi)). Two limits are
used directly: as Q_soil tends to 0 (pure diffusion through the cracks),

    alpha = A / (1 + A + A / C),   C = D_crack A_crack / (Q_B L_crack)

and as xi grows without bound, alpha = A / (1 + A / B). With no foundation resistance at all (a dirt floor,
EPA 2017) alpha = A / (1 + A). The indoor concentration is C_in = alpha C_vs; the mass entry rate is
Q_B C_in.

Soil gas flow into the building, when not entered, follows the cylinder-sink solution that
`johnsonettinger1991` and `epa2004je` use: a crack of length X_crack and equivalent radius
r_crack = eta A_B / X_crack at depth Z_crack,

    Q_soil = 2 pi dP k_v X_crack / ( mu ln(2 Z_crack / r_crack) )

### Henry's constant at the soil temperature (modern only)

`epa2004je` corrects the reference Henry's constant H_R (atm m^3/mol at T_R, 25 deg C) to the system
temperature T_S with the Clapeyron relation and the Watson form for the enthalpy of vaporization:

    dH_v(T_S) = dH_v,b [ (1 - T_S / T_C) / (1 - T_B / T_C) ]^m
    m = 0.30 if T_B / T_C < 0.57;  0.74 (T_B / T_C) - 0.116 if 0.57 <= T_B / T_C <= 0.71;  0.41 above
    H(T_S) = H_R exp[ -(dH_v(T_S) / R_c) (1 / T_S - 1 / T_R) ]
    H'(T_S) = H(T_S) / (R T_S)

with R_c the gas constant in the units of the enthalpy and R in atm m^3/(mol K). It needs the normal
boiling point T_B, critical temperature T_C and enthalpy of vaporization at the boiling point dH_v,b,
none of which the RSL tables carry (see "Data"). The legacy methods use H as entered (25 deg C, RISC5
choice).

## Legacy method: Johnson and Ettinger, soil, soil gas or groundwater to indoor air (`vapor.je-1991`)

Citations: `johnsonettinger1991`, `millingtonquirk1961`, `epa1996ssg` (soil-water partitioning).

- Column: clean soil above the source, an optional lens, and for a groundwater source a capillary fringe
  of entered thickness and moisture (RISC5 choice: the fringe is a user-entered layer, as in Table R-5; no
  retention model is applied). L_T is the sum of those layers; the foundation is not part of L_T.
- D_crack: the Millington-Quirk coefficient of the foundation layer itself, from its entered porosity
  and moisture (RISC5 choice: Tables R-3 and R-5 list the foundation as a soil layer with porosity 0.25
  and moisture 0). This differs from `epa2004je`, which takes D_crack equal to the coefficient of the soil
  layer in contact with the floor (DEFAULT ruling 5 records both).
- Q_soil: entered, or from the cylinder-sink formula with k_v entered directly or estimated from the
  hydraulic conductivity of the soil around the foundation, k_v = K mu_w / (rho_w g) (RISC5 choice: the
  RISC5 data list asks for hydraulic conductivity; Table R-3, a RISC4 run, gives k_v). Air viscosity
  mu = 1.8e-5 Pa s (1.8e-4 g/(cm s); DEFAULT ruling 6: the value with which Tables R-3 and R-4 both
  reproduce to their printed figures). Q_soil = 0 is allowed (Table R-5 is a diffusion-only run).
- Ventilation: V_B and air exchanges per day (RISC5 choice of units); A_B is the area available for flux.
- Output: alpha, C_in, the entry rate, the diffusion-only alpha (k_v set to zero, which RISC5 reports as
  the diffusive contribution), and the vapor profile in the soil (linear between the source and the
  foundation, piecewise linear across layers) for the depth-attenuation plot.

The source is constant (RISC5 choice: infinite source, not linked to any transport model in the stand-
alone mode). Linked to a time-varying source the method is applied quasi-steadily ("Coupling").

## Legacy method: dominant layer with degradation (`vapor.dominant-layer-1998`)

Citations: `johnson1998`, `johnsonettinger1991`, `millingtonquirk1961`, `epa1996ssg`.

Three homogeneous layers above the source (`johnson1998`): layer 1 (thickness h_1, next to the source)
and layer 3 (thickness h_3, next to the foundation or the ground surface) without degradation, and layer
2 (thickness h_2) with first-order degradation. Degradation is proportional to the dissolved
concentration and the water content (RISC5 choice, as the manual states it): per unit soil volume the
loss rate is lambda theta_w,2 C_w = (lambda theta_w,2 / H) C_v. In layer 2 the steady vapor
concentration satisfies D_2 C_v'' = (lambda theta_w,2 / H) C_v, whose solution between the layer's
bottom value C_a and top value C_b is

    C_v(s) = [ C_a sinh(phi (1 - s / h_2)) + C_b sinh(phi s / h_2) ] / sinh(phi),
    phi^2 = lambda theta_w,2 h_2^2 / (D_2 H)

(s measured up from the bottom of layer 2). Fluxes (positive upward) at the bottom and top of layer 2 are
J_bot = (D_2 phi / h_2)(C_a cosh phi - C_b) / sinh phi and J_top = (D_2 phi / h_2)(C_a - C_b cosh phi) /
sinh phi. Continuity with layer 1, D_1 (C_vs - C_a) / h_1 = J_bot, and with the top boundary closes the
system:

- **Indoor:** J_top A_B equals the entry rate of the Johnson and Ettinger building above layer 3, that
  is J_top = (Q_B / A_B) alpha_3 C_b, where alpha_3 is the attenuation coefficient with D_T = D_3 and
  L_T = h_3 and the same foundation, Q_soil and building. Then C_in = alpha_3 C_b.
- **Outdoor:** zero concentration at the ground surface, J_top = D_3 C_b / h_3. The flux J_top is the
  area emission to the outdoor box.

Two linear equations give C_a and C_b; everything else follows. With lambda = 0 the method reduces to
`vapor.je-1991` for the same column (identity test). The manual's own printed attenuation expression is
not used; the system above is derived in this note from the stated layer model, and it reproduces Table
R-4 and the Appendix J example (see "Fixture plan").

## Legacy method: outdoor air box (`outdoorAir.box`)

Citations: `arcadis2001` and `spence2001` (Table R-6 and the RISC5 review). The attribution of the box
to the ASTM RBCA guide (`astme1739`) could not be confirmed in slice V3: a public search found only state
rules that adopt RBCA-style equations as images (Illinois 35 IAC 742 Appendix C, which lists a wind speed
default of 225 cm/s and a source width W parallel to the wind), not the standard's own equations, which
are purchased. The method therefore rests on the RISC5 choice alone and does not cite `astme1739`. RULING
NEEDED: whether to cite the standard anyway on the strength of the Illinois variable list.

Emissions enter a box over the source, of length L along the wind, width W across it and height
delta (the breathing zone), ventilated by a wind of speed u and fully mixed (RISC5 choice: the receptor is
at the downwind edge, no vertical dispersion out of the box, no deposition or decay in air). For total
emission rates E_k (kg/s) into the box,

    C_out = sum_k E_k / (u delta W)

and for an area flux F over the whole footprint, E = F L W, so C_out = F L / (u delta): the width cancels,
which is why RISC5 asks for no width. Validity: a box shorter than the source is warned
(`outdoorAir.box-shorter-than-source`), since the model would then concentrate vapor.

Legacy emission sources (each an area flux over the source footprint, kg/(m^2 s)):

- soil or soil gas source through clean soil to an open surface: F = D_T C_vs / L_T (zero concentration at
  the surface, steady);
- groundwater through the capillary fringe and vadose zone: the same with C_vs = H C_gw (Table R-6);
- the dominant-layer outdoor flux J_top;
- the M2 vadose source's volatilization flux H D_eff C_s(t) / L_d, already computed by
  `processes/vadose` as `volatilizationVelocity` times the source pore-water series (RISC5 choice: the box
  is fed by the unsaturated zone model's time-varying emission).

## Modern method: EPA Johnson and Ettinger implementation (`vapor.je-epa`)

Citations: `epa2004je`, `epa2017je`, `johnsonettinger1991`, `millingtonquirk1961`, `vangenuchten1980`.

The equations are those of `epa2004je` sections 2.2 to 2.8; the defaults and foundation options are those
of the current EPA tool, Version 6.0 (`epa2017je`), which kept the 2004 equations (DEFAULT ruling 9).
Differences from the legacy method:

- **Henry's constant at the soil or groundwater temperature** (shared block above). Default temperature
  as entered, no default (EPA prints a map of shallow groundwater temperatures; we do not reproduce it).
  Without T_B, T_C and dH_v,b the method uses H at 25 deg C and warns
  (`vapor.henry-not-temperature-corrected`) when the system temperature is not 25 deg C.
- **Millington and Quirk exponent 3.33**, as the guide prints it (Equation 6 and the soil equation), in
  place of the exact 10/3 the legacy methods use: the worked example reproduces only with 3.33 (see
  "Fixture plan", item 6). The effective diffusion coefficient is `epaLayerDeff`.
- **Geometry.** Strata are entered from grade down and total the depth to the source (top of
  contamination, water table or soil gas sample point); the floor depth trims them, so layers above the
  floor drop out of the diffusion column. The enclosed space is a rectangle: A_B = L W + 2 (L + W) L_F,
  seam length 2 (L + W), crack area eta A_B or crack width times seam. The source soil is the deepest
  stratum. A groundwater column has its capillary zone carved from the bottom (the zone's height from the
  deepest stratum's texture, or entered); its top must lie below the floor.
- **Capillary zone moisture** at the air-entry head from the van Genuchten retention curve
  (`vangenuchten1980`): theta_w,cz = theta_r + (theta_s - theta_r) / [1 + (alpha_1 h)^N]^M with
  h = 1 / alpha_1 and M = 1 - 1/N, so theta_w,cz = theta_r + (theta_s - theta_r) 2^-M. Capillary zone
  height from the soil texture class (EPA tabulates class values) or entered.
- **Soil texture presets** (12 SCS classes: van Genuchten parameters, bulk density, porosity, default
  moisture, saturated conductivity) from the tables of `epa2004je` and `epa2017je` (public domain), as
  presets only: every value can be overwritten and is then tagged `user`.
- **D_crack** equals the effective coefficient of the soil layer in contact with the floor, and L_T
  excludes the floor (as `epa2004je` states).
- **Q_soil**: (a) entered; (b) the cylinder-sink formula with k_v = k_i k_rg, intrinsic permeability
  k_i = K_s mu_w / (rho_w g) and relative air permeability k_rg = (1 - S_te)^(1/2) (1 - S_te^(1/M))^(2M),
  S_te = (theta_w - theta_r) / (n - theta_r) (the Parker-type form quoted by `epa2004je`), with water
  viscosity at 10 deg C as EPA prints it (the guide gives no viscosity formula, so viscosity is an input,
  default 1.75e-5 Pa s, the guide's value at 10 deg C); or (c) the Version 6.0 default ratio Q_soil / Q_B = 0.003 at
  0.45 air changes per hour, scaled by 0.45 / ER when another exchange rate is entered (`epa2017je`).
  Default (c), as the current EPA tool.
- **Foundation types** (`epa2017je`): slab on grade, basement with slab, closed crawlspace with slab use
  the full alpha; basement or closed crawlspace with a dirt floor use alpha = A / (1 + A). Default
  building values (floor area, mixing height, exchange rate, crack fraction, foundation thickness) are the
  Version 6.0 residential defaults of its Table 9 (`epaBuildingDefaults`). The commercial floor area (1,500
  m^2) and mixing height (3 m, basements) are printed in section 4.5 but the commercial air exchange rate
  was not found, so there is no commercial preset; those values are entered.
- **Finite soil source** (`epa2004je` section 2.6): with the initial thickness of contamination dH_c and
  exposure interval tau, the time-averaged attenuation is

      <alpha> = (rho_b F dH_c A_B / (Q_B C_vs tau)) (L_T0 / dH_c) [ (beta^2 + 2 psi tau)^(1/2) - beta ]
      beta = (D_T A_B / (L_T0 Q_soil)) (1 - e^-xi) + 1,   psi = D_T C_vs / (L_T0^2 rho_b F)

  and when the depletion time tau_D = [ (dH_c / L_T0 + beta)^2 - beta^2 ] / (2 psi) is shorter than tau,
  the mass-limit value C_in = rho_b F dH_c A_B / (Q_B tau) applies. Soil source only.
- **Soil source status.** EPA removed the soil-concentration option from Version 6.0 to follow its 2015
  guidance (`epa2015vi`). The modern method keeps it, because M2 and M3 produce soil sources, and warns
  (`vapor.soil-source-not-recommended`) whenever a soil source is used.

## Modern method: oxygen-limited biodegradation (`vapor.devaull-2007`)

Citations: `devaull2007`, `api2012biovapor`, `johnsonettinger1991`, `millingtonquirk1961`.

The model of `devaull2007` as documented, by its author, in Appendix B of `api2012biovapor` (the paper
itself is paywalled and was not read; the appendix is the equation source). One homogeneous soil layer of
thickness L_T between the source and the foundation is split into a deeper anaerobic layer L_b (no
degradation) and a shallower aerobic layer L_a = L_T - L_b in which each chemical degrades at a
water-phase first-order rate k_w (loss per soil volume k_w theta_w C_v / H).

- **Foundation:** a mass transfer coefficient h (m/s) across the foundation, from the Johnson and
  Ettinger crack model (h = D_crack eta / L_crack with no soil gas flow; with flow, the advective form in
  `api2012biovapor` B.6, which that appendix takes from `johnsonettinger1991`; slice V5 checks that the
  two give the same indoor concentration for the same inputs) or entered; the building-to-subslab ratio is
  c_e / c_f = (1 / (L_mix ER)) / (1 / (L_mix ER) + 1 / h).
- **Aerobic layer:** with L_R = (D_eff H / (k_w theta_w))^(1/2) and a = L_a / L_R, the profile across the
  aerobic layer is the hyperbolic solution of the same equation as the dominant-layer middle layer (with
  A = cosh a and B = sinh(a) / a in BioVapor's notation); the anaerobic layer is linear. Chaining the
  foundation, aerobic and anaerobic ratios gives c_e / c_s as a closed form. Large a uses the exponential
  asymptote to avoid overflow.
- **Oxygen:** three options, as BioVapor offers: (1) the aerobic depth L_a entered; (2) the fast-reaction
  explicit depth, where chemical and oxygen meet at a reaction front, from an oxygen mass balance that
  includes a zero-order baseline soil respiration (a quadratic in L_a / L_T, `api2012biovapor` B.5); (3)
  the coupled solution, in which L_a is found so that the oxygen flux or concentration constraint below
  the foundation is just met with finite rates (a monotone one-dimensional root find on L_a in [0, L_T],
  Brent from `numerics`). Baseline respiration defaults to 1.69 mg O2 per g organic carbon per day times
  f_oc (`api2012biovapor` Appendix C, from `devaull2007`). The oxygen demand of each chemical uses its
  stoichiometric mass ratio of oxygen to chemical; oxygen limits need every oxygen-consuming hydrocarbon
  in the source, so options (2) and (3) require a total hydrocarbon vapor concentration and warn
  (`vapor.oxygen-demand-incomplete`) when only chemicals of concern are entered.
- **Rates:** k_w by chemical class from `api2012biovapor` Appendix C: 0.73 /h for benzene, toluene,
  ethylbenzene, xylenes, trimethylbenzenes and other alkylbenzenes; 19 /h naphthalene; 11 /h short-chain
  branched and cyclo-aliphatics; 170 /h normal alkanes C5 to C12; 71 /h mixed aliphatics; 82 /h methane.
  A chemical with no class has no default rate: it is treated as non-degrading and warned
  (`vapor.no-degradation-rate`), never given a rate silently.

With L_a = 0 (no aerobic zone) the method equals the Johnson and Ettinger result for the same column and
foundation (identity test). With L_a fixed it is the dominant-layer model with layer 1 = L_b, layer 2 = L_a
and layer 3 = 0, if the reaction terms are matched (lambda theta_w = k_w theta_w); that cross-check is a
test.

## Modern screening: empirical attenuation factors (`vapor.attenuation-factor-2015`)

Citations: `epa2015vi`, `epavisl`, `epa2004je` (the temperature correction the VISL calculator applies).

C_in = AF C_medium with the generic factors of `epa2015vi` Table 6-1 for residential buildings:
groundwater 0.001 (applied to the vapor in equilibrium with groundwater, AF H'(T_gw) C_gw, as the VISL
calculator does, at 25 deg C unless a groundwater temperature is entered); groundwater under fine-grained,
laterally extensive vadose soils 0.0005 (an explicit option, warned as needing site geology); sub-slab
soil gas 0.03; near-source exterior soil gas 0.03; crawlspace air 1.0. Warnings when the guide says the
generic factor does not apply: a water table less than five feet below the foundation, or a vadose-zone
source less than five feet below it (`vapor.af-shallow-source`), and preferential pathways (a user flag).
These factors are empirical upper percentiles, not a fate model, and they are offered as the screening
option beside the models.

## Modern screening: petroleum vertical separation (`vapor.pvi-screen-2015`)

Citations: `epa2015pvi`, `lahvis2013`.

A verdict, not a concentration. From `epa2015pvi` Table 3: the source is treated as LNAPL when soil
benzene exceeds 10 mg/kg, or soil TPH exceeds 100 mg/kg (unweathered gasoline) or 250 mg/kg (weathered
gasoline, diesel), or groundwater benzene exceeds 5 mg/L or groundwater TPH exceeds 30 mg/L; otherwise
dissolved. The recommended vertical separation of clean, biologically active soil between the top of the
contamination (historic high water table for a dissolved source, top of the smear zone or residual LNAPL
for LNAPL) and the lowest point of the building is 6 feet for a dissolved source under a building of any
size and 15 feet for LNAPL under a building with at least one side shorter than 66 feet. Output:
`screened-out` when the separation is met and no precluding factor is flagged, otherwise
`further-assessment`. Precluding factors that force `further-assessment` with a warning: preferential
pathways, a high-ethanol blend (E20 or greater), lead scavengers (EDB, 1,2-DCA) in the fuel, a larger
building over LNAPL, extensive impermeable surface cover, contamination in contact with the building
(`vapor.pvi-precluded`). The guide's note that a dissolved source above 1 mg/L benzene may behave like
LNAPL is shown as information. Distances are entered in feet or metres; the thresholds are stored in
feet, as published.

## Modern outdoor air: soil volatilization factor (`outdoorAir.ssg-vf-1996`)

Citations: `epa1996ssg`, and `epa2002ssg` if the dispersion-factor regression is used.

The Soil Screening Guidance outdoor inhalation model for a surface soil source: an infinite-source
volatilization factor VF (m^3/kg), the soil concentration over the air concentration, built from the
average emission flux over an exposure interval T for a semi-infinite uniformly contaminated soil with no
boundary layer and no degradation, divided into a dispersion factor Q/C (g/(m^2 s) per kg/m^3), and a
mass-limit VF for a source of finite depth. The apparent diffusivity is the Jury-type
D_A = D_g / R_g in the notation of the Jury section below, so the infinite-source VF is exactly the
time-average of the `vapor.jury-bam` flux in its limiting case (identity test). Q/C is user-entered, with
the guidance default 68.81 (Los Angeles, 0.5 acre) and Table 3 of `epa1996ssg` (29 cities, six source
areas) transcribed as data in `processes/outdoorAir/qOverC.ts`; the 2002 regression is not used.

Transcribed in slice V3 from `epa1996ssg` (Part 2, EPA SEMS copy read 2026-10-17), in SI in the code with
the page and equation numbers in the comments. Equation 6 (page 23), with the printed 3.14 replaced by pi
(a 0.02 percent difference, DECISIONS.md):

    VF = (Q/C) (pi D_A T)^(1/2) / (2 rho_b D_A) x 1e-4 m^2/cm^2
    D_A = [(theta_a^(10/3) D_i H' + theta_w^(10/3) D_w) / n^2] / (rho_b K_d + theta_w + theta_a H')

with defaults T = 9.5e8 s, rho_b 1.5 g/cm^3, n 0.43, theta_w 0.15, f_oc 0.006 and Q/C 68.81. The mass-limit
form is Equation 55 (Section 2.6.3, page 60), VF = (Q/C) T / (rho_b d_s) with T in years times 3.15e7 s/yr
in the document; here T is in seconds and the same exposure interval serves both forms (the document uses
30 years in Equation 55 and 9.5e8 s in Equation 6). The document says the Equation 55 value is a minimum
value for VF (the infinite-source model may be too conservative when it gives the smaller VF), so the
code uses the larger of the two. The apparent diffusivity equals D_g / R_g of the Jury section (identity
test, 1e-12). Checked against the VF column of Table 3-A (toluene, ethylbenzene, the two
dichlorobenzenes, styrene, 1,2,4-trichlorobenzene) using Tables 36, 37 and 39: the six values agree with
the printed two-figure values within 0.8 to 3.6 percent; the residual
is the rounding of the printed inputs and values. Appendix H's benzene comparison table (apparent
diffusion 5.82e-4 cm^2/s, VF 1.82e3 m^3/kg) was not reproduced from its printed inputs (they give 2.1e-3
cm^2/s) and is not used.

## Modern emission source: Jury behaviour-assessment volatilization (`vapor.jury-bam`)

Citations: `jury1983`, `jury1990`, `millingtonquirk1961`.

The problem posed by `jury1983` and generalized by `jury1990` (abstract read: a chemical at uniform
concentration in a finite soil layer, covered by a layer of clean soil, moving by vapor and liquid
diffusion with linear equilibrium sorption and first-order degradation, losing mass to the atmosphere by
vapor diffusion through a stagnant air boundary layer). Neither paper's full text was read, so the closed
form below is derived in this note for the zero water flux case (DEFAULT ruling 15). Slice V3 checked it
three ways (all in `test/vapor-jury.test.ts`): against the published reduced solution and the published
Jury et al. (1983) flux with boundary layer, both as reproduced in Appendix C of `epa1996ssg` (Equations
1, 7 and 9; agreement 1e-12 and 1e-9; the printed Equation 9 carries the opposite sign because that
document measures depth downward); against an independent Crank-Nicolson finite-volume solution of the
same governing equation with a cover, a finite layer, a boundary layer and decay (agreement 4e-6, 1e-5
and 6e-5 relative in three cases); and by mass balance, quadrature of the closed-form profile plus the
cumulative emission against the initial mass (1e-6). The papers' own tables remain unchecked.

Total concentration C_T = R_g C_g with the gas-referenced capacity R_g = rho_b K_d / H + theta_w / H +
theta_a, gas-referenced diffusion D_g (Millington-Quirk, as above) and effective diffusivity
D_E = D_g / R_g. With depth z positive downward, the gas concentration obeys
R_g dC_g/dt = D_g d^2C_g/dz^2 - mu R_g C_g; at the surface, the upward flux D_g dC_g/dz = h_b C_g with
boundary-layer conductance h_b = D_a / d (d the boundary-layer thickness); initially C_g = C_0 for
a <= z <= a + L and 0 elsewhere (cover thickness a, layer thickness L), the medium semi-infinite below.
Integrating the Green's function of the semi-infinite medium with this radiation condition over the
initial layer gives, at the surface, with k = h_b / D_g and E(z) = exp(k z + k^2 D_E t) erfc(z / (2
(D_E t)^(1/2)) + k (D_E t)^(1/2)),

    C_g(0, t) = C_0 e^(-mu t) [ E(a) - E(a + L) ],    J(t) = h_b C_g(0, t)

E is evaluated as exp(-z^2 / (4 D_E t)) erfcx(z / (2 (D_E t)^(1/2)) + k (D_E t)^(1/2)) to avoid overflow
(`numerics` has erfcx). Limits used as tests: with no boundary layer (d = 0, k infinite), a = 0 and L
infinite, J = C_T0 (D_E / (pi t))^(1/2), whose average over T is the Soil Screening Guidance flux; with
mu = 0 the cumulative emission plus the mass left in the soil (by quadrature of the profile) equals the
initial mass. Default d: none (no boundary layer, the conservative limit) unless the user enters one;
Jury's own default is not verified here. The flux series feeds the outdoor box as an area emission and is
the modern alternative to the M2 legacy Fick's-law volatilization loss.

## Linearity and the forward-function contract (for M5)

Every concentration-producing method exposes a pure forward function from one source concentration (in
SI, with its kind) to a receptor air concentration, plus the profile and diagnostics:
`indoorAir(source, params) -> { concentration, alpha, profile, warnings }` and, for outdoor,
`emission(source, params, t?) -> flux` combined by the box. M5 can wrap any of them with a root find.

| Method | Linear in the source concentration? |
|---|---|
| `vapor.je-1991`, `vapor.je-epa` (infinite source) | Yes for groundwater and soil gas. For soil, yes below the residual-phase point; above it C_vs is fixed at x S H and the output stops responding to F (M5 must report that no soil cleanup level exists above saturation, not root-find through a flat function) |
| `vapor.je-epa` finite source | Yes below saturation: C_vs is proportional to F, so psi and beta do not depend on F and the time-averaged C_in scales with F; the mass-limit branch is also proportional to F |
| `vapor.dominant-layer-1998` | Yes (linear equations in C_vs), with the same soil saturation caveat |
| `vapor.devaull-2007` | Only with the aerobic depth entered (option 1), or when the layer is wholly aerobic or wholly anaerobic. Options 2 and 3 are nonlinear: the aerobic depth depends on the total hydrocarbon concentration, so M5 needs the root find |
| `vapor.attenuation-factor-2015` | Yes |
| `outdoorAir.box`, `outdoorAir.ssg-vf-1996` | Yes (the mass-limit VF too) |
| `vapor.jury-bam` | Yes (linear equation, linear initial condition) |
| `vapor.pvi-screen-2015` | Not a concentration; a threshold verdict |

For each linear method the engine also returns the coefficient (receptor air concentration per unit source
concentration), so M5's cleanup level for a linear chain is the target over the product of coefficients,
as M4 already does for direct pathways.

## Coupling

Inputs from the existing engine (adapters in slice V7; none changes an existing process):

- **M1 groundwater** (`processes/groundwater`): the concentration at the water table under the building,
  from the transport solution evaluated at the building's plan position at depth zero below the water
  table (not the well-screen average), as a series. Groundwater source for `vapor.je-1991`, `vapor.je-epa`,
  `vapor.attenuation-factor-2015` and the outdoor groundwater flux. The no-flux water table of M1 is
  consistent with treating vapor loss as negligible for the aquifer (RISC5 choice: the vapor model does not
  feed back on transport).
- **M2 vadose** (`processes/vadose`): the source pore-water series C_s(t) gives C_vs(t) = H C_s(t) for a
  soil source; the volatilization flux series feeds the legacy outdoor box. Using an M2 source in a J&E
  indoor run is an option the legacy stand-alone RISC5 model does not have (RISC5 choice: App. D is not
  linked), so it is offered in the modern method and in the legacy method only when the user links it, and
  the result says so.
- **M3 saturated source** (`processes/saturatedSource`): region 1 pore water (above the water table) as a
  soil source; region 2 reaches vapor only through M1 groundwater. No loss term is added to M3 (DEFAULT
  ruling 8).
- **Quasi-steady application** (DEFAULT ruling 7): a steady method applied to a source series gives an air
  series at the same times. It is valid when the source changes slowly compared with the time to establish
  the vapor profile, of order L_T^2 / D_E with the gas-referenced capacity included; the engine computes that
  time and warns (`vapor.quasi-steady`) when the source changes by more than 10 percent within it.

Outputs to M4 (`packages/engine/src/processes/exposure/`): an EPC spec for `indoorInhalation` or
`outdoorInhalation`, constant (`constantEpc`) or series (`seriesEpc`), in kg/m^3, with origin set to the
producing method id (`vapor.je-1991`, `outdoorAir.box` and so on), so `scenario.ts` and the risk screen
take it without change. A new adapter `vaporSeriesEpc(run, times, origin)` mirrors
`groundwaterBreakthrough`: it evaluates a vapor forward function on a source series and clips round-off
below zero.

## Interfaces for M7 and M9

**Outdoor air (M7 adds sources without changing the interface).** `outdoorAirEpc(input)` sums
contributions per chemical, each tagged with its origin:

    OutdoorAirInput = {
      box?: { length, width, height, windSpeed }            // SI; required if any emission is present
      emissions: OutdoorEmission[]                          // enter the box
      direct: OutdoorDirect[]                                // already an air concentration (Q/C models)
    }
    OutdoorEmission = { origin, kind: 'areaFlux', flux: (t) => kg/(m^2 s), area?: m^2 }
                    | { origin, kind: 'massRate', rate: (t) => kg/s }
    OutdoorDirect   = { origin, concentration: (t) => kg/m^3 }

The box concentration is sum(rate) / (u delta W), with an area flux converted to a rate over its area
(the box footprint by default). M7's sprinkler volatilization enters as a `massRate` emission, a
particulate emission factor model as a `direct` contribution (concentration = soil concentration / PEF),
and irrigation spray likewise; none needs a new field. The result keeps each contribution separately so the
risk screen can show them, and warns (`outdoorAir.mixed-dispersion`) when a box emission and a Q/C
contribution describe the same source area, because adding them double counts.

**Indoor air.** Indoor air from M6 is one contribution; M7's shower model produces bathroom air for
`showerInhalation`, a different pathway, so there is no shared indoor interface to define. If M7 later adds
household-water volatilization to whole-house air, it enters as a further indoor contribution summed by an
`indoorAirEpc` of the same shape (origin-tagged constants or series).

**M9 (plant uptake, ecological screening, TPH fractions):** no vapor interface is needed. TPH fraction
cleanup levels (App. Q) use M4/M5 pathway results, which already include any M6 air EPCs by origin; plant
uptake takes soil and water concentrations. Confirmed from ROADMAP rows O, P, Q.

## Data: chemical properties

| Property | Used by | In the RSL generated data? |
|---|---|---|
| H' (dimensionless, 25 deg C) and HLC (atm m^3/mol) | all | Yes: `hPrime`, `hlc` in `chemicals.json` (728 of 890 rows) |
| D_a, D_w | all diffusion models | Yes: `dia`, `diw` (861 rows) |
| Koc | soil sources | Yes: `koc` (721 rows) |
| S, M | residual test, Raoult | Yes: `s`, `mw` |
| Vapor pressure | the comparison Raoult form only | Yes: `vp` |
| Volatile flag | chemical picker filter | Yes: `volatile` in `tox.json` |
| IUR, RfC | M4, unchanged | Yes |
| T_B, T_C, dH_v,b | modern temperature correction | No |
| Water-phase aerobic rate k_w, class | DeVaull | No |
| Oxygen-to-chemical mass ratio (from the molecular formula) | DeVaull options 2 and 3 | No (the RSL carries no formula) |
| Oxygen diffusivity in air and water | DeVaull options 2 and 3 | No |
| Legacy degradation rate lambda | dominant layer | No (RISC5 used Howard et al. 1991 saturated-zone rates; the user enters it, no default) |

The RSL tables are the primary source for every property they carry (DEFAULT ruling 10); new data never
overrides an RSL value. Plan for the missing fields (slice V0, data package, separate from the engine
slices):

- **T_B, T_C, dH_v,b** (slice V0, built): from the chemical properties lookup table printed in
  `epa2004je` (a public-domain EPA document; the same values appear in its Appendix C worked example, for
  benzene 353.24 K, 562.16 K and 7,342 cal/mol). The complete table (108 chemicals, full precision) is the
  VLOOKUP copy in Appendix C, PDF pages 113 and 114; Appendix B prints a shorter copy (95 chemicals, no
  benzene) at three significant figures, used only for its enthalpy flags. The table is transcribed into
  `packages/data/raw/vapor/epa2004je/lookup-table.csv` beside the PDF and a manifest with its SHA-256;
  the data test checks the benzene, trichloroethylene and tetrachloroethylene rows against the values
  printed on the example worksheets, and the build merges by CAS number into the derived
  `packages/data/generated/vapor/vapor-chemicals.json` (112 chemicals, the vapor screen's subset as M4's
  `risk-chemicals.json`), each value tagged `epa2004je`. Three lookup chemicals are not in the RSL table
  (chlordane, 2-chloropropane, 1,3-dichlorobenzene) and are listed as unmatched. An enthalpy that Appendix B
  marks as taken at a temperature other than the normal boiling point (trichlorofluoromethane,
  1,1,2-trichloro-1,2,2-trifluoroethane, dibenzofuran), and crotonaldehyde's (printed as 9, apparently
  kcal/mol), are left out of the merged row; T_B and T_C stay, so those chemicals get the
  `vapor.henry-not-temperature-corrected` warning. `epa2017je`'s workbook (chemical table updated from the
  2015 RSLs) was not downloaded; it remains the alternative and switching to it needs a ruling.
- **k_w and chemical class** (slice V0, built) from `api2012biovapor` Appendix C, as a committed
  id-to-class list for the petroleum chemicals in the RSL table (`packages/data/src/vapor/classes.ts`, as
  `dermal-form.ts` is for M4), tagged `api2012biovapor`: 22 chemicals (alkylbenzenes including BTEX,
  xylenes, trimethylbenzenes, cumene and the propyl and butyl benzenes; naphthalene; n-pentane, hexane,
  heptane and nonane; cyclohexane and methylcyclohexane). Appendix C publishes one rate per class and
  names no per-chemical rate, so extending the alkylbenzene class beyond the six named there is a reading
  (DECISIONS.md).
- **Oxygen mass ratio** (slice V0, built) computed from a committed molecular formula (carbon and
  hydrogen counts, plus oxygen for oxygenates) for the same petroleum list: complete oxidation needs
  (c + h/4 - o/2) mol of O2 per mol; benzene gives 7.5 mol and 3.07 g/g.
- **Oxygen diffusivities**: slice V5 finds a verifiable public source; until then they are required user
  inputs with no default, and options 2 and 3 cannot run without them.


## Where the manual is ambiguous, and what we chose

| Point | Reading adopted | Status |
|---|---|---|
| Raoult's law source: vapor pressure form or effective solubility times H | x S H, consistent with the residual test of M2 and M3 | DEFAULT ruling 4 |
| Diffusion through the cracks: foundation layer's own porosity or the soil's | The foundation layer's Millington-Quirk coefficient (legacy); the soil at the floor (modern, EPA) | DEFAULT ruling 5 |
| Air viscosity in the soil gas flow formula | 1.8e-4 g/(cm s), which reproduces Tables R-3 and R-4 | DEFAULT ruling 6 |
| Table R-3 lists no source soil properties and no f_oc | The source soil block of Table R-4 (porosity 0.35, moisture 0.15, bulk density 1.7, f_oc 0.01), with the lens outside the 2.60 m vadose zone (L_T = 2.80 m) | Fixture reading, reproduces both cases |
| Table R-5 gives no pressure, permeability or perimeter | Q_soil = 0 (diffusion only) | Fixture reading, reproduces; with the R-3 soil gas flow it would not |
| Table R-6's output repeats Table R-5's to three figures | Not reproducible by any box reading (the box gives 2.54e-6 mg/m^3 for those inputs, also by the ASTM-type closed form); treated as a transcription error in the review | Named exception, see "Fixture plan" |
| Degradation in the dominant layer: vapor phase or water phase | Water phase times moisture (lambda theta_w C_w), as the manual describes it; the table's "degradation rate vapour phase 0.09" is read as 0.09 /d in that form | Fixture reading, reproduces Table R-4 |
| Capillary fringe moisture (groundwater model) | Entered | RISC5 choice (Table R-5 enters 0.345) |
| Mixing of the J&E model with the outdoor box | The same soil column feeds the box as an area flux with zero surface concentration | RISC5 choice |
| Oxygen-limited model (App. K) | Not implemented | DEFAULT ruling 2 |

## Validity checks

RangeError (all methods): non-finite inputs; porosity outside (0, 1]; moisture outside [0, porosity]; a
layer thickness <= 0; H <= 0 for any diffusion model; D_a or D_w negative; a building volume, area,
exchange rate or wind speed <= 0; eta outside (0, 1]; dP < 0; k_v < 0; Z_crack <= r_crack (the
logarithm in Q_soil must be positive); L_T <= 0; temperatures at or below 0 K or T_S >= T_C; a box with a
non-positive dimension; Jury with t < 0 or a source layer of zero thickness; DeVaull with an entered L_a
outside [0, L_T]. A source concentration of zero is allowed and returns zero.

Warnings (codes are part of the result):

| Code | Method | Condition |
|---|---|---|
| `vapor.residual-phase` | soil sources | a separate phase is present; reports x, x S and C_eq (as M2 and M3) |
| `vapor.source-above-solubility` | groundwater sources | C_gw > x S |
| `vapor.quasi-steady` | linked series | the source changes by more than 10 percent within the vapor equilibration time |
| `vapor.henry-not-temperature-corrected` | `vapor.je-epa`, AF | T_B, T_C or dH_v,b missing and the system temperature is not 25 deg C |
| `vapor.soil-source-not-recommended` | `vapor.je-epa` | a soil source is used (removed from EPA Version 6.0) |
| `vapor.advection-dominated` | J&E methods | xi > 10: entry is controlled by Q_soil, so the result is sensitive to k_v and dP (informational) |
| `vapor.crack-depth` | J&E methods | Z_crack greater than the depth to the source, or the source within the foundation's zone of influence (L_T < Z_crack) |
| `vapor.lateral-offset` | all indoor | a user flag that the source is not under the building; the one-dimensional models do not apply (cites the three-dimensional studies) |
| `vapor.no-degradation-rate` | DeVaull | a chemical has no k_w class |
| `vapor.oxygen-demand-incomplete` | DeVaull options 2 and 3 | no total hydrocarbon vapor concentration given |
| `vapor.af-shallow-source` | AF | water table or vadose source less than 5 ft below the foundation |
| `vapor.pvi-precluded` | PVI screen | a precluding factor is flagged |
| `outdoorAir.box-shorter-than-source` | box | box length < source length along the wind |
| `outdoorAir.mixed-dispersion` | outdoor input | box and Q/C contributions for the same area |

Assumptions listed on every method (not warnings): steady, one-dimensional vapor transport (except Jury
and the finite source); homogeneous layers; the source extends under the whole building footprint; no
sorption to building materials; indoor background not included.

## Fixture plan

Fixtures live in `packages/engine/test/fixtures/vapor/` with a README recording sources, pages and every
reading below. Under ROADMAP section 6, the Appendix R tables contribute only their numeric inputs and
results; RISC4 chemical values (`spence2001`) are fixture inputs for these cases only, as in M2 and M4:
benzene M 78 g/mol, S 1750 mg/L, H 0.228, Koc 59 mL/g, D_a 0.088 and D_w 9.8e-6 cm^2/s.

Trial calculations for this note (independent scripts outside the repository) reproduced the cases
marked "reproduced" with the readings in the table above; slice V2 writes the failing tests from the
printed values, not from these trials.

1. **Table R-3, J&E soil to indoor air (reproduced).** Vadose 2.60 m (n 0.35, theta_w 0.05), lens 0.2 m
   (n 0.35, theta_w 0.15), foundation 0.15 m (n 0.25, theta_w 0), bulk density 1.7; building 400 m^3, 12
   exchanges per day, A_B 150 m^2, eta 0.001, Z_crack 2.0 m, perimeter 50 m, dP 10 g/(cm s^2), k_v 1e-9
   cm^2; source soil as Table R-4's source block. Case A benzene 1000 mg/kg, no TPH; case B 10 mg/kg with
   TPH 1000 mg/kg (any M_T from 80 to 120 g/mol keeps case B below saturation, which the test checks).
   Expected (RISC column): 8.57 and 8.57e-2 mg/m^3; trial 8.569 and 8.569e-2. Tolerance 0.5 percent of the
   RISC value (DEFAULT ruling 17; tighter than the ROADMAP's 2 to 3 percent band, which is a maximum).
   The independent column (8.59) is recorded, not asserted.
2. **Table R-4, dominant layer (reproduced).** Layers 1.3 m (n 0.35, theta_w 0.05), 0.2 m (theta_w 0.15,
   degradation 0.09 /d in the water-phase form), 1.3 m (theta_w 0.05); source soil n 0.35, theta_w 0.15,
   bulk density 1.7, f_oc 0.01, benzene 1000 mg/kg; building and soil gas flow as Table R-3. Expected:
   source vapor 3.23e5 mg/m^3 (trial 3.2338e5), indoor 7.28 mg/m^3 (trial 7.2756), indoor with the source
   vapor entered as soil gas 7.27 (trial 7.267). Tolerance 0.5 percent. With degradation set to zero the
   same column gives Table R-3's 8.57, a second check of the reading.
3. **Table R-5, groundwater to indoor air (reproduced).** Vadose 1.2 m (theta_w 0.05), lens 0.2 m (0.15),
   capillary fringe 0.2 m (0.345), all n 0.35; foundation 0.1 m (n 0.25, theta_w 0); building as R-3,
   Q_soil = 0; groundwater benzene 1.00 mg/L. Expected 2.27e-3 mg/m^3 (trial 2.2692e-3). Tolerance 0.5
   percent.
4. **Table R-6, groundwater to outdoor air (named exception).** Same column, box 10 m long, 2 m high, wind
   2.25 m/s. The printed 2.27e-3 mg/m^3 equals Table R-5's output to three figures and is not reproduced by
   the box (2.5444e-6 mg/m^3) or by an ASTM-type closed form (the same value). The test asserts the box
   hand value from an independent calculation at 1e-9 relative and records the printed value as an
   unreproduced exception in the README, never widened into a tolerance.
5. **Appendix J worked example (reproduced, loose).** Outdoor (zero surface concentration), benzene with
   the RISC4 properties, layers 1.2, 1.2 and 2.5 m (distances 1.2, 2.4 and 4.9 m above the source),
   degradation 0.07 /d in layer 2. Readings: base case layer 1 n 0.36 theta_w 0.10, layer 2 n 0.29
   theta_w 0.10, layer 3 n 0.36 theta_w 0.19; "dry" layer 1 n 0.40 theta_w 0.05; "wet" layer 2 n 0.35
   theta_w 0.30, applied together with the dry layer 1 (the cases are cumulative; wetting layer 2 alone
   gives 0.907 and misses the printed 0.95). Expected normalized concentration at the top of layer 1: 0.65, 0.8, 0.95 (values stated in
   the manual's prose from its figures); trial 0.657, 0.807, 0.955. Tolerance 0.01 absolute (DEFAULT ruling
   17: the values are figure readings).
6. **EPA 2004 worked example, SL-ADV benzene (`epa2004je` Appendix C).** Inputs as printed on the data
   entry sheet: soil temperature 10 deg C, floor 200 cm below grade, contamination from 400 to 600 cm,
   strata A loam 200 cm (bulk density 1.59, n 0.399, theta_w 0.148, f_oc 0.002), B loam 100 cm (same), C
   sand 100 cm (1.66, 0.375, 0.054, 0.002), floor 10 cm thick, dP 40 g/(cm s^2), building 1000 by 1000 by 366
   cm, crack width 0.1 cm, exchange 0.25 /h, Q_soil 5 L/min, exposure 30 yr, benzene properties from its
   chemical sheet (D_a 0.088, D_w 9.8e-6, HLC 5.54e-3 at 25 deg C, dH_v,b 7,342 cal/mol, T_B 353.24 K, T_C
   562.16 K, Koc 58.9, S 1,790). Expected intermediates and results as printed (three figures): dH_v at
   10 deg C 8,122 cal/mol; H 2.68e-3 atm m^3/mol; H' 0.115; A_B 1.80e6 cm^2; eta 2.22e-4; K_d 0.118;
   C_source 668 ug/m^3 per ug/kg; D_eff 5.54e-3 (A, B) and 1.42e-2 (C); D_T 7.97e-3 cm^2/s; Q_building
   2.54e4 cm^3/s; beta 1.86; psi 8.02e-8 /s; depletion time 2.94e7 s (shorter than the exposure, so the mass
   limit applies); building concentration 2.49e-2 ug/m^3 per ug/kg. Trial: dH_v 8,122, H' 0.1154, K_d 0.1178,
   C_source 668.4, D_T 7.97e-3, mass-limit 2.487e-2 (the rest checked in the slice). Tolerance: half a unit
   in the third printed figure (met, 2026-10-17, by `test/vapor-epa-je.test.ts`). Readings: strata A, B, C are
   measured from grade and the floor lies at 200 cm, so A drops out of the diffusion column (D_T = 200 /
   (100 / 5.54e-3 + 100 / 1.42e-2)); the crack coefficient is the floor layer's; the source soil is stratum C
   (bulk density 1.66, which reproduces psi); the Millington and Quirk exponent is 3.33 as printed (10/3 misses
   5.54e-3, 1.42e-2 and 7.97e-3); the exposure interval is 30 x 365 days; the example enters Q_soil, so the
   sheet's permeability terms (S_te 0.257, k_i 1.85e-9, k_rg 0.854, k_v 1.58e-9 cm^2) are checked as
   computed values only. The printed air viscosity at 10 deg C (1.75e-4 g/(cm s)) is not asserted
   because the guide does not state the formula and the example enters Q_soil.
7. **VISL calculator values.** Slice V6 runs EPA's online VISL calculator once for five chemicals
   (benzene, trichloroethylene, tetrachloroethylene, naphthalene, ethylbenzene; residential, target risk
   1e-6, hazard quotient 1, 25 deg C) and records inputs and outputs with the date, as ROADMAP section 6
   allows for EPA calculators; the engine's groundwater and soil gas screening levels must round to the
   calculator's printed figures. If the calculator cannot be run, the fixture becomes the identity
   below (8c) against the RSL resident air table values already used by M4, and the README says so.
8. **Identities** (1e-12 relative unless stated). (a) Dominant layer with lambda = 0 equals J&E for the
   same column. (b) DeVaull with L_a = 0 equals J&E with the same foundation term; DeVaull with L_a entered
   equals the dominant layer with layer 3 = 0 (1e-10). (c) Attenuation-factor groundwater screening level
   times AF times H' times 1000 L/m^3 equals the target indoor air concentration. (d) J&E alpha tends to the
   diffusion-only form as Q_soil tends to 0 and to A / (1 + A / B) for large xi (1e-9). (e) Jury flux with
   no boundary layer, a = 0 and L large equals C_T0 (D_E / (pi t))^(1/2) (1e-9), and its average over T
   gives the infinite-source VF of `outdoorAir.ssg-vf-1996` (1e-9). (f) Jury mass balance with mu = 0:
   cumulative emission plus remaining mass equals the initial mass (1e-6, quadrature). (g) Box: an area flux
   over the footprint gives F L / (u delta) for any width. (h) Every linear method doubles its output when
   the source doubles; the soil source stops responding above saturation.
9. **Hand cases** (constructed here, 1e-9 relative): one per method with round inputs, including a
   DeVaull fast-reaction case where the quadratic for L_a / L_T has its root inside (0, 1), and one where
   oxygen supply exceeds demand (wholly aerobic).

No published numeric example of `devaull2007` could be verified (the paper is paywalled and the BioVapor
manual prints no worked case with outputs), so the DeVaull method rests on the identities and hand cases;
this gap is recorded in the README and in "References and verification".

## Slice plan

Stage 2 (engine and data), each slice sized for one implementation worker. Every slice writes its failing
tests first, runs the engine test file alone, then the gate once.

| Slice | Files to create or touch | Failing tests first | Depends on | Methods registered |
|---|---|---|---|---|
| V0 data | `packages/data/raw/vapor/epa2004je/` (transcribed CSV, manifest with the PDF's SHA-256), `packages/data/src/vapor/` (build, class list, formulas), `packages/data/generated/vapor/vapor-chemicals.json`, `packages/data/test/vapor.test.ts`, root `data:check` coverage | benzene, TCE and PCE rows match the PDF; every merged row's RSL values are byte-identical to `chemicals.json`; k_w classes cover BTEX and naphthalene | none | none |
| V1 shared kernels | `packages/engine/src/processes/vapor/{units,source,building,henry,index}.ts`, `test/vapor-building.test.ts`, `test/vapor-source.test.ts` | J&E alpha limits (identity 8d); Q_soil hand case; source vapor for soil, soil gas, groundwater, residual phase; Henry correction reproduces the EPA example's 8,122 cal/mol, 2.68e-3 and 0.115 | none (reuses `vadose` diffusion and partitioning helpers) | none |
| V2 legacy indoor (built; registered by V4) | `vapor/legacyJe.ts`, `vapor/dominantLayer.ts`, `test/vapor-legacy.test.ts`, `test/fixtures/vapor/{README.md,risc-r3-r5.json,appendix-j.json}` | Tables R-3, R-4, R-5 at 0.5 percent; Appendix J at 0.01; identity 8a | V1 | `vapor.je-1991`, `vapor.dominant-layer-1998` |
| V3 outdoor and Jury (built; registration deferred to V7) | `processes/outdoorAir/{box,emissions,ssgVf,index}.ts`, `vapor/jury.ts`, `test/outdoor-air.test.ts`, `test/vapor-jury.test.ts` | Table R-6 hand value; identities 8e, 8f, 8g; SSG VF checked against the Table 3-A values printed in `epa1996ssg` (done, within 4 percent) | V1 | `outdoorAir.box`, `outdoorAir.ssg-vf-1996`, `vapor.jury-bam` |
| V4 modern J&E (built) | `vapor/epaJe.ts`, `vapor/textures.ts` (EPA soil class presets), `test/vapor-epa-je.test.ts`, `test/fixtures/vapor/epa2004-sl-adv.json` | EPA 2004 Appendix C example at half a unit in the third figure; foundation types; Q_soil ratio option | V1 (V0 not needed: the fixture carries its own properties) | `vapor.je-epa` (registers `vapor.je-1991` and `vapor.dominant-layer-1998` too) |
| V5 DeVaull | `vapor/devaull.ts`, `test/vapor-devaull.test.ts` | identities 8b; fast-reaction and coupled hand cases; overflow-safe large a | V1, V2 (for the cross-check) | `vapor.devaull-2007` |
| V6 screening | `vapor/attenuationFactor.ts`, `vapor/pviScreen.ts`, `test/vapor-screening.test.ts`, `test/fixtures/vapor/visl.json` | VISL values (or identity 8c); PVI Table 3 boundaries (5 and 5.0001 mg/L, 6 and 15 ft, 66 ft side) | V1 | `vapor.attenuation-factor-2015`, `vapor.pvi-screen-2015` |
| V7 coupling and registration | `vapor/coupling.ts` (M1 water-table series, M2 pore-water and flux series, M3 region 1), `exposure/epc.ts` (`vaporSeriesEpc`), `outdoorAir` `outdoorAirEpc`, engine `index.ts` exports, `references.json` status flips, `docs:generate` | quasi-steady warning; EPC origin is the method id; outdoor sum keeps contributions; the registry test passes with every cited key `used` | V2 to V6 | none new; flips the cited references to `used` |

References each method cites (all must be `used` when registered; V7 flips them, or each registering
slice flips its own): `johnsonettinger1991`, `millingtonquirk1961` (already used), `epa1996ssg` (already
used), `johnson1998`, `astme1739` (not cited: V3 could not confirm it), `epa2004je`, `epa2017je`, `vangenuchten1980`
(already used), `devaull2007`, `api2012biovapor`, `epa2015vi`, `epavisl`, `epa2015pvi`, `lahvis2013`,
`jury1983`, `jury1990`, and `epa2002ssg` only if the Q/C regression is used.

Stage 3 (web), new route `#/vapor`, lazy-loaded like `#/risk`:

| Slice | Files | Failing tests first | Depends on |
|---|---|---|---|
| W1 screen | `apps/web/src/vapor/` (inputs: source kind, chemical picker over `vapor-chemicals.json`, layers with texture presets, building, method switch legacy or modern with comparison), `App.tsx` route and nav link, `App.test.tsx` | route renders; legacy and modern results for the R-3 inputs match the engine; warnings listed; zero overflow at 390x844 and 1280, light and dark | V7 |
| W2 plots and screens | depth-attenuation plot (vapor concentration versus height above the source for each method, log scale, layer bands), indoor and outdoor results, AF and PVI panels | plot data equals the engine profiles; PVI verdict and reasons shown | W1 |
| W3 feeds | feeds from `#/transport` (water table under the building), `#/vadose` and `#/saturated` (soil source, flux) into `#/vapor`, and from `#/vapor` into `#/risk` indoor and outdoor EPCs with origin `vapor.<method>` | the risk screen shows the vapor origin; a series feed produces a series EPC | W1 |

## References and verification (2026-10-16)

| Key | Verified against | Full text read |
|---|---|---|
| `johnsonettinger1991` | Crossref (title, authors, journal, volume, issue, pages, DOI) | No, paywalled; equations as restated by `epa2004je` |
| `johnson1998` | Publisher's standards listing (title, number, December 1998, withdrawn 2013); authors from the reference list of `epa2015pvi` | No |
| `devaull2007` | Crossref | No, paywalled; equations from `api2012biovapor` Appendix B by the same author |
| `api2012biovapor` | The manual (API copy, cover, Appendices B and C) | Yes, Appendices B and C and the default tables |
| `epa2004je` | The guide (EPA archive copy, cover "Revised February 22, 2004", sections 2.1 to 2.9, Appendix C) | Yes, those sections |
| `epa2017je` | The documentation (EPA SEMS copy, cover "Version 6.0, Revised September 2017", sections 1.6, 2.2.3, 2.2.4, 4.4, 4.5) | Those sections |
| `epa2015vi` | The guide (EPA archive copy, cover "OSWER Publication 9200.2-154, June 2015", Table 6-1) | Table 6-1 and its notes |
| `epa2015pvi` | The guide (EPA archive copy, cover "EPA 510-R-15-001, June 2015", Recommendations and section 5, Table 3) | Those sections |
| `epavisl` | EPA VISL user's guide page (default factors, groundwater temperature correction inputs) | The page text; its equations are images |
| `lahvis2013` | Crossref | No, paywalled |
| `jury1983` | Crossref (as in the vadose note) | No |
| `jury1990` | Crossref, with abstract | Abstract only |
| `yao2011`, `yao2013`, `abreu2005`, `abreu2006`, `abreu2009` | Crossref | No; cited only in warnings |
| `epa1996ssg` | As in the saturated-source note | Part 2 Section 2.4.2 (Equation 6, Table 3 Q/C), Section 2.6.3 (Equation 55), Table 3-A, Tables 36, 37 and 39 and Appendix C (Jury equations 1 to 12), read in slice V3 on 2026-10-17 |
| `astme1739` | Not verified beyond its designation; V3 found no public reproduction of the equations | No (a purchased standard); not cited by any method |
| `arcadis2001`, `spence2001` | As in the vadose note; Tables R-3 to R-6 read in the RISC5 guide | Fixture use only |

`biovapor2010` (software, year not verified) is superseded for citation by `api2012biovapor` and stays
`planned`. `pviscreen` stays `planned` for M10.
