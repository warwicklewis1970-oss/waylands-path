// Waylands Path - tracing runs here so the screen stays smooth while sliders move.
// It says "ready" once its scripts load; if that never comes, the app traces on the main screen instead.
importScripts('bez.js', 'trace.js');
self.onmessage = e => { const { id, img, opts } = e.data;
  try { const r = T.lineArt(img, opts); self.postMessage(Object.assign({ id }, r)); }
  catch (err) { self.postMessage({ id, error: String(err && err.message || err) }); } };
self.postMessage({ ready: true });
