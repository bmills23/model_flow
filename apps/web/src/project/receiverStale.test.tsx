import { act, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';
import { HouseholdPage } from '../household/HouseholdPage';
import { SurfaceWaterScreen } from '../surfaceWater/SurfaceWaterScreen';
import { TransportPage } from '../transport/TransportPage';
import { VaporPage } from '../vapor/VaporPage';
import { clearBankFeed, setBankFeed } from '../transport/bankFeed';
import { clearVadoseFeed, setVadoseFeed } from '../vadose/feed';
import { R7_FORM as VADOSE_FORM, toScenario as toVadose } from '../vadose/form';
import { clearWaterTableFeed, setWaterTableFeed } from '../vapor/feeds';
import { clearWellFeed, setWellFeed } from '../transport/wellFeed';
import { toScenario } from '../transport/form';
import { forgetMemory, getScreen, setScreen } from './store';
import { REGRESSION_FORM as DEFAULT_FORM } from '../transport/regression.testkit';

afterEach(() => {
  clearWellFeed();
  clearBankFeed();
  clearVadoseFeed();
  clearWaterTableFeed();
  forgetMemory();
});

const MARK = 'Out of date';

describe('receiving screens mark a stale feed they read', () => {
  it('household: the well series', () => {
    const h = getScreen('household');
    setScreen('household', { form: { ...h.form, irrigationWaterSource: 'well' } });
    act(() =>
      setWellFeed({ method: 'modern', label: 'Receptor well', times: [0, 10], values: [0, 1e-6] }),
    );
    render(<HouseholdPage />);
    expect(screen.queryByText(MARK)).toBeNull();
    const t = getScreen('transport');
    act(() => setScreen('transport', { ...t, form: { ...t.form, K: '99' } }));
    expect(screen.getByText(MARK)).toBeTruthy();
  });

  it('surface water: the linked groundwater run', () => {
    const r = toScenario(DEFAULT_FORM);
    if (!r.ok) throw new Error('transport scenario');
    const { zOf: _z, ...plain } = r.scenario;
    void _z;
    const s = getScreen('surfaceWater');
    setScreen('surfaceWater', { form: { ...s.form, linked: true } });
    act(() => setBankFeed({ scenario: plain, label: 'bank run' }));
    render(<SurfaceWaterScreen />);
    expect(screen.queryByText(MARK)).toBeNull();
    const t = getScreen('transport');
    act(() => setScreen('transport', { ...t, form: { ...t.form, K: '99' } }));
    expect(screen.getByText(MARK)).toBeTruthy();
  });

  it('transport: the vadose result it is fed from', () => {
    const v = toVadose(VADOSE_FORM);
    if (!v.ok) throw new Error('vadose scenario');
    const t = getScreen('transport');
    setScreen('transport', { ...t, form: { ...t.form, feedFromVadose: true } });
    act(() => setVadoseFeed({ scenario: v.scenario, method: 'modern', label: 'vadose run' }));
    render(<TransportPage />);
    expect(screen.queryByText(MARK)).toBeNull();
    const vs = getScreen('vadose');
    act(() => setScreen('vadose', { form: { ...vs.form, infiltration: '0.4' } }));
    expect(screen.getByText(MARK)).toBeTruthy();
  });

  it('vapor: the water table series it takes its source from', () => {
    const v = getScreen('vapor');
    setScreen('vapor', { ...v, choice: 'waterTable' });
    act(() => setWaterTableFeed({ kind: 'poreWater', label: 'water table', constant: 1e-3 }));
    render(<VaporPage />);
    expect(screen.queryByText(MARK)).toBeNull();
    const t = getScreen('transport');
    act(() => setScreen('transport', { ...t, form: { ...t.form, K: '99' } }));
    expect(screen.getByText(MARK)).toBeTruthy();
  });
});
