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

// Rewrite a bare local filesystem path into a CSS-loadable URL.
//
// A Windows drive path like "d:/trailpad/img.svg" (or "D:\...\img.svg") is
// mis-parsed by the URL/CSS loader: the leading "d" reads as a URL *scheme*,
// so url('d:/...') becomes an unknown "d:" scheme and never loads. We detect
// that case and rewrite it to a proper file:/// URL (uppercase drive letter,
// backslashes -> forward slashes). Paths that already carry a known scheme
// (http/https/file/data) or a "//" authority, plus relative paths, are
// returned unchanged so existing behaviour is preserved.
export function toLoadableImageUrl(val) {
  if (!val || val === 'none') return '';
  const v = String(val).trim();
  if (/^(https?:|file:|data:)/i.test(v) || v.startsWith('//')) return v;
  const m = v.match(/^([a-zA-Z]):[\\/](.+)$/);
  if (m) return `file:///${m[1].toUpperCase()}:/${m[2].replace(/\\/g, '/')}`;
  return v;
}

// Apply backgroundImage: wrap path with url('...') if needed
export function applyBgImage(el, val) {
  if (!val || val === 'none') { el.style.backgroundImage = 'none'; return; }
  const normalized = toLoadableImageUrl(normalizeBgImage(val));
  el.style.backgroundImage = `url('${normalized}')`;
}

// Apply maskImage: wrap path with url('...') if needed ('none'/empty clears it)
export function applyMaskImage(el, val) {
  const url = (!val || val === 'none') ? 'none' : `url('${toLoadableImageUrl(normalizeBgImage(val))}')`;
  el.style.webkitMaskImage = url;
  el.style.maskImage = url;
}