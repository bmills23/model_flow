import { describe, expect, it, vi } from 'vitest';
import { createFeed } from './feedStore';

describe('createFeed', () => {
  it('starts empty, holds the latest value and clears', () => {
    const feed = createFeed<{ n: number }>();
    expect(feed.get()).toBeNull();
    const value = { n: 1 };
    feed.set(value);
    expect(feed.get()).toBe(value);
    feed.clear();
    expect(feed.get()).toBeNull();
  });

  it('notifies on set and on a real clear only, and stops after unsubscribe', () => {
    const feed = createFeed<number>();
    const fn = vi.fn();
    const off = feed.subscribe(fn);
    feed.clear();
    expect(fn).toHaveBeenCalledTimes(0);
    feed.set(1);
    feed.clear();
    expect(fn).toHaveBeenCalledTimes(2);
    off();
    feed.set(2);
    expect(fn).toHaveBeenCalledTimes(2);
  });

  it('keeps stores independent', () => {
    const a = createFeed<number>();
    const b = createFeed<number>();
    a.set(1);
    expect(b.get()).toBeNull();
  });

  it('starts from an initial value and clears back to empty', () => {
    const feed = createFeed<{ n: number }>({ n: 7 });
    expect(feed.get()).toEqual({ n: 7 });
    feed.clear();
    expect(feed.get()).toBeNull();
  });
});
