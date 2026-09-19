// D-pad direction reading for Trailpad. Directions use the project's 8-way
// convention (see js/button-remap.js): atan2(y, x) with y pointing down, so
// 0=Right, 2=Down, 4=Left, 6=Up, with odd values for the diagonals between.
//
// getDpadDirection(pad, buttonMap) sniffs a gamepad's d-pad state in the order
// that handles the widest range of devices:
//   1. A custom mapping from the remap panel wins outright — the user said
//      which physical button or vector source drives each direction.
//   2. The "standard" mapping's d-pad buttons (12-15), with the offsets
//      swapped for PlayStation pads and non-standard mappings.
//   3. An SDL hat axis (axis 9), decoded only for recognized values.
//   4. A bipolar axis pair (6,7) on non-standard mappings (HID/SDL devices
//      that expose the d-pad as a second stick pair).
// It returns -1 when nothing directional is pressed. main.js calls it every
// frame with its live buttonMap; the other helpers are pure direction math
// shared with the remap panel and the stick movement code.

import { isDefaultButtonMap, DPAD_DIRECTIONS, parseVectorValue } from './button-remap.js';

export function directionFromVector(x, y) {
  if (Math.hypot(x, y) <= 0.3) return -1;
  return Math.round(8 * Math.atan2(y, x) / (2 * Math.PI) + 8) % 8;
}

export function directionFromHatValue(value) {
  if (typeof value !== 'number' || !Number.isFinite(value)) return -1;
  // Some leverless controllers expose the SDL hat on axis 9. Their neutral
  // value may be 23/7 instead of zero, while active values are the usual
  // seven-step values between -1 and 1.
  const hatValues = [
    [3.28571, -1],
    [-1, 6], [-5 / 7, 7], [-3 / 7, 0], [-1 / 7, 1],
    [1 / 7, 2], [3 / 7, 3], [5 / 7, 4], [1, 5]
  ];
  let closest = -1;
  let distance = Infinity;
  for (const [hatValue, direction] of hatValues) {
    const candidateDistance = Math.abs(value - hatValue);
    if (candidateDistance < distance) {
      distance = candidateDistance;
      closest = direction;
    }
  }
  return distance <= 0.08 ? closest : -1;
}

export function vectorFromDirection(direction) {
  if (direction < 0) return null;
  const angle = direction * Math.PI / 4;
  return { x: Math.cos(angle), y: Math.sin(angle) };
}

// Shared by the remapped and layout-sniffing direction readers below.
export function directionFromPressedComponents(pressed) {
  if (pressed.up && pressed.left) return 5;
  if (pressed.up && pressed.right) return 7;
  if (pressed.down && pressed.left) return 3;
  if (pressed.down && pressed.right) return 1;
  if (pressed.up) return 6;
  if (pressed.down) return 2;
  if (pressed.left) return 4;
  return 0;
}

export function getDpadDirection(pad, buttonMap) {
  if (!pad) return -1;
  const buttons = pad.buttons || [];
  const axes = pad.axes || [];

  // A custom mapping wins: the user told us which physical button (or vector
  // source) drives each direction, so honour it instead of guessing from the
  // device layout. The default map is skipped on purpose so non-standard pads
  // keep the offset sniffing below (their D-pad does not sit at indices 12-15).
  if (!isDefaultButtonMap(buttonMap)) {
    const dirPressed = (key) => {
      const value = buttonMap[key];
      if (typeof value === 'number') return !!buttons[value]?.pressed;
      // Vector sources: 'hat:9' decodes the hat axis, 'axis:2' reads the
      // bipolar axis pair (x, x+1) and compares it with this input's
      // direction (Right=0, Down=2, Left=4, Up=6).
      const vector = parseVectorValue(value);
      if (!vector) return false;
      const actual = vector.type === 'hat'
        ? directionFromHatValue(axes[vector.index])
        : directionFromVector(axes[vector.index] || 0, axes[vector.index + 1] || 0);
      return actual === DPAD_DIRECTIONS[key];
    };
    const mapped = {
      up: dirPressed('Up'),
      down: dirPressed('Down'),
      left: dirPressed('Left'),
      right: dirPressed('Right')
    };
    if (mapped.up || mapped.down || mapped.left || mapped.right) return directionFromPressedComponents(mapped);
  }

  const id = String(pad.id || '').toLowerCase();
  const isPlayStation = /sony|054c|dualshock|dualsense|playstation|wireless controller(?!.*xbox)/.test(id);
  const buttonOffsets = isPlayStation || pad.mapping !== 'standard' ? [11, 12] : [12, 11];
  for (const dpadButtonOffset of buttonOffsets) {
    const pressed = {
      up: !!buttons[dpadButtonOffset]?.pressed,
      down: !!buttons[dpadButtonOffset + 1]?.pressed,
      left: !!buttons[dpadButtonOffset + 2]?.pressed,
      right: !!buttons[dpadButtonOffset + 3]?.pressed
    };
    if (pressed.up || pressed.down || pressed.left || pressed.right) return directionFromPressedComponents(pressed);
  }

  // TrailChain and some native leverless controllers expose the d-pad hat at
  // axis 9. Decode only recognized hat values so unrelated axes stay inert.
  if (axes.length > 9) {
    const direction = directionFromHatValue(axes[9]);
    if (direction !== -1) return direction;
  }

  // A few HID/SDL devices expose the d-pad as a second axis pair instead of buttons.
  // Do not inspect the standard left/right stick pairs when the browser reports a
  // standard mapping; those axes are already handled by the analog direction below.
  if (pad.mapping !== 'standard') {
    for (const [xIndex, yIndex] of [[6, 7]]) {
      if (xIndex >= axes.length || yIndex >= axes.length) continue;
      const x = axes[xIndex] || 0;
      const y = axes[yIndex] || 0;
      // Positive-only values in the trigger/right-stick slots are not a d-pad.
      if (xIndex < 6 && x >= 0 && y >= 0) continue;
      const direction = directionFromVector(x, y);
      if (direction !== -1) return direction;
    }
  }
  return -1;
}

// Turn a direction index back into the per-direction booleans used to
// highlight Up/Down/Left/Right.
export function getDpadComponents(direction) {
  return {
    up: direction === 5 || direction === 6 || direction === 7,
    down: direction === 1 || direction === 2 || direction === 3,
    left: direction === 3 || direction === 4 || direction === 5,
    right: direction === 7 || direction === 0 || direction === 1
  };
}

