// netlify/functions/lib/googleCalendar.js
//
// Authenticates against Google Calendar using a one-time refresh token
// (see README for how to generate it). No per-booking sign-in needed —
// this is your business calendar, authorized once, reused forever until
// you manually revoke access in your Google Account settings.

const { google } = require('googleapis');

function getCalendarClient() {
  const oAuth2Client = new google.auth.OAuth2(
    process.env.GOOGLE_CLIENT_ID,
    process.env.GOOGLE_CLIENT_SECRET
  );
  oAuth2Client.setCredentials({ refresh_token: process.env.GOOGLE_REFRESH_TOKEN });
  return google.calendar({ version: 'v3', auth: oAuth2Client });
}

function getCalendarId() {
  return process.env.GOOGLE_CALENDAR_ID || 'primary';
}

module.exports = { getCalendarClient, getCalendarId };
