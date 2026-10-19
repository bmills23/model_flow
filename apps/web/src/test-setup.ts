import { cleanup } from '@testing-library/react';
import { afterEach } from 'vitest';
import { forgetMemory } from './project/store';

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
