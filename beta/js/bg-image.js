// Background-image helpers shared by main.js's layout state code.
//
// normalizeBgImage strips a url("...") wrapper and returns just the path.
// applyBgImage applies a backgroundImage to an element, wrapping a bare path
// with url('...') if needed ('none'/empty clears it).
// applyMaskImage does the same for CSS mask-image, setting both the standard
// and -webkit-prefixed properties so the mask also clips on engines that only
// expose the prefixed mask family.

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

// Apply maskImage: wrap path with url('...') if needed ('none'/empty clears it)
export function applyMaskImage(el, val) {
  const url = (!val || val === 'none') ? 'none' : `url('${normalizeBgImage(val)}')`;
  el.style.webkitMaskImage = url;
  el.style.maskImage = url;
}