// @vitest-environment jsdom
import { beforeAll, describe, expect, it } from 'vitest';
import { render } from '@testing-library/react';
import { PATHWAY_IDS, type PathwayId } from '@model-flow/engine';
import { loadChemicalDb, type ChemicalDb } from '../risk/chemicalDb';
import { newChemicalRow } from '../risk/form';
import { buildCleanup } from './build';
import { runCleanup } from './compute';
import { defaultCleanupForm } from './form';
import { NotQuantified, LevelsSection } from './Results';

let db: ChemicalDb;
beforeAll(async () => {
  db = await loadChemicalDb();
}, 30000);

const TAP: PathwayId[] = ['waterIngestion', 'waterDermal'];

describe('a blank or zero entered concentration', () => {
  it('is reported as not quantified with its reason, never printed as a level of zero', () => {
    const f = defaultCleanupForm();
    const pathways = Object.fromEntries(PATHWAY_IDS.map((p) => [p, TAP.includes(p)])) as Record<
      PathwayId,
      boolean
    >;
    const form = {
      ...f,
      allocation: 'cumulative' as const,
      a: { ...f.a, pathways },
      chemicals: [
        { ...newChemicalRow(db.byId.get('71-43-2')!), conc: { groundwater: '0.01' } },
        { ...newChemicalRow(db.byId.get('7440-38-2')!), conc: {} },
      ],
    };
    const b = buildCleanup(form, db);
    if (!b.ok) throw new Error(b.errors.join('; '));
    const outcome = runCleanup(b);
    const names = { '71-43-2': 'Benzene', '7440-38-2': 'Arsenic' };
    const nq = render(<NotQuantified outcome={outcome} inputs={b} names={names} />);
    const text = nq.container.textContent ?? '';
    expect(text).toMatch(/Arsenic/);
    expect(text).toMatch(/no concentration entered|entered as zero/i);
    expect(text).not.toMatch(/no toxicity value/i);
    nq.unmount();
    const lv = render(<LevelsSection method="modern" outcome={outcome.modern} names={names} />);
    const row = [...lv.container.querySelectorAll('tbody tr')].find((tr) =>
      /Arsenic/.test(tr.textContent ?? ''),
    )!;
    expect(row.querySelector('.level')!.textContent).toBe('not quantified');
  }, 30000);
});
