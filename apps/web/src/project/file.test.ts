import { describe, expect, it } from 'vitest';
import { projectFileName, readProjectFile, serializeProject } from './file';
import { buildProject, defaultScreens } from './index';

const p = buildProject({
  screens: defaultScreens(),
  createdWith: '0.0.0',
  title: 'Site A',
  now: new Date('2026-10-18T12:00:00Z'),
});

describe('project file', () => {
  it('names the file from the title and the date', () => {
    expect(projectFileName('Site A', new Date('2026-10-18T12:00:00Z'))).toBe(
      'Site-A-2026-10-18.json',
    );
    expect(projectFileName(undefined, new Date('2026-10-18T12:00:00Z'))).toBe(
      'model_flow-project-2026-10-18.json',
    );
    expect(projectFileName('  ', new Date('2026-10-18T12:00:00Z'))).toBe(
      'model_flow-project-2026-10-18.json',
    );
  });

  it('strips path characters and bounds the name', () => {
    const n = projectFileName(
      '../a/b\\c:d*?"<>|' + 'z'.repeat(200),
      new Date('2026-10-18T12:00:00Z'),
    );
    expect(n).not.toMatch(/[\\/:*?"<>|]/);
    expect(n.startsWith('.')).toBe(false);
    expect(n.length).toBeLessThanOrEqual(80);
    expect(n.endsWith('-2026-10-18.json')).toBe(true);
  });

  it('serializes to JSON that reads back', async () => {
    const file = new File([serializeProject(p)], 'x.json', { type: 'application/json' });
    const r = await readProjectFile(file);
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.project.title).toBe('Site A');
  });

  it('refuses a non-project file and an oversized file', async () => {
    const bad = await readProjectFile(new File(['{"a":1}'], 'x.json'));
    expect(bad.ok).toBe(false);
    const huge = new File([new Uint8Array(30 * 1024 * 1024)], 'x.json');
    const r = await readProjectFile(huge);
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error).toMatch(/too large/i);
  });
});
