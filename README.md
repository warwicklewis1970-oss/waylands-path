# Waylands Path

Sister app to [Wayland Forge](https://warwicklewis1970-oss.github.io/wayland-forge/). Turn AI line art, a drawing, a logo or a messy SVG into clean laser lines, tidy them with simple Inkscape-style node tools, and export LaserGRBL files.

**Open it:** https://warwicklewis1970-oss.github.io/waylands-path/ (install it from the browser menu; it works offline).

1. **Picture** – PNG, JPG or SVG line drawing. Transparent areas count as white. (Photo tracing was removed in v3.)
2. **Trace** (v3.1) – one clean centre line per drawn line; small pictures are enlarged first so fine lines survive, faint thin lines are picked up, and solid dark shapes (filled windows, hinges) are traced round their edge instead of down the middle. Junctions meet exactly on a shared point, lines carry straight on through crossings, nearly level/upright lines are made exactly level/upright, and there are points only where a line turns, curves or ends (real curves, not hundreds of dots). The **grey line** is the outside edge of the design = the laser cut; it goes round every etch line and can be edited like any other line. Sliders: *Detail*, *Corners*. Advanced: straighten, invert, trace again.
3. **Tools (v4)** – seven big tools; one finger does the tool, two fingers move/zoom, ⤢ Fit re-centres. **Point to point** (tap, tap: straight lines that snap onto lines; drag a line to bend it, drag a dot to move it), **Draw** (freehand, smoothed, ends snap), **Break** (tap two points: remove the bit between, or add a line across a gap; preview + Confirm), **Eraser** (rub out; brush size; *Doubled lines only*; tap = remove to the junctions), **Thickness** (per line width in mm and *Double line* with a 0.01 mm distance stepper; *Apply to all lines*), **Cut out** (tap inside an area → it becomes a cut hole; drag any cut line or point), **Clear space** (v4.2: tap inside closed areas to shade them – tap again to unselect – or drag a box; optional *Include border lines*; advanced *Points* mode shades a polygon; Clear removes every etch line inside, clipped at the edge). Everything else is in **☰ Menu** (incl. *Add shape*); **Export** is in the top bar. The older Nodes / Line / Pen tools are still in the code but no longer on the toolbar.
4. **Tidy** – close small gaps, remove doubled-up lines, remove stray bits. Undo / Redo, pinch zoom.
5. **Size & cut** – width in mm of the whole piece (cut line included), line width, cut out along the grey line.
6. **Laser steps** – Engrave lines (Vector, 25 %, F3000) then Cut outside (Vector, 100 %, F1000, 3 passes). Etch first, cut last, same 0,0. Every move between strokes is laser off (`M5`, `G0 … S0`, `M4 S0`); strokes are chained and ordered to keep travel short.
7. **Export** – a Windows-ready zip with one `.nc` per step, an SVG in mm (true curves), one SVG per step and a read-me.

Your last project is kept on the device (IndexedDB).

## v4.1
- **Select** tool (first, on by default): tap a line and the whole line turns blue (pieces that carry straight on through a junction are included). Action bar: **Delete line**, **Break** (tap where it stops, then where it starts again - snaps along the line - red dashed preview, Confirm), **Thickness**, **Make cut / Make etch**. Drag moves the picture.
- **Updates arrive by themselves:** the app checks `version.json` when it opens and whenever it comes back to the front; a new version reloads by itself once you have stopped touching the screen for a few seconds (your project is saved and reopened), or tap the **Update now** banner. Version shown in the top bar.
- No laser changes.

## v4
- **Simple editor:** the 7 tools above replace Move / Nodes / Line / Shapes / Pen / Delete. Menu sheet closed by default. Taps pick the nearest etch line - the outer cut never steals a tap.
- **Thickness / double line (laser change, only on lines you set):** a line with a thickness W is burnt as ceil((W−lw)/lw)+1 passes side by side, spread evenly across W−lw (lw = Line width, 0.3 mm default), e.g. 0.8 mm = 3 passes at −0.25 / 0 / +0.25 mm. A double line at distance D is two such lines at ±D/2 (passes that would land on top of each other are dropped). Applies to Vector, Line To Line and Dithering exports and the SVGs; the read-me lists it. Lines without a thickness are byte-for-byte what v3.3 wrote.
- **Outer cut:** *Make outer cut line* now goes round the existing outline too (before, it could cut through traced outlines such as battlements and leaves), defaults to a 0.5 mm **Outline gap** (was 3 mm) and a **Tightness** of 8 (1.5 mm bridging, was 4 mm minimum). The traced cut itself is unchanged.
- The faint picture behind the lines is off by default (☰ Menu › Picture to show it) so the only grey on screen is the real cut line.

## v3.3
- **Cut order:** holes, windows and slots (cut lines inside another closed cut line) are cut first, deepest first, each with all its passes; outer outlines last. Option in Laser steps › Cut: *Passes per line (safer)* (default) or *All lines each pass* (still holes first in every pass).
- **Any line can be a cut:** (v4: Cut out tool) Nodes › tap a line › **Make cut** / **Make etch**. Open cut lines are allowed but warned about.
- **Trace mode:** *Dark lines on light paper* / *Light lines on dark* / *Auto*, and it really forces the mode. Light paper is flattened for uneven lighting and coloured ruled lines fade; **Remove faint lines** slider for pencil rules and smudges.
- **Tracing helper:** if js/worker.js can't load, errors, or stays silent, tracing runs on the main screen with a message - never "Tracing…" forever.
- **Laser steps:** defaults live in one place (laser.js `DEF`), changes are kept per device, **Reset to defaults** button.
- **Sheet:** blank width × height (200 × 200 mm), margin (5 mm), Centre or Bottom-left at margin, copies across × down with a gap, Fit as many as possible, preview. With Sheet on, laser 0,0 = the blank's bottom-left corner in every file.
