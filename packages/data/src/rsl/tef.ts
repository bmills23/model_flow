import type { ToxEntry } from './types.js';

/**
 * Toxicity equivalency factors the User's Guide prints (section 2.3, table of dioxin-like toxicity equivalency
 * factors, WHO 2005; read 2026-10-23) for the numbered PCBs the RSL tables key `W` (TEF applied). The guide says that
 * for these PCBs "the TEF has been applied to the toxicity value": the slope factor and unit risk are the 2,3,7,8-TCDD
 * values times the TEF, the reference dose and concentration the 2,3,7,8-TCDD values divided by it.
 */
export const PCB_TEFS: Readonly<Record<string, number>> = {
  '32598-13-3': 0.0001, // PCB 77
  '70362-50-4': 0.0003, // PCB 81
  '57465-28-8': 0.1, // PCB 126
  '32774-16-6': 0.03, // PCB 169
  '32598-14-4': 0.00003, // PCB 105
  '31508-00-6': 0.00003, // PCB 118
  '74472-37-0': 0.00003, // PCB 114
  '65510-44-3': 0.00003, // PCB 123
  '38380-08-4': 0.00003, // PCB 156
  '69782-90-7': 0.00003, // PCB 157
  '52663-72-6': 0.00003, // PCB 167
  '39635-31-9': 0.00003, // PCB 189
};

const TCDD = '1746-01-6';
const threeFigures = (x: number): number => Number(x.toPrecision(3));

/**
 * The tables print each TEF-applied value to three significant figures, which rounds a repeating decimal (the TCDD
 * RfDo 7E-10 over a TEF of 3E-5 is 2.3333E-5, printed 2.33E-5). The resident noncancer soil inhalation level of
 * PCB 105 prints 840 mg/kg and computes 833.3 from the rounded RfCi 1.33E-3 but 835.4 from 4E-8 / 3E-5. This replaces
 * the printed reference dose and concentration of each such PCB by the quotient (to 12 figures, which drops the float noise of the division), after checking that it rounds to the
 * printed value; the slope factor and unit risk are exact products and are checked, not replaced.
 */
export const applyPcbTefs = (entries: ToxEntry[]): ToxEntry[] => {
  const tcdd = entries.find((e) => e.id === TCDD);
  if (tcdd?.sfo === undefined || tcdd.iur === undefined)
    throw new Error('TEF: no TCDD reference values');
  if (tcdd.rfdo === undefined || tcdd.rfci === undefined)
    throw new Error('TEF: no TCDD reference values');
  const ref = {
    sfo: tcdd.sfo.value,
    iur: tcdd.iur.value,
    rfdo: tcdd.rfdo.value,
    rfci: tcdd.rfci.value,
  };
  return entries.map((e) => {
    const tef = PCB_TEFS[e.id];
    if (tef === undefined) {
      for (const k of ['sfo', 'iur', 'rfdo', 'rfci'] as const) {
        if (e[k]?.source === 'W')
          throw new Error(`${e.rslName}: ${k} is TEF-applied but has no TEF`);
      }
      return e;
    }
    const out: ToxEntry = { ...e };
    for (const k of ['sfo', 'iur', 'rfdo', 'rfci'] as const) {
      const printed = e[k];
      if (printed === undefined || printed.source !== 'W') {
        throw new Error(`${e.rslName}: ${k} is not TEF-applied as expected`);
      }
      const derived = k === 'sfo' || k === 'iur' ? ref[k] * tef : ref[k] / tef;
      if (threeFigures(derived) !== printed.value) {
        throw new Error(
          `${e.rslName}: ${k} printed ${printed.value}, TCDD with TEF ${tef} gives ${derived}`,
        );
      }
      // the slope factor and unit risk are exact products at the printed figures; keep them as printed
      if (k === 'rfdo' || k === 'rfci')
        out[k] = { value: Number(derived.toPrecision(12)), source: printed.source };
    }
    return out;
  });
};
