/**
 * Shared type definitions for the Component Forge plugin.
 * These types are imported by both the plugin controller (code.ts)
 * and the WebView UI (ui.ts). The definitions follow the contract
 * described in the product requirements and are intentionally verbose
 * to provide strong compile-time guarantees when manipulating the
 * component specification object.
 */

export type TemplateId = 'button' | 'dropdown' | 'toggle' | 'badge' | 'custom';

export type NodeKind = 'FRAME' | 'TEXT' | 'RECTANGLE' | 'ICON' | 'ELLIPSE';

export type ThemeName = 'light' | 'dark';

/**
 * A logical node in the component template tree.
 */
export interface ElementSpec {
  id: string;
  name: string;
  type: NodeKind;
  role?: string;
  defaultVisible?: boolean;
  layout?: AutoLayoutSpec;
  size?: SizeSpec;
  fills?: FillSpec[];
  strokes?: StrokeSpec[];
  cornerRadius?: CornerRadiusSpec;
  effects?: EffectSpec[];
  text?: TextContentSpec;
  children?: ElementSpec[];
}

export interface TextContentSpec {
  default: string;
  placeholder?: string;
}

export interface AutoLayoutSpec {
  direction: 'HORIZONTAL' | 'VERTICAL';
  gap: number;
  padding: FourSideSize | number;
  alignment: 'START' | 'CENTER' | 'END' | 'SPACE_BETWEEN';
}

export type CornerRadiusSpec = number | {
  tl: number;
  tr: number;
  br: number;
  bl: number;
};

export type FourSideSize = [number, number, number, number];

export interface SizeSpec {
  width?: number;
  height?: number;
  minWidth?: number;
  minHeight?: number;
}

export interface FillSpec {
  type: 'SOLID';
  color: string; // HEX or rgba string
  opacity?: number;
}

export interface StrokeSpec {
  type: 'SOLID';
  color: string;
  weight: number;
  opacity?: number;
}

export type EffectSpec =
  | {
      type: 'DROP_SHADOW' | 'INNER_SHADOW';
      offset: { x: number; y: number };
      radius: number;
      spread?: number;
      color: string;
      opacity?: number;
    }
  | {
      type: 'LAYER_BLUR' | 'BACKGROUND_BLUR';
      radius: number;
    };

export interface TextStyleSpec {
  fontFamily: string;
  fontSize: number;
  lineHeight?: number;
  fontWeight?: number;
  letterSpacing?: number;
}

export interface AutoLayoutOverrideSpec {
  padding?: FourSideSize | number;
  gap?: number;
  align?: 'start' | 'center' | 'end' | 'space-between';
}

export interface LayoutOverrideSpec {
  autolayout?: AutoLayoutOverrideSpec;
  size?: SizeSpec;
}

export interface StyleSpec {
  fills?: FillSpec[];
  strokes?: StrokeSpec[];
  cornerRadius?: CornerRadiusSpec;
  effects?: EffectSpec[];
  textStyle?: TextStyleSpec;
  layout?: LayoutOverrideSpec;
  elements?: Record<string, ElementStyleSpec>;
}

export interface ElementStyleSpec {
  fills?: FillSpec[];
  strokes?: StrokeSpec[];
  cornerRadius?: CornerRadiusSpec;
  effects?: EffectSpec[];
  textStyle?: TextStyleSpec;
  visible?: boolean;
}

export interface VariantGroupSpec {
  name: string;
  values: string[];
  description?: string;
}

export interface PropDefinitions {
  boolean?: Record<string, BooleanPropDef>;
  text?: Record<string, TextPropDef>;
  swap?: Record<string, InstanceSwapPropDef>;
}

export interface BooleanPropDef {
  name: string;
  description?: string;
  defaultValue?: boolean;
}

export interface TextPropDef {
  name: string;
  description?: string;
  defaultValue?: string;
  placeholder?: string;
}

export interface InstanceSwapPropDef {
  name: string;
  description?: string;
  defaultComponentKey?: string;
  libraryName?: string;
}

export interface PropValueMap {
  boolean?: Record<string, boolean>;
  text?: Record<string, string>;
  swap?: Record<string, string>;
  variant?: Record<string, string>;
}

export interface StateSpec {
  name: string;
  label?: string;
  appliesTo?: VariantSelector;
  style: StyleSpec;
  propValues?: PropValueMap;
}

export type VariantSelector = Record<string, string>;

export interface PropBinding {
  propName: string;
  type: 'BOOLEAN' | 'TEXT' | 'INSTANCE_SWAP';
  target: NodeRef | RoleRef;
}

export interface NodeRef {
  kind: 'NODE';
  nodeId: string;
}

export interface RoleRef {
  kind: 'ROLE';
  role: string;
}

export interface DesignTokensRef {
  colors?: Record<string, string>;
  textStyles?: Record<string, TextStyleSpec>;
}

export interface ComponentSpec {
  name: string;
  template: TemplateId;
  structure: ElementSpec;
  variantGroups: VariantGroupSpec[];
  states: StateSpec[];
  propDefinitions: PropDefinitions;
  bindings: PropBinding[];
  styleTokens?: DesignTokensRef;
  baseStyle?: StyleSpec;
}

export interface TemplateSpec {
  id: TemplateId;
  title: string;
  description: string;
  spec: ComponentSpec;
}

export interface ValidationIssue {
  code: string;
  message: string;
  hint?: string;
  path?: string;
}

export interface AutoFixSuggestion {
  code: string;
  target: string;
  suggestion: string;
}

export interface ValidationResult {
  ok: boolean;
  errors: ValidationIssue[];
  warnings: ValidationIssue[];
  autoFixes?: AutoFixSuggestion[];
}

export interface GenerateOptions {
  confirmLargeVariantCount?: boolean;
}

export type PluginToUIMessage =
  | { type: 'spec-loaded'; spec: ComponentSpec | null }
  | { type: 'save-success'; spec: ComponentSpec }
  | { type: 'save-error'; error: string }
  | { type: 'create-success'; componentId: string; setId?: string }
  | { type: 'create-error'; error: string }
  | { type: 'validation-result'; result: ValidationResult }
  | { type: 'theme-change'; theme: ThemeName };

export type UIToPluginMessage =
  | { type: 'ui-ready' }
  | { type: 'request-save'; spec: ComponentSpec }
  | { type: 'request-load' }
  | { type: 'request-create'; spec: ComponentSpec; options?: GenerateOptions }
  | { type: 'notify-theme'; theme: ThemeName };

export interface VariantCombination {
  [groupName: string]: string;
}

export interface GeneratedComponentResult {
  mainComponent: ComponentNode;
  componentSet?: ComponentSetNode;
  allComponents: ComponentNode[];
}

export type PreviewSelection = {
  elementId: string | null;
  stateIndex: number;
};
