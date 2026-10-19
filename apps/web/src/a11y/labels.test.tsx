import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import type { ReactElement } from 'react';
import { describe, expect, it } from 'vitest';
import { CleanupPage } from '../cleanup/CleanupPage';
import { HouseholdPage } from '../household/HouseholdPage';
import { MethodsPage } from '../pages/MethodsPage';
import { PlantsEcoPage } from '../plantsEco/PlantsEcoPage';
import { ProjectBar } from '../project/ProjectBar';
import { ReportPage } from '../report/ReportPage';
import { RiskPage } from '../risk/RiskPage';
import { SaturatedPage } from '../saturated/SaturatedPage';
import { SurfaceWaterScreen } from '../surfaceWater/SurfaceWaterScreen';
import { TransportPage } from '../transport/TransportPage';
import { VadosePage } from '../vadose/VadosePage';
import { VaporPage } from '../vapor/VaporPage';
import { unlabelledControls } from './labels';

const SCREENS: [string, () => ReactElement][] = [
  ['project bar', () => <ProjectBar />],
  ['transport', () => <TransportPage />],
  ['vadose', () => <VadosePage />],
  ['saturated', () => <SaturatedPage />],
  ['vapor', () => <VaporPage />],
  ['surface water', () => <SurfaceWaterScreen />],
  ['household', () => <HouseholdPage />],
  ['plants and ecology', () => <PlantsEcoPage />],
  ['risk', () => <RiskPage />],
  ['cleanup', () => <CleanupPage />],
  ['report', () => <ReportPage />],
  ['methods', () => <MethodsPage />],
];

describe('unlabelledControls', () => {
  it('flags a bare input and accepts wrapped, for=, aria-label and aria-labelledby names', () => {
    const { container } = render(
      <div>
        <input data-testid="bad" />
        <label>
          Wrapped <input />
        </label>
        <label htmlFor="a">Linked</label>
        <input id="a" />
        <input aria-label="Named" />
        <span id="n">Described by</span>
        <select aria-labelledby="n" />
        <input type="hidden" />
        <textarea />
      </div>,
    );
    const bad = unlabelledControls(container);
    expect(bad.length).toBe(2);
    expect(bad[0]!.getAttribute('data-testid')).toBe('bad');
    expect(bad[1]!.tagName).toBe('TEXTAREA');
  });
});

describe('every form control has an accessible name', () => {
  for (const [name, make] of SCREENS) {
    it(`${name}`, async () => {
      const { container } = render(make());
      // screens that load a database or a lazy chunk settle before the walk
      await waitFor(() => expect(container.children.length).toBeGreaterThan(0), { timeout: 20000 });
      await new Promise((r) => setTimeout(r, 300));
      const bad = unlabelledControls(container).map((el) => el.outerHTML.slice(0, 160));
      expect(bad).toEqual([]);
      expect(screen).toBeTruthy();
    }, 30000);
  }
});

describe('chemical screens with a chemical added', () => {
  for (const [name, make] of [
    ['risk', () => <RiskPage />],
    ['cleanup', () => <CleanupPage />],
  ] as [string, () => ReactElement][]) {
    it(`${name} controls are named once benzene is in the project`, async () => {
      const { container } = render(make());
      await screen.findByText(/890 chemicals/i, undefined, { timeout: 20000 });
      fireEvent.change(screen.getByLabelText(/find a chemical/i), { target: { value: '71-43-2' } });
      fireEvent.click(await screen.findByRole('button', { name: /add benzene/i }));
      await screen.findByRole('group', { name: /benzene/i });
      await new Promise((r) => setTimeout(r, 500));
      expect(container.querySelectorAll('input, select').length).toBeGreaterThan(5);
      const bad = unlabelledControls(container).map((el) => el.outerHTML.slice(0, 160));
      expect(bad).toEqual([]);
    }, 40000);
  }
});
