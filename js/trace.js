// Waylands Path v3 - line-drawing tracer (own code, no libraries). Line drawings only (AI line art, logos, colouring-page style).
// ink -> design area (grey edge = the cut line around everything) -> one clean centre line per drawn line (thinning) ->
// a proper line graph: junctions meet at one shared node, spurs/specks removed, small gaps closed, lines along the edge merged into
// the cut -> chained through junctions so a line carries on straight past a crossing -> Bezier paths with nodes only at
// corners, ends, junctions and where a curve needs one. Straight runs are exact lines; near level/upright lines are snapped.
'use strict';
const T = (() => {
  const VERSION = 3;
  const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
  function grey(rgba, w, h) { const g = new Float32Array(w * h);
    for (let i = 0, p = 0; i < g.length; i++, p += 4) { const a = rgba[p + 3] / 255; // transparent = white (never burns)
      const v = (0.299 * rgba[p] + 0.587 * rgba[p + 1] + 0.114 * rgba[p + 2]) / 255; g[i] = v * a + (1 - a); }
    return g; }
  function percentile(g, q) { const H = new Uint32Array(256); for (const v of g) H[Math.max(0, Math.min(255, v * 255 | 0))]++;
    let s = 0, t = q * g.length; for (let i = 0; i < 256; i++) { s += H[i]; if (s >= t) return i / 255; } return 1; }
  function autoContrast(g) { const lo = percentile(g, 0.01), hi = percentile(g, 0.99), r = Math.max(0.05, hi - lo), o = new Float32Array(g.length);
    for (let i = 0; i < g.length; i++) o[i] = Math.max(0, Math.min(1, (g[i] - lo) / r)); return o; }
  function otsu(g) { const H = new Float64Array(256); for (const v of g) H[Math.max(0, Math.min(255, v * 255 | 0))]++;
    let sum = 0; for (let i = 0; i < 256; i++) sum += i * H[i]; let sB = 0, wB = 0, best = 0, th = 128;
    for (let i = 0; i < 256; i++) { wB += H[i]; if (!wB) continue; const wF = g.length - wB; if (!wF) break; sB += i * H[i];
      const mB = sB / wB, mF = (sum - sB) / wF, v = wB * wF * (mB - mF) ** 2; if (v > best) { best = v; th = i; } }
    return (th + 0.5) / 255; }
  function blur(g, w, h, s) { if (s < 0.3) return g.slice(); const r = Math.ceil(s * 3), k = new Float32Array(2 * r + 1); let ks = 0;
    for (let i = -r; i <= r; i++) { k[i + r] = Math.exp(-i * i / (2 * s * s)); ks += k[i + r]; } for (let i = 0; i < k.length; i++) k[i] /= ks;
    const t = new Float32Array(w * h), o = new Float32Array(w * h);
    for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) { let a = 0; for (let i = -r; i <= r; i++) { const xx = x + i < 0 ? 0 : x + i >= w ? w - 1 : x + i; a += g[y * w + xx] * k[i + r]; } t[y * w + x] = a; }
    for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) { let a = 0; for (let i = -r; i <= r; i++) { const yy = y + i < 0 ? 0 : y + i >= h ? h - 1 : y + i; a += t[yy * w + x] * k[i + r]; } o[y * w + x] = a; }
    return o; }
  // share of mid-tones: photos have lots, line drawings / logos have few
  function removeSpecks(m, w, h, minArea) { if (minArea < 1) return 0; const seen = new Uint8Array(w * h), st = new Int32Array(w * h); let removed = 0;
    for (let i = 0; i < m.length; i++) { if (!m[i] || seen[i]) continue; let n = 0, top = 0; st[top++] = i; seen[i] = 1; const comp = [];
      while (top) { const p = st[--top]; comp.push(p); n++; const x = p % w, y = (p / w) | 0;
        for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) { const xx = x + dx, yy = y + dy; if (xx < 0 || yy < 0 || xx >= w || yy >= h) continue;
          const q = yy * w + xx; if (m[q] && !seen[q]) { seen[q] = 1; st[top++] = q; } } }
      if (n < minArea) { for (const p of comp) m[p] = 0; removed++; } }
    return removed; }
  // fill enclosed background holes smaller than maxArea (stops tiny pin-holes turning into tiny loops)
  function fillSmallHoles(m, w, h, maxArea) { const seen = new Uint8Array(w * h), st = new Int32Array(w * h);
    for (let i = 0; i < m.length; i++) { if (m[i] || seen[i]) continue; let top = 0, edge = false; st[top++] = i; seen[i] = 1; const comp = [];
      while (top) { const p = st[--top]; comp.push(p); const x = p % w, y = (p / w) | 0; if (!x || !y || x === w - 1 || y === h - 1) edge = true;
        for (const q of [p - 1, p + 1, p - w, p + w]) { if (q < 0 || q >= m.length || (q === p - 1 && !x) || (q === p + 1 && x === w - 1)) continue; if (!m[q] && !seen[q]) { seen[q] = 1; st[top++] = q; } } }
      if (!edge && comp.length <= maxArea) for (const p of comp) m[p] = 1; } }
  // Solid dots (pupils, a nose, full stops) would thin down to nothing, so they are taken out and kept as small outlines instead.
  function thin(m, w, h) { // Zhang-Suen; border pixels cleared first
    for (let x = 0; x < w; x++) { m[x] = 0; m[(h - 1) * w + x] = 0; } for (let y = 0; y < h; y++) { m[y * w] = 0; m[y * w + w - 1] = 0; }
    const del = []; let changed = true;
    while (changed) { changed = false;
      for (let pass = 0; pass < 2; pass++) { del.length = 0;
        for (let y = 1; y < h - 1; y++) for (let x = 1; x < w - 1; x++) { const i = y * w + x; if (!m[i]) continue;
          const p2 = m[i - w], p3 = m[i - w + 1], p4 = m[i + 1], p5 = m[i + w + 1], p6 = m[i + w], p7 = m[i + w - 1], p8 = m[i - 1], p9 = m[i - w - 1];
          const B = p2 + p3 + p4 + p5 + p6 + p7 + p8 + p9; if (B < 2 || B > 6) continue;
          const A = (!p2 && p3) + (!p3 && p4) + (!p4 && p5) + (!p5 && p6) + (!p6 && p7) + (!p7 && p8) + (!p8 && p9) + (!p9 && p2); if (A !== 1) continue;
          if (pass === 0 ? (p2 * p4 * p6 || p4 * p6 * p8) : (p2 * p4 * p8 || p2 * p6 * p8)) continue; del.push(i); }
        if (del.length) { changed = true; for (const i of del) m[i] = 0; } } }
    // remove staircase corner pixels so diagonal lines don't look like junctions
    for (let y = 1; y < h - 1; y++) for (let x = 1; x < w - 1; x++) { const i = y * w + x; if (!m[i]) continue;
      const N = m[i - w], E = m[i + 1], S = m[i + w], W = m[i - 1], NE = m[i - w + 1], SE = m[i + w + 1], SW = m[i + w - 1], NW = m[i - w - 1];
      if ((N && E && !S && !W && !SW) || (E && S && !N && !W && !NW) || (S && W && !N && !E && !NE) || (W && N && !S && !E && !SE)) m[i] = 0; }
    return m; }
  const NB = [[1, 0], [0, 1], [-1, 0], [0, -1], [1, 1], [-1, 1], [-1, -1], [1, -1]]; // 4-neighbours first
  function contoursIso(f, w, h, level) { const W = w + 2, H = h + 2, v = new Float32Array(W * H).fill(level + 1);
    for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) v[(y + 1) * W + x + 1] = f[y * w + x];
    const nbA = new Int32Array(W * H * 2).fill(-1), nbB = new Int32Array(W * H * 2).fill(-1);
    const link = (a, c) => { if (nbA[a] < 0) nbA[a] = c; else nbB[a] = c; if (nbA[c] < 0) nbA[c] = a; else nbB[c] = a; };
    for (let y = 0; y < H - 1; y++) for (let x = 0; x < W - 1; x++) { const i = y * W + x, a = v[i], b = v[i + 1], c2 = v[i + W + 1], d = v[i + W];
      const c = (a < level) * 8 + (b < level) * 4 + (c2 < level) * 2 + (d < level); if (!c || c === 15) continue;
      const T_ = 2 * i, B_ = 2 * (i + W), L_ = 2 * i + 1, R_ = 2 * (i + 1) + 1, mid = (a + b + c2 + d) / 4 < level;
      switch (c) { case 1: case 14: link(L_, B_); break; case 2: case 13: link(B_, R_); break; case 3: case 12: link(L_, R_); break;
        case 4: case 11: link(T_, R_); break; case 6: case 9: link(T_, B_); break; case 7: case 8: link(L_, T_); break;
        case 5: if (mid) { link(L_, T_); link(B_, R_); } else { link(L_, B_); link(T_, R_); } break;
        case 10: if (mid) { link(T_, R_); link(L_, B_); } else { link(L_, T_); link(B_, R_); } break; } }
    const pt = k => { const e = k >> 1, x = e % W, y = (e / W) | 0, a = v[e];
      if (k & 1) { const b = v[e + W], t = b === a ? 0.5 : Math.max(0, Math.min(1, (level - a) / (b - a))); return [x - 0.5, y - 0.5 + t]; }
      const b = v[e + 1], t = b === a ? 0.5 : Math.max(0, Math.min(1, (level - a) / (b - a))); return [x - 0.5 + t, y - 0.5]; };
    const seen = new Uint8Array(W * H * 2), loops = [];
    for (let k = 0; k < nbA.length; k++) { if (nbA[k] < 0 || seen[k]) continue; const loop = []; let prev = -1, cur = k;
      while (cur >= 0 && !seen[cur]) { seen[cur] = 1; loop.push(pt(cur)); const nx = nbA[cur] !== prev ? nbA[cur] : nbB[cur]; prev = cur; cur = nx; }
      if (loop.length > 2) { loop.push(loop[0].slice()); loops.push(loop); } }
    return loops; }
  // Canny edges: blur, Sobel, thin to the ridge (non-maximum suppression), keep strong edges plus weak ones touching them.
  // Each edge pixel also gets a sub-pixel offset to the true gradient peak.
  function prep(img, maxDim) { const sc = Math.min(1, maxDim / Math.max(img.w, img.h)), w = Math.max(8, Math.round(img.w * sc)), h = Math.max(8, Math.round(img.h * sc));
    const d = resample(img, w, h); let na = 0; for (let i = 3; i < d.length; i += 4) if (d[i] < 242) na++;
    return { d, w, h, sc, hasAlpha: na > w * h * 0.01 }; }
  function resample(img, w, h) { if (w === img.w && h === img.h) return img.data; const o = new Float32Array(w * h * 4), c = new Float32Array(w * h), fx = img.w / w, fy = img.h / h;
    for (let y = 0; y < img.h; y++) { const ty = Math.min(h - 1, (y / fy) | 0); for (let x = 0; x < img.w; x++) { const tx = Math.min(w - 1, (x / fx) | 0), t = ty * w + tx, s = (y * img.w + x) * 4;
      o[t * 4] += img.data[s]; o[t * 4 + 1] += img.data[s + 1]; o[t * 4 + 2] += img.data[s + 2]; o[t * 4 + 3] += img.data[s + 3]; c[t]++; } }
    const r = new Uint8ClampedArray(w * h * 4); for (let i = 0; i < w * h; i++) { const n = c[i] || 1; for (let k = 0; k < 4; k++) r[i * 4 + k] = o[i * 4 + k] / n; } return r; }
  // Euclidean distance transform (Felzenszwalb) of "distance to nearest set pixel", squared, in px^2
  function edt(m, w, h) { const INF = 1e20, f = new Float64Array(Math.max(w, h)), d = new Float64Array(w * h), v = new Int32Array(Math.max(w, h)), z = new Float64Array(Math.max(w, h) + 1), o = new Float64Array(Math.max(w, h));
    const one = n => { let k = 0; v[0] = 0; z[0] = -INF; z[1] = INF;
      for (let q = 1; q < n; q++) { let s; do { const p = v[k]; s = ((f[q] + q * q) - (f[p] + p * p)) / (2 * q - 2 * p); if (s <= z[k]) k--; else break; } while (k >= 0); k++; v[k] = q; z[k] = s; z[k + 1] = INF; }
      k = 0; for (let q = 0; q < n; q++) { while (z[k + 1] < q) k++; const p = v[k]; o[q] = (q - p) * (q - p) + f[p]; } };
    for (let i = 0; i < w * h; i++) d[i] = m[i] ? 0 : INF;
    for (let x = 0; x < w; x++) { for (let y = 0; y < h; y++) f[y] = d[y * w + x]; one(h); for (let y = 0; y < h; y++) d[y * w + x] = o[y]; }
    for (let y = 0; y < h; y++) { for (let x = 0; x < w; x++) f[x] = d[y * w + x]; one(w); for (let x = 0; x < w; x++) d[y * w + x] = o[x]; }
    return d; }
  function fillHoles(m, w, h) { const out = new Uint8Array(w * h).fill(1), st = new Int32Array(w * h); let top = 0;
    const push = i => { if (!m[i] && out[i]) { out[i] = 0; st[top++] = i; } };
    for (let x = 0; x < w; x++) { push(x); push((h - 1) * w + x); } for (let y = 0; y < h; y++) { push(y * w); push(y * w + w - 1); }
    while (top) { const p = st[--top], x = p % w; if (x > 0) push(p - 1); if (x < w - 1) push(p + 1); if (p >= w) push(p - w); if (p < w * (h - 1)) push(p + w); }
    return out; }
  // Outer cut: grow the artwork mask by off px, close gaps up to bridge px, fill holes, take the outside edge.  // morphology with the distance transform (radius in px)
  const dil = (m, w, h, r) => { const d = edt(m, w, h), o = new Uint8Array(w * h), rr = r * r; for (let i = 0; i < o.length; i++) o[i] = d[i] <= rr ? 1 : 0; return o; };
  const inv = m => { const o = new Uint8Array(m.length); for (let i = 0; i < m.length; i++) o[i] = m[i] ? 0 : 1; return o; };
  const ero = (m, w, h, r) => inv(dil(inv(m), w, h, r));
  const close = (m, w, h, r) => ero(dil(m, w, h, r), w, h, r);
  function comps(m, w, h, minArea) { const lab = new Int32Array(w * h).fill(-1), st = new Int32Array(w * h), sizes = []; let id = 0;
    for (let i = 0; i < m.length; i++) { if (!m[i] || lab[i] >= 0) continue; let top = 0, n = 0; st[top++] = i; lab[i] = id;
      while (top) { const p = st[--top]; n++; const x = p % w; for (const q of [p - 1, p + 1, p - w, p + w]) { if (q < 0 || q >= m.length || (q === p - 1 && !x) || (q === p + 1 && x === w - 1)) continue; if (m[q] && lab[q] < 0) { lab[q] = id; st[top++] = q; } } }
      sizes.push(n); id++; }
    return { lab, sizes, big: sizes.filter(s => s >= minArea).length }; }
  function keepBig(m, w, h, minArea) { const c = comps(m, w, h, minArea); for (let i = 0; i < m.length; i++) if (m[i] && c.sizes[c.lab[i]] < minArea) m[i] = 0; return c.big; }
  // typical drawn line width: dark runs with light on both sides, horizontal and vertical
  function lineWidth(dark, w, h) { const runs = [];
    const scan = (n, len, at) => { for (let a = 0; a < n; a++) { let st = -1; for (let b = 0; b < len; b++) { const v = dark[at(a, b)]; if (v && st < 0) st = b; if (!v && st >= 0) { if (st > 0) runs.push(b - st); st = -1; } } } };
    scan(h, w, (y, x) => y * w + x); scan(w, h, (x, y) => y * w + x); if (!runs.length) return 3; runs.sort((a, b) => a - b);
    return clamp(runs[Math.floor(runs.length * 0.4)], 1.5, 80); }
  // remove skeleton pixels that are not needed to keep it connected (so only true junctions have 3+ neighbours)
  function tidySkeleton(S, w, h) { const off = [[-1, -1], [0, -1], [1, -1], [-1, 0], [1, 0], [-1, 1], [0, 1], [1, 1]]; let ch = true, guard = 0;
    while (ch && guard++ < 6) { ch = false;
      for (let y = 1; y < h - 1; y++) for (let x = 1; x < w - 1; x++) { const i = y * w + x; if (!S[i]) continue; const nb = []; for (const [dx, dy] of off) if (S[i + dy * w + dx]) nb.push([dx, dy]);
        if (nb.length < 2) continue; const seen = [0], used = new Uint8Array(nb.length); used[0] = 1;
        while (seen.length) { const a = nb[seen.pop()]; nb.forEach((b, j) => { if (!used[j] && Math.abs(a[0] - b[0]) <= 1 && Math.abs(a[1] - b[1]) <= 1) { used[j] = 1; seen.push(j); } }); }
        if (used.every(Boolean) && nb.length >= 2) { // removable only if it is not a line end
          if (nb.length === 2 && Math.abs(nb[0][0] - nb[1][0]) + Math.abs(nb[0][1] - nb[1][1]) > 1) continue; S[i] = 0; ch = true; } } } }
  // skeleton pixels -> graph {nodes:[{x,y}], edges:[{a,b,pts}]}
  function skelGraph(S, w, h) { const N = w * h, cnt = new Uint8Array(N), NB = [-w - 1, -w, -w + 1, -1, 1, w - 1, w, w + 1];
    for (let y = 1; y < h - 1; y++) for (let x = 1; x < w - 1; x++) { const i = y * w + x; if (!S[i]) continue; let c = 0; for (const o of NB) if (S[i + o]) c++; cnt[i] = c; }
    const cl = new Int32Array(N).fill(-1), nodes = [], pix = i => [i % w + 0.5, ((i / w) | 0) + 0.5], st = [];
    for (let i = 0; i < N; i++) { if (!S[i] || cnt[i] === 2 || cl[i] >= 0) continue; const id = nodes.length, mem = []; cl[i] = id; st.push(i);
      while (st.length) { const p = st.pop(); mem.push(p); for (const o of NB) { const q = p + o; if (S[q] && cnt[q] !== 2 && cl[q] < 0) { cl[q] = id; st.push(q); } } }
      let sx = 0, sy = 0; for (const p of mem) { const q = pix(p); sx += q[0]; sy += q[1]; } nodes.push({ x: sx / mem.length, y: sy / mem.length, mem }); }
    const used = new Uint8Array(N), edges = [];
    const walk = (a, p, q) => { const pts = [[nodes[a].x, nodes[a].y]]; let prev = p, cur = q;
      for (;;) { used[cur] = 1; pts.push(pix(cur)); let nxt = -1, end = -1;
        for (const o of NB) { const r = cur + o; if (!S[r] || r === prev) continue; if (cl[r] >= 0) { if (!(cl[r] === a && pts.length === 2 && r === p)) end = cl[r]; } else if (!used[r]) nxt = r; }
        if (end >= 0 && (nxt < 0 || pts.length > 2)) { pts.push([nodes[end].x, nodes[end].y]); edges.push({ a, b: end, pts }); return; }
        if (nxt < 0) { edges.push({ a, b: -1, pts }); return; } prev = cur; cur = nxt; } };
    nodes.forEach((nd, a) => { for (const p of nd.mem) for (const o of NB) { const q = p + o; if (S[q] && cnt[q] === 2 && !used[q] && cl[q] < 0) walk(a, p, q); } });
    for (let i = 0; i < N; i++) { if (!S[i] || used[i] || cl[i] >= 0) continue; const id = nodes.length, q = pix(i); nodes.push({ x: q[0], y: q[1], mem: [i] }); cl[i] = id; used[i] = 1;
      for (const o of NB) { const r = i + o; if (S[r] && !used[r] && cl[r] < 0) { walk(id, i, r); break; } } }
    for (const e of edges) if (e.b < 0) { const L = e.pts[e.pts.length - 1]; e.b = nodes.length; nodes.push({ x: L[0], y: L[1], mem: [] }); }
    for (const n of nodes) delete n.mem; return { nodes, edges }; }
  const D = (a, b) => Math.hypot(a[0] - b[0], a[1] - b[1]);
  const plen = p => { let L = 0; for (let i = 1; i < p.length; i++) L += D(p[i - 1], p[i]); return L; };
  function degrees(g) { const d = new Int32Array(g.nodes.length); for (const e of g.edges) { d[e.a]++; d[e.b]++; } return d; }
  function compact(g) { g.edges = g.edges.filter(e => !e.dead); }
  // join edges through nodes that have exactly two edge ends
  function mergeDeg2(g) { let ch = true; while (ch) { ch = false; const deg = degrees(g);
      for (let n = 0; n < g.nodes.length; n++) { if (deg[n] !== 2 || g.nodes[n].keep) continue; const es = g.edges.filter(e => !e.dead && (e.a === n || e.b === n)); if (es.length !== 2) continue;
        const [e1, e2] = es; const p1 = e1.b === n ? e1.pts : e1.pts.slice().reverse(), o1 = e1.b === n ? e1.a : e1.b, p2 = e2.a === n ? e2.pts : e2.pts.slice().reverse(), o2 = e2.a === n ? e2.b : e2.a;
        e1.pts = p1.concat(p2.slice(1)); e1.a = o1; e1.b = o2; e2.dead = true; ch = true; deg[n] = 0; } compact(g); } }
  function setNode(g, n, x, y) { g.nodes[n].x = x; g.nodes[n].y = y; for (const e of g.edges) { if (e.a === n) e.pts[0] = [x, y]; if (e.b === n) e.pts[e.pts.length - 1] = [x, y]; } }
  // the drawing's ends near junctions bend into the blob; straighten the last bit into the node
  function straightenJunctions(g, r) { const deg = degrees(g);
    for (const e of g.edges) { const cutEnd = (rev) => { const p = rev ? e.pts.slice().reverse() : e.pts; const n0 = p[0]; let j = 1; while (j < p.length - 2 && D(p[j], n0) < r) j++; const q = [n0].concat(p.slice(j)); return rev ? q.reverse() : q; };
      if (deg[e.a] >= 3 && e.pts.length > 4) e.pts = cutEnd(false); if (deg[e.b] >= 3 && e.pts.length > 4) e.pts = cutEnd(true); } }
  function prune(g, spur, speck) { for (let it = 0; it < 4; it++) { const deg = degrees(g); let any = false;
      for (const e of g.edges) { const L = plen(e.pts), ea = deg[e.a] === 1, eb = deg[e.b] === 1;
        if (e.a !== e.b && ((ea && !eb) || (!ea && eb)) && L < spur) { e.dead = true; any = true; } else if (ea && eb && L < speck) { e.dead = true; any = true; } else if (e.a === e.b && L < speck) { e.dead = true; any = true; } }
      compact(g); mergeDeg2(g); if (!any) break; } }
  function collapseClose(g, r) { const deg = degrees(g);
    for (const e of g.edges) { if (e.dead || e.a === e.b || deg[e.a] < 3 || deg[e.b] < 3 || plen(e.pts) > r) continue; const A = g.nodes[e.a], B = g.nodes[e.b], x = (A.x + B.x) / 2, y = (A.y + B.y) / 2;
      e.dead = true; const keep = e.a, gone = e.b; for (const f of g.edges) { if (f.dead) continue; if (f.a === gone) f.a = keep; if (f.b === gone) f.b = keep; } setNode(g, keep, x, y); }
    compact(g); }
  // a junction blob pulls the meeting point towards the side line; put it back on the line that runs straight through
  function centreJunctions(g, lw) { const deg = degrees(g), inc = new Map(); g.edges.forEach((e, i) => { for (const end of [0, 1]) { const n = end ? e.b : e.a; if (!inc.has(n)) inc.set(n, []); inc.get(n).push({ i, end }); } });
    for (const [n, list] of inc) { if (deg[n] < 3) continue; const N0 = [g.nodes[n].x, g.nodes[n].y];
      const arms = list.map(({ i, end }) => { const p = end ? g.edges[i].pts.slice().reverse() : g.edges[i].pts, pts = []; let s = 0; for (let k = 1; k < p.length; k++) { s += D(p[k - 1], p[k]); if (s > lw * 3.2) break; if (s >= lw * 1.1) pts.push(p[k]); } return pts; });
      let best = null; for (let a = 0; a < arms.length; a++) for (let b = a + 1; b < arms.length; b++) { if (arms[a].length < 2 || arms[b].length < 2) continue; const pts = arms[a].concat(arms[b]);
        let mx = 0, my = 0; for (const q of pts) { mx += q[0]; my += q[1]; } mx /= pts.length; my /= pts.length; let sxx = 0, syy = 0, sxy = 0; for (const q of pts) { const dx = q[0] - mx, dy = q[1] - my; sxx += dx * dx; syy += dy * dy; sxy += dx * dy; }
        const ang = 0.5 * Math.atan2(2 * sxy, sxx - syy), ux = Math.cos(ang), uy = Math.sin(ang); let err = 0; for (const q of pts) err = Math.max(err, Math.abs((q[0] - mx) * uy - (q[1] - my) * ux));
        const da = [arms[a][arms[a].length - 1][0] - N0[0], arms[a][arms[a].length - 1][1] - N0[1]], db = [arms[b][arms[b].length - 1][0] - N0[0], arms[b][arms[b].length - 1][1] - N0[1]];
        const cosab = (da[0] * db[0] + da[1] * db[1]) / ((Math.hypot(...da) * Math.hypot(...db)) || 1); if (cosab > -0.94 || err > Math.max(1, lw * 0.2)) continue;
        if (!best || err < best.err) best = { err, mx, my, ux, uy }; }
      if (!best) continue; const t = (N0[0] - best.mx) * best.ux + (N0[1] - best.my) * best.uy, px = best.mx + best.ux * t, py = best.my + best.uy * t;
      if (Math.hypot(px - N0[0], py - N0[1]) < lw * 0.7) setNode(g, n, px, py); } }
  // split edge at point index (insert a node). returns node id
  function splitEdge(g, e, j, pt) { const id = g.nodes.length; g.nodes.push({ x: pt[0], y: pt[1] }); const A = e.pts.slice(0, j + 1).concat([pt]), B = [pt].concat(e.pts.slice(j + 1));
    g.edges.push({ a: id, b: e.b, pts: B }); e.pts = A; e.b = id; return id; }
  function rayHit(g, from, dir, maxD, skip) { let best = null;
    for (const e of g.edges) { if (e.dead) continue; const p = e.pts;
      for (let j = 1; j < p.length; j++) { if (skip && skip(e, j)) continue; const a = p[j - 1], b = p[j], s = [b[0] - a[0], b[1] - a[1]], den = dir[0] * s[1] - dir[1] * s[0]; if (Math.abs(den) < 1e-9) continue;
        const u = ((a[0] - from[0]) * s[1] - (a[1] - from[1]) * s[0]) / den, v = ((a[0] - from[0]) * dir[1] - (a[1] - from[1]) * dir[0]) / den;
        if (u > 0.01 && u <= maxD && v >= 0 && v <= 1 && (!best || u < best.u)) best = { u, e, j: j - 1, pt: [from[0] + dir[0] * u, from[1] + dir[1] * u] }; } }
    return best; }
  function endDir(p, arm) { const a = p[0]; let j = 1; while (j < p.length - 1 && D(p[j], a) < arm) j++; const b = p[j], l = D(a, b) || 1; return [(a[0] - b[0]) / l, (a[1] - b[1]) / l]; }
  // close gaps: a loose end that points at another line within maxD is extended to stop exactly on it
  function closeGaps(g, maxD, arm) { let n = 0; for (let pass = 0; pass < 2; pass++) { const deg = degrees(g), ends = [];
      g.edges.forEach(e => { if (deg[e.a] === 1) ends.push({ e, end: 0 }); if (deg[e.b] === 1 && e.a !== e.b) ends.push({ e, end: 1 }); });
      for (const en of ends) { const e = en.e; if (e.dead) continue; const p = en.end ? e.pts.slice().reverse() : e.pts, nid = en.end ? e.b : e.a; if (degrees(g)[nid] !== 1) continue;
        const dir = endDir(p, arm), from = p[0], L = plen(e.pts);
        const hit = rayHit(g, from, dir, maxD, (f, j) => f === e && (L < arm * 4 || (en.end ? plen(f.pts.slice(j)) < arm * 3 : plen(f.pts.slice(0, j + 2)) < arm * 3)));
        if (!hit) continue; let tgt; const f = hit.e, A = f.pts[0], B = f.pts[f.pts.length - 1];
        if (D(hit.pt, A) < arm * 0.7) tgt = f.a; else if (D(hit.pt, B) < arm * 0.7) tgt = f.b; else tgt = splitEdge(g, f, hit.j, hit.pt);
        const T_ = g.nodes[tgt]; if (en.end) e.pts.push([T_.x, T_.y]), e.b = tgt; else e.pts.unshift([T_.x, T_.y]), e.a = tgt; n++; } }
    return n; }
  // pair edges through each junction by straightness so a line carries on through a crossing; returns chains of points + junction points
  function chains(g, arm, maxTurn) { const ends = new Map(); g.edges.forEach((e, i) => { for (const end of [0, 1]) { const n = end ? e.b : e.a; if (!ends.has(n)) ends.set(n, []); ends.get(n).push({ i, end }); } });
    const deg = degrees(g), pair = new Map(), key = (i, end) => i * 2 + end, cos = Math.cos((180 - maxTurn) * Math.PI / 180);
    for (const [n, list] of ends) { if (list.length < 2) continue; const dirs = list.map(({ i, end }) => { const p = end ? g.edges[i].pts.slice().reverse() : g.edges[i].pts; const d = endDir(p, arm); return [-d[0], -d[1]]; });
      const cand = []; for (let a = 0; a < list.length; a++) for (let b = a + 1; b < list.length; b++) { const c = dirs[a][0] * dirs[b][0] + dirs[a][1] * dirs[b][1]; if (c <= cos || list.length === 2) cand.push([c, a, b]); }
      cand.sort((x, y) => x[0] - y[0]); const done = new Set(); for (const [, a, b] of cand) { if (done.has(a) || done.has(b)) continue; done.add(a); done.add(b); pair.set(key(list[a].i, list[a].end), list[b]); pair.set(key(list[b].i, list[b].end), list[a]); } }
    const usedE = new Uint8Array(g.edges.length), out = [];
    const isJ = n => deg[n] >= 3;
    for (let s = 0; s < g.edges.length; s++) { if (usedE[s]) continue; // walk back to a chain start
      let i = s, end = 0, guard = 0; for (;;) { const pr = pair.get(key(i, end)); if (!pr || pr.i === s && guard > 0 || guard++ > g.edges.length) break; i = pr.i; end = 1 - pr.end; if (i === s) break; }
      const pts = [], forced = []; let ci = i, cend = end, closed = false, g2 = 0;
      for (;;) { usedE[ci] = 1; const e = g.edges[ci], p = cend === 0 ? e.pts : e.pts.slice().reverse(); const far = cend === 0 ? e.b : e.a;
        if (pts.length) pts.push(...p.slice(1)); else pts.push(...p);
        const pr = pair.get(key(ci, cend === 0 ? 1 : 0)); if (!pr || usedE[pr.i] || g2++ > g.edges.length) { if (pr && pr.i === i && pr.end === end) closed = true; break; }
        if (isJ(far)) forced.push([g.nodes[far].x, g.nodes[far].y]); ci = pr.i; cend = pr.end; }
      out.push({ pts, forced, closed, a: [pts[0][0], pts[0][1]] }); }
    return out; }
  function edtPts(pts, w, h) { const m = new Uint8Array(w * h); for (const [x, y] of pts) { const xi = Math.floor(x), yi = Math.floor(y); if (xi >= 0 && yi >= 0 && xi < w && yi < h) m[yi * w + xi] = 1; } return edt(m, w, h); }
  // a line that carries on through junctions should be one even straight line: pull slightly-off junction nodes onto it
  function alignThrough(paths, maxDeg, iters) { const keyOf = nd => nd.x.toFixed(3) + ',' + nd.y.toFixed(3), lim = Math.sin(maxDeg * Math.PI / 180);
    for (let it = 0; it < iters; it++) { const groups = new Map(); for (const p of paths) for (const nd of p.n) { const k = keyOf(nd); if (!groups.has(k)) groups.set(k, []); groups.get(k).push(nd); }
      for (const p of paths) { const n = p.n; for (let j = 1; j < n.length - 1; j++) { const a = n[j - 1], b = n[j], c = n[j + 1]; if (a.o || b.i || b.o || c.i) continue;
          const vx = c.x - a.x, vy = c.y - a.y, L = Math.hypot(vx, vy); if (L < 1e-6) continue; const t = ((b.x - a.x) * vx + (b.y - a.y) * vy) / (L * L); if (t <= 0 || t >= 1) continue;
          const px = a.x + vx * t, py = a.y + vy * t, off = Math.hypot(b.x - px, b.y - py), r = Math.min(t, 1 - t) * L; if (off > r * lim) continue;
          const grp = groups.get(keyOf(b)) || [b], dx = px - b.x, dy = py - b.y; for (const q of grp) BZ.moveNode(q, dx, dy); groups.set(keyOf(b), grp); } } } }
  // snap nearly level / upright straight runs (one value for the whole run); junction nodes shared with other lines move with them
  function snapHV(paths, deg, minLen) { const th = Math.tan(deg * Math.PI / 180), keyOf = nd => nd.x.toFixed(3) + ',' + nd.y.toFixed(3);
    for (const axis of [1, 0]) for (let it = 0; it < 2; it++) { const groups = new Map(); for (const p of paths) for (const nd of p.n) { const k = keyOf(nd); if (!groups.has(k)) groups.set(k, []); groups.get(k).push(nd); }
      const runs = [];
      for (const p of paths) { const m = BZ.nseg(p); let run = null;
        const ok = k => { const sg = BZ.seg(p, k); if (!sg.line) return false; const dx = Math.abs(sg.b.x - sg.a.x), dy = Math.abs(sg.b.y - sg.a.y); return axis ? dy <= dx * th : dx <= dy * th; };
        for (let k = 0; k < m; k++) { if (ok(k)) { if (!run) run = [k, k]; else run[1] = k; } else { if (run) runs.push([p, run]); run = null; } } if (run) runs.push([p, run]); }
      const plan = [];
      for (const [p, [k0, k1]] of runs) { const nodes = []; for (let k = k0; k <= k1 + 1; k++) nodes.push(p.n[k % p.n.length]); const a = nodes[0], z = nodes[nodes.length - 1];
        const L = axis ? Math.abs(z.x - a.x) : Math.abs(z.y - a.y); if (L < minLen) continue; const span = axis ? Math.abs(z.y - a.y) : Math.abs(z.x - a.x); if (span > L * th) continue;
        let sum = 0, w = 0; for (let i = 1; i < nodes.length; i++) { const q0 = nodes[i - 1], q1 = nodes[i], l = axis ? Math.abs(q1.x - q0.x) : Math.abs(q1.y - q0.y); sum += (axis ? q0.y + q1.y : q0.x + q1.x) / 2 * l; w += l; }
        plan.push([nodes, w ? sum / w : (axis ? a.y : a.x), L]); }
      plan.sort((x, y) => x[2] - y[2]); // longer runs win: applied last
      for (const [nodes, v] of plan) { const done = new Set(); for (const nd of nodes) { const k = keyOf(nd); if (done.has(k)) continue; done.add(k); const grp = groups.get(k) || [nd]; for (const q of grp) BZ.moveNode(q, axis ? 0 : v - q.x, axis ? v - q.y : 0); groups.delete(k); groups.set(keyOf(nd), grp); } } } }
  // every loose line end that touches another line ends exactly on a point of that line (added if needed)
  function settleEnds(paths, tolU) { const same = (a, b) => Math.abs(a.x - b.x) < 1e-6 && Math.abs(a.y - b.y) < 1e-6; let n = 0;
    for (const p of paths) { if (p.z || p.cut) continue; for (const j of [0, p.n.length - 1]) { const nd = p.n[j]; if (paths.some(q => q !== p && q.n.some(m => same(m, nd)))) continue;
        let best = null; for (const q of paths) { if (q === p) continue; const r = BZ.nearest(q, [nd.x, nd.y], 0.2); if (r && r.d < tolU && (!best || r.d < best.r.d)) best = { q, r }; }
        if (!best) continue; const { q, r } = best, s = BZ.seg(q, r.k); let tgt;
        if (Math.hypot(s.a.x - r.pt[0], s.a.y - r.pt[1]) < tolU * 0.6) tgt = s.a; else if (Math.hypot(s.b.x - r.pt[0], s.b.y - r.pt[1]) < tolU * 0.6) tgt = s.b; else { const jj = BZ.insertNode(q, r.k, r.t); tgt = q.n[jj]; tgt.s = 0; }
        BZ.moveNode(nd, tgt.x - nd.x, tgt.y - nd.y); n++; } } return n; }
  // ---------- the tracer ----------
  function lineArt(img, opts = {}) { const t0 = Date.now(), detail = clamp(+opts.detail || 5, 1, 10), cornerS = clamp(+opts.corners || 5, 1, 10);
    const P = prep(img, 1600), { d, w, h } = P, back = 1 / P.sc, N = w * h;
    const g = blur(autoContrast(grey(d, w, h)), w, h, 0.6), th = otsu(g); let dark = new Uint8Array(N);
    for (let i = 0; i < N; i++) dark[i] = g[i] < th ? 1 : 0; if (opts.invert) dark = inv(dark);
    let bd = 0, bn = 0; for (let x = 0; x < w; x++) { bd += dark[x] + dark[(h - 1) * w + x]; bn += 2; } for (let y = 0; y < h; y++) { bd += dark[y * w] + dark[y * w + w - 1]; bn += 2; }
    const darkBg = bd / bn > 0.5, lw = lineWidth(dark, w, h), minArea = Math.max(40, N * 0.0015);
    // design area: everything inside the outer edge of the artwork
    let region;
    if (darkBg) { const light = inv(dark); removeSpecks(light, w, h, Math.max(8, lw * lw)); region = fillHoles(close(light, w, h, lw * 0.6 + 1), w, h); }
    else { const bg = new Uint8Array(N), st = []; const push = i => { if (!dark[i] && !bg[i]) { bg[i] = 1; st.push(i); } };
      for (let x = 0; x < w; x++) { push(x); push((h - 1) * w + x); } for (let y = 0; y < h; y++) { push(y * w); push(y * w + w - 1); }
      while (st.length) { const p = st.pop(), x = p % w; if (x > 0) push(p - 1); if (x < w - 1) push(p + 1); if (p >= w) push(p - w); if (p < N - w) push(p + w); }
      region = fillHoles(inv(bg), w, h); }
    let parts = keepBig(region, w, h, minArea);
    for (const k of [1.5, 2.5, 4]) { if (parts <= 1) break; const c = fillHoles(close(region, w, h, lw * k), w, h); const n = comps(c, w, h, minArea).big; if (n < parts) { region = c; parts = keepBig(region, w, h, minArea); } }
    // the grey edge / cut line: through the middle of the outside line
    const cutMask = darkBg ? dil(region, w, h, lw / 2) : ero(region, w, h, lw / 2), cf = new Float32Array(N); for (let i = 0; i < N; i++) cf[i] = cutMask[i] ? 0 : 1;
    const loops = contoursIso(blur(cf, w, h, Math.max(0.8, lw * 0.15)), w, h, 0.5).filter(l => Math.abs(area(l)) > minArea).sort((a, b) => Math.abs(area(b)) - Math.abs(area(a)));
    // ink inside the design -> centre lines
    const L = new Uint8Array(N); for (let i = 0; i < N; i++) L[i] = dark[i] && region[i] ? 1 : 0;
    removeSpecks(L, w, h, Math.max(6, lw * lw * (0.3 + detail * 0.08))); fillSmallHoles(L, w, h, Math.max(4, lw * lw * 0.5));
    const lf = new Float32Array(N); for (let i = 0; i < N; i++) lf[i] = L[i]; const lb = blur(lf, w, h, Math.max(0.7, lw * 0.18)); for (let i = 0; i < N; i++) L[i] = lb[i] > 0.5 ? 1 : 0;
    thin(L, w, h); tidySkeleton(L, w, h);
    const gr = skelGraph(L, w, h), arm = Math.max(3, lw * 0.9), spur = lw * (1.2 + (10 - detail) * 0.12), speck = lw * (1.5 + (10 - detail) * 0.3);
    mergeDeg2(gr); prune(gr, spur, speck); collapseClose(gr, lw * 0.9); mergeDeg2(gr); straightenJunctions(gr, lw * 0.75);
    // lines lying along the cut are the cut: drop them, then loose ends near the cut reach it exactly
    const cutPts = []; for (const l of loops) for (let i = 1; i < l.length; i++) { const a = l[i - 1], b = l[i], n = Math.ceil(D(a, b)); for (let k = 0; k < n; k++) cutPts.push([a[0] + (b[0] - a[0]) * k / n, a[1] + (b[1] - a[1]) * k / n]); }
    const dc = cutPts.length ? edtPts(cutPts, w, h) : null, dcut = q => { if (!dc) return 1e9; const x = clamp(Math.floor(q[0]), 0, w - 1), y = clamp(Math.floor(q[1]), 0, h - 1); return Math.sqrt(dc[y * w + x]); };
    if (dc) { const near = lw * 0.8, keep = [];
      for (const e of gr.edges) { let run = []; const pieces = []; for (const q of e.pts) { if (dcut(q) >= near) run.push(q); else { if (run.length) pieces.push(run); run = []; } } if (run.length) pieces.push(run);
        if (pieces.length === 1 && pieces[0].length === e.pts.length) { keep.push(e); continue; }
        for (const pc of pieces) { if (plen(pc) < lw) continue; const a = pc[0] === e.pts[0] ? e.a : gr.nodes.push({ x: pc[0][0], y: pc[0][1] }) - 1, lst = pc[pc.length - 1], b = lst === e.pts[e.pts.length - 1] ? e.b : gr.nodes.push({ x: lst[0], y: lst[1] }) - 1; keep.push({ a, b, pts: pc }); } }
      gr.edges = keep; mergeDeg2(gr); prune(gr, spur, speck); }
    const gaps = closeGaps(gr, lw * (1.5 + detail * 0.15), arm); mergeDeg2(gr);
    if (dc) { const deg = degrees(gr); for (const e of gr.edges) for (const end of [0, 1]) { const n = end ? e.b : e.a; if (deg[n] !== 1) continue; const q = end ? e.pts[e.pts.length - 1] : e.pts[0];
        if (dcut(q) > lw * 2.2) continue; const p = end ? e.pts.slice().reverse() : e.pts, dir = endDir(p, arm); let best = null;
        for (const c of cutPts) { const v = [c[0] - q[0], c[1] - q[1]], dd = Math.hypot(v[0], v[1]); if (dd > lw * 2.6) continue; const along = (v[0] * dir[0] + v[1] * dir[1]) / (dd || 1); const score = dd * (1.6 - along); if (along > 0.3 && (!best || score < best.s)) best = { s: score, c }; }
        if (best) { const c = best.c.slice(); if (end) e.pts.push(c); else e.pts.unshift(c); setNode(gr, n, c[0], c[1]); gr.nodes[n].onCut = true; } } }
    prune(gr, spur, speck); centreJunctions(gr, lw); straightenJunctions(gr, lw * 0.9);
    const corner = 62 - cornerS * 5, tol = Math.max(0.7, lw * 0.22), opt = { tol, lineTol: Math.max(0.8, lw * 0.25), arm, corner, smooth: arm * 0.5, minStraight: Math.max(lw * 2.5, arm * 4) };
    const paths = [];
    for (const c of chains(gr, arm, 38)) { if (plen(c.pts) < lw * 0.8) continue; const p = BZ.fromPolyline(c.pts, Object.assign({}, opt, { closed: c.closed, forced: c.forced })); if (!p) continue;
      if (c.forced.length) { const fk = new Set(c.forced.map(q => q[0].toFixed(3) + ',' + q[1].toFixed(3))); for (const nd of p.n) if (fk.has(nd.x.toFixed(3) + ',' + nd.y.toFixed(3))) { nd.keep = true; nd.s = 0; } }
      paths.push(p); }
    const cuts = loops.slice(0, opts.allCuts ? loops.length : 1).map(l => { const p = BZ.fromPolyline(l, Object.assign({}, opt, { closed: true, tol: Math.max(0.8, lw * 0.25), lineTol: Math.max(0.9, lw * 0.3), corner: corner + 5 })); if (p) p.cut = true; return p; }).filter(Boolean);
    alignThrough(paths, 10, 6); if (opts.straighten !== false) snapHV(paths.concat(cuts), 3.5, lw * 2); settleEnds(paths.concat(cuts), lw * 0.45); if (opts.straighten !== false) snapHV(paths.concat(cuts), 3.5, lw * 2);
    for (const p of paths.concat(cuts)) { for (const nd of p.n) delete nd.keep; if (back !== 1) for (const nd of p.n) { nd.x *= back; nd.y *= back; if (nd.i) nd.i = [nd.i[0] * back, nd.i[1] * back]; if (nd.o) nd.o = [nd.o[0] * back, nd.o[1] * back]; } }
    return { paths: paths.concat(cuts), lw: lw * back, darkBg, parts, w: img.w, h: img.h, ms: Date.now() - t0, gaps, nodes: BZ.countNodes(paths), cutNodes: BZ.countNodes(cuts) }; }
  function area(p) { let a = 0; for (let i = 0, j = p.length - 1; i < p.length; j = i++) a += (p[j][0] + p[i][0]) * (p[j][1] - p[i][1]); return a / 2; }
  // outline around the lines at a distance (used when there is no traced edge, e.g. an imported SVG)
  function outerCut(mask, w, h, off, bridge) { const R = dil(mask, w, h, off + bridge), F = fillHoles(R, w, h), C = ero(F, w, h, bridge), C2 = fillHoles(C, w, h), f = new Float32Array(w * h);
    for (let i = 0; i < f.length; i++) f[i] = C2[i] ? 0 : 1; return contoursIso(blur(f, w, h, 1), w, h, 0.5).filter(p => Math.abs(area(p)) > 20); }
  return { VERSION, lineArt, outerCut, grey, otsu, blur, thin, edt, fillHoles, contoursIso, lineWidth, skelGraph, area };
})();
if (typeof module !== 'undefined') module.exports = T;
