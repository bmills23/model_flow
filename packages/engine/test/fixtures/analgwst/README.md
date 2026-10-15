# ANALGWST fixtures

Reference outputs from the USGS ANALGWST analytical solute-transport programs (Wexler 1992), used to
validate the Wexler (PATCHI, PATCHF) and point-source kernels in `packages/engine`.

- Software: ANALGWST version 1.1 (1996/04/03), programs POINT3, PATCHI and PATCHF.
- Download: https://water.usgs.gov/software/ANALGWST/code/UNIX/analgwst.1.source.tar.gz
- Retrieved: 2026-10-15.
- Licence: U.S. Geological Survey software, released into the public interest under the USGS "User
  Rights Notice" shipped as `NOTICE` in the distribution (free use, copy, modify and distribute; no
  warranty; acknowledge the authors and the USGS). The Fortran source is not vendored here; only our own
  input decks and the programs' numeric output are committed.
- Compile (gfortran 15.1.0, Homebrew): graphics are replaced by empty stubs for `PLOT2D` and `DGDISS`
  (plot control is 0 in every deck) and the dummy `locsubs.DMY.f` supplies the date and time routines
  (so the "PROGRAM RUN ON" stamp in the `.prt` files is a fixed dummy, not a real date):
  `gfortran -std=legacy -fallow-argument-mismatch -O1 -w -fno-automatic -I. <prog>.f [glqpts.f for patchi]
  ofile.f title.f lenchr.f locsubs.DMY.f stub.f rdplot.f subs3.f exerfc.f -o <prog>`
- Validation of the build: the shipped sample problems 10 (PATCHF) and 11 (PATCHI) were rerun with plotting
  off and reproduce the shipped `.prt` files byte for byte apart from the run stamp.
- Reproduce: `python3 -I build_fixtures.py <bin_dir> <glq.pts> <out_dir>` (PATCHI reads `GLQ.PTS`,
  shipped as `bin_data/glq.pts`).

Files per case: `<case>.dat` (input deck), `<case>.prt` (raw program output), `<case>.json` (parsed
concentrations as `results[i] = {t, z, c[ix][iy]}`). Units: metres, days, mg/L.

| Case | Program | Notes |
|---|---|---|
| point3-nodecay, point3-decay | POINT3 | continuous point source in an infinite aquifer; decay 0 and 0.03 per day |
| patchi-nodecay, patchi-decay | PATCHI | patch on the inflow plane, infinite width and depth; decay 0 and 0.01 per day |
| patchf-nodecay, patchf-decay | PATCHF | 60 m wide, 10 m thick aquifer, no-flux sides, top and bottom; decay 0 and 0.01 per day |

Printed precision limits comparison: POINT3 and PATCHI print six decimals, PATCHF five. PATCHI uses a
104-point Gauss-Legendre rule and PATCHF a 350-term series, so tolerances are set in the tests that
read these files.
- Source archive sha1: 046969528600274d49a6e406856d21d4bae973e4 (analgwst.1.source.tar.gz).
