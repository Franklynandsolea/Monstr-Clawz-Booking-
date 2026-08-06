// netlify/functions/get-membership-details.js
//
// Called by membership-confirmed.html with ?session_id=... to display the
// new member's tier, price, and next billing date.

const Stripe = require('stripe');
const { TIERS } = require('./lib/tiers');

exports.handler = async function (event) {
  const stripe = Stripe(process.env.STRIPE_SECRET_KEY);
  const sessionId = event.queryStringParameters && event.queryStringParameters.session_id;

  if (!sessionId) {
    return { statusCode: 400, body: JSON.stringify({ error: 'Missing session_id' }) };
  }

  try {
    const session = await stripe.checkout.sessions.retrieve(sessionId, {
      expand: ['subscription'],
    });

    if (session.status !== 'complete') {
      return { statusCode: 200, body: JSON.stringify({ active: false }) };
    }

    const sub = session.subscription;
    const tier = TIERS[session.metadata.tierId];

    return {
      statusCode: 200,
      body: JSON.stringify({
        active: true,
        tierId: session.metadata.tierId,
        tierLabel: tier ? tier.label : session.metadata.tierId,
        price: tier ? tier.price : null,
        redemptionCaps: tier ? tier.redemptionCaps : {},
        redemptionLabels: tier ? tier.redemptionLabels : {},
        clientName: session.metadata.clientName || '',
        commitmentEnd: session.metadata.commitmentEnd || '',
        nextBillingDate: sub && sub.current_period_end ? new Date(sub.current_period_end * 1000).toISOString() : null,
      }),
    };
  } catch (err) {
    console.error('Membership session retrieve error:', err);
    return { statusCode: 500, body: JSON.stringify({ error: 'Unable to retrieve membership' }) };
  }
};
