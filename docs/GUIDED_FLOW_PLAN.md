# Guided flow: implementation plan (wave AC)

Status (2026-10-26): plan of record for building `docs/GUIDED_FLOW.md`, whose six open calls Bryan settled "all as
recommended". Bryan approved this plan and the questions in section 8, each as recommended, on 2026-10-25
("approved"). Wave AC1 (steps 1 to 3) landed 2026-10-26 on branch `wave-ac1`; AC2 (steps 4 to 6 and the report) is
next, AC3 after it. See "Carried into AC2" below. The engine (`packages/engine`) does not change. Line references are to the tree at
`114d140`.

## 0. The plan in short

- **Three waves.** AC1 builds the project state and steps 1 to 3 (one Run for every chemical) and ships them behind a
  link on the home page while the main navigation stays as it is. AC2 builds steps 4 to 6 and the report, then
  switches the main navigation to the step list and moves the model screens behind "Model workbench". AC3 adds indoor
  air to the modeled cleanup solve (M6), the ecological flow, two sources on one path, and the worked example (m10).
- **One new project key, `guided`, in file format version 3.** It holds every step's answers and the 3d outputs. The
  model screens keep their own forms and sent feeds untouched, so the workbench is today's app and a workbench check
  never changes a guided result.
- **3d outputs use the shapes the screens send today.** The risk, cleanup and report builders already take feed slots
  as arguments, so they read the guided outputs with no change to their logic.
- **Staleness for the guided flow is a hash per chemical and model,** recorded at Run and compared live, which is how
  the step list marks later steps to run again.

## Carried into AC2

Wave AC1 landed 2026-10-26 (decisions in the DECISIONS.md "Wave AC1, the guided steps 1 to 3" block). AC2 slices must
know these AC1 choices:

- `ReceptorScreen` in `overrides/receptors.ts` does not yet include `'guided'`. The v2ToV3 migration copies receptor
  edits and names into `guided.a` and `guided.b` inside overrides, but the type does not name the screen. AC2.1 adds it.
- Run reasons and blocked outputs are saved with the project as `runNotes` and shown on 3d. AC2 reads them; it does
  not rebuild them.
- A model that cannot produce an output for the same inputs is "blocked", not "run again".
- ND in step 3b reads as zero in the Run (`units.sourceNumber`). A pasted "<x" reads as ND. Take any new source value
  through `sourceNumber`.
- The Run lives in a module-level runner and survives leaving 3d. The time step drives only the transport curve,
  capped at 500 points, with a note when coarsened.

Scope rows from the AC1 review (polish, not fixed in AC1; the findings are reviewer 0 numbers 7 to 13 and reviewer 1
numbers 4 to 9):

- Step 1: the two-column CSS rule never matches.
- 3b and 3d ignore the decimal comma setting and `inputMode`.
- The indoor air source wording on step 3b is still the workbench's.
- The 3c problem text is not referenced by `aria-describedby`.
- Step 2 announces its problems twice.
- Saving a user chemical at the 50 cap is dropped silently.
- The TPH box is offered on a measured basis.
- The missing-Koc message for transport needs plain wording.
- Renaming a chemical marks its results to run again.
- Simulation time is not validated in the run plan.
- `readGuidedOutputs` keeps the raw slot instead of the parsed one.
- A pasted "<x" loses its limit. Product call for Bryan: ND as zero, or half the limit.
- Removing a chemical keeps its step 3c fate edits.
- With the well path on and the household shower inputs blank, the Run writes no household output and the status
  reads "out of date: No result yet" with no alert. Step 3a should flag those values as needed, or the Run should say
  why.
- `chain.test.ts` holds a literal long dash in a test (write it as an escape).
- The bundle effect of `status.ts` importing the property catalog eagerly is unmeasured.

## 1. State model

### What the code does today

- A project holds one form per screen (`project/schema.ts:21-32`), and each form names one chemical (for example
  `transport/form.ts:50`). Results reach other screens only as sent feeds, one slot per chemical
  (`project/schema.ts:55-163`), written by send buttons inside the pages (`transport/TransportPage.tsx:786-905`,
  `vadose/VadosePage.tsx:205-225`, `vapor/VaporPage.tsx:366-391`, `surfaceWater/SurfaceWaterScreen.tsx:160-178`).
- The stale marks: a slot records a hash of its sending screen's form when sent (`project/store.ts:903-921`) and is
  stale while the form differs (`project/store.ts:865-880`). It is checked only while that screen is set to the slot's
  chemical (`project/store.ts:872`), because a screen holds one chemical at a time. That mechanism cannot serve a run
  of every chemical at once, so the guided flow reuses its idea (record a hash, compare live) over its own inputs, and
  leaves it in place for the workbench.
- The site model is advisory (`site/model.ts:1-6`) and refuses more than one medium (`site/checklist.ts:64-75`).
- Format version 2, migrations by version (`project/migrate.ts:5`, `:89-96`), autosave under `.v2` with `.v1` read once
  (`project/store.ts:103-108`, `:978-979`). The rule: a change of stored shape bumps the version
  (`project/migrate.ts:89-95`).

### The guided state (new `apps/web/src/guided/state.ts`)

```
GuidedState {
  site: { receptors: 'human' | 'ecological'; basis: 'modeled' | 'measured';
          sources: ('soilAbove' | 'groundwater' | 'soilGas' | 'soilBelow')[];      // modeled
          measured: ('soil' | 'groundwater' | 'surfaceWater' | 'indoorAir' | 'outdoorAir')[];
          location: 'onsite' | 'downgradient';
          paths: { leaching; well; building; stream: boolean };
          indoorModel: 'legacy' | 'modern' | 'oxygenLimited'; produce: 'none' | 'soil' | 'irrigation' }
  forms: { transport?, vadose?, saturated?, vapor?, surfaceWater?, household?, plantsEco? }   // 3a templates
  sources: { [chemicalId]: { values: { [medium]: { value: string; unit: string } }; note: string; tph: string } }
  run: { timeYr: string; stepYr: string; sourceYr: string; basis: 'modern' | 'legacy' }
  outputs: { [feedKey]: { [chemicalId]: { inputsHash: string; value: <feed shape> } } }
  exposure: { pathways: { [pathwayId]: boolean }; a: ReceptorForm; b: ReceptorForm | null; additive: boolean }
  targets: { mode: 'risk' | 'cleanup'; allocation; targetRisk; targetHq;
             standards: { [chemicalId]: { kind: 'risk' | 'mcl' | 'state'; value; unit; source } } }
}
```

- **Templates, not copies.** `forms` holds one partial form per model, like `screens` does (`project/index.ts:67`),
  with the chemical fields and source concentrations left blank. Per chemical, the run derives the model form from
  the template, the chemical's database values with project edits (3c) and its 3b values (section 2). The templates
  start from each screen's default with no validation case in them (the vapor default is the Table R-3 benzene,
  `vapor/form.ts:120-122`), which is M8's blank start; the workbench keeps its validation defaults on purpose.
- **Outputs** use the value shapes of `feedShapes` (`project/schema.ts:55-120`) and are checked one slot at a time, as
  `parseProject` checks feeds, so one bad output never refuses the file. Share links leave them out as they leave out
  feeds (`project/share.ts:88-90`); an opened link reads "run 3d".
- **Chemical values (3c)** are a new `fate` set in the project overrides, the sibling set that `overrides/model.ts:5-9`
  was built for, with a value and a note per edit. `useChemicalRows` (`ui/chemicalFill.ts:42`) applies it, so the
  workbench screens show the same edited values (RISC5 D4).
- **Receptor edits** for steps 4 and 5 are keyed `guided.a` and `guided.b` (`overrides/receptors.ts:9-11` gains
  `guided`). The risk and cleanup forms the steps use are derived from `exposure` and `targets`, never stored.

### Re-run marks

`guided/hash.ts` computes, per chemical and model, `hashInputs` (`project/hash.ts:21`) of the derived form through
`fingerprintForm` (`project/hash.ts:98`), the recorded hashes of the outputs it read, and the run settings. An output is
current while its recorded `inputsHash` equals the live value. `guided/status.ts` turns that into the step list:

| Step | Done when | Marked to run again when |
|---|---|---|
| 1 | at least one chemical | never |
| 2 | the chain has no problem (section 3) | never |
| 3a | no field a chosen model needs is blank | never |
| 3b | every chemical has a value or a "not detected" for every source medium | never |
| 3d | every chemical has a current output from every chosen model | any output stale or missing after an earlier Run |
| 4 | at least one pathway and a valid receptor | never (read live) |
| 5 | forward risk: always live; cleanup: every chemical's kept level matches its fingerprint | a kept level no longer matches |
| 6 | 3d and 5 done | follows 3d and 5 |

A change to step 2 changes the chosen models, so outputs go missing or extra; extra outputs are dropped at the next Run.

### Projects saved by the current app

Format version 3 with `migrations[2] = v2ToV3` in `project/migrate.ts`, pure and written out in full there (it does
not import the guided schema, as `v1ToV2` keeps its own tables, `project/migrate.ts:12-31`). It adds `guided` and
changes nothing else, so an old project's screens, feeds, overrides, `site` and `modeledLevels` stay as they were.

- `site` maps: receptors as is; `direct` to `measured` with the direct media; `modeled` with `soil` to `soilAbove`
  plus the leaching and well paths, `groundwater` plus the well path, `soilToIndoorAir` to `soilAbove` plus the
  building path, `soilGasToIndoorAir` to `soilGas` plus the building path; location as is; `vaporMethod` to
  `indoorModel`; the two produce flags to `produce`.
- `forms.<model>` is the stored screen form without its chemical and source fields; `sources` takes each fate form's
  source value for that form's chemical and the risk rows' concentrations (`risk/form.ts:49-75`) for a measured basis.
- `exposure` takes the risk form's receptors and pathways (`risk/form.ts:79-88`); `targets` takes the cleanup form's
  allocation, targets and well target (`cleanup/form.ts:64-93`); the receptor edits `risk.a` and `risk.b` are copied
  to `guided.a` and `guided.b`.
- No outputs: 3d reads "to run". The sent results stay in the feeds, and the workbench report prints them as today.

The autosave moves to `model_flow.project.autosave.v3`, reading `.v3`, then `.v2`, then `.v1` (`project/store.ts:106-108`,
`:978-979`), so a tab still on a version 2 build never writes over a version 3 save. The mobile check seeds the key the
app reads first (`scripts/mobile-check.mjs:480-482`, the cause of the wave AA isolation fault, `docs/DECISIONS.md`
wave AA ruling 11), so it moves with it and a test guards the pair.

Tests: `project/migrateV3.test.ts` (a full version 2 fixture to its expected version 3 document, and the existing
`project-v1.json` through both steps), `project/autosaveKey.test.tsx` (the three-key chain), `project/share.test.ts`
(`share-v1.txt` still opens), `guided/project.test.ts` (round trip, a malformed output dropped alone).

## 2. Orchestration

- **One Run in 3d** posts every project chemical to a new module worker, `guided/run.worker.ts`, through
  `guided/runner.ts`, which copies the pattern of `cleanup/modeledRunner.ts:27-86`: one chemical after another, progress
  after each, a newer Run supersedes the old one, a timer fallback in tests. Today vapor runs on the main thread
  (`vapor/VaporPage.tsx:242-243`); in the guided run every model runs in the worker.
- **Per chemical**, `guided/run.ts` walks the chain from section 3 and calls the existing pure code only:
  `toScenario`, `toInputs`, `toRequest` (`transport/form.ts:225`, `vadose/form.ts:212`, `saturated/form.ts:139`,
  `vapor/form.ts:250`, `surfaceWater/inputs.ts:167`), the computes (`transport/compute.ts:380`,
  `vadose/compute.ts:248`, `saturated/compute.ts:115`, `vapor/compute.ts:32`, `surfaceWater/compute.ts:137`), the
  vapor sources (`transport/vaporFeed.ts:13`, `vadose/vaporFeed.ts:5`, `saturated/vaporFeed.ts:10`), the feed builders
  that already are pure (`household/feed.ts:37`, `plantsEco/produce.ts:259`) and the recorded inputs
  (`transport/runInputs.ts:14`, `vapor/runInputs.ts:30`, `surfaceWater/runInputs.ts:20`).
- **The send logic moves out of the pages first** (slices AC1.6 and AC1.7): the inline builders at the lines above and
  the transport Kd fill (`transport/TransportPage.tsx:91-95`, `:281-290`) become pure functions the pages and the run
  both call, so a guided output equals what a workbench send of the same inputs gives, and a test says so.
- **Run settings:** simulation time binds each model's run length (`timeYr`, `durationYr`, `horizonYr`); the time step
  sets the transport curve's step count (`transport/compute.ts:48-49`), and 3d says the other models keep their own
  step; source duration binds the transport pulse. Basis: vadose, saturated and the well series take the basis
  method; surface water takes well-mixed for legacy and mass-discharge for modern; indoor air takes the step 2 model,
  with the other Johnson and Ettinger method kept as the check.
- **Steps 4 and 5 read the outputs as slots.** `risk/build.ts:301` takes each feed as slots, and
  `cleanup/modeledBuild.ts:209-220` takes a `feedsOf(chemicalId)`; `guided/slots.ts` builds both from `outputs`.
  Step 5 builds its modeled requests from the derived per-chemical scenarios, so it no longer needs the session-only
  groundwater run (`transport/chainFeed.ts:4-9`) and works after a reload.
- **The report** keeps everything wave AA made it do by running the same code on a different source.
  `computeResults` (`report/results.ts:735-786`) gains a source argument: today's (`screensOf`, `project.feeds`) or the
  guided one (derived screens, `outputs` as `feed.slots`, the sections the chain uses). In a guided report:
  - fate sections print the existing per-chemical blocks (`report/chemicalBlocks.ts:559`) with the inputs each run used,
    each block also carrying its chemical's charts (computed by the section functions on that chemical's derived
    forms, so every chemical gets the plume map and breakthrough curve that today only the screen's chemical gets);
    the "Run on the screen now" line (`report/results.ts:835-872`) is left out, since there is no screen run;
  - risk and cleanup sections run on the derived forms, with kept levels judged against the guided fingerprint;
  - entries without a source come from the guided templates through `siteEntries` (`report/siteValues.ts:560`), not
    the workbench forms; not quantified, the method basis (`report/methodBasis.ts:42`, read off the derived forms,
    which carry the 3d basis), solubility flags and full tables come unchanged.
  - `#/report` prints the guided report when the project holds guided outputs, and otherwise today's report with one
    line saying the steps have not been run; `#/workbench/report` always prints today's report.

## 3. Site model mapping

`guided/chain.ts` (pure) maps step 2 to models per chemical, the path each source takes, problems and notes. One
source per path in AC1 and AC2; a second source on the well path arrives with AC3.2 (question 1, ruled).

| Step 2 answer | Models in 3d | Outputs |
|---|---|---|
| Measured at the receptor | none; 3b values are the exposure concentrations | none (risk rows read 3b) |
| Soil above the water table, leaching path | vadose leaching | `vadose` |
| Leaching and well paths | transport fed from the vadose run (`transport/form.ts:225-232`) | `well` |
| Groundwater, well path | transport from the 3b concentration | `well` |
| Soil below the water table | saturated source, then transport fed from it | `saturated`, `well` |
| Building path | indoor air, source by precedence: soil gas, soil above, soil below, groundwater (soil gas first, as `site/checklist.ts:70-74` advises) | `vaporRisk` |
| Building with groundwater, downgradient | the transport water table under the building | `vaporWaterTable`, `vaporRisk` |
| Building with groundwater, onsite | indoor air from the 3b groundwater value | `vaporRisk` |
| Building with soil below | indoor air from the saturated run | `vaporSaturated`, `vaporRisk` |
| Building with soil above | indoor air from the 3b soil value (steady state, RISC5 F12) | `vaporRisk` |
| Stream path | surface water linked to that chemical's transport run | `bank`, `surfaceWater` |
| Any well output, human | shower and irrigation from the well series | `household` |
| Produce from soil or irrigation | produce factors | `produce` |
| Ecological with soil or stream | the soil ecological screen and the criteria comparison (AC3) | read live |

Several source media at once (open call 1) are allowed whenever each path has one source: groundwater with soil gas,
which `site/checklist.ts:64-75` refuses today (M7), is the first case the tests cover. Problems kept or added, each
explained on step 2: no source, a path with no source that can feed it, leaching without soil above the water table,
produce from irrigation without a well path, ecological receptors with neither soil nor a stream. The downgradient
and onsite notes of `site/checklist.ts:276-297` carry over. The side panel lists, per path, the models and the source
they use.

## 4. Screens and routes

Every step screen is a new component in `apps/web/src/guided/screens/` inside `guided/GuidedShell.tsx`: the step list
on the left (above the content at phone width) with done, current, to do and "run again" marks in text, and Back and
Next. Free navigation (open call 2): every step opens from the list.

| Step | Route | Reuses | New |
|---|---|---|---|
| 1 Chemicals | `#/step/chemicals` | the project list and database browser split out of `chemicals/ChemicalsPage.tsx` (project list around `:130-190`, browser `:210-300`), `chemicals/UserChemicalEditor.tsx`, the summary download (`:213`) | two-list layout, 50-chemical cap, exact name first (m2) |
| 2 Site model | `#/step/site` | | form and chain panel |
| 3a Site properties | `#/step/properties` | labels, units, `when` and texture flags of `SITE_FIELDS` (`report/siteValues.ts:106`), each model's `applyTexture` | `guided/propertyCatalog.ts`: groups (source area, unsaturated zone, aquifer, building, water body, household water use) shown only for chosen models; one field binds every model form key it stands for (source length writes transport and vadose); provenance tags from `siteEntries`; "needed" marks |
| 3b and 3c | `#/step/sources` | `overrides/OverridesPanel.tsx:13` pattern for the edit panel | grid of chemicals by source medium, unit choice (m1), note, paste from a spreadsheet, TPH; 3c summary of the values the chain uses with the edit panel (open call 5) |
| 3d Run and view | `#/step/run` | `transport/BreakthroughChart.tsx`, `ui/ResultStatus.tsx`, `export/DownloadCsv.tsx`, recorded input rows | settings, Run with progress, well series per chemical, indoor air table, input summary, per-chemical detail, one CSV of every chemical and time step |
| 4a Pathways | `#/step/pathways` | | ticked from the chain, ruled-out pathways disabled with the reason |
| 4b Receptors | `#/step/receptors` | `risk/ReceptorPanel.tsx:14`, `risk/ReceptorEditor.tsx` (edited-factor marks) | one or two receptors, child plus adult |
| 4c Toxicity | `#/step/toxicity` | `overrides/OverridesPanel.tsx` filtered to the ticked pathways | the inhalation basis as text (question 2), the missing input named (M3) |
| 5 Risk or cleanup | `#/step/targets` | `risk/compute.ts:27`, `cleanup/modeledRunner.ts`, `cleanup/vaporSolve.ts`, `cleanup/surfaceSolve.ts`, `cleanup/mcl.ts` | per-chemical or all-together targets, a water standard per chemical (MCL, or a state standard with its source) |
| 6 Results | `#/step/results` | `cleanup/Results.tsx:171`, `:207`, `risk/Results.tsx:50`, `:211`, `:252`, `DownloadCsv` | table picker, "Print the report" to `#/report` |

- **Workbench** (open call 4): `#/workbench` lists the model screens, exposure and risk, cleanup levels, the workbench
  report, validation and methods, and says its runs do not feed the steps. Every existing route keeps working. The
  stale-feeds banner (`App.tsx:180-199`) shows on workbench routes only. Share links (`#/p=`, `project/share.ts:3`)
  are untouched.
- **Retired at the AC2 switch:** `site/SitePage.tsx` and `site/checklist.ts`; `#/site` and `#/chemicals` redirect to
  steps 2 and 1. The checklist tests are ported to `guided/chain.test.ts` in AC1, case by case.
- **Plain language (open call 6):** each rebuilt screen takes AB's fixes for what it shows: m1 and m3 (units, Kd text)
  in 3a and 3b, m2 in step 1, M3 in 4c, M2 wherever a step prints a key or code; the rest of AB stays for the workbench.
- **n2** closes through 3d naming the source each chemical's indoor air used; **M10** through the single Run, no sends
  and 4a's automatic ticks; **M8** through the blank templates.

## 5. Tests and checks

- **Stay unchanged:** every model, risk, cleanup and report test, and every project test outside the files below. The
  workbench screens are today's screens, so their tests are the evidence that nothing regressed.
- **Change:** `steps.test.ts` and the navigation cases of `App.test.tsx` (`:8-183`) at the AC2 switch (each old screen
  reachable from the workbench instead of the main navigation); `project/autosaveKey.test.tsx` for `.v3`; the
  keyboard routes list (`a11y/screenKeyboard.testkit.tsx:7-27`) gains the step routes, in a new
  `screenKeyboard.routes-4.test.tsx` so the waits overlap.
- **Move:** `site/checklist.test.ts` cases to `guided/chain.test.ts` (the two-media case becomes allowed); `site/SitePage.test.tsx`
  is replaced by the step 2 screen test at the switch.
- **TDD order in every slice:** pure functions first (failing unit test, then code), then the screen test with
  Testing Library, then wiring. Extraction slices first pin today's behaviour (the builder's output for the page's
  default form equals what the page sent) and only then move code.
- **Mobile check** (`scripts/mobile-check.mjs`): add the ten step routes and `#/workbench` to `ROUTES` (`:99-119`);
  keep the version 1 seed (it now runs both migrations in the browser) under the new key; add a "guided" visit in the
  pattern of the fed routes (`:120-136`): seed two chemicals (benzene 71-43-2, MTBE 1634-04-4) with groundwater and
  soil gas sources, the well and building paths, downgradient; press Run on 3d, wait for "Up to date", then visit 3d,
  4a to 4c, 5, 6 and `#/report`, each at 390 light, 390 dark and 1280, failing on overflow, an axe violation, or a 3d
  page without a well table for both chemicals. Plain `mobile:check` includes it unless its run time exceeds the
  modeled visit's, in which case it joins `--modeled`. `bundleSize.test.ts` gets a line for the new worker chunk.

## 6. Slices and waves

Effort: **light** (mechanical, checked by the compiler and tests), **standard** (ordinary implementation to a settled
spec), **deep** (needs design judgment). Each slice lists the files it touches; none starts with open discovery.

### Wave AC1: the project state and steps 1 to 3

Ships: format version 3; the guided steps 1 to 3 at `#/step/...`, reached from a "Start the guided flow" link on the
home page, giving every chemical's well and indoor air results from one Run; the main navigation and every screen
unchanged.

| Slice | Goal and files | Tests first | Depends on | Effort |
|---|---|---|---|---|
| AC1.1 Format v3 | `guided/state.ts`, `guided/project.ts`, `project/schema.ts`, `project/migrate.ts`, `project/index.ts`, `project/store.ts` (guided getter, setter, subscribe; snapshot, new project and `forgetMemory` at `:432-469`, `:952-973`, `:1067`; the key chain), `project/share.ts`, fixtures, `scripts/mobile-check.mjs:480-482`, new `mobileCheckKey.test.ts` | migrateV3, key chain, share v1, guided round trip, script writes the app's key | none | standard: the mapping is written out above |
| AC1.2 Chain | `guided/chain.ts`, `guided/chain.test.ts` | each row of section 3; ported checklist cases | AC1.1 | standard: a settled table |
| AC1.3 Shell and status | `guided/GuidedShell.tsx`, `guided/status.ts`, `guided/guided.css`, `steps.ts` (a `GUIDED_STEPS` list beside `STEPS`), `App.tsx` (routes, home link) | status per step (3d status reads an injected output check), shell marks and Back/Next, routes render | AC1.1, AC1.2 | standard |
| AC1.4 Step 1 | `chemicals/ProjectList.tsx`, `chemicals/DatabaseBrowser.tsx`, `chemicals/ChemicalsPage.tsx`, `chemicals/browse.ts`, `guided/screens/ChemicalsStep.tsx` | add, remove, cap at 50, exact name first, summary download; `ChemicalsPage` tests unchanged | AC1.1 | standard |
| AC1.5 Step 2 | `guided/screens/SiteStep.tsx` | answers save, problems and panel follow the chain | AC1.2, AC1.3 | standard |
| AC1.6 Send builders, part 1 | `transport/sendBuild.ts`, `transport/chemicalFill.ts`, `vadose/sendBuild.ts`, `saturated/sendBuild.ts`, the three pages | builders equal today's sends; Kd text formatted (m3) | none | standard: behaviour-preserving moves in long pages |
| AC1.7 Send builders, part 2 | `vapor/sendBuild.ts`, `surfaceWater/sendBuild.ts`, `vapor/VaporPage.tsx`, `surfaceWater/SurfaceWaterScreen.tsx` | as AC1.6 | none | standard |
| AC1.8 Step 3a | `guided/propertyCatalog.ts`, `guided/provenance.ts`, `guided/screens/PropertiesStep.tsx` | every site field of each chosen model is in the catalog or a named non-value; a shared field writes every bound form; texture fills and tags; needed marks; groups follow the chain | AC1.2, AC1.3 | deep: one field over five form shapes and their layer lists |
| AC1.9 Steps 3b and 3c | `guided/screens/SourcesStep.tsx`, `guided/ChemicalValuesPanel.tsx`, `guided/paste.ts`, `guided/units.ts`, `overrides/model.ts`, `overrides/project.ts`, `overrides/fate.ts`, `ui/chemicalFill.ts` | paste (tabs, commas, "ND", a units row), unit conversion, fate edits saved and applied, 3c lists only the values the chain uses | AC1.2, AC1.3 | standard |
| AC1.10 Orchestration | `guided/derive.ts`, `guided/hash.ts`, `guided/run.ts`, `guided/runner.ts`, `guided/run.worker.ts` | derived forms per chemical; outputs per chain row; an output equals the workbench builder's for the same inputs; which edits mark which outputs; supersede and progress | AC1.6, AC1.7, AC1.9 | deep: the chain and hash design |
| AC1.11 Step 3d | `guided/screens/RunStep.tsx`, `guided/RunResults.tsx`, `guided/runCsv.ts` | Run covers all chemicals; stale after an edit names what changed; the CSV holds every chemical and time step | AC1.10 | standard |
| AC1.12 Checks | `scripts/mobile-check.mjs` (routes, guided visit), `a11y/screenKeyboard.testkit.tsx`, `a11y/screenKeyboard.routes-4.test.tsx`, `bundleSize.test.ts` | keyboard order on each step | all of AC1 | standard |

Parallel lanes on separate branches: after AC1.1, run AC1.2, AC1.4, AC1.6 and AC1.7 together; then AC1.3; then AC1.5,
AC1.8 and AC1.9 together; then AC1.10, AC1.11, AC1.12 in order. AC1.6 and AC1.7 do not need AC1.1 and may start first.

### Wave AC2: steps 4 to 6, the report and the switch

Ships: the full six-step flow as the main navigation, the guided report at `#/report`, and every model screen,
exposure and risk, cleanup, validation and methods behind "Model workbench".

| Slice | Goal and files | Tests first | Depends on | Effort |
|---|---|---|---|---|
| AC2.1 Derived forms | `guided/riskForm.ts`, `guided/cleanupForm.ts`, `guided/slots.ts`, `guided/pathways.ts`, `overrides/receptors.ts` | derived forms for measured and modeled projects; a ruled-out pathway is off with its reason; `buildInputs` on the derived form gives the workbench's EPCs for the same series | AC1 | standard |
| AC2.2 Step 4 | `guided/screens/PathwaysStep.tsx`, `ReceptorsStep.tsx`, `ToxicityStep.tsx` | ticks from the chain; edits marked; only needed toxicity values; the missing input named (M3) | AC2.1 | standard |
| AC2.3 Step 5 | `guided/screens/TargetsStep.tsx`, `guided/solve.ts`, `guided/useGuidedSolve.ts` | forward risk live; modeled, vapor and surface water levels per chemical; kept levels with the guided fingerprint; MCL or a state standard with its source; all-together keeps the measured ratios | AC2.1 | deep: three solve paths and their fingerprints |
| AC2.4 Step 6 | `guided/screens/ResultsStep.tsx` | each table type; not quantified with its reason; the solubility flag; CSV | AC2.3 | standard |
| AC2.5 Guided report | `report/results.ts`, `report/chemicalBlocks.ts` (optional charts on a block), `report/siteValues.ts` callers, `report/ReportPage.tsx`, `report/guidedSource.ts` | per wave AA ruling (one block per chemical with its inputs, full tables, entries without a source, not quantified, method basis, solubility, kept levels) on a two-chemical guided project; existing report tests unchanged; `#/workbench/report` prints today's | AC2.1, AC2.3 | deep: every wave AA guarantee on a new source |
| AC2.6 Switch | `App.tsx`, `steps.ts`, `guided/WorkbenchPage.tsx`, home page, redirects, removal of `site/SitePage.tsx` and `site/checklist.ts` with their tests replaced as section 5 says | navigation lists the six steps; every old route opens and is listed on the workbench; banner only on workbench routes; home passes the shell rule (`scripts/shell-verdict.mjs:9`) | AC2.2 to AC2.5 | standard |
| AC2.7 Checks | `scripts/mobile-check.mjs`, keyboard routes | the guided visit through 4a to 6 and the report | AC2.6 | light |

Lanes: AC2.1 first; then AC2.2, AC2.3 and AC2.5 (once AC2.3's fingerprint function lands) in parallel; AC2.4 after
AC2.3; AC2.6 and AC2.7 last.

### Wave AC3: what the first two leave open

Ships: indoor air inside the modeled cleanup solve, the ecological flow, two sources on one path, the worked example.

| Slice | Goal and files | Tests first | Depends on | Effort |
|---|---|---|---|---|
| AC3.1 Indoor air in the modeled solve (M6) | `guided/solveCombined.ts`, `guided/solve.ts` | a groundwater or soil source with a building path: the level meets the receptor's combined risk over the well and indoor air pathways (the engine's `solveSourceLevel` on a combined forward, as `cleanup/vaporSolve.ts` does for one path); with one path off it equals today's level | AC2 | deep: a combined forward over two chains |
| AC3.2 Two sources on one path | `guided/chain.ts`, `guided/run.ts` | the two well series add and each source's share is listed (question 1) | AC2 | standard |
| AC3.3 Ecological flow | `guided/screens/*` for 4 to 6, reusing `plantsEco/eco.ts` and `surfaceWater/CriteriaPanel.tsx`; a state standard with its source in the criteria comparison (m9) | ecological receptors reach benchmarks and a verdict; the M7 statement is gone with the retired page | AC2 | standard |
| AC3.4 Worked example (m10) | `guided/example.json`, "Open the worked example" on step 1, `docs/USER_GUIDE.md` quick start and the six steps | the example opens and runs to step 6 with no input | AC2 | standard |
| AC3.5 Checks | `scripts/mobile-check.mjs` | an ecological visit and the example | AC3.1 to AC3.4 | light |

Each wave closes as the cadence in `CLAUDE.md` says: one gate and one `mobile:check:full` on the integrated tree, one
review, a corrective pass for correctness findings only, one docs commit (roadmap, handoff, decisions, usability rows
M6, M7, M8, M10, m9, m10, n2 updated in place, user guide).

## 7. Risks

- **Run time.** Fifty chemicals through the layered vadose model may take minutes. AC1.10 measures five chemicals; past
  a minute, the run uses the existing worker pool (`uncertainty/pool.ts`) instead of one worker.
- **Two worlds in one file.** The workbench and the steps hold separate forms, so a value typed on a workbench screen
  does not reach the steps. The workbench page says so; the alternative (shared forms) would let a validation case
  overwrite a site's properties.
- **Store complexity.** `project/store.ts` is 1115 lines with subtle save and restore rules; AC1.1 keeps the guided state
  out of the feed and stale machinery entirely and adds it only to the snapshot, the build and the reset paths.
- **Report cost.** Charts per chemical make the guided report heavier; the report already computes off the first render
  (`report/ReportPage.tsx:703`), and the guided visit in the mobile check times it.
- **Interim state after AC1.** Steps 1 to 3 are live while 4 to 6 are not; the step list shows steps 4 to 6 as
  "arrives with the next update" and the home page keeps today's route to risk and cleanup.

## 8. Questions for Bryan (ruled 2026-10-25, each as recommended)

Bryan, 2026-10-25: "approved". A fourth call went with these: AC1 ships to main with steps 1 to 3 behind the home page
link and steps 4 to 6 marked as arriving with the next update.

1. **Two sources on one path.** With groundwater and soil (leaching or below the water table) both feeding the well:
   recommended, add the two well series (the transport solutions are linear in the source, so this is superposition,
   and it is the conservative reading), listing each source's share per chemical. Indoor air keeps one source by
   precedence (soil gas first), because a measured soil gas already carries what lies beneath it. Until AC3.2 lands,
   step 2 refuses a second source on the well path with the reason.
2. **The inhalation basis in 4c.** The engine ties it to the method: legacy uses the slope factor and reference dose,
   modern the unit risk and reference concentration (`packages/engine/src/processes/exposure/legacy.ts:110-131`).
   Recommended: 4c shows the basis that follows the one method choice in 3d (open call 3), with the other as the
   check, instead of a control of its own.
3. **Projects made on the current screens.** They open with every input kept, but their sent results do not become
   step 3d results: 3d reads "to run", and the old results print in the workbench report. Recommended: yes, since a
   sent result does not record which site model it belongs to.
