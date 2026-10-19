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
import { vadoseLayered, vadoseVadsat } from './processes/vadose/index.js';
import { exposureLegacy, exposureModern } from './processes/exposure/index.js';
import {
  cleanupLegacy,
  cleanupModeledChains,
  cleanupModern,
  cleanupSsgLeaching,
} from './processes/cleanup/index.js';
import { outdoorAirBox, outdoorAirSsgVf1996 } from './processes/outdoorAir/index.js';
import {
  vaporAttenuationFactor2015,
  vaporDevaull2007,
  vaporDominantLayer1998,
  vaporJe1991,
  vaporJuryBam,
  vaporJeEpa,
  vaporPviScreen2015,
} from './processes/vapor/index.js';
import { surfaceWaterLegacy, surfaceWaterModern } from './processes/surfaceWater/index.js';
import { showerFc1986, showerLittle1992, showerRslHousehold } from './processes/shower/index.js';
import { irrigationPathways, irrigationSprinklerFc } from './processes/irrigation/index.js';
import {
  particulateBoxEmissionMethod,
  particulateSsgPef1996,
  particulateSsgPef2002,
} from './processes/particulate/index.js';
import {
  uncertaintyCleanupProbabilistic,
  uncertaintyLhsIc,
  uncertaintySobolSaltelli,
  uncertaintySrsExposure,
} from './processes/uncertainty/index.js';
import { saturatedExponential, saturatedTwoRegion } from './processes/saturatedSource/index.js';

export * from './numerics/special.js';
export * from './numerics/quadrature.js';
export * from './numerics/roots.js';
export * from './numerics/random.js';
export * from './numerics/units.js';
export * from './references/index.js';
export * from './registry/index.js';
export * from './processes/dispersivity/index.js';
export * from './processes/groundwater/index.js';
export * from './processes/vadose/index.js';
export * from './processes/saturatedSource/index.js';
export * from './processes/exposure/index.js';
export * from './processes/vapor/index.js';
// Both exposure and vapor define cm2ToM2; the package root keeps the exposure one, vapor's is aliased.
export { cm2ToM2 } from './processes/exposure/index.js';
export { cm2ToM2 as vaporCm2ToM2 } from './processes/vapor/index.js';
export * from './processes/outdoorAir/index.js';
// Outdoor air (M6) and cleanup (M5) both define SsgSoil; the package root keeps the cleanup one,
// outdoor air's is exported under an explicit name.
export type { SsgSoil as OutdoorAirSsgSoil } from './processes/outdoorAir/index.js';
export type { SsgSoil } from './processes/cleanup/index.js';
export * from './processes/surfaceWater/index.js';
export * from './processes/risk/index.js';
export * from './processes/cleanup/index.js';
export * from './processes/shower/index.js';
export * from './processes/irrigation/index.js';
export * from './processes/particulate/index.js';
export * from './processes/household/index.js';
export * from './processes/uncertainty/index.js';

export const registry = new MethodRegistry();
registry.register(gelhar1985Api1987);
registry.register(xuEckstein1995);
registry.register(schulzeMakuch2005);
registry.register(groundwaterAt123d);
registry.register(groundwaterWexler);
registry.register(groundwaterDomenico);
registry.register(vadoseVadsat);
registry.register(vadoseLayered);
registry.register(saturatedTwoRegion);
registry.register(saturatedExponential);
registry.register(exposureLegacy);
registry.register(exposureModern);
registry.register(cleanupLegacy);
registry.register(cleanupModern);
registry.register(cleanupSsgLeaching);
registry.register(cleanupModeledChains);
registry.register(vaporJe1991);
registry.register(vaporDominantLayer1998);
registry.register(vaporJeEpa);
registry.register(vaporDevaull2007);
registry.register(vaporAttenuationFactor2015);
registry.register(vaporPviScreen2015);
registry.register(outdoorAirBox);
registry.register(outdoorAirSsgVf1996);
registry.register(vaporJuryBam);
registry.register(surfaceWaterLegacy);
registry.register(surfaceWaterModern);
registry.register(showerFc1986);
registry.register(showerLittle1992);
registry.register(showerRslHousehold);
registry.register(irrigationSprinklerFc);
registry.register(irrigationPathways);
registry.register(particulateBoxEmissionMethod);
registry.register(particulateSsgPef1996);
registry.register(particulateSsgPef2002);
registry.register(uncertaintySrsExposure);
registry.register(uncertaintyLhsIc);
registry.register(uncertaintySobolSaltelli);
registry.register(uncertaintyCleanupProbabilistic);
