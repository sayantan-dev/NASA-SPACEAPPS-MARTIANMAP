// Regression tests for accelerated, period-based Solar System motion.
const assert = require('assert');
const M = require('../js/orbit-math.js');

function near(actual, expected, tolerance, message) {
  assert.ok(Math.abs(actual - expected) <= tolerance, `${message}: got ${actual}, expected ${expected}`);
}
function positiveAngleDelta(a, b) { return ((b - a) % M.TAU + M.TAU) % M.TAU; }

const specs = [
  ['Mercury', .240846, 58.646, 7, .034], ['Venus', .615, -243.025, 3.39, 177.36],
  ['Earth', 1, .99726968, 0, 23.44], ['Mars', 1.8808, 1.02595675, 1.85, 25.19],
  ['Jupiter', 11.862, .41354, 1.30, 3.13], ['Saturn', 29.457, .44401, 2.49, 26.73],
  ['Uranus', 84.0168, -.71833, .77, 97.77], ['Neptune', 164.79, .67125, 1.77, 28.32]
];
assert.strictEqual(specs.length, 8, 'all eight planets are modeled');
near(M.orbitAngle(0, M.EARTH_YEAR_SECONDS / 2, 1), Math.PI, 1e-12, 'half an elapsed orbital year maps to a half revolution');
near(M.spinAngle(0, 43200, 1, 0), Math.PI, 1e-12, 'half an elapsed axial day maps to half a rotation');
assert.strictEqual(M.REAL_SECONDS_PER_SIMULATED_YEAR, 90, 'one visual Earth year uses the documented 90-second rate');
assert.strictEqual(M.REAL_SECONDS_PER_SIMULATED_DAY, 30, 'one visual Earth day uses the documented 30-second rate');

for (const [name, periodYears, signedDays, inclination, tilt] of specs) {
  assert.ok(periodYears > 0, `${name} has a positive revolution period`);
  assert.notStrictEqual(signedDays, 0, `${name} has a nonzero signed sidereal period`);
  const axisSense = tilt > 90 ? -1 : 1;
  const localSense = M.localSpinDirection(signedDays, tilt);
  assert.strictEqual(localSense * axisSense, Math.sign(signedDays), `${name} spin direction is applied exactly once`);
  assert.ok(Number.isFinite(inclination + tilt));
  near(M.orbitAngle(.4, periodYears * M.EARTH_YEAR_SECONDS, periodYears), .4, 1e-12, `${name} completes one orbit`);
  near(M.spinAngle(.2, Math.abs(signedDays) * 86400, signedDays, tilt), .2, 1e-12, `${name} completes one axial rotation`);
}

const short = positiveAngleDelta(M.orbitAngle(0, 10, 1), M.orbitAngle(0, 20, 1));
const long = positiveAngleDelta(M.orbitAngle(0, 10, 2), M.orbitAngle(0, 20, 2));
near(short / long, 2, 1e-8, 'half orbital period yields twice the angular rate');
assert.ok(M.localSpinDirection(-243.025, 177.36) > 0, 'Venus uses retrograde orbital-north orientation via its pole tilt');
assert.ok(M.localSpinDirection(-.71833, 97.77) > 0, 'Uranus retains its tipped pole without double inversion');
assert.ok(M.localSpinDirection(.99726968, 23.44) > 0, 'Earth remains prograde');
console.log('Solar motion: 8/8 bodies, signed spin and period math passed');
