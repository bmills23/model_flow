/**
 * A held value shared between screens. It starts empty unless an `initial` value is given; the
 * project store restores saved feeds into it when the app starts.
 */
export function createFeed<T>(initial: T | null = null): {
  get: () => T | null;
  set: (value: T) => void;
  clear: () => void;
  subscribe: (fn: () => void) => () => void;
} {
  let current: T | null = initial;
  const listeners = new Set<() => void>();
  const emit = (): void => listeners.forEach((fn) => fn());
  return {
    get: () => current,
    set: (value) => {
      current = value;
      emit();
    },
    clear: () => {
      if (current === null) return;
      current = null;
      emit();
    },
    subscribe: (fn) => {
      listeners.add(fn);
      return () => {
        listeners.delete(fn);
      };
    },
  };
}
