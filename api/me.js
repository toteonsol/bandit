// POST /api/me: "My agent". Public actions: nonce, verify (wallet sign-in). With the x-bandit-session header:
// status, create-rule, delete-rule, run, telegram-link, reset.
import { issueNonce, verifySignIn, sessionAddress } from '../lib/session.js';
import { userStatus, createUserRule, deleteUserRule, setUserRules, runUserAgent, telegramLinkFor, resetPaper, ensureUser } from '../lib/useragent.js';
import { storeReady, rateLimited } from '../lib/store.js';

const json = (status, body) => new Response(JSON.stringify(body), {
  status,
  headers: { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' },
});

export async function POST(request) {
  if (!storeReady()) return json(503, { error: 'Agent storage is not connected yet.' });
  let body;
  try { body = await request.json(); } catch { return json(400, { error: 'Send JSON with an action.' }); }
  const action = String(body.action || '');
  const ip = (request.headers.get('x-forwarded-for') || 'local').split(',')[0].trim();
  try {
    if (action === 'nonce') {
      if (await rateLimited('nonce', ip, 20, 600)) return json(429, { error: 'Too many sign-in attempts. Wait a few minutes.' });
      return json(200, await issueNonce(String(body.address || '')));
    }
    if (action === 'verify') {
      const session = await verifySignIn({ address: String(body.address || ''), nonce: String(body.nonce || ''), signature: String(body.signature || '') });
      await ensureUser(session.address);
      return json(200, session);
    }
    const addr = sessionAddress(request);
    if (!addr) return json(401, { error: 'Sign in with your wallet first.' });
    if (action === 'status') return json(200, await userStatus(addr));
    if (action === 'create-rule') {
      if (await rateLimited('urule', addr, 20, 3600)) return json(429, { error: 'Too many rules in the last hour.' });
      return json(200, { rule: await createUserRule(addr, body) });
    }
    if (action === 'delete-rule') { await deleteUserRule(addr, String(body.id)); return json(200, { ok: true }); }
    if (action === 'toggle-rule') return json(200, await setUserRules(addr, { id: String(body.id) }));
    if (action === 'sleep') return json(200, await setUserRules(addr, { on: false }));
    if (action === 'wake') return json(200, await setUserRules(addr, { on: true }));
    if (action === 'run') {
      if (await rateLimited('urun', addr, 1, 30)) return json(429, { error: 'Your agent just ran. Give it 30 seconds.' });
      return json(200, await runUserAgent(addr, { force: true, source: 'you' }));
    }
    if (action === 'telegram-link') return json(200, { url: await telegramLinkFor(addr) });
    if (action === 'reset') { await resetPaper(addr); return json(200, { ok: true }); }
    return json(400, { error: 'Unknown action.' });
  } catch (e) {
    return json(400, { error: e.message });
  }
}
