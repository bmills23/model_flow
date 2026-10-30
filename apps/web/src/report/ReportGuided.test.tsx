import { render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeAll, describe, expect, it } from 'vitest';
import { loadProject, newProject, setScreen, getScreen } from '../project/store';
import { loadVaporChemicals } from '../vapor/chemicals';
import type { GuidedState } from '../guided/state';
import { ReportPage, WorkbenchReportPage } from './ReportPage';
import { STEPS_NOT_RUN } from './guidedSource';
import { afterRun, chemicalData, guidedProject, wellSite } from './guidedReport.testkit';
import { guidedWith, setValue } from '../guided/forms.testkit';

afterEach(() => newProject());

let ran: GuidedState;
beforeAll(async () => {
  ran = afterRun(wellSite(), chemicalData(await loadVaporChemicals()));
}, 60000);

const SLOW = { timeout: 30000 };

describe('the report route', () => {
  it('prints the guided report when the project holds guided outputs', async () => {
    loadProject(guidedProject(ran));
    render(<ReportPage />);
    expect(await screen.findByRole('heading', { name: 'Guided steps' }, SLOW)).toBeTruthy();
    expect(screen.getByRole('heading', { name: 'Groundwater transport' })).toBeTruthy();
    expect(screen.queryByText(STEPS_NOT_RUN)).toBeNull();
    // one block per chemical in each model's section: groundwater transport, then shower and irrigation
    expect(await screen.findAllByRole('region', { name: 'Benzene' }, SLOW)).toHaveLength(2);
    expect(screen.getAllByRole('region', { name: 'MTBE' })).toHaveLength(2);
    expect(screen.getAllByRole('heading', { name: 'Charts, MTBE' }).length).toBeGreaterThan(0);
    expect(screen.getByText(/counted as 0.25 mg\/L, half the limit/)).toBeTruthy();
    expect(screen.queryByText(/Run on the screen now/)).toBeNull();
  }, 60000);

  it('prints the guided report for measured concentrations, which have no Run outputs', async () => {
    const g = guidedWith((x) => {
      x.site.basis = 'measured';
      x.site.measured = ['groundwater'];
      setValue(x, '1634-04-4', 'groundwater', '4', 'mg/L');
    });
    loadProject(guidedProject(g));
    render(<ReportPage />);
    expect(await screen.findByRole('heading', { name: 'Guided steps' }, SLOW)).toBeTruthy();
    expect(screen.queryByText(STEPS_NOT_RUN)).toBeNull();
    await waitFor(() => expect(screen.queryByText(/computing results/i)).toBeNull(), SLOW);
  }, 60000);

  it("prints today's report with one line saying the steps have not been run", async () => {
    const v = getScreen('vadose');
    setScreen('vadose', { ...v, form: { ...v.form, foc: '0.0123' } } as typeof v);
    render(<ReportPage />);
    expect(screen.getByText(STEPS_NOT_RUN)).toBeTruthy();
    expect(screen.getByRole('heading', { name: 'Vadose leaching' })).toBeTruthy();
    expect(screen.queryByRole('heading', { name: 'Guided steps' })).toBeNull();
    await waitFor(() => expect(screen.queryByText(/computing results/i)).toBeNull(), SLOW);
  }, 60000);

  it("the workbench report always prints today's report", async () => {
    loadProject(guidedProject(ran));
    render(<WorkbenchReportPage />);
    expect(screen.queryByRole('heading', { name: 'Guided steps' })).toBeNull();
    expect(screen.queryByText(STEPS_NOT_RUN)).toBeNull();
    expect(screen.getByText(/nothing to report yet/i)).toBeTruthy();
    await waitFor(() => expect(screen.queryByText(/computing results/i)).toBeNull(), SLOW);
  }, 60000);
});
