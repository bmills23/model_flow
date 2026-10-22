import { act, fireEvent, render, screen, within } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';
import { CleanupPage } from './CleanupPage';
import { fromProject, toProject } from './project';
import { defaultCleanupForm } from './form';
import { newSurfaceTarget } from './surfaceWaterTarget';
import { forgetMemory, getScreen, setScreen } from '../project/store';
import { clearSurfaceWaterFeed, setSurfaceWaterFeed } from '../surfaceWater/feed';

afterEach(() => {
  clearSurfaceWaterFeed();
  forgetMemory();
});

describe('cleanup project state', () => {
  it('keeps the surface water targets through a save and load, and fills missing fields', () => {
    const form = {
      ...defaultCleanupForm(),
      surfaceTargets: [
        { ...newSurfaceTarget('71-43-2'), kind: 'user' as const, value: '5', note: 'Permit' },
      ],
    };
    expect(
      fromProject(JSON.parse(JSON.stringify(toProject({ form })))).form.surfaceTargets,
    ).toEqual(form.surfaceTargets);
    const partial = fromProject({
      form: { surfaceTargets: [{ chemicalId: '71-43-2', kind: 'nrwqc' }] },
    });
    expect(partial.form.surfaceTargets).toEqual([
      { chemicalId: '71-43-2', kind: 'nrwqc', criterionId: '', value: '', note: '' },
    ]);
    expect(fromProject({}).form.surfaceTargets).toEqual([]);
  });
});

describe('cleanup surface water target panel', () => {
  it('shows the source level with the note, marks the slot stale and keeps the value', async () => {
    const sw = getScreen('surfaceWater');
    setScreen('surfaceWater', { form: { ...sw.form, chemicalId: '71-43-2' } });
    setSurfaceWaterFeed({
      chemicalId: '71-43-2',
      method: 'mass-discharge',
      origin: 'surfaceWater.mass-discharge',
      label: 'Modern mass-discharge surface water, 10.0 years',
      times: [1],
      values: [1e-6],
      coefficient: {
        value: 0.04,
        reason: null,
        method: 'surfaceWater.mass-discharge',
        sourceMedium: 'groundwater',
        sourceUnit: 'mg/L',
      },
    });
    render(<CleanupPage />);
    await screen.findByText(/890 chemicals/i, undefined, { timeout: 20000 });
    fireEvent.change(screen.getByLabelText(/find a chemical/i), { target: { value: '71-43-2' } });
    fireEvent.click(await screen.findByRole('button', { name: /add benzene/i }));
    const inputs = screen.getByRole('region', { name: /surface water targets/i });
    fireEvent.click(within(inputs).getByRole('radio', { name: /my value/i }));
    fireEvent.change(within(inputs).getByLabelText(/surface water target \(ug\/L\)/i), {
      target: { value: '10' },
    });
    // without a note the level is not quantified, with the reason
    const panel = await screen.findByRole('region', {
      name: /surface water target source levels/i,
    });
    expect(within(panel).getByText(/needs a note/i)).toBeTruthy();
    fireEvent.change(within(inputs).getByLabelText(/note \(required\)/i), {
      target: { value: 'State standard' },
    });
    expect(within(panel).getByText(/State standard/)).toBeTruthy();
    expect(within(panel).getByText(/User value \(this project\)/)).toBeTruthy();
    // 10 ug/L over 0.04 is 0.25 mg/L
    expect(within(panel).getByText(/0\.25 mg\/L/)).toBeTruthy();
    expect(within(panel).queryByText('Out of date')).toBeNull();
    act(() => {
      const s = getScreen('surfaceWater');
      setScreen('surfaceWater', { form: { ...s.form, upstreamFlow: '123456' } });
    });
    expect(within(panel).getByText('Out of date')).toBeTruthy();
    expect(within(panel).getByText(/0\.25 mg\/L/)).toBeTruthy();
  }, 40000);
});
