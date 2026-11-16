// Waylands Path v3 - app: open a line drawing or SVG, trace, edit Bezier paths (simple Inkscape-style node tool), laser export, save.
'use strict';
const APP_VERSION = 'v3';
const $ = id => document.getElementById(id);
const esc = s => String(s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]);
const f1 = v => (Math.round(v * 10) / 10).toString();
// ---------- state ----------
const DEFAULTS = () => ({ name: 'Untitled', paths: [], src: null, trace: { detail: 5, corners: 5, invert: false, straighten: true },
  widthMm: 150, lineMm: 0.3, cutOn: true, cutOff: 3, gapMm: 1.5, shortMm: 2, showPhoto: true, saved: 0, ver: 3 });
let S = DEFAULTS(), srcImg = null, srcEl = null, undoSt = [], redoSt = [], tool = 'move';
let sel = new Set(), act = new Set(), lastTap = null, pen = null, skip = { mode: 'skip', first: -1 }, delMode = 'stretch', lw = 0;
const view = { s: 1, tx: 0, ty: 0 };
const cv = $('stage'), ctx = cv.getContext('2d');
const toast = (msg, ms = 2600) => { const t = $('toast'); t.textContent = msg; t.hidden = false; clearTimeout(toast.h); toast.h = setTimeout(() => { t.hidden = true; }, ms); };
const snap = () => BZ.clone(S.paths);
function pushUndo() { undoSt.push(snap()); if (undoSt.length > 50) undoSt.shift(); redoSt = []; updUndo(); }
function undo() { if (!undoSt.length) return; redoSt.push(snap()); S.paths = undoSt.pop(); pen = null; clearSel(); changed(); }
function redo() { if (!redoSt.length) return; undoSt.push(snap()); S.paths = redoSt.pop(); pen = null; clearSel(); changed(); }
function updUndo() { $('undoBtn').disabled = !undoSt.length; $('redoBtn').disabled = !redoSt.length; }
const etch = () => S.paths.filter(p => !p.cut), cuts = () => S.paths.filter(p => p.cut);
const bbAll = () => BZ.bbox(S.paths);
// mm per design unit: Width = the whole design (etch lines + cut line)
const kmm = () => { const b = bbAll(); return b && b.w > 0 ? S.widthMm / b.w : 1; };
function clearSel() { sel.clear(); act.clear(); lastTap = null; skip.first = -1; }
function changed(opts = {}) { if (!opts.keepSel) { sel.clear(); } else pruneSel(); updSel(); updUndo(); updStats(); draw(); saveSoon(); exSummary(); cutInfo(); }
function pruneSel() { for (const k of [...sel]) { const [pi, j] = k.split(':').map(Number); if (!S.paths[pi] || j >= S.paths[pi].n.length) sel.delete(k); } for (const pi of [...act]) if (!S.paths[pi]) act.delete(pi); }
// ---------- burn settings (per device, like Wayland Forge) ----------
const BURN_KEY = 'wp-burn1';
let BURN = (() => { let sv = null; try { sv = JSON.parse(localStorage.getItem(BURN_KEY) || 'null'); } catch (e) { sv = null; }
  const o = {}; for (const k of ['engrave', 'cut']) o[k] = Object.assign({}, LZ.DEF[k], (sv && sv[k]) || {}); return o; })();
const burnOf = k => { const j = BURN[k], d = LZ.DEF[k], P = +j.P, F = +j.F;
  return { mode: LZ.TAG[j.mode] ? j.mode : d.mode, P: P > 0 ? Math.min(100, Math.max(0.1, Math.round(P * 10) / 10)) : d.P, F: F > 0 ? Math.round(F * 10) / 10 : d.F, passes: Math.min(10, Math.max(1, Math.round(+j.passes || 1))) }; };
const smax = () => { const v = +$('smax').value; return v > 0 ? v : 1000; };
const STEP_NAME = { engrave: 'Engrave lines', cut: 'Cut outside' }, lzOpen = new Set();
const cutActive = () => S.cutOn && cuts().length > 0;
function lzUI() { const keys = cutActive() ? ['engrave', 'cut'] : ['engrave'];
  $('lzSteps').innerHTML = keys.map((k, i) => { const b = burnOf(k);
    return `<details class="lzacc" data-acc="${k}"${lzOpen.has(k) ? ' open' : ''}><summary><span>Step ${i + 1} – ${STEP_NAME[k]}</span><span class="lzsum" data-sum="${k}">${sumOf(k)}</span></summary><div class="lzcb">
      <label class="full">Mode <select data-bj="${k}" data-bf="mode">${LZ.MODES.map(([v, t]) => `<option value="${v}"${b.mode === v ? ' selected' : ''}>${t}</option>`).join('')}</select></label>
      <label>Power % <input type="number" inputmode="decimal" min="0.1" max="100" step="any" data-bj="${k}" data-bf="P" value="${b.P}"></label>
      <label>Speed <input type="number" inputmode="decimal" min="1" step="any" data-bj="${k}" data-bf="F" value="${b.F}"></label>
      <label>Passes <input type="number" inputmode="numeric" min="1" max="10" step="1" data-bj="${k}" data-bf="passes" value="${b.passes}"></label>
      <label class="full"><span class="hint">${k === 'cut' ? 'Vector follows the grey cut line. Line To Line / Dithering scan it row by row instead.' : 'Vector follows each line once, laser off between lines. Line To Line / Dithering scan the lines row by row at the line width.'}</span></label></div></details>`; }).join('');
  exSummary(); }
const sumOf = k => { const b = burnOf(k); return `${LZ.TAG[b.mode]} ${b.P}% · ${b.F}${b.passes > 1 ? ` · ×${b.passes}` : ''}`; };
$('lzSteps').addEventListener('change', e => { const k = e.target.dataset.bj, f = e.target.dataset.bf; if (!k || !f) return;
  if (f === 'mode') BURN[k].mode = e.target.value; else { const v = +e.target.value; if (!(v > 0)) { e.target.value = burnOf(k)[f]; return; } BURN[k][f] = v; e.target.value = burnOf(k)[f]; }
  try { localStorage.setItem(BURN_KEY, JSON.stringify(BURN)); } catch (er) { /* */ }
  document.querySelectorAll(`[data-sum="${k}"]`).forEach(x => { x.textContent = sumOf(k); }); exSummary(); });
$('lzSteps').addEventListener('toggle', e => { const d = e.target; if (!d.dataset || !d.dataset.acc) return; if (d.open) lzOpen.add(d.dataset.acc); else lzOpen.delete(d.dataset.acc); }, true);
$('smax').value = localStorage.getItem('wp-smax') || 1000; $('smax').addEventListener('change', () => { localStorage.setItem('wp-smax', smax()); exSummary(); });
// ---------- view / drawing ----------
function resize() { const r = cv.getBoundingClientRect(), d = window.devicePixelRatio || 1; cv.width = Math.max(1, Math.round(r.width * d)); cv.height = Math.max(1, Math.round(r.height * d)); draw(); }
function fit() { const r = cv.getBoundingClientRect(), pad = 16; let bb = S.src && S.src.w ? { x0: 0, y0: 0, x1: S.src.w, y1: S.src.h } : null; const pb = bbAll();
  if (pb) bb = bb ? { x0: Math.min(bb.x0, pb.x0), y0: Math.min(bb.y0, pb.y0), x1: Math.max(bb.x1, pb.x1), y1: Math.max(bb.y1, pb.y1) } : pb; if (!bb) bb = { x0: 0, y0: 0, x1: 1000, y1: 1000 };
  const w = bb.x1 - bb.x0, h = bb.y1 - bb.y0; view.s = Math.min((r.width - 2 * pad) / Math.max(w, 1), (r.height - 2 * pad - 24) / Math.max(h, 1)); view.tx = (r.width - w * view.s) / 2 - bb.x0 * view.s; view.ty = 24 + (r.height - 24 - h * view.s) / 2 - bb.y0 * view.s; draw(); }
const toU = (x, y) => [(x - view.tx) / view.s, (y - view.ty) / view.s];
let drawQ = false, overlay = null;
function draw() { if (drawQ) return; drawQ = true; requestAnimationFrame(() => { drawQ = false; paint(); }); }
function tracePath(p) { const n = p.n; if (!n.length) return; ctx.moveTo(n[0].x, n[0].y); for (let k = 0; k < BZ.nseg(p); k++) { const s = BZ.seg(p, k); if (s.line) ctx.lineTo(s.b.x, s.b.y); else ctx.bezierCurveTo(s.C[1][0], s.C[1][1], s.C[2][0], s.C[2][1], s.b.x, s.b.y); } if (p.z) ctx.closePath(); }
function paint() { const d = window.devicePixelRatio || 1, W = cv.width, H = cv.height; ctx.setTransform(1, 0, 0, 1, 0, 0); ctx.fillStyle = '#f6f2ea'; ctx.fillRect(0, 0, W, H);
  ctx.setTransform(d * view.s, 0, 0, d * view.s, d * view.tx, d * view.ty); const px = 1 / view.s;
  if (S.src && S.src.w) { ctx.fillStyle = '#fff'; ctx.fillRect(0, 0, S.src.w, S.src.h); if (srcEl && S.showPhoto) { ctx.globalAlpha = 0.25; ctx.drawImage(srcEl, 0, 0, S.src.w, S.src.h); ctx.globalAlpha = 1; }
    ctx.strokeStyle = '#d8d0c2'; ctx.lineWidth = px; ctx.strokeRect(0, 0, S.src.w, S.src.h); }
  ctx.lineCap = ctx.lineJoin = 'round';
  // grey edge = the cut line (dashed when cutting is switched off)
  ctx.strokeStyle = S.cutOn ? 'rgba(120,120,120,0.9)' : 'rgba(150,150,150,0.6)'; ctx.lineWidth = 3.2 * px; ctx.setLineDash(S.cutOn ? [] : [8 * px, 6 * px]);
  ctx.beginPath(); S.paths.forEach(p => { if (p.cut) tracePath(p); }); ctx.stroke(); ctx.setLineDash([]);
  ctx.strokeStyle = '#151515'; ctx.lineWidth = 1.6 * px; ctx.beginPath(); S.paths.forEach(p => { if (!p.cut) tracePath(p); }); ctx.stroke();
  // highlighted paths (active in Nodes, first pick in Skip)
  const hi = new Set(act); if (tool === 'skip' && skip.first >= 0) hi.add(skip.first); if (pen && S.paths[pen.pi]) hi.add(pen.pi);
  if (hi.size) { ctx.strokeStyle = tool === 'skip' ? '#e8590c' : '#1971c2'; ctx.lineWidth = 2.4 * px; ctx.beginPath(); for (const pi of hi) if (S.paths[pi]) tracePath(S.paths[pi]); ctx.stroke(); }
  if (tool === 'nodes' || tool === 'pen') paintNodes(px, hi);
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
  $('stats').textContent = S.paths.length ? `${e.length} lines · ${BZ.countNodes(e)} points${c.length ? ` · cut ${BZ.countNodes(c)} points` : ''} · ${b ? `${f1(S.widthMm)} × ${f1(b.h * k)} mm` : ''}` : '';
  $('empty').hidden = !!(S.src || S.paths.length); $('heightOut').textContent = b ? f1(b.h * k) + ' mm' : '–';
  $('tidyCount').textContent = S.paths.length ? `${e.length} lines, ${BZ.countNodes(e)} points.` : 'Nothing yet.'; }
// ---------- cut line ----------
function cutInfo() { const el = $('cutInfo'); if (!el) return; const c = cuts();
  el.innerHTML = !c.length ? '<span class="warn">No cut line yet. Tap <b>Make cut line</b> to put one around the lines.</span>' : `${c.length > 1 ? `<span class="warn">${c.length} separate cut lines.</span> ` : 'The grey line is the cut. '}${S.cutOn ? 'It burns as its own step after the engraving.' : 'Cutting is switched off - only the engraving is exported.'} Edit it with the Nodes tool like any other line.`; lzUI(); }
function makeCut() { const e = etch(); if (!e.length) { toast('No lines to go around yet.'); return; } const ab = BZ.bbox(e), k = kmm(), offU = S.cutOff / k, brU = Math.max(4, S.cutOff) / k, lineU = S.lineMm / k, pad = offU + brU + lineU * 2 + 2 / k;
  const s = 1100 / Math.max(ab.w + 2 * pad, ab.h + 2 * pad), w = Math.ceil((ab.w + 2 * pad) * s) + 2, h = Math.ceil((ab.h + 2 * pad) * s) + 2, ox = ab.x0 - pad, oy = ab.y0 - pad;
  const c = document.createElement('canvas'); c.width = w; c.height = h; const g = c.getContext('2d'); g.fillStyle = '#fff'; g.fillRect(0, 0, w, h); g.strokeStyle = '#000'; g.lineWidth = Math.max(1.5, lineU * s); g.lineCap = g.lineJoin = 'round'; g.beginPath();
  for (const p of e) { const f = BZ.flatten(p, 0.5 / s); g.moveTo((f[0][0] - ox) * s, (f[0][1] - oy) * s); for (let i = 1; i < f.length; i++) g.lineTo((f[i][0] - ox) * s, (f[i][1] - oy) * s); }
  g.stroke(); const id = g.getImageData(0, 0, w, h).data, m = new Uint8Array(w * h); for (let i = 0; i < m.length; i++) m[i] = id[i * 4] < 160 ? 1 : 0;
  const loops = T.outerCut(m, w, h, offU * s, brU * s).map(l => l.map(([x, y]) => [x / s + ox, y / s + oy]));
  if (!loops.length) { toast('Could not make a cut line.'); return; } pushUndo(); S.paths = e.concat(loops.map(l => Object.assign(BZ.fromPolyline(l, { closed: true, tol: 0.6 / s, arm: 4 / s, corner: 40 }), { cut: true }))); S.cutOn = true; syncInputs(); changed(); toast('Cut line made - drag its points with Nodes to adjust.'); }
// ---------- tracing ----------
let worker = null, wid = 0, traceT = null; try { worker = new Worker('js/worker.js'); } catch (e) { worker = null; }
const pending = new Map();
if (worker) worker.onmessage = e => { const f = pending.get(e.data.id); if (f) { pending.delete(e.data.id); f(e.data); } };
function runTrace(img, opts) { return new Promise(res => { if (worker) { const id = ++wid; pending.set(id, res); worker.postMessage({ id, img, opts }); }
  else setTimeout(() => { try { res(T.lineArt(img, opts)); } catch (err) { res({ error: String(err.message || err) }); } }, 10); }); }
let traceSeq = 0;
async function retrace(record = true) { if (!srcImg) return; const seq = ++traceSeq; $('busy').hidden = false;
  const r = await runTrace(srcImg, S.trace); if (seq !== traceSeq) return; $('busy').hidden = true;
  if (r.error) { toast('Tracing failed: ' + r.error, 4000); return; } if (record) pushUndo(); lw = r.lw || 0;
  S.paths = r.paths; clearSel(); pen = null;
  const nc = r.paths.filter(p => p.cut).length;
  $('traceInfo').innerHTML = `${r.paths.length - nc} lines, ${r.nodes} points, drawn line ≈ ${f1(r.lw)} px wide${r.darkBg ? ', light shapes on a dark background' : ''}. ${nc ? 'Grey cut line found around the design.' : '<span class="warn">No outside edge found.</span>'}${r.gaps ? ` Closed ${r.gaps} small gap${r.gaps > 1 ? 's' : ''}.` : ''}${r.parts > 1 ? ` <span class="warn">${r.parts - 1} part(s) sit apart from the main design and are outside the cut line.</span>` : ''}`;
  changed(); }
function traceSoon() { clearTimeout(traceT); traceT = setTimeout(() => retrace(true), 160); }
// ---------- opening files ----------
async function openFile(file) { if (!file) return; const isSvg = /svg/i.test(file.type) || /\.svg$/i.test(file.name), name = file.name.replace(/\.[^.]+$/, '').slice(0, 40) || 'Untitled';
  try { if (isSvg) { const r = SVGIN.importSVG(await file.text()); startProject(name); S.src = { kind: 'svg', w: r.w, h: r.h }; srcImg = null; srcEl = null; S.paths = r.paths; S.cutOn = false;
      const sk = []; if (r.info.skippedWhite) sk.push(`${r.info.skippedWhite} white background shape${r.info.skippedWhite > 1 ? 's' : ''}`); if (r.info.skippedText) sk.push(`${r.info.skippedText} text item(s) (convert text to paths first)`); if (r.info.skippedUse) sk.push(`${r.info.skippedUse} linked symbol(s)`);
      $('srcInfo').innerHTML = `SVG: ${r.paths.length} lines from ${r.info.shapes} shapes, curves kept.${sk.length ? `<br><span class="warn">Skipped ${sk.join(', ')}.</span>` : ''}`;
      syncInputs(); enterApp(); openSec('sec-size'); changed(); fit(); toast(`Opened ${r.paths.length} lines from the SVG`); return; }
    const el = await loadImage(file), sc = Math.min(1, 1600 / Math.max(el.width, el.height)), w = Math.max(1, Math.round(el.width * sc)), h = Math.max(1, Math.round(el.height * sc));
    const alphaOk = /png|gif|webp/i.test(file.type), c = document.createElement('canvas'); c.width = w; c.height = h; const g = c.getContext('2d'); if (!alphaOk) { g.fillStyle = '#fff'; g.fillRect(0, 0, w, h); } g.drawImage(el, 0, 0, w, h);
    const url = c.toDataURL(alphaOk ? 'image/png' : 'image/jpeg', 0.92);
    startProject(name); S.src = { kind: 'image', w, h, url }; await setSource(url); $('srcInfo').textContent = `${file.name} · ${w} × ${h} px.`;
    enterApp(); openSec('sec-trace'); fit(); await retrace(false); fit(); }
  catch (e) { console.error(e); toast(e.message || 'Could not open that file.', 4000); } }
function loadImage(file) { return new Promise((res, rej) => { const u = URL.createObjectURL(file), im = new Image(); im.onload = () => res(im); im.onerror = () => rej(new Error('That picture could not be opened. Try a JPG or PNG.')); im.src = u; }); }
function setSource(url) { return new Promise((res, rej) => { const im = new Image(); im.onload = () => { srcEl = im; const c = document.createElement('canvas'); c.width = S.src.w; c.height = S.src.h; const g = c.getContext('2d'); g.drawImage(im, 0, 0, S.src.w, S.src.h);
  const d = g.getImageData(0, 0, S.src.w, S.src.h); srcImg = { data: d.data, w: S.src.w, h: S.src.h }; res(); }; im.onerror = rej; im.src = url; }); }
function startProject(name) { const keep = { widthMm: S.widthMm, lineMm: S.lineMm, cutOff: S.cutOff, gapMm: S.gapMm, shortMm: S.shortMm, showPhoto: S.showPhoto, trace: Object.assign({}, S.trace) };
  S = Object.assign(DEFAULTS(), keep, { name }); undoSt = []; redoSt = []; clearSel(); pen = null; syncInputs(); }
['homeFile', 'stageFile', 'panelFile'].forEach(id => $(id).addEventListener('change', e => { const f = e.target.files[0]; e.target.value = ''; openFile(f); }));
// ---------- inputs ----------
function syncInputs() { $('nameBtn').textContent = (S.name || 'Untitled') + ' ✎'; $('detail').value = S.trace.detail; $('detailOut').textContent = S.trace.detail; $('corners').value = S.trace.corners; $('cornersOut').textContent = S.trace.corners;
  $('invert').checked = !!S.trace.invert; $('straighten').checked = S.trace.straighten !== false; $('showPhoto').checked = S.showPhoto; $('widthMm').value = S.widthMm; $('lineMm').value = S.lineMm;
  $('cutOn').checked = S.cutOn; $('cutOff').value = S.cutOff; $('gapMm').value = S.gapMm; $('shortMm').value = S.shortMm; $('sec-trace').hidden = !(S.src && S.src.kind === 'image'); lzUI(); cutInfo(); }
$('detail').addEventListener('input', e => { S.trace.detail = +e.target.value; $('detailOut').textContent = S.trace.detail; traceSoon(); });
$('corners').addEventListener('input', e => { S.trace.corners = +e.target.value; $('cornersOut').textContent = S.trace.corners; traceSoon(); });
$('invert').addEventListener('change', e => { S.trace.invert = e.target.checked; traceSoon(); });
$('straighten').addEventListener('change', e => { S.trace.straighten = e.target.checked; traceSoon(); });
$('retraceBtn').onclick = () => retrace(true);
$('showPhoto').addEventListener('change', e => { S.showPhoto = e.target.checked; draw(); saveSoon(); });
const numIn = (id, key, lo, hi, after) => $(id).addEventListener('change', e => { const v = +e.target.value; if (!(v >= lo && v <= hi)) { e.target.value = S[key]; toast(`Use a number from ${lo} to ${hi}`); return; } S[key] = v; if (after) after(); saveSoon(); });
numIn('widthMm', 'widthMm', 5, 2000, () => { updStats(); exSummary(); }); numIn('lineMm', 'lineMm', 0.05, 5, exSummary); numIn('cutOff', 'cutOff', 0, 50); numIn('gapMm', 'gapMm', 0.1, 20); numIn('shortMm', 'shortMm', 0.1, 100);
$('cutOn').addEventListener('change', e => { S.cutOn = e.target.checked; cutInfo(); draw(); saveSoon(); exSummary(); });
$('makeCutBtn').onclick = makeCut;
$('nameBtn').onclick = () => { const n = prompt('Project name (used in the file names)', S.name); if (n && n.trim()) { S.name = n.trim().slice(0, 40); syncInputs(); saveSoon(); } };
function openSec(id) { document.querySelectorAll('#panel details[name=acc]').forEach(d => { d.open = d.id === id; }); }
// ---------- geometry helpers on the whole drawing ----------
const pkey = (pi, j) => pi + ':' + j, unkey = k => k.split(':').map(Number);
const same = (a, b) => Math.abs(a.x - b.x) < 1e-3 && Math.abs(a.y - b.y) < 1e-3;
function linked(pi, j) { const nd = S.paths[pi].n[j], out = []; S.paths.forEach((p, qi) => p.n.forEach((m, k) => { if ((qi !== pi || k !== j) && same(m, nd)) out.push(m); })); return out; }
const isEnd = (p, j) => !p.z && (j === 0 || j === p.n.length - 1);
function hitNode(u, tolU, only) { let best = null, bd = tolU; const list = only ? [...only] : S.paths.map((_, i) => i);
  for (const pi of list) { const p = S.paths[pi]; if (!p) continue; p.n.forEach((nd, j) => { const d = Math.hypot(nd.x - u[0], nd.y - u[1]); if (d < bd) { bd = d; best = { pi, j }; } }); } return best; }
function hitHandle(u, tolU) { let best = null, bd = tolU; for (const h of handleList()) { const q = S.paths[h.pi].n[h.j][h.side], d = Math.hypot(q[0] - u[0], q[1] - u[1]); if (d < bd) { bd = d; best = h; } } return best; }
function hitPath(u, tolU, skipIdx = -1) { let best = null; S.paths.forEach((p, pi) => { if (pi === skipIdx || !p.n.length) return; const bb = BZ.bbox([p]); if (!bb || u[0] < bb.x0 - tolU || u[0] > bb.x1 + tolU || u[1] < bb.y0 - tolU || u[1] > bb.y1 + tolU) return;
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
function selectLine() { const pis = act.size ? [...act] : [...selByPath().keys()]; if (!pis.length) { toast('Tap a line first'); return; } for (const pi of pis) S.paths[pi].n.forEach((_, j) => sel.add(pkey(pi, j))); updSel(); draw(); }
function updSel() { const n = sel.size; $('selInfo').textContent = n ? `${n} point${n > 1 ? 's' : ''} picked` : act.size ? 'Line picked - tap a point, or drag a box round several' : 'Tap a line to show its points';
  document.querySelectorAll('[data-needsel]').forEach(b => { b.classList.toggle('dim', !n && !lastTap); }); }
// ---------- Delete tool: tap a line, it goes up to the junctions either side ----------
function isJunction(pi, j) { return linked(pi, j).length > 0; }
function deleteStretch(h) { const p = S.paths[h.pi], m = BZ.nseg(p); if (delMode === 'whole') { pushUndo(); S.paths.splice(h.pi, 1); clearSel(); changed(); toast('Line deleted'); return; }
  const del = new Set([h.k]); let a = h.k; while (true) { if (!p.z && a === 0) break; if (isJunction(h.pi, a)) break; const pk = (a - 1 + m) % m; if (del.has(pk)) break; del.add(pk); a = pk; }
  let b = h.k; while (true) { const nj = (b + 1) % p.n.length; if (!p.z && nj === p.n.length - 1) break; if (isJunction(h.pi, nj)) break; const nk = (b + 1) % m; if (del.has(nk)) break; del.add(nk); b = nk; }
  pushUndo(); replacePath(h.pi, keepSegs(p, del)); clearSel(); changed(); toast('Removed up to the junctions - Undo brings it back'); }
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
function setTool(t) { if (tool === 'pen' && t !== 'pen') penDone(); tool = t; document.querySelectorAll('#tools .tool').forEach(b => b.classList.toggle('on', b.dataset.tool === t));
  document.querySelectorAll('#toolOpts .topts').forEach(o => { o.hidden = !o.dataset.opts.split(' ').includes(t); }); if (t !== 'nodes') { sel.clear(); act.clear(); lastTap = null; } skip.first = -1; updSel(); updSkip(); cv.style.cursor = t === 'move' ? 'grab' : 'crosshair'; draw(); }
document.querySelectorAll('#tools .tool').forEach(b => b.onclick = () => setTool(b.dataset.tool));
$('delStretch').onclick = () => { delMode = 'stretch'; $('delStretch').classList.add('on'); $('delWhole').classList.remove('on'); $('delTip').textContent = 'Tap a line: it is removed up to the junction each side.'; };
$('delWhole').onclick = () => { delMode = 'whole'; $('delWhole').classList.add('on'); $('delStretch').classList.remove('on'); $('delTip').textContent = 'Tap a line: the whole line is removed.'; };
const ACT = { nCorner: () => nodeType(false), nSmooth: () => nodeType(true), nLine: () => segType(true), nCurve: () => segType(false), nAdd: addNode, nDel: delNodes, nBreak: breakNodes, nJoin: joinNodes, nSeg: delSegs, nStraight: straighten, nAll: selectLine };
for (const id in ACT) $(id).onclick = ACT[id];
document.querySelectorAll('[data-nudge]').forEach(b => b.onclick = () => { const [x, y] = b.dataset.nudge.split(',').map(Number), st = +$('nudgeMm').value || 0.5; nudge(x * st, y * st); });
// ---------- gestures (one finger edits; two fingers always move/zoom) ----------
const ptrs = new Map(); let gest = null, pinch = null, lastTapT = 0, lastTapU = null;
function cvPt(e) { const r = cv.getBoundingClientRect(); return [e.clientX - r.left, e.clientY - r.top]; }
cv.addEventListener('pointerdown', e => { try { cv.setPointerCapture(e.pointerId); } catch (er) { /* */ } ptrs.set(e.pointerId, cvPt(e));
  if (ptrs.size === 2) { cancelGesture(); const [a, b] = [...ptrs.values()]; pinch = { d: Math.hypot(a[0] - b[0], a[1] - b[1]), c: [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2], s: view.s, tx: view.tx, ty: view.ty }; return; }
  if (ptrs.size > 2) return; const p = cvPt(e), u = toU(p[0], p[1]); gest = startGesture(e, p, u); });
cv.addEventListener('pointermove', e => { if (!ptrs.has(e.pointerId)) return; ptrs.set(e.pointerId, cvPt(e));
  if (pinch && ptrs.size >= 2) { const [a, b] = [...ptrs.values()], d = Math.hypot(a[0] - b[0], a[1] - b[1]), c = [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2], k = Math.max(0.05, Math.min(80, pinch.s * d / Math.max(1, pinch.d))) / pinch.s;
    view.s = pinch.s * k; view.tx = c[0] - (pinch.c[0] - pinch.tx) * k; view.ty = c[1] - (pinch.c[1] - pinch.ty) * k; draw(); return; }
  if (gest) moveGesture(gest, cvPt(e), e); });
const up = e => { ptrs.delete(e.pointerId); if (pinch) { if (ptrs.size < 2) pinch = null; return; } if (gest) { const g = gest; gest = null; endGesture(g, e); } };
cv.addEventListener('pointerup', up); cv.addEventListener('pointercancel', e => { ptrs.delete(e.pointerId); cancelGesture(); pinch = null; });
cv.addEventListener('wheel', e => { e.preventDefault(); const p = cvPt(e), k = Math.exp(-e.deltaY * 0.0015), ns = Math.max(0.05, Math.min(80, view.s * k)), kk = ns / view.s; view.tx = p[0] - (p[0] - view.tx) * kk; view.ty = p[1] - (p[1] - view.ty) * kk; view.s = ns; draw(); }, { passive: false });
function startGesture(e, p, u) { const base = { p0: p, u0: u, moved: false, snap: null };
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
  if (g.kind === 'pan') { view.tx = g.tx + p[0] - g.p0[0]; view.ty = g.ty + p[1] - g.p0[1]; draw(); return; }
  if (g.kind === 'tap') { view.tx = g.tx + p[0] - g.p0[0]; view.ty = g.ty + p[1] - g.p0[1]; draw(); return; }
  if (g.kind === 'pen') { penDrag(g, u); return; }
  if (g.kind === 'nodes') { const dx = u[0] - g.last[0], dy = u[1] - g.last[1]; g.last = u; for (const m of g.moving) BZ.moveNode(m, dx, dy); draw(); return; }
  if (g.kind === 'handle') { const nd = S.paths[g.h.pi].n[g.h.j], q = nd[g.h.side]; q[0] = u[0]; q[1] = u[1]; const oth = g.h.side === 'i' ? 'o' : 'i';
    if (nd.s && nd[oth]) { const L = Math.hypot(nd[oth][0] - nd.x, nd[oth][1] - nd.y), v = [nd.x - u[0], nd.y - u[1]], l = Math.hypot(v[0], v[1]) || 1; nd[oth] = [nd.x + v[0] / l * L, nd.y + v[1] / l * L]; } draw(); return; }
  if (g.kind === 'seg') { S.paths = BZ.clone(g.snap); const p2 = S.paths[g.h.pi]; BZ.bend(p2, g.h.k, g.h.t, u[0] - g.u0[0], u[1] - g.u0[1]); act = new Set([g.h.pi]); draw(); return; }
  if (g.kind === 'box') { overlay = { box: [g.u0, u] }; draw(); } }
function endGesture(g, e) { overlay = null; const u = g.last || g.u0;
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
function cancelGesture() { if (!gest) return; if (gest.snap && gest.moved) { S.paths = gest.snap; } if (gest.kind === 'pan' || gest.kind === 'tap') { view.tx = gest.tx; view.ty = gest.ty; } gest = null; overlay = null; draw(); }
window.addEventListener('keydown', e => { if (/input|select|textarea/i.test((e.target.tagName || ''))) return; const z = (e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'z';
  if (z && !e.shiftKey) { e.preventDefault(); undo(); return; } if ((e.ctrlKey || e.metaKey) && (e.key.toLowerCase() === 'y' || (z && e.shiftKey))) { e.preventDefault(); redo(); return; }
  if (tool === 'pen' && (e.key === 'Enter' || e.key === 'Escape')) { penDone(); return; }
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
function buildOut() { return LZ.build({ name: S.name, art: etch(), cut: cutActive() ? cuts() : [], widthMm: S.widthMm, burn: { engrave: burnOf('engrave'), cut: burnOf('cut') }, smax: smax(), lineMm: S.lineMm, pxmm: 10 }); }
function exSummary() { const el = $('exSummary'); if (!el) return; if (!etch().length) { el.textContent = 'Open a picture first.'; return; } const k = kmm(), b = bbAll();
  el.innerHTML = `Design ${f1(S.widthMm)} × ${f1(b.h * k)} mm. Files: <b>1 Engrave lines</b> (${sumOf('engrave')})${cutActive() ? ` + <b>2 Cut outside</b> (${sumOf('cut')})` : ''}, plus an SVG in mm and a read-me. All steps share the same 0,0 (bottom-left), so they line up in LaserGRBL. The laser is switched off for every move between lines.`; }
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
// ---------- save / resume (IndexedDB) ----------
const DB = { db: null, open() { return this.db || (this.db = new Promise((res, rej) => { const r = indexedDB.open('waylands-path', 1); r.onupgradeneeded = () => r.result.createObjectStore('p'); r.onsuccess = () => res(r.result); r.onerror = () => rej(r.error); })); },
  async put(k, v) { const db = await this.open(); return new Promise((res, rej) => { const t = db.transaction('p', 'readwrite'); t.objectStore('p').put(v, k); t.oncomplete = res; t.onerror = () => rej(t.error); }); },
  async get(k) { const db = await this.open(); return new Promise((res, rej) => { const r = db.transaction('p').objectStore('p').get(k); r.onsuccess = () => res(r.result); r.onerror = () => rej(r.error); }); } };
let saveT = null;
function saveSoon() { clearTimeout(saveT); saveT = setTimeout(saveNow, 600); }
async function saveNow() { if (!S.src && !S.paths.length) return; S.saved = Date.now(); try { await DB.put('last', JSON.parse(JSON.stringify(S))); $('saveInfo').textContent = 'Saved on this device ' + new Date(S.saved).toLocaleTimeString(); } catch (e) { $('saveInfo').textContent = 'Could not save on this device: ' + e.message; } }
// v1/v2 projects stored plain point lists: turn them into Bezier paths
function migrate(v) { if (Array.isArray(v.paths) && v.paths.length && Array.isArray(v.paths[0])) v.paths = v.paths.filter(p => p.length > 1).map(p => BZ.fromPolyline(p, { tol: 0.6, arm: 4, corner: 35, closed: p.length > 3 && Math.hypot(p[0][0] - p[p.length - 1][0], p[0][1] - p[p.length - 1][1]) < 0.01 })).filter(Boolean);
  v.trace = Object.assign(DEFAULTS().trace, { detail: (v.trace && v.trace.detail) || 5 }); if (v.ver !== 3) { v.cutOn = false; v.ver = 3; } return v; }
async function resume() { const v = await DB.get('last'); if (!v) return false; S = Object.assign(DEFAULTS(), migrate(v)); undoSt = []; redoSt = []; srcImg = srcEl = null; clearSel(); pen = null;
  if (S.src && S.src.kind === 'image' && S.src.url) await setSource(S.src.url); $('srcInfo').textContent = S.src ? (S.src.kind === 'svg' ? 'Imported SVG.' : `Picture ${S.src.w} × ${S.src.h} px.`) : 'No picture yet.';
  syncInputs(); enterApp(); changed(); fit(); return true; }
function enterApp() { document.body.classList.remove('home'); requestAnimationFrame(() => { resize(); fit(); }); maybeHelp(); }
async function showHome() { document.body.classList.add('home'); await saveNow(); refreshHome(); }
async function refreshHome() { try { const v = await DB.get('last'); $('homeResume').hidden = !v; if (v) $('homeResumeInfo').textContent = `${v.name || 'Untitled'} · ${new Date(v.saved || Date.now()).toLocaleString()}`; } catch (e) { $('homeResume').hidden = true; } }
$('homeResume').onclick = () => resume().catch(e => toast('Could not resume: ' + e.message));
$('homeBtn').onclick = showHome;
$('newBtn').onclick = async () => { await saveNow(); $('panelFile').click(); };
// ---------- help ----------
const HELP = [
  ['🖼️', 'Open a line drawing', 'Open a PNG or JPG line drawing (like AI line art or a colouring page) or an SVG. Waylands Path traces one clean line down the middle of every drawn line, and puts a <b>grey line</b> round the outside: that is your <b>cut line</b>.'],
  ['⦿', 'Fix points with Nodes', 'Tap a line to show its points. Drag a point, or drag the middle of a line to bend it. Pick a point to get its curve handles. Buttons: <b>Sharp / Smooth</b>, <b>Straight / Curve</b>, <b>+ Point / − Point</b>, <b>Break / Join</b>, <b>Delete piece</b>. Double-tap a line to add a point.'],
  ['✒️', 'Pen and Delete', '<b>Pen</b>: tap for sharp points, press and drag for curves, tap the first point to close, then <b>Done</b>. <b>Delete</b>: tap a line and it goes, up to the junction each side.'],
  ['⤫', 'Skip over an obstacle', '<b>Skip</b> › <b>Skip over</b>: tap a line, then the shape it should pass behind (a window, ring, strap). The line stops exactly at the edge and carries on, in line, on the other side. <b>Continue across</b> joins two pieces in line and stops them at anything in the way.'],
  ['🔥', 'Size and laser', 'Set the <b>Width</b> of the finished piece in mm, then <b>Share</b> or <b>Save laser zip</b>. Engraving burns first, then the cut. Every jump between lines is laser-off. In LaserGRBL open each .nc file and press Start - they line up by themselves.']];
let helpI = 0;
function showHelp(i = 0) { helpI = i; const [ic, t, b] = HELP[i]; $('helpStep').innerHTML = `<div class="stepn">Step ${i + 1} of ${HELP.length}</div><div class="hpic">${ic}</div><h2>${t}</h2><p>${b}</p>`;
  $('helpBack').disabled = !i; $('helpNext').textContent = i === HELP.length - 1 ? 'Done' : 'Next ›'; $('help').hidden = false; }
function closeHelp() { $('help').hidden = true; try { localStorage.setItem('wp-help3', '1'); } catch (e) { /* */ } }
function maybeHelp() { if (!localStorage.getItem('wp-help3')) showHelp(0); }
$('helpNext').onclick = () => helpI < HELP.length - 1 ? showHelp(helpI + 1) : closeHelp(); $('helpBack').onclick = () => helpI && showHelp(helpI - 1); $('helpSkip').onclick = closeHelp;
$('helpBtn').onclick = () => showHelp(0); $('homeHelp').onclick = () => showHelp(0);
// ---------- install / offline ----------
let deferred = null;
window.addEventListener('beforeinstallprompt', e => { e.preventDefault(); deferred = e; $('installBtn').hidden = false; });
$('installBtn').onclick = async () => { if (!deferred) return; deferred.prompt(); await deferred.userChoice; deferred = null; $('installBtn').hidden = true; };
window.addEventListener('appinstalled', () => { $('installBtn').hidden = true; });
$('homeVer').textContent = 'Waylands Path ' + APP_VERSION + ' · works offline · new: clean line tracing, Inkscape-style points, Skip over'; $('verOut').textContent = APP_VERSION;
$('updBtn').onclick = () => location.reload();
if ('serviceWorker' in navigator && location.protocol !== 'file:') window.addEventListener('load', () => {
  const had = !!navigator.serviceWorker.controller;
  navigator.serviceWorker.addEventListener('controllerchange', () => { if (had) $('updBar').hidden = false; });
  navigator.serviceWorker.register('sw.js', { updateViaCache: 'none' }).then(reg => { const chk = () => reg.update().catch(() => {}); chk(); setInterval(chk, 30 * 60 * 1000);
    document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'visible') chk(); });
    reg.addEventListener('updatefound', () => { const w = reg.installing; if (w) w.addEventListener('statechange', () => { if (w.state === 'installed' && navigator.serviceWorker.controller) $('updBar').hidden = false; }); }); }).catch(err => console.warn('SW failed', err)); });
window.addEventListener('resize', () => resize()); new ResizeObserver(() => resize()).observe($('stageWrap'));
window.addEventListener('pagehide', () => { saveNow(); });
syncInputs(); updStats(); updSkip(); refreshHome(); document.body.dataset.ready = '1';
window.WP = { get S() { return S; }, set paths(v) { S.paths = v; }, get sel() { return sel; }, get act() { return act; }, view, retrace, fit, setTool, toU, kmm, undo, redo, openFile, resume, saveNow, DB, buildOut, changed, skipOver, continueAcross, deleteStretch, extendEnd, closeGapsAll, removeOverlaps, makeCut, hitPath, ACT, nudge, keepSegs, splitAtNodes, get lw() { return lw; } };
