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

## v5.6 - Sharper traces, tabs and slots, add another picture
- Line art is traced as tight contours (both edges of each stroke, sharp star tips, smooth curves, rings and faces kept). Pictures are enlarged first. Photo tracing is unchanged.
- **Tabs & slots:** tabs on a chosen edge (Bottom / Top / Left / Right), matching slots you tap to place and can turn 90°, crush bumps, and a Kerf setting (how much wood the laser burns away). Tabs are cut a little larger and slots a little smaller so the finished sizes match the typed boxes. Standard (all adjustable): 10 × 4 mm tabs, 2 tabs, 35 mm gap, 0.15 × 0.8 mm bumps, 4 mm plywood, 10 × 3.9 mm slots, 0.1 mm kerf. No bases are built. Reset to defaults is in the panel.
- **Add another picture** (Menu › Picture): traces a second line drawing or photo and places it as a group you can move, size, turn or flip, then ✓ Done. Optional: only keep lines inside the grey outside cut. Undo takes it off.
- Saved projects that do not use the new tabs, slots or overlay stay byte-identical on export. New traces of a picture will differ (more faithful). Cut settings are unchanged.

## v5.5 - Cleaner tracing, and you can edit the outside cut
- Bold black-and-white line art (thick outlined shapes, stars, moons, faces) keeps both edges of each stroke, plus eyes, smiles, rings, slots and holes.
- The grey cut line follows the real outer outline of the piece. It is not a coarse blob, and a line is only omitted from the etching when it really is that same outer line.
- The grey outside cut can be tapped and edited like any other line: Select (Delete line, Make cut / Make etch), Eraser, Break, Point to point, and Thickness (thickness applies once you Make etch). Deleting it leaves no outside cut, and it is not put back automatically (Undo brings it back; *Make outer cut line* makes a new one if you want one).
- Clone: 👆 Tap one can copy the outside cut. A Lasso, Box or All does not include it.
- Already-saved projects are unchanged if you do not edit the cut. A new import or a Retrace will produce different, more faithful lines. If you edit the cut, the cut file follows your new path, with the same cut settings and cut-last order.

## v5.4 - The lasso waits for you
- In **Clone**, after drawing a **➰ Lasso** loop or a **⬚ Box** (or tapping **▣ All**), the area stays on screen with white squares round it. Nothing is picked or copied yet.
- Drag a **corner square** to make the area bigger or smaller, a **side dot** to change just the width or height, or drag **inside** it to move it. The lines inside turn orange and the panel and the label over the area show how many are picked (for example "12 lines picked").
- **+ Clone this area** makes the copy (then size / turn / flip / Reset / Delete / Done as before). **➰ Draw again** clears the area so you can draw a new one. **✕ Cancel** drops it with no change.
- **Trace an area** has the same squares: resize or move the loop and it is traced again before you tap **✓ Use these lines**.
- Laser files: unchanged. A copy made with + Clone this area burns byte-for-byte the same as v5.3 for the same area.

## v5.3 - Clone with a lasso, Flip, Trace an area
- **Clone**: choose **👆 Tap one**, **➰ Lasso** (draw a loop with one finger) or **⬚ Box** (drag a rectangle), or **▣ Select all**. Everything inside (etch lines, cut outs, hanging holes) is picked as **one group**. Lines partly inside come whole; tick **Trim lines at the edge** to cut them at the loop instead (cut outs and holes always stay whole). The outer cut is never included.
- **+ Clone** copies the whole group; move, size (keeps shape), turn, nudge, **↔ Flip horizontal**, **↕ Flip vertical**, **↺ Reset to original** (also undoes flips) and **🗑 Delete copy** all work on the group. Holes stay true circles. Groups go into **Recent clones** (last 3, with a picture) to drop into other projects.
- **Photo: 🔍 Trace an area in more detail** (Trace section): draw round one part (a face, the eyes) and only that part is traced again from the full-size photo with more lines and points (own Detail / Smoothness / Ignore small bits, live orange preview). **♻ Replace lines inside** (lines crossing the edge are cut there) or **＋ Add to the lines**. One Undo.
- New photo traces start richer: Detail 6, Smoothness 4, Ignore small bits 3 (was 5 / 5 / 4). Photos already traced keep their saved lines and settings.
- Laser: nothing changes unless you use these. Copies, flipped copies and area lines burn like any other lines (etch first; holes and cut outs inside the outer cut before it). A copy placed outside the outer cut is its own outline and is cut after it.

## v5.2 - Photo to line drawing, faint photo behind
- Home → **📷 Turn a photo into a line drawing** (or Menu → Picture → Photo). Pets, people, buildings, objects.
- Trace section: choose **✏️ A line drawing** or **📷 A photo**. Photo sliders: **Detail**, **Smoothness**, **Ignore small bits**, plus **↺ Reset to defaults**. The last values are remembered.
- Runs offline on the phone (edge finding → joined, smoothed centre lines).
- The original photo shows **faintly behind the lines** while you edit, with the 🖼 Photo button to turn it on or off and a **How faint** slider (default 25%). It is screen only: never in the G-code or SVG. This works for line-art projects too.
- Draw, Point to point, Break, Eraser, Clear space and Clone all work over the faint photo.
- Laser: line-art tracing is unchanged (byte-identical to v5.1). Photo mode gives ordinary etch lines. **No automatic cut line is added for photos**: use ⬡ Add shape (or Make cut) if you want it cut out.

## v5.1 - Break fix, recent clones
- **Break**: two buttons at the top, **✂ Remove a section** (the default) and **＋ Add a line**. In Remove, the first tap picks the
  whole joined line (shown blue, even if it is made of several traced pieces), the second tap on the same line marks the end, red dashes show
  what goes, then **✓ Remove it**. Undo puts it back. Before, a line made of several pieces (most traced lines) nearly always became "add a line".
- **Clone**: the last 3 things you cloned are kept on this device (across projects and restarts) as a **Recent clones** row with pictures.
  Tap one to place a fresh copy in the middle of the screen, same type and size in mm, ready to move, size, turn or Reset.
- **File names**: every export is named after the project plus the date and time, e.g.
  `Tower door 2026-11-19 2300 1 engrave lines VEC P25 F3000.nc`, `... 2 cut outside VEC P100 F1000 x3.nc`, `... laser.zip`, `... artwork 150x162mm.svg`,
  so exports never overwrite or get "(1)" copies in Downloads and are easy to tell apart in LaserGRBL. Names are Windows-safe.
  The G-code and SVG contents are byte-for-byte the same; only the read me lists the new names.
- **Projects**: a new or renamed project never takes a name another project already has ("dog" -> "dog 2"); older same-name projects
  are flagged in My projects with "tap ✎ to rename".
- Laser output is unchanged unless you use these: a removed section is not burnt, a placed recent clone burns like the original.

## v5.0 - Clone tool

New **Clone** button at the end of the editor toolbar. Copy a line, shape, cut out or hanging hole, then size, turn and move the copy, with **Reset to original**.

1. Tap **Clone** in the toolbar, then tap the line, shape, cut out (tap inside it) or hanging hole you want.
2. Tap **+ Clone**: a copy appears 5 mm down and right, picked and outlined in blue.
3. Drag the copy to move it, drag the round **corner handle** to make it bigger or smaller, drag the **turn handle** above it to turn it (it clicks to 15° steps). Or type Width / Height mm, Size % (Keep shape ties width and height), Turn ° (⟲15° ⟳15° 90° buttons), and nudge with the arrows (0.5 / 1 / 5 / 10 mm).
4. **Reset to original** puts the copy back exactly as it was when cloned. **Delete copy** removes it (originals can't be deleted here). **Undo** takes back each step. **Done** goes back to Select.

* Size, turn and move also work on an original you pick (Reset brings it back too).
* Copies keep their type: etch lines keep their thickness and double-line, cut outs stay inner cuts (grey), hanging holes stay true circles at their typed size (the size boxes change the diameter; holes can't be turned).
* The outside cut line can't be cloned - it follows the design (rebuild it with Cut out › Outer cut). Changing copies never changes the mm size of the rest of the design.
* Copies are saved in the project and in synced files. **Laser files are unchanged unless you use Clone**; copies burn exactly like the originals (etch first, holes and cut outs before the outer cut).

## v4.9 - Laser border (zero is a free corner)

When no blank is set, the laser files now leave a **border** (default **10 mm**, typed in mm, remembered on this device) round the design, like Wayland Forge's page border. Every etch and cut line (and the SVGs) moves right and up by the border, so laser 0,0 is a free corner and nothing burns closer than the border to zero - the tabs no longer sit right on the machine's edge.

* Set it in Export › More laser settings › **Border (no blank)**, or Menu › Sheet › **Border**. 0 = the old v4.8 behaviour (exactly the same files).
* Set your laser's zero the border distance below and left of where the design's bottom-left (the tab bottoms) should go. The read-me says so too.
* Files with **Place on a blank** turned on are unchanged (the blank already has its own margin).
* Curves at the very edge are no longer clipped by up to 0.04 mm (they were clamped to the design box before).

## v4.8 - Tabs for stands

Menu › Add shape › **Tabs** (after Hanging hole). Rectangular tabs joined to the bottom of the outside cut line, so the outside cut is one closed line that goes down and around each tab.

* **Standard tabs** button: 2 tabs, 10 mm wide, 4 mm deep, 35 mm gap between them, centred under the lowest edge, with 0.15 × 0.8 mm crush bumps in the middle of each tab's side faces (for the 10 × 3.9 mm base slot).
* Every size is a typed mm box (width, depth, number, gap, bump size, bump width). The last values used are remembered; **Reset to standard** puts the standard back.
* Shows the door body size; **Set body height** resizes the design so the body is exactly the typed height (standard 100 mm, 104 mm overall with tabs).
* Tap a tab to pick it, drag it along the bottom, remove it or all of them; Undo works.
* Holes and inner cuts are still cut first; the outside cut with the tabs is cut last with your cut passes. Remaking the outside cut keeps the tabs.
* Designs without tabs produce exactly the same G-code as v4.7.

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

