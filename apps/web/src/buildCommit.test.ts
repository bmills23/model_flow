// @vitest-environment node
import { execFileSync } from 'node:child_process';
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { shortCommit } from './buildCommit';

const dirs: string[] = [];
afterEach(() => {
  for (const d of dirs.splice(0)) rmSync(d, { recursive: true, force: true });
});

const git = (cwd: string, ...args: string[]): string =>
  execFileSync('git', ['-c', 'user.email=t@example.test', '-c', 'user.name=t', ...args], {
    cwd,
    encoding: 'utf8',
    stdio: ['ignore', 'pipe', 'ignore'],
  }).trim();

function repo(): string {
  const d = mkdtempSync(join(tmpdir(), 'mf-commit-'));
  dirs.push(d);
  git(d, 'init', '-q');
  writeFileSync(join(d, '.gitignore'), 'dist/\n');
  writeFileSync(join(d, 'a.txt'), 'one\n');
  git(d, 'add', '.');
  git(d, 'commit', '-q', '-m', 'first');
  return d;
}

describe('shortCommit', () => {
  it('is the short HEAD of a clean tree', () => {
    const d = repo();
    expect(shortCommit(d)).toBe(git(d, 'rev-parse', '--short', 'HEAD'));
  });

  it('marks a tree whose tracked files differ from HEAD', () => {
    const d = repo();
    writeFileSync(join(d, 'a.txt'), 'two\n');
    expect(shortCommit(d)).toBe(`${git(d, 'rev-parse', '--short', 'HEAD')}-dirty`);
  });

  it('marks a staged change', () => {
    const d = repo();
    writeFileSync(join(d, 'b.txt'), 'new\n');
    git(d, 'add', 'b.txt');
    expect(shortCommit(d)).toMatch(/-dirty$/);
  });

  it('does not mark untracked files or files in ignored directories', () => {
    const d = repo();
    mkdirSync(join(d, 'dist'));
    writeFileSync(join(d, 'dist', 'out.js'), 'x');
    writeFileSync(join(d, 'scratch.txt'), 'x');
    expect(shortCommit(d)).toBe(git(d, 'rev-parse', '--short', 'HEAD'));
  });

  it('says unknown outside a checkout', () => {
    const d = mkdtempSync(join(tmpdir(), 'mf-nogit-'));
    dirs.push(d);
    expect(shortCommit(d, { GIT_CEILING_DIRECTORIES: tmpdir() })).toBe('unknown');
  });
});
