# Cleanup level fixtures

Validation data for the M5 cleanup levels (`docs/methods/cleanup-levels.md`, "Fixture plan"). Test inputs
only, not a product database.

## ssg1996-table-a1.json: generic soil-to-groundwater levels (`epa1996ssg`)

Table A-1 (pages A-2 to A-5) prints the generic level for each chemical at DAF 20 and DAF 1. Thirty
MCL-based values are used (15 chemicals, two DAFs). Inputs: the 1996 MCL of Table 1; metal Kd at pH 6.8
from Table 46 (antimony 45, arsenic 29, barium 41, cadmium 75, chromium(VI) 19, selenium 5 L/kg; H' is
zero for metals); the document's default soil (rho_b 1.5 kg/L, rho_s 2.65 kg/L, f_oc 0.002, theta_w 0.3).
The engine uses theta_a = n - theta_w = 0.1340 unrounded (the document prints 0.13); both reproduce all
thirty values.

What this fixture validates and what it does not. It checks the three-phase partition formula and the
DAF arithmetic to the table's rounding, and the metal Kd values (which agree with the RSL parameters table).
The nine organic Koc and H' values were checked on 2026-10-21 against the EPA SEMS copy of the document
(semspub.epa.gov/work/HQ/207.pdf). Each H' is the dimensionless constant (column HN) of Table 36, "Chemical-Specific
Properties Used in SSL Calculations" (printed pp. 132 to 136); each Koc is the "calculated Koc" of Table 39,
"Comparison of Measured and Calculated Koc Values" (printed pp. 141 to 145). All nine Koc values and eight of
nine H' values matched as typed; PCE's H' was typed 0.753 and Table 36 prints 7.54E-01, so the fixture now
carries 0.754 (the test still passes at the same tolerance). Table C-1 of the User's Guide is not in that
document and was not read. The inorganic Kd values come from Table 46 as stated above and were not re-read on
that date. Fixture 2 (91 RSL rows, two figures, in the data package) is the independent constraint on the formula.

The organic Koc and H' are not the RSL's current ones (the RSL has moved on from the 1996
values), so the RSL table cannot stand in for them. Tolerance: the table's own rounding, half a unit in the
last printed digit (two significant figures from 10 up, one below). The stage 1 reading (2026-10-16) was from the
Internet Archive capture of the EPA SEMS copy (the SEMS host was unreachable); the inputs here were
checked by reproducing all thirty printed values, and the metal Kd values agree with the RSL parameters
table (reference `SSL`).

The hand cases H3 and H4 live in `test/cleanup-ssg.test.ts` with their derivations beside them.

## rsl-2024-11-cleanup.json: RSL combined tap water levels and risk-based SSLs (`epa2024rsl`)

Retrieved 2026-10-16 (checked against the M4 kernels the same day). Chemical toxicity and dermal inputs
are those of `../exposure/rsl-2024-11.json`; this file adds only the published values and, for the SSLs,
the partition inputs copied from the committed RSL build (`packages/data/generated/rsl-2024-11/`, Kd with
reference `SSL` for the metals, Koc and H' for acetone).

- `tapWaterCombined` (fixture 4): the resident tap water table's carcinogenic and child noncarcinogenic
  screening levels in ug/L, each the combined level over ingestion and bathing dermal. A null cancer
  value is a blank cell. Tolerance: half a unit in the second significant figure.
- `riskBasedSsl` (fixture 3): the summary table's risk-based soil-to-groundwater SSL (DAF 1) in mg/kg for
  the six chemicals with no household-use inhalation term. The engine value is the unrounded lower of
  the cancer and noncancer tap water levels (TR 1e-6, THQ 1) times the partition factor. Tolerance: half a
  unit in the second significant figure. Volatile chemicals with an IUR or RfC and benzo(a)pyrene are
  excluded (see the methods note, fixture 3).

## Hand case H2 (cumulative proportional scaling), recorded values

Modern resident, drinking water plus bathing, benzene 0.01 mg/L and arsenic 0.002 mg/L entered. The test
recomputes the scale from the M4 coefficients independently (1e-9 relative); the engine's values on
2026-10-17 are s = 0.021372453 (cancer limits), giving 2.1372453e-4 mg/L benzene and 4.2744906e-5 mg/L
arsenic, ratio exactly 5.
