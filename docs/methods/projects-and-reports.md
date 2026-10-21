# Projects, reports and polish (M11): design note

Stage 1 scoping note for M11, written 2026-10-18 when M7, M9 and M10 were still open (all three are DONE 2026-10-18). It is a design note,
not equations. Choices marked DEFAULT are open for Bryan to overturn; the rulings are numbered in the
DECISIONS.md block "2026-10-18: M11 projects, reports and polish scope (stage 1)". M11 is built last; the
slice plan at the end says which slices could start before M7, M9 and M10 landed.

## 1. Where the app stands (surveyed 2026-10-18 on the M1 to M6 and M8 integration branch)

- Routing is a hash switch in `apps/web/src/App.tsx`: `#/transport`, `#/vadose`, `#/saturated`, `#/vapor`,
  `#/surface-water`, `#/risk`, `#/cleanup`, `#/methods`. Vapor, surface water, risk and cleanup are lazy
  chunks; transport, vadose, saturated and methods are in the entry chunk.
- Each screen holds its form in local `useState` (for example `CleanupPage` holds one `CleanupForm`;
  `VaporPage` holds a `VaporForm` plus outdoor, attenuation factor and PVI sub-forms). Forms are string
  fields parsed by each screen's `form.ts`, so a form is already plain JSON.
- Feeds between screens are module-level stores read with `useSyncExternalStore`: `transport/wellFeed.ts`,
  `chainFeed.ts`, `bankFeed.ts`, `vaporFeed.ts`, `vadose/feed.ts`, `saturated/feed.ts`,
  `surfaceWater/feed.ts` and the generic `vapor/feedStore.ts` (`createFeed<T>()`). All live in memory; a
  reload starts without them (the open HANDOFF item).
- The engine has no `src/schema/` yet; ROADMAP section 5 planned zod scenario schemas there. Nothing
  validates a whole scenario today.
- Method descriptors in `packages/engine/src/registry/index.ts` carry `id`, `process`, `kind`, `name`,
  `summary`, `citations` (keys into `references.json`), `assumptions` and `risc5Choice`. Warnings are
  `{code, message}` attached to results. Data editions live in `packages/data/generated/` (`rsl-2024-11`,
  `nrwqc-2026-10-16`, `sediment-2026-10-16`, `vapor`).

## 2. Project file format

A project is one JSON document, the single source for save, load, share, persisted feeds and the report.

```
{
  "format": "model_flow.project",
  "version": 1,
  "createdWith": "<app version string from package.json>",
  "savedAt": "<ISO 8601 date-time>",
  "title": "<free text, optional>",
  "screens": {
    "transport": { "form": { ... }, "method": "modern" },
    "vadose":    { "form": { ... } },
    "saturated": { "form": { ... }, "method": "legacy" },
    "vapor": { "form": { ... }, "outdoor": { ... }, "af": { ... }, "pvi": { ... }, "choice": "entered" },
    "surfaceWater": { "form": { ... } }, "risk": { "form": { ... } }, "cleanup": { "form": { ... } },
    "household": { "form": { ... } }, "plantsEco": { "form": { ... } },
    "uncertainty": { "form": { "risk": { ... }, "cleanup": { ... } } }
  },
  "feeds": {
    "well":   { "source": "transport", "inputsHash": "<hash of the source form>", "value": { ... } },
    "vadose": { ... }, "saturated": { ... }, "bank": { ... }, "vaporRisk": { ... }, "surfaceWater": { ... },
    "household": { ... }, "produce": { ... }
  },
  "data": { "rsl": "rsl-2024-11", "nrwqc": "nrwqc-2026-10-16", "sediment": "sediment-2026-10-16" }
}
```

- **Implemented (S2, `apps/web/src/project/` and a `project.ts` beside each screen's `form.ts`).** The
  `method` entries are the screen's own method choice as the page holds it (the transport well method, the
  saturated feed method), not a registry id, because the page keys are what the page reads back; the vapor
  key also holds the outdoor, attenuation factor and vertical separation sub-forms and the source choice.
  `buildProject`, `parseProject` (text or parsed value; refuses a non-project, a bad or newer version, and
  any schema failure, with the path of the problem), `screensOf` and `defaultScreens` are the entry points.
  Inside a screen, every form field is optional on load and takes the screen default when absent (so
  adding a field never needs a version bump), and nested objects merge key by key; array rows (steps,
  layers, chemicals) are taken whole and must be complete, except that a chemical row flag an older file
  lacks reads as false. Enum fields are checked against the form's own allowed values; text fields accept
  any string. Unknown keys are dropped and listed as warnings by path. `createdWith` is a parameter of
  `buildProject`; the caller passes the app version. No version has needed a migration yet, so the
  `migrations` table is empty and the runner is tested with injected steps; the first real bump adds its
  fixture test.
- **Implemented (S8, screens added after S2).** Three more keys: `household` (the `#/household` form),
  `plantsEco` (the `#/plants-eco` form: chemical, plant, intake, benchmark and TPH fraction rows) and
  `uncertainty`, which holds the setup of the two uncertainty panels (`risk` on the exposure screen,
  `cleanup` on the cleanup screen): the distribution editor row of each input as typed (kind, parameters,
  lognormal form, truncation limits, empirical table), the rank correlation pairs, the sampling kind,
  iteration count, seed, output, Sobol switch and sample size, the protected percentage and the chosen
  chemical and medium. Results are never saved: a run is repeated from the setup and its seed, which
  gives the same numbers. Two more feed entries, `household` (fingerprinted against the household form)
  and `produce` (against the plants form). An absent key, and a field an older file lacks, take the
  defaults, so no version bump was needed.
- **Screen keys hold the screen's own form type unchanged** (strings as typed, so a reload shows exactly
  what the user entered, including invalid text). Each screen exports `toProject()` and `fromProject()`
  beside its `form.ts`; the project module never reaches into a form's fields. Screens added by M7, M9 and
  M10 add keys; an absent key means that screen's defaults.
- **Feeds are stored as values, not recomputed on load (DEFAULT).** The schema checks the well and
  surface water feeds in full (equal length finite series, SI) and the scenario carrying feeds (vadose,
  saturated, bank, vapor) by their top-level keys with the scenario itself a JSON object (S3 pinned the
  shapes: vadose `{scenario, method, label}`, saturated `{input, method, label}`, bank `{scenario, label}`;
  the four vapor source feeds are four entries, `vaporVadose`, `vaporWaterTable`, `vaporSaturated` and
  `vaporRisk`, each fingerprinted against its own source form: the vadose, transport, saturated and vapor
  forms in that order, so editing the receiving vapor form never flags a received feed). Each feed entry
  is validated on its own: an unusable one is dropped with a warning (and named in a note on the page)
  while the screens still load, so a feed never costs the user the forms. Non-finite numbers,
  which a scenario can hold (an open-ended loading term ends at infinity), are written as a tagged object
  and read back exactly (`project/codec.ts`). The transport chain feed holds a closure and is not part of
  the file. `feedEntry` and `isFeedStale`
  build and test the source form hash (FNV-1a over key-sorted JSON). A feed is the series the user chose to
  send, and recomputing it could silently change a downstream result. Each feed records the hash of the
  source form it was built from, so on load the receiving screen can say "this feed was built from inputs
  that have since changed" (a warning, never a silent refresh).
- **Validation with zod at the boundary (DEFAULT).** A zod schema per version lives in a new web module
  (`apps/web/src/project/`), not in the engine: the forms are web types. The engine keeps its own SI
  inputs. zod is MIT and small, but it is a new runtime dependency and lands in
  `THIRD_PARTY_LICENSES.md`. Unknown keys are dropped with a warning; a file with a newer `version` than
  the app knows is refused with a clear message, never half loaded. A bad feed entry is not a bad file:
  the forms, which are the user's work, load and the feed is dropped and reported.
- **Migration.** `migrations[n]` is a pure function from version n to n + 1, applied in order on load, each
  with a fixture test (a saved file of version n loads and matches the expected version n + 1 document).
  A form field rename or a unit change bumps `version`; adding an optional field does not.
- **Units.** Form values are in the units the screen shows (RISC-style at the edge, as today); feed values
  are SI, as the feed modules already document. The file records no unit labels per field; the version
  pins the meaning.

## 3. Save, load and share ($0, no server)

- **Local file (primary).** "Save project" downloads `<title or model_flow-project>-<date>.json` through a
  Blob and an anchor download. "Open project" uses an `<input type="file">` (keyboard reachable, works on
  phones) and also accepts drag and drop on desktop. No File System Access API (not in Safari or Firefox).
- **Share link (DEFAULT).** The project without its feed values is serialized, compressed and put in the
  hash as `#/p=<payload>` (the router already reads the hash, and a hash never reaches the server, so
  GitHub Pages logs nothing). Compression uses the browser's built-in `CompressionStream('deflate-raw')`
  plus base64url, with no new dependency (DEFAULT; lz-string, named in ROADMAP section 5, is the fallback
  if a target browser lacks the API). Feeds are left out because their series can be thousands of numbers;
  the receiver is told which feeds to resend from which screen.
- **Size limit (DEFAULT).** A share link longer than 8000 characters is not offered; the user is told to
  save a file instead. 8000 is a conservative common limit for chat apps, mail clients and browsers. The
  limit and the reason are shown, never a truncated link.
- **Opening a shared link** replaces the current project only after a confirm when the current project has
  unsaved changes. The payload is validated exactly like a file.
- **Implemented (S4, `apps/web/src/project/file.ts`, `share.ts`, `ProjectBar.tsx`).** A bar under the
  masthead holds the project title (saved in the file and the autosave), Save project, Open project and
  Share link. Opening a file (input or drop on the page), and opening a shared link, both go through
  `parseProject`; a file over 25 MB is refused unread, and a share payload that inflates past 4 MB is
  refused. The 8000 character limit counts the whole link (address plus payload). The project store tracks
  unsaved changes against the last save, open or start; replacing the project when there are any asks
  first. A shared link leaves the hash at `#/` once handled. The receiver is told the values passed between
  screens were not shared and from which screens to send them again; the payload does not record which
  feeds the sender had, so the list names every screen that sends one.
- **Browser storage is a convenience only.** The current project (forms and feeds) autosaves to
  `localStorage` under one versioned key, debounced (and written at once when the page is hidden or
  unloaded, so a reload or a killed background tab loses nothing), wrapped in try and catch; a private window or a full
  quota degrades to today's behaviour without an error. No list of named projects in storage (DEFAULT):
  files are the durable store, which keeps one source of truth and nothing to migrate silently.
- **No accounts, no upload, no analytics.** Nothing leaves the browser except what the user downloads or
  copies.

## 4. Persisting the feeds across reloads

This closes the open HANDOFF item. The feed modules keep their API (`get`, `set`, `clear`, `subscribe`);
a new `project/store.ts` subscribes to all of them and to the screens' form changes and writes the autosave
from section 3. On start, before first render, the store reads the autosave, migrates it, and seeds the
feeds and the screens' initial form state. `createFeed` gains an optional `initial` argument; the bespoke
well, chain, bank, vadose, saturated and surface water feed modules (the vapor feeds already used it) are moved onto `createFeed` first (a refactor slice with no
behaviour change, guarded by the existing feed tests). A "New project" control clears forms, feeds and the
autosave.

Implemented (S3, `apps/web/src/project/store.ts`). Each screen reads its initial state from the store and
writes it back on every change (an unchanged state is ignored); the store autosaves the whole project
(forms and every storable feed) 600 ms after the last change under the key
`model_flow.project.autosave.v1`, and `main.tsx` restores it before the first render. A missing, corrupt,
foreign or newer save, or blocked storage, starts a fresh project with no error. A feed records the hash
of its source form when it is sent; the vapor entry hashes the vadose, saturated, groundwater and vapor
forms together. A restored feed whose source form has changed since is listed in a notice under the
masthead and is not refreshed. "New project" (masthead, asks first) clears the forms, the feeds and the
autosave and remounts the screen. `createFeed` takes an optional `initial` value; restoring uses the feed
setters, so no feed module imports the store. The transport chain feed (cleanup levels) holds a closure,
so it is the one feed that still starts empty after a reload.

## 5. CSV export per screen

- Each screen gets a "Download CSV" control beside its results. DEFAULT: one CSV per screen holding the main
  results table, plus a separate time series CSV for screens whose result is a series (transport, vadose,
  saturated, surface water, vapor transient).
- Format: RFC 4180, UTF-8 with no BOM (DEFAULT), comma separated, a header row with units in the column
  name (`concentration (mg/L)`), numbers at full double precision (not the rounded display), and no
  metadata rows above the header, so spreadsheets parse it cleanly. A `method` column carries the method
  id on each row; the app version, the data edition of each dataset the table reads (risk and cleanup: the RSL
  edition; surface water: the criteria and sediment editions) and the date go in the file name
  (`risk-results-v0.0.0-rsl-2024-11-2026-10-18.csv`), and the editions and version also go in the report.
- A shared `exportCsv(rows, columns)` helper with escaping tests (quotes, commas, newlines, a leading `=`,
  `+`, `-` or `@` prefixed with a quote to defuse spreadsheet formula injection from chemical names or
  user text).
- Implemented for the transport, vadose, saturated, surface water, vapor, risk and cleanup screens
  (`csv.ts` beside each screen, one `DownloadCsv` control per table). The `method` column carries the
  registered method id; the cleanup screen's direct levels span media with different units, so that table
  carries a `unit` column instead of a unit in the header. Per-chemical charts (risk contributions, the
  modeled metric curve) have their table as a CSV too.
- **Implemented for the M7, M9 and M10 screens (S8).** `household/csv.ts` writes one long table
  (`household-results`: method id, quantity, value, unit; values converted to the units the screen
  shows). `plantsEco/csv.ts` writes `plants-produce` (plant factor and fresh weight plant concentration
  per produce class), `eco-screening` (Eco-SSL rows with their NA and NC statuses kept as a status with
  a blank value, then the user benchmark rows with their citations) and `tph-results` (total level,
  fraction levels, forward hazard index and quotients, saturation index). `uncertainty/csv.ts` writes the
  exposure panel's `uncertainty-summary`, `uncertainty-sample` (every iteration) and
  `uncertainty-sensitivity` (one at a time swings, Spearman correlations and Sobol indices with their
  intervals in one long table), and the cleanup panel's `cleanup-uncertainty-levels`, `-sample` (a failed
  iteration has a blank level and the status `failed`) and `-sensitivity`. A table with no rows is not
  offered. The household tables read no dataset and carry no edition in the file name; the rest carry the
  RSL edition.

## 6. Printable report and methods statement

- A `#/report` screen renders the whole project as one HTML document with a print stylesheet; the user
  prints to PDF from the browser. No PDF library (DEFAULT): smaller bundle, selectable text, and the
  browser handles page size.
- Contents: title, saved date and app version; a non-affiliation statement (the existing `NON_AFFILIATION`
  text); for each screen used, its inputs as a table and its results tables (charts: see S6c below); the warnings
  returned by the engine, by code and message; the data editions used; then the methods statement.
- **Methods statement, generated, never hand written.** For each method id actually run (collected from
  results, which carry their method id), it prints the descriptor's `name`, `kind`, `summary`,
  `assumptions` and `risc5Choice`, and a numbered reference list built from `citations` through
  `references.json`, deduplicated across methods. Data sources (RSL, NRWQC, sediment benchmarks, vapor
  data) are cited from their `references.json` entries with the edition string. A test asserts the
  statement for a fixture project contains every cited key and no method that was not run.
- Charts print as inline SVG (they already are SVG), with the data table beside each, so a printout is
  readable in greyscale.
- **Implemented (S6, `apps/web/src/report/`, route `#/report`).** `buildMethodsStatement` (pure, tested
  against the real registry) takes the ids of the methods run and the data editions and returns the
  methods in registry order with name, kind, summary, assumptions and RISC5 choice, a reference list
  numbered by first appearance and deduplicated, and the data sources with their edition strings
  (RSL 2024-11 from `epa2024rsl`, NRWQC from `epanrwqc` and `epanrwqchh`, sediment benchmarks from
  `epa2018r4era`; the vapor data has no edition string and is not cited yet). An unknown method id or
  reference key throws. Which methods were run is decided from the project forms, not from computed
  results (`methodsRun.ts`): a screen counts as used only when its state differs from a new project's, a
  used screen runs both of its methods side by side, and a form choice adds or drops the optional ones
  (the Domenico method, the dispersivity law unless all three dispersivities are entered, the
  attenuation factor for a non-soil vapor source, the soil screening leaching level, the modeled chains
  for a non-direct cleanup source). The report page lists each used screen's inputs as typed (field
  names, not the screens' labels), the methods statement, and the data editions (the project's recorded
  edition when it has one, else the edition this build ships). A "Prepared by" field is held on the page
  only, empty by default, and prints only when filled. Print CSS hides the app chrome. S6c added the
  results (see the next bullet). S8 added the
  household, plants and uncertainty sections (inputs as typed, and the methods each runs): the household
  screen runs its three shower methods, the sprinkler method and its three particulate methods side by
  side; the plants screen runs both plant uptake methods and the Eco-SSL screen, adds the user benchmark
  method when a benchmark row exists and the chosen TPH fraction set when a total or a fraction is
  entered; the uncertainty section lists the sampling method of each configured panel (and the Sobol
  method when switched on). The plants and uncertainty sections count the RSL edition among the data
  sources; the household screen reads no dataset.
- **Implemented (S6c, `apps/web/src/report/results.ts`).** Each used screen's section now carries a
  Results block and a Warnings and notes block. `computeResults(project)` runs the screen's own form parser
  and compute function on the saved form (no new calculation path) and passes the outcome to the screen's
  own CSV table builders (`transportCsvTables`, `vadoseCsvTables`, `saturatedCsvTables`, `vaporCsvTables`,
  `surfaceWaterCsvTables`, `riskCsvTables`, `cleanupCsvTables`, `ssgCsvTables`, `householdCsvTables`,
  `plantsEcoCsvTables`), so the report tables and the CSV downloads cannot drift apart. Values passed
  between screens come from the project's stored feeds, decoded as loading a project decodes them; a feed
  the file lacks leaves that screen unfed, as it is after a reload. Tables print with the CSV headers
  (units included), numbers shortened to six significant digits and at most 40 rows each, with a line
  giving the full row count (the CSV download holds every row at full precision). Warnings are the engine
  `{code, message}` pairs with the method or table that raised them, de-duplicated. A screen that cannot
  be computed prints "Not computed" with the form's own error text instead of a table. Charts and
  uncertainty results landed in Wave G slice G2 (a later bullet). Not in the report: (1) the modeled
  cleanup chart (the plume map is printed since wave I); (2) a modeled cleanup source is not computed by the
  report: it solves through the groundwater chain feed (it holds a function and is not saved), so the report
  prints the modeled-source uncertainty summary kept from the cleanup screen this session when it is current,
  says it is out of date, or says it has not been run. The household, vapor and surface water source levels of the
  cleanup screen print in its section and write to the cleanup CSV since wave K (slice K3). On a phone each result row prints as a labeled card so no
  table scrolls sideways; the printed page keeps the plain table.
  Viewport check (2026-10-18): `#/report` for a project with the groundwater, vadose, saturated, vapor,
  surface water and plants screens used, through CDP device emulation at 390x844 (mobile, scale 2) in
  light and dark and at 1280x900 light: 8 result tables rendered, overflowing elements 0 in all three,
  scroll width equal to client width.
- **Implemented (Wave G slice G2, charts and uncertainty results).** Each section carries the screen's
  main charts, drawn by the screen's own chart components from the same compute result as the tables
  (`ChartItem` in `report/chartItems.ts`, built in `results.ts`): the receptor breakthrough chart
  (groundwater), the depth profile, water table and depletion charts (vadose), release rate and remaining
  mass (saturated), surface water and sediment, the vapor profile, and the exposure bars. Every chart is
  followed by its data table, shown open with no toggle in the report (a context read by the shared
  data table and the two charts with their own). Print styling pins the chart palette to grey shades and
  removes pointer readouts and buttons, so a black and white print keeps the series apart (shade plus the
  screens' markers and dashes). Uncertainty results are an explicit "Include uncertainty results" control
  in the uncertainty section, off by default. Ticking it repeats each configured panel's run from the
  saved setup and seed (`report/uncertaintyReport.ts`, over the same `uncertainty/headless.ts` runs the
  two panels use): the exposure sample goes through the worker pool with its progress, cancel and run
  budget confirmation, so the page stays responsive; the probabilistic cleanup solve is synchronous, as
  on its screen, and is bounded by the same budget check. Shown: the percentile summary, CDF and
  histogram, tornado, Spearman and (when switched on) Sobol indices, the seed, the iteration count and
  sampling kind, warnings, and the cleanup panel's protective level table with its chart and Spearman
  bars. A panel with no sampled input, an invalid setup or a screen that does not compute is skipped with
  a sentence saying why. Results are not saved in the project.
  Viewport check (2026-10-19): `#/report` with the groundwater, vadose, saturated, vapor, surface water,
  plants, exposure and cleanup screens used and both uncertainty panels run through the real worker pool:
  19 charts rendered, 8 of them uncertainty figures, overflowing elements 0 at 390x844 in light and dark
  and at 1280x900 light.
- No author name, address or contact line is printed (DEFAULT); a free-text "prepared by" field the user
  fills is allowed, empty by default. Nothing in the template carries a personal contact address.

## 7. Responsive pass

- Every screen is checked at a true 390x844 viewport through CDP device emulation (not
  `--window-size`): `Emulation.setDeviceMetricsOverride({width: 390, height: 844, deviceScaleFactor: 2,
  mobile: true})`, navigate each hash route, count elements whose `getBoundingClientRect().right` exceeds
  `document.documentElement.clientWidth`; the count must be 0. Tap targets at least 44 px.
- **It lives in the repo (DEFAULT)** as `scripts/mobile-check.mjs`: Node 22 global `fetch` and
  `WebSocket`, no new dependency, launches the installed Chrome headless against `vite preview`, visits
  every route in light and dark (`Emulation.setEmulatedMedia` with `prefers-color-scheme`) at 390x844 and
  once at 1280x900, seeds a small layout-test project and presses each screen's compute, example and add
  buttons so result tables and charts are on screen, prints the overflowing selectors and writes full-page
  screenshots to the ignored `apps/web/.mobile-check` folder. `#/docs` is in the route list and is checked
  as the fallback page until the reader exists. Status (2026-10-18): built and run over every route, zero
  overflowing elements in all three views. Run as `corepack pnpm mobile:check`.
- **Not in `gate` and not in CI (DEFAULT).** It needs a Chrome binary and a GUI-free but real browser
  session; it runs locally before each milestone push, per ROADMAP section 9 step 3. A jsdom unit test
  cannot measure layout, so no vitest stand-in is pretended.

## 8. Accessibility pass

- Keyboard: every control reachable in order, visible focus ring in both themes, no keyboard trap, the
  nav usable without a pointer, skip link to `main`.
- Labels: every input has a `<label>` or `aria-labelledby` (a test walks each screen's rendered form with
  Testing Library `getByLabelText` for every field); units in the label text; errors tied with
  `aria-describedby` and announced through a polite live region.
- Contrast: WCAG 2.2 AA for text and 3:1 for chart marks and focus indicators, checked for the light and
  dark tokens with a small token-pair test (computed contrast ratios), not by eye.
- Charts: each SVG has `role="img"` with a title and a one-line summary, and a "Show data" table toggle
  (the same rows as the CSV), so no result is chart-only.
- Target: WCAG 2.2 AA (DEFAULT). An axe-core run is optional tooling in the mobile script, not a gate
  dependency.
- Status (S10, 2026-10-18): built. `apps/web/src/a11y/labels.test.tsx` renders every screen (risk and
  cleanup also with a chemical added) and fails on any input, select or textarea with no accessible
  name. `a11y/contrast.test.ts` computes WCAG ratios from the CSS tokens in both themes: text pairs at
  4.5:1, the accent focus colour and every chart mark token at 3:1 against the surface. That test found
  three light-theme categorical colours (vadose mass budget and risk slots 2 to 4) under 3:1; they were
  darkened (DECISIONS, M11 accessibility block). Every chart now has a "Show data table" toggle: the
  uncertainty charts (CDF, histogram, fan, tornado, Sobol, Spearman) and the plume map were the last
  without one; the plume table lists the centreline concentration at each x, not the whole grid. A skip
  link is first in the tab order and moves focus to `main` without touching the route hash, and one
  global `:focus-visible` rule draws a 3px accent outline. Not done: the axe-core run, the cross-section
  figure (its numbers are in its label and caption) and the distribution editor's cumulative preview
  (its input table is the data) have no separate data table, and keyboard order was checked by tests of
  the shell only, not by tabbing every screen by hand.

## 9. Docs site

- **DEFAULT: no separate generator.** The app already has `#/methods`. M11 adds a `#/docs` reader that
  renders the committed `docs/methods/*.md`, `docs/ATTRIBUTIONS.md` and a short user guide, imported as
  raw text at build time and rendered by a small Markdown subset renderer (headings, lists, code, tables,
  links) with tests, lazy loaded. One site, one deploy, no new hosting.
- The rejected alternative is a second static generator on Pages (another toolchain and build minutes).
- **Implemented (S11, `apps/web/src/docs/`, `docs/USER_GUIDE.md`).** The reader is built as described,
  over the user guide, the attributions and the methods notes only (not DECISIONS, ROADMAP or HANDOFF).
- The user guide covers projects, sharing limits, the report and the legacy versus modern switch. It
  carries no personal contact address; issues go to the repository's issue tracker link.

## 10. Bundle size

The build warns that the entry chunk is over 500 kB. Targets (DEFAULT), measured from
`vite build` output and recorded in HANDOFF:

1. Lazy load transport, vadose, saturated and methods like the other screens, so the entry holds only the
   shell and the landing page.
2. Keep generated data (RSL, NRWQC, sediment, vapor tables) out of the entry: dynamic `import()` on the
   screens that use them, as the risk screen already does.
3. `references.json` is loaded with the methods page and the report, not the shell.
4. Check that each screen's chunk imports engine processes by path through the package entry without
   pulling every process (tree shaking through `@model-flow/engine`'s barrel `index.ts`); if not, add
   subpath exports.
5. Goal: entry chunk under 200 kB minified and no chunk over 500 kB, enforced by a small build-size test
   that reads the Vite manifest (DEFAULT numbers, set from the first measurement).

## 11. In M11 versus deferred

In M11: the project format v1 with zod validation and migrations; file save and open; share link with the
8000 character limit; localStorage autosave; persisted feeds; CSV per screen; the printable report with the
generated methods statement; the in-repo mobile check script run over every screen; the accessibility pass
to WCAG 2.2 AA; the `#/docs` reader; code-splitting to the targets above.

Deferred: named projects in browser storage; cloud or gist sharing (needs a token or a server); a PDF
library; import of RISC5 project files (format undocumented, and inspecting the binary is ruled out);
side-by-side comparison of two saved projects; offline PWA install; translation; a mobile check in CI.

## 12. Slice plan (one worker per slice)

| Slice | Content | Depends on | Can start before M7, M9, M10 land |
| --- | --- | --- | --- |
| S1 | Move the bespoke feed modules onto `createFeed`, no behaviour change | none | yes |
| S2 | `apps/web/src/project/`: format v1, zod schema, migration runner, `toProject`/`fromProject` for the existing seven screens | S1 | yes; the M7, M9 and M10 keys were added in S8 |
| S3 | Autosave and persisted feeds, "New project" | S2 | yes |
| S4 | File save and open, share link with compression and size limit | S2 | yes |
| S5 | `exportCsv` helper and CSV on the existing screens | none | yes |
| S6 | Methods statement generator and the `#/report` screen with print CSS | S2 | yes for the generator; the report must cover every screen, so it closed after S8 (done: generator, inputs, methods, result tables and engine warnings per screen; charts and the uncertainty results were added in Wave G slice G2) |
| S7 | Bundle splitting and the build-size test | none | yes, but re-measure after M7, M9, M10 |
| S8 | Project keys, CSV and report sections for the M7, M9 and M10 screens (done on the wave branch: keys, feeds, CSV and input and method sections; the per-screen result tables closed with S6c) | S2, S5, S6, and M7, M9, M10 landed | no |
| S9 | `scripts/mobile-check.mjs` and fixes on every screen | none to write the script | the script yes; the full pass waits for every screen (done 2026-10-18, zero overflow) |
| S10 | Accessibility pass (labels test, contrast token test, chart data toggles, keyboard) | none | partly; done 2026-10-18 on the wave branch with the gaps listed in section 8 |
| S11 | `#/docs` reader and the user guide | none | yes; the guide is finished last (done 2026-10-18) |

Order: S1, S5, S7 and the S9 script in parallel; then S2; then S3, S4 and S6 in parallel; S8, the S9 pass,
S10 and S11 close after M7, M9 and M10 land. Each slice is TDD and touches disjoint files except S8 and
the passes, which run alone.
