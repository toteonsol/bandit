// GET /api/watch-users: scheduled pass over every visitor's "My agent" (Vercel cron, every 10 minutes).
import { runAllUserAgents } from '../lib/useragent.js';

const json = (status, body) => new Response(JSON.stringify(body), {
  status,
  headers: { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' },
});

export async function GET(request) {
  const secret = process.env.CRON_SECRET;
  const auth = request.headers.get('authorization') || '';
  const fromCron = secret ? auth === `Bearer ${secret}` : (request.headers.get('user-agent') || '').startsWith('vercel-cron');
  if (!fromCron) return json(401, { error: 'Scheduled runs only.' });
  try {
    return json(200, await runAllUserAgents());
  } catch (e) {
    return json(500, { error: e.message });
  }
}
