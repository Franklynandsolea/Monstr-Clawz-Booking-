// netlify/functions/get-availability.js
//
// GET /.netlify/functions/get-availability?date=YYYY-MM-DD&durationMinutes=90
//
// Checks your real Google Calendar for busy blocks that day (via the
// FreeBusy API) and returns open start times within business hours that
// have enough open room for the requested appointment length.
//
// Business rules are configurable via environment variables, with sane
// defaults if you don't set them:
//   BUSINESS_DAYS            comma list of open weekdays, 0=Sun..6=Sat
//                             (default "2,3,4,5,6" = Tue–Sat)
//   BUSINESS_START_HOUR      default 9  (9am)
//   BUSINESS_END_HOUR        default 18 (6pm)
//   SLOT_INCREMENT_MINUTES   default 30
//   MIN_LEAD_HOURS           default 24 (matches your 24-hour cancellation policy)

const { getCalendarClient, getCalendarId } = require('./lib/googleCalendar');

function envInt(name, fallback) {
  const v = process.env[name];
  return v ? parseInt(v, 10) : fallback;
}

exports.handler = async function (event) {
  const dateStr = event.queryStringParameters && event.queryStringParameters.date;
  const durationMinutes = envIntFromQuery(event, 'durationMinutes', 60);

  if (!dateStr || !/^\d{4}-\d{2}-\d{2}$/.test(dateStr)) {
    return { statusCode: 400, body: JSON.stringify({ error: 'Missing or invalid date (expected YYYY-MM-DD)' }) };
  }

  const businessDays = (process.env.BUSINESS_DAYS || '2,3,4,5,6').split(',').map(n => parseInt(n, 10));
  const startHour = envInt('BUSINESS_START_HOUR', 9);
  const endHour = envInt('BUSINESS_END_HOUR', 18);
  const slotIncrement = envInt('SLOT_INCREMENT_MINUTES', 30);
  const minLeadHours = envInt('MIN_LEAD_HOURS', 24);

  const dayStart = new Date(`${dateStr}T00:00:00`);
  const dayOfWeek = dayStart.getDay();

  if (!businessDays.includes(dayOfWeek)) {
    return { statusCode: 200, body: JSON.stringify({ slots: [], reason: 'closed' }) };
  }

  const windowStart = new Date(`${dateStr}T${String(startHour).padStart(2, '0')}:00:00`);
  const windowEnd = new Date(`${dateStr}T${String(endHour).padStart(2, '0')}:00:00`);
  const earliestBookable = new Date(Date.now() + minLeadHours * 3600 * 1000);

  try {
    const calendar = getCalendarClient();
    const calendarId = getCalendarId();

    const freebusy = await calendar.freebusy.query({
      requestBody: {
        timeMin: windowStart.toISOString(),
        timeMax: windowEnd.toISOString(),
        items: [{ id: calendarId }],
      },
    });

    const busy = (freebusy.data.calendars[calendarId] && freebusy.data.calendars[calendarId].busy) || [];
    const busyRanges = busy.map(b => ({ start: new Date(b.start), end: new Date(b.end) }));

    const slots = [];
    let cursor = new Date(windowStart);

    while (cursor.getTime() + durationMinutes * 60000 <= windowEnd.getTime()) {
      const slotStart = new Date(cursor);
      const slotEnd = new Date(cursor.getTime() + durationMinutes * 60000);

      const overlapsBusy = busyRanges.some(r => slotStart < r.end && slotEnd > r.start);
      const meetsLeadTime = slotStart >= earliestBookable;

      if (!overlapsBusy && meetsLeadTime) {
        slots.push(slotStart.toISOString());
      }

      cursor = new Date(cursor.getTime() + slotIncrement * 60000);
    }

    return { statusCode: 200, body: JSON.stringify({ slots, durationMinutes }) };
  } catch (err) {
    console.error('get-availability error:', err);
    return { statusCode: 500, body: JSON.stringify({ error: 'Unable to check calendar availability' }) };
  }
};

function envIntFromQuery(event, name, fallback) {
  const v = event.queryStringParameters && event.queryStringParameters[name];
  const n = v ? parseInt(v, 10) : NaN;
  return Number.isFinite(n) && n > 0 ? n : fallback;
}
