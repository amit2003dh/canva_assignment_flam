// websocket.js
// Wraps socket.io client and defines message helpers

const SocketClient = (function () {
  let socket = null;

  function connect(serverUrl, roomId, user) {
    socket = io(serverUrl);
    socket.on('connect', () => {
      socket.emit('join', { roomId, user });
    });
    return socket;
  }

  return { connect };
})();
