const { getStore } = require('@netlify/blobs');

exports.handler = async (event) => {
  const headers = { 'Content-Type': 'application/json' };
  const store   = getStore('app-config');

  try {
    if (event.httpMethod === 'GET') {
      const data = await store.get('config', { type: 'json' }).catch(() => null);
      return { statusCode: 200, headers, body: JSON.stringify(data || {}) };
    }

    if (event.httpMethod === 'POST') {
      const body    = JSON.parse(event.body || '{}');
      const current = await store.get('config', { type: 'json' }).catch(() => ({}));
      await store.setJSON('config', { ...current, ...body });
      return { statusCode: 200, headers, body: JSON.stringify({ ok: true }) };
    }

    if (event.httpMethod === 'DELETE') {
      await store.setJSON('config', {});
      return { statusCode: 200, headers, body: JSON.stringify({ ok: true }) };
    }

    return { statusCode: 405, headers, body: JSON.stringify({ error: 'Method not allowed' }) };
  } catch (err) {
    return { statusCode: 500, headers, body: JSON.stringify({ error: err.message }) };
  }
};
