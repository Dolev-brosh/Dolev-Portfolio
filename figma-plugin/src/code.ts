import uiHtml from './ui.html';
import {
  ComponentSpec,
  ElementSpec,
  GeneratedComponentResult,
  PluginToUIMessage,
  PropBinding,
  PropDefinitions,
  StateSpec,
  UIToPluginMessage,
  VariantCombination,
  VariantGroupSpec,
} from './types';
import {
  generateVariantCombinations,
  normalizeVariantValue,
  validateSpec,
  variantMatchesSelector,
  flattenElements,
} from './utils/spec';

const STORAGE_KEY = 'component-forge/spec';

figma.showUI(uiHtml, { width: 1180, height: 760, themeColors: true });

loadSpecFromStorage().then((spec) => {
  const message: PluginToUIMessage = { type: 'spec-loaded', spec };
  figma.ui.postMessage(message);
});

figma.on('themechange', ({ theme }) => {
  const message: PluginToUIMessage = { type: 'theme-change', theme: theme as any };
  figma.ui.postMessage(message);
});

figma.ui.onmessage = async (msg: UIToPluginMessage) => {
  switch (msg.type) {
    case 'ui-ready': {
      const spec = await loadSpecFromStorage();
      figma.ui.postMessage({ type: 'spec-loaded', spec });
      break;
    }
    case 'request-load': {
      const spec = await loadSpecFromStorage();
      figma.ui.postMessage({ type: 'spec-loaded', spec });
      break;
    }
    case 'request-save': {
      const validation = validateSpec(msg.spec);
      figma.ui.postMessage({ type: 'validation-result', result: validation });
      if (!validation.ok) {
        figma.ui.postMessage({
          type: 'save-error',
          error: 'Specification is invalid. Resolve validation errors and try again.',
        });
        return;
      }
      await saveSpecToStorage(msg.spec);
      figma.ui.postMessage({ type: 'save-success', spec: msg.spec });
      break;
    }
    case 'request-create': {
      try {
        const validation = validateSpec(msg.spec);
        figma.ui.postMessage({ type: 'validation-result', result: validation });
        if (!validation.ok) {
          figma.ui.postMessage({
            type: 'create-error',
            error: 'Specification is invalid. Fix errors before creating components.',
          });
          return;
        }
        if (
          validation.warnings.some((warning) => warning.code === 'variant.count.large') &&
          !msg.options?.confirmLargeVariantCount
        ) {
          figma.ui.postMessage({
            type: 'create-error',
            error: 'Large variant count detected. Confirm generation from the UI.',
          });
          return;
        }
        const result = await createComponentFromSpec(msg.spec);
        figma.ui.postMessage({
          type: 'create-success',
          componentId: result.mainComponent.id,
          setId: result.componentSet?.id,
        });
        await saveSpecToStorage(msg.spec);
      } catch (error: any) {
        console.error('Failed to create component set', error);
        figma.ui.postMessage({
          type: 'create-error',
          error: error?.message ?? 'Unexpected error while creating component.',
        });
      }
      break;
    }
    case 'notify-theme': {
      figma.ui.postMessage({ type: 'theme-change', theme: msg.theme });
      break;
    }
    default:
      break;
  }
};

async function saveSpecToStorage(spec: ComponentSpec): Promise<void> {
  await figma.clientStorage.setAsync(STORAGE_KEY, spec);
}

async function loadSpecFromStorage(): Promise<ComponentSpec | null> {
  const stored = await figma.clientStorage.getAsync(STORAGE_KEY);
  if (!stored) return null;
  return stored as ComponentSpec;
}

async function createComponentFromSpec(spec: ComponentSpec): Promise<GeneratedComponentResult> {
  const combinations = generateVariantCombinations(spec.variantGroups);
  const assetsFrame = ensureAssetsFrame();
  const textFonts = collectFonts(spec);
  await Promise.all(
    textFonts.map((font) =>
      figma.loadFontAsync(font).catch((error) => {
        console.warn(`Failed to load font ${font.family} / ${font.style}`, error);
      }),
    ),
  );

  const components: ComponentNode[] = [];
  let mainComponent: ComponentNode | null = null;
  const propertyDefinitions = createPropertyDefinitions(spec.propDefinitions);

  for (const combination of combinations) {
    const component = figma.createComponent();
    component.name = buildVariantName(spec.name, combination);
    applyBaseComponentLayout(component, spec.structure);

    const context = createBuildContext(assetsFrame);
    context.nodeByElementId.set(spec.structure.id, component);
    if (spec.structure.role) {
      context.nodesByRole.set(spec.structure.role, [component]);
    }
    applyElementStyling(component, spec.structure);
    const rootChildren = buildChildren(spec.structure, component, context);
    rootChildren.forEach((child) => component.appendChild(child));

    if (spec.baseStyle) {
      applyStyle(component, spec.structure, spec.baseStyle, context);
    }

    const activeStates = resolveStatesForCombination(spec.states, combination);
    activeStates.forEach((state) => {
      applyStyle(component, spec.structure, state.style, context);
    });

    const propValues = resolvePropValues(spec, activeStates);

    defineComponentProperties(component, propertyDefinitions);
    applyBindings(component, context, spec.bindings);
    applyPropValues(component, propValues);
    applyVariantSelection(component, combination);

    component.x = 0;
    component.y = 0;

    components.push(component);
    if (!mainComponent) {
      mainComponent = component;
    }
  }

  let componentSet: ComponentSetNode | undefined;
  if (components.length > 1) {
    componentSet = combineAsVariants(components, spec.variantGroups);
  }

  const frame = wrapInFrame(componentSet ?? components[0], spec.name);
  figma.currentPage.appendChild(frame);
  frame.x = figma.viewport.center.x - frame.width / 2;
  frame.y = figma.viewport.center.y - frame.height / 2;
  figma.currentPage.selection = [frame];
  figma.viewport.scrollAndZoomIntoView([frame]);

  return {
    mainComponent: mainComponent!,
    componentSet,
    allComponents: components,
  };
}

function createBuildContext(assetsFrame: FrameNode): BuildContext {
  return {
    nodeByElementId: new Map(),
    nodesByRole: new Map(),
    assetsFrame,
    iconMaster: ensureIconMaster(assetsFrame),
  };
}

interface BuildContext {
  nodeByElementId: Map<string, SceneNode>;
  nodesByRole: Map<string, SceneNode[]>;
  assetsFrame: FrameNode;
  iconMaster: ComponentNode;
}

function applyVariantSelection(component: ComponentNode, combination: VariantCombination) {
  const sanitized: Record<string, string> = {};
  Object.entries(combination).forEach(([key, value]) => {
    sanitized[key] = normalizeVariantValue(value);
  });
  if (Object.keys(sanitized).length) {
    component.setVariantProperties(sanitized);
  }
}

function applyPropValues(component: ComponentNode, values: PropValueCollection) {
  const collected: Record<string, string | boolean> = {};
  if (values.boolean) {
    Object.entries(values.boolean).forEach(([key, value]) => {
      collected[key] = value;
    });
  }
  if (values.text) {
    Object.entries(values.text).forEach(([key, value]) => {
      collected[key] = value;
    });
  }
  if (values.swap) {
    Object.entries(values.swap).forEach(([key, value]) => {
      collected[key] = value;
    });
  }
  if (Object.keys(collected).length) {
    component.setProperties(collected);
  }
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
  const addValues = (values?: PropValueCollection) => {
    if (!values) return;
    if (values.boolean) Object.assign(result.boolean!, values.boolean);
    if (values.text) Object.assign(result.text!, values.text);
    if (values.swap) Object.assign(result.swap!, values.swap);
  };

  addValues({
    boolean: extractDefaultBooleanValues(spec.propDefinitions),
    text: extractDefaultTextValues(spec.propDefinitions),
    swap: extractDefaultSwapValues(spec.propDefinitions),
  });

  states.forEach((state) => addValues(state.propValues));

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

function resolveStatesForCombination(states: StateSpec[], combination: VariantCombination): StateSpec[] {
  const matches = states.filter((state) => variantMatchesSelector(combination, state.appliesTo));
  return matches;
}

function applyBindings(component: ComponentNode, context: BuildContext, bindings: PropBinding[]) {
  bindings.forEach((binding) => {
    const target = resolveTargetNode(binding, context);
    if (!target) {
      console.warn(`Binding target not found for property ${binding.propName}`);
      return;
    }
    const references = (target as any).componentPropertyReferences ?? {};
    if (binding.type === 'BOOLEAN') {
      references.visibility = binding.propName;
    } else if (binding.type === 'TEXT') {
      references.characters = binding.propName;
    } else if (binding.type === 'INSTANCE_SWAP') {
      references.mainComponent = binding.propName;
    }
    (target as any).componentPropertyReferences = references;
  });
}

function resolveTargetNode(binding: PropBinding, context: BuildContext): SceneNode | undefined {
  if (binding.target.kind === 'NODE') {
    return context.nodeByElementId.get(binding.target.nodeId);
  }
  const nodes = context.nodesByRole.get(binding.target.role);
  return nodes ? nodes[0] : undefined;
}

function defineComponentProperties(
  component: ComponentNode,
  definitions: ComponentPropertyDefinitions,
): void {
  component.componentPropertyDefinitions = JSON.parse(JSON.stringify(definitions));
}

type ComponentPropertyDefinitions = ComponentNode['componentPropertyDefinitions'];

function createPropertyDefinitions(defs: PropDefinitions): ComponentPropertyDefinitions {
  const definitions: ComponentPropertyDefinitions = {};
  if (defs.boolean) {
    Object.entries(defs.boolean).forEach(([propName, def]) => {
      definitions[propName] = {
        type: 'BOOLEAN',
        defaultValue: def.defaultValue ?? false,
        description: def.description,
      };
    });
  }
  if (defs.text) {
    Object.entries(defs.text).forEach(([propName, def]) => {
      definitions[propName] = {
        type: 'TEXT',
        defaultValue: def.defaultValue ?? '',
        description: def.description,
      };
    });
  }
  if (defs.swap) {
    Object.entries(defs.swap).forEach(([propName, def]) => {
      definitions[propName] = {
        type: 'INSTANCE_SWAP',
        defaultValue: def.defaultComponentKey ?? null,
        description: def.description,
      } as any;
    });
  }
  return definitions;
}

function applyBaseComponentLayout(component: ComponentNode, spec: ElementSpec) {
  component.resizeWithoutConstraints(200, 48);
  if (spec.layout) {
    applyAutoLayout(component, spec.layout);
  } else {
    component.layoutMode = 'NONE';
  }
}

function buildChildren(
  element: ElementSpec,
  parent: FrameNode,
  context: BuildContext,
): SceneNode[] {
  if (!element.children) return [];
  return element.children.map((childSpec) => buildNodeFromSpec(childSpec, context));
}

function buildNodeFromSpec(spec: ElementSpec, context: BuildContext): SceneNode {
  let node: SceneNode;
  switch (spec.type) {
    case 'FRAME':
      node = figma.createFrame();
      applyAutoLayout(node, spec.layout);
      break;
    case 'RECTANGLE':
      node = figma.createRectangle();
      break;
    case 'ELLIPSE':
      node = figma.createEllipse();
      break;
    case 'TEXT': {
      const textNode = figma.createText();
      textNode.characters = spec.text?.default ?? '';
      node = textNode;
      break;
    }
    case 'ICON': {
      node = createIconInstance(spec, context);
      break;
    }
    default:
      node = figma.createFrame();
      break;
  }

  node.name = spec.name;
  applyElementStyling(node, spec);
  if (spec.children && 'appendChild' in node) {
    const parent = node as FrameNode;
    spec.children.forEach((child) => {
      const childNode = buildNodeFromSpec(child, context);
      parent.appendChild(childNode);
    });
  }

  context.nodeByElementId.set(spec.id, node);
  if (spec.role) {
    const collection = context.nodesByRole.get(spec.role) ?? [];
    collection.push(node);
    context.nodesByRole.set(spec.role, collection);
  }

  return node;
}

function applyElementStyling(node: SceneNode, spec: ElementSpec) {
  if ('fills' in node && spec.fills) {
    (node as GeometryMixin).fills = spec.fills.map(convertFill);
  }
  if ('strokes' in node && spec.strokes) {
    (node as GeometryMixin).strokes = spec.strokes.map(convertStroke);
  }
  if ('cornerRadius' in node && typeof spec.cornerRadius !== 'undefined') {
    applyCornerRadius(node as GeometryMixin, spec.cornerRadius);
  }
  if ('effects' in node && spec.effects) {
    (node as GeometryMixin).effects = spec.effects.map(convertEffect);
  }
  if ('visible' in node && spec.defaultVisible === false) {
    (node as SceneNode).visible = false;
  }
  if ('layoutMode' in node && spec.layout) {
    applyAutoLayout(node as FrameNode, spec.layout);
  }
  if (spec.size) {
    applySize(node, spec.size);
  }
}

function applyStyle(
  component: ComponentNode | FrameNode,
  structure: ElementSpec,
  style: StateSpec['style'],
  context: BuildContext,
) {
  applyStyleToNode(component, style);
  if (style.elements) {
    Object.entries(style.elements).forEach(([target, elementStyle]) => {
      const byId = context.nodeByElementId.get(target);
      const byRole = context.nodesByRole.get(target)?.[0];
      const node = byId ?? byRole;
      if (!node) return;
      applyElementStyle(node, elementStyle);
    });
  }
}

function applyStyleToNode(node: SceneNode, style: StateSpec['style']) {
  if (style.fills && 'fills' in node) {
    (node as GeometryMixin).fills = style.fills.map(convertFill);
  }
  if (style.strokes && 'strokes' in node) {
    (node as GeometryMixin).strokes = style.strokes.map(convertStroke);
  }
  if (typeof style.cornerRadius !== 'undefined' && 'cornerRadius' in node) {
    applyCornerRadius(node as GeometryMixin, style.cornerRadius);
  }
  if (style.effects && 'effects' in node) {
    (node as GeometryMixin).effects = style.effects.map(convertEffect);
  }
  if (style.textStyle && node.type === 'TEXT') {
    applyTextStyle(node as TextNode, style.textStyle);
  }
  if (style.layout?.autolayout && 'layoutMode' in node) {
    applyAutoLayout(node as FrameNode, {
      direction: (node as FrameNode).layoutMode === 'HORIZONTAL' ? 'HORIZONTAL' : 'VERTICAL',
      gap: style.layout.autolayout.gap ?? (node as FrameNode).itemSpacing,
      padding: style.layout.autolayout.padding ?? collectPadding(node as FrameNode),
      alignment: mapAlign(style.layout.autolayout.align ?? 'start'),
    });
  }
  if (style.layout?.size) {
    applySize(node, style.layout.size);
  }
}

function applyElementStyle(node: SceneNode, style: any) {
  if (style.fills && 'fills' in node) {
    (node as GeometryMixin).fills = style.fills.map(convertFill);
  }
  if (style.strokes && 'strokes' in node) {
    (node as GeometryMixin).strokes = style.strokes.map(convertStroke);
  }
  if (typeof style.cornerRadius !== 'undefined' && 'cornerRadius' in node) {
    applyCornerRadius(node as GeometryMixin, style.cornerRadius);
  }
  if (style.effects && 'effects' in node) {
    (node as GeometryMixin).effects = style.effects.map(convertEffect);
  }
  if (typeof style.visible !== 'undefined') {
    node.visible = style.visible;
  }
  if (style.textStyle && node.type === 'TEXT') {
    applyTextStyle(node as TextNode, style.textStyle);
  }
}

function collectPadding(node: FrameNode): [number, number, number, number] {
  return [node.paddingTop, node.paddingRight, node.paddingBottom, node.paddingLeft];
}

function mapAlign(value: 'start' | 'center' | 'end' | 'space-between'): 'START' | 'CENTER' | 'END' | 'SPACE_BETWEEN' {
  switch (value) {
    case 'center':
      return 'CENTER';
    case 'end':
      return 'END';
    case 'space-between':
      return 'SPACE_BETWEEN';
    default:
      return 'START';
  }
}

function applyAutoLayout(node: FrameNode, layout?: ElementSpec['layout']) {
  if (!layout) {
    node.layoutMode = 'NONE';
    return;
  }
  node.layoutMode = layout.direction;
  node.primaryAxisSizingMode = 'AUTO';
  node.counterAxisSizingMode = 'AUTO';
  node.itemSpacing = layout.gap ?? node.itemSpacing;
  const padding = Array.isArray(layout.padding)
    ? layout.padding
    : [layout.padding ?? 0, layout.padding ?? 0, layout.padding ?? 0, layout.padding ?? 0];
  node.paddingTop = padding[0];
  node.paddingRight = padding[1];
  node.paddingBottom = padding[2];
  node.paddingLeft = padding[3];
  const align = layout.alignment ?? 'START';
  const primaryAlign = mapFigmaAlign(align);
  const counterAlign = align === 'SPACE_BETWEEN' ? 'CENTER' : align;
  if (node.layoutMode === 'HORIZONTAL') {
    node.primaryAxisAlignItems = primaryAlign;
    node.counterAxisAlignItems = mapFigmaAlign(counterAlign);
  } else if (node.layoutMode === 'VERTICAL') {
    node.primaryAxisAlignItems = primaryAlign;
    node.counterAxisAlignItems = mapFigmaAlign(counterAlign);
  }
}

function mapFigmaAlign(value: 'START' | 'CENTER' | 'END' | 'SPACE_BETWEEN'): 'MIN' | 'CENTER' | 'MAX' | 'SPACE_BETWEEN' {
  switch (value) {
    case 'CENTER':
      return 'CENTER';
    case 'END':
      return 'MAX';
    case 'SPACE_BETWEEN':
      return 'SPACE_BETWEEN';
    default:
      return 'MIN';
  }
}

function applySize(node: SceneNode, size: ElementSpec['size']) {
  const width = size?.width ?? size?.minWidth ?? node.width;
  const height = size?.height ?? size?.minHeight ?? node.height;
  if ('resizeWithoutConstraints' in node) {
    (node as LayoutMixin).resizeWithoutConstraints(width, height);
  }
}

function applyCornerRadius(node: GeometryMixin, radius: any) {
  if (typeof radius === 'number') {
    node.cornerRadius = radius;
  } else {
    node.topLeftRadius = radius.tl;
    node.topRightRadius = radius.tr;
    node.bottomRightRadius = radius.br;
    node.bottomLeftRadius = radius.bl;
  }
}

function convertFill(fill: any): Paint {
  const rgba = parseColor(fill.color);
  return {
    type: 'SOLID',
    color: { r: rgba.r, g: rgba.g, b: rgba.b },
    opacity: fill.opacity ?? rgba.a,
  } as SolidPaint;
}

function convertStroke(stroke: any): Paint {
  const rgba = parseColor(stroke.color);
  return {
    type: 'SOLID',
    color: { r: rgba.r, g: rgba.g, b: rgba.b },
    opacity: stroke.opacity ?? rgba.a,
  } as SolidPaint;
}

function convertEffect(effect: any): Effect {
  if (effect.type === 'DROP_SHADOW' || effect.type === 'INNER_SHADOW') {
    const rgba = parseColor(effect.color);
    return {
      type: effect.type,
      radius: effect.radius,
      offset: effect.offset,
      spread: effect.spread ?? 0,
      visible: true,
      blendMode: 'NORMAL',
      color: { r: rgba.r, g: rgba.g, b: rgba.b, a: effect.opacity ?? rgba.a },
    } as ShadowEffect;
  }
  return {
    type: effect.type,
    radius: effect.radius,
    visible: true,
  } as BlurEffect;
}

function parseColor(color: string): { r: number; g: number; b: number; a: number } {
  if (color.startsWith('#')) {
    const hex = color.replace('#', '');
    const normalized = hex.length === 3
      ? hex
          .split('')
          .map((char) => char + char)
          .join('')
      : hex;
    const int = parseInt(normalized, 16);
    const r = (int >> 16) & 255;
    const g = (int >> 8) & 255;
    const b = int & 255;
    return { r: r / 255, g: g / 255, b: b / 255, a: 1 };
  }
  const rgbaMatch = color.match(/rgba?\(([^)]+)\)/);
  if (rgbaMatch) {
    const parts = rgbaMatch[1].split(',').map((part) => part.trim());
    const r = Number(parts[0]) / 255;
    const g = Number(parts[1]) / 255;
    const b = Number(parts[2]) / 255;
    const a = parts[3] ? Number(parts[3]) : 1;
    return { r, g, b, a };
  }
  return { r: 0, g: 0, b: 0, a: 1 };
}

function createIconInstance(spec: ElementSpec, context: BuildContext): InstanceNode {
  const iconInstance = context.iconMaster.createInstance();
  if (spec.size) {
    iconInstance.resizeWithoutConstraints(spec.size.width ?? 16, spec.size.height ?? 16);
  }
  if (spec.fills) {
    iconInstance.children.forEach((child) => {
      if ('fills' in child) {
        (child as GeometryMixin).fills = spec.fills!.map(convertFill);
      }
    });
  }
  iconInstance.visible = spec.defaultVisible ?? true;
  return iconInstance;
}

function ensureIconMaster(assets: FrameNode): ComponentNode {
  const existing = assets.findOne((node) => node.type === 'COMPONENT' && node.name === 'Component Forge • Icon Placeholder');
  if (existing) {
    return existing as ComponentNode;
  }
  const base = figma.createComponent();
  base.name = 'Component Forge • Icon Placeholder';
  base.resizeWithoutConstraints(16, 16);
  const rect = figma.createRectangle();
  rect.resizeWithoutConstraints(16, 16);
  rect.fills = [
    {
      type: 'SOLID',
      color: { r: 1, g: 1, b: 1 },
      opacity: 1,
    },
  ];
  base.appendChild(rect);
  assets.appendChild(base);
  return base;
}

function ensureAssetsFrame(): FrameNode {
  const existing = figma.currentPage.findOne(
    (node) => node.type === 'FRAME' && node.name === 'Component Forge • Assets',
  );
  if (existing) {
    return existing as FrameNode;
  }
  const frame = figma.createFrame();
  frame.name = 'Component Forge • Assets';
  frame.visible = false;
  frame.locked = true;
  frame.x = -2000;
  frame.y = -2000;
  frame.resizeWithoutConstraints(1, 1);
  frame.fills = [];
  figma.currentPage.appendChild(frame);
  return frame;
}

function buildVariantName(baseName: string, combination: VariantCombination): string {
  const parts = Object.entries(combination).map(
    ([group, value]) => `${group}=${normalizeVariantValue(value)}`,
  );
  if (!parts.length) {
    return baseName;
  }
  return `${baseName} / ${parts.join(', ')}`;
}

function combineAsVariants(
  components: ComponentNode[],
  groups: VariantGroupSpec[],
): ComponentSetNode {
  const set = figma.combineAsVariants(components, figma.currentPage);
  set.name = components[0].name.split(' / ')[0];
  applyVariantGroups(set, groups);
  return set;
}

function applyVariantGroups(set: ComponentSetNode, groups: VariantGroupSpec[]): void {
  const config: ComponentSetVariantGroupProperties = {};
  groups.forEach((group) => {
    config[group.name] = {
      values: group.values.map((value) => normalizeVariantValue(value)),
    };
  });
  set.variantGroupProperties = config;
}

function wrapInFrame(node: SceneNode, name: string): FrameNode {
  const frame = figma.createFrame();
  frame.name = `${name} • Generated`;
  frame.layoutMode = 'VERTICAL';
  frame.primaryAxisSizingMode = 'AUTO';
  frame.counterAxisSizingMode = 'AUTO';
  frame.itemSpacing = 24;
  frame.paddingTop = 32;
  frame.paddingBottom = 32;
  frame.paddingLeft = 32;
  frame.paddingRight = 32;
  frame.fills = [];
  frame.strokes = [];
  frame.appendChild(node);
  return frame;
}

function collectFonts(spec: ComponentSpec): FontName[] {
  const fonts = new Map<string, FontName>();
  const registerFont = (family: string, weight?: number) => {
    const key = `${family}-${weight ?? 400}`;
    fonts.set(key, {
      family,
      style: weightToStyle(weight),
    });
  };

  flattenElements(spec.structure)
    .filter((element) => element.type === 'TEXT')
    .forEach((element) => {
      registerFont(element.text?.default ? 'Inter' : 'Inter');
    });

  const inspectStyle = (style?: StateSpec['style']) => {
    if (!style) return;
    if (style.textStyle) {
      registerFont(style.textStyle.fontFamily, style.textStyle.fontWeight);
    }
    if (style.elements) {
      Object.values(style.elements).forEach((elementStyle) => {
        if (elementStyle.textStyle) {
          registerFont(elementStyle.textStyle.fontFamily, elementStyle.textStyle.fontWeight);
        }
      });
    }
  };

  inspectStyle(spec.baseStyle);
  spec.states.forEach((state) => inspectStyle(state.style));

  return Array.from(fonts.values());
}

function weightToStyle(weight?: number): string {
  if (!weight) return 'Regular';
  if (weight >= 900) return 'Black';
  if (weight >= 800) return 'Extra Bold';
  if (weight >= 700) return 'Bold';
  if (weight >= 600) return 'Semi Bold';
  if (weight >= 500) return 'Medium';
  if (weight >= 400) return 'Regular';
  if (weight >= 300) return 'Light';
  if (weight >= 200) return 'Extra Light';
  return 'Thin';
}

function applyTextStyle(node: TextNode, style: any) {
  node.fontName = {
    family: style.fontFamily,
    style: weightToStyle(style.fontWeight),
  };
  node.fontSize = style.fontSize;
  if (style.lineHeight) {
    node.lineHeight = { unit: 'PIXELS', value: style.lineHeight };
  } else {
    node.lineHeight = { unit: 'AUTO' };
  }
  if (typeof style.letterSpacing !== 'undefined') {
    node.letterSpacing = { unit: 'PERCENT', value: style.letterSpacing };
  }
}
