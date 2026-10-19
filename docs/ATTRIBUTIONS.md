# Attributions

Generated 2026-10-18 from `packages/engine/src/references/references.json` and the method registry. Do not edit by hand.

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
  - Air and surface-water concentrations are user entered or fed from the vapor and surface-water screens; shower and outdoor particulate air are user entered or fed from the shower, sprinkler and particulate methods.
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
  - Air and surface-water concentrations are user entered or fed from the vapor and surface-water screens; shower and outdoor particulate air are user entered or fed from the shower, sprinkler and particulate methods.
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

### cleanup

#### RAGS Part B preliminary remediation goals with 1989 exposure coefficients

- Kind: Legacy (RISC5 default)
- Method id: `cleanup.rags-b-1991`
- Summary: Back-calculates a concentration in soil, groundwater, air or surface water from a target risk and hazard quotient, using the RAGS Part A (1989) intake coefficients with the 1991 default factors, summed over pathways within a receptor, in closed form for the linear direct pathways.
- Assumptions:
  - A cleanup level is the source concentration whose forward risk or well concentration equals the target; direct pathways are linear in the exposure point concentration, so the level is the target divided by the summed coefficient.
  - Target risk and target hazard quotient are user inputs (defaults 1e-6 and 1); a risk target above 0.01 is warned because the dose-response is linear only at low dose.
  - Cancer and noncancer endpoints are solved separately and the lower level governs; hazard quotients are grouped by life stage or receptor and never added across groups.
  - Individual levels treat each chemical alone; cumulative and equal allocation scale the entered ratios or split the target equally across chemicals, and are refused for concentration targets.
  - A pathway or medium without toxicity or exposure data is reported as not quantified, never as an unlimited level.
  - Cancer risks of two receptors are added only when the additive option is switched on.
- RISC5 choice: RISC5 back-calculates a cleanup level for each medium from a target risk and hazard quotient with the legacy exposure equations, optionally additive over two receptors, and for modeled pathways solves for the source concentration whose forward result meets the target (here the registered modeled-chains method).
- Sources:
  - U.S. Environmental Protection Agency (1991). Risk Assessment Guidance for Superfund: Volume I, Human Health Evaluation Manual (Part B, Development of Risk-based Preliminary Remediation Goals), Interim. U.S. Environmental Protection Agency, Office of Emergency and Remedial Response. EPA/540/R-92/003, Publication 9285.7-01B, December 1991. <https://semspub.epa.gov/src/document/HQ/156739>
  - U.S. Environmental Protection Agency (1989). Risk Assessment Guidance for Superfund, Volume I: Human Health Evaluation Manual (Part A), Interim Final. U.S. Environmental Protection Agency, Office of Emergency and Remedial Response. EPA/540/1-89/002, December 1989. <https://www.epa.gov/system/files/documents/2024-10/rags_a_508.pdf>
  - U.S. Environmental Protection Agency (1991). Risk Assessment Guidance for Superfund, Volume I: Human Health Evaluation Manual, Supplemental Guidance: "Standard Default Exposure Factors", Interim Final. U.S. Environmental Protection Agency, Office of Emergency and Remedial Response. OSWER Directive 9285.6-03, PB91-921314, March 25, 1991. <https://semspub.epa.gov/src/document/HQ/190591>
  - U.S. Environmental Protection Agency (1992). Dermal Exposure Assessment: Principles and Applications, Interim Report. U.S. Environmental Protection Agency, Office of Health and Environmental Assessment. EPA/600/8-91/011B, January 1992. <https://rais.ornl.gov/documents/DERM_EXP.PDF>

#### RAGS Parts E and F back-calculation with 2014 default factors

- Kind: Modern
- Method id: `cleanup.rags-e-f-2014`
- Summary: Back-calculates cleanup levels with age-segmented intakes, the Part E dermal event model, Part F concentration-based inhalation and the age-dependent adjustment factors, with individual, cumulative and equal allocation, in closed form for the linear direct pathways.
- Assumptions:
  - A cleanup level is the source concentration whose forward risk or well concentration equals the target; direct pathways are linear in the exposure point concentration, so the level is the target divided by the summed coefficient.
  - Target risk and target hazard quotient are user inputs (defaults 1e-6 and 1); a risk target above 0.01 is warned because the dose-response is linear only at low dose.
  - Cancer and noncancer endpoints are solved separately and the lower level governs; hazard quotients are grouped by life stage or receptor and never added across groups.
  - Individual levels treat each chemical alone; cumulative and equal allocation scale the entered ratios or split the target equally across chemicals, and are refused for concentration targets.
  - A pathway or medium without toxicity or exposure data is reported as not quantified, never as an unlimited level.
  - Mutagens use the four age segments with the adjustment factors 10, 3, 3 and 1; life-stage hazard quotients are never added.
- Sources:
  - U.S. Environmental Protection Agency (1991). Risk Assessment Guidance for Superfund: Volume I, Human Health Evaluation Manual (Part B, Development of Risk-based Preliminary Remediation Goals), Interim. U.S. Environmental Protection Agency, Office of Emergency and Remedial Response. EPA/540/R-92/003, Publication 9285.7-01B, December 1991. <https://semspub.epa.gov/src/document/HQ/156739>
  - U.S. Environmental Protection Agency (2004). Risk Assessment Guidance for Superfund, Volume I: Human Health Evaluation Manual (Part E, Supplemental Guidance for Dermal Risk Assessment), Final. U.S. Environmental Protection Agency, Office of Superfund Remediation and Technology Innovation. EPA/540/R/99/005, OSWER 9285.7-02EP, PB99-963312, July 2004. <https://www.epa.gov/sites/default/files/2015-09/documents/part_e_final_revision_10-03-07.pdf>
  - U.S. Environmental Protection Agency (2009). Risk Assessment Guidance for Superfund, Volume I: Human Health Evaluation Manual (Part F, Supplemental Guidance for Inhalation Risk Assessment), Final. U.S. Environmental Protection Agency, Office of Superfund Remediation and Technology Innovation. EPA-540-R-070-002, OSWER 9285.7-82, January 2009. <https://www.epa.gov/sites/default/files/2015-09/documents/partf_200901_final.pdf>
  - U.S. Environmental Protection Agency (2014). Human Health Evaluation Manual, Supplemental Guidance: Update of Standard Default Exposure Factors. U.S. Environmental Protection Agency, Office of Solid Waste and Emergency Response. OSWER Directive 9200.1-120, February 6, 2014. <https://www.epa.gov/sites/default/files/2015-11/documents/oswer_directive_9200.1-120_exposurefactors_corrected2.pdf>
  - U.S. Environmental Protection Agency (2005). Supplemental Guidance for Assessing Susceptibility from Early-Life Exposure to Carcinogens. U.S. Environmental Protection Agency, Risk Assessment Forum. EPA/630/R-03/003F, March 2005. <https://www.epa.gov/sites/default/files/2013-09/documents/childrens_supplement_final.pdf>

#### Soil screening guidance soil-to-groundwater leaching level

- Kind: Modern
- Method id: `cleanup.ssg-leaching`
- Summary: Soil concentration whose equilibrium leachate, divided by a dilution attenuation factor, meets a groundwater target, using the three-phase partition equation, the generic or site-specific dilution attenuation factor with a capped mixing zone, and the mass-limit alternative for a finite source.
- Assumptions:
  - Equilibrium partitioning among soil, pore water and soil gas, with no biodegradation, no colloidal transport and no leachate attenuation in the vadose zone.
  - The dilution attenuation factor is 20 (half-acre source), 1 (no dilution) or computed from the aquifer hydraulics with the mixing depth capped at the aquifer thickness.
  - The mass-limit level applies only when a source depth is given, and the higher of the partition and mass-limit levels is reported.
  - Levels above the soil saturation concentration or a leachate above solubility are warned, not corrected.
- RISC5 choice: RISC5 evaluates leaching to groundwater with its own vadose-zone and aquifer models rather than the generic dilution attenuation factor; this method reproduces the screening-guidance equations for comparison.
- Sources:
  - U.S. Environmental Protection Agency (1996). Soil Screening Guidance: Technical Background Document. U.S. Environmental Protection Agency. EPA/540/R-95/128 (Publication 9355.4-17A), Second Edition, May 1996. <https://semspub.epa.gov/work/HQ/207.pdf>
  - U.S. Environmental Protection Agency (1996). Soil Screening Guidance: User's Guide. U.S. Environmental Protection Agency, Office of Emergency and Remedial Response. EPA/540/R-96/018, Publication 9355.4-23, Second Edition, July 1996. <https://semspub.epa.gov/work/HQ/211.pdf>
  - U.S. Environmental Protection Agency (2002). Supplemental Guidance for Developing Soil Screening Levels for Superfund Sites. U.S. Environmental Protection Agency. OSWER 9355.4-24, December 2002. <https://semspub.epa.gov/work/HQ/175878.pdf>

#### Modeled source-to-well cleanup levels by root finding

- Kind: Modern
- Method id: `cleanup.modeled-chains`
- Summary: Solves for the source concentration (soil or dissolved) whose modeled receptor risk, hazard index or well concentration meets the target, through the registered vadose, groundwater and saturated-source chains and the exposure evaluator, using Brent root finding in the logarithm of the concentration, with a verified linear shortcut where the chain is linear.
- Assumptions:
  - The level is the source concentration whose forward result equals the target; the forward chain and evaluator are passed in and are the same ones the screen draws.
  - The solve is in the logarithm of the source concentration with Brent root finding after a bracket search capped at the solubility or saturation limit; a target that cannot be reached is reported as such, not extrapolated.
  - Cancer and noncancer endpoints are solved separately and the lower level governs; a concentration target replaces them and is refused for cumulative and equal allocation.
  - A well concentration target uses the largest moving average over the averaging window; a window longer than the breakthrough series is warned.
- Sources:
  - Brent, R.P. (1973). Algorithms for Minimization without Derivatives. Prentice-Hall, Englewood Cliffs, New Jersey. ISBN 0-13-022335-2. <https://maths-people.anu.edu.au/~brent/pub/pub011.html>

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

### shower

#### Stagnant stall shower volatilization with two-resistance droplet transfer

- Kind: Legacy (RISC5 default)
- Method id: `shower.fc-1986`
- Summary: Fraction volatilized from a falling droplet by two films in series (gas film scaled from water vapour, liquid film from carbon dioxide, by the square root of the molecular weight ratio), with all the mass sitting in a fully mixed, unventilated stall: C_a = f_v Q_w t_s C_w / V_s.
- Assumptions:
  - Two-resistance transfer across the droplet surface into clean air (no gas-phase back-pressure), a single fall time for every droplet.
  - The whole mass volatilized during the shower is in the stall from the start and stays there; the stall is fully mixed with no exchange with the bathroom.
  - A stall value above the equilibrium concentration H C_w follows from the stagnant assumption and is warned, not clipped.
  - Linear in the tap water concentration, so cleanup levels are the target over the coefficient.
  - little1992 is cited for the two-resistance film theory only. The stagnant, no-back-pressure stall is the approach that paper corrects, not a model it presents; the original source for the stagnant stall (foster1986) is a planned, unverified record and is not cited.
- RISC5 choice: RISC5 treats the shower as a stagnant stall fed by two-resistance droplet transfer with film reference coefficients of 3000 cm/h (gas, water vapour) and 20 cm/h (liquid, carbon dioxide) and the stagnant mass balance; the primary paper behind these values could not be verified, so they are inputs and the defaults are warned.
- Sources:
  - Little, J.C. (1992). Applying the two-resistance theory to contaminant volatilization in showers. Environmental Science & Technology. 26(7):1341-1349. <https://doi.org/10.1021/es00031a010>

#### Two-resistance stall with gas-phase back-pressure and ventilation

- Kind: Modern
- Method id: `shower.little-1992`
- Summary: Keeps the gas-phase driving force and the stall ventilation: dC/dt = alpha - beta C with alpha = Q_w f C_w / V_s and beta = (Q_w f / H + Q_g) / V_s, solved in closed form and averaged over the shower plus an optional stay after the water is off.
- Assumptions:
  - The mass balance is our statement of the two-resistance theory, checked by the limit identities (legacy stall at large H and no ventilation, equilibrium H C_w at long times); it is not a transcription of the paper.
  - The stall is fully mixed and the supply air is clean; the receptor is in the stall for the shower time plus the stay.
  - Linear in the tap water concentration.
- Sources:
  - Little, J.C. (1992). Applying the two-resistance theory to contaminant volatilization in showers. Environmental Science & Technology. 26(7):1341-1349. <https://doi.org/10.1021/es00031a010>

#### RSL whole-house water-to-air volatilization term

- Kind: Modern
- Method id: `shower.rsl-household`
- Summary: Whole-house air concentration as the tap water concentration times a fixed transfer factor K (L water per m^3 air), added to the tap water inhalation level for volatile chemicals only.
- Assumptions:
  - A chemical is volatile when its Henry constant exceeds 1E-5 atm m^3/mol or its vapor pressure exceeds 1 mm Hg; others return zero with a warning.
  - The transfer factor K is an entered value: it could not be verified against a primary page and is always warned.
  - Linear in the tap water concentration.
- Sources:
  - U.S. Environmental Protection Agency (2024). Regional Screening Levels (RSLs), User's Guide. U.S. Environmental Protection Agency. Web page accompanying the November 2024 tables. <https://www.epa.gov/risk/regional-screening-levels-rsls-users-guide>

### irrigation

#### Sprinkler volatilization into the outdoor box

- Kind: Legacy (RISC5 default)
- Method id: `irrigation.sprinkler-fc`
- Summary: The shared two-resistance droplet fraction with outdoor droplet parameters gives a mass rate E = f_v Q_spr C_w that enters the outdoor box as a mass-rate emission: C_a = E / (u delta W).
- Assumptions:
  - The droplet kernel is the one used for the shower, with outdoor droplet size, fall time (including ponding in the box) and flow supplied by the caller; none has a default.
  - The box is fully mixed and ventilated by the wind; the width defaults to 1 m (the RISC5 choice) and is warned, because for a real sprinkler the plume width matters.
  - Linear in the irrigation water concentration.
  - little1992 is cited for the two-resistance film theory only. The stagnant, no-back-pressure stall is the approach that paper corrects, not a model it presents; the original source for the stagnant stall (foster1986) is a planned, unverified record and is not cited.
- RISC5 choice: RISC5 feeds the outdoor box with the sprinkler droplet loss and fixes the box width at 1 m; the film reference coefficients are the unverified RISC5 values and are warned when defaulted.
- Sources:
  - Walden, T., Spence, L.R. (1997). Risk-based BTEX screening criteria for a groundwater irrigation scenario. Human and Ecological Risk Assessment: An International Journal. 3(4):699-722. <https://doi.org/10.1080/10807039709383722>
  - Little, J.C. (1992). Applying the two-resistance theory to contaminant volatilization in showers. Environmental Science & Technology. 26(7):1341-1349. <https://doi.org/10.1021/es00031a010>

#### Irrigation water exposure point concentrations

- Kind: Modern
- Method id: `irrigation.pathways`
- Summary: Irrigation water feeds incidental ingestion and dermal contact through the existing exposure kernels (the EPC is the water concentration), spray inhalation through the sprinkler box, and garden vegetables through the irrigation source handed to plant uptake.
- Assumptions:
  - The irrigation exposure factors (contact times, ingestion volumes, skin areas) are caller inputs; none is defaulted because the source factors were not read.
  - A source that is also the potable supply is warned, because the indoor pathways will dominate.
  - Linear in the irrigation water concentration.
- Sources:
  - Walden, T., Spence, L.R. (1997). Risk-based BTEX screening criteria for a groundwater irrigation scenario. Human and Ecological Risk Assessment: An International Journal. 3(4):699-722. <https://doi.org/10.1080/10807039709383722>

### particulate

#### Particulate flux into the outdoor box

- Kind: Legacy (RISC5 default)
- Method id: `particulate.box-emission`
- Summary: A PM10 mass flux, entered or from the wind-erosion expression J = 0.036 (1 - V) (U_m/U_t)^3 F(x), times the soil concentration is an area-flux emission of chemical into the outdoor box: C_a = J C_s L / (u delta).
- Assumptions:
  - The particles carry the bulk soil concentration of the chemical; soil is constant in time.
  - F(x) is an entered value (the preset 0.194 is the printed guidance default); the function of x is not computed.
  - The wind-erosion expression is verified as reproduced in the soil screening guidance; the original report was not read.
  - Linear in the soil concentration.
- RISC5 choice: RISC5 offers an entered PM10 emission flux (an ASTM RBCA default that could not be cited) or the wind-erosion flux, each feeding the outdoor box.
- Sources:
  - Cowherd, C.G., Muleski, G., Engelhart, P., Gillette, D. (1985). Rapid Assessment of Exposure to Particulate Emissions from Surface Contamination Sites. U.S. Environmental Protection Agency, Office of Health and Environmental Assessment. EPA/600/8-85/002.
  - U.S. Environmental Protection Agency (1996). Soil Screening Guidance: Technical Background Document. U.S. Environmental Protection Agency. EPA/540/R-95/128 (Publication 9355.4-17A), Second Edition, May 1996. <https://semspub.epa.gov/work/HQ/207.pdf>

#### Soil screening guidance particulate emission factor (1996)

- Kind: Modern
- Method id: `particulate.ssg-pef-1996`
- Summary: PEF = (Q/C) / J with the guidance default Q/C of 90.80 g/(m^2 s) per kg/m^3 (Minneapolis, half acre) and the wind-erosion flux; air concentration = soil concentration / PEF.
- Assumptions:
  - Q/C for particulates is a separate PM10 value from the volatilization Q/C used by the outdoor air method.
  - Defaults V 0.5, U_m 4.69 m/s, U_t 11.32 m/s and F(x) 0.194 are the printed guidance values; the generic PEF is 1.32E9 m^3/kg.
  - Linear in the soil concentration.
- Sources:
  - U.S. Environmental Protection Agency (1996). Soil Screening Guidance: Technical Background Document. U.S. Environmental Protection Agency. EPA/540/R-95/128 (Publication 9355.4-17A), Second Edition, May 1996. <https://semspub.epa.gov/work/HQ/207.pdf>
  - Environmental Quality Management, Inc. (1994). Revisions to VF and PEF Equations. Memorandum to J. Dinan, U.S. Environmental Protection Agency, Office of Emergency and Remedial Response. Memorandum 5099-3, 11 July 1994. <https://semspub.epa.gov/work/HQ/207.pdf>

#### Supplemental soil screening guidance particulate emission factor (2002)

- Kind: Modern
- Method id: `particulate.ssg-pef-2002`
- Summary: The same PEF with the 2002 default Q/C of 93.77 or the site-specific regression Q/C = A exp[(ln A_s - B)^2 / C] on source area (0.5 to 500 acres) with the constants of a climate zone station.
- Assumptions:
  - The regression constants are those of Exhibit D-2; the Minneapolis half-acre value reproduces the printed 93.77.
  - V, U_m, U_t and F(x) are the same as the 1996 guidance; the generic PEF is 1.36E9 m^3/kg.
  - Construction-phase emission factors are not included.
  - Linear in the soil concentration.
- Sources:
  - U.S. Environmental Protection Agency (2002). Supplemental Guidance for Developing Soil Screening Levels for Superfund Sites. U.S. Environmental Protection Agency. OSWER 9355.4-24, December 2002. <https://semspub.epa.gov/work/HQ/175878.pdf>

### montecarlo

#### Simple random sampling of exposure parameters

- Kind: Legacy (RISC5 default)
- Method id: `uncertainty.srs-exposure`
- Summary: Independent simple random draws of exposure parameters only (fate and transport inputs stay at their point values), 500 iterations by default, reporting the sorted sample with its minimum, 5th, 25th, 50th, 75th, 90th and 95th percentiles, maximum, mean and standard deviation.
- Assumptions:
  - Every sampled value is x = F^-1(u) for a uniform u from the sampling design; truncation maps u into the truncated range and never rejects a draw.
  - The sample matrix is built on one thread before any model run and rows are written back by index, so the result is bit-identical for the same seed, n, inputs and engine version whatever the chunking.
  - An iteration refused by the deterministic checks is recorded as failed, not dropped; summaries use the successful iterations, and more than 1 percent failed raises a warning.
  - Percentiles use linear interpolation between order statistics (Hyndman and Fan definition 7).
  - Only inputs in the exposure category are sampled, and they are sampled independently (no correlation).
  - Default 500 iterations, the count of the RISC v4.0 review comparison; the seed defaults to the literal model-flow and is shown and editable.
- RISC5 choice: RISC5 offers Monte Carlo for human receptor exposure parameters only, with fate and transport held at point values; the manual does not state the input distributions, the sampling scheme beyond random draws, or a seeding rule, so this method reproduces the scope and not any undocumented internals.
- Sources:
  - U.S. Environmental Protection Agency (1997). Guiding Principles for Monte Carlo Analysis. U.S. Environmental Protection Agency. EPA/630/R-97/001.
  - U.S. Environmental Protection Agency (2001). Risk Assessment Guidance for Superfund, Volume III, Part A, Process for Conducting Probabilistic Risk Assessment.
  - Blackman, D., Vigna, S. (2021). Scrambled linear pseudorandom number generators. ACM Transactions on Mathematical Software. 47(4):1-32. <https://doi.org/10.1145/3460772>
  - Wichura, M.J. (1988). Algorithm AS 241: the percentage points of the normal distribution. Applied Statistics. 37(3):477. <https://doi.org/10.2307/2347330>
  - Hyndman, R.J., Fan, Y. (1996). Sample quantiles in statistical packages. The American Statistician. 50(4):361-365. <https://doi.org/10.1080/00031305.1996.10473566>

#### Latin hypercube sampling with Iman-Conover rank correlation

- Kind: Modern
- Method id: `uncertainty.lhs-ic`
- Summary: Latin hypercube draws of exposure, transport, site and chemical inputs through each inverse CDF, reordered with the Iman and Conover restricted pairing to a target rank correlation, 1000 iterations by default; reports the summary, the failed-iteration count and the target and achieved Spearman matrices.
- Assumptions:
  - Every sampled value is x = F^-1(u) for a uniform u from the sampling design; truncation maps u into the truncated range and never rejects a draw.
  - The sample matrix is built on one thread before any model run and rows are written back by index, so the result is bit-identical for the same seed, n, inputs and engine version whatever the chunking.
  - An iteration refused by the deterministic checks is recorded as failed, not dropped; summaries use the successful iterations, and more than 1 percent failed raises a warning.
  - Percentiles use linear interpolation between order statistics (Hyndman and Fan definition 7).
  - Each input range is split into n equal strata with one draw per stratum, permuted independently per input; rank correlation only permutes sampled values, so every marginal and the stratification are preserved exactly.
  - The target correlation must be symmetric with a unit diagonal and positive definite; n must exceed the number of correlated inputs and n below 5 times that number is warned.
  - Inputs not named in the correlation stay independent.
  - Default 1000 iterations; the seed defaults to the literal model-flow and is shown and editable.
- Sources:
  - McKay, M.D., Beckman, R.J., Conover, W.J. (1979). A comparison of three methods for selecting values of input variables in the analysis of output from a computer code. Technometrics. 21(2):239-245. <https://doi.org/10.1080/00401706.1979.10489755>
  - Iman, R.L., Conover, W.J. (1982). A distribution-free approach to inducing rank correlation among input variables. Communications in Statistics, Simulation and Computation. 11(3):311-334. <https://doi.org/10.1080/03610918208812265>
  - U.S. Environmental Protection Agency (1997). Guiding Principles for Monte Carlo Analysis. U.S. Environmental Protection Agency. EPA/630/R-97/001.
  - U.S. Environmental Protection Agency (2001). Risk Assessment Guidance for Superfund, Volume III, Part A, Process for Conducting Probabilistic Risk Assessment.
  - Blackman, D., Vigna, S. (2021). Scrambled linear pseudorandom number generators. ACM Transactions on Mathematical Software. 47(4):1-32. <https://doi.org/10.1145/3460772>
  - Wichura, M.J. (1988). Algorithm AS 241: the percentage points of the normal distribution. Applied Statistics. 37(3):477. <https://doi.org/10.2307/2347330>
  - Hyndman, R.J., Fan, Y. (1996). Sample quantiles in statistical packages. The American Statistician. 50(4):361-365. <https://doi.org/10.1080/00031305.1996.10473566>

#### Sobol variance-based sensitivity (Saltelli design, Jansen total effect)

- Kind: Modern
- Method id: `uncertainty.sobol-saltelli`
- Summary: First order and total Sobol indices from two independent Latin hypercube matrices A and B and the k hybrid matrices, N (k + 2) model runs (N = 512 by default), on log10 of the output by default, with 500-resample bootstrap 95 percent intervals and a convergence flag.
- Assumptions:
  - Inputs are independent; a correlation matrix is removed for this analysis with a warning.
  - The first order index uses the Saltelli 2010 estimator mean(f(B)(f(A_B) - f(A))) / V and the total index the Jansen estimator mean((f(A) - f(A_B))^2) / (2V), with V the variance of the pooled 2N values of f(A) and f(B).
  - A and B are independent Latin hypercube designs from the purpose-labelled seed streams sobol-A and sobol-B; the low-discrepancy Sobol sequence is not used.
  - Indices describe log10 of the output unless the raw scale is requested; an output at or below zero falls back to the raw scale with a warning.
  - Intervals are the 2.5th and 97.5th percentiles of 500 bootstrap resamples of the N rows (stream bootstrap); a half-width above 0.05 is flagged not converged. A negative first order estimate inside its interval of zero is shown as zero.
  - A row with a refused or non-finite run in any design is dropped from all designs together and counted.
- Sources:
  - Saltelli, A., Annoni, P., Azzini, I., Campolongo, F., Ratto, M., Tarantola, S. (2010). Variance based sensitivity analysis of model output. Design and estimator for the total sensitivity index. Computer Physics Communications. 181(2):259-270. <https://doi.org/10.1016/j.cpc.2009.09.018>
  - Jansen, M.J.W. (1999). Analysis of variance designs for model output. Computer Physics Communications. 117(1-2):35-43. <https://doi.org/10.1016/S0010-4655(98)00154-4>
  - Sobol, I.M. (2001). Global sensitivity indices for nonlinear mathematical models and their Monte Carlo estimates. Mathematics and Computers in Simulation. 55(1-3):271-280. <https://doi.org/10.1016/S0378-4754(00)00270-6>
  - McKay, M.D., Beckman, R.J., Conover, W.J. (1979). A comparison of three methods for selecting values of input variables in the analysis of output from a computer code. Technometrics. 21(2):239-245. <https://doi.org/10.1080/00401706.1979.10489755>
  - Blackman, D., Vigna, S. (2021). Scrambled linear pseudorandom number generators. ACM Transactions on Mathematical Software. 47(4):1-32. <https://doi.org/10.1145/3460772>
  - Wichura, M.J. (1988). Algorithm AS 241: the percentage points of the normal distribution. Applied Statistics. 37(3):477. <https://doi.org/10.2307/2347330>
  - Hyndman, R.J., Fan, Y. (1996). Sample quantiles in statistical packages. The American Statistician. 50(4):361-365. <https://doi.org/10.1080/00031305.1996.10473566>

#### Probabilistic cleanup levels by per-iteration root finding

- Kind: Modern
- Method id: `uncertainty.cleanup-probabilistic`
- Summary: Samples the uncertain inputs (Latin hypercube, optional Iman-Conover rank correlation), solves the source concentration meeting the target for each sampled parameter set with the cleanup root finder, and reports the level that protects 95 percent of the sampled population (the 5th percentile of the per-iteration levels), with 50 and 90 percent also shown and unreachable iterations censored at the search cap.
- Assumptions:
  - The receptor metric is nondecreasing in the source concentration for every sampled parameter set, so a source concentration protects exactly the iterations whose own level is at or above it.
  - The level protecting a fraction p of the sampled population is the (1 - p) quantile of the per-iteration levels (Hyndman and Fan definition 7); p is 0.95 by default and 0.5 and 0.9 are also shown.
  - An iteration whose target is not reachable below the cap is kept as censored at the cap and counted; a quantile that lands on a censored iteration is reported as not reachable below the cap.
  - An iteration refused by the deterministic checks is recorded as failed, not dropped; quantiles use the iterations that ran, and more than 1 percent failed raises a warning.
  - The sample is built on one thread before any solve from purpose-labelled seeded streams, so the result is bit-identical for the same seed, n and inputs whatever the chunking; the cost is counted in forward runs.
- Sources:
  - Brent, R.P. (1973). Algorithms for Minimization without Derivatives. Prentice-Hall, Englewood Cliffs, New Jersey. ISBN 0-13-022335-2. <https://maths-people.anu.edu.au/~brent/pub/pub011.html>
  - McKay, M.D., Beckman, R.J., Conover, W.J. (1979). A comparison of three methods for selecting values of input variables in the analysis of output from a computer code. Technometrics. 21(2):239-245. <https://doi.org/10.1080/00401706.1979.10489755>
  - Iman, R.L., Conover, W.J. (1982). A distribution-free approach to inducing rank correlation among input variables. Communications in Statistics, Simulation and Computation. 11(3):311-334. <https://doi.org/10.1080/03610918208812265>
  - U.S. Environmental Protection Agency (1997). Guiding Principles for Monte Carlo Analysis. U.S. Environmental Protection Agency. EPA/630/R-97/001.
  - U.S. Environmental Protection Agency (2001). Risk Assessment Guidance for Superfund, Volume III, Part A, Process for Conducting Probabilistic Risk Assessment.
  - Blackman, D., Vigna, S. (2021). Scrambled linear pseudorandom number generators. ACM Transactions on Mathematical Software. 47(4):1-32. <https://doi.org/10.1145/3460772>
  - Wichura, M.J. (1988). Algorithm AS 241: the percentage points of the normal distribution. Applied Statistics. 37(3):477. <https://doi.org/10.2307/2347330>
  - Hyndman, R.J., Fan, Y. (1996). Sample quantiles in statistical packages. The American Statistician. 50(4):361-365. <https://doi.org/10.1080/00031305.1996.10473566>

### plantUptake

#### Briggs root factor with a one-compartment leaf model

- Kind: Legacy (RISC5 default)
- Method id: `plantUptake.trapp-matthies-1995`
- Summary: Soil pore water from the shared partitioning step; root produce as the Briggs root concentration factor times pore water; above-ground produce from a one-compartment leaf mass balance with a transpiration stream term and a gas exchange term, at steady state or as the exact exponential at harvest.
- Assumptions:
  - Neutral organic chemicals only; ionizable chemicals and inorganics are warned, and an inorganic needs a user bioconcentration factor.
  - The root factor constants are those the HHRAP appendix prints for the Briggs correlation; the transpiration stream concentration factor and the leaf-air partition coefficient are user inputs because their published regressions were not read.
  - The leaf and stem form one well-mixed compartment with constant inputs over the growing period and zero initial concentration.
  - Concentrations are fresh weight; the root factor is in L/kg of root fresh weight per water concentration.
- RISC5 choice: RISC5 offers Briggs-type root and transpiration factors with a one-compartment leaf model for vegetable uptake of organics.
- Sources:
  - Briggs, G.G., Bromilow, R.H., Evans, A.A. (1982). Relationships between lipophilicity and root uptake and translocation of non-ionised chemicals by barley. Pesticide Science 13(5), 495-504. doi:10.1002/ps.2780130506.
  - Trapp, S., Matthies, M. (1995). Generic one-compartment model for uptake of organic chemicals by foliar vegetation. Environmental Science & Technology 29(9), 2333-2338. doi:10.1021/es00009a027.
  - U.S. Environmental Protection Agency (2005). Human Health Risk Assessment Protocol for Hazardous Waste Combustion Facilities.

#### EPA HHRAP 2005 produce equations (fallback for the modern plant model)

- Kind: Modern
- Method id: `plantUptake.hhrap-2005`
- Summary: Root uptake with the Travis and Arms plant-soil factor for above-ground produce, the Briggs root factor over Kd with the empirical skin correction for root produce, and Bacci-type air-to-plant vapor transfer for exposed produce, all on a dry weight basis with the published log Kow caps.
- Assumptions:
  - Fallback for the Trapp modern model, whose publication could not be verified (DECISIONS, 2026-10-18); the switch is recorded, not silent.
  - Neutral organic chemicals only; an inorganic needs a user plant-soil factor.
  - Particle deposition is not modelled; only root uptake and vapor-phase air-to-plant transfer.
  - Concentrations are dry weight, as HHRAP states them; the root factor is converted from fresh weight with the 87 percent moisture content HHRAP uses.
  - The empirical correction factor is 0.01 above log Kow 4 and 1.0 otherwise.
- Sources:
  - U.S. Environmental Protection Agency (2005). Human Health Risk Assessment Protocol for Hazardous Waste Combustion Facilities.
  - Briggs, G.G., Bromilow, R.H., Evans, A.A. (1982). Relationships between lipophilicity and root uptake and translocation of non-ionised chemicals by barley. Pesticide Science 13(5), 495-504. doi:10.1002/ps.2780130506.

### eco

#### User-entered benchmark hazard quotients with a simple food web

- Kind: Legacy (RISC5 default)
- Method id: `eco.benchmark-hq`
- Summary: Hazard quotient of the soil concentration over a benchmark the user enters with a citation, and a wildlife dose from a simple food web with user-entered bioaccumulation factors compared with a toxicity reference value. No benchmark table ships with the method.
- Assumptions:
  - Benchmarks and bioaccumulation factors are user entered; the expected citation for wildlife benchmarks is the ORNL toxicological benchmark report.
  - Dose is the food ingestion rate times the area use factor times the diet-weighted food concentrations plus the incidental soil fraction.
  - Hazard quotients only; no ecological cleanup level is offered.
- RISC5 choice: RISC5 offers an ecological screen against user-supplied benchmarks with a simple food web.
- Sources:
  - Sample, B.E., Opresko, D.M., Suter, G.W., II (1996). Toxicological benchmarks for wildlife: 1996 revision. Oak Ridge National Laboratory, Risk Assessment Program, for the U.S. Department of Energy. ES/ER/TM-86/R3, June 1996; doi:10.2172/258027. <https://www.osti.gov/biblio/258027>

#### EPA Eco-SSL hazard quotients and wildlife food web

- Kind: Modern
- Method id: `eco.ecossl-2005`
- Summary: Hazard quotients of the soil concentration over the EPA ecological soil screening levels for plants, soil invertebrates and the avian and mammalian wildlife guilds, with the guidance wildlife dose model (soil-to-biota uptake ratio, log-linear and linear models) available to back-calculate or check a wildlife level.
- Assumptions:
  - Eco-SSLs are screening values, not cleanup levels; the guidance states they are inappropriate as cleanup standards, so only hazard quotients are reported and ECO_SCREENING_ONLY is always shown.
  - A group without a numeric Eco-SSL (not available, not enough data, or a procedure) gives no hazard quotient and an ECO_NO_SSL warning.
  - The wildlife dose uses the per-chemical derivation inputs of the Eco-SSL documents; back-calculation reproduces the printed values to the two significant figures they carry (5 percent).
- Sources:
  - U.S. Environmental Protection Agency (2003). Ecological Soil Screening Levels (Eco-SSLs). <https://www.epa.gov/chemical-research/interim-ecological-soil-screening-level-documents>
  - U.S. Environmental Protection Agency (2005). Guidance for Developing Ecological Soil Screening Levels. U.S. Environmental Protection Agency, Office of Solid Waste and Emergency Response. OSWER Directive 9285.7-55, November 2003, revised February 2005. <https://www.epa.gov/sites/default/files/2015-09/documents/ecossl_guidance_chapters.pdf>

### tph

#### TPH fraction cleanup level with the TPHCWG aliphatic and aromatic fraction set

- Kind: Legacy (RISC5 default)
- Method id: `tph.tphcwg`
- Summary: Treats total petroleum hydrocarbon as a set of TPHCWG aliphatic and aromatic equivalent carbon number fractions, each mapped to an RSL surrogate record; the total level meeting a target hazard index is the target over the sum of fraction mass fraction over fraction level, with each fraction checked against its own soil saturation limit.
- Assumptions:
  - The fraction set maps onto the five RSL TPH surrogate records; no toxicity values are entered, and a fraction without a surrogate is reported and excluded.
  - Per-fraction levels are the levels for a hazard quotient of one from the cleanup process; fraction hazard quotients add because the RSL TPH records carry noncancer toxicity only.
  - The fraction mass fractions must sum to one; each fraction is checked against its own saturation limit at its share of the total.
- RISC5 choice: RISC5 offers TPH fraction sets for forward risk and a total TPH level.
- Sources:
  - Total Petroleum Hydrocarbon Criteria Working Group (1997). Total Petroleum Hydrocarbon Criteria Working Group Series, Volumes 1 to 5. Amherst Scientific Publishers, Amherst, Massachusetts.

#### TPH fraction cleanup level with the MADEP carbon range fraction set

- Kind: Modern
- Method id: `tph.madep`
- Summary: The same total level and saturation check as the TPHCWG method, with the fractions taken from the MADEP volatile and extractable petroleum hydrocarbon carbon ranges, each mapped to an RSL surrogate record.
- Assumptions:
  - The fraction set maps onto the five RSL TPH surrogate records; no toxicity values are entered, and a fraction without a surrogate is reported and excluded.
  - Per-fraction levels are the levels for a hazard quotient of one from the cleanup process; fraction hazard quotients add because the RSL TPH records carry noncancer toxicity only.
  - The fraction mass fractions must sum to one; each fraction is checked against its own saturation limit at its share of the total.
- Sources:
  - Massachusetts Department of Environmental Protection (2002). Characterizing Risks Posed by Petroleum Contaminated Sites: Implementation of the MADEP VPH/EPH Approach. Massachusetts Department of Environmental Protection, Bureau of Waste Site Cleanup. Policy #WSC-02-411, October 31, 2002.

## Planned methods

Sources for methods on the roadmap that are not implemented yet. Nothing here affects a result today.

- Abreu, L.D.V., Ettinger, R., McAlary, T. (2009). Simulated soil vapor intrusion attenuation factors including biodegradation for petroleum hydrocarbons. Ground Water Monitoring and Remediation. 29(1):105-117. <https://doi.org/10.1111/j.1745-6592.2008.01219.x>
- Abreu, L.D.V., Johnson, P.C. (2005). Effect of vapor source-building separation and building construction on soil vapor intrusion as studied with a three-dimensional numerical model. Environmental Science and Technology. 39(12):4550-4561. <https://doi.org/10.1021/es049781k>
- Abreu, L.D.V., Johnson, P.C. (2006). Simulating the effect of aerobic biodegradation on soil vapor intrusion into buildings: influence of degradation rate, source concentration, and depth. Environmental Science and Technology. 40(7):2304-2315. <https://doi.org/10.1021/es051335p>
- American Petroleum Institute (2010). BioVapor.
- ASTM International (1995). ASTM E1739-95 Standard guide for risk-based corrective action applied at petroleum release sites. E1739-95.
- Aziz, C.E., et al. (2000). BIOCHLOR.
- Buchman, M.F. (2008). Screening Quick Reference Tables (SQuiRTs). National Oceanic and Atmospheric Administration, Office of Response and Restoration. NOAA OR&R Report 08-1. <https://repository.library.noaa.gov/view/noaa/9327>
- Celia, M.A., Bouloutas, E.T., Zarba, R.L. (1990). A general mass-conservative numerical solution for the unsaturated flow equation. Water Resources Research. 26(7):1483-1496. <https://doi.org/10.1029/WR026i007p01483>
- Cline, P.V., Delfino, J.J., Rao, P.S.C. (1991). Partitioning of aromatic constituents into water from gasoline and other complex solvent mixtures. Environmental Science & Technology. 25(5):914-920. <https://doi.org/10.1021/es00017a013>
- Falta, R.W. (2026). REMChlor. U.S. Environmental Protection Agency.
- Foster, S.A., Chrostowski, P.C. (1986). [Inhalation exposures to volatile organic contaminants in the shower].
- Gelhar, L.W., Welty, C., Rehfeldt, K.R. (1992). [A critical review of data on field-scale dispersion in aquifers]. Water Resources Research. 28:1955-1974.
- Ishigami, T., Homma, T. (1990). An importance quantification technique in uncertainty analysis for computer models. Proceedings, First International Symposium on Uncertainty Modeling and Analysis, IEEE. pp. 398-403. <https://doi.org/10.1109/ISUMA.1990.151285>
- Long, E.R., MacDonald, D.D., Smith, S.L., Calder, F.D. (1995). Incidence of adverse biological effects within ranges of chemical concentrations in marine and estuarine sediments. Environmental Management. 19(1):81-97. <https://doi.org/10.1007/BF02472006>
- MacDonald, D.D., Ingersoll, C.G., Berger, T.A. (2000). Development and evaluation of consensus-based sediment quality guidelines for freshwater ecosystems. Archives of Environmental Contamination and Toxicology. 39(1):20-31. <https://doi.org/10.1007/s002440010075>
- Morris, M.D. (1991). Factorial sampling plans for preliminary computational experiments. Technometrics. 33(2):161-174. <https://doi.org/10.1080/00401706.1991.10484804>
- Roseberry, A.M., Burmaster, D.E. (1992). Lognormal distributions for water intake by children and adults. Risk Analysis. 12(1):99-104. <https://doi.org/10.1111/j.1539-6924.1992.tb01312.x>
- Sobol, I.M. (1993). [Sensitivity estimates for nonlinear mathematical models].
- Srinivasan, V., Clement, T.P. (2008). [Analytical solutions for sequentially coupled one-dimensional reactive transport problems, part I]. Advances in Water Resources. 31:203-218.
- Srinivasan, V., Clement, T.P. (2008). [Analytical solutions for sequentially coupled one-dimensional reactive transport problems, part II]. Advances in Water Resources. 31:219-232.
- Stephan, C.E., Mount, D.I., Hansen, D.J., Gentile, J.H., Chapman, G.A., Brungs, W.A. (1985). Guidelines for Deriving Numerical National Water Quality Criteria for the Protection of Aquatic Organisms and Their Uses. U.S. Environmental Protection Agency, Office of Research and Development. PB85-227049. <https://www.epa.gov/sites/production/files/2016-02/documents/guidelines-water-quality-criteria.pdf>
- Trapp, S. (2015). [Plant uptake and transport models for neutral and ionic chemicals].
- Weaver, J. (2017). PVIScreen. U.S. Environmental Protection Agency.
- Yao, Y., Shen, R., Pennell, K.G., Suuberg, E.M. (2011). Comparison of the Johnson-Ettinger vapor intrusion screening model predictions with full three-dimensional model results. Environmental Science and Technology. 45(6):2227-2235. <https://doi.org/10.1021/es102602s>
- Yao, Y., Shen, R., Pennell, K.G., Suuberg, E.M. (2013). A review of vapor intrusion models. Environmental Science and Technology. 47(6):2457-2470. <https://doi.org/10.1021/es302714g>

## Data sources

Public datasets that the chemical and toxicity database is built from.

- U.S. Environmental Protection Agency (2003). Human Health Toxicity Values in Superfund Risk Assessments. U.S. Environmental Protection Agency, Office of Superfund Remediation and Technology Innovation. OSWER Directive 9285.7-53, December 5, 2003. <https://semspub.epa.gov/work/HQ/136.pdf>
- U.S. Environmental Protection Agency (2024). Regional Screening Levels (RSLs), Generic Tables, November 2024. U.S. Environmental Protection Agency. SEMS documents 405270 (summary table), 405302 (chemical-specific parameters) and 405290 (resident tap water), TR = 1E-06, THQ = 1. <https://www.epa.gov/risk/regional-screening-levels-rsls-generic-tables>
- U.S. Environmental Protection Agency (2025). National Recommended Water Quality Criteria - Human Health Criteria Table. U.S. Environmental Protection Agency. <https://www.epa.gov/wqc/national-recommended-water-quality-criteria-human-health-criteria-table>
- U.S. Environmental Protection Agency (2026). CompTox Chemicals Dashboard.
- U.S. Environmental Protection Agency (2026). Integrated Risk Information System (IRIS).
- U.S. Environmental Protection Agency (2026). National Primary Drinking Water Regulations. U.S. Environmental Protection Agency. Codified at 40 CFR Part 141. <https://www.epa.gov/ground-water-and-drinking-water/national-primary-drinking-water-regulations>
- U.S. Environmental Protection Agency (2026). National Recommended Water Quality Criteria - Aquatic Life Criteria Table. U.S. Environmental Protection Agency. <https://www.epa.gov/wqc/national-recommended-water-quality-criteria-aquatic-life-criteria-table>
- U.S. Environmental Protection Agency, Region 4 (2018). Region 4 Ecological Risk Assessment Supplemental Guidance, March 2018 Update. U.S. Environmental Protection Agency, Region 4, Superfund Division, Scientific Support Section. <https://www.epa.gov/sites/default/files/2018-03/documents/era_regional_supplemental_guidance_report-march-2018_update.pdf>

Editions of committed web pages (the pages are not numbered editions, so each is identified by its own last-updated date):

- EPA National Recommended Water Quality Criteria, Aquatic Life Criteria Table (page dated 2026-06-09; retrieved 2026-10-17). U.S. government work, public domain in the United States; the page states no restriction.
- EPA National Recommended Water Quality Criteria, Human Health Criteria Table (page dated 2025-12-18; retrieved 2026-10-17). U.S. government work, public domain in the United States; the page states no restriction.
- EPA Region 4 Ecological Risk Assessment Supplemental Guidance, sediment Tables 2a, 2b and 2c (page dated 2018-03-19; retrieved 2026-10-17). U.S. government work, public domain in the United States.
- EPA Ecological Soil Screening Levels, 21 interim final per-chemical documents (Table 2.1 and wildlife derivation tables, transcribed) (page dated 2026-04-21; retrieved 2026-10-18). U.S. government work, public domain in the United States; the documents state no restriction.

## Validation sources

Reviews, codes and packages used to produce test fixtures. They are checks on this software, not parts of it.

- Arcadis Geraghty & Miller (2001). Review of Risk Integrated Software for Cleanups (RISC) v4.0.
- Spence, L.R., Walden, T. (2001). RISC4 User's Manual. BP Oil International. Version 4.0, October 2001. <https://www.isprambiente.gov.it/contentfiles/00002500/2516-c2179-risc4-manual.pdf>
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
- Blackman, D., Vigna, S. (2021). Scrambled linear pseudorandom number generators. ACM Transactions on Mathematical Software. 47(4):1-32. <https://doi.org/10.1145/3460772> [used]
- Brent, R.P. (1973). Algorithms for Minimization without Derivatives. Prentice-Hall, Englewood Cliffs, New Jersey. ISBN 0-13-022335-2. <https://maths-people.anu.edu.au/~brent/pub/pub011.html> [used]
- Briggs, G.G., Bromilow, R.H., Evans, A.A. (1982). Relationships between lipophilicity and root uptake and translocation of non-ionised chemicals by barley. Pesticide Science 13(5), 495-504. doi:10.1002/ps.2780130506. [used]
- Brooks, R.H., Corey, A.T. (1964). Hydraulic properties of porous media. Colorado State University, Fort Collins, Hydrology Papers. No. 3 (March 1964). <https://mountainscholar.org/bitstream/handle/10217/61288/HydrologyPapers_n3.pdf> [used]
- Buchman, M.F. (2008). Screening Quick Reference Tables (SQuiRTs). National Oceanic and Atmospheric Administration, Office of Response and Restoration. NOAA OR&R Report 08-1. <https://repository.library.noaa.gov/view/noaa/9327> [planned]
- Celia, M.A., Bouloutas, E.T., Zarba, R.L. (1990). A general mass-conservative numerical solution for the unsaturated flow equation. Water Resources Research. 26(7):1483-1496. <https://doi.org/10.1029/WR026i007p01483> [planned]
- Chapra, S.C. (1997). Surface Water-Quality Modeling. McGraw-Hill, New York. ISBN 0-07-011364-5. [used]
- Cline, P.V., Delfino, J.J., Rao, P.S.C. (1991). Partitioning of aromatic constituents into water from gasoline and other complex solvent mixtures. Environmental Science & Technology. 25(5):914-920. <https://doi.org/10.1021/es00017a013> [planned]
- Cowherd, C.G., Muleski, G., Engelhart, P., Gillette, D. (1985). Rapid Assessment of Exposure to Particulate Emissions from Surface Contamination Sites. U.S. Environmental Protection Agency, Office of Health and Environmental Assessment. EPA/600/8-85/002. [used]
- DeVaull, G.E. (2007). Indoor Vapor Intrusion with Oxygen-Limited Biodegradation for a Subsurface Gasoline Source. Environmental Science and Technology. 41(9):3241-3248. <https://doi.org/10.1021/es060672a> [used]
- Di Toro, D.M., Zarba, C.S., Hansen, D.J., Berry, W.J., Swartz, R.C., Cowan, C.E., Pavlou, S.P., Allen, H.E., Thomas, N.A., Paquin, P.R. (1991). Technical basis for establishing sediment quality criteria for nonionic organic chemicals using equilibrium partitioning. Environmental Toxicology and Chemistry. 10(12):1541-1583. <https://doi.org/10.1002/etc.5620101203> [used]
- Domenico, P.A. (1987). An analytical model for multidimensional transport of a decaying contaminant species. Journal of Hydrology. 91(1-2):49-58. <https://doi.org/10.1016/0022-1694(87)90127-2> [used]
- Environmental Quality Management, Inc. (1994). Revisions to VF and PEF Equations. Memorandum to J. Dinan, U.S. Environmental Protection Agency, Office of Emergency and Remedial Response. Memorandum 5099-3, 11 July 1994. <https://semspub.epa.gov/work/HQ/207.pdf> [used]
- Falta, R.W. (2026). REMChlor. U.S. Environmental Protection Agency. [planned]
- Falta, R.W., Rao, P.S., Basu, N. (2005). Assessing the impacts of partial mass depletion in DNAPL source zones: I. Analytical modeling of source strength functions and plume response. Journal of Contaminant Hydrology. 78(4):259-280. <https://doi.org/10.1016/j.jconhyd.2005.05.010> [used]
- Feenstra, S., Mackay, D.M., Cherry, J.A. (1991). A method for assessing residual NAPL based on organic chemical concentrations in soil samples. Ground Water Monitoring Review. 11(2):128-136. <https://doi.org/10.1111/j.1745-6592.1991.tb00374.x> [used]
- Foster, S.A., Chrostowski, P.C. (1986). [Inhalation exposures to volatile organic contaminants in the shower]. [planned]
- Galya, D.P. (1987). A horizontal plane source model for ground-water transport. Ground Water. 25(6):733-739. <https://doi.org/10.1111/j.1745-6584.1987.tb02215.x> [used]
- Gelhar, L.W., Mantoglou, A., Welty, C., Rehfeldt, K.R. (1985). A review of field-scale physical solute transport processes in saturated and unsaturated porous media. Electric Power Research Institute. EPRI EA-4190. [used]
- Gelhar, L.W., Welty, C., Rehfeldt, K.R. (1992). [A critical review of data on field-scale dispersion in aquifers]. Water Resources Research. 28:1955-1974. [planned]
- Guyonnet, D., Neville, C. (2004). Dimensionless analysis of two analytical solutions for 3-D solute transport in groundwater. Journal of Contaminant Hydrology. 75(1-2):141-153. <https://doi.org/10.1016/j.jconhyd.2004.06.004> [used]
- Hanna, S.R., Briggs, G.A., Hosker, R.P., Jr. (1982). Handbook on atmospheric diffusion. U.S. Department of Energy, Office of Health and Environmental Research. DOE/TIC-11223. [used]
- Hyndman, R.J., Fan, Y. (1996). Sample quantiles in statistical packages. The American Statistician. 50(4):361-365. <https://doi.org/10.1080/00031305.1996.10473566> [used]
- Iman, R.L., Conover, W.J. (1982). A distribution-free approach to inducing rank correlation among input variables. Communications in Statistics, Simulation and Computation. 11(3):311-334. <https://doi.org/10.1080/03610918208812265> [used]
- Ishigami, T., Homma, T. (1990). An importance quantification technique in uncertainty analysis for computer models. Proceedings, First International Symposium on Uncertainty Modeling and Analysis, IEEE. pp. 398-403. <https://doi.org/10.1109/ISUMA.1990.151285> [planned]
- Jansen, M.J.W. (1999). Analysis of variance designs for model output. Computer Physics Communications. 117(1-2):35-43. <https://doi.org/10.1016/S0010-4655(98)00154-4> [used]
- Johnson, P.C., Ettinger, R.A. (1991). Heuristic model for predicting the intrusion rate of contaminant vapors into buildings. Environmental Science and Technology. 25(8):1445-1452. <https://doi.org/10.1021/es00020a013> [used]
- Johnson, P.C., Kemblowski, M.W., Johnson, R.L. (1998). Assessing the Significance of Subsurface Contaminant Vapor Migration to Enclosed Spaces: Site-Specific Alternative to Generic Estimates. American Petroleum Institute. API Publication 4674, December 1998. [used]
- Jury, W.A., Russo, D., Streile, G., El Abd, H. (1990). Evaluation of volatilization by organic chemicals residing below the soil surface. Water Resources Research. 26(1):13-20. <https://doi.org/10.1029/WR026i001p00013> [used]
- Jury, W.A., Spencer, W.F., Farmer, W.J. (1983). Behavior assessment model for trace organics in soil: I. Model description. Journal of Environmental Quality. 12(4):558-564. <https://doi.org/10.2134/jeq1983.00472425001200040026x> [used]
- Lahvis, M.A., Hers, I., Davis, R.V., Wright, J., DeVaull, G.E. (2013). Vapor intrusion screening at petroleum UST sites. Ground Water Monitoring and Remediation. 33(2):53-67. <https://doi.org/10.1111/gwmr.12005> [used]
- Lenhard, R.J., Parker, J.C., Mishra, S. (1989). On the correspondence between Brooks-Corey and van Genuchten models. Journal of Irrigation and Drainage Engineering. 115(4):744-751. <https://doi.org/10.1061/(ASCE)0733-9437(1989)115:4(744)> [used]
- Little, J.C. (1992). Applying the two-resistance theory to contaminant volatilization in showers. Environmental Science & Technology. 26(7):1341-1349. <https://doi.org/10.1021/es00031a010> [used]
- Long, E.R., MacDonald, D.D., Smith, S.L., Calder, F.D. (1995). Incidence of adverse biological effects within ranges of chemical concentrations in marine and estuarine sediments. Environmental Management. 19(1):81-97. <https://doi.org/10.1007/BF02472006> [planned]
- MacDonald, D.D., Ingersoll, C.G., Berger, T.A. (2000). Development and evaluation of consensus-based sediment quality guidelines for freshwater ecosystems. Archives of Environmental Contamination and Toxicology. 39(1):20-31. <https://doi.org/10.1007/s002440010075> [planned]
- Massachusetts Department of Environmental Protection (2002). Characterizing Risks Posed by Petroleum Contaminated Sites: Implementation of the MADEP VPH/EPH Approach. Massachusetts Department of Environmental Protection, Bureau of Waste Site Cleanup. Policy #WSC-02-411, October 31, 2002. [used]
- McKay, M.D., Beckman, R.J., Conover, W.J. (1979). A comparison of three methods for selecting values of input variables in the analysis of output from a computer code. Technometrics. 21(2):239-245. <https://doi.org/10.1080/00401706.1979.10489755> [used]
- Millington, R.J., Quirk, J.P. (1961). Permeability of porous solids. Transactions of the Faraday Society. 57:1200-1207. <https://doi.org/10.1039/TF9615701200> [used]
- Morris, M.D. (1991). Factorial sampling plans for preliminary computational experiments. Technometrics. 33(2):161-174. <https://doi.org/10.1080/00401706.1991.10484804> [planned]
- Mualem, Y. (1976). A new model for predicting the hydraulic conductivity of unsaturated porous media. Water Resources Research. 12(3):513-522. <https://doi.org/10.1029/WR012i003p00513> [used]
- Newell, C.J., McLeod, R.K., Gonzales, J.R. (1996). BIOSCREEN natural attenuation decision support system, user's manual. U.S. Environmental Protection Agency. EPA/600/R-96/087, Version 1.3, August 1996. <https://nepis.epa.gov/Adobe/PDF/P1007K50.pdf> [used]
- Roseberry, A.M., Burmaster, D.E. (1992). Lognormal distributions for water intake by children and adults. Risk Analysis. 12(1):99-104. <https://doi.org/10.1111/j.1539-6924.1992.tb01312.x> [planned]
- Saltelli, A., Annoni, P., Azzini, I., Campolongo, F., Ratto, M., Tarantola, S. (2010). Variance based sensitivity analysis of model output. Design and estimator for the total sensitivity index. Computer Physics Communications. 181(2):259-270. <https://doi.org/10.1016/j.cpc.2009.09.018> [used]
- Sample, B.E., Opresko, D.M., Suter, G.W., II (1996). Toxicological benchmarks for wildlife: 1996 revision. Oak Ridge National Laboratory, Risk Assessment Program, for the U.S. Department of Energy. ES/ER/TM-86/R3, June 1996; doi:10.2172/258027. <https://www.osti.gov/biblio/258027> [used]
- Schulze-Makuch, D. (2005). Longitudinal dispersivity data and implications for scaling behavior. Ground Water. 43(3):443-456. <https://doi.org/10.1111/j.1745-6584.2005.0051.x> [used]
- Sobol, I.M. (1993). [Sensitivity estimates for nonlinear mathematical models]. [planned]
- Sobol, I.M. (2001). Global sensitivity indices for nonlinear mathematical models and their Monte Carlo estimates. Mathematics and Computers in Simulation. 55(1-3):271-280. <https://doi.org/10.1016/S0378-4754(00)00270-6> [used]
- Spence, L.R., Walden, T. (2001). RISC4 User's Manual. BP Oil International. Version 4.0, October 2001. <https://www.isprambiente.gov.it/contentfiles/00002500/2516-c2179-risc4-manual.pdf> [fixture]
- Srinivasan, V., Clement, T.P. (2008). [Analytical solutions for sequentially coupled one-dimensional reactive transport problems, part I]. Advances in Water Resources. 31:203-218. [planned]
- Srinivasan, V., Clement, T.P. (2008). [Analytical solutions for sequentially coupled one-dimensional reactive transport problems, part II]. Advances in Water Resources. 31:219-232. [planned]
- Srinivasan, V., Clement, T.P., Lee, K.K. (2007). Domenico solution: is it valid?. Ground Water. 45(2):136-146. <https://doi.org/10.1111/j.1745-6584.2006.00281.x> [used]
- Stephan, C.E., Mount, D.I., Hansen, D.J., Gentile, J.H., Chapman, G.A., Brungs, W.A. (1985). Guidelines for Deriving Numerical National Water Quality Criteria for the Protection of Aquatic Organisms and Their Uses. U.S. Environmental Protection Agency, Office of Research and Development. PB85-227049. <https://www.epa.gov/sites/production/files/2016-02/documents/guidelines-water-quality-criteria.pdf> [planned]
- Total Petroleum Hydrocarbon Criteria Working Group (1997). Total Petroleum Hydrocarbon Criteria Working Group Series, Volumes 1 to 5. Amherst Scientific Publishers, Amherst, Massachusetts. [used]
- Trapp, S. (2015). [Plant uptake and transport models for neutral and ionic chemicals]. [planned]
- Trapp, S., Matthies, M. (1995). Generic one-compartment model for uptake of organic chemicals by foliar vegetation. Environmental Science & Technology 29(9), 2333-2338. doi:10.1021/es00009a027. [used]
- U.S. Environmental Protection Agency (1989). Risk Assessment Guidance for Superfund, Volume I: Human Health Evaluation Manual (Part A), Interim Final. U.S. Environmental Protection Agency, Office of Emergency and Remedial Response. EPA/540/1-89/002, December 1989. <https://www.epa.gov/system/files/documents/2024-10/rags_a_508.pdf> [used]
- U.S. Environmental Protection Agency (1991). Risk Assessment Guidance for Superfund, Volume I: Human Health Evaluation Manual, Supplemental Guidance: "Standard Default Exposure Factors", Interim Final. U.S. Environmental Protection Agency, Office of Emergency and Remedial Response. OSWER Directive 9285.6-03, PB91-921314, March 25, 1991. <https://semspub.epa.gov/src/document/HQ/190591> [used]
- U.S. Environmental Protection Agency (1991). Risk Assessment Guidance for Superfund: Volume I, Human Health Evaluation Manual (Part B, Development of Risk-based Preliminary Remediation Goals), Interim. U.S. Environmental Protection Agency, Office of Emergency and Remedial Response. EPA/540/R-92/003, Publication 9285.7-01B, December 1991. <https://semspub.epa.gov/src/document/HQ/156739> [used]
- U.S. Environmental Protection Agency (1992). Dermal Exposure Assessment: Principles and Applications, Interim Report. U.S. Environmental Protection Agency, Office of Health and Environmental Assessment. EPA/600/8-91/011B, January 1992. <https://rais.ornl.gov/documents/DERM_EXP.PDF> [used]
- U.S. Environmental Protection Agency (1996). Soil Screening Guidance: Technical Background Document. U.S. Environmental Protection Agency. EPA/540/R-95/128 (Publication 9355.4-17A), Second Edition, May 1996. <https://semspub.epa.gov/work/HQ/207.pdf> [used]
- U.S. Environmental Protection Agency (1996). Soil Screening Guidance: User's Guide. U.S. Environmental Protection Agency, Office of Emergency and Remedial Response. EPA/540/R-96/018, Publication 9355.4-23, Second Edition, July 1996. <https://semspub.epa.gov/work/HQ/211.pdf> [used]
- U.S. Environmental Protection Agency (1997). Guiding Principles for Monte Carlo Analysis. U.S. Environmental Protection Agency. EPA/630/R-97/001. [used]
- U.S. Environmental Protection Agency (2001). Risk Assessment Guidance for Superfund, Volume III, Part A, Process for Conducting Probabilistic Risk Assessment. [used]
- U.S. Environmental Protection Agency (2002). Supplemental Guidance for Developing Soil Screening Levels for Superfund Sites. U.S. Environmental Protection Agency. OSWER 9355.4-24, December 2002. <https://semspub.epa.gov/work/HQ/175878.pdf> [used]
- U.S. Environmental Protection Agency (2003). Human Health Toxicity Values in Superfund Risk Assessments. U.S. Environmental Protection Agency, Office of Superfund Remediation and Technology Innovation. OSWER Directive 9285.7-53, December 5, 2003. <https://semspub.epa.gov/work/HQ/136.pdf> [data]
- U.S. Environmental Protection Agency (2003). Ecological Soil Screening Levels (Eco-SSLs). <https://www.epa.gov/chemical-research/interim-ecological-soil-screening-level-documents> [used]
- U.S. Environmental Protection Agency (2004). User's Guide for Evaluating Subsurface Vapor Intrusion into Buildings. U.S. Environmental Protection Agency, Office of Emergency and Remedial Response. Revised February 22, 2004 (prepared by Environmental Quality Management, Inc., EPA Contract 68-W-02-33). <https://19january2021snapshot.epa.gov/sites/static/files/2015-11/2004_0222_3phase_users_guide.pdf> [used]
- U.S. Environmental Protection Agency (2004). Risk Assessment Guidance for Superfund, Volume I: Human Health Evaluation Manual (Part E, Supplemental Guidance for Dermal Risk Assessment), Final. U.S. Environmental Protection Agency, Office of Superfund Remediation and Technology Innovation. EPA/540/R/99/005, OSWER 9285.7-02EP, PB99-963312, July 2004. <https://www.epa.gov/sites/default/files/2015-09/documents/part_e_final_revision_10-03-07.pdf> [used]
- U.S. Environmental Protection Agency (2005). Supplemental Guidance for Assessing Susceptibility from Early-Life Exposure to Carcinogens. U.S. Environmental Protection Agency, Risk Assessment Forum. EPA/630/R-03/003F, March 2005. <https://www.epa.gov/sites/default/files/2013-09/documents/childrens_supplement_final.pdf> [used]
- U.S. Environmental Protection Agency (2005). Guidelines for Carcinogen Risk Assessment. U.S. Environmental Protection Agency, Risk Assessment Forum. EPA/630/P-03/001F, March 2005. <https://www.epa.gov/sites/default/files/2013-09/documents/cancer_guidelines_final_3-25-05.pdf> [used]
- U.S. Environmental Protection Agency (2005). Human Health Risk Assessment Protocol for Hazardous Waste Combustion Facilities. [used]
- U.S. Environmental Protection Agency (2005). Guidance for Developing Ecological Soil Screening Levels. U.S. Environmental Protection Agency, Office of Solid Waste and Emergency Response. OSWER Directive 9285.7-55, November 2003, revised February 2005. <https://www.epa.gov/sites/default/files/2015-09/documents/ecossl_guidance_chapters.pdf> [used]
- U.S. Environmental Protection Agency (2009). Risk Assessment Guidance for Superfund, Volume I: Human Health Evaluation Manual (Part F, Supplemental Guidance for Inhalation Risk Assessment), Final. U.S. Environmental Protection Agency, Office of Superfund Remediation and Technology Innovation. EPA-540-R-070-002, OSWER 9285.7-82, January 2009. <https://www.epa.gov/sites/default/files/2015-09/documents/partf_200901_final.pdf> [used]
- U.S. Environmental Protection Agency (2011). Exposure Factors Handbook: 2011 Edition (Final). U.S. Environmental Protection Agency, National Center for Environmental Assessment. EPA/600/R-09/052F, September 2011. <https://cfpub.epa.gov/ncea/risk/recordisplay.cfm?deid=236252> [used]
- U.S. Environmental Protection Agency (2012). Recommendations for Default Value for Relative Bioavailability of Arsenic in Soil. U.S. Environmental Protection Agency, Office of Solid Waste and Emergency Response. OSWER 9200.1-113, December 2012. <https://semspub.epa.gov/work/HQ/175338.pdf> [used]
- U.S. Environmental Protection Agency (2014). Human Health Evaluation Manual, Supplemental Guidance: Update of Standard Default Exposure Factors. U.S. Environmental Protection Agency, Office of Solid Waste and Emergency Response. OSWER Directive 9200.1-120, February 6, 2014. <https://www.epa.gov/sites/default/files/2015-11/documents/oswer_directive_9200.1-120_exposurefactors_corrected2.pdf> [used]
- U.S. Environmental Protection Agency (2015). Technical Guide for Addressing Petroleum Vapor Intrusion at Leaking Underground Storage Tank Sites. U.S. Environmental Protection Agency, Office of Underground Storage Tanks. EPA 510-R-15-001, June 2015. <https://www.epa.gov/ust/technical-guide-addressing-petroleum-vapor-intrusion-leaking-underground-storage-tank-sites> [used]
- U.S. Environmental Protection Agency (2015). OSWER Technical Guide for Assessing and Mitigating the Vapor Intrusion Pathway from Subsurface Vapor Sources to Indoor Air. U.S. Environmental Protection Agency, Office of Solid Waste and Emergency Response. OSWER Publication 9200.2-154, June 2015. <https://19january2017snapshot.epa.gov/sites/production/files/2015-09/documents/oswer-vapor-intrusion-technical-guide-final.pdf> [used]
- U.S. Environmental Protection Agency (2017). Documentation for EPA's Implementation of the Johnson and Ettinger Model to Evaluate Site Specific Vapor Intrusion into Buildings, Version 6.0. U.S. Environmental Protection Agency, Office of Superfund Remediation and Technology Innovation. Revised September 2017. <https://semspub.epa.gov/work/HQ/100000489.pdf> [used]
- U.S. Environmental Protection Agency (2024). Regional Screening Levels (RSLs), Generic Tables, November 2024. U.S. Environmental Protection Agency. SEMS documents 405270 (summary table), 405302 (chemical-specific parameters) and 405290 (resident tap water), TR = 1E-06, THQ = 1. <https://www.epa.gov/risk/regional-screening-levels-rsls-generic-tables> [data]
- U.S. Environmental Protection Agency (2024). Regional Screening Levels (RSLs), User's Guide. U.S. Environmental Protection Agency. Web page accompanying the November 2024 tables. <https://www.epa.gov/risk/regional-screening-levels-rsls-users-guide> [used]
- U.S. Environmental Protection Agency (2025). National Recommended Water Quality Criteria - Human Health Criteria Table. U.S. Environmental Protection Agency. <https://www.epa.gov/wqc/national-recommended-water-quality-criteria-human-health-criteria-table> [data]
- U.S. Environmental Protection Agency (2026). CompTox Chemicals Dashboard. [data]
- U.S. Environmental Protection Agency (2026). Integrated Risk Information System (IRIS). [data]
- U.S. Environmental Protection Agency (2026). National Primary Drinking Water Regulations. U.S. Environmental Protection Agency. Codified at 40 CFR Part 141. <https://www.epa.gov/ground-water-and-drinking-water/national-primary-drinking-water-regulations> [data]
- U.S. Environmental Protection Agency (2026). National Recommended Water Quality Criteria - Aquatic Life Criteria Table. U.S. Environmental Protection Agency. <https://www.epa.gov/wqc/national-recommended-water-quality-criteria-aquatic-life-criteria-table> [data]
- U.S. Environmental Protection Agency (2026). Vapor Intrusion Screening Level User's Guide. U.S. Environmental Protection Agency. <https://www.epa.gov/vaporintrusion/visl-users-guide> [used]
- U.S. Environmental Protection Agency, Region 4 (2018). Region 4 Ecological Risk Assessment Supplemental Guidance, March 2018 Update. U.S. Environmental Protection Agency, Region 4, Superfund Division, Scientific Support Section. <https://www.epa.gov/sites/default/files/2018-03/documents/era_regional_supplemental_guidance_report-march-2018_update.pdf> [data]
- Ünlü, K., Kemblowski, M.W., Parker, J.C., Stevens, D., Chong, P.K., Kamil, I. (1992). A screening model for effects of land-disposed wastes on groundwater quality. Journal of Contaminant Hydrology. 11(1-2):27-49. <https://doi.org/10.1016/0169-7722(92)90032-A> [used]
- Utrecht University (MiBiPreT) (2026). mibitrans. Version 1.0.1. <https://pypi.org/project/mibitrans/> [fixture]
- van Genuchten, M.Th. (1980). A closed-form equation for predicting the hydraulic conductivity of unsaturated soils. Soil Science Society of America Journal. 44(5):892-898. <https://doi.org/10.2136/sssaj1980.03615995004400050002x> [used]
- van Genuchten, M.Th., Alves, W.J. (1982). Analytical solutions of the one-dimensional convective-dispersive solute transport equation. U.S. Department of Agriculture, Agricultural Research Service, Technical Bulletin. No. 1661, 151 p. <https://doi.org/10.22004/ag.econ.157268> [used]
- Walden, T., Spence, L.R. (1997). Risk-based BTEX screening criteria for a groundwater irrigation scenario. Human and Ecological Risk Assessment: An International Journal. 3(4):699-722. <https://doi.org/10.1080/10807039709383722> [used]
- Weaver, J. (2017). PVIScreen. U.S. Environmental Protection Agency. [planned]
- West, M.R., Kueper, B.H., Ungs, M.J. (2007). On the use and error of approximation in the Domenico (1987) solution. Ground Water. 45(2):126-135. <https://doi.org/10.1111/j.1745-6584.2006.00280.x> [used]
- Wexler, E.J. (1992). Analytical solutions for one-, two-, and three-dimensional solute transport in ground-water systems with uniform flow. U.S. Geological Survey Techniques of Water-Resources Investigations. TWRI 3-B7 (Book 3, Chapter B7). <https://doi.org/10.3133/twri03b7> [used]
- Wexler, E.J. (1996). ANALGWST (analytical groundwater solute transport code), version 1.1. U.S. Geological Survey. Version 1.1 (1996/04/03). <https://water.usgs.gov/software/ANALGWST/> [fixture]
- Wichura, M.J. (1988). Algorithm AS 241: the percentage points of the normal distribution. Applied Statistics. 37(3):477. <https://doi.org/10.2307/2347330> [used]
- Xu, M., Eckstein, Y. (1995). Use of weighted least-squares method in evaluation of the relationship between dispersivity and field scale. Ground Water. 33(6):905-908. [used]
- Yao, Y., Shen, R., Pennell, K.G., Suuberg, E.M. (2011). Comparison of the Johnson-Ettinger vapor intrusion screening model predictions with full three-dimensional model results. Environmental Science and Technology. 45(6):2227-2235. <https://doi.org/10.1021/es102602s> [planned]
- Yao, Y., Shen, R., Pennell, K.G., Suuberg, E.M. (2013). A review of vapor intrusion models. Environmental Science and Technology. 47(6):2457-2470. <https://doi.org/10.1021/es302714g> [planned]
- Yeh, G.T. (1981). AT123D: Analytical transient one-, two-, and three-dimensional simulation of waste transport in the aquifer system. Oak Ridge National Laboratory. ORNL-5602. <https://doi.org/10.2172/6531241> [used]
