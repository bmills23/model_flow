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
  /** Maximum contaminant level, ug/L, as printed (a "(G)" cell parsed to its number). */
  mcl?: number;
  /** The MCL cell carries the RSL "(G)" marker (see the user's guide). Absent otherwise. */
  mclGroup?: true;
  /** Set only when the MCL is not in ug/L (asbestos, fibers/L): such a value is never a mass concentration. */
  mclUnit?: string;
  /** Published soil-to-groundwater SSLs at DAF 1: comparison values only, never engine inputs. */
  publishedSsl?: { risk?: { value: number; key: string }; mcl?: number };
}

export interface ToxFile {
  edition: string;
  source: { reference: string; documents: number[]; retrieved: string };
  units: {
    sfo: string;
    iur: string;
    rfdo: string;
    rfci: string;
    csat: string;
    mcl: string;
    publishedSsl: string;
  };
  sourceKeys: Record<string, string>;
  toxicity: ToxEntry[];
}

/** The physical-property keys the risk screen reads, the dermal water inputs. */
export type RiskValueKey = 'kp' | 'tauEvent' | 'tStar' | 'b';

/** One chemical in the risk-screen subset: only what the exposure engine reads, values without references. */
export interface RiskChemicalEntry {
  id: string;
  values: Partial<Record<RiskValueKey, { value: number }>>;
  fa?: number;
  inEpd?: boolean;
  dermalForm?: DermalForm;
}

/** A subset of `ChemicalsFile` derived by the data build, small enough to load on demand on a phone. */
export interface RiskChemicalsFile {
  edition: string;
  source: ChemicalsFile['source'];
  units: Pick<ChemicalsFile['units'], RiskValueKey>;
  chemicals: RiskChemicalEntry[];
}

/** The values the cleanup screen reads: partition and solubility inputs. */
export type CleanupValueKey = 'koc' | 'kd' | 'hPrime' | 's' | 'mw' | 'logKow';

export interface CleanupChemicalEntry {
  id: string;
  /** Kd carries its RSL reference (provenance of the L/kg value); the others are plain values. */
  values: Partial<Record<CleanupValueKey, { value: number; ref?: string }>>;
}

/** A subset of `ChemicalsFile` derived by the data build for the cleanup screen. */
export interface CleanupChemicalsFile {
  edition: string;
  source: ChemicalsFile['source'];
  units: Pick<ChemicalsFile['units'], CleanupValueKey>;
  chemicals: CleanupChemicalEntry[];
}
