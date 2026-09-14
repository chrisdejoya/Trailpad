function parseColor(value) {
  if (!value || value === 'transparent') return null;
  const match = value.match(/^rgba?\(([^)]+)\)$/i);
  if (match) {
    const parts = match[1].split(',').map(part => parseFloat(part.trim()));
    if (parts.length >= 3 && parts.slice(0, 3).every(Number.isFinite)) {
      const alpha = parts.length > 3 && Number.isFinite(parts[3]) ? parts[3] : 1;
      return { r: parts[0], g: parts[1], b: parts[2], a: alpha };
    }
  }
  if (/^#[\da-f]{6}$/i.test(value)) {
    return { r: parseInt(value.slice(1, 3), 16), g: parseInt(value.slice(3, 5), 16), b: parseInt(value.slice(5, 7), 16), a: 1 };
  }
  return null;
}

function colorToCss(color) {
  return `rgba(${color.r}, ${color.g}, ${color.b}, ${color.a})`;
}

function colorToHex(color) {
  return '#' + [color.r, color.g, color.b].map(value => Math.max(0, Math.min(255, Math.round(value))).toString(16).padStart(2, '0')).join('');
}

function sampleCanvas(canvas, x, y) {
  const rect = canvas.getBoundingClientRect();
  if (!rect.width || !rect.height || x < rect.left || x > rect.right || y < rect.top || y > rect.bottom) return null;
  const scaleX = canvas.width / rect.width;
  const scaleY = canvas.height / rect.height;
  try {
    const pixel = canvas.getContext('2d', { willReadFrequently: true })?.getImageData(
      Math.max(0, Math.min(canvas.width - 1, Math.floor((x - rect.left) * scaleX))),
      Math.max(0, Math.min(canvas.height - 1, Math.floor((y - rect.top) * scaleY))), 1, 1
    ).data;
    return pixel && pixel[3] ? { r: pixel[0], g: pixel[1], b: pixel[2], a: pixel[3] / 255 } : null;
  } catch (error) {
    return null;
  }
}

const imageCache = new Map();
const imageSourceCache = new Map();

function loadImageSource(source) {
  if (!imageSourceCache.has(source)) {
    imageSourceCache.set(source, new Promise(resolve => {
      const image = new Image();
      image.onload = () => resolve(image);
      image.onerror = () => resolve(null);
      image.src = source;
    }));
  }
  return imageSourceCache.get(source);
}

async function sampleBackgroundImage(element, styles, x, y) {
  const match = styles.backgroundImage?.match(/url\(["']?([^"')]+)["']?\)/i);
  if (!match) return null;
  let source;
  try { source = new URL(match[1], document.baseURI).href; } catch (error) { return null; }
  const image = await loadImageSource(source);
  if (!image) return null;
  const rect = element.getBoundingClientRect();
  if (!rect.width || !rect.height) return null;
  const pixelCanvas = document.createElement('canvas');
  pixelCanvas.width = image.naturalWidth; pixelCanvas.height = image.naturalHeight;
  try {
    pixelCanvas.getContext('2d').drawImage(image, 0, 0);
    const pixel = pixelCanvas.getContext('2d', { willReadFrequently: true }).getImageData(
      Math.max(0, Math.min(pixelCanvas.width - 1, Math.floor((x - rect.left) * pixelCanvas.width / rect.width))),
      Math.max(0, Math.min(pixelCanvas.height - 1, Math.floor((y - rect.top) * pixelCanvas.height / rect.height))), 1, 1
    ).data;
    return pixel[3] ? { r: pixel[0], g: pixel[1], b: pixel[2], a: pixel[3] / 255 } : null;
  } catch (error) {
    return null;
  }
}

function sampleImage(image, x, y) {
  if (!image.complete || !image.naturalWidth) return null;
  const rect = image.getBoundingClientRect();
  if (!rect.width || !rect.height || x < rect.left || x > rect.right || y < rect.top || y > rect.bottom) return null;
  let buffer = imageCache.get(image.currentSrc || image.src);
  if (!buffer) {
    buffer = document.createElement('canvas');
    buffer.width = image.naturalWidth; buffer.height = image.naturalHeight;
    try { buffer.getContext('2d').drawImage(image, 0, 0); } catch (error) { return null; }
    imageCache.set(image.currentSrc || image.src, buffer);
  }
  try {
    const pixel = buffer.getContext('2d', { willReadFrequently: true }).getImageData(
      Math.max(0, Math.min(buffer.width - 1, Math.floor((x - rect.left) * buffer.width / rect.width))),
      Math.max(0, Math.min(buffer.height - 1, Math.floor((y - rect.top) * buffer.height / rect.height))), 1, 1
    ).data;
    return pixel[3] ? { r: pixel[0], g: pixel[1], b: pixel[2], a: pixel[3] / 255 } : null;
  } catch (error) {
    return null;
  }
}

function isOnBorder(element, styles, x, y) {
  const rect = element.getBoundingClientRect();
  const edge = Math.min(x - rect.left, y - rect.top, rect.right - x, rect.bottom - y);
  return edge >= 0 && edge < Math.max(parseFloat(styles.borderTopWidth) || 0, parseFloat(styles.borderRightWidth) || 0, parseFloat(styles.borderBottomWidth) || 0, parseFloat(styles.borderLeftWidth) || 0);
}

async function sampleAtPoint(x, y) {
  const elements = document.elementsFromPoint(x, y);
  for (const element of elements) {
    if (element instanceof HTMLCanvasElement) {
      const color = sampleCanvas(element, x, y);
      if (color) return color;
    }
    if (element instanceof HTMLImageElement) {
      const color = sampleImage(element, x, y);
      if (color) return color;
    }
    const styles = getComputedStyle(element);
    if (isOnBorder(element, styles, x, y)) {
      const border = parseColor(styles.borderTopColor);
      if (border && border.a > 0) return border;
    }
    const imageColor = await sampleBackgroundImage(element, styles, x, y);
    if (imageColor) return imageColor;
    const background = parseColor(styles.backgroundColor);
    if (background && background.a > 0) return background;
    const color = parseColor(styles.color);
    if (color && element.textContent?.trim()) return color;
  }
  return { r: 255, g: 255, b: 255, a: 1 };
}

export function createColorPicker({ onPick }) {
  let active = false;
  let previewColor = null;
  const lens = document.createElement('div');
  lens.className = 'colorPickerLens';
  lens.innerHTML = '<span></span>';
  document.body.appendChild(lens);
  const preview = lens.querySelector('span');

  const update = async event => {
    if (!active) return;
    const sampleRequest = ++update.request;
    const color = await sampleAtPoint(event.clientX, event.clientY);
    if (!active || sampleRequest !== update.request) return;
    previewColor = color;
    preview.style.backgroundColor = colorToCss(previewColor);
    lens.style.left = `${event.clientX}px`;
    lens.style.top = `${event.clientY}px`;
  };
  const finish = event => {
    if (!active) return;
    event.preventDefault();
    event.stopPropagation();
    if (previewColor) onPick(colorToHex(previewColor));
    stop();
  };
  const cancel = event => {
    if (event.key === 'Escape') stop();
  };
  update.request = 0;
  function start() {
    if (active) return;
    active = true;
    lens.classList.add('active');
    document.body.classList.add('colorPickerActive');
    document.addEventListener('pointermove', update, true);
    document.addEventListener('pointerdown', finish, true);
    document.addEventListener('keydown', cancel, true);
  }
  function stop() {
    active = false;
    previewColor = null;
    lens.classList.remove('active');
    document.body.classList.remove('colorPickerActive');
    document.removeEventListener('pointermove', update, true);
    document.removeEventListener('pointerdown', finish, true);
    document.removeEventListener('keydown', cancel, true);
  }
  return { start, stop };
}