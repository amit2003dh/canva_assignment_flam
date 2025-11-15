// server.js
// Simple Express + Socket.io server to serve static client and handle realtime events.

const path = require('path');
const express = require('express');
const http = require('http');
const { Server } = require('socket.io');

const rooms = require('./rooms');
const drawingState = require('./drawing-state');

const app = express();
const server = http.createServer(app);
const io = new Server(server, { cors: { origin: '*' } });

const PORT = process.env.PORT || 3000;

// Serve static client
//app.use('/client', express.static(path.join(__dirname, '..', 'client')));
app.use(express.static(path.join(__dirname, '..', 'client')));


app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, '..', 'client', 'index.html'));
});

io.on('connection', (socket) => {
  console.log('socket connected', socket.id);

  // Join a room
  socket.on('join', (data) => {
    const { roomId, user } = data;
    socket.join(roomId);
    rooms.addUser(roomId, socket.id, user);

    // Send current user list
    const users = rooms.listUsers(roomId);
    io.to(roomId).emit('userList', users);

    // Send opLog snapshot to new client (room-specific)
    socket.emit('snapshot', { opLog: drawingState.getOpLog(roomId) });
  });

  socket.on('startStroke', (msg) => {
    // startStroke includes initial point and stroke metadata
    // We'll broadcast to room and create a temporary op entry when stroke ends
    socket.to(msg.roomId).emit('startStroke', msg);
  });

  socket.on('strokePoint', (msg) => {
    // broadcast streaming points
    socket.to(msg.roomId).emit('strokePoint', msg);
  });

  socket.on('endStroke', (msg) => {
    // Persist stroke as operation
    const { roomId, user, stroke } = msg;
    const op = drawingState.addStroke(roomId, user, stroke);
    // Broadcast endStroke + op metadata
    io.to(roomId).emit('endStroke', { ...msg, opId: op.opId });
    // Send updated opLog snapshot so clients can replay authoritative state
    io.to(roomId).emit('snapshot', { opLog: drawingState.getOpLog(roomId) });
  });

  socket.on('cursor', (msg) => {
    socket.to(msg.roomId).emit('cursor', msg);
  });

  socket.on('undo', (msg) => {
    // msg: { roomId, user, targetOpId? }
    // If client supplied targetOpId, use it; otherwise find last undoable op globally.
    const { roomId, user } = msg;
    let targetOpId = msg.targetOpId;
    if (!targetOpId) {
      const last = drawingState.findLastUndoableOp(roomId);
      if (last) targetOpId = last.opId;
    }
    if (!targetOpId) return; // nothing to undo
    const op = drawingState.addUndo(roomId, user, targetOpId);
    if (!op) return;
    io.to(roomId).emit('undo', { opId: op.opId, targetOpId: op.payload.targetOpId, user: user });
    io.to(roomId).emit('snapshot', { opLog: drawingState.getOpLog(roomId) });
  });

  socket.on('redo', (msg) => {
    // If client didn't specify a targetOpId, pick the most-recently undone stroke
    // (the top of the undo stack) so redo re-applies in the order the user undid.
    const { roomId, user } = msg;
    let targetOpId = msg.targetOpId;
    if (!targetOpId) {
      const opLog = drawingState.getOpLog(roomId);
      // Build an "undo stack" by processing ops in order: push on 'undo', remove on 'redo'
      const stack = [];
      for (const op of opLog) {
        if (op.type === 'undo') stack.push(op.payload.targetOpId);
        else if (op.type === 'redo') {
          // remove the most recent occurrence of this target from the stack
          const idx = stack.lastIndexOf(op.payload.targetOpId);
          if (idx !== -1) stack.splice(idx, 1);
        }
      }
      if (stack.length > 0) targetOpId = stack[stack.length - 1];
    }
    if (!targetOpId) return; // nothing to redo
    const op = drawingState.addRedo(roomId, user, targetOpId);
    if (!op) return;
    io.to(roomId).emit('redo', { opId: op.opId, targetOpId: op.payload.targetOpId, user: user });
    io.to(roomId).emit('snapshot', { opLog: drawingState.getOpLog(roomId) });
  });

  socket.on('requestSnapshot', (msg) => {
    // Send room-specific opLog snapshot to requesting client
    const { roomId } = msg;
    socket.emit('snapshot', { opLog: drawingState.getOpLog(roomId) });
  });

  socket.on('leave', (data) => {
    // Leave a room when switching rooms
    const { roomId } = data;
    socket.leave(roomId);
    rooms.removeUser(roomId, socket.id);
    const users = rooms.listUsers(roomId);
    io.to(roomId).emit('userList', users);
  });

  socket.on('disconnecting', () => {
    // Remove from all rooms
    for (const roomId of socket.rooms) {
      if (roomId === socket.id) continue;
      rooms.removeUser(roomId, socket.id);
      const users = rooms.listUsers(roomId);
      io.to(roomId).emit('userList', users);
    }
  });
});

server.listen(PORT, () => {
  console.log('Server running on port', PORT);
  console.log('Open http://localhost:' + PORT + '/');
});
