// Waylands Path - polyline geometry. A path is an array of [x, y] points in design units (u).
'use strict';
const G = (() => {
  const d2 = (a, b) => (a[0] - b[0]) ** 2 + (a[1] - b[1]) ** 2;
  const dist = (a, b) => Math.sqrt(d2(a, b));
  function segD2(p, a, b) { const vx = b[0] - a[0], vy = b[1] - a[1], L = vx * vx + vy * vy;
    let t = L ? ((p[0] - a[0]) * vx + (p[1] - a[1]) * vy) / L : 0; t = t < 0 ? 0 : t > 1 ? 1 : t;
    const x = a[0] + t * vx - p[0], y = a[1] + t * vy - p[1]; return x * x + y * y; }
  const len = pts => { let s = 0; for (let i = 1; i < pts.length; i++) s += dist(pts[i - 1], pts[i]); return s; };
  const isClosed = (pts, eps = 1e-6) => pts.length > 3 && d2(pts[0], pts[pts.length - 1]) <= eps * eps;
  // Ramer-Douglas-Peucker (iterative, so very long paths can't overflow the stack)
  function rdp(pts, eps) { const n = pts.length; if (n < 3) return pts.slice(); const keep = new Uint8Array(n); keep[0] = keep[n - 1] = 1;
    const st = [[0, n - 1]], e2 = eps * eps;
    while (st.length) { const [a, b] = st.pop(); let md = -1, mi = -1;
      for (let i = a + 1; i < b; i++) { const v = segD2(pts[i], pts[a], pts[b]); if (v > md) { md = v; mi = i; } }
      if (md > e2) { keep[mi] = 1; st.push([a, mi], [mi, b]); } }
    const o = []; for (let i = 0; i < n; i++) if (keep[i]) o.push(pts[i]); return o; }
  // Chaikin corner cutting; closed paths stay closed, open paths keep their end points.
  function chaikin(pts, it = 1) { let p = pts;
    for (let k = 0; k < it; k++) { if (p.length < 3) return p; const c = isClosed(p), o = c ? [] : [p[0]], n = p.length;
      for (let i = 0; i < n - 1; i++) { const a = p[i], b = p[i + 1];
        o.push([a[0] * .75 + b[0] * .25, a[1] * .75 + b[1] * .25], [a[0] * .25 + b[0] * .75, a[1] * .25 + b[1] * .75]); }
      if (c) o.push(o[0].slice()); else o.push(p[n - 1]); p = o; }
    return p; }
  function bbox(paths) { let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
    for (const p of paths) for (const [x, y] of p) { if (x < x0) x0 = x; if (x > x1) x1 = x; if (y < y0) y0 = y; if (y > y1) y1 = y; }
    return x0 === Infinity ? null : { x0, y0, x1, y1, w: x1 - x0, h: y1 - y0 }; }
  // nearest path to point p within tol; returns index or -1
  function hit(paths, p, tol) { let best = -1, bd = tol * tol;
    paths.forEach((pts, i) => { if (pts.length === 1) { const v = d2(p, pts[0]); if (v < bd) { bd = v; best = i; } return; }
      for (let j = 1; j < pts.length; j++) { const v = segD2(p, pts[j - 1], pts[j]); if (v < bd) { bd = v; best = i; } } });
    return best; }
  // insert points so no segment is longer than maxSeg
  function densify(pts, maxSeg) { const o = [pts[0]];
    for (let i = 1; i < pts.length; i++) { const a = pts[i - 1], b = pts[i], n = Math.ceil(dist(a, b) / maxSeg);
      for (let k = 1; k < n; k++) o.push([a[0] + (b[0] - a[0]) * k / n, a[1] + (b[1] - a[1]) * k / n]); o.push(b); }
    return o; }
  // brush erase: remove the parts of every path inside a circle; returns new path list and whether anything changed
  function eraseCircle(paths, c, r) { const out = []; let changed = false, r2 = r * r;
    for (const pts of paths) { const b = bbox([pts]); if (b.x1 < c[0] - r || b.x0 > c[0] + r || b.y1 < c[1] - r || b.y0 > c[1] + r) { out.push(pts); continue; }
      let near = false; for (let j = 0; j < pts.length && !near; j++) if (j ? segD2(c, pts[j - 1], pts[j]) <= r2 : d2(c, pts[0]) <= r2) near = true;
      if (!near) { out.push(pts); continue; } changed = true;
      const dp = densify(pts, r / 8), closed = isClosed(pts); let runs = [], cur = [];
      for (const q of dp) { if (d2(q, c) <= r2) { if (cur.length) runs.push(cur); cur = []; } else cur.push(q); }
      if (cur.length) runs.push(cur);
      if (closed && runs.length > 1 && d2(dp[0], c) > r2 && d2(dp[dp.length - 1], c) > r2) { const last = runs.pop(); runs[0] = last.concat(runs[0].slice(1)); }
      for (const run of runs) if (run.length > 1) out.push(rdp(run, r / 12)); }
    return { paths: out, changed }; }
  const rev = p => p.slice().reverse();
  // Join open ends closer than tol. Pairs are taken shortest-first; each end joins once. Paths whose own two ends are close get closed.
  function joinEnds(paths, tol, opts = {}) { const P = paths.map(pts => ({ pts, alive: true })), E = [];
    P.forEach(o => { if (o.pts.length < 2 || isClosed(o.pts)) return; const a = { o, s: true, used: false }, b = { o, s: false, used: false }; a.mate = b; b.mate = a; E.push(a, b); });
    const pt = e => e.s ? e.o.pts[0] : e.o.pts[e.o.pts.length - 1];
    // direction leaving the path at that end, for preferring straight continuations
    const dir = e => { const p = e.o.pts, n = p.length, q = e.s ? p[Math.min(n - 1, 3)] : p[Math.max(0, n - 4)], a = pt(e), L = dist(a, q) || 1; return [(a[0] - q[0]) / L, (a[1] - q[1]) / L]; };
    const cell = tol || 1, grid = new Map(), key = (x, y) => x + ',' + y;
    E.forEach((e, i) => { const p = pt(e), k = key(Math.floor(p[0] / cell), Math.floor(p[1] / cell)); (grid.get(k) || grid.set(k, []).get(k)).push(i); });
    const pairs = [];
    E.forEach((e, i) => { const p = pt(e), gx = Math.floor(p[0] / cell), gy = Math.floor(p[1] / cell);
      for (let dx = -1; dx <= 1; dx++) for (let dy = -1; dy <= 1; dy++) for (const j of grid.get(key(gx + dx, gy + dy)) || []) { if (j <= i) continue;
        const f = E[j], q = pt(f), dd = dist(p, q); if (dd > tol) continue;
        if (f.o === e.o) { if (len(e.o.pts) > Math.max(3 * tol, 1e-9)) pairs.push([dd, i, j]); continue; }
        // cost: distance, plus a small penalty for sharp turns
        const a = dir(e), b = dir(f), turn = 1 + (a[0] * b[0] + a[1] * b[1]); pairs.push([dd + turn * tol * (opts.turnWeight ?? 0.15), i, j]); } });
    pairs.sort((x, y) => x[0] - y[0]); let joins = 0;
    for (const [, i, j] of pairs) { const e = E[i], f = E[j]; if (e.used || f.used || !e.o.alive || !f.o.alive) continue;
      if (e.o === f.o) { e.o.pts = e.o.pts.concat([e.o.pts[0].slice()]); e.used = f.used = true; joins++; continue; }
      const A = e.s ? rev(e.o.pts) : e.o.pts, B = f.s ? f.o.pts : rev(f.o.pts), C = d2(A[A.length - 1], B[0]) < 1e-12 ? A.concat(B.slice(1)) : A.concat(B);
      const n = { pts: C, alive: true }; P.push(n); e.o.alive = f.o.alive = false; e.used = f.used = true; joins++;
      const ea = e.mate, fb = f.mate; ea.o = n; ea.s = true; fb.o = n; fb.s = false; ea.mate = fb; fb.mate = ea; }
    return { paths: P.filter(o => o.alive).map(o => o.pts), joins }; }
  function smoothAll(paths, eps) { return paths.map(p => { if (p.length < 3) return p; const c = chaikin(p, 1); return rdp(c, eps); }); }
  // laser order: nearest next start (either end), from origin
  function order(paths, start = [0, 0]) { const left = paths.map(p => p), out = []; let cur = start;
    while (left.length) { let bi = 0, bd = Infinity, br = false;
      for (let i = 0; i < left.length; i++) { const p = left[i], a = d2(cur, p[0]), b = isClosed(p) ? Infinity : d2(cur, p[p.length - 1]);
        if (a < bd) { bd = a; bi = i; br = false; } if (b < bd) { bd = b; bi = i; br = true; } }
      const p = left.splice(bi, 1)[0], q = br ? rev(p) : p; out.push(q); cur = q[q.length - 1]; }
    return out; }
  const area = p => { let s = 0; for (let i = 0, n = p.length; i < n; i++) { const a = p[i], b = p[(i + 1) % n]; s += a[0] * b[1] - b[0] * a[1]; } return s / 2; };
  return { d2, dist, segD2, len, isClosed, rdp, chaikin, bbox, hit, densify, eraseCircle, joinEnds, smoothAll, order, area, rev };
})();
if (typeof module !== 'undefined') module.exports = G;
