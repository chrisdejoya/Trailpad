const fs = require('fs');

function normalizeVal(val) {
  if (!val || val === 'none') return val;
  if (typeof val === 'string') {
    const m = val.match(/^url\(['"]?([^'")]+)['"]?\)$/i);
    if (m) return m[1];
  }
  return val;
}

function processObj(obj) {
  if (!obj || typeof obj !== 'object') return obj;
  if (Array.isArray(obj)) {
    return obj.map(processObj);
  }
  const out = {};
  for (const [k, v] of Object.entries(obj)) {
    if (k === 'backgroundImage' || k === 'arrowImageOn' || k === 'arrowImageOff') {
      out[k] = normalizeVal(v);
    } else {
      out[k] = processObj(v);
    }
  }
  return out;
}

fs.readdirSync('.').filter(f => f.endsWith('.json')).forEach(file => {
  const content = fs.readFileSync(file, 'utf8');
  const parsed = JSON.parse(content);
  const cleaned = processObj(parsed);
  fs.writeFileSync(file, JSON.stringify(cleaned, null, 2));
  console.log('Cleaned:', file);
});