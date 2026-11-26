// v5.13 selective restore ("return to last known points"): every line remembers its earlier versions, and the Restore tool puts back
// ONLY the lines / points you pick (tap, box or lasso) to how they were before your last change to them. Everything else stays as it is.
// Versions are kept per line (not for the whole design), so it works after other edits elsewhere, and they are saved with the project.
window.HIST = (() => {
  let owner = null, known = new Map(), uidN = 0;
  const H = { q: 0 }, CAP = 8, BUDGET = 60000;
  const cl = v => JSON.parse(JSON.stringify(v));
  const strip = p => { const o = {}; for (const k in p) if (k[0] !== '_') o[k] = p[k]; return o; };
  const sigOf = arr => JSON.stringify(arr.map(strip));
  const newUid = () => 'u' + Date.now().toString(36) + (++uidN).toString(36) + Math.random().toString(36).slice(2, 4);
  function ids() { for (const p of S.paths) if (!p.uid) p.uid = newUid(); }
  function store() { if (!S.hist || typeof S.hist !== 'object' || !S.hist.items) S.hist = { v: 1, items: {} }; return S.hist; }
  function nodeCount(h) { let n = 0; for (const u in h.items) for (const v of h.items[u]) for (const p of v.p) n += (p.n ? p.n.length : 0) + 1; return n; }
  function push(u, paths) {
    const h = store(), a = h.items[u] || (h.items[u] = []), sg = sigOf(paths);
    if (a.length && sigOf(a[a.length - 1].p) === sg) return;
    a.push({ t: Date.now(), p: cl(paths) }); while (a.length > CAP) a.shift();
    let tot = nodeCount(h);
    while (tot > BUDGET) { let ou = null, ot = Infinity; for (const k in h.items) if (h.items[k].length && h.items[k][0].t < ot) { ot = h.items[k][0].t; ou = k; } if (!ou) break; h.items[ou].shift(); if (!h.items[ou].length) delete h.items[ou]; tot = nodeCount(h); }
  }
  function groups() { const m = new Map(); for (const p of S.paths) { const a = m.get(p.uid); if (a) a.push(p); else m.set(p.uid, [p]); } return m; }
  // Compare with what we knew last time: lines that changed or vanished get their old version stored.
  function sync(quiet) {
    if (!S || !Array.isArray(S.paths)) return; ids();
    const q = quiet || H.q, cur = groups();
    if (owner !== S) { owner = S; known = new Map(); for (const [u, a] of cur) known.set(u, { sig: sigOf(a), paths: cl(a) }); return; }
    for (const [u, k] of [...known]) { const a = cur.get(u);
      if (!a) { if (!q) push(u, k.paths); known.delete(u); }
      else { const sg = sigOf(a); if (sg !== k.sig) { if (!q) push(u, k.paths); known.set(u, { sig: sg, paths: cl(a) }); } } }
    for (const [u, a] of cur) if (!known.has(u)) known.set(u, { sig: sigOf(a), paths: cl(a) });
  }
  // at the start of an edit: make sure every line has an id and the starting state is known (nothing is recorded yet)
  function touch() { if (!S || !Array.isArray(S.paths)) return; ids(); if (owner !== S) sync(true); }
  // Undo of a Restore gives the line its earlier version back again (and Redo takes it away again)
  function unpop(list) { const h = store(); for (const x of list) (h.items[x.u] || (h.items[x.u] = [])).push(x.v); }
  function repop(list) { const h = store(); for (const x of list) { const a = h.items[x.u]; if (a && a.length && sigOf(a[a.length - 1].p) === sigOf(x.v.p)) { a.pop(); if (!a.length) delete h.items[x.u]; } } }
  function reset() { owner = null; known = new Map(); if (S && S.hist) delete S.hist; }
  // the newest earlier version of a line that is not the same as it is now
  function prev(u, curArr) { const h = S.hist && S.hist.items && S.hist.items[u]; if (!h) return null; const cs = curArr && curArr.length ? sigOf(curArr) : null;
    while (h.length) { const v = h[h.length - 1]; if (cs && sigOf(v.p) === cs) { h.pop(); continue; } return v; } delete S.hist.items[u]; return null; }
  function count() { sync(); const cur = groups(); let n = 0; const seen = new Set(); for (const u of cur.keys()) { if (prev(u, cur.get(u))) { n++; seen.add(u); } } const h = S.hist && S.hist.items; if (h) for (const u of Object.keys(h)) if (!cur.has(u) && !seen.has(u) && prev(u, null)) n++; return n; }
  Object.assign(H, { unpop, repop, sync, touch, reset, ids, prev, groups, push, count, sigOf, cl });
  return H;
})();

window.RS = (() => {
  const $ = id => document.getElementById(id);
  const R = { mode: 'tap', items: new Map(), poly: null, drag: null };   // items: uid -> Set(node numbers) | null (whole line)
  const hasPick = () => R.items.size > 0 || !!(R.poly && R.poly.length >= 3);
  function inPoly(pt, poly) { let c = false; for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) { const a = poly[i], b = poly[j]; if ((a[1] > pt[1]) !== (b[1] > pt[1]) && pt[0] < (b[0] - a[0]) * (pt[1] - a[1]) / (b[1] - a[1]) + a[0]) c = !c; } return c; }
  const layerOk = p => typeof inLayer === 'function' ? inLayer(p) : true;
  // what a Restore would change right now: [{u, cur:[paths], ver, nodes:Set|null}]
  function affected() {
    HIST.sync(); const cur = HIST.groups(), out = [];
    const hist = S.hist && S.hist.items ? Object.keys(S.hist.items) : [];
    const uids = new Set([...cur.keys(), ...hist]);
    const region = R.poly && R.poly.length >= 3 ? R.poly : null;
    for (const u of uids) {
      const ca = cur.get(u) || [], ver = HIST.prev(u, ca); if (!ver) continue;
      if (!(ca.length ? ca : ver.p).some(layerOk)) continue;
      let nodes = null, hit = false;
      if (R.items.has(u)) { hit = true; nodes = R.items.get(u); }
      else if (region) {
        const nIn = p => (p.hole ? [[p.hole.cx, p.hole.cy]] : p.n.map(nd => [nd.x, nd.y])).some(q => inPoly(q, region));
        hit = ca.some(nIn) || ver.p.some(nIn);
        if (hit && ca.length === 1 && ver.p.length === 1 && !ca[0].hole && ca[0].n.length === ver.p[0].n.length) {
          const s = new Set(); ca[0].n.forEach((nd, j) => { const o = ver.p[0].n[j]; if (inPoly([nd.x, nd.y], region) || inPoly([o.x, o.y], region)) s.add(j); });
          nodes = s.size < ca[0].n.length ? s : null; }
      }
      if (!hit) continue;
      if (nodes && !(ca.length === 1 && ver.p.length === 1 && ca[0].n.length === ver.p[0].n.length)) nodes = null;   // point-level only when the line kept its points
      out.push({ u, cur: ca, ver, nodes });
    }
    return out;
  }
  function restore() {
    const aff = affected();
    if (!aff.length) { toast(hasPick() ? 'Nothing earlier to go back to for what you picked.' : 'Pick something first: tap a line, or draw a box or lasso round it.', 3200); return; }
    pushUndo(); const pops = [];
    let lines = 0, pts = 0, back = 0;
    for (const a of aff) {
      if (a.nodes && a.nodes.size) { const p = a.cur[0]; for (const j of a.nodes) p.n[j] = HIST.cl(a.ver.p[0].n[j]); pts += a.nodes.size; lines++; }
      else { let at = -1; const keep = []; S.paths.forEach(p => { if (p.uid === a.u) { if (at < 0) at = keep.length; } else keep.push(p); });
        const add = HIST.cl(a.ver.p); keep.splice(at < 0 ? keep.length : at, 0, ...add); S.paths = keep; lines += 1; if (!a.cur.length) back++; }
      if (!(a.nodes && a.nodes.size)) { const h = S.hist.items[a.u]; if (h) { pops.push({ u: a.u, v: h[h.length - 1] }); h.pop(); if (!h.length) delete S.hist.items[a.u]; } }
    }
    if (pops.length && undoSt.length) undoSt[undoSt.length - 1]._hp = pops;
    clearSel(); HIST.q = 1; try { changed(); } finally { HIST.q = 0; }
    toast(`↩ Restored ${lines} line${lines === 1 ? '' : 's'}${pts ? ` (${pts} point${pts === 1 ? '' : 's'})` : ''}${back ? `, ${back} brought back` : ''} to how ${lines === 1 ? 'it was' : 'they were'} before your last change. Everything else is untouched. Undo reverses it.`, 4200);
    ui(); draw();
  }
  function clearPick(quiet) { R.items = new Map(); R.poly = null; R.drag = null; ui(); draw(); if (!quiet) toast('Pick cleared', 1500); }
  function toggle(u, nodeNo) {
    if (nodeNo == null) { if (R.items.has(u) && R.items.get(u) === null) R.items.delete(u); else R.items.set(u, null); }
    else { const s = R.items.get(u); if (R.items.has(u) && s === null) R.items.delete(u); else if (s) { if (s.has(nodeNo)) { s.delete(nodeNo); if (!s.size) R.items.delete(u); } else s.add(nodeNo); } else R.items.set(u, new Set([nodeNo])); }
  }
  // ---- gestures ----
  function down(e, p, u, base) { const g = Object.assign(base, { rs: 'tap', tx: view.tx, ty: view.ty });
    if (R.mode !== 'tap' && R.mode !== 'pts') { g.rs = 'draw'; g.pts = [u]; g.restore = () => { R.drag = null; draw(); }; }
    return g; }
  function move(g, p, u) {
    if (g.rs === 'tap') { view.tx = g.tx + p[0] - g.p0[0]; view.ty = g.ty + p[1] - g.p0[1]; draw(); return; }
    if (g.rs === 'draw') { if (R.mode === 'box') { const a = g.u0; R.drag = [a, [u[0], a[1]], u, [a[0], u[1]]]; } else { const l = g.pts[g.pts.length - 1]; if (Math.hypot(u[0] - l[0], u[1] - l[1]) * view.s >= 3) g.pts.push(u); R.drag = g.pts; } draw(); } }
  function up(g, e) {
    if (g.rs === 'draw') { const poly = R.drag; R.drag = null;
      if (g.moved && poly && poly.length >= 3) { const xs = poly.map(q => q[0]), ys = poly.map(q => q[1]); if ((Math.max(...xs) - Math.min(...xs)) * view.s >= 12 && (Math.max(...ys) - Math.min(...ys)) * view.s >= 12) { R.poly = poly.map(q => q.slice()); R.items = new Map(); ui(); draw(); const n = affected().length; toast(n ? `${n} line${n === 1 ? '' : 's'} can go back. Tap ↩ Restore picked.` : 'Nothing earlier to restore inside that area.', 3000); return; } }
      if (!g.moved) clearPick(true); draw(); return; }
    if (g.rs === 'tap' && !g.moved) {
      const tol = tolPx(e); HIST.sync(); const nh = R.mode === 'pts' ? hitNode(u0(g), tol) : null;
      if (nh) { const p = S.paths[nh.pi]; R.poly = null; toggle(p.uid, nh.j); }
      else { const h = R.mode === 'pts' ? null : (hitPath(u0(g), tol) || (() => { const n2 = hitNode(u0(g), tol); return n2 ? { pi: n2.pi } : null; })()); if (h) { R.poly = null; toggle(S.paths[h.pi].uid, null); } else { toast(R.mode === 'pts' ? 'Tap right on a point you moved.' : 'Tap right on a line. Erased something? Use Box or Lasso round the gap.', 3200); return; } }
      ui(); draw(); } }
  const u0 = g => g.u0;
  function ui() {
    const el = $('rsHint'); if (!el) return; const n = affected().length;
    document.querySelectorAll('[data-rsmode]').forEach(b => { const on = b.dataset.rsmode === R.mode; b.classList.toggle('on', on); b.setAttribute('aria-pressed', String(on)); });
    el.innerHTML = hasPick() ? `<b>${n} line${n === 1 ? '' : 's'}</b> will go back to how ${n === 1 ? 'it was' : 'they were'} before the last change (dashed blue shows where). Everything else stays.` : (R.mode === 'tap' ? 'Tap a line you changed. Tap more to add. Nothing else is touched.' : R.mode === 'pts' ? 'Tap single points you moved. Nothing else is touched.' : R.mode === 'box' ? 'Drag a box round the lines or the gap where something was erased.' : 'Draw a loop round the lines or the gap where something was erased.');
    const go = $('rsGo'); if (go) go.disabled = !n; const cl = $('rsClear'); if (cl) cl.disabled = !hasPick();
  }
  function paint(px) {
    if (tool !== 'restore') return;
    const aff = affected(); ctx.save(); ctx.lineCap = ctx.lineJoin = 'round';
    if (R.poly || R.drag) { const poly = R.drag || R.poly; ctx.fillStyle = 'rgba(232,89,12,0.10)'; ctx.strokeStyle = '#e8590c'; ctx.lineWidth = 2 * px; ctx.setLineDash([6 * px, 4 * px]); ctx.beginPath(); poly.forEach((q, i) => i ? ctx.lineTo(q[0], q[1]) : ctx.moveTo(q[0], q[1])); ctx.closePath(); ctx.fill(); ctx.stroke(); ctx.setLineDash([]); }
    // lines you picked, in orange
    ctx.strokeStyle = '#e8590c'; ctx.lineWidth = 3.4 * px; ctx.beginPath(); for (const a of aff) if (!a.nodes) for (const p of a.cur) tracePath(p); ctx.stroke();
    // where they will go back to, dashed blue
    ctx.strokeStyle = '#1971c2'; ctx.lineWidth = 2.4 * px; ctx.setLineDash([7 * px, 5 * px]); ctx.beginPath(); for (const a of aff) for (const p of a.ver.p) { if (p.hole) continue; tracePath(p); } ctx.stroke(); ctx.setLineDash([]);
    ctx.fillStyle = '#1971c2'; for (const a of aff) if (a.nodes) for (const j of a.nodes) { const o = a.ver.p[0].n[j], c = a.cur[0].n[j]; ctx.beginPath(); ctx.arc(o.x, o.y, 5 * px, 0, 7); ctx.fill(); ctx.strokeStyle = '#e8590c'; ctx.lineWidth = 2 * px; ctx.beginPath(); ctx.arc(c.x, c.y, 6 * px, 0, 7); ctx.stroke(); }
    for (const [u, s] of R.items) if (s) for (const p of S.paths) if (p.uid === u) for (const j of s) { const nd = p.n[j]; if (!nd) continue; ctx.strokeStyle = '#e8590c'; ctx.lineWidth = 2.4 * px; ctx.beginPath(); ctx.arc(nd.x, nd.y, 7 * px, 0, 7); ctx.stroke(); }
    ctx.restore(); }
  function onTool(t) { if (t !== 'restore') { if (hasPick()) { R.items = new Map(); R.poly = null; R.drag = null; } } else ui(); }
  function wire() {
    document.querySelectorAll('[data-rsmode]').forEach(b => b.onclick = () => { R.mode = b.dataset.rsmode; R.drag = null; if (R.mode === 'tap' || R.mode === 'pts') R.poly = null; ui(); draw(); });
    $('rsGo').onclick = restore; $('rsClear').onclick = () => clearPick(false);
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', wire); else wire();
  return { R, down, move, up, paint, onTool, restore, clearPick, affected, hasPick, ui };
})();
