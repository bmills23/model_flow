import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { cleanup } from '@testing-library/react';
import { afterEach, vi } from 'vitest';
import { forgetMemory } from './project/store';

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

// Screens keep their form in the project store, so each test starts from a fresh project.
afterEach(() => {
  cleanup();
  forgetMemory();
  try {
    localStorage.clear();
  } catch {
    // a test that stubs storage
  }
});
