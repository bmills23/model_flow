# Validation

Generated 2026-10-23 from the fixtures under `packages/engine/test/fixtures`, their READMEs and tests, `packages/engine/src/references/references.json` and the method registry. Do not edit by hand.

Each published worked example the test suite reproduces is listed with its source, the method it checks, what is compared, the number of cases and the tolerance the test enforces. A test that passes at its tolerance shows agreement with the published value to that tolerance; it is not a statement about model accuracy. The observed largest error is not reported, only the enforced tolerance.

Summary: 44 entries (39 reproduced, 3 named exception, 1 pending or deferred, 1 smoke test only).

## Worked examples

### Reproduced

#### ANALGWST POINT3, continuous point source

- Source: `analgwst`, ANALGWST (analytical groundwater solute transport code), version 1.1
- Method: `groundwater.at123d`
- Compared: Concentration on the printed grid at each printed time and depth, decay 0 and 0.03 per day, against the program output.
- Cases: 756 printed concentrations
- Tolerance: Half a unit in the last printed decimal: 5e-7 absolute (test bound 5.1e-7), plus 1e-9 relative.
- Status: reproduced
- Fixture: `analgwst/point3-nodecay.json`, `analgwst/point3-decay.json`; test `groundwater-fixtures.test.ts`

#### ANALGWST PATCHI, patch source on the inflow plane

- Source: `analgwst`, ANALGWST (analytical groundwater solute transport code), version 1.1
- Method: `groundwater.wexler1992`
- Compared: Concentration on the printed grid at each printed time and depth, decay 0 and 0.01 per day, against the program output.
- Cases: 1120 printed concentrations
- Tolerance: Half a unit in the last printed decimal: 5e-7 absolute (test bound 5.1e-7), plus 1e-9 relative.
- Status: reproduced
- Fixture: `analgwst/patchi-nodecay.json`, `analgwst/patchi-decay.json`; test `groundwater-fixtures.test.ts`

#### ANALGWST PATCHF, finite aquifer with no-flux boundaries

- Source: `analgwst`, ANALGWST (analytical groundwater solute transport code), version 1.1
- Method: `groundwater.wexler1992`
- Compared: Concentration on the printed grid at each printed time and depth in a 60 m wide, 10 m thick aquifer, decay 0 and 0.01 per day, against the program output.
- Cases: 1296 printed concentrations
- Tolerance: Half a unit in the last printed decimal: 5e-6 absolute (test bound 5.1e-6), plus 1e-9 relative.
- Status: reproduced
- Fixture: `analgwst/patchf-nodecay.json`, `analgwst/patchf-decay.json`; test `groundwater-fixtures.test.ts`

#### mibitrans Bioscreen, truncated Domenico solution

- Source: `mibitrans`, mibitrans
- Method: `groundwater.domenico1987`
- Compared: The truncated Domenico plume concentration at sampled (x, y, t) points against the package output.
- Cases: 96 points
- Tolerance: 1e-9 absolute plus 1e-9 relative.
- Status: reproduced
- Fixture: `mibitrans/cases.json`; test `groundwater-fixtures.test.ts`

#### mibitrans Mibitrans, exact patch solution

- Source: `mibitrans`, mibitrans
- Method: `groundwater.wexler1992`
- Compared: The exact Wexler patch solution (no source depletion) at the same sampled points against the package output.
- Cases: 96 points
- Tolerance: 1e-10 absolute plus 1e-7 relative.
- Status: reproduced
- Fixture: `mibitrans/cases.json`; test `groundwater-fixtures.test.ts`

#### SSG 1996 Table A-1, generic soil-to-groundwater levels

- Source: `epa1996ssg`, Soil Screening Guidance: Technical Background Document
- Method: `cleanup.ssg-leaching`
- Compared: The MCL-based generic level at DAF 20 and DAF 1 for 15 chemicals. It checks the three-phase partition formula, the DAF arithmetic and the metal Kd values; the organic Koc and H were read from Tables 36 and 39 of the document on 2026-10-21.
- Cases: 30 printed levels
- Tolerance: Half a unit in the last printed digit: two significant figures from 10 up, one below 10.
- Status: reproduced
- Fixture: `cleanup/ssg1996-table-a1.json`; test `cleanup-ssg.test.ts`

#### RSL November 2024 resident tap water, combined levels

- Source: `epa2024rsl`, Regional Screening Levels (RSLs), Generic Tables, November 2024
- Method: `cleanup.rags-e-f-2014`
- Compared: The carcinogenic and child noncarcinogenic tap water levels over ingestion and bathing dermal, back-calculated by the cleanup solver. A blank cell is asserted as no level.
- Cases: 9 published levels
- Tolerance: Half a unit in the second significant figure.
- Status: reproduced
- Fixture: `cleanup/rsl-2024-11-cleanup.json`; test `cleanup-direct.test.ts`

#### RSL November 2024 risk-based soil-to-groundwater SSL

- Source: `epa2024rsl`, Regional Screening Levels (RSLs), Generic Tables, November 2024
- Method: `cleanup.ssg-leaching`, `cleanup.rags-e-f-2014`
- Compared: The DAF 1 risk-based SSL for the six chemicals with no household-use inhalation term: the unrounded lower tap water level times the partition factor.
- Cases: 6 published levels
- Tolerance: Half a unit in the second significant figure.
- Status: reproduced
- Fixture: `cleanup/rsl-2024-11-cleanup.json`; test `cleanup-rsl-ssl.test.ts`

#### Table R-9, direct exposure pathways (page 1 of 3)

- Source: `arcadis2001`, Review of Risk Integrated Software for Cleanups (RISC) v4.0
- Method: `exposure.rags-a-1989`
- Compared: Dose, cancer risk and hazard index for soil ingestion, soil dermal contact, groundwater ingestion and shower dermal contact, for four chemicals. A printed NQ is asserted as a null. The table lists no exposure inputs; the RISC4 manual values are fixture inputs for this case only, and the dermal soil rows use a back-solved product of 5,750.
- Cases: 48 printed cells
- Tolerance: Half a unit in the last printed digit, derived from the printed string.
- Status: reproduced
- Fixture: `exposure/r9.json`; test `exposure-legacy-r9.test.ts`
- Note: This reproduces the review arithmetic and is not evidence of model accuracy.

#### RSL November 2024, independent check of the modern method

- Source: `epa2024rsl`, Regional Screening Levels (RSLs), Generic Tables, November 2024
- Method: `exposure.rags-e-f-2014`
- Compared: Resident soil, composite worker soil, resident tap water and resident air screening levels at target risk 1e-6 and hazard quotient 1. A blank cell is asserted as no coefficient.
- Cases: 50 published levels
- Tolerance: The engine value rounds to the published value: half a unit in the second significant figure.
- Status: reproduced
- Fixture: `exposure/rsl-2024-11.json`; test `exposure-modern-rsl.test.ts`

#### RSL November 2024 default exposure parameters

- Source: `epa2024rsl`, Regional Screening Levels (RSLs), Generic Tables, November 2024
- Method: `exposure.rags-e-f-2014`
- Compared: The modern resident and composite worker presets, the ADAF age segments and the sheet’s own age-adjusted factors.
- Cases: 8 age-adjusted factors (the preset values are compared as well)
- Tolerance: Equal to the printed precision of each factor (toBeCloseTo at 1 to 6 decimals).
- Status: reproduced
- Fixture: `exposure/rsl-2024-11-default-parameters.json`; test `exposure-modern-presets.test.ts`

#### SSG 1996 Table 3-A, soil saturation limits

- Source: `epa1996ssg`, Soil Screening Guidance: Technical Background Document
- Method: `saturatedSource.two-region`
- Compared: The soil saturation limit Csat for six chemicals with the document’s default soil.
- Cases: 6 printed limits
- Tolerance: Half a unit in the second printed significant figure (per-chemical bound in the file).
- Status: reproduced
- Fixture: `saturatedSource/ssg1996-csat.json`; test `saturated-fixtures.test.ts`

#### BIOSCREEN soluble mass example

- Source: `newell1996`, BIOSCREEN natural attenuation decision support system, user's manual
- Method: `saturatedSource.exponential`
- Compared: The initial soluble mass of three zones, M0 = F rho_b H_s A.
- Cases: 3 zone masses
- Tolerance: 0.5 kg absolute (the printed masses are rounded to kg).
- Status: reproduced
- Fixture: `saturatedSource/bioscreen-mass.json`; test `saturated-fixtures.test.ts`

#### Saturated soil source constructed cases A and B

- Source: Constructed cases computed by an independent script from the equations of the methods note; not a published example.
- Method: `saturatedSource.exponential`, `saturatedSource.two-region`
- Compared: Depletion times, rates and initial masses of a source with and without a separate phase and a fluctuating water table.
- Cases: 2 constructed cases
- Tolerance: 1e-9 relative (arithmetic); initial mass 1e-12.
- Status: reproduced
- Fixture: `saturatedSource/hand-cases.json`; test `saturated-release.test.ts`
- Note: An arithmetic cross-check, not a comparison with a published value.

#### Table R-8, river and lake mixing

- Source: `arcadis2001`, Review of Risk Integrated Software for Cleanups (RISC) v4.0
- Method: `surfaceWater.well-mixed`, `surfaceWater.mass-discharge`
- Compared: Groundwater flow, mass flux, the river and lake concentrations and the sediment concentration. The RISC4 benzene Koc is a fixture input for this case only.
- Cases: 5 printed values
- Tolerance: Half a unit in the last printed digit (0.005 mg/L, 0.005 mg/kg, 0.5 mg/d).
- Status: reproduced
- Fixture: `surfaceWater/r8.json`; test `surfacewater-r8.test.ts`
- Note: The review reports exact agreement with its own hand calculation, so this reproduces arithmetic, not model accuracy.

#### RISC5 user’s guide Appendix L, river and lake examples

- Source: RISC5 user’s guide, Appendix L (not a references.json record).
- Method: `surfaceWater.well-mixed`
- Compared: The river (30.8 mg/L) and lake (11.7 mg/L) concentrations. The adjusted-volume lake example is not used.
- Cases: 2 printed values
- Tolerance: Half a unit in the last printed digit (0.05 mg/L).
- Status: reproduced
- Fixture: `surfaceWater/manual-l4.json`; test `surfacewater-r8.test.ts`

#### Table R-7, vadose leaching to the water table

- Source: `arcadis2001`, Review of Risk Integrated Software for Cleanups (RISC) v4.0
- Method: `vadose.vadsat`
- Compared: The source pore water concentration and the water table concentration at 10 years (mean of the twelve month-end values of year 10). Benzene properties are RISC4 values used for this case only.
- Cases: 2 printed values
- Tolerance: 1 percent (source pore water) and 3 percent (water table) relative.
- Status: reproduced
- Fixture: `vadose/r7.json`; test `vadose-r7.test.ts`
- Note: The water table value is ill-conditioned (5 percent on Koc moves it about 25 percent), so this reproduces the review arithmetic and is not evidence of model accuracy.

#### van Genuchten and Alves 1982 Table 6, program A1 output

- Source: `vangenuchten1982`, Analytical solutions of the one-dimensional convective-dispersive solute transport equation
- Method: `vadose.vadsat`, `vadose.layered`
- Compared: Concentration against distance at five times for the first-type and third-type inlets, without decay or depletion.
- Cases: 102 printed values
- Tolerance: 5e-5 absolute (four decimals as printed).
- Status: reproduced
- Fixture: `vadose/vga1982-a1.json`; test `vadose-legacy.test.ts`
- Note: One first-type value (t = 10, x = 14) has a degraded printed glyph and is entered as the closed form reads it.

#### Tables R-3, R-4 and R-5, vapor intrusion

- Source: `arcadis2001`, Review of Risk Integrated Software for Cleanups (RISC) v4.0
- Method: `vapor.je-1991`, `vapor.dominant-layer-1998`
- Compared: Soil to indoor air with and without TPH (R-3), the dominant layer with degradation (R-4) and groundwater to indoor air (R-5). The independent column of R-3 is recorded, not asserted.
- Cases: 6 printed results
- Tolerance: 0.5 percent of the RISC value (the test asserts it seven times: the six printed results and a second run of R-3 case A without degradation).
- Status: reproduced
- Fixture: `vapor/risc-r3-r5.json`; test `vapor-legacy.test.ts`

#### RISC5 user’s guide Appendix J, layered vapor example

- Source: RISC5 user’s guide, Appendix J (not a references.json record).
- Method: `vapor.dominant-layer-1998`
- Compared: The normalized concentration at the top of layer 1 for the base, dry and wet cases. The values are stated in prose from figures, so they are figure readings.
- Cases: 3 figure readings
- Tolerance: 0.01 absolute.
- Status: reproduced
- Fixture: `vapor/appendix-j.json`; test `vapor-legacy.test.ts`

#### EPA 2004 Appendix C, SL-ADV benzene worked example

- Source: `epa2004je`, User's Guide for Evaluating Subsurface Vapor Intrusion into Buildings
- Method: `vapor.je-epa`
- Compared: Printed intermediate and final values of the spreadsheet example: building geometry, ventilation, permeability, effective diffusion, source vapor, and the mass-limited building concentration.
- Cases: 22 printed values
- Tolerance: Half a unit in the last printed digit of each value (the test derives it from the printed string).
- Status: reproduced
- Fixture: `vapor/epa2004-sl-adv.json`; test `vapor-epa-je.test.ts`

#### Eco-SSL wildlife derivation, cadmium and lead surrogate rows

- Source: `epaecossl`, Ecological Soil Screening Levels (Eco-SSLs)
- Method: `eco.ecossl-2005`
- Compared: The soil concentration at which the wildlife hazard quotient is 1, back-calculated from the transcribed derivation inputs of the printed surrogate rows, against the printed wildlife Eco-SSL. Avian (dove, woodcock, hawk) and mammalian (vole, shrew, weasel) surrogates for cadmium and lead.
- Cases: 12 printed surrogate values
- Tolerance: 5 percent relative (a ruling, DECISIONS.md entry 10 of the Eco-SSL milestone).
- Status: reproduced
- Fixture: none, the published values are typed in the test `eco-screening.test.ts`
- Note: The derivation inputs come from the transcribed Eco-SSL data, so this checks the back-calculation arithmetic against the printed values, not the inputs.

#### Eco-SSL wildlife guild values, cadmium mammalian and lead avian

- Source: `epaecossl`, Ecological Soil Screening Levels (Eco-SSLs)
- Method: `eco.ecossl-2005`
- Compared: The smallest surrogate value of the guild against the printed guild Eco-SSL: 0.36 mg/kg for cadmium (mammalian) and 11 mg/kg for lead (avian).
- Cases: 2 printed guild values
- Tolerance: 5 percent relative (the same ruling as the surrogate rows).
- Status: reproduced
- Fixture: none, the published values are typed in the test `eco-screening.test.ts`

#### SSG 1996 default particulate emission factor

- Source: `epa1996ssg`, Soil Screening Guidance: Technical Background Document
- Method: `particulate.ssg-pef-1996`
- Compared: The default PEF of 1.32E9 m^3/kg from the printed wind erosion inputs.
- Cases: 1 printed value
- Tolerance: Equal to the printed three significant figures (1.32e9).
- Status: reproduced
- Fixture: none, the published values are typed in the test `particulate.test.ts`

#### SSG 2002 default particulate emission factor

- Source: `epa2002ssg`, Supplemental Guidance for Developing Soil Screening Levels for Superfund Sites
- Method: `particulate.ssg-pef-2002`
- Compared: The default PEF of 1.36E9 m^3/kg with Q/C 93.77.
- Cases: 1 printed value
- Tolerance: Equal to the printed three significant figures (1.36e9).
- Status: reproduced
- Fixture: none, the published values are typed in the test `particulate.test.ts`

#### NRWQC zinc criteria at a hardness of 100 mg/L

- Source: `epanrwqc`, National Recommended Water Quality Criteria - Aquatic Life Criteria Table
- Method: none registered (a data or arithmetic function)
- Compared: The hardness-dependent acute and chronic freshwater zinc criteria computed from the Appendix B slope, intercept and conversion factor against the published 117.2 and 118.1 ug/L.
- Cases: 2 published criteria
- Tolerance: Within 0.5 ug/L (toBeCloseTo at zero decimals), and the acute value rounds to 120 at two significant figures.
- Status: reproduced
- Fixture: none, the published values are typed in the test `surfacewater-criteria.test.ts`

#### Table R-7, unit-gradient moisture content

- Source: `arcadis2001`, Review of Risk Integrated Software for Cleanups (RISC) v4.0
- Method: `vadose.vadsat`
- Compared: The moisture content that carries 20 cm/yr in the vadose soil (theta 0.0885) and in the lens (theta 0.2031) with the Brooks and Corey relative permeability.
- Cases: 2 printed values
- Tolerance: 1e-4 absolute (four decimals as printed).
- Status: reproduced
- Fixture: none, the published values are typed in the test `vadose-hydraulics.test.ts`

#### EPA 2004 Appendix C, benzene Henry constant at the system temperature

- Source: `epa2004je`, User's Guide for Evaluating Subsurface Vapor Intrusion into Buildings
- Method: `vapor.je-epa`
- Compared: The enthalpy of vaporization at 10 degrees C (8,122 cal/mol), the Henry constant (2.68e-3 atm m^3/mol) and the dimensionless constant (0.115) of the spreadsheet example.
- Cases: 3 printed values
- Tolerance: The printed digits: the enthalpy rounds to the integer, the two constants to three significant figures. The unrounded values are pinned to 1e-9 relative.
- Status: reproduced
- Fixture: none, the published values are typed in the test `vapor-source.test.ts`

#### RSL November 2024 sweep, tap water

- Source: `epa2024rsl`, Regional Screening Levels (RSLs), Generic Tables, November 2024
- Method: `exposure.rags-e-f-2014`, `shower.rsl-household`
- Compared: Resident tap water ingestion, dermal, inhalation and total, cancer (target risk 1e-6) and noncancer (child, hazard quotient 1): all 3053 printed cells against the engine. 3048 reproduce, 5 are excepted (one lead cell with no toxicity value in the database and four Aroclor total cancer cells that fall inside the rounding of the printed unit risk), 0 are unexplained.
- Cases: 3053 published screening levels
- Tolerance: The engine's unrounded value lies within half a unit of the second significant figure of the printed value; the data holds at most two significant figures in every column, and nothing is widened.
- Status: reproduced
- Fixture: `rsl-sweep/exceptions.json`; test `rsl-tables-sweep.test.ts`
- Data: `packages/data/generated/rsl-2024-11/screening-levels.json`
- Note: The 265 inhalation cells (93 cancer, 172 noncancer) are the resident air level divided by the household factor K, entered as 0.5 L/m3; all 265 reproduce, the trichloroethylene and vinyl chloride cancer cells included (through the RSL equations for those two chemicals, which the modern exposure method applies). Excepted: the total cancer level of Aroclor 1242, 1248, 1254 and 1260 is printed 0.0078 ug/L and computed 0.007852 ug/L; the tables print their unit risk as 5.71E-4 (three figures) and at 5.7118E-4 or more, inside that rounding, the total prints 0.0078.

#### RSL November 2024 sweep, resident soil

- Source: `epa2024rsl`, Regional Screening Levels (RSLs), Generic Tables, November 2024
- Method: `exposure.rags-e-f-2014`, `outdoorAir.ssg-vf-1996`, `particulate.ssg-pef-2002`
- Compared: Resident soil ingestion, dermal, inhalation and total, cancer (target risk 1e-6) and noncancer (child, hazard quotient 1): all 3012 printed cells against the engine. 2983 reproduce, 29 are excepted (26 soil inhalation cells and totals of twelve chemicals that have no volatilization factor, two lead cells with no toxicity value in the database, and the PCB 105 noncancer inhalation cell that falls inside the rounding of the printed reference concentration), 0 are unexplained.
- Cases: 3012 published screening levels
- Tolerance: The engine's unrounded value lies within half a unit of the second significant figure of the printed value; the data holds at most two significant figures in every column, and nothing is widened.
- Status: reproduced
- Fixture: `rsl-sweep/exceptions.json`; test `rsl-tables-sweep.test.ts`
- Data: `packages/data/generated/rsl-2024-11/screening-levels.json`
- Note: The soil inhalation level is the receptor's air level times 1/VF + 1/PEF, composed in the test from the volatilization factor (RSL inputs: Q/C 68.18, 26 years, the guide's soil) and the wind-erosion PEF (1.36E9 m3/kg); the engine gets no new option. A hand calculation of benzene checks the factors and all four levels. Twelve volatile chemicals have neither Koc nor Kd in the parameter sheet; their cells print the particulate-only level and are excepted, not counted as reproduced. Soil inhalation cells: 435, of which 421 reproduce and 14 are excepted; soil totals that include one: 435, of which 422 reproduce and 13 are excepted. Excepted: the noncancer inhalation level of PCB 105 is printed 840 mg/kg and computed 833.3; the tables print the TEF-applied reference concentration to three figures (1.33E-3), and the unrounded quotient 4E-8 / 3E-5 = 1.3333E-3 reproduces 840.

#### RSL November 2024 sweep, composite worker soil

- Source: `epa2024rsl`, Regional Screening Levels (RSLs), Generic Tables, November 2024
- Method: `exposure.rags-e-f-2014`, `outdoorAir.ssg-vf-1996`, `particulate.ssg-pef-2002`
- Compared: Industrial soil ingestion, dermal, inhalation and total, cancer (target risk 1e-6) and noncancer (hazard quotient 1): all 3011 printed cells against the engine. 2983 reproduce, 27 are excepted (26 soil inhalation cells and totals of twelve chemicals that have no volatilization factor, and one lead cell with no toxicity value in the database), 1 is unexplained.
- Cases: 3011 published screening levels
- Tolerance: The engine's unrounded value lies within half a unit of the second significant figure of the printed value; the data holds at most two significant figures in every column, and nothing is widened.
- Status: reproduced
- Fixture: `rsl-sweep/exceptions.json`; test `rsl-tables-sweep.test.ts`
- Data: `packages/data/generated/rsl-2024-11/screening-levels.json`
- Note: The soil inhalation level is the receptor's air level times 1/VF + 1/PEF, composed in the test from the volatilization factor (RSL inputs: Q/C 68.18, 26 years, the guide's soil) and the wind-erosion PEF (1.36E9 m3/kg); the engine gets no new option. A hand calculation of benzene checks the factors and all four levels. Twelve volatile chemicals have neither Koc nor Kd in the parameter sheet; their cells print the particulate-only level and are excepted, not counted as reproduced. Soil inhalation cells: 435, of which 422 reproduce and 13 are excepted; soil totals that include one: 435, of which 421 reproduce, 13 are excepted and 1 is unexplained. Unexplained: the noncancer total of n-nonane is printed 72 mg/kg and computed 72.5012 mg/kg, 0.002 percent above the half-unit limit of 72.5; no printed input or rule accounts for it.

#### RSL November 2024 sweep, resident and industrial air

- Source: `epa2024rsl`, Regional Screening Levels (RSLs), Generic Tables, November 2024
- Method: `exposure.rags-e-f-2014`
- Compared: Resident air inhalation, cancer and noncancer, and the summary governing level for industrial air (the lower of the cancer and noncancer levels): all 812 printed cells against the engine. 809 reproduce, 3 are excepted (one lead cell with no toxicity value in the database and two refractory ceramic fiber cells whose database value is in fibers), 0 are unexplained.
- Cases: 812 published screening levels
- Tolerance: The engine's unrounded value lies within half a unit of the second significant figure of the printed value; the data holds at most two significant figures in every column, and nothing is widened.
- Status: reproduced
- Fixture: `rsl-sweep/exceptions.json`; test `rsl-tables-sweep.test.ts`
- Data: `packages/data/generated/rsl-2024-11/screening-levels.json`
- Note: In all 365 reproduced industrial air cells the summary key letter (c or n) names the endpoint the engine finds governing.

#### NRWQC hardness-dependent metals at a hardness of 100 mg/L

- Source: `epanrwqc`, National Recommended Water Quality Criteria - Aquatic Life Criteria Table
- Method: none registered (a data or arithmetic function)
- Compared: The acute and chronic freshwater criteria of cadmium, chromium III, lead, nickel, silver and zinc, computed from the slope, intercept and conversion factor of the Appendix B data file at a hardness of 100 mg/L, against the printed criteria of the aquatic life table. Cadmium chronic (vacated) and silver chronic (none) print no value.
- Cases: 10 published criteria
- Tolerance: Within half a unit of the second significant figure of the printed value (all ten printed values have two).
- Status: reproduced
- Fixture: none, the published values are typed in the test `surfacewater-criteria.test.ts`
- Note: Extends the zinc entry above to every hardness-dependent metal of the data files.

#### VISL calculator, resident at the form defaults, from the calculator's printed inputs

- Source: `epavisl`, Vapor Intrusion Screening Level User's Guide
- Method: `vapor.attenuation-factor-2015`, `exposure.rags-e-f-2014`
- Compared: The calculator output for five chemicals (benzene, trichloroethylene, tetrachloroethylene, naphthalene, ethylbenzene; resident, groundwater at 25 deg C, hazard quotient 0.1, target risk 1e-6), retrieved 2026-10-22: the engine is run from the properties, toxicity values and exposure inputs the calculator prints for the run, which checks the engine's equations. Compared: the cancer and noncancer target indoor air levels and the governing one, the sub-slab and near-source soil gas level, the groundwater level, the pure phase and maximum groundwater vapor concentrations, H prime used, and the yes or no answers. All 65 printed cells: 63 reproduce, 2 are excepted (the tetrachloroethylene groundwater level and H prime, which miss by less than the rounding of the printed inputs), 0 are unexplained.
- Cases: 65 printed cells
- Tolerance: The engine's unrounded value lies within half a unit of the last printed digit (three significant figures in every compared numeric cell, asserted by the test); a yes or no answer must be equal; nothing is widened.
- Status: reproduced
- Fixture: `visl-sweep/exceptions.json`; test `visl-sweep.test.ts`
- Note: The printed inputs carry three or five significant figures, so a few outputs that miss by less than the input rounding are excepted as printed-input-rounding. The trichloroethylene cancer level (printed 0.478 ug/m3) reproduces from the RSL equations for that chemical, which the modern exposure method applies to a receptor with early-life segments (the engine gives 0.4783 ug/m3); its noncancer level governs, so the sub-slab and groundwater levels reproduce.

#### VISL calculator, resident, groundwater at 10 deg C, hazard quotient 1, target risk 1e-5, from the calculator's printed inputs

- Source: `epavisl`, Vapor Intrusion Screening Level User's Guide
- Method: `vapor.attenuation-factor-2015`, `exposure.rags-e-f-2014`
- Compared: The calculator output for five chemicals (benzene, trichloroethylene, tetrachloroethylene, naphthalene, ethylbenzene; resident, groundwater at 10 deg C, hazard quotient 1, target risk 1e-5 (the Henry constant temperature correction and the target scaling)), retrieved 2026-10-22: the engine is run from the properties, toxicity values and exposure inputs the calculator prints for the run, which checks the engine's equations. Compared: the cancer and noncancer target indoor air levels and the governing one, the sub-slab and near-source soil gas level, the groundwater level, the pure phase and maximum groundwater vapor concentrations, H prime used, and the yes or no answers. All 65 printed cells: 56 reproduce, 9 are excepted (five pure phase vapor concentrations that the calculator leaves at their 25 deg C values, and four outputs that miss by less than the rounding of the printed inputs), 0 are unexplained.
- Cases: 65 printed cells
- Tolerance: The engine's unrounded value lies within half a unit of the last printed digit (three significant figures in every compared numeric cell, asserted by the test); a yes or no answer must be equal; nothing is widened.
- Status: reproduced
- Fixture: `visl-sweep/exceptions.json`; test `visl-sweep.test.ts`
- Note: The printed inputs carry three or five significant figures, so a few outputs that miss by less than the input rounding are excepted as printed-input-rounding. Under a header naming 10 deg C the calculator prints a pure phase vapor concentration equal to its 25 deg C value; the engine, given the printed vapor pressure at 10 deg C, gives a third to a half of it. The Henry constant temperature correction (H prime, the groundwater level and the maximum groundwater vapor) reproduces for all five chemicals up to the input rounding.

#### VISL calculator, commercial at the form defaults, from the calculator's printed inputs

- Source: `epavisl`, Vapor Intrusion Screening Level User's Guide
- Method: `vapor.attenuation-factor-2015`, `exposure.rags-e-f-2014`
- Compared: The calculator output for five chemicals (benzene, trichloroethylene, tetrachloroethylene, naphthalene, ethylbenzene; commercial/industrial, groundwater at 25 deg C, hazard quotient 0.1, target risk 1e-6), retrieved 2026-10-22: the engine is run from the properties, toxicity values and exposure inputs the calculator prints for the run, which checks the engine's equations. Compared: the cancer and noncancer target indoor air levels and the governing one, the sub-slab and near-source soil gas level, the groundwater level, the pure phase and maximum groundwater vapor concentrations, H prime used, and the yes or no answers. All 65 printed cells: 64 reproduce, 1 is excepted (the tetrachloroethylene H prime, which misses by less than the rounding of the printed inputs), 0 are unexplained.
- Cases: 65 printed cells
- Tolerance: The engine's unrounded value lies within half a unit of the last printed digit (three significant figures in every compared numeric cell, asserted by the test); a yes or no answer must be equal; nothing is widened.
- Status: reproduced
- Fixture: `visl-sweep/exceptions.json`; test `visl-sweep.test.ts`
- Note: The printed inputs carry three or five significant figures, so a few outputs that miss by less than the input rounding are excepted as printed-input-rounding. The commercial receptor has no early-life segments, so the trichloroethylene cancer level reproduces as an ordinary chemical.

#### VISL calculator, resident at the form defaults, from the app's shipped database

- Source: `epavisl`, Vapor Intrusion Screening Level User's Guide
- Method: `vapor.attenuation-factor-2015`, `exposure.rags-e-f-2014`
- Compared: The calculator output for five chemicals (benzene, trichloroethylene, tetrachloroethylene, naphthalene, ethylbenzene; resident, groundwater at 25 deg C, hazard quotient 0.1, target risk 1e-6), retrieved 2026-10-22: the engine is run from the chemical file the vapor screen loads and the RSL toxicity file the exposure screens use (vapor-chemicals.json, tox.json), which checks what a user of the app gets; the database holds the vapor pressure at 25 deg C only. Compared: the cancer and noncancer target indoor air levels and the governing one, the sub-slab and near-source soil gas level, the groundwater level, the pure phase and maximum groundwater vapor concentrations, H prime used, and the yes or no answers. All 70 printed cells: 70 reproduce, 0 are excepted (none), 0 are unexplained.
- Cases: 70 printed cells
- Tolerance: The engine's unrounded value lies within half a unit of the last printed digit (three significant figures in every compared numeric cell, asserted by the test); a yes or no answer must be equal; nothing is widened.
- Status: reproduced
- Fixture: `visl-sweep/exceptions.json`; test `visl-sweep.test.ts`
- Note: Each cell that differs is explained by the database input that differs (database-input-differs) or counted as unexplained. With the shipped Henry constants at 25 deg C every cell reproduces, including the trichloroethylene cancer level (from the RSL equations for that chemical), the mutagenic indicator and the toxicity basis.

#### VISL calculator, resident, groundwater at 10 deg C, hazard quotient 1, target risk 1e-5, from the app's shipped database

- Source: `epavisl`, Vapor Intrusion Screening Level User's Guide
- Method: `vapor.attenuation-factor-2015`, `exposure.rags-e-f-2014`
- Compared: The calculator output for five chemicals (benzene, trichloroethylene, tetrachloroethylene, naphthalene, ethylbenzene; resident, groundwater at 10 deg C, hazard quotient 1, target risk 1e-5 (the Henry constant temperature correction and the target scaling)), retrieved 2026-10-22: the engine is run from the chemical file the vapor screen loads and the RSL toxicity file the exposure screens use (vapor-chemicals.json, tox.json), which checks what a user of the app gets; the database holds the vapor pressure at 25 deg C only. Compared: the cancer and noncancer target indoor air levels and the governing one, the sub-slab and near-source soil gas level, the groundwater level, the pure phase and maximum groundwater vapor concentrations, H prime used, and the yes or no answers. All 70 printed cells: 65 reproduce, 5 are excepted (five outputs of the 10 deg C correction that differ because the database critical temperature (trichloroethylene) or enthalpy of vaporization (naphthalene) differs from the calculator), 0 are unexplained.
- Cases: 70 printed cells
- Tolerance: The engine's unrounded value lies within half a unit of the last printed digit (three significant figures in every compared numeric cell, asserted by the test); a yes or no answer must be equal; nothing is widened.
- Status: reproduced
- Fixture: `visl-sweep/exceptions.json`; test `visl-sweep.test.ts`
- Note: Each cell that differs is explained by the database input that differs (database-input-differs) or counted as unexplained. The database critical temperature of trichloroethylene is 544.2 K, the calculator prints 571 K; the naphthalene enthalpy is 10373 cal/mol against 10300. The pure phase vapor concentrations reproduce here because the database holds the 25 deg C vapor pressure only, and the calculator prints that value.

#### VISL calculator, commercial at the form defaults, from the app's shipped database

- Source: `epavisl`, Vapor Intrusion Screening Level User's Guide
- Method: `vapor.attenuation-factor-2015`, `exposure.rags-e-f-2014`
- Compared: The calculator output for five chemicals (benzene, trichloroethylene, tetrachloroethylene, naphthalene, ethylbenzene; commercial/industrial, groundwater at 25 deg C, hazard quotient 0.1, target risk 1e-6), retrieved 2026-10-22: the engine is run from the chemical file the vapor screen loads and the RSL toxicity file the exposure screens use (vapor-chemicals.json, tox.json), which checks what a user of the app gets; the database holds the vapor pressure at 25 deg C only. Compared: the cancer and noncancer target indoor air levels and the governing one, the sub-slab and near-source soil gas level, the groundwater level, the pure phase and maximum groundwater vapor concentrations, H prime used, and the yes or no answers. All 70 printed cells: 70 reproduce, 0 are excepted (none), 0 are unexplained.
- Cases: 70 printed cells
- Tolerance: The engine's unrounded value lies within half a unit of the last printed digit (three significant figures in every compared numeric cell, asserted by the test); a yes or no answer must be equal; nothing is widened.
- Status: reproduced
- Fixture: `visl-sweep/exceptions.json`; test `visl-sweep.test.ts`
- Note: Each cell that differs is explained by the database input that differs (database-input-differs) or counted as unexplained. Every cell reproduces.

### Named exception

#### Table R-6, groundwater to outdoor air

- Source: `arcadis2001`, Review of Risk Integrated Software for Cleanups (RISC) v4.0
- Method: `outdoorAir.box`
- Compared: The printed 2.27e-3 mg/m^3 equals the indoor result of Table R-5 to three figures and no box reading reproduces it (the box gives 2.54e-6 mg/m^3). It is treated as a transcription error in the review. The box hand value is asserted instead.
- Cases: 1 printed value
- Tolerance: The box hand value at 1e-9 relative; the printed value is never widened into a tolerance.
- Status: named exception
- Fixture: `vapor/risc-r3-r5.json`; test `outdoor-air.test.ts`
- Note: Not reproduced; the printed value is believed to be a transcription error.

#### Table R-9, Inhalation in Shower

- Source: `arcadis2001`, Review of Risk Integrated Software for Cleanups (RISC) v4.0
- Method: `shower.fc-1986`
- Compared: The shower model inputs of the review (droplet size, fall time, water flow, stall volume, film coefficients, water temperature) are not printed in the table or in the RISC5 guide, and the RISC4 manual that carries them was not available, so the row cannot be reproduced without inventing inputs. The shower model is checked by identities and hand cases instead.
- Cases: 1 row
- Tolerance: Not compared. Checked by identities and hand cases instead.
- Status: named exception
- Fixture: `exposure/r9.json`; test `household-e4.test.ts`
- Note: Ruling recorded in docs/DECISIONS.md, 2026-10-18, M7 slice E4, item 4.

#### van Genuchten and Alves 1982 Table 6, eight named exceptions

- Source: `vangenuchten1982`, Analytical solutions of the one-dimensional convective-dispersive solute transport equation
- Method: `vadose.vadsat`, `vadose.layered`
- Compared: Eight printed values the 1982 program evidently evaluated slightly differently at large x and t: first-type t = 5, x = 18 and seven third-type points. Each is asserted at the widened bound, and the other values stay at 5e-5.
- Cases: 8 printed values
- Tolerance: 0.00015 absolute, by name (ruling in docs/DECISIONS.md, 2026-10-16: M2 tolerance rulings (Named exceptions at 1.5e-4)).
- Status: named exception
- Fixture: `vadose/vga1982-a1.json`; test `vadose-layered.test.ts`
- Note: The closed form agrees with the printed values only to 1.5e-4 at these points.

### Pending or deferred

#### Table R-9, Ingestion of Root Vegetables (M9)

- Source: `arcadis2001`, Review of Risk Integrated Software for Cleanups (RISC) v4.0
- Method: `plantUptake.trapp-matthies-1995`
- Compared: The root vegetable ingestion row of the page-1 table is not reproduced yet.
- Cases: 1 row
- Tolerance: Not compared yet.
- Status: pending or deferred
- Fixture: `exposure/r9.json`; test `household-e4.test.ts`

### Smoke test only

#### Table R-2, probabilistic drinking water case

- Source: `arcadis2001`, Review of Risk Integrated Software for Cleanups (RISC) v4.0
- Method: `uncertainty.srs-exposure`
- Compared: The legacy method runs the printed case with body weight, exposure duration and water ingestion sampled, and the test asserts no failed iteration and monotone, non-degenerate percentiles. The printed percentiles are recorded and not compared, because the review gives no input distributions.
- Cases: 1 case run
- Tolerance: None. No printed value is compared.
- Status: smoke test only
- Fixture: `uncertainty/table-r2.json`; test `uncertainty-runner.test.ts`
- Note: A comparison waits for sourced input distributions.

## Unverified

What the examples above do not establish: references not yet read that a shipped method relies on, defaults the engine warns about, and published values not checked.

### Planned references a shipped method relies on

| Key | Title | Relied on by |
| --- | --- | --- |
| `foster1986` | [Inhalation exposures to volatile organic contaminants in the shower] | `irrigation.sprinkler-fc`, `shower.fc-1986` |
| `trapp2015` | [Plant uptake and transport models for neutral and ionic chemicals] | `plantUptake.hhrap-2005` |

### Warned or unverified defaults

| Subject | Methods | Warning code | Reference | Note |
| --- | --- | --- | --- | --- |
| Foster and Chrostowski film reference coefficients (3000 cm/h gas, 20 cm/h liquid) | `shower.fc-1986` | `shower.film-reference-unverified` | `foster1986` (planned) | RISC5 choices that could not be verified against the primary paper; they are inputs and the defaults are warned. The stagnant stall source is a planned, unverified record and is not cited. |
| Little (1992) two-resistance stall mass balance | `shower.little-1992` | none | `little1992` (used) | The mass balance is our statement of the two-resistance theory, checked by limit identities; it is not a transcription of the paper. |
| Household transfer factor K (RSL whole-house water-to-air term) | `shower.rsl-household` | `shower.household-factor-unverified` | `epa2024rslug` (used) | An entered value, not verified against a primary page of the RSL documentation. Table 1 of the archived RSL User's Guide (19january2021snapshot.epa.gov/risk/regional-screening-levels-rsls-users-guide_.html, read 2026-10-21) lists K, the Andelman volatilization factor, as 0.5 L/m3, citing U.S. EPA 1991b (pg. 20). The page prints its equations as images, so the form (C_a = C_w K) was not read from it. Numerically, K = 0.5 reproduces all 265 tap water inhalation levels of the RSL November 2024 table (the resident air level divided by K; the two trichloroethylene and vinyl chloride cancer cells reproduce through the RSL equations for those chemicals, which the modern exposure method applies; see the tap water sweep above). That is consistency with the published table, not verification from a primary source, so the warning stays. |
| HHRAP fallback standing in for Trapp (2015) | `plantUptake.hhrap-2005` | none | `trapp2015` (planned) | The modern plant model is the EPA HHRAP 2005 produce equations until the Trapp (2015) models are read. |
| Transpiration stream concentration factor (TSCF) and leaf-air partition coefficient | `plantUptake.trapp-matthies-1995` | none | `trappmatthies1995` (used) | User inputs, because their published regressions were not read. |
| Briggs root concentration factor constants | `plantUptake.trapp-matthies-1995`, `plantUptake.hhrap-2005` | none | `briggs1982` (used) | The constants 0.77 and -1.52 were read in the paper itself on 2026-10-21 (Pestic. Sci. 13, 495-504, open copy in the Rothamsted repository, page 500, Equations 1 and 2; the TSCF equation is on page 502). The engine's form drops the paper's 0.82 term above log Kow 2, as the HHRAP appendix does: Equation 1 is the macerated-root line, and Equation 2 adds 0.82 to the root concentration factor at every log Kow. |
| Schulze-Makuch (2005) dispersivity coefficients | `dispersivity.schulze-makuch2005` | none | `schulzemakuch2005` (used) | The unconsolidated-media pair c = 0.20, m = 0.44 is quoted from lecture notes that cite the paper, not from the paper’s own tables. |
| Gelhar et al. (1985) two-branch vadose dispersivity regression | `vadose.vadsat`, `vadose.layered` | `vadose.dispersivity-regression-unsourced` | `gelhar1985` (used) | The coefficients have no primary source located: the EPRI report (EA-4190, full text read 2026-10-21) prints no regression equation, only field data and a plot against scale. They come from RISC5’s statement of its choice. The reference stays cited for the field data compilation it does contain. |
| Gelhar et al. (1985) saturated-zone log-quadratic dispersivity regression | `dispersivity.gelhar1985-api1987` | `dispersivity.regression-unsourced` | `gelhar1985` (used) | The coefficients of ln(aL) = -3.795 + 1.774 ln x - 0.093 (ln x)^2 have no primary source located: the EPRI report (EA-4190) prints no regression equation, only field data and a plot against scale. They come from RISC5’s statement of its choice. The reference stays cited for the field data compilation it does contain. |
| Organic Koc and H of the SSG 1996 Table A-1 fixture | `cleanup.ssg-leaching` | none | `epa1996ssg` (used) | The nine organic Koc values (Table 39, calculated Koc) and H (Table 36, dimensionless) were read from the primary document on 2026-10-21 and match, after correcting PCE H to 0.754. Table C-1 of the User's Guide and the inorganic Kd values were not re-read. |

### Named exceptions

- Table R-6, groundwater to outdoor air: Not reproduced; the printed value is believed to be a transcription error.
- Table R-9, Inhalation in Shower: Ruling recorded in docs/DECISIONS.md, 2026-10-18, M7 slice E4, item 4.
- van Genuchten and Alves 1982 Table 6, eight named exceptions: The closed form agrees with the printed values only to 1.5e-4 at these points.

### Pending, deferred and smoke-test-only

- Table R-2, probabilistic drinking water case (smoke test only): A comparison waits for sourced input distributions.
- Table R-9, Ingestion of Root Vegetables (M9) (pending or deferred): The root vegetable ingestion row of the page-1 table is not reproduced yet.

### Published values not checked

- RSL sweep cells that do not reproduce: Unexplained: the industrial soil noncancer total of n-nonane (printed 72, computed 72.5012, 0.002 percent above the limit). Excepted with a reason: the tap water total cancer level of Aroclor 1242, 1248, 1254 and 1260 (inside the rounding of the printed unit risk) and the resident soil noncancer inhalation level of PCB 105 (inside the rounding of the printed reference concentration; neither is counted as reproduced); twelve volatile chemicals with neither Koc nor Kd in the parameter sheet (soil inhalation cells and totals print the particulate-only level); lead (key G, no toxicity value); refractory ceramic fibers (key G, database value in fibers). Counts are in the sweep entries above.
- DeVaull (2007) vapor model: No published numeric example could be verified, so the model rests on identities and hand cases built from independent closed forms. There is no fixture file.
- Table R-9 pages 2 and 3: The RISC5 guide reproduces only page 1 of the three pages, so the other rows cannot be checked.

### Other planned references

Planned references no shipped method relies on yet. They are listed in `references.json` and are not cited by any method.

- `srinivasan2008a`: [Analytical solutions for sequentially coupled one-dimensional reactive transport problems, part I]
- `srinivasan2008b`: [Analytical solutions for sequentially coupled one-dimensional reactive transport problems, part II]
- `cline1991`: Partitioning of aromatic constituents into water from gasoline and other complex solvent mixtures
- `remchlor`: REMChlor
- `aziz2000`: BIOCHLOR
- `gelhar1992`: [A critical review of data on field-scale dispersion in aquifers]
- `celia1990`: A general mass-conservative numerical solution for the unsaturated flow equation
- `astme1739`: ASTM E1739-95 Standard guide for risk-based corrective action applied at petroleum release sites
- `yao2011`: Comparison of the Johnson-Ettinger vapor intrusion screening model predictions with full three-dimensional model results
- `yao2013`: A review of vapor intrusion models
- `abreu2005`: Effect of vapor source-building separation and building construction on soil vapor intrusion as studied with a three-dimensional numerical model
- `abreu2009`: Simulated soil vapor intrusion attenuation factors including biodegradation for petroleum hydrocarbons
- `biovapor2010`: BioVapor
- `pviscreen`: PVIScreen
- `abreu2006`: Simulating the effect of aerobic biodegradation on soil vapor intrusion into buildings: influence of degradation rate, source concentration, and depth
- `sobol1993`: [Sensitivity estimates for nonlinear mathematical models]
- `morris1991`: Factorial sampling plans for preliminary computational experiments
- `noaasquirts`: Screening Quick Reference Tables (SQuiRTs)
- `long1995`: Incidence of adverse biological effects within ranges of chemical concentrations in marine and estuarine sediments
- `stephan1985`: Guidelines for Deriving Numerical National Water Quality Criteria for the Protection of Aquatic Organisms and Their Uses
- `roseberry1992`: Lognormal distributions for water intake by children and adults
- `ishigami1990`: An importance quantification technique in uncertainty analysis for computer models
