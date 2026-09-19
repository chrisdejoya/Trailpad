// Font catalog loading and lazy web-font preload for Trailpad.
//
// fonts/fonts.json lists every known font ({ name, cssFamily, url? }).
// Remote fonts get a <link> appended to <head> the first time a layout
// references them; local fonts (no url) are declared via @font-face in
// CSS and are skipped by the preloader.

let fontsList = null;

export async function loadFontsList() {
  if (fontsList) return fontsList;
  try {
    const res = await fetch('fonts/fonts.json');
    if (!res.ok) throw new Error('not found');
    fontsList = await res.json();
    return fontsList;
  } catch (e) {
    console.warn('Could not load fonts/fonts.json', e);
    fontsList = [];
    return fontsList;
  }
}

// Collect every fontFamily referenced in a layout and ensure the backing
// web font is loaded (Google Fonts <link>). Local fonts like Swiss 721
// have no url and are declared via @font-face, so they are skipped.
export async function preloadFontsForLayout(parsed) {
  await loadFontsList();
  const families = new Set();
  const collect = data => {
    if (!data || typeof data !== 'object') return;
    if (typeof data.fontFamily === 'string' && data.fontFamily.trim()) families.add(data.fontFamily.trim());
    Object.values(data).forEach(collect);
  };
  collect(parsed);
  if (families.size === 0) return;
  const fonts = fontsList || [];
  const seenUrls = new Set();
  families.forEach(family => {
    const match = fonts.find(f => f.cssFamily === family);
    if (!match || !match.url) return;
    if (seenUrls.has(match.url)) return;
    seenUrls.add(match.url);
    if (document.querySelector(`link[href="${match.url}"]`)) return;
    const link = document.createElement('link');
    link.rel = 'stylesheet';
    link.href = match.url;
    document.head.appendChild(link);
  });
}
