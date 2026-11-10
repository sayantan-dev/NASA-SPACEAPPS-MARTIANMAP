/* Pure time-based helpers for the accelerated visual orbit model. */
(function (root, factory) {
  const api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  else root.ARES_ORBIT_MATH = api;
})(globalThis, function () {
  'use strict';
  const TAU = Math.PI * 2;
  const EARTH_YEAR_SECONDS = 365.256363004 * 86400;
  const REAL_SECONDS_PER_SIMULATED_YEAR = 90;
  const REAL_SECONDS_PER_SIMULATED_DAY = 30;
  function wrapTurns(turns) { return ((turns % 1) + 1) % 1; }
  function orbitAngle(phase, simulationSeconds, periodEarthYears) {
    if (!(periodEarthYears > 0)) throw new RangeError('Orbital period must be positive');
    return phase + TAU * wrapTurns(simulationSeconds / (periodEarthYears * EARTH_YEAR_SECONDS));
  }
  // Period sign is referenced to orbital north. A pole tilted past 90° already
  // points retrograde; this conversion prevents applying the retrograde sign twice.
  function localSpinDirection(signedSiderealDays, axialTiltDegrees) {
    if (!signedSiderealDays) throw new RangeError('Sidereal rotation period must be nonzero');
    const periodDirection = Math.sign(signedSiderealDays);
    const poleHemisphere = axialTiltDegrees > 90 ? -1 : 1;
    return periodDirection * poleHemisphere;
  }
  function spinAngle(phase, simulationSeconds, signedSiderealDays, axialTiltDegrees) {
    const periodSeconds = Math.abs(signedSiderealDays) * 86400;
    if (!(periodSeconds > 0)) throw new RangeError('Sidereal rotation period must be nonzero');
    const direction = localSpinDirection(signedSiderealDays, axialTiltDegrees);
    return phase + TAU * wrapTurns(simulationSeconds / periodSeconds * direction);
  }
  return { TAU, EARTH_YEAR_SECONDS, REAL_SECONDS_PER_SIMULATED_YEAR, REAL_SECONDS_PER_SIMULATED_DAY, orbitAngle, localSpinDirection, spinAngle };
});
