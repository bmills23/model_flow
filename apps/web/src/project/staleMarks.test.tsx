import { act, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';
import { defaultScreens } from './index';
import { clearWellFeed, setWellFeed } from '../transport/wellFeed';
import { DownloadCsv } from '../export/DownloadCsv';
import { markStaleTable } from '../export/staleCsv';
import { exportCsv } from '../export/csv';
import { csvFileName } from '../export/csvFileName';
import { forgetMemory, getScreen, setScreen } from './store';
import { cleanupFeedsRead, feedsReadBy, riskFeedsRead, transportFeedsRead } from './feedsRead';
import { staleSentence } from './staleFeeds';
import { StaleMark } from './StaleMark';

const wellFeed = {
  method: 'modern' as const,
  label: 'Receptor well',
  times: [0, 10],
  values: [0, 1e-6],
};

function sendWell(): void {
  act(() => setWellFeed(wellFeed));
}
function editTransport(): void {
  const before = getScreen('transport');
  act(() => setScreen('transport', { ...before, form: { ...before.form, K: '99' } }));
}

afterEach(() => {
  clearWellFeed();
  forgetMemory();
});

describe('staleSentence', () => {
  it('names each value and the screen that sends it', () => {
    const s = staleSentence(['well', 'surfaceWater']);
    expect(s).toMatch(/out of date/i);
    expect(s).toContain('Receptor well concentration (Transport)');
    expect(s).toContain('Surface water concentration (Surface water)');
  });
});

describe('feedsReadBy', () => {
  it('lists only the feeds a screen is set to read', () => {
    const s = defaultScreens();
    expect(feedsReadBy(s).transport ?? []).toEqual([]);
    s.transport.form = { ...s.transport.form, feedFromVadose: true };
    s.household.form = { ...s.household.form, irrigationWaterSource: 'well' };
    s.vapor = { ...s.vapor, choice: 'waterTable' };
    s.surfaceWater.form = { ...s.surfaceWater.form, linked: true };
    const r = feedsReadBy(s);
    expect(r.transport).toEqual(['vadose']);
    expect(r.household).toEqual(['well']);
    expect(r.vapor).toEqual(['vaporWaterTable']);
    expect(r.surfaceWater).toEqual(['bank']);
  });

  it('adds the feeds a risk or cleanup chemical row takes', () => {
    const s = defaultScreens();
    const base = {
      id: '71-43-2',
      name: 'benzene',
      conc: {},
      groundwaterFromWell: true,
      indoorFromVapor: true,
    };
    s.risk.form = { ...s.risk.form, chemicals: [base as never] };
    expect(feedsReadBy(s).risk).toEqual(expect.arrayContaining(['well', 'vaporRisk']));
    s.cleanup.form = { ...s.cleanup.form, source: 'vadose' };
    expect(feedsReadBy(s).cleanup).toEqual(expect.arrayContaining(['transportChain', 'vadose']));
    s.cleanup.form = { ...s.cleanup.form, chemicals: [base as never] };
    expect(feedsReadBy(s, { household: { chemicalId: '71-43-2' } }).cleanup).toContain('household');
  });
});

describe('feeds read for one chemical', () => {
  const row = (id: string, flags: Record<string, unknown>) => ({ id, name: id, ...flags }) as never;
  it('marks the household and vapor feeds on the risk screen only when they are for a flagged row', () => {
    const rows = [
      row('108-88-3', { bathroomFromHousehold: true, indoorFromVapor: true }),
      row('71-43-2', {}),
    ];
    expect(riskFeedsRead([...rows])).toEqual(['vaporRisk', 'household']);
    const other = { household: { chemicalId: '71-43-2' }, vaporRisk: { chemicalId: '71-43-2' } };
    expect(riskFeedsRead([...rows], other)).toEqual([]);
    const mine = { household: { chemicalId: '108-88-3' }, vaporRisk: { chemicalId: '108-88-3' } };
    expect(riskFeedsRead([...rows], mine)).toEqual(['vaporRisk', 'household']);
  });

  it('marks a cleanup section for a held household or vapor feed only when its chemical is a row', () => {
    const form = { source: 'direct', chemicals: [row('108-88-3', {})] };
    const held = {
      household: { chemicalId: '71-43-2' },
      vaporRisk: { chemicalId: '108-88-3' },
      surfaceWater: { times: [1] },
      tph: { label: 'x' },
    };
    expect(cleanupFeedsRead(form, held)).toEqual(['vaporRisk', 'surfaceWater', 'tph']);
  });

  it('reads the vadose feed on the transport screen only while the saturated feed is not on', () => {
    expect(transportFeedsRead({ feedFromVadose: true, feedFromSaturated: true })).toEqual([
      'saturated',
    ]);
    expect(transportFeedsRead({ feedFromVadose: true, feedFromSaturated: false })).toEqual([
      'vadose',
    ]);
  });
});

describe('uncertainty reads feeds', () => {
  it('the report uncertainty section reads the feeds of the risk and cleanup setups it samples', () => {
    const s = defaultScreens();
    expect(feedsReadBy(s).uncertainty ?? []).toEqual([]);
    s.risk.form = {
      ...s.risk.form,
      chemicals: [{ id: '71-43-2', name: 'b', conc: {}, groundwaterFromWell: true } as never],
    };
    s.cleanup.form = { ...s.cleanup.form, source: 'vadose' };
    s.uncertainty.risk = { ...s.uncertainty.risk, sobol: true };
    s.uncertainty.cleanup = { ...s.uncertainty.cleanup, protection: '90' };
    expect(feedsReadBy(s).uncertainty).toEqual(
      expect.arrayContaining(['well', 'transportChain', 'vadose']),
    );
  });
});

describe('StaleMark', () => {
  it('shows text when the feed is stale and nothing when it is fresh', () => {
    sendWell();
    render(<StaleMark feed="well" />);
    expect(screen.queryByText(/out of date/i)).toBeNull();
    editTransport();
    expect(screen.getByText(/out of date/i)).toBeTruthy();
    expect(screen.getByText(/send again from transport/i)).toBeTruthy();
  });
});

describe('stale CSV tables', () => {
  const table = {
    name: 'demo',
    label: 'demo',
    rows: [{ a: 1 }],
    columns: [{ key: 'a', header: 'a' }],
    feeds: ['well' as const],
  };

  it('adds a stale inputs column and a file name suffix, and leaves a fresh table alone', () => {
    const fresh = markStaleTable(table, []);
    expect(fresh.columns).toHaveLength(1);
    expect(fresh.name).toBe('demo');
    const marked = markStaleTable(table, ['well']);
    expect(marked.name).toBe('demo-stale-inputs');
    expect(exportCsv(marked.rows, marked.columns)).toBe(
      'a,stale inputs\r\n1,out of date: Receptor well concentration (Transport)\r\n',
    );
    expect(csvFileName(marked)).toMatch(/^demo-stale-inputs-v/);
  });

  it('states it beside the download only while the feed is stale', () => {
    sendWell();
    render(<DownloadCsv tables={[table]} />);
    expect(screen.queryByText(/out of date/i)).toBeNull();
    editTransport();
    expect(screen.getByRole('note').textContent).toMatch(/out of date.*stale inputs column/i);
  });
});
