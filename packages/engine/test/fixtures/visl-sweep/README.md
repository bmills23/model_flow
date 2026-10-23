# VISL sweep fixture

`exceptions.json` records the outcome of `visl-sweep.test.ts`, which compares the output of the public EPA VISL
calculator with the engine. It is test data, not a product database. The calculator's printed numbers are the
dated fixtures under `packages/data/raw/visl/` (the test imports them by relative path), fetched by
`packages/data/scripts/fetch-visl.ts` (manual use only):

| Run id | Fixture | Settings |
| --- | --- | --- |
| `resident-default` | `visl-default-resident-2026-10-22.json` | resident, groundwater 25 deg C, hazard quotient 0.1, target risk 1e-6 |
| `resident-tgw10` | `visl-resident-tgw10-hq1-tr1e-05-2026-10-22.json` | resident, groundwater 10 deg C, hazard quotient 1, target risk 1e-5 |
| `commercial-default` | `visl-default-commercial-2026-10-22.json` | commercial/industrial, form defaults |

Each run holds five chemicals (benzene, trichloroethylene, tetrachloroethylene, naphthalene, ethylbenzene). The
calculator prints no version number; its data edition is the newest entry of its what-is-new page (November 13,
2024), recorded in each fixture. The raw directory has no checksum manifest, so none is claimed.

## What is compared

Per chemical and run, every numeric output the engine can compute: the cancer and noncancer target indoor air
levels and the governing one, the target sub-slab and near-source soil gas level, the target groundwater level,
the pure phase vapor concentration, the maximum groundwater vapor concentration, and the dimensionless Henry
constant used in the calculations. Also the yes or no answers the engine has a criterion for (volatility,
inhalation toxicity data, sufficiently volatile and toxic from a soil source and from a groundwater source, the
toxicity basis, and in the database comparison the mutagenic indicator). The answer to whether the target
groundwater level is below the maximum contaminant level is not compared: the engine has no such criterion.

Two comparisons:

- `printed-inputs`: the engine is run from the properties, toxicity values and exposure inputs the calculator
  prints for the run (65 cells per run). This checks the engine's equations.
- `database`: the engine is run from the chemical file the vapor screen loads (`vapor-chemicals.json`) and the
  RSL toxicity file the exposure screens use (`tox.json`), with the exposure inputs the calculator prints
  (70 cells per run, one more for the mutagenic indicator). This checks what a user of the app gets. The database
  holds the vapor pressure at 25 deg C only, so the pure phase vapor concentration is computed at 25 deg C.

The engine side is `vislSweepHelpers.ts`, a composition of existing functions only: the exposure kernel for the
target indoor air levels, the attenuation factor screening level for the soil gas and groundwater levels, the
attenuation run on the solubility for the maximum groundwater vapor, the vapor pressure form of the source vapor
for the pure phase concentration, and the RSL volatility criterion.

## Tolerance

A numeric cell reproduces when the engine's unrounded value lies within half a unit of the last printed digit.
Every compared numeric cell is printed to three significant figures (the test asserts it), so the tolerance is a
relative 0.05 to 0.5 percent. Nothing is widened. A yes or no answer must be equal.

## What the fixture holds

- `comparisons`: per comparison and run (and in total), the cells compared, reproduced, excepted and
  unexplained. The test recomputes them.
- `classes`: each exception class with its reason, the cells per comparison and run, and the chemicals it names.
  A cell is excepted only when it does not reproduce and the class's own evidence holds; the test checks that
  evidence for every cell (for example, that the 25 deg C vapor pressure reproduces a pure phase vapor
  concentration printed at 10 deg C).
- `cells`: every excepted cell with the printed and the computed value, its class and, for
  `database-input-differs`, the database inputs whose difference explains it.
- `unexplained`: every cell that neither reproduces nor belongs to a class, with the printed and the computed
  value. These are counted and printed in the validation catalog, never hidden and never given a reason that was
  not found.

## Trichloroethylene

The calculator takes the cancer level of trichloroethylene from the RSL's own equations for it (the unit risk
split into a cancer part and a mutagenic part). The engine applies those equations (wave T, 2026-10-23, from the
RSL User's Guide) to a receptor with early-life segments, so the resident cancer level reproduces in both
comparisons and the class that excepted it (`special-case-bracketed`) is gone. The commercial receptor has no
early-life segments and reproduces as an ordinary chemical. The special-case flag of a chemical is read from the
RSL toxicity file by CAS number in both comparisons; it is not a calculator input.

## Classes

- `pure-phase-vapor-at-25`: at a groundwater temperature of 10 deg C the calculator prints a pure phase vapor
  concentration, under a header that names 10 deg C, equal to its 25 deg C value. The engine reproduces the
  printed number from the printed 25 deg C vapor pressure, not from the printed 10 deg C vapor pressure.
- `printed-input-rounding`: a cell that misses by less than the rounding of the calculator's printed inputs
  (three or five significant figures). The printed value lies within half a unit of its last digit of an engine
  value for inputs that round to the printed ones.
- `database-input-differs`: a cell of the database comparison that reproduces when the named database inputs (the
  critical temperature of trichloroethylene, the enthalpy of vaporization of naphthalene) are replaced by the
  calculator's printed values.

## Unexplained

None at the time of writing; the list in `exceptions.json` is the record.
