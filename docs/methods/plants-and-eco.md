# Plant uptake, ecological screening and TPH fractions (M9)

Scope, equations, validity checks, coupling, data plan, fixture plan and slice plan for M9 (ROADMAP
section 3 rows O, P and Q). Equations are written in our own words from the primary publications cited by
reference key (full entries in `docs/ATTRIBUTIONS.md` once they move to `used`). The RISC5 manual was used
only as a map of which pathways RISC5 offers; none of its text, figures or tables is reproduced. Status:
stage 1 (scoping), 2026-10-18. The rulings are DEFAULT unless marked forced, recorded in
`docs/DECISIONS.md` (2026-10-18, M9 block). No engine, data or web code is written in this stage.

Stage 1 in progress: the exact published titles, volumes and pages of `trappmatthies1995`, `briggs1982`,
`trapp2015`, `sample1996`, `tphcwg1997` and `madep2002` are still descriptors in references.json and must
be verified against the primary sources before slice E1 or E3 starts; the per-chemical Eco-SSL document
dates and the Eco-SSL values themselves have not been read yet (slice D1).

## What the processes are

- **Vegetable uptake.** A chemical in the root-zone soil reaches a plant through the soil pore water (root
  sorption and the transpiration stream) and through the air (gas exchange with leaves). The plant
  concentration then enters the human diet as homegrown produce.
- **Screening ecological risk.** Soil concentrations are compared with benchmarks protective of plants and
  soil invertebrates, and a simple food web gives a daily dose to a wildlife receptor (soil ingestion plus
  food items that took the chemical up from soil), compared with a toxicity reference value (TRV).
- **TPH fractions.** Total petroleum hydrocarbon is split into aliphatic and aromatic carbon-range fractions,
  each with surrogate properties and toxicity; a total-TPH cleanup level follows from the fraction
  composition.

## Scope of M9

| Item | In M9 | Deferred |
|---|---|---|
| Root, stem and leaf uptake of neutral organics, steady state and time-dependent | Yes (legacy and modern) | Ionizable organics (the cation and anion trap), metals uptake beyond a user BCF |
| Produce ingestion pathway into M4 forward risk | Yes | Meat and milk (beef and dairy transfer factors) |
| Produce pathway in M5 cleanup levels | Yes, closed form through the steady-state plant factor | Time-dependent plant uptake inside the Brent chain |
| Irrigation water as a plant source | Yes, user-entered interface (below) | Coupling to the M7 irrigation model, soil build-up from irrigation (M7) |
| Plant and soil invertebrate hazard quotients against Eco-SSLs | Yes | Site-specific toxicity testing |
| Wildlife food web (mammal and bird guilds of the Eco-SSL guidance) | Yes | Aquatic food webs, fish ingestion (M8 deferred it too), population models |
| Legacy benchmark screen (user-entered or `sample1996` benchmarks) | Yes, user-entered values with citation | Shipping the ORNL benchmark tables as data |
| TPH fraction cleanup levels, TPHCWG and MADEP fraction sets | Yes, through M5 | Fraction-specific vapor and leaching chains beyond what M5 and M6 already do |
| Probabilistic plant and food-web parameters | No | M10 |

## Notation

C_s soil concentration (mg/kg dry), rho_b dry bulk density (kg/L), theta_w water-filled porosity, K_d
soil-water partition coefficient (L/kg), K_ow octanol-water partition coefficient, K_aw dimensionless
Henry constant, C_pw pore water concentration (mg/L), C_a air concentration (mg/m^3), C_p plant
concentration (mg/kg fresh weight), M plant mass (kg), Q transpiration rate (L/d), A leaf area (m^2), g
conductance (m/d), lambda sum of first-order losses (growth dilution and metabolism, 1/d). SI inside the
engine as everywhere else; the units above are boundary units.

## Vegetable uptake

### Shared partitioning step

Pore water from soil: C_pw = C_s rho_b / (theta_w + rho_b K_d), with K_d = K_oc f_oc for organics (the M2
and M3 convention, so the same chemical record gives the same pore water everywhere). When the irrigation
interface is active the user may instead set the root-zone water to the irrigation concentration (ruling
4).

### Legacy: Briggs root and transpiration factors with the Trapp and Matthies one-compartment leaf model (`plantUptake.trapp-matthies-1995`)

- Root concentration factor (`briggs1982`): the ratio of root to pore water concentration rises with log
  K_ow as a constant plus a power of K_ow (a lipophilic sorption term plus a water term). Below-ground
  produce: C_root = RCF C_pw, with a correction from fresh weight to the produce basis the user selects.
- Transpiration stream concentration factor (`briggs1982`): a bell-shaped function of log K_ow peaking at
  moderate lipophilicity; the xylem water reaching the shoot carries TSCF C_pw.
- Above-ground produce (`trappmatthies1995`): one well-mixed leaf and stem compartment. Its mass balance:
  M dC_p/dt = TSCF Q C_pw + g A C_a - (g A / K_la) C_p - lambda M C_p, where K_la is the leaf-air partition
  coefficient formed from the leaf water and lipid contents, K_ow and K_aw. The steady state is
  C_p = (TSCF Q C_pw + g A C_a) / (g A / K_la + lambda M). The time-dependent form is the exact exponential
  solution for constant inputs over a growing period, evaluated at harvest.
- The numerical constants of both Briggs regressions and of K_la are taken from the primary publications in
  slice E1, not from the manual; they are not written here until verified.

### Modern: Trapp 2015 (`plantUptake.trapp-2015`)

- The ROADMAP names Trapp 2015 as the modern model; references.json holds it as a descriptor only. Slice E1
  first identifies the exact publication (journal, volume, pages) and reads it. If it cannot be verified,
  the modern method falls back to the EPA 2005 HHRAP produce equations (`epa2005hhrap`), which are
  verified-public and cover above-ground (root uptake plus deposition-free vapor transfer) and below-ground
  produce; the switch is recorded as a DECISIONS ruling, never silently.
- Expected structure (to be confirmed from the source): separate root, stem and leaf (or fruit)
  compartments, each with its own mass balance, with transfer along the xylem and phloem flows and growth
  dilution, solved as a small linear ODE system (exact matrix exponential for constant inputs, steady state
  by a linear solve). The engine already has the dense linear algebra this needs.

### Produce ingestion pathway into M4

Intake from homegrown produce, per life stage s, for each produce class k (above-ground exposed,
above-ground protected, root):

    dose_s = sum_k( C_p,k (1 - L_k) IR_k,s FH_k ) EF_s ED_s / (BW_s AT)

where IR is the intake rate of fresh produce (kg/d), L_k the preparation loss fraction and FH_k the
fraction homegrown. Legacy and modern variants follow the M4 split: the legacy preset uses RAGS A
averaging and the modern preset uses the `epa2011efh` homegrown intake rates with the ADAF handling of
the M4 modern method. The pathway registers as `produce` beside the nine direct pathways, and its cancer
risk and hazard quotient add into the M4 totals with the existing receptor additivity rules. M5 inverts it
in closed form because the steady-state plant factor is linear in C_s.

### Irrigation input (interface until M7 lands)

    IrrigationInput { concentration_mg_per_L: number; applicationRate_L_per_m2_per_d: number;
                      source: 'user' | 'm7' }

M9 uses it two ways only: the root-zone water concentration option above, and a foliar term equal to the
water interception fraction times the applied mass, retained on the leaf with the same lambda. Soil
build-up from irrigation belongs to M7. Every run with `source: 'user'` raises `IRRIGATION_USER_ENTERED`.

## Screening ecological risk

### Legacy: benchmark hazard quotients (`eco.benchmark-hq`)

HQ = C_medium / benchmark for each chemical and receptor group, with benchmarks entered by the user and
tagged with a citation (`sample1996` for wildlife NOAEL-based benchmarks is the expected citation). A
simple food web forms the wildlife dose below with user-entered bioaccumulation factors. No benchmark
table ships with the legacy method (ruling 6).

### Modern: Eco-SSLs (`eco.ecossl-2005`)

- Plants and soil invertebrates: HQ = C_s / Eco-SSL for that group.
- Wildlife (mammal and bird guilds of the guidance, `epaecosslguidance`): the daily dose per body weight is

      dose = [ sum_i( C_i IR_food P_i ) + C_s IR_food P_s ] AUF / BW   (expressed per kg body weight)

  where C_i is the concentration in food item i (plants, soil invertebrates, small mammals) predicted from
  C_s with the guidance's soil-to-biota uptake models (a ratio for some chemicals, a log-linear regression
  for others), P_i the diet fraction, P_s the incidental soil fraction of the diet and AUF the area use
  factor. HQ = dose / TRV. Solving dose = TRV for C_s reproduces the published wildlife Eco-SSL, which is
  the fixture (below).
- Eco-SSLs are screening values for Step 2 of the Superfund ecological process. The guidance states they
  are not cleanup levels, so M9 does not offer an ecological cleanup level (forced by the source, ruling 7).

### Eco-SSL data slice (plan, no raw files in this stage)

Checked 2026-10-18 on the EPA site.

| Source (key) | Current edition and location | Format | Licence or status |
|---|---|---|---|
| Guidance (`epaecosslguidance`) | Guidance for Developing Ecological Soil Screening Levels, OSWER Directive 9285.7-55, November 2003, revised February 2005; https://www.epa.gov/sites/default/files/2015-09/documents/ecossl_guidance_chapters.pdf (1,500,872 bytes served 2026-10-18), linked from https://www.epa.gov/chemical-research/guidance-developing-ecological-soil-screening-levels (page last updated April 21, 2026) | PDF | US government work, public domain |
| Per-chemical documents (`epaecossl`) | 21 documents, 17 metals (Al, Sb, As, Ba, Be, Cd, Cr, Co, Cu, Fe, Pb, Mn, Ni, Se, Ag, V, Zn) and 4 organics (DDT and metabolites, dieldrin, pentachlorophenol, PAHs), at https://www.epa.gov/sites/default/files/2015-09/documents/eco-ssl_<name>.pdf, listed on https://www.epa.gov/chemical-research/interim-ecological-soil-screening-level-documents (page last updated April 21, 2026). All interim final; each document's own date is read in slice D1 | PDF, no machine-readable table | US government work, public domain |

No consolidated table of values exists on the EPA site (checked 2026-10-18), so the build differs from the
RSL build in its reader:

- `packages/data/raw/ecossl/` holds the 21 per-chemical PDFs and the guidance PDF, with
  `manifest.json` listing URL, retrieval date, byte size and SHA-256 for each (the RSL pattern).
- The values (Eco-SSL per group: plants, soil invertebrates, avian, mammalian; the wildlife TRVs and the
  uptake model coefficients used for the food web) are hand-entered into
  `packages/data/src/ecossl/values.csv` with document, table and page for every row, because the PDFs
  carry them only as typeset tables.
- A reader test re-extracts each document's summary table text with `pdftotext` at build time when the tool
  is present and checks every hand-entered value appears in it; when absent, the checksum check alone runs
  and the test reports the skip.
- Output: `packages/data/generated/ecossl-<retrieval date>/ecossl.json`, with a provenance block (edition,
  URLs, checksums) and licence status, keyed by the same chemical ids as `chemicals.json` (CAS match;
  metals and PAH groupings mapped explicitly, with unmapped rows reported, never dropped silently).
- Raw PDFs total about 25 MB; if that is judged too large for the repository, the manifest stays and the
  PDFs are fetched by a script that verifies the checksums (open question for slice D1, ruling 8).

## TPH fraction cleanup levels (`tph.fractions`)

- Fraction sets: TPHCWG (`tphcwg1997`) aliphatic and aromatic equivalent carbon ranges, and MADEP
  (`madep2002`) carbon ranges. Each set is a mapping from fraction to a surrogate chemical record.
- Toxicity: the RSL November 2024 database already ships five TPH surrogates (aliphatic low, medium and
  high; aromatic medium and high) with their toxicity and properties. Ruling 9 maps both fraction sets onto
  these records rather than entering new toxicity values; any fraction with no RSL surrogate is reported as
  unmapped.
- Forward risk: each fraction runs as its own chemical through M4 with C_s,j = f_j C_TPH; the hazard
  quotients add (TPH fractions carry noncancer toxicity only in the RSL set).
- Cleanup level for total TPH (through M5): with fraction mass fractions f_j summing to one and per-fraction
  cleanup levels CL_j from M5 (any M5 pathway set, including the modeled chains), the total level meeting a
  target hazard index HI_t is C_TPH = HI_t / sum_j( f_j / CL_j ). Each fraction is then checked against
  its own saturation limit at f_j C_TPH.
- Fixture anchor: the M4 Table R-9 row for TPH aliphatic C12-C16 already reproduces; it fixes the
  per-fraction side.

## Validity checks and warning codes

| Code | When |
|---|---|
| `PLANT_LOGKOW_OUT_OF_RANGE` | log K_ow outside the range the Briggs regressions were fitted on (range read from `briggs1982` in E1) |
| `PLANT_IONIZABLE` | the chemical is ionizable at the soil pH (pKa in the database); the neutral model may be badly wrong |
| `PLANT_INORGANIC_NEEDS_BCF` | a metal or inorganic without a user-entered bioconcentration factor |
| `PLANT_NOT_STEADY` | the growing period is shorter than three times 1/(g A / (K_la M) + lambda), so the steady state overstates harvest concentration |
| `IRRIGATION_USER_ENTERED` | the irrigation input is user entered rather than from M7 |
| `ECO_NO_SSL` | no Eco-SSL exists for the chemical and receptor group |
| `ECO_SCREENING_ONLY` | always shown with Eco-SSL results: screening values, not cleanup levels |
| `ECO_BENCHMARK_USER_ENTERED` | a legacy benchmark was user entered |
| `TPH_FRACTIONS_DO_NOT_SUM` | fraction mass fractions differ from one by more than 1e-6 |
| `TPH_FRACTION_UNMAPPED` | a fraction has no surrogate record |
| `TPH_CSAT_EXCEEDED` | f_j C_TPH exceeds the fraction's saturation limit |

## Coupling

- Inputs: soil concentration or series from the M4 exposure point concentration step (M2 and M3 sources
  feed it as they already do); air concentration from the M6 outdoor air box for the leaf gas term (zero
  when no vapor run exists, with the choice shown); irrigation through the interface above.
- Outputs: `produce` pathway intake into M4; produce in M5 closed-form cleanup levels; ecological HQ
  tables; the TPH total level in M5.

## Fixture plan and tolerances

1. Briggs RCF and TSCF at a few log K_ow values against values computed by hand from the published
   regressions: 1e-10 relative (closed form).
2. One-compartment leaf model: the time-dependent solution against the closed-form exponential and its
   steady state; mass balance closed at 1e-9.
3. Modern multi-compartment model: steady state from the ODE integrated with the engine's generic solver
   against the linear solve, 1e-8; a worked example from the primary publication if it prints one, at the
   precision printed (expected 2 to 3 significant figures, so 1 percent).
4. HHRAP fallback (if used): a hand calculation of the published equations, 1e-10.
5. Produce pathway: an M4 receptor run with a fixed C_p against a hand-computed dose, 1e-10; the M5
   closed-form produce level inverted back to target risk, 1e-9.
6. Eco-SSL wildlife: solve dose = TRV for C_s for at least cadmium and lead, mammal and bird guilds, and
   compare with the published Eco-SSLs. Published values are rounded to two significant figures, so the
   tolerance is 5 percent relative (a wider tolerance needs a DECISIONS entry). Plant and invertebrate HQs:
   exact against the hand-entered values.
7. TPH: the total level for a two- and a three-fraction mixture by hand, 1e-10; the M4 Table R-9 aliphatic
   C12-C16 row unchanged.

## Slice plan (stages 2 and 3)

One worker per slice. Engine slices are TDD with the fixtures above.

| Slice | Content | Depends on |
|---|---|---|
| D1 | Eco-SSL data: manifest, hand-entered values with page citations, pdftotext cross-check reader, generated `ecossl.json`, ATTRIBUTIONS data provenance | none |
| R1 | Reference verification: exact titles, venues and pages for the descriptor entries (Trapp and Matthies, Briggs, Trapp 2015, Sample, TPHCWG, MADEP); identify Trapp 2015 or rule the HHRAP fallback | none |
| E1 | Plant uptake engine: pore water step, Briggs factors, one-compartment leaf model, modern model, warnings, registration of `plantUptake.trapp-matthies-1995` and `plantUptake.trapp-2015` | R1 |
| E2 | Produce pathway into M4 (`produce`), presets from `epa2011efh`, closed-form produce in M5, irrigation interface type | E1 |
| E3 | Ecological screening engine: `eco.benchmark-hq` and `eco.ecossl-2005`, food web dose, uptake models, warnings | D1, R1 |
| E4 | TPH fractions: fraction set mappings, forward risk by fraction, total level through M5, Csat check | R1 |
| W1 | Web screen `#/plants-eco`: produce pathway inputs and results on the risk screen, eco HQ table, TPH composition editor; CDP check at 390x844 with zero overflow, light and dark | E2, E3, E4 |
| G | Docs close: methods note status, ROADMAP M9 row, HANDOFF, references moved to `used` or `data` | W1 |

D1, R1 run in parallel; E1 and E4 then run in parallel; E2 and E3 follow; W1 last.

## References and verification (2026-10-18)

| Key | Status in this stage |
|---|---|
| `epaecosslguidance` | Added as `planned`; title, directive number, dates and URL read from the PDF cover on 2026-10-18 |
| `epaecossl` | Existing `planned` entry; documents page URL and its 21 documents confirmed 2026-10-18 |
| `trappmatthies1995`, `briggs1982`, `trapp2015`, `sample1996`, `tphcwg1997`, `madep2002` | Existing descriptors; verification is slice R1 |
| `epa2005hhrap`, `epa2011efh`, `epa2024rsl` | Existing; used as described above |
