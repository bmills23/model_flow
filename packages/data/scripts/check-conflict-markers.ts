import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { scanTrackedFiles } from '../src/conflictMarkers.js';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '../../..');
const hits = scanTrackedFiles(root);
if (hits.length > 0) {
  console.error('Merge conflict markers found in tracked files:');
  for (const h of hits) console.error(`  ${h}`);
  process.exit(1);
}
console.log('No merge conflict markers in tracked files.');
