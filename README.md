# Waylands Path

Sister app to [Wayland Forge](https://warwicklewis1970-oss.github.io/wayland-forge/). Turn a photo (people, pets), a drawing, a logo or a messy SVG into clean line art, tidy it up with big touch tools, and export LaserGRBL files.

**Open it:** https://warwicklewis1970-oss.github.io/waylands-path/ (install it from the browser menu; it works offline).

1. **Picture** – photo, PNG, JPG or SVG. Transparent areas count as white.
2. **Trace** – Lines, Outlines or Outside edge, *Detail* and *Remove specks* sliders, live preview. Own tracer (v2): Canny edges with sub-pixel peaks for photos, Zhang-Suen centre lines for drawings, sub-pixel marching squares for outlines and the outside edge (transparency or border-colour silhouette), very low simplify tolerance. A grey edge guide (display only, never exported) shows the detected edge.
3. **Tidy up** – Erase (tap a line or brush), Draw, Join (drag between loose ends or auto *Join gaps*), Points (tap/drag/nudge single points), Select (box-select points; Add points ×2, Fit to edge, Reduce, Delete), optional snapping to the grey edge, Smooth / simplify, remove stray bits under X mm, Undo / Redo, pinch zoom.
4. **Size & outer cut** – width in mm (aspect kept), optional outer cut around the lines or along the picture's outside edge.
5. **Laser steps** – Engrave lines (Vector, 25 %, 3000) and Cut outside (Vector, 100 %, 1000, 3 passes). Mode, power, speed and passes per step.
6. **Export** – a Windows-ready zip with one `.nc` per step (same 0,0 = bottom-left of the design area, so they line up), an SVG in mm, one SVG per step and a read-me. Share button where the device allows it, otherwise it saves the zip.

Your last project is kept on the device (IndexedDB).
