# Exposure fixtures

Hand-entered validation data for the M4 exposure methods. Retrieved and checked 2026-10-16. These are
test inputs only, not a product database.

## r9.json: Table R-9 (`arcadis2001`), legacy method

Source: Table R-9 (page 1 of 3) of the review of RISC v4.0 (`arcadis2001`), as reproduced in Appendix R
of the RISC5 user's guide (Nov 2014), printed page R-19. The guide reproduces only page 1 of the three
pages. Pages 2 and 3 are not available. Four chemicals (arsenic, benzene, benzo(a)pyrene, TPH aliphatic
C12-C16) at 5 mg/kg in soil and 2 mg/L in water.

Targets are the table's "calculated" rows (not its "RISC" rows), entered as the printed strings so the
test derives its tolerance, half a unit in the last printed digit. A printed "NQ" asserts a `null` risk
or hazard quotient (no toxicity value for that endpoint). Rows used: soil ingestion, dermal contact with
soil, groundwater ingestion, dermal contact in the shower, each with dose, cancer risk and hazard
index. Rows deferred: inhalation in the shower (needs the M7 shower model) and root vegetables (M9).

The table lists no exposure inputs. Following the Table R-7 convention, the inputs come from the RISC4
manual (`spence2001`) for this one case only, not as product defaults:

- Adult resident reasonable-maximum factors, Table 6-2: BW 70 kg, LT 70 yr, ED 30 yr, EF 350 d/yr,
  soil ingestion 100 mg/d, water ingestion 2 L/d, shower skin area 23,000 cm^2, shower time 0.2 h/d.
- Chemical values, Table 11-1: oral slope factors 1.5, 0.029 and 7.3 per mg/kg-d (arsenic, benzene,
  benzo(a)pyrene); oral reference doses 3e-4 (arsenic) and 0.1 mg/kg-d (the TPH fraction); dermal-soil
  absorption 0.03 for arsenic and 0.1 for the others; Kp 1e-3, 0.021, 1.2 and 8.2 cm/h.
- BIO = 1.

Readings (recorded in `docs/methods/exposure-and-risk.md`, fixture plan):

- The table's "CDI" is the noncancer dose (CADD, with EF/365 and no ED/LT factor). Its cancer risk is
  SF x CADD x ED / LT, its hazard index is CADD / RfD. A chemical without the value gives "NQ".
- Years are 365 days.
- **The dermal-soil rows need a product SAs x AF of 5,750 cm^2 mg/cm^2, which is back-solved from the
  table.** No RISC4 default gives it (Table 6-2's 23,000 x 0.56 x 0.2 = 2,576 does not reproduce the
  rows), so the fixture enters SAs = 5,750 cm^2 and AF = 1 mg/cm^2. Those rows test only the arithmetic
  and the absorption ratio between chemicals, not any default.
- The shower dermal dose is C x SA x Kp x ET x EF / (BW x 365) with the water in mg/cm^3 (1 L = 1000
  cm^3) and Kp in cm/h.

This reproduces the review's arithmetic and is not evidence of model accuracy.
