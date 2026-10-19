import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';
import { TPH_SURROGATE_IDS } from '@model-flow/engine';
import { PlantsEcoPage } from './PlantsEcoPage';
import { clearProduceFeed, getProduceFeed } from './feeds';
import { forgetMemory, getScreen } from '../project/store';

afterEach(clearProduceFeed);

function fill(label: RegExp, value: string) {
  fireEvent.change(screen.getByLabelText(label), { target: { value } });
}

async function pickLead() {
  fireEvent.change(await screen.findByLabelText(/find a chemical/i), { target: { value: 'lead' } });
  const buttons = await screen.findAllByRole('button', { name: /^add lead and compounds/i });
  fireEvent.click(buttons[0]!);
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
    expect(feed?.chemicalId).toContain('7439-92-1');
    expect(feed?.method).toBe('plantUptake.hhrap-2005');
    expect(Object.keys(feed!.factors).length).toBeGreaterThan(0);
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
  });
});
