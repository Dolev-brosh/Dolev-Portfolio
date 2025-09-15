import {
  AutoFixSuggestion,
  ComponentSpec,
  ElementSpec,
  PropBinding,
  PropDefinitions,
  StateSpec,
  ValidationIssue,
  ValidationResult,
  VariantCombination,
  VariantGroupSpec,
  VariantSelector,
} from '../types';

/**
 * Performs a structural deep clone of the provided value. The plugin runs in a
 * modern environment (Figma uses a Chromium runtime) so `structuredClone` is
 * available, but a JSON-based fallback is provided for older contexts and tests.
 */
export function deepCloneSpec<T>(value: T): T {
  if (typeof structuredClone === 'function') {
    return structuredClone(value);
  }
  return JSON.parse(JSON.stringify(value));
}

/**
 * Normalises variant names by trimming whitespace, converting to lowercase and
 * removing characters that are not supported by Figma variant notation.
 */
export function normalizeVariantValue(value: string): string {
  return value
    .trim()
    .replace(/[,=]+/g, '-')
    .replace(/\s+/g, '-');
}

/**
 * Validates hexadecimal or rgba colour strings. The UI allows both short and
 * long HEX notation as well as rgba functions.
 */
export function isValidColor(value: string): boolean {
  const hexRegex = /^#([0-9a-fA-F]{3}|[0-9a-fA-F]{6})$/;
  const rgbaRegex = /^rgba?\((\s*\d+\s*,){2}\s*\d+\s*(,\s*(0|1|0?\.\d+))?\)$/;
  return hexRegex.test(value.trim()) || rgbaRegex.test(value.trim());
}

/**
 * Returns a flat array of element specs using DFS traversal.
 */
export function flattenElements(root: ElementSpec): ElementSpec[] {
  const result: ElementSpec[] = [];
  const stack: ElementSpec[] = [root];
  while (stack.length) {
    const current = stack.pop()!;
    result.push(current);
    if (current.children) {
      for (let i = current.children.length - 1; i >= 0; i -= 1) {
        stack.push(current.children[i]);
      }
    }
  }
  return result;
}

/**
 * Ensures there are no duplicate values in an array. Returns duplicates for
 * diagnostics.
 */
function findDuplicates(values: string[]): string[] {
  const seen = new Set<string>();
  const duplicates = new Set<string>();
  values.forEach((value) => {
    if (seen.has(value)) {
      duplicates.add(value);
    }
    seen.add(value);
  });
  return Array.from(duplicates);
}

/**
 * Collects all colour tokens used inside the style spec.
 */
function collectColorsFromStyle(style: StateSpec['style']): string[] {
  const colors: string[] = [];
  const inspectFill = (fillArray?: { color: string }[]) => {
    if (!fillArray) return;
    fillArray.forEach((fill) => colors.push(fill.color));
  };
  const inspectEffect = (effects?: { color?: string }[]) => {
    if (!effects) return;
    effects.forEach((effect) => {
      if (effect.color) colors.push(effect.color);
    });
  };
  inspectFill(style.fills);
  inspectFill(style.strokes);
  inspectEffect(style.effects as any);
  if (style.elements) {
    Object.values(style.elements).forEach((elementStyle) => {
      inspectFill(elementStyle.fills);
      inspectFill(elementStyle.strokes);
      inspectEffect(elementStyle.effects as any);
    });
  }
  return colors;
}

function collectAllBindings(defs: PropDefinitions): string[] {
  const names: string[] = [];
  if (defs.boolean) {
    Object.keys(defs.boolean).forEach((key) => names.push(key));
  }
  if (defs.text) {
    Object.keys(defs.text).forEach((key) => names.push(key));
  }
  if (defs.swap) {
    Object.keys(defs.swap).forEach((key) => names.push(key));
  }
  return names;
}

/**
 * Validates the component specification. The routine checks for duplicate
 * names, invalid colour formats, missing bindings and incorrect variant
 * configuration. It returns a `ValidationResult` that the UI renders to the
 * user before allowing the creation of components.
 */
export function validateSpec(spec: ComponentSpec): ValidationResult {
  const errors: ValidationIssue[] = [];
  const warnings: ValidationIssue[] = [];
  const autoFixes: AutoFixSuggestion[] = [];

  if (!spec.name.trim()) {
    errors.push({
      code: 'component.name.empty',
      message: 'Component name is required.',
      hint: 'Provide a name such as "Button".',
    });
  }

  const variantGroupNames = spec.variantGroups.map((group) => group.name);
  const duplicatedGroups = findDuplicates(variantGroupNames);
  if (duplicatedGroups.length) {
    errors.push({
      code: 'variant.group.duplicate',
      message: `Variant group names must be unique. Duplicates: ${duplicatedGroups.join(', ')}.`,
    });
  }

  spec.variantGroups.forEach((group) => {
    const duplicates = findDuplicates(group.values);
    if (duplicates.length) {
      const fixNames = duplicates.map((dup, index) => `${normalizeVariantValue(dup)}_${index + 1}`);
      duplicates.forEach((dup, index) => {
        autoFixes.push({
          code: 'variant.value.duplicate',
          target: `${group.name}.${dup}`,
          suggestion: fixNames[index],
        });
      });
      errors.push({
        code: 'variant.value.duplicate',
        message: `Variant group "${group.name}" has duplicate values: ${duplicates.join(', ')}.`,
        hint: 'Rename or remove duplicates.',
      });
    }
    group.values.forEach((value) => {
      if (value.includes(',') || value.includes('=')) {
        warnings.push({
          code: 'variant.value.format',
          message: `Variant value "${value}" contains characters that are not supported by Figma.`,
          hint: 'The value will be normalised before creation.',
        });
      }
    });
  });

  const stateNames = spec.states.map((state) => state.name);
  const duplicateStates = findDuplicates(stateNames);
  if (duplicateStates.length) {
    errors.push({
      code: 'state.duplicate',
      message: `Duplicate state names detected: ${duplicateStates.join(', ')}.`,
    });
  }

  spec.states.forEach((state, index) => {
    const colors = collectColorsFromStyle(state.style);
    colors.forEach((color) => {
      if (!isValidColor(color)) {
        errors.push({
          code: 'style.color.invalid',
          message: `State "${state.name}" uses an invalid colour value: ${color}.`,
          path: `states[${index}].style`,
        });
      }
    });
  });

  const propNames = collectAllBindings(spec.propDefinitions);
  const duplicateProps = findDuplicates(propNames);
  if (duplicateProps.length) {
    errors.push({
      code: 'prop.duplicate',
      message: `Duplicate property identifiers detected: ${duplicateProps.join(', ')}.`,
    });
  }

  spec.bindings.forEach((binding) => {
    if (!propNames.includes(binding.propName)) {
      warnings.push({
        code: 'binding.unmatched',
        message: `Binding for property "${binding.propName}" does not reference a declared property.`,
        hint: 'Ensure that the property exists or remove the binding.',
      });
    }
  });

  const maxVariants = generateVariantCombinations(spec.variantGroups).length;
  if (maxVariants > 50) {
    warnings.push({
      code: 'variant.count.large',
      message: `The specification will generate ${maxVariants} variants. Consider trimming the configuration.`,
    });
  }

  return {
    ok: errors.length === 0,
    errors,
    warnings,
    autoFixes: autoFixes.length ? autoFixes : undefined,
  };
}

/**
 * Computes the cartesian product of the variant groups.
 */
export function generateVariantCombinations(groups: VariantGroupSpec[]): VariantCombination[] {
  if (!groups.length) {
    return [{}];
  }
  const [head, ...tail] = groups;
  const tailCombinations = generateVariantCombinations(tail);
  const result: VariantCombination[] = [];
  head.values.forEach((value) => {
    tailCombinations.forEach((combo) => {
      result.push({ ...combo, [head.name]: value });
    });
  });
  return result;
}

/**
 * Determines whether the provided variant combination matches the selector.
 */
export function variantMatchesSelector(
  combination: VariantCombination,
  selector?: VariantSelector,
): boolean {
  if (!selector) return true;
  return Object.entries(selector).every(([key, value]) => combination[key] === value);
}

/**
 * Finds an element spec by its identifier.
 */
export function findElementById(root: ElementSpec, id: string): ElementSpec | undefined {
  return flattenElements(root).find((element) => element.id === id);
}

/**
 * Returns the first element that matches the provided role.
 */
export function findElementByRole(root: ElementSpec, role: string): ElementSpec | undefined {
  return flattenElements(root).find((element) => element.role === role);
}

/**
 * Normalises bindings by ensuring that referenced nodes exist.
 */
export function validateBindingsExist(
  spec: ComponentSpec,
  bindings: PropBinding[] = spec.bindings,
): ValidationIssue[] {
  const issues: ValidationIssue[] = [];
  bindings.forEach((binding) => {
    if (binding.target.kind === 'NODE') {
      const exists = !!findElementById(spec.structure, binding.target.nodeId);
      if (!exists) {
        issues.push({
          code: 'binding.node.missing',
          message: `Binding for "${binding.propName}" references missing node ${binding.target.nodeId}.`,
        });
      }
    } else if (binding.target.kind === 'ROLE') {
      const exists = !!findElementByRole(spec.structure, binding.target.role);
      if (!exists) {
        issues.push({
          code: 'binding.role.missing',
          message: `Binding for "${binding.propName}" references unknown role ${binding.target.role}.`,
        });
      }
    }
  });
  return issues;
}

/**
 * Applies automatic fixes suggested by validation. The function performs a deep
 * clone to avoid mutating the source specification.
 */
export function applyAutoFixes(spec: ComponentSpec, fixes: AutoFixSuggestion[]): ComponentSpec {
  const clone = deepCloneSpec(spec);
  fixes.forEach((fix) => {
    if (fix.code === 'variant.value.duplicate') {
      const [groupName, originalValue] = fix.target.split('.');
      const group = clone.variantGroups.find((g) => g.name === groupName);
      if (group) {
        const index = group.values.findIndex((value) => value === originalValue);
        if (index >= 0) {
          group.values[index] = fix.suggestion;
        }
      }
    }
  });
  return clone;
}

export function getAllVariantSelectors(states: StateSpec[]): VariantSelector[] {
  return states
    .map((state) => state.appliesTo)
    .filter((selector): selector is VariantSelector => !!selector);
}

export function sortStates(states: StateSpec[]): StateSpec[] {
  return [...states].sort((a, b) => a.name.localeCompare(b.name));
}
