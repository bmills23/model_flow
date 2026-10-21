import { act, render, screen, within } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';
import { clearWellFeed, setWellFeed } from '../transport/wellFeed';
import { getScreen, newProject, setScreen } from '../project/store';
import { ReportPage } from './ReportPage';

afterEach(() => {
  clearWellFeed();
  newProject();
});

function householdOnWell(): void {
  const h = getScreen('household');
  setScreen('household', {
    form: { ...h.form, waterConcentration: '9', irrigationWaterSource: 'well' },
  });
}

describe('report stale marks', () => {
  it('says so next to the heading and in the notes of a section computed from a stale feed', () => {
    householdOnWell();
    act(() =>
      setWellFeed({
        method: 'modern',
        label: 'Receptor well',
        times: [0, 10],
        values: [0, 1e-6],
      }),
    );
    render(<ReportPage />);
    const heading = screen.getByRole('heading', { name: 'Household water and soil air' });
    const section = heading.closest('section')!;
    // fresh: no mark anywhere
    expect(within(section).queryByText(/out of date/i)).toBeNull();

    // the transport inputs now differ from those the well series was sent from
    const t = getScreen('transport');
    act(() => setScreen('transport', { ...t, form: { ...t.form, K: '99' } }));
    const marks = within(section).getAllByText(/out of date/i);
    // the badge and the sentence beside the heading, then the sentence in the notes
    expect(marks.length).toBeGreaterThanOrEqual(2);
    expect(within(section).getByRole('note').textContent).toMatch(
      /Receptor well concentration \(Transport\)/,
    );
    expect(section.querySelector('ul.report-notes')?.textContent).toMatch(/out of date/i);
  });

  it('does not mark a section that does not read the stale feed', () => {
    householdOnWell();
    const v = getScreen('vadose');
    setScreen('vadose', { form: { ...v.form, infiltration: '0.4' } });
    act(() =>
      setWellFeed({
        method: 'modern',
        label: 'Receptor well',
        times: [0, 10],
        values: [0, 1e-6],
      }),
    );
    render(<ReportPage />);
    const t = getScreen('transport');
    act(() => setScreen('transport', { ...t, form: { ...t.form, K: '99' } }));
    const vadose = screen.getByRole('heading', { name: 'Vadose leaching' }).closest('section')!;
    expect(within(vadose).queryByText(/out of date/i)).toBeNull();
  });
});
