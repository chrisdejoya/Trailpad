import { createTrailSystem } from './js/trail.js';
import { TrailChainClient, getControllerKey as trailchainControllerKeyOf } from './js/trailchain-client.js';
import { createDonateButton } from './js/donate-button.js';
import { createRemapButton, DEFAULT_BUTTON_MAP, DPAD_DIRECTIONS } from './js/button-remap.js';
import { PALETTE } from './js/palette.js';
import { getDpadDirection, directionFromVector, vectorFromDirection, getDpadComponents } from './js/dpad.js';
import { radialDeadzone, clampRoundedSquare, getAnalogStick } from './js/stick-math.js';
import { loadFontsList, preloadFontsForLayout } from './js/fonts.js';
import { createColorPanel } from './js/color-panel.js';
import { normalizeBgImage, applyBgImage } from './js/bg-image.js';
import { controllerHasInput, detectActiveGamepad } from './js/input-detect.js';
import { createClipboardIO } from './js/clipboard-io.js';
import { createProfiles } from './js/profiles.js';
import { createPresetsMenu } from './js/presets-menu.js';
import { createLayoutState } from './js/layout-state.js';
import { createSizing } from './js/sizing.js';
import { createRenderState } from './js/render-state.js';
import { createSelection } from './js/selection.js';
import { createStickUpdate } from './js/stick-update.js';
import { createCursor } from './js/cursor.js';
import { createToast } from './js/toast.js';
import { createStatePersistence } from './js/state-persistence.js';
import { createUiHideTimer } from './js/ui-hide-timer.js';

window.addEventListener('DOMContentLoaded', () => {
  const STORAGE_KEY = 'trailpad_1';
  const PROFILE_COUNT = 8;

  // Trailpad's input convention lives in js/button-remap.js: logical input ->
  // physical button index of the Gamepad API "standard" mapping. The remap panel
  // edits a copy of that table, and updateButtonsFromPad/getDpadDirection (in
  // js/dpad.js) read it back every frame so custom mappings drive the
  // on-screen highlights.
  let buttonMap = Object.assign({}, DEFAULT_BUTTON_MAP);

  // Config defaults.
  const cfg = {
    deadzone: 0.1,
    trail: 8,
    invertY: false,
    ignoredForJoystick: ['View', 'Menu', 'Up', 'Down', 'Left', 'Right'],
  };
  const ANALOG_DEFAULTS = {
    stickMovement: true,
    stickRadius: 8,
    trailWidth: 12,
    trailLength: 8,
    baseVisibility: false,
    baseSize: 100,
  };

  // DOM element references.
  const btnEls = {};
  document.querySelectorAll('.btn').forEach(el => {
    btnEls[el.dataset.btn] = el;
    // Smooth visual feedback for analog changes (triggers / press scale).
    // Include top/left so position changes animate instead of snapping
    // (this preserves stylesheet transitions).
    try {
      el.style.transition = 'filter 30ms linear, transform 30ms linear, top 30ms linear, left 30ms linear';
    } catch (e) {}
  });
  const base = document.getElementById('base');
  const stickWrapper = document.getElementById('stickWrapper');
  const joystick = document.getElementById('joystickHead');
  const eightWayWrapper = document.getElementById('eightWayWrapper');
  const canvas = document.getElementById('stickCanvas');
  const ctx = canvas.getContext('2d');
  let colorPanel;
  // Color panel element - assigned from js/color-panel.js once the factory runs.

  // Toast notifications live in js/toast.js; the #toast element is injected.
  // Function declaration hoisting does NOT apply to this const, so it must
  // run before any factory call below that receives showToast.
  const toastEl = document.getElementById('toast');
  const { showToast } = createToast({ toastEl });
  const markers = Array.from({ length: 8 }, (_, i) => document.getElementById('marker' + i));
  const donateButton = createDonateButton();
  document.body.appendChild(donateButton.element);
  // Remap popup sits next to the donate button: it walks the user through
  // Trailpad's logical inputs and saves the physical button pressed for each one.
  const remapButton = createRemapButton({
    getMapping: () => buttonMap,
    onApply: (nextMap) => {
      buttonMap = Object.assign({}, DEFAULT_BUTTON_MAP, nextMap);
      saveStateData();
    },
    showToast,
  });
  document.body.appendChild(remapButton.element);

  const arrowSize = { value: 90 };

  // Stick trail and base refs.
  const stickTrailCanvases = {
    LS: document.getElementById('LSTrailCanvas'),
    RS: document.getElementById('RSTrailCanvas'),
  };
  const analogStickBases = {
    LS: document.getElementById('LSBase'),
    RS: document.getElementById('RSBase'),
  };

  // Distance readouts removed (no on-screen numeric distance).

  // Per-stick analog settings live in buttons.LS/RS; analog stores trigger-only preferences.

  // App state.
  let appState = {
    buttons: {},
    joystick: {},
    joystickHead: {},
    base: {},
    eightWayWrapper: { arrowSize: 90 },
    hiddenButtons: [],
    trailColor: getComputedStyle(document.documentElement).getPropertyValue('--trail-color') || '#CEEC73',
    profiles: {},
  };

  // Cursor element for selection bounding box (DOM lives in js/cursor.js;
  // the selected element crosses via accessor, same as js/selection.js).
  // Declared before `selected` below: the factory only reads it lazily via
  // getSelected, so referencing the hoisted `let` here is safe.
  const cursor = createCursor({ getSelected: () => selected });
  const updateCursor = cursor.updateCursor;

  // Auto-hide timer for UI menus (color panel, presets menu) lives in
  // js/ui-hide-timer.js. The timer itself stays here but its expiry callback
  // trio is main.js-owned, so it crosses via injected callbacks closing over
  // the factories/panels below (called lazily at fire time, after setup).
  // NOTE: closeContextMenus is a hoisted function declaration below, so
  // referencing it here before its definition line is safe.
  const UI_HIDE_DELAY = 5000;
  const uiHide = createUiHideTimer({
    UI_HIDE_DELAY,
    isRemapOpen: () => remapButton.isOpen(),
    closeContextMenus: (...a) => closeContextMenus(...a),
    hideCursor: () => cursor.hideCursor(),
    hideWidgets: () => {
      donateButton.hide();
      remapButton.hide();
    },
    showWidgets: () => {
      donateButton.show();
      remapButton.show();
    },
  });
  const { startUiHideTimer, stopUiHideTimer, resetUiHideTimer } = uiHide;
  uiHide.installActivityListeners();
  // Add analog configuration to appState (persisted).
  // pressureEnabled: whether LT/RT respond to analog pressure.
  // minTriggerBrightness/maxTriggerBrightness: mapping from 0..1 trigger value to brightness.
  appState.analog = {
    pressureEnabled: true,
    minTriggerBrightness: 1.0,
    maxTriggerBrightness: 3.0,
    triggerDeadzone: 0.1,
  };
  let selected = null;
  let lastPressedTimes = {};
  let activeGamepadIndex = null;
  let selectedNativeGamepadIndex = null;
  let trailChain = null;
  let padSource = 'gamepad';
  let panelAnchorTarget = null;
  let currentPreviewTarget = null;
  let trailSystem = null;
  const stickTrailSystems = {};

  // capture default joystick head style
  const defaultHead = window.getComputedStyle(joystick);
  appState.joystickHead = {
    backgroundColor: defaultHead.backgroundColor,
    backgroundImage: joystick.style.backgroundImage && joystick.style.backgroundImage !== 'none' ? normalizeBgImage(joystick.style.backgroundImage) : normalizeBgImage(defaultHead.backgroundImage),
    color: defaultHead.color,
    borderRadius: defaultHead.borderRadius,
    boxShadow: defaultHead.boxShadow,
    outline: defaultHead.outline,
    outlineOffset: defaultHead.outlineOffset,
    fontSize: defaultHead.fontSize
  };

  // Global mouse activity listener to reset auto-hide timer
  document.addEventListener('mousemove', resetUiHideTimer);
  document.addEventListener('mousedown', resetUiHideTimer);
  document.addEventListener('keydown', resetUiHideTimer);
  document.addEventListener('wheel', resetUiHideTimer, { passive: true });

  // --- Helpers (centralized to reduce repetition) ---
  // Layout snapshot/apply + element property helpers live in js/layout-state.js.
  // appState/ANALOG_DEFAULTS/els are shared by reference; arrowSize crosses via
  // accessors; saveStateData is a delegating wrapper (defined below before the
  // persistence factory) so hoisting differences can't break this call.
  // getBgImagePath is a hoisted function declaration.
  const layout = createLayoutState({
    appState, ANALOG_DEFAULTS,
    els: { base, stickWrapper, eightWayWrapper, joystick, btnEls },
        getArrowSize: () => arrowSize.value,
    setArrowSize: v => { if (v !== undefined) arrowSize.value = v; },
    getResizeEightWayArrows: () => resizeEightWayArrows,
    updateAnalogStickBases, saveStateData, getBgImagePath
  });
  const { applyPropertiesToElement, applyAndStore, getExportBgImagePath, captureElementProperties, applyJoystickHeadFromState, exportLayout, importLayout } = layout;

  // App-state persistence (localStorage save/load) lives in
  // js/state-persistence.js. updateStateData/resizeJoystickWrapper are hoisted
  // function declarations below; the get/set buttonMap accessors keep the
  // remap panel as the single writer. The saveStateData wrapper is hoisted so
  // factories above can already reference it; it delegates to the api object
  // assigned here.
  let persistenceApi = null;
  function saveStateData() { persistenceApi?.saveStateData(); }

  const persistence = () => persistenceApi;

  // Helper to get backgroundImage path while preserving relative URLs
  function getBgImagePath(el) {
    const btnId = el.dataset && el.dataset.btn;
    const inlineBg = el.style.backgroundImage;
    if (inlineBg && inlineBg !== 'none') return normalizeBgImage(inlineBg);
    if (btnId && appState.buttons?.[btnId]?.backgroundImage) return normalizeBgImage(appState.buttons[btnId].backgroundImage);
    if (el === base && appState.base?.backgroundImage) return normalizeBgImage(appState.base.backgroundImage);
    if (el === stickWrapper && appState.joystick?.backgroundImage) return normalizeBgImage(appState.joystick.backgroundImage);
    if (el === eightWayWrapper && appState.eightWayWrapper?.backgroundImage) return normalizeBgImage(appState.eightWayWrapper.backgroundImage);
    if (el === joystick && appState.joystickHead?.backgroundImage) return normalizeBgImage(appState.joystickHead.backgroundImage);
    const cs = window.getComputedStyle(el);
    const abs = cs.backgroundImage;
    if (!abs || abs === 'none') return '';
    const m = abs.match(/^url\(["']?([^"')]+)["']?\)$/i);
    if (!m) return abs;
    try {
      const url = new URL(m[1], document.baseURI);
      const docDir = new URL('.', document.baseURI).pathname;
      let rel = url.pathname;
      if (rel.startsWith(docDir)) rel = rel.slice(docDir.length);
      return rel + url.search;
    } catch (e) {
      return m[1];
    }
  }

  // unified applyJoystickHead

  // export/import layout helpers

  // --- UI helpers ---
  // Selection helpers live in js/selection.js; selection state crosses via
  // accessors. revertPreview/updatePanelForSelection/updateCursor are hoisted
  // function declarations (or assigned before first use), so passing them
  // here by reference is safe.
  const selection = createSelection({
    appState,
    els: { base, stickWrapper, eightWayWrapper, joystick },
    getSelected: () => selected,
    setSelected: v => { selected = v; },
    setPanelAnchorTarget: v => { panelAnchorTarget = v; },
    getColorPanel: () => colorPanel,
    revertPreview: (...a) => revertPreview(...a),
    updatePanelForSelection: (...a) => updatePanelForSelection(...a),
    updateCursor
  });
  const { selectElement, stateForElement, deselect, updateArrowHighlights } = selection;

  // revertPreview lives in js/color-panel.js (it owns the preview state) and
  // is assigned from the module's api below.

  // arrow highlight helper

  // --- initial DOM wiring: clicks, dblclicks, contextmenu ---
  document.addEventListener('mousedown', (e) => {
    // Context menus share one outside-click lifecycle.
    if (colorPanel && (colorPanel.style.display === 'block' || colorPanel.style.display === 'flex') && !colorPanel.contains(e.target)) {
      closeColorPanel(true);
    }
    if (presetsMenu.element() && !presetsMenu.element().contains(e.target)) presetsMenu.close(true);
    // Clicks inside a floating panel belong to that panel: don't deselect or pick
    // up the base element sitting underneath it. (remapButton.panel is created by
    // js/button-remap.js and appended to the body there.)
    if (colorPanel?.contains(e.target) || presetsMenu.element()?.contains(e.target) || remapButton.panel?.contains(e.target)) return;
    const topEl = document.elementFromPoint(e.clientX, e.clientY);
    const isOnUI = !!topEl?.closest?.('.btn') || !!topEl?.closest?.('#stickWrapper') || !!topEl?.closest?.('#eightWayWrapper') || !!topEl?.closest?.('#base');
    if (isOnUI) return;
    const br = base.getBoundingClientRect();
    if (e.clientX >= br.left && e.clientX <= br.right && e.clientY >= br.top && e.clientY <= br.bottom) { selectElement(base); return; }
    deselect();
  });

  [base, stickWrapper, eightWayWrapper, joystick].forEach(el => {
    el.addEventListener('mousedown', e => { selectElement(el); e.stopPropagation(); });
  });

  Object.values(btnEls).forEach(btn => {
    btn.addEventListener('click', e => { selectElement(btn); lastPressedTimes[btn.dataset.btn] = performance.now(); showToast(btn.dataset.btn, 1000); e.stopPropagation(); if (colorPanel.style.display === 'block' || colorPanel.style.display === 'flex') panelAnchorTarget = btn; });
    btn.addEventListener('dblclick', e => {
      if (btn.querySelector('input')) return;
      const old = btn.textContent.trim(); btn.textContent = '';
      const input = document.createElement('input'); input.className = 'btn-edit'; input.value = old; btn.appendChild(input); input.focus(); input.select();
      function save() {
        const newLabel = input.value.trim(); if (btn.contains(input)) btn.removeChild(input); btn.textContent = newLabel;
        appState.buttons[btn.dataset.btn] = appState.buttons[btn.dataset.btn] || {}; appState.buttons[btn.dataset.btn].label = newLabel; saveStateData();
      }
      input.addEventListener('blur', save);
      input.addEventListener('keydown', ev => { if (ev.key === 'Enter') save(); if (ev.key === 'Escape') { if (btn.contains(input)) btn.removeChild(input); btn.textContent = old; } });
      e.stopPropagation();
    });
    // Long-press (hold ~0.5s) a pad button to arm its row in the mapping
    // panel: the next controller press is captured for that input alone.
    // Buttons only â€” the direction arrows (Up/Down/Left/Right) have no
    // editable label, and the base/joystick widgets are not buttons.
    if (DPAD_DIRECTIONS[btn.dataset.btn] === undefined) {
      let longPressTimer = 0;
      btn.addEventListener('pointerdown', e => {
        if (e.button !== 0) return;
        if (btn.querySelector('input')) return; // label edit in progress
        clearTimeout(longPressTimer);
        longPressTimer = setTimeout(() => {
          longPressTimer = 0;
          remapButton.listenFor(btn.dataset.btn);
          // Opening the panel mid-idle must not leave the circle button hidden.
          remapButton.show();
        }, 2000);
      });
      const cancelLongPress = () => { clearTimeout(longPressTimer); longPressTimer = 0; };
      btn.addEventListener('pointerup', cancelLongPress);
      btn.addEventListener('pointercancel', cancelLongPress);
      btn.addEventListener('pointerleave', cancelLongPress);
    }
  });

  // --- Keyboard/hotkeys ---
  // --- color panel (DOM + state live in js/color-panel.js) ---
   let openColorPanel, closeColorPanel, revertPreview, updatePanelForSelection;
   let clampResizeEightWayArrows, resizeEightWayArrows, snapLayoutToGrid;

  document.addEventListener('keydown', (e) => {
    const isEditableTarget = e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement || e.target.isContentEditable;

    // Snap to Grid
    if (e.ctrlKey && e.key.toLowerCase() === 't') { snapLayoutToGrid(10); saveStateData(); }

    // Reset
    if (e.ctrlKey && e.key.toLowerCase() === 'r') { e.preventDefault(); resetToDefault(); saveStateData(); }

    // Unhide all
    if (e.key === 'Home') {
      Object.values(btnEls).forEach(b => { b.style.display = 'flex'; appState.buttons[b.dataset.btn] = appState.buttons[b.dataset.btn] || {}; appState.buttons[b.dataset.btn].display = 'flex'; });
      eightWayWrapper.style.display = 'block'; appState.joystick.display = 'block'; appState.base.display = 'block'; stickWrapper.style.display = 'block'; base.style.display = 'block'; appState.hiddenButtons = []; saveStateData(); showToast('Show All Widgets', 1000); return;
    }

    // Profiles via F1..Fn
    if (e.key.startsWith('F')) {
      const n = parseInt(e.key.slice(1)); if (n >= 1 && n <= PROFILE_COUNT) { if (e.ctrlKey) { saveProfile(n); showToast('Profile ' + n + ' saved', 1000); } else { loadProfile(n); } }
    }

    if (e.ctrlKey && e.key.toLowerCase() === 'o') { e.preventDefault(); importInput.click(); return; }
    if (!isEditableTarget && e.ctrlKey && e.key.toLowerCase() === 'c') { e.preventDefault(); copyLayoutToClipboard(); return; }
    if (!isEditableTarget && e.ctrlKey && e.key.toLowerCase() === 'v') { e.preventDefault(); pasteLayoutFromClipboard(); return; }

    // Change the selected element's stacking order.
    if (e.key === 'PageUp' || e.key === 'PageDown') {
      e.preventDefault();
      if (!selected) { showToast('Select an element first', 1000); return; }
      const current = parseInt(window.getComputedStyle(selected).zIndex, 10);
      const next = (Number.isFinite(current) ? current : 0) + (e.key === 'PageUp' ? 1 : -1);
      const state = stateForElement(selected);
      selected.style.zIndex = String(next);
      if (state) state.zIndex = String(next);
      saveStateData();
      showToast(`Z-index: ${next}`, 1000);
      return;
    }

    // font size adjustments when ctrl+[ or ]
    if (e.ctrlKey && (e.key === '[' || e.key === ']')) {
      if (selected) {
        if (selected === eightWayWrapper) {
                    arrowSize.value += (e.key === ']') ? 5 : -5; arrowSize.value = Math.max(20, arrowSize.value); resizeEightWayArrows(); appState.eightWayWrapper = appState.eightWayWrapper || {}; appState.eightWayWrapper.arrowSize = arrowSize.value; saveStateData(); showToast('Arrow size: ' + arrowSize.value + 'px', 1000);
        } else if (selected.classList && selected.classList.contains('btn')) {
          const cs = window.getComputedStyle(selected); let fs = parseInt(cs.fontSize) || 30; fs += (e.key === ']') ? 1 : -1; fs = Math.max(6, fs); selected.style.fontSize = fs + 'px'; appState.buttons[selected.dataset.btn] = appState.buttons[selected.dataset.btn] || {}; appState.buttons[selected.dataset.btn].fontSize = selected.style.fontSize; saveStateData(); showToast('Font size: ' + fs, 1000);
          if (selected.style.backgroundImage && selected.style.backgroundImage !== 'none') {
            const bgSize = parseInt(cs.backgroundSize) || fs * 2; const newBgSize = Math.max(10, bgSize + (e.key === ']' ? 2 : -2)); selected.style.backgroundSize = newBgSize + 'px auto'; appState.buttons[selected.dataset.btn].backgroundSize = selected.style.backgroundSize; saveStateData(); showToast('Symbol size: ' + newBgSize, 1000);
          }
        }
      }
      e.preventDefault(); return;
    }

    // border radius without ctrl
    if (!e.ctrlKey && (e.key === '[' || e.key === ']')) {
      if (selected && selected.id !== 'stickWrapper' && selected.id !== 'eightWayWrapper') {
        const cs = window.getComputedStyle(selected); let br = parseInt(cs.borderRadius) || 0; br += (e.key === ']') ? 10 : -10; br = Math.max(0, br); const maxBr = Math.max(selected.offsetWidth, selected.offsetHeight) / 2; br = Math.min(br, maxBr); selected.style.borderRadius = br + 'px'; if (selected.dataset && selected.dataset.btn) { appState.buttons[selected.dataset.btn] = appState.buttons[selected.dataset.btn] || {}; appState.buttons[selected.dataset.btn].borderRadius = selected.style.borderRadius; } saveStateData(); showToast('Border radius: ' + br, 1000);
      }
      e.preventDefault(); return;
    }

    // Delete/hide
    if (e.key === 'Delete') {
      if (selected) {
        const isEditing = selected.querySelector('input'); if (!isEditing) {
          if (selected === base) { selected.style.display = 'none'; appState.base.display = 'none'; showToast('Base hidden', 1000); }
          else if (selected === stickWrapper) { selected.style.display = 'none'; appState.joystick.display = 'none'; showToast('Joystick hidden', 1000); }
          else if (selected === eightWayWrapper) { selected.style.display = 'none'; appState.eightWayWrapper.display = 'none'; showToast('8-way direction hidden', 1000); }
          else if (selected.classList && selected.classList.contains('btn')) { selected.style.display = 'none'; const name = selected.dataset.btn; if (!appState.hiddenButtons.includes(name)) appState.hiddenButtons.push(name); appState.buttons[name] = appState.buttons[name] || {}; appState.buttons[name].display = 'none'; showToast('Button hidden', 1000); }
          deselect(); saveStateData();
        }
      }
      e.preventDefault(); return;
    }

    // movement & resize
    if (selected) {
      const cs = window.getComputedStyle(selected);
      let top = parseInt(cs.top) || 0; let left = parseInt(cs.left) || 0; let width = parseInt(cs.width) || selected.offsetWidth || 0; let height = parseInt(cs.height) || selected.offsetHeight || 0; let updated = false;
      if (e.shiftKey && !e.ctrlKey) {
        const centerX = left + width / 2; const centerY = top + height / 2;
        if (e.key === 'ArrowUp') height += 10; if (e.key === 'ArrowDown') height = Math.max(10, height - 10); if (e.key === 'ArrowRight') width += 10; if (e.key === 'ArrowLeft') width = Math.max(10, width - 10);
        if (selected === stickWrapper || selected === eightWayWrapper) { let newSize; if (e.key === 'ArrowUp' || e.key === 'ArrowRight') newSize = Math.max(width, height); else newSize = Math.min(width, height); width = Math.max(10, newSize); height = Math.max(10, newSize); }
        selected.style.width = width + 'px'; selected.style.height = height + 'px'; selected.style.left = (centerX - width / 2) + 'px'; selected.style.top = (centerY - height / 2) + 'px';
        if (selected.classList && selected.classList.contains('btn')) { const name = selected.dataset.btn; appState.buttons[name] = appState.buttons[name] || {}; appState.buttons[name].width = selected.style.width; appState.buttons[name].height = selected.style.height; appState.buttons[name].top = selected.style.top; appState.buttons[name].left = selected.style.left; }
        saveStateData(); showToast(`height: ${height}, width: ${width}`, 1000); updated = true; updateCursor();
      } else {
        const step = e.ctrlKey ? 1 : 10;
        if (e.key === 'ArrowUp') { top -= step; updated = true; }
        if (e.key === 'ArrowDown') { top += step; updated = true; }
        if (e.key === 'ArrowLeft') { left -= step; updated = true; }
        if (e.key === 'ArrowRight') { left += step; updated = true; }
        
        if (updated) { selected.style.top = Math.max(0, top) + 'px'; selected.style.left = Math.max(0, left) + 'px'; saveStateData(); showToast(`x: ${left}, y: ${top}`, 1000); updateCursor(); }
      }
      if (updated) {
        if (selected === stickWrapper) { resizeJoystickWrapper(); joystick.style.left = (width / 2) + 'px'; joystick.style.top = (height / 2) + 'px'; appState.joystick.top = selected.style.top; appState.joystick.left = selected.style.left; appState.joystick.width = selected.style.width; appState.joystick.height = selected.style.height; }
        else if (selected === eightWayWrapper) { appState.eightWayWrapper.top = selected.style.top; appState.eightWayWrapper.left = selected.style.left; appState.eightWayWrapper.width = selected.style.width; appState.eightWayWrapper.height = selected.style.height; }
        else if (selected.classList && selected.classList.contains('btn')) { const name = selected.dataset.btn; appState.buttons[name] = appState.buttons[name] || {}; appState.buttons[name].top = selected.style.top; appState.buttons[name].left = selected.style.left; if (name === 'LS' || name === 'RS') { resizeStickTrails(); updateAnalogStickBases(); } }
        saveStateData(); updateCursor();
      }
    }
  });

  // appState/cfg/ANALOG_DEFAULTS/els/lastPressedTimes are shared by reference;
  // buttonMap crosses via a getter; saveStateData is a hoisted function
  // declaration, so passing it here by reference is safe.
  const stickUpdate = createStickUpdate({
    appState, cfg, ANALOG_DEFAULTS,
    els: { joystick, btnEls },
    getButtonMap: () => buttonMap,
    lastPressedTimes,
    // Function declarations hoist, so evaluating saveStateData here
    // (during setup) safely captures the finished function object.
    saveStateData
  });
  const { handleDpadMovement, getStickMovementEnabled,
    handleStickMovement, getStickXY, updateButtonsFromPad, resetJoystickHead } = stickUpdate;

  const elementMoveTimers = { up: 0, down: 0, left: 0, right: 0, ls: 0, rs: 0, hat: 0 };
  const moveDelay = 60; const moveStep = 10;

  function moveSelected(dx, dy, key) {
    if (!selected) return; const cs = window.getComputedStyle(selected); let top = parseInt(cs.top) || 0; let left = parseInt(cs.left) || 0; top = Math.max(0, top + dy); left = Math.max(0, left + dx); selected.style.top = top + 'px'; selected.style.left = left + 'px';
    if (selected.classList.contains('btn')) { const name = selected.dataset.btn; appState.buttons[name] = appState.buttons[name] || {}; appState.buttons[name].top = selected.style.top; appState.buttons[name].left = selected.style.left; if (name === 'LS' || name === 'RS') { resizeStickTrails(); updateAnalogStickBases(); } }
    else if (selected === stickWrapper) { appState.joystick.top = selected.style.top; appState.joystick.left = selected.style.left; }
    else if (selected === eightWayWrapper) { appState.eightWayWrapper.top = selected.style.top; appState.eightWayWrapper.left = selected.style.left; }
    saveStateData(); showToast(`x:${left}, y:${top}`, 500); elementMoveTimers[key] = performance.now(); updateCursor();
  }

  // --- buttons update from gamepad ---

   // --- sizing & arrows (js/sizing.js) ---
   // Sizing helpers are created after trail init (they inject
   // resizeStickTrails/updateAnalogStickBases, hoisted function declarations
   // defined below). The factory also installs its own ResizeObserver/window
   // resize listeners for the eight-way wrapper.
   const sizing = createSizing({
     appState, ANALOG_DEFAULTS,
     els: { btnEls, base, stickWrapper, eightWayWrapper },
     getArrowSize: () => arrowSize.value,
     setArrowSize: v => { if (v !== undefined) arrowSize.value = v; },
     resizeStickTrails, updateAnalogStickBases, getBgImagePath,
     saveStateData, showToast, updateCursor
   });
   ({ clampResizeEightWayArrows, resizeEightWayArrows, snapLayoutToGrid } = sizing);
   sizing.installListeners();

   // Auto-assign the active controller on first input: no controller is

  // Auto-assign the active controller on first input: no controller is
  // considered active on load. The first connected controller (TrailChain or
  // native Gamepad API) to produce input is locked in as the active one, the
  // same path as an explicit pick from the Controller list, so it sticks and
  // shows the checkmark there. Runs once per connection until the assignment
  // is cleared (e.g. on disconnect) or overridden manually.
  function autoAssignActiveController() {
    // TrailChain controllers first (they take priority in the animate loop)
    if (trailChain && trailChain.getConnected()) {
      // Release a stale assignment (its controller disappeared) so the
      // wait-for-input scan below can hand the slot to a live controller.
      if (trailChain.controllerKey && !trailChain.controllers.some(c => trailchainControllerKeyOf(c) === trailChain.controllerKey)) {
        trailChain.clearController();
        renderControllerList?.();
      }
      if (!trailChain.controllerKey && trailChain.controllers.length > 0) {
        const idx = trailChain.controllers.findIndex(c => controllerHasInput(c));
        if (idx !== -1) {
          trailChain.setControllerIndex(idx);
          const name = trailChain.controllers[idx]?.name || trailChain.controllers[idx]?.product || 'Controller';
          showToast(name + ' is now active', 1500);
          renderControllerList?.();
        }
      }
      // While TrailChain has controllers to wait on, don't auto-assign native
      // pads underneath it â€” the animate loop prefers TrailChain data. If
      // TrailChain is connected but has no controllers, fall through so a
      // native pad can still claim the active slot on input.
      if (trailChain.controllers.length > 0) return;
    }
    if (selectedNativeGamepadIndex !== null) return; // already assigned
    const detected = detectActiveGamepad();
    if (detected === null) return; // no input yet â€” stay unassigned
    const gps = navigator.getGamepads ? navigator.getGamepads() : [];
    selectedNativeGamepadIndex = detected;
    activeGamepadIndex = detected;
    if (gps[detected]) showToast((gps[detected].id || 'Controller') + ' is now active', 1500);
    renderControllerList?.();
  }

  function getNativeGamepads() {
    return navigator.getGamepads ? Array.from(navigator.getGamepads()).filter(Boolean) : [];
  }

  function getDetectedControllers() {
    const controllers = [];
    if (trailChain?.getConnected()) {
      trailChain.controllers.forEach((controller, index) => controllers.push({
        source: 'trailchain',
        index,
        name: controller.name || controller.product || controller.id || `Controller ${index + 1}`,
        key: `trailchain:${controller.instanceId ?? controller.guid ?? controller.path ?? controller.serial ?? controller.index ?? controller.name ?? index}`
      }));
    }
    getNativeGamepads().forEach((gamepad, index) => controllers.push({
      source: 'gamepad',
      index: gamepad.index ?? index,
      name: gamepad.id || `Controller ${index + 1}`,
      key: `gamepad:${gamepad.index ?? index}`
    }));
    return controllers;
  }

  function getSelectedControllerKey() {
    if (trailChain?.getConnected() && trailChain.controllerKey) return `trailchain:${trailChain.controllerKey}`;
    return selectedNativeGamepadIndex === null ? null : `gamepad:${selectedNativeGamepadIndex}`;
  }

  function selectController(controller) {
    if (!controller) return;
    if (controller.source === 'trailchain') {
      // Picking a TrailChain controller releases any native assignment so
      // exactly one controller is active at a time.
      selectedNativeGamepadIndex = null;
      activeGamepadIndex = null;
      trailChain?.setControllerIndex(controller.index);
      showToast(controller.name + ' selected', 1000);
    } else {
      // Picking a native controller releases any TrailChain assignment.
      if (trailChain && trailChain.getConnected() && trailChain.controllerKey) trailChain.clearController();
      selectedNativeGamepadIndex = controller.index;
      activeGamepadIndex = controller.index;
      showToast(controller.name + ' selected', 1000);
    }
    renderControllerList?.();
  }

  window.addEventListener('gamepadconnected', () => renderControllerList?.());
  window.addEventListener('gamepaddisconnected', (e) => {
    // Release the assignment when the active controller goes away so the app
    // goes back to waiting for input from whichever controller is used next.
    if (e && e.gamepad && e.gamepad.index === selectedNativeGamepadIndex) {
      selectedNativeGamepadIndex = null;
      activeGamepadIndex = null;
      showToast('Controller disconnected â€” waiting for input', 1500);
    }
    renderControllerList?.();
  });

  // draw trail
  function resizeJoystickWrapper() { 
    canvas.width = stickWrapper.clientWidth; 
    canvas.height = stickWrapper.clientHeight; 
    if (trailSystem) trailSystem.resize();
  }
  function resizeStickTrails() {
    Object.entries(stickTrailCanvases).forEach(([id, trailCanvas]) => {
      const button = btnEls[id];
      if (!trailCanvas || !button) return;
      const styles = getComputedStyle(button);
      const state = appState.buttons[id] || {};
      const radius = Math.max(0, Math.min(100, parseInt(state.stickRadius ?? ANALOG_DEFAULTS.stickRadius, 10) || 0));
      const size = Math.max(button.offsetWidth, button.offsetHeight, radius * 2 + 24, 1);
      const centerX = (button.offsetLeft || parseFloat(styles.left) || 0) + button.offsetWidth / 2;
      const centerY = (button.offsetTop || parseFloat(styles.top) || 0) + button.offsetHeight / 2;
      trailCanvas.style.left = `${centerX - size / 2}px`;
      trailCanvas.style.top = `${centerY - size / 2}px`;
      trailCanvas.style.width = `${size}px`;
      trailCanvas.style.height = `${size}px`;
      if (stickTrailSystems[id]) stickTrailSystems[id].config.radius = radius;
      if (trailCanvas.width !== size || trailCanvas.height !== size) {
        trailCanvas.width = size;
        trailCanvas.height = size;
      }
    });
  }
  function updateAnalogStickBases() {
    const baseImage = getBgImagePath(stickWrapper);
    Object.entries(analogStickBases).forEach(([id, analogBase]) => {
      const button = btnEls[id];
      if (!analogBase || !button) return;
      const state = appState.buttons[id] || {};
      const size = Math.max(20, Math.min(300, parseInt(state.baseSize ?? 100, 10) || 100));
      const centerX = button.offsetLeft + button.offsetWidth / 2;
      const centerY = button.offsetTop + button.offsetHeight / 2;
      analogBase.style.width = `${size}px`;
      analogBase.style.height = `${size}px`;
      analogBase.style.left = `${centerX - size / 2}px`;
      analogBase.style.top = `${centerY - size / 2}px`;
      analogBase.style.display = (state.baseVisibility ?? state.showBase) === true ? 'block' : 'none';
      applyBgImage(analogBase, baseImage);
    });
  }
  window.addEventListener('resize', resizeJoystickWrapper);
  window.addEventListener('resize', resizeStickTrails);
  window.addEventListener('resize', updateAnalogStickBases);
  resizeJoystickWrapper();

  // Initialize trail system
  trailSystem = createTrailSystem(canvas, ctx, cfg, () => 
    getComputedStyle(document.documentElement).getPropertyValue('--trail-color')?.trim() || appState.trailColor || '#CEEC73'
  );
  Object.entries(stickTrailCanvases).forEach(([id, trailCanvas]) => {
    if (!trailCanvas) return;
    const stickState = appState.buttons[id] || {};
    stickTrailSystems[id] = createTrailSystem(trailCanvas, trailCanvas.getContext('2d'), {
      trail: cfg.trail,
      trailLength: Math.max(1, Math.min(60, parseInt(stickState.trailLength ?? stickState.trailSize ?? ANALOG_DEFAULTS.trailLength, 10) || ANALOG_DEFAULTS.trailLength)),
      trailWidth: Math.max(1, Math.min(40, parseInt(stickState.trailWidth ?? ANALOG_DEFAULTS.trailWidth, 10) || ANALOG_DEFAULTS.trailWidth))
    }, () =>
      getComputedStyle(document.documentElement).getPropertyValue('--trail-color')?.trim() || appState.trailColor || '#CEEC73'
    );
  });
  resizeStickTrails();
  updateAnalogStickBases();

  // --- Profiles: save/load unified with helpers (js/profiles.js) ---
  const profiles = createProfiles({ appState, profileCount: PROFILE_COUNT, exportLayout, importLayout, saveStateData, showToast });
  const { saveProfile, loadProfile, resetToDefault } = profiles;
  // --- copy/export/import UI (js/clipboard-io.js) ---
  const clipboardIO = createClipboardIO({ exportLayout, importLayout, showToast, saveStateData });
  const { copyLayoutToClipboard, pasteLayoutFromClipboard, importInput } = clipboardIO;

  // load help
  fetch('help.html').then(r => r.text()).then(html => { document.getElementById('helpPanel').innerHTML = html; }).catch(err => console.warn('Could not load help.html', err));
  showToast('Help file not found!', 800);
  const helpPanel = document.getElementById('helpPanel');

  // --- Presets menu: list layouts with hover preview and apply/cancel behavior ---
  // (DOM/state for the menu lives in js/presets-menu.js; see createPresetsMenu)
  let contextMenuRequest = 0;
  const presetsMenu = createPresetsMenu({
    appState, profileCount: PROFILE_COUNT,
    exportLayout, importLayout,
    applyPropertiesToElement, applyBgImage,
    els: { base, stickWrapper, eightWayWrapper, joystick, btnEls },
        getResizeEightWayArrows: () => resizeEightWayArrows, resizeJoystickWrapper,
    getDetectedControllers, getSelectedControllerKey, selectController,
    saveStateData, showToast, startUiHideTimer, stopUiHideTimer,
    getContextMenuRequest: () => contextMenuRequest,
        setArrowSize: (v) => { if (v !== undefined) arrowSize.value = v; }
  });
  const renderControllerList = () => presetsMenu.renderControllerList?.();

  // --- Color panel: created after the presets menu because openColorPanel
  // closes it; both menus share the outside-click lifecycle in main.js. ---
  const colorPanelApi = createColorPanel({
    appState,
    ANALOG_DEFAULTS,
    els: { base, stickWrapper, eightWayWrapper, joystick, btnEls },
    presetsMenu,
    getSelected: () => selected,
    getPanelAnchorTarget: () => panelAnchorTarget,
    setPanelAnchorTarget: v => { panelAnchorTarget = v; },
    getStickMovementEnabled,
    stickTrailSystems,
    updateAnalogStickBases,
    getBgImagePath,
    saveStateData,
    showToast,
    startUiHideTimer,
    stopUiHideTimer
  });
  openColorPanel = colorPanelApi.openColorPanel;
  closeColorPanel = colorPanelApi.closeColorPanel;
  revertPreview = colorPanelApi.revertPreview;
  updatePanelForSelection = colorPanelApi.updatePanelForSelection;
  colorPanel = colorPanelApi.getElement();

  function closeContextMenus(revert = true) {
    contextMenuRequest++;
    closeColorPanel(revert);
    presetsMenu.close(revert);
  }

  // One delegated router owns all custom right-click behavior.
  document.addEventListener('contextmenu', (e) => {
    try {
      if (colorPanel?.contains(e.target) || presetsMenu.element()?.contains(e.target) || remapButton.panel?.contains(e.target)) return;
      e.preventDefault();
      const requestId = ++contextMenuRequest;
      const target = e.target.closest?.('.btn, #stickWrapper, #eightWayWrapper, #joystickHead, #base');
      if (target) {
        const panelTarget = target.id === 'joystickHead' ? joystick : target;
        selectElement(panelTarget);
        openColorPanel(panelTarget, e.pageX, e.pageY).catch(err => console.error('openColorPanel error', err));
        return;
      }
      closeColorPanel(true);
      presetsMenu.open(e.pageX, e.pageY, requestId);
    } catch (err) { console.error('contextmenu error:', err); }
  });

  document.addEventListener('keydown', e => {
    if (e.key === 'Escape') {
      closeContextMenus(true);
    }
    if (e.key === 'Tab') { e.preventDefault(); helpPanel.style.display = 'block'; }
  });
  document.addEventListener('keyup', e => { if (e.key === 'Tab') helpPanel.style.display = 'none'; });

  // detect active gamepad & main animation loop
  function animate() {
    // Prefer TrailChain WebSocket data; fall back to native Gamepad API.
    // No controller is active until one produces input â€” autoAssignActiveController
    // locks the first controller that sends input in as active.
    autoAssignActiveController();
    let pad = null;
    // Only use TrailChain data once a TrailChain controller has been assigned
    // (manually or auto-assigned on first input); otherwise fall through.
    if (trailChain && trailChain.getConnected() && trailChain.controllerKey) {
      padSource = 'trailchain';
      pad = trailChain.getGamepad();
    }
    if (!pad) {
      padSource = 'gamepad';
      if (selectedNativeGamepadIndex !== null) {
        activeGamepadIndex = selectedNativeGamepadIndex;
        pad = (navigator.getGamepads && activeGamepadIndex !== null) ? navigator.getGamepads()[activeGamepadIndex] : null;
        if (!pad) {
          // The assigned pad is gone (missed disconnect event): release the
          // slot so wait-for-input can hand it to the next controller used.
          selectedNativeGamepadIndex = null;
          activeGamepadIndex = null;
        }
      }
    }
    updateButtonsFromPad(pad);
    // While no controller is assigned (before the first input), pad is null.
    // Hand the remap cycle AND the per-row listen mode a continuously
    // available pad: both need idle frames to arm the capture (and to spot
    // the first press) even before a controller becomes active.
    let remapPad = pad;
    if (!remapPad && (remapButton.isCapturing() || remapButton.isListening())) {
      // Prefer TrailChain's pad when it has one, otherwise the first native pad.
      remapPad = (trailChain && trailChain.getGamepad && trailChain.getGamepad()) || getNativeGamepads()[0] || null;
    }
    remapButton.update(remapPad);
    const dpadDir = handleDpadMovement(pad); updateArrowHighlights(dpadDir);
    const { x, y } = getStickXY(pad); const cx = canvas.width/2, cy = canvas.height/2; const radius = canvas.width/2 - 25; const jx = cx + x * radius, jy = cy + y * radius; joystick.style.left = jx + 'px'; joystick.style.top = jy + 'px';
    if (trailSystem) {
      trailSystem.addPoint(x, y);
      trailSystem.draw(trailSystem.getTrail());
    }
    handleStickMovement(pad);
    const stickValues = { LS: getAnalogStick(pad, 'left', cfg.deadzone, cfg.invertY), RS: getAnalogStick(pad, 'right', cfg.deadzone, cfg.invertY) };
    Object.entries(stickValues).forEach(([id, value]) => {
      const system = stickTrailSystems[id];
      if (!system) return;
      const state = appState.buttons[id] || {};
      const button = btnEls[id];
      // Hide trail if the stick button is hidden (display: none)
      const isButtonHidden = button && (button.style.display === 'none' || getComputedStyle(button).display === 'none');
      if (!getStickMovementEnabled(id) || state.showTrail === false || isButtonHidden) { system.clear(); return; }
      system.config.trailLength = Math.max(1, Math.min(60, parseInt(state.trailLength ?? state.trailSize ?? ANALOG_DEFAULTS.trailLength, 10) || ANALOG_DEFAULTS.trailLength));
      system.config.trailWidth = Math.max(1, Math.min(40, parseInt(state.trailWidth ?? ANALOG_DEFAULTS.trailWidth, 10) || ANALOG_DEFAULTS.trailWidth));
      system.addPoint(value.x, value.y);
      system.draw(system.getTrail());
    });
    resizeStickTrails();
    for (let i = 0; i < markers.length; i++) markers[i].classList.toggle('active', i === dpadDir);
    requestAnimationFrame(animate);
  }

  // --- render state: pushes appState onto DOM (js/render-state.js) ---
  const render = createRenderState({
    appState,
    els: { btnEls, base, stickWrapper, eightWayWrapper, joystick },
    applyPropertiesToElement, applyBgImage,
    getArrowSize: () => arrowSize.value,
    setArrowSize: v => { if (v !== undefined) arrowSize.value = v; },
    getResizeEightWayArrows: () => resizeEightWayArrows,
    updateAnalogStickBases, resizeJoystickWrapper, applyJoystickHeadFromState,
    updateCursor
  });
  const { updateStateData } = render;

  // Boot
  persistenceApi = createStatePersistence({
    appState, STORAGE_KEY,
    els: { joystick, btnEls, base, stickWrapper, eightWayWrapper },
    getButtonMap: () => buttonMap,
    setButtonMap: v => { buttonMap = v; },
    DEFAULT_BUTTON_MAP,
    applyJoystickHeadFromState, resizeJoystickWrapper, updateStateData,
    remapButton
  });

  function loadStateData() {
    persistence().loadStateData();
  }

  loadStateData(); updateStateData(); resizeJoystickWrapper();
  if (window.ResizeObserver) { const ro = new ResizeObserver(() => { resizeJoystickWrapper(); }); ro.observe(stickWrapper); }

  // Initialize TrailChain WebSocket client (optional â€” connects to the
  // TrailChain companion app broadcasting controller state on port 3819).
  // The host can be overridden via ?host=192.168.1.42 in the URL.
  const urlParams = new URLSearchParams(window.location.search);
  const chainHost = urlParams.get('host') || (window.location.hostname || '127.0.0.1');
  trailChain = new TrailChainClient(chainHost, 3819, {
    onConnect: () => { showToast('Chainlink connected', 2000); renderControllerList?.(); },
    onDisconnect: () => { showToast('Chainlink disconnected', 2000); trailChain.clearController(); renderControllerList?.(); },
    onError: (err) => { console.warn('[Trailpad] Chainlink WebSocket error:', err?.message || err); },
    onControllers: () => { renderControllerList?.(); },
  });
  trailChain.connect();

  // Clean up WebSocket on page unload
  window.addEventListener('beforeunload', () => { if (trailChain) trailChain.disconnect(); });

  animate(); showToast('Click Interact to start customizing', 5000);

  // expose helpers
  window.trailpad = { saveStateData, loadStateData, copyLayoutToClipboard, pasteLayoutFromClipboard, trailChain, get padSource() { return padSource; } };

});
