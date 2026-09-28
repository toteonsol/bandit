// BANDIT's agent: rules, the SERV Reasoning risk gate, hard safety caps, execution on Robinhood Chain,
// Telegram alerts, receipts, the points ledger, and a step trace of every run for the Agent Live view.
import { randomBytes, timingSafeEqual } from 'node:crypto';
import { encodeFunctionData, erc20Abi } from 'viem';
import { getMarkets, ROBINHOOD_CHAIN_ID } from './pendle.js';
import { redis, getJSON, setJSON, KEYS, logEvent, recentEvents, storeReady } from './store.js';
import { servJSON, servReady, undash } from './serv.js';
import { publicClient, walletClient, agentAccount, agentAddress, ethBalance, tokenBalance, tokenAllowance, txUrl, addressUrl, WALLET_CHAIN } from './chain.js';
import { quoteBuyYt, quoteSellYt, PENDLE_ROUTER } from './trade.js';
import { notifyFollowers, sendTo, telegramReady, botUsername, ensureWebhook } from './telegram.js';

// Hard safety caps. They live in code on purpose: no env var or request can raise them.
export const CAPS = Object.freeze({
  maxTradeUsd: 25,
  maxDailyUsd: 100,
  maxPriceImpact: 0.05,
  maxSlippage: 0.03,
  minDaysToEnter: 3,
  gasReserveEth: 0.0003,
  maxOwnerRules: 20,
  maxAlertRules: 200,
});

// The only markets the agent may trade: Pendle markets on Robinhood Chain. Distorted ones are refused anyway.
export const ALLOWLIST = Object.freeze([
  '4663-0x25f241538bc3de8f7130706827b3f6946db51f5d', // SHROOM (Pons)
  '4663-0x892defbf510d9baa96dbd2a51b13e879a857a79b', // PFE (Robinhood tokenized stock)
  '4663-0x206a5cd00e9ffabb8ca564076b64799a78df19b9', // NVDA (Robinhood tokenized stock)
  '4663-0xd6e26e957b3207a5c618213d928647ec84150ca0', // SGOV (Robinhood tokenized ETF)
  '4663-0x752057e7a63d0a7f15b740d41ef484fdec459ead', // ORBIO (Orbio)
]);

export const isLive = () => process.env.AGENT_LIVE === 'true';
export const isPaused = () => process.env.AGENT_PAUSED === 'true';
const today = () => new Date().toISOString().slice(0, 10);
const r2 = x => (x == null || !Number.isFinite(x) ? null : Math.round(x * 100) / 100);
const clamp = (x, lo, hi) => Math.min(hi, Math.max(lo, x));
const HOUR = 3_600_000;

export function isOwner(request) {
  const want = process.env.OWNER_KEY || '';
  const got = request.headers.get('x-owner-key') || '';
  if (!want || !got) return false;
  const a = Buffer.from(got), b = Buffer.from(want);
  return a.length === b.length && timingSafeEqual(a, b);
}

// A run trace: ordered steps the Agent Live view animates (scan, rule, serv, decision, exec, telegram).
function tracer() {
  const steps = [];
  const t0 = Date.now();
  const trace = (stage, text, extra = {}) => { steps.push({ ms: Date.now() - t0, stage, text: undash(text), ...extra }); };
  return { steps, trace };
}
const noTrace = () => {};

/* ---------------- rules ---------------- */

export const getRules = () => getJSON(KEYS.rules, []);

// Read-modify-write that keeps rules created or deleted by other requests in the meantime.
async function patchRules(patches) {
  const current = await getRules();
  for (const r of current) if (patches.has(r.id)) Object.assign(r, patches.get(r.id));
  await setJSON(KEYS.rules, current);
}

export function publicRule(r) {
  const { chatId, ...rest } = r;
  return { ...rest, linked: Boolean(chatId) };
}

export async function createRule(input, { owner }) {
  const data = await getMarkets();
  const byId = new Map(data.markets.map(m => [m.id, m]));
  const kind = String(input.kind || '');
  if (!['band', 'farm', 'alert'].includes(kind)) throw new Error('Pick a rule type: band, farm, or alert.');
  if (kind !== 'alert' && !owner) throw new Error('Only the agent owner can create trading rules. Alert rules are open to everyone.');
  const rule = {
    id: `r_${randomBytes(6).toString('hex')}`,
    kind,
    status: kind === 'alert' ? 'pending' : 'active',
    createdAt: new Date().toISOString(),
    lastCheckedAt: null, lastFiredAt: null, lastResult: null, fired: 0,
  };
  if (kind === 'band' || kind === 'alert') {
    const m = byId.get(String(input.marketId || ''));
    if (!m) throw new Error('Pick a live market from the board.');
    const dir = input.dir === 'above' ? 'above' : input.dir === 'below' ? 'below' : null;
    const pct = Number(input.pct);
    if (!dir || !(pct >= 0 && pct <= 100)) throw new Error('Set a trigger: band percentile below or above a number from 0 to 100.');
    Object.assign(rule, { marketId: m.id, marketName: `${m.name} (${m.chainName})`, trigger: { dir, pct: Math.round(pct) } });
    if (kind === 'band') {
      if (!ALLOWLIST.includes(m.id)) throw new Error('The agent only trades allowlisted Robinhood Chain markets.');
      const action = input.ruleAction === 'exit' ? 'exit' : 'enter'; // `action` is the API verb, so the rule's side travels as ruleAction
      const sizeUsd = Number(input.sizeUsd);
      if (action === 'enter' && !(sizeUsd >= 1 && sizeUsd <= CAPS.maxTradeUsd)) throw new Error(`Size must be between $1 and $${CAPS.maxTradeUsd} (hard cap per trade).`);
      Object.assign(rule, { action, sizeUsd: action === 'enter' ? sizeUsd : null, maxSlippage: clamp(Number(input.maxSlippage) || 0.01, 0.001, CAPS.maxSlippage) });
    }
  }
  if (kind === 'farm') {
    const budgetUsd = Number(input.budgetUsd);
    const maxCostPer1k = Number(input.maxCostPer1k);
    if (!(budgetUsd >= 1 && budgetUsd <= CAPS.maxTradeUsd)) throw new Error(`Budget must be between $1 and $${CAPS.maxTradeUsd}.`);
    if (!(maxCostPer1k > 0)) throw new Error('Set a max cost per 1,000 points above zero.');
    Object.assign(rule, { marketName: 'Cheapest points on Robinhood Chain', farm: { budgetUsd, maxCostPer1k }, maxSlippage: clamp(Number(input.maxSlippage) || 0.01, 0.001, CAPS.maxSlippage) });
  }
  const rules = await getRules();
  if (kind === 'alert') {
    const alerts = rules.filter(r => r.kind === 'alert');
    if (alerts.length >= CAPS.maxAlertRules) {
      const stale = alerts.filter(r => r.status !== 'active').map(r => r.id);
      if (!stale.length) throw new Error('Alert slots are full right now. Try again later.');
      const drop = new Set(stale.slice(0, Math.max(1, alerts.length - CAPS.maxAlertRules + 1)));
      rules.splice(0, rules.length, ...rules.filter(r => !drop.has(r.id)));
    }
  } else if (rules.filter(r => r.kind !== 'alert').length >= CAPS.maxOwnerRules) {
    throw new Error(`The agent holds at most ${CAPS.maxOwnerRules} rules. Delete one first.`);
  }
  rules.push(rule);
  await setJSON(KEYS.rules, rules);
  if (kind !== 'alert') await logEvent({ type: 'rule', ruleId: rule.id, text: `New rule: ${describeRule(rule)}` });
  return rule;
}

export async function deleteRule(id) {
  const rules = await getRules();
  const next = rules.filter(r => r.id !== id);
  if (next.length === rules.length) throw new Error('Rule not found.');
  await setJSON(KEYS.rules, next);
}

export async function toggleRule(id) {
  const rules = await getRules();
  const r = rules.find(x => x.id === id);
  if (!r) throw new Error('Rule not found.');
  if (r.kind === 'alert') throw new Error('Alert rules are managed from Telegram.');
  r.status = r.status === 'active' ? 'paused' : 'active';
  await setJSON(KEYS.rules, rules);
  return r;
}

export async function linkRule(ruleId, chatId) {
  const rules = await getRules();
  const r = rules.find(x => x.id === ruleId && x.kind === 'alert');
  if (!r || r.status === 'done') return null;
  Object.assign(r, { chatId, status: 'active', linkedAt: new Date().toISOString() });
  await setJSON(KEYS.rules, rules);
  return r;
}

export async function unlinkChat(chatId) {
  const rules = await getRules();
  let changed = false;
  for (const r of rules) if (r.kind === 'alert' && String(r.chatId) === String(chatId) && r.status !== 'done') { r.status = 'stopped'; changed = true; }
  if (changed) await setJSON(KEYS.rules, rules);
}

export function describeRule(r) {
  if (r.kind === 'farm') return `Farm mode: spend up to $${r.farm.budgetUsd} on the cheapest Robinhood Chain points under $${r.farm.maxCostPer1k} per 1,000 pts, skipping the top 20% of each band`;
  const t = `band percentile ${r.trigger.dir} P${r.trigger.pct}`;
  if (r.kind === 'alert') return `Alert when ${r.marketName} ${t}`;
  return `${r.action === 'enter' ? `Enter $${r.sizeUsd} of` : 'Exit all'} YT-${r.marketName} when ${t}`;
}

/* ---------------- SERV Reasoning gate ---------------- */

const GATE_SYSTEM = `You are BANDIT's risk gate: the last check before an autonomous agent acts on a user's own rule for a Pendle YT market on Robinhood Chain. You also review trades a user is about to sign in their own wallet.

You receive: the rule or request, fresh market data (implied and underlying APY, 90-day band percentile, days to maturity, liquidity, outlier flags, points profile), a live Pendle quote (ETH in, YT out, price impact, fee), the hard caps, and any current position.

Decide "confirm" or "reject":
- Confirm when the trigger genuinely holds on this fresh data and nothing makes acting on it unsafe. The user owns the strategy: do not reject only because you would choose differently.
- Reject on red flags: outlier flags on the market; price impact beyond 5 percent; fewer than 3 days to maturity for an entry; a band still forming when the rule's trigger is a band percentile; a size above 2 percent of pool liquidity; or numbers that contradict the rule's intent.
- A missing or unknown points rate is never a reason to hold off. Many YT trades are about price, not points: judge the trade on band position, room to run, days left, decay and liquidity.
- Slippage is enforced separately by the quote's minimum output, so judge price impact only against the 5 percent limit.

How to read the data:
- Buying YT pays for leveraged exposure to the underlying yield and any points until maturity; its value decays toward zero at maturity. A lower band percentile means YT is priced lower than usual for that market.
- points.status: "confirmed points" means Pendle publishes a program for this YT; "speculative airdrop" means no published rate, so any airdrop value is a guess; "none known" means no points.
- points.cost_per_1k_pts is the expected decay cost per 1,000 points if held to maturity; lower is cheaper. points.unit says what a point is. With no published rate, say the rate is unknown and weigh decay and band position instead.

Write for a Telegram alert:
- headline: under 90 characters, no verb at the start, leading with the points math when a rate exists, for example "YT-X: est. 1,240 pts/day, ~$0.41 per 1,000 pts, P18 of band".
- reason: 2 to 3 plain sentences that name the trade-off, for example "cheapest points on the board, but only 9 days left, so decay is fast".

Wording rules: describe, do not advise; never say "guaranteed", "risk-free", or give price targets; never use em dashes or en dashes; use only numbers present in the data.`;

const GATE_SCHEMA = {
  type: 'object',
  additionalProperties: false,
  required: ['decision', 'headline', 'reason', 'points_math', 'risks'],
  properties: {
    decision: { type: 'string', enum: ['confirm', 'reject'] },
    headline: { type: 'string', description: 'Under 90 characters: market, points math, band position.' },
    reason: { type: 'string', description: '2 to 3 sentences naming the trade-off.' },
    points_math: { type: 'string', description: 'One sentence on points per day and cost per 1,000 points, or that the rate is unknown.' },
    risks: { type: 'array', items: { type: 'string' }, description: '0 to 3 short risk tags.' },
  },
};

export function gateMarket(m) {
  const p = m.points || {};
  return {
    name: `YT-${m.name}`,
    chain: m.chainName,
    days_to_maturity: m.daysToMaturity,
    implied_apy_pct: r2(m.impliedApy * 100),
    underlying_apy_pct: m.underlyingApy == null ? null : r2(m.underlyingApy * 100),
    liquidity_usd: Math.round(m.liquidityUsd),
    yt_leverage: m.leverage == null ? null : r2(m.leverage),
    band: { status: m.band.status, percentile: m.band.percentile == null ? null : Math.round(m.band.percentile), min_pct: r2(m.band.min * 100), max_pct: r2(m.band.max * 100), days_of_history: m.band.days },
    change_7d_pp: m.change7d == null ? null : r2(m.change7d * 100),
    range: m.range ? { yt_to_band_high_pct: r2(m.range.toHigh * 100), yt_to_band_low_pct: r2(m.range.toLow * 100) } : null,
    flags: m.flags,
    points: {
      status: p.status, program: p.program, multiplier: p.multiplier, unit: p.unit,
      rate_per_dollar_day: p.rate == null ? null : r2(p.rate),
      pts_per_day_per_100: p.ptsPerDay100 == null ? null : Math.round(p.ptsPerDay100),
      cost_per_1k_pts: p.costPer1k == null ? null : Number(p.costPer1k.toPrecision(3)),
      decay_cost_pct: p.decayCostRatio == null ? null : r2(p.decayCostRatio * 100),
      note: p.note || null,
    },
  };
}

function gateQuote(q) {
  return {
    side: q.side, usd: r2(q.usd), eth_in: q.ethIn ?? null, eth_out: q.ethOut ?? null,
    yt_out: q.ytOut ?? null, yt_in: q.ytIn ?? null,
    price_impact_pct: q.priceImpact == null ? null : r2(q.priceImpact * 100),
    fee_usd: r2(q.feeUsd), implied_apy_after_pct: q.impliedApyAfter == null ? null : r2(q.impliedApyAfter * 100),
  };
}

export async function gate(payload) {
  const { data, raw, model } = await servJSON({ system: GATE_SYSTEM, user: payload, name: 'bandit_gate', schema: GATE_SCHEMA });
  if (!data) throw new Error(`SERV Reasoning returned text that was not a decision: ${String(raw).slice(0, 120)}`);
  return { ...data, model, headline: undash(data.headline), reason: undash(data.reason), points_math: undash(data.points_math), risks: (data.risks || []).map(undash) };
}

/* ---------------- alert reads for public alert rules ---------------- */

const ALERT_SYSTEM = `You are BANDIT, a yield-band and points analyst for Pendle YT markets. A user's alert just triggered. Write a short read for a Telegram message: where the market sits in its 90-day band, the points math if a rate exists (or that the rate is unknown), and the main trade-off such as decay near maturity or thin liquidity. Describe, never advise; no "buy", "sell", "guaranteed", or price targets; no em dashes or en dashes; use only numbers in the data.`;
const ALERT_SCHEMA = {
  type: 'object', additionalProperties: false, required: ['headline', 'reason'],
  properties: { headline: { type: 'string', description: 'Under 90 characters.' }, reason: { type: 'string', description: '2 to 3 sentences.' } },
};

/* ---------------- execution ---------------- */

async function spentToday() {
  return Number((await redis('GET', KEYS.spent(today()))) || 0);
}

async function reserveSpend(usd) {
  const key = KEYS.spent(today());
  const total = Number(await redis('INCRBYFLOAT', key, usd));
  await redis('EXPIRE', key, 3 * 86400);
  if (total > CAPS.maxDailyUsd + 1e-9) {
    await redis('INCRBYFLOAT', key, -usd);
    return false;
  }
  return true;
}
const releaseSpend = usd => redis('INCRBYFLOAT', KEYS.spent(today()), -usd);

// Simulates, then (only when AGENT_LIVE=true) sends. Returns what happened.
async function execute(quote, trace) {
  const from = agentAccount().address;
  const call = { account: from, to: quote.tx.to, data: quote.tx.data, value: BigInt(quote.tx.value) };
  const approvals = [];
  for (const a of quote.approvals || []) {
    const amount = BigInt(a.amount);
    if ((await tokenAllowance(a.token, from, PENDLE_ROUTER)) < amount) approvals.push({ token: a.token, amount });
  }
  if (!isLive()) {
    if (approvals.length) return { mode: 'dry-run', simulated: false, note: 'Needs a token approval first, so the swap can only be simulated in live mode.' };
    await publicClient.call(call);
    const gas = await publicClient.estimateGas(call);
    trace('exec', `Simulated on Robinhood Chain: the transaction would succeed (${gas} gas). Dry run, nothing sent.`, { ok: true });
    return { mode: 'dry-run', simulated: true, gas: gas.toString() };
  }
  const wallet = walletClient();
  for (const a of approvals) {
    const data = encodeFunctionData({ abi: erc20Abi, functionName: 'approve', args: [PENDLE_ROUTER, a.amount] });
    await publicClient.call({ account: from, to: a.token, data });
    const hash = await wallet.sendTransaction({ to: a.token, data });
    trace('exec', 'Approving the Pendle router for this token.', { url: txUrl(hash) });
    const receipt = await publicClient.waitForTransactionReceipt({ hash, timeout: 45_000 });
    if (receipt.status !== 'success') throw new Error('The token approval reverted onchain.');
  }
  await publicClient.call(call);
  const gas = await publicClient.estimateGas(call);
  trace('exec', 'Simulation passed. Sending the transaction to Robinhood Chain.', { ok: true });
  const hash = await wallet.sendTransaction({ to: call.to, data: call.data, value: call.value, gas: (gas * 12n) / 10n });
  let status = 'pending';
  try {
    const receipt = await publicClient.waitForTransactionReceipt({ hash, timeout: 45_000 });
    status = receipt.status;
  } catch {}
  trace('exec', status === 'success' ? 'Confirmed onchain.' : status === 'reverted' ? 'The transaction reverted onchain.' : 'Sent, waiting for confirmation.', { url: txUrl(hash), ok: status !== 'reverted' });
  return { mode: 'live', hash, url: txUrl(hash), status };
}

const fmtInt = n => Math.round(n).toLocaleString('en-US');
const sig = n => (n >= 1 ? n.toFixed(2) : Number(n.toPrecision(2)).toString());

// Where a person can act on an alert themselves: BANDIT's own trade sheet on Robinhood Chain, Pendle elsewhere.
export function tradeLink(m) {
  const site = (process.env.PUBLIC_URL || 'https://bandit-bands.vercel.app').replace(/\/$/, '');
  if (m.chainId === ROBINHOOD_CHAIN_ID) return `${site}/#/trade?m=${m.id}`;
  const chain = { 1: 'ethereum', 42161: 'arbitrum', 8453: 'base', 56: 'bnbchain' }[m.chainId] || 'ethereum';
  return `https://app.pendle.finance/trade/markets/${m.address}/swap?view=yt&chain=${chain}`;
}

export function pointsLine(m) {
  const p = m.points || {};
  const band = m.band.status === 'formed' ? `P${Math.round(m.band.percentile)} of band` : `band ${m.band.status}`;
  if (p.ptsPerDay100 != null) {
    return `est. ${fmtInt(p.ptsPerDay100)} pts/day per $100, ${p.costPer1k === 0 ? 'free after yield' : `~$${sig(p.costPer1k)} per 1,000 pts`}, ${band}`;
  }
  return `points rate unknown (${p.status || 'none known'}), ${band}, ${m.daysToMaturity} days left`;
}

// The shared path for every agent trade: hard guards, live quote, SERV gate, execution, receipts, alerts.
async function tradeFlow({ rule, market, side, usd, data, context, trace }) {
  const label = `YT-${market.name}`;
  const refuse = async text => {
    rule.lastResult = text;
    trace('decision', `Refused by a hard guard: ${text}`, { ok: false });
    await logEvent({ type: 'refused', ruleId: rule.id, market: market.id, marketName: label, text });
    return { rule: rule.id, outcome: 'refused', text };
  };
  if (isPaused()) return refuse('Agent is paused (AGENT_PAUSED=true).');
  if (!ALLOWLIST.includes(market.id)) return refuse(`${label} is not on the agent allowlist.`);
  let account;
  try { account = agentAccount(); } catch (e) { return refuse(e.message); }
  if (!account) return refuse('No agent wallet yet: set AGENT_PRIVATE_KEY in Vercel.');
  if (!servReady()) return refuse('SERV_API_KEY is not set, and the agent never acts without SERV Reasoning.');

  let quote, position = null;
  if (side === 'buy') {
    if (market.distorted) return refuse(`${label} is distorted (${market.flags.join(', ')}), so the agent will not enter it.`);
    if (market.daysToMaturity < CAPS.minDaysToEnter) return refuse(`${label} matures in ${market.daysToMaturity} days, under the ${CAPS.minDaysToEnter}-day entry floor.`);
    usd = Math.min(usd, CAPS.maxTradeUsd);
    if ((await spentToday()) + usd > CAPS.maxDailyUsd) return refuse(`The $${CAPS.maxDailyUsd} daily cap would be exceeded.`);
    const balance = Number(await ethBalance(account.address)) / 1e18;
    if (balance < usd / data.ethUsd + CAPS.gasReserveEth) return refuse(`Agent wallet holds ${balance.toFixed(5)} ETH, not enough for $${usd} plus gas. Fund it on Robinhood Chain.`);
    quote = await quoteBuyYt({ market, usd, receiver: account.address, slippage: rule.maxSlippage, ethUsd: data.ethUsd });
    trace('quote', `Pendle quote: $${usd} (${quote.ethIn.toFixed(5)} ETH) for ${quote.ytOut.toFixed(3)} ${label}, price impact ${quote.priceImpact == null ? 'n/a' : `${(quote.priceImpact * 100).toFixed(2)}%`}.`, { market: market.id });
  } else {
    const raw = await tokenBalance(market.yt, account.address);
    if (raw === 0n) return refuse(`The agent holds no ${label} to exit.`);
    position = (await getJSON(KEYS.positions, {}))[market.id] || null;
    quote = await quoteSellYt({ market, amountRaw: raw, receiver: account.address, slippage: rule.maxSlippage, ethUsd: data.ethUsd });
    trace('quote', `Pendle quote: ${quote.ytIn.toFixed(3)} ${label} for ${quote.ethOut.toFixed(5)} ETH.`, { market: market.id });
  }

  trace('serv', `Asking SERV Reasoning to confirm or hold off on ${side === 'buy' ? 'entering' : 'exiting'} ${label}.`, { market: market.id });
  const verdict = await gate({
    mode: 'agent rule',
    rule: { kind: rule.kind, description: describeRule(rule), trigger: rule.trigger || null, action: side === 'buy' ? 'enter' : 'exit', size_usd: side === 'buy' ? usd : null, max_slippage_pct: r2(rule.maxSlippage * 100) },
    market: gateMarket(market),
    quote: gateQuote(quote),
    caps: { max_trade_usd: CAPS.maxTradeUsd, max_daily_usd: CAPS.maxDailyUsd, max_price_impact_pct: CAPS.maxPriceImpact * 100 },
    position,
    context: context || null,
  });
  const impactTooHigh = quote.priceImpact != null && Math.abs(quote.priceImpact) > CAPS.maxPriceImpact;
  const decision = verdict.decision === 'confirm' && !impactTooHigh ? 'confirm' : 'reject';
  const overrode = verdict.decision === 'confirm' && impactTooHigh;
  const base = { ruleId: rule.id, market: market.id, marketName: label, side, usd: r2(quote.usd ?? usd), headline: verdict.headline, reason: verdict.reason, pointsMath: verdict.points_math, risks: verdict.risks, priceImpact: quote.priceImpact, pointsLine: pointsLine(market), model: verdict.model };
  trace('decision', `${decision === 'confirm' ? 'SERV confirmed' : 'SERV held off'}: ${verdict.headline}`, { ok: decision === 'confirm', reason: overrode ? 'Code guard: price impact over the 5% cap.' : verdict.reason, model: verdict.model });

  if (decision === 'reject') {
    const why = overrode ? `Price impact ${(Math.abs(quote.priceImpact) * 100).toFixed(1)}% is over the ${CAPS.maxPriceImpact * 100}% hard cap, so the code blocked it even though SERV confirmed.` : verdict.reason;
    rule.lastResult = `SERV held off: ${verdict.headline}`;
    rule.lastFiredAt = new Date().toISOString();
    await logEvent({ type: 'held', ...base, reason: why });
    const n = await notifyFollowers(`BANDIT held off on ${label} (${market.chainName})\n${base.pointsLine}\nReason: ${why}\n\nData and reasoning only. Not financial advice.`);
    trace('telegram', n ? `Telegram: told ${n} follower${n === 1 ? '' : 's'} why it held off.` : 'Telegram: no followers yet.', { ok: true });
    return { rule: rule.id, outcome: 'held', text: why };
  }

  let reserved = false;
  if (side === 'buy' && isLive()) {
    reserved = await reserveSpend(usd);
    if (!reserved) return refuse(`The $${CAPS.maxDailyUsd} daily cap would be exceeded.`);
  }
  let result;
  try {
    result = await execute(quote, trace);
  } catch (e) {
    if (reserved) await releaseSpend(usd);
    const text = `Simulation or send failed, nothing was traded: ${String(e.shortMessage || e.message).slice(0, 220)}`;
    rule.lastResult = text;
    trace('exec', text, { ok: false });
    await logEvent({ type: 'failed', ...base, text });
    await notifyFollowers(`BANDIT could not execute ${label}: ${text}`);
    return { rule: rule.id, outcome: 'failed', text };
  }
  if (reserved && result.status === 'reverted') await releaseSpend(usd);

  const verb = side === 'buy' ? 'Entered' : 'Exited';
  const live = result.mode === 'live';
  const size = side === 'buy' ? `$${usd.toFixed(2)} (${quote.ethIn.toFixed(5)} ETH) for ${quote.ytOut.toFixed(3)} ${label}` : `${quote.ytIn.toFixed(3)} ${label} for ${quote.ethOut.toFixed(5)} ETH`;
  const event = await logEvent({
    type: live ? 'trade' : 'simulated', ...base, verb, size,
    ethIn: quote.ethIn ?? null, ethOut: quote.ethOut ?? null, ytOut: quote.ytOut ?? null, ytIn: quote.ytIn ?? null,
    feeUsd: quote.feeUsd, hash: result.hash || null, url: result.url || null, status: result.status || (result.simulated ? 'simulated' : 'not simulated'), note: result.note || null,
  });

  if (live && result.status !== 'reverted') {
    const positions = await getJSON(KEYS.positions, {});
    if (side === 'buy') {
      const prev = positions[market.id];
      positions[market.id] = {
        marketId: market.id, name: label, chainName: market.chainName, yt: market.yt, ruleId: rule.id,
        ytAmount: (prev?.ytAmount || 0) + quote.ytOut, costUsd: (prev?.costUsd || 0) + usd, costEth: (prev?.costEth || 0) + quote.ethIn,
        enteredAt: prev?.enteredAt || event.at, lastTx: result.url,
        entry: { impliedApy: market.impliedApy, percentile: market.band.percentile, leverage: market.leverage, rate: market.points.rate, unit: market.points.unit, status: market.points.status, program: market.points.program, costPer1k: market.points.costPer1k, daysToMaturity: market.daysToMaturity, expiry: market.expiry },
      };
    } else {
      delete positions[market.id];
    }
    await setJSON(KEYS.positions, positions);
  }

  rule.fired = (rule.fired || 0) + 1;
  rule.lastFiredAt = event.at;
  rule.lastResult = `${live ? verb : `Dry run: would have ${verb.toLowerCase()}`} ${label}. ${verdict.headline}`;
  if (live && rule.kind === 'band') rule.status = 'done';

  const tail = live ? `Tx: ${result.url}` : 'Dry run: simulated only, no transaction sent.';
  const n = await notifyFollowers(`${live ? verb : `Dry run, ${verb.toLowerCase()}`} ${label} on ${market.chainName}: ${base.pointsLine}.\n${size}. Price impact ${quote.priceImpact == null ? 'n/a' : `${(quote.priceImpact * 100).toFixed(2)}%`}.\nReason: ${verdict.reason}\n${tail}\n\nData and reasoning only. Not financial advice.`);
  trace('telegram', n ? `Telegram: pinged ${n} follower${n === 1 ? '' : 's'}.` : 'Telegram: no followers yet.', { ok: true });
  return { rule: rule.id, outcome: live ? 'traded' : 'simulated', text: rule.lastResult, url: result.url || null };
}

/* ---------------- rule checks ---------------- */

async function checkBandRule(rule, byId, data, force, trace) {
  const m = byId.get(rule.marketId);
  if (!m) { rule.lastResult = 'Market is no longer live.'; trace('rule', `${describeRule(rule)}: market no longer live.`, { ruleId: rule.id, ok: false }); return null; }
  if (m.band.status !== 'formed') {
    rule.lastResult = `Band is ${m.band.status}, waiting for 14 days of history.`;
    trace('rule', `${describeRule(rule)}: band ${m.band.status}, waiting.`, { ruleId: rule.id, market: m.id, hit: false });
    return null;
  }
  const p = m.band.percentile, d = Math.min(90, m.band.days || 0);
  const hit = rule.trigger.dir === 'below' ? p <= rule.trigger.pct : p >= rule.trigger.pct;
  const where = p >= 97 ? `at its ${d}-day high` : p <= 3 ? `at its ${d}-day low` : p > 50 ? `pricier than ${Math.round(p)}% of its last ${d} days` : `cheaper than ${100 - Math.round(p)}% of its last ${d} days`;
  const want = rule.trigger.dir === 'below' ? `cheaper than ${100 - rule.trigger.pct}% of its days` : `pricier than ${rule.trigger.pct}% of its days`;
  rule.lastResult = `Now ${where}. Waiting for ${want}: ${hit ? 'triggered' : 'not yet'}.`;
  trace('rule', `YT-${m.name} is ${where}. The rule waits until it is ${want}: ${hit ? 'that is now' : 'not yet'}.`, { ruleId: rule.id, market: m.id, hit, percentile: p, trigger: rule.trigger });
  if (!hit) return null;
  // Automatic runs wait out a cooldown after SERV holds off or a dry run fires; the owner's "Run now" does not.
  if (!force && rule.lastFiredAt && Date.now() - Date.parse(rule.lastFiredAt) < (isLive() ? HOUR : 6 * HOUR)) {
    trace('rule', 'Cooling down after its last action; the owner can force a run.', { ruleId: rule.id });
    return null;
  }

  if (rule.kind === 'alert') {
    trace('serv', `Asking SERV Reasoning for a read on YT-${m.name}.`, { market: m.id });
    const { data: read } = await servJSON({ system: ALERT_SYSTEM, user: { rule: describeRule(rule), market: gateMarket(m) }, name: 'bandit_alert', schema: ALERT_SCHEMA });
    const room = m.range ? `Room to run: ${(m.range.toHigh * 100).toFixed(0)}% to its 90-day high, ${(m.range.toLow * 100).toFixed(0)}% to its low.\n` : '';
    const text = `BANDIT alert: YT-${m.name} (${m.chainName}) is at P${Math.round(p)} of its 90-day band, your trigger was ${rule.trigger.dir} P${rule.trigger.pct}.\n${room}${undash(read?.headline || '')}\n${undash(read?.reason || '')}\n\nTrade it yourself: ${tradeLink(m)}\n\nData and reasoning only. Not financial advice.`;
    await sendTo(rule.chatId, text);
    trace('telegram', 'Telegram: alert sent to the subscriber.', { ok: true });
    rule.status = 'done';
    rule.lastFiredAt = new Date().toISOString();
    rule.fired = (rule.fired || 0) + 1;
    await logEvent({ type: 'alert', ruleId: rule.id, market: m.id, marketName: `YT-${m.name}`, text: `Alert sent: YT-${m.name} crossed P${rule.trigger.pct} (${rule.trigger.dir}).` });
    return { rule: rule.id, outcome: 'alerted' };
  }
  return tradeFlow({ rule, market: m, side: rule.action === 'exit' ? 'sell' : 'buy', usd: rule.sizeUsd, data, trace });
}

export function farmCandidates(data, maxCostPer1k = Infinity) {
  return data.markets
    .filter(m => ALLOWLIST.includes(m.id) && !m.distorted && m.points?.costPer1k != null && m.daysToMaturity >= CAPS.minDaysToEnter)
    .filter(m => m.band.status !== 'formed' || m.band.percentile < 80)
    .filter(m => m.points.costPer1k <= maxCostPer1k)
    .sort((a, b) => a.points.costPer1k - b.points.costPer1k || (b.points.pointsPerDollar || 0) - (a.points.pointsPerDollar || 0));
}

async function checkFarmRule(rule, byId, data, force, trace) {
  const positions = await getJSON(KEYS.positions, {});
  const held = Object.values(positions).find(p => p.ruleId === rule.id);
  const candidates = farmCandidates(data, rule.farm.maxCostPer1k);
  const cheapestAnywhere = data.markets.filter(m => !m.distorted && m.points?.costPer1k != null).sort((a, b) => a.points.costPer1k - b.points.costPer1k)[0];
  const context = { candidates: candidates.slice(0, 3).map(gateMarket), cheapest_priced_market_anywhere: cheapestAnywhere ? gateMarket(cheapestAnywhere) : null };
  if (!held) {
    if (!candidates.length) {
      rule.lastResult = `No allowlisted Robinhood Chain market has a known points rate under $${rule.farm.maxCostPer1k} per 1,000 pts yet.${cheapestAnywhere ? ` Cheapest priced points anywhere: YT-${cheapestAnywhere.name} (${cheapestAnywhere.chainName}), read only.` : ''}`;
      trace('rule', `Farm mode: ${rule.lastResult}`, { ruleId: rule.id, hit: false });
      return null;
    }
    trace('rule', `Farm mode: cheapest eligible points are YT-${candidates[0].name} at ~$${sig(candidates[0].points.costPer1k)} per 1,000 pts.`, { ruleId: rule.id, market: candidates[0].id, hit: true });
    if (!force && rule.lastFiredAt && Date.now() - Date.parse(rule.lastFiredAt) < HOUR) return null;
    return tradeFlow({ rule, market: candidates[0], side: 'buy', usd: rule.farm.budgetUsd, data, context, trace });
  }
  const current = byId.get(held.marketId);
  if (!current) { rule.lastResult = 'Held market is no longer live.'; return null; }
  if (current.daysToMaturity <= 3) {
    trace('rule', `Farm mode: ${held.name} matures in ${current.daysToMaturity} days, rotating out.`, { ruleId: rule.id, market: current.id, hit: true });
    return tradeFlow({ rule, market: current, side: 'sell', data, context: { ...context, why: 'matures within 3 days' }, trace });
  }
  const best = candidates[0];
  if (best && best.id !== current.id && current.points.costPer1k != null && best.points.costPer1k <= current.points.costPer1k * 0.7) {
    trace('rule', `Farm mode: YT-${best.name} is 30% or more cheaper per point than ${held.name}, rotating.`, { ruleId: rule.id, market: best.id, hit: true });
    const exit = await tradeFlow({ rule, market: current, side: 'sell', data, context: { ...context, why: `YT-${best.name} is at least 30% cheaper per point` }, trace });
    return exit?.outcome === 'traded' || exit?.outcome === 'simulated' ? tradeFlow({ rule, market: best, side: 'buy', usd: rule.farm.budgetUsd, data, context, trace }) : exit;
  }
  rule.lastResult = `Holding ${held.name}; no market is 30% cheaper per point.`;
  trace('rule', `Farm mode: ${rule.lastResult}`, { ruleId: rule.id, hit: false });
  return null;
}

/* ---------------- watcher ---------------- */

// A short record of every check, kept so the Activity page shows the agent working even when nothing triggers.
const RUNS_KEY = 'bandit:watch:runs';
export const runBrief = s => ({
  at: s.at, source: s.source, live: s.live, actions: (s.actions || []).map(a => a.outcome || a.type || 'action'),
  lines: (s.steps || []).filter(x => ['rule', 'decision', 'exec'].includes(x.stage)).map(x => x.text).slice(0, 6),
  end: ((s.steps || []).at(-1) || {}).text || null,
});

export async function runWatcher({ source, force = false }) {
  if (!storeReady()) return { ok: false, error: 'Agent storage is not connected.' };
  const got = await redis('SET', KEYS.lock, source, 'NX', 'EX', 90);
  if (got !== 'OK') return { ok: false, skipped: 'A check is already running.' };
  const started = Date.now();
  const { steps, trace } = tracer();
  const summary = { ok: true, source, at: new Date().toISOString(), live: isLive(), paused: isPaused(), checked: 0, actions: [], steps };
  try {
    if (isPaused()) {
      summary.note = 'Agent is paused (AGENT_PAUSED=true). No rules were checked.';
      trace('scan', summary.note, { ok: false });
      return summary;
    }
    const data = await getMarkets({ maxAgeMs: 60_000 });
    const byId = new Map(data.markets.map(m => [m.id, m]));
    const rules = (await getRules()).filter(r => r.status === 'active');
    const rh = data.markets.filter(m => m.chainId === ROBINHOOD_CHAIN_ID);
    trace('scan', `Scanned ${data.markets.length} Pendle markets (${rh.length} on Robinhood Chain). ${rules.length} active rule${rules.length === 1 ? '' : 's'} to check.`, { markets: rh.map(m => ({ id: m.id, name: `YT-${m.name}`, percentile: m.band.percentile, distorted: m.distorted })) });
    const patches = new Map();
    for (const rule of rules) {
      if (Date.now() - started > 40_000) { summary.deferred = true; trace('scan', 'Time budget used; remaining rules wait for the next run.'); break; }
      summary.checked++;
      rule.lastCheckedAt = new Date().toISOString();
      try {
        const out = rule.kind === 'farm' ? await checkFarmRule(rule, byId, data, force, trace) : await checkBandRule(rule, byId, data, force, trace);
        if (out) summary.actions.push(out);
      } catch (e) {
        rule.lastResult = `Error: ${String(e.message).slice(0, 200)}`;
        trace('decision', rule.lastResult, { ok: false, ruleId: rule.id });
        await logEvent({ type: 'error', ruleId: rule.id, text: rule.lastResult });
      }
      const { lastCheckedAt, lastResult, lastFiredAt, status, fired } = rule;
      patches.set(rule.id, { lastCheckedAt, lastResult, lastFiredAt, status, fired });
    }
    await patchRules(patches);
    trace('done', summary.actions.length ? `Run finished: ${summary.actions.length} action${summary.actions.length === 1 ? '' : 's'}.` : 'Run finished: nothing to do. Back to sleep.');
    return summary;
  } finally {
    summary.ms = Date.now() - started;
    await setJSON(KEYS.lastRun, summary).catch(() => {});
    await redis('LPUSH', RUNS_KEY, JSON.stringify(runBrief(summary))).then(() => redis('LTRIM', RUNS_KEY, 0, 29)).catch(() => {});
    await redis('DEL', KEYS.lock).catch(() => {});
  }
}

/* ---------------- status, ledger, user trades ---------------- */

export async function agentStatus({ origin }) {
  const store = storeReady();
  const address = agentAddress();
  const [balanceWei, data] = await Promise.all([
    address ? ethBalance(address).catch(() => null) : null,
    getMarkets().catch(() => null),
  ]);
  const byId = new Map((data?.markets || []).map(m => [m.id, m]));
  let rules = [], events = [], positions = {}, spent = 0, lastRun = null, username = null, runs = [];
  if (store) {
    [rules, events, positions, spent, lastRun, runs] = await Promise.all([getRules(), recentEvents(60), getJSON(KEYS.positions, {}), spentToday(), getJSON(KEYS.lastRun, null), redis('LRANGE', RUNS_KEY, 0, 29).catch(() => [])]);
    runs = (runs || []).map(x => { try { return JSON.parse(x); } catch { return null; } }).filter(Boolean);
  }
  if (telegramReady()) {
    const publicUrl = (process.env.PUBLIC_URL || '').replace(/\/$/, '');
    try { username = publicUrl && origin === publicUrl ? await ensureWebhook(origin) : await botUsername(); } catch {}
  }
  const now = Date.now();
  const ledger = Object.values(positions).map(p => {
    const m = byId.get(p.marketId);
    const daysHeld = Math.max(0, (now - Date.parse(p.enteredAt)) / 86_400_000);
    const valueUsd = m?.ytPriceUsd != null ? p.ytAmount * m.ytPriceUsd : null;
    const exposure = p.entry?.leverage ? p.costUsd * p.entry.leverage : null;
    return {
      ...p,
      daysHeld: r2(daysHeld),
      valueUsd: r2(valueUsd),
      decayPaidUsd: valueUsd == null ? null : r2(p.costUsd - valueUsd),
      pointsEst: p.entry?.rate && exposure ? Math.round(exposure * p.entry.rate * daysHeld) : null,
      pointsUnit: p.entry?.unit || null,
      daysToMaturity: m?.daysToMaturity ?? null,
    };
  });
  const balanceEth = balanceWei == null ? null : Number(balanceWei) / 1e18;
  return {
    ready: { store, serv: servReady(), telegram: telegramReady(), wallet: Boolean(address), owner: Boolean(process.env.OWNER_KEY) },
    agent: {
      address, addressUrl: address ? addressUrl(address) : null,
      balanceEth, balanceUsd: balanceEth != null && data?.ethUsd ? r2(balanceEth * data.ethUsd) : null,
      live: isLive(), paused: isPaused(), spentTodayUsd: r2(spent), chain: WALLET_CHAIN,
    },
    caps: CAPS,
    allowlist: ALLOWLIST.map(id => { const m = byId.get(id); return { id, name: m ? `YT-${m.name}` : id, distorted: m?.distorted ?? null, flags: m?.flags || [] }; }),
    telegram: { username, followUrl: username ? `https://t.me/${username}?start=follow` : null },
    rules: rules.map(publicRule).map(r => ({ ...r, description: describeRule(r) })),
    events,
    ledger,
    totals: {
      costUsd: r2(ledger.reduce((s, p) => s + (p.costUsd || 0), 0)),
      valueUsd: r2(ledger.reduce((s, p) => s + (p.valueUsd || 0), 0)),
      decayPaidUsd: r2(ledger.reduce((s, p) => s + (p.decayPaidUsd || 0), 0)),
    },
    lastRun,
    runs,
    farm: data ? { candidates: farmCandidates(data).slice(0, 5).map(m => ({ id: m.id, name: `YT-${m.name}`, costPer1k: m.points.costPer1k })) } : null,
  };
}

// "Trade with BANDIT": build a YT buy for the user's own wallet and have SERV review it. The user signs; BANDIT never holds funds.
export async function reviewUserTrade({ marketId, usd, address, slippage }) {
  if (!/^0x[0-9a-fA-F]{40}$/.test(String(address))) throw new Error('Connect a wallet first.');
  usd = Number(usd);
  if (!(usd >= 1 && usd <= 500)) throw new Error('Pick a size between $1 and $500.');
  if (!servReady()) throw new Error('SERV_API_KEY is not set on the server, and BANDIT never builds a trade without SERV Reasoning.');
  const data = await getMarkets({ maxAgeMs: 60_000 });
  const m = data.markets.find(x => x.id === marketId);
  if (!m) throw new Error('Pick a live market.');
  if (m.chainId !== ROBINHOOD_CHAIN_ID) throw new Error('Trading runs on Robinhood Chain. Other chains are read only.');
  const quote = await quoteBuyYt({ market: m, usd, receiver: address, slippage: clamp(Number(slippage) || 0.01, 0.001, CAPS.maxSlippage), ethUsd: data.ethUsd });
  const verdict = await gate({
    mode: 'user wallet trade',
    rule: { kind: 'manual', description: `User wants to buy $${usd} of YT-${m.name} with their own wallet`, action: 'enter', size_usd: usd },
    market: gateMarket(m),
    quote: gateQuote(quote),
    caps: { max_price_impact_pct: CAPS.maxPriceImpact * 100 },
    position: null,
  });
  const blocked = quote.priceImpact != null && Math.abs(quote.priceImpact) > CAPS.maxPriceImpact;
  const hardBlock = blocked || m.distorted;
  const decision = verdict.decision === 'confirm' && !hardBlock ? 'confirm' : 'reject';
  // A trade in the user's own wallet is the user's call: SERV's hold is advice they can overrule,
  // but the hard limits (price impact cap, distorted markets) still withhold the transaction.
  return {
    decision,
    canOverride: !hardBlock && decision === 'reject',
    verdict,
    blockedBy: blocked ? `Price impact ${(Math.abs(quote.priceImpact) * 100).toFixed(1)}% is over the ${CAPS.maxPriceImpact * 100}% cap.` : m.distorted ? `Market is distorted (${m.flags.join(', ')}).` : null,
    quote: { ...quote, tx: hardBlock ? null : quote.tx },
    market: { id: m.id, name: `YT-${m.name}`, chainName: m.chainName, pointsLine: pointsLine(m) },
    chain: WALLET_CHAIN,
  };
}
