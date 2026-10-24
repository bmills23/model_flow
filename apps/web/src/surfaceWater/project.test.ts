import { describe, expect, it } from 'vitest';
import { CURRENT_VERSION, buildProject, defaultScreens, screensOf } from '../project';
import { readProjectFile, serializeProject } from '../project/file';
import { CRITERIA_SET_CHOICES } from './criteriaSetChoice';
import { fromProject, surfaceWaterProjectSchema, toProject } from './project';

describe('surface water project: the criteria set choice', () => {
  it('opens a project that never chose a set with the US sets', () => {
    expect(fromProject(undefined).criteriaSet).toBe('us');
    expect(fromProject({ form: {} }).criteriaSet).toBe('us');
  });

  it('does not write the default, so an unchanged project is what it was before the choice existed', () => {
    const snap = toProject(fromProject(undefined)) as Record<string, unknown>;
    expect(Object.keys(snap)).toEqual(['form']);
  });

  it('writes any other choice', () => {
    const state = { ...fromProject(undefined), criteriaSet: 'eu' as const };
    expect((toProject(state) as { criteriaSet?: string }).criteriaSet).toBe('eu');
  });

  it('opens a project saved with the 2013 EU set (eu) on that set, and accepts the revised set eu2026', () => {
    expect(fromProject({ criteriaSet: 'eu' }).criteriaSet).toBe('eu');
    expect(fromProject({ criteriaSet: 'eu2026' }).criteriaSet).toBe('eu2026');
    expect(surfaceWaterProjectSchema.safeParse({ criteriaSet: 'eu' }).success).toBe(true);
    expect(surfaceWaterProjectSchema.safeParse({ criteriaSet: 'eu2026' }).success).toBe(true);
  });

  it('accepts every choice and refuses an unknown one', () => {
    for (const c of CRITERIA_SET_CHOICES) {
      expect(surfaceWaterProjectSchema.safeParse({ criteriaSet: c }).success, c).toBe(true);
    }
    expect(surfaceWaterProjectSchema.safeParse({ criteriaSet: 'noaa' }).success).toBe(false);
    expect(surfaceWaterProjectSchema.safeParse({ criteriaSet: 3 }).success).toBe(false);
  });

  it.each(CRITERIA_SET_CHOICES)(
    'round-trips %s through a saved project file inside the current format version',
    async (choice) => {
      const screens = defaultScreens();
      screens.surfaceWater = { ...screens.surfaceWater, criteriaSet: choice };
      const project = buildProject({
        screens,
        createdWith: '0.0.0',
        now: new Date('2026-10-23T12:00:00Z'),
      });
      expect(project.version).toBe(CURRENT_VERSION);
      const file = new File([serializeProject(project)], 'x.json', { type: 'application/json' });
      const read = await readProjectFile(file);
      expect(read.ok).toBe(true);
      if (!read.ok) return;
      expect(read.project.version).toBe(CURRENT_VERSION);
      expect(screensOf(read.project).surfaceWater.criteriaSet).toBe(choice);
    },
  );
});
