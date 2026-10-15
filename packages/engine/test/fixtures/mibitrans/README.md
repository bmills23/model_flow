# mibitrans fixtures

Cross-check of the 3-D advection-dispersion implementations against the Apache-2.0 Python package
mibitrans (Utrecht University). The package is not vendored; only inputs and outputs are recorded.

- Package: mibitrans 1.0.1 (PyPI), Python 3.14.6, installed with `pip install mibitrans` in a throwaway venv.
- Retrieved: 2026-10-15.
- Classes: `Bioscreen` (truncated Domenico 1987 as in BIOSCREEN) and `Mibitrans` (Wexler 1992 exact patch
  solution as in BIOSCREEN-AT, no source depletion), both sampled at z = 0.
- `cases.json`: two cases (`nodecay`, `decay`), each 48 points (x, y, t) with both solutions. Units: metres,
  days, g/m3. Regenerate with `generate.py <out.json>` inside a venv with mibitrans.
- Two cases per the brief: the Domenico-type solution is checked against `Bioscreen`; the exact
  patch solution against `Mibitrans`.
