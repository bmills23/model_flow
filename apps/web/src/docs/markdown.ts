// A small Markdown subset reader for the in-app docs: headings, paragraphs, bullet and numbered
// lists (one nesting level per two spaces), fenced code, tables, block quotes, rules, and the inline
// marks code, bold, italic and links. It builds a plain tree; the renderer turns it into React
// elements, so no HTML string is ever injected.

export interface ListItem {
  text: string;
  children: Block[];
}

export type Block =
  | { type: 'heading'; level: number; text: string }
  | { type: 'paragraph'; text: string }
  | { type: 'code'; lang: string; text: string }
  | { type: 'list'; ordered: boolean; items: ListItem[] }
  | { type: 'table'; header: string[]; rows: string[][] }
  | { type: 'quote'; text: string }
  | { type: 'rule' };

export type Inline =
  | { type: 'text'; text: string }
  | { type: 'code'; text: string }
  | { type: 'strong'; text: string }
  | { type: 'em'; text: string }
  | { type: 'link'; text: string; href: string };

const HEADING = /^(#{1,6})\s+(.*?)\s*#*\s*$/;
const FENCE = /^```\s*([\w-]*)\s*$/;
const LIST_MARKER = /^(\s*)([-*]|\d+\.)\s+(.*)$/;
const RULE = /^\s*(-{3,}|\*{3,})\s*$/;
const TABLE_SEPARATOR = /^\s*\|?\s*:?-+:?\s*(\|\s*:?-+:?\s*)*\|?\s*$/;

function splitRow(line: string): string[] {
  let s = line.trim();
  if (s.startsWith('|')) s = s.slice(1);
  if (s.endsWith('|') && !s.endsWith('\\|')) s = s.slice(0, -1);
  const cells: string[] = [];
  let cur = '';
  for (let i = 0; i < s.length; i++) {
    if (s[i] === '\\' && s[i + 1] === '|') {
      cur += '|';
      i++;
    } else if (s[i] === '|') {
      cells.push(cur.trim());
      cur = '';
    } else cur += s[i];
  }
  cells.push(cur.trim());
  return cells;
}

function indentOf(line: string): number {
  return line.length - line.trimStart().length;
}

function parseList(lines: string[], start: number): { block: Block; next: number } {
  const first = LIST_MARKER.exec(lines[start]!)!;
  const base = first[1]!.length;
  const ordered = /\d/.test(first[2]!);
  const items: ListItem[] = [];
  let i = start;
  while (i < lines.length) {
    const m = LIST_MARKER.exec(lines[i]!);
    if (!m || m[1]!.length !== base) break;
    const parts = [m[3]!.trim()];
    const nested: string[] = [];
    i++;
    for (; i < lines.length; i++) {
      const line = lines[i]!;
      if (line.trim() === '') {
        // a blank line stays inside the item only when an indented line follows
        const nextLine = lines[i + 1];
        if (nextLine !== undefined && indentOf(nextLine) > base && nextLine.trim() !== '') {
          nested.push('');
          continue;
        }
        break;
      }
      if (indentOf(line) <= base) break;
      if (LIST_MARKER.test(line) || nested.length > 0) nested.push(line);
      else parts.push(line.trim());
    }
    while (nested.length > 0 && nested[nested.length - 1] === '') nested.pop();
    items.push({ text: parts.join(' '), children: nested.length > 0 ? parseBlocks(nested) : [] });
  }
  return { block: { type: 'list', ordered, items }, next: i };
}

function startsBlock(lines: string[], i: number): boolean {
  const line = lines[i]!;
  return (
    HEADING.test(line) ||
    FENCE.test(line) ||
    LIST_MARKER.test(line) ||
    RULE.test(line) ||
    line.startsWith('>') ||
    isTableStart(lines, i)
  );
}

function isTableStart(lines: string[], i: number): boolean {
  const next = lines[i + 1];
  return (
    lines[i]!.includes('|') &&
    next !== undefined &&
    next.includes('-') &&
    TABLE_SEPARATOR.test(next) &&
    splitRow(lines[i]!).length > 1
  );
}

function parseBlocks(lines: string[]): Block[] {
  const blocks: Block[] = [];
  let i = 0;
  while (i < lines.length) {
    const line = lines[i]!;
    if (line.trim() === '') {
      i++;
      continue;
    }
    const fence = FENCE.exec(line.trim());
    if (fence && line.trimStart().startsWith('```')) {
      const body: string[] = [];
      i++;
      while (i < lines.length && !lines[i]!.trim().startsWith('```')) body.push(lines[i++]!);
      i++;
      blocks.push({ type: 'code', lang: fence[1]!, text: body.join('\n') });
      continue;
    }
    const h = HEADING.exec(line);
    if (h) {
      blocks.push({ type: 'heading', level: h[1]!.length, text: h[2]! });
      i++;
      continue;
    }
    if (RULE.test(line) && !LIST_MARKER.test(line)) {
      blocks.push({ type: 'rule' });
      i++;
      continue;
    }
    if (LIST_MARKER.test(line)) {
      const { block, next } = parseList(lines, i);
      blocks.push(block);
      i = next;
      continue;
    }
    if (isTableStart(lines, i)) {
      const header = splitRow(line);
      const rows: string[][] = [];
      i += 2;
      while (i < lines.length && lines[i]!.trim() !== '' && lines[i]!.includes('|')) {
        const cells = splitRow(lines[i]!);
        while (cells.length < header.length) cells.push('');
        rows.push(cells.slice(0, header.length));
        i++;
      }
      blocks.push({ type: 'table', header, rows });
      continue;
    }
    if (line.startsWith('>')) {
      const parts: string[] = [];
      while (i < lines.length && lines[i]!.startsWith('>')) {
        parts.push(lines[i]!.replace(/^>\s?/, '').trim());
        i++;
      }
      blocks.push({ type: 'quote', text: parts.join(' ') });
      continue;
    }
    const parts: string[] = [];
    while (i < lines.length && lines[i]!.trim() !== '' && (parts.length === 0 || !startsBlock(lines, i))) {
      parts.push(lines[i]!.trim());
      i++;
    }
    blocks.push({ type: 'paragraph', text: parts.join(' ') });
  }
  return blocks;
}

export function parseMarkdown(source: string): Block[] {
  return parseBlocks(source.replace(/\r\n?/g, '\n').split('\n'));
}

const INLINE =
  /`([^`]+)`|\*\*([^*]+?)\*\*|(?<![\w*])\*([^*\s][^*]*?)\*(?![\w*])|\[([^\]]+)\]\(([^)\s]+)\)/g;

export function parseInline(text: string): Inline[] {
  const out: Inline[] = [];
  let last = 0;
  const push = (s: string): void => {
    if (s !== '') out.push({ type: 'text', text: s });
  };
  for (const m of text.matchAll(INLINE)) {
    push(text.slice(last, m.index));
    if (m[1] !== undefined) out.push({ type: 'code', text: m[1] });
    else if (m[2] !== undefined) out.push({ type: 'strong', text: m[2] });
    else if (m[3] !== undefined) out.push({ type: 'em', text: m[3] });
    else out.push({ type: 'link', text: m[4]!, href: m[5]! });
    last = m.index + m[0].length;
  }
  push(text.slice(last));
  return out;
}
