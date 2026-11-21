// Waylands Path v5.6 - Tabs & slots: tabs on a chosen edge of the outer cut, matching slots you can place and turn,
// crush bumps, and a kerf setting (how much wood the laser burns away). Tabs grow by kerf/2 each side; slots shrink
// by kerf/2, so the finished sizes match the typed boxes. Standard (all adjustable): 10 × 4 mm tabs, 2 tabs, 35 mm
// gap, 0.15 × 0.8 mm bumps, 4 mm plywood, 10 × 3.9 mm slots, 0.1 mm kerf, 100 mm body. No bases are built.
// Tab settings live on the outer cut (p.tabs + p.tabBase). Slots are closed cut paths with p.slot. Undo / save / sync keep them.
// Designs without tabs or slots are not touched (laser files stay the same).
'use strict';
window.TB = (() => {
  const $ = id => document.getElementById(id), KEY = 'wp-tabs';
  const STD = { w: 10, proj: 4, n: 2, gap: 35, bump: true, bh: 0.15, bw: 0.8, body: 100, thick: 4, kerf: 0.1, slotW: 10, slotH: 3.9, edge: 'bottom' };
  const LIM = { w: [1, 200], proj: [0.5, 50], n: [1, 10], gap: [0, 500], bh: [0, 2], bw: [0.1, 10], body: [5, 2000], thick: [0.5, 50], kerf: [0, 1], slotW: [0.5, 200], slotH: [0.5, 50] };
  const T = { on: false, pick: -1, slotPick: -1, mode: 'tabs', v: load(), bad: [] };
  function load() { let o = {}; try { o = JSON.parse(localStorage.getItem(KEY) || '{}') || {}; } catch (e) { o = {}; } const v = Object.assign({}, STD);
    for (const k of Object.keys(STD)) {
      if (k === 'bump') { if (typeof o.bump === 'boolean') v.bump = o.bump; }
      else if (k === 'edge') { if (['bottom', 'top', 'left', 'right'].includes(o.edge)) v.edge = o.edge; }
      else if (+o[k] >= LIM[k][0] && +o[k] <= LIM[k][1]) v[k] = +o[k];
    } return v; }
  const save = () => { try { localStorage.setItem(KEY, JSON.stringify(T.v)); } catch (e) { /* */ } };
  const r2 = v => Math.round(v * 100) / 100, r3 = v => Math.round(v * 1000) / 1000;
  const cfgOf = () => ({ w: T.v.w, proj: T.v.proj, n: T.v.n, gap: T.v.gap, bump: T.v.bump, bh: T.v.bh, bw: T.v.bw, kerf: T.v.kerf, edge: T.v.edge, thick: T.v.thick, slotW: T.v.slotW, slotH: T.v.slotH });
  function outer() { let best = null, ba = 0; for (const p of S.paths) { if (!p.cut || p.hole || p.slot || !p.z) continue; const b = BZ.bbox([{ n: p.tabBase || p.n, z: true }]); if (b && b.w * b.h > ba) { ba = b.w * b.h; best = p; } } return best; }
  const baseOf = p => ({ n: p.tabBase || p.n, z: true });
  const slots = () => S.paths.map((p, i) => [p, i]).filter(([p]) => p.slot);

  // map so the chosen edge becomes the +Y (bottom) edge; unmap puts it back
  function edgeXform(edge, bb) {
    const cx = (bb.x0 + bb.x1) / 2, cy = (bb.y0 + bb.y1) / 2;
    const flipY = ([x, y]) => [x, 2 * cy - y];
    const rotCW = ([x, y]) => [cx + (y - cy), cy - (x - cx)]; // left -> bottom
    const rotCCW = ([x, y]) => [cx - (y - cy), cy + (x - cx)]; // right -> bottom
    if (edge === 'top') return { map: flipY, unmap: flipY };
    if (edge === 'left') return { map: rotCW, unmap: rotCCW };
    if (edge === 'right') return { map: rotCCW, unmap: rotCW };
    return { map: p => p.slice(), unmap: p => p.slice() };
  }
  function xformNodes(n, fn) { return n.map(nd => { const p = fn([nd.x, nd.y]), o = Object.assign({}, nd, { x: p[0], y: p[1] });
    if (nd.i) o.i = fn(nd.i); if (nd.o) o.o = fn(nd.o); return o; }); }

  function bumpPts(xs, dir, yc, hw, bh, down) { const pts = [], s = bh, c = hw; if (!(s > 0 && c > 0)) return pts; const R = (c * c + s * s) / (2 * s), tm = Math.asin(Math.min(1, c / R)), N = 8;
    for (let i = 0; i <= N; i++) { const th = -tm + 2 * tm * i / N; pts.push([xs + dir * (R * Math.cos(th) - (R - s)), yc + R * Math.sin(th)]); } return down ? pts : pts.reverse(); }
  function cross(q, x, bb) { const cs = BZ.crossings(q, [x, bb.y0 - 10], [x, bb.y1 + 10], 0.05); let best = null; for (const c of cs) if (!best || c.pt[1] > best.pt[1]) best = c; return best; }
  function addNodeAt(q, c) { const nd = q.n; if (c.t < 1e-6) return c.k; if (c.t > 1 - 1e-6) return (c.k + 1) % nd.length; return BZ.insertNode(q, c.k, c.t); }
  const idxNear = (q, pt) => { let bi = 0, bd = Infinity; q.n.forEach((nd, i) => { const d = Math.hypot(nd.x - pt[0], nd.y - pt[1]); if (d < bd) { bd = d; bi = i; } }); return bi; };

  // cfg.w / cfg.proj are FINISHED mm. Path width grows by kerf (kerf/2 each side).
  function merge(base, cfg, k) { const edge = cfg.edge || 'bottom', bb0 = BZ.bbox([base]); if (!bb0) return { n: BZ.clone(base.n), bad: [] };
    const xf = edgeXform(edge, bb0), q = { n: xformNodes(BZ.clone(base.n), xf.map), z: true }, bb = BZ.bbox([q]), bad = []; if (!bb) return { n: BZ.clone(base.n), bad };
    const kerf = cfg.kerf > 0 ? +cfg.kerf : 0, wPath = cfg.w + kerf, yb = bb.y1 + cfg.proj / k, hw = wPath / 2 / k;
    // xs are stored in world space (x along top/bottom, y along left/right); convert to X in the flipped/rotated frame
    const toXF = c => (edge === 'left' || edge === 'right') ? xf.map(edge === 'left' ? [bb0.x0, c] : [bb0.x1, c])[0] : c;
    const xs = (cfg.xs || []).map(toXF).slice().sort((a, b) => a - b);
    xs.forEach((cx, ti) => { const x0 = cx - hw, x1 = cx + hw; const ca = cross(q, x0, bb); if (!ca) { bad.push(ti); return; } const ia0 = addNodeAt(q, ca), A = [q.n[ia0].x, q.n[ia0].y];
      const cb = cross(q, x1, bb); if (!cb) { bad.push(ti); return; } addNodeAt(q, cb); const B = [cb.pt[0], cb.pt[1]], iA = idxNear(q, A), iB = idxNear(q, B), m = q.n.length; if (iA === iB) { bad.push(ti); return; }
      let top = 0; q.n.forEach((nd, i) => { if (nd.y < q.n[top].y) top = i; }); const fwd = (a, b) => { const out = []; for (let i = a; ; i = (i + 1) % m) { out.push(i); if (i === b) break; } return out; };
      const AB = fwd(iA, iB), rem = AB.includes(top) && top !== iA && top !== iB ? fwd(iB, iA) : AB, S0 = rem[0], E0 = rem[rem.length - 1], keep = fwd(E0, S0);
      const nS = q.n[S0], nE = q.n[E0], sx = Math.abs(nS.x - x0) < Math.abs(nS.x - x1) ? x0 : x1, ex = sx === x0 ? x1 : x0, dS = Math.sign(sx - cx), dE = Math.sign(ex - cx);
      const yc = yb - cfg.proj / 2 / k, bhw = cfg.bw / 2 / k, bh = cfg.bump ? cfg.bh / k : 0, pts = [];
      if (bh > 0 && yc - bhw > nS.y + 1e-9) pts.push(...bumpPts(sx, dS, yc, bhw, bh, true)); pts.push([sx, yb], [ex, yb]);
      if (bh > 0 && yc - bhw > nE.y + 1e-9) pts.push(...bumpPts(ex, dE, yc, bhw, bh, false));
      const nn = keep.map(i => q.n[i]); nn[0] = Object.assign({}, nn[0], { i: null }); nn[nn.length - 1] = Object.assign({}, nn[nn.length - 1], { o: null, s: 0 }); nn[0].s = 0;
      for (const p of pts) nn.push(BZ.node(p[0], p[1])); q.n = nn; });
    return { n: xformNodes(q.n, xf.unmap), bad }; }

  function slotShape(p, k) { const s = p.slot, kerf = s.kerf > 0 ? +s.kerf : 0, W = Math.max(0.3, s.w - kerf) / k, H = Math.max(0.3, s.h - kerf) / k;
    const hw = W / 2, hh = H / 2, rot = s.rot || 0; let pts = [[-hw, -hh], [hw, -hh], [hw, hh], [-hw, hh]];
    if (rot === 90 || rot === 270) pts = pts.map(([x, y]) => [-y, x]);
    pts = pts.map(([x, y]) => [s.cx + x, s.cy + y]);
    const q = BZ.fromPolyline(pts.concat([pts[0]]), { closed: true, tol: 0.15, corner: 20, smooth: 0 });
    p.n = q ? q.n : pts.map(a => BZ.node(a[0], a[1])); p.z = true; p.cut = true; p.uc = 1; delete p.w; delete p.dbl; }

  function sync() { T.bad = []; for (const p of S.paths) { if (p.slot) { slotShape(p, kmm()); continue; } if (!p.tabs && !p.tabBase) continue;
      if (!p.tabs || !p.tabs.xs || !p.tabs.xs.length) { if (p.tabBase) p.n = p.tabBase; delete p.tabBase; delete p.tabs; delete p._tsig; continue; }
      if (!p.tabBase) p.tabBase = BZ.clone(p.n); const k = kmm(), sig = JSON.stringify([p.tabs, k]); if (p._tsig === sig && p.n !== p.tabBase) continue;
      const r = merge(baseOf(p), p.tabs, k); p.n = r.n; p.z = true; p._tsig = sig; T.bad = r.bad; } }

  function layoutXs(cfg, k, cx) { const pitch = (cfg.w + cfg.gap) / k, out = []; for (let i = 0; i < cfg.n; i++) out.push(cx + (i - (cfg.n - 1) / 2) * pitch); return out; }
  function centreAlong(edge) { const E = outer(), ps = S.paths.map(p => p.tabBase ? baseOf(p) : p), b = BZ.bbox(ps); if (!b) return 0;
    if (edge === 'left' || edge === 'right') return (b.y0 + b.y1) / 2; return (b.x0 + b.x1) / 2; }
  function body() { const ps = S.paths.map(p => p.tabBase ? baseOf(p) : p), b = BZ.bbox(ps), k = kmm(); return b ? { w: b.w * k, h: b.h * k } : null; }
  function standard() { const E = outer(); if (!E) { toast('Make the outer cut line first (Cut out tool › Outer cut), then add tabs.', 4500); return; }
    pushUndo(); const c = cfgOf(); c.xs = layoutXs(c, kmm(), centreAlong(c.edge)); E.tabs = c; delete E._tsig; T.pick = -1; T.mode = 'tabs'; changed(); panel();
    const edge = c.edge || 'bottom'; toast(T.bad.length ? 'Some tabs did not fit on that edge - check the panel' : `${c.n} tab${c.n > 1 ? 's' : ''} added: ${c.w} × ${c.proj} mm, ${c.gap} mm apart, on the ${edge} edge`, 3500); }
  function setVal(key, val) { const L = LIM[key]; if (key !== 'bump' && key !== 'edge') { if (!(val >= L[0] && val <= L[1])) { toast(`Use a number from ${L[0]} to ${L[1]}`); panel(); return; } val = key === 'n' ? Math.round(val) : r3(val); }
    if (key === 'edge' && !['bottom', 'top', 'left', 'right'].includes(val)) return;
    T.v[key] = val; save();
    if (key === 'thick' && Math.abs(T.v.slotH - (T.v.thick - 0.1)) < 0.15) { T.v.slotH = r3(Math.max(0.5, val - 0.1)); save(); }
    if (key === 'w' && Math.abs(T.v.slotW - T.v.w) < 0.05) { T.v.slotW = val; save(); }
    const E = outer();
    if (key === 'slotW' || key === 'slotH' || key === 'kerf') {
      const hs = slots(); if (hs.length) { pushUndo(); for (const [p] of hs) { if (key === 'slotW') p.slot.w = T.v.slotW; if (key === 'slotH') p.slot.h = T.v.slotH; if (key === 'kerf') p.slot.kerf = T.v.kerf; } }
    }
    if (key === 'body' || !E || !E.tabs) { if (key === 'kerf' || key === 'slotW' || key === 'slotH') changed(); panel(); return; }
    pushUndo(); if (key in E.tabs || key === 'edge' || key === 'kerf') { E.tabs[key] = val; if (key === 'n' || key === 'gap' || key === 'w' || key === 'kerf' || key === 'edge') E.tabs.xs = layoutXs(E.tabs, kmm(), E.tabs.xs.length ? E.tabs.xs.reduce((a, b) => a + b, 0) / E.tabs.xs.length : centreAlong(E.tabs.edge || T.v.edge)); delete E._tsig; }
    changed(); panel(); }
  function setEdge(edge) { T.v.edge = edge; save(); const E = outer(); if (E && E.tabs) { pushUndo(); E.tabs.edge = edge; E.tabs.xs = layoutXs(E.tabs, kmm(), centreAlong(edge)); delete E._tsig; changed(); } panel(); draw(); }
  function reset() { T.v = Object.assign({}, STD); save(); const E = outer(); if (E && E.tabs) { pushUndo(); const c = cfgOf(); c.xs = layoutXs(c, kmm(), centreAlong(c.edge)); E.tabs = c; delete E._tsig; changed(); } panel(); toast('Reset to your standard: 10 × 4 mm tabs, 2 tabs, 35 mm gap, 0.15 × 0.8 mm bumps, 4 mm plywood, 10 × 3.9 mm slots, 0.1 mm kerf', 4000); }
  function removeTab() { const E = outer();
    if (T.slotPick >= 0 && S.paths[T.slotPick] && S.paths[T.slotPick].slot) { pushUndo(); S.paths.splice(T.slotPick, 1); T.slotPick = -1; changed(); panel(); toast('Slot removed - Undo brings it back'); return; }
    if (!E || !E.tabs) return; pushUndo(); if (T.pick >= 0) E.tabs.xs.splice(T.pick, 1); else E.tabs.xs = []; T.pick = -1; delete E._tsig; changed(); panel(); toast('Tab removed - Undo brings it back'); }
  function setBody() { const b = body(); if (!b || !b.h) return; pushUndo(); S.widthMm = S.widthMm * T.v.body / b.h; syncInputs(); changed(); panel(); toast(`Design resized: the body is now ${T.v.body} mm tall`); }

  function addSlot(u) { const k = kmm(), p = { n: [], z: true, cut: true, uc: 1, slot: { cx: u[0], cy: u[1], w: T.v.slotW, h: T.v.slotH, rot: 0, kerf: T.v.kerf } }; slotShape(p, k);
    pushUndo(); S.paths.push(p); S.cutOn = true; T.slotPick = S.paths.length - 1; T.pick = -1; T.mode = 'slot'; sync(); changed(); panel(); syncInputs();
    toast(`Slot added: ${T.v.slotW} × ${T.v.slotH} mm. Drag to move it, or tap Turn slot 90°.`, 3500); }
  function rotateSlot() { const p = T.slotPick >= 0 ? S.paths[T.slotPick] : slots().length ? slots()[slots().length - 1][0] : null;
    if (!p || !p.slot) { toast('Tap a slot first, then Turn slot 90°'); return; }
    pushUndo(); p.slot.rot = p.slot.rot === 90 ? 0 : 90; T.slotPick = S.paths.indexOf(p); delete p._tsig; sync(); changed(); panel(); toast(p.slot.rot === 90 ? 'Slot turned 90°' : 'Slot turned back'); }

  function boxes() { const E = outer(); if (!E || !E.tabs) return []; const k = kmm(), b = BZ.bbox([baseOf(E)]), t = E.tabs, kerf = t.kerf > 0 ? +t.kerf : 0, hw = (t.w + kerf) / 2 / k, edge = t.edge || 'bottom';
    return t.xs.map((c, i) => {
      if (edge === 'top') return { i, cx: c, x0: c - hw, x1: c + hw, y0: b.y0 - t.proj / k, y1: b.y0 + Math.max(2, t.proj) / k, edge };
      if (edge === 'left') return { i, cx: c, x0: b.x0 - t.proj / k, x1: b.x0 + Math.max(2, t.proj) / k, y0: c - hw, y1: c + hw, edge };
      if (edge === 'right') return { i, cx: c, x0: b.x1 - Math.max(2, t.proj) / k, x1: b.x1 + t.proj / k, y0: c - hw, y1: c + hw, edge };
      return { i, cx: c, x0: c - hw, x1: c + hw, y0: b.y1 - Math.max(2, t.proj) / k, y1: b.y1 + t.proj / k, edge };
    }); }
  function hit(u, tol) { return boxes().find(b => u[0] >= b.x0 - tol && u[0] <= b.x1 + tol && u[1] >= b.y0 - tol && u[1] <= b.y1 + tol) || null; }
  function hitSlot(u, tol) { let best = -1, bd = Infinity; for (const [p, i] of slots()) { const b = BZ.bbox([p]); if (!b) continue; const pad = tol, hitB = u[0] >= b.x0 - pad && u[0] <= b.x1 + pad && u[1] >= b.y0 - pad && u[1] <= b.y1 + pad;
      const d = Math.hypot(u[0] - p.slot.cx, u[1] - p.slot.cy); if (hitB && d < bd) { bd = d; best = i; } } return best; }

  function down(e, p, u, base) { const tol = (e && e.pointerType === 'mouse' ? 8 : 18) / view.s, h = hit(u, tol), E = outer(), si = hitSlot(u, tol);
    if (si >= 0) { T.slotPick = si; T.pick = -1; T.mode = 'slot'; panel(); draw(); return Object.assign(base, { tb: 'slotmove', i: si, c0: [S.paths[si].slot.cx, S.paths[si].slot.cy], snap: snap() }); }
    if (T.mode === 'slot' && T.slotPick < 0) return Object.assign(base, { tb: 'place-slot' });
    if (h && E) { T.pick = h.i; T.slotPick = -1; T.mode = 'tabs'; panel(); draw(); return Object.assign(base, { tb: 'move', i: h.i, x0: E.tabs.xs[h.i], snap: snap() }); }
    return Object.assign(base, { tb: 'tap', tx: view.tx, ty: view.ty }); }
  function move(g, p, u) { if (g.tb === 'tap') { view.tx = g.tx + p[0] - g.p0[0]; view.ty = g.ty + p[1] - g.p0[1]; draw(); return; }
    if (g.tb === 'slotmove') { const q = S.paths[g.i]; if (!q || !q.slot) return; q.slot.cx = g.c0[0] + u[0] - g.u0[0]; q.slot.cy = g.c0[1] + u[1] - g.u0[1]; slotShape(q, kmm()); draw(); return; }
    const E = outer(); if (!E || !E.tabs) return; E.tabs.xs[g.i] = g.x0 + ((E.tabs.edge === 'left' || E.tabs.edge === 'right') ? (u[1] - g.u0[1]) : (u[0] - g.u0[0])); delete E._tsig; sync(); draw(); }
  function up(g) { const E = outer();
    if (g.tb === 'slotmove') { if (g.moved) { undoSt.push(g.snap); redoSt = []; sync(); changed(); panel(); } return; }
    if (g.tb === 'place-slot') { if (!g.moved) addSlot(g.u0); return; }
    if (g.tb === 'move') { if (g.moved) { undoSt.push(g.snap); redoSt = []; if (E && E.tabs) { const x = E.tabs.xs[g.i]; E.tabs.xs.sort((a, b) => a - b); T.pick = E.tabs.xs.indexOf(x); } changed(); panel(); } return; }
    if (g.moved) return;
    if (T.mode === 'slot' && T.slotPick < 0) { addSlot(g.u0); return; }
    if (T.slotPick >= 0) { T.slotPick = -1; panel(); draw(); return; }
    if (T.pick >= 0) { T.pick = -1; panel(); draw(); return; }
    if (!E) { toast('Make the outer cut line first (Cut out tool › Outer cut), then add tabs.', 4000); return; }
    pushUndo(); if (!E.tabs) { E.tabs = cfgOf(); E.tabs.xs = []; } E.tabs.xs.push((E.tabs.edge === 'left' || E.tabs.edge === 'right') ? g.u0[1] : g.u0[0]); E.tabs.xs.sort((a, b) => a - b); T.pick = E.tabs.xs.length - 1; delete E._tsig; changed(); panel(); toast('Tab added on that edge - drag it to move it'); }

  function panel() { const box = $('tbBox'); if (!box) return; const pnl = box.closest('[data-opts]'); if (pnl) pnl.classList.toggle('tbon', T.on); document.querySelectorAll('[data-tabs]').forEach(x => x.classList.toggle('on', T.on)); if (!T.on) return;
    document.querySelectorAll('[data-shape],[data-hole]').forEach(x => x.classList.remove('on'));
    const E = outer(), t = E && E.tabs ? E.tabs : null, v = T.v, edge = (t && t.edge) || v.edge || 'bottom';
    for (const [id, key] of [['tbW', 'w'], ['tbP', 'proj'], ['tbN', 'n'], ['tbG', 'gap'], ['tbBh', 'bh'], ['tbBw', 'bw'], ['tbBody', 'body'], ['tbTh', 'thick'], ['tbKerf', 'kerf'], ['tbSW', 'slotW'], ['tbSH', 'slotH']]) {
      if (!$(id) || document.activeElement === $(id)) continue; const fromTab = t && key in t && key !== 'body' && key !== 'thick' && key !== 'slotW' && key !== 'slotH'; $(id).value = fromTab ? t[key] : v[key]; }
    if ($('tbBump')) $('tbBump').checked = t ? !!t.bump : v.bump;
    document.querySelectorAll('[data-tbedge]').forEach(b => b.classList.toggle('on', b.dataset.tbedge === edge));
    if (T.pick >= 0 && !(t && T.pick < t.xs.length)) T.pick = -1;
    if (T.slotPick >= 0 && !(S.paths[T.slotPick] && S.paths[T.slotPick].slot)) T.slotPick = -1;
    const nSlot = slots().length;
    if ($('tbDel')) { $('tbDel').textContent = T.slotPick >= 0 ? '🗑 Remove this slot' : T.pick >= 0 ? '🗑 Remove this tab' : (nSlot && !t) ? '🗑 Remove all slots' : '🗑 Remove all tabs'; $('tbDel').disabled = !((t && t.xs.length) || nSlot); }
    const kerf = t && t.kerf != null ? t.kerf : v.kerf, w = t ? t.w : v.w, sh = v.slotH, sw = v.slotW;
    if ($('tbKerfHint')) $('tbKerfHint').innerHTML = kerf > 0 ? `Kerf is how much wood the laser burns away. Tabs are cut <b>${r2(w + kerf)} mm</b> wide so they finish at <b>${r2(w)} mm</b>. Slots are cut <b>${r2(Math.max(0.3, sw - kerf))} × ${r2(Math.max(0.3, sh - kerf))} mm</b> so they finish at <b>${r2(sw)} × ${r2(sh)} mm</b>.` : 'Kerf 0: the laser cuts on the drawn line, so the tab comes out a hair smaller and the slot a hair bigger (by your beam width, about 0.1–0.2 mm).';
    const b = body(), bh = b ? b.h : 0, tp = t ? t.proj : v.proj, okH = Math.abs(bh - v.body) < 0.05;
    const edgeWord = edge;
    $('tbHint').innerHTML = !E ? '<span class="warn">No outer cut line yet - make it first (Cut out tool › Outer cut).</span>'
      : T.slotPick >= 0 ? `<b>Slot picked</b> (${r2(S.paths[T.slotPick].slot.w)} × ${r2(S.paths[T.slotPick].slot.h)} mm). Drag to move it, or tap <b>Turn slot 90°</b>. Tap empty space to let go.`
      : T.mode === 'slot' ? '<b>Add a slot:</b> tap the design where the slot should go. It is sized to match your tab width and plywood thickness.'
      : t && t.xs.length ? (T.pick >= 0 ? `<b>Tab ${T.pick + 1} picked.</b> Drag it along the ${edgeWord} edge, or remove it. Tap empty space to let go.` : `<b>${t.xs.length} tab${t.xs.length > 1 ? 's' : ''}</b> on the ${edgeWord} edge. Tap a tab to pick it, drag to move it, or tap the edge to add one.`) + (nSlot ? ` · ${nSlot} slot${nSlot > 1 ? 's' : ''}.` : '') + (T.bad.length ? ` <span class="warn">${T.bad.length} tab${T.bad.length > 1 ? 's' : ''} did not fit on that edge.</span>` : '')
      : `Tap <b>▭ Standard tabs</b> to put your standard tabs on the ${edgeWord} edge, or <b>Add a slot</b> and tap the design.`;
    if ($('tbBodyInfo')) $('tbBodyInfo').innerHTML = b ? `Door body: <b>${r2(b.w)} × ${r2(bh)} mm</b>${t && t.xs.length && (edge === 'bottom' || edge === 'top') ? ` · with tabs ${r2(bh + tp)} mm tall` : ''}.${okH ? '' : ` <span class="warn">Your standard body is ${v.body} mm tall - tap Set body height.</span>`}` : ''; }

  function paint(px) { const k = kmm(), bs = boxes(), E = outer(), t = E && E.tabs;
    const lab = (txt, x, y, pk) => { ctx.font = `bold ${11 * px}px sans-serif`; ctx.textAlign = 'center'; ctx.textBaseline = 'top'; const w = ctx.measureText(txt).width; ctx.fillStyle = pk ? '#1971c2' : 'rgba(20,20,20,0.78)'; ctx.fillRect(x - w / 2 - 3 * px, y, w + 6 * px, 14 * px); ctx.fillStyle = '#fff'; ctx.fillText(txt, x, y + 1 * px); };
    bs.forEach(b => { const pk = T.on && b.i === T.pick; if (pk) { ctx.strokeStyle = '#1971c2'; ctx.lineWidth = 2.4 * px; ctx.strokeRect(b.x0, b.y0, b.x1 - b.x0, b.y1 - b.y0); } lab(`${t.w}×${t.proj}`, (b.x0 + b.x1) / 2, Math.max(b.y0, b.y1) + 3 * px, pk); });
    if (t && (t.edge === 'bottom' || !t.edge || t.edge === 'top')) {
      for (let i = 1; i < bs.length; i++) { const kerfG = (t.kerf > 0 ? +t.kerf : 0), g = Math.abs(bs[i].x0 - bs[i - 1].x1) * k + kerfG; ctx.strokeStyle = 'rgba(25,113,194,0.7)'; ctx.lineWidth = px; const y = (bs[i].y0 + bs[i].y1) / 2; ctx.beginPath(); ctx.moveTo(Math.max(bs[i - 1].x1, bs[i].x0) === bs[i].x0 ? bs[i - 1].x1 : bs[i].x1, y); ctx.lineTo(Math.min(bs[i].x0, bs[i - 1].x1) === bs[i].x0 ? bs[i].x0 : bs[i - 1].x0, y); ctx.stroke(); lab(`${r2(g)} mm`, (bs[i - 1].x1 + bs[i].x0) / 2, y + 2 * px, false); }
    }
    for (const [p, i] of slots()) { const b = BZ.bbox([p]), pk = T.on && i === T.slotPick; if (!b) continue;
      if (pk) { ctx.strokeStyle = '#1971c2'; ctx.lineWidth = 2.4 * px; ctx.strokeRect(b.x0, b.y0, b.w, b.h); }
      lab(`${r2(p.slot.w)}×${r2(p.slot.h)}`, p.slot.cx, b.y1 + 3 * px, pk); } }

  function setOn(v) { T.on = !!v; if (!T.on) { T.pick = -1; T.slotPick = -1; T.mode = 'tabs'; } if (T.on && window.HH && HH.on) HH.setOn(false); if (T.on && window.T2) T2.SH.cur = null; panel(); draw(); }
  function wire() { if (!$('tbBox')) return;
    document.querySelectorAll('[data-tabs]').forEach(b => b.onclick = () => setOn(true));
    document.querySelectorAll('[data-shape],[data-hole]').forEach(b => b.addEventListener('click', () => { if (T.on) { T.on = false; T.pick = -1; T.slotPick = -1; panel(); } if (b.dataset.hole && window.HH) HH.setOn(true); }));
    for (const [id, key] of [['tbW', 'w'], ['tbP', 'proj'], ['tbN', 'n'], ['tbG', 'gap'], ['tbBh', 'bh'], ['tbBw', 'bw'], ['tbBody', 'body'], ['tbTh', 'thick'], ['tbKerf', 'kerf'], ['tbSW', 'slotW'], ['tbSH', 'slotH']]) {
      if ($(id)) $(id).addEventListener('change', () => setVal(key, +$(id).value)); }
    if ($('tbBump')) $('tbBump').addEventListener('change', () => setVal('bump', $('tbBump').checked));
    document.querySelectorAll('[data-tbedge]').forEach(b => b.onclick = () => setEdge(b.dataset.tbedge));
    $('tbStd').onclick = standard; $('tbReset').onclick = reset; $('tbDel').onclick = removeTab; $('tbSetBody').onclick = setBody; $('tbDone').onclick = () => { setOn(false); setTool('sel'); };
    if ($('tbAddSlot')) $('tbAddSlot').onclick = () => { T.mode = 'slot'; T.slotPick = -1; T.pick = -1; panel(); draw(); toast('Tap the design where the slot should go', 2500); };
    if ($('tbRotSlot')) $('tbRotSlot').onclick = rotateSlot;
    panel(); }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', wire); else wire();
  return { T, STD, get on() { return T.on; }, sync, down, move, up, paint, panel, setOn, outer, boxes, standard, body, merge, addSlot, rotateSlot, slots, hitSlot };
})();
