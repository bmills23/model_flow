// @vitest-environment jsdom
import { beforeAll, describe, expect, it } from 'vitest';
import { render } from '@testing-library/react';
import { PATHWAY_IDS, type PathwayId } from '@model-flow/engine';
import { loadChemicalDb, type ChemicalDb } from '../risk/chemicalDb';
import { newChemicalRow } from '../risk/form';
import type { VaporRiskFeed } from '../vapor/feeds';
import { buildCleanup } from './build';
import { runCleanup } from './compute';
import { cleanupLevelRows } from './csv';
import { defaultCleanupForm } from './form';
import { fakeOutcome } from './modeledLevels.testkit';
import { ModeledResults } from './ModeledSection';
import { LevelsSection } from './Results';
import { solubilityCeiling, type SolubilityCeiling } from './solubility';
import { sourceLevelCsvTables } from './sourceLevelsCsv';
import { VaporPanel } from './VaporPanel';

let db: ChemicalDb;
beforeAll(async () => {
  db = await loadChemicalDb();
}, 30000);

const xylenes: SolubilityCeiling = solubilityCeiling(
  '',
  '1330-20-7',
  new Map([['1330-20-7', { s: 106 }]]),
  '2024-11',
)!;
const tiny: SolubilityCeiling = {
  value: 1e-9,
  origin: 'entered',
  source: 'a ceiling entered on the cleanup screen',
};

function directOutcome(on: PathwayId[]) {
  const f = defaultCleanupForm();
  const pathways = Object.fromEntries(PATHWAY_IDS.map((p) => [p, on.includes(p)])) as Record<
    PathwayId,
    boolean
  >;
  const form = {
    ...f,
    chemicals: [newChemicalRow(db.byId.get('71-43-2')!)],
    a: { ...f.a, pathways, outdoorTime: '2' },
  };
  const b = buildCleanup(form, db);
  if (!b.ok) throw new Error(b.errors.join('; '));
  return runCleanup(b);
}

describe('modeled levels above the solubility', () => {
  const view = (medium: 'soil' | 'groundwater', ceiling: SolubilityCeiling | null) =>
    render(
      <ModeledResults
        outcome={fakeOutcome(medium, { modern: 0.481 })}
        name="Xylenes"
        notes={[]}
        ceiling={ceiling}
      />,
    );

  it('flags a dissolved level of 481 mg/L against a solubility of 106 mg/L, with the source of the value', () => {
    const v = view('groundwater', xylenes);
    const text = v.container.textContent ?? '';
    expect(text).toMatch(/above the solubility/);
    expect(text).toMatch(/481 mg\/L is above the solubility of 106 mg\/L/);
    expect(text).toMatch(/Regional Screening Levels/);
    expect(v.container.querySelector('.level-flag')).not.toBeNull();
  });

  it('flags nothing when the level is at or below the solubility, or no solubility is known', () => {
    expect(view('groundwater', { ...xylenes, value: 500 }).container.textContent).not.toMatch(
      /above the solubility/,
    );
    expect(view('groundwater', null).container.textContent).not.toMatch(/above the solubility/);
  });

  it('does not hold a soil level (mg/kg) against a solubility in mg/L', () => {
    expect(view('soil', xylenes).container.textContent).not.toMatch(/above the solubility/);
  });
});

describe('direct groundwater levels above the solubility', () => {
  it('flags a tap water level above the ceiling on the screen and in the file', () => {
    const out = directOutcome(['waterIngestion', 'waterDermal']);
    const names = { '71-43-2': 'Benzene' };
    const v = render(
      <LevelsSection method="modern" outcome={out.modern} names={names} ceilingOf={() => tiny} />,
    );
    expect(v.container.textContent).toMatch(
      /Benzene: the level of .* is above the solubility ceiling/,
    );
    expect(v.container.querySelector('.level-flag')).not.toBeNull();
    const rows = cleanupLevelRows(out, names, () => tiny).filter(
      (r) => r['medium'] === 'groundwater',
    );
    expect(rows.length).toBeGreaterThan(0);
    expect(rows.every((r) => /above the solubility/.test(String(r['solubility'])))).toBe(true);
    const plain = cleanupLevelRows(out, names).filter((r) => r['medium'] === 'groundwater');
    expect(plain.every((r) => r['solubility'] === '')).toBe(true);
  });

  it('does not flag a soil level', () => {
    const out = directOutcome(['soilIngestion']);
    const rows = cleanupLevelRows(out, { '71-43-2': 'Benzene' }, () => tiny).filter(
      (r) => r['medium'] === 'soil',
    );
    expect(rows.length).toBeGreaterThan(0);
    expect(rows.every((r) => r['solubility'] === '')).toBe(true);
  });
});

describe('vapor source levels above the solubility', () => {
  const EPC = { kind: 'constant' as const, value: 1e-6, origin: 'x' };
  const FEED: VaporRiskFeed = {
    chemicalId: '71-43-2',
    label: 'Benzene, vapor run',
    indoor: EPC,
    outdoor: EPC,
    coefficients: {
      indoor: { quantified: true, methodId: 'vapor.je-1991', value: 2e-4, source: 'groundwater' },
      outdoor: {
        quantified: true,
        methodId: 'outdoorAir.box',
        value: 3e-9,
        source: 'soil',
        maxSource: 100,
      },
    },
  };
  const out = () => directOutcome(['indoorInhalation', 'outdoorInhalation']);

  it('flags the groundwater source level and not the soil one, on the screen', () => {
    const v = render(
      <VaporPanel outcome={out()} feed={FEED} names={{ '71-43-2': 'Benzene' }} ceiling={tiny} />,
    );
    expect(v.container.textContent).toMatch(
      /Benzene: the level of .* mg\/L is above the solubility ceiling/,
    );
    const flagged = [...v.container.querySelectorAll('tbody tr')].filter((tr) =>
      tr.querySelector('.level-flag'),
    );
    expect(flagged.length).toBeGreaterThan(0);
    expect(flagged.every((tr) => /Groundwater/.test(tr.textContent ?? ''))).toBe(true);
  });

  it('puts the flag in the file, only on rows in water', () => {
    const tables = sourceLevelCsvTables(
      out(),
      { '71-43-2': 'Benzene' },
      { vapor: FEED },
      { ceilingOf: () => tiny },
    );
    const t = tables.find((x) => x.name === 'cleanup-vapor-levels')!;
    expect(t.columns.some((c) => c.key === 'solubility')).toBe(true);
    for (const r of t.rows) {
      expect(/above the solubility/.test(String(r['solubility']))).toBe(r['unit'] === 'mg/L');
    }
    expect(t.rows.some((r) => r['unit'] === 'mg/L')).toBe(true);
  });
});
