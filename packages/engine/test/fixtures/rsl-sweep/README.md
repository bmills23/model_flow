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
as the household term takes it). A total is the sum of the pathways whose cells the table prints. For soil, the
inhalation term is the receptor's air coefficient (24 h and 350 d for the resident, 8 h and 250 d for the worker)
times 1/VF + 1/PEF, composed in `rslSweepHelpers.ts` from the volatilization factor and the wind-erosion
particulate emission factor methods (see Soil inhalation below). The summary's
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
- `soilInhalation`: per soil table, the inhalation cells and the soil totals that include one, each with compared,
  reproduced, excepted and unexplained counts. The test recomputes them from the data.

## Trichloroethylene and vinyl chloride

The RSL tables compute the cancer levels of these two chemicals with their own equations (the cancer and
mutagenic parts of trichloroethylene's values; vinyl chloride's added early-life term). The engine applies those
equations (wave T, 2026-10-23) to the resident, so the tap water cancer cells (ingestion, dermal, inhalation and
total, 8 cells), the resident soil ingestion cancer cells (2) and the resident air cancer cells (2) reproduce, all
265 tap water inhalation cells reproduce, and the class that excepted them (`special-case-equations`) is gone.
The composite worker cells of both chemicals reproduce as ordinary chemicals. Their soil inhalation cancer cells
and the soil cancer totals that include them reproduce too (wave U, below).

## Soil inhalation

The RSL soil inhalation level is the air level of the receptor times 1/VF + 1/PEF (user's guide sections 4.1.1 and
4.2.1; guide read 2026-10-23, see the reference notes of `epa2024rslug`). The sweep composes it from the engine's
volatilization factor (`outdoorAir.ssg-vf-1996`, infinite source) and wind-erosion particulate emission factor
(`particulate.ssg-pef-2002`), with the inputs of the RSL default parameter file: Q/C for volatiles 68.18, an
exposure interval of 26 years, a dry bulk density of 1.5 and particle density of 2.65 g/cm^3 (porosity 1 - 1.5/2.65,
not the rounded 0.43), water-filled porosity 0.15, organic carbon 0.006, Kd = Koc f_oc, pi printed as 3.14 (the
factor is rescaled by sqrt(3.14 / pi)), and the wind factor with Q/C 93.77 (PEF 1.36E9 m^3/kg). Chemicals the tables
call volatile take both terms, the others the particulate term. A hand calculation of benzene (all four levels) is
in the test. Of 435 inhalation cells and 435 totals that include one per table, the resident table reproduces 421 and
422 (PCB 105 is excepted) and the industrial table 422 and 421.

Class `soil-inhalation-vf-input-missing` and `soil-total-vf-input-missing`: twelve volatile chemicals have neither a
Koc nor a Kd in the parameter sheet, so no volatilization factor is computed; their printed cells equal the
particulate-only level, which the sweep checks cell by cell before excepting them (13 inhalation cells and 13 totals
per table). The guide text read does not say what the tables do without a Kd, so these are excepted, not counted as
reproduced. The vinyl chloride equation image prints the volatilization factor term only; the sweep adds the
particulate term (under one part in 100000 of the sum, checked by the test).

## Excepted by a printed input's rounding

Class `printed-three-figures`: five cells, where the tables print a toxicity value to three significant figures and
the value they computed with lies in the half-unit interval of the third figure, closed at its bottom and open at its
top (a value at the top prints the next figure up). The level is monotone in the value, so the sweep excepts a
non-reproducing cell only when the engine's levels at the two ends of the interval meet the interval of values that
print as the cell (`reachableWithinPrinted`, `attainedMeetsPrinted`); the value must need exactly three figures, since
one or two may be exact. The cancer cells test the inhalation unit risk, the noncancer cells the reference
concentration. The unrounded value is not printed, so these are excepted, not counted as reproduced, and the engine
keeps the printed value.

- Four tap water total cancer cells (4). Aroclor 1242, 1248, 1254 and 1260 print 0.0078 ug/L and the engine computes
  0.007852 (rounds to 0.0079). The unit risk is printed 5.71E-4, so the value lies in [5.705E-4, 5.715E-4); at
  5.7118E-4 or more the total is 0.00785 or less and prints 0.0078, and the ingestion, inhalation and air cells of
  the rows reproduce at either end. A missing dermal term does not explain the gap (it would move the total to
  0.0020).
- One resident soil cell (1). The noncancer inhalation level of PCB 105 prints 840 mg/kg and the engine computes
  833.3 from the printed reference concentration 1.33E-3. The RSL key `W` means a TEF was applied to the toxicity
  value, and the guide's table prints the TEF (3E-5 for PCB 105); the tables print the TEF-applied reference
  concentration to three figures, and the unrounded quotient 4E-8 / 3E-5 = 1.3333E-3 reproduces the printed 840
  (835.4). The database keeps the printed 1.33E-3 for all twelve numbered PCBs.

## Unexplained

One soil cell: the industrial noncancer total of n-nonane prints 72 mg/kg and computes 72.5012 mg/kg, 0.002 percent
above the half-unit limit of 72.5. The printed volatilization factor (1040, three figures) agrees with the engine's
1043.6, and the inhalation cell (91) and ingestion cell (350) reproduce; a rise of about 0.0035 percent in the
volatilization factor would close the total, and no printed input or rule found accounts for it. It is not widened.

## Not in the sweep

- The summary columns other than industrial air: the tap water summary level is the lower of the two tap water
  totals already compared (a data test asserts this), the resident air summary is the lower of the two resident air sheet levels (the test checks all 367 rows), and
  the soil summary levels are not compared (they add the table's ceiling and saturation keys).
- Pathway cells the table leaves blank: nothing is published to compare.
