# Saturated soil source fixtures

Validation data for the M3 saturated soil source methods (`docs/methods/saturated-soil-source.md`,
"Fixture plan"). Retrieved and checked 2026-10-16. Test inputs only, not a product database.

## ssg1996-csat.json: soil saturation limits (`epa1996ssg`)

Table 3-A prints Csat for six chemicals. With the document's default soil (rho_b 1.5 kg/L, f_oc 0.006,
theta_w 0.15, theta_a 0.28; equation 9 and its parameter table) Csat is the soil saturation limit
x S (rho_b K_d + theta_w + H theta_a) / rho_b with x = 1. S and H' are from Table 36. Koc is the calculated
column of Table 39, not the measured column (the measured column does not reproduce Table 3-A). Tolerance:
half a unit in the second printed significant figure. The engine values from these inputs are recorded in
the file (`engineValueMgPerKg`); ethylbenzene and 1,2-dichlorobenzene sit within 0.4 mg/kg of the band
edge, so the input digits must be exactly the printed ones.

## bioscreen-mass.json: soluble mass (`newell1996`)

The soluble-mass example (zones of 100, 220 and 400 ft^2, 20 ft deep, 1.7 kg/L, at 600, 50 and 10 mg/kg)
checks M0 = F rho_b H_s A. Printed 58, 11 and 4 kg, each within 0.5 kg, with 1 ft = 0.3048 m exactly. The
printed total of 73 kg is the sum of the rounded zone masses (unrounded 72.2 kg) and is not used. The
source decay constant k_s = Q C0 / M0 (Appendix A.3) is asserted directly in the tests.

## hand-cases.json: constructed cases A and B

Computed by an independent script (not the engine) from the equations in the methods note, at full double
precision, then stored in practical units. Common inputs: L = W = 10 m, H_s = 2 m, porosity 0.30,
rho_b 1.7 g/cm^3, f_oc 0.002, K 5 m/d, i 0.01, q 20 cm/yr, theta_r 0.05, n 1.5 (Brooks-Corey with the
Lenhard conversion), benzene M 78 g/mol, S 1750 mg/L, H 0.228, Koc 59 mL/g (the RISC4 values used by the
M2 Table R-7 fixture), years of 365.25 days. Case A has a separate phase and a fluctuating water table;
case B has neither. Tolerance 1e-9 relative (arithmetic); initial mass 17 and 34 kg to 1e-12.

The seasonal depletion time of case A (1737.2300 d) takes high water first for the first fraction of
every year, the convention of the note.
