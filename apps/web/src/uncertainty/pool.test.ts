import { describe, expect, it } from 'vitest';
import {
  runUncertainty,
  uncertaintySpec,
  UncertaintyError,
  type UncertainInput,
} from '@model-flow/engine';
import { buildSampleMatrix, type UncertaintySpec } from '@model-flow/engine';
import { handleRows } from './protocol';
import type { PoolRequest, PoolResponse, RowsRequest } from './protocol';
import { RunCancelledError, runPooled, type WorkerFactory, type WorkerLike } from './pool';

interface In {
  a: number;
  b: number;
}
const inputs: UncertainInput<In>[] = ['a', 'b'].map((k) => ({
  id: k,
  label: k,
  unit: '1',
  category: 'exposure' as const,
  bounds: [-1000, 1000] as const,
  get: (i: In) => i[k as 'a' | 'b'],
  set: (i: In, v: number) => ({ ...i, [k]: v }),
}));
const model = {
  uncertainInputs: inputs,
  run: (i: In) => {
    if (i.a > 4.9) throw new RangeError('too big');
    return { y: { v: i.a * 2 + i.b } };
  },
};
const resolve = (id: string) => {
  if (id !== 'toy') throw new Error(`Unknown method "${id}"`);
  return model;
};

const spec: UncertaintySpec<In, { y: { v: number } }> = {
  model,
  base: { a: 1, b: 1 },
  distributions: {
    a: { kind: 'uniform', a: 0, b: 5 },
    b: { kind: 'uniform', a: 0, b: 1 },
  },
  output: (r) => r.y.v,
  n: 237,
  seed: 'pool',
};

interface FakeOptions {
  msPerRow?: number;
  /** Respond to later chunks sooner so completion order is reversed. */
  reverse?: boolean;
  created?: FakeWorker[];
}
class FakeWorker implements WorkerLike {
  onmessage: ((e: { data: PoolResponse }) => void) | null = null;
  onerror: ((e: { message?: string }) => void) | null = null;
  terminated = false;
  received = 0;
  constructor(private readonly o: FakeOptions) {}
  postMessage(m: PoolRequest): void {
    this.received++;
    let t = 0;
    const now = () => (t += (this.o.msPerRow ?? 0) * m.rows.length);
    const res = handleRows(m, resolve, now);
    const delay = this.o.reverse ? Math.max(0, 40 - m.job) : 0;
    setTimeout(() => {
      if (!this.terminated) this.onmessage?.({ data: res });
    }, delay);
  }
  terminate(): void {
    this.terminated = true;
  }
}
const factory =
  (o: FakeOptions = {}): WorkerFactory =>
  () => {
    const w = new FakeWorker(o);
    o.created?.push(w);
    return w;
  };

function job(n = 237) {
  const built = buildSampleMatrix('lhs', { ...spec, n });
  return {
    modelId: 'toy',
    base: spec.base,
    ids: built.ids,
    rows: built.samples,
    outputPath: ['y', 'v'],
  };
}

describe('handleRows', () => {
  it('matches the engine row evaluation and reports failures by chunk row', () => {
    const j = job(60);
    const req: RowsRequest = { type: 'rows', job: 7, start: 0, ...j };
    const res = handleRows(req, resolve, () => 0);
    expect(res.type).toBe('rows');
    if (res.type !== 'rows') return;
    expect(res.job).toBe(7);
    expect(res.outputs).toHaveLength(60);
    const failedRows = res.failures.map((f) => f.row);
    expect(failedRows.length).toBeGreaterThan(0);
    for (const r of failedRows) expect(res.outputs[r]).toBeNaN();
  });
  it('answers an unknown model with an error response, not a throw', () => {
    const res = handleRows(
      { type: 'rows', job: 1, start: 0, ...job(5), modelId: 'nope' },
      resolve,
      () => 0,
    );
    expect(res.type).toBe('error');
  });
  it('treats an output path that misses as a failed iteration', () => {
    const res = handleRows(
      { type: 'rows', job: 1, start: 0, ...job(5), outputPath: ['y', 'nope'] },
      resolve,
      () => 0,
    );
    expect(res.type).toBe('rows');
    if (res.type === 'rows') expect(res.failures).toHaveLength(5);
  });
});

describe('runPooled', () => {
  const reference = runUncertainty('lhs', uncertaintySpec(spec));

  it('is bit-identical to the engine runner for 1 and 4 workers and a small chunk', async () => {
    for (const workers of [1, 4]) {
      const r = await runPooled(job(), factory(), { workers, chunkSize: 13 });
      expect(r.outputs).toEqual(reference.outputs);
      expect(r.failures.count).toBe(reference.failures.count);
      expect(r.failures.first).toEqual(reference.failures.first);
    }
  });

  it('does not depend on completion order', async () => {
    const r = await runPooled(job(), factory({ reverse: true }), { workers: 4, chunkSize: 10 });
    expect(r.outputs).toEqual(reference.outputs);
    expect(r.failures.first).toEqual(reference.failures.first);
  });

  it('uses at most the requested number of workers and terminates them', async () => {
    const created: FakeWorker[] = [];
    await runPooled(job(), factory({ created }), { workers: 3, chunkSize: 20 });
    expect(created.length).toBe(3);
    expect(created.every((w) => w.terminated)).toBe(true);
    expect(created.every((w) => w.received > 0)).toBe(true);
  });

  it('does not start more workers than there are chunks', async () => {
    const created: FakeWorker[] = [];
    await runPooled(job(8), factory({ created }), { workers: 4, chunkSize: 50 });
    expect(created.length).toBe(1);
  });

  it('reports monotone progress ending at the row count', async () => {
    const seen: number[] = [];
    await runPooled(job(), factory({ reverse: true }), {
      workers: 4,
      chunkSize: 25,
      onProgress: (p) => {
        expect(p.total).toBe(237);
        seen.push(p.done);
      },
    });
    expect(seen.length).toBeGreaterThan(2);
    for (let i = 1; i < seen.length; i++) expect(seen[i]!).toBeGreaterThanOrEqual(seen[i - 1]!);
    expect(seen[seen.length - 1]).toBe(237);
  });

  it('times the pilot rows, keeps their results and asks nothing under 60 s', async () => {
    let asked = 0;
    const r = await runPooled(job(), factory({ msPerRow: 10 }), {
      workers: 2,
      confirm: () => {
        asked++;
        return true;
      },
    });
    expect(r.projection.msPerRow).toBeCloseTo(10, 9);
    expect(r.projection.projectedMs).toBeCloseTo((10 * 237) / 2, 6);
    expect(asked).toBe(0);
    expect(r.outputs).toEqual(reference.outputs);
  });

  it('asks to confirm above 60 s and stops when declined', async () => {
    const created: FakeWorker[] = [];
    let seen = 0;
    const p = runPooled(job(), factory({ msPerRow: 1000, created }), {
      workers: 2,
      confirm: (proj) => {
        seen = proj.projectedMs;
        return false;
      },
    });
    await expect(p).rejects.toBeInstanceOf(RunCancelledError);
    expect(seen).toBeCloseTo((1000 * 237) / 2, 3);
    expect(created.every((w) => w.terminated)).toBe(true);
    // Only the pilot chunk was ever sent.
    expect(created.reduce((s, w) => s + w.received, 0)).toBe(1);
  });

  it('continues when the user confirms a long run', async () => {
    const r = await runPooled(job(), factory({ msPerRow: 1000 }), {
      workers: 2,
      confirm: () => true,
    });
    expect(r.outputs).toEqual(reference.outputs);
  });

  it('refuses above 10 minutes with uncertainty.run-budget and never asks', async () => {
    let asked = 0;
    const p = runPooled(job(), factory({ msPerRow: 10_000 }), {
      workers: 1,
      confirm: () => {
        asked++;
        return true;
      },
    });
    await expect(p).rejects.toMatchObject({ code: 'uncertainty.run-budget' });
    await expect(p).rejects.toBeInstanceOf(UncertaintyError);
    expect(asked).toBe(0);
  });

  it('cancels on abort: rejects, terminates every worker, sends no more chunks', async () => {
    const created: FakeWorker[] = [];
    const ctl = new AbortController();
    const p = runPooled(job(), factory({ created }), {
      workers: 2,
      chunkSize: 10,
      signal: ctl.signal,
      onProgress: (pr) => {
        if (pr.done >= 50) ctl.abort();
      },
    });
    await expect(p).rejects.toBeInstanceOf(RunCancelledError);
    expect(created.every((w) => w.terminated)).toBe(true);
    const sent = created.reduce((s, w) => s + w.received, 0);
    expect(sent).toBeLessThan(25);
  });

  it('rejects at once when the signal is already aborted', async () => {
    const created: FakeWorker[] = [];
    const ctl = new AbortController();
    ctl.abort();
    await expect(
      runPooled(job(), factory({ created }), { signal: ctl.signal }),
    ).rejects.toBeInstanceOf(RunCancelledError);
    expect(created.length).toBe(0);
  });

  it('rejects and terminates when a worker reports an error', async () => {
    const created: FakeWorker[] = [];
    const bad: WorkerFactory = () => {
      const w = new FakeWorker({ created });
      created.push(w);
      w.postMessage = () => {
        setTimeout(() => w.onerror?.({ message: 'boom' }), 0);
      };
      return w;
    };
    await expect(runPooled(job(), bad, { workers: 2 })).rejects.toThrow('boom');
    expect(created.every((w) => w.terminated)).toBe(true);
  });

  it('rejects when the worker answers with an error response', async () => {
    await expect(
      runPooled({ ...job(), modelId: 'nope' }, factory(), { workers: 1 }),
    ).rejects.toThrow('Unknown method');
  });

  it('rejects a bad job before starting a worker', async () => {
    const created: FakeWorker[] = [];
    await expect(runPooled({ ...job(5), rows: [] }, factory({ created }), {})).rejects.toThrow(
      UncertaintyError,
    );
    expect(created.length).toBe(0);
  });
});
