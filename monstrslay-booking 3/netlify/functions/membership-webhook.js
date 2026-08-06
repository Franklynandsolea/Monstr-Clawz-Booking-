// netlify/functions/membership-webhook.js
//
// Separate webhook endpoint from stripe-webhook.js (which handles one-time
// booking deposits). This one handles the membership subscription lifecycle:
//
//   checkout.session.completed (mode=subscription) → create member record
//     in Netlify Blobs + send welcome email
//   invoice.paid                                   → new billing cycle,
//     reset that member's monthly redemption counts to 0
//   customer.subscription.deleted                  → mark member canceled,
//     flag if it happened before their 3-month commitment end date
//
// SETUP (in addition to the deposit webhook already configured):
// 1. Stripe Dashboard → Developers → Webhooks → Add endpoint
//      URL: https://YOUR-DOMAIN.netlify.app/.netlify/functions/membership-webhook
//      Events: checkout.session.completed, invoice.paid, customer.subscription.deleted
// 2. Add the signing secret as MEMBERSHIP_WEBHOOK_SECRET in Netlify env vars
//    (separate from STRIPE_WEBHOOK_SECRET used by the deposit webhook).
// 3. Uses the same STRIPE_SECRET_KEY, RESEND_API_KEY, BUSINESS_FROM_EMAIL
//    already configured for the booking flow.

const Stripe = require('stripe');
const { Resend } = require('resend');
const { getStore } = require('@netlify/blobs');
const { TIERS, emptyRedemptionsUsed } = require('./lib/tiers');

function membersStore() {
  return getStore('members');
}

async function sendWelcomeEmail({ toEmail, toName, tier }) {
  const resend = new Resend(process.env.RESEND_API_KEY);
  const fromEmail = process.env.BUSINESS_FROM_EMAIL || 'bookings@monstrslay.org';

  const capLines = Object.entries(tier.redemptionCaps)
    .map(([key, cap]) => `<li>${tier.redemptionLabels[key]}: ${cap}x per month</li>`)
    .join('');

  const html = `
  <div style="font-family:Georgia,serif;max-width:560px;margin:0 auto;background:#FBF7F2;padding:32px 28px;color:#211621;">
    <p style="font-style:italic;font-size:22px;margin:0 0 4px;">Monstr Slay Boutique &amp; Monstr Clawz</p>
    <p style="letter-spacing:2px;text-transform:uppercase;font-size:11px;color:#A6455C;margin:0 0 24px;font-family:Arial,sans-serif;">Welcome to ${tier.label}</p>
    <p style="font-family:Arial,sans-serif;">Hi ${toName || 'there'},</p>
    <p style="font-family:Arial,sans-serif;">You're officially a member. Here's what's included every month:</p>
    <ul style="font-family:Arial,sans-serif;">${capLines}</ul>
    <p style="font-family:Arial,sans-serif;">Plus ${tier.discount}% off everything else you book with us. Text or email <a href="mailto:monstrslayboutique@outlook.com" style="color:#A6455C;">monstrslayboutique@outlook.com</a> to schedule your first appointment.</p>
    <p style="font-family:Arial,sans-serif;font-weight:700;">A quick reminder:</p>
    <p style="font-family:Arial,sans-serif;">Your membership has a 3-month minimum commitment, billed monthly. Unused redemptions don't roll over to the next month.</p>
    <p style="font-family:Arial,sans-serif;margin-top:24px;color:#6b6b6b;font-size:12px;">Monstr Slay Boutique &amp; Monstr Clawz · Hampton Roads, VA · Military Ready™</p>
  </div>`;

  await resend.emails.send({
    from: `Monstr Slay Boutique <${fromEmail}>`,
    to: toEmail,
    subject: `Welcome to Monstr Slay ${tier.label} Membership`,
    html,
  });
}

exports.handler = async function (event) {
  const stripe = Stripe(process.env.STRIPE_SECRET_KEY);
  const sig = event.headers['stripe-signature'];

  let stripeEvent;
  try {
    stripeEvent = stripe.webhooks.constructEvent(event.body, sig, process.env.MEMBERSHIP_WEBHOOK_SECRET);
  } catch (err) {
    console.error('Membership webhook signature verification failed:', err.message);
    return { statusCode: 400, body: `Webhook Error: ${err.message}` };
  }

  const store = membersStore();

  try {
    if (stripeEvent.type === 'checkout.session.completed') {
      const session = stripeEvent.data.object;
      if (session.mode !== 'subscription') return { statusCode: 200, body: 'ignored' };

      const meta = session.metadata || {};
      const tier = TIERS[meta.tierId];
      if (!tier) return { statusCode: 200, body: 'unknown tier' };

      const member = {
        subscriptionId: session.subscription,
        customerId: session.customer,
        tierId: tier.id,
        clientName: meta.clientName || '',
        clientEmail: session.customer_email || '',
        clientPhone: meta.clientPhone || '',
        commitmentEnd: meta.commitmentEnd || '',
        signatureName: meta.signatureName || '',
        signedAt: meta.signedAt || '',
        status: 'active',
        redemptionsCap: tier.redemptionCaps,
        redemptionsUsed: emptyRedemptionsUsed(tier.id),
        currentPeriodStart: new Date().toISOString(),
        createdAt: new Date().toISOString(),
      };

      await store.setJSON(`sub_${session.subscription}`, member);

      if (session.customer_email) {
        try {
          await sendWelcomeEmail({ toEmail: session.customer_email, toName: meta.clientName, tier });
        } catch (err) {
          console.error('Welcome email failed:', err);
        }
      }
    }

    if (stripeEvent.type === 'invoice.paid') {
      const invoice = stripeEvent.data.object;
      const subId = invoice.subscription;
      if (!subId) return { statusCode: 200, body: 'no subscription on invoice' };

      const existing = await store.get(`sub_${subId}`, { type: 'json' });
      if (existing) {
        // Skip the very first invoice (already initialized by checkout.session.completed)
        // by checking whether this invoice created the subscription just now.
        const isFirstInvoice = invoice.billing_reason === 'subscription_create';
        if (!isFirstInvoice) {
          existing.redemptionsUsed = emptyRedemptionsUsed(existing.tierId);
          existing.currentPeriodStart = new Date().toISOString();
          existing.status = 'active';
          await store.setJSON(`sub_${subId}`, existing);
        }
      }
    }

    if (stripeEvent.type === 'customer.subscription.deleted') {
      const sub = stripeEvent.data.object;
      const existing = await store.get(`sub_${sub.id}`, { type: 'json' });
      if (existing) {
        existing.status = 'canceled';
        existing.canceledAt = new Date().toISOString();
        existing.earlyCancellation = existing.commitmentEnd
          ? new Date() < new Date(existing.commitmentEnd)
          : false;
        await store.setJSON(`sub_${sub.id}`, existing);
      }
    }
  } catch (err) {
    console.error('Membership webhook processing error:', err);
    // Return 200 anyway — Stripe already has the payment; don't create retry storms
    // over a storage/email hiccup.
  }

  return { statusCode: 200, body: JSON.stringify({ received: true }) };
};
