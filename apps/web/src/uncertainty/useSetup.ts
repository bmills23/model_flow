import { useCallback, useEffect, useState } from 'react';
import { getScreen, setScreen } from '../project/store';
import { defaultSetup, type UncertaintySetup } from './project';

/**
 * The panel's setup held in the project. With a key the setup starts from the project and is written
 * back on every change; without one (tests, other uses) it is plain local state.
 */
export function useSetup(
  key: 'risk' | 'cleanup' | 'modeled' | undefined,
): [UncertaintySetup, (patch: Partial<UncertaintySetup>) => void] {
  const [setup, setSetup] = useState<UncertaintySetup>(() =>
    key === undefined ? defaultSetup() : getScreen('uncertainty')[key],
  );
  useEffect(() => {
    if (key === undefined) return;
    setScreen('uncertainty', { ...getScreen('uncertainty'), [key]: setup });
  }, [key, setup]);
  const patch = useCallback(
    (p: Partial<UncertaintySetup>) => setSetup((s) => ({ ...s, ...p })),
    [],
  );
  return [setup, patch];
}
