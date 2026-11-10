// Static integration contract for the Solar System -> terrain visibility handoff.
const assert = require('assert');
const fs = require('fs');
const css = fs.readFileSync('css/styles.css', 'utf8');
const html = fs.readFileSync('index.html', 'utf8');
const ui = fs.readFileSync('js/ui.js', 'utf8');
const scene = fs.readFileSync('js/scene.js', 'utf8');
const solar = fs.readFileSync('js/solar-system.js', 'utf8');

assert.match(html, /<body class="solar-system-mode">/);
assert.match(html, /<div id="stage"><\/div>/);
assert.match(html, /js\/orbit-math\.js/);
assert.match(css, /body\.solar-system-mode\s+#stage\s*\{[^}]*opacity:\s*0/);
assert.match(css, /body\.handoff-pending\s+#stage,body\.terrain-active\s+#stage\s*\{[^}]*opacity:\s*1/);
assert.match(css, /body\.handoff-pending\s+#intro\.planetarium\s*\{background:transparent!important\}/);
assert.match(ui, /A\.prepareDescent\(\{\s*duration:\s*1800/);
assert.match(ui, /document\.body\.classList\.add\('terrain-active'\)/);
assert.match(ui, /document\.body\.classList\.add\('solar-system-mode'\)/);
assert.match(scene, /descentFly\s*=\s*\{\s*p0,\s*t0:[\s\S]*?duration:/);
assert.match(scene, /R\.render\(scene, cam\);\s*LR\.render\(scene, cam\);\s*terrainRenderFrames\+\+/);
assert.match(scene, /terrainMeshReady:\s*scene\.children\.includes\(mesh\)/);
assert.match(solar, /getMotionState:/);
console.log('Arrival lifecycle contract passed: CSS states, handoff animation, terrain renderer and diagnostics are connected');
