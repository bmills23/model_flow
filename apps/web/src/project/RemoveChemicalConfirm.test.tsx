import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { forgetMemory, getOverrides, newProject, setOverrides } from './store';
import { RemoveChemicalConfirm } from './RemoveChemicalConfirm';

beforeEach(() => {
  forgetMemory();
  newProject();
});
afterEach(() => {
  cleanup();
  forgetMemory();
});

const show = () =>
  render(
    <RemoveChemicalConfirm id="71-43-2" name="Benzene" onConfirm={() => {}} onCancel={() => {}} />,
  );

describe('RemoveChemicalConfirm', () => {
  it('names the step 3c chemical values when the chemical has any', () => {
    setOverrides({
      ...getOverrides(),
      fate: { '71-43-2': { koc: { value: '100', note: 'lab' } } },
    });
    show();
    expect(screen.getByRole('group').textContent).toMatch(/chemical values you entered in step 3/i);
  });

  it('does not mention them when there are none', () => {
    show();
    expect(screen.getByRole('group').textContent).not.toMatch(/chemical values you entered/i);
  });
});
