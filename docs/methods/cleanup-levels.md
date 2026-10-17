# Cleanup levels (methods note for M5)

Equations implemented in `packages/engine/src/processes/cleanup/`, in our own words, derived from the
primary publications cited by reference key (see `docs/ATTRIBUTIONS.md` for full entries). The RISC5
manual (chapter 8 and section R.6 of its Appendix R review) was used only as a map of which options RISC5
offers; none of its text, figures or tables is reproduced and its equation labels are not used here.
Where a choice is RISC5's rather than a guidance document's, it is marked "RISC5 choice" and becomes the
legacy method's `risc5Choice` metadata. The process reuses the M4 exposure kernels
(`docs/methods/exposure-and-risk.md`), the M1, M2 and M3 forward chains, and the root finders of
`packages/engine/src/numerics/roots.ts`.

Status: methods note, reference check, fixture plan and slice plan done 2026-10-16 (stage 1). Slice C1 (the SSG
leaching functions in `cleanup/ssg.ts`, fixture 1, H3 and H4) and slice C2 (direct back-calculation in
`cleanup/direct.ts` and `cleanup/targets.ts`, H1, H2, fixtures 3 and 4, identities d and g), the data slice D2, slice C3 (the solver and modeled chains in `cleanup/solve.ts` and
`cleanup/chains.ts`) and slice C4 (registration of `cleanup.rags-b-1991`, `cleanup.rags-e-f-2014`,
`cleanup.ssg-leaching` and `cleanup.modeled-chains` in `cleanup/index.ts`) landed on the branch. Slice W1 (the screen at `#/cleanup` with direct levels, `apps/web/src/cleanup/`) landed. Slice W2 (modeled chains and MCL targets on the screen: dissolved, vadose and saturated sources through the groundwater screen's aquifer, run in a worker) landed with one deviation from the slice plan: a modeled source is solved for one chemical (the feeds describe one chemical's transport; the picked chemical supplies toxicity only), so allocation among chemicals applies to direct media only, and a dissolved source's solubility ceiling is a typed field because the risk subset of the database carries no solubility. Slice W3 (the SSG leaching panel, `apps/web/src/cleanup/ssg.ts` and `SsgPanel.tsx`) landed: DAF 1, 20 or site-specific with the mixing-depth readout and cap warning, an MCL, user or risk-based tap water target, an optional source depth for the mass-limit level, the Csat flag, and the published RSL SSL at DAF 1 beside the computed one (a ratio is shown only when the DAF is 1 and the target kind matches the published column). Deviations from the slice plan: the panel is a switch beside the chosen source rather than a source of its own; the `cleanup.tapwater-inhalation-omitted` warning is raised by the web SSG panel from the database flag, and by the engine's direct back-calculation for a chemical the caller marks `volatile`, which the screen does from the same database flag (`apps/web/src/cleanup/build.ts`); no Kd or Koc override is offered, the database values are used. The scope calls below are the DEFAULT rulings recorded in `docs/DECISIONS.md`
(2026-10-16, M5 block), open to Bryan's overturn.

## What the process is

The forward process (M1 to M4) runs from a source concentration to a risk. A cleanup level runs the other
way: given a target (an incremental cancer risk, a hazard quotient, or a concentration in groundwater
such as a maximum contaminant level), find the concentration in the source medium at which the target is
just met. Two kinds of chain are inverted:

- **Direct pathways:** the source medium is the medium the receptor contacts (soil, groundwater at the
  tap, air, surface water). Every M4 pathway is linear in its EPC, so the inversion is closed form.
- **Modeled pathways:** the source is upstream of the receptor (a soil source leaching through the
  vadose zone, a saturated soil source, a dissolved groundwater source) and the EPC is the M1 receptor-well
  breakthrough. Some of these chains are nonlinear in the source concentration, so the inversion is a
  root find (Brent's method).

A third, screening-level calculation sits beside them: the EPA Soil Screening Guidance soil-to-groundwater
level, which inverts an equilibrium partition equation and a dilution attenuation factor (DAF) in closed
form. It is the regulatory screening option moved here from M2.

## Scope of M5

| Item | M5? | Notes |
|---|---|---|
| Back-calculation for the nine M4 direct pathways, legacy (RAGS A 1989) and modern (RAGS E/F 2014) exposure | Yes | Closed form from the M4 linear coefficients |
| Targets: cancer risk and hazard quotient (both methods); concentration targets in groundwater (MCL from the database, or user-entered) | Yes | Concentration targets only for groundwater, as RISC5 (see "Targets") |
| Individual (per chemical, pathways summed), cumulative (proportional scaling of all chemicals) and equal allocation | Yes | Individual is the default (ruling 4) |
| Modeled chains: M1 dissolved source (AT123D, Wexler, Domenico comparison), M2 vadose source (VADSAT legacy, layered modern), M3 saturated source (two-region, exponential), each through the M1 receptor well into drinking water and bathing | Yes | Brent on the source concentration |
| EPA Soil Screening Guidance 1996/2002 soil-to-groundwater level with DAF 20, DAF 1 or a site-specific DAF, the mass-limit level, and the soil saturation check | Yes | New method `cleanup.ssg-leaching` |
| MCL column and published SSL columns from the committed RSL files | Yes, as a data slice | No data package edit in stage 1 |
| Vapour pathways (indoor air from soil or groundwater, outdoor air) as modeled chains | No; M6 | Their EPCs stay user entered and get their own direct cleanup level per medium |
| Shower inhalation from tap water (Andelman factor), particulates, irrigation | No; M7 | The RSL tap water and resident soil totals include these terms, so the fixtures avoid them |
| Surface water as a modeled target medium | No; M8 | RISC5 allows a surface-water target when that model runs; it arrives with M8 |
| Plant uptake, TPH fraction cleanup levels (TPHCWG, RISC5 Appendix Q) | No; M9 | |
| Probabilistic cleanup levels | No; M10 | Deterministic only, as RISC5 |
| Target-organ segregation of the hazard index | No (deferred in M4) | Cumulative HI is a total over all organs, warned |
| pH-dependent Kd for metals and pH-dependent Koc for ionizing organics (SSG TBD Tables 42 and 46) | No | The RSL Kd (the pH 6.8 value for the SSG metals) is the default; a site Kd is a user entry |

## Units

SI inside the engine, as in M1 to M4: kg/kg for soil, kg/m^3 for water and air, m and s. Boundary units:

| Quantity | Unit at the boundary | Engine unit |
|---|---|---|
| Target cancer risk, target hazard quotient | dimensionless | dimensionless |
| Soil cleanup level, Csat | mg/kg | kg/kg |
| Groundwater cleanup level, MCL, user concentration target | mg/L (the RSL prints ug/L) | kg/m^3 |
| Air cleanup level | mg/m^3 | kg/m^3 |
| Kd, Koc | L/kg | m^3/kg |
| Bulk and particle density | kg/L (g/cm^3) | kg/m^3 |
| Aquifer hydraulic conductivity K | m/d (as the transport screen) | m/s |
| Infiltration I | cm/yr (as the vadose screen, 365.25-day year) | m/s |
| Source length L, aquifer thickness d_a, source depth d_s | m | m |
| Averaging window for a concentration target | yr (365.25-day, the transport axis) | s |
| Exposure duration in the mass-limit level | yr | s |

The SSG equations are written with K and I in m/yr; only the ratio K i / I enters the DAF, so the engine
evaluates them in SI without a year factor. The mass-limit level contains I times ED, a length, which is
also unit-free in SI.

## Notation

Target cancer risk TR, target hazard quotient THQ, target concentration C_T. For chemical i and pathway j
of one receptor: cancer coefficient a_ij (risk per unit EPC, M4 `riskPerEpc`) and, for each noncancer
group g (legacy: the single group `total`; modern: child, adult or worker), hazard coefficient b_ijg (M4
`hqByGroup[].hqPerEpc`). Source concentration F (soil) or c0 (groundwater). Partition equation inputs:
Kd, Koc, f_oc, water-filled porosity theta_w, air-filled porosity theta_a, bulk density rho_b, particle
density rho_s, porosity n = 1 - rho_b / rho_s, dimensionless Henry's constant H'. Dilution inputs: K, i, I,
L, d_a, mixing-zone depth d.

## Targets

- **Risk targets.** TR and THQ, default 1e-6 and 1 (`ragsb1991` section 2.7; the RSL tables use the
  same, `epa2024rsl`). A target above 0.01 is accepted and warned, because the linear risk form is itself
  warned above 0.01 in M4. The cleanup level for a chemical with both a slope factor and a reference value
  is the lower of the cancer-based and noncancer-based levels (`ragsb1991`; RISC5 does the same), and the
  result names the limiting endpoint.
- **Concentration targets** (groundwater only). Per chemical, the user may replace the risk targets by a
  concentration at the receptor well: the MCL from the database or a user-entered value. A concentration
  target ignores risk and therefore additivity (RISC5 choice, which M5 keeps). Cumulative and equal
  allocation accept no concentration targets (a RangeError), as in RISC5.
- **A missing MCL** (no MCL column value) leaves the risk targets in force and is warned
  (`cleanup.mcl-missing`) when the user asked for the MCL. An MCL cell carrying the RSL "(G)" marker (25
  rows in November 2024, four distinct values: 60, 80, 4,000 and 0.01 ug/L, plus asbestos 7e6 fibers/L, perchlorate 15 and two PFBS cells with no number; the 80 ug/L value is the total trihalomethanes MCL
  that the RSL user's guide section 5.25 names) is used as printed and warned (`cleanup.mcl-group-value`),
  because it applies to a group of chemicals, not to the one chemical alone. An MCL that is not a mass per
  volume (asbestos, 7e6 fibers/L; `tox.json` carries `mclUnit: 'fibers/L'` on that row) is never a
  concentration target: the screen leaves it out, the target counts as missing, the risk targets stay in
  force and the screen says so.

## Direct pathways: closed-form inversion

Every M4 pathway is linear in its EPC for a constant EPC: risk_ij = a_ij C and HQ_ijg = b_ijg C. For one
chemical i and one source medium m (soil, groundwater, bathroom air, indoor air, outdoor air, surface
water), sum the pathways j of that medium the receptor has switched on:

    A_i = sum_j a_ij                      (cancer, summed over the medium's pathways)
    B_ig = sum_j b_ijg                    (per noncancer group)
    C_cancer = TR / A_i
    C_noncancer = THQ / max_g B_ig
    C_i = min(C_cancer, C_noncancer)

This is the rearrangement `ragsb1991` gives for a medium whose pathways are combined (risk from all
significant pathways for that medium), with the M4 additivity rules: cancer risks add over pathways, HQs
add over pathways within a noncancer group, and groups are never added, so the denominator is the largest
group's summed coefficient, not the sum of each pathway's largest HQ. A route with no toxicity value
contributes nothing; if nothing remains, the chemical has no risk-based level (`null`, reported as not
quantified, never as infinity or zero).

- **Per medium, not across media (DEFAULT ruling 3).** Each source medium gets its own cleanup level from
  its own pathways; media are not summed. With soil and groundwater both entered, the soil level protects
  the soil pathways and the groundwater level the tap water pathways. `ragsb1991` combines pathways "for
  a given medium"; RISC5 likewise computes its direct equation per medium.
- **Per-pathway levels** are reported beside the summed level (TR / a_ij and THQ / max_g b_ijg for each
  pathway alone), at no cost; the RSL tables print the same breakdown.
- **Time-varying groundwater EPCs.** A series EPC is linear too: the legacy window averages and the modern
  maximizing start are invariant under scaling the series, so scaling the series by s scales every risk
  and HQ by s. The cleanup level is then a scale factor on the series, still closed form (M4 hand-off).
- **Receptors.** One receptor, or two. With two non-additive receptors each gets its own level and the
  reported level is the lower (DEFAULT ruling 9). With the legacy additive option (child plus adult) the
  cancer coefficient is A's plus B's and the noncancer level uses each receptor's own groups, never summed
  (the M4 rule). The modern age-segmented resident is one receptor already, so the additive option with an
  age-segmented receptor is a RangeError (the child would be counted twice), in `backCalculateModern` as in
  `runModernScenario` (`assertAdditiveAllowed`).
- **Legacy and modern.** The same equations, with the coefficients of `exposure.rags-a-1989` or
  `exposure.rags-e-f-2014`. The legacy dose form, the 7-year noncancer window, route extrapolation and
  the inhalation conversion at 20 m^3/d and 70 kg all live inside the coefficients.

## Modeled pathways

### Chains covered

| Chain (source variable) | Forward path | Linear in the source concentration? |
|---|---|---|
| Dissolved groundwater source c0 (`groundwater.at123d`, `groundwater.wexler1992`, `groundwater.domenico1987`) | constant or stepped source to the well, `groundwaterBreakthrough` | Yes, exactly (every solution is linear in c0, including pulses and steps) |
| Vadose soil source F (`vadose.vadsat`, legacy) | VADSAT source and column, `fluxToLoadingSteps`, M1 kernel, well | Yes while no separate phase is present (pore water proportional to F, and the depletion rate does not depend on F); no once the residual-phase test caps the pore water at x S |
| Vadose soil source F (`vadose.layered`, modern) | as above with the finite-volume column for more than one layer | As above for the physics; the finite-volume solver refines until results change by less than 1e-3 of their peak, so its response is linear only to that tolerance once refinement decisions change with F |
| Saturated source F (`saturatedSource.two-region`, legacy) | release schedule, `releaseToLoadingSteps`, M1 kernel, well | Yes with no separate phase in any region (release rate and initial mass both proportional to F, so the depletion time does not change); no once a region holds a separate phase (pore water held at x S while the mass keeps growing with F, so the release lasts longer) |
| Saturated source F (`saturatedSource.exponential`, modern) | as above | As the legacy method (gamma = Qbar / M0 does not depend on F until the residual cap engages) |

Nonlinearities, where they come from, and what M5 does with them:

- **Solubility cap and Raoult's law.** Above the residual-phase threshold (M2 and M3
  `residualPhaseTest`) the pore water is held at x S. With the RISC5 rule of keeping the original mole
  fraction (TPH scaled with the chemical, DEFAULT ruling 7) x is constant, so the release concentration
  stops rising and only the duration grows with F. With TPH held fixed (option), x itself grows with F.
  Either way the chain is monotone nondecreasing in F but not linear.
- **Source depletion.** A finite source releases its mass M0 = F rho_b V; with a separate phase the
  depletion time grows with F, which is why a cleanup level for a depleting source may lie above the
  residual threshold (the RISC5 review makes the same observation, section R.6 context). M5 reports the
  residual threshold (the soil saturation limit of the source soil, `soilSaturationConcentration`) next to
  every soil cleanup level.
- **Saturation limit of the soil.** The search cap is a pure substance, F = 1 kg/kg (1e6 mg/kg, the cutoff
  RISC5 uses for modelling). If the target is not reached even there, the chemical has no limiting soil
  level (`cleanup.target-not-reachable`), which is reported, never silently capped.
- **Dissolved source.** c0 is capped at the solubility S when the database has one (above S the dissolved
  source is not physical); a target not reached at S is reported the same way.

Monotonicity, not linearity, is what the solver needs: every covered chain gives a receptor metric that
is nondecreasing in the source concentration and tends to zero with it. The fixture plan tests this on a
grid for each chain, including separate-phase cases.

### Linked pathways and the soil source

A soil source drives two kinds of pathway: the modeled groundwater pathways (through the chain) and the
receptor's direct soil pathways, whose EPC is the same F. Following RISC5 (all pathways associated with
a source are added), M5 sums both when the receptor's soil pathways are linked to the source, which is the
default when a vadose or saturated source is selected (DEFAULT ruling 6). Air and surface-water pathways
with entered EPCs are other media: they get their own direct levels and are not part of the source's
inversion.

### The receptor metric

For risk targets the metric is the receptor's total cancer risk and, separately, the headline hazard index
(largest group) from the linked pathways, evaluated by the M4 scenario runner on the breakthrough series.
For a concentration target at the well the metric is the largest moving average of the screen-averaged well
concentration over a user window (RISC5 offers an averaging time for exactly this); the window defaults to
zero, that is the peak concentration (DEFAULT ruling 8). A window longer than the breakthrough series
averages only the covered span, which gives a lower metric and so a higher level than the window asks for;
the result carries `cleanup.averaging-window-exceeds-series`. The breakthrough sample times are those of the
transport run; the peak of a piecewise-linear series is exact at its samples, and the moving average is
the M4 `maximizeWindows` scan.

## Root finding

Implementation: `brent`, `secant` and `bracketRoot` from `numerics/roots.ts` (M0, tested), unchanged.
Citation for the solver: `brent1973` (chapter 4, a zero finder for a function that changes sign in an
interval, combining successive linear interpolation with bisection, so it always converges on a
bracketed root).

1. **Variable and function.** Solve in u = ln C (C the source concentration in SI), with
   g(u) = metric(e^u) / target - 1. The log variable makes Brent's absolute tolerance a relative one on C
   and spans many decades in few steps; g is bounded below by -1, so a source that does not reach the
   receptor at all (metric zero) is still a finite value.
2. **Linear shortcut, verified.** First evaluate at a reference C_ref (the entered source concentration;
   on the modeled screen, the typed start, else the source screen's own concentration, else 1 mg/kg or
   1 mg/L; the solver and the chart use the same start). Take C* = C_ref times target over metric(C_ref) and evaluate once
   more. If |g(ln C*)| <= 1e-9 the shortcut is the root (for a monotone metric any root is the root);
   otherwise go on to the bracket. This is exact for every linear chain and costs two forward runs.
3. **Bracket.** Upward (g(u_ref) < 0): if the chain has a cap (pure substance for soil, solubility for a
   dissolved source), evaluate at the cap; if g is still negative (by more than the 1e-9 acceptance) the target is not reachable, and a metric at the cap within 1e-9 of the target returns the cap itself; otherwise
   [u_ref, ln cap] brackets the root. Without a cap, `bracketRoot` on C with growth 10 and at most 40
   expansions. Downward (g(u_ref) > 0): `bracketRoot` on the reciprocal w = 1 / C with growth 10 and at
   most 40 expansions (40 decades), which finds a concentration small enough that the metric falls below
   the target; failing that is an Error (no covered chain fails to vanish at zero).
4. **Solve.** `brent` on g over the bracket in u, absolute tolerance 1e-12 in u (1e-12 relative in C),
   at most 200 iterations. Non-convergence is an Error, not a warning (convergence on a bracketed root is
   guaranteed, and 200 iterations is far beyond what a 1e-12 tolerance needs).
5. **Acceptance.** The returned C* must satisfy |g| <= 1e-9 for every analytic chain (round trip). For the
   layered finite-volume chain the acceptance is the solver's own convergence level, |g| <= 1e-3, and the
   result carries `cleanup.numerical-chain`. A miss is reported (`cleanup.round-trip-tolerance`) with the
   achieved value.
6. **Secant parity (diagnostic only).** The secant iteration of RISC5 (bound the solution, then secant)
   is run only when asked (`secantParity: true`) and in the tests: `secant` on the same g from the two
   bracket ends, tolerance 1e-12. Where it converges it must agree with Brent to 1e-8 relative in C; where
   it does not, nothing is asserted and the result reports its iterations and non-convergence. Production
   cleanup levels always come from Brent (standing assumption in `docs/DECISIONS.md`, 2026-10-15).

For direct pathways none of this runs: the inversion is the closed form above (one division per chemical
and medium).

## Individual, cumulative and equal allocation

- **Individual (default, DEFAULT ruling 4).** Each chemical is solved alone, with its pathways summed per
  source medium and the lower of its cancer and noncancer levels taken. Additivity across chemicals is not
  built in, which is also how the RSL and the SSG generic levels are made (`epa1996ssgug` section 2.5.3:
  setting 1e-6 for individual chemicals generally keeps cumulative site risk within 1e-4 to 1e-6). With a
  TPH-bearing soil source each chemical keeps its original mole fraction, so the implied TPH concentration
  differs from chemical to chemical; it is reported (`cleanup.implied-tph`), as RISC5 does.
- **Cumulative, proportional scaling (RISC5 choice).** All chemicals in a source keep the ratios of their
  entered concentrations, and one scale factor s is found so that the summed cancer risk over all chemicals
  and linked pathways meets TR and the headline HI (largest group of the HQs summed over chemicals and
  pathways) meets THQ: s = min(s_cancer, s_noncancer). Direct pathways: s_cancer = TR / Risk(C0) and
  s_noncancer = THQ / HI(C0) in closed form. Modeled pathways: one Brent solve on ln s for each endpoint,
  the TPH scaled with the chemicals. RISC5 reaches the same proportional solution through a limiting
  chemical and a fractional target followed by re-runs; solving for s directly lands on the same fixed
  point in one solve. A chemical entered as zero (or, when quantified, not entered) has no ratio to scale:
  it gets no level (`null`, warned `cleanup.not-quantified`), never a level of zero. The HI is a total over all organs (no segregation yet) and is warned
  (`cleanup.hi-unsegregated`). The result depends on the entered ratios, not on their magnitude.
- **Equal allocation (modern option).** Each chemical is solved individually against TR / N_c and
  THQ / N_nc, with N_c and N_nc the numbers of chemicals carrying a cancer or noncancer value for the
  pathways in play. `epa1996ssgug` section 2.5.3 gives the noncancer version (divide by the number of
  chemicals affecting the same target organ); without target-organ data M5 divides by all noncancer
  chemicals, which is conservative, and applies the same division to cancer as a screening option. Warned
  as `cleanup.hi-unsegregated` too.

## MCL and user targets for groundwater; what the RSL files carry

Columns in the committed November 2024 files (`packages/data/raw/rsl/2024-11/`, header rows read
2026-10-16):

| File (SEMS id) | MCL | Soil-to-groundwater SSL | Kd | Built into the database today |
|---|---|---|---|---|
| Summary table (405270) | Yes, "MCL (ug/L)", 108 rows; 25 cells are strings carrying a "(G)" marker, two of them the marker alone with no number | Yes, "Risk-based SSL (mg/kg)" with a key column (c, c*, c**, n; 747 rows) and "MCL-based SSL (mg/kg)" (91 rows); the key line states SSL values are based on DAF = 1 | No | Csat, MCL and both published SSL columns (`tox.json`, slice D2) |
| Chemical-specific parameters (405302) | No | No | Yes, "Kd (L/kg)" with "Kd Ref", 56 rows (refs: BAES 25, SSL 19, 3M 7, 3M surrogate 4, EPA Study 1); Koc, H', S as for M4 | Kd, Koc, H', S, MW (`chemicals.json`, values with refs) |
| Resident tap water (405290) | Yes, "MCL (ug/L)", 108 rows, same values | No | No | FA and the EPD flag only |

So: MCL yes (summary and tap water tables), SSL yes (summary table, risk-based and MCL-based, both at
DAF 1), Kd yes (parameters table, metals and PFAS only; organics use Koc times f_oc as the RSL user's guide
says). Kd provenance: "SSL" is the SSG Technical Background Document Table 46 value at pH 6.8 (checked for
arsenic 29, cadmium 75, selenium 5, barium 41, chromium(VI) 19, antimony 45, nickel 65, zinc 62 L/kg);
"BAES" is the Baes et al. 1984 compilation the RSL cites; "3M" and "3M surrogate" are PFAS values the RSL
cites. These are recorded as RSL data provenance under `epa2024rsl`, not as separate references.

Data fields added by slice D2 (landed):

- `tox.json`: `mcl` (ug/L, as printed; the "(G)" cells parsed to their number, 106 rows) and `mclUnit: 'fibers/L'` on the asbestos row (the only MCL not in ug/L, never a mass target) and `mclGroup: true` where
  the cell carries "(G)" (25 rows; the two bare "(G)" cells for PFBS have the flag and no `mcl`); `publishedSsl: { risk?: { value, key }, mcl?: value }` (mg/kg, DAF 1), kept as
  published comparison values, never engine inputs.
- A derived `cleanup-chemicals.json` (the risk screen's pattern): Koc, Kd with its ref, H', S and MW for
  the cleanup screen (every chemical with at least one of the five), generated by the same build and
  covered by `data:check`.
- `epanpdwr` is a `data` reference now that the build reads the MCL column (the RSL column is the
  carrier; the regulation is the origin).

The RSL tap water level that feeds a risk-based soil-to-groundwater level includes inhalation of
volatiles during household use for volatile chemicals with inhalation toxicity values (the Andelman
term, M7). M5's risk-based groundwater target is ingestion plus dermal only, so for those chemicals it is
higher than the RSL's; it is warned (`cleanup.tapwater-inhalation-omitted`).

## EPA Soil Screening Guidance leaching with a dilution attenuation factor (`cleanup.ssg-leaching`)

Citations: `epa1996ssg` (Technical Background Document, equations 22 to 24, 37 and 45, Tables 1, 36, 46
and A-1), `epa1996ssgug` (User's Guide, equations 10 to 14, Exhibit 12, section 2.5.3), `epa2002ssg`
(Supplemental Guidance, equations 4-10 to 4-14, which the RSL default-parameter file cites for every
soil-to-groundwater default).

### Partition equation

The soil concentration in equilibrium with a target leachate concentration C_w, for soil that keeps its
water, solids and soil gas during sampling, is

    F_SSL = C_w ( Kd + (theta_w + theta_a H') / rho_b )

with Kd = Koc f_oc for organic chemicals (`epa1996ssg` equations 22 to 24). It is the inverse of the M2
and M3 equilibrium partitioning (`equilibriumPoreWater`, C = F rho_b / (rho_b Kd + theta_w + theta_a H')),
so the engine exposes the bracket as a partition factor P = Kd + (theta_w + theta_a H') / rho_b and reuses
the existing helper for the identity test. H' is taken as zero for inorganic chemicals other than mercury
(the guidance says so); in the RSL parameters table H' is blank for those, and a blank H' for an organic
chemical is taken as zero and warned (`cleanup.henry-assumed-zero`). If soil gas is lost during sampling
the guidance sets theta_a to zero; that is a user option (default: kept).

Defaults (`epa1996ssg` with the partition equation; `epa2002ssg` equation 4-10; the RSL default-parameter
file repeats them): f_oc 0.002, theta_w 0.3, rho_b 1.5 kg/L, rho_s 2.65 kg/L, n = 1 - rho_b / rho_s,
theta_a = n - theta_w. The Technical Background Document prints n 0.43 and theta_a 0.13; the engine keeps
the unrounded 0.4340 and 0.1340 because the RSL computes them that way, and both versions reproduce every
fixture below. The partition equation's theta_w (0.3) differs from the soil saturation and volatilization
default (0.15), and so does f_oc (0.002 against 0.006); the guidance chose 0.3 as typical of subsurface
soil.

### Target leachate concentration

    C_w = C_gw,target x DAF

C_gw,target is, per chemical: the MCL (database or user), a user value, or a risk-based tap water level
back-calculated by the direct method above (drinking water plus bathing, modern resident by default, TR
1e-6 and THQ 1, the lower of the two). The 1996 and 2002 guidance prefer a nonzero MCLG, then the MCL,
then a health-based level; the database carries no MCLG, so the order offered is MCL, then the risk-based
level, as the RSL does (DEFAULT ruling 11).

### Dilution attenuation factor and mixing-zone depth

A water balance over the source footprint, with the receptor well at the downgradient edge of the source
and dilution only (no sorption or decay in the aquifer):

    DAF = 1 + K i d / (I L)                                    (epa1996ssg eq. 37; epa2002ssg 4-11)
    d = sqrt(0.0112 L^2) + d_a ( 1 - exp( -L I / (K i d_a) ) )   (eq. 45; 4-12), with d <= d_a

The first term of d is the mixing from vertical dispersivity over the source length (vertical
dispersivity 0.0056 L, credited by the guidance to the MULTIMED estimate), the second the depth reached
by infiltrating water; when d exceeds the aquifer thickness it is set to d_a and the engine warns
(`cleanup.mixing-depth-capped`). DAF >= 1 by construction.

Generic DAFs: 20 (the default the guidance selects by weight of evidence for sources up to 0.5 acre, and
the one behind the SSG generic levels) and 1 (no dilution or attenuation, for shallow water tables,
fractured media, karst or sources above 30 acres; the RSL tables use DAF 1). The engine offers 20, 1 or the
site-specific equations; the default is DAF 1, the RSL's choice (DEFAULT ruling 10), with 20 a one-click
alternative labelled with the 0.5-acre condition.

### Mass-limit level

When the source depth d_s is known, a finite source cannot sustain the infinite-source leachate
concentration, and the guidance gives a lower limit:

    F_mass = C_w I ED / (rho_b d_s)      (epa1996ssgug eq. 14; epa2002ssg 4-14; I 0.18 m/yr, ED 70 yr)

and says to compute both and keep the higher. The engine computes F_mass only when d_s is entered, reports
both, and uses the higher (forced by the guidance; `cleanup.mass-limit-governs` names the case).

### Soil saturation and solubility checks

- **Csat.** The SSG levels assume no NAPL. The soil saturation limit is computed with the M3 helper
  (`soilSaturationConcentration`, the guidance's equation 9 form) using the same soil inputs as the
  partition equation (theta_w 0.3, f_oc 0.002 by default), so the check is consistent with the level it
  tests (DEFAULT ruling 12). A level above Csat is reported unchanged and warned
  (`cleanup.csat-exceeded`); the guidance says the levels do not apply where NAPL may be present. The six
  SSG Table 3-A Csat fixtures already in `packages/engine/test/fixtures/saturatedSource/` cover the helper;
  M5 adds no Csat fixture of its own.
- **Solubility.** C_w above S (a leachate the chemical cannot form) is warned
  (`cleanup.leachate-above-solubility`).

Assumptions listed on the method (not warnings), from the guidance's simplifying assumptions: infinite
source, contamination uniform from the surface to the water table, no attenuation in soil or aquifer,
instantaneous linear equilibrium partitioning, an unconfined homogeneous aquifer, the receptor well at the
source edge and screened in the plume, no NAPL.

## Where the manual is ambiguous, and what we chose

| Point | Reading adopted | Status |
|---|---|---|
| Solver | Brent on the log of the source concentration; the secant RISC5 describes is a parity diagnostic | Standing assumption (DECISIONS.md 2026-10-15) |
| Cumulative option: limiting chemical, fractional target, adjust and re-run | Solve the one proportional scale factor directly; same fixed point | RISC5 choice for the result, our procedure (ruling 5) |
| Several direct source media | One level per medium from its own pathways; the manual both computes per medium and says the pathways of all media are summed | DEFAULT ruling 3 |
| Averaging time for a groundwater concentration target | User window, default zero (peak) | DEFAULT ruling 8 |
| TPH-bearing source | Mole fraction kept (TPH scaled with the chemical), implied TPH reported | RISC5 choice, DEFAULT ruling 7 |
| Soil search ceiling | 1e6 mg/kg (pure substance) | RISC5 choice |
| A steady-state or dissolved chain that cannot reach the target below the residual concentration | Reported as not reachable below the cap, with the residual threshold shown (RISC5 prints "RES") | Screening choice |
| Modeled chains and receptors | One or two receptors; with two non-additive receptors the lower level is reported | DEFAULT ruling 9 (RISC5 limits modeled back-calculation to one receptor) |
| Concentration targets with cumulative scaling | Refused (RangeError) | RISC5 choice |

## Validity checks

RangeError: TR or THQ not positive or not finite; a concentration target not positive; concentration
targets with cumulative or equal allocation; a chemical listed twice; a pathway switched on with no source
link; unknown chain method; SSG inputs out of range (theta_w, theta_a or n outside [0, 1], theta_w > n,
rho_b or rho_s not positive, rho_b >= rho_s, f_oc, Koc, Kd or H' negative, DAF < 1, K, i, I, L or d_a not
positive, d_s not positive when given); the M1 to M4 checks of the chain inputs. Error (a defect, not an
input problem): Brent not converged, or no downward bracket within 40 decades.

Warnings (codes are part of the result):

| Code | Method | Condition |
|---|---|---|
| `cleanup.pathway-not-computable` | rags | a switched-on pathway lacks an exposure factor or chemical input; it contributes nothing and is named |
| `cleanup.not-quantified` | rags | no toxicity value for any linked pathway of the chemical, or (cumulative allocation) an entered concentration of zero; no level |
| `cleanup.target-above-0.01` | rags | TR above 0.01 (linear risk form) |
| `cleanup.target-not-reachable` | rags | the metric at the cap (pure substance, or solubility for a dissolved source) is below the target |
| `cleanup.round-trip-tolerance` | rags | the returned level misses the acceptance level (|g| above 1e-9, or 1e-3 for the layered chain) |
| `cleanup.numerical-chain` | rags | the chain contains the layered finite-volume solver |
| `cleanup.secant-not-converged`, `cleanup.secant-disagrees` | rags | parity diagnostic only, when requested |
| `cleanup.implied-tph` | rags | individual mode with a TPH-bearing source |
| `cleanup.hi-unsegregated` | rags | cumulative or equal allocation sums or divides HQs over all organs |
| `cleanup.mcl-missing` | rags, ssg | an MCL target was asked for and the database has none |
| `cleanup.mcl-group-value` | rags, ssg | the MCL cell carries the RSL "(G)" marker |
| `cleanup.tapwater-inhalation-omitted` | rags (caller flags `volatile`), ssg (web panel) | a volatile chemical with an inhalation value and no shower inhalation pathway on: the risk-based tap water level omits the household-use inhalation term (M7). The engine holds no volatility data, so `backCalculate*` emits it only for a chemical the caller marks `volatile`; the SSG panel and the direct-pathway build both pass it from the database flag |
| `cleanup.averaging-window-exceeds-series` | rags | a concentration target's averaging window is longer than the breakthrough series; only the covered span is averaged |
| `cleanup.csat-exceeded` | rags, ssg | a soil level above the soil saturation limit |
| `cleanup.above-solubility` | rags | a groundwater level above S |
| `cleanup.leachate-above-solubility` | ssg | C_w above S |
| `cleanup.mixing-depth-capped` | ssg | d > d_a, set to d_a |
| `cleanup.mass-limit-governs` | ssg | the mass-limit level is the higher and is used |
| `cleanup.henry-assumed-zero` | ssg | an organic chemical with a blank H' |
| M4 warnings (`exposure.*`, `risk.*`) | rags | passed through from the forward runs |

"rags" means the two back-calculation methods, "ssg" the leaching method.

## Coupling to the existing engine

- **Coefficients.** `modernPathway` and `legacyPathway` already return `riskPerEpc`, `riskByStage` and
  `hqByGroup` per pathway; the direct back-calculation reads them at EPC = 1 and sums as above. No change
  to M4 is needed.
- **Forward runs for modeled chains.** A chain is a function from a source concentration (SI) to an
  `EpcSpec` series: it builds the M2 or M3 input with that concentration (and TPH scaled with it when the
  mole fraction is kept), runs the method, converts the release with `fluxToLoadingSteps` or
  `releaseToLoadingSteps`, evaluates the chosen M1 method at the well-screen points, and returns
  `groundwaterBreakthrough(...)`. For the dissolved source the chain sets c0 (or scales the
  `ConcentrationStep` list). The scenario runner (`runLegacyScenario` or `runModernScenario`) turns the
  series plus any linked constant soil EPC into the metric.
- **Cost.** Each forward run is one source run plus a few well points at the series times; Brent on a
  monotone function converges in about 10 to 20 evaluations after the bracket, so a modeled cleanup level
  costs some tens of forward runs, run in the web worker as the other screens do.
- **Registry.** Process id `cleanup` already exists in `ProcessId`. Methods: `cleanup.rags-b-1991`
  (legacy), `cleanup.rags-e-f-2014` (modern), `cleanup.ssg-leaching` (modern). Each must cite only
  references with status `used`; the registry test enforces it.

## Fixture plan

Fixtures go in `packages/engine/test/fixtures/cleanup/` with a README recording sources, pages and every
reading below. "Half a unit" means half a unit in the last printed digit of the published value.

1. **SSG generic soil-to-groundwater levels, `epa1996ssg` Table A-1 (pages A-2 to A-5), DAF 20 and DAF 1,
   MCL-based rows.** Thirty values: benzene 0.03 / 0.002, toluene 12 / 0.6, ethylbenzene 13 / 0.7,
   trichloroethylene 0.06 / 0.003, tetrachloroethylene 0.06 / 0.003, carbon tetrachloride 0.07 / 0.003,
   1,2-dichloroethane 0.02 / 0.001, vinyl chloride 0.01 / 0.0007, styrene 4 / 0.2, antimony 5 / 0.3,
   arsenic 29 / 1, barium 1,600 / 82, cadmium 8 / 0.4, chromium(VI) 38 / 2, selenium 5 / 0.3 mg/kg. Inputs:
   the 1996 MCLs of Table 1 (benzene, TCE, PCE, carbon tetrachloride and 1,2-dichloroethane 0.005;
   toluene 1; ethylbenzene 0.7; vinyl chloride 0.002; styrene 0.1; antimony 0.006; arsenic 0.05; barium 2;
   cadmium 0.005; chromium(VI) 0.1; selenium 0.05 mg/L), Koc and H' from the User's Guide Table C-1 (the
   Technical Background Document's Table 36 values), metal Kd at pH 6.8 from Table 46, and the defaults
   above. Tolerance: the table's own rounding (two significant figures at 10 and above, one below 10),
   half a unit. All thirty reproduce with theta_a 0.13 and with 0.1340 (checked 2026-10-16). Closest to a
   rounding edge: styrene at DAF 20 (3.52 against the 3.5 edge) and arsenic at DAF 1 (1.46 against 1.5),
   so the inputs must be exactly those printed. What this fixture does and does not validate: it checks the
   three-phase partition formula and the DAF arithmetic to the table's rounding, and the metal Kd values
   (which also agree with the RSL parameters table). It does not validate the typed organic Koc and H'. At
   one or two significant figures most organic rows leave Koc and H' loose (benzene's H' is unconstrained
   from 0 to about 0.5 and its Koc only to about 40 to 65 L/kg); only styrene at DAF 20 and arsenic at
   DAF 1 bind tightly. Those Koc and H' were not read from the primary document and are not claimed as
   sourced. Fixture 2 (91 RSL rows at two significant figures) is the real constraint on the formula.
2. **RSL MCL-based SSL (DAF 1), every row, `epa2024rsl`.** All 91 summary-table rows with an MCL-based
   SSL, recomputed from the committed raw files with the engine's partition factor: MCL (the "(G)" cells
   parsed), Kd where the parameters table has one, else Koc x 0.002, H' (blank = 0), theta_w 0.3, rho_b 1.5,
   rho_s 2.65, theta_a = n - theta_w. Tolerance: half a unit in the second significant figure (the M4 RSL
   rule). 91 of 91 reproduce (checked 2026-10-16). Lives in the data package test, which already runs the
   engine over the raw tables for the dermal form, so a new edition that breaks it fails `data:check`'s
   test run.
3. **RSL risk-based SSL (DAF 1), chemicals without a household-use inhalation term.** Arsenic 0.0015,
   cadmium (water) 0.14, chromium(VI) 0.0021, nickel soluble salts 26, zinc 370, acetone 3.7 mg/kg, each
   from the engine's back-calculated tap water level (modern resident, drinking water plus bathing, TR 1e-6
   and child THQ 1, the lower level, unrounded) times the partition factor. Toxicity and dermal inputs as
   in the M4 RSL fixture (`packages/engine/test/fixtures/exposure/rsl-2024-11.json`). Half a unit in the
   second figure. Six of six reproduce (checked 2026-10-16 with the M4 kernels). Volatile chemicals with
   an IUR or RfC are excluded (the RSL level includes the Andelman term, M7); benzo(a)pyrene is excluded
   because the RSL omits its dermal water term (outside the prediction domain) while M4 computes it and
   warns.
4. **RSL resident tap water combined levels (direct back-calculation summed over pathways).** Carcinogenic
   SL / child noncarcinogenic SL in ug/L: arsenic 0.052 / 6.0; cadmium (water) none / 1.8; chromium(VI)
   0.11 / 13; mercuric chloride none / 5.7; nickel soluble salts none / 390; zinc none / 6,000; acetone none
   / 18,000. Exercises the per-group summation over ingestion and dermal pathways. Half a unit in the second
   figure. All reproduce with the M4 kernels (checked 2026-10-16). The resident soil totals are not used:
   the RSL soil level adds inhalation of particulates and volatiles (M6, M7). Per-pathway soil levels are
   already M4's fixture.
5. **Hand cases** (constructed here):
   - H1, direct, modern resident, benzene in tap water, drinking plus bathing, from the M4 case M1 values:
     cancer level 1.2381251e-3 mg/L, child noncancer level 7.0833327e-2 mg/L, cleanup level the cancer one.
     Tolerance 1e-7 relative (the M4 case prints eight figures).
   - H2, cumulative proportional, benzene 0.01 mg/L and arsenic 0.002 mg/L in drinking water and bathing,
     modern resident: s = min(TR / Risk(C0), THQ / HI(C0)); expected values computed independently in the
     slice and recorded in the README; 1e-9 relative; the ratio benzene : arsenic stays 5 exactly (1e-12).
   - H3, site-specific DAF: K 10 m/d, i 0.005, I 18 cm/yr (365.25-day year), L 45 m. d_a 10 m: d 5.19619198 m,
     DAF 12.71548841. d_a 3 m: d capped at 3 m (warned), DAF 7.76388889. Benzene at the first DAF with the
     RSL inputs (Koc 145.8 L/kg, H' 0.22690106295994): partition factor 0.5118641201 L/kg, SSL from the MCL
     3.25430114e-2 mg/kg. 1e-9 relative.
   - H4, mass-limit level: C_w 0.1 mg/L (benzene MCL at DAF 20), I 0.18 m/yr, ED 70 yr, rho_b 1.5 kg/L,
     d_s 2 m: F_mass 0.42 mg/kg, above the partition level (0.0338 mg/kg with the SSG inputs), so it governs.
     1e-12 relative.
6. **Identities.** (a) Round trip: for every analytic chain (direct, the three M1 methods with a dissolved
   source, VADSAT, both saturated methods), with and without a separate phase, the cleanup level fed
   forward reproduces the limiting target to 1e-9 relative, and the other endpoint is at or below its
   target. (b) For linear chains the verified shortcut equals a Brent solve to 1e-10 relative. (c) Secant
   parity: where the secant converges it agrees with Brent to 1e-8 relative. (d) Cumulative scaling keeps
   the entered ratios to 1e-12 and meets its target to 1e-9. (e) The SSG partition factor times
   `equilibriumPoreWater` for the same soil equals 1 (1e-12). (f) Monotonicity: each chain's metric is
   nondecreasing on a 40-point logarithmic grid from 1e-6 to 1e4 mg/kg (or mg/L), including separate-phase
   cases. (g) Individual and cumulative agree for one chemical (1e-12). (h) The layered finite-volume chain
   round trip holds to 1e-3 relative.
7. **No RISC5 example.** Chapter 8 has no worked example and the Appendix R review has no back-calculation
   table (Tables R-1 to R-9 cover features, Monte Carlo, the vapour models, vadose leaching, surface water
   and the direct pathways), so there is no RISC5-derived fixture.

## References and verification (2026-10-16)

| Key | Verified against | Full text read |
|---|---|---|
| `epa1996ssg` | The document (EPA SEMS copy `semspub.epa.gov/work/HQ/207.pdf`; the SEMS host was unreachable on 2026-10-16 and the copy was read from the Internet Archive capture of that URL) | Sections 2.5.1, 2.5.2, 2.5.5 and 2.5.6, equations 22 to 24 and 28 to 45, Tables 1, 46 and A-1 |
| `epa1996ssgug` | The document (EPA/540/R-96/018, Publication 9355.4-23, July 1996, Second Edition; Internet Archive capture of `semspub.epa.gov/work/HQ/211.pdf`) | Equations 10 to 14 (printed pages 29 to 31), Exhibit 12, section 2.5.3, Table C-1 |
| `epa2002ssg` | The document (OSWER 9355.4-24, December 2002; Internet Archive capture of `semspub.epa.gov/work/HQ/175878.pdf`) | Section 4.2.3 (migration to ground water), equations 4-10 to 4-14 |
| `ragsb1991` | The document (EPA/540/R-92/003, Publication 9285.7-01B, December 1991, Interim; copy at `epa-dccs.ornl.gov/documents/HHEMB.pdf`, linked from EPA's RAGS Part B page as SEMS 156739) | Cover, contents, sections 2.7 and 3.1.1 |
| `brent1973` | The author's publication page (Prentice-Hall, Englewood Cliffs, 1973, ISBN 0-13-022335-2; Dover reprint 2002, ISBN 0-486-41998-3) | No; chapter 4 is the zero finder per the author's page |
| `epanpdwr` | EPA's National Primary Drinking Water Regulations page (last updated August 31, 2026), which points to 40 CFR Part 141 | Page read; the MCLs used come from the RSL MCL column |
| `epa2024rsl`, `epa2024rslug` | As in `docs/methods/chemical-database.md`; the user's guide section 4.8 (soil to groundwater) gives its equations as images, so its defaults were read from the RSL Default Exposure Parameters file (SEMS 404323, SHA-256 matching the data plan), sheet "Soil to Groundwater" | |

New keys entered `references.json` as `planned`; `ragsb1991`, `brent1973`, `epa1996ssgug` and `epa2002ssg`
became `used` when slice C4 registered the methods that cite them. The guidance credits the mixing-zone
depth estimate to the MULTIMED model (Sharp-Hansen et al. 1990) and the vertical dispersivity ratio to
Gelhar and Axness 1981; those are the guidance's sources, not ours, and are not added.

## Appendix: slice plan for stages 2 and 3

Each slice is sized for one implementation worker, test first (the failing tests listed are written
before the code). Gate per slice: the targeted tests, then `corepack pnpm gate` once per wave.

### Stage 2: engine and data

| Slice | Files to create or touch | Failing tests first | Depends on | Registers |
|---|---|---|---|---|
| C1 SSG leaching | create `packages/engine/src/processes/cleanup/ssg.ts` (partition factor, inverse, DAF, mixing depth with cap, generic DAF 20 or 1, mass-limit level, Csat and solubility checks through `soilSaturationConcentration`), `cleanup/checks.ts` (shared validity checks); fixtures `test/fixtures/cleanup/ssg1996-table-a1.json` and `README.md` | `test/cleanup-ssg.test.ts`: fixture 1 (30 values), H3, H4, identity (e), range errors, warnings `mixing-depth-capped`, `mass-limit-governs`, `csat-exceeded`, `leachate-above-solubility`, `henry-assumed-zero` | none | none yet |
| D2 RSL MCL and SSL columns | touch `packages/data/src/rsl/{build.ts,types.ts}`, `packages/data/test/rsl.test.ts`, regenerate `packages/data/generated/rsl-2024-11/` (adds `mcl`, `mclGroup`, `publishedSsl` to `tox.json`; new `cleanup-chemicals.json`), `docs/methods/chemical-database.md`; `references.json`: `epanpdwr` to `data` | `rsl.test.ts`: MCL parsed for 108 rows including the 25 "(G)" cells; `publishedSsl` counts (747 risk-based, 91 MCL-based); fixture 2 (91 MCL-based SSLs recomputed with the engine partition factor); `cleanup-chemicals.json` is exactly the derived subset | C1 (partition factor) | none |
| C2 direct back-calculation | create `cleanup/direct.ts` (per-medium coefficient sums, per-group noncancer, min of endpoints, per-pathway levels, individual, cumulative proportional and equal allocation for direct media, two receptors and the legacy additive option), `cleanup/targets.ts` (risk and concentration targets, MCL selection and warnings); fixture `test/fixtures/cleanup/rsl-2024-11-cleanup.json` | `test/cleanup-direct.test.ts`: H1, H2, fixture 4, identities (d) and (g), not-quantified and target-above-0.01 warnings, refusal of concentration targets in cumulative mode; `test/cleanup-rsl-ssl.test.ts`: fixture 3 (uses C1) | C1 for fixture 3 | none yet |
| C3 solver and modeled chains | create `cleanup/solve.ts` (log variable, verified linear shortcut, cap and reciprocal bracketing with `bracketRoot`, `brent`, acceptance, optional secant parity), `cleanup/chains.ts` (dissolved source, VADSAT, layered, two-region and exponential chains to the well through the existing coupling helpers and `groundwaterBreakthrough`; linked soil pathways; TPH kept or held; caps; concentration-target metric with the averaging window) | `test/cleanup-solve.test.ts`: bracket up, down and at the cap, not reachable, Brent non-convergence is an Error, secant parity (c); `test/cleanup-chains.test.ts`: identities (a), (b), (f), (h) for each chain, an MCL target at the well, implied TPH warning, cumulative scaling of two modeled chemicals | C2 | none yet |
| C4 registration | create `cleanup/index.ts` (method descriptors `cleanup.rags-b-1991` legacy, `cleanup.rags-e-f-2014` modern, `cleanup.ssg-leaching` modern, with assumptions and `risc5Choice`), touch `packages/engine/src/index.ts`; `references.json`: `ragsb1991`, `brent1973`, `epa1996ssgug`, `epa2002ssg` to `used`; regenerate `docs/ATTRIBUTIONS.md`; update this note's status line | `test/cleanup-registry.test.ts`: three methods registered under process `cleanup` with legacy and modern kinds, every citation exists and is `used`, `run` equals the module functions on H1 and H3 | C1, C2, C3 | the three methods |

Citations planned per method: `cleanup.rags-b-1991`: `ragsb1991`, `rags1989`, `epa1991sdef`,
`epa1992dea`, `brent1973`. `cleanup.rags-e-f-2014`: `ragsb1991`, `ragse2004`, `ragsf2009`, `epa2014ef`,
`epa2005adaf`, `brent1973`. `cleanup.ssg-leaching`: `epa1996ssg`, `epa1996ssgug`, `epa2002ssg`.

### Stage 3: web screen at `#/cleanup`

| Slice | Files to create or touch | Failing tests first | Depends on |
|---|---|---|---|
| W1 screen and direct levels | create `apps/web/src/cleanup/{CleanupPage.tsx,form.ts,build.ts,compute.ts,Results.tsx,cleanup.css}` and tests; touch `apps/web/src/App.tsx` (lazy route `#/cleanup`, home link); reuse the risk screen's chemical picker and receptor panels | `build.test.ts` (form to engine input; H1 through the screen path), `compute.test.ts`, `CleanupPage.test.tsx` (renders, mode switch individual / cumulative / equal, limiting endpoint shown, not-quantified cells), `App.test.tsx` route; then the 390x844 and 1280 CDP checks, light and dark, zero overflowing elements | C2, C4 |
| W2 modeled chains and MCL targets | touch `cleanup/` (source selector fed by the transport, vadose and saturated screens through `transport/wellFeed.ts`-style feeds; MCL from the database with override and averaging window; worker run; convergence panel with iterations and the secant parity toggle; chart of the metric against source concentration on log axes with the target line and the solution marked; residual threshold shown) | `compute.test.ts` (worker message for a modeled chain, not-reachable reporting), `chartData.test.ts`, page test for the MCL path | C3, C4, D2, W1 |
| W3 SSG leaching panel | touch `cleanup/` (DAF 20 / 1 / site-specific with the mixing-depth readout and cap note; target MCL, user or risk-based tap water level; optional source depth for the mass-limit level; Csat flag; the published RSL SSL at DAF 1 beside the computed one) | `build.test.ts` (H3 through the screen), page test (DAF switch, mass-limit governs, published comparison shown) | C1, C4, D2, W1 |

W2 and W3 are independent of each other once W1 lands. The home page text and the ROADMAP M5 row are
updated when W3 lands.
