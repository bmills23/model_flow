import { describe, expect, it } from 'vitest';
import {
  blockedChemicals,
  indoorAirRows,
  inputBlocks,
  staleReport,
  staleSentence,
} from './runView';
import type { OutputCheck } from './status';
import type { GuidedOutputs } from './state';

const chems = [
  { id: 'a', name: 'Alpha' },
  { id: 'b', name: 'Beta' },
];

describe('staleReport', () => {
  it('is null when every result is current', () => {
    expect(staleReport(['well'], chems, () => 'current')).toBeNull();
  });

  it('names the models and chemicals that changed, and those with no result', () => {
    const check: OutputCheck = (feed, id) =>
      feed === 'well' && id === 'a'
        ? 'stale'
        : feed === 'vaporRisk' && id === 'b'
          ? 'missing'
          : 'current';
    const r = staleReport(['well', 'vaporRisk'], chems, check)!;
    expect(r.changed).toEqual([{ model: 'groundwater transport model', chemicals: ['Alpha'] }]);
    expect(r.missing).toEqual(['Beta']);
    const s = staleSentence(r);
    expect(s).toMatch(/groundwater transport model \(Alpha\)/);
    expect(s).toMatch(/No result yet for Beta/);
    expect(s).not.toMatch(/—/);
  });
});

describe('indoorAirRows and inputBlocks', () => {
  const outputs: GuidedOutputs = {
    vaporRisk: {
      a: {
        inputsHash: 'h',
        value: {
          chemicalId: 'a',
          label: 'x',
          indoor: { kind: 'constant', value: 3e-6, origin: 'vapor.je-epa' },
          runInputs: [
            { label: 'Indoor air method', value: 'Modern EPA' },
            { label: 'Source medium', value: 'Soil gas' },
          ],
        },
      } as never,
    },
  };

  it('reports the peak, the source and the method the Run recorded', () => {
    const rows = indoorAirRows(outputs, chems);
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({ chemical: 'Alpha', source: 'Soil gas', method: 'Modern EPA' });
    expect(rows[0]!.peakMgPerM3).toBeCloseTo(3, 9);
  });

  it('lists the recorded inputs by model for one chemical', () => {
    const blocks = inputBlocks(outputs, 'a');
    expect(blocks).toHaveLength(1);
    expect(blocks[0]!.model).toBe('indoor air model');
    expect(inputBlocks(outputs, 'b')).toEqual([]);
  });
});

describe('blocked results', () => {
  const chems = [
    { id: 'a', name: 'Benzene' },
    { id: 'b', name: 'Toluene' },
  ];
  it('are not out of date: staleReport ignores them, blockedChemicals names them', () => {
    const check = (_f: string, id: string): 'current' | 'blocked' =>
      id === 'a' ? 'blocked' : 'current';
    expect(staleReport(['vaporRisk'], chems, check)).toBeNull();
    expect(blockedChemicals(['vaporRisk'], chems, check)).toEqual(['Benzene']);
  });
});
