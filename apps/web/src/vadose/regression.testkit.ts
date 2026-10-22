import { getScreen, setScreen } from '../project/store';
import { R7_FORM } from './form';

/**
 * Puts the Table R-7 case, which runs on the RISC5 regression chosen on purpose, on the vadose
 * screen of the project store: a new project asks for the dispersivity, so tests about something
 * else start from this.
 */
export function seedVadoseRegression(): void {
  setScreen('vadose', { ...getScreen('vadose'), form: R7_FORM });
}
