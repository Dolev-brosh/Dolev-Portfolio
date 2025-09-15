import './styles.css';
import {
  ComponentSpec,
  ElementSpec,
  PluginToUIMessage,
  PropBinding,
  PropDefinitions,
  StateSpec,
  TemplateId,
  ThemeName,
  UIToPluginMessage,
  ValidationResult,
  VariantCombination,
} from './types';
import { createSpecFromTemplate, templates } from './templates';
import { deepCloneSpec, validateSpec, variantMatchesSelector } from './utils/spec';

type MessagePort = typeof parent;

interface AppState {
  spec: ComponentSpec;
  templateId: TemplateId;
  validation: ValidationResult | null;
  selection: { elementId: string | null; stateIndex: number };
  activeVariants: VariantCombination;
  theme: ThemeName;
  largeVariantConfirmed: boolean;
}

const state: AppState = {
  spec: createSpecFromTemplate('button'),
  templateId: 'button',
  validation: null,
  selection: { elementId: null, stateIndex: 0 },
  activeVariants: {},
  theme: 'light',
  largeVariantConfirmed: false,
};

const dom = {
  templateSelect: document.getElementById('template-select') as HTMLSelectElement,
  componentName: document.getElementById('component-name') as HTMLInputElement,
  previewCanvas: document.getElementById('preview-canvas') as HTMLDivElement,
  stateSelect: document.getElementById('state-select') as HTMLSelectElement,
  variantToggleContainer: document.getElementById('variant-toggle-container') as HTMLDivElement,
  inspector: document.getElementById('inspector-content') as HTMLDivElement,
  importButton: document.getElementById('import-spec') as HTMLButtonElement,
  exportButton: document.getElementById('export-spec') as HTMLButtonElement,
  saveButton: document.getElementById('save-spec') as HTMLButtonElement,
  createButton: document.getElementById('create-components') as HTMLButtonElement,
  importDialog: document.getElementById('import-dialog') as HTMLDialogElement,
  importTextarea: document.getElementById('import-textarea') as HTMLTextAreaElement,
  confirmImport: document.getElementById('confirm-import') as HTMLButtonElement,
  toggleTheme: document.getElementById('toggle-theme') as HTMLButtonElement,
  previewHint: document.getElementById('preview-hint') as HTMLDivElement,
};

const port: MessagePort = parent;

init();

function init() {
  renderTemplateOptions();
  bindEventListeners();
  applyTheme(state.theme);
  setSpec(createSpecFromTemplate('button'), 'button');
  requestAnimationFrame(() => {
    postMessage({ type: 'ui-ready' });
  });
}

function bindEventListeners() {
  dom.templateSelect.addEventListener('change', (event) => {
    const value = (event.target as HTMLSelectElement).value as TemplateId;
    const spec = createSpecFromTemplate(value);
    setSpec(spec, value);
    sendValidation();
  });

  dom.componentName.addEventListener('input', (event) => {
    const value = (event.target as HTMLInputElement).value;
    updateSpec((draft) => {
      draft.name = value;
    });
  });

  dom.previewCanvas.addEventListener('click', (event) => {
    const target = (event.target as HTMLElement).closest<HTMLElement>('[data-element-id]');
    if (!target) {
      showHint('Select an element in the preview to edit its style or bindings.');
      return;
    }
    state.selection.elementId = target.dataset.elementId ?? null;
    render();
  });

  dom.stateSelect.addEventListener('change', (event) => {
    const value = (event.target as HTMLSelectElement).value;
    const index = state.spec.states.findIndex((st) => stateKey(st) === value);
    state.selection.stateIndex = index >= 0 ? index : 0;
    const selector = state.spec.states[state.selection.stateIndex]?.appliesTo;
    if (selector) {
      Object.entries(selector).forEach(([group, groupValue]) => {
        state.activeVariants[group] = groupValue;
      });
    }
    render();
  });

  dom.variantToggleContainer.addEventListener('change', (event) => {
    const target = event.target as HTMLSelectElement;
    if (target && target.dataset.group) {
      state.activeVariants[target.dataset.group] = target.value;
      render();
    }
  });

  dom.saveButton.addEventListener('click', () => {
    postMessage({ type: 'request-save', spec: state.spec });
  });

  dom.createButton.addEventListener('click', () => {
    const validation = runValidation();
    const hasLarge = validation?.warnings.some((warning) => warning.code === 'variant.count.large');
    let confirmed = state.largeVariantConfirmed;
    if (hasLarge && !confirmed) {
      confirmed = window.confirm('This specification will generate many variants. Continue?');
      state.largeVariantConfirmed = confirmed;
    }
    if (hasLarge && !confirmed) {
      return;
    }
    postMessage({
      type: 'request-create',
      spec: state.spec,
      options: { confirmLargeVariantCount: confirmed },
    });
  });

  dom.importButton.addEventListener('click', () => {
    dom.importTextarea.value = JSON.stringify(state.spec, null, 2);
    dom.importDialog.showModal();
  });

  dom.confirmImport.addEventListener('click', () => {
    try {
      const parsed = JSON.parse(dom.importTextarea.value) as ComponentSpec;
      setSpec(parsed, parsed.template);
      sendValidation();
      dom.importDialog.close();
    } catch (error) {
      alert('Invalid JSON. Please fix the content and try again.');
    }
  });

  dom.exportButton.addEventListener('click', () => {
    const blob = new Blob([JSON.stringify(state.spec, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `${state.spec.name || 'component'}-spec.json`;
    link.click();
    URL.revokeObjectURL(url);
  });

  dom.toggleTheme.addEventListener('click', () => {
    state.theme = state.theme === 'light' ? 'dark' : 'light';
    applyTheme(state.theme);
    postMessage({ type: 'notify-theme', theme: state.theme });
  });

  window.addEventListener('message', (event) => {
    const message = event.data.pluginMessage as PluginToUIMessage;
    if (!message) return;
    handlePluginMessage(message);
  });
}

function handlePluginMessage(message: PluginToUIMessage) {
  switch (message.type) {
    case 'spec-loaded':
      setSpec(message.spec ?? createSpecFromTemplate('button'), message.spec?.template ?? 'button');
      break;
    case 'save-success':
      setSpec(message.spec, message.spec.template);
      showHint('Specification saved to this file.');
      break;
    case 'save-error':
      showHint(message.error, true);
      break;
    case 'create-success':
      showHint('Component set created on the canvas.');
      break;
    case 'create-error':
      showHint(message.error, true);
      break;
    case 'validation-result':
      state.validation = message.result;
      renderValidation();
      break;
    case 'theme-change':
      state.theme = message.theme;
      applyTheme(state.theme);
      break;
    default:
      break;
  }
}

function render() {
  ensureSelectionBounds();
  renderPreview();
  renderVariantControls();
  renderStateSelector();
  renderInspector();
  renderValidation();
}

function setSpec(spec: ComponentSpec, templateId: TemplateId) {
  state.spec = deepCloneSpec(spec);
  state.templateId = templateId;
  state.selection = { elementId: null, stateIndex: 0 };
  state.activeVariants = computeDefaultVariants(state.spec);
  dom.templateSelect.value = templateId;
  dom.componentName.value = state.spec.name ?? '';
  state.validation = runValidation();
  state.largeVariantConfirmed = false;
  render();
}

function updateSpec(mutator: (draft: ComponentSpec) => void) {
  const draft = deepCloneSpec(state.spec);
  mutator(draft);
  state.spec = draft;
  state.validation = runValidation();
  state.largeVariantConfirmed = false;
  render();
}

function runValidation(): ValidationResult {
  const result = validateSpec(state.spec);
  state.validation = result;
  return result;
}

function sendValidation() {
  postMessage({ type: 'validation-result', result: runValidation() });
}

function ensureSelectionBounds() {
  if (state.selection.stateIndex >= state.spec.states.length) {
    state.selection.stateIndex = Math.max(0, state.spec.states.length - 1);
  }
}

function renderTemplateOptions() {
  dom.templateSelect.innerHTML = templates
    .map((tpl) => `<option value="${tpl.id}">${tpl.title}</option>`)
    .join('');
}

function renderPreview() {
  dom.previewCanvas.innerHTML = '';
  const activeStates = getActiveStates();
  const props = resolvePropValues(state.spec, activeStates);
  const root = buildPreviewNode(state.spec.structure, activeStates, props, true);
  dom.previewCanvas.appendChild(root);
}

function buildPreviewNode(
  element: ElementSpec,
  activeStates: StateSpec[],
  props: PropValueCollection,
  isRoot = false,
): HTMLElement {
  const elementType = element.type;
  let node: HTMLElement;
  if (elementType === 'TEXT') {
    node = document.createElement('span');
    node.classList.add('preview-text');
    const binding = getBindingForElement(element, 'TEXT');
    const text = binding ? props.text?.[binding.propName] ?? '' : element.text?.default ?? '';
    node.textContent = text || element.text?.placeholder || 'Text';
  } else {
    node = document.createElement('div');
  }
  node.classList.add('preview-node');
  if (isRoot) node.classList.add('preview-root-node');
  node.dataset.elementId = element.id;
  if (state.selection.elementId === element.id) {
    node.classList.add('selected');
  }

  applyPreviewStyles(node, element, activeStates, props, isRoot);

  const boolBinding = getBindingForElement(element, 'BOOLEAN');
  const visible = boolBinding
    ? props.boolean?.[boolBinding.propName] ?? element.defaultVisible !== false
    : element.defaultVisible !== false;
  node.style.display = visible ? node.style.display || 'flex' : 'none';

  if (elementType === 'ICON') {
    node.classList.add('preview-icon');
  }

  if (element.children && element.children.length) {
    element.children.forEach((child) => {
      const childNode = buildPreviewNode(child, activeStates, props);
      node.appendChild(childNode);
    });
  }

  return node;
}

interface ComputedStyle {
  fill?: string;
  textColor?: string;
  borderColor?: string;
  borderWidth?: number;
  radius?: string;
  shadow?: string;
  textStyle?: {
    fontFamily: string;
    fontSize: number;
    lineHeight?: number;
    fontWeight?: number;
    letterSpacing?: number;
  };
}

function applyPreviewStyles(
  node: HTMLElement,
  element: ElementSpec,
  activeStates: StateSpec[],
  props: PropValueCollection,
  isRoot: boolean,
) {
  const style = createComputedStyle(element, null);
  if (isRoot && state.spec.baseStyle) {
    mergeComputedStyle(style, createComputedStyle(null, state.spec.baseStyle));
  }
  activeStates.forEach((stateSpec) => {
    if (isRoot) {
      mergeComputedStyle(style, createComputedStyle(null, stateSpec.style));
    }
    const elementStyle = getElementStyleForState(stateSpec, element);
    if (elementStyle) {
      mergeComputedStyle(style, createComputedStyle(null, elementStyle));
    }
  });

  if (style.fill) node.style.background = style.fill;
  else node.style.background = 'transparent';

  if (style.borderColor) {
    node.style.border = `${style.borderWidth ?? 1}px solid ${style.borderColor}`;
  } else {
    node.style.border = 'none';
  }

  if (style.radius) node.style.borderRadius = style.radius;

  node.style.boxShadow = style.shadow ?? 'none';

  if (element.type === 'TEXT') {
    if (style.textColor) node.style.color = style.textColor;
    if (style.textStyle) {
      node.style.fontFamily = `'${style.textStyle.fontFamily}', sans-serif`;
      node.style.fontSize = `${style.textStyle.fontSize}px`;
      node.style.fontWeight = `${style.textStyle.fontWeight ?? 600}`;
      if (style.textStyle.lineHeight) {
        node.style.lineHeight = `${style.textStyle.lineHeight}px`;
      }
      if (typeof style.textStyle.letterSpacing !== 'undefined') {
        node.style.letterSpacing = `${style.textStyle.letterSpacing / 100}em`;
      }
    }
  }

  if (element.type === 'FRAME' || isRoot) {
    const layout = resolveLayoutForElement(element, activeStates, isRoot);
    node.style.display = 'flex';
    node.style.flexDirection = layout.direction === 'HORIZONTAL' ? 'row' : 'column';
    node.style.alignItems = mapAlignment(layout.alignment);
    node.style.justifyContent = mapJustify(layout.alignment);
    node.style.gap = `${layout.gap}px`;
    const padding = Array.isArray(layout.padding)
      ? layout.padding
      : [layout.padding, layout.padding, layout.padding, layout.padding];
    node.style.padding = `${padding[0]}px ${padding[1]}px ${padding[2]}px ${padding[3]}px`;
  }

  const swapBinding = getBindingForElement(element, 'INSTANCE_SWAP');
  if (swapBinding) {
    node.setAttribute('data-swap-prop', swapBinding.propName);
  }
}

function createComputedStyle(element: ElementSpec | null, style: any): ComputedStyle {
  const result: ComputedStyle = {};
  const fills = style?.fills ?? element?.fills;
  if (fills && fills.length) {
    result.fill = toCssColor(fills[0].color, fills[0].opacity);
  }
  const strokes = style?.strokes ?? element?.strokes;
  if (strokes && strokes.length) {
    result.borderColor = toCssColor(strokes[0].color, strokes[0].opacity);
    result.borderWidth = strokes[0].weight ?? 1;
  }
  const corner = style?.cornerRadius ?? element?.cornerRadius;
  if (typeof corner === 'number') {
    result.radius = `${corner}px`;
  } else if (corner) {
    result.radius = `${corner.tl}px ${corner.tr}px ${corner.br}px ${corner.bl}px`;
  }
  const effects = style?.effects ?? element?.effects;
  if (effects && effects.length) {
    const effect = effects[0];
    if (effect.type === 'DROP_SHADOW' || effect.type === 'INNER_SHADOW') {
      result.shadow = `${effect.offset.x}px ${effect.offset.y}px ${effect.radius}px ${
        effect.spread ?? 0
      }px ${toCssColor(effect.color, effect.opacity)}`;
    }
  }
  if (element?.type === 'TEXT' && element.fills?.length) {
    result.textColor = toCssColor(element.fills[0].color, element.fills[0].opacity);
  }
  if (style?.textStyle) {
    result.textStyle = style.textStyle;
  }
  if (style?.elements && element?.role) {
    const perElement = style.elements[element.role] || style.elements[element.id];
    if (perElement?.fills?.length) {
      result.fill = toCssColor(perElement.fills[0].color, perElement.fills[0].opacity);
    }
    if (perElement?.strokes?.length) {
      result.borderColor = toCssColor(perElement.strokes[0].color, perElement.strokes[0].opacity);
    }
    if (perElement?.textStyle) {
      result.textStyle = perElement.textStyle;
    }
  }
  return result;
}

function mergeComputedStyle(target: ComputedStyle, source: ComputedStyle) {
  Object.assign(target, source);
}

function resolveLayoutForElement(
  element: ElementSpec,
  states: StateSpec[],
  isRoot: boolean,
): { direction: 'HORIZONTAL' | 'VERTICAL'; gap: number; padding: number | [number, number, number, number]; alignment: 'start' | 'center' | 'end' | 'space-between' } {
  const base = element.layout ?? {
    direction: 'HORIZONTAL',
    gap: 8,
    padding: 12,
    alignment: 'CENTER',
  };
  let result = { ...base };
  states.forEach((stateSpec) => {
    if (isRoot && stateSpec.style.layout?.autolayout) {
      const override = stateSpec.style.layout.autolayout;
      result = {
        direction: result.direction,
        gap: override.gap ?? result.gap,
        padding: override.padding ?? result.padding,
        alignment: mapAlignKey(override.align ?? 'start'),
      };
    }
    const elementStyle = getElementStyleForState(stateSpec, element);
    if (elementStyle?.autolayout) {
      result = {
        direction: result.direction,
        gap: elementStyle.autolayout.gap ?? result.gap,
        padding: elementStyle.autolayout.padding ?? result.padding,
        alignment: mapAlignKey(elementStyle.autolayout.align ?? 'start'),
      };
    }
  });
  return {
    direction: result.direction,
    gap: result.gap,
    padding: result.padding,
    alignment: mapAlignKey((result as any).alignment ?? 'start'),
  };
}

function mapAlignKey(value: string): 'start' | 'center' | 'end' | 'space-between' {
  if (value === 'CENTER') return 'center';
  if (value === 'END') return 'end';
  if (value === 'SPACE_BETWEEN') return 'space-between';
  return value as any;
}

function mapAlignment(value: 'start' | 'center' | 'end' | 'space-between'): string {
  switch (value) {
    case 'center':
      return 'center';
    case 'end':
      return 'flex-end';
    case 'space-between':
      return 'stretch';
    default:
      return 'flex-start';
  }
}

function mapJustify(value: 'start' | 'center' | 'end' | 'space-between'): string {
  switch (value) {
    case 'center':
      return 'center';
    case 'end':
      return 'flex-end';
    case 'space-between':
      return 'space-between';
    default:
      return 'flex-start';
  }
}

function toCssColor(color: string, opacity?: number): string {
  if (color.startsWith('#') && color.length === 7) {
    const r = parseInt(color.slice(1, 3), 16);
    const g = parseInt(color.slice(3, 5), 16);
    const b = parseInt(color.slice(5, 7), 16);
    const a = typeof opacity === 'number' ? opacity : 1;
    return `rgba(${r}, ${g}, ${b}, ${a})`;
  }
  return color;
}

function computeDefaultVariants(spec: ComponentSpec): VariantCombination {
  const variants: VariantCombination = {};
  spec.variantGroups.forEach((group) => {
    variants[group.name] = group.values[0] ?? 'default';
  });
  const firstState = spec.states[0]?.appliesTo;
  if (firstState) {
    Object.entries(firstState).forEach(([group, value]) => {
      variants[group] = value;
    });
  }
  return variants;
}

function getActiveStates(): StateSpec[] {
  return state.spec.states.filter((stateSpec) => variantMatchesSelector(state.activeVariants, stateSpec.appliesTo));
}

function renderStateSelector() {
  dom.stateSelect.innerHTML = state.spec.states
    .map((stateSpec, index) => {
      const label = stateSpec.label || stateSpec.name;
      const key = stateKey(stateSpec);
      const selected = index === state.selection.stateIndex ? 'selected' : '';
      return `<option value="${key}" ${selected}>${label}</option>`;
    })
    .join('');
}

function renderVariantControls() {
  dom.variantToggleContainer.innerHTML = state.spec.variantGroups
    .map((group) => {
      const options = group.values
        .map((value) => {
          const selected = state.activeVariants[group.name] === value ? 'selected' : '';
          return `<option value="${value}" ${selected}>${value}</option>`;
        })
        .join('');
      return `
        <label class="variant-toggle">
          <span>${group.name}</span>
          <select data-group="${group.name}">${options}</select>
        </label>
      `;
    })
    .join('');
}

function renderInspector() {
  const selectedElement = findElementById(state.spec.structure, state.selection.elementId);
  const currentState = state.spec.states[state.selection.stateIndex];
  const componentSection = renderComponentSection();
  const variantSection = renderVariantSection();
  const statesSection = renderStatesSection();
  const propsSection = renderPropsSection();
  const bindingSection = renderBindingsSection(selectedElement);
  const styleSection = renderStyleSection(selectedElement, currentState);
  dom.inspector.innerHTML =
    componentSection + variantSection + statesSection + propsSection + bindingSection + styleSection;
  bindInspectorEvents();
}

function renderComponentSection(): string {
  return `
    <section class="section" id="component-section">
      <h2>Component</h2>
      <div class="field">
        <span>Name</span>
        <input data-action="component-name" value="${state.spec.name}" />
      </div>
      <p class="muted">Template: <strong>${state.templateId}</strong></p>
    </section>
  `;
}

function renderVariantSection(): string {
  return `
    <section class="section" id="variant-section">
      <h2>Variant Groups</h2>
      ${state.spec.variantGroups
        .map((group, index) => {
          const values = group.values
            .map(
              (value, valueIndex) => `
                <div class="row-actions">
                  <input data-action="variant-value" data-group-index="${index}" data-value-index="${valueIndex}" value="${value}" />
                  <button class="ghost" data-action="remove-variant-value" data-group-index="${index}" data-value-index="${valueIndex}">Remove</button>
                </div>
              `,
            )
            .join('');
          return `
            <details open>
              <summary>
                <input data-action="variant-group-name" data-group-index="${index}" value="${group.name}" />
              </summary>
              <div>${values}</div>
              <button class="ghost" data-action="add-variant-value" data-group-index="${index}">Add value</button>
              <button class="ghost" data-action="remove-variant-group" data-group-index="${index}">Remove group</button>
            </details>
          `;
        })
        .join('')}
      <button class="primary" data-action="add-variant-group">Add group</button>
    </section>
  `;
}

function renderStatesSection(): string {
  const list = state.spec.states
    .map((stateSpec, index) => {
      const active = index === state.selection.stateIndex ? 'accent' : 'ghost';
      return `<button class="${active}" data-action="select-state" data-state-index="${index}">${
        stateSpec.label || stateSpec.name
      }</button>`;
    })
    .join('');
  const current = state.spec.states[state.selection.stateIndex];
  const selectors = state.spec.variantGroups
    .map((group) => {
      const value = current.appliesTo?.[group.name] ?? '';
      return `
        <label class="field">
          <span>${group.name}</span>
          <input data-action="state-selector" data-group="${group.name}" value="${value}" placeholder="Any" />
        </label>
      `;
    })
    .join('');
  return `
    <section class="section" id="states-section">
      <h2>States</h2>
      <div class="state-list">${list}</div>
      <div class="field">
        <span>State name</span>
        <input data-action="state-name" value="${current.name}" />
      </div>
      <div class="selectors">${selectors}</div>
      <div class="row-actions">
        <button class="ghost" data-action="duplicate-state">Duplicate</button>
        <button class="ghost" data-action="remove-state">Remove</button>
        <button class="ghost" data-action="add-state">Add State</button>
      </div>
    </section>
  `;
}

function renderPropsSection(): string {
  const booleanRows = renderPropRows(state.spec.propDefinitions.boolean, 'boolean');
  const textRows = renderPropRows(state.spec.propDefinitions.text, 'text');
  const swapRows = renderPropRows(state.spec.propDefinitions.swap, 'swap');
  return `
    <section class="section" id="props-section">
      <h2>Props</h2>
      <details open>
        <summary>Boolean</summary>
        <table><tbody>${booleanRows}</tbody></table>
        <button class="ghost" data-action="add-prop" data-type="boolean">Add boolean</button>
      </details>
      <details>
        <summary>Text</summary>
        <table><tbody>${textRows}</tbody></table>
        <button class="ghost" data-action="add-prop" data-type="text">Add text</button>
      </details>
      <details>
        <summary>Instance Swap</summary>
        <table><tbody>${swapRows}</tbody></table>
        <button class="ghost" data-action="add-prop" data-type="swap">Add swap</button>
      </details>
    </section>
  `;
}

function renderPropRows<T extends { name: string; defaultValue?: any }>(
  props: Record<string, T> | undefined,
  type: 'boolean' | 'text' | 'swap',
): string {
  if (!props) return '';
  return Object.entries(props)
    .map(([key, value]) => {
      return `
        <tr>
          <td><input data-action="prop-key" data-type="${type}" data-prop="${key}" value="${key}" /></td>
          <td><input data-action="prop-name" data-type="${type}" data-prop="${key}" value="${value.name}" /></td>
          <td><input data-action="prop-default" data-type="${type}" data-prop="${key}" value="${value.defaultValue ?? ''}" /></td>
          <td><button class="ghost" data-action="remove-prop" data-type="${type}" data-prop="${key}">Remove</button></td>
        </tr>
      `;
    })
    .join('');
}

function renderBindingsSection(selection: ElementSpec | null): string {
  const rows = state.spec.bindings
    .map((binding, index) => {
      return `
        <tr>
          <td>
            <select data-action="binding-type" data-index="${index}">
              <option value="BOOLEAN" ${binding.type === 'BOOLEAN' ? 'selected' : ''}>Boolean</option>
              <option value="TEXT" ${binding.type === 'TEXT' ? 'selected' : ''}>Text</option>
              <option value="INSTANCE_SWAP" ${binding.type === 'INSTANCE_SWAP' ? 'selected' : ''}>Swap</option>
            </select>
          </td>
          <td><input data-action="binding-prop" data-index="${index}" value="${binding.propName}" /></td>
          <td>${describeBindingTarget(binding)}</td>
          <td>
            <button class="ghost" data-action="bind-to-selection" data-index="${index}">Bind selection</button>
            <button class="ghost" data-action="remove-binding" data-index="${index}">Remove</button>
          </td>
        </tr>
      `;
    })
    .join('');
  const current = selection ? `${selection.name} (${selection.role ?? selection.id})` : 'None';
  return `
    <section class="section" id="bindings-section">
      <h2>Bindings</h2>
      <p class="muted">Selected: <strong>${current}</strong></p>
      <table><tbody>${rows}</tbody></table>
      <button class="ghost" data-action="add-binding">Add binding</button>
    </section>
  `;
}

function renderStyleSection(element: ElementSpec | null, currentState: StateSpec): string {
  const target = element ?? state.spec.structure;
  const key = getElementStyleKey(currentState, target);
  const elementStyle = key
    ? currentState.style.elements?.[key] ?? createEmptyElementStyle()
    : currentState.style;
  const fill = elementStyle.fills?.[0]?.color ?? '';
  const stroke = elementStyle.strokes?.[0]?.color ?? '';
  const radius = typeof elementStyle.cornerRadius === 'number' ? elementStyle.cornerRadius : '';
  const textStyle = elementStyle.textStyle ?? currentState.style.textStyle;
  const fontFamily = textStyle?.fontFamily ?? '';
  const fontWeight = textStyle?.fontWeight ?? '';
  const fontSize = textStyle?.fontSize ?? '';
  const lineHeight = textStyle?.lineHeight ?? '';
  const gap = currentState.style.layout?.autolayout?.gap ?? target.layout?.gap ?? '';
  const padding =
    currentState.style.layout?.autolayout?.padding ?? target.layout?.padding ?? '';
  return `
    <section class="section" id="style-section">
      <h2>Style</h2>
      <p>Editing <strong>${currentState.label || currentState.name}</strong> → <strong>${
        target.name
      }</strong></p>
      <div class="field">
        <span>Fill</span>
        <input data-action="style-fill" value="${fill}" placeholder="#1f5af6" />
      </div>
      <div class="field">
        <span>Stroke</span>
        <input data-action="style-stroke" value="${stroke}" placeholder="#000000" />
      </div>
      <div class="field">
        <span>Corner radius</span>
        <input data-action="style-radius" type="number" value="${radius}" />
      </div>
      <div class="field">
        <span>Font family</span>
        <input data-action="style-font-family" value="${fontFamily}" placeholder="Inter" />
      </div>
      <div class="field">
        <span>Font weight</span>
        <input data-action="style-font-weight" type="number" value="${fontWeight}" />
      </div>
      <div class="field">
        <span>Font size</span>
        <input data-action="style-font-size" type="number" value="${fontSize}" />
      </div>
      <div class="field">
        <span>Line height</span>
        <input data-action="style-line-height" type="number" value="${lineHeight}" />
      </div>
      <div class="field">
        <span>Auto layout gap</span>
        <input data-action="style-gap" type="number" value="${gap}" />
      </div>
      <div class="field">
        <span>Padding (single value or comma tuple)</span>
        <input data-action="style-padding" value="${Array.isArray(padding) ? padding.join(',') : padding}" />
      </div>
    </section>
  `;
}

function bindInspectorEvents() {
  dom.inspector.querySelectorAll('input[data-action="component-name"]').forEach((input) => {
    input.addEventListener('input', (event) => {
      const value = (event.target as HTMLInputElement).value;
      updateSpec((draft) => {
        draft.name = value;
      });
    });
  });

  dom.inspector.querySelectorAll('input[data-action="variant-group-name"]').forEach((input) => {
    input.addEventListener('input', (event) => {
      const index = Number((event.target as HTMLElement).getAttribute('data-group-index'));
      const value = (event.target as HTMLInputElement).value;
      updateSpec((draft) => {
        draft.variantGroups[index].name = value;
      });
    });
  });

  dom.inspector.querySelectorAll('button[data-action="add-variant-group"]').forEach((button) => {
    button.addEventListener('click', () => {
      updateSpec((draft) => {
        draft.variantGroups.push({ name: 'variant', values: ['default'] });
      });
    });
  });

  dom.inspector.querySelectorAll('button[data-action="remove-variant-group"]').forEach((button) => {
    button.addEventListener('click', (event) => {
      const index = Number((event.target as HTMLElement).getAttribute('data-group-index'));
      updateSpec((draft) => {
        draft.variantGroups.splice(index, 1);
      });
    });
  });

  dom.inspector.querySelectorAll('button[data-action="add-variant-value"]').forEach((button) => {
    button.addEventListener('click', (event) => {
      const index = Number((event.target as HTMLElement).getAttribute('data-group-index'));
      updateSpec((draft) => {
        draft.variantGroups[index].values.push('value');
      });
    });
  });

  dom.inspector.querySelectorAll('button[data-action="remove-variant-value"]').forEach((button) => {
    button.addEventListener('click', (event) => {
      const groupIndex = Number((event.target as HTMLElement).getAttribute('data-group-index'));
      const valueIndex = Number((event.target as HTMLElement).getAttribute('data-value-index'));
      updateSpec((draft) => {
        draft.variantGroups[groupIndex].values.splice(valueIndex, 1);
      });
    });
  });

  dom.inspector.querySelectorAll('input[data-action="variant-value"]').forEach((input) => {
    input.addEventListener('input', (event) => {
      const target = event.target as HTMLInputElement;
      const groupIndex = Number(target.dataset.groupIndex);
      const valueIndex = Number(target.dataset.valueIndex);
      updateSpec((draft) => {
        draft.variantGroups[groupIndex].values[valueIndex] = target.value;
      });
    });
  });

  dom.inspector.querySelectorAll('button[data-action="select-state"]').forEach((button) => {
    button.addEventListener('click', (event) => {
      const index = Number((event.target as HTMLElement).getAttribute('data-state-index'));
      state.selection.stateIndex = index;
      render();
    });
  });

  dom.inspector.querySelectorAll('input[data-action="state-name"]').forEach((input) => {
    input.addEventListener('input', (event) => {
      const value = (event.target as HTMLInputElement).value;
      updateSpec((draft) => {
        draft.states[state.selection.stateIndex].name = value;
      });
    });
  });

  dom.inspector.querySelectorAll('input[data-action="state-selector"]').forEach((input) => {
    input.addEventListener('input', (event) => {
      const target = event.target as HTMLInputElement;
      const group = target.dataset.group!;
      const value = target.value.trim();
      updateSpec((draft) => {
        const stateSpec = draft.states[state.selection.stateIndex];
        stateSpec.appliesTo = stateSpec.appliesTo ?? {};
        if (value) {
          stateSpec.appliesTo![group] = value;
        } else {
          delete stateSpec.appliesTo![group];
        }
      });
    });
  });

  dom.inspector.querySelectorAll('button[data-action="add-state"]').forEach((button) => {
    button.addEventListener('click', () => {
      updateSpec((draft) => {
        draft.states.push({ name: `state-${draft.states.length + 1}`, style: {} });
      });
    });
  });

  dom.inspector.querySelectorAll('button[data-action="duplicate-state"]').forEach((button) => {
    button.addEventListener('click', () => {
      updateSpec((draft) => {
        const clone = deepCloneSpec(draft.states[state.selection.stateIndex]);
        clone.name = `${clone.name}-copy`;
        draft.states.splice(state.selection.stateIndex + 1, 0, clone);
      });
    });
  });

  dom.inspector.querySelectorAll('button[data-action="remove-state"]').forEach((button) => {
    button.addEventListener('click', () => {
      updateSpec((draft) => {
        draft.states.splice(state.selection.stateIndex, 1);
      });
      state.selection.stateIndex = Math.max(0, state.selection.stateIndex - 1);
      render();
    });
  });

  dom.inspector.querySelectorAll('button[data-action="add-prop"]').forEach((button) => {
    button.addEventListener('click', (event) => {
      const type = (event.target as HTMLElement).getAttribute('data-type') as keyof PropDefinitions;
      updateSpec((draft) => {
        draft.propDefinitions[type] = draft.propDefinitions[type] ?? {};
        const key = `prop${Object.keys(draft.propDefinitions[type]!).length + 1}`;
        (draft.propDefinitions[type] as any)[key] = { name: 'Property' };
      });
    });
  });

  dom.inspector.querySelectorAll('button[data-action="remove-prop"]').forEach((button) => {
    button.addEventListener('click', (event) => {
      const type = (event.target as HTMLElement).getAttribute('data-type') as keyof PropDefinitions;
      const key = (event.target as HTMLElement).getAttribute('data-prop')!;
      updateSpec((draft) => {
        delete draft.propDefinitions[type]?.[key];
      });
    });
  });

  dom.inspector.querySelectorAll('input[data-action="prop-name"]').forEach((input) => {
    input.addEventListener('input', (event) => {
      const type = (event.target as HTMLElement).getAttribute('data-type') as keyof PropDefinitions;
      const key = (event.target as HTMLElement).getAttribute('data-prop')!;
      const value = (event.target as HTMLInputElement).value;
      updateSpec((draft) => {
        draft.propDefinitions[type]![key].name = value;
      });
    });
  });

  dom.inspector.querySelectorAll('input[data-action="prop-default"]').forEach((input) => {
    input.addEventListener('input', (event) => {
      const type = (event.target as HTMLElement).getAttribute('data-type') as keyof PropDefinitions;
      const key = (event.target as HTMLElement).getAttribute('data-prop')!;
      const value = (event.target as HTMLInputElement).value;
      updateSpec((draft) => {
        (draft.propDefinitions[type]![key] as any).defaultValue = value;
      });
    });
  });

  dom.inspector.querySelectorAll('input[data-action="prop-key"]').forEach((input) => {
    input.addEventListener('change', (event) => {
      const type = (event.target as HTMLElement).getAttribute('data-type') as keyof PropDefinitions;
      const oldKey = (event.target as HTMLElement).getAttribute('data-prop')!;
      const newKey = (event.target as HTMLInputElement).value.trim();
      if (!newKey) return;
      updateSpec((draft) => {
        draft.propDefinitions[type]![newKey] = draft.propDefinitions[type]![oldKey];
        delete draft.propDefinitions[type]![oldKey];
      });
    });
  });

  dom.inspector.querySelectorAll('button[data-action="add-binding"]').forEach((button) => {
    button.addEventListener('click', () => {
      updateSpec((draft) => {
        draft.bindings.push({
          propName: Object.keys(draft.propDefinitions.boolean ?? {})[0] ?? 'prop',
          type: 'BOOLEAN',
          target: { kind: 'NODE', nodeId: draft.structure.id },
        });
      });
    });
  });

  dom.inspector.querySelectorAll('button[data-action="remove-binding"]').forEach((button) => {
    button.addEventListener('click', (event) => {
      const index = Number((event.target as HTMLElement).getAttribute('data-index'));
      updateSpec((draft) => {
        draft.bindings.splice(index, 1);
      });
    });
  });

  dom.inspector.querySelectorAll('button[data-action="bind-to-selection"]').forEach((button) => {
    button.addEventListener('click', (event) => {
      if (!state.selection.elementId) {
        showHint('Select an element in the preview before binding.', true);
        return;
      }
      const index = Number((event.target as HTMLElement).getAttribute('data-index'));
      updateSpec((draft) => {
        draft.bindings[index].target = { kind: 'NODE', nodeId: state.selection.elementId! };
      });
    });
  });

  dom.inspector.querySelectorAll('select[data-action="binding-type"]').forEach((select) => {
    select.addEventListener('change', (event) => {
      const index = Number((event.target as HTMLElement).getAttribute('data-index'));
      const value = (event.target as HTMLSelectElement).value as PropBinding['type'];
      updateSpec((draft) => {
        draft.bindings[index].type = value;
      });
    });
  });

  dom.inspector.querySelectorAll('input[data-action="binding-prop"]').forEach((input) => {
    input.addEventListener('input', (event) => {
      const index = Number((event.target as HTMLElement).getAttribute('data-index'));
      const value = (event.target as HTMLInputElement).value;
      updateSpec((draft) => {
        draft.bindings[index].propName = value;
      });
    });
  });

  dom.inspector.querySelectorAll('input[data-action^="style-"]').forEach((input) => {
    input.addEventListener('input', handleStyleInput);
  });
}

function handleStyleInput(event: Event) {
  const input = event.target as HTMLInputElement;
  const action = input.dataset.action!;
  updateSpec((draft) => {
    const stateSpec = draft.states[state.selection.stateIndex];
    const element = findElementById(draft.structure, state.selection.elementId) ?? draft.structure;
    const key = getElementStyleKey(stateSpec, element);
    if (key) {
      stateSpec.style.elements = stateSpec.style.elements ?? {};
      stateSpec.style.elements[key] = stateSpec.style.elements[key] ?? createEmptyElementStyle();
    }
    const targetStyle = key ? stateSpec.style.elements![key] : stateSpec.style;
    switch (action) {
      case 'style-fill':
        targetStyle.fills = input.value ? [{ type: 'SOLID', color: input.value }] : [];
        break;
      case 'style-stroke':
        targetStyle.strokes = input.value ? [{ type: 'SOLID', color: input.value, weight: 1 }] : [];
        break;
      case 'style-radius':
        targetStyle.cornerRadius = input.value ? Number(input.value) : undefined;
        break;
      case 'style-font-family':
        targetStyle.textStyle = targetStyle.textStyle ?? { fontFamily: 'Inter', fontSize: 14 };
        targetStyle.textStyle.fontFamily = input.value;
        break;
      case 'style-font-weight':
        targetStyle.textStyle = targetStyle.textStyle ?? { fontFamily: 'Inter', fontSize: 14 };
        targetStyle.textStyle.fontWeight = Number(input.value) || 400;
        break;
      case 'style-font-size':
        targetStyle.textStyle = targetStyle.textStyle ?? { fontFamily: 'Inter', fontSize: 14 };
        targetStyle.textStyle.fontSize = Number(input.value) || 14;
        break;
      case 'style-line-height':
        targetStyle.textStyle = targetStyle.textStyle ?? { fontFamily: 'Inter', fontSize: 14 };
        targetStyle.textStyle.lineHeight = Number(input.value) || undefined;
        break;
      case 'style-gap':
        stateSpec.style.layout = stateSpec.style.layout ?? {};
        stateSpec.style.layout.autolayout = stateSpec.style.layout.autolayout ?? {};
        stateSpec.style.layout.autolayout.gap = Number(input.value) || undefined;
        break;
      case 'style-padding':
        stateSpec.style.layout = stateSpec.style.layout ?? {};
        stateSpec.style.layout.autolayout = stateSpec.style.layout.autolayout ?? {};
        stateSpec.style.layout.autolayout.padding = parsePadding(input.value);
        break;
      default:
        break;
    }
  });
}

function parsePadding(value: string): number | [number, number, number, number] | undefined {
  if (!value) return undefined;
  if (value.includes(',')) {
    const parts = value.split(',').map((part) => Number(part.trim()) || 0);
    if (parts.length === 4) {
      return [parts[0], parts[1], parts[2], parts[3]];
    }
  }
  const numeric = Number(value);
  return Number.isFinite(numeric) ? numeric : undefined;
}

function renderValidation() {
  let section = dom.inspector.querySelector('#validation-section') as HTMLElement | null;
  if (!section) {
    section = document.createElement('section');
    section.classList.add('section');
    section.id = 'validation-section';
    section.innerHTML = '<h2>Validation</h2><div class="validation-list"></div>';
    dom.inspector.appendChild(section);
  }
  const list = section.querySelector('.validation-list') as HTMLDivElement;
  if (!state.validation) {
    list.innerHTML = '<div class="validation-item">No validation info.</div>';
    return;
  }
  list.innerHTML = [
    ...state.validation.errors.map((issue) => `<div class="validation-item error">${issue.message}</div>`),
    ...state.validation.warnings.map((issue) => `<div class="validation-item warning">${issue.message}</div>`),
  ].join('');
}

function showHint(message: string, isError = false) {
  dom.previewHint.textContent = message;
  dom.previewHint.style.color = isError ? '#d64545' : 'var(--muted)';
}

function applyTheme(theme: ThemeName) {
  document.body.classList.remove('theme-light', 'theme-dark');
  document.body.classList.add(`theme-${theme}`);
}

function postMessage(message: UIToPluginMessage) {
  port.postMessage({ pluginMessage: message }, '*');
}

function stateKey(stateSpec: StateSpec): string {
  if (stateSpec.appliesTo) {
    return Object.entries(stateSpec.appliesTo)
      .map(([group, value]) => `${group}:${value}`)
      .join('|');
  }
  return stateSpec.name;
}

function getBindingForElement(element: ElementSpec, type: PropBinding['type']): PropBinding | undefined {
  return state.spec.bindings.find((binding) => {
    if (binding.type !== type) return false;
    if (binding.target.kind === 'NODE') {
      return binding.target.nodeId === element.id;
    }
    return element.role ? binding.target.role === element.role : false;
  });
}

function describeBindingTarget(binding: PropBinding): string {
  if (binding.target.kind === 'NODE') {
    return `Node • ${binding.target.nodeId}`;
  }
  return `Role • ${binding.target.role}`;
}

interface PropValueCollection {
  boolean?: Record<string, boolean>;
  text?: Record<string, string>;
  swap?: Record<string, string>;
}

function resolvePropValues(spec: ComponentSpec, states: StateSpec[]): PropValueCollection {
  const result: PropValueCollection = {
    boolean: {},
    text: {},
    swap: {},
  };
  const applyValues = (values?: PropValueCollection) => {
    if (!values) return;
    if (values.boolean) Object.assign(result.boolean!, values.boolean);
    if (values.text) Object.assign(result.text!, values.text);
    if (values.swap) Object.assign(result.swap!, values.swap);
  };
  applyValues({
    boolean: extractDefaultBooleanValues(spec.propDefinitions),
    text: extractDefaultTextValues(spec.propDefinitions),
    swap: extractDefaultSwapValues(spec.propDefinitions),
  });
  states.forEach((stateSpec) => applyValues(stateSpec.propValues));
  return result;
}

function extractDefaultBooleanValues(defs: PropDefinitions): Record<string, boolean> {
  const result: Record<string, boolean> = {};
  if (defs.boolean) {
    Object.entries(defs.boolean).forEach(([key, def]) => {
      result[key] = def.defaultValue ?? false;
    });
  }
  return result;
}

function extractDefaultTextValues(defs: PropDefinitions): Record<string, string> {
  const result: Record<string, string> = {};
  if (defs.text) {
    Object.entries(defs.text).forEach(([key, def]) => {
      result[key] = def.defaultValue ?? '';
    });
  }
  return result;
}

function extractDefaultSwapValues(defs: PropDefinitions): Record<string, string> {
  const result: Record<string, string> = {};
  if (defs.swap) {
    Object.entries(defs.swap).forEach(([key, def]) => {
      if (def.defaultComponentKey) {
        result[key] = def.defaultComponentKey;
      }
    });
  }
  return result;
}

function createEmptyElementStyle() {
  return {} as any;
}

function getElementStyleForState(state: StateSpec, element: ElementSpec) {
  if (!state.style.elements) return undefined;
  return state.style.elements[element.role ?? element.id] ?? state.style.elements[element.id];
}

function getElementStyleKey(state: StateSpec, element: ElementSpec): string | null {
  if (!element.role && !element.id) return null;
  if (state.style.elements?.[element.id]) return element.id;
  if (element.role && state.style.elements?.[element.role]) return element.role;
  return element.role ?? element.id;
}

function findElementById(root: ElementSpec, id: string | null): ElementSpec | null {
  if (!id) return null;
  const stack: ElementSpec[] = [root];
  while (stack.length) {
    const node = stack.pop()!;
    if (node.id === id) return node;
    node.children?.forEach((child) => stack.push(child));
  }
  return null;
}

