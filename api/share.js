// GET /a/<id> is rewritten here (see vercel.json). A tiny page with Open Graph tags for a saved Ask BANDIT
// answer, so a shared link previews the answer on X and Telegram, then sends people on to it in the app.
import { storeReady, redis } from '../lib/store.js';

const SITE = (process.env.PUBLIC_URL || 'https://bandit.web3wikis.com').replace(/\/$/, '');
const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

function verdict(m) {
  if (!m || !m.band || m.band.status !== 'formed') return 'too new to judge';
  const p = m.band.percentile;
  return p >= 97 ? 'at its high' : p >= 80 ? 'near its top' : p <= 20 ? 'near its floor' : 'mid range';
}

export async function GET(request) {
  const id = new URL(request.url).searchParams.get('id') || '';
  let saved = null;
  if (/^[a-f0-9]{16}$/.test(id) && storeReady()) {
    try { saved = JSON.parse(await redis('GET', `bandit:answer:${id}`)); } catch {}
  }
  const top = saved?.answer?.ranked?.[0];
  const title = top ? `BANDIT on YT-${top.market?.name || top.name}: ${verdict(top.market)}` : 'Ask BANDIT: which YTs are near their floor?';
  const desc = saved?.answer?.headline || 'BANDIT checks every live Pendle YT against its last 90 days, and SERV Reasoning explains which ones have room to run.';
  const target = saved ? `/#/ask?a=${id}` : '/#/ask';
  const html = `<!DOCTYPE html>
<html lang="en"><head><meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>${esc(title)}</title>
<meta name="description" content="${esc(desc)}">
<meta property="og:type" content="website">
<meta property="og:title" content="${esc(title)}">
<meta property="og:description" content="${esc(desc)}">
<meta property="og:url" content="${SITE}/a/${esc(id)}">
<meta property="og:image" content="${SITE}/og.png">
<meta property="og:image:width" content="1200">
<meta property="og:image:height" content="630">
<meta name="twitter:card" content="summary_large_image">
<meta name="twitter:title" content="${esc(title)}">
<meta name="twitter:description" content="${esc(desc)}">
<meta name="twitter:image" content="${SITE}/og.png">
<meta http-equiv="refresh" content="0; url=${esc(target)}">
<link rel="icon" href="/art/logo-mask.svg" type="image/svg+xml">
</head><body style="margin:0;background:#0A0B08;color:#F1F2E8;font-family:system-ui,sans-serif">
<p style="padding:24px">Opening BANDIT. <a style="color:#C8F25A" href="${esc(target)}">Continue</a></p>
<script>location.replace(${JSON.stringify(target)});</script>
</body></html>`;
  return new Response(html, { status: 200, headers: { 'Content-Type': 'text/html; charset=utf-8', 'Cache-Control': 'public, max-age=300, s-maxage=3600' } });
}
