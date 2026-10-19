import { cleanup, fireEvent, render, screen, within } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { getSite, newProject, setSite } from '../project/store';
import { defaultSite } from './model';
import { SitePage } from './SitePage';

beforeEach(() => newProject());
afterEach(cleanup);

describe('SitePage', () => {
  it('shows the suggested order for the defaults, with links', () => {
    render(<SitePage />);
    const list = screen.getByRole('list');
    const links = within(list).getAllByRole('link');
    expect(links.map((a) => a.getAttribute('href'))).toEqual([
      '#/chemicals',
      '#/risk',
      '#/cleanup',
      '#/report',
    ]);
  });

  it('names the feed button when the models are used', () => {
    render(<SitePage />);
    fireEvent.click(screen.getByLabelText('Use the models'));
    fireEvent.click(screen.getByLabelText('Groundwater'));
    fireEvent.click(screen.getAllByLabelText('Soil')[0]!);
    expect(screen.getByText('Use as exposure well concentration')).toBeTruthy();
    expect(getSite().basis).toBe('modeled');
    expect(getSite().media).toEqual(['groundwater']);
  });

  it('explains two source media instead of listing screens', () => {
    render(<SitePage />);
    fireEvent.click(screen.getByLabelText('Groundwater'));
    expect(screen.getByRole('alert').textContent).toMatch(/one source medium/i);
    expect(screen.queryByText('Suggested order')).toBeNull();
  });

  it('explains produce from soil and from irrigation water together', () => {
    render(<SitePage />);
    fireEvent.click(screen.getByLabelText('Irrigation water'));
    const soilBoxes = screen.getAllByLabelText('Soil');
    expect(soilBoxes).toHaveLength(2);
    fireEvent.click(soilBoxes[1]!);
    expect(screen.getByRole('alert').textContent).toMatch(/not both/i);
    expect(screen.queryByText('Suggested order')).toBeNull();
  });

  it('shows the vapor method only for a vapor source', () => {
    setSite({ ...defaultSite(), basis: 'modeled', media: ['soilGasToIndoorAir'] });
    render(<SitePage />);
    expect(screen.getByText('Vapor intrusion method')).toBeTruthy();
    cleanup();
    setSite({ ...defaultSite(), basis: 'modeled', media: ['groundwater'] });
    render(<SitePage />);
    expect(screen.queryByText('Vapor intrusion method')).toBeNull();
  });

  it('resets to the defaults', () => {
    setSite({ ...defaultSite(), receptors: 'ecological' });
    render(<SitePage />);
    fireEvent.click(screen.getByRole('button', { name: 'Reset the choices' }));
    expect(getSite()).toEqual(defaultSite());
  });
});
