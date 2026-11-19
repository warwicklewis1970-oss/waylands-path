// Waylands Path - laser output. Same conventions as Wayland Forge: mm, G90/G21, M4 dynamic power, S as % of $30 (default 1000),
// origin 0,0 = bottom-left corner of the design area, every step written in that same frame so all files line up in LaserGRBL.
'use strict';
const LZ = (() => {
  const R3 = v => (Math.round(v * 1000) / 1000).toString(), f2 = v => (Math.round(v * 100) / 100).toString();
  const MODES = [['ltl', 'Line To Line'], ['dith', 'Dithering'], ['vec', 'Vector']], TAG = { ltl: 'LTL', dith: 'DITH', vec: 'VEC' };
  const DEF = { engrave: { mode: 'vec', P: 25, F: 3000, passes: 1 }, cut: { mode: 'vec', P: 100, F: 1000, passes: 3, order: 'line' } };
  // frame: design units -> mm. k = mm per unit. Width = the whole design (etch lines and cut line together).
  function frame(art, cut, widthMm) { const all = BZ.bbox(art.concat(cut || [])); if (!all) return null; const k = widthMm / Math.max(all.w, 1e-9), ab = BZ.bbox(art) || all;
    return { k, x0: all.x0, y0: all.y0, x1: all.x1, y1: all.y1, W: all.w * k, H: all.h * k, artW: ab.w * k, artH: ab.h * k }; }
  const toMmSvg = (fr, p) => p.map(([x, y]) => [(x - fr.x0) * fr.k, (y - fr.y0) * fr.k]); // y down, page top-left
  const toMmG = (fr, p) => p.map(([x, y]) => [(x - fr.x0) * fr.k, (fr.y1 - y) * fr.k]); // y up, bottom-left = 0,0
  // ---- toolpath order: chain lines that meet end to end, nearest-neighbour, then 2-opt (with reversing) to cut travel ----
  const dd = (a, b) => Math.hypot(a[0] - b[0], a[1] - b[1]);
  function chainPolys(polys) { const key = q => Math.round(q[0] * 100) + ',' + Math.round(q[1] * 100), ends = new Map();
    const P = polys.map(p => ({ p: p.slice(), alive: true })); const closed = o => o.p.length > 2 && dd(o.p[0], o.p[o.p.length - 1]) < 0.01;
    const add = (o, e) => { const k = key(e ? o.p[o.p.length - 1] : o.p[0]); if (!ends.has(k)) ends.set(k, []); ends.get(k).push(o); };
    P.forEach(o => { if (!closed(o)) { add(o, 0); add(o, 1); } });
    for (const [k, list] of ends) { if (list.length !== 2 || list[0] === list[1] || !list[0].alive || !list[1].alive) continue; let [a, b] = list;
      if (key(a.p[a.p.length - 1]) !== k) a.p.reverse(); if (key(b.p[0]) !== k) b.p.reverse(); if (key(a.p[a.p.length - 1]) !== k || key(b.p[0]) !== k) continue;
      a.p = a.p.concat(b.p.slice(1)); b.alive = false; b.p = a.p; for (const [k2, l2] of ends) { const i = l2.indexOf(b); if (i >= 0) l2[i] = a; } }
    return P.filter(o => o.alive).map(o => o.p); }
  function orderPolys(polys, start = [0, 0]) { const left = polys.map(p => ({ p, closed: p.length > 2 && dd(p[0], p[p.length - 1]) < 0.01 })), out = []; let cur = start;
    while (left.length) { let bi = 0, bd = Infinity, rev = false, rot = -1;
      left.forEach((o, i) => { if (o.closed) { o.p.forEach((q, j) => { const d = dd(cur, q); if (d < bd) { bd = d; bi = i; rev = false; rot = j; } }); }
        else { const d0 = dd(cur, o.p[0]), d1 = dd(cur, o.p[o.p.length - 1]); if (d0 < bd) { bd = d0; bi = i; rev = false; rot = -1; } if (d1 < bd) { bd = d1; bi = i; rev = true; rot = -1; } } });
      const o = left.splice(bi, 1)[0]; let p = o.p; if (rot > 0) { const q = p.slice(0, -1); p = q.slice(rot).concat(q.slice(0, rot)); p.push(p[0]); } else if (rev) p = p.slice().reverse();
      out.push(p); cur = p[p.length - 1]; }
    // 2-opt: reversing a run of lines (and each line in it) when that shortens the jumps
    const n = out.length, t0 = Date.now(); if (n > 3) { let better = true, guard = 0;
      while (better && guard++ < 30 && Date.now() - t0 < 1500) { better = false;
        for (let i = 0; i < n - 1; i++) { const A = i ? out[i - 1][out[i - 1].length - 1] : start;
          for (let j = i + 1; j < n; j++) { const si = out[i][0], ej = out[j][out[j].length - 1], B = j < n - 1 ? out[j + 1][0] : null;
            const before = dd(A, si) + (B ? dd(ej, B) : 0), after = dd(A, ej) + (B ? dd(si, B) : 0);
            if (after < before - 1e-6) { const seg = out.slice(i, j + 1).reverse().map(p => p.slice().reverse()); out.splice(i, j - i + 1, ...seg); better = true; } } } } }
    return out; }
  function travel(polys, start = [0, 0]) { let t = 0, cur = start; for (const p of polys) { t += dd(cur, p[0]); cur = p[p.length - 1]; } return t; }
  // Bezier paths -> polylines in laser mm (y up, 0,0 = bottom-left), curves flattened to 0.02 mm
  // v4 line thickness / double line: a path with p.w (etch width, mm) and/or p.dbl (distance between two lines, mm) is burnt as
  // parallel offset passes spaced at the laser line width. Paths without them are untouched (one pass on the centre line, as before).
  function widthOffs(p, lineMm) { const lw = lineMm > 0 ? lineMm : 0.3, W = Math.max(lw, +p.w || 0), D = +p.dbl || 0; if (W <= lw + 1e-9 && !(D > 0)) return null;
    const n = W > lw + 1e-9 ? Math.ceil((W - lw) / lw - 1e-9) + 1 : 1, step = n > 1 ? (W - lw) / (n - 1) : 0, one = []; for (let i = 0; i < n; i++) one.push(-(W - lw) / 2 + i * step);
    if (!(D > 0)) return one; const all = one.map(o => o - D / 2).concat(one.map(o => o + D / 2)).sort((a, b) => a - b), out = []; // drop passes that would land on top of each other
    for (const o of all) if (!out.length || o - out[out.length - 1] >= lw * 0.5 - 1e-9) out.push(o); return out; }
  function offsetPoly(pts0, d, closed) { const pts = []; for (const q of pts0) if (!pts.length || Math.hypot(q[0] - pts[pts.length - 1][0], q[1] - pts[pts.length - 1][1]) > 1e-9) pts.push(q);
    if (closed && pts.length > 2 && Math.hypot(pts[0][0] - pts[pts.length - 1][0], pts[0][1] - pts[pts.length - 1][1]) < 1e-9) pts.pop(); const n = pts.length; if (n < 2 || !d) return pts0.map(q => q.slice());
    const nrm = (a, b) => { const dx = b[0] - a[0], dy = b[1] - a[1], l = Math.hypot(dx, dy) || 1; return [-dy / l, dx / l]; }, out = [];
    for (let i = 0; i < n; i++) { const hasP = closed || i > 0, hasN = closed || i < n - 1, nP = hasP ? nrm(pts[(i - 1 + n) % n], pts[i]) : null, nN = hasN ? nrm(pts[i], pts[(i + 1) % n]) : null;
      let v = nP && nN ? [nP[0] + nN[0], nP[1] + nN[1]] : (nP || nN), l = Math.hypot(v[0], v[1]); if (l < 1e-9) v = nN || nP, l = 1;
      v = [v[0] / l, v[1] / l]; const c = nN ? v[0] * nN[0] + v[1] * nN[1] : 1, m = Math.min(1 / Math.max(c, 1e-6), 3); out.push([pts[i][0] + v[0] * d * m, pts[i][1] + v[1] * d * m]); }
    if (closed) out.push(out[0].slice()); return out; }
  const expand = (p, base, lineMm) => { const offs = widthOffs(p, lineMm); return offs ? offs.map(o => offsetPoly(base, o, !!p.z)) : [base]; };
  const polysG = (fr, paths) => [].concat(...paths.map(p => expand(p, toMmG(fr, BZ.flatten(p, 0.02 / fr.k)), fr.lineMm))).filter(p => p.length > 1);
  // ---- sheet layout: where each copy of the design sits, in laser mm (y up). No sheet = one copy at 0,0, area = the design. ----
  // v4.9: no blank -> optional border (mm) round the design, so laser 0,0 is a free corner `pad` mm below/left of the design (pad 0 = v4.8 output)
  function layout(fr, sh, pad) { if (!sh || !sh.on) { const m = Math.max(0, +pad || 0); return { on: false, pad: m, offs: [[m, m]], ax0: m, ay0: m, ax1: m + fr.W, ay1: m + fr.H, W: fr.W + 2 * m, H: fr.H + 2 * m, n: 1, fits: true }; }
    const W = +sh.W, H = +sh.H, m = Math.max(0, +sh.margin || 0), gap = Math.max(0, +sh.gap || 0), dw = fr.W, dh = fr.H;
    let nx = Math.max(1, Math.round(+sh.nx || 1)), ny = Math.max(1, Math.round(+sh.ny || 1));
    const bw = nx * dw + (nx - 1) * gap, bh = ny * dh + (ny - 1) * gap, cen = sh.place !== 'margin';
    const ox = cen ? (W - bw) / 2 : m, oy = cen ? (H - bh) / 2 : m, fits = bw <= W - 2 * m + 1e-6 && bh <= H - 2 * m + 1e-6;
    const offs = []; for (let j = 0; j < ny; j++) for (let i = 0; i < nx; i++) offs.push([ox + i * (dw + gap), oy + j * (dh + gap)]);
    return { on: true, offs, ax0: ox, ay0: oy, ax1: ox + bw, ay1: oy + bh, W, H, n: offs.length, nx, ny, fits, bw, bh, m }; }
  function fitCount(fr, sh) { const W = +sh.W, H = +sh.H, m = Math.max(0, +sh.margin || 0), gap = Math.max(0, +sh.gap || 0);
    return { nx: Math.max(0, Math.floor((W - 2 * m + gap + 1e-6) / (fr.W + gap))), ny: Math.max(0, Math.floor((H - 2 * m + gap + 1e-6) / (fr.H + gap))) }; }
  const shift = (polys, o) => o[0] || o[1] ? polys.map(p => p.map(q => [q[0] + o[0], q[1] + o[1]])) : polys;
  const polysLay = (fr, paths, lay) => lay.offs.length === 1 && !lay.offs[0][0] && !lay.offs[0][1] ? polysG(fr, paths) : [].concat(...lay.offs.map(o => shift(polysG(fr, paths), o)));
  // ---- cut order: a cut inside another closed cut is a hole. Deepest holes first, outer outlines last, nearest-neighbour within a depth. ----
  const isClosed = p => p.length > 2 && dd(p[0], p[p.length - 1]) < 0.05;
  function inPoly(pt, poly) { let c = false; for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) { const a = poly[i], b = poly[j];
    if ((a[1] > pt[1]) !== (b[1] > pt[1]) && pt[0] < (b[0] - a[0]) * (pt[1] - a[1]) / (b[1] - a[1] || 1e-12) + a[0]) c = !c; } return c; }
  const areaOf = p => { let a = 0; for (let i = 0, j = p.length - 1; i < p.length; j = i++) a += (p[j][0] + p[i][0]) * (p[j][1] - p[i][1]); return Math.abs(a / 2); };
  function cutDepths(polys) { const cl = polys.map(isClosed), ar = polys.map((p, i) => cl[i] ? areaOf(p) : 0);
    return polys.map((p, i) => { const smp = []; const st = Math.max(1, Math.floor(p.length / 9)); for (let k = 0; k < p.length; k += st) smp.push(p[k]);
      let d = 0; polys.forEach((q, j) => { if (j === i || !cl[j] || ar[j] <= ar[i]) return; let n = 0; for (const s0 of smp) if (inPoly(s0, q)) n++; if (n > smp.length / 2) d++; }); return d; }); }
  function cutOrder(polys0) { const polys = chainPolys(polys0), dep = cutDepths(polys), maxD = Math.max(0, ...dep), out = []; let cur = [0, 0];
    for (let d = maxD; d >= 0; d--) { const grp = polys.filter((p, i) => dep[i] === d); if (!grp.length) continue;
      for (const p of orderPolys(grp, cur)) { out.push({ p, depth: d, closed: isClosed(p) }); cur = p[p.length - 1]; } }
    return { list: out, maxD }; }
  // cut G-code: same commands as every Vector step (M5 -> G0 S0 -> M4 S0 between lines, G1 at the step power), but in the safe order.
  // order 'line' (default): each line gets ALL its passes before the next line. 'pass': every line once per pass, still holes first each pass.
  function cutG(fr, paths, b, smax, title, lay) { const Smax = Math.round(smax * b.P / 100), lim = { x0: 0, y0: 0, x1: lay.W, y1: lay.H };
    const cx = v => R3(Math.min(lim.x1, Math.max(lim.x0, v))), cy = v => R3(Math.min(lim.y1, Math.max(lim.y0, v)));
    const { list } = cutOrder(polysLay(fr, paths, lay)), perLine = b.order !== 'pass', nH = list.filter(o => o.depth > 0).length;
    const L = [`; Waylands Path ${String(title).replace(/[^\w .-]/g, '').slice(0, 30)}`, `; F${b.F} S${Smax} of ${smax} x${b.passes}`, areaLine(fr, lay),
      `; ${list.length} cut lines: ${nH} inner (holes) first, deepest first, outer outline(s) last`, `; ${perLine ? 'each line gets all its passes before the next line' : 'every line once per pass, inner lines first in each pass'}`,
      `; laser off (M5) for every move between lines`, 'G90', 'G21', 'M5', 'G0 X0 Y0 S0']; let first = true, at = null;
    const burn = (pl, rev) => { const q = rev ? pl.slice().reverse() : pl; if (!at || dd(at, q[0]) > 0.01) L.push('M5', `G0 X${cx(q[0][0])} Y${cy(q[0][1])} S0`, 'M4 S0');
      for (let i = 1; i < q.length; i++) { L.push(`G1 X${cx(q[i][0])} Y${cy(q[i][1])} S${Smax}${first ? ` F${b.F}` : ''}`); first = false; } at = q[q.length - 1]; };
    const tag = (o, i) => `${i + 1}/${list.length} ${o.depth > 0 ? `inner${o.depth > 1 ? ' depth ' + o.depth : ''}` : 'outer'}${o.closed ? '' : ' (open line)'}`;
    if (perLine) list.forEach((o, i) => { for (let k = 0; k < b.passes; k++) { L.push(`; cut ${tag(o, i)} pass ${k + 1}/${b.passes}`); at = null; burn(o.p, !o.closed && k % 2 === 1); } });
    else for (let k = 0; k < b.passes; k++) { L.push(`; pass ${k + 1}`); at = null; list.forEach((o, i) => { L.push(`; cut ${tag(o, i)}`); burn(o.p, false); }); }
    L.push('M5', 'G0 X0 Y0 S0'); cutG.last = { list, perLine }; return L.join('\n') + '\n'; }
  const areaLine = (fr, lay) => !lay.on && lay.pad ? `; area 0,0 to ${f2(lay.W)},${f2(lay.H)} mm: design ${f2(lay.ax0)},${f2(lay.ay0)} to ${f2(lay.ax1)},${f2(lay.ay1)} mm with a ${f2(lay.pad)} mm border, laser zero ${f2(lay.pad)} mm below and left of the design` : lay.on ? `; blank ${f2(lay.W)} x ${f2(lay.H)} mm, 0,0 = blank bottom-left; design area ${f2(lay.ax0)},${f2(lay.ay0)} to ${f2(lay.ax1)},${f2(lay.ay1)} mm (${lay.n} cop${lay.n > 1 ? 'ies' : 'y'})` : `; area 0,0 to ${f2(fr.W)},${f2(fr.H)} mm`;
  // Vector G-code. Every jump between lines: M5 (laser off) -> G0 rapid with S0 -> M4 S0, then G1 burns at the step power.
  function vecG(fr, paths, b, smax, title, lay) { lay = lay || layout(fr, null); const Smax = Math.round(smax * b.P / 100), W = lay.W, H = lay.H;
    const cx = v => R3(Math.min(W, Math.max(0, v))), cy = v => R3(Math.min(H, Math.max(0, v)));
    const polys = orderPolys(chainPolys(polysLay(fr, paths, lay))), tr = travel(polys);
    const L = [`; Waylands Path ${String(title).replace(/[^\w .-]/g, '').slice(0, 30)}`, `; F${b.F} S${Smax} of ${smax} x${b.passes}`, areaLine(fr, lay),
      `; ${polys.length} strokes, laser off (M5) for every move between strokes`, 'G90', 'G21', 'M5', 'G0 X0 Y0 S0']; let first = true;
    for (let k = 0; k < b.passes; k++) { if (b.passes > 1) L.push(`; pass ${k + 1}`);
      let at = null; for (const pl of polys) { if (!at || dd(at, pl[0]) > 0.01) L.push('M5', `G0 X${cx(pl[0][0])} Y${cy(pl[0][1])} S0`, 'M4 S0'); at = pl[pl.length - 1];
        for (let i = 1; i < pl.length; i++) { L.push(`G1 X${cx(pl[i][0])} Y${cy(pl[i][1])} S${Smax}${first ? ` F${b.F}` : ''}`); first = false; } } }
    L.push('M5', 'G0 X0 Y0 S0'); const out = L.join('\n') + '\n'; vecG.last = { strokes: polys.length, travelMm: tr }; return out; }
  // raster of the lines (stroked at lineMm) on the same frame, 10 px/mm by default
  function raster(fr, paths, lineMm, pxmm, lay) { lay = lay || layout(fr, null); const pw = Math.max(1, Math.ceil((lay.ax1 - lay.ax0) * pxmm)), ph = Math.max(1, Math.ceil((lay.ay1 - lay.ay0) * pxmm));
    const cv = document.createElement('canvas'); cv.width = pw; cv.height = ph; const c = cv.getContext('2d'); c.fillStyle = '#fff'; c.fillRect(0, 0, pw, ph);
    c.strokeStyle = '#000'; c.lineWidth = Math.max(1, lineMm * pxmm); c.lineCap = c.lineJoin = 'round'; c.beginPath();
    for (const o of lay.offs) { const X = (o[0] - lay.ax0) * pxmm, Y = (lay.ay1 - (o[1] + fr.H)) * pxmm;
      for (const p0 of paths) for (const q of expand(p0, toMmSvg(fr, BZ.flatten(p0, 0.05 / fr.k)), lineMm)) { c.moveTo(X + q[0][0] * pxmm, Y + q[0][1] * pxmm); for (let i = 1; i < q.length; i++) c.lineTo(X + q[i][0] * pxmm, Y + q[i][1] * pxmm); if (q.length === 1) c.lineTo(X + q[0][0] * pxmm + 0.01, Y + q[0][1] * pxmm); } }
    c.stroke(); return { d: c.getImageData(0, 0, pw, ph).data, pw, ph }; }
  function dither(d, pw, ph) { const g = new Float32Array(pw * ph); for (let i = 0; i < g.length; i++) g[i] = d[i * 4];
    for (let y = 0; y < ph; y++) for (let x = 0; x < pw; x++) { const i = y * pw + x, o = g[i], nv = o < 128 ? 0 : 255, e = o - nv; g[i] = nv;
      if (x + 1 < pw) g[i + 1] += e * 7 / 16; if (y + 1 < ph) { if (x > 0) g[i + pw - 1] += e * 3 / 16; g[i + pw] += e * 5 / 16; if (x + 1 < pw) g[i + pw + 1] += e / 16; } }
    for (let i = 0; i < g.length; i++) d[i * 4] = g[i]; }
  // Line To Line / Dithering G-code: horizontal zig-zag rows from the bottom, G0 over white, like LaserGRBL's own output
  function rasterG(fr, paths, b, smax, title, lineMm, pxmm, lay) { lay = lay || layout(fr, null); const { d, pw, ph } = raster(fr, paths, lineMm, pxmm, lay); if (b.mode === 'dith') dither(d, pw, ph);
    const mm = 1 / pxmm, Smax = Math.round(smax * b.P / 100), gap = Math.max(2, Math.round(2 / mm)), crisp = b.mode !== 'ltl';
    const S = g => g >= 250 ? 0 : crisp ? Smax : g < 128 ? Smax : Math.round(Smax * (255 - g) / 255);
    const XW = lay.W, YH = lay.H, cx = v => R3(Math.min(XW, Math.max(0, lay.ax0 + v))), cy = v => R3(Math.min(YH, Math.max(0, lay.ay0 + v)));
    const L = [`; Waylands Path ${String(title).replace(/[^\w .-]/g, '').slice(0, 30)}`, `; F${b.F} S${Smax} of ${smax} x${b.passes} ${TAG[b.mode]} ${pxmm} lines/mm`, areaLine(fr, lay), 'G90', 'G21', 'M5', 'G0 X0 Y0', 'M4 S0'];
    let n = 0, first = true;
    for (let pass = 0; pass < b.passes; pass++) { if (b.passes > 1) L.push(`; pass ${pass + 1}`); n = 0;
      for (let r = ph - 1; r >= 0; r--) { const segs = []; let st = -1, sv = 0;
        for (let x = 0; x <= pw; x++) { const v = x < pw ? S(d[(r * pw + x) * 4]) : -1; if (st < 0) { st = x; sv = v; } else if (v !== sv) { segs.push([st, x, sv]); st = x; sv = v; } }
        while (segs.length && segs[0][2] === 0) segs.shift(); while (segs.length && segs[segs.length - 1][2] === 0) segs.pop(); if (!segs.length) continue;
        const fwd = n % 2 === 0, y = cy((ph - 1 - r + 0.5) * mm); n++; const order = fwd ? segs : segs.slice().reverse();
        L.push(`G0 X${cx((fwd ? order[0][0] : order[0][1]) * mm)} Y${y} S0`);
        for (const [a, bb, v] of order) { const ex = (fwd ? bb : a) * mm; if (v === 0 && bb - a >= gap) L.push(`G0 X${cx(ex)} S0`); else { L.push(`G1 X${cx(ex)} S${v}${first ? ` F${b.F}` : ''}`); first = false; } } } }
    L.push('M5', 'G0 X0 Y0'); return L.join('\n') + '\n'; }
  const esc = s => String(s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]);
  const dStr = (fr, p) => { const m = q => `${R3((q[0] - fr.x0) * fr.k)} ${R3((q[1] - fr.y0) * fr.k)}`, n = p.n; if (!n.length) return '';
    let d = 'M' + m([n[0].x, n[0].y]); for (let k = 0; k < BZ.nseg(p); k++) { const s = BZ.seg(p, k); d += s.line ? 'L' + m(s.C[3]) : 'C' + m(s.C[1]) + ' ' + m(s.C[2]) + ' ' + m(s.C[3]); } return d + (p.z ? 'Z' : ''); };
  // SVG in true mm: width/height in mm, viewBox 0 0 W H, so LaserGRBL and Inkscape read it 1:1
  function svg(fr, groups, title, lay) { lay = lay || layout(fr, null); const W = f2(lay.W), H = f2(lay.H);
    const body = g => g.paths.map(p => widthOffs(p, fr.lineMm) ? expand(p, toMmSvg(fr, BZ.flatten(p, 0.02 / fr.k)), fr.lineMm).map(q => `<path d="M${q.map(v => R3(v[0]) + ' ' + R3(v[1])).join('L')}"/>`).join('\n') : `<path d="${dStr(fr, p)}"/>`).join('\n'), copies = g => lay.on || lay.pad ? lay.offs.map(o => `<g transform="translate(${R3(o[0])} ${R3(lay.H - o[1] - fr.H)})">\n${body(g)}\n</g>`).join('\n') : body(g);
    return `<?xml version="1.0" encoding="UTF-8"?>\n<svg xmlns="http://www.w3.org/2000/svg" width="${W}mm" height="${H}mm" viewBox="0 0 ${W} ${H}">\n<title>${esc(title)}</title>\n` +
      groups.map(g => `<g id="${g.id}" fill="none" stroke="${g.color}" stroke-width="${f2(g.width)}" stroke-linecap="round" stroke-linejoin="round">\n${copies(g)}\n</g>`).join('\n') + '\n</svg>\n'; }
  const CRC = (() => { const t = new Uint32Array(256); for (let n = 0; n < 256; n++) { let c = n; for (let k = 0; k < 8; k++) c = c & 1 ? 0xEDB88320 ^ (c >>> 1) : c >>> 1; t[n] = c >>> 0; } return t; })();
  function crc32(u) { let c = 0xFFFFFFFF; for (let i = 0; i < u.length; i++) c = CRC[(c ^ u[i]) & 255] ^ (c >>> 8); return (c ^ 0xFFFFFFFF) >>> 0; }
  function makeZip(files) { // plain "stored" zip: opens in Windows Explorer with no extra software
    const enc = new TextEncoder(), parts = [], cen = []; let off = 0; const now = new Date();
    const dt = ((now.getHours() << 11) | (now.getMinutes() << 5) | (now.getSeconds() >> 1)) & 0xFFFF, dd = (((now.getFullYear() - 1980) << 9) | ((now.getMonth() + 1) << 5) | now.getDate()) & 0xFFFF;
    for (const f of files) { const name = enc.encode(f.name), data = typeof f.data === 'string' ? enc.encode(f.data) : f.data, crc = crc32(data);
      const h = new DataView(new ArrayBuffer(30)); h.setUint32(0, 0x04034b50, true); h.setUint16(4, 20, true); h.setUint16(6, 0x0800, true); h.setUint16(10, dt, true); h.setUint16(12, dd, true);
      h.setUint32(14, crc, true); h.setUint32(18, data.length, true); h.setUint32(22, data.length, true); h.setUint16(26, name.length, true); parts.push(h.buffer, name, data);
      const c = new DataView(new ArrayBuffer(46)); c.setUint32(0, 0x02014b50, true); c.setUint16(4, 20, true); c.setUint16(6, 20, true); c.setUint16(8, 0x0800, true); c.setUint16(12, dt, true); c.setUint16(14, dd, true);
      c.setUint32(16, crc, true); c.setUint32(20, data.length, true); c.setUint32(24, data.length, true); c.setUint16(28, name.length, true); c.setUint32(42, off, true);
      cen.push(c.buffer, name); off += 30 + name.length + data.length; }
    const cl = cen.reduce((a, b) => a + b.byteLength, 0), e = new DataView(new ArrayBuffer(22));
    e.setUint32(0, 0x06054b50, true); e.setUint16(8, files.length, true); e.setUint16(10, files.length, true); e.setUint32(12, cl, true); e.setUint32(16, off, true);
    return new Blob([...parts, ...cen, e.buffer], { type: 'application/zip' }); }
  const tag = b => `${TAG[b.mode]} P${b.P} F${b.F}${b.passes > 1 ? ` x${b.passes}` : ''}`;
  // a project name that is safe as a Windows file name: no \ / : * ? " < > | or control characters, no trailing dot or space,
  // not a reserved device name (CON, PRN, AUX, NUL, COM1-9, LPT1-9), at most 40 characters
  function safeName(name) { let b = String(name || '').replace(/[\u0000-\u001f\u007f\\/:*?"<>|]+/g, ' ').replace(/\s+/g, ' ').trim().slice(0, 40).replace(/[. ]+$/, '');
    if (/^(con|prn|aux|nul|com[1-9]|lpt[1-9])(\..*)?$/i.test(b)) b = b + ' design'; return b || 'Waylands Path'; }
  // all files for one export
  function build(o) { const { name, art, cut, widthMm, burn, smax, lineMm, pxmm } = o, fr = frame(art, cut, widthMm); if (!fr) throw new Error('Nothing to export yet - open a picture first.'); fr.lineMm = lineMm;
    const lay = layout(fr, o.sheet, o.border); if (lay.on && !lay.fits) throw new Error(`The ${lay.nx} x ${lay.ny} copies (${f2(lay.bw)} x ${f2(lay.bh)} mm) do not fit inside the margin of the ${f2(lay.W)} x ${f2(lay.H)} mm blank. Use fewer copies, a smaller width, or tap Fit as many as possible.`);
    // v5.1: file NAMES = project name + export date/time (o.stamp, e.g. "2026-11-19 2300"), so every export has its own names in
    // Downloads / LaserGRBL. File CONTENTS still use just the project name (base), so they are byte-for-byte as before.
    const base = safeName(name), fb = o.stamp ? `${base} ${String(o.stamp).replace(/[^0-9 -]/g, '').trim()}`.trim() : base, size = lay.on ? `${lay.n}x on ${Math.round(lay.W)}x${Math.round(lay.H)}mm` : `${Math.round(fr.W)}x${Math.round(fr.H)}mm`;
    const steps = [{ key: 'engrave', label: 'Engrave lines', paths: art }]; if (cut && cut.length) steps.push({ key: 'cut', label: 'Cut outside', paths: cut });
    const files = [];
    steps.forEach((s, i) => { const b = burn[s.key], n = i + 1; s.n = n; s.b = b;
      s.file = `${fb} ${n} ${s.label.toLowerCase()} ${tag(b)}.nc`;
      s.data = b.mode === 'vec' ? (s.key === 'cut' ? cutG(fr, s.paths, b, smax, s.label, lay) : vecG(fr, s.paths, b, smax, s.label, lay)) : rasterG(fr, s.paths, b, smax, s.label, lineMm, pxmm, lay);
      files.push({ name: s.file, data: s.data }); });
    const groups = [{ id: 'engrave-lines', color: '#000000', width: lineMm, paths: art }]; if (cut && cut.length) groups.push({ id: 'cut-outside', color: '#ff0000', width: 0.1, paths: cut });
    const svgAll = svg(fr, groups, `${base} ${size}`, lay), svgName = `${fb} artwork ${size}.svg`; files.push({ name: svgName, data: svgAll });
    steps.forEach(s => files.push({ name: `${fb} ${s.n} ${s.label.toLowerCase()}.svg`, data: svg(fr, [groups[s.n - 1]], `${base} ${s.label}`, lay) }));
    const readme = readMe(base, fr, steps, smax, svgName, lay); files.unshift({ name: `${fb} 0 read me.txt`, data: readme });
    return { fr, lay, steps, files, base, fileBase: fb, size, svgAll, svgName, zipName: `${fb} laser.zip` }; }
  function readMe(base, fr, steps, smax, svgName, lay) { const L = [`WAYLANDS PATH - ${base}`, lay && lay.on ?
      `Blank: ${f2(lay.W)} x ${f2(lay.H)} mm with ${lay.n} cop${lay.n > 1 ? 'ies' : 'y'} of the ${f2(fr.W)} x ${f2(fr.H)} mm design. Laser 0,0 = BOTTOM-LEFT CORNER OF THE BLANK - put the laser there before Start.` :
      lay && lay.pad ? `Design: ${f2(fr.W)} x ${f2(fr.H)} mm with a ${f2(lay.pad)} mm border all round (area ${f2(lay.W)} x ${f2(lay.H)} mm).\r\nSET YOUR LASER'S ZERO ${f2(lay.pad)} mm BELOW AND ${f2(lay.pad)} mm LEFT OF WHERE THE DESIGN'S BOTTOM-LEFT CORNER (lowest point, e.g. the tab bottoms) SHOULD GO. Nothing burns closer than ${f2(lay.pad)} mm to 0,0. Run Frame first.` :
      `Design area: ${f2(fr.W)} x ${f2(fr.H)} mm. Laser 0,0 = bottom-left corner of the design area.`, '',
    'IN LASERGRBL (Windows): unzip first (right-click the zip > Extract All > Extract).', 'Every .nc file lines up by itself - same 0,0, same design area. Nothing to size or offset.', ''];
    steps.forEach(s => { L.push(`STEP ${s.n}: ${s.label.toUpperCase()}`, `  File: ${s.file}`, `  ${({ vec: 'Vector', ltl: 'Line To Line', dith: 'Dithering' })[s.b.mode]}, power ${s.b.P}% (S${Math.round(smax * s.b.P / 100)} of ${smax}), speed ${s.b.F} mm/min, ${s.b.passes} pass${s.b.passes > 1 ? 'es' : ''}.`,
      ...(s.key === 'engrave' && s.paths.some(p => widthOffs(p, fr.lineMm)) ? (() => { const t = s.paths.filter(p => widthOffs(p, fr.lineMm)); return [`  Thick / double lines: ${t.length} line${t.length > 1 ? 's are' : ' is'} burnt as ${[...new Set(t.map(p => widthOffs(p, fr.lineMm).length))].sort((a, b) => a - b).join(' or ')} side-by-side passes ${f2(fr.lineMm)} mm apart (set in the Thickness tool). All other lines: one pass as usual.`]; })() : []),
      ...(s.key === 'cut' && s.b.mode === 'vec' ? [`  Order: inner cuts (holes, windows, slots) first, outer outline last${s.b.order !== 'pass' ? ' - each line gets all its passes before the next' : ''}, so nothing drops out early.`] : []),
      `  LaserGRBL: File > Open File > pick it > Start. Power and speed are written into the file.`, `  To adjust on the machine, use the S [1.00x] (power) and G1 [1.00x] (speed) buttons in LaserGRBL's bottom bar.`, ''); });
    if (steps.length > 1) L.push('Burn step 1 first, then step 2 (the cut) without moving the material or the laser origin.', '');
    L.push(`Also included: ${svgName} (all lines in mm, cut in red) and one SVG per step, for Inkscape or LaserGRBL's SVG import.`, 'Made with Waylands Path.');
    return L.join('\r\n') + '\r\n'; }
  return { safeName, widthOffs, offsetPoly, chainPolys, orderPolys, travel, polysG, layout, fitCount, cutOrder, cutDepths, cutG, MODES, TAG, DEF, frame, vecG, rasterG, svg, makeZip, crc32, build, tag, toMmSvg, toMmG };
})();
