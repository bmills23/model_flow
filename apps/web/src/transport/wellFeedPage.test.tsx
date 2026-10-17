import { fireEvent, render, screen, within } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';
import { clearWellFeed, getWellFeed } from './wellFeed';
import { TransportPage } from './TransportPage';
import { clearWaterTableFeed, getWaterTableFeed } from '../vapor/feeds';

afterEach(() => {
  clearWellFeed();
  clearWaterTableFeed();
});

describe('TransportPage well result for the exposure screen', () => {
  it('sends the receptor well curve of the chosen method to the exposure and risk screen', async () => {
    render(<TransportPage />);
    const button = await screen.findByRole(
      'button',
      { name: /use as exposure well concentration/i },
      { timeout: 30000 },
    );
    expect(getWellFeed()).toBeNull();
    const panel = screen.getByRole('region', { name: /exposure and risk/i });
    fireEvent.click(within(panel).getByRole('radio', { name: /^legacy/i }));
    fireEvent.click(button);
    const feed = getWellFeed();
    expect(feed?.method).toBe('legacy');
    expect(feed?.times[0]).toBe(0);
    expect(feed?.times.length).toBe(feed?.values.length);
    expect(feed!.values.every((v) => Number.isFinite(v) && v >= 0)).toBe(true);
    expect(feed!.values.some((v) => v > 0)).toBe(true);
    expect(screen.getByRole('link', { name: /open exposure and risk/i }).getAttribute('href')).toBe(
      '#/risk',
    );
  }, 60000);

  it('sends the water table concentration under the receptor point to the vapor screen', async () => {
    render(<TransportPage />);
    const button = await screen.findByRole(
      'button',
      { name: /use as vapor groundwater source/i },
      { timeout: 30000 },
    );
    expect(getWaterTableFeed()).toBeNull();
    fireEvent.click(button);
    const feed = getWaterTableFeed();
    expect(feed?.kind).toBe('groundwater');
    expect(feed && 'series' in feed && feed.series.times[0]).toBe(0);
    expect(feed && 'series' in feed && feed.series.values.some((v) => v > 0)).toBe(true);
    expect(screen.getByRole('link', { name: /open vapor intrusion/i }).getAttribute('href')).toBe(
      '#/vapor',
    );
  }, 60000);
});
