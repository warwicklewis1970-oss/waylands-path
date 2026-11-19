// Waylands Path v5.1 - Clone tool: tap a line, shape, cut out or hanging hole, Clone it, then size, turn and move the copy.
// Every picked item keeps p.xf = { g, o, b, c, sx, sy, r, dx, dy, sig, copy } on its path(s):
//   o = geometry when cloned (or when first changed here) - "Reset to original" goes back to it exactly
//   b = geometry the current size/turn/move is worked out from (never edited, so no drift), c = its centre
// Geometry = the path nodes (x, y and both handles), or for a hanging hole its {cx, cy, d} so it stays a true circle.
// Nothing is written to a path until you clone or change it, so designs that never use this tool are untouched.
'use strict';
window.CN = (() => {
  const $ = id => document.getElementById(id), r3 = v => Math.round(v * 1000) / 1000, f1 = v => (Math.round(v * 10) / 10).toString();
  const C = { sel: [], g: null, lock: localStorage.getItem('wp-cnLock') !== '0', step: +(localStorage.getItem('wp-cnStep') || 1) || 1 };
  const tol = e => (e && e.pointerType === 'mouse' ? 12 : 24) / view.s;
  const live = () => C.sel.filter(p => S.paths.includes(p));
  const newG = () => 'g' + Date.now().toString(36) + Math.random().toString(36).slice(2, 6);
  const isOuter = p => p && p.cut && !p.hole && (p.tabs || !innerCuts().includes(p));
  const geomOf = p => p.hole ? { cx: p.hole.cx, cy: p.hole.cy, d: p.hole.d } : BZ.clone(p.n);
  const sigOf = p => p.hole ? `${p.hole.cx},${p.hole.cy},${p.hole.d}` : JSON.stringify(p.n);
  const holeR = (h, k) => (h.d / 2) / k;
  function bbOf(list, k) { let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity; const grow = (x, y) => { if (x < x0) x0 = x; if (x > x1) x1 = x; if (y < y0) y0 = y; if (y > y1) y1 = y; };
    for (const p of list) { const b = p.xf ? p.xf.b : geomOf(p); if (p.hole) { const R = holeR(b, k); grow(b.cx - R, b.cy - R); grow(b.cx + R, b.cy + R); } else for (const q of BZ.flatten({ n: b, z: p.z }, 0.3)) grow(q[0], q[1]); }
    return x0 === Infinity ? null : { x0, y0, x1, y1, w: x1 - x0, h: y1 - y0 }; }
  // give the picked group its xf (first time), or start again from the current shape if another tool changed it
  function prep(list) { const k = kmm(); let g = list[0] && list[0].xf && list.every(p => p.xf && p.xf.g === list[0].xf.g && p.xf.sig === sigOf(p)) ? list[0].xf.g : null; if (g) return g; g = newG();
    for (const p of list) { const keepO = p.xf && p.xf.o, copy = !!(p.xf && p.xf.copy); p.xf = { g, o: keepO || geomOf(p), b: geomOf(p), sx: 1, sy: 1, r: 0, dx: 0, dy: 0, copy }; }
    const bb = bbOf(list, k); for (const p of list) { p.xf.c = [(bb.x0 + bb.x1) / 2, (bb.y0 + bb.y1) / 2]; p.xf.sig = sigOf(p); } return g; }
  const T = (xf, x, y) => { const c = xf.c, a = xf.r * Math.PI / 180, cs = Math.cos(a), sn = Math.sin(a), u = (x - c[0]) * xf.sx, v = (y - c[1]) * xf.sy; return [c[0] + u * cs - v * sn + xf.dx, c[1] + u * sn + v * cs + xf.dy]; };
  function apply(list) { for (const p of list) { const xf = p.xf;
      if (p.hole) { const q = T(xf, xf.b.cx, xf.b.cy); p.hole.cx = q[0]; p.hole.cy = q[1]; p.hole.d = Math.max(0.5, Math.min(50, Math.round(xf.b.d * Math.sqrt(Math.abs(xf.sx * xf.sy)) * 100) / 100)); }
      else { p.n = xf.b.map(nd => { const q = T(xf, nd.x, nd.y), n2 = BZ.node(q[0], q[1], nd.i ? T(xf, nd.i[0], nd.i[1]) : null, nd.o ? T(xf, nd.o[0], nd.o[1]) : null, nd.s); return n2; }); }
    }
    if (list.some(p => p.hole) && window.HH) HH.sync(); for (const p of list) p.xf.sig = sigOf(p); }
  // keep every other line the same size in mm: if the change makes the design wider, the design Width grows instead
  function keepScale(k0) { const b = bbAll(); if (!b || !(k0 > 0)) return; const w = k0 * b.w; if (Math.abs(w - S.widthMm) > 1e-9) { S.widthMm = w; if (window.HH) HH.sync(); syncInputs(); } }
  function begin() { pushUndo(); undoSt[undoSt.length - 1]._w = S.widthMm; return kmm(); }
  function commit(k0) { keepScale(k0); changed({ keepSel: true }); panel(); draw(); }
  // ---------- picking ----------
  function pick(u, e) { const t = tol(e);
    if (window.HH) { const hi = HH.hitHole(u, t * 0.6); if (hi >= 0) return { list: [S.paths[hi]] }; }
    let best = null; S.paths.forEach((p, pi) => { if (p.cut || p.n.length < 2) return; const r = BZ.nearest(p, u, 0.3); if (r && r.d <= t && (!best || r.d < best.d)) best = { pi, d: r.d }; });
    const etchR = () => { const c = window.T4 ? T4.chainOf(best.pi).list.map(i => S.paths[i]) : [S.paths[best.pi]]; const g = c[0].xf && c[0].xf.g; return { list: g ? S.paths.filter(q => q.xf && q.xf.g === g) : c }; };
    let edge = null; S.paths.forEach(p => { if (!p.cut || p.n.length < 2 || p.hole) return; const r = BZ.nearest(p, u, 0.3); if (r && r.d <= t * 0.7 && (!edge || r.d < edge.d)) edge = { p, d: r.d }; });
    if (edge && (!best || edge.d < best.d)) return isOuter(edge.p) ? (best ? etchR() : { outer: true }) : { list: [edge.p] };
    let inside = null, ia = Infinity; for (const p of S.paths) { if (!p.cut || !p.z || p.hole || isOuter(p)) continue; const f = BZ.flatten(p, 0.5), b = BZ.bbox([p]); if (BZ.inside(f, u) && b.w * b.h < ia) { ia = b.w * b.h; inside = p; } }
    if (inside && (!best || best.d > t * 0.45)) return { list: [inside] }; // a tap inside a cut out picks it unless right on a line
    if (best) return etchR(); if (edge) return { outer: true }; return null; }
  function choose(list) { C.sel = list.slice(); C.g = list[0] && list[0].xf ? list[0].xf.g : null; panel(); draw(); }
  // ---------- actions ----------
  function doClone() { const list = live(); if (!list.length) { toast('Tap a line, shape or hole first, then Clone'); return; }
    const k0 = begin(), off = 5 / k0, g = newG(), copies = list.map(p => { const q = BZ.clone(Object.assign({}, p, { xf: undefined })); delete q.xf; delete q.tabs; delete q.tabBase; delete q._tsig;
      if (q.hole) { q.hole.cx += off; q.hole.cy += off; } else q.n.forEach(nd => { nd.x += off; nd.y += off; if (nd.i) { nd.i[0] += off; nd.i[1] += off; } if (nd.o) { nd.o[0] += off; nd.o[1] += off; } });
      return q; });
    for (const q of copies) { S.paths.push(q); q.xf = { g, o: geomOf(q), b: geomOf(q), sx: 1, sy: 1, r: 0, dx: 0, dy: 0, copy: true }; }
    if (copies.some(q => q.hole) && window.HH) HH.sync();
    const bb = bbOf(copies, k0); for (const q of copies) { q.xf.c = [(bb.x0 + bb.x1) / 2, (bb.y0 + bb.y1) / 2]; q.xf.sig = sigOf(q); }
    if (copies.some(q => q.cut)) S.cutOn = true; try { remember(list, k0); } catch (e) { /* the copy is made even if it can't be remembered */ } choose(copies); commit(k0);
    toast(`Copy made, 5 mm down and right${copies[0].hole ? ` (Ø ${copies[0].hole.d} mm hole)` : copies[0].cut ? ' (cut out)' : ''}. Drag it, or use the boxes below.`, 3200); }
  // ---------- v5.1 recent clones: the last 3 things you cloned, kept on this device (any project) ----------
  // Stored in mm from the shape's own centre, with its type (etch / cut out / hole, thickness, double line), so a recent
  // clone placed on another design is the same size in mm and burns the same way as the one you cloned.
  const RKEY = 'wp-cnRecent', RMAX = 3, DROP = ['n', 'xf', 'tabs', 'tabBase', '_tsig'];
  function recents() { try { const a = JSON.parse(localStorage.getItem(RKEY) || '[]'); return Array.isArray(a) ? a.filter(r => r && Array.isArray(r.items) && r.items.length) : []; } catch (e) { return []; } }
  function remember(list, k) { const bb = bbOf(list.map(p => ({ n: p.n, z: p.z, hole: p.hole })), k); if (!bb) return; const cx = (bb.x0 + bb.x1) / 2, cy = (bb.y0 + bb.y1) / 2, m = v => Math.round(v * 1e4) / 1e4;
    const mp = (x, y) => [m((x - cx) * k), m((y - cy) * k)];
    const items = list.map(p => { const props = {}; for (const key of Object.keys(p)) if (!DROP.includes(key)) props[key] = JSON.parse(JSON.stringify(p[key]));
      if (p.hole) { const q = mp(p.hole.cx, p.hole.cy); props.hole = Object.assign({}, p.hole, { cx: q[0], cy: q[1] }); return { props }; }
      return { props, n: p.n.map(nd => { const q = mp(nd.x, nd.y), o = { x: q[0], y: q[1] }; if (nd.i) o.i = mp(nd.i[0], nd.i[1]); if (nd.o) o.o = mp(nd.o[0], nd.o[1]); if (nd.s != null) o.s = nd.s; return o; }) }; });
    const rec = { at: Date.now(), w: m(bb.w * k), h: m(bb.h * k), label: describe(list), items }, key = JSON.stringify(items);
    let all = recents().filter(r => JSON.stringify(r.items) !== key); all.unshift(rec); all = all.slice(0, RMAX);
    try { localStorage.setItem(RKEY, JSON.stringify(all)); } catch (e) { try { localStorage.setItem(RKEY, JSON.stringify([rec])); } catch (e2) { /* too big to keep - the clone itself still worked */ } }
    recentsRow(true); }
  function placeRecent(idx) { const rec = recents()[idx]; if (!rec) return; const k0 = begin(), k = k0, r = cv.getBoundingClientRect(), c = toU(r.width / 2, r.height / 2), g = newG();
    const U = q => [c[0] + q[0] / k, c[1] + q[1] / k];
    const copies = rec.items.map(it => { const q = JSON.parse(JSON.stringify(it.props));
      if (q.hole) { const u = U([q.hole.cx, q.hole.cy]); q.hole.cx = u[0]; q.hole.cy = u[1]; q.z = true; q.n = window.HH ? HH.circle(u[0], u[1], HH.pathR(q.hole) / k) : []; }
      else q.n = it.n.map(nd => { const u = U([nd.x, nd.y]); return BZ.node(u[0], u[1], nd.i ? U(nd.i) : null, nd.o ? U(nd.o) : null, nd.s); });
      return q; });
    for (const q of copies) { S.paths.push(q); q.xf = { g, o: geomOf(q), b: geomOf(q), sx: 1, sy: 1, r: 0, dx: 0, dy: 0, copy: true }; }
    if (copies.some(q => q.hole) && window.HH) HH.sync();
    for (const q of copies) q.xf.o = q.xf.b = geomOf(q);
    const bb = bbOf(copies, k0); for (const q of copies) { q.xf.c = [(bb.x0 + bb.x1) / 2, (bb.y0 + bb.y1) / 2]; q.xf.sig = sigOf(q); }
    if (copies.some(q => q.cut)) S.cutOn = true; choose(copies); commit(k0); requestAnimationFrame(seen);
    toast(`Recent clone placed in the middle of the screen (${f1(rec.w)} × ${f1(rec.h)} mm). Drag it, or use the boxes below.`, 3500); }
  function thumb(rec, cvs) { const g = cvs.getContext('2d'), W = cvs.width, H = cvs.height; g.fillStyle = '#fff'; g.fillRect(0, 0, W, H);
    let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity; const grow = (x, y) => { x0 = Math.min(x0, x); y0 = Math.min(y0, y); x1 = Math.max(x1, x); y1 = Math.max(y1, y); };
    for (const it of rec.items) { if (it.props.hole) { const h = it.props.hole, R = h.d / 2; grow(h.cx - R, h.cy - R); grow(h.cx + R, h.cy + R); } else for (const q of BZ.flatten({ n: it.n.map(nd => BZ.node(nd.x, nd.y, nd.i || null, nd.o || null, nd.s)), z: it.props.z }, 0.2)) grow(q[0], q[1]); }
    if (!isFinite(x0)) return; const sc = Math.min((W - 10) / Math.max(x1 - x0, 1e-6), (H - 10) / Math.max(y1 - y0, 1e-6)), ox = (W - (x1 - x0) * sc) / 2 - x0 * sc, oy = (H - (y1 - y0) * sc) / 2 - y0 * sc;
    g.lineWidth = 1.6; g.lineJoin = g.lineCap = 'round';
    for (const it of rec.items) { g.strokeStyle = it.props.cut ? '#868e96' : '#1971c2'; g.beginPath();
      if (it.props.hole) { const h = it.props.hole; g.arc(h.cx * sc + ox, h.cy * sc + oy, Math.max(1.5, h.d / 2 * sc), 0, Math.PI * 2); }
      else BZ.flatten({ n: it.n.map(nd => BZ.node(nd.x, nd.y, nd.i || null, nd.o || null, nd.s)), z: it.props.z }, 0.2).forEach((q, i) => i ? g.lineTo(q[0] * sc + ox, q[1] * sc + oy) : g.moveTo(q[0] * sc + ox, q[1] * sc + oy));
      if (it.props.z && !it.props.hole) g.closePath(); g.stroke(); } }
  let rowKey = null;
  function recentsRow(force) { const box = $('cnRecent'); if (!box) return; const all = recents(), key = JSON.stringify(all.map(r => r.at)); if (!force && key === rowKey) return; rowKey = key;
    box.hidden = !all.length; const row = $('cnRecentRow'); row.innerHTML = '';
    all.forEach((rec, i) => { const b = document.createElement('button'); b.type = 'button'; b.className = 'cnrec'; b.dataset.cnrec = String(i); b.title = `Place a copy: ${rec.label}`;
      const cvs = document.createElement('canvas'); cvs.width = 96; cvs.height = 64; b.appendChild(cvs); const t = document.createElement('span'); t.textContent = `${f1(rec.w)} × ${f1(rec.h)} mm`; b.appendChild(t);
      b.onclick = () => placeRecent(i); row.appendChild(b); try { thumb(rec, cvs); } catch (e) { /* thumbnail only */ } }); }
  function change(fn, msg) { const list = live(); if (!list.length) { toast('Tap a line, shape or hole first'); return; } const k0 = begin(); C.g = prep(list); const xf = list[0].xf, v = { sx: xf.sx, sy: xf.sy, r: xf.r, dx: xf.dx, dy: xf.dy };
    if (fn(v, k0, list) === false) { undoSt.pop(); updUndo(); panel(); return; } for (const p of list) Object.assign(p.xf, v); apply(list); commit(k0); if (msg) toast(msg); }
  function reset() { const list = live(); if (!list.length) return; if (!list.some(p => p.xf)) { toast('Nothing to reset - it has not been changed'); return; } const k0 = begin();
    for (const p of list) { if (!p.xf) continue; const o = p.xf.o; if (p.hole) Object.assign(p.hole, BZ.clone(o)); else p.n = BZ.clone(o); p.xf.b = BZ.clone(o); Object.assign(p.xf, { sx: 1, sy: 1, r: 0, dx: 0, dy: 0 }); }
    if (list.some(p => p.hole) && window.HH) HH.sync(); const bb = bbOf(list, k0); for (const p of list) if (p.xf) { p.xf.c = [(bb.x0 + bb.x1) / 2, (bb.y0 + bb.y1) / 2]; p.xf.sig = sigOf(p); }
    commit(k0); toast(list[0].xf && list[0].xf.copy ? 'Copy back to how it was when you cloned it' : 'Back to how it was before you changed it'); }
  function delCopy() { const list = live(); if (!list.length || !list.every(p => p.xf && p.xf.copy)) { toast('Only a copy can be deleted here'); return; } const k0 = begin(); S.paths = S.paths.filter(p => !list.includes(p)); C.sel = []; commit(k0); toast('Copy deleted - Undo brings it back'); }
  // typed boxes
  function setW(mm, axis) { change((v, k0, list) => { const bb = bbOf(list, k0), base = (axis === 'h' ? bb.h : bb.w) * k0; if (!(mm > 0) || base < 1e-6) { toast('Type a size above 0 mm'); return false; }
      const f = mm / base; if (C.lock || list.some(p => p.hole)) { const old = axis === 'h' ? v.sy : v.sx, m = f / (Math.abs(old) || 1); v.sx *= m; v.sy *= m; } else if (axis === 'h') v.sy = f * Math.sign(v.sy || 1); else v.sx = f * Math.sign(v.sx || 1); if (Math.abs(v.sx) > 50 || Math.abs(v.sy) > 50 || Math.abs(v.sx) < 0.01 || Math.abs(v.sy) < 0.01) { toast('That is too big a change in one go'); return false; } }); }
  function setPct(pc) { change(v => { if (!(pc >= 1 && pc <= 5000)) { toast('Type a size from 1 to 5000 %'); return false; } v.sx = pc / 100; v.sy = pc / 100; }); }
  function setRot(deg, add) { change((v, k0, list) => { if (list.every(p => p.hole)) { toast('A round hole looks the same turned - nothing to turn'); return false; } if (!isFinite(deg)) return false; let r = add ? v.r + deg : deg; r = ((r % 360) + 540) % 360 - 180; if (Math.abs(r + 180) < 1e-9) r = 180; v.r = Math.round(r * 100) / 100; }); }
  function nudge(dx, dy) { change((v, k0) => { v.dx += dx * C.step / k0; v.dy += dy * C.step / k0; }); }
  // ---------- handles: the picked item's box, turned with it ----------
  function frame() { const list = live(); if (!list.length) return null; const k = kmm(); const xf = list[0].xf && list.every(p => p.xf && p.xf.g === list[0].xf.g && p.xf.sig === sigOf(p)) ? list[0].xf : null;
    const bb = bbOf(xf ? list : list.map(p => ({ n: p.n, z: p.z, hole: p.hole })), k); if (!bb) return null; const pad = 6 / view.s;
    const f = xf || { c: [(bb.x0 + bb.x1) / 2, (bb.y0 + bb.y1) / 2], sx: 1, sy: 1, r: 0, dx: 0, dy: 0 };
    // corners of the scaled box: scale the base box, pad in screen px after
    const T0 = (x, y) => T(f, x, y), cA = T0(bb.x0, bb.y0), cB = T0(bb.x1, bb.y0), cC = T0(bb.x1, bb.y1), cD = T0(bb.x0, bb.y1), mid = T0(f.c[0], f.c[1]);
    const a = f.r * Math.PI / 180, ux = [Math.cos(a), Math.sin(a)], uy = [-Math.sin(a), Math.cos(a)], sgx = Math.sign(f.sx) || 1, sgy = Math.sign(f.sy) || 1;
    const P = (c, ax, ay) => [c[0] + (ux[0] * ax * sgx + uy[0] * ay * sgy) * pad, c[1] + (ux[1] * ax * sgx + uy[1] * ay * sgy) * pad];
    const box = [P(cA, -1, -1), P(cB, 1, -1), P(cC, 1, 1), P(cD, -1, 1)], top = [(box[0][0] + box[1][0]) / 2, (box[0][1] + box[1][1]) / 2], up = [-(uy[0]) * sgy, -(uy[1]) * sgy];
    const rot = [top[0] + up[0] * 34 / view.s, top[1] + up[1] * 34 / view.s];
    return { list, box, mid, rot, top, scl: box[2], bb, f, k }; }
  function onBox(fr, u) { const B = fr.box, inTri = (a, b, c) => { const s = (p, q, r) => (p[0] - r[0]) * (q[1] - r[1]) - (q[0] - r[0]) * (p[1] - r[1]); const d1 = s(u, a, b), d2 = s(u, b, c), d3 = s(u, c, a); return !((d1 < 0 || d2 < 0 || d3 < 0) && (d1 > 0 || d2 > 0 || d3 > 0)); }; return inTri(B[0], B[1], B[2]) || inTri(B[0], B[2], B[3]); }
  // ---------- gestures ----------
  function down(e, p, u, base) { const fr = frame(), hr = (e && e.pointerType === 'mouse' ? 12 : 26) / view.s, g = Object.assign(base, { cn: 'tap', tx: view.tx, ty: view.ty });
    if (fr) { const near = q => Math.hypot(u[0] - q[0], u[1] - q[1]) <= hr;
      const mode = near(fr.scl) ? 'scale' : (!fr.list.every(q => q.hole) && near(fr.rot)) ? 'rot' : onBox(fr, u) ? 'move' : null;
      if (mode) { g.cn = mode; g.k0 = kmm(); g.snap = snap(); g.snap._w = S.widthMm; C.g = prep(fr.list); const xf = fr.list[0].xf; g.v0 = { sx: xf.sx, sy: xf.sy, r: xf.r, dx: xf.dx, dy: xf.dy }; g.c = T(xf, xf.c[0], xf.c[1]); g.h0 = fr.scl; g.bb = bbOf(fr.list, g.k0); } }
    return g; }
  function move(g, p, u) { if (g.cn === 'tap') { view.tx = g.tx + p[0] - g.p0[0]; view.ty = g.ty + p[1] - g.p0[1]; draw(); return; }
    const list = live(); if (!list.length) return; const v = Object.assign({}, g.v0);
    if (g.cn === 'move') { v.dx = g.v0.dx + u[0] - g.u0[0]; v.dy = g.v0.dy + u[1] - g.u0[1]; }
    else if (g.cn === 'rot') { const a0 = Math.atan2(g.u0[1] - g.c[1], g.u0[0] - g.c[0]), a1 = Math.atan2(u[1] - g.c[1], u[0] - g.c[0]); let r = g.v0.r + (a1 - a0) * 180 / Math.PI; const sn = Math.round(r / 15) * 15; if (Math.abs(r - sn) < 3) r = sn; r = ((r % 360) + 540) % 360 - 180; v.r = Math.round(r * 10) / 10; }
    else if (g.cn === 'scale') { const d0 = Math.hypot(g.h0[0] - g.c[0], g.h0[1] - g.c[1]), d1 = Math.hypot(u[0] - g.c[0], u[1] - g.c[1]);
      if (C.lock || list.some(q => q.hole) || g.bb.w * view.s < 8 || g.bb.h * view.s < 8) { const f = Math.max(0.02, Math.min(50 / Math.max(Math.abs(g.v0.sx), Math.abs(g.v0.sy)), d1 / Math.max(d0, 1e-9))); v.sx = g.v0.sx * f; v.sy = g.v0.sy * f; }
      else { const a = -g.v0.r * Math.PI / 180, dx = u[0] - g.c[0], dy = u[1] - g.c[1], lx = dx * Math.cos(a) - dy * Math.sin(a), ly = dx * Math.sin(a) + dy * Math.cos(a), pad = 6 / view.s;
        v.sx = Math.max(0.02, Math.min(50, (Math.abs(lx) - pad) / (g.bb.w / 2))) * Math.sign(g.v0.sx || 1); v.sy = Math.max(0.02, Math.min(50, (Math.abs(ly) - pad) / (g.bb.h / 2))) * Math.sign(g.v0.sy || 1); } }
    for (const q of list) Object.assign(q.xf, v); apply(list); keepScale(g.k0); panel(); draw(); }
  function up(g, e) { if (g.cn === 'tap') { if (g.moved) return; const r = pick(g.u0, e);
      if (r && r.outer) { C.sel = []; panel(); draw(); toast('The outside cut line can\'t be cloned or changed here - it follows your design. Rebuild it with Cut out › Outer cut.', 4500); return; }
      if (!r) { if (C.sel.length) { C.sel = []; panel(); draw(); } return; } choose(r.list); return; }
    if (!g.moved) { const r = pick(g.u0, e); if (r && r.list && !r.list.every(q => C.sel.includes(q))) choose(r.list); return; }
    undoSt.push(g.snap); if (undoSt.length > 50) undoSt.shift(); redoSt = []; changed({ keepSel: true }); panel(); draw(); }
  // ---------- panel ----------
  function describe(list) { const p = list[0]; if (p.hole) return `hanging hole Ø ${p.hole.d} mm${p.cut ? ' (cut out)' : ''}`; if (p.cut) return 'cut out (grey - cut before the outside)'; return list.length > 1 ? `etch line (${list.length} pieces)` : p.z ? 'closed etch shape' : 'etch line'; }
  function panel() { const box = $('cnBox'); if (!box || tool !== 'clone') return; recentsRow(); const list = live(); if (list.length !== C.sel.length) C.sel = list; { const rb = $('cnRecent'); if (rb) rb.hidden = !!list.length || !recents().length; } const ed = $('cnEdit'); if (ed) { const was = ed.hidden; ed.hidden = !list.length; if (was && list.length) requestAnimationFrame(seen); } const fr = list.length ? frame() : null, xf = list[0] && list[0].xf, set = (id, v) => { const el = $(id); if (el && !(el._typing && document.activeElement === el)) el.value = v; };
    const isCopy = !!(list.length && list.every(p => p.xf && p.xf.copy)), changedOne = !!(xf && (xf.sx !== 1 || xf.sy !== 1 || xf.r || xf.dx || xf.dy || sigOf(list[0]) !== (list[0].hole ? `${xf.o.cx},${xf.o.cy},${xf.o.d}` : JSON.stringify(xf.o))));
    ['cnGo', 'cnW', 'cnH', 'cnPct', 'cnRot', 'cnRm', 'cnRp', 'cnR90'].forEach(id => { const el = $(id); if (el) el.disabled = !list.length; }); document.querySelectorAll('[data-cnnudge]').forEach(b => b.disabled = !list.length);
    $('cnReset').disabled = !changedOne; $('cnDel').disabled = !isCopy; const hole = list.length && list.every(p => p.hole); ['cnRot', 'cnRm', 'cnRp', 'cnR90'].forEach(id => { const el = $(id); if (el && hole) el.disabled = true; });
    $('cnLock').checked = C.lock || !!hole; $('cnLock').disabled = !!hole; $('cnStep').value = String(C.step);
    if (!list.length) { $('cnHint').innerHTML = '<b>Clone:</b> tap a line, shape, cut out or hanging hole to pick it, then tap <b>+ Clone</b>.' + (recents().length ? ' Or tap one of your <b>Recent clones</b> below to place it again.' : '') + ' Two fingers move or zoom the picture.'; ['cnW', 'cnH', 'cnPct', 'cnRot'].forEach(id => set(id, '')); return; }
    const k = kmm(), bb = bbOf(list, k), sx = xf ? xf.sx : 1, sy = xf ? xf.sy : 1, W = bb.w * Math.abs(sx) * k, H = bb.h * Math.abs(sy) * k;
    set('cnW', hole ? r3(list[0].hole.d) : f1(W)); set('cnH', hole ? r3(list[0].hole.d) : f1(H)); set('cnPct', Math.round(Math.abs(sx) * 1000) / 10); set('cnRot', xf ? xf.r : 0);
    $('cnHint').innerHTML = `<b>${isCopy ? 'Copy' : 'Picked'}:</b> ${describe(list)}. Drag it to move · drag <b>◢</b> to size${hole ? ' (holes stay round)' : ' · drag <b>⟳</b> to turn'}. Or type below.${isCopy ? '' : ' Tap <b>+ Clone</b> to copy it.'}`; }
  // keep the picked item on screen when the size / turn rows open under it
  function seen() { const fr = frame(), st = document.getElementById('stage'); if (!fr || !st) return; const r = st.getBoundingClientRect(), xs = fr.box.map(q => q[0] * view.s + view.tx), ys = fr.box.map(q => q[1] * view.s + view.ty), y1 = Math.max(...ys), y0 = Math.min(...ys), x0 = Math.min(...xs), x1 = Math.max(...xs);
    let dy = 0, dx = 0; if (y1 > r.height - 30) dy = Math.max(r.height - 30 - y1, 50 - y0); else if (y0 < 40) dy = 40 - y0; if (x1 > r.width - 20) dx = Math.max(r.width - 20 - x1, 20 - x0); else if (x0 < 20) dx = 20 - x0; if (dx || dy) { view.tx += dx; view.ty += dy; draw(); } }
  function paint(px) { if (tool !== 'clone') return; const fr = frame(); if (!fr) return; ctx.save();
    ctx.strokeStyle = 'rgba(25,113,194,0.9)'; ctx.lineWidth = 4 * px; ctx.beginPath(); for (const p of fr.list) { if (p.hole) { const R = holeR(p.hole, fr.k); ctx.moveTo(p.hole.cx + R, p.hole.cy); ctx.arc(p.hole.cx, p.hole.cy, R, 0, Math.PI * 2); } else tracePath(p); } ctx.stroke();
    ctx.setLineDash([6 * px, 4 * px]); ctx.lineWidth = 1.5 * px; ctx.beginPath(); fr.box.forEach((q, i) => i ? ctx.lineTo(q[0], q[1]) : ctx.moveTo(q[0], q[1])); ctx.closePath(); ctx.stroke(); ctx.setLineDash([]);
    const dot = (q, txt) => { ctx.fillStyle = '#1971c2'; ctx.beginPath(); ctx.arc(q[0], q[1], 13 * px, 0, Math.PI * 2); ctx.fill(); ctx.fillStyle = '#fff'; ctx.font = `bold ${15 * px}px sans-serif`; ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.fillText(txt, q[0], q[1] + 0.5 * px); };
    if (!fr.list.every(q => q.hole)) { ctx.strokeStyle = '#1971c2'; ctx.lineWidth = 1.5 * px; ctx.beginPath(); ctx.moveTo(fr.top[0], fr.top[1]); ctx.lineTo(fr.rot[0], fr.rot[1]); ctx.stroke(); dot(fr.rot, '⟳'); }
    dot(fr.scl, '◢'); const xf = fr.list[0].xf; if (xf && xf.r) { ctx.font = `bold ${12 * px}px sans-serif`; const t = `${xf.r}°`, w = ctx.measureText(t).width; ctx.fillStyle = 'rgba(25,113,194,0.92)'; ctx.fillRect(fr.rot[0] + 16 * px, fr.rot[1] - 9 * px, w + 8 * px, 18 * px); ctx.fillStyle = '#fff'; ctx.textAlign = 'left'; ctx.fillText(t, fr.rot[0] + 20 * px, fr.rot[1]); }
    ctx.restore(); }
  function onTool(t) { if (t !== 'clone') C.sel = []; panel(); }
  function afterUndo() { const g = C.g; C.sel = g ? S.paths.filter(p => p.xf && p.xf.g === g) : []; panel(); }
  function wire() { if (!$('cnBox')) return; const on = (id, f) => { const el = $(id); if (el) el.onclick = f; };
    on('cnGo', doClone); on('cnReset', reset); on('cnDel', delCopy); on('cnDone', () => setTool('sel'));
    on('cnRm', () => setRot(-15, true)); on('cnRp', () => setRot(15, true)); on('cnR90', () => setRot(90, true));
    const ch = (id, f) => { const el = $(id); if (!el) return; el.addEventListener('input', () => { el._typing = true; }); el.addEventListener('change', () => { el._typing = false; f(parseFloat(el.value)); panel(); }); el.addEventListener('keydown', e => { if (e.key === 'Enter') el.blur(); }); };
    ch('cnW', v => setW(v, 'w')); ch('cnH', v => setW(v, 'h')); ch('cnPct', setPct); ch('cnRot', v => setRot(v, false));
    $('cnLock').onchange = () => { C.lock = $('cnLock').checked; localStorage.setItem('wp-cnLock', C.lock ? '1' : '0'); };
    $('cnStep').onchange = () => { C.step = +$('cnStep').value || 1; localStorage.setItem('wp-cnStep', String(C.step)); };
    document.querySelectorAll('[data-cnnudge]').forEach(b => b.onclick = () => { const [x, y] = b.dataset.cnnudge.split(',').map(Number); nudge(x, y); }); panel(); }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', wire); else wire();
  return { C, down, move, up, paint, panel, onTool, afterUndo, doClone, recents, placeRecent, remember, reset, delCopy, setW, setPct, setRot, nudge, pick, choose, frame, isOuter };
})();
