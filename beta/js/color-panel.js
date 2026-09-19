// Color panel: the right-click customization popup (FILL/TEXT/STROKE/SYMBOL/
// FONT/STICK tabs, swatches, symbol & font grids, size sliders, base image).
//
// Owns its own DOM (#colorPanel), the remembered tab (localStorage
// 'colorMode'), the color picker (js/color-picker.js), and the hover-preview
// state (currentPreviewTarget + revertPreview). Layout state (appState),
// element lookups, and stick helpers are injected; layout snapshotting
// (exportLayout/importLayout) and selection itself stay in main.js.
// Cross-cutting mutable state crosses via accessors, same pattern as
// js/presets-menu.js:
// - selected: read-only via getSelected
// - panelAnchorTarget: read/write via getPanelAnchorTarget/setPanelAnchorTarget
// - stickTrailSystems: the live trail-system map created in main.js

import { PALETTE } from './palette.js';
import { applyBgImage } from './bg-image.js';
import { createColorPicker } from './color-picker.js';
import { loadFontsList } from './fonts.js';

export function createColorPanel({
  appState, ANALOG_DEFAULTS,
  els, // { base, stickWrapper, eightWayWrapper, joystick, btnEls }
  presetsMenu,
  getSelected, getPanelAnchorTarget, setPanelAnchorTarget,
  getStickMovementEnabled, stickTrailSystems, updateAnalogStickBases,
  getBgImagePath, saveStateData, showToast,
  startUiHideTimer, stopUiHideTimer
}) {
  const { base, stickWrapper, eightWayWrapper, joystick, btnEls } = els;

  let colorPanel = document.getElementById('colorPanel');
  let applyPickedColor = null;
  const colorPicker = createColorPicker({ onPick: color => applyPickedColor?.(color) });

  // Hover-preview state; main.js reverts previews on selection changes via
  // the exposed revertPreview.
  let currentPreviewTarget = null;
  function revertPreview() {
    if (!currentPreviewTarget) return;
    if (currentPreviewTarget.dataset._prevBg !== undefined) { currentPreviewTarget.style.backgroundColor = currentPreviewTarget.dataset._prevBg || ''; delete currentPreviewTarget.dataset._prevBg; }
    if (currentPreviewTarget.dataset._prevColor !== undefined) { currentPreviewTarget.style.color = currentPreviewTarget.dataset._prevColor || ''; delete currentPreviewTarget.dataset._prevColor; }
    if (currentPreviewTarget.dataset._prevBgImage !== undefined) { applyBgImage(currentPreviewTarget, currentPreviewTarget.dataset._prevBgImage || ''); delete currentPreviewTarget.dataset._prevBgImage; }
    if (currentPreviewTarget.dataset._prevBgSize !== undefined) { currentPreviewTarget.style.backgroundSize = currentPreviewTarget.dataset._prevBgSize || ''; delete currentPreviewTarget.dataset._prevBgSize; }
    currentPreviewTarget = null;
  }

  function closeColorPanel(revert = true) {
    if (!colorPanel || (colorPanel.style.display !== 'block' && colorPanel.style.display !== 'flex')) return;
    colorPanel.style.display = 'none';
    if (revert) revertPreview();
    stopUiHideTimer();
  }

  // --- color panel ---
  let colorMode = localStorage.getItem('colorMode') || 'bg';

  async function openColorPanel(anchorTarget, x, y) {
    try {
      // defensive: ensure colorPanel exists and is attached
      colorPanel = document.getElementById('colorPanel') || colorPanel;
      if (!colorPanel) {
        colorPanel = document.createElement('div'); colorPanel.id = 'colorPanel'; document.body.appendChild(colorPanel);
      } else if (!document.body.contains(colorPanel)) {
        document.body.appendChild(colorPanel);
      }
      // If the presets menu (empty-canvas right-click) is open, close it. The
      // per-element contextmenu handler calls stopPropagation on mousedown, so
      // the presets outside-click handler never fires for these elements and
      // both menus would otherwise stay visible at once.
      presetsMenu.close(true);
 setPanelAnchorTarget(anchorTarget); revertPreview(); colorPanel.innerHTML = '';
  const stickId = anchorTarget?.dataset?.btn;
  const isStickTarget = stickId === 'LS' || stickId === 'RS';
  let gridRenderSequence = 0;

    // mode toggle row (header) - horizontally scrollable for many tabs
    const toggle = document.createElement('div'); toggle.className = 'modeToggle colorPanelModeToggle ui-tabs';
    const leftGroup = document.createElement('div'); leftGroup.className = 'colorPanelModeGroup';
    // declare symbolBtn early to avoid TDZ when handlers reference it
    let symbolBtn = null;
    let fontBtn = null;
      const fontDiv = document.createElement('button'); fontDiv.className = 'fontBtn ui-tab'; fontDiv.textContent = 'FONT';
      const bgDiv = document.createElement('button'); bgDiv.className = 'bgBtn ui-tab'; bgDiv.textContent = 'FILL';
      const txtDiv = document.createElement('button'); txtDiv.className = 'txtBtn ui-tab'; txtDiv.textContent = 'TEXT';
      const outlineDiv = document.createElement('button'); outlineDiv.className = 'outlineBtn ui-tab'; outlineDiv.textContent = 'STROKE';
    let stickDiv = null;
    if (isStickTarget) {
      stickDiv = document.createElement('button'); stickDiv.className = 'stickBtn ui-tab'; stickDiv.textContent = 'STICK';
    }
    if (stickDiv) leftGroup.appendChild(stickDiv);
    leftGroup.appendChild(fontDiv); leftGroup.appendChild(bgDiv); leftGroup.appendChild(txtDiv); leftGroup.appendChild(outlineDiv); toggle.appendChild(leftGroup);

    // Content area (swatches, symbol grid, font grid)
    let swatchContainer = null;
    const contentArea = document.createElement('div');
    contentArea.style.flex = '1';
    contentArea.style.overflowY = 'auto';
    contentArea.style.minHeight = '0';
    contentArea.style.minWidth = '0';

    const stickControls = document.createElement('div');
    stickControls.className = 'stickControls';
    stickControls.style.display = 'none';
    stickControls.style.flexDirection = 'column';
    stickControls.classList.add('colorPanelControls');
    const stickState = isStickTarget ? (appState.buttons[stickId] = appState.buttons[stickId] || {}) : {};
    const stickMovement = getStickMovementEnabled(stickId);
    const showTrail = stickState.showTrail !== false;
    const stickRadius = Math.max(0, Math.min(100, parseInt(stickState.stickRadius ?? ANALOG_DEFAULTS.stickRadius, 10) || 0));
    const trailLength = Math.max(1, Math.min(60, parseInt(stickState.trailLength ?? stickState.trailSize ?? ANALOG_DEFAULTS.trailLength, 10) || ANALOG_DEFAULTS.trailLength));
    const trailWidth = Math.max(1, Math.min(40, parseInt(stickState.trailWidth ?? ANALOG_DEFAULTS.trailWidth, 10) || ANALOG_DEFAULTS.trailWidth));
    const baseVisibility = stickState.baseVisibility ?? stickState.showBase ?? ANALOG_DEFAULTS.baseVisibility;
    const baseSize = Math.max(20, Math.min(300, parseInt(stickState.baseSize ?? ANALOG_DEFAULTS.baseSize, 10) || ANALOG_DEFAULTS.baseSize));
    const makeGroupTitle = text => {
      const title = document.createElement('div'); title.className = 'colorPanelSectionTitle'; title.textContent = text; return title;
    };
    function makeStickCheckbox(labelText, checked, onChange) {
      const label = document.createElement('label'); label.className = 'ui-checkbox-label colorPanelCheckbox';
      const checkbox = document.createElement('input'); checkbox.type = 'checkbox'; checkbox.className = 'ui-checkbox'; checkbox.checked = checked;
      checkbox.addEventListener('change', () => { onChange(checkbox.checked); saveStateData(); });
      label.appendChild(checkbox); label.appendChild(document.createTextNode(labelText)); stickControls.appendChild(label);
      return checkbox;
    }
    stickControls.appendChild(makeGroupTitle('Movement'));
    let trailCheckbox = null;
    const movementCheckbox = makeStickCheckbox('Stick Movement', stickMovement, value => {
      stickState.stickMovement = value;
      if (trailCheckbox) trailCheckbox.disabled = !value;
      if (!value) stickTrailSystems[stickId]?.clear();
    });
    movementCheckbox.dataset.stickKey = 'stickMovement';
    const rangeRow = document.createElement('div'); rangeRow.className = 'colorPanelControlRow';
    const rangeLabel = document.createElement('span'); rangeLabel.className = 'ui-label colorPanelControlLabel'; rangeLabel.textContent = 'Range';
    const rangeSlider = document.createElement('input'); rangeSlider.type = 'range'; rangeSlider.min = '0'; rangeSlider.max = '100'; rangeSlider.step = '1'; rangeSlider.value = String(stickRadius); rangeSlider.className = 'ui-slider'; rangeSlider.dataset.stickKey = 'stickRadius';
    const rangeValue = document.createElement('input'); rangeValue.type = 'number'; rangeValue.min = '0'; rangeValue.max = '100'; rangeValue.step = '1'; rangeValue.value = String(stickRadius); rangeValue.className = 'ui-input colorPanelValue'; rangeValue.dataset.stickKey = 'stickRadius';
    const updateRange = value => {
      if (value === '') return;
      const next = Math.max(0, Math.min(100, parseInt(value, 10) || 0));
      rangeSlider.value = String(next); rangeValue.value = String(next); stickState.stickRadius = next; saveStateData();
    };
    rangeSlider.addEventListener('input', () => updateRange(rangeSlider.value));
    rangeValue.addEventListener('input', () => updateRange(rangeValue.value));
    rangeValue.addEventListener('blur', () => { if (rangeValue.value === '') updateRange(rangeSlider.value); });
    rangeRow.appendChild(rangeLabel); rangeRow.appendChild(rangeSlider); rangeRow.appendChild(rangeValue); stickControls.appendChild(rangeRow);
    stickControls.appendChild(makeGroupTitle('Trail'));
    trailCheckbox = makeStickCheckbox('Show Trail', showTrail, value => { stickState.showTrail = value; if (!value) stickTrailSystems[stickId]?.clear(); });
    trailCheckbox.dataset.stickKey = 'showTrail';
    trailCheckbox.disabled = !stickMovement;
    const makeTrailSlider = (labelText, initialValue, min, max, key) => {
      const row = document.createElement('div'); row.className = 'colorPanelControlRow';
      const label = document.createElement('span'); label.className = 'ui-label colorPanelControlLabel'; label.textContent = labelText;
      const slider = document.createElement('input'); slider.type = 'range'; slider.min = String(min); slider.max = String(max); slider.step = '1'; slider.value = String(initialValue); slider.className = 'ui-slider'; slider.dataset.stickKey = key;
      const value = document.createElement('input'); value.type = 'number'; value.min = String(min); value.max = String(max); value.step = '1'; value.value = String(initialValue); value.className = 'ui-input colorPanelValue'; value.dataset.stickKey = key;
      const update = raw => {
        if (raw === '') return;
        const parsed = parseInt(raw, 10);
        if (!Number.isFinite(parsed) || parsed < min || parsed > max) return;
        const next = parsed;
        slider.value = String(next); value.value = String(next); stickState[key] = next;
        if (stickTrailSystems[stickId]) stickTrailSystems[stickId].config[key] = next;
        if (key === 'baseSize') updateAnalogStickBases();
        saveStateData();
      };
      slider.addEventListener('input', () => update(slider.value));
      value.addEventListener('input', () => update(value.value));
      value.addEventListener('blur', () => { const parsed = parseInt(value.value, 10); if (!Number.isFinite(parsed) || parsed < min || parsed > max) update(slider.value); });
      row.appendChild(label); row.appendChild(slider); row.appendChild(value); stickControls.appendChild(row);
    };
    makeTrailSlider('Width', trailWidth, 1, 40, 'trailWidth');
    makeTrailSlider('Length', trailLength, 1, 60, 'trailLength');
    stickControls.appendChild(makeGroupTitle('Appearance'));
    const baseCheckbox = makeStickCheckbox('Base Visibility', baseVisibility, value => { stickState.baseVisibility = value; updateAnalogStickBases(); });
    baseCheckbox.dataset.stickKey = 'baseVisibility';
    makeTrailSlider('Size', baseSize, 20, 300, 'baseSize');
    contentArea.appendChild(stickControls);

    // Slider area (bottom)
    const sliderArea = document.createElement('div');
    sliderArea.className = 'colorPanelSliderArea';

    // Outline sliders (In/Out) - with numeric inputs and a single shared "All" toggle
    const sliderWrapper = document.createElement('div'); sliderWrapper.className = 'colorPanelOutlineControls'; sliderWrapper.style.display = 'none';
      const innerLabel = document.createElement('span'); innerLabel.className = 'ui-label colorPanelControlLabel'; innerLabel.textContent = 'In';
      const innerSlider = document.createElement('input'); innerSlider.type = 'range'; innerSlider.min = 0; innerSlider.max = 10; innerSlider.step = 1; innerSlider.className = 'ui-slider colorPanelOutlineSlider';
      const innerValue = document.createElement('input'); innerValue.type = 'number'; innerValue.min = 0; innerValue.max = 10; innerValue.step = 1; innerValue.value = 0; innerValue.className = 'ui-input colorPanelSmallValue';
      const outerLabel = document.createElement('span'); outerLabel.className = 'ui-label colorPanelControlLabel'; outerLabel.textContent = 'Out';
      const outerSlider = document.createElement('input'); outerSlider.type = 'range'; outerSlider.min = 0; outerSlider.max = 10; outerSlider.step = 1; outerSlider.className = 'ui-slider colorPanelOutlineSlider';
      const outerValue = document.createElement('input'); outerValue.type = 'number'; outerValue.min = 0; outerValue.max = 10; outerValue.step = 1; outerValue.value = 0; outerValue.className = 'ui-input colorPanelSmallValue';
      const outlineAllLabel = document.createElement('label'); outlineAllLabel.className = 'ui-checkbox-label colorPanelInlineControl';
      const outlineAllCheckbox = document.createElement('input'); outlineAllCheckbox.type = 'checkbox'; outlineAllCheckbox.className = 'outlineSizeAll ui-checkbox'; outlineAllLabel.appendChild(outlineAllCheckbox); outlineAllLabel.appendChild(document.createTextNode('All'));
    sliderWrapper.appendChild(innerLabel); sliderWrapper.appendChild(innerSlider); sliderWrapper.appendChild(innerValue); sliderWrapper.appendChild(outerLabel); sliderWrapper.appendChild(outerSlider); sliderWrapper.appendChild(outerValue); sliderWrapper.appendChild(outlineAllLabel);

    // Symbol size control - with numeric input
    const sizeCtrl = document.createElement('div'); sizeCtrl.className = 'symbolSizeControl colorPanelSizeControl ui-control-group';
      const sizeLabel = document.createElement('span'); sizeLabel.className = 'ui-label colorPanelControlLabel'; sizeLabel.textContent = 'Size';
    const sizeSlider = document.createElement('input'); sizeSlider.type = 'range'; sizeSlider.min = 0; sizeSlider.max = 200; sizeSlider.step = 10; sizeSlider.value = 100; sizeSlider.className = 'symbolSizeSlider ui-slider';
      const sizeValue = document.createElement('input'); sizeValue.type = 'number'; sizeValue.min = 0; sizeValue.max = 200; sizeValue.step = 10; sizeValue.value = 100; sizeValue.className = 'symbolSizeValue ui-input colorPanelSymbolValue';
    sizeCtrl.appendChild(sizeLabel); sizeCtrl.appendChild(sizeSlider); sizeCtrl.appendChild(sizeValue);
    const clearBtn = document.createElement('button'); clearBtn.type = 'button'; clearBtn.className = 'clearSymbolBtn colorPanelClearButton ui-button'; clearBtn.textContent = 'Clear';
    sizeCtrl.appendChild(clearBtn);

    // Text size control (0-100px) - visible only in TEXT mode - with "All" checkbox
    const textSizeCtrl = document.createElement('div'); textSizeCtrl.className = 'textSizeControl colorPanelSizeControl ui-control-group';
      const textSizeLabel = document.createElement('span'); textSizeLabel.className = 'ui-label colorPanelControlLabel'; textSizeLabel.textContent = 'Size';
    const textSizeSlider = document.createElement('input'); textSizeSlider.type = 'range'; textSizeSlider.min = 0; textSizeSlider.max = 100; textSizeSlider.step = 1; textSizeSlider.value = 30; textSizeSlider.className = 'textSizeSlider colorPanelTextSlider ui-slider';
    const textSizeValue = document.createElement('input'); textSizeValue.type = 'number'; textSizeValue.min = 0; textSizeValue.max = 100; textSizeValue.step = 1; textSizeValue.value = textSizeSlider.value; textSizeValue.className = 'textSizeValue ui-input colorPanelTextValue';
    const textSizeAllLabel = document.createElement('label'); textSizeAllLabel.className = 'ui-checkbox-label colorPanelInlineControl';
    const textSizeAllCheckbox = document.createElement('input'); textSizeAllCheckbox.type = 'checkbox'; textSizeAllCheckbox.className = 'textSizeAll ui-checkbox'; textSizeAllLabel.appendChild(textSizeAllCheckbox); textSizeAllLabel.appendChild(document.createTextNode('All'));
    textSizeCtrl.appendChild(textSizeLabel); textSizeCtrl.appendChild(textSizeSlider); textSizeCtrl.appendChild(textSizeValue); textSizeCtrl.appendChild(textSizeAllLabel);

    // Helper to apply text size to all elements
    function applyTextSizeToAll(px) {
      const targets = [...Object.values(btnEls), base, stickWrapper, eightWayWrapper, joystick];
      targets.forEach(el => {
        el.style.fontSize = `${px}px`;
        if (el.dataset?.btn) {
          appState.buttons[el.dataset.btn] = appState.buttons[el.dataset.btn] || {};
          appState.buttons[el.dataset.btn].fontSize = el.style.fontSize;
        } else if (el === base) {
          appState.base.fontSize = el.style.fontSize;
        } else if (el === stickWrapper) {
          appState.joystick.fontSize = el.style.fontSize;
        } else if (el === eightWayWrapper) {
          appState.eightWayWrapper.fontSize = el.style.fontSize;
        } else if (el === joystick) {
          appState.joystickHead.fontSize = el.style.fontSize;
        }
      });
      saveStateData();
    }

    // Symbol size slider listener (applies size % to current selection)
    sizeSlider.addEventListener('input', () => {
      sizeValue.value = sizeSlider.value;
      const applyTarget = getSelected() || getPanelAnchorTarget(); if (!applyTarget) return; const btnId = applyTarget.dataset?.btn;
      applyTarget.style.backgroundSize = `${sizeSlider.value}% auto`;
      if (btnId) { appState.buttons[btnId] = appState.buttons[btnId] || {}; appState.buttons[btnId].backgroundSize = applyTarget.style.backgroundSize; saveStateData(); }
    });

    // Symbol size numeric input listener
    sizeValue.addEventListener('input', () => {
      let v = parseInt(sizeValue.value) || 0; if (v < 0) v = 0; if (v > 200) v = 200; sizeValue.value = v;
      try { sizeSlider.value = v; } catch (e) {}
      const applyTarget = getSelected() || getPanelAnchorTarget(); if (!applyTarget) return; const btnId = applyTarget.dataset?.btn;
      applyTarget.style.backgroundSize = `${v}% auto`;
      if (btnId) { appState.buttons[btnId] = appState.buttons[btnId] || {}; appState.buttons[btnId].backgroundSize = applyTarget.style.backgroundSize; saveStateData(); }
    });

    // Text size slider listener (applies font-size px to current selection or all)
    textSizeSlider.addEventListener('input', () => {
      // update numeric input to match slider
      try { textSizeValue.value = textSizeSlider.value; } catch (e) {}
      const applyAll = textSizeAllCheckbox.checked;
      if (applyAll) {
        applyTextSizeToAll(textSizeSlider.value);
      } else {
        const applyTarget = getSelected() || getPanelAnchorTarget(); if (!applyTarget) return; const btnId = applyTarget.dataset?.btn;
        // apply font size in pixels
        applyTarget.style.fontSize = textSizeSlider.value + 'px';
        if (btnId) { appState.buttons[btnId] = appState.buttons[btnId] || {}; appState.buttons[btnId].fontSize = applyTarget.style.fontSize; }
        else if (applyTarget === base) { appState.base.fontSize = applyTarget.style.fontSize; }
        saveStateData();
      }
    });

    // allow typing a value into the numeric field
    textSizeValue.addEventListener('input', () => {
      // clamp and sync slider
      let v = parseInt(textSizeValue.value) || 0; if (v < 0) v = 0; if (v > 100) v = 100; textSizeValue.value = v;
      try { textSizeSlider.value = v; } catch (e) {}
      const applyAll = textSizeAllCheckbox.checked;
      if (applyAll) {
        applyTextSizeToAll(v);
      } else {
        const applyTarget = getSelected() || getPanelAnchorTarget(); if (!applyTarget) return; const btnId = applyTarget.dataset?.btn;
        applyTarget.style.fontSize = v + 'px';
        if (btnId) { appState.buttons[btnId] = appState.buttons[btnId] || {}; appState.buttons[btnId].fontSize = applyTarget.style.fontSize; }
        else if (applyTarget === base) { appState.base.fontSize = applyTarget.style.fontSize; }
        saveStateData();
      }
    });

    clearBtn.addEventListener('click', () => {
      const applyTarget = getSelected() || getPanelAnchorTarget(); if (!applyTarget) return; const btnId = applyTarget.dataset?.btn;
      applyBgImage(applyTarget, '');
      applyTarget.style.backgroundSize = '';
      if (btnId && appState.buttons[btnId]) {
        // restore previous text color if available
        if (appState.buttons[btnId].prevColor !== undefined) {
          applyTarget.style.color = appState.buttons[btnId].prevColor || '';
          delete appState.buttons[btnId].prevColor;
        } else {
          if (appState.buttons[btnId].color === 'transparent') delete appState.buttons[btnId].color;
        }
        delete appState.buttons[btnId].backgroundImage;
        delete appState.buttons[btnId].backgroundSize;
      } else {
        applyTarget.style.color = '';
      }
      const grid = contentArea.querySelector('.symbolGrid'); if (grid) grid.querySelectorAll('.symbolCell').forEach(c => c.classList.remove('selected'));
      saveStateData();
    });

    // Add sliders to sliderArea
    sliderArea.appendChild(sliderWrapper);
    sliderArea.appendChild(sizeCtrl);
    sliderArea.appendChild(textSizeCtrl);

    const baseImageControl = document.createElement('div');
    baseImageControl.className = 'baseImageControl colorPanelControlRow';
    baseImageControl.style.display = anchorTarget === base ? 'grid' : 'none';
    const baseImageLabel = document.createElement('span');
    baseImageLabel.className = 'ui-label colorPanelControlLabel';
    baseImageLabel.textContent = 'Image';
    const baseImageInput = document.createElement('input');
    baseImageInput.type = 'text';
    baseImageInput.className = 'ui-input baseImageInput';
    baseImageInput.value = appState.base?.backgroundImage || getBgImagePath(base);
    baseImageInput.placeholder = 'URL or path';
    const baseImageButtons = document.createElement('div');
    baseImageButtons.className = 'baseImageButtons';
    const applyBaseImageButton = document.createElement('button');
    applyBaseImageButton.type = 'button';
    applyBaseImageButton.className = 'ui-button primary';
    applyBaseImageButton.textContent = 'Apply';
    const clearBaseImageButton = document.createElement('button');
    clearBaseImageButton.type = 'button';
    clearBaseImageButton.className = 'ui-button';
    clearBaseImageButton.textContent = 'Clear';
    baseImageButtons.appendChild(applyBaseImageButton);
    baseImageButtons.appendChild(clearBaseImageButton);
    baseImageControl.appendChild(baseImageLabel);
    baseImageControl.appendChild(baseImageInput);
    baseImageControl.appendChild(baseImageButtons);

    function applyBaseImage(value) {
      const image = value.trim();
      if (!image) return;
      applyBgImage(base, image);
      base.style.backgroundSize = 'cover';
      base.style.backgroundPosition = 'center';
      base.style.backgroundRepeat = 'no-repeat';
      appState.base.backgroundImage = image;
      appState.base.backgroundSize = 'cover';
      saveStateData();
    }

    applyBaseImageButton.addEventListener('click', () => applyBaseImage(baseImageInput.value));
    baseImageInput.addEventListener('keydown', event => {
      if (event.key === 'Enter') applyBaseImage(baseImageInput.value);
    });
    clearBaseImageButton.addEventListener('click', () => {
      applyBgImage(base, '');
      base.style.backgroundSize = '';
      base.style.backgroundPosition = '';
      base.style.backgroundRepeat = '';
      delete appState.base.backgroundImage;
      delete appState.base.backgroundSize;
      baseImageInput.value = '';
      saveStateData();
    });

    // Build panel structure: header -> content -> sliders
    colorPanel.appendChild(toggle);
    colorPanel.appendChild(contentArea);
    colorPanel.appendChild(sliderArea);
    colorPanel.appendChild(baseImageControl);

  function clearGrids() {
    contentArea.querySelectorAll('.symbolGrid, .fontGrid').forEach(grid => grid.remove());
    gridRenderSequence += 1;
  }

  function setStickPanelVisible(visible) {
    clearGrids();
    if (stickControls) {
      stickControls.classList.toggle('is-hidden', !visible);
      stickControls.style.display = visible ? 'flex' : 'none';
    }
    if (swatchContainer) swatchContainer.style.display = visible ? 'none' : '';
    if (visible) {
      sliderWrapper.style.display = 'none';
      sizeCtrl.style.display = 'none';
      textSizeCtrl.style.display = 'none';
    }
  }
  let mode = isStickTarget ? 'stick' : colorMode;
  function setActiveModeTab(activeTab) {
    [fontDiv, bgDiv, txtDiv, outlineDiv, stickDiv, symbolBtn].forEach(tab => tab?.classList.toggle('active', tab === activeTab));
    const baseImageControl = colorPanel.querySelector('.baseImageControl');
    if (baseImageControl) baseImageControl.style.display = (mode === 'bg' && (getSelected() || getPanelAnchorTarget()) === base) ? 'grid' : 'none';
  }

  bgDiv.addEventListener('click', () => {
    mode = 'bg'; colorMode = 'bg'; localStorage.setItem('colorMode', colorMode); setActiveModeTab(bgDiv); setStickPanelVisible(false);
    // restore UI and remove symbol grid only
    sliderWrapper.style.display = 'none'; if (typeof swatchContainer !== 'undefined') swatchContainer.style.display = '';
    // hide symbol size control when not in symbol mode
    try { sizeCtrl.style.display = 'none'; } catch (e) {}
    // hide text size control when not in text mode
    try { textSizeCtrl.style.display = 'none'; } catch (e) {}
    const grid = contentArea.querySelector('.symbolGrid'); if (grid) grid.remove();
    const fontGrid = contentArea.querySelector('.fontGrid'); if (fontGrid) fontGrid.remove();
  });
  txtDiv.addEventListener('click', () => {
    mode = 'text'; colorMode = 'text'; localStorage.setItem('colorMode', colorMode); setActiveModeTab(txtDiv); setStickPanelVisible(false);
    sliderWrapper.style.display = 'none'; if (typeof swatchContainer !== 'undefined') swatchContainer.style.display = '';
    // hide symbol size control when not in symbol mode
    try { sizeCtrl.style.display = 'none'; } catch (e) {}
    // show text size control when in text mode
    try { textSizeCtrl.style.display = 'flex'; } catch (e) {}
    const grid = contentArea.querySelector('.symbolGrid'); if (grid) grid.remove();
    const fontGrid = contentArea.querySelector('.fontGrid'); if (fontGrid) fontGrid.remove();
  });
  outlineDiv.addEventListener('click', () => {
    mode = 'outline'; colorMode = 'outline'; localStorage.setItem('colorMode', colorMode); setActiveModeTab(outlineDiv); setStickPanelVisible(false);
    // Ensure outline sliders are visible and grids are cleared
    clearGrids();
    sliderWrapper.style.display = 'flex';
    if (typeof swatchContainer !== 'undefined') swatchContainer.style.display = '';
    // hide symbol size control when not in symbol mode
    try { sizeCtrl.style.display = 'none'; } catch (e) {}
    // hide text size control when not in text mode
    try { textSizeCtrl.style.display = 'none'; } catch (e) {}
    updatePanelForSelection();
  });

  fontDiv.addEventListener('click', async () => {
    mode = 'font'; colorMode = 'font'; localStorage.setItem('colorMode', colorMode); setActiveModeTab(fontDiv); setStickPanelVisible(false);
    sliderWrapper.style.display = 'none'; if (typeof swatchContainer !== 'undefined') swatchContainer.style.display = 'none';
    // hide symbol size control when not in symbol mode
    try { sizeCtrl.style.display = 'none'; } catch (e) {}
    // hide text size control when not in text mode
    try { textSizeCtrl.style.display = 'none'; } catch (e) {}
    const grid = contentArea.querySelector('.symbolGrid'); if (grid) grid.remove();
    // show font grid
    await showFontGrid();
  });

  stickDiv?.addEventListener('click', () => {
    mode = 'stick'; setActiveModeTab(stickDiv); setStickPanelVisible(true);
  });

    innerSlider.addEventListener('input', () => {
      const applyAll = outlineAllCheckbox.checked;
      const width = Math.max(0, Math.min(15, parseInt(innerSlider.value))); innerValue.value = width;
      if (applyAll) {
        const targets = [...Object.values(btnEls)];
        targets.forEach(el => {
          let color = 'black'; const cs = window.getComputedStyle(el); if (cs.outlineColor && cs.outlineColor !== 'invert') color = cs.outlineColor;
          el.style.outline = `${width}px solid ${color}`; el.style.outlineOffset = `-${width}px`;
          if (el.dataset?.btn) { appState.buttons[el.dataset.btn] = appState.buttons[el.dataset.btn] || {}; appState.buttons[el.dataset.btn].outlineWidth = width; appState.buttons[el.dataset.btn].outlineColor = color; }
        });
        saveStateData();
      } else {
        const applyTarget = getSelected() || getPanelAnchorTarget(); if (!applyTarget) return; const btnId = applyTarget.dataset?.btn;
        let color = 'black'; if (btnId && appState.buttons[btnId]?.outlineColor) color = appState.buttons[btnId].outlineColor; else { const cs = window.getComputedStyle(applyTarget); color = cs.outlineColor && cs.outlineColor !== 'invert' ? cs.outlineColor : 'black'; }
        applyTarget.style.outline = `${width}px solid ${color}`; applyTarget.style.outlineOffset = `-${width}px`;
        if (btnId) { appState.buttons[btnId] = appState.buttons[btnId] || {}; appState.buttons[btnId].outlineWidth = width; appState.buttons[btnId].outlineColor = color; }
        saveStateData();
      }
    });

    innerValue.addEventListener('input', () => {
      let v = parseInt(innerValue.value) || 0; if (v < 0) v = 0; if (v > 10) v = 10; innerValue.value = v;
      try { innerSlider.value = v; } catch (e) {}
      const applyAll = outlineAllCheckbox.checked;
      if (applyAll) {
        const targets = [...Object.values(btnEls)];
        targets.forEach(el => {
          let color = 'black'; const cs = window.getComputedStyle(el); if (cs.outlineColor && cs.outlineColor !== 'invert') color = cs.outlineColor;
          el.style.outline = `${v}px solid ${color}`; el.style.outlineOffset = `-${v}px`;
          if (el.dataset?.btn) { appState.buttons[el.dataset.btn] = appState.buttons[el.dataset.btn] || {}; appState.buttons[el.dataset.btn].outlineWidth = v; appState.buttons[el.dataset.btn].outlineColor = color; }
        });
        saveStateData();
      } else {
        const applyTarget = getSelected() || getPanelAnchorTarget(); if (!applyTarget) return; const btnId = applyTarget.dataset?.btn;
        let color = 'black'; if (btnId && appState.buttons[btnId]?.outlineColor) color = appState.buttons[btnId].outlineColor; else { const cs = window.getComputedStyle(applyTarget); color = cs.outlineColor && cs.outlineColor !== 'invert' ? cs.outlineColor : 'black'; }
        applyTarget.style.outline = `${v}px solid ${color}`; applyTarget.style.outlineOffset = `-${v}px`;
        if (btnId) { appState.buttons[btnId] = appState.buttons[btnId] || {}; appState.buttons[btnId].outlineWidth = v; appState.buttons[btnId].outlineColor = color; }
        saveStateData();
      }
    });

    outerSlider.addEventListener('input', () => {
      const applyAll = outlineAllCheckbox.checked;
      const spread = Math.max(0, Math.min(15, parseInt(outerSlider.value))); outerValue.value = spread;
      if (applyAll) {
        const targets = [...Object.values(btnEls)];
        targets.forEach(el => {
          el.style.boxShadow = `0 0 0 ${spread}px black`;
          if (el.dataset?.btn) { appState.buttons[el.dataset.btn] = appState.buttons[el.dataset.btn] || {}; appState.buttons[el.dataset.btn].boxShadowSpread = spread; }
        });
        saveStateData();
      } else {
        const applyTarget = getSelected() || getPanelAnchorTarget(); if (!applyTarget) return; const btnId = applyTarget.dataset?.btn;
        applyTarget.style.boxShadow = `0 0 0 ${spread}px black`;
        if (btnId) { appState.buttons[btnId] = appState.buttons[btnId] || {}; appState.buttons[btnId].boxShadowSpread = spread; }
        saveStateData();
      }
    });

    outerValue.addEventListener('input', () => {
      let v = parseInt(outerValue.value) || 0; if (v < 0) v = 0; if (v > 10) v = 10; outerValue.value = v;
      try { outerSlider.value = v; } catch (e) {}
      const applyAll = outlineAllCheckbox.checked;
      if (applyAll) {
        const targets = [...Object.values(btnEls)];
        targets.forEach(el => {
          el.style.boxShadow = `0 0 0 ${v}px black`;
          if (el.dataset?.btn) { appState.buttons[el.dataset.btn] = appState.buttons[el.dataset.btn] || {}; appState.buttons[el.dataset.btn].boxShadowSpread = v; }
        });
        saveStateData();
      } else {
        const applyTarget = getSelected() || getPanelAnchorTarget(); if (!applyTarget) return; const btnId = applyTarget.dataset?.btn;
        applyTarget.style.boxShadow = `0 0 0 ${v}px black`;
        if (btnId) { appState.buttons[btnId] = appState.buttons[btnId] || {}; appState.buttons[btnId].boxShadowSpread = v; }
        saveStateData();
      }
    });

    swatchContainer = document.createElement('div'); swatchContainer.className = 'swatchContainer';
    swatchContainer.classList.add('colorPanelSwatches');
    const applyColor = color => {
      const applyTarget = getSelected() || getPanelAnchorTarget(); if (!applyTarget) return;
      const btnId = applyTarget.dataset?.btn;
      if (mode === 'bg') {
        applyTarget.style.backgroundColor = color;
        if (btnId) { appState.buttons[btnId] = appState.buttons[btnId] || {}; appState.buttons[btnId].backgroundColor = color; }
      } else if (mode === 'text') {
        applyTarget.style.color = color;
        if (btnId) { appState.buttons[btnId] = appState.buttons[btnId] || {}; appState.buttons[btnId].color = color; }
        else if (applyTarget === base) { appState.base.color = color; }
      } else if (mode === 'outline') {
        const width = parseInt(innerSlider.value) || 0; const spread = parseInt(outerSlider.value) || 0;
        applyTarget.style.outline = `${width}px solid ${color}`; applyTarget.style.outlineOffset = `-${width}px`; applyTarget.style.boxShadow = `0 0 0 ${spread}px black`;
        if (btnId) { appState.buttons[btnId] = appState.buttons[btnId] || {}; appState.buttons[btnId].outlineWidth = width; appState.buttons[btnId].outlineColor = color; appState.buttons[btnId].boxShadowSpread = spread; }
      }
      saveStateData();
    };
    const pickerButton = document.createElement('button');
    pickerButton.type = 'button'; pickerButton.className = 'colorPickerButton';
    pickerButton.title = 'Pick color from canvas'; pickerButton.setAttribute('aria-label', 'Pick color from canvas');
    pickerButton.innerHTML = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="m15 5 4 4M13 7l4 4m-9 9 9-9a2.83 2.83 0 0 0-4-4l-9 9-1 5 5-1Z"/></svg>';
    applyPickedColor = applyColor;
    pickerButton.addEventListener('click', () => colorPicker.start());
    swatchContainer.appendChild(pickerButton);
    PALETTE.forEach(c => {
      const s = document.createElement('div'); s.className = 'swatch'; s.dataset.color = c; s.title = c; s.style.background = c;
      s.addEventListener('click', () => applyColor(c));
      swatchContainer.appendChild(s);
    });

    contentArea.appendChild(swatchContainer);
    if (mode === 'stick') setStickPanelVisible(true);

  // --- Symbol selector ---
  // assign to previously-declared symbolBtn (avoid redeclaring block-scoped variable)
  symbolBtn = document.createElement('button'); symbolBtn.className = 'symbolBtn ui-tab'; symbolBtn.textContent = 'SYMBOL';
  leftGroup.appendChild(symbolBtn);
  // assign fontBtn
  fontBtn = fontDiv;

    let symbolsData = null;
    async function loadSymbols() {
      if (symbolsData) return symbolsData;
      try {
        const res = await fetch('symbols.json'); if (!res.ok) throw new Error('not found'); const parsed = await res.json();
        // Support both new structure (buttons/directions) and old `images` array for backward compatibility
        if (!parsed.buttons && parsed.images) {
          parsed.buttons = parsed.images; parsed.directions = parsed.images.filter(s => /up|down|left|right/i.test(s));
        }
        // Ensure arrays exist
        parsed.buttons = Array.isArray(parsed.buttons) ? parsed.buttons : [];
        parsed.directions = Array.isArray(parsed.directions) ? parsed.directions : [];
        symbolsData = parsed; return symbolsData;
      } catch (e) { console.warn('Could not load symbols.json', e); symbolsData = { buttons: [], directions: [], symbolSize: 40, symbolGap: 5 }; return symbolsData; }
    }

    async function showSymbolGrid() {
      clearGrids();
      const renderSequence = gridRenderSequence;
      const data = await loadSymbols();
      if (renderSequence !== gridRenderSequence || mode !== 'symbol' || !contentArea.isConnected) return;
      const grid = document.createElement('div'); grid.className = 'symbolGrid';
      document.documentElement.style.setProperty('--symbol-size', (data.symbolSize || 48) + 'px');
      document.documentElement.style.setProperty('--symbol-gap', (data.symbolGap || 8) + 'px');
      // Decide which images to show based on currently selected button (directions for dpad, buttons otherwise)
      const applyTarget = getSelected() || getPanelAnchorTarget();
      const btnId = applyTarget?.dataset?.btn;
      // Define direction keys (case-insensitive)
      const directionKeys = ['Up','Down','Left','Right','up','down','left','right'];
      let images = [];
      if (btnId && directionKeys.includes(btnId)) {
        images = data.directions && data.directions.length ? data.directions : data.buttons || [];
      } else {
        images = data.buttons && data.buttons.length ? data.buttons : data.directions || [];
      }
      images = images || [];

      // use persistent sizeSlider/clearBtn created above

      // Build cells
      images.forEach(src => {
        const cell = document.createElement('div'); cell.className = 'symbolCell'; cell.title = src; applyBgImage(cell, src);
        // preview on mouseenter
        cell.addEventListener('mouseenter', () => {
          const applyTarget = getSelected() || getPanelAnchorTarget(); if (!applyTarget) return;
          // save previous values
          if (currentPreviewTarget && currentPreviewTarget !== applyTarget) revertPreview();
          if (applyTarget.dataset._prevBgImage === undefined) applyTarget.dataset._prevBgImage = applyTarget.style.backgroundImage || '';
          if (applyTarget.dataset._prevBgSize === undefined) applyTarget.dataset._prevBgSize = applyTarget.style.backgroundSize || '';
          applyBgImage(applyTarget, src);
          // use percent slider value for preview if present
          const persistentSlider = colorPanel.querySelector('.symbolSizeSlider'); const pct = persistentSlider ? parseInt(persistentSlider.value) || 100 : 100; applyTarget.style.backgroundSize = `${pct}% auto`;
          currentPreviewTarget = applyTarget;
        });

        // on mouseleave, only revert if the preview target still exists AND it wasn't applied
        cell.addEventListener('mouseleave', () => {
          // if the preview target was applied (we cleared preview marker), don't revert
          if (!currentPreviewTarget) return; // already handled by click
          revertPreview();
        });

        // apply on click
        cell.addEventListener('click', () => {
          const applyTarget = getSelected() || getPanelAnchorTarget(); if (!applyTarget) return;
          const btnId = applyTarget.dataset?.btn;
          // set background image and size based on slider
          const persistentSlider = colorPanel.querySelector('.symbolSizeSlider'); const pct = persistentSlider ? parseInt(persistentSlider.value) || 100 : 100;
          applyBgImage(applyTarget, src);
          applyTarget.style.backgroundSize = `${pct}% auto`;
          if (btnId) {
            appState.buttons[btnId] = appState.buttons[btnId] || {};
            appState.buttons[btnId].backgroundImage = src;
            appState.buttons[btnId].backgroundSize = applyTarget.style.backgroundSize;
          }
          // save previous text color (persist) and set text color to transparent when applying a symbol
          if (btnId) {
            appState.buttons[btnId] = appState.buttons[btnId] || {};
            if (appState.buttons[btnId].prevColor === undefined) {
              // capture computed color as previous color
              const prev = window.getComputedStyle(applyTarget).color || '';
              appState.buttons[btnId].prevColor = prev;
            }
            appState.buttons[btnId].color = 'transparent';
          }
          applyTarget.style.color = 'transparent';
          // mark selected visually in grid
          grid.querySelectorAll('.symbolCell').forEach(c => c.classList.remove('selected'));
          cell.classList.add('selected');
          // Clear preview state so mouseleave won't revert
          if (applyTarget.dataset._prevBgImage !== undefined) delete applyTarget.dataset._prevBgImage;
          if (applyTarget.dataset._prevBgSize !== undefined) delete applyTarget.dataset._prevBgSize;
          // remove currentPreviewTarget to avoid revert
          currentPreviewTarget = null;
          saveStateData();
        });

        grid.appendChild(cell);
      });

  // grid appended below (sizeCtrl already in rightGroup at top)
  contentArea.appendChild(grid);
    }

    async function showFontGrid() {
      clearGrids();
      const renderSequence = gridRenderSequence;
      const fonts = await loadFontsList();
      if (renderSequence !== gridRenderSequence || mode !== 'font' || !contentArea.isConnected) return;
      const grid = document.createElement('div'); grid.className = 'fontGrid colorPanelFontGrid';
      fonts.forEach(font => {
        const item = document.createElement('button');
        item.type = 'button';
        item.textContent = font.name;
        item.style.fontFamily = font.cssFamily;
        item.style.border = 'none';
        item.style.background = 'transparent';
        item.style.color = '#eee';
        item.style.textAlign = 'center';
        item.style.cursor = 'pointer';
        item.style.borderRadius = '4px';
        item.style.transition = 'background 0.1s, transform 0.1s';
        item.style.whiteSpace = 'nowrap';
        item.style.overflow = 'hidden';
        item.style.textOverflow = 'ellipsis';
        item.addEventListener('mouseenter', () => { item.style.background = 'rgba(255,255,255,0.08)'; item.style.transform = 'scale(1.02)'; });
        item.addEventListener('mouseleave', () => { item.style.background = 'transparent'; item.style.transform = 'scale(1)'; });
        item.addEventListener('click', () => {
          // Apply font to ALL editable objects
          const targets = [base, stickWrapper, eightWayWrapper, joystick, ...Object.values(btnEls)];
          targets.forEach(el => {
            el.style.fontFamily = font.cssFamily;
            if (el.dataset?.btn) {
              appState.buttons[el.dataset.btn] = appState.buttons[el.dataset.btn] || {};
              appState.buttons[el.dataset.btn].fontFamily = font.cssFamily;
            } else if (el === base) {
              appState.base.fontFamily = font.cssFamily;
            } else if (el === stickWrapper) {
              appState.joystick.fontFamily = font.cssFamily;
            } else if (el === eightWayWrapper) {
              appState.eightWayWrapper.fontFamily = font.cssFamily;
            } else if (el === joystick) {
              appState.joystickHead.fontFamily = font.cssFamily;
            }
          });
          // Preload the font
          if (font.url) {
            const link = document.createElement('link');
            link.rel = 'stylesheet';
            link.href = font.url;
            document.head.appendChild(link);
          }
          // Mark selected visually
          grid.querySelectorAll('button').forEach(b => b.style.background = 'transparent');
          item.style.background = 'rgba(255,255,255,0.15)';
          saveStateData();
          showToast('Font applied to all objects: ' + font.name, 1000);
        });
        grid.appendChild(item);
      });
      contentArea.appendChild(grid);
    }

    symbolBtn.addEventListener('click', async () => {
      // activate symbol mode UI and hide swatches + sliders
      mode = 'symbol'; colorMode = 'symbol'; localStorage.setItem('colorMode', colorMode); setActiveModeTab(symbolBtn); setStickPanelVisible(false); swatchContainer.style.display = 'none';
      // hide the In/Out slider wrapper when symbol panel is active
      if (typeof sliderWrapper !== 'undefined') sliderWrapper.style.display = 'none';
      // show symbol size control when in symbol mode, hide text size control
      try { sizeCtrl.style.display = 'flex'; } catch (e) {}
      try { textSizeCtrl.style.display = 'none'; } catch (e) {}
      await showSymbolGrid();
    });

      // Restore the saved mode through the same handlers used by user input.
      if (mode === 'symbol') symbolBtn.click();
      else if (mode === 'font') fontDiv.click();
      else if (mode === 'text') txtDiv.click();
      else if (mode === 'outline') outlineDiv.click();
      else if (mode === 'stick') stickDiv?.click();
      else bgDiv.click();

  // clamp - responsive sizing to fit viewport
  colorPanel.style.display = 'flex'; colorPanel.style.flexDirection = 'column'; colorPanel.style.left = '0px'; colorPanel.style.top = '0px';
  colorPanel.style.maxWidth = '90vw';
  colorPanel.style.maxHeight = '85vh';
    const viewportWidth = window.innerWidth; const viewportHeight = window.innerHeight;
    // Initial position
    let left = x; let top = y + 40;
    // Force layout to get actual size within constraints
    colorPanel.style.left = left + 'px'; colorPanel.style.top = top + 'px';
    const panelRect = colorPanel.getBoundingClientRect();
    // Reposition if overflowing viewport
    if (left + panelRect.width > viewportWidth) left = Math.max(8, viewportWidth - panelRect.width - 10);
    if (top + panelRect.height > viewportHeight) top = Math.max(8, viewportHeight - panelRect.height - 10);
    // Avoid obstructing the anchor target element
    if (getPanelAnchorTarget()) {
      const targetRect = getPanelAnchorTarget().getBoundingClientRect();
      const panelW = panelRect.width;
      const panelH = panelRect.height;
      // Check if panel would overlap target
      const overlaps = !(left + panelW < targetRect.left || left > targetRect.right || top + panelH < targetRect.top || top > targetRect.bottom);
      if (overlaps) {
        // Try to position panel to the right of target
        const rightSpace = viewportWidth - targetRect.right;
        const leftSpace = targetRect.left;
        const bottomSpace = viewportHeight - targetRect.bottom;
        const topSpace = targetRect.top;
        
        // Prefer right side if space permits, else left, else below, else above
        if (rightSpace >= panelW + 10) {
          left = targetRect.right + 8;
        } else if (leftSpace >= panelW + 10) {
          left = Math.max(8, targetRect.left - panelW - 8);
        } else if (bottomSpace >= panelH + 10) {
          top = targetRect.bottom + 8;
        } else if (topSpace >= panelH + 10) {
          top = Math.max(8, targetRect.top - panelH - 8);
        }
        // Re-clamp to viewport after offset
        if (left + panelW > viewportWidth) left = Math.max(8, viewportWidth - panelW - 10);
        if (top + panelH > viewportHeight) top = Math.max(8, viewportHeight - panelH - 10);
        if (left < 8) left = 8;
        if (top < 8) top = 8;
      }
    }
    colorPanel.style.left = left + 'px'; colorPanel.style.top = top + 'px';
    startUiHideTimer();
    // sync size slider and text-size slider to target
    try {
      const slider = colorPanel.querySelector('.symbolSizeSlider'); const valEl = colorPanel.querySelector('.symbolSizeValue');
      const applyTarget = getSelected() || getPanelAnchorTarget(); if (slider && applyTarget) {
        const cs = window.getComputedStyle(applyTarget); let bgSize = cs.backgroundSize || applyTarget.style.backgroundSize || '';
        const m = (applyTarget.style.backgroundSize || bgSize).match(/(\d+)/);
        if (m) { slider.value = parseInt(m[1]); if (valEl) valEl.value = slider.value; }
        else { slider.value = 100; if (valEl) valEl.value = slider.value; }
      }
      // sync text size slider value from applyTarget fontSize when in text mode
      try {
        const txtSlider = colorPanel.querySelector('.textSizeSlider'); const txtVal = colorPanel.querySelector('.textSizeValue');
        const applyTarget2 = getSelected() || getPanelAnchorTarget(); if (txtSlider && applyTarget2) {
          const cs2 = window.getComputedStyle(applyTarget2); let fs = cs2.fontSize || applyTarget2.style.fontSize || '';
          const m2 = (fs || '').match(/(\d+)/);
          if (m2) { txtSlider.value = parseInt(m2[1]); if (txtVal) txtVal.value = txtSlider.value; }
          else { txtSlider.value = 30; if (txtVal) txtVal.value = txtSlider.value; }
        }
      } catch (e) {}
    } catch (e) { }
// if the remembered mode is symbol, open the symbol grid automatically
      try {
        if (!isStickTarget && colorMode === 'symbol') {
          if (typeof sliderWrapper !== 'undefined') sliderWrapper.style.display = 'none';
          if (typeof swatchContainer !== 'undefined') swatchContainer.style.display = 'none';
          // mark symbol mode active and show size control when auto-opening symbol grid
          setActiveModeTab(symbolBtn);
          try { sizeCtrl.style.display = 'flex'; } catch (e) {}
          await showSymbolGrid();
        }
        // if the remembered mode is font, open the font grid automatically
        if (!isStickTarget && colorMode === 'font') {
          if (typeof sliderWrapper !== 'undefined') sliderWrapper.style.display = 'none';
          if (typeof swatchContainer !== 'undefined') swatchContainer.style.display = 'none';
          setActiveModeTab(fontBtn);
          try { sizeCtrl.style.display = 'none'; } catch (e) {}
          try { textSizeCtrl.style.display = 'none'; } catch (e) {}
          await showFontGrid();
        }
        // if the remembered mode is text, show text size control
        if (!isStickTarget && colorMode === 'text') {
        try { textSizeCtrl.style.display = 'flex'; } catch (e) {}
        // also sync the slider to the current selection
        try {
          const txtSlider = colorPanel.querySelector('.textSizeSlider'); const txtVal = colorPanel.querySelector('.textSizeValue');
          const applyTarget2 = getSelected() || getPanelAnchorTarget(); if (txtSlider && applyTarget2) {
            const cs2 = window.getComputedStyle(applyTarget2); let fs = cs2.fontSize || applyTarget2.style.fontSize || '';
            const m2 = (fs || '').match(/(\d+)/);
            if (m2) { txtSlider.value = parseInt(m2[1]); if (txtVal) txtVal.value = txtSlider.value; }
            else { txtSlider.value = 30; if (txtVal) txtVal.value = txtSlider.value; }
          }
        } catch (e) {}
      }
    } catch (e) { console.warn('Could not auto-open symbol grid', e); }
    } catch (err) {
      console.error('openColorPanel failed', err);
      try { colorPanel.style.display = 'none'; stopUiHideTimer(); } catch (_) {}
    }
  }

  function updatePanelForSelection() {
    if (!colorPanel) return;
    const applyTarget = getSelected() || getPanelAnchorTarget();
    const baseImageControl = colorPanel.querySelector('.baseImageControl');
    if (baseImageControl) {
      baseImageControl.style.display = (colorMode === 'bg' && applyTarget === base) ? 'grid' : 'none';
      if (applyTarget === base) {
        const input = baseImageControl.querySelector('.baseImageInput');
        if (input) input.value = appState.base?.backgroundImage || getBgImagePath(base);
      }
    }
    const btnId = applyTarget?.dataset?.btn;
    if (btnId === 'LS' || btnId === 'RS') {
      const state = appState.buttons[btnId] || {};
      const values = {
        stickMovement: getStickMovementEnabled(btnId),
        showTrail: state.showTrail !== false,
        stickRadius: Math.max(0, Math.min(100, parseInt(state.stickRadius ?? ANALOG_DEFAULTS.stickRadius, 10) || 0)),
        trailWidth: Math.max(1, Math.min(40, parseInt(state.trailWidth ?? 12, 10) || 12)),
        trailLength: Math.max(1, Math.min(60, parseInt(state.trailLength ?? state.trailSize ?? ANALOG_DEFAULTS.trailLength, 10) || ANALOG_DEFAULTS.trailLength)),
        baseVisibility: state.baseVisibility ?? state.showBase ?? ANALOG_DEFAULTS.baseVisibility,
        baseSize: Math.max(20, Math.min(300, parseInt(state.baseSize ?? ANALOG_DEFAULTS.baseSize, 10) || ANALOG_DEFAULTS.baseSize))
      };
      colorPanel.querySelectorAll('[data-stick-key]').forEach(control => {
        const value = values[control.dataset.stickKey];
        if (control.type === 'checkbox') control.checked = Boolean(value);
        else if (value !== undefined) control.value = String(value);
      });
      const movement = colorPanel.querySelector('[data-stick-key="stickMovement"]');
      const trail = colorPanel.querySelector('[data-stick-key="showTrail"]');
      if (trail) trail.disabled = !movement?.checked;
    }
    if (colorMode !== 'outline') return;
    // Select the outline sliders by their dedicated class rather than by DOM
    // index â€” the panel contains many range inputs (stick, symbol, text, outline)
    // and relying on index order picked the wrong sliders, so the stroke values
    // never reflected the selected object's actual settings.
    const outlineSliders = colorPanel.querySelectorAll('input[type="range"].colorPanelOutlineSlider');
    if (outlineSliders.length < 2) return;
    const innerSlider = outlineSliders[0], innerValue = innerSlider.nextElementSibling, outerSlider = outlineSliders[1], outerValue = outerSlider.nextElementSibling;
    if (!applyTarget) return; const cs = window.getComputedStyle(applyTarget);
    let outlineWidth = 0, outlineColor = 'black';
    if (btnId && appState.buttons[btnId]?.outlineWidth != null) { outlineWidth = appState.buttons[btnId].outlineWidth; outlineColor = appState.buttons[btnId].outlineColor ?? 'black'; }
    else { outlineWidth = parseInt(cs.outlineWidth) || 0; outlineColor = cs.outlineColor && cs.outlineColor !== 'invert' ? cs.outlineColor : 'black'; }
    outlineWidth = Math.max(0, Math.min(10, outlineWidth));
    let spread = 0;
    if (btnId && appState.buttons[btnId]?.boxShadowSpread != null) spread = appState.buttons[btnId].boxShadowSpread;
    else { const boxShadow = cs.boxShadow; if (boxShadow && boxShadow !== 'none') { const parts = boxShadow.match(/-?\d+px/g); if (parts && parts.length >= 4) spread = parseInt(parts[3]) || 0; } }
    spread = Math.max(0, Math.min(10, spread));
    innerSlider.value = outlineWidth; if (innerValue) innerValue.value = outlineWidth; outerSlider.value = spread; if (outerValue) outerValue.value = spread;
  }

  return { openColorPanel, closeColorPanel, revertPreview, updatePanelForSelection, getElement: () => colorPanel };
}
