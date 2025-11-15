// main.js
// Wire up UI, canvas, and websocket

(() => {
  const serverUrl = window.location.origin; // assumes same origin
  let roomId = new URLSearchParams(window.location.search).get('room') || 'default';
  const user = { id: 'u-' + Math.floor(Math.random() * 10000), name: 'User' + Math.floor(Math.random() * 1000), color: randomColor() };

  const socket = io(serverUrl);
  socket.on('connect', () => {
    socket.emit('join', { roomId, user });
  });

  const canvasEl = document.getElementById('canvas');
  const drawing = new DrawingCanvas(canvasEl);
  let latestOpLog = [];
  
  // Track user cursors - supports multiple users in same room
  const userCursors = new Map(); // userId -> { x, y, user, lastUpdate, leaving }
  const cursorsContainer = document.getElementById('cursorsContainer');

  const colorPicker = document.getElementById('colorPicker');
  const widthRange = document.getElementById('widthRange');
  const brushBtn = document.getElementById('brushBtn');
  const eraserBtn = document.getElementById('eraserBtn');
  const highlighterBtn = document.getElementById('highlighterBtn');
  const dashedBtn = document.getElementById('dashedBtn');
  const dottedBtn = document.getElementById('dottedBtn');
  const solidBtn = document.getElementById('solidBtn');
  const redoBtn = document.getElementById('redoBtn');
  const undoBtn = document.getElementById('undoBtn');
  const usersDiv = document.getElementById('users');

  let tool = 'brush';
  let shapeMode = null; // 'rect' | 'circle' | 'line'

  // header button active management
  const headerButtons = [brushBtn, eraserBtn, highlighterBtn, dashedBtn, dottedBtn, solidBtn];
  function clearHeaderActive() {
    headerButtons.forEach(b => b.classList.remove('active'));
  }
  function setHeaderActive(btn) {
    clearHeaderActive();
    if (btn) btn.classList.add('active');
  }
  // ensure selecting a header tool clears any active shape selection
  const originalSetHeaderActive = setHeaderActive;
  setHeaderActive = (btn) => {
    originalSetHeaderActive(btn);
    if (btn) {
      document.querySelectorAll('.shape-btn.active').forEach(x=>x.classList.remove('active'));
    }
  };

  brushBtn.onclick = () => { tool = 'brush'; setHeaderActive(brushBtn); /* clear shape selection */ document.querySelectorAll('.shape-btn.active').forEach(x=>x.classList.remove('active')); };
  eraserBtn.onclick = () => { tool = 'eraser'; setHeaderActive(eraserBtn); document.querySelectorAll('.shape-btn.active').forEach(x=>x.classList.remove('active')); };
  // initial header active
  setHeaderActive(brushBtn);
  // toolbar toggles
  let isHighlighter = false, isDashed = false, isDotted = false;
  highlighterBtn.onclick = () => { isHighlighter = !isHighlighter; highlighterBtn.classList.toggle('active', isHighlighter); setHeaderActive(isHighlighter ? highlighterBtn : brushBtn); if (isHighlighter) tool = 'brush'; };
  dashedBtn.onclick = () => {
    isDashed = !isDashed;
    if (isDashed) {
      isDotted = false; dottedBtn.classList.remove('active');
      setHeaderActive(dashedBtn);
    } else {
      setHeaderActive(brushBtn);
    }
    dashedBtn.classList.toggle('active', isDashed);
  };
  dottedBtn.onclick = () => {
    isDotted = !isDotted;
    if (isDotted) {
      isDashed = false; dashedBtn.classList.remove('active');
      setHeaderActive(dottedBtn);
    } else {
      setHeaderActive(brushBtn);
    }
    dottedBtn.classList.toggle('active', isDotted);
  };
  solidBtn.onclick = () => {
    // explicit solid/complete line: clear dashed/dotted
    isDashed = false; isDotted = false;
    dashedBtn.classList.remove('active'); dottedBtn.classList.remove('active');
    setHeaderActive(solidBtn);
  };
  
  // Define addRecentAction early so it's available for button handlers
  const recentActions = [];
  const recentActionsContainer = document.getElementById('recentActions');
  
  function addRecentAction(type, actionUser) {
    // type: 'undo' or 'redo'
    const action = {
      type,
      user: actionUser,
      timestamp: Date.now()
    };
    recentActions.unshift(action);
    // Keep only last 2
    if (recentActions.length > 2) {
      recentActions.pop();
    }
    updateRecentActions();
  }
  
  function updateRecentActions() {
    recentActionsContainer.innerHTML = '';
    if (recentActions.length === 0) return;
    
    recentActions.forEach((action, index) => {
      const actionEl = document.createElement('div');
      actionEl.className = 'recentActionItem';
      const icon = action.type === 'undo' ? '↶' : '↷';
      actionEl.innerHTML = `
        <span class="actionIcon" style="color: ${action.user.color}">${icon}</span>
        <span class="actionText">
          <span class="actionUserName" style="color: ${action.user.color}">${escapeHtml(action.user.name)}</span>
          <span class="actionType">${action.type === 'undo' ? 'undid' : 'redid'}</span>
        </span>
      `;
      recentActionsContainer.appendChild(actionEl);
    });
    
    // Auto-hide after 5 seconds
    setTimeout(() => {
      if (recentActions.length > 0) {
        recentActions.shift();
        updateRecentActions();
      }
    }, 5000);
  }

  undoBtn.onclick = () => {
    socket.emit('undo', { roomId, user });
    addRecentAction('undo', user);
  };
  redoBtn.onclick = () => {
    // compute last undone opId from latestOpLog and request redo for that target
    const target = findLastUndone(latestOpLog);
    socket.emit('redo', { roomId, user, targetOpId: target });
    addRecentAction('redo', user);
  };

  // shape toolbar
  document.getElementById('rectBtn').onclick = () => { shapeMode = 'rect'; tool = 'shape'; setHeaderActive(null); };
  document.getElementById('circleBtn').onclick = () => { shapeMode = 'circle'; tool = 'shape'; setHeaderActive(null); };
  document.getElementById('lineBtn').onclick = () => { shapeMode = 'line'; tool = 'shape'; setHeaderActive(null); };
  document.getElementById('roundedRectBtn').onclick = () => { shapeMode = 'roundedRect'; tool = 'shape'; setHeaderActive(null); };
  document.getElementById('diamondBtn').onclick = () => { shapeMode = 'diamond'; tool = 'shape'; setHeaderActive(null); };
  document.getElementById('triangleBtn').onclick = () => { shapeMode = 'triangle'; tool = 'shape'; setHeaderActive(null); };
  document.getElementById('pentagonBtn').onclick = () => { shapeMode = 'pentagon'; tool = 'shape'; setHeaderActive(null); };
  document.getElementById('hexagonBtn').onclick = () => { shapeMode = 'hexagon'; tool = 'shape'; setHeaderActive(null); };
  document.getElementById('starBtn').onclick = () => { shapeMode = 'star'; tool = 'shape'; setHeaderActive(null); };
  document.getElementById('arrowBtn').onclick = () => { shapeMode = 'arrow'; tool = 'shape'; setHeaderActive(null); };
  // cloud shape removed

  socket.on('userList', (users) => {
    // render user count + up to 4 users, then a +N more badge
    const countEl = document.getElementById('userCount');
    const listEl = document.getElementById('userList');
    if (!countEl || !listEl) return;
    countEl.textContent = users.length;
    // show up to 4 user entries
    const maxVisible = 4;
    listEl.innerHTML = '';
    const visible = users.slice(0, maxVisible);
      // hide individual user entries in the toolbar — show a compact "Users ▾" menu
      const menuBtn = document.createElement('div');
      menuBtn.className = 'userEntry userListButton';
      menuBtn.textContent = 'Users ▾';
      menuBtn.title = `${users.length} users connected`;
      listEl.appendChild(menuBtn);
    // populate dropdown full list
    const dd = document.getElementById('userDropdown');
    if (dd) {
      dd.innerHTML = '';
      users.forEach(u => {
        const e = document.createElement('div');
        e.className = 'entry';
        e.innerHTML = `<span class="userDot" style="background:${u.color}"></span><span class="name">${escapeHtml(u.name)}</span>`;
        dd.appendChild(e);
      });
    }
    
    // Clean up cursors for users who left the room
    const currentUserIds = new Set(users.map(u => u.id));
    userCursors.forEach((cursor, userId) => {
      if (!currentUserIds.has(userId)) {
        userCursors.delete(userId);
      }
    });
    updateCursors();
  });

  // Dropdown behavior: toggle on click, close on outside click or Escape
  (function setupUserDropdown(){
    const listEl = document.getElementById('userList');
    const countEl = document.getElementById('userCount');
    const dd = document.getElementById('userDropdown');
    if (!listEl || !dd || !countEl) return;

    function open() {
      dd.classList.remove('hidden');
      dd.setAttribute('aria-hidden','false');
      listEl.setAttribute('aria-expanded','true');
    }
    function close() {
      dd.classList.add('hidden');
      dd.setAttribute('aria-hidden','true');
      listEl.setAttribute('aria-expanded','false');
    }

    listEl.addEventListener('click', (e) => { e.stopPropagation(); dd.classList.contains('hidden') ? open() : close(); });
    countEl.addEventListener('click', (e) => { e.stopPropagation(); dd.classList.contains('hidden') ? open() : close(); });
    // prevent clicks inside dropdown from bubbling to document (which would close it)
    dd.addEventListener('click', (e) => { e.stopPropagation(); });
    // close when clicking outside
    document.addEventListener('click', (ev) => { if (!dd.classList.contains('hidden')) close(); });
    // close on Esc
    document.addEventListener('keydown', (ev) => { if (ev.key === 'Escape') close(); });
  })();

  // Responsive toolbar: move toolbar controls into dropdown on small screens
  (function setupResponsiveToolbar(){
    const toolbar = document.getElementById('toolbar');
    const users = document.getElementById('users');
    const menu = document.getElementById('toolbarMenu');
    const dropdown = document.getElementById('toolbarDropdown');
    if (!toolbar || !menu || !dropdown || !users) return;

    let collapsed = false;

    function collapse() {
      if (collapsed) return;
      // move all toolbar children except users, menu, dropdown into dropdown
      const nodes = Array.from(toolbar.children).filter(n => n !== users && n !== menu && n !== dropdown);
      nodes.forEach(n => dropdown.appendChild(n));
      menu.setAttribute('aria-expanded','false');
      collapsed = true;
    }

    function expand() {
      if (!collapsed) return;
      // move back elements from dropdown to toolbar before users
      const nodes = Array.from(dropdown.children);
      nodes.forEach(n => toolbar.insertBefore(n, users));
      dropdown.classList.add('hidden');
      menu.setAttribute('aria-expanded','false');
      collapsed = false;
    }

    function update() {
      const w = window.innerWidth;
      if (w <= 900) collapse(); else expand();
    }

    menu.addEventListener('click', (e) => {
      e.stopPropagation();
      if (dropdown.classList.contains('hidden')) {
        dropdown.classList.remove('hidden');
        dropdown.setAttribute('aria-hidden','false');
        menu.setAttribute('aria-expanded','true');
      } else {
        dropdown.classList.add('hidden');
        dropdown.setAttribute('aria-hidden','true');
        menu.setAttribute('aria-expanded','false');
      }
    });

    // close dropdown when clicking outside
    document.addEventListener('click', () => { if (!dropdown.classList.contains('hidden')) { dropdown.classList.add('hidden'); dropdown.setAttribute('aria-hidden','true'); menu.setAttribute('aria-expanded','false'); } });
    window.addEventListener('resize', update);
    // initial
    update();
  })();

  socket.on('snapshot', (msg) => {
    // remember latest opLog so UI can compute undo/redo targets
    latestOpLog = msg.opLog || [];
    // msg.opLog - replay on client to build strokes
    const strokes = replayOpLogToStrokes(msg.opLog);
    drawing.setStrokes(strokes);
    drawing.redraw(); // Ensure canvas is redrawn with new strokes
  });

  // Broadcast local drawing events
  let lastEmit = 0;
  function emitThrottle(evtName, payload) {
    // basic 30ms throttle
    const now = Date.now();
    if (now - lastEmit < 30 && evtName === 'strokePoint') return;
    lastEmit = now;
    socket.emit(evtName, payload);
  }

  // Pointer events
  let rect = canvasEl.getBoundingClientRect();
  window.addEventListener('resize', () => rect = canvasEl.getBoundingClientRect());

  function normalizePoint(e) {
    return { x: e.clientX - rect.left, y: e.clientY - rect.top };
  }

  canvasEl.addEventListener('pointerdown', (e) => {
    canvasEl.setPointerCapture(e.pointerId);
    const p = normalizePoint(e);
  const meta = { color: colorPicker.value, width: Number(widthRange.value), mode: tool };
  // attach toolbar flags into meta so they persist in the opLog
  if (isHighlighter) meta.highlighter = true;
  if (isDashed) meta.dashPattern = [10, 8];
  if (isDotted) meta.dashPattern = [2, 6];
  if (isHighlighter) meta.globalAlpha = 0.35;
    if (tool === 'shape' && shapeMode) {
      // start a temporary shape
      drawing.currentShape = { type: shapeMode, meta, start: p, end: p };
    } else {
      drawing.startLocalStroke(meta, p);
      emitThrottle('startStroke', { roomId, user, stroke: { meta, points: [p] } });
    }
  });

  canvasEl.addEventListener('pointermove', (e) => {
    const p = normalizePoint(e);
    // local prediction
    if (tool === 'shape' && drawing.currentShape) {
      drawing.currentShape.end = p;
      drawing.redraw();
      // draw preview
      drawing.drawPreviewShape(drawing.currentShape);
    } else {
      if (drawing.isDrawing) drawing.addPoint(p);
      emitThrottle('strokePoint', { roomId, user, point: p });
    }
    // cursor broadcast every 50ms for smoother tracking
    const now = Date.now();
    if (!lastCursorEmit || now - lastCursorEmit > 50) {
      socket.emit('cursor', { roomId, user, x: p.x, y: p.y });
      lastCursorEmit = now;
    }
  });
  
  // Also track cursor when mouse enters canvas
  canvasEl.addEventListener('pointerenter', (e) => {
    const p = normalizePoint(e);
    socket.emit('cursor', { roomId, user, x: p.x, y: p.y });
  });
  
  // Track cursor even when mouse leaves canvas (keep it visible briefly)
  canvasEl.addEventListener('pointerleave', (e) => {
    const p = normalizePoint(e);
    socket.emit('cursor', { roomId, user, x: p.x, y: p.y, leaving: true });
  });
  
  let lastCursorEmit = 0;

  canvasEl.addEventListener('pointerup', (e) => {
    canvasEl.releasePointerCapture(e.pointerId);
    if (tool === 'shape' && drawing.currentShape) {
      const shape = drawing.currentShape;
      drawing.currentShape = null;
      // convert shape to a stroke-like payload for server persistence
      const stroke = shapeToStroke(shape);
      drawing.strokes.push(stroke);
      socket.emit('endStroke', { roomId, user, stroke });
      drawing.redraw();
    } else {
      const finished = drawing.endLocalStroke();
      if (finished) socket.emit('endStroke', { roomId, user, stroke: finished });
    }
  });

  // Remote events mapping
  socket.on('startStroke', (msg) => {
    // create an ephemeral stroke for other user
    // msg.stroke: { meta, points }
    drawing.strokes.push({ meta: msg.stroke.meta, points: msg.stroke.points });
    drawing.redraw();
  });

  socket.on('strokePoint', (msg) => {
    // append point to last stroke from that user
    const p = msg.point;
    // naive: push to last strokes array
    const last = drawing.strokes[drawing.strokes.length - 1];
    if (last) {
      last.points.push(p);
      drawing.redraw();
    }
  });

  socket.on('endStroke', (msg) => {
    // msg contains opId and stroke; update local opId if necessary
    // For simplicity, we trust server persisted stroke; nothing else to do here
  });

  // Handle incoming cursor updates from other users
  socket.on('cursor', (msg) => {
    if (msg.roomId !== roomId) return; // Only show cursors from same room
    
    const { user: remoteUser, x, y, leaving } = msg;
    if (!remoteUser) return;
    
    // Don't show own cursor
    if (remoteUser.id === user.id) return;
    
    // Validate coordinates
    if (typeof x !== 'number' || typeof y !== 'number' || isNaN(x) || isNaN(y)) {
      return;
    }
    
    // Update cursor position for this user
    const now = Date.now();
    userCursors.set(remoteUser.id, { 
      x, 
      y, 
      user: remoteUser, 
      lastUpdate: now,
      leaving: leaving || false
    });
    
    // Update display immediately
    updateCursors();
  });
  
  // Update cursor display with smooth animations
  function updateCursors() {
    const rect = canvasEl.getBoundingClientRect();
    const now = Date.now();
    const timeout = 3000; // Hide cursor after 3 seconds of no updates
    
    // Remove old cursors
    userCursors.forEach((cursor, userId) => {
      if (now - cursor.lastUpdate > timeout) {
        userCursors.delete(userId);
      }
    });
    
    // Get existing cursor elements to update smoothly
    const existingCursors = new Map();
    Array.from(cursorsContainer.children).forEach(el => {
      const userId = el.dataset.userId;
      if (userId) existingCursors.set(userId, el);
    });
    
    // Update or create cursor elements for ALL users in the room
    userCursors.forEach((cursor, userId) => {
      let cursorEl = existingCursors.get(userId);
      
      if (!cursorEl) {
        // Create new cursor element for this user
        cursorEl = document.createElement('div');
        cursorEl.className = 'userCursor';
        cursorEl.dataset.userId = userId;
        cursorEl.setAttribute('data-user-name', escapeHtml(cursor.user.name));
        cursorEl.innerHTML = `
          <div class="cursorDot" style="background-color: ${cursor.user.color}; border-color: ${cursor.user.color}"></div>
          <div class="cursorLabel" style="background-color: ${cursor.user.color}">${escapeHtml(cursor.user.name)}</div>
        `;
        cursorsContainer.appendChild(cursorEl);
        
        // Animate in
        cursorEl.style.opacity = '0';
        cursorEl.style.transform = `translate(${rect.left + cursor.x}px, ${rect.top + cursor.y}px) translate(-50%, -50%) scale(0)`;
        setTimeout(() => {
          cursorEl.style.transition = 'opacity 0.3s ease, transform 0.3s ease';
          cursorEl.style.opacity = '1';
          cursorEl.style.transform = `translate(${rect.left + cursor.x}px, ${rect.top + cursor.y}px) translate(-50%, -50%) scale(1)`;
        }, 10);
      }
      
      // Update position smoothly
      const newLeft = rect.left + cursor.x;
      const newTop = rect.top + cursor.y;
      
      // Use transform for better performance and smooth animation
      cursorEl.style.transform = `translate(${newLeft}px, ${newTop}px) translate(-50%, -50%)`;
      cursorEl.style.opacity = cursor.leaving ? '0.5' : '1';
      
      // Update label color
      const labelEl = cursorEl.querySelector('.cursorLabel');
      if (labelEl) {
        labelEl.style.backgroundColor = cursor.user.color;
      }
      const dotEl = cursorEl.querySelector('.cursorDot');
      if (dotEl) {
        dotEl.style.backgroundColor = cursor.user.color;
        dotEl.style.borderColor = cursor.user.color;
      }
    });
    
    // Remove cursors that no longer exist
    existingCursors.forEach((el, userId) => {
      if (!userCursors.has(userId)) {
        el.style.opacity = '0';
        el.style.transform = el.style.transform + ' scale(0)';
        setTimeout(() => {
          if (el.parentNode) el.parentNode.removeChild(el);
        }, 200);
      }
    });
  }
  
  // Update cursors more frequently for smoother movement
  setInterval(updateCursors, 50);
  window.addEventListener('resize', updateCursors);
  
  // Also update cursors when canvas container moves
  if (typeof ResizeObserver !== 'undefined') {
    const resizeObserver = new ResizeObserver(() => updateCursors());
    resizeObserver.observe(canvasEl);
  }


  socket.on('undo', (msg) => {
    // msg.targetOpId -> ask server for full opLog via snapshot
    if (msg.user && msg.user.id !== user.id) {
      addRecentAction('undo', msg.user);
    }
    socket.emit('requestSnapshot', { roomId });
  });

  socket.on('redo', (msg) => {
    if (msg.user && msg.user.id !== user.id) {
      addRecentAction('redo', msg.user);
    }
    socket.emit('requestSnapshot', { roomId });
  });

  function findLastUndone(opLog) {
    if (!opLog || opLog.length === 0) return null;
    // Build undo stack: push on 'undo', remove on 'redo'. Top of stack is last undone.
    const stack = [];
    for (const op of opLog) {
      if (op.type === 'undo') stack.push(op.payload.targetOpId);
      else if (op.type === 'redo') {
        const idx = stack.lastIndexOf(op.payload.targetOpId);
        if (idx !== -1) stack.splice(idx, 1);
      }
    }
    return stack.length ? stack[stack.length - 1] : null;
  }

  function replayOpLogToStrokes(opLog) {
    // Rebuild visible strokes in the same way server.replay() does:
    // - on 'stroke' push the stroke into timeline
    // - on 'undo' remove the target stroke from the current timeline
    // - on 'redo' re-insert the target stroke at the time of redo (push)
    const strokes = [];
    const strokeMap = new Map();

    for (const op of opLog || []) {
      if (op.type === 'stroke') {
        const item = { meta: op.payload.stroke.meta, points: op.payload.stroke.points, opId: op.opId };
        strokeMap.set(op.opId, item);
        strokes.push(item);
      } else if (op.type === 'undo') {
        const target = op.payload.targetOpId;
        // remove the most-recent occurrence (last) so undo acts LIFO when duplicates exist
        for (let i = strokes.length - 1; i >= 0; i--) {
          if (strokes[i].opId === target) { strokes.splice(i, 1); break; }
        }
      } else if (op.type === 'redo') {
        const target = op.payload.targetOpId;
        const s = strokeMap.get(target);
        if (s) strokes.push(s);
      }
    }

    return strokes;
  }

  function randomColor() {
    return '#' + Math.floor(Math.random() * 16777215).toString(16).padStart(6, '0');
  }

  function shapeToStroke(shape) {
    // Create a simple stroke representation for shapes: meta + few points approximating shape
    const meta = Object.assign({}, shape.meta);
    // tag this stroke as a shape so drawing code can render it accurately (no smoothing)
    meta.shape = shape.type;
    meta.shapeBounds = { start: shape.start, end: shape.end };
    if (shape.type === 'line') {
      return { meta, points: [shape.start, shape.end] };
    }
    if (shape.type === 'rect') {
      const s = shape.start, e = shape.end;
      const points = [s, { x: e.x, y: s.y }, e, { x: s.x, y: e.y }, s];
      return { meta, points };
    }
    if (shape.type === 'circle') {
      // approximate circle with 8 points
      const cx = (shape.start.x + shape.end.x) / 2;
      const cy = (shape.start.y + shape.end.y) / 2;
      const rx = Math.abs(shape.end.x - shape.start.x) / 2;
      const ry = Math.abs(shape.end.y - shape.start.y) / 2;
      const pts = [];
      for (let i = 0; i < 8; i++) {
        const a = (i / 8) * Math.PI * 2;
        pts.push({ x: cx + Math.cos(a) * rx, y: cy + Math.sin(a) * ry });
      }
      pts.push(pts[0]);
      return { meta, points: pts };
    }
    // Additional shapes approximated as polygons or have explicit params in meta
    const s = shape.start, e = shape.end;
    const cx = (s.x + e.x) / 2; const cy = (s.y + e.y) / 2;
    const rx = Math.abs(e.x - s.x) / 2; const ry = Math.abs(e.y - s.y) / 2;
    if (shape.type === 'diamond') {
      // diamond is square rotated 45 deg -> 4 points
      const pts = [ {x:cx, y: s.y}, {x: e.x, y: cy}, {x:cx, y: e.y}, {x: s.x, y: cy}, {x:cx, y: s.y} ];
      return { meta, points: pts };
    }
    if (shape.type === 'triangle') {
      // equilateral-ish triangle: top and bottom corners
      const pts = [ {x:cx, y: s.y}, {x: e.x, y: e.y}, {x: s.x, y: e.y}, {x:cx, y: s.y} ];
      return { meta, points: pts };
    }
    if (shape.type === 'pentagon' || shape.type === 'hexagon') {
      const sides = shape.type === 'pentagon' ? 5 : 6;
      const pts = [];
      for (let i = 0; i < sides; i++) {
        const a = (i / sides) * Math.PI * 2 - Math.PI/2;
        pts.push({ x: cx + Math.cos(a) * rx, y: cy + Math.sin(a) * ry });
      }
      pts.push(pts[0]);
      return { meta, points: pts };
    }
    if (shape.type === 'star') {
      // 5-point star with inner radius
      const pts = [];
      const spikes = 5;
      const innerR = Math.min(rx, ry) * 0.5;
      for (let i = 0; i < spikes * 2; i++) {
        const r = i % 2 === 0 ? Math.max(rx, ry) : innerR;
        const a = (i / (spikes*2)) * Math.PI * 2 - Math.PI/2;
        pts.push({ x: cx + Math.cos(a) * r, y: cy + Math.sin(a) * r });
      }
      pts.push(pts[0]);
      return { meta, points: pts };
    }
    if (shape.type === 'arrow') {
      // represent arrow as line with head params in meta
      meta.shapeParams = { headLength: Math.max(rx, ry) * 0.4 };
      return { meta, points: [ {x:s.x, y:s.y}, {x:e.x, y:e.y} ] };
    }
    if (shape.type === 'roundedRect') {
      meta.shapeParams = { radius: Math.min(rx, ry) * 0.2 };
      return { meta, points: [s, e] };
    }
    
    // fallback
    return { meta, points: [shape.start, shape.end] };
  }

  function escapeHtml(s){ return String(s).replace(/[&<>"']/g, c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":"&#39;"}[c])) }

  // Initialize shape buttons: inject icon SVG + label, and manage active state
  (function initShapeButtons(){
    const btns = document.querySelectorAll('.shape-btn');
    function svgFor(name){
      name = name.toLowerCase();
      if (name === 'line') return `<svg viewBox="0 0 24 24" class="icon" xmlns="http://www.w3.org/2000/svg"><line x1="3" y1="21" x2="21" y2="3" stroke="currentColor" stroke-width="2" stroke-linecap="round"/></svg>`;
      if (name === 'rectangle' || name === 'rect') return `<svg viewBox="0 0 24 24" class="icon" xmlns="http://www.w3.org/2000/svg"><rect x="3" y="6" width="18" height="12" stroke="currentColor" fill="none" stroke-width="2" rx="0"/></svg>`;
      if (name === 'rounded rect' || name === 'roundedrect') return `<svg viewBox="0 0 24 24" class="icon" xmlns="http://www.w3.org/2000/svg"><rect x="3" y="6" width="18" height="12" stroke="currentColor" fill="none" stroke-width="2" rx="3"/></svg>`;
      if (name === 'circle') return `<svg viewBox="0 0 24 24" class="icon" xmlns="http://www.w3.org/2000/svg"><circle cx="12" cy="12" r="7" stroke="currentColor" fill="none" stroke-width="2"/></svg>`;
      if (name === 'diamond') return `<svg viewBox="0 0 24 24" class="icon" xmlns="http://www.w3.org/2000/svg"><polygon points="12,3 21,12 12,21 3,12" stroke="currentColor" fill="none" stroke-width="2"/></svg>`;
      if (name === 'triangle') return `<svg viewBox="0 0 24 24" class="icon" xmlns="http://www.w3.org/2000/svg"><polygon points="12,4 20,18 4,18" stroke="currentColor" fill="none" stroke-width="2"/></svg>`;
      if (name === 'pentagon') return `<svg viewBox="0 0 24 24" class="icon" xmlns="http://www.w3.org/2000/svg"><polygon points="12,3 20,9 16,20 8,20 4,9" stroke="currentColor" fill="none" stroke-width="2"/></svg>`;
      if (name === 'hexagon') return `<svg viewBox="0 0 24 24" class="icon" xmlns="http://www.w3.org/2000/svg"><polygon points="6,4 18,4 22,12 18,20 6,20 2,12" stroke="currentColor" fill="none" stroke-width="2"/></svg>`;
      if (name === 'star') return `<svg viewBox="0 0 24 24" class="icon" xmlns="http://www.w3.org/2000/svg"><polygon points="12,2 14.9,8.5 22,9.3 16.5,13.8 18.2,21 12,17.7 5.8,21 7.5,13.8 2,9.3 9.1,8.5" stroke="currentColor" fill="none" stroke-width="1.5"/></svg>`;
      if (name === 'arrow') return `<svg viewBox="0 0 24 24" class="icon" xmlns="http://www.w3.org/2000/svg"><line x1="4" y1="12" x2="18" y2="12" stroke="currentColor" stroke-width="2" stroke-linecap="round"/><polygon points="18,12 14,9 14,15" fill="currentColor"/></svg>`;
      
      return `<svg viewBox="0 0 24 24" class="icon" xmlns="http://www.w3.org/2000/svg"><rect x="3" y="6" width="18" height="12" stroke="currentColor" fill="none" stroke-width="2"/></svg>`;
    }

    btns.forEach(b => {
      const name = b.dataset.name || b.id || 'shape';
      b.innerHTML = `<span class="icon">${svgFor(name)}</span><span class="label">${name}</span>`;
      b.addEventListener('click', (ev) => {
        // clear other active
        btns.forEach(x => x.classList.remove('active'));
        b.classList.add('active');
        // set tool/shapeMode based on id
        const id = b.id;
        // match id to shapeMode used above
        shapeMode = id.replace(/Btn$/, '');
        tool = 'shape';
      });
    });
  })();

  // Room management functionality
  (function setupRoomControl() {
    const roomControl = document.getElementById('roomControl');
    const roomBtn = document.getElementById('roomBtn');
    const roomDropdown = document.getElementById('roomDropdown');
    const roomNameInput = document.getElementById('roomNameInput');
    const createRoomBtn = document.getElementById('createRoomBtn');
    const roomList = document.getElementById('roomList');
    const currentRoomName = document.getElementById('currentRoomName');

    // Check if all elements exist
    if (!roomControl || !roomBtn || !roomDropdown || !roomNameInput || !createRoomBtn || !roomList || !currentRoomName) {
      console.error('Room control elements not found. Please check that all room control elements exist in the HTML.');
      return;
    }

    // Ensure dropdown starts hidden
    roomDropdown.classList.add('hidden');
    roomDropdown.setAttribute('aria-hidden', 'true');

    // Store recent rooms in localStorage
    function getRecentRooms() {
      try {
        const stored = localStorage.getItem('recentRooms');
        return stored ? JSON.parse(stored) : [];
      } catch (e) {
        return [];
      }
    }

    function saveRecentRoom(room) {
      const recent = getRecentRooms();
      // Remove if already exists
      const filtered = recent.filter(r => r.id !== room.id);
      // Add to front
      filtered.unshift(room);
      // Keep only last 10
      const trimmed = filtered.slice(0, 10);
      try {
        localStorage.setItem('recentRooms', JSON.stringify(trimmed));
      } catch (e) {
        // Ignore storage errors
      }
      return trimmed;
    }

    function updateRoomList() {
      const recent = getRecentRooms();
      roomList.innerHTML = '';
      
      if (recent.length === 0) {
        const emptyMsg = document.createElement('div');
        emptyMsg.className = 'roomItem';
        emptyMsg.style.cursor = 'default';
        emptyMsg.style.color = '#6b7280';
        emptyMsg.textContent = 'No recent rooms';
        roomList.appendChild(emptyMsg);
        return;
      }

      recent.forEach(room => {
        const item = document.createElement('div');
        item.className = 'roomItem' + (room.id === roomId ? ' active' : '');
        item.innerHTML = `
          <span class="roomItemName">${escapeHtml(room.name || room.id)}</span>
          <span class="roomItemBadge">${room.id}</span>
        `;
        item.addEventListener('click', (e) => {
          e.preventDefault();
          e.stopPropagation();
          if (room.id !== roomId) {
            switchToRoom(room.id, room.name);
          } else {
            // If clicking on current room, just close the dropdown
            closeRoomDropdown();
          }
        });
        roomList.appendChild(item);
      });
    }

    function updateCurrentRoomName() {
      const recent = getRecentRooms();
      const currentRoom = recent.find(r => r.id === roomId);
      currentRoomName.textContent = currentRoom ? (currentRoom.name || roomId) : roomId;
    }

    function switchToRoom(newRoomId, roomName) {
      if (newRoomId === roomId) {
        closeRoomDropdown();
        return;
      }
      
      // Validate room ID
      if (!newRoomId || newRoomId.trim().length === 0) {
        console.error('Invalid room ID');
        return;
      }
      
      // Leave current room (use old roomId before updating)
      const oldRoomId = roomId;
      if (socket && socket.connected) {
        socket.emit('leave', { roomId: oldRoomId });
      }
      
      // Update roomId immediately
      roomId = newRoomId;
      
      // Save to recent rooms
      saveRecentRoom({ id: newRoomId, name: roomName || newRoomId });
      
      // Update URL without reload
      const url = new URL(window.location);
      if (newRoomId === 'default') {
        url.searchParams.delete('room');
      } else {
        url.searchParams.set('room', newRoomId);
      }
      window.history.pushState({}, '', url);
      
      // Clear canvas immediately
      drawing.setStrokes([]);
      drawing.redraw();
      latestOpLog = [];
      
      // Clear all cursors when switching rooms
      userCursors.clear();
      if (cursorsContainer) {
        cursorsContainer.innerHTML = '';
      }
      
      // Join new room - ensure socket is connected
      if (socket) {
        if (socket.connected) {
          socket.emit('join', { roomId, user });
          // Request snapshot after a short delay to ensure room is joined
          setTimeout(() => {
            if (socket.connected) {
              socket.emit('requestSnapshot', { roomId });
            }
          }, 100);
        } else {
          // If socket not connected, wait for connection
          const connectHandler = () => {
            socket.emit('join', { roomId, user });
            setTimeout(() => {
              socket.emit('requestSnapshot', { roomId });
            }, 100);
            socket.off('connect', connectHandler);
          };
          socket.on('connect', connectHandler);
        }
      } else {
        console.error('Socket not initialized');
      }
      
      // Update UI
      updateCurrentRoomName();
      updateRoomList();
      
      // Close dropdown after switching rooms
      closeRoomDropdown();
    }

    function openRoomDropdown() {
      roomDropdown.classList.remove('hidden');
      roomDropdown.setAttribute('aria-hidden', 'false');
      roomBtn.setAttribute('aria-expanded', 'true');
      // Force display to ensure visibility
      roomDropdown.style.display = 'block';
      roomDropdown.style.visibility = 'visible';
      roomDropdown.style.opacity = '1';
      updateRoomList();
      // Focus input after a brief delay
      setTimeout(() => {
        if (roomNameInput) roomNameInput.focus();
      }, 100);
    }

    function closeRoomDropdown() {
      roomDropdown.classList.add('hidden');
      roomDropdown.setAttribute('aria-hidden', 'true');
      roomBtn.setAttribute('aria-expanded', 'false');
      // Force hide to ensure it's not visible
      roomDropdown.style.display = 'none';
      roomDropdown.style.visibility = 'hidden';
      roomDropdown.style.opacity = '0';
      if (roomNameInput) roomNameInput.value = '';
    }

    // Room button click - ensure it works properly
    roomBtn.addEventListener('click', (e) => {
      e.preventDefault();
      e.stopPropagation();
      if (roomDropdown.classList.contains('hidden')) {
        openRoomDropdown();
      } else {
        closeRoomDropdown();
      }
    });

    // Also handle mousedown to ensure responsiveness
    roomBtn.addEventListener('mousedown', (e) => {
      e.stopPropagation();
    });

    // Create/Join room button
    createRoomBtn.addEventListener('click', (e) => {
      e.preventDefault();
      e.stopPropagation();
      
      const roomName = roomNameInput.value.trim();
      if (!roomName) {
        roomNameInput.focus();
        roomNameInput.style.borderColor = '#ef4444';
        setTimeout(() => {
          roomNameInput.style.borderColor = '';
        }, 2000);
        return;
      }
      
      // Disable button during creation
      createRoomBtn.disabled = true;
      createRoomBtn.textContent = 'Creating...';
      
      // Generate room ID from name (sanitize)
      let newRoomId = roomName.toLowerCase()
        .replace(/[^a-z0-9]/g, '-')
        .replace(/-+/g, '-')
        .replace(/^-|-$/g, '');
      
      // If sanitization resulted in empty string, use a fallback
      if (!newRoomId || newRoomId.length === 0) {
        newRoomId = 'room-' + Date.now();
      }
      
      // Ensure room ID is not too long (max 50 chars)
      if (newRoomId.length > 50) {
        newRoomId = newRoomId.substring(0, 50);
      }
      
      // Clear input
      roomNameInput.value = '';
      
      // Switch to new room
      try {
        switchToRoom(newRoomId, roomName);
        // Note: switchToRoom() now closes the dropdown automatically
        // Re-enable button after successful creation
        setTimeout(() => {
          createRoomBtn.disabled = false;
          createRoomBtn.textContent = 'Create/Join';
        }, 500);
      } catch (error) {
        console.error('Error creating room:', error);
        createRoomBtn.textContent = 'Error - Try Again';
        setTimeout(() => {
          createRoomBtn.disabled = false;
          createRoomBtn.textContent = 'Create/Join';
        }, 2000);
      }
    });

    // Enter key in input
    roomNameInput.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') {
        createRoomBtn.click();
      } else if (e.key === 'Escape') {
        closeRoomDropdown();
      }
    });

    // Close dropdown when clicking outside
    document.addEventListener('click', (e) => {
      // Check if click is outside both roomControl and roomDropdown
      const isClickInside = roomControl.contains(e.target) || roomDropdown.contains(e.target);
      if (!isClickInside && !roomDropdown.classList.contains('hidden')) {
        closeRoomDropdown();
      }
    });

    // Prevent clicks inside dropdown from closing it
    roomDropdown.addEventListener('click', (e) => {
      e.stopPropagation();
    });

    // Initialize
    updateCurrentRoomName();
    // Save current room to recent if not already there
    const recent = getRecentRooms();
    if (!recent.find(r => r.id === roomId)) {
      saveRecentRoom({ id: roomId, name: roomId });
    }
    updateRoomList();
  })();

})();
