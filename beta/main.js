window.addEventListener('DOMContentLoaded', () => {
  const STORAGE_KEY = 'trailpad_1';
  const PROFILE_COUNT = 8;

  const map = Object.fromEntries([
    "A", "B", "X", "Y",
    "LB", "RB", "LT", "RT",
    "View", "Menu", "LS", "RS",
    "Up", "Down", "Left", "Right"
  ].map((k, i) => [k, i]));

  const cfg = { deadzone: 0.1, trail: 8, invertY: false, ignoredForJoystick: ['View', 'Menu', 'Up', 'Down', 'Left', 'Right'] };

  const palette = [
    "#660D0D","#801515","#992020","#B32D2D","#CC3A3A","#E64D4D","#FF6666","#FF8080","#FF9999",
    "#66380D","#804514","#99551F","#B3662D","#CC773A","#E68C4D","#FF9966","#FFB380","#FFCC99",
    "#66660D","#808013","#999926","#B3B32D","#CCCC40","#E6E64D","#FFFF66","#FFFF80","#FFFF99",
    "#0D660D","#158015","#208020","#2DB32D","#39CC39","#4DE64D","#66FF66","#80FF80","#99FF99",
    "#0D6666","#148080","#209999","#26B3B3","#33CCCC","#4DE6E6","#66FFFF","#80FFFF","#99FFFF",
    "#0D0D66","#151580","#202099","#2D2DB3","#3939CC","#4D4DE6","#6666FF","#8080FF","#9999FF",
    "#330D66","#451580","#552099","#6B2DB3","#8039CC","#994DE6","#B366FF","#CC80FF","#D9A6FF",
    "#660D66","#801580","#992099","#B32DB3","#CC39CC","#E64DE6","#FF66FF","#FF80FF","#FF99FF",
    "#000000","#333333","#666666","#999999","#CCCCCC","#FFFFFF",
    "#00000000","#ffffff20","#ffffff40","#ffffff60","#ffffff80"
  ];

  // DOM refs
  const btnEls = {};
  document.querySelectorAll('.btn').forEach(el => {
    btnEls[el.dataset.btn] = el;
    // smooth visual feedback for analog changes (triggers / press scale)
    try { el.style.transition = 'filter 60ms linear, transform 60ms linear'; } catch (e) {}
  });
  const base = document.getElementById('base');
  const stickWrapper = document.getElementById('stickWrapper');
  const joystick = document.getElementById('joystickHead');
  const eightWayWrapper = document.getElementById('eightWayWrapper');
  const canvas = document.getElementById('stickCanvas');
  const ctx = canvas.getContext('2d');
  let colorPanel = document.getElementById('colorPanel');
  const toastEl = document.getElementById('toast');
  const markers = Array.from({ length: 8 }, (_, i) => document.getElementById('marker' + i));

  let arrowSize = 90;

  // stick container refs (parents of .btn for LS/RS)
  const stickContainers = { LS: document.getElementById('LS'), RS: document.getElementById('RS') };

  // distance readouts removed (no on-screen numeric distance)

  // (analog control panel removed) - preferences remain in appState.analog and will be exported/imported

  // App state
  let appState = {
    buttons: {}, joystick: {}, joystickHead: {}, base: {}, eightWayWrapper: { arrowSize: 90 }, hiddenButtons: [], trailColor: getComputedStyle(document.documentElement).getPropertyValue('--trail-color') || '#CEEC73', profiles: {}
  };
  // Add analog configuration to appState (persisted)
  // pressureEnabled: whether LT/RT respond to analog pressure
  // minTriggerBrightness/maxTriggerBrightness: mapping from 0..1 trigger value to brightness
    appState.analog = { LS: true, RS: true, analogVisualRange: 8, pressureEnabled: true, minTriggerBrightness: 1.0, maxTriggerBrightness: 3.0, triggerDeadzone: 0.1 };
  let selected = null;
  let lastPressedTimes = {};
  let trail = [];
  let activeGamepadIndex = null;
  let panelAnchorTarget = null;
  let currentPreviewTarget = null;

  // capture default joystick head style
  const defaultHead = window.getComputedStyle(joystick);
  appState.joystickHead = {
    backgroundColor: defaultHead.backgroundColor,
    backgroundImage: defaultHead.backgroundImage,
    color: defaultHead.color,
    borderRadius: defaultHead.borderRadius,
    boxShadow: defaultHead.boxShadow,
    outline: defaultHead.outline,
    outlineOffset: defaultHead.outlineOffset,
    fontSize: defaultHead.fontSize
  };

  // --- Helpers (centralized to reduce repetition) ---

  function showToast(msg, dur = 1000) {
    toastEl.textContent = msg;
    toastEl.style.transform = 'translate(-50%,0) scale(1)';
    clearTimeout(toastEl._t);
    toastEl._t = setTimeout(() => toastEl.style.transform = 'translate(-50%,0) scale(0)', dur);
  }

  function saveStateData() {
    try { localStorage.setItem(STORAGE_KEY, JSON.stringify(appState)); console.debug('Saving state'); } catch (e) { console.warn(e); }
  }

  function applyPropertiesToElement(el, data) {
    if (!el || !data) return;
    if (data.display !== undefined) el.style.display = data.display;
    if (data.zIndex !== undefined) el.style.zIndex = data.zIndex;
    ['top','left','width','height','borderRadius','outline','outlineOffset','boxShadow','backgroundColor','backgroundImage','backgroundSize','color','fontSize'].forEach(k => {
      if (data[k] !== undefined) el.style[k] = data[k];
    });
    if (data.label !== undefined && el.dataset && el.dataset.btn) el.textContent = data.label;
  }

  // apply data to element and merge into store (store may be appState.*)
  function applyAndStore(el, store, data) {
    if (!data) return;
    Object.assign(store, data);
    applyPropertiesToElement(el, data);
    if (data.display !== undefined) el.style.display = data.display;
  }

  function captureElementProperties(el) {
    const cs = window.getComputedStyle(el);
    const snap = {
      display: cs.display, zIndex: cs.zIndex, top: cs.top, left: cs.left, width: cs.width, height: cs.height,
      borderRadius: cs.borderRadius, outline: cs.outline, outlineOffset: cs.outlineOffset, boxShadow: cs.boxShadow,
      backgroundColor: cs.backgroundColor, backgroundImage: cs.backgroundImage, backgroundSize: cs.backgroundSize,
      color: cs.color, fontSize: cs.fontSize, label: (el.textContent || '').trim()
    };
    if (el.dataset && el.dataset.btn) {
      const key = el.dataset.btn;
      if (appState.buttons?.[key]?.label !== undefined) snap.label = appState.buttons[key].label;
      else snap.label = (el.textContent || '').trim();
    }
    if (snap.backgroundSize && snap.backgroundSize !== 'auto') {
      const num = parseInt(snap.backgroundSize);
      if (!isNaN(num)) snap.backgroundSize = num + 'px auto';
    }
    if (el === eightWayWrapper && appState.eightWayWrapper?.arrowSize !== undefined) snap.arrowSize = appState.eightWayWrapper.arrowSize || 90;
    return snap;
  }

  // unified applyJoystickHead
  function applyJoystickHeadFromState() {
    const head = appState.joystickHead || {};
    applyPropertiesToElement(joystick, head);
    ['backgroundColor','color','boxShadow','outline','borderRadius','fontSize'].forEach(k => {
      if (head[k] !== undefined) joystick.style[k] = head[k];
    });
  }

  // export/import layout helpers
  function exportLayout() {
    const snap = {
      base: captureElementProperties(base),
      joystick: captureElementProperties(stickWrapper),
      joystickHead: captureElementProperties(joystick),
      eightWayWrapper: captureElementProperties(eightWayWrapper),
      buttons: {},
      trailColor: appState.trailColor || getComputedStyle(document.documentElement).getPropertyValue('--trail-color') || '#CEEC73'
    };
    // Add arrowImageOn/Off if present
    if (appState.eightWayWrapper?.arrowImageOn) snap.eightWayWrapper.arrowImageOn = appState.eightWayWrapper.arrowImageOn;
    if (appState.eightWayWrapper?.arrowImageOff) snap.eightWayWrapper.arrowImageOff = appState.eightWayWrapper.arrowImageOff;
    Object.keys(btnEls).forEach(k => snap.buttons[k] = captureElementProperties(btnEls[k]));
  // include analog prefs (LS/RS enabled, analogVisualRange) so layouts can control analog behavior
  if (appState.analog) {
    // copy only canonical fields and prune legacy keys if present
    const a = Object.assign({}, appState.analog);
    delete a.visualRange; delete a.minBrightness; delete a.maxBrightness; delete a.deadzone; delete a.showDistance;
    snap.analog = a;
  }
    return snap;
  }

  function importLayout(parsed) {
    if (!parsed) return;
    applyAndStore(base, appState.base = appState.base || {}, parsed.base);
    applyAndStore(stickWrapper, appState.joystick = appState.joystick || {}, parsed.joystick);
    if (parsed.joystickHead) applyAndStore(joystick, appState.joystickHead = appState.joystickHead || {}, parsed.joystickHead);
    applyAndStore(eightWayWrapper, appState.eightWayWrapper = appState.eightWayWrapper || {}, parsed.eightWayWrapper);

    if (parsed.buttons) {
      appState.buttons = {};
      Object.entries(parsed.buttons).forEach(([k, data]) => {
        appState.buttons[k] = {};
        if (btnEls[k]) applyAndStore(btnEls[k], appState.buttons[k], data);
      });
    }
    if (parsed.eightWayWrapper?.arrowSize !== undefined) {
      arrowSize = parseInt(parsed.eightWayWrapper.arrowSize) || arrowSize;
      resizeEightWayArrows();
    }
    // Set arrowImageOn/Off if present
    if (parsed.eightWayWrapper?.arrowImageOn) {
      appState.eightWayWrapper.arrowImageOn = parsed.eightWayWrapper.arrowImageOn;
    }
    if (parsed.eightWayWrapper?.arrowImageOff) {
      appState.eightWayWrapper.arrowImageOff = parsed.eightWayWrapper.arrowImageOff;
    }
    // Apply to all arrows
    for (let i = 0; i < 8; i++) {
      const arrow = document.getElementById('arrow' + i);
      if (!arrow) continue;
      if (appState.eightWayWrapper.arrowImageOff) {
        arrow.style.backgroundImage = `url('${appState.eightWayWrapper.arrowImageOff}')`;
      }
    }
    if (parsed.trailColor) {
      appState.trailColor = parsed.trailColor;
      document.documentElement.style.setProperty('--trail-color', parsed.trailColor);
    }
    // import analog prefs if provided
    if (parsed.analog) {
      // clone and migrate legacy names into canonical names if needed
      const safeAnalog = Object.assign({}, parsed.analog);
      if (safeAnalog.showDistance !== undefined) delete safeAnalog.showDistance;
      // migrate legacy names
      if (safeAnalog.visualRange !== undefined && safeAnalog.analogVisualRange === undefined) safeAnalog.analogVisualRange = safeAnalog.visualRange;
      if (safeAnalog.deadzone !== undefined && safeAnalog.triggerDeadzone === undefined) safeAnalog.triggerDeadzone = safeAnalog.deadzone;
      if (safeAnalog.minBrightness !== undefined && safeAnalog.minTriggerBrightness === undefined) safeAnalog.minTriggerBrightness = safeAnalog.minBrightness;
      if (safeAnalog.maxBrightness !== undefined && safeAnalog.maxTriggerBrightness === undefined) safeAnalog.maxTriggerBrightness = safeAnalog.maxBrightness;
      // remove legacy names so appState.analog stays canonical
      delete safeAnalog.visualRange; delete safeAnalog.minBrightness; delete safeAnalog.maxBrightness; delete safeAnalog.deadzone;
      appState.analog = Object.assign({}, appState.analog || {}, safeAnalog);
      // ensure analogVisualRange fallback
      if (appState.analog.analogVisualRange === undefined) appState.analog.analogVisualRange = 8;
      // ensure triggerDeadzone fallback
      if (appState.analog.triggerDeadzone === undefined) appState.analog.triggerDeadzone = 0.1;
    }
    if (parsed.joystickHead) applyJoystickHeadFromState();
    saveStateData();
  }

  // --- UI helpers ---
  function revertPreview() {
    if (!currentPreviewTarget) return;
    if (currentPreviewTarget.dataset._prevBg !== undefined) { currentPreviewTarget.style.backgroundColor = currentPreviewTarget.dataset._prevBg || ''; delete currentPreviewTarget.dataset._prevBg; }
    if (currentPreviewTarget.dataset._prevColor !== undefined) { currentPreviewTarget.style.color = currentPreviewTarget.dataset._prevColor || ''; delete currentPreviewTarget.dataset._prevColor; }
    if (currentPreviewTarget.dataset._prevBgImage !== undefined) { currentPreviewTarget.style.backgroundImage = currentPreviewTarget.dataset._prevBgImage || ''; delete currentPreviewTarget.dataset._prevBgImage; }
    if (currentPreviewTarget.dataset._prevBgSize !== undefined) { currentPreviewTarget.style.backgroundSize = currentPreviewTarget.dataset._prevBgSize || ''; delete currentPreviewTarget.dataset._prevBgSize; }
    currentPreviewTarget = null;
  }

  function selectElement(el) {
    revertPreview();
    if (!el) {
      if (selected) { selected.classList.remove('selected'); selected.classList.remove('selectedOutline'); }
      selected = null; return;
    }
    if (selected && selected !== el) { selected.classList.remove('selected'); selected.classList.remove('selectedOutline'); }
    selected = el; selected.classList.add('selected'); selected.classList.add('selectedOutline'); updatePanelForSelection();
    if (colorPanel.style.display === 'block' || colorPanel.style.display === 'flex') panelAnchorTarget = selected;
    // sync persistent size slider to selected element's backgroundSize (percent if set)
    try {
      const slider = colorPanel.querySelector('.symbolSizeSlider'); const valEl = colorPanel.querySelector('.symbolSizeValue');
      if (slider) {
        const cs = window.getComputedStyle(selected);
        let bgSize = cs.backgroundSize || selected.style.backgroundSize || '';
        // try to extract percent value
        const m = (selected.style.backgroundSize || bgSize).match(/(\d+)%/);
        if (m) { slider.value = parseInt(m[1]); if (valEl) valEl.textContent = slider.value + ''; }
        else { slider.value = 100; if (valEl) valEl.textContent = slider.value + ''; }
      }
    } catch (e) { }
  }

  function deselect() { selectElement(null); }

  // arrow highlight helper
  function updateArrowHighlights(idx) {
    for (let i = 0; i < 8; i++) {
      const arrow = document.getElementById('arrow' + i);
      if (!arrow) continue;
      const isActive = i === idx;
      arrow.classList.toggle('active', isActive);
      // Set background image based on state
      if (appState.eightWayWrapper?.arrowImageOn && appState.eightWayWrapper?.arrowImageOff) {
        arrow.style.backgroundImage = isActive
          ? `url('${appState.eightWayWrapper.arrowImageOn}')`
          : `url('${appState.eightWayWrapper.arrowImageOff}')`;
      }
    }
  }

  // --- initial DOM wiring: clicks, dblclicks, contextmenu ---
  document.addEventListener('mousedown', (e) => {
    if (colorPanel.contains(e.target)) return;
    const topEl = document.elementFromPoint(e.clientX, e.clientY);
    const isOnUI = !!topEl?.closest?.('.btn') || !!topEl?.closest?.('#stickWrapper') || !!topEl?.closest?.('#eightWayWrapper') || !!topEl?.closest?.('#base');
    if (isOnUI) return;
    const br = base.getBoundingClientRect();
    if (e.clientX >= br.left && e.clientX <= br.right && e.clientY >= br.top && e.clientY <= br.bottom) { selectElement(base); return; }
    deselect();
    if (!colorPanel.contains(e.target)) { colorPanel.style.display = 'none'; revertPreview(); }
  });

  [base, stickWrapper, eightWayWrapper, joystick].forEach(el => el.addEventListener('mousedown', e => { selectElement(el); e.stopPropagation(); }));

  Object.values(btnEls).forEach(btn => {
    btn.addEventListener('click', e => { selectElement(btn); lastPressedTimes[btn.dataset.btn] = performance.now(); showToast(btn.dataset.btn, 1000); e.stopPropagation(); if (colorPanel.style.display === 'block' || colorPanel.style.display === 'flex') panelAnchorTarget = btn; });
    btn.addEventListener('contextmenu', e => { e.preventDefault(); selectElement(btn); openColorPanel(btn, e.pageX, e.pageY).catch(err => console.error('openColorPanel error', err)); });

    btn.addEventListener('dblclick', e => {
      if (btn.querySelector('input')) return;
      const old = btn.textContent.trim(); btn.textContent = '';
      const input = document.createElement('input'); input.className = 'btn-edit'; input.value = old; btn.appendChild(input); input.focus(); input.select();
      function save() {
        const newLabel = input.value.trim(); if (btn.contains(input)) btn.removeChild(input); btn.textContent = newLabel;
        appState.buttons[btn.dataset.btn] = appState.buttons[btn.dataset.btn] || {}; appState.buttons[btn.dataset.btn].label = newLabel; saveStateData();
      }
      input.addEventListener('blur', save);
      input.addEventListener('keydown', ev => { if (ev.key === 'Enter') save(); if (ev.key === 'Escape') { if (btn.contains(input)) btn.removeChild(input); btn.textContent = old; } });
      e.stopPropagation();
    });
  });

  // --- color panel ---
  let colorMode = localStorage.getItem('colorMode') || 'bg';

  async function openColorPanel(anchorTarget, x, y) {
    try {
      // defensive: ensure colorPanel exists and is attached
      colorPanel = document.getElementById('colorPanel') || colorPanel;
      if (!colorPanel) {
        colorPanel = document.createElement('div'); colorPanel.id = 'colorPanel'; document.body.appendChild(colorPanel);
      } else if (!document.body.contains(colorPanel)) {
        document.body.appendChild(colorPanel);
      }
      panelAnchorTarget = anchorTarget; revertPreview(); colorPanel.innerHTML = '';

    // mode toggle row
  const toggle = document.createElement('div'); toggle.className = 'modeToggle'; toggle.style.display = 'flex'; toggle.style.alignItems = 'center'; toggle.style.justifyContent = 'space-between'; toggle.style.gap = '5px';
  const leftGroup = document.createElement('div'); leftGroup.style.display = 'flex'; leftGroup.style.gap = '8px';
  // right group for sliders / symbol size controls
  const rightGroup = document.createElement('div'); rightGroup.style.display = 'flex'; rightGroup.style.alignItems = 'center'; rightGroup.style.gap = '8px';
  // declare symbolBtn early to avoid TDZ when handlers reference it
  let symbolBtn = null;
    const bgDiv = document.createElement('div'); bgDiv.className = 'modeBtn bgBtn'; bgDiv.textContent = 'FILL';
    const txtDiv = document.createElement('div'); txtDiv.className = 'modeBtn txtBtn'; txtDiv.textContent = 'TEXT';
    const outlineDiv = document.createElement('div'); outlineDiv.className = 'modeBtn outlineBtn'; outlineDiv.textContent = 'STROKE';
  leftGroup.appendChild(bgDiv); leftGroup.appendChild(txtDiv); leftGroup.appendChild(outlineDiv); toggle.appendChild(leftGroup);

  const sliderWrapper = document.createElement('div'); sliderWrapper.style.display = 'none'; sliderWrapper.style.alignItems = 'center'; sliderWrapper.style.gap = '5px';
    const innerLabel = document.createElement('span'); innerLabel.textContent = 'In';
    const innerSlider = document.createElement('input'); innerSlider.type = 'range'; innerSlider.min = 0; innerSlider.max = 10; innerSlider.step = 1; innerSlider.style.width = '60px';
    const innerValue = document.createElement('span');
    const outerLabel = document.createElement('span'); outerLabel.textContent = 'Out';
    const outerSlider = document.createElement('input'); outerSlider.type = 'range'; outerSlider.min = 0; outerSlider.max = 10; outerSlider.step = 1; outerSlider.style.width = '60px';
    const outerValue = document.createElement('span');
  sliderWrapper.appendChild(innerLabel); sliderWrapper.appendChild(innerSlider); sliderWrapper.appendChild(innerValue); sliderWrapper.appendChild(outerLabel); sliderWrapper.appendChild(outerSlider); sliderWrapper.appendChild(outerValue);
  // create persistent size control in rightGroup (hidden by default; shown only in symbol mode)
  const sizeCtrl = document.createElement('div'); sizeCtrl.className = 'symbolSizeControl'; sizeCtrl.style.display = 'none'; sizeCtrl.style.alignItems = 'left'; sizeCtrl.style.gap = '5px'; sizeCtrl.style.padding = '0px 0px';
    const sizeLabel = document.createElement('span'); sizeLabel.textContent = 'Size'; sizeLabel.style.fontSize = '16px';
  const sizeSlider = document.createElement('input'); sizeSlider.type = 'range'; sizeSlider.min = 0; sizeSlider.max = 200; sizeSlider.step = 10; sizeSlider.value = 100; sizeSlider.style.width = '100px'; sizeSlider.className = 'symbolSizeSlider';
    const sizeValue = document.createElement('span'); sizeValue.textContent = sizeSlider.value + ''; sizeValue.style.minWidth = '30px'; sizeValue.className = 'symbolSizeValue'; sizeValue.style.fontSize = '16px';
    sizeCtrl.appendChild(sizeLabel); sizeCtrl.appendChild(sizeSlider); sizeCtrl.appendChild(sizeValue);
    const clearBtn = document.createElement('button'); clearBtn.type = 'button'; clearBtn.className = 'clearSymbolBtn'; clearBtn.textContent = 'Clear'; clearBtn.style.marginLeft = '0px'; clearBtn.style.padding = '5px 5px'; clearBtn.style.fontSize = '16px';
    sizeCtrl.appendChild(clearBtn);

    // persistent slider listener (applies size % to current selection)
    sizeSlider.addEventListener('input', () => {
      sizeValue.textContent = sizeSlider.value + '';
      const applyTarget = selected || panelAnchorTarget; if (!applyTarget) return; const btnId = applyTarget.dataset?.btn;
      applyTarget.style.backgroundSize = `${sizeSlider.value}% auto`;
      if (btnId) { appState.buttons[btnId] = appState.buttons[btnId] || {}; appState.buttons[btnId].backgroundSize = applyTarget.style.backgroundSize; saveStateData(); }
    });

    clearBtn.addEventListener('click', () => {
      const applyTarget = selected || panelAnchorTarget; if (!applyTarget) return; const btnId = applyTarget.dataset?.btn;
      applyTarget.style.backgroundImage = '';
      applyTarget.style.backgroundSize = '';
      if (btnId && appState.buttons[btnId]) {
        // restore previous text color if available
        if (appState.buttons[btnId].prevColor !== undefined) {
          applyTarget.style.color = appState.buttons[btnId].prevColor || '';
          delete appState.buttons[btnId].prevColor;
        } else {
          if (appState.buttons[btnId].color === 'transparent') delete appState.buttons[btnId].color;
        }
        delete appState.buttons[btnId].backgroundImage;
        delete appState.buttons[btnId].backgroundSize;
      } else {
        applyTarget.style.color = '';
      }
      const grid = colorPanel.querySelector('.symbolGrid'); if (grid) grid.querySelectorAll('.symbolCell').forEach(c => c.classList.remove('selected'));
      saveStateData();
    });

  // put the slider wrapper into the rightGroup so outline sliders live there
  rightGroup.appendChild(sliderWrapper);
  // Pressure sensitivity controls removed from the UI by user request.
  // Pressure settings remain in appState.analog and are still exported/imported, but are not exposed in the panel.
  // add persistent sizeCtrl to rightGroup (visible in all modes)
  rightGroup.appendChild(sizeCtrl);
  toggle.appendChild(leftGroup); toggle.appendChild(rightGroup);
  colorPanel.appendChild(toggle);

  let mode = colorMode; if (mode === 'bg') bgDiv.classList.add('active'); if (mode === 'text') txtDiv.classList.add('active');
  if (mode === 'outline') { outlineDiv.classList.add('active'); sliderWrapper.style.display = 'flex'; updatePanelForSelection(); }

  bgDiv.addEventListener('click', () => {
    mode = 'bg'; colorMode = 'bg'; localStorage.setItem('colorMode', colorMode); bgDiv.classList.add('active'); txtDiv.classList.remove('active'); outlineDiv.classList.remove('active');
    // restore UI and remove symbol grid only
    sliderWrapper.style.display = 'none'; if (typeof symbolBtn !== 'undefined') symbolBtn.classList.remove('active'); if (typeof swatchContainer !== 'undefined') swatchContainer.style.display = '';
    // hide symbol size control when not in symbol mode
    try { sizeCtrl.style.display = 'none'; } catch (e) {}
    const grid = colorPanel.querySelector('.symbolGrid'); if (grid) grid.remove();
  });
  txtDiv.addEventListener('click', () => {
    mode = 'text'; colorMode = 'text'; localStorage.setItem('colorMode', colorMode); txtDiv.classList.add('active'); bgDiv.classList.remove('active'); outlineDiv.classList.remove('active');
    sliderWrapper.style.display = 'none'; if (typeof symbolBtn !== 'undefined') symbolBtn.classList.remove('active'); if (typeof swatchContainer !== 'undefined') swatchContainer.style.display = '';
    // hide symbol size control when not in symbol mode
    try { sizeCtrl.style.display = 'none'; } catch (e) {}
    const grid = colorPanel.querySelector('.symbolGrid'); if (grid) grid.remove();
  });
  outlineDiv.addEventListener('click', () => {
    mode = 'outline'; colorMode = 'outline'; localStorage.setItem('colorMode', colorMode); outlineDiv.classList.add('active'); bgDiv.classList.remove('active'); txtDiv.classList.remove('active');
    sliderWrapper.style.display = 'flex'; updatePanelForSelection(); if (typeof symbolBtn !== 'undefined') symbolBtn.classList.remove('active'); if (typeof swatchContainer !== 'undefined') swatchContainer.style.display = '';
    // hide symbol size control when not in symbol mode
    try { sizeCtrl.style.display = 'none'; } catch (e) {}
    const grid = colorPanel.querySelector('.symbolGrid'); if (grid) grid.remove();
  });

    innerSlider.addEventListener('input', () => {
      const applyTarget = selected || panelAnchorTarget; if (!applyTarget) return; const btnId = applyTarget.dataset?.btn;
      const width = Math.max(0, Math.min(15, parseInt(innerSlider.value))); innerSlider.nextElementSibling.textContent = width;
      let color = 'black'; if (btnId && appState.buttons[btnId]?.outlineColor) color = appState.buttons[btnId].outlineColor; else { const cs = window.getComputedStyle(applyTarget); color = cs.outlineColor && cs.outlineColor !== 'invert' ? cs.outlineColor : 'black'; }
      applyTarget.style.outline = `${width}px solid ${color}`; applyTarget.style.outlineOffset = `-${width}px`;
      if (btnId) { appState.buttons[btnId] = appState.buttons[btnId] || {}; appState.buttons[btnId].outlineWidth = width; appState.buttons[btnId].outlineColor = color; }
      saveStateData();
    });

    outerSlider.addEventListener('input', () => {
      const applyTarget = selected || panelAnchorTarget; if (!applyTarget) return; const btnId = applyTarget.dataset?.btn;
      const spread = Math.max(0, Math.min(15, parseInt(outerSlider.value))); outerSlider.nextElementSibling.textContent = spread; applyTarget.style.boxShadow = `0 0 0 ${spread}px black`;
      if (btnId) { appState.buttons[btnId] = appState.buttons[btnId] || {}; appState.buttons[btnId].boxShadowSpread = spread; }
      saveStateData();
    });

    const swatchContainer = document.createElement('div'); swatchContainer.className = 'swatchContainer';
    palette.forEach(c => {
      const s = document.createElement('div'); s.className = 'swatch'; s.dataset.color = c; s.title = c; s.style.background = c;
      s.addEventListener('click', () => {
        const applyTarget = selected || panelAnchorTarget; if (!applyTarget) return; const btnId = applyTarget.dataset?.btn;
        if (mode === 'bg') { applyTarget.style.backgroundColor = c; if (btnId) { appState.buttons[btnId] = appState.buttons[btnId] || {}; appState.buttons[btnId].backgroundColor = c; } }
        else if (mode === 'text') { applyTarget.style.color = c; if (btnId) { appState.buttons[btnId] = appState.buttons[btnId] || {}; appState.buttons[btnId].color = c; } else if (applyTarget === base) { appState.base.color = c; } }
        else if (mode === 'outline') {
          const width = parseInt(innerSlider.value) || 0; const spread = parseInt(outerSlider.value) || 0; applyTarget.style.outline = `${width}px solid ${c}`; applyTarget.style.outlineOffset = `-${width}px`; applyTarget.style.boxShadow = `0 0 0 ${spread}px black`;
          if (btnId) { appState.buttons[btnId] = appState.buttons[btnId] || {}; appState.buttons[btnId].outlineWidth = width; appState.buttons[btnId].outlineColor = c; appState.buttons[btnId].boxShadowSpread = spread; }
        }
        saveStateData();
      });
      swatchContainer.appendChild(s);
    });

    colorPanel.appendChild(swatchContainer);

  // --- Symbol selector ---
  // assign to previously-declared symbolBtn (avoid redeclaring block-scoped variable)
  symbolBtn = document.createElement('div'); symbolBtn.className = 'modeBtn symbolBtn'; symbolBtn.textContent = 'SYMBOL';
  leftGroup.appendChild(symbolBtn);

    let symbolsData = null;
    async function loadSymbols() {
      if (symbolsData) return symbolsData;
      try {
        const res = await fetch('symbols.json'); if (!res.ok) throw new Error('not found'); const parsed = await res.json();
        // Support both new structure (buttons/directions) and old `images` array for backward compatibility
        if (!parsed.buttons && parsed.images) {
          parsed.buttons = parsed.images; parsed.directions = parsed.images.filter(s => /up|down|left|right/i.test(s));
        }
        // Ensure arrays exist
        parsed.buttons = Array.isArray(parsed.buttons) ? parsed.buttons : [];
        parsed.directions = Array.isArray(parsed.directions) ? parsed.directions : [];
        symbolsData = parsed; return symbolsData;
      } catch (e) { console.warn('Could not load symbols.json', e); symbolsData = { buttons: [], directions: [], symbolSize: 40, symbolGap: 5 }; return symbolsData; }
    }

    async function showSymbolGrid() {
      // clear any existing symbol area
      const existing = colorPanel.querySelector('.symbolGrid'); if (existing) existing.remove();
      // keep persistent symbolSizeControl in the rightGroup; do not remove it here
      const data = await loadSymbols();
      const grid = document.createElement('div'); grid.className = 'symbolGrid';
      document.documentElement.style.setProperty('--symbol-size', (data.symbolSize || 48) + 'px');
      document.documentElement.style.setProperty('--symbol-gap', (data.symbolGap || 8) + 'px');
      // Decide which images to show based on currently selected button (directions for dpad, buttons otherwise)
      const applyTarget = selected || panelAnchorTarget;
      const btnId = applyTarget?.dataset?.btn;
      // Define direction keys (case-insensitive)
      const directionKeys = ['Up','Down','Left','Right','up','down','left','right'];
      let images = [];
      if (btnId && directionKeys.includes(btnId)) {
        images = data.directions && data.directions.length ? data.directions : data.buttons || [];
      } else {
        images = data.buttons && data.buttons.length ? data.buttons : data.directions || [];
      }
      images = images || [];

      // use persistent sizeSlider/clearBtn created above

      // Build cells
      images.forEach(src => {
        const cell = document.createElement('div'); cell.className = 'symbolCell'; cell.title = src; cell.style.backgroundImage = `url('${src}')`;
        // preview on mouseenter
        cell.addEventListener('mouseenter', () => {
          const applyTarget = selected || panelAnchorTarget; if (!applyTarget) return;
          // save previous values
          if (currentPreviewTarget && currentPreviewTarget !== applyTarget) revertPreview();
          if (applyTarget.dataset._prevBgImage === undefined) applyTarget.dataset._prevBgImage = applyTarget.style.backgroundImage || '';
          if (applyTarget.dataset._prevBgSize === undefined) applyTarget.dataset._prevBgSize = applyTarget.style.backgroundSize || '';
          applyTarget.style.backgroundImage = `url('${src}')`;
          // use percent slider value for preview if present
          const persistentSlider = colorPanel.querySelector('.symbolSizeSlider'); const pct = persistentSlider ? parseInt(persistentSlider.value) || 100 : 100; applyTarget.style.backgroundSize = `${pct}% auto`;
          currentPreviewTarget = applyTarget;
        });

        // on mouseleave, only revert if the preview target still exists AND it wasn't applied
        cell.addEventListener('mouseleave', () => {
          // if the preview target was applied (we cleared preview marker), don't revert
          if (!currentPreviewTarget) return; // already handled by click
          revertPreview();
        });

        // apply on click
        cell.addEventListener('click', () => {
          const applyTarget = selected || panelAnchorTarget; if (!applyTarget) return;
          const btnId = applyTarget.dataset?.btn;
          // set background image and size based on slider
          const persistentSlider = colorPanel.querySelector('.symbolSizeSlider'); const pct = persistentSlider ? parseInt(persistentSlider.value) || 100 : 100;
          applyTarget.style.backgroundImage = `url('${src}')`;
          applyTarget.style.backgroundSize = `${pct}% auto`;
          if (btnId) {
            appState.buttons[btnId] = appState.buttons[btnId] || {};
            appState.buttons[btnId].backgroundImage = applyTarget.style.backgroundImage;
            appState.buttons[btnId].backgroundSize = applyTarget.style.backgroundSize;
          }
          // save previous text color (persist) and set text color to transparent when applying a symbol
          if (btnId) {
            appState.buttons[btnId] = appState.buttons[btnId] || {};
            if (appState.buttons[btnId].prevColor === undefined) {
              // capture computed color as previous color
              const prev = window.getComputedStyle(applyTarget).color || '';
              appState.buttons[btnId].prevColor = prev;
            }
            appState.buttons[btnId].color = 'transparent';
          }
          applyTarget.style.color = 'transparent';
          // mark selected visually in grid
          grid.querySelectorAll('.symbolCell').forEach(c => c.classList.remove('selected'));
          cell.classList.add('selected');
          // Clear preview state so mouseleave won't revert
          if (applyTarget.dataset._prevBgImage !== undefined) delete applyTarget.dataset._prevBgImage;
          if (applyTarget.dataset._prevBgSize !== undefined) delete applyTarget.dataset._prevBgSize;
          // remove currentPreviewTarget to avoid revert
          currentPreviewTarget = null;
          saveStateData();
        });

        grid.appendChild(cell);
      });

  // grid appended below (sizeCtrl already in rightGroup at top)
  colorPanel.appendChild(grid);
    }

    symbolBtn.addEventListener('click', async () => {
      // activate symbol mode UI and hide swatches + sliders
      mode = 'symbol'; colorMode = 'symbol'; localStorage.setItem('colorMode', colorMode); bgDiv.classList.remove('active'); txtDiv.classList.remove('active'); outlineDiv.classList.remove('active'); symbolBtn.classList.add('active'); swatchContainer.style.display = 'none';
      // hide the In/Out slider wrapper when symbol panel is active
      if (typeof sliderWrapper !== 'undefined') sliderWrapper.style.display = 'none';
      // show symbol size control when in symbol mode
      try { sizeCtrl.style.display = 'flex'; } catch (e) {}
      await showSymbolGrid();
    });

  // clamp
  colorPanel.style.display = 'block'; colorPanel.style.left = '0px'; colorPanel.style.top = '0px';
    const panelRect = colorPanel.getBoundingClientRect(); const viewportWidth = window.innerWidth; const viewportHeight = window.innerHeight;
    let left = x; let top = y + 40;
    if (left + panelRect.width > viewportWidth) left = Math.max(8, viewportWidth - panelRect.width - 10);
    if (top + panelRect.height > viewportHeight) top = Math.max(8, viewportHeight - panelRect.height - 10);
    colorPanel.style.left = left + 'px'; colorPanel.style.top = top + 'px';
    // sync size slider to target
    try {
      const slider = colorPanel.querySelector('.symbolSizeSlider'); const valEl = colorPanel.querySelector('.symbolSizeValue');
      const applyTarget = selected || panelAnchorTarget; if (slider && applyTarget) {
        const cs = window.getComputedStyle(applyTarget); let bgSize = cs.backgroundSize || applyTarget.style.backgroundSize || '';
        const m = (applyTarget.style.backgroundSize || bgSize).match(/(\d+)/);
        if (m) { slider.value = parseInt(m[1]); if (valEl) valEl.textContent = slider.value + ''; }
        else { slider.value = 100; if (valEl) valEl.textContent = slider.value + ''; }
      }
    } catch (e) { }
    // if the remembered mode is symbol, open the symbol grid automatically
    try {
      if (colorMode === 'symbol') {
        if (typeof sliderWrapper !== 'undefined') sliderWrapper.style.display = 'none';
        if (typeof swatchContainer !== 'undefined') swatchContainer.style.display = 'none';
        // mark symbol button active and show size control when auto-opening symbol grid
        try { if (symbolBtn) symbolBtn.classList.add('active'); } catch (e) {}
        try { sizeCtrl.style.display = 'flex'; } catch (e) {}
        await showSymbolGrid();
      }
    } catch (e) { console.warn('Could not auto-open symbol grid', e); }
    } catch (err) {
      console.error('openColorPanel failed', err);
      try { colorPanel.style.display = 'none'; } catch (_) {}
    }
  }

  function updatePanelForSelection() {
    if (!colorPanel || colorMode !== 'outline') return; const sliders = colorPanel.querySelectorAll('input[type="range"]'); if (sliders.length < 2) return;
    const innerSlider = sliders[0], innerValue = innerSlider.nextElementSibling, outerSlider = sliders[1], outerValue = outerSlider.nextElementSibling;
    const applyTarget = selected || panelAnchorTarget; if (!applyTarget) return; const btnId = applyTarget.dataset?.btn; const cs = window.getComputedStyle(applyTarget);
    let outlineWidth = 0, outlineColor = 'black';
    if (btnId && appState.buttons[btnId]?.outlineWidth != null) { outlineWidth = appState.buttons[btnId].outlineWidth; outlineColor = appState.buttons[btnId].outlineColor ?? 'black'; }
    else { outlineWidth = parseInt(cs.outlineWidth) || 0; outlineColor = cs.outlineColor && cs.outlineColor !== 'invert' ? cs.outlineColor : 'black'; }
    outlineWidth = Math.max(0, Math.min(10, outlineWidth));
    let spread = 0;
    if (btnId && appState.buttons[btnId]?.boxShadowSpread != null) spread = appState.buttons[btnId].boxShadowSpread;
    else { const boxShadow = cs.boxShadow; if (boxShadow && boxShadow !== 'none') { const parts = boxShadow.match(/-?\d+px/g); if (parts && parts.length >= 4) spread = parseInt(parts[3]) || 0; } }
    spread = Math.max(0, Math.min(10, spread));
    innerSlider.value = outlineWidth; if (innerValue) innerValue.textContent = outlineWidth; outerSlider.value = spread; if (outerValue) outerValue.textContent = spread;
  }

  // --- Keyboard/hotkeys ---
  document.addEventListener('keydown', (e) => {
    // Snap to Grid
    if (e.ctrlKey && e.key.toLowerCase() === 't') { snapLayoutToGrid(10); saveStateData(); }

    // Reset
    if (e.ctrlKey && e.key.toLowerCase() === 'r') { e.preventDefault(); resetToDefault(); saveStateData(); }

    // Unhide all
    if (e.key === 'Home') {
      Object.values(btnEls).forEach(b => { b.style.display = 'flex'; appState.buttons[b.dataset.btn] = appState.buttons[b.dataset.btn] || {}; appState.buttons[b.dataset.btn].display = 'flex'; });
      eightWayWrapper.style.display = 'block'; appState.joystick.display = 'block'; appState.base.display = 'block'; stickWrapper.style.display = 'block'; base.style.display = 'block'; appState.hiddenButtons = []; saveStateData(); showToast('Show All Widgets', 1000); return;
    }

    // Profiles via F1..Fn
    if (e.key.startsWith('F')) {
      const n = parseInt(e.key.slice(1)); if (n >= 1 && n <= PROFILE_COUNT) { if (e.ctrlKey) { saveProfile(n); showToast('Profile ' + n + ' saved', 1000); } else { loadProfile(n); } }
    }

    if (e.ctrlKey && e.key.toLowerCase() === 'o') { e.preventDefault(); importInput.click(); return; }
    if (e.ctrlKey && e.key.toLowerCase() === 'c') { e.preventDefault(); copyLayoutToClipboard(); return; }

    // font size adjustments when ctrl+[ or ]
    if (e.ctrlKey && (e.key === '[' || e.key === ']')) {
      if (selected) {
        if (selected === eightWayWrapper) {
          arrowSize += (e.key === ']') ? 5 : -5; arrowSize = Math.max(20, arrowSize); resizeEightWayArrows(); appState.eightWayWrapper = appState.eightWayWrapper || {}; appState.eightWayWrapper.arrowSize = arrowSize; saveStateData(); showToast('Arrow size: ' + arrowSize + 'px', 1000);
        } else if (selected.classList && selected.classList.contains('btn')) {
          const cs = window.getComputedStyle(selected); let fs = parseInt(cs.fontSize) || 30; fs += (e.key === ']') ? 1 : -1; fs = Math.max(6, fs); selected.style.fontSize = fs + 'px'; appState.buttons[selected.dataset.btn] = appState.buttons[selected.dataset.btn] || {}; appState.buttons[selected.dataset.btn].fontSize = selected.style.fontSize; saveStateData(); showToast('Font size: ' + fs, 1000);
          if (selected.style.backgroundImage && selected.style.backgroundImage !== 'none') {
            const bgSize = parseInt(cs.backgroundSize) || fs * 2; const newBgSize = Math.max(10, bgSize + (e.key === ']' ? 2 : -2)); selected.style.backgroundSize = newBgSize + 'px auto'; appState.buttons[selected.dataset.btn].backgroundSize = selected.style.backgroundSize; saveStateData(); showToast('Symbol size: ' + newBgSize, 1000);
          }
        }
      }
      e.preventDefault(); return;
    }

    // border radius without ctrl
    if (!e.ctrlKey && (e.key === '[' || e.key === ']')) {
      if (selected && selected.id !== 'stickWrapper' && selected.id !== 'eightWayWrapper') {
        const cs = window.getComputedStyle(selected); let br = parseInt(cs.borderRadius) || 0; br += (e.key === ']') ? 10 : -10; br = Math.max(0, br); const maxBr = Math.max(selected.offsetWidth, selected.offsetHeight) / 2; br = Math.min(br, maxBr); selected.style.borderRadius = br + 'px'; if (selected.dataset && selected.dataset.btn) { appState.buttons[selected.dataset.btn] = appState.buttons[selected.dataset.btn] || {}; appState.buttons[selected.dataset.btn].borderRadius = selected.style.borderRadius; } saveStateData(); showToast('Border radius: ' + br, 1000);
      }
      e.preventDefault(); return;
    }

    // Delete/hide
    if (e.key === 'Delete') {
      if (selected) {
        const isEditing = selected.querySelector('input'); if (!isEditing) {
          if (selected === base) { selected.style.display = 'none'; appState.base.display = 'none'; showToast('Base hidden', 1000); }
          else if (selected === stickWrapper) { selected.style.display = 'none'; appState.joystick.display = 'none'; showToast('Joystick hidden', 1000); }
          else if (selected === eightWayWrapper) { selected.style.display = 'none'; appState.eightWayWrapper.display = 'none'; showToast('8-way direction hidden', 1000); }
          else if (selected.classList && selected.classList.contains('btn')) { selected.style.display = 'none'; const name = selected.dataset.btn; if (!appState.hiddenButtons.includes(name)) appState.hiddenButtons.push(name); appState.buttons[name] = appState.buttons[name] || {}; appState.buttons[name].display = 'none'; showToast('Button hidden', 1000); }
          deselect(); saveStateData();
        }
      }
      e.preventDefault(); return;
    }

    // movement & resize
    if (selected) {
      const cs = window.getComputedStyle(selected);
      let top = parseInt(cs.top) || 0; let left = parseInt(cs.left) || 0; let width = parseInt(cs.width) || selected.offsetWidth || 0; let height = parseInt(cs.height) || selected.offsetHeight || 0; let updated = false;
      if (e.shiftKey) {
        const centerX = left + width / 2; const centerY = top + height / 2;
        if (e.key === 'ArrowUp') height += 10; if (e.key === 'ArrowDown') height = Math.max(10, height - 10); if (e.key === 'ArrowRight') width += 10; if (e.key === 'ArrowLeft') width = Math.max(10, width - 10);
        if (selected === stickWrapper || selected === eightWayWrapper) { let newSize; if (e.key === 'ArrowUp' || e.key === 'ArrowRight') newSize = Math.max(width, height); else newSize = Math.min(width, height); width = Math.max(10, newSize); height = Math.max(10, newSize); }
        selected.style.width = width + 'px'; selected.style.height = height + 'px'; selected.style.left = (centerX - width / 2) + 'px'; selected.style.top = (centerY - height / 2) + 'px';
        if (selected.classList && selected.classList.contains('btn')) { const name = selected.dataset.btn; appState.buttons[name] = appState.buttons[name] || {}; appState.buttons[name].width = selected.style.width; appState.buttons[name].height = selected.style.height; appState.buttons[name].top = selected.style.top; appState.buttons[name].left = selected.style.left; }
        saveStateData(); showToast(`height: ${height}, width: ${width}`, 1000); updated = true;
      } else {
        if (e.key === 'ArrowUp') { top -= 10; updated = true; } if (e.key === 'ArrowDown') { top += 10; updated = true; } if (e.key === 'ArrowLeft') { left -= 10; updated = true; } if (e.key === 'ArrowRight') { left += 10; updated = true; }
        if (updated) { selected.style.top = Math.max(0, top) + 'px'; selected.style.left = Math.max(0, left) + 'px'; saveStateData(); showToast(`x: ${left}, y: ${top}`, 1000); }
      }
      if (updated) {
        if (selected === stickWrapper) { resizeJoystickWrapper(); joystick.style.left = (width / 2) + 'px'; joystick.style.top = (height / 2) + 'px'; appState.joystick.top = selected.style.top; appState.joystick.left = selected.style.left; appState.joystick.width = selected.style.width; appState.joystick.height = selected.style.height; }
        else if (selected === eightWayWrapper) { appState.eightWayWrapper.top = selected.style.top; appState.eightWayWrapper.left = selected.style.left; appState.eightWayWrapper.width = selected.style.width; appState.eightWayWrapper.height = selected.style.height; }
        else if (selected.classList && selected.classList.contains('btn')) { const name = selected.dataset.btn; appState.buttons[name] = appState.buttons[name] || {}; appState.buttons[name].top = selected.style.top; appState.buttons[name].left = selected.style.left; }
        saveStateData();
      }
    }
  });

  // --- Movement helpers used by gamepad ---
  const elementMoveTimers = { up: 0, down: 0, left: 0, right: 0, ls: 0, rs: 0, hat: 0 };
  const moveDelay = 60; const moveStep = 10;

  function moveSelected(dx, dy, key) {
    if (!selected) return; const cs = window.getComputedStyle(selected); let top = parseInt(cs.top) || 0; let left = parseInt(cs.left) || 0; top = Math.max(0, top + dy); left = Math.max(0, left + dx); selected.style.top = top + 'px'; selected.style.left = left + 'px';
    if (selected.classList.contains('btn')) { const name = selected.dataset.btn; appState.buttons[name] = appState.buttons[name] || {}; appState.buttons[name].top = selected.style.top; appState.buttons[name].left = selected.style.left; }
    else if (selected === stickWrapper) { appState.joystick.top = selected.style.top; appState.joystick.left = selected.style.left; }
    else if (selected === eightWayWrapper) { appState.eightWayWrapper.top = selected.style.top; appState.eightWayWrapper.left = selected.style.left; }
    saveStateData(); showToast(`x:${left}, y:${top}`, 500); elementMoveTimers[key] = performance.now();
  }

  function handleDpadMovement(pad) {
    if (!pad) return -1; const now = performance.now(); let direction = -1;
    const dirs = [ { btn: 12, dx: 0, dy: -moveStep, key: 'up', idx: 6 }, { btn: 13, dx: 0, dy: moveStep, key: 'down', idx: 2 }, { btn: 14, dx: -moveStep, dy: 0, key: 'left', idx: 4 }, { btn: 15, dx: moveStep, dy: 0, key: 'right', idx: 0 } ];
    const pressed = {};
    dirs.forEach(d => { if (pad.buttons[d.btn]?.pressed) { pressed[d.key] = true; if (now - elementMoveTimers[d.key] > moveDelay) moveSelected(d.dx, d.dy, d.key); } });
    if (pressed.up && pressed.left) direction = 5; else if (pressed.up && pressed.right) direction = 7; else if (pressed.down && pressed.left) direction = 3; else if (pressed.down && pressed.right) direction = 1; else if (pressed.up) direction = 6; else if (pressed.down) direction = 2; else if (pressed.left) direction = 4; else if (pressed.right) direction = 0;

    if (direction === -1 && pad.axes && pad.axes.length > 9) {
      const hat = pad.axes[9]; if (typeof hat === 'number' && now - elementMoveTimers['hat'] > moveDelay) {
        const rounded = Math.round(hat * 7);
        switch (rounded) {
          case -7: direction = 6; moveSelected(0, -moveStep, 'hat'); break;
          case -5: direction = 7; moveSelected(moveStep, -moveStep, 'hat'); break;
          case -3: direction = 0; moveSelected(moveStep, 0, 'hat'); break;
          case -1: direction = 1; moveSelected(moveStep, moveStep, 'hat'); break;
          case 1: direction = 2; moveSelected(0, moveStep, 'hat'); break;
          case 3: direction = 3; moveSelected(-moveStep, moveStep, 'hat'); break;
          case 5: direction = 4; moveSelected(-moveStep, 0, 'hat'); break;
          case 7: direction = 5; moveSelected(-moveStep, -moveStep, 'hat'); break;
        }
      }
    }

    const lx = pad.axes[0], ly = pad.axes[1]; if (Math.abs(lx) > 0.3 || Math.abs(ly) > 0.3) { const angle = Math.atan2(ly, lx); const oct = Math.round(8 * angle / (2 * Math.PI) + 8) % 8; direction = oct; }
    return direction;
  }

  function handleStickMovement(pad) {
    const now = performance.now();
    // if no pad, reset both sticks to center and clear distances
    if (!pad) {
      if (btnEls['LS']) btnEls['LS'].style.transform = 'translate(0px, 0px)';
      if (btnEls['RS']) btnEls['RS'].style.transform = 'translate(0px, 0px)';
      return;
    }

    if (selected) {
      // move selected only if corresponding analog is enabled
      const lsMove = appState.analog?.LS !== false;
      const rsMove = appState.analog?.RS !== false;
  const ls = getAnalogStick(pad, 'left', cfg.deadzone, cfg.invertY); const rs = getAnalogStick(pad, 'right', cfg.deadzone, cfg.invertY);
      if (lsMove && (Math.abs(ls.x) > 0.15 || Math.abs(ls.y) > 0.15) && now - (elementMoveTimers['ls'] || 0) > moveDelay) moveSelected(ls.x * moveStep, ls.y * moveStep, 'ls');
      if (rsMove && (Math.abs(rs.x) > 0.15 || Math.abs(rs.y) > 0.15) && now - (elementMoveTimers['rs'] || 0) > moveDelay) moveSelected(rs.x * moveStep, rs.y * moveStep, 'rs');
    }

    // Visual movement of LS/RS buttons: only when enabled
    const ls = getAnalogStick(pad, 'left', cfg.deadzone, cfg.invertY);
      if (appState.analog?.LS === false) {
      if (btnEls['LS']) btnEls['LS'].style.transform = 'translate(0px, 0px)';
    } else {
      if (ls.x === 0 && ls.y === 0) { if (btnEls['LS']) btnEls['LS'].style.transform = 'translate(0px, 0px)'; }
      else { if (btnEls['LS']) btnEls['LS'].style.transform = `translate(${ls.x * (appState.analog?.analogVisualRange ?? 8)}px, ${ls.y * (appState.analog?.analogVisualRange ?? 8)}px)`; }
    }

    const rs = getAnalogStick(pad, 'right', cfg.deadzone, cfg.invertY);
    if (appState.analog?.RS === false) {
      if (btnEls['RS']) btnEls['RS'].style.transform = 'translate(0px, 0px)';
    } else {
      if (rs.x === 0 && rs.y === 0) { if (btnEls['RS']) btnEls['RS'].style.transform = 'translate(0px, 0px)'; }
      else { if (btnEls['RS']) btnEls['RS'].style.transform = `translate(${rs.x * (appState.analog?.analogVisualRange ?? 8)}px, ${rs.y * (appState.analog?.analogVisualRange ?? 8)}px)`; }
    }
  }

  // stick helpers
  function radialDeadzone(x, y, dz) { const mag = Math.hypot(x, y); if (mag < dz) return { x: 0, y: 0 }; const s = (mag - dz) / (1 - dz); return { x: x * s / mag, y: y * s / mag }; }
  function clampRoundedSquare(x, y, n = 8) { const mag = Math.pow(Math.abs(x), n) + Math.pow(Math.abs(y), n); if (mag > 1) { const scale = Math.pow(mag, -1 / n); return { x: x * scale, y: y * scale }; } return { x, y }; }
  function getStickXY(pad) {
    if (!pad) return { x: 0, y: 0 };
  const stickDz = (appState.analog && typeof appState.analog.triggerDeadzone === 'number') ? appState.analog.triggerDeadzone : cfg.deadzone;
    let a = radialDeadzone(pad.axes[0] || 0, pad.axes[1] || 0, stickDz); let { x, y } = a;
    const up = pad.buttons[12]?.pressed ? 1 : 0; const down = pad.buttons[13]?.pressed ? 1 : 0; const leftBtn = pad.buttons[14]?.pressed ? 1 : 0; const rightBtn = pad.buttons[15]?.pressed ? 1 : 0;
    if (up || down || leftBtn || rightBtn) { y = (up ? -1 : 0) + (down ? 1 : 0); x = (leftBtn ? -1 : 0) + (rightBtn ? 1 : 0); if (x && y) { x *= 0.85; y *= 0.85; } }
    return clampRoundedSquare(x, cfg.invertY ? -y : y);
  }

  function getAnalogStick(pad, stick = 'left', deadzone = 0.1, invertY = false) {
    if (!pad) return { x: 0, y: 0 };
    const axisOffset = stick === 'left' ? 0 : 2; let x = pad.axes[axisOffset] || 0; let y = pad.axes[axisOffset + 1] || 0; if (invertY) y = -y;
    // allow default deadzone from appState.analog if not explicitly provided
  const dz = (typeof deadzone === 'number' && deadzone !== undefined) ? deadzone : ((appState.analog && typeof appState.analog.triggerDeadzone === 'number') ? appState.analog.triggerDeadzone : 0.1);
    const mag = Math.hypot(x, y); if (mag < dz) return { x: 0, y: 0 }; const scale = (mag - dz) / (1 - dz); return { x: (x / mag) * scale, y: (y / mag) * scale };
  }

  // --- buttons update from gamepad ---
  function updateButtonsFromPad(pad) {
    if (!pad || !pad.buttons) { resetJoystickHead(); Object.values(btnEls).forEach(b => b.classList.remove('active')); return; }
    let anyPressed = false;
    for (const key in btnEls) {
      const idx = map[key]; if (idx === undefined) continue;
      const DEADZONE = 0.45;
      // raw value from button (some controllers expose analog value on triggers)
      let raw = (pad.buttons[idx] && (typeof pad.buttons[idx].value === 'number')) ? pad.buttons[idx].value : (pad.buttons[idx] && pad.buttons[idx].pressed ? 1 : 0);
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

  // --- sizing & arrows ---
  function clampResizeEightWayArrows() {
    const rect = eightWayWrapper.getBoundingClientRect(); const cx = rect.width / 2; const cy = rect.height / 2; const radius = Math.min(cx, cy);
    for (let i = 0; i < 8; i++) {
      const angle = (i * 45) * Math.PI / 180; const tx = cx + radius * Math.cos(angle); const ty = cy + radius * Math.sin(angle); const arrow = document.getElementById('arrow' + i); if (!arrow) continue;
      const left = tx - arrowSize; const top = ty - (arrowSize / 2); arrow.style.left = left + 'px'; arrow.style.top = top + 'px'; arrow.style.transformOrigin = '100% 50%'; arrow.style.transform = `rotate(${i * 45}deg)`;
    }
  }

  function resizeEightWayArrows() {
    for (let i = 0; i < 8; i++) { const arrow = document.getElementById('arrow' + i); if (!arrow) continue; arrow.style.width = arrowSize + 'px'; arrow.style.height = arrowSize + 'px'; arrow.style.transformOrigin = '100% 50%'; arrow.style.transform = `rotate(${i * 45}deg)`; }
    clampResizeEightWayArrows();
  }

  if (window.ResizeObserver) { const ro = new ResizeObserver(clampResizeEightWayArrows); ro.observe(eightWayWrapper); }
  window.addEventListener('resize', clampResizeEightWayArrows);

  function snapLayoutToGrid(grid = 10) {
    const snap = v => Math.round((parseInt(v) || 0) / grid) * grid + 'px';
    function snapElement(el, store) { if (!el) return; const cs = getComputedStyle(el); el.style.top = snap(cs.top); el.style.left = snap(cs.left); store.top = el.style.top; store.left = el.style.left; let br = parseInt(cs.borderRadius) || 0; if (br > 0) { const maxBr = Math.max(el.offsetWidth, el.offsetHeight) / 2; br = Math.min(br, maxBr); br = Math.round(br / grid) * grid; br = Math.min(br, maxBr); el.style.borderRadius = br + 'px'; store.borderRadius = el.style.borderRadius; } }
    Object.entries(btnEls).forEach(([k, el]) => { appState.buttons[k] = appState.buttons[k] || {}; snapElement(el, appState.buttons[k]); }); snapElement(stickWrapper, appState.joystick = appState.joystick || {}); snapElement(eightWayWrapper, appState.eightWayWrapper = appState.eightWayWrapper || {}); snapElement(base, appState.base = appState.base || {}); saveStateData(); showToast('Snapped layout to grid!', 1000);
  }

  function detectActiveGamepad() { const gps = navigator.getGamepads ? navigator.getGamepads() : []; for (let i = 0; i < gps.length; i++) { const p = gps[i]; if (!p) continue; const anyBtn = p.buttons.some(b => b.pressed); const axisThreshold = (appState.analog && typeof appState.analog.triggerDeadzone === 'number') ? appState.analog.triggerDeadzone : cfg.deadzone; const anyAx = p.axes.some(a => Math.abs(a) > axisThreshold); if (anyBtn || anyAx) return i; } return null; }

  // draw trail
  function resizeJoystickWrapper() { canvas.width = stickWrapper.clientWidth; canvas.height = stickWrapper.clientHeight; }
  window.addEventListener('resize', resizeJoystickWrapper);
  resizeJoystickWrapper();

  function drawTrail(tr) {
    ctx.clearRect(0,0,canvas.width,canvas.height); if (!tr || tr.length < 2) return; const cx = canvas.width / 2, cy = canvas.height / 2, cr = Math.min(canvas.width, canvas.height) / 2 - 12; const trailColor = getComputedStyle(document.documentElement).getPropertyValue('--trail-color')?.trim() || appState.trailColor || '#CEEC73';
    for (let i = 1; i < tr.length; i++) {
      const p0 = tr[i-1], p1 = tr[i], t = i / tr.length; const x0 = cx + p0.x * cr, y0 = cy + p0.y * cr, x1 = cx + p1.x * cr, y1 = cy + p1.y * cr; if (!isFinite(x0) || !isFinite(y0) || !isFinite(x1) || !isFinite(y1)) continue; ctx.beginPath(); ctx.moveTo(x0,y0); ctx.lineTo(x1,y1); ctx.lineWidth = 12 * (t*2); ctx.lineCap = 'round'; ctx.strokeStyle = trailColor; ctx.stroke();
    }
  }

  // --- Profiles: save/load unified with helpers ---
  function saveProfile(n) {
    if (n < 1 || n > PROFILE_COUNT) return; const snap = exportLayout(); appState.profiles['profile' + n] = snap; appState.lastProfile = n; saveStateData();
  }

  function loadProfile(n) {
    const snap = appState.profiles['profile' + n]; if (!snap) { showToast('Profile ' + n + ' empty', 1000); return; }
    importLayout(snap); appState.lastProfile = n; showToast('Profile ' + n + ' loaded', 1000); saveStateData();
  }

  async function resetToDefault() {
    try { const res = await fetch('layouts/default.json'); if (!res.ok) throw new Error('default.json not found'); const parsed = await res.json(); importLayout(parsed); showToast('Reset to default layout', 1000); }
    catch { showToast('Could not load default.json', 1000); }
  }

  function updateStateData() {
    Object.entries(btnEls).forEach(([k, el]) => {
      const data = appState.buttons[k] || {};
      applyPropertiesToElement(el, data);
      let display = data.display;
      if (display === undefined) display = appState.hiddenButtons?.includes(k) ? 'none' : 'flex';
      if (el.style.display !== display) el.style.display = display;
      if (data.zIndex !== undefined && el.style.zIndex !== data.zIndex) el.style.zIndex = data.zIndex;
      if (data.backgroundImage !== undefined && el.style.backgroundImage !== data.backgroundImage) el.style.backgroundImage = data.backgroundImage;
      if (data.backgroundSize !== undefined) {
        if (el === eightWayWrapper) { const arrows = eightWayWrapper.querySelectorAll('.arrow'); arrows.forEach(arrow => arrow.style.backgroundSize = data.backgroundSize); }
        else if (el.style.backgroundSize !== data.backgroundSize) el.style.backgroundSize = data.backgroundSize;
      }
      if (data.label !== undefined && el.dataset?.btn) el.textContent = data.label;
      if (data.outlineWidth != null || data.outlineColor != null) { const width = data.outlineWidth ?? 0; const color = data.outlineColor ?? 'black'; el.style.outline = `${width}px solid ${color}`; el.style.outlineOffset = `-${width}px`; }
      if (data.boxShadowSpread != null) { const spread = data.boxShadowSpread; el.style.boxShadow = `0 0 0 ${spread}px black`; }
    });

  if (appState.joystick) { applyPropertiesToElement(stickWrapper, appState.joystick); if (appState.joystick.display !== undefined) stickWrapper.style.display = appState.joystick.display; }
  if (appState.base) { applyPropertiesToElement(base, appState.base); if (appState.base.display !== undefined) base.style.display = appState.base.display; }
  if (appState.eightWayWrapper) { applyPropertiesToElement(eightWayWrapper, appState.eightWayWrapper); if (appState.eightWayWrapper.display !== undefined) eightWayWrapper.style.display = appState.eightWayWrapper.display; if (appState.eightWayWrapper.arrowSize !== undefined) { arrowSize = appState.eightWayWrapper.arrowSize || 90; resizeEightWayArrows(); } }
  if (appState.trailColor) document.documentElement.style.setProperty('--trail-color', appState.trailColor);
  // Persist current joystick head style to appState
  appState.joystickHead = captureElementProperties(joystick);
  resizeJoystickWrapper(); joystick.style.left = canvas.width/2 + 'px'; joystick.style.top = canvas.height/2 + 'px'; applyJoystickHeadFromState();
  // analog prefs applied via importLayout/exportLayout only (no on-screen controls)
  }

  // --- copy/export/import UI ---
  async function copyLayoutToClipboard() {
    const snap = exportLayout(); const json = JSON.stringify(snap, null, 2);
    if (navigator.clipboard && navigator.clipboard.writeText) {
      try { await navigator.clipboard.writeText(json); showToast('Copied layout to clipboard', 1000); } catch (e) { console.warn(e); showToast('Copy failed', 1000); }
    } else {
      const ta = document.getElementById('clipboardInput'); ta.value = json; ta.select(); try { document.execCommand('copy'); showToast('Copied layout to clipboard', 1000); } catch (e) { showToast('Copy failed', 1000); }
    }
    saveStateData();
  }

  // Import input
  const importInput = document.createElement('input'); importInput.type = 'file'; importInput.accept = '.json,application/json'; importInput.style.display = 'none'; document.body.appendChild(importInput);
  importInput.addEventListener('change', e => {
    const f = e.target.files && e.target.files[0]; if (!f) return; const r = new FileReader(); r.onload = ev => { try { const parsed = JSON.parse(ev.target.result); importLayout(parsed); showToast('Imported layout', 1000); } catch (err) { showToast('Invalid JSON', 1000); } }; r.readAsText(f); importInput.value = '';
  });

  // load help
  fetch('help.html').then(r => r.text()).then(html => { document.getElementById('helpPanel').innerHTML = html; }).catch(err => console.warn('Could not load help.html', err));
  showToast('Help file not found!', 800);
  const helpPanel = document.getElementById('helpPanel');

  // --- Presets menu: list layouts with hover preview and apply/cancel behavior ---
  let layoutsIndex = null;
  let presetsMenuEl = null;
  let _previewFetchController = null;
  let _prevLayoutSnapshot = null;
  let _menuSelectionMade = false;

  async function loadLayoutsIndex() {
    if (layoutsIndex) return layoutsIndex;
    try {
      const res = await fetch('layouts/index.json'); if (!res.ok) throw new Error('not found');
      const parsed = await res.json();
      // normalized to array of {file, name}
      layoutsIndex = Array.isArray(parsed) ? parsed.map(it => (typeof it === 'string' ? { file: it, name: it.replace(/\.json$/i,'') } : { file: it.file, name: it.name || it.file })) : [];
      return layoutsIndex;
    } catch (e) { console.warn('Could not load layouts/index.json', e); layoutsIndex = []; return layoutsIndex; }
  }

  // Apply a parsed layout to the DOM without mutating appState or saving. Used for hover previews.
  function applyLayoutPreview(parsed) {
    if (!parsed) return;
    try {
      // Apply base/joystick/eightway/buttons visually, but do not merge into appState (we'll revert by re-importing the snapshot)
      if (parsed.base) applyPropertiesToElement(base, parsed.base);
      if (parsed.joystick) applyPropertiesToElement(stickWrapper, parsed.joystick);
      // joystick head: apply visual properties for preview
      if (parsed.joystickHead) {
        applyPropertiesToElement(joystick, parsed.joystickHead);
        // also copy specific head properties that importLayout would normally manage
        ['boxShadow','outline','borderRadius','fontSize','backgroundColor','backgroundImage','color'].forEach(k => {
          if (parsed.joystickHead[k] !== undefined) joystick.style[k] = parsed.joystickHead[k];
        });
      }
      if (parsed.eightWayWrapper) applyPropertiesToElement(eightWayWrapper, parsed.eightWayWrapper);
      // buttons
      if (parsed.buttons) {
        Object.entries(parsed.buttons).forEach(([k, data]) => { if (btnEls[k]) applyPropertiesToElement(btnEls[k], data); });
      }
      if (parsed.trailColor) document.documentElement.style.setProperty('--trail-color', parsed.trailColor);

      // eight-way specific: arrow size and images
      if (parsed.eightWayWrapper?.arrowSize !== undefined) { arrowSize = parseInt(parsed.eightWayWrapper.arrowSize) || arrowSize; }
      // images
      if (parsed.eightWayWrapper?.arrowImageOff || parsed.eightWayWrapper?.arrowImageOn) {
        for (let i = 0; i < 8; i++) {
          const arrow = document.getElementById('arrow' + i); if (!arrow) continue;
          if (parsed.eightWayWrapper.arrowImageOff) arrow.style.backgroundImage = `url('${parsed.eightWayWrapper.arrowImageOff}')`;
          if (parsed.eightWayWrapper.arrowImageOn) arrow.dataset._previewOn = parsed.eightWayWrapper.arrowImageOn;
        }
      }
      resizeEightWayArrows(); resizeJoystickWrapper();
    } catch (e) { console.warn('preview apply failed', e); }
  }

  function closePresetsMenu(revert = true) {
    if (!presetsMenuEl) return;
    presetsMenuEl.remove(); presetsMenuEl = null;
    // stop any outstanding fetch
    try { if (_previewFetchController) _previewFetchController.abort(); } catch (e) {}
    // if a selection wasn't made, revert to previous snapshot
    if (revert && !_menuSelectionMade && _prevLayoutSnapshot) {
      try { importLayout(_prevLayoutSnapshot); } catch (e) { console.warn('Could not revert layout after cancelling presets menu', e); }
    }
    _prevLayoutSnapshot = null; _menuSelectionMade = false;
    document.removeEventListener('mousedown', _presetsOutsideClickHandler);
    document.removeEventListener('keydown', _presetsKeyHandler);
  }

  function _presetsOutsideClickHandler(e) {
    if (!presetsMenuEl) return;
    if (presetsMenuEl.contains(e.target)) return;
    closePresetsMenu(true);
  }

  function _presetsKeyHandler(e) {
    if (e.key === 'Escape') { closePresetsMenu(true); }
  }

  async function openPresetsMenu(x, y) {
    try {
      const list = await loadLayoutsIndex();
      // capture current layout snapshot so preview can be reverted
      _prevLayoutSnapshot = exportLayout(); _menuSelectionMade = false;
      // remove existing menu if present
      if (presetsMenuEl) presetsMenuEl.remove();
      const menu = document.createElement('div'); menu.className = 'presetsMenu';
  // Header with toggle between Profiles and Presets
  const hdr = document.createElement('div'); hdr.className = 'presetsHeader';
  const profilesToggle = document.createElement('span'); profilesToggle.className = 'presetHeaderToggle'; profilesToggle.textContent = 'Profiles'; profilesToggle.style.cursor = 'pointer'; profilesToggle.style.marginRight = '10px';
  const presetsToggle = document.createElement('span'); presetsToggle.className = 'presetHeaderToggle'; presetsToggle.textContent = 'Presets'; presetsToggle.style.cursor = 'pointer';
  hdr.appendChild(profilesToggle); hdr.appendChild(presetsToggle); menu.appendChild(hdr);
  const wrapper = document.createElement('div'); wrapper.className = 'presetsList';
      // helper to show presets list
      function renderPresetsList() {
        wrapper.innerHTML = '';
        if (!list || list.length === 0) {
          const none = document.createElement('div'); none.className = 'presetItem'; none.textContent = '(no presets found)'; wrapper.appendChild(none);
        } else {
          for (const entry of list) {
            const fn = entry.file; const label = entry.name || entry.file.replace(/\.json$/i, '');
            const item = document.createElement('div'); item.className = 'presetItem'; item.textContent = label; item.dataset.file = fn; item.dataset.name = label;
            item.addEventListener('mouseenter', async () => {
              try {
                if (_previewFetchController) try { _previewFetchController.abort(); } catch (e) {}
                _previewFetchController = new AbortController();
                const res = await fetch('layouts/' + fn, { signal: _previewFetchController.signal }); if (!res.ok) throw new Error('not found');
                const parsed = await res.json(); applyLayoutPreview(parsed);
              } catch (e) { if (e.name !== 'AbortError') console.warn('Could not load preset for preview', e); }
            });
            item.addEventListener('click', async (ev) => {
              ev.stopPropagation(); try {
                const res = await fetch('layouts/' + fn); if (!res.ok) throw new Error('not found'); const parsed = await res.json();
                importLayout(parsed);
                _menuSelectionMade = true; closePresetsMenu(false);
                showToast('Preset applied: ' + item.dataset.name, 1000);
              } catch (e) { console.warn('Could not apply preset', e); }
            });
            wrapper.appendChild(item);
          }
        }
      }

      // helper to render profiles list
      function renderProfilesList() {
        wrapper.innerHTML = '';
        for (let i = 1; i <= PROFILE_COUNT; i++) {
          const key = 'profile' + i;
          const saved = appState.profiles && appState.profiles[key];
          const item = document.createElement('div'); item.className = 'presetItem';
          const label = 'Profile ' + i + (saved ? '' : ' (Empty)');
          item.textContent = label; item.dataset.profile = i;
          if (saved) {
            item.addEventListener('mouseenter', () => { try { applyLayoutPreview(saved); } catch (e) { console.warn('profile preview failed', e); } });
            item.addEventListener('click', () => { try { importLayout(saved); _menuSelectionMade = true; closePresetsMenu(false); showToast('Profile ' + i + ' loaded', 1000); } catch (e) { console.warn('profile load failed', e); } });
          }
          wrapper.appendChild(item);
        }
      }

  // initial render shows profiles by default
  renderProfilesList();
      // wire header toggles and set classes
      function setActiveToggle(which) {
        if (which === 'profiles') {
          profilesToggle.classList.add('active'); profilesToggle.classList.remove('inactive');
          presetsToggle.classList.remove('active'); presetsToggle.classList.add('inactive');
        } else {
          presetsToggle.classList.add('active'); presetsToggle.classList.remove('inactive');
          profilesToggle.classList.remove('active'); profilesToggle.classList.add('inactive');
        }
      }
      profilesToggle.addEventListener('click', () => { setActiveToggle('profiles'); renderProfilesList(); });
      presetsToggle.addEventListener('click', () => { setActiveToggle('presets'); renderPresetsList(); });
  setActiveToggle('profiles');
      menu.appendChild(wrapper);
      // const note = document.createElement('div'); note.className = 'presetPreviewNote'; note.textContent = 'Hover to preview. Click to apply. Click outside to cancel.'; menu.appendChild(note);
      document.body.appendChild(menu); presetsMenuEl = menu;
      // position and clamp to viewport (mirror colorPanel logic)
      menu.style.left = x + 'px'; menu.style.top = y + 'px'; const rect = menu.getBoundingClientRect(); const vw = window.innerWidth; const vh = window.innerHeight;
      let left = x; let top = y; if (left + rect.width > vw) left = Math.max(8, vw - rect.width - 10); if (top + rect.height > vh) top = Math.max(8, vh - rect.height - 10);
      menu.style.left = left + 'px'; menu.style.top = top + 'px';
  // make Presets toggle visually active by default
  presetsToggle.style.fontWeight = 'bold';
  // register global handlers to close
      document.addEventListener('mousedown', _presetsOutsideClickHandler);
      document.addEventListener('keydown', _presetsKeyHandler);
    } catch (e) { console.warn('openPresetsMenu failed', e); }
  }

  // open presets menu on right-click when not on UI elements or colorPanel
  document.addEventListener('contextmenu', (e) => {
    // don't open if contextmenu invoked on colorPanel or on interactive UI
    try {
      if (colorPanel && colorPanel.contains(e.target)) return;
      const topEl = document.elementFromPoint(e.clientX, e.clientY);
      const isOnUI = !!topEl?.closest?.('.btn') || !!topEl?.closest?.('#stickWrapper') || !!topEl?.closest?.('#eightWayWrapper') || !!topEl?.closest?.('#base');
      if (isOnUI) return; e.preventDefault(); openPresetsMenu(e.pageX, e.pageY);
    } catch (err) { }
  });

  document.addEventListener('keydown', e => { if (e.key === 'Tab') { e.preventDefault(); helpPanel.style.display = 'block'; } });
  document.addEventListener('keyup', e => { if (e.key === 'Tab') helpPanel.style.display = 'none'; });

  // detect active gamepad & main animation loop
  function animate() {
    activeGamepadIndex = detectActiveGamepad();
    const pad = (navigator.getGamepads && activeGamepadIndex !== null) ? navigator.getGamepads()[activeGamepadIndex] : null;
    updateButtonsFromPad(pad);
    const dpadDir = handleDpadMovement(pad); updateArrowHighlights(dpadDir);
    const { x, y } = getStickXY(pad); const cx = canvas.width/2, cy = canvas.height/2; const radius = canvas.width/2 - 25; const jx = cx + x * radius, jy = cy + y * radius; joystick.style.left = jx + 'px'; joystick.style.top = jy + 'px';
    trail.push({ x, y }); if (trail.length > cfg.trail) trail.shift(); drawTrail(trail);
    handleStickMovement(pad);
    for (let i = 0; i < markers.length; i++) markers[i].classList.toggle('active', i === dpadDir);
    requestAnimationFrame(animate);
  }

  // Boot
  function loadStateData() {
    try {
      const raw = localStorage.getItem(STORAGE_KEY); if (!raw) return; const parsed = JSON.parse(raw);
      appState.buttons = Object.assign({}, appState.buttons || {}, parsed.buttons || {});
      appState.profiles = Object.assign({}, appState.profiles || {}, parsed.profiles || {});
      appState.joystick = Object.assign({}, appState.joystick || {}, parsed.joystick || {});
      appState.base = Object.assign({}, appState.base || {}, parsed.base || {});
      appState.eightWayWrapper = Object.assign({}, appState.eightWayWrapper || {}, parsed.eightWayWrapper || {});
      if (parsed.joystickHead !== undefined) appState.joystickHead = Object.assign({}, parsed.joystickHead);
      if (parsed.hiddenButtons !== undefined) appState.hiddenButtons = parsed.hiddenButtons;
      if (parsed.trailColor !== undefined) appState.trailColor = parsed.trailColor;
      if (parsed.lastProfile !== undefined) appState.lastProfile = parsed.lastProfile;
  // load analog prefs if present (ignore legacy showDistance if present)
  if (parsed.analog !== undefined) {
    const safeAnalog = Object.assign({}, parsed.analog);
    if (safeAnalog.showDistance !== undefined) delete safeAnalog.showDistance;
    appState.analog = Object.assign({}, appState.analog || {}, safeAnalog);
  }
      // Apply joystick head style after loading
      applyJoystickHeadFromState();
      console.debug('[Trailpad] state loaded');
    } catch (e) { console.warn(e); }
  }

  loadStateData(); updateStateData(); resizeJoystickWrapper(); joystick.style.left = (canvas.width/2) + 'px'; joystick.style.top = (canvas.height/2) + 'px';
  if (window.ResizeObserver) { const ro = new ResizeObserver(() => { resizeJoystickWrapper(); joystick.style.left = (canvas.width/2) + 'px'; joystick.style.top = (canvas.height/2) + 'px'; }); ro.observe(stickWrapper); }
  animate(); showToast('Click Interact to start customizing', 5000);

  // expose helpers
  window.trailpad = { saveStateData, loadStateData, copyLayoutToClipboard };


});
