# Monstr Slay Boutique & Monstr Clawz — Booking Site

## What's included
- `index.html` — the 4-step booking wizard (services → info & health → policies → sign & pay).
- `booking-confirmed.html` — the page clients land on after paying their deposit. Pulls their booking details from Stripe and displays a receipt, prep checklist, and reschedule link.
- `netlify/functions/create-deposit-session.js` — creates the Stripe Checkout session for the live 25% deposit.
- `netlify/functions/get-booking-details.js` — lets `booking-confirmed.html` safely look up a paid session without exposing your secret key to the browser.
- `netlify/functions/stripe-webhook.js` — fires automatically when a deposit is paid and sends the client a confirmation email with their appointment summary, receipt, prep instructions, and a service-specific aftercare guide.
- `package.json` — dependencies (`stripe`, `resend`) for the functions.

## To go live

1. **Deploy via GitHub → Netlify** (not drag-and-drop) — this site needs Netlify Functions to run.

2. **Stripe** (Site settings → Environment variables):
   - `STRIPE_SECRET_KEY` = your live secret key
   - In the Stripe Dashboard → Developers → Webhooks → **Add endpoint**:
     - URL: `https://YOUR-DOMAIN.netlify.app/.netlify/functions/stripe-webhook`
     - Event: `checkout.session.completed`
   - Copy the signing secret Stripe gives you into `STRIPE_WEBHOOK_SECRET`

3. **Email (Resend)**:
   - Sign up at resend.com (free tier covers this volume easily) and verify a sending domain (e.g. `monstrslay.org`)
   - Add `RESEND_API_KEY` and `BUSINESS_FROM_EMAIL` (e.g. `bookings@monstrslay.org`) as environment variables
   - Don't want to use Resend? Only the `sendConfirmationEmail` function inside `stripe-webhook.js` needs to change — swap in SendGrid, Gmail SMTP, whatever you'd rather use. Everything else stays the same.

4. **Update URLs**:
   - In `create-deposit-session.js`, set `SUCCESS_URL` to `https://YOUR-DOMAIN.netlify.app/booking-confirmed.html` and `CANCEL_URL` to your real domain.

5. Push to GitHub — Netlify builds the functions automatically.

## How it flows end to end
1. Client completes the 4-step wizard and pays the deposit → redirected to Stripe Checkout.
2. On success, Stripe redirects them to `booking-confirmed.html?session_id=...`.
3. That page calls `get-booking-details` to show their receipt and prep checklist immediately.
4. In the background, Stripe fires the `checkout.session.completed` webhook → `stripe-webhook.js` sends the full confirmation email (receipt + prep + aftercare guide, matched to whatever they booked: hair, locs, nails, or lashes).

## Still worth deciding
- **Real-time calendar / time slots**: this flow takes the request and deposit but doesn't check availability against a calendar yet. If you want clients picking an actual open time, that's a separate build (Calendly embed or a custom scheduler).
- **IP address logging**: not currently captured. Can be added inside `create-deposit-session.js` from the request headers if you want it on file for the signed agreement.
- **Membership passes**: still an info section with an email CTA, not a live Stripe subscription. Let me know if you want members billed automatically.
