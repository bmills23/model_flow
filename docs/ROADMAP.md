> Status: M2 DONE 2026-10-16 (vadose leaching, with the M1 no-flux water-table correction). Next: M3 saturated soil source. Milestone statuses are maintained in place in section 7; a status here is a claim, grep the tree before trusting it.

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
  appendices updated March 2013). Text extraction for this session:
  `/private/tmp/claude-501/-Users-bryanmills-repos/1ec8a7df-8e71-4701-954e-e5389562ea12/scratchpad/risc5_manual/risc5_guide.txt`
  (13,185 lines; line index of appendices in section 3 below). Re-extract with `pdftotext -layout` if the
  scratchpad is gone. The RISC4 manual (Oct 2001, same authors) is public on ISPRA's site
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
| M, N (8169-8718) | Aquatic-life and sediment criteria databases | International criteria compilation | Rebuild from public sources only: EPA NRWQC, MacDonald et al. 2000 consensus TEC/PEC, NOAA SQuiRTs; international criteria added later only from redistributable sources |
| O (8719-9655) | Vegetable uptake | Trapp & Matthies 1995 (RISC5), Briggs et al. 1982 RCF/TSCF | Trapp 2015 dynamic plant uptake; EPA 2005 HHRAP produce equations |
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
                                 particulate/, irrigation/, surfaceWater/, plantUptake/, exposure/, risk/,
                                 cleanup/ (back-calculation), montecarlo/
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
| Appendix R, Arcadis 2001 review (lines 12717-13185) | Tables R-3 (J&E, two cases), R-4 (dominant layer), R-5 (GW to indoor), R-6 (GW to outdoor), R-7 (vadose leaching: 224 mg/L at source, 10.8-11.0 mg/L at water table at 10 yr), R-8 (river and lake mixing), R-9 (direct pathways CDI/risk/HI for As, benzene, BaP, TPH aliphatic C12-C16), R-2 (Monte Carlo percentiles vs Crystal Ball, loose tolerance) | Encoded as JSON fixtures with citation; tolerance 2-3% (the review's own erf approximation error) |
| USGS ANALGWST v1.1 (Wexler 1992; PATCHI, PATCHF, POINT3; public domain, Fortran) | Appendix B/C transport kernel and the modern Wexler option; compile with gfortran locally, generate reference CSVs, commit them with the input decks | `packages/engine/test/fixtures/analgwst/` |
| van Genuchten & Alves 1982 (USDA TB-1661) tabulated solutions | 1-D ADE kernel of Appendix A | hand-entered table values |
| EPA J&E spreadsheets (2004) and VISL calculator, EPA BIOSCREEN example | Appendix D/E and the Domenico comparison mode | run spreadsheets once, record inputs and outputs |
| mibitrans (Apache-2.0, Python) | Cross-check of 3-D ADE results for identical inputs | throwaway Python env, outputs recorded as fixtures, package not vendored |
| Manual worked example, Appendix J (lines 6349-6600, BP Paulsboro 1997 data) | Dominant layer model | fixture |
| Mass-balance invariants | Depleting sources conserve mass; symmetric sources give symmetric plumes; zero-decay limits | property tests |

## 7. Milestones

Each milestone: write the methods note (equations in our words, citations) -> TDD the engine (fixtures
first) -> UI step and visualization -> ATTRIBUTIONS and references updated -> local gate green (lint,
typecheck, full vitest, build, mobile viewport check) -> one push. Record per-push CI minutes in CLAUDE.md
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
- **M3 Saturated soil source (App. C).** Two-region source with water-table fluctuation; feeds M1.
- **M4 Chemical and toxicity database + direct exposure and forward risk (Ch. 3, 6, 7).** RSL-derived
  database with source tags; 9 direct pathways (soil ingestion, dermal soil, GW ingestion, dermal water,
  shower inhalation and dermal, indoor/outdoor air inhalation, surface water ingestion and dermal);
  carcinogenic risk and hazard index; two simultaneous receptor scenarios and additivity rules. Legacy
  RAGS 1989 intake vs modern RAGS Part F / Part E / 2014 defaults / ADAF. Table R-9 fixture. Risk
  contribution charts.
- **M5 Cleanup levels (Ch. 8).** Back-calculation for direct and modeled pathways, individual vs cumulative
  options, MCL/user targets; Brent solver (and secant for parity checks). EPA Soil Screening Guidance
  1996/2002 leaching with a dilution attenuation factor (moved here from M2, see DECISIONS.md).
- **M6 Vapor models (App. D, E, J, K, F).** J&E, GW-to-indoor, dominant layer, oxygen-limited, outdoor box;
  modern EPA 2004 J&E, DeVaull 2007 oxygen-limited, VISL attenuation factors, PVI vertical-separation
  screen. Tables R-3..R-6 fixtures. Depth-attenuation plots. Jury et al. 1983 behaviour-assessment
  volatilization from soil (moved here from M2).
- **M7 Shower, irrigation, particulates (App. G, H, I).** Foster & Chrostowski vs Little; PEF variants.
- **M8 Surface water and sediment (App. L, M, N).** Mixing models; criteria tables from public sources
  only. Table R-8 fixture.
- **M9 Plant uptake and ecological screening (App. O, P, Q).** Trapp & Matthies vs Trapp 2015; Eco-SSLs;
  TPH fractions.
- **M10 Uncertainty (Monte Carlo).** Legacy exposure-only simple sampling vs modern LHS with rank
  correlation over exposure and transport parameters, Sobol indices, tornado charts, percentile fans,
  probabilistic cleanup levels; Table R-2 fixture (loose).
- **M11 Projects, reports, polish.** Save/load/share, CSV and printable report with methods statement,
  responsive pass on every screen (CDP at 390x844, overflow count 0), accessibility pass, docs site.

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

Items still to confirm during the relevant milestone (not blockers): current VISL default attenuation
factors; PVIScreen source availability; which RSL edition is current when M4 starts; whether ANALGWST
compiles cleanly with modern gfortran (fallback: port the ~500-line Fortran kernels, public domain).

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
