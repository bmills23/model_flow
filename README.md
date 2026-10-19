# model_flow

Open, web-based fate-and-transport and human health risk modeling for contaminated sites, built to
reach functional parity with RISC5-class tools while letting the user switch each process between the
legacy published method and a modern alternative, with modern visualizations.

Status: milestones M0 to M11 are complete as of the dates in `docs/ROADMAP.md` (M0 to M4 on 2026-10-15
and 2026-10-16, M5, M6 and M8 on 2026-10-17, M7, M9, M10 and M11 on 2026-10-18). Waves G and H (parity gaps and UI near-parity, 2026-10-19) are on main as well; the site
at https://bmills23.github.io/model_flow/ deploys from main.
This is not full RISC5 parity: see line 1 of `docs/ROADMAP.md` for what still separates the two, and the
deferred lists in its section 7 rows and in `docs/HANDOFF.md` (open items). See `docs/ROADMAP.md` for
scope, milestones and the research brief, and `docs/DECISIONS.md` for the decisions behind them.

Screens (hash routes): `#/chemicals` the read-only chemical database browser, `#/site` the advisory site model checklist, `#/transport` groundwater transport, `#/vadose` vadose zone leaching,
`#/saturated` saturated soil source, `#/risk` exposure and risk (with the uncertainty panel), `#/cleanup`
cleanup levels (with the produce and total TPH levels and the probabilistic panel), `#/vapor` vapor intrusion and outdoor air, `#/surface-water`
surface water and sediment, `#/household` shower, irrigation and particulates, `#/plants-eco` plant uptake,
ecological screening and TPH fractions, `#/report` the printable report with the methods statement, charts and on-request uncertainty results, and
`#/docs` the in-app user guide, methods notes and attributions, and `#/methods` the methods and references page. Projects save to a file, a share link or
browser autosave. Each screen has a Help link into the user guide, toxicity values, exposure factors and receptor
names can be overridden per project (never in the master data), and decimal comma entry is an option. The six
numbered steps in the header all link to a screen.

## What it will do

- Fate and transport: vadose zone leaching and volatilization, dissolved-phase groundwater transport,
  saturated soil sources, vapor intrusion (with and without biodegradation), outdoor air, showers and
  sprinklers, particulates, irrigation, surface water and sediment.
- Exposure and risk: the standard direct pathways, carcinogenic risk and hazard index, cumulative and
  additive options, back-calculated cleanup levels, Monte Carlo uncertainty.
- Every process has a method switch: the legacy published method by default, a modern alternative on
  demand, and a comparison overlay. Every result carries the citations of the methods that produced it.
- Everything runs in the browser. No accounts, no server, no data leaves the page.

## Principles

- Clean-room implementation from the primary literature. See `docs/ATTRIBUTIONS.md` for the methods
  and data sources (generated from `packages/engine/src/references/references.json`) and
  `docs/THIRD_PARTY_LICENSES.md` for the software licences (generated from the lockfile).
- Validation against public references only: peer-review verification tables, USGS analytical
  solutions, published tabulated solutions and EPA spreadsheets. Fixtures live in `packages/engine/test`.
- Mobile and desktop friendly, light and dark.

## Non-affiliation

This project is independent. It is not affiliated with, endorsed by, or derived from the software of
Spence Environmental Engineering, BP, or GroundwaterSoftware.com. "RISC" and "BP RISC" are their marks.
The models implemented here are the published methods cited in `docs/ATTRIBUTIONS.md`.

## Development

Requires Node 24 and pnpm (pinned through `packageManager`; `corepack pnpm` works without a global
install).

```
corepack pnpm install
corepack pnpm gate      # lint, format check, typecheck, tests, docs generation, build
corepack pnpm --filter @model-flow/web dev
```

Layout: `packages/engine` (the science, pure TypeScript), `packages/data` (document and database
build scripts), `apps/web` (Vite + React static site, deployed to GitHub Pages).

## Licence

MIT. See `LICENSE`.
