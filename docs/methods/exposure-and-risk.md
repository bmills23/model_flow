# Direct exposure and forward risk (methods note for M4)

Equations implemented in `packages/engine/src/processes/exposure/` and
`packages/engine/src/processes/risk/`, in our own words, derived from the primary publications cited
by reference key (see `docs/ATTRIBUTIONS.md` for full entries). The RISC5 manual (chapters 3, 6, 7 and
10, and Table R-9 of its Appendix R review) was used only as a map of which choices RISC5 made; none of
its text, figures or tables is reproduced and its equation labels are not used here. Where a choice is
RISC5's rather than a guidance document's, it is marked "RISC5 choice" and becomes the method's
`risc5Choice` metadata. The chemical and toxicity database that feeds this process is described in
`docs/methods/chemical-database.md` and built by `packages/data` (RSL November 2024).

Status: DONE 2026-10-16 (M4). Methods note, reference check, data plan and fixture plan (stage 1); legacy and modern kernels, presets and hand cases (slices E1 and E2, `packages/engine/src/processes/exposure/`); the scenario runner, series windows, the M1 adapter, additivity and registration (slice E3, `exposure/` and `risk/additivity.ts`, `risk/summary.ts`, registered as `exposure.rags-a-1989` and `exposure.rags-e-f-2014`); and the screen at `#/risk` (slice W1, `apps/web/src/risk/`). The scope calls below are the DEFAULT rulings recorded in `docs/DECISIONS.md` (2026-10-16, M4 block), open to Bryan's overturn.

## What the process is

Given the concentration of each chemical of concern in each medium a receptor contacts (the exposure
point concentration, EPC), the process estimates how much of the chemical the receptor takes in by each
pathway, and turns that intake into an incremental lifetime cancer risk (for carcinogens) and a hazard
quotient (for chemicals with a noncancer reference value). Risks and hazard quotients are then summed by
the additivity rules below into totals per receptor. The process does no fate and transport of its own:
EPCs are entered by the user or taken from the transport output of M1 (which M2 and M3 feed).

## Scope of M4

The nine direct pathways of the ROADMAP M4 row, each with a legacy and a modern variant:

| # | Pathway | Medium (EPC unit at the boundary) | Legacy variant (`exposure.rags-a-1989`) | Modern variant (`exposure.rags-e-f-2014`) | EPC source in M4 |
|---|---|---|---|---|---|
| 1 | Incidental soil ingestion | soil (mg/kg) | dose, RAGS A soil ingestion form | age-segmented intake with relative bioavailability | user-entered constant |
| 2 | Dermal contact with soil | soil (mg/kg) | dose with a dermal-soil absorption fraction | RAGS E absorbed dose (eq. 3.11, 3.12) | user-entered constant |
| 3 | Drinking-water ingestion | groundwater (mg/L) | dose, RAGS A drinking-water form | age-segmented intake | constant, or the M1 receptor-well series |
| 4 | Dermal contact with water while bathing | groundwater (mg/L) | steady-state permeability, RAGS A form | RAGS E event model (eq. 3.1 to 3.4) | constant, or the M1 receptor-well series |
| 5 | Inhalation in the shower | bathroom air (mg/m^3) | dose through inhalation rate and the RfC/IUR conversion | RAGS F exposure concentration | user-entered constant until M7 |
| 6 | Indoor air inhalation | indoor air (mg/m^3) | as 5 | as 5 | user-entered constant until M6 |
| 7 | Outdoor air inhalation | outdoor air (mg/m^3) | as 5 | as 5 | user-entered constant until M6 |
| 8 | Incidental surface-water ingestion while swimming | surface water (mg/L) | dose per hour in the water | age-segmented intake per hour in the water | user-entered constant until M8 |
| 9 | Dermal contact with surface water | surface water (mg/L) | as 4 | as 4 with the swimming event time | user-entered constant until M8 |

Not in M4, and where it goes:

| Item | Where | M4 handling meanwhile |
|---|---|---|
| Shower and sprinkler volatilization models (Foster and Chrostowski; Little); the RSL tap-water inhalation term with the Andelman factor | M7 | Pathway 5 takes a user-entered bathroom air concentration; nothing estimates it from the water concentration |
| Indoor air from soil, soil gas or groundwater (vapour intrusion), outdoor air box and volatilization factors, particulate emission factors | M6 and M7 | Pathways 6 and 7 take user-entered air concentrations. Soil inhalation as the RSL tables compute it (soil times 1/VF plus 1/PEF) is not offered as a pathway; the sweep composes it from the receptor's air coefficient and the volatilization and particulate emission factor methods and compares the printed cells (below) |
| Surface-water mixing and sediment | M8 | Pathways 8 and 9 take a user-entered concentration |
| Irrigation water pathways | M7 | See `docs/methods/shower-irrigation-particulates.md` |
| Homegrown vegetables | M9 | Added as a tenth pathway, `produce` (soil medium, fresh-weight plant factor per class on the chemical, user-entered homegrown fraction), in slice M9-E2; see `docs/methods/plants-and-eco.md`. `DIRECT_PATHWAY_IDS` is the nine above |
| Back-calculation of cleanup levels, individual versus cumulative | M5 | M4 exposes per-pathway linear coefficients (risk and HQ per unit EPC) so M5's direct-pathway case needs no solver |
| Target-organ segregation of the hazard index | Later (no machine-readable target-organ source is in the data plan) | The total HI is reported with each HQ; a warning suggests segregation when the HI exceeds 1 |
| Subchronic and acute noncancer evaluation | Later | Chronic reference values only, as RISC5 |
| Monte Carlo over exposure factors | M10 | Deterministic only |

## Units

SI inside the engine: kilograms, metres, seconds. Concentrations in kg/kg (soil) and kg/m^3 (water,
air); body weight in kg; contact rates in m^3/s (water, air) or kg/s (soil); skin area in m^2;
adherence in kg/m^2; permeability in m/s; times and durations in s; dose rates in kg per kg body
weight per second; slope factors in their reciprocal; inhalation unit risk in m^3/kg; reference dose
in kg/(kg s); reference concentration in kg/m^3. Conversions happen only at the boundary, through
`numerics/units`:

| Quantity | Unit at the boundary (RISC style) | Engine unit |
|---|---|---|
| Soil EPC, Csat | mg/kg | kg/kg |
| Water EPC | mg/L (RSL tables print ug/L) | kg/m^3 |
| Air EPC | mg/m^3 (RSL tables print ug/m^3) | kg/m^3 |
| Body weight | kg | kg |
| Water ingestion rate | L/d | m^3/s |
| Soil ingestion rate | mg/d | kg/s |
| Inhalation rate (legacy) | m^3/h | m^3/s |
| Surface-water ingestion rate | mL/h (legacy), L/h (modern) | m^3/s |
| Skin surface area | cm^2 | m^2 |
| Soil adherence | mg/cm^2 per event | kg/m^2 |
| Permeability Kp | cm/h | m/s |
| Lag time tau, time to steady state t*, event time | h | s |
| Exposure time | h/d | fraction of the day |
| Exposure frequency | d/yr | fraction of the year (d/yr over 365) |
| Exposure duration, lifetime | yr | s, with 365 d per year |
| Oral slope factor | (mg/kg-d)^-1 | (kg/(kg s))^-1 |
| Inhalation unit risk | (ug/m^3)^-1 | m^3/kg |
| Reference dose | mg/kg-d | kg/(kg s) |
| Reference concentration | mg/m^3 | kg/m^3 |
| Doses reported | mg/kg-d | kg/(kg s) |

Exposure years are 365 days, as in every guidance document cited here (the averaging time is the
duration in years times 365 days), not the 365.25-day year used for transport time. When an M1 series
is averaged, the window length is the exposure duration times 365 days on the transport time axis; the
difference from a 365.25-day year (0.07 percent of the window) is not corrected. A pinned exposure
start, and the start year the screen reports, are times on the transport axis and use 365.25-day years,
so year 30 on the risk screen is year 30 on the transport screen.

## Notation

Chemical: oral slope factor SFo, inhalation unit risk IUR, oral reference dose RfDo, inhalation
reference concentration RfC, gastrointestinal absorption fraction GIABS, dermal soil absorption
fraction ABSd, relative bioavailability RBA, mutagen flag; for dermal water, permeability Kp, lag time
tau, ratio B, time to steady state t*, fraction absorbed FA. Receptor or life stage s: body weight BW,
exposure frequency EF (d/yr), duration ED (yr), exposure time ET (h/d), water ingestion IRW, soil
ingestion IRS, soil skin area SAs, water skin area SAw, adherence AF, events per day EV, event time
t_ev (h/event), surface-water ingestion per hour IRsw, lifetime LT = 70 yr. EPC: C (constant) or C(t)
(series). Averaging times: AT_c = LT x 365 d for cancer, AT_nc = ED x 365 d for noncancer (RAGS A
chapter 6, `rags1989`).

## Exposure point concentrations

An EPC is either a constant or a series (times and concentrations, linear between samples). Both
methods reduce a series to the window averages their equations need:

- **Legacy (RISC5 choice):** for the noncancer dose, the largest average over any window of 7 years,
  or of the exposure duration when that is shorter; for the cancer dose, the largest average over any
  window of the exposure duration. Soil is constant in RISC5 (soil EPCs are always constants here).
- **Modern (DEFAULT ruling 4):** the receptor's exposure starts at the time that maximizes the cancer
  risk (a scan over start times); within that window each life stage uses the average over its own
  years (the child segment the first years of the window, the adult segment the rest), so a declining
  plume reaches the child first. Each life stage's HQ uses the largest average over a window of that
  stage's duration. With a constant EPC both reduce to the constant, which is how the RSL check and
  Table R-9 exercise them.

A series that ends before the window does is averaged over the span it covers and warned
(`exposure.series-shorter-than-window`). Averages are exact for the piecewise-linear series
(trapezoids). The moving average is piecewise quadratic in the window start, so the scan visits the
sample-aligned starts (where a window edge meets a sample) and the root of the derivative inside each
piece, which is where the maximum lies; starts are confined to windows fully inside the series, and
only when the series is shorter than the exposure is a covered span averaged (see `docs/DECISIONS.md`,
slice E3).

## Legacy method: RAGS Part A doses (`exposure.rags-a-1989`)

Citations: `rags1989` (chapter 6 intake equations, chapters 7 and 8 risk characterization),
`epa1991sdef` (default exposure factors), `epa1992dea` (steady-state permeability for dermal water).

Each pathway gives a chronic average daily dose for noncancer effects (CADD, with the noncancer window
average) and a lifetime average daily dose for cancer (LADD, with the cancer window average). With
EF in d/yr and ED and LT in years, writing the time factor as F_nc = EF / 365 and F_c = EF ED /
(365 LT):

| Pathway | Daily contact term (per kg body weight) | CADD and LADD |
|---|---|---|
| 1 Soil ingestion | C IRS BIO / BW | contact term times F_nc or F_c |
| 2 Dermal soil | C SAs AF AAF / BW | as 1; AAF is the dermal-soil absorption fraction |
| 3 Drinking water | C IRW / BW | as 1 |
| 4 Dermal water (bathing) | C SAw ET Kp / BW | as 1; ET in h/d, steady-state permeability with no lag time |
| 5, 6, 7 Inhalation | C InhR ET / BW | as 1; InhR in m^3/h, ET in h/d |
| 8 Surface-water ingestion | C IRsw ET / BW | as 1; IRsw per hour in the water |
| 9 Dermal surface water | C SAw ET Kp / BW | as 4 with the swimming exposure time |

Risk and hazard per chemical i and pathway j: risk_ij = SF_ij LADD_ij and HQ_ij = CADD_ij / RfD_ij,
the linear low-dose form of `rags1989` chapter 8.

RISC5 choices recorded on the method:

- **Inhalation as a dose.** The inhalation pathways use an inhalation slope factor and reference dose
  obtained from the IUR and RfC with a 20 m^3/d breathing rate and a 70 kg body weight:
  RfDi = RfC x 20 / 70 and SFi = IUR x 70 / 20 x 1000 (IUR per ug/m^3). These are the default adult
  values of `epa1991sdef`. Because the conversion assumes 20 m^3/d and 70 kg, a receptor with other
  values gets a different risk from the modern form; with 20 m^3/d and 70 kg the two inhalation HQs
  agree exactly (hand case L1).
- **Dermal toxicity** uses the oral SF and RfD unchanged; absorption enters only through AAF (soil) and
  Kp (water). Route-to-route extrapolation of oral values to inhalation, which RISC5's own database
  practised for organics, is off by default and can be switched on per run (warned,
  `exposure.route-extrapolated`); the RSL tables do not extrapolate.
- **BIO** (soil bioavailability) defaults to 1; the RSL arsenic RBA of 0.6 is a modern default only.
- **Two receptors, additive for cancer only** (see "Receptors and additivity").

## Modern method: RAGS Parts E and F, 2014 defaults, ADAF (`exposure.rags-e-f-2014`)

Citations: `rags1989`, `ragse2004`, `ragsf2009`, `epa2014ef`, `epa2005adaf`, `epa2005cancer`,
`epa2012asrba`, `epa2011efh`, `epa2024rslug`.

### Life stages

A resident is one receptor with life stages s, each with its own BW, contact rates, ED_s and ADAF_s
(DEFAULT ruling 5). For a carcinogen that does not act by a mutagenic mode of action there are two
stages, child (ED 6 yr) and adult (ED 20 yr), ADAF 1. For a mutagen there are four, 0 to 2, 2 to 6,
6 to 16 and 16 to 26 yr, with ADAF 10, 3, 3 and 1 (`epa2005adaf`: 10 before the second birthday, 3 from
2 to before 16, 1 after); the 0 to 6 years take the child's exposure factors and 6 to 26 the adult's,
the convention of the RSL user's guide (`epa2024rslug`, section 5.17). A worker is one adult stage.
The mutagen flag comes from the database (`docs/methods/chemical-database.md`). Trichloroethylene and vinyl chloride, which carry the flag, are the exception: see the section on the RSL special cases below.

### Intake for cancer

For each life stage the oral and dermal intakes are summed over stages with their ADAFs, and divided by
the lifetime averaging time:

    ingestion of soil:   risk = SFo RBA C sum_s( IRS_s EF_s ED_s ADAF_s / BW_s ) / AT_c
    drinking water:      risk = SFo C sum_s( IRW_s EF_s ED_s ADAF_s / BW_s ) / AT_c
    surface water:       risk = SFo C sum_s( IRsw_s t_ev,s EV_s EF_s ED_s ADAF_s / BW_s ) / AT_c

with the unit conversions at the boundary (soil ingestion in mg/d times kg/kg). RBA defaults to 0.6
for inorganic arsenic (`epa2012asrba`) and 1 otherwise.

### The RSL special cases: trichloroethylene and vinyl chloride (`epa2024rslug`)

Status: built in wave T (2026-10-23), replacing the earlier treatment of both as ordinary chemicals. Source: the
RSL User's Guide equations for the resident (sections 4.1.1.5 and 4.1.1.6 soil, 4.1.2.5 and 4.1.2.6 tap water,
4.1.3.4 and 4.1.3.5 air) and the recreator (4.6.1.5 and 4.6.1.6 soil or sediment, 4.6.2.5 and 4.6.2.6 surface
water), and the adjustment factors of section 5.18, all read 2026-10-23. The equations are published as images;
the values and forms below were read from them and are implemented here in our own notation. The cancer slope
factor and unit risk the tables carry for both chemicals are adult-based values, so the database values
(`docs/methods/chemical-database.md`) are used unchanged. The mutagen flag the database carries for both
chemicals does not select the ordinary ADAF treatment for a receptor the special equations cover.

**Trichloroethylene.** The cancer and the mutagenic (kidney) parts of the toxicity values differ, so the guide
splits each value into two fractions of the adult-based one: CAF_o = 0.804 and MAF_o = 0.202 for the oral slope
factor (component values 3.7e-2 and 9.3e-3 per mg/kg-d against 4.6e-2), CAF_i = 0.756 and MAF_i = 0.244 for the
inhalation unit risk (3.1e-6 and 1.0e-6 per ug/m^3 against 4.1e-6), the constants as printed to three figures.
The dose of a pathway is the stages (child and adult, ADAF 1) weighted by CAF plus the four ADAF segments
(0 to 2, 2 to 6, 6 to 16, 16 to 26 yr; 10, 3, 3, 1) weighted by MAF:

    risk = SF ( CAF sum_stages( c_s EF_s ED_s / AT_c ) + MAF sum_segments( c_g ADAF_g EF_g ED_g / AT_c ) )

with c the contact term per unit concentration of the pathway (the same terms as the ordinary equations), SF the
oral slope factor for ingestion and dermal pathways (the dermal one divided by GIABS when GIABS is below 0.5) and
the unit risk for inhalation. Dermal water uses one time-weighted event time over the ADAF segments for both
parts, as the ordinary cancer dose does (0.6708 h for the resident).

**Vinyl chloride.** The guide adds to the lifetime-averaged dose of the child and adult stages (no ADAF) the
child's daily dose once more, with no frequency, duration or averaging, which is the non-prorated early-life
exposure that the IRIS assessment combines with continuous lifetime exposure:

    risk = SF ( sum_stages( c_s EF_s ED_s / AT_c ) + c_child )          ingestion and dermal
    risk = IUR C ( sum_stages( ET_s EF_s ED_s / AT_c ) + 1 )            inhalation

The inhalation addition is a unit contact (the air is breathed continuously from birth). Dermal water uses the
ED-weighted event time of the child and adult stages (0.6708 h for the resident).

**Where it applies.** To every receptor with ADAF segments (`mutagenStages`): the RSL resident, the child
resident of the screen and any receptor the user edits from them, for every pathway of the chemical except
vinyl chloride in shower air and in homegrown produce, which the guide gives no early-life term for. Those
pathways use the mutagen equation with the age-dependent adjustment factors (10, 3, 3 and 1), because the
database flags vinyl chloride as a mutagen; that is the more conservative form (shower air is about 2.6 times the
form without the factors) and the warning says so. Vinyl chloride also needs the first stage of the receptor to
be a child stage, since the unaveraged term is the child's dose: for an engine receptor whose first stage is an
adult it uses the same mutagen equation and is warned. The noncancer hazard quotients are never affected. Surface water ingestion and dermal contact follow the recreator equations of the guide
(time-weighted event time over the same stage sets). A receptor without ADAF segments, the composite worker, uses
the ordinary equation, as the RSL does for workers, and is warned. The legacy method has no age-dependent
adjustment and is unchanged. Because every consumer reads the pathway coefficients, the cleanup levels, the
vapor and household paths and the uncertainty runs follow without a copy of the equations.

**Concentration series.** The cancer terms of the two chemicals are not one per life stage. A trichloroethylene
run has the child and adult terms and the four ADAF terms (six per-term averages, all starting at the exposure
start), a vinyl chloride run the child and adult terms and the child's unaveraged term, whose concentration is
the average over the child's years. With a constant concentration this reduces to the equations above.

**Entered cancer values.** When a project overrides the slope factor or unit risk of either chemical, the
equations are applied to the entered value in the guide's own proportions (the constants above) and
`exposure.special-case-override` says so, once for each entered value a switched-on pathway uses, quoting the
proportions of that value only (oral for the slope factor, inhalation for the unit risk). The cleanup screen gets
the same two special-case warnings as the risk screen.

**Checks.** `packages/engine/test/exposure-special-cases.test.ts` writes each equation out from the guide in its
own units; the RSL sweep reproduces every trichloroethylene and vinyl chloride cell the engine computes (tap water
including the household inhalation term, resident soil ingestion, resident air) and the VISL comparison
reproduces the resident trichloroethylene cancer level, both at the unchanged tolerance. The soil inhalation
cancer cells and totals of the two chemicals reproduce as well (wave U, below).

### Soil inhalation as the RSL tables compute it (the wave U comparison)

The RSL soil inhalation level of a receptor is its air level times the air concentration per unit soil
concentration, 1/VF + 1/PEF (user's guide sections 4.1.1 and 4.2.1, equation images read 2026-10-23): the
resident at 350 d per year and 24 h per day, with the child and adult noncancer forms and the life-stage and
special-case cancer forms as for air, and the composite worker at 250 d and 8 h. The soil total is the harmonic sum
of the ingestion, dermal and inhalation levels. The exposure method already gives the air coefficient
(`indoorInhalation`, the same exposure terms), so no pathway is added: `rslSweepHelpers.ts` multiplies it by
1/VF + 1/PEF and compares the printed cells at half a unit of the second figure.

The factors are `outdoorAir.ssg-vf-1996` (infinite source) and `particulate.ssg-pef-2002`, with the RSL inputs of the
default parameter file the guide links (SEMS 404323, sheets "Chronic VF, Csat" and "PEF Wind"): dispersion factor
for volatiles 68.18 g/(m^2 s) per kg/m^3 (0.5 acre), exposure interval 26 years (8.2e8 s), dry bulk density 1.5,
particle density 2.65 (porosity 1 - 1.5/2.65), water-filled porosity 0.15, organic carbon 0.006, Kd = Koc f_oc,
pi printed as 3.14, and the wind factor with Q/C 93.77 (PEF 1.36E9 m^3/kg). A chemical the tables call volatile takes
both terms and the others take the particulate term. These differ from the engine's soil screening guidance defaults
only in values the VF method already takes as options (Q/C, interval, soil), so the engine is unchanged; the test
rescales the factor by sqrt(3.14 / pi). The porosity is the computed 0.434, not the rounded 0.43 the guide prints
beside it: with 0.43, 38 of 84 resident volatile cancer cells reproduce, with 0.434, 83 do.

Result: of 435 inhalation cells and 435 totals that include one in each soil table, 421 and 422 (resident) and 422
and 421 (industrial) reproduce. Twelve volatile chemicals with neither a Koc nor a Kd in the parameter sheet print
the particulate-only level, so the VF method has no input for them and the sweep excepts their 13 inhalation cells
and 13 totals per table (it checks that the particulate-only level matches the printed cell). The vinyl chloride
equation image prints the volatilization factor term only; the sweep adds the particulate term (under one part in
100000 of the sum). Unexplained: the resident noncancer inhalation level of PCB 105 (840 printed, 833.3 computed) and
the industrial noncancer total of n-nonane (72 printed, 72.5012 computed, 0.002 percent above the limit). The counts
are in `docs/VALIDATION.md`, recomputed from the test data.

### Dermal absorbed dose (`ragse2004`)

Soil (eq. 3.12, then 3.11): the dose absorbed per event is DA_ev = C AF ABSd, and the dermally absorbed
dose rate is DA_ev SAs EV EF ED / (BW AT).

Water (eq. 3.2 to 3.4, then 3.1), per event of duration t_ev:

- organic chemicals, t_ev <= t*: DA_ev = 2 FA Kp C sqrt(6 tau t_ev / pi)
- organic chemicals, t_ev > t*: DA_ev = FA Kp C ( t_ev / (1 + B) + 2 tau (1 + 3B + 3B^2) / (1 + B)^2 )
- inorganic chemicals: DA_ev = Kp C t_ev

and the dose rate is DA_ev EV EF ED SAw / (BW AT), summed over life stages with their ADAFs for cancer.

Which form applies is a property of the chemical, not of the columns present: the RSL fills tau, t* and B
for inorganics too (using the lag-time form for cadmium, mercury salts, nickel or zinc overstates the
dermal hazard 1.8 to 7 times). The RSL has no organic flag, so the database classifies each analyte from
its published November 2024 tap water dermal value: the one form that reproduces it (`dermalForm`, 569
organic, 121 inorganic; see `docs/DECISIONS.md`, slice E2). Where the table publishes no dermal value the
form is unknown, the engine does not quantify dermal water (`organic` has no default) and the pathway is
reported as not quantified until the caller states a form.
The branch is chosen per life stage, because child and adult event times differ (0.54 and 0.71 h for
bathing in `epa2014ef`). For the cancer dose the RSL tables use one time-weighted event time for every
stage, 0.6708 h (the RSL default-parameter file's `ETevent-res-adj` and `ETevent-res-madj`, which holds for
mutagens as well); the engine follows that convention so the independent check reproduces the published
values, carrying 0.6708 h as the resident preset's `cancerBathingTimeHr` (the ED-weighted mean of the
stages' own times, 0.67077 h, is the fallback for a receptor without one). The hazard quotient uses each
group's own event time (DEFAULT ruling 6, amended: see `docs/DECISIONS.md`, slice E2).

Dermal toxicity values (`ragse2004`, chapter 4): SF_derm = SFo / GIABS and RfD_derm = RfDo x GIABS when
GIABS is below 0.5; otherwise the oral values are used unchanged. A chemical without ABSd has no soil
dermal pathway (the RSL convention for volatiles and most inorganics), reported as not quantified, not
as zero. A chemical outside the RAGS E effective prediction domain (the database's EPD flag) is still
computed and is warned (`exposure.dermal-outside-epd`), where the RSL tables omit the value (DEFAULT
ruling 7).

### Inhalation exposure concentration (`ragsf2009`)

    EC = C ET EF ED / AT     (ET in h/d, AT in hours)

risk = IUR sum_s( C ET_s EF_s ED_s ADAF_s ) / AT_c and HQ = EC_nc / RfC, with AT_nc = ED x 365 x 24 h.
No inhalation rate or body weight enters. The shower pathway uses the bathing event time as ET.

### Noncancer intake

Each life stage has its own HQ with its own ED as averaging duration: for example the child's
drinking-water HQ = C IRW_c EF_c / (BW_c RfDo). The receptor's headline HI is the larger of the life
stages' HIs (the child for the residential defaults, matching the RSL tables, which report the child),
and both are shown. Life-stage HQs are never added to each other.

## Receptors and additivity

- **Two simultaneous receptor scenarios (RISC5 choice, both methods).** A run evaluates one or two
  receptors (A and B), each with its own pathways, exposure factors and labels, side by side (for
  example a resident and a composite worker, or reasonable-maximum and typical factors).
- **Within a receptor:** cancer risk sums over pathways and chemicals; the HI sums HQs over pathways and
  chemicals (`rags1989` sections 8.2.2 and 8.3). Pathways are combined only for the same receptor.
- **Across receptors:** never, except the legacy additive option, which adds A's and B's cancer risks
  (the RISC5 way to build a child-plus-adult resident) and never their HIs. The modern resident is
  already age-segmented (it covers a child and an adult), so the additive option combined with a modern
  resident is a RangeError (it would count the child twice); it stays available for two non-segmented
  modern receptors, including the child resident alone (its two mutagen segments are both the child) plus
  the worker.
- **A chemical without a value for a route** contributes nothing to that route and the cell is "not
  quantified" (`null`), never zero. A run whose totals omit a pathway because no value exists says so
  (`exposure.not-quantified`).
- **Linear form.** Both methods use risk = slope times dose; a single-cell or total risk above 0.01 is
  warned (`risk.linear-above-0.01`), the bound `rags1989` gives for the linear form.

## Default exposure factors

Values the engine carries as presets (the user may change any of them). Legacy presets come from
`epa1991sdef` and `rags1989`, not from RISC5's receptor database, which is not reproduced.

| Factor | Legacy resident adult | Legacy resident child | Legacy worker | Modern resident child | Modern resident adult | Modern composite worker |
|---|---|---|---|---|---|---|
| BW (kg) | 70 | 15 | 70 | 15 | 80 | 80 |
| EF (d/yr) | 350 | 350 | 250 | 350 | 350 | 250 |
| ED (yr) | 24 (30 for an adult-only resident) | 6 | 25 | 6 | 20 | 25 |
| Drinking water (L/d) | 2 | (entered) | 1 | 0.78 | 2.5 | (entered) |
| Soil ingestion (mg/d) | 100 | 200 | 50 | 200 | 100 | 100 |
| Inhalation (legacy) | 20 m^3/d | (entered) | 20 m^3 per workday | not used | not used | not used |
| Air ET (h/d) | 24 indoor | 24 indoor | 8 | 24 | 24 | 8 |
| Soil skin area (cm^2/d), AF (mg/cm^2) | blank, entered (exhibit 6-15, see below) | idem | idem | 2373, 0.2 | 6032, 0.07 | 3527, 0.12 |
| Bathing skin area (cm^2), time (h/d), days/yr | 19,400, blank, blank (exhibit 6-13) | 7,280, blank, blank | none | 6365, 0.54, 1 | 19652, 0.71, 1 | none |
| Swimming: IRsw, time, EF | 50 mL/h (exhibit 6-12), time and frequency blank; skin area as bathing | idem | none | 0.12 L/h, site-specific | 0.11 L/h (mutagen segments 0.12, 0.12, 0.124, 0.0985 L/h, as the RSL file), site-specific | none |

Sources: `epa1991sdef` for the legacy body weights, frequencies, durations, ingestion and inhalation
rates; `epa2014ef` for the modern resident and composite worker values (the directive tabulates the
1991 and 2014 values side by side); `epa2011efh` for the modern surface-water ingestion rates as the
RSL default-parameter list cites them. The legacy dermal and swimming values sit in `rags1989` exhibits 6-12, 6-13 and 6-15, which are images in
the EPA copy; they were read from 110 dpi renders of the PDF pages (PDF pages 145 to 151; printed pages
6-36, 6-37, 6-38, 6-40, 6-41, 6-42) on 2026-10-16. What the exhibits give, and what the presets carry:

| Exhibit (printed page) | What it gives | Preset |
|---|---|---|
| 6-12 swimming ingestion (6-36) | contact rate 50 mL/h; frequency pathway-specific, 7 d/yr as the national average for swimming; ED 70 (lifetime), 30 (90th percentile at one residence), 9 (median); BW 70 kg adult | IRsw 50 mL/h. Frequency left blank: see the ruling below |
| 6-13 dermal water (6-37, 6-38) | total body surface area, 50th percentile, male/female (m^2): 3 to under 6 yr 0.728/0.711, 6 to under 9 0.931/0.919, 9 to under 12 1.16/1.16, 12 to under 15 1.49/1.48, 15 to under 18 1.75/1.60, adult 1.94/1.69; body parts for males (arms, hands, legs): adult 0.23, 0.082, 0.55; permeability constant chemical-specific; exposure time pathway-specific (2.6 h/d is the national swimming average); EF pathway-specific (7 d/yr swimming) | water skin area: adult 19,400 cm^2, child (3 to under 6 yr) 7,280 cm^2, both male values. Time and frequency blank |
| 6-14 soil ingestion (6-40) | 200 mg/d for ages 1 to 6, 100 mg/d older; EF 365 d/yr; BW 70 kg adult, 16 kg for ages 1 to 6 | 200 and 100 mg/d from `epa1991sdef`; BW 15 kg and EF 350 d/yr from `epa1991sdef` (the exhibit is the 1989 value) |
| 6-15 dermal soil (6-41, 6-42) | the same body surface and body-part tables; adherence 1.45 mg/cm^2 (commercial potting soil, hands) and 2.77 mg/cm^2 (kaolin clay, hands); ABS chemical-specific; EF pathway-specific | Skin area and adherence blank. The exhibit names no exposed body parts and its two adherence values are single-soil experiments on hands, so neither is a default |

Sources for the other legacy values: `epa1991sdef` for body weights, frequencies, durations, ingestion
and inhalation rates; `epa2014ef` for the modern resident and composite worker values (the directive
tabulates the 1991 and 2014 values side by side); `epa2011efh` for the modern surface-water ingestion
rates as the RSL default-parameter list cites them. No national default exists for recreational
frequency or event time in either method: the swimming pathways require them
(`exposure.site-specific-required` until entered), and so do the bathing time and frequency, the dermal
soil area and adherence, the outdoor air time, and the child's drinking-water and inhalation rates.
The risk screen's site-specific panel offers an entry for each of these blanks (drinking water, skin area
for water and swimming, breathing rate for the legacy method), so no pathway a warning names is
unreachable.

## Where the manual is ambiguous, and what we chose

| Point | Reading adopted | Status |
|---|---|---|
| The dermal-water cancer dose is written with the 7-year maximum concentration where the other pathways use the exposure-duration average | The exposure-duration average, as for every other cancer dose | Treated as a typo |
| Which concentration the noncancer dose uses when the duration exceeds 7 years | Largest 7-year moving average | RISC5 choice, reproduced |
| How RISC5 forms inhalation risk when the database gives an IUR and RfC | Converted to SFi and RfDi with 20 m^3/d and 70 kg, then applied to a dose | RISC5 choice, reproduced in the legacy method only |
| Whether two receptors' hazard indices may be summed | Never; only cancer risks in the additive option | RISC5 choice |
| Target-organ grouping of HQs | Not done; total HI with a warning above 1 | RISC5 choice |
| Soil concentration over time | Constant | RISC5 choice |
| How the modern method handles time-varying groundwater | Start time maximizing the cancer risk, life stages in sequence within the window | DEFAULT ruling 4 |

## Validity checks

RangeError (both methods): non-finite inputs; negative EPCs or contact rates; BW, ED, LT or a
reference value not positive where used; EF above 365 d/yr; ET above 24 h/d; a fraction (BIO, RBA,
AAF, ABSd, GIABS, FA) outside [0, 1]; ED above LT; a series with unordered or negative times; more than
two receptors; the additive option with a modern age-segmented resident; a pathway switched on with no
EPC for any chemical.

Warnings (codes are part of the result):

| Code | Method | Condition |
|---|---|---|
| `exposure.not-quantified` | both | a pathway is on but a chemical has no toxicity value for its route |
| `exposure.series-shorter-than-window` | both | an EPC series ends before the averaging window does |
| `exposure.route-extrapolated` | legacy | route-to-route extrapolation was switched on and used |
| `exposure.dermal-outside-epd` | modern | dermal water computed for a chemical outside the RAGS E prediction domain |
| `exposure.giabs-adjusted` | modern | a dermal toxicity value was adjusted because GIABS < 0.5 |
| `exposure.special-case-not-modelled` | modern | trichloroethylene or vinyl chloride on a receptor or pathway the RSL equations for them do not cover (no early-life segments; vinyl chloride in shower air or homegrown produce, or with a first stage that is not a child); the ordinary equation is used, or for a mutagen the equation with the age-dependent adjustment factors, and the message names what is not covered; raised by the risk and cleanup screens |
| `exposure.special-case-override` | modern | trichloroethylene or vinyl chloride with an entered cancer value: the RSL equations are applied to it; raised by the risk and cleanup screens |
| `exposure.site-specific-required` | both | a swimming pathway lacks a frequency or event time |
| `exposure.csat-exceeded` | both | a soil EPC exceeds the chemical's Csat (dermal and ingestion assumptions may not hold) |
| `exposure.soil-ceiling` | both | a soil EPC exceeds 1e5 mg/kg (10 percent of the soil by mass) |
| `risk.linear-above-0.01` | both | a risk above 0.01 from the linear form |
| `risk.hi-above-1-unsegregated` | both | the HI exceeds 1 and is a total over all target organs |

Assumptions listed on both methods (not warnings): EPCs are those at the point of contact (no further
fate); chronic reference values; additivity of risks and of HQs within a receptor; no interaction
between chemicals; the receptor is exposed for the whole window chosen.

## Coupling to M1, M2 and M3, and the hand-off to M5

- **Groundwater:** the M1 receptor-well breakthrough (screen-averaged concentration versus time, in
  kg/m^3 and s) is the EPC series for drinking water and bathing. M2 and M3 reach M4 only through M1
  (their release feeds the transport run). The engine adapter takes the series as it is, and the
  modern scan or legacy window averages it.
- **Soil:** a constant entered by the user. The screen may prefill it from the M2 or M3 screen's soil
  concentration, but a depleting soil EPC is not coupled (RISC5 holds soil constant).
- **Air and surface water:** user-entered constants until M6, M7 and M8 supply them; the result records
  each EPC's origin (`entered` or the producing method id) so a later milestone can replace it without
  changing M4.
- **Hand-off to M5:** for a constant EPC every pathway is linear, so the engine returns, per receptor,
  chemical and pathway, the risk and HQ per unit EPC. M5's direct-pathway cleanup level for a target is
  the target over the summed coefficient; for a series it scales the series (Brent on the scale factor,
  M5's job).

## Fixture plan

Fixtures go in `packages/engine/test/fixtures/exposure/` with a README recording sources, pages and
every reading below.

1. **Table R-9 of the review (`arcadis2001`), legacy method.** The RISC5 guide reproduces only page 1
   of the table's three; it covers arsenic, benzene, benzo(a)pyrene and TPH aliphatic C12-C16 at 5 mg/kg
   in soil and 2 mg/L in water. Rows used in M4: soil ingestion, dermal soil, groundwater ingestion and
   dermal contact in the shower, each with dose, cancer risk and HI. Rows deferred: inhalation in the
   shower (needs the M7 shower model) and root vegetables (M9). Pages 2 and 3 are not available. The
   table lists no exposure inputs; following the Table R-7 convention, the inputs come from the RISC4
   manual (`spence2001`) for this case only, not as product defaults: the adult resident
   reasonable-maximum factors of its Table 6-2 (BW 70 kg, LT 70 yr, ED 30 yr, EF 350 d/yr, soil 100
   mg/d, water 2 L/d, shower skin area 23,000 cm^2, shower time 0.2 h/d) and the four chemicals' values
   from its Table 11-1 (oral slope factors 1.5, 0.029 and 7.3 per mg/kg-d for arsenic, benzene and
   benzo(a)pyrene; oral reference doses 3e-4 for arsenic and 0.1 mg/kg-d for the TPH fraction;
   dermal-soil absorption 0.03 for arsenic and 0.1 for the others; Kp 1e-3, 0.021, 1.2 and 8.2 cm/h).
   BIO = 1. Readings: the table's "CDI" is the noncancer dose CADD (no ED/LT factor) and its risk is
   SF x CADD x ED / LT; the dermal-soil rows need a product SAs x AF of 5,750 cm^2 mg/cm^2, which no
   RISC4 default gives (Table 6-2's 23,000 x 0.56 x 0.2 = 2,576 does not reproduce the rows), so 5,750
   is back-solved from the table and those rows test only the arithmetic and the absorption ratio.
   Targets: the review's "calculated" row, within half a unit in its last printed digit; a "NQ" cell
   asserts a `null` risk or HQ. This reproduces the review's arithmetic and is not evidence of model
   accuracy.
2. **Independent check against the EPA RSL tables (`epa2024rsl`, November 2024 edition), modern method.**
   With the modern presets and the RSL's own toxicity and dermal parameters for each chemical, the
   engine's screening level for a pathway (target risk 1e-6 or HQ 1, divided by the linear coefficient)
   must round to the published two-figure value (half a unit in the second significant figure). Values,
   from the resident soil (mg/kg), composite worker soil (mg/kg), resident tap water (ug/L) and resident
   air (ug/m^3) tables:

   | Chemical | Table and pathway | Cancer SL | Child (or worker) noncancer SL | What it exercises |
   |---|---|---|---|---|
   | Arsenic, inorganic | resident soil, ingestion | 0.77 | 39 | RBA 0.6 |
   | Arsenic, inorganic | resident soil, dermal | 5.5 | 330 | ABSd 0.03 |
   | Arsenic, inorganic | composite worker soil, ingestion / dermal | 3.6 / 17 | 580 / 2800 | worker stage |
   | Benzo(a)pyrene | resident soil, ingestion / dermal | 0.15 / 0.46 | 23 / 76 | mutagen ADAF, ABSd 0.13 |
   | Arsenic, inorganic | tap water, ingestion / dermal | 0.052 / 9.7 | 6.0 / 1400 | inorganic dermal (eq. 3.4) |
   | Benzene | tap water, ingestion / dermal | 1.4 / 9.8 | 80 / 610 | organic, t_ev <= t* (eq. 3.2) |
   | Acetone | tap water, dermal | none | 4,400,000 | organic, t_ev > t* (eq. 3.3) |
   | Chloroform | tap water, dermal | 29 | 2500 | organic dermal |
   | Methylene chloride | tap water, ingestion / dermal | 13 / 350 | 120 / 3700 | mutagen, oral and dermal |
   | Benzo(a)pyrene | tap water, ingestion | 0.025 | 6.0 | mutagen; dermal omitted by the RSL (outside the EPD) |
   | Benzene | resident air | 0.36 | 31 | IUR, RfC |
   | Naphthalene | resident air | 0.083 | 3.1 | IUR, RfC |
   | Methylene chloride | resident air | 100 | 630 | mutagen inhalation |

   The tap-water inhalation SLs are not checked (Andelman factor, M7). The fixture JSON records each
   value with its table, document number and the input values used, read from the committed RSL
   spreadsheets (see the data plan).
3. **Hand calculations** (constructed here; arithmetic tolerance 1e-9 relative). Toxicity inputs are
   the November 2024 RSL values for benzene (SFo 0.055 per mg/kg-d, IUR 7.8e-6 per ug/m^3, RfDo 0.004
   mg/kg-d, RfC 0.03 mg/m^3) and benzo(a)pyrene (SFo 1, RfDo 3e-4, GIABS 1, ABSd 0.13, mutagen), and
   for benzene's dermal water the RSL Kp 0.0149 cm/h, tau 0.287934 h, B 0.0506501, t* 0.691041 h, FA 1.
   - Case L1, legacy adult resident (BW 70, ED 30, EF 350, LT 70), benzene 0.01 mg/L in drinking water
     (2 L/d) and 0.001 mg/m^3 indoor air (20 m^3/d over 24 h/d). Expected: water CADD 2.7397260e-4 and
     LADD 1.1741683e-4 mg/kg-d, risk 6.4579256e-6, HQ 0.068493151; air dose identical, SFi 0.0273
     per mg/kg-d, RfDi 0.0085714286 mg/kg-d, risk 3.2054795e-6, HQ 0.031963470.
   - Case M1, modern resident, same EPCs. Expected: air EC for cancer 0.35616438 ug/m^3, risk
     2.7780822e-6, child HQ 0.031963470 (equal to L1's, by construction); drinking-water age-adjusted
     factor 327.95 L/kg, risk 7.0595890e-6, child HQ 0.12465753; bathing (0.6708 h for cancer, 0.54 h
     child) DA_ev / C 0.01809922 cm, dermal factor 2,610,650 cm^2-event/kg, risk 1.0171390e-6, child HQ
     0.016518954.
   - Case M2, modern resident, benzo(a)pyrene 1 mg/kg in soil. Expected: mutagenic soil ingestion
     factor 166,833.33 mg/kg, ingestion risk 6.5296804e-6; mutagenic dermal factor 428,260 mg/kg,
     dermal risk 2.1790137e-6; child HQ ingestion 0.042617960, dermal 0.013147215.
4. **Identities** (1e-12 relative). (a) A constant series gives the same result as the constant EPC,
   both methods. (b) Every pathway is linear in the EPC: doubling it doubles risk and HQ, and the
   linear coefficients times the EPC reproduce the result. (c) With 20 m^3/d and 70 kg the legacy and
   modern inhalation HQs agree. (d) A mutagen's ingestion risk over a non-mutagen's, same inputs, equals
   the ADAF-weighted over the unweighted age-adjusted factor (166,833.33 / 36,750 for soil). (e) The
   additive option equals the sum of the two receptors' cancer risks and leaves each HI unchanged. (f)
   For a declining series, the modern maximizing start time gives a risk no smaller than any other
   start time sampled on a fine grid.

## References and verification (2026-10-16)

| Key | Verified against | Full text read |
|---|---|---|
| `rags1989` | EPA copy (cover: EPA/540/1-89/002, December 1989, Interim Final) | Chapters 6 and 8 text; exhibits are images, read in the engine slice |
| `ragse2004` | EPA copy (cover: EPA/540/R/99/005, OSWER 9285.7-02EP, July 2004, Final) | Equations 3.1 to 3.4, 3.11, 3.12, the GIABS cutoff of chapter 4 |
| `ragsf2009` | EPA copy (cover: EPA-540-R-070-002, OSWER 9285.7-82, January 2009, Final) | Section 1 and equations 6 and 8 |
| `epa2014ef` | EPA copy (memorandum dated February 6, 2014, OSWER Directive 9200.1-120) | Attachment table of 1991 and 2014 values |
| `epa1991sdef` | EPA SEMS copy (OSWER Directive 9285.6-03, March 25, 1991, Interim Final) | Default factor tables |
| `epa2005adaf` | EPA copy (cover: EPA/630/R-03/003F, March 2005) | ADAF section |
| `epa2005cancer` | EPA copy (cover: EPA/630/P-03/001F, March 2005) | Cover and contents only |
| `epa2012asrba` | EPA SEMS copy (OSWER 9200.1-113, December 2012) | Cover and recommendation |
| `epa1992dea` | ORNL RAIS copy of the EPA report (cover: EPA/600/8-91/011B, January 1992, Interim Report) | Cover only |
| `epa2011efh` | Federal Register notice of availability (76 FR, October 3, 2011) and EPA record (EPA/600/R-09/052F) | Chapter 13 read (M9 produce preset, 2026-10-18); elsewhere not read, values used only as the RSL list cites them |
| `epa2024rsl`, `epa2024rslug`, `epa2003toxhier` | See `docs/methods/chemical-database.md` | |
| `arcadis2001`, `spence2001` | As in the vadose note; Table R-9 page 1 read in the RISC5 guide, RISC4 Tables 6-2 and 11-1 read | Fixture use only |

The ten keys cited by the two registered methods (`rags1989`, `epa1991sdef`, `epa1992dea`, `ragse2004`,
`ragsf2009`, `epa2014ef`, `epa2005adaf`, `epa2005cancer`, `epa2012asrba`, `epa2011efh`) were marked `used`
when slice E3 registered the methods (2026-10-16); the others stay `data` or `fixture`.
