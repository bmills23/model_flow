# Groundwater transport (engine wave of M1)

Equations as implemented in `packages/engine/src/processes/groundwater/`, in our own words, derived from
the primary publications cited by reference key (see `docs/ATTRIBUTIONS.md` for full entries). The RISC5
manual was used only as a map of which published choices RISC5 made; none of its text or tables is
reproduced and its equation labels are not used here.

Any consistent unit system works in the functions. The library convention is SI (metres, seconds,
kilograms); the fixtures use metres and days.

## Governing equation

Dissolved concentration C in a uniform seepage velocity v along x, with dispersion coefficients
D_x, D_y, D_z, retardation R and first-order decay lambda acting on total (dissolved plus sorbed) mass:

    dC/dt = (D_x/R) C_xx + (D_y/R) C_yy + (D_z/R) C_zz - (v/R) C_x - lambda C

Write u = v/R and D_i' = D_i/R. Dispersion coefficients are D_i = alpha_i v + D_m, built from the
dispersivity laws in `processes/dispersivity` (`dispersionCoefficients`). Solutions are products of one
dimensional kernels in x, y and z, which is why a single time integral suffices.

Three dispersivity laws are offered. The legacy law is the Gelhar et al. 1985 regression with API 1987
ratios (transverse one third, vertical 1/87 of transverse). The modern laws are the Xu and Eckstein 1995
regression and a power law after Schulze-Makuch 2005 (`schulzemakuch2005`), alpha_L = 0.20 L^0.44 for
unconsolidated media, both paired with the BIOSCREEN ratios alpha_T = alpha_L/10 and alpha_V = alpha_L/100.
The Schulze-Makuch compilation reports exponents of 0.44 to 0.94 for unconsolidated media with the most
reliable data near the low end, and no evidence of an upper bound. Only the unconsolidated coefficient pair
is encoded: it was verified from lecture notes that quote the paper, not from the paper's own tables.

## Legacy method: AT123D-class (`groundwater.at123d`; citations `yeh1981`, `galya1987`)

Yeh (`yeh1981`) gives the Green function of this equation for instantaneous point, line, plane and volume
releases. For a mass M released uniformly over the box [x1,x2] x [y1,y2] x [z1,z2] at time zero, the
concentration a time tau later is

    C(x,y,z,tau) = M exp(-lambda tau) / (n R) * fx * fy * fz

with n the porosity and, for each axis, a profile that integrates to one over the axis:

    fx = [erf((x - u tau - x1) / w_x) - erf((x - u tau - x2) / w_x)] / (2 (x2 - x1)),  w_x = 2 sqrt(D_x' tau)

and the same form for y and z without the advective shift (w_y, w_z from D_y', D_z'). When a source
dimension has zero length the profile is the Gaussian of a point release, so plane, line and point
sources are limits of the same code (the point-source limit reproduces the USGS POINT3 closed form).
Our box generalisation is the volume integral of the point Green function; `galya1987` is cited for
the finite-source treatment of the AT123D lineage (its title is "A horizontal plane source model for
ground-water transport"; the box form implemented here is derived from the Green function, not copied
from that paper).

Infinite depth has two forms, chosen by the aquifer's `top`. Yeh measures z from the top surface and
treats the infinitely deep aquifer as a half-space whose top carries a radiation (exchange) condition; with
a zero exchange coefficient that top is no-flux, and Yeh's infinite-depth vertical Green function (point
and line source forms) is the free-space profile plus its mirror image about the top. The engine offers
this as `top: 'no-flux'`, which is the default (Bryan's ruling of 2026-10-16, DECISIONS.md): the aquifer
is z <= 0 under a water table at z = 0, and fz is the free-space profile of [z1, z2] plus that of the
image [-z2, -z1]. The exchange (atmospheric loss) term is not implemented. `top: 'unbounded'` must be
asked for: it has no boundary in z at all, the whole-space medium of the USGS POINT3 program, which the
POINT3 fixtures and the closed-form analytic tests use. It is right only for sources well below any water
table. A source on the water table in the unbounded medium sends half of its mass upward out of the
aquifer, so concentrations below it come out low by up to a factor of two (exactly two for a point or
plane source at z = 0 once the plume has spread).

What changed for users: before 2026-10-16 an infinitely deep AT123D run used the unbounded medium unless
`top: 'no-flux'` was passed, so the legacy results on the transport screen (typed sources) were low near
the water table, by up to a factor of two within a few vertical dispersion lengths of it and for a source
at the water table. Every infinite-depth AT123D run now uses the no-flux water table, in the engine by
default and on the transport screen for every run (typed or vadose-fed, `Scenario.top = 'no-flux'`). The
screen's convention matches it: the water table is z = 0, receptors sit at z = -depth and the source box is
[-source thickness, 0]. Two consequences. Callers that built a source box reaching above z = 0 on an
infinitely deep aquifer (z2 > 0) now get a RangeError instead of a whole-space answer, and receptors above
z = 0 report zero; code that needs the whole-space medium (POINT3 comparisons, sources straddling z = 0)
passes `top: 'unbounded'`. A finite thickness is unchanged (its top was always no-flux), and the Wexler
methods are not touched by this change (see the PATCHI note under the modern method).

Finite thickness H (z measured from the base, no-flux top and bottom) replaces fz by the reflected
profile. For D_z' tau / H^2 up to 0.2 the engine sums mirror images 2nH +/- z (only images whose smoothed
interval reaches the point); beyond that it uses the cosine series
(1/H)[1 + 2 sum_n cos(n pi z/H) S_n exp(-n^2 pi^2 D_z' tau/H^2)] with S_n the cosine transform of the
source profile. Both forms agree to rounding and are checked across the switch.

Loading is a list of constant-rate steps (start, end, rate), end = Infinity for a continuous source.
The concentration is the superposition

    C(x,t) = sum over steps of  rate * integral over release age tau in [t - end, t - start] of G(tau) dtau

evaluated with tanh-sinh quadrature (`integrateTanhSinh`), split at the age (x - x_c)/u at which the
advected source centre reaches the point. A pulse is a finite step, time-varying loading is several
steps. A source concentration C_s becomes a mass rate with `massRateFromConcentration`:
rate = C_s times Darcy flux times the source cross-section normal to flow.

Well-screen concentration is the trapezoid average over the screen (`wellScreenAverage`): the two end
points carry half weight.

Plan-view maps use `at123dGrid`: one composite Gauss-Legendre rule in release age (6 points per panel,
panels growing geometrically, 24 per decade) shared by every grid point, so each point costs a product
sum instead of an adaptive integral. The advective peak of the age integrand has relative width
sqrt(2/Pe) with Pe = |x - x_c| u / D_x', so a fixed 24 per decade stops resolving it near Pe = 1e3. The
rule therefore follows the peak: at age tau the density is 24 sqrt(max(1, Pe(tau) / 1e3)) per decade, with
Pe(tau) = u^2 tau / D_x' (`peakFollowingDensity`), applied up to the oldest receptor peak. Measured
against the adaptive point solution at Pe = 1e3, 1e4, 1e5 and 1e6 the grid agrees to 3.5e-8 relative or
better wherever the value exceeds 1e-6 of the source (or of the largest value); far in the pre-arrival
tail, below that level, the steep Gaussian rise inside the last panel limits the match to about 1e-4
relative, which is immaterial in absolute terms. Pe above 1e6 throws a RangeError (use the point
solution). A 100 by 60 map costs about the same as before (about 60 to 100 ms per grid).

Validation (all methods, RangeError): non-finite inputs; porosity outside (0, 1]; retardation below 1;
negative decay rate or dispersion coefficient; non-positive or non-finite thickness; a `top` other than
'unbounded' or 'no-flux', or 'unbounded' together with a thickness (a finite layer always has a no-flux
top); a source box that is not inside the layer (0 <= z1 <= z2 <= H) or, under the default no-flux water
table of an infinitely deep aquifer, not below it (z2 <= 0); non-finite or negative time. `time = Infinity` is not
supported by the AT123D kernel (use the Wexler methods for steady state). Negative velocity is
accepted, the age cut follows (x - x_c)/u for either sign. A receptor outside the finite layer or
aquifer (z outside [0, H], y outside [0, W], or z > 0 under the no-flux water table of an infinitely deep aquifer) reports zero in the
point and grid functions alike instead of a mirrored image.

## Modern method: Wexler (1992) patch sources (`groundwater.wexler1992`; citation `wexler1992`)

A patch [y1,y2] x [z1,z2] on the inflow plane x = 0 is held at c0; the medium is semi-infinite in x.
PATCHI has infinite width and depth; PATCHF has width W (y in [0,W]) and thickness H (z in [0,H]) with
no-flux boundaries. Concentrations at x < 0 are reported as zero.

Open question (not resolved by the AT123D no-flux ruling): PATCHI has no boundary in z, so it carries no
water table. The transport screen places the patch at z in [-source thickness, 0] and receptors at
z = -depth, so PATCHI lets the held concentration diffuse upward through z = 0 and reads low near the water
table relative to a no-flux water table (an image patch [-T, T] gives the no-flux value; a 5 m by 3 m patch
at 60 m gave PATCHI/no-flux ratios of 0.50, 0.63, 0.73 and 0.82 at depths 0, 1.5, 3 and 6 m). PATCHF is
unaffected where the screen uses it (z from the base, patch at [H - T, H], no-flux top at H). The screen
also falls back to PATCHI for a finite thickness without a width, which ignores the top and bottom. No
change has been made to either; it needs its own ruling.

The x kernel is the first-type boundary solution. With beta = sqrt(u^2 + 4 D_x' k) for an effective
decay rate k:

    X(x,t;k) = (1/2) [ exp(x (u - beta) / (2 D_x')) erfc((x - beta t) / (2 sqrt(D_x' t)))
                     + exp(x (u + beta) / (2 D_x')) erfc((x + beta t) / (2 sqrt(D_x' t))) ]

and the steady state (t = Infinity) is exp(x (u - beta) / (2 D_x')). Terms are evaluated as
exp(a) erfc(b) through the scaled complementary error function so large exponents do not overflow.
When the time integral is used at steady state its upper limit is the larger root of
(x - u T)^2 / (4 D T) + k T = 40, that is T = [(x u + 80 D) + sqrt((x u + 80 D)^2 - beta^2 x^2)] / beta^2,
which covers the advective Gaussian tail at every Peclet number (a limit of x/u + 40/(k + u^2/4D) fell
13 to 36 percent short at Pe = 1e3 to 1e5). A huge patch without decay returns c0 to better than 1e-6.

PATCHI is the time integral of the decayed first-passage density times the lateral spreading of the patch:

    C/c0 = integral_0^t  x / (2 sqrt(pi D_x' tau^3)) exp(-(x - u tau)^2 / (4 D_x' tau) - lambda tau)
                         * fy(tau) * fz(tau) dtau

with fy, fz the smoothed-indicator profiles (unnormalised: the erf difference above). PATCHF expands the
patch in cosines over the width and thickness and uses X with the decay raised by the lateral modes:

    C/c0 = sum_n sum_m A_n B_m cos(n pi y/W) cos(m pi z/H) X(x, t; lambda + D_y' (n pi/W)^2 + D_z' (m pi/H)^2)

with A_0 = (y2 - y1)/W, A_n = (2/(n pi)) (sin(n pi y2/W) - sin(n pi y1/W)), and B_m likewise for z. Terms
are added until the bounding envelope falls below 1e-13. Close to the inflow plane the series converges
slowly (the same limitation ANALGWST flags); the engine then falls back to the time integral with
reflected profiles and reports `converged` and `method` in the result. `patchiGrid` and `patchfGrid`
give plan-view grids with the shared time rule.

### Time-varying boundary loading (Wexler and Domenico)

Both patch-source methods accept an optional list of `ConcentrationStep` values `{ start, end, concentration }`
in seconds, `end` possibly Infinity. Unlike the AT123D `LoadingStep`, whose value is a mass rate, the value
here is the concentration held on the source boundary. Without the list the source is continuous at `c0`.
Because the governing equation and the boundary condition are linear in the source, the answer is the sum
over steps of `c_i [F(t - start_i) - F(t - end_i)]`, where `F` is the method's response to a unit constant
boundary concentration and `F(tau) = 0` for `tau <= 0`. At `t = Infinity` a finished step cancels exactly
(contributes zero) and an open-ended step contributes `c_i F(Infinity)`. Steps must be ordered by start,
must not overlap, and carry finite non-negative concentrations (RangeError otherwise). The point
functions, `patchiGrid`/`patchfGrid` (a trailing `loading` argument, one grid per step edge), `domenicoWarnings`
and the `loading` field of the method run inputs all use the same rule, so the Domenico deviation warning
compares the loaded approximate value with the loaded exact value.

## Comparison mode: Domenico (1987) (`groundwater.domenico1987`)

Citations: `domenico1987`, `west2007`, `guyonnet2004`, `srinivasan2007`, `newell1996`. Named in the
registry as a "BIOSCREEN/RBCA-compatible comparison", never the recommended method. With u = v/R and a
vertical planar source of width Y (centred on y = 0) and thickness Z at the water table:

    C = (c0/8) exp[(x/(2 a_x)) (1 - sqrt(1 + 4 lambda a_x/u))] erfc[(x - u t sqrt(1 + 4 lambda a_x/u)) / (2 sqrt(a_x u t))]
          * [erf((y + Y/2)/(2 sqrt(a_y x))) - erf((y - Y/2)/(2 sqrt(a_y x)))]
          * [erf((z + Z)/(2 sqrt(a_z x))) - erf((z - Z)/(2 sqrt(a_z x)))]

(one erfc term, as in BIOSCREEN, matching mibitrans `Bioscreen` to 1e-9). The solution is an approximation
that is exact only for zero longitudinal dispersivity (`srinivasan2007`). The validity warnings emitted by
`domenicoWarnings` (and by the method's `validate`) are:

- `domenico.approximate-longitudinal-dispersion`: a_x > 0. `west2007` report centreline underprediction of
  up to 80 percent for a medium sand, growing with dispersivity, time and dimensionality.
- `domenico.off-centreline-with-decay`: decay on and the point laterally offset (y != 0). `guyonnet2004` report
  good centreline agreement with the rigorous solution but large lateral divergence, especially with decay.
- `domenico.deviates-from-exact`: the computed difference from the exact patch solution (the mirror at the
  water table turns the source into a patch of height 2Z) exceeds 10 percent. The 10 percent threshold is a
  screening choice made here, not a published limit.
- `domenico.outside-domain`: x <= 0, or z < 0 (above the water table; the value is zero, never mirrored).

Domenico needs a finite positive velocity (RangeError otherwise), because the dispersion coefficients and
the exact reference are proportional to it.

The papers give qualitative conditions in their abstracts; no numerical validity thresholds are taken
from them. The quantitative warning is computed directly against the exact solution.

## Verification

- USGS ANALGWST 1.1 (POINT3, PATCHI, PATCHF; `test/fixtures/analgwst/`): every value agrees to the printed
  precision of the program (half a unit in the last decimal).
- mibitrans 1.0.1 (`test/fixtures/mibitrans/`): Domenico agrees with `Bioscreen` to 1e-9; the exact
  solution agrees with `Mibitrans` (Wexler form) to 1e-7 relative.
- Analytic tests: single-release mass conservation (n R times the volume integral equals M exp(-lambda tau)),
  symmetry, 1-D plane-source steady state, closed-form point source, pulse superposition, PATCHF to PATCHI
  as width and thickness grow, series versus integral, image versus cosine series. Under a no-flux water
  table: the profile equals the free-space value plus its mirror about z = 0 to 1e-14, the vertical
  integral over z <= 0 of a plane source on the water table is the released mass to 1e-6 (the unbounded
  medium keeps half), and a continuous point source on the water table is exactly twice POINT3. Omitting
  `top` equals `top: 'no-flux'` exactly, and the POINT3 fixtures and the closed-form kernel tests pass
  `top: 'unbounded'` with their expected values unchanged.
- Timing (Node 24, one run on the development machine): 100 by 60 plan-view grid in about 190 ms for the
  AT123D-class kernel with two loading steps, about 45 ms for PATCHI and about 50 ms for PATCHF.
