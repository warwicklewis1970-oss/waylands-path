// Waylands Path v4 - the simple tool set: Point to point, Draw, Break, Eraser, Thickness, Cut out, Clear space.
// One finger always does the tool; two fingers always move/zoom the picture (handled in app.js).
// Uses the app's globals (S, view, ctx, cv, draw, pushUndo, changed, toast, undo, kmm, snap, replacePath, keepSegs,
// deleteStretch, linked, setTool, tool, updStats, saveSoon, undoSt, redoSt, updUndo).
'use strict';
window.T4 = (() => {
  const IDS = ['sel', 'p2p', 'draw', 'brk', 'rub', 'thick', 'cutout', 'clear', 'edge'];
  const $ = id => document.getElementById(id);
  const tolT = e => (e && e.pointerType === 'mouse' ? 12 : 24) / view.s;
  const isEtch = p => p && !p.cut, isCut = p => p && p.cut;
  let inkCut = false; try { inkCut = localStorage.getItem('wp-inkCut') === '1'; } catch (e) {}
  function setInkCut(v) { inkCut = !!v; try { localStorage.setItem('wp-inkCut', inkCut ? '1' : '0'); } catch (e) {} panel(); draw(); }
  const markInk = p => { if (inkCut && p) { p.cut = true; p.uc = 1; S.cutOn = true; } return p; };
  const d2 = (a, b) => Math.hypot(a[0] - b[0], a[1] - b[1]);
  let focus = null, flash = null; // flash = {p, until}: a new line glows blue for a moment
  const glow = p => { flash = { p, until: Date.now() + 1500 }; setTimeout(draw, 1550); }; // {pi, u}: line whose nearby points are shown
  // ---------- hit testing (etch wins if you tap right on it; the red outside cut is otherwise tappable like any line) ----------
  const isEdit = p => p && !p.hole; // etch + cut lines (not hanging holes, which have their own tool)
  function hitLine(u, tolU, filt, skip = -1) { let best = null; S.paths.forEach((p, pi) => { if (pi === skip || !p.n.length || !filt(p)) return; const bb = BZ.bbox([p]);
      if (!bb || u[0] < bb.x0 - tolU || u[0] > bb.x1 + tolU || u[1] < bb.y0 - tolU || u[1] > bb.y1 + tolU) return;
      const r = BZ.nearest(p, u, Math.max(0.2, tolU / 6)); if (r && r.d <= tolU && (!best || r.d < best.d)) best = Object.assign(r, { pi }); }); return best; }
  function hitPt(u, tolU, filt, skip = -1) { let best = null, bd = tolU; S.paths.forEach((p, pi) => { if (pi === skip || !filt(p)) return; p.n.forEach((nd, j) => { const d = Math.hypot(nd.x - u[0], nd.y - u[1]); if (d < bd) { bd = d; best = { pi, j, pt: [nd.x, nd.y] }; } }); }); return best; }
  const hitEtch = (u, tolU, skip) => hitLine(u, tolU, isEtch, skip);
  // prefer an etch line when both are under the finger, so the outside cut does not steal taps from the drawing
  function hitAny(u, tolU, skip) { const e = hitLine(u, tolU, isEtch, skip), c = hitLine(u, tolU, isEdit, skip); if (e && c && e.pi !== c.pi) return e.d <= c.d + 5 / view.s ? e : c; return e || c; }
  function hitPtAny(u, tolU, skip) { const e = hitPt(u, tolU, isEtch, skip), c = hitPt(u, tolU, isEdit, skip); if (e && c && e.pi !== c.pi) { const de = Math.hypot(e.pt[0] - u[0], e.pt[1] - u[1]), dc = Math.hypot(c.pt[0] - u[0], c.pt[1] - u[1]); return de <= dc + 5 / view.s ? e : c; } return e || c; }
  function snapTo(u, tolU, skip = -1) { const n = hitPtAny(u, tolU * 0.7, skip); if (n) return { pt: n.pt, node: n };
    const h = hitAny(u, tolU * 0.6, skip); if (h) return { pt: h.pt, line: h }; return { pt: u.slice() }; }
  // make the line pass exactly through a snapped point (adds a point there) so the lines join
  function attach(s) { if (!s.line) return; const p = S.paths[s.line.pi]; if (!p) return; if (s.line.t < 0.02 || s.line.t > 0.98) return; BZ.insertNode(p, s.line.k, s.line.t); }
  // ---------- generic clipping: cut a path where insideFn changes, drop the inside pieces ----------
  function clip(p, inside, stepU, minU) { const m = BZ.nseg(p); if (!m) return null; const flat = BZ.flatSegs(p, Math.max(0.05, stepU / 3)), cuts = new Map(); let any = false;
    for (let k = 0; k < m; k++) { const f = flat[k]; let L = 0; for (let i = 1; i < f.length; i++) L += d2(f[i - 1], f[i]); const N = Math.max(4, Math.min(600, Math.ceil(L / stepU)));
      let prev = inside(BZ.pointAt(p, k, 0)); if (prev) any = true; const ts = [];
      for (let i = 1; i <= N; i++) { const t = i / N, cur = inside(BZ.pointAt(p, k, t)); if (cur) any = true;
        if (cur !== prev) { let a = (i - 1) / N, b = t; for (let it = 0; it < 18; it++) { const mdl = (a + b) / 2; if (inside(BZ.pointAt(p, k, mdl)) === prev) a = mdl; else b = mdl; } const tt = (a + b) / 2; if (tt > 1e-4 && tt < 1 - 1e-4) ts.push(tt); }
        prev = cur; } if (ts.length) cuts.set(k, ts); }
    if (!any) return null; const q = BZ.clone(p);
    [...cuts.keys()].sort((a, b) => b - a).forEach(k => { let cur = 1; cuts.get(k).sort((a, b) => b - a).forEach(t => { BZ.insertNode(q, k, t / cur); cur = t; }); });
    const del = new Set(); for (let k = 0; k < BZ.nseg(q); k++) if (inside(BZ.pointAt(q, k, 0.5))) del.add(k);
    if (minU > 0 && del.size) tidyRuns(q, del, minU);
    if (!del.size) return null; if (del.size === BZ.nseg(q)) return []; return keepSegs(q, del); }
  // Clear space tidy-up: a removed bit shorter than minU is a speck (a frame touched where another line meets it) - keep it;
  // a kept crumb shorter than minU next to a removed stretch is dropped
  function tidyRuns(q, del, minU) { const m = BZ.nseg(q), fs = BZ.flatSegs(q, minU / 6), len = fs.map(f => { let L = 0; for (let i = 1; i < f.length; i++) L += d2(f[i - 1], f[i]); return L; });
    const runs = () => { const out = []; let start = 0; if (q.z) { start = -1; for (let k = 0; k < m; k++) if (del.has(k) !== del.has((k + m - 1) % m)) { start = k; break; } if (start < 0) return [{ d: del.has(0), ks: [...Array(m).keys()] }]; }
      let cur = null; for (let c = 0; c < m; c++) { const k = (start + c) % m, d = del.has(k); if (!cur || cur.d !== d) { cur = { d, ks: [] }; out.push(cur); } cur.ks.push(k); } return out; };
    const L = r => r.ks.reduce((a, k) => a + len[k], 0);
    for (const r of runs()) if (r.d && L(r) < minU) r.ks.forEach(k => del.delete(k));
    if (del.size) for (const r of runs()) if (!r.d && L(r) < minU) r.ks.forEach(k => del.add(k)); }
  // apply clip to many paths (indices high->low so splicing keeps earlier indices valid). Returns how many paths changed.
  function clipAll(list, inside, stepU, minU) { let n = 0; [...list].sort((a, b) => b - a).forEach(pi => { const r = clip(S.paths[pi], inside, stepU, minU); if (r) { replacePath(pi, r); n++; } }); return n; }
  const nearBox = (pi, x0, y0, x1, y1) => { const bb = BZ.bbox([S.paths[pi]]); return bb && !(bb.x1 < x0 || bb.x0 > x1 || bb.y1 < y0 || bb.y0 > y1); };
  // ---------- state ----------
  const SL = { list: [], merged: null, mode: null, a: null, b: null, plan: null }, PP = { pi: -1, lastT: 0, lastU: null }, DR = { pts: null }, BR = { a: null, b: null, plan: null, mode: (localStorage.getItem('wp-brMode') === 'add' ? 'add' : 'del'), list: null, merged: null }, RB = { px: 22, mode: 'all', at: null }, TH = { pi: -1, list: null }, CO = { region: null, sel: -1, mode: 'draw', lasso: null, gap: 0, snap: (function () { try { return localStorage.getItem('wp-coSnap') !== '0'; } catch (e) { return true; } })() }, CL = { mode: 'area', regs: [], pts: [], grow: false, box: null };
  const teMmLoad = () => { try { const v = +localStorage.getItem('wp-edgeMm'); if (v >= 0.1 && v <= 50) return Math.round(v * 10) / 10; } catch (e) {} return 2; };
  const TE = { list: null, merged: null, a: null, b: null, way: 'short', side: 1, mm: teMmLoad(), cut: false, preview: null, src: null, closed: false };
  // ================= gestures =================
  function down(e, p, u, base) { const g = Object.assign(base, { t4: tool, kind: 't4' }), tolU = tolT(e);
    if (tool === 'sel') { g.kind = 'tap'; g.tx = view.tx; g.ty = view.ty; return g; } // drag = move the picture, tap = pick
    if (tool === 'p2p') { const ch = PP.pi >= 0 && S.paths[PP.pi] ? PP.pi : -1;
      const n = hitPtAny(u, tolU * 0.7); if (n && !(ch >= 0 && n.pi === ch && n.j === 0 && S.paths[ch].n.length > 2)) { g.node = n; g.snap = snap(); }
      else { const h = hitAny(u, tolU * 0.6); if (h) { g.seg = h; g.snap = snap(); } }
      focus = { pi: (g.node || g.seg || {}).pi, u }; draw(); return g; }
    if (tool === 'draw') { DR.pts = [u.slice()]; inkStart(p); return g; }
    if (tool === 'rub') { g.snap = snap(); g.last = u; RB.at = u; g.erased = 0; S.paths.forEach((q, i) => { q._rk = BZ.length(q) + i * 1e-6; }); draw(); return g; }
    if (tool === 'cutout') { if (CO.region && CO.region.user && CO.region.pts) { const j = hitDraft(u, tolU); if (j >= 0) { g.conode = j; return g; } }
      if (CO.mode === 'lasso' || CO.mode === 'draw') { CO.lasso = [snapCutPt(u)]; CO.region = null; CO.sel = -1; draw(); return g; }
      const n = hitPt(u, tolU * 0.7, isCut); if (n) { g.node = n; g.snap = snap(); CO.sel = n.pi; } else { const h = hitLine(u, tolU * 0.5, isCut); if (h) { g.seg = h; g.snap = snap(); } }
      focus = { pi: (g.node || g.seg || {}).pi, u }; draw(); return g; }
    if (tool === 'clear') { if (CL.mode === 'poly') { let bi = -1, bd = tolU; CL.pts.forEach((q, i) => { const d = d2(q, u); if (d < bd) { bd = d; bi = i; } }); if (bi >= 0) g.cnode = bi; } return g; }
    return g; }
  function move(g, p, u, e) {
    if (g.t4 === 'sel') { view.tx = g.tx + p[0] - g.p0[0]; view.ty = g.ty + p[1] - g.p0[1]; draw(); return; }
    if (g.t4 === 'draw') { if (DR.pts && d2(u, DR.pts[DR.pts.length - 1]) * view.s > 0.6) { DR.pts.push(u.slice()); inkTo(p); } return; }
    if (g.t4 === 'rub') { applyRub(g.last, u, g); g.last = u; RB.at = u; draw(); return; }
    if (g.t4 === 'cutout' && g.conode != null && CO.region && CO.region.pts) { CO.region.pts[g.conode] = u.slice(); coRefresh(); draw(); return; }
    if (g.t4 === 'cutout' && CO.lasso) { if (d2(u, CO.lasso[CO.lasso.length - 1]) * view.s > 0.8) CO.lasso.push(snapCutPt(u)); draw(); return; }
    if (g.t4 === 'clear') { if (g.cnode != null) CL.pts[g.cnode] = u.slice(); else CL.box = [g.u0, u.slice()]; draw(); return; }
    if (g.node) { if (!g.moving) { const nd = S.paths[g.node.pi].n[g.node.j]; g.moving = [nd, ...linked(g.node.pi, g.node.j)]; g.lastU = g.u0; }
      const dx = u[0] - g.lastU[0], dy = u[1] - g.lastU[1]; g.lastU = u; for (const m of g.moving) BZ.moveNode(m, dx, dy); draw(); return; }
    if (g.seg) { S.paths = BZ.clone(g.snap); BZ.bend(S.paths[g.seg.pi], g.seg.k, g.seg.t, u[0] - g.u0[0], u[1] - g.u0[1]); draw(); return; } }
  function up(g, e) { const u = g.u0, tolU = tolT(e);
    if (g.t4 === 'rub') { RB.at = null; S.paths.forEach(q => { delete q._rk; }); if (g.snap) g.snap.forEach(q => { delete q._rk; }); if (g.moved) { if (g.erased) { undoSt.push(g.snap); redoSt = []; if (window.WP && WP.noteCutGone) WP.noteCutGone(); changed(); toast('Rubbed out - Undo brings it back'); } else draw(); return; }
      const h = hitAny(u, tolU); if (h) { deleteStretch(h); toast('Line removed up to the junctions - Undo brings it back'); } else { draw(); toast('Rub over lines to erase, or tap right on a line'); } return; }
    if (g.t4 === 'sel') { if (!g.moved) { if (SL.mode === 'brk') selTapBreak(u, e); else selPick(u, e); } return; }
    if ((g.node || g.seg) && g.moved) { const ep = S.paths[(g.node || g.seg).pi]; if (ep && (ep.tabs || ep.tabBase)) { delete ep.tabs; delete ep.tabBase; delete ep._tsig; toast('Tabs were taken off this outline so your change can stay - add them again in Tabs if you want them.', 4000); } undoSt.push(g.snap); redoSt = []; changed(); if (g.t4 === 'cutout') panel(); return; }
    if (g.t4 === 'p2p') { if (!g.moved) p2pTap(u, e); return; }
    if (g.t4 === 'draw') { finishDraw(e); return; }
    if (g.t4 === 'brk') { if (!g.moved) brkTap(u, e); return; }
    if (g.t4 === 'thick') { if (!g.moved) { const h = hitAny(u, tolU); TH.list = null; TH.pi = h ? h.pi : -1; focus = null; if (!h) toast('Tap right on a line'); else if (S.paths[h.pi] && S.paths[h.pi].cut) toast('Cut lines use the cut settings (power, speed, passes) - not etch thickness. Tap Make etch if you want a thick engraved line.'); panel(); draw(); } return; }
    if (g.t4 === 'cutout') { if (g.conode != null) { panel(); draw(); return; }
      if ((CO.mode === 'lasso' || CO.mode === 'draw') && CO.lasso) { const pts = CO.lasso; CO.lasso = null; finishUserCut(pts, CO.mode); return; }
      if (g.moved) return; const onLine = (g.seg || g.node) && (g.node || hitLine(u, 9 / view.s, isCut)); if (onLine) { CO.sel = (g.seg || g.node).pi; CO.region = null; panel(); draw(); return; } CO.sel = -1; findRegion(u); return; }
    if (g.t4 === 'edge') { if (!g.moved) teTap(u, e); return; }
    if (g.t4 === 'clear') { if (g.cnode != null) { panel(); draw(); return; } if (g.moved) { clBox(); return; } if (CL.mode === 'poly') { CL.pts.push(u.slice()); panel(); draw(); } else clTap(u); return; } }
  // live ink: drawn straight onto a see-through layer above the picture (no full redraw while drawing); cleared on pen-up
  const INK = { c: null, q: [], last: null, raf: 0 };
  function inkCtx() { if (!INK.c) INK.c = document.getElementById('ink'); return INK.c && INK.c.getContext('2d'); }
  function inkFlush() { INK.raf = 0; const k = inkCtx(); if (!k || !INK.q.length) return; const d = window.devicePixelRatio || 1; k.setTransform(d, 0, 0, d, 0, 0); k.strokeStyle = inkCut ? '#e03131' : '#1971c2'; k.lineWidth = 2.6; k.lineCap = k.lineJoin = 'round';
    k.beginPath(); for (const [a, b] of INK.q) { k.moveTo(a[0], a[1]); k.lineTo(b[0], b[1]); } k.stroke(); INK.q = []; }
  function inkStart(p) { inkClear(); const k = inkCtx(); if (!k) return; const d = window.devicePixelRatio || 1; k.setTransform(d, 0, 0, d, 0, 0); k.fillStyle = inkCut ? '#e03131' : '#1971c2'; k.beginPath(); k.arc(p[0], p[1], 1.8, 0, 7); k.fill(); INK.last = p.slice(); }
  function inkTo(p) { if (!INK.last) { INK.last = p.slice(); return; } INK.q.push([INK.last, p.slice()]); INK.last = p.slice(); if (!INK.raf) INK.raf = requestAnimationFrame(inkFlush); }
  function inkClear() { const k = inkCtx(); if (INK.raf) cancelAnimationFrame(INK.raf); INK.raf = 0; INK.q = []; INK.last = null; if (k) { k.setTransform(1, 0, 0, 1, 0, 0); k.clearRect(0, 0, INK.c.width, INK.c.height); } }
  function cancelG(g) { if (g.t4 === 'draw') { DR.pts = null; inkClear(); } if (g.t4 === 'rub') RB.at = null; }
  // ================= Select (whole line) =================
  // a "whole line" = the tapped line plus any line that carries straight/smoothly on from its ends (a plank split at a junction)
  const endDir = (p, end) => { const n = p.n, m = n.length; if (end === 0) { const a = n[0], q = a.o || (n[1] ? [n[1].x, n[1].y] : [a.x + 1, a.y]); return norm([q[0] - a.x, q[1] - a.y]); } const z = n[m - 1], q = z.i || [n[m - 2].x, n[m - 2].y]; return norm([q[0] - z.x, q[1] - z.y]); };
  const norm = v => { const l = Math.hypot(v[0], v[1]) || 1; return [v[0] / l, v[1] / l]; };
  function chainOf(pi) { const p0 = S.paths[pi]; if (!p0) return { list: [], merged: null }; if (p0.z) return { list: [pi], merged: BZ.clone([p0])[0] };
    const used = new Set([pi]); let merged = { n: BZ.clone(p0.n), z: false, cut: p0.cut };
    for (let side = 0; side < 2; side++) { for (let guard = 0; guard < 60; guard++) { const L = merged.n[merged.n.length - 1], into = endDir(merged, 1), out = [-into[0], -into[1]]; let best = null;
        S.paths.forEach((q, qi) => { if (used.has(qi) || q.z || !!q.cut !== !!p0.cut || q.n.length < 2) return; for (const e of [0, 1]) { const nd = e ? q.n[q.n.length - 1] : q.n[0]; if (Math.hypot(nd.x - L.x, nd.y - L.y) > 0.05) continue;
          const d = endDir(q, e), c = d[0] * out[0] + d[1] * out[1]; if (c > 0.94 && (!best || c > best.c)) best = { qi, e, c }; } });
        if (!best) break; used.add(best.qi); merged = BZ.join(merged, 1, S.paths[best.qi], best.e, 0.05)[0]; }
      BZ.reverse(merged); }
    return { list: [...used], merged }; }
  function selPick(u, e) { const tolU = tolT(e), h = hitAny(u, tolU); if (!h) { SL.list = []; SL.merged = null; panel(); draw(); return; }
    const c = chainOf(h.pi); SL.list = c.list; SL.merged = c.merged; SL.mode = null; SL.a = SL.b = SL.plan = null; panel(); draw(); }
  function selTapBreak(u, e) { const m = SL.merged; if (!m) return; const r = BZ.nearest(m, u, 0.2); if (!r || r.d > 60 / view.s) { toast('Tap on the blue line'); return; }
    let pos = { k: r.k, t: r.t, pt: r.pt }; const sn = 14 / view.s; m.n.forEach((nd, j) => { if (Math.hypot(nd.x - r.pt[0], nd.y - r.pt[1]) < sn) { pos = j < m.n.length - 1 || m.z ? { k: j % BZ.nseg(m), t: 0, pt: [nd.x, nd.y] } : { k: BZ.nseg(m) - 1, t: 1, pt: [nd.x, nd.y] }; } });
    if (!SL.a || SL.b) { SL.a = pos; SL.b = null; SL.plan = null; } else { SL.b = pos; SL.plan = Math.hypot(SL.a.pt[0] - pos.pt[0], SL.a.pt[1] - pos.pt[1]) > 1e-6 ? delPlan(m, SL.a, SL.b) : null; if (!SL.plan) { SL.b = null; toast('Tap a different point'); } } panel(); draw(); }
  function selAct(a) { if (!SL.list.length) { toast('Tap a line first'); return; } const list = SL.list.map(i => S.paths[i]);
    if (a === 'del') { pushUndo(); const wasOuter = SL.list.some(i => S.paths[i] && S.paths[i].cut && !S.paths[i].hole); [...SL.list].sort((x, y) => y - x).forEach(i => S.paths.splice(i, 1)); const n = SL.list.length; SL.list = []; SL.merged = null; if (wasOuter && window.WP && WP.noteCutGone) WP.noteCutGone(); changed(); panel(); toast(`Line deleted${n > 1 ? ` (${n} joined pieces)` : ''} - Undo brings it back`); return; }
    if (a === 'brk') { SL.mode = 'brk'; SL.a = SL.b = SL.plan = null; panel(); draw(); return; }
    if (a === 'thick') { const keep = SL.list.slice(); setTool('thick'); TH.pi = keep[0]; TH.list = keep; panel(); draw(); return; }
    if (a === 'cut' || a === 'etch') { applySelKind(a === 'etch' ? false : null); } }
  function applySelKind(forceCut) { if (!SL.list.length) { toast('Tap a line first'); return; }
    const sh = shapeOf(SL.list[0]); const idxs = sh.list.length ? sh.list : SL.list.slice(); const list = idxs.map(i => S.paths[i]).filter(Boolean);
    const toCut = forceCut == null ? !list.every(p => p.cut) : !!forceCut;
    if (!toCut) { const wasOuter = list.some(p => p.cut && !p.hole && p.uc !== 1); pushUndo();
      for (const p of list) { delete p.cut; delete p.uc; delete p.tabs; delete p.tabBase; delete p._tsig; if (p.slot) delete p.slot; }
      if (wasOuter && window.WP && WP.noteCutGone) WP.noteCutGone(); SL.pendingCut = null; changed(); const c = chainOf(SL.list[0] != null && S.paths[SL.list[0]] ? SL.list[0] : idxs[0]); SL.list = c.list; SL.merged = c.merged; panel(); toast('Now an etch line again', 2800); return; }
    let p = sh.merged ? BZ.clone([sh.merged])[0] : (list.length === 1 ? BZ.clone([list[0]])[0] : null);
    if (!p) { toast('Could not join those lines into one shape'); return; }
    const gap = endGapMm(p);
    if (gap > CLOSE_AUTO_MM) { SL.pendingCut = sh; SL.gap = gap; panel(); toast(gap <= CLOSE_ASK_MM ? `This cut has a gap of ${gap.toFixed(1)} mm. Tap ✓ Close the gap to join it.` : `This cut has a gap of ${gap.toFixed(1)} mm. Close it with Point to point or Break first.`, 5000); return; }
    if (gap > 0.02) closePath(p);
    const newPi = commitWholeCut(p, idxs, idxs.length === 1 ? idxs[0] : -1); if (sh.splice) spliceEnclosure(sh.splice); SL.pendingCut = null; SL.gap = 0;
    SL.list = [newPi]; SL.merged = BZ.clone([S.paths[newPi]])[0]; changed(); panel(); toast('The whole connected shape is now one cut line (red). Undo takes it back.', 3500); }
  function closeSelGap() { const sh = SL.pendingCut; if (!sh || !sh.merged) { toast('Pick a line first, then tap CUT'); return; }
    closePath(sh.merged); const idxs = sh.list; const newPi = commitWholeCut(sh.merged, idxs, idxs.length === 1 ? idxs[0] : -1); if (sh.splice) spliceEnclosure(sh.splice);
    SL.pendingCut = null; SL.gap = 0; SL.list = [newPi]; SL.merged = BZ.clone([S.paths[newPi]])[0]; changed(); panel(); toast('Gap closed. The whole shape is now one cut line (red).', 3500); }
  function selConfirm() { const pl = SL.plan; if (!pl) return; pushUndo(); const first = S.paths[SL.list[0]], props = {}; for (const k of ['cut', 'w', 'dbl']) if (first[k] != null) props[k] = first[k];
    [...SL.list].sort((x, y) => y - x).forEach(i => S.paths.splice(i, 1)); for (const q of pl.keep) S.paths.push(Object.assign(q, props, { n: q.n })); 
    SL.list = []; SL.merged = null; SL.mode = null; SL.a = SL.b = SL.plan = null; changed(); panel(); toast('Break made - the laser stays off between the two points'); }
  // ================= Point to point =================
  function p2pTap(u, e) { const tolU = tolT(e), now = Date.now(); let ch = PP.pi >= 0 && S.paths[PP.pi] && PP.live ? PP.pi : -1;
    if (ch >= 0 && now - PP.lastT < 380 && PP.lastU && d2(PP.lastU, u) * view.s < 28) { p2pDone(); return; }
    PP.lastT = now; PP.lastU = u;
    if (ch >= 0) { const p = S.paths[ch], f = p.n[0]; if (p.n.length > 2 && d2([f.x, f.y], u) < tolU * 0.8) { pushUndo(); S.paths[ch].z = true; PP.live = false; PP.pi = -1; changed(); toast('Shape closed'); panel(); return; }
      const s = snapTo(u, tolU, ch); pushUndo(); attach(s); S.paths[ch].n.push(BZ.node(s.pt[0], s.pt[1])); changed(); panel(); return; }
    const s = snapTo(u, tolU); pushUndo(); attach(s); S.paths.push(markInk({ n: [BZ.node(s.pt[0], s.pt[1])], z: false })); PP.pi = S.paths.length - 1; PP.live = true; changed(); panel(); }
  function p2pDone() { const ch = PP.pi; PP.live = false; PP.pi = -1; PP.lastT = 0; if (ch >= 0 && S.paths[ch] && S.paths[ch].n.length < 2) { S.paths.splice(ch, 1); } changed(); panel(); }
  // ================= Draw =================
  function finishDraw(e) { const pts = DR.pts; DR.pts = null; inkClear(); if (!pts || pts.length < 2) { draw(); return; } let L = 0; for (let i = 1; i < pts.length; i++) L += d2(pts[i - 1], pts[i]);
    if (L * view.s < 4) { draw(); toast('Drag your finger or pen to draw'); return; } const tolU = tolT(e), closed = pts.length > 4 && d2(pts[0], pts[pts.length - 1]) < tolU && L * view.s > 60;
    const px = 1 / view.s, p = BZ.fromPolyline(pts, { closed, tol: 1.2 * px, lineTol: 1.4 * px, arm: 6 * px, corner: 45 }); if (!p || p.n.length < 2) { draw(); return; }
    pushUndo(); if (!closed) { for (const end of [0, p.n.length - 1]) { const nd = p.n[end], s = snapTo([nd.x, nd.y], tolU); if (s.node || s.line) { BZ.moveNode(nd, s.pt[0] - nd.x, s.pt[1] - nd.y); attach(s); } } }
    markInk(p); S.paths.push(p); glow(p); changed(); toast(closed ? (inkCut ? 'Closed cut shape drawn (red)' : 'Closed shape drawn') : (inkCut ? 'Cut line drawn (red)' : 'Line drawn')); }
  // ================= Break =================
  function brkPick(u, tolU) { const n = hitPtAny(u, tolU * 0.7); if (n) { const p = S.paths[n.pi]; if (!p.z && (n.j === 0 || n.j === p.n.length - 1)) return { pt: n.pt, pi: n.pi, end: true, k: n.j === 0 ? 0 : BZ.nseg(p) - 1, t: n.j === 0 ? 0 : 1 };
      const k = p.z || n.j < p.n.length - 1 ? n.j : n.j - 1, t = k === n.j ? 0 : 1; return { pt: n.pt, pi: n.pi, k, t }; }
    const h = hitAny(u, tolU * 0.8); if (h) return { pt: h.pt, pi: h.pi, k: h.k, t: h.t }; return { pt: u.slice(), free: true }; }
  // insert nodes for two positions on one path, return {q, j1, j2} with j1 < j2 (node indices)
  function twoNodes(p, a, b) { const q = BZ.clone(p); let A = { k: a.k, t: a.t }, B = { k: b.k, t: b.t }; if (A.k > B.k || (A.k === B.k && A.t > B.t)) [A, B] = [B, A];
    const nodeAt = (pos) => pos.t <= 1e-6 ? pos.k : pos.t >= 1 - 1e-6 ? (pos.k + 1) % q.n.length : -1;
    let j2 = nodeAt(B), j1; if (j2 < 0) j2 = BZ.insertNode(q, B.k, B.t);
    if (A.k === B.k && nodeAt(B) < 0 && A.t > 1e-6) { j1 = BZ.insertNode(q, A.k, A.t / B.t); j2 += 1; } else { j1 = nodeAt(A); if (j1 < 0) { j1 = BZ.insertNode(q, A.k, A.t); j2 += 1; } }
    if (!q.z && j2 === 0 && j1 > 0) j2 = q.n.length - 1; return { q, j1, j2 }; }
  function brkPlan() { const a = BR.a, b = BR.b; if (!a || !b) return null;
    if (!a.free && !b.free && a.pi === b.pi && !(a.end && b.end) && d2(a.pt, b.pt) > 1e-6) return Object.assign(delPlan(S.paths[a.pi], a, b), { pi: a.pi });
    return { kind: 'add', a, b }; }
  // remove the stretch of p between positions a and b (the shorter way round on a closed line)
  function delPlan(p, a, b) { const { q, j1, j2 } = twoNodes(p, a, b), m = BZ.nseg(q);
    const fwd = new Set(); for (let k = j1; k !== j2; k = (k + 1) % q.n.length) fwd.add(k);
    let del = fwd; if (q.z) { const back = new Set(); for (let k = 0; k < m; k++) if (!fwd.has(k)) back.add(k); const len = s => [...s].reduce((acc, k) => acc + BZ.length({ n: [q.n[k], q.n[(k + 1) % q.n.length]], z: false }), 0); if (len(back) < len(fwd)) del = back; }
    const removed = keepSegs(q, new Set([...Array(m).keys()].filter(k => !del.has(k)))); return { kind: 'del', keep: keepSegs(q, del), removed }; }
  // v5.1: Remove mode follows the whole joined line (like Select › Break), so two taps on one line always remove the bit between
  function brkPos(m, u) { const r = BZ.nearest(m, u, 0.2); if (!r) return null; let pos = { k: r.k, t: r.t, pt: r.pt, d: r.d }; const sn = 14 / view.s;
    m.n.forEach((nd, j) => { if (Math.hypot(nd.x - r.pt[0], nd.y - r.pt[1]) < sn) pos = Object.assign(j < m.n.length - 1 || m.z ? { k: j % BZ.nseg(m), t: 0, pt: [nd.x, nd.y] } : { k: BZ.nseg(m) - 1, t: 1, pt: [nd.x, nd.y] }, { d: r.d }); }); return pos; }
  function brkClear() { BR.a = BR.b = BR.plan = null; BR.list = BR.merged = null; }
  function brkTap(u, e) { const tolU = tolT(e);
    if (BR.mode === 'add') { const pk = brkPick(u, tolU); if (!BR.a || BR.b) { BR.a = pk; BR.b = null; BR.plan = null; } else { BR.b = pk; BR.plan = d2(BR.a.pt, pk.pt) > 1e-6 ? { kind: 'add', a: BR.a, b: pk } : null; if (!BR.plan) { BR.b = null; toast('Tap a different point'); } } panel(); draw(); return; }
    if (!BR.a || BR.b) { brkClear(); BR.u1 = u; BR.tol1 = tolU; const h = hitAny(u, tolU);
      if (!h) { BR.a = brkPick(u, tolU); BR.list = null; panel(); draw(); return; } // empty space: the two taps will add a line
      const c = chainOf(h.pi); BR.list = c.list; BR.merged = c.merged; BR.a = brkPos(c.merged, u); panel(); draw(); return; }
    // 1st tap off any line, or the 2nd tap not on the same line: join the two taps with a new line (as before)
    const addPlan = () => { const A = brkPick(BR.u1, BR.tol1), B = brkPick(u, tolU); if (d2(A.pt, B.pt) < 1e-6) { toast('Tap a different point'); return; }
      BR.list = BR.merged = null; BR.a = A; BR.b = B; BR.plan = { kind: 'add', a: A, b: B, auto: true }; panel(); draw(); };
    if (!BR.list) { addPlan(); return; }
    // pick the line BOTH taps are on (the 1st tap may have been on a joint where several lines meet): best fit to both taps wins
    const t1 = Math.max(tolU, BR.tol1) * 1.5; let best = null; const seen = new Set();
    const tryChain = c => { const key = c.list.slice().sort((x, y) => x - y).join(','); if (seen.has(key)) return; seen.add(key); const A = brkPos(c.merged, BR.u1), B = brkPos(c.merged, u);
      const own = c.list.includes(BR.list[0]), tA = own ? t1 : Math.min(t1, (BR.a ? BR.a.d : 0) + 8 / view.s);
      if (!A || !B || A.d > tA || B.d > tolU * 1.5 || d2(A.pt, B.pt) < 1e-6) return; const sc = A.d + B.d + (own ? 0 : 1e-9); if (!best || sc < best.sc) best = { c, A, B, sc }; };
    tryChain({ list: BR.list, merged: BR.merged });
    S.paths.forEach((p, pi) => { if (!isEdit(p) || p.n.length < 2 || BR.list.includes(pi)) return; const r1 = BZ.nearest(p, BR.u1, 0.3), r2 = BZ.nearest(p, u, 0.3); if (r1 && r2 && r1.d <= Math.min(t1, (BR.a ? BR.a.d : 0) + 8 / view.s) && r2.d <= tolU * 1.5) tryChain(chainOf(pi)); });
    if (!best) { const own = brkPos(BR.merged, u); if (own && own.d <= tolU * 1.5) { toast('Tap a different point'); return; } addPlan(); return; }
    BR.list = best.c.list; BR.merged = best.c.merged; BR.a = best.A; const pos = best.B;
    if (d2(BR.a.pt, pos.pt) < 1e-6) { toast('Tap a different point'); return; }
    BR.b = pos; BR.plan = delPlan(BR.merged, BR.a, BR.b); panel(); draw(); }
  function brkConfirm() { const pl = BR.plan; if (!pl) return; pushUndo();
    if (pl.kind === 'del') { const first = S.paths[BR.list[0]], props = {}; for (const k of ['cut', 'w', 'dbl']) if (first && first[k] != null) props[k] = first[k];
      const wasTab = first && (first.tabs || first.tabBase), wasOuter = first && first.cut && !first.hole;
      [...BR.list].sort((x, y) => y - x).forEach(i => S.paths.splice(i, 1)); for (const q of pl.keep) S.paths.push(Object.assign(q, props, { n: q.n }));
      toast(wasTab ? 'Section removed, and tabs were taken off this outline so the change can stay. Undo puts it back.' : 'Section removed - the laser stays off across the gap. Undo puts it back.');
      if (wasOuter && window.WP && WP.noteCutGone) WP.noteCutGone(); }
    else { const pts = [pl.a, pl.b]; // insert join points into lines (higher index first is not needed: insert does not reindex paths)
      for (const s of pts) if (!s.free && !s.end && s.t > 1e-6 && s.t < 1 - 1e-6) { const p = S.paths[s.pi]; if (p) { if (p.tabs || p.tabBase) { delete p.tabs; delete p.tabBase; delete p._tsig; } BZ.insertNode(p, s.k, s.t); } }
      const nl = BZ.fromPoints([pl.a.pt, pl.b.pt], false); S.paths.push(nl); glow(nl); toast('Line added'); }
    brkClear(); changed(); panel(); }
  // ================= Eraser =================
  function applyRub(a, b, g) { const r = RB.px / view.s, x0 = Math.min(a[0], b[0]) - r, x1 = Math.max(a[0], b[0]) + r, y0 = Math.min(a[1], b[1]) - r, y1 = Math.max(a[1], b[1]) + r;
    const inBrush = q => BZ.segD(q, a, b)[0] <= r, step = Math.max(0.3, r / 5); let cand = S.paths.map((p, i) => i).filter(pi => !S.paths[pi].hole && nearBox(pi, x0, y0, x1, y1));
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
  function applyThick(all) { const v = thickVals(); const raw = all ? S.paths.filter(isEdit) : TH.list && TH.list.length ? TH.list.map(i => S.paths[i]).filter(Boolean) : (TH.pi >= 0 && S.paths[TH.pi] ? [S.paths[TH.pi]] : []);
    const list = raw.filter(isEtch); if (raw.some(p => p.cut) && !list.length) { toast('Cut lines use the cut settings, not etch thickness. Tap Make etch first if you want a thick engraved line.'); return; }
    if (!list.length) { toast(all ? 'No lines yet' : 'Tap a line first'); return; } pushUndo(); setThick(list, v.w, v.dbl); changed(); panel();
    if (all) toast(`All ${list.length} lines: ${describe(list[0])}`); }
  function describe(p) { const lw = S.lineMm, o = LZ.widthOffs(p, lw); if (!o) return `normal (one ${lw} mm pass)`; return `${p.w ? `${p.w} mm thick` : 'normal width'}${p.dbl ? `, double line ${p.dbl} mm apart` : ''} = ${o.length} passes`; }
  function paintThick(px) { const k = kmm(), lw = S.lineMm; ctx.strokeStyle = '#151515'; ctx.lineWidth = Math.max(1.2 * px, lw / k); ctx.beginPath();
    S.paths.forEach(p => { if (p.cut) return; const o = LZ.widthOffs(p, lw); if (!o) return; const f = BZ.flatten(p, 0.3 * px); for (const d of o) { const q = LZ.offsetPoly(f, d / k, !!p.z); ctx.moveTo(q[0][0], q[0][1]); for (let i = 1; i < q.length; i++) ctx.lineTo(q[i][0], q[i][1]); } }); ctx.stroke(); }
  const plain = p => !p.cut && !LZ.widthOffs(p, S.lineMm);
  // ================= Cut out =================

  // v5.8 Cut out: the cut is the line the user draws (or a genuine closed flood-fill region). Never join fragments with straight jumps.
  const SNAP_MM = 1.5;
  function snapCutPt(u) { if (!CO.snap) return u.slice(); const tol = SNAP_MM / kmm(); const h = hitAny(u, tol); if (!h || h.d > tol) return u.slice();
    const p = S.paths[h.pi]; if (!p) return u.slice(); const r = BZ.nearest(p, u, 0.3); return (r && r.d <= tol) ? r.pt.slice() : u.slice(); }
  function hitDraft(u, tolU) { const pts = CO.region && CO.region.pts; if (!pts) return -1; let bi = -1, bd = tolU; pts.forEach((q, i) => { const d = d2(q, u); if (d < bd) { bd = d; bi = i; } }); return bi; }
  function strokeLen(pts) { let s = 0; for (let i = 1; i < pts.length; i++) s += d2(pts[i - 1], pts[i]); return s; }
  function rdp(pts, eps) { if (pts.length <= 2) return pts.slice(); const keep = new Uint8Array(pts.length); keep[0] = keep[pts.length - 1] = 1;
    const stack = [[0, pts.length - 1]]; while (stack.length) { const [a, b] = stack.pop(); let mi = -1, md = 0;
      for (let i = a + 1; i < b; i++) { const d = BZ.segD(pts[i], pts[a], pts[b])[0]; if (d > md) { md = d; mi = i; } }
      if (mi >= 0 && md > eps) { keep[mi] = 1; stack.push([a, mi], [mi, b]); } }
    return pts.filter((_, i) => keep[i]); }
  function smoothClosed(pts0) { let pts = []; for (const q of pts0) { if (!pts.length || d2(pts[pts.length - 1], q) > 1e-6) pts.push(q.slice()); }
    if (pts.length >= 2 && d2(pts[0], pts[pts.length - 1]) < 1e-6) pts.pop();
    if (pts.length < 3) return pts;
    // light moving average, then simplify in mm so a phone can drag the dots
    const sm = []; const n = pts.length;
    for (let i = 0; i < n; i++) { const a = pts[(i - 1 + n) % n], b = pts[i], c = pts[(i + 1) % n]; sm.push([(a[0] + b[0] * 2 + c[0]) / 4, (a[1] + b[1] * 2 + c[1]) / 4]); }
    const eps = Math.max(0.25 / kmm(), 0.15 / kmm()); let out = rdp(sm.concat([sm[0]]), eps); if (out.length >= 2 && d2(out[0], out[out.length - 1]) < 1e-6) out.pop();
    if (out.length > 80) { const step = Math.ceil(out.length / 80), thin = []; for (let i = 0; i < out.length; i += step) thin.push(out[i]); if (d2(thin[thin.length - 1], out[out.length - 1]) > eps) thin.push(out[out.length - 1]); out = thin; }
    if (out.length < 3) out = sm; return out; }
  function coRefresh() { const r = CO.region; if (!r || !r.pts || r.pts.length < 2) return; r.loop = r.pts.concat([r.pts[0]]); r.gap = 0; }
  function cancelCutDraft() { CO.region = null; CO.lasso = null; CO.sel = -1; CO.gap = 0; panel(); draw(); }
  function finishUserCut(pts, kind) { if (!pts || pts.length < 3 || strokeLen(pts) * kmm() < 6) { toast('Draw all the way around the area you want, then let go'); draw(); return; }
    const sm = smoothClosed(pts); if (sm.length < 3) { toast('Draw a loop around the area, then let go'); draw(); return; }
    CO.region = { pts: sm, loop: sm.concat([sm[0]]), kind: kind || 'draw', match: -1, sources: [], gap: 0, user: true }; CO.sel = -1; panel(); draw(); }
  function addUserCut(loop, closed) { const pts = loop.slice(); if (closed && pts.length >= 2 && d2(pts[0], pts[pts.length - 1]) > 1e-6) pts.push(pts[0].slice());
    const p = BZ.fromPolyline(pts, { closed: true, tol: 0.45, arm: 4, corner: 32 }); if (!p || p.n.length < 3) return null;
    p.z = true; p.cut = true; p.uc = 1; delete p.w; delete p.dbl; return p; }

  // v5.8 Trace edge helpers
  function teClear() { TE.list = TE.merged = TE.a = TE.b = TE.preview = TE.src = null; TE.closed = false; TE.way = 'short'; }
  function teSaveMm() { try { localStorage.setItem('wp-edgeMm', String(TE.mm)); } catch (e) {} }
  function teSetMm(v) { let n = +v; if (!(n >= 0.1)) n = 0.1; if (n > 50) n = 50; TE.mm = Math.round(n * 10) / 10; teSaveMm(); teRebuild(); panel(); draw(); }
  function tePoly(p) { const pts = BZ.flatten(p, 0.25); if (!pts.length) return null;
    if (p.z && pts.length > 2 && d2(pts[0], pts[pts.length - 1]) > 1e-6) pts.push(pts[0].slice());
    const s = [0]; for (let i = 1; i < pts.length; i++) s.push(s[i - 1] + d2(pts[i - 1], pts[i]));
    return { pts, s, L: s[s.length - 1], z: !!p.z }; }
  function teAtS(poly, sWant) { const { pts, s, L } = poly; let t = sWant; if (poly.z && L > 0) t = ((t % L) + L) % L; else t = Math.max(0, Math.min(L, t));
    for (let i = 1; i < s.length; i++) if (s[i] >= t - 1e-9) { const span = Math.max(1e-12, s[i] - s[i - 1]), u = (t - s[i - 1]) / span;
      return { i: i - 1, u, pt: [pts[i - 1][0] + (pts[i][0] - pts[i - 1][0]) * u, pts[i - 1][1] + (pts[i][1] - pts[i - 1][1]) * u], s: t }; }
    return { i: pts.length - 2, u: 1, pt: pts[pts.length - 1].slice(), s: L }; }
  function teExtract(poly, s0, s1) { const { pts, s, L } = poly, out = []; if (L <= 0) return out;
    const a = teAtS(poly, s0); out.push(a.pt);
    for (let i = a.i + 1; i < pts.length; i++) { if (s[i] >= s1 - 1e-9) break; out.push(pts[i].slice()); }
    const b = teAtS(poly, s1); if (!out.length || d2(out[out.length - 1], b.pt) > 1e-7) out.push(b.pt); return out; }
  function teSlice(poly, s0, s1, way) { if (!poly || poly.L <= 0) return null;
    if (way === 'whole' && poly.z) { const pts = poly.pts.slice(); if (d2(pts[0], pts[pts.length - 1]) > 1e-6) pts.push(pts[0].slice()); return { pts, closed: true }; }
    if (!poly.z) { const a = Math.max(0, Math.min(poly.L, s0)), b = Math.max(0, Math.min(poly.L, s1)); if (Math.abs(b - a) < 1e-6) return null;
      return { pts: a <= b ? teExtract(poly, a, b) : teExtract(poly, b, a).reverse(), closed: false }; }
    const L = poly.L, a = ((s0 % L) + L) % L, b = ((s1 % L) + L) % L, fwd = (b - a + L) % L, back = (a - b + L) % L;
    const useFwd = way === 'long' ? fwd >= back : fwd <= back;
    if (useFwd) return { pts: teExtract(poly, a, a + (fwd || L)), closed: false };
    const rev = teExtract(poly, b, b + (back || L)); return { pts: rev.reverse(), closed: false }; }
  function tePos(merged, u) { const r = BZ.nearest(merged, u, 0.25); if (!r) return null; const poly = tePoly(merged);
    // arc length at the nearest flatten point
    let best = 0, bd = Infinity; if (poly) for (let i = 0; i < poly.pts.length; i++) { const d = d2(poly.pts[i], r.pt); if (d < bd) { bd = d; best = poly.s[i]; } }
    return { pt: r.pt.slice(), d: r.d, s: best, k: r.k, t: r.t }; }
  function teRebuild() { TE.preview = TE.src = null; if (!TE.merged) return;
    const poly = tePoly(TE.merged); if (!poly || poly.L < 1e-6) return;
    const whole = TE.way === 'whole' && poly.z; if (!whole && !TE.b) return;
    const sl = whole ? teSlice(poly, 0, poly.L, 'whole') : teSlice(poly, TE.a.s, TE.b.s, poly.z ? TE.way : 'short');
    if (!sl || sl.pts.length < 2) return; TE.src = sl;
    const offU = (TE.mm / kmm()) * TE.side; if (Math.abs(offU) < 1e-9) { TE.preview = sl.pts.map(q => q.slice()); return; }
    let src = sl.pts.slice(); if (sl.closed && src.length > 2 && d2(src[0], src[src.length - 1]) < 1e-6) src = src.slice(0, -1);
    let off = BZ.offsetPoly(src, offU, { closed: !!sl.closed, join: 'mitre', mitre: 4 });
    off = BZ.cleanOffset(src, off, offU, !!sl.closed); if (off.length < 2) { TE.preview = null; return; }
    if (sl.closed && off.length >= 3 && d2(off[0], off[off.length - 1]) > 1e-6) off = off.concat([off[0].slice()]);
    TE.preview = off; }
  function teTap(u, e) { const tolU = tolT(e);
    if (!TE.a || TE.b) { const h = hitAny(u, tolU); if (!h) { toast('Tap a line to set the start point'); return; }
      const c = chainOf(h.pi); TE.list = c.list; TE.merged = c.merged; TE.a = tePos(c.merged, u); TE.b = null; TE.preview = TE.src = null; TE.closed = !!(c.merged && c.merged.z); TE.way = TE.closed ? 'short' : 'short';
      if (!TE.a) { teClear(); toast('Tap right on a line'); panel(); draw(); return; }
      panel(); draw(); return; }
    const pos = tePos(TE.merged, u); if (!pos || pos.d > tolU * 1.8) { toast('Tap the same line for the finish point'); return; }
    if (d2(TE.a.pt, pos.pt) < 1e-6 && !TE.closed) { toast('Tap a different point on the same line'); return; }
    TE.b = pos; if (TE.closed && TE.way === 'whole') TE.way = 'short'; teRebuild(); panel(); draw(); }
  function teAdd() { if (!TE.preview || TE.preview.length < 2) { toast('Pick a start and a finish first, and check the preview'); return; }
    const closed = !!(TE.src && TE.src.closed); const p = BZ.fromPolyline(TE.preview, { closed, tol: 0.4, arm: 4, corner: 32 });
    if (!p || p.n.length < 2) { toast('Could not make that edge line - try a different distance or section'); return; }
    if (closed) p.z = true; if (TE.cut) { p.cut = true; p.uc = 1; S.cutOn = true; } delete p.w; delete p.dbl;
    pushUndo(); S.paths.push(p); glow(p); teClear(); changed(); panel(); toast('Edge line added. Undo takes it back.', 3000); }

  function lassoFinish(pts) { finishUserCut(pts, 'lasso'); }
  function findRegion(u) { const r = regionAt(u);
    const fail = () => { CO.region = null; CO.sel = -1; CO.mode = 'draw'; toast("Couldn't find a closed shape here - draw round it instead", 4200); panel(); draw(); };
    if (r.err) { fail(); return; }
    const loop = r.loop; if (!loop || loop.length < 4) { fail(); return; }
    // only a genuine closed flood-fill contour - never join leftover bits with straight jumps
    const gap = d2(loop[0], loop[loop.length - 1]) * kmm();
    if (gap > 0.5) { fail(); return; }
    // a leak through open strokes fills everything inside the outer cut - that is not a shape the user tapped
    const loopA = Math.abs(T.area(loop));
    let outerA = 0; S.paths.forEach(p => { if (!p.cut || !p.z || p.hole || p.slot) return; const a = Math.abs(T.area(BZ.flatten(p, 0.5))); if (a > outerA) outerA = a; });
    if (outerA && loopA >= outerA * 0.7 && S.paths.some(p => !p.cut && !p.hole && p.n.length > 1)) { fail(); return; }
    const done = holeAt(r); if (done >= 0) { const hp = S.paths[done], ha = Math.abs(T.area(BZ.flatten(hp, 0.5)));
      if (outerA && ha >= outerA * 0.7) { fail(); return; }
      CO.region = null; CO.sel = done; panel(); draw(); toast('That area is already a cut. Tap Make etch line to undo it.', 3200); return; }
    const pts = loop.slice(); if (pts.length >= 2 && d2(pts[0], pts[pts.length - 1]) < 1e-6) pts.pop();
    CO.region = { pts, loop: pts.concat([pts[0]]), kind: 'tap', match: r.match, sources: r.match >= 0 ? [r.match] : [], gap: 0, user: r.match < 0 }; CO.sel = -1; panel(); draw(); }
  // an existing cut hole that is (almost) this area
  function holeAt(r) { if (r.match >= 0 && isCut(S.paths[r.match])) return r.match; const A = Math.abs(T.area(r.loop)), c = r.loop.reduce((a, q) => [a[0] + q[0] / r.loop.length, a[1] + q[1] / r.loop.length], [0, 0]); let best = -1;
    S.paths.forEach((p, pi) => { if (!isCut(p) || !p.z) return; const f = BZ.flatten(p, 0.5); const a = Math.abs(T.area(f)); if (Math.abs(a - A) / Math.max(a, A) < 0.15 && BZ.inside(f, c)) best = pi; }); return best; }
  // one raster of every line, reused while the lines don't change (so areas picked at different zooms line up)
  let RG = null; const sigOf = () => { let t = S.paths.length + S.lineMm; for (const p of S.paths) for (const n of p.n) t += n.x * 1.3 + n.y * 0.7; return t; };
  function grid() { const sig = sigOf(); if (RG && RG.sig === sig) return RG; const e = S.paths.filter(p => p.n.length > 1); const bb = BZ.bbox(e); if (!bb) return null; const pad = Math.max(bb.w, bb.h) * 0.02 + 1, s = 1400 / Math.max(bb.w + 2 * pad, bb.h + 2 * pad), ox = bb.x0 - pad, oy = bb.y0 - pad;
    const w = Math.ceil((bb.w + 2 * pad) * s) + 2, h = Math.ceil((bb.h + 2 * pad) * s) + 2, c = document.createElement('canvas'); c.width = w; c.height = h; const g = c.getContext('2d');
    g.fillStyle = '#fff'; g.fillRect(0, 0, w, h); g.strokeStyle = '#000'; const sw = Math.max(2.2, S.lineMm / kmm() * s); g.lineWidth = sw; g.lineCap = g.lineJoin = 'round'; g.beginPath();
    for (const p of e) { const f = BZ.flatten(p, 0.4 / s); g.moveTo((f[0][0] - ox) * s, (f[0][1] - oy) * s); for (let i = 1; i < f.length; i++) g.lineTo((f[i][0] - ox) * s, (f[i][1] - oy) * s); } g.stroke();
    const id = g.getImageData(0, 0, w, h).data, ink = new Uint8Array(w * h); for (let i = 0; i < ink.length; i++) ink[i] = id[i * 4] < 128 ? 1 : 0;
    RG = { sig, s, ox, oy, w, h, sw, ink }; return RG; }
  function regionAt(u) { const G = grid(); if (!G) return { err: 'Nothing to pick yet' }; const { s, ox, oy, w, h, sw, ink } = G;
    const sx = Math.round((u[0] - ox) * s), sy = Math.round((u[1] - oy) * s); if (sx < 1 || sy < 1 || sx >= w - 1 || sy >= h - 1) return { err: 'Tap inside an area that is closed in by lines' };
    if (ink[sy * w + sx]) return { err: 'Tap inside the area, not on a line' };
    const m = new Uint8Array(w * h), st = [sy * w + sx]; m[st[0]] = 1; let open = false, cnt = 0;
    while (st.length) { const i = st.pop(); cnt++; const x = i % w, y = (i - x) / w; if (x === 0 || y === 0 || x === w - 1 || y === h - 1) { open = true; break; }
      for (const j of [i - 1, i + 1, i - w, i + w]) if (!m[j] && !ink[j]) { m[j] = 1; st.push(j); } }
    if (open) return { err: 'That area is not closed in - it reaches the outside. Close the gap with Break or Point to point first, or drag a box instead.', long: true };
    const loops = T.outerCut(m, w, h, sw / 2, 0).map(l => l.map(([x, y]) => [x / s + ox, y / s + oy])); if (!loops.length) return { err: 'Could not find that area' };
    loops.sort((a, b) => Math.abs(T.area(b)) - Math.abs(T.area(a))); const loop = loops[0], A = Math.abs(T.area(loop));
    // an existing closed line that already is this area's border (e.g. a window) is used as it is
    let match = -1, best = Infinity; S.paths.forEach((p, pi) => { if (!p.z || p.n.length < 2) return; const f = BZ.flatten(p, 0.5 / s); if (!BZ.inside(f, u)) return; const a = Math.abs(T.area(f)); if (Math.abs(a - A) / a < 0.12 && a < best) { best = a; match = pi; } });
    return { loop, match, m, sig: G.sig, g: Math.max(S.lineMm / kmm() * 0.75, 2 / s) }; }

  // v5.7: turn a WHOLE shape or area into one closed cut. Join pieces within 0.5 mm, prefer the outer edge of a thick outline, preview in red, offer to close a gap.
  const JOIN_MM = 0.5, CLOSE_AUTO_MM = 0.5, CLOSE_ASK_MM = 8;
  const joinU = () => JOIN_MM / kmm();
  function endGapMm(p) { if (!p || !p.n || p.n.length < 2 || p.z) return 0; const a = p.n[0], b = p.n[p.n.length - 1]; return Math.hypot(a.x - b.x, a.y - b.y) * kmm(); }
  function closePath(p) { if (!p || p.z || p.n.length < 3) return p; const a = p.n[0], b = p.n[p.n.length - 1]; const d = Math.hypot(a.x - b.x, a.y - b.y);
    if (d < 1e-6) { p.z = true; if (p.n.length > 2) p.n.pop(); return p; } p.n.push(BZ.node(a.x, a.y)); p.z = true; return p; }
  function distPoly(poly, q) { let dm = Infinity; for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) { const d = BZ.segD(q, poly[j], poly[i])[0]; if (d < dm) dm = d; } return dm; }
  function endsOf(p) { const a = p.n[0], b = p.n[p.n.length - 1]; return p.z ? [[a.x, a.y]] : [[a.x, a.y], [b.x, b.y]]; }
  function endsNear(p, q, tol) { for (const a of endsOf(p)) for (const b of endsOf(q)) if (Math.hypot(a[0] - b[0], a[1] - b[1]) <= tol) return true; return false; }
  function joinList(idxs, tol) { if (!idxs.length) return null; const left = idxs.slice(); let cur = { n: BZ.clone(S.paths[left.shift()].n), z: false };
    while (left.length) { const t0 = cur.n[0], t1 = cur.n[cur.n.length - 1]; let best = -1, bi = -1, bd = Infinity, flipCur = false, flipQ = false;
      left.forEach((qi, i) => { const q = S.paths[qi], a = q.n[0], b = q.n[q.n.length - 1];
        const opts = [[Math.hypot(t1.x - a.x, t1.y - a.y), false, false], [Math.hypot(t1.x - b.x, t1.y - b.y), false, true], [Math.hypot(t0.x - a.x, t0.y - a.y), true, true], [Math.hypot(t0.x - b.x, t0.y - b.y), true, false]];
        for (const [d, fc, fq] of opts) if (d <= tol && d < bd) { bd = d; best = i; bi = qi; flipCur = fc; flipQ = fq; } });
      if (best < 0) break; let qn = BZ.clone(S.paths[bi].n); left.splice(best, 1); if (flipCur) cur.n.reverse(); if (flipQ) qn.reverse();
      const L = cur.n[cur.n.length - 1], F = qn[0]; if (Math.hypot(L.x - F.x, L.y - F.y) <= tol) qn = qn.slice(1); cur.n = cur.n.concat(qn); }
    if (endGapMm(cur) <= CLOSE_AUTO_MM) closePath(cur); return cur; }
  function companionOf(pi) { const p = S.paths[pi]; if (!p || !p.z || typeof T === 'undefined' || !T.area) return null;
    const k = kmm(), loop = BZ.flatten(p, 0.5), A0 = Math.abs(T.area(loop)), minOff = 0.12 / k, maxOff = Math.max(3.2 / k, (S.lineMm * 4) / k);
    let best = null, bestA = Infinity; const mid = loop.reduce((s, q) => [s[0] + q[0] / loop.length, s[1] + q[1] / loop.length], [0, 0]);
    S.paths.forEach((q, qi) => { if (qi === pi || !q.z || q.n.length < 3 || q.hole) return; const f = BZ.flatten(q, 0.5);
      const inQ = BZ.inside(f, mid), inP = BZ.inside(loop, f[0]); if (!inQ && !inP) return;
      const A = Math.abs(T.area(f)); if (Math.abs(A - A0) / Math.max(A, A0) < 0.03) return;
      const inner = A > A0 ? loop : f, outer = A > A0 ? f : loop; let sum = 0, n = 0, mx = 0, step = Math.max(1, Math.floor(inner.length / 20));
      for (let i = 0; i < inner.length; i += step) { const d = distPoly(outer, inner[i]); sum += d; n++; if (d > mx) mx = d; }
      const avg = sum / (n || 1); if (avg < minOff || mx > maxOff) return; if (A > A0 && A < bestA) { bestA = A; best = qi; } });
    return best; }
  function runsOf(flags) { const n = flags.length, runs = []; if (!n) return runs;
    let i = 0; while (i < n && flags[i]) i++; const start = i % n; if (i === n) { const all = []; for (let j = 0; j < n; j++) all.push(j); return [all]; }
    i = start; let guard = 0; while (guard++ <= n) { while (i < start + n && !flags[i % n]) i++; if (i >= start + n) break; const run = [];
      while (i < start + n && flags[i % n]) { run.push(i % n); i++; } if (run.length) runs.push(run); }
    return runs; }
  // The outer edge of a thick outline is sometimes a detour on a larger neighbouring path, not a path of its own.
  // Pull that wrap off and use it as the cut, so star tips and the stroke are not left behind.
  function enclosureOf(pi) { const p0 = S.paths[pi]; if (!p0 || !p0.z) return null;
    const k = kmm(), face = BZ.flatten(p0, 0.4), A0 = Math.abs(T.area(face)), mid = face.reduce((s, q) => [s[0] + q[0] / face.length, s[1] + q[1] / face.length], [0, 0]);
    const maxOff = Math.max(3.2 / k, (S.lineMm * 4) / k); let best = null, bestA = Infinity;
    S.paths.forEach((q, qi) => { if (qi === pi || !q.n || q.n.length < 4 || q.hole) return; const f = BZ.flatten(q, 0.4); if (f.length < 8) return;
      const flags = f.map(pt => distPoly(face, pt) <= maxOff);
      for (const run of runsOf(flags)) { if (run.length < 8) continue; if (run.length > f.length * 0.85 && Math.abs(T.area(f)) > A0 * 8) continue;
        const pts = run.map(i => f[i]), gap = Math.hypot(pts[0][0] - pts[pts.length - 1][0], pts[0][1] - pts[pts.length - 1][1]) * k;
        if (gap > CLOSE_ASK_MM) continue; const loop = pts.concat([pts[0]]); if (!BZ.inside(loop, mid)) continue;
        const A = Math.abs(T.area(loop)); if (A <= A0 * 1.08 || A > A0 * 14) continue; if (A < bestA) { bestA = A; best = { qi, pts, gap, run, A }; } } });
    if (!best) return null; const merged = BZ.fromPolyline(best.gap <= CLOSE_AUTO_MM ? best.pts.concat([best.pts[0]]) : best.pts, { closed: best.gap <= CLOSE_AUTO_MM, tol: 0.4, arm: 4, corner: 30 });
    if (merged && best.gap <= CLOSE_AUTO_MM) { merged.z = true; } return { qi: best.qi, merged: merged || { n: best.pts.map(a => BZ.node(a[0], a[1])), z: best.gap <= CLOSE_AUTO_MM }, gap: best.gap, run: best.run, pts: best.pts }; }
  function spliceEnclosure(enc) { if (!enc || enc.qi == null || !S.paths[enc.qi]) return; const q = S.paths[enc.qi], f = BZ.flatten(q, 0.4), drop = new Set(enc.run || []);
    const keep = []; for (let i = 0; i < f.length; i++) if (!drop.has(i)) keep.push(f[i]); if (keep.length < 3) return;
    const closed = !!q.z; const rebuilt = BZ.fromPolyline(closed ? keep.concat([keep[0]]) : keep, { closed, tol: 0.4, arm: 4, corner: 30 });
    if (rebuilt) { const props = {}; for (const k of ['cut', 'uc', 'w', 'dbl', 'hole', 'tabs', 'tabBase', 'slot']) if (q[k] != null) props[k] = q[k]; Object.assign(q, rebuilt, props, { n: rebuilt.n, z: closed }); delete q._tsig; } }
  function shapeOf(pi) { const p0 = S.paths[pi]; if (!p0) return { list: [], merged: null, gap: 0 };
    if (p0.z) { const comp = companionOf(pi); if (comp != null) { const A0 = Math.abs(T.area(BZ.flatten(p0, 0.5))), A1 = Math.abs(T.area(BZ.flatten(S.paths[comp], 0.5))); const use = A1 > A0 ? comp : pi; return { list: [use], merged: BZ.clone([S.paths[use]])[0], gap: 0, outer: use !== pi }; }
      const enc = enclosureOf(pi); if (enc && enc.merged) return { list: [pi], merged: enc.merged, gap: enc.gap || 0, outer: true, splice: enc };
      return { list: [pi], merged: BZ.clone([p0])[0], gap: 0 }; }
    const tol = joinU(), used = new Set([pi]); let grow = true;
    while (grow) { grow = false; S.paths.forEach((q, qi) => { if (used.has(qi) || q.hole || q.n.length < 2 || q.z) return;
      for (const ui of used) if (endsNear(S.paths[ui], q, tol)) { used.add(qi); grow = true; return; } }); }
    const idxs = [...used], merged = joinList(idxs, tol), gap = merged ? endGapMm(merged) : 0;
    if (merged && gap && gap <= CLOSE_AUTO_MM) closePath(merged);
    return { list: idxs, merged, gap: merged ? endGapMm(merged) : gap }; }
  function shapeCutAt(u) { const r = regionAt(u); if (r.err) return r; const k = kmm(), tol = Math.max(joinU(), 0.8 / k); let usePi = r.match, loop = r.loop, sources = [], merged = null;
    if (usePi >= 0 && S.paths[usePi] && S.paths[usePi].z) { const comp = companionOf(usePi);
      if (comp != null) { const A0 = Math.abs(T.area(BZ.flatten(S.paths[usePi], 0.5))), A1 = Math.abs(T.area(BZ.flatten(S.paths[comp], 0.5))); if (A1 > A0) usePi = comp; loop = BZ.flatten(S.paths[usePi], 0.4); sources = [usePi]; merged = BZ.clone([S.paths[usePi]])[0]; }
      else { const enc = enclosureOf(usePi); if (enc && enc.merged) { merged = enc.merged; loop = BZ.flatten(merged, 0.4); sources = [usePi]; r.splice = enc; }
        else { loop = BZ.flatten(S.paths[usePi], 0.4); sources = [usePi]; merged = BZ.clone([S.paths[usePi]])[0]; } } }
    else { S.paths.forEach((p, pi) => { if (!p.n || p.n.length < 2 || p.hole) return; const f = BZ.flatten(p, 0.5); let near = 0, step = Math.max(1, Math.floor(f.length / 12));
        for (let i = 0; i < f.length; i += step) if (distPoly(loop, f[i]) <= tol) near++; if (near >= 3) sources.push(pi); });
      const closed = sources.filter(i => S.paths[i].z && BZ.inside(BZ.flatten(S.paths[i], 0.5), u));
      if (closed.length) { let big = closed[0], ba = 0; for (const i of closed) { const a = Math.abs(T.area(BZ.flatten(S.paths[i], 0.5))); if (a > ba) { ba = a; big = i; } }
        const comp = companionOf(big); usePi = (comp != null && Math.abs(T.area(BZ.flatten(S.paths[comp], 0.5))) > ba) ? comp : big; loop = BZ.flatten(S.paths[usePi], 0.4); sources = [usePi]; merged = BZ.clone([S.paths[usePi]])[0]; }
      else if (sources.length) { merged = joinList(sources, joinU()); if (merged) loop = BZ.flatten(merged, 0.4); usePi = -1; } }
    if (!merged && loop) merged = BZ.fromPolyline(loop, { closed: true, tol: 0.5, arm: 4, corner: 35 });
    const gap = merged ? endGapMm(merged) : (r.splice && r.splice.gap) || 0; return { loop: merged ? BZ.flatten(merged, 0.4) : loop, match: usePi, sources, merged, gap, u, splice: r.splice || null }; }

  function commitWholeCut(p, sources, match) { p.cut = true; p.uc = 1; p.z = true; delete p.w; delete p.dbl;
    const src = (sources && sources.length ? sources : (match >= 0 ? [match] : [])).filter(i => S.paths[i]);
    pushUndo();
    if (src.length === 1 && (match === src[0] || sources.length === 1)) { const q = S.paths[src[0]]; q.n = p.n; q.z = true; q.cut = true; q.uc = 1; delete q.w; delete q.dbl; S.cutOn = true; if (typeof syncInputs === 'function') syncInputs(); return src[0]; }
    const drop = new Set(src); S.paths = S.paths.filter((q, i) => !drop.has(i)); S.paths.push(p); S.cutOn = true; if (typeof syncInputs === 'function') syncInputs(); return S.paths.length - 1; }
  function doCutOut(opts) { const r = CO.region; if (!r) { toast('Draw around the area you want, then tap ✓ Make this a cut'); return; }
    // a drawn or lasso cut is exactly the line the user drew - add it, do not take other lines away
    if (r.user || r.kind === 'draw' || r.kind === 'lasso' || !(r.match >= 0 && S.paths[r.match] && S.paths[r.match].z)) {
      const p = addUserCut(r.loop || (r.pts && r.pts.concat([r.pts[0]])), true); if (!p) { toast('Could not make that cut'); return; }
      pushUndo(); S.paths.push(p); S.cutOn = true; if (typeof syncInputs === 'function') syncInputs(); CO.region = null; CO.sel = -1; CO.gap = 0; changed(); panel();
      toast('Cut line added (red). Undo takes it back.', 3200); return; }
    const p = BZ.clone([S.paths[r.match]])[0]; p.cut = true; p.uc = 1; p.z = true; delete p.w; delete p.dbl;
    commitWholeCut(p, [r.match], r.match); CO.region = null; CO.sel = -1; CO.gap = 0; changed(); panel();
    toast('That outline is now a cut line (red). Undo takes it back.', 3200); }
  function closeCutGap() { if (CO.region && CO.region.merged) { closePath(CO.region.merged); CO.region.loop = BZ.flatten(CO.region.merged, 0.4); CO.region.gap = 0; CO.gap = 0; panel(); draw(); toast('Gap closed. Tap ✓ Make this a cut.', 3000); return; }
    doCutOut({ close: true }); }
  function makeEtch() { const p = S.paths[CO.sel]; if (!isCut(p)) return; pushUndo(); const wasOuter = !p.hole && p.uc !== 1; delete p.cut; delete p.uc; delete p.tabs; delete p.tabBase; delete p._tsig; CO.sel = -1; if (wasOuter && window.WP && WP.noteCutGone) WP.noteCutGone(); changed(); panel(); toast('That line is an etch line again'); }
  // ================= Clear space =================
  // Clear space: tap areas (shaded), drag a box, or (advanced) tap points round a polygon. Clear removes every etch line inside, cut exactly at the edge.
  const polyBB = poly => { let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity; for (const q of poly) { x0 = Math.min(x0, q[0]); y0 = Math.min(y0, q[1]); x1 = Math.max(x1, q[0]); y1 = Math.max(y1, q[1]); } return { x0, y0, x1, y1 }; };
  function clTap(u) { const G = grid(), pix = G ? Math.round((u[1] - G.oy) * G.s) * G.w + Math.round((u[0] - G.ox) * G.s) : -1; CL.regs = CL.regs.filter(r => r.kind !== 'face' || (G && r.sig === G.sig)); const hit = CL.regs.findIndex(r => r.kind === 'face' ? r.m[pix] === 1 : BZ.inside(r.poly, u)); if (hit >= 0) { CL.regs.splice(hit, 1); panel(); draw(); toast('Area taken off the selection'); return; }
    const r = regionAt(u); if (r.err) { toast(r.err, 4000); return; } CL.regs.push({ kind: 'face', poly: r.loop, g: r.g, m: r.m, sig: r.sig, bb: polyBB(r.loop) }); panel(); draw(); }
  function clBox() { const bx = CL.box; CL.box = null; if (!bx) return; const [a, b] = bx; if (Math.abs(a[0] - b[0]) * view.s < 12 || Math.abs(a[1] - b[1]) * view.s < 12) { draw(); return; }
    const poly = [[Math.min(a[0], b[0]), Math.min(a[1], b[1])], [Math.max(a[0], b[0]), Math.min(a[1], b[1])], [Math.max(a[0], b[0]), Math.max(a[1], b[1])], [Math.min(a[0], b[0]), Math.max(a[1], b[1])]];
    CL.regs.push({ kind: 'box', poly, bb: polyBB(poly) }); panel(); draw(); }
  function clRegions() { const regs = CL.regs.slice(); if (CL.mode === 'poly' && CL.pts.length >= 3) regs.push({ kind: 'poly', poly: CL.pts.slice(), bb: polyBB(CL.pts) }); return regs; }
  function inReg(r, q) { if (q[0] < r.bb.x0 || q[0] > r.bb.x1 || q[1] < r.bb.y0 || q[1] > r.bb.y1) return false; return BZ.inside(r.poly, q); } // box / polygon: exactly at the edge
  // tapped areas (on the line raster): open space inside a picked area is cleared; a line is cleared when there is picked area on
  // every side of it (e.g. the cross between two picked panes), or - with "Include border lines" - picked area on any side (the frame)
  function inFaces(faces, G, q) { const x = Math.round((q[0] - G.ox) * G.s), y = Math.round((q[1] - G.oy) * G.s); if (x < 0 || y < 0 || x >= G.w || y >= G.h) return false; const i = y * G.w + x, on = j => faces.some(r => r.m[j] === 1);
    if (!G.ink[i]) return on(i); const R = Math.ceil(G.sw / 2) + 2; let a = 0, b = 0;
    for (let dy = -R; dy <= R; dy++) for (let dx = -R; dx <= R; dx++) { if (dx * dx + dy * dy > R * R) continue; const xx = x + dx, yy = y + dy; if (xx < 0 || yy < 0 || xx >= G.w || yy >= G.h) continue; const j = yy * G.w + xx; if (G.ink[j]) continue; if (on(j)) a++; else b++; }
    return CL.grow ? a > 0 : a > 0 && b === 0; }
  function doClear() { const regs = clRegions(); if (!regs.length) { toast(CL.mode === 'poly' ? 'Tap at least 3 points round the area' : 'Tap inside an area first (or drag a box)'); return; }
    let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity; for (const r of regs) { const p = r.kind === 'face' ? r.g : 0; x0 = Math.min(x0, r.bb.x0 - p); y0 = Math.min(y0, r.bb.y0 - p); x1 = Math.max(x1, r.bb.x1 + p); y1 = Math.max(y1, r.bb.y1 + p); }
    const G = grid(), faces = regs.filter(r => r.kind === 'face' && G && r.sig === G.sig), geo = regs.filter(r => r.kind !== 'face'); if (faces.length < regs.filter(r => r.kind === 'face').length) { CL.regs = geo; panel(); draw(); toast('The lines changed - tap the areas again'); return; }
    const inside = q => geo.some(r => inReg(r, q)) || (faces.length > 0 && inFaces(faces, G, q)), snap0 = snap(), list = S.paths.map((p, i) => i).filter(pi => isEtch(S.paths[pi]) && !S.paths[pi].hole && nearBox(pi, x0, y0, x1, y1)), n = clipAll(list, inside, Math.max(0.25, 1.2 / view.s), faces.length ? 2.5 / G.s : 0.3);
    if (!n) { toast(CL.grow ? 'No lines in that area' : 'No lines inside that area - tick "Include border lines" to remove its outline too', 4500); return; } undoSt.push(snap0); redoSt = []; CL.regs = []; CL.pts = []; changed(); panel(); toast(`Cleared - ${n} line${n > 1 ? 's' : ''} removed or trimmed at the edge. Undo brings them back.`, 3500); }
  // ================= panel & paint =================
  const HINT = { p2p: 'Tap, tap, tap: straight lines point to point (they snap onto lines). Drag a line to bend it, drag a dot to move it. Double-tap or Done to finish.',
    draw: 'Draw with one finger. The line is smoothed and its ends snap onto nearby lines. Two fingers move the picture.',
    rub: 'Rub over lines to erase them. Tap a line to remove it up to the next junction.',
    clear: 'Tap inside an area to shade it, or drag a box. Then Clear removes every line inside.' };
  function setKindSeg(id, isCutOn) { const el = $(id); if (!el) return; el.querySelectorAll('button').forEach(b => b.classList.toggle('on', (b.dataset.kind === 'cut') === !!isCutOn)); }
  function panel() { if (!IDS.includes(tool)) return; const set = (id, h) => { const el = $(id); if (el) el.innerHTML = h; };
    if (tool === 'sel') { const has = SL.list.length > 0, brk = SL.mode === 'brk'; $('t4slActs').hidden = brk; $('t4slBrk').hidden = !brk;
      document.querySelectorAll('#t4slActs button').forEach(b => { b.disabled = !has; });
      const allCut = has && SL.list.every(i => S.paths[i] && S.paths[i].cut);
      const sk = $('slKind'); if (sk) { sk.hidden = !has || brk; sk.querySelectorAll('button').forEach(b => b.classList.toggle('on', (b.dataset.kind === 'cut') === allCut)); }
      const gap = SL.pendingCut ? (SL.gap || (SL.pendingCut.merged ? endGapMm(SL.pendingCut.merged) : 0)) : 0;
      const gr = $('slGapRow'); if (gr) gr.hidden = !(gap > CLOSE_AUTO_MM && gap <= CLOSE_ASK_MM);
      const len = SL.merged ? (BZ.length(SL.merged) * kmm()).toFixed(1) : 0;
      const shN = has && !brk ? (shapeOf(SL.list[0]).list.length) : 0;
      set('t4slHint', !has ? 'Tap a line to pick it (including the red outside cut). Drag to move the picture.' : !brk ? (gap ? `<b>This cut has a gap of ${gap.toFixed(1)} mm.</b> Tap ✓ Close the gap to join it into one cut.` : `Whole line picked (blue, ${len} mm${SL.list.length > 1 ? `, ${SL.list.length} joined pieces` : ''}${allCut ? ', cut line' : ''}${shN > SL.list.length ? `. CUT turns the whole connected shape (${shN} pieces) into one cut` : '. Tap CUT to make the whole connected shape a cut'}).`) :
        !SL.a ? '<b>Break:</b> tap where the line should <b>STOP</b> (it snaps onto the blue line).' : !SL.b ? 'Now tap where the line <b>STARTS AGAIN</b>.' : '<b style="color:#e03131">Red dashes</b> = the gap (laser off). Tap Confirm.');
      $('t4slOk').disabled = !SL.plan; }
    if (tool === 'p2p') { $('t4ppDone').disabled = !(PP.live && PP.pi >= 0); setKindSeg('ppKind', inkCut); set('t4ppHint', PP.live ? `Drawing: ${S.paths[PP.pi] ? S.paths[PP.pi].n.length : 0} point(s). Tap the next point, tap the first point to close, or Done.${inkCut ? ' This line will be a cut (red).' : ''}` : HINT.p2p); }
    if (tool === 'draw') setKindSeg('drKind', inkCut);
    if (tool === 'brk') { const del = BR.mode !== 'add'; document.querySelectorAll('[data-brmode]').forEach(b => { const onB = b.dataset.brmode === BR.mode; b.classList.toggle('accent', onB); b.setAttribute('aria-pressed', String(onB)); });
      set('t4brHint', del ? (!BR.a ? '<b>Remove a section:</b> tap a line where the gap should start, then tap the <b>same line</b> where it should end. (Two taps on different lines or in empty space join them with a new line.)'
          : !BR.b ? (BR.list ? 'Line picked (blue). Now tap the <b>same line</b> where the gap should end.' : 'That tap is not on a line. Tap where a new line should end.')
          : BR.plan && BR.plan.kind === 'del' ? '<b style="color:#e03131">Red dashes</b> = the bit that will be removed. Tap ✓ Remove it.'
          : '<b style="color:#e8590c">Orange</b> = a <b>new line</b> will be added, because the two taps are not on the same line. To remove a bit instead, tap ✕ Cancel and tap twice on one line.')
        : (!BR.a ? '<b>Add a line:</b> tap where the new line starts, then where it ends (ends snap onto lines).' : !BR.b ? 'Now tap where the new line ends.' : '<b style="color:#e8590c">Orange</b> = the line that will be added. Tap ✓ Add it.'));
      $('t4brOk').disabled = !BR.plan; $('t4brOk').textContent = BR.plan ? (BR.plan.kind === 'del' ? '✓ Remove it' : '✓ Add it') : '✓ Confirm'; }
    if (tool === 'rub') set('t4rbOut', `${(RB.px / view.s * kmm()).toFixed(1)} mm`);
    if (tool === 'thick') { const p = TH.pi >= 0 ? S.paths[TH.pi] : null; set('t4thHint', p ? `This line: ${describe(p)}.` : 'Tap a line to pick it (it turns blue), then set its thickness.');
      if (p) { $('t4w').value = p.w || S.lineMm; $('t4wn').value = (p.w || S.lineMm); $('t4dbl').checked = !!p.dbl; if (p.dbl) $('t4dd').value = p.dbl.toFixed(2); } $('t4w').min = S.lineMm; $('t4ddRow').hidden = !$('t4dbl').checked; }
    if (tool === 'cutout') { $('t4coGo').disabled = !CO.region; const ag = $('t4coAgain'); if (ag) ag.hidden = !(CO.region && CO.region.user); $('t4coEtch').hidden = !(CO.sel >= 0 && isCut(S.paths[CO.sel]));
      document.querySelectorAll('[data-comode]').forEach(b => b.classList.toggle('on', b.dataset.comode === (CO.mode || 'draw')));
      const sn = $('coSnap'); if (sn) { sn.checked = !!CO.snap; $('coSnapL').hidden = !(CO.mode === 'draw' || CO.mode === 'lasso'); }
      const lead = (() => { const nh = WP.holeCount(); return nh ? `<b>${nh} cut out${nh === 1 ? '' : 's'}</b> (red). ` : ''; })();
      set('t4coHint', CO.region ? (CO.region.user ? 'The <b>red line</b> is the cut you drew. Drag a <b>white dot</b> to adjust it, then tap <b>✓ Make this a cut</b>. Nothing changes until you do.' : 'The <b>red outline</b> is the closed shape. Check it, then tap <b>✓ Make this a cut</b>. Nothing changes until you do.') : CO.sel >= 0 ? 'Cut line picked (blue). Drag its points to adjust, or <b>Make etch line</b> to stop cutting it.' : (CO.mode === 'lasso' ? lead + 'Draw a loop around the area - the red cut will be the loop you drew. Let go, adjust the dots if you need to, then tap ✓ Make this a cut.' : CO.mode === 'tap' ? lead + 'Tap inside a shape that is already closed (a window, a hole). If the app cannot find a closed area, it will ask you to draw around it instead.' : lead + 'Drag your finger around the area you want to cut. The red line follows you and closes when you let go. Tick <b>Snap to lines</b> to hug nearby lines (about 1.5 mm). Then tap ✓ Make this a cut.')); }
    if (tool === 'edge') { const mm = $('teMm'); if (mm && document.activeElement !== mm) mm.value = TE.mm;
      const has = !!(TE.preview && TE.preview.length >= 2); $('teGo').disabled = !has; $('teSwap').disabled = !has && !(TE.a && TE.closed);
      const way = $('teWay'); if (way) way.hidden = !TE.closed;
      document.querySelectorAll('[data-teway]').forEach(b => b.classList.toggle('on', b.dataset.teway === TE.way));
      const kind = $('teKind'); if (kind) kind.querySelectorAll('button').forEach(b => b.classList.toggle('on', (b.dataset.kind === 'cut') === !!TE.cut));
      const closedNote = TE.closed ? ' This line is a loop - pick Shorter way, Longer way, or Whole loop.' : '';
      set('teHint', !TE.a ? 'Set a <b>Distance</b>, then tap a line to set the <b>start</b> point. Tap the <b>same line</b> again for the <b>finish</b>. A teal line shows the new edge. Nothing is added until you tap <b>✓ Add this line</b>.' + closedNote : !TE.b && TE.way !== 'whole' ? (TE.closed ? 'Start is the green dot. Tap the same line for the finish, or tap <b>Whole loop</b> to offset the entire outline.' : 'Start is the green dot. Tap the <b>same line</b> for the finish point.') : !has ? 'Could not build an edge at that distance. Try a smaller Distance, or Swap side.' : 'The <b>teal line</b> is the new edge. Tap <b>⇄ Swap side</b> to flip it, change the Distance if you like, then <b>✓ Add this line</b> (Undo takes it back).'); }
    if (tool === 'clear') { const regs = clRegions(), nf = regs.length; $('t4clGo').disabled = !nf; $('t4clBack').hidden = CL.mode !== 'poly'; { const gl = $('t4clGrow'); if (gl) { gl.checked = CL.grow; gl.parentNode.hidden = CL.mode === 'poly'; } } $('t4clNo').disabled = !nf && !CL.pts.length; document.querySelectorAll('[data-clmode]').forEach(b => b.classList.toggle('on', b.dataset.clmode === CL.mode));
      const big = regs.some(r => r.kind === 'face' && (r.bb.x1 - r.bb.x0) * (r.bb.y1 - r.bb.y0) > 0.3 * (() => { const b = BZ.bbox(S.paths); return b ? b.w * b.h : Infinity; })());
      set('t4clHint', CL.mode === 'poly' ? (CL.pts.length < 3 ? `Tap points round the area (${CL.pts.length} so far, at least 3). Drag a point to move it.` : `<b>${CL.pts.length}-point area shaded</b> - tap Clear.`) :
        !nf ? 'Tap inside an area (a window, a pane) to shade it. Tap more areas to add them, tap a shaded one to take it off. Or drag a box.' : `<b>${nf} area${nf > 1 ? 's' : ''} selected</b> - tap Clear.${CL.grow ? ' Border lines are included.' : ' Border lines are kept.'}${big ? ' <span class="warn">That is a big area - check the shading.</span>' : ''}`); } }
  function paint(px) { const r = 4.5 * px;
    if (flash && Date.now() < flash.until && S.paths.includes(flash.p)) { ctx.strokeStyle = '#1971c2'; ctx.lineWidth = 3 * px; ctx.beginPath(); tracePath(flash.p); ctx.stroke(); }
    if (focus && S.paths[focus.pi] && (tool === 'p2p' || tool === 'cutout')) { const R = 120 * px; S.paths[focus.pi].n.forEach(nd => { if (Math.hypot(nd.x - focus.u[0], nd.y - focus.u[1]) > R) return; ctx.fillStyle = '#fff'; ctx.strokeStyle = '#1d3557'; ctx.lineWidth = 1.3 * px; ctx.beginPath(); ctx.arc(nd.x, nd.y, r, 0, 7); ctx.fill(); ctx.stroke(); }); }
    if (tool === 'sel' && SL.list.length) { ctx.strokeStyle = 'rgba(25,113,194,0.85)'; ctx.lineWidth = 5 * px; ctx.beginPath(); for (const i of SL.list) if (S.paths[i]) tracePath(S.paths[i]); ctx.stroke();
      if (SL.merged && !SL.merged.z) for (const nd of [SL.merged.n[0], SL.merged.n[SL.merged.n.length - 1]]) { ctx.fillStyle = '#1971c2'; ctx.beginPath(); ctx.arc(nd.x, nd.y, 5 * px, 0, 7); ctx.fill(); }
      if (SL.plan) { ctx.strokeStyle = '#e03131'; ctx.lineWidth = 5 * px; ctx.setLineDash([6 * px, 5 * px]); ctx.beginPath(); SL.plan.removed.forEach(tracePath); ctx.stroke(); ctx.setLineDash([]); }
      for (const s of [SL.a, SL.b]) if (s) { ctx.fillStyle = '#e8590c'; ctx.strokeStyle = '#fff'; ctx.lineWidth = 2 * px; ctx.beginPath(); ctx.arc(s.pt[0], s.pt[1], 7 * px, 0, 7); ctx.fill(); ctx.stroke(); } }
    if (tool === 'p2p' && PP.live && S.paths[PP.pi]) { const p = S.paths[PP.pi]; ctx.strokeStyle = '#1971c2'; ctx.lineWidth = 2.6 * px; ctx.beginPath(); tracePath(p); ctx.stroke();
      p.n.forEach((nd, j) => { ctx.fillStyle = j === 0 ? '#1971c2' : '#fff'; ctx.strokeStyle = '#1971c2'; ctx.lineWidth = 1.5 * px; ctx.beginPath(); ctx.arc(nd.x, nd.y, j === 0 ? r * 1.4 : r, 0, 7); ctx.fill(); ctx.stroke(); }); }
    if (tool === 'draw' && DR.pts) { ctx.strokeStyle = '#1971c2'; ctx.lineWidth = 2.4 * px; ctx.beginPath(); ctx.moveTo(DR.pts[0][0], DR.pts[0][1]); for (const q of DR.pts) ctx.lineTo(q[0], q[1]); ctx.stroke(); }
    if (tool === 'brk') { const dot = (s, c) => { ctx.fillStyle = c; ctx.beginPath(); ctx.arc(s.pt[0], s.pt[1], 6 * px, 0, 7); ctx.fill(); };
      if (BR.merged && BR.mode !== 'add') { ctx.strokeStyle = 'rgba(25,113,194,0.85)'; ctx.lineWidth = 3 * px; ctx.beginPath(); tracePath(BR.merged); ctx.stroke(); }
      const pl = BR.plan; if (pl && pl.kind === 'del') { ctx.strokeStyle = '#e03131'; ctx.lineWidth = 4 * px; ctx.setLineDash([6 * px, 5 * px]); ctx.beginPath(); pl.removed.forEach(tracePath); ctx.stroke(); ctx.setLineDash([]); }
      if (pl && pl.kind === 'add') { ctx.strokeStyle = '#e8590c'; ctx.lineWidth = 3.5 * px; ctx.beginPath(); ctx.moveTo(pl.a.pt[0], pl.a.pt[1]); ctx.lineTo(pl.b.pt[0], pl.b.pt[1]); ctx.stroke(); }
      if (BR.a) dot(BR.a, '#e8590c'); if (BR.b) dot(BR.b, '#e8590c'); }
    if (tool === 'rub' && RB.at) { ctx.strokeStyle = 'rgba(224,49,49,0.9)'; ctx.fillStyle = 'rgba(224,49,49,0.12)'; ctx.lineWidth = 1.5 * px; ctx.beginPath(); ctx.arc(RB.at[0], RB.at[1], RB.px * px, 0, 7); ctx.fill(); ctx.stroke(); }
    if (tool === 'thick' && TH.pi >= 0 && S.paths[TH.pi]) { ctx.strokeStyle = 'rgba(25,113,194,0.55)'; ctx.lineWidth = Math.max(6 * px, ((S.paths[TH.pi].w || S.lineMm) + (S.paths[TH.pi].dbl || 0)) / kmm() + 4 * px); ctx.beginPath(); tracePath(S.paths[TH.pi]); ctx.stroke(); }
    if (tool === 'cutout') { if (CO.lasso && CO.lasso.length > 1) { ctx.strokeStyle = '#e03131'; ctx.lineWidth = 2.4 * px; ctx.lineCap = 'round'; ctx.lineJoin = 'round'; ctx.beginPath(); ctx.moveTo(CO.lasso[0][0], CO.lasso[0][1]); for (const q of CO.lasso) ctx.lineTo(q[0], q[1]); ctx.stroke(); }
      if (CO.region && CO.region.loop && CO.region.loop.length) { const l = CO.region.loop; ctx.fillStyle = 'rgba(224,49,49,0.16)'; ctx.strokeStyle = '#e03131'; ctx.lineWidth = 3.2 * px; ctx.shadowColor = 'rgba(224,49,49,0.55)'; ctx.shadowBlur = 10 * px; ctx.beginPath(); ctx.moveTo(l[0][0], l[0][1]); for (const q of l) ctx.lineTo(q[0], q[1]); ctx.closePath(); ctx.fill(); ctx.stroke(); ctx.shadowBlur = 0;
        if (CO.region.user && CO.region.pts) CO.region.pts.forEach((q, i) => { ctx.fillStyle = '#fff'; ctx.strokeStyle = '#e03131'; ctx.lineWidth = 1.8 * px; ctx.beginPath(); ctx.arc(q[0], q[1], (i === 0 ? 6.5 : 5.5) * px, 0, 7); ctx.fill(); ctx.stroke(); }); }
      if (CO.sel >= 0 && isCut(S.paths[CO.sel])) { ctx.strokeStyle = '#1971c2'; ctx.lineWidth = 2.6 * px; ctx.beginPath(); tracePath(S.paths[CO.sel]); ctx.stroke(); } }
    if (tool === 'edge') { if (TE.merged) { ctx.strokeStyle = 'rgba(25,113,194,0.7)'; ctx.lineWidth = 4.2 * px; ctx.beginPath(); tracePath(TE.merged); ctx.stroke(); }
      if (TE.src && TE.src.pts && TE.src.pts.length) { const s = TE.src.pts; ctx.strokeStyle = '#1971c2'; ctx.lineWidth = 3.4 * px; ctx.beginPath(); ctx.moveTo(s[0][0], s[0][1]); for (const q of s) ctx.lineTo(q[0], q[1]); if (TE.src.closed) ctx.closePath(); ctx.stroke(); }
      if (TE.preview && TE.preview.length) { const s = TE.preview; ctx.strokeStyle = '#0c8c7a'; ctx.lineWidth = 3.2 * px; ctx.setLineDash([7 * px, 5 * px]); ctx.shadowColor = 'rgba(12,140,122,0.45)'; ctx.shadowBlur = 8 * px; ctx.beginPath(); ctx.moveTo(s[0][0], s[0][1]); for (const q of s) ctx.lineTo(q[0], q[1]); if (TE.src && TE.src.closed) ctx.closePath(); ctx.stroke(); ctx.setLineDash([]); ctx.shadowBlur = 0; }
      const dot = (pt, c) => { if (!pt) return; ctx.fillStyle = c; ctx.strokeStyle = '#fff'; ctx.lineWidth = 1.6 * px; ctx.beginPath(); ctx.arc(pt[0], pt[1], 6.5 * px, 0, 7); ctx.fill(); ctx.stroke(); };
      if (TE.a) dot(TE.a.pt, '#2b8a3e'); if (TE.b) dot(TE.b.pt, '#e8590c'); }
    if (tool === 'clear') { ctx.lineJoin = 'round'; for (const r of clRegions()) { ctx.fillStyle = 'rgba(224,49,49,0.24)'; ctx.strokeStyle = '#e03131'; ctx.lineWidth = (r.kind === 'face' && CL.grow ? 4 : 2) * px; ctx.setLineDash(r.kind === 'face' && !CL.grow ? [5 * px, 4 * px] : []);
        ctx.beginPath(); ctx.moveTo(r.poly[0][0], r.poly[0][1]); for (const q of r.poly) ctx.lineTo(q[0], q[1]); ctx.closePath(); ctx.fill(); ctx.stroke(); ctx.setLineDash([]); }
      if (CL.box) { const [a, b] = CL.box; ctx.fillStyle = 'rgba(224,49,49,0.18)'; ctx.strokeStyle = '#e03131'; ctx.lineWidth = 2 * px; ctx.fillRect(Math.min(a[0], b[0]), Math.min(a[1], b[1]), Math.abs(b[0] - a[0]), Math.abs(b[1] - a[1])); ctx.strokeRect(Math.min(a[0], b[0]), Math.min(a[1], b[1]), Math.abs(b[0] - a[0]), Math.abs(b[1] - a[1])); }
      if (CL.mode === 'poly') CL.pts.forEach((q, i) => { ctx.fillStyle = 'rgba(224,49,49,0.18)'; ctx.beginPath(); ctx.arc(q[0], q[1], 14 * px, 0, 7); ctx.fill(); ctx.fillStyle = i === 0 ? '#e03131' : '#fff'; ctx.strokeStyle = '#e03131'; ctx.lineWidth = 1.8 * px; ctx.beginPath(); ctx.arc(q[0], q[1], (i === 0 ? 7 : 6) * px, 0, 7); ctx.fill(); ctx.stroke(); }); } }
  function reset() { SL.list = SL.list.filter(i => S.paths[i]); if (SL.list.length) { const c = chainOf(SL.list[0]); SL.list = c.list; SL.merged = c.merged; } else SL.merged = null; SL.mode = null; SL.a = SL.b = SL.plan = null; SL.pendingCut = null; SL.gap = 0; if (PP.live && PP.pi >= 0 && !S.paths[PP.pi]) PP.live = false; if (PP.live && PP.pi >= 0 && S.paths[PP.pi] && S.paths[PP.pi].n.length < 1) PP.live = false; brkClear(); CO.region = null; CO.lasso = null; CO.gap = 0; teClear(); if (TH.pi >= S.paths.length) TH.pi = -1; if (CO.sel >= S.paths.length) CO.sel = -1; focus = null; panel(); }
  function onTool(t, prev) { if (t !== 'sel') { SL.list = []; SL.merged = null; SL.pendingCut = null; SL.gap = 0; } SL.mode = null; SL.a = SL.b = SL.plan = null; if (prev === 'p2p' && t !== 'p2p' && PP.live) p2pDone(); brkClear(); CO.region = null; CO.lasso = null; CO.gap = 0; if (t === 'cutout') CO.mode = 'draw'; if (t !== 'edge') teClear(); focus = null; if (t !== 'thick') TH.pi = -1; if (t !== 'clear') { CL.pts = []; CL.regs = []; CL.box = null; } DR.pts = null; RB.at = null; panel(); }
  function wire() { const on = (id, f) => { const el = $(id); if (el) el.onclick = f; };
    on('t4ppDone', p2pDone); on('t4ppUndo', undo); on('t4drUndo', undo); on('t4brOk', brkConfirm); on('t4brNo', () => { brkClear(); panel(); draw(); }); document.querySelectorAll('[data-brmode]').forEach(b => b.onclick = () => { BR.mode = b.dataset.brmode; try { localStorage.setItem('wp-brMode', BR.mode); } catch (e) {} brkClear(); panel(); draw(); }); on('t4rbUndo', undo);
    on('t4coGo', doCutOut); on('t4coClose', closeCutGap); on('t4coEtch', makeEtch); on('t4coNo', cancelCutDraft); on('t4coAgain', () => { CO.region = null; CO.lasso = null; panel(); draw(); }); on('slClose', closeSelGap);
    document.querySelectorAll('[data-comode]').forEach(b => b.onclick = () => { CO.mode = b.dataset.comode; CO.lasso = null; CO.region = null; CO.sel = -1; panel(); draw(); });
    { const sn = $('coSnap'); if (sn) sn.onchange = () => { CO.snap = sn.checked; try { localStorage.setItem('wp-coSnap', CO.snap ? '1' : '0'); } catch (e) {} }; }
    const stepTe = s => { teSetMm((+TE.mm || 2) + s); };
    on('teMmM', () => stepTe(-0.1)); on('teMmP', () => stepTe(0.1));
    { const mm = $('teMm'); if (mm) { mm.oninput = () => { const v = +mm.value; if (v >= 0.1 && v <= 50) { TE.mm = Math.round(v * 10) / 10; teSaveMm(); teRebuild(); draw(); } }; mm.onchange = () => teSetMm(mm.value); } }
    on('teSwap', () => { TE.side *= -1; teRebuild(); panel(); draw(); }); on('teNo', () => { teClear(); panel(); draw(); }); on('teGo', teAdd);
    document.querySelectorAll('[data-teway]').forEach(b => b.onclick = () => { TE.way = b.dataset.teway; if (TE.way === 'whole' && TE.a && TE.closed) { if (!TE.b) TE.b = TE.a; teRebuild(); } else teRebuild(); panel(); draw(); });
    ['slKind', 'ppKind', 'drKind', 'teKind'].forEach(id => { const el = $(id); if (!el) return; el.querySelectorAll('button').forEach(b => b.onclick = () => { if (id === 'slKind') applySelKind(b.dataset.kind === 'cut'); else if (id === 'teKind') { TE.cut = b.dataset.kind === 'cut'; panel(); draw(); } else setInkCut(b.dataset.kind === 'cut'); }); }); on('t4clGo', doClear); document.querySelectorAll('[data-clmode]').forEach(b => b.onclick = () => { CL.mode = b.dataset.clmode; CL.pts = []; panel(); draw(); }); { const gr = $('t4clGrow'); if (gr) gr.onchange = () => { CL.grow = gr.checked; panel(); draw(); }; } on('t4clBack', () => { CL.pts.pop(); panel(); draw(); }); on('t4clNo', () => { CL.regs = []; CL.box = null; CL.pts = []; panel(); draw(); });
    on('t4thAll', () => applyThick(true)); on('t4slDel', () => selAct('del')); on('t4slBrkB', () => selAct('brk')); on('t4slTh', () => selAct('thick'));
    on('t4slOk', selConfirm); on('t4slNo', () => { SL.mode = null; SL.a = SL.b = SL.plan = null; panel(); draw(); });
    if (typeof tool !== 'undefined' && tool === 'move') setTool('sel'); on('t4coOut', () => WP.openMenu('sec-size'));
    const rb = $('t4rb'); if (rb) rb.oninput = () => { RB.px = +rb.value; panel(); };
    document.querySelectorAll('[data-rbmode]').forEach(b => b.onclick = () => { RB.mode = b.dataset.rbmode; document.querySelectorAll('[data-rbmode]').forEach(x => x.classList.toggle('on', x === b)); });
    const w = $('t4w'), wn = $('t4wn'), dbl = $('t4dbl'), dd = $('t4dd');
    if (w) { w.oninput = () => { wn.value = (+w.value).toFixed(2); }; w.onchange = () => applyThick(false);
      wn.onchange = () => { let v = +wn.value; if (!(v >= 0)) v = S.lineMm; if (v < S.lineMm) { toast(`Thinner than the laser line (${S.lineMm} mm) - stays one normal pass`); v = S.lineMm; } v = Math.min(10, v); wn.value = v; w.value = v; applyThick(false); };
      dbl.onchange = () => { $('t4ddRow').hidden = !dbl.checked; applyThick(false); };
      const stepDD = s => { let v = Math.round(((+dd.value || 0) + s) * 100) / 100; v = Math.max(0.01, Math.min(20, v)); dd.value = v.toFixed(2); if (dbl.checked) applyThick(false); };
      on('t4ddM', () => stepDD(-0.01)); on('t4ddP', () => stepDD(0.01)); dd.onchange = () => stepDD(0); } }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', wire); else wire();
  return { INK, regionAt, clRegions, SL, chainOf, shapeOf, selAct, applySelKind, selConfirm, IDS, down, move, up, cancelG, paint, paintThick, plain, panel, reset, onTool, clip, hitEtch, PP, BR, RB, TH, CO, CL, TE, p2pDone, brkConfirm, doCutOut, closeCutGap, doClear, applyThick, findRegion, finishUserCut, cancelCutDraft, teTap, teRebuild, teAdd, teClear, setInkCut, get inkCut() { return inkCut; }, markInk };
})();
