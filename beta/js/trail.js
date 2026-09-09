// Trail system for Trailpad
// Handles drawing the joystick movement trail on canvas

export function createTrailSystem(canvas, ctx, config, getTrailColor) {
  let trail = [];
  
  function resize() {
    canvas.width = canvas.parentElement?.clientWidth || canvas.clientWidth;
    canvas.height = canvas.parentElement?.clientHeight || canvas.clientHeight;
  }
  
  function draw(trailData) {
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    if (!trailData || trailData.length < 2) return;
    
    const cx = canvas.width / 2;
    const cy = canvas.height / 2;
    const cr = config.radius ?? Math.min(canvas.width, canvas.height) / 2 - 12;
    const trailColor = getTrailColor();
    
    for (let i = 1; i < trailData.length; i++) {
      const p0 = trailData[i - 1];
      const p1 = trailData[i];
      const t = i / trailData.length;
      const x0 = cx + p0.x * cr;
      const y0 = cy + p0.y * cr;
      const x1 = cx + p1.x * cr;
      const y1 = cy + p1.y * cr;
      
      if (!isFinite(x0) || !isFinite(y0) || !isFinite(x1) || !isFinite(y1)) continue;
      
      ctx.beginPath();
      ctx.moveTo(x0, y0);
      ctx.lineTo(x1, y1);
      ctx.lineWidth = (config.trailWidth ?? 12) * (t * 2);
      ctx.lineCap = 'round';
      ctx.strokeStyle = trailColor;
      ctx.stroke();
    }
  }
  
  function addPoint(x, y) {
    trail.push({ x, y });
    const trailLength = config.trailLength ?? config.trailSize ?? config.trail ?? 8;
    while (trail.length > trailLength) trail.shift();
  }
  
  function getTrail() {
    return trail;
  }
  
  function clear() {
    trail = [];
    ctx.clearRect(0, 0, canvas.width, canvas.height);
  }
  
  return {
    config,
    resize,
    draw,
    addPoint,
    getTrail,
    clear
  };
}