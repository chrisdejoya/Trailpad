// Clipboard / file import-export IO for Trailpad layouts.
//
// Wraps copy/paste of a layout snapshot through the async Clipboard API (with
// a hidden textarea + execCommand fallback for older browsers) and import of
// a layout .json file via a hidden file input. Layout snapshotting itself
// (exportLayout/importLayout) stays in main.js; it's injected here.

export function createClipboardIO({ exportLayout, importLayout, showToast, saveStateData }) {
  async function copyLayoutToClipboard() {
    const snap = exportLayout(); const json = JSON.stringify(snap, null, 2);
    if (navigator.clipboard && navigator.clipboard.writeText) {
      try { await navigator.clipboard.writeText(json); showToast('Copied layout to clipboard', 1000); } catch (e) { console.warn(e); showToast('Copy failed', 1000); }
    } else {
      const ta = document.getElementById('clipboardInput'); ta.value = json; ta.select(); try { document.execCommand('copy'); showToast('Copied layout to clipboard', 1000); } catch (e) { showToast('Copy failed', 1000); }
    }
    saveStateData();
  }

  async function pasteLayoutFromClipboard() {
    try {
      const text = await navigator.clipboard.readText();
      const parsed = JSON.parse(text);
      importLayout(parsed);
      showToast('Pasted layout from clipboard', 1000);
    } catch (err) {
      showToast('Paste failed: invalid JSON or no permission', 1000);
    }
  }

  // Hidden file input backing the Ctrl+O "import layout" flow.
  const importInput = document.createElement('input'); importInput.type = 'file'; importInput.accept = '.json,application/json'; importInput.style.display = 'none'; document.body.appendChild(importInput);
  importInput.addEventListener('change', e => {
    const f = e.target.files && e.target.files[0]; if (!f) return; const r = new FileReader(); r.onload = ev => { try { const parsed = JSON.parse(ev.target.result); importLayout(parsed); showToast('Imported layout', 1000); } catch (err) { showToast('Invalid JSON', 1000); } }; r.readAsText(f); importInput.value = '';
  });

  return { copyLayoutToClipboard, pasteLayoutFromClipboard, importInput };
}