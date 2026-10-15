import type { MethodDescriptor } from '@model-flow/engine';
import { describe, expect, it } from 'vitest';
import { groupByProcess } from './group';

const m = (id: string, process: MethodDescriptor<unknown, unknown>['process']) =>
  ({ id, process }) as MethodDescriptor<unknown, unknown>;

describe('groupByProcess', () => {
  it('groups methods by process, keeping first-seen order of groups and methods', () => {
    const groups = groupByProcess([m('a', 'vadose'), m('b', 'groundwater'), m('c', 'vadose')]);
    expect(groups.map((g) => g.process)).toEqual(['vadose', 'groundwater']);
    expect(groups[0]?.methods.map((x) => x.id)).toEqual(['a', 'c']);
  });

  it('returns no groups for no methods', () => {
    expect(groupByProcess([])).toEqual([]);
  });
});
