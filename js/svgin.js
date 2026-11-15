// Waylands Path - SVG import: every path/shape becomes polylines with all transforms applied.
'use strict';
const SVGIN = (() => {
  // parse path data into absolute subpaths of flattened points
  function pathToPolys(d, tol) { const tk = d.match(/[a-zA-Z]|[-+]?(?:\d*\.\d+|\d+\.?)(?:[eE][-+]?\d+)?/g) || [];
    const polys = []; let i = 0, cmd = '', cx = 0, cy = 0, sx = 0, sy = 0, cur = null, lc = null, lq = null, prevCmd = '';
    const num = () => +tk[i++], isNum = () => i < tk.length && !/^[a-zA-Z]$/.test(tk[i]);
    const flag = () => { // arc flags may be written without separators ("011")
      let t = tk[i]; if (t.length > 1 && /^[01]/.test(t)) { tk[i] = t.slice(1); return +t[0]; } i++; return +t; };
    const start = (x, y) => { if (cur && cur.length > 1) polys.push(cur); cur = [[x, y]]; };
    const line = (x, y) => { if (!cur) cur = [[cx, cy]]; cur.push([x, y]); };
    const steps = (pts, n) => Math.max(2, Math.min(64, Math.ceil(Math.sqrt(n / tol))));
    const cubic = (x1, y1, x2, y2, x, y) => { const L = Math.hypot(x1 - cx, y1 - cy) + Math.hypot(x2 - x1, y2 - y1) + Math.hypot(x - x2, y - y2), n = steps(0, L);
      for (let k = 1; k <= n; k++) { const t = k / n, u = 1 - t; line(u * u * u * cx + 3 * u * u * t * x1 + 3 * u * t * t * x2 + t * t * t * x, u * u * u * cy + 3 * u * u * t * y1 + 3 * u * t * t * y2 + t * t * t * y); } };
    const quad = (x1, y1, x, y) => { const L = Math.hypot(x1 - cx, y1 - cy) + Math.hypot(x - x1, y - y1), n = steps(0, L);
      for (let k = 1; k <= n; k++) { const t = k / n, u = 1 - t; line(u * u * cx + 2 * u * t * x1 + t * t * x, u * u * cy + 2 * u * t * y1 + t * t * y); } };
    const arc = (rx, ry, phi, fa, fs, x, y) => { // SVG spec F.6 endpoint -> centre
      if (!rx || !ry) { line(x, y); return; } rx = Math.abs(rx); ry = Math.abs(ry); const p = phi * Math.PI / 180, cp = Math.cos(p), sp = Math.sin(p);
      const dx = (cx - x) / 2, dy = (cy - y) / 2, x1 = cp * dx + sp * dy, y1 = -sp * dx + cp * dy; let L = x1 * x1 / (rx * rx) + y1 * y1 / (ry * ry);
      if (L > 1) { rx *= Math.sqrt(L); ry *= Math.sqrt(L); }
      let s = (rx * rx * ry * ry - rx * rx * y1 * y1 - ry * ry * x1 * x1) / (rx * rx * y1 * y1 + ry * ry * x1 * x1); s = Math.sqrt(Math.max(0, s)) * (fa === fs ? -1 : 1);
      const ccx = s * rx * y1 / ry, ccy = -s * ry * x1 / rx, mx = cp * ccx - sp * ccy + (cx + x) / 2, my = sp * ccx + cp * ccy + (cy + y) / 2;
      const ang = (ux, uy, vx, vy) => { const a = Math.atan2(ux * vy - uy * vx, ux * vx + uy * vy); return a; };
      const t1 = ang(1, 0, (x1 - ccx) / rx, (y1 - ccy) / ry); let dt = ang((x1 - ccx) / rx, (y1 - ccy) / ry, (-x1 - ccx) / rx, (-y1 - ccy) / ry);
      if (!fs && dt > 0) dt -= 2 * Math.PI; if (fs && dt < 0) dt += 2 * Math.PI;
      const n = Math.max(4, Math.min(128, Math.ceil(Math.abs(dt) * Math.sqrt(Math.max(rx, ry) / tol) / 1.5)));
      for (let k = 1; k <= n; k++) { const t = t1 + dt * k / n, ex = rx * Math.cos(t), ey = ry * Math.sin(t); line(cp * ex - sp * ey + mx, sp * ex + cp * ey + my); } };
    while (i < tk.length) { if (/^[a-zA-Z]$/.test(tk[i])) cmd = tk[i++]; else if (!cmd) { i++; continue; }
      const rel = cmd === cmd.toLowerCase(), C = cmd.toUpperCase(), ox = rel ? cx : 0, oy = rel ? cy : 0;
      if (C === 'Z') { if (cur) { cur.push([sx, sy]); polys.push(cur); cur = null; } cx = sx; cy = sy; lc = lq = null; prevCmd = 'Z'; continue; }
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
      else { i++; } prevCmd = C; }
    if (cur && cur.length > 1) polys.push(cur); return polys; }
  const ellipse = (cx, cy, rx, ry, tol) => { const n = Math.max(16, Math.min(180, Math.ceil(2 * Math.PI * Math.sqrt(Math.max(rx, ry) / tol)))), o = [];
    for (let k = 0; k <= n; k++) { const t = 2 * Math.PI * k / n; o.push([cx + rx * Math.cos(t), cy + ry * Math.sin(t)]); } return o; };
  function shapePolys(el, tol) { const a = n => parseFloat(el.getAttribute(n)) || 0, tag = el.tagName.toLowerCase().replace(/^.*:/, '');
    if (tag === 'path') return pathToPolys(el.getAttribute('d') || '', tol);
    if (tag === 'line') return [[[a('x1'), a('y1')], [a('x2'), a('y2')]]];
    if (tag === 'polyline' || tag === 'polygon') { const n = (el.getAttribute('points') || '').trim().split(/[\s,]+/).map(Number), p = [];
      for (let k = 0; k + 1 < n.length; k += 2) p.push([n[k], n[k + 1]]); if (tag === 'polygon' && p.length > 2) p.push(p[0].slice()); return p.length > 1 ? [p] : []; }
    if (tag === 'circle') return [ellipse(a('cx'), a('cy'), a('r'), a('r'), tol)];
    if (tag === 'ellipse') return [ellipse(a('cx'), a('cy'), a('rx'), a('ry'), tol)];
    if (tag === 'rect') { const x = a('x'), y = a('y'), w = a('width'), h = a('height'); let rx = a('rx'), ry = a('ry'); if (!(w > 0 && h > 0)) return [];
      if (!el.hasAttribute('ry')) ry = rx; if (!el.hasAttribute('rx')) rx = ry; rx = Math.min(rx, w / 2); ry = Math.min(ry, h / 2);
      if (rx > 0 && ry > 0) return pathToPolys(`M${x + rx} ${y}H${x + w - rx}A${rx} ${ry} 0 0 1 ${x + w} ${y + ry}V${y + h - ry}A${rx} ${ry} 0 0 1 ${x + w - rx} ${y + h}H${x + rx}A${rx} ${ry} 0 0 1 ${x} ${y + h - ry}V${y + ry}A${rx} ${ry} 0 0 1 ${x + rx} ${y}Z`, tol);
      return [[[x, y], [x + w, y], [x + w, y + h], [x, y + h], [x, y]]]; }
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
      const vb = root.viewBox && root.viewBox.baseVal, tol = Math.max(0.05, ((vb && vb.width) || 1000) / 4000);
      for (const el of els) { const cs = getComputedStyle(el); if (cs.display === 'none' || cs.visibility === 'hidden') continue;
        const fl = cs.fill === 'none' ? 'none' : light(cs.fill), stl = cs.stroke === 'none' ? 'none' : light(cs.stroke), sw = parseFloat(cs.strokeWidth) || 0, stroked = cs.stroke !== 'none' && stl !== 'none' && sw > 0;
        // white background boxes and white filled areas from auto-tracers are not lines - skip them
        if ((!stroked || stl > 0.93) && (fl === 'none' ? !stroked : fl > 0.93)) { info.skippedWhite++; continue; }
        const M = rootInv.multiply(el.getScreenCTM() || el.getCTM());
        for (const p of shapePolys(el, tol)) all.push(p.map(([x, y]) => [M.a * x + M.c * y + M.e, M.b * x + M.d * y + M.f])); info.shapes++; }
      const bb = G.bbox(all); if (!bb) throw new Error('No lines found in that SVG (text and linked symbols are not imported).');
      const k = 1000 / Math.max(bb.w, bb.h, 1e-6), paths = all.map(p => G.rdp(p.map(([x, y]) => [(x - bb.x0) * k, (y - bb.y0) * k]), 0.05)).filter(p => p.length > 1);
      return { paths, w: bb.w * k, h: bb.h * k, info }; }
    finally { host.remove(); } }
  return { importSVG, pathToPolys, shapePolys };
})();
