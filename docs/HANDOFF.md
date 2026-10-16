# HANDOFF (written from the tree, 2026-10-16, end of M2)

Resume: start a fresh session in `~/repos/model_flow`, read this file, then `docs/ROADMAP.md` (sections 7
and 8) and `docs/DECISIONS.md`. Statuses are claims: grep the tree before acting on an open row or skipping
a done one.

## State of the tree
- `main` carries M2 (merged from `m2-vadose-leaching`). Gate green locally: lint, prettier, typecheck,
  engine 277 + data 11 + web 125 tests, `docs:check`, build. Pages deploys from main:
  https://bmills23.github.io/model_flow/
- Branches: `m0-foundation`, `m1-groundwater-engine` and `m2-vadose-leaching` are ancestors of main (safe
  to delete). `m1-groundwater-ui` is NOT an ancestor of main (its commits from 10931c1 to 5d6c6c7 carry
  different hashes from what landed); confirm its content is on main before deleting it.
- CI cost: about 3 billed minutes per push to main; docs-only pushes trigger nothing.

## M2 landed (vadose leaching, Appendix A)
- Methods note `docs/methods/vadose-leaching.md` (scope, equations in our words, validity checks, warning
  codes, coupling, fixture plan). Scope: legacy VADSAT-type model, van Genuchten-Mualem k(theta),
  multi-layer profile, flux-type inlet. SSG/DAF leaching moved to M5, Jury 1983 to M6, the Richards
  column after M2.
- Engine `packages/engine/src/processes/vadose/`: hydraulics (Brooks-Corey with the Lenhard n-to-lambda
  conversion, van Genuchten-Mualem, unit-gradient moisture), partitioning (Raoult, residual phase),
  Millington-Quirk diffusion, exponentially depleting source, `vadose.vadsat` (closed form with a
  Duhamel convolution fallback) and `vadose.layered` (finite-volume Crank-Nicolson with an exact budget,
  vG&A case C14 closed form for one layer), and `coupling.ts` (flux to M1 loading steps, carrying the
  engine's exact cumulative delivery).
- Fixtures `packages/engine/test/fixtures/vadose/`: Table R-7 (224.36 mg/L at the source; 10.685 mg/L
  year-10 mean of month-end values against 10.8, -1.1 percent, Bryan's 3 percent rule) and van Genuchten
  and Alves 1982 Table 6 (102 points at 5e-5, eight named exceptions at 1.5e-4 per DECISIONS.md).
- Web `apps/web/src/vadose/` at `#/vadose`: scenario form, legacy or modern switch, depth profile, water
  table concentration and flux, source depletion with stacked budget, layer cards, warnings, data tables,
  and the R-7 validation case; the transport screen can take its source from a vadose run (at most 48
  steps, documented and tested). Zero overflowing elements at 390x844 and 1280, light and dark.
- M1 correction: infinitely deep aquifers now have the Yeh 1981 no-flux water table by default, in the
  AT123D kernel and in the screen's Wexler PATCHI path (finite thickness without a width also honours
  both boundaries). Results near the water table changed from the M1 release (previously up to a factor
  of two low). Whole-space behaviour remains available as `top: 'unbounded'`.
- References: 20 `used`, 50 `planned`, 4 `fixture`, 3 `data`; vadose references checked against Crossref
  and publishers, with paywalled full texts noted in each entry.

## Open items
- Schulze-Makuch 2005 coefficients (0.20, 0.44) come from lecture notes quoting the paper, not from the
  paper's own table; per-medium coefficients and the data range are not encoded, so the method has no
  range warning. A check on 2026-10-16 reached only the abstract (paywalled full text; see DECISIONS.md),
  so this stays open until someone supplies the paper's PDF.
- The Gelhar et al. 1985 vadose dispersivity regression coefficients come from the manual's account only;
  they were not checked against the EPRI report.
- Galya 1987 is a horizontal plane-source paper; the box source derives from Yeh 1981 (the methods note
  says so; the ROADMAP section 3 row is annotated).
- 28 references still carry square-bracketed descriptor titles (status `planned`); replace each with its
  verified published title when a milestone marks it `used` (a test enforces this).
- Optional extras noted during M2, not scheduled: persist the vadose feed across reloads; the transport
  charts measure the padded figure and render about 7 percent small; the web bundle is over 500 kB.
- The 390x844 viewport check script is not in the repo. Recreate it when needed: headless Chrome with
  remote debugging, Emulation.setDeviceMetricsOverride (390x844, mobile, scale 2) before navigating,
  count elements whose bounding rect right edge exceeds clientWidth; the count must be 0.
- Manual text extraction lives outside the repo; re-extract when needed:
  `pdftotext -layout "~/Downloads/RISC5 Users Guide -- Nov 2014 (2).pdf" <out>.txt`
  (the appendix line index in ROADMAP section 3 refers to that extraction).

## Queued: M3 saturated soil source (ROADMAP section 7)
Two-region source with water-table fluctuation (Appendix C); feeds M1 through the same loading steps the
vadose coupling uses. Not started.
