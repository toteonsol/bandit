// POST /api/telegram: Telegram bot webhook. Verified with the secret token BANDIT registers via setWebhook.
import { handleUpdate, webhookAuthorized, telegramReady } from '../lib/telegram.js';
import { linkRule, unlinkChat } from '../lib/agent.js';
import { linkUserChat } from '../lib/useragent.js';

export async function POST(request) {
  if (!telegramReady() || !webhookAuthorized(request)) return new Response('unauthorized', { status: 401 });
  const update = await request.json().catch(() => null);
  try {
    await handleUpdate(update, { linkRule, unlinkChat, linkUser: linkUserChat, siteUrl: process.env.PUBLIC_URL || 'https://bandit.web3wikis.com' });
  } catch (e) {
    console.error('telegram update failed:', e.message);
  }
  return new Response('ok');
}
