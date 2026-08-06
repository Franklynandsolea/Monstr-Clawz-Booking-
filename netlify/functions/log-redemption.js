// netlify/functions/log-redemption.js
//
// Called from the admin dashboard when staff marks a redemption as used
// (e.g. "logged a nail fill for Jane"). Blocks the redemption if the member
// has already hit their monthly cap for that category.

const { getStore } = require('@netlify/blobs');

exports.handler = async function (event) {
  const providedPassword = event.headers['x-admin-password'];
  if (!process.env.ADMIN_PASSWORD || providedPassword !== process.env.ADMIN_PASSWORD) {
    return { statusCode: 401, body: JSON.stringify({ error: 'Unauthorized' }) };
  }
  if (event.httpMethod !== 'POST') {
    return { statusCode: 405, body: 'Method Not Allowed' };
  }

  try {
    const { subscriptionId, category, action } = JSON.parse(event.body || '{}');
    if (!subscriptionId || !category) {
      return { statusCode: 400, body: JSON.stringify({ error: 'Missing subscriptionId or category' }) };
    }

    const store = getStore('members');
    const key = `sub_${subscriptionId}`;
    const member = await store.get(key, { type: 'json' });
    if (!member) {
      return { statusCode: 404, body: JSON.stringify({ error: 'Member not found' }) };
    }

    const cap = member.redemptionsCap[category];
    if (cap === undefined) {
      return { statusCode: 400, body: JSON.stringify({ error: 'This tier does not include that category' }) };
    }

    const used = member.redemptionsUsed[category] || 0;

    if (action === 'undo') {
      member.redemptionsUsed[category] = Math.max(0, used - 1);
    } else {
      if (used >= cap) {
        return { statusCode: 409, body: JSON.stringify({ error: `Already used ${used}/${cap} for this category this month` }) };
      }
      member.redemptionsUsed[category] = used + 1;
    }

    await store.setJSON(key, member);
    return { statusCode: 200, body: JSON.stringify({ member }) };
  } catch (err) {
    console.error('log-redemption error:', err);
    return { statusCode: 500, body: JSON.stringify({ error: 'Unable to log redemption' }) };
  }
};
