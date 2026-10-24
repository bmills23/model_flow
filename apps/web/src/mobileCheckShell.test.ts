// @vitest-environment node
import { describe, expect, it } from 'vitest';
import {
  HOME_LINKS,
  MIN_TEXT,
  PROSE_TEXT,
  shellProblems,
} from '../../../scripts/shell-verdict.mjs';

const good = {
  navMain: 1,
  mains: 1,
  mainH1: 1,
  links: 0,
  controls: 12,
  tables: 0,
  charts: 0,
  textLen: 900,
};

describe('mobile check shell rule', () => {
  it('passes a mounted route with content', () => {
    expect(shellProblems(good)).toEqual([]);
    expect(shellProblems({ ...good, controls: 0, tables: 1 })).toEqual([]);
    expect(shellProblems({ ...good, controls: 0, charts: 2 })).toEqual([]);
  });
  it('passes a prose page or a page of links, not a thin one', () => {
    const bare = { ...good, controls: 0, textLen: 900 };
    expect(shellProblems({ ...bare, textLen: PROSE_TEXT })).toEqual([]);
    expect(shellProblems({ ...bare, links: HOME_LINKS })).toEqual([]);
    expect(shellProblems({ ...bare, links: HOME_LINKS - 1 })).toHaveLength(1);
  });
  it('fails the blank page of a build served under the wrong base path', () => {
    const blank = {
      navMain: 0,
      mains: 0,
      mainH1: 0,
      links: 0,
      controls: 0,
      tables: 0,
      charts: 0,
      textLen: 0,
    };
    expect(shellProblems(blank)).toHaveLength(5);
  });
  it('fails each missing part on its own', () => {
    expect(shellProblems({ ...good, navMain: 0 })).toHaveLength(1);
    expect(shellProblems({ ...good, mains: 0 })).toHaveLength(1);
    expect(shellProblems({ ...good, mains: 2 })).toHaveLength(1);
    expect(shellProblems({ ...good, mainH1: 0 })).toHaveLength(1);
    expect(shellProblems({ ...good, controls: 0 })).toHaveLength(1);
    expect(shellProblems({ ...good, textLen: MIN_TEXT - 1 })).toHaveLength(1);
  });
});
