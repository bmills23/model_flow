import { describe, expect, it } from 'vitest';
import { defaultScreens, type Screens } from '../project';
import { applyTexture as vaporTexture } from '../vapor/form';
import { flattenInputs } from './buildReport';
import { NOT_SITE_VALUES, SITE_FIELDS, siteEntries } from './siteValues';
import type { ScreenKey } from './methodsRun';

const forms = (): Screens => defaultScreens();
const formOf = (s: Screens, key: ScreenKey): Record<string, unknown> =>
  ((s[key] as { form?: unknown }).form ?? s[key]) as Record<string, unknown>;

/** `steps[0].start` as `steps[].start`. */
const generic = (path: string): string => path.replace(/\[\d+\]/g, '[]');

describe('the site value catalog', () => {
  it('accounts for every text field of every screen form: a site value or a named non-value', () => {
    const s = forms();
    const missing: string[] = [];
    for (const key of Object.keys(s) as ScreenKey[]) {
      if (key === 'uncertainty') continue; // sampling setup, not a site description
      const known = new Set([
        ...(SITE_FIELDS[key] ?? []).map((x) => x.key),
        ...(NOT_SITE_VALUES[key] ?? []),
      ]);
      for (const row of flattenInputs(formOf(s, key))) {
        if (row.value === 'yes' || row.value === 'no') continue; // a switch, not a value
        if (!known.has(generic(row.path))) missing.push(`${key}: ${row.path}`);
      }
    }
    expect(missing).toEqual([]);
  });

  it('names no field the form does not have', () => {
    const s = forms();
    // a catalog key that matches no default path is a typo, unless it is under a list the default lacks
    const bad: string[] = [];
    for (const key of Object.keys(SITE_FIELDS) as ScreenKey[]) {
      const have = new Set(flattenInputs(formOf(s, key)).map((r) => generic(r.path)));
      for (const k of [
        ...(SITE_FIELDS[key] ?? []).map((x) => x.key),
        ...(NOT_SITE_VALUES[key] ?? []),
      ]) {
        const listed = k.includes('[]') && !have.has(k);
        const optional = /^(b\.|chemicals\[\])/.test(k) || /^(above|below|layers)\[\]/.test(k);
        if (!have.has(k) && !listed && !optional) bad.push(`${key}: ${k}`);
      }
    }
    expect(bad).toEqual([]);
  });
});

describe('siteEntries', () => {
  it('lists the pre-filled bulk density, crack fraction and pressure difference as not typed', () => {
    const s = forms();
    const vapor = siteEntries('vapor', formOf(s, 'vapor'), formOf(forms(), 'vapor'));
    const by = (subject: string) => vapor.find((e) => e.subject === subject);
    expect(by('Crack fraction')).toEqual({
      subject: 'Crack fraction',
      value: '0.001',
      typed: false,
    });
    expect(by('Indoor-outdoor pressure difference')).toEqual({
      subject: 'Indoor-outdoor pressure difference',
      value: '1 Pa',
      typed: false,
    });
    expect(by('Soil above the floor, bulk density')).toMatchObject({ value: '1.7 g/cm3' });
    const transport = siteEntries(
      'transport',
      formOf(s, 'transport'),
      formOf(forms(), 'transport'),
    );
    expect(transport.find((e) => e.subject === 'Hydraulic conductivity')).toMatchObject({
      value: '8.64 m/d',
      typed: false,
    });
  });

  it('marks a value the user changed as typed', () => {
    const s = forms();
    s.transport = { ...s.transport, form: { ...s.transport.form, K: '12.5' } };
    const rows = siteEntries('transport', formOf(s, 'transport'), formOf(forms(), 'transport'));
    expect(rows.find((e) => e.subject === 'Hydraulic conductivity')).toEqual({
      subject: 'Hydraulic conductivity',
      value: '12.5 m/d',
      typed: true,
    });
  });

  it('skips a blank value and a value the form choices make unused', () => {
    const s = forms();
    const rows = siteEntries('transport', formOf(s, 'transport'), formOf(forms(), 'transport'));
    const subjects = rows.map((e) => e.subject);
    expect(subjects).not.toContain('Aquifer width'); // blank
    expect(subjects).not.toContain('Seepage velocity'); // Darcy mode is on
    expect(subjects).not.toContain('Pulse duration'); // continuous loading
    expect(subjects).not.toContain('Well screen top'); // no screen
  });

  it('lists the entries of a list one by one, named by position', () => {
    const s = forms();
    s.transport = { ...s.transport, form: { ...s.transport.form, loading: 'steps' } };
    const rows = siteEntries('transport', formOf(s, 'transport'), formOf(forms(), 'transport'));
    expect(rows.map((e) => e.subject)).toEqual(
      expect.arrayContaining(['Loading step 1 start', 'Loading step 2 factor']),
    );
  });

  it('lists the concentrations the user typed for each chemical, named by the chemical', () => {
    const s = forms();
    const base = formOf(s, 'risk');
    const form = {
      ...base,
      chemicals: [{ id: 'c1', name: 'Benzene', conc: { soil: '12', groundwater: '0.34' } }],
    };
    const rows = siteEntries('risk', form, base);
    expect(rows).toEqual(
      expect.arrayContaining([
        { subject: 'Benzene, soil concentration', value: '12 mg/kg', typed: true },
        { subject: 'Benzene, groundwater concentration', value: '0.34 mg/L', typed: true },
      ]),
    );
  });

  it('does not list a soil property that still has the value of its texture class (that is cited)', () => {
    const s = forms();
    const base = formOf(s, 'vapor');
    const layers = (base['layers'] as Record<string, string>[]).map((l, i) =>
      i === 0 ? vaporTexture(l as never, 'S') : l,
    );
    const rows = siteEntries('vapor', { ...base, layers }, base);
    const first = rows.filter((e) => e.subject.startsWith('Soil above the floor'));
    expect(first.map((e) => e.subject)).toEqual([
      'Soil above the floor, thickness',
      'Soil above the floor, organic carbon fraction',
    ]);
    // edit one of the class values and it is listed again, as typed
    const edited = layers.map((l, i) => (i === 0 ? { ...l, porosity: '0.4' } : l));
    const again = siteEntries('vapor', { ...base, layers: edited }, base);
    expect(again.find((e) => e.subject === 'Soil above the floor, porosity')).toMatchObject({
      value: '0.4',
      typed: true,
    });
  });
});
