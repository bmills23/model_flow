import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';
import { TPH_SURROGATE_IDS } from '@model-flow/engine';
import { PlantsEcoPage } from './PlantsEcoPage';
import { clearProduceFeed, clearTphFeed, getProduceFeed, getTphFeed } from './feeds';
import { act } from '@testing-library/react';
import { addChemical, forgetMemory, getScreen } from '../project/store';

afterEach(() => {
  clearProduceFeed();
  clearTphFeed();
});

function fill(label: RegExp, value: string) {
  fireEvent.change(screen.getByLabelText(label), { target: { value } });
}

async function pickLead() {
  act(() => addChemical({ id: '7439-92-1-lead-and-compounds', name: 'Lead and Compounds' }));
  fireEvent.change(await screen.findByLabelText(/^chemical$/i), {
    target: { value: '7439-92-1-lead-and-compounds' },
  });
}

describe('PlantsEcoPage in the project', () => {
  it('starts from the project and writes edits back', () => {
    forgetMemory();
    const { unmount } = render(<PlantsEcoPage />);
    fill(/^soil concentration/i, '10');
    expect(getScreen('plantsEco').form.soilConcentration).toBe('10');
    unmount();
    render(<PlantsEcoPage />);
    expect((screen.getByLabelText(/^soil concentration/i) as HTMLInputElement).value).toBe('10');
    forgetMemory();
  });
});

describe('PlantsEcoPage', () => {
  it('opens on a heading and asks for the inputs it cannot default', () => {
    render(<PlantsEcoPage />);
    expect(
      screen.getByRole('heading', { level: 1, name: /plants, ecology and tph/i }),
    ).toBeTruthy();
    const produce = screen.getByRole('region', { name: /homegrown produce/i });
    expect(within(produce).getByText(/log kow is required/i)).toBeTruthy();
    expect(within(produce).getByText(/moisture fraction.*required/i)).toBeTruthy();
    const send = within(produce).getByRole('button', { name: /send to exposure and risk/i });
    expect((send as HTMLButtonElement).disabled).toBe(true);
  });

  it('shows the plant factors but sends nothing until a chemical is chosen', () => {
    render(<PlantsEcoPage />);
    fill(/^log kow/i, '3');
    fill(/^moisture fraction/i, '0.8');
    fill(/^kd \(l\/kg\)/i, '5');
    fill(/^dry bulk density/i, '1.5');
    fill(/^soil concentration/i, '10');
    const produce = screen.getByRole('region', { name: /homegrown produce/i });
    const table = within(produce).getByRole('table', { name: /plant factors/i });
    expect(within(table).getByText('Root')).toBeTruthy();
    fireEvent.click(within(produce).getByRole('button', { name: /send to exposure and risk/i }));
    // no chemical is chosen, so nothing is sent
    expect(getProduceFeed()).toBeNull();
  });

  it('fills the RSL properties for a chosen chemical and screens it against its Eco-SSLs', async () => {
    render(<PlantsEcoPage />);
    await pickLead();
    fill(/^soil concentration/i, '100');
    const eco = screen.getByRole('region', { name: /ecological screening/i });
    const table = await within(eco).findByRole('table', { name: /eco-ssl hazard quotients/i });
    expect(within(table).getByText('Plants')).toBeTruthy();
    expect(within(eco).getAllByText(/not cleanup levels/i).length).toBeGreaterThan(0);
    expect(within(eco).getAllByText('ECO_SCREENING_ONLY').length).toBeGreaterThan(0);
  }, 30000);

  it('sends the factors once a chemical and every input are set', async () => {
    render(<PlantsEcoPage />);
    await pickLead();
    await waitFor(() =>
      expect((screen.getByLabelText(/^koc/i) as HTMLInputElement).value).not.toBe('x'),
    );
    fill(/^log kow/i, '3');
    fill(/^moisture fraction/i, '0.8');
    fill(/^kd \(l\/kg\)/i, '5');
    fill(/^dry bulk density/i, '1.5');
    const produce = screen.getByRole('region', { name: /homegrown produce/i });
    const send = within(produce).getByRole('button', { name: /send to exposure and risk/i });
    await waitFor(() => expect((send as HTMLButtonElement).disabled).toBe(false));
    fireEvent.click(send);
    const feed = getProduceFeed();
    expect(feed?.chemicalId).toContain('7439-92-1-lead-and-compounds');
    expect(feed?.method).toBe('plantUptake.hhrap-2005');
    expect(Object.keys(feed!.factors).length).toBeGreaterThan(0);
    // the inputs the run used ride with the factors
    const row = (label: string) => feed?.runInputs?.find((r) => r.label === label)?.value;
    expect(row('Soil-water partition coefficient')).toBe('5 L/kg');
    expect(row('Soil dry bulk density')).toBe('1.5 kg/L');
  }, 30000);

  it('builds a TPH composition from the five RSL surrogates and gives a total level', async () => {
    render(<PlantsEcoPage />);
    fireEvent.click(screen.getByText('TPH composition'));
    fireEvent.click(screen.getByRole('button', { name: /start from the five rsl surrogates/i }));
    const masses = screen.getAllByLabelText(/^mass fraction of the tph/i);
    const levels = screen.getAllByLabelText(/^level for a hazard quotient of one/i);
    expect(masses).toHaveLength(TPH_SURROGATE_IDS.length);
    masses.forEach((m, i) => fireEvent.change(m, { target: { value: i < 2 ? '0.5' : '0' } }));
    levels.forEach((l, i) => fireEvent.change(l, { target: { value: i === 0 ? '200' : '1000' } }));
    const tph = screen.getByRole('region', { name: /tph fractions/i });
    // 1 / (0.5/200 + 0.5/1000) = 333.33 mg/kg
    expect(within(tph).getByText(/333/)).toBeTruthy();
    // the total level goes to the cleanup screen on request
    expect(getTphFeed()).toBeNull();
    fireEvent.click(within(tph).getByRole('button', { name: /send total level to cleanup/i }));
    expect(getTphFeed()?.methodId).toBe('tph.tphcwg');
    expect(getTphFeed()?.totalMgPerKg).toBeCloseTo(1000 / 3, 6);
  });

  it('loads the lead surrogates, shows a dose panel with sources and keeps edits in the project', async () => {
    render(<PlantsEcoPage />);
    await pickLead();
    fill(/^soil concentration/i, '100');
    fireEvent.click(screen.getByText('Wildlife dose (site-specific)'));
    const load = screen.getByRole('button', {
      name: /load the surrogates from the eco-ssl document/i,
    });
    await waitFor(() => expect((load as HTMLButtonElement).disabled).toBe(false));
    fireEvent.click(load);
    expect(screen.getAllByLabelText(/^area use factor/i)).toHaveLength(6);
    expect(screen.getAllByText(/prefilled from eco-ssl table/i).length).toBe(6);
    const eco = screen.getByRole('region', { name: /ecological screening/i });
    const table = within(eco).getByRole('table', { name: /wildlife dose hazard quotients/i });
    expect(within(table).getAllByRole('row')).toHaveLength(7);
    expect(within(eco).getAllByText('ECO_SCREENING_ONLY').length).toBeGreaterThan(0);
    fireEvent.change(screen.getAllByLabelText(/^area use factor/i)[0]!, {
      target: { value: '0.5' },
    });
    expect(getScreen('plantsEco').form.wildlifeRows[0]!.auf).toBe('0.5');
  }, 30000);
});

describe('PlantsEcoPage chemical from the project list', () => {
  it('offers the project chemicals, not a database search', () => {
    act(() => addChemical({ id: '108-88-3', name: 'Toluene' }));
    render(<PlantsEcoPage />);
    expect(screen.queryByLabelText(/find a chemical/i)).toBeNull();
    expect(screen.getByRole('option', { name: 'Toluene' })).toBeTruthy();
  });

  it('fills the properties from the RSL once the list chemical is picked', async () => {
    render(<PlantsEcoPage />);
    await pickLead();
    expect(getScreen('plantsEco').form.chemicalId).toBe('7439-92-1-lead-and-compounds');
    expect(getScreen('plantsEco').form.chemicalName).toBe('Lead and Compounds');
    await waitFor(() =>
      expect((screen.getByLabelText(/^kd \(l\/kg\)/i) as HTMLInputElement).value).not.toBe(''),
    );
  }, 30000);

  it('says a list chemical with no RSL properties is unavailable for the fill, and still allows entry', async () => {
    act(() => addChemical({ id: 'user-x', name: 'Own compound' }));
    render(<PlantsEcoPage />);
    fireEvent.change(await screen.findByLabelText(/^chemical$/i), { target: { value: 'user-x' } });
    await screen.findByText(/has no RSL properties/i);
  }, 30000);
});
