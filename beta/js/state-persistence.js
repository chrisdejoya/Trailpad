// App-state persistence for Trailpad (localStorage save/load).
//
// Owns saveStateData/syncGeometryState/loadStateData. Layout state
// (appState, shared by reference — never reassigned in here), element
// lookups (els), the storage key, the device button-map table (shared by
// reference via get/set accessors so the remap panel in main.js stays the
// single writer, same pattern as js/stick-update.js), and main.js-owned
// helpers (applyJoystickHeadFromState, resizeJoystickWrapper, updateStateData,
// remapButton, preloadFontsForLayout, DEFAULT_BUTTON_MAP) are injected.
// loadStateData intentionally mutates appState/parsed sub-objects in place so
// existing references held by other modules keep working.

import { preloadFontsForLayout } from './fonts.js';

export function createStatePersistence({
  appState, STORAGE_KEY,
  els, // { joystick, btnEls, base, stickWrapper, eightWayWrapper }
  getButtonMap, setButtonMap, DEFAULT_BUTTON_MAP,
  applyJoystickHeadFromState, resizeJoystickWrapper, updateStateData,
  remapButton
}) {
  const { joystick, btnEls, base, stickWrapper, eightWayWrapper } = els;

  function saveStateData() {
    try {
      syncGeometryState();
      // Device-specific, so it rides along with the rest of appState but is kept
      // out of exportLayout/importLayout (layouts and profiles must not clobber it).
      appState.buttonMap = getButtonMap();
      localStorage.setItem(STORAGE_KEY, JSON.stringify(appState)); console.debug('Saving state');
    } catch (e) { console.warn(e); }
  }

  function syncGeometryState() {
    const sync = (element, store) => {
      if (!element || !store) return;
      const styles = window.getComputedStyle(element);
      ['top', 'left', 'width', 'height'].forEach(key => {
        if (styles[key] && styles[key] !== 'auto') store[key] = styles[key];
      });
    };
    Object.entries(btnEls).forEach(([key, element]) => {
      appState.buttons[key] = appState.buttons[key] || {};
      sync(element, appState.buttons[key]);
    });
    sync(base, appState.base);
    sync(stickWrapper, appState.joystick);
    sync(eightWayWrapper, appState.eightWayWrapper);
  }

  function loadStateData() {
    try {
      const raw = localStorage.getItem(STORAGE_KEY); if (!raw) return; const parsed = JSON.parse(raw);
      appState.buttons = Object.assign({}, appState.buttons || {}, parsed.buttons || {});
      appState.profiles = Object.assign({}, appState.profiles || {}, parsed.profiles || {});
      appState.joystick = Object.assign({}, appState.joystick || {}, parsed.joystick || {});
      appState.base = Object.assign({}, appState.base || {}, parsed.base || {});
      appState.eightWayWrapper = Object.assign({}, appState.eightWayWrapper || {}, parsed.eightWayWrapper || {});
      if (parsed.joystickHead !== undefined) appState.joystickHead = Object.assign({}, parsed.joystickHead);
      if (parsed.hiddenButtons !== undefined) appState.hiddenButtons = parsed.hiddenButtons;
      if (parsed.trailColor !== undefined) appState.trailColor = parsed.trailColor;
      if (parsed.lastProfile !== undefined) appState.lastProfile = parsed.lastProfile;
      // Device button mapping is part of the saved state but not of a layout.
      if (parsed.buttonMap !== undefined) setButtonMap(Object.assign({}, DEFAULT_BUTTON_MAP, parsed.buttonMap));
      if (parsed.analog !== undefined) {
        const safeAnalog = Object.assign({}, parsed.analog);
        ['LS', 'RS'].forEach(key => {
          appState.buttons[key] = appState.buttons[key] || {};
          if (appState.buttons[key].stickMovement === undefined && safeAnalog[key] !== undefined) appState.buttons[key].stickMovement = safeAnalog[key];
          if (appState.buttons[key].stickRadius === undefined && safeAnalog.analogVisualRange !== undefined) appState.buttons[key].stickRadius = safeAnalog.analogVisualRange;
        });
        delete safeAnalog.showDistance;
        delete safeAnalog.LS;
        delete safeAnalog.RS;
        delete safeAnalog.analogVisualRange;
        appState.analog = Object.assign({}, appState.analog || {}, safeAnalog);
      }
      // Apply joystick head style after loading
      applyJoystickHeadFromState();
      preloadFontsForLayout(appState);
      // Keep the panel's row values in step with a freshly loaded mapping.
      remapButton.refresh();
      console.debug('[Trailpad] state loaded');
    } catch (e) { console.warn(e); }
  }

  return { saveStateData, syncGeometryState, loadStateData };
}
