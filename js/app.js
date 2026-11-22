// Waylands Path v4 - app: open a line drawing or SVG, trace, edit Bezier paths (simple Inkscape-style node tool), laser export, save.
'use strict';
const APP_VERSION = 'v5.10';
const $ = id => document.getElementById(id);
const esc = s => String(s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]);
const f1 = v => (Math.round(v * 10) / 10).toString();
// ---------- state ----------
// v5.2 photo tracing: last-used photo sliders, remembered on this device for every new photo
// v5.3: richer photo defaults (more lines and points) for NEW traces; projects already traced keep their own saved settings and lines
const PHOTO_KEY = 'wp-photo1', PHOTO_DEF = () => ({ detail: 6, smooth: 4, minLen: 3 });
function photoLast() { try { const v = JSON.parse(localStorage.getItem(PHOTO_KEY) || 'null'); if (v && !(v.detail === 5 && v.smooth === 5 && v.minLen === 4)) return Object.assign(PHOTO_DEF(), v); } catch (e) { /* */ } return PHOTO_DEF(); }
const DEFAULTS = () => ({ name: 'Untitled', paths: [], src: null, trace: { detail: 5, corners: 5, mode: 'auto', faint: 4, straighten: true, kind: 'line', photo: photoLast() },
  widthMm: 150, lineMm: 0.3, cutOn: true, cutOff: 0.5, cutTight: 8, gapMm: 1.5, shortMm: 2, showPhoto: false, photoOp: 25, saved: 0, ver: 3, v4: 1, sheet: SHEET0() });
function SHEET0() { return { on: false, W: 200, H: 200, margin: 5, gap: 5, nx: 1, ny: 1, place: 'centre' }; }
let S = DEFAULTS(), srcImg = null, srcEl = null, undoSt = [], redoSt = [], tool = 'move';
const EDIT_TOOLS = ['sel', 'p2p', 'draw', 'brk', 'rub', 'clone', 'edge'];
let editKind = 'etch';
try { const v = localStorage.getItem('wp-editKind'); if (v === 'cut' || v === 'etch') editKind = v; } catch (e) {}
const inLayer = p => !!p && (editKind === 'cut' ? !!p.cut : !p.cut);
let sel = new Set(), act = new Set(), lastTap = null, pen = null, skip = { mode: 'skip', first: -1 }, delMode = 'stretch', lw = 0;
const view = { s: 1, tx: 0, ty: 0 };
const cv = $('stage'), ctx = cv.getContext('2d');
const toast = (msg, ms = 2600) => { const t = $('toast'); t.textContent = msg; t.hidden = false; clearTimeout(toast.h); toast.h = setTimeout(() => { t.hidden = true; }, ms); };
const snap = () => { const p = BZ.clone(S.paths); p._nac = S.noAutoCut || 0; return p; };
function pushUndo() { undoSt.push(snap()); if (undoSt.length > 50) undoSt.shift(); redoSt = []; updUndo(); }
function undo() { if (!undoSt.length) return; const cur = snap(), prev = undoSt.pop(); if (prev._w != null) { cur._w = S.widthMm; S.widthMm = prev._w; syncInputs(); } if (prev._nac != null) { cur._nac = S.noAutoCut || 0; S.noAutoCut = prev._nac; } redoSt.push(cur); S.paths = prev; pen = null; clearSel(); changed(); if (window.T4) T4.reset(); if (window.CN) CN.afterUndo(); }
function redo() { if (!redoSt.length) return; const cur = snap(), nxt = redoSt.pop(); if (nxt._w != null) { cur._w = S.widthMm; S.widthMm = nxt._w; syncInputs(); } if (nxt._nac != null) { cur._nac = S.noAutoCut || 0; S.noAutoCut = nxt._nac; } undoSt.push(cur); S.paths = nxt; pen = null; clearSel(); changed(); if (window.T4) T4.reset(); if (window.CN) CN.afterUndo(); }
function updUndo() { $('undoBtn').disabled = !undoSt.length; $('redoBtn').disabled = !redoSt.length; }
const etch = () => S.paths.filter(p => !p.cut), cuts = () => S.paths.filter(p => p.cut);
const bbAll = () => BZ.bbox(S.paths);
// mm per design unit: Width = the whole design (etch lines + cut line)
const kmm = () => { const b = bbAll(); return b && b.w > 0 ? S.widthMm / b.w : 1; };
function clearSel() { sel.clear(); act.clear(); lastTap = null; skip.first = -1; }
function changed(opts = {}) { if (window.HH) HH.sync(); if (window.TB) TB.sync(); if (!opts.keepSel) { sel.clear(); } else pruneSel(); updSel(); updUndo(); updStats(); draw(); saveSoon(); exSummary(); cutInfo(); }
function pruneSel() { for (const k of [...sel]) { const [pi, j] = k.split(':').map(Number); if (!S.paths[pi] || j >= S.paths[pi].n.length) sel.delete(k); } for (const pi of [...act]) if (!S.paths[pi]) act.delete(pi); }
// ---------- burn settings (per device, like Wayland Forge) ----------
const BURN_KEY = 'wp-burn1';
let BURN = (() => { let sv = null; try { sv = JSON.parse(localStorage.getItem(BURN_KEY) || 'null'); } catch (e) { sv = null; }
  const o = {}; for (const k of ['engrave', 'cut']) o[k] = Object.assign({}, LZ.DEF[k], (sv && sv[k]) || {}); return o; })();
function resetBurn() { for (const k of ['engrave', 'cut']) BURN[k] = Object.assign({}, LZ.DEF[k]); try { localStorage.removeItem(BURN_KEY); } catch (e) { /* */ } lzUI(); toast('Laser steps back to the defaults'); }
const burnOf = k => { const j = BURN[k], d = LZ.DEF[k], P = +j.P, F = +j.F;
  return { mode: LZ.TAG[j.mode] ? j.mode : d.mode, P: P > 0 ? Math.min(100, Math.max(0.1, Math.round(P * 10) / 10)) : d.P, F: F > 0 ? Math.round(F * 10) / 10 : d.F, passes: Math.min(10, Math.max(1, Math.round(+j.passes || 1))), order: j.order === 'pass' ? 'pass' : 'line' }; };
const smax = () => { const v = +$('smax').value; return v > 0 ? v : 1000; };
const STEP_NAME = { engrave: 'Etch lines', cut: 'Cut out' }, lzOpen = new Set();
const cutActive = () => S.cutOn && cuts().length > 0;
function lzUI() { const keys = cutActive() ? ['engrave', 'cut'] : ['engrave'];
  $('lzSteps').innerHTML = keys.map((k, i) => { const b = burnOf(k);
    return `<details class="lzacc" data-acc="${k}"${lzOpen.has(k) ? ' open' : ''}><summary><span class="lzst">Step ${i + 1} – ${STEP_NAME[k]}</span> <span class="lzsum" data-sum="${k}">· ${sumOf(k)}</span></summary><div class="lzcb">
      <label class="full">Mode <select data-bj="${k}" data-bf="mode">${LZ.MODES.map(([v, t]) => `<option value="${v}"${b.mode === v ? ' selected' : ''}>${t}</option>`).join('')}</select></label>
      <label>Power % <input type="number" inputmode="decimal" min="0.1" max="100" step="any" data-bj="${k}" data-bf="P" value="${b.P}"></label>
      <label>Speed <input type="number" inputmode="decimal" min="1" step="any" data-bj="${k}" data-bf="F" value="${b.F}"></label>
      <label>Passes <input type="number" inputmode="numeric" min="1" max="10" step="1" data-bj="${k}" data-bf="passes" value="${b.passes}"></label><div class="lzflag full" data-flag="${k}">${lzFwarn(b.F)}</div>${k === 'cut' ? `
      <label class="full">Pass order <select data-bj="cut" data-bf="order"><option value="line"${b.order !== 'pass' ? ' selected' : ''}>Passes per line (safer)</option><option value="pass"${b.order === 'pass' ? ' selected' : ''}>All lines each pass</option></select></label>` : ''}
      <label class="full"><span class="hint">${k === 'cut' ? 'Vector cuts holes and windows first (deepest first), the outside outline last, so nothing drops out early. Line To Line / Dithering scan row by row instead (no order).' : 'Vector follows each line once, laser off between lines. Line To Line / Dithering scan the lines row by row at the line width.'}</span></label></div></details>`; }).join('');
  exSummary(); }
const sumOf = k => { const b = burnOf(k); return `${LZ.TAG[b.mode]} ${b.P}% ${b.F}${b.passes > 1 || k === 'cut' ? ` ×${b.passes}` : ''}`; }; // same style as Wayland Forge: VEC 25% 3000, VEC 100% 1000 ×3
const lzFwarn = F => F < 100 || F > 20000 ? ' <span class="lzunt">speed outside 100–20000 – check</span>' : '';
$('lzSteps').addEventListener('change', e => { const k = e.target.dataset.bj, f = e.target.dataset.bf; if (!k || !f) return;
  if (f === 'mode' || f === 'order') BURN[k][f] = e.target.value; else { const v = +e.target.value; if (!(v > 0)) { e.target.value = burnOf(k)[f]; return; } BURN[k][f] = v; e.target.value = burnOf(k)[f]; }
  try { localStorage.setItem(BURN_KEY, JSON.stringify(BURN)); } catch (er) { /* */ }
  document.querySelectorAll(`[data-sum="${k}"]`).forEach(x => { x.textContent = '· ' + sumOf(k); }); document.querySelectorAll(`[data-flag="${k}"]`).forEach(x => { x.innerHTML = lzFwarn(burnOf(k).F); }); exSummary(); });
$('lzSteps').addEventListener('toggle', e => { const d = e.target; if (!d.dataset || !d.dataset.acc) return; if (d.open) lzOpen.add(d.dataset.acc); else lzOpen.delete(d.dataset.acc); }, true);
$('burnReset').onclick = resetBurn;
$('smax').value = localStorage.getItem('wp-smax') || 1000; $('smax').addEventListener('change', () => { localStorage.setItem('wp-smax', smax()); exSummary(); if (typeof lzWhat === 'function') lzWhat(); });
// ---------- view / drawing ----------
function resize() { const r = cv.getBoundingClientRect(), d = window.devicePixelRatio || 1; cv.width = Math.max(1, Math.round(r.width * d)); cv.height = Math.max(1, Math.round(r.height * d)); const ik = $('ink'); if (ik) { ik.width = cv.width; ik.height = cv.height; } draw(); }
function fit() { const r = cv.getBoundingClientRect(), pad = 16; let bb = S.src && S.src.w ? { x0: 0, y0: 0, x1: S.src.w, y1: S.src.h } : null; const pb = bbAll();
  if (pb) bb = bb ? { x0: Math.min(bb.x0, pb.x0), y0: Math.min(bb.y0, pb.y0), x1: Math.max(bb.x1, pb.x1), y1: Math.max(bb.y1, pb.y1) } : pb; if (!bb) bb = { x0: 0, y0: 0, x1: 1000, y1: 1000 };
  const w = bb.x1 - bb.x0, h = bb.y1 - bb.y0; view.s = Math.min((r.width - 2 * pad) / Math.max(w, 1), (r.height - 2 * pad - 24) / Math.max(h, 1)); view.tx = (r.width - w * view.s) / 2 - bb.x0 * view.s; view.ty = 24 + (r.height - 24 - h * view.s) / 2 - bb.y0 * view.s; draw(); }
const toU = (x, y) => [(x - view.tx) / view.s, (y - view.ty) / view.s];
let drawQ = false, overlay = null;
function draw() { if (drawQ) return; drawQ = true; requestAnimationFrame(() => { drawQ = false; paint(); }); }
function tracePath(p) { const n = p.n; if (!n.length) return; ctx.moveTo(n[0].x, n[0].y); for (let k = 0; k < BZ.nseg(p); k++) { const s = BZ.seg(p, k); if (s.line) ctx.lineTo(s.b.x, s.b.y); else ctx.bezierCurveTo(s.C[1][0], s.C[1][1], s.C[2][0], s.C[2][1], s.b.x, s.b.y); } if (p.z) ctx.closePath(); }
let paintN = 0;
function paint() { paintN++; const d = window.devicePixelRatio || 1, W = cv.width, H = cv.height; ctx.setTransform(1, 0, 0, 1, 0, 0); ctx.fillStyle = '#f6f2ea'; ctx.fillRect(0, 0, W, H);
  ctx.setTransform(d * view.s, 0, 0, d * view.s, d * view.tx, d * view.ty); const px = 1 / view.s;
  if (S.src && S.src.w) { ctx.fillStyle = '#fff'; ctx.fillRect(0, 0, S.src.w, S.src.h); if (srcEl && S.showPhoto) { ctx.globalAlpha = Math.max(0.05, Math.min(0.8, (S.photoOp == null ? 25 : S.photoOp) / 100)); ctx.drawImage(srcEl, 0, 0, S.src.w, S.src.h); ctx.globalAlpha = 1; }
    ctx.strokeStyle = '#d8d0c2'; ctx.lineWidth = px; ctx.strokeRect(0, 0, S.src.w, S.src.h); }
  ctx.lineCap = ctx.lineJoin = 'round';
  // red edge = the cut line (dashed when cutting is switched off). Colour is on screen only - G-code and export SVG stay the same.
  // When Editing CUT or ETCH, the other layer is faded so you only work on one kind of line.
  const fadeCut = editKind !== 'cut', fadeEtch = editKind === 'cut';
  { const czAll = S.paths.filter(q => q.cut);
    if (czAll.length) { ctx.save(); ctx.lineCap = ctx.lineJoin = 'round'; ctx.globalAlpha = fadeCut ? 0.28 : 1; ctx.strokeStyle = S.cutOn ? 'rgba(224,49,49,0.32)' : 'rgba(224,49,49,0.18)'; ctx.lineWidth = 6.4 * px; ctx.beginPath(); czAll.forEach(tracePath); ctx.stroke();
      ctx.strokeStyle = S.cutOn ? '#e03131' : 'rgba(224,49,49,0.55)'; ctx.lineWidth = 2.3 * px; ctx.setLineDash(S.cutOn ? [] : [8 * px, 6 * px]); ctx.beginPath(); czAll.forEach(tracePath); ctx.stroke(); ctx.setLineDash([]); ctx.restore(); }
    const cz = czAll.filter(q => q.z); if (cz.length && S.cutOn) { ctx.save(); ctx.globalAlpha = fadeCut ? 0.22 : 1; ctx.fillStyle = fadeCut ? 'rgba(224,49,49,0.06)' : 'rgba(224,49,49,0.10)'; ctx.beginPath(); const bb = BZ.bbox(S.paths), m = Math.max(bb.w, bb.h) * 4; ctx.rect(bb.x0 - m, bb.y0 - m, bb.w + 2 * m, bb.h + 2 * m); cz.forEach(tracePath); ctx.fill('evenodd'); ctx.restore(); } }
  { const lg = $('cutLegend'); if (lg) { lg.hidden = !S.paths.length;
      if (EDIT_TOOLS.includes(tool) && editKind === 'cut') lg.innerHTML = '<b class="cut">Editing CUT lines (red)</b> · etch lines are faded and locked';
      else if (EDIT_TOOLS.includes(tool)) lg.innerHTML = '<b class="etch">Editing ETCH lines</b> · <b class="cut">cut lines</b> are faded and locked';
      else lg.innerHTML = '<b class="cut">Red = CUT through</b> · <b class="etch">Black = ETCH</b>'; } }
  ctx.save(); ctx.globalAlpha = fadeEtch ? 0.22 : 1;
  ctx.strokeStyle = fadeEtch ? '#6a6a6a' : '#151515'; ctx.lineWidth = 1.6 * px; ctx.beginPath(); S.paths.forEach(p => { if (!p.cut && (!window.T4 || T4.plain(p))) tracePath(p); }); ctx.stroke(); if (window.T4) T4.paintThick(px);
  ctx.restore();
  // highlighted paths (active in Nodes, first pick in Skip)
  const hi = new Set(act); if (tool === 'skip' && skip.first >= 0) hi.add(skip.first); if (pen && S.paths[pen.pi]) hi.add(pen.pi);
  if (hi.size) { ctx.strokeStyle = tool === 'skip' ? '#e8590c' : '#1971c2'; ctx.lineWidth = 2.4 * px; ctx.beginPath(); for (const pi of hi) if (S.paths[pi]) tracePath(S.paths[pi]); ctx.stroke(); }
  if (tool === 'nodes' || tool === 'pen') paintNodes(px, hi);
  if (window.T2) T2.paint(px);
  if (window.T4) T4.paint(px);
  if (window.HH) HH.paint(px);
  if (window.TB) TB.paint(px);
  if (window.CN) CN.paint(px);
  if (window.TA) TA.paint(px);
  if (overlay && overlay.box) { const [a, b] = overlay.box; ctx.fillStyle = 'rgba(25,113,194,0.08)'; ctx.strokeStyle = '#1971c2'; ctx.lineWidth = px; ctx.setLineDash([5 * px, 4 * px]); ctx.fillRect(Math.min(a[0], b[0]), Math.min(a[1], b[1]), Math.abs(b[0] - a[0]), Math.abs(b[1] - a[1])); ctx.strokeRect(Math.min(a[0], b[0]), Math.min(a[1], b[1]), Math.abs(b[0] - a[0]), Math.abs(b[1] - a[1])); ctx.setLineDash([]); }
  if (overlay && overlay.pt) { ctx.fillStyle = '#e8590c'; ctx.beginPath(); ctx.arc(overlay.pt[0], overlay.pt[1], 5 * px, 0, 7); ctx.fill(); } }
const isSel = (pi, j) => sel.has(pi + ':' + j);
function handleList() { const out = []; for (const k of sel) { const [pi, j] = k.split(':').map(Number), p = S.paths[pi]; if (!p) continue; const n = p.n, nd = n[j]; if (!nd) continue;
    if (nd.i) out.push({ pi, j, side: 'i' }); if (nd.o) out.push({ pi, j, side: 'o' });
    const pj = p.z || j > 0 ? (j - 1 + n.length) % n.length : -1, nj = p.z || j < n.length - 1 ? (j + 1) % n.length : -1;
    if (pj >= 0 && n[pj].o && !isSel(pi, pj)) out.push({ pi, j: pj, side: 'o' }); if (nj >= 0 && n[nj].i && !isSel(pi, nj)) out.push({ pi, j: nj, side: 'i' }); } return out; }
function paintNodes(px, hi) { const r = 4.5 * px;
  for (const h of handleList()) { const nd = S.paths[h.pi].n[h.j], q = nd[h.side]; ctx.strokeStyle = '#1971c2'; ctx.lineWidth = px; ctx.beginPath(); ctx.moveTo(nd.x, nd.y); ctx.lineTo(q[0], q[1]); ctx.stroke();
    ctx.fillStyle = '#fff'; ctx.beginPath(); ctx.arc(q[0], q[1], r * 0.85, 0, 7); ctx.fill(); ctx.stroke(); }
  for (const pi of hi) { const p = S.paths[pi]; if (!p) continue; p.n.forEach((nd, j) => { const s = isSel(pi, j); ctx.fillStyle = s ? '#e8590c' : '#fff'; ctx.strokeStyle = s ? '#a33b00' : '#1d3557'; ctx.lineWidth = 1.3 * px; ctx.beginPath();
      if (nd.s) ctx.arc(nd.x, nd.y, r, 0, 7); else { ctx.rect(nd.x - r * 0.9, nd.y - r * 0.9, r * 1.8, r * 1.8); } ctx.fill(); ctx.stroke(); }); } }
function updStats() { const e = etch(), c = cuts(), b = bbAll(), k = kmm();
  $('stats').textContent = S.paths.length ? `${e.length} etch · ${c.length} cut · ${BZ.countNodes(e)} etch pts${c.length ? ` · ${BZ.countNodes(c)} cut pts` : ''} · ${b ? `${f1(S.widthMm)} × ${f1(b.h * k)} mm` : ''}` : '';
  $('empty').hidden = !!(S.src || S.paths.length); $('heightOut').textContent = b ? f1(b.h * k) + ' mm' : '–';
  $('tidyCount').textContent = S.paths.length ? `${e.length} lines, ${BZ.countNodes(e)} points.` : 'Nothing yet.'; }
// ---------- cut line ----------
function cutStats() { const c = cuts(); let holes = 0; const open = c.filter(p => !p.z).length;
  if (c.length > 1) holes = LZ.cutDepths(c.map(p => BZ.flatten(p, 0.5))).filter(d => d > 0).length;
  return { n: c.length, holes, open }; }
function cutInfo() { const el = $('cutInfo'); if (!el) return; const c = cuts(), st = cutStats();
  el.innerHTML = !c.length ? '<span class="warn">No cut line yet. Tap <b>Make outer cut line</b> below to put one around the lines, or use the <b>Cut out</b> tool on any closed area.</span>' :
    `${c.length > 1 ? `${c.length} cut lines${st.holes ? ` (${st.holes} inside the outline - cut first)` : ''}. ` : 'The red line is the cut. '}${S.cutOn ? 'Cuts burn as their own step after the engraving: holes and windows first, the outside last.' : 'Cutting is switched off - only the engraving is exported.'}${st.open ? ` <span class="warn">${st.open} cut line${st.open > 1 ? 's are' : ' is'} open (the ends don't meet), so ${st.open > 1 ? 'they' : 'it'} won't free a piece.</span>` : ''} Drag cut lines and their points with the <b>Cut out</b> tool.`; lzUI(); }
// cut lines the user made inside the outline (windows, slots): kept when a new outside cut line is made
const holeCount = () => innerCuts().filter(p => p.z).length;
function innerCuts() { const c = cuts(); if (!c.length) return []; const ab = BZ.bbox(etch().concat(c)), A = ab ? ab.w * ab.h : 0, polys = c.map(p => BZ.flatten(p, 0.5));
  const dep = c.length > 1 ? LZ.cutDepths(polys) : [0]; return c.filter((p, i) => { const b = BZ.bbox([p]); return dep[i] > 0 || (b && b.w * b.h < A * 0.25); }); }
const isOuterCut = p => p && p.cut && !p.hole && !p.slot && !innerCuts().includes(p);
const hasOuterCut = () => cuts().some(isOuterCut);
// v5.5: if they delete the outside cut, don't put it back on a retrace or a new auto-cut
function noteCutGone() { if (!hasOuterCut()) S.noAutoCut = 1; }
// Tightness 1-10: how far the outside cut may bridge across pockets (10 = follows every pocket, 1 = smooth outline)
const bridgeMm = () => { const t = Math.max(1, Math.min(10, +S.cutTight || 8)); return Math.round((11 - t) * 0.5 * 100) / 100; };
function makeCut(auto) { if (!auto) S.noAutoCut = 0; const e = etch(); if (!e.length) { toast('No lines to go around yet.'); return; } const keepIn = innerCuts(), outerOld = cuts().filter(p => !keepIn.includes(p)), all = e.concat(outerOld.map(p => p.tabBase ? { n: p.tabBase, z: true } : p), keepIn.filter(p => p.hole)), tabCfg = (outerOld.find(p => p.tabs && p.tabs.xs && p.tabs.xs.length) || {}).tabs, ab = BZ.bbox(all), k = kmm(), offU = S.cutOff / k, brU = bridgeMm() / k, lineU = S.lineMm / k, pad = offU + brU + lineU * 2 + 2 / k;
  const s = 1100 / Math.max(ab.w + 2 * pad, ab.h + 2 * pad), w = Math.ceil((ab.w + 2 * pad) * s) + 2, h = Math.ceil((ab.h + 2 * pad) * s) + 2, ox = ab.x0 - pad, oy = ab.y0 - pad;
  const c = document.createElement('canvas'); c.width = w; c.height = h; const g = c.getContext('2d'); g.fillStyle = '#fff'; g.fillRect(0, 0, w, h); g.strokeStyle = '#000'; g.lineWidth = Math.max(1.5, lineU * s); g.lineCap = g.lineJoin = 'round'; g.beginPath();
  for (const p of all) { const f = BZ.flatten(p, 0.5 / s); g.moveTo((f[0][0] - ox) * s, (f[0][1] - oy) * s); for (let i = 1; i < f.length; i++) g.lineTo((f[i][0] - ox) * s, (f[i][1] - oy) * s); }
  g.stroke(); const id = g.getImageData(0, 0, w, h).data, m = new Uint8Array(w * h); for (let i = 0; i < m.length; i++) m[i] = id[i * 4] < 160 ? 1 : 0;
  const loops = T.outerCut(m, w, h, offU * s, brU * s).map(l => l.map(([x, y]) => [x / s + ox, y / s + oy]));
  if (!loops.length) { toast('Could not make a cut line.'); return; } pushUndo(); S.paths = e.concat(keepIn, loops.map(l => Object.assign(BZ.fromPolyline(l, { closed: true, tol: 0.6 / s, arm: 4 / s, corner: 40 }), { cut: true }))); if (tabCfg) { let big = null, ba = 0; for (const p of S.paths) { if (!p.cut || p.hole || keepIn.includes(p)) continue; const b = BZ.bbox([p]); if (b && b.w * b.h > ba) { ba = b.w * b.h; big = p; } } if (big) big.tabs = JSON.parse(JSON.stringify(tabCfg)); } S.cutOn = true; syncInputs(); changed(); toast(auto ? (S.trace && S.trace.kind === 'photo' ? 'A red cut line was made round the drawing. Don\'t want it cut out? Untick it in Size & cut.' : 'No outside edge was found in the picture, so a red cut line was made round the design.') : 'Outside cut line made - drag it with the Cut out tool to adjust.', auto ? 4500 : 2600); }
// ---------- tracing ----------
// The tracer normally runs in a helper (js/worker.js) so the screen stays smooth. If the helper can't load, says nothing within a few
// seconds, errors, or takes far too long, tracing carries on here on the main screen instead - never "Tracing..." forever.
let worker = null, workerReady = false, wid = 0, traceT = null, readyT = null; const pending = new Map();
const WORKER_READY_MS = 6000, WORKER_JOB_MS = 90000;
function runMain(job) { $('busy').textContent = 'Tracing on this screen (slower)…'; $('busy').hidden = false;
  setTimeout(() => { let r; try { r = T.run(job.img, job.opts); } catch (err) { r = { error: String(err && err.message || err) }; } job.res(r); }, 30); }
function workerFailed(why) { if (!worker && !pending.size) return; try { worker && worker.terminate(); } catch (e) { /* */ } worker = null; workerReady = false; clearTimeout(readyT);
  const jobs = [...pending.values()]; pending.clear(); jobs.forEach(j => clearTimeout(j.t)); toast(`The tracing helper ${why}, so tracing runs on this screen instead (a little slower).`, 5000); jobs.forEach(runMain); }
try { worker = new Worker('js/worker.js');
  worker.onmessage = e => { if (e.data && e.data.ready) { workerReady = true; clearTimeout(readyT); return; } const j = pending.get(e.data.id); if (j) { clearTimeout(j.t); pending.delete(e.data.id); j.res(e.data); } };
  worker.onerror = e => { if (e && e.preventDefault) e.preventDefault(); workerFailed('could not start'); };
  worker.onmessageerror = () => workerFailed('sent back something unreadable');
  readyT = setTimeout(() => { if (!workerReady) workerFailed('did not answer'); }, WORKER_READY_MS); } catch (e) { worker = null; }
function runTrace(img, opts) { return new Promise(res => { const job = { img, opts, res };
  if (worker) { const id = ++wid; job.t = setTimeout(() => { if (pending.has(id)) workerFailed('took too long'); }, WORKER_JOB_MS); pending.set(id, job); worker.postMessage({ id, img, opts }); }
  else runMain(job); }); }
let traceSeq = 0;
async function retrace(record = true) { if (!srcImg) return; const seq = ++traceSeq; $('busy').textContent = 'Tracing…'; $('busy').hidden = false;
  let r; try { r = await runTrace(srcImg, S.trace); } catch (err) { r = { error: String(err && err.message || err) }; } if (seq !== traceSeq) return; $('busy').hidden = true;
  if (r.error) { toast('Tracing failed: ' + r.error, 4000); return; } if (record) pushUndo(); lw = r.lw || 0;
  const keepUC = record ? S.paths.filter(p => p.cut && p.uc).map(p => BZ.clone(p)) : []; S.paths = r.paths; clearSel(); pen = null; if (S.noAutoCut) S.paths = S.paths.filter(p => !p.cut || p.uc || p.hole);
  if (keepUC.length) { for (const k of keepUC) { const kb = BZ.bbox([k]), m = S.paths.findIndex(q => !q.cut && q.z && (b => Math.abs(b.x0 - kb.x0) + Math.abs(b.y0 - kb.y0) + Math.abs(b.x1 - kb.x1) + Math.abs(b.y1 - kb.y1) < 4)(BZ.bbox([q]))); if (m >= 0) S.paths.splice(m, 1); S.paths.push(k); } toast(`Traced again - your ${keepUC.length} cut out${keepUC.length > 1 ? 's were' : ' was'} kept`, 3500); }
  const nc = r.paths.filter(p => p.cut).length;
  if (r.mode === 'photo') $('traceInfo').innerHTML = `Photo: ${r.paths.length} lines, ${r.nodes} points. Fewer lines: lower <b>Detail</b> or raise <b>Ignore small bits</b>. Wobbly: raise <b>Smoothness</b>. Then tidy up with Eraser, Clear space and Draw over the faint photo. No cut line is added for a photo - for a cut-out shape use <b>⬡ Add shape</b> (or Make cut in Size &amp; cut).`; else
  $('traceInfo').innerHTML = `${r.paths.length - nc} lines, ${r.nodes} points, drawn line ≈ ${f1(r.lw)} px wide. ${r.darkBg ? 'Auto: light shapes on a dark background (if that is wrong, tap <b>Dark lines on light paper</b>).' : r.mode === 'light' ? 'Light lines on dark.' : r.mode === 'normal' ? 'Dark lines on light paper.' : 'Auto: dark lines on light paper.'} ${nc ? 'Red cut line found around the design.' : '<span class="warn">No outside edge found.</span>'}${r.solids ? ` ${r.solids} solid dark shape${r.solids > 1 ? 's' : ''} (windows, hinges…) traced round the edge.` : ''}${r.gaps ? ` Closed ${r.gaps} small gap${r.gaps > 1 ? 's' : ''}.` : ''}${r.parts > 1 ? ` <span class="warn">${r.parts - 1} part(s) sit apart from the main design and are outside the cut line.</span>` : ''}`;
  // photos: no automatic cut line (on a busy photo it would cut many small holes) - add a shape or Make cut by choice
  photoBgUI(); changed(); if (!S.noAutoCut && S.trace.kind !== 'photo' && !hasOuterCut() && etch().length) makeCut(true); }
function traceSoon() { clearTimeout(traceT); traceT = setTimeout(() => retrace(true), 160); }
// ---------- opening files ----------
async function openFile(file, kind = 'line') { if (!file) return;
  if (/\.wayland\.json$/i.test(file.name) || (/\.json$/i.test(file.name) && file.type !== 'image/svg+xml')) {
    try { const j = WD.parse(await file.text()); await openWaylandDesign(j); return; }
    catch (err) { if (/\.wayland\.json$/i.test(file.name) || (err && /Not a Wayland/.test(String(err.message||err)))) { toast('Could not open that Wayland design: ' + (err.message || err), 4000); return; } }
  }
  const isSvg = /svg/i.test(file.type) || /\.svg$/i.test(file.name), name = file.name.replace(/\.[^.]+$/, '').slice(0, 40) || 'Untitled';
  try { if (isSvg) { const r = SVGIN.importSVG(await file.text()); startProject(name); S.src = { kind: 'svg', w: r.w, h: r.h }; $('sec-trace').hidden = true; srcImg = null; srcEl = null; S.paths = r.paths; S.cutOn = false;
      const sk = []; if (r.info.skippedWhite) sk.push(`${r.info.skippedWhite} white background shape${r.info.skippedWhite > 1 ? 's' : ''}`); if (r.info.skippedText) sk.push(`${r.info.skippedText} text item(s) (convert text to paths first)`); if (r.info.skippedUse) sk.push(`${r.info.skippedUse} linked symbol(s)`);
      $('srcInfo').innerHTML = `SVG: ${r.paths.length} lines from ${r.info.shapes} shapes, curves kept.${sk.length ? `<br><span class="warn">Skipped ${sk.join(', ')}.</span>` : ''}`;
      syncInputs(); enterApp(); openSec('sec-size', false); closeMenu(); changed(); fit(); toast(`Opened ${r.paths.length} lines from the SVG`); return; }
    const el = await loadImage(file), sc = Math.min(1, 1600 / Math.max(el.width, el.height)), w = Math.max(1, Math.round(el.width * sc)), h = Math.max(1, Math.round(el.height * sc));
    const alphaOk = /png|gif|webp/i.test(file.type), c = document.createElement('canvas'); c.width = w; c.height = h; const g = c.getContext('2d'); if (!alphaOk) { g.fillStyle = '#fff'; g.fillRect(0, 0, w, h); } g.drawImage(el, 0, 0, w, h);
    const url = c.toDataURL(alphaOk ? 'image/png' : 'image/jpeg', 0.92);
    startProject(name); S.trace.kind = kind === 'photo' ? 'photo' : 'line'; if (S.trace.kind === 'photo') { S.trace.photo = photoLast(); S.showPhoto = true; } traceKindUI(); syncInputs();
    S.src = { kind: 'image', w, h, url }; $('sec-trace').hidden = false; await setSource(url); $('srcInfo').textContent = `${file.name} · ${w} × ${h} px.`;
    enterApp(); openSec('sec-trace', false); closeMenu(); fit(); await retrace(false); fit(); }
  catch (e) { console.error(e); toast(e.message || 'Could not open that file.', 4000); } }
function loadImage(file) { return new Promise((res, rej) => { const u = URL.createObjectURL(file), im = new Image(); im.onload = () => res(im); im.onerror = () => rej(new Error('That picture could not be opened. Try a JPG or PNG.')); im.src = u; }); }
function setSource(url) { return new Promise((res, rej) => { const im = new Image(); im.onload = () => { srcEl = im; const c = document.createElement('canvas'); c.width = S.src.w; c.height = S.src.h; const g = c.getContext('2d'); g.drawImage(im, 0, 0, S.src.w, S.src.h);
  const d = g.getImageData(0, 0, S.src.w, S.src.h); srcImg = { data: d.data, w: S.src.w, h: S.src.h }; res(); }; im.onerror = rej; im.src = url; }); }
function startProject(name) { const keep = { widthMm: S.widthMm, lineMm: S.lineMm, cutOff: S.cutOff, cutTight: S.cutTight, gapMm: S.gapMm, shortMm: S.shortMm, showPhoto: S.showPhoto, trace: Object.assign({}, S.trace), sheet: Object.assign(SHEET0(), S.sheet || {}) };
  S = Object.assign(DEFAULTS(), keep, { name, pid: window.PJ ? PJ.newId() : null }); undoSt = []; redoSt = []; clearSel(); pen = null; syncInputs(); uniqueSoon(); }
// v5.1 two projects never share a name in My projects (opening the same picture twice gives "dog 2", "dog 3" ...)
function uniqueSoon() { if (!window.PJ || !PJ.uniqueName) return; const pid = S.pid, n0 = S.name; PJ.uniqueName(n0, pid).then(n => { if (S.pid === pid && S.name === n0 && n !== n0) { S.name = n; syncInputs(); saveSoon(); } }).catch(() => {}); }
['homeFile', 'stageFile', 'panelFile'].forEach(id => $(id).addEventListener('change', e => { const f = e.target.files[0]; e.target.value = ''; openFile(f); }));

async function overlayFile(file, kind = 'line') { if (!file) return; if (!S.paths.length && !S.src) { toast('Open a project first, then add another picture.', 3500); return; }
  try { $('busy').textContent = 'Tracing the new picture…'; $('busy').hidden = false;
    let list;
    if ((/svg/i.test(file.type) || /\.svg$/i.test(file.name)) && kind !== 'photo') { const r = SVGIN.importSVG(await file.text()); list = (r.paths || []).filter(p => !p.cut && !p.hole); }
    else { const el = await loadImage(file), sc = Math.min(1, 2400 / Math.max(el.width, el.height)), w = Math.max(1, Math.round(el.width * sc)), h = Math.max(1, Math.round(el.height * sc));
      const alphaOk = /png|gif|webp/i.test(file.type), c = document.createElement('canvas'); c.width = w; c.height = h; const g = c.getContext('2d'); if (!alphaOk) { g.fillStyle = '#fff'; g.fillRect(0, 0, w, h); } g.drawImage(el, 0, 0, w, h);
      const d = g.getImageData(0, 0, w, h), img = { data: d.data, w, h }, opts = Object.assign({}, S.trace, { kind: kind === 'photo' ? 'photo' : 'line' });
      if (opts.kind === 'photo') opts.photo = Object.assign({}, photoLast(), S.trace.photo || {});
      const r = await runTrace(img, opts); if (r.error) throw new Error(r.error); list = (r.paths || []).filter(p => !p.cut && !p.hole); }
    $('busy').hidden = true; if (!list || !list.length) { toast('No lines found in that picture.'); return; }
    const src = BZ.bbox(list), dest = BZ.bbox(S.paths.filter(p => !p.hole && !p.slot)); if (!src || src.w < 1e-6) { toast('No lines found in that picture.'); return; }
    const want = dest ? dest.w * 0.5 : 80 / kmm(), sc2 = want / src.w, cx = (src.x0 + src.x1) / 2, cy = (src.y0 + src.y1) / 2, tx = dest ? (dest.x0 + dest.x1) / 2 : 0, ty = dest ? (dest.y0 + dest.y1) / 2 : 0;
    const xfpt = (x, y) => [tx + (x - cx) * sc2, ty + (y - cy) * sc2];
    const xfNode = nd => { const q = xfpt(nd.x, nd.y), o = Object.assign({}, nd, { x: q[0], y: q[1] }); if (nd.i) { const a = xfpt(nd.i[0], nd.i[1]); o.i = a; } if (nd.o) { const a = xfpt(nd.o[0], nd.o[1]); o.o = a; } return o; };
    list = list.map(p => { const q = Object.assign(BZ.clone(p), { n: p.n.map(xfNode) }); delete q.cut; delete q.uc; delete q.tabs; delete q.tabBase; delete q._tsig; delete q.hole; delete q.slot; return q; });
    const clip = $('ovClip') && $('ovClip').checked, E = window.TB && TB.outer && TB.outer();
    if (clip && E && window.CN && CN.trimPath) { const poly = BZ.flatten(E, 0.35), lp = BZ.fromPoints(poly, true), pb = CN.pbox(poly), kept = [];
      for (const p of list) { if (!CN.touches(p, poly, lp, pb)) continue; kept.push(...CN.trimPath(p, poly, lp)); } list = kept; if (!list.length) { toast('None of the new lines sit inside the outside cut.'); return; } }
    pushUndo(); const gid = 'ov' + Date.now().toString(36);
    for (const q of list) { q.xf = { g: gid, o: BZ.clone(q.n), b: BZ.clone(q.n), sx: 1, sy: 1, r: 0, dx: 0, dy: 0, copy: true }; S.paths.push(q); }
    closeMenu(); if (typeof setTool === 'function') setTool('clone'); if (window.CN && CN.choose) CN.choose(list, true);
    toast(`Added ${list.length} line${list.length > 1 ? 's' : ''} from the new picture. Move, size, turn or flip, then ✓ Done. Undo takes it off.`, 4500); }
  catch (e) { $('busy').hidden = true; console.error(e); toast(e.message || 'Could not add that picture.', 4000); } }

['homePhoto', 'panelPhoto'].forEach(id => { const el = $(id); if (el) el.addEventListener('change', e => { const f = e.target.files[0]; e.target.value = ''; openFile(f, 'photo'); }); });
['overlayLine'].forEach(id => { const el = $(id); if (el) el.addEventListener('change', e => { const f = e.target.files[0]; e.target.value = ''; overlayFile(f, 'line'); }); });
['overlayPhoto'].forEach(id => { const el = $(id); if (el) el.addEventListener('change', e => { const f = e.target.files[0]; e.target.value = ''; overlayFile(f, 'photo'); }); });
// ---------- inputs ----------
function syncInputs() { $('nameBtn').textContent = (S.name || 'Untitled') + ' ✎'; $('detail').value = S.trace.detail; $('detailOut').textContent = S.trace.detail; $('corners').value = S.trace.corners; $('cornersOut').textContent = S.trace.corners;
  traceModeUI(); traceKindUI(); photoBgUI(); $('faint').value = S.trace.faint == null ? 4 : S.trace.faint; $('faintOut').textContent = $('faint').value; sheetUI(); $('straighten').checked = S.trace.straighten !== false; $('showPhoto').checked = S.showPhoto; $('widthMm').value = S.widthMm; $('lineMm').value = S.lineMm;
  $('cutOn').checked = S.cutOn; $('cutOff').value = S.cutOff; $('cutTight').value = S.cutTight || 8; $('cutTightOut').textContent = S.cutTight || 8; $('gapMm').value = S.gapMm; $('shortMm').value = S.shortMm; $('sec-trace').hidden = !(S.src && S.src.kind === 'image'); lzUI(); cutInfo(); }
$('detail').addEventListener('input', e => { S.trace.detail = +e.target.value; $('detailOut').textContent = S.trace.detail; traceSoon(); });
$('corners').addEventListener('input', e => { S.trace.corners = +e.target.value; $('cornersOut').textContent = S.trace.corners; traceSoon(); });
function traceModeUI() { const m = S.trace.mode || (S.trace.invert ? 'light' : 'auto'); document.querySelectorAll('[data-tmode]').forEach(b => b.classList.toggle('on', b.dataset.tmode === m)); }
document.querySelectorAll('[data-tmode]').forEach(b => b.onclick = () => { S.trace.mode = b.dataset.tmode; delete S.trace.invert; traceModeUI(); traceSoon(); });
// v5.2 picture type (line drawing / photo) + photo sliders. Line-art settings are kept as they were when switching.
const PH_IDS = { detail: 'phDetail', smooth: 'phSmooth', minLen: 'phMin' };
function traceKindUI() { const k = S.trace.kind === 'photo' ? 'photo' : 'line'; document.querySelectorAll('[data-tkind]').forEach(b => b.classList.toggle('on', b.dataset.tkind === k));
  if ($('lineCtl')) $('lineCtl').hidden = k === 'photo'; if ($('photoCtl')) $('photoCtl').hidden = k !== 'photo';
  const ph = S.trace.photo || (S.trace.photo = photoLast()); for (const [key, id] of Object.entries(PH_IDS)) { if ($(id)) { $(id).value = ph[key]; $(id + 'Out').textContent = ph[key]; } } }
document.querySelectorAll('[data-tkind]').forEach(b => b.onclick = () => { if ((S.trace.kind || 'line') === b.dataset.tkind) return; S.trace.kind = b.dataset.tkind; if (S.trace.kind === 'photo') { S.trace.photo = S.trace.photo || photoLast(); if (!S.showPhoto) { S.showPhoto = true; photoBgUI(); draw(); } } traceKindUI(); traceSoon(); });
for (const [key, id] of Object.entries(PH_IDS)) { const el = $(id); if (!el) continue; el.addEventListener('input', () => { const ph = S.trace.photo || (S.trace.photo = photoLast()); ph[key] = +el.value; $(id + 'Out').textContent = el.value; try { localStorage.setItem(PHOTO_KEY, JSON.stringify(ph)); } catch (e) { /* */ } traceSoon(); }); }
if ($('phReset')) $('phReset').onclick = () => { S.trace.photo = PHOTO_DEF(); try { localStorage.setItem(PHOTO_KEY, JSON.stringify(S.trace.photo)); } catch (e) { /* */ } traceKindUI(); traceSoon(); toast('Photo settings back to their defaults'); };
// faint photo behind the lines: screen only, never in the laser files
function photoBgUI() { const has = !!(S.src && S.src.kind === 'image'); if ($('showPhoto')) $('showPhoto').checked = !!S.showPhoto; if ($('photoOp')) { $('photoOp').value = S.photoOp == null ? 25 : S.photoOp; $('photoOpOut').textContent = $('photoOp').value + '%'; $('photoOp').disabled = !S.showPhoto; }
  const fb = $('bgBtn'); if (fb) { fb.hidden = !has; fb.classList.toggle('on', !!S.showPhoto); fb.setAttribute('aria-pressed', String(!!S.showPhoto)); } }
if ($('photoOp')) $('photoOp').addEventListener('input', e => { S.photoOp = +e.target.value; photoBgUI(); draw(); saveSoon(); });
if ($('bgBtn')) $('bgBtn').onclick = () => { S.showPhoto = !S.showPhoto; photoBgUI(); draw(); saveSoon(); toast(S.showPhoto ? 'Faint photo on (screen only - never burnt)' : 'Faint photo off'); };
$('faint').addEventListener('input', e => { S.trace.faint = +e.target.value; $('faintOut').textContent = S.trace.faint; traceSoon(); });
$('straighten').addEventListener('change', e => { S.trace.straighten = e.target.checked; traceSoon(); });
$('retraceBtn').onclick = () => retrace(true);
$('showPhoto').addEventListener('change', e => { S.showPhoto = e.target.checked; photoBgUI(); draw(); saveSoon(); });
const numIn = (id, key, lo, hi, after) => $(id).addEventListener('change', e => { const v = +e.target.value; if (!(v >= lo && v <= hi)) { e.target.value = S[key]; toast(`Use a number from ${lo} to ${hi}`); return; } S[key] = v; if (after) after(); saveSoon(); });
numIn('widthMm', 'widthMm', 5, 2000, () => { updStats(); exSummary(); }); numIn('lineMm', 'lineMm', 0.05, 5, exSummary); numIn('cutOff', 'cutOff', 0, 50); $('cutTight').addEventListener('input', e => { S.cutTight = +e.target.value; $('cutTightOut').textContent = S.cutTight; saveSoon(); }); numIn('gapMm', 'gapMm', 0.1, 20); numIn('shortMm', 'shortMm', 0.1, 100);
$('cutOn').addEventListener('change', e => { S.cutOn = e.target.checked; cutInfo(); draw(); saveSoon(); exSummary(); });
$('makeCutBtn').onclick = makeCut;
$('nameBtn').onclick = async () => { const n = prompt('Project name (used in the file names)', S.name); if (n && n.trim()) { let v = n.trim().slice(0, 40); if (window.PJ && PJ.uniqueName) { const u = await PJ.uniqueName(v, S.pid); if (u !== v) toast(`"${v}" is already a project, so this one is "${u}"`, 3500); v = u; } S.name = v; syncInputs(); saveSoon(); } };
function openSec(id, show = true) { if (show) openMenu(); document.querySelectorAll('#panel details[name=acc]').forEach(d => { d.open = d.id === id; }); }
// ☰ Menu: everything that is not a drawing tool lives in a sheet that is closed by default
function openMenu(id) { document.body.classList.add('menuOpen'); if (id) { document.querySelectorAll('#panel details[name=acc]').forEach(d => { d.open = d.id === id; }); const el = $(id); if (el) setTimeout(() => el.scrollIntoView({ block: 'start' }), 30); } }
function closeMenu() { document.body.classList.remove('menuOpen'); }
$('menuBtn').onclick = () => document.body.classList.contains('menuOpen') ? closeMenu() : openMenu(); $('menuClose').onclick = closeMenu; $('menuBack').onclick = closeMenu;
$('addShape').onclick = () => { closeMenu(); setTool('shapes'); };
// ---------- geometry helpers on the whole drawing ----------
const pkey = (pi, j) => pi + ':' + j, unkey = k => k.split(':').map(Number);
const same = (a, b) => Math.abs(a.x - b.x) < 1e-3 && Math.abs(a.y - b.y) < 1e-3;
function linked(pi, j) { const nd = S.paths[pi].n[j], cut = !!S.paths[pi].cut, out = []; S.paths.forEach((p, qi) => { if (!!p.cut !== cut) return; p.n.forEach((m, k) => { if ((qi !== pi || k !== j) && same(m, nd)) out.push(m); }); }); return out; }
const isEnd = (p, j) => !p.z && (j === 0 || j === p.n.length - 1);
function hitNode(u, tolU, only) { let best = null, bd = tolU; const list = only ? [...only] : S.paths.map((_, i) => i);
  for (const pi of list) { const p = S.paths[pi]; if (!p || (!only && !inLayer(p))) continue; p.n.forEach((nd, j) => { const d = Math.hypot(nd.x - u[0], nd.y - u[1]); if (d < bd) { bd = d; best = { pi, j }; } }); } return best; }
function hitHandle(u, tolU) { let best = null, bd = tolU; for (const h of handleList()) { const q = S.paths[h.pi].n[h.j][h.side], d = Math.hypot(q[0] - u[0], q[1] - u[1]); if (d < bd) { bd = d; best = h; } } return best; }
function hitPath(u, tolU, skipIdx = -1) { return hitPathF(u, tolU, skipIdx, inLayer); }
function hitPathF(u, tolU, skipIdx, filt) { let best = null; S.paths.forEach((p, pi) => { if (pi === skipIdx || !p.n.length || !filt(p)) return; const bb = BZ.bbox([p]); if (!bb || u[0] < bb.x0 - tolU || u[0] > bb.x1 + tolU || u[1] < bb.y0 - tolU || u[1] > bb.y1 + tolU) return;
    const r = BZ.nearest(p, u, Math.max(0.2, tolU / 6)); if (r && r.d <= tolU && (!best || r.d < best.d)) best = Object.assign(r, { pi }); }); return best; }
const tolPx = e => (e && e.pointerType === 'mouse' ? 9 : 16) / view.s;
// merge in-line straight pieces, but never remove a point where another line meets this one
function safeMerge(p) { for (const nd of p.n) { if (S.paths.some(q => q !== p && q.n.some(m => same(m, nd)))) nd.keep = true; } BZ.mergeCollinear(p, 1.5); for (const nd of p.n) delete nd.keep; return p; }
function dedupe(p) { for (let j = p.n.length - 1; j > 0; j--) { const a = p.n[j - 1], b = p.n[j]; if (Math.hypot(a.x - b.x, a.y - b.y) < 0.05) { a.o = b.o; p.n.splice(j, 1); } } return p; }
function replacePath(pi, list) { S.paths.splice(pi, 1, ...list.map(dedupe).filter(p => p.n.length > 1 || (p.z && p.n.length > 0))); }
// segment indices on path pi whose both ends are selected
function selSegs(pi) { const p = S.paths[pi], out = []; for (let k = 0; k < BZ.nseg(p); k++) if (isSel(pi, k) && isSel(pi, (k + 1) % p.n.length)) out.push(k); return out; }
function selByPath() { const m = new Map(); for (const k of sel) { const [pi, j] = unkey(k); if (!S.paths[pi]) continue; if (!m.has(pi)) m.set(pi, []); m.get(pi).push(j); } return m; }
// ---------- node tool actions ----------
function needSel(n = 1) { if (sel.size >= n) return true; toast(n > 1 ? 'Pick two points first (drag a box round them, or tap one then the other)' : 'Tap a point first (tap a line to show its points)'); return false; }
function nodeType(smooth) { if (!needSel()) return; pushUndo(); for (const [pi, js] of selByPath()) for (const j of js) BZ.setSmooth(S.paths[pi], j, smooth); changed({ keepSel: true }); }
function segsForAction() { const out = []; for (const pi of selByPath().keys()) for (const k of selSegs(pi)) out.push([pi, k]);
  if (!out.length) for (const [pi, js] of selByPath()) { const p = S.paths[pi]; for (const j of js) { if (p.z || j > 0) out.push([pi, (j - 1 + p.n.length) % p.n.length]); if (p.z || j < p.n.length - 1) out.push([pi, j]); } }
  if (!out.length && lastTap && S.paths[lastTap.pi]) out.push([lastTap.pi, lastTap.k]); return out; }
function segType(line) { const segs = segsForAction(); if (!segs.length) { toast('Tap a line or pick its points first'); return; } pushUndo(); for (const [pi, k] of segs) { if (line) BZ.makeLine(S.paths[pi], k); else BZ.makeCurve(S.paths[pi], k); } changed({ keepSel: true }); }
function addNode() { let segs = []; for (const pi of selByPath().keys()) for (const k of selSegs(pi)) segs.push([pi, k, 0.5]);
  if (!segs.length && lastTap && S.paths[lastTap.pi]) segs = [[lastTap.pi, lastTap.k, lastTap.t]]; if (!segs.length) { toast('Double-tap a line to add a point there, or pick two neighbouring points'); return; }
  pushUndo(); segs.sort((a, b) => b[0] - a[0] || b[1] - a[1]); sel.clear(); for (const [pi, k, t] of segs) { const j = BZ.insertNode(S.paths[pi], k, t); sel.add(pkey(pi, j)); act.add(pi); } lastTap = null; changed({ keepSel: true }); }
function delNodes() { if (!needSel()) return; pushUndo(); const m = selByPath(), order = [...m.keys()].sort((a, b) => b - a);
  for (const pi of order) { const p = S.paths[pi], js = m.get(pi).sort((a, b) => b - a); for (const j of js) { if (!BZ.deleteNode(p, j)) { p.n.splice(j, 1); } } if (p.n.length < 2) S.paths.splice(pi, 1); }
  sel.clear(); changed(); }
// split a path at a set of node indices (Break)
function splitAtNodes(p, J) { const n = p.n, m = n.length; let order = [...new Set(J)].sort((a, b) => a - b); let nodes, cuts;
  if (p.z) { const r = order[0]; nodes = n.slice(r).concat(n.slice(0, r)); nodes.push(n[r]); cuts = order.map(j => (j - r + m) % m).concat([m]); cuts = [...new Set(cuts)].sort((a, b) => a - b); cuts.unshift(0); }
  else { nodes = n; cuts = [0].concat(order.filter(j => j > 0 && j < m - 1), [m - 1]); }
  const out = []; for (let i = 0; i < cuts.length - 1; i++) { if (cuts[i + 1] <= cuts[i]) continue; const piece = BZ.clone(nodes.slice(cuts[i], cuts[i + 1] + 1)); piece[0].i = null; piece[piece.length - 1].o = null; piece[0].s = piece[piece.length - 1].s = 0; out.push(Object.assign({}, p, { n: piece, z: false })); }
  return out.length ? out : [p]; }
// remove a set of segments from a path, keeping the rest as separate lines
function keepSegs(p, del) { const m = BZ.nseg(p), out = []; if (!del.size) return [p]; let start = 0;
  if (p.z) { const first = [...del].sort((a, b) => a - b)[0]; start = (first + 1) % m; }
  let run = null; for (let c = 0; c < m; c++) { const k = (start + c) % m; if (del.has(k)) { if (run) out.push(run); run = null; continue; } if (!run) run = [k, k]; else run[1] = k; } if (run) out.push(run);
  return out.map(([a, bk]) => { const nodes = []; const cnt = (bk - a + m) % m + 1; for (let c = 0; c <= cnt; c++) nodes.push(BZ.clone(p.n[(a + c) % p.n.length])); nodes[0].i = null; nodes[nodes.length - 1].o = null; return Object.assign({}, p, { n: nodes, z: false }); }); }
function breakNodes() { if (!needSel()) return; const m = selByPath(); let n = 0; const order = [...m.keys()].sort((a, b) => b - a);
  const todo = order.filter(pi => { const p = S.paths[pi]; return p.z || m.get(pi).some(j => j > 0 && j < p.n.length - 1); }); if (!todo.length) { toast('Pick a point in the middle of a line to break it'); return; }
  pushUndo(); for (const pi of todo) { const r = splitAtNodes(S.paths[pi], m.get(pi)); n += r.length; replacePath(pi, r); }
  clearSel(); changed(); toast('Line broken - drag an end away, or Join it again'); }
function endDirOf(pi, j) { const p = S.paths[pi], nd = p.n[j], nb = j === 0 ? p.n[1] : p.n[p.n.length - 2], h = j === 0 ? nd.o : nd.i, b = h || [nb.x, nb.y];
  const dx = nd.x - b[0], dy = nd.y - b[1], L = Math.hypot(dx, dy) || 1; return [dx / L, dy / L]; }
function joinNodes() { let ends = [...sel].map(unkey).filter(([pi, j]) => S.paths[pi] && isEnd(S.paths[pi], j));
  if (ends.length > 2) { // several ends picked (e.g. at a junction): join the two that run straightest into each other
    let best = null; for (let a = 0; a < ends.length; a++) for (let b = a + 1; b < ends.length; b++) { if (ends[a][0] === ends[b][0]) continue;
      const da = endDirOf(...ends[a]), db = endDirOf(...ends[b]), sc = da[0] * db[0] + da[1] * db[1]; if (!best || sc < best.sc) best = { sc, a, b }; }
    if (best) ends = [ends[best.a], ends[best.b]]; }
  if (ends.length === 2) { const [[pa, ja], [pb, jb]] = ends, A = S.paths[pa], B = S.paths[pb], ea = ja === 0 ? 0 : 1, eb = jb === 0 ? 0 : 1; pushUndo();
    const mergeTol = 4 / view.s, r = BZ.join(A, ea, B, eb, mergeTol); if (pa === pb) S.paths[pa] = r[0]; else { const keep = Math.min(pa, pb), gone = Math.max(pa, pb); S.paths[keep] = r[0]; S.paths.splice(gone, 1); }
    clearSel(); changed(); toast('Joined'); return; }
  if (ends.length === 1) { extendEnd(ends[0][0], ends[0][1]); return; }
  toast('Pick two loose ends to join them, or one end to run it on to the nearest line'); }
// run a loose end straight on until it meets a line, and stop exactly on it
function extendEnd(pi, j, quiet) { const p = S.paths[pi], nd = p.n[j], nb = j === 0 ? p.n[1] : p.n[p.n.length - 2], h = j === 0 ? nd.o : nd.i;
  const from = [nd.x, nd.y], back = h ? h : [nb.x, nb.y]; let dx = from[0] - back[0], dy = from[1] - back[1]; const L = Math.hypot(dx, dy) || 1; dx /= L; dy /= L;
  const reach = Math.max(S.gapMm / kmm() * 4, 40 / view.s), to = [from[0] + dx * reach, from[1] + dy * reach]; let best = null;
  S.paths.forEach((q, qi) => { for (const c of BZ.crossings(q, from, to)) { if (c.u * reach < 0.5) continue; if (qi === pi) { const s = BZ.seg(q, c.k); if ((j === 0 && c.k === 0) || (j !== 0 && c.k === BZ.nseg(q) - 1)) continue; void s; } if (!best || c.u < best.u) best = Object.assign({ qi }, c); } });
  if (!best) { if (!quiet) toast('No line straight ahead to meet'); return false; }
  if (!quiet) pushUndo(); const q = S.paths[best.qi]; let tgt = best.pt;
  if (best.t > 0.02 && best.t < 0.98) { const jj = BZ.insertNode(q, best.k, best.t); tgt = [q.n[jj].x, q.n[jj].y]; if (best.qi === pi && jj <= j) j++; }
  else { const s = BZ.seg(q, best.k), e2 = best.t <= 0.02 ? s.a : s.b; tgt = [e2.x, e2.y]; }
  const P2 = S.paths[pi]; if (j === 0) { P2.n[0].i = null; P2.n.unshift(BZ.node(tgt[0], tgt[1])); } else { P2.n[P2.n.length - 1].o = null; P2.n.push(BZ.node(tgt[0], tgt[1])); }
  safeMerge(P2); if (!quiet) { clearSel(); changed(); toast('Line runs on and stops exactly on the next line'); } return true; }
function delSegs() { let segs = []; for (const pi of selByPath().keys()) for (const k of selSegs(pi)) segs.push([pi, k]);
  if (!segs.length && lastTap && S.paths[lastTap.pi]) segs = [[lastTap.pi, lastTap.k]]; if (!segs.length) { toast('Pick the two points at the ends of the piece to remove, or tap the line first'); return; }
  pushUndo(); const by = new Map(); for (const [pi, k] of segs) { if (!by.has(pi)) by.set(pi, new Set()); by.get(pi).add(k); }
  for (const pi of [...by.keys()].sort((a, b) => b - a)) replacePath(pi, keepSegs(S.paths[pi], by.get(pi)));
  clearSel(); changed(); }
function nudge(dxmm, dymm) { if (!needSel()) return; const k = kmm(), dx = dxmm / k, dy = dymm / k; pushUndo(); const moved = new Set();
  for (const key of sel) { const [pi, j] = unkey(key), nd = S.paths[pi].n[j]; for (const m of [nd].concat(linked(pi, j))) if (!moved.has(m)) { moved.add(m); BZ.moveNode(m, dx, dy); } } changed({ keepSel: true }); }
function straighten() { const segs = segsForAction(); if (!segs.length) { toast('Pick the points of the piece to straighten'); return; } pushUndo();
  for (const [pi, k] of segs) { const p = S.paths[pi]; BZ.makeLine(p, k); const s = BZ.seg(p, k), dx = s.b.x - s.a.x, dy = s.b.y - s.a.y;
    const lvl = Math.abs(dy) < Math.abs(dx) * 0.14, up = Math.abs(dx) < Math.abs(dy) * 0.14; if (!lvl && !up) continue;
    const j2 = (k + 1) % p.n.length, grp = [s.b].concat(linked(pi, j2)); const mv = lvl ? [0, s.a.y - s.b.y] : [s.a.x - s.b.x, 0]; for (const m of grp) BZ.moveNode(m, mv[0], mv[1]); }
  changed({ keepSel: true }); toast('Straightened'); }
// any line(s) -> cut (red, own laser step) or back to etch
function pickedLines() { const s = new Set(act); for (const k of sel) s.add(+k.split(':')[0]); return [...s].filter(pi => S.paths[pi]); }
function setPathsKind(pis, toCut) { if (!pis.length) { toast('Tap a line first, then tap CUT'); return; }
  if (window.T4 && T4.applySelKind) { T4.SL.list = pis.slice(); T4.applySelKind(!!toCut); if (tool !== 'sel') { T4.SL.list = []; T4.SL.merged = null; T4.SL.pendingCut = null; } updKindSegs(); return; }
  const wasOuter = !toCut && pis.some(pi => { const p = S.paths[pi]; return p && p.cut && !p.hole && p.uc !== 1; }); pushUndo();
  for (const pi of pis) { const p = S.paths[pi]; if (!p) continue; if (toCut) { p.cut = true; p.uc = 1; delete p.w; delete p.dbl; } else { delete p.cut; delete p.uc; delete p.tabs; delete p.tabBase; delete p._tsig; if (p.slot) delete p.slot; } }
  if (toCut) { S.cutOn = true; if (typeof syncInputs === 'function') syncInputs(); } if (wasOuter) noteCutGone(); changed({ keepSel: true }); updKindSegs();
  toast(toCut ? 'Now a cut line (red)' : 'Now an etch line again', 2800); }
function toggleCut() { const pis = pickedLines(); if (!pis.length) { toast('Tap a line first (or drag a box round several), then tap CUT'); return; }
  setPathsKind(pis, pis.some(pi => !S.paths[pi].cut)); }
function updKindSegs() { const pis = pickedLines(), allCut = pis.length && pis.every(pi => S.paths[pi] && S.paths[pi].cut);
  const nk = $('nKind'); if (nk) { if (!pis.length) nk.setAttribute('data-dim', '1'); else nk.removeAttribute('data-dim'); nk.querySelectorAll('button').forEach(b => b.classList.toggle('on', (b.dataset.kind === 'cut') === !!allCut)); } }
function updCutBtn() { updKindSegs(); const b = $('nCut'); if (!b) return; const pis = pickedLines(), allCut = pis.length && pis.every(pi => S.paths[pi].cut);
  const lab = $('nCutL'); if (lab) lab.textContent = allCut ? 'Make etch' : 'Make cut'; b.classList.toggle('iscut', !!allCut); b.classList.toggle('dim', !pis.length); }
function selectLine() { const pis = act.size ? [...act] : [...selByPath().keys()]; if (!pis.length) { toast('Tap a line first'); return; } for (const pi of pis) S.paths[pi].n.forEach((_, j) => sel.add(pkey(pi, j))); updSel(); draw(); }
function updSel() { const n = sel.size; $('selInfo').textContent = n ? `${n} point${n > 1 ? 's' : ''} picked` : act.size ? 'Line picked - tap a point, or drag a box round several' : 'Tap a line to show its points';
  document.querySelectorAll('[data-needsel]').forEach(b => { b.classList.toggle('dim', !n && !lastTap); }); updCutBtn(); }
// ---------- Delete tool: tap a line, it goes up to the junctions either side ----------
function isJunction(pi, j) { return linked(pi, j).length > 0; }
function deleteStretch(h) { const p = S.paths[h.pi], m = BZ.nseg(p); if (delMode === 'whole') { pushUndo(); const wasOuter = p && p.cut && !p.hole; S.paths.splice(h.pi, 1); clearSel(); if (wasOuter) noteCutGone(); changed(); toast('Line deleted'); return; }
  const del = new Set([h.k]); let a = h.k; while (true) { if (!p.z && a === 0) break; if (isJunction(h.pi, a)) break; const pk = (a - 1 + m) % m; if (del.has(pk)) break; del.add(pk); a = pk; }
  let b = h.k; while (true) { const nj = (b + 1) % p.n.length; if (!p.z && nj === p.n.length - 1) break; if (isJunction(h.pi, nj)) break; const nk = (b + 1) % m; if (del.has(nk)) break; del.add(nk); b = nk; }
  pushUndo(); const wasOuter = p && p.cut && !p.hole; replacePath(h.pi, keepSegs(p, del)); clearSel(); if (wasOuter) noteCutGone(); changed(); toast('Removed up to the junctions - Undo brings it back'); }
// ---------- Skip over / Continue across ----------
function skipOver(li, oi, tapU) { const L = S.paths[li], O = S.paths[oi]; const cs = BZ.pathCrossings(L, O); if (cs.length < 2) { toast('That line does not pass through the shape you tapped'); return false; }
  const poly = O.z ? BZ.flatten(O, 0.3) : null; let best = null;
  for (let i = 0; i < cs.length - 1; i++) { const a = cs[i], b = cs[i + 1], mid = BZ.locate(L, (a.s + b.s) / 2), mp = BZ.pointAt(L, mid.k, mid.t);
    const inside = poly ? BZ.inside(poly, mp) : true, d = Math.hypot(mp[0] - tapU[0], mp[1] - tapU[1]) * (inside ? 1 : 50); if (!best || d < best.d) best = { a, b, d }; }
  if (L.z && cs.length >= 2) { /* closed line: cut the arc inside the shape */ }
  pushUndo(); const r = BZ.cutOut(L, best.a.k, best.a.t, best.b.k, best.b.t); replacePath(li, r); return true; }
function continueAcross(ai, bi) { if (ai === bi) { toast('Tap the other piece of the line'); return false; } const A = S.paths[ai], B = S.paths[bi];
  if (A.z || B.z) { toast('Pick two open line pieces'); return false; }
  const ends = []; for (const ea of [0, 1]) for (const eb of [0, 1]) { const na = ea ? A.n[A.n.length - 1] : A.n[0], nb = eb ? B.n[B.n.length - 1] : B.n[0]; ends.push({ ea, eb, d: Math.hypot(na.x - nb.x, na.y - nb.y) }); }
  ends.sort((x, y) => x.d - y.d); const { ea, eb } = ends[0]; pushUndo();
  const a2 = BZ.clone(A), b2 = BZ.clone(B); if (ea === 0) BZ.reverse(a2); if (eb === 1) BZ.reverse(b2); // a2 ends at the gap, b2 starts at it
  const aEnd = a2.n[a2.n.length - 1], aPrev = a2.n[a2.n.length - 2], bSt = b2.n[0], bNext = b2.n[1];
  // straight pieces that are nearly in line become exactly in line (the gap ends move onto the line through the far ends)
  const straightA = !aPrev.o && !aEnd.i, straightB = !bSt.o && !bNext.i; if (straightA && straightB) { const P0 = [aPrev.x, aPrev.y], P1 = [bNext.x, bNext.y], v = [P1[0] - P0[0], P1[1] - P0[1]], LL = Math.hypot(v[0], v[1]) || 1;
    const dA = Math.abs((aEnd.x - P0[0]) * v[1] - (aEnd.y - P0[1]) * v[0]) / LL, dB = Math.abs((bSt.x - P0[0]) * v[1] - (bSt.y - P0[1]) * v[0]) / LL, gap = Math.hypot(bSt.x - aEnd.x, bSt.y - aEnd.y);
    if (Math.max(dA, dB) < Math.max(3 / view.s, gap * 0.12, LL * 0.03)) for (const nd of [aEnd, bSt]) { const t = ((nd.x - P0[0]) * v[0] + (nd.y - P0[1]) * v[1]) / (LL * LL); nd.x = P0[0] + v[0] * t; nd.y = P0[1] + v[1] * t; } }
  const ga = [aEnd.x, aEnd.y], gb = [bSt.x, bSt.y], joined = { n: a2.n.concat(b2.n), z: false, cut: A.cut || B.cut || undefined }, kc = a2.n.length - 1;
  joined.n[kc].o = null; joined.n[kc + 1].i = null;
  // anything the gap passes through: the line stops on its edge each side
  const us = []; S.paths.forEach((q, qi) => { if (qi === ai || qi === bi) return; for (const c of BZ.crossings(q, ga, gb)) if (c.u > 1e-4 && c.u < 1 - 1e-4) us.push(c.u); }); us.sort((x, y) => x - y);
  const keep = Math.min(ai, bi), gone = Math.max(ai, bi); let res = [joined];
  if (us.length >= 2) res = BZ.cutOut(joined, kc, us[0], kc, us[us.length - 1]);
  S.paths.splice(gone, 1); replacePath(keep, res); for (const q of res) safeMerge(q); return us.length >= 2 ? 'trim' : 'join'; }
function skipTap(u, e) { const h = hitPath(u, tolPx(e)); if (!h) { if (skip.first >= 0) { skip.first = -1; updSkip(); draw(); } return; }
  if (skip.first < 0) { skip.first = h.pi; updSkip(); draw(); return; }
  if (h.pi === skip.first) { skip.first = -1; updSkip(); draw(); return; }
  let r; if (skip.mode === 'skip') r = skipOver(skip.first, h.pi, u); else r = continueAcross(skip.first, h.pi);
  skip.first = -1; if (r) { changed(); toast(skip.mode === 'skip' ? 'Line now stops at the edge and carries on the other side' : r === 'trim' ? 'Joined across and trimmed at the shape in the way' : 'Joined into one straight line'); } updSkip(); draw(); }
function updSkip() { $('skipTip').textContent = skip.mode === 'skip' ? (skip.first < 0 ? '1. Tap the line that should pass behind something.' : '2. Now tap the shape it passes behind (window, ring, strap…).')
  : (skip.first < 0 ? '1. Tap one piece of the broken line.' : '2. Now tap the other piece. It joins up in line and stops at anything in the way.');
  $('skipSkip').classList.toggle('on', skip.mode === 'skip'); $('skipCont').classList.toggle('on', skip.mode === 'cont'); }
$('skipSkip').onclick = () => { skip.mode = 'skip'; skip.first = -1; updSkip(); draw(); }; $('skipCont').onclick = () => { skip.mode = 'cont'; skip.first = -1; updSkip(); draw(); };
// ---------- Pen ----------
function snapPoint(u, tolU, skipPen) { const n = hitNode(u, tolU); if (n && !(skipPen && pen && n.pi === pen.pi)) { const nd = S.paths[n.pi].n[n.j]; return [nd.x, nd.y]; }
  const h = hitPath(u, tolU * 0.8, skipPen && pen ? pen.pi : -1); return h ? h.pt : u; }
function penDown(u, e) { const tolU = tolPx(e);
  if (pen && S.paths[pen.pi]) { const p = S.paths[pen.pi], f = p.n[0], l = p.n[p.n.length - 1];
    if (p.n.length > 2 && Math.hypot(f.x - u[0], f.y - u[1]) < tolU) { p.z = true; const done = pen.pi; pen = null; act = new Set([done]); changed({ keepSel: true }); toast('Shape closed'); return null; }
    if (Math.hypot(l.x - u[0], l.y - u[1]) < tolU * 0.6 && p.n.length > 1) { penDone(); return null; }
    const q = snapPoint(u, tolU, true); pushUndo(); p.n.push(BZ.node(q[0], q[1])); draw(); return { kind: 'pen', j: p.n.length - 1, start: q }; }
  const q = snapPoint(u, tolU, false); pushUndo(); S.paths.push({ n: [BZ.node(q[0], q[1])], z: false }); pen = { pi: S.paths.length - 1 }; act = new Set([pen.pi]); draw(); return { kind: 'pen', j: 0, start: q }; }
function penDrag(g, u) { const p = S.paths[pen.pi], nd = p.n[g.j], dx = u[0] - nd.x, dy = u[1] - nd.y; if (Math.hypot(dx, dy) * view.s < 6) return;
  nd.o = [nd.x + dx, nd.y + dy]; if (g.j > 0) { nd.i = [nd.x - dx, nd.y - dy]; nd.s = 1; } draw(); }
function penDone() { if (!pen) return; const p = S.paths[pen.pi]; if (p && p.n.length < 2) S.paths.splice(pen.pi, 1); pen = null; changed(); }
$('penDone').onclick = penDone; $('penBack').onclick = () => { if (!pen) return; const p = S.paths[pen.pi]; if (p.n.length > 1) { p.n.pop(); p.n[p.n.length - 1].o = null; } else { S.paths.splice(pen.pi, 1); pen = null; } changed(); };
// ---------- tools ----------
function syncEditLayerUI() {
  const bar = $('editBar'); if (bar) bar.hidden = !EDIT_TOOLS.includes(tool);
  document.body.classList.toggle('edit-cut', editKind === 'cut');
  document.body.classList.toggle('edit-etch', editKind !== 'cut');
  const seg = $('editKind'); if (seg) seg.querySelectorAll('button').forEach(b => b.classList.toggle('on', (b.dataset.edit === 'cut') === (editKind === 'cut')));
}
function setEditKind(k, opts) {
  k = k === 'cut' ? 'cut' : 'etch';
  const silent = !!(opts && opts.silent), same = editKind === k;
  editKind = k;
  try { localStorage.setItem('wp-editKind', k); } catch (e) {}
  if (window.T4) {
    if (T4.setInkCut) T4.setInkCut(k === 'cut', { fromEdit: true });
    if (T4.TE) T4.TE.cut = k === 'cut';
    if (T4.SL && T4.SL.list) {
      T4.SL.list = T4.SL.list.filter(i => S.paths[i] && inLayer(S.paths[i]));
      if (!T4.SL.list.length) { T4.SL.merged = null; T4.SL.pendingCut = null; T4.SL.gap = 0; }
    }
    if (!same && T4.teClear && T4.TE && (T4.TE.a || T4.TE.b || T4.TE.preview)) T4.teClear();
    if (T4.panel) T4.panel();
  }
  if (window.CN && CN.C && CN.C.sel && CN.C.sel.length) {
    const keep = CN.C.sel.filter(p => inLayer(p));
    if (keep.length !== CN.C.sel.length) { CN.C.sel = keep; if (!keep.length) { CN.C.area = null; CN.C.virt = null; } }
  }
  syncEditLayerUI();
  draw();
  if (!silent && !same) toast(k === 'cut' ? 'Editing CUT lines (red). Etch lines are faded and locked.' : 'Editing ETCH lines. Cut lines are faded and locked.');
}
function setTool(t) { if (tool === 'pen' && t !== 'pen') penDone(); const prev = tool; tool = t; if (window.T4) T4.onTool(t, prev); if (window.CN) CN.onTool(t); if (window.TA) TA.onTool(t, prev); if (window.HH && t !== 'shapes' && HH.on) HH.setOn(false); if (window.TB && t !== 'shapes' && TB.on) TB.setOn(false); document.querySelectorAll('#tools .tool').forEach(b => b.classList.toggle('on', b.dataset.tool === t));
  document.querySelectorAll('#toolOpts .topts').forEach(o => { o.hidden = !o.dataset.opts.split(' ').includes(t); }); if (t !== 'nodes') { sel.clear(); act.clear(); lastTap = null; } skip.first = -1; updSel(); updSkip(); cv.style.cursor = t === 'move' ? 'grab' : 'crosshair'; if (window.T2) T2.onTool(t); syncEditLayerUI(); draw(); }
document.querySelectorAll('#editKind button').forEach(b => b.onclick = () => setEditKind(b.dataset.edit));
document.querySelectorAll('#tools .tool').forEach(b => b.onclick = () => setTool(b.dataset.tool === tool ? 'move' : b.dataset.tool));
$('delStretch').onclick = () => { delMode = 'stretch'; $('delStretch').classList.add('on'); $('delWhole').classList.remove('on'); $('delTip').textContent = 'Tap a line: it is removed up to the junction each side.'; };
$('delWhole').onclick = () => { delMode = 'whole'; $('delWhole').classList.add('on'); $('delStretch').classList.remove('on'); $('delTip').textContent = 'Tap a line: the whole line is removed.'; };
const ACT = { nCorner: () => nodeType(false), nSmooth: () => nodeType(true), nLine: () => segType(true), nCurve: () => segType(false), nAdd: addNode, nDel: delNodes, nBreak: () => { if (!sel.size && act.size === 1) { const pi = [...act][0]; setTool('line'); T2.startBreak(pi); return; } breakNodes(); }, nJoin: joinNodes, nSeg: delSegs, nStraight: straighten, nAll: selectLine, nCut: toggleCut };
for (const id in ACT) { const el = $(id); if (el) el.onclick = ACT[id]; }
document.querySelectorAll('#nKind button').forEach(b => b.onclick = () => setPathsKind(pickedLines(), b.dataset.kind === 'cut'));
document.querySelectorAll('[data-nudge]').forEach(b => b.onclick = () => { const [x, y] = b.dataset.nudge.split(',').map(Number), st = +$('nudgeMm').value || 0.5; nudge(x * st, y * st); });
// ---------- gestures (one finger edits; two fingers always move/zoom) ----------
const ptrs = new Map(); let gest = null, pinch = null, lastTapT = 0, lastTapU = null;
function cvPt(e) { const r = cv.getBoundingClientRect(); return [e.clientX - r.left, e.clientY - r.top]; }
// v4.3 pointers: the finger/pen that started a gesture owns it (moves from other fingers are ignored, lifting another finger
// doesn't end it). A pen (stylus) is never a "second finger": while the pen is down every touch (palm) is ignored, and a pen
// landing while the palm rests on the screen takes over. While a Draw stroke is under way an extra touch doesn't cancel it.
const ignored = new Set(); let lastPenT = 0;
const drawing = () => gest && gest.t4 === 'draw';
cv.addEventListener('pointerdown', e => { try { cv.setPointerCapture(e.pointerId); } catch (er) { /* */ } if (e.pointerType === 'pen') lastPenT = Date.now();
  if (e.pointerType === 'touch' && ((gest && gest.ptype === 'pen') || Date.now() - lastPenT < 600)) { ignored.add(e.pointerId); return; } // palm while using a pen
  if (e.pointerType === 'pen' && (pinch || (gest && gest.ptype !== 'pen'))) { if (gest) cancelGesture(); pinch = null; for (const id of ptrs.keys()) ignored.add(id); ptrs.clear(); }
  if (drawing() && (gest.moved || Date.now() - gest.t0 > 250)) { ignored.add(e.pointerId); return; } // a stroke is being drawn: extra touch doesn't cancel it
  ptrs.set(e.pointerId, cvPt(e));
  if (ptrs.size === 2) { cancelGesture(); const [a, b] = [...ptrs.values()]; pinch = { d: Math.hypot(a[0] - b[0], a[1] - b[1]), c: [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2], s: view.s, tx: view.tx, ty: view.ty }; return; }
  if (ptrs.size > 2) return; const p = cvPt(e), u = toU(p[0], p[1]); gest = startGesture(e, p, u); if (gest) { gest.pid = e.pointerId; gest.ptype = e.pointerType; gest.t0 = Date.now(); } });
cv.addEventListener('pointermove', e => { if (ignored.has(e.pointerId) || !ptrs.has(e.pointerId)) return; ptrs.set(e.pointerId, cvPt(e));
  if (pinch && ptrs.size >= 2) { const [a, b] = [...ptrs.values()], d = Math.hypot(a[0] - b[0], a[1] - b[1]), c = [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2], k = Math.max(0.05, Math.min(80, pinch.s * d / Math.max(1, pinch.d))) / pinch.s;
    view.s = pinch.s * k; view.tx = c[0] - (pinch.c[0] - pinch.tx) * k; view.ty = c[1] - (pinch.c[1] - pinch.ty) * k; draw(); return; }
  if (!gest || (gest.pid != null && e.pointerId !== gest.pid)) return;
  if (drawing()) { const evs = e.getCoalescedEvents ? e.getCoalescedEvents() : []; for (const ce of (evs.length ? evs : [e])) { const p = cvPt(ce); gest.moved = true; T4.move(gest, p, toU(p[0], p[1]), ce); } return; } // every pen sample, no dead zone
  moveGesture(gest, cvPt(e), e); });
const up = e => { if (ignored.delete(e.pointerId)) return; ptrs.delete(e.pointerId); if (pinch) { if (ptrs.size < 2) pinch = null; return; }
  if (gest && (gest.pid == null || e.pointerId === gest.pid)) { const g = gest; gest = null; endGesture(g, e); } };
cv.addEventListener('pointerup', up); cv.addEventListener('pointercancel', e => { if (ignored.delete(e.pointerId)) return; ptrs.delete(e.pointerId);
  if (drawing() && e.pointerId === gest.pid && gest.moved) { const g = gest; gest = null; endGesture(g, e); return; } // keep what was drawn
  if (gest && gest.pid != null && e.pointerId !== gest.pid) return; cancelGesture(); pinch = null; });
cv.addEventListener('wheel', e => { e.preventDefault(); const p = cvPt(e), k = Math.exp(-e.deltaY * 0.0015), ns = Math.max(0.05, Math.min(80, view.s * k)), kk = ns / view.s; view.tx = p[0] - (p[0] - view.tx) * kk; view.ty = p[1] - (p[1] - view.ty) * kk; view.s = ns; draw(); }, { passive: false });
function startGesture(e, p, u) { const base = { p0: p, u0: u, moved: false, snap: null };
  if (window.CN && tool === 'clone') return CN.down(e, p, u, base); // v5.0 clone
  if (window.TA && tool === 'tarea') return TA.down(e, p, u, base); // v5.3 trace an area
  if (window.TB && tool === 'shapes' && TB.on) return TB.down(e, p, u, base); // v4.8 tabs
  if (window.HH && tool === 'shapes' && HH.on) return HH.down(e, p, u, base); // v4.7 hanging hole
  if (window.HH && tool === 'cutout' && HH.hitHole(u, tolPx(e) * 0.6) >= 0) return HH.down(e, p, u, base); // drag a hole as a whole circle
  if ((tool === 'line' || tool === 'shapes') && window.T2) return T2.down(e, p, u, base);
  if (window.T4 && T4.IDS.includes(tool)) return T4.down(e, p, u, base); // a tool is on: one finger never moves the picture
  if (tool === 'move' || !S.paths.length && tool !== 'pen') return Object.assign(base, { kind: 'pan', tx: view.tx, ty: view.ty });
  if (tool === 'pen') { const g = penDown(u, e); return g ? Object.assign(base, g) : null; }
  if (tool === 'erase' || tool === 'skip') return Object.assign(base, { kind: 'tap', tx: view.tx, ty: view.ty });
  // nodes tool
  const tolU = tolPx(e), h = hitHandle(u, tolU * 0.8); if (h) return Object.assign(base, { kind: 'handle', h, snap: snap() });
  const nh = hitNode(u, tolU, act.size ? act : null) || (act.size ? null : null);
  if (nh) { const k = pkey(nh.pi, nh.j); const wasSel = sel.has(k); if (!wasSel) { sel = new Set([k]); } act.add(nh.pi); updSel(); draw();
    const moving = new Set(); for (const key of sel) { const [pi, j] = unkey(key); moving.add(S.paths[pi].n[j]); for (const m of linked(pi, j)) moving.add(m); }
    return Object.assign(base, { kind: 'nodes', key: k, wasSel, moving: [...moving], last: u, snap: snap() }); }
  const sh = hitPath(u, tolU); if (sh && act.has(sh.pi)) return Object.assign(base, { kind: 'seg', h: sh, snap: snap() });
  return Object.assign(base, { kind: 'box', h: sh }); }
function moveGesture(g, p, e) { const u = toU(p[0], p[1]); if (!g.moved && Math.hypot(p[0] - g.p0[0], p[1] - g.p0[1]) < (e.pointerType === 'mouse' ? 3 : 7)) return; g.moved = true;
  if (g.cn) { CN.move(g, p, u, e); return; }
  if (g.ta) { TA.move(g, p, u, e); return; }
  if (g.tb) { TB.move(g, p, u, e); return; }
  if (g.hh) { HH.move(g, p, u, e); return; }
  if (g.t2) { T2.move(g, p, u, e); return; }
  if (g.t4) { T4.move(g, p, u, e); return; }
  if (g.kind === 'pan') { view.tx = g.tx + p[0] - g.p0[0]; view.ty = g.ty + p[1] - g.p0[1]; draw(); return; }
  if (g.kind === 'tap') { view.tx = g.tx + p[0] - g.p0[0]; view.ty = g.ty + p[1] - g.p0[1]; draw(); return; }
  if (g.kind === 'pen') { penDrag(g, u); return; }
  if (g.kind === 'nodes') { const dx = u[0] - g.last[0], dy = u[1] - g.last[1]; g.last = u; for (const m of g.moving) BZ.moveNode(m, dx, dy); draw(); return; }
  if (g.kind === 'handle') { const nd = S.paths[g.h.pi].n[g.h.j], q = nd[g.h.side]; q[0] = u[0]; q[1] = u[1]; const oth = g.h.side === 'i' ? 'o' : 'i';
    if (nd.s && nd[oth]) { const L = Math.hypot(nd[oth][0] - nd.x, nd[oth][1] - nd.y), v = [nd.x - u[0], nd.y - u[1]], l = Math.hypot(v[0], v[1]) || 1; nd[oth] = [nd.x + v[0] / l * L, nd.y + v[1] / l * L]; } draw(); return; }
  if (g.kind === 'seg') { S.paths = BZ.clone(g.snap); const p2 = S.paths[g.h.pi]; BZ.bend(p2, g.h.k, g.h.t, u[0] - g.u0[0], u[1] - g.u0[1]); act = new Set([g.h.pi]); draw(); return; }
  if (g.kind === 'box') { overlay = { box: [g.u0, u] }; draw(); } }
function endGesture(g, e) { overlay = null; const u = g.last || g.u0;
  if (g.cn) { CN.up(g, e); return; }
  if (g.ta) { TA.up(g, e); return; }
  if (g.tb) { TB.up(g, e); return; }
  if (g.hh) { HH.up(g, e); return; }
  if (g.t2) { T2.up(g, e); return; }
  if (g.t4) { T4.up(g, e); return; }
  if (g.kind === 'pan') return;
  if (g.kind === 'tap') { if (!g.moved) { if (tool === 'erase') { const h = hitPath(g.u0, tolPx(e)); if (h) deleteStretch(h); else toast('Tap right on a line to delete it'); } else skipTap(g.u0, e); } return; }
  if (g.kind === 'pen') { if (g.moved) { saveSoon(); updStats(); } return; }
  if (g.kind === 'nodes') { if (g.moved) { undoSt.push(g.snap); redoSt = []; changed({ keepSel: true }); } else if (g.wasSel && sel.size > 1) { sel = new Set([g.key]); updSel(); draw(); } return; }
  if (g.kind === 'handle') { if (g.moved) { undoSt.push(g.snap); redoSt = []; changed({ keepSel: true }); } return; }
  if (g.kind === 'seg') { if (g.moved) { undoSt.push(g.snap); redoSt = []; changed({ keepSel: true }); return; }
    const now = Date.now(), dbl = now - lastTapT < 400 && lastTapU && Math.hypot(lastTapU[0] - g.u0[0], lastTapU[1] - g.u0[1]) * view.s < 24;
    act = new Set([g.h.pi]); sel.clear(); lastTap = { pi: g.h.pi, k: g.h.k, t: g.h.t };
    if (dbl) { pushUndo(); const j = BZ.insertNode(S.paths[g.h.pi], g.h.k, g.h.t); sel = new Set([pkey(g.h.pi, j)]); lastTap = null; lastTapT = 0; changed({ keepSel: true }); toast('Point added'); return; }
    lastTapT = now; lastTapU = g.u0; overlay = { pt: g.h.pt }; updSel(); draw(); setTimeout(() => { if (overlay && overlay.pt) { overlay = null; draw(); } }, 900); return; }
  if (g.kind === 'box') { if (!g.moved) { if (g.h) { act = new Set([g.h.pi]); sel.clear(); lastTap = { pi: g.h.pi, k: g.h.k, t: g.h.t }; lastTapT = Date.now(); lastTapU = g.u0; } else clearSel(); updSel(); draw(); return; } const a = g.u0, b = toU(...cvPt(e)), x0 = Math.min(a[0], b[0]), x1 = Math.max(a[0], b[0]), y0 = Math.min(a[1], b[1]), y1 = Math.max(a[1], b[1]);
    sel.clear(); act.clear(); S.paths.forEach((p, pi) => p.n.forEach((nd, j) => { if (nd.x >= x0 && nd.x <= x1 && nd.y >= y0 && nd.y <= y1) { sel.add(pkey(pi, j)); act.add(pi); } })); lastTap = null; updSel(); draw(); } }
function cancelGesture() { if (!gest) return; if (gest.t4 && window.T4) T4.cancelG(gest); if (gest.restore && gest.moved) gest.restore(); if (gest.snap && gest.moved) { S.paths = gest.snap; if (gest.snap._w != null) { S.widthMm = gest.snap._w; syncInputs(); } } if (gest.kind === 'pan' || gest.kind === 'tap' || gest.t2 === 'pan' || gest.t2 === 'tap') { view.tx = gest.tx; view.ty = gest.ty; } gest = null; overlay = null; draw(); }
window.addEventListener('keydown', e => { if (/input|select|textarea/i.test((e.target.tagName || ''))) return; const z = (e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'z';
  if (z && !e.shiftKey) { e.preventDefault(); undo(); return; } if ((e.ctrlKey || e.metaKey) && (e.key.toLowerCase() === 'y' || (z && e.shiftKey))) { e.preventDefault(); redo(); return; }
  if (tool === 'pen' && (e.key === 'Enter' || e.key === 'Escape')) { penDone(); return; }
  if ((tool === 'line' || tool === 'shapes') && e.key === 'Escape' && window.T2) { T2.cancel(); draw(); return; }
  if (tool === 'p2p' && (e.key === 'Enter' || e.key === 'Escape') && window.T4) { T4.p2pDone(); return; }
  if (tool !== 'nodes') return; const st = (+$('nudgeMm').value || 0.5) * (e.shiftKey ? 5 : 1), A = { ArrowLeft: [-1, 0], ArrowRight: [1, 0], ArrowUp: [0, -1], ArrowDown: [0, 1] }[e.key];
  if (A && sel.size) { e.preventDefault(); nudge(A[0] * st, A[1] * st); } else if ((e.key === 'Delete' || e.key === 'Backspace') && sel.size) { e.preventDefault(); delNodes(); } });
$('undoBtn').onclick = undo; $('redoBtn').onclick = redo; $('fitBtn').onclick = fit;
// ---------- tidy ----------
function closeGapsAll() { const k = kmm(), maxU = S.gapMm / k; pushUndo(); let n = 0;
  for (let pass = 0; pass < 2; pass++) for (let pi = 0; pi < S.paths.length; pi++) { const p = S.paths[pi]; if (p.z || p.cut) continue;
    for (const j of [0, p.n.length - 1]) { const pp = S.paths[pi]; const jj = j === 0 ? 0 : pp.n.length - 1; if (isJunction(pi, jj)) continue; const nd = pp.n[jj], nb = jj === 0 ? pp.n[1] : pp.n[pp.n.length - 2], hh = jj === 0 ? nd.o : nd.i, back = hh || [nb.x, nb.y];
      let dx = nd.x - back[0], dy = nd.y - back[1]; const L = Math.hypot(dx, dy) || 1; dx /= L; dy /= L; const from = [nd.x, nd.y], to = [nd.x + dx * maxU, nd.y + dy * maxU]; let best = null;
      S.paths.forEach((q, qi) => { for (const c of BZ.crossings(q, from, to)) { if (c.u * maxU < 0.05) continue; if (qi === pi && ((jj === 0 && c.k === 0) || (jj !== 0 && c.k === BZ.nseg(q) - 1))) continue; if (!best || c.u < best.u) best = c; } });
      if (best && extendEnd(pi, jj, true)) n++; } }
  if (!n) { undoSt.pop(); updUndo(); toast(`No loose ends within ${S.gapMm} mm of another line`); return; } clearSel(); changed(); toast(`Closed ${n} gap${n > 1 ? 's' : ''} - each line now stops exactly on the next`); }
function removeShort() { const k = kmm(), lim = S.shortMm / k, before = S.paths.length; const keep = S.paths.filter(p => p.cut || BZ.length(p) >= lim || p.z && BZ.length(p) >= lim * 0.5); if (keep.length === before) { toast(`No lines shorter than ${S.shortMm} mm`); return; } pushUndo(); S.paths = keep; clearSel(); changed(); toast(`Removed ${before - keep.length} stray bit${before - keep.length > 1 ? 's' : ''}`); }
// overlapping / doubled lines: a piece of line lying on top of another line is removed
function removeOverlaps() { const tolU = Math.max(S.lineMm * 0.6 / kmm(), 1.5 / view.s, 0.5); const flat = S.paths.map(p => BZ.flatten(p, tolU / 4)); const cell = tolU * 4, grid = new Map();
  flat.forEach((f, pi) => { for (let i = 1; i < f.length; i++) { const a = f[i - 1], b = f[i], x0 = Math.floor(Math.min(a[0], b[0]) / cell), x1 = Math.floor(Math.max(a[0], b[0]) / cell), y0 = Math.floor(Math.min(a[1], b[1]) / cell), y1 = Math.floor(Math.max(a[1], b[1]) / cell);
    for (let x = x0; x <= x1; x++) for (let y = y0; y <= y1; y++) { const k = x + ',' + y; if (!grid.has(k)) grid.set(k, []); grid.get(k).push([pi, a, b]); } } });
  const near = (q, self, dead) => { const k = Math.floor(q[0] / cell) + ',' + Math.floor(q[1] / cell), list = grid.get(k) || []; for (const [pi, a, b] of list) { if (pi === self || dead.has(pi)) continue; if (BZ.segD(q, a, b)[0] <= tolU) return true; } return false; };
  const order = S.paths.map((p, i) => [BZ.length(p), i]).sort((a, b) => a[0] - b[0]).map(x => x[1]), dead = new Set(), changes = new Map(); let removed = 0;
  for (const pi of order) { const p = S.paths[pi]; if (p.cut) continue; const del = new Set();
    for (let k = 0; k < BZ.nseg(p); k++) { const s = BZ.seg(p, k), pts = []; for (let i = 0; i <= 8; i++) pts.push(BZ.pointAt(p, k, i / 8)); if (pts.every(q => near(q, pi, dead))) del.add(k); void s; }
    if (!del.size) continue; removed += del.size; if (del.size === BZ.nseg(p)) dead.add(pi); else changes.set(pi, del); }
  if (!removed) { toast('No overlapping lines found'); return; } pushUndo(); const out = []; S.paths.forEach((p, pi) => { if (dead.has(pi)) return; if (changes.has(pi)) out.push(...keepSegs(p, changes.get(pi))); else out.push(p); }); S.paths = out.map(dedupe); clearSel(); changed(); toast(`Removed ${removed} doubled-up piece${removed > 1 ? 's' : ''}`); }
$('gapBtn').onclick = closeGapsAll; $('shortBtn').onclick = removeShort; $('overlapBtn').onclick = removeOverlaps;
// ---------- export ----------
// v5.1 export date + time for the file names (this device's clock), e.g. "2026-11-19 2300"
const exportStamp = (d = new Date()) => { const z = v => String(v).padStart(2, '0'); return `${d.getFullYear()}-${z(d.getMonth() + 1)}-${z(d.getDate())} ${z(d.getHours())}${z(d.getMinutes())}`; };
function buildOut() { if (window.HH) HH.sync(); if (window.TB) TB.sync(); return LZ.build({ name: S.name, stamp: exportStamp(), art: etch(), cut: cutActive() ? cuts() : [], widthMm: S.widthMm, burn: { engrave: burnOf('engrave'), cut: burnOf('cut') }, smax: smax(), lineMm: S.lineMm, pxmm: 10, sheet: S.sheet && S.sheet.on ? S.sheet : null, border: borderMm() }); }
// ---------- Sheet: blank size, margin, copies ----------
const designFrame = () => LZ.frame(etch(), cutActive() ? cuts() : [], S.widthMm);
// v4.9 border round the design when no blank is set (laser 0,0 = free corner). Remembered on this device for every project.
const BORDER0 = 10;
function borderMm() { const v = parseFloat(localStorage.getItem('wp-border')); return v >= 0 && v <= 100 ? v : BORDER0; }
function borderUI() { const v = borderMm(), on = !!(S.sheet && S.sheet.on); ['brdIn', 'lzBrd'].forEach(id => { const e = $(id); if (e && document.activeElement !== e) e.value = v; });
  if ($('lzBrdRow')) $('lzBrdRow').hidden = on;
  document.querySelectorAll('.brdhint').forEach(h => { h.textContent = on ? 'Blank on: the border is not used - 0,0 is the blank\'s bottom-left corner.' : v > 0 ? `Set your laser's zero ${f1(v)} mm below and ${f1(v)} mm left of the design. Nothing burns closer than ${f1(v)} mm to zero, so the tabs never run into the machine's edge.` : 'Border 0: the laser 0,0 is the bottom-left corner of the design itself (the tab bottoms sit right on zero).'; }); }
['brdIn', 'lzBrd'].forEach(id => { const e = $(id); if (!e) return; e.addEventListener('change', () => { const v = parseFloat(e.value); if (!(v >= 0 && v <= 100)) { e.value = borderMm(); toast('Use a border from 0 to 100 mm'); return; } localStorage.setItem('wp-border', String(v)); borderUI(); exSummary(); lzWhat(); }); });
function sheetUI() { borderUI(); const sh = S.sheet || (S.sheet = SHEET0()); $('shOn').checked = !!sh.on; $('shBody').hidden = !sh.on; $('shOff').hidden = !!sh.on;
  $('shW').value = sh.W; $('shH').value = sh.H; $('shM').value = sh.margin; $('shGap').value = sh.gap; $('shNx').value = sh.nx; $('shNy').value = sh.ny;
  document.querySelectorAll('[data-place]').forEach(b => b.classList.toggle('on', b.dataset.place === (sh.place === 'margin' ? 'margin' : 'centre'))); sheetPreview(); }
function sheetPreview() { const sh = S.sheet, info = $('shInfo'), c = $('shPrev'); if (!sh || !sh.on || !c) return; const fr = designFrame();
  const g = c.getContext('2d'), W = c.width, H = c.height; g.setTransform(1, 0, 0, 1, 0, 0); g.clearRect(0, 0, W, H);
  if (!fr) { info.textContent = 'Open a picture first.'; return; } const lay = LZ.layout(fr, sh), pad = 34, s = Math.min((W - 2 * pad) / lay.W, (H - 2 * pad) / lay.H);
  const X = x => pad + x * s, Y = y => H - pad - y * s; // laser mm (y up) -> preview
  g.fillStyle = '#e9dcc4'; g.fillRect(X(0), Y(lay.H), lay.W * s, lay.H * s); g.strokeStyle = '#8a7a60'; g.lineWidth = 2; g.strokeRect(X(0), Y(lay.H), lay.W * s, lay.H * s);
  g.setLineDash([6, 5]); g.strokeStyle = 'rgba(80,80,80,.7)'; g.lineWidth = 1; const m = +sh.margin || 0; g.strokeRect(X(m), Y(lay.H - m), (lay.W - 2 * m) * s, (lay.H - 2 * m) * s); g.setLineDash([]);
  const draw1 = (paths, col, lwid) => { g.strokeStyle = col; g.lineWidth = lwid; g.beginPath(); for (const o of lay.offs) for (const p of paths) { const f = BZ.flatten(p, 1 / (fr.k * s)); f.forEach(([x, y], i) => { const lx = o[0] + (x - fr.x0) * fr.k, ly = o[1] + (fr.y1 - y) * fr.k; i ? g.lineTo(X(lx), Y(ly)) : g.moveTo(X(lx), Y(ly)); }); } g.stroke(); };
  draw1(etch(), '#151515', 1); if (cutActive()) draw1(cuts(), '#e03131', 1.4);
  g.fillStyle = '#e03131'; g.beginPath(); g.arc(X(0), Y(0), 6, 0, 7); g.fill(); g.font = 'bold 15px system-ui, sans-serif'; g.fillStyle = '#ffd8a8'; g.fillText('0,0', X(0) + 4, Y(0) + 22);
  g.fillStyle = '#c9d6dc'; g.font = '13px system-ui, sans-serif'; g.fillText(`${Math.round(lay.W * 10) / 10} mm`, X(lay.W / 2) - 24, Y(lay.H) - 8);
  if (!lay.fits) { g.strokeStyle = '#e03131'; g.lineWidth = 3; g.strokeRect(X(lay.ax0), Y(lay.ay1), lay.bw * s, lay.bh * s); }
  const fc = LZ.fitCount(fr, sh);
  info.innerHTML = `${lay.n} cop${lay.n > 1 ? 'ies' : 'y'} of ${f1(fr.W)} × ${f1(fr.H)} mm on a ${f1(lay.W)} × ${f1(lay.H)} mm blank. ${lay.fits ? `Laser 0,0 = the blank's <b>bottom-left corner</b> (red dot) - put the laser there.` : `<span class="warn">Doesn't fit inside the ${f1(m)} mm margin (needs ${f1(lay.bw)} × ${f1(lay.bh)} mm). At most ${fc.nx} × ${fc.ny} fit${fc.nx && fc.ny ? '' : ' - make the design smaller in Size'}.</span>`}`; }
$('shOn').addEventListener('change', e => { S.sheet.on = e.target.checked; sheetUI(); saveSoon(); exSummary(); });
[['shW', 'W', 10, 2000], ['shH', 'H', 10, 2000], ['shM', 'margin', 0, 200], ['shGap', 'gap', 0, 200], ['shNx', 'nx', 1, 50], ['shNy', 'ny', 1, 50]].forEach(([id, k, lo, hi]) =>
  $(id).addEventListener('change', e => { let v = +e.target.value; if (k === 'nx' || k === 'ny') v = Math.round(v); if (!(v >= lo && v <= hi)) { e.target.value = S.sheet[k]; toast(`Use a number from ${lo} to ${hi}`); return; } S.sheet[k] = v; e.target.value = v; sheetPreview(); saveSoon(); exSummary(); }));
document.querySelectorAll('[data-place]').forEach(b => b.onclick = () => { S.sheet.place = b.dataset.place; sheetUI(); saveSoon(); exSummary(); });
$('shFit').onclick = () => { const fr = designFrame(); if (!fr) return; const fc = LZ.fitCount(fr, S.sheet); if (!fc.nx || !fc.ny) { toast('Even one copy is too big for this blank - make the Width smaller in Size.', 4000); return; } S.sheet.nx = fc.nx; S.sheet.ny = fc.ny; sheetUI(); saveSoon(); exSummary(); toast(`${fc.nx} × ${fc.ny} = ${fc.nx * fc.ny} copies fit`); };
function exSummary() { sheetPreview(); const el = $('exSummary'); if (!el) return; if (!etch().length) { el.textContent = 'Open a picture first.'; return; } const k = kmm(), b = bbAll();
  const sh = S.sheet && S.sheet.on ? (() => { const fr = designFrame(); return fr ? LZ.layout(fr, S.sheet) : null; })() : null;
  el.innerHTML = `${sh ? `<b>Sheet:</b> ${sh.n} cop${sh.n > 1 ? 'ies' : 'y'} on a ${f1(sh.W)} × ${f1(sh.H)} mm blank, 0,0 = the blank's bottom-left corner.${sh.fits ? '' : ' <span class="warn">They don\'t fit - see Sheet.</span>'} ` : ''}Design ${f1(S.widthMm)} × ${f1(b.h * k)} mm. Files: <b>1 Engrave lines</b> (${sumOf('engrave')})${cutActive() ? ` + <b>2 Cut outside</b> (${sumOf('cut')})` : ''}, plus an SVG in mm and a read-me. All steps share the same 0,0 (bottom-left${sh ? ' of the blank' : borderMm() > 0 ? `, ${f1(borderMm())} mm below and left of the design` : ''}), so they line up in LaserGRBL.${cutActive() ? ' Holes and windows are cut before the outside.' : ''} The laser is switched off for every move between lines.`; }
const mimeOf = n => /\.svg$/.test(n) ? 'image/svg+xml' : 'text/plain';
function download(blob, name) { const a = document.createElement('a'); a.href = URL.createObjectURL(blob); a.download = name; document.body.appendChild(a); a.click(); a.remove(); setTimeout(() => URL.revokeObjectURL(a.href), 8000); }
function listFiles(o, how) { $('exOut').innerHTML = `<div class="ok">${esc(how)}</div><ul>${o.files.map(f => `<li>${esc(f.name)}</li>`).join('')}</ul><div class="hint">Design area ${f1(o.fr.W)} × ${f1(o.fr.H)} mm, 0,0 at the bottom-left. In LaserGRBL: File › Open File › pick a .nc › Start. Do step 1 then step 2 without moving anything.</div>`; }
async function shareFiles() { let o; try { o = buildOut(); } catch (e) { toast(e.message); return; }
  const zip = new File([LZ.makeZip(o.files)], o.zipName, { type: 'application/zip' });
  try { if (navigator.canShare && navigator.canShare({ files: [zip] })) { await navigator.share({ files: [zip], title: o.zipName, text: `${o.base} laser files` }); listFiles(o, `Shared ${o.zipName}:`); return; }
    const each = o.files.filter(f => !/read me/.test(f.name)).map(f => new File([f.data], f.name, { type: mimeOf(f.name) }));
    if (navigator.canShare && navigator.canShare({ files: each })) { await navigator.share({ files: each, title: `${o.base} laser files` }); listFiles(o, `Shared ${each.length} files:`); return; } }
  catch (e) { if (e.name === 'AbortError') { toast('Share cancelled'); return; } console.warn(e); }
  download(zip, o.zipName); listFiles(o, `This device can't share these files, so ${o.zipName} was saved to Downloads. It contains:`); }
async function saveZip() { let o; try { o = buildOut(); } catch (e) { toast(e.message); return; } const blob = LZ.makeZip(o.files);
  if (window.showSaveFilePicker) { try { const h = await window.showSaveFilePicker({ suggestedName: o.zipName, types: [{ description: 'Zip file', accept: { 'application/zip': ['.zip'] } }] });
    const w = await h.createWritable(); await w.write(blob); await w.close(); listFiles(o, `Saved ${o.zipName} where you chose. Right-click it › Extract All before opening in LaserGRBL. Inside:`); return; } catch (e) { if (e.name === 'AbortError') return; } }
  download(blob, o.zipName); listFiles(o, `${o.zipName} is in your Downloads folder. Right-click › Extract All, then open the .nc files in LaserGRBL. Inside:`); }
function saveSvg() { let o; try { o = buildOut(); } catch (e) { toast(e.message); return; } download(new Blob([o.svgAll], { type: 'image/svg+xml' }), o.svgName); $('exOut').innerHTML = `<div class="ok">${esc(o.svgName)} saved to Downloads (${f1(o.fr.W)} × ${f1(o.fr.H)} mm).</div>`; }
$('shareBtn').onclick = shareFiles; $('saveZipBtn').onclick = saveZip; $('svgBtn').onclick = saveSvg;
  const wdSave = () => saveWaylandDesign(); if ($('wdSave')) $('wdSave').onclick = wdSave; if ($('wdSave2')) $('wdSave2').onclick = wdSave; if ($('wdToForge')) $('wdToForge').onclick = sendToForge; if ($('wdToPost')) $('wdToPost').onclick = sendToPost;
  if ($('wdOpen')) $('wdOpen').addEventListener('change', e => { const f = e.target.files[0]; e.target.value = ''; if (f) openFile(f); });
// v4.5 Export = the Burn settings sheet, like Wayland Forge: one section per step (Mode / Power / Speed / Passes), then Export
async function saveSeparate() { let o; try { o = buildOut(); } catch (e) { toast(e.message); return; } for (const f of o.files) { download(new Blob([f.data], { type: mimeOf(f.name) }), f.name); await new Promise(r => setTimeout(r, 900)); }
  listFiles(o, `${o.files.length} files saved to your Downloads folder. If the browser asks to allow multiple downloads, tap Allow.`); }
function lzWhat() { const el = $('lzWhat'); if (!el) return; if (!etch().length) { el.textContent = 'Open a picture first.'; return; } const k = kmm(), b = bbAll(), sh = S.sheet && S.sheet.on ? (() => { const fr = designFrame(); return fr ? LZ.layout(fr, S.sheet) : null; })() : null;
  el.innerHTML = `<b>${esc(S.name || 'Untitled')}</b> · ${f1(S.widthMm)} × ${f1(b.h * k)} mm${sh ? ` · ${sh.n} cop${sh.n > 1 ? 'ies' : 'y'} on a ${f1(sh.W)} × ${f1(sh.H)} mm blank` : ''} · ${cutActive() ? `${cuts().length} cut line${cuts().length > 1 ? 's' : ''}` : 'no cut'}`;
  $('lzSheetInfo').innerHTML = sh ? `Blank on: ${sh.n} cop${sh.n > 1 ? 'ies' : 'y'}, 0,0 = the blank's bottom-left corner.${sh.fits ? '' : ' <span class="warn">They don\'t fit.</span>'}` : (borderMm() > 0 ? `Blank off: ${f1(borderMm())} mm border - set your laser's zero ${f1(borderMm())} mm below and left of the design.` : 'Blank off: the laser 0,0 is the bottom-left corner of the design.'); borderUI();
  $('lzMoreSum').textContent = `· S max ${smax()}${sh ? ` · blank ${sh.n}×` : ''}`; }
function lzOpenBurn() { if (!etch().length) { toast('Open a picture first'); return; } closeMenu(); lzUI(); lzWhat(); const d = $('lzDlg'); if (d.showModal) { if (!d.open) d.showModal(); } else d.setAttribute('open', ''); }
$('exportTop').onclick = lzOpenBurn; $('lzOpenMenu').onclick = lzOpenBurn;
$('lzDlgCancel').onclick = () => $('lzDlg').close();
$('lzSheetBtn').onclick = () => { $('lzDlg').close(); openMenu('sec-sheet'); };
{ const h = $('lzHow'); try { const v = localStorage.getItem('wp-lzhow'); if (v && [...h.options].some(o => o.value === v)) h.value = v; } catch (e) { /* */ } h.onchange = () => { try { localStorage.setItem('wp-lzhow', h.value); } catch (e) { /* */ } }; }
$('lzDlgGo').onclick = async () => { $('lzDlg').close(); const how = $('lzHow').value; try { if (how === 'share') await shareFiles(); else if (how === 'files') await saveSeparate(); else if (how === 'svg') saveSvg(); else await saveZip(); } catch (e) { console.warn(e); toast('Export failed: ' + e.message, 4000); return; }
  const ok = $('exOut').querySelector('.ok'); if (ok) toast(ok.textContent, 6000); };
// ---------- save / resume (IndexedDB) ----------
const DB = { db: null, open() { return this.db || (this.db = new Promise((res, rej) => { const r = indexedDB.open('waylands-path', 1); r.onupgradeneeded = () => r.result.createObjectStore('p'); r.onsuccess = () => res(r.result); r.onerror = () => rej(r.error); })); },
  async put(k, v) { const db = await this.open(); return new Promise((res, rej) => { const t = db.transaction('p', 'readwrite'); t.objectStore('p').put(v, k); t.oncomplete = res; t.onerror = () => rej(t.error); }); },
  async del(k) { const db = await this.open(); return new Promise((res, rej) => { const t = db.transaction('p', 'readwrite'); t.objectStore('p').delete(k); t.oncomplete = res; t.onerror = () => rej(t.error); }); },
  async get(k) { const db = await this.open(); return new Promise((res, rej) => { const r = db.transaction('p').objectStore('p').get(k); r.onsuccess = () => res(r.result); r.onerror = () => rej(r.error); }); } };
let saveT = null;
function saveSoon() { clearTimeout(saveT); saveT = setTimeout(saveNow, 600); }
async function saveNow() { if (!S.src && !S.paths.length) return; S.saved = Date.now(); if (!S.pid && window.PJ) S.pid = PJ.newId(); try { const st = JSON.parse(JSON.stringify(S)); await DB.put('last', st); if (window.PJ) await PJ.saved(st); $('saveInfo').textContent = 'Saved on this device ' + new Date(S.saved).toLocaleTimeString(); } catch (e) { $('saveInfo').textContent = 'Could not save on this device: ' + e.message; } }
// v1/v2 projects stored plain point lists: turn them into Bezier paths
function migrate(v) { if (Array.isArray(v.paths) && v.paths.length && Array.isArray(v.paths[0])) v.paths = v.paths.filter(p => p.length > 1).map(p => BZ.fromPolyline(p, { tol: 0.6, arm: 4, corner: 35, closed: p.length > 3 && Math.hypot(p[0][0] - p[p.length - 1][0], p[0][1] - p[p.length - 1][1]) < 0.01 })).filter(Boolean);
  const ot = v.trace || {}; v.trace = Object.assign(DEFAULTS().trace, ot); if (!ot.mode) v.trace.mode = ot.invert ? 'light' : 'auto'; delete v.trace.invert; v.sheet = Object.assign(SHEET0(), v.sheet || {}); if (v.ver !== 3) { v.cutOn = false; v.ver = 3; } if (!v.v4) { if (v.cutOff == null || v.cutOff === 3) v.cutOff = 0.5; v.cutTight = v.cutTight || 8; v.showPhoto = false; v.v4 = 1; } return v; }
async function resume(v0) { const v = v0 || await DB.get('last'); if (!v) return false; S = Object.assign(DEFAULTS(), migrate(v)); undoSt = []; redoSt = []; srcImg = srcEl = null; clearSel(); pen = null;
  if (S.src && S.src.kind === 'image' && S.src.url) await setSource(S.src.url); $('srcInfo').textContent = S.src ? (S.src.kind === 'svg' ? 'Imported SVG.' : `Picture ${S.src.w} × ${S.src.h} px.`) : 'No picture yet.';
  syncInputs(); enterApp(); changed(); fit(); return true; }
function enterApp() { document.body.classList.remove('home'); requestAnimationFrame(() => { resize(); fit(); }); maybeHelp(); }
async function showHome() { document.body.classList.add('home'); await saveNow(); refreshHome(); if (window.PJ) { PJ.listUI(); PJ.syncSoon(1); } }
async function refreshHome() { try { const v = await DB.get('last'); $('homeResume').hidden = !v; if (v) $('homeResumeInfo').textContent = `${v.name || 'Untitled'} · ${new Date(v.saved || Date.now()).toLocaleString()}`; } catch (e) { $('homeResume').hidden = true; } }
$('homeResume').onclick = () => resume().catch(e => toast('Could not resume: ' + e.message));
$('homeBtn').onclick = showHome;
$('newBtn').onclick = async () => { await saveNow(); $('panelFile').click(); };
// ---------- help ----------
const HELP = [
  ['🖼️', 'Open a line drawing', 'Open a PNG/JPG line drawing or an SVG. Black lines are what the laser etches; the <b>red line</b> round the outside is where it cuts the piece out. Pick a tool at the bottom. <b>Two fingers</b> always move and zoom the picture; <b>⤢ Fit</b> re-centres it.'],
  ['✏️', 'The tools (tap one, tap again to put it away)', '<b>Select</b>: tap a line - the whole line turns blue - then <b>Delete line</b>, <b>Break</b> (tap where it stops and starts again), <b>Thickness</b> or the <b>ETCH | CUT</b> switch (CUT turns the whole connected shape into one cut line).<br><b>Point to point</b>: tap, tap, tap for straight lines; drag a line to bend it.<br><b>Draw</b>: draw a line with your finger.<br><b>Break</b>: tap two points - removes the bit between, or adds a line across a gap.<br><b>Eraser</b>: rub lines out, or tap one to remove it.<br><b>Thickness</b>: tap a line, slide to thicken, or make it a double line.<br><b>Cut out</b>: <i>✏ Draw the cut</i> is the usual way - drag your finger around the area; the red line follows you and closes when you let go. Drag the dots to adjust, then tap <i>✓ Make this a cut</i>. <i>➰ Lasso</i> is the same: the cut is the loop you drew. <i>👆 Tap an area</i> only works if that area is already a closed shape; otherwise it asks you to draw around it. Tap a red cut and <i>Make etch line</i> to undo one.<br><b>Trace edge</b>: set a Distance, tap a start and a finish on a line, and a new line is drawn alongside it. Swap side flips it; ETCH or CUT before you add it.<br><b>Clear space</b>: tap inside an area (e.g. a window pane) - it turns red. Tap more areas to add them, or drag a box. Tick <i>Include border lines</i> to remove the frame too. Then tap Clear.'],
  ['☰', 'Menu and Export', '<b>☰ Menu</b> holds the picture, trace, size, laser, sheet and <b>Add shape</b>. <b>Export</b> (top bar) makes the LaserGRBL files. <b>↶ Undo</b> undoes anything.'],
];
let helpI = 0;
function showHelp(i = 0) { helpI = i; const [ic, t, b] = HELP[i]; $('helpStep').innerHTML = `<div class="stepn">Step ${i + 1} of ${HELP.length}</div><div class="hpic">${ic}</div><h2>${t}</h2><p>${b}</p>`;
  $('helpBack').disabled = !i; $('helpNext').textContent = i === HELP.length - 1 ? 'Done' : 'Next ›'; $('help').hidden = false; }
function closeHelp() { $('help').hidden = true; try { localStorage.setItem('wp-help4', '1'); } catch (e) { /* */ } }
function maybeHelp() { if (!localStorage.getItem('wp-help4')) showHelp(0); }
$('helpNext').onclick = () => helpI < HELP.length - 1 ? showHelp(helpI + 1) : closeHelp(); $('helpBack').onclick = () => helpI && showHelp(helpI - 1); $('helpSkip').onclick = closeHelp;
$('helpBtn').onclick = () => showHelp(0); $('homeHelp').onclick = () => showHelp(0);
// ---------- install / offline ----------
let deferred = null;
window.addEventListener('beforeinstallprompt', e => { e.preventDefault(); deferred = e; $('installBtn').hidden = false; });
$('installBtn').onclick = async () => { if (!deferred) return; deferred.prompt(); await deferred.userChoice; deferred = null; $('installBtn').hidden = true; };
window.addEventListener('appinstalled', () => { $('installBtn').hidden = true; });
$('homeVer').textContent = 'Waylands Path ' + APP_VERSION + ' · works offline · new: Editing ETCH lines or CUT lines, and Send to Waylands Post. A saved v5.8 copy is still there if you need to go back. Draw the cut and Trace edge are unchanged'; $('verOut').textContent = APP_VERSION;
// ---------- updates: check on open and whenever the app comes back to the front; reload by itself when idle ----------
$('verTag').textContent = APP_VERSION;
let lastAct = Date.now(), updWant = null, updTimer = null;
['pointerdown', 'keydown', 'input'].forEach(ev => window.addEventListener(ev, () => { lastAct = Date.now(); }, true));
const busyNow = () => !!(gest || pinch || (window.T4 && (T4.PP.live || T4.BR.a || T4.CL.pts.length || T4.SL.mode)) || !$('busy').hidden || !$('help').hidden || (tool === 'line' && window.T2 && T2.LN && T2.LN.a));
async function doUpdate() { try { if (!document.body.classList.contains('home')) { await saveNow(); sessionStorage.setItem('wp-resume', '1'); } sessionStorage.setItem('wp-upd-for', updWant || '?'); } catch (e) { /* */ } location.reload(); }
function updateReady(v) { if (sessionStorage.getItem('wp-upd-for') === (v || '?') && v && v === APP_VERSION) return; updWant = v || updWant || 'new';
  if (sessionStorage.getItem('wp-upd-for') === updWant && updWant !== 'new') { $('updMsg').textContent = `Version ${updWant} is ready`; $('updBar').hidden = false; return; } // already reloaded once for it: no loop, just the banner
  $('updMsg').textContent = `New version${v ? ' ' + v : ''} ready`; $('updBar').hidden = false;
  if (document.body.classList.contains('home')) { doUpdate(); return; }
  clearInterval(updTimer); updTimer = setInterval(() => { if (!busyNow() && Date.now() - lastAct > 4000) { clearInterval(updTimer); doUpdate(); } }, 1000); }
$('updBtn').onclick = doUpdate;
async function checkVersion() { if (location.protocol === 'file:') return; try { const r = await fetch('version.json?t=' + Date.now(), { cache: 'no-store' }); if (!r.ok) return; const j = await r.json();
    if (j && j.v && j.v !== APP_VERSION) { if (window._reg) window._reg.update().catch(() => {}); updateReady(j.v); } } catch (e) { /* offline: fine */ } }
checkVersion(); document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'visible') { checkVersion(); if (window._reg) window._reg.update().catch(() => {}); } });
window.addEventListener('focus', () => checkVersion()); setInterval(checkVersion, 20 * 60 * 1000);
if ('serviceWorker' in navigator && location.protocol !== 'file:') window.addEventListener('load', () => {
  const had = !!navigator.serviceWorker.controller;
  navigator.serviceWorker.addEventListener('controllerchange', () => { if (had) checkVersion().then(() => { if ($('updBar').hidden) updateReady(null); }); });
  navigator.serviceWorker.register('sw.js', { updateViaCache: 'none' }).then(reg => { window._reg = reg; reg.update().catch(() => {});
    reg.addEventListener('updatefound', () => { const w = reg.installing; if (w) w.addEventListener('statechange', () => { if (w.state === 'installed' && navigator.serviceWorker.controller) w.postMessage('skip'); }); }); }).catch(err => console.warn('SW failed', err)); });
// after an update reload, carry straight on with the project
if (sessionStorage.getItem('wp-resume') === '1') { sessionStorage.removeItem('wp-resume'); setTimeout(() => resume().then(ok => { if (ok) toast(`Updated to ${APP_VERSION} - your project is just as you left it`, 3500); }).catch(() => {}), 50); }
window.addEventListener('resize', () => resize()); new ResizeObserver(() => resize()).observe($('stageWrap'));
window.addEventListener('pagehide', () => { saveNow(); }); document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'hidden') saveNow().then(() => { if (window.PJ) PJ.background(); }); });
// ---------- v4.6: a design sent from Wayland Forge (✏️ Send to Waylands Path). Forge leaves an SVG in true mm in storage both apps share
// (same website); it opens here as a new project with letters as outlines and Forge's cut lines as cuts. Laser export code is unchanged.

// ---------- v5.9 Wayland design file (.wayland.json) and Send to Wayland Forge ----------
function makeDesign() { const b = (typeof bbAll === 'function') ? bbAll() : (window.BZ && S.paths.length ? BZ.bbox(S.paths) : null);
  return WD.fromPath(S, { kmm: kmm(), bbox: b, version: APP_VERSION, isOuter: p => typeof isOuterCut === 'function' && isOuterCut(p) }); }
function downloadDesign(doc) { const blob = new Blob([WD.stringify(doc)], { type: 'application/json' }); const a = document.createElement('a'); a.href = URL.createObjectURL(blob); a.download = WD.fileName(doc); a.click(); setTimeout(() => URL.revokeObjectURL(a.href), 2000); }
function saveWaylandDesign() { if (!S.paths.length) { toast('No lines to save yet'); return; } const doc = makeDesign(); downloadDesign(doc); toast('Saved ' + WD.fileName(doc) + ' – you can open this in Wayland Forge or on another device', 3500); }
async function openWaylandDesign(doc) { if (!WD.isDesign(doc)) throw new Error('Not a Wayland design file');
  const forgeSvg = doc.apps && doc.apps['wayland-forge'] && doc.apps['wayland-forge'].svg;
  const st = WD.toPath(doc);
  if (st && Array.isArray(st.paths) && st.paths.length) {
    await saveNow(); startProject(st.name || doc.name || 'Untitled');
    const keepPid = S.pid; S = Object.assign(DEFAULTS(), st, { pid: keepPid, src: st.src || { kind: 'wayland-design' } });
    srcImg = srcEl = null; $('sec-trace').hidden = true; undoSt = []; redoSt = []; clearSel(); pen = null;
    syncInputs(); enterApp(); closeMenu(); changed(); fit(); await saveNow();
    toast('Opened Wayland design: ' + (S.name || 'Untitled'), 3000); return true;
  }
  if (forgeSvg) { return openFromForge({ svg: forgeSvg, name: doc.name, photos: doc.apps['wayland-forge'].photos || 0, W: doc.artboard && doc.artboard.width, H: doc.artboard && doc.artboard.height }); }
  toast('That Wayland design has no lines this app can edit yet', 4000); return false; }

async function sendToPost() { if (!S.paths.length) { toast('No lines to send yet'); return; }
  if (!confirm('Open this design in Waylands Post?\n\n• Post previews it and makes the laser or print files.\n• Your project here in Waylands Path is kept just as it is.\n• Your usual Export buttons here still work.\n• If you are sending it to a laptop, tap Cancel and use Save as Wayland design instead.')) return;
  const doc = makeDesign();
  try { await saveNow(); await FF.put('toPost', { v: 2, from: 'waylands-path', name: doc.name, design: doc, t: Date.now() }); }
  catch (e) { downloadDesign(doc); toast('Could not hand it over on this device, so the file was saved instead: ' + WD.fileName(doc), 4500); return; }
  location.href = new URL('../waylands-post/?from=path', location.href).href; }

async function sendToForge() { if (!S.paths.length) { toast('No lines to send yet'); return; }
  if (!confirm('Open this design in Wayland Forge?\n\n• It opens there as a new project, as lines you can place on a badge.\n• Your project here in Waylands Path is kept just as it is.\n• If you are sending it to a laptop, tap Cancel and use Save as Wayland design instead.')) return;
  const doc = makeDesign();
  try { await saveNow(); const rec = { v: 2, from: 'waylands-path', name: doc.name, design: doc, t: Date.now() }; await FF.put('toForge', rec); }
  catch (e) { downloadDesign(doc); toast('Could not hand it over on this device, so the file was saved instead: ' + WD.fileName(doc), 4500); return; }
  location.href = new URL('../wayland-forge/?from=path', location.href).href; }

const FF = { db() { return new Promise((ok, no) => { const r = indexedDB.open('wayland-share', 1); r.onupgradeneeded = () => { if (!r.result.objectStoreNames.contains('x')) r.result.createObjectStore('x'); }; r.onsuccess = () => ok(r.result); r.onerror = () => no(r.error); }); },
  async op(mode, fn) { const db = await FF.db(); try { return await new Promise((ok, no) => { const t = db.transaction('x', mode), q = fn(t.objectStore('x')); t.oncomplete = () => ok(q && q.result); t.onerror = () => no(t.error); }); } finally { db.close(); } },
  get() { return FF.op('readonly', st => st.get('toPath')).catch(() => null); }, clear() { return FF.op('readwrite', st => st.delete('toPath')).catch(() => null); },
  put(key, val) { return FF.op('readwrite', st => st.put(val, key)); }, getKey(key) { return FF.op('readonly', st => st.get(key)).catch(() => null); }, clearKey(key) { return FF.op('readwrite', st => st.delete(key)).catch(() => null); } };
async function openFromForge(rec) { if (rec && rec.design && WD.isDesign(rec.design) && rec.design.apps && rec.design.apps['waylands-path'] && rec.design.apps['waylands-path'].project) { return openWaylandDesign(rec.design); }
  if (!rec || !rec.svg) { if (rec && rec.design) return openWaylandDesign(rec.design); return false; } await saveNow();
  let r; try { r = SVGIN.importSVG(rec.svg); } catch (e) { toast('Could not open the design from Forge: ' + e.message, 5000); return false; }
  startProject(String(rec.name || 'Forge design').slice(0, 40)); S.src = { kind: 'svg', w: r.w, h: r.h }; $('sec-trace').hidden = true; srcImg = null; srcEl = null; S.paths = r.paths;
  if (r.mmW > 0) S.widthMm = Math.round(r.mmW * 100) / 100; const nc = r.paths.filter(p => p.cut).length; S.cutOn = nc > 0; await FF.clear();
  $('srcInfo').innerHTML = `From Wayland Forge: ${r.paths.length - nc} etch lines${nc ? ` and ${nc} cut line${nc > 1 ? 's' : ''}` : ''}, ${f1(S.widthMm)} mm wide, curves kept.${rec.photos ? ` <span class="warn">${rec.photos} photo${rec.photos > 1 ? 's' : ''} stayed in Forge.</span>` : ''}`;
  syncInputs(); enterApp(); closeMenu(); changed(); fit(); await saveNow();
  $('ffNote').innerHTML = `<b>${esc(S.name)}</b> came from Wayland Forge as a new project, ${f1(S.widthMm)} × ${f1(r.mmH)} mm.<br><br>Letters arrive as <b>outlines</b> - a line round each letter - not single lines. Edit them with the tools as usual.${nc ? '<br><br>Forge\'s cut lines show in red and stay cuts.' : ''}${rec.photos ? `<br><br>${rec.photos} photo${rec.photos > 1 ? 's' : ''} stayed in Forge - Waylands Path works with lines.` : ''}<br><br>Laser 0,0 is the bottom-left corner of the design. Your Forge design is unchanged.`;
  const d = $('ffDlg'); if (d.showModal) d.showModal(); else d.setAttribute('open', ''); return true; }
$('ffOk').onclick = () => $('ffDlg').close();
async function checkForge() { const rec = await FF.get(); const bar = $('ffWait'); if (!rec || (!rec.svg && !rec.design)) { if (bar) bar.hidden = true; return; }
  if (/[?&]from=forge\b/.test(location.search)) { history.replaceState(null, '', location.pathname); await openFromForge(rec); return; }
  if (bar) { bar.hidden = false; $('ffWaitName').textContent = rec.name || 'a design'; } }
$('ffOpen').onclick = async () => { $('ffWait').hidden = true; await openFromForge(await FF.get()); };
$('ffDrop').onclick = async () => { await FF.clear(); $('ffWait').hidden = true; };
syncInputs(); updStats(); updSkip(); refreshHome(); document.body.dataset.ready = '1';
setTimeout(() => checkForge().catch(e => console.warn(e)), 50);
window.WP = { photoLast, paint, makeDesign, openWaylandDesign, saveWaylandDesign, sendToForge, sendToPost, overlayFile, get paintN() { return paintN; }, holeCount, innerCuts, hasOuterCut, isOuterCut, noteCutGone, checkVersion, updateReady, busyNow, openMenu, closeMenu, makeCut, get tool() { return tool; }, get S() { return S; }, set paths(v) { S.paths = v; }, get sel() { return sel; }, get act() { return act; }, view, retrace, fit, setTool, toU, kmm, undo, redo, openFile, resume, saveNow, DB, buildOut, changed, skipOver, continueAcross, deleteStretch, extendEnd, closeGapsAll, removeOverlaps, makeCut, hitPath, ACT, nudge, keepSegs, splitAtNodes, get lw() { return lw; }, get editKind() { return editKind; }, setEditKind, inLayer, EDIT_TOOLS, syncEditLayerUI };
