# Waylands Path

Sister app to [Wayland Forge](https://warwicklewis1970-oss.github.io/wayland-forge/). Turn AI line art, a drawing, a logo or a messy SVG into clean laser lines, tidy them with simple Inkscape-style node tools, and export LaserGRBL files.

**Open it:** https://warwicklewis1970-oss.github.io/waylands-path/ (install it from the browser menu; it works offline).

1. **Picture** – PNG, JPG or SVG line drawing. Transparent areas count as white. (Photo tracing was removed in v3.)
2. **Trace** (v3.1) – one clean centre line per drawn line; small pictures are enlarged first so fine lines survive, faint thin lines are picked up, and solid dark shapes (filled windows, hinges) are traced round their edge instead of down the middle. Junctions meet exactly on a shared point, lines carry straight on through crossings, nearly level/upright lines are made exactly level/upright, and there are points only where a line turns, curves or ends (real curves, not hundreds of dots). The **grey line** is the outside edge of the design = the laser cut; it goes round every etch line and can be edited like any other line. Sliders: *Detail*, *Corners*. Advanced: straighten, invert, trace again.
3. **Tools (v4)** – seven big tools; one finger does the tool, two fingers move/zoom, ⤢ Fit re-centres. **Point to point** (tap, tap: straight lines that snap onto lines; drag a line to bend it, drag a dot to move it), **Draw** (freehand, smoothed, ends snap), **Break** (tap two points: remove the bit between, or add a line across a gap; preview + Confirm), **Eraser** (rub out; brush size; *Doubled lines only*; tap = remove to the junctions), **Thickness** (per line width in mm and *Double line* with a 0.01 mm distance stepper; *Apply to all lines*), **Cut out** (tap inside an area → it becomes a cut hole; drag any cut line or point), **Clear space** (v4.2: tap inside closed areas to shade them – tap again to unselect – or drag a box; optional *Include border lines*; advanced *Points* mode shades a polygon; Clear removes every etch line inside, clipped at the edge). Everything else is in **☰ Menu** (incl. *Add shape*); **Export** is in the top bar. The older Nodes / Line / Pen tools are still in the code but no longer on the toolbar.
4. **Tidy** – close small gaps, remove doubled-up lines, remove stray bits. Undo / Redo, pinch zoom.
5. **Size & cut** – width in mm of the whole piece (cut line included), line width, cut out along the grey line.
6. **Laser steps** – Engrave lines (Vector, 25 %, F3000) then Cut outside (Vector, 100 %, F1000, 3 passes). Etch first, cut last, same 0,0. Every move between strokes is laser off (`M5`, `G0 … S0`, `M4 S0`); strokes are chained and ordered to keep travel short.
7. **Export** – (v4.5) tapping Export opens the **Burn settings** sheet, the same layout and wording as Wayland Forge: *Step 1 – Etch lines* and *Step 2 – Cut out*, each with Mode, Power %, Speed and Passes (cut also keeps *Pass order*), a speed check, and *More laser settings* (Laser max S, Blank & copies…, Reset to defaults). Choose *Save as* (one .zip / separate files / Share / SVG only) and tap Export. The files are unchanged from v4.4: a Windows-ready zip with one `.nc` per step, an SVG in mm (true curves), one SVG per step and a read-me.

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

## v4.3
- **Cut out**: add as many cut outs as you like, one after another. Every cut-away part is **shaded grey** (holes and everything outside the grey outer edge), so you can see what the laser will remove. A tap inside an area picks the area even near a grey line (only a tap right on a grey line picks the line). Tap a grey cut out to pick it → **Make etch line** turns it back. Each cut out is its own Undo step.
- Cut outs are kept when the picture is traced again (they were lost before), and saved when the app goes to the background.
- If a trace finds no outside edge, a grey outer cut line is made automatically.
- **Draw / pen**: a stylus is never treated as a second finger; the palm is ignored while the pen is down; an extra finger no longer cancels a stroke; ink appears from the first pixel (no dead zone), every pen sample is used, and the live stroke is drawn on its own layer without redrawing the picture. Smoothing happens on pen-up.

## v4.7 – Hanging hole (exact size in mm)

☰ Menu › **Add shape** › **Hanging hole**. Type the hole Ø in mm (default 4 mm, the same as Wayland Forge; the last size used is remembered for every project), then tap the design where it goes, or tap **⤒ Centre at top** (it leaves the typed mm of wood above the hole, default 3 mm). The size shows on screen next to each hole (Ø 4 mm). The hole is a cut by default (untick *Cut it out* to etch a ring), a true circle cut as one line, inside cuts first with your cut passes. Drag it to move it (Shapes › Hanging hole or the Cut out tool); type a new Ø to resize it. Its mm size is rebuilt exactly whenever anything changes, so a new Size, the outer cut rebuild, Clear space or the eraser can't change it. Optional **Kerf** (default 0): the laser follows a line Ø − kerf so the finished hole equals the typed Ø. Designs without a hanging hole give byte-identical laser files to v4.6.

## v4.6 – Designs from Wayland Forge

Wayland Forge's **✏️ Send to Waylands Path** button opens its design here as a new project: the true mm size is kept, letters arrive as outlines, Forge's cut lines stay cuts (shaded grey), ring lines keep their width, and laser 0,0 is the bottom-left corner of the design. If Waylands Path was opened another way, the home screen shows "A design from Wayland Forge is waiting" with Open it / Not now. Laser output for existing designs is byte-for-byte the same as v4.5.

## v4.5 – Export opens Burn settings (like Wayland Forge)

Export now opens the Burn settings sheet before saving. The laser files are byte-for-byte the same as v4.4 for the same settings (checked on defaults, custom power/speed/passes with a 2-copy blank, and Line To Line etch). Defaults are unchanged: etch Vector 25% at 3000 mm/min, cut Vector 100% at 1000 mm/min, 3 passes, holes first.

## v4.4 – My projects + Google Drive sync
- **My projects** on the home screen: every design is saved on the device as you work, by name, with date and size. Tap to open, ✎ to rename, 🗑 to delete. The project from v4.3 is added to the list automatically.
- **Sign in with Google to sync**: projects go into the app's hidden Google Drive app-data folder (files `wpp-<id>.json`; Wayland Forge uses `wfp-` files in the same hidden folder, so the two apps never mix). Same Google sign-in client as Wayland Forge.
- Syncs a few seconds after each save, straight away when the app goes to the background, and when the app is opened or comes back. Newest save wins; if the same project was changed on both devices before syncing, the older one is kept as a copy "(other device …)". Deletes and renames reach the other device.
- Status: "☁ Synced 2 min ago" on the home screen and in the Menu. Google sign-in lasts about an hour; after that the app never pops up by itself – tap **Sync now**.
- Size: each project shows its size. Over 4 MB uploads in one go with the large-file upload; over 20 MB the lines and settings sync but the picture stays on that device.
- Fix: the service worker no longer deletes Wayland Forge's offline cache (same website).

