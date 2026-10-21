import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

/**
 * A merge conflict marker guard. Prettier ignores `docs/` and markdown, so a committed conflict block
 * in a document passes every other gate step. A marker is a line that starts with seven `<` and a
 * space, starts with seven `>` and a space, or is exactly seven `=`. Inside a fenced code block of a
 * markdown file such lines are legitimate (for example a how-to showing a conflict), so they are skipped there.
 */

export interface ConflictMarker {
  line: number;
  text: string;
}

const OPEN = `${'<'.repeat(7)} `;
const CLOSE = `${'>'.repeat(7)} `;
const MID = '='.repeat(7);

export function findConflictMarkers(text: string, path: string): ConflictMarker[] {
  const markdown = /\.(md|markdown)$/i.test(path);
  const found: ConflictMarker[] = [];
  let fence: string | null = null;
  text.split(/\r?\n/).forEach((line, i) => {
    if (markdown) {
      const m = /^ {0,3}(`{3,}|~{3,})/.exec(line);
      if (m) {
        const mark = m[1]!;
        if (fence === null) fence = mark;
        else if (mark[0] === fence[0] && mark.length >= fence.length) fence = null;
        return;
      }
      if (fence !== null) return;
    }
    if (line.startsWith(OPEN) || line.startsWith(CLOSE) || line === MID) {
      found.push({ line: i + 1, text: line });
    }
  });
  return found;
}

/** Every marker in every tracked text file of the repository, as `path:line: text`. */
export function scanTrackedFiles(root: string): string[] {
  const files = execFileSync('git', ['ls-files', '-z'], {
    cwd: root,
    encoding: 'utf8',
    maxBuffer: 64 * 1024 * 1024,
  })
    .split('\0')
    .filter((f) => f !== '');
  const out: string[] = [];
  for (const f of files) {
    let buf: Buffer;
    try {
      buf = readFileSync(resolve(root, f));
    } catch {
      continue; // deleted in the working tree
    }
    if (buf.includes(0)) continue; // binary
    for (const m of findConflictMarkers(buf.toString('utf8'), f)) {
      out.push(`${f}:${m.line}: ${m.text}`);
    }
  }
  return out;
}
