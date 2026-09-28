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
const chainShort = m => ({ 4663: 'Robinhood', 1: 'Ethereum', 42161: 'Arbitrum' })[m.chainId] || m.chainName;
const WALLET_CHAIN = { chainId: '0x1237', chainName: 'Robinhood Chain', nativeCurrency: { name: 'Ether', symbol: 'ETH', decimals: 18 }, rpcUrls: ['https://rpc.mainnet.chain.robinhood.com'], blockExplorerUrls: ['https://robinhoodchain.blockscout.com'] };
const store = { get: k => { try { return localStorage.getItem(k); } catch { return null; } }, set: (k, v) => { try { v == null ? localStorage.removeItem(k) : localStorage.setItem(k, v); } catch {} } };

const state = {
  data: null, byId: new Map(), agent: null, agentSig: '', route: 'farm',
  farmChain: 'all', chain: String(RH), sort: { key: 'pct', dir: 1 },
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
  const r = { bands: 'bands', agent: 'agent', receipts: 'receipts', my: 'my', ask: 'ask' }[h] || 'farm';
  const changed = r !== state.route;
  state.route = r;
  $$('.view').forEach(v => v.classList.toggle('on', v.id === `view-${r}`));
  $$('[data-route]').forEach(a => a.classList.toggle('on', a.dataset.route === r));
  document.body.classList.toggle('on-ask', r === 'ask');
  closeMenu();
  if (h === 'farm-board') setTimeout(() => $('#farm-board').scrollIntoView({ behavior: 'smooth' }), 40);
  const tm = location.hash.match(/^#\/trade\?m=([^&]+)/);
  if (tm) { const id = decodeURIComponent(tm[1]); history.replaceState(null, '', '#/'); const open = () => openTrade(id); state.data ? open() : setTimeout(open, 1500); }
  else if (changed) window.scrollTo({ top: 0 });
  // Only one Agent Live pipeline lives in the DOM at a time (they share element ids).
  if (r !== 'agent') $('#agentRoot').innerHTML = '';
  if (r !== 'my') $('#myRoot').innerHTML = '';
  if (r === 'agent') { state.agentSig = ''; renderAgent(); }
  if (r === 'my') { state.meSig = ''; renderMy(); loadMe(); }
  if (r === 'receipts') renderReceipts();
  if (r === 'agent' || r === 'receipts') loadAgent();
  if (r === 'ask') renderAskPage();
}
window.addEventListener('hashchange', route);

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
function marketCard(m, rank, mode = 'trade') {
  const p = m.points || {};
  const c = cost(p.costPer1k);
  const decay = p.decayCostRatio == null ? 'n/a' : `${Math.max(0, Math.round(p.decayCostRatio * 100))}%`;
  let big, bigK, kpis;
  if (mode === 'points') {
    big = p.rate == null ? '<span class="v unknown">Rate unknown</span>' : c === 'Free' ? '<span class="v free">Free</span>' : `<span class="v">${c}</span>`;
    bigK = 'per 1,000 pts';
    kpis = [[p.ptsPerDay100 != null ? compact(p.ptsPerDay100) : 'n/a', 'pts/day per $100'], [decay, 'decays by maturity'], [m.leverage ? Math.round(m.leverage) + 'x' : 'n/a', 'YT leverage']];
  } else {
    const r = m.range;
    big = r ? `<span class="v ${r.toHigh <= 0.005 ? 'unknown' : 'free'}">${r.toHigh <= 0.005 ? 'At high' : upPct(r.toHigh)}</span>` : `<span class="v unknown" style="font-size:16px">${m.band.status === 'forming' ? 'Band forming' : 'No range yet'}</span>`;
    bigK = r ? (r.toHigh <= 0.005 ? 'no room left to its 90d high' : 'if the rate returns to its 90d high') : `day ${m.band.days} of 14`;
    kpis = [[r ? upPct(r.toLow) : 'n/a', 'to its 90d low'], [`${m.daysToMaturity}d`, 'left to run'], [m.leverage ? Math.round(m.leverage) + 'x' : 'n/a', 'YT leverage']];
  }
  const pointsBadge = p.status === 'confirmed points' && p.program ? `<span class="badge plain none">${esc(p.program)}${p.multiplier ? ` ${p.multiplier}x` : ''}</span>` : '';
  return `<article class="card mcard ${m.distorted ? 'distorted' : ''}" data-id="${esc(m.id)}">
    ${rank ? `<span class="rank-no">${rank}</span>` : ''}
    <div class="top"><div class="coin" style="${coinStyle(m.name)}">${esc(initials(m.name))}</div>
      <div style="min-width:0"><div class="nm">YT-${esc(m.name)}</div><div class="sub">${esc(p.project || m.protocol || 'Pendle')} · ${shortDate(m.expiry)} · ${m.daysToMaturity}d left</div></div></div>
    <div class="badges"><span class="badge chain c${m.chainId}">${esc(m.chainName)}</span>${mode === 'points' || p.status !== 'none known' ? `<span class="badge ${statusCls(p.status)}">${statusLabel(p.status)}</span>` : ''}${pointsBadge}${m.distorted ? `<span class="badge distorted">Distorted: ${esc(m.flags.join(', '))}</span>` : ''}</div>
    <div class="big">${big}<span class="k">${bigK}</span></div>
    <div class="kpis">${kpis.map(([v, k]) => `<div class="kpi"><b>${v}</b><span>${k}</span></div>`).join('')}</div>
    <div>${bandHtml(m)}<div style="margin-top:8px;font-size:12px">${pctLabel(m)}</div></div>
    ${p.note && mode === 'trade' && m.chainId === RH ? `<p class="note">${clean(p.note)}</p>` : ''}
    <div class="acts"><button class="btn soft xs" data-ask="${esc(m.id)}">Ask BANDIT</button><button class="btn soft xs" data-alert="${esc(m.id)}">Alert me</button>${tradable(m) ? `<button class="btn primary xs" data-trade="${esc(m.id)}">Trade</button>` : ''}${p.guideUrl ? `<a class="guide" href="${esc(p.guideUrl)}" target="_blank" rel="noopener">Read the guide →</a>` : ''}<a class="btn soft xs" href="${shareUrl(m)}" target="_blank" rel="noopener">Share</a></div>
  </article>`;
}

function signalCard(cls, eyebrow, m, headline, body) {
  return `<article class="card sig ${cls}" data-ask="${esc(m.id)}"><div class="glow"></div>
    <div class="eyebrow-s"><span class="pip"></span>${eyebrow}</div>
    <div class="sig-top"><div class="coin" style="${coinStyle(m.name)}">${esc(initials(m.name))}</div><div><div class="nm">YT-${esc(m.name)}</div><div class="sub">${esc(m.chainName)} · ${m.daysToMaturity}d left · ${usd(m.liquidityUsd)}</div></div></div>
    <div class="sig-big">${headline}</div>
    ${bandHtml(m)}
    <p class="why">${body}</p>
    <div style="display:flex;align-items:center;justify-content:space-between;gap:10px;margin-top:auto"><span class="cta">Ask BANDIT about it <span class="arr">→</span></span><a class="btn soft xs" href="${shareUrl(m)}" target="_blank" rel="noopener">Share on X</a></div></article>`;
}

function renderSignals() {
  const ranged = state.data.markets.filter(m => m.range && !m.distorted);
  const room = [...ranged].filter(m => m.range.toHigh > 0.005).sort((a, b) => (b.range.ratio ?? 0) - (a.range.ratio ?? 0) || b.range.toHigh - a.range.toHigh)[0];
  const top = [...ranged].sort((a, b) => b.band.percentile - a.band.percentile || b.liquidityUsd - a.liquidityUsd).find(m => m.chainId === RH) || [...ranged].sort((a, b) => b.band.percentile - a.band.percentile)[0];
  const mover = state.data.markets.filter(m => m.change7d != null && !m.distorted && m !== room && m !== top).sort((a, b) => Math.abs(b.change7d) - Math.abs(a.change7d))[0];
  const cards = [];
  if (room) cards.push(signalCard('lo', 'Most room to run', room, `${upPct(room.range.toHigh)} <small>to its 90-day high</small>`, `Implied APY <b>${pct(room.impliedApy)}</b> sits at <b>P${Math.round(room.band.percentile)}</b>, near the floor of its band. Back to the high is <b>${upPct(room.range.toHigh)}</b>; back to the low is <b>${upPct(room.range.toLow)}</b>, with ${room.daysToMaturity} days for the move before decay.`));
  if (top) cards.push(signalCard('hi', 'Already at the top', top, `${upPct(top.range.toLow)} <small>to its 90-day low</small>`, `Implied APY <b>${pct(top.impliedApy)}</b> sits at <b>P${Math.round(top.band.percentile)}</b>${top.range.toHigh <= 0.005 ? ', its 90-day high' : ''}. Little room left above and <b>${upPct(top.range.toLow)}</b> back to the low. Holders sit on the gain; new entries pay the top of the range.`));
  if (mover) cards.push(signalCard('move', 'Biggest 7-day move', mover, `${mover.change7d > 0 ? '+' : ''}${(mover.change7d * 100).toFixed(2)}pp <small>implied APY in 7 days</small>`, `Implied APY moved to <b>${pct(mover.impliedApy)}</b>${formed(mover) ? `, now <b>P${Math.round(mover.band.percentile)}</b> of its band` : ''}. YT prices move with the rate, so a fast move is where traders and points speculators crowd in.`));
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
  if (best) { $('#floatCheapest').textContent = `YT-${best.name} · ${upPct(best.range.toHigh)} to high`; $('#floatCheapestSub').textContent = `P${Math.round(best.band.percentile)}, most room to run`; }
}

/* ---------- bands view ---------- */
function renderChains() {
  const counts = {};
  state.data.markets.forEach(m => { counts[m.chainId] = (counts[m.chainId] || 0) + 1; });
  $('#chainChips').innerHTML = state.data.chains.map(c => `<button class="chip${state.chain === String(c.id) ? ' on' : ''}" data-chain="${c.id}">${esc(c.name)}<span class="n">${counts[c.id] || 0}</span></button>`).join('') + `<button class="chip${state.chain === 'all' ? ' on' : ''}" data-chain="all">All chains</button>`;
}
function rowHtml(m) {
  const c = m.change7d, dir = c == null ? '' : c > 0.00005 ? 'up' : c < -0.00005 ? 'dn' : '';
  const trend = c == null ? '<span class="tr">no 7d history</span>' : `<span class="tr ${dir}">${dir === 'up' ? '▴' : dir === 'dn' ? '▾' : '·'} ${Math.abs(c * 100).toFixed(2)}pp · 7d</span>`;
  const p = m.points || {};
  return `<div class="row" role="button" tabindex="0" data-ask="${esc(m.id)}" title="Ask BANDIT about YT-${esc(m.name)}">
    <div class="asset"><div class="coin" style="${coinStyle(m.name)}">${esc(initials(m.name))}</div><div style="min-width:0"><div class="nm">YT-${esc(m.name)}</div><div class="meta">${shortDate(m.expiry)} · ${m.daysToMaturity}d${m.distorted ? ' · <span style="color:var(--err)">distorted</span>' : ''}</div></div></div>
    <span class="hide-m hide-l"><span class="badge chain c${m.chainId}">${esc(chainShort(m))}</span></span>
    ${bandHtml(m)}
    <div class="cell hide-m">${formed(m) ? `<span class="pct ${zone(m.band.percentile)}">P${Math.round(m.band.percentile)}</span>` : '<span class="pct forming">FORMING</span>'}<span class="lbl">${formed(m) ? zoneLabel(m.band.percentile) : `day ${m.band.days}`}</span></div>
    <div class="cell hide-m hide-l">${m.range ? upPct(m.range.toHigh) : 'n/a'}<span class="lbl">${m.range ? `low ${upPct(m.range.toLow)}` : 'no range'}</span></div>
    <div class="cell hide-m">${usd(m.liquidityUsd)}<span class="lbl">liquidity</span></div>
    <div class="cell apy">${pct(m.impliedApy)}${trend}</div>
  </div>`;
}
function renderBoard() {
  const { key, dir } = state.sort;
  const val = m => ({ name: m.name.toLowerCase(), liq: m.liquidityUsd, apy: m.impliedApy, pct: m.band.percentile, up: m.range ? m.range.toHigh : -Infinity })[key];
  const ms = state.data.markets.filter(m => state.chain === 'all' || String(m.chainId) === state.chain).sort((a, b) => {
    if (key === 'pct' && formed(a) !== formed(b)) return formed(a) ? -1 : 1;
    const va = val(a), vb = val(b);
    return ((va > vb) - (va < vb)) * dir || b.liquidityUsd - a.liquidityUsd;
  });
  $$('#boardHead [data-sort]').forEach(b => b.classList.toggle('sorted', b.dataset.sort === key));
  const rows = $('#boardRows');
  rows.classList.remove('ready');
  rows.innerHTML = ms.length ? ms.map(rowHtml).join('') : '<div class="board-msg">No markets on this chain right now.</div>';
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
    updateAgentChrome();
  } catch (e) {
    if (state.route === 'agent' && !state.agent) $('#agentRoot').innerHTML = `<div class="card board-msg">Could not load the agent: ${esc(e.message)}</div>`;
  }
  if (state.route === 'agent' || state.route === 'receipts') agentTimer = setTimeout(loadAgent, 60_000);
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

const NODES = [
  { icon: '◎', label: 'Markets' },
  { icon: '⚑', label: 'Rules' },
  { icon: '⇄', label: 'Pendle quote' },
  { icon: '✦', label: 'SERV Reasoning' },
  { icon: '⛓', label: 'Robinhood Chain' },
  { icon: '✈', label: 'Telegram' },
];
const STAGE_NODE = { scan: 0, rule: 1, quote: 2, serv: 3, decision: 3, exec: 4, telegram: 5 };
const STAGE_LABEL = { scan: 'scan', rule: 'rule', quote: 'quote', serv: 'serv', decision: 'verdict', exec: 'chain', telegram: 'telegram', done: 'done' };

function pipelineHtml() {
  const wires = NODES.slice(0, -1).map((_, i) => `<div class="wire" data-w="${i}" style="left:calc(${(i + 0.5) * (100 / 6)}% + 36px);width:calc(${100 / 6}% - 72px)"><i></i></div>`).join('');
  return `<div class="pipeline" id="pipe">${wires}${NODES.map((n, i) => `<div class="node${i === 0 ? ' scan-orb' : ''}" data-n="${i}"><div class="orb">${n.icon}</div><div class="nl">${n.label}</div><div class="ns" data-ns="${i}"></div></div>`).join('')}</div>`;
}
function consoleLine(s) {
  const bad = s.ok === false;
  const cls = s.stage === 'decision' ? (bad ? 'bad' : 'decision') : (s.stage === 'exec' && bad) ? 'bad' : s.stage;
  const reason = s.reason ? `<div class="reason">${clean(s.reason)}</div>` : '';
  const link = s.url ? ` <a href="${esc(s.url)}" target="_blank" rel="noopener">View tx</a>` : '';
  return `<div class="ln"><span class="st ${cls}">${STAGE_LABEL[s.stage] || esc(s.stage)}</span><div class="lt">${clean(s.text)}${link}${reason}</div></div>`;
}
function nodeStatus(s) {
  switch (s.stage) {
    case 'scan': return 'scanned';
    case 'rule': return s.hit ? 'triggered' : 'waiting';
    case 'quote': return 'quoted';
    case 'serv': return 'thinking';
    case 'decision': return s.ok === false ? 'held off' : 'confirmed';
    case 'exec': return s.ok === false ? 'failed' : s.url ? 'onchain' : 'simulated';
    case 'telegram': return 'pinged';
    default: return '';
  }
}
function resetPipeline() {
  $$('#pipe .node').forEach(n => n.classList.remove('active', 'done', 'bad', 'hold'));
  $$('#pipe [data-ns]').forEach(n => { n.textContent = ''; });
  $$('#pipe .wire').forEach(w => w.classList.remove('flow', 'lit'));
  const strip = $('#mktStrip'); if (strip) strip.innerHTML = '';
}
function setNode(i, s) {
  const nodes = $$('#pipe .node');
  nodes.forEach((n, j) => { if (j !== i && n.classList.contains('active')) { n.classList.remove('active'); n.classList.add('done'); } });
  const n = nodes[i]; if (!n) return;
  n.classList.remove('done', 'bad', 'hold'); n.classList.add('active');
  if (s && s.ok === false) n.classList.add(s.stage === 'decision' ? 'hold' : 'bad');
  const ns = $(`#pipe [data-ns="${i}"]`); if (ns && s) ns.textContent = nodeStatus(s);
}
function flowWires(from, to) {
  for (let w = from; w < to; w++) {
    const el = $(`#pipe .wire[data-w="${w}"]`);
    if (el) { el.classList.remove('flow'); void el.offsetWidth; el.classList.add('flow', 'lit'); }
  }
}
function drawStrip(markets, flash) {
  const el = $('#mktStrip'); if (!el) return;
  el.innerHTML = (markets || []).map((m, i) => `<span class="${m.distorted ? 'dist' : ''}${i === flash ? ' flash' : ''}">${esc(m.name)} ${m.percentile == null ? '· forming' : 'P' + Math.round(m.percentile)}</span>`).join('');
}
function showRunStatic(run) {
  if (!$('#pipe')) return;
  resetPipeline();
  const steps = run.steps || [];
  $('#console').innerHTML = steps.map(consoleLine).join('') || '<div class="empty">No steps recorded.</div>';
  const scan = steps.find(s => s.stage === 'scan'); if (scan) drawStrip(scan.markets, -1);
  let last = -1;
  steps.forEach(s => {
    const i = STAGE_NODE[s.stage]; if (i == null) return;
    const n = $$('#pipe .node')[i];
    n.classList.add('done'); n.classList.remove('hold', 'bad');
    if (s.ok === false) n.classList.add(s.stage === 'decision' ? 'hold' : 'bad');
    const ns = $(`#pipe [data-ns="${i}"]`); if (ns) ns.textContent = nodeStatus(s);
    last = Math.max(last, i);
  });
  for (let w = 0; w < last; w++) $(`#pipe .wire[data-w="${w}"]`)?.classList.add('lit');
  const decision = [...steps].reverse().find(s => s.stage === 'decision');
  if (decision) { const [t, tone, sub] = bubbleFor(decision); say(t, tone, `Last run ${ago(run.at)}${sub ? ` · ${sub}` : ''}`); }
}
const DELAY = { scan: 1300, rule: 1000, quote: 1100, serv: 1700, decision: 1900, exec: 1500, telegram: 1100, done: 500 };
async function playRun(run) {
  const token = ++state.live.token;
  state.live.playing = true;
  wake(true);
  resetPipeline();
  const con = $('#console'); if (!con) return;
  con.innerHTML = '';
  let prev = -1;
  for (const s of run.steps || []) {
    if (token !== state.live.token) return;
    const i = STAGE_NODE[s.stage];
    if (i != null) {
      if (prev >= 0 && i > prev) { flowWires(prev, i); await sleep(420); }
      setNode(i, s); prev = i;
    }
    if (s.stage === 'scan' && s.markets) { for (let k = 0; k < s.markets.length; k++) { if (token !== state.live.token) return; drawStrip(s.markets, k); await sleep(180); } drawStrip(s.markets, -1); }
    say(...bubbleFor(s));
    con.insertAdjacentHTML('beforeend', consoleLine(s));
    con.scrollTop = con.scrollHeight;
    await sleep(DELAY[s.stage] || 900);
  }
  if (token !== state.live.token) return;
  $$('#pipe .node.active').forEach(n => { n.classList.remove('active'); n.classList.add('done'); });
  state.live.playing = false;
  setTimeout(() => { if (token === state.live.token) wake(false); }, 1800);
}
async function runNow() {
  const btns = ['#runNow', '#runNow2'].map(s => $(s)).filter(Boolean);
  btns.forEach(b => { b.disabled = true; });
  const token = ++state.live.token;
  state.live.playing = true;
  wake(true);
  say('Waking up. Scanning the Pendle markets…');
  resetPipeline(); setNode(0, { stage: 'scan' });
  $('#pipe [data-ns="0"]').textContent = 'scanning';
  $('#console').innerHTML = '<div class="ln"><span class="st scan">scan</span><div class="lt">Waking up and scanning Pendle markets<span class="thinking-dots"><i></i><i></i><i></i></span></div></div>';
  const hint = setTimeout(() => {
    if (token !== state.live.token) return;
    flowWires(0, 3); setNode(3, { stage: 'serv' }); say('Let me ask SERV Reasoning about this one…');
    $('#console').insertAdjacentHTML('beforeend', '<div class="ln"><span class="st serv">serv</span><div class="lt">SERV Reasoning is weighing the numbers<span class="thinking-dots"><i></i><i></i><i></i></span></div></div>');
  }, 2800);
  try {
    const run = await api('/api/agent', { method: 'POST', owner: true, body: { action: 'run' } });
    clearTimeout(hint);
    state.live.playing = false;
    if (run.skipped || run.error) { toast(run.skipped || run.error, 'err'); return; }
    await playRun(run);
    state.agentSig = '';
    await loadAgent();
  } catch (e) {
    clearTimeout(hint); state.live.playing = false; toast(e.message, 'err'); resetPipeline(); wake(false); say(`Something went wrong: ${e.message}`, 'no');
  } finally {
    btns.forEach(b => { b.disabled = false; });
  }
}

function idleLine(a) {
  if (!a.lastRun) return "Asleep. Arm a rule and I'll check it every 10 minutes.";
  const acted = (a.lastRun.actions || []).length;
  return `Asleep. Last check ${ago(a.lastRun.at)}: ${acted ? `${acted} action${acted === 1 ? '' : 's'}` : 'nothing to do'}. Next one within 10 minutes.`;
}
function say(text, tone = '', sub = '') {
  const b = $('#bubble'); if (!b) return;
  b.className = `bubble ${tone}`;
  b.innerHTML = `${clean(text)}${sub ? `<small>${clean(sub)}</small>` : ''}`;
}
function wake(on) {
  ['#buddy', '#mascot'].forEach(sel => { const el = $(sel); if (el) { el.classList.toggle('awake', on); el.classList.toggle('sleep', !on); } });
}
function bubbleFor(s) {
  if (s.stage === 'decision') return [s.ok === false ? `SERV says hold off. ${s.reason || ''}` : `SERV says go. ${s.reason || ''}`, s.ok === false ? 'no' : 'ok', s.model ? `SERV Reasoning · ${s.model}` : ''];
  if (s.stage === 'serv') return ['Let me ask SERV Reasoning about this one…', '', ''];
  if (s.stage === 'exec') return [s.text, s.ok === false ? 'no' : 'ok', ''];
  if (s.stage === 'done') return [`${s.text} zZz`, '', ''];
  return [s.text, '', ''];
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
      <h2>Your BANDIT agent</h2>
      <div class="state"><span class="state-pill ${mode.cls}"><i></i>${mode.text}</span>${owner ? '<span class="badge confirmed">Owner mode</span>' : ''}</div>
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
      <a class="btn soft sm" href="#/receipts">See receipts</a>
    </div>
  </div>
  <div class="agent-grid">
    <div>
      <div class="card live-card">
        <h3>Agent Live <span class="serv-badge"><span class="sd">S</span>Every decision by <b>SERV Reasoning</b></span></h3>
        <p class="sub">Each run, step by step: scan the markets, check your rules, get a live Pendle quote, ask SERV Reasoning to confirm or hold off, act on Robinhood Chain, tell Telegram.</p>
        ${pipelineHtml()}
        <div class="live-buddy"><div class="buddy sleep" id="buddy"><img src="/art/mascot.svg" alt="BANDIT"><div class="zzz"><span>z</span><span>z</span><span>Z</span></div></div><div class="bubble" id="bubble">${esc(idleLine(a))}</div></div>
        <div class="mkt-strip" id="mktStrip"></div>
        <div class="console" id="console"><div class="empty">No runs yet. ${owner ? 'Press Run now to wake the agent.' : 'The agent wakes on its schedule.'}</div></div>
        <div class="live-actions">
          ${owner ? '<button class="btn primary sm" id="runNow2">Run now</button>' : ''}
          <button class="btn soft sm" id="replay" ${a.lastRun && a.lastRun.steps && a.lastRun.steps.length ? '' : 'disabled'}>Replay last run</button>
          <span class="when">${a.lastRun ? `Last run ${ago(a.lastRun.at)} · ${esc(a.lastRun.source)} · ${a.lastRun.live ? 'live' : 'dry run'}` : ''}</span>
        </div>
      </div>
      <div class="card panel" style="margin-top:14px">
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
        <p class="sub">Send a little ETH on Robinhood Chain to this address. The agent buys YT straight from ETH, so it needs nothing else.</p>
        ${a.agent.address ? `<div class="fund"><div class="qr" id="qr"></div><div><div class="addr">${esc(a.agent.address)}</div><div style="display:flex;gap:6px;flex-wrap:wrap"><button class="btn soft xs" id="copyAddr">Copy</button><a class="btn soft xs" href="${esc(a.agent.addressUrl)}" target="_blank" rel="noopener">Explorer</a><button class="btn soft xs" id="addChain">Add Robinhood Chain</button></div></div></div>` : '<p class="help">No agent wallet yet. Set AGENT_PRIVATE_KEY in Vercel to a brand new wallet used only for BANDIT.</p>'}
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
  if (a.lastRun && a.lastRun.steps && a.lastRun.steps.length) showRunStatic(a.lastRun);
  if (a.agent.address) drawQr(a.agent.address);
  bindRuleBuilder();
}

function ruleHtml(r) {
  const owner = Boolean(state.owner);
  const ico = r.kind === 'farm' ? '<span class="ico farm">✦</span>' : '<span class="ico">⚑</span>';
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
const EVT_ICON = { trade: '✓', simulated: '◌', held: '⏸', refused: '⛔', failed: '!', error: '!', alert: '✈', rule: '⚑' };
function eventHtml(e) {
  let title = e.text || e.type, body = '';
  if (e.type === 'trade') { title = `${e.verb} ${e.marketName}`; body = `${e.size || ''}. ${e.pointsLine || ''}`; }
  else if (e.type === 'simulated') { title = `Dry run: would have ${String(e.verb || 'Entered').toLowerCase()} ${e.marketName}`; body = `${e.size || ''}. ${e.pointsLine || ''}`; }
  else if (e.type === 'held') { title = `SERV held off on ${e.marketName}`; body = e.headline || ''; }
  else if (e.type === 'refused') { title = `A hard guard refused ${e.marketName || 'a trade'}`; body = e.text; }
  else if (e.type === 'failed') { title = `Could not execute ${e.marketName || 'a trade'}`; body = e.text; }
  const reason = e.reason ? `<div class="es"><b style="color:var(--text)">Reason:</b> ${clean(e.reason)}</div>` : '';
  const meta = [e.model ? `SERV ${esc(e.model)}` : '', e.priceImpact != null ? `impact ${(e.priceImpact * 100).toFixed(2)}%` : '', e.url ? `<a href="${esc(e.url)}" target="_blank" rel="noopener">tx ${esc(String(e.hash || '').slice(0, 10))}…</a>` : ''].filter(Boolean).join(' · ');
  return `<div class="evt ${esc(e.type)}"><span class="ei">${EVT_ICON[e.type] || '•'}</span><div><div class="et">${clean(title)}</div>${body && e.type !== 'rule' ? `<div class="es">${clean(body)}</div>` : ''}${reason}${meta ? `<div class="em">${meta}</div>` : ''}</div><span class="ea">${ago(e.at)}</span></div>`;
}
function ledgerHtml(rows) {
  return `<table class="ledger"><thead><tr><th>Position</th><th>Cost</th><th>Value</th><th>Est. points</th></tr></thead><tbody>${rows.map(p => `<tr><td>${esc(p.name)}<div class="faint" style="font-size:11px;font-weight:500">${esc((p.entry && (p.entry.program || p.entry.status)) || '')} · held ${p.daysHeld}d</div></td><td>${usd(p.costUsd)}</td><td>${p.valueUsd == null ? 'n/a' : usd(p.valueUsd)}</td><td>${p.pointsEst == null ? 'rate unknown' : compact(p.pointsEst)}</td></tr>`).join('')}</tbody></table>`;
}
function renderReceipts() {
  const root = $('#receiptsRoot');
  const a = state.agent;
  if (!a) { root.innerHTML = '<div class="card board-msg" style="margin-top:14px"><span class="sk" style="width:50%;margin:0 auto"></span></div>'; return; }
  const ev = a.events || [];
  const count = t => ev.filter(e => e.type === t).length;
  const pts = a.ledger.reduce((s, p) => s + (p.pointsEst || 0), 0);
  root.innerHTML = `
  <div class="sechead" style="margin-top:14px"><div><span class="eyebrow">Receipts</span><h2>Everything the agent did, with proof</h2><p>Every trade links to Robinhood Chain. Every hold shows SERV Reasoning's reason. Points and decay are estimates.</p></div>${a.agent.addressUrl ? `<a class="btn ghost sm" href="${esc(a.agent.addressUrl)}" target="_blank" rel="noopener">Agent wallet on explorer</a>` : ''}</div>
  <div class="stats" style="margin:0 0 20px">
    <div class="stat"><div class="v lime">${count('trade')}</div><div class="k">Trades onchain</div></div>
    <div class="stat"><div class="v">${count('simulated')}</div><div class="k">Dry runs</div></div>
    <div class="stat"><div class="v">${count('held')}</div><div class="k">Held by SERV</div></div>
    <div class="stat"><div class="v">${pts ? compact(pts) : 'n/a'}</div><div class="k">Est. points so far</div></div>
    <div class="stat"><div class="v">${usd(a.totals.decayPaidUsd || 0)}</div><div class="k">Est. decay paid</div></div>
  </div>
  <div class="agent-grid">
    <div class="card panel"><h3>Activity</h3><p class="sub">Newest first.</p>${ev.length ? `<div class="timeline">${ev.map(eventHtml).join('')}</div>` : '<div class="empty"><img src="/art/empty-state.svg" alt=""><b>Nothing yet</b>When the agent acts or SERV holds off, it shows up here.</div>'}</div>
    <div class="card panel"><h3>Points ledger</h3><p class="sub">Positions the agent holds onchain, with estimated points so far. Estimates, not promises.</p>${a.ledger.length ? ledgerHtml(a.ledger) : '<div class="empty" style="padding:20px"><b>No positions yet</b>The first live trade opens one.</div>'}</div>
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
    { i: '↘', q: 'Which YTs are near their floor right now?' },
    { i: '↗', q: 'Where is the most room to run with a month or more left?' },
    { i: '◉', q: `Is YT-${named ? named.name : 'NVDA'} a good entry right now?` },
    { i: '⛓', q: 'Anything on Robinhood Chain worth watching?', chain: String(RH) },
    { i: '✦', q: 'Where are points cheapest to farm right now?' },
  ];
}
function renderSuggestions() {
  if (!$('#askSugg')) return;
  $('#askSugg').innerHTML = askSuggestions().map((x, i) => `<button type="button" data-sugg="${i}"><i>${x.i}</i>${esc(x.q)}</button>`).join('');
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
const gaugeHtml = m => `<div class="gz">${bandHtml(m, { labels: false })}<div class="gz-l"><span>Cheapest in ${span(m)} days</span><span>Priciest</span></div></div>`;

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
    <div class="ph-top"><span class="rank">#1 pick</span>${m ? `<div class="coin" style="${coinStyle(m.name)}">${esc(initials(m.name))}</div>` : ''}<div class="ph-name"><div class="nm">${esc(m ? `YT-${m.name}` : p.name)}</div><div class="sub">${m ? `${esc(m.chainName)} · ${usd(m.liquidityUsd)} liquidity` : ''}</div></div><span class="vpill ${v.k}">${v.t}</span></div>
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
function pickLines(x, p, w, max) { x.font = '400 25px "DM Sans"'; return wrapLines(x, p.one_liner, w - 56, max); }
const pickHeight = (x, p, w, max) => 28 + 46 + 14 + pickLines(x, p, w, max).length * 34 + 22 + 30 + 34;
function drawPick(x, p, i, X, Y, w, h, max) {
  const m = p.market, v = verdictOf(m), col = VCOL[v.k];
  rr(x, X, Y, w, h, 26); x.fillStyle = '#12140F'; x.fill();
  x.strokeStyle = i === 0 ? hexA(col, 0.5) : 'rgba(234,238,218,0.10)'; x.lineWidth = 2; x.stroke();
  x.textBaseline = 'middle';
  rr(x, X + 28, Y + 28, 46, 46, 13); x.fillStyle = i === 0 ? '#C8F25A' : 'rgba(234,238,218,0.08)'; x.fill();
  x.fillStyle = i === 0 ? '#12160A' : '#F1F2E8'; x.font = '700 22px "JetBrains Mono"'; x.textAlign = 'center'; x.fillText(String(i + 1), X + 51, Y + 52);
  x.textAlign = 'left'; x.fillStyle = '#F1F2E8'; x.font = '700 32px "DM Sans"';
  x.fillText(clipW(x, m ? `YT-${m.name}` : p.name, w - 340), X + 90, Y + 52);
  x.font = '800 20px "DM Sans"';
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
  x.fillStyle = up ? '#C8F25A' : '#A7AB9A'; x.font = '600 30px "JetBrains Mono"';
  x.fillText(r ? (up ? upPct(r.toHigh) : 'At its high') : 'Too new', X + w - 28, gy + 12);
  x.fillStyle = '#6E7263'; x.font = '600 18px "DM Sans"';
  x.fillText(r ? (up ? 'room to run' : 'no room left') : 'no range yet', X + w - 28, gy + 38);
  x.textAlign = 'left';
}
async function answerImage(j) {
  const W = 1080, H = 1350, P = 72, footTop = H - 132;
  const c = document.createElement('canvas'); c.width = W; c.height = H;
  const x = c.getContext('2d');
  await Promise.all(['700 44px "Space Grotesk"', '600 36px "Space Grotesk"', '400 25px "DM Sans"', '500 30px "DM Sans"', '700 32px "DM Sans"', '800 20px "DM Sans"', '600 30px "JetBrains Mono"', '700 22px "JetBrains Mono"'].map(f => document.fonts.load(f).catch(() => null)));
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
  x.font = '700 20px "DM Sans"';
  const label = 'Read by SERV Reasoning', lw = x.measureText(label).width + 62, lx = W - P - lw;
  rr(x, lx, 80, lw, 48, 24); x.fillStyle = '#171A13'; x.fill(); x.strokeStyle = 'rgba(234,238,218,0.16)'; x.lineWidth = 2; x.stroke();
  rr(x, lx + 12, 92, 24, 24, 7); x.fillStyle = '#C8F25A'; x.fill();
  x.fillStyle = '#12160A'; x.font = '800 15px "Space Grotesk"'; x.textAlign = 'center'; x.fillText('S', lx + 24, 105);
  x.textAlign = 'left'; x.fillStyle = '#F1F2E8'; x.font = '700 20px "DM Sans"'; x.fillText(label, lx + 46, 105);
  // question and headline
  x.textBaseline = 'top';
  let y = 196;
  x.fillStyle = '#C8F25A'; x.font = '800 20px "DM Sans"';
  if ('letterSpacing' in x) x.letterSpacing = '3px';
  x.fillText('YOU ASKED', P, y);
  if ('letterSpacing' in x) x.letterSpacing = '0px';
  y += 36;
  x.fillStyle = '#A7AB9A'; x.font = '500 30px "DM Sans"';
  for (const l of wrapLines(x, `“${j.question}”`, W - 2 * P, 2)) { x.fillText(l, P, y); y += 40; }
  y += 20;
  x.fillStyle = '#F1F2E8'; x.font = '600 36px "Space Grotesk"';
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
  x.fillStyle = '#C8F25A'; x.font = '600 26px "JetBrains Mono"';
  x.fillText(location.hostname === 'localhost' ? 'bandit-bands.vercel.app' : location.host, P, footTop + 56);
  x.fillStyle = '#6E7263'; x.font = '500 20px "DM Sans"'; x.fillText('Data and reasoning only. Not financial advice.', P, footTop + 92);
  x.textAlign = 'right';
  x.fillStyle = '#A7AB9A'; x.font = '600 21px "DM Sans"'; x.fillText('The YT trading agent that works while you sleep', W - P, footTop + 56);
  x.fillStyle = '#6E7263'; x.font = '500 20px "DM Sans"'; x.fillText(`${new Date(j.at).toUTCString().slice(5, 16)} · live Pendle data`, W - P, footTop + 92);
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
  const icon = state.wallet.info && state.wallet.info.icon ? `<img src="${esc(state.wallet.info.icon)}" alt="">` : '<span class="am-ic">◆</span>';
  return `<div class="am-head">${icon}<div><b>${esc(shortAddr(addr))}</b><span>${state.me ? 'Signed in. Your agent keeps working while you are away.' : 'Wallet connected. No agent yet.'}</span></div></div>
    ${state.me ? '<a class="am-item" href="#/my"><i>◉</i>My agent</a>' : '<button class="am-item" data-am="create"><i>◉</i>Create my free agent</button>'}
    <a class="am-item" href="#/ask"><i>✦</i>Ask BANDIT</a>
    <button class="am-item" data-am="copy"><i>⧉</i>Copy address</button>
    <button class="am-item" data-am="switch"><i>⇄</i>Use a different wallet</button>
    <button class="am-item danger" data-am="disconnect"><i>⏻</i>Disconnect</button>`;
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
    el.textContent = b == null ? 'Balance unavailable' : `You have ${b.toFixed(5)} ETH on Robinhood Chain${dollars != null ? ` (${usd(dollars)})` : ''}`;
    if (dollars != null && dollars < 5 && $('#lowBal')) $('#lowBal').innerHTML = `<div class="callout" style="margin-bottom:14px"><span class="ic">◆</span><div><b>Not enough on Robinhood Chain to trade yet.</b> Bridge a little ETH there first (Relay supports Robinhood Chain), or practice with $1,000 of paper money in your own agent.<div style="display:flex;gap:8px;margin-top:10px;flex-wrap:wrap"><a class="btn soft xs" href="https://relay.link/bridge" target="_blank" rel="noopener">Bridge with Relay</a><a class="btn primary xs" href="#/my" data-close>Practice with my agent</a></div></div></div>`;
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
    ${ok ? `<button class="btn primary" id="tSign">Sign in ${esc((state.wallet.info && state.wallet.info.name) || 'wallet')} <span class="arr">→</span></button><p class="help" style="margin-top:8px">Your wallet switches to Robinhood Chain and shows the exact transaction before you sign. Data and reasoning only, not financial advice.</p>` : '<p class="help">BANDIT only passes trades that SERV Reasoning confirms and the 5% price-impact cap allows. Try a smaller size or another market.</p>'}
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
  if (state.route !== 'my') return;
  if (!state.me) { renderMy(); return; }
  try {
    const st = await meApi('status');
    state.meStatus = st;
    const sig = JSON.stringify([st.rules, st.lastRun && st.lastRun.at, st.events[0] && st.events[0].id, st.paper, st.approvals, st.telegram]);
    const editing = $('#myRuleForm') && $('#myRuleForm').contains(document.activeElement);
    if (!state.live.playing && !editing && sig !== state.meSig) { state.meSig = sig; renderMy(); }
    const m = location.hash.match(/approve=([a-z0-9_]+)/i);
    if (m) {
      const a = st.approvals.find(x => x.id === m[1]);
      history.replaceState(null, '', '#/my');
      if (a) { state.trade.size = a.usd; openTrade(a.marketId); toast('SERV confirmed this trade. Review it and sign in your wallet.', 'ok'); }
    }
  } catch (e) {
    if (!state.me) renderMy(); else toast(e.message, 'err');
  }
  if (state.route === 'my') meTimer = setTimeout(loadMe, 60_000);
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
  const icon = { paper: '◌', approval: '✍', held: '⏸', rule: '⚑' }[e.type] || '•';
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
      <button class="btn soft xs" id="mySignOut">Disconnect</button>
    </div>
  </div>
  ${!st.rules.length && firstMovePick() ? (() => { const f = firstMovePick(); return `<div class="card first-move"><img src="/art/mascot.svg" alt=""><div><span class="eyebrow">Your first move</span><h3>Let your agent watch YT-${esc(f.name)}</h3><p>${esc(plainBand(f))} If it gets back to its ${Math.min(90, f.band.days)}-day high it would be worth ${upPct(f.range.toHigh)}, and it has ${f.daysToMaturity} days to get there. A good first thing to watch.</p><div class="acts-row"><button class="btn primary" data-quick="${esc(f.id)}">Watch it: buy $100 when it's cheap <span class="arr">→</span></button><button class="btn soft sm" id="myCustom">I'll build my own rule</button></div><p class="help">Practice money only. Your agent checks every 10 minutes, and SERV Reasoning has to agree before it buys.</p></div></div>`; })() : ''}
  ${st.approvals.length ? `<div class="card panel" style="margin-top:14px;border-color:rgba(200,242,90,.35)"><h3>Waiting for your signature</h3><p class="sub">SERV Reasoning confirmed these on Robinhood Chain. Nothing moves until you sign in your own wallet.</p><div class="rules">${st.approvals.map(a => `<div class="rule"><span class="ico">✍</span><div><div class="d">Enter $${a.usd} of ${esc(a.name)}</div><div class="r">${clean(a.reason)}</div></div><div class="rule-acts"><button class="btn primary xs" data-approve="${esc(a.id)}">Review and sign</button></div></div>`).join('')}</div></div>` : ''}
  <div class="agent-grid">
    <div>
      <div class="card live-card">
        <h3>Agent Live <span class="serv-badge"><span class="sd">S</span>Every decision by <b>SERV Reasoning</b></span></h3>
        <p class="sub">Watch your agent think, step by step. It wakes every 10 minutes on its own, or right now with Wake my agent.</p>
        ${pipelineHtml()}
        <div class="live-buddy"><div class="buddy sleep" id="buddy"><img src="/art/mascot.svg" alt="BANDIT"><div class="zzz"><span>z</span><span>z</span><span>Z</span></div></div><div class="bubble" id="bubble">${active.length ? 'Asleep. I check your rules every 10 minutes.' : 'Arm a rule below and I will start watching.'}</div></div>
        <div class="mkt-strip" id="mktStrip"></div>
        <div class="console" id="console"><div class="empty">No runs yet. Arm a rule, then press Wake my agent.</div></div>
        <div class="live-actions"><button class="btn primary sm" id="myRun2">Wake my agent</button><button class="btn soft sm" id="myReplay" ${st.lastRun && st.lastRun.steps && st.lastRun.steps.length ? '' : 'disabled'}>Replay last run</button><span class="when">${st.lastRun ? `Last run ${ago(st.lastRun.at)} · ${esc(st.lastRun.source)}` : ''}</span></div>
      </div>
      <div class="card panel" style="margin-top:14px">
        <h3>My rules</h3>
        <p class="sub">Up to 5 active rules. Each one fires once, then you can arm the next.</p>
        <div class="rules">${st.rules.length ? st.rules.map(r => `<div class="rule"><span class="ico">⚑</span><div><div class="d">${clean(r.description)}</div><div class="r">${r.lastResult ? clean(r.lastResult) : 'Not checked yet.'}${r.lastCheckedAt ? ` · checked ${ago(r.lastCheckedAt)}` : ''}</div></div><div class="rule-acts"><span class="st ${esc(r.status)}">${esc(r.status)}</span><button class="btn soft xs" data-mydel="${esc(r.id)}">Delete</button></div></div>`).join('') : '<div class="empty" style="padding:14px"><img src="/art/empty-state.svg" alt="" style="width:120px"><b>No rules yet</b>Pick a YT near the floor of its range to start.</div>'}</div>
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
  if (st.lastRun && st.lastRun.steps && st.lastRun.steps.length) showRunStatic(st.lastRun);
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
    toast('Rule armed. Your agent checks it every 10 minutes, or press Run my agent.', 'ok');
    state.meSig = '';
    await loadMe();
  } catch (e) {
    $('#mErr').textContent = e.message; $('#mErr').classList.remove('hidden');
  } finally { if ($('#myRuleCreate')) $('#myRuleCreate').disabled = false; }
}

async function runMine() {
  const btns = ['#myRun', '#myRun2'].map(x => $(x)).filter(Boolean);
  btns.forEach(b => { b.disabled = true; });
  const token = ++state.live.token;
  state.live.playing = true;
  wake(true); say('Waking up. Checking your rules…');
  resetPipeline(); setNode(0, { stage: 'scan' });
  $('#console').innerHTML = '<div class="ln"><span class="st scan">scan</span><div class="lt">Waking up and scanning Pendle markets<span class="thinking-dots"><i></i><i></i><i></i></span></div></div>';
  const hint = setTimeout(() => { if (token === state.live.token) { flowWires(0, 3); setNode(3, { stage: 'serv' }); say('Let me ask SERV Reasoning about this one…'); } }, 2800);
  try {
    const run = await meApi('run');
    clearTimeout(hint); state.live.playing = false;
    await playRun(run);
    state.meSig = '';
    await loadMe();
  } catch (e) {
    clearTimeout(hint); state.live.playing = false; resetPipeline(); wake(false); say(e.message, 'no'); toast(e.message, 'err');
  } finally { btns.forEach(b => { b.disabled = false; }); }
}

function handleMyClick(e) {
  const q = sel => e.target.closest(sel);
  let el;
  if ((el = q('[data-mywallet]'))) { signInWith(state.walletList[Number(el.dataset.mywallet)]); return true; }
  if (q('#myRun') || q('#myRun2')) { runMine(); return true; }
  if (q('#myReplay')) { if (state.meStatus && state.meStatus.lastRun) playRun(state.meStatus.lastRun); return true; }
  if (q('#myRuleCreate')) { createMyRule(); return true; }
  if ((el = q('[data-mydel]'))) { meApi('delete-rule', { id: el.dataset.mydel }).then(() => { state.meSig = ''; loadMe(); }).catch(err => toast(err.message, 'err')); return true; }
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
  if ((el = q('[data-chain]'))) { state.chain = el.dataset.chain; renderChains(); renderBoard(); return; }
  if ((el = q('[data-farmchain]'))) { state.farmChain = el.dataset.farmchain; $$('#farmFilters .chip').forEach(c => c.classList.toggle('on', c === el)); renderFarm(); return; }
  if ((el = q('#boardHead [data-sort]'))) { const k = el.dataset.sort; state.sort = state.sort.key === k ? { key: k, dir: -state.sort.dir } : { key: k, dir: ['name', 'pct'].includes(k) ? 1 : -1 }; renderBoard(); return; }
  if ((el = q('[data-toggle]'))) return ownerAction({ action: 'toggle-rule', id: el.dataset.toggle });
  if ((el = q('[data-del]'))) return ownerAction({ action: 'delete-rule', id: el.dataset.del });
  if ((el = q('[data-wallet]'))) return connectWallet(state.walletList[Number(el.dataset.wallet)]);
  if (q('#runNow') || q('#runNow2')) return runNow();
  if (q('#replay')) return state.agent && state.agent.lastRun && playRun(state.agent.lastRun);
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
document.addEventListener('keydown', e => {
  if (e.key === 'Escape') { closeAll(); closeMenu(); }
  if ((e.key === 'Enter' || e.key === ' ') && e.target.matches && e.target.matches('.row[data-ask]')) { e.preventDefault(); openAsk(e.target.dataset.ask); }
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
