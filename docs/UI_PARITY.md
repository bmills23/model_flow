# UI near-parity gaps: model_flow against RISC5 (2026-10-19)

Inputs: `docs/RISC5_UI_INVENTORY.md` (102 paraphrased features, IDs A1 to J8 used below), `docs/USER_GUIDE.md`,
`apps/web/src/App.tsx`, `docs/ROADMAP.md` section 7 Deferred lists, and targeted source reads cited inline.
Landed in wave G (2026-10-19) and excluded from slices: G1 produce and TPH totals on `#/cleanup`, G2 charts and
uncertainty in `#/report`, G3 axe-core and keyboard order, G4 surface water run speed.

## 1. What near-parity means here

1. Every task a RISC5 user performs in the guide's six steps can be done in model_flow, through a browser equivalent (file download and upload, hash share link, CSV, print to PDF), never through a Windows or spreadsheet mechanism.
2. Parity is of workflow, not of screens: a user can walk chemicals, site model, transport, receptors, risk or cleanup, results in order from the app shell, but nothing is locked; stale-feed detection replaces RISC5's step locking.
3. Database editing is project-level only: a user can see every database value with its source and replace any value for this project, saved in the project file and named as user-supplied in the report; there is no permanent master library (no accounts, no server, browser storage is not reliable state).
4. Model gaps already on a milestone's Deferred list are engine work, not UI gaps; a row counts as a UI gap only when the engine (or data) already exists and the screen is the missing piece.
5. Where model_flow already exceeds RISC5 (legacy and modern switch, probabilistic cleanup levels, share links, stale feeds), that is parity met; the bar is "nothing a RISC5 user reaches for is missing", not a clone.

Evidence for this definition: the project's working rules ($0 hosting, no UI framework, mobile and desktop), the user guide's "nothing is uploaded, no accounts", ROADMAP M11 Deferred (RISC5 project import, named projects and cloud sharing deliberately deferred), and the inventory notes (RISC5's own guide leaves Monte Carlo UI, eco Steps 2 and 4 and charting undescribed).

## 2. Gap table

Value H/M/L is user value toward parity; size S/M/L is implementation effort. "None" means parity met.

| RISC5 feature (paraphrased, manual page) | model_flow today | Gap | Value | Size |
|---|---|---|---|---|
| A1 new project with warning (2-4) | Header "New project" clears all screens | None | - | - |
| A2, A3 save and save as (2-4, 2-5) | Save project downloads JSON; title names the file | None | - | - |
| A4 open project, discard warning (2-5) | Open by file or drop, asks when unsaved changes | None (RISC5 .prj import is out of scope, section 4) | - | - |
| A5 exit prompts to save (2-5) | Autosave to browser; no unload warning | Minor: no warning on tab close with unsaved file changes; autosave covers recovery | L | S |
| A6 default project folder (2-3) | Browser download folder | Out of scope | - | - |
| B1 six numbered steps (2-3) | Step bar in `App.tsx` lists the six steps but five render as disabled buttons; only Transport links. Home page copy still says "other steps are placeholders" and has no report link | Broken nav: wire every step to a real route, fix stale home copy | H | S |
| B2 context help on every screen (2-5) | `#/docs` reader exists; no per-screen help link; `slugFromHash` has no section anchors | Add a Help link per screen to its guide section | M | S |
| B3 decimal comma option (FAQ-2) | `Number(s)` in each form parser; "1,5" is an error | No comma decimal entry | L | M |
| B4 revisit earlier steps (3-2) | Free navigation plus stale-feed notices | None (exceeds) | - | - |
| B5 database editor entry (2-5) | No chemical database view at all | See C1 to C5 | - | - |
| B6 tutorials and FAQ (FAQ-1) | User guide and methods notes; worked examples on vadose and saturated | Out of scope (guide covers it) | - | - |
| C1, C5, J1, J2, J4, J7 browse the chemical database with per-value sources and a full summary table (FAQ-7, 10-1 to 10-7) | RSL 2024-11 loaded by `risk/useChemicalDb.ts` only to pick chemicals; values and source tags never shown as a table | Read-only chemical database browser with sources and CSV | M | M |
| C2, C3 add or remove chemicals permanently (FAQ-8, 2-6) | None | Out of scope as a master edit; a user chemical can be a project-level entry later (not sliced) | L | L |
| C4, D6 per-property reference text (FAQ-9, 3-3) | Source tags exist in the data, not displayed | Covered by the browser slice and the override slice (user note per override) | M | - |
| C6, G6 human receptor profiles and default dropdown (2-6, 6-4) | Three presets (resident, worker, child) per receptor | None for the dropdown; editing is G7 | - | - |
| C7 Monte Carlo receptor profiles (FAQ-3) | Distributions per input saved in the project | Out of scope (EFH distribution library is M10 deferred engine and data work) | - | - |
| C8, F4 soil type profiles and dropdown (2-6, 5-3) | Texture presets on `#/vapor` only (engine `SOIL_TEXTURES`); vadose and saturated take raw hydraulic inputs | Texture preset on vadose and saturated screens | M | S |
| C9 ecological receptor profiles (2-6) | Eco-SSL benchmarks for birds and mammals; engine `wildlifeDose` and `wildlifeHazardQuotient` exist; M9 Deferred says the surrogate food web table is not wired to the screen | Site-specific wildlife dose panel (UI is the only missing piece) | L | M |
| C10, C11 restore and persist databases (2-6, 2-3) | Databases are versioned committed data | Out of scope (no master library) | - | - |
| D1, D2 chemical picker, 50 limit (3-2) | Picker on risk and cleanup; per-screen chemical selection elsewhere | Partial: no project-wide chemical list shared by every screen | H | L |
| D3, D4, G9, J8 project-only edit of chemical and toxicity values, same value everywhere (3-3, 6-5, 7-8) | `risk/build.ts` reads `rec.tox` straight from RSL; no override anywhere | Project-level toxicity override shared by risk and cleanup, marked as user values | H | M |
| D4, F8 fate screens use the chemical's database properties (3-3, 5-5) | `#/vapor` fills M, S, H, Koc, Da, Dw from RSL (`vapor/chemicals.ts`); transport, vadose, saturated take typed values (vadose ships benzene) | "Fill from database" on transport, vadose, saturated | H | M |
| D5 chemical summary table, two sheets (3-3) | None | Covered by the browser slice CSV (values plus source column) | M | - |
| E1 to E8 conceptual site model choices (4-2 to 4-4) | No site model screen; feed buttons on each screen carry the chain | Advisory site model screen that turns choices into an ordered screen checklist with the feeds to send | H | M |
| E9, G13 ecological Step 2 and 4 (4-4, 6-7) | `#/plants-eco` screening | Out of scope (RISC5 guide leaves it pending) | - | - |
| F1 direct concentration entry (5-1) | Risk screen concentrations | None | - | - |
| F2, F3, F5 site properties and source concentrations (5-2 to 5-4) | Per-screen forms | None | - | - |
| F6, F7 TPH effective solubility, fraction held in back-calc (5-4, 5-5) | Vadose has Raoult's law with TPH in source; G1 is adding TPH totals to cleanup | None beyond G1 | - | - |
| F9 degradation rate edit (10-4) | Half-life on transport, mu on vadose | None | - | - |
| F10 to F12 run time, time step, pulse, steady-state note (5-6) | Evaluation time and pulse on transport; vapor is steady state | None | - | - |
| F13, F14 run models, model list (5-5, 1-3) | In-browser workers; every listed model has a screen (oxygen-limited vapor deferred engine) | None for UI | - | - |
| G1, G2 pathway checklist (6-2, 7-1) | Per-receptor checkboxes on risk | None | - | - |
| G3, G4 one or two receptors, additive (6-4) | Two receptors, additive on cleanup and risk | None | - | - |
| G5 free-text receptor labels (6-5) | Label is "Receptor 1 (Resident)" from `PRESET_LABELS` | No user name for a receptor | M | S |
| G7, G8 edit exposure factors, tint edited values (6-3 to 6-5) | Only nine factors with no default are editable (`ReceptorPanel.tsx` "Site-specific factors"); body weight, frequency, duration and intake rates are fixed by preset | Editable preset factors with an edited marker and reset | H | M |
| G10 inhalation toxicity basis choice (6-5) | Legacy and modern method switch sets the basis | Out of scope as a toggle | - | - |
| G11, G12 back-calc note, two scenarios at once (6-1, 1-5) | Two receptors with different presets | None | - | - |
| H1 to H5, H7, H13, H14 risk vs cleanup, individual vs cumulative, targets, governing level (8-1 to 8-9) | `#/risk` and `#/cleanup` | None | - | - |
| H6, H8 MCL target, averaging time (8-2, 8-3) | MCL targets (`cleanup/mcl.ts`) and averaging time on modeled cleanup | None | - | - |
| H9 surface water target overrides groundwater (8-5) | Not available | Engine deferral (M5: surface water as target medium) | - | - |
| H10 to H12 one receptor for modeled, deterministic only, run (8-1, 8-4) | Modeled cleanup chains; probabilistic cleanup also | None (exceeds) | - | - |
| I1 to I5, I8 to I10 risk, hazard, input and output summary, cleanup results, per-medium tables (9-1, 5-6, 8-9) | Per-screen result tables with CSV; `#/report` with inputs, results, warnings, methods statement | None | - | - |
| I6, I7, I13, I15 spreadsheet output, output menu, print via spreadsheet, macros (2-1, 9-1, FAQ-4) | CSV, report, browser print | Out of scope (web equivalents exist) | - | - |
| I11, I12 concentration vs time charts, breakthrough check (5-5, 5-6) | Breakthrough and depth charts on screens; report charts are G2 | None beyond G2 | - | - |
| I14 surface water and sediment criteria comparison (1-5) | US criteria comparison on `#/surface-water` | International sets are engine and data deferral (M8) | - | - |
| J3 vegetable uptake factor (10-4) | Plant factors on `#/plants-eco` | None | - | - |
| J5 TPH fractions as chemicals (10-1) | TPHCWG and MADEP sets on `#/plants-eco` | None | - | - |
| J6 RfC and unit risk conversion (10-7) | Engine converters (`iurFromPerUgM3`, `rfdFromMgPerKgDay`) | None | - | - |

## 3. Implementable slices

Each slice is TDD (failing test first), sized as one implementation unit, ends with `corepack pnpm gate`
green and `scripts/mobile-check.mjs` at zero overflow (390x844 light and dark, 1280). Each updates the
matching `docs/USER_GUIDE.md` section in its own commit. Project schema rule for every slice that adds
saved state: add an optional key or optional field inside format version 1 and a round-trip test in
`project/*.test.ts`; if a slice finds a version bump is needed, it stops and reports instead.

### U1 Working step bar and current home page (B1)
- Scope: each of the six steps links to a real route (Chemicals to `#/risk` until U3 lands, Site model to
  `#/transport` until U2 lands, Transport to `#/transport`, Receptors to `#/risk`, Risk and cleanup to
  `#/cleanup`, Results to `#/report`); `aria-current` on the step that owns the current route (fate screens
  belong to Transport); remove disabled buttons; rewrite the stale home lede and add the report link.
- Files: `apps/web/src/App.tsx`, `App.test.tsx`, `styles.css`, `docs/USER_GUIDE.md` (Getting around).
- Acceptance: no disabled step remains; a test maps every route hash to exactly one step; home copy names
  no placeholder; step bar wraps without overflow at 390 px.
- Depends on: G3 merged (both edit the shell and focus order). Conflict: U2, U3 retarget one link each.

### U2 Site model screen (E1 to E8)
- Scope: new `#/site` screen with the choices human or ecological, direct concentrations or models, source
  medium, onsite or downgradient, vapor model, produce source; output is an advisory ordered checklist of
  screens with the feed button to press on each and links; no locking. Saved in the project under a new
  `site` key; shown as one line in the report inputs section.
- Files: new `apps/web/src/site/` (form, checklist builder, page, tests), `project/schema.ts`,
  `project/fields.ts`, `project/screens.ts`, `App.tsx` (route, retarget the Site model step),
  `report/buildReport.ts` (one input block), `docs/USER_GUIDE.md`.
- Acceptance: a pure `checklist(choices)` function covered by a table test of every valid combination; the
  invalid combos RISC5 forbids (two source media, soil and irrigation produce together) are explained, not
  silently allowed; project round trip; mobile check.
- Depends on: U1; G2 merged (report file). Conflict: report files with G2, shell with U3.

### U3 Chemical database browser (C1, C4, C5, D5, J1, J2, J4, J7)
- Scope: new `#/chemicals` read-only view of the RSL 2024-11 records: search by name or CAS, each property
  and toxicity value with its source tag, data edition shown, Download CSV (all or the filtered rows, with a
  source column per value). Mobile: cards or a scrolling table region, no page overflow.
- Files: new `apps/web/src/chemicals/`, reuse `risk/useChemicalDb.ts` and `risk/chemicalDb.ts`,
  `export/csv.ts`, `App.tsx` (route, retarget the Chemicals step), `bundleSize.test.ts` if the chunk grows,
  `docs/USER_GUIDE.md`.
- Acceptance: every field shown for a fixture record equals the data file value; CSV header carries edition
  and date like other CSVs; search test; table has a caption and header scopes; zero overflow at 390.
- Depends on: U1 (soft). Conflict: `App.tsx` route list with U2 (trivial).

### U4 Project toxicity overrides (D3, D4, G9, J8)
- Scope: per chemical on `#/risk` and `#/cleanup`, an "Edit values" disclosure listing the toxicity values
  the chosen pathways use, each with the database value and source; a user value replaces it for this
  project, with a required short source note; edited fields marked (text label plus tint, not colour
  alone); reset per field. Overrides live once at project level (new `overrides` key) so both screens show
  the same value; the report lists them as user-supplied values; uncertainty runs use the overridden point
  value.
- Files: new `apps/web/src/overrides/` (store, form, panel), `risk/build.ts`, `cleanup/build.ts`,
  `risk/ChemicalCard.tsx`, `cleanup/CleanupPage.tsx`, `project/schema.ts`, `report/results.ts` or
  `report/buildReport.ts`, tests in each.
- Acceptance: an override changes risk and cleanup results by the expected ratio in a test; removing it
  restores the database value; project round trip; report lists the override with its note; feed staleness
  still fires when an override changes an upstream input.
- Depends on: G1 and G2 merged (cleanup and report files). Conflict: high with U5 (same files), run serially.

### U5 Editable exposure factors and receptor names (G5, G7, G8)
- Scope: in each receptor panel, show the preset's legacy factors (body weight, exposure frequency and
  duration, averaging times, intake rates) and the modern stage scalars the engine boundary exposes, all
  editable per project, marked when they differ from the preset, "Reset to preset" per receptor; an
  optional receptor name used in tables, CSV and report in place of "Receptor 1".
- Files: `risk/ReceptorPanel.tsx`, `risk/form.ts`, `risk/build.ts` (merge edits over `LEGACY_PRESETS` and
  `MODERN_PRESET`), `risk/project.ts`, `cleanup/` receptor equivalents, `risk/csv.ts`, `cleanup/csv.ts`,
  `report/results.ts`, tests.
- Acceptance: editing body weight scales the dose terms by the expected factor in a test for both methods;
  switching preset with edits asks or resets per a test; names flow to CSV and report; legacy uncertainty
  sampling still centres on the edited value.
- Depends on: U4 (shared files). Conflict: high with U4, medium with G2.

### U6 Help link per screen (B2)
- Scope: `#/docs/<slug>/<section>` support in `docs/catalog.ts` and heading ids in `docs/markdown.ts`; the
  reader scrolls to and focuses the heading; each screen gets a "Help" link to its user guide section.
- Files: `docs/catalog.ts`, `docs/markdown.ts`, `docs/DocsPage.tsx`, one line in each `*Page.tsx`, tests.
- Acceptance: a test that every screen's help target resolves to an existing heading id; back button
  returns to the screen; links meet the 44 px target.
- Depends on: G3 (focus handling). Conflict: low, one line in every page file, so merge after U8 and U7.

### U7 Soil texture presets on vadose and saturated (C8, F4)
- Scope: a texture select filling the hydraulic inputs from the engine's `SOIL_TEXTURES` (already sourced
  for vapor), with Custom kept and every value editable after filling, mirroring `vapor/form.ts`
  `applyTexture`. The slice first confirms each mapped field matches the vadose model's parameter
  definitions (residual moisture, porosity, N, conductivity) and stops if one does not.
- Files: `vadose/form.ts`, `vadose/VadosePage.tsx`, `vadose/project.ts`, `saturated/` equivalents, tests.
- Acceptance: choosing a texture fills the documented values (test against `SOIL_TEXTURES`); edited value
  survives a re-render; project round trip; the validation case still loads.
- Depends on: U8 (same form files). Conflict: medium with U8.

### U8 Fill chemical properties from the database on fate screens (D4, F8)
- Scope: a chemical select on `#/transport`, `#/vadose` and `#/saturated` that fills the properties the
  RSL record carries (Koc, solubility, Henry's constant, diffusivities, molecular weight) using the
  `vapor/chemicals.ts` pattern; values stay editable; a note names the source; properties the database
  lacks (half-life, decay) stay user inputs and say so. Surface water excluded until G4 lands.
- Files: shared helper lifted from `vapor/chemicals.ts`, `transport/form.ts` and page, `vadose/form.ts` and
  page, `saturated/` form and page, tests.
- Acceptance: fill test per screen against a fixture record; the vadose benzene validation case still
  reproduces; no feed changes meaning.
- Depends on: none. Conflict: medium with U7, low with U6.

### U9 Wildlife dose panel (C9)
- Scope: on `#/plants-eco`, a site-specific wildlife hazard quotient panel using `wildlifeDose` and
  `wildlifeHazardQuotient`: surrogate receptor rows prefilled from the `ecossl` derivation rows with page
  citations, every factor editable, screening-only warning kept.
- Files: `plantsEco/` page, form, eco module, project, csv, tests.
- Acceptance: one row reproduces its Eco-SSL derivation within the existing tolerance; CSV; mobile check.
- Depends on: G1 (plants-eco feeds). Conflict: low.

### U10 Decimal comma entry (B3), optional
- Scope: a per-viewer setting (localStorage, wrapped in try and catch) to read and show numbers with a comma
  decimal; one shared parser replaces the per-form `Number(s)` calls; project files and CSV stay point.
- Files: `ui/controls.tsx`, every `*/form.ts` parse helper, tests.
- Acceptance: "1,5" parses as 1.5 only when the setting is on; saved files unchanged by the setting.
- Depends on: all other slices (touches every form). Conflict: high with everything, so last or never.

### Recommended order
U1, U8, U3 (parallel safe after G3) -> U7, U6 -> U4 (after G1, G2) -> U5 -> U2 -> U9 -> U10 (optional).
Serial chains: U4 then U5; U8 then U7. Parallel pairs with low conflict: U3 with U8, U9 with U5.

## 4. Out of scope, with reasons

- Permanent master database editing, add and remove chemicals, restore databases (C2, C3, C10, C11): no
  accounts or server; browser storage is not reliable state; project-level overrides (U4, U5) carry the
  need with provenance.
- Step locking (B1 unlock order): stale-feed detection already prevents the stale-input failure it guards
  against, and locking hurts mobile and share-link entry.
- RISC5 project file import (A4): proprietary format, clean-room rule, already M11 Deferred.
- Default project folder and exit dialog (A5, A6): browser download and autosave are the web equivalents.
- Spreadsheet-hosted output, output menu, macros (I6, I7, I15): CSV, `#/report` and print to PDF replace
  them.
- Separate tutorials download (B6): the user guide and built-in validation cases cover it.
- Monte Carlo receptor database (C7): needs an Exposure Factors Handbook distribution library, M10 Deferred
  data work.
- Inhalation basis toggle (G10): the legacy and modern method switch already sets it; a second toggle would
  let a method run outside its sourced definition.
- Ecological Step 2 and 4 screens (E9, G13): RISC5's own guide leaves them pending; `#/plants-eco` covers
  screening.
- 50-chemical limit (D2): a constraint, not a feature.
- Surface water as a cleanup target, international criteria, vapor cleanup levels (H9, I14): engine and
  data deferrals in M5, M6 and M8, not UI.
- Multi-chemical runs through every fate screen from one project chemical list (D1, D4 at full scope): needs
  a design ruling on shared chemical state and multi-chemical workers across six screens; too big for one
  slice, so it is recorded as an H gap for a design session, not sliced.
