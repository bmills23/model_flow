# Usability plan

Status (2026-10-30, after wave AC2): plan of record for making the app usable for its target user (regulatory work: a consultant
preparing a risk assessment for a state or EPA program, or an agency reviewer checking one). Feature parity with RISC5 is
done (`docs/UI_PARITY.md`); this file tracks what stops that user finishing a real job. Each row's status is maintained in
place; a status is a claim, grep the tree before trusting it.

## The walkthrough (2026-10-23)

Two realistic jobs were attempted end to end on the built app (commit `968cd98`), starting from the home page with only
`docs/USER_GUIDE.md`, at desktop width with phone spot checks (true 390x844: zero overflow on transport, vapor, surface
water, risk, cleanup and report).

1. **Gas station release.** Benzene, toluene, ethylbenzene, xylenes and MTBE in soil (mg/kg) and groundwater (ug/L) under
   a former UST; homes with basements 30 m downgradient. Wanted: the concentration at a downgradient well over time,
   resident indoor air risk, site-specific cleanup levels and a report a state reviewer would accept. Verdict: finished
   with workarounds in about 55 minutes; the report could not be submitted (rows B1 to B3).
2. **Dry cleaner.** Trichloroethylene in groundwater discharging to a creek 200 m away. Wanted: the concentration reaching
   the creek, the water quality criteria comparison and the report. Verdict: finished with workarounds in about 25
   minutes; the report is usable but carries internal terms, and the legacy and modern methods disagree on whether the
   organism-only criterion is exceeded (ratio 1.02 against 0.30) with nothing saying which to report (row M11).

Values the user had to look up or guess: hydraulic conductivity, gradient, porosity, foc, the source box, half-lives,
transverse and vertical dispersivity, basement and building geometry, creek flow and cross-section, bed conductivity,
bed gradient and discharge thickness.

## Findings

| ID | Severity | Route | What happened | Smallest fix | Wave | Status |
|---|---|---|---|---|---|---|
| B1 | Blocker | `#/report` | Transport and vapor sections print only the run last made on each screen (MTBE); benzene's well and indoor air concentrations, which drive the risk, appear nowhere | One block per chemical from the per-chemical sent results | AA | Done (AA, 2026-10-24): one named block per chemical with its own results and the inputs its run used (recorded when the result is sent), and a changed screen run is labelled |
| B2 | Blocker | `#/cleanup` to `#/report` | With a groundwater modeled source the report says "Not computed: a modeled source ... open the cleanup screen"; the site-specific levels never print | Solve them for the report, as the surface water levels already are | AA | Done (AA, 2026-10-24): kept with the project per chemical and printed while their fingerprint matches; confirmed by the acceptance run |
| B3 | Blocker | `#/report` | "Showing the first 40 of 60 rows": legacy cleanup rows are missing from the print | Never truncate a result table in the report | AA | Done (AA, 2026-10-24): every table prints in full; the plume map's data table stays a labelled sample of 20 rows |
| M1 | Major | `#/report` | Says no value is an entry without a source, yet every typed and pre-filled site value (bulk density 1.7, crack fraction, 1 Pa) has none | List typed and pre-filled site inputs as entries without a source | AA | Done (AA, 2026-10-24): confirmed by the acceptance run (52 entries without a source listed) |
| M2 | Major | several | Internal keys and codes on screens and in the report (`c0`, `rx`, `alpha tOverride`, `steps 2 factor`, "108-88-3 ... waterIngestion", "needs etByPathway.waterDermal", "K_b i_b differs from the M1 Darcy flux") | Screen labels, chemical names and units in their place | AB | Partly, AC2 (2026-10-30): the guided steps and the guided report use labels, chemical names and units (step 5 and 6 notes carry no codes, chemicals show by name); the guided report's risk and cleanup inputs keep the workbench's flattened labels (AC3) and the workbench screens are unchanged (AB) |
| M3 | Major | `#/risk` | "71-43-2: no toxicity value for any linked bathroomAir pathway", but benzene has a unit risk; the cause is a missing exposure time | Name the missing input | AB | Done in the guided flow (AC2, 2026-10-30): step 4 names each missing exposure input with the receptor and the pathways that need it, and 4c asks only for the toxicity values the ticked pathways read; the workbench `#/risk` message is unchanged (AB) |
| M4 | Major | `#/risk`, `#/report` | Not quantified shown as 0 (legacy bathing dermal contact 0; toluene and xylenes cancer risk 0) | Print "not quantified" | AA | Done (AA, 2026-10-24): "not quantified" with its reason, and a total that omits a pathway is marked partial |
| M5 | Major | `#/cleanup` | Levels above solubility not flagged (toluene vapor source level 1160 mg/L, solubility 526; xylenes modeled 481 mg/L, solubility 106); the solubility ceiling is one blank box for all chemicals | Default the ceiling to each chemical's solubility and flag levels above it | AA | Done (AA, 2026-10-24): per-chemical ceiling with its source; levels above it flagged (mobile check and tests; the acceptance run's levels stayed below solubility) |
| M6 | Major | `#/cleanup` | The modeled source solve leaves out indoor air; the vapor source levels apply at the building's water table, not at the source | Chain the vapor run into the modeled solve | AC | Open (AC3; AC1 and AC2 do not touch the modeled solve: step 5 solves the well, vapor and surface water source levels as separate solves, AC3.1 adds the combined solve) |
| M7 | Major | `#/site` | One medium only, so groundwater plus vapor is refused; no groundwater to indoor air or to surface water path in modeled mode; says no screen compares groundwater with ecological benchmarks, which `#/surface-water` does | Add those paths and correct the statement | AC | Done for human receptors, AC1 and AC2 (2026-10-30): step 2 allows several source media at once, groundwater plus soil gas together, and the well, building, surface water and produce paths, and steps 4 to 6 carry them through; the retired `#/site` screen (with the wrong statement) redirects to step 2. Two sources on one path and the ecological flow stay for AC3 |
| M8 | Major | `#/vapor`, `#/surface-water` | Screens open on validation cases (Table R-3 and R-8 benzene) with results showing; a linked TCE run kept the benzene Koc and left source width blank, and the error sat beside old results marked "Up to date" | Start blank and fill from the linked run; hide results that no longer match the inputs (the stale display is in AA, the blank start in AC) | AA, AC | Stale display done (AA, 2026-10-24: "Inputs need attention" in place of "Up to date", old results dimmed); blank start done in the guided flow, AC1 and AC2 (2026-10-30): step 3a starts every model blank except the site values and fills each chemical from the database; the workbench screens (now behind "Model workbench") still open on validation cases, by design, and say so |
| M9 | Major | `#/vapor` | The petroleum separation screen prints "Screened out: dissolved source" with every concentration blank | No verdict without concentrations | AA | Done (AA, 2026-10-24): "No verdict yet" with the missing concentrations listed |
| M10 | Major | fate screens, `#/risk` | Five chemicals mean five runs each on transport and vapor, three send buttons per chemical, then ten checkboxes on `#/risk` | Run every project chemical at once and use sent results automatically | AC | Done in the guided flow, AC1 and AC2 (2026-10-30): step 3d runs every chemical in one press and steps 5 and 6 and the guided report read the outputs with no send button and no per-chemical ticks; the workbench screens keep their send buttons and their runs do not feed the steps |
| M11 | Major | `#/surface-water`, `#/report` | Legacy and modern results disagree on an exceedance with nothing saying which governs | The report states which method is its basis and shows the other as a sensitivity | AA | Done (AA, 2026-10-24): each section states its method basis and prints the other as a sensitivity, flagging a disagreement |
| m1 | Minor | input screens | Groundwater data in ug/L, every input in mg/L, no unit choice | A unit choice on concentration inputs | AB | Done in the guided flow (AC1, 2026-10-26): step 3b chooses a unit per column and the Run converts; the workbench inputs stay in mg/L (AB) |
| m2 | Minor | chemical search | "toluene" does not put toluene first | Exact name match first | AB | Done on the chemical pages (AC1, 2026-10-26): an exact name or CAS match sorts first in step 1 and the database browser |
| m3 | Minor | transport | The Kd box shows 0.8922000000000001 | Format derived values | AB | Open |
| m4 | Minor | `#/vapor` | The send button says "the method chosen above" but uses the "Method to send" choice | Name the control it uses | AB | Open |
| m5 | Minor | errors | An error names `risc4-benzene` | Use the case name | AB | Open |
| m6 | Minor | `#/cleanup` | Heading reads "Vapor source levels Benzene, Benzene" | Name each chemical once | AB | Open |
| m7 | Minor | `#/report` | "Generated" date in UTC (a day ahead in the evening in the Americas) | Local date and time with the zone | AB | Open |
| m8 | Minor | `#/report` | Title re-cased to "Model_flow Project Report" | Keep the project name as typed | AB | Open |
| m9 | Minor | `#/surface-water` | The criteria comparison cannot take a state standard | Let the user enter a standard with its source | AC | Partly, AC2 (2026-10-30): step 5 takes a state standard for a chemical's well target with its value, unit and source (a blank source is flagged), and step 6 and the guided report print it; the surface water criteria comparison still cannot take one, and the ecological flow that would (AC3.3) is not built |
| m10 | Minor | `#/docs` | The user guide is a long reference with no worked example | A worked example project and a quick start | AC | Open (AC3.4; since AC2 the guide opens with a six-step guide, one section per step, but it has no worked example) |
| n1 | Minor | `#/cleanup`, `#/report` | With runs held for four chemicals, the note for a fifth says "the groundwater transport run is for Methyl tert-Butyl Ether (MTBE), not Ethylbenzene", as if only one run were held (acceptance run, 2026-10-24) | Say no run was sent for that chemical | AB | Open |
| n2 | Minor | `#/vapor` | The "Source from another screen" selector sits below the results, so the sent water table series went unused and the groundwater concentrations were typed by hand (acceptance run, 2026-10-24) | Put the source choice before the results and say which source the results use | AC | Done in the guided flow, AC1 and AC2 (2026-10-30): step 2 sets the source before the Run and step 3d names the recorded source of each indoor air row; the workbench vapor screen is unchanged |

## Waves

- **AA, a report fit to submit (landed 2026-10-24):** B1 to B3, M1, M4, M5, M8 (stale results), M9 and M11. Every number the report prints is
  complete, current, honest about its sources, and says what was not quantified.
- **AB, plain language:** M2, M3, m1 to m8 and n1. Labels, names and units instead of internal keys, codes and raw numbers.
- **AC, a guided site workflow (AC1 landed 2026-10-26: steps 1 to 3; AC2 landed 2026-10-30: steps 4 to 6, the guided report and the switch of the main navigation):** M6, M7, M8 (blank start), M10, m9, m10 and n2. Since 2026-10-25 its shape is the
  six-step flow in `docs/GUIDED_FLOW.md`, which Bryan approved from a mockup; he ruled its open calls "all as recommended" the same day, so AC comes before AB. Fate screens that start blank and run every
  project chemical, site model paths that match real sites, and a worked example. Product choices here go to Bryan
  before the wave starts.
