# Parameter map carried over from the retired tkinter prototype

The original `index.py` (deleted in M0; see git history before 2026-10-15) was a form shell with no
computation. Its only durable content was the set of input fields and defaults it exposed, which mirror
the input screens of the vadose zone, dissolved-phase and saturated soil models. They are recorded here so
the engine's scenario schema can be checked against them. Units follow the prototype's labels.

## Vadose zone model inputs

Lens (optional layer above the source): thickness (m, default 0), total porosity (0 to 0.6, default 0.25),
residual water content (default 0.21), saturated conductivity (m/d, 0.0001 to 100, default 0.022),
van Genuchten n (1.09 clay to 3 cobbles, default 1.09).

Source: depth to top of contamination (m, 0), thickness of contamination (m, 1), source length (m, 10),
source width (m, 10).

Unsaturated zone: infiltration rate (cm/yr, 20), vadose zone thickness (m, 10), total porosity (0.25),
residual water content (0 to porosity, 0.05), saturated conductivity (m/d, 0.001 to 100, 7.13),
van Genuchten n (1.09), fraction organic carbon (0.001 to 0.05, 0.009), bulk density (g/cm3, 1.64).

Saturated zone (receiving aquifer): hydraulic gradient (m/m, 0.1), effective porosity (0.25), fraction
organic carbon (0.009), hydraulic conductivity (m/d, 0.1), bulk density (g/cm3, 1.64), longitudinal,
transverse and vertical dispersivity (m, 0 means code-calculated).

Receptor well: distance downgradient (m, 30), distance cross-gradient (m, 0), depth to top of screen
(m, 0), depth to bottom of screen (m, 1), number of averaging points (minimum 2).

## Dissolved-phase source model inputs

Aquifer parameters as above, plus source thickness (m, 1), source length (m, 10), source width (m, 10)
and the receptor well block.

## Saturated soil source model inputs

Aquifer parameters as above (the prototype never finished this screen).

## Contaminants

The prototype listed benzene, toluene, ethylbenzene and xylenes with first-order degradation rates
(1/d) of 0.00096, 0.025, 0.003 and 0.00019. These were placeholder values; the engine takes degradation
rates from the chemical database with a source tag, never from hard-coded constants.
