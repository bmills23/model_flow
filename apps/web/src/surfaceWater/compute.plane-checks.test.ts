import { describe, expect, it } from 'vitest';
import { linkedRun } from './computeLinked';

describe('surface water compute, plane checks', () => {
  it('warns on both methods when the discharge thickness is far shallower than the plume', () => {
    const res = linkedRun({ reachLength: '5', thickness: '0.5' });
    const codes = (w: { code: string }[]) => w.map((x) => x.code);
    expect(codes(res.modern.warnings)).toContain('surfaceWater.plume-underflow');
    expect(codes(res.legacy.warnings)).toContain('surfaceWater.plume-underflow');
  }, 30000);

  it('warns that a short reach truncates the plume', () => {
    const res = linkedRun({ reachLength: '1', thickness: '3' });
    expect(res.modern.warnings.map((w) => w.code)).toContain('surfaceWater.reach-truncates-plume');
  }, 30000);
});
