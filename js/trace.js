// Waylands Path - raster to line-art tracer (own code, no libraries).
// v2 pipeline: grey -> auto contrast -> photos: Canny edges with sub-pixel peaks; drawings: Otsu ink -> Zhang-Suen centre lines;
// outlines and the outside edge: sub-pixel marching squares on the grey (or alpha) field. Very low simplify tolerance keeps the detail.
'use strict';
const T = (() => {
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
  function looksLikePhoto(g) { let m = 0; for (const v of g) if (v > 0.12 && v < 0.88) m++; return m / g.length > 0.22; }
  // remove 8-connected ink blobs smaller than minArea pixels
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
  function splitBlobs(m, w, h, minArea, scale, dark) { const seen = new Uint8Array(w * h), st = new Int32Array(w * h); let out = null;
    const minT = Math.max(6, 5 * scale), maxD = 60 * scale;
    for (let i = 0; i < m.length; i++) { if (!m[i] || seen[i]) continue; let top = 0, x0 = w, x1 = 0, y0 = h, y1 = 0; st[top++] = i; seen[i] = 1; const comp = [];
      while (top) { const p = st[--top]; comp.push(p); const x = p % w, y = (p / w) | 0; if (x < x0) x0 = x; if (x > x1) x1 = x; if (y < y0) y0 = y; if (y > y1) y1 = y;
        for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) { const xx = x + dx, yy = y + dy; if (xx < 0 || yy < 0 || xx >= w || yy >= h) continue; const q = yy * w + xx; if (m[q] && !seen[q]) { seen[q] = 1; st[top++] = q; } } }
      const bw = x1 - x0 + 1, bh = y1 - y0 + 1;
      let nd = 0; if (dark) for (const p of comp) nd += dark[p];
      if ((!dark || nd > comp.length * 0.6) && comp.length >= Math.max(minArea, 64 * scale * scale) && Math.min(bw, bh) >= minT && Math.max(bw, bh) <= maxD && comp.length / (bw * bh) > 0.45 && Math.max(bw, bh) / Math.min(bw, bh) < 2.5) {
        if (!out) out = new Uint8Array(w * h); for (const p of comp) { out[p] = 1; m[p] = 0; } } }
    return out; }
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
  function skeletonPaths(m, w, h, sx, sy) { const deg = new Uint8Array(w * h);
    for (let y = 1; y < h - 1; y++) for (let x = 1; x < w - 1; x++) { const i = y * w + x; if (!m[i]) continue; let n = 0; for (const [dx, dy] of NB) n += m[i + dy * w + dx]; deg[i] = n; }
    const used = new Set(), ek = (a, b) => a < b ? a * 4194304 + b : b * 4194304 + a, vis = new Uint8Array(w * h), paths = [];
    const isNode = i => deg[i] !== 2;
    const walk = (s, n) => { const pts = [s, n]; used.add(ek(s, n)); let prev = s, cur = n;
      while (!isNode(cur) || cur === s && pts.length > 2) { if (cur === s && pts.length > 2) break; vis[cur] = 1; let nx = -1;
        for (const [dx, dy] of NB) { const q = cur + dy * w + dx; if (q === prev || !m[q] || used.has(ek(cur, q))) continue; nx = q; break; }
        if (nx < 0) break; used.add(ek(cur, nx)); pts.push(nx); prev = cur; cur = nx; if (cur === s) break; }
      vis[cur] = 1; return pts; };
    for (let i = 0; i < m.length; i++) if (m[i] && isNode(i)) { vis[i] = 1; if (deg[i] === 0) { paths.push([i]); continue; }
      for (const [dx, dy] of NB) { const q = i + dy * w + dx; if (m[q] && !used.has(ek(i, q))) paths.push(walk(i, q)); } }
    for (let i = 0; i < m.length; i++) if (m[i] && !vis[i] && deg[i] === 2) { vis[i] = 1; // closed loops with no junction
      for (const [dx, dy] of NB) { const q = i + dy * w + dx; if (m[q] && !used.has(ek(i, q))) { const p = walk(i, q); if (p[p.length - 1] !== i) p.push(i); paths.push(p); break; } } }
    return paths.map(p => p.map(i => [i % w + 0.5 + (sx ? sx[i] : 0), ((i / w) | 0) + 0.5 + (sy ? sy[i] : 0)])); }
  // marching squares outlines of the ink mask (outer edges and holes), as closed loops in pixel units
  function contours(m, w, h) { const W = w + 2, H = h + 2, b = new Uint8Array(W * H);
    for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) b[(y + 1) * W + x + 1] = m[y * w + x];
    const nbA = new Int32Array(W * H * 2).fill(-1), nbB = new Int32Array(W * H * 2).fill(-1);
    const link = (a, c) => { if (nbA[a] < 0) nbA[a] = c; else nbB[a] = c; if (nbA[c] < 0) nbA[c] = a; else nbB[c] = a; };
    for (let y = 0; y < H - 1; y++) for (let x = 0; x < W - 1; x++) {
      const tl = b[y * W + x], tr = b[y * W + x + 1], br = b[(y + 1) * W + x + 1], bl = b[(y + 1) * W + x], c = tl * 8 + tr * 4 + br * 2 + bl; if (!c || c === 15) continue;
      const T_ = 2 * (y * W + x), B_ = 2 * ((y + 1) * W + x), L_ = 2 * (y * W + x) + 1, R_ = 2 * (y * W + x + 1) + 1;
      switch (c) { case 1: case 14: link(L_, B_); break; case 2: case 13: link(B_, R_); break; case 3: case 12: link(L_, R_); break;
        case 4: case 11: link(T_, R_); break; case 6: case 9: link(T_, B_); break; case 7: case 8: link(L_, T_); break;
        case 5: link(L_, B_); link(T_, R_); break; case 10: link(L_, T_); link(B_, R_); break; } }
    const pt = k => { const e = k >> 1, x = e % W, y = (e / W) | 0; return (k & 1) ? [x - 0.5, y] : [x, y - 0.5]; }; // back to unpadded pixel-centre units +0.5
    const seen = new Uint8Array(W * H * 2), loops = [];
    for (let k = 0; k < nbA.length; k++) { if (nbA[k] < 0 || seen[k]) continue; const loop = []; let prev = -1, cur = k;
      while (cur >= 0 && !seen[cur]) { seen[cur] = 1; loop.push(pt(cur)); const nx = nbA[cur] !== prev ? nbA[cur] : nbB[cur]; prev = cur; cur = nx; }
      if (loop.length > 2) { loop.push(loop[0].slice()); loops.push(loop); } }
    return loops; }
  const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
  const VERSION = 2;
  // Sub-pixel marching squares on a grey field: the line sits exactly where the field crosses `level` (inside = below level).
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
  function canny(g, w, h, sigma, q) { const b = blur(g, w, h, sigma), N = w * h, mag = new Float32Array(N), dir = new Uint8Array(N);
    for (let y = 1; y < h - 1; y++) for (let x = 1; x < w - 1; x++) { const i = y * w + x;
      const gx = (b[i - w + 1] + 2 * b[i + 1] + b[i + w + 1]) - (b[i - w - 1] + 2 * b[i - 1] + b[i + w - 1]);
      const gy = (b[i + w - 1] + 2 * b[i + w] + b[i + w + 1]) - (b[i - w - 1] + 2 * b[i - w] + b[i - w + 1]);
      mag[i] = Math.hypot(gx, gy); let a = Math.atan2(gy, gx) * 180 / Math.PI; if (a < 0) a += 180; dir[i] = a < 22.5 || a >= 157.5 ? 0 : a < 67.5 ? 1 : a < 112.5 ? 2 : 3; }
    const OFF = [[1, 0], [1, 1], [0, 1], [-1, 1]], nms = new Float32Array(N), sx = new Float32Array(N), sy = new Float32Array(N); const vals = [];
    for (let y = 1; y < h - 1; y++) for (let x = 1; x < w - 1; x++) { const i = y * w + x, m = mag[i]; if (m < 1e-3) continue; const [dx, dy] = OFF[dir[i]];
      const m1 = mag[i + dy * w + dx], m2 = mag[i - dy * w - dx]; if (m < m1 || m <= m2) continue; nms[i] = m; vals.push(m);
      const den = m2 - 2 * m + m1, o = den < 0 ? Math.max(-0.5, Math.min(0.5, 0.5 * (m2 - m1) / den)) : 0; sx[i] = o * dx; sy[i] = o * dy; }
    if (!vals.length) return { e: new Uint8Array(N), sx, sy }; vals.sort((a, b) => a - b);
    const hi = Math.max(0.06, vals[Math.min(vals.length - 1, Math.floor(vals.length * q))]), lo = hi * 0.45, e = new Uint8Array(N), st = new Int32Array(N); let top = 0;
    for (let i = 0; i < N; i++) if (nms[i] >= hi) { e[i] = 1; st[top++] = i; }
    while (top) { const p = st[--top], x = p % w, y = (p / w) | 0;
      for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) { const xx = x + dx, yy = y + dy; if (xx < 1 || yy < 1 || xx >= w - 1 || yy >= h - 1) continue; const k = yy * w + xx; if (!e[k] && nms[k] >= lo) { e[k] = 1; st[top++] = k; } } }
    return { e, sx, sy }; }
  const simplify = (paths, tol) => paths.map(p => G.rdp(G.chaikin(p, 1), tol));
  const biggest = loops => { let best = null, ba = 0; for (const l of loops) { const a = Math.abs(G.area(l)); if (a > ba) { ba = a; best = l; } } return best; };
  function prep(img, maxDim) { const sc = Math.min(1, maxDim / Math.max(img.w, img.h)), w = Math.max(8, Math.round(img.w * sc)), h = Math.max(8, Math.round(img.h * sc));
    const d = resample(img, w, h); let na = 0; for (let i = 3; i < d.length; i += 4) if (d[i] < 242) na++;
    return { d, w, h, sc, hasAlpha: na > w * h * 0.01 }; }
  // Outer silhouette of the subject: transparency if the picture has it, otherwise "everything that isn't the border colour".
  function silhouette(P) { const { d, w, h } = P, N = w * h, f = new Float32Array(N), scale = Math.max(w, h) / 1000;
    if (P.hasAlpha) { for (let i = 0; i < N; i++) f[i] = 1 - d[i * 4 + 3] / 255; return biggest(contoursIso(f, w, h, 0.5)); }
    const bp = []; for (let x = 0; x < w; x += 2) for (const y of [0, 1, h - 2, h - 1]) bp.push(y * w + x); for (let y = 0; y < h; y += 2) for (const x of [0, 1, w - 2, w - 1]) bp.push(y * w + x);
    // colour features that weigh hue more than brightness (so shadows on the subject don't count as background)
    const F = new Float32Array(N * 3); for (let i = 0; i < N; i++) { const R = d[i * 4], Gc = d[i * 4 + 1], B = d[i * 4 + 2]; F[i * 3] = R - Gc; F[i * 3 + 1] = (R + Gc) / 2 - B; F[i * 3 + 2] = 0.5 * (R + Gc + B) / 3; }
    let C = [bp[0], bp[(bp.length / 3) | 0], bp[(2 * bp.length / 3) | 0]].map(i => [F[i * 3], F[i * 3 + 1], F[i * 3 + 2]]); // k-means (k=3) of the border colours
    const dist2 = (i, c) => (F[i * 3] - c[0]) ** 2 + (F[i * 3 + 1] - c[1]) ** 2 + (F[i * 3 + 2] - c[2]) ** 2;
    for (let it = 0; it < 10; it++) { const s = C.map(() => [0, 0, 0, 0]); for (const i of bp) { let bk = 0, bd = Infinity; C.forEach((c, k) => { const q = dist2(i, c); if (q < bd) { bd = q; bk = k; } }); const t = s[bk]; t[0] += F[i * 3]; t[1] += F[i * 3 + 1]; t[2] += F[i * 3 + 2]; t[3]++; }
      C = C.map((c, k) => s[k][3] ? [s[k][0] / s[k][3], s[k][1] / s[k][3], s[k][2] / s[k][3]] : c); }
    let mx = 0; for (let i = 0; i < N; i++) { let bd = Infinity; for (const c of C) { const q = dist2(i, c); if (q < bd) bd = q; } f[i] = Math.sqrt(bd); if (f[i] > mx) mx = f[i]; }
    const sorted = Float32Array.from(f).sort(), top = sorted[Math.floor(N * 0.995)] || mx || 1; for (let i = 0; i < N; i++) f[i] = Math.min(1, f[i] / top);
    const fb = blur(f, w, h, 1.5 * scale), th = otsu(fb), m = new Uint8Array(N); for (let i = 0; i < N; i++) m[i] = fb[i] > th ? 1 : 0;
    const erode = (m, r) => { const inv = m.map(v => 1 - v), dd = edt(inv, w, h), o = new Uint8Array(N); for (let i = 0; i < N; i++) o[i] = dd[i] > r * r ? 1 : 0; return o; };
    const dilate = (m, r) => { const dd = edt(m, w, h), o = new Uint8Array(N); for (let i = 0; i < N; i++) o[i] = dd[i] <= r * r ? 1 : 0; return o; };
    let M = dilate(erode(m, 2.5 * scale), 2.5 * scale); M = erode(dilate(M, 5 * scale), 5 * scale); M = fillHoles(M, w, h);
    const seen = new Uint8Array(N), st = new Int32Array(N); let best = null; // keep the biggest blob
    for (let i = 0; i < N; i++) { if (!M[i] || seen[i]) continue; let top = 0; st[top++] = i; seen[i] = 1; const comp = [];
      while (top) { const p = st[--top]; comp.push(p); const x = p % w; for (const q of [p - 1, p + 1, p - w, p + w]) { if (q < 0 || q >= N || (q === p - 1 && !x) || (q === p + 1 && x === w - 1)) continue; if (M[q] && !seen[q]) { seen[q] = 1; st[top++] = q; } } }
      if (!best || comp.length > best.length) best = comp; }
    if (!best) return null; const B = new Float32Array(N).fill(1); for (const p of best) B[p] = 0; return biggest(contoursIso(blur(B, w, h, 0.8), w, h, 0.5)); }
  // Grey edge guide + silhouette, computed once per picture at full detail (never exported).
  function analyse(img) { const P = prep(img, 1600), { d, w, h } = P, back = 1 / P.sc, g = autoContrast(grey(d, w, h)), photo = looksLikePhoto(g), scale = Math.max(w, h) / 1000; let guide;
    if (photo) { const c = canny(g, w, h, 1.2 * Math.max(1, scale * 0.8), 0.7), e = c.e; removeSpecks(e, w, h, 6); thin(e, w, h);
      guide = G.joinEnds(skeletonPaths(e, w, h, c.sx, c.sy).filter(p => p.length > 1), 1.5, { turnWeight: 0.6 }).paths.filter(p => G.len(p) >= 16 * scale); }
    else { const gb = blur(g, w, h, 0.6); guide = contoursIso(gb, w, h, otsu(gb)).filter(p => Math.abs(G.area(p)) > 3); }
    if (P.hasAlpha) { const f = new Float32Array(w * h); for (let i = 0; i < f.length; i++) f[i] = 1 - d[i * 4 + 3] / 255; guide = guide.concat(contoursIso(f, w, h, 0.5).filter(p => Math.abs(G.area(p)) > 8)); }
    guide = guide.map(p => G.rdp(p, 0.2)).map(p => p.map(([x, y]) => [x * back, y * back]));
    const sil = silhouette(P); return { guide, outside: sil ? G.rdp(sil, 0.25).map(([x, y]) => [x * back, y * back]) : null, photo, hasAlpha: P.hasAlpha }; }
  // main entry. img = {data: RGBA, w, h}; opts = {detail 1-10, specks 0-10, mode 'lines'|'outline'|'outside', kind 'auto'|'drawing'|'photo', invert 'auto'|true|false}
  function trace(img, opts) { const detail = clamp(+opts.detail || 5, 1, 10), specks = clamp(+opts.specks || 0, 0, 10);
    const P = prep(img, Math.round(500 + detail * 110)), { d, w, h } = P, back = 1 / P.sc, scale = Math.max(w, h) / 1000;
    const tol = 0.5 - detail * 0.04; // simplify tolerance in working pixels: 0.3 px at Detail 5, 0.1 px at Detail 10
    let g = autoContrast(grey(d, w, h)); const photo = opts.kind === 'photo' || (opts.kind !== 'drawing' && looksLikePhoto(g)); let inv = false, paths;
    if (opts.invert === true) { for (let i = 0; i < g.length; i++) g[i] = 1 - g[i]; inv = true; }
    const minArea = Math.round(specks * specks * 4 * scale * scale) + 4;
    if (opts.mode === 'outside') { const sil = silhouette(P); paths = sil ? [G.rdp(sil, tol)] : []; }
    else if (opts.mode === 'outline') { const gb = blur(g, w, h, 0.7), th = otsu(gb); let below = 0; for (const v of gb) if (v < th) below++;
      const f = below > gb.length * 0.55 && opts.invert !== true ? gb.map(v => 1 - v) : gb; if (f !== gb) inv = true;
      paths = simplify(contoursIso(f, w, h, f === gb ? th : 1 - th).filter(p => Math.abs(G.area(p)) > minArea * 1.6), tol); }
    else if (photo) { // Canny edges, followed at sub-pixel precision
      const c = canny(g, w, h, Math.max(0.6, 2.0 - detail * 0.14) * Math.max(1, scale * 0.7), 0.9 - detail * 0.05), e = c.e;
      removeSpecks(e, w, h, Math.round(4 + specks * 3 * scale)); thin(e, w, h);
      paths = G.joinEnds(skeletonPaths(e, w, h, c.sx, c.sy).filter(p => p.length > 1), 1.5, { turnWeight: 0.6 }).paths;
      const minLen = (6 + specks * 5) * scale; paths = simplify(paths.filter(p => G.len(p) >= minLen), tol); }
    else { const m = new Uint8Array(w * h), gb = blur(g, w, h, 0.6), th = otsu(gb); let ink = 0; for (let i = 0; i < m.length; i++) { m[i] = gb[i] < th ? 1 : 0; ink += m[i]; }
      if (opts.invert === 'auto' && ink > m.length * 0.55) { for (let i = 0; i < m.length; i++) m[i] ^= 1; inv = true; }
      removeSpecks(m, w, h, minArea); fillSmallHoles(m, w, h, Math.round(3 + detail * 0.3));
      const blobs = splitBlobs(m, w, h, minArea, scale, null); thin(m, w, h);
      paths = G.joinEnds(skeletonPaths(m, w, h).filter(p => p.length > 1), 1.5, { turnWeight: 0.6 }).paths;
      const minLen = 2 + specks * 1.6 * scale; paths = simplify(paths.filter(p => G.len(p) >= minLen), Math.max(tol, 0.25));
      if (blobs) paths = paths.concat(contoursIso(blur(Float32Array.from(blobs, v => 1 - v), w, h, 0.6), w, h, 0.5).map(p => G.rdp(p, tol)).filter(p => p.length > 3)); }
    paths = paths.map(p => p.map(([x, y]) => [x * back, y * back]));
    return { paths, photo, inverted: inv, w, h }; }
  // box-filter downscale of RGBA (good enough before tracing)
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
  // Outer cut: grow the artwork mask by off px, close gaps up to bridge px, fill holes, take the outside edge.
  function outerCut(mask, w, h, off, bridge) { const d1 = edt(mask, w, h), R = new Uint8Array(w * h), rr = (off + bridge) ** 2;
    for (let i = 0; i < R.length; i++) R[i] = d1[i] <= rr ? 1 : 0;
    const F = fillHoles(R, w, h), inv = new Uint8Array(w * h); for (let i = 0; i < inv.length; i++) inv[i] = F[i] ? 0 : 1;
    const d2 = edt(inv, w, h), C = new Uint8Array(w * h), b2 = bridge * bridge; for (let i = 0; i < C.length; i++) C[i] = d2[i] > b2 ? 1 : 0;
    const C2 = fillHoles(C, w, h); return contours(C2, w, h).filter(p => Math.abs(G.area(p)) > 20); }
  return { VERSION, trace, analyse, silhouette, contoursIso, canny, grey, autoContrast, otsu, blur, thin, skeletonPaths, contours, removeSpecks, edt, outerCut, fillHoles, looksLikePhoto };
})();
if (typeof module !== 'undefined') module.exports = T;
