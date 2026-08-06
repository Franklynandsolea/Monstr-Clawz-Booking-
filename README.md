# Monstr Slay Boutique & Monstr Clawz — Booking & Membership Site

## What's included

**Booking (one-time appointments)**
- `index.html` — the 5-step booking wizard: Services → **Date & Time** → Info & Health → Policies → Sign & Pay.
- `booking-confirmed.html` — post-deposit confirmation page showing the appointment time, receipt, and a reference-photo request.
- `netlify/functions/create-deposit-session.js`, `get-booking-details.js` — deposit checkout and confirmation lookup.
- `netlify/functions/get-availability.js` — checks your real Google Calendar and returns open time slots.
- `netlify/functions/stripe-webhook.js` — sends the confirmation email **and** creates the calendar event once the deposit is paid.
- `netlify/functions/lib/durations.js` — rough appointment-length estimates per service category, used to size how much room a booking blocks on the calendar.
- `netlify/functions/lib/googleCalendar.js` — shared Google Calendar authentication helper.

**Membership (recurring subscriptions)**
- `membership.html` — public signup page: pick a tier, enter info, agree to the 3-month minimum commitment, sign, and pay the first month via Stripe.
- `membership-confirmed.html` — post-signup confirmation page showing the plan, price, next billing date, and commitment end date.
- `admin-membership.html` — password-protected dashboard to view members, log redemptions, and charge early-cancellation fees.
- `netlify/functions/create-membership-session.js`, `get-membership-details.js` — subscription checkout and confirmation lookup.
- `netlify/functions/membership-webhook.js` — creates the member record and sends a welcome email on signup, **resets everyone's monthly redemption counts on each renewal**, and flags early cancellations.
- `netlify/functions/admin-members.js`, `log-redemption.js` — power the admin dashboard.
- `netlify/functions/charge-early-cancellation-fee.js` — charges a canceled member's card on file for an early-cancellation fee, triggered by you from the dashboard (never automatic).
- `netlify/functions/lib/tiers.js` — single place where tier pricing, discounts, redemption caps, and early-cancellation fees live. Change a number here and it updates everywhere (site, emails, checkout).

## To go live

### 1. Deploy via GitHub → Netlify (already done)

### 2. Environment variables (Site settings → Environment variables)
You should already have these from earlier setup:
- `STRIPE_SECRET_KEY`
- `STRIPE_WEBHOOK_SECRET` (for the deposit webhook)
- `RESEND_API_KEY`
- `BUSINESS_FROM_EMAIL`
- `MEMBERSHIP_WEBHOOK_SECRET`
- `ADMIN_PASSWORD`

Add these new ones for the calendar:
- `GOOGLE_CLIENT_ID`
- `GOOGLE_CLIENT_SECRET`
- `GOOGLE_REFRESH_TOKEN`
- `GOOGLE_CALENDAR_ID`

Optional (all have sensible defaults if you skip them):
- `BUSINESS_DAYS` — comma list of open weekdays, `0`=Sun … `6`=Sat. Default `2,3,4,5,6` (Tue–Sat).
- `BUSINESS_START_HOUR` — default `9` (9am)
- `BUSINESS_END_HOUR` — default `18` (6pm)
- `SLOT_INCREMENT_MINUTES` — default `30`
- `MIN_LEAD_HOURS` — default `24` (matches your 24-hour cancellation policy)

### 3. Set up the Google Calendar connection
This is the most involved one-time setup step, but you only do it once.

**a. Pick the calendar clients will book into.** Easiest option: just use the primary calendar on your own Google account (the one already synced to your phone) — you'll see bookings appear automatically, no extra app needed. If you'd rather keep it separate from your personal calendar, create a new calendar inside your Google Calendar app first (Settings → Add calendar → Create new calendar), then find its **Calendar ID** in that calendar's settings (Settings → [calendar name] → Integrate calendar → Calendar ID). If using your primary calendar, the ID is just your Gmail address.

**b. Create a Google Cloud project & enable the Calendar API.**
- Go to console.cloud.google.com → create a new project (any name, e.g. "Monstr Slay Booking")
- In the search bar, find **Google Calendar API** → click **Enable**

**c. Create OAuth credentials.**
- Left menu → **APIs & Services → Credentials → Create Credentials → OAuth client ID**
- If prompted, configure the **OAuth consent screen** first: choose **External**, fill in the required app name/email fields, and under **Test users** add your own Google account email. You don't need to publish the app — "Testing" mode works fine for this since only you'll ever authorize it.
- Back in Credentials: Application type → **Desktop app** → name it anything → Create
- You'll get a **Client ID** and **Client Secret** — save both, these go in `GOOGLE_CLIENT_ID` / `GOOGLE_CLIENT_SECRET`

**d. Get a refresh token using Google's OAuth Playground.**
- Go to developers.google.com/oauthplayground
- Click the gear icon (top right) → check **"Use your own OAuth credentials"** → paste in your Client ID and Client Secret
- In the left panel, find **Google Calendar API v3** → select the scope `https://www.googleapis.com/auth/calendar`
- Click **Authorize APIs** → sign in with the Google account whose calendar you're using → allow access
- Click **Exchange authorization code for tokens**
- Copy the **Refresh token** shown — this goes in `GOOGLE_REFRESH_TOKEN`. It doesn't expire unless you manually revoke access, so this is a one-time step.

**e. Add `GOOGLE_CALENDAR_ID`** — your Gmail address (if using your primary calendar) or the Calendar ID from step (a).

### 4. Add the membership Stripe webhook (if not already done)
- Stripe Dashboard → Developers → Webhooks → Add endpoint
- URL: `https://YOUR-DOMAIN.netlify.app/.netlify/functions/membership-webhook`
- Events: `checkout.session.completed`, `invoice.paid`, `customer.subscription.deleted`
- Copy the signing secret into `MEMBERSHIP_WEBHOOK_SECRET`

### 5. Update success/cancel URLs
In both `create-deposit-session.js` and `create-membership-session.js`, set `SUCCESS_URL` / `CANCEL_URL` to your real domain.

### 6. Redeploy
Push to GitHub, or trigger a manual deploy after adding the new environment variables.

## How real-time booking works
1. Client picks services in Step 1 (this estimates the appointment's total length using `lib/durations.js`).
2. In Step 2, they pick a date. The site calls `get-availability`, which checks your calendar's free/busy status for that day and shows only times with enough open room for the estimated duration — already-booked times just won't appear.
3. On deposit payment, `stripe-webhook.js` creates the calendar event automatically, with the client's name, services, phone, and address (for mobile jobs) in the event description. You'll see it appear on your calendar within moments of payment — no manual entry.

**A note on duration estimates:** these are rough averages per category (e.g. a crochet install blocks ~105 minutes), not a promise to the client — they're only used to size the calendar block so back-to-back bookings don't overlap. Adjust the numbers in `lib/durations.js` any time to better match your real average appointment lengths.

## How the membership system works

**Signup:** Client picks a tier on `membership.html`, signs the commitment agreement, and pays the first month. Stripe creates a subscription that bills automatically every month going forward.

**Monthly reset:** Every successful renewal (`invoice.paid`) resets that member's redemption counts back to zero — this is what enforces "per month, not cumulative."

**Redemption tracking:** Log usage in `admin-membership.html`. Each member shows used/cap per category with a "Log Redemption" button that disables once they've hit their cap.

**3-month commitment & early-cancellation fee:** The commitment end date is tracked and shown in the dashboard. It isn't auto-enforced (no self-serve cancel button exists — cancellations go through you directly, matching how membership sign-ups are marketed). If a subscription is canceled before that date, the dashboard flags it "Before commitment ended" and shows a **"Charge Early-Cancellation Fee"** button.

**How the automatic fee charge works:** when a client completes membership checkout, Stripe automatically saves their card to their account (it has to, in order to keep billing monthly). Clicking the charge button runs an *off-session* charge against that same saved card for one month's price (configurable per tier in `lib/tiers.js`) — no need to collect payment info again. You get a confirmation prompt before it fires, and the dashboard records the charge so it can't be double-charged. Occasionally a bank will still require additional verification the customer would need to complete themselves (shows as a decline rather than a silent failure) — this happens sometimes with certain cards but isn't the norm.

**Data storage:** Member records live in Netlify Blobs (`@netlify/blobs`) — a built-in key-value store, no separate database needed.

## Troubleshooting

**"We couldn't reach secure checkout automatically"** — Check **Site → Logs → Functions → create-deposit-session** (or `create-membership-session`) after a failed attempt. Most common cause: an environment variable was added after the last deploy and needs a fresh deploy to take effect.

**No available time slots ever show up** — Check **Site → Logs → Functions → get-availability**. Common causes: `GOOGLE_REFRESH_TOKEN` wasn't generated with the Calendar scope, `GOOGLE_CALENDAR_ID` doesn't match the calendar you authorized, or the date picked falls outside `BUSINESS_DAYS`/hours.

**Calendar events aren't appearing after payment** — Check the `stripe-webhook` function logs. This fails silently by design (a calendar hiccup shouldn't block a paid booking), so the client's deposit and confirmation still go through even if the event creation fails — you'd just need to add it manually that one time.

## Still worth deciding
- **Self-serve cancellation / plan changes / rescheduling**: not built. All changes go through you directly.
- **Recurring monthly hair services on Full Slay**: the membership discount and monthly redemption cap are tracked, but which specific style (Signature Crochet Install vs. a Pre-Made/Handmade touch-up) is decided at booking time, not restricted by the system.
