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
  const r = { bands: 'bands', agent: 'agent', receipts: 'receipts', my: 'my' }[h] || 'farm';
  const changed = r !== state.route;
  state.route = r;
  $$('.view').forEach(v => v.classList.toggle('on', v.id === `view-${r}`));
  $$('[data-route]').forEach(a => a.classList.toggle('on', a.dataset.route === r));
  if (h === 'farm-board') setTimeout(() => $('#farm-board').scrollIntoView({ behavior: 'smooth' }), 40);
  else if (changed) window.scrollTo({ top: 0 });
  // Only one Agent Live pipeline lives in the DOM at a time (they share element ids).
  if (r !== 'agent') $('#agentRoot').innerHTML = '';
  if (r !== 'my') $('#myRoot').innerHTML = '';
  if (r === 'agent') { state.agentSig = ''; renderAgent(); }
  if (r === 'my') { state.meSig = ''; renderMy(); loadMe(); }
  if (r === 'receipts') renderReceipts();
  if (r === 'agent' || r === 'receipts') loadAgent();
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
  ? `<span class="pct ${zone(m.band.percentile)}">P${Math.round(m.band.percentile)}</span> <span class="faint">${zoneLabel(m.band.percentile)} of its ${m.band.days < 90 ? `${m.band.days}-day` : '90-day'} band</span>`
  : `<span class="pct forming">${m.band.status === 'forming' ? `Band forming, day ${m.band.days} of 14` : 'No band history'}</span>`;
const readyUp = el => el && requestAnimationFrame(() => requestAnimationFrame(() => el.classList.add('ready')));

/* ---------- farm view ---------- */
const statusCls = s => s === 'confirmed points' ? 'confirmed' : s === 'speculative airdrop' ? 'speculative' : 'none';
const statusLabel = s => s === 'confirmed points' ? 'Confirmed points' : s === 'speculative airdrop' ? 'Speculative airdrop' : 'None known';
// Cheapest points first; ties (for example several free ones) go to whichever earns more points per dollar.
const byCheapest = (a, b) => a.points.costPer1k - b.points.costPer1k || (b.points.pointsPerDollar || 0) - (a.points.pointsPerDollar || 0);
const tradable = m => m.chainId === RH && !m.distorted && (!state.agent || state.agent.allowlist.some(a => a.id === m.id));

const upPct = x => (x == null || !isFinite(x)) ? 'n/a' : `${x >= 0 ? '+' : ''}${(x * 100).toFixed(x !== 0 && Math.abs(x) < 0.1 ? 1 : 0)}%`;
const rangeLine = m => m.range ? `${upPct(m.range.toHigh)} to its 90-day high · ${upPct(m.range.toLow)} to its low` : (m.band.status === 'forming' ? `Band forming, day ${m.band.days} of 14` : 'No band history yet');

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
    <div class="acts"><button class="btn soft xs" data-ask="${esc(m.id)}">Ask BANDIT</button><button class="btn soft xs" data-alert="${esc(m.id)}">Alert me</button>${tradable(m) ? `<button class="btn primary xs" data-trade="${esc(m.id)}">Trade</button>` : ''}${p.guideUrl ? `<a class="guide" href="${esc(p.guideUrl)}" target="_blank" rel="noopener">Read the guide →</a>` : ''}</div>
  </article>`;
}

function signalCard(cls, eyebrow, m, headline, body) {
  return `<article class="card sig ${cls}" data-ask="${esc(m.id)}"><div class="glow"></div>
    <div class="eyebrow-s"><span class="pip"></span>${eyebrow}</div>
    <div class="sig-top"><div class="coin" style="${coinStyle(m.name)}">${esc(initials(m.name))}</div><div><div class="nm">YT-${esc(m.name)}</div><div class="sub">${esc(m.chainName)} · ${m.daysToMaturity}d left · ${usd(m.liquidityUsd)}</div></div></div>
    <div class="sig-big">${headline}</div>
    ${bandHtml(m)}
    <p class="why">${body}</p>
    <span class="cta">Ask BANDIT about it <span class="arr">→</span></span></article>`;
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
    <span class="hide-m hide-l"><span class="badge chain c${m.chainId}">${esc(m.chainName)}</span></span>
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
    renderFarm(); renderChains(); renderBoard(); fillMarketSelects();
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
  if (state.route === 'agent' || state.route === 'receipts') agentTimer = setTimeout(loadAgent, 20_000);
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

/* ---------- Ask BANDIT ---------- */
function openAsk(marketId) {
  const m = marketId && state.byId.get(marketId);
  $('#askFocus').value = m ? m.id : '';
  if (m) $('#askQ').value = `How do the points on YT-${m.name} (${m.chainName}) compare, and what are the trade-offs at my size?`;
  openLayer('#askSheet');
}
function pickHtml(p, i) {
  const m = p.market;
  return `<li class="pick"><span class="rk">${i + 1}</span><div>
    <div class="pt"><div><div class="pn">${clean(m ? 'YT-' + m.name : p.name)}</div><div class="pm">${m ? `${esc(m.chainName)} · ${shortDate(m.expiry)} · ${m.daysToMaturity}d · ${usd(m.liquidityUsd)}` : ''}</div></div>${p.lens ? `<span class="lens">${clean(p.lens)}</span>` : ''}</div>
    ${m ? bandHtml(m) : ''}
    <dl class="kv">
      ${p.band_read ? `<dt>Band</dt><dd>${clean(p.band_read)}</dd>` : ''}
      ${p.points_read ? `<dt>Points</dt><dd>${clean(p.points_read)}</dd>` : ''}
      ${p.why_it_fits ? `<dt>Why it fits</dt><dd>${clean(p.why_it_fits)}</dd>` : ''}
      ${p.trade_offs ? `<dt>Trade-offs</dt><dd>${clean(p.trade_offs)}</dd>` : ''}
      ${(p.watch || []).length ? `<dt>Watch</dt><dd><div class="watch">${p.watch.map(w => `<span>${clean(w)}</span>`).join('')}</div></dd>` : ''}
    </dl></div></li>`;
}
function renderAnswer(j, ms) {
  const a = j.answer;
  let html = '';
  if (a) {
    html += `<div class="ans-headline">${clean(a.headline)}</div>`;
    if (a.ranked && a.ranked.length) html += `<div class="ans-sec">Ranked read · goal ${esc(j.goal)} · ${esc(j.risk)} risk</div><ol class="picks">${a.ranked.map(pickHtml).join('')}</ol>`;
    if (a.main_risks && a.main_risks.length) html += `<div class="ans-sec">Main risks</div><div class="risks">${a.main_risks.map(r => `<div class="risk"><span class="nd"></span><div><b>${clean(r.risk)}.</b> ${clean(r.detail)}</div></div>`).join('')}</div>`;
    if (a.note) html += `<p class="help" style="margin-top:14px">${clean(a.note)}</p>`;
  } else {
    html += `<p class="help" style="white-space:pre-wrap;color:var(--text-2)">${clean(j.raw || '')}</p>`;
  }
  html += `<div class="ans-meta"><span class="serv-badge"><span class="sd">S</span>Answered by <b>SERV Reasoning</b></span><span>model ${esc(j.model)}</span><span>${(ms / 1000).toFixed(1)}s</span><span>${j.marketsSent} markets</span>${j.excluded ? `<span>${j.excluded} distorted left out</span>` : ''}<span>Not financial advice</span></div>`;
  const el = $('#answer');
  el.classList.remove('ready');
  el.innerHTML = html;
  readyUp(el);
}
async function ask(e) {
  e.preventDefault();
  const size = num($('#askSize').value);
  const err = $('#askErr');
  if (!(size > 0)) { err.textContent = 'Enter a position size in USD.'; err.classList.remove('hidden'); return; }
  err.classList.add('hidden');
  const btn = $('#askBtn');
  btn.disabled = true;
  const t0 = performance.now();
  $('#answer').innerHTML = '<div class="thinking"><img src="/art/mascot.svg" alt=""><div><b>SERV Reasoning is reading the board</b><span id="askT">0s</span></div></div>';
  const tick = setInterval(() => { const el = $('#askT'); if (el) el.textContent = `${Math.round((performance.now() - t0) / 1000)}s`; }, 500);
  try {
    const j = await api('/api/ask', { method: 'POST', body: { sizeUsd: size, risk: segVal($('#askRisk')), goal: segVal($('#askGoal')), question: $('#askQ').value.trim(), chain: $('#askChain').value, marketId: $('#askFocus').value || undefined } });
    renderAnswer(j, performance.now() - t0);
  } catch (e2) {
    $('#answer').innerHTML = `<div class="ans-err"><b>SERV Reasoning did not return an answer.</b>${esc(e2.message)}<br>BANDIT never falls back to another model.</div>`;
  } finally {
    clearInterval(tick); btn.disabled = false;
  }
}

/* ---------- Trade with BANDIT (user's own wallet) ---------- */
window.addEventListener('eip6963:announceProvider', e => {
  const { info, provider } = e.detail || {};
  if (!info || !provider || state.providers.some(p => p.info.uuid === info.uuid)) return;
  state.providers.push({ info, provider });
  if ($('#tradeSheet').classList.contains('on') && !state.wallet.address) renderTrade();
});
window.dispatchEvent(new Event('eip6963:requestProvider'));

const tradeMarkets = () => (state.data ? state.data.markets : []).filter(tradable);
function openTrade(marketId) {
  if (marketId) state.trade.marketId = marketId;
  state.trade.review = null;
  renderTrade();
  openLayer('#tradeSheet');
}
function updateWalletBtn() { $('#walletBtn').textContent = state.wallet.address ? shortAddr(state.wallet.address) : 'Connect wallet'; }
async function fetchBalance(address) {
  try {
    const r = await fetch(WALLET_CHAIN.rpcUrls[0], { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ jsonrpc: '2.0', id: 1, method: 'eth_getBalance', params: [address, 'latest'] }) });
    const j = await r.json();
    return parseInt(j.result, 16) / 1e18;
  } catch { return null; }
}
function renderTrade() {
  const t = state.trade, w = state.wallet, body = $('#tradeBody');
  if (!w.address) {
    const list = state.providers.length ? state.providers : (window.ethereum ? [{ info: { uuid: 'injected', name: 'Browser wallet', icon: '' }, provider: window.ethereum }] : []);
    state.walletList = list;
    body.innerHTML = `<p class="help" style="margin-bottom:14px">Connect Rabby, MetaMask or any browser wallet. BANDIT builds the Pendle trade, SERV Reasoning reviews it, and you sign it yourself on Robinhood Chain. BANDIT never holds your funds.</p>
      ${list.length ? `<div class="wallets">${list.map((p, i) => `<button class="wallet-btn" data-wallet="${i}">${p.info.icon ? `<img src="${esc(p.info.icon)}" alt="">` : '<span style="width:28px;height:28px;border-radius:7px;display:grid;place-items:center;background:var(--lime-dim);color:var(--lime)">◆</span>'}${esc(p.info.name)}</button>`).join('')}</div>` : '<div class="callout"><span class="ic">◆</span><div><b>No browser wallet found.</b> Install Rabby or MetaMask, then reload. You can still browse, Ask BANDIT, and set Telegram alerts without a wallet.</div></div>'}`;
    return;
  }
  const ms = tradeMarkets();
  if (!t.marketId || !ms.some(m => m.id === t.marketId)) t.marketId = ms[0] && ms[0].id;
  const m = state.byId.get(t.marketId);
  let html = `<div class="check ok" style="margin-bottom:16px"><span class="tick">✓</span><div>${esc((w.info && w.info.name) || 'Wallet')} · ${esc(shortAddr(w.address))}<small id="walletBal">Checking your balance on Robinhood Chain…</small></div><button class="btn soft xs" id="walletOff" style="margin-left:auto">Disconnect</button></div>`;
  if (!ms.length) { body.innerHTML = html + '<div class="callout"><span class="ic">!</span><div>No Robinhood Chain market passes the outlier guard right now.</div></div>'; return; }
  html += `<div class="form">
    <label class="fld"><span class="fl">Market</span><select class="inp" id="tMarket">${ms.map(x => `<option value="${esc(x.id)}" ${x.id === t.marketId ? 'selected' : ''}>YT-${esc(x.name)} · ${x.daysToMaturity}d left · ${formed(x) ? `P${Math.round(x.band.percentile)}, ${x.range ? upPct(x.range.toHigh) + ' to high' : ''}` : 'band forming'}</option>`).join('')}</select></label>
    ${m ? `<div class="card" style="padding:14px">${bandHtml(m)}<div style="margin-top:8px;font-size:12px">${pctLabel(m)}</div>${m.points && m.points.note ? `<p class="help" style="margin-top:8px">${clean(m.points.note)}</p>` : ''}</div>` : ''}
    <div class="row2"><label class="fld"><span class="fl">Size</span><span class="money"><input class="inp" id="tSize" inputmode="decimal" value="${esc(t.size || 10)}"></span></label>
    <label class="fld"><span class="fl">Max slippage</span><select class="inp" id="tSlip"><option value="0.005">0.5%</option><option value="0.01" selected>1%</option><option value="0.02">2%</option><option value="0.03">3%</option></select></label></div>
    <div><button class="btn primary" id="tReview">Review with SERV <span class="arr">→</span></button></div>
  </div><div id="tResult" style="margin-top:18px"></div>`;
  body.innerHTML = html;
  readyUp(body);
  fetchBalance(w.address).then(b => { const el = $('#walletBal'); if (el) el.textContent = b == null ? 'Balance unavailable' : `${b.toFixed(5)} ETH on Robinhood Chain${state.data && state.data.ethUsd ? ` · ${usd(b * state.data.ethUsd)}` : ''}`; });
  if (t.review) renderReview();
}
async function connectWallet(p) {
  if (!p) return;
  try {
    const accounts = await p.provider.request({ method: 'eth_requestAccounts' });
    state.wallet = { provider: p.provider, info: p.info, address: accounts[0] };
    if (p.provider.on) p.provider.on('accountsChanged', acc => { state.wallet.address = acc[0] || null; state.trade.review = null; updateWalletBtn(); renderTrade(); });
    updateWalletBtn();
    renderTrade();
  } catch (e) {
    toast(e.message || 'The wallet did not connect.', 'err');
  }
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
  try {
    if (!state.wallet.address || state.wallet.provider !== p.provider) await connectWallet(p);
    const address = state.wallet.address;
    if (!address) return;
    const { nonce, message } = await meApi('nonce', { address });
    toast('Sign the message in your wallet. It is free and moves no funds.');
    const signature = await state.wallet.provider.request({ method: 'personal_sign', params: [toHexUtf8(message), address] });
    const session = await meApi('verify', { address, nonce, signature });
    state.me = session;
    store.set('bandit.me', JSON.stringify(session));
    toast('Your agent is ready with $1,000 of paper money.', 'ok');
    state.meSig = '';
    await loadMe();
  } catch (e) {
    toast(e.message || 'Sign-in was cancelled.', 'err');
  }
}

async function loadMe() {
  clearTimeout(meTimer);
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
  if (state.route === 'my') meTimer = setTimeout(loadMe, 20_000);
}

function myRuleBuilderHtml() {
  const ms = (state.data ? state.data.markets : []).filter(m => !m.distorted && formed(m))
    .sort((a, b) => ((b.range && b.range.ratio) || 0) - ((a.range && a.range.ratio) || 0));
  const opt = m => `<option value="${esc(m.id)}" data-rh="${m.chainId === RH ? 1 : 0}">YT-${esc(m.name)} · ${esc(m.chainName)} · P${Math.round(m.band.percentile)}${m.range ? ` · ${upPct(m.range.toHigh)} to high` : ''}</option>`;
  return `<div class="card" style="margin-top:14px;padding:16px;background:var(--bg-2)"><div class="form" id="myRuleForm">
    <label class="fld"><span class="fl">Market</span><select class="inp" id="mMarket">${ms.map(opt).join('')}</select></label>
    <div class="row2">
      <div class="fld"><span class="fl">Trigger when band is</span><div class="seg" id="mDir"><button type="button" data-v="below" class="on lo">Below</button><button type="button" data-v="above" class="hi">Above</button></div></div>
      <label class="fld"><span class="fl">Percentile <em id="mPctV">P25</em></span><input type="range" id="mPct" min="1" max="99" value="25"></label>
    </div>
    <div class="row2">
      <div class="fld"><span class="fl">Action</span><div class="seg" id="mAction"><button type="button" data-v="enter" class="on">Enter YT</button><button type="button" data-v="exit">Exit YT</button></div></div>
      <label class="fld"><span class="fl">Size</span><span class="money"><input class="inp" id="mSize" inputmode="decimal" value="100"></span></label>
    </div>
    <div class="fld"><span class="fl">Mode</span><div class="seg" id="mMode"><button type="button" data-v="paper" class="on">Paper (fully autonomous)</button><button type="button" data-v="approve">One-tap approve</button></div></div>
    <p class="help" id="mModeHelp">Paper: your agent trades $1,000 of paper money on its own at Pendle's live prices, only when SERV Reasoning confirms.</p>
    <div class="err-line hidden" id="mErr"></div>
    <div><button class="btn primary sm" type="button" id="myRuleCreate">Arm this rule</button></div>
  </div></div>`;
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
      <div><h2>Your own BANDIT agent</h2><p class="muted" style="margin:8px 0 14px;max-width:560px">Sign in with any wallet and get a personal agent with <b style="color:var(--text)">$1,000 of paper money</b>. Arm rules on any Pendle YT and it trades on its own, with real SERV Reasoning decisions and live prices. Switch a rule to one-tap approve and it asks you to sign real trades on Robinhood Chain from your own wallet.</p>
        ${list.length ? `<div class="wallets" style="max-width:420px">${list.map((p, i) => `<button class="wallet-btn" data-mywallet="${i}">${p.info.icon ? `<img src="${esc(p.info.icon)}" alt="">` : '<span style="width:28px;height:28px;border-radius:7px;display:grid;place-items:center;background:var(--lime-dim);color:var(--lime)">◆</span>'}Sign in with ${esc(p.info.name)}</button>`).join('')}</div>` : '<div class="callout" style="max-width:560px"><span class="ic">◆</span><div><b>No browser wallet found.</b> Install Rabby or MetaMask to create your agent. Everything else on BANDIT works without one.</div></div>'}
        <p class="help" style="margin-top:10px">Signing in is a free message signature: no gas, no funds, no approvals.</p></div><div></div></div>
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
      <div class="state"><span class="state-pill dry"><i></i>Paper mode · $${p.startUsd.toLocaleString('en-US')} start</span><span class="badge none plain">${esc(shortAddr(st.address))}</span>${st.telegram.linked ? '<span class="badge confirmed">Telegram linked</span>' : ''}</div>
      <div class="agent-stats">
        <div class="stat"><div class="v">$${Number(p.totalUsd).toLocaleString('en-US', { maximumFractionDigits: 2 })}</div><div class="k">Portfolio value</div></div>
        <div class="stat"><div class="v" style="color:${pnlColor}">${p.pnlUsd >= 0 ? '+' : ''}$${Math.abs(p.pnlUsd).toFixed(2)}</div><div class="k">P&amp;L (${p.pnlPct >= 0 ? '+' : ''}${p.pnlPct}%)</div></div>
        <div class="stat"><div class="v">$${Number(p.cashUsd).toLocaleString('en-US', { maximumFractionDigits: 2 })}</div><div class="k">Paper cash</div></div>
        <div class="stat"><div class="v">${active.length}</div><div class="k">Rules armed</div></div>
      </div>
    </div>
    <div class="hero-acts" style="display:flex;flex-direction:column;gap:8px">
      <button class="btn primary" id="myRun">Run my agent <span class="arr">→</span></button>
      ${st.telegram.linked ? '' : `<button class="btn tg sm" id="myTg" ${st.telegram.bot ? '' : 'disabled'}>Connect Telegram</button>`}
      <button class="btn soft xs" id="mySignOut">Sign out</button>
    </div>
  </div>
  ${st.approvals.length ? `<div class="card panel" style="margin-top:14px;border-color:rgba(200,242,90,.35)"><h3>Waiting for your signature</h3><p class="sub">SERV Reasoning confirmed these on Robinhood Chain. Nothing moves until you sign in your own wallet.</p><div class="rules">${st.approvals.map(a => `<div class="rule"><span class="ico">✍</span><div><div class="d">Enter $${a.usd} of ${esc(a.name)}</div><div class="r">${clean(a.reason)}</div></div><div class="rule-acts"><button class="btn primary xs" data-approve="${esc(a.id)}">Review and sign</button></div></div>`).join('')}</div></div>` : ''}
  <div class="agent-grid">
    <div>
      <div class="card live-card">
        <h3>Agent Live <span class="serv-badge"><span class="sd">S</span>Every decision by <b>SERV Reasoning</b></span></h3>
        <p class="sub">Your agent's runs, step by step. It wakes every 10 minutes on its own; Run my agent wakes it now.</p>
        ${pipelineHtml()}
        <div class="live-buddy"><div class="buddy sleep" id="buddy"><img src="/art/mascot.svg" alt="BANDIT"><div class="zzz"><span>z</span><span>z</span><span>Z</span></div></div><div class="bubble" id="bubble">${active.length ? 'Asleep. I check your rules every 10 minutes.' : 'Arm a rule below and I will start watching.'}</div></div>
        <div class="mkt-strip" id="mktStrip"></div>
        <div class="console" id="console"><div class="empty">No runs yet. Arm a rule, then press Run my agent.</div></div>
        <div class="live-actions"><button class="btn primary sm" id="myRun2">Run my agent</button><button class="btn soft sm" id="myReplay" ${st.lastRun && st.lastRun.steps && st.lastRun.steps.length ? '' : 'disabled'}>Replay last run</button><span class="when">${st.lastRun ? `Last run ${ago(st.lastRun.at)} · ${esc(st.lastRun.source)}` : ''}</span></div>
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
  bindSeg($('#mDir')); bindSeg($('#mAction'));
  bindSeg($('#mMode'), v => { $('#mModeHelp').textContent = v === 'approve' ? 'One-tap approve: when your rule fires and SERV Reasoning confirms, you get a link to review and sign the real trade in your own wallet. Robinhood Chain markets only.' : "Paper: your agent trades $1,000 of paper money on its own at Pendle's live prices, only when SERV Reasoning confirms."; });
  $('#mPct').addEventListener('input', e => { $('#mPctV').textContent = `P${e.target.value}`; });
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
  if (q('#mySignOut')) { state.me = null; state.meStatus = null; store.set('bandit.me', null); renderMy(); return true; }
  return false;
}

/* ---------- events ---------- */
document.addEventListener('click', e => {
  if (handleMyClick(e)) return;
  const q = sel => e.target.closest(sel);
  let el;
  if ((el = q('[data-ask]'))) return openAsk(el.dataset.ask);
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
  if (q('#walletBtn')) return openTrade();
  if (q('#walletOff')) { state.wallet = { provider: null, info: null, address: null }; state.trade.review = null; updateWalletBtn(); renderTrade(); return; }
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
  if (e.key === 'Escape') closeAll();
  if ((e.key === 'Enter' || e.key === ' ') && e.target.matches && e.target.matches('.row[data-ask]')) { e.preventDefault(); openAsk(e.target.dataset.ask); }
  if (e.key === 'Enter' && e.target.id === 'ownerKey') saveOwner();
});

/* ---------- init ---------- */
bindSeg($('#askGoal'));
bindSeg($('#askRisk'));
bindSeg($('#alertDir'));
$('#alertPct').addEventListener('input', e => { $('#alertPctV').textContent = `P${e.target.value}`; });
$('#askForm').addEventListener('submit', ask);
$('#askSize').addEventListener('blur', e => { const n = num(e.target.value); if (n > 0) e.target.value = n.toLocaleString('en-US', { maximumFractionDigits: 2 }); });
skeletons();
route();
loadMarkets();
setInterval(loadMarkets, 5 * 60 * 1000);
api('/api/agent').then(a => { state.agent = a; updateAgentChrome(); renderFarm(); }).catch(() => {});
