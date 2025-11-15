// rooms.js
// Simple in-memory room management. Each room tracks connected users.
// Note: In production you'd back this with Redis or another shared store.

const rooms = new Map();

function ensureRoom(roomId) {
  if (!rooms.has(roomId)) {
    rooms.set(roomId, {
      users: new Map() // socketId -> {id, name, color}
    });
  }
  return rooms.get(roomId);
}

function addUser(roomId, socketId, user) {
  const room = ensureRoom(roomId);
  room.users.set(socketId, user);
}

function removeUser(roomId, socketId) {
  const room = rooms.get(roomId);
  if (!room) return;
  room.users.delete(socketId);
  if (room.users.size === 0) {
    // Optionally cleanup empty room
    rooms.delete(roomId);
  }
}

function listUsers(roomId) {
  const room = rooms.get(roomId);
  if (!room) return [];
  return Array.from(room.users.values());
}

module.exports = { ensureRoom, addUser, removeUser, listUsers };
