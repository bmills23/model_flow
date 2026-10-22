import { act, renderHook, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { ModeledRequest } from './modeledTypes';
import type { ModeledItem, ModeledProgress } from './modeledRunner';

interface Call {
  reqs: readonly ModeledRequest[];
  onProgress: ((p: ModeledProgress) => void) | undefined;
  finish: () => void;
}
const calls: Call[] = [];

vi.mock('./modeledRunner', () => ({
  createModeledRunner: () => ({
    run: (reqs: readonly ModeledRequest[], onProgress?: (p: ModeledProgress) => void) =>
      new Promise((resolve) => {
        calls.push({
          reqs,
          onProgress,
          finish: () =>
            resolve({
              ok: true,
              items: reqs.map(
                (r) => ({ ok: true, outcome: { fake: r } }) as unknown as ModeledItem,
              ),
            }),
        });
      }),
    dispose: () => {},
  }),
}));

// imported after the mock so the hook builds its runner from the fake
const { useModeled } = await import('./useModeled');

const req = (id: string, v: number): ModeledRequest => ({ chemical: { id }, v }) as never;

beforeEach(() => {
  calls.length = 0;
});

describe('useModeled', () => {
  it('sends only the changed chemicals to the worker and keeps the cached solve of the others', async () => {
    const a = req('a', 1);
    const b = req('b', 1);
    const { result, rerender } = renderHook(({ r }) => useModeled(r), {
      initialProps: { r: [a, b] as readonly ModeledRequest[] },
    });
    await waitFor(() => expect(calls).toHaveLength(1));
    expect(calls[0]!.reqs).toEqual([a, b]);
    act(() => calls[0]!.finish());
    await waitFor(() => expect(result.current.computing).toBe(false));
    const first = result.current.reply;
    expect(first?.ok && first.items).toHaveLength(2);

    rerender({ r: [a, req('b', 2)] });
    await waitFor(() => expect(calls).toHaveLength(2), { timeout: 3000 });
    // only the changed chemical is solved again
    expect(calls[1]!.reqs.map((r) => r.chemical.id)).toEqual(['b']);
    act(() => calls[1]!.finish());
    await waitFor(() => expect(result.current.computing).toBe(false));
    const second = result.current.reply;
    if (!first?.ok || !second?.ok) throw new Error('reply');
    expect(second.items[0]).toBe(first.items[0]);
    expect(second.items[1]).not.toBe(first.items[1]);
  });

  it('counts the chemicals on screen: cached ones as solved, those that cannot be built as not', async () => {
    const a = req('a', 1);
    const b = req('b', 1);
    const { result, rerender } = renderHook(({ r, unbuilt }) => useModeled(r, unbuilt), {
      initialProps: { r: [a, b] as readonly ModeledRequest[], unbuilt: 1 },
    });
    await waitFor(() => expect(calls).toHaveLength(1));
    // three chemicals on screen, none solved yet
    expect(result.current.progress).toEqual({ done: 0, total: 3, unbuilt: 1 });
    act(() => calls[0]!.onProgress?.({ done: 1, total: 2 }));
    expect(result.current.progress).toEqual({ done: 1, total: 3, unbuilt: 1 });
    act(() => calls[0]!.finish());
    await waitFor(() => expect(result.current.computing).toBe(false));
    expect(result.current.progress).toBeNull();

    rerender({ r: [a, req('b', 2)], unbuilt: 1 });
    await waitFor(() => expect(calls).toHaveLength(2), { timeout: 3000 });
    // the cached chemical is on screen and solved, so it counts
    expect(result.current.progress).toEqual({ done: 1, total: 3, unbuilt: 1 });
    act(() => calls[1]!.finish());
    await waitFor(() => expect(result.current.computing).toBe(false));
  });
});
