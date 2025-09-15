import { ComponentSpec, ElementSpec, TemplateSpec } from './types';
import { deepCloneSpec } from './utils/spec';

/**
 * Default button template: Container frame with optional leading and trailing
 * icons, text label and variant/style definitions matching a typical design
 * system button primitive.
 */
const buttonStructure: ElementSpec = {
  id: 'button-root',
  name: 'Button/Container',
  type: 'FRAME',
  role: 'container',
  layout: {
    direction: 'HORIZONTAL',
    gap: 8,
    padding: [8, 16, 8, 16],
    alignment: 'CENTER',
  },
  cornerRadius: 8,
  fills: [
    { type: 'SOLID', color: '#1f5af6' },
  ],
  effects: [
    {
      type: 'DROP_SHADOW',
      offset: { x: 0, y: 2 },
      radius: 8,
      color: '#1f5af6',
      opacity: 0.15,
    },
  ],
  children: [
    {
      id: 'button-icon-left',
      name: 'Icon/Left',
      type: 'ICON',
      role: 'leadingIcon',
      defaultVisible: false,
      size: { width: 16, height: 16 },
      fills: [{ type: 'SOLID', color: '#FFFFFF' }],
    },
    {
      id: 'button-label',
      name: 'Label',
      type: 'TEXT',
      role: 'label',
      text: { default: 'Button', placeholder: 'Label' },
      fills: [{ type: 'SOLID', color: '#FFFFFF' }],
    },
    {
      id: 'button-icon-right',
      name: 'Icon/Right',
      type: 'ICON',
      role: 'trailingIcon',
      defaultVisible: false,
      size: { width: 16, height: 16 },
      fills: [{ type: 'SOLID', color: '#FFFFFF' }],
    },
  ],
};

const buttonSpec: ComponentSpec = {
  name: 'Button',
  template: 'button',
  structure: buttonStructure,
  variantGroups: [
    { name: 'state', values: ['default', 'hover', 'selected', 'disabled'] },
    { name: 'size', values: ['sm', 'md', 'lg'] },
  ],
  states: [
    {
      name: 'default',
      appliesTo: { state: 'default' },
      style: {
        fills: [{ type: 'SOLID', color: '#1f5af6' }],
        textStyle: {
          fontFamily: 'Inter',
          fontSize: 14,
          fontWeight: 600,
        },
      },
      propValues: {
        text: { label: 'Button' },
        boolean: { leadingIcon: false, trailingIcon: false },
      },
    },
    {
      name: 'hover',
      appliesTo: { state: 'hover' },
      style: {
        fills: [{ type: 'SOLID', color: '#2e6afe' }],
        effects: [
          {
            type: 'DROP_SHADOW',
            offset: { x: 0, y: 4 },
            radius: 12,
            color: '#1f5af6',
            opacity: 0.24,
          },
        ],
      },
    },
    {
      name: 'selected',
      appliesTo: { state: 'selected' },
      style: {
        fills: [{ type: 'SOLID', color: '#0b42d5' }],
      },
    },
    {
      name: 'disabled',
      appliesTo: { state: 'disabled' },
      style: {
        fills: [{ type: 'SOLID', color: '#a6b7ff' }],
        textStyle: {
          fontFamily: 'Inter',
          fontSize: 14,
          fontWeight: 600,
        },
        elements: {
          label: {
            fills: [{ type: 'SOLID', color: '#ffffff', opacity: 0.7 }],
          },
        },
      },
      propValues: {
        boolean: { leadingIcon: false, trailingIcon: false },
      },
    },
    {
      name: 'size-sm',
      label: 'Size • Small',
      appliesTo: { size: 'sm' },
      style: {
        layout: {
          autolayout: {
            padding: [6, 12, 6, 12],
            gap: 4,
            align: 'center',
          },
        },
        textStyle: {
          fontFamily: 'Inter',
          fontSize: 12,
          fontWeight: 600,
        },
      },
    },
    {
      name: 'size-md',
      label: 'Size • Medium',
      appliesTo: { size: 'md' },
      style: {
        layout: {
          autolayout: {
            padding: [8, 16, 8, 16],
            gap: 8,
            align: 'center',
          },
        },
        textStyle: {
          fontFamily: 'Inter',
          fontSize: 14,
          fontWeight: 600,
        },
      },
    },
    {
      name: 'size-lg',
      label: 'Size • Large',
      appliesTo: { size: 'lg' },
      style: {
        layout: {
          autolayout: {
            padding: [10, 20, 10, 20],
            gap: 10,
            align: 'center',
          },
        },
        textStyle: {
          fontFamily: 'Inter',
          fontSize: 16,
          fontWeight: 600,
        },
      },
    },
  ],
  propDefinitions: {
    boolean: {
      leadingIcon: {
        name: 'Leading Icon',
        description: 'Toggle the visibility of the leading icon.',
        defaultValue: false,
      },
      trailingIcon: {
        name: 'Trailing Icon',
        description: 'Toggle the visibility of the trailing icon.',
        defaultValue: false,
      },
    },
    text: {
      label: {
        name: 'Label',
        description: 'Button label text',
        defaultValue: 'Button',
      },
    },
    swap: {
      icon: {
        name: 'Icon',
        description: 'Swap the icon instance for any symbol.',
      },
    },
  },
  bindings: [
    {
      propName: 'leadingIcon',
      type: 'BOOLEAN',
      target: { kind: 'ROLE', role: 'leadingIcon' },
    },
    {
      propName: 'trailingIcon',
      type: 'BOOLEAN',
      target: { kind: 'ROLE', role: 'trailingIcon' },
    },
    {
      propName: 'label',
      type: 'TEXT',
      target: { kind: 'ROLE', role: 'label' },
    },
    {
      propName: 'icon',
      type: 'INSTANCE_SWAP',
      target: { kind: 'ROLE', role: 'leadingIcon' },
    },
    {
      propName: 'icon',
      type: 'INSTANCE_SWAP',
      target: { kind: 'ROLE', role: 'trailingIcon' },
    },
  ],
  baseStyle: {
    fills: [{ type: 'SOLID', color: '#1f5af6' }],
    textStyle: {
      fontFamily: 'Inter',
      fontSize: 14,
      fontWeight: 600,
    },
  },
};

const dropdownStructure: ElementSpec = {
  id: 'dropdown-root',
  name: 'Dropdown/Container',
  type: 'FRAME',
  role: 'container',
  layout: {
    direction: 'VERTICAL',
    gap: 4,
    padding: [8, 8, 8, 8],
    alignment: 'START',
  },
  children: [
    {
      id: 'dropdown-trigger',
      name: 'Trigger',
      type: 'FRAME',
      role: 'trigger',
      layout: {
        direction: 'HORIZONTAL',
        gap: 8,
        padding: [8, 12, 8, 12],
        alignment: 'SPACE_BETWEEN',
      },
      cornerRadius: 8,
      fills: [{ type: 'SOLID', color: '#f3f4f6' }],
      children: [
        {
          id: 'dropdown-label',
          name: 'Label',
          type: 'TEXT',
          role: 'label',
          text: { default: 'Select option', placeholder: 'Label' },
        },
        {
          id: 'dropdown-chevron',
          name: 'Chevron',
          type: 'ICON',
          role: 'icon',
          size: { width: 16, height: 16 },
        },
      ],
    },
    {
      id: 'dropdown-list',
      name: 'List',
      type: 'FRAME',
      role: 'list',
      layout: {
        direction: 'VERTICAL',
        gap: 4,
        padding: [4, 4, 4, 4],
        alignment: 'START',
      },
      defaultVisible: false,
      children: [
        {
          id: 'dropdown-item-1',
          name: 'Item 1',
          type: 'TEXT',
          role: 'item',
          text: { default: 'Option A' },
        },
        {
          id: 'dropdown-item-2',
          name: 'Item 2',
          type: 'TEXT',
          role: 'item',
          text: { default: 'Option B' },
        },
      ],
    },
  ],
};

const dropdownSpec: ComponentSpec = {
  name: 'Dropdown',
  template: 'dropdown',
  structure: dropdownStructure,
  variantGroups: [
    { name: 'state', values: ['default', 'open', 'disabled'] },
    { name: 'size', values: ['sm', 'md'] },
  ],
  states: [
    {
      name: 'default',
      appliesTo: { state: 'default' },
      style: {
        fills: [{ type: 'SOLID', color: '#ffffff' }],
      },
      propValues: {
        text: { label: 'Select option' },
        boolean: { listVisible: false },
      },
    },
    {
      name: 'open',
      appliesTo: { state: 'open' },
      style: {
        elements: {
          list: {
            visible: true,
          },
        },
      },
      propValues: {
        boolean: { listVisible: true },
      },
    },
    {
      name: 'disabled',
      appliesTo: { state: 'disabled' },
      style: {
        fills: [{ type: 'SOLID', color: '#f3f4f6' }],
        elements: {
          label: {
            fills: [{ type: 'SOLID', color: '#9ca3af' }],
          },
        },
      },
    },
    {
      name: 'size-sm',
      label: 'Size • Small',
      appliesTo: { size: 'sm' },
      style: {
        layout: {
          autolayout: {
            padding: [4, 8, 4, 8],
            gap: 4,
            align: 'start',
          },
        },
      },
    },
    {
      name: 'size-md',
      label: 'Size • Medium',
      appliesTo: { size: 'md' },
      style: {
        layout: {
          autolayout: {
            padding: [8, 12, 8, 12],
            gap: 6,
            align: 'start',
          },
        },
      },
    },
  ],
  propDefinitions: {
    boolean: {
      listVisible: {
        name: 'List Visible',
        defaultValue: false,
        description: 'Show or hide the dropdown list.',
      },
    },
    text: {
      label: {
        name: 'Label',
        defaultValue: 'Select option',
      },
    },
    swap: {
      icon: {
        name: 'Chevron',
        description: 'Swap the chevron icon.',
      },
    },
  },
  bindings: [
    { propName: 'label', type: 'TEXT', target: { kind: 'ROLE', role: 'label' } },
    { propName: 'listVisible', type: 'BOOLEAN', target: { kind: 'ROLE', role: 'list' } },
    { propName: 'icon', type: 'INSTANCE_SWAP', target: { kind: 'ROLE', role: 'icon' } },
  ],
};

const toggleStructure: ElementSpec = {
  id: 'toggle-root',
  name: 'Toggle/Container',
  type: 'FRAME',
  role: 'container',
  layout: {
    direction: 'HORIZONTAL',
    gap: 8,
    padding: [4, 8, 4, 8],
    alignment: 'CENTER',
  },
  children: [
    {
      id: 'toggle-track',
      name: 'Track',
      type: 'RECTANGLE',
      role: 'track',
      size: { width: 36, height: 20 },
      cornerRadius: 10,
      fills: [{ type: 'SOLID', color: '#d1d5db' }],
    },
    {
      id: 'toggle-thumb',
      name: 'Thumb',
      type: 'ELLIPSE',
      role: 'thumb',
      size: { width: 16, height: 16 },
      fills: [{ type: 'SOLID', color: '#ffffff' }],
    },
    {
      id: 'toggle-label',
      name: 'Label',
      type: 'TEXT',
      role: 'label',
      text: { default: 'Toggle label' },
    },
  ],
};

const toggleSpec: ComponentSpec = {
  name: 'Toggle',
  template: 'toggle',
  structure: toggleStructure,
  variantGroups: [
    { name: 'state', values: ['off', 'on', 'disabled'] },
    { name: 'size', values: ['sm', 'md'] },
  ],
  states: [
    {
      name: 'off',
      appliesTo: { state: 'off' },
      style: {
        elements: {
          track: {
            fills: [{ type: 'SOLID', color: '#d1d5db' }],
          },
          thumb: {
            fills: [{ type: 'SOLID', color: '#ffffff' }],
          },
        },
      },
      propValues: {
        boolean: { isOn: false },
      },
    },
    {
      name: 'on',
      appliesTo: { state: 'on' },
      style: {
        elements: {
          track: {
            fills: [{ type: 'SOLID', color: '#22c55e' }],
          },
          thumb: {
            fills: [{ type: 'SOLID', color: '#ffffff' }],
          },
        },
      },
      propValues: {
        boolean: { isOn: true },
      },
    },
    {
      name: 'disabled',
      appliesTo: { state: 'disabled' },
      style: {
        elements: {
          track: {
            fills: [{ type: 'SOLID', color: '#9ca3af' }],
          },
          thumb: {
            fills: [{ type: 'SOLID', color: '#f3f4f6' }],
          },
          label: {
            fills: [{ type: 'SOLID', color: '#9ca3af' }],
          },
        },
      },
    },
    {
      name: 'size-sm',
      label: 'Size • Small',
      appliesTo: { size: 'sm' },
      style: {
        layout: {
          autolayout: {
            padding: [2, 6, 2, 6],
            gap: 4,
            align: 'center',
          },
        },
        elements: {
          track: {
            fills: [{ type: 'SOLID', color: '#d1d5db' }],
          },
        },
      },
    },
    {
      name: 'size-md',
      label: 'Size • Medium',
      appliesTo: { size: 'md' },
      style: {
        layout: {
          autolayout: {
            padding: [4, 8, 4, 8],
            gap: 6,
            align: 'center',
          },
        },
      },
    },
  ],
  propDefinitions: {
    boolean: {
      isOn: {
        name: 'Is On',
        defaultValue: false,
        description: 'Set the toggle state',
      },
    },
    text: {
      label: {
        name: 'Label',
        defaultValue: 'Toggle label',
      },
    },
  },
  bindings: [
    { propName: 'label', type: 'TEXT', target: { kind: 'ROLE', role: 'label' } },
    { propName: 'isOn', type: 'BOOLEAN', target: { kind: 'ROLE', role: 'thumb' } },
  ],
};

/**
 * Template definitions exposed to the UI.
 */
export const templates: TemplateSpec[] = [
  {
    id: 'button',
    title: 'Button',
    description: 'Primary button with state, size and icon properties.',
    spec: buttonSpec,
  },
  {
    id: 'dropdown',
    title: 'Dropdown',
    description: 'Trigger + menu preview with open/closed states.',
    spec: dropdownSpec,
  },
  {
    id: 'toggle',
    title: 'Toggle',
    description: 'Switch control with boolean state and label.',
    spec: toggleSpec,
  },
];

/**
 * Creates a deep copy of the template spec for editing to avoid mutating the
 * template definition shared across the plugin.
 */
export function createSpecFromTemplate(templateId: string): ComponentSpec {
  const template = templates.find((tpl) => tpl.id === templateId);
  if (!template) {
    throw new Error(`Unknown template "${templateId}"`);
  }
  return deepCloneSpec(template.spec);
}
