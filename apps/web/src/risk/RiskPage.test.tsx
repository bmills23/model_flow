import { fireEvent, render, screen, within } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';
import { clearWellFeed, setWellFeed } from '../transport/wellFeed';
import { clearVaporRiskFeed, setVaporRiskFeed } from '../vapor/feeds';
import { RiskPage } from './RiskPage';

afterEach(() => {
  clearWellFeed();
  clearVaporRiskFeed();
});

async function loaded() {
  render(<RiskPage />);
  await screen.findByText(/890 chemicals/i, undefined, { timeout: 20000 });
}

async function addChemical(query: string, name: RegExp) {
  fireEvent.change(screen.getByLabelText(/find a chemical/i), { target: { value: query } });
  fireEvent.click(await screen.findByRole('button', { name }));
}

async function withBenzene() {
  await loaded();
  await addChemical('71-43-2', /add benzene/i);
  const card = screen.getByRole('group', { name: /benzene/i });
  fireEvent.change(within(card).getByLabelText(/groundwater \(mg\/L\)/i), {
    target: { value: '0.005' },
  });
  return card;
}

describe('RiskPage', () => {
  it('has its heading, loads the chemical list on demand and says which edition it is', async () => {
    await loaded();
    expect(screen.getByRole('heading', { level: 1, name: /exposure and risk/i })).toBeTruthy();
    expect(screen.getByText(/november 2024/i)).toBeTruthy();
    expect(screen.getByText(/add a chemical to start/i)).toBeTruthy();
  }, 30000);

  it('searches by name and by CAS number and adds a chemical once', async () => {
    await loaded();
    fireEvent.change(screen.getByLabelText(/find a chemical/i), { target: { value: 'benzene' } });
    const first = await screen.findByRole('button', { name: /add benzene \(71-43-2\)/i });
    fireEvent.click(first);
    expect(screen.getAllByRole('group', { name: /benzene/i })).toHaveLength(1);
    fireEvent.change(screen.getByLabelText(/find a chemical/i), { target: { value: '71-43-2' } });
    expect(screen.queryByRole('button', { name: /add benzene \(71-43-2\)/i })).toBeNull();
    expect(screen.getByText(/already added/i)).toBeTruthy();
  }, 30000);

  it('shows every toxicity value with the source it came from, next to it', async () => {
    await loaded();
    await addChemical('71-43-2', /add benzene/i);
    const card = screen.getByRole('group', { name: /benzene/i });
    const table = within(card).getByRole('table', { name: /toxicity values/i });
    const rows = within(table).getAllByRole('row').slice(1);
    expect(rows).toHaveLength(4);
    for (const row of rows) expect(within(row).getByText('IRIS')).toBeTruthy();
    expect(within(table).getByText('0.055')).toBeTruthy();
    expect(within(table).getByText(/\(mg\/kg-d\)\^-1/)).toBeTruthy();
  }, 30000);

  it('computes both methods from an entered concentration and compares them', async () => {
    await withBenzene();
    const cmp = await screen.findByRole('region', { name: /legacy versus modern/i });
    expect(within(cmp).getAllByText(/e-6/).length).toBeGreaterThan(1);
    expect(within(cmp).getAllByText(/^cancer risk$/i).length).toBe(1);
    expect(within(cmp).getAllByText(/^hazard index$/i).length).toBe(1);
  }, 30000);

  it('draws stacked bars of cancer risk and hazard index by pathway and by chemical', async () => {
    await withBenzene();
    for (const name of [
      /cancer risk by pathway/i,
      /cancer risk by chemical/i,
      /hazard index by pathway/i,
      /hazard index by chemical/i,
    ]) {
      expect(await screen.findByRole('img', { name })).toBeTruthy();
    }
  }, 30000);

  it('lists warnings with their codes, tagged by method', async () => {
    await withBenzene();
    const warnings = await screen.findByRole('region', { name: /warnings and notes/i });
    expect(
      within(warnings).getAllByText(/exposure\.not-quantified|exposure\.site-specific/).length,
    ).toBeGreaterThan(0);
    expect(within(warnings).getAllByText(/legacy\./i).length).toBeGreaterThan(0);
  }, 30000);

  it('says what is not quantified instead of showing zero', async () => {
    await withBenzene();
    const region = await screen.findByRole('region', { name: /not quantified/i });
    expect(within(region).getAllByText(/benzene/i).length).toBeGreaterThan(0);
  }, 30000);

  it('offers a second receptor and the additive option', async () => {
    await withBenzene();
    expect(screen.queryByRole('group', { name: /receptor b/i })).toBeNull();
    fireEvent.click(screen.getByRole('checkbox', { name: /second receptor/i }));
    expect(screen.getByRole('group', { name: /receptor b/i })).toBeTruthy();
    fireEvent.click(screen.getByRole('checkbox', { name: /add the two receptors/i }));
    const alerts = await screen.findAllByRole('alert');
    expect(alerts.map((a) => a.textContent).join(' ')).toMatch(/additive/i);
  }, 30000);

  it('feeds the groundwater concentration from the transport well result when one exists', async () => {
    const YR = 365 * 86400;
    setWellFeed({
      method: 'modern',
      label: 'Receptor well, modern method',
      times: [0, 10 * YR, 20 * YR, 40 * YR],
      values: [0, 1e-6, 4e-6, 2e-6],
    });
    await loaded();
    await addChemical('71-43-2', /add benzene/i);
    const card = screen.getByRole('group', { name: /benzene/i });
    fireEvent.click(within(card).getByRole('checkbox', { name: /transport well result/i }));
    const table = await screen.findByRole('table', { name: /exposure point concentrations/i });
    expect(within(table).getAllByText('transport.modern').length).toBeGreaterThan(0);
    expect(within(card).queryByLabelText(/groundwater \(mg\/L\)/i)).toBeNull();
  }, 30000);

  it('shows the vapor origin when indoor and outdoor air come from the vapor screen', async () => {
    const YR = 365 * 86400;
    setVaporRiskFeed({
      chemicalId: '71-43-2',
      label: 'Vapor run, legacy',
      indoor: {
        kind: 'series',
        series: { times: [0, 10 * YR, 20 * YR], values: [2e-8, 1e-8, 5e-9] },
        origin: 'vapor.je-1991',
      },
      outdoor: { kind: 'constant', value: 3e-9, origin: 'outdoorAir.box' },
    });
    await loaded();
    await addChemical('71-43-2', /add benzene/i);
    const card = screen.getByRole('group', { name: /benzene/i });
    fireEvent.click(within(card).getByRole('checkbox', { name: /vapor screen indoor air/i }));
    fireEvent.click(within(card).getByRole('checkbox', { name: /vapor screen outdoor air/i }));
    const table = await screen.findByRole('table', { name: /exposure point concentrations/i });
    expect(within(table).getAllByText('vapor.je-1991').length).toBeGreaterThan(0);
    expect(within(table).getAllByText('outdoorAir.box').length).toBeGreaterThan(0);
    expect(within(card).queryByLabelText(/^indoor air \(mg\/m3\)/i)).toBeNull();
  }, 30000);

  it('does not offer the vapor feed for a chemical it was not run for', async () => {
    setVaporRiskFeed({
      chemicalId: '108-88-3',
      label: 'Vapor run',
      indoor: { kind: 'constant', value: 1e-8, origin: 'vapor.je-1991' },
    });
    await loaded();
    await addChemical('71-43-2', /add benzene/i);
    const card = screen.getByRole('group', { name: /benzene/i });
    expect(within(card).queryByRole('checkbox', { name: /vapor screen indoor air/i })).toBeNull();
  }, 30000);

  it('does not offer the well feed when the transport screen has not produced one', async () => {
    await loaded();
    await addChemical('71-43-2', /add benzene/i);
    const card = screen.getByRole('group', { name: /benzene/i });
    expect(within(card).queryByRole('checkbox', { name: /transport well result/i })).toBeNull();
  }, 30000);

  it('fills in an example and removes a chemical', async () => {
    await loaded();
    fireEvent.click(screen.getByRole('button', { name: /load an example/i }));
    const card = await screen.findByRole('group', { name: /benzene/i });
    expect(await screen.findByRole('region', { name: /legacy versus modern/i })).toBeTruthy();
    fireEvent.click(within(card).getByRole('button', { name: /remove benzene/i }));
    expect(screen.queryByRole('group', { name: /benzene/i })).toBeNull();
  }, 30000);

  it('keeps the last charts and shows the input error when a concentration is invalid', async () => {
    const card = await withBenzene();
    await screen.findByRole('img', { name: /cancer risk by pathway/i });
    fireEvent.change(within(card).getByLabelText(/groundwater \(mg\/L\)/i), {
      target: { value: 'abc' },
    });
    const alerts = await screen.findAllByRole('alert');
    expect(alerts.map((a) => a.textContent).join(' ')).toMatch(/benzene.*groundwater/i);
    expect(screen.getByRole('img', { name: /cancer risk by pathway/i })).toBeTruthy();
  }, 30000);
});
