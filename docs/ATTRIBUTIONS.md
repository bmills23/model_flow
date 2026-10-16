# Attributions

Generated 2026-10-16 from `packages/engine/src/references/references.json` and the method registry. Do not edit by hand.

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

## Planned methods

Sources for methods on the roadmap that are not implemented yet. Nothing here affects a result today.

- Abreu, L.D.V., Ettinger, R., McAlary, T. (2009). [Simulated soil vapor intrusion attenuation factors including biodegradation].
- Abreu, L.D.V., Johnson, P.C. (2005). [Three-dimensional numerical modeling of vapor intrusion].
- American Petroleum Institute (2010). BioVapor.
- ASTM International (1995). ASTM E1739-95 Standard guide for risk-based corrective action applied at petroleum release sites. E1739-95.
- Aziz, C.E., et al. (2000). BIOCHLOR.
- Briggs, G.G., et al. (1982). [Relationships between lipophilicity and root uptake and translocation of non-ionised chemicals by barley].
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
- U.S. Environmental Protection Agency (1989). Risk Assessment Guidance for Superfund, Part A.
- U.S. Environmental Protection Agency (1997). Guiding Principles for Monte Carlo Analysis. U.S. Environmental Protection Agency. EPA/630/R-97/001.
- U.S. Environmental Protection Agency (2001). Risk Assessment Guidance for Superfund, Volume III, Part A, Process for Conducting Probabilistic Risk Assessment.
- U.S. Environmental Protection Agency (2002). Supplemental Guidance for Developing Soil Screening Levels for Superfund Sites. U.S. Environmental Protection Agency. OSWER 9355.4-24, December 2002. <https://semspub.epa.gov/work/HQ/175878.pdf>
- U.S. Environmental Protection Agency (2003). Ecological Soil Screening Levels (Eco-SSLs).
- U.S. Environmental Protection Agency (2004). [Johnson and Ettinger (1991) vapor intrusion model spreadsheets].
- U.S. Environmental Protection Agency (2004). Risk Assessment Guidance for Superfund, Part E, Supplemental Guidance for Dermal Risk Assessment.
- U.S. Environmental Protection Agency (2005). Supplemental Guidance for Assessing Susceptibility from Early-Life Exposure to Carcinogens.
- U.S. Environmental Protection Agency (2005). Human Health Risk Assessment Protocol for Hazardous Waste Combustion Facilities.
- U.S. Environmental Protection Agency (2009). Risk Assessment Guidance for Superfund, Part F, Supplemental Guidance for Inhalation Risk Assessment. U.S. Environmental Protection Agency. OSWER 9285.7-82.
- U.S. Environmental Protection Agency (2011). Exposure Factors Handbook.
- U.S. Environmental Protection Agency (2014). Human Health Evaluation Manual, Supplemental Guidance: Update of Standard Default Exposure Factors. U.S. Environmental Protection Agency. OSWER 9200.1-120.
- U.S. Environmental Protection Agency (2015). [Technical guide for addressing petroleum vapor intrusion at leaking underground storage tank sites].
- U.S. Environmental Protection Agency (2015). OSWER Technical Guide for Assessing and Mitigating the Vapor Intrusion Pathway from Subsurface Vapor Sources to Indoor Air.
- U.S. Environmental Protection Agency (2026). National Recommended Water Quality Criteria (NRWQC).
- Walden, T., Spence, L.R. (1997). [Irrigation water pathways].
- Weaver, J. (2017). PVIScreen. U.S. Environmental Protection Agency.
- Yao, Y., Pennell, K.G., Suuberg, E.M. (2011). [Vapor intrusion model comparisons].
- Yao, Y., Shen, R., Suuberg, E.M. (2013). [Review of vapor intrusion modeling].

## Data sources

Public datasets that the chemical and toxicity database is built from.

- U.S. Environmental Protection Agency (2026). Regional Screening Levels (RSLs), Generic Tables. <https://www.epa.gov/risk/regional-screening-levels-rsls-generic-tables>
- U.S. Environmental Protection Agency (2026). CompTox Chemicals Dashboard.
- U.S. Environmental Protection Agency (2026). Integrated Risk Information System (IRIS).

## Validation sources

Reviews, codes and packages used to produce test fixtures. They are checks on this software, not parts of it.

- Arcadis Geraghty & Miller (2001). Review of Risk Integrated Software for Cleanups (RISC) v4.0.
- Spence, L.R., Walden, T. (2001). RISC4 User's Manual. BP Oil International. Version 4.0, October 2001. <https://www.isprambiente.gov.it/contentfiles/00002500/2516-c2179-risc4-manual.pdf>
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
- Celia, M.A., Bouloutas, E.T., Zarba, R.L. (1990). A general mass-conservative numerical solution for the unsaturated flow equation. Water Resources Research. 26(7):1483-1496. <https://doi.org/10.1029/WR026i007p01483> [planned]
- Cline, P.V., Delfino, J.J., Rao, P.S.C. (1991). Partitioning of aromatic constituents into water from gasoline and other complex solvent mixtures. Environmental Science & Technology. 25(5):914-920. <https://doi.org/10.1021/es00017a013> [planned]
- Cowherd, C., et al. (1985). [Rapid assessment of exposure to particulate emissions from surface contamination sites]. [planned]
- DeVaull, G.E. (2007). [Indoor vapor intrusion with oxygen-limited biodegradation for a subsurface gasoline source]. Environmental Science and Technology. 41:3241-3248. [planned]
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
- U.S. Environmental Protection Agency (1989). Risk Assessment Guidance for Superfund, Part A. [planned]
- U.S. Environmental Protection Agency (1996). Soil Screening Guidance: Technical Background Document. U.S. Environmental Protection Agency. EPA/540/R-95/128 (Publication 9355.4-17A), Second Edition, May 1996. <https://semspub.epa.gov/work/HQ/207.pdf> [used]
- U.S. Environmental Protection Agency (1997). Guiding Principles for Monte Carlo Analysis. U.S. Environmental Protection Agency. EPA/630/R-97/001. [planned]
- U.S. Environmental Protection Agency (2001). Risk Assessment Guidance for Superfund, Volume III, Part A, Process for Conducting Probabilistic Risk Assessment. [planned]
- U.S. Environmental Protection Agency (2002). Supplemental Guidance for Developing Soil Screening Levels for Superfund Sites. U.S. Environmental Protection Agency. OSWER 9355.4-24, December 2002. <https://semspub.epa.gov/work/HQ/175878.pdf> [planned]
- U.S. Environmental Protection Agency (2003). Ecological Soil Screening Levels (Eco-SSLs). [planned]
- U.S. Environmental Protection Agency (2004). [Johnson and Ettinger (1991) vapor intrusion model spreadsheets]. [planned]
- U.S. Environmental Protection Agency (2004). Risk Assessment Guidance for Superfund, Part E, Supplemental Guidance for Dermal Risk Assessment. [planned]
- U.S. Environmental Protection Agency (2005). Supplemental Guidance for Assessing Susceptibility from Early-Life Exposure to Carcinogens. [planned]
- U.S. Environmental Protection Agency (2005). Human Health Risk Assessment Protocol for Hazardous Waste Combustion Facilities. [planned]
- U.S. Environmental Protection Agency (2009). Risk Assessment Guidance for Superfund, Part F, Supplemental Guidance for Inhalation Risk Assessment. U.S. Environmental Protection Agency. OSWER 9285.7-82. [planned]
- U.S. Environmental Protection Agency (2011). Exposure Factors Handbook. [planned]
- U.S. Environmental Protection Agency (2014). Human Health Evaluation Manual, Supplemental Guidance: Update of Standard Default Exposure Factors. U.S. Environmental Protection Agency. OSWER 9200.1-120. [planned]
- U.S. Environmental Protection Agency (2015). [Technical guide for addressing petroleum vapor intrusion at leaking underground storage tank sites]. [planned]
- U.S. Environmental Protection Agency (2015). OSWER Technical Guide for Assessing and Mitigating the Vapor Intrusion Pathway from Subsurface Vapor Sources to Indoor Air. [planned]
- U.S. Environmental Protection Agency (2026). Regional Screening Levels (RSLs), Generic Tables. <https://www.epa.gov/risk/regional-screening-levels-rsls-generic-tables> [data]
- U.S. Environmental Protection Agency (2026). CompTox Chemicals Dashboard. [data]
- U.S. Environmental Protection Agency (2026). Integrated Risk Information System (IRIS). [data]
- U.S. Environmental Protection Agency (2026). National Recommended Water Quality Criteria (NRWQC). [planned]
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
