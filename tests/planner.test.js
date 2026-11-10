// Deterministic route-planner regression tests. Run: node tests/planner.test.js
const assert = require('assert');
const fs = require('fs');
const vm = require('vm');

const dataSource = fs.readFileSync('data/ares-data.js', 'utf8')
  .replace('window.ARES_DATA', 'globalThis.ARES_DATA');
vm.runInThisContext(dataSource, { filename: 'data/ares-data.js' });
require('../js/model.js');
const A = globalThis.ARES;
const grid = A.coarse;
const tests = [];
function test(name, fn) {
  try { fn(); tests.push({ name, ok: true }); }
  catch (error) { tests.push({ name, ok: false, error }); }
}
function reset() {
  grid.ok.fill(0);
  grid.slope.fill(0);
  grid.maxSlope.fill(0);
  grid.elev.fill(0);
}
function open(i, j, maxSlope = 0, averageSlope = maxSlope, elevation = 0) {
  const k = j * grid.CW + i;
  grid.ok[k] = 1;
  grid.maxSlope[k] = maxSlope;
  grid.slope[k] = averageSlope;
  grid.elev[k] = elevation;
}

// Integration checks against the embedded Jezero raster dataset before synthetic-grid tests mutate it.
test('embedded terrain produces valid landing-to-target routes under the 25 degree limit', () => {
  const landing = A.targets.find(target => target.id === 'landing');
  const low = A.targets.find(target => target.id === 'low');
  const start = A.fineToCoarse(landing.i, landing.j);
  const goal = A.fineToCoarse(low.i, low.j);
  const path = A.plan(start[0], start[1], goal[0], goal[1], 0, 25);
  assert(path && path.length > 1);
  assert(A.validatePath(path, 25));
  const metrics = A.metrics(path);
  assert(Number.isFinite(metrics.dist) && metrics.dist > 0);
  assert(metrics.maxUnderlying <= 25);
});

test('embedded steep target is rejected when its maximum underlying slope exceeds the limit', () => {
  const landing = A.targets.find(target => target.id === 'landing');
  const steep = A.targets.find(target => target.id === 'steep');
  const start = A.fineToCoarse(landing.i, landing.j);
  const goal = A.fineToCoarse(steep.i, steep.j);
  assert.strictEqual(A.plan(start[0], start[1], goal[0], goal[1], 0, 25), null);
});

// Basic data and coordinate invariants.
test('raster validity rejects out-of-range typed-array indices', () => {
  assert.strictEqual(A.valid(-1), false);
  assert.strictEqual(A.valid(A.N), false);
  const firstValid = A.L.dem.findIndex(value => value !== 65535);
  assert(firstValid >= 0);
  assert.strictEqual(A.valid(firstValid), true);
});
test('pixel-centre projected and world coordinate conversions round-trip', () => {
  const i = 500, j = 200;
  const projected = A.cellToProj(i, j);
  const cell = A.projToCell(projected[0], projected[1]);
  assert(Math.abs(cell[0] - i) < 1e-9);
  assert(Math.abs(cell[1] - j) < 1e-9);
  const world = A.cellToWorld(i, j);
  const cellAgain = A.worldToCell(world.x, world.z);
  assert(Math.abs(cellAgain[0] - i) < 1e-9);
  assert(Math.abs(cellAgain[1] - j) < 1e-9);
});

test('terrain height interpolation and vertical ray picking agree', () => {
  let found = null;
  for (let j = 0; j < A.GH - 1 && !found; j++) for (let i = 0; i < A.GW - 1; i++) {
    const k = j * A.GW + i;
    if ([k, k + 1, k + A.GW, k + A.GW + 1].every(A.valid)) { found = [i, j]; break; }
  }
  assert(found, 'expected at least one complete terrain quad');
  const [i, j] = found;
  const x = (i + 0.5 - (A.GW - 1) / 2) * A.DX / A.U;
  const z = (j + 0.5 - (A.GH - 1) / 2) * A.DZ / A.U;
  const surface = A.heightAt(x, z);
  assert(Number.isFinite(surface));
  const hit = A.pick({ origin: { x, y: surface + 10, z }, direction: { x: 0, y: -1, z: 0 } });
  assert(hit);
  assert(Math.abs(hit.y - surface) < 1e-5);
});

test('open terrain returns a valid route', () => {
  reset();
  open(10, 10); open(11, 10); open(10, 11); open(11, 11);
  const path = A.plan(10, 10, 11, 11, 0, 25);
  assert(path);
  assert.deepStrictEqual(path[0], [10, 10]);
  assert.deepStrictEqual(path[path.length - 1], [11, 11]);
  assert.strictEqual(A.validatePath(path, 25), true);
});

test('blocked destination returns no route', () => {
  reset(); open(10, 10);
  assert.strictEqual(A.plan(10, 10, 11, 10, 0, 25), null);
});

test('diagonal movement cannot cut an obstacle corner', () => {
  reset(); open(10, 10); open(11, 11); open(11, 10);
  assert.strictEqual(A.validatePath([[10, 10], [11, 11]], 25), false);
  const path = A.plan(10, 10, 11, 11, 0, 25);
  assert(path);
  assert.strictEqual(path.length, 3); // Must route through the only open orthogonal neighbour.
});

test('diagonal movement cannot cut a steep-cell corner', () => {
  reset(); open(10, 10); open(11, 11); open(11, 10); open(10, 11, 30, 10);
  assert.strictEqual(A.validatePath([[10, 10], [11, 11]], 25), false);
  const path = A.plan(10, 10, 11, 11, 0, 25);
  assert(path);
  assert.strictEqual(path.length, 3);
  assert(!path.some(([i, j]) => i === 10 && j === 11));
});

test('route cannot use a cell above the configured slope limit', () => {
  reset(); open(10, 10); open(11, 10, 26, 12);
  assert.strictEqual(A.plan(10, 10, 11, 10, 0, 25), null);
});

test('NoData/invalid coarse cell is never traversable', () => {
  reset(); open(10, 10); open(12, 10);
  // (11,10) intentionally remains invalid, as it would when a fine source cell is NoData.
  assert.strictEqual(A.plan(10, 10, 12, 10, 0, 25), null);
});

test('invalid start and destination coordinates are rejected', () => {
  reset(); open(10, 10);
  assert.strictEqual(A.plan(-1, 10, 10, 10, 0, 25), null);
  assert.strictEqual(A.plan(10, 10, grid.CW, 10, 0, 25), null);
  assert.strictEqual(A.plan(10.5, 10, 10, 10, 0, 25), null);
});

test('planner takes a longer valid path around a steep shortcut', () => {
  reset();
  for (let j = 10; j <= 12; j++) for (let i = 10; i <= 12; i++) open(i, j, 0, 0, (i + j) * 0.5);
  open(11, 11, 35, 8); // Average is gentle, but the underlying maximum is over the limit.
  const path = A.plan(10, 11, 12, 11, 0, 25);
  assert(path);
  assert(path.length > 3, 'expected a detour around the blocked centre');
  assert(!path.some(([i, j]) => i === 11 && j === 11));
  assert(A.validatePath(path, 25));
});

test('route metrics are finite and report underlying maximum slope separately', () => {
  reset(); open(10, 10, 12, 4, 100); open(11, 10, 18, 7, 102);
  const path = A.plan(10, 10, 11, 10, 0, 25);
  assert(path);
  const metrics = A.metrics(path);
  for (const key of ['dist', 'up', 'down', 'max', 'maxUnderlying', 'maxAverage', 'mean', 'steepDist']) {
    assert(Number.isFinite(metrics[key]), key + ' should be finite');
  }
  assert.strictEqual(metrics.maxUnderlying, 18);
  assert.strictEqual(metrics.maxAverage, 7);
  assert(metrics.dist > 0);
  assert(metrics.prof.every(row => row.every(Number.isFinite)));
});

test('metrics reject an invalid route instead of reporting it', () => {
  reset(); open(10, 10); open(11, 11);
  assert.throws(() => A.metrics([[10, 10], [11, 11]]), /invalid route/i);
});

const failed = tests.filter(t => !t.ok);
for (const result of tests) {
  if (result.ok) console.log('PASS', result.name);
  else console.error('FAIL', result.name, '\n ', result.error && result.error.stack || result.error);
}
console.log(`\n${tests.length - failed.length}/${tests.length} tests passed`);
if (failed.length) process.exitCode = 1;
