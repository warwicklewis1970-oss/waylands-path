// Waylands Path - laser output. Same conventions as Wayland Forge: mm, G90/G21, M4 dynamic power, S as % of $30 (default 1000),
// origin 0,0 = bottom-left corner of the design area, every step written in that same frame so all files line up in LaserGRBL.
'use strict';
const LZ = (() => {
  const R3 = v => (Math.round(v * 1000) / 1000).toString(), f2 = v => (Math.round(v * 100) / 100).toString();
  const MODES = [['ltl', 'Line To Line'], ['dith', 'Dithering'], ['vec', 'Vector']], TAG = { ltl: 'LTL', dith: 'DITH', vec: 'VEC' };
  const DEF = { engrave: { mode: 'vec', P: 25, F: 3000, passes: 1 }, cut: { mode: 'vec', P: 100, F: 1000, passes: 3 } };
  // frame: design units -> mm. k = mm per unit. x0/y1 = design-unit left / bottom of the design area.
  function frame(art, cut, widthMm) { const ab = G.bbox(art); if (!ab) return null; const k = widthMm / Math.max(ab.w, 1e-9), all = G.bbox(art.concat(cut || []));
    return { k, x0: all.x0, y0: all.y0, x1: all.x1, y1: all.y1, W: all.w * k, H: all.h * k, artW: ab.w * k, artH: ab.h * k }; }
  const toMmSvg = (fr, p) => p.map(([x, y]) => [(x - fr.x0) * fr.k, (y - fr.y0) * fr.k]); // y down, page top-left
  const toMmG = (fr, p) => p.map(([x, y]) => [(x - fr.x0) * fr.k, (fr.y1 - y) * fr.k]); // y up, bottom-left = 0,0
  function vecG(fr, paths, b, smax, title) { const Smax = Math.round(smax * b.P / 100), W = fr.W, H = fr.H;
    const cx = v => R3(Math.min(W, Math.max(0, v))), cy = v => R3(Math.min(H, Math.max(0, v)));
    const L = [`; Waylands Path ${String(title).replace(/[^\w .-]/g, '').slice(0, 30)}`, `; F${b.F} S${Smax} of ${smax} x${b.passes}`, `; area 0,0 to ${f2(W)},${f2(H)} mm`, 'G90', 'G21', 'M5', 'G0 X0 Y0', 'M4 S0'];
    const polys = G.order(paths.map(p => toMmG(fr, p)).filter(p => p.length > 1)); let first = true;
    for (let k = 0; k < b.passes; k++) { if (b.passes > 1) L.push(`; pass ${k + 1}`);
      for (const pl of polys) { L.push(`G0 X${cx(pl[0][0])} Y${cy(pl[0][1])} S0`);
        for (let i = 1; i < pl.length; i++) { L.push(`G1 X${cx(pl[i][0])} Y${cy(pl[i][1])} S${Smax}${first ? ` F${b.F}` : ''}`); first = false; } } }
    L.push('M5', 'G0 X0 Y0'); return L.join('\n') + '\n'; }
  // raster of the lines (stroked at lineMm) on the same frame, 10 px/mm by default
  function raster(fr, paths, lineMm, pxmm) { const pw = Math.max(1, Math.ceil(fr.W * pxmm)), ph = Math.max(1, Math.ceil(fr.H * pxmm));
    const cv = document.createElement('canvas'); cv.width = pw; cv.height = ph; const c = cv.getContext('2d'); c.fillStyle = '#fff'; c.fillRect(0, 0, pw, ph);
    c.strokeStyle = '#000'; c.lineWidth = Math.max(1, lineMm * pxmm); c.lineCap = c.lineJoin = 'round'; c.beginPath();
    for (const p of paths) { const q = toMmSvg(fr, p); c.moveTo(q[0][0] * pxmm, q[0][1] * pxmm); for (let i = 1; i < q.length; i++) c.lineTo(q[i][0] * pxmm, q[i][1] * pxmm); if (q.length === 1) c.lineTo(q[0][0] * pxmm + 0.01, q[0][1] * pxmm); }
    c.stroke(); return { d: c.getImageData(0, 0, pw, ph).data, pw, ph }; }
  function dither(d, pw, ph) { const g = new Float32Array(pw * ph); for (let i = 0; i < g.length; i++) g[i] = d[i * 4];
    for (let y = 0; y < ph; y++) for (let x = 0; x < pw; x++) { const i = y * pw + x, o = g[i], nv = o < 128 ? 0 : 255, e = o - nv; g[i] = nv;
      if (x + 1 < pw) g[i + 1] += e * 7 / 16; if (y + 1 < ph) { if (x > 0) g[i + pw - 1] += e * 3 / 16; g[i + pw] += e * 5 / 16; if (x + 1 < pw) g[i + pw + 1] += e / 16; } }
    for (let i = 0; i < g.length; i++) d[i * 4] = g[i]; }
  // Line To Line / Dithering G-code: horizontal zig-zag rows from the bottom, G0 over white, like LaserGRBL's own output
  function rasterG(fr, paths, b, smax, title, lineMm, pxmm) { const { d, pw, ph } = raster(fr, paths, lineMm, pxmm); if (b.mode === 'dith') dither(d, pw, ph);
    const mm = 1 / pxmm, Smax = Math.round(smax * b.P / 100), gap = Math.max(2, Math.round(2 / mm)), crisp = b.mode !== 'ltl';
    const S = g => g >= 250 ? 0 : crisp ? Smax : g < 128 ? Smax : Math.round(Smax * (255 - g) / 255);
    const cx = v => R3(Math.min(fr.W, Math.max(0, v))), cy = v => R3(Math.min(fr.H, Math.max(0, v)));
    const L = [`; Waylands Path ${String(title).replace(/[^\w .-]/g, '').slice(0, 30)}`, `; F${b.F} S${Smax} of ${smax} x${b.passes} ${TAG[b.mode]} ${pxmm} lines/mm`, `; area 0,0 to ${f2(fr.W)},${f2(fr.H)} mm`, 'G90', 'G21', 'M5', 'G0 X0 Y0', 'M4 S0'];
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
  const dStr = q => 'M' + q.map(([x, y]) => `${R3(x)} ${R3(y)}`).join('L');
  // SVG in true mm: width/height in mm, viewBox 0 0 W H, so LaserGRBL and Inkscape read it 1:1
  function svg(fr, groups, title) { const W = f2(fr.W), H = f2(fr.H);
    return `<?xml version="1.0" encoding="UTF-8"?>\n<svg xmlns="http://www.w3.org/2000/svg" width="${W}mm" height="${H}mm" viewBox="0 0 ${W} ${H}">\n<title>${esc(title)}</title>\n` +
      groups.map(g => `<g id="${g.id}" fill="none" stroke="${g.color}" stroke-width="${f2(g.width)}" stroke-linecap="round" stroke-linejoin="round">\n${g.paths.map(p => `<path d="${dStr(toMmSvg(fr, p))}"/>`).join('\n')}\n</g>`).join('\n') + '\n</svg>\n'; }
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
  // all files for one export
  function build(o) { const { name, art, cut, widthMm, burn, smax, lineMm, pxmm } = o, fr = frame(art, cut, widthMm); if (!fr) throw new Error('Nothing to export yet - open a picture first.');
    const base = (String(name || 'Waylands Path').replace(/[\\/:*?"<>|]+/g, ' ').replace(/\s+/g, ' ').trim() || 'Waylands Path').slice(0, 40), size = `${Math.round(fr.W)}x${Math.round(fr.H)}mm`;
    const steps = [{ key: 'engrave', label: 'Engrave lines', paths: art }]; if (cut && cut.length) steps.push({ key: 'cut', label: 'Cut outside', paths: cut });
    const files = [];
    steps.forEach((s, i) => { const b = burn[s.key], n = i + 1; s.n = n; s.b = b;
      s.file = `${base} ${n} ${s.label.toLowerCase()} ${tag(b)}.nc`;
      s.data = b.mode === 'vec' ? vecG(fr, s.paths, b, smax, s.label) : rasterG(fr, s.paths, b, smax, s.label, lineMm, pxmm);
      files.push({ name: s.file, data: s.data }); });
    const groups = [{ id: 'engrave-lines', color: '#000000', width: lineMm, paths: art }]; if (cut && cut.length) groups.push({ id: 'cut-outside', color: '#ff0000', width: 0.1, paths: cut });
    const svgAll = svg(fr, groups, `${base} ${size}`), svgName = `${base} artwork ${size}.svg`; files.push({ name: svgName, data: svgAll });
    steps.forEach(s => files.push({ name: `${base} ${s.n} ${s.label.toLowerCase()}.svg`, data: svg(fr, [groups[s.n - 1]], `${base} ${s.label}`) }));
    const readme = readMe(base, fr, steps, smax, svgName); files.unshift({ name: `${base} 0 read me.txt`, data: readme });
    return { fr, steps, files, base, size, svgAll, svgName, zipName: `${base} laser.zip` }; }
  function readMe(base, fr, steps, smax, svgName) { const L = [`WAYLANDS PATH - ${base}`, `Design area: ${f2(fr.W)} x ${f2(fr.H)} mm. Laser 0,0 = bottom-left corner of the design area.`, '',
    'IN LASERGRBL (Windows): unzip first (right-click the zip > Extract All > Extract).', 'Every .nc file lines up by itself - same 0,0, same design area. Nothing to size or offset.', ''];
    steps.forEach(s => { L.push(`STEP ${s.n}: ${s.label.toUpperCase()}`, `  File: ${s.file}`, `  ${({ vec: 'Vector', ltl: 'Line To Line', dith: 'Dithering' })[s.b.mode]}, power ${s.b.P}% (S${Math.round(smax * s.b.P / 100)} of ${smax}), speed ${s.b.F} mm/min, ${s.b.passes} pass${s.b.passes > 1 ? 'es' : ''}.`,
      `  LaserGRBL: File > Open File > pick it > Start. Power and speed are written into the file.`, `  To adjust on the machine, use the S [1.00x] (power) and G1 [1.00x] (speed) buttons in LaserGRBL's bottom bar.`, ''); });
    if (steps.length > 1) L.push('Burn step 1 first, then step 2 (the cut) without moving the material or the laser origin.', '');
    L.push(`Also included: ${svgName} (all lines in mm, cut in red) and one SVG per step, for Inkscape or LaserGRBL's SVG import.`, 'Made with Waylands Path.');
    return L.join('\r\n') + '\r\n'; }
  return { MODES, TAG, DEF, frame, vecG, rasterG, svg, makeZip, crc32, build, tag, toMmSvg, toMmG };
})();
