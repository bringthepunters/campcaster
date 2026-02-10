// Deploy this file as a Cloudflare Worker and set a secret named ORS_API_KEY.
// Use its URL as VITE_ROUTE_PROXY_URL.

const ORS_MATRIX_URL = 'https://api.openrouteservice.org/v2/matrix/driving-car'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type',
}


export default {
  async fetch(request, env) {
    if (request.method === 'OPTIONS') {
      return new Response(null, { status: 204, headers: corsHeaders })
    }

    if (request.method !== 'POST') {
      return new Response('Method not allowed', {
        status: 405,
        headers: corsHeaders,
      })
    }

    try {
      const body = await request.json()
      const origin = body?.origin
      const destinations = Array.isArray(body?.destinations)
        ? body.destinations
        : []

      if (
        !origin ||
        !Number.isFinite(origin.lat) ||
        !Number.isFinite(origin.lng) ||
        destinations.length === 0
      ) {
        return new Response('Invalid payload', {
          status: 400,
          headers: corsHeaders,
        })
      }

      const locations = [
        [origin.lng, origin.lat],
        ...destinations.map((dest) => [dest.lng, dest.lat]),
      ]
      const matrixBody = JSON.stringify({
        locations,
        sources: [0],
        destinations: destinations.map((_, index) => index + 1),
        metrics: ['duration'],
      })

      const upstream = await fetch(ORS_MATRIX_URL, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: env.ORS_API_KEY,
        },
        body: matrixBody,
      })

      if (!upstream.ok) {
        return new Response('Upstream error', {
          status: upstream.status,
          headers: corsHeaders,
        })
      }

      const payload = await upstream.json()
      const durations = payload?.durations?.[0] ?? []
      const responseDurations = {}
      destinations.forEach((dest, index) => {
        const seconds = durations[index]
        if (Number.isFinite(seconds)) {
          responseDurations[dest.id] = Math.round(seconds / 60)
        }
      })

      return new Response(JSON.stringify({ durations: responseDurations }), {
        status: 200,
        headers: {
          ...corsHeaders,
          'Content-Type': 'application/json',
        },
      })
    } catch (error) {
      return new Response('Proxy error', { status: 500, headers: corsHeaders })
    }
  },
}
