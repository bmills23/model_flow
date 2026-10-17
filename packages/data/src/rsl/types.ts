/** A database value with the RSL reference column it came from (absent when the RSL gives none). */
export interface TaggedValue {
  value: number;
  ref?: string;
}

export type DermalForm = 'organic' | 'inorganic';

export type ChemicalValueKey =
  | 'mw'
  | 'hPrime'
  | 'hlc'
  | 'vp'
  | 'mp'
  | 'density'
  | 'dia'
  | 'diw'
  | 'kd'
  | 'koc'
  | 'logKow'
  | 's'
  | 'b'
  | 'tauEvent'
  | 'tStar'
  | 'kp';

export interface ChemicalEntry {
  id: string;
  cas?: string;
  name: string;
  /** The analyte name exactly as the RSL prints it (a leading `~` is kept here only). */
  rslName: string;
  values: Partial<Record<ChemicalValueKey, TaggedValue>>;
  /** Fraction absorbed in water (tap water table). Absent when blank. */
  fa?: number;
  /** In the RAGS E prediction domain ("In EPD?" in the tap water table). Absent when blank. */
  inEpd?: boolean;
  /**
   * How the RSL treats dermal contact with water: the RAGS Part E lag-time model (organic) or Kp times
   * the event time (inorganic). Absent when the tap water table publishes no dermal value for the
   * analyte, so the form is not known and a caller must not guess it.
   */
  dermalForm?: DermalForm;
}

export interface ChemicalsFile {
  edition: string;
  source: { reference: string; documents: number[]; retrieved: string };
  units: Record<ChemicalValueKey, string>;
  chemicals: ChemicalEntry[];
}

/** A toxicity value with the RSL one-letter source key (see `ToxFile.sourceKeys`). */
export interface ToxValue {
  value: number;
  source: string;
}

export type SpecialCase = 'trichloroethylene' | 'vinyl-chloride';

export interface ToxEntry {
  id: string;
  cas?: string;
  name: string;
  rslName: string;
  sfo?: ToxValue;
  iur?: ToxValue;
  rfdo?: ToxValue;
  rfci?: ToxValue;
  volatile: boolean;
  mutagen: boolean;
  giabs?: number;
  absd?: number;
  csat?: number;
  special?: SpecialCase;
}

export interface ToxFile {
  edition: string;
  source: { reference: string; documents: number[]; retrieved: string };
  units: { sfo: string; iur: string; rfdo: string; rfci: string; csat: string };
  sourceKeys: Record<string, string>;
  toxicity: ToxEntry[];
}
