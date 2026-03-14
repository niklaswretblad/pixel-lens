// content/overlay.js
// ===================
// Content script injected into every web page.
// Provides Figma-like inspection: hover highlights with padding/margin
// dimensions, flex/grid gap visualization, and distance measurement.
//
// State machine:
//   INACTIVE  → (toggle) → IDLE      : hover shows full box model
//   IDLE      → (click)  → SELECTED  : selected element shows persistent box model;
//                                       hover shows outline + restricted measurements
//   SELECTED  → (click same / Esc) → IDLE
//   any       → (toggle) → INACTIVE

(() => {
  if (window.__pixelLensLoaded) return;
  window.__pixelLensLoaded = true;

  // ---- State ----
  let active = false;
  let selectedElement = null;
  let hoveredElement = null;

  // ---- Two independent overlay layer sets ----
  let selectedOverlays = null; // persistent box model of selected element
  let hoverOverlays = null;    // transient hover visuals

  // ---- Helpers ----

  function createOverlayElement(className) {
    const el = document.createElement('div');
    el.className = className;
    el.style.display = 'none';
    return el;
  }

  function isOverlayElement(el) {
    if (!el || !el.className || typeof el.className !== 'string') return false;
    return el.className.startsWith('pl-');
  }

  // ---- Overlay set factory ----

  function createOverlaySet(highlightClass) {
    const set = {};
    set.highlight = createOverlayElement(highlightClass);
    set.paddingTop = createOverlayElement('pl-padding-box');
    set.paddingRight = createOverlayElement('pl-padding-box');
    set.paddingBottom = createOverlayElement('pl-padding-box');
    set.paddingLeft = createOverlayElement('pl-padding-box');
    set.marginTop = createOverlayElement('pl-margin-box');
    set.marginRight = createOverlayElement('pl-margin-box');
    set.marginBottom = createOverlayElement('pl-margin-box');
    set.marginLeft = createOverlayElement('pl-margin-box');
    set.dynamic = document.createElement('div');
    set.dynamic.style.cssText = 'position:fixed;top:0;left:0;pointer-events:none;z-index:2147483647;';
    set.tooltip = createOverlayElement('pl-tooltip');
    return set;
  }

  function appendOverlaySet(set) {
    Object.values(set).forEach((el) => document.documentElement.appendChild(el));
  }

  function removeOverlaySet(set) {
    Object.values(set).forEach((el) => el.remove());
  }

  function hideOverlaySet(set) {
    Object.values(set).forEach((el) => {
      if (el.style) el.style.display = 'none';
      if (el.innerHTML !== undefined && el.className === '') el.innerHTML = ''; // dynamic container
    });
    set.dynamic.innerHTML = '';
  }

  function initOverlays() {
    // Selected overlays (appended first = rendered below)
    selectedOverlays = createOverlaySet('pl-selected-highlight');
    appendOverlaySet(selectedOverlays);

    // Hover overlays (appended second = rendered on top)
    hoverOverlays = createOverlaySet('pl-highlight');
    hoverOverlays.hoverOutline = createOverlayElement('pl-hover-outline');
    hoverOverlays.measurements = document.createElement('div');
    hoverOverlays.measurements.style.cssText = 'position:fixed;top:0;left:0;pointer-events:none;z-index:2147483647;';
    appendOverlaySet(hoverOverlays);
    document.documentElement.appendChild(hoverOverlays.hoverOutline);
    document.documentElement.appendChild(hoverOverlays.measurements);
  }

  function destroyOverlays() {
    if (selectedOverlays) {
      removeOverlaySet(selectedOverlays);
      selectedOverlays = null;
    }
    if (hoverOverlays) {
      hoverOverlays.hoverOutline.remove();
      hoverOverlays.measurements.remove();
      removeOverlaySet(hoverOverlays);
      hoverOverlays = null;
    }
  }

  // ---- Box model helpers ----

  function getBoxModel(element) {
    const rect = element.getBoundingClientRect();
    const style = window.getComputedStyle(element);
    return {
      rect,
      padding: {
        top: parseFloat(style.paddingTop),
        right: parseFloat(style.paddingRight),
        bottom: parseFloat(style.paddingBottom),
        left: parseFloat(style.paddingLeft),
      },
      margin: {
        top: parseFloat(style.marginTop),
        right: parseFloat(style.marginRight),
        bottom: parseFloat(style.marginBottom),
        left: parseFloat(style.marginLeft),
      },
      style,
    };
  }

  // ---- Positioning helpers ----

  function positionBox(el, rect) {
    el.style.top = rect.top + 'px';
    el.style.left = rect.left + 'px';
    el.style.width = rect.width + 'px';
    el.style.height = rect.height + 'px';
    el.style.display = 'block';
  }

  function hideEl(el) {
    if (el) el.style.display = 'none';
  }

  function makeDimLabel(text, top, left, type) {
    const el = document.createElement('div');
    el.className = `pl-dim-label pl-dim-label--${type}`;
    el.textContent = text;
    el.style.position = 'fixed';
    el.style.top = top + 'px';
    el.style.left = left + 'px';
    el.style.zIndex = '2147483647';
    el.style.pointerEvents = 'none';
    return el;
  }

  // ---- renderBoxModel: full box model visualization on a given overlay set ----

  function renderBoxModel(element, set) {
    const { rect, padding, margin, style } = getBoxModel(element);

    set.dynamic.innerHTML = '';

    // Highlight
    positionBox(set.highlight, rect);

    // Padding boxes (green)
    positionBox(set.paddingTop, { top: rect.top, left: rect.left, width: rect.width, height: padding.top });
    positionBox(set.paddingBottom, { top: rect.bottom - padding.bottom, left: rect.left, width: rect.width, height: padding.bottom });
    positionBox(set.paddingLeft, { top: rect.top + padding.top, left: rect.left, width: padding.left, height: rect.height - padding.top - padding.bottom });
    positionBox(set.paddingRight, { top: rect.top + padding.top, left: rect.right - padding.right, width: padding.right, height: rect.height - padding.top - padding.bottom });

    // Margin boxes (orange)
    positionBox(set.marginTop, { top: rect.top - margin.top, left: rect.left, width: rect.width, height: margin.top });
    positionBox(set.marginBottom, { top: rect.bottom, left: rect.left, width: rect.width, height: margin.bottom });
    positionBox(set.marginLeft, { top: rect.top - margin.top, left: rect.left - margin.left, width: margin.left, height: rect.height + margin.top + margin.bottom });
    positionBox(set.marginRight, { top: rect.top - margin.top, left: rect.right, width: margin.right, height: rect.height + margin.top + margin.bottom });

    // Dimension labels
    const frag = document.createDocumentFragment();

    if (padding.top > 8) frag.appendChild(makeDimLabel(Math.round(padding.top), rect.top + padding.top / 2 - 6, rect.left + rect.width / 2 - 8, 'padding'));
    if (padding.bottom > 8) frag.appendChild(makeDimLabel(Math.round(padding.bottom), rect.bottom - padding.bottom + padding.bottom / 2 - 6, rect.left + rect.width / 2 - 8, 'padding'));
    if (padding.left > 12) frag.appendChild(makeDimLabel(Math.round(padding.left), rect.top + rect.height / 2 - 6, rect.left + padding.left / 2 - 8, 'padding'));
    if (padding.right > 12) frag.appendChild(makeDimLabel(Math.round(padding.right), rect.top + rect.height / 2 - 6, rect.right - padding.right + padding.right / 2 - 8, 'padding'));

    if (margin.top > 8) frag.appendChild(makeDimLabel(Math.round(margin.top), rect.top - margin.top + margin.top / 2 - 6, rect.left + rect.width / 2 - 8, 'margin'));
    if (margin.bottom > 8) frag.appendChild(makeDimLabel(Math.round(margin.bottom), rect.bottom + margin.bottom / 2 - 6, rect.left + rect.width / 2 - 8, 'margin'));
    if (margin.left > 12) frag.appendChild(makeDimLabel(Math.round(margin.left), rect.top + rect.height / 2 - 6, rect.left - margin.left + margin.left / 2 - 8, 'margin'));
    if (margin.right > 12) frag.appendChild(makeDimLabel(Math.round(margin.right), rect.top + rect.height / 2 - 6, rect.right + margin.right / 2 - 8, 'margin'));

    // Gap visualization
    renderGaps(element, style, frag);

    set.dynamic.appendChild(frag);

    // Tooltip
    renderTooltip(element, rect, set);
  }

  // ---- renderHoverOutlineOnly: lightweight hover in SELECTED state ----

  function renderHoverOutlineOnly(element) {
    const rect = element.getBoundingClientRect();

    // Hide full box model overlays on hover set
    hideEl(hoverOverlays.highlight);
    hideEl(hoverOverlays.paddingTop);
    hideEl(hoverOverlays.paddingRight);
    hideEl(hoverOverlays.paddingBottom);
    hideEl(hoverOverlays.paddingLeft);
    hideEl(hoverOverlays.marginTop);
    hideEl(hoverOverlays.marginRight);
    hideEl(hoverOverlays.marginBottom);
    hideEl(hoverOverlays.marginLeft);
    hideEl(hoverOverlays.tooltip);
    hoverOverlays.dynamic.innerHTML = '';

    // Show dashed blue outline only
    positionBox(hoverOverlays.hoverOutline, rect);
  }

  // ---- hideHoverOverlays: clear all hover visuals ----

  function hideHoverOverlays() {
    if (!hoverOverlays) return;
    hideEl(hoverOverlays.highlight);
    hideEl(hoverOverlays.hoverOutline);
    hideEl(hoverOverlays.paddingTop);
    hideEl(hoverOverlays.paddingRight);
    hideEl(hoverOverlays.paddingBottom);
    hideEl(hoverOverlays.paddingLeft);
    hideEl(hoverOverlays.marginTop);
    hideEl(hoverOverlays.marginRight);
    hideEl(hoverOverlays.marginBottom);
    hideEl(hoverOverlays.marginLeft);
    hideEl(hoverOverlays.tooltip);
    hoverOverlays.dynamic.innerHTML = '';
    clearMeasurements();
  }

  // ---- Gap visualization for flex/grid containers ----

  function renderGaps(element, style, frag) {
    const display = style.display;
    const isFlex = display === 'flex' || display === 'inline-flex';
    const isGrid = display === 'grid' || display === 'inline-grid';
    if (!isFlex && !isGrid) return;

    const rowGap = parseFloat(style.rowGap) || 0;
    const columnGap = parseFloat(style.columnGap) || 0;
    if (rowGap === 0 && columnGap === 0) return;

    const children = Array.from(element.children).filter((child) => {
      const s = window.getComputedStyle(child);
      return s.position !== 'absolute' && s.position !== 'fixed' && s.display !== 'none';
    });

    if (children.length < 2) return;

    const rects = children.map((c) => c.getBoundingClientRect());

    for (let i = 0; i < rects.length - 1; i++) {
      const a = rects[i];
      const b = rects[i + 1];

      if (columnGap > 0) {
        const gapLeft = Math.min(a.right, b.right);
        const gapRight = Math.max(a.left, b.left);
        if (gapRight > gapLeft && Math.abs(gapRight - gapLeft - columnGap) < 2) {
          const gapTop = Math.max(a.top, b.top);
          const gapBottom = Math.min(a.bottom, b.bottom);
          if (gapBottom > gapTop) {
            const box = document.createElement('div');
            box.className = 'pl-gap-box';
            box.style.cssText = `position:fixed;pointer-events:none;z-index:2147483647;top:${gapTop}px;left:${gapLeft}px;width:${gapRight - gapLeft}px;height:${gapBottom - gapTop}px;`;
            frag.appendChild(box);

            const label = document.createElement('div');
            label.className = 'pl-gap-label';
            label.textContent = Math.round(columnGap);
            label.style.cssText = `position:fixed;pointer-events:none;z-index:2147483647;top:${gapTop - 16}px;left:${(gapLeft + gapRight) / 2 - 8}px;`;
            frag.appendChild(label);
          }
        }
      }

      if (rowGap > 0) {
        const gapTop = Math.min(a.bottom, b.bottom);
        const gapBottom = Math.max(a.top, b.top);
        if (gapBottom > gapTop && Math.abs(gapBottom - gapTop - rowGap) < 2) {
          const gapLeft = Math.max(a.left, b.left);
          const gapRight = Math.min(a.right, b.right);
          if (gapRight > gapLeft) {
            const box = document.createElement('div');
            box.className = 'pl-gap-box';
            box.style.cssText = `position:fixed;pointer-events:none;z-index:2147483647;top:${gapTop}px;left:${gapLeft}px;width:${gapRight - gapLeft}px;height:${gapBottom - gapTop}px;`;
            frag.appendChild(box);

            const label = document.createElement('div');
            label.className = 'pl-gap-label';
            label.textContent = Math.round(rowGap);
            label.style.cssText = `position:fixed;pointer-events:none;z-index:2147483647;top:${(gapTop + gapBottom) / 2 - 6}px;left:${gapRight + 4}px;`;
            frag.appendChild(label);
          }
        }
      }
    }
  }

  // ---- Tooltip ----

  function renderTooltip(element, rect, set) {
    const tag = element.tagName.toLowerCase();
    const w = Math.round(rect.width);
    const h = Math.round(rect.height);
    const cls = element.className && typeof element.className === 'string'
      ? '.' + element.className.trim().split(/\s+/).slice(0, 3).join('.')
      : '';

    set.tooltip.innerHTML =
      `<span class="pl-tag">${tag}</span>` +
      `<span class="pl-size">${w} × ${h}</span>` +
      (cls ? `<span class="pl-classes">${cls}</span>` : '');

    const tooltipHeight = 28;
    const gap = 6;
    let top = rect.top - tooltipHeight - gap;
    if (top < 4) top = rect.bottom + gap;

    set.tooltip.style.top = top + 'px';
    set.tooltip.style.left = rect.left + 'px';
    set.tooltip.style.display = 'block';
  }

  // ---- Measurement rendering ----

  function clearMeasurements() {
    if (hoverOverlays && hoverOverlays.measurements) {
      hoverOverlays.measurements.innerHTML = '';
    }
  }

  function createLine(className, styles) {
    const line = document.createElement('div');
    line.className = `pl-measurement-line ${className}`;
    Object.assign(line.style, styles);
    return line;
  }

  function createLabel(text, top, left) {
    const label = document.createElement('div');
    label.className = 'pl-measurement-label';
    label.textContent = text;
    label.style.top = top + 'px';
    label.style.left = left + 'px';
    return label;
  }

  function addLineAndLabel(frag, direction, from, to, pos) {
    const dist = Math.abs(to - from);
    if (dist < 1) return;
    const min = Math.min(from, to);
    const max = Math.max(from, to);

    if (direction === 'horizontal') {
      frag.appendChild(createLine('pl-measurement-line--horizontal', {
        position: 'fixed', display: 'block',
        top: pos + 'px', left: min + 'px', width: (max - min) + 'px',
      }));
      frag.appendChild(createLabel(Math.round(dist) + 'px', pos - 18, (min + max) / 2 - 16));
    } else {
      frag.appendChild(createLine('pl-measurement-line--vertical', {
        position: 'fixed', display: 'block',
        top: min + 'px', left: pos + 'px', height: (max - min) + 'px',
      }));
      frag.appendChild(createLabel(Math.round(dist) + 'px', (min + max) / 2 - 8, pos + 8));
    }
  }

  function renderContainmentMeasurements(containerRect, childRect) {
    clearMeasurements();
    const frag = document.createDocumentFragment();

    const midX = childRect.left + childRect.width / 2;
    const midY = childRect.top + childRect.height / 2;

    addLineAndLabel(frag, 'vertical', containerRect.top, childRect.top, midX);
    addLineAndLabel(frag, 'vertical', childRect.bottom, containerRect.bottom, midX);
    addLineAndLabel(frag, 'horizontal', containerRect.left, childRect.left, midY);
    addLineAndLabel(frag, 'horizontal', childRect.right, containerRect.right, midY);

    hoverOverlays.measurements.appendChild(frag);
  }

  function renderSiblingMeasurements(selectedRect, hoveredRect) {
    clearMeasurements();
    const frag = document.createDocumentFragment();

    const verticalGap = calculateVerticalGap(selectedRect, hoveredRect);
    if (verticalGap !== null) {
      const { distance, top, bottom, x } = verticalGap;
      frag.appendChild(createLine('pl-measurement-line--vertical', {
        position: 'fixed', display: 'block',
        top: top + 'px', left: x + 'px', height: (bottom - top) + 'px',
      }));
      frag.appendChild(createLabel(Math.round(distance) + 'px', (top + bottom) / 2 - 8, x + 8));
    }

    const horizontalGap = calculateHorizontalGap(selectedRect, hoveredRect);
    if (horizontalGap !== null) {
      const { distance, left, right, y } = horizontalGap;
      frag.appendChild(createLine('pl-measurement-line--horizontal', {
        position: 'fixed', display: 'block',
        top: y + 'px', left: left + 'px', width: (right - left) + 'px',
      }));

      let hTop = y - 20;
      const hLeft = (left + right) / 2 - 16;

      if (verticalGap !== null) {
        const vLabelTop = (verticalGap.top + verticalGap.bottom) / 2 - 8;
        const vLabelLeft = verticalGap.x + 8;
        if (Math.abs(hTop - vLabelTop) < 22 && Math.abs(hLeft - vLabelLeft) < 50) {
          hTop = y + 6;
        }
      }

      frag.appendChild(createLabel(Math.round(distance) + 'px', hTop, hLeft));
    }

    hoverOverlays.measurements.appendChild(frag);
  }

  function rectContains(outer, inner) {
    return outer.top <= inner.top && outer.left <= inner.left &&
           outer.bottom >= inner.bottom && outer.right >= inner.right;
  }

  function renderMeasurements(selected, hovered) {
    const selectedRect = selected.getBoundingClientRect();
    const tag = hovered.tagName.toLowerCase();
    const useViewport = tag === 'html' || tag === 'body';
    const hoveredRect = useViewport
      ? { top: 0, left: 0, bottom: window.innerHeight, right: window.innerWidth }
      : hovered.getBoundingClientRect();

    if (useViewport || rectContains(hoveredRect, selectedRect)) {
      renderContainmentMeasurements(hoveredRect, selectedRect);
    } else if (rectContains(selectedRect, hoveredRect)) {
      renderContainmentMeasurements(selectedRect, hoveredRect);
    } else {
      renderSiblingMeasurements(selectedRect, hoveredRect);
    }
  }

  function calculateVerticalGap(a, b) {
    let top, bottom, distance;
    if (a.bottom <= b.top) {
      top = a.bottom; bottom = b.top; distance = b.top - a.bottom;
    } else if (b.bottom <= a.top) {
      top = b.bottom; bottom = a.top; distance = a.top - b.bottom;
    } else {
      // Elements overlap vertically — no gap to show
      return null;
    }
    const x = (Math.max(a.left, b.left) + Math.min(a.right, b.right)) / 2;
    return { distance, top, bottom, x };
  }

  function calculateHorizontalGap(a, b) {
    let left, right, distance;
    if (a.right <= b.left) {
      left = a.right; right = b.left; distance = b.left - a.right;
    } else if (b.right <= a.left) {
      left = b.right; right = a.left; distance = a.left - b.right;
    } else {
      // Elements overlap horizontally — no gap to show
      return null;
    }
    const y = (Math.max(a.top, b.top) + Math.min(a.bottom, b.bottom)) / 2;
    return { distance, left, right, y };
  }

  // ---- Selection ----

  function selectElement(target) {
    selectedElement = target;
    renderBoxModel(target, selectedOverlays);
    hideHoverOverlays();
  }

  function deselectElement() {
    selectedElement = null;
    hideOverlaySet(selectedOverlays);
    clearMeasurements();
  }

  // ---- Event handlers ----

  function onMouseMove(e) {
    if (!active) return;

    const target = e.target;
    if (isOverlayElement(target)) return;

    // Auto-deselect if selected element was removed from DOM
    if (selectedElement && !document.contains(selectedElement)) {
      deselectElement();
    }

    hoveredElement = target;

    if (selectedElement) {
      // SELECTED state: outline only + restricted measurements
      if (target === selectedElement) {
        hideEl(hoverOverlays.hoverOutline);
        clearMeasurements();
        return;
      }

      renderHoverOutlineOnly(target);
      renderMeasurements(selectedElement, target);
    } else {
      // IDLE state: full box model on hovered element
      hideEl(hoverOverlays.hoverOutline);
      renderBoxModel(target, hoverOverlays);
    }
  }

  function onClick(e) {
    if (!active) return;

    e.preventDefault();
    e.stopPropagation();

    const target = e.target;
    if (isOverlayElement(target)) return;

    if (selectedElement === target) {
      deselectElement();
    } else {
      selectElement(target);
    }
  }

  function blockEvent(e) {
    if (!active) return;
    e.preventDefault();
    e.stopPropagation();
  }

  function onKeyDown(e) {
    if (!active) return;
    if (e.key === 'Escape') {
      if (selectedElement) {
        deselectElement();
      }
    }
  }

  function onScrollOrResize() {
    if (!active) return;
    if (selectedElement) {
      if (!document.contains(selectedElement)) {
        deselectElement();
        return;
      }
      renderBoxModel(selectedElement, selectedOverlays);

      if (hoveredElement && hoveredElement !== selectedElement) {
        renderHoverOutlineOnly(hoveredElement);
        renderMeasurements(selectedElement, hoveredElement);
      }
    } else if (hoveredElement) {
      renderBoxModel(hoveredElement, hoverOverlays);
    }
  }

  // ---- Toast ----

  let toastTimeout = null;

  function showToast(enabled) {
    // Remove any existing toast
    const existing = document.querySelector('.pl-toast');
    if (existing) existing.remove();
    if (toastTimeout) clearTimeout(toastTimeout);

    const toast = document.createElement('div');
    toast.className = 'pl-toast';
    const dotClass = enabled ? 'pl-toast-dot--on' : 'pl-toast-dot--off';
    const label = enabled ? 'Pixel Lens on' : 'Pixel Lens off';
    toast.innerHTML = `<span class="pl-toast-dot ${dotClass}"></span>${label}`;
    document.documentElement.appendChild(toast);

    // Trigger animation
    requestAnimationFrame(() => {
      requestAnimationFrame(() => {
        toast.classList.add('pl-toast--visible');
      });
    });

    // Fade out and remove
    toastTimeout = setTimeout(() => {
      toast.classList.remove('pl-toast--visible');
      setTimeout(() => toast.remove(), 200);
    }, 1200);
  }

  // ---- Activate / Deactivate ----

  function activate() {
    if (active) return;
    active = true;
    initOverlays();
    showToast(true);
    document.addEventListener('mousemove', onMouseMove, true);
    document.addEventListener('click', onClick, true);
    document.addEventListener('mousedown', blockEvent, true);
    document.addEventListener('mouseup', blockEvent, true);
    document.addEventListener('auxclick', blockEvent, true);
    document.addEventListener('keydown', onKeyDown, true);
    window.addEventListener('scroll', onScrollOrResize, true);
    window.addEventListener('resize', onScrollOrResize);
  }

  function deactivate() {
    if (!active) return;
    active = false;
    selectedElement = null;
    hoveredElement = null;
    document.removeEventListener('mousemove', onMouseMove, true);
    document.removeEventListener('click', onClick, true);
    document.removeEventListener('mousedown', blockEvent, true);
    document.removeEventListener('mouseup', blockEvent, true);
    document.removeEventListener('auxclick', blockEvent, true);
    document.removeEventListener('keydown', onKeyDown, true);
    window.removeEventListener('scroll', onScrollOrResize, true);
    window.removeEventListener('resize', onScrollOrResize);
    destroyOverlays();
    showToast(false);
  }

  // ---- Message handling ----

  chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
    if (message.action === 'toggle') {
      if (active) {
        deactivate();
      } else {
        activate();
      }
    }
    if (message.action === 'getState') {
      sendResponse({ active });
    }
  });
})();
