import { describe, expect, it } from 'vitest';
import { heldSources } from './heldSources';
import type { SourceSeries } from './series';

const src = (label: string, chemicalId?: string): SourceSeries => ({
  kind: 'groundwater',
  label,
  series: { times: [0, 1], values: [0, 1e-6] },
  ...(chemicalId ? { chemicalId } : {}),
});
const nameOf = (id: string) => (id === '71-43-2' ? 'Benzene' : id === '108-88-3' ? 'Toluene' : id);
const base = { screenChemical: '108-88-3', projectCount: 2, nameOf };

describe('heldSources', () => {
  it('keeps a source for the screen chemical', () => {
    const r = heldSources({
      ...base,
      waterTable: src('Water table', '108-88-3'),
      vadose: null,
      saturated: null,
    });
    expect(r.held.map((h) => h.choice)).toEqual(['waterTable']);
    expect(r.problems).toEqual([]);
  });

  it('refuses sources for another chemical, naming both, and holds none of them', () => {
    const r = heldSources({
      ...base,
      waterTable: src('Water table', '71-43-2'),
      vadose: src('Vadose', '71-43-2'),
      saturated: src('Saturated', '71-43-2'),
    });
    expect(r.held).toEqual([]);
    expect(r.problems.map((p) => p.choice)).toEqual(['waterTable', 'vadose', 'saturated']);
    expect(r.problems[0]!.message).toMatch(/Benzene, not Toluene/);
  });

  it('takes an untagged source in a project of one chemical, refuses it in a project of two', () => {
    const feeds = { waterTable: src('Water table'), vadose: null, saturated: null };
    expect(heldSources({ ...base, ...feeds, projectCount: 1 }).held).toHaveLength(1);
    const two = heldSources({ ...base, ...feeds });
    expect(two.held).toEqual([]);
    expect(two.problems[0]!.message).toMatch(/does not record which chemical/);
  });
});
