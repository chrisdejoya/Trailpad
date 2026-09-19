// Selection cursor overlay for Trailpad.
//
// Owns the .cursor div (created + appended here) and updateCursor(), which
// frames the currently selected element. The mutable selection crosses via
// a getSelected accessor, same pattern as js/selection.js — the cursor never
// writes selection state itself.

export function createCursor({ getSelected }) {
  const cursorEl = document.createElement('div');
  cursorEl.className = 'cursor';
  cursorEl.innerHTML = '<div class="corner"></div>';
  document.body.appendChild(cursorEl);

  function updateCursor(immediate = false) {
    const selected = getSelected();
    if (!selected) {
      cursorEl.classList.remove('active');
      return;
    }
    const apply = () => {
      const rect = selected.getBoundingClientRect();
      cursorEl.style.left = rect.left + 'px';
      cursorEl.style.top = rect.top + 'px';
      cursorEl.style.width = rect.width + 'px';
      cursorEl.style.height = rect.height + 'px';
      cursorEl.classList.add('active');
    };
    if (immediate) {
      apply();
    } else {
      // Wait for CSS transition (30ms on top/left) to complete
      requestAnimationFrame(() => {
        setTimeout(apply, 70);
      });
    }
  }

  function hideCursor() {
    if (cursorEl) {
      cursorEl.classList.remove('active');
    }
  }

  return { element: () => cursorEl, updateCursor, hideCursor };
}
