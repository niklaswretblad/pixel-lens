# Pixel Lens

Chrome extension that overlays Figma-like spacing and alignment measurements on any webpage.

## Project Structure

```
src/
  manifest.json              — Manifest V3 config (permissions, commands, content script)
  background/
    service-worker.js        — Message broker: relays toggle from popup/shortcut to content script
  popup/
    popup.html/css/js        — Toolbar popup UI (dark theme, enable/disable toggle)
  content/
    overlay.js               — Core logic: hover inspection, selection, measurements (~600 lines)
    overlay.css              — Overlay styles (all classes prefixed pl-*)
  icons/
    icon-{16,32,48,128}.png  — Placeholder icons (generated via Python script)
```

## Architecture

### State Machine (overlay.js)

- **INACTIVE**: pixel-lens off, no overlays, no event listeners
- **IDLE**: active, hover shows full box model (padding/margin/gaps/tooltip) on hovered element
- **SELECTED**: click selects element; selected element shows persistent box model; hovering other elements shows dashed outline + distance measurements

Transitions: `Alt+Shift+P` or popup button toggles INACTIVE/IDLE. Click transitions IDLE→SELECTED. Escape or click-same transitions SELECTED→IDLE.

### Dual Overlay System

Two independent overlay sets (`selectedOverlays` + `hoverOverlays`) so the selected element's box model persists while hovering other elements. Both sets are created via `createOverlaySet()` factory.

### Measurement Modes

- **Containment**: if hovered rect contains selected rect (or vice versa, or hovering body/html), shows distances from child to all 4 container edges
- **Sibling**: if elements don't contain each other, shows horizontal/vertical gap. Only shows gap on axes where elements are actually separated (overlapping axes are hidden)

### Communication Flow

```
popup.js → chrome.runtime.sendMessage → service-worker.js → chrome.tabs.sendMessage → overlay.js
keyboard shortcut → chrome.commands.onCommand → service-worker.js → overlay.js
```

## Key Conventions

- All overlay CSS classes are prefixed with `pl-` to avoid collisions with inspected pages
- All overlays use `position: fixed`, `pointer-events: none`, `z-index: 2147483647`
- Vanilla JS only — no build step, no framework, no dependencies
- Load extension via `chrome://extensions/` → "Load unpacked" → select `src/` folder
- After code changes: reload extension in chrome://extensions/, then refresh the inspected page
  - Exception: popup changes take effect by closing/reopening the popup

## Color System

- **Blue** (#0d99ff): hovered element highlight
- **Red** (#f24822): selected element highlight, measurement lines/labels
- **Green** (rgba 72,199,142): padding visualization + dimension labels
- **Orange** (rgba 255,165,0): margin visualization + dimension labels
- **Purple** (rgba 179,136,255): flex/grid gap visualization (hatched pattern)

## Development

No build step. Edit files in `src/`, reload extension, refresh page.

Placeholder icons were generated with a pure Python script (no dependencies). Replace with real icons before publishing.
