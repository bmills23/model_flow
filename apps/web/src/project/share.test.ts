import { describe, expect, it } from 'vitest';
import { buildProject, defaultScreens } from './index';
import { MAX_SHARE_LINK_LENGTH, SHARE_PREFIX, decodeShare, makeShareLink } from './share';

async function payloadOf(text: string): Promise<string> {
  const cs = new CompressionStream('deflate-raw');
  const w = cs.writable.getWriter();
  void w.write(new TextEncoder().encode(text)).then(() => w.close());
  const bytes = new Uint8Array(await new Response(cs.readable).arrayBuffer());
  let bin = '';
  for (const b of bytes) bin += String.fromCharCode(b);
  return btoa(bin).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

const BASE = 'https://example.org/model_flow/';

function project(title?: string) {
  const p = buildProject({
    screens: defaultScreens(),
    createdWith: '0.0.0',
    now: new Date('2026-10-18T12:00:00Z'),
    ...(title !== undefined ? { title } : {}),
  });
  return p;
}

describe('share link', () => {
  it('round trips a project through the link payload', async () => {
    const p = project('Site A');
    const r = await makeShareLink(p, BASE);
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.link.startsWith(`${BASE}#${SHARE_PREFIX}`)).toBe(true);
    const payload = r.link.slice(`${BASE}#${SHARE_PREFIX}`.length);
    expect(payload).toMatch(/^[A-Za-z0-9_-]+$/);
    const back = await decodeShare(payload);
    expect(back.ok).toBe(true);
    if (!back.ok) return;
    expect(back.project.title).toBe('Site A');
    expect(back.project.screens).toEqual(p.screens);
  });

  it('leaves the feed values out of the link', async () => {
    const p = {
      ...project(),
      feeds: {
        well: {
          source: 'transport',
          inputsHash: 'abc',
          value: { method: 'modern', label: 'w', times: [0, 1], values: [0, 1] },
        },
      },
    };
    const r = await makeShareLink(p as never, BASE);
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    const back = await decodeShare(r.link.slice(`${BASE}#${SHARE_PREFIX}`.length));
    expect(back.ok && back.project.feeds).toBeFalsy();
  });

  it('is deterministic', async () => {
    const a = await makeShareLink(project('x'), BASE);
    const b = await makeShareLink(project('x'), BASE);
    expect(a).toEqual(b);
  });

  it('refuses a link longer than the limit and says why, with no truncated link', async () => {
    // incompressible title: a seeded pseudo random string
    let s = 12345;
    let title = '';
    for (let i = 0; i < 12000; i++) {
      s = (s * 1103515245 + 12345) & 0x7fffffff;
      title += String.fromCharCode(33 + (s % 90));
    }
    const r = await makeShareLink(project(title.replace(/["\\]/g, 'a')), BASE);
    expect(r.ok).toBe(false);
    if (r.ok) return;
    expect(r.length).toBeGreaterThan(MAX_SHARE_LINK_LENGTH);
    expect(r.error).toMatch(/8000/);
    expect(r.error).toMatch(/save/i);
    expect('link' in r).toBe(false);
  });

  it('counts the whole link, not just the payload, against the limit', async () => {
    const r = await makeShareLink(project('x'), BASE);
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.link.length).toBeLessThanOrEqual(MAX_SHARE_LINK_LENGTH);
    const long = 'https://example.org/' + 'a'.repeat(MAX_SHARE_LINK_LENGTH);
    const r2 = await makeShareLink(project('x'), long);
    expect(r2.ok).toBe(false);
  });

  it('rejects garbage, a non-project and an oversized expansion without half loading', async () => {
    const bad = await decodeShare('!!!not-base64!!!');
    expect(bad.ok).toBe(false);
    const junk = await decodeShare('AAAA');
    expect(junk.ok).toBe(false);
    const empty = await decodeShare('');
    expect(empty.ok).toBe(false);
    // a valid deflate stream of a non-project document
    const notProject = await decodeShare(await payloadOf(JSON.stringify({ hello: 1 })));
    expect(notProject.ok).toBe(false);
    // a bomb: highly compressible, expands past the cap
    const bomb = await decodeShare(await payloadOf('{"a":"' + 'x'.repeat(20_000_000) + '"}'));
    expect(bomb.ok).toBe(false);
    if (!bomb.ok) expect(bomb.error).toMatch(/expands too far/);
  });

  it('reports a browser without CompressionStream instead of throwing', async () => {
    const original = globalThis.CompressionStream;
    // @ts-expect-error simulate an old browser
    delete globalThis.CompressionStream;
    try {
      const r = await makeShareLink(project(), BASE);
      expect(r.ok).toBe(false);
      const d = await decodeShare('AAAA');
      expect(d.ok).toBe(false);
    } finally {
      globalThis.CompressionStream = original;
    }
  });
});
