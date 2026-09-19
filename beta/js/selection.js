// Selection + arrow-highlight helpers for Trailpad.
//
// Owns selectElement/stateForElement/deselect/updateArrowHighlights.
// The mutable selection itself crosses via accessors, same pattern as
// js/presets-menu.js and js/color-panel.js:
// - selected: read/write via getSelected/setSelected
// - panelAnchorTarget: write-only via setPanelAnchorTarget
// Layout state (appState, shared by reference — buttons[name] entries are
// ensured in place, never reassigned here), element lookups (els), the
// color panel element (via getColorPanel), and main.js-owned callbacks
// (revertPreview, updatePanelForSelection, updateCursor) are injected.

import { applyBgImage } from './bg-image.js';

export function createSelection({
  appState,
  els, // { base, stickWrapper, eightWayWrapper, joystick }
  getSelected, setSelected, setPanelAnchorTarget,
  getColorPanel,
  revertPreview, updatePanelForSelection, updateCursor
}) {
  const { base, stickWrapper, eightWayWrapper, joystick } = els;

  function selectElement(el) {
    revertPreview();
    if (!el) {
      if (getSelected()) { getSelected().classList.remove('selected'); getSelected().classList.remove('selectedOutline'); }
      setSelected(null); updateCursor(true); return;
    }
    if (getSelected() && getSelected() !== el) { getSelected().classList.remove('selected'); getSelected().classList.remove('selectedOutline'); }
    setSelected(el); getSelected().classList.add('selected'); getSelected().classList.add('selectedOutline'); updatePanelForSelection(); updateCursor(true);
    if (getColorPanel().style.display === 'block' || getColorPanel().style.display === 'flex') setPanelAnchorTarget(getSelected());
    // sync persistent size slider to selected element's backgroundSize (percent if set)
    try {
      const slider = getColorPanel().querySelector('.symbolSizeSlider'); const valEl = getColorPanel().querySelector('.symbolSizeValue');
      if (slider) {
        const cs = window.getComputedStyle(getSelected());
        let bgSize = cs.backgroundSize || getSelected().style.backgroundSize || '';
        // try to extract percent value
        const m = (getSelected().style.backgroundSize || bgSize).match(/(\d+)%/);
        if (m) { slider.value = parseInt(m[1]); if (valEl) valEl.value = slider.value; }
        else { slider.value = 100; if (valEl) valEl.value = slider.value; }
      }
    } catch (e) { }

    // sync text size slider to selected element's font size
    try {
      const txtSlider = getColorPanel().querySelector('.textSizeSlider'); const txtVal = getColorPanel().querySelector('.textSizeValue');
      if (txtSlider) {
        const cs2 = window.getComputedStyle(getSelected());
        let fs = cs2.fontSize || getSelected().style.fontSize || '';
        const m2 = (fs || '').match(/(\d+)/);
  if (m2) { txtSlider.value = parseInt(m2[1]); if (txtVal) txtVal.value = txtSlider.value; }
  else { txtSlider.value = 30; if (txtVal) txtVal.value = txtSlider.value; }
      }
    } catch (e) {}
  }

  function stateForElement(el) {
    if (el === base) return appState.base;
    if (el === stickWrapper) return appState.joystick;
    if (el === joystick) return appState.joystickHead;
    if (el === eightWayWrapper) return appState.eightWayWrapper;
    if (el?.classList?.contains('btn')) {
      const name = el.dataset.btn;
      appState.buttons[name] = appState.buttons[name] || {};
      return appState.buttons[name];
    }
    return null;
  }

  function deselect() { selectElement(null); }

  function updateArrowHighlights(idx) {
    for (let i = 0; i < 8; i++) {
      const arrow = document.getElementById('arrow' + i);
      if (!arrow) continue;
      const isActive = i === idx;
      arrow.classList.toggle('active', isActive);
      // Set background image based on state
      if (appState.eightWayWrapper?.arrowImageOn && appState.eightWayWrapper?.arrowImageOff) {
        applyBgImage(arrow, isActive ? appState.eightWayWrapper.arrowImageOn : appState.eightWayWrapper.arrowImageOff);
      }
    }
  }

  return { selectElement, stateForElement, deselect, updateArrowHighlights };
}
