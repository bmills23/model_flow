import { fireEvent, render, screen, within } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { showerLegacyStall, showerLittle } from '@model-flow/engine';
import { HouseholdPage } from './HouseholdPage';

function fill(label: RegExp, value: string) {
  fireEvent.change(screen.getByLabelText(label), { target: { value } });
}

function fillShower() {
  fill(/^tap and irrigation water concentration/i, '0.5');
  fill(/^henry constant/i, '0.2');
  fill(/^molecular weight/i, '100');
  fill(/^shower droplet diameter/i, '1');
  fill(/^shower droplet fall time/i, '2');
  fill(/^shower water flow/i, '8');
  fill(/^shower duration/i, '10');
  fill(/^stall volume/i, '2');
  fill(/^stall ventilation/i, '0.5');
}

describe('HouseholdPage', () => {
  it('opens on a heading and asks for the inputs it cannot default', () => {
    render(<HouseholdPage />);
    expect(screen.getByRole('heading', { level: 1, name: /shower, irrigation/i })).toBeTruthy();
    const shower = screen.getByRole('region', { name: /shower air/i });
    expect(within(shower).getByText(/henry constant is required/i)).toBeTruthy();
  });

  it('shows shower results equal to the engine and a comparison of all three methods', () => {
    render(<HouseholdPage />);
    fillShower();
    const base = {
      waterConcentration: 0.5e-3,
      henry: 0.2,
      molecularWeight: 100,
      dropletDiameter: 1e-3,
      fallTime: 2,
      waterFlow: 8 / 60000,
      showerTime: 600,
      stallVolume: 2,
    };
    const legacy = showerLegacyStall(base).concentration * 1e6;
    const little = showerLittle({ ...base, gasFlow: 0.5 / 60 }).concentration * 1e6;
    const cmp = screen.getByRole('region', { name: /shower method comparison/i });
    const rows = within(cmp).getAllByRole('row');
    expect(rows.length).toBe(4); // header + three methods
    expect(cmp.textContent).toContain(String(Number(little.toPrecision(3))));
    expect(cmp.textContent).toContain(String(Number(legacy.toPrecision(3))));
  });

  it('switches the shown shower method', () => {
    render(<HouseholdPage />);
    fillShower();
    fireEvent.click(screen.getByLabelText(/stagnant stall/i));
    expect(screen.getByRole('region', { name: /stagnant stall details/i })).toBeTruthy();
  });

  it('lists the unverified-input warnings once results exist', () => {
    render(<HouseholdPage />);
    fillShower();
    const w = screen.getByRole('region', { name: /warnings/i });
    expect(within(w).getByText(/shower\.film-reference-unverified/)).toBeTruthy();
  });

  it('shows particulate results from the verified defaults once soil and box are entered', () => {
    render(<HouseholdPage />);
    fill(/^surface soil concentration/i, '40');
    fill(/^wind speed/i, '2');
    fill(/^mixing height/i, '2');
    fill(/^box length/i, '10');
    fill(/^box width/i, '4');
    const cmp = screen.getByRole('region', { name: /particulate method comparison/i });
    expect(within(cmp).getAllByRole('row').length).toBe(4);
    expect(within(cmp).getByText(/1\.32e\+?9/i)).toBeTruthy();
  });

  it('flags an invalid number with an alert', () => {
    render(<HouseholdPage />);
    fill(/^henry constant/i, 'abc');
    expect(screen.getByRole('alert').textContent).toMatch(/henry constant must be a number/i);
  });
});
