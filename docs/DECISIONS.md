# Decisions

Append new decisions at the bottom with the date. Correct a superseded decision in place and say what replaced it.

## 2026-10-15: Project scope and direction (Bryan)

| Question | Decision | Consequence |
|---|---|---|
| Revenue vs personal | Personal, open source, free | $0 hosting (GitHub Pages), local gates before any push, minimal CI, no cloud fleets |
| Scope | Full RISC5 parity as the long-run goal | 12 milestones (docs/ROADMAP.md section 7); each ships a usable increment |
| Validation | Manual plus public references; no RISC5 licence | Fixtures from the Appendix R peer-review tables, USGS ANALGWST, van Genuchten & Alves 1982, EPA spreadsheets, mibitrans cross-checks |
| Architecture | TypeScript engine plus static single-page app | All computation in the browser (Web Worker); no backend; the Python tkinter shell is retired |
| Methods | RISC5's legacy methods by default, with a per-process switch to a modern method | The method registry is the central engine abstraction; legacy-vs-modern comparison overlays are a headline feature |
| Attribution | Thorough scientific references for legacy and modern methods, kept separate from third-party software licences | `docs/ATTRIBUTIONS.md` (science and data provenance) and `docs/THIRD_PARTY_LICENSES.md` (software), both generated from `data/references.json` and the lockfile; in-app Methods & References page |

## 2026-10-15: Standing assumptions

- Licence stays MIT. No GPL code is vendored (HYDRUS-1D is GPLv3: use the papers, not the code). Public-domain US government code (USGS, EPA) may be used for fixtures and may be ported with its notice.
- The product is not called "RISC" or any variant. The repo name stays `model_flow` until a product name is chosen. The README carries a non-affiliation notice.
- Personal project: no employer time, resources, or implied endorsement. No personal contact addresses on public surfaces; use GitHub issues.
- Clean room: every model is implemented from its primary publication. The RISC5 user's guide is used only as a map of which published choices RISC5 made. No manual prose, figures, or database tables are copied. The RISC5 binary is never inspected.
- Root solver for cleanup-level back-calculation is Brent's method; a secant variant is kept only for parity checks against RISC5's documented behaviour.
- SI units inside the engine; RISC-style units (cm/d, mg/kg, mg/L) only at the input and output boundary.
