# Plant uptake, ecological screening and TPH fractions (M9)

Scope, equations, validity checks, coupling, data plan, fixture plan and slice plan for M9 (ROADMAP
section 3 rows O, P and Q). Equations are written in our own words from the primary publications cited by
reference key (full entries in `docs/ATTRIBUTIONS.md` once they move to `used`). The RISC5 manual was used
only as a map of which pathways RISC5 offers; none of its text, figures or tables is reproduced. Status:
scoping done 2026-10-18; slices D1, R1, E1, E3 and E4 are implemented (the slice plan table below carries
the status of every slice). The rulings are DEFAULT unless marked forced, recorded in
`docs/DECISIONS.md` (2026-10-18, M9 block).

Stage 1 in progress: slice R1 verified `trappmatthies1995` (Environ. Sci. Technol. 29(9), 2333-2338),
`briggs1982` (Pesticide Science 13(5), 495-504), `sample1996` (ORNL ES/ER/TM-86/R3), `tphcwg1997` (series
level only; volume titles and ISBNs conflict between sources) and `madep2002` (Policy WSC-02-411, from the
mass.gov listing; the PDF was not read). `trapp2015` is still unidentified (see below) and stays a
descriptor. Slice D1 (Eco-SSL data, 2026-10-18) read the
per-chemical document dates and directive numbers, the summary Eco-SSLs and the wildlife derivation inputs;
see "Eco-SSL data slice" below for what was and was not entered.

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
- Constants (slice E1, 2026-10-18): the Briggs root concentration factor is implemented with the constants
  the HHRAP appendix prints (log RCF = 0.77 log K_ow - 1.52 at log K_ow >= 2, log(RCF - 0.82) = 0.77 log
  K_ow - 1.52 below 2, fitted on log K_ow -0.57 to 4.6). The Briggs TSCF regression and the K_la
  correlation could not be read from a source, so TSCF and K_la are required user inputs (DECISIONS 12);
  `PLANT_LOGKOW_OUT_OF_RANGE` uses the fitted range -0.57 to 4.6.

### Modern: HHRAP 2005 fallback (`plantUptake.hhrap-2005`; Trapp 2015 not verified)

Slice E1 outcome (DECISIONS 11): neither Trapp candidate could be read, so the registered modern method is
the HHRAP fallback below (root uptake with the Travis and Arms factor, Briggs RCF over K_d for roots,
vapor transfer from the Bacci-type factor reduced by 100, dry weight, log K_ow caps 1.15 to 9.35 for Br
and -0.57 to 8.2 for RCF). The multi-compartment description that follows is the unverified expectation
and is not implemented.

- The ROADMAP names Trapp 2015 as the modern model; references.json holds it as a descriptor only. R1 found
  that the descriptor title is Trapp 2004 (Environ. Sci. Pollut. Res. 11(1), 33-39, a different year) and that
  the only 2015 candidate is Trapp, Environ. Sci. Technol. 49(1), 395-402 (radish calibration); the choice is
  open. Slice E1 first identifies the exact publication (journal, volume, pages) and reads it. If it cannot be verified,
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

### Eco-SSL data slice (D1, done 2026-10-18)

Checked 2026-10-18 on the EPA site.

| Source (key) | Current edition and location | Format | Licence or status |
|---|---|---|---|
| Guidance (`epaecosslguidance`) | Guidance for Developing Ecological Soil Screening Levels, OSWER Directive 9285.7-55, November 2003, revised February 2005; https://www.epa.gov/sites/default/files/2015-09/documents/ecossl_guidance_chapters.pdf (3,075,395 bytes served 2026-10-18), linked from https://www.epa.gov/chemical-research/guidance-developing-ecological-soil-screening-levels (page last updated April 21, 2026) | PDF | US government work, public domain |
| Per-chemical documents (`epaecossl`) | 21 documents, 17 metals (Al, Sb, As, Ba, Be, Cd, Cr, Co, Cu, Fe, Pb, Mn, Ni, Se, Ag, V, Zn) and 4 organics (DDT and metabolites, dieldrin, pentachlorophenol, PAHs), at https://www.epa.gov/sites/default/files/2015-09/documents/eco-ssl_<name>.pdf, listed on https://www.epa.gov/chemical-research/interim-ecological-soil-screening-level-documents (page last updated April 21, 2026). All state Interim Final on the cover except the DDT document, whose cover text carries no status line; cover dates run from November 2003 to April 2008 (read in slice D1, in the manifest) | PDF, no machine-readable table | US government work, public domain |

No consolidated table of values exists on the EPA site (checked 2026-10-18), so the build differs from the
RSL build in its reader:

- `packages/data/raw/ecossl/2026-10-18/manifest.json` lists URL, directive number, cover date, byte size and
  SHA-256 for the 21 per-chemical PDFs and the guidance PDF, with the retrieval date and the listing page's
  own date. The PDFs total about 26 MB and are not committed (gitignored); `pnpm --filter
  @model-flow/data fetch:ecossl` downloads any missing file and fails on a checksum or size mismatch
  (ruling 8, decided in D1).
- `packages/data/src/ecossl/values.csv` holds the summary Eco-SSL per substance and group (Table 2.1 of each
  document, with PDF page); `wildlife.csv` holds the wildlife derivation inputs per surrogate (TRV, food
  ingestion rate, soil proportion of the diet, the prey uptake model and the printed surrogate Eco-SSL, from
  Tables 5.2, 6.2, 6.3 and 6.4, with PDF page). Every number is typed from the document, none from memory.
- The reader test (`packages/data/test/ecossl.test.ts`) re-extracts each cited page (and the next, for a
  table that breaks across pages) with `pdftotext -layout` and checks every hand-entered number appears
  there; when `pdftotext` or the fetched PDFs are absent it runs the checksum and consistency checks only
  and prints that the cross-check was skipped.
- Output: `packages/data/generated/ecossl-2026-10-18/ecossl.json`, with a provenance block (listing page,
  per-document directive, date, URL and checksum, licence status) and, per substance, the RSL
  `chemicals.json` record ids it maps to (ids read from the file and checked by name). Unmapped
  substances are listed in the file: the two PAH groups, because the document defines low and high
  molecular weight PAHs by ring count and lists no members. PAH group membership is not mapped in E3
  (the screen works on group values); it is deferred to a future slice named "PAH group membership".
- The DDT document derives one value for DDT, DDE and DDD combined. The mapping lists the three RSL
  records, and the soil concentration screened against that value is the sum of the three; screening
  each record separately would understate the hazard quotient by up to a factor of three.

What the data slice found, so the engine slices do not rediscover it:

- Aluminum and iron have no numeric Eco-SSL; the documents give a screening procedure instead (aluminum is
  a contaminant of potential concern only where soil pH is below 5.5; iron is judged from site pH and Eh).
  They are stored with status `procedure`. Chromium is split into trivalent and hexavalent: plants and soil
  invertebrates are "Not enough data" for both, avian has a trivalent value only. Not-available groups are
  explicit statuses (`NA`, `NC`), never zeros or blanks.
- The wildlife Eco-SSL of a group is the smallest of its three surrogate values (dove, woodcock, hawk;
  vole, shrew, weasel); a test checks this for every substance. Nickel has no earthworm-based surrogate
  value (printed NA), so its group value comes from the other two.
- The prey uptake model is a ratio (Bi = a C), a log-linear regression (ln Bi = a ln Soil + b) or, for
  pentachlorophenol carnivores, a linear form (Bi = a C + b); C is the soil concentration or, for predators
  of small mammals, the prey diet concentration cdiet times soil. Solving dose = TRV for soil reproduces 99
  of the 106 printed numeric surrogate values (two nickel rows print NA) within 5 percent (cadmium and lead fully). Seven printed rows
  do not reproduce from their own printed inputs and are flagged in `wildlife.csv`: pentachlorophenol hawk
  and weasel (printed hawk FIR and Ps, and weasel Ps, differ from the standard values in every other
  document; the standard values reproduce the printed result), vanadium hawk and weasel (the printed
  earthworm factor in the prey diet is not applied in the printed result), selenium woodcock (10 percent),
  copper vole (5.5 percent) and low molecular weight PAH weasel (printed 1,200, inputs give about 11,700,
  likely a misprint). None enters the cadmium and lead fixtures of fixture plan item 6 or changes a
  wildlife group value.
- The receptor body weights, ingestion rates and diet fractions beyond the per-document table, and the
  soil-to-biota models for chemicals the documents do not tabulate, live in the guidance Attachment 4-1;
  they are not entered here. Slice E3 did not read them either: the engine takes the per-surrogate derivation inputs
  of `wildlife.csv` (or user inputs) and does not carry a default receptor table.

## TPH fraction cleanup levels (`tph.tphcwg`, `tph.madep`)

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
  the saturation limits (see the implementation note below).
- Implementation (slice E4): the two registered methods share one kernel and differ in the fraction set
  and citation, which is what the legacy and modern pairing rule needs: `tph.tphcwg` (legacy, cites
  `tphcwg1997`) and `tph.madep` (modern, cites `madep2002`). No default fraction ranges ship: the
  carbon-range tables of the two sets were not read, so the caller supplies each fraction (label, family,
  mass fraction) with its RSL surrogate record id, and a fraction with no id is unmapped. The engine
  validates ids against the five RSL records. Per-fraction levels CL_j are those for a hazard quotient of
  one; the forward run takes a callback that runs one fraction as its own chemical through M4. The
  saturation checks use the pure-phase limit (mole fraction 1), F_sat,j = S_j (rho_b K_d,j + theta + theta_a H_j) / rho_b.
  The per-fraction check (f_j C_TPH against F_sat,j) alone is non-conservative, because the fractions
  share one separate phase. The mixture check is sum_j( f_j C_TPH / F_sat,j ) > 1 (Raoult's law), and
  `TPH_CSAT_EXCEEDED` is raised on either.
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
| `ECO_NO_SSL` | no numeric Eco-SSL exists for the chemical and receptor group |
| `ECO_SCREENING_ONLY` | always shown with Eco-SSL results: screening values, not cleanup levels |
| `ECO_BENCHMARK_USER_ENTERED` | a legacy benchmark was user entered |
| `TPH_FRACTIONS_DO_NOT_SUM` | fraction mass fractions differ from one by more than 1e-6 |
| `TPH_FRACTION_UNMAPPED` | a fraction has no surrogate record |
| `TPH_CSAT_EXCEEDED` | f_j C_TPH exceeds the fraction's saturation limit, or the sum over fractions of f_j C_TPH / F_sat,j exceeds one |

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
| D1 | Eco-SSL data: manifest, hand-entered values with page citations, pdftotext cross-check reader, generated `ecossl.json`, ATTRIBUTIONS data provenance (done 2026-10-18, branch t-m9) | none |
| R1 | Reference verification: exact titles, venues and pages for the descriptor entries (Trapp and Matthies, Briggs, Trapp 2015, Sample, TPHCWG, MADEP); identify Trapp 2015 or rule the HHRAP fallback | none |
| E1 | Plant uptake engine: pore water step, Briggs factors, one-compartment leaf model, modern model, warnings, registration of `plantUptake.trapp-matthies-1995` and `plantUptake.hhrap-2005` (done 2026-10-18, branch t-m9; the Trapp 2015 model was not verified, DECISIONS 11) | R1 |
| E2 | Produce pathway into M4 (`produce`), presets from `epa2011efh`, closed-form produce in M5, irrigation interface type | E1 |
| E3 | Ecological screening engine: `eco.benchmark-hq` and `eco.ecossl-2005`, food web dose, uptake models, warnings (done 2026-10-18, branch t-m9) | D1, R1 |
| E4 | TPH fractions: fraction set mappings, forward risk by fraction, total level through M5, Csat check (done 2026-10-18, branch t-m9; DECISIONS 16) | R1 |
| W1 | Web screen `#/plants-eco`: produce pathway inputs and results on the risk screen, eco HQ table, TPH composition editor; CDP check at 390x844 with zero overflow, light and dark | E2, E3, E4 |
| G | Docs close: methods note status, ROADMAP M9 row, HANDOFF, references moved to `used` or `data` | W1 |

D1, R1 run in parallel; E1 and E4 then run in parallel; E2 and E3 follow; W1 last.

## References and verification (2026-10-18)

| Key | Status in this stage |
|---|---|
| `epaecosslguidance` | `used` since slice E3 (wildlife dose model and screening-only status; Attachment 4-1 not read). Added as `planned`; title, directive number, dates and URL read from the PDF cover on 2026-10-18 |
| `epaecossl` | `used` since slice E3 (cited by `eco.ecossl-2005`), `data` since slice D1: documents page URL, its 21 documents, cover dates and directive numbers read 2026-10-18 |
| `trappmatthies1995`, `briggs1982`, `trapp2015`, `sample1996`, `tphcwg1997`, `madep2002` | Existing descriptors; verification is slice R1. `sample1996` is `used` since slice E3 (cited by `eco.benchmark-hq` as the expected user benchmark source; text not read); `tphcwg1997` and `madep2002` are `used` since slice E4 (cited by `tph.tphcwg` and `tph.madep` for the fraction concept; the documents were not read) |
| `epa2005hhrap`, `epa2011efh`, `epa2024rsl` | Existing; used as described above |
