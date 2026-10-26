import { describe, expect, it } from 'vitest';
import { loadVaporChemicals } from '../vapor/chemicals';
import { defaultGuided } from './state';
import { jobsOf, runChemical } from './run';

/**
 * The plan's run-time measurement (section 7, "Run time"): five chemicals from soil above the water
 * table through the layered (modern) vadose model to a well. Run with GUIDED_TIMING=1; it prints the time
 * per chemical and in all.
 */
const IDS = ['71-43-2', '108-88-3', '100-41-4', '1330-20-7', '1634-04-4'];

describe.skipIf(process.env['GUIDED_TIMING'] !== '1')('guided Run timing', () => {
  it('five chemicals through the layered vadose model', async () => {
    const rows = await loadVaporChemicals();
    const g = defaultGuided();
    g.site.sources = ['soilAbove'];
    g.site.paths.leaching = true;
    g.site.paths.well = true;
    g.forms.transport = { alphaLOverride: '10', alphaTOverride: '1', alphaVOverride: '0.1' };
    g.forms.vadose = { alphaL: '0.5' };
    for (const id of IDS) {
      g.sources[id] = { values: { soilAbove: { value: '100', unit: 'mg/kg' } }, note: '', tph: '' };
    }
    const chems = IDS.map((id) => ({ id, name: id, fate: rows.find((r) => r.id === id) }));
    const jobs = jobsOf(g, chems);
    const t0 = performance.now();
    for (const job of jobs) {
      const t = performance.now();
      const r = runChemical(job);
      console.log(
        `${job.chemicalId}: ${((performance.now() - t) / 1000).toFixed(2)} s, outputs ${Object.keys(r.outputs).join(' ')}, problems ${r.problems.map((p) => p.message).join(' | ')}`,
      );
      expect(r.outputs['well']).toBeDefined();
    }
    console.log(`five chemicals: ${((performance.now() - t0) / 1000).toFixed(2)} s`);
  }, 600_000);
});
