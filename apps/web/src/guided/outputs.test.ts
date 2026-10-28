import { describe, expect, it } from 'vitest';
import { readGuidedOutputs } from './outputs';

const BENZENE = '71-43-2';

describe('readGuidedOutputs keeps the parsed slot', () => {
  it('hands back the value as its feed shape reads it, without a malformed run-input record', () => {
    const raw = {
      vaporRisk: {
        [BENZENE]: {
          inputsHash: 'abc',
          value: { chemicalId: BENZENE, label: 'Indoor air', runInputs: 'not rows' },
        },
      },
    };
    const read = readGuidedOutputs(raw);
    expect(read.dropped).toEqual([]);
    expect(read.kept['vaporRisk']?.[BENZENE]).toEqual({
      inputsHash: 'abc',
      value: { chemicalId: BENZENE, label: 'Indoor air' },
    });
  });

  it('still drops a slot of another chemical or an unknown feed on its own', () => {
    const read = readGuidedOutputs({
      vaporRisk: {
        [BENZENE]: { inputsHash: 'a', value: { chemicalId: '1634-04-4', label: 'x' } },
      },
      nothing: {},
    });
    expect(read.kept).toEqual({});
    expect(read.dropped.sort()).toEqual([
      'guided.outputs.nothing',
      `guided.outputs.vaporRisk.${BENZENE}`,
    ]);
  });
});
