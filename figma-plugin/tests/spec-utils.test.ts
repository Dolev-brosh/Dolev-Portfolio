import { describe, expect, it } from 'vitest';
import { createSpecFromTemplate } from '../src/templates';
import {
  applyAutoFixes,
  generateVariantCombinations,
  isValidColor,
  normalizeVariantValue,
  validateSpec,
  variantMatchesSelector,
} from '../src/utils/spec';

import type { ComponentSpec, VariantSelector } from '../src/types';

describe('spec utilities', () => {
  it('normalises variant values for figma compatibility', () => {
    expect(normalizeVariantValue('Hover State')).toBe('Hover-State');
    expect(normalizeVariantValue('selected=focus')).toBe('selected-focus');
  });

  it('validates duplicate variant values', () => {
    const spec = createSpecFromTemplate('button');
    spec.variantGroups[0].values.push('default');
    const result = validateSpec(spec);
    expect(result.ok).toBe(false);
    expect(result.errors.some((issue) => issue.code === 'variant.value.duplicate')).toBe(true);
  });

  it('detects invalid colour tokens', () => {
    expect(isValidColor('#fff')).toBe(true);
    expect(isValidColor('rgba(255,0,0,0.2)')).toBe(true);
    expect(isValidColor('#12345')).toBe(false);
  });

  it('generates variant combinations from groups', () => {
    const spec = createSpecFromTemplate('button');
    const combinations = generateVariantCombinations(spec.variantGroups);
    expect(combinations).toHaveLength(spec.variantGroups[0].values.length * spec.variantGroups[1].values.length);
  });

  it('matches variant selectors correctly', () => {
    const selector: VariantSelector = { state: 'default', size: 'md' };
    expect(variantMatchesSelector({ state: 'default', size: 'md' }, selector)).toBe(true);
    expect(variantMatchesSelector({ state: 'hover', size: 'md' }, selector)).toBe(false);
  });

  it('suggests auto fixes for duplicate variant values', () => {
    const spec = createSpecFromTemplate('button');
    spec.variantGroups[0].values.push('default');
    const validation = validateSpec(spec);
    expect(validation.autoFixes?.length).toBeGreaterThan(0);
    const fixed = applyAutoFixes(spec, validation.autoFixes ?? []);
    expect(validateSpec(fixed).ok).toBe(true);
  });
});
