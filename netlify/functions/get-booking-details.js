// netlify/functions/get-booking-details.js
//
// Called by booking-confirmed.html with ?session_id=... from the Stripe
// redirect. Uses the secret key server-side to look up the session and
// returns only what the confirmation page needs to display.

const Stripe = require('stripe');

exports.handler = async function (event) {
  const stripe = Stripe(process.env.STRIPE_SECRET_KEY);
  const sessionId = event.queryStringParameters && event.queryStringParameters.session_id;

  if (!sessionId) {
    return { statusCode: 400, body: JSON.stringify({ error: 'Missing session_id' }) };
  }

  try {
    const session = await stripe.checkout.sessions.retrieve(sessionId);

    if (session.payment_status !== 'paid') {
      return { statusCode: 200, body: JSON.stringify({ paid: false }) };
    }

    return {
      statusCode: 200,
      body: JSON.stringify({
        paid: true,
        amount: session.amount_total,
        clientName: session.metadata.clientName || '',
        clientEmail: session.customer_email || session.metadata.clientEmail || '',
        services: (session.metadata.services || '').split(' | ').filter(Boolean),
        mobile: session.metadata.mobile === 'yes',
        travelFee: Number(session.metadata.travelFee || 0),
        signatureName: session.metadata.signatureName || '',
        signedAt: session.metadata.signedAt || '',
      }),
    };
  } catch (err) {
    console.error('Session retrieve error:', err);
    return { statusCode: 500, body: JSON.stringify({ error: 'Unable to retrieve booking' }) };
  }
};
