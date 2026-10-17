# Surface water fixtures

Validation data for the M8 surface water and sediment methods (`docs/methods/surface-water.md`, "Fixture
plan"). Test inputs only, not a product database. Numeric values only; no tables or prose are reproduced.

## r8.json: Table R-8 of the RISC review (`arcadis2001`)

Legacy river and lake cases. Bed conductivity 10 m/d, f_oc 0.01, discharge thickness 5 m (the table's
"depth of SW", read as d because it reproduces the printed mass flux), reach 100 m, bed gradient 0.05,
river cross-section 5 m^2, lake volume 100,000 m^3, mixing fraction 1 (river) and 0.1 (lake), upstream
flow 180 m^3/d, decay 0 (river) and 0.005 /d (lake), benzene 5 mg/L in groundwater, zero background. The
table lists no Koc; the RISC4 benzene value (59 mL/g, `spence2001`) is a fixture input for this case only.
Printed: Q_gw 250 m^3/d, flux 1.25e6 mg/d, river 2.91 mg/L, lake 3.93 mg/L, sediment 2.95 mg/kg. Tolerance
half a unit in the last printed digit. The review reports exact agreement between RISC and its hand
calculation, so this reproduces arithmetic, not model accuracy.

## manual-l4.json: Appendix L worked examples (RISC5 manual)

River (upstream 900 m^3/d, groundwater 100 m^3/d at 316 mg/L, decay 0.05 /d, reach 100 m, cross-section
5 m^2) prints 30.8 mg/L; lake (volume 50,000 m^3, groundwater 100 m^3/d at 316 mg/L, upstream 100 m^3/d,
decay 0.05 /d, f = 1) prints 11.7 mg/L. Half a unit in the last printed digit. The adjusted-volume lake
example is not used because its printed result is not reproduced by its own stated form.
