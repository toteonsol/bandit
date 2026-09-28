// Telegram bot: alerts go out through the Bot API; /start deep links come in through the webhook (/api/telegram).
//   /start            follow the agent: get a message whenever it acts or SERV holds off
//   /start r_<id>     link an alert rule created on the site to this chat
//   /stop             stop everything for this chat
import { createHash, timingSafeEqual } from 'node:crypto';
import { redis, getJSON, setJSON, KEYS, storeReady } from './store.js';

const token = () => (process.env.TELEGRAM_BOT_TOKEN || '').trim();
export const telegramReady = () => Boolean(token());

export async function tg(method, params = {}) {
  const res = await fetch(`https://api.telegram.org/bot${token()}/${method}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(params),
    signal: AbortSignal.timeout(8000),
  });
  const body = await res.json().catch(() => ({}));
  if (!body.ok) {
    const err = new Error(`Telegram ${method} failed: ${body.description || `HTTP ${res.status}`}`);
    err.code = body.error_code;
    throw err;
  }
  return body.result;
}

export const webhookSecret = () => createHash('sha256').update(`bandit-webhook:${token()}`).digest('hex').slice(0, 48);

export function webhookAuthorized(request) {
  const got = Buffer.from(request.headers.get('x-telegram-bot-api-secret-token') || '');
  const want = Buffer.from(webhookSecret());
  return got.length === want.length && timingSafeEqual(got, want);
}

export async function botUsername() {
  if (process.env.TELEGRAM_BOT_USERNAME) return process.env.TELEGRAM_BOT_USERNAME.replace(/^@/, '');
  const meta = storeReady() ? await getJSON(KEYS.telegram, null) : null;
  return meta?.username || null;
}

// Points the bot's webhook at this deployment. Idempotent; called by the owner or lazily on status reads.
export async function ensureWebhook(origin, { force = false } = {}) {
  if (!telegramReady() || !storeReady()) return null;
  const url = `${origin}/api/telegram`;
  const meta = await getJSON(KEYS.telegram, null);
  if (!force && meta?.webhook === url && meta?.username) return meta.username;
  const me = await tg('getMe');
  await tg('setWebhook', { url, secret_token: webhookSecret(), allowed_updates: ['message'], drop_pending_updates: true });
  await setJSON(KEYS.telegram, { username: me.username, webhook: url, at: new Date().toISOString() });
  return me.username;
}

export async function sendTo(chatId, text) {
  try {
    await tg('sendMessage', { chat_id: chatId, text, disable_web_page_preview: true });
    return true;
  } catch (e) {
    if (e.code === 403 && storeReady()) await redis('SREM', KEYS.followers, chatId); // user blocked the bot
    return false;
  }
}

export async function notifyFollowers(text) {
  if (!telegramReady() || !storeReady()) return 0;
  const chats = (await redis('SMEMBERS', KEYS.followers)) || [];
  const sent = await Promise.all(chats.map(id => sendTo(id, text)));
  return sent.filter(Boolean).length;
}

// Handles one webhook update. `linkRule(ruleId, chatId)` activates an alert rule and returns it (or null).
export async function handleUpdate(update, { linkRule, unlinkChat, linkUser, siteUrl }) {
  const msg = update?.message;
  const chatId = msg?.chat?.id;
  const text = (msg?.text || '').trim();
  if (!chatId || !text.startsWith('/')) return;
  const [command, payload = ''] = text.split(/\s+/, 2);

  if (command === '/start' && payload.startsWith('u_') && linkUser) {
    const addr = await linkUser(payload.slice(2), chatId);
    await sendTo(chatId, addr
      ? `Linked. Your personal BANDIT agent (${addr.slice(0, 6)}...${addr.slice(-4)}) will message you here when it acts, holds off, or needs your one-tap approval.\n\nData and reasoning only. Not financial advice.`
      : 'That link expired. Open My agent on the site and tap Connect Telegram again.');
    return;
  }
  if (command === '/start' && payload.startsWith('r_')) {
    const rule = await linkRule(payload, chatId);
    await sendTo(chatId, rule
      ? `Alert linked. BANDIT will message you here when ${rule.marketName} crosses P${rule.trigger.pct} (${rule.trigger.dir}), with SERV Reasoning's read.\n\nData and reasoning only. Not financial advice.`
      : 'That alert link has expired or was already used. Create a new alert on the site.');
    return;
  }
  if (command === '/start') {
    await redis('SADD', KEYS.followers, chatId);
    await sendTo(chatId, `You're following the BANDIT agent. You'll get a message whenever it acts on Robinhood Chain or SERV Reasoning holds off, with the points math and the reason.\n\nSend /stop to unfollow. ${siteUrl}\n\nData and reasoning only. Not financial advice.`);
    return;
  }
  if (command === '/stop') {
    await redis('SREM', KEYS.followers, chatId);
    await unlinkChat(chatId);
    await sendTo(chatId, 'Stopped. BANDIT will not message you again unless you send /start.');
  }
}
