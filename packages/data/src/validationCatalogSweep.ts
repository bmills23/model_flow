import type { ExampleSpec } from './validation.js';

/**
 * Extension point for the published-value sweeps. A sweep appends its example specs here; the catalog
 * folds them into `examples` and the generator renders them like any other entry. A spec with no fixture
 * file names the data it counts in `dataFiles` (paths relative to `packages/data/generated`).
 */
export const sweepExamples: ExampleSpec[] = [];
