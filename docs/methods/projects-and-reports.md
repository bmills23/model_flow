# Projects, reports and polish (M11): design note

Stage 1 scoping note for M11, written 2026-10-18 while M7, M9 and M10 are still open. It is a design note,
not equations. Choices marked DEFAULT are open for Bryan to overturn; the rulings are numbered in the
DECISIONS.md block "2026-10-18: M11 projects, reports and polish scope (stage 1)". M11 is built last; the
slice plan at the end says which slices can start before M7, M9 and M10 land.

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
    "transport": { "form": { ... }, "method": "groundwater.<id>" },
    "vadose":    { "form": { ... }, "method": "vadose.<id>" },
    "saturated": { ... }, "vapor": { ... }, "surfaceWater": { ... },
    "risk": { ... }, "cleanup": { ... }
  },
  "feeds": {
    "well":   { "source": "transport", "inputsHash": "<hash of the source form>", "value": { ... } },
    "vadose": { ... }, "saturated": { ... }, "bank": { ... }, "vapor": { ... }, "surfaceWater": { ... }
  },
  "data": { "rsl": "rsl-2024-11", "nrwqc": "nrwqc-2026-10-16", "sediment": "sediment-2026-10-16" }
}
```

- **Screen keys hold the screen's own form type unchanged** (strings as typed, so a reload shows exactly
  what the user entered, including invalid text). Each screen exports `toProject()` and `fromProject()`
  beside its `form.ts`; the project module never reaches into a form's fields. Screens added by M7, M9 and
  M10 add keys; an absent key means that screen's defaults.
- **Feeds are stored as values, not recomputed on load (DEFAULT).** A feed is the series the user chose to
  send, and recomputing it could silently change a downstream result. Each feed records the hash of the
  source form it was built from, so on load the receiving screen can say "this feed was built from inputs
  that have since changed" (a warning, never a silent refresh).
- **Validation with zod at the boundary (DEFAULT).** A zod schema per version lives in a new web module
  (`apps/web/src/project/`), not in the engine: the forms are web types. The engine keeps its own SI
  inputs. zod is MIT and small, but it is a new runtime dependency and lands in
  `THIRD_PARTY_LICENSES.md`. Unknown keys are dropped with a warning; a file with a newer `version` than
  the app knows is refused with a clear message, never half loaded.
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
- **Browser storage is a convenience only.** The current project (forms and feeds) autosaves to
  `localStorage` under one versioned key, debounced, wrapped in try and catch; a private window or a full
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

## 5. CSV export per screen

- Each screen gets a "Download CSV" control beside its results. DEFAULT: one CSV per screen holding the main
  results table, plus a separate time series CSV for screens whose result is a series (transport, vadose,
  saturated, surface water, vapor transient).
- Format: RFC 4180, UTF-8 with no BOM (DEFAULT), comma separated, a header row with units in the column
  name (`concentration (mg/L)`), numbers at full double precision (not the rounded display), and no
  metadata rows above the header, so spreadsheets parse it cleanly. A `method` column carries the method
  id on each row; the data edition and app version go in the file name and the report.
- A shared `exportCsv(rows, columns)` helper with escaping tests (quotes, commas, newlines, a leading `=`,
  `+`, `-` or `@` prefixed with a quote to defuse spreadsheet formula injection from chemical names or
  user text).
- Implemented for the transport, vadose, saturated, surface water, vapor, risk and cleanup screens
  (`csv.ts` beside each screen, one `DownloadCsv` control per table). The `method` column carries the
  registered method id; the cleanup screen's direct levels span media with different units, so that table
  carries a `unit` column instead of a unit in the header. Per-chemical charts (risk contributions, the
  modeled metric curve) have their table as a CSV too. The M7, M9 and M10 screens are added in S8.

## 6. Printable report and methods statement

- A `#/report` screen renders the whole project as one HTML document with a print stylesheet; the user
  prints to PDF from the browser. No PDF library (DEFAULT): smaller bundle, selectable text, and the
  browser handles page size.
- Contents: title, saved date and app version; a non-affiliation statement (the existing `NON_AFFILIATION`
  text); for each screen used, its inputs as a table and its results tables and charts; the warnings
  returned by the engine, by code and message; the data editions used; then the methods statement.
- **Methods statement, generated, never hand written.** For each method id actually run (collected from
  results, which carry their method id), it prints the descriptor's `name`, `kind`, `summary`,
  `assumptions` and `risc5Choice`, and a numbered reference list built from `citations` through
  `references.json`, deduplicated across methods. Data sources (RSL, NRWQC, sediment benchmarks, vapor
  data) are cited from their `references.json` entries with the edition string. A test asserts the
  statement for a fixture project contains every cited key and no method that was not run.
- Charts print as inline SVG (they already are SVG), with the data table beside each, so a printout is
  readable in greyscale.
- No author name, address or contact line is printed (DEFAULT); a free-text "prepared by" field the user
  fills is allowed, empty by default. Nothing in the template carries a personal contact address.

## 7. Responsive pass

- Every screen is checked at a true 390x844 viewport through CDP device emulation (not
  `--window-size`): `Emulation.setDeviceMetricsOverride({width: 390, height: 844, deviceScaleFactor: 2,
  mobile: true})`, navigate each hash route, count elements whose `getBoundingClientRect().right` exceeds
  `document.documentElement.clientWidth`; the count must be 0. Tap targets at least 44 px.
- **It lives in the repo (DEFAULT)** as `scripts/mobile-check.mjs`: Node 22 global `fetch` and
  `WebSocket`, no new dependency, launches the installed Chrome headless against `vite preview`, visits
  every route in light and dark (`Emulation.setEmulatedMedia` with `prefers-color-scheme`), prints the
  overflowing selectors and writes screenshots to an ignored folder. Run as `corepack pnpm mobile:check`.
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

## 9. Docs site

- **DEFAULT: no separate generator.** The app already has `#/methods`. M11 adds a `#/docs` reader that
  renders the committed `docs/methods/*.md`, `docs/ATTRIBUTIONS.md` and a short user guide, imported as
  raw text at build time and rendered by a small Markdown subset renderer (headings, lists, code, tables,
  links) with tests, lazy loaded. One site, one deploy, no new hosting.
- The rejected alternative is a second static generator on Pages (another toolchain and build minutes).
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
| S2 | `apps/web/src/project/`: format v1, zod schema, migration runner, `toProject`/`fromProject` for the existing seven screens | S1 | yes; M7, M9, M10 screens add their keys in S8 |
| S3 | Autosave and persisted feeds, "New project" | S2 | yes |
| S4 | File save and open, share link with compression and size limit | S2 | yes |
| S5 | `exportCsv` helper and CSV on the existing screens | none | yes |
| S6 | Methods statement generator and the `#/report` screen with print CSS | S2 | yes for the generator; the report must cover every screen, so it closes after S8 |
| S7 | Bundle splitting and the build-size test | none | yes, but re-measure after M7, M9, M10 |
| S8 | Project keys, CSV and report sections for the M7, M9 and M10 screens | S2, S5, S6, and M7, M9, M10 landed | no |
| S9 | `scripts/mobile-check.mjs` and fixes on every screen | none to write the script | the script yes; the full pass waits for every screen |
| S10 | Accessibility pass (labels test, contrast token test, chart data toggles, keyboard) | none | partly; the final pass waits for every screen |
| S11 | `#/docs` reader and the user guide | none | yes; the guide is finished last |

Order: S1, S5, S7 and the S9 script in parallel; then S2; then S3, S4 and S6 in parallel; S8, the S9 pass,
S10 and S11 close after M7, M9 and M10 land. Each slice is TDD and touches disjoint files except S8 and
the passes, which run alone.
