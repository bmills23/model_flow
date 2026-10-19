import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';
import type { VaporChemicalRow } from '../vapor/chemicals';
import { fateFill } from './chemicalFill';
import { VadosePage } from '../vadose/VadosePage';
import { SaturatedPage } from '../saturated/SaturatedPage';
import { TransportPage } from '../transport/TransportPage';
import { clearVadoseFeed } from '../vadose/feed';
import { clearSaturatedFeed } from '../saturated/feed';
import { DEFAULT_FORM as VADOSE } from '../vadose/form';
import { DEFAULT_FORM as SATURATED } from '../saturated/form';
import { DEFAULT_FORM as TRANSPORT } from '../transport/form';
import { fromProject as vadoseFrom, toProject as vadoseTo } from '../vadose/project';
import { fromProject as satFrom, toProject as satTo } from '../saturated/project';
import { DEFAULT_METHOD, fromProject as trFrom, toProject as trTo } from '../transport/project';

const fixture: VaporChemicalRow = {
  id: '99-99-9',
  name: 'Fixture',
  rsl: {
    mw: { value: 100 },
    hPrime: { value: 0.5 },
    dia: { value: 0.07 },
    diw: { value: 8e-6 },
    koc: { value: 200 },
    s: { value: 1500 },
  },
};

afterEach(() => {
  cleanup();
  clearVadoseFeed();
  clearSaturatedFeed();
});

describe('fateFill', () => {
  it('maps a record onto the fate fields in form units', () => {
    expect(fateFill(fixture)).toEqual({
      M: '100',
      S: '1500',
      H: '0.5',
      Koc: '200',
      Da: '0.07',
      Dw: String(8e-6),
    });
  });

  it('leaves out a property the record lacks', () => {
    const rest = { mw: { value: 100 }, s: { value: 1500 } };
    expect(fateFill({ ...fixture, rsl: rest }).Koc).toBeUndefined();
  });
});

describe('project round trip', () => {
  it('keeps the chosen chemical on each fate screen', () => {
    expect(
      vadoseFrom(vadoseTo({ form: { ...VADOSE, chemicalId: '71-43-2' } })).form.chemicalId,
    ).toBe('71-43-2');
    expect(
      satFrom(satTo({ form: { ...SATURATED, chemicalId: '71-43-2' }, method: 'modern' })).form
        .chemicalId,
    ).toBe('71-43-2');
    const t = trFrom(
      trTo({ form: { ...TRANSPORT, chemicalId: '71-43-2', foc: '0.002' }, method: DEFAULT_METHOD }),
    );
    expect(t.form.chemicalId).toBe('71-43-2');
    expect(t.form.foc).toBe('0.002');
  });

  it('loads an older project without the keys on the defaults', () => {
    expect(vadoseFrom({ form: {} }).form.chemicalId).toBe('');
    expect(trFrom({ form: {} }).form.foc).toBe(TRANSPORT.foc);
  });
});

const BENZENE = { M: '78.115', Koc: '145.8', S: '1790' };

async function pick(label: RegExp) {
  await screen.findByRole('option', { name: /benzene \(71-43-2\)/i }, { timeout: 15000 });
  fireEvent.change(screen.getByRole('combobox', { name: label }), { target: { value: '71-43-2' } });
}

const value = (label: RegExp) => (screen.getByLabelText(label) as HTMLInputElement).value;

describe('fill from the database', () => {
  it('fills the vadose chemical, keeps the decay input and stays editable', async () => {
    render(<VadosePage />);
    await pick(/fill from the chemical database/i);
    expect(value(/^molar mass/i)).toBe(BENZENE.M);
    expect(value(/^koc/i)).toBe(BENZENE.Koc);
    expect(value(/^solubility/i)).toBe(BENZENE.S);
    expect(value(/^diffusion in air/i)).not.toBe('');
    expect(value(/^decay in the leachate/i)).toBe(VADOSE.mu);
    expect(screen.getByText(/not in the database/i)).toBeTruthy();
    fireEvent.change(screen.getByLabelText(/^koc/i), { target: { value: '60' } });
    expect(value(/^koc/i)).toBe('60');
  }, 30000);

  it('fills the saturated chemical and leaves the source decay alone', async () => {
    render(<SaturatedPage />);
    await pick(/fill from the chemical database/i);
    expect(value(/^molar mass/i)).toBe(BENZENE.M);
    expect(value(/^koc/i)).toBe(BENZENE.Koc);
    expect(value(/^source decay rate/i)).toBe(SATURATED.srcDecay);
  }, 30000);

  it('fills Kd from Koc times the organic carbon fraction on the groundwater screen', async () => {
    render(<TransportPage />);
    await pick(/fill from the chemical database/i);
    expect(value(/^kd/i)).toBe(String(145.8 * Number(TRANSPORT.foc)));
    expect(value(/^decay half-life/i)).toBe(TRANSPORT.halfLifeYr);
  }, 30000);
});
