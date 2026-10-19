import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { warnBeforeUnload } from './unloadGuard';
import { hasUnsavedChanges, markSaved, setTitle } from './store';

/** Dispatch a beforeunload and report whether the page asked to be warned. */
function unload(target: EventTarget): { prevented: boolean; returnValue: unknown } {
  const event = new Event('beforeunload', { cancelable: true });
  // jsdom's Event.returnValue is a boolean accessor; a browser BeforeUnloadEvent takes a string
  Object.defineProperty(event, 'returnValue', { value: undefined, writable: true, configurable: true });
  target.dispatchEvent(event);
  return {
    prevented: event.defaultPrevented,
    returnValue: (event as unknown as { returnValue: unknown }).returnValue,
  };
}

describe('warnBeforeUnload', () => {
  let target: EventTarget;
  beforeEach(() => {
    target = new EventTarget();
    markSaved();
  });
  afterEach(() => {
    markSaved();
  });

  it('does not prompt when the project has no unsaved changes', () => {
    const stop = warnBeforeUnload(() => false, target);
    const result = unload(target);
    expect(result.prevented).toBe(false);
    expect(result.returnValue).toBeFalsy();
    stop();
  });

  it('prompts (preventDefault and a returnValue) while the project has unsaved changes', () => {
    const stop = warnBeforeUnload(() => true, target);
    const result = unload(target);
    expect(result.prevented).toBe(true);
    expect(typeof result.returnValue).toBe('string');
    expect((result.returnValue as string).length).toBeGreaterThan(0);
    stop();
  });

  it('follows the live store: a title edit is unsaved, markSaved clears it', () => {
    const stop = warnBeforeUnload(hasUnsavedChanges, target);
    expect(unload(target).prevented).toBe(false);
    setTitle('Unsaved edit');
    expect(unload(target).prevented).toBe(true);
    markSaved();
    expect(unload(target).prevented).toBe(false);
    setTitle('');
    stop();
  });

  it('removes its listener when the returned cleanup runs', () => {
    const stop = warnBeforeUnload(() => true, target);
    stop();
    expect(unload(target).prevented).toBe(false);
  });
});
