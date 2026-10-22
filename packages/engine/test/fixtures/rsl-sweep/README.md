# RSL sweep fixture

`exceptions.json` records the outcome of `rsl-tables-sweep.test.ts`, which compares the published EPA Regional
Screening Levels (November 2024 edition) with the engine. It is test data, not a product database. The published
values themselves are the generated file `packages/data/generated/rsl-2024-11/screening-levels.json` (built by
`corepack pnpm --filter @model-flow/data build:rsl`), which the test imports by relative path.

## What is compared

Every printed cell of these columns, by the rule of the existing reproductions: the engine's unrounded value must
lie within half a unit of the second significant figure of the printed value. The data file holds at most two
significant figures in every screening-level column (a data test asserts it), so nothing is widened.

| Sweep id | Columns |
| --- | --- |
| `tapwater` | tap water ingestion, dermal, inhalation and total, cancer (TR 1e-6) and noncancer (child, THQ 1) |
| `soil-resident` | resident soil, the same four pathways and two endpoints |
| `soil-industrial` | composite worker soil, the same |
| `air` | resident air inhalation (cancer and noncancer) and the summary's industrial air governing level |

The engine side is `rslSweepHelpers.ts`: the modern resident and composite worker of the RSL default parameter
file, the chemical values from the committed RSL build, and for tap water inhalation the resident indoor air level
(24 h per day) divided by the household factor K, 0.5 L/m^3 (the value in table 1 of the RSL user's guide, entered
as the household term takes it). A total is the sum of the pathways whose cells the table prints. The summary's
industrial air level is the lower of the engine's cancer and noncancer levels, and its key letter (`c` or `n`) is
checked against the endpoint the engine finds governing.

## What the fixture holds

- `sweeps`: per sweep, the cells compared, reproduced, excepted and unexplained. The test recomputes them.
- `classes`: each excepted class with its reason, the number of cells per sweep and the chemicals it names. A cell
  is excepted only when it does not reproduce and belongs to a class; a cell that reproduces is counted as
  reproduced whatever its chemical.
- `unexplained`: every cell that neither reproduces nor belongs to a class, with the published and the computed
  value. These are counted and printed in the validation catalog, never hidden and never given a reason that was not
  found.
- `householdK`: the 265 tap water inhalation cells (93 cancer, 172 noncancer) that test K.

## Unexplained

Four tap water total cancer cells: Aroclor 1242, 1248, 1254 and 1260 print 0.0078 ug/L, the engine computes
0.007852 (rounds to 0.0079, 0.7 percent above the printed value). The ingestion and inhalation cells of these rows
reproduce on their own (the printed dermal cell is blank, the chemicals are outside the RAGS E prediction domain),
and the total is their harmonic sum. Adding a dermal term from the database permeability values would move the
total to 0.0020, so a missing dermal term does not explain the gap. No reason was found; it is not widened. No
engine numerics were changed.

## Not in the sweep

- Soil inhalation and the soil totals that include it: the volatilization and particulate emission factors are not
  computed here (classes `soil-inhalation-not-computed` and `soil-total-with-inhalation-not-computed`).
- The summary columns other than industrial air: the tap water summary level is the lower of the two tap water
  totals already compared (a data test asserts this), the resident air summary is the lower of the two resident air sheet levels (the test checks all 367 rows), and
  the soil summary levels rest on the soil inhalation terms and the table's ceiling and saturation caps.
- Pathway cells the table leaves blank: nothing is published to compare.
