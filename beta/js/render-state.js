// State-render helper for Trailpad.
//
// Owns updateStateData — pushes appState geometry/styles onto the DOM for
// every element (buttons, base, joystick, eight-way wrapper), applies the
// trail color, resizes canvases, positions the joystick head, and refreshes
// the selection cursor. All layout-state helpers come from js/layout-state.js;
// arrowSize/readSize cross via accessors (same pattern as layout-state);
// resizeStickTrails/resizeJoystickWrapper/updateAnalogStickBases are hoisted
// function declarations from main.js passed by reference. els/appState are
// shared by reference.

export function createRenderState({
  appState,
  els, // { btnEls, base, stickWrapper, eightWayWrapper, joystick }
  applyPropertiesToElement, applyBgImage,
  getArrowSize, setArrowSize,
  getResizeEightWayArrows,
  updateAnalogStickBases, resizeJoystickWrapper, applyJoystickHeadFromState,
  updateCursor
}) {
  const { btnEls, base, stickWrapper, eightWayWrapper, joystick } = els;

  function updateStateData() {
    Object.entries(btnEls).forEach(([k, el]) => {
      const data = appState.buttons[k] || {};
      applyPropertiesToElement(el, data);
      let display = data.display;
      if (display === undefined) display = appState.hiddenButtons?.includes(k) ? 'none' : 'flex';
      if (el.style.display !== display) el.style.display = display;
      if (data.zIndex !== undefined && el.style.zIndex !== data.zIndex) el.style.zIndex = data.zIndex;
      if (data.backgroundImage !== undefined) applyBgImage(el, data.backgroundImage);
      if (data.backgroundSize !== undefined) {
        if (el === eightWayWrapper) { const arrows = eightWayWrapper.querySelectorAll('.arrow'); arrows.forEach(arrow => arrow.style.backgroundSize = data.backgroundSize); }
        else if (el.style.backgroundSize !== data.backgroundSize) el.style.backgroundSize = data.backgroundSize;
      }
      if (data.label !== undefined && el.dataset?.btn) el.textContent = data.label;
      if (data.outlineWidth != null || data.outlineColor != null) { const width = data.outlineWidth ?? 0; const color = data.outlineColor ?? 'black'; el.style.outline = `${width}px solid ${color}`; el.style.outlineOffset = `-${width}px`; }
      if (data.boxShadowSpread != null) { const spread = data.boxShadowSpread; el.style.boxShadow = `0 0 0 ${spread}px black`; }
    });

    if (appState.joystick) { applyPropertiesToElement(stickWrapper, appState.joystick); if (appState.joystick.display !== undefined) stickWrapper.style.display = appState.joystick.display; }
    updateAnalogStickBases();
    if (appState.base) { applyPropertiesToElement(base, appState.base); if (appState.base.display !== undefined) base.style.display = appState.base.display; }
    if (appState.eightWayWrapper) { applyPropertiesToElement(eightWayWrapper, appState.eightWayWrapper); if (appState.eightWayWrapper.display !== undefined) eightWayWrapper.style.display = appState.eightWayWrapper.display; if (appState.eightWayWrapper.arrowSize !== undefined) { setArrowSize(appState.eightWayWrapper.arrowSize || 90); getResizeEightWayArrows()(); } }
    if (appState.trailColor) document.documentElement.style.setProperty('--trail-color', appState.trailColor);
    resizeJoystickWrapper(); applyJoystickHeadFromState();
    updateCursor(true);
  }

  return { updateStateData };
}
