# Attributions

Generated 2026-10-17 from `packages/engine/src/references/references.json` and the method registry. Do not edit by hand.

Lineage: the methods implemented here were first implemented in, or popularised by, the RISC family of software (BP RISC and its successors). They are reimplemented from the primary literature listed below. This project is independent and is not affiliated with, endorsed by, or derived from the software of the RISC authors or vendors.

Software dependencies and their licences are listed separately in [THIRD_PARTY_LICENSES.md](THIRD_PARTY_LICENSES.md).

## Methods by process

### dispersivity

#### Gelhar et al. (1985) regression with API (1987) ratios

- Kind: Legacy (RISC5 default)
- Method id: `dispersivity.gelhar1985-api1987`
- Summary: Longitudinal dispersivity from a log-quadratic regression on source-to-receptor distance; transverse and vertical values from fixed ratios.
- Assumptions:
  - Dispersivity depends only on the transport distance.
  - Transverse dispersivity is one third of longitudinal; vertical is 1/87 of transverse.
- RISC5 choice: RISC5 computes longitudinal dispersivity from the Gelhar et al. 1985 regression on receptor distance and applies the API 1987 ratios 3 and 87 when dispersivities are entered as zero.
- Sources:
  - Gelhar, L.W., Mantoglou, A., Welty, C., Rehfeldt, K.R. (1985). A review of field-scale physical solute transport processes in saturated and unsaturated porous media. Electric Power Research Institute. EPRI EA-4190.
  - American Petroleum Institute (1987). Oil and Gas Industry Exploration and Production Wastes. Washington, D.C. API Document No. 471-01-09.

#### Xu and Eckstein (1995) regression with BIOSCREEN ratios

- Kind: Modern
- Method id: `dispersivity.xu-eckstein1995`
- Summary: Longitudinal dispersivity from a weighted least-squares fit to field data on scale; transverse is one tenth and vertical one hundredth of longitudinal.
- Assumptions:
  - Dispersivity depends only on the transport distance.
  - The regression collapses to zero below one metre.
- Sources:
  - Xu, M., Eckstein, Y. (1995). Use of weighted least-squares method in evaluation of the relationship between dispersivity and field scale. Ground Water. 33(6):905-908.
  - Newell, C.J., McLeod, R.K., Gonzales, J.R. (1996). BIOSCREEN natural attenuation decision support system, user's manual. U.S. Environmental Protection Agency. EPA/600/R-96/087, Version 1.3, August 1996. <https://nepis.epa.gov/Adobe/PDF/P1007K50.pdf>

#### Schulze-Makuch (2005) power law with BIOSCREEN ratios

- Kind: Modern
- Method id: `dispersivity.schulze-makuch2005`
- Summary: Longitudinal dispersivity from the unconsolidated-media power law 0.20 L^0.44 on scale; transverse is one tenth and vertical one hundredth of longitudinal (BIOSCREEN ratios).
- Assumptions:
  - Dispersivity depends only on the transport distance and grows without an upper bound.
  - Coefficients are those for unconsolidated media fitted to the most reliable data in the compilation.
  - Transverse and vertical dispersivity are fixed fractions (1/10 and 1/100) of the longitudinal value.
- Sources:
  - Schulze-Makuch, D. (2005). Longitudinal dispersivity data and implications for scaling behavior. Ground Water. 43(3):443-456. <https://doi.org/10.1111/j.1745-6584.2005.0051.x>
  - Newell, C.J., McLeod, R.K., Gonzales, J.R. (1996). BIOSCREEN natural attenuation decision support system, user's manual. U.S. Environmental Protection Agency. EPA/600/R-96/087, Version 1.3, August 1996. <https://nepis.epa.gov/Adobe/PDF/P1007K50.pdf>

### groundwater

#### AT123D-class Green function solution with a finite volume source

- Kind: Legacy (RISC5 default)
- Method id: `groundwater.at123d`
- Summary: Three-dimensional advection-dispersion with retardation and first-order decay, uniform flow along x, a finite rectangular volume source and piecewise-constant mass loading, in an aquifer of infinite or finite thickness.
- Assumptions:
  - Uniform one-dimensional flow along x; constant dispersion coefficients.
  - Aquifer infinite in x and y; finite thickness with no-flux top and bottom, or infinite depth, by default under a no-flux water table at z = 0 (top: no-flux, needed for sources at the water table) or unbounded on request (top: unbounded).
  - Source mass is released uniformly through the box; concentration input is converted to a mass rate through the Darcy flux and source area.
  - First-order decay acts on dissolved and sorbed mass alike.
- RISC5 choice: RISC5 applies the AT123D Green function solution with a finite rectangular volume source, vertical well-screen averaging and Gelhar-based dispersivity ratios.
- Sources:
  - Yeh, G.T. (1981). AT123D: Analytical transient one-, two-, and three-dimensional simulation of waste transport in the aquifer system. Oak Ridge National Laboratory. ORNL-5602. <https://doi.org/10.2172/6531241>
  - Galya, D.P. (1987). A horizontal plane source model for ground-water transport. Ground Water. 25(6):733-739. <https://doi.org/10.1111/j.1745-6584.1987.tb02215.x>

#### Wexler (1992) exact patch-source solutions (PATCHI and PATCHF)

- Kind: Modern
- Method id: `groundwater.wexler1992`
- Summary: Exact solutions for a patch source on the inflow plane held at fixed concentration: infinite width and depth (PATCHI) or finite width and thickness with no-flux boundaries (PATCHF), steady or transient.
- Assumptions:
  - Uniform one-dimensional flow along x; constant dispersion coefficients.
  - Fixed-concentration boundary over the patch on x = 0; semi-infinite in x.
  - PATCHF has no-flux boundaries at y = 0, y = W, z = 0 and z = H.
- Sources:
  - Wexler, E.J. (1992). Analytical solutions for one-, two-, and three-dimensional solute transport in ground-water systems with uniform flow. U.S. Geological Survey Techniques of Water-Resources Investigations. TWRI 3-B7 (Book 3, Chapter B7). <https://doi.org/10.3133/twri03b7>

#### BIOSCREEN/RBCA-compatible comparison (Domenico 1987 approximation)

- Kind: Modern
- Method id: `groundwater.domenico1987`
- Summary: Approximate patch-source solution used by BIOSCREEN-class screening tools, offered to reproduce those results; not the recommended method, because it is inexact for nonzero longitudinal dispersivity.
- Assumptions:
  - Vertical planar source of width Y and thickness Z at the water table, centred on y = 0.
  - Transient behaviour only through the longitudinal erfc term; transverse spreading evaluated at steady state.
  - Plume centreline accuracy depends on dispersivity, time and dimensionality; see the emitted warnings.
- Sources:
  - Domenico, P.A. (1987). An analytical model for multidimensional transport of a decaying contaminant species. Journal of Hydrology. 91(1-2):49-58. <https://doi.org/10.1016/0022-1694(87)90127-2>
  - West, M.R., Kueper, B.H., Ungs, M.J. (2007). On the use and error of approximation in the Domenico (1987) solution. Ground Water. 45(2):126-135. <https://doi.org/10.1111/j.1745-6584.2006.00280.x>
  - Guyonnet, D., Neville, C. (2004). Dimensionless analysis of two analytical solutions for 3-D solute transport in groundwater. Journal of Contaminant Hydrology. 75(1-2):141-153. <https://doi.org/10.1016/j.jconhyd.2004.06.004>
  - Srinivasan, V., Clement, T.P., Lee, K.K. (2007). Domenico solution: is it valid?. Ground Water. 45(2):136-146. <https://doi.org/10.1111/j.1745-6584.2006.00281.x>
  - Newell, C.J., McLeod, R.K., Gonzales, J.R. (1996). BIOSCREEN natural attenuation decision support system, user's manual. U.S. Environmental Protection Agency. EPA/600/R-96/087, Version 1.3, August 1996. <https://nepis.epa.gov/Adobe/PDF/P1007K50.pdf>

### vadose

#### VADSAT-type compartmental leaching model

- Kind: Legacy (RISC5 default)
- Method id: `vadose.vadsat`
- Summary: A well-mixed source that depletes by leaching and vapour diffusion (Raoult law with a separate phase), unit-gradient moisture, and one-dimensional advection-dispersion with retardation and decay from the base of the source to the water table, solved analytically.
- Assumptions:
  - Steady unit-gradient flow with uniform moisture in each layer.
  - No NAPL migration; the vertical extent of the source is known and the soil below it starts clean.
  - The source pore-water concentration is proportional to the mass left, so the source depletes exponentially; with a separate phase the TPH mass is held constant.
  - Vapour diffusion from the source is pseudo-steady with zero concentration at the ground surface.
  - Decay acts on the dissolved phase below the source only; vapour concentrations below the surface are not computed.
  - Fixed water table; first-type inlet at the base of the source and zero gradient at great depth.
- RISC5 choice: RISC5 reduces infiltration above Ks to Ks, holds the TPH mass constant in the Raoult source, takes the vapour path to the middle of the source with Deff averaged over the clean soil above it, evaluates a two-branch dispersivity regression at each observation depth without molecular diffusion, sets retardation to 1 below foc 0.001, applies decay to the dissolved phase only, leaves source biodegradation off by default and reports only the advective flux q C at the water table.
- Sources:
  - Ünlü, K., Kemblowski, M.W., Parker, J.C., Stevens, D., Chong, P.K., Kamil, I. (1992). A screening model for effects of land-disposed wastes on groundwater quality. Journal of Contaminant Hydrology. 11(1-2):27-49. <https://doi.org/10.1016/0169-7722(92)90032-A>
  - van Genuchten, M.Th., Alves, W.J. (1982). Analytical solutions of the one-dimensional convective-dispersive solute transport equation. U.S. Department of Agriculture, Agricultural Research Service, Technical Bulletin. No. 1661, 151 p. <https://doi.org/10.22004/ag.econ.157268>
  - Brooks, R.H., Corey, A.T. (1964). Hydraulic properties of porous media. Colorado State University, Fort Collins, Hydrology Papers. No. 3 (March 1964). <https://mountainscholar.org/bitstream/handle/10217/61288/HydrologyPapers_n3.pdf>
  - Lenhard, R.J., Parker, J.C., Mishra, S. (1989). On the correspondence between Brooks-Corey and van Genuchten models. Journal of Irrigation and Drainage Engineering. 115(4):744-751. <https://doi.org/10.1061/(ASCE)0733-9437(1989)115:4(744)>
  - van Genuchten, M.Th. (1980). A closed-form equation for predicting the hydraulic conductivity of unsaturated soils. Soil Science Society of America Journal. 44(5):892-898. <https://doi.org/10.2136/sssaj1980.03615995004400050002x>
  - Mualem, Y. (1976). A new model for predicting the hydraulic conductivity of unsaturated porous media. Water Resources Research. 12(3):513-522. <https://doi.org/10.1029/WR012i003p00513>
  - Millington, R.J., Quirk, J.P. (1961). Permeability of porous solids. Transactions of the Faraday Society. 57:1200-1207. <https://doi.org/10.1039/TF9615701200>
  - U.S. Environmental Protection Agency (1996). Soil Screening Guidance: Technical Background Document. U.S. Environmental Protection Agency. EPA/540/R-95/128 (Publication 9355.4-17A), Second Edition, May 1996. <https://semspub.epa.gov/work/HQ/207.pdf>
  - Gelhar, L.W., Mantoglou, A., Welty, C., Rehfeldt, K.R. (1985). A review of field-scale physical solute transport processes in saturated and unsaturated porous media. Electric Power Research Institute. EPRI EA-4190.

#### Layered unsaturated profile with a flux-type inlet

- Kind: Modern
- Method id: `vadose.layered`
- Summary: The depleting compartmental source of the legacy method over any number of layers above and below it, Mualem-van Genuchten moisture from the entered n, a vapour path that runs through the upper half of the source, and one-dimensional transport with a mass-consistent flux-type inlet: analytic (van Genuchten and Alves case C14) for one layer below the source, finite volumes for several.
- Assumptions:
  - Steady unit-gradient flow with uniform moisture in each layer; infiltration below every Ks in the profile.
  - No NAPL migration; the vertical extent of the source is known and the soil below it starts clean.
  - The source pore-water concentration is proportional to the mass left, so the source depletes exponentially; with a separate phase the TPH mass is held constant.
  - Vapour diffusion from the middle of the source to the ground surface is pseudo-steady with zero concentration at the surface.
  - Decay acts on the dissolved phase below the source only; vapour concentrations below the surface are not computed.
  - Fixed water table; flux-type inlet equal to the leaching loss at the base of the source; the water-table flux is the total flux of a column that continues below the water table (semi-infinite convention).
  - One longitudinal dispersivity per run, plus pore-water molecular diffusion.
- Sources:
  - Ünlü, K., Kemblowski, M.W., Parker, J.C., Stevens, D., Chong, P.K., Kamil, I. (1992). A screening model for effects of land-disposed wastes on groundwater quality. Journal of Contaminant Hydrology. 11(1-2):27-49. <https://doi.org/10.1016/0169-7722(92)90032-A>
  - van Genuchten, M.Th., Alves, W.J. (1982). Analytical solutions of the one-dimensional convective-dispersive solute transport equation. U.S. Department of Agriculture, Agricultural Research Service, Technical Bulletin. No. 1661, 151 p. <https://doi.org/10.22004/ag.econ.157268>
  - van Genuchten, M.Th. (1980). A closed-form equation for predicting the hydraulic conductivity of unsaturated soils. Soil Science Society of America Journal. 44(5):892-898. <https://doi.org/10.2136/sssaj1980.03615995004400050002x>
  - Mualem, Y. (1976). A new model for predicting the hydraulic conductivity of unsaturated porous media. Water Resources Research. 12(3):513-522. <https://doi.org/10.1029/WR012i003p00513>
  - Brooks, R.H., Corey, A.T. (1964). Hydraulic properties of porous media. Colorado State University, Fort Collins, Hydrology Papers. No. 3 (March 1964). <https://mountainscholar.org/bitstream/handle/10217/61288/HydrologyPapers_n3.pdf>
  - Lenhard, R.J., Parker, J.C., Mishra, S. (1989). On the correspondence between Brooks-Corey and van Genuchten models. Journal of Irrigation and Drainage Engineering. 115(4):744-751. <https://doi.org/10.1061/(ASCE)0733-9437(1989)115:4(744)>
  - Millington, R.J., Quirk, J.P. (1961). Permeability of porous solids. Transactions of the Faraday Society. 57:1200-1207. <https://doi.org/10.1039/TF9615701200>
  - U.S. Environmental Protection Agency (1996). Soil Screening Guidance: Technical Background Document. U.S. Environmental Protection Agency. EPA/540/R-95/128 (Publication 9355.4-17A), Second Edition, May 1996. <https://semspub.epa.gov/work/HQ/207.pdf>
  - Gelhar, L.W., Mantoglou, A., Welty, C., Rehfeldt, K.R. (1985). A review of field-scale physical solute transport processes in saturated and unsaturated porous media. Electric Power Research Institute. EPRI EA-4190.

### saturatedSource

#### Two-region saturated soil source, constant until exhausted

- Kind: Legacy (RISC5 default)
- Method id: `saturatedSource.two-region`
- Summary: A soil source at the water table split into a region above (flushed by infiltration) and a region below (flushed by groundwater flow), each at its equilibrium pore-water concentration or the Raoult effective solubility, releasing a constant mass rate until the shared pool of chemical is exhausted.
- Assumptions:
  - One homogeneous soil for the source and the aquifer; one porosity serves partitioning and transport.
  - Equilibrium partitioning and instantaneous dissolution; Raoult law for a separate phase, tested per chemical and per region; no NAPL migration.
  - One well-mixed pool of chemical shared by region 1 (above the water table, flushed by infiltration) and region 2 (below it, flushed by groundwater flow).
  - Region 1 leachate reaches the aquifer immediately and undiluted; its rate does not depend on the thickness of region 1, only on whether region 1 exists.
  - The water-table fluctuation changes only how the source is split between the two regions, not the flow field; the default releases at the annual mean rate.
  - Volatilization from region 1 is not a loss term.
  - The source starts at t = 0 with its measured concentration; the TPH mass is held constant.
- RISC5 choice: RISC5 applies the residual-phase comparison to each chemical alone, delivers region 1 leachate to the aquifer undiluted and at once at a rate independent of region 1 thickness, takes region 1 moisture from a unit-gradient Brooks-Corey curve (n entered for the soil) with the aquifer conductivity as Ks, reduces infiltration above K to K, holds each region concentration constant until the pool is empty, uses one porosity for partitioning and transport, and leaves volatilization from region 1 out of the mass balance.
- Sources:
  - Feenstra, S., Mackay, D.M., Cherry, J.A. (1991). A method for assessing residual NAPL based on organic chemical concentrations in soil samples. Ground Water Monitoring Review. 11(2):128-136. <https://doi.org/10.1111/j.1745-6592.1991.tb00374.x>
  - U.S. Environmental Protection Agency (1996). Soil Screening Guidance: Technical Background Document. U.S. Environmental Protection Agency. EPA/540/R-95/128 (Publication 9355.4-17A), Second Edition, May 1996. <https://semspub.epa.gov/work/HQ/207.pdf>
  - Brooks, R.H., Corey, A.T. (1964). Hydraulic properties of porous media. Colorado State University, Fort Collins, Hydrology Papers. No. 3 (March 1964). <https://mountainscholar.org/bitstream/handle/10217/61288/HydrologyPapers_n3.pdf>
  - Lenhard, R.J., Parker, J.C., Mishra, S. (1989). On the correspondence between Brooks-Corey and van Genuchten models. Journal of Irrigation and Drainage Engineering. 115(4):744-751. <https://doi.org/10.1061/(ASCE)0733-9437(1989)115:4(744)>
  - van Genuchten, M.Th. (1980). A closed-form equation for predicting the hydraulic conductivity of unsaturated soils. Soil Science Society of America Journal. 44(5):892-898. <https://doi.org/10.2136/sssaj1980.03615995004400050002x>
  - Mualem, Y. (1976). A new model for predicting the hydraulic conductivity of unsaturated porous media. Water Resources Research. 12(3):513-522. <https://doi.org/10.1029/WR012i003p00513>

#### Two-region saturated soil source, mass-consistent exponential decline

- Kind: Modern
- Method id: `saturatedSource.exponential`
- Summary: The same two-region source with pore-water concentrations proportional to the mass left, so the release declines exponentially: the first-order source of BIOSCREEN and the unit-exponent member of the Falta et al. source-strength family, with an optional first-order source decay.
- Assumptions:
  - One homogeneous soil for the source and the aquifer; one porosity serves partitioning and transport.
  - Equilibrium partitioning and instantaneous dissolution; Raoult law for a separate phase, tested per chemical and per region; no NAPL migration.
  - One well-mixed pool of chemical shared by region 1 (above the water table, flushed by infiltration) and region 2 (below it, flushed by groundwater flow).
  - Region 1 leachate reaches the aquifer immediately and undiluted; its rate does not depend on the thickness of region 1, only on whether region 1 exists.
  - The water-table fluctuation changes only how the source is split between the two regions, not the flow field; the default releases at the annual mean rate.
  - Volatilization from region 1 is not a loss term.
  - The source starts at t = 0 with its measured concentration; the TPH mass is held constant.
  - Pore-water concentration scales with the mass left, with and without a separate phase, so the residual-phase outcome does not change as the source depletes.
- Sources:
  - Feenstra, S., Mackay, D.M., Cherry, J.A. (1991). A method for assessing residual NAPL based on organic chemical concentrations in soil samples. Ground Water Monitoring Review. 11(2):128-136. <https://doi.org/10.1111/j.1745-6592.1991.tb00374.x>
  - U.S. Environmental Protection Agency (1996). Soil Screening Guidance: Technical Background Document. U.S. Environmental Protection Agency. EPA/540/R-95/128 (Publication 9355.4-17A), Second Edition, May 1996. <https://semspub.epa.gov/work/HQ/207.pdf>
  - Brooks, R.H., Corey, A.T. (1964). Hydraulic properties of porous media. Colorado State University, Fort Collins, Hydrology Papers. No. 3 (March 1964). <https://mountainscholar.org/bitstream/handle/10217/61288/HydrologyPapers_n3.pdf>
  - Lenhard, R.J., Parker, J.C., Mishra, S. (1989). On the correspondence between Brooks-Corey and van Genuchten models. Journal of Irrigation and Drainage Engineering. 115(4):744-751. <https://doi.org/10.1061/(ASCE)0733-9437(1989)115:4(744)>
  - van Genuchten, M.Th. (1980). A closed-form equation for predicting the hydraulic conductivity of unsaturated soils. Soil Science Society of America Journal. 44(5):892-898. <https://doi.org/10.2136/sssaj1980.03615995004400050002x>
  - Mualem, Y. (1976). A new model for predicting the hydraulic conductivity of unsaturated porous media. Water Resources Research. 12(3):513-522. <https://doi.org/10.1029/WR012i003p00513>
  - Newell, C.J., McLeod, R.K., Gonzales, J.R. (1996). BIOSCREEN natural attenuation decision support system, user's manual. U.S. Environmental Protection Agency. EPA/600/R-96/087, Version 1.3, August 1996. <https://nepis.epa.gov/Adobe/PDF/P1007K50.pdf>
  - Falta, R.W., Rao, P.S., Basu, N. (2005). Assessing the impacts of partial mass depletion in DNAPL source zones: I. Analytical modeling of source strength functions and plume response. Journal of Contaminant Hydrology. 78(4):259-280. <https://doi.org/10.1016/j.jconhyd.2005.05.010>

### exposure

#### RAGS Part A doses for nine direct pathways, one or two receptors

- Kind: Legacy (RISC5 default)
- Method id: `exposure.rags-a-1989`
- Summary: Chronic and lifetime average daily doses from the RAGS Part A intake equations for soil and water ingestion, dermal contact, inhalation and surface-water contact, with the 1991 default exposure factors, turned into incremental cancer risk and hazard quotients and summed within each receptor.
- Assumptions:
  - Exposure point concentrations are those at the point of contact; no further fate and transport is modelled here.
  - Chronic reference values and slope factors only; no subchronic or acute evaluation.
  - Cancer risks add over pathways and chemicals within a receptor, and so do hazard quotients; no interaction between chemicals.
  - Risk is the linear low-dose form, slope times dose; it is warned above 0.01.
  - The hazard index is a total over all target organs (no target-organ segregation).
  - The receptor is exposed for the whole averaging window chosen, with the exposure factors entered.
  - Air and surface-water concentrations are user entered until the vapor, shower and surface-water models arrive.
  - A chemical without a value for a route contributes nothing to that route and is reported as not quantified, never as zero.
  - Dermal water uses the steady-state permeability with no lag time.
  - Soil bioavailability is 1 unless entered; route-to-route extrapolation is off unless switched on.
  - A concentration series is reduced to the largest 7-year average (noncancer, the duration when shorter) and the largest average over the exposure duration (cancer).
- RISC5 choice: RISC5 uses dose-based inhalation with the slope factor and reference dose obtained from the unit risk and reference concentration at 20 m^3/d and 70 kg, evaluates two simultaneous receptors with cancer risks additive only on request and hazard indices never added, takes soil as a constant, and averages a time-varying groundwater concentration over the largest 7-year window for noncancer effects and the exposure duration for cancer.
- Sources:
  - U.S. Environmental Protection Agency (1989). Risk Assessment Guidance for Superfund, Volume I: Human Health Evaluation Manual (Part A), Interim Final. U.S. Environmental Protection Agency, Office of Emergency and Remedial Response. EPA/540/1-89/002, December 1989. <https://www.epa.gov/system/files/documents/2024-10/rags_a_508.pdf>
  - U.S. Environmental Protection Agency (1991). Risk Assessment Guidance for Superfund, Volume I: Human Health Evaluation Manual, Supplemental Guidance: "Standard Default Exposure Factors", Interim Final. U.S. Environmental Protection Agency, Office of Emergency and Remedial Response. OSWER Directive 9285.6-03, PB91-921314, March 25, 1991. <https://semspub.epa.gov/src/document/HQ/190591>
  - U.S. Environmental Protection Agency (1992). Dermal Exposure Assessment: Principles and Applications, Interim Report. U.S. Environmental Protection Agency, Office of Health and Environmental Assessment. EPA/600/8-91/011B, January 1992. <https://rais.ornl.gov/documents/DERM_EXP.PDF>

#### RAGS Parts E and F with the 2014 default factors and age-dependent adjustment

- Kind: Modern
- Method id: `exposure.rags-e-f-2014`
- Summary: Age-segmented intakes with the 2014 default exposure factors, the RAGS Part E dermal event model, RAGS Part F concentration-based inhalation and the age-dependent adjustment factors for mutagens, with the exposure starting when the cancer risk from a time-varying groundwater concentration is greatest.
- Assumptions:
  - Exposure point concentrations are those at the point of contact; no further fate and transport is modelled here.
  - Chronic reference values and slope factors only; no subchronic or acute evaluation.
  - Cancer risks add over pathways and chemicals within a receptor, and so do hazard quotients; no interaction between chemicals.
  - Risk is the linear low-dose form, slope times dose; it is warned above 0.01.
  - The hazard index is a total over all target organs (no target-organ segregation).
  - The receptor is exposed for the whole averaging window chosen, with the exposure factors entered.
  - Air and surface-water concentrations are user entered until the vapor, shower and surface-water models arrive.
  - A chemical without a value for a route contributes nothing to that route and is reported as not quantified, never as zero.
  - A resident is one age-segmented receptor (child then adult); mutagens use the four age segments with the factors 10, 3, 3 and 1.
  - The dermal event model and the dermal toxicity adjustment for low gastrointestinal absorption follow RAGS Part E; the cancer bathing event time is the time-weighted resident value.
  - Inhalation uses the exposure concentration (no breathing rate or body weight).
  - Life-stage hazard quotients are never added; the headline hazard index is the largest.
  - A concentration series is averaged over each life stage starting at the exposure start that maximizes the cancer risk; each noncancer group uses the largest average over a window of its own duration.
- Sources:
  - U.S. Environmental Protection Agency (1989). Risk Assessment Guidance for Superfund, Volume I: Human Health Evaluation Manual (Part A), Interim Final. U.S. Environmental Protection Agency, Office of Emergency and Remedial Response. EPA/540/1-89/002, December 1989. <https://www.epa.gov/system/files/documents/2024-10/rags_a_508.pdf>
  - U.S. Environmental Protection Agency (2004). Risk Assessment Guidance for Superfund, Volume I: Human Health Evaluation Manual (Part E, Supplemental Guidance for Dermal Risk Assessment), Final. U.S. Environmental Protection Agency, Office of Superfund Remediation and Technology Innovation. EPA/540/R/99/005, OSWER 9285.7-02EP, PB99-963312, July 2004. <https://www.epa.gov/sites/default/files/2015-09/documents/part_e_final_revision_10-03-07.pdf>
  - U.S. Environmental Protection Agency (2009). Risk Assessment Guidance for Superfund, Volume I: Human Health Evaluation Manual (Part F, Supplemental Guidance for Inhalation Risk Assessment), Final. U.S. Environmental Protection Agency, Office of Superfund Remediation and Technology Innovation. EPA-540-R-070-002, OSWER 9285.7-82, January 2009. <https://www.epa.gov/sites/default/files/2015-09/documents/partf_200901_final.pdf>
  - U.S. Environmental Protection Agency (2014). Human Health Evaluation Manual, Supplemental Guidance: Update of Standard Default Exposure Factors. U.S. Environmental Protection Agency, Office of Solid Waste and Emergency Response. OSWER Directive 9200.1-120, February 6, 2014. <https://www.epa.gov/sites/default/files/2015-11/documents/oswer_directive_9200.1-120_exposurefactors_corrected2.pdf>
  - U.S. Environmental Protection Agency (2005). Supplemental Guidance for Assessing Susceptibility from Early-Life Exposure to Carcinogens. U.S. Environmental Protection Agency, Risk Assessment Forum. EPA/630/R-03/003F, March 2005. <https://www.epa.gov/sites/default/files/2013-09/documents/childrens_supplement_final.pdf>
  - U.S. Environmental Protection Agency (2005). Guidelines for Carcinogen Risk Assessment. U.S. Environmental Protection Agency, Risk Assessment Forum. EPA/630/P-03/001F, March 2005. <https://www.epa.gov/sites/default/files/2013-09/documents/cancer_guidelines_final_3-25-05.pdf>
  - U.S. Environmental Protection Agency (2012). Recommendations for Default Value for Relative Bioavailability of Arsenic in Soil. U.S. Environmental Protection Agency, Office of Solid Waste and Emergency Response. OSWER 9200.1-113, December 2012. <https://semspub.epa.gov/work/HQ/175338.pdf>
  - U.S. Environmental Protection Agency (2011). Exposure Factors Handbook: 2011 Edition (Final). U.S. Environmental Protection Agency, National Center for Environmental Assessment. EPA/600/R-09/052F, September 2011. <https://cfpub.epa.gov/ncea/risk/recordisplay.cfm?deid=236252>

### surfaceWater

#### Well-mixed surface water box with Darcy groundwater discharge and equilibrium sediment

- Kind: Legacy (RISC5 default)
- Method id: `surfaceWater.well-mixed`
- Summary: The groundwater concentration at the bank times a Darcy discharge across the bed, mixed into a fraction of the upstream flow and the water body volume with first-order decay, evaluated at steady state for the loading at each time, and sediment in equilibrium with the groundwater.
- Assumptions:
  - The plume discharges into the water body (a gaining reach); a losing reach is refused.
  - The mixing volume is uniformly mixed; the mixing fraction f scales both the upstream flow and the volume.
  - The sediment is in equilibrium with its pore water; there is no degradation, burial, resuspension or sorption kinetics in the bed.
  - There is no runoff, erosion, point discharge or upstream source other than the background concentration.
  - A chemical with neither a Koc nor a Kd has no sediment concentration and is reported as not quantified, never as zero.
  - Storage in the water body is ignored: the box is re-evaluated at steady state at each sample time (warned when the residence time exceeds 30 d).
  - The groundwater concentration is the plume centreline value at the bank averaged over the discharge thickness, held across the whole reach width, so the loading can exceed the mass the source releases.
  - The reach length is entered or the full width of the steady Domenico plume between its 5 percent points.
- RISC5 choice: RISC5 loads the water body with the centreline groundwater concentration times a Darcy flow across the bed (bed conductivity, discharge thickness, reach length and gradient), mixes it with a fraction of the upstream flow and the body volume at steady state for each time, sets the reach length from the 5 percent Domenico plume width with its own dispersivities, and takes sediment as Kd times the groundwater concentration.
- Sources:
  - Chapra, S.C. (1997). Surface Water-Quality Modeling. McGraw-Hill, New York. ISBN 0-07-011364-5.
  - Domenico, P.A. (1987). An analytical model for multidimensional transport of a decaying contaminant species. Journal of Hydrology. 91(1-2):49-58. <https://doi.org/10.1016/0022-1694(87)90127-2>
  - Di Toro, D.M., Zarba, C.S., Hansen, D.J., Berry, W.J., Swartz, R.C., Cowan, C.E., Pavlou, S.P., Allen, H.E., Thomas, N.A., Paquin, P.R. (1991). Technical basis for establishing sediment quality criteria for nonionic organic chemicals using equilibrium partitioning. Environmental Toxicology and Chemistry. 10(12):1541-1583. <https://doi.org/10.1002/etc.5620101203>

#### Mass discharge across the bank plane into a transient well-mixed box

- Kind: Modern
- Method id: `surfaceWater.mass-discharge`
- Summary: The advective mass the groundwater run carries across the vertical plane at the bank over the reach and the discharge thickness, a transient well-mixed box with storage, plug flow with first-order decay to a river receptor, and equilibrium sediment with a selectable pore water and an organic-carbon-normalized output.
- Assumptions:
  - The plume discharges into the water body (a gaining reach); a losing reach is refused.
  - The mixing volume is uniformly mixed; the mixing fraction f scales both the upstream flow and the volume.
  - The sediment is in equilibrium with its pore water; there is no degradation, burial, resuspension or sorption kinetics in the bed.
  - There is no runoff, erosion, point discharge or upstream source other than the background concentration.
  - A chemical with neither a Koc nor a Kd has no sediment concentration and is reported as not quantified, never as zero.
  - The loading is the mass discharge across the plane, so the mass the groundwater run delivers is conserved; dispersive flux across the plane is neglected and the plane passes the plume without reflection.
  - The groundwater flow is the Darcy flux of the groundwater run over the same area, so no bed conductivity or gradient is needed.
  - The loading is linear between sample times and held after the last; the box starts at the steady state of the first loading unless an initial concentration is given.
  - Downstream of the reach the whole river is mixed and moves as plug flow with first-order decay.
- Sources:
  - Chapra, S.C. (1997). Surface Water-Quality Modeling. McGraw-Hill, New York. ISBN 0-07-011364-5.
  - Di Toro, D.M., Zarba, C.S., Hansen, D.J., Berry, W.J., Swartz, R.C., Cowan, C.E., Pavlou, S.P., Allen, H.E., Thomas, N.A., Paquin, P.R. (1991). Technical basis for establishing sediment quality criteria for nonionic organic chemicals using equilibrium partitioning. Environmental Toxicology and Chemistry. 10(12):1541-1583. <https://doi.org/10.1002/etc.5620101203>

## Planned methods

Sources for methods on the roadmap that are not implemented yet. Nothing here affects a result today.

- Abreu, L.D.V., Ettinger, R., McAlary, T. (2009). [Simulated soil vapor intrusion attenuation factors including biodegradation].
- Abreu, L.D.V., Johnson, P.C. (2005). [Three-dimensional numerical modeling of vapor intrusion].
- American Petroleum Institute (2010). BioVapor.
- ASTM International (1995). ASTM E1739-95 Standard guide for risk-based corrective action applied at petroleum release sites. E1739-95.
- Aziz, C.E., et al. (2000). BIOCHLOR.
- Briggs, G.G., et al. (1982). [Relationships between lipophilicity and root uptake and translocation of non-ionised chemicals by barley].
- Buchman, M.F. (2008). Screening Quick Reference Tables (SQuiRTs). National Oceanic and Atmospheric Administration, Office of Response and Restoration. NOAA OR&R Report 08-1. <https://repository.library.noaa.gov/view/noaa/9327>
- Celia, M.A., Bouloutas, E.T., Zarba, R.L. (1990). A general mass-conservative numerical solution for the unsaturated flow equation. Water Resources Research. 26(7):1483-1496. <https://doi.org/10.1029/WR026i007p01483>
- Cline, P.V., Delfino, J.J., Rao, P.S.C. (1991). Partitioning of aromatic constituents into water from gasoline and other complex solvent mixtures. Environmental Science & Technology. 25(5):914-920. <https://doi.org/10.1021/es00017a013>
- Cowherd, C., et al. (1985). [Rapid assessment of exposure to particulate emissions from surface contamination sites].
- DeVaull, G.E. (2007). [Indoor vapor intrusion with oxygen-limited biodegradation for a subsurface gasoline source]. Environmental Science and Technology. 41:3241-3248.
- Falta, R.W. (2026). REMChlor. U.S. Environmental Protection Agency.
- Foster, S.A., Chrostowski, P.C. (1986). [Inhalation exposures to volatile organic contaminants in the shower].
- Gelhar, L.W., Welty, C., Rehfeldt, K.R. (1992). [A critical review of data on field-scale dispersion in aquifers]. Water Resources Research. 28:1955-1974.
- Iman, R.L., Conover, W.J. (1982). [A distribution-free approach to inducing rank correlation among input variables].
- Johnson, P.C., Ettinger, R.A. (1991). [Heuristic model for predicting the intrusion rate of contaminant vapors into buildings]. Environmental Science and Technology.
- Johnson, P.C., Kemblowski, M.W., Johnson, R.L. (1998). [Assessing the significance of subsurface contaminant vapor migration to enclosed spaces]. American Petroleum Institute. API 4674.
- Jury, W.A., Spencer, W.F., Farmer, W.J. (1983). Behavior assessment model for trace organics in soil: I. Model description. Journal of Environmental Quality. 12(4):558-564. <https://doi.org/10.2134/jeq1983.00472425001200040026x>
- Little, J.C. (1992). [Applying the two-resistance theory to contaminant volatilization in showers].
- Long, E.R., MacDonald, D.D., Smith, S.L., Calder, F.D. (1995). Incidence of adverse biological effects within ranges of chemical concentrations in marine and estuarine sediments. Environmental Management. 19(1):81-97. <https://doi.org/10.1007/BF02472006>
- MacDonald, D.D., Ingersoll, C.G., Berger, T.A. (2000). Development and evaluation of consensus-based sediment quality guidelines for freshwater ecosystems. Archives of Environmental Contamination and Toxicology. 39(1):20-31. <https://doi.org/10.1007/s002440010075>
- Massachusetts Department of Environmental Protection (2002). [Characterizing risks posed by petroleum contaminated sites].
- McKay, M.D., Beckman, R.J., Conover, W.J. (1979). [A comparison of three methods for selecting values of input variables in the analysis of output from a computer code].
- Morris, M.D. (1991). [Factorial sampling plans for preliminary computational experiments].
- Saltelli, A., et al. (2010). [Variance based sensitivity analysis of model output].
- Sample, B.E., et al. (1996). [Toxicological benchmarks for wildlife]. Oak Ridge National Laboratory.
- Sobol, I.M. (1993). [Sensitivity estimates for nonlinear mathematical models].
- Srinivasan, V., Clement, T.P. (2008). [Analytical solutions for sequentially coupled one-dimensional reactive transport problems, part I]. Advances in Water Resources. 31:203-218.
- Srinivasan, V., Clement, T.P. (2008). [Analytical solutions for sequentially coupled one-dimensional reactive transport problems, part II]. Advances in Water Resources. 31:219-232.
- Stephan, C.E., Mount, D.I., Hansen, D.J., Gentile, J.H., Chapman, G.A., Brungs, W.A. (1985). Guidelines for Deriving Numerical National Water Quality Criteria for the Protection of Aquatic Organisms and Their Uses. U.S. Environmental Protection Agency, Office of Research and Development. PB85-227049. <https://www.epa.gov/sites/production/files/2016-02/documents/guidelines-water-quality-criteria.pdf>
- Total Petroleum Hydrocarbon Criteria Working Group (1997). [TPHCWG series, volumes published 1997 to 1999].
- Trapp, S. (2015). [Plant uptake and transport models for neutral and ionic chemicals].
- Trapp, S., Matthies, M. (1995). [Generic one-compartment model for uptake of organic chemicals by foliar vegetation].
- U.S. Environmental Protection Agency (1997). Guiding Principles for Monte Carlo Analysis. U.S. Environmental Protection Agency. EPA/630/R-97/001.
- U.S. Environmental Protection Agency (2001). Risk Assessment Guidance for Superfund, Volume III, Part A, Process for Conducting Probabilistic Risk Assessment.
- U.S. Environmental Protection Agency (2002). Supplemental Guidance for Developing Soil Screening Levels for Superfund Sites. U.S. Environmental Protection Agency. OSWER 9355.4-24, December 2002. <https://semspub.epa.gov/work/HQ/175878.pdf>
- U.S. Environmental Protection Agency (2003). Ecological Soil Screening Levels (Eco-SSLs).
- U.S. Environmental Protection Agency (2004). [Johnson and Ettinger (1991) vapor intrusion model spreadsheets].
- U.S. Environmental Protection Agency (2005). Human Health Risk Assessment Protocol for Hazardous Waste Combustion Facilities.
- U.S. Environmental Protection Agency (2015). [Technical guide for addressing petroleum vapor intrusion at leaking underground storage tank sites].
- U.S. Environmental Protection Agency (2015). OSWER Technical Guide for Assessing and Mitigating the Vapor Intrusion Pathway from Subsurface Vapor Sources to Indoor Air.
- U.S. Environmental Protection Agency, Region 4 (2018). Region 4 Ecological Risk Assessment Supplemental Guidance, March 2018 Update. U.S. Environmental Protection Agency, Region 4, Superfund Division, Scientific Support Section. <https://www.epa.gov/sites/default/files/2018-03/documents/era_regional_supplemental_guidance_report-march-2018_update.pdf>
- Walden, T., Spence, L.R. (1997). [Irrigation water pathways].
- Weaver, J. (2017). PVIScreen. U.S. Environmental Protection Agency.
- Yao, Y., Pennell, K.G., Suuberg, E.M. (2011). [Vapor intrusion model comparisons].
- Yao, Y., Shen, R., Suuberg, E.M. (2013). [Review of vapor intrusion modeling].

## Data sources

Public datasets that the chemical and toxicity database is built from.

- U.S. Environmental Protection Agency (2003). Human Health Toxicity Values in Superfund Risk Assessments. U.S. Environmental Protection Agency, Office of Superfund Remediation and Technology Innovation. OSWER Directive 9285.7-53, December 5, 2003. <https://semspub.epa.gov/work/HQ/136.pdf>
- U.S. Environmental Protection Agency (2024). Regional Screening Levels (RSLs), Generic Tables, November 2024. U.S. Environmental Protection Agency. SEMS documents 405270 (summary table), 405302 (chemical-specific parameters) and 405290 (resident tap water), TR = 1E-06, THQ = 1. <https://www.epa.gov/risk/regional-screening-levels-rsls-generic-tables>
- U.S. Environmental Protection Agency (2025). National Recommended Water Quality Criteria - Human Health Criteria Table. U.S. Environmental Protection Agency. <https://www.epa.gov/wqc/national-recommended-water-quality-criteria-human-health-criteria-table>
- U.S. Environmental Protection Agency (2026). CompTox Chemicals Dashboard.
- U.S. Environmental Protection Agency (2026). Integrated Risk Information System (IRIS).
- U.S. Environmental Protection Agency (2026). National Recommended Water Quality Criteria - Aquatic Life Criteria Table. U.S. Environmental Protection Agency. <https://www.epa.gov/wqc/national-recommended-water-quality-criteria-aquatic-life-criteria-table>

Editions of committed web pages (the pages are not numbered editions, so each is identified by its own last-updated date):

- EPA National Recommended Water Quality Criteria, Aquatic Life Criteria Table (page dated 2026-06-09; retrieved 2026-10-17). U.S. government work, public domain in the United States; the page states no restriction.
- EPA National Recommended Water Quality Criteria, Human Health Criteria Table (page dated 2025-12-18; retrieved 2026-10-17). U.S. government work, public domain in the United States; the page states no restriction.

## Validation sources

Reviews, codes and packages used to produce test fixtures. They are checks on this software, not parts of it.

- Arcadis Geraghty & Miller (2001). Review of Risk Integrated Software for Cleanups (RISC) v4.0.
- Spence, L.R., Walden, T. (2001). RISC4 User's Manual. BP Oil International. Version 4.0, October 2001. <https://www.isprambiente.gov.it/contentfiles/00002500/2516-c2179-risc4-manual.pdf>
- U.S. Environmental Protection Agency (2024). Regional Screening Levels (RSLs), User's Guide. U.S. Environmental Protection Agency. Web page accompanying the November 2024 tables. <https://www.epa.gov/risk/regional-screening-levels-rsls-users-guide>
- Utrecht University (MiBiPreT) (2026). mibitrans. Version 1.0.1. <https://pypi.org/project/mibitrans/>
- Wexler, E.J. (1996). ANALGWST (analytical groundwater solute transport code), version 1.1. U.S. Geological Survey. Version 1.1 (1996/04/03). <https://water.usgs.gov/software/ANALGWST/>

## References

Every entry in the reference database, alphabetical by author.

- Abreu, L.D.V., Ettinger, R., McAlary, T. (2009). [Simulated soil vapor intrusion attenuation factors including biodegradation]. [planned]
- Abreu, L.D.V., Johnson, P.C. (2005). [Three-dimensional numerical modeling of vapor intrusion]. [planned]
- American Petroleum Institute (1987). Oil and Gas Industry Exploration and Production Wastes. Washington, D.C. API Document No. 471-01-09. [used]
- American Petroleum Institute (2010). BioVapor. [planned]
- Arcadis Geraghty & Miller (2001). Review of Risk Integrated Software for Cleanups (RISC) v4.0. [fixture]
- ASTM International (1995). ASTM E1739-95 Standard guide for risk-based corrective action applied at petroleum release sites. E1739-95. [planned]
- Aziz, C.E., et al. (2000). BIOCHLOR. [planned]
- Briggs, G.G., et al. (1982). [Relationships between lipophilicity and root uptake and translocation of non-ionised chemicals by barley]. [planned]
- Brooks, R.H., Corey, A.T. (1964). Hydraulic properties of porous media. Colorado State University, Fort Collins, Hydrology Papers. No. 3 (March 1964). <https://mountainscholar.org/bitstream/handle/10217/61288/HydrologyPapers_n3.pdf> [used]
- Buchman, M.F. (2008). Screening Quick Reference Tables (SQuiRTs). National Oceanic and Atmospheric Administration, Office of Response and Restoration. NOAA OR&R Report 08-1. <https://repository.library.noaa.gov/view/noaa/9327> [planned]
- Celia, M.A., Bouloutas, E.T., Zarba, R.L. (1990). A general mass-conservative numerical solution for the unsaturated flow equation. Water Resources Research. 26(7):1483-1496. <https://doi.org/10.1029/WR026i007p01483> [planned]
- Chapra, S.C. (1997). Surface Water-Quality Modeling. McGraw-Hill, New York. ISBN 0-07-011364-5. [used]
- Cline, P.V., Delfino, J.J., Rao, P.S.C. (1991). Partitioning of aromatic constituents into water from gasoline and other complex solvent mixtures. Environmental Science & Technology. 25(5):914-920. <https://doi.org/10.1021/es00017a013> [planned]
- Cowherd, C., et al. (1985). [Rapid assessment of exposure to particulate emissions from surface contamination sites]. [planned]
- DeVaull, G.E. (2007). [Indoor vapor intrusion with oxygen-limited biodegradation for a subsurface gasoline source]. Environmental Science and Technology. 41:3241-3248. [planned]
- Di Toro, D.M., Zarba, C.S., Hansen, D.J., Berry, W.J., Swartz, R.C., Cowan, C.E., Pavlou, S.P., Allen, H.E., Thomas, N.A., Paquin, P.R. (1991). Technical basis for establishing sediment quality criteria for nonionic organic chemicals using equilibrium partitioning. Environmental Toxicology and Chemistry. 10(12):1541-1583. <https://doi.org/10.1002/etc.5620101203> [used]
- Domenico, P.A. (1987). An analytical model for multidimensional transport of a decaying contaminant species. Journal of Hydrology. 91(1-2):49-58. <https://doi.org/10.1016/0022-1694(87)90127-2> [used]
- Falta, R.W. (2026). REMChlor. U.S. Environmental Protection Agency. [planned]
- Falta, R.W., Rao, P.S., Basu, N. (2005). Assessing the impacts of partial mass depletion in DNAPL source zones: I. Analytical modeling of source strength functions and plume response. Journal of Contaminant Hydrology. 78(4):259-280. <https://doi.org/10.1016/j.jconhyd.2005.05.010> [used]
- Feenstra, S., Mackay, D.M., Cherry, J.A. (1991). A method for assessing residual NAPL based on organic chemical concentrations in soil samples. Ground Water Monitoring Review. 11(2):128-136. <https://doi.org/10.1111/j.1745-6592.1991.tb00374.x> [used]
- Foster, S.A., Chrostowski, P.C. (1986). [Inhalation exposures to volatile organic contaminants in the shower]. [planned]
- Galya, D.P. (1987). A horizontal plane source model for ground-water transport. Ground Water. 25(6):733-739. <https://doi.org/10.1111/j.1745-6584.1987.tb02215.x> [used]
- Gelhar, L.W., Mantoglou, A., Welty, C., Rehfeldt, K.R. (1985). A review of field-scale physical solute transport processes in saturated and unsaturated porous media. Electric Power Research Institute. EPRI EA-4190. [used]
- Gelhar, L.W., Welty, C., Rehfeldt, K.R. (1992). [A critical review of data on field-scale dispersion in aquifers]. Water Resources Research. 28:1955-1974. [planned]
- Guyonnet, D., Neville, C. (2004). Dimensionless analysis of two analytical solutions for 3-D solute transport in groundwater. Journal of Contaminant Hydrology. 75(1-2):141-153. <https://doi.org/10.1016/j.jconhyd.2004.06.004> [used]
- Iman, R.L., Conover, W.J. (1982). [A distribution-free approach to inducing rank correlation among input variables]. [planned]
- Johnson, P.C., Ettinger, R.A. (1991). [Heuristic model for predicting the intrusion rate of contaminant vapors into buildings]. Environmental Science and Technology. [planned]
- Johnson, P.C., Kemblowski, M.W., Johnson, R.L. (1998). [Assessing the significance of subsurface contaminant vapor migration to enclosed spaces]. American Petroleum Institute. API 4674. [planned]
- Jury, W.A., Spencer, W.F., Farmer, W.J. (1983). Behavior assessment model for trace organics in soil: I. Model description. Journal of Environmental Quality. 12(4):558-564. <https://doi.org/10.2134/jeq1983.00472425001200040026x> [planned]
- Lenhard, R.J., Parker, J.C., Mishra, S. (1989). On the correspondence between Brooks-Corey and van Genuchten models. Journal of Irrigation and Drainage Engineering. 115(4):744-751. <https://doi.org/10.1061/(ASCE)0733-9437(1989)115:4(744)> [used]
- Little, J.C. (1992). [Applying the two-resistance theory to contaminant volatilization in showers]. [planned]
- Long, E.R., MacDonald, D.D., Smith, S.L., Calder, F.D. (1995). Incidence of adverse biological effects within ranges of chemical concentrations in marine and estuarine sediments. Environmental Management. 19(1):81-97. <https://doi.org/10.1007/BF02472006> [planned]
- MacDonald, D.D., Ingersoll, C.G., Berger, T.A. (2000). Development and evaluation of consensus-based sediment quality guidelines for freshwater ecosystems. Archives of Environmental Contamination and Toxicology. 39(1):20-31. <https://doi.org/10.1007/s002440010075> [planned]
- Massachusetts Department of Environmental Protection (2002). [Characterizing risks posed by petroleum contaminated sites]. [planned]
- McKay, M.D., Beckman, R.J., Conover, W.J. (1979). [A comparison of three methods for selecting values of input variables in the analysis of output from a computer code]. [planned]
- Millington, R.J., Quirk, J.P. (1961). Permeability of porous solids. Transactions of the Faraday Society. 57:1200-1207. <https://doi.org/10.1039/TF9615701200> [used]
- Morris, M.D. (1991). [Factorial sampling plans for preliminary computational experiments]. [planned]
- Mualem, Y. (1976). A new model for predicting the hydraulic conductivity of unsaturated porous media. Water Resources Research. 12(3):513-522. <https://doi.org/10.1029/WR012i003p00513> [used]
- Newell, C.J., McLeod, R.K., Gonzales, J.R. (1996). BIOSCREEN natural attenuation decision support system, user's manual. U.S. Environmental Protection Agency. EPA/600/R-96/087, Version 1.3, August 1996. <https://nepis.epa.gov/Adobe/PDF/P1007K50.pdf> [used]
- Saltelli, A., et al. (2010). [Variance based sensitivity analysis of model output]. [planned]
- Sample, B.E., et al. (1996). [Toxicological benchmarks for wildlife]. Oak Ridge National Laboratory. [planned]
- Schulze-Makuch, D. (2005). Longitudinal dispersivity data and implications for scaling behavior. Ground Water. 43(3):443-456. <https://doi.org/10.1111/j.1745-6584.2005.0051.x> [used]
- Sobol, I.M. (1993). [Sensitivity estimates for nonlinear mathematical models]. [planned]
- Spence, L.R., Walden, T. (2001). RISC4 User's Manual. BP Oil International. Version 4.0, October 2001. <https://www.isprambiente.gov.it/contentfiles/00002500/2516-c2179-risc4-manual.pdf> [fixture]
- Srinivasan, V., Clement, T.P. (2008). [Analytical solutions for sequentially coupled one-dimensional reactive transport problems, part I]. Advances in Water Resources. 31:203-218. [planned]
- Srinivasan, V., Clement, T.P. (2008). [Analytical solutions for sequentially coupled one-dimensional reactive transport problems, part II]. Advances in Water Resources. 31:219-232. [planned]
- Srinivasan, V., Clement, T.P., Lee, K.K. (2007). Domenico solution: is it valid?. Ground Water. 45(2):136-146. <https://doi.org/10.1111/j.1745-6584.2006.00281.x> [used]
- Stephan, C.E., Mount, D.I., Hansen, D.J., Gentile, J.H., Chapman, G.A., Brungs, W.A. (1985). Guidelines for Deriving Numerical National Water Quality Criteria for the Protection of Aquatic Organisms and Their Uses. U.S. Environmental Protection Agency, Office of Research and Development. PB85-227049. <https://www.epa.gov/sites/production/files/2016-02/documents/guidelines-water-quality-criteria.pdf> [planned]
- Total Petroleum Hydrocarbon Criteria Working Group (1997). [TPHCWG series, volumes published 1997 to 1999]. [planned]
- Trapp, S. (2015). [Plant uptake and transport models for neutral and ionic chemicals]. [planned]
- Trapp, S., Matthies, M. (1995). [Generic one-compartment model for uptake of organic chemicals by foliar vegetation]. [planned]
- U.S. Environmental Protection Agency (1989). Risk Assessment Guidance for Superfund, Volume I: Human Health Evaluation Manual (Part A), Interim Final. U.S. Environmental Protection Agency, Office of Emergency and Remedial Response. EPA/540/1-89/002, December 1989. <https://www.epa.gov/system/files/documents/2024-10/rags_a_508.pdf> [used]
- U.S. Environmental Protection Agency (1991). Risk Assessment Guidance for Superfund, Volume I: Human Health Evaluation Manual, Supplemental Guidance: "Standard Default Exposure Factors", Interim Final. U.S. Environmental Protection Agency, Office of Emergency and Remedial Response. OSWER Directive 9285.6-03, PB91-921314, March 25, 1991. <https://semspub.epa.gov/src/document/HQ/190591> [used]
- U.S. Environmental Protection Agency (1992). Dermal Exposure Assessment: Principles and Applications, Interim Report. U.S. Environmental Protection Agency, Office of Health and Environmental Assessment. EPA/600/8-91/011B, January 1992. <https://rais.ornl.gov/documents/DERM_EXP.PDF> [used]
- U.S. Environmental Protection Agency (1996). Soil Screening Guidance: Technical Background Document. U.S. Environmental Protection Agency. EPA/540/R-95/128 (Publication 9355.4-17A), Second Edition, May 1996. <https://semspub.epa.gov/work/HQ/207.pdf> [used]
- U.S. Environmental Protection Agency (1997). Guiding Principles for Monte Carlo Analysis. U.S. Environmental Protection Agency. EPA/630/R-97/001. [planned]
- U.S. Environmental Protection Agency (2001). Risk Assessment Guidance for Superfund, Volume III, Part A, Process for Conducting Probabilistic Risk Assessment. [planned]
- U.S. Environmental Protection Agency (2002). Supplemental Guidance for Developing Soil Screening Levels for Superfund Sites. U.S. Environmental Protection Agency. OSWER 9355.4-24, December 2002. <https://semspub.epa.gov/work/HQ/175878.pdf> [planned]
- U.S. Environmental Protection Agency (2003). Human Health Toxicity Values in Superfund Risk Assessments. U.S. Environmental Protection Agency, Office of Superfund Remediation and Technology Innovation. OSWER Directive 9285.7-53, December 5, 2003. <https://semspub.epa.gov/work/HQ/136.pdf> [data]
- U.S. Environmental Protection Agency (2003). Ecological Soil Screening Levels (Eco-SSLs). [planned]
- U.S. Environmental Protection Agency (2004). [Johnson and Ettinger (1991) vapor intrusion model spreadsheets]. [planned]
- U.S. Environmental Protection Agency (2004). Risk Assessment Guidance for Superfund, Volume I: Human Health Evaluation Manual (Part E, Supplemental Guidance for Dermal Risk Assessment), Final. U.S. Environmental Protection Agency, Office of Superfund Remediation and Technology Innovation. EPA/540/R/99/005, OSWER 9285.7-02EP, PB99-963312, July 2004. <https://www.epa.gov/sites/default/files/2015-09/documents/part_e_final_revision_10-03-07.pdf> [used]
- U.S. Environmental Protection Agency (2005). Supplemental Guidance for Assessing Susceptibility from Early-Life Exposure to Carcinogens. U.S. Environmental Protection Agency, Risk Assessment Forum. EPA/630/R-03/003F, March 2005. <https://www.epa.gov/sites/default/files/2013-09/documents/childrens_supplement_final.pdf> [used]
- U.S. Environmental Protection Agency (2005). Guidelines for Carcinogen Risk Assessment. U.S. Environmental Protection Agency, Risk Assessment Forum. EPA/630/P-03/001F, March 2005. <https://www.epa.gov/sites/default/files/2013-09/documents/cancer_guidelines_final_3-25-05.pdf> [used]
- U.S. Environmental Protection Agency (2005). Human Health Risk Assessment Protocol for Hazardous Waste Combustion Facilities. [planned]
- U.S. Environmental Protection Agency (2009). Risk Assessment Guidance for Superfund, Volume I: Human Health Evaluation Manual (Part F, Supplemental Guidance for Inhalation Risk Assessment), Final. U.S. Environmental Protection Agency, Office of Superfund Remediation and Technology Innovation. EPA-540-R-070-002, OSWER 9285.7-82, January 2009. <https://www.epa.gov/sites/default/files/2015-09/documents/partf_200901_final.pdf> [used]
- U.S. Environmental Protection Agency (2011). Exposure Factors Handbook: 2011 Edition (Final). U.S. Environmental Protection Agency, National Center for Environmental Assessment. EPA/600/R-09/052F, September 2011. <https://cfpub.epa.gov/ncea/risk/recordisplay.cfm?deid=236252> [used]
- U.S. Environmental Protection Agency (2012). Recommendations for Default Value for Relative Bioavailability of Arsenic in Soil. U.S. Environmental Protection Agency, Office of Solid Waste and Emergency Response. OSWER 9200.1-113, December 2012. <https://semspub.epa.gov/work/HQ/175338.pdf> [used]
- U.S. Environmental Protection Agency (2014). Human Health Evaluation Manual, Supplemental Guidance: Update of Standard Default Exposure Factors. U.S. Environmental Protection Agency, Office of Solid Waste and Emergency Response. OSWER Directive 9200.1-120, February 6, 2014. <https://www.epa.gov/sites/default/files/2015-11/documents/oswer_directive_9200.1-120_exposurefactors_corrected2.pdf> [used]
- U.S. Environmental Protection Agency (2015). [Technical guide for addressing petroleum vapor intrusion at leaking underground storage tank sites]. [planned]
- U.S. Environmental Protection Agency (2015). OSWER Technical Guide for Assessing and Mitigating the Vapor Intrusion Pathway from Subsurface Vapor Sources to Indoor Air. [planned]
- U.S. Environmental Protection Agency (2024). Regional Screening Levels (RSLs), Generic Tables, November 2024. U.S. Environmental Protection Agency. SEMS documents 405270 (summary table), 405302 (chemical-specific parameters) and 405290 (resident tap water), TR = 1E-06, THQ = 1. <https://www.epa.gov/risk/regional-screening-levels-rsls-generic-tables> [data]
- U.S. Environmental Protection Agency (2024). Regional Screening Levels (RSLs), User's Guide. U.S. Environmental Protection Agency. Web page accompanying the November 2024 tables. <https://www.epa.gov/risk/regional-screening-levels-rsls-users-guide> [fixture]
- U.S. Environmental Protection Agency (2025). National Recommended Water Quality Criteria - Human Health Criteria Table. U.S. Environmental Protection Agency. <https://www.epa.gov/wqc/national-recommended-water-quality-criteria-human-health-criteria-table> [data]
- U.S. Environmental Protection Agency (2026). CompTox Chemicals Dashboard. [data]
- U.S. Environmental Protection Agency (2026). Integrated Risk Information System (IRIS). [data]
- U.S. Environmental Protection Agency (2026). National Recommended Water Quality Criteria - Aquatic Life Criteria Table. U.S. Environmental Protection Agency. <https://www.epa.gov/wqc/national-recommended-water-quality-criteria-aquatic-life-criteria-table> [data]
- U.S. Environmental Protection Agency, Region 4 (2018). Region 4 Ecological Risk Assessment Supplemental Guidance, March 2018 Update. U.S. Environmental Protection Agency, Region 4, Superfund Division, Scientific Support Section. <https://www.epa.gov/sites/default/files/2018-03/documents/era_regional_supplemental_guidance_report-march-2018_update.pdf> [planned]
- Ünlü, K., Kemblowski, M.W., Parker, J.C., Stevens, D., Chong, P.K., Kamil, I. (1992). A screening model for effects of land-disposed wastes on groundwater quality. Journal of Contaminant Hydrology. 11(1-2):27-49. <https://doi.org/10.1016/0169-7722(92)90032-A> [used]
- Utrecht University (MiBiPreT) (2026). mibitrans. Version 1.0.1. <https://pypi.org/project/mibitrans/> [fixture]
- van Genuchten, M.Th. (1980). A closed-form equation for predicting the hydraulic conductivity of unsaturated soils. Soil Science Society of America Journal. 44(5):892-898. <https://doi.org/10.2136/sssaj1980.03615995004400050002x> [used]
- van Genuchten, M.Th., Alves, W.J. (1982). Analytical solutions of the one-dimensional convective-dispersive solute transport equation. U.S. Department of Agriculture, Agricultural Research Service, Technical Bulletin. No. 1661, 151 p. <https://doi.org/10.22004/ag.econ.157268> [used]
- Walden, T., Spence, L.R. (1997). [Irrigation water pathways]. [planned]
- Weaver, J. (2017). PVIScreen. U.S. Environmental Protection Agency. [planned]
- West, M.R., Kueper, B.H., Ungs, M.J. (2007). On the use and error of approximation in the Domenico (1987) solution. Ground Water. 45(2):126-135. <https://doi.org/10.1111/j.1745-6584.2006.00280.x> [used]
- Wexler, E.J. (1992). Analytical solutions for one-, two-, and three-dimensional solute transport in ground-water systems with uniform flow. U.S. Geological Survey Techniques of Water-Resources Investigations. TWRI 3-B7 (Book 3, Chapter B7). <https://doi.org/10.3133/twri03b7> [used]
- Wexler, E.J. (1996). ANALGWST (analytical groundwater solute transport code), version 1.1. U.S. Geological Survey. Version 1.1 (1996/04/03). <https://water.usgs.gov/software/ANALGWST/> [fixture]
- Xu, M., Eckstein, Y. (1995). Use of weighted least-squares method in evaluation of the relationship between dispersivity and field scale. Ground Water. 33(6):905-908. [used]
- Yao, Y., Pennell, K.G., Suuberg, E.M. (2011). [Vapor intrusion model comparisons]. [planned]
- Yao, Y., Shen, R., Suuberg, E.M. (2013). [Review of vapor intrusion modeling]. [planned]
- Yeh, G.T. (1981). AT123D: Analytical transient one-, two-, and three-dimensional simulation of waste transport in the aquifer system. Oak Ridge National Laboratory. ORNL-5602. <https://doi.org/10.2172/6531241> [used]
