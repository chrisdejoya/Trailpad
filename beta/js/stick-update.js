// Per-frame stick + button highlight updates for Trailpad.
//
// Owns handleDpadMovement/getStickMovementEnabled/handleStickMovement/
// getStickXY/updateButtonsFromPad/resetJoystickHead. Layout state
// (appState/cfg/ANALOG_DEFAULTS, shared by reference —
// buttons[name] and analog entries are ensured in place and only read
// here), element lookups (els), the last-press times map (shared by
// reference), and the main.js-owned saveStateData callback are injected.
// buttonMap is read-only here and crosses via a getter so the remap panel
// (which lives in main.js until it moves) stays the single writer, same
// pattern as the selection accessors in js/selection.js.

import { getDpadDirection, directionFromVector, vectorFromDirection, getDpadComponents } from './dpad.js';
import { radialDeadzone, clampRoundedSquare, getAnalogStick } from './stick-math.js';

export function createStickUpdate({
  appState, cfg, ANALOG_DEFAULTS,
  els, // { joystick, btnEls }
  getButtonMap,
  lastPressedTimes,
  saveStateData
}) {
  const { joystick, btnEls } = els;

  function handleDpadMovement(pad) {
    if (!pad) return -1; const now = performance.now(); let direction = -1;
    direction = getDpadDirection(pad, getButtonMap());
    const lx = pad.axes?.[0] || 0, ly = pad.axes?.[1] || 0;
    const stickDirection = directionFromVector(lx, ly);
    if (stickDirection !== -1) direction = stickDirection;
    return direction;
  }

  function getStickMovementEnabled(id) {
    const state = appState.buttons[id] || {};
    return state.stickMovement !== undefined ? state.stickMovement : appState.analog?.[id] !== false;
  }

  function handleStickMovement(pad) {
    const now = performance.now();
    // if no pad, reset both sticks to center and clear distances
    if (!pad) {
      if (btnEls['LS']) btnEls['LS'].style.transform = 'translate(0px, 0px)';
      if (btnEls['RS']) btnEls['RS'].style.transform = 'translate(0px, 0px)';
      return;
    }

    // Visual movement of LS/RS buttons: only when enabled
    const ls = getAnalogStick(pad, 'left', cfg.deadzone, cfg.invertY);
    const lsRadius = Math.max(0, Math.min(100, parseInt(appState.buttons.LS?.stickRadius ?? ANALOG_DEFAULTS.stickRadius, 10) || 0));
    if (!getStickMovementEnabled('LS')) {
      if (btnEls['LS']) btnEls['LS'].style.transform = 'translate(0px, 0px)';
    } else {
      if (ls.x === 0 && ls.y === 0) { if (btnEls['LS']) btnEls['LS'].style.transform = 'translate(0px, 0px)'; }
      else { if (btnEls['LS']) btnEls['LS'].style.transform = `translate(${ls.x * lsRadius}px, ${ls.y * lsRadius}px)`; }
    }

    const rs = getAnalogStick(pad, 'right', cfg.deadzone, cfg.invertY);
    const rsRadius = Math.max(0, Math.min(100, parseInt(appState.buttons.RS?.stickRadius ?? ANALOG_DEFAULTS.stickRadius, 10) || 0));
    if (!getStickMovementEnabled('RS')) {
      if (btnEls['RS']) btnEls['RS'].style.transform = 'translate(0px, 0px)';
    } else {
      if (rs.x === 0 && rs.y === 0) { if (btnEls['RS']) btnEls['RS'].style.transform = 'translate(0px, 0px)'; }
      else { if (btnEls['RS']) btnEls['RS'].style.transform = `translate(${rs.x * rsRadius}px, ${rs.y * rsRadius}px)`; }
    }
  }

  function getStickXY(pad) {
    if (!pad) return { x: 0, y: 0 };
  const stickDz = (appState.analog && typeof appState.analog.triggerDeadzone === 'number') ? appState.analog.triggerDeadzone : cfg.deadzone;
    const axes = pad.axes || [];
    let a = radialDeadzone(axes[0] || 0, axes[1] || 0, stickDz); let { x, y } = a;
    const direction = getDpadDirection(pad, getButtonMap());
    const dpadVector = vectorFromDirection(direction);
    if (dpadVector) { x = dpadVector.x; y = dpadVector.y; }
    return clampRoundedSquare(x, cfg.invertY ? -y : y);
  }

  function updateButtonsFromPad(pad) {
    if (!pad || !pad.buttons) { resetJoystickHead(); Object.values(btnEls).forEach(b => b.classList.remove('active')); return; }
    let anyPressed = false;
    const dpadDirection = getDpadDirection(pad, getButtonMap());
    const dpadComponents = getDpadComponents(dpadDirection);
    for (const key in btnEls) {
      const idx = getButtonMap()[key];
      if (idx === undefined || idx === null) { btnEls[key].classList.remove('active'); continue; }
      if (dpadComponents[key.toLowerCase()] !== undefined) {
        const pressed = dpadComponents[key.toLowerCase()];
        btnEls[key].classList.toggle('active', pressed);
        if (pressed) { anyPressed = true; lastPressedTimes[key] = performance.now(); }
        continue;
      }
      const DEADZONE = 0.45;
      // raw value from button (some controllers expose analog value on triggers)
      const button = pad.buttons[idx];
      let raw = button?.pressed ? (typeof button.value === 'number' ? button.value : 1) : 0;
      let val = raw;

      // Handle analog triggers (LT/RT) by mapping pressure -> brightness & subtle scale
      if (key === 'LT' || key === 'RT') {
        const el = btnEls[key];
  const pressureEnabled = !!(appState.analog && appState.analog.pressureEnabled);
  const minB = (appState.analog && typeof appState.analog.minTriggerBrightness === 'number') ? appState.analog.minTriggerBrightness : 0.4;
  const maxB = (appState.analog && typeof appState.analog.maxTriggerBrightness === 'number') ? appState.analog.maxTriggerBrightness : 2.0;
  const triggerDz = (appState.analog && typeof appState.analog.triggerDeadzone === 'number') ? appState.analog.triggerDeadzone : DEADZONE;
  const isActive = val > triggerDz;
        el.classList.toggle('active', isActive);
        if (pressureEnabled) {
          // Map 0..1 linear -> minB..maxB
          // when below triggerDeadzone treat as 0 so it snaps back to min brightness
          const v = (val <= triggerDz) ? 0 : Math.max(0, Math.min(1, val));
          const brightness = minB + v * (maxB - minB);
          const scale = 1 + v * 0.08;
          try { el.style.filter = `brightness(${brightness})`; el.style.transform = `scale(${scale})`; } catch (e) {}
        } else {
          // Pressure disabled: simple on/off brightness (minTriggerBrightness or maxTriggerBrightness)
          try { el.style.filter = isActive ? `brightness(${maxB})` : `brightness(${minB})`; el.style.transform = isActive ? `scale(${1 + 0.08})` : `scale(1)`; } catch (e) {}
        }
        if (isActive) { anyPressed = true; lastPressedTimes[key] = performance.now(); }
      } else {
        const pressed = !!(pad.buttons[idx] && pad.buttons[idx].pressed);
        btnEls[key].classList.toggle('active', pressed);
        if (pressed && !cfg.ignoredForJoystick.includes(key)) { anyPressed = true; lastPressedTimes[key] = performance.now(); }
      }
    }

    if (anyPressed) {
      let active = null, latest = -1;
      for (const k in lastPressedTimes) {
        if (btnEls[k].classList.contains('active') && !cfg.ignoredForJoystick.includes(k) && lastPressedTimes[k] > latest) { latest = lastPressedTimes[k]; active = k; }
      }
      if (active) {
        const cs = getComputedStyle(btnEls[active]); joystick.style.transform = 'translate(-50%,-50%) scale(1.25)'; joystick.textContent = btnEls[active].textContent || active; joystick.style.backgroundColor = cs.backgroundColor; joystick.style.color = cs.color;
        if (appState.joystickHead) { if (appState.joystickHead.boxShadow) joystick.style.boxShadow = appState.joystickHead.boxShadow; if (appState.joystickHead.outline) joystick.style.outline = appState.joystickHead.outline; if (appState.joystickHead.borderRadius) joystick.style.borderRadius = appState.joystickHead.borderRadius; if (appState.joystickHead.fontSize) joystick.style.fontSize = appState.joystickHead.fontSize; }
        return;
      }
    }
    saveStateData(); resetJoystickHead();
  }

  function resetJoystickHead() {
    joystick.style.transform = 'translate(-50%,-50%) scale(1)'; joystick.textContent = '';
    const head = appState.joystickHead || {};
    if (head.backgroundColor !== undefined) joystick.style.backgroundColor = head.backgroundColor;
    if (head.color !== undefined) joystick.style.color = head.color;
    if (head.boxShadow !== undefined) joystick.style.boxShadow = head.boxShadow;
    if (head.outline !== undefined) joystick.style.outline = head.outline;
    if (head.borderRadius !== undefined) joystick.style.borderRadius = head.borderRadius;
    if (head.fontSize !== undefined) joystick.style.fontSize = head.fontSize;
  }

  return {
    handleDpadMovement, getStickMovementEnabled, handleStickMovement,
    getStickXY, updateButtonsFromPad, resetJoystickHead
  };
}
