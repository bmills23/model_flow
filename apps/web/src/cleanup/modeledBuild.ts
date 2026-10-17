import { usableMcl } from './mcl';
import { PATHWAYS, type DirectReceptor, type PathwayId } from '@model-flow/engine';
import { PATHWAY_LABELS } from '../risk/chartData';
import type { ChemicalDb } from '../risk/chemicalDb';
import type { SaturatedFeed } from '../saturated/feed';
import type { TransportFeed } from '../transport/chainFeed';
import type { VadoseFeed } from '../vadose/feed';
import { buildCleanup } from './build';
import type { CleanupForm } from './form';
import type { ModeledRequest, ModeledSource, ModeledTarget } from './modeledTypes';

export const NEEDS_TRANSPORT =
  'Open the groundwater transport screen and press "Use for cleanup levels": the aquifer, source footprint and well it describes carry the source to the receptor.';
export const NEEDS_VADOSE =
  'Open the vadose zone screen and press "Use as groundwater source": the soil source and the column it describes are used here.';
export const NEEDS_SATURATED =
  'Open the saturated soil source screen and press "Use as groundwater source": the source it describes is used here.';
export const ONE_CHEMICAL =
  'A modeled source describes one chemical: keep a single chemical in the list.';

export interface Feeds {
  transport: TransportFeed | null;
  vadose: VadoseFeed | null;
  saturated: SaturatedFeed | null;
}

export type ModeledBuildResult =
  { ok: true; request: ModeledRequest; notes: string[] } | { ok: false; errors: string[] };

const YEAR_S = 365.25 * 86400;

function positive(
  text: string,
  label: string,
  errors: string[],
  allowZero = false,
): number | undefined {
  if (text.trim() === '') return undefined;
  const v = Number(text.trim());
  if (!Number.isFinite(v) || v < 0 || (v === 0 && !allowZero)) {
    errors.push(`${label}: enter a number ${allowZero ? 'that is not negative' : 'above zero'}`);
    return undefined;
  }
  return v;
}

/** Turns the form and the screens' feeds into one modeled-chain request, or says what is missing. */
export function buildModeled(form: CleanupForm, db: ChemicalDb, feeds: Feeds): ModeledBuildResult {
  const errors: string[] = [];
  if (form.source === 'direct') return { ok: false, errors: ['No modeled source is selected.'] };
  if (form.chemicals.length > 1) errors.push(ONE_CHEMICAL);
  if (feeds.transport === null) errors.push(NEEDS_TRANSPORT);
  if (form.source === 'vadose' && feeds.vadose === null) errors.push(NEEDS_VADOSE);
  if (form.source === 'saturated' && feeds.saturated === null) errors.push(NEEDS_SATURATED);

  const base = buildCleanup({ ...form, allocation: 'individual' }, db);
  if (!base.ok) errors.push(...base.errors);

  const wellTarget = positive(form.wellTarget, 'Well target (mg/L)', errors);
  const windowYr = positive(form.windowYr, 'Averaging time (years)', errors, true);
  const solubility = positive(form.solubility, 'Solubility (mg/L)', errors);
  const startMg = positive(form.startConc, 'Starting concentration', errors);
  if (errors.length > 0 || !base.ok || feeds.transport === null) return { ok: false, errors };

  const row = form.chemicals[0]!;
  const rec = db.byId.get(row.id)!;
  const { zOf: _zOf, ...transport } = feeds.transport.scenario;
  void _zOf;

  let source: ModeledSource;
  const notes = [...base.notes];
  if (form.source === 'dissolved') {
    source = { kind: 'dissolved' };
  } else if (form.source === 'vadose') {
    source = { kind: 'vadose', vadose: feeds.vadose!.scenario };
    notes.push(
      `Soil source from the vadose zone screen (${feeds.vadose!.label}): its column and the chemical properties typed there carry the soil to the water table; only the toxicity comes from ${rec.name}.`,
    );
  } else {
    source = { kind: 'saturated', input: feeds.saturated!.input };
    notes.push(
      `Soil source from the saturated source screen (${feeds.saturated!.label}): its geometry and the chemical properties typed there set the release; only the toxicity comes from ${rec.name}.`,
    );
  }
  notes.push(
    `Aquifer, source box and well from the groundwater screen (${feeds.transport.label}).`,
  );

  const target: ModeledTarget =
    form.targetKind === 'risk'
      ? { kind: 'risk' }
      : wellTarget === undefined
        ? { kind: 'mcl' }
        : { kind: 'user', value: wellTarget * 1e-3 };

  const chemical: ModeledRequest['chemical'] = { id: row.id, name: rec.name };
  if (rec.tox.csat !== undefined) chemical.csat = rec.tox.csat * 1e-6;
  if (solubility !== undefined && form.source === 'dissolved')
    chemical.solubility = solubility * 1e-3;
  const mcl = usableMcl(rec.tox);
  if (mcl.value !== undefined) chemical.mcl = mcl.value;
  if (mcl.value !== undefined && mcl.group) chemical.mclGroup = true;
  if (mcl.unusable !== undefined && form.targetKind === 'well' && wellTarget === undefined) {
    notes.push(`${rec.name}: ${mcl.unusable}; enter a concentration at the well.`);
  }

  // A chain supplies the well-water pathways, and the soil pathways when the source is soil. A pathway
  // on a medium the chain does not describe (air, surface water, soil under a groundwater source) has
  // no concentration, so it is left out and said so.
  const suppliedBy = (p: PathwayId): boolean =>
    PATHWAYS[p].medium === 'groundwater' ||
    (PATHWAYS[p].medium === 'soil' && form.source !== 'dissolved');
  const skipped = new Set<PathwayId>();
  const usable = <R>(rs: DirectReceptor<R>[]): DirectReceptor<R>[] =>
    rs.map((r) => {
      for (const p of r.pathways) if (!suppliedBy(p)) skipped.add(p);
      return { ...r, pathways: r.pathways.filter(suppliedBy) };
    });
  const legacyReceptors = usable([...base.legacy.receptors]);
  const modernReceptors = usable([...base.modern.receptors]);
  if (legacyReceptors.some((r) => r.pathways.length === 0)) {
    return {
      ok: false,
      errors: [
        'Switch on at least one pathway the source reaches: drinking water or bathing' +
          (form.source === 'dissolved' ? '.' : ', or a soil pathway.'),
      ],
    };
  }
  if (skipped.size > 0) {
    notes.push(
      `Pathways left out because the source does not give them a concentration: ${[...skipped]
        .map((p) => PATHWAY_LABELS[p])
        .join(', ')}.`,
    );
  }

  const request: ModeledRequest = {
    transport: { ...transport, fed: undefined },
    source,
    chemical,
    legacy: { receptors: legacyReceptors, chemical: base.legacy.chemicals[0]!.chemical },
    modern: { receptors: modernReceptors, chemical: base.modern.chemicals[0]!.chemical },
    targets: base.legacy.targets ?? {},
    target,
    windowSeconds: (windowYr ?? 0) * YEAR_S,
    additive: base.legacy.additive ?? false,
    secantParity: form.secantParity,
    tphHeld: form.tphHeld,
  };
  if (startMg !== undefined) request.start = startMg * (form.source === 'dissolved' ? 1e-3 : 1e-6);
  return { ok: true, request, notes };
}
