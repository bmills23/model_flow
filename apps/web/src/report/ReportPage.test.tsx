import { fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';
import { newProject, setOverrides, setScreen, getScreen } from '../project/store';
import { emptyOverrides, setField } from '../overrides/model';
import { ReportPage } from './ReportPage';

afterEach(() => newProject());

describe('ReportPage', () => {
  it('says there is nothing to report for a new project', () => {
    render(<ReportPage />);
    expect(screen.getByText(/nothing to report yet/i)).toBeTruthy();
    expect(screen.getByText(/No methods were run/i)).toBeTruthy();
  });

  it('prints the inputs, the methods run and their numbered references for an edited screen', () => {
    const v = getScreen('vadose');
    setScreen('vadose', { ...v, form: { ...v.form, foc: '0.0123' } } as typeof v);
    render(<ReportPage />);
    expect(screen.getByRole('heading', { name: 'Vadose leaching' })).toBeTruthy();
    expect(screen.getByText('0.0123')).toBeTruthy();
    expect(screen.getByRole('heading', { name: /Methods statement/ })).toBeTruthy();
    const refs = screen.getByRole('heading', { name: 'References' }).nextElementSibling!;
    expect(refs.tagName).toBe('OL');
    expect(refs.children.length).toBeGreaterThan(0);
    expect(screen.getByText(/not affiliated with/i)).toBeTruthy();
  });

  it('prints the result tables and engine warnings of a used screen', async () => {
    const v = getScreen('vadose');
    setScreen('vadose', { ...v, form: { ...v.form, foc: '0.0123' } } as typeof v);
    render(<ReportPage />);
    expect(screen.getByText(/computing results/i)).toBeTruthy();
    const heading = await screen.findByRole('heading', { name: 'Results' });
    const section = heading.closest('section')!;
    expect(section.querySelectorAll('table.result-table').length).toBeGreaterThan(0);
    expect(section.querySelector('table.result-table td[data-label]')).not.toBeNull();
    expect(screen.getByRole('heading', { name: 'Warnings and notes' })).toBeTruthy();
  });

  it('draws each chart of a used screen with its data table open and no toggle', async () => {
    const v = getScreen('vadose');
    setScreen('vadose', { ...v, form: { ...v.form, foc: '0.0123' } } as typeof v);
    render(<ReportPage />);
    const heading = await screen.findByRole('heading', { name: 'Charts' });
    const charts = heading.closest('.report-charts')!;
    const figures = charts.querySelectorAll('figure').length;
    expect(figures).toBeGreaterThanOrEqual(3);
    expect(charts.querySelectorAll('svg[role="img"]').length).toBe(figures);
    expect(charts.querySelectorAll('.table-view table').length).toBe(figures);
    expect(screen.queryByRole('button', { name: /show data table/i })).toBeNull();
    expect(screen.queryByRole('button', { name: /hide data table/i })).toBeNull();
  });

  it('prints why a screen was not computed', async () => {
    const t = getScreen('transport');
    setScreen('transport', { ...t, form: { ...t.form, K: 'abc' } });
    render(<ReportPage />);
    expect(await screen.findByText(/^Not computed/)).toBeTruthy();
  });

  it('shows the prepared by line only once the user fills it', () => {
    render(<ReportPage />);
    expect(screen.queryByText('Prepared by')).toBeNull();
    fireEvent.change(screen.getByLabelText(/Prepared by/), { target: { value: 'A. Analyst' } });
    expect(screen.getByText('A. Analyst')).toBeTruthy();
    expect(screen.getByText('Prepared by')).toBeTruthy();
  });

  it('offers uncertainty results as an explicit control that is off until ticked', async () => {
    const u = getScreen('uncertainty');
    setScreen('uncertainty', { ...u, risk: { ...u.risk, seed: 'g2' } });
    render(<ReportPage />);
    const box = (await screen.findByLabelText(/include uncertainty results/i)) as HTMLInputElement;
    expect(box.checked).toBe(false);
    expect(screen.queryByLabelText('Exposure uncertainty results')).toBeNull();
    fireEvent.click(box);
    expect(await screen.findByText(/nothing to run|not run/i)).toBeTruthy();
  });

  it('lists the values the user supplied, with the database value and the source note', async () => {
    setOverrides({
      ...emptyOverrides(),
      toxicity: setField({}, '71-43-2', 'sfo', { value: '0.9', note: 'state agency memo 2026' }),
    });
    render(<ReportPage />);
    const heading = await screen.findByRole('heading', { name: 'Values supplied by the user' });
    const section = heading.closest('section')!;
    expect(section.textContent).toContain('Benzene');
    expect(section.textContent).toContain('Oral slope factor');
    expect(section.textContent).toContain('0.9');
    expect(section.textContent).toContain('state agency memo 2026');
    expect(section.querySelector('caption')).not.toBeNull();
    expect(section.querySelectorAll('th[scope="col"]').length).toBeGreaterThanOrEqual(5);
  });

  it('lists the receptor factors and names the user supplied, with the preset value', () => {
    setOverrides({
      ...emptyOverrides(),
      receptors: setField({}, 'risk.a', 'legacy.bwKg', { value: '60', note: '' }),
      receptorNames: { 'risk.a': 'North lot worker' },
    });
    render(<ReportPage />);
    const heading = screen.getByRole('heading', { name: 'Receptor factors supplied by the user' });
    const section = heading.closest('section')!;
    expect(section.textContent).toContain('North lot worker');
    expect(section.textContent).toContain('Body weight (legacy)');
    expect(section.textContent).toContain('70');
    expect(section.textContent).toContain('60');
    expect(section.querySelector('caption')).not.toBeNull();
  });

  it('has no user values section without overrides', () => {
    render(<ReportPage />);
    expect(screen.queryByRole('heading', { name: 'Values supplied by the user' })).toBeNull();
    expect(
      screen.queryByRole('heading', { name: 'Receptor factors supplied by the user' }),
    ).toBeNull();
  });
});
