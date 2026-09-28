/* BANDIT app: farm board, band board, agent (with Agent Live), receipts, Ask BANDIT, Trade with BANDIT, alerts. */
const $ = (s, el = document) => el.querySelector(s);
const $$ = (s, el = document) => [...el.querySelectorAll(s)];
const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const undash = s => String(s ?? '').replace(/\s*—\s*/g, ', ').replace(/–/g, '-');
const clean = s => esc(undash(s));
const sleep = ms => new Promise(r => setTimeout(r, ms));
const num = s => Number(String(s ?? '').replace(/[^0-9.]/g, ''));
const pct = (x, d = 2) => (x == null || !isFinite(x)) ? 'n/a' : (x * 100).toFixed(d) + '%';
const usd = n => (n == null || !isFinite(n)) ? 'n/a' : n >= 1e9 ? '$' + (n / 1e9).toFixed(2) + 'B' : n >= 1e6 ? '$' + (n / 1e6).toFixed(1) + 'M' : n >= 1e3 ? '$' + Math.round(n / 1e3) + 'K' : '$' + n.toFixed(n < 10 ? 2 : 0);
const compact = n => (n == null || !isFinite(n)) ? 'n/a' : new Intl.NumberFormat('en-US', { notation: 'compact', maximumFractionDigits: 1 }).format(n);
const cost = c => c == null ? null : c <= 0 ? 'Free' : c >= 1 ? '$' + c.toFixed(2) : '$' + c.toFixed(Math.min(12, Math.ceil(-Math.log10(c)) + 1));
const MON = ['JAN', 'FEB', 'MAR', 'APR', 'MAY', 'JUN', 'JUL', 'AUG', 'SEP', 'OCT', 'NOV', 'DEC'];
const shortDate = iso => { const d = new Date(iso); return `${String(d.getUTCDate()).padStart(2, '0')} ${MON[d.getUTCMonth()]} ${String(d.getUTCFullYear()).slice(2)}`; };
const zone = p => p <= 20 ? 'lo' : p >= 80 ? 'hi' : 'mid';
const zoneLabel = p => p <= 20 ? 'near floor' : p >= 80 ? 'near top' : 'mid band';
const hueOf = s => { let h = 0; for (const c of s) h = (h * 31 + c.charCodeAt(0)) >>> 0; return h % 360; };
const initials = name => name.replace(/[^A-Za-z0-9]/g, '').slice(0, 2) || '??';
const coinStyle = name => { const h = hueOf(name); return `background:linear-gradient(135deg,hsl(${h} 28% 12%),hsl(${h} 34% 21%));color:hsl(${h} 80% 78%)`; };
const formed = m => m.band && m.band.status === 'formed';
const ago = iso => { if (!iso) return 'never'; const s = (Date.now() - Date.parse(iso)) / 1000; return s < 60 ? 'just now' : s < 3600 ? `${Math.round(s / 60)}m ago` : s < 86400 ? `${Math.round(s / 3600)}h ago` : `${Math.round(s / 86400)}d ago`; };
const shortAddr = a => a ? `${a.slice(0, 6)}…${a.slice(-4)}` : '';
const RH = 4663;
const ICONS = {"check":"<path d=\"M20 6 9 17l-5-5\"/>","scan":"<circle cx=\"12\" cy=\"12\" r=\"8.5\" stroke-dasharray=\"3.2 3.2\"/><circle cx=\"12\" cy=\"12\" r=\"2\"/>","pause":"<path d=\"M9 5.5v13M15 5.5v13\"/>","ban":"<circle cx=\"12\" cy=\"12\" r=\"8.5\"/><path d=\"m6 6 12 12\"/>","alert":"<circle cx=\"12\" cy=\"12\" r=\"8.5\"/><path d=\"M12 7.5v5.5M12 16.4v.1\"/>","send":"<path d=\"M21 3 10.5 13.5M21 3l-6.5 18-4-7.5L3 9.5z\"/>","flag":"<path d=\"M5.5 21V4M5.5 4.5h11l-2.2 4 2.2 4h-11\"/>","spark":"<path d=\"M12 3.5 13.9 10.1 20.5 12l-6.6 1.9L12 20.5l-1.9-6.6L3.5 12l6.6-1.9z\"/>","pen":"<path d=\"M4 20h4L19 9a2.8 2.8 0 0 0-4-4L4 16z\"/><path d=\"m13.5 6.5 4 4\"/>","user":"<circle cx=\"12\" cy=\"8.5\" r=\"4\"/><path d=\"M4.5 20.5a7.5 7.5 0 0 1 15 0\"/>","copy":"<rect x=\"9\" y=\"9\" width=\"11.5\" height=\"11.5\" rx=\"2.2\"/><path d=\"M5.5 15V5.7a2.2 2.2 0 0 1 2.2-2.2H15\"/>","swap":"<path d=\"M7 7.5h13l-3.5-3.5M17 16.5H4l3.5 3.5\"/>","power":"<path d=\"M12 3v8.5M17.8 6.8a8 8 0 1 1-11.6 0\"/>","down":"<path d=\"m3.5 7 6.5 6.5 3.5-3.5 7 7\"/><path d=\"M20.5 11.5V17h-5.5\"/>","up":"<path d=\"m3.5 17 6.5-6.5 3.5 3.5 7-7\"/><path d=\"M20.5 12.5V7h-5.5\"/>","target":"<circle cx=\"12\" cy=\"12\" r=\"8.5\"/><circle cx=\"12\" cy=\"12\" r=\"4.5\"/><circle cx=\"12\" cy=\"12\" r=\".8\" fill=\"currentColor\"/>","link":"<path d=\"M10 14a4.5 4.5 0 0 0 6.4 0l3.1-3.1a4.5 4.5 0 0 0-6.4-6.4l-1 1M14 10a4.5 4.5 0 0 0-6.4 0l-3.1 3.1a4.5 4.5 0 0 0 6.4 6.4l1-1\"/>","gauge":"<path d=\"M12 14.5 16 10M3.6 17.5a9 9 0 1 1 16.8 0\"/>","clock":"<circle cx=\"12\" cy=\"12\" r=\"8.5\"/><path d=\"M12 7.5V12l3 2\"/>","drop":"<path d=\"M12 3s6.2 6.8 6.2 11a6.2 6.2 0 0 1-12.4 0C5.8 9.8 12 3 12 3z\"/>","flame":"<path d=\"M12 21c3.9 0 6.5-2.6 6.5-6.4 0-4.7-4.4-6.6-4.4-11.1-2.8 1.8-3.8 4.6-3.8 6.6-.9-.8-1.7-1.8-1.9-3.6-1.9 1.8-2.9 4.6-2.9 8.1 0 3.8 2.6 6.4 6.5 6.4z\"/>","moon":"<path d=\"M19.5 14.5A7.8 7.8 0 1 1 9.5 4.5a6.3 6.3 0 0 0 10 10z\"/>","wallet":"<rect x=\"3.5\" y=\"6\" width=\"17\" height=\"13\" rx=\"2.5\"/><path d=\"M3.5 9.5h17M15.5 14h2\"/>"};
const ic = (name, size = 16) => `<svg class="i" viewBox="0 0 24 24" width="${size}" height="${size}" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${ICONS[name] || ''}</svg>`;
const chainShort = m => ({ 4663: 'Robinhood', 1: 'Ethereum', 42161: 'Arbitrum' })[m.chainId] || m.chainName;
const WALLET_CHAIN = { chainId: '0x1237', chainName: 'Robinhood Chain', nativeCurrency: { name: 'Ether', symbol: 'ETH', decimals: 18 }, rpcUrls: ['https://rpc.mainnet.chain.robinhood.com'], blockExplorerUrls: ['https://robinhoodchain.blockscout.com'] };
const store = { get: k => { try { return localStorage.getItem(k); } catch { return null; } }, set: (k, v) => { try { v == null ? localStorage.removeItem(k) : localStorage.setItem(k, v); } catch {} } };

const state = {
  data: null, byId: new Map(), agent: null, agentSig: '', route: 'farm',
  farmChain: 'all', chain: 'all', sort: { key: 'grade', dir: -1 }, gradeFilter: 'all', openRows: new Set(),
  owner: store.get('bandit.owner'),
  providers: [], walletList: [], wallet: { provider: null, info: null, address: null },
  trade: { step: 'connect', review: null, marketId: null, size: 10 },
  live: { token: 0, playing: false },
};

/* ---------- api + toasts ---------- */
async function api(path, { method = 'GET', body, owner = false } = {}) {
  const headers = {};
  if (body) headers['Content-Type'] = 'application/json';
  if (owner && state.owner) headers['x-owner-key'] = state.owner;
  const r = await fetch(path, { method, headers, body: body ? JSON.stringify(body) : undefined });
  const j = await r.json().catch(() => null);
  if (!r.ok || !j) throw new Error((j && j.error) || `HTTP ${r.status}`);
  return j;
}
function toast(text, kind = '') {
  const el = document.createElement('div');
  el.className = `toast ${kind}`;
  el.textContent = undash(text);
  $('#toasts').appendChild(el);
  setTimeout(() => el.remove(), 5200);
}

/* ---------- router ---------- */
function route() {
  const h = location.hash.replace(/^#\/?/, '').split('?')[0];
  const r = { bands: 'bands', agent: 'agent', receipts: 'receipts', my: 'my', ask: 'ask', stream: 'stream' }[h] || 'farm';
  const changed = r !== state.route;
  state.route = r;
  $$('.view').forEach(v => v.classList.toggle('on', v.id === `view-${r}`));
  $$('[data-route]').forEach(a => a.classList.toggle('on', a.dataset.route === r));
  document.body.classList.toggle('on-ask', r === 'ask');
  document.body.classList.toggle('on-stream', r === 'stream');
  closeMenu();
  if (h === 'farm-board') setTimeout(() => $('#farm-board').scrollIntoView({ behavior: 'smooth' }), 40);
  const tm = location.hash.match(/^#\/trade\?m=([^&]+)/);
  if (tm) { const id = decodeURIComponent(tm[1]); history.replaceState(null, '', '#/'); const open = () => openTrade(id); state.data ? open() : setTimeout(open, 1500); }
  else if (changed) window.scrollTo({ top: 0 });
  // Only one Agent World lives in the DOM at a time (they share element ids).
  if (r !== 'agent') $('#agentRoot').innerHTML = '';
  if (r !== 'my') $('#myRoot').innerHTML = '';
  if (r !== 'stream') $('#streamRoot').innerHTML = '';
  if (!['agent', 'my', 'stream'].includes(r)) unmountWorld();
  if (r === 'agent') { state.agentSig = ''; renderAgent(); }
  if (r === 'my') { state.meSig = ''; renderMy(); loadMe(); }
  if (r === 'receipts') { renderReceipts(); loadMe(); }
  if (r === 'stream') renderStream();
  if (r === 'agent' || r === 'receipts' || r === 'stream') loadAgent();
  if (r === 'ask') renderAskPage();
}
const routeOf = () => ({ bands: 'bands', agent: 'agent', receipts: 'receipts', my: 'my', ask: 'ask', stream: 'stream' })[location.hash.replace(/^#\/?/, '').split('?')[0]] || 'farm';
// A soft crossfade between pages where the browser supports it, unless the viewer prefers less motion.
window.addEventListener('hashchange', () => {
  if (document.startViewTransition && routeOf() !== state.route && !matchMedia('(prefers-reduced-motion: reduce)').matches) document.startViewTransition(route);
  else route();
});

/* ---------- band gauge ---------- */
function bandHtml(m, { labels = true } = {}) {
  const b = m.band;
  const tl = labels ? `<span class="tl f">${b.min != null ? pct(b.min) : ''}</span><span class="tl c">${b.max != null ? pct(b.max) : ''}</span>` : '';
  if (!formed(m)) return `<div class="band forming"><div class="track"><span class="tick f"></span><span class="tick c"></span><span class="fnote">${b.status === 'forming' ? `forming · d${b.days}` : 'no history'}</span>${tl}</div></div>`;
  const x = Math.max(1.5, Math.min(98.5, b.percentile));
  return `<div class="band"><div class="track"><span class="tick f"></span><span class="tick c"></span>${tl}<span class="now ${zone(b.percentile)}" style="--x:${x}%" title="P${Math.round(b.percentile)} of its band"></span></div></div>`;
}
const pctLabel = m => formed(m)
  ? `<span class="pct ${zone(m.band.percentile)}">P${Math.round(m.band.percentile)}</span> <span class="faint">${esc(plainBand(m))}</span>`
  : `<span class="pct forming">${esc(plainBand(m))}</span>`;
const readyUp = el => el && requestAnimationFrame(() => requestAnimationFrame(() => el.classList.add('ready')));

/* ---------- farm view ---------- */
const statusCls = s => s === 'confirmed points' ? 'confirmed' : s === 'speculative airdrop' ? 'speculative' : 'none';
const statusLabel = s => s === 'confirmed points' ? 'Confirmed points' : s === 'speculative airdrop' ? 'Speculative airdrop' : 'None known';
// Cheapest points first; ties (for example several free ones) go to whichever earns more points per dollar.
const byCheapest = (a, b) => a.points.costPer1k - b.points.costPer1k || (b.points.pointsPerDollar || 0) - (a.points.pointsPerDollar || 0);
const tradable = m => m.chainId === RH && !m.distorted && (!state.agent || state.agent.allowlist.some(a => a.id === m.id));

const upPct = x => (x == null || !isFinite(x)) ? 'n/a' : `${x >= 0 ? '+' : ''}${(x * 100).toFixed(x !== 0 && Math.abs(x) < 0.1 ? 1 : 0)}%`;
const rangeLine = m => m.range ? `${upPct(m.range.toHigh)} to its 90-day high · ${upPct(m.range.toLow)} to its low` : (m.band.status === 'forming' ? `Band forming, day ${m.band.days} of 14` : 'No band history yet');

// Pre-written X post with this YT's live numbers. Descriptive only, like the rest of BANDIT.
function shareUrl(m) {
  const site = 'https://bandit-bands.vercel.app';
  let text;
  if (m.range && m.range.toHigh > 0.005) text = `YT-${m.name} sits at P${Math.round(m.band.percentile)} of its 90-day range: ${upPct(m.range.toHigh)} if its rate returns to its high, ${upPct(m.range.toLow)} to its low, ${m.daysToMaturity} days left.`;
  else if (m.range) text = `YT-${m.name} sits at its 90-day high (P${Math.round(m.band.percentile)}): ${upPct(m.range.toLow)} back to its low.`;
  else text = `YT-${m.name} on ${m.chainName} is too new for a range: its band is still forming.`;
  text += `\n\nRead by BANDIT, the YT trading agent on Robinhood Chain, built on @openservai SERV Reasoning.`;
  return `https://x.com/intent/post?text=${encodeURIComponent(text)}&url=${encodeURIComponent(site)}`;
}

// mode 'trade' leads with room to run; mode 'points' leads with cost per 1,000 points.
const SHARE_ICON = '<svg viewBox="0 0 24 24" width="15" height="15" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M7 17 17 7M9 7h8v8"/></svg>';
function marketCard(m, rank, mode = 'trade') {
  const p = m.points || {}, gr = entryGrade(m), r = m.range, d = span(m);
  const c = cost(p.costPer1k);
  let v, vCls, k, stats;
  if (mode === 'points') {
    v = p.rate == null ? 'Rate unknown' : c; vCls = p.rate == null ? 'muted' : c === 'Free' ? 'up' : '';
    k = p.rate == null ? 'no published points rate' : 'to earn 1,000 points, if held to the end';
    const decay = p.decayCostRatio == null ? 'n/a' : `${Math.max(0, Math.round(p.decayCostRatio * 100))}%`;
    stats = [[p.ptsPerDay100 != null ? compact(p.ptsPerDay100) : 'n/a', 'points a day per $100'], [decay, 'fades by the end'], [`${m.daysToMaturity}`, 'days left']];
  } else {
    v = r ? (r.toHigh > 0.005 ? upPct(r.toHigh) : 'At its high') : 'Too new'; vCls = r ? (r.toHigh > 0.005 ? 'up' : 'top') : 'muted';
    k = r ? (r.toHigh > 0.005 ? `if it gets back to its ${d}-day high` : `no room left to its ${d}-day high`) : `day ${m.band.days} of the 14 BANDIT needs`;
    stats = [[r ? upPct(r.toLow) : 'n/a', 'at its low'], [`${m.daysToMaturity}`, 'days left'], [m.leverage ? `${Math.round(m.leverage)}x` : 'n/a', 'leverage']];
  }
  const chips = [
    mode === 'points' || m.chainId !== RH ? `<span class="badge chain c${m.chainId}">${esc(chainShort(m))}</span>` : '',
    p.status !== 'none known' ? `<span class="badge ${statusCls(p.status)}">${p.status === 'confirmed points' && p.program ? `${esc(p.program)}${p.multiplier ? ` ${p.multiplier}x` : ''}` : statusLabel(p.status)}</span>` : '',
    m.distorted ? `<span class="badge distorted">${esc(riskyWhy(m).replace('Risky: ', ''))}</span>` : '',
  ].join('');
  return `<article class="card mcard ${m.distorted ? 'distorted' : ''}" data-id="${esc(m.id)}">
    ${rank ? `<span class="rank-no">${rank}</span>` : ''}
    <div class="top"><div class="coin" style="${coinStyle(m.name)}">${esc(initials(m.name))}</div>
      <div class="mc-name"><div class="nm">YT-${esc(m.name)}</div><div class="sub">${esc(chainShort(m))} · ends ${shortDate(m.expiry)}</div></div>
      <span class="gchip g-${gr.k}" title="${esc(gr.label)}">${gr.score >= 0 ? `Grade ${gr.g}` : gr.g}</span></div>
    <div class="big"><span class="v ${vCls}">${esc(v)}</span><span class="k">${esc(k)}</span></div>
    ${gaugeHtml(m)}
    ${formed(m) && m.band.percentile < 97 && m.band.percentile > 3 ? `<p class="where">${esc(whereLine(m))}</p>` : ''}
    <div class="mstats">${stats.map(([sv, sk]) => `<div><b>${esc(sv)}</b><span>${esc(sk)}</span></div>`).join('')}</div>
    ${chips ? `<div class="badges">${chips}</div>` : ''}
    ${p.note && mode === 'trade' && m.chainId === RH ? `<p class="note">${clean(p.note)}</p>` : ''}
    <div class="acts">${tradable(m) ? `<button class="btn primary xs" data-trade="${esc(m.id)}">Trade</button>` : ''}<button class="btn soft xs" data-ask="${esc(m.id)}">Ask BANDIT</button><button class="btn soft xs" data-alert="${esc(m.id)}">Alert me</button>${p.guideUrl ? `<a class="guide" href="${esc(p.guideUrl)}" target="_blank" rel="noopener">Guide</a>` : ''}<a class="btn soft xs icon" href="${shareUrl(m)}" target="_blank" rel="noopener" aria-label="Share on X" title="Share on X">${SHARE_ICON}</a></div>
  </article>`;
}

function signalCard(cls, eyebrow, m, headline, body) {
  return `<article class="card sig ${cls}" data-ask="${esc(m.id)}"><div class="glow"></div>
    <div class="eyebrow-s"><span class="pip"></span>${eyebrow}</div>
    <div class="sig-top"><div class="coin" style="${coinStyle(m.name)}">${esc(initials(m.name))}</div><div class="mc-name"><div class="nm">YT-${esc(m.name)}</div><div class="sub">${esc(chainShort(m))} · ${m.daysToMaturity} days left · ${usd(m.liquidityUsd)} pool</div></div>${(gr => `<span class="gchip g-${gr.k}">${gr.score >= 0 ? `Grade ${gr.g}` : gr.g}</span>`)(entryGrade(m))}</div>
    <div class="sig-big">${headline}</div>
    ${gaugeHtml(m)}
    <p class="why">${body}</p>
    <div class="sig-foot"><span class="cta">Ask BANDIT about it <span class="arr">→</span></span><a class="btn soft xs icon" href="${shareUrl(m)}" target="_blank" rel="noopener" aria-label="Share on X" title="Share on X">${SHARE_ICON}</a></div></article>`;
}

function renderSignals() {
  const ranged = state.data.markets.filter(m => m.range && !m.distorted);
  const room = [...ranged].filter(m => m.range.toHigh > 0.005).sort((a, b) => (b.range.ratio ?? 0) - (a.range.ratio ?? 0) || b.range.toHigh - a.range.toHigh)[0];
  const top = [...ranged].sort((a, b) => b.band.percentile - a.band.percentile || b.liquidityUsd - a.liquidityUsd).find(m => m.chainId === RH) || [...ranged].sort((a, b) => b.band.percentile - a.band.percentile)[0];
  const mover = state.data.markets.filter(m => m.change7d != null && !m.distorted && m !== room && m !== top).sort((a, b) => Math.abs(b.change7d) - Math.abs(a.change7d))[0];
  const cards = [];
  if (room) cards.push(signalCard('lo', 'Most room to run', room, `${upPct(room.range.toHigh)} <small>if it gets back to its high</small>`,
    `<b>${esc(whereLine(room))}.</b> Back at its high it would be worth <b>${upPct(room.range.toHigh)}</b>; at its low, <b>${upPct(room.range.toLow)}</b>. It has ${room.daysToMaturity} days for the move.`));
  if (top) cards.push(signalCard('hi', 'Already at the top', top, top.range.toHigh <= 0.005 ? `At its high <small>${upPct(top.range.toLow)} if it drops to its low</small>` : `${upPct(top.range.toLow)} <small>if it drops to its low</small>`,
    `<b>${esc(whereLine(top))}.</b> People buying now pay the top of its range, and holders are sitting on the gain.`));
  if (mover) cards.push(signalCard('move', 'Biggest move this week', mover, `${pct(mover.impliedApy)} <small>yield rate, from ${pct(mover.impliedApy - mover.change7d)} a week ago</small>`,
    `Its yield rate ${mover.change7d > 0 ? 'rose' : 'fell'} to <b>${pct(mover.impliedApy)}</b> in 7 days${formed(mover) ? `, and it is now <b>${esc(whereLine(mover).toLowerCase())}</b>` : ''}. A YT's price moves with its rate, so fast moves draw traders in.`));
  $('#signals').innerHTML = cards.join('');
  readyUp($('#signals'));
}

function renderFarm() {
  if (!state.data) return;
  const ms = state.data.markets;
  renderSignals();
  const rh = ms.filter(m => m.chainId === RH).sort((a, b) => a.distorted - b.distorted || b.liquidityUsd - a.liquidityUsd);
  $('#rhGrid').innerHTML = rh.length ? rh.map(m => marketCard(m, 0, 'trade')).join('') : '<div class="card board-msg">No live Pendle markets on Robinhood Chain right now.</div>';
  const priced = ms.filter(m => m.chainId !== RH && m.points && m.points.rate != null && (state.farmChain === 'all' || String(m.chainId) === state.farmChain));
  const ranked = priced.filter(m => !m.distorted).sort(byCheapest);
  const rest = priced.filter(m => m.distorted);
  $('#farmGrid').innerHTML = (ranked.map((m, i) => marketCard(m, i < 3 ? i + 1 : 0, 'points')).join('') + rest.map(m => marketCard(m, 0, 'points')).join('')) || '<div class="card board-msg">No priced points on this chain right now.</div>';
  $('#unitNote').textContent = state.data.pointsUnit ? `Points shown in ${state.data.pointsUnit}` : '';
  [$('#rhGrid'), $('#farmGrid')].forEach(readyUp);
  const formedMs = ms.filter(m => formed(m) && !m.distorted);
  const set = (k, v) => { const el = $(`#heroStats [data-k="${k}"]`); if (el) el.textContent = v; };
  set('floor', formedMs.filter(m => m.band.percentile <= 20).length);
  set('top', formedMs.filter(m => m.band.percentile >= 80).length);
  set('rh', rh.length);
  const best = ms.filter(m => m.range && !m.distorted && m.range.toHigh > 0.005).sort((a, b) => (b.range.ratio ?? 0) - (a.range.ratio ?? 0))[0];
  if (best) { $('#floatCheapest').textContent = `YT-${best.name} · ${upPct(best.range.toHigh)} to high`; $('#floatCheapestSub').textContent = `Grade ${entryGrade(best).g} · most room to run`; }
}

/* ---------- markets board: every YT, graded for entry ---------- */
// BANDIT's entry grade comes from the numbers alone: price vs its own last 90 days (45%), room to run against
// the downside (25%), time left (15%) and pool size (15%), plus a small bonus for a published points program.
const clamp01 = x => Math.max(0, Math.min(1, x));
const riskyWhy = m => m.flags.includes('thin liquidity') ? 'Risky: very small pool' : m.flags.includes('near expiry') ? 'Risky: ends within days' : 'Risky: extreme rate';
function entryGrade(m) {
  if (m.distorted) return { g: 'Risky', k: 'risky', label: riskyWhy(m), score: -2 };
  if (!formed(m) || !m.range) return { g: 'New', k: 'new', label: `Too new: day ${m.band.days} of 14`, score: -1 };
  const p = m.band.percentile, up = Math.max(0, m.range.toHigh), down = Math.max(0.001, -m.range.toLow);
  const score = Math.round(100 * clamp01(
    0.45 * (1 - p / 100)
    + 0.25 * clamp01(up / down / 4)
    + 0.15 * clamp01((m.daysToMaturity - 7) / 53)
    + 0.15 * clamp01((Math.log10(Math.max(1, m.liquidityUsd)) - 4.7) / 2)
    + (m.points && m.points.status === 'confirmed points' ? 0.05 : 0)));
  const g = score >= 75 ? 'A' : score >= 60 ? 'B' : score >= 45 ? 'C' : 'D';
  const label = p >= 97 ? 'At its top' : p >= 80 ? 'Pricey, little room' : p <= 25 ? (up / down >= 2 ? 'Cheap, room to run' : 'Cheap, could slide') : up / down >= 2 ? 'Fair price, room to run' : 'Middle of its range';
  return { g, k: g.toLowerCase(), label: m.daysToMaturity < 21 ? `${label}, short time` : label, score };
}
const gradeBadge = (gr, big = false) => `<span class="grade g-${gr.k}${big ? ' big' : ''}"${gr.score >= 0 ? ` title="Entry score ${gr.score} out of 100"` : ''}>${gr.g}</span>`;
const whereLine = m => !formed(m) ? `Too new to judge: ${m.band.days} days of history`
  : m.band.percentile >= 97 ? `At its ${span(m)}-day high`
  : m.band.percentile <= 3 ? `At its ${span(m)}-day low`
  : m.band.percentile > 50 ? `Pricier than ${Math.round(m.band.percentile)}% of its last ${span(m)} days`
  : `Cheaper than ${100 - Math.round(m.band.percentile)}% of its last ${span(m)} days`;

// The plain reasons behind a grade, each marked good (ok), neutral (mid) or a warning.
function gradeReasons(m) {
  const tone = (good, bad) => good ? 'ok' : bad ? 'warn' : 'mid';
  const out = [];
  if (m.distorted) out.push(['warn', `Flagged: ${m.flags.join(', ')}`, 'numbers this extreme are unreliable, so BANDIT leaves it out of rankings']);
  if (formed(m)) out.push([tone(m.band.percentile <= 35, m.band.percentile >= 75), whereLine(m), 'price today against its own history']);
  else out.push(['mid', `Only ${m.band.days} days of price history`, 'BANDIT grades a YT once it has 14 days']);
  if (m.range) {
    const up = m.range.toHigh, down = m.range.toLow;
    out.push([tone(up > 0.005 && up / Math.max(0.001, -down) >= 2, up <= 0.005), up > 0.005 ? `${upPct(up)} if it gets back to its high` : 'No room left to its high', `${upPct(down)} if it drops to its low`]);
  }
  out.push([tone(m.daysToMaturity >= 30, m.daysToMaturity < 14), `${m.daysToMaturity} days left`, `ends ${shortDate(m.expiry)}; a YT fades to zero by then`]);
  out.push([tone(m.liquidityUsd >= 1e6, m.liquidityUsd < 25e4), `${usd(m.liquidityUsd)} pool`, m.liquidityUsd >= 1e6 ? 'easy to get in and out' : 'small pool, so bigger trades move the price']);
  const pts = m.points || {};
  out.push([pts.status === 'confirmed points' ? 'ok' : 'mid',
    pts.status === 'confirmed points' ? `${pts.program || 'Points'}${pts.multiplier ? ` ${pts.multiplier}x` : ''} points` : pts.status === 'speculative airdrop' ? 'Possible airdrop, no published rate' : 'No points program',
    pts.status === 'confirmed points' ? 'a bonus on top of any price move' : 'judged on price alone']);
  if (m.change7d != null) {
    const c = m.change7d;
    out.push([c > 0.0005 ? 'ok' : c < -0.0005 ? 'warn' : 'mid', c > 0.0005 ? 'Price up this week' : c < -0.0005 ? 'Price down this week' : 'Flat this week', `yield rate ${c >= 0 ? '+' : ''}${(c * 100).toFixed(2)}% in 7 days`]);
  }
  return out;
}

const GRADE_FILTERS = [['all', 'Everything'], ['best', 'Best entries'], ['floor', 'Near their floor'], ['top', 'At their top'], ['new', 'Too new']];
const gradeFilterFn = k => m => {
  const gr = entryGrade(m);
  return k === 'best' ? gr.g === 'A' || gr.g === 'B'
    : k === 'floor' ? formed(m) && !m.distorted && m.band.percentile <= 20
    : k === 'top' ? formed(m) && m.band.percentile >= 80
    : k === 'new' ? gr.k === 'new'
    : true;
};
const inChain = m => state.chain === 'all' || String(m.chainId) === state.chain;

function renderChains() {
  const counts = {};
  state.data.markets.forEach(m => { counts[m.chainId] = (counts[m.chainId] || 0) + 1; });
  $('#chainChips').innerHTML = `<button class="chip${state.chain === 'all' ? ' on' : ''}" data-chain="all">All chains<span class="n">${state.data.markets.length}</span></button>`
    + state.data.chains.map(c => `<button class="chip${state.chain === String(c.id) ? ' on' : ''}" data-chain="${c.id}">${esc(c.name)}<span class="n">${counts[c.id] || 0}</span></button>`).join('');
  const ms = state.data.markets.filter(inChain);
  $('#gradeChips').innerHTML = GRADE_FILTERS.map(([k, t]) => `<button class="chip${state.gradeFilter === k ? ' on' : ''}" data-gfilter="${k}">${t}<span class="n">${ms.filter(gradeFilterFn(k)).length}</span></button>`).join('');
}
function rowHtml(m) {
  const gr = entryGrade(m), c = m.change7d, p = m.points || {};
  const trend = c == null ? '<span class="tr">no 7-day history</span>' : `<span class="tr ${c > 0.00005 ? 'up' : c < -0.00005 ? 'dn' : ''}">${c > 0.00005 ? '▲' : c < -0.00005 ? '▼' : '·'} ${Math.abs(c * 100).toFixed(2)}% in 7d</span>`;
  const ptag = p.status === 'confirmed points' ? `<span class="ptag">✦ ${esc(p.multiplier ? `${p.multiplier}x points` : 'points')}</span>` : p.status === 'speculative airdrop' ? '<span class="ptag spec">✦ airdrop?</span>' : '';
  const room = m.range ? (m.range.toHigh > 0.005 ? `<b class="up">${upPct(m.range.toHigh)}</b>` : '<b class="flat">At high</b>') : '<b class="flat">n/a</b>';
  const mRoom = m.range ? (m.range.toHigh > 0.005 ? `<b>${upPct(m.range.toHigh)}</b> to its high` : 'no room to its high') : 'no range yet';
  return `<div class="mrow" data-id="${esc(m.id)}">
    <div class="row" role="button" tabindex="0" aria-expanded="false" data-expand="${esc(m.id)}">
      <div class="asset"><div class="coin" style="${coinStyle(m.name)}">${esc(initials(m.name))}</div><div style="min-width:0"><div class="nm">YT-${esc(m.name)}</div><div class="meta">${esc(chainShort(m))}<span class="m-only"> · ${m.daysToMaturity} days left</span>${ptag}</div></div></div>
      <div class="c-grade">${gradeBadge(gr)}<span class="glabel">${esc(gr.label)}</span></div>
      <div class="c-gauge">${bandHtml(m, { labels: false })}<span class="gline">${esc(whereLine(m))}</span></div>
      <div class="cell hide-m">${room}<span class="lbl">${m.range ? `${upPct(m.range.toLow)} at its low` : 'no range yet'}</span></div>
      <div class="cell hide-m hide-l">${m.daysToMaturity} days<span class="lbl">ends ${shortDate(m.expiry)}</span></div>
      <div class="cell hide-m hide-l">${usd(m.liquidityUsd)}<span class="lbl">pool size</span></div>
      <div class="cell apy hide-m">${pct(m.impliedApy)}${trend}</div>
      <div class="m-stats"><b class="ml g-${gr.k}">${esc(gr.label)}</b> · ${mRoom} · ${usd(m.liquidityUsd)} pool</div>
      <span class="chev" aria-hidden="true">›</span>
    </div>
    <div class="row-more"></div>
  </div>`;
}
function rowMoreHtml(m) {
  const gr = entryGrade(m);
  const head = gr.score >= 0 ? `Entry grade ${gr.g}: ${gr.label.toLowerCase()}` : gr.label;
  const sub = gr.score >= 0 ? `Score ${gr.score} out of 100, from the numbers below. Data, not advice.` : m.distorted ? 'Left out of rankings until its numbers look normal.' : 'BANDIT grades a YT once it has 14 days of price history.';
  return `<div class="why-head">${gradeBadge(gr, true)}<div><b>${esc(head)}</b><span>${esc(sub)}</span></div></div>
    <div class="why-grid">${gradeReasons(m).map(([t, b, s]) => `<div class="why ${t}"><i>${t === 'ok' ? ic('check', 12) : t === 'warn' ? '!' : '•'}</i><div><b>${esc(b)}</b><span>${esc(s)}</span></div></div>`).join('')}</div>
    <div class="more-acts">
      <button class="btn primary sm" data-ask="${esc(m.id)}">Ask BANDIT about it</button>
      ${m.distorted ? '' : state.watching.has(m.id) ? '<a class="btn sm watching" href="#/my">✓ Your agent is watching</a>' : `<button class="btn soft sm" data-watch="${esc(m.id)}">Watch it with my agent</button>`}
      <button class="btn soft sm" data-alert="${esc(m.id)}">Alert me</button>
      ${tradable(m) ? `<button class="btn soft sm" data-trade="${esc(m.id)}">Trade it</button>` : ''}
      <a class="btn soft sm" href="${shareUrl(m)}" target="_blank" rel="noopener">Share</a>
    </div>`;
}
function toggleRow(id, force) {
  const wrap = $$('#boardRows .mrow').find(x => x.dataset.id === id); if (!wrap) return;
  const open = force ?? !wrap.classList.contains('open');
  wrap.classList.toggle('open', open);
  $('.row', wrap).setAttribute('aria-expanded', String(open));
  const m = state.byId.get(id);
  $('.row-more', wrap).innerHTML = open && m ? rowMoreHtml(m) : '';
  if (open) state.openRows.add(id); else state.openRows.delete(id);
}
function renderBoard() {
  const { key, dir } = state.sort;
  const val = m => ({ name: m.name.toLowerCase(), grade: entryGrade(m).score, up: m.range ? m.range.toHigh : -Infinity, days: m.daysToMaturity, liq: m.liquidityUsd, apy: m.impliedApy })[key];
  const ms = state.data.markets.filter(m => inChain(m) && gradeFilterFn(state.gradeFilter)(m)).sort((a, b) => {
    const va = val(a), vb = val(b);
    return ((va > vb) - (va < vb)) * dir || b.liquidityUsd - a.liquidityUsd;
  });
  $$('#boardHead [data-sort]').forEach(b => b.classList.toggle('sorted', b.dataset.sort === key));
  const rows = $('#boardRows');
  rows.classList.remove('ready');
  rows.innerHTML = ms.length ? ms.map(rowHtml).join('') : '<div class="board-msg">Nothing matches right now. Try another filter.</div>';
  for (const id of state.openRows) toggleRow(id, true);
  readyUp(rows);
}

/* ---------- data load ---------- */
async function loadMarkets() {
  try {
    const d = await api('/api/markets');
    state.data = d;
    state.byId = new Map(d.markets.map(m => [m.id, m]));
    $('#liveText').textContent = `LIVE · PENDLE · ${d.chains.length} CHAINS · ${d.markets.length} MARKETS`;
    $('#srcLine').textContent = `Pendle hosted API. Robinhood Chain markets above ${usd(d.chains[0].minLiquidityUsd)}, other chains above ${usd(d.minLiquidityUsd)}. Updated ${new Date(d.updatedAt).toISOString().slice(11, 16)} UTC.`;
    renderFarm(); renderChains(); renderBoard(); fillMarketSelects(); renderSuggestions();
    if (state.route === 'my' && state.me && !state.live.playing && !($('#myRuleForm') && $('#myRuleForm').contains(document.activeElement))) { state.meSig = ''; renderMy(); }
  } catch (e) {
    if (state.data) return;
    $('#liveText').textContent = 'PENDLE DATA UNAVAILABLE';
    ['#rhGrid', '#farmGrid'].forEach(s => { $(s).innerHTML = `<div class="card board-msg"><b>Could not load live Pendle data.</b><br>${esc(e.message)}</div>`; });
    $('#boardRows').innerHTML = `<div class="board-msg">${esc(e.message)}</div>`;
  }
}
function skeletons() {
  const card = '<div class="card mcard"><div class="top"><span class="sk" style="width:40px;height:40px;border-radius:12px"></span><div style="flex:1"><span class="sk" style="width:60%"></span><span class="sk" style="width:40%;margin-top:8px;height:8px"></span></div></div><span class="sk" style="width:50%;height:26px"></span><span class="sk" style="height:34px"></span><span class="sk" style="height:5px"></span></div>';
  $('#rhGrid').innerHTML = card.repeat(3);
  $('#farmGrid').innerHTML = card.repeat(6);
  $('#boardRows').innerHTML = '<div class="board-msg"><span class="sk" style="width:60%;margin:0 auto"></span></div>';
}

/* ---------- agent view ---------- */
let agentTimer = null;
async function loadAgent() {
  clearTimeout(agentTimer);
  if (document.hidden) { agentTimer = setTimeout(loadAgent, 60_000); return; }
  try {
    const a = await api('/api/agent');
    state.agent = a;
    const sig = JSON.stringify([a.rules, a.lastRun && a.lastRun.at, a.events[0] && a.events[0].id, a.agent, a.ready, a.telegram]);
    const editing = $('#ruleForm') && $('#ruleForm').contains(document.activeElement);
    if (state.route === 'agent' && !state.live.playing && !editing && sig !== state.agentSig) { state.agentSig = sig; renderAgent(); }
    if (state.route === 'receipts') renderReceipts();
    if (state.route === 'stream' && state.streamKind === 'house') streamTick(a.lastRun);
    updateAgentChrome();
  } catch (e) {
    if (state.route === 'agent' && !state.agent) $('#agentRoot').innerHTML = `<div class="card board-msg">Could not load the agent: ${esc(e.message)}</div>`;
  }
  if (['agent', 'receipts', 'stream'].includes(state.route)) agentTimer = setTimeout(loadAgent, state.route === 'stream' ? 30_000 : 60_000);
}
function agentMode(a) {
  if (!a.ready.store || !a.ready.serv || !a.ready.wallet) return { cls: 'setup', text: 'Setting up' };
  if (a.agent.paused) return { cls: 'paused', text: 'Paused by kill switch' };
  if (a.agent.live) return { cls: 'live', text: 'Live on Robinhood Chain' };
  return { cls: 'dry', text: 'Dry run: simulating, not sending' };
}
function updateAgentChrome() {
  const a = state.agent; if (!a) return;
  const mode = agentMode(a);
  $('#tabAgentDot').classList.toggle('live', mode.cls === 'live' || mode.cls === 'dry');
  const armed = a.rules.filter(r => r.kind !== 'alert' && r.status === 'active').length;
  $('#floatAgent').textContent = mode.cls === 'setup' ? 'agent setting up' : `${armed} rule${armed === 1 ? '' : 's'} armed`;
  $('#floatAgentSub').textContent = a.lastRun ? `last check ${ago(a.lastRun.at)}` : 'checks on a schedule';
}

/* ---------- Agent World host: the live animated view of an agent's runs ---------- */
const STAGE_LABEL = { scan: 'scan', rule: 'rule', quote: 'quote', serv: 'serv', decision: 'verdict', exec: 'chain', telegram: 'telegram', done: 'done' };
function consoleLine(s) {
  const bad = s.ok === false;
  const cls = s.stage === 'decision' ? (bad ? 'bad' : 'decision') : (s.stage === 'exec' && bad) ? 'bad' : s.stage;
  const reason = s.reason ? `<div class="reason">${clean(s.reason)}</div>` : '';
  const link = s.url ? ` <a href="${esc(s.url)}" target="_blank" rel="noopener">View tx</a>` : '';
  return `<div class="ln"><span class="st ${cls}">${STAGE_LABEL[s.stage] || esc(s.stage)}</span><div class="lt">${clean(s.text)}${link}${reason}</div></div>`;
}
const ICON = {
  full: '<svg viewBox="0 0 24 24" width="15" height="15" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M4 9V4h5M20 9V4h-5M4 15v5h5M20 15v5h-5"/></svg>',
  rec: '<svg viewBox="0 0 24 24" width="15" height="15"><circle cx="12" cy="12" r="6" fill="currentColor"/></svg>',
  play: '<svg viewBox="0 0 24 24" width="15" height="15" fill="currentColor"><path d="M8 5.5v13l11-6.5z"/></svg>',
};
let world = null, worldKind = null;
const worldSeen = { me: null, house: null };
let wlKey = null, wlCache = [];
// The markets the world shows on its board and ticker, best entry grades first (cached per data refresh).
function worldList() {
  if (!state.data) return [];
  if (wlKey === state.data.updatedAt) return wlCache;
  wlKey = state.data.updatedAt;
  wlCache = state.data.markets.filter(m => !m.distorted).map(m => ({ m, gr: entryGrade(m) })).sort((a, b) => b.gr.score - a.gr.score)
    .map(({ m, gr }) => ({ name: `YT-${m.name}`, p: formed(m) ? m.band.percentile : null, g: gr.g, room: m.range ? (m.range.toHigh > 0.005 ? upPct(m.range.toHigh) : 'at its high') : 'too new' }));
  return wlCache;
}
// Scheduled checks: the house agent at :00, :10, :20 and so on; personal agents at :05, :15, :25.
function nextCheck(offset) {
  const d = new Date(), m = d.getUTCMinutes();
  d.setUTCMinutes(m + ((((offset - m) % 10) + 10) % 10 || 10), 0, 0);
  return d.getTime();
}
const shortRule = r => r.kind === 'farm' ? 'Farm mode: cheapest points'
  : r.trigger ? `${r.action === 'exit' ? 'Sell' : `Buy $${r.sizeUsd}`} YT-${String(r.marketName || '').replace(/^YT-/, '').split(' (')[0]} when ${r.trigger.dir === 'below' ? 'cheap' : 'pricey'}`
  : undash(r.description || '');
const runOutcome = run => (run.actions || []).length ? `${run.actions.length} action${run.actions.length === 1 ? '' : 's'}` : 'nothing to do';
const worldRun = () => worldKind === 'me' ? state.meStatus && state.meStatus.lastRun : state.agent && state.agent.lastRun;
const worldHtml = () => `<div class="world-wrap" id="worldWrap"><canvas id="world" role="img" aria-label="Live animated view of the agent at work"></canvas><div class="rec-badge"><i></i>REC <span id="recT">0:00</span></div><button class="world-exit" id="wExit" aria-label="Exit stream view">×</button></div>`;
const worldButtons = () => `<button class="btn soft sm" id="wReplay">${ICON.play} Replay last run</button><button class="btn soft sm" id="wFull">${ICON.full} Stream view</button><button class="btn soft sm" id="wClip">${ICON.rec} Clip it</button>`;

function updateWorldHud() {
  if (!world) return;
  if (worldKind === 'me' && state.me) {
    const st = state.meStatus, active = st ? st.rules.filter(r => r.status === 'active') : [];
    world.setHud({
      label: `Your agent · ${shortAddr(state.me.address)}`, sub: 'Practice money · SERV Reasoning checks every move',
      nextAt: active.length ? nextCheck(5) : null, rules: active.map(shortRule),
      last: st && st.lastRun ? `${ago(st.lastRun.at)}: ${runOutcome(st.lastRun)}.` : null,
    });
  } else if (state.agent) {
    const a = state.agent;
    world.setHud({
      label: 'BANDIT house agent', sub: `${agentMode(a).text} · Robinhood Chain`, nextAt: nextCheck(0),
      rules: a.rules.filter(r => r.kind !== 'alert' && r.status === 'active').map(shortRule),
      last: a.lastRun ? `${ago(a.lastRun.at)}: ${runOutcome(a.lastRun)}.` : null,
    });
  }
}
async function mountWorld(kind) {
  const cv = $('#world'); if (!cv) return;
  if (world) { world.destroy(); world = null; state.live.playing = false; }
  const { createWorld } = await import('/world.js');
  if ($('#world') !== cv) return; // the page re-rendered while the module loaded
  world = createWorld(cv, { markets: worldList });
  worldKind = kind;
  updateWorldHud();
  const run = worldRun();
  if (!run || !run.steps || !run.steps.length) return;
  // Each new run plays once as it arrives; after that the world rests and counts down to the next check.
  if (run.at !== worldSeen[kind]) { worldSeen[kind] = run.at; playRun(run); }
  else showRunStatic(run);
}
function unmountWorld() { if (world) { world.destroy(); world = null; } state.live.playing = false; }
function showRunStatic(run) {
  const con = $('#console');
  if (con) con.innerHTML = (run.steps || []).map(consoleLine).join('') || '<div class="empty">No steps recorded.</div>';
  updateWorldHud();
}
async function playRun(run) {
  const con = $('#console');
  if (con) con.innerHTML = '';
  state.live.playing = true;
  try {
    if (world) await world.play(run, { onStep: s => { const c = $('#console'); if (c) { c.insertAdjacentHTML('beforeend', consoleLine(s)); c.scrollTop = c.scrollHeight; } } });
    else if (con) con.innerHTML = (run.steps || []).map(consoleLine).join('');
  } finally {
    state.live.playing = false;
    updateWorldHud();
  }
}
const wakingLine = '<div class="ln"><span class="st scan">scan</span><div class="lt">Waking up and scanning Pendle markets<span class="thinking-dots"><i></i><i></i><i></i></span></div></div>';
async function runNow() {
  const btns = ['#runNow', '#runNow2'].map(s => $(s)).filter(Boolean);
  btns.forEach(b => { b.disabled = true; });
  if (world) world.wake();
  if ($('#console')) $('#console').innerHTML = wakingLine;
  try {
    const run = await api('/api/agent', { method: 'POST', owner: true, body: { action: 'run' } });
    if (run.skipped || run.error) { toast(run.skipped || run.error, 'err'); if (world) world.stop(); return; }
    worldSeen.house = run.at;
    await playRun(run);
    state.agentSig = '';
    await loadAgent();
  } catch (e) {
    toast(e.message, 'err'); if (world) world.stop();
  } finally {
    btns.forEach(b => { b.disabled = false; });
  }
}
function streamWorld() {
  const wrap = $('#worldWrap'); if (!wrap) return;
  if (document.fullscreenElement) { document.exitFullscreen(); return; }
  if (wrap.requestFullscreen) wrap.requestFullscreen().catch(() => wrap.classList.add('pseudo-full'));
  else if (wrap.webkitRequestFullscreen) wrap.webkitRequestFullscreen();
  else wrap.classList.add('pseudo-full');
}
async function openClip() {
  const run = worldRun();
  if (!world || !run || !run.steps || !run.steps.length) { toast('Your agent has not run yet. Wake it once, then clip it.', 'err'); return; }
  const { recordingSupported } = await import('/world.js');
  $('#clipBody').innerHTML = recordingSupported()
    ? `<p class="sub">BANDIT replays your agent's latest run with a title and an end card, and records it. Takes about 20 to 40 seconds.</p>
      <div class="clip-pick"><button class="clip-opt" data-clipfmt="wide"><span class="shape wide"></span><b>Wide 16:9</b><span>X, YouTube, streams</span></button><button class="clip-opt" data-clipfmt="tall"><span class="shape tall"></span><b>Vertical 9:16</b><span>TikTok, Reels, Shorts</span></button></div>`
    : '<div class="callout" style="margin:0"><span class="ic">!</span><div><b>This browser cannot record the animation.</b> Chrome or Safari on a computer can.</div></div>';
  $('#clipActs').innerHTML = '<button class="btn soft sm" data-close>Cancel</button>';
  openLayer('#clipModal');
}
async function recordClip(format) {
  const run = worldRun();
  if (!world || !run) return;
  closeAll();
  const wrap = $('#worldWrap');
  wrap.classList.add('recording');
  wrap.scrollIntoView({ behavior: 'smooth', block: 'center' });
  const t0 = Date.now();
  const tick = setInterval(() => { const s = Math.round((Date.now() - t0) / 1000); if ($('#recT')) $('#recT').textContent = `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`; }, 500);
  try {
    const blob = await world.record({ run, format, title: worldKind === 'me' ? 'My YT agent at work' : 'BANDIT, the YT agent at work' });
    if (state.clip && state.clip.url) URL.revokeObjectURL(state.clip.url);
    const ext = blob.type.includes('mp4') ? 'mp4' : 'webm';
    state.clip = { blob, url: URL.createObjectURL(blob), ext };
    const file = new File([blob], `bandit-agent.${ext}`, { type: blob.type });
    const canShare = Boolean(navigator.canShare && navigator.canShare({ files: [file] }));
    $('#clipBody').innerHTML = `<video class="clip-vid ${format}" src="${state.clip.url}" controls autoplay muted loop playsinline></video>
      <p class="help" style="margin-top:10px">${ext === 'mp4' ? 'Ready to post. Attach the video to your post on X, TikTok or Instagram.' : 'Saved as WebM. X needs MP4: Chrome 126 or later and Safari record MP4 directly.'}</p>`;
    $('#clipActs').innerHTML = `${canShare ? '<button class="btn primary sm" data-clipshare>Share</button>' : ''}<button class="btn ${canShare ? 'soft' : 'primary'} sm" data-clipsave>Download .${ext}</button><a class="btn soft sm" href="${xIntent('My YT agent at work on Robinhood Chain. Every move checked by @openservai SERV Reasoning.', location.origin)}" target="_blank" rel="noopener">Post on X</a><button class="btn soft sm" data-close>Close</button>`;
    openLayer('#clipModal');
  } catch (e) {
    toast(`Could not record: ${e.message}`, 'err');
  } finally {
    clearInterval(tick);
    wrap.classList.remove('recording');
  }
}
function saveClip() {
  const c = state.clip; if (!c) return;
  const a = document.createElement('a'); a.href = c.url; a.download = `bandit-agent.${c.ext}`;
  document.body.appendChild(a); a.click(); a.remove();
  toast('Clip saved. Post it anywhere.', 'ok');
}
async function shareClip() {
  const c = state.clip; if (!c) return;
  try { await navigator.share({ files: [new File([c.blob], `bandit-agent.${c.ext}`, { type: c.blob.type })], text: 'My YT agent at work, checked by SERV Reasoning.' }); } catch {}
}

function renderAgent() {
  const root = $('#agentRoot');
  const a = state.agent;
  if (!a) { root.innerHTML = '<div class="card board-msg"><span class="sk" style="width:50%;margin:0 auto"></span></div>'; return; }
  const mode = agentMode(a);
  const owner = Boolean(state.owner);
  const ownerRules = a.rules.filter(r => r.kind !== 'alert');
  const alertCount = a.rules.filter(r => r.kind === 'alert' && r.status === 'active').length;
  const bal = a.agent.balanceEth == null ? 'n/a' : `${a.agent.balanceEth.toFixed(4)} ETH`;
  const checks = [
    ['SERV Reasoning', a.ready.serv, 'SERV_API_KEY'],
    ['Agent storage', a.ready.store, 'Upstash Redis connected to the Vercel project'],
    ['Agent wallet', a.ready.wallet, 'AGENT_PRIVATE_KEY, funded with ETH on Robinhood Chain'],
    ['Telegram bot', a.ready.telegram, 'TELEGRAM_BOT_TOKEN'],
    ['Owner key', a.ready.owner, 'OWNER_KEY'],
    ['Live trading', a.agent.live, 'AGENT_LIVE=true when you are ready'],
  ];
  const setupDone = checks.slice(0, 5).every(c => c[1]);
  root.innerHTML = `
  <div class="card agent-hero">
    <div class="mascot sleep" id="mascot"><img src="/art/mascot.svg" alt="BANDIT the raccoon"><div class="zzz"><span>z</span><span>z</span><span>Z</span></div></div>
    <div>
      <h2>${owner ? 'Your house agent' : "BANDIT's house agent"}</h2>
      <div class="state"><span class="state-pill ${mode.cls}"><i></i>${mode.text}</span>${owner ? '<span class="badge confirmed">Owner mode</span>' : '<span class="badge none plain">Trades a real wallet on Robinhood Chain</span>'}</div>
      <div class="agent-stats">
        <div class="stat"><div class="v">${bal}</div><div class="k">Wallet${a.agent.balanceUsd != null ? ` · ${usd(a.agent.balanceUsd)}` : ''}</div></div>
        <div class="stat"><div class="v">$${(a.agent.spentTodayUsd || 0).toFixed(0)}<span class="faint" style="font-size:14px"> / $${a.caps.maxDailyUsd}</span></div><div class="k">Spent today</div></div>
        <div class="stat"><div class="v">${ownerRules.filter(r => r.status === 'active').length}</div><div class="k">Rules armed</div></div>
        <div class="stat"><div class="v" style="font-size:15px">${a.lastRun ? ago(a.lastRun.at) : 'never'}</div><div class="k">Last check</div></div>
      </div>
    </div>
    <div class="hero-acts" style="display:flex;flex-direction:column;gap:8px">
      ${owner ? '<button class="btn primary" id="runNow">Run now <span class="arr">→</span></button>' : '<button class="btn ghost" id="ownerOpen">Owner mode</button>'}
      ${a.telegram.followUrl ? `<a class="btn tg sm" href="${esc(a.telegram.followUrl)}" target="_blank" rel="noopener">Follow on Telegram</a>` : ''}
      <a class="btn soft sm" href="#/receipts">See activity</a>
    </div>
  </div>
  <div class="card live-card world-card">
    <div class="wc-head"><div><h3>Agent World <span class="serv-badge"><span class="sd">S</span>Every decision by <b>SERV Reasoning</b></span></h3>
      <p class="sub">Watch the agent work: it scans the markets, checks the rules, asks SERV Reasoning, acts on Robinhood Chain and tells Telegram. Every move comes from a real run. Go fullscreen to stream it, or clip it for social.</p></div></div>
    ${worldHtml()}
    <div class="live-actions">
      ${owner ? '<button class="btn primary sm" id="runNow2">Run now</button>' : ''}
      ${worldButtons()}
      <span class="when">${a.lastRun ? `Last run ${ago(a.lastRun.at)} · ${esc(a.lastRun.source)} · ${a.lastRun.live ? 'live' : 'dry run'}` : 'No runs yet'}</span>
    </div>
    <details class="runlog"><summary>Run log</summary><div class="console" id="console"><div class="empty">No runs yet. ${owner ? 'Press Run now to wake the agent.' : 'The agent wakes on its schedule.'}</div></div></details>
  </div>
  <div class="agent-grid">
    <div>
      <div class="card panel">
        <h3>Rules <span class="faint" style="font-size:12px;font-weight:500">${alertCount} Telegram alert${alertCount === 1 ? '' : 's'} watching</span></h3>
        <p class="sub">The agent checks these on every run. Nothing trades unless SERV Reasoning confirms and the hard limits allow it.</p>
        <div class="rules">${ownerRules.length ? ownerRules.map(ruleHtml).join('') : `<div class="empty" style="padding:14px"><img src="/art/empty-state.svg" alt="" style="width:130px"><b>No rules yet</b>${owner ? 'Arm your first rule below.' : 'Only the owner can arm trading rules. Anyone can set a Telegram alert from a market card.'}</div>`}</div>
        ${owner ? ruleBuilderHtml() : ''}
      </div>
    </div>
    <div>
      ${setupDone ? '' : `<div class="card panel" style="margin-bottom:14px"><h3>Setup</h3><p class="sub">Add these in Vercel, then redeploy. BANDIT stays in dry run until you set AGENT_LIVE=true.</p><div class="checklist">${checks.map(([t, ok, how]) => `<div class="check ${ok ? 'ok' : ''}"><span class="tick">${ok ? '✓' : ''}</span><div>${t}<small>${esc(how)}</small></div></div>`).join('')}</div></div>`}
      <div class="card panel">
        <h3>Fund your agent</h3>
        <p class="sub">Send a little ETH on Robinhood Chain to this address, or top it up straight from Base, Arbitrum, Optimism or Ethereum. The agent buys YT straight from ETH, so it needs nothing else.</p>
        ${a.agent.address ? `<div class="fund"><div class="qr" id="qr"></div><div><div class="addr">${esc(a.agent.address)}</div><div style="display:flex;gap:6px;flex-wrap:wrap"><button class="btn primary xs" data-topup="agent">Top up the agent</button><button class="btn soft xs" id="copyAddr">Copy</button><a class="btn soft xs" href="${esc(a.agent.addressUrl)}" target="_blank" rel="noopener">Explorer</a><button class="btn soft xs" id="addChain">Add Robinhood Chain</button></div></div></div>` : '<p class="help">No agent wallet yet. Set AGENT_PRIVATE_KEY in Vercel to a brand new wallet used only for BANDIT.</p>'}
      </div>
      <div class="card panel" style="margin-top:14px">
        <h3>Hard limits</h3>
        <p class="sub">Written into the code, so no setting or request can raise them.</p>
        <div class="checklist">
          <div class="check ok"><span class="tick">$</span><div>At most $${a.caps.maxTradeUsd} per trade and $${a.caps.maxDailyUsd} per day</div></div>
          <div class="check ok"><span class="tick">%</span><div>Blocks price impact over ${a.caps.maxPriceImpact * 100}%; slippage capped at ${a.caps.maxSlippage * 100}%</div></div>
          <div class="check ok"><span class="tick">✓</span><div>Allowlist: ${a.allowlist.map(x => `${esc(x.name)}${x.distorted ? ' (distorted, refused)' : ''}`).join(', ')}</div></div>
          <div class="check ok"><span class="tick">◌</span><div>Simulates every transaction before sending. AGENT_PAUSED=true stops everything.</div></div>
        </div>
      </div>
    </div>
  </div>`;
  mountWorld('house');
  if (a.agent.address) drawQr(a.agent.address);
  bindRuleBuilder();
}

function ruleHtml(r) {
  const owner = Boolean(state.owner);
  const ico = r.kind === 'farm' ? `<span class="ico farm">${ic('spark')}</span>` : `<span class="ico">${ic('flag')}</span>`;
  return `<div class="rule">${ico}<div><div class="d">${clean(r.description)}</div><div class="r">${r.lastResult ? clean(r.lastResult) : 'Not checked yet.'}${r.lastCheckedAt ? ` · checked ${ago(r.lastCheckedAt)}` : ''}</div></div>
    <div class="rule-acts"><span class="st ${esc(r.status)}">${esc(r.status)}</span>${owner && r.status !== 'done' ? `<button class="btn soft xs" data-toggle="${esc(r.id)}">${r.status === 'active' ? 'Pause' : 'Resume'}</button>` : ''}${owner ? `<button class="btn soft xs" data-del="${esc(r.id)}">Delete</button>` : ''}</div></div>`;
}
function ruleBuilderHtml() {
  const allow = state.agent.allowlist;
  const cap = state.agent.caps.maxTradeUsd;
  return `<div class="card" style="margin-top:14px;padding:16px;background:var(--bg-2)">
    <div class="form" id="ruleForm">
      <div class="seg" id="ruleKind"><button type="button" data-v="band" class="on">Band rule</button><button type="button" data-v="farm">Farm mode</button></div>
      <div id="bandFields" class="form">
        <label class="fld"><span class="fl">Market</span><select class="inp" id="rMarket">${allow.map(x => `<option value="${esc(x.id)}" ${x.distorted ? 'disabled' : ''}>${esc(x.name)}${x.distorted ? ` (distorted: ${esc(x.flags.join(', '))})` : ''}</option>`).join('')}</select></label>
        <div class="row2">
          <div class="fld"><span class="fl">Trigger when band is</span><div class="seg" id="rDir"><button type="button" data-v="below" class="on lo">Below</button><button type="button" data-v="above" class="hi">Above</button></div></div>
          <label class="fld"><span class="fl">Percentile <em id="rPctV">P50</em></span><input type="range" id="rPct" min="1" max="99" value="50"></label>
        </div>
        <div class="row2">
          <div class="fld"><span class="fl">Action</span><div class="seg" id="rAction"><button type="button" data-v="enter" class="on">Enter YT</button><button type="button" data-v="exit">Exit YT</button></div></div>
          <label class="fld"><span class="fl">Size <em>max $${cap}</em></span><span class="money"><input class="inp" id="rSize" inputmode="decimal" value="10"></span></label>
        </div>
      </div>
      <div id="farmFields" class="form hidden">
        <div class="row2">
          <label class="fld"><span class="fl">Budget <em>max $${cap}</em></span><span class="money"><input class="inp" id="fBudget" inputmode="decimal" value="10"></span></label>
          <label class="fld"><span class="fl">Max cost per 1,000 pts</span><span class="money"><input class="inp" id="fMax" inputmode="decimal" value="0.01"></span></label>
        </div>
        <p class="help">Farm mode enters the Robinhood Chain market with the lowest cost per 1,000 points under your max, skips anything in the top 20% of its band, and rotates when a market matures within 3 days or another gets 30% cheaper per point. It waits while no Robinhood Chain market publishes a points rate.</p>
      </div>
      <label class="fld"><span class="fl">Max slippage</span><select class="inp" id="rSlip"><option value="0.005">0.5%</option><option value="0.01" selected>1%</option><option value="0.02">2%</option><option value="0.03">3%</option></select></label>
      <div class="err-line hidden" id="ruleErr"></div>
      <div><button class="btn primary sm" type="button" id="ruleCreate">Arm this rule</button></div>
    </div></div>`;
}

function bindSeg(root, onChange) {
  if (!root) return;
  root.addEventListener('click', e => {
    const b = e.target.closest('[data-v]'); if (!b) return;
    $$('[data-v]', root).forEach(x => x.classList.toggle('on', x === b));
    if (onChange) onChange(b.dataset.v);
  });
}
const segVal = root => root && $('[data-v].on', root)?.dataset.v;

function bindRuleBuilder() {
  if (!$('#ruleForm')) return;
  bindSeg($('#ruleKind'), v => { $('#bandFields').classList.toggle('hidden', v !== 'band'); $('#farmFields').classList.toggle('hidden', v !== 'farm'); });
  bindSeg($('#rDir'));
  bindSeg($('#rAction'));
  $('#rPct').addEventListener('input', e => { $('#rPctV').textContent = `P${e.target.value}`; });
  $('#ruleCreate').addEventListener('click', async () => {
    const kind = segVal($('#ruleKind'));
    const body = kind === 'band'
      ? { action: 'create-rule', kind, marketId: $('#rMarket').value, dir: segVal($('#rDir')), pct: Number($('#rPct').value), ruleAction: segVal($('#rAction')), sizeUsd: num($('#rSize').value), maxSlippage: Number($('#rSlip').value) }
      : { action: 'create-rule', kind, budgetUsd: num($('#fBudget').value), maxCostPer1k: num($('#fMax').value), maxSlippage: Number($('#rSlip').value) };
    const btn = $('#ruleCreate');
    btn.disabled = true;
    try {
      await api('/api/agent', { method: 'POST', owner: true, body });
      toast('Rule armed. The agent checks it on every run.', 'ok');
      state.agentSig = '';
      await loadAgent();
    } catch (e) {
      $('#ruleErr').textContent = e.message; $('#ruleErr').classList.remove('hidden');
    } finally {
      if ($('#ruleCreate')) $('#ruleCreate').disabled = false;
    }
  });
}

let qrLoader = null;
function drawQr(text) {
  const el = $('#qr'); if (!el) return;
  const draw = () => { try { const q = window.qrcode(0, 'M'); q.addData(text); q.make(); el.innerHTML = q.createSvgTag({ cellSize: 4, margin: 0, scalable: true }); } catch { el.textContent = ''; } };
  if (window.qrcode) return draw();
  qrLoader = qrLoader || new Promise((res, rej) => { const s = document.createElement('script'); s.src = 'https://cdn.jsdelivr.net/npm/qrcode-generator@1.4.4/qrcode.min.js'; s.onload = res; s.onerror = rej; document.head.appendChild(s); });
  qrLoader.then(draw).catch(() => { el.textContent = ''; });
}

/* ---------- receipts ---------- */
const EVT_ICON = { trade: 'check', simulated: 'scan', held: 'pause', refused: 'ban', failed: 'alert', error: 'alert', alert: 'send', rule: 'flag' };
function eventHtml(e) {
  let title = e.text || e.type, body = '';
  if (e.type === 'trade') { title = `${e.verb} ${e.marketName}`; body = `${e.size || ''}. ${e.pointsLine || ''}`; }
  else if (e.type === 'simulated') { title = `Dry run: would have ${String(e.verb || 'Entered').toLowerCase()} ${e.marketName}`; body = `${e.size || ''}. ${e.pointsLine || ''}`; }
  else if (e.type === 'held') { title = `SERV held off on ${e.marketName}`; body = e.headline || ''; }
  else if (e.type === 'refused') { title = `A hard guard refused ${e.marketName || 'a trade'}`; body = e.text; }
  else if (e.type === 'failed') { title = `Could not execute ${e.marketName || 'a trade'}`; body = e.text; }
  const reason = e.reason ? `<div class="es"><b style="color:var(--text)">Reason:</b> ${clean(e.reason)}</div>` : '';
  const meta = [e.model ? `SERV ${esc(e.model)}` : '', e.priceImpact != null ? `impact ${(e.priceImpact * 100).toFixed(2)}%` : '', e.url ? `<a href="${esc(e.url)}" target="_blank" rel="noopener">tx ${esc(String(e.hash || '').slice(0, 10))}…</a>` : ''].filter(Boolean).join(' · ');
  return `<div class="evt ${esc(e.type)}"><span class="ei">${ic(EVT_ICON[e.type] || 'scan')}</span><div><div class="et">${clean(title)}</div>${body && e.type !== 'rule' ? `<div class="es">${clean(body)}</div>` : ''}${reason}${meta ? `<div class="em">${meta}</div>` : ''}</div><span class="ea">${ago(e.at)}</span></div>`;
}
function ledgerHtml(rows) {
  return `<table class="ledger"><thead><tr><th>Position</th><th>Cost</th><th>Value</th><th>Est. points</th></tr></thead><tbody>${rows.map(p => `<tr><td>${esc(p.name)}<div class="faint" style="font-size:11px;font-weight:500">${esc((p.entry && (p.entry.program || p.entry.status)) || '')} · held ${p.daysHeld}d</div></td><td>${usd(p.costUsd)}</td><td>${p.valueUsd == null ? 'n/a' : usd(p.valueUsd)}</td><td>${p.pointsEst == null ? 'rate unknown' : compact(p.pointsEst)}</td></tr>`).join('')}</tbody></table>`;
}
// A routine check, shown in the timeline so the agent never looks idle when it is simply waiting.
function checkHtml(r) {
  const acted = (r.actions || []).length;
  const title = acted ? `Checked and acted: ${acted} action${acted === 1 ? '' : 's'}` : 'Checked the markets: nothing to do yet';
  const who = r.source === 'cron' ? 'on its own' : r.source === 'owner' || r.source === 'user' ? 'you woke it' : esc(r.source || '');
  const lines = (r.lines || []).slice(0, 2).map(l => `<div class="es">${clean(l)}</div>`).join('');
  return `<div class="evt check${acted ? ' acted' : ''}"><span class="ei">${ic(acted ? 'check' : 'scan')}</span><div><div class="et">${title}</div>${lines}<div class="em">${who}</div></div><span class="ea">${ago(r.at)}</span></div>`;
}
const timelineOf = (events, runs, render) => [...events.map(e => ({ at: e.at, html: render(e) })), ...runs.map(r => ({ at: r.at, html: checkHtml(r) }))]
  .sort((x, y) => Date.parse(y.at) - Date.parse(x.at)).slice(0, 50).map(x => x.html).join('');
const actTabs = tab => `<div class="seg act-tabs" role="tablist"><button data-acttab="me" class="${tab === 'me' ? 'on' : ''}">Your agent</button><button data-acttab="house" class="${tab === 'house' ? 'on' : ''}">BANDIT house agent</button></div>`;

function renderReceipts() {
  const root = $('#receiptsRoot');
  const tab = state.actTab || (state.me ? 'me' : 'house');
  if (tab === 'me') return renderMyActivity(root);
  const a = state.agent;
  if (!a) { root.innerHTML = `<div style="margin-top:14px">${actTabs(tab)}</div><div class="card board-msg" style="margin-top:14px"><span class="sk" style="width:50%;margin:0 auto"></span></div>`; return; }
  const ev = a.events || [], runs = a.runs || [];
  const count = t => ev.filter(e => e.type === t).length;
  const pts = a.ledger.reduce((s, p) => s + (p.pointsEst || 0), 0);
  root.innerHTML = `
  <div class="sechead" style="margin-top:14px"><div><span class="eyebrow">Activity</span><h2>Everything the house agent did, with proof</h2><p>BANDIT's own agent trades a real wallet on Robinhood Chain. Every trade links to the chain, every hold shows SERV Reasoning's reason, and every scheduled check is listed.</p></div>${actTabs(tab)}</div>
  <div class="stats" style="margin:0 0 20px">
    <div class="stat"><div class="v lime">${count('trade')}</div><div class="k">Trades onchain</div></div>
    <div class="stat"><div class="v">${count('simulated')}</div><div class="k">Dry runs</div></div>
    <div class="stat"><div class="v">${count('held')}</div><div class="k">Held by SERV</div></div>
    <div class="stat"><div class="v">${runs.length}</div><div class="k">Recent checks</div></div>
    <div class="stat"><div class="v">${pts ? compact(pts) : 'n/a'}</div><div class="k">Est. points so far</div></div>
  </div>
  <div class="agent-grid">
    <div class="card panel"><h3>Timeline <a class="btn soft xs" href="#/agent">Watch it live</a></h3><p class="sub">Newest first, including checks where nothing needed doing.</p>${ev.length || runs.length ? `<div class="timeline">${timelineOf(ev, runs, eventHtml)}</div>` : '<div class="empty"><img src="/art/empty-state.svg" alt=""><b>Nothing yet</b>When the agent checks, acts or SERV holds off, it shows up here.</div>'}</div>
    <div>
      <div class="card panel"><h3>Points ledger</h3><p class="sub">Positions the agent holds onchain, with estimated points so far. Estimates, not promises.</p>${a.ledger.length ? ledgerHtml(a.ledger) : '<div class="empty" style="padding:20px"><b>No positions yet</b>The first live trade opens one.</div>'}</div>
      ${a.agent.addressUrl ? `<a class="btn ghost sm" style="margin-top:12px" href="${esc(a.agent.addressUrl)}" target="_blank" rel="noopener">Agent wallet on the explorer</a>` : ''}
    </div>
  </div>`;
}
function renderMyActivity(root) {
  const head = sub => `<div class="sechead" style="margin-top:14px"><div><span class="eyebrow">Activity</span><h2>What your agent has been doing</h2><p>${sub}</p></div>${actTabs('me')}</div>`;
  if (!state.me) {
    root.innerHTML = `${head('Every check, every practice trade and every SERV decision your agent makes shows up here.')}
      <div class="card first-move"><img src="/art/mascot.svg" alt=""><div><span class="eyebrow">No agent yet</span><h3>Create your free agent to see its activity</h3><p>It starts with $1,000 of practice money, checks your rules every 10 minutes, and SERV Reasoning explains every move.</p><div class="acts-row"><button class="btn primary" id="actCreate">Create my free agent <span class="arr">→</span></button><button class="btn soft sm" data-acttab="house">See the house agent</button></div></div></div>`;
    return;
  }
  const st = state.meStatus;
  if (!st) { root.innerHTML = `${head('Loading your agent…')}<div class="card board-msg"><span class="sk" style="width:50%;margin:0 auto"></span></div>`; return; }
  const p = st.paper, ev = st.events || [], runs = st.runs || [];
  const count = t => ev.filter(e => e.type === t).length;
  const active = st.rules.filter(r => r.status === 'active');
  const pnlColor = p.pnlUsd > 0 ? 'var(--lime)' : p.pnlUsd < 0 ? 'var(--hi)' : 'var(--text)';
  const quiet = !count('paper') && !count('held') && active.length;
  root.innerHTML = `${head('Every check, practice trade and SERV decision, newest first. Your agent runs on its own every 10 minutes, even when this page is closed.')}
  <div class="stats" style="margin:0 0 20px">
    <div class="stat"><div class="v">$${Number(p.totalUsd).toLocaleString('en-US', { maximumFractionDigits: 2 })}</div><div class="k">Practice portfolio</div></div>
    <div class="stat"><div class="v" style="color:${pnlColor}">${p.pnlUsd >= 0 ? '+' : ''}$${Math.abs(p.pnlUsd).toFixed(2)}</div><div class="k">P&amp;L</div></div>
    <div class="stat"><div class="v lime">${count('paper')}</div><div class="k">Practice trades</div></div>
    <div class="stat"><div class="v">${count('held')}</div><div class="k">Held by SERV</div></div>
    <div class="stat"><div class="v">${runs.length}</div><div class="k">Recent checks</div></div>
  </div>
  ${quiet ? `<div class="callout calm"><span class="ic">${ic('scan', 18)}</span><div><b>Your agent is watching, not trading yet.</b> ${active.map(r => `${esc(shortRule(r))}: ${clean(r.lastResult || 'not checked yet')}`).join(' ')} It trades only when a rule is met and SERV Reasoning agrees.</div></div>` : ''}
  <div class="agent-grid">
    <div class="card panel"><h3>Timeline <a class="btn soft xs" href="#/my">Watch it live</a></h3><p class="sub">Newest first, including checks where nothing needed doing.</p>${ev.length || runs.length ? `<div class="timeline">${timelineOf(ev, runs, myEventHtml)}</div>` : '<div class="empty"><img src="/art/empty-state.svg" alt=""><b>No checks yet</b>Arm a rule on My agent, then press Wake my agent.</div>'}</div>
    <div>
      <div class="card panel"><h3>Practice portfolio</h3><p class="sub">Marked to Pendle's live YT prices. Practice results, not a promise of real ones.</p>
        ${st.positions.length ? `<table class="ledger"><thead><tr><th>Position</th><th>Cost</th><th>Value</th><th>P&amp;L</th></tr></thead><tbody>${st.positions.map(x => `<tr><td>${esc(x.name)}<div class="faint" style="font-size:11px;font-weight:500">${esc(x.chainName)}</div></td><td>${usd(x.costUsd)}</td><td>${x.valueUsd == null ? 'n/a' : usd(x.valueUsd)}</td><td style="color:${(x.pnlUsd || 0) >= 0 ? 'var(--lime)' : 'var(--hi)'}">${x.pnlPct == null ? 'n/a' : `${x.pnlPct >= 0 ? '+' : ''}${x.pnlPct}%`}</td></tr>`).join('')}</tbody></table>` : '<div class="empty" style="padding:18px"><b>No positions yet</b>Your agent opens one when a rule fires and SERV confirms.</div>'}
      </div>
      <div class="card panel" style="margin-top:14px"><h3>Rules it is watching</h3><div class="rules">${st.rules.length ? st.rules.map(r => `<div class="rule"><span class="ico">${ic('flag')}</span><div><div class="d">${esc(shortRule(r))}</div><div class="r">${r.lastResult ? clean(r.lastResult) : 'Not checked yet.'}${r.lastCheckedAt ? ` · checked ${ago(r.lastCheckedAt)}` : ''}</div></div><div class="rule-acts"><span class="st ${esc(r.status)}">${esc(r.status)}</span></div></div>`).join('') : '<p class="help">No rules yet. <a class="linkish" href="#/my">Arm one on My agent</a>.</p>'}</div></div>
    </div>
  </div>`;
}

/* ---------- sheets + modals ---------- */
function closeAll() { $$('.sheet.on, .modal.on').forEach(x => x.classList.remove('on')); $('#scrim').classList.remove('on'); }
function openLayer(sel) { closeAll(); $('#scrim').classList.add('on'); $(sel).classList.add('on'); }

/* ---------- Ask BANDIT (its own page) ---------- */
const ASK_STEPS = ['Reading live Pendle prices', 'Comparing every YT with its last 90 days', 'SERV Reasoning is weighing room to run, time left and risk', 'Writing it up in plain English'];
const RISK_NAME = { low: 'Careful', medium: 'Balanced', high: 'Bold' };
const VCOL = { floor: '#5B9DFF', mid: '#C8F25A', top: '#FF8A4C', new: '#A7AB9A' };
state.ask = { feed: [], items: {}, opts: { risk: 'medium', size: 1000, chain: 'all' }, focus: null, busy: false };
state.watching = new Set();
state.pendingWatch = null;

const span = m => Math.min(90, (m.band && m.band.days) || 90);
// Where a YT sits right now, in words anyone can read.
function verdictOf(m) {
  if (!m || !m.band || m.band.status !== 'formed') return { k: 'new', t: 'Too new to judge' };
  const p = m.band.percentile;
  return p >= 97 ? { k: 'top', t: 'At its high' } : p >= 80 ? { k: 'top', t: 'Near its top' } : p <= 20 ? { k: 'floor', t: 'Near its floor' } : { k: 'mid', t: 'Mid range' };
}
const optsLine = o => `${RISK_NAME[o.risk] || 'Balanced'} · $${Number(o.size || 1000).toLocaleString('en-US')} · ${o.chain === String(RH) ? 'Robinhood Chain' : 'All chains'}`;
const askRecent = () => { try { return JSON.parse(store.get('bandit.asks') || '[]'); } catch { return []; } };
function rememberAsk(j) {
  store.set('bandit.asks', JSON.stringify([{ id: j.id, q: j.question, at: j.at }, ...askRecent().filter(x => x.id !== j.id)].slice(0, 6)));
}
const findAnswer = id => (state.ask.feed.find(x => x.j && x.j.id === id) || {}).j;
const answerLink = j => `${location.origin}/a/${j.id}`;
const xIntent = (text, url) => `https://x.com/intent/post?text=${encodeURIComponent(text)}&url=${encodeURIComponent(url)}`;
const clip = (s, n) => s.length > n ? `${s.slice(0, n - 1).replace(/[\s,.;:]+$/, '')}…` : s;
const withTag = lead => `${clip(lead, 205)}\n\nRead live by @openservai SERV Reasoning.`;

function askSuggestions() {
  const rh = (state.data ? state.data.markets : []).filter(m => m.chainId === RH && !m.distorted).sort((a, b) => formed(b) - formed(a) || b.liquidityUsd - a.liquidityUsd);
  const named = rh.find(m => /NVDA/i.test(m.name)) || rh[0];
  return [
    { i: 'down', q: 'Which YTs are near their floor right now?' },
    { i: 'up', q: 'Where is the most room to run with a month or more left?' },
    { i: 'target', q: `Is YT-${named ? named.name : 'NVDA'} a good entry right now?` },
    { i: 'link', q: 'Anything on Robinhood Chain worth watching?', chain: String(RH) },
    { i: 'spark', q: 'Where are points cheapest to farm right now?' },
  ];
}
function renderSuggestions() {
  if (!$('#askSugg')) return;
  $('#askSugg').innerHTML = askSuggestions().map((x, i) => `<button type="button" data-sugg="${i}">${ic(x.i, 15)}${esc(x.q)}</button>`).join('');
  const r = askRecent();
  $('#askRecent').innerHTML = r.length ? `<span>Your recent questions</span>${r.slice(0, 4).map(x => `<button type="button" data-recent="${esc(x.id)}" title="${esc(x.q)}">${esc(x.q)}</button>`).join('')}` : '';
}
function renderAskPage() {
  renderSuggestions();
  const saved = location.hash.match(/[?&]a=([a-f0-9]{16})/);
  if (saved) loadSavedAnswer(saved[1]);
  else if (!state.ask.feed.length && matchMedia('(pointer:fine)').matches) setTimeout(() => { if (state.route === 'ask') $('#askQ').focus({ preventScroll: true }); }, 300);
}
function updateOptsSum() { $('#askOptsSum').textContent = optsLine(state.ask.opts); }
function autosize() { const t = $('#askQ'); t.style.height = 'auto'; t.style.height = `${Math.min(160, t.scrollHeight)}px`; }
function setFocus(m) {
  state.ask.focus = m.id;
  $('#askFocusPill').innerHTML = `About YT-${esc(m.name)} <button type="button" data-unfocus aria-label="Ask about every YT instead">×</button>`;
  $('#askFocusPill').classList.remove('hidden');
}
function clearFocus() { state.ask.focus = null; $('#askFocusPill').classList.add('hidden'); }

// Opens the Ask page. A card's Ask button asks right away; a table row only fills in the question.
function openAsk(marketId, { auto = false } = {}) {
  const m = marketId && state.byId.get(marketId);
  if (state.route !== 'ask') location.hash = '#/ask';
  if (!m) { setTimeout(() => $('#askQ').focus({ preventScroll: true }), 250); return; }
  setFocus(m);
  const q = `Is YT-${m.name} a good entry right now?`;
  if (auto) { setTimeout(() => askBandit({ q, marketId: m.id }), 80); return; }
  $('#askQ').value = q; autosize();
  setTimeout(() => $('#askQ').focus({ preventScroll: true }), 250);
}

function runHtml(item) {
  return `<div class="ask-run">
    <div class="ans-q"><div><p>${esc(item.q)}</p><small>${esc(optsLine(item.opts))}</small></div></div>
    <div class="run-top"><img src="/art/mascot.svg" alt=""><div><b>BANDIT is on it</b><span class="run-t">0s · usually 10 to 30 seconds</span></div></div>
    <ol class="run-steps">${ASK_STEPS.map((t, i) => `<li><span class="dot">${i + 1}</span><span>${t}</span></li>`).join('')}</ol>
    <div class="run-ticker"><span class="faint">Checking</span><b class="tick-name">the live board</b><span class="tick-note"></span></div>
  </div>`;
}
// Step-by-step progress while SERV thinks, with a ticker of the YTs being read.
function progress(el, t0) {
  const steps = $$('.run-steps li', el);
  const set = i => steps.forEach((li, j) => { li.classList.toggle('done', j < i); li.classList.toggle('active', j === i); if (j < i) $('.dot', li).textContent = '✓'; });
  set(0);
  const ms = (state.data ? state.data.markets : []).filter(m => !m.distorted);
  let k = Math.floor(Math.random() * (ms.length || 1));
  const timers = [setTimeout(() => set(1), 900), setTimeout(() => set(2), 2600)];
  const tick = setInterval(() => {
    const t = $('.run-t', el); if (t) t.textContent = `${Math.round((performance.now() - t0) / 1000)}s · usually 10 to 30 seconds`;
    if (!ms.length) return;
    const m = ms[k++ % ms.length], v = verdictOf(m);
    const n = $('.tick-name', el), note = $('.tick-note', el);
    if (n) n.textContent = `YT-${m.name}`;
    if (note) { note.textContent = v.t.toLowerCase(); note.className = `tick-note ${v.k}`; }
  }, 450);
  const stop = () => { timers.forEach(clearTimeout); clearInterval(tick); };
  return { stop, finish: () => { stop(); set(3); } };
}

async function askBandit({ q, chain, risk, size, marketId } = {}) {
  const s = state.ask;
  if (s.busy) { toast('BANDIT is still answering your last question.'); return; }
  const question = (q ?? $('#askQ').value).trim() || 'Which YTs look like a good entry right now?';
  const opts = { ...s.opts, ...(chain ? { chain } : {}), ...(risk ? { risk } : {}), ...(size ? { size: Number(size) } : {}) };
  const focus = marketId || s.focus || null;
  const key = `q${Date.now().toString(36)}`;
  const item = { key, q: question, opts, focus };
  s.items[key] = item;
  s.busy = true;
  $('#askBtn').disabled = true;
  if (q == null) { $('#askQ').value = ''; autosize(); }
  clearFocus();
  $('#askFeed').insertAdjacentHTML('afterbegin', `<div class="ask-item" id="ai-${key}">${runHtml(item)}</div>`);
  const el = $(`#ai-${key}`);
  setTimeout(() => el.scrollIntoView({ behavior: 'smooth', block: 'start' }), 60);
  const t0 = performance.now();
  const prog = progress(el, t0);
  try {
    const j = await api('/api/ask', { method: 'POST', body: { question, risk: opts.risk, sizeUsd: opts.size, chain: opts.chain, marketId: focus || undefined } });
    prog.finish();
    await sleep(450);
    j.ms = performance.now() - t0;
    item.j = j;
    s.feed.unshift(item);
    el.innerHTML = answerCardHtml(j);
    readyUp(el);
    if (j.id) { rememberAsk(j); renderSuggestions(); }
  } catch (e) {
    prog.stop();
    el.innerHTML = `<div class="ans-err"><b>SERV Reasoning didn't answer this time.</b>${esc(e.message)}<br>BANDIT never switches to another model, so nothing was made up.<div style="margin-top:10px"><button class="btn soft xs" data-retry="${key}">Try again</button></div></div>`;
  } finally {
    s.busy = false;
    $('#askBtn').disabled = false;
  }
}

function pickStats(m) {
  const r = m.range, d = span(m);
  return [
    r ? (r.toHigh > 0.005 ? [upPct(r.toHigh), `if it gets back to its ${d}-day high`, 'up'] : ['At its high', `no room left to its ${d}-day high`, 'flat']) : ['Too new', 'not enough history for a range yet', 'flat'],
    r ? [upPct(r.toLow), `if it drops to its ${d}-day low`, 'dn'] : [`${m.band.days || 0} days`, 'of price history so far', 'flat'],
    [`${m.daysToMaturity} days`, `left before it ends on ${shortDate(m.expiry)}`, 'flat'],
  ];
}
const statsHtml = m => `<div class="ph-stats">${pickStats(m).map(([b, s, c]) => `<div><b class="${c}">${esc(b)}</b><span>${esc(s)}</span></div>`).join('')}</div>`;
const gaugeHtml = m => `<div class="gz">${bandHtml(m, { labels: false })}<div class="gz-l">${formed(m) ? `<span>Cheapest in ${span(m)} days</span><span>Priciest</span>` : `<span>Range still forming</span><span>day ${m.band.days} of 14</span>`}</div></div>`;

function pickActsHtml(m, p, j) {
  const watching = state.watching.has(m.id);
  return `<div class="pick-acts">
    ${m.distorted ? '' : watching ? '<a class="btn sm watching" href="#/my">✓ Your agent is watching</a>' : `<button class="btn primary sm" data-watch="${esc(m.id)}">Watch it with my agent</button>`}
    <button class="btn soft sm" data-alert="${esc(m.id)}">Alert me on Telegram</button>
    ${state.byId.has(m.id) && tradable(state.byId.get(m.id)) ? `<button class="btn soft sm" data-trade="${esc(m.id)}">Trade it</button>` : ''}
    <a class="btn soft sm" href="${xIntent(pickShareText(p), j.id ? answerLink(j) : location.origin)}" target="_blank" rel="noopener">Share</a>
  </div>`;
}
function pickBodyHtml(p, m, j) {
  return `<p class="ph-why">${clean(p.why)}</p>
    ${p.watch_out ? `<div class="watch-out"><i>!</i><span>${clean(p.watch_out)}</span></div>` : ''}
    <div class="tags">${p.lens ? `<span class="lens">${clean(p.lens)}</span>` : ''}${(p.watch || []).map(w => `<span>${clean(w)}</span>`).join('')}</div>
    ${m ? pickActsHtml(m, p, j) : ''}`;
}
function heroPickHtml(p, j) {
  const m = p.market, v = verdictOf(m);
  return `<div class="pick-hero ${v.k}">
    <div class="ph-top"><span class="rank">#1 pick</span>${m ? `<div class="coin" style="${coinStyle(m.name)}">${esc(initials(m.name))}</div>` : ''}<div class="ph-name"><div class="nm">${esc(m ? `YT-${m.name}` : p.name)}</div><div class="sub">${m ? `${esc(m.chainName)} · ${usd(m.liquidityUsd)} liquidity` : ''}</div></div><span class="ph-tags">${m ? (gr => `<span class="gchip g-${gr.k}">${gr.score >= 0 ? `Grade ${gr.g}` : gr.g}</span>`)(entryGrade(m)) : ''}<span class="vpill ${v.k}">${v.t}</span></span></div>
    <p class="ph-line">${clean(p.one_liner)}</p>
    ${m ? gaugeHtml(m) + statsHtml(m) : ''}
    ${pickBodyHtml(p, m, j)}
  </div>`;
}
function rowPickHtml(p, rank, j) {
  const m = p.market, v = verdictOf(m), r = m && m.range;
  const n = r ? (r.toHigh > 0.005 ? `<b>${upPct(r.toHigh)}</b><span>room to run</span>` : '<b class="flat">At high</b><span>no room left</span>') : '<b class="flat">New</b><span>no range yet</span>';
  return `<details class="pick-row"><summary><span class="rk">${rank}</span><div class="pr-main"><div class="nm">${esc(m ? `YT-${m.name}` : p.name)}<span class="vpill ${v.k}">${v.t}</span></div><p>${clean(p.one_liner)}</p></div><div class="pr-num">${n}</div><span class="chev">›</span></summary>
    <div class="pr-body">${m ? gaugeHtml(m) + statsHtml(m) : ''}${pickBodyHtml(p, m, j)}</div></details>`;
}
function followUps(j) {
  const r = (j.answer && j.answer.ranked) || [];
  const out = [];
  if (r[1] && r[1].market) out.push({ label: `More on YT-${r[1].market.name}`, q: `Is YT-${r[1].market.name} a good entry right now?` });
  if (j.chain !== String(RH)) out.push({ label: 'Only Robinhood Chain', q: j.question, chain: String(RH) });
  if (j.risk !== 'low') out.push({ label: 'Something more careful', q: j.question, risk: 'low' });
  if (j.goal !== 'points') out.push({ label: 'Cheapest points instead', q: 'Where are points cheapest to farm right now?' });
  return out.slice(0, 4);
}
function pickShareText(p) {
  const m = p.market;
  return withTag(`BANDIT on YT-${m ? m.name : p.name}: ${verdictOf(m).t.toLowerCase()}. ${p.one_liner}`);
}
function answerShareText(j) {
  const p = j.answer.ranked[0], m = p && p.market;
  return withTag(m ? `BANDIT's top pick right now: YT-${m.name}, ${verdictOf(m).t.toLowerCase()}. ${p.one_liner}` : j.answer.headline);
}
function shareBarHtml(j) {
  return `<div class="share-bar"><div class="sb-t">Share this read<span>A link and an image card. Your wallet is never included.</span></div>
    <button class="btn primary sm" data-card="${esc(j.id)}">Share card</button>
    <a class="btn soft sm" href="${xIntent(answerShareText(j), answerLink(j))}" target="_blank" rel="noopener">Post on X</a>
    <button class="btn soft sm" data-link="${esc(j.id)}">${navigator.share ? 'Share link' : 'Copy link'}</button>
  </div>`;
}
function answerCardHtml(j, { saved = false } = {}) {
  const a = j.answer;
  const head = `<div class="ans-q"><div><p>${esc(j.question)}</p><small>${esc(optsLine({ risk: j.risk, size: j.sizeUsd, chain: j.chain }))}</small></div></div>
    <div class="ans-by"><img src="/art/mascot.svg" alt=""><div><b>BANDIT</b><span>SERV Reasoning · ${saved ? `asked ${ago(j.at)}` : `${((j.ms || 0) / 1000).toFixed(1)}s`} · read ${j.marketsSent} live markets</span></div></div>`;
  const savedNote = saved ? `<div class="saved-note"><span><b>Saved answer</b> from ${esc(new Date(j.at).toUTCString().slice(5, 22))} UTC. Prices move, so treat it as a snapshot.</span><button class="btn soft xs" data-reask="${esc(j.id)}">Ask again with live data</button></div>` : '';
  if (!a || !a.ranked || !a.ranked.length) return `<article class="ans-card">${savedNote}${head}<p class="ph-why" style="white-space:pre-wrap">${clean(j.raw || 'No picks came back for this one. Try asking it another way.')}</p></article>`;
  const [first, ...rest] = a.ranked;
  const note = a.note || '';
  const disc = /advice/i.test(note) ? '' : /reasoning only/i.test(note) ? ' Not financial advice.' : ' Data and reasoning only. Not financial advice.';
  return `<article class="ans-card">
    ${savedNote}${head}
    <h3 class="ans-h">${clean(a.headline)}</h3>
    ${heroPickHtml(first, j)}
    ${rest.length ? `<div class="ans-sec">Also worth a look</div><div class="more-picks">${rest.map((p, i) => rowPickHtml(p, i + 2, j)).join('')}</div>` : ''}
    ${a.main_risks && a.main_risks.length ? `<div class="ans-sec">What could go wrong</div><div class="risk-list">${a.main_risks.map(r => `<div class="risk-item"><b>${clean(r.risk)}</b>${clean(r.detail)}</div>`).join('')}</div>` : ''}
    ${j.id ? shareBarHtml(j) : ''}
    <div class="follow"><span>Ask next</span>${followUps(j).map(f => `<button type="button" data-follow="${esc(f.q)}"${f.chain ? ` data-fchain="${f.chain}"` : ''}${f.risk ? ` data-frisk="${f.risk}"` : ''}>${esc(f.label)}</button>`).join('')}</div>
    <div class="ans-foot"><span class="serv-badge"><span class="sd">S</span>Answered by <b>SERV Reasoning</b></span><span>${esc(j.model)}</span><span>Pendle data from ${new Date(j.dataAsOf).toISOString().slice(11, 16)} UTC</span></div>
    <p class="ans-note">${clean(a.note || '')}${disc}</p>
  </article>`;
}

// A shared or earlier answer, loaded by its id.
async function loadSavedAnswer(id) {
  const existing = $(`#ai-s${id}`);
  if (existing || findAnswer(id)) { if (existing) existing.scrollIntoView({ behavior: 'smooth', block: 'start' }); return; }
  $('#askFeed').insertAdjacentHTML('afterbegin', `<div class="ask-item" id="ai-s${id}"><div class="card board-msg"><span class="sk" style="width:60%;margin:0 auto"></span></div></div>`);
  const el = $(`#ai-s${id}`);
  try {
    const j = await api(`/api/ask?id=${id}`);
    state.ask.feed.unshift({ key: `s${id}`, j, saved: true });
    el.innerHTML = answerCardHtml(j, { saved: true });
    readyUp(el);
    setTimeout(() => el.scrollIntoView({ behavior: 'smooth', block: 'start' }), 120);
  } catch (e) {
    el.innerHTML = `<div class="ans-err"><b>That answer is no longer available.</b>${esc(e.message)} Ask BANDIT a fresh question above.</div>`;
  }
}

// "Watch it with my agent": arms a practice-money rule that buys $100 once the YT is cheap.
const watchPct = m => formed(m) && m.band.percentile <= 30 ? Math.min(60, Math.ceil(m.band.percentile) + 10) : 25;
async function watchWithAgent(id) {
  const m = state.byId.get(id);
  if (!m) { toast('That YT is no longer live.', 'err'); return; }
  if (!state.me) { state.pendingWatch = id; openWelcome(ONBOARD.length - 1); return; }
  const pct = watchPct(m);
  try {
    await meApi('create-rule', { marketId: m.id, dir: 'below', pct, ruleAction: 'enter', sizeUsd: 100, mode: 'paper' });
    state.watching.add(m.id);
    $$('[data-watch]').filter(b => b.dataset.watch === m.id).forEach(b => { b.outerHTML = '<a class="btn sm watching" href="#/my">✓ Your agent is watching</a>'; });
    const now = formed(m) && m.band.percentile <= pct;
    toast(`Your agent is watching YT-${m.name} with $100 of practice money. ${now ? "It's cheap right now, so it acts on its next check if SERV agrees." : 'It buys once the price gets cheap, if SERV agrees.'}`, 'ok');
    state.meSig = '';
  } catch (e) { toast(e.message, 'err'); }
}

/* ---------- share card (an image anyone can post) ---------- */
const loadImg = src => new Promise(res => { const i = new Image(); i.onload = () => res(i); i.onerror = () => res(null); i.src = src; });
const hexA = (hex, a) => { const n = parseInt(hex.slice(1), 16); return `rgba(${(n >> 16) & 255},${(n >> 8) & 255},${n & 255},${a})`; };
function rr(x, X, Y, w, h, r) { x.beginPath(); if (x.roundRect) x.roundRect(X, Y, w, h, r); else x.rect(X, Y, w, h); }
function clipW(x, s, maxW) { let t = s; while (t.length > 1 && x.measureText(t).width > maxW) t = t.slice(0, -1); return t === s ? s : `${t}…`; }
function wrapLines(x, text, maxW, maxLines) {
  const words = String(text || '').split(/\s+/).filter(Boolean);
  const lines = [];
  let line = '', i = 0;
  for (; i < words.length; i++) {
    const t = line ? `${line} ${words[i]}` : words[i];
    if (line && x.measureText(t).width > maxW) { lines.push(line); line = words[i]; if (lines.length === maxLines) break; }
    else line = t;
  }
  if (lines.length < maxLines) { if (line) lines.push(line); }
  else if (i < words.length) {
    let last = lines[maxLines - 1];
    while (last.length > 1 && x.measureText(`${last}…`).width > maxW) last = last.slice(0, -1);
    lines[maxLines - 1] = `${last.replace(/[\s,.;:]+$/, '')}…`;
  }
  return lines;
}
function pickLines(x, p, w, max) { x.font = '400 25px "Geist"'; return wrapLines(x, p.one_liner, w - 56, max); }
const pickHeight = (x, p, w, max) => 28 + 46 + 14 + pickLines(x, p, w, max).length * 34 + 22 + 30 + 34;
function drawPick(x, p, i, X, Y, w, h, max) {
  const m = p.market, v = verdictOf(m), col = VCOL[v.k];
  rr(x, X, Y, w, h, 26); x.fillStyle = '#12140F'; x.fill();
  x.strokeStyle = i === 0 ? hexA(col, 0.5) : 'rgba(234,238,218,0.10)'; x.lineWidth = 2; x.stroke();
  x.textBaseline = 'middle';
  rr(x, X + 28, Y + 28, 46, 46, 13); x.fillStyle = i === 0 ? '#C8F25A' : 'rgba(234,238,218,0.08)'; x.fill();
  x.fillStyle = i === 0 ? '#12160A' : '#F1F2E8'; x.font = '700 22px "Geist Mono"'; x.textAlign = 'center'; x.fillText(String(i + 1), X + 51, Y + 52);
  x.textAlign = 'left'; x.fillStyle = '#F1F2E8'; x.font = '700 32px "Geist"';
  x.fillText(clipW(x, m ? `YT-${m.name}` : p.name, w - 340), X + 90, Y + 52);
  x.font = '800 20px "Geist"';
  const pw = x.measureText(v.t).width + 50, px = X + w - 28 - pw;
  rr(x, px, Y + 32, pw, 40, 20); x.fillStyle = hexA(col, 0.16); x.fill();
  x.fillStyle = col; x.beginPath(); x.arc(px + 20, Y + 52, 5, 0, Math.PI * 2); x.fill();
  x.fillText(v.t, px + 33, Y + 53);
  x.textBaseline = 'top';
  const lines = pickLines(x, p, w, max);
  x.fillStyle = '#A7AB9A';
  let yy = Y + 88;
  for (const l of lines) { x.fillText(l, X + 28, yy); yy += 34; }
  yy += 22;
  const gx = X + 28, gw = w - 56 - 220, gy = yy + 8;
  const grad = x.createLinearGradient(gx, 0, gx + gw, 0);
  grad.addColorStop(0, 'rgba(91,157,255,0.55)'); grad.addColorStop(0.5, 'rgba(234,238,218,0.10)'); grad.addColorStop(1, 'rgba(255,138,76,0.55)');
  rr(x, gx, gy, gw, 8, 4); x.fillStyle = grad; x.fill();
  if (m && m.band && m.band.status === 'formed') {
    const dx = gx + gw * Math.max(0.02, Math.min(0.98, m.band.percentile / 100));
    x.beginPath(); x.arc(dx, gy + 4, 11, 0, Math.PI * 2); x.fillStyle = col; x.fill();
    x.lineWidth = 6; x.strokeStyle = hexA(col, 0.25); x.stroke();
  }
  const r = m && m.range, up = r && r.toHigh > 0.005;
  x.textAlign = 'right'; x.textBaseline = 'alphabetic';
  x.fillStyle = up ? '#C8F25A' : '#A7AB9A'; x.font = '600 30px "Geist Mono"';
  x.fillText(r ? (up ? upPct(r.toHigh) : 'At its high') : 'Too new', X + w - 28, gy + 12);
  x.fillStyle = '#6E7263'; x.font = '600 18px "Geist"';
  x.fillText(r ? (up ? 'room to run' : 'no room left') : 'no range yet', X + w - 28, gy + 38);
  x.textAlign = 'left';
}
async function answerImage(j) {
  const W = 1080, H = 1350, P = 72, footTop = H - 132;
  const c = document.createElement('canvas'); c.width = W; c.height = H;
  const x = c.getContext('2d');
  await Promise.all(['700 44px "Space Grotesk"', '600 36px "Geist"', '400 25px "Geist"', '500 30px "Geist"', '700 32px "Geist"', '800 20px "Geist"', '600 30px "Geist Mono"', '700 22px "Geist Mono"'].map(f => document.fonts.load(f).catch(() => null)));
  const logo = await loadImg('/art/logo-mask.svg');
  x.fillStyle = '#0A0B08'; x.fillRect(0, 0, W, H);
  let g = x.createRadialGradient(W * 0.88, 40, 0, W * 0.88, 40, 760);
  g.addColorStop(0, 'rgba(200,242,90,0.16)'); g.addColorStop(1, 'rgba(200,242,90,0)'); x.fillStyle = g; x.fillRect(0, 0, W, H);
  g = x.createRadialGradient(0, H, 0, 0, H, 760);
  g.addColorStop(0, 'rgba(91,157,255,0.10)'); g.addColorStop(1, 'rgba(91,157,255,0)'); x.fillStyle = g; x.fillRect(0, 0, W, H);
  // header: logo, wordmark, SERV badge
  x.textBaseline = 'middle'; x.textAlign = 'left';
  if (logo) { x.save(); rr(x, P, 64, 76, 76, 20); x.clip(); x.drawImage(logo, P, 64, 76, 76); x.restore(); }
  x.fillStyle = '#F1F2E8'; x.font = '700 44px "Space Grotesk"';
  if ('letterSpacing' in x) x.letterSpacing = '6px';
  x.fillText('BANDIT', P + 96, 104);
  if ('letterSpacing' in x) x.letterSpacing = '0px';
  x.font = '700 20px "Geist"';
  const label = 'Read by SERV Reasoning', lw = x.measureText(label).width + 62, lx = W - P - lw;
  rr(x, lx, 80, lw, 48, 24); x.fillStyle = '#171A13'; x.fill(); x.strokeStyle = 'rgba(234,238,218,0.16)'; x.lineWidth = 2; x.stroke();
  rr(x, lx + 12, 92, 24, 24, 7); x.fillStyle = '#C8F25A'; x.fill();
  x.fillStyle = '#12160A'; x.font = '800 15px "Space Grotesk"'; x.textAlign = 'center'; x.fillText('S', lx + 24, 105);
  x.textAlign = 'left'; x.fillStyle = '#F1F2E8'; x.font = '700 20px "Geist"'; x.fillText(label, lx + 46, 105);
  // question and headline
  x.textBaseline = 'top';
  let y = 196;
  x.fillStyle = '#C8F25A'; x.font = '800 20px "Geist"';
  if ('letterSpacing' in x) x.letterSpacing = '3px';
  x.fillText('YOU ASKED', P, y);
  if ('letterSpacing' in x) x.letterSpacing = '0px';
  y += 36;
  x.fillStyle = '#A7AB9A'; x.font = '500 30px "Geist"';
  for (const l of wrapLines(x, `“${j.question}”`, W - 2 * P, 2)) { x.fillText(l, P, y); y += 40; }
  y += 20;
  x.fillStyle = '#F1F2E8'; x.font = '600 36px "Geist"';
  for (const l of wrapLines(x, j.answer.headline, W - 2 * P, 3)) { x.fillText(l, P, y); y += 48; }
  y += 26;
  // up to three picks, as many as fit
  for (const [i, p] of j.answer.ranked.slice(0, 3).entries()) {
    const max = i === 0 ? 2 : 1, h = pickHeight(x, p, W - 2 * P, max);
    if (y + h > footTop - 16) break;
    drawPick(x, p, i, P, y, W - 2 * P, h, max);
    y += h + 16;
  }
  // footer
  x.strokeStyle = 'rgba(234,238,218,0.12)'; x.lineWidth = 2; x.beginPath(); x.moveTo(P, footTop); x.lineTo(W - P, footTop); x.stroke();
  x.textBaseline = 'alphabetic';
  x.fillStyle = '#C8F25A'; x.font = '600 26px "Geist Mono"';
  x.fillText(location.hostname === 'localhost' ? 'bandit-bands.vercel.app' : location.host, P, footTop + 56);
  x.fillStyle = '#6E7263'; x.font = '500 20px "Geist"'; x.fillText('Data and reasoning only. Not financial advice.', P, footTop + 92);
  x.textAlign = 'right';
  x.fillStyle = '#A7AB9A'; x.font = '600 21px "Geist"'; x.fillText('The YT trading agent that works while you sleep', W - P, footTop + 56);
  x.fillStyle = '#6E7263'; x.font = '500 20px "Geist"'; x.fillText(`${new Date(j.at).toUTCString().slice(5, 16)} · live Pendle data`, W - P, footTop + 92);
  x.textAlign = 'left';
  return c;
}
async function openShareCard(id) {
  const j = findAnswer(id); if (!j) return;
  $('#sharePrev').innerHTML = '<span class="sk" style="width:100%;height:100%;border-radius:0"></span>';
  $('#shareActs').innerHTML = '';
  openLayer('#shareModal');
  try {
    const canvas = await answerImage(j);
    const blob = await new Promise(r => canvas.toBlob(r, 'image/png'));
    if (state.share && state.share.url) URL.revokeObjectURL(state.share.url);
    state.share = { blob, url: URL.createObjectURL(blob), j };
    $('#sharePrev').innerHTML = `<img src="${state.share.url}" alt="BANDIT answer card">`;
    const file = new File([blob], `bandit-${j.id}.png`, { type: 'image/png' });
    const canFiles = Boolean(navigator.canShare && navigator.canShare({ files: [file] }));
    $('#shareActs').innerHTML = `${canFiles ? '<button class="btn primary sm" data-sharefile>Share image</button>' : ''}<button class="btn ${canFiles ? 'soft' : 'primary'} sm" data-download>Download image</button>
      <a class="btn soft sm" href="${xIntent(answerShareText(j), answerLink(j))}" target="_blank" rel="noopener">Post on X</a>
      <a class="btn soft sm" href="https://t.me/share/url?url=${encodeURIComponent(answerLink(j))}&text=${encodeURIComponent(answerShareText(j))}" target="_blank" rel="noopener">Telegram</a>
      <button class="btn soft sm" data-close>Close</button>`;
  } catch (e) {
    $('#sharePrev').innerHTML = `<div class="ans-err" style="margin:20px"><b>Could not draw the card in this browser.</b>${esc(e.message)}</div>`;
    $('#shareActs').innerHTML = '<button class="btn soft sm" data-close>Close</button>';
  }
}
function downloadCard() {
  if (!state.share) return;
  const a = document.createElement('a');
  a.href = state.share.url; a.download = `bandit-${state.share.j.id}.png`;
  document.body.appendChild(a); a.click(); a.remove();
  toast('Card saved. Post it anywhere.', 'ok');
}
async function shareCardFile() {
  if (!state.share) return;
  const { blob, j } = state.share;
  try { await navigator.share({ files: [new File([blob], `bandit-${j.id}.png`, { type: 'image/png' })], text: answerShareText(j), url: answerLink(j) }); } catch {}
}
async function shareLink(id) {
  const j = findAnswer(id); if (!j) return;
  const url = answerLink(j);
  if (navigator.share) { try { await navigator.share({ title: 'BANDIT', text: answerShareText(j), url }); } catch {} return; }
  try { await navigator.clipboard.writeText(url); toast('Link copied. Anyone with it sees this answer.', 'ok'); } catch { window.prompt('Copy this link', url); }
}

/* ---------- account menu ---------- */
function acctMenuHtml() {
  const addr = (state.me && state.me.address) || state.wallet.address;
  const icon = state.wallet.info && state.wallet.info.icon ? `<img src="${esc(state.wallet.info.icon)}" alt="">` : `<span class="am-ic">${ic('wallet', 17)}</span>`;
  return `<div class="am-head">${icon}<div><b>${esc(shortAddr(addr))}</b><span>${state.me ? 'Signed in. Your agent keeps working while you are away.' : 'Wallet connected. No agent yet.'}</span></div></div>
    ${state.me ? `<a class="am-item" href="#/my">${ic('user')}My agent</a>` : `<button class="am-item" data-am="create">${ic('user')}Create my free agent</button>`}
    <a class="am-item" href="#/ask">${ic('spark')}Ask BANDIT</a>
    <button class="am-item" data-am="copy">${ic('copy')}Copy address</button>
    <button class="am-item" data-am="switch">${ic('swap')}Use a different wallet</button>
    <button class="am-item danger" data-am="disconnect">${ic('power')}Disconnect</button>`;
}
function toggleMenu(force) {
  const menu = $('#acctMenu'); if (!menu) return;
  const on = force ?? !menu.classList.contains('on');
  if (on) menu.innerHTML = acctMenuHtml();
  menu.classList.toggle('on', on);
  $('#walletBtn').setAttribute('aria-expanded', String(on));
}
function closeMenu() { if ($('#acctMenu') && $('#acctMenu').classList.contains('on')) toggleMenu(false); }
function disconnect({ quiet = false } = {}) {
  const p = state.wallet.provider;
  state.me = null; state.meStatus = null; state.meSig = '';
  store.set('bandit.me', null); store.set('bandit.wallet', null);
  state.wallet = { provider: null, info: null, address: null };
  state.trade.review = null;
  closeMenu(); updateWalletBtn();
  // Ask the wallet to forget this site too, so the next connect shows its account picker again.
  if (p && p.request) p.request({ method: 'wallet_revokePermissions', params: [{ eth_accounts: {} }] }).catch(() => {});
  if (state.route === 'my') renderMy();
  if ($('#tradeSheet').classList.contains('on')) renderTrade();
  if (!quiet) toast('Disconnected. Your agent keeps its rules and practice money for when you sign back in.', 'ok');
}
function handleMenu(action) {
  const addr = (state.me && state.me.address) || state.wallet.address;
  if (action === 'copy') { closeMenu(); if (navigator.clipboard) navigator.clipboard.writeText(addr).then(() => toast('Address copied.', 'ok')); }
  if (action === 'create') { closeMenu(); state.pendingWatch = null; openWelcome(ONBOARD.length - 1); }
  if (action === 'switch') { disconnect({ quiet: true }); state.pendingWatch = null; openWelcome(ONBOARD.length - 1); }
  if (action === 'disconnect') disconnect();
}

/* ---------- wallet + Trade with BANDIT (user's own wallet) ---------- */
// Wallets announce themselves (EIP-6963). If this browser used one before, reconnect silently (no popup).
window.addEventListener('eip6963:announceProvider', e => {
  const { info, provider } = e.detail || {};
  if (!info || !provider || state.providers.some(p => p.info.uuid === info.uuid)) return;
  state.providers.push({ info, provider });
  if (!state.wallet.address && info.rdns && info.rdns === store.get('bandit.wallet')) {
    provider.request({ method: 'eth_accounts' }).then(acc => { if (acc && acc[0] && !state.wallet.address) { setWallet({ info, provider }, acc[0]); } }).catch(() => {});
  }
  if (!state.wallet.address && $('#tradeSheet').classList.contains('on')) renderTrade();
  if ($('#welcomeModal') && $('#welcomeModal').classList.contains('on')) renderWelcome();
  if (state.route === 'my' && !state.me) renderMy();
});
window.dispatchEvent(new Event('eip6963:requestProvider'));

const walletOptions = () => state.providers.length ? state.providers : (window.ethereum ? [{ info: { uuid: 'injected', name: 'Browser wallet', icon: '' }, provider: window.ethereum }] : []);
const walletIcon = p => p.info.icon ? `<img src="${esc(p.info.icon)}" alt="">` : '<span style="width:28px;height:28px;border-radius:7px;display:grid;place-items:center;background:var(--lime-dim);color:var(--lime)">◆</span>';

function setWallet(p, address) {
  state.wallet = { provider: p.provider, info: p.info, address, connecting: null };
  if (p.info.rdns) store.set('bandit.wallet', p.info.rdns);
  if (p.provider.on && !p.provider.__banditBound) {
    p.provider.__banditBound = true;
    p.provider.on('accountsChanged', acc => { if (state.wallet.provider !== p.provider) return; state.wallet.address = acc[0] || null; state.trade.review = null; updateWalletBtn(); if ($('#tradeSheet').classList.contains('on')) renderTrade(); });
  }
  updateWalletBtn();
}

// Plain-language read of where a YT sits, for people who have never seen a band.
function plainBand(m) {
  if (!formed(m)) return m.band.status === 'forming' ? `Too new to judge: ${m.band.days} of the 14 days of price history BANDIT needs.` : 'No price history yet.';
  const p = Math.round(m.band.percentile), d = Math.min(90, m.band.days);
  if (p >= 97) return `At its ${d}-day high: pricier than it has been all period.`;
  if (p >= 80) return `Pricey: higher than ${p}% of its last ${d} days.`;
  if (p <= 20) return `Cheap: lower than ${100 - p}% of its last ${d} days.`;
  return `In the middle of its ${d}-day range.`;
}
function ytStory(m) {
  const end = shortDate(m.expiry);
  let s = `YT-${esc(m.name)} collects the yield of ${esc(m.name)} until ${end} (${m.daysToMaturity} days). Its price rises when the market expects more yield, and fades as the end date gets closer. `;
  s += `<b style="color:var(--text)">${esc(plainBand(m))}</b>`;
  if (m.range) s += m.range.toHigh > 0.005 ? ` Back at its ${Math.min(90, m.band.days)}-day high it would be worth ${upPct(m.range.toHigh)}; back at its low, ${upPct(m.range.toLow)}.` : ` Back at its low it would be worth ${upPct(m.range.toLow)}.`;
  return s;
}

const tradeMarkets = () => (state.data ? state.data.markets : []).filter(tradable)
  .sort((a, b) => formed(b) - formed(a) || ((b.range && b.range.ratio) || 0) - ((a.range && a.range.ratio) || 0) || b.liquidityUsd - a.liquidityUsd);
function openTrade(marketId) {
  if (marketId) state.trade.marketId = marketId;
  state.trade.review = null;
  renderTrade();
  openLayer('#tradeSheet');
}
function updateWalletBtn() {
  const b = $('#walletBtn');
  const addr = (state.me && state.me.address) || state.wallet.address;
  b.innerHTML = addr ? `<span class="wb-dot${state.me ? '' : ' off'}"></span>${esc(shortAddr(addr))}<span class="caret">▾</span>` : 'Get my agent';
  b.classList.toggle('primary', !addr);
  b.classList.toggle('ghost', Boolean(addr));
}
async function fetchBalance(address) {
  try {
    const r = await fetch(WALLET_CHAIN.rpcUrls[0], { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ jsonrpc: '2.0', id: 1, method: 'eth_getBalance', params: [address, 'latest'] }) });
    const j = await r.json();
    return parseInt(j.result, 16) / 1e18;
  } catch { return null; }
}
function renderTrade() {
  const t = state.trade, w = state.wallet, body = $('#tradeBody');
  if (w.connecting) {
    body.innerHTML = `<div class="thinking"><img src="/art/mascot.svg" alt=""><div><b>Waiting for ${esc(w.connecting)}</b><span>Approve the connection in your wallet window.</span></div></div>`;
    return;
  }
  if (!w.address) {
    const list = walletOptions();
    state.walletList = list;
    body.innerHTML = `<p class="help" style="margin-bottom:14px;font-size:13.5px;color:var(--text-2)">Trade a YT yourself, from your own wallet. BANDIT prepares the trade, SERV Reasoning checks it and tells you why, and you sign. BANDIT never holds your money.</p>
      ${list.length ? `<div class="wallets">${list.map((p, i) => `<button class="wallet-btn" data-wallet="${i}">${walletIcon(p)}Continue with ${esc(p.info.name)}</button>`).join('')}</div>` : '<div class="callout"><span class="ic">◆</span><div><b>No browser wallet found.</b> Install Rabby or MetaMask, then reload. You can still browse, ask BANDIT, and get Telegram alerts without one.</div></div>'}`;
    return;
  }
  const ms = tradeMarkets();
  if (!t.marketId || !ms.some(m => m.id === t.marketId)) t.marketId = ms[0] && ms[0].id;
  const m = state.byId.get(t.marketId);
  let html = `<div class="check ok" style="margin-bottom:14px"><span class="tick">✓</span><div>${esc((w.info && w.info.name) || 'Wallet')} · ${esc(shortAddr(w.address))}<small id="walletBal">Checking your balance on Robinhood Chain…</small></div><button class="btn soft xs" id="walletOff" style="margin-left:auto">Disconnect</button></div>
    <div id="lowBal"></div>`;
  if (!ms.length) { body.innerHTML = html + '<div class="callout"><span class="ic">!</span><div>No Robinhood Chain YT is tradable right now. Every one is either too thin or too close to its end date.</div></div>'; return; }
  html += `<div class="form">
    <label class="fld"><span class="fl">What do you want to buy?</span><select class="inp" id="tMarket">${ms.map(x => `<option value="${esc(x.id)}" ${x.id === t.marketId ? 'selected' : ''}>YT-${esc(x.name)} · ${esc(formed(x) ? (x.band.percentile >= 97 ? 'at its high' : x.band.percentile >= 80 ? 'pricey' : x.band.percentile <= 20 ? 'cheap' : 'mid range') : 'too new to judge')} · ${x.daysToMaturity} days left</option>`).join('')}</select></label>
    ${m ? `<div class="card" style="padding:14px">${bandHtml(m)}<p class="help" style="margin-top:10px;font-size:13px;color:var(--text-2);line-height:1.55">${ytStory(m)}</p></div>` : ''}
    <label class="fld"><span class="fl">How much?</span><span class="money"><input class="inp" id="tSize" inputmode="decimal" value="${esc(t.size || 10)}"></span></label>
    <details class="adv"><summary>Advanced</summary><label class="fld" style="margin-top:10px"><span class="fl">Max slippage <em>how far the price may move before the trade cancels itself</em></span><select class="inp" id="tSlip"><option value="0.005">0.5%</option><option value="0.01" selected>1%</option><option value="0.02">2%</option><option value="0.03">3%</option></select></label></details>
    <div><button class="btn primary" id="tReview">Ask SERV to check this trade <span class="arr">→</span></button></div>
  </div><div id="tResult" style="margin-top:18px"></div>`;
  body.innerHTML = html;
  readyUp(body);
  fetchBalance(w.address).then(b => {
    const el = $('#walletBal'); if (!el) return;
    const dollars = b != null && state.data && state.data.ethUsd ? b * state.data.ethUsd : null;
    el.innerHTML = `${b == null ? 'Balance unavailable' : `You have ${b.toFixed(5)} ETH on Robinhood Chain${dollars != null ? ` (${usd(dollars)})` : ''}`} · <button class="linkish" data-topup="self" data-inline="1">Top up</button>`;
    if (dollars != null && dollars < 5 && $('#lowBal') && !$('#lowBal .bridge')) $('#lowBal').innerHTML = `<div class="callout" style="margin-bottom:14px"><span class="ic">◆</span><div><b>Not enough on Robinhood Chain to trade yet.</b> Top up right here with one signature from Base, Arbitrum, Optimism or Ethereum, or practice with $1,000 of paper money in your own agent.<div style="display:flex;gap:8px;margin-top:10px;flex-wrap:wrap"><button class="btn primary xs" data-topup="self" data-inline="1">Top up here</button><a class="btn soft xs" href="#/my" data-close>Practice with my agent</a></div></div></div>`;
  });
  if (t.review) renderReview();
}
async function connectWallet(p) {
  if (!p) return;
  state.wallet.connecting = p.info.name;
  if ($('#tradeSheet').classList.contains('on')) renderTrade();
  try {
    const accounts = await p.provider.request({ method: 'eth_requestAccounts' });
    setWallet(p, accounts[0]);
    toast(`Connected ${p.info.name}.`, 'ok');
  } catch (e) {
    state.wallet.connecting = null;
    toast(e.message || 'The wallet did not connect.', 'err');
  }
  if ($('#tradeSheet').classList.contains('on')) renderTrade();
  if ($('#bridgeSheet').classList.contains('on')) renderBridge();
}
async function ensureChain(provider) {
  try {
    await provider.request({ method: 'wallet_switchEthereumChain', params: [{ chainId: WALLET_CHAIN.chainId }] });
  } catch (e) {
    if (e.code === 4902 || /unrecognized|unknown|not added|not been added/i.test(e.message || '')) await provider.request({ method: 'wallet_addEthereumChain', params: [WALLET_CHAIN] });
    else throw e;
  }
}
async function reviewTrade() {
  const t = state.trade;
  t.marketId = $('#tMarket').value;
  t.size = num($('#tSize').value);
  const out = $('#tResult');
  if (!(t.size >= 1)) { out.innerHTML = '<div class="err-line">Enter a size of at least $1.</div>'; return; }
  $('#tReview').disabled = true;
  out.innerHTML = '<div class="thinking"><img src="/art/mascot.svg" alt=""><div><b>Getting a live Pendle quote and asking SERV Reasoning</b><span>usually 5 to 20 seconds</span></div></div>';
  try {
    t.review = await api('/api/trade', { method: 'POST', body: { marketId: t.marketId, usd: t.size, address: state.wallet.address, slippage: Number($('#tSlip').value) } });
    renderReview();
  } catch (e) {
    out.innerHTML = `<div class="ans-err"><b>Could not review this trade.</b>${esc(e.message)}</div>`;
  } finally {
    if ($('#tReview')) $('#tReview').disabled = false;
  }
}
function renderReview() {
  const r = state.trade.review, out = $('#tResult');
  if (!r || !out) return;
  const q = r.quote, v = r.verdict, ok = r.decision === 'confirm';
  out.innerHTML = `<div class="verdict ${ok ? 'ok' : 'no'}"><div class="vh">${ok ? '✓ SERV Reasoning confirmed' : '⏸ SERV Reasoning held off'}</div><p class="hl">${clean(v.headline)}</p><p>${clean(r.blockedBy || v.reason)}</p>${v.points_math ? `<p style="margin-top:6px">${clean(v.points_math)}</p>` : ''}</div>
    <div class="qgrid"><div class="kpi"><b>${q.ethIn.toFixed(5)}</b><span>ETH in</span></div><div class="kpi"><b>${compact(q.ytOut)}</b><span>${esc(r.market.name)} out</span></div><div class="kpi"><b>${q.priceImpact == null ? 'n/a' : (q.priceImpact * 100).toFixed(2) + '%'}</b><span>price impact</span></div></div>
    ${ok ? `<button class="btn primary" id="tSign">Sign in ${esc((state.wallet.info && state.wallet.info.name) || 'wallet')} <span class="arr">→</span></button><p class="help" style="margin-top:8px">Your wallet switches to Robinhood Chain and shows the exact transaction before you sign. Data and reasoning only, not financial advice.</p>`
      : q.tx ? `<p class="help" style="margin-bottom:10px;font-size:12.5px;color:var(--text-2)">SERV Reasoning would not take this trade, for the reason above. It is your wallet and your call: you can still sign it yourself. The 5% price-impact cap still applies.</p><button class="btn soft" id="tSign">I understand, sign it anyway</button>`
      : `<p class="help">${esc(r.blockedBy || 'A hard limit blocks this trade.')} Try a smaller size or another market.</p>`}
    <div id="tSent"></div>`;
}
async function signTrade() {
  const r = state.trade.review, w = state.wallet;
  if (!r || !r.quote || !r.quote.tx) return;
  const btn = $('#tSign');
  btn.disabled = true;
  try {
    await ensureChain(w.provider);
    const hash = await w.provider.request({ method: 'eth_sendTransaction', params: [{ from: w.address, to: r.quote.tx.to, data: r.quote.tx.data, value: r.quote.tx.value }] });
    $('#tSent').innerHTML = `<div class="verdict ok" style="margin-top:12px"><div class="vh">✓ Sent to Robinhood Chain</div><p><a class="guide" href="${WALLET_CHAIN.blockExplorerUrls[0]}/tx/${esc(hash)}" target="_blank" rel="noopener">View transaction ${esc(String(hash).slice(0, 10))}… →</a></p></div>`;
    toast('Transaction sent. Track it on Blockscout.', 'ok');
  } catch (e) {
    toast(e.message || 'The wallet did not send the transaction.', 'err');
    btn.disabled = false;
  }
}

/* ---------- Top up Robinhood Chain (Relay bridge, inside the app) ---------- */
// Quotes and status come straight from Relay's public API; the user signs the one deposit transaction in their
// own wallet. BANDIT never touches the funds, and only sends the exact deposit it asked Relay for.
const RELAY_API = 'https://api.relay.link';
const ZERO_ADDR = '0x0000000000000000000000000000000000000000';
const ETH_META = { name: 'Ether', symbol: 'ETH', decimals: 18 };
const ORIGINS = [
  { id: 8453, name: 'Base', rpc: 'https://mainnet.base.org', explorer: 'https://basescan.org', add: { chainId: '0x2105', chainName: 'Base', nativeCurrency: ETH_META, rpcUrls: ['https://mainnet.base.org'], blockExplorerUrls: ['https://basescan.org'] } },
  { id: 42161, name: 'Arbitrum', rpc: 'https://arb1.arbitrum.io/rpc', explorer: 'https://arbiscan.io', add: { chainId: '0xa4b1', chainName: 'Arbitrum One', nativeCurrency: ETH_META, rpcUrls: ['https://arb1.arbitrum.io/rpc'], blockExplorerUrls: ['https://arbiscan.io'] } },
  { id: 10, name: 'Optimism', rpc: 'https://mainnet.optimism.io', explorer: 'https://optimistic.etherscan.io', add: { chainId: '0xa', chainName: 'OP Mainnet', nativeCurrency: ETH_META, rpcUrls: ['https://mainnet.optimism.io'], blockExplorerUrls: ['https://optimistic.etherscan.io'] } },
  { id: 1, name: 'Ethereum', rpc: 'https://ethereum-rpc.publicnode.com', explorer: 'https://etherscan.io', add: null },
];
const TOPUP_USD = [2, 5, 10, 25];
const RH_DIRECT = { id: RH, name: 'Robinhood Chain', direct: true, rpc: WALLET_CHAIN.rpcUrls[0], explorer: WALLET_CHAIN.blockExplorerUrls[0] };
const originsFor = target => target === 'agent' ? [RH_DIRECT, ...ORIGINS] : ORIGINS;
const originById = id => [RH_DIRECT, ...ORIGINS].find(o => o.id === id);
const TOPUP_MIN = 1, TOPUP_MAX = 500;
state.bridge = { origin: 8453, picked: false, usd: 5, custom: false, quote: null, balances: {}, balFor: null, target: 'self', host: '#bridgeBody', token: 0, busy: false, destBal: null };

async function rpcBalance(rpc, address) {
  try {
    const r = await fetch(rpc, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ jsonrpc: '2.0', id: 1, method: 'eth_getBalance', params: [address, 'latest'] }) });
    const j = await r.json();
    return j.result ? parseInt(j.result, 16) / 1e18 : null;
  } catch { return null; }
}
const bridgeRecipient = () => state.bridge.target === 'agent' ? state.agent && state.agent.agent.address : state.wallet.address;

// target 'self' tops up the connected wallet; 'agent' funds the BANDIT agent wallet. inline mounts it in the trade sheet.
function openTopUp(target = 'self', inline = false) {
  const b = state.bridge;
  Object.assign(b, { target, quote: null, busy: false, destBal: null, host: inline ? '#lowBal' : '#bridgeBody' });
  if (!inline) openLayer('#bridgeSheet');
  renderBridge();
}
// What the ETH is for, so nobody wonders about USDC or other tokens.
const topupWhy = target => target === 'agent'
  ? 'The agent pays in ETH on Robinhood Chain and needs nothing else: it buys each YT straight from ETH, at most $25 a trade and $100 a day, plus about a cent of gas per trade. No USDC needed. $5 to $10 is enough for a test trade.'
  : 'Trades on Robinhood Chain use ETH and nothing else: the YT is bought straight from ETH, plus about a cent of gas. No USDC needed. $5 covers a small test trade.';
function renderBridge() {
  const b = state.bridge, host = $(b.host), w = state.wallet;
  if (!host) return;
  const head = b.host === '#bridgeBody' ? '' : '<div class="br-head"><div><b>Top up Robinhood Chain</b><span>Move ETH from another chain with one signature.</span></div><span class="br-by">via Relay</span></div>';
  if (!w.address) {
    const list = walletOptions();
    state.walletList = list;
    host.innerHTML = `<div class="bridge">${head}<p class="help" style="font-size:13px;color:var(--text-2)">Connect the wallet that holds your ETH on Base, Arbitrum, Optimism or Ethereum.</p>
      ${list.length ? `<div class="wallets">${list.map((p, i) => `<button class="wallet-btn" data-wallet="${i}">${walletIcon(p)}Connect ${esc(p.info.name)}</button>`).join('')}</div>` : '<div class="callout" style="margin:0"><span class="ic">◆</span><div><b>No browser wallet found.</b> Install Rabby or MetaMask, then reload.</div></div>'}</div>`;
    return;
  }
  const to = bridgeRecipient();
  host.innerHTML = `<div class="bridge">${head}
    <div class="br-note">${esc(topupWhy(b.target))}</div>
    <div class="fld"><span class="fl">Bring ETH from</span><div class="pills br-origins">${originsFor(b.target).map(o => `<button type="button" data-borigin="${o.id}" class="${b.origin === o.id ? 'on' : ''}">${o.name}<small data-bbal="${o.id}">${b.balFor === w.address && b.balances[o.id] != null ? `${b.balances[o.id].toFixed(4)} ETH` : '…'}</small></button>`).join('')}</div></div>
    <div class="fld"><span class="fl">How much <em>minimum $${TOPUP_MIN}</em></span><div class="pills br-amts">${TOPUP_USD.map(u => `<button type="button" data-busd="${u}" class="${!b.custom && b.usd === u ? 'on' : ''}">$${u}</button>`).join('')}<label class="br-custom ${b.custom ? 'on' : ''}"><span>$</span><input id="brAmt" inputmode="decimal" autocomplete="off" placeholder="Other" aria-label="Custom amount in dollars" value="${b.custom ? esc(b.usd) : ''}"></label></div></div>
    <div class="br-quote" id="brQuote"><span class="faint">Getting a live quote from Relay…</span></div>
    <button class="btn primary" id="brGo" disabled>Getting a quote…</button>
    <div class="br-status" id="brStatus"></div>
    <p class="help">BANDIT never holds your funds. You sign one transfer in your wallet and Relay delivers the ETH to <b>${b.target === 'agent' ? 'the BANDIT agent wallet' : 'your wallet'}</b> (<span class="mono">${esc(shortAddr(to))}</span>) on Robinhood Chain, usually within seconds.</p>
  </div>`;
  loadBridgeBalances();
  rpcBalance(WALLET_CHAIN.rpcUrls[0], to).then(v => { b.destBal = v; if (b.quote) quoteBridge(); });
  quoteBridge();
}
async function loadBridgeBalances() {
  const b = state.bridge, addr = state.wallet.address;
  if (!addr || b.balFor === addr) return;
  b.balFor = addr;
  await Promise.all([RH_DIRECT, ...ORIGINS].map(async o => {
    b.balances[o.id] = await rpcBalance(o.rpc, addr);
    const el = $(`[data-bbal="${o.id}"]`);
    if (el) el.textContent = b.balances[o.id] == null ? 'n/a' : `${b.balances[o.id].toFixed(4)} ETH`;
  }));
  // Start from the chain with the most ETH, unless the user already picked one.
  const best = originsFor(b.target).filter(o => b.balances[o.id] > 0).sort((x, y) => b.balances[y.id] - b.balances[x.id])[0];
  if (!b.picked && best && best.id !== b.origin) { b.origin = best.id; $$('[data-borigin]').forEach(x => x.classList.toggle('on', Number(x.dataset.borigin) === b.origin)); }
  quoteBridge();
}
const feeText = n => !n ? 'n/a' : n < 0.01 ? 'under $0.01' : `${n.toFixed(2)}`;
let bridgeTimer = null;
function quoteBridge() {
  clearTimeout(bridgeTimer);
  bridgeTimer = setTimeout(async () => {
    const b = state.bridge, w = state.wallet, out = $('#brQuote'), go = $('#brGo');
    if (!w.address || !out) return;
    const token = ++b.token;
    const origin = originsFor(b.target).find(o => o.id === b.origin) || ORIGINS[0];
    b.origin = origin.id;
    const ethUsd = state.data && state.data.ethUsd;
    if (!ethUsd) { out.innerHTML = '<span class="faint">Waiting for the live ETH price…</span>'; return; }
    if (!(b.usd >= TOPUP_MIN && b.usd <= TOPUP_MAX)) {
      b.quote = null; go.disabled = true; go.textContent = 'Pick an amount';
      out.innerHTML = `<span class="warn">Enter an amount from $${TOPUP_MIN} to $${TOPUP_MAX}.</span>`;
      return;
    }
    const wei = BigInt(Math.round((b.usd / ethUsd) * 1e6)) * 10n ** 12n;
    go.disabled = true; go.textContent = 'Getting a quote…';
    const row = (k, v, cls = '') => `<div class="br-row ${cls}"><span>${k}</span><b>${v}</b></div>`;
    if (origin.direct) {
      // Already on Robinhood Chain: a plain transfer to the agent wallet, no bridge and no Relay fee.
      const sendEth = Number(wei) / 1e18, have = b.balFor === w.address ? b.balances[origin.id] : null, short = have != null && have < sendEth;
      b.quote = { direct: true, wei, origin: origin.id };
      out.innerHTML = `<div class="br-receipt">${row('You send', `${sendEth.toFixed(5)} ETH on Robinhood Chain <em>${usd(b.usd)}</em>`)}${row('Network fee', 'under $0.01')}${row('Arrives', `${sendEth.toFixed(5)} ETH`, 'total')}${row('Arrives in', 'a few seconds')}${b.destBal != null ? row('Agent balance', `${b.destBal.toFixed(5)} ETH <span class="arrow">→</span> about ${(b.destBal + sendEth).toFixed(5)} ETH`) : ''}</div>${short ? `<div class="warn">You have ${have.toFixed(5)} ETH on Robinhood Chain, which is not enough. Pick a smaller amount or bring ETH from another chain.</div>` : ''}`;
      go.disabled = short; go.innerHTML = `Send ${usd(b.usd)} to the agent <span class="arr">→</span>`;
      return;
    }
    try {
      const r = await fetch(`${RELAY_API}/quote`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ user: w.address, recipient: bridgeRecipient(), originChainId: origin.id, destinationChainId: RH, originCurrency: ZERO_ADDR, destinationCurrency: ZERO_ADDR, amount: wei.toString(), tradeType: 'EXACT_INPUT' }) });
      const q = await r.json();
      if (token !== b.token) return;
      if (!r.ok || !Array.isArray(q.steps)) throw new Error(q.message || `Relay answered HTTP ${r.status}`);
      b.quote = { ...q, wei, origin: origin.id };
      const d = q.details || {}, got = d.currencyOut || {}, f = q.fees || {};
      const gasUsd = Number((f.gas && f.gas.amountUsd) || 0), relayUsd = Number((f.relayer && f.relayer.amountUsd) || 0);
      const sendEth = Number(wei) / 1e18, gotEth = Number(got.amountFormatted || 0);
      const have = b.balFor === w.address ? b.balances[origin.id] : null;
      const short = have != null && have < sendEth;
      out.innerHTML = `<div class="br-receipt">
          ${row('You send', `${sendEth.toFixed(5)} ETH on ${origin.name} <em>${usd(b.usd)}</em>`)}
          ${row(`Network fee on ${origin.name}`, feeText(gasUsd))}
          ${row('Relay fee', feeText(relayUsd))}
          ${row('Arrives on Robinhood Chain', `${gotEth.toFixed(5)} ETH <em>${got.amountUsd ? usd(Number(got.amountUsd)) : ''}</em>`, 'total')}
          ${row('Arrives in', `about ${Math.max(5, Math.round(d.timeEstimate || 5))} seconds`)}
          ${b.destBal != null ? row(`${b.target === 'agent' ? 'Agent' : 'Your'} balance there`, `${b.destBal.toFixed(5)} ETH <span class="arrow">→</span> about ${(b.destBal + gotEth).toFixed(5)} ETH`) : ''}
        </div>${short ? `<div class="warn">You have ${have.toFixed(5)} ETH on ${origin.name}, which is not enough. Pick another chain or a smaller amount.</div>` : ''}`;
      go.disabled = short;
      go.innerHTML = `Top up ${usd(b.usd)} from ${origin.name} <span class="arr">→</span>`;
    } catch (e) {
      if (token !== b.token) return;
      b.quote = null;
      out.innerHTML = `<span class="warn">Relay could not quote this right now: ${esc(e.message)}</span>`;
      go.disabled = true; go.textContent = 'No quote';
    }
  }, 300);
}
function bridgeStatus(kind, text, link) {
  const el = $('#brStatus'); if (!el) return;
  el.className = `br-status ${kind}`;
  el.innerHTML = `${kind === 'ok' ? '✓ ' : kind === 'bad' ? '! ' : ''}${esc(text)}${kind === 'wait' ? '<span class="thinking-dots"><i></i><i></i><i></i></span>' : ''}${link ? ` <a href="${esc(link)}" target="_blank" rel="noopener">View</a>` : ''}`;
}
async function switchChainTo(provider, o) {
  try {
    await provider.request({ method: 'wallet_switchEthereumChain', params: [{ chainId: `0x${o.id.toString(16)}` }] });
  } catch (e) {
    if (o.add && (e.code === 4902 || /unrecognized|unknown|not added|not been added/i.test(e.message || ''))) await provider.request({ method: 'wallet_addEthereumChain', params: [o.add] });
    else throw e;
  }
}
async function pollRelay(endpoint) {
  for (let i = 0; i < 100; i++) {
    await sleep(2500);
    let j = null;
    try { j = await fetch(RELAY_API + endpoint).then(r => r.json()); } catch { continue; }
    if (j.status === 'success') return j;
    if (j.status === 'refund') throw new Error('Relay could not deliver it and refunded the ETH to your wallet.');
    if (j.status === 'failure') throw new Error('Relay could not complete the transfer.');
  }
  throw new Error('Still on its way. Check your wallet on Robinhood Chain in a minute.');
}
async function sendDirect(q) {
  const b = state.bridge, w = state.wallet, to = bridgeRecipient();
  if (!to) return;
  b.busy = true;
  if ($('#brGo')) $('#brGo').disabled = true;
  try {
    bridgeStatus('wait', 'Switch your wallet to Robinhood Chain');
    await ensureChain(w.provider);
    bridgeStatus('wait', 'Confirm the transfer in your wallet');
    const hash = await w.provider.request({ method: 'eth_sendTransaction', params: [{ from: w.address, to, value: `0x${q.wei.toString(16)}` }] });
    bridgeStatus('ok', 'Sent to the agent wallet on Robinhood Chain.', `${WALLET_CHAIN.blockExplorerUrls[0]}/tx/${hash}`);
    toast('Sent. The agent balance updates in a few seconds.', 'ok');
    b.balFor = null;
    setTimeout(() => { state.agentSig = ''; loadAgent(); }, 4000);
  } catch (e) {
    bridgeStatus('bad', e.message || 'The wallet did not send it.');
  } finally {
    b.busy = false;
    if ($('#brGo')) $('#brGo').disabled = false;
  }
}
async function runBridge() {
  const b = state.bridge, w = state.wallet, q = b.quote;
  if (!q || b.busy || !w.provider) return;
  if (q.direct) return sendDirect(q);
  const origin = ORIGINS.find(o => o.id === q.origin);
  const txSteps = q.steps.filter(s => s.kind === 'transaction');
  const it = txSteps.length === 1 && q.steps.length === 1 ? txSteps[0].items[0] : null;
  // Only the plain deposit we asked for: from this wallet, on this chain, for exactly this amount.
  if (!it || !it.data || Number(it.data.chainId) !== origin.id || String(it.data.from).toLowerCase() !== w.address.toLowerCase() || BigInt(it.data.value || 0) !== q.wei) {
    bridgeStatus('bad', 'That quote did not match what you asked for, so BANDIT stopped before anything was sent. Try again.');
    return;
  }
  b.busy = true;
  const go = $('#brGo'); if (go) go.disabled = true;
  try {
    bridgeStatus('wait', `Switch your wallet to ${origin.name}`);
    await switchChainTo(w.provider, origin);
    bridgeStatus('wait', 'Confirm the transfer in your wallet');
    const hash = await w.provider.request({ method: 'eth_sendTransaction', params: [{ from: w.address, to: it.data.to, data: it.data.data, value: `0x${BigInt(it.data.value).toString(16)}` }] });
    bridgeStatus('wait', `Sent on ${origin.name}. Relay is delivering it to Robinhood Chain`, `${origin.explorer}/tx/${hash}`);
    const done = it.check && it.check.endpoint ? await pollRelay(it.check.endpoint) : null;
    const dest = done && done.txHashes && done.txHashes[0];
    bridgeStatus('ok', 'Arrived on Robinhood Chain.', dest ? `${WALLET_CHAIN.blockExplorerUrls[0]}/tx/${dest}` : null);
    toast('Your ETH arrived on Robinhood Chain.', 'ok');
    b.balFor = null;
    if (b.target === 'agent') { state.agentSig = ''; loadAgent(); }
    if (b.host === '#lowBal') setTimeout(() => { if ($('#tradeSheet').classList.contains('on')) renderTrade(); }, 2500);
  } catch (e) {
    bridgeStatus('bad', e.message || 'The wallet did not send it.');
  } finally {
    b.busy = false;
    if ($('#brGo')) $('#brGo').disabled = false;
  }
}

/* ---------- Telegram alerts ---------- */
function fillMarketSelects() {
  const ms = state.data ? state.data.markets : [];
  $('#alertMarket').innerHTML = ms.map(m => `<option value="${esc(m.id)}">YT-${esc(m.name)} · ${esc(m.chainName)} · ${formed(m) ? 'P' + Math.round(m.band.percentile) : 'forming'}</option>`).join('');
}
function openAlert(marketId) {
  if (marketId) $('#alertMarket').value = marketId;
  $('#alertDone').innerHTML = '';
  $('#alertErr').classList.add('hidden');
  $('#alertCreate').classList.remove('hidden');
  openLayer('#alertModal');
}
async function createAlert() {
  const btn = $('#alertCreate');
  btn.disabled = true;
  try {
    const j = await api('/api/agent', { method: 'POST', body: { action: 'create-alert', marketId: $('#alertMarket').value, dir: segVal($('#alertDir')), pct: Number($('#alertPct').value) } });
    $('#alertDone').innerHTML = j.telegramUrl
      ? `<div class="verdict ok"><div class="vh">✓ Alert ready</div><p>One tap left: open Telegram and press Start. BANDIT messages you once when it fires, with SERV Reasoning's read.</p><a class="btn tg sm" style="margin-top:10px" href="${esc(j.telegramUrl)}" target="_blank" rel="noopener">Open Telegram</a></div>`
      : '<div class="ans-err"><b>Saved, but the bot is not connected yet.</b>The BANDIT Telegram bot needs TELEGRAM_BOT_TOKEN on the server.</div>';
    btn.classList.add('hidden');
  } catch (e) {
    $('#alertErr').textContent = e.message; $('#alertErr').classList.remove('hidden');
  } finally {
    btn.disabled = false;
  }
}

/* ---------- owner ---------- */
async function saveOwner() {
  const key = $('#ownerKey').value.trim();
  if (!key) return;
  const prev = state.owner;
  state.owner = key;
  try {
    await api('/api/agent', { method: 'POST', owner: true, body: { action: 'verify-owner' } });
    store.set('bandit.owner', key);
    $('#ownerKey').value = '';
    closeAll();
    toast('Owner mode is on in this browser.', 'ok');
    state.agentSig = '';
    renderAgent();
  } catch (e) {
    state.owner = prev;
    $('#ownerErr').textContent = e.message; $('#ownerErr').classList.remove('hidden');
  }
}
async function ownerAction(body) {
  try { await api('/api/agent', { method: 'POST', owner: true, body }); state.agentSig = ''; await loadAgent(); }
  catch (e) { toast(e.message, 'err'); }
}

/* ---------- My agent (personal paper / one-tap approve agent) ---------- */
state.me = (() => { try { const v = JSON.parse(store.get('bandit.me') || 'null'); return v && Date.parse(v.expires) > Date.now() ? v : null; } catch { return null; } })();
state.meStatus = null;
state.meSig = '';
let meTimer = null;

async function meApi(action, extra = {}) {
  const headers = { 'Content-Type': 'application/json' };
  if (state.me) headers['x-bandit-session'] = state.me.token;
  const r = await fetch('/api/me', { method: 'POST', headers, body: JSON.stringify({ action, ...extra }) });
  const j = await r.json().catch(() => null);
  if (r.status === 401 && state.me && action !== 'nonce' && action !== 'verify') { state.me = null; store.set('bandit.me', null); }
  if (!r.ok || !j) throw new Error((j && j.error) || `HTTP ${r.status}`);
  return j;
}
const toHexUtf8 = str => '0x' + [...new TextEncoder().encode(str)].map(b => b.toString(16).padStart(2, '0')).join('');

async function signInWith(p) {
  if (!p) return;
  try {
    if (!state.wallet.address || state.wallet.provider !== p.provider) {
      toast(`Approve the connection in ${p.info.name}.`);
      await connectWallet(p);
    }
    const address = state.wallet.address;
    if (!address) return;
    const { nonce, message } = await meApi('nonce', { address });
    toast(`Now sign the message in ${p.info.name}. It is free and moves no funds.`);
    const signature = await state.wallet.provider.request({ method: 'personal_sign', params: [toHexUtf8(message), address] });
    const session = await meApi('verify', { address, nonce, signature });
    state.me = session;
    store.set('bandit.me', JSON.stringify(session));
    updateWalletBtn();
    closeAll();
    const pending = state.pendingWatch;
    state.pendingWatch = null;
    if (pending) await watchWithAgent(pending);
    else toast('Your agent is ready with $1,000 of practice money.', 'ok');
    state.meSig = '';
    if (state.route !== 'my') location.hash = '#/my'; else await loadMe();
  } catch (e) {
    toast(e.message || 'Sign-in was cancelled.', 'err');
  }
}

/* ---------- welcome (first-time onboarding) ---------- */
const ONBOARD = [
  { img: '/art/step-price.svg', title: 'Some YTs are cheap. Some are at their top.', text: "A YT's price rises and falls with the yield it collects. BANDIT compares today's price with the last 90 days, so you can see at a glance whether it's cheap or already at its peak, and how far it could move." },
  { img: '/art/step-rule.svg', title: 'Tell your agent what you want.', text: 'Pick a YT and a simple rule, like "buy $100 when it gets cheap". Your agent watches it every 10 minutes, day and night, so you don\'t have to.' },
  { img: '/art/step-sleep.svg', title: 'It double-checks every move.', text: 'Before your agent acts, SERV Reasoning checks the numbers and tells you why in plain words. You start with $1,000 of practice money, so nothing is at risk while you learn.' },
];
state.welcome = 0;
function renderWelcome() {
  const i = state.welcome, last = i === ONBOARD.length - 1;
  const pw = last && state.pendingWatch && state.byId.get(state.pendingWatch);
  const step = pw ? { ...ONBOARD[i], title: `Let your agent watch YT-${pw.name}`, text: `Sign a free message with your wallet to create your agent. It starts with $1,000 of practice money and buys $100 of YT-${pw.name} once it gets cheap, only if SERV Reasoning agrees.` } : ONBOARD[i];
  const list = walletOptions();
  state.walletList = list;
  const cta = !last ? '' : state.me ? '<a class="btn primary" href="#/my" data-close>Open my agent</a>'
    : list.length ? `<div class="wallets" style="margin-top:4px">${list.map((p, j) => `<button class="wallet-btn" data-mywallet="${j}">${walletIcon(p)}Create my free agent with ${esc(p.info.name)}</button>`).join('')}</div><p class="help" style="margin-top:8px">Free: you sign a message. No gas, no funds, no approvals.</p>`
    : '<div class="callout"><span class="ic">◆</span><div><b>No browser wallet found.</b> Install Rabby or MetaMask to create your agent. Everything else on BANDIT works without one.</div></div>';
  $('#welcomeBody').innerHTML = `
    <div class="ob-art"><img src="${step.img}" alt=""></div>
    <div class="ob-dots">${ONBOARD.map((_, j) => `<i class="${j === i ? 'on' : ''}"></i>`).join('')}</div>
    <h3 id="welcomeTitle">${esc(step.title)}</h3>
    <p class="sub">${esc(step.text)}</p>
    ${cta}
    <div class="acts">${i > 0 ? '<button class="btn soft sm" id="obBack">Back</button>' : '<button class="btn soft sm" data-close>Just look around</button>'}${!last ? '<button class="btn primary sm" id="obNext">Next <span class="arr">→</span></button>' : ''}</div>`;
}
function openWelcome(step = 0) { state.welcome = step; renderWelcome(); openLayer('#welcomeModal'); }

function firstMovePick() {
  return (state.data ? state.data.markets : [])
    .filter(m => !m.distorted && formed(m) && m.range && m.range.toHigh > 0.005 && m.ytPriceUsd > 0 && m.daysToMaturity >= 14)
    .sort((a, b) => ((b.range.ratio || 0) - (a.range.ratio || 0)))[0] || null;
}
async function quickFirstRule(id) {
  const m = state.byId.get(id); if (!m) return;
  const pct = Math.min(60, Math.max(25, Math.ceil(m.band.percentile) + 10));
  try {
    await meApi('create-rule', { marketId: m.id, dir: 'below', pct, ruleAction: 'enter', sizeUsd: 100, mode: 'paper' });
    toast(`Rule armed. Waking your agent so you can watch it work.`, 'ok');
    state.meSig = '';
    await loadMe();
    setTimeout(() => { $('.live-card')?.scrollIntoView({ behavior: 'smooth', block: 'start' }); runMine(); }, 400);
  } catch (e) { toast(e.message, 'err'); }
}

async function loadMe() {
  clearTimeout(meTimer);
  if (document.hidden && state.meStatus) { meTimer = setTimeout(loadMe, 60_000); return; }
  if (!['my', 'receipts', 'stream'].includes(state.route)) return;
  if (!state.me) { if (state.route === 'my') renderMy(); if (state.route === 'receipts') renderReceipts(); return; }
  try {
    const st = await meApi('status');
    state.meStatus = st;
    const sig = JSON.stringify([st.rules, st.lastRun && st.lastRun.at, st.events[0] && st.events[0].id, st.paper, st.approvals, st.telegram]);
    const editing = $('#myRuleForm') && $('#myRuleForm').contains(document.activeElement);
    if (state.route === 'my' && (!state.live.playing || state.forceRender) && !editing && sig !== state.meSig) { state.forceRender = false; state.meSig = sig; renderMy(); }
    if (state.route === 'receipts') renderReceipts();
    if (state.route === 'stream' && state.streamKind === 'me') streamTick(st.lastRun);
    const m = location.hash.match(/approve=([a-z0-9_]+)/i);
    if (m) {
      const a = st.approvals.find(x => x.id === m[1]);
      history.replaceState(null, '', '#/my');
      if (a) { state.trade.size = a.usd; openTrade(a.marketId); toast('SERV confirmed this trade. Review it and sign in your wallet.', 'ok'); }
    }
  } catch (e) {
    if (!state.me) renderMy(); else toast(e.message, 'err');
  }
  if (['my', 'receipts', 'stream'].includes(state.route)) meTimer = setTimeout(loadMe, state.route === 'stream' ? 30_000 : 60_000);
}

/* ---------- stream view: the Agent World alone, full window (works as an OBS browser source) ---------- */
function renderStream() {
  const me = /[?&]me=1/.test(location.hash) && Boolean(state.me);
  state.streamKind = me ? 'me' : 'house';
  $('#streamRoot').innerHTML = `${worldHtml()}<div class="stream-hint">Streaming ${me ? 'your agent' : 'the BANDIT house agent'} live · <a href="#/${me ? 'my' : 'agent'}">Leave stream view</a></div>`;
  $('#worldWrap').classList.add('stream');
  if (me ? state.meStatus : state.agent) mountWorld(state.streamKind);
}
// New runs play as they arrive; otherwise the world keeps its countdown fresh.
function streamTick(run) {
  if (!world || worldKind !== state.streamKind) { if ($('#world')) mountWorld(state.streamKind); return; }
  if (run && run.steps && run.steps.length && run.at !== worldSeen[state.streamKind] && !world.isPlaying() && !world.isRecording()) { worldSeen[state.streamKind] = run.at; playRun(run); }
  else updateWorldHud();
}

function myRuleBuilderHtml() {
  const ms = (state.data ? state.data.markets : []).filter(m => !m.distorted && formed(m))
    .sort((a, b) => ((b.range && b.range.ratio) || 0) - ((a.range && a.range.ratio) || 0));
  const tag = m => m.band.percentile >= 97 ? 'at its high' : m.band.percentile >= 80 ? 'pricey' : m.band.percentile <= 20 ? 'cheap' : 'mid range';
  const opt = m => `<option value="${esc(m.id)}">YT-${esc(m.name)} · ${esc(m.chainName)} · ${tag(m)}${m.range && m.range.toHigh > 0.005 ? ` · ${upPct(m.range.toHigh)} to its high` : ''}</option>`;
  return `<div class="card" id="myBuilder" style="margin-top:14px;padding:16px;background:var(--bg-2)"><div class="form" id="myRuleForm">
    <label class="fld"><span class="fl">Which YT should your agent watch?</span><select class="inp" id="mMarket">${ms.map(opt).join('')}</select></label>
    <div class="row2">
      <div class="fld"><span class="fl">What should it do?</span><div class="seg" id="mAction"><button type="button" data-v="enter" class="on">Buy</button><button type="button" data-v="exit">Sell what I hold</button></div></div>
      <div class="fld"><span class="fl">When?</span><div class="seg" id="mDir"><button type="button" data-v="below" class="on lo">When it's cheap</button><button type="button" data-v="above" class="hi">When it's pricey</button></div></div>
    </div>
    <label class="fld"><span class="fl">How cheap or pricey? <em id="mPctV"></em></span><input type="range" id="mPct" min="1" max="99" value="25"></label>
    <div class="row2">
      <label class="fld"><span class="fl">Amount</span><span class="money"><input class="inp" id="mSize" inputmode="decimal" value="100"></span></label>
      <div class="fld"><span class="fl">With</span><div class="seg" id="mMode"><button type="button" data-v="paper" class="on">Practice money</button><button type="button" data-v="approve">Real, I approve</button></div></div>
    </div>
    <div class="rule-say" id="mSay"></div>
    <div class="err-line hidden" id="mErr"></div>
    <div><button class="btn primary sm" type="button" id="myRuleCreate">Arm this rule</button></div>
  </div></div>`;
}
function updateRuleSay() {
  const m = $('#mMarket') && state.byId.get($('#mMarket').value);
  if (!m) return;
  const dir = segVal($('#mDir')), pct = Number($('#mPct').value), act = segVal($('#mAction')), mode = segVal($('#mMode')), size = num($('#mSize').value) || 0;
  const span = Math.min(90, m.band.days);
  const cond = dir === 'below' ? `cheaper than ${100 - pct}% of its last ${span} days` : `pricier than ${pct}% of its last ${span} days`;
  $('#mPctV').textContent = dir === 'below' ? `cheaper than ${100 - pct}% of days` : `pricier than ${pct}% of days`;
  const now = dir === 'below' ? m.band.percentile <= pct : m.band.percentile >= pct;
  const what = act === 'enter' ? `buy $${size} of YT-${m.name}` : `sell your YT-${m.name}`;
  $('#mSay').innerHTML = `Your agent will <b>${esc(what)}</b> when it is <b>${cond}</b>${mode === 'approve' ? ', then send you the real trade to approve in your wallet (Robinhood Chain only)' : ', with practice money'}. ${now ? '<span style="color:var(--lime)">It already is right now, so it acts on its next check.</span>' : `Right now it isn't (${esc(plainBand(m).toLowerCase().replace(/\.$/, ''))}), so it waits.`} SERV Reasoning has to agree first.`;
}

function myEventHtml(e) {
  const icon = ic({ paper: 'check', approval: 'pen', held: 'pause', rule: 'flag' }[e.type] || 'scan');
  let title = e.text || e.type, body = '';
  if (e.type === 'paper') { title = e.text; body = e.headline || ''; }
  if (e.type === 'held') { title = `SERV held off on ${e.marketName}`; body = e.headline || ''; }
  if (e.type === 'approval') { title = `SERV confirmed ${e.marketName}: waiting for your signature`; body = e.headline || ''; }
  const reason = e.reason ? `<div class="es"><b style="color:var(--text)">Reason:</b> ${clean(e.reason)}</div>` : '';
  return `<div class="evt ${e.type === 'paper' ? 'simulated' : e.type === 'approval' ? 'trade' : esc(e.type)}"><span class="ei">${icon}</span><div><div class="et">${clean(title)}</div>${body ? `<div class="es">${clean(body)}</div>` : ''}${reason}${e.model ? `<div class="em">SERV ${esc(e.model)}</div>` : ''}</div><span class="ea">${ago(e.at)}</span></div>`;
}

function renderMy() {
  const root = $('#myRoot');
  if (!root || state.route !== 'my') return;
  if (!state.me) {
    const list = state.providers.length ? state.providers : (window.ethereum ? [{ info: { uuid: 'injected', name: 'Browser wallet', icon: '' }, provider: window.ethereum }] : []);
    state.walletList = list;
    root.innerHTML = `<div class="card agent-hero" style="margin-top:14px">
      <div class="mascot sleep"><img src="/art/mascot.svg" alt=""><div class="zzz"><span>z</span><span>z</span><span>Z</span></div></div>
      <div><h2>Get your own BANDIT agent</h2><p class="muted" style="margin:8px 0 14px;max-width:560px">It watches the YTs you pick and buys or sells on simple rules like "buy $100 when it gets cheap". You start with <b style="color:var(--text)">$1,000 of practice money</b> and live prices, and SERV Reasoning explains every move. When you're ready, it can prepare real trades for you to approve in your own wallet.</p>
        ${list.length ? `<div class="wallets" style="max-width:420px">${list.map((p, i) => `<button class="wallet-btn" data-mywallet="${i}">${p.info.icon ? `<img src="${esc(p.info.icon)}" alt="">` : '<span style="width:28px;height:28px;border-radius:7px;display:grid;place-items:center;background:var(--lime-dim);color:var(--lime)">◆</span>'}Create my free agent with ${esc(p.info.name)}</button>`).join('')}</div>` : '<div class="callout" style="max-width:560px"><span class="ic">◆</span><div><b>No browser wallet found.</b> Install Rabby or MetaMask to create your agent. Everything else on BANDIT works without one.</div></div>'}
        <p class="help" style="margin-top:10px">Free: you sign a message. No gas, no funds, no approvals.</p></div><div></div></div>
      <div class="steps" style="margin-top:14px">
        <article class="card step"><span class="no">01</span><img src="/art/step-rule.svg" alt=""><h3>Arm a rule</h3><p>Enter a YT when it sits near the floor of its range, exit near the top. Any Pendle market, any chain.</p></article>
        <article class="card step"><span class="no">02</span><img src="/art/step-price.svg" alt=""><h3>SERV decides</h3><p>Every trigger goes to SERV Reasoning, which confirms or holds off with a written reason you can read.</p></article>
        <article class="card step"><span class="no">03</span><img src="/art/step-sleep.svg" alt=""><h3>It runs without you</h3><p>Your agent checks every 10 minutes, keeps a paper portfolio with live P&amp;L, and pings your Telegram.</p></article>
      </div>`;
    return;
  }
  const st = state.meStatus;
  if (!st) { root.innerHTML = '<div class="card board-msg" style="margin-top:14px"><span class="sk" style="width:50%;margin:0 auto"></span></div>'; return; }
  const p = st.paper;
  const pnlColor = p.pnlUsd > 0 ? 'var(--lime)' : p.pnlUsd < 0 ? 'var(--hi)' : 'var(--text)';
  const active = st.rules.filter(r => r.status === 'active');
  root.innerHTML = `
  <div class="card agent-hero" style="margin-top:14px">
    <div class="mascot sleep" id="mascot"><img src="/art/mascot.svg" alt="Your BANDIT"><div class="zzz"><span>z</span><span>z</span><span>Z</span></div></div>
    <div>
      <h2>Your BANDIT agent</h2>
      <div class="state"><span class="state-pill dry"><i></i>Practice money · started with $${p.startUsd.toLocaleString('en-US')}</span><span class="badge none plain">${esc(shortAddr(st.address))}</span>${st.telegram.linked ? '<span class="badge confirmed">Telegram linked</span>' : ''}</div>
      <div class="agent-stats">
        <div class="stat"><div class="v">$${Number(p.totalUsd).toLocaleString('en-US', { maximumFractionDigits: 2 })}</div><div class="k">Portfolio value</div></div>
        <div class="stat"><div class="v" style="color:${pnlColor}">${p.pnlUsd >= 0 ? '+' : ''}$${Math.abs(p.pnlUsd).toFixed(2)}</div><div class="k">P&amp;L (${p.pnlPct >= 0 ? '+' : ''}${p.pnlPct}%)</div></div>
        <div class="stat"><div class="v">$${Number(p.cashUsd).toLocaleString('en-US', { maximumFractionDigits: 2 })}</div><div class="k">Paper cash</div></div>
        <div class="stat"><div class="v">${active.length}</div><div class="k">Rules armed</div></div>
      </div>
    </div>
    <div class="hero-acts" style="display:flex;flex-direction:column;gap:8px">
      <button class="btn primary" id="myRun">Wake my agent <span class="arr">→</span></button>
      ${st.telegram.linked ? '' : `<button class="btn tg sm" id="myTg" ${st.telegram.bot ? '' : 'disabled'}>Connect Telegram</button>`}
      <button class="btn soft sm" data-topup="self">Top up for real trades</button>
      <button class="btn soft xs" id="mySignOut">Disconnect</button>
    </div>
  </div>
  ${!st.rules.length && firstMovePick() ? (() => { const f = firstMovePick(); return `<div class="card first-move"><img src="/art/mascot.svg" alt=""><div><span class="eyebrow">Your first move</span><h3>Let your agent watch YT-${esc(f.name)}</h3><p>${esc(plainBand(f))} If it gets back to its ${Math.min(90, f.band.days)}-day high it would be worth ${upPct(f.range.toHigh)}, and it has ${f.daysToMaturity} days to get there. A good first thing to watch.</p><div class="acts-row"><button class="btn primary" data-quick="${esc(f.id)}">Watch it: buy $100 when it's cheap <span class="arr">→</span></button><button class="btn soft sm" id="myCustom">I'll build my own rule</button></div><p class="help">Practice money only. Your agent checks every 10 minutes, and SERV Reasoning has to agree before it buys.</p></div></div>`; })() : ''}
  ${st.approvals.length ? `<div class="card panel" style="margin-top:14px;border-color:rgba(200,242,90,.35)"><h3>Waiting for your signature</h3><p class="sub">SERV Reasoning confirmed these on Robinhood Chain. Nothing moves until you sign in your own wallet.</p><div class="rules">${st.approvals.map(a => `<div class="rule"><span class="ico">✍</span><div><div class="d">Enter $${a.usd} of ${esc(a.name)}</div><div class="r">${clean(a.reason)}</div></div><div class="rule-acts"><button class="btn primary xs" data-approve="${esc(a.id)}">Review and sign</button></div></div>`).join('')}</div></div>` : ''}
  <div class="card live-card world-card">
    <div class="wc-head"><div><h3>Your agent's world <span class="serv-badge"><span class="sd">S</span>Every decision by <b>SERV Reasoning</b></span></h3>
      <p class="sub">${active.length ? 'Watch your agent work. It wakes on its own every 10 minutes, or right now with Wake my agent. Go fullscreen to stream it, or clip it for social.' : 'Arm a rule below and your agent starts watching. Then wake it and watch it work.'}</p></div></div>
    ${worldHtml()}
    <div class="live-actions"><button class="btn primary sm" id="myRun2">Wake my agent</button>${worldButtons()}<span class="when">${st.lastRun ? `Last run ${ago(st.lastRun.at)} · ${st.lastRun.source === 'cron' ? 'on its own' : 'you woke it'}` : 'No runs yet'}</span></div>
    <details class="runlog"><summary>Run log</summary><div class="console" id="console"><div class="empty">No runs yet. Arm a rule, then press Wake my agent.</div></div></details>
  </div>
  <div class="agent-grid">
    <div>
      <div class="card panel">
        <h3>My rules ${active.length ? '<button class="btn soft xs" data-mysleep="1">Put my agent to sleep</button>' : st.rules.some(r => r.status === 'paused') ? '<button class="btn primary xs" data-mysleep="0">Wake it back up</button>' : ''}</h3>
        <p class="sub">Up to 5 active rules. Each one fires once, then you can arm the next. Paused rules are skipped until you resume them.</p>
        ${!st.rules.some(r => r.mode === 'approve') ? `<div class="callout calm" style="margin-bottom:12px"><span class="ic">${ic('up', 18)}</span><div><b>Ready for real money?</b> Arm a rule on a Robinhood Chain YT and set <b>With</b> to <b>Real, I approve</b>. When the rule is met and SERV agrees, you get a one-tap trade to sign in your own wallet. You can also buy any Robinhood YT yourself from its Trade button. Real trades need a little ETH on Robinhood Chain. <button class="linkish" data-topup="self">Top up</button></div></div>` : ''}
        <div class="rules">${st.rules.length ? st.rules.map(r => `<div class="rule"><span class="ico">${ic('flag')}</span><div><div class="d">${clean(r.description)}</div><div class="r">${r.lastResult ? clean(r.lastResult) : 'Not checked yet.'}${r.lastCheckedAt ? ` · checked ${ago(r.lastCheckedAt)}` : ''}</div></div><div class="rule-acts"><span class="st ${esc(r.status)}">${esc(r.status)}</span>${r.status === 'done' ? '' : `<button class="btn soft xs" data-mytoggle="${esc(r.id)}">${r.status === 'active' ? 'Pause' : 'Resume'}</button>`}<button class="btn soft xs" data-mydel="${esc(r.id)}">Delete</button></div></div>`).join('') : '<div class="empty" style="padding:14px"><img src="/art/empty-state.svg" alt="" style="width:120px"><b>No rules yet</b>Pick a YT near the floor of its range to start.</div>'}</div>
        ${myRuleBuilderHtml()}
      </div>
    </div>
    <div>
      <div class="card panel"><h3>Paper portfolio <button class="btn soft xs" id="myReset">Reset</button></h3><p class="sub">Marked to Pendle's live YT prices. Paper results, not a promise of real ones.</p>
        ${st.positions.length ? `<table class="ledger"><thead><tr><th>Position</th><th>Cost</th><th>Value</th><th>P&amp;L</th></tr></thead><tbody>${st.positions.map(x => `<tr><td>${esc(x.name)}<div class="faint" style="font-size:11px;font-weight:500">${esc(x.chainName)} · P${Math.round(x.entry.percentile)} at entry${x.percentileNow != null ? `, P${Math.round(x.percentileNow)} now` : ''}</div></td><td>${usd(x.costUsd)}</td><td>${x.valueUsd == null ? 'n/a' : usd(x.valueUsd)}</td><td style="color:${(x.pnlUsd || 0) >= 0 ? 'var(--lime)' : 'var(--hi)'}">${x.pnlPct == null ? 'n/a' : `${x.pnlPct >= 0 ? '+' : ''}${x.pnlPct}%`}</td></tr>`).join('')}</tbody></table>` : '<div class="empty" style="padding:18px"><b>No positions yet</b>Your agent opens one when a rule fires and SERV confirms.</div>'}
      </div>
      <div class="card panel" style="margin-top:14px"><h3>Activity</h3><p class="sub">Newest first.</p>${st.events.length ? `<div class="timeline">${st.events.map(myEventHtml).join('')}</div>` : '<p class="help">Nothing yet.</p>'}</div>
    </div>
  </div>`;
  mountWorld('me');
  bindMyBuilder();
}

function bindMyBuilder() {
  if (!$('#myRuleForm')) return;
  ['#mDir', '#mAction', '#mMode'].forEach(sel => bindSeg($(sel), updateRuleSay));
  ['#mPct', '#mSize'].forEach(sel => $(sel).addEventListener('input', updateRuleSay));
  $('#mMarket').addEventListener('change', updateRuleSay);
  updateRuleSay();
}

async function createMyRule() {
  const btn = $('#myRuleCreate'); btn.disabled = true;
  try {
    await meApi('create-rule', { marketId: $('#mMarket').value, dir: segVal($('#mDir')), pct: Number($('#mPct').value), ruleAction: segVal($('#mAction')), sizeUsd: num($('#mSize').value), mode: segVal($('#mMode')) });
    toast('Rule armed. Your agent checks it every 10 minutes, or press Wake my agent.', 'ok');
    state.forceRender = true;
    state.meSig = '';
    await loadMe();
  } catch (e) {
    $('#mErr').textContent = e.message; $('#mErr').classList.remove('hidden');
  } finally { if ($('#myRuleCreate')) $('#myRuleCreate').disabled = false; }
}

async function runMine() {
  const btns = ['#myRun', '#myRun2'].map(x => $(x)).filter(Boolean);
  btns.forEach(b => { b.disabled = true; });
  state.live.playing = true;
  if (world) world.wake();
  if ($('#console')) $('#console').innerHTML = wakingLine;
  $('#worldWrap')?.scrollIntoView({ behavior: 'smooth', block: 'center' });
  try {
    const run = await meApi('run');
    worldSeen.me = run.at;
    await playRun(run);
    state.meSig = '';
    await loadMe();
  } catch (e) {
    state.live.playing = false;
    if (world) world.stop();
    toast(e.message, 'err');
  } finally { btns.forEach(b => { b.disabled = false; }); }
}

function handleMyClick(e) {
  const q = sel => e.target.closest(sel);
  let el;
  if ((el = q('[data-mywallet]'))) { signInWith(state.walletList[Number(el.dataset.mywallet)]); return true; }
  if (q('#myRun') || q('#myRun2')) { runMine(); return true; }
  if (q('#myRuleCreate')) { createMyRule(); return true; }
  if ((el = q('[data-mytoggle]'))) { meApi('toggle-rule', { id: el.dataset.mytoggle }).then(() => { state.forceRender = true; state.meSig = ''; loadMe(); }).catch(err => toast(err.message, 'err')); return true; }
  if ((el = q('[data-mysleep]'))) { const sleeping = el.dataset.mysleep === '1'; meApi(sleeping ? 'sleep' : 'wake').then(() => { toast(sleeping ? 'Your agent is asleep. Its rules are paused until you wake it.' : 'Your agent is awake. It checks your rules every 10 minutes.', 'ok'); state.forceRender = true; state.meSig = ''; loadMe(); }).catch(err => toast(err.message, 'err')); return true; }
  if ((el = q('[data-mydel]'))) { meApi('delete-rule', { id: el.dataset.mydel }).then(() => { state.forceRender = true; state.meSig = ''; loadMe(); }).catch(err => toast(err.message, 'err')); return true; }
  if ((el = q('[data-approve]'))) { const a = state.meStatus.approvals.find(x => x.id === el.dataset.approve); if (a) { state.trade.size = a.usd; openTrade(a.marketId); } return true; }
  if (q('#myTg')) { meApi('telegram-link').then(j => { window.open(j.url, '_blank', 'noopener'); toast('Press Start in Telegram to link your agent.', 'ok'); }).catch(err => toast(err.message, 'err')); return true; }
  if (q('#myReset')) { if (confirm('Reset your paper portfolio to $1,000?')) meApi('reset').then(() => { state.meSig = ''; loadMe(); }).catch(err => toast(err.message, 'err')); return true; }
  if (q('#mySignOut')) { disconnect(); return true; }
  if ((el = q('[data-quick]'))) { quickFirstRule(el.dataset.quick); return true; }
  if (q('#myCustom')) { $('#myBuilder')?.scrollIntoView({ behavior: 'smooth', block: 'center' }); return true; }
  if (q('#obNext')) { state.welcome = Math.min(ONBOARD.length - 1, state.welcome + 1); renderWelcome(); return true; }
  if (q('#obBack')) { state.welcome = Math.max(0, state.welcome - 1); renderWelcome(); return true; }
  return false;
}

/* ---------- events ---------- */
document.addEventListener('click', e => {
  if (!e.target.closest('#acct')) closeMenu();
  if (e.target.closest('a[href^="http"]')) return; // external links (Share, explorer, Telegram) just open
  if (handleMyClick(e)) return;
  const q = sel => e.target.closest(sel);
  let el;
  if ((el = q('[data-am]'))) return handleMenu(el.dataset.am);
  if ((el = q('[data-sugg]'))) { const s = askSuggestions()[Number(el.dataset.sugg)]; if (s) askBandit({ q: s.q, chain: s.chain }); return; }
  if ((el = q('[data-recent]'))) return loadSavedAnswer(el.dataset.recent);
  if ((el = q('[data-follow]'))) return askBandit({ q: el.dataset.follow, chain: el.dataset.fchain, risk: el.dataset.frisk });
  if ((el = q('[data-reask]'))) { const j = findAnswer(el.dataset.reask); if (j) askBandit({ q: j.question, chain: j.chain, risk: j.risk, size: j.sizeUsd }); return; }
  if ((el = q('[data-retry]'))) { const it = state.ask.items[el.dataset.retry]; if (it) { $(`#ai-${it.key}`)?.remove(); askBandit({ q: it.q, chain: it.opts.chain, risk: it.opts.risk, size: it.opts.size, marketId: it.focus }); } return; }
  if ((el = q('[data-watch]'))) return watchWithAgent(el.dataset.watch);
  if ((el = q('[data-card]'))) return openShareCard(el.dataset.card);
  if ((el = q('[data-link]'))) return shareLink(el.dataset.link);
  if (q('[data-download]')) return downloadCard();
  if (q('[data-sharefile]')) return shareCardFile();
  if (q('[data-unfocus]')) return clearFocus();
  if ((el = q('[data-ask]'))) return openAsk(el.dataset.ask, { auto: !el.classList.contains('row') });
  if ((el = q('[data-alert]'))) return openAlert(el.dataset.alert);
  if ((el = q('[data-trade]'))) return openTrade(el.dataset.trade);
  if ((el = q('[data-expand]'))) return toggleRow(el.dataset.expand);
  if ((el = q('[data-gfilter]'))) { state.gradeFilter = el.dataset.gfilter; renderChains(); renderBoard(); return; }
  if ((el = q('[data-topup]'))) return openTopUp(el.dataset.topup, Boolean(el.dataset.inline));
  if ((el = q('[data-borigin]'))) { state.bridge.origin = Number(el.dataset.borigin); state.bridge.picked = true; $$('[data-borigin]').forEach(x => x.classList.toggle('on', x === el)); return quoteBridge(); }
  if ((el = q('[data-busd]'))) { Object.assign(state.bridge, { usd: Number(el.dataset.busd), custom: false }); $('[data-busd]').forEach(x => x.classList.toggle('on', x === el)); $('.br-custom')?.classList.remove('on'); if ($('#brAmt')) $('#brAmt').value = ''; return quoteBridge(); }
  if (q('#brGo')) return runBridge();
  if ((el = q('[data-chain]'))) { state.chain = el.dataset.chain; renderChains(); renderBoard(); return; }
  if ((el = q('[data-farmchain]'))) { state.farmChain = el.dataset.farmchain; $$('#farmFilters .chip').forEach(c => c.classList.toggle('on', c === el)); renderFarm(); return; }
  if ((el = q('#boardHead [data-sort]'))) { const k = el.dataset.sort; state.sort = state.sort.key === k ? { key: k, dir: -state.sort.dir } : { key: k, dir: k === 'name' ? 1 : -1 }; renderBoard(); return; }
  if ((el = q('[data-toggle]'))) return ownerAction({ action: 'toggle-rule', id: el.dataset.toggle });
  if ((el = q('[data-del]'))) return ownerAction({ action: 'delete-rule', id: el.dataset.del });
  if ((el = q('[data-wallet]'))) return connectWallet(state.walletList[Number(el.dataset.wallet)]);
  if (q('#runNow') || q('#runNow2')) return runNow();
  if (q('#wReplay')) { const run = worldRun(); if (run && run.steps && run.steps.length && !(world && world.isRecording())) playRun(run); else if (!run) toast('No runs yet. Wake the agent first.'); return; }
  if (q('#wFull')) return streamWorld();
  if (q('#wExit')) { if (document.fullscreenElement) document.exitFullscreen(); $('#worldWrap')?.classList.remove('pseudo-full'); return; }
  if (q('#wClip')) return openClip();
  if ((el = q('[data-clipfmt]'))) return recordClip(el.dataset.clipfmt);
  if (q('[data-clipsave]')) return saveClip();
  if (q('[data-clipshare]')) return shareClip();
  if ((el = q('[data-acttab]'))) { state.actTab = el.dataset.acttab; renderReceipts(); if (state.actTab === 'me') loadMe(); return; }
  if (q('#actCreate')) { state.pendingWatch = null; return openWelcome(ONBOARD.length - 1); }
  if (q('#ownerOpen')) { $('#ownerErr').classList.add('hidden'); openLayer('#ownerModal'); setTimeout(() => $('#ownerKey').focus(), 200); return; }
  if (q('#ownerSave')) return saveOwner();
  if (q('#copyAddr')) { navigator.clipboard && navigator.clipboard.writeText(state.agent.agent.address).then(() => toast('Address copied.', 'ok')); return; }
  if (q('#addChain')) { const p = state.wallet.provider || window.ethereum; if (!p) return toast('Open BANDIT in a browser with a wallet to add Robinhood Chain.', 'err'); ensureChain(p).then(() => toast('Robinhood Chain is in your wallet.', 'ok')).catch(err => toast(err.message, 'err')); return; }
  if (q('#walletBtn')) { if (state.me || state.wallet.address) return toggleMenu(); state.pendingWatch = null; return openWelcome(); }
  if (q('#walletOff')) return disconnect();
  if (q('#tReview')) return reviewTrade();
  if (q('#tSign')) return signTrade();
  if (q('#alertCreate')) return createAlert();
  if (q('#fab')) return openAsk();
  if (q('[data-close]') || e.target.id === 'scrim') return closeAll();
});
document.addEventListener('change', e => {
  if (e.target.id === 'tMarket') { state.trade.marketId = e.target.value; state.trade.review = null; state.trade.size = num($('#tSize').value) || 10; renderTrade(); }
});
document.addEventListener('input', e => {
  if (e.target.id !== 'brAmt') return;
  const v = num(e.target.value);
  Object.assign(state.bridge, { usd: v, custom: e.target.value.trim() !== '' });
  $$('[data-busd]').forEach(x => x.classList.toggle('on', !state.bridge.custom && Number(x.dataset.busd) === v));
  $('.br-custom')?.classList.toggle('on', state.bridge.custom);
  quoteBridge();
});
document.addEventListener('keydown', e => {
  if (e.key === 'Escape') { closeAll(); closeMenu(); }
  if ((e.key === 'Enter' || e.key === ' ') && e.target.matches && e.target.matches('.row[data-expand]')) { e.preventDefault(); toggleRow(e.target.dataset.expand); }
  if (e.key === 'Enter' && e.target.id === 'ownerKey') saveOwner();
});

/* ---------- init ---------- */
bindSeg($('#alertDir'));
$('#alertPct').addEventListener('input', e => { $('#alertPctV').textContent = `P${e.target.value}`; });
$('#askForm').addEventListener('submit', e => { e.preventDefault(); askBandit(); });
$('#askQ').addEventListener('input', autosize);
$('#askQ').addEventListener('keydown', e => { if (e.key === 'Enter' && !e.shiftKey && !e.isComposing) { e.preventDefault(); askBandit(); } });
$('#askOpts').addEventListener('click', e => {
  const b = e.target.closest('.pills [data-v]'); if (!b) return;
  const group = b.parentElement, k = group.dataset.opt;
  $$('[data-v]', group).forEach(x => x.classList.toggle('on', x === b));
  state.ask.opts[k] = k === 'size' ? Number(b.dataset.v) : b.dataset.v;
  updateOptsSum();
});
skeletons();
route();
updateWalletBtn();
loadMarkets();
setInterval(() => { if (!document.hidden) loadMarkets(); }, 5 * 60 * 1000);
document.addEventListener('visibilitychange', () => { if (!document.hidden && (state.route === 'agent' || state.route === 'receipts')) loadAgent(); });
api('/api/agent').then(a => { state.agent = a; updateAgentChrome(); renderFarm(); }).catch(() => {});
