import type { Criterion } from '@model-flow/engine';
import type { CriteriaSetFile } from '@model-flow/data/criteria-types';
import {
  assembleDb,
  loadCriteriaDb,
  loadUsParts,
  type CoveredInfo,
  type CriteriaDb,
  type CriterionInfo,
  type DbParts,
} from './criteriaDb';
import {
  INTERNATIONAL_SETS,
  type CriteriaSetChoice,
  type InternationalSet,
} from './criteriaSetChoice';

/**
 * The international criteria sets (DECISIONS, "Wave V scope", rulings 3 to 5). Each set is a generated JSON
 * file imported on first use, so each is a chunk of its own: choosing a set loads that set, and the default
 * (the US sets) loads none of them.
 */
function loadSetFiles(id: InternationalSet): Promise<CriteriaSetFile[]> {
  switch (id) {
    case 'ccme':
      return import('@model-flow/data/generated/criteria-2026-10-23/ccme.json').then((m) => [
        m.default as unknown as CriteriaSetFile,
      ]);
    case 'eu':
      return import('@model-flow/data/generated/criteria-2026-10-23/eu.json').then((m) => [
        m.default as unknown as CriteriaSetFile,
      ]);
    case 'eu2026':
      return import('@model-flow/data/generated/criteria-2026-10-23/eu2026.json').then((m) => [
        m.default as unknown as CriteriaSetFile,
      ]);
    case 'uk':
      return import('@model-flow/data/generated/criteria-2026-10-23/uk.json').then((m) => [
        m.default as unknown as CriteriaSetFile,
      ]);
    case 'anzg':
      // two files, one per water type, so that no chunk of the bundle is over 500 kB
      return Promise.all([
        import('@model-flow/data/generated/criteria-2026-10-23/anzg-fresh.json'),
        import('@model-flow/data/generated/criteria-2026-10-23/anzg-salt.json'),
      ]).then((ms) => ms.map((m) => m.default as unknown as CriteriaSetFile));
    case 'macdonald2000':
      return import('@model-flow/data/generated/criteria-2026-10-23/macdonald2000.json').then(
        (m) => [m.default as unknown as CriteriaSetFile],
      );
  }
}

/** The criteria, info and names of one international set. */
export function setParts(file: CriteriaSetFile): DbParts {
  const criteria: Criterion[] = [];
  const info = new Map<string, CriterionInfo>();
  const names = new Map<string, string>();
  const covered = new Map<string, CoveredInfo>();
  for (const p of file.coveredBy ?? []) covered.set(p.chemicalId, { ...p, setLabel: file.label });
  for (const r of file.rows) {
    criteria.push({
      id: r.id,
      chemicalId: r.chemicalId,
      medium: r.medium,
      endpoint: r.endpoint,
      ...(r.value !== undefined ? { value: r.value } : {}),
      unit: r.unit,
      ...(r.siteSpecific === true ? { siteSpecific: true } : {}),
      waterType: r.waterType,
      source: 'database',
    });
    const condition = [
      r.note !== undefined ? file.notes[r.note] : undefined,
      r.casUnverified === true
        ? 'The CAS number is kept as the source prints it and fails the CAS check digit.'
        : undefined,
    ]
      .filter((t): t is string => t !== undefined && t !== '')
      .join(' ');
    const converted = r.printedValue !== undefined && Number(r.printedValue) !== r.value;
    info.set(r.id, {
      set: r.set,
      setLabel: file.label,
      basis: r.basisLabel,
      medium: r.medium,
      waterType: r.waterType,
      source: r.table,
      ...(condition !== '' ? { condition } : {}),
      ...(converted ? { printed: `${r.printedValue ?? ''} ${r.printedUnit}` } : {}),
      ...(r.year !== undefined ? { year: r.year } : {}),
      ...(r.reliability !== undefined ? { reliability: r.reliability } : {}),
    });
    if (!names.has(r.chemicalId)) names.set(r.chemicalId, r.name);
  }
  const printedDate =
    file.source.pageDate !== undefined ? `edition of ${file.source.pageDate}, ` : '';
  return {
    criteria,
    info,
    names,
    covered,
    sources: [
      {
        set: file.set,
        label: file.source.title,
        edition: `${printedDate}retrieved ${file.source.retrieved}`,
      },
    ],
    nrwqcEdition: '',
    sedimentEdition: '',
  };
}

/** Parts joined into one: criteria and info together, the first name of an id kept, a source listed once. */
function mergeParts(parts: DbParts[]): DbParts {
  const names = new Map<string, string>();
  for (const part of parts) {
    for (const [id, name] of part.names) if (!names.has(id)) names.set(id, name);
  }
  const covered = new Map<string, CoveredInfo>();
  for (const part of parts) {
    for (const [id, p] of part.covered ?? []) if (!covered.has(id)) covered.set(id, p);
  }
  const sources = new Map<string, DbParts['sources'][number]>();
  for (const x of parts.flatMap((part) => part.sources)) sources.set(`${x.set}|${x.label}`, x);
  return {
    criteria: parts.flatMap((x) => x.criteria),
    info: new Map(parts.flatMap((x) => [...x.info])),
    names,
    covered,
    sources: [...sources.values()],
    nrwqcEdition: parts.find((x) => x.nrwqcEdition !== '')?.nrwqcEdition ?? '',
    sedimentEdition: parts.find((x) => x.sedimentEdition !== '')?.sedimentEdition ?? '',
  };
}

const setPartsOf = (files: CriteriaSetFile[]): DbParts => mergeParts(files.map(setParts));

const cache = new Map<CriteriaSetChoice, Promise<CriteriaDb>>();

/**
 * The criteria database of a choice: the US sets (the default, shared with the cleanup screens), one
 * international set, or all of them side by side. A chemical is listed once, by its CAS number, however
 * many sets name it; the sets that print no CAS number are joined by name at build time (see DECISIONS).
 */
export function loadCriteriaDbFor(choice: CriteriaSetChoice): Promise<CriteriaDb> {
  if (choice === 'us') return loadCriteriaDb();
  let p = cache.get(choice);
  if (p === undefined) {
    p =
      choice === 'all'
        ? Promise.all([loadUsParts(), ...INTERNATIONAL_SETS.map(loadSetFiles)]).then(
            ([us, ...sets]) => assembleDb('all', mergeParts([us, ...sets.map(setPartsOf)])),
          )
        : loadSetFiles(choice).then((files) => assembleDb(choice, setPartsOf(files)));
    p.catch(() => cache.delete(choice));
    cache.set(choice, p);
  }
  return p;
}
