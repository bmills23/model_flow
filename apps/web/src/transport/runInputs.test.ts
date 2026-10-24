import { describe, expect, it } from 'vitest';
import { toScenario } from './form';
import { transportRunInputs } from './runInputs';
import { REGRESSION_FORM } from './regression.testkit';

const value = (rows: { label: string; value: string }[], label: string) =>
  rows.find((r) => r.label === label)?.value;

function scenarioOf(over: Partial<typeof REGRESSION_FORM> = {}) {
  const r = toScenario({ ...REGRESSION_FORM, ...over });
  if (!r.ok) throw new Error(r.errors.join('; '));
  return r.scenario;
}

describe('transportRunInputs', () => {
  it("names the run's source, aquifer and receptor in the units the screen shows, with no trailing space", () => {
    const rows = transportRunInputs(scenarioOf());
    expect(value(rows, 'Source concentration')).toMatch(/^[\d.e+-]+ mg\/L$/);
    expect(value(rows, 'Seepage velocity')).toMatch(/^[\d.e+-]+ m\/yr$/);
    expect(value(rows, 'Porosity')).toMatch(/^[\d.e+-]+$/);
    expect(value(rows, 'Longitudinal dispersivity')).toMatch(/ m$/);
    expect(value(rows, 'Receptor depth below the water table')).toMatch(/ m/);
    expect(value(rows, 'Evaluation time')).toMatch(/ yr$/);
    for (const r of rows) expect(r.value).toBe(r.value.trim());
  });

  it("prints each run's own source concentration", () => {
    const a = transportRunInputs(scenarioOf({ c0: '5' }));
    const b = transportRunInputs(scenarioOf({ c0: '12' }));
    expect(value(a, 'Source concentration')).toBe('5 mg/L');
    expect(value(b, 'Source concentration')).toBe('12 mg/L');
  });

  it('names a source fed by another screen as fed, without a typed strength', () => {
    const rows = transportRunInputs({ ...scenarioOf(), fed: { label: 'Vadose run, 40 years' } });
    expect(value(rows, 'Source')).toBe("fed by another screen's result (Vadose run, 40 years)");
    expect(value(rows, 'Source concentration')).toBeUndefined();
  });
});
