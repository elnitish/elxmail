'use strict';

/**
 * Built-in warm-up curves.
 * Each curve is an array of { day, maxPerDomain } pairs.
 * The scheduler interpolates between defined points for intermediate days.
 */

const DEFAULT_CURVE = [
  { day: 1, maxPerDomain: 20 },
  { day: 3, maxPerDomain: 50 },
  { day: 7, maxPerDomain: 100 },
  { day: 14, maxPerDomain: 200 },
  { day: 21, maxPerDomain: 350 },
  { day: 28, maxPerDomain: 500 }
];

// Conservative curve — slower ramp for higher deliverability safety
const CONSERVATIVE_CURVE = [
  { day: 1, maxPerDomain: 10 },
  { day: 5, maxPerDomain: 25 },
  { day: 10, maxPerDomain: 50 },
  { day: 15, maxPerDomain: 100 },
  { day: 20, maxPerDomain: 200 },
  { day: 28, maxPerDomain: 350 },
  { day: 35, maxPerDomain: 500 }
];

// Aggressive curve — faster ramp, higher risk
const AGGRESSIVE_CURVE = [
  { day: 1, maxPerDomain: 50 },
  { day: 3, maxPerDomain: 100 },
  { day: 7, maxPerDomain: 250 },
  { day: 14, maxPerDomain: 500 }
];

const PLANS = {
  default: DEFAULT_CURVE,
  conservative: CONSERVATIVE_CURVE,
  aggressive: AGGRESSIVE_CURVE
};

/**
 * Get the max sends per domain for a given day in a curve.
 * Interpolates linearly between defined points.
 *
 * @param {Array} curve - The warm-up curve
 * @param {number} day - Current day number (1-based)
 * @returns {number} - Max emails allowed for this domain today
 */
function getLimit(curve, day) {
  if (day <= 0) return 0;

  // Before first point
  if (day <= curve[0].day) {
    return curve[0].maxPerDomain;
  }

  // After last point — warm-up complete, return last limit
  const last = curve[curve.length - 1];
  if (day >= last.day) {
    return last.maxPerDomain;
  }

  // Find the two points to interpolate between
  for (let i = 0; i < curve.length - 1; i++) {
    const current = curve[i];
    const next = curve[i + 1];

    if (day >= current.day && day < next.day) {
      // Linear interpolation
      const progress = (day - current.day) / (next.day - current.day);
      return Math.floor(current.maxPerDomain + progress * (next.maxPerDomain - current.maxPerDomain));
    }
  }

  return last.maxPerDomain;
}

/**
 * Get the total warm-up duration in days for a curve.
 */
function getDuration(curve) {
  return curve[curve.length - 1].day;
}

module.exports = { DEFAULT_CURVE, CONSERVATIVE_CURVE, AGGRESSIVE_CURVE, PLANS, getLimit, getDuration };
