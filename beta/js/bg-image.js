// Background-image helpers shared by main.js's layout state code.
//
// normalizeBgImage strips a url("...") wrapper and returns just the path.
// applyBgImage applies a backgroundImage to an element, wrapping a bare path
// with url('...') if needed ('none'/empty clears it).

// Normalize backgroundImage: strip url("...") wrapper, return just the path
export function normalizeBgImage(val) {
  if (!val || val === 'none') return '';
  const m = val.match(/^url\(["']?([^"')]+)["']?\)$/i);
  return m ? m[1] : val;
}

// Apply backgroundImage: wrap path with url('...') if needed
export function applyBgImage(el, val) {
  if (!val || val === 'none') { el.style.backgroundImage = 'none'; return; }
  const normalized = normalizeBgImage(val);
  el.style.backgroundImage = `url('${normalized}')`;
}