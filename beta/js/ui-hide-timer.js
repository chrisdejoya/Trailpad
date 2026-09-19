// UI auto-hide timer for Trailpad (hides floating menus after inactivity).
//
// Owns the timer handle plus start/stop/reset. The callback trio that fires
// on expiry (closeContextMenus, hideCursor, hide/show widgets) plus the
// remap-open guard are injected, so this module never touches main.js-owned
// state directly — same accessor pattern as js/cursor.js and js/toast.js.

export function createUiHideTimer({
  UI_HIDE_DELAY = 5000,
  isRemapOpen,
  closeContextMenus,
  hideCursor,
  hideWidgets,
  showWidgets,
}) {
  let uiHideTimer = null;

  function startUiHideTimer() {
    stopUiHideTimer();
    uiHideTimer = setTimeout(() => {
      // The remap panel is driven by controller presses, which generate no mouse
      // event to restart the timer, so leave everything visible while it is open.
      if (isRemapOpen()) return;
      closeContextMenus(true);
      // Also hide the selection cursor
      hideCursor();
      hideWidgets();
    }, UI_HIDE_DELAY);
  }

  function stopUiHideTimer() {
    if (uiHideTimer) { clearTimeout(uiHideTimer); uiHideTimer = null; }
  }

  function resetUiHideTimer() {
    stopUiHideTimer();
    showWidgets();
    startUiHideTimer();
  }

  function installActivityListeners() {
    document.addEventListener('mousemove', resetUiHideTimer);
    document.addEventListener('mousedown', resetUiHideTimer);
    document.addEventListener('keydown', resetUiHideTimer);
    document.addEventListener('wheel', resetUiHideTimer, { passive: true });
  }

  return { startUiHideTimer, stopUiHideTimer, resetUiHideTimer, installActivityListeners };
}
