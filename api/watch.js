// GET /api/watch: the scheduled watcher (Vercel cron). Evaluates every active rule, asks SERV Reasoning to
// confirm or hold off on each trigger, and acts within the hard caps. The owner can also run it from the app.
import { runWatcher } from '../lib/agent.js';

const json = (status, body) => new Response(JSON.stringify(body), {
  status,
  headers: { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' },
});

export async function GET(request) {
  const secret = process.env.CRON_SECRET;
  const auth = request.headers.get('authorization') || '';
  const fromCron = secret ? auth === `Bearer ${secret}` : (request.headers.get('user-agent') || '').startsWith('vercel-cron');
  if (!fromCron) return json(401, { error: 'Scheduled runs only. The owner can use Run now in the app.' });
  try {
    return json(200, await runWatcher({ source: 'cron' }));
  } catch (e) {
    return json(500, { error: e.message });
  }
}
