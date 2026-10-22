import { describe, expect, it } from 'vitest';
import { projectNameOf, screenFeedProblem } from './feedChemical';

const nameOf = projectNameOf([
  { id: '71-43-2', name: 'Benzene' },
  { id: '108-88-3', name: 'Toluene' },
]);
const base = { feed: 'transport well result', screenChemical: '108-88-3', projectCount: 1, nameOf };

describe('screenFeedProblem', () => {
  it('takes a feed for the screen chemical', () => {
    expect(screenFeedProblem({ ...base, feedChemical: '108-88-3' })).toBeNull();
  });
  it('refuses a feed for another chemical, naming both', () => {
    expect(screenFeedProblem({ ...base, feedChemical: '71-43-2' })).toMatch(
      /for Benzene, not Toluene/,
    );
  });
  it('takes an untagged feed in a project of one chemical and refuses it in a project of two', () => {
    expect(screenFeedProblem({ ...base, feedChemical: undefined })).toBeNull();
    expect(screenFeedProblem({ ...base, feedChemical: undefined, projectCount: 2 })).toMatch(
      /does not record which chemical/,
    );
  });
  it('takes any feed when the screen chemical is blank', () => {
    expect(
      screenFeedProblem({ ...base, screenChemical: '', feedChemical: '71-43-2', projectCount: 2 }),
    ).toBeNull();
  });
});
