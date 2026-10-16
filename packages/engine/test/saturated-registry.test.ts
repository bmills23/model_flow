import { describe, expect, it } from 'vitest';
import { registry } from '../src/index.js';
import { references } from '../src/references/index.js';

describe('saturated source methods in the registry', () => {
  const byKey = new Map(references.map((r) => [r.key, r]));
  const methods = registry.list('saturatedSource');

  it('registers a legacy and a modern method with the planned ids', () => {
    expect(methods.map((m) => m.id).sort()).toEqual([
      'saturatedSource.exponential',
      'saturatedSource.two-region',
    ]);
    expect(registry.get('saturatedSource.two-region').kind).toBe('legacy');
    expect(registry.get('saturatedSource.exponential').kind).toBe('modern');
  });

  it('cites only used references, and the legacy method records the RISC5 choice', () => {
    for (const m of methods) {
      expect(m.citations.length).toBeGreaterThan(0);
      for (const key of m.citations) expect(byKey.get(key)?.status, `${m.id} ${key}`).toBe('used');
    }
    const legacy = registry.get('saturatedSource.two-region');
    expect(legacy.risc5Choice?.length).toBeGreaterThan(40);
    const modern = registry.get('saturatedSource.exponential');
    for (const key of ['newell1996', 'falta2005', 'feenstra1991']) {
      expect(modern.citations).toContain(key);
    }
  });

  it('does not cite the Cline et al. paper, whose content was not confirmed', () => {
    for (const m of methods) expect(m.citations).not.toContain('cline1991');
    expect(byKey.get('cline1991')?.status).toBe('planned');
  });

  it('runs through the registry and validates', () => {
    for (const m of methods) {
      expect(m.assumptions.length).toBeGreaterThan(3);
      expect(typeof m.validate).toBe('function');
    }
  });
});
