// @vitest-environment node
import { describe, expect, it, vi } from 'vitest';
import { createChemicalFeed } from './feedStore';
import { ownSlot, pickSlot, resolveSlot, slotOf } from '../project/feedSlots';

interface V {
  label: string;
  chemicalId?: string;
}

describe('createChemicalFeed: one slot per chemical', () => {
  it('sending for one chemical replaces only that chemical slot', () => {
    const feed = createChemicalFeed<V>();
    const benzene = { label: 'b1', chemicalId: '71-43-2' };
    const toluene = { label: 't1', chemicalId: '108-88-3' };
    feed.set(benzene);
    feed.set(toluene);
    expect(feed.get('71-43-2')).toBe(benzene);
    expect(feed.get('108-88-3')).toBe(toluene);
    const benzene2 = { label: 'b2', chemicalId: '71-43-2' };
    feed.set(benzene2);
    expect(feed.get('71-43-2')).toBe(benzene2);
    expect(feed.get('108-88-3')).toBe(toluene);
    expect([...feed.slots().keys()]).toEqual(['108-88-3', '71-43-2']);
  });

  it('a value with no chemical goes to the untagged slot', () => {
    const feed = createChemicalFeed<V>();
    const plain = { label: 'p' };
    feed.set(plain);
    expect(feed.slots().get('')).toBe(plain);
    expect(feed.get()).toBe(plain);
  });

  it('keeps one slots snapshot until it changes, and notifies on each send and a real clear', () => {
    const feed = createChemicalFeed<V>();
    const fn = vi.fn();
    const off = feed.subscribe(fn);
    feed.clear();
    expect(fn).not.toHaveBeenCalled();
    feed.set({ label: 'a', chemicalId: 'x' });
    expect(feed.slots()).toBe(feed.slots());
    expect(fn).toHaveBeenCalledTimes(1);
    feed.clear();
    expect(feed.slots().size).toBe(0);
    expect(fn).toHaveBeenCalledTimes(2);
    off();
  });
});

describe('reading a slot for a chemical', () => {
  it('reads its own slot, else the untagged one, else the latest of another chemical', () => {
    expect(resolveSlot([], 'x')).toBeNull();
    expect(resolveSlot(['a', 'x', ''], 'x')).toBe('x');
    expect(resolveSlot(['a', ''], 'x')).toBe('');
    expect(resolveSlot(['a', 'b'], 'x')).toBe('b');
    expect(resolveSlot(['a', 'b', ''], undefined)).toBe('');
    expect(resolveSlot(['a', 'b'], ' ')).toBe('b');
  });

  it('pickSlot takes slots or one value; ownSlot takes no fallback', () => {
    const slots = new Map<string, V>([
      ['a', { label: 'a', chemicalId: 'a' }],
      ['b', { label: 'b', chemicalId: 'b' }],
    ]);
    expect(pickSlot(slots, 'a')?.label).toBe('a');
    expect(pickSlot(slots, 'z')?.label).toBe('b');
    const one = { label: 'one' };
    expect(pickSlot(one, 'a')).toBe(one);
    expect(pickSlot(null, 'a')).toBeNull();
    expect(ownSlot(slots, 'z')).toBeNull();
    expect(ownSlot(slots, 'a')?.label).toBe('a');
    expect(slotOf('  ')).toBe('');
  });
});
