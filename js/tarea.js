// Waylands Path v5.3 - Trace an area: draw a loop (or box) round one part of the photo and only that part is traced again,
// with more lines and points (its own Detail / Smoothness / Ignore small bits). The new lines can Replace the lines inside the
// loop (lines crossing the edge are cut there, the outside parts stay) or be Added. One Undo step. Nothing changes until "Use these lines".
// The area is traced from the whole photo at full stored size, so edge strength is judged against the whole photo (skin or fur
// texture inside a small area is not mistaken for strong lines), and only the edges inside the area are kept.
'use strict';
window.TA = (() => {
  const $ = id => document.getElementById(id), KEY = 'wp-tarea1', DEF = () => ({ detail: 8, smooth: 3, minLen: 2 });
  const last = () => { try { const v = JSON.parse(localStorage.getItem(KEY) || 'null'); if (v) return Object.assign(DEF(), v); } catch (e) { /* */ } return DEF(); };
  const A = { mode: localStorage.getItem('wp-taMode') === 'box' ? 'box' : 'lasso', put: localStorage.getItem('wp-taPut') === 'add' ? 'add' : 'replace', o: last(), poly: null, drag: null, prev: null, busy: false, seq: 0, t: null, info: '' };
  const can = () => !!(typeof srcImg !== 'undefined' && srcImg && S.src && S.src.kind === 'image');
  function open() { if (!can()) { toast('Open a photo first'); return; } if (window.closeMenu) closeMenu(); setTool('tarea'); }
  function onTool(t, prev) { if (t !== 'tarea') { A.poly = null; A.prev = null; A.drag = null; A.seq++; } panel(); }
  // ---------- drawing the loop (one finger; two fingers still move / zoom the picture) ----------
  function down(e, p, u, base) { return Object.assign(base, { ta: 1, pts: [u], restore: () => { A.drag = null; draw(); } }); }
  function move(g, p, u) { if (A.mode === 'box') { const a = g.u0; A.drag = [a, [u[0], a[1]], u, [a[0], u[1]]]; }
    else { const l = g.pts[g.pts.length - 1]; if (Math.hypot(u[0] - l[0], u[1] - l[1]) * view.s >= 3) g.pts.push(u); A.drag = g.pts; } draw(); }
  function up(g) { const poly = A.drag; A.drag = null; if (!g.moved || !poly || poly.length < 3) { draw(); if (!g.moved) toast(A.mode === 'box' ? 'Drag a box over the part to trace' : 'Draw a loop round the part to trace'); return; }
    const b = CN.pbox(poly); if ((b.x1 - b.x0) * view.s < 16 || (b.y1 - b.y0) * view.s < 16) { draw(); toast('That area is too small - draw a bigger loop'); return; }
    A.poly = poly.map(q => q.slice()); A.prev = null; run(); }
  // ---------- tracing the area (in the tracing helper, like the whole picture) ----------
  function run() { if (!A.poly || !can()) return; const seq = ++A.seq, b = CN.pbox(A.poly), pad = 4;
    const area = { x0: Math.max(0, b.x0 - pad), y0: Math.max(0, b.y0 - pad), x1: Math.min(srcImg.w, b.x1 + pad), y1: Math.min(srcImg.h, b.y1 + pad) };
    A.busy = true; panel(); const t0 = Date.now();
    runTrace(srcImg, { kind: 'photo', photo: Object.assign({}, A.o, { contrast: 5, area, _: { res: Math.max(srcImg.w, srcImg.h) } }) }).then(r => { if (seq !== A.seq) return; A.busy = false;
      if (!r || r.error) { A.prev = null; panel(); toast('Tracing the area failed' + (r && r.error ? ': ' + r.error : '')); return; }
      const lp = BZ.fromPoints(A.poly, true), out = []; for (const p of r.paths) out.push(...CN.trimPath(p, A.poly, lp));
      A.prev = out; A.red = [].concat(...insideLines().map(p => CN.trimPath(p, A.poly, lp))); A.info = `${out.length} lines, ${BZ.countNodes(out)} points (${((Date.now() - t0) / 1000).toFixed(1)} s)`; panel(); draw(); }); }
  function soon() { clearTimeout(A.t); if (A.poly) { A.busy = true; A.seq++; panel(); } A.t = setTimeout(run, 250); } // busy at once: Use these lines waits for the new preview
  const insideLines = () => { if (!A.poly) return []; const lp = BZ.fromPoints(A.poly, true), pb = CN.pbox(A.poly); return S.paths.filter(p => !p.cut && !p.hole && p.n.length >= 2 && CN.touches(p, A.poly, lp, pb)); };
  function apply() { if (!A.prev || A.busy) { toast(A.poly ? 'Wait for the area to finish tracing' : 'Draw round an area first'); return; } if (!A.prev.length) { toast('No lines found in that area - raise Detail'); return; }
    pushUndo(); const lp = BZ.fromPoints(A.poly, true); let cut = 0, gone = 0;
    if (A.put === 'replace') { const hit = new Set(insideLines()), out = []; for (const p of S.paths) { if (!hit.has(p)) { out.push(p); continue; } const keep = CN.trimPath(p, A.poly, lp, true); if (keep.length) cut++; else gone++; out.push(...keep); } S.paths = out; }
    const add = A.prev.map(p => BZ.clone(p)); S.paths.push(...add); const n = add.length;
    A.poly = null; A.prev = null; changed(); panel(); draw();
    toast(A.put === 'replace' ? `Area traced again: ${n} new lines in place of ${gone + cut} old ones${cut ? ` (${cut} cut at the edge)` : ''}. Undo takes it back.` : `Added ${n} lines from the area. Undo takes it back.`, 4500); }
  // ---------- screen ----------
  function paint(px) { if (tool !== 'tarea') return; const poly = A.drag || A.poly; ctx.save();
    if (A.prev && A.put === 'replace') { ctx.strokeStyle = 'rgba(250,82,82,0.55)'; ctx.lineWidth = 2 * px; ctx.setLineDash([4 * px, 3 * px]); ctx.beginPath(); for (const q of A.red || []) tracePath(q); ctx.stroke(); ctx.setLineDash([]); }
    if (poly && poly.length > 1) { ctx.beginPath(); poly.forEach((q, i) => i ? ctx.lineTo(q[0], q[1]) : ctx.moveTo(q[0], q[1])); ctx.closePath(); ctx.fillStyle = 'rgba(232,89,12,0.08)'; ctx.fill(); ctx.strokeStyle = '#e8590c'; ctx.lineWidth = 2 * px; ctx.setLineDash([8 * px, 5 * px]); ctx.stroke(); ctx.setLineDash([]); }
    if (A.prev) { ctx.strokeStyle = '#e8590c'; ctx.lineWidth = 2.2 * px; ctx.lineCap = ctx.lineJoin = 'round'; ctx.beginPath(); for (const p of A.prev) tracePath(p); ctx.stroke(); }
    ctx.restore(); }
  function panel() { if (!$('taBox')) return; document.querySelectorAll('[data-tamode]').forEach(b => b.classList.toggle('on', b.dataset.tamode === A.mode)); document.querySelectorAll('[data-taput]').forEach(b => b.classList.toggle('on', b.dataset.taput === A.put));
    [['taDetail', 'detail'], ['taSmooth', 'smooth'], ['taMin', 'minLen']].forEach(([id, k]) => { $(id).value = A.o[k]; $(id + 'Out').textContent = A.o[k]; });
    $('taApply').disabled = !A.prev || A.busy || !A.prev.length; $('taAgain').disabled = !A.poly;
    $('taHint').innerHTML = !A.poly ? `<b>Trace an area:</b> ${A.mode === 'box' ? 'drag a box over' : 'draw a loop round'} one part of the photo with one finger (a face, the eyes…). It is traced again in more detail. Two fingers move or zoom.`
      : A.busy ? '<b>Tracing the area…</b>' : `<b>Preview</b> (orange): ${A.info}. ${A.put === 'replace' ? 'The red dashed lines inside the loop will be replaced.' : 'They will be added to the lines already there.'} More lines: raise <b>Detail</b> or lower <b>Ignore small bits</b>. Then tap <b>✓ Use these lines</b>.`; }
  function wire() { if (!$('taBox')) return; const on = (id, f) => { const el = $(id); if (el) el.onclick = f; };
    on('taOpen', open); on('taApply', apply); on('taAgain', () => { A.poly = null; A.prev = null; A.seq++; A.busy = false; panel(); draw(); }); on('taDone', () => setTool('move'));
    on('taReset', () => { A.o = DEF(); localStorage.removeItem(KEY); panel(); soon(); toast('Area settings back to their defaults'); });
    document.querySelectorAll('[data-tamode]').forEach(b => b.onclick = () => { A.mode = b.dataset.tamode; localStorage.setItem('wp-taMode', A.mode); panel(); });
    document.querySelectorAll('[data-taput]').forEach(b => b.onclick = () => { A.put = b.dataset.taput; localStorage.setItem('wp-taPut', A.put); panel(); draw(); });
    [['taDetail', 'detail'], ['taSmooth', 'smooth'], ['taMin', 'minLen']].forEach(([id, k]) => $(id).addEventListener('input', e => { A.o[k] = +e.target.value; $(id + 'Out').textContent = A.o[k]; try { localStorage.setItem(KEY, JSON.stringify(A.o)); } catch (er) { /* */ } soon(); }));
    panel(); }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', wire); else wire();
  return { A, open, onTool, down, move, up, paint, panel, apply, run, DEF };
})();
