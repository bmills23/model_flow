import { describe, expect, it } from 'vitest';
import type { CleanupProps } from './ssg';
import {
  aboveSolubility,
  ceilingsOf,
  solubilityCeiling,
  solubilityFlag,
  solubilityText,
} from './solubility';

const props: CleanupProps = new Map([
  ['108-88-3', { s: 526 }],
  ['1330-20-7', { s: 106 }],
  ['7440-38-2', {}],
]);

describe('solubilityCeiling for a user chemical', () => {
  const user: CleanupProps = new Map([
    ['user-1', { s: 42 }],
    ['user-2', { koc: 10 }],
  ]);

  it('uses the solubility the user entered for the chemical, labelled as entered by the user', () => {
    const c = solubilityCeiling('', 'user-1', props, '2024-11', user);
    expect(c).toMatchObject({ value: 42, origin: 'user' });
    expect(c!.source).toMatch(/entered by the user/i);
    expect(c!.source).not.toMatch(/Regional Screening Levels/);
    expect(solubilityText(c!)).toMatch(/^42 mg\/L \(.*entered by the user/);
  });

  it('lets a ceiling typed on the cleanup screen win over the chemical value', () => {
    expect(solubilityCeiling('10', 'user-1', props, '2024-11', user)).toMatchObject({
      value: 10,
      origin: 'entered',
    });
  });

  it('has no ceiling for a user chemical that gave no solubility', () => {
    expect(solubilityCeiling('', 'user-2', props, '2024-11', user)).toBeNull();
  });

  it('flags a level above it as above the solubility', () => {
    const c = solubilityCeiling('', 'user-1', props, '2024-11', user);
    expect(solubilityFlag('Mine', 100, c)).toMatch(
      /above the solubility of 42 mg\/L \(.*entered by the user/,
    );
  });
});

describe('solubilityCeiling', () => {
  it('defaults to the database solubility of the chemical, with its source', () => {
    const c = solubilityCeiling('', '108-88-3', props, '2024-11');
    expect(c).toEqual({
      value: 526,
      origin: 'database',
      source: expect.stringContaining('Regional Screening Levels'),
    });
    expect(c!.source).toContain('2024-11');
  });

  it('gives each chemical its own database value', () => {
    expect(solubilityCeiling('', '1330-20-7', props, '2024-11')!.value).toBe(106);
  });

  it('lets a ceiling the user entered win over the database', () => {
    const c = solubilityCeiling('300', '108-88-3', props, '2024-11');
    expect(c).toMatchObject({ value: 300, origin: 'entered' });
    expect(c!.source).toMatch(/entered/i);
  });

  it('ignores a blank, zero, negative or unreadable entry and falls back to the database', () => {
    for (const t of ['', '  ', '0', '-3', 'abc']) {
      expect(solubilityCeiling(t, '108-88-3', props, '2024-11')).toMatchObject({
        value: 526,
        origin: 'database',
      });
    }
  });

  it('has no ceiling for a chemical the database gives no solubility', () => {
    expect(solubilityCeiling('', '7440-38-2', props, '2024-11')).toBeNull();
    expect(solubilityCeiling('', 'user-1', props, '2024-11')).toBeNull();
    expect(solubilityCeiling('', '108-88-3', null, '2024-11')).toBeNull();
  });

  it('keeps an entered ceiling even when the database has no value', () => {
    expect(solubilityCeiling('50', 'user-1', props, '2024-11')).toMatchObject({
      value: 50,
      origin: 'entered',
    });
  });
});

describe('aboveSolubility and solubilityFlag', () => {
  const c = solubilityCeiling('', '108-88-3', props, '2024-11');
  it('flags only a level above the ceiling', () => {
    expect(aboveSolubility(1160, c)).toBe(true);
    expect(aboveSolubility(526, c)).toBe(false);
    expect(aboveSolubility(100, c)).toBe(false);
    expect(aboveSolubility(null, c)).toBe(false);
    expect(aboveSolubility(1160, null)).toBe(false);
  });

  it('words the flag with the level, the solubility and where the solubility came from', () => {
    const t = solubilityFlag('Toluene', 1160, c)!;
    expect(t).toContain('Toluene');
    expect(t).toContain('1160 mg/L');
    expect(t).toContain('526 mg/L');
    expect(t).toMatch(/above the solubility/i);
    expect(t).toContain('2024-11');
    expect(solubilityFlag('Toluene', 100, c)).toBeNull();
  });

  it('says an entered ceiling was entered', () => {
    const e = solubilityCeiling('300', '108-88-3', props, '2024-11');
    expect(solubilityFlag('Toluene', 400, e)).toMatch(/entered/i);
  });

  it('prints neither an em dash nor an internal id', () => {
    expect(solubilityFlag('Toluene', 1160, c)).not.toMatch(
      new RegExp(`${String.fromCharCode(0x2014)}|108-88-3`),
    );
    expect(solubilityText(c!)).not.toMatch(new RegExp(String.fromCharCode(0x2014)));
  });
});

describe('ceilingsOf', () => {
  it('maps every chemical id to its ceiling', () => {
    const m = ceilingsOf('', ['108-88-3', '1330-20-7', 'user-1'], props, '2024-11');
    expect(m['108-88-3']!.value).toBe(526);
    expect(m['1330-20-7']!.value).toBe(106);
    expect(m['user-1']).toBeNull();
  });
});
