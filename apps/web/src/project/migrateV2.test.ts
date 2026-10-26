import { readFileSync } from 'node:fs';
import { beforeEach, describe, expect, it } from 'vitest';
import { getBankFeedSlots } from '../transport/bankFeed';
import { getWellFeedSlots } from '../transport/wellFeed';
import { getVadoseFeedSlots } from '../vadose/feed';
import { getVaporRiskFeedSlots } from '../vapor/feeds';
import { CURRENT_VERSION, migrations } from './migrate';
import { parseProject, versionProblem } from './index';
import { decodeShare } from './share';
import { forgetMemory, getStaleFeeds, getStaleSlots, loadProject, newProject } from './store';

const FIXTURES = `${process.cwd()}/src/project/fixtures/`;
const read = (name: string): string => readFileSync(`${FIXTURES}${name}`, 'utf8');
const v1Text = read('project-v1.json');
const expectedV2 = JSON.parse(read('project-v2-expected.json')) as Record<string, unknown>;

describe('project file version 2: feeds per chemical', () => {
  beforeEach(() => {
    forgetMemory();
    newProject();
  });

  it('this build reads version 2 files through a step from version 1', () => {
    expect(CURRENT_VERSION).toBeGreaterThanOrEqual(2);
    expect(typeof migrations[1]).toBe('function');
  });

  it('a saved version 1 file loads to the expected version 2 document, then on to the current one', () => {
    const r = parseProject(v1Text);
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    const { guided: _guided, ...rest } = r.project;
    void _guided;
    expect(rest).toEqual({ ...expectedV2, version: CURRENT_VERSION });
    // the untagged vadose run was sent while the vadose screen was typed by hand
    expect(r.droppedFeeds).toEqual(['vadose']);
  });

  it('a version 1 share link payload loads to the same document without its feeds', async () => {
    const r = await decodeShare(read('share-v1.txt').trim());
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    const { feeds: _f, ...withoutFeeds } = expectedV2;
    void _f;
    const { guided: _guided, ...rest } = r.project;
    void _guided;
    expect(rest).toEqual({ ...withoutFeeds, version: CURRENT_VERSION });
    expect(r.droppedFeeds ?? []).toEqual([]);
  });

  it('a feed that was fresh at save is not stale after open, and each slot is restored', () => {
    const r = parseProject(v1Text);
    if (!r.ok) throw new Error(r.error);
    loadProject(r.project, r.droppedFeeds);
    expect(getStaleFeeds()).toEqual([]);
    expect(getStaleSlots()).toEqual([]);
    expect([...getWellFeedSlots().keys()]).toEqual(['71-43-2']);
    expect(getBankFeedSlots().get('71-43-2')?.chemicalId).toBe('71-43-2');
    expect(getVaporRiskFeedSlots().get('108-88-3')?.label).toBe('Toluene, vapor');
    expect(getVadoseFeedSlots().size).toBe(0);
  });

  it('a version 2 file opened by a build that reads up to version 1 is refused as newer', () => {
    expect(versionProblem(2, 1)).toMatch(
      /saved by a newer version of the app \(file format 2; this app reads up to 1\)/,
    );
    expect(versionProblem(2, 2)).toBeNull();
    const doc = JSON.parse(v1Text) as Record<string, unknown>;
    const r = parseProject({ ...doc, version: CURRENT_VERSION + 1 });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error).toMatch(/newer version of the app/);
  });

  it('a version 2 slot whose key is not its value chemical is dropped and reported', () => {
    const doc = structuredClone(expectedV2) as { feeds: Record<string, Record<string, unknown>> };
    const well = doc.feeds['well']!;
    doc.feeds['well'] = { '108-88-3': well['71-43-2'] };
    const r = parseProject(doc);
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.droppedFeeds).toEqual(['well']);
    expect(r.project.feeds?.well).toBeUndefined();
  });
});
