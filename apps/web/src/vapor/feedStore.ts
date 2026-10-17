/** A held value shared between screens for the session; a reload starts without one. */
export function createFeed<T>(): {
  get: () => T | null;
  set: (value: T) => void;
  clear: () => void;
  subscribe: (fn: () => void) => () => void;
} {
  let current: T | null = null;
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
