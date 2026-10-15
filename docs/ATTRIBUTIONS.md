# Attributions

Generated 2026-10-15 from `packages/engine/src/references/references.json` and the method registry. Do not edit by hand.

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
  - American Petroleum Institute (1987). [Dispersivity ratios for groundwater transport: transverse = longitudinal/3, vertical = transverse/87]. API Document 471-01-09.

#### Xu and Eckstein (1995) regression with BIOSCREEN ratios

- Kind: Modern
- Method id: `dispersivity.xu-eckstein1995`
- Summary: Longitudinal dispersivity from a weighted least-squares fit to field data on scale; transverse is one tenth and vertical one hundredth of longitudinal.
- Assumptions:
  - Dispersivity depends only on the transport distance.
  - The regression collapses to zero below one metre.
- Sources:
  - Xu, M., Eckstein, Y. (1995). Use of weighted least-squares method in evaluation of the relationship between dispersivity and field scale. Ground Water. 33(6):905-908.
  - Newell, C.J., McLeod, R.K., Gonzales, J.R. (1996). BIOSCREEN natural attenuation decision support system, user's manual. U.S. Environmental Protection Agency. EPA/600/R-96/087.

## Planned methods

Sources for methods on the roadmap that are not implemented yet. Nothing here affects a result today.

- Abreu, L.D.V., Ettinger, R., McAlary, T. (2009). [Simulated soil vapor intrusion attenuation factors including biodegradation].
- Abreu, L.D.V., Johnson, P.C. (2005). [Three-dimensional numerical modeling of vapor intrusion].
- American Petroleum Institute (2010). BioVapor.
- ASTM International (1995). ASTM E1739-95 Standard guide for risk-based corrective action applied at petroleum release sites. E1739-95.
- Aziz, C.E., et al. (2000). BIOCHLOR.
- Briggs, G.G., et al. (1982). [Relationships between lipophilicity and root uptake and translocation of non-ionised chemicals by barley].
- Brooks, R.H., Corey, A.T. (1964). [Hydraulic properties of porous media].
- Celia, M.A., Bouloutas, E.T., Zarba, R.L. (1990). [A general mass-conservative numerical solution for the unsaturated flow equation]. Water Resources Research.
- Cowherd, C., et al. (1985). [Rapid assessment of exposure to particulate emissions from surface contamination sites].
- DeVaull, G.E. (2007). [Indoor vapor intrusion with oxygen-limited biodegradation for a subsurface gasoline source]. Environmental Science and Technology. 41:3241-3248.
- Domenico, P.A. (1987). An analytical model for multidimensional transport of a decaying contaminant species. Journal of Hydrology.
- Falta, R.W. (2025). REMChlor. U.S. Environmental Protection Agency.
- Falta, R.W., Rao, P.S., Basu, N. (2005). Assessing the impacts of partial mass depletion in DNAPL source zones: I. Analytical modeling of source strength functions and plume response. Journal of Contaminant Hydrology. 78:259-280.
- Foster, S.A., Chrostowski, P.C. (1986). [Inhalation exposures to volatile organic contaminants in the shower].
- Galya, D.P. (1987). [Finite rectangular volume source for the AT123D solution].
- Gelhar, L.W., Welty, C., Rehfeldt, K.R. (1992). [A critical review of data on field-scale dispersion in aquifers]. Water Resources Research. 28:1955-1974.
- Guyonnet, D., Neville, C. (2004). [Dimensionless analysis of two analytical solutions for 3-D solute transport in groundwater]. Journal of Contaminant Hydrology. 75:141-153.
- Iman, R.L., Conover, W.J. (1982). [A distribution-free approach to inducing rank correlation among input variables].
- Johnson, P.C., Ettinger, R.A. (1991). [Heuristic model for predicting the intrusion rate of contaminant vapors into buildings]. Environmental Science and Technology.
- Johnson, P.C., Kemblowski, M.W., Johnson, R.L. (1998). [Assessing the significance of subsurface contaminant vapor migration to enclosed spaces]. American Petroleum Institute. API 4674.
- Jury, W.A., et al. (1983). [Behavior assessment model for trace organics in soil].
- Lenhard, R.J., et al. (1989). [Conversion of van Genuchten n to Brooks-Corey lambda].
- Little, J.C. (1992). [Applying the two-resistance theory to contaminant volatilization in showers].
- MacDonald, D.D., et al. (2000). [Development and evaluation of consensus-based sediment quality guidelines for freshwater ecosystems].
- Massachusetts Department of Environmental Protection (2002). [Characterizing risks posed by petroleum contaminated sites].
- McKay, M.D., Beckman, R.J., Conover, W.J. (1979). [A comparison of three methods for selecting values of input variables in the analysis of output from a computer code].
- Millington, R.J., Quirk, J.P. (1961). [Permeability of porous solids].
- Morris, M.D. (1991). [Factorial sampling plans for preliminary computational experiments].
- National Oceanic and Atmospheric Administration (2025). Screening Quick Reference Tables (SQuiRTs).
- Saltelli, A., et al. (2010). [Variance based sensitivity analysis of model output].
- Sample, B.E., et al. (1996). [Toxicological benchmarks for wildlife]. Oak Ridge National Laboratory.
- Schulze-Makuch, D. (2005). [Longitudinal dispersivity data and implications for scaling behavior]. Ground Water. 43:443-456.
- Sobol, I.M. (1993). [Sensitivity estimates for nonlinear mathematical models].
- Srinivasan, V., Clement, T.P. (2008). [Analytical solutions for sequentially coupled one-dimensional reactive transport problems, part I]. Advances in Water Resources. 31:203-218.
- Srinivasan, V., Clement, T.P. (2008). [Analytical solutions for sequentially coupled one-dimensional reactive transport problems, part II]. Advances in Water Resources. 31:219-232.
- Srinivasan, V., Clement, T.P., Lee, K.K. (2007). [Domenico solution: is it valid?]. Ground Water. 45:136-146.
- Total Petroleum Hydrocarbon Criteria Working Group (1997). [TPHCWG series, volumes published 1997 to 1999].
- Trapp, S. (2015). [Plant uptake and transport models for neutral and ionic chemicals].
- Trapp, S., Matthies, M. (1995). [Generic one-compartment model for uptake of organic chemicals by foliar vegetation].
- U.S. Environmental Protection Agency (1989). Risk Assessment Guidance for Superfund, Part A.
- U.S. Environmental Protection Agency (1996). Soil Screening Guidance. U.S. Environmental Protection Agency. EPA/540/R-95/128.
- U.S. Environmental Protection Agency (1997). Guiding Principles for Monte Carlo Analysis. U.S. Environmental Protection Agency. EPA/630/R-97/001.
- U.S. Environmental Protection Agency (2001). Risk Assessment Guidance for Superfund, Volume III, Part A, Process for Conducting Probabilistic Risk Assessment.
- U.S. Environmental Protection Agency (2002). Supplemental Guidance for Developing Soil Screening Levels. U.S. Environmental Protection Agency. OSWER 9355.4-24.
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
- U.S. Environmental Protection Agency (2025). National Recommended Water Quality Criteria (NRWQC).
- Ünlü, K., et al. (1992). [VADSAT: vadose zone leaching and volatilization model].
- van Genuchten, M.T. (1980). A closed-form equation for predicting the hydraulic conductivity of unsaturated soils. Soil Science Society of America Journal. 44:892-898.
- van Genuchten, M.T., Alves, W.J. (1982). [Analytical solutions of the one-dimensional convective-dispersive solute transport equation]. USDA Technical Bulletin. 1661.
- Walden, T., Spence, L.R. (1997). [Irrigation water pathways].
- Weaver, J. (2017). PVIScreen. U.S. Environmental Protection Agency.
- West, M.R., Kueper, B.H., Ungs, M.J. (2007). [Evaluation of the Domenico approximation for contaminant transport]. Ground Water. 45:126-135.
- Wexler, E.J. (1992). [Analytical solutions for one-, two-, and three-dimensional solute transport in ground-water systems with uniform flow]. U.S. Geological Survey Techniques of Water-Resources Investigations. TWRI 3-B7.
- Yao, Y., Pennell, K.G., Suuberg, E.M. (2011). [Vapor intrusion model comparisons].
- Yao, Y., Shen, R., Suuberg, E.M. (2013). [Review of vapor intrusion modeling].
- Yeh, G.T. (1981). AT123D: Analytical transient one-, two-, and three-dimensional simulation of waste transport in the aquifer system. Oak Ridge National Laboratory. ORNL-5602.

## Data sources

Public datasets that the chemical and toxicity database is built from.

- U.S. Environmental Protection Agency (2025). Regional Screening Levels (RSLs), Generic Tables. <https://www.epa.gov/risk/regional-screening-levels-rsls-generic-tables>
- U.S. Environmental Protection Agency (2025). CompTox Chemicals Dashboard.
- U.S. Environmental Protection Agency (2025). Integrated Risk Information System (IRIS).

## Validation sources

Reviews, codes and packages used to produce test fixtures. They are checks on this software, not parts of it.

- Arcadis Geraghty & Miller (2001). Review of Risk Integrated Software for Cleanups (RISC) v4.0.
- Utrecht University (MiBiPreT) (2025). mibitrans.
- Wexler, E.J. (1996). ANALGWST (analytical groundwater solute transport code), version 1.1. U.S. Geological Survey.

## References

Every entry in the reference database, alphabetical by author.

- Abreu, L.D.V., Ettinger, R., McAlary, T. (2009). [Simulated soil vapor intrusion attenuation factors including biodegradation]. [planned]
- Abreu, L.D.V., Johnson, P.C. (2005). [Three-dimensional numerical modeling of vapor intrusion]. [planned]
- American Petroleum Institute (1987). [Dispersivity ratios for groundwater transport: transverse = longitudinal/3, vertical = transverse/87]. API Document 471-01-09. [used]
- American Petroleum Institute (2010). BioVapor. [planned]
- Arcadis Geraghty & Miller (2001). Review of Risk Integrated Software for Cleanups (RISC) v4.0. [fixture]
- ASTM International (1995). ASTM E1739-95 Standard guide for risk-based corrective action applied at petroleum release sites. E1739-95. [planned]
- Aziz, C.E., et al. (2000). BIOCHLOR. [planned]
- Briggs, G.G., et al. (1982). [Relationships between lipophilicity and root uptake and translocation of non-ionised chemicals by barley]. [planned]
- Brooks, R.H., Corey, A.T. (1964). [Hydraulic properties of porous media]. [planned]
- Celia, M.A., Bouloutas, E.T., Zarba, R.L. (1990). [A general mass-conservative numerical solution for the unsaturated flow equation]. Water Resources Research. [planned]
- Cowherd, C., et al. (1985). [Rapid assessment of exposure to particulate emissions from surface contamination sites]. [planned]
- DeVaull, G.E. (2007). [Indoor vapor intrusion with oxygen-limited biodegradation for a subsurface gasoline source]. Environmental Science and Technology. 41:3241-3248. [planned]
- Domenico, P.A. (1987). An analytical model for multidimensional transport of a decaying contaminant species. Journal of Hydrology. [planned]
- Falta, R.W. (2025). REMChlor. U.S. Environmental Protection Agency. [planned]
- Falta, R.W., Rao, P.S., Basu, N. (2005). Assessing the impacts of partial mass depletion in DNAPL source zones: I. Analytical modeling of source strength functions and plume response. Journal of Contaminant Hydrology. 78:259-280. [planned]
- Foster, S.A., Chrostowski, P.C. (1986). [Inhalation exposures to volatile organic contaminants in the shower]. [planned]
- Galya, D.P. (1987). [Finite rectangular volume source for the AT123D solution]. [planned]
- Gelhar, L.W., Mantoglou, A., Welty, C., Rehfeldt, K.R. (1985). A review of field-scale physical solute transport processes in saturated and unsaturated porous media. Electric Power Research Institute. EPRI EA-4190. [used]
- Gelhar, L.W., Welty, C., Rehfeldt, K.R. (1992). [A critical review of data on field-scale dispersion in aquifers]. Water Resources Research. 28:1955-1974. [planned]
- Guyonnet, D., Neville, C. (2004). [Dimensionless analysis of two analytical solutions for 3-D solute transport in groundwater]. Journal of Contaminant Hydrology. 75:141-153. [planned]
- Iman, R.L., Conover, W.J. (1982). [A distribution-free approach to inducing rank correlation among input variables]. [planned]
- Johnson, P.C., Ettinger, R.A. (1991). [Heuristic model for predicting the intrusion rate of contaminant vapors into buildings]. Environmental Science and Technology. [planned]
- Johnson, P.C., Kemblowski, M.W., Johnson, R.L. (1998). [Assessing the significance of subsurface contaminant vapor migration to enclosed spaces]. American Petroleum Institute. API 4674. [planned]
- Jury, W.A., et al. (1983). [Behavior assessment model for trace organics in soil]. [planned]
- Lenhard, R.J., et al. (1989). [Conversion of van Genuchten n to Brooks-Corey lambda]. [planned]
- Little, J.C. (1992). [Applying the two-resistance theory to contaminant volatilization in showers]. [planned]
- MacDonald, D.D., et al. (2000). [Development and evaluation of consensus-based sediment quality guidelines for freshwater ecosystems]. [planned]
- Massachusetts Department of Environmental Protection (2002). [Characterizing risks posed by petroleum contaminated sites]. [planned]
- McKay, M.D., Beckman, R.J., Conover, W.J. (1979). [A comparison of three methods for selecting values of input variables in the analysis of output from a computer code]. [planned]
- Millington, R.J., Quirk, J.P. (1961). [Permeability of porous solids]. [planned]
- Morris, M.D. (1991). [Factorial sampling plans for preliminary computational experiments]. [planned]
- National Oceanic and Atmospheric Administration (2025). Screening Quick Reference Tables (SQuiRTs). [planned]
- Newell, C.J., McLeod, R.K., Gonzales, J.R. (1996). BIOSCREEN natural attenuation decision support system, user's manual. U.S. Environmental Protection Agency. EPA/600/R-96/087. [used]
- Saltelli, A., et al. (2010). [Variance based sensitivity analysis of model output]. [planned]
- Sample, B.E., et al. (1996). [Toxicological benchmarks for wildlife]. Oak Ridge National Laboratory. [planned]
- Schulze-Makuch, D. (2005). [Longitudinal dispersivity data and implications for scaling behavior]. Ground Water. 43:443-456. [planned]
- Sobol, I.M. (1993). [Sensitivity estimates for nonlinear mathematical models]. [planned]
- Srinivasan, V., Clement, T.P. (2008). [Analytical solutions for sequentially coupled one-dimensional reactive transport problems, part I]. Advances in Water Resources. 31:203-218. [planned]
- Srinivasan, V., Clement, T.P. (2008). [Analytical solutions for sequentially coupled one-dimensional reactive transport problems, part II]. Advances in Water Resources. 31:219-232. [planned]
- Srinivasan, V., Clement, T.P., Lee, K.K. (2007). [Domenico solution: is it valid?]. Ground Water. 45:136-146. [planned]
- Total Petroleum Hydrocarbon Criteria Working Group (1997). [TPHCWG series, volumes published 1997 to 1999]. [planned]
- Trapp, S. (2015). [Plant uptake and transport models for neutral and ionic chemicals]. [planned]
- Trapp, S., Matthies, M. (1995). [Generic one-compartment model for uptake of organic chemicals by foliar vegetation]. [planned]
- U.S. Environmental Protection Agency (1989). Risk Assessment Guidance for Superfund, Part A. [planned]
- U.S. Environmental Protection Agency (1996). Soil Screening Guidance. U.S. Environmental Protection Agency. EPA/540/R-95/128. [planned]
- U.S. Environmental Protection Agency (1997). Guiding Principles for Monte Carlo Analysis. U.S. Environmental Protection Agency. EPA/630/R-97/001. [planned]
- U.S. Environmental Protection Agency (2001). Risk Assessment Guidance for Superfund, Volume III, Part A, Process for Conducting Probabilistic Risk Assessment. [planned]
- U.S. Environmental Protection Agency (2002). Supplemental Guidance for Developing Soil Screening Levels. U.S. Environmental Protection Agency. OSWER 9355.4-24. [planned]
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
- U.S. Environmental Protection Agency (2025). Regional Screening Levels (RSLs), Generic Tables. <https://www.epa.gov/risk/regional-screening-levels-rsls-generic-tables> [data]
- U.S. Environmental Protection Agency (2025). CompTox Chemicals Dashboard. [data]
- U.S. Environmental Protection Agency (2025). Integrated Risk Information System (IRIS). [data]
- U.S. Environmental Protection Agency (2025). National Recommended Water Quality Criteria (NRWQC). [planned]
- Ünlü, K., et al. (1992). [VADSAT: vadose zone leaching and volatilization model]. [planned]
- Utrecht University (MiBiPreT) (2025). mibitrans. [fixture]
- van Genuchten, M.T. (1980). A closed-form equation for predicting the hydraulic conductivity of unsaturated soils. Soil Science Society of America Journal. 44:892-898. [planned]
- van Genuchten, M.T., Alves, W.J. (1982). [Analytical solutions of the one-dimensional convective-dispersive solute transport equation]. USDA Technical Bulletin. 1661. [planned]
- Walden, T., Spence, L.R. (1997). [Irrigation water pathways]. [planned]
- Weaver, J. (2017). PVIScreen. U.S. Environmental Protection Agency. [planned]
- West, M.R., Kueper, B.H., Ungs, M.J. (2007). [Evaluation of the Domenico approximation for contaminant transport]. Ground Water. 45:126-135. [planned]
- Wexler, E.J. (1992). [Analytical solutions for one-, two-, and three-dimensional solute transport in ground-water systems with uniform flow]. U.S. Geological Survey Techniques of Water-Resources Investigations. TWRI 3-B7. [planned]
- Wexler, E.J. (1996). ANALGWST (analytical groundwater solute transport code), version 1.1. U.S. Geological Survey. [fixture]
- Xu, M., Eckstein, Y. (1995). Use of weighted least-squares method in evaluation of the relationship between dispersivity and field scale. Ground Water. 33(6):905-908. [used]
- Yao, Y., Pennell, K.G., Suuberg, E.M. (2011). [Vapor intrusion model comparisons]. [planned]
- Yao, Y., Shen, R., Suuberg, E.M. (2013). [Review of vapor intrusion modeling]. [planned]
- Yeh, G.T. (1981). AT123D: Analytical transient one-, two-, and three-dimensional simulation of waste transport in the aquifer system. Oak Ridge National Laboratory. ORNL-5602. [planned]
