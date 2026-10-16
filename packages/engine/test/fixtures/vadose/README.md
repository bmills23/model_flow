# Vadose leaching fixtures

Hand-entered validation data for the M2 vadose methods. Retrieved and checked 2026-10-16. These are test
inputs only, not a product database. Stage L and M tests compare the engine against them.

## r7.json: Table R-7 (`arcadis2001`)

Source: Table R-7 of the review of RISC v4.0 (`arcadis2001`), as reproduced in Appendix R of the RISC5
user's guide (Nov 2014). Soil, source and loading inputs are copied from the table in its own units.

Benzene properties are not in the table. The six values (M = 78 g/mol, S = 1750 mg/L, H = 0.228,
Koc = 59 mL/g, D_a = 0.088 cm^2/s, D_w = 9.8e-6 cm^2/s) come from the benzene column of the RISC4
chemical database (`spence2001`). They are fixture inputs for this one case, not a product database.

Interpretations (all recorded in `docs/methods/vadose-leaching.md`, fixture plan):

- The 4.0 m above the source includes the 0.2 m lens: 3.8 m of vadose soil plus the lens. Hence
  `vadoseAboveSource.thicknessM` is 3.8.
- L_d = 5.5 m (leaching distance below the source centre is not listed; fixed by this reading),
  L_u = 2.8 m (transport distance to the water table).
- The source and the soil below it use the vadose soil's hydraulic parameters.
- The table's "TPH Molecular Weight [mg/kg]" is read as g/mol (a unit typo in the table).
- Decay (0.001 1/d) acts on the dissolved phase; the source has no decay.
- Years are 365 days.
- Targets: source pore water 224 mg/L at 1 percent; water table at 10 yr 10.8 mg/L at 3 percent,
  compared with the mean of the twelve month-end values in year 10. A reconstruction gives 10.69 mg/L
  that way and 14.1 mg/L as the point value at exactly 10 yr. The review's independent 11.0 mg/L used an
  approximate erf formula and is not used as a target. The value is ill-conditioned (5 percent on Koc
  moves it about 25 percent), so this fixture reproduces the review's arithmetic and is not evidence of
  model accuracy.

## vga1982-a1.json: van Genuchten and Alves 1982, Table 6 (`vangenuchten1982`)

Sample output of program A1, printed page 118 and 119 (pages 121 and 122 of
https://www.ars.usda.gov/arsuserfiles/20360500/pdf_pubs/P0753.pdf). Inputs v = 1, D = 4, R = 1,
Ci = 0, C0 = 1, T0 = 1000. Concentration versus distance (0 to 20 in steps of 2) at t = 5, 10, 15, 20,
25, for the first-type inlet (case C13 with no decay or depletion) and the third-type inlet (C14
likewise), four decimals as printed. Digits were read from 300 dpi renders of the scan.

Reading notes:

- First-type, t = 10, x = 14: the third printed glyph is degraded and reads as 0.4461 or 0.4481. The
  closed form gives 0.44807, so 0.4481 is entered. Every other first-type value agrees with the
  closed-form first-type solution to within print rounding (worst 5.05e-5).
- Third-type values agree with the closed-form C14 to 1.3e-4 at worst (t = 25, x = 20: printed 0.6334,
  closed form 0.63353; several more points exceed 5e-5). The 1982 program evidently evaluated
  C14 slightly differently at large x and t. The base tolerance stays 5e-5 absolute. Bryan's ruling of
  2026-10-16 (`docs/DECISIONS.md`, "M2 tolerance rulings and engine screening choices") names eight
  points as exceptions, asserted at 1.5e-4 absolute: first-type t = 5, x = 18; third-type t:x = 10:8,
  10:18, 15:20, 20:20, 25:16, 25:18, 25:20. They are listed in `namedExceptions` in
  `vga1982-a1.json`. The other 102 printed values stay at 5e-5.
