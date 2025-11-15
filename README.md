# 🎨 Real-Time Collaborative Drawing Canvas

## 📋 Overview

The **Real-Time Collaborative Drawing Canvas** is a multi-user web application that allows multiple participants to **draw simultaneously on the same canvas** with **real-time synchronization**.
It demonstrates strong fundamentals in HTML5 Canvas manipulation, WebSocket communication, and collaborative state management — all **without using frontend frameworks or external drawing libraries**.

You can view the website by visiting: []

---

## 🚀 Features

### 🖌️ Drawing Tools

* Brush and eraser functionality
* Adjustable stroke width and color palette
* Smooth, pressure-free drawing paths

### 🌐 Real-Time Collaboration

* Live synchronization of strokes between connected clients
* User cursor indicators showing drawing positions
* Overlap handling for concurrent drawing

### 🔄 Global Undo / Redo

* Shared undo/redo history across all users
* Stack-based operation management
* Maintains consistent canvas state

### 👥 User Management

* Shows list of connected users
* Assigns unique color to each user
* Tracks user join/leave events in real time

### ⚙️ Backend Functionality

* WebSocket (or Socket.io) based event broadcasting
* Room-based canvas session handling
* Synchronization and conflict management

---

## 🧠 Technical Stack

| Component                | Technology                                         |
| ------------------------ | -------------------------------------------------- |
| **Frontend**             | Vanilla JavaScript / TypeScript, HTML5 Canvas, CSS |
| **Backend**              | Node.js, WebSockets / Socket.io                    |
| **Data Protocol**        | JSON-based event messages                          |
| **No Frameworks**        | No React, Vue, Angular, etc.                       |
| **No Drawing Libraries** | Pure Canvas API only                               |

---

## 📁 Project Structure

```
collaborative-canvas/
├── client/
│ ├── index.html            # Main HTML file
│ ├── style.css             # Styling for the canvas and UI
│ ├── canvas.js/ts          # Canvas drawing logic
│ ├── websocket.js/ts       # Client-side WebSocket handler
│ └── main.js/ts            # Initialization and UI binding
│
├── server/
│ ├── server.js/ts          # Node.js + WebSocket setup
│ ├── rooms.js/ts           # Room/session management
│ └── drawing-state.js/ts   # Canvas state management + Undo/Redo logic
│
├── package.json
├── README.md
└── ARCHITECTURE.md         # Detailed architecture & design doc
```

---

## ⚙️ Setup & Installation

### 1️⃣ Clone Repository

```bash
git clone 
cd Real-time-collaborative-canvas
```

### 2️⃣ Install Dependencies

```bash
npm install
```

### 3️⃣ Start the Server

```bash
npm start
```

### 4️⃣ Open in Browser

```
http://localhost:3000
```

### 5️⃣ Test Multi-User Collaboration

Open multiple tabs or browsers — each one represents a different user drawing in real-time.

---

## 🧪 Testing Instructions

1. Run the backend server (`npm start`).
2. Open two or more browser windows.
3. Draw on one canvas — observe real-time updates on all others.
4. Test **Undo/Redo** to confirm synchronized history.
5. Observe live user cursors and connection status.

---

## 🧱 Known Limitations

* Undo/Redo synchronization may desync on poor network connections.
* Canvas state not persistent (refresh clears all drawings).
* Limited handling for overlapping strokes during heavy concurrency.
* No authentication or user persistence after reload.

---

## 🕒 Time Spent

| Task                          | Duration    |
| ----------------------------- | ----------- |
| Canvas Drawing Implementation | 8 hrs       |
| WebSocket Backend Setup       | 5 hrs       |
| Real-Time Sync Logic          | 6 hrs       |
| Undo/Redo & State Management  | 6 hrs       |
| Testing & Debugging           | 4 hrs       |
| Documentation                 | 3 hrs       |
| **Total**                     | **~31 hrs** |

---

## 📘 Documentation Reference

Refer to `ARCHITECTURE.md` for:

* Detailed data flow diagram
* WebSocket message protocol structure
* Undo/Redo synchronization strategy
* Performance and concurrency handling decisions
* Conflict resolution mechanism

---

## 🎯 Bonus Points

* ✍️ **Touchscreen support** for mobile/tablet
* 🏠 **Room-based canvases** for separate sessions
* 💾 **Canvas persistence** (save & reload drawings)
* ⚡ **Performance metrics** (FPS counter, latency display)
* 🎨 **Creative tools** (shapes, text insertion, layers)

---

## 🧩 Future Improvements

* Add persistent sessions (Redis/MongoDB)
* Implement advanced stroke conflict resolution
* Add in-app chat for collaboration
* Add shape tools and layer-based editing
* Replay or time-lapse of drawing history

---

## 🏁 Final Notes

This assignment tests **real-time systems thinking**, **canvas fluency**, and **collaborative architecture**.
Focus on:

* Smooth, consistent real-time drawing
* Clean code and modular design
* Graceful handling of concurrency

Deliver it like a production-grade mini-app — stable, optimized, and elegant. 🚀
