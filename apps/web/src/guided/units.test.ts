import { describe, expect, it } from 'vitest';
import { classifyValue, defaultUnit, normalizeUnit, sourceNumber, unitsFor } from './units';

describe('source units', () => {
  it('offers ug/L and mg/L for groundwater, mg/kg for soil, and an air unit for soil gas', () => {
    expect(unitsFor('groundwater')).toContain('ug/L');
    expect(unitsFor('groundwater')).toContain('mg/L');
    expect(unitsFor('soilAbove')).toContain('mg/kg');
    expect(unitsFor('soilGas')).toContain('ug/m3');
    expect(defaultUnit('groundwater')).toBe('mg/L');
    expect(defaultUnit('soil')).toBe('mg/kg');
  });

  it('converts to the unit the models read', () => {
    expect(sourceNumber('500', 'ug/L', 'groundwater')).toBeCloseTo(0.5, 12);
    expect(sourceNumber('0.5', 'mg/L', 'groundwater')).toBe(0.5);
    expect(sourceNumber('2500', 'ug/kg', 'soilAbove')).toBeCloseTo(2.5, 12);
    expect(sourceNumber('3000', 'ug/m3', 'soilGas')).toBeCloseTo(3, 12);
  });

  it('treats ND as zero in the run and blank or unreadable text as nothing', () => {
    expect(sourceNumber('ND', 'ug/L', 'groundwater')).toBe(0);
    expect(sourceNumber('', 'ug/L', 'groundwater')).toBeNull();
    expect(sourceNumber('abc', 'ug/L', 'groundwater')).toBeNull();
  });

  it('classifies a typed value', () => {
    expect(classifyValue('  ').kind).toBe('blank');
    expect(classifyValue('ND').kind).toBe('nd');
    expect(classifyValue('nd').kind).toBe('nd');
    expect(classifyValue('1.5e-3')).toEqual({ kind: 'number', value: 0.0015 });
    expect(classifyValue('0').kind).toBe('invalid');
    expect(classifyValue('-2').kind).toBe('invalid');
    expect(classifyValue('abc').kind).toBe('invalid');
  });

  it('reads spreadsheet spellings of a unit', () => {
    expect(normalizeUnit('µg/L', 'groundwater')).toBe('ug/L');
    expect(normalizeUnit('UG/L', 'groundwater')).toBe('ug/L');
    expect(normalizeUnit('ppm', 'soil')).toBe('mg/kg');
    expect(normalizeUnit('ug/m^3', 'soilGas')).toBe('ug/m3');
    expect(normalizeUnit('furlongs', 'soil')).toBeNull();
    expect(normalizeUnit('ug/L', 'soil')).toBeNull();
  });
});
