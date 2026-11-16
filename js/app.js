// Waylands Path v4 - app: open a line drawing or SVG, trace, edit Bezier paths (simple Inkscape-style node tool), laser export, save.
'use strict';
const APP_VERSION = 'v4.2';
const $ = id => document.getElementById(id);
const esc = s => String(s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]);
const f1 = v => (Math.round(v * 10) / 10).toString();
// ---------- state ----------
const DEFAULTS = () => ({ name: 'Untitled', paths: [], src: null, trace: { detail: 5, corners: 5, mode: 'auto', faint: 4, straighten: true },
  widthMm: 150, lineMm: 0.3, cutOn: true, cutOff: 0.5, cutTight: 8, gapMm: 1.5, shortMm: 2, showPhoto: false, saved: 0, ver: 3, v4: 1, sheet: SHEET0() });
function SHEET0() { return { on: false, W: 200, H: 200, margin: 5, gap: 5, nx: 1, ny: 1, place: 'centre' }; }
let S = DEFAULTS(), srcImg = null, srcEl = null, undoSt = [], redoSt = [], tool = 'move';
let sel = new Set(), act = new Set(), lastTap = null, pen = null, skip = { mode: 'skip', first: -1 }, delMode = 'stretch', lw = 0;
const view = { s: 1, tx: 0, ty: 0 };
const cv = $('stage'), ctx = cv.getContext('2d');
const toast = (msg, ms = 2600) => { const t = $('toast'); t.textContent = msg; t.hidden = false; clearTimeout(toast.h); toast.h = setTimeout(() => { t.hidden = true; }, ms); };
const snap = () => BZ.clone(S.paths);
function pushUndo() { undoSt.push(snap()); if (undoSt.length > 50) undoSt.shift(); redoSt = []; updUndo(); }
function undo() { if (!undoSt.length) return; redoSt.push(snap()); S.paths = undoSt.pop(); pen = null; clearSel(); changed(); if (window.T4) T4.reset(); }
function redo() { if (!redoSt.length) return; undoSt.push(snap()); S.paths = redoSt.pop(); pen = null; clearSel(); changed(); if (window.T4) T4.reset(); }
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
function resetBurn() { for (const k of ['engrave', 'cut']) BURN[k] = Object.assign({}, LZ.DEF[k]); try { localStorage.removeItem(BURN_KEY); } catch (e) { /* */ } lzUI(); toast('Laser steps back to the defaults'); }
const burnOf = k => { const j = BURN[k], d = LZ.DEF[k], P = +j.P, F = +j.F;
  return { mode: LZ.TAG[j.mode] ? j.mode : d.mode, P: P > 0 ? Math.min(100, Math.max(0.1, Math.round(P * 10) / 10)) : d.P, F: F > 0 ? Math.round(F * 10) / 10 : d.F, passes: Math.min(10, Math.max(1, Math.round(+j.passes || 1))), order: j.order === 'pass' ? 'pass' : 'line' }; };
const smax = () => { const v = +$('smax').value; return v > 0 ? v : 1000; };
const STEP_NAME = { engrave: 'Engrave lines', cut: 'Cut outside' }, lzOpen = new Set();
const cutActive = () => S.cutOn && cuts().length > 0;
function lzUI() { const keys = cutActive() ? ['engrave', 'cut'] : ['engrave'];
  $('lzSteps').innerHTML = keys.map((k, i) => { const b = burnOf(k);
    return `<details class="lzacc" data-acc="${k}"${lzOpen.has(k) ? ' open' : ''}><summary><span>Step ${i + 1} – ${STEP_NAME[k]}</span><span class="lzsum" data-sum="${k}">${sumOf(k)}</span></summary><div class="lzcb">
      <label class="full">Mode <select data-bj="${k}" data-bf="mode">${LZ.MODES.map(([v, t]) => `<option value="${v}"${b.mode === v ? ' selected' : ''}>${t}</option>`).join('')}</select></label>
      <label>Power % <input type="number" inputmode="decimal" min="0.1" max="100" step="any" data-bj="${k}" data-bf="P" value="${b.P}"></label>
      <label>Speed <input type="number" inputmode="decimal" min="1" step="any" data-bj="${k}" data-bf="F" value="${b.F}"></label>
      <label>Passes <input type="number" inputmode="numeric" min="1" max="10" step="1" data-bj="${k}" data-bf="passes" value="${b.passes}"></label>${k === 'cut' ? `
      <label class="full">Pass order <select data-bj="cut" data-bf="order"><option value="line"${b.order !== 'pass' ? ' selected' : ''}>Passes per line (safer)</option><option value="pass"${b.order === 'pass' ? ' selected' : ''}>All lines each pass</option></select></label>` : ''}
      <label class="full"><span class="hint">${k === 'cut' ? 'Vector cuts holes and windows first (deepest first), the outside outline last, so nothing drops out early. Line To Line / Dithering scan row by row instead (no order).' : 'Vector follows each line once, laser off between lines. Line To Line / Dithering scan the lines row by row at the line width.'}</span></label></div></details>`; }).join('');
  exSummary(); }
const sumOf = k => { const b = burnOf(k); return `${LZ.TAG[b.mode]} ${b.P}% · ${b.F}${b.passes > 1 ? ` · ×${b.passes}` : ''}`; };
$('lzSteps').addEventListener('change', e => { const k = e.target.dataset.bj, f = e.target.dataset.bf; if (!k || !f) return;
  if (f === 'mode' || f === 'order') BURN[k][f] = e.target.value; else { const v = +e.target.value; if (!(v > 0)) { e.target.value = burnOf(k)[f]; return; } BURN[k][f] = v; e.target.value = burnOf(k)[f]; }
  try { localStorage.setItem(BURN_KEY, JSON.stringify(BURN)); } catch (er) { /* */ }
  document.querySelectorAll(`[data-sum="${k}"]`).forEach(x => { x.textContent = sumOf(k); }); exSummary(); });
$('lzSteps').addEventListener('toggle', e => { const d = e.target; if (!d.dataset || !d.dataset.acc) return; if (d.open) lzOpen.add(d.dataset.acc); else lzOpen.delete(d.dataset.acc); }, true);
$('burnReset').onclick = resetBurn;
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
  if (S.src && S.src.w) { ctx.fillStyle = '#fff'; ctx.fillRect(0, 0, S.src.w, S.src.h); if (srcEl && S.showPhoto) { ctx.globalAlpha = 0.18; ctx.drawImage(srcEl, 0, 0, S.src.w, S.src.h); ctx.globalAlpha = 1; }
    ctx.strokeStyle = '#d8d0c2'; ctx.lineWidth = px; ctx.strokeRect(0, 0, S.src.w, S.src.h); }
  ctx.lineCap = ctx.lineJoin = 'round';
  // grey edge = the cut line (dashed when cutting is switched off)
  ctx.strokeStyle = S.cutOn ? 'rgba(120,120,120,0.9)' : 'rgba(150,150,150,0.6)'; ctx.lineWidth = 3.2 * px; ctx.setLineDash(S.cutOn ? [] : [8 * px, 6 * px]);
  ctx.beginPath(); S.paths.forEach(p => { if (p.cut) tracePath(p); }); ctx.stroke(); ctx.setLineDash([]);
  ctx.strokeStyle = '#151515'; ctx.lineWidth = 1.6 * px; ctx.beginPath(); S.paths.forEach(p => { if (!p.cut && (!window.T4 || T4.plain(p))) tracePath(p); }); ctx.stroke(); if (window.T4) T4.paintThick(px);
  // highlighted paths (active in Nodes, first pick in Skip)
  const hi = new Set(act); if (tool === 'skip' && skip.first >= 0) hi.add(skip.first); if (pen && S.paths[pen.pi]) hi.add(pen.pi);
  if (hi.size) { ctx.strokeStyle = tool === 'skip' ? '#e8590c' : '#1971c2'; ctx.lineWidth = 2.4 * px; ctx.beginPath(); for (const pi of hi) if (S.paths[pi]) tracePath(S.paths[pi]); ctx.stroke(); }
  if (tool === 'nodes' || tool === 'pen') paintNodes(px, hi);
  if (window.T2) T2.paint(px);
  if (window.T4) T4.paint(px);
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
function cutStats() { const c = cuts(); let holes = 0; const open = c.filter(p => !p.z).length;
  if (c.length > 1) holes = LZ.cutDepths(c.map(p => BZ.flatten(p, 0.5))).filter(d => d > 0).length;
  return { n: c.length, holes, open }; }
function cutInfo() { const el = $('cutInfo'); if (!el) return; const c = cuts(), st = cutStats();
  el.innerHTML = !c.length ? '<span class="warn">No cut line yet. Tap <b>Make outer cut line</b> below to put one around the lines, or use the <b>Cut out</b> tool on any closed area.</span>' :
    `${c.length > 1 ? `${c.length} cut lines${st.holes ? ` (${st.holes} inside the outline - cut first)` : ''}. ` : 'The grey line is the cut. '}${S.cutOn ? 'Cuts burn as their own step after the engraving: holes and windows first, the outside last.' : 'Cutting is switched off - only the engraving is exported.'}${st.open ? ` <span class="warn">${st.open} cut line${st.open > 1 ? 's are' : ' is'} open (the ends don't meet), so ${st.open > 1 ? 'they' : 'it'} won't free a piece.</span>` : ''} Drag cut lines and their points with the <b>Cut out</b> tool.`; lzUI(); }
// cut lines the user made inside the outline (windows, slots): kept when a new outside cut line is made
function innerCuts() { const c = cuts(); if (!c.length) return []; const ab = BZ.bbox(etch().concat(c)), A = ab ? ab.w * ab.h : 0, polys = c.map(p => BZ.flatten(p, 0.5));
  const dep = c.length > 1 ? LZ.cutDepths(polys) : [0]; return c.filter((p, i) => { const b = BZ.bbox([p]); return dep[i] > 0 || (b && b.w * b.h < A * 0.25); }); }
// Tightness 1-10: how far the outside cut may bridge across pockets (10 = follows every pocket, 1 = smooth outline)
const bridgeMm = () => { const t = Math.max(1, Math.min(10, +S.cutTight || 8)); return Math.round((11 - t) * 0.5 * 100) / 100; };
function makeCut() { const e = etch(); if (!e.length) { toast('No lines to go around yet.'); return; } const keepIn = innerCuts(), outerOld = cuts().filter(p => !keepIn.includes(p)), all = e.concat(outerOld), ab = BZ.bbox(all), k = kmm(), offU = S.cutOff / k, brU = bridgeMm() / k, lineU = S.lineMm / k, pad = offU + brU + lineU * 2 + 2 / k;
  const s = 1100 / Math.max(ab.w + 2 * pad, ab.h + 2 * pad), w = Math.ceil((ab.w + 2 * pad) * s) + 2, h = Math.ceil((ab.h + 2 * pad) * s) + 2, ox = ab.x0 - pad, oy = ab.y0 - pad;
  const c = document.createElement('canvas'); c.width = w; c.height = h; const g = c.getContext('2d'); g.fillStyle = '#fff'; g.fillRect(0, 0, w, h); g.strokeStyle = '#000'; g.lineWidth = Math.max(1.5, lineU * s); g.lineCap = g.lineJoin = 'round'; g.beginPath();
  for (const p of all) { const f = BZ.flatten(p, 0.5 / s); g.moveTo((f[0][0] - ox) * s, (f[0][1] - oy) * s); for (let i = 1; i < f.length; i++) g.lineTo((f[i][0] - ox) * s, (f[i][1] - oy) * s); }
  g.stroke(); const id = g.getImageData(0, 0, w, h).data, m = new Uint8Array(w * h); for (let i = 0; i < m.length; i++) m[i] = id[i * 4] < 160 ? 1 : 0;
  const loops = T.outerCut(m, w, h, offU * s, brU * s).map(l => l.map(([x, y]) => [x / s + ox, y / s + oy]));
  if (!loops.length) { toast('Could not make a cut line.'); return; } pushUndo(); S.paths = e.concat(keepIn, loops.map(l => Object.assign(BZ.fromPolyline(l, { closed: true, tol: 0.6 / s, arm: 4 / s, corner: 40 }), { cut: true }))); S.cutOn = true; syncInputs(); changed(); toast('Outside cut line made - drag it with the Cut out tool to adjust.'); }
// ---------- tracing ----------
// The tracer normally runs in a helper (js/worker.js) so the screen stays smooth. If the helper can't load, says nothing within a few
// seconds, errors, or takes far too long, tracing carries on here on the main screen instead - never "Tracing..." forever.
let worker = null, workerReady = false, wid = 0, traceT = null, readyT = null; const pending = new Map();
const WORKER_READY_MS = 6000, WORKER_JOB_MS = 90000;
function runMain(job) { $('busy').textContent = 'Tracing on this screen (slower)…'; $('busy').hidden = false;
  setTimeout(() => { let r; try { r = T.lineArt(job.img, job.opts); } catch (err) { r = { error: String(err && err.message || err) }; } job.res(r); }, 30); }
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
  S.paths = r.paths; clearSel(); pen = null;
  const nc = r.paths.filter(p => p.cut).length;
  $('traceInfo').innerHTML = `${r.paths.length - nc} lines, ${r.nodes} points, drawn line ≈ ${f1(r.lw)} px wide. ${r.darkBg ? 'Auto: light shapes on a dark background (if that is wrong, tap <b>Dark lines on light paper</b>).' : r.mode === 'light' ? 'Light lines on dark.' : r.mode === 'normal' ? 'Dark lines on light paper.' : 'Auto: dark lines on light paper.'} ${nc ? 'Grey cut line found around the design.' : '<span class="warn">No outside edge found.</span>'}${r.solids ? ` ${r.solids} solid dark shape${r.solids > 1 ? 's' : ''} (windows, hinges…) traced round the edge.` : ''}${r.gaps ? ` Closed ${r.gaps} small gap${r.gaps > 1 ? 's' : ''}.` : ''}${r.parts > 1 ? ` <span class="warn">${r.parts - 1} part(s) sit apart from the main design and are outside the cut line.</span>` : ''}`;
  changed(); }
function traceSoon() { clearTimeout(traceT); traceT = setTimeout(() => retrace(true), 160); }
// ---------- opening files ----------
async function openFile(file) { if (!file) return; const isSvg = /svg/i.test(file.type) || /\.svg$/i.test(file.name), name = file.name.replace(/\.[^.]+$/, '').slice(0, 40) || 'Untitled';
  try { if (isSvg) { const r = SVGIN.importSVG(await file.text()); startProject(name); S.src = { kind: 'svg', w: r.w, h: r.h }; $('sec-trace').hidden = true; srcImg = null; srcEl = null; S.paths = r.paths; S.cutOn = false;
      const sk = []; if (r.info.skippedWhite) sk.push(`${r.info.skippedWhite} white background shape${r.info.skippedWhite > 1 ? 's' : ''}`); if (r.info.skippedText) sk.push(`${r.info.skippedText} text item(s) (convert text to paths first)`); if (r.info.skippedUse) sk.push(`${r.info.skippedUse} linked symbol(s)`);
      $('srcInfo').innerHTML = `SVG: ${r.paths.length} lines from ${r.info.shapes} shapes, curves kept.${sk.length ? `<br><span class="warn">Skipped ${sk.join(', ')}.</span>` : ''}`;
      syncInputs(); enterApp(); openSec('sec-size', false); closeMenu(); changed(); fit(); toast(`Opened ${r.paths.length} lines from the SVG`); return; }
    const el = await loadImage(file), sc = Math.min(1, 1600 / Math.max(el.width, el.height)), w = Math.max(1, Math.round(el.width * sc)), h = Math.max(1, Math.round(el.height * sc));
    const alphaOk = /png|gif|webp/i.test(file.type), c = document.createElement('canvas'); c.width = w; c.height = h; const g = c.getContext('2d'); if (!alphaOk) { g.fillStyle = '#fff'; g.fillRect(0, 0, w, h); } g.drawImage(el, 0, 0, w, h);
    const url = c.toDataURL(alphaOk ? 'image/png' : 'image/jpeg', 0.92);
    startProject(name); S.src = { kind: 'image', w, h, url }; $('sec-trace').hidden = false; await setSource(url); $('srcInfo').textContent = `${file.name} · ${w} × ${h} px.`;
    enterApp(); openSec('sec-trace', false); closeMenu(); fit(); await retrace(false); fit(); }
  catch (e) { console.error(e); toast(e.message || 'Could not open that file.', 4000); } }
function loadImage(file) { return new Promise((res, rej) => { const u = URL.createObjectURL(file), im = new Image(); im.onload = () => res(im); im.onerror = () => rej(new Error('That picture could not be opened. Try a JPG or PNG.')); im.src = u; }); }
function setSource(url) { return new Promise((res, rej) => { const im = new Image(); im.onload = () => { srcEl = im; const c = document.createElement('canvas'); c.width = S.src.w; c.height = S.src.h; const g = c.getContext('2d'); g.drawImage(im, 0, 0, S.src.w, S.src.h);
  const d = g.getImageData(0, 0, S.src.w, S.src.h); srcImg = { data: d.data, w: S.src.w, h: S.src.h }; res(); }; im.onerror = rej; im.src = url; }); }
function startProject(name) { const keep = { widthMm: S.widthMm, lineMm: S.lineMm, cutOff: S.cutOff, cutTight: S.cutTight, gapMm: S.gapMm, shortMm: S.shortMm, showPhoto: S.showPhoto, trace: Object.assign({}, S.trace), sheet: Object.assign(SHEET0(), S.sheet || {}) };
  S = Object.assign(DEFAULTS(), keep, { name }); undoSt = []; redoSt = []; clearSel(); pen = null; syncInputs(); }
['homeFile', 'stageFile', 'panelFile'].forEach(id => $(id).addEventListener('change', e => { const f = e.target.files[0]; e.target.value = ''; openFile(f); }));
// ---------- inputs ----------
function syncInputs() { $('nameBtn').textContent = (S.name || 'Untitled') + ' ✎'; $('detail').value = S.trace.detail; $('detailOut').textContent = S.trace.detail; $('corners').value = S.trace.corners; $('cornersOut').textContent = S.trace.corners;
  traceModeUI(); $('faint').value = S.trace.faint == null ? 4 : S.trace.faint; $('faintOut').textContent = $('faint').value; sheetUI(); $('straighten').checked = S.trace.straighten !== false; $('showPhoto').checked = S.showPhoto; $('widthMm').value = S.widthMm; $('lineMm').value = S.lineMm;
  $('cutOn').checked = S.cutOn; $('cutOff').value = S.cutOff; $('cutTight').value = S.cutTight || 8; $('cutTightOut').textContent = S.cutTight || 8; $('gapMm').value = S.gapMm; $('shortMm').value = S.shortMm; $('sec-trace').hidden = !(S.src && S.src.kind === 'image'); lzUI(); cutInfo(); }
$('detail').addEventListener('input', e => { S.trace.detail = +e.target.value; $('detailOut').textContent = S.trace.detail; traceSoon(); });
$('corners').addEventListener('input', e => { S.trace.corners = +e.target.value; $('cornersOut').textContent = S.trace.corners; traceSoon(); });
function traceModeUI() { const m = S.trace.mode || (S.trace.invert ? 'light' : 'auto'); document.querySelectorAll('[data-tmode]').forEach(b => b.classList.toggle('on', b.dataset.tmode === m)); }
document.querySelectorAll('[data-tmode]').forEach(b => b.onclick = () => { S.trace.mode = b.dataset.tmode; delete S.trace.invert; traceModeUI(); traceSoon(); });
$('faint').addEventListener('input', e => { S.trace.faint = +e.target.value; $('faintOut').textContent = S.trace.faint; traceSoon(); });
$('straighten').addEventListener('change', e => { S.trace.straighten = e.target.checked; traceSoon(); });
$('retraceBtn').onclick = () => retrace(true);
$('showPhoto').addEventListener('change', e => { S.showPhoto = e.target.checked; draw(); saveSoon(); });
const numIn = (id, key, lo, hi, after) => $(id).addEventListener('change', e => { const v = +e.target.value; if (!(v >= lo && v <= hi)) { e.target.value = S[key]; toast(`Use a number from ${lo} to ${hi}`); return; } S[key] = v; if (after) after(); saveSoon(); });
numIn('widthMm', 'widthMm', 5, 2000, () => { updStats(); exSummary(); }); numIn('lineMm', 'lineMm', 0.05, 5, exSummary); numIn('cutOff', 'cutOff', 0, 50); $('cutTight').addEventListener('input', e => { S.cutTight = +e.target.value; $('cutTightOut').textContent = S.cutTight; saveSoon(); }); numIn('gapMm', 'gapMm', 0.1, 20); numIn('shortMm', 'shortMm', 0.1, 100);
$('cutOn').addEventListener('change', e => { S.cutOn = e.target.checked; cutInfo(); draw(); saveSoon(); exSummary(); });
$('makeCutBtn').onclick = makeCut;
$('nameBtn').onclick = () => { const n = prompt('Project name (used in the file names)', S.name); if (n && n.trim()) { S.name = n.trim().slice(0, 40); syncInputs(); saveSoon(); } };
function openSec(id, show = true) { if (show) openMenu(); document.querySelectorAll('#panel details[name=acc]').forEach(d => { d.open = d.id === id; }); }
// ☰ Menu: everything that is not a drawing tool lives in a sheet that is closed by default
function openMenu(id) { document.body.classList.add('menuOpen'); if (id) { document.querySelectorAll('#panel details[name=acc]').forEach(d => { d.open = d.id === id; }); const el = $(id); if (el) setTimeout(() => el.scrollIntoView({ block: 'start' }), 30); } }
function closeMenu() { document.body.classList.remove('menuOpen'); }
$('menuBtn').onclick = () => document.body.classList.contains('menuOpen') ? closeMenu() : openMenu(); $('menuClose').onclick = closeMenu; $('menuBack').onclick = closeMenu;
$('exportTop').onclick = () => openMenu('sec-export');
$('addShape').onclick = () => { closeMenu(); setTool('shapes'); };
// ---------- geometry helpers on the whole drawing ----------
const pkey = (pi, j) => pi + ':' + j, unkey = k => k.split(':').map(Number);
const same = (a, b) => Math.abs(a.x - b.x) < 1e-3 && Math.abs(a.y - b.y) < 1e-3;
function linked(pi, j) { const nd = S.paths[pi].n[j], out = []; S.paths.forEach((p, qi) => p.n.forEach((m, k) => { if ((qi !== pi || k !== j) && same(m, nd)) out.push(m); })); return out; }
const isEnd = (p, j) => !p.z && (j === 0 || j === p.n.length - 1);
function hitNode(u, tolU, only) { let best = null, bd = tolU; const list = only ? [...only] : S.paths.map((_, i) => i);
  for (const pi of list) { const p = S.paths[pi]; if (!p) continue; p.n.forEach((nd, j) => { const d = Math.hypot(nd.x - u[0], nd.y - u[1]); if (d < bd) { bd = d; best = { pi, j }; } }); } return best; }
function hitHandle(u, tolU) { let best = null, bd = tolU; for (const h of handleList()) { const q = S.paths[h.pi].n[h.j][h.side], d = Math.hypot(q[0] - u[0], q[1] - u[1]); if (d < bd) { bd = d; best = h; } } return best; }
function hitPath(u, tolU, skipIdx = -1) { return hitPathF(u, tolU, skipIdx, p => !p.cut) || hitPathF(u, tolU * 0.6, skipIdx, p => p.cut); }
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
// any line(s) -> cut (grey, own laser step) or back to etch
function pickedLines() { const s = new Set(act); for (const k of sel) s.add(+k.split(':')[0]); return [...s].filter(pi => S.paths[pi]); }
function toggleCut() { const pis = pickedLines(); if (!pis.length) { toast('Tap a line first (or drag a box round several), then Make cut'); return; }
  const toCut = pis.some(pi => !S.paths[pi].cut); pushUndo(); for (const pi of pis) { if (toCut) S.paths[pi].cut = true; else delete S.paths[pi].cut; }
  const open = toCut ? pis.filter(pi => !S.paths[pi].z).length : 0; if (toCut && !S.cutOn) { S.cutOn = true; syncInputs(); }
  changed({ keepSel: true }); updCutBtn();
  toast(toCut ? `${pis.length} line${pis.length > 1 ? 's' : ''} now cut${pis.length > 1 ? '' : 's'} (grey, in the cut file)${open ? ` - ${open} open line${open > 1 ? 's' : ''}: the ends don't meet, so it won't free a piece` : ''}` : `${pis.length} line${pis.length > 1 ? 's' : ''} back to etch`, open ? 5000 : 2600); }
function updCutBtn() { const b = $('nCut'); if (!b) return; const pis = pickedLines(), allCut = pis.length && pis.every(pi => S.paths[pi].cut);
  $('nCutL').textContent = allCut ? 'Make etch' : 'Make cut'; b.classList.toggle('iscut', !!allCut); b.classList.toggle('dim', !pis.length); }
function selectLine() { const pis = act.size ? [...act] : [...selByPath().keys()]; if (!pis.length) { toast('Tap a line first'); return; } for (const pi of pis) S.paths[pi].n.forEach((_, j) => sel.add(pkey(pi, j))); updSel(); draw(); }
function updSel() { const n = sel.size; $('selInfo').textContent = n ? `${n} point${n > 1 ? 's' : ''} picked` : act.size ? 'Line picked - tap a point, or drag a box round several' : 'Tap a line to show its points';
  document.querySelectorAll('[data-needsel]').forEach(b => { b.classList.toggle('dim', !n && !lastTap); }); updCutBtn(); }
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
function setTool(t) { if (tool === 'pen' && t !== 'pen') penDone(); const prev = tool; tool = t; if (window.T4) T4.onTool(t, prev); document.querySelectorAll('#tools .tool').forEach(b => b.classList.toggle('on', b.dataset.tool === t));
  document.querySelectorAll('#toolOpts .topts').forEach(o => { o.hidden = !o.dataset.opts.split(' ').includes(t); }); if (t !== 'nodes') { sel.clear(); act.clear(); lastTap = null; } skip.first = -1; updSel(); updSkip(); cv.style.cursor = t === 'move' ? 'grab' : 'crosshair'; if (window.T2) T2.onTool(t); draw(); }
document.querySelectorAll('#tools .tool').forEach(b => b.onclick = () => setTool(b.dataset.tool === tool ? 'move' : b.dataset.tool));
$('delStretch').onclick = () => { delMode = 'stretch'; $('delStretch').classList.add('on'); $('delWhole').classList.remove('on'); $('delTip').textContent = 'Tap a line: it is removed up to the junction each side.'; };
$('delWhole').onclick = () => { delMode = 'whole'; $('delWhole').classList.add('on'); $('delStretch').classList.remove('on'); $('delTip').textContent = 'Tap a line: the whole line is removed.'; };
const ACT = { nCorner: () => nodeType(false), nSmooth: () => nodeType(true), nLine: () => segType(true), nCurve: () => segType(false), nAdd: addNode, nDel: delNodes, nBreak: () => { if (!sel.size && act.size === 1) { const pi = [...act][0]; setTool('line'); T2.startBreak(pi); return; } breakNodes(); }, nJoin: joinNodes, nSeg: delSegs, nStraight: straighten, nAll: selectLine, nCut: toggleCut };
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
function cancelGesture() { if (!gest) return; if (gest.t4 && window.T4) T4.cancelG(gest); if (gest.restore && gest.moved) gest.restore(); if (gest.snap && gest.moved) { S.paths = gest.snap; } if (gest.kind === 'pan' || gest.kind === 'tap' || gest.t2 === 'pan' || gest.t2 === 'tap') { view.tx = gest.tx; view.ty = gest.ty; } gest = null; overlay = null; draw(); }
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
function buildOut() { return LZ.build({ name: S.name, art: etch(), cut: cutActive() ? cuts() : [], widthMm: S.widthMm, burn: { engrave: burnOf('engrave'), cut: burnOf('cut') }, smax: smax(), lineMm: S.lineMm, pxmm: 10, sheet: S.sheet && S.sheet.on ? S.sheet : null }); }
// ---------- Sheet: blank size, margin, copies ----------
const designFrame = () => LZ.frame(etch(), cutActive() ? cuts() : [], S.widthMm);
function sheetUI() { const sh = S.sheet || (S.sheet = SHEET0()); $('shOn').checked = !!sh.on; $('shBody').hidden = !sh.on; $('shOff').hidden = !!sh.on;
  $('shW').value = sh.W; $('shH').value = sh.H; $('shM').value = sh.margin; $('shGap').value = sh.gap; $('shNx').value = sh.nx; $('shNy').value = sh.ny;
  document.querySelectorAll('[data-place]').forEach(b => b.classList.toggle('on', b.dataset.place === (sh.place === 'margin' ? 'margin' : 'centre'))); sheetPreview(); }
function sheetPreview() { const sh = S.sheet, info = $('shInfo'), c = $('shPrev'); if (!sh || !sh.on || !c) return; const fr = designFrame();
  const g = c.getContext('2d'), W = c.width, H = c.height; g.setTransform(1, 0, 0, 1, 0, 0); g.clearRect(0, 0, W, H);
  if (!fr) { info.textContent = 'Open a picture first.'; return; } const lay = LZ.layout(fr, sh), pad = 34, s = Math.min((W - 2 * pad) / lay.W, (H - 2 * pad) / lay.H);
  const X = x => pad + x * s, Y = y => H - pad - y * s; // laser mm (y up) -> preview
  g.fillStyle = '#e9dcc4'; g.fillRect(X(0), Y(lay.H), lay.W * s, lay.H * s); g.strokeStyle = '#8a7a60'; g.lineWidth = 2; g.strokeRect(X(0), Y(lay.H), lay.W * s, lay.H * s);
  g.setLineDash([6, 5]); g.strokeStyle = 'rgba(80,80,80,.7)'; g.lineWidth = 1; const m = +sh.margin || 0; g.strokeRect(X(m), Y(lay.H - m), (lay.W - 2 * m) * s, (lay.H - 2 * m) * s); g.setLineDash([]);
  const draw1 = (paths, col, lwid) => { g.strokeStyle = col; g.lineWidth = lwid; g.beginPath(); for (const o of lay.offs) for (const p of paths) { const f = BZ.flatten(p, 1 / (fr.k * s)); f.forEach(([x, y], i) => { const lx = o[0] + (x - fr.x0) * fr.k, ly = o[1] + (fr.y1 - y) * fr.k; i ? g.lineTo(X(lx), Y(ly)) : g.moveTo(X(lx), Y(ly)); }); } g.stroke(); };
  draw1(etch(), '#222', 1); if (cutActive()) draw1(cuts(), '#d9480f', 1.4);
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
  el.innerHTML = `${sh ? `<b>Sheet:</b> ${sh.n} cop${sh.n > 1 ? 'ies' : 'y'} on a ${f1(sh.W)} × ${f1(sh.H)} mm blank, 0,0 = the blank's bottom-left corner.${sh.fits ? '' : ' <span class="warn">They don\'t fit - see Sheet.</span>'} ` : ''}Design ${f1(S.widthMm)} × ${f1(b.h * k)} mm. Files: <b>1 Engrave lines</b> (${sumOf('engrave')})${cutActive() ? ` + <b>2 Cut outside</b> (${sumOf('cut')})` : ''}, plus an SVG in mm and a read-me. All steps share the same 0,0 (bottom-left${sh ? ' of the blank' : ''}), so they line up in LaserGRBL.${cutActive() ? ' Holes and windows are cut before the outside.' : ''} The laser is switched off for every move between lines.`; }
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
  const ot = v.trace || {}; v.trace = Object.assign(DEFAULTS().trace, ot); if (!ot.mode) v.trace.mode = ot.invert ? 'light' : 'auto'; delete v.trace.invert; v.sheet = Object.assign(SHEET0(), v.sheet || {}); if (v.ver !== 3) { v.cutOn = false; v.ver = 3; } if (!v.v4) { if (v.cutOff == null || v.cutOff === 3) v.cutOff = 0.5; v.cutTight = v.cutTight || 8; v.showPhoto = false; v.v4 = 1; } return v; }
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
  ['🖼️', 'Open a line drawing', 'Open a PNG/JPG line drawing or an SVG. Black lines are what the laser etches; the <b>grey line</b> round the outside is where it cuts the piece out. Pick a tool at the bottom. <b>Two fingers</b> always move and zoom the picture; <b>⤢ Fit</b> re-centres it.'],
  ['✏️', 'The 8 tools (tap one, tap again to put it away)', '<b>Select</b>: tap a line - the whole line turns blue - then <b>Delete line</b>, <b>Break</b> (tap where it stops and starts again), <b>Thickness</b> or <b>Make cut</b>.<br><b>Point to point</b>: tap, tap, tap for straight lines; drag a line to bend it.<br><b>Draw</b>: draw a line with your finger.<br><b>Break</b>: tap two points - removes the bit between, or adds a line across a gap.<br><b>Eraser</b>: rub lines out, or tap one to remove it.<br><b>Thickness</b>: tap a line, slide to thicken, or make it a double line.<br><b>Cut out</b>: tap inside an area, tap Cut out - it becomes a hole.<br><b>Clear space</b>: tap inside an area (e.g. a window pane) - it turns red. Tap more areas to add them, or drag a box. Tick <i>Include border lines</i> to remove the frame too. Then tap Clear.'],
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
$('homeVer').textContent = 'Waylands Path ' + APP_VERSION + ' · works offline · new: Select a whole line → Delete, Break, Thickness, Make cut; updates arrive by themselves'; $('verOut').textContent = APP_VERSION;
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
window.addEventListener('pagehide', () => { saveNow(); });
syncInputs(); updStats(); updSkip(); refreshHome(); document.body.dataset.ready = '1';
window.WP = { checkVersion, updateReady, busyNow, openMenu, closeMenu, makeCut, get tool() { return tool; }, get S() { return S; }, set paths(v) { S.paths = v; }, get sel() { return sel; }, get act() { return act; }, view, retrace, fit, setTool, toU, kmm, undo, redo, openFile, resume, saveNow, DB, buildOut, changed, skipOver, continueAcross, deleteStretch, extendEnd, closeGapsAll, removeOverlaps, makeCut, hitPath, ACT, nudge, keepSegs, splitAtNodes, get lw() { return lw; } };
