> Status: M0 to M11 are all DONE as of 2026-10-18 (M0 to M4 2026-10-15 to 2026-10-16, M5, M6 and M8 2026-10-17, M7, M9, M10 and M11 2026-10-18). Every screen listed in the README exists. This is not full RISC5 parity. What still separates the app from it: (1) several inputs and constants are unverified or user-entered because no primary source could be read (Foster and Chrostowski film references and the household factor K, Little 1992 equations, the leaf-air partition coefficient (the Briggs 1982 constants were read against the paper in wave N and match; the engine drops the paper's 0.82 term above log Kow 2, as HHRAP does), the Trapp 2015 modern plant model replaced by HHRAP 2005); (2) RISC5 Appendix K (oxygen-limited vapor model) is not implemented, and Tables R-2, R-6 and the R-9 shower rows do not reproduce (R-2 is a smoke test, R-6 and R-9 shower are named exceptions); (3) the cleanup screen and the report now offer source levels behind the indoor, outdoor, shower, sprinkler, particulate and surface water air and water levels (wave K, 2026-10-21: household, vapor and surface water panels on `#/cleanup`, printed in the report and written to the cleanup CSV, each the direct level over the run's linear coefficient, with a path that is not linear shown as not quantified with its reason), plus the homegrown produce level and the TPHCWG and MADEP total TPH levels (wave G, 2026-10-19); what still separates the cleanup screen from RISC5 is that these are not solved through the full vapor or surface water chain as modeled-source targets (a nonlinear path, a soil source past its residual phase or a surface water run with an upstream background is not quantified), and that the MacDonald et al. 2000 sediment values and the ORNL wildlife benchmark table are not shipped (the Eco-SSL wildlife surrogate rows are on `#/plants-eco` since wave H); (4) uncertainty covers declared exposure and method inputs and, since wave I, modeled cleanup sources (a bounded sampled run on `#/cleanup`), and the report draws the plume map since wave I and prints the modeled-source result kept from the cleanup screen since wave J (charts and on-request uncertainty results landed in wave G); (5) the RSL, VISL and Region 4 values have not been checked against the RISC5 outputs themselves (no licence; since wave M the evidence that does exist is listed in `docs/VALIDATION.md` and on `#/validation`). The user interface reached near-parity with the manual's workflow in wave H (2026-10-19, branch `wave-ui`, slices U1 to U10; plan `docs/UI_PARITY.md`); a project chemical list with per-chemical fate runs, user-defined chemicals and a surface water cleanup target landed in waves N to P (2026-10-21); what stays deferred is a reusable cross-project chemical or receptor library. Milestone statuses are maintained in place in section 7; a status here is a claim, grep the tree before trusting it.

# model_flow: open, web-based reimplementation of RISC5-class risk and fate-and-transport modeling

Plan written 2026-10-15 and copied into the repo as `docs/ROADMAP.md` in the first implementation
session.

## 1. Context

- **Repo:** https://github.com/bmills23/model_flow (MIT, public, Bryan's own). Two commits (Dec 2024), one
  file: `index.py`, a 365-line tkinter form shell whose field names mirror RISC's input screens (lens,
  unsaturated source, van Genuchten n, receptor well screen, "0 for code calculated" dispersivities). It
  computes nothing. Nothing is reusable except the parameter vocabulary, which the manual supersedes.
- **Target:** RISC5 (Risk-Integrated Software for Cleanups v5, formerly "BP RISC"), Lynn Spence (Spence
  Environmental Engineering) and Terry Walden (BP). Sold by GroundwaterSoftware.com for $875, Windows
  only, VB.NET interface + FORTRAN compute + Excel macros for output, licence keys expire after 5 years.
  ~1000 users; Colorado's Oil Inspection Section (now CDLE Division of Oil and Public Safety) used it to
  check every submitted petroleum-site risk assessment (manual, 2011).
- **Primary source in hand:** `~/Downloads/RISC5 Users Guide -- Nov 2014 (2).pdf` (302 pp, June 2011,
  appendices updated March 2013). Text extracted locally with `pdftotext -layout` (13,185 lines; line index of appendices in section 3
  below). Re-extract with `pdftotext -layout` when needed. The RISC4 manual (Oct 2001, same authors) is public on ISPRA's site
  (`isprambiente.gov.it/contentfiles/00002500/2516-c2179-risc4-manual.pdf`) as a second reference.
- **Why this is feasible and legal:** the manual states that "all fate and transport models are externally
  developed" and documents every equation with its literature source. This is a clean-room
  reimplementation of published science, not binary reverse engineering. Nobody has shipped an open-source
  RBCA/HHRA tool with embedded fate-and-transport models (searched 2026-10-15; closest: mibitrans,
  Apache-2.0, groundwater transport only). That gap is the project's reason to exist.

## 2. Decisions made (Bryan, 2026-10-15)

| Question | Decision | Consequence |
|---|---|---|
| Revenue vs personal | Personal, open source, free | $0 hosting (GitHub Pages), local gates before any push, minimal CI, no cloud fleets, cheap models for mechanical work |
| Scope | Full RISC5 parity (long-run) | Multi-month roadmap, decomposed into 12 milestones; each ships a usable increment |
| Validation | Manual + public references (no RISC5 licence) | Fixtures from Appendix R peer-review tables, USGS ANALGWST, van Genuchten & Alves tables, EPA spreadsheets, mibitrans cross-checks |
| Architecture | TypeScript engine + static SPA | Compute in browser (Web Worker), no backend, Python shell retired |
| Methods | RISC5 legacy methods by default, **per-process switch to modern methods**, plus modern visualizations | "Method registry" is the central engine abstraction; comparison overlays are a headline feature |
| Attribution | Thorough scientific references for legacy and modern methods, **separate from third-party software licences** | `docs/ATTRIBUTIONS.md` (science + data provenance) and `docs/THIRD_PARTY_LICENSES.md` (software), both generated from one source of truth, plus an in-app Methods & References page |

Assumptions (state them in the repo README; change only if Bryan says so):
- Licence stays MIT. Therefore no GPL code is vendored (HYDRUS-1D source is GPLv3: use the papers, not
  the code). Public-domain US-government code (USGS, EPA) may be used for fixtures and may be ported.
- The product will not be called "RISC" or any variant; the repo name `model_flow` stays until Bryan picks
  a product name. README carries a non-affiliation notice (not affiliated with or endorsed by Spence
  Environmental Engineering, BP, or GroundwaterSoftware.com; RISC is their mark).
- This is Bryan's personal project: no CDPHE time, resources, or implied endorsement. Public contact goes
  through a project or LLC address per the global contact-info rule, never the personal Gmail.
- We never decompile or inspect the RISC5 binary, and we never copy manual prose, figures, or database
  tables into the repo. Equations and the peer review's numeric results are facts and are fair to use.

## 3. RISC5 model inventory (from the manual) and the modern alternative for each

Line numbers refer to the extracted text file. "Legacy" is what RISC5 does; "Modern" is the switchable
alternative this project adds. Every row becomes an entry in the method registry and in ATTRIBUTIONS.

| App. (lines) | Model | Legacy method and primary sources | Modern alternative(s) to offer |
|---|---|---|---|
| A (3245-4049) | Vadose zone leaching + volatilization | VADSAT-type compartmental model (Ünlü et al. 1992): 1-D ADE solved per van Genuchten & Alves 1982 (eq. A-5..A-7) with exponentially depleting well-mixed source (A-20..A-24), Raoult's law effective solubility, Fick's-law pseudo-steady volatilization through an optional lens, Millington-Quirk 1961 diffusion, unit-gradient Brooks-Corey 1964 k(θ) with Lenhard et al. 1989 n-to-λ conversion, Gelhar et al. 1985 dispersivity regression (A-33) | (1) van Genuchten-Mualem 1980 k(θ) used directly from n (consistent with the input); (2) EPA Soil Screening Guidance 1996/2002 leaching with dilution attenuation factor, as a regulatory screening option; (3) multi-layer vadose profile (not just one lens); (4) later: 1-D Richards-equation numerical column (HYDRUS-1D-class, reimplemented from Celia et al. 1990, not vendored); (5) Jury et al. 1983 behaviour-assessment volatilization |
| B (4050-4482) | Dissolved-phase groundwater transport | AT123D (Yeh 1981, ORNL-5602) Green's-function solution of 3-D ADE with first-order decay, 1-D flow, infinite width/depth, finite rectangular volume source (Galya 1987; note, verified 2026-10-15: Galya's published paper is a horizontal plane-source model, and our box form derives from Yeh 1981's Green's function, see docs/methods/groundwater-transport.md), concentration input converted to mass loading (B-9), time-varying pulse source, well-screen vertical averaging with half-weight end points (B-8), Gelhar 1985 longitudinal regression (B-6) and API 1987 ratios αy = αx/3, αz = αy/87 (B-7) | (1) Wexler 1992 exact solutions (USGS TWRI 3-B7; PATCHI infinite aquifer, PATCHF finite thickness with no-flux base); (2) Domenico 1987 approximation offered only as a "BIOSCREEN/RBCA-compatible" comparison mode with the West et al. 2007 / Guyonnet & Neville 2004 / Srinivasan et al. 2007 error warnings shown; (3) sequential first-order decay chains (Srinivasan & Clement 2008; BIOCHLOR/REMChlor lineage) for chlorinated solvents; (4) power-law depleting source (Falta et al. 2005; REMChlor) and instantaneous-reaction / electron-acceptor-limited biodegradation (BIOSCREEN, Newell et al. 1996); (5) dispersivity by Xu & Eckstein 1995 or Schulze-Makuch 2005 scale laws, αy = αx/10, αz = αx/100 (EPA BIOSCREEN defaults) |
| C (4483-4806) | Saturated soil source | Source model (total soil conc., Raoult's law, equilibrium partitioning C-2a, two regions: infiltration-leached above water table, advection-flushed below, water-table fluctuation fraction) feeding the Appendix B transport model | Same transport switches as B; add mass-balance-consistent exponential source decline instead of constant-until-exhausted step |
| D (4807-5235) | Johnson & Ettinger indoor air, no degradation | J&E 1991 steady-state; Jury et al. 1983/84/90 source; Millington-Quirk; lens + foundation layers | EPA 2004 J&E spreadsheet formulation (soil-gas advection Qsoil, capillary fringe, finite source); EPA 2015 OSWER VI Technical Guide empirical attenuation factors (VISL defaults: groundwater 0.001, sub-slab/soil gas 0.03; confirm current values at build); Yao, Pennell & Suuberg 2011 and Yao et al. 2013 comparisons for applicability warnings |
| E (5236-5419) | Vapor from groundwater into buildings | ASTM E1739-95 RBCA formulation with capillary fringe, Brooks-Corey/Lenhard moisture | Same as D; add EPA 2004 groundwater-source J&E variant |
| F (5420-5565) | Outdoor air box model | Box model (breathing-zone, wind speed, box height) fed by D/E/J/K emissions | EPA SSG 1996 volatilization factor with Q/C dispersion term (Cowherd-based), for regulatory consistency |
| G (5566-5909) | Shower and sprinkler volatilization | Foster & Chrostowski 1986 two-resistance model | Little 1992 mass-transfer formulation; EPA 2011 Exposure Factors Handbook durations |
| H (5910-6034) | Particulate (dust) emissions | EPA SSG 1996 PEF (Cowherd et al. 1985 via EQ 1994), ASTM E1739 | EPA 2002 Supplemental SSG site-specific PEF with Q/C by climatic zone; RSL calculator PEF |
| I (6035-6096) | Irrigation water pathways | Walden & Spence 1997 | Keep; parameterize with EPA 2011 EFH values |
| J (6097-6833) | Vapor transport with degradation, dominant layer | Johnson, Kemblowski & Johnson 1998 (API 4674), 3-layer | DeVaull 2007 analytical oxygen-limited layer model (basis of API BioVapor 2010); EPA PVIScreen 2017/18 Monte Carlo wrapper concept |
| K (6834-7605) | Vapor transport with degradation, oxygen-limited | Johnson 1998 (draft) oxygen-limited screening model; **never independently validated** (App. R) | DeVaull 2007 / BioVapor steady-state 1-D with oxygen balance; EPA 2015 PVI Technical Guide vertical-separation screening (Lahvis et al.; ~6-15 ft) as a screening pre-check |
| L (7606-8168) | Surface water mixing + sediment partitioning | River and lake mass-balance dilution, Domenico 1987 plume term, Koc sediment partitioning | Keep; add first-order in-stream decay and EPA NRWQC comparison |
| M, N (8169-8718) | Aquatic-life and sediment criteria databases | International criteria compilation | Rebuild from public sources only: EPA NRWQC, MacDonald et al. 2000 consensus TEC/PEC, EPA Region 4 2018 sediment screening values (NOAA withdrew SQuiRTs on 2024-04-04; a cross-check only, see DECISIONS.md M8 block); international criteria added later only from redistributable sources |
| O (8719-9655) | Vegetable uptake | Trapp & Matthies 1995 (RISC5), Briggs et al. 1982 RCF/TSCF | Trapp 2015 dynamic plant uptake (not verified in M9, not shipped); EPA 2005 HHRAP produce equations (shipped as the modern method) |
| P (9656-12138) | Screening ecological risk (food web) | Hazard quotients vs. benchmarks | EPA Eco-SSLs (2003-2007), Sample et al. 1996 ORNL wildlife benchmarks |
| Q (12139-12362) | TPH fraction cleanup levels | TPHCWG fraction approach | Keep; cite TPHCWG 1997-1999 volumes and MADEP 2002 |
| Ch. 7-8 (2409-2530) | Exposure, risk, back-calculation | RAGS Part A 1989 intake equations, dose-based inhalation via conversion factors, secant-method back-calculation with individual vs cumulative rules, 17 pathways | RAGS Part F 2009 concentration-based inhalation (IUR, RfC); RAGS Part E 2004 dermal (Kp, τ, B event model); OSWER 9200.1-120 (2014) default exposure factors; EPA 2005 age-dependent adjustment factors for mutagenic carcinogens; Brent's method for back-calculation (robust; identical answers where the secant converges) |
| Ch. 10 | Chemical + toxicity database (128 chemicals) | IRIS/HEAST/NCEA-era values | EPA RSL tables (semiannual, public domain; toxicity hierarchy IRIS > PPRTV > ATSDR > Cal-EPA > HEAST) and the RSL chemical-specific parameters table (Koc, H, S, D_air, D_water with per-value source tags); EPA CompTox Dashboard for gaps. Every value carries a source tag |
| Monte Carlo (App. R.7.2) | Exposure-parameter Monte Carlo only | Simple random sampling | Latin hypercube (McKay et al. 1979) with Iman & Conover 1982 rank correlation; sampling over fate-and-transport parameters too (as PVIScreen does); Sobol/Saltelli global sensitivity indices and Morris screening; seeded, reproducible runs; EPA 1997 Monte Carlo guiding principles and RAGS Vol. 3 Part A 2001 |

## 4. Legal, positioning, attribution

- **Clean room.** Implement each model from its primary paper or agency report. Use the manual as the
  map of RISC5's choices (which boundary conditions, which regressions, which defaults), and record each
  such choice in the method's registry metadata as "RISC5 choice: ...". No manual text in the repo.
- **Two documents, one source of truth.** `packages/engine/src/references/references.json` holds every citation (authors, year,
  title, venue, DOI/URL, type: method | data | review). It generates:
  - `docs/ATTRIBUTIONS.md`: methods by process (legacy and modern side by side), data provenance
    (EPA RSL edition and date, IRIS, CompTox, USGS ANALGWST, Appendix R review as fixture source), and the
    lineage statement about RISC/BP.
  - `docs/THIRD_PARTY_LICENSES.md`: software only (npm dependencies via `pnpm licenses list`, any ported
    public-domain code with its notice, mibitrans named only as a validation tool if used).
  - The in-app **Methods & References** page and the per-run **methods statement** (every result export
    lists the methods used and their citations, so a report reader can see exactly what was computed).
- Each method implementation declares `citations: string[]` keys that must exist in `references.json`;
  tests fail the build if a method lacks a citation, cites a reference not marked `used`, or a `used`
  reference is cited by nothing. A reference may be marked `used` only with its verified published
  title; square-bracketed descriptor titles are allowed for `planned` references only (enforced by test).
- The generated documents are committed. `pnpm docs:check` (part of the gate) regenerates them and fails on
  drift. Their "Generated" date moves only when content changes (`packages/data/src/stable.ts`).

## 5. Architecture

```
model_flow/                      pnpm workspaces, Node 22, TypeScript strict
  packages/engine/               pure TS, no DOM: the science
    src/numerics/                erf/erfc/erfcx (@stdlib, Apache-2.0), adaptive Gauss-Kronrod + tanh-sinh
                                 quadrature, Brent + secant root finders, seeded PRNG (xoshiro128**),
                                 LHS + Sobol sampling, unit conversion (SI internally, RISC units at the edge)
    src/registry/                MethodRegistry: {id, process, kind: 'legacy'|'modern', citations[],
                                 assumptions[], validityChecks(), run()} ; scenario picks one per process
    src/processes/               vadose/, groundwater/, saturatedSource/, vapor/, outdoorAir/, shower/,
                                 particulate/, irrigation/, household/, surfaceWater/, plantUptake/, eco/, tph/,
                                 exposure/, risk/, cleanup/ (back-calculation), uncertainty/ (Monte Carlo)
    src/chemistry/               partitioning, Raoult's law, Millington-Quirk, retardation, dispersivity laws
    src/schema/                  zod schemas: Scenario (versioned), Chemical, Receptor, Results
    test/fixtures/               Appendix R tables, ANALGWST outputs, vG&A tables, EPA spreadsheet cases
  packages/data/                 build scripts: EPA RSL xlsx -> chemicals.json + tox.json with source tags;
                                 references.json -> ATTRIBUTIONS.md; pnpm licenses -> THIRD_PARTY_LICENSES.md
  apps/web/                      Vite + React + TypeScript static SPA; engine runs in a Web Worker
    Steps mirror RISC's six-step flow (chemicals -> conceptual site model -> transport -> receptors ->
    risk / cleanup levels -> results) as a responsive wizard; method switch per process with
    "RISC5 compatibility" and "All modern" presets and a side-by-side comparison mode
    Visualizations: plan-view plume heatmap/contours (d3-contour), vertical cross-section, concentration vs
    time and vs distance, vadose depth profiles, time animation, Monte Carlo percentile fans and CDFs,
    tornado / Sobol bars, risk contribution by pathway and chemical, legacy-vs-modern overlays.
    Chart library chosen at M1 after loading the dataviz skill (constraints: light/dark, mobile, small bundle;
    candidates Observable Plot + d3, or ECharts)
    Projects: JSON file download/upload + shareable URL (lz-string compressed scenario in the hash); no backend
    Exports: CSV, printable HTML report (browser print to PDF) with methods statement
  docs/                          ROADMAP.md (this plan), ATTRIBUTIONS.md, THIRD_PARTY_LICENSES.md,
                                 DECISIONS.md, methods/<process>.md (equations as implemented, in our words)
  .github/workflows/ci.yml       push to main + PRs: install, lint, typecheck, vitest, build (~2-3 min);
                                 paths-ignore docs/** and **/*.md; concurrency cancel-in-progress
  .github/workflows/pages.yml    deploy apps/web to GitHub Pages on main only
```

Engine rules: every process exposes the same `run(scenario, chemical, method) -> Result` shape with time
series and spatial fields; results carry the method id so the UI and exports can attribute them. Numerics
are tested in isolation against known values (erf tables, quadrature of known integrals). All randomness is
seeded. Validity checks (e.g. Domenico's x/αx and t·v/αx conditions, J&E applicability) produce warnings
attached to results, never silent clamps, except where RISC5 clamps and the legacy method must match
(then the clamp is logged in the result).

## 6. Validation strategy (no RISC5 licence)

| Fixture source | What it validates | Where |
|---|---|---|
| Appendix R, Arcadis 2001 review (lines 12717-13185) | Tables R-3 (J&E, two cases), R-4 (dominant layer), R-5 (GW to indoor), R-6 (GW to outdoor), R-7 (vadose leaching: 224 mg/L at source, 10.8-11.0 mg/L at water table at 10 yr), R-8 (river and lake mixing), R-9 (direct pathways CDI/risk/HI for As, benzene, BaP, TPH aliphatic C12-C16), R-2 (Monte Carlo percentiles vs Crystal Ball; no input distributions given, so a smoke test only, M10 ruling 12) | Encoded as JSON fixtures with citation; tolerance 2-3% (the review's own erf approximation error) |
| USGS ANALGWST v1.1 (Wexler 1992; PATCHI, PATCHF, POINT3; public domain, Fortran) | Appendix B/C transport kernel and the modern Wexler option; compile with gfortran locally, generate reference CSVs, commit them with the input decks | `packages/engine/test/fixtures/analgwst/` |
| van Genuchten & Alves 1982 (USDA TB-1661) tabulated solutions | 1-D ADE kernel of Appendix A | hand-entered table values |
| EPA J&E spreadsheets (2004) and VISL calculator, EPA BIOSCREEN example | Appendix D/E and the Domenico comparison mode | run spreadsheets once, record inputs and outputs |
| mibitrans (Apache-2.0, Python) | Cross-check of 3-D ADE results for identical inputs | throwaway Python env, outputs recorded as fixtures, package not vendored |
| Manual worked example, Appendix J (lines 6349-6600, BP Paulsboro 1997 data) | Dominant layer model | fixture |
| Mass-balance invariants | Depleting sources conserve mass; symmetric sources give symmetric plumes; zero-decay limits | property tests |

## 7. Milestones

Each milestone: write the methods note (equations in our words, citations) -> TDD the engine (fixtures
first) -> UI step and visualization -> ATTRIBUTIONS and references updated -> local gate green once on the
integrated tree (lint, typecheck, full vitest, build, full mobile viewport check; cadence in CLAUDE.md) -> one push. Record per-push CI minutes in the repo instructions file
after the first run.

- **M0 Foundation (first session). DONE 2026-10-15.** Clone to `~/repos/model_flow`; copy this plan to `docs/ROADMAP.md`;
  retire `index.py` (keep its parameter lists in `docs/methods/risc5-parameter-map.md`); pnpm monorepo,
  engine + web + data packages, lint/typecheck/vitest, CI and Pages workflows; numerics kernel with tests;
  `references.json` seeded with every citation in section 3; ATTRIBUTIONS and THIRD_PARTY_LICENSES
  generators; README with scope, non-affiliation notice, licence; DECISIONS.md with the section 2 table.
- **M1 Groundwater transport (App. B). DONE 2026-10-15** (Schulze-Makuch coefficients from a secondary
  source, see DECISIONS.md). AT123D-equivalent kernel (legacy), Wexler PATCHI/PATCHF (modern),
  Domenico comparison mode with validity warnings, dispersivity laws (Gelhar 1985 + API ratios legacy;
  Xu & Eckstein / Schulze-Makuch modern), well-screen averaging, pulse and time-varying sources. ANALGWST
  and mibitrans fixtures. First UI: scenario form, plan-view plume map, breakthrough curve, legacy-vs-modern
  overlay. Deploy to Pages: first public version.
- **M2 Vadose leaching (App. A). DONE 2026-10-16** (scope, fixture rulings and the M1 no-flux water-table
  default in DECISIONS.md; SSG/DAF leaching moved to M5, Jury 1983 volatilization to M6, the Richards
  column after M2). VADSAT-type legacy model with lens and Raoult's law; modern k(θ) and
  multi-layer options; coupling of leachate flux into M1 as time-varying source. Table R-7 fixture, vG&A
  tables. Depth-profile and source-depletion charts.
- **M3 Saturated soil source (App. C). DONE 2026-10-16** (scope, default rulings, fixtures and the
  seasonal step-cap ruling in DECISIONS.md; the general power-law source exponent and the mixture-wide
  residual test deferred, region 1 volatilization to M6, cleanup back-calculation to M5). Two-region
  source with water-table fluctuation; feeds M1.
- **M4 Chemical and toxicity database + direct exposure and forward risk (Ch. 3, 6, 7). DONE 2026-10-16** (rulings in the DECISIONS.md M4 block; methods note `docs/methods/exposure-and-risk.md`). RSL November 2024 database with source tags; the nine direct pathways in legacy and modern variants; carcinogenic risk and hazard index; two receptors with additivity rules; the risk contribution charts. Deferred: target-organ segregation of the hazard index, CompTox gap filling (ruling 10), series EPCs on soil pathways.
- **M5 Cleanup levels (Ch. 8). DONE 2026-10-17** (rulings in the DECISIONS.md M5 block; methods note `docs/methods/cleanup-levels.md`). Closed-form back-calculation for the nine direct pathways (legacy RAGS A 1989 and modern RAGS E/F 2014), Brent-solved cleanup levels for the M1, M2 and M3 modeled chains through the receptor well, individual, cumulative and equal allocation, MCL and user targets, and the Soil Screening Guidance 1996/2002 soil-to-groundwater level with a dilution attenuation factor (moved here from M2); screen at `#/cleanup`. Deferred: vapor pathway chains as modeled targets, shower inhalation from tap water, particulates and irrigation (M7), surface water as a target medium, probabilistic levels (M10), target-organ segregation of the hazard index, pH-dependent Kd and Koc.
- **M6 Vapor models (App. D, E, J, K, F). DONE 2026-10-17** (rulings in the DECISIONS.md M6 block and its web slices block; methods note `docs/methods/vapor-models.md`). Legacy Johnson and Ettinger for soil, soil gas and groundwater sources, the legacy dominant-layer model, the outdoor air box, the modern EPA J&E (2004 equations, 2017 defaults), DeVaull 2007, the EPA 2015 attenuation factors and PVI vertical-separation screen, the Soil Screening Guidance volatilization factor, and Jury behaviour-assessment volatilization (moved here from M2); screen at `#/vapor`. Tables R-3, R-4 and R-5 reproduce; Table R-6 is a named exception. Deferred: the legacy oxygen-limited model (Appendix K, only source an unpublished draft; DeVaull 2007 is the modern alternative), PVIScreen sampling (M10), Jury with nonzero water flux, vapor cleanup levels (the M5 follow-up), lateral offsets and three-dimensional models.
- **M7 Shower, irrigation, particulates (App. G, H, I). DONE 2026-10-18** (rulings in the DECISIONS.md M7 blocks, stage 1 and slices E1, E2, E4, W1 and W2; methods note `docs/methods/shower-irrigation-particulates.md`). Legacy stagnant-stall shower and sprinkler volatilization (one shared two-resistance droplet kernel), Little 1992 stall back-pressure, the RSL whole-house term, the irrigation pathways and the M9 irrigation interface, and the legacy particulate box emission with the SSG 1996 and 2002 PEF; every method is linear and gets M5 cleanup levels as the target over the coefficient; screen at `#/household`, with feeds to the risk and cleanup screens. Deferred: Foster and Chrostowski 1986 has no confirmed published record and the film reference coefficients (3000 and 20 cm/h) ship as warned defaults; the Little 1992 full text was not read (limit identities only, no printed fixtures); the household factor K is unverified, so it is a required input and no RSL tap water level is reproduced; no Walden and Spence or EFH irrigation factors (all are inputs); the Table R-9 shower rows are a named exception; F(x) is entered, not computed; construction-phase PEFs, multi-zone house models, gas-phase dermal uptake, an irrigation contact pathway in M4.
- **M8 Surface water and sediment (App. L, M, N). DONE 2026-10-17** (rulings in the DECISIONS.md M8 block; methods note `docs/methods/surface-water.md`). Legacy well-mixed river and lake box with Darcy discharge, modern bank-plane mass discharge, transient box, downstream decay and selectable pore water sediment; comparison against EPA national recommended water quality criteria and EPA Region 4 2018 sediment benchmarks, both built from committed public sources; a surface water series feeds the M4 swimming pathways; screen at `#/surface-water`. Table R-8 reproduces. Deferred: the MacDonald et al. 2000 TEC and PEC (not shipped, values unverified), two-dimensional river mixing, estuaries, site-chemistry criteria (copper BLM, aluminum, ammonia, selenium), international criteria, equilibrium partitioning sediment benchmarks and marine ERL and ERM, human contact with sediment, fish ingestion.
- **M9 Plant uptake and ecological screening (App. O, P, Q). DONE 2026-10-18** (rulings in the DECISIONS.md M9 block, its slice E1, E2, E3 and E4 blocks and the M9 review fixes; methods note `docs/methods/plants-and-eco.md`). Trapp and Matthies 1995 with Briggs 1982 factors against the EPA 2005 HHRAP produce equations, a homegrown produce pathway in M4 and closed form in M5, Eco-SSL plant, invertebrate and wildlife hazard quotients (screening only) and a user-benchmark screen, and TPHCWG and MADEP fraction sets with a total-TPH level; Eco-SSL data built from hand-entered, page-cited values (`packages/data/generated/ecossl-2026-10-18/`); screen at `#/plants-eco`, produce also on the risk screen. Deferred: Trapp 2015 could not be identified or read, so the modern method is the HHRAP 2005 fallback (DEFAULT ruling 11, Bryan has not reviewed it); TSCF and the leaf-air partition coefficient are required inputs; produce does not apply to modeled sources and a TPH cancer endpoint is an open question (the produce and TPH total levels themselves landed in wave G); the Eco-SSL wildlife surrogate rows were wired to `#/plants-eco` as an editable dose panel in wave H (U9; the ORNL benchmark tables stay unshipped); ionizable organics, meat and milk, time-dependent plants inside the Brent chain, aquatic food webs, the ORNL benchmark tables, PAH group membership.
- **M10 Uncertainty (Monte Carlo). DONE 2026-10-18** (slices E1 to E8 and W1 to W4; methods note `docs/methods/uncertainty.md`, DECISIONS.md "M10 uncertainty scope (stage 1)" block and its slice entries). Legacy exposure-only simple random sampling (`uncertainty.srs-exposure`) vs modern LHS with Iman-Conover rank correlation (`uncertainty.lhs-ic`), Sobol first order and total indices with bootstrap intervals (`uncertainty.sobol-saltelli`), tornado and Spearman, probabilistic cleanup levels (`uncertainty.cleanup-probabilistic`), worker pool with a run budget; uncertainty panel on the exposure screen and probabilistic cleanup panel on `#/cleanup`. Table R-2 is a smoke test only (ruling 12: no input distributions are given or yet sourced). Registry coverage is complete for the transport, vapor, surface water, shower, irrigation, particulate, plant uptake, eco and TPH methods (E7, E8). Modeled cleanup sources are sampled since wave I (slice I6: each draw is a full solve on the worker pool, default 200 iterations); deferred: modeled-source uncertainty is not repeated in the report; the modern exposure method declares no uncertain inputs; the percentile fan is built but not mounted (no time series output on a screen yet); Morris screening, quasi-random Sobol base sequences, two-dimensional Monte Carlo, distribution fitting and an Exposure Factors Handbook distribution library, sampling of toxicity values.
- **M11 Projects, reports, polish. DONE 2026-10-18** (slices S1 to S11 on the wave branch; rulings in the DECISIONS.md M11 blocks; methods note `docs/methods/projects-and-reports.md`). Versioned project file with save, open, share link (8000 character limit) and autosave with persisted feeds, CSV per screen, the `#/report` printable report with a generated methods statement, per-screen result tables and engine warnings, the committed `scripts/mobile-check.mjs` (zero overflow at 390x844 light and dark and at 1280 on every route), the accessibility pass (labels test, contrast token test, data tables on the charts, skip link, focus ring), a build-size test, and the `#/docs` reader over `docs/USER_GUIDE.md`, the attributions and the methods notes. Deferred: the report omits a modeled cleanup source and its uncertainty run (needs the chain sent again; the household source levels panel reached the report in wave K) (charts, data tables and the on-request uncertainty re-run from the saved setup and seed landed in wave G; the plume map in the report landed in wave I); chart SVG arrow-key navigation was walked in wave I (the axe-core pass and per-screen keyboard order tests landed in wave G); the cross-section figure and the distribution preview have no separate data table; the close-tab warning for unsaved changes landed in wave I; named projects, cloud or gist sharing, a PDF library, RISC5 project import, comparing two saved projects, offline install, translation and a mobile check in CI.
- **Wave G parity gaps. DONE 2026-10-19** (branch `wave-gaps`; rulings in the DECISIONS.md G1 to G4 blocks, DEFAULT where marked). Cleanup: the homegrown produce level (not applied to modeled sources, DEFAULT) and the TPHCWG and MADEP total TPH levels are on `#/cleanup` with CSV, project and report support. Report: `#/report` draws each screen's main charts with data tables and has an on-request "Include uncertainty results" control that re-runs from the saved setup and seed (plume map excluded, DEFAULT; overturned in wave I, the plume map is now in the report); only the exposure sample runs in the background and can be cancelled. Accessibility: `scripts/mobile-check.mjs` runs axe-core (dev dependency, MPL-2.0) on every route at 390 light, 390 dark and 1280, including the fed cleanup screen, and per-screen keyboard-order tests exist. Surface water performance: the bank-plane integral got a tail tolerance and remembered axis factors (a 2000 m linked run 178 s to 2.0 s in Node, browser time not re-measured; `compute.test.ts` 205 s to 11.7 s). Generated `.vitest` output is ignored. Still open after wave I: produce on modeled sources (kept off, DEFAULT) and the TPH cancer endpoint question (ruled none, DEFAULT); the plume map in the report and chart SVG arrow-key navigation landed in wave I (the UI near-parity wave followed as wave H).
- **Wave H UI near-parity. DONE 2026-10-19** (branch `wave-ui`, merged to main and pushed 2026-10-19; plan `docs/UI_PARITY.md`, feature map `docs/RISC5_UI_INVENTORY.md`; Bryan's scope calls in the DECISIONS.md "Wave H UI near-parity scope" block, slice rulings in the DECISIONS.md "Wave H slice" blocks, DEFAULT where marked). All ten slices landed: working six-step bar with every step a link, and the home page (U1); advisory site model screen at `#/site`, which lists the screens to visit and the feed button on each and locks nothing (U2); read-only chemical database browser at `#/chemicals` with sources and CSV (U3); per-project toxicity overrides on the risk and cleanup chemical cards (U4); per-project exposure factors and receptor names (U5); a Help link per screen into its user guide section (U6); soil texture presets on the vadose and saturated screens (U7); fill chemical properties from the database on the transport, vadose and saturated screens, with transport Kd = Koc x foc as a DEFAULT mapping (U8); a site-specific wildlife dose panel on `#/plants-eco` (U9); decimal comma entry, off by default and per browser (U10). Corrective fixes landed with it: feed fingerprints ignore the keys added in this wave so older project files are not flagged stale, a rejected decimal entry is never saved, a chemical with no Koc leaves the transport retardation unchanged, the ecological checklist only names controls that exist and refuses non-soil sources, and the built chemical JSON ships minified under a 700 kB cap. Still deferred: a reusable chemical or receptor library (ruled out; edits are per project only) and multi-chemical fate runs (deferred by Bryan to a design session); user-defined chemicals as project entries and RISC5 project import are not built (the close-tab warning landed in wave I).
- **Wave I. DONE 2026-10-19** (branch `wave-i`, merged to main and pushed 2026-10-19; Bryan delegated the scope with "whatever you recommend", so every ruling is DEFAULT (delegated) in the DECISIONS.md "Wave I scope" block and the "Wave I slice" blocks). The wave H open questions were answered the same way (Kd = Koc x foc stays, wildlife flag, soil-only checklist, per-project edits, produce off for modeled sources, no TPH cancer endpoint). Six slices: I1 plume map in the report (printed table thinned to 20 rows, no plume grid in the CSV); I2 wildlife reproduction flag ("Not reproduced within 5 percent", yes or no CSV column); I3 close-tab warning for unsaved changes (a restored autosave counted as unsaved, reversed in wave J); I4 arrow-key walk over every chart (breakthrough curves and plume map fixed, key hint in all six focusable chart names); I5 transport charts sized from the content box (fixes the roughly 7 percent undersize); I6 uncertainty sampling of modeled cleanup sources (worker pool, default 200 iterations, small-sample-tail warning, saved under a `modeled` key). Review fixes landed with it (table header styling, no flag without a back-calculated level, methods statement for the modeled run, real two-worker tests, plume cell reset). Wave J closed the open items about a plume CSV and modeled-source uncertainty in the report; the wave G and H deferred lists were not touched.
- **Wave J. DONE 2026-10-19, merged to main and pushed 2026-10-21** (branch `wave-j`; Bryan directed "do 1, 2 and 3 as one wave", rulings in the DECISIONS.md "Wave J scope" block and its slice blocks). J1 plume grid CSV under the plume map on `#/transport` (long format, one row per cell, the time shown on the map); J2 the report prints the modeled-source uncertainty result kept from the cleanup screen this session, or says it is out of date or not yet run (not saved with the project); J3 a restored autosave no longer prompts on reload until an edit follows (Bryan's decision, overturns the I3 DEFAULT); J4 test time: engine suite 41 s to 21 s and web suite 128 s to 40 s locally (cached time integrals and step responses in the cleanup level searches, split test files, no per-file setup or jsdom for files that do not need them); J5 `m1-groundwater-ui` and `ui-u9-wildlife` checked against main and deleted. CI cost per push re-measured 2026-10-21 after the push: about 6 billed minutes (CLAUDE.md).
- **Wave K. DONE 2026-10-21, merged to main and pushed 2026-10-21** (branch `wave-k`; Bryan delegated the scope with "go for it, whatever you recommend", so every ruling is DEFAULT in the DECISIONS.md "Wave K scope" block, its K1 to K4 slice blocks and the "Wave K corrective pass" block). K1 vapor source levels on `#/cleanup`: the indoor and outdoor air levels over the vapor run's air-over-source coefficient, carried on the vapor feed, for the methods the feed reaches (Johnson and Ettinger, the box and the SSG factor); nonlinear cases, a soil level above the residual limit and edited-but-unsent inputs are not quantified with a reason. K2 surface water source levels: the surface water level over the peak-over-source coefficient of the linked run, for a dissolved groundwater source in a single-chemical cleanup run (the surface water screen records no chemical). K3 the household, vapor and surface water levels in the report and the cleanup CSV, not-quantified rows kept with reasons. K4 `scripts/mobile-check.mjs` performs an in-browser modeled cleanup run and checks the report's modeled-source block at 390 light, 390 dark and 1280. Review fixes: a multi-chemical cleanup run no longer crashes the three panels (the household one predates the wave), send is blocked on an invalid vapor form or a surface water engine error, and a sent coefficient is dropped when its inputs change. Still open: a chemical on the surface water screen. (Live staleness for the other feeds was open here and landed in wave L.)
- **Wave L. DONE 2026-10-21, merged to main and pushed 2026-10-21** (branch `wave-lm`; corrective pass in the DECISIONS.md "Waves L and M corrective pass" block: uncertainty panels, CSVs and the report uncertainty section carry the mark, dismissals belong to one project, household and vapor feeds count only for their own chemical) (Bryan: "go ahead with waves L and M in parallel"; every ruling is DEFAULT in the DECISIONS.md "Waves L and M scope" block and the L1 and L2 slice blocks). L1: the stale mark is live for all 12 persisted feeds plus the session-only cleanup groundwater run: a feed is stale while its sending screen's inputs differ from those recorded at send, editing back or re-sending clears it, and the extra inputs a sender reads (methods, outdoor box, source choice and series, upstream feeds) are tracked in the session only with no schema change. The wave K coefficient-dropping effects are replaced by the shared mark, the App banner is live with per-value dismissal, and opening or starting a project clears the cleanup groundwater run. L2: a text "Out of date" badge with "Send again from <screen>" (`StaleMark`) shows in every consumer (chemical cards, exposure results, cleanup panels, and the transport, vapor, household and surface water screens), the report marks each section that reads a stale feed, and a stale CSV gets a last `stale inputs` column and a `-stale-inputs` file name suffix (a current file is unchanged). Still open: the mark is as coarse as the source form and staleness does not cascade through feed chains.
- **Wave M. DONE 2026-10-21, merged to main and pushed 2026-10-21** (branch `wave-lm`; corrective pass: tolerance evidence is an exact count, seven published reproductions without a fixture file added and enforced by a test marker, and a gate step that fails on merge conflict markers) (rulings DEFAULT in the "Waves L and M scope" block and the M1 and M2 slice blocks). M1: a validation manifest generator checks a hand-written catalog against the tree at generation time (fixtures, README strings, test-source tolerance evidence, reference keys, method ids, warned-default sources) and fails the build if any statement fails; `docs:generate` writes `docs/VALIDATION.md` (34 examples after the corrective pass: 28 reproduced, 3 named exception, 2 pending or deferred, 1 smoke test) and `packages/data/generated/validation/validation.json`, and `docs:check` covers both. M2: the `#/validation` page built from that JSON, with the no-RISC5-licence statement, a table of all examples and the unverified lists, linked from the nav, home, methods page, report methods statement and Help. Still open: no observed-error reporting (enforced tolerances only), the method ids of two saturated entries are best-fit and only checked for existence. Wave D (docs only) also corrected `docs/UI_PARITY.md` rows that had landed.
- **Wave N. DONE 2026-10-21 on branch `wave-n`, not merged, corrective pass integrated** (Bryan: "ok let's continue", choosing the recommended option on the four design decisions; scope and rulings 5 to 9 in the DECISIONS.md "Project chemical list, waves N to P scope" block and the three slice blocks). N1: an optional top-level `chemicals` key holds a stored, edited project chemical list (`{ id, name }`); an absent key derives the list once from the risk and cleanup rows and every screen's `chemicalId`, `setScreen` adds newly named chemicals, only `removeChemical` removes one, saving always writes the key, and there is no version bump or fingerprint change. N2: nine feeds (well, bank, transport chain, surface water, vadose, saturated, three vapor inputs) carry an optional `chemicalId`; risk and modeled cleanup refuse another chemical's feed with an error naming both, an untagged feed works in a one-chemical run and errors in a run of two or more, and the produce stale check follows the chemical. Corrective pass (FA, FB): the household, vapor and transport screens compare a tagged feed's chemical with their own (another chemical is an error naming both, not offered, nothing computed or sent; an untagged feed is taken when the project holds at most one chemical and refused at two or more), and the surface water screen gained a "Chemical" select (unlinked runs only) so its sent feed carries a chemical. S: source records re-read (SSG Table 36 PCE H' fixture corrected to 0.754, Briggs constants confirmed at p.500, EPRI EA-4190 prints no dispersivity regression, RSL K = 0.5 L/m3 recorded, warning stays), with the validation catalog and `docs/VALIDATION.md` regenerated. What this pass left open (the O4 version 2 migration, the surface water sender tag test, the `setScreen` re-add after `removeChemical`, the list screens, user chemicals and the surface water target) landed in waves O and P below.

- **Wave O. DONE 2026-10-21 on branch `wave-op`, not merged** (Bryan: "after that, go ahead with waves O and P"; rulings in the DECISIONS.md "Waves O and P scope" block and the slice blocks O4, O1, O2a, O2b). O4: every feed about one chemical keeps one slot per chemical (TPH stays single), sending replaces only that chemical's slot, staleness is tracked per feed and chemical and named in the marks, page note, report and CSV, and the project file is version 2 (version 1 files, share links and autosaves migrate; an older build refuses version 2); `setScreen` re-adds a removed chemical a screen newly names. O1: risk and cleanup rows follow the project list, `#/chemicals` shows the list and gains "Add to project", and every remove control asks first and clears both rows and the chemical's feed slots. O2a and O2b: transport, vadose, saturated, vapor, household, plants and eco and the surface water screen pick their chemical from the project list (a chemical without data for a screen keeps its pointer and says why). Remains: a tab on a version 1 build overwrites a version 2 autosave on its next edit; the remove panel and project list were not mobile-checked with a non-empty project before integration.
- **Wave P. DONE 2026-10-21 on branch `wave-op`, not merged** (same direction; slices P1 and P2). P1: user-defined chemicals (id `user-<n>`, optional CAS, ten value fields each with a note) are defined, copied from a database chemical or edited on `#/chemicals`, laid into the chemical database and fate rows, and listed in the report and chemicals CSV; a CAS the database holds is refused. P2: the cleanup screen has a per-chemical surface water target (an NRWQC criterion or a noted user value); the source level is the target over the chemical's own surface water coefficient for dissolved groundwater sources, shown in a panel, a CSV table and the report. Remains: the cleanup source-level panel (`SsgPanel`) reads RSL properties only, so a user chemical gets no soil-to-groundwater comparison; user Kd, vapor thermo and dermal values are a later scope row; soil sources and nonlinear paths are not quantified for the surface water target.

## 8. Research brief: modern methods (for the switchable options; all go into references.json)

Groundwater transport. Domenico 1987 is an approximation whose error grows with longitudinal
dispersivity and off the centreline (West, Kueper & Ungs 2007, Ground Water 45:126-135; Guyonnet &
Neville 2004, J. Contam. Hydrol. 75:141-153; Srinivasan, Clement & Lee 2007, Ground Water 45:136-146).
RISC5 already avoids it by using AT123D's Green's-function solution; the "modern" offer is therefore
Wexler's exact solutions with the finite-thickness option (TWRI 3-B7; code ANALGWST), sequential decay
chains (Srinivasan & Clement 2008, Adv. Water Resour. 31:203-218 and 219-232), power-law source
depletion and remediation scenarios (Falta, Rao & Basu 2005, J. Contam. Hydrol. 78:259-280; Falta's
REMChlor, EPA), electron-acceptor-limited biodegradation (BIOSCREEN, Newell et al. 1996, EPA/600/R-96/087;
BIOCHLOR, Aziz et al. 2000), and scale-dependent dispersivity (Gelhar, Welty & Rehfeldt 1992, WRR
28:1955-1974; Xu & Eckstein 1995, Ground Water 33:905-908; Schulze-Makuch 2005, Ground Water 43:443-456).

Vadose zone. RISC5's unit-gradient Brooks-Corey approach is a 1992-era screening simplification.
Modern options: Mualem-van Genuchten k(θ) (van Genuchten 1980, SSSAJ 44:892-898) consistent with the n
the user already enters; the EPA Soil Screening Guidance leaching/DAF framework (EPA 1996,
EPA/540/R-95/128; 2002 supplemental, OSWER 9355.4-24) for regulatory comparability; and, later, a 1-D
Richards-equation column (Celia, Bouloutas & Zarba 1990 mass-conservative scheme) reimplemented, with
HYDRUS-1D (Šimůnek et al., GPL) used only as an external check.

Vapor intrusion. J&E 1991 remains the regulatory default but EPA's 2004 spreadsheet formulation and the
2015 OSWER VI Technical Guide (empirical attenuation factors from the EPA 2012 VI database) are the
current practice; for petroleum, oxygen-limited biodegradation (DeVaull 2007, EST 41:3241-3248; API
BioVapor 2010; EPA PVIScreen, Weaver 2017-18, Java with Monte Carlo) and the EPA 2015 PVI Technical Guide
vertical-separation screening (Lahvis et al.) supersede RISC5's unvalidated Appendix K model.
Abreu & Johnson 2005/2006 and Abreu, Ettinger & McAlary 2009 3-D results bound the 1-D models; Yao,
Pennell & Suuberg 2011 and Yao, Shen & Suuberg 2013 (review) document where J&E over- or under-predicts.

Exposure and toxicity. RAGS Part F (EPA 2009, OSWER 9285.7-82) replaced dose-based inhalation with
concentration-based IUR/RfC; RAGS Part E (2004) governs dermal; OSWER 9200.1-120 (2014) updated default
exposure factors; EPA 2005 supplemental cancer guidance added age-dependent adjustment factors for
mutagens. The RSL tables (EPA, semiannual) and their chemical-specific parameter table are the public,
machine-readable successor to RISC5's hand-maintained 128-chemical database; CompTox Dashboard fills gaps.

Uncertainty. LHS (McKay, Beckman & Conover 1979) with Iman & Conover 1982 rank correlation, Sobol
indices (Sobol 1993/2001; Saltelli et al. 2010), Morris 1991 screening; EPA 1997 Monte Carlo guiding
principles (EPA/630/R-97/001) and RAGS Vol. 3 Part A (2001).

Prior art checked 2026-10-15: mibitrans (MiBiPreT, Utrecht; Apache-2.0; active, pushed 2026-10-09;
BIOSCREEN-class 3-D ADE with biodegradation), USGS ANALGWST (public domain, 1996), EPA BIOSCREEN/
BIOCHLOR/REMChlor (spreadsheets/exe, no source), EPA PVIScreen (Java; source licence unconfirmed), UK CLEA
(free spreadsheet), Italy's Risk-net (free), GSI RBCA Tool Kit (commercial), RISC5 (commercial). No
open-source tool covers RISC5's scope.

Items still to confirm during the relevant milestone (not blockers): PVIScreen source availability; which RSL edition is current when M4 starts (checked 2026-10-16: November 2024, see
docs/methods/chemical-database.md); whether ANALGWST
compiles cleanly with modern gfortran (fallback: port the ~500-line Fortran kernels, public domain).
Confirmed in M6 (2026-10-17): the VISL default attenuation factors are those of the EPA 2015 Technical
Guide Table 6-1 (groundwater 0.001, sub-slab and near-source exterior soil gas 0.03), as encoded in
`vapor.attenuation-factor-2015` (docs/methods/vapor-models.md); the VISL calculator's own printed values
were not obtained (see HANDOFF open items).

## 9. Verification (per milestone and before any push)

1. `pnpm lint && pnpm typecheck && pnpm -r test` green locally (vitest, including fixture tolerances).
2. `pnpm build` produces the static site; `pnpm preview` and load every step in a desktop browser.
3. Mobile check per the global web rule: Chrome with `--remote-debugging-port`, CDP
   `Emulation.setDeviceMetricsOverride({width:390,height:844,deviceScaleFactor:2,mobile:true})`, screenshot
   each step, overflow count (elements with right edge > clientWidth) must be 0; tap targets >= 44 px.
4. Attribution gate: generator run, `docs/ATTRIBUTIONS.md` and `docs/THIRD_PARTY_LICENSES.md` committed
   and in sync with `references.json` and the lockfile; every registered method has citations.
5. Fixture gate: Appendix R, ANALGWST, and other fixtures within stated tolerances; any widened tolerance
   is recorded in DECISIONS.md with the reason.
6. Doc validity: ROADMAP milestone statuses corrected in place when work lands.
7. One push per milestone (or per logical unit); CI confirms, it does not discover.

## 10. First implementation session (M0), in order (completed 2026-10-15)

1. `git clone https://github.com/bmills23/model_flow.git ~/repos/model_flow`; branch `m0-foundation`.
2. Copy this plan to `docs/ROADMAP.md`; write `docs/DECISIONS.md` (section 2 table) and README (scope,
   non-affiliation, licence, status).
3. Extract the parameter lists from `index.py` into `docs/methods/risc5-parameter-map.md`, then delete
   `index.py` (git history keeps it).
4. Scaffold pnpm workspaces (`packages/engine`, `packages/data`, `apps/web`), TypeScript strict, eslint,
   prettier, vitest; Vite + React in `apps/web` with the responsive shell and dark/light tokens.
5. Numerics kernel with tests (erf/erfc/erfcx accuracy, quadrature on known integrals, Brent/secant on
   known roots, PRNG and LHS statistics).
6. `MethodRegistry` with one toy method to prove the citation gate; `packages/engine/src/references/references.json` seeded from
   section 3 and 8; generators for the two docs; test that fails on missing citations.
7. CI and Pages workflows with paths-ignore and concurrency; first push; record CI minutes.
8. Save a project memory file (`model_flow_project.md`) with the decisions table and resume pointer.
