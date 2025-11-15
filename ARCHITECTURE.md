# Real-time Drawing Architecture

> A complete, replayable architecture for collaborative drawing using Socket.io, an append-only opLog, and deterministic LIFO undo/redo semantics.

---

## 1. High-level data flow

Clients communicate with the server over Socket.io. Client actions (startStroke, strokePoint, endStroke, cursor, undo, redo, requestSnapshot) are sent as messages to the server. The server stores every action in an append-only `opLog` and broadcasts new ops to other clients.

**Flow:**

Client → Server (Socket.io) → Server appends to `opLog` → Server updates runtime stacks → Server broadcasts op → Other clients apply op

New clients request a `snapshot` (the full or recent `opLog`) and rebuild the canvas by replaying the log.

---

## 2. Message examples (WebSocket / Socket.io)

```json
{ "type": "startStroke", "id": "strokeId", "user": "u1", "color": "#ff0", "width": 4, "point": { "x": 10, "y": 20 } }
{ "type": "strokePoint", "id": "strokeId", "point": { "x": 11, "y": 21 }, "ts": 1690000000 }
{ "type": "endStroke", "id": "strokeId" }
{ "type": "cursor", "user": "u1", "x": 100, "y": 200 }
{ "type": "undo", "user": "u1", "targetOperationId": "op123" }
```

Each message corresponds to an entry the server will persist to the `opLog`.

---

## 3. opLog schema

Server stores every action as an entry in an append-only timeline. Example entry:

```json
{
  "opId": "string",
  "type": "stroke" | "undo" | "redo",
  "user": { "id": "...", "name": "...", "color": "..." },
  "ts": 1234567890,
  "payload": {
    "stroke": { /* stroke meta + sampled points */ },
    "targetOpId": "..."
  }
}
```

Notes:

* `type` is one of `'stroke'`, `'undo'`, `'redo'`.
* `payload.stroke` contains the stroke metadata and the sampled points that the client sent.
* `payload.targetOpId` is used by `'undo'` and `'redo'` ops to reference the stroke being operated on.

---

## 4. Runtime stacks (server-side)

To achieve deterministic LIFO undo/redo semantics the server maintains two runtime stacks in addition to the `opLog`:

* `undoStack`: the current visible timeline of stroke ops (bottom → older, top → most recent visible)
* `redoStack`: strokes that were undone and can be redone (top → last undone)

These stacks are the source of truth for which stroke will be undone or redone next.

---

## 5. Server-side behaviors

### addStroke(user, stroke)

* Append a `'stroke'` op to `opLog` with full payload
* Push the op onto `undoStack`
* Clear `redoStack` (new actions invalidate redo history)
* Broadcast the new op to connected clients

### addUndo(user, targetOpId?)

* If `targetOpId` is omitted: pop the top element from `undoStack`
* If `targetOpId` is provided: find and remove the most-recent occurrence of `targetOpId` in `undoStack`
* Push the removed op onto `redoStack`
* Append an `'undo'` op to `opLog` with `payload.targetOpId`
* Broadcast the `'undo'` op

### addRedo(user, targetOpId?)

* If `targetOpId` is omitted: pop the top element from `redoStack`
* If `targetOpId` is provided: find and remove the most-recent occurrence of `targetOpId` in `redoStack`
* Push the removed op back onto `undoStack`
* Append a `'redo'` op to `opLog` with `payload.targetOpId`
* Broadcast the `'redo'` op

---

## 6. Why both stacks + opLog?

* **opLog** is append-only: it guarantees full replayability, auditing, debugging, and that new clients can reconstruct past activity.
* **undoStack/redoStack** provide efficient, deterministic, LIFO undo/redo semantics at runtime.

Combining persistent history (opLog) and runtime stacks gives correctness, performance, and a stable UX consistent with desktop drawing apps.

---

## 7. Client-side replay rules (reconstruction)

When a client receives a `snapshot` (an `opLog` slice or full log) it reconstructs visible strokes by replaying ops in order:

* For `'stroke'` ops: add the stroke to a map and append it to the visible timeline (undoStack-like structure)
* For `'undo'` ops: remove the most-recent occurrence of `payload.targetOpId` from the visible timeline
* For `'redo'` ops: re-insert (append) the referenced stroke into the visible timeline at the point the `'redo'` occurs

This mirrors the server's exact logic so server and clients remain consistent.

---

## 8. Fix for the previous redo bug

**Symptom:** after undoing multiple strokes in sequence (e.g., strokes `7`, `6`, `5`), calling redo could restore stroke `7` first instead of stroke `5`.

**Root cause:** some implementations scanned `opLog` to find an undone stroke to redo; scanning the log doesn't preserve the order undos were performed.

**Solution:** maintain explicit `undoStack` and `redoStack` on the server; redo now pops the top of `redoStack`, guaranteeing LIFO reapplication. Clients also compute stacks from `opLog` during snapshot replay and send explicit `targetOpId` when requesting redo; server supports empty-redo as a fallback but relies on stacks for correctness.

---

## 9. Conflict resolution rules

* The server orders and applies ops deterministically in the order it receives them.
* Visual stacking is order-based: later strokes appear on top of earlier strokes.
* Undo is global: if any user undoes another user’s stroke, that stroke is removed from replay for everyone.

---

## 10. Performance & UX choices

* **Client throttling:** `strokePoint` events should be emitted ~every 30ms to balance responsiveness and bandwidth.
* **Local smoothing:** clients apply a quadratic Bézier smoothing algorithm on sampled points for a fluid drawing experience.
* **Server processing:** server performs minimal processing and stores full stroke payloads for replay.
* **Snapshotting:** periodically create snapshots (bitmap or summarized stroke state) to accelerate new-client joins and avoid replaying extremely large logs.

---

## 11. Scaling plan

* Use a Socket.io adapter backed by **Redis** to coordinate multiple server instances.
* Persist the `opLog` to a database (e.g., PostgreSQL, MongoDB) and stream new ops via pub/sub.
* Store periodic snapshots (image or condensed stroke index) to reduce join-time replay.
* For very large sessions, shard rooms, and limit history size per room (or use summarized checkpoints).

---

## 12. Security & validation

* Validate message sizes and payload shapes server-side.
* Rate-limit `strokePoint` and other high-frequency events.
* Sanitize stroke metadata (user names, colors) and reject malformed operations.
* Use authentication tokens and room-level authorization.

---

## 13. Why Socket.io?

Socket.io gives helpful primitives out-of-the-box:

* Robust reconnection logic
* Automatic transport fallback
* Room and broadcast helpers
* Binary-friendly payloads

It shortens development time and avoids many low-level WebSocket pitfalls.

---

## 14. Next steps / deliverables (optional)

If you want, I can also produce:

* A sequence diagram (client/server message flow)
* A simple ER schema for persisting `opLog`
* A compact README for a starter server implementation (Node.js + Socket.io)
* A PPT or one-page PDF of this architecture

Tell me which artifact you'd like next.
