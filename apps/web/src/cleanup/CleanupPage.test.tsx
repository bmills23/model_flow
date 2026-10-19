import { fireEvent, render, screen, within } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';
import { CleanupPage } from './CleanupPage';
import { clearHouseholdFeed, setHouseholdFeed } from '../household/feeds';

async function loaded() {
  render(<CleanupPage />);
  await screen.findByText(/890 chemicals/i, undefined, { timeout: 20000 });
}

async function addChemical(query: string, name: RegExp) {
  fireEvent.change(screen.getByLabelText(/find a chemical/i), { target: { value: query } });
  fireEvent.click(await screen.findByRole('button', { name }));
}

async function withBenzene() {
  await loaded();
  await addChemical('71-43-2', /add benzene/i);
}

afterEach(() => clearHouseholdFeed());

describe('CleanupPage', () => {
  it('has its heading and asks for a chemical first', async () => {
    await loaded();
    expect(screen.getByRole('heading', { level: 1, name: /cleanup levels/i })).toBeTruthy();
    expect(screen.getByText(/add a chemical to start/i)).toBeTruthy();
  }, 30000);

  it('computes individual levels with no concentration entered and shows the limiting endpoint', async () => {
    await withBenzene();
    const region = await screen.findByRole('region', { name: /cleanup levels, modern/i });
    expect(within(region).getAllByText(/groundwater/i).length).toBeGreaterThan(0);
    expect(within(region).getAllByText(/^cancer$/i).length).toBeGreaterThan(0);
    expect(screen.getByRole('region', { name: /cleanup levels, legacy/i })).toBeTruthy();
  }, 30000);

  it('says not quantified instead of showing zero or a missing value as a level', async () => {
    await withBenzene();
    const region = await screen.findByRole('region', { name: /not quantified/i });
    expect(within(region).getAllByText(/benzene/i).length).toBeGreaterThan(0);
  }, 30000);

  it('switches among individual, cumulative and equal allocation', async () => {
    await withBenzene();
    await screen.findByRole('region', { name: /cleanup levels, modern/i });
    const equal = screen.getByRole('radio', { name: /equal/i });
    fireEvent.click(equal);
    expect((await screen.findAllByText(/target divided equally/i)).length).toBeGreaterThan(0);
    fireEvent.click(screen.getByRole('radio', { name: /cumulative/i }));
    // cumulative needs entered concentrations: the card now offers them and the page asks for them
    const card = screen.getByRole('group', { name: /benzene/i });
    expect(await screen.findByText(/enter a concentration/i)).toBeTruthy();
    fireEvent.change(within(card).getByLabelText(/groundwater \(mg\/L\)/i), {
      target: { value: '0.01' },
    });
    expect((await screen.findAllByText(/common scale/i)).length).toBeGreaterThan(0);
  }, 30000);

  it('hides the concentration fields in individual mode', async () => {
    await withBenzene();
    const card = screen.getByRole('group', { name: /benzene/i });
    expect(within(card).queryByLabelText(/groundwater \(mg\/L\)/i)).toBeNull();
  }, 30000);

  it('shows the water and soil levels behind the air levels for the household run', async () => {
    setHouseholdFeed({
      chemicalId: '71-43-2',
      label: 'Benzene, household run',
      coefficients: { bathroomAir: 0.002, sprayAir: 5e-5, particulateAir: 2e-9 },
      methods: {},
    });
    await withBenzene();
    const region = await screen.findByRole('region', { name: /household source levels/i });
    expect(within(region).getAllByText(/tap water \(shower air\)/i).length).toBeGreaterThan(0);
    expect(
      within(region).getAllByText(/surface soil \(windblown particulates\)/i).length,
    ).toBeGreaterThan(0);
  }, 30000);

  it('shows no household panel without a household run for the chemical', async () => {
    await withBenzene();
    await screen.findByRole('region', { name: /cleanup levels, modern/i });
    expect(screen.queryByRole('region', { name: /household source levels/i })).toBeNull();
  }, 30000);

  it('recomputes when the target risk changes', async () => {
    await withBenzene();
    const region = await screen.findByRole('region', { name: /cleanup levels, modern/i });
    const before = region.textContent;
    fireEvent.change(screen.getByLabelText(/target cancer risk/i), { target: { value: '1e-5' } });
    await screen.findByRole('region', { name: /cleanup levels, modern/i });
    expect(screen.getByRole('region', { name: /cleanup levels, modern/i }).textContent).not.toBe(
      before,
    );
  }, 30000);

  it('offers a second receptor and the additive option', async () => {
    await withBenzene();
    fireEvent.click(screen.getByRole('checkbox', { name: /second receptor/i }));
    expect(screen.getByRole('group', { name: 'Receptor B' })).toBeTruthy();
    expect(screen.getByRole('checkbox', { name: /add the two receptors/i })).toBeTruthy();
  }, 30000);

  it('lists warnings with their codes', async () => {
    await withBenzene();
    const w = await screen.findByRole('region', { name: /warnings and notes/i });
    expect(within(w).getAllByText(/cleanup\.|exposure\./).length).toBeGreaterThan(0);
  }, 30000);

  it('offers the probabilistic cleanup panel for a direct source', async () => {
    await withBenzene();
    const panel = await screen.findByRole('region', { name: /probabilistic cleanup level/i });
    expect(within(panel).getByRole('button', { name: /run probabilistic cleanup/i })).toBeTruthy();
  }, 30000);

  it('says a modeled source is not sampled', async () => {
    await withBenzene();
    fireEvent.click(screen.getByRole('radio', { name: /groundwater source/i }));
    expect((await screen.findAllByText(/not sampled yet/i)).length).toBeGreaterThan(0);
    expect(screen.queryByRole('region', { name: /probabilistic cleanup level/i })).toBeNull();
  }, 30000);
});
