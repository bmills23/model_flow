import { execFileSync } from 'node:child_process';

/**
 * The short commit the report prints, read at build time (vite.config.ts). A build from a tree whose
 * tracked files differ from HEAD (staged or not) gets a "-dirty" suffix, since the commit alone does not
 * name what was built; untracked files, including those in ignored directories, do not count. A build
 * without git (or outside a checkout) says "unknown".
 */
export function shortCommit(cwd?: string, env?: Record<string, string>): string {
  const run = (...args: string[]): string =>
    execFileSync('git', args, {
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'ignore'],
      ...(cwd !== undefined ? { cwd } : {}),
      ...(env !== undefined ? { env: { ...process.env, ...env } } : {}),
    }).trim();
  try {
    const commit = run('rev-parse', '--short', 'HEAD');
    if (commit === '') return 'unknown';
    const changes = run('status', '--porcelain', '--untracked-files=no');
    return changes === '' ? commit : `${commit}-dirty`;
  } catch {
    return 'unknown';
  }
}
