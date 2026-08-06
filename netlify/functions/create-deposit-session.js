// netlify/functions/create-deposit-session.js
//
// Creates a Stripe Checkout Session for the client's 25% booking deposit.
// Deposit amount is calculated client-side (in index.html) and passed in,
// but you can also recompute it here from `services` for extra safety once
// you wire this to your real price list / database.
//
// SETUP:
// 1. In the Netlify dashboard: Site settings → Environment variables → add
//      STRIPE_SECRET_KEY = sk_live_...   (or sk_test_... while testing)
// 2. Deploy this file at netlify/functions/create-deposit-session.js
//    (this repo's folder structure already matches that path).
// 3. Update SUCCESS_URL / CANCEL_URL below to your live domain.
// 4. Add "stripe" to a package.json in your project root:
//      npm install stripe
//
// This mirrors the Netlify Functions pattern already used in Housing OS
// (stripe-webhook.js / activate-subscription.js).

const Stripe = require('stripe');

const SUCCESS_URL = 'https://YOUR-DOMAIN.netlify.app/booking-confirmed.html';
const CANCEL_URL = 'https://YOUR-DOMAIN.netlify.app/index.html';

exports.handler = async function (event) {
  if (event.httpMethod !== 'POST') {
    return { statusCode: 405, body: 'Method Not Allowed' };
  }

  const stripe = Stripe(process.env.STRIPE_SECRET_KEY);

  try {
    const body = JSON.parse(event.body || '{}');
    const {
      amount,          // integer, in cents — the 25% deposit
      clientName,
      clientEmail,
      clientPhone,
      clientAddress,
      services,        // array of service names
      mobile,
      travelFee,
      signatureName,
      signedAt,
      appointmentStart,  // ISO string — the chosen calendar slot
      durationMinutes,   // estimated appointment length in minutes
    } = body;

    if (!amount || amount < 100) {
      return { statusCode: 400, body: JSON.stringify({ error: 'Invalid deposit amount' }) };
    }

    const description = (services && services.length)
      ? `Booking deposit — ${services.join(', ')}`.slice(0, 500)
      : 'Booking deposit';

    const session = await stripe.checkout.sessions.create({
      mode: 'payment',
      payment_method_types: ['card'],
      customer_email: clientEmail || undefined,
      line_items: [
        {
          price_data: {
            currency: 'usd',
            product_data: {
              name: 'Monstr Slay Boutique & Monstr Clawz — Booking Deposit (25%)',
              description,
            },
            unit_amount: amount,
          },
          quantity: 1,
        },
      ],
      metadata: {
        clientName: clientName || '',
        clientPhone: clientPhone || '',
        clientAddress: (clientAddress || '').slice(0, 490),
        services: (services || []).join(' | ').slice(0, 490),
        mobile: mobile ? 'yes' : 'no',
        travelFee: String(travelFee || 0),
        signatureName: signatureName || '',
        signedAt: signedAt || '',
        appointmentStart: appointmentStart || '',
        durationMinutes: String(durationMinutes || ''),
      },
      success_url: SUCCESS_URL + '?session_id={CHECKOUT_SESSION_ID}',
      cancel_url: CANCEL_URL,
    });

    return {
      statusCode: 200,
      body: JSON.stringify({ url: session.url }),
    };
  } catch (err) {
    console.error('Stripe session error:', err);
    return {
      statusCode: 500,
      body: JSON.stringify({ error: 'Unable to create checkout session' }),
    };
  }
};
