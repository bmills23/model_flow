# Vapor fixtures

Hand-entered validation data for the M6 vapor methods. Test inputs and printed results only, not a
product database. Readings and tolerances are recorded in `docs/methods/vapor-models.md`, "Fixture plan".

## risc-r3-r5.json: Tables R-3, R-4 and R-5 (`arcadis2001`)

Source: Appendix R of the RISC5 user's guide (review of RISC v4.0). Inputs and the RISC result column are
copied in the table's own units; the independent column of R-3 is recorded, not asserted. Benzene properties
are the RISC4 database values (`spence2001`), fixture inputs for these cases only.

Readings (all in the methods note): the source soil block of Table R-4 (porosity 0.35, moisture 0.15, bulk
density 1.7, f_oc 0.01) is used for R-3 and R-4; the lens lies outside the 2.60 m vadose zone (L_T 2.80 m);
Table R-5 is a diffusion-only run (Q_soil = 0); the degradation rate of 0.09 per day is applied in the water
phase form lambda theta_w C_w; air viscosity 1.8e-4 g/(cm s). Tolerance 0.5 percent of the RISC value.

## appendix-j.json: Appendix J worked example

Source: Appendix J of the RISC5 user's guide. The "normalized concentration at the top of layer 1" values
(0.65, 0.8, 0.95) are stated in its prose from figures, so they are figure readings: absolute tolerance 0.01.
Outdoor case (zero concentration at the ground surface); the layer inputs of the base, dry and wet cases are
the readings in the methods note. The "wet" case is cumulative: it keeps the dry layer 1 (porosity 0.40,
moisture 0.05) and wets layer 2 (porosity 0.35, moisture 0.30). Wetting layer 2 alone gives 0.907, outside
the tolerance; the cumulative reading gives 0.9553.

## Named exception: Table R-6

Table R-6 (groundwater to outdoor air) prints 2.27e-3 mg/m^3, equal to Table R-5's indoor result to three
figures, and no box reading reproduces it (the box gives 2.54e-6 mg/m^3). It is asserted by slice V3 (`test/outdoor-air.test.ts`, box hand value at 1e-9) and is
treated as a transcription error in the review; it is never widened into a tolerance.

## DeVaull 2007: no published numeric fixture

No published numeric example of the DeVaull model could be verified (the paper is paywalled and the
BioVapor manual prints no worked case with outputs), so slice V5 (`test/vapor-devaull.test.ts`) rests on
identities (L_a = 0 and k_w = 0 equal Johnson and Ettinger, L_a entered equals the dominant-layer model
with layer 3 absent) and hand cases built from independent closed forms. There is no fixture file.

## visl.json: identity fallback (VISL calculator values not obtained in V6)

The online VISL calculator was not run in slice V6, so `test/vapor-screening.test.ts` uses the fallback in the
methods note: identity 8c (groundwater screening level times AF times H' times 1000 L/m^3 equals the target
indoor air) against the RSL resident air values for benzene and naphthalene already used by M4. No printed
VISL figure is asserted. The calculator's output for five chemicals was recorded on 2026-10-22
(`packages/data/raw/visl/visl-default-resident-2026-10-22.json`, form defaults, hazard quotient 0.1); comparing
the engine with it is open.

## epa2004-sl-adv.json: EPA 2004 Appendix C worked example (`epa2004je`)

The SL-ADV benzene example of the EPA Johnson and Ettinger user's guide (data entry, chemical properties and
intermediate calculations sheets). The file holds the inputs, the reading of the strata (in its `readings`
field) and the printed intermediate and final values. The test `test/vapor-epa-je.test.ts` compares each
printed value the test uses to half a unit in its last printed digit.
