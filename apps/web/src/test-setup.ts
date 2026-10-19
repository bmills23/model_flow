import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { afterEach, vi } from 'vitest';

// The chemical browser fetches the full RSL property file as an asset (see chemicals/load.ts); in
// tests the same bytes are served from disk.
const realFetch = globalThis.fetch;
vi.stubGlobal('fetch', (input: RequestInfo | URL, init?: RequestInit) => {
  const url = typeof input === 'string' ? input : input instanceof URL ? input.href : input.url;
  if (/(^|\/)chemicals[^/]*\.json$/.test(url)) {
    return readFile(
      resolve(process.cwd(), '../../packages/data/generated/rsl-2024-11/chemicals.json'),
      'utf8',
    ).then((text) => new Response(text, { status: 200 }));
  }
  return realFetch(input, init);
});

// Whether the current test file has already loaded a module whose path contains `fragment`. The setup
// file runs before every file, and importing the project store (with every feed behind it) or the React
// testing library for a file that never touches them cost most of a second each; the clean-up below
// only runs for what the file itself brought in.
function loaded(fragment: string): boolean {
  const worker = (
    globalThis as {
      __vitest_worker__?: { evaluatedModules?: { idToModuleMap?: Map<string, unknown> } };
    }
  ).__vitest_worker__;
  const ids = worker?.evaluatedModules?.idToModuleMap;
  if (ids === undefined) return true; // cannot tell: clean up as if everything were loaded
  for (const id of ids.keys()) if (id.includes(fragment)) return true;
  return false;
}

// Screens keep their form in the project store, so each test starts from a fresh project.
afterEach(async () => {
  if (loaded('/@testing-library/react/')) (await import('@testing-library/react')).cleanup();
  if (loaded('/src/project/store.ts')) (await import('./project/store')).forgetMemory();
  try {
    // the route hash outlives a test (a failed assertion skips its own reset) and picks the next screen
    window.location.hash = '';
    localStorage.clear();
  } catch {
    // a test that stubs storage, or a file that runs without a DOM
  }
});
