import { render, screen, within } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { buildProject, defaultScreens, type Screens } from '../project';
import { buildReport } from './buildReport';
import type { ProjectResults } from './results';
import { ReportView } from './ReportPage';

const NOW = new Date('2026-10-23T12:00:00.000Z');

function report() {
  const screens = defaultScreens();
  screens.transport = {
    ...screens.transport,
    form: { ...screens.transport.form, K: '12.5' },
  } as Screens['transport'];
  return buildReport(buildProject({ screens, createdWith: '0.1.0', now: NOW }));
}

const base = { warnings: [], notes: [], charts: [] };

const results: ProjectResults = {
  transport: {
    ...base,
    tables: [
      {
        name: 'transport-results',
        label: 'results',
        columns: [{ key: 'c', header: 'concentration', unit: 'mg/L' }],
        rows: [{ c: 8 }],
      },
    ],
    current: { chemical: 'Methyl tert-butyl ether', sentTo: null },
    chemicals: [
      {
        chemicalId: '71-43-2',
        name: 'Benzene',
        sent: ['Receptor well concentration sent to the exposure and risk screen: Receptor well'],
        inputs: [{ label: 'Seepage velocity', value: '37.9 m/yr' }],
        notes: [],
        tables: [
          {
            name: 'transport-well-series-71-43-2',
            label: 'receptor well concentration',
            columns: [
              { key: 't', header: 'time', unit: 'yr' },
              { key: 'c', header: 'concentration', unit: 'mg/L' },
            ],
            rows: [
              { t: 0, c: 0 },
              { t: 1, c: 2 },
            ],
          },
        ],
      },
    ],
  },
};

describe('the report section of a fate screen with sent results', () => {
  it('prints a named block per chemical with its inputs and table, then labels the run on the screen', () => {
    render(<ReportView report={report()} preparedBy="" results={results} />);
    const block = screen.getByRole('region', { name: 'Benzene' });
    expect(within(block).getByRole('heading', { name: 'Benzene' })).toBeTruthy();
    expect(within(block).getByText('Seepage velocity')).toBeTruthy();
    expect(within(block).getByText('37.9 m/yr')).toBeTruthy();
    const table = within(block).getByRole('table', { name: 'receptor well concentration' });
    expect(table.querySelectorAll('tbody tr')).toHaveLength(2);
    expect(block.textContent).not.toMatch(/71-43-2/);
    const label = screen.getByText(/Run on the screen now: Methyl tert-butyl ether/);
    expect(label.closest('p')!.textContent).toMatch(/was not sent to another screen/);
    // the block comes before the screen's own run
    expect(block.compareDocumentPosition(label) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
  });

  it('says a run was sent when it was', () => {
    const sent: ProjectResults = {
      transport: {
        ...results.transport!,
        current: { chemical: 'Benzene', sentTo: 'the exposure and risk screen' },
      },
    };
    render(<ReportView report={report()} preparedBy="" results={sent} />);
    expect(screen.getByText(/Run on the screen now: Benzene/).closest('p')!.textContent).toMatch(
      /Its result was sent to the exposure and risk screen/,
    );
  });
});

describe('a run on the screen that changed after it was sent', () => {
  it('names the block as the sent run and the tables that follow as the current screen run, not sent', () => {
    const changed: ProjectResults = {
      transport: {
        ...results.transport!,
        current: {
          chemical: 'Benzene',
          sentTo: null,
          changedSince: 'the exposure and risk screen',
        },
      },
    };
    render(<ReportView report={report()} preparedBy="" results={changed} />);
    const label = screen.getByText(/Run on the screen now: Benzene/).closest('p')!;
    expect(label.textContent).toMatch(
      /inputs have changed since a result was sent to the exposure and risk screen/,
    );
    expect(label.textContent).toMatch(
      /block above shows the run that was sent to it, not this one/,
    );
    expect(label.textContent).toMatch(
      /What follows in this section is the current run on the screen, which was not sent/,
    );
    expect(label.textContent).not.toMatch(/Its result was sent/);
    expect(label.textContent).not.toMatch(/What follows in this section is this run\./);
  });

  it('keeps both statements when one send matches the screen and another does not', () => {
    const both: ProjectResults = {
      transport: {
        ...results.transport!,
        current: {
          chemical: 'Benzene',
          sentTo: 'the surface water screen',
          changedSince: 'the exposure and risk screen',
        },
      },
    };
    render(<ReportView report={report()} preparedBy="" results={both} />);
    const text = screen.getByText(/Run on the screen now: Benzene/).closest('p')!.textContent!;
    expect(text).toMatch(/Its result was sent to the surface water screen/);
    expect(text).toMatch(/changed since a result was sent to the exposure and risk screen/);
  });
});

describe('the method basis and a disagreement', () => {
  it('flags a disagreement on an exceedance and names the basis and the sensitivity', () => {
    const rep = report();
    const res: ProjectResults = {
      transport: {
        ...results.transport!,
        methodBasis: {
          basis: 'modern method',
          statement:
            'The conclusions in this section rest on the modern method, the method shown on the screen. The legacy method is printed as a sensitivity check and is not the basis of any conclusion here.',
          disagreements: [
            'Trichloroethylene, surface water, organism only (freshwater): legacy ratio 1.02 (exceeds), modern ratio 0.3 (does not exceed).',
          ],
        },
      },
    };
    render(<ReportView report={rep} preparedBy="" results={res} />);
    expect(screen.getByText(/Method basis\./)).toBeTruthy();
    const note = screen.getByText('Methods disagree').closest('[role="note"]')!;
    expect(note.textContent).toMatch(
      /follows the modern method; the other result is a sensitivity/,
    );
    expect(note.textContent).toMatch(/legacy ratio 1\.02 \(exceeds\), modern ratio 0\.3/);
  });

  it('prints no disagreement note when the methods agree', () => {
    const res: ProjectResults = {
      transport: {
        ...results.transport!,
        methodBasis: { basis: 'legacy method', statement: 'x', disagreements: [] },
      },
    };
    render(<ReportView report={report()} preparedBy="" results={res} />);
    expect(screen.queryByText('Methods disagree')).toBeNull();
  });
});

describe('a value that could not be quantified', () => {
  it('prints "not quantified" in the value cell and the reason beside it, never 0', () => {
    const res: ProjectResults = {
      transport: {
        ...base,
        tables: [
          {
            name: 'risk-contributions',
            label: 'by pathway and chemical',
            columns: [
              { key: 'item', header: 'pathway or chemical' },
              { key: 'cancerRisk', header: 'incremental lifetime cancer risk', unit: '-' },
              { key: 'note', header: 'not quantified because' },
            ],
            rows: [
              {
                item: 'Toluene',
                cancerRisk: null,
                note: 'cancer risk: no cancer toxicity value for this route',
              },
            ],
            missing: { keys: ['cancerRisk'], because: 'note' },
          },
        ],
      },
    };
    render(<ReportView report={report()} preparedBy="" results={res} />);
    const row = screen.getByText('Toluene').closest('tr')!;
    expect(
      within(row)
        .getAllByRole('cell')
        .map((c) => c.textContent),
    ).toEqual([
      'Toluene',
      'not quantified',
      'cancer risk: no cancer toxicity value for this route',
    ]);
  });
});
