// Waylands Path v4.7 - Hanging hole: an exact round hole, diameter typed in mm (remembered for every project), cut by default.
// Stored as a normal closed path with p.hole = {cx, cy, d, k} (centre in design units, finished Ø and kerf in mm). Its circle is
// rebuilt from that whenever anything changes, so a new Size, the outer cut rebuild or a stray edit can never change the mm size.
// Designs without a hanging hole are not touched at all.
'use strict';
window.HH = (() => {
  const $ = id => document.getElementById(id), C4 = 0.5522847498;
  const num = (k, d, lo, hi) => { const t = localStorage.getItem(k); if (t === null || t === '') return d; const v = +t; return v >= lo && v <= hi ? v : d; };
  const H = { on: false, pick: -1, d: num('wp-holeD', 4, 0.5, 50), k: num('wp-holeK', 0, 0, 1), gap: num('wp-holeGap', 3, 0, 50), cut: localStorage.getItem('wp-holeCut') !== '0' };
  const holes = () => S.paths.map((p, i) => [p, i]).filter(([p]) => p.hole);
  const r2 = v => Math.round(v * 100) / 100;
  // circle of 4 cubic Beziers (same points every time: right, bottom, left, top), radius in design units
  function circle(cx, cy, r) { const P = [[1, 0], [0, 1], [-1, 0], [0, -1]];
    return P.map(([x, y]) => { const nd = BZ.node(cx + x * r, cy + y * r); nd.o = [cx + (x - y * C4) * r, cy + (y + x * C4) * r]; nd.i = [cx + (x + y * C4) * r, cy + (y - x * C4) * r]; nd.s = 1; return nd; }); }
  const pathR = h => Math.max(0.1, h.d - (h.k || 0)) / 2; // mm: the laser follows this line; kerf makes the finished hole = Ø
  function shape(p, k) { p.n = circle(p.hole.cx, p.hole.cy, pathR(p.hole) / k); p.z = true; delete p.w; delete p.dbl; }
  // rebuild every hole at its exact mm size (a hole on the outside edge changes the design width a touch, so settle in a few rounds)
  function sync() { const hs = holes(); if (!hs.length) return; const seen = new Set();
    for (let i = hs.length - 1; i >= 0; i--) { const [p, pi] = hs[i], key = `${r2(p.hole.cx)},${r2(p.hole.cy)},${p.hole.d}`; if (seen.has(key)) S.paths.splice(pi, 1); else seen.add(key); } // copies left by an edit
    for (let it = 0; it < 4; it++) { const k = kmm(); for (const [p] of holes()) shape(p, k); if (Math.abs(kmm() - k) < 1e-9) break; } }
  function add(u) { const k = kmm(), p = { n: [], z: true, hole: { cx: u[0], cy: u[1], d: H.d, k: H.k } }; if (H.cut) { p.cut = true; p.uc = 1; } shape(p, k);
    pushUndo(); S.paths.push(p); if (H.cut) S.cutOn = true; H.pick = S.paths.length - 1; sync(); changed(); panel(); syncInputs();
    toast(`Hanging hole added: Ø ${H.d} mm${H.cut ? ', cut out' : ''}. Drag it to move it.`, 3000); }
  // the outer edge the hole sits in: the biggest cut line that is not a hole (else the outline of all the lines)
  function outer() { let best = null, ba = 0; for (const p of S.paths) { if (!p.cut || p.hole || !p.z) continue; const b = BZ.bbox([p]); if (b && b.w * b.h > ba) { ba = b.w * b.h; best = p; } } return best; }
  function topSpot(dmm) { const k = kmm(), R = dmm / 2 / k, need = R + H.gap / k, E = outer();
    if (!E) { const b = BZ.bbox(S.paths.filter(p => !p.hole)); if (!b) return null; return { u: [(b.x0 + b.x1) / 2, b.y0 + need], edge: false }; }
    const f = BZ.flatten(E, 0.2), b = BZ.bbox([E]), x = (b.x0 + b.x1) / 2; let yTop = Infinity; // where a line straight down the middle first meets the edge
    for (let i = 0; i < f.length; i++) { const a = f[i], c = f[(i + 1) % f.length]; if ((a[0] - x) * (c[0] - x) <= 0 && a[0] !== c[0]) { const y = a[1] + (c[1] - a[1]) * (x - a[0]) / (c[0] - a[0]); if (y < yTop) yTop = y; } }
    if (!isFinite(yTop)) yTop = b.y0; let y = yTop + need;
    const dEdge = q => { let m = Infinity; for (let i = 0; i < f.length; i++) m = Math.min(m, BZ.segD(q, f[i], f[(i + 1) % f.length])[0]); return m; };
    for (let i = 0; i < 4000 && !(BZ.inside(f, [x, y]) && dEdge([x, y]) >= need - 1e-9); i++) y += 0.02 / k; return { u: [x, y], edge: true }; }
  function toTop() { const h = H.pick >= 0 && S.paths[H.pick] && S.paths[H.pick].hole ? S.paths[H.pick] : null, s = topSpot(h ? h.hole.d : H.d); if (!s) { toast('Open a design first'); return; }
    if (h) { pushUndo(); h.hole.cx = s.u[0]; h.hole.cy = s.u[1]; sync(); changed(); panel(); } else add(s.u);
    toast(s.edge ? `Hole centred at the top with ${H.gap} mm of wood above it` : `No cut line yet - hole centred ${H.gap} mm below the top of the lines`, 3500); }
  function hitHole(u, tol) { let best = -1, bd = Infinity; S.paths.forEach((p, i) => { if (!p.hole) return; const k = kmm(), R = pathR(p.hole) / k, d = Math.hypot(u[0] - p.hole.cx, u[1] - p.hole.cy); if (d <= R + tol && d < bd) { bd = d; best = i; } }); return best; }
  // gestures (Shapes tool with Hanging hole picked; also used by the Cut out tool to move a hole)
  function down(e, p, u, base) { const tol = (e && e.pointerType === 'mouse' ? 10 : 22) / view.s, hi = hitHole(u, tol);
    if (hi >= 0) { H.pick = hi; panel(); draw(); return Object.assign(base, { hh: 'move', pi: hi, c0: [S.paths[hi].hole.cx, S.paths[hi].hole.cy], snap: snap() }); }
    return Object.assign(base, { hh: 'tap', tx: view.tx, ty: view.ty }); }
  function move(g, p, u) { if (g.hh === 'tap') { view.tx = g.tx + p[0] - g.p0[0]; view.ty = g.ty + p[1] - g.p0[1]; draw(); return; }
    const q = S.paths[g.pi]; if (!q || !q.hole) return; q.hole.cx = g.c0[0] + u[0] - g.u0[0]; q.hole.cy = g.c0[1] + u[1] - g.u0[1]; shape(q, kmm()); draw(); }
  function up(g) { if (g.hh === 'move') { if (g.moved) { undoSt.push(g.snap); redoSt = []; sync(); changed(); panel(); } return; }
    if (!g.moved) { if (H.pick >= 0) { H.pick = -1; panel(); draw(); toast('Hole let go - tap again to add another hole', 2200); return; } add(g.u0); } }
  function remove() { const p = S.paths[H.pick]; if (!p || !p.hole) return; pushUndo(); S.paths.splice(H.pick, 1); H.pick = -1; changed(); panel(); toast('Hanging hole removed - Undo brings it back'); }
  function setD(v) { if (!(v >= 0.5 && v <= 50)) { toast('Type a diameter from 0.5 to 50 mm'); panel(); return; } v = r2(v); H.d = v; localStorage.setItem('wp-holeD', v);
    const p = S.paths[H.pick]; if (p && p.hole && p.hole.d !== v) { pushUndo(); p.hole.d = v; sync(); changed(); toast(`Hole is now Ø ${v} mm`); } panel(); draw(); }
  function setK(v) { if (!(v >= 0 && v <= 1)) { toast('Kerf: 0 to 1 mm'); panel(); return; } v = Math.round(v * 1000) / 1000; H.k = v; localStorage.setItem('wp-holeK', v);
    const p = S.paths[H.pick]; if (p && p.hole && p.hole.k !== v) { pushUndo(); p.hole.k = v; sync(); changed(); } panel(); draw(); }
  function panel() { const b = $('hhBox'); if (!b) return; const pnl = b.closest('[data-opts]'); if (pnl) pnl.classList.toggle('hhon', H.on); document.querySelectorAll('[data-hole]').forEach(x => x.classList.toggle('on', H.on)); if (!H.on) { if (window.T2) { const v = T2.SH; document.querySelectorAll('[data-shape]').forEach(x => x.classList.toggle('on', x.dataset.shape === (v.kind === 'ellipse' ? 'ellipse' : v.kind === 'star' ? 'star' : 'p' + v.n))); } return; }
    document.querySelectorAll('[data-shape]').forEach(x => x.classList.remove('on'));
    const p = H.pick >= 0 ? S.paths[H.pick] : null, ph = p && p.hole ? p : null; if (!ph) H.pick = -1;
    if (document.activeElement !== $('hhD')) $('hhD').value = ph ? ph.hole.d : H.d; if (document.activeElement !== $('hhK')) $('hhK').value = ph ? ph.hole.k || 0 : H.k; if (document.activeElement !== $('hhGap')) $('hhGap').value = H.gap; $('hhCut').checked = H.cut;
    const n = holes().length, kerf = ph ? ph.hole.k || 0 : H.k; $('hhDel').disabled = !ph;
    $('hhHint').innerHTML = ph ? `<b>Hole picked: Ø ${ph.hole.d} mm</b>${ph.cut ? ' (cut out)' : ' (etched ring)'}. Drag it to move it, type a new size, or tap empty space to let go.`
      : `<b>Hanging hole Ø ${H.d} mm</b> · Tap the design where it goes, or use <b>Centre at top</b>.${n ? ` ${n} hole${n > 1 ? 's' : ''} in this design.` : ''}`;
    $('hhNote').textContent = kerf > 0 ? `The laser follows a Ø ${r2(Math.max(0.1, (ph ? ph.hole.d : H.d) - kerf))} mm line so the finished hole comes out Ø ${ph ? ph.hole.d : H.d} mm.` : 'Kerf 0: the laser cuts on the Ø line, so the hole comes out a hair bigger (by your beam width, about 0.1–0.2 mm).'; }
  // size label on the screen next to every hole (canvas only, never in the files)
  function paint(px) { const k = kmm(); for (const [p, i] of holes()) { const h = p.hole, R = pathR(h) / k, pk = H.on && i === H.pick;
      if (pk) { ctx.strokeStyle = '#1971c2'; ctx.lineWidth = 2.6 * px; ctx.beginPath(); ctx.arc(h.cx, h.cy, R, 0, Math.PI * 2); ctx.stroke(); }
      const t = `Ø ${h.d} mm`; ctx.font = `bold ${12 * px}px sans-serif`; ctx.textAlign = 'center'; ctx.textBaseline = 'bottom'; const w = ctx.measureText(t).width, y = h.cy - R - 5 * px;
      ctx.fillStyle = pk ? '#1971c2' : 'rgba(20,20,20,0.78)'; ctx.fillRect(h.cx - w / 2 - 4 * px, y - 15 * px, w + 8 * px, 16 * px); ctx.fillStyle = '#fff'; ctx.fillText(t, h.cx, y - 1 * px); } }
  function setOn(v) { H.on = !!v; if (!H.on) H.pick = -1; if (H.on && window.TB && TB.on) TB.setOn(false); panel(); if (window.T2 && H.on) { T2.SH.cur = null; } draw(); }
  function wire() { if (!$('hhBox')) return;
    document.querySelectorAll('[data-hole]').forEach(b => b.onclick = () => setOn(true));
    document.querySelectorAll('[data-shape]').forEach(b => b.addEventListener('click', () => setOn(false)));
    $('hhD').addEventListener('change', () => setD(+$('hhD').value)); $('hhK').addEventListener('change', () => setK(+$('hhK').value));
    $('hhGap').addEventListener('change', () => { const v = +$('hhGap').value; if (v >= 0 && v <= 50) { H.gap = r2(v); localStorage.setItem('wp-holeGap', H.gap); } panel(); });
    $('hhCut').addEventListener('change', () => { H.cut = $('hhCut').checked; localStorage.setItem('wp-holeCut', H.cut ? '1' : '0'); const p = S.paths[H.pick]; if (p && p.hole) { pushUndo(); if (H.cut) { p.cut = true; p.uc = 1; S.cutOn = true; } else { delete p.cut; delete p.uc; } changed(); syncInputs(); } panel(); });
    $('hhTop').onclick = toTop; $('hhDel').onclick = remove; $('hhDone').onclick = () => { setOn(false); setTool('sel'); };
    panel(); }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', wire); else wire();
  return { H, get on() { return H.on; }, sync, down, move, up, paint, panel, setOn, holes, hitHole, topSpot, add, circle, pathR };
})();
