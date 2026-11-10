# Build notes

This delivery combines the full embedded-data Mission Control application with the more complete creative-interface stylesheet and the technical correctness updates from the improved archive.

Changes made for this delivery:
- Used the correctness-updated route planner and interaction code.
- Restored the recenter and panel-toggle actions in the improved UI code so the visible floating map tools remain functional.
- Kept the full embedded terrain data unchanged.
- Kept local vendor libraries; no external runtime dependencies were added.
- Added a Windows run guide and an explicit validation/limitations section.

Validation in the build environment:
- JavaScript syntax checks: passed.
- Planner tests: 15/15 passed.
- Raster pipeline tests: 3/3 passed (synthetic fixtures only).
- Archive integrity: checked after packaging.

Not claimed: zero bugs, GPU/browser compatibility on every device, or fresh validation of source GeoTIFFs. The source GeoTIFFs were not present in the supplied ZIP archives.

## 2026-11-09 solar layout and descent integration

- Moved the 3D solar-system viewport before the copy panel in the opening-screen markup and reversed the desktop grid proportions so the solar system (including the Sun) occupies the left, wider column.
- Connected the Initiate descent action to a two-stage terrain-camera sequence: a high-altitude approach toward the embedded Jezero terrain, a low-altitude pass, and a settle into the terrain overview. Orbit controls are temporarily disabled during the scripted camera move and restored at completion.
- Kept the existing procedural planetary textures, selectable planets, orbit controls, terrain layers, route planner, and embedded data.
- Validation rerun: all application JavaScript syntax checks passed; planner tests 15/15 passed; raster-pipeline tests 3/3 passed.
- The descent is a cinematic visualization, not a physically simulated Mars entry trajectory or a validated spacecraft flight profile. Actual browser/GPU appearance still requires checking on the target computer.

## 2026-11-10 continuation: orbital focus and landing handoff

- Planet selection and reset now use eased camera transitions. When focused on a moving planet, the camera tracks its orbital movement; manual orbit input releases the focus lock.
- Added individual orbital-plane inclinations and axial tilts for all eight planets, with retrograde spin direction for Venus and Uranus. Distances, diameters, rates, and textures remain schematic/illustrative as disclosed in the UI.
- Aligned the descent camera target and displayed coordinates with the existing approximate Perseverance landing target in the embedded Jezero raster. Added the NASA Langley touchdown coordinate reference (18.44463° N, 77.45088° E); raster placement remains provisional because original georeferencing/source rasters were not supplied.
- `node --check` passed for all four application JavaScript files; planner suite passed 15/15.
- Raster-pipeline suite could not start in this environment: Python reports `ModuleNotFoundError: No module named 'numpy'`. No raster pipeline files or embedded datasets were changed.
- Browser preview was attempted but local socket access is blocked in this environment. No live WebGL, responsive-layout, or GPU verification is claimed.
- Remaining architecture work: solar-system and terrain scenes still own separate WebGL renderers and animation loops. A shared renderer/lifecycle refactor remains for a later milestone. The supplied archive also contains no OpenLayers 2D explorer or visual-reference GIF to preserve/compare.

## 2026-11-10 critical planetary and journey fixes

- Fixed the `BEGIN MARS EXPEDITION` no-op: `ARES_SOLAR` now exposes `beginJourney`, `cancelJourney`, `overview`, and `getJourneyState`. The journey dispatches staged progress events, guards against duplicate runs, supports cancellation, and reports errors while restoring controls.
- The journey starts at the current system camera, approaches Mars, zooms to the Jezero optical region on the globe, and crossfades into the existing terrain. Terrain camera placement occurs during the handoff rather than on launch. Added a terrain-screen return button for Solar System overview.
- Removed generated procedural planetary maps and Jupiter's separate floating spot mesh. The renderer now loads the bundled planet maps with sRGB handling; the Jezero optical raster appears as a geographically located globe patch. Texture gaps and representative/low-resolution maps are documented in `assets/planet-maps/README.md`.
- Rebuilt motion using separate orbital period, axial spin period, orbital inclination, axial tilt, and retrograde direction values. Orbit-rate control applies to revolution; pause/resume affects both revolution and axial rotation. Orbit and axial hierarchies are independent.
- Consolidated planet selection to a single handler in `solar-system.js`; the UI updates from its one `ares:planet-selected` event.
- Verification: JavaScript syntax checks passed; planner tests passed **15/15**. Pipeline tests were attempted but could not start because NumPy is unavailable. Browser preview was blocked by the browser URL policy, so live WebGL appearance, the eight planet screenshots, and continuous video recording are not verified or included.

## 2026-11-10 planet appearance and pace refinement

- Earth now uses NASA Goddard SVS's 8192×4096 equirectangular Blue Marble/cloud map, with a restrained blue atmospheric rim. It replaces the cloudless base map that made the Earth read as a flat-colored globe. Its cloud layer is a 2007 composite and is documented as visual context, not live weather.
- The visual clocks were slowed: one simulated Earth year now takes 90 real seconds at 1× orbit rate, and one simulated axial day takes 30 real seconds. Orbital periods remain proportionate, the speed selector scales revolution, and axial rotation stays independent.
- Test coverage checks these displayed rates as well as the signed-period behavior for all eight planets.

## 2026-11-10 arrival visibility and motion correction

- Root cause of the arrival black screen: stage visibility was restored only for `handoff-pending`, then the completion handler removed that class; there was no `terrain-active` visibility rule. Also, the opaque Solar System parent still covered the stage during the fade. Added explicit `solar-system-mode`, `handoff-pending`, and `terrain-active` CSS/JS lifecycle states, with a transparent Solar System layer during handoff.
- The terrain canvas is initialized before handoff and now reports stage size, canvas size, mesh readiness, triangles, camera/target, texture readiness, and visible render-frame count through `ARES.terrainDiagnostics()`.
- `A.prepareDescent()` now starts a 1.8-second two-waypoint camera move centered on the embedded landing target. It starts as the terrain renderer becomes visible, so the Mars globe fades into a prepared Jezero view that continues descending to the Mission Control framing. Controls become interactive at arrival; cancellation clears the terrain move.
- Orbital and axial motion now use separate accumulated elapsed-time clocks and pure period-based angle helpers. Orbit-speed scales revolution only; pause freezes both clocks. Signed sidereal periods are converted once against the tilted pole, avoiding double inversion for Venus and Uranus. Saturn's rings now lie in its equatorial plane.
- Added `tests/solar-motion.test.js` and `tests/arrival-lifecycle.test.js`. Current checks: JS syntax passed; planner **15/15**; motion math **8/8 bodies**; arrival lifecycle contract passed. Raster pipeline still cannot start because NumPy is absent. Browser/WebGL preview is blocked by browser URL policy; screenshots, console inspection, and a journey recording are therefore not available.
