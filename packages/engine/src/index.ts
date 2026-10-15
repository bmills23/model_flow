import { MethodRegistry } from './registry/index.js';
import {
  gelhar1985Api1987,
  schulzeMakuch2005,
  xuEckstein1995,
} from './processes/dispersivity/index.js';
import {
  groundwaterAt123d,
  groundwaterDomenico,
  groundwaterWexler,
} from './processes/groundwater/index.js';

export * from './numerics/special.js';
export * from './numerics/quadrature.js';
export * from './numerics/roots.js';
export * from './numerics/random.js';
export * from './numerics/units.js';
export * from './references/index.js';
export * from './registry/index.js';
export * from './processes/dispersivity/index.js';
export * from './processes/groundwater/index.js';

export const registry = new MethodRegistry();
registry.register(gelhar1985Api1987);
registry.register(xuEckstein1995);
registry.register(schulzeMakuch2005);
registry.register(groundwaterAt123d);
registry.register(groundwaterWexler);
registry.register(groundwaterDomenico);
