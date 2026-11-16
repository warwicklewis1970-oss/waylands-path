// Waylands Path v3 - Bezier paths (Inkscape-style). A path is { n: [nodes], z: closed?, cut?: true }.
// Node: { x, y, i: [x,y] | null (handle towards previous node), o: [x,y] | null (handle towards next), s: 0 corner | 1 smooth }.
// A segment with no handles on either side is a straight line. Coordinates are design units (picture pixels).
'use strict';
const BZ = (() => {
  const sub = (a, b) => [a[0] - b[0], a[1] - b[1]], add = (a, b) => [a[0] + b[0], a[1] + b[1]], mul = (a, k) => [a[0] * k, a[1] * k];
  const dot = (a, b) => a[0] * b[0] + a[1] * b[1], len = a => Math.hypot(a[0], a[1]), unit = a => { const l = len(a) || 1; return [a[0] / l, a[1] / l]; };
  const dist = (a, b) => Math.hypot(a[0] - b[0], a[1] - b[1]), P = nd => [nd.x, nd.y];
  const node = (x, y, i = null, o = null, s = 0) => ({ x, y, i, o, s });
  const nseg = p => p.z ? p.n.length : p.n.length - 1;
  const nx = (p, k) => (k + 1) % p.n.length;
  const clone = v => JSON.parse(JSON.stringify(v));
  function seg(p, k) { const a = p.n[k], b = p.n[nx(p, k)]; return { a, b, line: !a.o && !b.i, C: [P(a), a.o ? a.o.slice() : P(a), b.i ? b.i.slice() : P(b), P(b)] }; }
  function at(C, t) { const u = 1 - t; return [u * u * u * C[0][0] + 3 * u * u * t * C[1][0] + 3 * u * t * t * C[2][0] + t * t * t * C[3][0], u * u * u * C[0][1] + 3 * u * u * t * C[1][1] + 3 * u * t * t * C[2][1] + t * t * t * C[3][1]]; }
  function d1(C, t) { const u = 1 - t; return [3 * u * u * (C[1][0] - C[0][0]) + 6 * u * t * (C[2][0] - C[1][0]) + 3 * t * t * (C[3][0] - C[2][0]), 3 * u * u * (C[1][1] - C[0][1]) + 6 * u * t * (C[2][1] - C[1][1]) + 3 * t * t * (C[3][1] - C[2][1])]; }
  function d2(C, t) { const u = 1 - t; return [6 * u * (C[2][0] - 2 * C[1][0] + C[0][0]) + 6 * t * (C[3][0] - 2 * C[2][0] + C[1][0]), 6 * u * (C[2][1] - 2 * C[1][1] + C[0][1]) + 6 * t * (C[3][1] - 2 * C[2][1] + C[1][1])]; }
  function split(C, t) { const l = (a, b) => [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t];
    const a = l(C[0], C[1]), b = l(C[1], C[2]), c = l(C[2], C[3]), d = l(a, b), e = l(b, c), f = l(d, e); return [[C[0], a, d, f], [f, e, c, C[3]]]; }
  function segD(p, a, b) { const v = sub(b, a), L = dot(v, v); let t = L ? dot(sub(p, a), v) / L : 0; t = Math.max(0, Math.min(1, t)); return [dist(p, add(a, mul(v, t))), t]; }
  // flatten one segment to points (excluding the first), chord error <= tol
  function flatSeg(C, tol, out, lineOK = true) {
    const flat = c => { const [d1_] = segD(c[1], c[0], c[3]), [d2_] = segD(c[2], c[0], c[3]); return Math.max(d1_, d2_) <= tol; };
    const rec = (c, dep) => { if (dep > 16 || flat(c)) { out.push(c[3]); return; } const [L, R] = split(c, 0.5); rec(L, dep + 1); rec(R, dep + 1); };
    rec(C, 0); return out; }
  function flatten(p, tol = 0.25) { if (!p.n.length) return []; const out = [P(p.n[0])];
    for (let k = 0; k < nseg(p); k++) { const s = seg(p, k); if (s.line) out.push(P(s.b)); else flatSeg(s.C, tol, out); } return out; }
  // per-segment flattening, for hit tests: [{k, pts}]
  function flatSegs(p, tol = 0.25) { const r = []; for (let k = 0; k < nseg(p); k++) { const s = seg(p, k), pts = [P(s.a)]; if (s.line) pts.push(P(s.b)); else flatSeg(s.C, tol, pts); r.push(pts); } return r; }
  function bbox(paths) { let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
    for (const p of paths) for (const q of flatten(p, 0.5)) { if (q[0] < x0) x0 = q[0]; if (q[0] > x1) x1 = q[0]; if (q[1] < y0) y0 = q[1]; if (q[1] > y1) y1 = q[1]; }
    return x0 === Infinity ? null : { x0, y0, x1, y1, w: x1 - x0, h: y1 - y0 }; }
  // nearest point on a path: {k, t, d, pt}
  function nearest(p, q, tol = 0.3) { let best = null; flatSegs(p, tol).forEach((pts, k) => { const n = pts.length - 1;
      for (let i = 0; i < n; i++) { const [d, t] = segD(q, pts[i], pts[i + 1]); if (!best || d < best.d) best = { k, i, n, t0: t, d }; } });
    if (!best) return null; const s = seg(p, best.k);
    let t = (best.i + best.t0) / best.n; if (!s.line) { // refine t on the true curve
      let lo = Math.max(0, t - 1 / best.n), hi = Math.min(1, t + 1 / best.n); for (let it = 0; it < 30; it++) { const m1 = lo + (hi - lo) / 3, m2 = hi - (hi - lo) / 3; if (dist(at(s.C, m1), q) < dist(at(s.C, m2), q)) hi = m2; else lo = m1; } t = (lo + hi) / 2; }
    const pt = s.line ? [s.a.x + (s.b.x - s.a.x) * t, s.a.y + (s.b.y - s.a.y) * t] : at(s.C, t); return { k: best.k, t, d: dist(pt, q), pt }; }
  function paramAt(p, k, q, t0) { const s = seg(p, k); if (s.line) { const v = sub(s.C[3], s.C[0]), L = dot(v, v); return L ? Math.max(0, Math.min(1, dot(sub(q, s.C[0]), v) / L)) : 0; }
    let bt = t0, bd = Infinity; for (let i = 0; i <= 64; i++) { const t = Math.max(0, Math.min(1, t0 - 0.25 + 0.5 * i / 64)), e = dist(at(s.C, t), q); if (e < bd) { bd = e; bt = t; } }
    let lo = Math.max(0, bt - 0.01), hi = Math.min(1, bt + 0.01); for (let it = 0; it < 40; it++) { const m1 = lo + (hi - lo) / 3, m2 = hi - (hi - lo) / 3; if (dist(at(s.C, m1), q) < dist(at(s.C, m2), q)) hi = m2; else lo = m1; } return (lo + hi) / 2; }
  function length(p) { const f = flatten(p, 0.3); let L = 0; for (let i = 1; i < f.length; i++) L += dist(f[i - 1], f[i]); return L; }
  // ---------- Schneider curve fitting ----------
  function bez(d, a, b, u, t1, t2) { const p0 = d[a], p3 = d[b]; let c00 = 0, c01 = 0, c11 = 0, x0 = 0, x1 = 0;
    for (let i = a; i <= b; i++) { const s = u[i - a], m = 1 - s, b0 = m * m * m, b1 = 3 * s * m * m, b2 = 3 * s * s * m, b3 = s * s * s, A1 = mul(t1, b1), A2 = mul(t2, b2);
      c00 += dot(A1, A1); c01 += dot(A1, A2); c11 += dot(A2, A2); const tmp = sub(d[i], add(mul(p0, b0 + b1), mul(p3, b2 + b3))); x0 += dot(A1, tmp); x1 += dot(A2, tmp); }
    const det = c00 * c11 - c01 * c01, sl = dist(p0, p3); let al = det ? (x0 * c11 - x1 * c01) / det : 0, ar = det ? (c00 * x1 - c01 * x0) / det : 0;
    if (!(al > sl * 1e-3) || !(ar > sl * 1e-3) || al > sl * 2 || ar > sl * 2) al = ar = sl / 3;
    return [p0, add(p0, mul(t1, al)), add(p3, mul(t2, ar)), p3]; }
  function maxErr(d, a, b, C, u) { let m = 0, sp = (a + b) >> 1; for (let i = a + 1; i < b; i++) { const e = dist(at(C, u[i - a]), d[i]); if (e > m) { m = e; sp = i; } } return [m, sp]; }
  function chord(d, a, b) { const u = [0]; for (let i = a + 1; i <= b; i++) u.push(u[u.length - 1] + dist(d[i], d[i - 1])); const L = u[u.length - 1] || 1; return u.map(v => v / L); }
  function reparam(d, a, C, u) { return u.map((s, j) => { const q = at(C, s), q1 = d1(C, s), q2 = d2(C, s), df = sub(q, d[a + j]), den = dot(q1, q1) + dot(df, q2); return den ? Math.max(0, Math.min(1, s - dot(df, q1) / den)) : s; }); }
  function tanAt(d, i, dir, arm) { let j = i; const n = d.length; while (j + dir >= 0 && j + dir < n && dist(d[j], d[i]) < arm) j += dir; return j === i ? [1, 0] : unit(sub(d[j], d[i])); }
  function fitCubic(d, tol, t1, t2, arm = 3) { const out = []; if (d.length < 2) return out;
    t1 = t1 || tanAt(d, 0, 1, arm); t2 = t2 || tanAt(d, d.length - 1, -1, arm);
    const rec = (a, b, ta, tb, depth) => { if (b - a < 2 || depth > 12) { const L = dist(d[a], d[b]) / 3; out.push([d[a], add(d[a], mul(ta, L)), add(d[b], mul(tb, L)), d[b]]); return; }
      let u = chord(d, a, b), C = bez(d, a, b, u, ta, tb), [e, sp] = maxErr(d, a, b, C, u); if (e < tol) { out.push(C); return; }
      if (e < tol * 4) for (let it = 0; it < 12; it++) { u = reparam(d, a, C, u); C = bez(d, a, b, u, ta, tb); [e, sp] = maxErr(d, a, b, C, u); if (e < tol) { out.push(C); return; } }
      sp = Math.max(a + 1, Math.min(b - 1, sp)); const l = tanAt(d, sp, -1, arm), r = tanAt(d, sp, 1, arm), tc = unit(sub(l, r));
      rec(a, sp, ta, tc, depth + 1); rec(sp, b, mul(tc, -1), tb, depth + 1); };
    rec(0, d.length - 1, t1, t2, 0); return out; }
  // ---------- polyline -> Bezier path with nodes only at corners, ends and where a curve needs one ----------
  function smoothPts(pts, closed, r) { if (r < 1 || pts.length < 5) return pts.map(q => q.slice()); const n = pts.length, o = [];
    for (let i = 0; i < n; i++) { if (!closed && (i === 0 || i === n - 1)) { o.push(pts[i].slice()); continue; } let sx = 0, sy = 0, c = 0; const rr = closed ? r : Math.min(r, i, n - 1 - i);
      for (let j = -rr; j <= rr; j++) { const q = pts[(i + j + n) % n]; sx += q[0]; sy += q[1]; c++; } o.push([sx / c, sy / c]); } return o; }
  function resampleArc(pts, step) { const o = [pts[0]]; let acc = 0; for (let i = 1; i < pts.length; i++) { let a = pts[i - 1]; const b = pts[i]; let L = dist(a, b);
      while (acc + L >= step) { const t = (step - acc) / L, q = [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t]; o.push(q); a = q; L = dist(a, b); acc = 0; } acc += L; }
    if (dist(o[o.length - 1], pts[pts.length - 1]) > step * 0.3) o.push(pts[pts.length - 1]); else o[o.length - 1] = pts[pts.length - 1]; return o; }
  function corners(d, closed, arm, deg) { const n = d.length, ang = new Float32Array(n), th = deg * Math.PI / 180, res = [];
    const walk = (i, dir) => { let j = i, s = 0; while (s < arm) { const k = closed ? (j + dir + n) % n : j + dir; if (k < 0 || k >= n || k === i) return -1; s += dist(d[j], d[k]); j = k; } return j; };
    for (let i = 0; i < n; i++) { const a = walk(i, -1), b = walk(i, 1); if (a < 0 || b < 0) continue; const v1 = sub(d[i], d[a]), v2 = sub(d[b], d[i]);
      ang[i] = Math.acos(Math.max(-1, Math.min(1, dot(unit(v1), unit(v2))))); }
    const W = Math.max(1, Math.round(arm)); for (let i = 0; i < n; i++) { if (ang[i] < th) continue; let mx = true;
      for (let j = -W; j <= W && mx; j++) { if (!j) continue; const k = closed ? (i + j + n) % n : i + j; if (k < 0 || k >= n) continue; if (ang[k] > ang[i] || (ang[k] === ang[i] && j < 0)) mx = false; }
      if (mx) res.push(i); } return res; }
  function rdpIdx(d, a, b, eps, out) { let mx = -1, mi = -1; for (let i = a + 1; i < b; i++) { const e = segD(d[i], d[a], d[b])[0]; if (e > mx) { mx = e; mi = i; } }
    if (mx > eps) { rdpIdx(d, a, mi, eps, out); out.push(mi); rdpIdx(d, mi, b, eps, out); } }
  function fromPolyline(pts0, o = {}) { const closed = !!o.closed, tol = o.tol || 1, arm = o.arm || 4, deg = o.corner || 35, lineTol = o.lineTol || tol, minStraight = o.minStraight || arm * 6, straightDev = o.straightDev || Math.max(0.6, lineTol * 0.45);
    let pts = pts0.slice(); if (closed && pts.length > 2 && dist(pts[0], pts[pts.length - 1]) < 1e-6) pts.pop(); if (pts.length < 2) return null;
    const step = Math.max(0.5, Math.min(1.5, arm / 4)); let d = resampleArc(closed ? pts.concat([pts[0]]) : pts, step); if (closed) d.pop();
    if (d.length < 2) d = pts.map(q => q.slice());
    const ds = smoothPts(d, closed, Math.max(1, Math.round((o.smooth || arm / 3) / step)));
    let cs = corners(ds, closed, arm, deg);
    const forced = (o.forced || []).map(q => { let bi = 0, bd = Infinity; d.forEach((p, i) => { const e = dist(p, q); if (e < bd) { bd = e; bi = i; } }); d[bi] = q.slice(); return bi; });
    if (!closed) { d[0] = pts[0].slice(); d[d.length - 1] = pts[pts.length - 1].slice(); }
    cs = Array.from(new Set(cs.concat(forced))).sort((a, b) => a - b);
    let idx; if (closed) { if (!cs.length) cs = [0]; const r = cs[0]; d = d.slice(r).concat(d.slice(0, r)); idx = cs.map(c => c - r); idx.push(d.length); d.push(d[0].slice()); }
    else idx = [0].concat(cs.filter(c => c > 0 && c < d.length - 1), [d.length - 1]);
    const N = [node(d[0][0], d[0][1])];
    const pushLine = q => N.push(node(q[0], q[1]));
    const pushCurve = (piece, t1, t2) => { const cv = fitCubic(piece, tol, t1, t2, arm); cv.forEach((C, j) => { N[N.length - 1].o = C[1]; N.push(node(C[3][0], C[3][1], C[2], null, j < cv.length - 1 ? 1 : 0)); }); };
    for (let s = 0; s < idx.length - 1; s++) { const a = idx[s], b = idx[s + 1];
      // straight runs inside this corner-to-corner piece
      const brk = [a]; rdpIdx(d, a, b, lineTol, brk); brk.push(b);
      const runs = []; for (let i = 0; i < brk.length - 1; i++) { const p0 = brk[i], p1 = brk[i + 1]; let dev = 0, pos = 0, neg = 0, mi = p0; const cv0 = sub(d[p1], d[p0]), cl = len(cv0) || 1;
        for (let q = p0 + 1; q < p1; q++) { const e = segD(d[q], d[p0], d[p1])[0]; if (e > dev) { dev = e; mi = q; } const sd = ((d[q][0] - d[p0][0]) * cv0[1] - (d[q][1] - d[p0][1]) * cv0[0]) / cl; if (sd > 0.35) pos++; else if (sd < -0.35) neg++; }
        const ln = dist(d[p0], d[p1]), tpos = (mi - p0) / Math.max(1, p1 - p0), bowed = dev > straightDev && Math.max(pos, neg) > 0.85 * (pos + neg) && tpos > 0.25 && tpos < 0.75, flat = dev <= straightDev || (dev <= lineTol && !bowed); runs.push({ a: p0, b: p1, st: flat ? (ln >= minStraight || brk.length === 2) : (brk.length === 2 && ln < minStraight * 0.5) }); }
      // merge neighbouring curvy runs
      const groups = []; for (const r of runs) { const g = groups[groups.length - 1]; if (g && !g.st && !r.st) g.b = r.b; else groups.push(Object.assign({}, r)); }
      groups.forEach((g, gi) => { const piece = d.slice(g.a, g.b + 1);
        if (g.st || piece.length < 4) { if (gi > 0 && !groups[gi - 1].st) N[N.length - 1].s = 1; pushLine(d[g.b]); return; }
        const prevSt = gi > 0 && groups[gi - 1].st, nextSt = gi < groups.length - 1 && groups[gi + 1].st;
        const t1 = prevSt ? unit(sub(d[g.a], d[groups[gi - 1].a])) : null, t2 = nextSt ? unit(sub(d[g.b], d[groups[gi + 1].b])) : null;
        if (prevSt) N[N.length - 1].s = 1; pushCurve(piece, t1, t2); }); }
    let path = { n: N, z: false }; if (closed) { const L = N.pop(); N[0].i = L.i; path.z = true; if (cs.length === 1 && !(o.forced && o.forced.length) && N.length > 1 && corners(ds, true, arm, deg).length === 0) N[0].s = 1; }
    for (const nd of N) if (nd.s && !(nd.i || nd.o)) nd.s = 0;
    if (o.forced && o.forced.length) { const fk = new Set(o.forced.map(q => q[0].toFixed(4) + ',' + q[1].toFixed(4))); for (const nd of N) if (fk.has(nd.x.toFixed(4) + ',' + nd.y.toFixed(4))) nd.keep = true; }
    return mergeCollinear(path, 1.5); }
  // drop nodes between two straight segments that are in line
  function mergeCollinear(p, maxDeg) { const n = p.n; if (n.length < 3) return p; const th = maxDeg * Math.PI / 180;
    for (let j = p.z ? n.length - 1 : n.length - 2; j >= (p.z ? 0 : 1); j--) { if (n.length < 3) break; const a = n[(j - 1 + n.length) % n.length], b = n[j], c = n[(j + 1) % n.length];
      if (a.o || b.i || b.o || c.i || b.keep) continue; const v1 = sub(P(b), P(a)), v2 = sub(P(c), P(b)); if (Math.acos(Math.max(-1, Math.min(1, dot(unit(v1), unit(v2))))) < th) n.splice(j, 1); }
    return p; }
  // ---------- editing ----------
  function reverse(p) { p.n.reverse(); for (const nd of p.n) { const t = nd.i; nd.i = nd.o; nd.o = t; } return p; }
  function moveNode(nd, dx, dy) { nd.x += dx; nd.y += dy; if (nd.i) { nd.i[0] += dx; nd.i[1] += dy; } if (nd.o) { nd.o[0] += dx; nd.o[1] += dy; } }
  function insertNode(p, k, t) { const s = seg(p, k), j = k + 1; if (s.line) { const q = [s.a.x + (s.b.x - s.a.x) * t, s.a.y + (s.b.y - s.a.y) * t]; p.n.splice(j, 0, node(q[0], q[1])); return j; }
    const [L, R] = split(s.C, t); s.a.o = L[1]; s.b.i = R[2]; p.n.splice(j, 0, node(L[3][0], L[3][1], L[2], R[1], 1)); return j; }
  function deleteNode(p, j) { const n = p.n, m = n.length; if (m <= 2) return false;
    if (!p.z && (j === 0 || j === m - 1)) { n.splice(j, 1); if (j === 0) n[0].i = null; else n[n.length - 1].o = null; return true; }
    const kp = (j - 1 + m) % m, a = n[kp], b = n[(j + 1) % m], s1 = seg(p, kp), s2 = seg(p, j);
    if (s1.line && s2.line) { n.splice(j, 1); return true; }
    const pts = []; flatSeg(s1.C, 0.2, pts); flatSeg(s2.C, 0.2, pts); pts.unshift(P(a)); const dd = resampleArc(pts, Math.max(0.5, dist(P(a), P(b)) / 40));
    const t1 = a.o ? unit(sub(a.o, P(a))) : unit(sub(P(n[j]), P(a))), t2 = b.i ? unit(sub(b.i, P(b))) : unit(sub(P(n[j]), P(b)));
    const C = bez(dd, 0, dd.length - 1, chord(dd, 0, dd.length - 1), t1, t2); a.o = C[1]; b.i = C[2]; n.splice(j, 1); return true; }
  function setSmooth(p, j, on) { const n = p.n, nd = n[j]; nd.s = on ? 1 : 0; if (!on) return;
    const prev = (p.z || j > 0) ? n[(j - 1 + n.length) % n.length] : null, next = (p.z || j < n.length - 1) ? n[(j + 1) % n.length] : null;
    const c = P(nd); let dir; if (nd.i && nd.o) dir = unit(sub(nd.o, nd.i)); else if (prev && next) dir = unit(sub(P(next), P(prev))); else if (next) dir = unit(sub(P(next), c)); else if (prev) dir = unit(sub(c, P(prev))); else return;
    if (prev) { const L = nd.i ? dist(nd.i, c) : dist(P(prev), c) / 3; nd.i = sub(c, mul(dir, L)); if (!prev.o) prev.o = add(P(prev), mul(sub(c, P(prev)), 1 / 3)); }
    if (next) { const L = nd.o ? dist(nd.o, c) : dist(P(next), c) / 3; nd.o = add(c, mul(dir, L)); if (!next.i) next.i = add(P(next), mul(sub(c, P(next)), 1 / 3)); } }
  function makeLine(p, k) { const s = seg(p, k); s.a.o = null; s.b.i = null; if (s.a.s && !s.a.i) s.a.s = 0; if (s.b.s && !s.b.o) s.b.s = 0; s.a.s = s.a.i && s.a.s ? 0 : s.a.s; s.b.s = s.b.o && s.b.s ? 0 : s.b.s; }
  function makeCurve(p, k) { const s = seg(p, k); if (!s.line) return; const a = P(s.a), b = P(s.b); s.a.o = add(a, mul(sub(b, a), 1 / 3)); s.b.i = add(a, mul(sub(b, a), 2 / 3)); }
  // drag the middle of a segment: least-change move of both handles so the curve passes through the finger
  function bend(p, k, t, dx, dy) { makeCurve(p, k); const s = seg(p, k); t = Math.max(0.12, Math.min(0.88, t)); const A = 3 * (1 - t) * (1 - t) * t, B = 3 * (1 - t) * t * t, q = A * A + B * B;
    s.a.o = add(s.a.o, mul([dx, dy], A / q)); s.b.i = add(s.b.i, mul([dx, dy], B / q)); }
  // split helpers. Returns the new paths that replace p.
  function breakAt(p, j) { const n = p.n; if (p.z) { const r = clone(n.slice(j).concat(n.slice(0, j))); r.push(clone(r[0])); r[0].i = null; r[r.length - 1].o = null; r[0].s = r[r.length - 1].s = 0; return [Object.assign({}, p, { n: r, z: false })]; }
    if (j <= 0 || j >= n.length - 1) return [p]; const A = clone(n.slice(0, j + 1)), Bn = clone(n.slice(j)); A[A.length - 1].o = null; Bn[0].i = null; A[A.length - 1].s = Bn[0].s = 0;
    return [Object.assign({}, p, { n: A, z: false }), Object.assign({}, p, { n: Bn, z: false })]; }
  function deleteSeg(p, k) { const n = p.n; if (p.z) { const r = clone(n.slice(k + 1).concat(n.slice(0, k + 1))); r[0].i = null; r[r.length - 1].o = null; return r.length > 1 ? [Object.assign({}, p, { n: r, z: false })] : []; }
    const A = clone(n.slice(0, k + 1)), Bn = clone(n.slice(k + 1)); if (A.length) A[A.length - 1].o = null; if (Bn.length) Bn[0].i = null; return [A, Bn].filter(x => x.length > 1).map(x => Object.assign({}, p, { n: x, z: false })); }
  // cut a path at (k1,t1) and (k2,t2) (k1,t1 before k2,t2) and remove the part between; for closed paths keeps the outside part
  function cutOut(p, k1, t1, k2, t2) { const q = clone(p); let j2 = insertNode(q, k2, t2); let j1 = j2; // insert later one first so indices of earlier stay valid
    if (k1 === k2) { j1 = insertNode(q, k1, t1 / Math.max(1e-9, t2)); j2 = j1 + 1; } else j1 = insertNode(q, k1, t1), j2 += 1;
    q.n[j1].s = 0; q.n[j2].s = 0;
    if (q.z) { const n = q.n, r = clone(n.slice(j2).concat(n.slice(0, j1 + 1))); r[0].i = null; r[r.length - 1].o = null; return [Object.assign({}, p, { n: r, z: false })]; }
    const A = clone(q.n.slice(0, j1 + 1)), Bn = clone(q.n.slice(j2)); A[A.length - 1].o = null; Bn[0].i = null;
    return [A, Bn].filter(x => x.length > 1 && !(x.length === 2 && dist(P(x[0]), P(x[1])) < 1e-6)).map(x => Object.assign({}, p, { n: x, z: false })); }
  // join two ends. a,b = {p, end:0|1}. Returns resulting path(s).
  function join(pa, ea, pb, eb, mergeTol) { if (pa === pb) { const n = pa.n, A = n[0], Z = n[n.length - 1]; if (dist(P(A), P(Z)) <= mergeTol) { A.i = Z.i; n.pop(); } pa.z = true; return [pa]; }
    const a = clone(pa), b = clone(pb); if (ea === 0) reverse(a); if (eb === 1) reverse(b); const L = a.n[a.n.length - 1], F = b.n[0];
    if (dist(P(L), P(F)) <= mergeTol) { const mxp = (L.x + F.x) / 2, myp = (L.y + F.y) / 2; L.o = F.o; moveNode(L, mxp - L.x, 0); L.x = mxp; L.y = myp; b.n.shift(); }
    return [{ n: a.n.concat(b.n), z: false, cut: a.cut || b.cut || undefined }]; }
  // where does a straight segment (a->b) cross a path? returns [{k,t,u,pt}] with u = position along a->b
  function crossings(p, a, b, tol = 0.2) { const out = [];
    flatSegs(p, tol).forEach((pts, k) => { let acc = 0; const tot = []; for (let i = 1; i < pts.length; i++) { acc += dist(pts[i - 1], pts[i]); tot.push(acc); }
      for (let i = 1; i < pts.length; i++) { const c = pts[i - 1], d = pts[i], r = sub(b, a), s = sub(d, c), den = r[0] * s[1] - r[1] * s[0]; if (Math.abs(den) < 1e-12) continue;
        const u = ((c[0] - a[0]) * s[1] - (c[1] - a[1]) * s[0]) / den, v = ((c[0] - a[0]) * r[1] - (c[1] - a[1]) * r[0]) / den;
        if (u >= -1e-9 && u <= 1 + 1e-9 && v >= -1e-9 && v <= 1 + 1e-9) { const sl = (i > 1 ? tot[i - 2] : 0) + v * dist(c, d), tt = acc ? sl / acc : 0; out.push({ k, t: tt, u, pt: add(a, mul(r, u)) }); } } });
    for (const c of out) c.t = paramAt(p, c.k, c.pt, c.t); return out; }
  // where does path L cross path O? list of {k,t,s (arc position on L)} sorted along L
  function pathCrossings(L, O) { const fo = flatten(O, 0.2), res = []; let arc = 0;
    flatSegs(L, 0.2).forEach((pts, k) => { const sl = []; let acc = 0; for (let i = 1; i < pts.length; i++) { acc += dist(pts[i - 1], pts[i]); sl.push(acc); }
      for (let i = 1; i < pts.length; i++) { const a = pts[i - 1], b = pts[i];
        for (let j = 1; j < fo.length; j++) { const c = fo[j - 1], d = fo[j], r = sub(b, a), s = sub(d, c), den = r[0] * s[1] - r[1] * s[0]; if (Math.abs(den) < 1e-12) continue;
          const u = ((c[0] - a[0]) * s[1] - (c[1] - a[1]) * s[0]) / den, v = ((c[0] - a[0]) * r[1] - (c[1] - a[1]) * r[0]) / den;
          if (u >= 0 && u < 1 && v >= 0 && v <= 1) { const here = (i > 1 ? sl[i - 2] : 0) + u * dist(a, b); res.push({ k, t: acc ? here / acc : 0, s: arc + here, pt: add(a, mul(r, u)) }); } } }
      arc += acc; });
    for (const c of res) c.t = paramAt(L, c.k, c.pt, c.t); res.sort((x, y) => x.s - y.s); const out = []; for (const c of res) if (!out.length || c.s - out[out.length - 1].s > 0.05) out.push(c); return out; }
  function inside(poly, q) { let c = false; for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) { const a = poly[i], b = poly[j]; if ((a[1] > q[1]) !== (b[1] > q[1]) && q[0] < (b[0] - a[0]) * (q[1] - a[1]) / (b[1] - a[1]) + a[0]) c = !c; } return c; }
  function pointAt(p, k, t) { const s = seg(p, k); return s.line ? [s.a.x + (s.b.x - s.a.x) * t, s.a.y + (s.b.y - s.a.y) * t] : at(s.C, t); }
  // segment-wise position helpers for arc positions on a path
  function locate(p, s) { let acc = 0; const segs = flatSegs(p, 0.2); for (let k = 0; k < segs.length; k++) { const pts = segs[k]; let L = 0; for (let i = 1; i < pts.length; i++) L += dist(pts[i - 1], pts[i]); if (acc + L >= s || k === segs.length - 1) { const f = L ? Math.max(0, Math.min(1, (s - acc) / L)) : 0; let r = 0, q = pts[0]; for (let i = 1; i < pts.length; i++) { const l2 = dist(pts[i - 1], pts[i]); if (r + l2 >= f * L) { const u2 = l2 ? (f * L - r) / l2 : 0; q = add(pts[i - 1], mul(sub(pts[i], pts[i - 1]), u2)); break; } r += l2; q = pts[i]; } return { k, t: paramAt(p, k, q, f) }; } acc += L; } return { k: 0, t: 0 }; }
  function countNodes(paths) { return paths.reduce((a, p) => a + p.n.length, 0); }
  // simple polyline path (import / pen fallback)
  function fromPoints(pts, closed) { return { n: pts.map(q => node(q[0], q[1])), z: !!closed }; }
  return { node, nseg, seg, at, d1, split, flatten, flatSegs, bbox, nearest, length, fitCubic, fromPolyline, mergeCollinear, reverse, moveNode, insertNode, deleteNode, setSmooth, makeLine, makeCurve, bend, breakAt, deleteSeg, cutOut, join, crossings, pathCrossings, inside, pointAt, paramAt, locate, countNodes, fromPoints, clone, segD, dist, resampleArc };
})();
if (typeof module !== 'undefined') module.exports = BZ;
