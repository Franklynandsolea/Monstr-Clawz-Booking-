// netlify/functions/stripe-webhook.js
//
// Listens for Stripe's `checkout.session.completed` event and sends the
// client an automatic confirmation email: appointment summary, deposit
// receipt, prep instructions, and a service-specific aftercare guide.
//
// SETUP:
// 1. Environment variables (Netlify → Site settings → Environment variables):
//      STRIPE_SECRET_KEY       = sk_live_... (already set from the deposit function)
//      STRIPE_WEBHOOK_SECRET   = whsec_...   (from the Stripe webhook you create below)
//      RESEND_API_KEY          = re_...      (from resend.com — free tier is plenty for this volume)
//      BUSINESS_FROM_EMAIL     = bookings@monstrslay.org  (must be a domain verified in Resend)
// 2. In the Stripe Dashboard → Developers → Webhooks → Add endpoint:
//      URL: https://YOUR-DOMAIN.netlify.app/.netlify/functions/stripe-webhook
//      Event to send: checkout.session.completed
//    Stripe will give you the signing secret for STRIPE_WEBHOOK_SECRET above.
// 3. Add "resend" to package.json dependencies (see updated package.json).
//
// If you'd rather use SendGrid, Gmail SMTP, or another provider instead of
// Resend, only the `sendConfirmationEmail` function below needs to change —
// everything else (webhook verification, content) stays the same.

const Stripe = require('stripe');
const { Resend } = require('resend');

const AFTERCARE = {
  hair: {
    label: 'Hair & Protective Styles',
    tips: [
      'Sleep with a satin or silk bonnet/scarf every night to reduce frizz and friction.',
      'Avoid heavy oils or products directly on the scalp for the first 48 hours.',
      'Keep the style dry — a light mist is fine, but avoid fully saturating it in the shower.',
      'Book your takedown before your hair reaches 6–8 weeks to protect your natural hair underneath.',
    ],
  },
  premadeLocs: {
    label: 'Pre-Made Faux Locs',
    tips: [
      'Sleep with a satin or silk bonnet/scarf every night to reduce frizz and friction.',
      'Avoid heavy oils or products directly on the scalp for the first 48 hours.',
      'Keep the style dry — a light mist is fine, but avoid fully saturating it in the shower.',
      'Book your takedown before your hair reaches 6–8 weeks to protect your natural hair underneath.',
    ],
  },
  locs: {
    label: 'Handmade Faux Locs',
    tips: [
      'Sleep with a satin or silk bonnet/scarf every night — this is the #1 way to protect your investment.',
      'Avoid heavy oils or products directly on the scalp for the first 48 hours.',
      'Keep locs dry for the first few days to let the wrap set.',
      'Handmade locs can be worn 6–10 weeks with proper care — book your takedown before then.',
    ],
  },
  nails: {
    label: 'Nails',
    tips: [
      'Apply cuticle oil daily to keep your set healthy and extend wear.',
      'Wear gloves for cleaning, dishes, and anything with heavy chemical exposure.',
      'Avoid using your nails as tools (opening cans, peeling stickers, etc.) — it\u2019s the #1 cause of lifting.',
      'Book fills every 2–3 weeks to keep your set looking fresh and prevent breakage.',
    ],
  },
  nailArt: {
    label: 'Nail Art',
    tips: [
      'Apply cuticle oil daily to keep your set healthy and extend wear.',
      'Avoid picking at chrome or accent details — they\u2019re more delicate than a solid color.',
    ],
  },
  nailEffects: {
    label: 'Premium Nail Effects',
    tips: [
      'Chrome and cat-eye finishes can dull with heavy hand sanitizer use — reapply cuticle oil to keep the shine.',
      'Avoid soaking your hands for long periods (dishes, baths) without gloves.',
    ],
  },
  lashes: {
    label: 'Cluster Lashes',
    tips: [
      'Avoid water, steam, and sweat on your lashes for the first 24 hours.',
      'Use an oil-free makeup remover — oil-based products break down the adhesive.',
      'Don\u2019t rub or pull at your lashes; brush gently with a clean spoolie instead.',
      'Book a refill every 2–3 weeks as your natural lash cycle sheds.',
    ],
  },
};

function categoryFromServiceName(name){
  // Best-effort match since Checkout metadata stores service names, not IDs.
  const n = name.toLowerCase();
  if(n.includes('faux locs') && n.includes('shoulder') || n.includes('mid back') || n.includes('waist') || n.includes('butt')){
    // handled by explicit checks below; fallback here
  }
  if(n.includes('crochet')) return 'hair';
  if(n.includes('handmade')) return 'locs';
  if(n.includes('pre-made') || n.includes('premade')) return 'premadeLocs';
  if(n.includes('lash')) return 'lashes';
  if(n.includes('chrome') || n.includes('glow') || n.includes('cat eye') || n.includes('glitter') || n.includes('rhinestone')) return 'nailEffects';
  if(n.includes('tip') || n.includes('boomer') || n.includes('ombr') || n.includes('milky') || n.includes('sheer') || n.includes('matte') || n.includes('accent')) return 'nailArt';
  if(n.includes('acrylic') || n.includes('gel') || n.includes('dip') || n.includes('nail')) return 'nails';
  return null;
}

function buildAftercareSection(serviceNames){
  const cats = new Set();
  serviceNames.forEach(name => {
    const cat = categoryFromServiceName(name);
    if(cat) cats.add(cat);
  });
  if(cats.size === 0) return '';
  let html = '<h3 style="font-family:Georgia,serif;margin:28px 0 10px;color:#211621;">Your Aftercare Guide</h3>';
  cats.forEach(catId => {
    const guide = AFTERCARE[catId];
    if(!guide) return;
    html += `<p style="margin:14px 0 6px;font-weight:700;color:#A6455C;">${guide.label}</p><ul style="margin:0 0 10px;padding-left:20px;color:#211621;">`;
    guide.tips.forEach(tip => { html += `<li style="margin-bottom:4px;">${tip}</li>`; });
    html += '</ul>';
  });
  return html;
}

async function sendConfirmationEmail({ toEmail, toName, services, amountPaid, mobile, travelFee, signedAt }) {
  const resend = new Resend(process.env.RESEND_API_KEY);
  const fromEmail = process.env.BUSINESS_FROM_EMAIL || 'bookings@monstrslay.org';

  const serviceListHtml = services.map(s => `<li style="margin-bottom:4px;">${s}</li>`).join('');
  const depositDisplay = `$${(amountPaid / 100).toFixed(2)}`;
  const aftercareHtml = buildAftercareSection(services);
  const dateDisplay = signedAt ? new Date(signedAt).toLocaleString('en-US', { dateStyle: 'medium', timeStyle: 'short' }) : '';

  const html = `
  <div style="font-family:Georgia,serif;max-width:560px;margin:0 auto;background:#FBF7F2;padding:32px 28px;color:#211621;">
    <p style="font-style:italic;font-size:22px;margin:0 0 4px;">Monstr Slay Boutique &amp; Monstr Clawz</p>
    <p style="letter-spacing:2px;text-transform:uppercase;font-size:11px;color:#A6455C;margin:0 0 24px;font-family:Arial,sans-serif;">Booking Confirmed</p>

    <p style="font-family:Arial,sans-serif;">Hi ${toName || 'there'},</p>
    <p style="font-family:Arial,sans-serif;">Your appointment request and deposit have been received. Here's everything on file:</p>

    <div style="border:1px solid #E2D8CE;padding:16px 18px;margin:18px 0;background:#fff;">
      <p style="font-family:Arial,sans-serif;font-weight:700;margin:0 0 8px;">Services Requested</p>
      <ul style="font-family:Arial,sans-serif;margin:0 0 10px;padding-left:20px;">${serviceListHtml}</ul>
      ${mobile ? `<p style="font-family:Arial,sans-serif;margin:6px 0;">Mobile appointment — travel fee: $${travelFee}</p>` : ''}
      <p style="font-family:Arial,sans-serif;font-weight:700;margin:10px 0 0;">Deposit Paid: ${depositDisplay}</p>
      ${dateDisplay ? `<p style="font-family:Arial,sans-serif;font-size:12px;color:#6b6b6b;margin:6px 0 0;">Signed &amp; submitted: ${dateDisplay}</p>` : ''}
    </div>

    <p style="font-family:Arial,sans-serif;font-weight:700;margin:20px 0 6px;">Before Your Appointment</p>
    <p style="font-family:Arial,sans-serif;margin:0 0 10px;">Please arrive with hair freshly washed, completely dry, detangled, and free of heavy oils or product buildup. If it's a mobile appointment, please have a clean, well-lit space with an outlet ready.</p>

    ${aftercareHtml}

    <p style="font-family:Arial,sans-serif;margin:24px 0 0;">Need to reschedule? Reply to this email or reach us directly at <a href="mailto:monstrslayboutique@outlook.com" style="color:#A6455C;">monstrslayboutique@outlook.com</a> at least 24 hours before your appointment to transfer your deposit.</p>

    <p style="font-family:Arial,sans-serif;margin:24px 0 0;color:#6b6b6b;font-size:12px;">Monstr Slay Boutique &amp; Monstr Clawz · Hampton Roads, VA · Military Ready™</p>
  </div>`;

  await resend.emails.send({
    from: `Monstr Slay Boutique <${fromEmail}>`,
    to: toEmail,
    subject: 'Your Appointment is Confirmed — Monstr Slay Boutique & Monstr Clawz',
    html,
  });
}

exports.handler = async function (event) {
  const stripe = Stripe(process.env.STRIPE_SECRET_KEY);
  const sig = event.headers['stripe-signature'];

  let stripeEvent;
  try {
    stripeEvent = stripe.webhooks.constructEvent(event.body, sig, process.env.STRIPE_WEBHOOK_SECRET);
  } catch (err) {
    console.error('Webhook signature verification failed:', err.message);
    return { statusCode: 400, body: `Webhook Error: ${err.message}` };
  }

  if (stripeEvent.type === 'checkout.session.completed') {
    const session = stripeEvent.data.object;
    const meta = session.metadata || {};
    const toEmail = session.customer_email || meta.clientEmail;

    if (toEmail) {
      try {
        await sendConfirmationEmail({
          toEmail,
          toName: meta.clientName,
          services: (meta.services || '').split(' | ').filter(Boolean),
          amountPaid: session.amount_total,
          mobile: meta.mobile === 'yes',
          travelFee: meta.travelFee,
          signedAt: meta.signedAt,
        });
      } catch (err) {
        console.error('Failed to send confirmation email:', err);
        // Don't fail the webhook over email delivery — Stripe already has the payment.
      }
    }
  }

  return { statusCode: 200, body: JSON.stringify({ received: true }) };
};
