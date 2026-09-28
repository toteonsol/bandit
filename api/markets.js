// GET /api/markets: live Pendle markets with their 90-day implied APY bands.
// Cached 5 minutes at the edge (s-maxage) and in memory (lib/pendle.js).
import { getMarkets } from '../lib/pendle.js';

export async function GET() {
  try {
    const data = await getMarkets();
    return new Response(JSON.stringify(data), {
      status: 200,
      headers: {
        'Content-Type': 'application/json; charset=utf-8',
        'Cache-Control': 'public, max-age=60, s-maxage=300, stale-while-revalidate=600',
      },
    });
  } catch (e) {
    return new Response(JSON.stringify({ error: `Pendle API unavailable: ${e.message}` }), {
      status: 502,
      headers: { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' },
    });
  }
}
