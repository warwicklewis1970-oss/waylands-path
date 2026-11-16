// Waylands Path v4 - the simple tool set: Point to point, Draw, Break, Eraser, Thickness, Cut out, Clear space.
// One finger always does the tool; two fingers always move/zoom the picture (handled in app.js).
// Uses the app's globals (S, view, ctx, cv, draw, pushUndo, changed, toast, undo, kmm, snap, replacePath, keepSegs,
// deleteStretch, linked, setTool, tool, updStats, saveSoon, undoSt, redoSt, updUndo).
'use strict';
window.T4 = (() => {
  const IDS = ['p2p', 'draw', 'brk', 'rub', 'thick', 'cutout', 'clear'];
  const $ = id => document.getElementById(id);
  const tolT = e => (e && e.pointerType === 'mouse' ? 12 : 24) / view.s;
  const isEtch = p => p && !p.cut, isCut = p => p && p.cut;
  const d2 = (a, b) => Math.hypot(a[0] - b[0], a[1] - b[1]);
  let focus = null, flash = null; // flash = {p, until}: a new line glows blue for a moment
  const glow = p => { flash = { p, until: Date.now() + 1500 }; setTimeout(draw, 1550); }; // {pi, u}: line whose nearby points are shown
  // ---------- hit testing (etch lines first, the cut never steals a tap) ----------
  function hitLine(u, tolU, filt, skip = -1) { let best = null; S.paths.forEach((p, pi) => { if (pi === skip || !p.n.length || !filt(p)) return; const bb = BZ.bbox([p]);
      if (!bb || u[0] < bb.x0 - tolU || u[0] > bb.x1 + tolU || u[1] < bb.y0 - tolU || u[1] > bb.y1 + tolU) return;
      const r = BZ.nearest(p, u, Math.max(0.2, tolU / 6)); if (r && r.d <= tolU && (!best || r.d < best.d)) best = Object.assign(r, { pi }); }); return best; }
  function hitPt(u, tolU, filt, skip = -1) { let best = null, bd = tolU; S.paths.forEach((p, pi) => { if (pi === skip || !filt(p)) return; p.n.forEach((nd, j) => { const d = Math.hypot(nd.x - u[0], nd.y - u[1]); if (d < bd) { bd = d; best = { pi, j, pt: [nd.x, nd.y] }; } }); }); return best; }
  const hitEtch = (u, tolU, skip) => hitLine(u, tolU, isEtch, skip);
  // snap a point to an etch point or line; returns {pt, pi, k, t} (pi/k/t when it landed inside a line)
  function snapTo(u, tolU, skip = -1) { const n = hitPt(u, tolU * 0.7, isEtch, skip); if (n) return { pt: n.pt, node: n };
    const h = hitEtch(u, tolU * 0.6, skip); if (h) return { pt: h.pt, line: h }; return { pt: u.slice() }; }
  // make the line pass exactly through a snapped point (adds a point there) so the lines join
  function attach(s) { if (!s.line) return; const p = S.paths[s.line.pi]; if (!p) return; if (s.line.t < 0.02 || s.line.t > 0.98) return; BZ.insertNode(p, s.line.k, s.line.t); }
  // ---------- generic clipping: cut a path where insideFn changes, drop the inside pieces ----------
  function clip(p, inside, stepU) { const m = BZ.nseg(p); if (!m) return null; const flat = BZ.flatSegs(p, Math.max(0.05, stepU / 3)), cuts = new Map(); let any = false;
    for (let k = 0; k < m; k++) { const f = flat[k]; let L = 0; for (let i = 1; i < f.length; i++) L += d2(f[i - 1], f[i]); const N = Math.max(4, Math.min(600, Math.ceil(L / stepU)));
      let prev = inside(BZ.pointAt(p, k, 0)); if (prev) any = true; const ts = [];
      for (let i = 1; i <= N; i++) { const t = i / N, cur = inside(BZ.pointAt(p, k, t)); if (cur) any = true;
        if (cur !== prev) { let a = (i - 1) / N, b = t; for (let it = 0; it < 18; it++) { const mdl = (a + b) / 2; if (inside(BZ.pointAt(p, k, mdl)) === prev) a = mdl; else b = mdl; } const tt = (a + b) / 2; if (tt > 1e-4 && tt < 1 - 1e-4) ts.push(tt); }
        prev = cur; } if (ts.length) cuts.set(k, ts); }
    if (!any) return null; const q = BZ.clone(p);
    [...cuts.keys()].sort((a, b) => b - a).forEach(k => { let cur = 1; cuts.get(k).sort((a, b) => b - a).forEach(t => { BZ.insertNode(q, k, t / cur); cur = t; }); });
    const del = new Set(); for (let k = 0; k < BZ.nseg(q); k++) if (inside(BZ.pointAt(q, k, 0.5))) del.add(k);
    if (!del.size) return null; if (del.size === BZ.nseg(q)) return []; return keepSegs(q, del); }
  // apply clip to many paths (indices high->low so splicing keeps earlier indices valid). Returns how many paths changed.
  function clipAll(list, inside, stepU) { let n = 0; [...list].sort((a, b) => b - a).forEach(pi => { const r = clip(S.paths[pi], inside, stepU); if (r) { replacePath(pi, r); n++; } }); return n; }
  const nearBox = (pi, x0, y0, x1, y1) => { const bb = BZ.bbox([S.paths[pi]]); return bb && !(bb.x1 < x0 || bb.x0 > x1 || bb.y1 < y0 || bb.y0 > y1); };
  // ---------- state ----------
  const PP = { pi: -1, lastT: 0, lastU: null }, DR = { pts: null }, BR = { a: null, b: null, plan: null }, RB = { px: 22, mode: 'all', at: null }, TH = { pi: -1 }, CO = { region: null, sel: -1 }, CL = { pts: [] };
  // ================= gestures =================
  function down(e, p, u, base) { const g = Object.assign(base, { t4: tool, kind: 't4' }), tolU = tolT(e);
    if (tool === 'p2p') { const ch = PP.pi >= 0 && S.paths[PP.pi] ? PP.pi : -1;
      const n = hitPt(u, tolU * 0.7, isEtch); if (n && !(ch >= 0 && n.pi === ch && n.j === 0 && S.paths[ch].n.length > 2)) { g.node = n; g.snap = snap(); }
      else { const h = hitEtch(u, tolU * 0.6); if (h) { g.seg = h; g.snap = snap(); } }
      focus = { pi: (g.node || g.seg || {}).pi, u }; draw(); return g; }
    if (tool === 'draw') { DR.pts = [u.slice()]; return g; }
    if (tool === 'rub') { g.snap = snap(); g.last = u; RB.at = u; g.erased = 0; S.paths.forEach((q, i) => { q._rk = BZ.length(q) + i * 1e-6; }); draw(); return g; }
    if (tool === 'cutout') { const n = hitPt(u, tolU * 0.7, isCut); if (n) { g.node = n; g.snap = snap(); CO.sel = n.pi; } else { const h = hitLine(u, tolU * 0.5, isCut); if (h) { g.seg = h; g.snap = snap(); } }
      focus = { pi: (g.node || g.seg || {}).pi, u }; draw(); return g; }
    if (tool === 'clear') { let bi = -1, bd = tolU; CL.pts.forEach((q, i) => { const d = d2(q, u); if (d < bd) { bd = d; bi = i; } }); if (bi >= 0) g.cnode = bi; return g; }
    return g; }
  function move(g, p, u, e) {
    if (g.t4 === 'draw') { if (DR.pts && d2(u, DR.pts[DR.pts.length - 1]) * view.s > 1.5) DR.pts.push(u.slice()); draw(); return; }
    if (g.t4 === 'rub') { applyRub(g.last, u, g); g.last = u; RB.at = u; draw(); return; }
    if (g.t4 === 'clear') { if (g.cnode != null) { CL.pts[g.cnode] = u.slice(); draw(); } return; }
    if (g.node) { if (!g.moving) { const nd = S.paths[g.node.pi].n[g.node.j]; g.moving = [nd, ...linked(g.node.pi, g.node.j)]; g.lastU = g.u0; }
      const dx = u[0] - g.lastU[0], dy = u[1] - g.lastU[1]; g.lastU = u; for (const m of g.moving) BZ.moveNode(m, dx, dy); draw(); return; }
    if (g.seg) { S.paths = BZ.clone(g.snap); BZ.bend(S.paths[g.seg.pi], g.seg.k, g.seg.t, u[0] - g.u0[0], u[1] - g.u0[1]); draw(); return; } }
  function up(g, e) { const u = g.u0, tolU = tolT(e);
    if (g.t4 === 'rub') { RB.at = null; S.paths.forEach(q => { delete q._rk; }); if (g.snap) g.snap.forEach(q => { delete q._rk; }); if (g.moved) { if (g.erased) { undoSt.push(g.snap); redoSt = []; changed(); toast('Rubbed out - Undo brings it back'); } else draw(); return; }
      const h = hitEtch(u, tolU); if (h) { deleteStretch(h); toast('Line removed up to the junctions - Undo brings it back'); } else { draw(); toast('Rub over lines to erase, or tap right on a line'); } return; }
    if ((g.node || g.seg) && g.moved) { undoSt.push(g.snap); redoSt = []; changed(); if (g.t4 === 'cutout') panel(); return; }
    if (g.t4 === 'p2p') { if (!g.moved) p2pTap(u, e); return; }
    if (g.t4 === 'draw') { finishDraw(e); return; }
    if (g.t4 === 'brk') { if (!g.moved) brkTap(u, e); return; }
    if (g.t4 === 'thick') { if (!g.moved) { const h = hitEtch(u, tolU); TH.pi = h ? h.pi : -1; focus = null; if (!h) toast('Tap right on a line'); panel(); draw(); } return; }
    if (g.t4 === 'cutout') { if (g.moved) return; if (g.seg || g.node) { CO.sel = (g.seg || g.node).pi; CO.region = null; panel(); draw(); return; } CO.sel = -1; findRegion(u); return; }
    if (g.t4 === 'clear') { if (g.cnode != null) { if (!g.moved) { /* tap on a point: nothing */ } panel(); draw(); return; } if (!g.moved) { CL.pts.push(u.slice()); panel(); draw(); } return; } }
  function cancelG(g) { if (g.t4 === 'draw') DR.pts = null; if (g.t4 === 'rub') RB.at = null; }
  // ================= Point to point =================
  function p2pTap(u, e) { const tolU = tolT(e), now = Date.now(); let ch = PP.pi >= 0 && S.paths[PP.pi] && PP.live ? PP.pi : -1;
    if (ch >= 0 && now - PP.lastT < 380 && PP.lastU && d2(PP.lastU, u) * view.s < 28) { p2pDone(); return; }
    PP.lastT = now; PP.lastU = u;
    if (ch >= 0) { const p = S.paths[ch], f = p.n[0]; if (p.n.length > 2 && d2([f.x, f.y], u) < tolU * 0.8) { pushUndo(); S.paths[ch].z = true; PP.live = false; PP.pi = -1; changed(); toast('Shape closed'); panel(); return; }
      const s = snapTo(u, tolU, ch); pushUndo(); attach(s); S.paths[ch].n.push(BZ.node(s.pt[0], s.pt[1])); changed(); panel(); return; }
    const s = snapTo(u, tolU); pushUndo(); attach(s); S.paths.push({ n: [BZ.node(s.pt[0], s.pt[1])], z: false }); PP.pi = S.paths.length - 1; PP.live = true; changed(); panel(); }
  function p2pDone() { const ch = PP.pi; PP.live = false; PP.pi = -1; PP.lastT = 0; if (ch >= 0 && S.paths[ch] && S.paths[ch].n.length < 2) { S.paths.splice(ch, 1); } changed(); panel(); }
  // ================= Draw =================
  function finishDraw(e) { const pts = DR.pts; DR.pts = null; if (!pts || pts.length < 2) { draw(); return; } let L = 0; for (let i = 1; i < pts.length; i++) L += d2(pts[i - 1], pts[i]);
    if (L * view.s < 8) { draw(); toast('Drag your finger to draw'); return; } const tolU = tolT(e), closed = pts.length > 4 && d2(pts[0], pts[pts.length - 1]) < tolU && L * view.s > 60;
    const px = 1 / view.s, p = BZ.fromPolyline(pts, { closed, tol: 1.2 * px, lineTol: 1.4 * px, arm: 6 * px, corner: 45 }); if (!p || p.n.length < 2) { draw(); return; }
    pushUndo(); if (!closed) { for (const end of [0, p.n.length - 1]) { const nd = p.n[end], s = snapTo([nd.x, nd.y], tolU); if (s.node || s.line) { BZ.moveNode(nd, s.pt[0] - nd.x, s.pt[1] - nd.y); attach(s); } } }
    S.paths.push(p); glow(p); changed(); toast(closed ? 'Closed shape drawn' : 'Line drawn'); }
  // ================= Break =================
  function brkPick(u, tolU) { const n = hitPt(u, tolU * 0.7, isEtch); if (n) { const p = S.paths[n.pi]; if (!p.z && (n.j === 0 || n.j === p.n.length - 1)) return { pt: n.pt, pi: n.pi, end: true, k: n.j === 0 ? 0 : BZ.nseg(p) - 1, t: n.j === 0 ? 0 : 1 };
      const k = p.z || n.j < p.n.length - 1 ? n.j : n.j - 1, t = k === n.j ? 0 : 1; return { pt: n.pt, pi: n.pi, k, t }; }
    const h = hitEtch(u, tolU * 0.8); if (h) return { pt: h.pt, pi: h.pi, k: h.k, t: h.t }; return { pt: u.slice(), free: true }; }
  // insert nodes for two positions on one path, return {q, j1, j2} with j1 < j2 (node indices)
  function twoNodes(p, a, b) { const q = BZ.clone(p); let A = { k: a.k, t: a.t }, B = { k: b.k, t: b.t }; if (A.k > B.k || (A.k === B.k && A.t > B.t)) [A, B] = [B, A];
    const nodeAt = (pos) => pos.t <= 1e-6 ? pos.k : pos.t >= 1 - 1e-6 ? (pos.k + 1) % q.n.length : -1;
    let j2 = nodeAt(B), j1; if (j2 < 0) j2 = BZ.insertNode(q, B.k, B.t);
    if (A.k === B.k && nodeAt(B) < 0 && A.t > 1e-6) { j1 = BZ.insertNode(q, A.k, A.t / B.t); j2 += 1; } else { j1 = nodeAt(A); if (j1 < 0) { j1 = BZ.insertNode(q, A.k, A.t); j2 += 1; } }
    if (!q.z && j2 === 0 && j1 > 0) j2 = q.n.length - 1; return { q, j1, j2 }; }
  function brkPlan() { const a = BR.a, b = BR.b; if (!a || !b) return null;
    if (!a.free && !b.free && a.pi === b.pi && !(a.end && b.end) && d2(a.pt, b.pt) > 1e-6) { const p = S.paths[a.pi], { q, j1, j2 } = twoNodes(p, a, b), m = BZ.nseg(q);
      const fwd = new Set(); for (let k = j1; k !== j2; k = (k + 1) % q.n.length) fwd.add(k);
      let del = fwd; if (q.z) { const back = new Set(); for (let k = 0; k < m; k++) if (!fwd.has(k)) back.add(k); const len = s => [...s].reduce((acc, k) => acc + BZ.length({ n: [q.n[k], q.n[(k + 1) % q.n.length]], z: false }), 0); if (len(back) < len(fwd)) del = back; }
      const removed = keepSegs(q, new Set([...Array(m).keys()].filter(k => !del.has(k)))); return { kind: 'del', pi: a.pi, keep: keepSegs(q, del), removed }; }
    return { kind: 'add', a, b }; }
  function brkTap(u, e) { const tolU = tolT(e), pk = brkPick(u, tolU); if (!BR.a || BR.b) { BR.a = pk; BR.b = null; BR.plan = null; } else { BR.b = pk; BR.plan = brkPlan(); } panel(); draw(); }
  function brkConfirm() { const pl = BR.plan; if (!pl) return; pushUndo();
    if (pl.kind === 'del') { replacePath(pl.pi, pl.keep); toast('Section removed - the laser stays off across the gap'); }
    else { const pts = [pl.a, pl.b]; // insert join points into lines (higher index first is not needed: insert does not reindex paths)
      for (const s of pts) if (!s.free && !s.end && s.t > 1e-6 && s.t < 1 - 1e-6) { const p = S.paths[s.pi]; if (p) BZ.insertNode(p, s.k, s.t); }
      const nl = BZ.fromPoints([pl.a.pt, pl.b.pt], false); S.paths.push(nl); glow(nl); toast('Line added'); }
    BR.a = BR.b = BR.plan = null; changed(); panel(); }
  // ================= Eraser =================
  function applyRub(a, b, g) { const r = RB.px / view.s, x0 = Math.min(a[0], b[0]) - r, x1 = Math.max(a[0], b[0]) + r, y0 = Math.min(a[1], b[1]) - r, y1 = Math.max(a[1], b[1]) + r;
    const inBrush = q => BZ.segD(q, a, b)[0] <= r, step = Math.max(0.3, r / 5); let cand = S.paths.map((p, i) => i).filter(pi => !S.paths[pi].cut && nearBox(pi, x0, y0, x1, y1));
    if (RB.mode === 'all') { const n = clipAll(cand, inBrush, step); if (n && g) g.erased += n; return; }
    // doubled lines only: shorter line loses the bit lying on top of another line
    // rank = the line's whole length when the rub started (pieces keep it), so the real line never loses out to a shorter copy
    const dup = Math.max(S.lineMm * 0.8 / kmm(), 2.5 / view.s), rk = q => q._rk != null ? q._rk : BZ.length(q); cand.sort((i, j) => rk(S.paths[i]) - rk(S.paths[j]));
    const order = cand.map(pi => S.paths[pi]); for (const p of order) { const pi = S.paths.indexOf(p); if (pi < 0) continue; const mine = rk(p);
      const others = S.paths.filter((o, oi) => oi !== pi && !o.cut && rk(o) > mine && nearBox(oi, x0 - dup, y0 - dup, x1 + dup, y1 + dup)).map(o => BZ.flatten(o, dup / 4)); if (!others.length) continue;
      const pf = BZ.flatten(p, dup / 4), dirAt = q => { let bd = Infinity, v = [1, 0]; for (let i = 1; i < pf.length; i++) { const d = BZ.segD(q, pf[i - 1], pf[i])[0]; if (d < bd) { bd = d; v = [pf[i][0] - pf[i - 1][0], pf[i][1] - pf[i - 1][1]]; } } const l = Math.hypot(v[0], v[1]) || 1; return [v[0] / l, v[1] / l]; };
      // on top of another line = within the laser line width of it AND running the same way (a line that only meets it at a junction does not count)
      const onOther = q => { const dv = dirAt(q); return others.some(f => { for (let i = 1; i < f.length; i++) { if (BZ.segD(q, f[i - 1], f[i])[0] > dup) continue; const sx = f[i][0] - f[i - 1][0], sy = f[i][1] - f[i - 1][1], sl = Math.hypot(sx, sy) || 1; if (Math.abs(dv[0] * sy - dv[1] * sx) / sl < 0.42) return true; } return false; }); };
      const r2 = clip(p, q => inBrush(q) && onOther(q), Math.max(0.3, dup / 2)); if (r2) { replacePath(pi, r2); if (g) g.erased++; } } }
  // ================= Thickness =================
  function setThick(list, w, dbl) { const lw = S.lineMm; for (const p of list) { if (w > lw + 1e-9) p.w = Math.round(w * 1000) / 1000; else delete p.w; if (dbl > 0) p.dbl = Math.round(dbl * 1000) / 1000; else delete p.dbl; } }
  function thickVals() { const w = +$('t4w').value || S.lineMm, on = $('t4dbl').checked, dd = Math.max(0.01, +$('t4dd').value || 0.5); return { w, dbl: on ? dd : 0 }; }
  function applyThick(all) { const v = thickVals(); const list = all ? S.paths.filter(isEtch) : (TH.pi >= 0 && isEtch(S.paths[TH.pi]) ? [S.paths[TH.pi]] : []);
    if (!list.length) { toast(all ? 'No lines yet' : 'Tap a line first'); return; } pushUndo(); setThick(list, v.w, v.dbl); changed(); panel();
    if (all) toast(`All ${list.length} lines: ${describe(list[0])}`); }
  function describe(p) { const lw = S.lineMm, o = LZ.widthOffs(p, lw); if (!o) return `normal (one ${lw} mm pass)`; return `${p.w ? `${p.w} mm thick` : 'normal width'}${p.dbl ? `, double line ${p.dbl} mm apart` : ''} = ${o.length} passes`; }
  function paintThick(px) { const k = kmm(), lw = S.lineMm; ctx.strokeStyle = '#151515'; ctx.lineWidth = Math.max(1.2 * px, lw / k); ctx.beginPath();
    S.paths.forEach(p => { if (p.cut) return; const o = LZ.widthOffs(p, lw); if (!o) return; const f = BZ.flatten(p, 0.3 * px); for (const d of o) { const q = LZ.offsetPoly(f, d / k, !!p.z); ctx.moveTo(q[0][0], q[0][1]); for (let i = 1; i < q.length; i++) ctx.lineTo(q[i][0], q[i][1]); } }); ctx.stroke(); }
  const plain = p => !p.cut && !LZ.widthOffs(p, S.lineMm);
  // ================= Cut out =================
  function findRegion(u) { const e = S.paths.filter(p => p.n.length > 1); const bb = BZ.bbox(e); if (!bb) return; const pad = 4 / view.s, s = 1400 / Math.max(bb.w + 2 * pad, bb.h + 2 * pad), ox = bb.x0 - pad, oy = bb.y0 - pad;
    const w = Math.ceil((bb.w + 2 * pad) * s) + 2, h = Math.ceil((bb.h + 2 * pad) * s) + 2, c = document.createElement('canvas'); c.width = w; c.height = h; const g = c.getContext('2d');
    g.fillStyle = '#fff'; g.fillRect(0, 0, w, h); g.strokeStyle = '#000'; const sw = Math.max(2.2, S.lineMm / kmm() * s); g.lineWidth = sw; g.lineCap = g.lineJoin = 'round'; g.beginPath();
    for (const p of e) { const f = BZ.flatten(p, 0.4 / s); g.moveTo((f[0][0] - ox) * s, (f[0][1] - oy) * s); for (let i = 1; i < f.length; i++) g.lineTo((f[i][0] - ox) * s, (f[i][1] - oy) * s); } g.stroke();
    const id = g.getImageData(0, 0, w, h).data, ink = new Uint8Array(w * h); for (let i = 0; i < ink.length; i++) ink[i] = id[i * 4] < 128 ? 1 : 0;
    const sx = Math.round((u[0] - ox) * s), sy = Math.round((u[1] - oy) * s); if (sx < 1 || sy < 1 || sx >= w - 1 || sy >= h - 1) { CO.region = null; toast('Tap inside an area that is closed in by lines'); panel(); draw(); return; }
    if (ink[sy * w + sx]) { CO.region = null; toast('Tap inside the area, not on a line'); panel(); draw(); return; }
    const m = new Uint8Array(w * h), st = [sy * w + sx]; m[st[0]] = 1; let open = false, cnt = 0;
    while (st.length) { const i = st.pop(); cnt++; const x = i % w, y = (i - x) / w; if (x === 0 || y === 0 || x === w - 1 || y === h - 1) { open = true; break; }
      for (const j of [i - 1, i + 1, i - w, i + w]) if (!m[j] && !ink[j]) { m[j] = 1; st.push(j); } }
    if (open) { CO.region = null; toast('That area is not closed in - it reaches the outside. Close the gap with Break or Point to point first.', 4500); panel(); draw(); return; }
    const loops = T.outerCut(m, w, h, sw / 2, 0).map(l => l.map(([x, y]) => [x / s + ox, y / s + oy])); if (!loops.length) { CO.region = null; panel(); draw(); return; }
    loops.sort((a, b) => Math.abs(T.area(b)) - Math.abs(T.area(a))); const loop = loops[0], A = Math.abs(T.area(loop));
    // an existing closed line that already is this area's border (e.g. a window) is used as it is
    let match = -1, best = Infinity; S.paths.forEach((p, pi) => { if (!p.z || p.n.length < 2) return; const f = BZ.flatten(p, 0.5 / s); if (!BZ.inside(f, u)) return; const a = Math.abs(T.area(f)); if (Math.abs(a - A) / a < 0.12 && a < best) { best = a; match = pi; } });
    CO.region = { loop, match, u }; panel(); draw(); }
  function doCutOut() { const r = CO.region; if (!r) { toast('Tap inside an area first'); return; } pushUndo(); let pi;
    if (r.match >= 0) { S.paths[r.match].cut = true; delete S.paths[r.match].w; delete S.paths[r.match].dbl; pi = r.match; }
    else { const px = 1 / view.s, p = BZ.fromPolyline(r.loop, { closed: true, tol: Math.max(0.4, 0.8 * px), arm: 4 * px, corner: 40 }); if (!p) { undoSt.pop(); updUndo(); toast('Could not make that cut'); return; } p.cut = true; S.paths.push(p); pi = S.paths.length - 1; }
    S.cutOn = true; CO.region = null; CO.sel = pi; changed(); panel(); toast('Cut out made - it is cut before the outside. Drag its points to adjust.', 3500); }
  function makeEtch() { const p = S.paths[CO.sel]; if (!isCut(p)) return; pushUndo(); delete p.cut; CO.sel = -1; changed(); panel(); toast('That line is an etch line again'); }
  // ================= Clear space =================
  function doClear() { if (CL.pts.length < 3) { toast('Tap at least 3 points round the area'); return; } const poly = CL.pts, inside = q => BZ.inside(poly, q);
    let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity; for (const q of poly) { x0 = Math.min(x0, q[0]); y0 = Math.min(y0, q[1]); x1 = Math.max(x1, q[0]); y1 = Math.max(y1, q[1]); }
    const snap0 = snap(), list = S.paths.map((p, i) => i).filter(pi => isEtch(S.paths[pi]) && nearBox(pi, x0, y0, x1, y1)), n = clipAll(list, inside, Math.max(0.3, 1.5 / view.s));
    if (!n) { toast('No lines inside that area'); return; } undoSt.push(snap0); redoSt = []; CL.pts = []; changed(); panel(); toast(`Cleared - ${n} line${n > 1 ? 's' : ''} trimmed at the edge`); }
  // ================= panel & paint =================
  const HINT = { p2p: 'Tap, tap, tap: straight lines point to point (they snap onto lines). Drag a line to bend it, drag a dot to move it. Double-tap or Done to finish.',
    draw: 'Draw with one finger. The line is smoothed and its ends snap onto nearby lines. Two fingers move the picture.',
    rub: 'Rub over lines to erase them. Tap a line to remove it up to the next junction.',
    clear: 'Tap round the area to drop points (drag a point to move it). Then Clear removes every line inside.' };
  function panel() { if (!IDS.includes(tool)) return; const set = (id, h) => { const el = $(id); if (el) el.innerHTML = h; };
    if (tool === 'p2p') { $('t4ppDone').disabled = !(PP.live && PP.pi >= 0); set('t4ppHint', PP.live ? `Drawing: ${S.paths[PP.pi] ? S.paths[PP.pi].n.length : 0} point(s). Tap the next point, tap the first point to close, or Done.` : HINT.p2p); }
    if (tool === 'brk') { set('t4brHint', !BR.a ? 'Tap two points. On one line: the bit between is removed. Across a gap or on two ends: a line is added.' : !BR.b ? 'Now tap the second point.' :
      BR.plan && BR.plan.kind === 'del' ? '<b style="color:#e03131">Red dashes</b> = the section that will be removed. Tap Confirm.' : '<b style="color:#e8590c">Orange</b> = the line that will be added. Tap Confirm.');
      $('t4brOk').disabled = !BR.plan; $('t4brOk').textContent = BR.plan ? (BR.plan.kind === 'del' ? '✓ Confirm: remove' : '✓ Confirm: add line') : '✓ Confirm'; }
    if (tool === 'rub') set('t4rbOut', `${(RB.px / view.s * kmm()).toFixed(1)} mm`);
    if (tool === 'thick') { const p = TH.pi >= 0 ? S.paths[TH.pi] : null; set('t4thHint', p ? `This line: ${describe(p)}.` : 'Tap a line to pick it (it turns blue), then set its thickness.');
      if (p) { $('t4w').value = p.w || S.lineMm; $('t4wn').value = (p.w || S.lineMm); $('t4dbl').checked = !!p.dbl; if (p.dbl) $('t4dd').value = p.dbl.toFixed(2); } $('t4w').min = S.lineMm; $('t4ddRow').hidden = !$('t4dbl').checked; }
    if (tool === 'cutout') { $('t4coGo').disabled = !CO.region; $('t4coEtch').hidden = !(CO.sel >= 0 && isCut(S.paths[CO.sel]));
      set('t4coHint', CO.region ? (CO.region.match >= 0 ? 'This closed line will become a cut hole. Tap ✂ Cut out.' : 'The orange area will be cut out. Tap ✂ Cut out.') : CO.sel >= 0 ? 'Cut line picked. Drag its points or bend it to adjust.' : 'Tap inside an area (a window, a gap) to cut it out. Drag any grey cut line or its points to adjust it.'); }
    if (tool === 'clear') { $('t4clGo').disabled = CL.pts.length < 3; set('t4clHint', CL.pts.length ? `${CL.pts.length} point${CL.pts.length > 1 ? 's' : ''}. ${CL.pts.length < 3 ? 'Keep tapping round the area.' : 'Tap Clear to remove every line inside.'}` : HINT.clear); } }
  function paint(px) { const r = 4.5 * px;
    if (flash && Date.now() < flash.until && S.paths.includes(flash.p)) { ctx.strokeStyle = '#1971c2'; ctx.lineWidth = 3 * px; ctx.beginPath(); tracePath(flash.p); ctx.stroke(); }
    if (focus && S.paths[focus.pi] && (tool === 'p2p' || tool === 'cutout')) { const R = 120 * px; S.paths[focus.pi].n.forEach(nd => { if (Math.hypot(nd.x - focus.u[0], nd.y - focus.u[1]) > R) return; ctx.fillStyle = '#fff'; ctx.strokeStyle = '#1d3557'; ctx.lineWidth = 1.3 * px; ctx.beginPath(); ctx.arc(nd.x, nd.y, r, 0, 7); ctx.fill(); ctx.stroke(); }); }
    if (tool === 'p2p' && PP.live && S.paths[PP.pi]) { const p = S.paths[PP.pi]; ctx.strokeStyle = '#1971c2'; ctx.lineWidth = 2.6 * px; ctx.beginPath(); tracePath(p); ctx.stroke();
      p.n.forEach((nd, j) => { ctx.fillStyle = j === 0 ? '#1971c2' : '#fff'; ctx.strokeStyle = '#1971c2'; ctx.lineWidth = 1.5 * px; ctx.beginPath(); ctx.arc(nd.x, nd.y, j === 0 ? r * 1.4 : r, 0, 7); ctx.fill(); ctx.stroke(); }); }
    if (tool === 'draw' && DR.pts) { ctx.strokeStyle = '#1971c2'; ctx.lineWidth = 2.4 * px; ctx.beginPath(); ctx.moveTo(DR.pts[0][0], DR.pts[0][1]); for (const q of DR.pts) ctx.lineTo(q[0], q[1]); ctx.stroke(); }
    if (tool === 'brk') { const dot = (s, c) => { ctx.fillStyle = c; ctx.beginPath(); ctx.arc(s.pt[0], s.pt[1], 6 * px, 0, 7); ctx.fill(); };
      const pl = BR.plan; if (pl && pl.kind === 'del') { ctx.strokeStyle = '#e03131'; ctx.lineWidth = 4 * px; ctx.setLineDash([6 * px, 5 * px]); ctx.beginPath(); pl.removed.forEach(tracePath); ctx.stroke(); ctx.setLineDash([]); }
      if (pl && pl.kind === 'add') { ctx.strokeStyle = '#e8590c'; ctx.lineWidth = 3.5 * px; ctx.beginPath(); ctx.moveTo(pl.a.pt[0], pl.a.pt[1]); ctx.lineTo(pl.b.pt[0], pl.b.pt[1]); ctx.stroke(); }
      if (BR.a) dot(BR.a, '#e8590c'); if (BR.b) dot(BR.b, '#e8590c'); }
    if (tool === 'rub' && RB.at) { ctx.strokeStyle = 'rgba(224,49,49,0.9)'; ctx.fillStyle = 'rgba(224,49,49,0.12)'; ctx.lineWidth = 1.5 * px; ctx.beginPath(); ctx.arc(RB.at[0], RB.at[1], RB.px * px, 0, 7); ctx.fill(); ctx.stroke(); }
    if (tool === 'thick' && TH.pi >= 0 && S.paths[TH.pi]) { ctx.strokeStyle = 'rgba(25,113,194,0.55)'; ctx.lineWidth = Math.max(6 * px, ((S.paths[TH.pi].w || S.lineMm) + (S.paths[TH.pi].dbl || 0)) / kmm() + 4 * px); ctx.beginPath(); tracePath(S.paths[TH.pi]); ctx.stroke(); }
    if (tool === 'cutout') { if (CO.region) { const l = CO.region.loop; ctx.fillStyle = 'rgba(232,89,12,0.25)'; ctx.strokeStyle = '#e8590c'; ctx.lineWidth = 2.5 * px; ctx.beginPath(); ctx.moveTo(l[0][0], l[0][1]); for (const q of l) ctx.lineTo(q[0], q[1]); ctx.closePath(); ctx.fill(); ctx.stroke(); }
      if (CO.sel >= 0 && isCut(S.paths[CO.sel])) { ctx.strokeStyle = '#1971c2'; ctx.lineWidth = 2.6 * px; ctx.beginPath(); tracePath(S.paths[CO.sel]); ctx.stroke(); } }
    if (tool === 'clear' && CL.pts.length) { ctx.fillStyle = 'rgba(224,49,49,0.14)'; ctx.strokeStyle = '#e03131'; ctx.lineWidth = 2 * px; ctx.beginPath(); ctx.moveTo(CL.pts[0][0], CL.pts[0][1]); for (const q of CL.pts) ctx.lineTo(q[0], q[1]); if (CL.pts.length > 2) ctx.closePath(); ctx.fill(); ctx.stroke();
      CL.pts.forEach((q, i) => { ctx.fillStyle = i === 0 ? '#e03131' : '#fff'; ctx.strokeStyle = '#e03131'; ctx.lineWidth = 1.8 * px; ctx.beginPath(); ctx.arc(q[0], q[1], (i === 0 ? 7 : 6) * px, 0, 7); ctx.fill(); ctx.stroke(); }); } }
  function reset() { if (PP.live && PP.pi >= 0 && !S.paths[PP.pi]) PP.live = false; if (PP.live && PP.pi >= 0 && S.paths[PP.pi] && S.paths[PP.pi].n.length < 1) PP.live = false; BR.a = BR.b = BR.plan = null; CO.region = null; if (TH.pi >= S.paths.length) TH.pi = -1; if (CO.sel >= S.paths.length) CO.sel = -1; focus = null; panel(); }
  function onTool(t, prev) { if (prev === 'p2p' && t !== 'p2p' && PP.live) p2pDone(); BR.a = BR.b = BR.plan = null; CO.region = null; focus = null; if (t !== 'thick') TH.pi = -1; if (t !== 'clear') CL.pts = []; DR.pts = null; RB.at = null; panel(); }
  function wire() { const on = (id, f) => { const el = $(id); if (el) el.onclick = f; };
    on('t4ppDone', p2pDone); on('t4ppUndo', undo); on('t4drUndo', undo); on('t4brOk', brkConfirm); on('t4brNo', () => { BR.a = BR.b = BR.plan = null; panel(); draw(); }); on('t4rbUndo', undo);
    on('t4coGo', doCutOut); on('t4coEtch', makeEtch); on('t4clGo', doClear); on('t4clBack', () => { CL.pts.pop(); panel(); draw(); }); on('t4clNo', () => { CL.pts = []; panel(); draw(); });
    on('t4thAll', () => applyThick(true)); on('t4coOut', () => WP.openMenu('sec-size'));
    const rb = $('t4rb'); if (rb) rb.oninput = () => { RB.px = +rb.value; panel(); };
    document.querySelectorAll('[data-rbmode]').forEach(b => b.onclick = () => { RB.mode = b.dataset.rbmode; document.querySelectorAll('[data-rbmode]').forEach(x => x.classList.toggle('on', x === b)); });
    const w = $('t4w'), wn = $('t4wn'), dbl = $('t4dbl'), dd = $('t4dd');
    if (w) { w.oninput = () => { wn.value = (+w.value).toFixed(2); }; w.onchange = () => applyThick(false);
      wn.onchange = () => { let v = +wn.value; if (!(v >= 0)) v = S.lineMm; if (v < S.lineMm) { toast(`Thinner than the laser line (${S.lineMm} mm) - stays one normal pass`); v = S.lineMm; } v = Math.min(10, v); wn.value = v; w.value = v; applyThick(false); };
      dbl.onchange = () => { $('t4ddRow').hidden = !dbl.checked; applyThick(false); };
      const stepDD = s => { let v = Math.round(((+dd.value || 0) + s) * 100) / 100; v = Math.max(0.01, Math.min(20, v)); dd.value = v.toFixed(2); if (dbl.checked) applyThick(false); };
      on('t4ddM', () => stepDD(-0.01)); on('t4ddP', () => stepDD(0.01)); dd.onchange = () => stepDD(0); } }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', wire); else wire();
  return { IDS, down, move, up, cancelG, paint, paintThick, plain, panel, reset, onTool, clip, hitEtch, PP, BR, RB, TH, CO, CL, p2pDone, brkConfirm, doCutOut, doClear, applyThick, findRegion };
})();
