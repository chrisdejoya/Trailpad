// TrailChainClient — connects to TrailChain's WebSocket gamepad bridge
// and transforms incoming gamepad-state packets into a virtual Gamepad API
// object that Trailpad's existing animation loop can consume.
//
// Reference: trailchain-viewer.html (consumer reference in the TrailChain repo)
//
// TrailChain packet format (version 3):
//   {
//     type: "gamepad-state",
//     version: 3,
//     timestamp: <epoch-ms>,
//     controllers: [{
//       index, instanceId, name, guid, path, type,
//       mapping: "xinput" | "mapped" | "raw",
//       battery, vendor, product, firmware, serial,
//       axes: [float, ...],           // [-1..1] for sticks, [0..1] for triggers
//       buttons: [bool, ...],        // boolean array, indices depend on mapping
//       hats: [int, ...],            // SDL hat bitmasks
//       rawAxes, rawButtons, mappedAxes, mappedButtons
//     }]
//   }
//
// The Web Gamepad API (what Trailpad expects) provides:
//   pad.buttons: [{pressed: bool, value: number}, ...]
//   pad.axes: [float, ...]   axes[9] = hat as float (-1..1, 0=centered)
//   pad.mapping: "standard"
//
// Button index remap (TrailChain -> Gamepad API):
//   XInput:  0=A,1=B,2=X,3=Y,4=LB,5=RB,6=Back->View,7=Start->Menu,8=LS,9=RS,12-15=dpad
//            LT/RT come as axes[4]/[5] -> synthesized as buttons 6/7
//   SDL:     0=A,1=B,2=X,3=Y,4=Back->View,5=Start->Menu,6=LS,7=RS,8=LB,9=RB,11-14=dpad
//            LT/RT come as axes[4]/[5] -> synthesized as buttons 6/7
//   Raw:     indices are device-specific; pass through as best-effort

const SDL_HAT_TO_GAMEPAD_FLOAT = {
  0: 0,           // centered
  1: -1,          // up
  9: -5 / 7,      // up-right
  8: -3 / 7,      // right
  10: -1 / 7,     // down-right
  2: 1 / 7,       // down
  6: 3 / 7,       // down-left
  4: 5 / 7,       // left
  5: 1,           // up-left
};

const TRIGGER_DEADZONE = 0.5;
const GAMEPAD_BUTTON_COUNT = 16;

function sdlBitmaskToGamepadHat(mask) {
  return SDL_HAT_TO_GAMEPAD_FLOAT[mask] ?? 0;
}

function makeButton(pressed, value = pressed ? 1 : 0) {
  return { pressed: !!pressed, value: value };
}

function createStandardButtons() {
  return Array.from({ length: GAMEPAD_BUTTON_COUNT }, () => makeButton(false));
}

// Remap button index from TrailChain convention to Gamepad API standard.
// Returns the standard index, or -1 if the button has no standard equivalent.
function trailChainToGamepadIndex(rawIndex, mapping) {
  if (mapping === 'xinput') {
    // TrailChain XInput: 0=A,1=B,2=X,3=Y,4=LB,5=RB,6=Back,7=Start,8=LS,9=RS,12-15=dpad
    switch (rawIndex) {
      case 0: case 1: case 2: case 3: case 4: case 5:
        return rawIndex; // A,B,X,Y,LB,RB — same
      case 6: return 8;   // Back -> View
      case 7: return 9;   // Start -> Menu
      case 8: return 10;  // LS
      case 9: return 11;  // RS
      case 12: return 12; // Up
      case 13: return 13; // Down
      case 14: return 14; // Left
      case 15: return 15; // Right
      default: return -1;
    }
  }
  // SDL mapped (and raw as fallthrough): 0=A,1=B,2=X,3=Y,4=Back,5=Start,
  // 6=LS,7=RS,8=LB,9=RB,10=misc,11=DpadUp,12=DpadDown,13=DpadLeft,14=DpadRight
  switch (rawIndex) {
    case 0: case 1: case 2: case 3: return rawIndex; // A,B,X,Y
    case 4: return 8;   // Back -> View
    case 5: return 9;   // Start -> Menu
    case 6: return 10;  // LS
    case 7: return 11;  // RS
    case 8: return 4;   // LB -> LB
    case 9: return 5;   // RB -> RB
    case 11: return 12; // DpadUp -> Up
    case 12: return 13; // DpadDown -> Down
    case 13: return 14; // DpadLeft -> Left
    case 14: return 15; // DpadRight -> Right
    default: return -1;
  }
}

// Convert a TrailChain controller snapshot into a virtual Gamepad object.
function transformController(controller) {
  const sourceAxes = controller.axes || controller.rawAxes || [];
  const sourceButtons = controller.buttons || controller.rawButtons || [];
  const hats = controller.hats || [0];
  const mapping = controller.mapping || 'raw';

  // Build axes array: first 6 from source (sticks + triggers), pad to 10, then hat on [9]
  const axes = [];
  for (let i = 0; i < 6; i++) axes.push(typeof sourceAxes[i] === 'number' ? sourceAxes[i] : 0);
  // Axes 6-8 (if any) are additional — pad with zeros
  while (axes.length < 9) axes.push(0);
  // axes[9] = hat as Gamepad API float
  const hatMask = hats[0] || 0;
  axes.push(sdlBitmaskToGamepadHat(hatMask));

  // Build buttons array: 16 entries following Gamepad API layout
  const buttons = createStandardButtons();

  // Place face/ shoulder/ dpad buttons according to mapping convention
  for (let i = 0; i < sourceButtons.length; i++) {
    const gpIdx = trailChainToGamepadIndex(i, mapping);
    if (gpIdx >= 0) {
      const isPressed = !!sourceButtons[i];
      buttons[gpIdx] = makeButton(isPressed, isPressed ? 1 : 0);
    }
  }

  // Synthesize LT/RT buttons (indices 6 and 7) from trigger axes
  // TrailChain reports triggers as axes[4] (LT) and axes[5] (RT) on both XInput and SDL
  buttons[6] = makeButton(sourceAxes[4] > TRIGGER_DEADZONE, sourceAxes[4] || 0);
  buttons[7] = makeButton(sourceAxes[5] > TRIGGER_DEADZONE, sourceAxes[5] || 0);

  return {
    id: controller.name || 'TrailChain Controller',
    index: controller.index || 0,
    connected: true,
    mapping: 'standard',
    axes: axes,
    buttons: buttons,
    // metadata from TrailChain
    _trailchain: {
      instanceId: controller.instanceId,
      guid: controller.guid,
      path: controller.path,
      type: controller.type,
      battery: controller.battery,
      vendor: controller.vendor,
      product: controller.product,
      firmware: controller.firmware,
      serial: controller.serial,
    },
  };
}

export class TrailChainClient {
  constructor(host, port = 3819, options = {}) {
    this.host = host;
    this.port = port;
    this.url = `${this._resolveProtocol()}://${host}:${port}`;
    this.socket = null;
    this.connected = false;
    this.controllers = [];
    this.currentGamepad = null;
    this.controllerIndex = options.controllerIndex ?? 0;

    this.onConnect = options.onConnect || (() => {});
    this.onDisconnect = options.onDisconnect || (() => {});
    this.onError = options.onError || (() => {});
    this.onControllers = options.onControllers || (() => {});

    this._retryTimer = null;
    this._connecting = false;
    this._wasConnected = false;
    this._reconnectAttempts = 0;
  }

  _resolveProtocol() {
    const protocol = location.protocol;
    if (protocol === 'https:') return 'wss';
    if (protocol === 'http:') return 'ws';
    return 'ws'; // file:// or other — default to ws
  }

  connect() {
    if (this._connecting) return;
    this._connecting = true;
    this._connect();
  }

  _connect() {
    try {
      this.socket = new WebSocket(this.url);
    } catch (e) {
      this._handleError(e);
      this._scheduleRetry();
      return;
    }

     this.socket.addEventListener('open', () => {
      this.connected = true;
      this._wasConnected = true;
      this._connecting = false;
      this._reconnectAttempts = 0;
      this.onConnect();
    });

    this.socket.addEventListener('message', (event) => {
      this._handleMessage(event.data);
    });

    this.socket.addEventListener('close', () => {
      this.connected = false;
      this._connecting = false;
      this.currentGamepad = null;
      // Only report a disconnection if we were previously connected.
      // During retry storms (server never came up), skip the callback.
      if (this._wasConnected) {
        this._wasConnected = false;
        this.onDisconnect();
      }
      this._scheduleRetry();
    });

    this.socket.addEventListener('error', (err) => {
      this._handleError(err);
      if (this.socket) this.socket.close();
    });
  }

  _scheduleRetry() {
    if (this._retryTimer) clearTimeout(this._retryTimer);
    const delay = Math.min(1000 * Math.pow(1.5, this._reconnectAttempts), 10000);
    this._reconnectAttempts = Math.min(this._reconnectAttempts + 1, 10);
    this._retryTimer = setTimeout(() => {
      this._connect();
    }, delay);
  }

  _handleMessage(raw) {
    let packet;
    try {
      packet = JSON.parse(raw);
    } catch (e) {
      console.warn('[TrailChainClient] Malformed packet:', e);
      return;
    }

    if (packet.type !== 'gamepad-state') return;

    this.controllers = Array.isArray(packet.controllers) ? packet.controllers : [];
    this.onControllers(this.controllers);

    const ctrl = this.controllers[this.controllerIndex];
    this.currentGamepad = ctrl ? transformController(ctrl) : null;
  }

  _handleError(err) {
    console.warn('[TrailChainClient] WebSocket error:', err?.message || err);
    this.onError(err);
  }

  getGamepad() {
    return this.connected ? this.currentGamepad : null;
  }

  getControllerCount() {
    return this.controllers.length;
  }

  getConnected() {
    return this.connected;
  }

  setControllerIndex(index) {
    this.controllerIndex = index;
    const ctrl = this.controllers[index];
    this.currentGamepad = ctrl ? transformController(ctrl) : null;
  }

  disconnect() {
    if (this._retryTimer) {
      clearTimeout(this._retryTimer);
      this._retryTimer = null;
    }
    this._connecting = false;
    this._wasConnected = false;
    this._reconnectAttempts = 0;
    if (this.socket) {
      this.socket.close();
      this.socket = null;
    }
    this.connected = false;
    this.currentGamepad = null;
  }
}

export { transformController, sdlBitmaskToGamepadHat, trailChainToGamepadIndex };
