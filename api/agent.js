// GET  /api/agent  public agent status: wallet, caps, rules, receipts, points ledger, last run trace.
// POST /api/agent  { action, ... }. Anyone: create-alert. Owner (x-owner-key header): create-rule,
//                  delete-rule, toggle-rule, run, setup-telegram, verify-owner.
import { agentStatus, createRule, deleteRule, toggleRule, runWatcher, isOwner, publicRule } from '../lib/agent.js';
import { ensureWebhook, botUsername } from '../lib/telegram.js';
import { storeReady, rateLimited } from '../lib/store.js';

const json = (status, body) => new Response(JSON.stringify(body), {
  status,
  headers: { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' },
});

const originOf = request => {
  const url = new URL(request.url);
  const proto = request.headers.get('x-forwarded-proto') || url.protocol.replace(':', '');
  const host = request.headers.get('x-forwarded-host') || request.headers.get('host') || url.host;
  return `${proto}://${host}`;
};

export async function GET(request) {
  try {
    return json(200, await agentStatus({ origin: originOf(request) }));
  } catch (e) {
    return json(500, { error: e.message });
  }
}

export async function POST(request) {
  let body;
  try { body = await request.json(); } catch { return json(400, { error: 'Send JSON with an action.' }); }
  const action = String(body.action || '');
  const owner = isOwner(request);
  const ip = (request.headers.get('x-forwarded-for') || 'local').split(',')[0].trim();
  try {
    if (action === 'verify-owner') return json(owner ? 200 : 401, owner ? { owner: true } : { error: process.env.OWNER_KEY ? 'That owner key is not right.' : 'OWNER_KEY is not set in Vercel yet.' });
    if (!storeReady()) return json(503, { error: 'Agent storage is not connected yet. Add Upstash Redis to the Vercel project.' });
    if (action === 'create-alert') {
      if (await rateLimited('alert', ip, 5, 3600)) return json(429, { error: 'Too many alerts from here in the last hour.' });
      const rule = await createRule({ ...body, kind: 'alert' }, { owner });
      const username = await botUsername();
      return json(200, { rule: publicRule(rule), telegramUrl: username ? `https://t.me/${username}?start=${rule.id}` : null });
    }
    if (!owner) return json(401, { error: 'This needs the owner key.' });
    if (action === 'create-rule') return json(200, { rule: publicRule(await createRule(body, { owner: true })) });
    if (action === 'delete-rule') { await deleteRule(String(body.id)); return json(200, { ok: true }); }
    if (action === 'toggle-rule') return json(200, { rule: publicRule(await toggleRule(String(body.id))) });
    if (action === 'run') return json(200, await runWatcher({ source: 'owner', force: true }));
    if (action === 'setup-telegram') return json(200, { username: await ensureWebhook(originOf(request), { force: true }) });
    return json(400, { error: 'Unknown action.' });
  } catch (e) {
    return json(400, { error: e.message });
  }
}
