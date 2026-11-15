// Waylands Path - app: open, trace, edit, size, laser export, save.
'use strict';
const APP_VERSION = 'v1';
const $ = id => document.getElementById(id);
const esc = s => String(s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]);
const f1 = v => (Math.round(v * 10) / 10).toString();
// ---------- state ----------
const DEFAULTS = () => ({ name: 'Untitled', paths: [], src: null, trace: { detail: 5, specks: 3, mode: 'lines', kind: 'auto', invert: false },
  widthMm: 150, lineMm: 0.3, cutOn: false, cutOff: 3, joinMm: 1.5, shortMm: 2, showPhoto: true, saved: 0 });
let S = DEFAULTS(), srcImg = null, srcEl = null, cut = [], undoSt = [], redoSt = [], tool = 'move', eraseMode = 'tap';
const view = { s: 1, tx: 0, ty: 0 };
const cv = $('stage'), ctx = cv.getContext('2d');
const toast = (msg, ms = 2600) => { const t = $('toast'); t.textContent = msg; t.hidden = false; clearTimeout(toast.h); toast.h = setTimeout(() => { t.hidden = true; }, ms); };
const clonePaths = p => p.map(q => q.map(([x, y]) => [x, y]));
function pushUndo() { undoSt.push(clonePaths(S.paths)); if (undoSt.length > 40) undoSt.shift(); redoSt = []; updUndo(); }
function undo() { if (!undoSt.length) return; redoSt.push(clonePaths(S.paths)); S.paths = undoSt.pop(); changed(); }
function redo() { if (!redoSt.length) return; undoSt.push(clonePaths(S.paths)); S.paths = redoSt.pop(); changed(); }
function updUndo() { $('undoBtn').disabled = !undoSt.length; $('redoBtn').disabled = !redoSt.length; }
// mm per design unit (artwork width -> Width mm)
const kmm = () => { const b = G.bbox(S.paths); return b && b.w > 0 ? S.widthMm / b.w : 1; };
function changed(opts = {}) { updUndo(); updStats(); if (!opts.noCut) cutSoon(); draw(); saveSoon(); }
// ---------- burn settings (per device, like Wayland Forge) ----------
const BURN_KEY = 'wp-burn1';
let BURN = (() => { let sv = null; try { sv = JSON.parse(localStorage.getItem(BURN_KEY) || 'null'); } catch (e) { sv = null; }
  const o = {}; for (const k of ['engrave', 'cut']) o[k] = Object.assign({}, LZ.DEF[k], (sv && sv[k]) || {}); return o; })();
const burnOf = k => { const j = BURN[k], d = LZ.DEF[k], P = +j.P, F = +j.F;
  return { mode: LZ.TAG[j.mode] ? j.mode : d.mode, P: P > 0 ? Math.min(100, Math.max(0.1, Math.round(P * 10) / 10)) : d.P, F: F > 0 ? Math.round(F * 10) / 10 : d.F, passes: Math.min(10, Math.max(1, Math.round(+j.passes || 1))) }; };
const smax = () => { const v = +$('smax').value; return v > 0 ? v : 1000; };
const STEP_NAME = { engrave: 'Engrave lines', cut: 'Cut outside' }, lzOpen = new Set();
function lzUI() { const keys = S.cutOn ? ['engrave', 'cut'] : ['engrave'];
  $('lzSteps').innerHTML = keys.map((k, i) => { const b = burnOf(k);
    return `<details class="lzacc" data-acc="${k}"${lzOpen.has(k) ? ' open' : ''}><summary><span>Step ${i + 1} – ${STEP_NAME[k]}</span><span class="lzsum" data-sum="${k}">${sumOf(k)}</span></summary><div class="lzcb">
      <label class="full">Mode <select data-bj="${k}" data-bf="mode">${LZ.MODES.map(([v, t]) => `<option value="${v}"${b.mode === v ? ' selected' : ''}>${t}</option>`).join('')}</select></label>
      <label>Power % <input type="number" inputmode="decimal" min="0.1" max="100" step="any" data-bj="${k}" data-bf="P" value="${b.P}"></label>
      <label>Speed <input type="number" inputmode="decimal" min="1" step="any" data-bj="${k}" data-bf="F" value="${b.F}"></label>
      <label>Passes <input type="number" inputmode="numeric" min="1" max="10" step="1" data-bj="${k}" data-bf="passes" value="${b.passes}"></label>
      <label class="full"><span class="hint">${k === 'cut' ? 'Vector follows the cut line. Line To Line / Dithering scan it row by row instead.' : 'Vector follows each line once. Line To Line / Dithering scan the lines row by row at the line width.'}</span></label></div></details>`; }).join('');
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
const contentBox = () => { if (S.src && S.src.w) return { x0: 0, y0: 0, w: S.src.w, h: S.src.h }; const b = G.bbox(S.paths.concat(cut)); return b || { x0: 0, y0: 0, w: 1000, h: 1000 }; };
function fit() { const r = cv.getBoundingClientRect(), b = contentBox(), pad = 16; let bb = b; const pb = G.bbox(S.paths.concat(cut));
  if (pb) { const x0 = Math.min(b.x0, pb.x0), y0 = Math.min(b.y0, pb.y0), x1 = Math.max(b.x0 + b.w, pb.x1), y1 = Math.max(b.y0 + b.h, pb.y1); bb = { x0, y0, w: x1 - x0, h: y1 - y0 }; }
  view.s = Math.min((r.width - 2 * pad) / Math.max(bb.w, 1), (r.height - 2 * pad - 24) / Math.max(bb.h, 1)); view.tx = (r.width - bb.w * view.s) / 2 - bb.x0 * view.s; view.ty = 24 + (r.height - 24 - bb.h * view.s) / 2 - bb.y0 * view.s; draw(); }
const toU = (x, y) => [(x - view.tx) / view.s, (y - view.ty) / view.s];
let drawQ = false, overlay = null;
function draw() { if (drawQ) return; drawQ = true; requestAnimationFrame(() => { drawQ = false; paint(); }); }
function paint() { const d = window.devicePixelRatio || 1, W = cv.width, H = cv.height; ctx.setTransform(1, 0, 0, 1, 0, 0); ctx.fillStyle = '#f6f2ea'; ctx.fillRect(0, 0, W, H);
  ctx.setTransform(d * view.s, 0, 0, d * view.s, d * view.tx, d * view.ty); const px = 1 / view.s;
  if (S.src && S.src.w) { ctx.fillStyle = '#fff'; ctx.fillRect(0, 0, S.src.w, S.src.h); if (srcEl && S.showPhoto) { ctx.globalAlpha = 0.28; ctx.drawImage(srcEl, 0, 0, S.src.w, S.src.h); ctx.globalAlpha = 1; }
    ctx.strokeStyle = '#d8d0c2'; ctx.lineWidth = px; ctx.strokeRect(0, 0, S.src.w, S.src.h); }
  const k = kmm(), lw = Math.max(1.4 * px, S.lineMm / k);
  ctx.lineCap = ctx.lineJoin = 'round'; ctx.strokeStyle = '#1a1612'; ctx.lineWidth = lw; ctx.beginPath();
  for (const p of S.paths) { ctx.moveTo(p[0][0], p[0][1]); if (p.length === 1) ctx.lineTo(p[0][0] + px * 0.1, p[0][1]); for (let i = 1; i < p.length; i++) ctx.lineTo(p[i][0], p[i][1]); } ctx.stroke();
  if (S.cutOn && cut.length) { ctx.strokeStyle = '#d23a2a'; ctx.lineWidth = 2 * px; ctx.setLineDash([8 * px, 5 * px]); ctx.beginPath();
    for (const p of cut) { ctx.moveTo(p[0][0], p[0][1]); for (let i = 1; i < p.length; i++) ctx.lineTo(p[i][0], p[i][1]); } ctx.stroke(); ctx.setLineDash([]); }
  if (tool === 'join' || tool === 'draw') { ctx.fillStyle = '#e0a043'; ctx.beginPath(); const r = (tool === 'join' ? 4 : 2.5) * px;
    for (const p of S.paths) { if (p.length < 2 || G.isClosed(p, 1e-6)) continue; for (const q of [p[0], p[p.length - 1]]) { ctx.moveTo(q[0] + r, q[1]); ctx.arc(q[0], q[1], r, 0, 7); } } ctx.fill(); }
  if (overlay) overlay(ctx, px); }
function updStats() { const n = S.paths.length, b = G.bbox(S.paths), k = kmm();
  $('stats').textContent = n ? `${n} path${n === 1 ? '' : 's'} · ${f1(S.widthMm)} × ${f1(b.h * k)} mm` : 'No lines yet';
  $('heightOut').textContent = b ? `${f1(b.h * k)} mm` : '–'; $('tidyCount').textContent = `${n} path${n === 1 ? '' : 's'} (separate lines) in the design.`;
  $('empty').hidden = !!(S.src || n); exSummary(); }
// ---------- outer cut ----------
let cutT = null;
function cutSoon() { clearTimeout(cutT); if (!S.cutOn) { cut = []; $('cutInfo').textContent = ''; return; } cutT = setTimeout(computeCut, 250); }
function computeCut() { cut = []; const ab = G.bbox(S.paths); if (!S.cutOn || !ab) { draw(); return; }
  const k = kmm(), offU = S.cutOff / k, brU = Math.max(4, S.cutOff) / k, lineU = S.lineMm / k, pad = offU + brU + lineU * 2 + 2 / k;
  const s = 1100 / Math.max(ab.w + 2 * pad, ab.h + 2 * pad), w = Math.ceil((ab.w + 2 * pad) * s) + 2, h = Math.ceil((ab.h + 2 * pad) * s) + 2, ox = ab.x0 - pad, oy = ab.y0 - pad;
  const c = document.createElement('canvas'); c.width = w; c.height = h; const g = c.getContext('2d'); g.fillStyle = '#fff'; g.fillRect(0, 0, w, h);
  g.strokeStyle = '#000'; g.lineWidth = Math.max(1.5, lineU * s); g.lineCap = g.lineJoin = 'round'; g.beginPath();
  for (const p of S.paths) { g.moveTo((p[0][0] - ox) * s, (p[0][1] - oy) * s); for (let i = 1; i < p.length; i++) g.lineTo((p[i][0] - ox) * s, (p[i][1] - oy) * s); if (p.length === 1) g.lineTo((p[0][0] - ox) * s + 0.5, (p[0][1] - oy) * s); }
  g.stroke(); const id = g.getImageData(0, 0, w, h).data, m = new Uint8Array(w * h); for (let i = 0; i < m.length; i++) m[i] = id[i * 4] < 160 ? 1 : 0;
  const loops = T.outerCut(m, w, h, offU * s, brU * s);
  cut = loops.map(p => G.rdp(G.chaikin(G.rdp(p, 0.6), 2), 0.3).map(([x, y]) => [x / s + ox, y / s + oy]));
  $('cutInfo').innerHTML = cut.length > 1 ? `<span class="warn">${cut.length} separate cut outlines – parts of the design are far apart.</span>` : cut.length ? `One closed cut line, ${f1(S.cutOff)} mm outside the lines. Burns as its own step after the engraving.` : '';
  draw(); exSummary(); }
// ---------- tracing ----------
let worker = null, wid = 0, traceT = null; try { worker = new Worker('js/worker.js'); } catch (e) { worker = null; }
const pending = new Map();
if (worker) { worker.onmessage = e => { const cb = pending.get(e.data.id); pending.delete(e.data.id); if (cb) cb(e.data); }; worker.onerror = () => { worker = null; }; }
function runTrace(img, opts) { return new Promise(res => { if (worker) { const id = ++wid; pending.set(id, res); worker.postMessage({ id, img, opts }); }
  else { setTimeout(() => { try { const r = T.trace(img, opts); res(r); } catch (e) { res({ error: e.message }); } }, 0); } }); }
let traceSeq = 0;
async function retrace(record = true) { if (!srcImg) return; const seq = ++traceSeq; $('busy').hidden = false; const t0 = performance.now();
  const r = await runTrace(srcImg, { detail: S.trace.detail, specks: S.trace.specks, mode: S.trace.mode, kind: S.trace.kind, invert: S.trace.invert ? true : 'auto' });
  if (seq !== traceSeq) return; $('busy').hidden = true; if (r.error) { toast('Trace failed: ' + r.error); return; }
  if (record && S.paths.length) pushUndo(); S.paths = r.paths;
  $('traceInfo').textContent = `${r.paths.length} lines · read as a ${r.photo ? 'photo (edges become lines)' : 'drawing / logo'}${r.inverted ? ', inverted' : ''} · ${Math.round(performance.now() - t0)} ms`;
  changed(); }
function traceSoon() { clearTimeout(traceT); traceT = setTimeout(() => retrace(true), 140); }
// ---------- opening files ----------
async function openFile(file) { if (!file) return; const isSvg = /svg/i.test(file.type) || /\.svg$/i.test(file.name), name = file.name.replace(/\.[^.]+$/, '').slice(0, 40) || 'Untitled';
  try { if (isSvg) { const r = SVGIN.importSVG(await file.text()); startProject(name); S.src = { kind: 'svg', w: r.w, h: r.h }; srcImg = null; srcEl = null; S.paths = r.paths;
      const sk = []; if (r.info.skippedWhite) sk.push(`${r.info.skippedWhite} white background shape${r.info.skippedWhite > 1 ? 's' : ''}`); if (r.info.skippedText) sk.push(`${r.info.skippedText} text item(s) (convert text to paths first)`); if (r.info.skippedUse) sk.push(`${r.info.skippedUse} linked symbol(s)`);
      $('srcInfo').innerHTML = `SVG: ${r.paths.length} lines from ${r.info.shapes} shapes, transforms applied.${sk.length ? `<br><span class="warn">Skipped ${sk.join(', ')}.</span>` : ''}`;
      enterApp(); openSec('sec-tidy'); changed(); fit(); toast(`Opened ${r.paths.length} lines from the SVG`); return; }
    const el = await loadImage(file), sc = Math.min(1, 1600 / Math.max(el.width, el.height)), w = Math.max(1, Math.round(el.width * sc)), h = Math.max(1, Math.round(el.height * sc));
    const c = document.createElement('canvas'); c.width = w; c.height = h; const g = c.getContext('2d'); g.fillStyle = '#fff'; g.fillRect(0, 0, w, h); g.drawImage(el, 0, 0, w, h);
    const url = c.toDataURL(/png|gif|webp/i.test(file.type) && w * h < 1.6e6 ? 'image/png' : 'image/jpeg', 0.92);
    startProject(name); S.src = { kind: 'image', w, h, url }; await setSource(url); $('srcInfo').textContent = `${file.name} · ${w} × ${h} px (transparent areas count as white).`;
    enterApp(); openSec('sec-trace'); fit(); await retrace(false); fit(); }
  catch (e) { console.error(e); toast(e.message || 'Could not open that file.', 4000); } }
function loadImage(file) { return new Promise((res, rej) => { const u = URL.createObjectURL(file), im = new Image(); im.onload = () => res(im); im.onerror = () => rej(new Error('That picture could not be opened. Try a JPG or PNG.')); im.src = u; }); }
function setSource(url) { return new Promise((res, rej) => { const im = new Image(); im.onload = () => { srcEl = im; const c = document.createElement('canvas'); c.width = S.src.w; c.height = S.src.h; const g = c.getContext('2d'); g.drawImage(im, 0, 0, S.src.w, S.src.h);
  const d = g.getImageData(0, 0, S.src.w, S.src.h); srcImg = { data: d.data, w: S.src.w, h: S.src.h }; res(); }; im.onerror = rej; im.src = url; }); }
function startProject(name) { const keep = { widthMm: S.widthMm, lineMm: S.lineMm, cutOn: S.cutOn, cutOff: S.cutOff, joinMm: S.joinMm, shortMm: S.shortMm, showPhoto: S.showPhoto, trace: Object.assign({}, S.trace) };
  S = Object.assign(DEFAULTS(), keep, { name }); cut = []; undoSt = []; redoSt = []; syncInputs(); }
['homeFile', 'stageFile', 'panelFile'].forEach(id => $(id).addEventListener('change', e => { const f = e.target.files[0]; e.target.value = ''; openFile(f); }));
// ---------- inputs ----------
function syncInputs() { $('nameBtn').textContent = (S.name || 'Untitled') + ' ✎'; $('detail').value = S.trace.detail; $('detailOut').textContent = S.trace.detail; $('specks').value = S.trace.specks; $('specksOut').textContent = S.trace.specks;
  $('kind').value = S.trace.kind; $('invert').checked = !!S.trace.invert; $('modeLines').classList.toggle('on', S.trace.mode !== 'outline'); $('modeOutline').classList.toggle('on', S.trace.mode === 'outline');
  $('widthMm').value = S.widthMm; $('lineMm').value = S.lineMm; $('cutOn').checked = S.cutOn; $('cutOff').value = S.cutOff; $('cutBox').hidden = !S.cutOn; $('joinMm').value = S.joinMm; $('shortMm').value = S.shortMm; $('showPhoto').checked = S.showPhoto;
  $('sec-trace').hidden = !!(S.src && S.src.kind === 'svg'); lzUI(); updUndo(); }
$('detail').addEventListener('input', e => { S.trace.detail = +e.target.value; $('detailOut').textContent = S.trace.detail; traceSoon(); });
$('specks').addEventListener('input', e => { S.trace.specks = +e.target.value; $('specksOut').textContent = S.trace.specks; traceSoon(); });
$('kind').addEventListener('change', e => { S.trace.kind = e.target.value; traceSoon(); });
$('invert').addEventListener('change', e => { S.trace.invert = e.target.checked; traceSoon(); });
$('modeLines').onclick = () => { S.trace.mode = 'lines'; syncInputs(); traceSoon(); };
$('modeOutline').onclick = () => { S.trace.mode = 'outline'; syncInputs(); traceSoon(); };
$('showPhoto').addEventListener('change', e => { S.showPhoto = e.target.checked; draw(); saveSoon(); });
const numIn = (id, key, lo, hi, after) => $(id).addEventListener('change', e => { const v = +e.target.value; if (!(v >= lo && v <= hi)) { e.target.value = S[key]; toast(`Enter ${lo}–${hi}`); return; } S[key] = v; if (after) after(); saveSoon(); });
numIn('widthMm', 'widthMm', 5, 2000, () => changed()); numIn('lineMm', 'lineMm', 0.05, 5, () => changed()); numIn('cutOff', 'cutOff', 0.5, 50, () => cutSoon());
numIn('joinMm', 'joinMm', 0.05, 20); numIn('shortMm', 'shortMm', 0.05, 100);
$('cutOn').addEventListener('change', e => { S.cutOn = e.target.checked; $('cutBox').hidden = !S.cutOn; lzUI(); cutSoon(); draw(); saveSoon(); });
$('nameBtn').onclick = () => { const n = prompt('Project name (used in the file names)', S.name); if (n && n.trim()) { S.name = n.trim().slice(0, 40); syncInputs(); saveSoon(); } };
function openSec(id) { document.querySelectorAll('#panel details').forEach(d => { d.open = d.id === id; }); }
// ---------- tidy tools ----------
function smoothAll() { if (!S.paths.length) return; pushUndo(); const before = S.paths.reduce((a, p) => a + p.length, 0); S.paths = G.smoothAll(S.paths, 0.06 / kmm());
  const after = S.paths.reduce((a, p) => a + p.length, 0); $('tidyOut').textContent = `Smoothed. ${before} → ${after} points.`; changed(); }
function joinGaps() { if (!S.paths.length) return; const tol = S.joinMm / kmm(), r = G.joinEnds(S.paths, tol); if (!r.joins) { toast(`No gaps under ${S.joinMm} mm to join.`); $('tidyOut').textContent = `No gaps under ${S.joinMm} mm.`; return; }
  pushUndo(); const n0 = S.paths.length; S.paths = r.paths; $('tidyOut').textContent = `Joined ${r.joins} gap${r.joins > 1 ? 's' : ''}: ${n0} → ${S.paths.length} paths.`; toast($('tidyOut').textContent); changed(); }
function removeShort() { const k = kmm(), keep = S.paths.filter(p => G.len(p) * k >= S.shortMm), n = S.paths.length - keep.length;
  if (!n) { toast(`No paths shorter than ${S.shortMm} mm.`); return; } pushUndo(); S.paths = keep; $('tidyOut').textContent = `Removed ${n} stray bit${n > 1 ? 's' : ''} under ${S.shortMm} mm.`; toast($('tidyOut').textContent); changed(); }
$('smoothBtn').onclick = smoothAll; $('joinAuto').onclick = joinGaps; $('joinAuto2').onclick = joinGaps; $('shortBtn').onclick = removeShort;
// ---------- editing tools (pointer) ----------
document.querySelectorAll('[data-tool]').forEach(b => b.onclick = () => setTool(b.dataset.tool));
function setTool(t) { tool = t; document.querySelectorAll('[data-tool]').forEach(b => b.classList.toggle('on', b.dataset.tool === t)); document.querySelectorAll('[data-opts]').forEach(o => { o.hidden = o.dataset.opts !== t; }); draw(); }
function setErase(m) { eraseMode = m; $('eraseTap').classList.toggle('on', m === 'tap'); $('eraseBrush').classList.toggle('on', m === 'brush'); $('brushWrap').hidden = m !== 'brush';
  $('eraseTip').textContent = m === 'tap' ? 'Tap a line to delete it. Drag moves the view.' : 'Rub over the parts to remove.'; }
$('eraseTap').onclick = () => setErase('tap'); $('eraseBrush').onclick = () => setErase('brush');
const ptrs = new Map(); let gest = null, pinch = null, lockout = false;
const pos = e => { const r = cv.getBoundingClientRect(); return [e.clientX - r.left, e.clientY - r.top]; };
function nearestEnd(u, tolU, skip) { let best = null, bd = tolU * tolU;
  S.paths.forEach((p, i) => { if (p.length < 2 || G.isClosed(p, 1e-6) || p === skip) return; for (const q of [p[0], p[p.length - 1]]) { const d = G.d2(u, q); if (d < bd) { bd = d; best = q; } } }); return best; }
function addAndMerge(newPath) { S.paths.push(newPath); const r = G.joinEnds(S.paths, 1e-6, { turnWeight: 0 }); S.paths = r.paths; }
function startGesture(e, p) { const u = toU(...p), panBtn = e.pointerType === 'mouse' && (e.button === 1 || e.button === 2);
  if (panBtn || tool === 'move' || !S.paths && tool !== 'draw') return { kind: 'pan', last: p };
  if (tool === 'erase' && eraseMode === 'tap') return { kind: 'tap', start: p, last: p, t: performance.now(), moved: 0 };
  if (tool === 'erase') { const g = { kind: 'brush', snap: clonePaths(S.paths), changed: false, lastU: u }; brushAt(g, u); return g; }
  if (tool === 'draw') return { kind: 'draw', pts: [u], start: p };
  if (tool === 'join') return { kind: 'join', a: u, b: u, start: p };
  return { kind: 'pan', last: p }; }
function brushAt(g, u) { const r = (+$('brushSize').value / 2) / view.s, L = G.dist(g.lastU, u), n = Math.max(1, Math.ceil(L / (r / 2)));
  for (let i = 1; i <= n || i === 1; i++) { const t = n ? i / n : 1, c = [g.lastU[0] + (u[0] - g.lastU[0]) * t, g.lastU[1] + (u[1] - g.lastU[1]) * t]; const res = G.eraseCircle(S.paths, c, r); if (res.changed) { S.paths = res.paths; g.changed = true; } if (i >= n) break; }
  g.lastU = u; g.cur = u; overlay = (c, px) => { c.strokeStyle = '#2a7de1'; c.lineWidth = 2 * px; c.beginPath(); c.arc(u[0], u[1], r, 0, 7); c.stroke(); }; updStats(); draw(); }
function moveGesture(g, p) { const u = toU(...p);
  if (g.kind === 'pan') { view.tx += p[0] - g.last[0]; view.ty += p[1] - g.last[1]; g.last = p; draw(); }
  else if (g.kind === 'tap') { g.moved = Math.max(g.moved, Math.hypot(p[0] - g.start[0], p[1] - g.start[1])); if (g.moved > 10) { view.tx += p[0] - g.last[0]; view.ty += p[1] - g.last[1]; draw(); } g.last = p; }
  else if (g.kind === 'brush') brushAt(g, u);
  else if (g.kind === 'draw') { const q = g.pts[g.pts.length - 1]; if (G.dist(q, u) * view.s >= 1.5) g.pts.push(u);
    overlay = (c, px) => { c.strokeStyle = '#2a7de1'; c.lineWidth = 2.5 * px; c.lineCap = 'round'; c.beginPath(); c.moveTo(g.pts[0][0], g.pts[0][1]); g.pts.forEach(q => c.lineTo(q[0], q[1])); c.stroke(); }; draw(); }
  else if (g.kind === 'join') { g.b = u; const tol = 30 / view.s, ea = nearestEnd(g.a, tol), eb = nearestEnd(u, tol);
    overlay = (c, px) => { const a = ea || g.a, b = eb || u; c.strokeStyle = '#2a7de1'; c.lineWidth = 2.5 * px; c.setLineDash([6 * px, 4 * px]); c.beginPath(); c.moveTo(a[0], a[1]); c.lineTo(b[0], b[1]); c.stroke(); c.setLineDash([]);
      c.fillStyle = '#2a7de1'; for (const q of [ea, eb]) if (q) { c.beginPath(); c.arc(q[0], q[1], 7 * px, 0, 7); c.fill(); } }; draw(); } }
function endGesture(g) { overlay = null;
  if (g.kind === 'tap') { if (g.moved <= 10 && performance.now() - g.t < 700) { const i = G.hit(S.paths, toU(...g.start), 14 / view.s); if (i >= 0) { pushUndo(); S.paths.splice(i, 1); changed(); toast('Line removed · Undo to bring it back', 1600); } else toast('No line there – zoom in or tap right on a line', 1600); } }
  else if (g.kind === 'brush') { if (g.changed) { undoSt.push(g.snap); if (undoSt.length > 40) undoSt.shift(); redoSt = []; changed(); } }
  else if (g.kind === 'draw') { if (g.pts.length > 2 && G.len(g.pts) * view.s > 6) { let p = G.rdp(g.pts, 0.8 / view.s); p = G.rdp(G.chaikin(p, 2), 0.3 / view.s);
      const tol = 16 / view.s, a = nearestEnd(p[0], tol), b = nearestEnd(p[p.length - 1], tol); if (a) p[0] = a.slice(); if (b) p[p.length - 1] = b.slice();
      pushUndo(); addAndMerge(p); changed(); } }
  else if (g.kind === 'join') { const tol = 30 / view.s, a = nearestEnd(g.a, tol), b = nearestEnd(g.b, tol), A = a || g.a, B = b || g.b;
    if (G.dist(A, B) * view.s > 3 || (a && b && a !== b)) { pushUndo(); addAndMerge([A.slice(), B.slice()]); changed(); toast(a && b ? 'Ends joined' : 'Line added (no loose end found at one side)', 1600); } }
  draw(); }
function cancelGesture() { if (!gest) return; if (gest.kind === 'brush' && gest.changed) { S.paths = gest.snap; changed(); } gest = null; overlay = null; draw(); }
cv.addEventListener('contextmenu', e => e.preventDefault());
cv.addEventListener('pointerdown', e => { e.preventDefault(); try { cv.setPointerCapture(e.pointerId); } catch (er) { /* synthetic or ended pointer */ } const p = pos(e); ptrs.set(e.pointerId, p);
  if (ptrs.size === 2) { cancelGesture(); const [a, b] = [...ptrs.values()]; pinch = { d: Math.hypot(a[0] - b[0], a[1] - b[1]) || 1, m: [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2], s: view.s, tx: view.tx, ty: view.ty }; lockout = true; return; }
  if (ptrs.size > 2 || lockout) return; gest = startGesture(e, p); });
cv.addEventListener('pointermove', e => { if (!ptrs.has(e.pointerId)) return; const p = pos(e); ptrs.set(e.pointerId, p);
  if (pinch && ptrs.size >= 2) { const [a, b] = [...ptrs.values()], d = Math.hypot(a[0] - b[0], a[1] - b[1]) || 1, m = [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2];
    const s = Math.min(200, Math.max(0.02, pinch.s * d / pinch.d)); const ux = (pinch.m[0] - pinch.tx) / pinch.s, uy = (pinch.m[1] - pinch.ty) / pinch.s;
    view.s = s; view.tx = m[0] - ux * s; view.ty = m[1] - uy * s; draw(); return; }
  if (gest) moveGesture(gest, p); });
const up = e => { if (!ptrs.has(e.pointerId)) return; ptrs.delete(e.pointerId);
  if (pinch) { if (ptrs.size < 2) pinch = null; if (!ptrs.size) lockout = false; return; }
  if (!ptrs.size) { lockout = false; if (gest) { const g = gest; gest = null; if (e.type === 'pointercancel') { cancelGesture(); } else endGesture(g); } } };
cv.addEventListener('pointerup', up); cv.addEventListener('pointercancel', e => { if (gest && gest.kind === 'brush' && gest.changed) { S.paths = gest.snap; gest.changed = false; changed(); } up(e); });
cv.addEventListener('wheel', e => { e.preventDefault(); const p = pos(e), f = Math.exp(-e.deltaY * 0.0015), s = Math.min(200, Math.max(0.02, view.s * f)); const u = toU(...p); view.s = s; view.tx = p[0] - u[0] * s; view.ty = p[1] - u[1] * s; draw(); }, { passive: false });
document.addEventListener('keydown', e => { if (e.target.matches('input,select,textarea')) return; const k = e.key.toLowerCase();
  if ((e.ctrlKey || e.metaKey) && k === 'z' && !e.shiftKey) { e.preventDefault(); undo(); } else if ((e.ctrlKey || e.metaKey) && (k === 'y' || (k === 'z' && e.shiftKey))) { e.preventDefault(); redo(); } });
$('undoBtn').onclick = undo; $('redoBtn').onclick = redo; $('fitBtn').onclick = fit;
// ---------- export ----------
function buildOut() { if (S.cutOn && !cut.length && S.paths.length) computeCut(); return LZ.build({ name: S.name, art: S.paths, cut: S.cutOn ? cut : [], widthMm: S.widthMm, burn: { engrave: burnOf('engrave'), cut: burnOf('cut') }, smax: smax(), lineMm: S.lineMm, pxmm: 10 }); }
function exSummary() { const el = $('exSummary'); if (!el) return; if (!S.paths.length) { el.textContent = 'Open a picture first.'; return; } const k = kmm(), b = G.bbox(S.paths);
  el.innerHTML = `Line art ${f1(S.widthMm)} × ${f1(b.h * k)} mm. Files: <b>1 Engrave lines</b> (${sumOf('engrave')})${S.cutOn ? ` + <b>2 Cut outside</b> (${sumOf('cut')})` : ''}, plus an SVG in mm and a read-me. All steps share the same 0,0 (bottom-left), so they line up in LaserGRBL.`; }
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
async function resume() { const v = await DB.get('last'); if (!v) return false; S = Object.assign(DEFAULTS(), v); S.trace = Object.assign(DEFAULTS().trace, v.trace || {}); undoSt = []; redoSt = []; srcImg = srcEl = null;
  if (S.src && S.src.kind === 'image' && S.src.url) await setSource(S.src.url); $('srcInfo').textContent = S.src ? (S.src.kind === 'svg' ? 'Imported SVG.' : `Picture ${S.src.w} × ${S.src.h} px.`) : 'No picture yet.';
  syncInputs(); enterApp(); openSec(S.src && S.src.kind === 'svg' ? 'sec-tidy' : 'sec-tidy'); changed({ noCut: false }); fit(); return true; }
function enterApp() { document.body.classList.remove('home'); requestAnimationFrame(() => { resize(); fit(); }); maybeHelp(); }
async function showHome() { document.body.classList.add('home'); await saveNow(); refreshHome(); }
async function refreshHome() { try { const v = await DB.get('last'); $('homeResume').hidden = !v; if (v) $('homeResumeInfo').textContent = `${v.name} · ${(v.paths || []).length} paths · ${new Date(v.saved || Date.now()).toLocaleString()}`; } catch (e) { $('homeResume').hidden = true; } }
$('homeResume').onclick = () => resume().catch(e => toast('Could not resume: ' + e.message));
$('homeBtn').onclick = showHome;
$('newBtn').onclick = async () => { await saveNow(); $('panelFile').click(); };
// ---------- help ----------
const HELP = [
  ['📷', 'Open a picture', 'Tap <b>Open photo or SVG</b>. A photo of a person or pet, a drawing, a logo, or an SVG file all work.'],
  ['〰', 'Trace it into lines', 'The picture turns into lines straight away. Use <b>Detail</b> for more or fewer lines and <b>Remove specks</b> to drop tiny bits. The picture shows faintly behind so you can compare.'],
  ['⌫', 'Tidy up', '<b>Erase</b> stray lines (tap or brush), <b>Draw</b> missing ones, <b>Join</b> broken ends, then <b>Smooth</b>. Two fingers always move and zoom. Undo is at the top.'],
  ['🔥', 'Size and laser', 'Set the <b>Width</b> in mm, tick <b>Outer cut</b> if you want it cut out, then <b>Share</b> or <b>Save laser zip</b>. In LaserGRBL open each .nc file and press Start - they line up by themselves.']];
let helpI = 0;
function showHelp(i = 0) { helpI = i; const [ic, t, b] = HELP[i]; $('helpStep').innerHTML = `<div class="stepn">Step ${i + 1} of ${HELP.length}</div><div class="hpic">${ic}</div><h2>${t}</h2><p>${b}</p>`;
  $('helpBack').disabled = !i; $('helpNext').textContent = i === HELP.length - 1 ? 'Done' : 'Next ›'; $('help').hidden = false; }
function closeHelp() { $('help').hidden = true; try { localStorage.setItem('wp-help', '1'); } catch (e) { /* */ } }
function maybeHelp() { if (!localStorage.getItem('wp-help')) showHelp(0); }
$('helpNext').onclick = () => helpI < HELP.length - 1 ? showHelp(helpI + 1) : closeHelp(); $('helpBack').onclick = () => helpI && showHelp(helpI - 1); $('helpSkip').onclick = closeHelp;
$('helpBtn').onclick = () => showHelp(0); $('homeHelp').onclick = () => showHelp(0);
// ---------- install / offline ----------
let deferred = null;
window.addEventListener('beforeinstallprompt', e => { e.preventDefault(); deferred = e; $('installBtn').hidden = false; });
$('installBtn').onclick = async () => { if (!deferred) return; deferred.prompt(); await deferred.userChoice; deferred = null; $('installBtn').hidden = true; };
window.addEventListener('appinstalled', () => { $('installBtn').hidden = true; });
$('homeVer').textContent = 'Waylands Path ' + APP_VERSION + ' · works offline'; $('verOut').textContent = APP_VERSION;
$('updBtn').onclick = () => location.reload();
if ('serviceWorker' in navigator && location.protocol !== 'file:') window.addEventListener('load', () => {
  const had = !!navigator.serviceWorker.controller;
  navigator.serviceWorker.addEventListener('controllerchange', () => { if (had) $('updBar').hidden = false; });
  navigator.serviceWorker.register('sw.js', { updateViaCache: 'none' }).then(reg => { const chk = () => reg.update().catch(() => {}); chk(); setInterval(chk, 30 * 60 * 1000);
    document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'visible') chk(); });
    reg.addEventListener('updatefound', () => { const w = reg.installing; if (w) w.addEventListener('statechange', () => { if (w.state === 'installed' && navigator.serviceWorker.controller) $('updBar').hidden = false; }); }); }).catch(err => console.warn('SW failed', err)); });
window.addEventListener('resize', () => resize()); new ResizeObserver(() => resize()).observe($('stageWrap'));
window.addEventListener('pagehide', () => { saveNow(); });
syncInputs(); updStats(); refreshHome(); document.body.dataset.ready = '1';
window.WP = { get S() { return S; }, get cut() { return cut; }, view, retrace, computeCut, buildOut, fit, setTool, setErase, toU, kmm, joinGaps, removeShort, smoothAll, undo, redo, openFile, resume, saveNow, DB };
