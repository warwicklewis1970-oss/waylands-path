// Waylands Path v3.2 - Line tool (guided: two points, straight or arch, breaks, confirm) and Shapes tool
// (ellipse / polygons / star, drag to draw, handles to stretch, move and turn, straight cut-off line like Wayland Forge).
// Uses the app's globals (S, view, ctx, draw, pushUndo, changed, toast, hitPath, hitNode, snapPoint, tolPx, replacePath, setTool).
'use strict';
window.T2 = (() => {
  const $$ = id => document.getElementById(id), hyp = Math.hypot, D2R = Math.PI / 180;
  // ================= Line tool =================
  const LN = { mode: 'new', step: 'a', a: null, b: null, arch: false, h: null, gaps: [], pend: null, pi: -1, base: null };
  function lnReset(keepMode) { const m = LN.mode; Object.assign(LN, { step: m === 'break' ? 'pick' : 'a', a: null, b: null, arch: false, h: null, gaps: [], pend: null, pi: -1, base: null }); if (!keepMode) LN.mode = 'new'; lnUI(); draw(); }
  // the working line as a path (new line) or the picked existing line
  function lnPath() { if (LN.mode === 'break') return LN.base;
    if (!LN.a || !LN.b) return null; const A = BZ.node(LN.a[0], LN.a[1]), B = BZ.node(LN.b[0], LN.b[1]);
    if (LN.arch && LN.h) { const m = [(LN.a[0] + LN.b[0]) / 2, (LN.a[1] + LN.b[1]) / 2], q = [2 * LN.h[0] - m[0], 2 * LN.h[1] - m[1]]; // quadratic through the handle, as a cubic
      if (hyp(LN.h[0] - m[0], LN.h[1] - m[1]) > 1e-6) { A.o = [LN.a[0] + (q[0] - LN.a[0]) * 2 / 3, LN.a[1] + (q[1] - LN.a[1]) * 2 / 3]; B.i = [LN.b[0] + (q[0] - LN.b[0]) * 2 / 3, LN.b[1] + (q[1] - LN.b[1]) * 2 / 3]; } }
    return { n: [A, B], z: false }; }
  const pos = r => r.k + r.t;
  function onLine(p, u) { const r = BZ.nearest(p, u); if (!r) return null; r.t = BZ.paramAt(p, r.k, r.pt, r.t); r.pt = BZ.pointAt(p, r.k, r.t); return r; }
  // optional: gap ends move to where the line crosses the first/last other line inside the gap
  function edgeSnap(p, g) { const lo = pos(g[0]), hi = pos(g[1]), cs = [];
    S.paths.forEach((q, qi) => { if (LN.mode === 'break' && qi === LN.pi) return; for (const c of BZ.pathCrossings(p, q)) { const t = BZ.paramAt(p, c.k, c.pt, c.t), ps = c.k + t; if (ps > lo + 1e-4 && ps < hi - 1e-4) cs.push({ k: c.k, t, pt: BZ.pointAt(p, c.k, t), ps }); } });
    if (cs.length < 2) return g; cs.sort((x, y) => x.ps - y.ps); return [cs[0], cs[cs.length - 1]]; }
  function addGapPoint(u, e) { const p = lnPath(); if (!p) return; const r = onLine(p, u); if (!r || r.d > tolPx(e) * 1.6) { toast('Tap on the orange line'); return; }
    if (!LN.pend) { LN.pend = r; } else { let g = pos(r) < pos(LN.pend) ? [r, LN.pend] : [LN.pend, r]; if (Math.abs(pos(g[1]) - pos(g[0])) < 1e-4) { toast('Tap a second, different point'); return; }
      if ($$('lnEdge').checked) g = edgeSnap(p, g); LN.gaps.push(g); LN.pend = null; } lnUI(); draw(); }
  // cut the gaps out; each gap is found again by its end points so several gaps on one line work
  function applyGaps(p0) { let pieces = [BZ.clone(p0)];
    for (const g of LN.gaps.slice().sort((x, y) => pos(y[0]) - pos(x[0]))) {
      let done = false; for (let i = 0; i < pieces.length && !done; i++) { const q = pieces[i], ra = onLine(q, g[0].pt), rb = onLine(q, g[1].pt); if (!ra || !rb || ra.d > 0.05 || rb.d > 0.05) continue;
        const [x, y] = pos(ra) <= pos(rb) ? [ra, rb] : [rb, ra]; if (pos(y) - pos(x) < 1e-6) continue; pieces.splice(i, 1, ...BZ.cutOut(q, x.k, x.t, y.k, y.t)); done = true; } }
    return pieces; }
  function lnConfirm() { const p = lnPath(); if (!p) return; pushUndo(); const pieces = applyGaps(p);
    if (LN.mode === 'break') replacePath(LN.pi, pieces); else { const at = S.paths.length; S.paths.push(p); replacePath(at, pieces); }
    const n = LN.gaps.length; changed(); toast(n ? `Line drawn with ${n} break${n > 1 ? 's' : ''} - the laser is off across ${n > 1 ? 'each gap' : 'the gap'}` : 'Line drawn'); const m = LN.mode; lnReset(true); LN.mode = m; LN.step = m === 'break' ? 'pick' : 'a'; lnUI(); }
  function lnBack() { if (LN.step === 'confirm') LN.step = 'gaps';
    else if (LN.step === 'gaps') { if (LN.pend) LN.pend = null; else if (LN.gaps.length) LN.gaps.pop(); else if (LN.mode === 'break') { LN.step = 'pick'; LN.pi = -1; LN.base = null; } else LN.step = 'shape'; }
    else if (LN.step === 'shape') { LN.step = 'a'; LN.b = null; LN.arch = false; LN.h = null; }
    else if (LN.step === 'a' && LN.a) LN.a = null; lnUI(); draw(); }
  const LSTEPS = { a: 'Step 1 of 4', shape: 'Step 2 of 4', gaps: 'Step 3 of 4', confirm: 'Step 4 of 4', pick: 'Step 1 of 3' };
  function lnUI() { const el = $$('lnHint'); if (!el) return; const nb = LN.gaps.length, br = LN.mode === 'break'; let txt, btns = [];
    if (LN.step === 'pick') { txt = 'Tap the line you want to put a break in.'; }
    else if (LN.step === 'a') { txt = !LN.a ? 'Tap where the line starts (it snaps to points and lines).' : 'Now tap where the line ends.'; if (LN.a) btns.push(['back', '↶ Back']); }
    else if (LN.step === 'shape') { txt = LN.arch ? 'Drag the round handle in the middle to bend it. Then Next.' : 'Keep it straight, or tap Arch to bend it. Then Next.'; btns.push(['back', '↶ Back'], ['straight', '／ Straight', !LN.arch], ['arch', '◠ Arch', LN.arch], ['next', 'Next ▶', 0, 1]); }
    else if (LN.step === 'gaps') { txt = LN.pend ? 'Now tap where the line starts again.' : nb ? `${nb} break${nb > 1 ? 's' : ''} added. Tap two more points for another break, or Next.` : 'Tap the point where the line should stop, then where it starts again. Or skip this.';
      btns.push(['back', '↶ Back'], ['next', nb ? 'Next ▶' : 'No breaks ▶', 0, 1]); }
    else if (LN.step === 'confirm') { txt = nb ? `Ready: the line in ${nb + 1} pieces with ${nb} gap${nb > 1 ? 's' : ''} (dashed). The laser stays off across the gaps.` : 'Ready: one line, no breaks.'; btns.push(['back', '↶ Back'], ['ok', '✓ Confirm', 0, 1]); }
    if (LN.step !== 'pick' && !(LN.step === 'a' && !LN.a)) btns.push(['cancel', '✕ Cancel']);
    el.innerHTML = `<b>${br && LN.step !== 'pick' ? LSTEPS[LN.step].replace(' of 4', ' of 3').replace('Step 3', 'Step 2').replace('Step 4', 'Step 3') : LSTEPS[LN.step]}</b> · ${txt}`;
    $$('lnBtns').innerHTML = btns.map(([a, l, on, acc]) => `<button data-ln="${a}" class="${on ? 'on' : ''}${acc ? ' accent' : ''}">${l}</button>`).join('');
    $$('lnNew').classList.toggle('on', !br); $$('lnBrk').classList.toggle('on', br); }
  function lnAction(a) { if (a === 'back') lnBack(); else if (a === 'cancel') lnReset(true);
    else if (a === 'straight') { LN.arch = false; lnUI(); draw(); } else if (a === 'arch') { LN.arch = true; if (!LN.h) { const m = [(LN.a[0] + LN.b[0]) / 2, (LN.a[1] + LN.b[1]) / 2], L = hyp(LN.b[0] - LN.a[0], LN.b[1] - LN.a[1]) || 1; LN.h = [m[0] + (LN.b[1] - LN.a[1]) / L * L * 0.25, m[1] - (LN.b[0] - LN.a[0]) / L * L * 0.25]; } lnUI(); draw(); }
    else if (a === 'next') { LN.step = LN.step === 'shape' ? 'gaps' : 'confirm'; LN.pend = null; lnUI(); draw(); } else if (a === 'ok') lnConfirm(); }
  function startBreak(pi) { LN.mode = 'break'; LN.step = 'gaps'; LN.pi = pi; LN.base = BZ.clone(S.paths[pi]); LN.gaps = []; LN.pend = null; lnUI(); draw(); }
  // ================= Shapes tool =================
  const SH = { kind: 'ellipse', n: 6, even: false, cur: null, trim: { on: false, ang: 0, pos: 0, keep: 1 }, open: false, asCut: false };
  // outline in a -1..1 box (closed path); polygons fill the box so the drag box is the shape box
  function unitShape() { if (SH.kind === 'ellipse') { const k = 0.5522847498, P = [[1, 0], [0, 1], [-1, 0], [0, -1]], n = P.map(([x, y]) => { const nd = BZ.node(x, y); nd.o = [x - y * k, y + x * k]; nd.i = [x + y * k, y - x * k]; nd.s = 1; return nd; }); return { n, z: true }; }
    const m = SH.kind === 'star' ? SH.n * 2 : SH.n, pts = []; for (let i = 0; i < m; i++) { const a = -Math.PI / 2 + 2 * Math.PI * i / m + (SH.kind !== 'star' && m % 2 === 0 ? Math.PI / m : 0), r = SH.kind === 'star' && i % 2 ? 0.45 : 1; pts.push([Math.cos(a) * r, Math.sin(a) * r]); }
    const xs = pts.map(q => q[0]), ys = pts.map(q => q[1]), x0 = Math.min(...xs), x1 = Math.max(...xs), y0 = Math.min(...ys), y1 = Math.max(...ys);
    return BZ.fromPoints(pts.map(([x, y]) => [((x - x0) / (x1 - x0)) * 2 - 1, ((y - y0) / (y1 - y0)) * 2 - 1]), true); }
  const tNorm = () => { const a = SH.trim.ang * D2R; return [-Math.sin(a), Math.cos(a)]; }, tDir = () => { const a = SH.trim.ang * D2R; return [Math.cos(a), Math.sin(a)]; };
  const side = q => { const nv = tNorm(); return SH.trim.keep * (nv[0] * q[0] + nv[1] * q[1] - SH.trim.pos / 100); };
  // cut the unit outline with the trim line; keep one side; the straight edge closes it (or open arcs only)
  function trimUnit(p) { const nv = tNorm(), dv = tDir(), d = SH.trim.pos / 100, c = [nv[0] * d, nv[1] * d], A = [c[0] - dv[0] * 5, c[1] - dv[1] * 5], B = [c[0] + dv[0] * 5, c[1] + dv[1] * 5];
    const cs = BZ.crossings(p, A, B).map(x => ({ k: x.k, t: BZ.paramAt(p, x.k, x.pt, x.t) }));
    if (cs.length < 2) return side(BZ.pointAt(p, 0, 0.5)) <= 0 ? [p] : [];
    const q = BZ.clone(p), byK = new Map(); for (const x of cs) { if (!byK.has(x.k)) byK.set(x.k, []); byK.get(x.k).push(x.t); }
    for (const k of [...byK.keys()].sort((a, b) => b - a)) { const ts = [...new Set(byK.get(k).map(t => +t.toFixed(9)))].sort((a, b) => b - a); let top = 1;
      for (const t of ts) { if (t > 1 - 1e-6) { q.n[(k + 1) % q.n.length].cx = 1; continue; } if (t < 1e-6) { q.n[k].cx = 1; continue; } const j = BZ.insertNode(q, k, t / top); q.n[j].cx = 1; q.n[j].s = 0; top = t; } }
    const N = q.n, ci = N.map((nd, i) => nd.cx ? i : -1).filter(i => i >= 0); if (ci.length < 2) return side(BZ.pointAt(p, 0, 0.5)) <= 0 ? [p] : [];
    const kept = []; for (let a = 0; a < ci.length; a++) { const i0 = ci[a], i1 = ci[(a + 1) % ci.length], nodes = []; let i = i0; for (;;) { nodes.push(BZ.clone([N[i]])[0]); if (i === i1 && nodes.length > 1) break; i = (i + 1) % N.length; }
      const pc = { n: nodes, z: false }; pc.n[0].i = null; pc.n[pc.n.length - 1].o = null; pc.n[0].s = pc.n[pc.n.length - 1].s = 0; const mid = BZ.pointAt(pc, Math.floor((pc.n.length - 1) / 2), pc.n.length === 2 ? 0.5 : (pc.n.length % 2 ? 0 : 0.5));
      if (side(mid) <= 1e-9) kept.push(pc); }
    for (const pc of kept) for (const nd of pc.n) delete nd.cx; if (!kept.length) return [];
    if (SH.open) return kept; const n = []; for (const pc of kept) n.push(...pc.n); return [{ n, z: true }]; }
  function toWorld(p) { const c = SH.cur, ca = Math.cos(c.rot), sa = Math.sin(c.rot), W = ([x, y]) => { const lx = x * c.rx, ly = y * c.ry; return [c.cx + lx * ca - ly * sa, c.cy + lx * sa + ly * ca]; };
    for (const nd of p.n) { const w = W([nd.x, nd.y]); if (nd.i) nd.i = W(nd.i); if (nd.o) nd.o = W(nd.o); nd.x = w[0]; nd.y = w[1]; }
    for (let j = p.n.length - 1; j > 0; j--) { const a = p.n[j - 1], b = p.n[j]; if (hyp(a.x - b.x, a.y - b.y) < 1e-6) { a.o = b.o; p.n.splice(j, 1); } }
    if (p.z && p.n.length > 1) { const a = p.n[p.n.length - 1], b = p.n[0]; if (hyp(a.x - b.x, a.y - b.y) < 1e-6) { b.i = a.i; p.n.pop(); } } return p; }
  function shapePaths() { if (!SH.cur) return []; let ps = [unitShape()]; if (SH.trim.on) ps = trimUnit(ps[0]); return ps.map(toWorld); }
  const L2W = ([x, y]) => { const c = SH.cur, ca = Math.cos(c.rot), sa = Math.sin(c.rot), lx = x * c.rx, ly = y * c.ry; return [c.cx + lx * ca - ly * sa, c.cy + lx * sa + ly * ca]; };
  const W2N = u => { const c = SH.cur, ca = Math.cos(-c.rot), sa = Math.sin(-c.rot), dx = u[0] - c.cx, dy = u[1] - c.cy; return [(dx * ca - dy * sa) / (c.rx || 1e-9), (dx * sa + dy * ca) / (c.ry || 1e-9)]; };
  function handles() { if (!SH.cur) return []; const c = SH.cur, px = 1 / view.s, H = [];
    for (const [x, y] of [[1, 1], [-1, 1], [1, -1], [-1, -1]]) H.push({ id: 'corner', at: L2W([x, y]), x, y });
    for (const [x, y] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) H.push({ id: x ? 'sx' : 'sy', at: L2W([x, y]), x, y });
    const top = L2W([0, -1]), up = [Math.sin(c.rot), -Math.cos(c.rot)]; H.push({ id: 'rot', at: [top[0] + up[0] * 34 * px, top[1] + up[1] * 34 * px], base: top });
    H.push({ id: 'move', at: [c.cx, c.cy] });
    if (SH.trim.on) { const nv = tNorm(), dv = tDir(), d = SH.trim.pos / 100, c0 = [nv[0] * d, nv[1] * d]; H.push({ id: 'tpos', at: L2W(c0) }); H.push({ id: 'tang', at: L2W([c0[0] + dv[0] * 0.75, c0[1] + dv[1] * 0.75]) }); }
    return H; }
  function hitHandleSH(u, tol) { let best = null; for (const h of handles()) { const d = hyp(h.at[0] - u[0], h.at[1] - u[1]); if (d < tol * (h.id === 'move' ? 1 : 1.25) && (!best || d < best.d)) best = { h, d }; } return best && best.h; }
  function insideSH(u) { const q = W2N(u); return Math.abs(q[0]) <= 1 && Math.abs(q[1]) <= 1; }
  function shUI() { const el = $$('shHint'); if (!el) return;
    el.innerHTML = SH.cur ? '<b>Shape</b> · Drag the square handles to stretch, ↻ to turn, the middle to move. Tick Cut-off line for a flat side. Then ✓ Done.' : '<b>Shape</b> · Pick a shape, then press and drag on the design to draw it.';
    document.querySelectorAll('[data-shape]').forEach(b => b.classList.toggle('on', b.dataset.shape === (SH.kind === 'ellipse' ? 'ellipse' : SH.kind === 'star' ? 'star' : 'p' + SH.n)));
    $$('shSides').value = SH.n; $$('shTrimOn').checked = SH.trim.on; $$('shTrimBox').hidden = !SH.trim.on; $$('shAng').value = SH.trim.ang; $$('shAngOut').textContent = Math.round(SH.trim.ang) + '°';
    $$('shPos').value = SH.trim.pos; $$('shPosOut').textContent = Math.round(SH.trim.pos) + '%'; $$('shOpen').checked = SH.open; $$('shCut').checked = SH.asCut; $$('shEven').checked = SH.even;
    $$('shDone').disabled = !SH.cur; $$('shCancel').disabled = !SH.cur; }
  function shDone() { if (!SH.cur) return; const ps = shapePaths(); if (!ps.length) { toast('The cut-off line removes the whole shape - move it or flip the side'); return; }
    pushUndo(); for (const p of ps) { if (SH.asCut) p.cut = true; S.paths.push(p); } if (SH.asCut && !S.cutOn) { S.cutOn = true; const cb = $$('cutOn'); if (cb) cb.checked = true; }
    SH.cur = null; changed(); shUI(); toast(SH.asCut ? 'Shape added as a cut line (red)' : 'Shape added - use Points to fine-tune it'); }
  // ================= gestures =================
  function down(e, p, u, base) { const tol = tolPx(e);
    if (tool === 'shapes') { if (SH.cur) { const h = hitHandleSH(u, tol) || (insideSH(u) ? { id: 'move' } : null);
        if (h) { const keep = JSON.parse(JSON.stringify({ c: SH.cur, t: SH.trim })); return Object.assign(base, { t2: 'shh', h, c0: Object.assign({}, SH.cur), restore: () => { SH.cur = keep.c; SH.trim = keep.t; shUI(); draw(); } }); }
        return Object.assign(base, { t2: 'pan', tx: view.tx, ty: view.ty }); }
      return Object.assign(base, { t2: 'shdraw', restore: () => { SH.cur = null; shUI(); draw(); } }); }
    // line tool
    if (LN.step === 'shape') { for (const [k, q] of [['h', LN.arch ? LN.h : null], ['a', LN.a], ['b', LN.b]]) if (q && hyp(q[0] - u[0], q[1] - u[1]) < tol * 1.3) { const keep = { a: LN.a.slice(), b: LN.b.slice(), h: LN.h && LN.h.slice() }; return Object.assign(base, { t2: 'lnh', which: k, restore: () => { Object.assign(LN, keep); draw(); } }); } }
    return Object.assign(base, { t2: 'tap', tx: view.tx, ty: view.ty }); }
  function move(g, p, u) { if (g.t2 === 'pan' || g.t2 === 'tap') { view.tx = g.tx + p[0] - g.p0[0]; view.ty = g.ty + p[1] - g.p0[1]; draw(); return; }
    if (g.t2 === 'lnh') { if (g.which === 'h') LN.h = u.slice(); else { const m0 = [(LN.a[0] + LN.b[0]) / 2, (LN.a[1] + LN.b[1]) / 2]; LN[g.which] = u.slice(); if (LN.arch && LN.h) { const m1 = [(LN.a[0] + LN.b[0]) / 2, (LN.a[1] + LN.b[1]) / 2]; LN.h = [LN.h[0] + m1[0] - m0[0], LN.h[1] + m1[1] - m0[1]]; } } draw(); return; }
    if (g.t2 === 'shdraw') { const a = g.u0; let w = Math.abs(u[0] - a[0]) / 2, h = Math.abs(u[1] - a[1]) / 2; if (SH.even) w = h = Math.max(w, h);
      SH.cur = { cx: a[0] + Math.sign(u[0] - a[0] || 1) * w, cy: a[1] + Math.sign(u[1] - a[1] || 1) * h, rx: Math.max(w, 0.5), ry: Math.max(h, 0.5), rot: 0 }; shUI(); draw(); return; }
    if (g.t2 === 'shh') { const c = SH.cur, c0 = g.c0, id = g.h.id;
      if (id === 'move') { c.cx = c0.cx + u[0] - g.u0[0]; c.cy = c0.cy + u[1] - g.u0[1]; }
      else if (id === 'rot') { let a = Math.atan2(u[1] - c.cy, u[0] - c.cx) + Math.PI / 2; const deg = a / D2R, sn = Math.round(deg / 15) * 15; if (Math.abs(deg - sn) < 3) a = sn * D2R; c.rot = a; }
      else if (id === 'corner' || id === 'sx' || id === 'sy') { const ca = Math.cos(-c.rot), sa = Math.sin(-c.rot), dx = u[0] - c.cx, dy = u[1] - c.cy, lx = Math.abs(dx * ca - dy * sa), ly = Math.abs(dx * sa + dy * ca);
        if (id !== 'sy') c.rx = Math.max(0.5, lx); if (id !== 'sx') c.ry = Math.max(0.5, ly); if (SH.even) { const r = id === 'sx' ? c.rx : id === 'sy' ? c.ry : Math.max(c.rx, c.ry); c.rx = c.ry = r; } }
      else if (id === 'tpos') { const q = W2N(u), nv = tNorm(); SH.trim.pos = Math.max(-95, Math.min(95, (nv[0] * q[0] + nv[1] * q[1]) * 100)); }
      else if (id === 'tang') { const q = W2N(u), nv = tNorm(), d = SH.trim.pos / 100, c0n = [nv[0] * d, nv[1] * d]; let a = Math.atan2(q[1] - c0n[1], q[0] - c0n[0]) / D2R; const sn = Math.round(a / 15) * 15; if (Math.abs(a - sn) < 4) a = sn; if (a > 180) a -= 360;
        // keep the line through the same point: new pos = n'.c0
        SH.trim.ang = a; const n2 = tNorm(); SH.trim.pos = Math.max(-95, Math.min(95, (n2[0] * c0n[0] + n2[1] * c0n[1]) * 100)); }
      shUI(); draw(); } }
  function up(g, e) { if (g.t2 === 'pan') return; if (g.t2 === 'tap') { if (!g.moved) tap(g.u0, e); return; }
    if (g.t2 === 'shdraw' && !g.moved) { const r = 60 / view.s; SH.cur = { cx: g.u0[0], cy: g.u0[1], rx: r, ry: SH.even || SH.kind !== 'ellipse' ? r : r * 0.7, rot: 0 }; }
    shUI(); draw(); }
  function tap(u, e) { const tol = tolPx(e);
    if (LN.step === 'pick') { const h = hitPath(u, tol); if (!h) { toast('Tap right on a line'); return; } startBreak(h.pi); return; }
    if (LN.step === 'a') { const q = snapPoint(u, tol, false); if (!LN.a) LN.a = q; else { if (hyp(q[0] - LN.a[0], q[1] - LN.a[1]) < 1e-6) return; LN.b = q; LN.step = 'shape'; } lnUI(); draw(); return; }
    if (LN.step === 'gaps') addGapPoint(u, e); }
  // ================= drawing =================
  function pathD(p) { const n = p.n; ctx.moveTo(n[0].x, n[0].y); for (let k = 0; k < BZ.nseg(p); k++) { const s = BZ.seg(p, k); if (s.line) ctx.lineTo(s.b.x, s.b.y); else ctx.bezierCurveTo(s.C[1][0], s.C[1][1], s.C[2][0], s.C[2][1], s.b.x, s.b.y); } if (p.z) ctx.closePath(); }
  function subPts(p, a, b) { const out = [], k0 = Math.floor(pos(a)), steps = 48; for (let i = 0; i <= steps; i++) { const ps = pos(a) + (pos(b) - pos(a)) * i / steps; let k = Math.min(Math.floor(ps), BZ.nseg(p) - 1), t = ps - k; if (k < 0) { k = 0; t = 0; } out.push(BZ.pointAt(p, k, t)); } void k0; return out; }
  function dot(q, r, fill) { ctx.fillStyle = fill; ctx.beginPath(); ctx.arc(q[0], q[1], r, 0, 7); ctx.fill(); ctx.strokeStyle = '#fff'; ctx.lineWidth = r * 0.35; ctx.stroke(); }
  function paint(px) {
    if (tool === 'line') { const p = lnPath();
      if (p) { ctx.strokeStyle = '#e8590c'; ctx.lineWidth = 3 * px; ctx.beginPath(); pathD(p); ctx.stroke();
        for (const g of LN.gaps) { const pts = subPts(p, g[0], g[1]); ctx.strokeStyle = '#fff'; ctx.lineWidth = 5 * px; ctx.beginPath(); pts.forEach((q, i) => i ? ctx.lineTo(q[0], q[1]) : ctx.moveTo(q[0], q[1])); ctx.stroke();
          ctx.strokeStyle = '#c92a2a'; ctx.lineWidth = 1.6 * px; ctx.setLineDash([5 * px, 4 * px]); ctx.stroke(); ctx.setLineDash([]); dot(g[0].pt, 5 * px, '#c92a2a'); dot(g[1].pt, 5 * px, '#c92a2a'); }
        if (LN.pend) dot(LN.pend.pt, 6 * px, '#c92a2a'); }
      if (LN.mode === 'new') { if (LN.a) dot(LN.a, 6 * px, '#1971c2'); if (LN.b) dot(LN.b, 6 * px, '#1971c2'); }
      if (LN.step === 'shape' && LN.arch && LN.h) { ctx.strokeStyle = 'rgba(25,113,194,0.5)'; ctx.lineWidth = px; ctx.setLineDash([4 * px, 4 * px]); ctx.beginPath(); ctx.moveTo((LN.a[0] + LN.b[0]) / 2, (LN.a[1] + LN.b[1]) / 2); ctx.lineTo(LN.h[0], LN.h[1]); ctx.stroke(); ctx.setLineDash([]); dot(LN.h, 9 * px, '#e8590c'); } }
    if (tool === 'shapes' && SH.cur) { const ps = shapePaths(); ctx.strokeStyle = SH.asCut ? '#e03131' : '#1971c2'; ctx.lineWidth = (SH.asCut ? 3.2 : 2.4) * px; ctx.beginPath(); for (const p of ps) pathD(p); ctx.stroke();
      if (SH.trim.on) { const nv = tNorm(), dv = tDir(), d = SH.trim.pos / 100, c0 = [nv[0] * d, nv[1] * d], A = L2W([c0[0] - dv[0] * 1.5, c0[1] - dv[1] * 1.5]), B = L2W([c0[0] + dv[0] * 1.5, c0[1] + dv[1] * 1.5]);
        ctx.strokeStyle = '#c92a2a'; ctx.lineWidth = 1.4 * px; ctx.setLineDash([6 * px, 4 * px]); ctx.beginPath(); ctx.moveTo(A[0], A[1]); ctx.lineTo(B[0], B[1]); ctx.stroke(); ctx.setLineDash([]); }
      ctx.strokeStyle = 'rgba(25,113,194,0.35)'; ctx.lineWidth = px; ctx.setLineDash([4 * px, 4 * px]); ctx.beginPath(); const cs = [[-1, -1], [1, -1], [1, 1], [-1, 1]].map(L2W); cs.forEach((q, i) => i ? ctx.lineTo(q[0], q[1]) : ctx.moveTo(q[0], q[1])); ctx.closePath(); ctx.stroke(); ctx.setLineDash([]);
      for (const h of handles()) { const r = 6.5 * px;
        if (h.id === 'rot') { ctx.strokeStyle = '#1971c2'; ctx.lineWidth = px; ctx.beginPath(); ctx.moveTo(h.base[0], h.base[1]); ctx.lineTo(h.at[0], h.at[1]); ctx.stroke(); dot(h.at, 8 * px, '#2f9e44'); ctx.fillStyle = '#fff'; ctx.font = `${11 * px}px sans-serif`; ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.fillText('↻', h.at[0], h.at[1]); }
        else if (h.id === 'move') { dot(h.at, 7 * px, '#1971c2'); }
        else if (h.id === 'tpos' || h.id === 'tang') dot(h.at, 7.5 * px, '#c92a2a');
        else { ctx.fillStyle = '#fff'; ctx.strokeStyle = '#1971c2'; ctx.lineWidth = 1.6 * px; ctx.fillRect(h.at[0] - r, h.at[1] - r, 2 * r, 2 * r); ctx.strokeRect(h.at[0] - r, h.at[1] - r, 2 * r, 2 * r); } } } }
  // ================= wiring =================
  function onTool(t) { if (t !== 'line') { LN.mode = 'new'; lnReset(true); } if (t !== 'shapes') { SH.cur = null; } shUI(); lnUI(); }
  function wire() {
    $$('lnBtns').addEventListener('click', e => { const b = e.target.closest('[data-ln]'); if (b) lnAction(b.dataset.ln); });
    $$('lnNew').onclick = () => { LN.mode = 'new'; lnReset(true); }; $$('lnBrk').onclick = () => { LN.mode = 'break'; lnReset(true); };
    $$('lnOldSkip').onclick = () => setTool('skip');
    document.querySelectorAll('[data-shape]').forEach(b => b.onclick = () => { const v = b.dataset.shape; if (v === 'ellipse' || v === 'star') SH.kind = v; else { SH.kind = 'poly'; SH.n = +v.slice(1); } if (v === 'star' && SH.n < 5) SH.n = 5; shUI(); draw(); });
    $$('shSides').oninput = () => { const n = Math.round(+$$('shSides').value); if (n >= 3 && n <= 12) { SH.n = n; if (SH.kind === 'ellipse') SH.kind = 'poly'; shUI(); draw(); } };
    $$('shEven').onchange = () => { SH.even = $$('shEven').checked; if (SH.even && SH.cur) SH.cur.rx = SH.cur.ry = Math.max(SH.cur.rx, SH.cur.ry); shUI(); draw(); };
    $$('shTrimOn').onchange = () => { SH.trim.on = $$('shTrimOn').checked; shUI(); draw(); };
    document.querySelectorAll('[data-shtrim]').forEach(b => b.onclick = () => { const k = b.dataset.shtrim; SH.trim.on = true; SH.trim.pos = 0; if (k === 'bottom') { SH.trim.ang = 0; SH.trim.keep = 1; } else if (k === 'top') { SH.trim.ang = 0; SH.trim.keep = -1; } else if (k === 'left') { SH.trim.ang = 90; SH.trim.keep = 1; } else { SH.trim.ang = 90; SH.trim.keep = -1; } shUI(); draw(); });
    $$('shAng').oninput = () => { SH.trim.ang = +$$('shAng').value; shUI(); draw(); }; $$('shPos').oninput = () => { SH.trim.pos = +$$('shPos').value; shUI(); draw(); };
    $$('shFlip').onclick = () => { SH.trim.keep = -SH.trim.keep; shUI(); draw(); };
    $$('shOpen').onchange = () => { SH.open = $$('shOpen').checked; draw(); }; $$('shCut').onchange = () => { SH.asCut = $$('shCut').checked; if (window.WP && WP.setEditKind) WP.setEditKind(SH.asCut ? 'cut' : 'etch', { silent: true, keepTool: true }); draw(); };
    $$('shDone').onclick = shDone; $$('shCancel').onclick = () => { SH.cur = null; shUI(); draw(); };
    lnUI(); shUI(); }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', wire); else wire();
  return { down, move, up, paint, onTool, startBreak, LN, SH, shapePaths, lnPath, handles, cancel: () => { lnReset(true); SH.cur = null; shUI(); } };
})();
