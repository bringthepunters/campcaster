// Cloudflare Worker proxy for Bookeasy grid JSON.
// Deploy this file as a Worker and use its URL as VITE_BOOKEASY_PROXY_URL.
export default {
  async fetch(request) {
    if (request.method === 'OPTIONS') {
      return new Response(null, {
        status: 204,
        headers: corsHeaders(),
      });
    }

    const url = new URL(request.url);
    const date = url.searchParams.get('date');
    if (!date) {
      return new Response(JSON.stringify({ error: 'Missing date' }), {
        status: 400,
        headers: {
          ...corsHeaders(),
          'Content-Type': 'application/json; charset=utf-8',
        },
      });
    }

    const target = new URL('https://bookings.parks.vic.gov.au/book');
    target.searchParams.set('format', 'json');
    target.searchParams.set('q', '114');
    target.searchParams.set('pagenumber', '1');
    target.searchParams.set('date', date);
    target.searchParams.set('period', '1');

    const upstream = await fetch(target.toString(), {
      headers: {
        'User-Agent': 'campcaster/0.1',
      },
    });

    const body = await upstream.text();

    return new Response(body, {
      status: upstream.status,
      headers: {
        ...corsHeaders(),
        'Content-Type': 'application/json; charset=utf-8',
        'Cache-Control': 'no-store',
      },
    });
  },
};

function corsHeaders() {
  return {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'GET, OPTIONS',
    'Access-Control-Allow-Headers': '*',
  };
}
