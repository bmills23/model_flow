import json, sys, datetime, importlib.metadata as md
import numpy as np
from mibitrans.data.parameters import HydrologicalParameters, AttenuationParameters, SourceParameters, ModelParameters
from mibitrans.transport.models import Bioscreen, Mibitrans
cases = {
 'nodecay': dict(decay=0.0),
 'decay': dict(decay=0.002),
}
pts = [(x, y, t) for t in (200.0, 1000.0, 3650.0) for x in (20.0, 50.0, 100.0, 150.0) for y in (0.0, 5.0, 10.0, 20.0)]
out = {'package': 'mibitrans', 'version': md.version('mibitrans'), 'retrieved': str(datetime.date.today()),
       'license': 'Apache-2.0', 'units': 'metres, days, g/m3', 'cases': {}}
for name, c in cases.items():
    inp = dict(velocity=0.2, porosity=0.25, alpha_x=10.0, alpha_y=1.0, alpha_z=0.1, retardation=1.5,
               decay_rate=c['decay'], source_zone_boundary=[10.0], source_zone_concentration=[10.0], depth=3.0)
    hyd = HydrologicalParameters(velocity=inp['velocity'], porosity=inp['porosity'], alpha_x=inp['alpha_x'], alpha_y=inp['alpha_y'], alpha_z=inp['alpha_z'])
    att = AttenuationParameters(retardation=inp['retardation'], decay_rate=inp['decay_rate'])
    src = SourceParameters(source_zone_boundary=np.array([10.0]), source_zone_concentration=np.array([10.0]), depth=3.0)
    mod = ModelParameters(model_length=200.0, model_width=60.0, model_time=3650.0, dx=10.0, dy=5.0, dt=100.0)
    dom = Bioscreen(hyd, att, src, mod)
    ex = Mibitrans(hyd, att, src, mod)
    rows = []
    for x, y, t in pts:
        rows.append({'x': x, 'y': y, 't': t, 'domenico': float(dom.sample(x, y, t)), 'exact': float(ex.sample(x, y, t))})
    out['cases'][name] = {'inputs': inp, 'class_domenico': 'mibitrans.transport.models.Bioscreen (truncated Domenico 1987 as in BIOSCREEN)',
                          'class_exact': 'mibitrans.transport.models.Mibitrans (Wexler 1992 exact patch solution, z=0, no source depletion)', 'points': rows}
json.dump(out, open(sys.argv[1], 'w'), indent=1)
print(rows[:6])
