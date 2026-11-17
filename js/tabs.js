// Waylands Path v4.8 - Tabs: rectangular tabs joined to the BOTTOM of the outer cut line, for slotting into a stand.
// Standard format (the user's): tab 10 mm wide x 4 mm deep, 2 tabs with a 35 mm gap between them, centred; 0.15 mm x 0.8 mm crush bumps
// on both side faces of each tab (the faces that press on the 10 mm slot's ends), centred on the tab depth. Every value is typed in mm.
// The tab settings live on the outer cut path (p.tabs, with its tab-free shape in p.tabBase), so Undo, saving and sync carry them.
// The outer cut is rebuilt as ONE closed line that runs down and around each tab. Designs without tabs are not touched.
'use strict';
window.TB = (() => {
  const $ = id => document.getElementById(id), KEY = 'wp-tabs';
  const STD = { w: 10, proj: 4, n: 2, gap: 35, bump: true, bh: 0.15, bw: 0.8, body: 100 };
  const LIM = { w: [1, 200], proj: [0.5, 50], n: [1, 10], gap: [0, 500], bh: [0, 2], bw: [0.1, 10], body: [5, 2000] };
  const T = { on: false, pick: -1, v: load(), bad: [] };
  function load() { let o = {}; try { o = JSON.parse(localStorage.getItem(KEY) || '{}') || {}; } catch (e) { o = {}; } const v = Object.assign({}, STD);
    for (const k of Object.keys(STD)) if (k === 'bump') { if (typeof o.bump === 'boolean') v.bump = o.bump; } else if (+o[k] >= LIM[k][0] && +o[k] <= LIM[k][1]) v[k] = +o[k]; return v; }
  const save = () => { try { localStorage.setItem(KEY, JSON.stringify(T.v)); } catch (e) { /* */ } };
  const r2 = v => Math.round(v * 100) / 100, r3 = v => Math.round(v * 1000) / 1000;
  const cfgOf = () => ({ w: T.v.w, proj: T.v.proj, n: T.v.n, gap: T.v.gap, bump: T.v.bump, bh: T.v.bh, bw: T.v.bw });
  // the outer cut: the biggest closed cut line that is not a hanging hole
  function outer() { let best = null, ba = 0; for (const p of S.paths) { if (!p.cut || p.hole || !p.z) continue; const b = BZ.bbox([{ n: p.tabBase || p.n, z: true }]); if (b && b.w * b.h > ba) { ba = b.w * b.h; best = p; } } return best; }
  const baseOf = p => ({ n: p.tabBase || p.n, z: true });
  // ---------- geometry: outline + tabs -> one closed line ----------
  function bumpPts(xs, dir, yc, hw, bh, down) { const pts = [], s = bh, c = hw; if (!(s > 0 && c > 0)) return pts; const R = (c * c + s * s) / (2 * s), tm = Math.asin(Math.min(1, c / R)), N = 8;
    for (let i = 0; i <= N; i++) { const th = -tm + 2 * tm * i / N; pts.push([xs + dir * (R * Math.cos(th) - (R - s)), yc + R * Math.sin(th)]); } return down ? pts : pts.reverse(); }
  function cross(q, x, bb) { const cs = BZ.crossings(q, [x, bb.y0 - 10], [x, bb.y1 + 10], 0.05); let best = null; for (const c of cs) if (!best || c.pt[1] > best.pt[1]) best = c; return best; }
  function addNodeAt(q, c) { const nd = q.n; if (c.t < 1e-6) return c.k; if (c.t > 1 - 1e-6) return (c.k + 1) % nd.length; return BZ.insertNode(q, c.k, c.t); }
  const idxNear = (q, pt) => { let bi = 0, bd = Infinity; q.n.forEach((nd, i) => { const d = Math.hypot(nd.x - pt[0], nd.y - pt[1]); if (d < bd) { bd = d; bi = i; } }); return bi; };
  function merge(base, cfg, k) { const q = { n: BZ.clone(base.n), z: true }, bb = BZ.bbox([q]), bad = []; if (!bb) return { n: q.n, bad };
    const yb = bb.y1 + cfg.proj / k, hw = cfg.w / 2 / k, xs = (cfg.xs || []).slice().sort((a, b) => a - b);
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
    return { n: q.n, bad }; }
  // rebuild the outer cut with its tabs at their exact mm size (call after any change; no tabs = nothing happens)
  function sync() { T.bad = []; for (const p of S.paths) { if (!p.tabs && !p.tabBase) continue;
      if (!p.tabs || !p.tabs.xs || !p.tabs.xs.length) { if (p.tabBase) p.n = p.tabBase; delete p.tabBase; delete p.tabs; delete p._tsig; continue; }
      if (!p.tabBase) p.tabBase = BZ.clone(p.n); const k = kmm(), sig = JSON.stringify([p.tabs, k]); if (p._tsig === sig && p.n !== p.tabBase) continue;
      const r = merge(baseOf(p), p.tabs, k); p.n = r.n; p.z = true; p._tsig = sig; T.bad = r.bad; } }
  // tab centres for n tabs with a gap between them, centred on the design's centre line
  function layoutXs(cfg, k, cx) { const pitch = (cfg.w + cfg.gap) / k, out = []; for (let i = 0; i < cfg.n; i++) out.push(cx + (i - (cfg.n - 1) / 2) * pitch); return out; }
  function centreX() { const ps = S.paths.map(p => p.tabBase ? baseOf(p) : p), b = BZ.bbox(ps); return b ? (b.x0 + b.x1) / 2 : 0; }
  function body() { const ps = S.paths.map(p => p.tabBase ? baseOf(p) : p), b = BZ.bbox(ps), k = kmm(); return b ? { w: b.w * k, h: b.h * k } : null; }
  function standard() { const E = outer(); if (!E) { toast('Make the outer cut line first (Cut out tool › Outer cut), then add tabs.', 4500); return; }
    pushUndo(); const c = cfgOf(); c.xs = layoutXs(c, kmm(), centreX()); E.tabs = c; delete E._tsig; T.pick = -1; changed(); panel();
    toast(T.bad.length ? 'Some tabs did not fit on the bottom edge - check the panel' : `${c.n} tab${c.n > 1 ? 's' : ''} added: ${c.w} × ${c.proj} mm, ${c.gap} mm apart, centred at the bottom`, 3500); }
  function setVal(key, val) { const L = LIM[key]; if (key !== 'bump') { if (!(val >= L[0] && val <= L[1])) { toast(`Use a number from ${L[0]} to ${L[1]}`); panel(); return; } val = key === 'n' ? Math.round(val) : r3(val); }
    T.v[key] = val; save(); const E = outer(); if (key === 'body' || !E || !E.tabs) { panel(); return; }
    pushUndo(); E.tabs[key] = val; if (key === 'n' || key === 'gap' || key === 'w') E.tabs.xs = layoutXs(E.tabs, kmm(), E.tabs.xs.length ? E.tabs.xs.reduce((a, b) => a + b, 0) / E.tabs.xs.length : centreX()); delete E._tsig; changed(); panel(); }
  function reset() { T.v = Object.assign({}, STD); save(); const E = outer(); if (E && E.tabs) { pushUndo(); const c = cfgOf(); c.xs = layoutXs(c, kmm(), centreX()); E.tabs = c; delete E._tsig; changed(); } panel(); toast('Tab sizes reset to your standard: 10 × 4 mm, 2 tabs, 35 mm gap, 0.15 × 0.8 mm bumps', 3500); }
  function removeTab() { const E = outer(); if (!E || !E.tabs) return; pushUndo(); if (T.pick >= 0) E.tabs.xs.splice(T.pick, 1); else E.tabs.xs = []; T.pick = -1; delete E._tsig; changed(); panel(); toast('Tab removed - Undo brings it back'); }
  function setBody() { const b = body(); if (!b || !b.h) return; pushUndo(); S.widthMm = S.widthMm * T.v.body / b.h; syncInputs(); changed(); panel(); toast(`Design resized: the body is now ${T.v.body} mm tall`); }
  // tab boxes in design units, for tapping and labels
  function boxes() { const E = outer(); if (!E || !E.tabs) return []; const k = kmm(), b = BZ.bbox([baseOf(E)]), t = E.tabs, hw = t.w / 2 / k;
    return t.xs.map((cx, i) => ({ i, cx, x0: cx - hw, x1: cx + hw, y0: b.y1 - Math.max(2, t.proj) / k, y1: b.y1 + t.proj / k })); }
  function hit(u, tol) { return boxes().find(b => u[0] >= b.x0 - tol && u[0] <= b.x1 + tol && u[1] >= b.y0 - tol && u[1] <= b.y1 + tol) || null; }
  function down(e, p, u, base) { const tol = (e && e.pointerType === 'mouse' ? 8 : 18) / view.s, h = hit(u, tol), E = outer();
    if (h && E) { T.pick = h.i; panel(); draw(); return Object.assign(base, { tb: 'move', i: h.i, x0: E.tabs.xs[h.i], snap: snap() }); }
    return Object.assign(base, { tb: 'tap', tx: view.tx, ty: view.ty }); }
  function move(g, p, u) { if (g.tb === 'tap') { view.tx = g.tx + p[0] - g.p0[0]; view.ty = g.ty + p[1] - g.p0[1]; draw(); return; }
    const E = outer(); if (!E || !E.tabs) return; E.tabs.xs[g.i] = g.x0 + u[0] - g.u0[0]; delete E._tsig; sync(); draw(); }
  function up(g) { const E = outer();
    if (g.tb === 'move') { if (g.moved) { undoSt.push(g.snap); redoSt = []; if (E && E.tabs) { const x = E.tabs.xs[g.i]; E.tabs.xs.sort((a, b) => a - b); T.pick = E.tabs.xs.indexOf(x); } changed(); panel(); } return; }
    if (g.moved) return; if (T.pick >= 0) { T.pick = -1; panel(); draw(); return; }
    if (!E) { toast('Make the outer cut line first (Cut out tool › Outer cut), then add tabs.', 4000); return; }
    pushUndo(); if (!E.tabs) { E.tabs = cfgOf(); E.tabs.xs = []; } E.tabs.xs.push(g.u0[0]); E.tabs.xs.sort((a, b) => a - b); T.pick = E.tabs.xs.indexOf(g.u0[0]); delete E._tsig; changed(); panel(); toast('Tab added at the bottom edge - drag it sideways to move it'); }
  function panel() { const box = $('tbBox'); if (!box) return; const pnl = box.closest('[data-opts]'); if (pnl) pnl.classList.toggle('tbon', T.on); document.querySelectorAll('[data-tabs]').forEach(x => x.classList.toggle('on', T.on)); if (!T.on) return;
    document.querySelectorAll('[data-shape],[data-hole]').forEach(x => x.classList.remove('on'));
    const E = outer(), t = E && E.tabs ? E.tabs : null, v = T.v;
    for (const [id, key] of [['tbW', 'w'], ['tbP', 'proj'], ['tbN', 'n'], ['tbG', 'gap'], ['tbBh', 'bh'], ['tbBw', 'bw'], ['tbBody', 'body']]) if (document.activeElement !== $(id)) $(id).value = t && key in t && key !== 'body' ? t[key] : v[key];
    $('tbBump').checked = t ? !!t.bump : v.bump; if (T.pick >= 0 && !(t && T.pick < t.xs.length)) T.pick = -1; $('tbDel').textContent = T.pick >= 0 ? '🗑 Remove this tab' : '🗑 Remove all tabs'; $('tbDel').disabled = !(t && t.xs.length);
    const b = body(), bh = b ? b.h : 0, tp = t ? t.proj : v.proj, okH = Math.abs(bh - v.body) < 0.05;
    $('tbHint').innerHTML = !E ? '<span class="warn">No outer cut line yet - make it first (Cut out tool › Outer cut).</span>' : t && t.xs.length ? (T.pick >= 0 ? `<b>Tab ${T.pick + 1} picked.</b> Drag it sideways along the bottom, or remove it. Tap empty space to let go.` : `<b>${t.xs.length} tab${t.xs.length > 1 ? 's' : ''}</b> on the bottom edge. Tap a tab to pick it, drag to move it, or tap the bottom edge to add one.`) + (T.bad.length ? ` <span class="warn">${T.bad.length} tab${T.bad.length > 1 ? 's' : ''} hang off the bottom edge and were left out - drag ${T.bad.length > 1 ? 'them' : 'it'} in.</span>` : '') : 'Tap <b>▭ Standard tabs</b> to put your standard tabs centred on the bottom edge.';
    $('tbBodyInfo').innerHTML = b ? `Door body: <b>${r2(b.w)} × ${r2(bh)} mm</b>${t && t.xs.length ? ` · with tabs ${r2(bh + tp)} mm tall` : ` · with ${tp} mm tabs ${r2(bh + tp)} mm tall`}.${okH ? '' : ` <span class="warn">Your standard body is ${v.body} mm tall - tap Set body height.</span>`}` : ''; }
  // labels on the screen (never in the files): size under each tab and the gap between neighbours
  function paint(px) { const bs = boxes(); if (!bs.length) return; const E = outer(), t = E.tabs, k = kmm();
    const lab = (txt, x, y, blue) => { ctx.font = `bold ${11 * px}px sans-serif`; ctx.textAlign = 'center'; ctx.textBaseline = 'top'; const w = ctx.measureText(txt).width; ctx.fillStyle = blue ? '#1971c2' : 'rgba(20,20,20,0.78)'; ctx.fillRect(x - w / 2 - 3 * px, y, w + 6 * px, 14 * px); ctx.fillStyle = '#fff'; ctx.fillText(txt, x, y + 1.5 * px); };
    bs.forEach(b => { const pk = T.on && b.i === T.pick; if (pk) { ctx.strokeStyle = '#1971c2'; ctx.lineWidth = 2.4 * px; ctx.strokeRect(b.x0, b.y1 - t.proj / k, b.x1 - b.x0, t.proj / k); } lab(`${t.w}×${t.proj}`, b.cx, b.y1 + 4 * px, pk); });
    for (let i = 1; i < bs.length; i++) { const g = (bs[i].x0 - bs[i - 1].x1) * k; ctx.strokeStyle = 'rgba(25,113,194,0.7)'; ctx.lineWidth = px; const y = bs[i].y1 - t.proj / 2 / k; ctx.beginPath(); ctx.moveTo(bs[i - 1].x1, y); ctx.lineTo(bs[i].x0, y); ctx.stroke(); lab(`${r2(g)} mm`, (bs[i - 1].x1 + bs[i].x0) / 2, y + 2 * px, false); } }
  function setOn(v) { T.on = !!v; if (!T.on) T.pick = -1; if (T.on && window.HH && HH.on) HH.setOn(false); if (T.on && window.T2) T2.SH.cur = null; panel(); draw(); }
  function wire() { if (!$('tbBox')) return;
    document.querySelectorAll('[data-tabs]').forEach(b => b.onclick = () => setOn(true));
    document.querySelectorAll('[data-shape],[data-hole]').forEach(b => b.addEventListener('click', () => { if (T.on) { T.on = false; T.pick = -1; panel(); } if (b.dataset.hole && window.HH) HH.setOn(true); }));
    for (const [id, key] of [['tbW', 'w'], ['tbP', 'proj'], ['tbN', 'n'], ['tbG', 'gap'], ['tbBh', 'bh'], ['tbBw', 'bw'], ['tbBody', 'body']]) $(id).addEventListener('change', () => setVal(key, +$(id).value));
    $('tbBump').addEventListener('change', () => setVal('bump', $('tbBump').checked));
    $('tbStd').onclick = standard; $('tbReset').onclick = reset; $('tbDel').onclick = removeTab; $('tbSetBody').onclick = setBody; $('tbDone').onclick = () => { setOn(false); setTool('sel'); };
    panel(); }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', wire); else wire();
  return { T, STD, get on() { return T.on; }, sync, down, move, up, paint, panel, setOn, outer, boxes, standard, body, merge };
})();
