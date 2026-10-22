import { getScreen, setScreen } from '../project/store';
import { DEFAULT_FORM, type TransportForm } from './form';

/**
 * A transport form that computes: a new project asks for the dispersivity, so tests about something
 * else run on the RISC5 regression, chosen on purpose (its warning is expected in their results).
 */
export const REGRESSION_FORM: TransportForm = { ...DEFAULT_FORM, dispLaw: 'legacy' };

/** Puts the regression form on the groundwater screen of the project store, keeping its method. */
export function seedTransportRegression(): void {
  setScreen('transport', { ...getScreen('transport'), form: REGRESSION_FORM });
}
