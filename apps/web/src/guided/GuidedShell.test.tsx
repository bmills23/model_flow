import { act, cleanup, render, screen, within } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { GuidedShell } from './GuidedShell';
import { defaultGuided } from './state';
import { GUIDED_STEPS } from '../steps';
import { addChemical, forgetMemory, setGuided } from '../project/store';

beforeEach(() => forgetMemory());
afterEach(() => {
  cleanup();
  forgetMemory();
});

const list = () => screen.getByRole('navigation', { name: /guided steps/i });

describe('GuidedShell', () => {
  it('lists every step as a link to its route, in order', () => {
    render(
      <GuidedShell stepId="site">
        <p>body</p>
      </GuidedShell>,
    );
    const links = within(list()).getAllByRole('link');
    expect(links.map((a) => a.getAttribute('href'))).toEqual(
      GUIDED_STEPS.map((s) => `#/step/${s.id}`),
    );
  });

  it('marks the open step as current and the others to do', () => {
    render(
      <GuidedShell stepId="site">
        <p>body</p>
      </GuidedShell>,
    );
    const items = within(list()).getAllByRole('listitem');
    expect(items[1]!.textContent).toMatch(/current/i);
    expect(within(list()).getByRole('link', { current: 'step' }).textContent).toMatch(
      /site model/i,
    );
    expect(items[0]!.textContent).toMatch(/to do/i);
  });

  it('shows done once a step is done, and steps 4 to 6 as arriving with the next update', () => {
    addChemical({ id: 'benzene', name: 'Benzene' });
    render(
      <GuidedShell stepId="site">
        <p>body</p>
      </GuidedShell>,
    );
    const items = within(list()).getAllByRole('listitem');
    expect(items[0]!.textContent).toMatch(/done/i);
    for (const i of [5, 6, 7, 8, 9]) expect(items[i]!.textContent).toMatch(/next update/i);
    expect(items[4]!.textContent).not.toMatch(/next update/i);
  });

  it('marks step 3d to run again when the output check finds a stale output', () => {
    addChemical({ id: 'benzene', name: 'Benzene' });
    const g = defaultGuided();
    g.site.sources = ['groundwater'];
    g.site.paths.well = true;
    act(() => setGuided(g));
    render(
      <GuidedShell stepId="chemicals" outputCheck={() => 'stale'}>
        <p>body</p>
      </GuidedShell>,
    );
    const items = within(list()).getAllByRole('listitem');
    expect(items[4]!.textContent).toMatch(/run again/i);
  });

  it('updates its marks when the project changes', () => {
    render(
      <GuidedShell stepId="site">
        <p>body</p>
      </GuidedShell>,
    );
    expect(within(list()).getAllByRole('listitem')[1]!.textContent).toMatch(/current/i);
    const g = defaultGuided();
    g.site.sources = ['groundwater'];
    g.site.paths.well = true;
    act(() => setGuided(g));
    expect(list().textContent).toMatch(/current/i);
  });

  it('has Back and Next to the neighbouring steps', () => {
    render(
      <GuidedShell stepId="properties">
        <p>body</p>
      </GuidedShell>,
    );
    expect(screen.getByRole('link', { name: /^back$/i }).getAttribute('href')).toBe('#/step/site');
    expect(screen.getByRole('link', { name: /^next$/i }).getAttribute('href')).toBe(
      '#/step/sources',
    );
  });

  it('sends Back from the first step to the home page and has no Next link past the last', () => {
    const { unmount } = render(
      <GuidedShell stepId="chemicals">
        <p>body</p>
      </GuidedShell>,
    );
    expect(screen.getByRole('link', { name: /^back$/i }).getAttribute('href')).toBe('#/');
    unmount();
    render(
      <GuidedShell stepId="results">
        <p>body</p>
      </GuidedShell>,
    );
    expect(screen.queryByRole('link', { name: /^next$/i })).toBeNull();
    expect(screen.getByText(/next/i, { selector: '[aria-disabled="true"]' })).toBeTruthy();
  });

  it('renders its children', () => {
    render(
      <GuidedShell stepId="run">
        <p>the run screen</p>
      </GuidedShell>,
    );
    expect(screen.getByText('the run screen')).toBeTruthy();
  });
});
