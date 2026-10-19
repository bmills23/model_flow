import { defineCoverage } from './uncertainCoverage.js';

// The vadose.layered run is the slowest by far; it has its own file so the two run side by side.
defineCoverage((c) => c.name !== 'vadose.layered');
