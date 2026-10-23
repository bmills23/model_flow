import { fireEvent, render, screen, within } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';
import { CleanupPage } from './CleanupPage';
import { clearHouseholdFeed, setHouseholdFeed } from '../household/feeds';
import { clearVaporRiskFeed, setVaporRiskFeed } from '../vapor/feeds';
import { clearProduceFeed, clearTphFeed, setProduceFeed, setTphFeed } from '../plantsEco/feeds';
import { forgetMemory, getScreen, setScreen } from '../project/store';
import { clearSurfaceWaterFeed, setSurfaceWaterFeed } from '../surfaceWater/feed';
import { unlinkedRequest } from './surfaceSolve.testkit';

async function loaded() {
  render(<CleanupPage />);
  await screen.findByText(/890 chemicals/i, undefined, { timeout: 20000 });
}

async function addChemical(query: string, name: RegExp) {
  fireEvent.change(screen.getByLabelText(/find a chemical/i), { target: { value: query } });
  fireEvent.click(await screen.findByRole('button', { name }));
}

/** Swimming switched on for the first receptor, so the run has surface water levels to trace to a source. */
function withSwimming(): void {
  const s = getScreen('cleanup');
  setScreen('cleanup', {
    ...s,
    form: {
      ...s.form,
      a: {
        ...s.form.a,
        pathways: { ...s.form.a.pathways, swimIngestion: true, swimDermal: true },
        swimTime: '2.6',
        swimDays: '12',
      },
    },
  });
}

async function withBenzene() {
  await loaded();
  await addChemical('71-43-2', /add benzene/i);
}

afterEach(() => {
  clearHouseholdFeed();
  clearVaporRiskFeed();
  clearSurfaceWaterFeed();
  clearProduceFeed();
  clearTphFeed();
  forgetMemory();
});

describe('CleanupPage', () => {
  it('has its heading and asks for a chemical first', async () => {
    await loaded();
    expect(screen.getByRole('heading', { level: 1, name: /cleanup levels/i })).toBeTruthy();
    expect(screen.getByText(/add a chemical to start/i)).toBeTruthy();
  }, 30000);

  it('computes individual levels with no concentration entered and shows the limiting endpoint', async () => {
    await withBenzene();
    const region = await screen.findByRole('region', { name: /cleanup levels, modern/i });
    expect(within(region).getAllByText(/groundwater/i).length).toBeGreaterThan(0);
    expect(within(region).getAllByText(/^cancer$/i).length).toBeGreaterThan(0);
    expect(screen.getByRole('region', { name: /cleanup levels, legacy/i })).toBeTruthy();
  }, 30000);

  it('says not quantified instead of showing zero or a missing value as a level', async () => {
    await withBenzene();
    const region = await screen.findByRole('region', { name: /not quantified/i });
    expect(within(region).getAllByText(/benzene/i).length).toBeGreaterThan(0);
  }, 30000);

  it('switches among individual, cumulative and equal allocation', async () => {
    await withBenzene();
    await screen.findByRole('region', { name: /cleanup levels, modern/i });
    const equal = screen.getByRole('radio', { name: /equal/i });
    fireEvent.click(equal);
    expect((await screen.findAllByText(/target divided equally/i)).length).toBeGreaterThan(0);
    fireEvent.click(screen.getByRole('radio', { name: /cumulative/i }));
    // cumulative needs entered concentrations: the card now offers them and the page asks for them
    const card = screen.getByRole('group', { name: /benzene/i });
    expect(await screen.findByText(/enter a concentration/i)).toBeTruthy();
    fireEvent.change(within(card).getByLabelText(/groundwater \(mg\/L\)/i), {
      target: { value: '0.01' },
    });
    expect((await screen.findAllByText(/common scale/i)).length).toBeGreaterThan(0);
  }, 30000);

  it('hides the concentration fields in individual mode', async () => {
    await withBenzene();
    const card = screen.getByRole('group', { name: /benzene/i });
    expect(within(card).queryByLabelText(/groundwater \(mg\/L\)/i)).toBeNull();
  }, 30000);

  it('shows the water and soil levels behind the air levels for the household run', async () => {
    setHouseholdFeed({
      chemicalId: '71-43-2',
      label: 'Benzene, household run',
      coefficients: { bathroomAir: 0.002, sprayAir: 5e-5, particulateAir: 2e-9 },
      methods: {},
    });
    await withBenzene();
    const region = await screen.findByRole('region', { name: /household source levels/i });
    expect(within(region).getAllByText(/tap water \(shower air\)/i).length).toBeGreaterThan(0);
    expect(
      within(region).getAllByText(/surface soil \(windblown particulates\)/i).length,
    ).toBeGreaterThan(0);
  }, 30000);

  it('offers a CSV download for the household source levels once the run is sent', async () => {
    setHouseholdFeed({
      chemicalId: '71-43-2',
      label: 'Benzene, household run',
      coefficients: { bathroomAir: 0.002 },
      methods: {},
    });
    await withBenzene();
    expect(
      await screen.findByRole('button', { name: /download csv: household source levels/i }),
    ).toBeTruthy();
  }, 30000);

  it('shows the groundwater and soil levels behind the indoor and outdoor air levels for the vapor run', async () => {
    const epc = { kind: 'constant' as const, value: 1e-6, origin: 'vapor.je-1991' };
    setVaporRiskFeed({
      chemicalId: '71-43-2',
      label: 'Benzene, vapor run',
      indoor: epc,
      outdoor: epc,
      coefficients: {
        indoor: { quantified: true, methodId: 'vapor.je-1991', value: 2e-4, source: 'groundwater' },
        outdoor: {
          quantified: false,
          methodId: 'outdoorAir.box',
          reason: 'the box needs a source series',
        },
      },
    });
    await withBenzene();
    const region = await screen.findByRole('region', { name: /vapor source levels/i });
    expect(within(region).getAllByText(/groundwater \(indoor air\)/i).length).toBeGreaterThan(0);
    expect(within(region).getAllByText(/the box needs a source series/i).length).toBeGreaterThan(0);
    expect(within(region).getAllByText(/not quantified/i).length).toBeGreaterThan(0);
  }, 30000);

  it('shows no vapor panel without a vapor run for the chemical', async () => {
    await withBenzene();
    await screen.findByRole('region', { name: /cleanup levels, modern/i });
    expect(screen.queryByRole('region', { name: /vapor source levels/i })).toBeNull();
  }, 30000);

  it('shows no household panel without a household run for the chemical', async () => {
    await withBenzene();
    await screen.findByRole('region', { name: /cleanup levels, modern/i });
    expect(screen.queryByRole('region', { name: /household source levels/i })).toBeNull();
  }, 30000);

  it('shows the groundwater source levels behind the surface water levels for the surface water run', async () => {
    setSurfaceWaterFeed({
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
    withSwimming();
    await withBenzene();
    const region = await screen.findByRole('region', { name: /surface water source levels/i });
    expect(within(region).getAllByText(/source level/i).length).toBeGreaterThan(0);
    expect(within(region).getAllByText(/groundwater source/i).length).toBeGreaterThan(0);
    expect(within(region).getAllByText('Linear').length).toBeGreaterThan(0);
    expect(within(region).getAllByText('surfaceWater.mass-discharge').length).toBeGreaterThan(0);
  }, 30000);

  it('solves the source level of a surface water run with an upstream background and says so', async () => {
    setSurfaceWaterFeed({
      method: 'mass-discharge',
      origin: 'surfaceWater.mass-discharge',
      label: 'Modern mass-discharge surface water, 10.0 years',
      times: [1],
      values: [1e-6],
      coefficient: {
        value: null,
        reason: 'The run has an upstream background concentration.',
        method: 'surfaceWater.mass-discharge',
        sourceMedium: 'groundwater',
        sourceUnit: 'mg/L',
        path: 'background',
      },
      solve: { request: unlinkedRequest({ background: '0.0001' }) },
    });
    withSwimming();
    await withBenzene();
    const region = await screen.findByRole('region', { name: /surface water source levels/i });
    // the level comes back from the solve (the tests have no worker, so it runs on a timer tick)
    expect(
      (await within(region).findAllByText(/^Solved/, undefined, { timeout: 20000 })).length,
    ).toBeGreaterThan(0);
    expect(within(region).queryByText(/solving\.\.\./i)).toBeNull();
    expect(within(region).getAllByText(/groundwater source/i).length).toBeGreaterThan(0);
  }, 60000);

  it('shows no surface water panel without a surface water run', async () => {
    await withBenzene();
    await screen.findByRole('region', { name: /cleanup levels, modern/i });
    expect(screen.queryByRole('region', { name: /surface water source levels/i })).toBeNull();
  }, 30000);

  it('recomputes when the target risk changes', async () => {
    await withBenzene();
    const region = await screen.findByRole('region', { name: /cleanup levels, modern/i });
    const before = region.textContent;
    fireEvent.change(screen.getByLabelText(/target cancer risk/i), { target: { value: '1e-5' } });
    await screen.findByRole('region', { name: /cleanup levels, modern/i });
    expect(screen.getByRole('region', { name: /cleanup levels, modern/i }).textContent).not.toBe(
      before,
    );
  }, 30000);

  it('offers a second receptor and the additive option', async () => {
    await withBenzene();
    fireEvent.click(screen.getByRole('checkbox', { name: /second receptor/i }));
    expect(screen.getByRole('group', { name: 'Receptor B' })).toBeTruthy();
    expect(screen.getByRole('checkbox', { name: /add the two receptors/i })).toBeTruthy();
  }, 30000);

  it('lists warnings with their codes', async () => {
    await withBenzene();
    const w = await screen.findByRole('region', { name: /warnings and notes/i });
    expect(within(w).getAllByText(/cleanup\.|exposure\./).length).toBeGreaterThan(0);
  }, 30000);

  it('offers the probabilistic cleanup panel for a direct source', async () => {
    await withBenzene();
    const panel = await screen.findByRole('region', { name: /probabilistic cleanup level/i });
    expect(within(panel).getByRole('button', { name: /run probabilistic cleanup/i })).toBeTruthy();
  }, 30000);

  it('offers no probabilistic panel for a modeled source until its level is solved', async () => {
    await withBenzene();
    fireEvent.click(screen.getByRole('radio', { name: /groundwater source/i }));
    expect(await screen.findByText(/press "use for cleanup levels"/i)).toBeTruthy();
    expect(screen.queryByRole('region', { name: /probabilistic cleanup level/i })).toBeNull();
    expect(screen.queryByText(/not sampled yet/i)).toBeNull();
  }, 30000);

  it('shows the held total TPH level with its method, fractions and warnings', async () => {
    setTphFeed({
      methodId: 'tph.madep',
      label: 'Total TPH, tph.madep',
      targetHazardIndex: 1,
      totalMgPerKg: 333.333,
      fractions: [
        { label: 'Low', family: 'aliphatic', massFraction: 0.5, mapped: true, levelMgPerKg: 200 },
        {
          label: 'Oddball',
          family: 'aromatic',
          massFraction: 0.5,
          mapped: false,
          levelMgPerKg: null,
        },
      ],
      unmapped: ['Oddball'],
      warnings: [{ code: 'TPH_TEST_WARNING', message: 'a fraction warning' }],
    });
    await loaded();
    const region = screen.getByRole('region', { name: /total tph level/i });
    expect(within(region).getByText('tph.madep')).toBeTruthy();
    expect(within(region).getByText('333')).toBeTruthy();
    expect(within(region).getByText(/no surrogate, left out/i)).toBeTruthy();
    expect(within(region).getByText('TPH_TEST_WARNING')).toBeTruthy();
  }, 30000);

  it('shows no TPH panel when none is held', async () => {
    await loaded();
    expect(screen.queryByRole('region', { name: /total tph level/i })).toBeNull();
  }, 30000);

  it('adds the homegrown produce level to the soil table with the plant engine warnings', async () => {
    setProduceFeed({
      chemicalId: '71-43-2',
      label: 'Benzene, plantUptake.hhrap-2005',
      method: 'plantUptake.hhrap-2005',
      factors: { root: 0.02, abovegroundExposed: 0.05 },
      intakes: {
        root: { gPerKgDay: 1.5, fractionHomegrown: 0.4 },
        abovegroundExposed: { gPerKgDay: 1, fractionHomegrown: 0.4 },
      },
      intakeLabel: 'user entered',
      warnings: [{ code: 'PLANT_TEST_WARNING', message: 'log Kow is outside the fitted range' }],
    });
    await withBenzene();
    const card = screen.getByRole('group', { name: /benzene/i });
    fireEvent.click(
      within(card).getByRole('checkbox', { name: /plant factors for homegrown produce/i }),
    );
    fireEvent.click(
      screen
        .getAllByRole('checkbox', { name: /homegrown produce/i })
        .find((c) => !card.contains(c))!,
    );
    const warnings = await screen.findByRole('region', { name: /warnings and notes/i });
    expect(within(warnings).getAllByText('PLANT_TEST_WARNING').length).toBeGreaterThan(0);
    expect(within(warnings).getAllByText(/user entered intake/i).length).toBeGreaterThan(0);
    expect(screen.getAllByText(/each pathway alone/i).length).toBeGreaterThan(0);
  }, 30000);
});
