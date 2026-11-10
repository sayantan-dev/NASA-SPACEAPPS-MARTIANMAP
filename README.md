# ARES — Mars Mission Control

An offline-capable, browser-based 3D terrain study and EVA planning interface for the embedded Jezero-region analysis grid.

## Run on Windows

1. Extract this ZIP to a normal folder.
2. Open the extracted `ARES-MARS-TERRAIN-LAB-PREMIUM` folder.
3. In the folder address bar, type `powershell` and press Enter.
4. Run:

   ```powershell
   py -m http.server 8000
   ```

5. Open <http://localhost:8000> in Chrome or Edge.
6. Select **BEGIN MARS EXPEDITION** to start the staged approach and terrain handoff. The opening scene is a live 3D solar-system model; drag to orbit the camera, scroll to zoom, select a planet, pause/resume, change orbital simulation speed, or reset the camera.

If the `py` command is unavailable, try `python -m http.server 8000`. Keep the terminal open while using the site. Press Ctrl+C to stop the server.

No npm install, external CDN, remote font, or internet connection is required at runtime.

## Included modules

- Interactive Three.js 3D solar system with the Sun and all eight planets, continuously animated orbital motion, inclined orbital planes, selectable planets, eased/following camera focus, orbit/zoom, pause/resume, speed control, and reset view
- Saturn ring geometry and bundled NASA/JPL planetary maps, with map-specific coverage and realism caveats in `assets/planet-maps/README.md`
- Independent period-based orbital revolution and axial rotation with disclosed schematic distances/radii and accelerated simulation time; rotation direction and inclination are represented separately
- Visual time rates: one simulated Earth year per 90 seconds at 1× orbit rate; one simulated axial day per 30 seconds. The orbit-rate selector scales revolution while the axial clock remains steady; Pause freezes both.
- Staged Mars approach, regional descent, cancellation, error recovery, and transition into the local Jezero terrain; the terrain screen has a return-to-system control
- 3D terrain overview with orbit, zoom, recenter, and inspection HUD
- Optical and hillshade layer composition and terrain overlays
- Elevation exaggeration and layer legend
- Scientific target markers and target details
- EVA route planning with start/destination selection, slope constraints, route alternatives, route metrics, and elevation profile
- Environmental planning panel with explicitly labelled modelled/assumed inputs
- Data and provenance explanations, including known limitations
- Guided mission interface
- Data and provenance explanations, including known limitations
- Guided mission interface
- ARES Mission Copilot — A separate, modular natural language intelligence overlay (`js/copilot-brain.js`) that handles usage walkthroughs, technical explanations, and data theory queries via a fuzzy-matching semantic scoring architecture.
- Real-time Camera Kinematics Link — Context-aware integration that dynamically manipulates the Three.js camera position vectors and active OrbitControls targets to focus the viewport on specific geological landscape coordinates (e.g., Jezero Crater Delta) based on chatbot dialogue topics.

## Data integrity and scientific limitations

The embedded `data/ares-data.js` is preserved from the supplied archive. The app does not download live NASA data. Its embedded terrain/imagery arrays are a pre-generated browser analysis product; source GeoTIFFs were not included in the supplied archives, so this build does not independently revalidate the original rasters.

The interface distinguishes observed, derived, provisional, modelled, and assumed values. In particular:

- Slope products remain provisional and have a documented east-west distortion and a striped patch.
- The descent uses NASA-published Perseverance touchdown coordinates (18.44463° N, 77.45088° E); placement on the embedded raster remains approximate/provisional.
- The 25 cm optical mosaic is not included; the embedded optical layer is the 2 m preview.
- EVA travel time and environmental estimates depend on user-adjustable assumptions; they are not mission-certified predictions.
- Hazard classes and visual terrain products are decision-support aids, not certified astronaut safety limits.

Read **Data & Provenance** inside the application and `TECHNICAL_REVIEW.md` before interpreting results scientifically.

## Validation performed on this package

From this folder:

```powershell
node --check js/solar-system.js
node --check js/model.js
node --check js/scene.js
node --check js/ui.js
node --check js/copilot-brain.js
node tests/planner.test.js
node tests/solar-motion.test.js
node tests/arrival-lifecycle.test.js
python tests/pipeline.test.py
```

The planner suite covers 15 cases. The Solar System math suite checks all eight bodies, signed sidereal periods, axis-tilt sign handling, revolution completion, and orbital-rate scaling. The arrival lifecycle contract checks CSS states, journey integration, terrain animation, and renderer diagnostics. The raster-pipeline suite covers synthetic GeoTIFF fixtures when NumPy and Rasterio are installed; those fixtures do not validate unavailable original source rasters.

Browser/GPU rendering on your particular computer has not been independently verified from this environment. A WebGL-capable browser is required.

### Visual realism note

The planetary maps are supplied NASA/JPL image products with differing resolution and coverage; some are representative or illustrative maps, and some contain missing coverage. They provide visual context only. The orbital distances and body sizes are compressed, and the cinematic descent is not a simulated spacecraft entry trajectory. The local Mars exploration view uses the embedded raster-derived study data documented in the technical review.
