export type SurfaceWaterFeedMethod = 'well-mixed' | 'mass-discharge';

/**
 * The surface water concentration history of the surface water screen, offered to the exposure and risk
 * screen as the swimming concentration series. Times are in s from the start of the release and
 * concentrations in kg/m3 (SI, as the engine takes them). `origin` is the registered method id the
 * series came from, carried onto the exposure point concentration. It lives in memory for the session.
 */
export interface SurfaceWaterFeed {
  method: SurfaceWaterFeedMethod;
  origin: string;
  label: string;
  times: number[];
  values: number[];
}

let current: SurfaceWaterFeed | null = null;
const listeners = new Set<() => void>();

const emit = (): void => listeners.forEach((fn) => fn());

export function getSurfaceWaterFeed(): SurfaceWaterFeed | null {
  return current;
}

export function setSurfaceWaterFeed(feed: SurfaceWaterFeed): void {
  current = feed;
  emit();
}

export function clearSurfaceWaterFeed(): void {
  if (current === null) return;
  current = null;
  emit();
}

export function subscribeSurfaceWaterFeed(fn: () => void): () => void {
  listeners.add(fn);
  return () => {
    listeners.delete(fn);
  };
}
