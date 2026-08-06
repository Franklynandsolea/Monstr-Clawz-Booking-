// netlify/functions/admin-members.js
//
// Returns all membership records for the admin dashboard. Protected by the
// same ADMIN_PASSWORD pattern already used elsewhere on your sites — send it
// as the `x-admin-password` header.

const { getStore } = require('@netlify/blobs');

exports.handler = async function (event) {
  const providedPassword = event.headers['x-admin-password'];
  if (!process.env.ADMIN_PASSWORD || providedPassword !== process.env.ADMIN_PASSWORD) {
    return { statusCode: 401, body: JSON.stringify({ error: 'Unauthorized' }) };
  }

  try {
    const store = getStore('members');
    const { blobs } = await store.list();
    const members = await Promise.all(
      blobs.map(async b => store.get(b.key, { type: 'json' }))
    );
    return { statusCode: 200, body: JSON.stringify({ members: members.filter(Boolean) }) };
  } catch (err) {
    console.error('admin-members error:', err);
    return { statusCode: 500, body: JSON.stringify({ error: 'Unable to load members' }) };
  }
};
