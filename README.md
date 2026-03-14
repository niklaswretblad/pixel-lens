# Pixel Lens

Chrome extension that overlays Figma-like spacing and alignment measurements on any webpage — hover over elements to see pixel distances to neighbors, padding, margins, and bounding boxes. Built to speed up design-to-code QA.

## Install

1. Clone the repo
2. Open `chrome://extensions/`
3. Enable **Developer mode** (top right)
4. Click **Load unpacked** and select the `src/` folder

## Usage

- Press **Alt+Shift+P** to toggle inspect mode (or use the popup button)
- **Hover** elements to see padding (green), margin (orange), flex/grid gaps (purple), and dimensions
- **Click** an element to select it — its box model stays visible
- **Hover other elements** while selected to measure distances
  - Hovering a container shows distances to all 4 edges
  - Hovering a sibling shows the gap between elements
- **Escape** to deselect
- **Alt+Shift+P** again to deactivate

## Color coding

| Color | Meaning |
|-------|---------|
| Blue | Hovered element outline |
| Red | Selected element + measurement lines |
| Green | Padding |
| Orange | Margin |
| Purple (hatched) | Flex/grid gap |

## Development

No build step. Edit files in `src/`, reload the extension in `chrome://extensions/`, and refresh the page you're inspecting.

## Project structure

```
src/
  manifest.json              Extension config (Manifest V3)
  background/
    service-worker.js        Message broker between popup/shortcut and content script
  popup/
    popup.html/css/js        Toolbar popup UI
    fonts/                   ABC Monument Grotesk font files
  content/
    overlay.js               Core inspection logic (~500 lines)
    overlay.css              Overlay styles (all classes prefixed pl-*)
  icons/
    icon-{16,32,48,128}.png  Extension icons
```
