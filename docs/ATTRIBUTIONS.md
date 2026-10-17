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

### vapor

#### Johnson and Ettinger soil, soil gas or groundwater to indoor air

- Kind: Legacy (RISC5 default)
- Method id: `vapor.je-1991`
- Summary: Steady one-dimensional diffusion through clean soil layers (and an entered capillary fringe for a groundwater source) coupled to advection and diffusion through foundation cracks and a well-mixed building, for an infinite source.
- Assumptions:
  - Steady, one-dimensional vapor transport through homogeneous layers; the source extends under the whole building footprint.
  - Infinite source: the source vapor concentration does not change with time; linked to a time-varying source the method is applied quasi-steadily.
  - No sorption to building materials and no indoor background; no biodegradation.
  - Henry constant as entered (25 deg C); foundation diffusion from the foundation layer itself.
- RISC5 choice: RISC5 takes the crack diffusion coefficient from the foundation layer entered as a soil layer, enters the capillary fringe as a layer of given moisture, asks for hydraulic conductivity to estimate the vapor permeability, takes air exchanges per day, holds the source constant, and uses an air viscosity of 1.8e-4 g/(cm s).
- Sources:
  - Johnson, P.C., Ettinger, R.A. (1991). Heuristic model for predicting the intrusion rate of contaminant vapors into buildings. Environmental Science and Technology. 25(8):1445-1452. <https://doi.org/10.1021/es00020a013>
  - Millington, R.J., Quirk, J.P. (1961). Permeability of porous solids. Transactions of the Faraday Society. 57:1200-1207. <https://doi.org/10.1039/TF9615701200>
  - U.S. Environmental Protection Agency (1996). Soil Screening Guidance: Technical Background Document. U.S. Environmental Protection Agency. EPA/540/R-95/128 (Publication 9355.4-17A), Second Edition, May 1996. <https://semspub.epa.gov/work/HQ/207.pdf>

#### Dominant-layer vapor model with first-order degradation

- Kind: Legacy (RISC5 default)
- Method id: `vapor.dominant-layer-1998`
- Summary: Three homogeneous soil layers above the source, the middle one degrading vapor at a first-order rate acting on the dissolved concentration, solved in closed form (hyperbolic profile) and coupled to the Johnson and Ettinger building for indoor air or to a zero-concentration ground surface for outdoor air.
- Assumptions:
  - Steady, one-dimensional transport; layers 1 and 3 do not degrade the chemical.
  - Degradation is proportional to the dissolved concentration and the water content of layer 2.
  - Infinite source; the receptor coefficient is linear in the source vapor concentration.
  - Outdoor: zero vapor concentration at the ground surface; the result is an area emission.
- RISC5 choice: RISC5 applies degradation to the water phase times moisture in the middle layer only, takes the source soil properties separately from the transport layers, and reports the indoor or outdoor result for the same column; with zero degradation the result equals the legacy Johnson and Ettinger model.
- Sources:
  - Johnson, P.C., Kemblowski, M.W., Johnson, R.L. (1998). Assessing the Significance of Subsurface Contaminant Vapor Migration to Enclosed Spaces: Site-Specific Alternative to Generic Estimates. American Petroleum Institute. API Publication 4674, December 1998.
  - Johnson, P.C., Ettinger, R.A. (1991). Heuristic model for predicting the intrusion rate of contaminant vapors into buildings. Environmental Science and Technology. 25(8):1445-1452. <https://doi.org/10.1021/es00020a013>
  - Millington, R.J., Quirk, J.P. (1961). Permeability of porous solids. Transactions of the Faraday Society. 57:1200-1207. <https://doi.org/10.1039/TF9615701200>
  - U.S. Environmental Protection Agency (1996). Soil Screening Guidance: Technical Background Document. U.S. Environmental Protection Agency. EPA/540/R-95/128 (Publication 9355.4-17A), Second Edition, May 1996. <https://semspub.epa.gov/work/HQ/207.pdf>

#### EPA Johnson and Ettinger soil, soil gas or groundwater to indoor air

- Kind: Modern
- Method id: `vapor.je-epa`
- Summary: The EPA implementation of the Johnson and Ettinger model: layered soil with texture presets, Henry constant at the soil temperature, a capillary zone from the van Genuchten curve, five foundation types, soil gas flow from a ratio or the soil permeability, and an optional finite soil source.
- Assumptions:
  - Steady, one-dimensional vapor transport through homogeneous layers; the source extends under the whole building footprint.
  - Infinite source unless a finite soil source is requested; linked to a time-varying source the method is applied quasi-steadily.
  - No sorption to building materials, no indoor background and no biodegradation.
  - The crack diffusion coefficient is that of the soil layer in contact with the floor; the source-building separation excludes the floor.
  - The capillary zone is uncontaminated and its top must lie below the floor.
- RISC5 choice: RISC5 holds Henry constant at 25 deg C, takes the crack diffusion coefficient from a foundation layer, enters the capillary fringe as a layer, and keeps the source infinite; this method follows EPA on each point.
- Sources:
  - U.S. Environmental Protection Agency (2004). User's Guide for Evaluating Subsurface Vapor Intrusion into Buildings. U.S. Environmental Protection Agency, Office of Emergency and Remedial Response. Revised February 22, 2004 (prepared by Environmental Quality Management, Inc., EPA Contract 68-W-02-33). <https://19january2021snapshot.epa.gov/sites/static/files/2015-11/2004_0222_3phase_users_guide.pdf>
  - U.S. Environmental Protection Agency (2017). Documentation for EPA's Implementation of the Johnson and Ettinger Model to Evaluate Site Specific Vapor Intrusion into Buildings, Version 6.0. U.S. Environmental Protection Agency, Office of Superfund Remediation and Technology Innovation. Revised September 2017. <https://semspub.epa.gov/work/HQ/100000489.pdf>
  - Johnson, P.C., Ettinger, R.A. (1991). Heuristic model for predicting the intrusion rate of contaminant vapors into buildings. Environmental Science and Technology. 25(8):1445-1452. <https://doi.org/10.1021/es00020a013>
  - Millington, R.J., Quirk, J.P. (1961). Permeability of porous solids. Transactions of the Faraday Society. 57:1200-1207. <https://doi.org/10.1039/TF9615701200>
  - van Genuchten, M.Th. (1980). A closed-form equation for predicting the hydraulic conductivity of unsaturated soils. Soil Science Society of America Journal. 44(5):892-898. <https://doi.org/10.2136/sssaj1980.03615995004400050002x>

#### Oxygen-limited biodegradation vapor intrusion (DeVaull)

- Kind: Modern
- Method id: `vapor.devaull-2007`
- Summary: One soil column between the source and the foundation split into an anaerobic layer and an aerobic layer where the chemical degrades at a first-order rate, solved in closed form (overflow-safe hyperbolic profile) and coupled to a foundation mass transfer coefficient and the indoor air. The aerobic depth is entered, set by a fast-reaction oxygen balance, or found from the coupled oxygen supply and demand.
- Assumptions:
  - Steady, one-dimensional transport through one homogeneous layer; infinite source under the whole footprint.
  - Degradation acts on the dissolved concentration of the aerobic layer only; the anaerobic layer does not degrade.
  - Oxygen enters by diffusion from a fixed concentration at the base of the foundation; baseline respiration is zero-order.
  - The total hydrocarbon that sets the oxygen demand moves with the diffusivity and degrades at the rate of the chemical of concern.
  - With the aerobic depth zero the result equals the Johnson and Ettinger model with the same foundation term.
- Sources:
  - DeVaull, G.E. (2007). Indoor Vapor Intrusion with Oxygen-Limited Biodegradation for a Subsurface Gasoline Source. Environmental Science and Technology. 41(9):3241-3248. <https://doi.org/10.1021/es060672a>
  - American Petroleum Institute (2012). BioVapor: A 1-D Vapor Intrusion Model with Oxygen-Limited Aerobic Biodegradation, Users Manual, Version 2.1. American Petroleum Institute (prepared by GSI Environmental Inc.). November 2012. <https://api.org/~/media/Files/EHS/Clean_Water/Ground_Water_Quality/biovapor/BioVapor-Users-Guide.pdf>
  - Johnson, P.C., Ettinger, R.A. (1991). Heuristic model for predicting the intrusion rate of contaminant vapors into buildings. Environmental Science and Technology. 25(8):1445-1452. <https://doi.org/10.1021/es00020a013>
  - Millington, R.J., Quirk, J.P. (1961). Permeability of porous solids. Transactions of the Faraday Society. 57:1200-1207. <https://doi.org/10.1039/TF9615701200>

#### Empirical attenuation factors (EPA 2015)

- Kind: Modern
- Method id: `vapor.attenuation-factor-2015`
- Summary: Indoor air as a generic attenuation factor times the vapor concentration of the medium (groundwater through its equilibrium vapor at the groundwater temperature, sub-slab or exterior soil gas, crawlspace air). An empirical screening option, not a fate model.
- Assumptions:
  - Generic residential factors from the EPA 2015 technical guide, upper-percentile empirical values.
  - The groundwater factor acts on the vapor in equilibrium with groundwater, H prime at the groundwater temperature.
  - Not intended for a source less than 5 ft below the foundation or where preferential pathways exist.
- Sources:
  - U.S. Environmental Protection Agency (2015). OSWER Technical Guide for Assessing and Mitigating the Vapor Intrusion Pathway from Subsurface Vapor Sources to Indoor Air. U.S. Environmental Protection Agency, Office of Solid Waste and Emergency Response. OSWER Publication 9200.2-154, June 2015. <https://19january2017snapshot.epa.gov/sites/production/files/2015-09/documents/oswer-vapor-intrusion-technical-guide-final.pdf>
  - U.S. Environmental Protection Agency (2026). Vapor Intrusion Screening Level User's Guide. U.S. Environmental Protection Agency. <https://www.epa.gov/vaporintrusion/visl-users-guide>
  - U.S. Environmental Protection Agency (2004). User's Guide for Evaluating Subsurface Vapor Intrusion into Buildings. U.S. Environmental Protection Agency, Office of Emergency and Remedial Response. Revised February 22, 2004 (prepared by Environmental Quality Management, Inc., EPA Contract 68-W-02-33). <https://19january2021snapshot.epa.gov/sites/static/files/2015-11/2004_0222_3phase_users_guide.pdf>

#### Petroleum vapor intrusion vertical separation screen (EPA 2015)

- Kind: Modern
- Method id: `vapor.pvi-screen-2015`
- Summary: A screened-out or further-assessment verdict from the clean-soil separation between the contamination and the building: 6 ft for a dissolved source, 15 ft for LNAPL under a building with a side shorter than 66 ft, with precluding factors forcing further assessment.
- Assumptions:
  - The Table 3 thresholds classify the source as dissolved or LNAPL; the separation is clean, biologically active soil.
  - A verdict, not a concentration: it does not predict indoor air.
  - Precluding factors (preferential pathways, high-ethanol blends, lead scavengers, a larger building over LNAPL, extensive impermeable cover, contamination in contact with the building) force further assessment.
- Sources:
  - U.S. Environmental Protection Agency (2015). Technical Guide for Addressing Petroleum Vapor Intrusion at Leaking Underground Storage Tank Sites. U.S. Environmental Protection Agency, Office of Underground Storage Tanks. EPA 510-R-15-001, June 2015. <https://www.epa.gov/ust/technical-guide-addressing-petroleum-vapor-intrusion-leaking-underground-storage-tank-sites>
  - Lahvis, M.A., Hers, I., Davis, R.V., Wright, J., DeVaull, G.E. (2013). Vapor intrusion screening at petroleum UST sites. Ground Water Monitoring and Remediation. 33(2):53-67. <https://doi.org/10.1111/gwmr.12005>

#### Jury behaviour-assessment soil volatilization

- Kind: Modern
- Method id: `vapor.jury-bam`
- Summary: Transient, depleting volatilization flux from a contaminated soil layer under an optional clean cover with an optional stagnant air boundary layer and first-order degradation, in closed form for zero water flux; the flux series is an area emission to the outdoor box.
- Assumptions:
  - Zero water flux; semi-infinite soil below the contaminated layer; one homogeneous soil.
  - Linear equilibrium sorption and Henry partitioning; Millington-Quirk diffusion.
  - The closed form is derived in the methods note and checked against a finite-difference solution of the same equation and the published reduced solution, not against the full papers.
- RISC5 choice: RISC5 offers Jury volatilization as a soil emission source; this implementation covers zero water flux only.
- Sources:
  - Jury, W.A., Spencer, W.F., Farmer, W.J. (1983). Behavior assessment model for trace organics in soil: I. Model description. Journal of Environmental Quality. 12(4):558-564. <https://doi.org/10.2134/jeq1983.00472425001200040026x>
  - Jury, W.A., Russo, D., Streile, G., El Abd, H. (1990). Evaluation of volatilization by organic chemicals residing below the soil surface. Water Resources Research. 26(1):13-20. <https://doi.org/10.1029/WR026i001p00013>
  - Millington, R.J., Quirk, J.P. (1961). Permeability of porous solids. Transactions of the Faraday Society. 57:1200-1207. <https://doi.org/10.1039/TF9615701200>

### outdoorAir

#### Outdoor air box model

- Kind: Legacy (RISC5 default)
- Method id: `outdoorAir.box`
- Summary: Emissions into a fully mixed box of length, width and breathing-zone height ventilated by the wind: C = sum(E) / (u delta W), which for an area flux over the footprint is F L / (u delta).
- Assumptions:
  - The receptor is at the downwind edge of the box; no vertical dispersion out of the box.
  - No deposition or decay in air; steady emission.
  - The width cancels for an area flux over the whole footprint.
- RISC5 choice: RISC5 ventilates a box over the source by a wind of fixed speed and mixing height and feeds it from the soil, groundwater or unsaturated zone emission; its Table R-6 print is not reproduced (see the fixture README).
- Sources:
  - Hanna, S.R., Briggs, G.A., Hosker, R.P., Jr. (1982). Handbook on atmospheric diffusion. U.S. Department of Energy, Office of Health and Environmental Research. DOE/TIC-11223.

#### Soil Screening Guidance volatilization factor

- Kind: Modern
- Method id: `outdoorAir.ssg-vf-1996`
- Summary: Soil-to-air volatilization factor for a surface soil source: the time-averaged Jury infinite-source flux over the exposure interval divided into a user-entered dispersion factor Q/C, bounded below by the mass-limit VF for a source of finite depth.
- Assumptions:
  - Uniformly contaminated, semi-infinite soil with no boundary layer, no water flux and no degradation.
  - The result is an air concentration at the centre of a square ground-level area source via Q/C; it does not use the outdoor box.
  - Adding this to a box emission for the same area double counts.
- RISC5 choice: Offered as the modern option for outdoor air; Q/C is user-entered with the guidance default of 68.81 g/(m^2 s) per kg/m^3 for a 0.5 acre source.
- Sources:
  - U.S. Environmental Protection Agency (1996). Soil Screening Guidance: Technical Background Document. U.S. Environmental Protection Agency. EPA/540/R-95/128 (Publication 9355.4-17A), Second Edition, May 1996. <https://semspub.epa.gov/work/HQ/207.pdf>
  - Millington, R.J., Quirk, J.P. (1961). Permeability of porous solids. Transactions of the Faraday Society. 57:1200-1207. <https://doi.org/10.1039/TF9615701200>

## Planned methods

Sources for methods on the roadmap that are not implemented yet. Nothing here affects a result today.

- Abreu, L.D.V., Ettinger, R., McAlary, T. (2009). Simulated soil vapor intrusion attenuation factors including biodegradation for petroleum hydrocarbons. Ground Water Monitoring and Remediation. 29(1):105-117. <https://doi.org/10.1111/j.1745-6592.2008.01219.x>
- Abreu, L.D.V., Johnson, P.C. (2005). Effect of vapor source-building separation and building construction on soil vapor intrusion as studied with a three-dimensional numerical model. Environmental Science and Technology. 39(12):4550-4561. <https://doi.org/10.1021/es049781k>
- Abreu, L.D.V., Johnson, P.C. (2006). Simulating the effect of aerobic biodegradation on soil vapor intrusion into buildings: influence of degradation rate, source concentration, and depth. Environmental Science and Technology. 40(7):2304-2315. <https://doi.org/10.1021/es051335p>
- American Petroleum Institute (2010). BioVapor.
- ASTM International (1995). ASTM E1739-95 Standard guide for risk-based corrective action applied at petroleum release sites. E1739-95.
- Aziz, C.E., et al. (2000). BIOCHLOR.
- Briggs, G.G., et al. (1982). [Relationships between lipophilicity and root uptake and translocation of non-ionised chemicals by barley].
- Celia, M.A., Bouloutas, E.T., Zarba, R.L. (1990). A general mass-conservative numerical solution for the unsaturated flow equation. Water Resources Research. 26(7):1483-1496. <https://doi.org/10.1029/WR026i007p01483>
- Cline, P.V., Delfino, J.J., Rao, P.S.C. (1991). Partitioning of aromatic constituents into water from gasoline and other complex solvent mixtures. Environmental Science & Technology. 25(5):914-920. <https://doi.org/10.1021/es00017a013>
- Cowherd, C., et al. (1985). [Rapid assessment of exposure to particulate emissions from surface contamination sites].
- Falta, R.W. (2026). REMChlor. U.S. Environmental Protection Agency.
- Foster, S.A., Chrostowski, P.C. (1986). [Inhalation exposures to volatile organic contaminants in the shower].
- Gelhar, L.W., Welty, C., Rehfeldt, K.R. (1992). [A critical review of data on field-scale dispersion in aquifers]. Water Resources Research. 28:1955-1974.
- Iman, R.L., Conover, W.J. (1982). [A distribution-free approach to inducing rank correlation among input variables].
- Little, J.C. (1992). [Applying the two-resistance theory to contaminant volatilization in showers].
- MacDonald, D.D., et al. (2000). [Development and evaluation of consensus-based sediment quality guidelines for freshwater ecosystems].
- Massachusetts Department of Environmental Protection (2002). [Characterizing risks posed by petroleum contaminated sites].
- McKay, M.D., Beckman, R.J., Conover, W.J. (1979). [A comparison of three methods for selecting values of input variables in the analysis of output from a computer code].
- Morris, M.D. (1991). [Factorial sampling plans for preliminary computational experiments].
- National Oceanic and Atmospheric Administration (2026). Screening Quick Reference Tables (SQuiRTs).
- Saltelli, A., et al. (2010). [Variance based sensitivity analysis of model output].
- Sample, B.E., et al. (1996). [Toxicological benchmarks for wildlife]. Oak Ridge National Laboratory.
- Sobol, I.M. (1993). [Sensitivity estimates for nonlinear mathematical models].
- Srinivasan, V., Clement, T.P. (2008). [Analytical solutions for sequentially coupled one-dimensional reactive transport problems, part I]. Advances in Water Resources. 31:203-218.
- Srinivasan, V., Clement, T.P. (2008). [Analytical solutions for sequentially coupled one-dimensional reactive transport problems, part II]. Advances in Water Resources. 31:219-232.
- Total Petroleum Hydrocarbon Criteria Working Group (1997). [TPHCWG series, volumes published 1997 to 1999].
- Trapp, S. (2015). [Plant uptake and transport models for neutral and ionic chemicals].
- Trapp, S., Matthies, M. (1995). [Generic one-compartment model for uptake of organic chemicals by foliar vegetation].
- U.S. Environmental Protection Agency (1997). Guiding Principles for Monte Carlo Analysis. U.S. Environmental Protection Agency. EPA/630/R-97/001.
- U.S. Environmental Protection Agency (2001). Risk Assessment Guidance for Superfund, Volume III, Part A, Process for Conducting Probabilistic Risk Assessment.
- U.S. Environmental Protection Agency (2002). Supplemental Guidance for Developing Soil Screening Levels for Superfund Sites. U.S. Environmental Protection Agency. OSWER 9355.4-24, December 2002. <https://semspub.epa.gov/work/HQ/175878.pdf>
- U.S. Environmental Protection Agency (2003). Ecological Soil Screening Levels (Eco-SSLs).
- U.S. Environmental Protection Agency (2005). Human Health Risk Assessment Protocol for Hazardous Waste Combustion Facilities.
- U.S. Environmental Protection Agency (2026). National Recommended Water Quality Criteria (NRWQC).
- Walden, T., Spence, L.R. (1997). [Irrigation water pathways].
- Weaver, J. (2017). PVIScreen. U.S. Environmental Protection Agency.
- Yao, Y., Shen, R., Pennell, K.G., Suuberg, E.M. (2011). Comparison of the Johnson-Ettinger vapor intrusion screening model predictions with full three-dimensional model results. Environmental Science and Technology. 45(6):2227-2235. <https://doi.org/10.1021/es102602s>
- Yao, Y., Shen, R., Pennell, K.G., Suuberg, E.M. (2013). A review of vapor intrusion models. Environmental Science and Technology. 47(6):2457-2470. <https://doi.org/10.1021/es302714g>

## Data sources

Public datasets that the chemical and toxicity database is built from.

- U.S. Environmental Protection Agency (2003). Human Health Toxicity Values in Superfund Risk Assessments. U.S. Environmental Protection Agency, Office of Superfund Remediation and Technology Innovation. OSWER Directive 9285.7-53, December 5, 2003. <https://semspub.epa.gov/work/HQ/136.pdf>
- U.S. Environmental Protection Agency (2024). Regional Screening Levels (RSLs), Generic Tables, November 2024. U.S. Environmental Protection Agency. SEMS documents 405270 (summary table), 405302 (chemical-specific parameters) and 405290 (resident tap water), TR = 1E-06, THQ = 1. <https://www.epa.gov/risk/regional-screening-levels-rsls-generic-tables>
- U.S. Environmental Protection Agency (2026). CompTox Chemicals Dashboard.
- U.S. Environmental Protection Agency (2026). Integrated Risk Information System (IRIS).

## Validation sources

Reviews, codes and packages used to produce test fixtures. They are checks on this software, not parts of it.

- Arcadis Geraghty & Miller (2001). Review of Risk Integrated Software for Cleanups (RISC) v4.0.
- Spence, L.R., Walden, T. (2001). RISC4 User's Manual. BP Oil International. Version 4.0, October 2001. <https://www.isprambiente.gov.it/contentfiles/00002500/2516-c2179-risc4-manual.pdf>
- U.S. Environmental Protection Agency (2024). Regional Screening Levels (RSLs), User's Guide. U.S. Environmental Protection Agency. Web page accompanying the November 2024 tables. <https://www.epa.gov/risk/regional-screening-levels-rsls-users-guide>
- Utrecht University (MiBiPreT) (2026). mibitrans. Version 1.0.1. <https://pypi.org/project/mibitrans/>
- Wexler, E.J. (1996). ANALGWST (analytical groundwater solute transport code), version 1.1. U.S. Geological Survey. Version 1.1 (1996/04/03). <https://water.usgs.gov/software/ANALGWST/>

## References

Every entry in the reference database, alphabetical by author.

- Abreu, L.D.V., Ettinger, R., McAlary, T. (2009). Simulated soil vapor intrusion attenuation factors including biodegradation for petroleum hydrocarbons. Ground Water Monitoring and Remediation. 29(1):105-117. <https://doi.org/10.1111/j.1745-6592.2008.01219.x> [planned]
- Abreu, L.D.V., Johnson, P.C. (2005). Effect of vapor source-building separation and building construction on soil vapor intrusion as studied with a three-dimensional numerical model. Environmental Science and Technology. 39(12):4550-4561. <https://doi.org/10.1021/es049781k> [planned]
- Abreu, L.D.V., Johnson, P.C. (2006). Simulating the effect of aerobic biodegradation on soil vapor intrusion into buildings: influence of degradation rate, source concentration, and depth. Environmental Science and Technology. 40(7):2304-2315. <https://doi.org/10.1021/es051335p> [planned]
- American Petroleum Institute (1987). Oil and Gas Industry Exploration and Production Wastes. Washington, D.C. API Document No. 471-01-09. [used]
- American Petroleum Institute (2010). BioVapor. [planned]
- American Petroleum Institute (2012). BioVapor: A 1-D Vapor Intrusion Model with Oxygen-Limited Aerobic Biodegradation, Users Manual, Version 2.1. American Petroleum Institute (prepared by GSI Environmental Inc.). November 2012. <https://api.org/~/media/Files/EHS/Clean_Water/Ground_Water_Quality/biovapor/BioVapor-Users-Guide.pdf> [used]
- Arcadis Geraghty & Miller (2001). Review of Risk Integrated Software for Cleanups (RISC) v4.0. [fixture]
- ASTM International (1995). ASTM E1739-95 Standard guide for risk-based corrective action applied at petroleum release sites. E1739-95. [planned]
- Aziz, C.E., et al. (2000). BIOCHLOR. [planned]
- Briggs, G.G., et al. (1982). [Relationships between lipophilicity and root uptake and translocation of non-ionised chemicals by barley]. [planned]
- Brooks, R.H., Corey, A.T. (1964). Hydraulic properties of porous media. Colorado State University, Fort Collins, Hydrology Papers. No. 3 (March 1964). <https://mountainscholar.org/bitstream/handle/10217/61288/HydrologyPapers_n3.pdf> [used]
- Celia, M.A., Bouloutas, E.T., Zarba, R.L. (1990). A general mass-conservative numerical solution for the unsaturated flow equation. Water Resources Research. 26(7):1483-1496. <https://doi.org/10.1029/WR026i007p01483> [planned]
- Cline, P.V., Delfino, J.J., Rao, P.S.C. (1991). Partitioning of aromatic constituents into water from gasoline and other complex solvent mixtures. Environmental Science & Technology. 25(5):914-920. <https://doi.org/10.1021/es00017a013> [planned]
- Cowherd, C., et al. (1985). [Rapid assessment of exposure to particulate emissions from surface contamination sites]. [planned]
- DeVaull, G.E. (2007). Indoor Vapor Intrusion with Oxygen-Limited Biodegradation for a Subsurface Gasoline Source. Environmental Science and Technology. 41(9):3241-3248. <https://doi.org/10.1021/es060672a> [used]
- Domenico, P.A. (1987). An analytical model for multidimensional transport of a decaying contaminant species. Journal of Hydrology. 91(1-2):49-58. <https://doi.org/10.1016/0022-1694(87)90127-2> [used]
- Falta, R.W. (2026). REMChlor. U.S. Environmental Protection Agency. [planned]
- Falta, R.W., Rao, P.S., Basu, N. (2005). Assessing the impacts of partial mass depletion in DNAPL source zones: I. Analytical modeling of source strength functions and plume response. Journal of Contaminant Hydrology. 78(4):259-280. <https://doi.org/10.1016/j.jconhyd.2005.05.010> [used]
- Feenstra, S., Mackay, D.M., Cherry, J.A. (1991). A method for assessing residual NAPL based on organic chemical concentrations in soil samples. Ground Water Monitoring Review. 11(2):128-136. <https://doi.org/10.1111/j.1745-6592.1991.tb00374.x> [used]
- Foster, S.A., Chrostowski, P.C. (1986). [Inhalation exposures to volatile organic contaminants in the shower]. [planned]
- Galya, D.P. (1987). A horizontal plane source model for ground-water transport. Ground Water. 25(6):733-739. <https://doi.org/10.1111/j.1745-6584.1987.tb02215.x> [used]
- Gelhar, L.W., Mantoglou, A., Welty, C., Rehfeldt, K.R. (1985). A review of field-scale physical solute transport processes in saturated and unsaturated porous media. Electric Power Research Institute. EPRI EA-4190. [used]
- Gelhar, L.W., Welty, C., Rehfeldt, K.R. (1992). [A critical review of data on field-scale dispersion in aquifers]. Water Resources Research. 28:1955-1974. [planned]
- Guyonnet, D., Neville, C. (2004). Dimensionless analysis of two analytical solutions for 3-D solute transport in groundwater. Journal of Contaminant Hydrology. 75(1-2):141-153. <https://doi.org/10.1016/j.jconhyd.2004.06.004> [used]
- Hanna, S.R., Briggs, G.A., Hosker, R.P., Jr. (1982). Handbook on atmospheric diffusion. U.S. Department of Energy, Office of Health and Environmental Research. DOE/TIC-11223. [used]
- Iman, R.L., Conover, W.J. (1982). [A distribution-free approach to inducing rank correlation among input variables]. [planned]
- Johnson, P.C., Ettinger, R.A. (1991). Heuristic model for predicting the intrusion rate of contaminant vapors into buildings. Environmental Science and Technology. 25(8):1445-1452. <https://doi.org/10.1021/es00020a013> [used]
- Johnson, P.C., Kemblowski, M.W., Johnson, R.L. (1998). Assessing the Significance of Subsurface Contaminant Vapor Migration to Enclosed Spaces: Site-Specific Alternative to Generic Estimates. American Petroleum Institute. API Publication 4674, December 1998. [used]
- Jury, W.A., Russo, D., Streile, G., El Abd, H. (1990). Evaluation of volatilization by organic chemicals residing below the soil surface. Water Resources Research. 26(1):13-20. <https://doi.org/10.1029/WR026i001p00013> [used]
- Jury, W.A., Spencer, W.F., Farmer, W.J. (1983). Behavior assessment model for trace organics in soil: I. Model description. Journal of Environmental Quality. 12(4):558-564. <https://doi.org/10.2134/jeq1983.00472425001200040026x> [used]
- Lahvis, M.A., Hers, I., Davis, R.V., Wright, J., DeVaull, G.E. (2013). Vapor intrusion screening at petroleum UST sites. Ground Water Monitoring and Remediation. 33(2):53-67. <https://doi.org/10.1111/gwmr.12005> [used]
- Lenhard, R.J., Parker, J.C., Mishra, S. (1989). On the correspondence between Brooks-Corey and van Genuchten models. Journal of Irrigation and Drainage Engineering. 115(4):744-751. <https://doi.org/10.1061/(ASCE)0733-9437(1989)115:4(744)> [used]
- Little, J.C. (1992). [Applying the two-resistance theory to contaminant volatilization in showers]. [planned]
- MacDonald, D.D., et al. (2000). [Development and evaluation of consensus-based sediment quality guidelines for freshwater ecosystems]. [planned]
- Massachusetts Department of Environmental Protection (2002). [Characterizing risks posed by petroleum contaminated sites]. [planned]
- McKay, M.D., Beckman, R.J., Conover, W.J. (1979). [A comparison of three methods for selecting values of input variables in the analysis of output from a computer code]. [planned]
- Millington, R.J., Quirk, J.P. (1961). Permeability of porous solids. Transactions of the Faraday Society. 57:1200-1207. <https://doi.org/10.1039/TF9615701200> [used]
- Morris, M.D. (1991). [Factorial sampling plans for preliminary computational experiments]. [planned]
- Mualem, Y. (1976). A new model for predicting the hydraulic conductivity of unsaturated porous media. Water Resources Research. 12(3):513-522. <https://doi.org/10.1029/WR012i003p00513> [used]
- National Oceanic and Atmospheric Administration (2026). Screening Quick Reference Tables (SQuiRTs). [planned]
- Newell, C.J., McLeod, R.K., Gonzales, J.R. (1996). BIOSCREEN natural attenuation decision support system, user's manual. U.S. Environmental Protection Agency. EPA/600/R-96/087, Version 1.3, August 1996. <https://nepis.epa.gov/Adobe/PDF/P1007K50.pdf> [used]
- Saltelli, A., et al. (2010). [Variance based sensitivity analysis of model output]. [planned]
- Sample, B.E., et al. (1996). [Toxicological benchmarks for wildlife]. Oak Ridge National Laboratory. [planned]
- Schulze-Makuch, D. (2005). Longitudinal dispersivity data and implications for scaling behavior. Ground Water. 43(3):443-456. <https://doi.org/10.1111/j.1745-6584.2005.0051.x> [used]
- Sobol, I.M. (1993). [Sensitivity estimates for nonlinear mathematical models]. [planned]
- Spence, L.R., Walden, T. (2001). RISC4 User's Manual. BP Oil International. Version 4.0, October 2001. <https://www.isprambiente.gov.it/contentfiles/00002500/2516-c2179-risc4-manual.pdf> [fixture]
- Srinivasan, V., Clement, T.P. (2008). [Analytical solutions for sequentially coupled one-dimensional reactive transport problems, part I]. Advances in Water Resources. 31:203-218. [planned]
- Srinivasan, V., Clement, T.P. (2008). [Analytical solutions for sequentially coupled one-dimensional reactive transport problems, part II]. Advances in Water Resources. 31:219-232. [planned]
- Srinivasan, V., Clement, T.P., Lee, K.K. (2007). Domenico solution: is it valid?. Ground Water. 45(2):136-146. <https://doi.org/10.1111/j.1745-6584.2006.00281.x> [used]
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
- U.S. Environmental Protection Agency (2004). User's Guide for Evaluating Subsurface Vapor Intrusion into Buildings. U.S. Environmental Protection Agency, Office of Emergency and Remedial Response. Revised February 22, 2004 (prepared by Environmental Quality Management, Inc., EPA Contract 68-W-02-33). <https://19january2021snapshot.epa.gov/sites/static/files/2015-11/2004_0222_3phase_users_guide.pdf> [used]
- U.S. Environmental Protection Agency (2004). Risk Assessment Guidance for Superfund, Volume I: Human Health Evaluation Manual (Part E, Supplemental Guidance for Dermal Risk Assessment), Final. U.S. Environmental Protection Agency, Office of Superfund Remediation and Technology Innovation. EPA/540/R/99/005, OSWER 9285.7-02EP, PB99-963312, July 2004. <https://www.epa.gov/sites/default/files/2015-09/documents/part_e_final_revision_10-03-07.pdf> [used]
- U.S. Environmental Protection Agency (2005). Supplemental Guidance for Assessing Susceptibility from Early-Life Exposure to Carcinogens. U.S. Environmental Protection Agency, Risk Assessment Forum. EPA/630/R-03/003F, March 2005. <https://www.epa.gov/sites/default/files/2013-09/documents/childrens_supplement_final.pdf> [used]
- U.S. Environmental Protection Agency (2005). Guidelines for Carcinogen Risk Assessment. U.S. Environmental Protection Agency, Risk Assessment Forum. EPA/630/P-03/001F, March 2005. <https://www.epa.gov/sites/default/files/2013-09/documents/cancer_guidelines_final_3-25-05.pdf> [used]
- U.S. Environmental Protection Agency (2005). Human Health Risk Assessment Protocol for Hazardous Waste Combustion Facilities. [planned]
- U.S. Environmental Protection Agency (2009). Risk Assessment Guidance for Superfund, Volume I: Human Health Evaluation Manual (Part F, Supplemental Guidance for Inhalation Risk Assessment), Final. U.S. Environmental Protection Agency, Office of Superfund Remediation and Technology Innovation. EPA-540-R-070-002, OSWER 9285.7-82, January 2009. <https://www.epa.gov/sites/default/files/2015-09/documents/partf_200901_final.pdf> [used]
- U.S. Environmental Protection Agency (2011). Exposure Factors Handbook: 2011 Edition (Final). U.S. Environmental Protection Agency, National Center for Environmental Assessment. EPA/600/R-09/052F, September 2011. <https://cfpub.epa.gov/ncea/risk/recordisplay.cfm?deid=236252> [used]
- U.S. Environmental Protection Agency (2012). Recommendations for Default Value for Relative Bioavailability of Arsenic in Soil. U.S. Environmental Protection Agency, Office of Solid Waste and Emergency Response. OSWER 9200.1-113, December 2012. <https://semspub.epa.gov/work/HQ/175338.pdf> [used]
- U.S. Environmental Protection Agency (2014). Human Health Evaluation Manual, Supplemental Guidance: Update of Standard Default Exposure Factors. U.S. Environmental Protection Agency, Office of Solid Waste and Emergency Response. OSWER Directive 9200.1-120, February 6, 2014. <https://www.epa.gov/sites/default/files/2015-11/documents/oswer_directive_9200.1-120_exposurefactors_corrected2.pdf> [used]
- U.S. Environmental Protection Agency (2015). Technical Guide for Addressing Petroleum Vapor Intrusion at Leaking Underground Storage Tank Sites. U.S. Environmental Protection Agency, Office of Underground Storage Tanks. EPA 510-R-15-001, June 2015. <https://www.epa.gov/ust/technical-guide-addressing-petroleum-vapor-intrusion-leaking-underground-storage-tank-sites> [used]
- U.S. Environmental Protection Agency (2015). OSWER Technical Guide for Assessing and Mitigating the Vapor Intrusion Pathway from Subsurface Vapor Sources to Indoor Air. U.S. Environmental Protection Agency, Office of Solid Waste and Emergency Response. OSWER Publication 9200.2-154, June 2015. <https://19january2017snapshot.epa.gov/sites/production/files/2015-09/documents/oswer-vapor-intrusion-technical-guide-final.pdf> [used]
- U.S. Environmental Protection Agency (2017). Documentation for EPA's Implementation of the Johnson and Ettinger Model to Evaluate Site Specific Vapor Intrusion into Buildings, Version 6.0. U.S. Environmental Protection Agency, Office of Superfund Remediation and Technology Innovation. Revised September 2017. <https://semspub.epa.gov/work/HQ/100000489.pdf> [used]
- U.S. Environmental Protection Agency (2024). Regional Screening Levels (RSLs), Generic Tables, November 2024. U.S. Environmental Protection Agency. SEMS documents 405270 (summary table), 405302 (chemical-specific parameters) and 405290 (resident tap water), TR = 1E-06, THQ = 1. <https://www.epa.gov/risk/regional-screening-levels-rsls-generic-tables> [data]
- U.S. Environmental Protection Agency (2024). Regional Screening Levels (RSLs), User's Guide. U.S. Environmental Protection Agency. Web page accompanying the November 2024 tables. <https://www.epa.gov/risk/regional-screening-levels-rsls-users-guide> [fixture]
- U.S. Environmental Protection Agency (2026). CompTox Chemicals Dashboard. [data]
- U.S. Environmental Protection Agency (2026). Integrated Risk Information System (IRIS). [data]
- U.S. Environmental Protection Agency (2026). National Recommended Water Quality Criteria (NRWQC). [planned]
- U.S. Environmental Protection Agency (2026). Vapor Intrusion Screening Level User's Guide. U.S. Environmental Protection Agency. <https://www.epa.gov/vaporintrusion/visl-users-guide> [used]
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
- Yao, Y., Shen, R., Pennell, K.G., Suuberg, E.M. (2011). Comparison of the Johnson-Ettinger vapor intrusion screening model predictions with full three-dimensional model results. Environmental Science and Technology. 45(6):2227-2235. <https://doi.org/10.1021/es102602s> [planned]
- Yao, Y., Shen, R., Pennell, K.G., Suuberg, E.M. (2013). A review of vapor intrusion models. Environmental Science and Technology. 47(6):2457-2470. <https://doi.org/10.1021/es302714g> [planned]
- Yeh, G.T. (1981). AT123D: Analytical transient one-, two-, and three-dimensional simulation of waste transport in the aquifer system. Oak Ridge National Laboratory. ORNL-5602. <https://doi.org/10.2172/6531241> [used]
