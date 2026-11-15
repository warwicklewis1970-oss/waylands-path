// Waylands Path - tracing runs here so the screen stays smooth while sliders move.
importScripts('geom.js', 'trace.js');
self.onmessage = e => { const { id, img, opts } = e.data;
  try { const r = T.trace(img, opts); self.postMessage({ id, paths: r.paths, photo: r.photo, inverted: r.inverted, w: r.w, h: r.h }); }
  catch (err) { self.postMessage({ id, error: String(err && err.message || err) }); } };
