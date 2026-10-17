import {
  iurFromPerUgM3,
  rfcFromMgPerM3,
  rfdFromMgPerKgDay,
  sfFromPerMgKgDay,
  YEAR_S,
  type EpcSeries,
} from '../src/processes/exposure/index.js';
import type { ModernChemicalBoundary } from '../src/processes/exposure/receptorsModern.js';

export const Y = YEAR_S;

/** Benzene as the RSL carries it (hand-case values), legacy SI form. */
export const legacyBenzene = {
  sfo: sfFromPerMgKgDay(0.055),
  rfdo: rfdFromMgPerKgDay(0.004),
  iur: iurFromPerUgM3(7.8e-6),
  rfc: rfcFromMgPerM3(0.03),
  aaf: 0.1,
  kp: 4e-9,
};

export const benzeneBoundary: ModernChemicalBoundary = {
  id: '71-43-2',
  mutagen: false,
  sfo: 0.055,
  iur: 7.8e-6,
  rfdo: 0.004,
  rfci: 0.03,
  giabs: 1,
  absd: 0.1,
  kp: 0.0149,
  tauEvent: 0.28793386679266,
  tStar: 0.69104128030237,
  b: 0.05065008038978,
  fa: 1,
  organic: true,
  inEpd: true,
};

export const bapBoundary: ModernChemicalBoundary = {
  id: '50-32-8',
  mutagen: true,
  sfo: 1,
  rfdo: 3e-4,
  giabs: 1,
  absd: 0.13,
  kp: 0.713,
  tauEvent: 2.72170311040471,
  tStar: 11.8221045485476,
  b: 4.35604161281138,
  fa: 1,
  organic: true,
  inEpd: false,
};

/** A plume that rises for 10 yr, declines to zero by 40 yr and stays zero to 60 yr (kg/m^3). */
export const humpSeries: EpcSeries = {
  times: [0, 10 * Y, 40 * Y, 60 * Y],
  values: [0, 2e-5, 0, 0],
};

/** A plume that declines from its peak at t = 0. */
export const decliningSeries: EpcSeries = {
  times: [0, 20 * Y, 60 * Y],
  values: [3e-5, 1e-5, 0],
};
