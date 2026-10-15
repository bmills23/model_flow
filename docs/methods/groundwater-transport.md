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
sum instead of an adaptive integral. It agrees with the adaptive point solution to about 2e-5 relative.

## Modern method: Wexler (1992) patch sources (`groundwater.wexler1992`; citation `wexler1992`)

A patch [y1,y2] x [z1,z2] on the inflow plane x = 0 is held at c0; the medium is semi-infinite in x.
PATCHI has infinite width and depth; PATCHF has width W (y in [0,W]) and thickness H (z in [0,H]) with
no-flux boundaries. Concentrations at x < 0 are reported as zero.

The x kernel is the first-type boundary solution. With beta = sqrt(u^2 + 4 D_x' k) for an effective
decay rate k:

    X(x,t;k) = (1/2) [ exp(x (u - beta) / (2 D_x')) erfc((x - beta t) / (2 sqrt(D_x' t)))
                     + exp(x (u + beta) / (2 D_x')) erfc((x + beta t) / (2 sqrt(D_x' t))) ]

and the steady state (t = Infinity) is exp(x (u - beta) / (2 D_x')). Terms are evaluated as
exp(a) erfc(b) through the scaled complementary error function so large exponents do not overflow.

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
- `domenico.off-centreline-with-decay`: decay on and the point off the centreline. `guyonnet2004` report
  good centreline agreement with the rigorous solution but large lateral divergence, especially with decay.
- `domenico.deviates-from-exact`: the computed difference from the exact patch solution (the mirror at the
  water table turns the source into a patch of height 2Z) exceeds 10 percent. The 10 percent threshold is a
  screening choice made here, not a published limit.
- `domenico.outside-domain`: x <= 0.

The papers give qualitative conditions in their abstracts; no numerical validity thresholds are taken
from them. The quantitative warning is computed directly against the exact solution.

## Verification

- USGS ANALGWST 1.1 (POINT3, PATCHI, PATCHF; `test/fixtures/analgwst/`): every value agrees to the printed
  precision of the program (half a unit in the last decimal).
- mibitrans 1.0.1 (`test/fixtures/mibitrans/`): Domenico agrees with `Bioscreen` to 1e-9; the exact
  solution agrees with `Mibitrans` (Wexler form) to 1e-7 relative.
- Analytic tests: single-release mass conservation (n R times the volume integral equals M exp(-lambda tau)),
  symmetry, 1-D plane-source steady state, closed-form point source, pulse superposition, PATCHF to PATCHI
  as width and thickness grow, series versus integral, image versus cosine series.
- Timing (Node 24, one run on the development machine): 100 by 60 plan-view grid in about 190 ms for the
  AT123D-class kernel with two loading steps, about 45 ms for PATCHI and about 50 ms for PATCHF.
