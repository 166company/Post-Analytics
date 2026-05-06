import { getStore } from '@netlify/blobs';

export default async (request) => {
  const headers = { 'Content-Type': 'application/json' };
  const store   = getStore('app-config');

  try {
    if (request.method === 'GET') {
      const raw = await store.get('config').catch(() => null);
      return new Response(JSON.stringify(raw ? JSON.parse(raw) : {}), { headers });
    }

    if (request.method === 'POST') {
      const body    = await request.json().catch(() => ({}));
      const raw     = await store.get('config').catch(() => null);
      const current = raw ? JSON.parse(raw) : {};
      await store.set('config', JSON.stringify({ ...current, ...body }));
      return new Response(JSON.stringify({ ok: true }), { headers });
    }

    if (request.method === 'DELETE') {
      await store.set('config', JSON.stringify({}));
      return new Response(JSON.stringify({ ok: true }), { headers });
    }

    return new Response(JSON.stringify({ error: 'Method not allowed' }), { status: 405, headers });
  } catch (err) {
    console.error('[config]', err.message);
    return new Response(JSON.stringify({ error: err.message }), { status: 500, headers });
  }
};

// Bu funksiya /api/config yoluna birbaşa cavab verir
export const config = { path: '/api/config' };
