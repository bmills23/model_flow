import { cleanup, render, screen, within } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';
import type { RiskOutcome } from './compute';
import { Comparison } from './Results';

afterEach(cleanup);

const cell = (risk: number | null, hq: number | null) => ({
  chemical: 'tol',
  pathway: 'soilIngestion',
  cell: { computable: true, risk, hq },
});

const method = (risk: number | null) => ({
  ok: true,
  result: {
    receptors: [{ cells: [cell(risk, 0.2)] }],
    summary: {
      additiveCancerRisk: null,
      receptors: [
        {
          label: 'Resident',
          cancerRisk: risk ?? 0,
          hi: 0.2,
          hiByGroup: { total: 0.2 },
          headlineGroup: 'total',
          byPathway: [],
          byChemical: [],
          notQuantified: [],
        },
      ],
    },
  },
});

describe('Comparison, a cancer risk nothing quantified', () => {
  it('reads "not quantified" for a method with no cancer toxicity value, never 0', () => {
    const outcome = { legacy: method(null), modern: method(2e-6) } as unknown as RiskOutcome;
    render(<Comparison outcome={outcome} additive={false} />);
    const row = screen.getByText('Cancer risk').closest('tr')!;
    expect(
      within(row)
        .getAllByRole('cell')
        .map((c) => c.textContent),
    ).toEqual(['not quantified', '2.0e-6', '-']);
  });
});
