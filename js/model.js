/* ARES model: decodes the real raster layers, converts coordinates, finds targets and plans routes.
   No DOM or WebGL in this file, so it can be tested on its own. */
(function (g) {
  'use strict';
  const D = g.ARES_DATA, M = D.meta, GW = M.gw, GH = M.gh, N = GW * GH;
  const dec = s => { const b = atob(s), u = new Uint8Array(b.length); for (let i = 0; i < b.length; i++) u[i] = b.charCodeAt(i); return u; };
  const L = { dem: new Uint16Array(dec(D.dem).buffer), slope: dec(D.slope), rough: dec(D.rough), haz: dec(D.haz), hill: dec(D.hill) };
  const DX = M.cell_x_proj * M.cos_lat;      // ground metres per cell, east-west (corrected by cos(latitude))
  const DZ = M.cell_y;                       // ground metres per cell, north-south (true on this projection)
  const U = 100;                             // 1 world unit = 100 m
  const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
  const A = g.ARES = { M, L, GW, GH, N, DX, DZ, U, clamp,
    state: { ex: 2, overlay: 'none', opacity: 0.6, optical: true, hill: true, sun: true, hour: 13 } };

  // Bounds are part of validity: typed-array reads outside the raster return undefined.
  A.valid = k => Number.isInteger(k) && k >= 0 && k < N && L.dem[k] !== 65535;
  A.elev = k => M.zmin + L.dem[k] / 65534 * (M.zmax - M.zmin);
  A.slopeDeg = k => L.slope[k] === 255 ? NaN : L.slope[k] / M.slope_scale;
  A.roughM = k => L.rough[k] === 255 ? NaN : L.rough[k] / M.rough_scale;
  A.idx = (i, j) => clamp(Math.round(j), 0, GH - 1) * GW + clamp(Math.round(i), 0, GW - 1);
  // Grid indices identify pixel centres. Centre the vertex grid on the raster's outer bounds.
  A.cellToWorld = (i, j, dy) => ({ x: (i - (GW - 1) / 2) * DX / U, y: (A.elev(A.idx(i, j)) - M.z_mean) / U * A.state.ex + (dy || 0), z: (j - (GH - 1) / 2) * DZ / U });
  A.worldToCell = (x, z) => [x * U / DX + (GW - 1) / 2, z * U / DZ + (GH - 1) / 2];
  // Raster bounds are pixel edges, so the centre of pixel (i,j) is offset by half a cell.
  A.cellToProj = (i, j) => [M.x0 + (i + 0.5) * M.cell_x_proj, M.y1 - (j + 0.5) * M.cell_y];
  A.projToCell = (x, y) => [(x - M.x0) / M.cell_x_proj - 0.5, (M.y1 - y) / M.cell_y - 0.5];
  A.toLatLon = (x, y) => [y / M.R * 180 / Math.PI, x / M.R * 180 / Math.PI];   // equirectangular, standard parallel 0
  A.fromLatLon = (lat, lon) => [lon * Math.PI / 180 * M.R, lat * Math.PI / 180 * M.R];
  // Height on the same two-triangle surface used by the rendered mesh.
  A.heightAt = (x, z) => {
    const c = A.worldToCell(x, z);
    if (c[0] < 0 || c[1] < 0 || c[0] > GW - 1 || c[1] > GH - 1) return null;
    const i = Math.min(Math.floor(c[0]), GW - 2), j = Math.min(Math.floor(c[1]), GH - 2);
    if (i < 0 || j < 0) return null;
    const u = c[0] - i, v = c[1] - j;
    const a = j * GW + i, b = a + 1, cc = a + GW, d = cc + 1;
    if (![a, b, cc, d].every(A.valid)) return null;
    const ha = A.elev(a), hb = A.elev(b), hc = A.elev(cc), hd = A.elev(d);
    // Match scene.js triangle winding: (a,c,b) and (b,c,d).
    const h = u + v <= 1 ? ha * (1 - u - v) + hc * v + hb * u
      : hb * (1 - v) + hc * (1 - u) + hd * (u + v - 1);
    return (h - M.z_mean) / U * A.state.ex;
  };
  A.pick = ray => { // Adaptive ray march: <= half a 10 m cell per horizontal sample.
    const minCell = Math.min(DX, DZ) / U;
    const horizontal = Math.hypot(ray.direction.x, ray.direction.z);
    const step = Math.min(2, 0.45 * minCell / Math.max(horizontal, 1e-6));
    const xMin = (0 - (GW - 1) / 2) * DX / U, xMax = (GW - 1 - (GW - 1) / 2) * DX / U;
    const zMin = (0 - (GH - 1) / 2) * DZ / U, zMax = (GH - 1 - (GH - 1) / 2) * DZ / U;
    let enter = 0, leave = 700;
    for (const [o, d, lo, hi] of [[ray.origin.x, ray.direction.x, xMin, xMax], [ray.origin.z, ray.direction.z, zMin, zMax]]) {
      if (Math.abs(d) < 1e-12) { if (o < lo || o > hi) return null; continue; }
      let t0 = (lo - o) / d, t1 = (hi - o) / d; if (t0 > t1) [t0, t1] = [t1, t0];
      enter = Math.max(enter, t0); leave = Math.min(leave, t1); if (leave < enter) return null;
    }
    const point = t => ({ x: ray.origin.x + ray.direction.x * t, y: ray.origin.y + ray.direction.y * t, z: ray.origin.z + ray.direction.z * t });
    let prevT = null, prevF = null;
    for (let t = enter; t <= leave; t += step) {
      const p = point(t), h = A.heightAt(p.x, p.z);
      if (h === null) { prevT = null; prevF = null; continue; }
      const f = p.y - h;
      if (prevT !== null && prevF > 0 && f <= 0) {
        let lo = prevT, hi = t, crossedNoData = false;
        for (let n = 0; n < 16; n++) {
          const mid = (lo + hi) / 2, q = point(mid), qh = A.heightAt(q.x, q.z);
          if (qh === null) { crossedNoData = true; break; }
          if (q.y - qh <= 0) hi = mid; else lo = mid;
        }
        if (crossedNoData) { prevT = null; prevF = null; continue; }
        const hit = point(hi), hh = A.heightAt(hit.x, hit.z);
        return hh === null ? null : { x: hit.x, y: hh, z: hit.z };
      }
      prevT = t; prevF = f;
    }
    return null;
  };

  // ---- targets: the landing site (approximate) and four features found in the data itself ----
  A.targets = (() => {
    let hi = -1, lo = 1e9, hiK = 0, loK = 0, st = -1, stK = 0;
    const inner = k => { const i = k % GW, j = Math.floor(k / GW), r = 15;   // keep targets away from the data edge
      if (i < r || j < r || i >= GW - r || j >= GH - r) return false;
      for (const [a, b] of [[-r, -r], [r, -r], [-r, r], [r, r], [-r, 0], [r, 0], [0, -r], [0, r]]) if (!A.valid(k + b * GW + a)) return false; return true; };
    for (let k = 0; k < N; k++) {
      if (!A.valid(k) || !inner(k)) continue;
      const z = L.dem[k]; if (z > hi) { hi = z; hiK = k; } if (z < lo) { lo = z; loK = k; }
      const s = L.slope[k]; if (s !== 255 && s > st) { st = s; stK = k; }
    }
    const cell = k => [k % GW, Math.floor(k / GW)];
    const lp = A.projToCell.apply(null, A.fromLatLon(18.4446, 77.4509));
    return [
      { id: 'landing', name: 'Landing site (approximate)', i: Math.round(lp[0]), j: Math.round(lp[1]), kind: 'prov' },
      { id: 'high', name: 'Highest interior ground', i: cell(hiK)[0], j: cell(hiK)[1], kind: 'derived' },
      { id: 'low', name: 'Lowest interior ground', i: cell(loK)[0], j: cell(loK)[1], kind: 'derived' },
      { id: 'steep', name: 'Steepest 10 m cell', i: cell(stK)[0], j: cell(stK)[1], kind: 'derived' }];
  })();

  // ---- route planning on a 20 m grid (2 x 2 blocks of the 10 m grid) ----
  const S = 2, CW = Math.floor(GW / S), CH = Math.floor(GH / S), CN = CW * CH;
  const cOk = new Uint8Array(CN), cSl = new Float32Array(CN), cMaxSl = new Float32Array(CN), cEl = new Float32Array(CN);
  for (let j = 0; j < CH; j++) for (let i = 0; i < CW; i++) {
    let ok = 1, sumSlope = 0, maxSlope = 0, sumElev = 0;
    for (let dj = 0; dj < S; dj++) for (let di = 0; di < S; di++) {
      const k = (j * S + dj) * GW + i * S + di;
      if (!A.valid(k) || L.slope[k] === 255) { ok = 0; continue; }
      const slope = L.slope[k] / M.slope_scale;
      sumSlope += slope; maxSlope = Math.max(maxSlope, slope); sumElev += A.elev(k);
    }
    const c = j * CW + i;
    if (ok) { cOk[c] = 1; cSl[c] = sumSlope / (S * S); cMaxSl[c] = maxSlope; cEl[c] = sumElev / (S * S); }
  }
  A.coarse = { S, CW, CH, ok: cOk, slope: cSl, maxSlope: cMaxSl, elev: cEl };
  A.fineToCoarse = (i, j) => [Math.floor(i / S), Math.floor(j / S)];
  A.coarseToFine = (ci, cj) => [ci * S + 0.5, cj * S + 0.5];

  class Heap {
    constructor() { this.k = []; this.v = []; }
    get size() { return this.k.length; }
    push(key, val) { const k = this.k, v = this.v; let i = k.length; k.push(key); v.push(val);
      while (i > 0) { const p = (i - 1) >> 1; if (k[p] <= key) break; k[i] = k[p]; v[i] = v[p]; i = p; } k[i] = key; v[i] = val; }
    pop() { const k = this.k, v = this.v, top = v[0], lk = k.pop(), lv = v.pop(), n = k.length;
      if (n) { let i = 0; for (;;) { let c = 2 * i + 1; if (c >= n) break; if (c + 1 < n && k[c + 1] < k[c]) c++; if (k[c] >= lk) break; k[i] = k[c]; v[i] = v[c]; i = c; } k[i] = lk; v[i] = lv; }
      return top; }
  }

  A.validatePath = (path, limit) => {
    if (!Array.isArray(path) || !path.length || Number.isNaN(limit)) return false;
    for (let k = 0; k < path.length; k++) {
      const [i, j] = path[k];
      if (!Number.isInteger(i) || !Number.isInteger(j) || i < 0 || j < 0 || i >= CW || j >= CH) return false;
      const c = j * CW + i;
      if (!cOk[c] || cMaxSl[c] > limit) return false;
      if (k) {
        const [pi, pj] = path[k - 1], di = i - pi, dj = j - pj;
        if (Math.abs(di) > 1 || Math.abs(dj) > 1 || (!di && !dj)) return false;
        if (di && dj) {
          const sideA = pj * CW + i, sideB = j * CW + pi;
          if (!cOk[sideA] || !cOk[sideB] || cMaxSl[sideA] > limit || cMaxSl[sideB] > limit) return false;
        }
      }
    }
    return true;
  };

  /* A* cost uses 3-D distance and average of neighbouring coarse-cell mean slopes.
     Traversability uses the maximum of the four underlying 10 m slope cells. */
  A.plan = (si, sj, gi, gj, w, limit) => {
    if (![si, sj, gi, gj, w, limit].every(Number.isFinite) || ![si, sj, gi, gj].every(Number.isInteger) || w < 0 || limit < 0) return null;
    if (si < 0 || sj < 0 || gi < 0 || gj < 0 || si >= CW || gi >= CW || sj >= CH || gj >= CH) return null;
    const start = sj * CW + si, goal = gj * CW + gi;
    const traversable = c => cOk[c] && cMaxSl[c] <= limit;
    if (!traversable(start) || !traversable(goal)) return null;
    const G = new Float64Array(CN).fill(Infinity), P = new Int32Array(CN).fill(-1), done = new Uint8Array(CN), H = new Heap();
    const hx = DX * S, hz = DZ * S, h = (i, j) => Math.hypot((i - gi) * hx, (j - gj) * hz);
    G[start] = 0; H.push(h(si, sj), start);
    while (H.size) {
      const c = H.pop(); if (done[c]) continue; done[c] = 1; if (c === goal) break;
      const ci = c % CW, cj = (c / CW) | 0;
      for (let dj = -1; dj <= 1; dj++) for (let di = -1; di <= 1; di++) {
        if (!di && !dj) continue;
        const ni = ci + di, nj = cj + dj; if (ni < 0 || nj < 0 || ni >= CW || nj >= CH) continue;
        const n = nj * CW + ni; if (done[n] || !traversable(n)) continue;
        // A diagonal cannot squeeze between a blocked, NoData, or over-limit cell.
        if (di && dj) {
          const sideA = cj * CW + ni, sideB = nj * CW + ci;
          if (!traversable(sideA) || !traversable(sideB)) continue;
        }
        const dist = Math.hypot(Math.hypot(di * hx, dj * hz), cEl[n] - cEl[c]);
        const sm = (cSl[c] + cSl[n]) / 2;
        const ng = G[c] + dist * (1 + w * (sm / 15) * (sm / 15));
        if (ng < G[n]) { G[n] = ng; P[n] = c; H.push(ng + h(ni, nj), n); }
      }
    }
    if (start !== goal && P[goal] < 0) return null;
    const path = []; let cur = goal, guard = 0;
    while (cur >= 0 && guard++ <= CN) { path.push([cur % CW, (cur / CW) | 0]); if (cur === start) break; cur = P[cur]; }
    if (!path.length || path[path.length - 1][0] !== si || path[path.length - 1][1] !== sj) return null;
    path.reverse(); return A.validatePath(path, limit) ? path : null;
  };

  A.metrics = path => {
    if (!A.validatePath(path, Infinity)) throw new Error('Cannot calculate metrics for an invalid route.');
    let dist = 0, up = 0, down = 0, maxUnderlying = 0, maxAverage = 0, sumAverage = 0, steep = 0;
    const first = path[0][1] * CW + path[0][0], prof = [[0, cEl[first], cMaxSl[first]]];
    maxUnderlying = cMaxSl[first]; maxAverage = cSl[first];
    for (let k = 1; k < path.length; k++) {
      const a = path[k - 1], b = path[k], ca = a[1] * CW + a[0], cb = b[1] * CW + b[0];
      const hor = Math.hypot((b[0] - a[0]) * DX * S, (b[1] - a[1]) * DZ * S), dz = cEl[cb] - cEl[ca], d = Math.hypot(hor, dz);
      dist += d; if (dz > 0) up += dz; else down -= dz;
      maxUnderlying = Math.max(maxUnderlying, cMaxSl[ca], cMaxSl[cb]);
      maxAverage = Math.max(maxAverage, cSl[ca], cSl[cb]);
      sumAverage += ((cSl[ca] + cSl[cb]) / 2) * d;
      if (Math.max(cMaxSl[ca], cMaxSl[cb]) > 15) steep += d;
      prof.push([dist, cEl[cb], cMaxSl[cb]]);
    }
    return { dist, up, down, max: maxUnderlying, maxUnderlying, maxAverage, mean: dist ? sumAverage / dist : cSl[first], steepDist: steep, prof };
  };
})(typeof window !== 'undefined' ? window : globalThis);
