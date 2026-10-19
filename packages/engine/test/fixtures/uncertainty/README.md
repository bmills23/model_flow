# Uncertainty fixtures

## table-r2.json: Table R-2 (`arcadis2001`), legacy method, loose

Source: Table R-2 of the review of RISC v4.0 (`arcadis2001`), section R.7.2, as reproduced in Appendix R of
the RISC5 user's guide (Nov 2014). Benzene in drinking water at a constant 0.005 mg/L, default adult RME
exposure data, 500 model runs; the two printed columns are RISC v4.0 and a commercial spreadsheet add-in.
Values are entered as printed.

The review does not give the input distributions, and no cited distribution set has been read yet. The
test is therefore a smoke test (ruling 12): it runs the legacy method on the printed case (concentration and
iteration count from this file) with body weight, exposure duration and drinking-water ingestion rate
sampled, and asserts no failed iteration and monotone, non-degenerate percentiles. The spreads it samples are
scaffolding with no source, not a product default and not a claim about RISC. The printed percentiles are
recorded here but not compared: an earlier factor-of-3 band was met only by widening those unsourced
spreads, so it could not fail and was removed. A comparison waits for sourced distributions
(`roseberry1992` is the candidate for water intake). The analytic lognormal fixture validates the sampler.
