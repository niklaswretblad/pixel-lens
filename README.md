# Pixel Lens

Chrome extension that overlays Figma-like spacing and alignment measurements on any webpage — hover over elements to see pixel distances to neighbors, padding, margins, and bounding boxes. Built to speed up design-to-code QA.

## Why

At [Emfas](https://emfas.ai), our product designer Sal Tavalkar creates designs in Figma, and I convert them into code. We've been experimenting with Claude Code and the [Figma MCP](https://github.com/nicholasgriffintn/figma-mcp) to speed up the design-to-code pipeline — letting an AI agent read Figma files and generate implementation code automatically.

The problem is that the Figma REST API (which the MCP uses) doesn't expose the clean, developer-friendly CSS you see in Figma's Dev Mode — the hand-tuned `padding`, `gap`, `border-radius`, and layout properties that designers set intentionally. Instead, the API returns raw node geometry: absolute positions, bounding boxes, and computed fill colors. The MCP then has to reconstruct layout from this raw data, which means the auto-generated code comes out with absolute positioning, arbitrary pixel values, and Tailwind classes that don't match the designer's intent. Properties like `auto layout` direction, spacing mode, padding, and constraints — which map cleanly to `flexbox`, `gap`, and `padding` in CSS — are either lost or poorly approximated in the conversion.

The result is a lossy translation. The broad strokes are right — the layout roughly matches, components are in the right order — but the details are off. Paddings are wrong, alignments are shifted, gaps between elements don't match the design. These are exactly the things that matter for a polished product.

To QA these AI-generated implementations, I was using Chrome DevTools. But compared to Figma's Dev Mode inspector — where you hover any element and instantly see pixel distances, padding, margins, and gaps — Chrome's inspector is painfully slow. You have to dig through the DOM tree, click through nested elements, and mentally map computed styles back to the design. On top of that, since an AI wrote the code, I'm reading a component structure I didn't author, which makes navigating the DOM even more disorienting.

Pixel Lens solves this by bringing Figma's visual inspection experience directly into the browser. Hover any element to see its padding, margin, and flex gaps rendered as colored overlays with pixel values. Click to select an element, then hover its neighbors to see exact distances. It turns a 30-second DevTools investigation into a 2-second glance.

### What's next

The inspection side works well. The next step is closing the loop: going from spotting a faulty alignment in the browser to opening the exact element in Claude Code or Cursor to fix it. A direct link between what you see on screen and the line of code responsible — so the QA-to-fix cycle becomes near-instant.

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
