// netlify/functions/charge-early-cancellation-fee.js
//
// How the automatic charge works:
// When someone completes Stripe Checkout in subscription mode, Stripe
// automatically saves their card to their Customer record for future use
// (this is required for the subscription to keep billing monthly). That
// means the same saved card can be charged again later for a one-time fee —
// no need to collect payment info a second time.
//
// This function creates an off-session PaymentIntent against that saved
// card. "Off-session" tells Stripe the customer isn't actively present to
// enter a 3D Secure code, so it uses the card's stored authentication where
// possible. If the bank still demands extra verification, the charge will
// fail with `requires_action` and you'd need to follow up with the client
// directly — this happens sometimes but isn't the norm for US cards.
//
// This is intentionally admin-triggered (a button in admin-membership.html),
// not automatic on cancellation, so you always have a human decision point
// before a client's card gets charged an extra fee.

const Stripe = require('stripe');
const { getStore } = require('@netlify/blobs');
const { TIERS } = require('./lib/tiers');

exports.handler = async function (event) {
  const providedPassword = event.headers['x-admin-password'];
  if (!process.env.ADMIN_PASSWORD || providedPassword !== process.env.ADMIN_PASSWORD) {
    return { statusCode: 401, body: JSON.stringify({ error: 'Unauthorized' }) };
  }
  if (event.httpMethod !== 'POST') {
    return { statusCode: 405, body: 'Method Not Allowed' };
  }

  const stripe = Stripe(process.env.STRIPE_SECRET_KEY);
  const store = getStore('members');

  try {
    const { subscriptionId, amountOverride } = JSON.parse(event.body || '{}');
    if (!subscriptionId) {
      return { statusCode: 400, body: JSON.stringify({ error: 'Missing subscriptionId' }) };
    }

    const key = `sub_${subscriptionId}`;
    const member = await store.get(key, { type: 'json' });
    if (!member) {
      return { statusCode: 404, body: JSON.stringify({ error: 'Member not found' }) };
    }
    if (member.earlyCancellationFeeCharged) {
      return { statusCode: 409, body: JSON.stringify({ error: 'Early-cancellation fee already charged for this member' }) };
    }

    const tier = TIERS[member.tierId];
    const amount = amountOverride || (tier ? tier.earlyCancellationFee : null);
    if (!amount) {
      return { statusCode: 400, body: JSON.stringify({ error: 'No fee amount configured for this tier' }) };
    }

    // Find the customer's default payment method.
    const customer = await stripe.customers.retrieve(member.customerId);
    const defaultPM = customer.invoice_settings && customer.invoice_settings.default_payment_method;
    if (!defaultPM) {
      return { statusCode: 400, body: JSON.stringify({ error: 'No saved card found on file for this customer' }) };
    }

    const paymentIntent = await stripe.paymentIntents.create({
      amount,
      currency: 'usd',
      customer: member.customerId,
      payment_method: defaultPM,
      off_session: true,
      confirm: true,
      description: `Early-cancellation fee — ${tier ? tier.label : member.tierId} membership`,
      metadata: { subscriptionId, tierId: member.tierId, type: 'early_cancellation_fee' },
    });

    member.earlyCancellationFeeCharged = true;
    member.earlyCancellationFeeAmount = amount;
    member.earlyCancellationFeeChargedAt = new Date().toISOString();
    member.earlyCancellationFeePaymentIntentId = paymentIntent.id;
    await store.setJSON(key, member);

    return { statusCode: 200, body: JSON.stringify({ success: true, paymentIntentStatus: paymentIntent.status }) };
  } catch (err) {
    console.error('charge-early-cancellation-fee error:', err);
    // Card declines / requires_action come through as Stripe errors here.
    const message = err.type === 'StripeCardError'
      ? `Card declined: ${err.message}`
      : 'Unable to charge the early-cancellation fee. The client may need to be contacted directly.';
    return { statusCode: 402, body: JSON.stringify({ error: message }) };
  }
};
