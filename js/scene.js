/* ARES scene: WebGL terrain built from the decoded rasters, layer compositing, camera moves, probing. */
(function () {
  'use strict';
  const A = ARES, { M, L, GW, GH, N, DX, DZ, U, clamp } = A, S = A.state;
  const stage = document.getElementById('stage');
  const R = new THREE.WebGLRenderer({ antialias: true, powerPreference: 'high-performance' });
  R.setPixelRatio(Math.min(window.devicePixelRatio || 1, 1.75)); stage.appendChild(R.domElement);
  const LR = new THREE.CSS2DRenderer(); LR.domElement.id = 'labels'; stage.appendChild(LR.domElement);
  const scene = new THREE.Scene(), cam = new THREE.PerspectiveCamera(45, 1.6, 0.5, 1500);
  const ctl = new THREE.OrbitControls(cam, R.domElement);
  Object.assign(ctl, { enableDamping: true, dampingFactor: 0.08, maxPolarAngle: 1.5, minDistance: 2, maxDistance: 260, autoRotateSpeed: 0.35 });
  cam.position.set(150, 120, 190); ctl.target.set(0, -2, 0);
  Object.assign(A, { scene, cam, ctl });
  const hemi = new THREE.HemisphereLight(0xffe2c4, 0x2a1d17, 0.5), sun = new THREE.DirectionalLight(0xfff0dd, 1.6);
  scene.add(hemi, sun);

  // ---- terrain mesh: one vertex per 10 m cell; cells without elevation data get no triangles ----
  const P = new Float32Array(N * 3), UV = new Float32Array(N * 2), Z = new Float32Array(N);
  for (let j = 0; j < GH; j++) for (let i = 0; i < GW; i++) {
    const k = j * GW + i;
    P[3 * k] = (i - (GW - 1) / 2) * DX / U; P[3 * k + 2] = (j - (GH - 1) / 2) * DZ / U;
    UV[2 * k] = i / (GW - 1); UV[2 * k + 1] = 1 - j / (GH - 1);
    Z[k] = A.valid(k) ? A.elev(k) - M.z_mean : M.zmin - M.z_mean;
  }
  const idx = new Uint32Array((GW - 1) * (GH - 1) * 6); let n = 0;
  for (let j = 0; j < GH - 1; j++) for (let i = 0; i < GW - 1; i++) {
    const a = j * GW + i, b = a + 1, c = a + GW, d = c + 1;
    if (A.valid(a) && A.valid(b) && A.valid(c) && A.valid(d)) { idx[n++] = a; idx[n++] = c; idx[n++] = b; idx[n++] = b; idx[n++] = c; idx[n++] = d; }
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.BufferAttribute(P, 3)); geo.setAttribute('uv', new THREE.BufferAttribute(UV, 2));
  geo.setIndex(new THREE.BufferAttribute(idx.slice(0, n), 1));
  const cv = document.createElement('canvas'); cv.width = GW; cv.height = GH;
  const ctx = cv.getContext('2d'), tex = new THREE.CanvasTexture(cv); tex.anisotropy = Math.min(8, R.capabilities.getMaxAnisotropy());
  const mesh = new THREE.Mesh(geo, new THREE.MeshLambertMaterial({ map: tex })); scene.add(mesh);
  A.triangles = n / 3;
  let terrainRenderFrames = 0;
  A.terrainDiagnostics = () => {
    const rect = stage.getBoundingClientRect();
    return { stageWidth: rect.width, stageHeight: rect.height, canvasWidth: R.domElement.width, canvasHeight: R.domElement.height,
      terrainMeshReady: scene.children.includes(mesh), terrainTriangles: A.triangles, camera: cam.position.toArray(),
      target: ctl.target.toArray(), renderedFrames: terrainRenderFrames, compositeTextureAssigned: !!mesh.material.map,
      opticalRasterReady: !!optG };
  };

  A.rebuild = () => {
    for (let k = 0; k < N; k++) P[3 * k + 1] = Z[k] / U * S.ex;
    geo.attributes.position.needsUpdate = true; geo.computeVertexNormals(); geo.computeBoundingSphere();
    A.onRebuild && A.onRebuild();
  };

  // ---- layer compositing: optical + hillshade base, then one analysis overlay, painted into one texture ----
  const hex = h => [1, 3, 5].map(k => parseInt(h.substr(k, 2), 16));
  const lut = st => { const o = new Uint8Array(768), m = st.length - 1;
    for (let i = 0; i < 256; i++) { const t = i / 255 * m, a = Math.min(Math.floor(t), m - 1), f = t - a, c0 = hex(st[a]), c1 = hex(st[a + 1]);
      for (let k = 0; k < 3; k++) o[i * 3 + k] = c0[k] + (c1[k] - c0[k]) * f; } return o; };
  A.RAMPS = { elevation: ['#16233f', '#2b6f9a', '#6fc2a1', '#e6d88a', '#f5f1e6'], slope: ['#1b1f4b', '#2c6cb0', '#43c0a4', '#f0d24b', '#e2553c'], rough: ['#17122b', '#5b2a86', '#c4457d', '#f59e4b', '#fbe7a0'] };
  A.HAZ = [null, '#4f8d83', '#c2a65d', '#bd7956', '#8f4e4b'];
  const LUT = { elevation: lut(A.RAMPS.elevation), slope: lut(A.RAMPS.slope), rough: lut(A.RAMPS.rough) }, HZ = A.HAZ.map(c => c && hex(c));
  let optG = null;
  A.compose = () => {
    const id = ctx.createImageData(GW, GH), d = id.data, ov = S.overlay, a = S.opacity;
    for (let i = 0; i < N; i++) {
      const o = i * 4;
      if (!A.valid(i)) { d[o] = 7; d[o + 1] = 9; d[o + 2] = 13; d[o + 3] = 255; continue; }
      let b = S.optical && optG ? optG[i] : 110; if (S.hill) b *= 0.35 + 1.1 * L.hill[i] / 255;
      let r = b * 1.08, g = b * 0.82, bl = b * 0.66;
      if (ov !== 'none') {
        let c = null;
        if (ov === 'haz') c = HZ[L.haz[i]];
        else {
          let t;
          if (ov === 'elevation') t = L.dem[i] / 65534 * 255;
          else if (ov === 'slope') t = L.slope[i] === 255 ? -1 : clamp(L.slope[i] / M.slope_scale / 30, 0, 1) * 255;
          else t = L.rough[i] === 255 ? -1 : clamp(L.rough[i] / M.rough_scale / 2, 0, 1) * 255;
          if (t >= 0) { const l = LUT[ov], q = (t | 0) * 3; c = [l[q], l[q + 1], l[q + 2]]; }
        }
        if (c) { const layerAlpha = ov === 'haz' ? Math.min(a, 0.48) : a; r = r * (1 - layerAlpha) + c[0] * layerAlpha; g = g * (1 - layerAlpha) + c[1] * layerAlpha; bl = bl * (1 - layerAlpha) + c[2] * layerAlpha; }
      }
      d[o] = r; d[o + 1] = g; d[o + 2] = bl; d[o + 3] = 255;
    }
    ctx.putImageData(id, 0, 0); tex.needsUpdate = true;
  };
  const img = new Image();
  img.onload = () => { const c = document.createElement('canvas'); c.width = GW; c.height = GH; const x = c.getContext('2d');
    x.drawImage(img, 0, 0, GW, GH); const px = x.getImageData(0, 0, GW, GH).data; optG = new Uint8Array(N);
    for (let i = 0; i < N; i++) optG[i] = px[4 * i]; A.compose(); };
  img.src = ARES_DATA.opt;

  // ---- sun and sky (visual model only) ----
  A.setHour = h => {
    S.hour = h; const hh = S.sun ? h : 13, a = Math.PI * (hh - 6) / 12, el = Math.sin(a), day = clamp(el * 3, 0, 1);
    sun.position.set(-Math.cos(a) * 120, Math.max(el, 0.03) * 110 + 4, -40);
    sun.intensity = 0.1 + 1.9 * Math.max(el, 0); hemi.intensity = 0.18 + 0.4 * day;
    const c = new THREE.Color().setRGB(0.035 + 0.12 * day, 0.03 + 0.085 * day, 0.03 + 0.075 * day);
    scene.background = c; scene.fog = new THREE.Fog(c, 160, 460);
  };

  // ---- markers and routes live in one group so they can be cleared by tag ----
  const ov = new THREE.Group(); scene.add(ov); A.ov = ov;
  const mat = c => new THREE.MeshBasicMaterial({ color: c });
  A.clearOverlay = tag => { for (let k = ov.children.length - 1; k >= 0; k--) { const o = ov.children[k];
    if (tag && o.userData.tag !== tag) continue; ov.remove(o);
    const materials = new Set();
    o.traverse(c => { if (c.element && c.element.parentNode) c.element.parentNode.removeChild(c.element); if (c.geometry) c.geometry.dispose();
      if (c.material) (Array.isArray(c.material) ? c.material : [c.material]).forEach(m => materials.add(m)); });
    materials.forEach(m => m.dispose()); } };
  A.addMarker = (tag, i, j, text, color, click) => {
    const p = A.cellToWorld(i, j), g = new THREE.Group(); g.userData.tag = tag;
    const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.04, 0.04, 2.2, 6), mat(0x9aa4b0)); pole.position.set(p.x, p.y + 1.1, p.z);
    const ball = new THREE.Mesh(new THREE.SphereGeometry(0.42, 16, 12), mat(color)); ball.position.set(p.x, p.y + 2.3, p.z);
    g.add(pole, ball);
    if (text) { const b = document.createElement('button'); b.className = 'lb'; b.textContent = text; if (click) b.onclick = click;
      const o = new THREE.CSS2DObject(b); o.position.set(p.x, p.y + 3.3, p.z); g.add(o); }
    ov.add(g); return g;
  };
  A.addRoute = (tag, cells, color, radius) => {
    if (cells.length < 2) return;
    // Sample the exact A* centreline against the rendered terrain; connect samples with
    // straight CurvePath segments so tube geometry never Catmull-Rom-smooths across hazards.
    const pts = [];
    for (let k = 0; k < cells.length - 1; k++) {
      const a = cells[k], b = cells[k + 1], di = b[0] - a[0], dj = b[1] - a[1];
      const steps = Math.max(2, Math.ceil(Math.hypot(di * DX, dj * DZ) / (Math.min(DX, DZ) * 0.5)));
      for (let q = k ? 1 : 0; q <= steps; q++) {
        const t = q / steps, i = a[0] + di * t, j = a[1] + dj * t;
        const x = (i - (GW - 1) / 2) * DX / U, z = (j - (GH - 1) / 2) * DZ / U;
        const y = A.heightAt(x, z);
        if (y === null) return; // Never draw a route through a rendered NoData hole.
        pts.push(new THREE.Vector3(x, y + 0.18, z));
      }
    }
    if (pts.length < 2) return;
    const curve = new THREE.CurvePath();
    for (let k = 1; k < pts.length; k++) curve.add(new THREE.LineCurve3(pts[k - 1], pts[k]));
    const geo = new THREE.TubeGeometry(curve, Math.min(12000, pts.length * 2), radius, 6, false);
    const material = new THREE.MeshBasicMaterial({ color, transparent: true, opacity: radius >= 0.15 ? 1 : 0.62 });
    const route = new THREE.Mesh(geo, material); route.userData.tag = tag; route.renderOrder = 3; ov.add(route);
  };

  // ---- camera moves ----
  let fly = null, descentFly = null; ctl.addEventListener('start', () => { fly = null; descentFly = null; });
  A.flyTo = (p, t, ms) => { fly = { p0: cam.position.clone(), t0: ctl.target.clone(), p1: new THREE.Vector3(p.x, p.y, p.z), t1: new THREE.Vector3(t.x, t.y, t.z), s: performance.now(), ms: ms || 1700 }; };
  A.viewOverview = ms => A.flyTo({ x: 24, y: 62, z: 92 }, { x: 0, y: -2, z: 0 }, ms);
  A.prepareDescent = (options = {}) => {
    const landing = A.targets.find(t => t.id === 'landing'), p = A.cellToWorld(landing.i, landing.j);
    const target = new THREE.Vector3(p.x, p.y, p.z);
    // Prepare a high, target-centered camera only when handoff begins, then fly through
    // two descending waypoints to the mission overview while the renderer crossfades in.
    fly = null; ctl.enabled = false; ctl.autoRotate = false;
    const scale = Math.max(1.2, Number(options.startScale) || 1.75);
    const p2 = new THREE.Vector3(target.x + 24, target.y + 62, target.z + 92);
    const p1 = new THREE.Vector3(target.x + 32, target.y + 84, target.z + 128);
    const p0 = new THREE.Vector3(target.x + 24 * scale, target.y + 62 * scale, target.z + 92 * scale);
    cam.position.copy(p0); ctl.target.copy(target); ctl.update();
    descentFly = { p0, t0: target.clone(), p1, t1: target.clone(), p2, t2: target.clone(),
      start: performance.now(), duration: Math.max(700, Number(options.duration) || 1800) };
    return { position: cam.position.clone(), target: ctl.target.clone(), duration: descentFly.duration };
  };
  A.cancelDescent = () => { descentFly = null; fly = null; ctl.enabled = false; };
  A.enterMission = () => {
    if (descentFly) { cam.position.copy(descentFly.p2); ctl.target.copy(descentFly.t2); descentFly = null; }
    ctl.enabled = true; ctl.update();
  };
  A.viewCell = (i, j, dist, ms) => { const t = A.cellToWorld(i, j); A.flyTo({ x: t.x + dist * 0.4, y: t.y + dist * 0.55, z: t.z + dist * 0.8 }, t, ms); };

  // ---- pointer: probe on hover, click to place points ----
  const rc = new THREE.Raycaster(), ndc = new THREE.Vector2(), el = R.domElement; let busy = false, down = null;
  const ret = new THREE.Mesh(new THREE.RingGeometry(0.5, 0.72, 32), new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.9, side: THREE.DoubleSide }));
  ret.rotation.x = -Math.PI / 2; ret.visible = false; scene.add(ret);
  const ray = e => { const r = el.getBoundingClientRect(); ndc.set((e.clientX - r.left) / r.width * 2 - 1, -(e.clientY - r.top) / r.height * 2 + 1); rc.setFromCamera(ndc, cam); return rc.ray; };
  el.addEventListener('pointermove', e => { if (busy) return; busy = true;
    requestAnimationFrame(() => { busy = false; const p = A.pick(ray(e)); ret.visible = !!p; if (p) ret.position.set(p.x, p.y + 0.08, p.z); A.onProbe && A.onProbe(p); }); });
  el.addEventListener('pointerleave', () => { ret.visible = false; A.onProbe && A.onProbe(null); });
  el.addEventListener('pointerdown', e => { down = [e.clientX, e.clientY]; });
  el.addEventListener('pointerup', e => { if (down && Math.hypot(e.clientX - down[0], e.clientY - down[1]) < 5) { const p = A.pick(ray(e)); if (p && A.onClick) A.onClick(p); } down = null; });

  function resize() { const w = Math.max(1, stage.clientWidth), h = Math.max(1, stage.clientHeight); R.setSize(w, h); LR.setSize(w, h); cam.aspect = w / h; cam.updateProjectionMatrix(); }
  new ResizeObserver(resize).observe(stage); resize();
  (function loop() {
    requestAnimationFrame(loop);
    if (descentFly) {
      const d = descentFly, k = Math.min(1, (performance.now() - d.start) / d.duration), approachEnd = 0.76;
      if (k <= approachEnd) { const q = k / approachEnd, e = q * q * q; cam.position.lerpVectors(d.p0, d.p1, e); ctl.target.lerpVectors(d.t0, d.t1, e); }
      else { const q = (k - approachEnd) / (1 - approachEnd), e = 1 - Math.pow(1 - q, 3); cam.position.lerpVectors(d.p1, d.p2, e); ctl.target.lerpVectors(d.t1, d.t2, e); }
        if (k >= 1) { descentFly = null; ctl.enabled = true; ctl.update(); }
    }
    if (fly) { const k = Math.min(1, (performance.now() - fly.s) / fly.ms), e = k < 0.5 ? 2 * k * k : 1 - Math.pow(-2 * k + 2, 2) / 2;
      cam.position.lerpVectors(fly.p0, fly.p1, e); ctl.target.lerpVectors(fly.t0, fly.t1, e); if (k >= 1) fly = null; }
    ctl.update();
      if (document.body.classList.contains('terrain-active') || document.body.classList.contains('handoff-pending')) { R.render(scene, cam); LR.render(scene, cam); terrainRenderFrames++; }
  })();
  A.setHour(S.hour); A.rebuild(); A.compose();
})();
