# Uncertainty: Monte Carlo, Latin hypercube, sensitivity and probabilistic cleanup levels (M10)

Status: implemented 2026-10-18 (scope written in stage 1; engine slices E1 to E7 and web slices W1 to W4
done, see the appendix, plus slice E8 for the remaining registry coverage; open item: the unmounted
percentile fan). Since wave I (2026-10-19) the cleanup screen also samples a modeled source: the declared
inputs of the groundwater, vadose or saturated source methods of its chain (never the solved source
concentration) and, for the legacy method, the receptor factors, with every iteration a full modeled solve
on the worker pool and the levels summarised by the same `summarizeCleanup` as the in-line run. Rulings are recorded in `docs/DECISIONS.md`, block "2026-10-18: M10
uncertainty scope (stage 1)"; the ruling numbers below refer to that block. Every ruling marked DEFAULT is
a screening choice open to Bryan's overturn. Equations are written in our own words from the primary
publications; the RISC5 manual is used only as a map of what RISC5 offers.

## What the process is

Every deterministic run in the engine takes point values for exposure factors (body weight, intake rates,
frequencies, durations) and for transport parameters (hydraulic conductivity, gradient, dispersivity,
fraction of organic carbon, decay rate, building parameters). Uncertainty analysis replaces a chosen
subset of those point values with probability distributions, runs the same forward method many times on
sampled inputs, and reports the distribution of the output (risk, hazard quotient, concentration at the
receptor, cleanup level) together with which inputs drive its spread.

## What RISC5 offers (the legacy map)

The manual lists Monte Carlo for human receptor exposure parameters only, with fate and transport held at
point values. Its review appendix (section R.7.2) compares a RISC v4.0 run with a commercial spreadsheet
add-in for benzene in drinking water at a constant 0.005 mg/L, adult RME defaults, 500 iterations, and
prints seven summary statistics (Table R-2). The manual does not state the input distributions used for
that comparison, the sampling scheme beyond random draws, or a seeding rule. Our legacy method reproduces
the scope (exposure parameters only, simple random sampling) and not any undocumented internals.

## Scope of M10

| Item | In M10 | Notes |
|---|---|---|
| Distribution library (constant, uniform, log-uniform, triangular, normal, lognormal, empirical; truncation) | Yes | Inverse-CDF sampling, ruling 3 |
| Parameter registry: methods declare their uncertain inputs | Yes | Ruling 2 |
| Legacy: simple random sampling over exposure parameters only (`uncertainty.srs-exposure`) | Yes | Ruling 4 |
| Modern: Latin hypercube with Iman-Conover rank correlation over exposure and transport parameters (`uncertainty.lhs-ic`) | Yes | Rulings 5 and 6 |
| Variance-based sensitivity: Saltelli 2010 first order, Jansen 1999 total effect, bootstrap intervals (`uncertainty.sobol-saltelli`) | Yes | Ruling 7 |
| Tornado (one at a time swings) and Spearman rank correlations from the sample | Yes | Ruling 8 |
| Percentile fans for time series outputs, CDF and histogram of scalar outputs | Yes | Ruling 9 |
| Probabilistic cleanup levels wrapping the M5 solver | Yes | Ruling 10 |
| Table R-2 case as a smoke test (no comparison with the printed percentiles) | Yes | Ruling 12 |
| Web worker pool, pilot timing and run budget | Yes | Ruling 11 |
| Morris elementary effects screening | Deferred | Ruling 13; Sobol covers the need at our input counts |
| Quasi-random (Sobol low-discrepancy) base sequences for the Sobol design | Deferred | Ruling 7 |
| Two-dimensional Monte Carlo (variability and uncertainty separated) | Deferred | RAGS Volume III Part A describes it; needs a second loop and a UI of its own |
| Distribution fitting to site data, default distribution library from the Exposure Factors Handbook | Deferred | Users enter distributions; a cited preset set is a later data slice |
| Sampling of chemical toxicity values | Deferred | Toxicity values are policy values, not variability |
| Uncertainty for the M7 and M9 processes | Deferred until those land | The registry makes them opt in when they do |
| PVIScreen-style sampling of the vapor methods | Yes, through the registry | M6 deferred it here; the vapor methods declare inputs like any other process |

## Units and notation

Inside the engine every sampled value is in SI, as the method that consumes it expects. Distributions are
entered in the units the form shows and converted at the boundary with the existing unit layer, so a
lognormal entered in L/day is converted by scaling its location (a lognormal stays lognormal under a
positive scale) and a normal by scaling its mean and standard deviation.

- k: number of uncertain inputs; n: number of iterations (rows of the sample).
- X: the n by k sample matrix; x_ij its entry for iteration i and input j.
- F_j and F_j^-1: cumulative distribution function and its inverse for input j.
- Y = f(X): the model output, scalar or a time series.
- Phi and Phi^-1: the standard normal distribution function and its inverse.

## Distributions and inverse-CDF sampling (ruling 3)

Every input is sampled as x = F^-1(u) with u in (0, 1) from the sampling design. The library:

| Kind | Parameters | Inverse |
|---|---|---|
| constant | value | value |
| uniform | a, b | a + u (b - a) |
| log-uniform | a, b (both positive) | exp(ln a + u (ln b - ln a)) |
| triangular | a, mode m, b | a + sqrt(u (b - a)(m - a)) when u < (m - a)/(b - a), else b - sqrt((1 - u)(b - a)(b - m)) |
| normal | mean mu, standard deviation s | mu + s Phi^-1(u) |
| lognormal | geometric mean g, geometric standard deviation gs (or arithmetic mean and standard deviation, converted) | g gs^Phi^-1(u) |
| empirical | sorted values with cumulative probabilities | piecewise-linear interpolation of the inverse |

Truncation to [lo, hi] maps u to F(lo) + u (F(hi) - F(lo)) before inversion, so truncation never rejects
draws and the stratification of a Latin hypercube survives it. Arithmetic moments of a lognormal convert by
sigma^2 = ln(1 + s^2/m^2) and mu = ln m - sigma^2/2, with g = exp(mu) and gs = exp(sigma).

Phi^-1 uses Wichura's algorithm AS 241 (`wichura1988`), accurate to about 1e-16 relative, added to
`packages/engine/src/numerics/special.ts`. Every input also carries the physical bounds its method
declares (a positive body weight, a fraction between 0 and 1); a distribution whose support leaves those
bounds must be truncated to them, otherwise the run is refused (`uncertainty.support-outside-bounds`).

## The parameter registry (ruling 2)

A process opts into uncertainty by declaring its uncertain inputs on its method descriptor, next to the
existing `validate` and `run`:

```
uncertainInputs?: readonly UncertainInput<I>[]

interface UncertainInput<I> {
  id: string;                  // stable dotted path, e.g. 'exposure.receptor.bw'
  label: string;               // form label
  unit: string;                // SI unit of the value get and set exchange
  category: 'exposure' | 'transport' | 'site' | 'chemical';
  bounds: [number, number];    // physical support, inclusive
  get(input: I): number;       // the point value in this input
  set(input: I, value: number): I; // returns a new input; never mutates
}
```

A run specification is the base input plus a map from input id to distribution (and, for the modern
method, a rank correlation matrix over a subset of those ids). The sampler builds X, and for each row
applies `set` for every sampled id to a copy of the base input, then calls the method's `run`. The legacy
method accepts only ids whose category is `exposure`; the modern method accepts all four. A chain (the M5
modeled chains, or a transport method feeding exposure) exposes the union of its links' inputs with the
link prefix in the id, so one sample drives the whole chain consistently. The registry test asserts that
every declared id is unique per method, that `set` followed by `get` returns the value, and that `set`
leaves the original input unchanged.

## Legacy method: simple random sampling, exposure parameters only (`uncertainty.srs-exposure`)

For i = 1..n and each input j draw u_ij independently from the seeded generator and set x_ij = F_j^-1(u_ij).
Inputs are independent (no correlation). Outputs are the sorted sample with summary statistics: minimum,
the 5th, 25th, 50th, 75th, 90th and 95th percentiles, maximum, arithmetic mean and standard deviation. The
default n is 500, the count the Table R-2 comparison used (ruling 4, DEFAULT). Citations: `epa1997mc`,
`rags3a2001`, `blackman2021`, `wichura1988` (the normal and lognormal inverse CDF) and `hyndmanfan1996` (the
reported percentiles).

## Modern method: Latin hypercube with Iman-Conover rank correlation (`uncertainty.lhs-ic`)

### Latin hypercube (McKay, Beckman and Conover 1979)

Each input's probability range is split into n equal strata; one u is drawn uniformly inside each stratum
and the strata are randomly permuted per input, independently across inputs. The engine already has this
as `latinHypercube(n, dims, rng)` in `packages/engine/src/numerics/random.ts`. Mapping each column through
F_j^-1 gives every marginal exactly one draw per stratum, which estimates means and central percentiles of
monotone outputs with far less variance than simple random sampling at the same n.

### Rank correlation (Iman and Conover 1982)

The user gives a target rank correlation matrix C over the correlated inputs (symmetric, unit diagonal).
The method reorders the already sampled columns so their rank correlation approaches C while every
marginal stays exactly as sampled:

1. Build an n by k score matrix R whose columns are independent random permutations of the van der
   Waerden scores Phi^-1(i/(n+1)), i = 1..n, each column standardised.
2. Compute the sample correlation T of R (k by k) and the Cholesky factors T = Q Q' and C = P P'.
3. Form R* = R (P Q^-1)'. The columns of R* have correlation C exactly (in the Pearson sense on the
   scores), which carries to approximately C in rank correlation.
4. For each input j, rearrange the sorted sampled values of column j so their ranks equal the ranks of
   column j of R*.

Because step 4 only permutes, LHS stratification and every marginal are preserved exactly. Using the
sample correlation T (rather than assuming T = I) removes the chance correlation of the random scores.
Checks: C must be positive definite (Cholesky succeeds); otherwise the run is refused with
`uncertainty.correlation-not-positive-definite`. n must exceed k; with n < 5k the achieved correlation is
noisy and `uncertainty.small-sample-correlation` is warned. The achieved Spearman matrix is reported next to
the target. Default n is 1000 (ruling 5, DEFAULT). Citations: `mckay1979`, `imanconover1982`, `epa1997mc`,
`rags3a2001`, `blackman2021`, `wichura1988`, `hyndmanfan1996`.

### Sampling over transport parameters (ruling 6)

Transport inputs are sampled through the same registry; each iteration runs the full deterministic chain
(transport to the receptor, then exposure and risk). Runs whose deterministic validity checks raise a
refusal (for example a sampled dispersivity making a solver input invalid) are not silently dropped: the
iteration is recorded as failed, the failure count and the first codes are reported, and when more than 1
percent of iterations fail the run is flagged `uncertainty.failed-iterations` (DEFAULT). Percentiles are
computed over the successful iterations and the fraction is shown.

## Percentiles and summaries (ruling 9)

Sample percentiles use the linear interpolation between order statistics (definition 7 in
`hyndmanfan1996`): for sorted y_(1..n) and probability p, h = (n - 1) p + 1, the value is
y_(floor h) + (h - floor h)(y_(floor h + 1) - y_(floor h)). Time series outputs (the concentration at the
well, indoor air over time, risk by exposure start) are summarised per time point into a percentile fan
(5, 25, 50, 75, 95) with the deterministic base curve overlaid; scalar outputs get an empirical CDF and a
histogram on log axes when the output spans more than two decades.

## Variance-based sensitivity: Sobol indices (`uncertainty.sobol-saltelli`, ruling 7)

For independent inputs the variance of Y splits into contributions of each input and their interactions
(`sobol1993`, `sobol2001`). The first order index S_j = V(E(Y | X_j)) / V(Y) is the share of variance input
j explains alone; the total index ST_j = E(V(Y | X_~j)) / V(Y) is the share it explains including all its
interactions.

Estimator (Saltelli et al. 2010 design, `saltelli2010`; total effect after Jansen 1999, `jansen1999`):

1. Draw two independent N by k matrices A and B of u values, mapped through F^-1.
2. For each j form A_B^(j): A with column j taken from B.
3. Evaluate f(A), f(B) and f(A_B^(j)) for every j: N (k + 2) model runs.
4. V = the sample variance of the 2N values f(A) and f(B) together, and m their mean.
5. S_j = (1/N) sum_i (f(B)_i - m) (f(A_B^(j))_i - f(A)_i) / V. Centring f(B) on m leaves the expectation
   unchanged, because f(A_B^(j)) - f(A) has mean zero, but it removes noise that otherwise grows with the
   size of the output mean: uncentred, a log10 risk near -6 swamps the indices and no N clears the
   convergence flag. Every bootstrap resample recomputes V and m over its own rows.
6. ST_j = (1/(2N)) sum_i (f(A)_i - f(A_B^(j))_i)^2 / V.

Choices (all DEFAULT): A and B are two independent Latin hypercube designs from separate seeded streams
(the low-discrepancy Sobol sequence the 2010 paper recommends is deferred); N defaults to 512, so 10 inputs
cost 6144 runs. Indices are computed on log10 Y by default because risk outputs are close to lognormal and a
raw-scale variance is dominated by the upper tail; the raw scale is an option, and a sample with any Y <= 0
falls back to raw with `uncertainty.sobol-log-nonpositive`. Convergence: 95 percent intervals from 500
seeded bootstrap resamples of the N rows; an index whose interval half-width exceeds 0.05 is flagged
`uncertainty.sobol-not-converged` with the advice to double N. Sobol indices assume independent inputs:
when a correlation matrix is given the indices are computed with correlations removed and
`uncertainty.sobol-correlated-inputs` is warned. Negative first order estimates within their interval of
zero are shown as zero with the raw value in the table.

## Tornado chart (ruling 8)

One input at a time: every other input stays at its deterministic base value and input j is set to its
5th and then its 95th percentile; the bar is the output range, inputs sorted by swing, base output as the
centre line. Cost 2k runs. The tornado is a local, one-at-a-time view and is labelled so; next to it the
modern run shows the Spearman rank correlation of each input with the output from the LHS sample, a
global but monotone-only view, and the Sobol bars when that analysis was run.

## Probabilistic cleanup levels (ruling 10)

M5 solves, for one parameter set, the source concentration C* at which the receptor metric (risk, hazard
index, concentration at the well) equals the target, using Brent on ln C with the verified linear shortcut
(`docs/methods/cleanup-levels.md`, "Root finding"). M5 also guarantees the metric is monotone increasing in
the source concentration for every covered chain. For sampled parameters theta_i that monotonicity gives,
per iteration, metric_i(C) <= target exactly when C <= C*_i. So the fraction of the sampled population
protected at a source concentration C is the fraction of C*_i at or above C, and the level that protects a
fraction p of the population is the (1 - p) sample quantile of the C*_i.

Algorithm: sample theta_i (LHS, Iman-Conover); call the M5 solver per iteration to get C*_i (closed form for
direct pathways and linear chains, Brent otherwise); report the distribution of C*_i and the level at
p = 0.95 (DEFAULT, the RME-like protection percentile; 0.5 and 0.9 also shown). An iteration whose target is
not reachable below the cap has C*_i at or above the cap; it is kept as censored at the cap and counted
(`uncertainty.cleanup-censored`), which leaves the low quantiles we report exact unless the quantile itself
falls on the cap, in which case the level is reported as "not reachable below the cap" as in M5. Cumulative
and equal allocation are solved per iteration exactly as M5 does for one parameter set (the caller passes a
`solve` function that wraps `solveModeled` for the chemical of interest; the runner itself takes a plain
M5 `SolveInput` builder). Cost: n solves; for
Brent chains about 10 to 20 forward runs each, so the run budget (ruling 11) counts forward runs, not
iterations.

## Seeding and reproducibility (ruling 11)

Every run takes a seed (string or integer, shown and editable in the form; default derived from nothing
random, the literal `model-flow`). Independent streams are derived by hashing the seed with a purpose
label (`<seed>:lhs`, `<seed>:ic`, `<seed>:sobol-A`, `<seed>:sobol-B`, `<seed>:bootstrap`) through the
existing `Xoshiro128ss` string constructor (`blackman2021`). The whole sample matrix is generated before
any model run, on one thread, and rows are then distributed to workers; results are written back by row
index. So the output is bit-identical for the same seed, n, inputs and engine version, regardless of the
number of workers or their completion order. A test runs the same specification with one and with four
chunks and compares exactly.

## Runtime budget in the browser (ruling 11)

Runs execute in a pool of web workers (size min(4, hardwareConcurrency - 1), at least 1), each holding the
engine bundle, receiving row chunks of 50 and posting progress; the run can be cancelled. Before a run the
coordinator times 5 pilot rows (run alone on one worker, kept as the first rows of the result) and projects the
total as the mean per-row model time times the rows, divided by the pool size; projected time above 60 s asks the user to confirm
or reduce n, and above 10 minutes the run is refused with the projection shown. Chains flagged numerical
by M5 (`cleanup.numerical-chain`, the layered finite-volume column) are labelled as expensive in the form.
The engine runner is a pure function over rows so the same code runs in Vitest without workers.

## Validity checks and warning codes

| Code | Category | When |
|---|---|---|
| `uncertainty.support-outside-bounds` | refusal | an untruncated distribution's support leaves the input's declared bounds |
| `uncertainty.bad-distribution` | refusal | parameters invalid (b <= a, mode outside [a, b], s <= 0, gs <= 1, empirical not monotone) |
| `uncertainty.category-not-allowed` | refusal | the legacy method given a non-exposure input |
| `uncertainty.correlation-not-positive-definite` | refusal | Cholesky of C fails, or C not symmetric with unit diagonal |
| `uncertainty.small-sample-correlation` | warning | correlated run with n < 5k |
| `uncertainty.failed-iterations` | warning | more than 1 percent of iterations refused by the deterministic checks |
| `uncertainty.sobol-not-converged` | warning | a bootstrap half-width above 0.05 |
| `uncertainty.sobol-log-nonpositive` | warning | log scale requested with an output at or below zero |
| `uncertainty.sobol-correlated-inputs` | warning | Sobol run with correlations given |
| `uncertainty.cleanup-censored` | warning | a probabilistic cleanup iteration not reachable below the cap |
| `uncertainty.run-budget` | refusal | projected runtime above the hard cap |
| `uncertainty.unknown-input` | refusal | a distribution is given for an id the method does not declare |
| `uncertainty.bad-specification` | refusal | no distributions, n not a positive integer, correlation on the legacy method, or a correlated id without a distribution |
| `uncertainty.non-finite-output` | iteration failure | the model returned, or the output extractor produced, a value that is not finite; counted with the failed iterations |

## Coupling

- Exposure and risk (M4): the receptor factors (body weight, intake rates, skin areas, frequencies,
  durations) are the legacy method's universe and the modern method's exposure category.
- Transport (M1, M2, M3, M6, M8): each registered method declares its transport and site inputs; a chain
  prefixes them by link.
- Cleanup (M5): the probabilistic level calls the M5 solver per iteration through its public `solve` entry
  point; no change to M5's numerics.
- Web: a shared `#/uncertainty` panel embedded per screen (exposure, cleanup first) rather than a separate
  model, so the distributions apply to the same base inputs the screen shows.

## Fixture plan and tolerances

1. **Sampling exactness.** LHS: every column has exactly one value per stratum (exact). Iman-Conover: each
   column after reordering is a permutation of the column before (exact).
2. **Distributions.** For each kind, n = 10000 SRS with a fixed seed: Kolmogorov-Smirnov distance to the
   analytic CDF below 1.63 / sqrt(n) (the 1 percent critical value); truncated variants respect the bounds
   exactly. AS 241: Phi^-1(Phi(z)) = z to 1e-14 for z in [-8, 8].
3. **Analytic lognormal risk.** Risk linear in a product of lognormal factors divided by a lognormal body
   weight is lognormal with sigma^2 the sum of the sigma^2: at n = 10000 the 5th, 50th and 95th percentiles
   within 2 percent (LHS) and 5 percent (SRS) of the analytic values.
4. **Rank correlation.** k = 3, target Spearman 0.7, -0.3, 0 at n = 1000: achieved within 0.05 absolute.
5. **Sobol.** Ishigami function (`ishigami1990`, a = 7, b = 0.1, inputs uniform on [-pi, pi]) on the raw
   scale with analytic indices computed in the test from the closed-form variances; N = 8192, tolerance
   0.03 absolute on every S_j and ST_j. A linear additive model Y = sum a_j X_j with S_j = ST_j =
   a_j^2 s_j^2 / sum a_l^2 s_l^2, tolerance 0.02.
6. **Probabilistic cleanup identity.** For a direct pathway with lognormal factors, C* is analytic and its
   (1 - p) quantile matches within 2 percent; a forward run at the reported level gives an exceedance
   fraction within the binomial 99 percent band around 1 - p.
7. **Reproducibility.** Same seed, one chunk versus four chunks: bit-identical outputs.
8. **Table R-2 case (smoke test, ruling 12).** Benzene in drinking water at the printed 0.005 mg/L, legacy
   adult RME point values, the printed 500 iterations, legacy method with body weight, exposure duration and
   water ingestion rate sampled. The manual does not give the input distributions, and no cited distribution
   set has been read yet (`roseberry1992` is the candidate for water intake, its full text not read), so the
   test samples scaffolding spreads with no source and asserts only that the method runs from the registry
   over the three factors with no failed iteration and monotone, non-degenerate percentiles. It makes no
   comparison with the printed percentiles: with unsourced spreads any band could be met by tuning them, so a
   band would prove nothing. A comparison waits for sourced distributions. The printed values stay in the
   fixture file with the citation `arcadis2001`.

## Where the manual is silent, and what we chose

| Gap | Choice |
|---|---|
| Input distributions behind Table R-2 | Not reproduced; smoke test only, no comparison (ruling 12) |
| Iteration count default | 500 for the legacy method, matching the comparison (ruling 4) |
| Seeding | Explicit, shown, reproducible (ruling 11) |
| Transport parameters | Legacy keeps them fixed; modern samples them (ruling 6) |

## References

`epa1997mc`, `rags3a2001`, `mckay1979`, `imanconover1982`, `sobol1993`, `sobol2001`, `saltelli2010`,
`jansen1999`, `ishigami1990` (fixture), `hyndmanfan1996`, `wichura1988`, `blackman2021`, `roseberry1992`
(candidate data), `arcadis2001` (fixture), `morris1991` (deferred). The 2026-10-18 additions and the four
title corrections (`mckay1979`, `imanconover1982`, `saltelli2010`, `morris1991`) were verified through
Crossref; full texts were not read in stage 1. `sobol1993` keeps its descriptor title (no DOI found in
stage 1). A reference is flipped to `used` when a registered method cites it: `epa1997mc`, `rags3a2001`, `mckay1979`,
`imanconover1982`, `wichura1988`, `hyndmanfan1996` and `blackman2021` are `used` since slice E4, and
`saltelli2010`, `jansen1999` and `sobol2001` since slice E5 (`brent1973` was already `used` by M5, and E6 cites it again); the rest stay `planned` (or `fixture`) until a
slice cites them (`sobol1993` is not cited by code: its title is still a descriptor).

## Appendix: slice plan for stages 2 and 3

Engine (each one worker, TDD):

- **E1 Distributions and AS 241 (done).** `numerics/special.ts` Phi^-1, `processes/uncertainty/distributions.ts`
  (library, truncation, unit conversion, checks). Fixtures 2. No dependency.
- **E2 Parameter registry (done).** `uncertainInputs` on `MethodDescriptor`, declarations for the M4 exposure
  methods (the M1 groundwater declarations were planned here but made in E8), chain prefixing,
  registry tests. Depends on nothing; E4 needs it.
- **E3 Samplers (done).** SRS, LHS mapping, Iman-Conover with Cholesky, seed streams, percentiles (definition 7).
  Fixtures 1, 3, 4. Depends on E1.
- **E4 Runner and the two registered methods (done).** `uncertainty.srs-exposure`, `uncertainty.lhs-ic`, row
  runner with failure accounting, chunk-invariance test, Table R-2 smoke test. Depends on E2, E3.
- **E5 Sensitivity (done).** Saltelli and Jansen estimators, bootstrap, tornado, Spearman, the registered
  `uncertainty.sobol-saltelli`. Fixture 5. Depends on E3 and E4.
- **E6 Probabilistic cleanup (done).** Wrap M5's solver per iteration, censoring, protection percentile, the
  registered `uncertainty.cleanup-probabilistic`. Fixture 6. Depends on E4.
- **E7 Registry coverage (done).** Declarations for the M2, M3, M6 and M8 methods (`vadose.vadsat`,
  `vadose.layered`, `saturatedSource.two-region`, `saturatedSource.exponential`, the seven `vapor.*` methods,
  `outdoorAir.box`, `outdoorAir.ssg-vf-1996`, `surfaceWater.well-mixed`, `surfaceWater.mass-discharge`) through
  the `pathInput` helper. E2 named the M1 groundwater methods but declared only the exposure methods; E8 closes
  that gap. Depends on E2.
- **E8 Registry coverage, remainder (done).** Declarations through the same `pathInput` helper for the M1
  groundwater methods (`groundwater.at123d`, `groundwater.wexler1992`, `groundwater.domenico1987`, and the three
  `dispersivity.*` correlations through the transport distance), the M7 methods (`shower.fc-1986`,
  `shower.little-1992`, `shower.rsl-household`, `irrigation.sprinkler-fc`, `irrigation.pathways`,
  `particulate.box-emission`, `particulate.ssg-pef-1996`, `particulate.ssg-pef-2002`) and the M9 methods
  (`plantUptake.trapp-matthies-1995`, `plantUptake.hhrap-2005`, `eco.ecossl-2005`, `eco.benchmark-hq`, `tph.tphcwg`,
  `tph.madep`). Not declared: molecular weights, switches and flags, receptor and station names, citations,
  observation points and evaluation times, the TPH mass fractions (one composition that must sum to one, so
  independent draws would break it) and the water viscosities and calibration temperature of the shower
  temperature correction (constants of water). Loading steps, benchmarks, wildlife receptors, food items and TPH
  fractions declare a fixed number of slots (4, 4, 2, 4 and 8); a base with fewer reads NaN for the rest. Depends on E7.

Web (each one worker; verify at 390x844 through CDP, light and dark):

- **W1 Worker pool and budget (done).** Pool, chunking, progress, cancel, pilot timing, in `apps/web/src/uncertainty/`
  (no screen; W3 puts the confirm dialog and progress bar on the exposure screen). Depends on E4.
- **W2 Distribution editor and correlation matrix input (done).** `DistributionEditor` and its pure logic in
  `apps/web/src/uncertainty/` (`editor.ts`): per-input distribution rows from the registry, CDF preview, pairwise
  rank correlation entry with the positive definite check; not mounted on a screen yet (W3 places it on the
  exposure screen). Depends on E1, E2.
- **W3 Results (done).** `UncertaintyPanel` on the exposure screen (`RiskUncertainty`): distribution editor, seed,
  iterations, sampling choice, optional Sobol, confirm dialog and progress bar over the W1 pool, then summary table,
  CDF, histogram (log bins past two decades), one-at-a-time tornado, Spearman bars and Sobol bars with intervals
  (`ResultsCharts`, pure data in `resultsData.ts`). The percentile fan component exists and is tested, but no exposure
  output is a time series, so it is not shown on a screen yet. Only the legacy exposure method declares inputs, so the
  panel samples its receptor factors. Depends on W1, W2, E5.
- **W4 Probabilistic cleanup panel (done)** on `#/cleanup` (`CleanupUncertainty`): pick a chemical and medium, give
  the legacy receptor factors distributions (the W2 editor), choose the protected fraction (95 percent default),
  iterations and seed; the panel reports the 50, 90 and chosen protection levels in the screen unit beside the
  deterministic level, the CDF and histogram of the solved levels, the censored count and the Spearman rank
  correlation of each input with the level. Direct-pathway sources only: a modeled source (dissolved, vadose,
  saturated) is not sampled: the engine now declares the transport inputs (E7, E8), but no screen builds the
  transport chain around the cleanup solver yet, so the panel still samples the legacy receptor factors only.
  Depends on W3, E6.
