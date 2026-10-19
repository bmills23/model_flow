import { parseProject, type LoadResult, type Project } from './index';

/** The hash route a shared project travels under: `#/p=<payload>`. */
export const SHARE_PREFIX = '/p=';
/** A share link longer than this is not offered (chat apps, mail clients and browsers truncate beyond it). */
export const MAX_SHARE_LINK_LENGTH = 8000;
/** The most text a shared payload may expand to; a guard against a small payload that inflates hugely. */
export const MAX_SHARED_JSON_BYTES = 4 * 1024 * 1024;

export type ShareResult =
  { ok: true; link: string } | { ok: false; error: string; length?: number };

const NO_COMPRESSION =
  'This browser cannot compress a share link. Use Save project to download a file instead.';

const hasCompression = (): boolean =>
  typeof CompressionStream !== 'undefined' && typeof DecompressionStream !== 'undefined';

function toBase64Url(bytes: Uint8Array): string {
  let bin = '';
  const chunk = 0x8000;
  for (let i = 0; i < bytes.length; i += chunk) {
    bin += String.fromCharCode(...bytes.subarray(i, i + chunk));
  }
  return btoa(bin).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

function fromBase64Url(text: string): Uint8Array {
  if (!/^[A-Za-z0-9_-]+$/.test(text)) throw new Error('bad characters');
  const b64 = text.replace(/-/g, '+').replace(/_/g, '/');
  const bin = atob(b64 + '='.repeat((4 - (b64.length % 4)) % 4));
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}

async function readAll(readable: ReadableStream<Uint8Array>, cap: number): Promise<Uint8Array> {
  const reader = readable.getReader();
  const parts: Uint8Array[] = [];
  let total = 0;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    total += value.length;
    if (total > cap) {
      await reader.cancel();
      throw new Error('too large');
    }
    parts.push(value);
  }
  const all = new Uint8Array(total);
  let at = 0;
  for (const p of parts) {
    all.set(p, at);
    at += p.length;
  }
  return all;
}

/** Push bytes through a (de)compression transform; the write runs alongside the read so neither stalls. */
async function pipeBytes(
  transform: { readable: ReadableStream<Uint8Array>; writable: WritableStream<BufferSource> },
  bytes: Uint8Array,
  cap: number,
): Promise<Uint8Array> {
  const writer = transform.writable.getWriter();
  const written = writer.write(bytes as BufferSource).then(() => writer.close());
  written.catch(() => undefined);
  const out = await readAll(transform.readable, cap);
  await written;
  return out;
}

const deflate = (text: string): Promise<Uint8Array> =>
  pipeBytes(new CompressionStream('deflate-raw'), new TextEncoder().encode(text), 64 * 1024 * 1024);

async function inflate(bytes: Uint8Array): Promise<string> {
  const out = await pipeBytes(new DecompressionStream('deflate-raw'), bytes, MAX_SHARED_JSON_BYTES);
  return new TextDecoder('utf-8', { fatal: true }).decode(out);
}

/**
 * Build the share link for a project: the project without its feed values, deflated and base64url
 * encoded into the hash. `baseUrl` is the page address without a hash; the whole link is held to the
 * limit. A link that is too long is refused, never truncated.
 */
export async function makeShareLink(project: Project, baseUrl: string): Promise<ShareResult> {
  if (!hasCompression()) return { ok: false, error: NO_COMPRESSION };
  const withoutFeeds: Partial<Project> = { ...project };
  delete withoutFeeds.feeds;
  let payload: string;
  try {
    payload = toBase64Url(await deflate(JSON.stringify(withoutFeeds)));
  } catch {
    return { ok: false, error: NO_COMPRESSION };
  }
  const link = `${baseUrl.replace(/#.*$/, '')}#${SHARE_PREFIX}${payload}`;
  if (link.length > MAX_SHARE_LINK_LENGTH) {
    return {
      ok: false,
      length: link.length,
      error: `This project is too large for a share link (${link.length} characters; the limit is ${MAX_SHARE_LINK_LENGTH}, which chat apps and mail clients can carry). Use Save project to download a file and send that instead.`,
    };
  }
  return { ok: true, link };
}

/** Read the payload of a share link (the text after `#/p=`) with the same checks as a file. */
export async function decodeShare(payload: string): Promise<LoadResult> {
  const bad = (why: string): LoadResult => ({
    ok: false,
    error: `This shared link could not be read (${why}). Ask for a project file instead.`,
  });
  if (!hasCompression()) return bad('this browser cannot decompress it');
  if (payload === '') return bad('it is empty');
  let text: string;
  try {
    text = await inflate(fromBase64Url(payload));
  } catch (e) {
    return bad((e as Error).message === 'too large' ? 'it expands too far' : 'it is damaged');
  }
  return parseProject(text);
}
