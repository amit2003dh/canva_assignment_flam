// canvas.js
// Handles drawing on HTML5 canvas with smoothing, batching, and local prediction.

class DrawingCanvas {
  constructor(canvasEl) {
    this.canvas = canvasEl;
    this.ctx = canvasEl.getContext('2d');
    this.dpr = window.devicePixelRatio || 1;
    // initialize drawing state before calling resize/redraw
    this.isDrawing = false;
    this.currentStroke = null;
    this.strokes = []; // local cache of drawn strokes (replayed from opLog)
    this.resize();

    // bind
    window.addEventListener('resize', () => this.resize());
  }

  resize() {
    const rect = this.canvas.getBoundingClientRect();
    this.canvas.width = rect.width * this.dpr;
    this.canvas.height = rect.height * this.dpr;
    this.canvas.style.width = rect.width + 'px';
    this.canvas.style.height = rect.height + 'px';
    // Reset transform then apply devicePixelRatio scaling. Use setTransform to avoid
    // accumulating scale on repeated resizes.
    this.ctx.setTransform(this.dpr, 0, 0, this.dpr, 0, 0);
    this.redraw();
  }

  startLocalStroke(meta, point) {
    this.isDrawing = true;
    this.currentStroke = { meta, points: [point] };
    this.drawSegment(this.currentStroke.points, meta);
  }

  addPoint(point) {
    if (!this.isDrawing || !this.currentStroke) return;
    this.currentStroke.points.push(point);
    // draw incremental
    this.drawSegment(this.currentStroke.points, this.currentStroke.meta);
  }

  endLocalStroke() {
    if (!this.currentStroke) return null;
    const finished = this.currentStroke;
    this.strokes.push(finished);
    this.currentStroke = null;
    this.isDrawing = false;
    return finished;
  }

  setStrokes(strokes) {
    this.strokes = strokes;
    this.redraw();
  }

  clear() {
    this.ctx.clearRect(0, 0, this.canvas.width / this.dpr, this.canvas.height / this.dpr);
  }

  redraw() {
    this.clear();
    // draw all strokes
    for (const s of this.strokes) {
      this.drawStroke(s);
    }
  }

  // Draw a preview for a shape (not persisted until pointerup)
  drawPreviewShape(shape) {
    if (!shape) return;
    const { type, start, end, meta } = shape;
    // save state
    this.ctx.save();
    // apply meta styling (dash, alpha, fill) for preview
    this.ctx.lineWidth = meta.width;
    this.ctx.strokeStyle = meta.mode === 'eraser' ? '#ffffff' : meta.color;
    if (meta.dashPattern) this.ctx.setLineDash(meta.dashPattern);
    else this.ctx.setLineDash([]);
    if (meta.globalAlpha) this.ctx.globalAlpha = meta.globalAlpha;
    if (meta.fill) this.ctx.fillStyle = meta.color;
    this.ctx.beginPath();
    if (type === 'line') {
      this.ctx.moveTo(start.x, start.y);
      this.ctx.lineTo(end.x, end.y);
      this.ctx.stroke();
    } else if (type === 'rect') {
      const x = Math.min(start.x, end.x);
      const y = Math.min(start.y, end.y);
      const w = Math.abs(end.x - start.x);
      const h = Math.abs(end.y - start.y);
      if (meta.fill) this.ctx.fillRect(x, y, w, h);
      this.ctx.strokeRect(x, y, w, h);
    } else if (type === 'triangle' || type === 'pentagon' || type === 'hexagon' || type === 'star') {
      const cx = (start.x + end.x) / 2; const cy = (start.y + end.y) / 2;
      const rx = Math.abs(end.x - start.x) / 2; const ry = Math.abs(end.y - start.y) / 2;
      let sides = 3;
      if (type === 'pentagon') sides = 5;
      if (type === 'hexagon') sides = 6;
      if (type === 'triangle') sides = 3;
      const pts = [];
      if (type === 'star') {
        const spikes = 5; const inner = Math.min(rx, ry) * 0.5;
        for (let i = 0; i < spikes * 2; i++) {
          const r = i % 2 === 0 ? Math.max(rx, ry) : inner;
          const a = (i / (spikes*2)) * Math.PI * 2 - Math.PI/2;
          pts.push({ x: cx + Math.cos(a) * r, y: cy + Math.sin(a) * r });
        }
      } else {
        for (let i = 0; i < sides; i++) {
          const a = (i / sides) * Math.PI * 2 - Math.PI/2;
          pts.push({ x: cx + Math.cos(a) * rx, y: cy + Math.sin(a) * ry });
        }
      }
      pts.push(pts[0]);
      this._strokePoints(pts);
    } else if (type === 'arrow') {
      // simple arrow preview: line + triangular head
      this.ctx.moveTo(start.x, start.y);
      this.ctx.lineTo(end.x, end.y);
      this.ctx.stroke();
      const head = Math.max(Math.abs(end.x - start.x), Math.abs(end.y - start.y)) * 0.12;
      this._drawArrowHead(start, end, head);
    } else if (type === 'circle') {
      const cx = (start.x + end.x) / 2;
      const cy = (start.y + end.y) / 2;
      const rx = Math.abs(end.x - start.x) / 2;
      const ry = Math.abs(end.y - start.y) / 2;
      this.ctx.ellipse(cx, cy, rx, ry, 0, 0, Math.PI * 2);
      this.ctx.stroke();
    }
    this.ctx.restore();
  }

  _strokePoints(pts) {
    if (!pts || pts.length === 0) return;
    this.ctx.beginPath();
    this.ctx.moveTo(pts[0].x, pts[0].y);
    for (let i = 1; i < pts.length; i++) this.ctx.lineTo(pts[i].x, pts[i].y);
    if (this.ctx.fillStyle && this.ctx.fillStyle !== '') {
      // if fill flagged, also fill the polygon area
      try { this.ctx.fill(); } catch (e) { /* ignore */ }
    }
    this.ctx.stroke();
  }

  _strokeRoundedRect(x,y,w,h,r){
    const ctx = this.ctx;
    ctx.beginPath();
    ctx.moveTo(x + r, y);
    ctx.arcTo(x + w, y, x + w, y + h, r);
    ctx.arcTo(x + w, y + h, x, y + h, r);
    ctx.arcTo(x, y + h, x, y, r);
    ctx.arcTo(x, y, x + w, y, r);
    ctx.closePath();
    ctx.stroke();
  }

  _drawArrowHead(start, end, head) {
    const dx = end.x - start.x, dy = end.y - start.y;
    const angle = Math.atan2(dy, dx);
    const ctx = this.ctx;
    ctx.save();
    ctx.beginPath();
    ctx.translate(end.x, end.y);
    ctx.rotate(angle);
    ctx.moveTo(0,0);
    ctx.lineTo(-head, head*0.6);
    ctx.lineTo(-head, -head*0.6);
    ctx.closePath();
    ctx.fillStyle = ctx.strokeStyle;
    ctx.fill();
    ctx.restore();
  }

  drawStroke(s) {
    const { meta, points } = s; // meta: { color, width, mode }
    const isSegment = !!s._isSegment;
    if (!points || points.length === 0) return;

    // If this stroke represents a shape, draw the exact shape (no smoothing)
    if (meta && meta.shape) {
      this.ctx.save();
      this.ctx.lineCap = 'round';
      this.ctx.lineJoin = 'round';
      this.ctx.strokeStyle = meta.mode === 'eraser' ? '#ffffff' : meta.color;
      this.ctx.lineWidth = meta.width;
      if (meta.dashPattern) this.ctx.setLineDash(meta.dashPattern);
      else this.ctx.setLineDash([]);
      if (meta.globalAlpha) this.ctx.globalAlpha = meta.globalAlpha;
      if (meta.fill) this.ctx.fillStyle = meta.color;
      if (meta.shape === 'line') {
        const p0 = points[0];
        const p1 = points[points.length - 1];
        this.ctx.beginPath();
        this.ctx.moveTo(p0.x, p0.y);
        this.ctx.lineTo(p1.x, p1.y);
        this.ctx.stroke();
        this.ctx.restore();
        return;
      }
      if (meta.shape === 'rect') {
        // use bounds if available
        const b = meta.shapeBounds || { start: points[0], end: points[2] };
        const x = Math.min(b.start.x, b.end.x);
        const y = Math.min(b.start.y, b.end.y);
        const w = Math.abs(b.end.x - b.start.x);
        const h = Math.abs(b.end.y - b.start.y);
        if (!isSegment && meta.fill) this.ctx.fillRect(x, y, w, h);
        this.ctx.strokeRect(x, y, w, h);
        this.ctx.restore();
        return;
      }
      if (meta.shape === 'roundedRect') {
        const b = meta.shapeBounds || { start: points[0], end: points[1] };
        const x = Math.min(b.start.x, b.end.x);
        const y = Math.min(b.start.y, b.end.y);
        const w = Math.abs(b.end.x - b.start.x);
        const h = Math.abs(b.end.y - b.start.y);
        const r = (meta.shapeParams && meta.shapeParams.radius) || Math.min(w,h)*0.12;
        this._strokeRoundedRect(x,y,w,h,r);
        if (!isSegment && meta.fill) {
          try { this.ctx.fill(); } catch (e) {}
        }
        this.ctx.restore();
        return;
      }
      if (meta.shape === 'arrow') {
        const p0 = points[0];
        const p1 = points[points.length - 1];
        this.ctx.beginPath();
        this.ctx.moveTo(p0.x, p0.y);
        this.ctx.lineTo(p1.x, p1.y);
        this.ctx.stroke();
        const head = (meta.shapeParams && meta.shapeParams.headLength) || Math.max(Math.abs(p1.x-p0.x), Math.abs(p1.y-p0.y))*0.12;
        this._drawArrowHead(p0,p1,head);
        this.ctx.restore();
        return;
      }
      
      if (meta.shape === 'circle') {
        const b = meta.shapeBounds || { start: points[0], end: points[4] };
        const cx = (b.start.x + b.end.x) / 2;
        const cy = (b.start.y + b.end.y) / 2;
        const rx = Math.abs(b.end.x - b.start.x) / 2;
        const ry = Math.abs(b.end.y - b.start.y) / 2;
        this.ctx.beginPath();
        this.ctx.ellipse(cx, cy, rx, ry, 0, 0, Math.PI * 2);
        if (!isSegment && meta.fill) try { this.ctx.fill(); } catch(e){}
        this.ctx.stroke();
        this.ctx.restore();
        return;
      }
      // fallback: draw polyline
      this.ctx.beginPath();
      const p0 = points[0];
      this.ctx.moveTo(p0.x, p0.y);
      for (let i = 1; i < points.length; i++) this.ctx.lineTo(points[i].x, points[i].y);
  if (!isSegment && meta.fill) try { this.ctx.fill(); } catch(e){}
  this.ctx.stroke();
  this.ctx.restore();
  return;
    }

    // Default freehand stroke: smoothing with quadratic curves
  this.ctx.save();
    this.ctx.lineCap = 'round';
    this.ctx.lineJoin = 'round';
    this.ctx.strokeStyle = meta.mode === 'eraser' ? '#ffffff' : meta.color;
    this.ctx.lineWidth = meta.width;
    if (meta.dashPattern) this.ctx.setLineDash(meta.dashPattern);
    else this.ctx.setLineDash([]);
    if (meta.globalAlpha) this.ctx.globalAlpha = meta.globalAlpha;
    this.ctx.beginPath();
    const p0 = points[0];
    this.ctx.moveTo(p0.x, p0.y);
    for (let i = 1; i < points.length; i++) {
      const p = points[i];
      // simple smoothing: quadratic bezier using previous point
      const prev = points[i - 1];
      const midX = (prev.x + p.x) / 2;
      const midY = (prev.y + p.y) / 2;
      this.ctx.quadraticCurveTo(prev.x, prev.y, midX, midY);
    }
    this.ctx.stroke();
    this.ctx.restore();
  }

  drawSegment(points, meta) {
    // draw only the last segment for performance
    const len = points.length;
    if (len < 2) return;
    const lastPoints = points.slice(Math.max(0, len - 4));
    // draw on top of existing canvas (no full clear)
    // allow passing meta explicitly (for ephemeral segments) or fall back to currentStroke
    const useMeta = meta || (this.currentStroke && this.currentStroke.meta) || { color: '#000', width: 2 };
    this.drawStroke({ meta: useMeta, points: lastPoints, _isSegment: true });
  }
}

window.DrawingCanvas = DrawingCanvas;
