import { act, renderHook, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { SurfaceSolveJob, SurfaceSolveResult } from './surfaceSolve';

interface Call {
  jobs: readonly SurfaceSolveJob[];
  finish: () => void;
}
const calls: Call[] = [];

vi.mock('./surfaceSolveRunner', () => ({
  createSurfaceRunner: () => ({
    run: (jobs: readonly SurfaceSolveJob[]) =>
      new Promise((resolve) => {
        calls.push({
          jobs,
          finish: () =>
            resolve({
              ok: true,
              results: jobs.map((j) => ({ fake: j.key }) as unknown as SurfaceSolveResult),
            }),
        });
      }),
    dispose: () => {},
  }),
}));

// imported after the mock so the hook builds its runner from the fake
const { useSurfaceSolves } = await import('./useSurfaceSolves');

const job = (key: string): SurfaceSolveJob => ({ key }) as unknown as SurfaceSolveJob;

beforeEach(() => {
  calls.length = 0;
});

const settle = async (n: number): Promise<void> => {
  await waitFor(() => expect(calls.length).toBe(n), { timeout: 2000 });
  await act(async () => calls[n - 1]!.finish());
};

describe('useSurfaceSolves memo', () => {
  it('keeps only the results of the current jobs, and solves a job again when it comes back', async () => {
    const { result, rerender } = renderHook(({ jobs }) => useSurfaceSolves(jobs), {
      initialProps: { jobs: [job('a'), job('b')] },
    });
    await settle(1);
    expect([...result.current.solves.keys()].sort()).toEqual(['a', 'b']);

    // b is no longer asked for: its result goes; a keeps its result without another solve
    rerender({ jobs: [job('a'), job('c')] });
    await settle(2);
    expect(calls[1]!.jobs.map((j) => j.key)).toEqual(['c']);
    expect([...result.current.solves.keys()].sort()).toEqual(['a', 'c']);

    // the jobs shrink to a subset already solved: nothing is solved, the others are dropped
    rerender({ jobs: [job('c')] });
    await waitFor(() => expect([...result.current.solves.keys()]).toEqual(['c']));
    expect(calls).toHaveLength(2);

    // b returns: it was pruned, so it is solved again
    rerender({ jobs: [job('c'), job('b')] });
    await settle(3);
    expect(calls[2]!.jobs.map((j) => j.key)).toEqual(['b']);
  });

  it('drops a reply that arrives for jobs no longer asked for', async () => {
    const { result, rerender } = renderHook(({ jobs }) => useSurfaceSolves(jobs), {
      initialProps: { jobs: [job('a')] },
    });
    await waitFor(() => expect(calls).toHaveLength(1), { timeout: 2000 });
    // the jobs change while the first solve is still running
    rerender({ jobs: [job('z')] });
    await act(async () => calls[0]!.finish());
    await settle(2);
    expect([...result.current.solves.keys()]).toEqual(['z']);
  });
});
