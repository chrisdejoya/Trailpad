// Gamepad input-detection helpers shared by main.js's controller assignment
// logic.
//
// These thresholds decide whether a controller is producing real input for
// the wait-for-assignment logic. They must NOT come from
// appState.analog.triggerDeadzone: that setting drives trigger-brightness
// display and is 0 in most layouts, which would make any resting analog
// jitter (sticks idle within ±0.05, triggers rest slightly above 0) look
// like input and instantly assign a controller on page load.

const INPUT_DETECT_BUTTON_THRESHOLD = 0.5; // digital buttons read 0/1; analog triggers must pass half-travel
const INPUT_DETECT_AXIS_THRESHOLD = 0.15;  // resting sticks sit within roughly ±0.1 of center

// True when a controller-shaped object (native Gamepad or a TrailChain
// controller snapshot) is producing deliberate input: a button held past
// half-travel, or an axis pushed past the detection deadzone. Deliberately
// ignores GamepadButton.pressed — browsers set pressed=true for analog
// buttons (triggers) whenever the value is merely above zero, so idle
// triggers would otherwise read as pressed.
export function controllerHasInput(pad) {
  if (!pad) return false;
  const buttons = Array.isArray(pad.buttons) ? pad.buttons : [];
  const anyBtn = buttons.some(b => {
    if (b === true) return true; // TrailChain boolean button state
    const value = (b && typeof b.value === 'number') ? b.value : (b ? 1 : 0);
    return value > INPUT_DETECT_BUTTON_THRESHOLD;
  });
  const axes = Array.isArray(pad.axes) ? pad.axes : [];
  const anyAx = axes.some(a => typeof a === 'number' && Math.abs(a) > INPUT_DETECT_AXIS_THRESHOLD);
  return anyBtn || anyAx;
}

// First native gamepad producing real input (its index), or null. Uses
// controllerHasInput (fixed detection thresholds) so idle sticks/triggers
// can never count as input — a pad only becomes eligible for the active
// slot once the player actually presses something or moves a stick.
export function detectActiveGamepad() {
  const gps = navigator.getGamepads ? navigator.getGamepads() : [];
  for (let i = 0; i < gps.length; i++) { if (controllerHasInput(gps[i])) return i; }
  return null;
}