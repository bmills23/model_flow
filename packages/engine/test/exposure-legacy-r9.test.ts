import { describe, expect, it } from 'vitest';
import r9 from './fixtures/exposure/r9.json' with { type: 'json' };
import { legacyPathway, type LegacyChemical } from '../src/processes/exposure/legacy.js';
import { legacyReceptor } from '../src/processes/exposure/receptorsLegacy.js';
import {
  cmPerHourToMPerS,
  doseToMgPerKgDay,
  mgPerKgToKgPerKg,
  mgPerLToKgPerM3,
  rfdFromMgPerKgDay,
  sfFromPerMgKgDay,
  type PathwayId,
} from '../src/processes/exposure/units.js';

const i = r9.inputs;
const rc = i.receptor;
const receptor = legacyReceptor({
  bwKg: rc.bwKg,
  lifetimeYr: rc.lifetimeYr,
  edYr: rc.edYr,
  efDaysPerYr: rc.efDaysPerYr,
  soilIngestionMgPerDay: rc.soilIngestionMgPerDay,
  waterIngestionLPerDay: rc.waterIngestionLPerDay,
  soilSkinAreaCm2: rc.dermalSoilSkinAreaCm2,
  soilAdherenceMgPerCm2: rc.dermalSoilAdherenceMgPerCm2,
  waterSkinAreaCm2: rc.showerSkinAreaCm2,
  etHoursPerDay: { waterDermal: rc.showerHoursPerDay },
});

type Row = Record<string, string>;
/** Half a unit in the last printed digit of a value such as "4.4e-6" or "1.83e2". */
function tolerance(printed: string): number {
  const [mantissa, exp] = printed.toLowerCase().split('e');
  const decimals = (mantissa!.split('.')[1] ?? '').length;
  return 0.5 * Math.pow(10, Number(exp) - decimals);
}

const concentration = (pathway: PathwayId): number =>
  pathway === 'soilIngestion' || pathway === 'soilDermal'
    ? mgPerKgToKgPerKg(i.concentrations.soilMgPerKg)
    : mgPerLToKgPerM3(i.concentrations.waterMgPerL);

describe('Table R-9 (arcadis2001), legacy method, page 1 rows', () => {
  const names = Object.keys(i.chemicals) as (keyof typeof i.chemicals)[];
  for (const [pathway, targets] of Object.entries(r9.targets)) {
    for (const name of names) {
      const c = i.chemicals[name] as {
        sfo?: number;
        rfdo?: number;
        aaf: number;
        kpCmPerH: number;
      };
      const chem: LegacyChemical = {
        aaf: c.aaf,
        kp: cmPerHourToMPerS(c.kpCmPerH),
        ...(c.sfo === undefined ? {} : { sfo: sfFromPerMgKgDay(c.sfo) }),
        ...(c.rfdo === undefined ? {} : { rfdo: rfdFromMgPerKgDay(c.rfdo) }),
      };
      it(`${pathway}: ${name}`, () => {
        const epc = concentration(pathway as PathwayId);
        const cell = legacyPathway(
          pathway as PathwayId,
          { cancer: epc, noncancer: epc },
          receptor,
          chem,
        );
        const t = targets as { cdi: Row; risk: Row; hi: Row };
        const cdi = doseToMgPerKgDay(cell.cadd!);
        expect(Math.abs(cdi - Number(t.cdi[name]))).toBeLessThanOrEqual(tolerance(t.cdi[name]!));
        for (const [got, printed] of [
          [cell.risk, t.risk[name]!],
          [cell.hq, t.hi[name]!],
        ] as const) {
          if (printed === 'NQ') expect(got).toBeNull();
          else expect(Math.abs(got! - Number(printed))).toBeLessThanOrEqual(tolerance(printed));
        }
      });
    }
  }
});
