// Waylands Path - tracing runs here so the screen stays smooth while sliders move.
importScripts('geom.js', 'trace.js');
self.onmessage = e => { const { id, type, img, opts } = e.data;
  try { if (type === 'analyse') { const r = T.analyse(img); self.postMessage({ id, guide: r.guide, outside: r.outside, photo: r.photo, hasAlpha: r.hasAlpha }); return; }
    const r = T.trace(img, opts); self.postMessage({ id, paths: r.paths, photo: r.photo, inverted: r.inverted, w: r.w, h: r.h }); }
  catch (err) { self.postMessage({ id, error: String(err && err.message || err) }); } };
