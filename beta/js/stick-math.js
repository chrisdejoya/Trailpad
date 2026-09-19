// Pure analog-stick math shared by main.js's stick handling.
//
// radialDeadzone deadens everything inside a circular zone around center so a
// resting stick reads exactly {x:0,y:0}; outside the zone the magnitude is
// rescaled so output starts smoothly at the zone edge instead of jumping.
// clampRoundedSquare clamps a point to a rounded-square gate (superellipse) so
// diagonal travel matches a square d-pad gate rather than poking past corners.
//
// getAnalogStick reads a gamepad's stick axes — the "standard" mapping offsets
// ((0,1) left / (2,3) right), falling back to axes (3,4) for right sticks on
// non-standard mappings that expose the stick there — then rescales the
// magnitude into the band between the deadzone and full travel.

// Deadens everything inside a circular deadzone of radius dz around center;
// outside the zone the magnitude is rescaled so output starts smoothly at the
// zone edge.
export function radialDeadzone(x, y, dz) { const mag = Math.hypot(x, y); if (mag < dz) return { x: 0, y: 0 }; const s = (mag - dz) / (1 - dz); return { x: x * s / mag, y: y * s / mag }; }

// Clamps (x, y) to the unit superellipse (rounded square) of exponent n.
export function clampRoundedSquare(x, y, n = 8) { const mag = Math.pow(Math.abs(x), n) + Math.pow(Math.abs(y), n); if (mag > 1) { const scale = Math.pow(mag, -1 / n); return { x: x * scale, y: y * scale }; } return { x, y }; }

export function getAnalogStick(pad, stick = 'left', deadzone = 0.1, invertY = false) {
  if (!pad) return { x: 0, y: 0 };
  const axes = pad.axes || [];
  let axisOffset = stick === 'left' ? 0 : 2;
  if (stick === 'right' && pad.mapping !== 'standard' && axes.length >= 5) {
    const standardMagnitude = Math.hypot(axes[2] || 0, axes[3] || 0);
    const alternateMagnitude = Math.hypot(axes[3] || 0, axes[4] || 0);
    if (standardMagnitude < deadzone && alternateMagnitude >= deadzone) axisOffset = 3;
  }
  let x = axes[axisOffset] || 0; let y = axes[axisOffset + 1] || 0; if (invertY) y = -y;
  // The deadzone parameter always carries its numeric default (0.1), so the
  // ternary below always takes its first branch; the fallback is kept for
  // defensive parity with the original inline version in main.js.
  const dz = (typeof deadzone === 'number' && deadzone !== undefined) ? deadzone : 0.1;
  const mag = Math.hypot(x, y); if (mag < dz) return { x: 0, y: 0 }; const scale = (mag - dz) / (1 - dz); return { x: (x / mag) * scale, y: (y / mag) * scale };
}
