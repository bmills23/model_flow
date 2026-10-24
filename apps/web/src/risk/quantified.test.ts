import { describe, expect, it } from 'vitest';
import { gapNote, quantification } from './quantified';

const cell = (
  chemical: string,
  pathway: string,
  c: { computable?: boolean; risk?: number | null; hq?: number | null },
) => ({
  chemical,
  pathway,
  cell: { computable: c.computable ?? true, risk: c.risk ?? null, hq: c.hq ?? null },
});

describe('quantification', () => {
  const q = quantification([
    cell('benzene', 'waterIngestion', { risk: 2e-6, hq: 0.1 }),
    cell('benzene', 'waterDermal', { computable: false }),
    cell('toluene', 'waterIngestion', { hq: 0.2 }),
    cell('toluene', 'waterDermal', { computable: false }),
    cell('xylenes', 'waterIngestion', { risk: 0, hq: 0 }),
  ]);

  it('is quantified when any cell has the value, even a true zero', () => {
    expect(q.total).toEqual({ risk: null, hi: null });
    expect(q.byChemical.get('xylenes')).toEqual({ risk: null, hi: null });
    expect(q.byPathway.get('waterIngestion')).toEqual({ risk: null, hi: null });
  });

  it('names a toxicity value that is missing for every computed cell of a chemical', () => {
    const only = quantification([
      cell('toluene', 'waterIngestion', { hq: 0.2 }),
      cell('toluene', 'soilIngestion', { hq: 0.1 }),
    ]);
    expect(only.byChemical.get('toluene')!.risk).toBe('no cancer toxicity value for this route');
    expect(only.byChemical.get('toluene')!.hi).toBeNull();
    // a cell that could not be computed adds its own reason beside it
    expect(q.byChemical.get('toluene')!.risk).toBe(
      'an exposure input or chemical property is missing (see the warnings); no cancer toxicity value for this route',
    );
  });

  it('names a missing input when no cell of the pathway could be computed', () => {
    expect(q.byPathway.get('waterDermal')).toEqual({
      risk: 'an exposure input or chemical property is missing (see the warnings)',
      hi: 'an exposure input or chemical property is missing (see the warnings)',
    });
  });

  it('gives both reasons when the cells fail differently', () => {
    const mixed = quantification([
      cell('a', 'soilIngestion', { computable: false }),
      cell('b', 'soilIngestion', { risk: null, hq: 1 }),
    ]);
    expect(mixed.byPathway.get('soilIngestion')!.risk).toBe(
      'an exposure input or chemical property is missing (see the warnings); no cancer toxicity value for this route',
    );
  });

  it('has no quantified total when there are no cells', () => {
    expect(quantification([]).total.risk).toMatch(/nothing was switched on/);
  });
});

describe('gapNote', () => {
  it('is empty without a gap and names each measure with one', () => {
    expect(gapNote({ risk: null, hi: null })).toBe('');
    expect(gapNote({ risk: 'no cancer toxicity value for this route', hi: null })).toBe(
      'cancer risk: no cancer toxicity value for this route',
    );
    expect(gapNote({ risk: 'a', hi: 'b' })).toBe('cancer risk: a; hazard index: b');
  });
});
