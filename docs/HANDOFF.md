# HANDOFF (written from the tree, 2026-10-23, after the wave X push)

Resume: start a fresh session in `~/repos/model_flow`, read this file, then `docs/ROADMAP.md` (line 1 and
sections 7 and 8) and `docs/DECISIONS.md`. Statuses are claims: grep the tree before acting on an open row or
skipping a done one.

## State of the tree
- Main holds M0 to M11, wave G (parity gaps, built on branch `wave-gaps`), wave H (UI near-parity, built on
  branch `wave-ui`), wave I (built on branch `wave-i`), all pushed 2026-10-19, and wave J (five slices, built on
  branch `wave-j`), fast-forwarded to main and pushed 2026-10-21 (head `ad593e6`), and wave K (four slices and a corrective pass,
  built on branch `wave-k`) and waves L and M (built together on branch `wave-lm` with a corrective pass) and wave N (three slices and a
  corrective pass, built on branch `wave-n`; head `6c186e7`), each fast-forwarded to main and pushed 2026-10-21, and waves O
  and P (eight slices and a corrective pass, built together on branch `wave-op`; code head `d80adf6`, then the
  wave close docs commit), fast-forwarded to main and pushed 2026-10-22, and wave Q (one slice on branch
  `wave-q`), pushed 2026-10-22, and wave R (seven slices and a corrective pass on branch `wave-r`; code head
  `dedaca7`, then the wave close docs commit), fast-forwarded to main and pushed 2026-10-22, and wave S (one slice on
  branch `wave-s`), pushed 2026-10-22, and wave T (one slice and a corrective pass on branch `wave-t`; code head
  `ecad1cd`, then the wave close docs commit), fast-forwarded to main and pushed 2026-10-23, and wave U (one slice on
  branch `wave-u`; code head `901ca8e`), pushed 2026-10-23, and wave V (seven slices on branch `wave-v`; code head
  `ad95271`, then the wave close docs commit), fast-forwarded to main and pushed 2026-10-23, and wave W (two slices
  and a corrective pass on branch `wave-w`; code head `e990fe8`, then the wave close docs commit), fast-forwarded
  to main and pushed 2026-10-23, and wave X (two slices and a corrective pass on branch `wave-x`; code head
  `968cd98`, then the wave close docs commit), fast-forwarded to main and pushed 2026-10-23. Pages deploys from main:
  https://bmills23.github.io/model_flow/
- Last full `corepack pnpm gate` on `wave-x` (2026-10-23, `968cd98`): exit 0, build included. Test counts: engine
  1477, web 2145, data 303 passed and 3 skipped. `mobile:check:full` on that tree: exit 0 in 593 s, 75 views, 0
  overflow and 0 axe violations, under the wave X shell rule (every view printed nav=1 main=1 h1=1).
- Before that, on `wave-w` (2026-10-23, `e990fe8`): exit 0, build included. Test counts: engine
  1477, web 2134, data 289 passed and 3 skipped. `mobile:check:full` on that tree: exit 0 in 552 s, 75 views, 0
  overflow and 0 axe violations on every route at 390 light, 390 dark and 1280, including the `#/surface-water`
  criteria visit (all sets, now with `eu2026`, 4 criteria tables) and `#/vapor`. The first gate run of the wave
  timed out one wave V test (`surfaceSolve.test.ts`, fed saturated route, 240 s) while a review ran tests beside it;
  alone it passed (9 of 9), and the final gate passed it. Neither the check nor its seeded state opens the DeVaull
  method or the solved cleanup panels; in wave V slices V1 and V2a checked those with temporary scripts (0 overflow,
  axe 0+0), and the solved surface water panel on `#/cleanup` was checked the same way at 390 light, 390 dark and
  1280 (0 overflow, axe 0+0, a solved row present in its scroll region; no not-reached row could be produced from
  the form, so that row's layout is unchecked).
- Before that, on `wave-u` (2026-10-23, `901ca8e`): exit 0, build included. Test counts: engine
  1477, web 1998, data 197 passed and 3 skipped. Nothing under `apps/web` changed, so `mobile:check:full` was not
  re-run; the `#/validation` route (whose generated data changed) passed at m390-light and m390-dark with 0
  overflow and 0 axe violations.
- Before that, on `wave-t` after its corrective pass (2026-10-23, `ecad1cd`): exit 0, build
  included. Test counts: engine 1468, web 1998, data 197 passed and 3 skipped. `mobile:check:full` ran on the
  slice commit `c19db2a`: exit 0 in 575 s, 0 overflow and 0 axe violations on every route. After the corrective
  pass a narrowed check (`--modeled --routes '#/cleanup,#/risk' --views m390-light,m390-dark`) exited 0 in 78 s;
  its first run failed once at m390-dark `#/risk` (seeded) with `openPanels=0` and `charts=0`, then passed on a
  re-run (not diagnosed; see the open items).
- Before that, on `wave-s` (2026-10-22, `6f5b7c1`): exit 0, build included. Test counts: engine
  1430, web 1996, data 197 passed and 3 skipped. `mobile:check:full` on that tree: exit 0 in 566 s, 0 overflow and
  0 axe violations on every route. The wave close then dropped `shower.rsl-household` from the VISL entries'
  method ids (they exercise only its volatility criterion, not K) and regenerated the validation outputs (data
  tests, the web report and validation tests and `docs:check` re-run).
- Before that, on `wave-r` after its corrective pass (2026-10-22, `dedaca7`): exit 0, build
  included. Test counts: engine 1408 (87 files), web 1996 (206 files), data 197 passed and 3 skipped (9 files).
  `mobile:check:full` on that tree: exit 0 in 552 s, 0 overflow and 0 axe violations on every route at 390 light,
  390 dark and 1280. The wave close then changed two strings of the VISL entry in
  `packages/data/src/validationCatalog.ts` and regenerated the validation outputs (data tests and `docs:check`
  re-run).
- Before that, on `wave-q` (2026-10-22): gate exit 0 (engine 1388, web 1912, data 180 passed and 3 skipped),
  `mobile:check:full` exit 0 in 632 s.
- Previous full `corepack pnpm gate` on `wave-op` after its corrective pass (2026-10-22): exit 0, build included. Test
  counts: engine 1388 (86 files), web 1899 (197 files), data 180 passed and 3 skipped. `mobile:check:full` on that
  tree: exit 0 in 578 s, 0 overflow and 0 axe violations on every route at 390 light, 390 dark and 1280, including
  a `#/chemicals` visit with a filled project list (editor and remove panel open) and a modeled cleanup and
  report run with two chemicals.

- Earlier full gate, on `wave-speed` rebased onto main (2026-10-21, the check cadence change): exit 0,
  build included, run backgrounded with no stdin redirect. Test counts: engine 1387 (86 files), web 1697 (166
  files), data 179 passed and 3 skipped (the skipped three are the Eco-SSL `pdftotext` cross-checks, which need
  the fetched PDFs); the same counts as `wave-lm` after its corrective pass. The gate starts with `check:markers`
  (fails on merge conflict markers in tracked files) and `docs:check` also covers `docs/VALIDATION.md` and
  `packages/data/generated/validation/validation.json`.
  `corepack pnpm mobile:check:full` on that tree, 2026-10-21: 23 visits in 3 views, 69 ok, 0 failing, exit 0 in
  375 s on an idle host; 0 overflowing elements and 0 axe violations at 390 light, 390 dark and 1280 on every
  route, including `#/validation`, the seeded `#/risk`, fed `#/cleanup` and the modeled `#/report` state. Plain
  `mobile:check` skips the modeled visit, and each run takes its own free ports, so a busy port 5178 no longer
  matters.
- At 390 px: `#/transport` computes by default, so the plume CSV button is on screen in that check and inside its
  overflow and axe counts (the script neither looks for it by name nor clicks it). Since wave K (K4) the check
  also performs an in-browser modeled cleanup run and renders the report's modeled-source block, and fails unless
  it shows the current result.
- Local branches: `main` only. `wave-s` (the pushed head) was deleted after its push. Deleted on 2026-10-22 after
  the wave R push, all merged into main (tip shas):
  `wave-r` (the pushed head), `wave-r-r1a` `f0c0449`, `wave-r-r1b` `8074aa1`, `wave-r-r1c` `2236699`, `wave-r-r2`
  `64a0f27`, `wave-r-r3a` `1bb132e`, `wave-r-r3b` `3b4a430`, `wave-r-r4` `1555759`, `wave-r-fix-a` `9c00281`,
  `wave-r-fix-b` `9572081`, `wave-r-fix-c` `7bc76ed`, and ten `worktree-wf_*` branches at `5496ec3`; their
  worktrees were removed. `wave-q` was deleted after its push. Deleted on 2026-10-22 after the waves O and P push,
  all merged into main (tip shas): `wave-op` (the pushed head), `wave-op-o4` `293c5f5`, `wave-op-o1` `da69d71`, `wave-op-o2a` `dc84691`,
  `wave-op-o2b` `82fb010`, `wave-op-p1` `011d559`, `wave-op-p2` `379b359`, `wave-op-p3` `a9cd87f`,
  `wave-op-p3-merge` `5f90574`, `wave-op-p3f` `8a552a2`, `wave-op-fix-a` `d65c797`, `wave-op-fix-b` `3c379ae`; wave
  N's `wave-n` `6c186e7`, `wave-n-n1` `7051934`, `wave-n-n2` `64e1334`, `wave-n-s` `0cf7862`, `wave-n-fix-a`
  `188c201`, `wave-n-fix-b` `9722cff`; and sixteen `worktree-*` branches at `bd8f4af` or `e18c0e2`. Their worktrees
  were removed. `wave-speed` (the check cadence change, started outside the waves) was rebased onto
  main, fast-forwarded and pushed 2026-10-21, and its worktree removed. Deleted on 2026-10-21 after the waves
  L and M push, all merged into main: `wave-lm` (the pushed head), `wave-l-l1` `9bcff74`, `wave-l-l2` `cb73519`,
  `wave-m-m1` `132ff58`, `wave-m-m2` `869502d`, `wave-d-parity` `659bcfb`, `wave-lm-fix-a` `e478373`,
  `wave-lm-fix-b` `1983521`, and seven `worktree-wf_*` branches at `8b579ec`; their worktrees were removed.
  Deleted on 2026-10-21 after the wave K push, all merged into main (tip
  shas): `wave-k` (the pushed head), `wave-k-k1` `6916905`, `wave-k-k2` `a96228d`, `wave-k-k4` `8fa6301`,
  `wave-k-fix-a` `8afe2ed`, `wave-k-fix-b` `a2f5a39`, `wave-k-fix-c` `e2ee518`, and `worktree-wf_c6eba2bb-249-1` `500eda0`, `worktree-wf_c6eba2bb-249-2` `500eda0`, `worktree-wf_c6eba2bb-249-3` `500eda0`, `worktree-wf_7be583f0-419-1` `500eda0`, `worktree-wf_7be583f0-419-2` `500eda0`, `worktree-wf_7be583f0-419-3` `500eda0`; their
  worktrees were removed. Deleted on 2026-10-21 after the wave J push, all merged into main (tip
  shas): `wave-j` `ad593e6`, `wave-j-j1` `4c6215d`, `wave-j-j2` `e6afaa4`, `wave-j-j3` `e8ed61c`, `wave-j-fix-a`
  `98fa442`, `wave-j-fix-b` `a952e51`, `wave-j-fix-c` `58a583b`, `wave-j-fix-d` `d5eae5e`, and seven
  `worktree-wf_*` branches at `b493c67` (`worktree-wf_69e4b9b1-fa7-1` to `-3`, `worktree-wf_cb31987a-5c6-1` to
  `-4`). Their worktrees were removed. Restore a local branch with
  `git branch <name> <sha>`. `m1-groundwater-ui` and `ui-u9-wildlife` were deleted in J5 (tips `5d6c6c7` and
  `34b1229`; restore with `git branch <name> <tip>`).
- Remote branches: the 15 stale `origin/` milestone branches that were fully merged into main were deleted on
  2026-10-21 (tip shas): `m10-e1` `f3abc74`, `m10-e2` `3204f04`, `m10-uncertainty` `370dcd3`, `m11-projects-reports`
  `4c2a7f0`, `m11-s5-csv` `464e9f1`, `m11-s7-bundle` `cae8847`, `m5-cleanup-levels` `dcdf060`, `m6-vapor-models`
  `04b8446`, `m7-e3` `6b408d3`, `m7-s0-sources` `c3d694a`, `m7-shower-irrigation-particulates` `ddfe459`,
  `m8-surface-water` `d71a876`, `m9-plants-eco` `c9656d7`, `m9-r1-refs` `644e090`, `wave-m5-m6-m8` `5e4c855`.
  Restore one with `git push origin <sha>:refs/heads/<name>`. No remote milestone branch remains.
- Test time on wave J (local, load average about 4): engine suite 21 s, web suite 40 s (before wave J: engine
  41 s and web 128 s on a loaded machine, 34 s and 53 s on the wave I run). Remaining floors: single 15 to 18
  s engine tests and jsdom creation in the web suite.
- CI cost: about 6 billed minutes per push to main, re-measured 2026-10-21 after the waves L and M push (runs
  39680530613 and 39680530951: gate 3 min 2 s, Pages build 17 s plus deploy 9 s; recorded in CLAUDE.md). Docs-only
  pushes trigger nothing.
- Reference counts (`packages/engine/src/references/references.json`, 120 entries): 74 `used`, 24
  `planned`, 18 `data`, 4 `fixture`. Six entries still carry square-bracketed descriptor titles, all
  `planned`: `srinivasan2008a`, `srinivasan2008b`, `gelhar1992`, `foster1986`, `trapp2015`, `sobol1993`.

## Wave X landed (2026-10-23)
Bryan: "let's continue". Rulings in the DECISIONS.md "Wave X scope" block and its "Wave X slices" block, all
DEFAULT.
- X1 (`17345cf`): `scripts/shell-verdict.mjs` and its test; `scripts/mobile-check.mjs` fails a view whose shell never
  mounted or whose route rendered no content, and prints `nav= main= h1= controls= links= text=` on every line.
- X2 (`30f118b`): `eu2026` fluoranthene twin rows merged (270 rows built), the PFOS pointer to the PFAS sum
  (`coveredBy`) shown in the comparison, report and CSV, and the surface water solve memo pruned.
- Review: one pass, 0 high, 2 medium, 4 low. Corrective pass (`968cd98`): the check waits up to 10 s for the route
  before measuring; the build throws on twin rows that differ in any field but the note.

## Wave W landed (2026-10-23)
Bryan: "okay let's do that next" (the 2026 EU revision wave V left open). Rulings in the DECISIONS.md "Wave W
scope" block and its "Wave W slices" block, all DEFAULT.
- W1 (`27a0235`): Directive (EU) 2026/805 (CELEX 32026L0805) found and read; the consolidated text
  02008L0105-20260510 is committed in `packages/data/raw/eu-eqs-2026/` with `eqs.csv` (272 rows) and its manifest;
  `scripts/extract-eu-eqs-2026.ts`, and `extract-eu-eqs.ts` now takes paths (the 2013 CSV regenerates byte for byte).
- W2 (`579fe2d`): set `eu2026` through the data build (`generated/criteria-2026-10-23/eu2026.json`, 198 kB),
  the set choice, its own lazy chunk, the report and CSV, `eudir2026805` (status `data`) and the methods note;
  `eu.json` is unchanged and a saved `eu` keeps the 2013 set.
- Review: one pass, 0 high, 3 medium, 7 low. Corrective pass (`e990fe8`): imidacloprid, acetamiprid and diclofenac
  take their printed CAS; entries 16 and 44 checked against the act (same cells, no date clause); footnote 6 and
  Part C notes. The low findings left open are in the DECISIONS.md block, item 7.

## Wave V landed (2026-10-23)
Bryan: "okay let's just get it to 100% parity NOW". Rulings in the DECISIONS.md "Wave V scope, the last three parity
gaps" block and its slice subsections (V1, V2a, V2b, c-ccme, C-euuk, anzg, macdonald2000, V3), all DEFAULT. All 102
audit items are now present or different by design (`docs/UI_PARITY.md` status line).
- V1: `vapor.devaull-2007` on `#/vapor` as "Oxygen-limited (DeVaull)" (apps/web/src/vapor/), with the three oxygen
  options, profile curve, CSV table, report entry and risk feed (indoor only). RISC5 Appendix K inputs with no
  DeVaull counterpart: minimum oxygen concentration, oxygen transfer coefficient, outdoor air prediction.
- V2a: `apps/web/src/vapor/forward.ts` (the forward input on the feed) and `apps/web/src/cleanup/vaporSolve.ts`
  (calls the engine's `solveSourceLevel`); rows and CSV say "Level from" linear coefficient or solve.
- V2b: `apps/web/src/cleanup/surfaceSolve.ts` and `useSurfaceSolves.ts`, run in the cleanup worker: background,
  fed plume and soil source routes; the soil route is offered by the surface water target only.
- V3: `packages/data/src/criteria/`, `scripts/build-criteria.ts`, `raw/criteria-sets.manifest.json`, generated
  `generated/criteria-2026-10-23/` (ccme 286, eu 180, uk 263, anzg 841 in fresh and salt files, macdonald2000 57);
  extract scripts `extract-ccme.ts`, `extract-eu-eqs.ts`, `extract-uk-eqs.ts`, `extract-anzg.ts`,
  `extract-macdonald2000.ts`; the set choice is the optional `criteriaSet` key; `scripts/mobile-check.mjs` gained
  a criteria visit.
- Review: one pass, 0 high, 0 medium, 2 low (a sediment read that predates the wave and degrades to "not compared",
  which wave W found not as described, and a session-only memo map that was never pruned, pruned since wave X); no
  corrective pass.

## Wave U landed (2026-10-23)
Bryan: "ok do it" (the RSL soil inhalation comparison). Rulings in the DECISIONS.md "Wave U scope, RSL soil
inhalation comparison" block and the "Wave U, RSL soil inhalation comparison" block, all DEFAULT.
- `packages/engine/test/rslSweepHelpers.ts`: `RSL_SOIL` (inputs from SEMS 404323), `rslPef`, `rslVfStatus`,
  `soilToAirFactor`; soil inhalation is the receptor's air coefficient times 1/VF + 1/PEF and a total adds it.
  Counts per soil table in `test/fixtures/rsl-sweep/exceptions.json` (`soilInhalation`). No engine change: the
  test passes the RSL inputs as options the engine methods already take and scales the infinite-source factor
  by sqrt(3.14 / pi).

## Wave T landed (2026-10-23)
Bryan: "do the TCE equations wave". Rulings in the DECISIONS.md "Wave T scope, RSL special-case cancer equations"
block and the "Wave T, special-case cancer equations" block, all DEFAULT except scope ruling 1 and the shower and
produce fallback (ruling 4), which Bryan accepted on 2026-10-23; vinyl chloride was included by scope ruling 1
because it shares the flag, the warning and the sweep class with trichloroethylene.
- `packages/engine/src/processes/exposure/modern.ts`: `TCE_ADJUSTMENT` (the guide's three-figure fractions),
  `specialStatus` and `cancerPlan` (the cancer terms with their place on the life-time axis; the vinyl chloride
  early-life term only when the receptor's first stage is a child stage); `scenario.ts` averages a series
  concentration over each term's own window. `receptorsModern.ts` `specialCaseWarnings` is shared by the risk
  path and `backCalculateModern`; `cancerOverridden` is `{ sfo, iur }`, set by `apps/web/src/risk/build.ts` from
  the `user` source, and the override warning quotes the proportions of the entered value only.
- Tests: `packages/engine/test/exposure-special-cases.test.ts` (hand cases from the guide's equations); the RSL
  sweep and VISL comparison compare the formerly excepted cells; counts in their `exceptions.json` files.

## Wave S landed (2026-10-22)
Bryan: "do it." (compare the engine with the VISL calculator). Rulings in the DECISIONS.md "Wave S scope, VISL
comparison" block and the "Wave S, VISL comparison" block, all DEFAULT.
- `packages/data/scripts/fetch-visl.ts` takes the scenario, groundwater temperature, hazard quotient and target risk;
  three dated fixtures under `packages/data/raw/visl/` (no checksum manifest covers that directory).
- `packages/engine/test/visl-sweep.test.ts` and `vislSweepHelpers.ts` compose existing engine functions; every
  excepted cell's class evidence is re-checked and the counts in `test/fixtures/visl-sweep/exceptions.json` are
  recomputed. Catalog entries in `packages/data/src/validationCatalogSweep.ts` pin the counts.

## Wave R landed (2026-10-22)
Bryan chose the evidence wave and ruled that dispersivity is a required entry and receptor edit notes are
required. Rulings in the DECISIONS.md "Wave R scope, evidence for regulatory use" block (rulings 1 and 2 BRYAN),
the R1a, R1b, R1c, R2, R3a, R3b and R4 blocks, and the corrective CA, CB and CC blocks.
- R1a: each warned default in `packages/data/src/validationCatalog.ts` has an `id` and a `scope` (`warning`: listed
  when its code is in the section's warnings; `method`: listed when its method ran); sweep examples live in
  `validationCatalogSweep.ts`. R1b and R1c: `report/basis.ts` `runBasis` (each screen compared with the source it
  fills from), `report/basisView.ts`, the "What this run rests on" tables, summary and run-basis CSV; version and
  commit from `buildInfo.ts` and `buildCommit.ts` (`-dirty` for changed tracked files).
- R2: `dispLaw` `entered` and `ssg` on the transport form, `dispersivityBasis` on the vadose form; old forms read
  as the law they used and, untouched, as unused (`report/methodsRun.ts`).
- R3a and R3b: RSL sheets 405274, 405278 and 405282 in the raw manifest, `generated/rsl-2024-11/screening-levels.json`,
  the VISL output under `raw/visl/`; `packages/engine/test/rsl-tables-sweep.test.ts` with
  `test/fixtures/rsl-sweep/exceptions.json` (counts in `docs/VALIDATION.md`).
- R4: `risk/ReceptorEditor.tsx` holds a value without a note in the editor only; a saved notes-less edit applies
  and shows "No note".

## Waves O and P landed (2026-10-22)
Bryan: "after that, go ahead with waves O and P", then mid-wave "include the multi-chemical modeled cleanup too".
Rulings in the DECISIONS.md "Waves O and P scope" block, the O4, O1, O2a, O2b, P1, P2 and P3 blocks, and the
corrective CM, P3F, CA and CB blocks.
- O4: one feed slot per chemical (`FeedSlots`, `project/feedSlots.ts` `pickSlot` and `ownSlot`; report readers
  `feedOf` and `feedSlotsOf`), per-slot staleness named in every mark, and project file version 2 (`v1ToV2` in
  `project/migrate.ts`, fixtures in `project/fixtures/`). The autosave key is `model_flow.project.autosave.v2`;
  the `.v1` key is only read to migrate, and a tab that finds a newer autosave does not save over it (CB).
- O1, O2a, O2b: risk and cleanup rows follow the project list; `#/chemicals` shows and edits it; every fate
  screen picks its chemical from it (`ui/ProjectChemicalSelect.tsx`, `FateChemicalSelect`).
- P1 and CA: user chemicals (`user-<n>`, optional CAS, a note per value; `overrides/userChemicals.ts`); ids are
  never reused in a project (`nextProjectUserId`), removal clears every state keyed to the id, renames reach the
  rows. P2: per-chemical surface water cleanup target over the chemical's own coefficient. P3, CM and P3F:
  the modeled cleanup solves each chemical as its own run (`cleanup/modeledSolve.ts`, `ModeledCleanup.tsx`).
- Next-wave rows from the reviews are listed under the Wave P entry in ROADMAP section 7.

## Wave N landed (2026-10-21)
Bryan chose the recommended option on all four project chemical list decisions (one list, fate screens pick one;
each chemical's sent result kept; user chemicals with a name and a note per value; surface water cleanup target by
the linear route), then said "after that, go ahead with waves O and P". Rulings in the DECISIONS.md "Project
chemical list, waves N to P scope" block and the N1, N2, S, FA and FB blocks after it.
- N1: an optional top-level `chemicals` list in the project file, derived on open when absent; store API
  `getChemicals`, `subscribeChemicals`, `addChemical`, `removeChemical` (`project/store.ts`, `project/chemicals.ts`).
  No UI yet.
- N2 and FA: nine feeds carry an optional `chemicalId` (`project/feedChemical.ts`); risk, cleanup (modeled
  source, surface water levels), household, vapor and the transport feed toggles refuse a feed for another
  chemical with an error naming both, and an untagged feed once two or more chemicals are in play. FB: the
  surface water screen has a chemical select for unlinked runs.
- S: the source check of 2026-10-21 recorded on `#/validation` (SSG PCE H' corrected to 0.754 per Table 36;
  Briggs constants read in the paper; EPRI EA-4190 prints no vadose dispersivity coefficients; RSL K = 0.5 L/m3).
- Left for wave O, and landed there: the surface water sender tag test, and `setScreen` re-adding a chemical
  after `removeChemical`.

## Waves L and M landed (2026-10-21)
Bryan: "go ahead with waves L and M in parallel". Rulings DEFAULT in the DECISIONS.md "Waves L and M scope" block,
the L1, L2, M1 and M2 blocks and the "Waves L and M corrective pass" block; summary in ROADMAP section 7.
- L live stale marks: every feed (12 saved feeds plus the session-only `transportChain`) is stale the moment its
  sending screen's inputs differ from those at send; re-send or editing back clears it. API in
  `project/store.ts` (`getStaleFeeds`, `isFeedStaleNow`, `subscribeStale`) and `project/staleFeeds.ts`
  (`useStaleFeeds`, `useFeedStale`, `FEED_INFO`). Marks: `project/StaleMark.tsx` on screens, panels and
  uncertainty panels; report sections via `feedsRead.ts`; stale CSV files gain a `stale inputs` column and a
  `-stale-inputs` file name suffix (`export/staleCsv.ts`). The wave K coefficient-dropping effects were replaced.
- M validation: `packages/data/src/validationCatalog.ts` checked against the tree by `docs:generate`, writing
  `docs/VALIDATION.md` (34 examples: 28 reproduced, 3 named exception, 2 pending or deferred, 1 smoke test) and
  the JSON behind the `#/validation` page. Tolerance evidence is an exact count; reproductions without a fixture
  file carry a `published-reproduction: <id>` marker in their test.
- `docs/UI_PARITY.md` gap rows corrected in place against the tree.

## Wave K landed (2026-10-21)
Rulings in the DECISIONS.md "Wave K scope" block, its K1 to K4 slice blocks and the "Wave K corrective pass" block,
all DEFAULT (Bryan: "go for it, whatever you recommend"). Summary in ROADMAP section 7, "Wave K".
- K1 vapor source levels on `#/cleanup` (`cleanup/VaporPanel.tsx`, `vaporLevels.ts`, coefficients from
  `vapor/coefficients.ts` on the vapor feed). K2 surface water source levels (`cleanup/SurfaceWaterPanel.tsx`,
  `surfaceWaterLevels.ts`, `surfaceWater/coefficient.ts`). K3 all three source-level panels in the report and the
  cleanup CSV (`cleanup/sourceLevelsCsv.ts`). K4 the modeled visit in `scripts/mobile-check.mjs`.
- Corrective pass: per-chemical narrowing (`cleanup/chemicalLevel.ts`) fixes a crash of all three panels in a
  multi-chemical run (the household one predates the wave); send blocked on an invalid vapor form and on a
  surface water engine error; sent coefficients dropped when their inputs change; household zero-coefficient
  reason written to the CSV.

## Wave J landed (2026-10-19)
Rulings in the DECISIONS.md "Wave J scope" block and its "Wave J slice" blocks. Bryan directed "do 1, 2 and 3 as
one wave"; J3 is his decision, the other rulings are DEFAULT.
- J1 plume grid CSV: a separate download under the plume map on `#/transport`, long format, one row per grid cell
  at full resolution, for the time shown on the map, concentration in mg/L; the transport CSV is unchanged.
- J2 modeled-source uncertainty in the report: "Include uncertainty results" prints the result kept in session
  memory from the cleanup screen (levels table, iterations, seed, warnings, input ranking), or says it is out of
  date (checked by a fingerprint of the current request and setup) or not yet run. It is not saved with the
  project, so a reload, a new project or an opened project needs a re-run. No distribution chart for a modeled
  source.
- J3 a restored autosave no longer raises the close or reload warning until an edit follows the restore
  (overturns the I3 DEFAULT). Two baselines: `warnedSnapshot` drives the warning, `savedSnapshot` drives the
  confirm before an open, drop or share link replaces the project (`hasUnfiledChanges`), so a restored project
  never saved to a file still asks first.
- J4 test time: cached AT123D time integrals and PATCHI unit step responses in the cleanup level searches (engine
  numerics unchanged, bitwise equal), split heavy engine and web test files, and no per-file setup or jsdom for 38
  pure-logic web test files. Engine 41 s to 21 s, web 128 s to 40 s locally.
- Review fixes (corrective pass): plume and transport CSV buttons are disabled while the shown result is stale
  (J1); the J3 replace confirm restored (above); a new modeled run clears the kept summary at start (J2); the
  route hash is reset between web tests and test-only helpers renamed to `.testkit.` with a guard test (J4); the
  report notes in `docs/methods` brought up to date. The cause of the one order-dependent skip-link failure is not
  proven (not reproduced in six runs); the hash leak was the only leak found.
- J5 `m1-groundwater-ui` and `ui-u9-wildlife` deleted after checking against main.

## Wave I landed (2026-10-19)
Rulings in the DECISIONS.md "Wave I scope" block and its "Wave I slice" blocks, all DEFAULT (delegated by Bryan).
- I1 plume map in the report, before the breakthrough chart; the printed table is 20 evenly spaced rows, the screen
  keeps all 100; the transport CSV carries no plume grid (the plume CSV came in wave J).
- I2 wildlife flag "Not reproduced within 5 percent" (text, 5 percent via `REPRODUCTION_TOLERANCE`), CSV column
  yes, no or blank; no flag when no level was back-calculated or no printed value exists.
- I3 close-tab and reload warning while there are unsaved changes (a restored autosave counted as unsaved; wave J
  slice J3 reversed that).
- I4 chart arrow keys: breakthrough curves (with Home and End) and the plume map fixed; the key hint is in the
  accessible names of all six focusable charts.
- I5 transport charts size from the content box (`useWidth`), which removes the roughly 7 percent undersize.
- I6 uncertainty on modeled cleanup sources (`#/cleanup`, `apps/web/src/cleanup/ModeledSourceUncertainty.tsx`),
  worker pool message `modeled-cleanup`, default 200 iterations, saved under the `modeled` key; engine
  `summarizeCleanup` split out of `runProbabilisticCleanup`.
- Review fixes: compare table header styling restored, no reproduction flag without a back-calculated level,
  methods statement cites the probabilistic cleanup method for a modeled-only run, two-worker tests really use two
  workers, plume probe cell resets on pointer leave.

## Wave H landed (UI near-parity, 2026-10-19)
Plan `docs/UI_PARITY.md` (a status line per slice); rulings in the DECISIONS.md "Wave H" blocks, DEFAULT where marked.
- U1 step bar: all six steps are links (`apps/web/src/steps.ts`), the step owning the current route is marked,
  the home page names no placeholder and links the report.
- U2 `#/site`: advisory checklist of screens and feed buttons from six choices; forbidden combinations are
  explained; saved under a `site` key; one line in the report. Nothing is locked.
- U3 `#/chemicals`: read-only RSL 2024-11 browser with a source per value and CSV. The built JSON asset ships
  minified (633,152 B against 1,218,894 B in the repo) under a 700 kB cap in `bundleSize.test.ts`.
- U4 per-project toxicity overrides (an `overrides` key shared by risk and cleanup, a required source note,
  listed in the report). U5 per-project exposure factors and receptor names; risk and cleanup keep their own
  receptor edits.
- U6 Help link on every screen into its user guide section.
- U7 texture presets on the vadose layers and the saturated Soil group.
- U8 fill from the database on transport, vadose and saturated; transport Kd = Koc x foc (DEFAULT). A record
  with no Koc leaves transport retardation unchanged and says so.
- U9 wildlife dose panel on `#/plants-eco`, rows from the Eco-SSL derivation rows, reproduced within 5 percent.
- U10 decimal comma entry, off by default, per browser; an ambiguous entry blocks the calculation and is never
  saved; text boxes ignore the setting.
- Corrections made while closing the wave: feed fingerprints skip keys added in this wave (`FINGERPRINT_SKIP`
  in `project/hash.ts`) so older project files are not flagged stale; `screenUsed` judges the saved screens;
  the ecological checklist serves a soil source only.

## Wave G landed (parity gaps, 2026-10-19)
- Cleanup (`#/cleanup`): homegrown produce level (does not apply to modeled sources, DEFAULT) and TPHCWG and
  MADEP total TPH levels, with CSV, project and report support.
- Report (`#/report`): each screen's main charts with data tables, and an on-request "Include uncertainty
  results" control that re-runs from the saved setup and seed (plume map excluded, DEFAULT; overturned in wave I). Only the exposure
  sample runs in the background and can be cancelled; the one-at-a-time, Sobol and cleanup solves block the page.
- Accessibility: `scripts/mobile-check.mjs` runs axe-core (dev dependency, MPL-2.0) on every route at 390 light,
  390 dark and 1280, including the fed cleanup screen; per-screen keyboard-order tests exist; the long-run
  confirmations use `ui/AlertDialog.tsx` (focus to Cancel, Escape cancels, focus returns to the trigger); the
  scrollable chart data tables are keyboard-focusable regions.
- Surface water performance: the bank-plane integral got a tail tolerance and remembered axis factors (a 2000 m
  linked run 178 s to 2.0 s in Node; `compute.test.ts` 205 s to 11.7 s). Rulings in the DECISIONS.md G1 to G4
  blocks.
- Generated `.vitest` output is ignored.

## M7 landed (shower, irrigation, particulates, App. G, H, I)
- Methods note `docs/methods/shower-irrigation-particulates.md`. Rulings: DECISIONS.md "M7 shower,
  irrigation and particulates scope" block and its E1, E2, E4, W1 and W2 blocks.
- Engine: `packages/engine/src/processes/shower/` (`droplet.ts`, `legacyStall.ts`, `little.ts`,
  `household.ts`, `common.ts`, `methods.ts`), `irrigation/` (`sprinkler.ts`, `pathways.ts`, `methods.ts`),
  `particulate/` (`windErosion.ts`, `pef.ts`, `qOverC2002.ts`, `methods.ts`) and `household/` (`coupling.ts`,
  `cleanup.ts`: EPC adapters with origin tags and the M5 coefficient wrappers). Registered:
  `shower.fc-1986` (legacy), `shower.little-1992`, `shower.rsl-household`, `irrigation.sprinkler-fc`,
  `irrigation.pathways`, `particulate.box-emission`, `particulate.ssg-pef-1996`, `particulate.ssg-pef-2002`.
- Web `apps/web/src/household/` at `#/household`: shower, sprinkler and particulate inputs with every method
  side by side, water sources from the held transport or surface water series, feeds into the risk screen
  (bathroom air, indoor air for the RSL term, outdoor air) and the cleanup screen (levels as the air level
  over the coefficient). The screen has no chemical database (a CAS number is typed).
- Data: none new. Fixtures: identities, hand cases, SSG 1996 default PEF; the Table R-9 shower rows are a
  named exception.
- Not verified: `foster1986` has no confirmed published record (film coefficients 3000 and 20 cm/h ship as
  warned defaults, `shower.film-reference-unverified`); the full text of `little1992` was not read, so its
  equations are checked by limit identities only; the household factor K could not be verified from a primary
  page (required, always warned, `shower.household-factor-unverified`); since wave R, K = 0.5 L/m3 reproduces
  263 of the 265 RSL November 2024 tap water inhalation cells (consistency, not verification). No
  Walden and Spence or EFH irrigation factors were read, so every irrigation factor is an input.
- Deferred: see the ROADMAP M7 row.

## M9 landed (plant uptake, ecological screening, TPH fractions, App. O, P, Q)
- Methods note `docs/methods/plants-and-eco.md`. Rulings: DECISIONS.md "M9 plant uptake and ecological
  screening scope" block, its E1, E2, E3 and E4 blocks and "M9 review fixes".
- Engine: `packages/engine/src/processes/plantUptake/` (`briggs.ts`, `leaf.ts`, `legacy.ts`, `hhrap.ts`,
  `partition.ts`, `produceFactor.ts`, `irrigation.ts`, `checks.ts`), `eco/` (`screen.ts`, `wildlife.ts`,
  `uptake.ts`) and `tph/` (`fractions.ts`). Registered: `plantUptake.trapp-matthies-1995` (legacy),
  `plantUptake.hhrap-2005` (modern fallback), `eco.benchmark-hq`, `eco.ecossl-2005`, `tph.tphcwg`, `tph.madep`.
  The homegrown `produce` pathway was added to the M4 exposure kernels and the M5 closed form.
- Web `apps/web/src/plantsEco/` at `#/plants-eco`: plant factors and intake sent to the risk screen (a
  receptor and a per-chemical switch turn `produce` on), Eco-SSL and user-benchmark hazard quotient tables,
  TPH composition editor with total level, forward hazard index and the mixture saturation check. `log Kow`
  was added to `cleanup-chemicals.json` for it.
- Data: `packages/data/src/ecossl/` builds `generated/ecossl-2026-10-18/ecossl.json` (21 substances, 2
  unmapped) from hand-entered, page-cited values with a checksummed manifest of the EPA PDFs (the PDFs are
  not committed; `pnpm fetch:ecossl` verifies them). Public domain. `epaecossl` is `data`.
- DEFAULT rulings Bryan has not reviewed: ruling 11 (Trapp 2015 could not be identified or read, so the
  modern method is the HHRAP 2005 equations), ruling 12 (TSCF and the leaf-air partition coefficient are
  required inputs), ruling 9 (TPH fractions map onto the five RSL TPH records), ruling 8 (Eco-SSLs by hand
  entry; seven printed wildlife rows that do not reproduce are flagged, not corrected).
- Deferred: the produce and TPH total levels reached the cleanup screen in wave G and the Eco-SSL wildlife
  surrogate rows reached `#/plants-eco` in wave H; see the ROADMAP M9 row for what remains.

## M10 landed (uncertainty, Monte Carlo)
- Methods note `docs/methods/uncertainty.md`. Rulings: DECISIONS.md "M10 uncertainty scope (stage 1)" block
  and its slice entries.
- Engine `packages/engine/src/processes/uncertainty/` (`distributions.ts`, `samplers.ts`, `runner.ts`,
  `sensitivity.ts`, `cleanup.ts`), the AS 241 inverse normal in `numerics/special.ts`, and `uncertainInputs`
  declarations on the registry for the exposure, transport, vapor, surface water, shower, irrigation,
  particulate, plant uptake, eco and TPH methods. Registered: `uncertainty.srs-exposure` (legacy),
  `uncertainty.lhs-ic`, `uncertainty.sobol-saltelli`, `uncertainty.cleanup-probabilistic`.
- Web `apps/web/src/uncertainty/` (distribution editor, panel, worker pool with a run budget, charts): panel
  on `#/risk` (legacy exposure method only) and the probabilistic cleanup panel on `#/cleanup` (direct
  sources only). The percentile fan is built and not mounted.
- Fixtures: distribution and sampler identities, Ishigami for Sobol, Table R-2 as a smoke test only (ruling
  12: the manual gives no input distributions).
- Deferred: see the ROADMAP M10 row.

## M11 landed (projects, reports, polish)
- Methods note `docs/methods/projects-and-reports.md`. Rulings: DECISIONS.md "M11 projects, reports and
  polish scope", the S8 block, "M11 accessibility pass, S10", "M11 review fixes" and "M11 docs reader and
  user guide, S11".
- Web: `apps/web/src/project/` (format v1 with zod, migrations, save and open, share link in the hash with an
  8000 character limit, debounced autosave with persisted feeds), `export/` (CSV helper and file names),
  `report/` at `#/report` (generated methods statement, inputs, result tables and engine warnings per
  screen, print CSS), `a11y/` (labels test, contrast token test, shell keyboard test), `docs/` at `#/docs`
  (reader over `docs/USER_GUIDE.md`, the attributions and `docs/methods/*.md`) and `bundleSize.test.ts`
  (entry chunk under 200 kB, no chunk over 500 kB).
- `scripts/mobile-check.mjs` (`corepack pnpm mobile:check`, needs a built app and a local Chrome): true
  390x844 viewport through CDP, light and dark, every route plus four document pages, and once at 1280x900.
  `mobile:check:full` (`--modeled`) adds the in-browser modeled cleanup run and the report's modeled block;
  `--routes` and `--views` narrow a run. Last full result: see State of the tree. It is not in `gate` or CI.
- Routes (wave H adds `#/site` and `#/chemicals`): `#/` and `#/methods`, `#/transport`, `#/vadose`, `#/saturated`, `#/risk`, `#/cleanup`,
  `#/vapor`, `#/surface-water`, `#/household`, `#/plants-eco`, `#/report`, `#/docs`.
- Deferred: see the ROADMAP M11 row.

## M5, M6 and M8 landed (condensed)
- M5 cleanup levels (`docs/methods/cleanup-levels.md`, `#/cleanup`): `packages/engine/src/processes/cleanup/`
  (`direct.ts`, `chains.ts`, `solve.ts`, `targets.ts`, `ssg.ts`, `checks.ts`); registered
  `cleanup.rags-b-1991`, `cleanup.rags-e-f-2014`, `cleanup.ssg-leaching`, `cleanup.modeled-chains`. The RSL
  build carries the MCL and published SSL columns and writes `cleanup-chemicals.json` (864 rows).
  Fixtures: SSG 1996 Table A-1 (partition formula only; its Koc and H' inputs are unverified) and the RSL
  MCL-based SSL (91 of 91 rows, the binding check). Deferred: vapor chains as modeled targets, shower
  inhalation, particulates, irrigation (M7 supplies wrappers, see above), surface water as a target, plant
  uptake and TPH levels in the screen (the produce and TPH total levels landed in wave G), target-organ segregation, pH-dependent Kd and Koc.
- M6 vapor models (`docs/methods/vapor-models.md`, `#/vapor`): `processes/vapor/` and `processes/outdoorAir/`;
  registered `vapor.je-1991`, `vapor.dominant-layer-1998`, `vapor.je-epa`, `vapor.devaull-2007`,
  `vapor.attenuation-factor-2015`, `vapor.pvi-screen-2015`, `vapor.jury-bam` (zero water flux only),
  `outdoorAir.box`, `outdoorAir.ssg-vf-1996`. Data: `packages/data/src/vapor/` builds
  `generated/vapor/vapor-chemicals.json` (112 chemicals) from the committed EPA 2004 J&E table merged with
  the RSL. Tables R-3, R-4, R-5 reproduce; Table R-6 is a named exception (printed value duplicates R-5).
  Appendix K is not implemented (see open items).
- M8 surface water and sediment (`docs/methods/surface-water.md`, `#/surface-water`):
  `processes/surfaceWater/`; registered `surfaceWater.well-mixed` (legacy) and `surfaceWater.mass-discharge`.
  Data: `generated/nrwqc-2026-10-16/` (aquatic life 61 rows, human health 128, hardness table for 6 metals)
  and `generated/sediment-2026-10-16/benchmarks.json` (811 rows, 28 flagged `basisInferred`) from committed
  public EPA sources. Table R-8 reproduces. A surface water series feeds the M4 swimming pathways and the
  M7 irrigation water.

## M4 landed (chemical and toxicity database, direct exposure and forward risk, Ch. 3, 6, 7)
- Methods note `docs/methods/exposure-and-risk.md` and data plan `docs/methods/chemical-database.md`
  (RSL November 2024, the current edition as checked on EPA's site 2026-10-16). Rulings: DECISIONS.md M4
  block and the E1, E2, E3 and D1 blocks.
- Review of M4: an independent review ran on the branch and its findings were fixed in the commits
  after `d9613db` (dermal form, receptor inputs, age segmentation, transport-year start, risk-only
  chemical subset, the generated-document date, the reference status of `epa2003toxhier`, and two
  timing checks made robust to load). Each fix has a test that failed first; the rulings are amended in
  place in DECISIONS.md.
- Data: `packages/data/src/rsl/` reads the three raw RSL files (`packages/data/raw/rsl/2024-11/`, checksummed
  by `manifest.json`) with `read-excel-file` 9.3.12 (exact-pinned devDependency). Output
  `packages/data/generated/rsl-2024-11/{chemicals,tox}.json`, 890 rows each. `id` is the CAS number, or
  `<cas>-<name-slug>` where one CAS has several rows; blank values are omitted; `special` is
  `trichloroethylene` or `vinyl-chloride`. Each analyte with a published dermal water value carries
  `dermalForm` ('organic' or 'inorganic', from the committed id list `packages/data/src/rsl/dermal-form.ts`).
  The build also writes `generated/rsl-2024-11/risk-chemicals.json` (about 27 percent of `chemicals.json`):
  the physical-property subset the web risk screen loads, checked byte for byte by the data test. Scripts: `pnpm data:generate` (`build-rsl.ts`) and
  `fetch-rsl.ts` (manual; refuses an existing edition directory). Root `data:check` is in the gate.
- Engine `packages/engine/src/processes/exposure/`: `units.ts` (SI; exposure years are 365 days, and the
  365.25-day `TRANSPORT_YEAR_S` is used only for a pinned exposure start and the start year shown; ruling 14), `legacy.ts` and
  `receptorsLegacy.ts` (RAGS 1989), `dermal.ts`, `lifeStages.ts`, `modern.ts` and `receptorsModern.ts`
  (RAGS E/F, 2014 defaults, ADAF), `averaging.ts`, `epc.ts` (`constantEpc`, `seriesEpc`,
  `groundwaterBreakthrough`, the M1 adapter), `checks.ts`, `scenario.ts` (`runLegacyScenario`,
  `runModernScenario`), `index.ts`. Risk in `packages/engine/src/processes/risk/` (`additivity.ts`,
  `summary.ts`). Registered as `exposure.rags-a-1989` (legacy) and `exposure.rags-e-f-2014` (modern); there
  is no separate risk method.
- Web `apps/web/src/risk/` at `#/risk` (lazy-loaded): chemical picker over the RSL JSON (separate chunks,
  loaded on demand; the physical-property chunk is the derived `risk-chemicals.json`, about a quarter
  of the full `chemicals.json`), receptor panels (one or two), legacy versus modern comparison, stacked contribution
  bars, warnings and toxicity sources. `transport/wellFeed.ts` lets a transport result feed the well
  concentration, with origin shown as `transport.<method>`. Zero overflowing elements at 390x844 and 1280,
  light and dark (check script `scratchpad/cdp-check.mjs`, outside the repo).
- References at the end of M4: 32 `used`, 44 `planned`, 5 `fixture`, 4 `data` (`epa2003toxhier` is `data`).
- Deferred from M4 (the ROADMAP row says so too): target-organ segregation of the hazard index (the total HI
  is reported with a warning above 1), CompTox gap filling (a blank RSL value stays absent), series EPCs on
  soil pathways (RangeError, soil is constant).
- Dermal water: the organic or inorganic form comes from the database (`dermalForm`, derived from the
  published tap water dermal values, see DECISIONS.md slice E2). The screen starts at that form and lets
  the user change it; with no database form the dermal water pathway is not quantified until one is set.
  The engine has no default form (`organic` is required), so an unknown form is never read as zero.
- Receptor panel: drinking water (L/day), skin area for water (cm2, also the swimming skin area) and
  breathing rate (m3/h, legacy only) are site-specific inputs; a blank keeps the preset. Age segmentation
  means a child plus an adult (more than one noncancer group); a child alone is not segmented, so the
  additive option runs for a child plus a worker.

## M3 landed (saturated soil source, Appendix C)
- Methods note `docs/methods/saturated-soil-source.md` (scope, equations in our words, validity checks,
  warning codes, coupling, fixture plan). Scope: legacy `saturatedSource.two-region` (constant release
  until exhausted) and modern `saturatedSource.exponential` (first-order source, the exponent-1 case of
  Falta 2005), both with water-table fluctuation. Deferred: general power-law exponent, mixture-wide
  residual test and multicomponent dissolution; region 1 volatilization to M6; cleanup back-calculation
  to M5.
- Default rulings applied (in DECISIONS.md, open to overturn): fluctuation at the annual-mean release rate
  with an optional seasonal schedule; region 1 water content from the M2 unit-gradient helper; release
  into an AT123D box of the source plan size from the water table down to the high-water saturated
  thickness.
- Engine `packages/engine/src/processes/saturatedSource/` (geometry, partitioning, release, coupling,
  checks). Fixtures in `packages/engine/test/fixtures/saturatedSource/`: SSG 1996 Table 3-A soil
  saturation limits for six chemicals, the BIOSCREEN source-mass example, Falta 2005 exponent 0 and 1,
  two hand cases at 1e-9, and mass identities with M1 and M2 at 1e-12 and 1e-6.
- Web `apps/web/src/saturated/` at `#/saturated`: inputs, cross-section sketch, release-rate and
  remaining-mass charts with the depletion time marked, region table with warnings, and a feed into the
  transport screen. Seasonal schedules keep their seasons while the feed fits 48 steps; beyond that they
  fall back to whole-year steps carrying the seasonal schedule's exact delivered mass (with or without
  decay). A saturated-fed transport run takes porosity, Darcy flux and retardation from the saturated
  run. For a source that never reaches the water table the screen keeps its typed mixing depth while the
  engine coupling uses a patch (recorded in DECISIONS.md and the methods note). Zero overflowing elements
  at 390x844 and 1280, light and dark.
- The M2 speed test asserts on the fastest of nine timed runs with a 250 ms bound (it flaked under full-suite
  load at a 50 ms bound; see the M4 review fixes for the rationale).
- `cline1991` stays `planned` and is not cited (only its Crossref metadata could be checked);
  `feenstra1991` and `falta2005` were checked against their abstracts only.

## Open items
- Unverified values and sources that ship as warned defaults or required inputs: `foster1986` (film
  coefficients), `little1992` (equations checked by identities only), the household factor K, the HHRAP
  fallback for `trapp2015`, TSCF and the leaf-air partition coefficient, the Briggs root factor constants
  (from the HHRAP appendix, a secondary account). Each stays open until the primary source is read.
- DEFAULT rulings Bryan has not reviewed: every block marked DEFAULT in DECISIONS.md for M7, M9, M10 and
  M11 (the M7 and M9 lists above are the ones that change numbers).
- Table R-2 (uncertainty) is a smoke test only; Table R-6 and the Table R-9 shower rows are named exceptions.
- Schulze-Makuch 2005 coefficients (0.20, 0.44) come from lecture notes quoting the paper, not from the
  paper's own table; per-medium coefficients and the data range are not encoded. Open until someone supplies
  the paper's PDF.
- The Gelhar et al. 1985 vadose and saturated dispersivity regression coefficients come from the manual's account
  only. Since wave R dispersivity is an entry; the regressions stay as a choice labelled "no primary source" and
  warned (`dispersivity.regression-unsourced`, `vadose.dispersivity-regression-unsourced`), and the groundwater
  screen also offers the EPA SSG 1996 rule. No open primary source for a vadose dispersivity regression was found.
- Galya 1987 is a horizontal plane-source paper; the box source derives from Yeh 1981 (the methods note
  says so; the ROADMAP section 3 row is annotated).
- Six references still carry square-bracketed descriptor titles (all `planned`, listed above); replace each
  with its verified published title when a milestone marks it `used` (a test enforces this).
- MacDonald et al. 2000 TEC and PEC values ship since wave V (`macdonald2000` is `data`), transcribed from a
  complete copy of the article and checked against a second copy; the raw copies are not committed (Springer
  copyright; its terms page could not be fetched). The Region 4 2018 sediment basis comes from cell shading (28 rows `basisInferred`; the report
  contradicts itself on Florida coastal; DECISIONS.md).
- The outdoor box cites Hanna, Briggs and Hosker 1982; an ASTM E1739 attribution is unconfirmed and not cited.
- DeVaull 2007: no published numeric example was verified; the oxygen balances are checked against a
  numerical solve. The engine is compared with three runs of the VISL calculator (wave S,
  `packages/engine/test/visl-sweep.test.ts`, fixtures under `packages/data/raw/visl/`, exceptions in
  `test/fixtures/visl-sweep/`; counts in `docs/VALIDATION.md`). Open from it: the app's
  trichloroethylene critical temperature (544.2 K, EPA 2004) and naphthalene enthalpy of vaporization (10373
  cal/mol) differ from the calculator's (571 K, 10300 cal/mol), which changes their Henry constants away from
  25 deg C.
- Mobile check (wave T): one run of m390-dark `#/risk` (seeded) reported `openPanels=0` and `charts=0` and passed
  on a re-run; not diagnosed. Watch for a repeat before treating it as a check flake.
- RSL sweeps (waves R and U): 6 of 9888 cells are unexplained: the 4 Aroclor 1242, 1248, 1254 and 1260 total
  cancer tap water cells (printed 0.0078, computed 0.007852 ug/L), PCB 105 resident noncancer soil inhalation
  (printed 840, computed 833.3) and n-nonane industrial noncancer soil total (printed 72, computed 72.5012). 12
  volatile chemicals with neither Koc nor Kd in the RSL parameter sheet have their soil inhalation cells excepted
  where the particulate-only level reproduces (a rule inferred from the data, not stated in the guide).
- `packages/data/generated/validation/validation.json` is at 59,792 bytes against the 60,000 byte cap in
  `packages/data/test/validation.test.ts`; the next catalog addition needs shorter notes or a raised cap.
- Mobile check (waves U and X): in wave U a build made with `BASE_PATH=/model_flow/` served a blank app and the check
  still reported `ok`. Since wave X a view fails when its shell never mounted or its route rendered no content
  (`scripts/shell-verdict.mjs`), so build without `BASE_PATH` for it. The rule's 5-link and 5000-character
  allowances (for the home and prose pages) could pass a thin page that is long or full of links.
- Criteria comparison (wave X review, low): a chemical covered by a group row still shows the water type and
  hardness fields, and its search hit reports `hasSurfaceWater: true` though the set has no row of its own.
- Run basis (wave R): rows inherited from the vadose or saturated screen show that screen's current chemical only,
  so in a multi-chemical modeled cleanup the report says the table covers one chemical (DECISIONS R1b.3, CB.3).
- The SSG Appendix H benzene volatilization factor does not reproduce from its printed inputs and is not used.
- RISC5 Appendix K (oxygen-limited, degradation) is not reproduced: its only source is an unpublished draft.
  Since wave V DeVaull 2007 is on `#/vapor` in its place (indoor only; no outdoor oxygen-limited path).
- International criteria (waves V and W): the EU set `eu` is the 2013 consolidation of Directive 2008/105/EC Annex I
  and `eu2026` the annex as amended by Directive (EU) 2026/805, whose revised and new standards apply from 22
  December 2027; its open low findings are in the DECISIONS.md "Wave W slices" block, item 7 (two of them closed in
  wave X). CCME imidacloprid
  (13826-41-3 as printed) no longer shares an id with the EU 2026 row (138261-41-3). The UK Directions 2015 are as
  made (no amendment found, which does not rule one out). CCME metribuzin (printed "1,0") and nitrite ("60 NO2-N")
  are not interpreted; CCME imidacloprid and ANZG vanadium CAS numbers fail their check digit and are kept as
  printed. CCME and ANZG raw files are not committed (no reuse licence stated), so the build rests on the committed
  CSVs with the fetched files' hashes. The UK zinc catchment values are not used.
- Engine chunk: `src-*.js` is 497.06 kB against the 500 kB bundle limit after wave V; the next engine addition
  needs a split or lazy load.
- Surface water solves (wave V): a first solve through a fed chain takes about 25 s in the worker, and a 2-year
  full run about 63 s.
- Two EPA 2004 lookup values fail the plausibility screen and are omitted (sec-butylbenzene enthalpy,
  tert-butylbenzene row).
- Cleanup screen gaps: produce does not apply to modeled sources (DEFAULT, delegated ruling in wave I); no total
  TPH cancer endpoint (DEFAULT, delegated). Modeled cleanup sources are sampled since wave I. Vapor and surface
  water source levels landed in wave K, and paths not linear in the source are solved since wave V. Since waves N to P each surface water result records its chemical and each
  chemical keeps its own (an untagged result still counts only in a one-chemical run), and surface water is a
  per-chemical cleanup target (P2).
- Feed staleness: live since wave L. The mark is as coarse as the source form (any edit of the sending form marks
  its feeds, even one that changes no sent value), and staleness does not cascade through feed chains (DEFAULT,
  L1).
- Report gaps: the report does not compute a modeled source; since wave J it prints the uncertainty result kept
  from the cleanup screen this session (J2), which is not saved with the project, so it needs a re-run after a
  reload, and it carries no distribution chart. The plume map is in the report since wave I. The household,
  vapor and surface water source levels print since wave K (K3).
- Plume CSV: done in wave J (J1), a separate download under the plume map; the report still prints 20 of 100
  centreline rows. At 390 px the button is covered by the
  mobile check (it renders on the default `#/transport` compute); the report's modeled block is covered since
  wave K (K4).
- The wave I modeled-uncertainty timings were measured under host load (other slices running); the dissolved
  source run was re-checked in a browser (about 2 s for 200 iterations on 4 workers), but the slow chains (vadose,
  saturated modern, which ask first or are refused) were not run in a browser.
- Restored autosave: no longer prompts on reload until an edit follows (J3, Bryan's decision; overturned the I3
  DEFAULT). A rejected decimal-comma entry can make the report read a modeled result as out of date (J2, errs
  toward out of date).
- Wave H open questions are answered by DEFAULT delegated rulings (DECISIONS.md "Wave I scope" block): Kd = Koc x
  foc stays, the wildlife flag exists, the checklist stays soil only, database edits stay per project. Bryan can
  still overturn any of them. Multi-chemical fate runs and user-defined chemicals as project entries landed
  in waves N to P (a fate screen works on one project chemical at a time; each chemical keeps its own sent
  result); RISC5 project import is not built.
- `report/ReportCharts.tsx` was not walked for keyboard behaviour in I4 (report figures are print output).
- Slow run: a linked surface water run at a 2000 m reach takes 2.0 s in Node after the wave G fix (178 s
  before); the browser time was not re-measured (81 s measured 2026-10-18 before the fix).
- Test time: wave J cut the local suites to engine 21 s and web 40 s (see State of the tree). What remains needs
  engine numerics changes (for example caching the x and y profiles across z in `at123dGrid`) and is not done.
- CI cost per push to main is about 6 billed minutes (re-measured 2026-10-21 after waves L and M, see State of the
  tree); push once per logical unit, and the heavy mobile check is local only.
- `scripts/mobile-check.mjs` is committed and run by hand; it is not in the gate. The full run
  (`corepack pnpm mobile:check:full`) runs once per wave on the integrated tree and is not repeated before the
  push unless code changed since (cadence in CLAUDE.md).
- Timing checks under load: `vadose-legacy.test.ts` (best of nine under 250 ms) and
  `groundwater-kernel.test.ts` (best of three under 1 s, mass conservation 30 s timeout) were made robust to
  parallel load. Two test races were fixed 2026-10-22 (`rowsDiffer.test.tsx` read a row
  synchronously after awaiting another; `VaporScreens.test.tsx` clicked send before a passive store-write effect
  ran). Other timing tests also fail under heavy host load (the methods citation test now has a 30 s
  timeout). If one fails, re-run that file alone before treating it as a regression.
- Manual text extraction lives outside the repo; re-extract when needed:
  `pdftotext -layout "~/Downloads/RISC5 Users Guide -- Nov 2014 (2).pdf" <out>.txt`
  (the appendix line index in ROADMAP section 3 refers to that extraction).

## Next
- Done 2026-10-21 to 2026-10-23: waves J to X merged to main and pushed (CI cost in CLAUDE.md); their worktrees
  and branches removed, and the 15 fully merged `origin/` milestone branches deleted (shas under State of the tree).
- Bryan, 2026-10-22: the target user is regulatory work (DECISIONS.md "Target user and wave Q scope"); asked for the
  jurisdiction: "state, federal, whatever" (EPA values now, a state's tables when a state comes up). His pick, the
  evidence wave, landed as wave R (see "Wave R landed"). The VISL comparison landed as wave S, the RSL
  trichloroethylene and vinyl chloride equations as wave T, the RSL soil inhalation comparison as wave U, and the
  last three audit gaps (DeVaull on `#/vapor` in place of Appendix K, nonlinear source levels, international
  criteria and MacDonald 2000) as wave V. Bryan, 2026-10-23 ("okay let's do it"): accepted the wave V substitution
  (ruling 1, DeVaull in place of Appendix K, indoor only), the vinyl chloride shower and produce fallback and vinyl
  chloride's place in wave T, all as recommended. The 2026 EU revision shipped as wave W and the blank-page check as
  wave X, the same day. Next, at Bryan's request: wave Y, the engine chunk split (the engine chunk is 498,248 of
  500,000 bytes, and the six worker bundles, 574 to 597 kB, are over the same limit but outside the size test). The
  wave P remainders still open (a soil-to-groundwater comparison for user chemicals; user Kd, vapor and dermal
  values) are listed under the Wave P entry in ROADMAP section 7.
- Then the open items above. The five sources not openly readable (Foster and Chrostowski 1986, Little 1992, Trapp
  2015, Trapp and Matthies 1995, Schulze-Makuch 2005) need a library copy.
- Tooling notes from waves K to M, addressed 2026-10-21: `corepack pnpm gate` now reads stdin from `/dev/null` (a
  backgrounded prettier step used to sit stopped in state T), and `mobile:check` stops its preview server's and
  Chrome's process groups on exit, SIGINT and SIGTERM (it used to leave `vite preview` holding port 5178). A
  `timeout` wrapper around `corepack pnpm` still signals only the wrapper, so under a timeout call
  `node scripts/mobile-check.mjs` directly.
