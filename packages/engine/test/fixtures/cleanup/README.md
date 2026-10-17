# Cleanup level fixtures

Validation data for the M5 cleanup levels (`docs/methods/cleanup-levels.md`, "Fixture plan"). Test inputs
only, not a product database.

## ssg1996-table-a1.json: generic soil-to-groundwater levels (`epa1996ssg`)

Table A-1 (pages A-2 to A-5) prints the generic level for each chemical at DAF 20 and DAF 1. Thirty
MCL-based values are used (15 chemicals, two DAFs). Inputs: the 1996 MCL of Table 1; Koc and H' from the
Technical Background Document Table 36 (the same values as the User's Guide Table C-1); metal Kd at pH 6.8
from Table 46 (antimony 45, arsenic 29, barium 41, cadmium 75, chromium(VI) 19, selenium 5 L/kg; H' is
zero for metals); the document's default soil (rho_b 1.5 kg/L, rho_s 2.65 kg/L, f_oc 0.002, theta_w 0.3).
The engine uses theta_a = n - theta_w = 0.1340 unrounded (the document prints 0.13); both reproduce all
thirty values. The organic Koc and H' are not the RSL's current ones (the RSL has moved on from the 1996
values), so the RSL table cannot stand in for them. Tolerance: the table's own rounding, half a unit in the
last printed digit (two significant figures from 10 up, one below). The stage 1 reading (2026-10-16) was from the
Internet Archive capture of the EPA SEMS copy (the SEMS host was unreachable); the inputs here were
checked by reproducing all thirty printed values, and the metal Kd values agree with the RSL parameters
table (reference `SSL`).

The hand cases H3 and H4 live in `test/cleanup-ssg.test.ts` with their derivations beside them.
