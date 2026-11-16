// Waylands Path - SVG import: every path/shape becomes a Bezier path (true curves kept) with all transforms applied.
'use strict';
const SVGIN = (() => {
  // parse path data into Bezier paths (true curves kept; quadratics raised to cubics, arcs split into <=90 degree cubics)
  function pathToBez(d) { const tk = d.match(/[a-zA-Z]|[-+]?(?:\d*\.\d+|\d+\.?)(?:[eE][-+]?\d+)?/g) || [];
    const out = []; let i = 0, cmd = '', cx = 0, cy = 0, sx = 0, sy = 0, cur = null, lc = null, lq = null;
    const num = () => +tk[i++], isNum = () => i < tk.length && !/^[a-zA-Z]$/.test(tk[i]);
    const flag = () => { let t = tk[i]; if (t.length > 1 && /^[01]/.test(t)) { tk[i] = t.slice(1); return +t[0]; } i++; return +t; };
    const fin = () => { if (cur && cur.n.length > 1) out.push(cur); cur = null; };
    const start = (x, y) => { fin(); cur = { n: [BZ.node(x, y)], z: false }; };
    const ensure = () => { if (!cur) cur = { n: [BZ.node(cx, cy)], z: false }; };
    const line = (x, y) => { ensure(); cur.n.push(BZ.node(x, y)); };
    const cubic = (x1, y1, x2, y2, x, y) => { ensure(); cur.n[cur.n.length - 1].o = [x1, y1]; cur.n.push(BZ.node(x, y, [x2, y2])); };
    const quad = (x1, y1, x, y) => cubic(cx + 2 / 3 * (x1 - cx), cy + 2 / 3 * (y1 - cy), x + 2 / 3 * (x1 - x), y + 2 / 3 * (y1 - y), x, y);
    const arc = (rx, ry, phi, fa, fs, x, y) => { // SVG spec F.6 endpoint -> centre, then cubic per quarter
      if (!rx || !ry) { line(x, y); return; } rx = Math.abs(rx); ry = Math.abs(ry); const p = phi * Math.PI / 180, cp = Math.cos(p), sp = Math.sin(p);
      const dx = (cx - x) / 2, dy = (cy - y) / 2, x1 = cp * dx + sp * dy, y1 = -sp * dx + cp * dy; const L = x1 * x1 / (rx * rx) + y1 * y1 / (ry * ry);
      if (L > 1) { rx *= Math.sqrt(L); ry *= Math.sqrt(L); }
      let s = (rx * rx * ry * ry - rx * rx * y1 * y1 - ry * ry * x1 * x1) / (rx * rx * y1 * y1 + ry * ry * x1 * x1); s = Math.sqrt(Math.max(0, s)) * (fa === fs ? -1 : 1);
      const ccx = s * rx * y1 / ry, ccy = -s * ry * x1 / rx, mx = cp * ccx - sp * ccy + (cx + x) / 2, my = sp * ccx + cp * ccy + (cy + y) / 2;
      const ang = (ux, uy, vx, vy) => Math.atan2(ux * vy - uy * vx, ux * vx + uy * vy);
      const t1 = ang(1, 0, (x1 - ccx) / rx, (y1 - ccy) / ry); let dt = ang((x1 - ccx) / rx, (y1 - ccy) / ry, (-x1 - ccx) / rx, (-y1 - ccy) / ry);
      if (!fs && dt > 0) dt -= 2 * Math.PI; if (fs && dt < 0) dt += 2 * Math.PI;
      const n = Math.max(1, Math.ceil(Math.abs(dt) / (Math.PI / 2) - 1e-9)), h = dt / n, kap = 4 / 3 * Math.tan(h / 4);
      const P = (t) => [cp * rx * Math.cos(t) - sp * ry * Math.sin(t) + mx, sp * rx * Math.cos(t) + cp * ry * Math.sin(t) + my];
      const Dv = (t) => [-cp * rx * Math.sin(t) - sp * ry * Math.cos(t), -sp * rx * Math.sin(t) + cp * ry * Math.cos(t)];
      for (let k = 0; k < n; k++) { const a0 = t1 + h * k, a1 = a0 + h, p0 = P(a0), p1 = P(a1), d0 = Dv(a0), d1 = Dv(a1);
        cubic(p0[0] + kap * d0[0], p0[1] + kap * d0[1], p1[0] - kap * d1[0], p1[1] - kap * d1[1], k === n - 1 ? x : p1[0], k === n - 1 ? y : p1[1]); cx = p1[0]; cy = p1[1]; } };
    while (i < tk.length) { if (/^[a-zA-Z]$/.test(tk[i])) cmd = tk[i++]; else if (!cmd) { i++; continue; }
      const rel = cmd === cmd.toLowerCase(), C = cmd.toUpperCase(), ox = rel ? cx : 0, oy = rel ? cy : 0;
      if (C === 'Z') { if (cur) { const n = cur.n, f = n[0], l = n[n.length - 1]; if (n.length > 1 && Math.hypot(f.x - l.x, f.y - l.y) < 1e-6) { f.i = l.i; n.pop(); } cur.z = true; const keep = cur; fin(); cur = null; void keep; } cx = sx; cy = sy; lc = lq = null; continue; }
      if (!isNum()) { cmd = ''; continue; }
      if (C === 'M') { const x = num() + ox, y = num() + oy; start(x, y); cx = sx = x; cy = sy = y; cmd = rel ? 'l' : 'L'; lc = lq = null; }
      else if (C === 'L') { const x = num() + ox, y = num() + oy; line(x, y); cx = x; cy = y; lc = lq = null; }
      else if (C === 'H') { const x = num() + ox; line(x, cy); cx = x; lc = lq = null; }
      else if (C === 'V') { const y = num() + oy; line(cx, y); cy = y; lc = lq = null; }
      else if (C === 'C') { const a = num() + ox, b = num() + oy, c = num() + ox, e = num() + oy, x = num() + ox, y = num() + oy; cubic(a, b, c, e, x, y); lc = [c, e]; lq = null; cx = x; cy = y; }
      else if (C === 'S') { const r = lc ? [2 * cx - lc[0], 2 * cy - lc[1]] : [cx, cy], c = num() + ox, e = num() + oy, x = num() + ox, y = num() + oy; cubic(r[0], r[1], c, e, x, y); lc = [c, e]; lq = null; cx = x; cy = y; }
      else if (C === 'Q') { const a = num() + ox, b = num() + oy, x = num() + ox, y = num() + oy; quad(a, b, x, y); lq = [a, b]; lc = null; cx = x; cy = y; }
      else if (C === 'T') { const r = lq ? [2 * cx - lq[0], 2 * cy - lq[1]] : [cx, cy], x = num() + ox, y = num() + oy; quad(r[0], r[1], x, y); lq = r; lc = null; cx = x; cy = y; }
      else if (C === 'A') { const rx = num(), ry = num(), ph = num(), fa = flag(), fs = flag(), x = num() + ox, y = num() + oy; arc(rx, ry, ph, fa, fs, x, y); cx = x; cy = y; lc = lq = null; }
      else { i++; } }
    fin(); // mark smooth nodes where the handles line up
    for (const p of out) for (const nd of p.n) if (nd.i && nd.o) { const a = Math.atan2(nd.y - nd.i[1], nd.x - nd.i[0]), b = Math.atan2(nd.o[1] - nd.y, nd.o[0] - nd.x); let dd = Math.abs(a - b); if (dd > Math.PI) dd = 2 * Math.PI - dd; if (dd < 0.03) nd.s = 1; }
    return out; }
  function shapeBez(el) { const a = n => parseFloat(el.getAttribute(n)) || 0, tag = el.tagName.toLowerCase().replace(/^.*:/, '');
    if (tag === 'path') return pathToBez(el.getAttribute('d') || '');
    if (tag === 'line') return pathToBez(`M${a('x1')} ${a('y1')}L${a('x2')} ${a('y2')}`);
    if (tag === 'polyline' || tag === 'polygon') { const n = (el.getAttribute('points') || '').trim().split(/[\s,]+/).map(Number), p = [];
      for (let k = 0; k + 1 < n.length; k += 2) p.push(`${n[k]} ${n[k + 1]}`); return p.length > 1 ? pathToBez('M' + p.join('L') + (tag === 'polygon' ? 'Z' : '')) : []; }
    const ell = (cx, cy, rx, ry) => rx > 0 && ry > 0 ? pathToBez(`M${cx - rx} ${cy}A${rx} ${ry} 0 0 1 ${cx} ${cy - ry}A${rx} ${ry} 0 0 1 ${cx + rx} ${cy}A${rx} ${ry} 0 0 1 ${cx} ${cy + ry}A${rx} ${ry} 0 0 1 ${cx - rx} ${cy}Z`) : [];
    if (tag === 'circle') return ell(a('cx'), a('cy'), a('r'), a('r'));
    if (tag === 'ellipse') return ell(a('cx'), a('cy'), a('rx'), a('ry'));
    if (tag === 'rect') { const x = a('x'), y = a('y'), w = a('width'), h = a('height'); let rx = a('rx'), ry = a('ry'); if (!(w > 0 && h > 0)) return [];
      if (!el.hasAttribute('ry')) ry = rx; if (!el.hasAttribute('rx')) rx = ry; rx = Math.min(rx, w / 2); ry = Math.min(ry, h / 2);
      if (rx > 0 && ry > 0) return pathToBez(`M${x + rx} ${y}H${x + w - rx}A${rx} ${ry} 0 0 1 ${x + w} ${y + ry}V${y + h - ry}A${rx} ${ry} 0 0 1 ${x + w - rx} ${y + h}H${x + rx}A${rx} ${ry} 0 0 1 ${x} ${y + h - ry}V${y + ry}A${rx} ${ry} 0 0 1 ${x + rx} ${y}Z`);
      return pathToBez(`M${x} ${y}H${x + w}V${y + h}H${x}Z`); }
    return []; }
  const light = c => { const m = /rgba?\((\d+),\s*(\d+),\s*(\d+)(?:,\s*([\d.]+))?/.exec(c || ''); if (!m) return null; if (m[4] !== undefined && +m[4] === 0) return 'none';
    return (0.299 * m[1] + 0.587 * m[2] + 0.114 * m[3]) / 255; };
  // Needs a document: the SVG is put off-screen so the browser works out every transform (groups, nested svg, viewBox).
  function importSVG(text) { const doc = new DOMParser().parseFromString(text, 'image/svg+xml'), root0 = doc.documentElement;
    if (!root0 || root0.nodeName.toLowerCase() !== 'svg' || doc.querySelector('parsererror')) throw new Error('That SVG file could not be read.');
    root0.querySelectorAll('script,foreignObject').forEach(n => n.remove());
    const host = document.createElement('div'); host.style.cssText = 'position:fixed;left:-10000px;top:0;width:1000px;height:1000px;opacity:0;pointer-events:none;overflow:hidden';
    const root = document.importNode(root0, true); if (!root.getAttribute('width') && !root.getAttribute('viewBox')) root.setAttribute('width', '1000');
    host.appendChild(root); document.body.appendChild(host);
    const info = { shapes: 0, skippedWhite: 0, skippedText: 0, skippedUse: 0 };
    try { const els = [...root.querySelectorAll('path,line,polyline,polygon,circle,ellipse,rect')].filter(el => !el.closest('defs,clipPath,mask,symbol,marker,pattern'));
      info.skippedText = root.querySelectorAll('text').length; info.skippedUse = root.querySelectorAll('use').length;
      const rootInv = (root.getScreenCTM() || root.getCTM()).inverse(), all = [];
      for (const el of els) { const cs = getComputedStyle(el); if (cs.display === 'none' || cs.visibility === 'hidden') continue;
        const fl = cs.fill === 'none' ? 'none' : light(cs.fill), stl = cs.stroke === 'none' ? 'none' : light(cs.stroke), sw = parseFloat(cs.strokeWidth) || 0, stroked = cs.stroke !== 'none' && stl !== 'none' && sw > 0;
        // white background boxes and white filled areas from auto-tracers are not lines - skip them
        if ((!stroked || stl > 0.93) && (fl === 'none' ? !stroked : fl > 0.93)) { info.skippedWhite++; continue; }
        const M = rootInv.multiply(el.getScreenCTM() || el.getCTM()), tf = q => q && [M.a * q[0] + M.c * q[1] + M.e, M.b * q[0] + M.d * q[1] + M.f];
        for (const p of shapeBez(el)) { for (const nd of p.n) { const q = tf([nd.x, nd.y]); nd.x = q[0]; nd.y = q[1]; nd.i = tf(nd.i); nd.o = tf(nd.o); } all.push(p); } info.shapes++; }
      const bb = BZ.bbox(all); if (!bb) throw new Error('No lines found in that SVG (text and linked symbols are not imported).');
      const k = 1000 / Math.max(bb.w, bb.h, 1e-6), sc = q => q && [(q[0] - bb.x0) * k, (q[1] - bb.y0) * k];
      for (const p of all) for (const nd of p.n) { const q = sc([nd.x, nd.y]); nd.x = q[0]; nd.y = q[1]; nd.i = sc(nd.i); nd.o = sc(nd.o); }
      return { paths: all, w: bb.w * k, h: bb.h * k, info }; }
    finally { host.remove(); } }
  return { importSVG, pathToBez, shapeBez };
})();
