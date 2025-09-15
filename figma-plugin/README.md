# Component Forge Figma Plugin

Component Forge is a Figma/ FigJam plugin that helps designers build component sets with comprehensive support for component properties, variants and stateful styling from an interactive inspector.

## Getting started

1. Install dependencies:

```bash
npm install
```

2. Build the plugin bundle:

```bash
npm run build
```

The compiled plugin will be emitted to `figma-plugin/dist`. Load `manifest.json` from that directory in Figma via **Plugins → Development → Import plugin from manifest…**.

### Development mode

For iterative work, run the watcher:

```bash
npm run dev
```

This keeps `dist` up-to-date whenever files under `figma-plugin/src` change.

### Tests

Unit tests for the pure utilities can be executed with:

```bash
npm run test
```

## Features

- Template gallery (Button, Dropdown, Toggle) or custom specs.
- Manage variant groups, states and property bindings from the inspector.
- Real-time HTML preview with selectable nodes for binding configuration.
- Component creation with auto layout, typography and component property bindings using the Figma Plugin API.
- Import/ export spec as JSON and automatic persistence via `figma.clientStorage`.
- Light/ dark themed UI with simple i18n-ready structure.

## Folder structure

```
figma-plugin/
 ├─ src/            # Plugin controller + webview UI source
 ├─ dist/           # Build output (generated)
 ├─ scripts/        # Build/ dev scripts
 ├─ tests/          # Vitest unit tests
 └─ manifest.json   # Figma plugin manifest
```

## Notes

- The plugin uses the latest Component Property APIs (`BOOLEAN`, `TEXT`, `INSTANCE_SWAP`).
- Variant groups are normalised before creation to match Figma’s naming rules.
- Instance swap placeholders are created automatically for icon slots and stored in a hidden assets frame.

