// Button remap panel — lets the user walk through Trailpad's logical inputs and
// press the physical controller button that should drive each one.
//
// Trailpad's convention is the Gamepad API "standard" mapping:
//   0=A 1=B 2=X 3=Y 4=LB 5=RB 6=LT 7=RT 8=View 9=Menu 10=LS 11=RS
//   12=DpadUp 13=DpadDown 14=DpadLeft 15=DpadRight
//
// The panel cycles through TRAILPAD_INPUTS in order, highlights the current row
// and waits for a button press. Each assignment is applied (and persisted) the
// moment it is captured, so closing the panel mid-cycle keeps the work done so
// far. There is deliberately no skip: an input a device cannot report simply
//
// Individual rows are also clickable: clicking one listens for a single press
// and remaps just that input ("latest wins" — any other input still holding the
// pressed button is unassigned, so two inputs never share a button after a
// capture). Unassigned inputs render as such and simply never trigger their
// widget.
//
// The same targeted listen is reachable from the pad itself: main.js calls
// listenFor(key) when a pad button is held down (long-press), which opens the
// panel and arms that input's row directly.
//
// D-pad rows additionally accept directional vectors: an SDL hat axis or a
// bipolar axis pair (stick / d-pad HID pair) tilted in the prompted direction.
// A captured vector is stored as a string ('hat:9' / 'axis:2'); the direction
// it stands for is implied by the row (Right=0, Down=2, Left=4, Up=6 — atan2
// with y pointing down), so several directions may share one source.
//
// Each row also carries two compact icon tools: restore that input's default
// binding, or unassign it.
// keeps its previous value and the user closes the panel.

export const TRAILPAD_INPUTS = [
  { key: 'A', label: 'A' },
  { key: 'B', label: 'B' },
  { key: 'X', label: 'X' },
  { key: 'Y', label: 'Y' },
  { key: 'LB', label: 'LB' },
  { key: 'RB', label: 'RB' },
  { key: 'LT', label: 'LT' },
  { key: 'RT', label: 'RT' },
  { key: 'View', label: 'View' },
  { key: 'Menu', label: 'Menu' },
  { key: 'LS', label: 'LS' },
  { key: 'RS', label: 'RS' },
  { key: 'Up', label: 'Up' },
  { key: 'Down', label: 'Down' },
  { key: 'Left', label: 'Left' },
  { key: 'Right', label: 'Right' }
];

// Out of the box each logical input drives the physical button of the same
// position, which is exactly the standard mapping above.
export const DEFAULT_BUTTON_MAP = Object.fromEntries(
  TRAILPAD_INPUTS.map((input, index) => [input.key, index])
);

// True when every input still points at its out-of-the-box button. Callers use
// this to skip device-specific direction heuristics while nothing was changed.
export function isDefaultButtonMap(map) {
  return TRAILPAD_INPUTS.every(({ key }) => !map || map[key] === DEFAULT_BUTTON_MAP[key]);
}

// D-pad inputs can also be driven by directional vectors (see header). The
// mapping below is main.js's 8-way convention: atan2(y, x) with y down.
export const DPAD_DIRECTIONS = { Up: 6, Down: 2, Left: 4, Right: 0 };
const DPAD_ARROWS = { Up: '↑', Down: '↓', Left: '←', Right: '→' };

function directionFromVector(x, y) {
  if (Math.hypot(x, y) <= 0.3) return -1;
  return Math.round(8 * Math.atan2(y, x) / (2 * Math.PI) + 8) % 8;
}

// Same decode as main.js's directionFromHatValue: leverless pads expose the
// SDL hat on axis 9 with a 23/7 neutral and seven-step active values.
function directionFromHatValue(value) {
  if (typeof value !== 'number' || !Number.isFinite(value)) return -1;
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

// True when the value encodes a vector source instead of a physical button.
export function isVectorValue(value) {
  return typeof value === 'string' && (value.startsWith('hat:') || value.startsWith('axis:'));
}

// 'hat:9' / 'axis:2' -> { type, index }; numbers and null -> null.
export function parseVectorValue(value) {
  if (!isVectorValue(value)) return null;
  const index = Number(value.slice(value.indexOf(':') + 1));
  if (!Number.isInteger(index) || index < 0) return null;
  return { type: value.startsWith('hat') ? 'hat' : 'axis', index };
}

// First vector source currently pointing at `direction` (-1 never matches).
// Pairs 2-5 are skipped when both values are non-negative: those slots carry
// positive-only trigger/lever axes on raw HID pads, not a d-pad. Pairs 0-1
// (the sticks) stay usable so "all vectors" can drive the d-pad inputs.
function findVectorValue(axes, direction) {
  if (!axes || direction === undefined || direction < 0) return null;
  if (axes.length > 9 && directionFromHatValue(axes[9]) === direction) return 'hat:9';
  for (let i = 0; i + 1 < axes.length; i++) {
    const x = axes[i] || 0;
    const y = axes[i + 1] || 0;
    if (i >= 2 && i < 6 && x >= 0 && y >= 0) continue;
    if (directionFromVector(x, y) === direction) return 'axis:' + i;
  }
  return null;
}

function formatButtonLabel(value, input) {
  if (typeof value === 'number') return 'Button ' + value;
  const parsed = parseVectorValue(value);
  if (parsed) {
    const source = parsed.type === 'hat'
      ? 'Hat ' + parsed.index
      : 'Axes ' + parsed.index + '+' + (parsed.index + 1);
    return source + ' ' + (DPAD_ARROWS[input ? input.key : ''] || '');
  }
  return 'Unassigned';
}

function countAssignments(map) {
  const counts = new Map();
  TRAILPAD_INPUTS.forEach(({ key }) => {
    const value = map[key];
    counts.set(value, (counts.get(value) || 0) + 1);
  });
  return counts;
}

function countUnassigned(map) {
  return TRAILPAD_INPUTS.reduce((n, { key }) => n + (map[key] === null ? 1 : 0), 0);
}

export function createRemapButton(options = {}) {
  const { getMapping, onApply, showToast } = options;

  // Always work from a complete map so a partially stored state (older saves)
  // still renders every row.
  const readMapping = () => Object.assign({}, DEFAULT_BUTTON_MAP, getMapping ? getMapping() : null);

  // --- floating button (same size/look as the donate button) ---
  const button = document.createElement('button');
  button.type = 'button';
  button.className = 'remapButton';
  button.setAttribute('aria-label', 'Remap controller buttons');
  button.setAttribute('aria-expanded', 'false');
  button.innerHTML = '<img src="images/remap.svg" alt="">';

  // --- panel ---
  const panel = document.createElement('div');
  panel.className = 'remapPanel';
  panel.setAttribute('role', 'dialog');
  panel.setAttribute('aria-label', 'Controller button mapping');
  panel.setAttribute('aria-hidden', 'true');

  const title = document.createElement('div');
  title.className = 'remapTitle';
  title.textContent = 'Button Mapping';

  const list = document.createElement('div');
  list.className = 'remapList';

  const rows = new Map();
  TRAILPAD_INPUTS.forEach(input => {
    const row = document.createElement('div');
    row.className = 'remapItem';
    row.dataset.key = input.key;
    const label = document.createElement('span');
    label.className = 'remapItemLabel';
    label.textContent = input.label;
    const value = document.createElement('span');
    value.className = 'remapItemValue';
    row.appendChild(label);
    row.appendChild(value);
    // Compact per-row tools: restore this input's default binding or drop it
    // altogether. Icon-only, they never start a listen and stay inert while
    // the walkthrough drives the prompts.
    const tools = document.createElement('span');
    tools.className = 'remapItemTools';
    const defaultTool = document.createElement('button');
    defaultTool.type = 'button';
    defaultTool.className = 'remapTool';
    defaultTool.textContent = '↺';
    defaultTool.title = 'Set ' + input.label + ' to default';
    defaultTool.setAttribute('aria-label', defaultTool.title);
    const unassignTool = document.createElement('button');
    unassignTool.type = 'button';
    unassignTool.className = 'remapTool';
    unassignTool.textContent = '✕';
    unassignTool.title = 'Unassign ' + input.label;
    unassignTool.setAttribute('aria-label', unassignTool.title);
    tools.appendChild(defaultTool);
    tools.appendChild(unassignTool);
    row.appendChild(tools);
    defaultTool.addEventListener('click', (e) => {
      e.stopPropagation();
      if (capturing) return;
      if (listeningKey === input.key) listeningKey = null;
      applyAssignment(input, DEFAULT_BUTTON_MAP[input.key]);
      render();
      setStatus(input.label + ' set to default');
    });
    unassignTool.addEventListener('click', (e) => {
      e.stopPropagation();
      if (capturing) return;
      if (listeningKey === input.key) listeningKey = null;
      applyAssignment(input, null);
      render();
      setStatus(input.label + ' unassigned');
    });
    // Click a row to remap just this input: the next controller press is
    // captured for it alone. Click the same row again to cancel, or another
    // row to switch targets. Ignored while the walkthrough drives the prompts.
    row.addEventListener('click', (e) => {
      e.stopPropagation();
      if (capturing) return;
      listeningKey = listeningKey === input.key ? null : input.key;
      armed = false;
      render();
      promptListen();
    });
    list.appendChild(row);
    rows.set(input.key, { row, value, defaultTool, unassignTool });
  });

  const status = document.createElement('div');
  status.className = 'remapStatus';

  const footer = document.createElement('div');
  footer.className = 'remapFooter';

  const resetAction = document.createElement('button');
  resetAction.type = 'button';
  resetAction.className = 'remapAction';
  resetAction.textContent = 'Reset';

  const remapAction = document.createElement('button');
  remapAction.type = 'button';
  remapAction.className = 'remapAction remapPrimary';
  remapAction.textContent = 'Remap';

  footer.appendChild(resetAction);
  footer.appendChild(remapAction);

  panel.appendChild(title);
  panel.appendChild(list);
  panel.appendChild(status);
  panel.appendChild(footer);
  document.body.appendChild(panel);

  let open = false;
  let capturing = false;
  let currentIndex = -1;
  // Capture waits for a clean release first so a button held while the cycle
  // starts (or the press that was just captured) cannot claim two rows.
  let armed = false;
  // Targeted remap: set while the user clicked a single row and the next press
  // is captured for that row only (cleared by stopCapture/close/Reset).
  let listeningKey = null;

  function setStatus(text) {
    status.textContent = text;
  }

  function render() {
    const mapping = readMapping();
    const counts = countAssignments(mapping);
    TRAILPAD_INPUTS.forEach((input, index) => {
      const entry = rows.get(input.key);
      if (!entry) return;
      const value = mapping[input.key];
      entry.value.textContent = formatButtonLabel(value, input);
      const isCurrent = capturing ? index === currentIndex : input.key === listeningKey;
      entry.row.classList.toggle('is-current', isCurrent);
      entry.row.classList.toggle('is-unassigned', value === null || value === undefined);
      // Duplicate flags only apply to physical buttons: several directions
      // sharing one axis pair or hat is a legitimate vector setup.
      entry.row.classList.toggle('is-duplicate', typeof value === 'number' && (counts.get(value) || 0) > 1);
      // Dim the tools that would be a no-op right now.
      entry.defaultTool.classList.toggle('is-dim', value === DEFAULT_BUTTON_MAP[input.key]);
      entry.unassignTool.classList.toggle('is-dim', value === null || value === undefined);
    });
    const focusKey = capturing && currentIndex >= 0 ? TRAILPAD_INPUTS[currentIndex].key : listeningKey;
    if (focusKey) {
      const entry = rows.get(focusKey);
      if (entry) { try { entry.row.scrollIntoView({ block: 'nearest' }); } catch (e) {} }
    }
  }

  function promptCurrent() {
    if (!capturing) return;
    const input = TRAILPAD_INPUTS[currentIndex];
    if (!input) return;
    const tilt = DPAD_DIRECTIONS[input.key] !== undefined ? ' or tilt ' + input.label.toLowerCase() : '';
    setStatus('Press the ' + input.label + ' button' + tilt + ' on your controller');
  }

  function promptListen() {
    const input = TRAILPAD_INPUTS.find(item => item.key === listeningKey);
    if (!input) return;
    const tilt = DPAD_DIRECTIONS[input.key] !== undefined ? ' or tilt ' + input.label.toLowerCase() : '';
    setStatus('Press a button' + tilt + ' to map to ' + input.label);
  }

  function startCapture() {
    capturing = true;
    currentIndex = 0;
    armed = false;
    render();
    promptCurrent();
  }

  function stopCapture() {
    capturing = false;
    currentIndex = -1;
    armed = false;
    listeningKey = null;
    render();
  }

  // Pad-button entry point (main.js wires this to a pad button long-press):
  // drop any walkthrough in progress and arm `key`'s row directly, opening the
  // panel if needed so the press prompt is on screen.
  function listenFor(key) {
    capturing = false;
    currentIndex = -1;
    listeningKey = key;
    armed = false;
    openPanel();
    render();
    promptListen();
  }

  // Single write path for every assignment (capture, per-row default, per-row
  // unassign). Numbers get "latest wins": any other input holding the same
  // physical button is unassigned. Vector sources are per-direction, so two
  // inputs may legitimately share one axis pair or hat.
  function applyAssignment(input, value) {
    const mapping = readMapping();
    if (typeof value === 'number') {
      TRAILPAD_INPUTS.forEach(({ key }) => {
        if (key !== input.key && mapping[key] === value) mapping[key] = null;
      });
    }
    mapping[input.key] = value;
    if (onApply) onApply(mapping);
    if (!showToast) return;
    if (value === null || value === undefined) showToast(input.label + ' unassigned', 1000);
    else if (value === DEFAULT_BUTTON_MAP[input.key]) showToast(input.label + ' set to default', 1000);
    else showToast(input.label + ' mapped to ' + formatButtonLabel(value, input), 1000);
  }

  function assignButton(captured) {
    const input = capturing
      ? TRAILPAD_INPUTS[currentIndex]
      : TRAILPAD_INPUTS.find(item => item.key === listeningKey);
    if (!input) return;
    applyAssignment(input, captured);
    armed = false;
    if (capturing) {
      currentIndex += 1;
      if (currentIndex >= TRAILPAD_INPUTS.length) {
        stopCapture();
        const unassigned = countUnassigned(readMapping());
        setStatus(unassigned
          ? 'Mapping complete — ' + unassigned + ' unassigned, click a row to remap'
          : 'Mapping complete — click a row to remap individually');
        return;
      }
      render();
      promptCurrent();
      return;
    }
    // Targeted remap: one press, done.
    listeningKey = null;
    render();
    setStatus(input.label + ' is now ' + formatButtonLabel(captured, input));
  }

  // Driven from the main animation loop so capture and normal button
  // highlighting share a single gamepad read.
  function update(pad) {
    if (!capturing && !listeningKey) return;
    const buttons = pad && pad.buttons;
    const axes = pad && pad.axes;
    if ((!buttons || buttons.length === 0) && (!axes || axes.length === 0)) {
      setStatus('No controller detected — connect one to continue');
      return;
    }
    let pressedIndex = -1;
    if (buttons) {
      for (let i = 0; i < buttons.length; i++) {
        if (buttons[i] && buttons[i].pressed) { pressedIndex = i; break; }
      }
    }
    // D-pad rows also accept a directional vector (hat or axis pair), so pads
    // whose d-pad is not made of buttons can be mapped without pressing any.
    const target = capturing
      ? TRAILPAD_INPUTS[currentIndex]
      : TRAILPAD_INPUTS.find(item => item.key === listeningKey);
    const dpadDirection = target ? DPAD_DIRECTIONS[target.key] : undefined;
    const vectorValue = findVectorValue(axes, dpadDirection === undefined ? -1 : dpadDirection);
    if (!armed) {
      if (pressedIndex === -1 && !vectorValue) { armed = true; promptCurrent(); }
      return;
    }
    if (pressedIndex !== -1) assignButton(pressedIndex);
    else if (vectorValue) assignButton(vectorValue);
  }

  function openPanel() {
    if (open) return;
    open = true;
    panel.classList.add('is-visible');
    panel.setAttribute('aria-hidden', 'false');
    button.setAttribute('aria-expanded', 'true');
    button.classList.add('is-open');
    render();
    setStatus('');
  }

  function closePanel() {
    if (!open) return;
    open = false;
    stopCapture();
    panel.classList.remove('is-visible');
    panel.setAttribute('aria-hidden', 'true');
    button.setAttribute('aria-expanded', 'false');
    button.classList.remove('is-open');
  }

  button.addEventListener('click', (e) => {
    e.stopPropagation();
    button.classList.remove('is-clicked');
    void button.offsetWidth;
    button.classList.add('is-clicked');
    if (open) closePanel(); else openPanel();
  });

  // Clicking Remap again restarts the walkthrough from the first input.
  remapAction.addEventListener('click', startCapture);

  resetAction.addEventListener('click', () => {
    stopCapture();
    if (onApply) onApply(Object.assign({}, DEFAULT_BUTTON_MAP));
    render();
    setStatus('Default mapping restored');
    if (showToast) showToast('Default mapping restored', 1000);
  });

  document.addEventListener('mousedown', (e) => {
    if (!open) return;
    if (panel.contains(e.target) || button.contains(e.target)) return;
    closePanel();
  });

  document.addEventListener('keydown', (e) => {
    if (!open) return;
    if (e.key === 'Escape') closePanel();
  });

  return {
    element: button,
    panel,
    show() { button.classList.remove('is-auto-hidden'); },
    // Stay put while the panel is open: the user is pressing controller
    // buttons, so the idle timer must not hide the button mid-cycle.
    hide() { if (open) return; button.classList.add('is-auto-hidden'); },
    isOpen() { return open; },
    isCapturing() { return capturing; },
    isListening() { return listeningKey !== null; },
    listenFor,
    open: openPanel,
    close: closePanel,
    refresh: render,
    update
  };
}
