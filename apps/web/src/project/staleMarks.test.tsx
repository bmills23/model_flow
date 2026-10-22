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
import { staleAmong, staleSentence } from './staleFeeds';
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

  it('names the chemical of a stale slot', () => {
    const s = staleSentence([{ feed: 'well', chemicalId: '71-43-2' }], (id) =>
      id === '71-43-2' ? 'Benzene' : id,
    );
    expect(s).toBe('Out of date: Receptor well concentration for Benzene (Transport)');
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
    // each read is for the reading screen's chemical; a screen typed by hand reads any slot
    expect(r.transport).toEqual([{ feed: 'vadose' }]);
    expect(r.household).toEqual([{ feed: 'well' }]);
    // the vapor screen starts on its Table R-3 fixture, which is not a project chemical
    expect(r.vapor).toEqual([{ feed: 'vaporWaterTable', chemicalId: 'risc4-benzene' }]);
    expect(r.surfaceWater).toEqual([{ feed: 'bank' }]);
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
    const b = (feed: string) => ({ feed, chemicalId: '71-43-2' });
    expect(feedsReadBy(s).risk).toEqual(expect.arrayContaining([b('well'), b('vaporRisk')]));
    s.cleanup.form = { ...s.cleanup.form, source: 'vadose' };
    expect(feedsReadBy(s).cleanup).toEqual(
      expect.arrayContaining([{ feed: 'transportChain' }, { feed: 'vadose' }]),
    );
    s.cleanup.form = { ...s.cleanup.form, chemicals: [base as never] };
    expect(feedsReadBy(s, { household: { '71-43-2': {} } }).cleanup).toContainEqual(b('household'));
  });
});

describe('feeds read for one chemical', () => {
  const row = (id: string, flags: Record<string, unknown>) => ({ id, name: id, ...flags }) as never;
  const slot = (feed: string, chemicalId: string) => ({ feed, chemicalId }) as never;
  it('marks the household and vapor feeds on the risk screen only for the slot of a flagged row', () => {
    const rows = [
      row('108-88-3', { bathroomFromHousehold: true, indoorFromVapor: true }),
      row('71-43-2', {}),
    ];
    const reads = riskFeedsRead([...rows]);
    expect(reads).toEqual([
      { feed: 'vaporRisk', chemicalId: '108-88-3' },
      { feed: 'household', chemicalId: '108-88-3' },
    ]);
    const other = [slot('household', '71-43-2'), slot('vaporRisk', '71-43-2')];
    expect(staleAmong(reads, other)).toEqual([]);
    const mine = [slot('household', '108-88-3'), slot('vaporRisk', '108-88-3')];
    expect(staleAmong(reads, mine)).toEqual(mine);
  });

  it('marks a cleanup section for a held household or vapor slot only when its chemical is a row', () => {
    const form = { source: 'direct', chemicals: [row('108-88-3', {})] };
    const held = {
      household: { '71-43-2': {} },
      vaporRisk: { '108-88-3': {} },
      surfaceWater: { '': {} },
      tph: { label: 'x' },
    };
    const reads = cleanupFeedsRead(form, held);
    expect(
      staleAmong(reads, [
        slot('household', '71-43-2'),
        slot('vaporRisk', '108-88-3'),
        slot('surfaceWater', ''),
        slot('tph', ''),
      ]),
    ).toEqual([slot('vaporRisk', '108-88-3'), slot('surfaceWater', ''), slot('tph', '')]);
  });

  it('reads the vadose feed on the transport screen only while the saturated feed is not on', () => {
    expect(transportFeedsRead({ feedFromVadose: true, feedFromSaturated: true })).toEqual([
      { feed: 'saturated' },
    ]);
    expect(
      transportFeedsRead({ feedFromVadose: true, feedFromSaturated: false, chemicalId: 'x' }),
    ).toEqual([{ feed: 'vadose', chemicalId: 'x' }]);
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
      expect.arrayContaining([
        { feed: 'well', chemicalId: '71-43-2' },
        { feed: 'transportChain' },
        { feed: 'vadose' },
      ]),
    );
  });
});

describe('StaleMark', () => {
  it('shows text when the feed is stale and nothing when it is fresh', () => {
    sendWell();
    render(<StaleMark feed="well" chemicalId={undefined} />);
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
