import { fireEvent, render, screen, within } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';
import { clearSaturatedFeed, getSaturatedFeed } from './feed';
import { SaturatedPage } from './SaturatedPage';
import { clearSaturatedVaporFeed, getSaturatedVaporFeed } from '../vapor/feeds';

afterEach(() => {
  clearSaturatedFeed();
  clearSaturatedVaporFeed();
});

async function loaded() {
  render(<SaturatedPage />);
  await screen.findByRole('img', { name: /release rate/i }, { timeout: 15000 });
}

describe('SaturatedPage', () => {
  it('opens on hand case A with its heading and a note about the case', async () => {
    await loaded();
    expect(screen.getByRole('heading', { level: 1, name: /saturated soil source/i })).toBeTruthy();
    expect(screen.getByRole('region', { name: /worked example/i })).toBeTruthy();
  }, 20000);

  it('draws the cross-section, the release-rate chart with the depletion time and the remaining-mass chart', async () => {
    await loaded();
    expect(screen.getByRole('img', { name: /cross-section/i })).toBeTruthy();
    const rate = screen.getByRole('img', { name: /release rate/i });
    expect(within(rate).getByText(/t_d/)).toBeTruthy();
    expect(screen.getByRole('img', { name: /remaining mass/i })).toBeTruthy();
  }, 20000);

  it('shows the region table with M0, the depletion time and the rates', async () => {
    await loaded();
    const table = screen.getByRole('region', { name: /regions and release/i });
    expect(within(table).getAllByText(/region 1/i).length).toBeGreaterThan(0);
    expect(within(table).getAllByText(/17/).length).toBeGreaterThan(0);
    expect(within(table).getAllByText(/1763/).length).toBeGreaterThan(0);
    expect(within(table).getAllByText(/0\.2072/).length).toBeGreaterThan(0);
  }, 20000);

  it('lists the warning codes of both methods', async () => {
    await loaded();
    const warnings = screen.getByRole('region', { name: /warnings/i });
    expect(within(warnings).getAllByText('saturatedSource.residual-phase').length).toBe(4);
  }, 20000);

  it('shows one method when asked', async () => {
    await loaded();
    fireEvent.click(screen.getByRole('radio', { name: /^modern/i }));
    const table = screen.getByRole('region', { name: /regions and release/i });
    expect(within(table).queryByText(/1763/)).toBeNull();
  }, 20000);

  it('notes the step cap and says when a seasonal schedule falls back to whole-year steps', async () => {
    await loaded();
    const coupling = screen.getByRole('region', { name: /groundwater coupling/i });
    expect(within(coupling).getByText(/48 steps/i)).toBeTruthy();
    fireEvent.click(screen.getByRole('radio', { name: /feed modern/i }));
    fireEvent.click(screen.getByRole('radio', { name: /seasonal/i }));
    fireEvent.change(screen.getByLabelText(/^horizon/i), { target: { value: '30' } });
    await screen.findByText(/falls back to whole-year steps/i, undefined, { timeout: 15000 });
  }, 30000);

  it('replaces the results with a message when an input is invalid and keeps the last charts', async () => {
    await loaded();
    fireEvent.change(screen.getByLabelText(/^infiltration/i), { target: { value: '-1' } });
    const alert = await screen.findByRole('alert');
    expect(alert.textContent).toMatch(/infiltration/i);
    expect(screen.getByRole('img', { name: /release rate/i })).toBeTruthy();
  }, 20000);

  it('offers the result to the groundwater screen', async () => {
    await loaded();
    expect(getSaturatedFeed()).toBeNull();
    fireEvent.click(screen.getByRole('button', { name: /use as groundwater source/i }));
    expect(getSaturatedFeed()?.method).toBe('legacy');
    expect(screen.getByRole('link', { name: /open groundwater transport/i })).toBeTruthy();
  }, 20000);

  it('offers the pore water above the water table to the vapor screen', async () => {
    await loaded();
    expect(getSaturatedVaporFeed()).toBeNull();
    fireEvent.click(screen.getByRole('button', { name: /use as vapor source/i }));
    const feed = getSaturatedVaporFeed();
    expect(feed?.kind).toBe('poreWater');
    expect(feed && 'constant' in feed && feed.constant).toBeGreaterThan(0);
    expect(screen.getByRole('link', { name: /open vapor intrusion/i })).toBeTruthy();
  }, 20000);
});
