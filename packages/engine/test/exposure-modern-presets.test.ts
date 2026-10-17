import { describe, expect, it } from 'vitest';
import {
  MODERN_RESIDENT_BOUNDARY,
  MODERN_WORKER_BOUNDARY,
  modernChemical,
} from '../src/processes/exposure/receptorsModern.js';
import params from './fixtures/exposure/rsl-2024-11-default-parameters.json' with { type: 'json' };

// The modern presets against the RSL default exposure parameter file (SEMS 404323, November 2024).

const [child, adult] = MODERN_RESIDENT_BOUNDARY.stages;
const seg = MODERN_RESIDENT_BOUNDARY.mutagenStages!;
const SEG_KEYS = ['0-2', '2-6', '6-16', '16-26'] as const;
const r = params.resident;

describe('modern resident preset matches the RSL default parameters', () => {
  it('child factors', () => {
    expect(child!.bwKg).toBe(r['BWres-c']);
    expect(child!.efDaysPerYr).toBe(r['EFres-c']);
    expect(child!.edYr).toBe(r['EDres-c']);
    expect(child!.waterIngestionLPerDay).toBe(r['IRWres-c']);
    expect(child!.soilIngestionMgPerDay).toBe(r['IRSres-c']);
    expect(child!.soilSkinAreaCm2).toBe(r['SAres-c-soil']);
    expect(child!.soilAdherenceMgPerCm2).toBe(r['AFres-c']);
    expect(child!.waterSkinAreaCm2).toBe(r['SAres-c-water']);
    expect(child!.bathingTimeHr).toBe(r['ETevent-res-c']);
    expect(child!.bathingEventsPerDay).toBe(r['EVres-c']);
    expect(child!.etHoursPerDay?.indoorInhalation).toBe(r['ETres']);
    expect(child!.swimIngestionLPerHour).toBe(r['IRWrec-c']);
  });

  it('adult factors', () => {
    expect(adult!.bwKg).toBe(r['BWres-a']);
    expect(adult!.efDaysPerYr).toBe(r['EFres-a']);
    expect(adult!.edYr).toBe(r['EDres-a']);
    expect(adult!.waterIngestionLPerDay).toBe(r['IRWres-a']);
    expect(adult!.soilIngestionMgPerDay).toBe(r['IRSres-a']);
    expect(adult!.soilSkinAreaCm2).toBe(r['SAres-a-soil']);
    expect(adult!.soilAdherenceMgPerCm2).toBe(r['AFres-a']);
    expect(adult!.waterSkinAreaCm2).toBe(r['SAres-a-water']);
    expect(adult!.bathingTimeHr).toBe(r['ETevent-res-a']);
    expect(adult!.bathingEventsPerDay).toBe(r['EVres-a']);
    expect(adult!.etHoursPerDay?.indoorInhalation).toBe(r['ETres']);
    expect(adult!.swimIngestionLPerHour).toBe(r['IRWrec-a']);
  });

  it('mutagen age segments and ADAF 10, 3, 3, 1', () => {
    expect(seg.map((s) => s.adaf)).toEqual([10, 3, 3, 1]);
    SEG_KEYS.forEach((k, i) => {
      const s = seg[i]!;
      expect(s.edYr).toBe(params.segments.ED[k]);
      expect(s.bwKg).toBe(params.segments.BW[k]);
      expect(s.efDaysPerYr).toBe(params.segments.EF[k]);
      expect(s.soilIngestionMgPerDay).toBe(params.segments.IRS[k]);
      expect(s.soilSkinAreaCm2).toBe(params.segments['SA-soil'][k]);
      expect(s.soilAdherenceMgPerCm2).toBe(params.segments.AF[k]);
      expect(s.waterSkinAreaCm2).toBe(params.segments['SA-water'][k]);
      expect(s.bathingTimeHr).toBe(params.segments.ETevent[k]);
      expect(s.swimIngestionLPerHour).toBe(params.segments.IRsw[k]);
      expect(s.etHoursPerDay?.indoorInhalation).toBe(params.segments.ET[k]);
    });
  });

  it('reproduces the age-adjusted factors the file prints', () => {
    const s = MODERN_RESIDENT_BOUNDARY.stages;
    const ef = 350;
    const nm = (f: (x: (typeof s)[number]) => number): number =>
      s.reduce((a, x) => a + (x.edYr * f(x)) / x.bwKg, 0) * ef;
    const mu = (f: (x: (typeof seg)[number]) => number): number =>
      seg.reduce((a, x) => a + (x.edYr * (x.adaf ?? 1) * f(x)) / x.bwKg, 0) * ef;
    const a = params.ageAdjusted;
    expect(nm((x) => x.waterIngestionLPerDay!)).toBeCloseTo(a['IFWres-adj'], 2);
    expect(mu((x) => x.waterIngestionLPerDay!)).toBeCloseTo(a['IFWMres-adj'], 1);
    expect(nm((x) => x.soilIngestionMgPerDay!)).toBeCloseTo(a['IFSres-adj'], 6);
    expect(mu((x) => x.soilIngestionMgPerDay!)).toBeCloseTo(a['IFSMres-adj'], 1);
    expect(nm((x) => x.soilSkinAreaCm2! * x.soilAdherenceMgPerCm2!)).toBeCloseTo(
      a['DFSres-adj'],
      6,
    );
    expect(mu((x) => x.soilSkinAreaCm2! * x.soilAdherenceMgPerCm2!)).toBeCloseTo(
      a['DFSMres-adj'],
      6,
    );
    expect(nm((x) => x.waterSkinAreaCm2! * x.bathingEventsPerDay!)).toBeCloseTo(a['DFWres-adj'], 6);
    expect(Math.round(mu((x) => x.waterSkinAreaCm2! * x.bathingEventsPerDay!))).toBe(
      a['DFWMres-adj'],
    );
  });

  it('the ED-weighted bathing event time is the 0.6708 h of the file', () => {
    const w = (6 * child!.bathingTimeHr! + 20 * adult!.bathingTimeHr!) / 26;
    expect(w).toBeCloseTo(params.resident['ETevent-res-adj'], 4);
    expect(MODERN_RESIDENT_BOUNDARY.cancerBathingTimeHr).toBe(params.resident['ETevent-res-adj']);
  });
});

describe('modern composite worker preset matches the RSL default parameters', () => {
  const w = MODERN_WORKER_BOUNDARY.stages[0]!;
  const p = params.compositeWorker;
  it('matches', () => {
    expect(MODERN_WORKER_BOUNDARY.stages).toHaveLength(1);
    expect(w.bwKg).toBe(p.BWcom);
    expect(w.efDaysPerYr).toBe(p.EFcom);
    expect(w.edYr).toBe(p.EDcom);
    expect(w.soilIngestionMgPerDay).toBe(p.IRcom);
    expect(w.soilSkinAreaCm2).toBe(p.SAcom);
    expect(w.soilAdherenceMgPerCm2).toBe(p.AFcom);
    expect(w.etHoursPerDay?.indoorInhalation).toBe(p.ETcom);
  });
});

describe('relative bioavailability default', () => {
  it('is 0.6 for inorganic arsenic only, by CAS number', () => {
    expect(modernChemical({ id: '7440-38-2', mutagen: false }).rba).toBe(params.rba.arsenic);
    expect(modernChemical({ id: '71-43-2', mutagen: false }).rba).toBe(params.rba.others);
    expect(modernChemical({ id: '7440-38-2', mutagen: false, rba: 1 }).rba).toBe(1);
  });
});
