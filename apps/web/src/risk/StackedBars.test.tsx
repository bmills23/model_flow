import { cleanup, render, screen, within } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';
import { StackedBars } from './StackedBars';
import { fmtRisk, type BarRow } from './chartData';

afterEach(cleanup);

const rows: BarRow[] = [
  {
    label: 'Resident, legacy',
    total: 2e-6,
    segments: [{ id: 'waterIngestion', label: 'Drinking water', value: 2e-6, slot: 0 }],
    gaps: { 'Bathing dermal contact': 'an exposure input is missing' },
    totalGap: null,
    partialOmits: [],
  },
  {
    label: 'Worker, legacy',
    total: 0,
    segments: [],
    gaps: {},
    totalGap: 'no cancer toxicity value for this route',
    partialOmits: [],
  },
];

describe('StackedBars table of values', () => {
  it('reads "not quantified" for a gap and for a total nothing quantified, and 0 only for a true zero', () => {
    render(
      <StackedBars
        by="Pathway"
        title="Cancer risk by pathway"
        rows={[
          rows[0]!,
          { ...rows[1]!, gaps: {}, totalGap: null, partialOmits: [] },
          { ...rows[1]!, label: 'Worker, modern' },
        ]}
        fmt={fmtRisk}
        unit="risk"
        ariaLabel="x"
      />,
    );
    const table = screen.getByRole('table', { hidden: true });
    const dermal = within(table).getByText('Bathing dermal contact').closest('tr')!;
    expect(
      within(dermal)
        .getAllByRole('cell')
        .map((c) => c.textContent),
    ).toEqual(['not quantified', '0', '0']);
    const total = within(table).getByText('Total').closest('tr')!;
    expect(
      within(total)
        .getAllByRole('cell')
        .map((c) => c.textContent),
    ).toEqual(['2.0e-6', '0', 'not quantified']);
  });
});

describe('StackedBars, a partial total', () => {
  it('marks the total partial and names the omitted pathways beside it and in the table', () => {
    render(
      <StackedBars
        by="Pathway"
        title="Cancer risk by pathway"
        rows={[{ ...rows[0]!, gaps: {}, partialOmits: ['Bathing dermal contact'] }]}
        fmt={fmtRisk}
        unit="risk"
        ariaLabel="x"
      />,
    );
    expect(screen.getAllByText(/partial total, omits Bathing dermal contact/).length).toBe(2);
    expect(screen.getAllByText(/2\.0e-6/).length).toBeGreaterThan(0);
  });
});
