// netlify/functions/create-membership-session.js
//
// Creates a Stripe Checkout Session in subscription mode for the selected
// membership tier. Uses price_data with a monthly recurring interval, so
// no Price objects need to be pre-created in the Stripe Dashboard — pricing
// lives entirely in lib/tiers.js.
//
// Reuses STRIPE_SECRET_KEY (already set up for the deposit flow).

const Stripe = require('stripe');
const { TIERS, COMMITMENT_MONTHS } = require('./lib/tiers');

const SUCCESS_URL = 'https://YOUR-DOMAIN.netlify.app/membership-confirmed.html';
const CANCEL_URL = 'https://YOUR-DOMAIN.netlify.app/membership.html';

exports.handler = async function (event) {
  if (event.httpMethod !== 'POST') {
    return { statusCode: 405, body: 'Method Not Allowed' };
  }

  const stripe = Stripe(process.env.STRIPE_SECRET_KEY);

  try {
    const body = JSON.parse(event.body || '{}');
    const { tierId, clientName, clientEmail, clientPhone, signatureName, signedAt } = body;

    const tier = TIERS[tierId];
    if (!tier) {
      return { statusCode: 400, body: JSON.stringify({ error: 'Invalid membership tier' }) };
    }
    if (!clientEmail || !signatureName) {
      return { statusCode: 400, body: JSON.stringify({ error: 'Missing required client info or signature' }) };
    }

    const commitmentEnd = new Date();
    commitmentEnd.setMonth(commitmentEnd.getMonth() + COMMITMENT_MONTHS);

    const session = await stripe.checkout.sessions.create({
      mode: 'subscription',
      payment_method_types: ['card'],
      customer_email: clientEmail,
      line_items: [
        {
          price_data: {
            currency: 'usd',
            product_data: {
              name: `Monstr Slay Boutique & Monstr Clawz — ${tier.label} Membership`,
              description: tier.description,
            },
            unit_amount: tier.price,
            recurring: { interval: 'month' },
          },
          quantity: 1,
        },
      ],
      subscription_data: {
        metadata: {
          tierId: tier.id,
          clientName: clientName || '',
          clientPhone: clientPhone || '',
          commitmentEnd: commitmentEnd.toISOString(),
          signatureName: signatureName || '',
          signedAt: signedAt || '',
        },
      },
      metadata: {
        tierId: tier.id,
        clientName: clientName || '',
        clientPhone: clientPhone || '',
        commitmentEnd: commitmentEnd.toISOString(),
        signatureName: signatureName || '',
        signedAt: signedAt || '',
      },
      success_url: SUCCESS_URL + '?session_id={CHECKOUT_SESSION_ID}',
      cancel_url: CANCEL_URL,
    });

    return { statusCode: 200, body: JSON.stringify({ url: session.url }) };
  } catch (err) {
    console.error('Membership session error:', err);
    return { statusCode: 500, body: JSON.stringify({ error: 'Unable to create membership checkout session' }) };
  }
};
