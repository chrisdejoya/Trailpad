// Eight-way arrow layout, viewport sizing & grid-snapping for Trailpad.
//
// Owns clampResizeEightWayArrows/resizeEightWayArrows/snapLayoutToGrid.
// Layout state (appState/btnEls/base/stickWrapper/eightWayWrapper), the
// ANALOG_DEFAULTS table, arrowSize (read/write via accessors) and the
// hoisted function declarations resizeStickTrails/updateAnalogStickBases/
// getBgImagePath/saveStateData/showToast/updateCursor are injected —
// same pattern as js/layout-state.js. The factory calls
// installListeners() itself so main.js no longer wires ResizeObserver or
// window resize for the eight-way wrapper.

export function createSizing({
  appState, ANALOG_DEFAULTS,
  els, // { btnEls, base, stickWrapper, eightWayWrapper }
  getArrowSize, setArrowSize,
  resizeStickTrails, updateAnalogStickBases, getBgImagePath,
  saveStateData, showToast, updateCursor
}) {
  const { btnEls, base, stickWrapper, eightWayWrapper } = els;

  function clampResizeEightWayArrows() {
    const rect = eightWayWrapper.getBoundingClientRect(); const cx = rect.width / 2; const cy = rect.height / 2; const radius = Math.min(cx, cy);
    for (let i = 0; i < 8; i++) {
      const angle = (i * 45) * Math.PI / 180; const tx = cx + radius * Math.cos(angle); const ty = cy + radius * Math.sin(angle); const arrow = document.getElementById('arrow' + i); if (!arrow) continue;
      const left = tx - getArrowSize(); const top = ty - (getArrowSize() / 2); arrow.style.left = left + 'px'; arrow.style.top = top + 'px'; arrow.style.transformOrigin = '100% 50%'; arrow.style.transform = `rotate(${i * 45}deg)`;
    }
  }

  function resizeEightWayArrows() {
    for (let i = 0; i < 8; i++) { const arrow = document.getElementById('arrow' + i); if (!arrow) continue; arrow.style.width = getArrowSize() + 'px'; arrow.style.height = getArrowSize() + 'px'; arrow.style.transformOrigin = '100% 50%'; arrow.style.transform = `rotate(${i * 45}deg)`; }
    clampResizeEightWayArrows();
  }

  function snapLayoutToGrid(grid = 10) {
    const snap = v => Math.round((parseInt(v) || 0) / grid) * grid + 'px';
    function snapElement(el, store) { if (!el) return; const cs = getComputedStyle(el); el.style.top = snap(cs.top); el.style.left = snap(cs.left); store.top = el.style.top; store.left = el.style.left; let br = parseInt(cs.borderRadius) || 0; if (br > 0) { const maxBr = Math.max(el.offsetWidth, el.offsetHeight) / 2; br = Math.min(br, maxBr); br = Math.round(br / grid) * grid; br = Math.min(br, maxBr); el.style.borderRadius = br + 'px'; store.borderRadius = el.style.borderRadius; } }
    Object.entries(btnEls).forEach(([k, el]) => { appState.buttons[k] = appState.buttons[k] || {}; snapElement(el, appState.buttons[k]); }); snapElement(stickWrapper, appState.joystick = appState.joystick || {}); snapElement(eightWayWrapper, appState.eightWayWrapper = appState.eightWayWrapper || {}); snapElement(base, appState.base = appState.base || {}); resizeStickTrails(); updateAnalogStickBases(); saveStateData(); showToast('Snapped layout to grid!', 1000); updateCursor(true);
  }

  function installListeners() {
    if (window.ResizeObserver) { const ro = new ResizeObserver(clampResizeEightWayArrows); ro.observe(eightWayWrapper); }
    window.addEventListener('resize', () => { clampResizeEightWayArrows(); updateCursor(true); });
  }

  return { clampResizeEightWayArrows, resizeEightWayArrows, snapLayoutToGrid, installListeners };
}
