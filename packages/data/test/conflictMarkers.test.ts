import { execFileSync } from 'node:child_process';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { findConflictMarkers, scanTrackedFiles } from '../src/conflictMarkers.js';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '../../..');
const open = '<'.repeat(7);
const close = '>'.repeat(7);
const mid = '='.repeat(7);

describe('merge conflict marker guard', () => {
  it('finds the three marker lines with their line numbers', () => {
    const text = ['a', `${open} HEAD`, 'ours', mid, 'theirs', `${close} branch`, 'b'].join('\n');
    expect(findConflictMarkers(text, 'docs/DECISIONS.md').map((m) => m.line)).toEqual([2, 4, 6]);
    expect(findConflictMarkers(text, 'src/a.ts').map((m) => m.line)).toEqual([2, 4, 6]);
  });

  it('ignores longer rules, indented text and a marker-like word mid line', () => {
    const text = [`${mid}=`, `  ${mid}`, `x ${open} y`, `${open}no space`].join('\n');
    expect(findConflictMarkers(text, 'a.txt')).toEqual([]);
  });

  it('allows markers inside a fenced code block of a markdown file only', () => {
    const text = ['```diff', `${open} HEAD`, mid, `${close} x`, '```'].join('\n');
    expect(findConflictMarkers(text, 'docs/howto.md')).toEqual([]);
    expect(findConflictMarkers(text, 'src/a.ts')).toHaveLength(3);
  });

  it('finds a marker after a fence has been closed', () => {
    const text = ['```', 'code', '```', `${open} HEAD`].join('\n');
    expect(findConflictMarkers(text, 'docs/x.md').map((m) => m.line)).toEqual([4]);
  });

  it('finds none in any tracked file of this repository', () => {
    const files = execFileSync('git', ['ls-files'], { cwd: root, encoding: 'utf8' });
    expect(files.length).toBeGreaterThan(0);
    expect(scanTrackedFiles(root)).toEqual([]);
  });
});
