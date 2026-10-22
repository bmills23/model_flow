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
index. Named exception: inhalation in the shower (its droplet, flow, stall and film inputs are not available, so the row cannot be reproduced without inventing them; DECISIONS.md, M7 slice E4). Row deferred: root vegetables (M9).

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

## rsl-2024-11.json: RSL independent check (`epa2024rsl`), modern method

Retrieved 2026-10-16. Each case is a published two-figure screening level (target risk 1e-6, hazard
quotient 1) read from the November 2024 RSL spreadsheet named by its SEMS document number: resident soil
(405274), composite worker soil (405278), resident tap water (405290) and resident air (405282). The
chemical inputs (toxicity, ABSd, GIABS, Kp, tau, B, t*, FA, EPD flag, Csat) are copied from the committed
RSL build in `packages/data/generated/rsl-2024-11/`, plus `organic` (copied from the build's `dermalForm`: false for arsenic and for the five other
inorganics added here, cadmium (water), Cr(VI), mercuric chloride, nickel soluble salts and zinc, whose published
tap water ingestion and dermal values are included) and `rba` 0.6 for arsenic. A null cancer or noncancer value is a
blank cell in the table, and the test asserts the engine has no coefficient for that endpoint. The test
requires the engine's screening level to round to the published value (half a unit in its second
significant figure). Tap-water inhalation, soil inhalation and the noncancer worker air value are not
checked by these cases; the sweep of the published tables (`fixtures/rsl-sweep`) covers tap-water
inhalation and the industrial air levels, and soil inhalation is still not checked. The benzo(a)pyrene tap-water dermal value is omitted by the RSL (outside the
prediction domain), so it has no case.

## rsl-2024-11-default-parameters.json: RSL default exposure parameters

Values typed from the "Default Exposure Parameters and Definitions" workbook (SEMS 404323, SHA-256 in
the file), sheets "Ingestion and Dermal Rates", "EF, ED, ET" and "Miscellaneous Variables". The presets
test compares the modern resident and composite worker boundary presets, the ADAF age segments and the
sheet's own age-adjusted factors (327.95, 1019.9, 36750, 166833.33, 103390, 428260, 2610650, 8191633).

