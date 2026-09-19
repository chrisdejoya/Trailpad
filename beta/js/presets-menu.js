// Presets menu: floating right-click menu listing layout presets, saved
// profiles, and connected controllers, with hover preview and apply/cancel
// behavior.
//
// Layout snapshotting/apply (exportLayout/importLayout) and element property
// helpers stay in main.js and are injected here. The menu owns its own DOM
// and private state (open menu element, in-flight preview fetch, revert
// snapshot, selection flag). Cross-cutting state is exposed via accessors:
// - renderControllerList is a mutable property on the returned api object:
//   it is assigned while the menu's Controller tab is open and nulled on
//   close; main.js callers use optional invocation, so null means no-op,
//   same as before extraction.
// - the context-menu request counter stays in main.js and is read through
//   getContextMenuRequest so stale async opens can be discarded.

export function createPresetsMenu({
  appState, profileCount,
  exportLayout, importLayout,
  applyPropertiesToElement, applyBgImage,
  els, // { base, stickWrapper, eightWayWrapper, joystick, btnEls }
  resizeEightWayArrows, resizeJoystickWrapper,
  getDetectedControllers, getSelectedControllerKey, selectController,
  saveStateData, showToast, stopUiHideTimer,
  getContextMenuRequest, setArrowSize
}) {
  const { base, stickWrapper, eightWayWrapper, joystick, btnEls } = els;

  let presetsMenuEl = null;
  let layoutsIndex = null;
  let _previewFetchController = null;
  let _prevLayoutSnapshot = null;
  let _menuSelectionMade = false;

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
      if (parsed.eightWayWrapper?.arrowSize !== undefined) { setArrowSize(parseInt(parsed.eightWayWrapper.arrowSize) || undefined); }
      // images
      if (parsed.eightWayWrapper?.arrowImageOff || parsed.eightWayWrapper?.arrowImageOn) {
        for (let i = 0; i < 8; i++) {
          const arrow = document.getElementById('arrow' + i); if (!arrow) continue;
          if (parsed.eightWayWrapper.arrowImageOff) applyBgImage(arrow, parsed.eightWayWrapper.arrowImageOff);
          if (parsed.eightWayWrapper.arrowImageOn) arrow.dataset._previewOn = parsed.eightWayWrapper.arrowImageOn;
        }
      }
      resizeEightWayArrows(); resizeJoystickWrapper();
    } catch (e) { console.warn('preview apply failed', e); }
  }

  function closePresetsMenu(revert = true) {
    if (!presetsMenuEl) return;
    presetsMenuEl.remove(); presetsMenuEl = null;
    api.renderControllerList = null;
    // stop any outstanding fetch
    try { if (_previewFetchController) _previewFetchController.abort(); } catch (e) {}
    // if a selection wasn't made, revert to previous snapshot
    if (revert && !_menuSelectionMade && _prevLayoutSnapshot) {
      try { importLayout(_prevLayoutSnapshot); } catch (e) { console.warn('Could not revert layout after cancelling presets menu', e); }
    }
    _prevLayoutSnapshot = null; _menuSelectionMade = false;
    stopUiHideTimer();
  }

  async function openPresetsMenu(x, y, requestId = getContextMenuRequest()) {
    try {
      const list = await loadLayoutsIndex();
      if (requestId !== getContextMenuRequest()) return;
      // capture current layout snapshot so preview can be reverted
      _prevLayoutSnapshot = exportLayout(); _menuSelectionMade = false;
      // remove existing menu if present
      if (presetsMenuEl) presetsMenuEl.remove();
      const menu = document.createElement('div'); menu.className = 'presetsMenu';
      // Header with toggles for Profiles, Presets, and connected Controllers
      const hdr = document.createElement('div'); hdr.className = 'presetsHeader colorPanelModeToggle ui-tabs';
      const profilesToggle = document.createElement('button'); profilesToggle.type = 'button'; profilesToggle.className = 'presetHeaderToggle ui-tab'; profilesToggle.textContent = 'Profiles';
      const presetsToggle = document.createElement('button'); presetsToggle.type = 'button'; presetsToggle.className = 'presetHeaderToggle ui-tab'; presetsToggle.textContent = 'Presets';
      const controllerToggle = document.createElement('button'); controllerToggle.type = 'button'; controllerToggle.className = 'presetHeaderToggle ui-tab'; controllerToggle.textContent = 'Controller';
      hdr.appendChild(profilesToggle); hdr.appendChild(presetsToggle); hdr.appendChild(controllerToggle); menu.appendChild(hdr);
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
        for (let i = 1; i <= profileCount; i++) {
          const key = 'profile' + i;
          const saved = appState.profiles && appState.profiles[key];
          const item = document.createElement('div'); item.className = 'presetItem';
          const profileName = saved?.name || 'Profile ' + i;
          const label = profileName + (saved ? '' : ' (Empty)');
          item.textContent = label; item.dataset.profile = i;
          if (saved) {
            item.addEventListener('mouseenter', () => { try { applyLayoutPreview(saved); } catch (e) { console.warn('profile preview failed', e); } });
            item.addEventListener('click', () => { try { importLayout(saved); _menuSelectionMade = true; closePresetsMenu(false); showToast(profileName + ' loaded', 1000); } catch (e) { console.warn('profile load failed', e); } });
            item.addEventListener('contextmenu', (e) => {
              e.preventDefault();
              e.stopPropagation();
              startRenameProfile(i, item);
            });
          } else {
            item.classList.add('empty');
          }
          wrapper.appendChild(item);
        }
      }

      function renderControllersList() {
        wrapper.innerHTML = '';
        const controllers = getDetectedControllers();
        if (controllers.length === 0) {
          const none = document.createElement('div'); none.className = 'presetItem empty'; none.textContent = '(no controllers detected)'; wrapper.appendChild(none);
          return;
        }
        const selectedKey = getSelectedControllerKey();
        for (const controller of controllers) {
          const item = document.createElement('button');
          item.type = 'button';
          item.className = 'presetItem controllerItem';
          item.dataset.controllerKey = controller.key;
          const label = document.createElement('span');
          label.textContent = controller.name;
          item.appendChild(label);
          if (controller.key === selectedKey) {
            const check = document.createElement('span');
            check.className = 'controllerCheck';
            check.textContent = '\u2713';
            check.setAttribute('aria-label', 'Active controller');
            item.appendChild(check);
            item.classList.add('active');
          }
          item.addEventListener('click', event => {
            event.stopPropagation();
            selectController(controller);
            renderControllersList();
          });
          wrapper.appendChild(item);
        }
      }
      api.renderControllerList = renderControllersList;

      function startRenameProfile(profileIndex, itemEl) {
        if (itemEl.querySelector('input')) return;
        const key = 'profile' + profileIndex;
        const saved = appState.profiles && appState.profiles[key];
        if (!saved) return;
        const currentName = saved.name || 'Profile ' + profileIndex;
        itemEl.textContent = '';
        const input = document.createElement('input');
        input.type = 'text';
        input.className = 'profile-rename-input';
        input.value = currentName;
        input.style.width = '100%';
        input.style.boxSizing = 'border-box';
        itemEl.appendChild(input);
        input.focus();
        input.select();

        function finishRename(commit) {
          if (!itemEl.contains(input)) return;
          itemEl.removeChild(input);
          if (commit) {
            const newName = input.value.trim();
            if (newName) {
              saved.name = newName;
              itemEl.textContent = newName;
              saveStateData();
              showToast('Profile renamed to ' + newName, 1000);
            } else {
              itemEl.textContent = currentName;
            }
          } else {
            itemEl.textContent = currentName;
          }
        }

        input.addEventListener('blur', () => finishRename(true));
        input.addEventListener('keydown', (ev) => {
          if (ev.key === 'Enter') {
            ev.preventDefault();
            finishRename(true);
          } else if (ev.key === 'Escape') {
            ev.preventDefault();
            finishRename(false);
          }
        });
      }

      // initial render shows profiles by default
      renderProfilesList();
      // wire header toggles and set classes
      function setActiveToggle(which) {
        if (which === 'profiles') {
          profilesToggle.classList.add('active'); presetsToggle.classList.remove('active');
          controllerToggle.classList.remove('active');
        } else if (which === 'presets') {
          presetsToggle.classList.add('active'); profilesToggle.classList.remove('active');
          controllerToggle.classList.remove('active');
        } else {
          controllerToggle.classList.add('active'); profilesToggle.classList.remove('active'); presetsToggle.classList.remove('active');
        }
      }

      function repositionPresetsMenu() {
        const rect = menu.getBoundingClientRect();
        const vw = window.innerWidth;
        const vh = window.innerHeight;
        let left = parseInt(menu.style.left, 10) || x;
        let top = parseInt(menu.style.top, 10) || y;
        if (left + rect.width > vw) left = Math.max(8, vw - rect.width - 10);
        if (top + rect.height > vh) top = Math.max(8, vh - rect.height - 10);
        menu.style.left = left + 'px';
        menu.style.top = top + 'px';
      }

      profilesToggle.addEventListener('click', () => {
        setActiveToggle('profiles');
        renderProfilesList();
        repositionPresetsMenu();
      });

      presetsToggle.addEventListener('click', () => {
        setActiveToggle('presets');
        renderPresetsList();
        repositionPresetsMenu();
      });
      controllerToggle.addEventListener('click', () => {
        setActiveToggle('controllers');
        renderControllersList();
        repositionPresetsMenu();
      });
      setActiveToggle('profiles');
      menu.appendChild(wrapper);
      // const note = document.createElement('div'); note.className = 'presetPreviewNote'; note.textContent = 'Hover to preview. Click to apply. Click outside to cancel.'; menu.appendChild(note);
      document.body.appendChild(menu); presetsMenuEl = menu;
      // position and clamp to viewport (mirror colorPanel logic)
      menu.style.left = x + 'px'; menu.style.top = y + 'px'; const rect = menu.getBoundingClientRect(); const vw = window.innerWidth; const vh = window.innerHeight;
      let left = x; let top = y; if (left + rect.width > vw) left = Math.max(8, vw - rect.width - 10); if (top + rect.height > vh) top = Math.max(8, vh - rect.height - 10);
      // Small offset to avoid obstructing the click area
      left += 8; top += 8;
      // Re-clamp after offset
      if (left + rect.width > vw) left = Math.max(8, vw - rect.width - 10);
      if (top + rect.height > vh) top = Math.max(8, vh - rect.height - 10);
      menu.style.left = left + 'px'; menu.style.top = top + 'px';
      startUiHideTimer();
    } catch (e) { console.warn('openPresetsMenu failed', e); }
  }

  const api = {
    open: openPresetsMenu,
    close: closePresetsMenu,
    isOpen: () => !!presetsMenuEl,
    element: () => presetsMenuEl,
    // Assigned while the menu's Controller tab is rendered; null otherwise.
    renderControllerList: null
  };
  return api;
}

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