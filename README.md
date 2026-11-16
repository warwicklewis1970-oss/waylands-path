# Waylands Path

Sister app to [Wayland Forge](https://warwicklewis1970-oss.github.io/wayland-forge/). Turn AI line art, a drawing, a logo or a messy SVG into clean laser lines, tidy them with simple Inkscape-style node tools, and export LaserGRBL files.

**Open it:** https://warwicklewis1970-oss.github.io/waylands-path/ (install it from the browser menu; it works offline).

1. **Picture** – PNG, JPG or SVG line drawing. Transparent areas count as white. (Photo tracing was removed in v3.)
2. **Trace** (v3) – one clean centre line per drawn line. Junctions meet exactly on a shared point, lines carry straight on through crossings, nearly level/upright lines are made exactly level/upright, and there are points only where a line turns, curves or ends (real curves, not hundreds of dots). The **grey line** is the outside edge of the design = the laser cut; it goes round every etch line and can be edited like any other line. Sliders: *Detail*, *Corners*. Advanced: straighten, invert, trace again.
3. **Tools** – Move/zoom, **Points** (tap a line, then drag points or their handles; Corner / Smooth, Make line / Make curve, Add, Delete, Break, Join, Delete segment; More: nudge, Straighten, Pick whole line), **Pen**, **Delete** (to the junctions, or whole line) and **Skip** (*Skip over*: tap a line, then the shape in the way – the part inside goes and the line stops exactly on the shape's edge both sides; *Continue across*: tap two pieces of a line – they join up in a straight line through the gap and stop on the shape in between). The gap is laser-off travel.
4. **Tidy** – close small gaps, remove doubled-up lines, remove stray bits. Undo / Redo, pinch zoom.
5. **Size & cut** – width in mm of the whole piece (cut line included), line width, cut out along the grey line.
6. **Laser steps** – Engrave lines (Vector, 25 %, F3000) then Cut outside (Vector, 100 %, F1000, 3 passes). Etch first, cut last, same 0,0. Every move between strokes is laser off (`M5`, `G0 … S0`, `M4 S0`); strokes are chained and ordered to keep travel short.
7. **Export** – a Windows-ready zip with one `.nc` per step, an SVG in mm (true curves), one SVG per step and a read-me.

Your last project is kept on the device (IndexedDB).
