// POST /api/trade { marketId, usd, address, slippage }: "Trade with BANDIT". Builds a YT buy on Robinhood Chain
// for the user's own wallet, has SERV Reasoning review it, and returns the transaction for the user to sign.
// BANDIT never holds user funds on this path.
import { reviewUserTrade } from '../lib/agent.js';
import { rateLimited, takePublicServBudget } from '../lib/store.js';

const json = (status, body) => new Response(JSON.stringify(body), {
  status,
  headers: { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' },
});

export async function POST(request) {
  const ip = (request.headers.get('x-forwarded-for') || 'local').split(',')[0].trim();
  try {
    if (await rateLimited('trade', ip, 8, 600)) return json(429, { error: 'Too many trade reviews from here. Wait a few minutes.' });
  } catch {}
  let body;
  try { body = await request.json(); } catch { return json(400, { error: 'Send JSON with marketId, usd, and address.' }); }
  if (!(await takePublicServBudget().catch(() => true))) return json(429, { error: 'BANDIT reached its daily SERV Reasoning budget. Try again tomorrow.' });
  try {
    return json(200, await reviewUserTrade(body));
  } catch (e) {
    return json(400, { error: e.message });
  }
}
