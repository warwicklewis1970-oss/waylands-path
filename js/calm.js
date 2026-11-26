// v5.13 calm editing: Hand mode by default, 🔒 lock, one-tap hide/show of the tools panel, the panel steps aside while you drag,
// and a simple Place mode (✓ Done / ✕ Cancel) for new shapes and clones. Nothing here touches the laser files.
window.CALM = (() => {
  const $ = id => document.getElementById(id), B = document.body;
  const get = k => { try { return localStorage.getItem(k); } catch (e) { return null; } }, put = (k, v) => { try { localStorage.setItem(k, v); } catch (e) { /* private mode: it just will not be remembered */ } };
  const st = { collapsed: get('wp-dock') === '1', locked: get('wp-lock') === '1', place: null, dragT: null, lastAct: Date.now(), idleMs: 30000 };
  const NAMES = { move: 'Hand', sel: 'Select', p2p: 'Point to point', draw: 'Draw', brk: 'Break', rub: 'Eraser', thick: 'Thickness', cutout: 'Cut out', clear: 'Clear space', clone: 'Clone', edge: 'Trace edge', shapes: 'Shapes', line: 'Line', restore: 'Restore' };
  const nm = t => NAMES[t] || t;
  function dockUI() {
    B.classList.toggle('dock-collapsed', st.collapsed);
    const h = $('dockHandle'); if (h) { h.setAttribute('aria-expanded', String(!st.collapsed)); h.querySelector('.chev').textContent = st.collapsed ? '▴' : '▾'; $('dockTitle').textContent = st.collapsed ? 'Show tools' + (tool !== 'move' ? ' · ' + nm(tool) : '') : 'Hide tools'; }
  }
  function handUI() { const hb = $('handBtn'); if (hb) { hb.classList.toggle('on', tool === 'move'); hb.setAttribute('aria-pressed', String(tool === 'move')); } B.classList.toggle('hand', tool === 'move'); }
  function lockUI() { const lb = $('lockBtn'); if (lb) { lb.textContent = st.locked ? '🔒' : '🔓'; lb.classList.toggle('on', st.locked); lb.setAttribute('aria-pressed', String(st.locked)); lb.title = st.locked ? 'Locked: tap to unlock' : 'Lock: nothing can be changed until you unlock'; } B.classList.toggle('locked', st.locked); }
  function setCollapsed(v) { st.collapsed = !!v; put('wp-dock', st.collapsed ? '1' : '0'); dockUI(); }
  function setLocked(v) { st.locked = !!v; put('wp-lock', st.locked ? '1' : '0'); if (st.locked) { if (st.place) cancelPlace(true); if (tool !== 'move') setTool('move'); } lockUI(); toast(st.locked ? '🔒 Locked: the drawing cannot be changed. Tap 🔒 again to edit.' : '🔓 Unlocked. Pick a tool to edit.', 2600); }
  function blocked(t) { if (st.locked && t !== 'move') { toast('🔒 Locked: tap 🔒 to unlock before you edit.', 2400); return true; } return false; }
  function onTool(t, prev) { handUI(); dockUI(); if (st.place && !((st.place.kind === 'clone' && t === 'clone') || ((st.place.kind === 'shape' || st.place.kind === 'shapedraw') && t === 'shapes'))) endPlace(); }
  // ---- the panel steps aside while you drag ----
  function drag(on) { if (on) { clearTimeout(st.dragT); st.dragT = null; if (tool !== 'move') B.classList.add('dock-drag'); } else if (B.classList.contains('dock-drag')) { clearTimeout(st.dragT); st.dragT = setTimeout(() => { st.dragT = null; B.classList.remove('dock-drag'); }, 1200); } }
  // ---- Place mode ----
  const mark = () => ({ top: undoSt.length ? undoSt[undoSt.length - 1] : null });
  const placing = kind => !!(st.place && (!kind || st.place.kind === kind));
  function place(kind, mk) { if (st.place && st.place.kind === 'shapedraw') { st.place = null; } st.place = { kind, mk: mk || mark() }; $('plDone').hidden = false; B.classList.add('placing'); B.classList.remove('place-opts'); $('placeLbl').textContent = kind === 'clone' ? 'Drag the copy where you want it' : 'Drag the shape where you want it'; $('placePill').hidden = false; clearTimeout(st.dragT); B.classList.remove('dock-drag'); }
  // shape picked, nothing drawn yet: the panel steps aside so the whole design is free to draw on
  function beginDraw() { if (st.place) return; st.place = { kind: 'shapedraw' }; B.classList.add('placing'); B.classList.remove('place-opts'); $('placeLbl').textContent = 'Drag on the design to draw the shape'; $('plDone').hidden = true; $('placePill').hidden = false; }
  function endPlace() { if (!st.place) return; st.place = null; B.classList.remove('placing', 'place-opts'); $('placePill').hidden = true; $('plDone').hidden = false; dockUI(); draw(); }
  function donePlace() { const p = st.place; if (!p) return; if (p.kind === 'shape') { if (window.T2 && T2.SH.cur) T2.shDone(); if (T2.SH.cur) return; } endPlace(); if (tool !== 'move') setTool('move'); toast('Placed. Use ✋ Hand to move around, or pick a tool.', 2200); }
  function cancelPlace(quiet) { const p = st.place; if (!p) return; if (p.kind === 'shapedraw') { endPlace(); return; } if (p.kind === 'shape') { if (window.T2) T2.shCancel(); } else { const top = p.mk && p.mk.top; let n = 0; while (undoSt.length && undoSt[undoSt.length - 1] !== top && n++ < 60) undo(); } endPlace(); if (tool !== 'move') setTool('move'); if (!quiet) toast('Cancelled: nothing was added.', 2200); }
  // ---- looks after itself: back to Hand when you stop for a while ----
  const pending = () => !!(st.place || (window.T2 && T2.SH && T2.SH.cur) || (window.CN && CN.C && CN.C.area) || (window.RS && RS.hasPick()) || (typeof busyNow === 'function' && busyNow()));
  function tick() {
    if (st.place) { if (st.place.kind === 'shapedraw') { if (tool !== 'shapes') endPlace(); }
      else if (st.place.kind === 'shape' && !(window.T2 && T2.SH.cur)) endPlace(); else if (st.place.kind === 'clone' && (tool !== 'clone' || !(window.CN && CN.C.sel && CN.C.sel.length))) endPlace(); }
    if (tool !== 'move' && !B.classList.contains('home') && Date.now() - st.lastAct > st.idleMs && !pending()) { setTool('move'); toast('Back to ✋ Hand: nothing can be changed. Pick a tool to edit.', 3000); }
  }
  function wire() {
    const act = () => { st.lastAct = Date.now(); };
    ['pointerdown', 'keydown', 'input', 'click'].forEach(ev => window.addEventListener(ev, act, true));
    window.addEventListener('pointerup', () => drag(false), true); window.addEventListener('pointercancel', () => drag(false), true);
    $('dockHandle').onclick = () => setCollapsed(!st.collapsed);
    $('handBtn').onclick = () => { if (st.place) cancelPlace(true); if (tool !== 'move') setTool('move'); handUI(); };
    $('lockBtn').onclick = () => setLocked(!st.locked);
    $('qUndo').onclick = () => { undo(); }; $('qRedo').onclick = () => { redo(); };
    $('plDone').onclick = donePlace; $('plCancel').onclick = () => cancelPlace(false); $('plOpts').onclick = () => B.classList.toggle('place-opts');
    setInterval(tick, 500);
    dockUI(); handUI(); lockUI(); if (typeof updUndo === 'function') updUndo();
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', wire); else wire();
  return { st, beginDraw, blocked, onTool, drag, place, placing, mark, endPlace, donePlace, cancelPlace, setCollapsed, setLocked, tick, get locked() { return st.locked; }, get collapsed() { return st.collapsed; }, get idleMs() { return st.idleMs; }, set idleMs(v) { st.idleMs = v; } };
})();
