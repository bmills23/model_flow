import { fireEvent, render, screen, within } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { clearVadoseFeed, getVadoseFeed } from './feed';
import { VadosePage } from './VadosePage';
import { clearVadoseVaporFeed, getVadoseVaporFeed } from '../vapor/feeds';

import { getScreen, setScreen } from '../project/store';
import { seedVadoseRegression } from './regression.testkit';

// a new project asks for the dispersivity; these tests run on the RISC5 regression, chosen on purpose
beforeEach(() => seedVadoseRegression());

afterEach(() => {
  clearVadoseFeed();
  clearVadoseVaporFeed();
});

async function loaded() {
  render(<VadosePage />);
  await screen.findByRole(
    'img',
    { name: /against depth below the base of the source/i },
    { timeout: 15000 },
  );
}

describe('VadosePage', () => {
  it('opens on the Table R-7 validation case with its citations', async () => {
    await loaded();
    expect(screen.getByRole('heading', { level: 1, name: /vadose zone leaching/i })).toBeTruthy();
    const example = screen.getByRole('region', { name: /table r-7 validation case/i });
    expect(within(example).getByText(/arcadis/i)).toBeTruthy();
    expect(within(example).getByText(/spence/i)).toBeTruthy();
  }, 20000);

  it('tells screen reader users how to operate every focusable chart', async () => {
    await loaded();
    const charts = document.querySelectorAll('svg[tabindex="0"]');
    expect(charts.length).toBeGreaterThanOrEqual(3);
    for (const svg of charts) {
      expect(svg.getAttribute('aria-label')).toMatch(/arrow keys/i);
    }
  }, 20000);

  it('shows the profile, water-table and source charts, the budget and the readouts', async () => {
    await loaded();
    expect(screen.getByRole('img', { name: /concentration at the water table/i })).toBeTruthy();
    expect(
      screen.getByRole('img', { name: /pore-water concentration in the depleting source/i }),
    ).toBeTruthy();
    expect(screen.getByRole('img', { name: /stacked cumulative mass/i })).toBeTruthy();
    const budget = screen.getByRole('region', { name: /mass budget/i });
    expect(within(budget).getByText(/delivered to the water table/i)).toBeTruthy();
    const source = screen.getByRole('region', { name: /source and leaching/i });
    expect(within(source).getAllByText(/224/).length).toBeGreaterThan(0);
  }, 20000);

  it('checks the R-7 case against the published values while the inputs are unchanged', async () => {
    await loaded();
    const check = screen.getByRole('region', { name: /published values/i });
    expect(within(check).getByText(/10\.8/)).toBeTruthy();
    expect(within(check).getAllByText(/within/i).length).toBeGreaterThan(0);
    fireEvent.change(screen.getByLabelText(/^koc/i), { target: { value: '60' } });
    await screen.findByText(/inputs differ from the table r-7 case/i, undefined, {
      timeout: 15000,
    });
  }, 30000);

  it('lists the warning codes of both methods', async () => {
    await loaded();
    const warnings = screen.getByRole('region', { name: /warnings/i });
    expect(within(warnings).getAllByText('vadose.residual-phase').length).toBe(2);
    // the Table R-7 case runs on the unsourced regression, so both methods say so
    expect(within(warnings).getAllByText('vadose.dispersivity-regression-unsourced').length).toBe(
      2,
    );
  }, 20000);

  it('asks a new project for the dispersivity and computes once one is chosen', async () => {
    setScreen('vadose', {
      form: { ...getScreen('vadose').form, dispersivityBasis: 'entered', alphaL: '' },
    });
    render(<VadosePage />);
    const alert = await screen.findByRole('alert');
    expect(alert.textContent).toMatch(/longitudinal dispersivity is required/i);
    expect(
      (screen.getByRole('radio', { name: /^entered value/i }) as HTMLInputElement).checked,
    ).toBe(true);
    expect(
      screen.queryByRole('img', { name: /against depth below the base of the source/i }),
    ).toBeNull();
    fireEvent.change(screen.getByLabelText(/longitudinal dispersivity \(m\)/i), {
      target: { value: '0.4' },
    });
    await screen.findByRole(
      'img',
      { name: /against depth below the base of the source/i },
      { timeout: 15000 },
    );
    const warnings = screen.getByRole('region', { name: /warnings/i });
    expect(within(warnings).queryByText('vadose.dispersivity-regression-unsourced')).toBeNull();
  }, 40000);

  it('labels the regression as having no primary source and hides the entry while it is chosen', async () => {
    await loaded();
    expect(
      screen.getByRole('radio', { name: /RISC5 regression \(no primary source\)/i }),
    ).toBeTruthy();
    expect(screen.queryByLabelText(/longitudinal dispersivity \(m\)/i)).toBeNull();
  }, 20000);

  it('switches to the modern method and reports how it was evaluated', async () => {
    await loaded();
    fireEvent.click(screen.getByRole('radio', { name: /modern layered/i }));
    const source = screen.getByRole('region', { name: /source and leaching/i });
    expect(
      within(source).getByText(/analytic solution \(van Genuchten and Alves case C14\)/i),
    ).toBeTruthy();
  }, 20000);

  it('replaces the results with a message when an input is invalid', async () => {
    await loaded();
    fireEvent.change(screen.getByLabelText(/^infiltration/i), { target: { value: '-1' } });
    const alert = await screen.findByRole('alert');
    expect(alert.textContent).toMatch(/infiltration/i);
    // the last good charts stay on screen beside the message
    expect(
      screen.getByRole('img', { name: /against depth below the base of the source/i }),
    ).toBeTruthy();
  }, 20000);

  it('says why the legacy method is not shown when the profile has several layers below the source', async () => {
    await loaded();
    fireEvent.click(screen.getByRole('button', { name: /add layer below the source/i }));
    await screen.findAllByText(/more than one/i, undefined, { timeout: 15000 });
    expect(screen.getAllByText(/legacy method describes one layer below/i).length).toBeGreaterThan(
      0,
    );
  }, 30000);

  it('offers the result to the groundwater screen', async () => {
    await loaded();
    expect(getVadoseFeed()).toBeNull();
    fireEvent.click(screen.getByRole('button', { name: /use as groundwater source/i }));
    expect(getVadoseFeed()?.method).toBe('legacy');
    expect(screen.getByRole('link', { name: /open groundwater transport/i })).toBeTruthy();
  }, 20000);

  it('offers the source pore water to the vapor screen', async () => {
    await loaded();
    expect(getVadoseVaporFeed()).toBeNull();
    fireEvent.click(screen.getByRole('button', { name: /use as vapor source/i }));
    const feed = getVadoseVaporFeed();
    expect(feed?.kind).toBe('poreWater');
    expect(feed && 'series' in feed && feed.series.times.length).toBeGreaterThan(2);
    expect(screen.getByRole('link', { name: /open vapor intrusion/i })).toBeTruthy();
  }, 20000);

  it('fills a layer from a texture preset and keeps a later edit', async () => {
    await loaded();
    const source = screen.getByRole('group', { name: /source soil/i });
    fireEvent.change(within(source).getByLabelText(/^texture preset/i), { target: { value: 'S' } });
    expect((within(source).getByLabelText(/^porosity/i) as HTMLInputElement).value).toBe('0.375');
    expect((within(source).getByLabelText(/^van genuchten n/i) as HTMLInputElement).value).toBe(
      '3.177',
    );
    fireEvent.change(within(source).getByLabelText(/^porosity/i), { target: { value: '0.4' } });
    expect((within(source).getByLabelText(/^porosity/i) as HTMLInputElement).value).toBe('0.4');
  }, 30000);

  it('tags both feeds it sends with the screen chemical', async () => {
    const prior = getScreen('vadose');
    const before = prior.form;
    setScreen('vadose', { ...prior, form: { ...before, chemicalId: '71-43-2' } });
    try {
      await loaded();
      fireEvent.click(screen.getByRole('button', { name: /use as groundwater source/i }));
      fireEvent.click(screen.getByRole('button', { name: /use as vapor source/i }));
      expect(getVadoseFeed()?.chemicalId).toBe('71-43-2');
      expect(getVadoseVaporFeed()?.chemicalId).toBe('71-43-2');
    } finally {
      setScreen('vadose', prior);
    }
  }, 30000);
});
