# HANDOFF (written from the tree, 2026-10-15, end of M0 session)

Resume: start a fresh session in `~/repos/model_flow`, run `/architect on`, read this file, then
`docs/ROADMAP.md` (sections 7 and 8) and `docs/DECISIONS.md`. Statuses are claims: grep before acting.

## State of the tree
- `main` at the commit after bcfce84 (CI cost recorded), pushed; working tree clean; branch
  `m0-foundation` fully merged (safe to delete).
- Gate green locally and in CI: lint, prettier, typecheck, 49 engine + 11 data + 7 web tests,
  `docs:check`, build. Pages live at https://bmills23.github.io/model_flow/ (build_type workflow).
- CI cost: about 3 billed minutes per push to main; docs-only pushes trigger nothing.

## M0 landed
- Monorepo (pnpm 12.11.2 via `corepack pnpm`, Node 24, TypeScript 6.0.3, Vite 8, vitest 5, React 19).
- `packages/engine`: numerics (special functions, Gauss-Kronrod and tanh-sinh quadrature, Brent and
  secant, xoshiro128** PRNG, Latin hypercube, units), `MethodRegistry`, references (75 entries, 4 used),
  dispersivity process (legacy Gelhar 1985 + API 1987 ratios; modern Xu and Eckstein 1995 + BIOSCREEN
  ratios).
- `packages/data`: `renderAttributions`, `renderThirdPartyLicenses`, `renderStable` (date moves only
  on content change), `generate-docs.ts`; generated `docs/ATTRIBUTIONS.md` and
  `docs/THIRD_PARTY_LICENSES.md` are committed and checked by the gate.
- `apps/web`: responsive shell (six-step nav placeholders, Methods & References page, non-affiliation
  footer), zero overflow at 390x844 (CDP check).

## Known debt
- 42 of 75 references have square-bracketed descriptor titles (status `planned`). Replace each with its
  verified published title when a milestone marks it `used` (a test enforces this for `used` entries).
- Manual text extraction lived in a per-session scratchpad; re-extract when needed:
  `pdftotext -layout "~/Downloads/RISC5 Users Guide -- Nov 2014 (2).pdf" <out>.txt`
  (appendix line index in ROADMAP section 3 refers to that extraction).

## In flight: M1 groundwater transport (ROADMAP section 7)
Bryan's directive (2026-10-15, verbatim, in reply to the proposed four-agent shape): "go, engine first,
UI as a second wave".

- Wave 1 (engine) LANDED on branch `m1-groundwater-engine` (not pushed), commits dee0953, 47266da,
  425de19, 995dcc4, 158d87f: ANALGWST 1.1 fixtures (POINT3, PATCHI, PATCHF, decay on and off; sample
  problems 10 and 11 reproduce byte for byte), mibitrans 1.0.1 fixtures (two cases), methods
  `groundwater.at123d` (legacy), `groundwater.wexler1992` (modern), `groundwater.domenico1987`
  (comparison, four warnings), methods note docs/methods/groundwater-transport.md, seven references
  marked used, ATTRIBUTIONS regenerated. Worker gate tail: engine 94 tests, data 11, web 7, lint,
  prettier, typecheck, docs:check, build all green. Grid timings (100 by 60): at123dGrid about 190 ms,
  patchiGrid 43 ms, patchfGrid 51 ms; the per-point adaptive path costs seconds, so the UI uses the
  grid functions.
- Worker-reported open items awaiting the review: Domenico deviation threshold 10% is the worker's own
  screening choice (needs a DECISIONS.md entry once settled); Galya 1987 is a plane-source paper (roadmap
  row annotated); Srinivasan 2007 title stored with `--` in place of the published long dash.
- Fable review of the engine (Dispatch 3) DONE: 1 critical (steady-state time integral truncated at high
  Peclet in wexler.ts integralUpperLimit, 13 to 36 percent low with no warning), 4 major (shared
  24-per-decade panel rule loses accuracy above Peclet 1e3; no input validation in the AT123D kernel so
  bad inputs return 0; Domenico validate throws for velocity 0; negative velocity mis-handled), 6 minor
  (Infinity time NaN in AT123D; out-of-domain z silently mirrored; fixture build script formatting;
  one loose tolerance; off-centreline warning fires on z; Srinivasan title punctuation). Verified clean:
  kernel mathematics versus Yeh 1981, Wexler formulas and series, fixture honesty (fresh gfortran build
  reproduces all six .prt files byte for byte), mibitrans match, registry, units, seven references
  against Crossref, clean room, zero em dashes.
- Corrective dispatch (Dispatch 5, Sonnet, architect-worker-medium) LANDED on m1-groundwater-engine,
  commits 53b1e13, 0741ee2, 6852c54: all eleven findings fixed, tests in
  packages/engine/test/groundwater-review.test.ts (engine now 129 tests). Steady-state upper limit from
  the exponent root; peak-following grid density (grid versus point within 2e-8 up to Peclet 1e6, grids
  throw RangeError above MAX_GRID_PECLET 1e6); AT123D kernel and Domenico throw RangeError on invalid
  inputs (non-finite, porosity outside (0,1], R below 1, negative decay or dispersion, thickness at or
  below 0, velocity at or below 0 for Domenico, time Infinity for AT123D, source box outside the layer);
  receptors outside the layer return 0; Srinivasan title now "Domenico solution: is it valid?". Grid
  timings 75, 61, 90 ms (at123d, patchi, patchf) on a 100 by 60 grid. No second Fable pass (doctrine).
  UI consequence, queued as a resume of the UI worker after merge: catch RangeError from engine calls
  and show the message in the warnings panel.
- Gate hygiene: agent worktrees live under .claude/worktrees/ inside the repo; added to .gitignore and
  the eslint ignores so `pnpm lint` passes while a worktree exists.
- Wave 2 (UI, Dispatch 4): in flight in an isolated worktree on branch `m1-groundwater-ui`, Sonnet,
  architect-worker-medium. Scenario form, plan-view plume map, breakthrough chart, legacy-vs-modern
  overlay, warnings panel, CDP check at 390x844 with zero overflow.
- Then: corrective dispatch if the review finds defects, merge UI into the engine branch, one Haiku
  doc-validity check, full gate, ROADMAP M1 status in place, one push.

## Session log
- Dispatch 1 (Sonnet, architect-worker-medium): all M0 implementation, about 240K tokens including one
  resume for the date-stability, retrieval-year and used-title fixes.
- Dispatch 2 (Sonnet, architect-worker-medium): M1 wave 1 engine. 261K tokens, 84 tool uses, 22 min. Landed.
- Dispatch 3 (Fable, read-only): adversarial review of the wave 1 engine. 193K tokens, 13 min. Done.
- Dispatch 5 (Sonnet, architect-worker-medium): corrective fixes from the review. 116K tokens, 7 min. Landed.
- Dispatch 4 (Sonnet, architect-worker-medium, worktree): M1 wave 2 UI. In flight.
