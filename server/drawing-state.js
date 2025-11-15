

const { v4: uuidv4 } 
const roomStates = new Map();

function ensureRoomState(roomId) {
  if (!roomStates.has(roomId)) {
    roomStates.set(roomId, {
      opLog: [],
      undoStack: [], 
      redoStack: [] 
    });
  }
  return roomStates.get(roomId);
}

function newOp(type, user, payload = {}) {
  return {
    opId: uuidv4(),
    type,
    user,
    ts: Date.now(),
    payload
  };
}

function appendOp(roomId, op) {
  const state = ensureRoomState(roomId);
  state.opLog.push(op);
}

function addStroke(roomId, user, stroke) {
  const state = ensureRoomState(roomId);
  const op = newOp('stroke', user, { stroke });
  appendOp(roomId, op);

  state.undoStack.push(op);
  state.redoStack.length = 0;
  return op;
}

function addUndo(roomId, user, targetOpId) {
  const state = ensureRoomState(roomId);
  // If no target provided, pop the top of undoStack
  let targetOp = null;
  if (!targetOpId) {
    if (state.undoStack.length === 0) return null;
    targetOp = state.undoStack.pop();
  } else {
    // find the most-recent occurrence in undoStack and remove it
    for (let i = state.undoStack.length - 1; i >= 0; i--) {
      if (state.undoStack[i].opId === targetOpId) { targetOp = state.undoStack.splice(i,1)[0]; break; }
    }
    if (!targetOp) return null; // nothing to undo
  }
  // push into redo stack
  state.redoStack.push(targetOp);
  const op = newOp('undo', user, { targetOpId: targetOp.opId });
  appendOp(roomId, op);
  return op;
}

function addRedo(roomId, user, targetOpId) {
  const state = ensureRoomState(roomId);
  // If no target provided, pop from redoStack
  let targetOp = null;
  if (!targetOpId) {
    if (state.redoStack.length === 0) return null;
    targetOp = state.redoStack.pop();
  } else {
    // find the most-recent occurrence in redoStack and remove it
    for (let i = state.redoStack.length - 1; i >= 0; i--) {
      if (state.redoStack[i].opId === targetOpId) { targetOp = state.redoStack.splice(i,1)[0]; break; }
    }
    if (!targetOp) return null;
  }
  // push back onto undoStack
  state.undoStack.push(targetOp);
  const op = newOp('redo', user, { targetOpId: targetOp.opId });
  appendOp(roomId, op);
  return op;
}

function getOpLog(roomId) {
  // Return the append-only opLog for auditing and client snapshots.
  const state = ensureRoomState(roomId);
  return state.opLog;
}

// Replay opLog to compute list of effective strokes in order.
// This returns an array of strokes to draw: each item {opId, user, stroke}
function replay(roomId) {
  const state = ensureRoomState(roomId);
  // We'll maintain a map of original stroke ops so redo can re-insert a
  // previously undone stroke at the point the redo occurs (chronological redo).
  const strokes = [];
  const strokeMap = new Map();

  for (const op of state.opLog) {
    if (op.type === 'stroke') {
      const item = { opId: op.opId, user: op.user, stroke: op.payload.stroke };
      strokeMap.set(op.opId, item);
      strokes.push(item);
    } else if (op.type === 'undo') {
      // remove the most-recent occurrence of the target stroke from current timeline (LIFO)
      const target = op.payload.targetOpId;
      for (let i = strokes.length - 1; i >= 0; i--) {
        if (strokes[i].opId === target) { strokes.splice(i, 1); break; }
      }
    } else if (op.type === 'redo') {
      // re-insert the target stroke at this position in timeline
      const target = op.payload.targetOpId;
      const s = strokeMap.get(target);
      if (s) strokes.push(s);
    }
  }

  return strokes;
}

// Find last stroke op that is not undone yet (for global undo semantics)
function findLastUndoableOp(roomId) {
  const state = ensureRoomState(roomId);
  // If we have an explicit undoStack, the last visible stroke is its top.
  if (state.undoStack.length === 0) return null;
  const top = state.undoStack[state.undoStack.length - 1];
  // return the opLog entry matching this opId
  for (let i = state.opLog.length - 1; i >= 0; i--) {
    if (state.opLog[i].opId === top.opId) return state.opLog[i];
  }
  return null;
}

module.exports = { newOp, appendOp, addStroke, addUndo, addRedo, getOpLog, replay, findLastUndoableOp };
