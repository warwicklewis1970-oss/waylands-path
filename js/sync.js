// Waylands Path v4.4: named projects on this device + Google Drive sync, modelled on Wayland Forge.
// Drive: the hidden "app data" folder (only these apps can see it, it never clutters the user's Drive). Wayland Forge signs in with
// the same Google client, so it shares that hidden folder - Waylands Path only ever reads, writes and deletes its own wpp-*.json files
// (Forge only touches wfp-*.json), so the two apps never mix.
(() => {
  const GOOGLE_CLIENT_ID = '691597600502-ldoveuit86b5c0j5gfhhnrq1ok5a35cg.apps.googleusercontent.com';
  const PFX = 'wpp-', SYNCK = 'wp-sync-v1', TOKK = 'wp-sync-tok', FORGE_TOKK = 'wf-sync-tok', GAPI = 'https://www.googleapis.com', GSCOPE = 'https://www.googleapis.com/auth/drive.appdata';
  const BIG = 4 * 1048576, PIC_LIMIT = 20 * 1048576; // resumable upload above 4 MB; above 20 MB the picture stays on this device (lines + settings still sync)
  const IDX = 'projs', KEY = id => 'pj:' + id;
  const newId = () => Date.now().toString(36) + Math.random().toString(36).slice(2, 7);
  const sizeOf = st => { try { return JSON.stringify(st).length; } catch (e) { return 0; } };
  const sigOf = st => { try { return JSON.stringify(Object.assign({}, st, { saved: 0 })); } catch (e) { return ''; } };
  const mb = n => n >= 1048576 ? (n / 1048576).toFixed(1) + ' MB' : Math.max(1, Math.round(n / 1024)) + ' KB';
  const lastSig = new Map();
  // ---------- projects on this device (IndexedDB) ----------
  async function idx() { return (await DB.get(IDX)) || []; }
  async function setIdx(a) { a.sort((p, q) => q.updated - p.updated); await DB.put(IDX, a); }
  async function getProj(id) { return DB.get(KEY(id)); }
  async function putProj(x, quiet) { await DB.put(KEY(x.id), x); const a = await idx(), i = a.findIndex(q => q.id === x.id), row = { id: x.id, name: x.name, updated: x.updated, size: sizeOf(x.state) };
    if (i >= 0) a[i] = row; else a.push(row); await setIdx(a); lastSig.set(x.id, sigOf(x.state)); if (!quiet) syncSoon(); }
  async function delProj(id) { await DB.del(KEY(id)); await setIdx((await idx()).filter(q => q.id !== id)); const l = await DB.get('last'); if (l && l.pid === id) await DB.del('last'); }
  // called by saveNow() with a plain copy of the open project
  async function saved(st) { if (!st.pid) return; const sg = sigOf(st); if (lastSig.get(st.pid) === sg) return; await putProj({ id: st.pid, name: st.name || 'Untitled', updated: st.saved || Date.now(), state: st }); }
  async function init() { // first run of v4.4: the project you were working on becomes a saved project
    try { const l = await DB.get('last'); if (l && (l.src || (l.paths && l.paths.length))) { const a = await idx(); if (!l.pid || !a.some(q => q.id === l.pid)) { l.pid = l.pid || newId(); await DB.put('last', l); await putProj({ id: l.pid, name: l.name || 'Untitled', updated: l.saved || Date.now(), state: l }, true); } } } catch (e) { console.warn(e); }
    await listUI(); if (sm().connected) syncSoon(1); else statusUI(); }
  async function open(id) { const x = await getProj(id); if (!x) { toast('That project is not on this device any more'); listUI(); return; } x.state.pid = id; x.state.name = x.name; lastSig.set(id, sigOf(x.state)); await resume(x.state); await DB.put('last', JSON.parse(JSON.stringify(S))); }
  // ---------- the My projects list on the home screen ----------
  const esc = s => String(s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
  const when = t => new Date(t).toLocaleString('en-AU', { day: 'numeric', month: 'short', hour: 'numeric', minute: '2-digit' });
  async function listUI() { const box = $('projList'); if (!box) return; const a = await idx(); $('projCount').textContent = a.length ? `(${a.length})` : '';
    box.innerHTML = a.length ? a.map(x => `<div class="prow"><button class="popen" data-pa="open" data-id="${x.id}"><b>${esc(x.name)}</b><small>${when(x.updated)} · ${mb(x.size || 0)}${x.size > PIC_LIMIT ? ' · picture stays on this device' : ''}</small></button><button class="pico" data-pa="ren" data-id="${x.id}" title="Rename" aria-label="Rename">✎</button><button class="pico del" data-pa="del" data-id="${x.id}" title="Delete" aria-label="Delete">🗑</button></div>`).join('')
      : '<div class="pnone">No saved projects yet - open a line drawing to start one. Every project is saved here as you work.</div>';
    const big = a.filter(x => x.size > PIC_LIMIT).map(x => `"${x.name}"`); sy.note = big.length ? `${big.join(', ')} ${big.length > 1 ? 'are' : 'is'} big - lines and settings sync, the picture stays on this device.` : '';
    statusUI(); }
  document.addEventListener('click', async e => { const b = e.target.closest && e.target.closest('[data-pa]'); if (!b || !$('projList').contains(b)) return; const id = b.dataset.id, x = await getProj(id); if (!x) { listUI(); return; }
    if (b.dataset.pa === 'open') { open(id).catch(er => toast('Could not open: ' + er.message)); return; }
    if (b.dataset.pa === 'ren') { const n = prompt('Project name', x.name); if (!n || !n.trim()) return; x.name = n.trim().slice(0, 40); x.state.name = x.name; x.updated = Date.now(); x.state.saved = x.updated; await putProj(x); if (S.pid === id) { S.name = x.name; syncInputs(); } const l = await DB.get('last'); if (l && l.pid === id) { l.name = x.name; await DB.put('last', l); } listUI(); refreshHome(); return; }
    if (b.dataset.pa === 'del') { if (!confirm(`Delete "${x.name}"?${sm().connected ? ' It is deleted from your other devices too.' : ''} This cannot be undone.`)) return; await delProj(id); if (S.pid === id) S.pid = null; markDel(id); listUI(); refreshHome(); toast('Deleted ' + x.name); } });
  // ---------- Google Drive sync ----------
  const sy = { tok: null, exp: 0, busy: null, again: false, state: 'off', err: '', t: null, note: '' };
  const sm = () => { try { const m = JSON.parse(localStorage.getItem(SYNCK) || '{}'); m.files = m.files || {}; m.del = m.del || []; return m; } catch (e) { return { files: {}, del: [] }; } };
  const smSet = m => localStorage.setItem(SYNCK, JSON.stringify(m));
  function loadGis() { if (window.google && google.accounts && google.accounts.oauth2) return Promise.resolve();
    if (sy.gis) return sy.gis; sy.gis = new Promise((ok, no) => { const s = document.createElement('script'); s.src = 'https://accounts.google.com/gsi/client'; s.async = true; s.onload = ok; s.onerror = () => { sy.gis = null; no(new Error('offline')); }; document.head.appendChild(s); }); return sy.gis; }
  function tokLoad() { if (sy.tok && Date.now() < sy.exp - 60000) return sy.tok;
    for (const k of [TOKK, FORGE_TOKK]) { try { const t = JSON.parse(localStorage.getItem(k) || 'null'); if (t && t.tok && Date.now() < t.exp - 60000) { sy.tok = t.tok; sy.exp = t.exp; return sy.tok; } } catch (e) { /* */ } } return null; } // same Google client + scope as Forge: its fresh sign-in works here too
  const withTimeout = (p, ms, msg) => Promise.race([p, new Promise((ok, no) => setTimeout(() => no(new Error(msg || 'timeout')), ms))]);
  function getToken(interactive) { const t = tokLoad(); if (t) return Promise.resolve(t); if (!interactive) return Promise.reject(new Error('auth'));
    return withTimeout(loadGis(), 20000, 'offline').then(() => withTimeout(new Promise((ok, no) => { const m = sm();
      const tc = google.accounts.oauth2.initTokenClient({ client_id: GOOGLE_CLIENT_ID, scope: GSCOPE, login_hint: m.email || undefined,
        callback: r => { if (r && r.access_token) { sy.tok = r.access_token; sy.exp = Date.now() + (r.expires_in || 3600) * 1000; try { localStorage.setItem(TOKK, JSON.stringify({ tok: sy.tok, exp: sy.exp })); } catch (e) { /* */ } ok(sy.tok); } else no(new Error(r && r.error === 'access_denied' ? 'denied' : 'auth')); },
        error_callback: er => no(new Error(er && er.type === 'popup_closed' ? 'closed' : 'auth')) });
      tc.requestAccessToken({ prompt: m.connected ? '' : 'consent', login_hint: m.email || undefined }); }), 180000, 'auth')); }
  function tokForget() { sy.tok = null; sy.exp = 0; try { localStorage.removeItem(TOKK); } catch (e) { /* */ } }
  async function gfetch(url, opt = {}) { const t = await getToken(false), ac = new AbortController(), tm = setTimeout(() => ac.abort(), 90000); let r;
    try { r = await fetch(url, { ...opt, signal: ac.signal, headers: { ...(opt.headers || {}), Authorization: 'Bearer ' + t } }); } catch (e) { throw new Error(ac.signal.aborted ? 'timeout' : 'offline'); } finally { clearTimeout(tm); }
    if (r.status === 401) { tokForget(); throw new Error('auth'); } if (!r.ok && r.status !== 404) throw new Error('http ' + r.status); return r; }
  async function rememberEmail() { try { const m = sm(); if (m.email) return; const j = await (await gfetch(GAPI + '/drive/v3/about?fields=user(emailAddress)')).json(); const e = j && j.user && j.user.emailAddress; if (e) { const m2 = sm(); m2.email = e; smSet(m2); statusUI(); } } catch (e) { /* not important */ } }
  async function driveList() { let out = [], pt = '';
    do { const j = await (await gfetch(GAPI + '/drive/v3/files?spaces=appDataFolder&pageSize=1000&fields=' + encodeURIComponent('nextPageToken,files(id,name,appProperties)') + (pt ? '&pageToken=' + pt : ''))).json(); out = out.concat(j.files || []); pt = j.nextPageToken || ''; } while (pt);
    return out.filter(f => f.name.startsWith(PFX) && f.name.endsWith('.json')); } // only Waylands Path files - never Forge's
  async function driveGet(fid) { const r = await gfetch(GAPI + '/drive/v3/files/' + fid + '?alt=media'); if (r.status === 404) return null; return r.json(); }
  async function drivePut(x, fid) { let body = JSON.stringify(x);
    if (body.length > PIC_LIMIT && x.state && x.state.src && x.state.src.url) { const y = JSON.parse(body); delete y.state.src.url; y.state.src.picLocal = 1; body = JSON.stringify(y); }
    const meta = { name: PFX + x.id + '.json', mimeType: 'application/json', appProperties: { pid: x.id, updated: String(x.updated) } }; if (!fid) meta.parents = ['appDataFolder'];
    const base = GAPI + '/upload/drive/v3/files' + (fid ? '/' + fid : ''), meth = fid ? 'PATCH' : 'POST';
    if (body.length > BIG) { const r = await gfetch(base + '?uploadType=resumable&fields=id', { method: meth, headers: { 'Content-Type': 'application/json; charset=UTF-8', 'X-Upload-Content-Type': 'application/json' }, body: JSON.stringify(meta) });
      if (r.status === 404 && fid) return drivePut(x, null); const loc = r.headers.get('Location'); if (!loc) throw new Error('upload');
      const ac = new AbortController(), tm = setTimeout(() => ac.abort(), 300000); let r2; try { r2 = await fetch(loc, { method: 'PUT', signal: ac.signal, headers: { 'Content-Type': 'application/json' }, body }); } catch (e) { throw new Error('offline'); } finally { clearTimeout(tm); }
      if (!r2.ok) throw new Error('upload ' + r2.status); return (await r2.json()).id; }
    const bd = 'wpsync' + Math.random().toString(36).slice(2), mp = '--' + bd + '\r\nContent-Type: application/json; charset=UTF-8\r\n\r\n' + JSON.stringify(meta) + '\r\n--' + bd + '\r\nContent-Type: application/json\r\n\r\n' + body + '\r\n--' + bd + '--';
    const r = await gfetch(base + '?uploadType=multipart&fields=id', { method: meth, headers: { 'Content-Type': 'multipart/related; boundary=' + bd }, body: mp });
    if (r.status === 404) return drivePut(x, null); return (await r.json()).id; }
  // a copy that came without its picture keeps the picture this device already has
  const withPic = (p, loc) => { const s = p.state && p.state.src; if (s && !s.url && s.picLocal && loc && loc.state && loc.state.src && loc.state.src.url) s.url = loc.state.src.url; if (s && s.url) delete s.picLocal; return p; };
  const shortDay = t => new Date(t).toLocaleDateString('en-AU', { day: 'numeric', month: 'short' });
  const editing = () => !document.body.classList.contains('home');
  async function pulled(id) { if (S.pid !== id) return; const x = await getProj(id); if (!x) return; // the open project was changed on the other device (and not here): show the newer one
    if (editing()) { const v = { tx: view.tx, ty: view.ty, s: view.s }; x.state.pid = id; lastSig.set(id, sigOf(x.state)); await resume(x.state); Object.assign(view, v); draw(); toast('Updated with the newer copy from your other device', 3500); }
    const l = await DB.get('last'); if (l && l.pid === id) await DB.put('last', x.state); }
  async function syncRun() { const m = sm(); const a = await idx(), byId = new Map(a.map(x => [x.id, x])); let changed = false; const pulledIds = [];
    for (const id of m.del.slice()) { const f = m.files[id]; if (f && f.fid) await gfetch(GAPI + '/drive/v3/files/' + f.fid, { method: 'DELETE' }); delete m.files[id]; m.del = m.del.filter(q => q !== id); smSet(m); }
    const remote = await driveList(), seen = new Set();
    for (const f of remote) { const id = (f.appProperties && f.appProperties.pid) || f.name.slice(PFX.length, -5), ru = +(f.appProperties && f.appProperties.updated) || 0; seen.add(id);
      const x = byId.get(id), rec = m.files[id], base = rec ? rec.u : 0;
      if (!x) { if (rec && rec.u >= ru) { await gfetch(GAPI + '/drive/v3/files/' + f.id, { method: 'DELETE' }); delete m.files[id]; smSet(m); continue; } // deleted here earlier
        const p = await driveGet(f.id); if (p && p.state) { p.id = id; p.updated = p.updated || ru; await putProj(withPic(p, null), true); m.files[id] = { fid: f.id, u: p.updated }; smSet(m); changed = true; } continue; }
      if (ru === x.updated) { m.files[id] = { fid: f.id, u: ru }; continue; }
      const localCh = x.updated > base, remoteCh = ru > base;
      if (remoteCh && !localCh) { const p = await driveGet(f.id); if (p && p.state) { p.id = id; p.updated = p.updated || ru; await putProj(withPic(p, await getProj(id)), true); m.files[id] = { fid: f.id, u: p.updated }; smSet(m); changed = true; pulledIds.push(id); } continue; }
      if (localCh && !remoteCh) { m.files[id] = { fid: await drivePut(await getProj(id), f.id), u: x.updated }; smSet(m); continue; }
      // changed on both devices since the last sync: the newest wins; the other is kept as a copy so nothing is lost
      const p = await driveGet(f.id), loc = await getProj(id); if (!p || !p.state || !loc) continue; p.id = id; p.updated = p.updated || ru;
      const pNew = p.updated > loc.updated, newer = pNew ? withPic(p, loc) : loc, older = pNew ? loc : p;
      if (sigOf(older.state) === sigOf(newer.state)) { await putProj(newer, true); m.files[id] = { fid: pNew ? f.id : await drivePut(newer, f.id), u: newer.updated }; smSet(m); changed = true; continue; }
      await putProj(newer, true); if (pNew) pulledIds.push(id);
      const cp = { id: newId(), name: (older.name + ' (other device ' + shortDay(older.updated) + ')').slice(0, 60), updated: older.updated, state: Object.assign({}, older.state) }; cp.state.pid = cp.id; cp.state.name = cp.name; await putProj(cp, true);
      m.files[id] = { fid: pNew ? f.id : await drivePut(newer, f.id), u: newer.updated }; m.files[cp.id] = { fid: await drivePut(cp, null), u: cp.updated }; seen.add(cp.id); smSet(m); changed = true; }
    for (const x of await idx()) { if (seen.has(x.id)) continue; const rec = m.files[x.id];
      if (rec && rec.fid && x.updated <= rec.u) { await delProj(x.id); delete m.files[x.id]; smSet(m); changed = true; if (S.pid === x.id && editing()) toast(`"${x.name}" was deleted on your other device - it is still open here; it is saved again if you change it.`, 5000); if (S.pid === x.id) { lastSig.delete(x.id); } continue; } // deleted on the other device
      const full = await getProj(x.id); if (full) { m.files[x.id] = { fid: await drivePut(full, null), u: x.updated }; smSet(m); } }
    m.last = Date.now(); m.connected = true; smSet(m); for (const id of pulledIds) await pulled(id); if (changed) { await listUI(); refreshHome(); } return changed; }
  function syncNow(interactive) { const m = sm(); if (!m.connected && !interactive) return Promise.resolve();
    if (!navigator.onLine) { sy.state = 'offline'; statusUI(); return Promise.resolve(); }
    if (sy.busy) { sy.again = true; return sy.busy; }
    if (!interactive && !tokLoad()) { sy.state = 'auth'; statusUI(); return Promise.resolve(); } // never pops up by itself
    sy.state = 'busy'; statusUI();
    sy.busy = (interactive ? getToken(true) : Promise.resolve()).then(() => withTimeout(syncRun(), 600000, 'timeout')).then(() => { sy.state = 'ok'; rememberEmail(); },
      e => { const msg = String(e && e.message); sy.err = msg; sy.state = msg === 'closed' || msg === 'denied' ? (sm().connected ? 'auth' : 'off') : msg === 'auth' ? 'auth' : (!navigator.onLine || msg === 'offline' || e instanceof TypeError ? 'offline' : 'err'); if (msg === 'denied') sy.state = 'denied'; console.warn('sync', e); })
      .catch(e => console.warn('sync', e)).finally(() => { sy.busy = null; statusUI(); if (sy.again) { sy.again = false; syncSoon(); } });
    return sy.busy; }
  function syncSoon(fast) { if (!sm().connected) return; if (!tokLoad()) { sy.state = 'auth'; statusUI(); return; } clearTimeout(sy.t); sy.t = setTimeout(() => syncNow(false), fast ? 300 : 6000); }
  function markDel(id) { const m = sm(); if (!m.connected) return; if (m.files[id]) { m.del.push(id); smSet(m); } syncSoon(1); }
  const ago = t => { const s = (Date.now() - t) / 1000; return s < 60 ? 'just now' : s < 3600 ? Math.round(s / 60) + ' min ago' : s < 86400 ? Math.round(s / 3600) + ' h ago' : 'on ' + shortDay(t); };
  function statusText() { const m = sm();
    if (!m.connected) return sy.state === 'denied' ? 'Google said no - this Google account is not on the allowed list yet (see Help).' : sy.state === 'auth' || sy.state === 'err' ? 'Could not connect - try again.' : sy.state === 'busy' ? '☁ Connecting…' : 'Sign in once to keep your projects the same on your phone and tablet.';
    return sy.state === 'busy' ? '☁ Syncing…' : sy.state === 'offline' ? '☁ Offline - will sync when back online' : sy.state === 'auth' ? '☁ Tap Sync now to sign in again (Google asks every so often)' : sy.state === 'err' ? '☁ Sync problem - tap Sync now to try again' : m.last ? '☁ Synced ' + ago(m.last) : '☁ Connected'; }
  function statusUI() { const m = sm(), st = $('syncStatus'); if (st) { st.className = 'syncst ' + sy.state; st.textContent = statusText(); }
    if ($('syncWho')) $('syncWho').textContent = m.connected && m.email ? m.email : ''; if ($('syncNote')) { $('syncNote').textContent = sy.note; $('syncNote').hidden = !sy.note; }
    if ($('syncConnect')) { $('syncConnect').hidden = !!m.connected; $('syncNow').hidden = !m.connected; $('syncOut').hidden = !m.connected; $('syncNow').disabled = sy.state === 'busy'; }
    const ed = $('syncEd'); if (ed) ed.textContent = m.connected ? statusText() : ''; }
  $('syncConnect').onclick = () => syncNow(true).then(() => { if (sy.state === 'ok') toast('Google Drive connected - your projects now sync'); });
  $('syncNow').onclick = () => syncNow(!tokLoad());
  $('syncOut').onclick = () => { if (!confirm('Stop syncing on this device? Your projects stay here and in your Google Drive.')) return; const m = sm(); m.connected = false; m.email = ''; smSet(m); tokForget(); sy.state = 'off'; statusUI(); };
  window.addEventListener('online', () => syncSoon(1)); window.addEventListener('offline', () => { sy.state = 'offline'; statusUI(); });
  document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'visible') syncSoon(1); });
  setInterval(statusUI, 30000);
  window.PJ = { saved, init, open, listUI, idx, getProj, putProj, delProj, newId, background: () => syncNow(false), syncNow, syncSoon, sm, sy, statusUI, statusText, PFX, PIC_LIMIT };
  init();
})();
