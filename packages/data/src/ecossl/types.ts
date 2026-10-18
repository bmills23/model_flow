export type Group = 'plants' | 'invertebrates' | 'avian' | 'mammalian';
export type WildlifeGroup = 'avian' | 'mammalian';
/** value: a number; NA: the document prints NA; NC: not enough data (chromium); procedure: no number, an alternative screening procedure. */
export type ValueStatus = 'value' | 'NA' | 'NC' | 'procedure';
export type UptakeForm = 'ratio' | 'ln' | 'affine' | 'NA';

export interface SummaryValue {
  substance: string;
  document: string;
  group: Group;
  status: ValueStatus;
  /** Eco-SSL, mg/kg dry weight in soil; null unless status is value. */
  value: number | null;
  table: string;
  /** PDF page (1-based) of the cited document. */
  page: number;
  /** Literal text that must appear on the page when there is no number. */
  evidence: string;
  /** The value as typed from the document. */
  raw: { value: string };
}

export interface WildlifeRow {
  substance: string;
  document: string;
  group: WildlifeGroup;
  /** dove, woodcock, hawk (avian); vole, shrew, weasel (mammalian). */
  surrogate: string;
  /** Toxicity reference value, mg/kg bw/d. */
  trv: number;
  /** Food ingestion rate, kg dw/kg bw/d. */
  fir: number;
  /** Soil ingestion as a proportion of the diet. */
  ps: number;
  /**
   * Concentration in the food item Bi (mg/kg dw), with C = cdiet * Soil (or Soil when cdiet is null):
   * ratio: Bi = a C; ln: ln(Bi) = a ln(Soil) + b; affine: Bi = a C + b; NA: not derived.
   */
  form: UptakeForm;
  a: number | null;
  b: number | null;
  cdiet: number | null;
  /** Printed surrogate Eco-SSL, mg/kg dw, 2 significant figures; null where the document prints NA. */
  ecoSsl: number | null;
  table: string;
  page: number;
  /** A printed inconsistency inside the document, when the row does not reproduce; the row is kept as printed. */
  flag: string | null;
  raw: {
    trv: string;
    fir: string;
    ps: string;
    a: string;
    b: string;
    cdiet: string;
    ecoSsl: string;
  };
}
