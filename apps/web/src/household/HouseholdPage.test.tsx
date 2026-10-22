import { act, fireEvent, render, screen, within } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';
import { showerLegacyStall, showerLittle } from '@model-flow/engine';
import { HouseholdPage } from './HouseholdPage';
import { clearHouseholdFeed, getHouseholdFeed } from './feeds';
import { clearWellFeed, setWellFeed } from '../transport/wellFeed';
import { clearSurfaceWaterFeed, setSurfaceWaterFeed } from '../surfaceWater/feed';
import { addChemical, forgetMemory, getScreen } from '../project/store';

afterEach(() => {
  clearHouseholdFeed();
  clearWellFeed();
  clearSurfaceWaterFeed();
});

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

describe('HouseholdPage in the project', () => {
  it('starts from the project, writes edits back, and offers the results as CSV', () => {
    forgetMemory();
    const { unmount } = render(<HouseholdPage />);
    fillShower();
    expect(getScreen('household').form.waterConcentration).toBe('0.5');
    expect(getScreen('household').form.henry).toBe('0.2');
    expect(screen.getByRole('button', { name: 'Download CSV' })).toBeTruthy();
    unmount();
    render(<HouseholdPage />);
    expect((screen.getByLabelText(/^henry constant/i) as HTMLInputElement).value).toBe('0.2');
    forgetMemory();
  });
});

describe('HouseholdPage', () => {
  it('opens on a heading and asks for the inputs it cannot default', () => {
    render(<HouseholdPage />);
    expect(screen.getByRole('heading', { level: 1, name: /shower, irrigation/i })).toBeTruthy();
    const shower = screen.getByRole('region', { name: /shower air/i });
    expect(within(shower).getByText(/henry constant is required/i)).toBeTruthy();
  });

  it('derives the volatility verdict from Henry and vapor pressure, with an override', () => {
    render(<HouseholdPage />);
    expect(
      screen.getByText(/enter the henry constant \(atm m3\/mol\) or the vapor pressure/i),
    ).toBeTruthy();
    fill(/^henry \(atm m3\/mol\)/i, '5e-3');
    expect(screen.getByText(/^volatile by the rsl criterion/i)).toBeTruthy();
    fill(/^henry \(atm m3\/mol\)/i, '1e-6');
    expect(screen.getByText(/^not volatile by the rsl criterion/i)).toBeTruthy();
    fireEvent.click(screen.getByRole('radio', { name: /force volatile/i }));
    expect(screen.getByText(/treated as volatile by your override/i)).toBeTruthy();
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

  describe('feeds', () => {
    const YR = 365.25 * 86400;
    const well = {
      method: 'modern' as const,
      label: 'Receptor well, modern method',
      times: [0, 10 * YR, 20 * YR],
      values: [0, 1e-6, 4e-6],
    };

    it('offers the held well series as the tap water source and shows its label', () => {
      setWellFeed(well);
      render(<HouseholdPage />);
      fillShower();
      const group = screen.getByRole('group', { name: /tap water source/i });
      fireEvent.click(within(group).getByRole('radio', { name: /well series/i }));
      expect(screen.getAllByText(/receptor well, modern method/i).length).toBeGreaterThan(0);
    });

    it('says a chosen source is not held rather than computing', () => {
      render(<HouseholdPage />);
      fillShower();
      const group = screen.getByRole('group', { name: /irrigation water source/i });
      fireEvent.click(within(group).getByRole('radio', { name: /surface water series/i }));
      expect(screen.getByRole('alert').textContent).toMatch(/no surface water result is held/i);
    });

    it('sends the shower EPC series with its origin to the risk screen feed', () => {
      setWellFeed(well);
      act(() => addChemical({ id: '71-43-2', name: 'Benzene' }));
      render(<HouseholdPage />);
      fillShower();
      fill(/^chemical$/i, '71-43-2');
      const group = screen.getByRole('group', { name: /tap water source/i });
      fireEvent.click(within(group).getByRole('radio', { name: /well series/i }));
      fireEvent.click(screen.getByRole('button', { name: /send to risk and cleanup/i }));
      const feed = getHouseholdFeed();
      expect(feed?.chemicalId).toBe('71-43-2');
      expect(feed?.bathroomAir?.kind).toBe('series');
      expect(feed?.bathroomAir?.origin).toBe('shower.little-1992');
      expect(screen.getByRole('status').textContent).toMatch(/sent/i);
    });

    it('explains why it cannot send without a project chemical', () => {
      render(<HouseholdPage />);
      fillShower();
      const btn = screen.getByRole('button', { name: /send to risk and cleanup/i });
      expect((btn as HTMLButtonElement).disabled).toBe(true);
      expect(screen.getByText(/pick the chemical .* from the project list/i)).toBeTruthy();
    });

    it('lists a surface water series when one is held', () => {
      setSurfaceWaterFeed({
        method: 'well-mixed',
        origin: 'surfaceWater.well-mixed',
        label: 'Well-mixed surface water',
        times: [10 * YR, 20 * YR],
        values: [3e-6, 1e-6],
      });
      render(<HouseholdPage />);
      const group = screen.getByRole('group', { name: /irrigation water source/i });
      fireEvent.click(within(group).getByRole('radio', { name: /surface water series/i }));
      expect(screen.getAllByText(/well-mixed surface water/i).length).toBeGreaterThan(0);
    });
  });
});

describe('HouseholdPage chemical from the project list', () => {
  it('has a select over the project list in place of typed name and id fields', () => {
    act(() => addChemical({ id: '108-88-3', name: 'Toluene' }));
    render(<HouseholdPage />);
    expect(screen.queryByLabelText(/^chemical name/i)).toBeNull();
    expect(screen.queryByLabelText(/^chemical id/i)).toBeNull();
    fill(/^chemical$/i, '108-88-3');
    expect(getScreen('household').form.chemicalId).toBe('108-88-3');
    expect(getScreen('household').form.chemicalName).toBe('Toluene');
  });

  it('points to the chemicals screen when the project list is empty', () => {
    forgetMemory();
    render(<HouseholdPage />);
    expect(screen.getByRole('link', { name: /chemicals screen/i })).toBeTruthy();
  });
});
