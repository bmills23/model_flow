import {
  sourceLevelsOverCoefficient,
  type DirectResult,
  type SourceLevel,
} from '@model-flow/engine';

type CoefficientMedium = Parameters<typeof sourceLevelsOverCoefficient>[1];

/**
 * The source level of one chemical over its own coefficient. The engine wrapper wants a coefficient for
 * every chemical of the medium, but a source screen's coefficient belongs to the one chemical it was run
 * for, so the medium is narrowed to that chemical first and the other chemicals of the cleanup run are
 * never asked for one. Undefined where the medium holds no level for the chemical.
 */
export function sourceLevelOfChemical(
  direct: DirectResult,
  medium: CoefficientMedium,
  chemical: string,
  coefficient: number,
): SourceLevel | undefined {
  const m = direct.media.find((x) => x.medium === medium);
  if (!m || !m.levels.some((l) => l.chemical === chemical)) return undefined;
  const narrowed: DirectResult = {
    ...direct,
    media: direct.media.map((x) =>
      x.medium === medium ? { ...x, levels: x.levels.filter((l) => l.chemical === chemical) } : x,
    ),
  };
  return sourceLevelsOverCoefficient(narrowed, medium, { [chemical]: coefficient })[0];
}
