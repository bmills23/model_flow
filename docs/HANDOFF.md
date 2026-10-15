# HANDOFF (written from the tree, 2026-10-15, end of M1)

Resume: start a fresh session in `~/repos/model_flow`, read this file, then `docs/ROADMAP.md` (sections 7
and 8) and `docs/DECISIONS.md`. Statuses are claims: grep the tree before acting on an open row or skipping
a done one.

## State of the tree
- `main` at the M1 merge, pushed; working tree clean. Branches `m0-foundation`, `m1-groundwater-engine`
  and `m1-groundwater-ui` are fully merged (safe to delete).
- Gate green locally: lint, prettier, typecheck, engine 140 + data 11 + web 46 tests, `docs:check`, build.
  Pages deploys from main: https://bmills23.github.io/model_flow/
- CI cost: about 3 billed minutes per push to main; docs-only pushes trigger nothing.

## M1 landed (groundwater transport, Appendix B)
- Engine `packages/engine/src/processes/groundwater/`: AT123D-class Green's-function kernel (3-D ADE,
  box source, finite or infinite thickness, retardation, decay, continuous, pulse and piecewise-constant
  mass loading, well-screen averaging); Wexler 1992 PATCHI and PATCHF (point, grid and registry paths,
  boundary-concentration loading by superposition); Domenico 1987 comparison mode with four validity
  warnings (deviation threshold recorded in DECISIONS.md). Invalid inputs throw RangeError (non-finite
  values, porosity outside (0,1], retardation below 1, negative decay or dispersion, thickness at or below
  0, velocity at or below 0 for Domenico, time Infinity for AT123D, a source box outside the layer, grids
  above Peclet 1e6). Grid versus point agree within 2e-8 up to Peclet 1e6; a 100 by 60 grid takes about
  75, 61 and 90 ms (AT123D, PATCHI, PATCHF).
- Dispersivity: third law `dispersivity.schulze-makuch2005` (alpha_L = 0.20 L^0.44, unconsolidated
  media); coefficient provenance recorded in DECISIONS.md.
- Fixtures `packages/engine/test/fixtures/`: USGS ANALGWST 1.1 (POINT3, PATCHI, PATCHF, decay on and off;
  a fresh gfortran build reproduces every committed output byte for byte; README records version, URL,
  retrieval date, compile command and the public-domain notice); mibitrans 1.0.1 (two cases, generate.py,
  throwaway venv, not vendored). Tolerances are the printed-precision floor; none widened.
- References: 12 entries `used`, titles and identifiers checked against Crossref and the USGS
  Publications Warehouse. Methods note: `docs/methods/groundwater-transport.md`.
- Web `apps/web/src/transport/`: scenario form with unit conversion at the boundary, three dispersivity
  laws, legacy or modern method switch, optional Domenico overlay labelled as a comparison; plan-view
  plume map (d3-contour and d3-scale, React SVG), breakthrough chart, warnings panel that also shows
  engine input errors while keeping the last good result; engine in a module Web Worker. Zero overflowing
  elements at 390x844 and 1280, light and dark. Eight d3 packages plus internmap, all ISC, in THIRD_PARTY_LICENSES.

## Open items
- Schulze-Makuch 2005 coefficients (0.20, 0.44) come from lecture notes quoting the paper, not from the
  paper's own table; per-medium coefficients and the data range are not encoded, so the method has no
  range warning. Check against the paper and record the check in DECISIONS.md.
- Galya 1987 is a horizontal plane-source paper; the box source derives from Yeh 1981 (the methods note
  says so; the ROADMAP section 3 row is annotated).
- 35 of 75 references still carry square-bracketed descriptor titles (status `planned`); replace each
  with its verified published title when a milestone marks it `used` (a test enforces this).
- The 390x844 viewport check script is not in the repo. Recreate it when needed: headless Chrome with
  remote debugging, Emulation.setDeviceMetricsOverride (390x844, mobile, scale 2), count elements whose
  bounding rect right edge exceeds clientWidth; the count must be 0.
- Manual text extraction lives outside the repo; re-extract when needed:
  `pdftotext -layout "~/Downloads/RISC5 Users Guide -- Nov 2014 (2).pdf" <out>.txt`
  (the appendix line index in ROADMAP section 3 refers to that extraction).

## Queued: M2 vadose leaching (ROADMAP section 7)
VADSAT-type legacy model with lens and Raoult's law; modern k(theta) and multi-layer options; coupling of
the leachate flux into M1 as a time-varying source (the engine's loading steps are the hook). Table R-7
fixture, van Genuchten and Alves tables. Depth-profile and source-depletion charts. Not started.
