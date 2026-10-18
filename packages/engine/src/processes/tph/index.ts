import type { MethodDescriptor, Warning } from '../../registry/index.js';
import { tphTotalLevel, type TphTotalLevelInput, type TphTotalLevelResult } from './fractions.js';

export * from './fractions.js';

const COMMON_ASSUMPTIONS = [
  'The fraction set maps onto the five RSL TPH surrogate records; no toxicity values are entered, and a fraction without a surrogate is reported and excluded.',
  'Per-fraction levels are the levels for a hazard quotient of one from the cleanup process; fraction hazard quotients add because the RSL TPH records carry noncancer toxicity only.',
  'The fraction mass fractions must sum to one; each fraction is checked against its own saturation limit at its share of the total.',
];

export const tphTphcwg: MethodDescriptor<TphTotalLevelInput, TphTotalLevelResult> = {
  id: 'tph.tphcwg',
  process: 'tph',
  kind: 'legacy',
  name: 'TPH fraction cleanup level with the TPHCWG aliphatic and aromatic fraction set',
  summary:
    'Treats total petroleum hydrocarbon as a set of TPHCWG aliphatic and aromatic equivalent carbon number fractions, each mapped to an RSL surrogate record; the total level meeting a target hazard index is the target over the sum of fraction mass fraction over fraction level, with each fraction checked against its own soil saturation limit.',
  citations: ['tphcwg1997'],
  assumptions: COMMON_ASSUMPTIONS,
  risc5Choice:
    'RISC5 offers TPH fraction sets for forward risk and a total TPH level.',
  validate: (input): Warning[] => tphTotalLevel(input).warnings,
  run: tphTotalLevel,
};

export const tphMadep: MethodDescriptor<TphTotalLevelInput, TphTotalLevelResult> = {
  id: 'tph.madep',
  process: 'tph',
  kind: 'modern',
  name: 'TPH fraction cleanup level with the MADEP carbon range fraction set',
  summary:
    'The same total level and saturation check as the TPHCWG method, with the fractions taken from the MADEP volatile and extractable petroleum hydrocarbon carbon ranges, each mapped to an RSL surrogate record.',
  citations: ['madep2002'],
  assumptions: COMMON_ASSUMPTIONS,
  validate: (input): Warning[] => tphTotalLevel(input).warnings,
  run: tphTotalLevel,
};
