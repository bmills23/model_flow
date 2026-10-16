# model_flow

Open, web-based fate-and-transport and human health risk modeling for contaminated sites, built to
reach functional parity with RISC5-class tools while letting the user switch each process between the
legacy published method and a modern alternative, with modern visualizations.

Status: milestones M1 (dissolved-phase groundwater transport, 2026-10-15) and M2 (vadose zone
leaching, 2026-10-16) complete, at https://bmills23.github.io/model_flow/ . Milestones M3 to M11 are open. See `docs/ROADMAP.md`
for scope, milestones and the research brief, and `docs/DECISIONS.md` for the decisions behind them.

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
