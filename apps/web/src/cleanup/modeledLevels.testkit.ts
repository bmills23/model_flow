import type { ModeledOutcome } from './modeledTypes';
import type { SavedModeledLevels } from './modeledLevels';

/** A solved outcome with the fields the saved levels read; `level` is SI (kg/m3 for groundwater). */
export function fakeOutcome(
  medium: 'soil' | 'groundwater',
  levels: { modern: number | null; legacy?: number | null },
): ModeledOutcome {
  const run = (level: number | null) => ({
    result: {
      allocation: 'individual',
      scale: null,
      scaleLimiting: null,
      warnings: [{ code: 'test.warn', message: 'a warning' }],
      levels: [
        {
          chemical: '1330-20-7',
          level,
          limiting: level === null ? null : 'noncancer',
          cancerLevel: null,
          noncancerLevel: level,
          impliedTph: null,
          solves: {},
        },
      ],
    },
    shown: { endpoint: 'noncancer', target: 1 },
    curve: { conc: [], cancer: [], hi: [], peak: [] },
    convergence: {
      method: level === null ? 'none' : 'brent',
      evaluations: 12,
      iterations: 7,
      residual: level === null ? NaN : 1e-10,
      acceptance: 1e-9,
    },
    start: 1,
    cap: null,
    numerical: false,
    transportLabel: 'test aquifer',
  });
  const out = {
    medium,
    modern: { ok: true, run: run(levels.modern) },
  } as unknown as ModeledOutcome;
  if (levels.legacy !== undefined) {
    (out as { legacy?: unknown }).legacy = { ok: true, run: run(levels.legacy) };
  }
  return out;
}

export function savedFixture(over: Partial<SavedModeledLevels> = {}): SavedModeledLevels {
  return {
    chemicalId: '1330-20-7',
    chemical: 'Xylenes',
    fingerprint: 'abc12345',
    source: 'dissolved',
    medium: 'groundwater',
    methods: {
      modern: {
        ok: true,
        level: 0.481,
        cancerLevel: null,
        noncancerLevel: 0.481,
        limiting: 'noncancer',
        impliedTph: null,
        endpoint: 'noncancer',
        target: 1,
        solvedBy: 'brent',
        evaluations: 12,
        residual: 1e-10,
        transport: 'test aquifer',
        warnings: [],
      },
    },
    notes: ['Aquifer, source box and well from the groundwater screen (test aquifer).'],
    ...over,
  };
}
