const { getStore } = require('@netlify/blobs');

exports.handler = async (event) => {
  const headers = { 'Content-Type': 'application/json' };

  try {
    const store = getStore('app-config');

    if (event.httpMethod === 'GET') {
      const raw  = await store.get('config').catch(() => null);
      const data = raw ? JSON.parse(raw) : {};
      return { statusCode: 200, headers, body: JSON.stringify(data) };
    }

    if (event.httpMethod === 'POST') {
      const body    = JSON.parse(event.body || '{}');
      const raw     = await store.get('config').catch(() => null);
      const current = raw ? JSON.parse(raw) : {};
      await store.set('config', JSON.stringify({ ...current, ...body }));
      return { statusCode: 200, headers, body: JSON.stringify({ ok: true }) };
    }

    if (event.httpMethod === 'DELETE') {
      await store.set('config', JSON.stringify({}));
      return { statusCode: 200, headers, body: JSON.stringify({ ok: true }) };
    }

    return { statusCode: 405, headers, body: JSON.stringify({ error: 'Method not allowed' }) };
  } catch (err) {
    console.error('[config fn] error:', err.message);
    return { statusCode: 500, headers, body: JSON.stringify({ error: err.message }) };
  }
};
