// netlify/functions/lib/tiers.js
//
// Single source of truth for membership tier pricing and monthly redemption
// caps. Update prices/caps here and every function picks it up.

const TIERS = {
  nailRefresh: {
    id: 'nailRefresh',
    label: 'Nail Refresh',
    price: 9900, // cents / month
    earlyCancellationFee: 9900, // cents — charged if canceled before the 3-month commitment ends
    discount: 10, // % off nail art add-ons
    redemptionCaps: { nailFill: 1 },
    redemptionLabels: { nailFill: 'Nail Fill / Color Change' },
    description: '1 nail fill or color change monthly, 10% off nail art add-ons.',
  },
  lashNail: {
    id: 'lashNail',
    label: 'Lash & Nail',
    price: 18500,
    earlyCancellationFee: 18500,
    discount: 10,
    redemptionCaps: { nailFill: 1, lashRefill: 2 },
    redemptionLabels: { nailFill: 'Nail Fill / Color Change', lashRefill: 'Lash Refill' },
    description: '1 nail fill or color change + 2 lash refills monthly, 10% off nail art & premium nail effects.',
  },
  fullSlay: {
    id: 'fullSlay',
    label: 'Full Slay',
    price: 34900,
    earlyCancellationFee: 34900,
    discount: 15,
    redemptionCaps: { nailFill: 1, lashRefill: 2, hairService: 1 },
    redemptionLabels: { nailFill: 'Nail Fill / Color Change', lashRefill: 'Lash Refill', hairService: 'Crochet Install / Pre-Made or Handmade Locs Touch-up/Retwist' },
    description: '1 nail fill or color change + 2 lash refills + 1 Signature Crochet Install or Pre-Made/Handmade Faux Locs Touch-up/Retwist monthly, 15% off everything else, including Pre-Made/Handmade Faux Locs & Mega Glam.',
  },
};

const COMMITMENT_MONTHS = 3;

function emptyRedemptionsUsed(tierId) {
  const caps = TIERS[tierId] ? TIERS[tierId].redemptionCaps : {};
  const used = {};
  Object.keys(caps).forEach(k => { used[k] = 0; });
  return used;
}

module.exports = { TIERS, COMMITMENT_MONTHS, emptyRedemptionsUsed };
