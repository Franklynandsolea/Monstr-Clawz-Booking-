// netlify/functions/lib/durations.js
//
// Rough appointment-length estimates per service category, in minutes.
// Used only to size how much space a booking blocks on the calendar —
// not shown to clients as a promised end time. Tune these to match your
// real average appointment lengths whenever you like.

const CATEGORY_DURATIONS = {
  hair: 105,          // Crochet install / takedown
  premadeLocs: 120,   // Pre-Made Faux Locs
  locs: 240,           // Handmade Faux Locs (longest service on the menu)
  hairAddons: 30,
  nails: 60,
  nailArt: 20,
  nailEffects: 20,
  lashes: 75,
};

const DEFAULT_DURATION = 60;
const MIN_TOTAL_DURATION = 30;

function totalDurationForCategories(categoryIds) {
  if (!categoryIds || !categoryIds.length) return DEFAULT_DURATION;
  const sum = categoryIds.reduce((total, cat) => total + (CATEGORY_DURATIONS[cat] || 0), 0);
  return Math.max(sum, MIN_TOTAL_DURATION);
}

module.exports = { CATEGORY_DURATIONS, DEFAULT_DURATION, totalDurationForCategories };
