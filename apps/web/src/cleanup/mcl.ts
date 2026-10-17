/** The database MCL as a mass concentration in kg/m3, or undefined when there is none to use. */
export interface UsableMcl {
  /** kg/m3 */
  value?: number;
  group: boolean;
  /** Why the printed value cannot be a mass concentration (a unit other than ug/L). */
  unusable?: string;
}

export function usableMcl(tox: { mcl?: number; mclGroup?: true; mclUnit?: string }): UsableMcl {
  if (tox.mclUnit !== undefined) {
    return {
      group: tox.mclGroup === true,
      unusable: `its MCL is ${tox.mcl} ${tox.mclUnit}, not a mass per volume, so it cannot be a concentration target`,
    };
  }
  return {
    ...(tox.mcl !== undefined ? { value: tox.mcl * 1e-6 } : {}),
    group: tox.mclGroup === true,
  };
}
