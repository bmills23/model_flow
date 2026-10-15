"""Build ANALGWST fixtures: write input decks, run the compiled USGS programs, parse outputs to JSON.

Usage: python3 -I build_fixtures.py <bin_dir> <glq_pts> <out_dir>
Reproduces the committed files in packages/engine/test/fixtures/analgwst/ (the .json files byte for byte
only after `prettier --write`; the content is identical).
"""
import json, os, re, subprocess, sys

bin_dir, glq, out = sys.argv[1:4]
os.makedirs(out, exist_ok=True)

def f10(v):
    s = ('%.6g' % v)
    assert len(s) <= 10, s
    return s.rjust(10)

def rows8(vals):
    lines = []
    for i in range(0, len(vals), 8):
        lines.append(''.join(f10(v) for v in vals[i:i + 8]))
    return lines

def i4(*vals):
    return ''.join(str(v).rjust(4) for v in vals)

def deck(title, prog, p):
    L = [title, 'Generated for model_flow fixtures; units: metres and days.', '====']
    if prog == 'point3':
        L.append(i4(len(p['x']), len(p['y']), len(p['z']), len(p['t']), 0))
        L.append(''.join(u.ljust(10) for u in ['MG/L', 'M/D', 'M**2/D', 'PER DAY', 'METERS', 'M**3/D', 'DAYS']))
        L.append(''.join(f10(v) for v in [p['c0'], p['v'], p['dx'], p['dy'], p['dz'], p['dk']]))
        L.append(''.join(f10(v) for v in [p['xc'], p['yc'], p['zc'], p['qm'], p['por']]))
    elif prog == 'patchi':
        L.append(i4(len(p['x']), len(p['y']), len(p['z']), len(p['t']), p['nmax'], 0))
        L.append(''.join(u.ljust(10) for u in ['MG/L', 'M/D', 'M**2/D', 'PER DAY', 'METERS', 'DAYS']))
        L.append(''.join(f10(v) for v in [p['c0'], p['v'], p['dx'], p['dy'], p['dz'], p['dk']]))
        L.append(''.join(f10(v) for v in [p['y1'], p['y2'], p['z1'], p['z2']]))
    else:
        L.append(i4(len(p['x']), len(p['y']), len(p['z']), len(p['t']), p['nmax'], p['mmax'], 0))
        L.append(''.join(u.ljust(10) for u in ['MG/L', 'M/D', 'M**2/D', 'PER DAY', 'METERS', 'DAYS']))
        L.append(''.join(f10(v) for v in [p['c0'], p['v'], p['dx'], p['dy'], p['dz'], p['dk']]))
        L.append(''.join(f10(v) for v in [p['w'], p['h'], p['y1'], p['y2'], p['z1'], p['z2']]))
    for key in ['x', 'y', 'z', 't']:
        L.extend(rows8(p[key]))
    return '\n'.join(L) + '\n'

def parse(prt, p, prog):
    """Return nested dict c[t][z] = list over x of list over y."""
    nx, ny = len(p['x']), len(p['y'])
    lines = open(prt).read().split('\n')
    out = []
    blocks = []
    cur = None
    for ln in lines:
        if 'SOLUTE CONCENTRATION AT TIME' in ln:
            cur = []
            blocks.append(cur)
            continue
        if cur is None:
            continue
        m = re.match(r'^\s+(-?\d+\.\d+)\s+!(.*)$', ln)
        if m and len(m.group(2).strip()) > 0:
            vals = m.group(2)
            if prog == 'patchf':
                vals = vals[1:]
                grp = [vals[i:i + 12] for i in range(0, len(vals), 12) if vals[i:i + 12].strip()]
                assert all(g[-1] in ' ' for g in grp), 'non-converged series flagged with *'
                nums = [float(g[:11]) for g in grp]
            else:
                nums = [float(vals[i:i + 12]) for i in range(0, len(vals), 12) if vals[i:i + 12].strip()]
            cur.append((float(m.group(1)), nums))
    assert len(blocks) == len(p['t']) * len(p['z']), (len(blocks), prt)
    res = []
    bi = 0
    for ti, t in enumerate(p['t']):
        for zi, z in enumerate(p['z']):
            rows = blocks[bi]; bi += 1
            assert len(rows) % nx == 0
            grid = [[None] * ny for _ in range(nx)]
            col = 0
            for pg in range(len(rows) // nx):
                chunk = rows[pg * nx:(pg + 1) * nx]
                w = len(chunk[0][1])
                for ix, (xv, nums) in enumerate(chunk):
                    assert abs(xv - p['x'][ix]) < 1e-3
                    for j, v in enumerate(nums):
                        grid[ix][col + j] = v
                col += w
            assert all(v is not None for r in grid for v in r)
            res.append({'t': t, 'z': z, 'c': grid})
    return res

X = [5, 10, 15, 20, 25, 30, 35, 40, 45]
cases = {
  'point3-nodecay': ('point3', 'POINT3 continuous point source, no decay', dict(
      c0=1000, v=0.5, dx=1.0, dy=0.2, dz=0.05, dk=0.0, xc=0, yc=0, zc=0, qm=0.5, por=0.3,
      x=X, y=[-9, -6, -3, 0, 3, 6, 9], z=[0, 1.5, 3], t=[20, 100])),
  'point3-decay': ('point3', 'POINT3 continuous point source, first-order decay', dict(
      c0=1000, v=0.5, dx=1.0, dy=0.2, dz=0.05, dk=0.03, xc=0, yc=0, zc=0, qm=0.5, por=0.3,
      x=X, y=[-9, -6, -3, 0, 3, 6, 9], z=[0, 1.5, 3], t=[20, 100])),
  'patchi-nodecay': ('patchi', 'PATCHI patch source, infinite width and depth, no decay', dict(
      c0=1000, v=0.5, dx=2.0, dy=0.4, dz=0.1, dk=0.0, y1=-10, y2=10, z1=0, z2=4, nmax=104,
      x=[1, 2, 5, 10, 20, 30, 40, 60], y=[-15, -10, -5, 0, 5, 10, 15], z=[-2, 0, 2, 4, 6], t=[40, 200])),
  'patchi-decay': ('patchi', 'PATCHI patch source, infinite width and depth, first-order decay', dict(
      c0=1000, v=0.5, dx=2.0, dy=0.4, dz=0.1, dk=0.01, y1=-10, y2=10, z1=0, z2=4, nmax=104,
      x=[1, 2, 5, 10, 20, 30, 40, 60], y=[-15, -10, -5, 0, 5, 10, 15], z=[-2, 0, 2, 4, 6], t=[40, 200])),
  'patchf-nodecay': ('patchf', 'PATCHF patch source, finite width 60 m and thickness 10 m, no decay', dict(
      c0=1000, v=0.5, dx=2.0, dy=0.4, dz=0.1, dk=0.0, w=60, h=10, y1=20, y2=40, z1=2, z2=6, nmax=350, mmax=350,
      x=[5, 10, 20, 30, 40, 60], y=[0, 10, 15, 20, 30, 40, 45, 50, 60], z=[0, 2, 4, 6, 8, 10], t=[40, 200])),
  'patchf-decay': ('patchf', 'PATCHF patch source, finite width 60 m and thickness 10 m, first-order decay', dict(
      c0=1000, v=0.5, dx=2.0, dy=0.4, dz=0.1, dk=0.01, w=60, h=10, y1=20, y2=40, z1=2, z2=6, nmax=350, mmax=350,
      x=[5, 10, 20, 30, 40, 60], y=[0, 10, 15, 20, 30, 40, 45, 50, 60], z=[0, 2, 4, 6, 8, 10], t=[40, 200])),
}
work = os.path.join(out, '_work')
os.makedirs(work, exist_ok=True)
subprocess.run(['cp', glq, os.path.join(work, 'GLQ.PTS')], check=True)
for name, (prog, title, p) in cases.items():
    dpath = os.path.join(out, name + '.dat')
    open(dpath, 'w').write(deck(title, prog, p))
    subprocess.run(['cp', dpath, os.path.join(work, name + '.dat')], check=True)
    prt = os.path.join(out, name + '.prt')
    r = subprocess.run([os.path.join(bin_dir, prog)], input=f'{name}.dat\n{name}.prt\n', text=True,
                       capture_output=True, cwd=work)
    assert r.returncode == 0, r.stderr
    subprocess.run(['cp', os.path.join(work, name + '.prt'), prt], check=True)
    data = parse(prt, p, prog)
    meta = {k: v for k, v in p.items()}
    json.dump({'program': prog.upper(), 'case': name, 'title': title, 'units': 'metres, days, mg/L',
               'inputs': meta, 'results': data}, open(os.path.join(out, name + '.json'), 'w'), indent=1)
    print(name, 'ok', len(data))
subprocess.run(['rm', '-rf', work])
