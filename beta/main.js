window.addEventListener('DOMContentLoaded', () => {
    const STORAGE_KEY = 'trailpad_1';
    const PROFILE_COUNT = 8;
	
    const map = {
        A: 0,
        B: 1,
        X: 2,
        Y: 3,
        LB: 4,
        RB: 5,
        LT: 6,
        RT: 7,
        View: 8,
        Menu: 9,
        LS: 10,
        RS: 11,
        Up: 12,
        Down: 13,
        Left: 14,
        Right: 15
    };
    const cfg = {
        deadzone: 0.1,
        trail: 8,
        invertY: false,
        ignoredForJoystick: ['View', 'Menu', 'LS', 'RS', 'Up', 'Down', 'Left', 'Right']
    };
	
    // DOM
    const btnEls = {};
    document.querySelectorAll('.btn').forEach(el => btnEls[el.dataset.btn] = el);
    const base = document.getElementById('base');
    const stickWrapper = document.getElementById('stickWrapper');
    const joystick = document.getElementById('joystickHead');
    const canvas = document.getElementById('stickCanvas');
    const ctx = canvas.getContext('2d');
    const colorPanel = document.getElementById('colorPanel');
    const toastEl = document.getElementById('toast');
    const markers = Array.from({
        length: 8
    }, (_, i) => document.getElementById('marker' + i));
	
    // state
    let appState = {
        buttons: {},
        joystick: {},
        base: {},
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

    function saveState() {
        try {
            localStorage.setItem(STORAGE_KEY, JSON.stringify(appState));
        } catch (e) {
            console.warn(e);
        }
    }

    function loadState() {
        try {
            const raw = localStorage.getItem(STORAGE_KEY);
            if (raw) appState = Object.assign(appState, JSON.parse(raw));
        } catch (e) {
            console.warn(e);
        }
    }

    function showToast(msg, dur = 1000) {
        toastEl.textContent = msg;
        toastEl.style.transform = 'translate(-50%,0) scale(1)';
        clearTimeout(toastEl._t);
        toastEl._t = setTimeout(() => toastEl.style.transform = 'translate(-50%,0) scale(0)', dur);
    }

    function applyElement(el, data) {
        if (!el || !data) return;
        if (data.top !== undefined) el.style.top = data.top;
        if (data.left !== undefined) el.style.left = data.left;
        if (data.width !== undefined) el.style.width = data.width;
        if (data.height !== undefined) el.style.height = data.height;
        if (data.borderRadius !== undefined) el.style.borderRadius = data.borderRadius;
		if (data.outline !== undefined) el.style.outline = data.outline;
		if (data.outlineOffset !== undefined) el.style.outlineOffset = data.outlineOffset;
		if (data.boxShadow !== undefined) el.style.boxShadow = data.boxShadow;		
        if (data.backgroundColor !== undefined) el.style.backgroundColor = data.backgroundColor;
		if (data.backgroundImage !== undefined) el.style.backgroundImage = data.backgroundImage;
        if (data.color !== undefined) el.style.color = data.color;
        if (data.fontSize !== undefined) el.style.fontSize = data.fontSize;
        if (data.label !== undefined && el.dataset && el.dataset.btn) el.textContent = data.label;
        if (data.display !== undefined) el.style.display = data.display;
    }

    function captureElement(el) {
        const cs = window.getComputedStyle(el);
        return {
            top: cs.top,
            left: cs.left,
            width: cs.width,
            height: cs.height,
            borderRadius: cs.borderRadius,
			outline: cs.outline,
			outlineOffset: cs.outlineOffset,
			boxShadow: cs.boxShadow,
            display: cs.display,
            backgroundColor: cs.backgroundColor,
			backgroundImage: cs.backgroundImage,
            color: cs.color,
            fontSize: cs.fontSize,
            label: (el.textContent || '').trim()
        };
    }

    function applyState() {
        Object.keys(btnEls).forEach(k => {
            const el = btnEls[k];
            const data = appState.buttons[k] || {};
            applyElement(el, data);
			
			// Ensure display + backgroundImage are applied
			if (data.display !== undefined) {
				el.style.display = data.display;
			} else {
				el.style.display = appState.hiddenButtons?.includes(k) ? 'none' : (getComputedStyle(el).display || 'flex');
			}

			if (data.backgroundImage !== undefined) {
				el.style.backgroundImage = data.backgroundImage;
			}
        });
        if (appState.joystick) applyElement(stickWrapper, appState.joystick);
        if (appState.base) applyElement(base, appState.base);

        // prefer per-button display if present
        Object.keys(btnEls).forEach(k => {
            const data = appState.buttons[k] || {};
            if (data.display !== undefined) btnEls[k].style.display = data.display;
            else btnEls[k].style.display = appState.hiddenButtons && appState.hiddenButtons.includes(k) ? 'none' : getComputedStyle(btnEls[k]).display || 'flex';
        });

        if (appState.joystick && appState.joystick.display !== undefined) stickWrapper.style.display = appState.joystick.display;
        if (appState.base && appState.base.display !== undefined) base.style.display = appState.base.display;

        if (appState.trailColor) document.documentElement.style.setProperty('--trail-color', appState.trailColor);

        resizeCanvas();
        joystick.style.left = (canvas.width / 2) + 'px';
        joystick.style.top = (canvas.height / 2) + 'px';
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

    document.addEventListener('mousedown', (e) => {
        if (colorPanel.contains(e.target)) return;
        const topEl = document.elementFromPoint(e.clientX, e.clientY);
        const isOnUI = !!topEl?.closest?.('.btn') || !!topEl?.closest?.('#stickWrapper') || !!topEl?.closest?.('#base');
        if (isOnUI) return;
        const br = base.getBoundingClientRect();
        if (e.clientX >= br.left && e.clientX <= br.right && e.clientY >= br.top && e.clientY <= br.bottom) {
            selectElement(base);
            return;
        }
        deselect();
    });

    base.addEventListener('mousedown', e => {
        selectElement(base);
        e.stopPropagation();
    });
    base.addEventListener('contextmenu', e => {
        e.preventDefault();
		selectElement(base);
        openColorPanel(base, e.pageX, e.pageY);
    });
    stickWrapper.addEventListener('mousedown', e => {
        selectElement(stickWrapper);
        e.stopPropagation();
    });
    stickWrapper.addEventListener('contextmenu', e => {
        e.preventDefault();
		selectElement(stickWrapper);
        openColorPanel(stickWrapper, e.pageX, e.pageY);
    });

    Object.values(btnEls).forEach(btn => {
        btn.addEventListener('click', e => {
            selectElement(btn);
            lastPressedTimes[btn.dataset.btn] = performance.now();
            showToast(btn.dataset.btn, 600);
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
                btn.textContent = input.value.trim();
                btn.removeChild(input);
                appState.buttons[btn.dataset.btn] = appState.buttons[btn.dataset.btn] || {};
                appState.buttons[btn.dataset.btn].label = btn.textContent;
                saveState();
            }
            input.addEventListener('blur', save);
            input.addEventListener('keydown', ev => {
                if (ev.key === 'Enter') save();
                if (ev.key === 'Escape') {
                    btn.removeChild(input);
                    btn.textContent = old;
                }
            });
            e.stopPropagation();
        });
    });

    // color panel
	const palette = [
	"#FFE5E5","#FFB3B3","#FF8080","#FF4D4D","#E60000","#B30000","#800000","#4D0000",
	"#FFF0E5","#FFD1B3","#FFB380","#FF944D","#FF6600","#CC5200","#993D00","#662900",
	"#FFFDE5","#FFF7B3","#FFF080","#FFEA4D","#FFD700","#CCAC00","#998200","#665700",
	"#F5FFE5","#E0FFB3","#CCFF80","#B8FF4D","#99FF00","#77CC00","#559900","#336600",
	"#E5FFE5","#B3FFB3","#80FF80","#4DFF4D","#00E600","#00B300","#008000","#004D00",
	"#E5FFF9","#B3FFF0","#80FFE6","#4DFFDB","#00E6CC","#00B3A0","#008073","#004D47",
	"#E5F9FF","#B3EDFF","#80E0FF","#4DD3FF","#00BFFF","#0099CC","#007399","#004D66",
	"#E5EFFF","#B3CCFF","#8099FF","#4D66FF","#0033FF","#0029CC","#001F99","#001466",
	"#F0E5FF","#D1B3FF","#B380FF","#944DFF","#6600FF","#5200CC","#3D0099","#290066",
	"#FFE5F7","#FFB3E6","#FF80D6","#FF4DC5","#FF00AA","#CC0088","#990066","#660044",
	"#FFFFFF","#E6E6E6","#CCCCCC","#999999","#666666","#333333","#1A1A1A","#000000",
	"#00000000"
	];

// Remember last selected color panel mode
let colorMode = localStorage.getItem('colorMode') || 'bg';

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

    // Swatch container (grid)
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
                } else if (applyTarget === stickWrapper) appState.joystick.backgroundColor = c;
                else if (applyTarget === base) appState.base.backgroundColor = c;
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

// Make sure outlineWidth is defined globally or computed from a slider
let outlineWidth = 4; // default thickness


    document.addEventListener('mousedown', (e) => {
        if (!colorPanel.contains(e.target)) {
            colorPanel.style.display = 'none';
            revertPreview();
        }
    });

    // keyboard & hotkeys
    document.addEventListener('keydown', (e) => {
        if (e.key === 'Home') {
            Object.values(btnEls).forEach(b => {
                b.style.display = 'flex';
                appState.buttons[b.dataset.btn] = appState.buttons[b.dataset.btn] || {};
                appState.buttons[b.dataset.btn].display = 'flex';
            });
            stickWrapper.style.display = 'block';
            appState.joystick.display = 'block';
            base.style.display = 'block';
            appState.base.display = 'block';
            appState.hiddenButtons = [];
            saveState();
            showToast('Show All Widgets', 900);
            return;
        }
        if (e.key.startsWith('F')) {
            const n = parseInt(e.key.slice(1));
            if (n >= 1 && n <= PROFILE_COUNT) {
                if (e.ctrlKey) {
                    saveProfile(n);
                    showToast('Profile ' + n + ' saved', 800);
                } else {
                    loadProfile(n);
                    // showToast('Profile ' + n + ' loaded', 800);
                }
            }
        }
        if (e.ctrlKey && e.key.toLowerCase() === 's') {
            e.preventDefault();
            saveLayoutToFile();
            return;
        }
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
            if (selected && selected.classList.contains('btn')) {
                const cs = window.getComputedStyle(selected);
                let fs = parseInt(cs.fontSize) || 36;
                fs += (e.key === ']') ? 2 : -2;
                fs = Math.max(6, fs);
                selected.style.fontSize = fs + 'px';
                appState.buttons[selected.dataset.btn] = appState.buttons[selected.dataset.btn] || {};
                appState.buttons[selected.dataset.btn].fontSize = selected.style.fontSize;
                saveState();
            }
            e.preventDefault();
            return;
        }

        // border radius
        if (!e.ctrlKey && (e.key === '[' || e.key === ']')) {
            if (selected) {
                const cs = window.getComputedStyle(selected);
                let br = parseInt(cs.borderRadius) || 0;
                br += (e.key === ']') ? 10 : -10;
                br = Math.max(0, br);
                selected.style.borderRadius = br + 'px';
                if (selected.dataset && selected.dataset.btn) appState.buttons[selected.dataset.btn] = appState.buttons[selected.dataset.btn] || {}, appState.buttons[selected.dataset.btn].borderRadius = selected.style.borderRadius;
                else if (selected === stickWrapper) appState.joystick.borderRadius = selected.style.borderRadius;
                saveState();
            }
            e.preventDefault();
            return;
        }

        // delete -> hide selected
		if (e.key === 'Delete') {
			if (selected) {
				const isEditing = selected.querySelector('input');
				if (!isEditing) {
					if (selected === base) {
						selected.style.display = 'none';
						appState.base.display = 'none';
					} else if (selected === stickWrapper) {
						selected.style.display = 'none';
						appState.joystick.display = 'none';
					} else if (selected.classList && selected.classList.contains('btn')) {
						selected.style.display = 'none';
						const name = selected.dataset.btn;
						if (!appState.hiddenButtons.includes(name)) appState.hiddenButtons.push(name);
						appState.buttons[name] = appState.buttons[name] || {};
						appState.buttons[name].display = 'none';
					}
					deselect();
					saveState();
				}
			}
			e.preventDefault();
			return;
		}

        // movement & resize
        if (selected) {
            const cs = window.getComputedStyle(selected);
            let top = parseInt(cs.top) || 0,
                left = parseInt(cs.left) || 0,
                width = parseInt(cs.width) || selected.offsetWidth || 0,
                height = parseInt(cs.height) || selected.offsetHeight || 0;
            let updated = false;
			if (e.shiftKey) { // resizing from center
				if (e.key === 'ArrowUp') {
					height += 10;
					top -= 5; // move up half of change
					selected.style.height = height + 'px';
					selected.style.top = top + 'px';
					updated = true;
				}
				if (e.key === 'ArrowDown') {
					height = Math.max(10, height - 10);
					top += 5; // move down half of change
					selected.style.height = height + 'px';
					selected.style.top = top + 'px';
					updated = true;
				}
				if (e.key === 'ArrowLeft') {
					width = Math.max(10, width - 10);
					left += 5; // move right half of change
					selected.style.width = width + 'px';
					selected.style.left = left + 'px';
					updated = true;
				}
				if (e.key === 'ArrowRight') {
					width += 10;
					left -= 5; // move left half of change
					selected.style.width = width + 'px';
					selected.style.left = left + 'px';
					updated = true;
				}
			} else { // normal movement
				if (e.key === 'ArrowUp') { top -= 10; selected.style.top = Math.max(0, top) + 'px'; updated = true; }
				if (e.key === 'ArrowDown') { top += 10; selected.style.top = Math.max(0, top) + 'px'; updated = true; }
				if (e.key === 'ArrowLeft') { left -= 10; selected.style.left = Math.max(0, left) + 'px'; updated = true; }
				if (e.key === 'ArrowRight') { left += 10; selected.style.left = Math.max(0, left) + 'px'; updated = true; }
			}

            if (updated) {
				if (selected === stickWrapper) {
					// Instead of always using Math.max,
					// pick size based on whether we're growing or shrinking
					let newSize;

					if (e.key === 'ArrowUp' || e.key === 'ArrowRight') {
						newSize = Math.max(width, height); // expanding
					} else {
						newSize = Math.min(width, height); // shrinking
					}

					const deltaW = newSize - width;
					const deltaH = newSize - height;

					selected.style.width = newSize + 'px';
					selected.style.height = newSize + 'px';
					selected.style.left = (left - deltaW / 2) + 'px';
					selected.style.top = (top - deltaH / 2) + 'px';

					resizeCanvas();
					joystick.style.left = (newSize / 2) + 'px';
					joystick.style.top = (newSize / 2) + 'px';

					appState.joystick.top = selected.style.top;
					appState.joystick.left = selected.style.left;
					appState.joystick.width = selected.style.width;
					appState.joystick.height = selected.style.height;
				}
                saveState();
            }
        }
    }); // end keydown

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
        if (!selected || !pad) return;
        const now = performance.now();
        const dirs = [{
            btn: 12,
            dx: 0,
            dy: -moveStep,
            key: 'up'
        }, {
            btn: 13,
            dx: 0,
            dy: moveStep,
            key: 'down'
        }, {
            btn: 14,
            dx: -moveStep,
            dy: 0,
            key: 'left'
        }, {
            btn: 15,
            dx: moveStep,
            dy: 0,
            key: 'right'
        }];
        dirs.forEach(d => {
            if (pad.buttons[d.btn]?.pressed && now - elementMoveTimers[d.key] > moveDelay) {
                const cs = window.getComputedStyle(selected);
                let top = parseInt(cs.top) || 0,
                    left = parseInt(cs.left) || 0;
                top = Math.max(0, top + d.dy);
                left = Math.max(0, left + d.dx);
                selected.style.top = Math.round(top / 10) * 10 + 'px';
                selected.style.left = Math.round(left / 10) * 10 + 'px';
                if (selected.classList && selected.classList.contains('btn')) {
                    appState.buttons[selected.dataset.btn] = appState.buttons[selected.dataset.btn] || {};
                    appState.buttons[selected.dataset.btn].top = selected.style.top;
                    appState.buttons[selected.dataset.btn].left = selected.style.left;
                } else if (selected === stickWrapper) {
                    appState.joystick.top = selected.style.top;
                    appState.joystick.left = selected.style.left;
                }
                saveState();
                elementMoveTimers[d.key] = now;
            }
        });
    }

    // gamepad helpers, canvas, trail, markers
    function radialDeadzone(x, y, dz) {
        const mag = Math.hypot(x, y);
        if (mag < dz) return {
            x: 0,
            y: 0
        };
        const s = (mag - dz) / (1 - dz);
        return {
            x: x * s / mag,
            y: y * s / mag
        };
    }

    function clampRoundedSquare(x, y, n = 8) {
        const mag = Math.pow(Math.abs(x), n) + Math.pow(Math.abs(y), n);
        if (mag > 1) {
            const scale = Math.pow(mag, -1 / n);
            return {
                x: x * scale,
                y: y * scale
            };
        }
        return {
            x,
            y
        };
    }

    function getStickXY(pad) {
        if (!pad) return {
            x: 0,
            y: 0
        };
        let a = radialDeadzone(pad.axes[0] || 0, pad.axes[1] || 0, cfg.deadzone);
        let {
            x,
            y
        } = a;
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
            joystick.style.transform = 'translate(-50%,-50%) scale(1)';
            joystick.textContent = '';
            Object.values(btnEls).forEach(b => b.classList.remove('active'));
            return;
        }
        for (const key in btnEls) {
            const idx = map[key];
            if (idx === undefined) continue;
            const pressed = !!pad.buttons[idx]?.pressed;
            btnEls[key].classList.toggle('active', pressed);
            lastPressedTimes[key] = pressed ? performance.now() : lastPressedTimes[key] || 0;
        }
        let active = null,
            latest = -1;
        for (const k in lastPressedTimes) {
            if (btnEls[k].classList.contains('active') && !cfg.ignoredForJoystick.includes(k) && lastPressedTimes[k] > latest) {
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
        } else {
            joystick.style.transform = 'translate(-50%,-50%) scale(1)';
            joystick.textContent = '';
            joystick.style.background = 'rgba(120,120,120,1)';
            joystick.style.color = '#000';
        }
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
            cr = Math.min(canvas.width, canvas.height) / 2 - 10;
        const trailColor = appState.trailColor || getComputedStyle(document.documentElement).getPropertyValue('--trail-color') || '#CEEC73';
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
            ctx.lineWidth = 10 * (t * 2);
            ctx.lineCap = 'round';
            ctx.strokeStyle = trailColor;
            ctx.stroke();
        }
    }

    // profiles
    function saveProfile(n) {
        if (n < 1 || n > PROFILE_COUNT) return;
        const snap = {
            base: captureElement(base),
            joystick: captureElement(stickWrapper),
            buttons: {}
        };
        Object.keys(btnEls).forEach(k => snap.buttons[k] = captureElement(btnEls[k]));
        appState.profiles['profile' + n] = snap;
        saveState();
    }

    function loadProfile(n) {
        const snap = appState.profiles['profile' + n];
        if (!snap) {
            showToast('Profile ' + n + ' empty', 800);
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
        if (snap.buttons) Object.keys(snap.buttons).forEach(k => {
            if (btnEls[k]) {
                applyElement(btnEls[k], snap.buttons[k]);
                appState.buttons[k] = Object.assign(appState.buttons[k] || {}, snap.buttons[k]);
                if (snap.buttons[k].display !== undefined) btnEls[k].style.display = snap.buttons[k].display;
            }
        });
		showToast('Profile ' + n + ' loaded', 800);
        saveState();
    }

    // layout save/import/export
    function saveLayoutToFile() {
        const snap = {
            base: captureElement(base),
            joystick: captureElement(stickWrapper),
            buttons: {}
        };
        Object.keys(btnEls).forEach(k => snap.buttons[k] = captureElement(btnEls[k]));
        const json = JSON.stringify(snap, null, 2);
        const blob = new Blob([json], {
            type: 'application/json'
        });
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
				showToast('Copied layout to clipboard', 900);
			} catch (e) {
				console.warn(e);
				showToast('Copy failed', 900);
			}
		} else {
			const ta = document.getElementById('clipboardInput');
			ta.value = json;
			ta.select();
			try {
				document.execCommand('copy');
				showToast('Copied layout to clipboard', 900);
			} catch (e) {
				showToast('Copy failed', 900);
			}
		}
	}

    // import (file input + drag drop)
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
                showToast('Imported layout', 900);
            } catch (err) {
                showToast('Invalid JSON', 900);
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
                        showToast('Imported layout', 900);
                    } catch (err) {
                        showToast('Invalid JSON', 900);
                    }
                };
                r.readAsText(f);
            } else showToast('Only JSON layout files are accepted', 1000);
        }
    });
	
	function snapAllToGrid(gridSize = 10) {
		const props = ["top", "left", "width", "height"];
		const snap = val => (Math.round((parseInt(val) || 0) / gridSize) * gridSize) + "px";

		// Snap base
		if (appState.base) {
			props.forEach(p => {
				if (appState.base[p]) {
					appState.base[p] = snap(appState.base[p]);
					base.style[p] = appState.base[p];
				}
			});
		}

		// Snap joystick
		if (appState.joystick) {
			props.forEach(p => {
				if (appState.joystick[p]) {
					appState.joystick[p] = snap(appState.joystick[p]);
					stickWrapper.style[p] = appState.joystick[p];
				}
			});

			resizeCanvas();
			joystick.style.left = (parseInt(appState.joystick.width) / 2) + "px";
			joystick.style.top = (parseInt(appState.joystick.height) / 2) + "px";
		}

		// Snap all buttons
		if (appState.buttons) {
			Object.keys(appState.buttons).forEach(btn => {
				props.forEach(p => {
					if (appState.buttons[btn][p]) {
						appState.buttons[btn][p] = snap(appState.buttons[btn][p]);
					}
				});
				const el = document.querySelector(`.btn[data-btn="${btn}"]`);
				if (el) {
					props.forEach(p => {
						if (appState.buttons[btn][p]) {
							el.style[p] = appState.buttons[btn][p];
						}
					});
				}
			});
		}

		saveState();
		showToast(`All widgets snapped to ${gridSize}px grid`, 800);
	}
	
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

    // animation loop
    function animate() {
        activeGamepadIndex = detectActiveGamepad();
        const pad = (navigator.getGamepads && activeGamepadIndex !== null) ? navigator.getGamepads()[activeGamepadIndex] : null;
        updateButtonsFromPad(pad);
        handleDpadMovement(pad);
        const {
            x,
            y
        } = getStickXY(pad);
        const cx = canvas.width / 2,
            cy = canvas.height / 2,
            radius = canvas.width / 2 - 25;
        const jx = cx + x * radius,
            jy = cy + y * radius;
        joystick.style.left = jx + 'px';
        joystick.style.top = jy + 'px';
        const deg = (Math.atan2(y, x) * 180 / Math.PI + 360) % 360;
        let idx = -1;
        if (Math.hypot(x, y) > 0.5) idx = Math.round(deg / 45) % 8;
        const dirs = [{
            x: 1,
            y: 0
        }, {
            x: 0.95,
            y: 0.95
        }, {
            x: 0,
            y: 1
        }, {
            x: -0.95,
            y: 0.95
        }, {
            x: -1,
            y: 0
        }, {
            x: -0.95,
            y: -0.95
        }, {
            x: 0,
            y: -1
        }, {
            x: 0.95,
            y: -0.95
        }];
        const radiusPct = 38;
        const n = 4;
        dirs.forEach((d, i) => {
            const m = markers[i];
            if (!m) return;
            const mag = Math.pow(Math.abs(d.x), n) + Math.pow(Math.abs(d.y), n);
            const clamped = mag > 1 ? {
                x: d.x / Math.pow(mag, 1 / n),
                y: d.y / Math.pow(mag, 1 / n)
            } : d;
            m.style.left = (50 + clamped.x * radiusPct) + '%';
            m.style.top = (50 + clamped.y * radiusPct) + '%';
            m.classList.toggle('active', i === idx);
        });
        trail.push({
            x,
            y
        });
        if (trail.length > cfg.trail) trail.shift();
        drawTrail(trail);
        requestAnimationFrame(animate);
    }

    // boot
    loadState();
    applyState();
    resizeCanvas();
    joystick.style.left = (canvas.width / 2) + 'px';
    joystick.style.top = (canvas.height / 2) + 'px';

    // ResizeObserver to recenter joystick when stickWrapper size changes
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
});