# Monstr Slay Boutique & Monstr Clawz — Booking & Membership Site

## What's included

**Booking (one-time appointments)**
- `index.html` — the 4-step booking wizard.
- `booking-confirmed.html` — post-deposit confirmation page, with a reference-photo request.
- `netlify/functions/create-deposit-session.js`, `get-booking-details.js`, `stripe-webhook.js` — deposit checkout, confirmation lookup, and the confirmation email.

**Membership (recurring subscriptions) — new**
- `membership.html` — public signup page: pick a tier, enter info, agree to the 3-month minimum commitment, sign, and pay the first month via Stripe.
- `membership-confirmed.html` — post-signup confirmation page showing the plan, price, next billing date, and commitment end date.
- `admin-membership.html` — password-protected dashboard for you to view members and log redemptions as they're used.
- `netlify/functions/create-membership-session.js` — creates the Stripe subscription checkout session.
- `netlify/functions/get-membership-details.js` — looks up a completed session for the confirmation page.
- `netlify/functions/membership-webhook.js` — the engine room: creates the member record and sends a welcome email on signup, **resets everyone's monthly redemption counts on each renewal**, and flags early cancellations.
- `netlify/functions/admin-members.js`, `log-redemption.js` — power the admin dashboard.
- `netlify/functions/lib/tiers.js` — single place where tier pricing, discounts, and monthly redemption caps live. Change a price or a cap here and it updates everywhere.

## To go live

### 1. Deploy via GitHub → Netlify (already done)

### 2. Environment variables (Site settings → Environment variables)
You should already have these from the booking flow:
- `STRIPE_SECRET_KEY`
- `STRIPE_WEBHOOK_SECRET` (for the deposit webhook)
- `RESEND_API_KEY`
- `BUSINESS_FROM_EMAIL`

Add these two new ones:
- `MEMBERSHIP_WEBHOOK_SECRET` — from the new Stripe webhook endpoint you'll create in step 3
- `ADMIN_PASSWORD` — pick a password for the membership dashboard. If you already used one for monstrslay.org's admin functions, you can reuse it or set a different one here.

### 3. Add the membership Stripe webhook
This is **separate** from your existing deposit webhook — memberships need to react to renewals and cancellations, not just one-time payments.
- Stripe Dashboard → Developers → Webhooks → Add endpoint
- URL: `https://YOUR-DOMAIN.netlify.app/.netlify/functions/membership-webhook`
- Events to send: `checkout.session.completed`, `invoice.paid`, `customer.subscription.deleted`
- Copy the signing secret into `MEMBERSHIP_WEBHOOK_SECRET`

### 4. Update the success/cancel URLs
In `netlify/functions/create-membership-session.js`, set `SUCCESS_URL` and `CANCEL_URL` to your real domain (same pattern as the deposit function).

### 5. Redeploy
Push to GitHub, or trigger a manual deploy after adding the new environment variables.

## How the membership system works

**Signup:** Client picks a tier on `membership.html`, signs the commitment agreement, and pays the first month. Stripe creates a subscription that bills automatically every month going forward — no manual invoicing needed.

**Monthly reset:** Every time Stripe successfully charges the recurring payment (`invoice.paid`), the webhook resets that member's redemption counts back to zero. This is what enforces "1 nail fill, 2 lash refills, etc. **per month**, not cumulative" — a member can't stockpile unused visits.

**Redemption tracking:** When a member comes in and uses part of their plan, log it in `admin-membership.html` (protected by `ADMIN_PASSWORD`). Each member shows their used/cap count per category (e.g. "Lash Refill: 1/2") and a "Log Redemption" button. If they've hit their cap, the button disables itself so you can't accidentally over-redeem.

**3-month commitment:** Stored on signup as a date (3 months from purchase). It's tracked and shown in the admin dashboard and on the client's confirmation page, but it is **not automatically enforced** — Stripe doesn't have a native way to block a customer from canceling early through a self-serve flow, and this build doesn't include a self-serve cancel button (matches how the memberships are marketed: clients "text or call to schedule," not a self-service portal). If a member wants to cancel, that happens through you directly — you can check their commitment end date in the admin dashboard first. If they cancel early anyway (e.g. their card is declined and they don't update it, or you cancel it for another reason), the dashboard flags it as "Canceled — Before commitment ended" so you know to follow up about an early-cancellation fee if you choose to charge one.

**Data storage:** Member records live in Netlify Blobs (`@netlify/blobs`), a simple built-in key-value store — no separate database needed. Nothing to configure beyond the `@netlify/blobs` package already in `package.json`.

## Troubleshooting: "We couldn't reach secure checkout automatically"
Same root causes as the deposit flow. Check **Site → Logs → Functions → create-membership-session** (or `create-deposit-session` for the booking flow) after a failed attempt — the real error will be there. Most common: an environment variable was added after the last deploy and needs a fresh deploy to take effect.

## Still worth deciding
- **Self-serve cancellation / plan changes**: not built. Right now all changes go through you directly, matching how the rest of the site is set up.
- **Automatic early-cancellation fee charge**: the dashboard flags early cancellations, but doesn't charge a fee automatically — that would need a one-time Stripe charge added to the cancellation handler if you want it automated.
- **Real-time calendar / time slots**: still not part of either flow — booking and membership signup take the request/subscription, not a specific appointment time.
