// Layout snapshot/apply + element property helpers for Trailpad.
//
// Owns captureElementProperties/exportLayout/importLayout and the small
// apply helpers they are built on. Element lookups (els), layout state
// (appState/ANALOG_DEFAULTS, shared by reference — never reassigned in here),
// and main.js-owned helpers (getBgImagePath, resizeEightWayArrows,
// updateAnalogStickBases, saveStateData) are injected; arrowSize crosses via
// get/set accessors, same pattern as js/presets-menu.js.

import { normalizeBgImage, applyBgImage, applyMaskImage } from './bg-image.js';
import { preloadFontsForLayout } from './fonts.js';

export function createLayoutState({
  appState, ANALOG_DEFAULTS,
  els, // { base, stickWrapper, eightWayWrapper, joystick, btnEls }
  getArrowSize, setArrowSize,
  getResizeEightWayArrows, updateAnalogStickBases, saveStateData, getBgImagePath  // getResizeEightWayArrows: () => resizeEightWayArrows (lazy â€” js/sizing.js)
}) {
  const { base, stickWrapper, eightWayWrapper, joystick, btnEls } = els;

  function applyPropertiesToElement(el, data) {
    if (!el || !data) return;
    if (data.display !== undefined) el.style.display = data.display;
    if (data.zIndex !== undefined) el.style.zIndex = data.zIndex;
    ['top','left','width','height','borderRadius','outline','outlineOffset','boxShadow','backgroundColor','backgroundSize','color','fontSize','fontFamily'].forEach(k => {
      if (data[k] !== undefined) el.style[k] = data[k];
    });
    if (data.backgroundImage !== undefined) applyBgImage(el, data.backgroundImage);
    if (el === base && data.backgroundImage) {
      if (data.backgroundSize === undefined) el.style.backgroundSize = 'cover';
      el.style.backgroundPosition = 'center';
      el.style.backgroundRepeat = 'no-repeat';
    }
    if (data.maskImage !== undefined) applyMaskImage(el, data.maskImage);
    if (el === base && data.maskImage) {
      // Mirror the base's background sizing (gamepad presets use "contain") so
      // the mask lines up with the base image; an explicit maskSize wins.
      const maskSize = data.maskSize ?? (data.backgroundSize !== undefined ? data.backgroundSize : 'cover');
      el.style.webkitMaskSize = maskSize;
      el.style.maskSize = maskSize;
      el.style.webkitMaskPosition = 'center';
      el.style.maskPosition = 'center';
      el.style.webkitMaskRepeat = 'no-repeat';
      el.style.maskRepeat = 'no-repeat';
    }
    if (data.label !== undefined && el.dataset && el.dataset.btn) el.textContent = data.label;
  }

  function applyAndStore(el, store, data) {
    if (!data) return;
    Object.assign(store, data);
    applyPropertiesToElement(el, data);
    if (data.display !== undefined) el.style.display = data.display;
  }

  function getExportBgImagePath(el) {
    const path = getBgImagePath(el);
    if (el !== base || !path) return path;
    if (!/^(?:[a-z][a-z\d+.-]*:|\/\/)/i.test(path)) return path;
    try {
      const parsed = new URL(path, document.baseURI);
      if (parsed.protocol === 'http:' || parsed.protocol === 'https:' || parsed.protocol === 'file:') return parsed.href;
    } catch (e) { }
    return path;
  }

  function getExportMaskImagePath(el) {
    const path = (el === base && appState.base?.maskImage)
      ? normalizeBgImage(appState.base.maskImage)
      : computedMaskImagePath(el);
    if (el !== base || !path) return path;
    if (!/^(?:[a-z][a-z\d+.-]*:|\/\/)/i.test(path)) return path;
    try {
      const parsed = new URL(path, document.baseURI);
      if (parsed.protocol === 'http:' || parsed.protocol === 'https:' || parsed.protocol === 'file:') return parsed.href;
    } catch (e) { }
    return path;
  }

  // Read the element's current mask path from computed style, relativizing
  // absolute URLs under the document directory (same approach as getBgImagePath).
  function computedMaskImagePath(el) {
    const cs = window.getComputedStyle(el);
    const raw = cs.webkitMaskImage || cs.maskImage || 'none';
    if (!raw || raw === 'none') return '';
    const m = raw.match(/^url\(["']?([^"')]+)["']?\)$/i);
    if (!m) return '';
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

  function captureElementProperties(el) {
    const cs = window.getComputedStyle(el);
    const snap = {
      display: cs.display, zIndex: cs.zIndex, top: cs.top, left: cs.left, width: cs.width, height: cs.height,
      borderRadius: cs.borderRadius, outline: cs.outline, outlineOffset: cs.outlineOffset, boxShadow: cs.boxShadow,
      backgroundColor: cs.backgroundColor, backgroundImage: getExportBgImagePath(el), backgroundSize: cs.backgroundSize,
      maskImage: getExportMaskImagePath(el),
      color: cs.color, fontSize: cs.fontSize, fontFamily: cs.fontFamily, label: (el.textContent || '').trim()
    };
    if (el.dataset && el.dataset.btn) {
      const key = el.dataset.btn;
      if (appState.buttons?.[key]?.label !== undefined) snap.label = appState.buttons[key].label;
      else snap.label = (el.textContent || '').trim();
      if (key === 'LS' || key === 'RS') {
        const stickState = appState.buttons?.[key] || {};
        snap.stickMovement = stickState.stickMovement ?? ANALOG_DEFAULTS.stickMovement;
        snap.showTrail = stickState.showTrail !== false;
        snap.stickRadius = Math.max(0, Math.min(100, parseInt(stickState.stickRadius ?? ANALOG_DEFAULTS.stickRadius, 10) || 0));
        snap.trailLength = Math.max(1, Math.min(60, parseInt(stickState.trailLength ?? stickState.trailSize ?? ANALOG_DEFAULTS.trailLength, 10) || ANALOG_DEFAULTS.trailLength));
        snap.trailWidth = Math.max(1, Math.min(40, parseInt(stickState.trailWidth ?? ANALOG_DEFAULTS.trailWidth, 10) || ANALOG_DEFAULTS.trailWidth));
        snap.baseVisibility = stickState.baseVisibility ?? stickState.showBase ?? ANALOG_DEFAULTS.baseVisibility;
        snap.baseSize = Math.max(20, Math.min(300, parseInt(stickState.baseSize ?? ANALOG_DEFAULTS.baseSize, 10) || ANALOG_DEFAULTS.baseSize));
      }
    }
    if (snap.backgroundSize && snap.backgroundSize !== 'auto') {
      const num = parseInt(snap.backgroundSize);
      if (!isNaN(num)) snap.backgroundSize = num + 'px auto';
    }
    if (el === eightWayWrapper && appState.eightWayWrapper?.arrowSize !== undefined) snap.arrowSize = appState.eightWayWrapper.arrowSize || 90;
    return snap;
  }

  function applyJoystickHeadFromState() {
    const head = appState.joystickHead || {};
    applyPropertiesToElement(joystick, head);
    ['backgroundColor','color','boxShadow','outline','borderRadius','fontSize','fontFamily'].forEach(k => {
      if (head[k] !== undefined) joystick.style[k] = head[k];
    });
  }

  function exportLayout() {
    const snap = {
      base: captureElementProperties(base),
      joystick: captureElementProperties(stickWrapper),
      joystickHead: captureElementProperties(joystick),
      eightWayWrapper: captureElementProperties(eightWayWrapper),
      buttons: {},
      trailColor: appState.trailColor || getComputedStyle(document.documentElement).getPropertyValue('--trail-color') || '#CEEC73'
    };
    // Add arrowImageOn/Off if present
    if (appState.eightWayWrapper?.arrowImageOn) snap.eightWayWrapper.arrowImageOn = normalizeBgImage(appState.eightWayWrapper.arrowImageOn);
    if (appState.eightWayWrapper?.arrowImageOff) snap.eightWayWrapper.arrowImageOff = normalizeBgImage(appState.eightWayWrapper.arrowImageOff);
    Object.keys(btnEls).forEach(k => snap.buttons[k] = captureElementProperties(btnEls[k]));
  // Include trigger-only analog preferences. Per-stick settings are stored in buttons.LS/RS.
  if (appState.analog) {
    // copy only canonical fields and prune legacy keys if present
    const a = Object.assign({}, appState.analog);
    delete a.LS; delete a.RS; delete a.analogVisualRange;
    delete a.visualRange; delete a.minBrightness; delete a.maxBrightness; delete a.deadzone; delete a.showDistance;
    snap.analog = a;
  }
    return snap;
  }

  function importLayout(parsed) {
    if (!parsed) return;
    preloadFontsForLayout(parsed);
    // Snapshots saved before maskImage existed lack the key; default it to
    // empty so a previously imported gamepad mask can't leak into this layout.
    if (parsed.base && parsed.base.maskImage === undefined) parsed.base = Object.assign({}, parsed.base, { maskImage: '' });
    applyAndStore(base, appState.base = appState.base || {}, parsed.base);
    applyAndStore(stickWrapper, appState.joystick = appState.joystick || {}, parsed.joystick);
    if (parsed.joystickHead) applyAndStore(joystick, appState.joystickHead = appState.joystickHead || {}, parsed.joystickHead);
    applyAndStore(eightWayWrapper, appState.eightWayWrapper = appState.eightWayWrapper || {}, parsed.eightWayWrapper);

    if (parsed.buttons) {
      appState.buttons = {};
      Object.entries(parsed.buttons).forEach(([k, data]) => {
        appState.buttons[k] = {};
        if (btnEls[k]) {
          const normalizedData = { ...data };
          if (k === 'LS' || k === 'RS') {
            if (normalizedData.trailLength === undefined && normalizedData.trailSize !== undefined) normalizedData.trailLength = normalizedData.trailSize;
            if (normalizedData.baseVisibility === undefined && normalizedData.showBase !== undefined) normalizedData.baseVisibility = normalizedData.showBase;
            if (normalizedData.stickMovement === undefined && parsed.analog?.[k] !== undefined) normalizedData.stickMovement = parsed.analog[k];
            if (normalizedData.stickRadius === undefined && parsed.analog?.analogVisualRange !== undefined) normalizedData.stickRadius = parsed.analog.analogVisualRange;
            delete normalizedData.trailSize;
            delete normalizedData.showBase;
          }
          applyAndStore(btnEls[k], appState.buttons[k], normalizedData);
        }
      });
    }
    if (parsed.eightWayWrapper?.arrowSize !== undefined) {
            setArrowSize(parseInt(parsed.eightWayWrapper.arrowSize) || getArrowSize());
      getResizeEightWayArrows()();
    }
    // Set arrowImageOn/Off if present
    if (parsed.eightWayWrapper?.arrowImageOn) {
      appState.eightWayWrapper.arrowImageOn = normalizeBgImage(parsed.eightWayWrapper.arrowImageOn);
    }
    if (parsed.eightWayWrapper?.arrowImageOff) {
      appState.eightWayWrapper.arrowImageOff = normalizeBgImage(parsed.eightWayWrapper.arrowImageOff);
    }
    // Apply to all arrows
    for (let i = 0; i < 8; i++) {
      const arrow = document.getElementById('arrow' + i);
      if (!arrow) continue;
      if (appState.eightWayWrapper.arrowImageOff) {
        applyBgImage(arrow, appState.eightWayWrapper.arrowImageOff);
      }
    }
    if (parsed.trailColor) {
      appState.trailColor = parsed.trailColor;
      document.documentElement.style.setProperty('--trail-color', parsed.trailColor);
    }
    // import analog prefs if provided
    if (parsed.analog) {
      // clone and migrate legacy names into canonical names if needed
      const safeAnalog = Object.assign({}, parsed.analog);
      if (safeAnalog.showDistance !== undefined) delete safeAnalog.showDistance;
      // migrate legacy names
      if (safeAnalog.visualRange !== undefined && safeAnalog.analogVisualRange === undefined) safeAnalog.analogVisualRange = safeAnalog.visualRange;
      if (safeAnalog.deadzone !== undefined && safeAnalog.triggerDeadzone === undefined) safeAnalog.triggerDeadzone = safeAnalog.deadzone;
      if (safeAnalog.minBrightness !== undefined && safeAnalog.minTriggerBrightness === undefined) safeAnalog.minTriggerBrightness = safeAnalog.minBrightness;
      if (safeAnalog.maxBrightness !== undefined && safeAnalog.maxTriggerBrightness === undefined) safeAnalog.maxTriggerBrightness = safeAnalog.maxBrightness;
      // remove legacy names so appState.analog stays canonical
      delete safeAnalog.visualRange; delete safeAnalog.minBrightness; delete safeAnalog.maxBrightness; delete safeAnalog.deadzone;
      appState.analog = Object.assign({}, appState.analog || {}, safeAnalog);
      // ensure triggerDeadzone fallback
      if (appState.analog.triggerDeadzone === undefined) appState.analog.triggerDeadzone = 0.1;
    }
    if (parsed.joystickHead) applyJoystickHeadFromState();
    updateAnalogStickBases();
    saveStateData();
  }

  return {
    applyPropertiesToElement, applyAndStore, getExportBgImagePath,
    captureElementProperties, applyJoystickHeadFromState,
    exportLayout, importLayout
  };
}
