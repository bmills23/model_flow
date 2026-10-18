import { execFileSync } from 'node:child_process';

/** True when the poppler `pdftotext` tool is on the PATH. */
export const pdftotextAvailable = (): boolean => {
  try {
    execFileSync('pdftotext', ['-v'], { stdio: 'ignore' });
    return true;
  } catch {
    return false;
  }
};

const cache = new Map<string, string>();

/** Text of PDF pages first..last (1-based, inclusive) with the layout kept, whitespace collapsed. */
export const pdfPageText = (file: string, first: number, last: number): string => {
  const key = `${file}:${first}:${last}`;
  const hit = cache.get(key);
  if (hit !== undefined) return hit;
  const text = execFileSync(
    'pdftotext',
    ['-layout', '-f', String(first), '-l', String(last), file, '-'],
    {
      encoding: 'utf8',
      maxBuffer: 64 * 1024 * 1024,
    },
  ).replace(/\s+/g, ' ');
  cache.set(key, text);
  return text;
};
