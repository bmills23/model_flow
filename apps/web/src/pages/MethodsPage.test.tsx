import { references, registry } from '@model-flow/engine';
import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { MethodsPage } from './MethodsPage';

const escapeRegExp = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

describe('MethodsPage', () => {
  it('lists every registered method with its kind label', () => {
    render(<MethodsPage />);
    for (const m of registry.list()) {
      expect(screen.getByText(m.name)).toBeTruthy();
    }
    expect(screen.getAllByText('Legacy (RISC5 default)').length).toBeGreaterThan(0);
    expect(screen.getAllByText('Modern').length).toBeGreaterThan(0);
  });

  it('shows the full citation for every reference a method cites', () => {
    render(<MethodsPage />);
    const byKey = new Map(references.map((r) => [r.key, r]));
    for (const m of registry.list()) {
      for (const key of m.citations) {
        const ref = byKey.get(key);
        expect(ref).toBeDefined();
        expect(screen.getAllByText(new RegExp(escapeRegExp(ref!.title))).length).toBeGreaterThan(0);
      }
    }
  });
});
