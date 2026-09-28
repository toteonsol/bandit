// "My agent": a personal BANDIT agent for every signed-in visitor.
//   paper mode    trades $1,000 of paper money at Pendle's live YT prices, fully autonomous
//   approve mode  on Robinhood Chain, SERV-confirmed triggers become a one-tap trade the user signs in their own wallet
// Same band triggers and SERV Reasoning gate as the house agent. No custody, no keys.
import { randomBytes } from 'node:crypto';
import { getMarkets, ROBINHOOD_CHAIN_ID } from './pendle.js';
import { redis, getJSON, setJSON, storeReady, takePublicServBudget } from './store.js';
import { servReady, undash } from './serv.js';
import { gate, gateMarket, pointsLine, runBrief, CAPS } from './agent.js';
import { sendTo, botUsername } from './telegram.js';

export const PAPER_START_USD = 1000;
const MAX_RULES = 5;
const COOLDOWN_MS = 3_600_000;
const USERS_ACTIVE = 'bandit:users:active';
const SITE = () => (process.env.PUBLIC_URL || 'https://bandit.web3wikis.com').replace(/\/$/, '');

const key = (addr, name) => `bandit:u:${addr.toLowerCase()}:${name}`;
const r2 = x => (x == null || !Number.isFinite(x) ? null : Math.round(x * 100) / 100);
const RUNS_KEPT = 30;

// Where a YT's price sits against its own history, in words.
function plainWhere(m) {
  const p = m.band.percentile, d = Math.min(90, m.band.days || 0);
  return p >= 97 ? `At its ${d}-day high` : p <= 3 ? `At its ${d}-day low` : p > 50 ? `Pricier than ${Math.round(p)}% of its last ${d} days` : `Cheaper than ${100 - Math.round(p)}% of its last ${d} days`;
}
const today = () => new Date().toISOString().slice(0, 10);

function tracer() {
  const steps = [];
  const t0 = Date.now();
  return { steps, trace: (stage, text, extra = {}) => steps.push({ ms: Date.now() - t0, stage, text: undash(text), ...extra }) };
}

async function logUser(addr, event) {
  const e = { id: `e_${Date.now().toString(36)}${randomBytes(2).toString('hex')}`, at: new Date().toISOString(), ...event };
  await redis('LPUSH', key(addr, 'events'), JSON.stringify(e));
  await redis('LTRIM', key(addr, 'events'), 0, 99);
  return e;
}

export async function ensureUser(addr) {
  const created = await redis('SET', key(addr, 'cash'), PAPER_START_USD, 'NX');
  if (created === 'OK') await logUser(addr, { type: 'rule', text: `Your agent is ready with $${PAPER_START_USD.toLocaleString('en-US')} of paper money.` });
}

export function describeUserRule(r) {
  const act = r.action === 'enter' ? `Buy ${r.sizeUsd} of` : 'Sell';
  const when = r.trigger.dir === 'below' ? `cheaper than ${100 - r.trigger.pct}% of its days` : `pricier than ${r.trigger.pct}% of its days`;
  return `${act} YT-${r.marketName} when it is ${when} (${r.mode === 'approve' ? 'real money, you approve' : 'practice money'})`;
}

export async function createUserRule(addr, input) {
  const data = await getMarkets();
  const m = data.markets.find(x => x.id === String(input.marketId || ''));
  if (!m) throw new Error('Pick a live market.');
  if (m.distorted) throw new Error(`YT-${m.name} is distorted (${m.flags.join(', ')}), so BANDIT will not trade it.`);
  const mode = input.mode === 'approve' ? 'approve' : 'paper';
  if (mode === 'approve' && m.chainId !== ROBINHOOD_CHAIN_ID) throw new Error('One-tap approve trades run on Robinhood Chain. Use paper mode for other chains.');
  const dir = input.dir === 'above' ? 'above' : input.dir === 'below' ? 'below' : null;
  const pct = Number(input.pct);
  if (!dir || !(pct >= 0 && pct <= 100)) throw new Error('Set a trigger: band percentile below or above a number from 0 to 100.');
  const action = input.ruleAction === 'exit' ? 'exit' : 'enter';
  const sizeUsd = Number(input.sizeUsd);
  const maxSize = mode === 'paper' ? 500 : CAPS.maxTradeUsd;
  if (action === 'enter' && !(sizeUsd >= 1 && sizeUsd <= maxSize)) throw new Error(`Size must be between $1 and $${maxSize}.`);
  const rules = await getJSON(key(addr, 'rules'), []);
  if (rules.filter(r => r.status === 'active').length >= MAX_RULES) throw new Error(`Your agent holds at most ${MAX_RULES} active rules.`);
  const rule = {
    id: `u_${randomBytes(5).toString('hex')}`, kind: 'band', mode, action,
    marketId: m.id, marketName: `${m.name} (${m.chainName})`, trigger: { dir, pct: Math.round(pct) },
    sizeUsd: action === 'enter' ? sizeUsd : null, status: 'active', createdAt: new Date().toISOString(),
    lastCheckedAt: null, lastFiredAt: null, lastResult: null, fired: 0,
  };
  rules.push(rule);
  await setJSON(key(addr, 'rules'), rules);
  await redis('SADD', USERS_ACTIVE, addr.toLowerCase());
  await logUser(addr, { type: 'rule', text: `New rule: ${describeUserRule(rule)}` });
  return rule;
}

// Pause or resume rules. With no active rule the agent sleeps and the scheduled checks skip it.
export async function setUserRules(addr, { id = null, on }) {
  const rules = await getJSON(key(addr, 'rules'), []);
  const targets = rules.filter(r => r.status !== 'done' && (id ? r.id === id : true));
  if (id && !targets.length) throw new Error('That rule already fired or no longer exists.');
  for (const r of targets) r.status = (typeof on === 'boolean' ? on : r.status !== 'active') ? 'active' : 'paused';
  if (rules.filter(r => r.status === 'active').length > MAX_RULES) throw new Error(`Your agent holds at most ${MAX_RULES} active rules.`);
  await setJSON(key(addr, 'rules'), rules);
  const awake = rules.some(r => r.status === 'active');
  await redis(awake ? 'SADD' : 'SREM', USERS_ACTIVE, addr.toLowerCase());
  await logUser(addr, { type: 'rule', text: id ? `Rule ${targets[0].status === 'active' ? 'resumed' : 'paused'}: ${describeUserRule(targets[0])}` : awake ? 'Your agent is awake: rules resumed.' : 'Your agent is asleep: all rules paused.' });
  return { awake };
}

export async function deleteUserRule(addr, id) {
  const rules = await getJSON(key(addr, 'rules'), []);
  await setJSON(key(addr, 'rules'), rules.filter(r => r.id !== id));
}

async function notify(addr, text) {
  const chat = await redis('GET', key(addr, 'chat'));
  if (!chat) return false;
  return sendTo(chat, `${text}\n\nData and reasoning only. Not financial advice.`);
}

async function paperTrade(addr, rule, m, side, trace) {
  const positions = await getJSON(key(addr, 'positions'), {});
  const price = m.ytPriceUsd;
  if (!(price > 0)) throw new Error('No live YT price for this market right now.');
  if (side === 'buy') {
    const cash = Number(await redis('GET', key(addr, 'cash')));
    if (cash < rule.sizeUsd) return { ok: false, text: `Not enough paper cash ($${r2(cash)}) for $${rule.sizeUsd}.` };
    const units = rule.sizeUsd / price;
    const prev = positions[m.id];
    positions[m.id] = {
      marketId: m.id, name: `YT-${m.name}`, chainName: m.chainName,
      units: (prev?.units || 0) + units, costUsd: (prev?.costUsd || 0) + rule.sizeUsd,
      enteredAt: prev?.enteredAt || new Date().toISOString(),
      entry: { percentile: m.band.percentile, impliedApy: m.impliedApy, price },
    };
    await redis('INCRBYFLOAT', key(addr, 'cash'), -rule.sizeUsd);
    await setJSON(key(addr, 'positions'), positions);
    trace('exec', `Paper trade filled: $${rule.sizeUsd} of YT-${m.name} at the live Pendle price ($${price.toPrecision(4)} per YT).`, { ok: true });
    return { ok: true, text: `Entered $${rule.sizeUsd} of YT-${m.name} (paper).`, usd: rule.sizeUsd };
  }
  const pos = positions[m.id];
  if (!pos) return { ok: false, text: `Your agent holds no YT-${m.name} to exit.` };
  const value = pos.units * price;
  await redis('INCRBYFLOAT', key(addr, 'cash'), value);
  delete positions[m.id];
  await setJSON(key(addr, 'positions'), positions);
  const pnl = value - pos.costUsd;
  trace('exec', `Paper exit filled: $${r2(value)} back for YT-${m.name}, ${pnl >= 0 ? '+' : ''}$${r2(pnl)} on this trade.`, { ok: true });
  return { ok: true, text: `Exited YT-${m.name} (paper): ${pnl >= 0 ? '+' : ''}$${r2(pnl)}.`, usd: value };
}

// Runs one visitor's agent: checks each active rule, asks SERV on triggers, then paper-trades or queues a one-tap approval.
export async function runUserAgent(addr, { force = false, source = 'owner', data } = {}) {
  const { steps, trace } = tracer();
  const summary = { source, at: new Date().toISOString(), actions: [], steps };
  data ||= await getMarkets({ maxAgeMs: 60_000 });
  const byId = new Map(data.markets.map(m => [m.id, m]));
  const rules = await getJSON(key(addr, 'rules'), []);
  const active = rules.filter(r => r.status === 'active');
  trace('scan', `Scanned ${data.markets.length} Pendle markets for your agent. ${active.length} active rule${active.length === 1 ? '' : 's'} to check.`,
    { markets: data.markets.filter(m => active.some(r => r.marketId === m.id)).map(m => ({ id: m.id, name: `YT-${m.name}`, percentile: m.band.percentile, distorted: m.distorted })) });
  for (const rule of active) {
    rule.lastCheckedAt = new Date().toISOString();
    const m = byId.get(rule.marketId);
    if (!m) { rule.lastResult = 'Market is no longer live.'; continue; }
    if (m.band.status !== 'formed') { rule.lastResult = `Band is ${m.band.status}, waiting.`; trace('rule', `YT-${m.name}: band ${m.band.status}, waiting.`, { hit: false }); continue; }
    const p = m.band.percentile;
    const hit = rule.trigger.dir === 'below' ? p <= rule.trigger.pct : p >= rule.trigger.pct;
    const want = rule.trigger.dir === 'below' ? `cheaper than ${100 - rule.trigger.pct}% of its days` : `pricier than ${rule.trigger.pct}% of its days`;
    rule.lastResult = `${plainWhere(m)} now. Waiting for ${want}: ${hit ? 'triggered' : 'not yet'}.`;
    trace('rule', `YT-${m.name} is ${plainWhere(m).toLowerCase()}. Your rule waits until it is ${want}: ${hit ? 'that is now' : 'not yet'}.`, { hit, percentile: p, market: `YT-${m.name}` });
    if (!hit) continue;
    if (!force && rule.lastFiredAt && Date.now() - Date.parse(rule.lastFiredAt) < COOLDOWN_MS) { trace('rule', 'Cooling down after its last action.'); continue; }
    if (!servReady()) { rule.lastResult = 'SERV Reasoning is not configured, so the agent will not act.'; trace('decision', rule.lastResult, { ok: false }); continue; }
    if (!(await takePublicServBudget())) { rule.lastResult = 'BANDIT hit its daily public SERV budget. Try again tomorrow.'; trace('decision', rule.lastResult, { ok: false }); continue; }
    const side = rule.action === 'exit' ? 'sell' : 'buy';
    trace('serv', `Asking SERV Reasoning to confirm or hold off on ${side === 'buy' ? 'entering' : 'exiting'} YT-${m.name}.`);
    const verdict = await gate({
      mode: rule.mode === 'approve' ? 'approval agent rule (user signs in their own wallet)' : 'paper agent rule (simulated trade at the live YT price, no price impact modeled)',
      rule: { kind: 'band', description: describeUserRule(rule), trigger: rule.trigger, action: rule.action, size_usd: rule.sizeUsd },
      market: gateMarket(m),
      quote: { side, usd: rule.sizeUsd, note: 'no onchain quote for paper mode' },
      caps: { max_price_impact_pct: CAPS.maxPriceImpact * 100 },
      position: null,
    });
    rule.lastFiredAt = new Date().toISOString();
    const ok = verdict.decision === 'confirm';
    trace('decision', `${ok ? 'SERV confirmed' : 'SERV held off'}: ${verdict.headline}`, { ok, reason: verdict.reason, model: verdict.model });
    if (!ok) {
      rule.lastResult = `SERV held off: ${verdict.headline}`;
      await logUser(addr, { type: 'held', marketName: `YT-${m.name}`, headline: verdict.headline, reason: verdict.reason, model: verdict.model });
      if (await notify(addr, `Your BANDIT agent held off on YT-${m.name}.\n${pointsLine(m)}\nReason: ${verdict.reason}`)) trace('telegram', 'Telegram: told you why it held off.', { ok: true });
      summary.actions.push({ rule: rule.id, outcome: 'held' });
      continue;
    }
    if (rule.mode === 'approve') {
      const id = `a_${randomBytes(5).toString('hex')}`;
      const approvals = await getJSON(key(addr, 'approvals'), []);
      approvals.unshift({ id, marketId: m.id, name: `YT-${m.name}`, usd: rule.sizeUsd, reason: verdict.reason, at: new Date().toISOString() });
      await setJSON(key(addr, 'approvals'), approvals.slice(0, 10));
      rule.status = 'done';
      rule.lastResult = `SERV confirmed. Waiting for your signature: $${rule.sizeUsd} of YT-${m.name}.`;
      const url = `${SITE()}/#/my?approve=${id}`;
      trace('exec', 'Ready for your one-tap approval. Nothing moves until you sign in your own wallet.', { ok: true });
      await logUser(addr, { type: 'approval', marketName: `YT-${m.name}`, headline: verdict.headline, reason: verdict.reason, model: verdict.model, url });
      if (await notify(addr, `SERV confirmed your rule: enter $${rule.sizeUsd} of YT-${m.name} on Robinhood Chain.\nReason: ${verdict.reason}\nTap to review and sign in your own wallet: ${url}`)) trace('telegram', 'Telegram: sent you the one-tap approval link.', { ok: true });
      summary.actions.push({ rule: rule.id, outcome: 'approval' });
      continue;
    }
    const res = await paperTrade(addr, rule, m, side, trace);
    rule.lastResult = res.ok ? `${res.text} ${verdict.headline}` : res.text;
    if (res.ok) {
      rule.fired = (rule.fired || 0) + 1;
      rule.status = 'done';
      await logUser(addr, { type: 'paper', marketName: `YT-${m.name}`, side, usd: r2(res.usd), headline: verdict.headline, reason: verdict.reason, model: verdict.model, text: res.text });
      if (await notify(addr, `Your BANDIT agent ${side === 'buy' ? 'entered' : 'exited'} YT-${m.name} (paper): ${pointsLine(m)}.\n${res.text}\nReason: ${verdict.reason}`)) trace('telegram', 'Telegram: pinged you.', { ok: true });
      summary.actions.push({ rule: rule.id, outcome: 'paper' });
    } else {
      trace('exec', res.text, { ok: false });
    }
  }
  const fresh = await getJSON(key(addr, 'rules'), []);
  const touched = new Map(active.map(r => [r.id, r]));
  await setJSON(key(addr, 'rules'), fresh.map(r => touched.get(r.id) || r));
  if (!fresh.some(r => (touched.get(r.id) || r).status === 'active')) await redis('SREM', USERS_ACTIVE, addr.toLowerCase());
  trace('done', summary.actions.length ? `Run finished: ${summary.actions.length} action${summary.actions.length === 1 ? '' : 's'}.` : 'Run finished: nothing to do. Back to sleep.');
  await setJSON(key(addr, 'last'), summary);
  await redis('LPUSH', key(addr, 'runs'), JSON.stringify(runBrief(summary)));
  await redis('LTRIM', key(addr, 'runs'), 0, RUNS_KEPT - 1);
  return summary;
}

// Scheduled pass over every visitor agent with active rules.
export async function runAllUserAgents({ budgetMs = 45_000 } = {}) {
  if (!storeReady()) return { ok: false, error: 'storage not connected' };
  const started = Date.now();
  const users = ((await redis('SMEMBERS', USERS_ACTIVE)) || []).slice(0, 25);
  const data = await getMarkets({ maxAgeMs: 60_000 });
  const done = [];
  for (const addr of users) {
    if (Date.now() - started > budgetMs) break;
    try { const s = await runUserAgent(addr, { source: 'cron', data }); done.push({ addr, actions: s.actions.length }); }
    catch (e) { done.push({ addr, error: e.message }); }
  }
  return { ok: true, users: done.length, done };
}

export async function userStatus(addr) {
  await ensureUser(addr);
  const [rules, positions, cashRaw, last, chat, approvals, events, runs, data] = await Promise.all([
    getJSON(key(addr, 'rules'), []), getJSON(key(addr, 'positions'), {}), redis('GET', key(addr, 'cash')),
    getJSON(key(addr, 'last'), null), redis('GET', key(addr, 'chat')), getJSON(key(addr, 'approvals'), []),
    redis('LRANGE', key(addr, 'events'), 0, 39), redis('LRANGE', key(addr, 'runs'), 0, RUNS_KEPT - 1), getMarkets().catch(() => null),
  ]);
  const byId = new Map((data?.markets || []).map(m => [m.id, m]));
  const cash = Number(cashRaw || 0);
  const pos = Object.values(positions).map(p => {
    const m = byId.get(p.marketId);
    const valueUsd = m?.ytPriceUsd ? p.units * m.ytPriceUsd : null;
    return { ...p, valueUsd: r2(valueUsd), pnlUsd: valueUsd == null ? null : r2(valueUsd - p.costUsd), pnlPct: valueUsd == null ? null : r2(((valueUsd / p.costUsd) - 1) * 100), percentileNow: m?.band?.percentile ?? null, daysToMaturity: m?.daysToMaturity ?? null };
  });
  const invested = pos.reduce((s, p) => s + (p.valueUsd || 0), 0);
  const total = cash + invested;
  return {
    address: addr,
    paper: { startUsd: PAPER_START_USD, cashUsd: r2(cash), investedUsd: r2(invested), totalUsd: r2(total), pnlUsd: r2(total - PAPER_START_USD), pnlPct: r2((total / PAPER_START_USD - 1) * 100) },
    positions: pos,
    rules: rules.map(r => ({ ...r, description: describeUserRule(r) })),
    approvals,
    events: (events || []).map(x => { try { return JSON.parse(x); } catch { return null; } }).filter(Boolean),
    runs: (runs || []).map(x => { try { return JSON.parse(x); } catch { return null; } }).filter(Boolean),
    lastRun: last,
    telegram: { linked: Boolean(chat), bot: await botUsername().catch(() => null) },
  };
}

export async function telegramLinkFor(addr) {
  const bot = await botUsername();
  if (!bot) throw new Error('The BANDIT Telegram bot is not connected yet.');
  const code = randomBytes(6).toString('hex');
  await redis('SET', `bandit:tglink:${code}`, addr.toLowerCase(), 'EX', 86400);
  return `https://t.me/${bot}?start=u_${code}`;
}

export async function linkUserChat(code, chatId) {
  const addr = await redis('GET', `bandit:tglink:${code}`);
  if (!addr) return null;
  await redis('SET', key(addr, 'chat'), String(chatId));
  await redis('DEL', `bandit:tglink:${code}`);
  return addr;
}

export async function resetPaper(addr) {
  await Promise.all([
    redis('SET', key(addr, 'cash'), PAPER_START_USD), setJSON(key(addr, 'positions'), {}), setJSON(key(addr, 'approvals'), []),
  ]);
  await logUser(addr, { type: 'rule', text: `Paper portfolio reset to $${PAPER_START_USD.toLocaleString('en-US')}.` });
}
