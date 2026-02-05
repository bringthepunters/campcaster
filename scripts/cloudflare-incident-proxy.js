// Cloudflare Worker proxy for VicEmergency RSS feed.
// Deploy this file as a Worker and use its URL as VITE_INCIDENT_PROXY_URL.
export default {
  async fetch(request) {
    if (request.method === 'OPTIONS') {
      return new Response(null, {
        status: 204,
        headers: corsHeaders(),
      });
    }

    const target =
      'https://data.emergency.vic.gov.au/Show?pageId=getIncidentRSS';
    const upstream = await fetch(target, {
      headers: {
        'User-Agent': 'campcaster/0.1',
      },
    });

    const body = await upstream.text();

    return new Response(body, {
      status: upstream.status,
      headers: {
        ...corsHeaders(),
        'Content-Type': 'application/rss+xml; charset=utf-8',
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
