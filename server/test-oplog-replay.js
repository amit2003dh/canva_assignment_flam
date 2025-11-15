// Simple test for opLog replay
const ds = require('./drawing-state');

function run() {
  const u1 = { id: 'u1', name: 'Alice' };
  const u2 = { id: 'u2', name: 'Bob' };

  const s1 = { meta: { color:'#000', width:4 }, points: [{x:10,y:10},{x:20,y:20}] };
  const s2 = { meta: { color:'#f00', width:6 }, points: [{x:30,y:30},{x:40,y:40}] };

  const op1 = ds.addStroke(u1, s1);
  const op2 = ds.addStroke(u2, s2);
  ds.addUndo(u1, op2.opId);

  const replayed = ds.replay();
  console.log('replayed strokes count', replayed.length);
  if (replayed.length !== 1) throw new Error('Expected 1 stroke after undo');
  console.log('OK');
}

run();
