window.addEventListener('DOMContentLoaded', () => {
    const STORAGE_KEY = 'trailpad_1';
    const PROFILE_COUNT = 8;

    const map = Object.fromEntries([
            "A", "B", "X", "Y",
            "LB", "RB", "LT", "RT",
            "View", "Menu", "LS", "RS",
            "Up", "Down", "Left", "Right"
        ]
        .map((k, i) => [k, i])
    );
    const arrowNames = ["Right", "Down Right", "Down", "Down Left", "Left", "Up Left", "Up", "Up Right"];
    const cfg = {
        deadzone: 0.1,
        trail: 8,
        invertY: false,
        ignoredForJoystick: ['View', 'Menu', 'Up', 'Down', 'Left', 'Right']
    };

    const palette = [
        // Reds
        "#660D0D", "#801515", "#992020", "#B32D2D", "#CC3A3A", "#E64D4D", "#FF6666", "#FF8080", "#FF9999",
        // Oranges
        "#66380D", "#804514", "#99551F", "#B3662D", "#CC773A", "#E68C4D", "#FF9966", "#FFB380", "#FFCC99",
        // Yellows
        "#66660D", "#808013", "#999926", "#B3B32D", "#CCCC40", "#E6E64D", "#FFFF66", "#FFFF80", "#FFFF99",
        // Greens
        "#0D660D", "#158015", "#208020", "#2DB32D", "#39CC39", "#4DE64D", "#66FF66", "#80FF80", "#99FF99",
        // Cyans / Teals
        "#0D6666", "#148080", "#209999", "#26B3B3", "#33CCCC", "#4DE6E6", "#66FFFF", "#80FFFF", "#99FFFF",
        // Blues
        "#0D0D66", "#151580", "#202099", "#2D2DB3", "#3939CC", "#4D4DE6", "#6666FF", "#8080FF", "#9999FF",
        // Purples
        "#330D66", "#451580", "#552099", "#6B2DB3", "#8039CC", "#994DE6", "#B366FF", "#CC80FF", "#D9A6FF",
        // Pinks / Magentas
        "#660D66", "#801580", "#992099", "#B32DB3", "#CC39CC", "#E64DE6", "#FF66FF", "#FF80FF", "#FF99FF",
        // Grayscale
        "#000000", "#333333", "#666666", "#999999", "#CCCCCC", "#FFFFFF",
        // Transparent
        "#00000000", "#ffffff20", "#ffffff40", "#ffffff60", "#ffffff80"
    ];

    // DOM
    const btnEls = {};
    document.querySelectorAll('.btn').forEach(el => btnEls[el.dataset.btn] = el);
    const base = document.getElementById('base');
    const stickWrapper = document.getElementById('stickWrapper');
    const joystick = document.getElementById('joystickHead');
    const eightWayWrapper = document.getElementById('eightWayWrapper');
    const canvas = document.getElementById('stickCanvas');
    const ctx = canvas.getContext('2d');
    const colorPanel = document.getElementById('colorPanel');
    const toastEl = document.getElementById('toast');
    const markers = Array.from({
        length: 8
    }, (_, i) => document.getElementById('marker' + i));

    let arrowSize = 90;

    // State
    let appState = {
        buttons: {},
        joystick: {},
        base: {},
        eightWayWrapper: {
            arrowSize: 90
        },
        hiddenButtons: [],
        trailColor: getComputedStyle(document.documentElement).getPropertyValue('--trail-color') || '#CEEC73',
        profiles: {}
    };
    let selected = null;
    let lastPressedTimes = {};
    let trail = [];
    let activeGamepadIndex = null;
    let panelAnchorTarget = null;
    let currentPreviewTarget = null;

    function showToast(msg, dur = 1000) {
        toastEl.textContent = msg;
        toastEl.style.transform = 'translate(-50%,0) scale(1)';
        clearTimeout(toastEl._t);
        toastEl._t = setTimeout(() => toastEl.style.transform = 'translate(-50%,0) scale(0)', dur);
    }

    function saveState() {
        try {
            localStorage.setItem(STORAGE_KEY, JSON.stringify(appState));            
			console.debug("Saving state:", JSON.stringify(appState.buttons, null, 2));
        } catch (e) {
            console.warn(e);
        }
    }

    function loadState() {
        try {
            const raw = localStorage.getItem(STORAGE_KEY);
            if (raw) {
                const parsed = JSON.parse(raw);
                appState.buttons = Object.assign({}, appState.buttons || {}, parsed.buttons || {});
                appState.profiles = Object.assign({}, appState.profiles || {}, parsed.profiles || {});
                appState.joystick = Object.assign({}, appState.joystick || {}, parsed.joystick || {});
                appState.base = Object.assign({}, appState.base || {}, parsed.base || {});
                appState.eightWayWrapper = Object.assign({}, appState.eightWayWrapper || {}, parsed.eightWayWrapper || {});
                // Arrays and primitives: override if present
                if (parsed.hiddenButtons !== undefined) appState.hiddenButtons = parsed.hiddenButtons;
                if (parsed.trailColor !== undefined) appState.trailColor = parsed.trailColor;
                if (parsed.lastProfile !== undefined) appState.lastProfile = parsed.lastProfile;
                console.debug('[Trailpad] state loaded');
            }
        } catch (e) {
            console.warn(e);
        }
    }

    function applyState() {
        Object.entries(btnEls).forEach(([k, el]) => {
            const data = appState.buttons[k] || {};
            applyElement(el, data);

            let display = data.display;
            if (display === undefined) {
                display = appState.hiddenButtons?.includes(k) ? "none" : "flex";
            }
            if (el.style.display !== display) {
                el.style.display = display;
            }
            if (data.zIndex !== undefined && el.style.zIndex !== data.zIndex) {
                el.style.zIndex = data.zIndex;
            }
            if (data.backgroundImage !== undefined && el.style.backgroundImage !== data.backgroundImage) {
                el.style.backgroundImage = data.backgroundImage;
            }
            if (data.backgroundSize !== undefined) {
                if (el === eightWayWrapper) {
                    const arrows = eightWayWrapper.querySelectorAll(".arrow");
                    arrows.forEach(arrow => {
                        arrow.style.backgroundSize = data.backgroundSize;
                    });
                } else if (el.style.backgroundSize !== data.backgroundSize) {
                    el.style.backgroundSize = data.backgroundSize;
                }
            }
            if (data.label !== undefined && el.dataset && el.dataset.btn) {
                el.textContent = data.label;
            }
        });
        if (appState.joystick) {
            applyElement(stickWrapper, appState.joystick);
            if (appState.joystick.display !== undefined) {
                stickWrapper.style.display = appState.joystick.display;
            }
        }
        if (appState.base) {
            applyElement(base, appState.base);
            if (appState.base.display !== undefined) {
                base.style.display = appState.base.display;
            }
        }
        if (appState.eightWayWrapper) {
            applyElement(eightWayWrapper, appState.eightWayWrapper);
            if (appState.eightWayWrapper.display !== undefined) {
                eightWayWrapper.style.display = appState.eightWayWrapper.display;
            }
            if (appState.eightWayWrapper.arrowSize !== undefined) {
                arrowSize = appState.eightWayWrapper.arrowSize;
                applyArrowSize();
            }
        }
        if (appState.trailColor) {
            document.documentElement.style.setProperty("--trail-color", appState.trailColor);
        }
        resizeCanvas();
        joystick.style.left = canvas.width / 2 + "px";
        joystick.style.top = canvas.height / 2 + "px";
    }

    function applyElement(el, data) {
        if (!el || !data) return;
        if (data.display !== undefined) el.style.display = data.display;
        if (data.zIndex !== undefined) el.style.zIndex = data.zIndex;

        if (data.top !== undefined) el.style.top = data.top;
        if (data.left !== undefined) el.style.left = data.left;
        if (data.width !== undefined) el.style.width = data.width;
        if (data.height !== undefined) el.style.height = data.height;

        if (data.borderRadius !== undefined) el.style.borderRadius = data.borderRadius;
        if (data.outline !== undefined) el.style.outline = data.outline;
        if (data.outlineOffset !== undefined) el.style.outlineOffset = data.outlineOffset;

        if (data.backgroundColor !== undefined) el.style.backgroundColor = data.backgroundColor;
        if (data.backgroundImage !== undefined) el.style.backgroundImage = data.backgroundImage;
        if (data.backgroundSize !== undefined) el.style.backgroundSize = data.backgroundSize;

        if (data.color !== undefined) el.style.color = data.color;
        if (data.fontSize !== undefined) el.style.fontSize = data.fontSize;
        if (data.label !== undefined && el.dataset && el.dataset.btn) el.textContent = data.label;
    }

    function captureElement(el) {
        const cs = window.getComputedStyle(el);
        const snap = {
            display: cs.display,
            zIndex: cs.zIndex,
            top: cs.top,
            left: cs.left,
            width: cs.width,
            height: cs.height,
            borderRadius: cs.borderRadius,
            outline: cs.outline,
            outlineOffset: cs.outlineOffset,
            backgroundColor: cs.backgroundColor,
            backgroundImage: cs.backgroundImage,
            backgroundSize: cs.backgroundSize,
            color: cs.color,
            fontSize: cs.fontSize,
            label: (el.textContent || '').trim()
		};

		if (el.dataset && el.dataset.btn) {
			const key = el.dataset.btn;
			if (appState.buttons?.[key]?.label !== undefined) {
				snap.label = appState.buttons[key].label;
			} else {
				snap.label = (el.textContent || '').trim();
			}
		}
		
        if (el === eightWayWrapper && appState.eightWayWrapper?.arrowSize !== undefined) {
            snap.arrowSize = appState.eightWayWrapper.arrowSize;
        }
        return snap;
    }

    function selectElement(el) {
        revertPreview();
        if (!el) {
            if (selected) {
                selected.classList.remove('selected');
                selected.classList.remove('selectedOutline');
            }
            selected = null;
            return;
        }
        if (selected && selected !== el) {
            selected.classList.remove('selected');
            selected.classList.remove('selectedOutline');
        }
        selected = el;
        selected.classList.add('selected');
        selected.classList.add('selectedOutline');
        if (colorPanel.style.display === 'block' || colorPanel.style.display === 'flex') panelAnchorTarget = selected;
    }

    function deselect() {
        selectElement(null);
    }

    function revertPreview() {
        if (!currentPreviewTarget) return;
        if (currentPreviewTarget.dataset._prevBg !== undefined) {
            currentPreviewTarget.style.backgroundColor = currentPreviewTarget.dataset._prevBg || '';
            delete currentPreviewTarget.dataset._prevBg;
        }
        if (currentPreviewTarget.dataset._prevColor !== undefined) {
            currentPreviewTarget.style.color = currentPreviewTarget.dataset._prevColor || '';
            delete currentPreviewTarget.dataset._prevColor;
        }
        currentPreviewTarget = null;
    }

    // 8-way direction	
    function updateArrowHighlights(idx) {
        for (let i = 0; i < 8; i++) {
            const arrow = document.getElementById('arrow' + i);
            if (arrow) {
                const isActive = i === idx;
                arrow.classList.toggle('active', isActive);
            }
        }
    }

    document.addEventListener('mousedown', (e) => {
        if (colorPanel.contains(e.target)) return;
        const topEl = document.elementFromPoint(e.clientX, e.clientY);
        const isOnUI = !!topEl?.closest?.('.btn') || !!topEl?.closest?.('#stickWrapper') || !!topEl?.closest?.('#eightWayWrapper') || !!topEl?.closest?.('#base');
        if (isOnUI) return;
        const br = base.getBoundingClientRect();
        if (e.clientX >= br.left && e.clientX <= br.right && e.clientY >= br.top && e.clientY <= br.bottom) {
            selectElement(base);
            return;
        }
        deselect();

        // Hide color panel by clicking out
        if (!colorPanel.contains(e.target)) {
            colorPanel.style.display = 'none';
            revertPreview();
        }
    });

    [base, stickWrapper, eightWayWrapper].forEach(el => {
        el.addEventListener('mousedown', e => {
            selectElement(el);
            e.stopPropagation();
        });
    });

    Object.values(btnEls).forEach(btn => {
        btn.addEventListener('click', e => {
            selectElement(btn);
            lastPressedTimes[btn.dataset.btn] = performance.now();
            showToast(btn.dataset.btn, 1000);
            e.stopPropagation();
            if (colorPanel.style.display === 'block' || colorPanel.style.display === 'flex') panelAnchorTarget = btn;
        });
        btn.addEventListener('contextmenu', e => {
            e.preventDefault();
            selectElement(btn);
            openColorPanel(btn, e.pageX, e.pageY);
        });
        btn.addEventListener('dblclick', e => {
            if (btn.querySelector('input')) return;
            const old = btn.textContent.trim();
            btn.textContent = '';
            const input = document.createElement('input');
            input.className = 'btn-edit';
            input.value = old;
            btn.appendChild(input);
            input.focus();
            input.select();

			function save() {
				const newLabel = input.value.trim();				
				if (btn.contains(input)) {
					btn.removeChild(input);
				}
				btn.textContent = newLabel;				
				appState.buttons[btn.dataset.btn] = appState.buttons[btn.dataset.btn] || {};
				appState.buttons[btn.dataset.btn].label = newLabel;
				saveState();
			}
            input.addEventListener('blur', save);
			input.addEventListener('keydown', ev => {
				if (ev.key === 'Enter') {
					save();
				}
				if (ev.key === 'Escape') {
					if (btn.contains(input)) btn.removeChild(input);
					btn.textContent = old;
				}
			});
            e.stopPropagation();
        });
    });

    // Remember last selected color panel mode
    let colorMode = localStorage.getItem('colorMode') || 'bg';
    let outlineWidth = 4; // default thickness

    function openColorPanel(anchorTarget, x, y) {
        panelAnchorTarget = anchorTarget;
        revertPreview();
        colorPanel.innerHTML = '';

        // Mode toggle
        const toggle = document.createElement('div');
        toggle.className = 'modeToggle';

        const bgDiv = document.createElement('div');
        bgDiv.className = 'modeBtn bgBtn';
        bgDiv.textContent = 'FILL';

        const txtDiv = document.createElement('div');
        txtDiv.className = 'modeBtn txtBtn';
        txtDiv.textContent = 'TEXT';

        const outlineDiv = document.createElement('div');
        outlineDiv.className = 'modeBtn outlineBtn';
        outlineDiv.textContent = 'STROKE';

        toggle.appendChild(bgDiv);
        toggle.appendChild(txtDiv);
        toggle.appendChild(outlineDiv);
        colorPanel.appendChild(toggle);

        let mode = colorMode;
        if (mode === 'bg') bgDiv.classList.add('active');
        if (mode === 'text') txtDiv.classList.add('active');
        if (mode === 'outline') outlineDiv.classList.add('active');

        bgDiv.addEventListener('click', () => {
            mode = 'bg';
            colorMode = 'bg';
            bgDiv.classList.add('active');
            txtDiv.classList.remove('active');
            outlineDiv.classList.remove('active');
        });

        txtDiv.addEventListener('click', () => {
            mode = 'text';
            colorMode = 'text';
            txtDiv.classList.add('active');
            bgDiv.classList.remove('active');
            outlineDiv.classList.remove('active');
        });

        outlineDiv.addEventListener('click', () => {
            mode = 'outline';
            colorMode = 'outline';
            outlineDiv.classList.add('active');
            bgDiv.classList.remove('active');
            txtDiv.classList.remove('active');
        });

        // Swatch container
        const swatchContainer = document.createElement('div');
        swatchContainer.className = 'swatchContainer';

        palette.forEach(c => {
            const s = document.createElement('div');
            s.className = 'swatch';
            s.dataset.color = c;
            s.title = c;
            s.style.background = c;

            s.addEventListener('click', () => {
                const applyTarget = selected || panelAnchorTarget;
                if (!applyTarget) {
                    colorPanel.style.display = 'none';
                    return;
                }
                if (mode === 'bg') {
                    applyTarget.style.backgroundColor = c;
                    if (applyTarget.dataset && applyTarget.dataset.btn) {
                        appState.buttons[applyTarget.dataset.btn] = appState.buttons[applyTarget.dataset.btn] || {};
                        appState.buttons[applyTarget.dataset.btn].backgroundColor = c;
                    }
                } else if (mode === 'text') {
                    applyTarget.style.color = c;
                    if (applyTarget.dataset && applyTarget.dataset.btn) {
                        appState.buttons[applyTarget.dataset.btn] = appState.buttons[applyTarget.dataset.btn] || {};
                        appState.buttons[applyTarget.dataset.btn].color = c;
                    } else if (applyTarget === base) appState.base.color = c;
                } else if (mode === 'outline') {
                    applyTarget.style.outline = `${outlineWidth}px solid ${c}`;
                    applyTarget.style.outlineOffset = `-${outlineWidth}px`;
                    if (applyTarget.dataset && applyTarget.dataset.btn) {
                        appState.buttons[applyTarget.dataset.btn] = appState.buttons[applyTarget.dataset.btn] || {};
                        appState.buttons[applyTarget.dataset.btn].outline = applyTarget.style.outline;
                        appState.buttons[applyTarget.dataset.btn].outlineOffset = applyTarget.style.outlineOffset;
                    }
                }
                saveState();
            });
            swatchContainer.appendChild(s);
        });
        colorPanel.appendChild(swatchContainer);

        // Temporarily display to measure size
        colorPanel.style.display = 'block';
        colorPanel.style.left = '0px';
        colorPanel.style.top = '0px';

        // Clamp to viewport
        const panelRect = colorPanel.getBoundingClientRect();
        const viewportWidth = window.innerWidth;
        const viewportHeight = window.innerHeight;

        let left = x;
        let top = y + 40;

        if (left + panelRect.width > viewportWidth) {
            left = Math.max(8, viewportWidth - panelRect.width - 10);
        }
        if (top + panelRect.height > viewportHeight) {
            top = Math.max(8, viewportHeight - panelRect.height - 10);
        }

        colorPanel.style.left = left + 'px';
        colorPanel.style.top = top + 'px';
    }

    // Keyboard & Hotkeys
    document.addEventListener('keydown', (e) => {

        // Snap to Grid
        if (e.ctrlKey && e.key.toLowerCase() === 't') {
            snapLayoutToGrid(10);
            saveState();
        }

        // Reset to Default
        if (e.ctrlKey && e.key.toLowerCase() === "r") {
            e.preventDefault();
            resetToDefault();
            saveState();
        }

        // Unhide all
        if (e.key === 'Home') {
            Object.values(btnEls).forEach(b => {
                b.style.display = 'flex';
                appState.buttons[b.dataset.btn] = appState.buttons[b.dataset.btn] || {};
                appState.buttons[b.dataset.btn].display = 'flex';
            });
            eightWayWrapper.style.display = 'block';
            appState.joystick.display = 'block';
            appState.base.display = 'block';
            stickWrapper.style.display = 'block';
            base.style.display = 'block';
            appState.hiddenButtons = [];
            saveState();
            showToast('Show All Widgets', 1000);
            return;
        }

        // Call Save and Load Profile
        if (e.key.startsWith('F')) {
            const n = parseInt(e.key.slice(1));
            if (n >= 1 && n <= PROFILE_COUNT) {
                if (e.ctrlKey) {
                    saveProfile(n);
                    showToast('Profile ' + n + ' saved', 1000);
                } else {
                    loadProfile(n);
                    // showToast('Profile ' + n + ' loaded', 1000);
                }
            }
        }

        // Load layout from file
        if (e.ctrlKey && e.key.toLowerCase() === 'o') {
            e.preventDefault();
            importInput.click();
            return;
        }
        if (e.ctrlKey && e.key.toLowerCase() === 'c') {
            e.preventDefault();
            copyLayoutToClipboard();
            return;
        }

        // ctrl + [ / ] font size
        if (e.ctrlKey && (e.key === '[' || e.key === ']')) {
            if (selected) {
                if (selected === eightWayWrapper) {
                    arrowSize += (e.key === ']') ? 5 : -5;
                    arrowSize = Math.max(20, arrowSize); // minimum size
                    applyArrowSize();
                    appState.eightWayWrapper = appState.eightWayWrapper || {};
                    appState.eightWayWrapper.arrowSize = arrowSize;
                    saveState();
                    showToast("Arrow size: " + arrowSize + "px", 1000);

                } else if (selected.classList.contains("btn")) {
                    const cs = window.getComputedStyle(selected);
                    let fs = parseInt(cs.fontSize) || 30;
                    fs += (e.key === ']') ? 1 : -1;
                    fs = Math.max(6, fs);
                    selected.style.fontSize = fs + "px";

                    appState.buttons[selected.dataset.btn] =
                        appState.buttons[selected.dataset.btn] || {};
                    appState.buttons[selected.dataset.btn].fontSize = selected.style.fontSize;
                    saveState();
                    showToast("Font size: " + fs, 1000);

                    // optional background scaling
                    if (selected.style.backgroundImage && selected.style.backgroundImage !== "none") {
                        const bgSize = parseInt(cs.backgroundSize) || fs * 2;
                        const newBgSize = Math.max(10, bgSize + (e.key === "]" ? 2 : -2));
                        selected.style.backgroundSize = newBgSize + "px auto";
                        appState.buttons[selected.dataset.btn].backgroundSize = selected.style.backgroundSize;
                        saveState();
                        showToast("Symbol size: " + newBgSize, 1000);
                    }
                    saveState();
                }
            }
            e.preventDefault();
            return;
        }

        // Border radius
        if (!e.ctrlKey && (e.key === '[' || e.key === ']')) {
            if (selected && selected.id !== "stickWrapper" && selected.id !== "eightWayWrapper") {
                const cs = window.getComputedStyle(selected);
                let br = parseInt(cs.borderRadius) || 0;
                br += (e.key === ']') ? 10 : -10;
                br = Math.max(0, br);

                const maxBr = Math.max(selected.offsetWidth, selected.offsetHeight) / 2;
                br = Math.min(br, maxBr);

                selected.style.borderRadius = br + "px";

                if (selected.dataset && selected.dataset.btn) {
                    appState.buttons[selected.dataset.btn] =
                        appState.buttons[selected.dataset.btn] || {};
                    appState.buttons[selected.dataset.btn].borderRadius =
                        selected.style.borderRadius;
                }
                saveState();
                showToast("Border radius: " + br, 1000);
            }
            e.preventDefault();
            return;
        }

        // Delete a.k.a. Hide selected
        if (e.key === 'Delete') {
            if (selected) {
                const isEditing = selected.querySelector('input');
                if (!isEditing) {
                    if (selected === base) {
                        selected.style.display = 'none';
                        appState.base.display = 'none';
                        showToast("Base hidden", 1000);
                    } else if (selected === stickWrapper) {
                        selected.style.display = 'none';
                        appState.joystick.display = 'none';
                        showToast("Joystick hidden", 1000);
                    } else if (selected === eightWayWrapper) {
                        selected.style.display = 'none';
                        appState.eightWayWrapper.display = 'none';
                        showToast("8-way direction hidden", 1000);
                    } else if (selected.classList && selected.classList.contains('btn')) {
                        selected.style.display = 'none';
                        const name = selected.dataset.btn;
                        if (!appState.hiddenButtons.includes(name)) appState.hiddenButtons.push(name);
                        appState.buttons[name] = appState.buttons[name] || {};
                        appState.buttons[name].display = 'none';
                        showToast("Button hidden", 1000);
                    }
                    deselect();
                    saveState();
                }
            }
            e.preventDefault();
            return;
        }

        // Movement & Resize
        if (selected) {
            const cs = window.getComputedStyle(selected);
            let top = parseInt(cs.top) || 0;
            let left = parseInt(cs.left) || 0;
            let width = parseInt(cs.width) || selected.offsetWidth || 0;
            let height = parseInt(cs.height) || selected.offsetHeight || 0;
            let updated = false;

            if (e.shiftKey) {
                // Resize from center
                const centerX = left + width / 2;
                const centerY = top + height / 2;

                if (e.key === 'ArrowUp') height += 10;
                if (e.key === 'ArrowDown') height = Math.max(10, height - 10);
                if (e.key === 'ArrowRight') width += 10;
                if (e.key === 'ArrowLeft') width = Math.max(10, width - 10);

                // Make square if it's stickWrapper or eightWayWrapper
                if (selected === stickWrapper || selected === eightWayWrapper) {
                    let newSize;
                    if (e.key === 'ArrowUp' || e.key === 'ArrowRight') {
                        newSize = Math.max(width, height); // expand
                    } else {
                        newSize = Math.min(width, height); // shrink
                    }
                    width = Math.max(10, newSize);
                    height = Math.max(10, newSize);
                }

                selected.style.width = width + 'px';
                selected.style.height = height + 'px';
                selected.style.left = (centerX - width / 2) + 'px';
                selected.style.top = (centerY - height / 2) + 'px';

                // Persist size/position for buttons as well
                if (selected.classList && selected.classList.contains('btn')) {
                    const name = selected.dataset.btn;
                    appState.buttons[name] = appState.buttons[name] || {};
                    appState.buttons[name].width = selected.style.width;
                    appState.buttons[name].height = selected.style.height;
                    appState.buttons[name].top = selected.style.top;
                    appState.buttons[name].left = selected.style.left;
                }

                saveState();
                showToast(`height: ${height}, width: ${width}`, 1000);
                updated = true;

            } else {
                // Normal movement
                if (e.key === 'ArrowUp') {
                    top -= 10;
                    updated = true;
                }
                if (e.key === 'ArrowDown') {
                    top += 10;
                    updated = true;
                }
                if (e.key === 'ArrowLeft') {
                    left -= 10;
                    updated = true;
                }
                if (e.key === 'ArrowRight') {
                    left += 10;
                    updated = true;
                }

                if (updated) {
                    selected.style.top = Math.max(0, top) + 'px';
                    selected.style.left = Math.max(0, left) + 'px';
                    saveState();
                    showToast(`x: ${left}, y: ${top}`, 1000);
                }
            }

            if (updated) {
                if (selected === stickWrapper) {
                    resizeCanvas();
                    joystick.style.left = (width / 2) + 'px';
                    joystick.style.top = (height / 2) + 'px';

                    appState.joystick.top = selected.style.top;
                    appState.joystick.left = selected.style.left;
                    appState.joystick.width = selected.style.width;
                    appState.joystick.height = selected.style.height;

                } else if (selected === eightWayWrapper) {
                    appState.eightWayWrapper.top = selected.style.top;
                    appState.eightWayWrapper.left = selected.style.left;
                    appState.eightWayWrapper.width = selected.style.width;
                    appState.eightWayWrapper.height = selected.style.height;
                } else if (selected.classList && selected.classList.contains('btn')) {
                    // Persist button position for normal arrow-key moves
                    const name = selected.dataset.btn;
                    appState.buttons[name] = appState.buttons[name] || {};
                    appState.buttons[name].top = selected.style.top;
                    appState.buttons[name].left = selected.style.left;
                }
                saveState();
            }
        }
    });
    // End of Keyboard Shortcut Listener

    function applyLayout(parsed) {
        if (parsed.base) {
            appState.base = {
                ...parsed.base
            };
            applyElement(base, parsed.base);
            if (parsed.base.display !== undefined) base.style.display = parsed.base.display;
        }
        if (parsed.joystick) {
            appState.joystick = {
                ...parsed.joystick
            };
            applyElement(stickWrapper, parsed.joystick);
            if (parsed.joystick.display !== undefined) stickWrapper.style.display = parsed.joystick.display;
        }
        if (parsed.eightWayWrapper) {
            appState.eightWayWrapper = {
                ...parsed.eightWayWrapper
            };
            applyElement(eightWayWrapper, parsed.eightWayWrapper);
            if (parsed.eightWayWrapper.display !== undefined) eightWayWrapper.style.display = parsed.eightWayWrapper.display;
            if (parsed.eightWayWrapper.arrowSize !== undefined) {
                arrowSize = parsed.eightWayWrapper.arrowSize;
                applyArrowSize();
            }
        }
        if (parsed.buttons) {
            Object.keys(parsed.buttons).forEach(k => {
                appState.buttons[k] = {
                    ...parsed.buttons[k]
                };
                if (btnEls[k]) {
                    applyElement(btnEls[k], parsed.buttons[k]);
                    if (parsed.buttons[k].display !== undefined) btnEls[k].style.display = parsed.buttons[k].display;
                }
            });
        }
        saveState();
    }

    async function resetToDefault() {
        try {
            const res = await fetch("layouts/default.json");
            if (!res.ok) throw new Error("default.json not found");
            const parsed = await res.json();
            applyLayout(parsed);
            showToast("Reset to default layout", 1000);
        } catch {
            showToast("Could not load default.json", 1000);
        }
    }

    // D-pad movement for selected via gamepad
    const elementMoveTimers = {
        up: 0,
        down: 0,
        left: 0,
        right: 0
    };
    const moveDelay = 120;
    const moveStep = 10;

	function handleDpadMovement(pad) {
		if (!pad) return -1; // neutral
		const now = performance.now();

		function moveSelected(dx, dy, key) {
			if (!selected) return;
			const cs = window.getComputedStyle(selected);
			let top = parseInt(cs.top) || 0;
			let left = parseInt(cs.left) || 0;
			top = Math.max(0, top + dy);
			left = Math.max(0, left + dx);
			selected.style.top = top + "px";
			selected.style.left = left + "px";

			if (selected.classList.contains('btn')) {
				const name = selected.dataset.btn;
				appState.buttons[name] = appState.buttons[name] || {};
				appState.buttons[name].top = selected.style.top;
				appState.buttons[name].left = selected.style.left;
			} else if (selected === stickWrapper) {
				appState.joystick.top = selected.style.top;
				appState.joystick.left = selected.style.left;
			} else if (selected === eightWayWrapper) {
				appState.eightWayWrapper.top = selected.style.top;
				appState.eightWayWrapper.left = selected.style.left;
			}

			saveState();
			showToast(`x:${left}, y:${top}`, 500);
			elementMoveTimers[key] = now;
		}
		// default to neutral
		let direction = -1;

		// XInput
		const dirs = [
			{ btn: 12, dx: 0, dy: -moveStep, key: 'up', idx: 6 },  // ↑
			{ btn: 13, dx: 0, dy:  moveStep, key: 'down', idx: 2 }, // ↓
			{ btn: 14, dx: -moveStep, dy: 0, key: 'left', idx: 4 }, // ←
			{ btn: 15, dx:  moveStep, dy: 0, key: 'right', idx: 0 } // →
		];
		const pressed = {};
		dirs.forEach(d => {
			if (pad.buttons[d.btn]?.pressed) {
				pressed[d.key] = true;
				if (now - elementMoveTimers[d.key] > moveDelay) {
					moveSelected(d.dx, d.dy, d.key);
				}
			}
		});
		// detect diagonals for XInput (combo presses)
		if (pressed.up && pressed.left) direction = 5;   // ↖
		else if (pressed.up && pressed.right) direction = 7; // ↗
		else if (pressed.down && pressed.left) direction = 3; // ↙
		else if (pressed.down && pressed.right) direction = 1; // ↘
		else if (pressed.up) direction = 6;
		else if (pressed.down) direction = 2;
		else if (pressed.left) direction = 4;
		else if (pressed.right) direction = 0;

		// PS / DirectInput fallback: axes[9] hat
		if (direction === -1 && pad.axes && pad.axes.length > 9) {
			const hat = pad.axes[9];
			if (typeof hat === "number") {
				if (now - elementMoveTimers['hat'] > moveDelay) {
					// Typical mapping:
					// -1 = up, -0.714 = up-right, -0.428 = right, -0.142 = down-right,
					// 0.142 = down, 0.428 = down-left, 0.714 = left, 1.0 = up-left
					const rounded = Math.round(hat * 7); // scale to -7..7
					switch (rounded) {
						case -7: direction = 6; moveSelected(0, -moveStep, 'hat'); break; // ↑
						case -5: direction = 7; moveSelected(moveStep, -moveStep, 'hat'); break; // ↗
						case -3: direction = 0; moveSelected(moveStep, 0, 'hat'); break; // →
						case -1: direction = 1; moveSelected(moveStep, moveStep, 'hat'); break; // ↘
						case 1:  direction = 2; moveSelected(0, moveStep, 'hat'); break; // ↓
						case 3:  direction = 3; moveSelected(-moveStep, moveStep, 'hat'); break; // ↙
						case 5:  direction = 4; moveSelected(-moveStep, 0, 'hat'); break; // ←
						case 7:  direction = 5; moveSelected(-moveStep, -moveStep, 'hat'); break; // ↖
					}
				}
			}
		}
		  const lx = pad.axes[0], ly = pad.axes[1];
		  if (Math.abs(lx) > 0.3 || Math.abs(ly) > 0.3) {
			const angle = Math.atan2(ly, lx); // radians
			const oct = Math.round(8 * angle / (2 * Math.PI) + 8) % 8;
			direction = oct; // 0=→, 2=↓, 4=←, 6=↑, odd=diagonals
		  }
		return direction; // -1 = neutral, 0–7 = 8-way
	}
	
	function handleStickMovement(pad) {
	  if (!pad) return;
	  const now = performance.now();

	  const lx = pad.axes[0] || 0;
	  const ly = pad.axes[1] || 0;
	  const rx = pad.axes[2] || 0;
	  const ry = pad.axes[3] || 0;

	  // --- element movement (deadzone, throttled) ---
	  if (selected) {
		if (Math.abs(lx) > 0.15 || Math.abs(ly) > 0.15) {
		  if (now - (elementMoveTimers['ls'] || 0) > moveDelay) {
			moveSelected(lx * moveStep, ly * moveStep, 'ls');
		  }
		}
		if (Math.abs(rx) > 0.15 || Math.abs(ry) > 0.15) {
		  if (now - (elementMoveTimers['rs'] || 0) > moveDelay) {
			moveSelected(rx * moveStep, ry * moveStep, 'rs');
		  }
		}
	  }
		// Use normalized stick values
		const ls = getAnalogStick(pad, 'left', cfg.deadzone, cfg.invertY);
		const rs = getAnalogStick(pad, 'right', cfg.deadzone, cfg.invertY);

		// Force tiny values to absolute 0 so they recenter
		const lsX = clampToZero(ls.x) * 8;
		const lsY = clampToZero(ls.y) * 8;
		if (btnEls['LS']) {
		  btnEls['LS'].style.transform = `translate(${lsX}px, ${lsY}px)`;
		}

		const rsX = clampToZero(rs.x) * 8;
		const rsY = clampToZero(rs.y) * 8;
		if (btnEls['RS']) {
		  btnEls['RS'].style.transform = `translate(${rsX}px, ${rsY}px)`;
		}
	}
	
	function clampToZero(val, eps = 0.001) {
	  return Math.abs(val) < eps ? 0 : val;
	}

    // Analog stick
    function getAnalogStick(pad, stick = 'left', deadzone = 0.05, invertY = false) {
        if (!pad) return { x: 0, y: 0 };

        const axisOffset = stick === 'left' ? 0 : 2;
        let x = pad.axes[axisOffset] || 0;
        let y = pad.axes[axisOffset + 1] || 0;
        if (invertY) y = -y;

        const mag = Math.hypot(x, y);
        if (mag < deadzone) return { x: 0, y: 0 }; // inside deadzone

        // Normalize stick to range 0-1 outside deadzone
        const scale = (mag - deadzone) / (1 - deadzone);
        return { x: (x / mag) * scale, y: (y / mag) * scale };
    }

    // Gamepad helpers, canvas, trail, markers
    function radialDeadzone(x, y, dz) {
        const mag = Math.hypot(x, y);
        if (mag < dz) return { x: 0, y: 0 };
        const s = (mag - dz) / (1 - dz);
        return { x: x * s / mag, y: y * s / mag };
    }

    function clampRoundedSquare(x, y, n = 8) {
        const mag = Math.pow(Math.abs(x), n) + Math.pow(Math.abs(y), n);
        if (mag > 1) {
            const scale = Math.pow(mag, -1 / n);
            return { x: x * scale, y: y * scale };
        }
        return { x, y };
    }

    function getStickXY(pad) {
        if (!pad) return { x: 0, y: 0 };
        let a = radialDeadzone(pad.axes[0] || 0, pad.axes[1] || 0, cfg.deadzone);
        let { x, y } = a;
        const up = pad.buttons[12]?.pressed ? 1 : 0;
        const down = pad.buttons[13]?.pressed ? 1 : 0;
        const leftBtn = pad.buttons[14]?.pressed ? 1 : 0;
        const rightBtn = pad.buttons[15]?.pressed ? 1 : 0;
        if (up || down || leftBtn || rightBtn) {
            y = (up ? -1 : 0) + (down ? 1 : 0);
            x = (leftBtn ? -1 : 0) + (rightBtn ? 1 : 0);
            if (x && y) {
                x *= 0.85;
                y *= 0.85;
            }
        }
        return clampRoundedSquare(x, cfg.invertY ? -y : y);
    }

    function positionEightWayArrows() {
        const rect = eightWayWrapper.getBoundingClientRect();
        const cx = rect.width / 2;
        const cy = rect.height / 2;
        const radius = Math.min(cx, cy) - 45; // 45 = half arrow size

        for (let i = 0; i < 8; i++) {
            const angle = (i * 45) * Math.PI / 180;
            const x = cx + radius * Math.cos(angle);
            const y = cy + radius * Math.sin(angle);
            const arrow = document.getElementById("arrow" + i);
            if (arrow) {
                arrow.style.left = x + "px";
                arrow.style.top = y + "px";
                arrow.style.transform = `translate(-50%, -50%) rotate(${i * 45}deg)`;
            }
        }
    }

    function applyArrowSize() {
        for (let i = 0; i < 8; i++) {
            const arrow = document.getElementById("arrow" + i);
            if (arrow) {
                arrow.style.width = arrowSize + "px";
                arrow.style.height = arrowSize + "px";
                arrow.style.transform = `translate(-50%, -50%) rotate(${i * 45}deg)`;
            }
        }
    }

    if (window.ResizeObserver) {
        const ro = new ResizeObserver(() => {
            positionEightWayArrows();
        });
        ro.observe(eightWayWrapper);
    }

    window.addEventListener("resize", positionEightWayArrows);

    function snapLayoutToGrid(grid = 10) {
        const snap = v => Math.round((parseInt(v) || 0) / grid) * grid + "px";

        function snapElement(el, store) {
            if (!el) return;
            const cs = getComputedStyle(el);

            // Snap position
            el.style.top = snap(cs.top);
            el.style.left = snap(cs.left);
            store.top = el.style.top;
            store.left = el.style.left;

            // Snap border-radius
            let br = parseInt(cs.borderRadius) || 0;
            if (br > 0) {
                const maxBr = Math.max(el.offsetWidth, el.offsetHeight) / 2;
                br = Math.min(br, maxBr);

                // Snap to grid
                br = Math.round(br / grid) * grid;
                br = Math.min(br, maxBr); // ensure we don't exceed max after snapping

                el.style.borderRadius = br + "px";
                store.borderRadius = el.style.borderRadius;
            }
        }

        // Snap all buttons
        Object.entries(btnEls).forEach(([k, el]) => {
            appState.buttons[k] = appState.buttons[k] || {};
            snapElement(el, appState.buttons[k]);
        });

        // Snap main objects
        snapElement(stickWrapper, appState.joystick);
        snapElement(eightWayWrapper, appState.eightWayWrapper);
        snapElement(base, appState.base);

        saveState();
        showToast("Snapped layout to grid!", 1000);
    }

    function detectActiveGamepad() {
        const gps = navigator.getGamepads ? navigator.getGamepads() : [];
        for (let i = 0; i < gps.length; i++) {
            const p = gps[i];
            if (!p) continue;
            const anyBtn = p.buttons.some(b => b.pressed);
            const anyAx = p.axes.some(a => Math.abs(a) > cfg.deadzone);
            if (anyBtn || anyAx) return i;
        }
        return null;
    }

    function updateButtonsFromPad(pad) {
        if (!pad || !pad.buttons) {
            resetJoystick();
            Object.values(btnEls).forEach(b => b.classList.remove('active'));
            return;
        }

        let anyPressed = false;
        for (const key in btnEls) {
            const idx = map[key];
            if (idx === undefined) continue;
            const DEADZONE = 0.45;

            let raw = pad.buttons[idx]?.value || 0;
            let val = raw < DEADZONE ? 0 : raw;

            if (key === "LTTRIGGER" || key === "RTTRIGGER") {
                const isActive = val > DEADZONE;
                btnEls[key].classList.toggle('active', isActive);

                if (val < DEADZONE) {
                    btnEls[key].style.filter = "brightness(1.0)";
                    btnEls[key].style.transform = "scale(1)";
                } else {
                    btnEls[key].style.filter = `brightness(${1.0 + val * 2.5})`;
                    btnEls[key].style.transform = `scale(${1 + val * 0.08})`;
                }
                if (isActive) {
                    anyPressed = true;
                    lastPressedTimes[key] = performance.now();
                }
            } else {
                const pressed = !!pad.buttons[idx]?.pressed;
                btnEls[key].classList.toggle('active', pressed);
                if (pressed && !cfg.ignoredForJoystick.includes(key)) {
                    anyPressed = true;
                    lastPressedTimes[key] = performance.now();
                }
            }
        }

        // Joystick display logic (unchanged)
        if (anyPressed) {
            let active = null,
                latest = -1;
            for (const k in lastPressedTimes) {
                if (btnEls[k].classList.contains('active') &&
                    !cfg.ignoredForJoystick.includes(k) &&
                    lastPressedTimes[k] > latest) {
                    latest = lastPressedTimes[k];
                    active = k;
                }
            }
            if (active) {
                const cs = getComputedStyle(btnEls[active]);
                joystick.style.transform = 'translate(-50%,-50%) scale(1.25)';
                joystick.textContent = btnEls[active].textContent || active;
                joystick.style.background = cs.backgroundColor;
                joystick.style.color = cs.color;
                return;
            }
        }
        saveState();
        resetJoystick();
    }


    function resetJoystick() {
        joystick.style.transform = 'translate(-50%,-50%) scale(1)';
        joystick.textContent = '';
        joystick.style.background = 'rgba(120,120,120,1)'; // default
        joystick.style.color = '#000';
    }

    function resizeCanvas() {
        canvas.width = stickWrapper.clientWidth;
        canvas.height = stickWrapper.clientHeight;
    }
    window.addEventListener('resize', resizeCanvas);
    resizeCanvas();

    function drawTrail(tr) {
        ctx.clearRect(0, 0, canvas.width, canvas.height);
        if (!tr || tr.length < 2) return;
        const cx = canvas.width / 2,
            cy = canvas.height / 2,
            cr = Math.min(canvas.width, canvas.height) / 2 - 12;
        const trailColor = getComputedStyle(document.documentElement).getPropertyValue('--trail-color')?.trim() || appState.trailColor || '#CEEC73';
        for (let i = 1; i < tr.length; i++) {
            const p0 = tr[i - 1],
                p1 = tr[i],
                t = i / tr.length;
            const x0 = cx + p0.x * cr,
                y0 = cy + p0.y * cr;
            const x1 = cx + p1.x * cr,
                y1 = cy + p1.y * cr;
            if (!isFinite(x0) || !isFinite(y0) || !isFinite(x1) || !isFinite(y1)) continue;
            ctx.beginPath();
            ctx.moveTo(x0, y0);
            ctx.lineTo(x1, y1);
            ctx.lineWidth = 12 * (t * 2);
            ctx.lineCap = 'round';
            ctx.strokeStyle = trailColor;
            ctx.stroke();
        }
    }

    // Profiles
    function saveProfile(n) {
        if (n < 1 || n > PROFILE_COUNT) return;
        const snap = {
            base: captureElement(base),
            joystick: captureElement(stickWrapper),
            eightWayWrapper: captureElement(eightWayWrapper),
            buttons: {}
        };
        Object.keys(btnEls).forEach(k => snap.buttons[k] = captureElement(btnEls[k]));
        appState.profiles['profile' + n] = snap;
        appState.lastProfile = n;
        saveState();
    }

    function loadProfile(n) {
        const snap = appState.profiles['profile' + n];
        if (!snap) {
            showToast('Profile ' + n + ' empty', 1000);
            return;
        }
        if (snap.base) {
            applyElement(base, snap.base);
            appState.base = Object.assign(appState.base, snap.base);
            if (snap.base.display !== undefined) base.style.display = snap.base.display;
        }
        if (snap.joystick) {
            applyElement(stickWrapper, snap.joystick);
            appState.joystick = Object.assign(appState.joystick, snap.joystick);
            if (snap.joystick.display !== undefined) stickWrapper.style.display = snap.joystick.display;
        }
        if (snap.eightWayWrapper) {
            applyElement(eightWayWrapper, snap.eightWayWrapper);
            appState.eightWayWrapper = Object.assign(appState.eightWayWrapper, snap.eightWayWrapper);
            if (snap.eightWayWrapper.display !== undefined) {
                eightWayWrapper.style.display = snap.eightWayWrapper.display;
            }
            if (snap.eightWayWrapper.arrowSize !== undefined) {
                arrowSize = snap.eightWayWrapper.arrowSize;
                applyArrowSize();
            }
        }
		if (snap.buttons) Object.keys(snap.buttons).forEach(k => {
			if (btnEls[k]) {
				applyElement(btnEls[k], snap.buttons[k]);
				appState.buttons[k] = Object.assign(appState.buttons[k] || {}, snap.buttons[k]);
			}
		});
        appState.lastProfile = n;
        showToast('Profile ' + n + ' loaded', 1000);
        saveState();
    }

    // layout save/import/export
    function saveLayoutToFile() {
        const snap = {
            base: captureElement(base),
            joystick: captureElement(stickWrapper),
            eightWayWrapper: captureElement(eightWayWrapper),
            buttons: {}
        };
        Object.keys(btnEls).forEach(k => snap.buttons[k] = captureElement(btnEls[k]));
        const json = JSON.stringify(snap, null, 2);
        const blob = new Blob([json], { type: 'application/json' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = 'layout.json';
        document.body.appendChild(a);
        a.click();
        a.remove();
        URL.revokeObjectURL(url);
    }

    async function copyLayoutToClipboard() {
        const snap = {
            base: captureElement(base),
            joystick: captureElement(stickWrapper),
            eightWayWrapper: captureElement(eightWayWrapper),
            buttons: {}
        };

        Object.keys(btnEls).forEach(k => {
            const el = btnEls[k];
            const style = getComputedStyle(el);

            if (style.display === "none") {
                // Only export the display property
                snap.buttons[k] = { display: "none" };
            } else {
                snap.buttons[k] = captureElement(el);
            }
        });

        const json = JSON.stringify(snap, null, 2);

        if (navigator.clipboard && navigator.clipboard.writeText) {
            try {
                await navigator.clipboard.writeText(json);
                showToast('Copied layout to clipboard', 1000);
            } catch (e) {
                console.warn(e);
                showToast('Copy failed', 1000);
            }
        } else {
            const ta = document.getElementById('clipboardInput');
            ta.value = json;
            ta.select();
            try {
                document.execCommand('copy');
                showToast('Copied layout to clipboard', 1000);
            } catch (e) {
                showToast('Copy failed', 1000);
            }
        }
        saveState();
    }

    // Import (file input + drag drop)
    const importInput = document.createElement('input');
    importInput.type = 'file';
    importInput.accept = '.json,application/json';
    importInput.style.display = 'none';
    document.body.appendChild(importInput);
    importInput.addEventListener('change', e => {
        const f = e.target.files && e.target.files[0];
        if (!f) return;
        const r = new FileReader();
        r.onload = ev => {
            try {
                const parsed = JSON.parse(ev.target.result);
                if (parsed.base) {
                    appState.base = appState.base || {};
                    Object.assign(appState.base, parsed.base);
                    applyElement(base, parsed.base);
                    if (parsed.base.display !== undefined) base.style.display = parsed.base.display;
                }
                if (parsed.joystick) {
                    appState.joystick = appState.joystick || {};
                    Object.assign(appState.joystick, parsed.joystick);
                    applyElement(stickWrapper, parsed.joystick);
                    if (parsed.joystick.display !== undefined) stickWrapper.style.display = parsed.joystick.display;
                }
                if (parsed.eightWayWrapper) {
                    appState.eightWayWrapper = appState.eightWayWrapper || {};
                    Object.assign(appState.eightWayWrapper, parsed.eightWayWrapper);
                    applyElement(eightWayWrapper, parsed.eightWayWrapper);
                    if (parsed.eightWayWrapper.display !== undefined) eightWayWrapper.style.display = parsed.eightWayWrapper.display;
                }
                if (parsed.buttons) {
                    Object.keys(parsed.buttons).forEach(k => {
                        appState.buttons[k] = appState.buttons[k] || {};
                        Object.assign(appState.buttons[k], parsed.buttons[k]);
                        if (btnEls[k]) {
                            applyElement(btnEls[k], parsed.buttons[k]);
                            if (parsed.buttons[k].display !== undefined) btnEls[k].style.display = parsed.buttons[k].display;
                        }
                    });
                }
                saveState();
                showToast('Imported layout', 1000);
            } catch (err) {
                showToast('Invalid JSON', 1000);
            }
        };
        r.readAsText(f);
        importInput.value = '';
    });

    window.addEventListener('dragover', e => e.preventDefault());
    window.addEventListener('drop', e => {
        e.preventDefault();
        if (e.dataTransfer && e.dataTransfer.files && e.dataTransfer.files[0]) {
            const f = e.dataTransfer.files[0];
            if (f.type.includes('json') || f.name.toLowerCase().endsWith('.json')) {
                const r = new FileReader();
                r.onload = ev => {
                    try {
                        const parsed = JSON.parse(ev.target.result);
                        if (parsed.base) {
                            appState.base = appState.base || {};
                            Object.assign(appState.base, parsed.base);
                            applyElement(base, parsed.base);
                            if (parsed.base.display !== undefined) base.style.display = parsed.base.display;
                        }
                        if (parsed.joystick) {
                            appState.joystick = appState.joystick || {};
                            Object.assign(appState.joystick, parsed.joystick);
                            applyElement(stickWrapper, parsed.joystick);
                            if (parsed.joystick.display !== undefined) stickWrapper.style.display = parsed.joystick.display;
                        }
                        if (parsed.eightWayWrapper) {
                            appState.eightWayWrapper = appState.eightWayWrapper || {};
                            Object.assign(appState.eightWayWrapper, parsed.eightWayWrapper);
                            applyElement(eightWayWrapper, parsed.eightWayWrapper);
                            if (parsed.eightWayWrapper.display !== undefined) eightWayWrapper.style.display = parsed.eightWayWrapper.display;
                        }
                        if (parsed.buttons) {
                            Object.keys(parsed.buttons).forEach(k => {
                                appState.buttons[k] = appState.buttons[k] || {};
                                Object.assign(appState.buttons[k], parsed.buttons[k]);
                                if (btnEls[k]) {
                                    applyElement(btnEls[k], parsed.buttons[k]);
                                    if (parsed.buttons[k].display !== undefined) btnEls[k].style.display = parsed.buttons[k].display;
                                }
                            });
                        }
                        saveState();
                        showToast('Imported layout', 1000);
                    } catch (err) {
                        showToast('Invalid JSON', 1000);
                    }
                };
                r.readAsText(f);
            } else showToast('Only JSON layout files are accepted', 1000);
        }
    });

    // Load help panel contents from help.html
    fetch("help.html")
        .then(r => r.text())
        .then(html => {
            document.getElementById("helpPanel").innerHTML = html;
        })
        .catch(err => console.warn("Could not load help.html", err));
    showToast("Help file not found!", 800);
    const helpPanel = document.getElementById("helpPanel");

    // Show on Tab down, hide on Tab up
    document.addEventListener("keydown", e => {
        if (e.key === "Tab") {
            e.preventDefault(); // prevent focus switching
            helpPanel.style.display = "block";
        }
    });
    document.addEventListener("keyup", e => {
        if (e.key === "Tab") {
            helpPanel.style.display = "none";
        }
    });

    // Animation Loop
	function animate() {
		activeGamepadIndex = detectActiveGamepad();
		const pad = (navigator.getGamepads && activeGamepadIndex !== null) 
			? navigator.getGamepads()[activeGamepadIndex] 
			: null;
		updateButtonsFromPad(pad);
		const dpadDir = handleDpadMovement(pad);
		updateArrowHighlights(dpadDir);		

		// Stick movement
		const { x, y } = getStickXY(pad);
		const cx = canvas.width / 2, cy = canvas.height / 2;
		const radius = canvas.width / 2 - 25;
		const jx = cx + x * radius, jy = cy + y * radius;
		joystick.style.left = jx + 'px';
		joystick.style.top = jy + 'px';

		// Trail drawing
		trail.push({ x, y });
		if (trail.length > cfg.trail) trail.shift();
		drawTrail(trail);
handleStickMovement(pad);
		// Update markers (0–7 = 8 directions)
		for (let i = 0; i < markers.length; i++) {
			markers[i].classList.toggle('active', i === dpadDir);
		}
		requestAnimationFrame(animate);
	}

    // Boot
    loadState();
    applyState(); 

    resizeCanvas();
    joystick.style.left = (canvas.width / 2) + 'px';
    joystick.style.top = (canvas.height / 2) + 'px';

    // Resize Observer to recenter joystick when stickWrapper size changes
    if (window.ResizeObserver) {
        const ro = new ResizeObserver(() => {
            resizeCanvas();
            joystick.style.left = (canvas.width / 2) + 'px';
            joystick.style.top = (canvas.height / 2) + 'px';
        });
        ro.observe(stickWrapper);
    }
    animate();
    showToast('Click Interact to start customizing', 5000);

    // expose some helpers
    window.trailpad = {
        saveState,
        loadState,
        copyLayoutToClipboard
    };
    setInterval(saveState, 5000);
});
