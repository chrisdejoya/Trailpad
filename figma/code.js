const ROLE_NAMES = [
  { key: 'base', label: 'Base' },
  { key: 'joystick', label: 'Joystick' },
  { key: 'joystickHead', label: 'Joystick Head' },
  { key: 'eightWayWrapper', label: '8-way Wrapper' },
  { key: 'arrowOn', label: 'Arrow On' },
  { key: 'arrowOff', label: 'Arrow Off' }
];

const BUTTON_NAMES = [
  'A', 'B', 'X', 'Y', 'LB', 'RB', 'LT', 'RT', 'View', 'Menu', 'LS', 'RS',
  'Up', 'Down', 'Left', 'Right'
];

figma.showUI(__html__, { width: 320, height: 670, themeColors: true });
figma.ui.postMessage({ type: 'CONFIG', roles: ROLE_NAMES, buttons: BUTTON_NAMES });

function selectedNode() {
  return figma.currentPage.selection[0] || null;
}

function notify(message) {
  figma.notify(message);
}

function nameSelection(name) {
  const node = selectedNode();
  if (!node) return notify('Select a layer first.');
  node.name = name;
  figma.ui.postMessage({ type: 'NAMED', name, nodeName: node.name });
}

function colorToCss(paint) {
  if (!paint || paint.type !== 'SOLID' || !paint.visible) return null;
  const alpha = (paint.opacity === undefined ? 1 : paint.opacity) * (paint.color.a === undefined ? 1 : paint.color.a);
  const r = Math.round(paint.color.r * 255);
  const g = Math.round(paint.color.g * 255);
  const b = Math.round(paint.color.b * 255);
  if (alpha >= 0.999) return `rgb(${r}, ${g}, ${b})`;
  return `rgba(${r}, ${g}, ${b}, ${round(alpha, 3)})`;
}

function round(value, digits) {
  const factor = 10 ** digits;
  return Math.round(value * factor) / factor;
}

function firstPaint(paints) {
  return Array.isArray(paints) ? paints.find(paint => paint.visible !== false) : null;
}

function cssShadow(effects) {
  if (!Array.isArray(effects)) return 'none';
  const shadows = effects.filter(effect => effect.visible !== false && (effect.type === 'DROP_SHADOW' || effect.type === 'INNER_SHADOW'));
  if (!shadows.length) return 'none';
  return shadows.map(effect => {
    const color = effect.color || { r: 0, g: 0, b: 0, a: 1 };
    const rgba = `rgba(${Math.round(color.r * 255)}, ${Math.round(color.g * 255)}, ${Math.round(color.b * 255)}, ${round(color.a === undefined ? 1 : color.a, 3)})`;
    const inset = effect.type === 'INNER_SHADOW' ? 'inset ' : '';
    return `${inset}${rgba} ${round(effect.offset?.x || 0, 2)}px ${round(effect.offset?.y || 0, 2)}px ${round(effect.radius || 0, 2)}px ${round(effect.spread || 0, 2)}px`;
  }).join(', ');
}

function outline(node) {
  const stroke = firstPaint(node.strokes);
  if (!stroke || !node.strokeWeight) return 'rgb(0, 0, 0) none 0px';
  return `${colorToCss(stroke) || 'rgb(0, 0, 0)'} solid ${round(node.strokeWeight, 2)}px`;
}

function radius(node) {
  if (node.cornerRadius !== undefined && node.cornerRadius !== figma.mixed) return `${round(node.cornerRadius, 2)}px`;
  if (node.topLeftRadius !== undefined) {
    const radii = [node.topLeftRadius, node.topRightRadius, node.bottomRightRadius, node.bottomLeftRadius];
    if (radii.every(value => value === radii[0])) return `${round(radii[0], 2)}px`;
    return radii.map(value => `${round(value, 2)}px`).join(' ');
  }
  return '0px';
}

function textDescendant(node) {
  if (node.type === 'TEXT') return node;
  if (!('children' in node)) return null;
  for (const child of node.children) {
    const text = textDescendant(child);
    if (text) return text;
  }
  return null;
}

function absoluteBounds(node, rootBounds) {
  const bounds = node.absoluteBoundingBox || { x: 0, y: 0, width: node.width, height: node.height };
  return {
    top: `${round(bounds.y - rootBounds.y, 2)}px`,
    left: `${round(bounds.x - rootBounds.x, 2)}px`,
    width: `${round(bounds.width, 2)}px`,
    height: `${round(bounds.height, 2)}px`
  };
}

function elementProperties(node, rootBounds, zIndex) {
  const fill = firstPaint(node.fills);
  const text = textDescendant(node);
  const properties = {
    display: node.visible === false ? 'none' : 'flex',
    zIndex: String(zIndex),
    ...absoluteBounds(node, rootBounds),
    borderRadius: radius(node),
    outline: outline(node),
    outlineOffset: '0px',
    boxShadow: cssShadow(node.effects),
    backgroundColor: colorToCss(fill) || 'rgba(0, 0, 0, 0)',
    backgroundImage: 'none',
    backgroundSize: 'auto',
    color: 'rgb(238, 238, 238)',
    fontSize: '16px',
    label: text ? text.characters : ''
  };
  if (text) {
    const fillPaint = firstPaint(text.fills);
    properties.color = colorToCss(fillPaint) || properties.color;
    if (typeof text.fontSize === 'number') properties.fontSize = `${round(text.fontSize, 2)}px`;
    if (text.fontName && text.fontName.family) properties.fontFamily = text.fontName.family;
  }
  return properties;
}

function descendants(node) {
  const result = [];
  if (!('children' in node)) return result;
  for (const child of node.children) {
    result.push(child, ...descendants(child));
  }
  return result;
}

function isSvgAssetNode(node) {
  return ['GROUP', 'FRAME', 'COMPONENT', 'COMPONENT_SET', 'INSTANCE'].includes(node.type);
}

function exportLayout(root) {
  const nodes = [root, ...descendants(root)];
  const byName = new Map(nodes.map(node => [node.name, node]));
  const rootBounds = root.absoluteBoundingBox || { x: root.x, y: root.y, width: root.width, height: root.height };
  const hidden = () => ({ display: 'none' });
  const zIndexes = new Map(nodes.map((node, index) => [node.id, index]));
  const properties = node => elementProperties(node, rootBounds, zIndexes.get(node.id));
  const layout = {
    base: byName.has('base') ? properties(byName.get('base')) : hidden(),
    joystick: byName.has('joystick') ? properties(byName.get('joystick')) : hidden(),
    joystickHead: byName.has('joystickHead') ? properties(byName.get('joystickHead')) : hidden(),
    eightWayWrapper: byName.has('eightWayWrapper') ? properties(byName.get('eightWayWrapper')) : hidden(),
    arrowOn: byName.has('arrowOn') ? properties(byName.get('arrowOn')) : hidden(),
    arrowOff: byName.has('arrowOff') ? properties(byName.get('arrowOff')) : hidden(),
    buttons: {},
    trailColor: '#CEEC73',
    analog: {
      LS: true,
      RS: true,
      analogVisualRange: 8,
      pressureEnabled: true,
      minTriggerBrightness: 1,
      maxTriggerBrightness: 3,
      triggerDeadzone: 0.1
    }
  };
  const missing = [];
  for (const role of ROLE_NAMES) {
    if (!byName.has(role.key)) missing.push(role.key);
  }
  for (const button of BUTTON_NAMES) {
    const node = byName.get(button);
    layout.buttons[button] = node ? properties(node) : hidden();
  }
  return { layout, missing };
}

function safeAssetName(name) {
  const cleaned = String(name || 'asset').trim().replace(/[^a-zA-Z0-9._-]+/g, '-').replace(/\.svg$/i, '');
  return `${cleaned || 'asset'}.svg`;
}

function recognizedAssetNodes(root) {
  const nodes = [root, ...descendants(root)];
  const names = new Set(ROLE_NAMES.map(role => role.key).concat(BUTTON_NAMES));
  return nodes.filter(node => names.has(node.name) && isSvgAssetNode(node) && node.exportAsync);
}

async function exportAssets(root, layout, assetFolder) {
  const assets = [];
  for (const node of recognizedAssetNodes(root)) {
    const fileName = safeAssetName(node.name);
    const assetPath = `${assetFolder}/${fileName}`;
    const jsonPath = `images/${assetPath}`;
    if (layout.buttons[node.name]) {
      layout.buttons[node.name].backgroundImage = jsonPath;
      layout.buttons[node.name].backgroundSize = 'contain';
      layout.buttons[node.name].backgroundColor = 'rgba(0, 0, 0, 0)';
      layout.buttons[node.name].color = 'rgba(0, 0, 0, 0)';
      layout.buttons[node.name].outline = 'rgb(0, 0, 0) none 0px';
      layout.buttons[node.name].boxShadow = 'none';
      layout.buttons[node.name].borderRadius = '0px';
    } else if (layout[node.name]) {
      layout[node.name].backgroundImage = jsonPath;
      layout[node.name].backgroundSize = 'contain';
      layout[node.name].backgroundColor = 'rgba(0, 0, 0, 0)';
      layout[node.name].color = 'rgba(0, 0, 0, 0)';
      layout[node.name].outline = 'rgb(0, 0, 0) none 0px';
      layout[node.name].boxShadow = 'none';
      layout[node.name].borderRadius = '0px';
    }
    const bytes = await node.exportAsync({ format: 'SVG' });
    assets.push({ path: assetPath, bytes: Array.from(bytes) });
  }
  return assets;
}

function numberFromCss(value, fallback = 0) {
  if (typeof value === 'number') return value;
  const match = String(value || '').match(/-?\d+(?:\.\d+)?/);
  return match ? Number(match[0]) : fallback;
}

function colorFromCss(value) {
  if (!value || value === 'none' || value === 'transparent') return null;
  const hex = String(value).trim().match(/^#([0-9a-f]{3,8})$/i);
  if (hex) {
    const raw = hex[1];
    const expanded = raw.length <= 4 ? raw.split('').map(char => char + char).join('') : raw;
    return {
      r: parseInt(expanded.slice(0, 2), 16) / 255,
      g: parseInt(expanded.slice(2, 4), 16) / 255,
      b: parseInt(expanded.slice(4, 6), 16) / 255,
      a: expanded.length === 8 ? parseInt(expanded.slice(6, 8), 16) / 255 : 1
    };
  }
  const rgb = String(value).match(/rgba?\(([^)]+)\)/i);
  if (!rgb) return null;
  const parts = rgb[1].split(',').map(part => part.trim());
  return {
    r: Number(parts[0]) / 255,
    g: Number(parts[1]) / 255,
    b: Number(parts[2]) / 255,
    a: parts[3] === undefined ? 1 : Number(parts[3])
  };
}

function solidPaint(css, opacity = 1) {
  const color = colorFromCss(css);
  if (!color) return [];
  return [{ type: 'SOLID', color, opacity: Math.max(0, Math.min(1, (color.a || 1) * opacity)) }];
}

function borderFromCss(value) {
  const match = String(value || '').match(/(rgba?\([^)]*\)|#[0-9a-f]{3,8})\s+\w+\s+(-?\d+(?:\.\d+)?)px/i);
  if (!match) return null;
  return { color: match[1], weight: Number(match[2]) };
}

function effectsFromCss(value) {
  if (!value || value === 'none') return [];
  const match = String(value).match(/(rgba?\([^)]*\)|#[0-9a-f]{3,8})\s+(-?\d+(?:\.\d+)?)px\s+(-?\d+(?:\.\d+)?)px\s+(-?\d+(?:\.\d+)?)px(?:\s+(-?\d+(?:\.\d+)?)px)?/i);
  if (!match) return [];
  return [{
    type: 'DROP_SHADOW',
    color: colorFromCss(match[1]) || { r: 0, g: 0, b: 0, a: 1 },
    offset: { x: Number(match[2]), y: Number(match[3]) },
    radius: Number(match[4]),
    spread: Number(match[5] || 0),
    visible: true,
    blendMode: 'NORMAL'
  }];
}

function assetForPath(path, assets) {
  if (!path || path === 'none' || !assets) return null;
  const normalized = String(path).replace(/^url\(["']?/, '').replace(/["']?\)$/, '').replace(/\\/g, '/').replace(/^\.\//, '').replace(/^\/+/, '').toLowerCase();
  const fileName = normalized.split('/').pop();
  if (assets[normalized] || assets[fileName]) return assets[normalized] || assets[fileName];
  const matchingKey = Object.keys(assets).find(key => {
    const candidate = String(key).replace(/\\/g, '/').replace(/^\.\//, '').replace(/^\/+/, '').toLowerCase();
    return candidate === normalized || candidate.endsWith(`/${normalized}`) || candidate.endsWith(`/${fileName}`);
  });
  return matchingKey ? assets[matchingKey] : null;
}

function imagePaint(path, data, assets) {
  const asset = assetForPath(path, assets);
  if (!asset) return null;
  const image = figma.createImage(new Uint8Array(asset));
  const size = String(data.backgroundSize || '').toLowerCase();
  const scaleMode = size.includes('contain') ? 'FIT' : size.includes('cover') ? 'CROP' : 'FILL';
  return { type: 'IMAGE', imageHash: image.hash, scaleMode };
}

function applyImportedProperties(node, data, assets) {
  const width = Math.max(1, numberFromCss(data.width, 1));
  const height = Math.max(1, numberFromCss(data.height, 1));
  node.resize(width, height);
  node.visible = data.display !== 'none';
  const image = imagePaint(data.backgroundImage, data, assets);
  node.fills = image ? [image] : solidPaint(data.backgroundColor);
  node.effects = effectsFromCss(data.boxShadow);
  const border = borderFromCss(data.outline);
  if (border) {
    node.strokes = solidPaint(border.color);
    node.strokeWeight = border.weight;
  }
  const radii = String(data.borderRadius || '0px').match(/-?\d+(?:\.\d+)?/g) || ['0'];
  if ('cornerRadius' in node) {
    if (radii.length === 1) node.cornerRadius = Number(radii[0]);
    else {
      node.topLeftRadius = Number(radii[0] || 0);
      node.topRightRadius = Number(radii[1] || radii[0] || 0);
      node.bottomRightRadius = Number(radii[2] || radii[0] || 0);
      node.bottomLeftRadius = Number(radii[3] || radii[1] || radii[0] || 0);
    }
  }
}

async function addImportedText(parent, data) {
  if (!data.label) return;
  const text = figma.createText();
  const family = data.fontFamily || 'Inter';
  try {
    await figma.loadFontAsync({ family, style: 'Regular' });
    text.fontName = { family, style: 'Regular' };
  } catch (error) {
    await figma.loadFontAsync({ family: 'Inter', style: 'Regular' });
  }
  text.characters = String(data.label);
  text.fontSize = Math.max(1, numberFromCss(data.fontSize, 16));
  text.fills = solidPaint(data.color || 'rgb(238, 238, 238)');
  text.textAlignHorizontal = 'CENTER';
  text.textAlignVertical = 'CENTER';
  text.resize(parent.width, parent.height);
  parent.appendChild(text);
}

async function createImportedNode(name, data, root, parent, assets) {
  const node = figma.createFrame();
  node.name = name;
  node.x = numberFromCss(data.left);
  node.y = numberFromCss(data.top);
  applyImportedProperties(node, data, assets);
  parent.appendChild(node);
  await addImportedText(node, data);
  return node;
}

async function importLayout(layout, fileName, assets) {
  const base = layout.base || {};
  const root = figma.createFrame();
  root.name = fileName.replace(/\.json$/i, '') || 'Trailpad Layout';
  root.x = figma.viewport.center.x - numberFromCss(base.width, 800) / 2;
  root.y = figma.viewport.center.y - numberFromCss(base.height, 600) / 2;
  applyImportedProperties(root, { ...base, left: '0px', top: '0px' }, assets);
  root.clipsContent = false;
  const layers = [
    ['base', layout.base],
    ['joystick', layout.joystick],
    ['joystickHead', layout.joystickHead],
    ['eightWayWrapper', layout.eightWayWrapper],
    ['arrowOn', layout.arrowOn],
    ['arrowOff', layout.arrowOff]
  ];
  const buttonLayers = Object.entries(layout.buttons || {});
  const orderedLayers = layers.concat(buttonLayers).filter(([, data]) => data);
  orderedLayers.sort((a, b) => {
    const aIndex = Number(a[1].zIndex);
    const bIndex = Number(b[1].zIndex);
    const aValue = Number.isFinite(aIndex) ? aIndex : 0;
    const bValue = Number.isFinite(bIndex) ? bIndex : 0;
    return aValue - bValue;
  });
  for (const [name, data] of orderedLayers) {
    await createImportedNode(name, data, root, root, assets);
  }
  figma.currentPage.selection = [root];
  figma.viewport.scrollAndZoomIntoView([root]);
  const referenced = [];
  const collectReferences = value => {
    if (!value || typeof value !== 'object') return;
    if (typeof value.backgroundImage === 'string' && value.backgroundImage !== 'none') referenced.push(value.backgroundImage);
    Object.values(value).forEach(collectReferences);
  };
  collectReferences(layout);
  const missing = [...new Set(referenced.filter(path => !assetForPath(path, assets)))];
  notify(missing.length ? `Imported ${root.name}; missing image assets: ${missing.join(', ')}` : `Imported ${root.name}`);
}

figma.ui.onmessage = message => {
  if (message.type === 'NAME') nameSelection(message.name);
  if (message.type === 'IMPORT') {
    try {
      const layout = JSON.parse(message.json);
      if (!layout || typeof layout !== 'object') throw new Error('The JSON root must be an object.');
      importLayout(layout, message.fileName || 'trailpad-layout.json', message.assets || {}).catch(error => notify(`Import failed: ${error.message}`));
    } catch (error) {
      notify(`Invalid layout JSON: ${error.message}`);
    }
  }
  if (message.type === 'EXPORT') {
    const root = selectedNode();
    if (!root || !('children' in root)) return notify('Select a frame or component containing your layout.');
    const result = exportLayout(root);
    const frameName = safeAssetName(root.name).replace(/\.svg$/i, '');
    const exportLocal = message.exportLocal === true;
    const manualLocalPath = message.localPath || '';
    exportAssets(root, result.layout, frameName).then(assets => {
      figma.ui.postMessage({ 
        type: 'EXPORT_JSON', 
        json: JSON.stringify(result.layout, null, 2), 
        missing: result.missing, 
        assets, 
        assetFolder: frameName, 
        fileName: `${frameName}.json`,
        exportLocal,
        useLocalPaths: exportLocal,
        localPathPrefix: exportLocal ? frameName : '',
        manualLocalPath
      });
    }).catch(error => notify(`Asset export failed: ${error.message}`));
  }
};