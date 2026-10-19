# Uncertainty fixtures

## table-r2.json: Table R-2 (`arcadis2001`), legacy method, loose

Source: Table R-2 of the review of RISC v4.0 (`arcadis2001`), section R.7.2, as reproduced in Appendix R of
the RISC5 user's guide (Nov 2014). Benzene in drinking water at a constant 0.005 mg/L, default adult RME
exposure data, 500 model runs; the two printed columns are RISC v4.0 and a commercial spreadsheet add-in.
Values are entered as printed.

The review does not give the input distributions. The test therefore asserts a shape only (ruling 12):
monotone percentiles, and the 5th, 50th and 95th percentiles within a factor of 3 of the geometric mean of
the two printed columns. The distribution set the test samples (body weight, exposure duration and
drinking-water ingestion rate) is a fixture-only central-tendency assumption, not sourced data: it is not a
product default, it carries no citation, and its spreads were chosen wide enough for the shape check. It is
not a validation of the sampler; the analytic lognormal fixture is.
