import { defineCoverage } from './uncertainCoverage.js';

// Kept apart from uncertain-coverage.test.ts: its perturbation sweep runs the layered solver dozens of times.
defineCoverage((c) => c.name === 'vadose.layered');
