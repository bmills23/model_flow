import { REJECTED_ENTRY } from '../ui/decimalComma';
import { describe, expect, it } from 'vitest';
import { applyTexture as saturatedTexture, DEFAULT_FORM as SATURATED } from '../saturated/form';
import { applyTexture as vadoseTexture, DEFAULT_FORM as VADOSE } from '../vadose/form';
import { applyTexture as vaporTexture, DEFAULT_FORM as VAPOR } from '../vapor/form';
import {
  PROVENANCE_TEXT,
  provenanceOf,
  sameNumber,
  strongest,
  texturePreset,
  type Provenance,
} from './provenance';

describe('provenanceOf', () => {
  it('reads a rejected entry as blank', () => {
    expect(provenanceOf({ value: REJECTED_ENTRY, base: '1', required: true })).toBe('needed');
    expect(provenanceOf({ value: REJECTED_ENTRY, base: '1', required: false })).toBe('optional');
  });

  it('marks a blank value as needed when a chosen model needs it, else as optional', () => {
    expect(provenanceOf({ value: '', base: '1', required: true })).toBe('needed');
    expect(provenanceOf({ value: '  ', base: '1', required: true })).toBe('needed');
    expect(provenanceOf({ value: undefined, base: undefined, required: true })).toBe('needed');
    expect(provenanceOf({ value: '', base: '', required: false })).toBe('optional');
  });

  it('calls a value equal to the blank start a default with no source, by number', () => {
    expect(provenanceOf({ value: '0.10', base: '0.1', required: true })).toBe('default');
    expect(provenanceOf({ value: '0.2', base: '0.1', required: true })).toBe('entered');
    // a list entry the blank start does not have was entered
    expect(provenanceOf({ value: '3', base: undefined, required: true })).toBe('entered');
  });

  it('prefers the soil type when the value is still the one the soil type filled', () => {
    expect(provenanceOf({ value: '0.387', base: '0.387', preset: '0.387', required: true })).toBe(
      'soilType',
    );
    expect(provenanceOf({ value: '0.4', base: '0.35', preset: '0.387', required: true })).toBe(
      'entered',
    );
  });
});

describe('strongest', () => {
  it('ranks needed over entered over default over soil type over optional', () => {
    const order: Provenance[] = ['optional', 'soilType', 'default', 'entered', 'needed'];
    for (let i = 1; i < order.length; i++) {
      expect(strongest(order.slice(0, i + 1))).toBe(order[i]);
      expect(strongest([...order.slice(0, i + 1)].reverse())).toBe(order[i]);
    }
    expect(strongest([])).toBe('optional');
  });
});

describe('sameNumber', () => {
  it('ignores float noise and formatting, and compares text that is not a number as text', () => {
    expect(sameNumber('1.6600000000000001', '1.66')).toBe(true);
    expect(sameNumber('1e-3', '0.001')).toBe(true);
    expect(sameNumber('1.7', '1.8')).toBe(false);
    expect(sameNumber('', '0')).toBe(false);
    expect(sameNumber('abc', 'abc')).toBe(true);
  });
});

describe('texturePreset', () => {
  it('gives the value a layer soil type fills, for the leaching, vapor and saturated forms', () => {
    const layer = vadoseTexture(VADOSE.source, 'SL');
    expect(texturePreset('vadose', layer as never, 'thetaS')).toBe(layer.thetaS);
    expect(texturePreset('vadose', { ...layer, thetaS: '0.5' } as never, 'thetaS')).toBe(
      layer.thetaS,
    );
    const stratum = vaporTexture(VAPOR.layers[0]!, 'SL');
    expect(texturePreset('vapor', stratum as never, 'porosity')).toBe(stratum.porosity);
    const sat = saturatedTexture(SATURATED, 'SL');
    expect(texturePreset('saturated', sat as never, 'rhoB')).toBe(sat.rhoB);
  });

  it('gives nothing for a custom layer or a field the soil type does not fill', () => {
    expect(texturePreset('vadose', VADOSE.source as never, 'thetaS')).toBeUndefined();
    const layer = vadoseTexture(VADOSE.source, 'SL');
    expect(texturePreset('vadose', layer as never, 'foc')).toBeUndefined();
    expect(texturePreset('transport', { texture: 'SL' }, 'porosity')).toBeUndefined();
  });
});

describe('PROVENANCE_TEXT', () => {
  it('says where each value came from in plain words', () => {
    expect(PROVENANCE_TEXT.soilType).toMatch(/from the soil type/i);
    expect(PROVENANCE_TEXT.default).toMatch(/default with no source/i);
    expect(PROVENANCE_TEXT.entered).toMatch(/entered with no source/i);
    expect(PROVENANCE_TEXT.needed).toMatch(/needed/i);
    for (const t of Object.values(PROVENANCE_TEXT)) expect(t).not.toContain('\u2014');
  });
});
