import { beforeAll, describe, expect, it } from 'vitest';
import validation from '@model-flow/data/generated/validation/validation.json';
import { solveAll } from '../cleanup/modeledSolve';
import type { ModeledSolved } from '../cleanup/ModeledCleanup';
import { loadCleanupProps, type CleanupProps } from '../cleanup/ssg';
import { buildProject, defaultScreens } from '../project';
import { loadChemicalDb, type ChemicalDb } from '../risk/chemicalDb';
import { loadVaporChemicals, type VaporChemicalRow } from '../vapor/chemicals';
import type { ChemicalData } from '../guided/derive';
import { keptLevelsFrom, guidedSolvePlan, requestsToSolve } from '../guided/solve';
import type { GuidedState } from '../guided/state';
import { guidedWith, setValue } from '../guided/forms.testkit';
import type { BasisDefault } from './basis';
import {
  buildGuidedReport,
  guidedReportData,
  guidedRunBasis,
  guidedSectionKeys,
  guidedSummary,
  hasGuidedOutputs,
  type GuidedReportData,
} from './guidedSource';
import { computeResults, tableText, type ProjectResults } from './results';
import {
  BENZENE,
  MTBE,
  afterRun,
  chemicalData,
  guidedProject,
  wellSite,
} from './guidedReport.testkit';

let db: ChemicalDb;
let rows: VaporChemicalRow[] = [];
let props: CleanupProps;
let chems: ChemicalData[] = [];

const dataOf = (g: GuidedState): GuidedReportData =>
  guidedReportData(guidedProject(g), { db, fateRows: rows, cleanupProps: props });

async function resultsOf(g: GuidedState): Promise<ProjectResults> {
  return computeResults(guidedProject(g), {}, 'guided', dataOf(g));
}

const blockText = (r: ProjectResults): string =>
  Object.values(r)
    .flatMap((sec) =>
      (sec?.chemicals ?? []).flatMap((b) => [
        ...b.sent,
        ...b.notes,
        ...b.inputs.map((i) => i.label),
        ...b.tables.map((t) => t.label),
      ]),
    )
    .join(' | ');

let risk: GuidedState;
let riskResults: ProjectResults;

beforeAll(async () => {
  db = await loadChemicalDb();
  rows = await loadVaporChemicals();
  props = await loadCleanupProps();
  chems = chemicalData(rows);
  risk = afterRun(wellSite(), chems);
  riskResults = await resultsOf(risk);
}, 120000);

describe('a guided project for the report', () => {
  it('holds guided outputs once step 3d has run, and none before', () => {
    expect(hasGuidedOutputs(guidedProject(risk))).toBe(true);
    expect(hasGuidedOutputs(guidedProject(wellSite()))).toBe(false);
    expect(
      hasGuidedOutputs(
        buildProject({ screens: defaultScreens(), createdWith: '0.0.1', now: new Date(0) }),
      ),
    ).toBe(false);
  });

  it('reports the models of the chain in run order, then exposure and risk or cleanup', () => {
    expect(guidedSectionKeys(risk)).toEqual(['transport', 'household', 'risk']);
    const cleanup = { ...risk, targets: { ...risk.targets, mode: 'cleanup' as const } };
    expect(guidedSectionKeys(cleanup)).toEqual(['transport', 'household', 'cleanup']);
    const report = buildGuidedReport(guidedProject(risk), dataOf(risk));
    expect(report.sections.map((s) => s.key)).toEqual(['transport', 'household', 'risk']);
    expect(report.sections[0]!.methodIds).toContain('groundwater.wexler1992');
    expect(report.statement.methods.length).toBeGreaterThan(0);
  });

  it('labels the step 3a values of a model section in plain words with their units', () => {
    const report = buildGuidedReport(guidedProject(risk), dataOf(risk));
    const transport = report.sections.find((s) => s.key === 'transport')!;
    const labels = transport.inputs.map((r) => r.label);
    expect(labels.some((l) => /longitudinal dispersivity/i.test(l) && /\(m\)/.test(l))).toBe(true);
    expect(transport.inputs.find((r) => /longitudinal dispersivity/i.test(r.label))!.value).toBe(
      '10',
    );
    for (const l of labels) expect(l).not.toMatch(/[a-z][A-Z]/);
  });
});

describe('the guided report of a fate model', () => {
  it('prints one block per chemical, with the inputs its run used and its own charts', () => {
    const sec = riskResults.transport!;
    expect(sec.chemicals!.map((b) => b.name)).toEqual(['Benzene', 'MTBE']);
    for (const b of sec.chemicals!) {
      expect(b.inputs.length).toBeGreaterThan(3);
      expect(b.tables.length).toBeGreaterThan(0);
      expect((b.charts ?? []).map((c) => c.kind)).toEqual(['plume', 'breakthrough']);
    }
    const names = sec.chemicals!.flatMap((b) => b.tables.map((t) => t.name));
    expect(new Set(names).size).toBe(names.length);
    expect(sec.current).toBeUndefined();
    expect(sec.notes.join(' ')).not.toMatch(/No result yet/);
  });

  it('uses the words of the steps, never of the model screens', () => {
    expect(blockText(riskResults)).not.toMatch(/\bscreens?\b/i);
    expect(blockText(riskResults)).not.toMatch(/\bsent\b/i);
  });

  it('prints every row of a result table', () => {
    const b = riskResults.transport!.chemicals![1]!;
    const well = risk.outputs['well']![MTBE]!.value as { times: number[] };
    const series = b.tables.find((t) => t.name.startsWith('transport-well-series'))!;
    expect(tableText(series).rows.length).toBe(well.times.length);
  });

  it('rests each section on the method chosen in step 3d', async () => {
    expect(riskResults.transport!.methodBasis!.statement).toMatch(
      /rest on the modern method, the method chosen for the Run in step 3d/,
    );
    expect(riskResults.risk!.methodBasis!.statement).toMatch(/modern method.*step 3d/);
    const legacy = afterRun(
      wellSite((x) => {
        x.run.basis = 'legacy';
        x.site.paths.well = true;
      }),
      chems,
    );
    const r = await resultsOf(legacy);
    expect(r.transport!.methodBasis!.basis).toBe('legacy method');
    expect(r.risk!.methodBasis!.basis).toBe('legacy method');
  }, 120000);

  it('says a result is out of date when an input changed after the Run', async () => {
    const changed = structuredClone(risk);
    setValue(changed, MTBE, 'groundwater', '5', 'mg/L');
    const r = await resultsOf(changed);
    const [benzene, mtbe] = r.transport!.chemicals!;
    expect(mtbe!.notes.join(' ')).toMatch(/out of date/i);
    expect(benzene!.notes.join(' ')).not.toMatch(/out of date/i);
  }, 120000);

  it('says why a chemical has no result, as not quantified with the reason', async () => {
    const blocked = structuredClone(risk);
    delete blocked.outputs['well']![BENZENE];
    delete blocked.outputs['household']![BENZENE];
    blocked.runNotes[BENZENE] = {
      ...blocked.runNotes[BENZENE]!,
      problems: [{ model: 'transport', message: 'Benzene could not run: a test reason.' }],
    };
    const r = await resultsOf(blocked);
    const benzene = r.transport!.chemicals!.find((b) => b.chemicalId === BENZENE)!;
    expect(benzene.notes.join(' ')).toMatch(
      /Not quantified: Benzene could not run: a test reason\./,
    );
    expect(benzene.tables).toEqual([]);
  }, 120000);
});

describe('the guided exposure and risk section', () => {
  it('runs on the derived forms over the Run outputs, naming every chemical', () => {
    const text = JSON.stringify(riskResults.risk!.tables.map(tableText));
    expect(text).toMatch(/Benzene/);
    expect(text).toMatch(/MTBE/);
  });
});

describe('the guided exposure and risk section with a chemical the Run gave no well water', () => {
  it('computes the other chemical, names the gap with the Run reason, and marks the total partial', async () => {
    const gap = structuredClone(risk);
    delete gap.outputs['well']![MTBE];
    gap.runNotes[MTBE] = {
      ...gap.runNotes[MTBE]!,
      problems: [{ model: 'transport', message: 'MTBE could not run: a test reason.' }],
      feeds: { ...gap.runNotes[MTBE]!.feeds, well: 'h' },
    };
    const sec = (await resultsOf(gap)).risk!;
    expect(sec.notes.join(' ')).not.toMatch(/Not computed/);
    expect(sec.notes.join(' ')).toMatch(/MTBE: well water \(drinking and bathing\) is not quantified/);
    expect(sec.notes.join(' ')).toMatch(/MTBE could not run: a test reason\./);
    const table = sec.tables.map(tableText).find((t) => t.name === 'risk-results')!;
    expect(table.rows.length).toBeGreaterThan(0);
    const note = table.rows.map((r) => r[r.length - 1]).join(' | ');
    expect(note).toMatch(/partial total, omits well water \(drinking and bathing\) for MTBE/);
    expect(JSON.stringify(sec.tables.map(tableText))).toMatch(/Benzene/);
  });
  it('adds no gap wording when the Run gave every chemical a result', () => {
    const note = riskResults
      .risk!.tables.map(tableText)
      .find((t) => t.name === 'risk-results')!
      .rows.map((r) => r[r.length - 1])
      .join(' ');
    expect(note).not.toMatch(/ for (Benzene|MTBE)/);
    expect(riskResults.risk!.notes.join(' ')).not.toMatch(/is not quantified/);
  });
});

describe('the guided summary', () => {
  it("prints the Run's notes, with each non-detect substitution", () => {
    const s = guidedSummary(dataOf(risk));
    const benzene = s.runNotes.find((n) => n.chemical === 'Benzene')!;
    expect(benzene.lines.join(' ')).toMatch(
      /below the reporting limit of 0.5 mg\/L.*half the limit/,
    );
    expect(s.settings.map((x) => x.label)).toContain('Simulation time');
    expect(s.paths.length).toBeGreaterThan(0);
  });
});

describe('the guided run basis', () => {
  it('lists the step 3a values and the step 3b concentrations as entries without a source', () => {
    const project = guidedProject(risk);
    const data = dataOf(risk);
    const report = buildGuidedReport(project, data);
    const basis = guidedRunBasis({
      report,
      results: riskResults,
      project,
      data,
      fateRows: rows,
      cleanupProps: props,
      defaults: validation.unverified.defaults as BasisDefault[],
    });
    const t = basis.sections.transport!;
    expect(
      t.some(
        (r) =>
          r.kind === 'entered-unsourced' &&
          /longitudinal dispersivity/i.test(r.subject) &&
          r.value === '10 m',
      ),
    ).toBe(true);
    expect(
      t.some(
        (r) =>
          r.kind === 'entered-unsourced' &&
          r.subject === 'MTBE, groundwater concentration' &&
          r.value === '4 mg/L',
      ),
    ).toBe(true);
  });
});

describe('the guided cleanup section', () => {
  const cleanupSite = () =>
    afterRun(
      wellSite((x) => (x.targets.mode = 'cleanup')),
      chems,
    );

  it('says the source levels have not been solved yet, and gives each solubility', async () => {
    const r = await resultsOf(cleanupSite());
    const notes = r.cleanup!.notes.join(' ');
    expect(notes).toMatch(/Benzene: the cleanup level at the source has not been solved yet/);
    expect(notes).toMatch(/MTBE: the cleanup level at the source has not been solved yet/);
    expect(notes).toMatch(/Solubility used for Benzene/);
    expect(notes).toMatch(/Solubility used for MTBE/);
    expect(notes).not.toMatch(/\bscreens?\b/i);
    expect(r.cleanup!.methodBasis!.statement).toMatch(/step 3d/);
  }, 120000);

  it('prints the kept level while its fingerprint is current, and says when it is out of date', async () => {
    const g = cleanupSite();
    const data = dataOf(g);
    const plan = guidedSolvePlan(g, { chemicals: data.chemicals, db: data.db });
    const reqs = requestsToSolve(plan, {});
    const items = solveAll(reqs);
    const solved = new Map<string, ModeledSolved>();
    reqs.forEach((req, i) => solved.set(req.chemical.id, { req, item: items[i]! }));
    const kept = keptLevelsFrom(plan, solved);
    const withLevels: GuidedState = {
      ...g,
      levels: Object.fromEntries(kept.map((e) => [e.chemicalId, e])),
    };
    const r = await resultsOf(withLevels);
    const labels = r.cleanup!.tables.map((t) => t.label);
    expect(labels.some((l) => /Benzene/.test(l))).toBe(true);
    expect(labels.some((l) => /MTBE/.test(l))).toBe(true);

    const stale = structuredClone(withLevels);
    stale.levels![MTBE] = { ...stale.levels![MTBE]!, fingerprint: 'old' };
    const s = await resultsOf(stale);
    expect(s.cleanup!.notes.join(' ')).toMatch(
      /MTBE: the cleanup level kept with this project is out of date/,
    );
    expect(s.cleanup!.notes.join(' ')).not.toMatch(/Benzene: the cleanup level kept/);
  }, 240000);
});

describe('the guided report of measured concentrations', () => {
  const measuredSite = () =>
    guidedWith((x) => {
      x.site.basis = 'measured';
      x.site.measured = ['groundwater'];
      setValue(x, MTBE, 'groundwater', '4', 'mg/L');
    });

  it('is a guided report although a measured basis has no Run outputs', () => {
    const g = measuredSite();
    expect(Object.keys(g.outputs)).toEqual([]);
    expect(hasGuidedOutputs(guidedProject(g))).toBe(true);
    const blank = guidedWith((x) => {
      x.site.basis = 'measured';
      x.site.measured = ['groundwater'];
    });
    expect(hasGuidedOutputs(guidedProject(blank))).toBe(false);
  });

  it('lists the measured step 3b values as entries without a source', () => {
    const g = measuredSite();
    const project = guidedProject(g);
    const data = dataOf(g);
    const report = buildGuidedReport(project, data);
    const basis = guidedRunBasis({
      report,
      results: {},
      project,
      data,
      fateRows: rows,
      cleanupProps: props,
      defaults: validation.unverified.defaults as BasisDefault[],
    });
    const all = Object.values(basis.sections).flat();
    expect(
      all.some(
        (r) =>
          r.kind === 'entered-unsourced' &&
          r.subject === 'MTBE, groundwater concentration' &&
          r.value === '4 mg/L',
      ),
    ).toBe(true);
  });
});

describe('a cleanup level solved to a state standard', () => {
  const stateSite = (value: string) => {
    const g = afterRun(
      wellSite((x) => {
        x.targets.mode = 'cleanup';
        x.targets.standards[MTBE] = {
          kind: 'state',
          value,
          unit: 'ug/L',
          source: 'State reg. X',
        };
      }),
      chems,
    );
    return g;
  };
  const withKept = (g: GuidedState): GuidedState => {
    const data = dataOf(g);
    const plan = guidedSolvePlan(g, { chemicals: data.chemicals, db: data.db });
    const reqs = requestsToSolve(plan, {});
    const items = solveAll(reqs);
    const solved = new Map<string, ModeledSolved>();
    reqs.forEach((req, i) => solved.set(req.chemical.id, { req, item: items[i]! }));
    const kept = keptLevelsFrom(plan, solved);
    return { ...g, levels: Object.fromEntries(kept.map((e) => [e.chemicalId, e])) };
  };

  it('prints the standard with its value, unit and source, and no contradicting risk target', () => {
    const g = stateSite('20');
    const report = buildGuidedReport(guidedProject(g), dataOf(g));
    const inputs = report.sections.find((s) => s.key === 'cleanup')!.inputs;
    expect(inputs.map((i) => i.path)).not.toContain('targetKind');
    expect(inputs.map((i) => i.path)).not.toContain('wellTarget');
    const row = inputs.find((i) => /MTBE/.test(i.label) && /target/i.test(i.label))!;
    expect(row.value).toMatch(/state standard at the well, 20 ug\/L \(State reg\. X\)/);
    const benzene = inputs.find((i) => /Benzene/.test(i.label) && /target/i.test(i.label))!;
    expect(benzene.value).toMatch(/risk/i);
  });

  it('names the standard in the note under the level', async () => {
    const r = await resultsOf(withKept(stateSite('20')));
    expect(r.cleanup!.notes.join(' ')).toMatch(
      /MTBE: the level at the source is solved to meet the state standard at the well, 20 ug\/L \(State reg\. X\)/,
    );
  }, 240000);

  it('does not say step 5 solves it again when the level cannot be solved', async () => {
    const kept = withKept(stateSite('20'));
    const bad = structuredClone(kept);
    bad.targets.standards[MTBE]!.value = 'ND';
    const r = await resultsOf(bad);
    const notes = r.cleanup!.notes.join(' ');
    expect(notes).not.toMatch(/MTBE: the cleanup level kept with this project is out of date/);
    expect(notes).toMatch(/MTBE: the cleanup level at the source is not quantified/);
  }, 240000);
});
