import { beforeAll, describe, expect, it } from 'vitest';
import { loadChemicalDb, type ChemicalDb } from './chemicalDb';
import { buildInputs } from './build';
import { runRisk } from './compute';
import { defaultForm, defaultReceptor, newChemicalRow, type RiskForm } from './form';
import type { WellFeed } from '../transport/wellFeed';
import type { VaporRiskFeed } from '../vapor/feeds';
import type { SurfaceWaterFeed } from '../surfaceWater/feed';
import type { HouseholdRiskFeed } from '../household/feeds';
import type { ProduceRiskFeed } from '../plantsEco/feeds';

let db: ChemicalDb;
beforeAll(async () => {
  db = await loadChemicalDb();
}, 30000);

/** The transport time axis counts 365.25-day years. */
const YR = 365.25 * 86400;

function formWith(
  rows: { id: string; conc: Record<string, string>; fromWell?: boolean; fromSurface?: boolean }[],
  over: Partial<RiskForm> = {},
): RiskForm {
  return {
    ...defaultForm(),
    chemicals: rows.map((r) => ({
      ...newChemicalRow(db.byId.get(r.id)!),
      conc: r.conc,
      groundwaterFromWell: r.fromWell ?? false,
      surfaceWaterFromModel: r.fromSurface ?? false,
    })),
    ...over,
  };
}

const benzeneWater = () => formWith([{ id: '71-43-2', conc: { groundwater: '0.005' } }]);

function built(
  form: RiskForm,
  well: WellFeed | null = null,
  vapor: VaporRiskFeed | null = null,
  surface: SurfaceWaterFeed | null = null,
  household: HouseholdRiskFeed | null = null,
  produce: ProduceRiskFeed | null = null,
) {
  const r = buildInputs(form, db, well, vapor, surface, household, produce);
  if (!r.ok) throw new Error(r.errors.join('; '));
  return r;
}

describe('buildInputs', () => {
  it('switches on only the pathways that have a concentration for their medium', () => {
    const r = built(benzeneWater());
    expect(r.legacy.receptors[0]!.pathways).toEqual(['waterIngestion', 'waterDermal']);
    expect(r.modern.receptors[0]!.pathways).toEqual(['waterIngestion', 'waterDermal']);
    expect(r.notes.join(' ')).toMatch(/soil.*no concentration/i);
  });

  it('turns a pathway the receptor switched off into no pathway at all', () => {
    const form = benzeneWater();
    form.a.pathways.waterDermal = false;
    expect(built(form).legacy.receptors[0]!.pathways).toEqual(['waterIngestion']);
  });

  it('reproduces the hand calculation of the legacy drinking-water risk', async () => {
    const r = built(benzeneWater());
    const out = runRisk(r);
    expect(out.legacy.ok).toBe(true);
    if (!out.legacy.ok) return;
    const water = out.legacy.result.summary.receptors[0]!.byPathway.find(
      (p) => p.id === 'waterIngestion',
    )!;
    // SFo 0.055 (mg/kg-d)^-1, 0.005 mg/L, 2 L/d, 70 kg, 350 d/yr, 24 yr of a 70 yr lifetime
    const hand = ((0.055 * 0.005 * 2) / 70) * (350 / 365) * (24 / 70);
    expect(water.risk / hand).toBeCloseTo(1, 9);
  });

  it('runs the same scenario under the modern method with its own resident', () => {
    const out = runRisk(built(benzeneWater()));
    expect(out.modern.ok).toBe(true);
    if (!out.modern.ok || !out.legacy.ok) return;
    const modern = out.modern.result.summary.receptors[0]!;
    expect(modern.cancerRisk).toBeGreaterThan(0);
    expect(modern.headlineGroup).toBeTruthy();
    expect(out.legacy.result.summary.receptors[0]!.headlineGroup).toBe('total');
  });

  it('converts concentrations from the screen units (mg/L, mg/kg, mg/m3) once', () => {
    const r = built(
      formWith([
        {
          id: '71-43-2',
          conc: { soil: '2', groundwater: '0.005', indoorAir: '0.01' },
        },
      ]),
    );
    const epcs = r.legacy.receptors[0]!.chemicals[0]!.epcs;
    expect(epcs.soilIngestion).toMatchObject({ kind: 'constant', value: expect.closeTo(2e-6, 12) });
    expect(epcs.waterIngestion).toMatchObject({
      kind: 'constant',
      value: expect.closeTo(5e-6, 12),
    });
    expect(epcs.indoorInhalation).toMatchObject({
      kind: 'constant',
      value: expect.closeTo(1e-8, 14),
    });
  });

  it('uses the transport well result as a series and tags where it came from', () => {
    const well: WellFeed = {
      method: 'modern',
      label: 'Receptor well, modern method',
      times: [0, 10 * YR, 20 * YR, 40 * YR],
      values: [0, 1e-6, 4e-6, 2e-6],
    };
    const form = formWith([{ id: '71-43-2', conc: {}, fromWell: true }]);
    const r = built(form, well);
    const epc = r.legacy.receptors[0]!.chemicals[0]!.epcs.waterIngestion!;
    expect(epc).toMatchObject({ kind: 'series', origin: 'transport.modern' });
    const out = runRisk(r);
    expect(out.legacy.ok && out.legacy.result.epcs[0]![0]!.kind).toBe('series');
    expect(out.modern.ok && out.modern.result.startTimes[0]).not.toBeNull();
  });

  describe('vapor screen feed', () => {
    const vaporFeed = (over: Partial<VaporRiskFeed> = {}): VaporRiskFeed => ({
      chemicalId: '71-43-2',
      label: 'Vapor run, legacy',
      indoor: {
        kind: 'series',
        series: { times: [0, 10 * YR, 20 * YR], values: [2e-8, 1e-8, 5e-9] },
        origin: 'vapor.je-1991',
      },
      outdoor: { kind: 'constant', value: 3e-9, origin: 'outdoorAir.box' },
      ...over,
    });
    const withVapor = (indoor: boolean, outdoor: boolean) => ({
      ...formWith([{ id: '71-43-2', conc: {} }]),
      chemicals: [
        {
          ...newChemicalRow(db.byId.get('71-43-2')!),
          indoorFromVapor: indoor,
          outdoorFromVapor: outdoor,
        },
      ],
    });

    it('takes indoor air from the vapor series and keeps the producing method as its origin', () => {
      const r = built(withVapor(true, false), null, vaporFeed());
      const epcs = r.legacy.receptors[0]!.chemicals[0]!.epcs;
      expect(epcs.indoorInhalation).toMatchObject({ kind: 'series', origin: 'vapor.je-1991' });
      expect(epcs.outdoorInhalation).toBeUndefined();
      const out = runRisk(r);
      expect(out.legacy.ok && out.legacy.result.epcs[0]![0]!.kind).toBe('series');
    });

    it('takes outdoor air with its own origin', () => {
      const r = built(withVapor(false, true), null, vaporFeed());
      expect(r.modern.receptors[0]!.chemicals[0]!.epcs.outdoorInhalation).toMatchObject({
        kind: 'constant',
        origin: 'outdoorAir.box',
      });
    });

    it('asks for a vapor result when a chemical is set to use one and none matches', () => {
      for (const feed of [null, vaporFeed({ chemicalId: '108-88-3' })]) {
        const r = buildInputs(withVapor(true, false), db, null, feed);
        expect(r.ok).toBe(false);
        if (!r.ok) expect(r.errors.join(' ')).toMatch(/vapor/i);
      }
    });

    it('says when the feed has no outdoor air', () => {
      const { outdoor: _omitted, ...noOutdoor } = vaporFeed();
      void _omitted;
      const r = buildInputs(withVapor(false, true), db, null, noOutdoor);
      expect(r.ok).toBe(false);
      if (!r.ok) expect(r.errors.join(' ')).toMatch(/outdoor/i);
    });
  });

  describe('household feed', () => {
    const householdFeed = (over: Partial<HouseholdRiskFeed> = {}): HouseholdRiskFeed => ({
      chemicalId: '71-43-2',
      label: 'Benzene, household run',
      bathroomAir: {
        kind: 'series',
        series: { times: [0, 10 * YR, 20 * YR], values: [0, 3e-8, 1e-8] },
        origin: 'shower.little-1992',
      },
      outdoorSprinkler: { kind: 'constant', value: 2e-9, origin: 'irrigation.sprinkler-fc' },
      outdoorParticulate: { kind: 'constant', value: 4e-10, origin: 'particulate.ssg-pef-1996' },
      indoorAir: { kind: 'constant', value: 3e-9, origin: 'shower.rsl-household' },
      coefficients: { bathroomAir: 0.01, sprayAir: 1e-4, particulateAir: 1e-9 },
      methods: {},
      ...over,
    });
    const withHousehold = (
      bathroom: boolean,
      outdoor: '' | 'sprinkler' | 'particulate',
    ): RiskForm => ({
      ...formWith([{ id: '71-43-2', conc: {} }]),
      chemicals: [
        {
          ...newChemicalRow(db.byId.get('71-43-2')!),
          bathroomFromHousehold: bathroom,
          outdoorFromHousehold: outdoor,
        },
      ],
    });

    it('takes shower air as a series and keeps the producing method as its origin', () => {
      const r = built(withHousehold(true, ''), null, null, null, householdFeed());
      const epcs = r.legacy.receptors[0]!.chemicals[0]!.epcs;
      expect(epcs.showerInhalation).toMatchObject({ kind: 'series', origin: 'shower.little-1992' });
      expect(r.modern.receptors[0]!.pathways).toContain('showerInhalation');
      const out = runRisk(r);
      expect(out.legacy.ok).toBe(true);
    });

    it('takes the household (RSL) air as indoor air on the 24 h indoor pathway', () => {
      const form = withHousehold(false, '');
      form.chemicals[0] = { ...form.chemicals[0]!, indoorFromHousehold: true };
      const r = built(form, null, null, null, householdFeed());
      expect(r.legacy.receptors[0]!.chemicals[0]!.epcs.indoorInhalation).toMatchObject({
        kind: 'constant',
        origin: 'shower.rsl-household',
      });
      expect(r.legacy.receptors[0]!.chemicals[0]!.epcs.showerInhalation).toBeUndefined();
    });

    it('takes outdoor air from the sprinkler or from the particulates, with the right origin', () => {
      const a = built(withHousehold(false, 'sprinkler'), null, null, null, householdFeed());
      expect(a.legacy.receptors[0]!.chemicals[0]!.epcs.outdoorInhalation).toMatchObject({
        kind: 'constant',
        origin: 'irrigation.sprinkler-fc',
      });
      const b = built(withHousehold(false, 'particulate'), null, null, null, householdFeed());
      expect(b.modern.receptors[0]!.chemicals[0]!.epcs.outdoorInhalation).toMatchObject({
        origin: 'particulate.ssg-pef-1996',
      });
    });

    it('asks for a household result when none matches the chemical', () => {
      for (const feed of [null, householdFeed({ chemicalId: '108-88-3' })]) {
        const r = buildInputs(withHousehold(true, ''), db, null, null, null, feed);
        expect(r.ok).toBe(false);
        if (!r.ok) expect(r.errors.join(' ')).toMatch(/household/i);
      }
    });

    it('says when the feed lacks the chosen term', () => {
      const { outdoorSprinkler: _omitted, ...rest } = householdFeed();
      void _omitted;
      const r = buildInputs(withHousehold(false, 'sprinkler'), db, null, null, null, rest);
      expect(r.ok).toBe(false);
      if (!r.ok) expect(r.errors.join(' ')).toMatch(/sprinkler/i);
    });
  });

  it('uses the surface water series as the swimming concentration, tagged surfaceWater.well-mixed', () => {
    const surface: SurfaceWaterFeed = {
      method: 'well-mixed',
      origin: 'surfaceWater.well-mixed',
      label: 'Legacy well-mixed surface water',
      times: [10 * YR, 20 * YR, 40 * YR],
      values: [1e-6, 4e-6, 2e-6],
    };
    const form = formWith([{ id: '71-43-2', conc: {}, fromSurface: true }]);
    form.a.pathways.swimIngestion = true;
    form.a.pathways.swimDermal = true;
    form.a.swimTime = '2';
    form.a.swimDays = '30';
    form.a.waterSkinArea = '18000';
    const r = built(form, null, null, surface);
    const receptor = r.legacy.receptors[0]!;
    expect(receptor.pathways).toEqual(expect.arrayContaining(['swimIngestion', 'swimDermal']));
    const epcs = receptor.chemicals[0]!.epcs;
    expect(epcs.swimIngestion).toMatchObject({ kind: 'series', origin: 'surfaceWater.well-mixed' });
    expect(epcs.swimDermal).toMatchObject({ kind: 'series', origin: 'surfaceWater.well-mixed' });
    const out = runRisk(r);
    expect(out.legacy.ok).toBe(true);
    if (!out.legacy.ok) return;
    const swim = out.legacy.result.summary.receptors[0]!.byPathway.find(
      (p) => p.id === 'swimIngestion',
    );
    expect(swim?.risk).toBeGreaterThan(0);
  });

  it('drives the swimming risk with the series: a larger series gives a larger risk', () => {
    const risk = (scale: number): number => {
      const surface: SurfaceWaterFeed = {
        method: 'well-mixed',
        origin: 'surfaceWater.well-mixed',
        label: 'x',
        times: [10 * YR, 20 * YR],
        values: [1e-6 * scale, 2e-6 * scale],
      };
      const form = formWith([{ id: '71-43-2', conc: {}, fromSurface: true }]);
      form.a.pathways.swimIngestion = true;
      form.a.swimTime = '2';
      form.a.swimDays = '30';
      const out = runRisk(built(form, null, null, surface));
      if (!out.legacy.ok) throw new Error('legacy failed');
      return out.legacy.result.summary.receptors[0]!.byPathway.find(
        (p) => p.id === 'swimIngestion',
      )!.risk;
    };
    expect(risk(2) / risk(1)).toBeCloseTo(2, 6);
  });

  it('asks for a surface water result when a chemical is set to use one and none exists', () => {
    const r = buildInputs(
      formWith([{ id: '71-43-2', conc: {}, fromSurface: true }]),
      db,
      null,
      null,
    );
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.errors.join(' ')).toMatch(/surface water result/i);
  });

  it('asks for a well result when a chemical is set to use one and none exists', () => {
    const r = buildInputs(formWith([{ id: '71-43-2', conc: {}, fromWell: true }]), db, null);
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.errors.join(' ')).toMatch(/well result/i);
  });

  it('reports a blank scenario, a bad number and a negative one as input errors', () => {
    const none = buildInputs(formWith([]), db, null);
    expect(none.ok).toBe(false);
    const blank = buildInputs(formWith([{ id: '71-43-2', conc: {} }]), db, null);
    expect(blank.ok).toBe(false);
    if (!blank.ok) expect(blank.errors.join(' ')).toMatch(/concentration/i);
    const bad = buildInputs(formWith([{ id: '71-43-2', conc: { soil: 'abc' } }]), db, null);
    expect(bad.ok).toBe(false);
    if (!bad.ok) expect(bad.errors.join(' ')).toMatch(/Benzene.*soil/i);
    const neg = buildInputs(formWith([{ id: '71-43-2', conc: { soil: '-1' } }]), db, null);
    expect(neg.ok).toBe(false);
  });

  it('takes the dermal water form from the database, never from the presence of lag-time columns', () => {
    const form = (id: string) => newChemicalRow(db.byId.get(id)!).dermalForm;
    expect(form('7440-38-2')).toBe('inorganic');
    expect(form('71-43-2')).toBe('organic');
    expect(form('7440-66-6')).toBe('inorganic');
    expect(form('7440-43-9-cadmium-diet')).toBeUndefined();
  });

  // Published resident tap water dermal values, child hazard quotient 1 (ug/L), November 2024 RSL.
  it.each([
    ['Cadmium (Water)', 23],
    ['Chromium(VI)', 51],
    ['~Mercuric Chloride (and other Mercury salts)', 96],
    ['Nickel Soluble Salts', 18000],
    ['Zinc and Compounds', 2300000],
    ['Benzene', 610],
  ])(
    'runs the default path for %s to the published dermal screening level',
    (rslName, published) => {
      const rec = db.chemicals.find((c) => c.tox.rslName === rslName)!;
      const form = formWith([{ id: rec.id, conc: { groundwater: '1' } }], {});
      form.a.pathways.waterIngestion = false;
      const out = runRisk(built(form));
      expect(out.modern.ok).toBe(true);
      if (!out.modern.ok) return;
      const hq = out.modern.result.summary.receptors[0]!.hi;
      // 1 mg/L = 1000 ug/L, so the screening level is 1000 / HQ.
      const sl = 1000 / hq;
      expect(Math.abs(Math.log(sl / published))).toBeLessThan(0.03);
    },
  );

  it('leaves dermal water unquantified for a chemical whose form the RSL does not give', () => {
    const rec = db.byId.get('7440-43-9-cadmium-diet')!;
    expect(rec.phys?.dermalForm).toBeUndefined();
    const form = formWith([{ id: rec.id, conc: { groundwater: '1' } }]);
    form.a.pathways.waterIngestion = false;
    const out = runRisk(built(form));
    expect(out.modern.ok).toBe(true);
    if (!out.modern.ok) return;
    const r0 = out.modern.result.summary.receptors[0]!;
    expect(r0.hi).toBe(0);
    expect(r0.notQuantified.map((n) => n.pathway)).toContain('waterDermal');
  });

  it('lets the caller state the form for a chemical the database leaves open', () => {
    const rec = db.byId.get('7440-43-9-cadmium-diet')!;
    const form = formWith([{ id: rec.id, conc: { groundwater: '1' } }]);
    form.a.pathways.waterIngestion = false;
    form.chemicals[0]!.dermalForm = 'inorganic';
    const out = runRisk(built(form));
    expect(out.modern.ok && out.modern.result.summary.receptors[0]!.hi).toBeGreaterThan(0);
  });

  it('leaves the soil dermal pathway unquantified until the skin area and adherence are entered', () => {
    const form = formWith([{ id: '7440-38-2', conc: { soil: '10' } }]);
    form.a.pathways.soilIngestion = false;
    const before = runRisk(built(form));
    expect(before.legacy.ok && before.legacy.result.warnings.map((w) => w.code)).toContain(
      'exposure.site-specific-required',
    );
    form.a.soilSkinArea = '5700';
    form.a.soilAdherence = '0.07';
    const after = runRisk(built(form));
    expect(after.legacy.ok && after.legacy.result.warnings.map((w) => w.code)).not.toContain(
      'exposure.site-specific-required',
    );
    expect(after.modern.ok && after.modern.result.summary.receptors[0]!.cancerRisk).toBeGreaterThan(
      0,
    );
  });

  it('applies the swimming entries to both methods', () => {
    const form = formWith([{ id: '71-43-2', conc: { surfaceWater: '0.01' } }]);
    const before = runRisk(built(form));
    expect(before.modern.ok && before.modern.result.warnings.map((w) => w.code)).toContain(
      'exposure.site-specific-required',
    );
    form.a.swimTime = '2';
    form.a.swimDays = '7';
    const r = runRisk(built(form));
    expect(r.legacy.ok && r.legacy.result.summary.receptors[0]!.cancerRisk).toBeGreaterThan(0);
    expect(r.modern.ok && r.modern.result.summary.receptors[0]!.cancerRisk).toBeGreaterThan(0);
  });

  it('adds a second receptor and the additive option, and the modern method refuses an age-segmented one', () => {
    const form = benzeneWater();
    form.b = defaultReceptor('worker');
    form.additive = true;
    const out = runRisk(built(form));
    expect(out.legacy.ok).toBe(true);
    if (out.legacy.ok) {
      expect(out.legacy.result.summary.receptors).toHaveLength(2);
      expect(out.legacy.result.summary.additiveCancerRisk).toBeGreaterThan(0);
    }
    expect(out.modern.ok).toBe(false);
    if (!out.modern.ok) expect(out.modern.error).toMatch(/additive/i);
  });

  it('pins the modern exposure start when asked', () => {
    const well: WellFeed = {
      method: 'legacy',
      label: 'w',
      times: [0, 10 * YR, 20 * YR, 40 * YR],
      values: [0, 1e-6, 4e-6, 2e-6],
    };
    const form = formWith([{ id: '71-43-2', conc: {}, fromWell: true }], {
      startMode: 'pinned',
      startYr: '5',
    });
    const out = runRisk(built(form, well));
    expect(out.modern.ok && out.modern.result.startTimes[0]).toBe(5 * YR);
    const bad = buildInputs({ ...form, startYr: '-3' }, db, well);
    expect(bad.ok).toBe(false);
  });

  it('lets the user enter the blanks the warnings ask for: drinking water, skin area for water, breathing rate', () => {
    const codes = (r: ReturnType<typeof runRisk>, m: 'legacy' | 'modern'): string[] => {
      const x = r[m];
      return x.ok ? x.result.warnings.map((w) => w.code) : ['failed'];
    };
    const risk = (r: ReturnType<typeof runRisk>, m: 'legacy' | 'modern'): number => {
      const x = r[m];
      return x.ok ? x.result.summary.receptors[0]!.cancerRisk : 0;
    };
    // legacy child: no drinking-water rate and no breathing rate in the preset
    const drink = formWith([{ id: '71-43-2', conc: { groundwater: '0.005' } }]);
    drink.a = defaultReceptor('child');
    drink.a.pathways.waterDermal = false;
    expect(codes(runRisk(built(drink)), 'legacy')).toContain('exposure.site-specific-required');
    drink.a.waterIngestion = '0.78';
    const drunk = runRisk(built(drink));
    expect(codes(drunk, 'legacy')).not.toContain('exposure.site-specific-required');
    expect(risk(drunk, 'legacy')).toBeGreaterThan(0);

    const breathe = formWith([{ id: '71-43-2', conc: { indoorAir: '0.01' } }]);
    breathe.a = defaultReceptor('child');
    expect(codes(runRisk(built(breathe)), 'legacy')).toContain('exposure.site-specific-required');
    breathe.a.inhalationRate = '0.3';
    const breathed = runRisk(built(breathe));
    expect(codes(breathed, 'legacy')).not.toContain('exposure.site-specific-required');
    expect(risk(breathed, 'legacy')).toBeGreaterThan(0);

    // worker: no water skin area in either preset, no drinking water in the modern one
    const bath = formWith([{ id: '71-43-2', conc: { groundwater: '0.005' } }]);
    bath.a = defaultReceptor('worker');
    bath.a.pathways.waterIngestion = false;
    bath.a.bathTime = '0.5';
    expect(codes(runRisk(built(bath)), 'legacy')).toContain('exposure.site-specific-required');
    expect(codes(runRisk(built(bath)), 'modern')).toContain('exposure.site-specific-required');
    bath.a.waterSkinArea = '19400';
    const bathed = runRisk(built(bath));
    expect(codes(bathed, 'legacy')).not.toContain('exposure.site-specific-required');
    expect(codes(bathed, 'modern')).not.toContain('exposure.site-specific-required');
    expect(risk(bathed, 'modern')).toBeGreaterThan(0);

    const work = formWith([{ id: '71-43-2', conc: { groundwater: '0.005' } }]);
    work.a = defaultReceptor('worker');
    work.a.pathways.waterDermal = false;
    expect(codes(runRisk(built(work)), 'modern')).toContain('exposure.site-specific-required');
    work.a.waterIngestion = '1';
    const worked = runRisk(built(work));
    expect(codes(worked, 'modern')).not.toContain('exposure.site-specific-required');
    expect(risk(worked, 'modern')).toBeGreaterThan(0);
  });

  it('allows the additive option for a child resident plus a worker under the modern method', () => {
    const form = formWith([{ id: '71-43-2', conc: { soil: '5' } }]);
    form.a = defaultReceptor('child');
    form.b = defaultReceptor('worker');
    form.additive = true;
    const out = runRisk(built(form));
    expect(out.modern.ok).toBe(true);
  });

  it('builds a child receptor for both methods', () => {
    const form = benzeneWater();
    form.a = defaultReceptor('child');
    const out = runRisk(built(form));
    expect(out.legacy.ok && out.modern.ok).toBe(true);
  });
});

describe('homegrown produce from the plants and ecology screen', () => {
  const feed = (over: Partial<ProduceRiskFeed> = {}): ProduceRiskFeed => ({
    chemicalId: '71-43-2',
    label: 'Benzene, produce run',
    method: 'plantUptake.hhrap-2005',
    factors: { root: 0.05 },
    intakes: { root: { kgPerDay: 0.1, lossFraction: 0.2, fractionHomegrown: 0.4 } },
    intakeLabel: 'user entered',
    ...over,
  });
  const soilForm = (flag: boolean, receptorProduce: boolean): RiskForm => {
    const form = formWith([{ id: '71-43-2', conc: { soil: '10' } }]);
    form.chemicals[0]!.produceFromPlantsEco = flag;
    form.a.produce = receptorProduce;
    return form;
  };

  it('adds the produce pathway when the receptor and the chemical both opt in', () => {
    const r = built(soilForm(true, true), null, null, null, null, feed());
    expect(r.legacy.receptors[0]!.pathways).toContain('produce');
    expect(r.modern.receptors[0]!.pathways).toContain('produce');
  });

  it('leaves the pathway off unless both opt in', () => {
    expect(
      built(soilForm(true, false), null, null, null, null, feed()).legacy.receptors[0]!.pathways,
    ).not.toContain('produce');
    expect(
      built(soilForm(false, true), null, null, null, null, feed()).legacy.receptors[0]!.pathways,
    ).not.toContain('produce');
  });

  it('reproduces the hand calculation of the legacy produce dose in the legacy method', () => {
    const r = built(soilForm(true, true), null, null, null, null, feed());
    const out = runRisk(r);
    expect(out.legacy.ok).toBe(true);
    if (!out.legacy.ok) return;
    const produce = out.legacy.result.summary.receptors[0]!.byPathway.find(
      (p) => p.id === 'produce',
    )!;
    // 0.055 (mg/kg-d)^-1, 10 mg/kg soil, Bp 0.05, 0.1 kg/d, loss 0.2, homegrown 0.4, 70 kg, 350 d/yr, 24 of 70 yr
    const hand =
      ((0.055 * 10 * 1e-6 * 0.05 * 0.8 * 0.1 * 0.4 * 1e6) / 70) * (350 / 365) * (24 / 70);
    expect(produce.risk / hand).toBeCloseTo(1, 6);
  });

  it('runs the produce pathway under the modern method as well', () => {
    const out = runRisk(built(soilForm(true, true), null, null, null, null, feed()));
    expect(out.modern.ok).toBe(true);
    if (!out.modern.ok) return;
    const produce = out.modern.result.summary.receptors[0]!.byPathway.find(
      (p) => p.id === 'produce',
    );
    expect(produce?.risk).toBeGreaterThan(0);
  });

  it('refuses a chemical that opts in with no produce result for it', () => {
    const none = buildInputs(soilForm(true, true), db, null, null, null, null, null);
    expect(none.ok).toBe(false);
    const other = buildInputs(
      soilForm(true, true),
      db,
      null,
      null,
      null,
      null,
      feed({ chemicalId: '108-88-3' }),
    );
    expect(other.ok).toBe(false);
    if (!other.ok) expect(other.errors.join(' ')).toMatch(/plants and ecology/i);
  });

  it('asks for a soil concentration when the chemical opts in without one', () => {
    const form = formWith([{ id: '71-43-2', conc: { groundwater: '0.005' } }]);
    form.chemicals[0]!.produceFromPlantsEco = true;
    form.a.produce = true;
    const r = buildInputs(form, db, null, null, null, null, feed());
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.errors.join(' ')).toMatch(/soil concentration/i);
  });

  it('notes that the intake applies to every life stage', () => {
    const r = built(soilForm(true, true), null, null, null, null, feed());
    expect(r.notes.join(' ')).toMatch(/every life stage/i);
  });
});
