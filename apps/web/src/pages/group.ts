import type { MethodDescriptor, ProcessId } from '@model-flow/engine';

export interface ProcessGroup {
  process: ProcessId;
  methods: MethodDescriptor<unknown, unknown>[];
}

export function groupByProcess(
  methods: readonly MethodDescriptor<unknown, unknown>[],
): ProcessGroup[] {
  const groups = new Map<ProcessId, ProcessGroup>();
  for (const method of methods) {
    const group = groups.get(method.process) ?? { process: method.process, methods: [] };
    group.methods.push(method);
    groups.set(method.process, group);
  }
  return [...groups.values()];
}
