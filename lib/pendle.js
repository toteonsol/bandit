// Pendle hosted API client plus BANDIT's band and points math.
// Endpoints (api-v2.pendle.finance/core/docs):
//   GET /v2/markets/all?chainId=&isActive=true&limit=100&skip=   active markets with live details and points programs
//   GET /v3/{chainId}/markets/{address}/historical-data           daily implied APY history
//   GET /v1/prices/assets?ids=                                     USD prices (YT, accounting asset, native ETH)
// All APY values from Pendle are decimals (0.05 = 5%).
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const POINTS_CONFIG = require('../points-config.json');

const PENDLE_API = 'https://api-v2.pendle.finance/core';
export const ROBINHOOD_CHAIN_ID = 4663;
export const NATIVE = '0x0000000000000000000000000000000000000000';

// Robinhood Chain is the focus chain: its markets are young and thin, so it gets its own floor
// and the outlier guard flags what is too thin to rank. Other chains use MIN_LIQUIDITY_USD.
export const MIN_LIQUIDITY_USD = 1_000_000;
export const CHAINS = [
  { id: ROBINHOOD_CHAIN_ID, name: 'Robinhood Chain', short: 'RH', explorer: 'https://robinscan.io', minLiquidityUsd: 5_000 },
  { id: 1, name: 'Ethereum', short: 'ETH', explorer: 'https://etherscan.io', minLiquidityUsd: MIN_LIQUIDITY_USD },
  { id: 42161, name: 'Arbitrum', short: 'ARB', explorer: 'https://arbiscan.io', minLiquidityUsd: MIN_LIQUIDITY_USD },
];

// Outlier guard: markets tripping any of these are labelled "distorted" and kept out of top rankings.
export const GUARD = { maxApy: 2, thinLiquidityUsd: 50_000, nearExpiryDays: 7 };

const BAND_DAYS = 90;
const MIN_BAND_DAYS = 14;
const MIN_HISTORY_TVL_USD = 10_000;   // ignore history days when the pool was nearly empty (launch anchors)
const CACHE_TTL_MS = 5 * 60 * 1000;
const CONCURRENCY = 8;
const DAY_MS = 86_400_000;

const sleep = ms => new Promise(r => setTimeout(r, ms));
const dayKey = d => new Date(d).toISOString().slice(0, 10);
const addr = id => String(id || '').split('-').pop().toLowerCase();

export async function pendle(path, { method = 'GET', body, retries = 2, timeout = 15_000 } = {}) {
  for (let attempt = 0; ; attempt++) {
    let res;
    try {
      res = await fetch(PENDLE_API + path, {
        method,
        headers: { accept: 'application/json', ...(body ? { 'content-type': 'application/json' } : {}) },
        body: body ? JSON.stringify(body) : undefined,
        signal: AbortSignal.timeout(timeout),
      });
    } catch (e) {
      if (attempt < retries) { await sleep(500 * 2 ** attempt); continue; }
      throw new Error(`Pendle API unreachable (${e.name === 'TimeoutError' ? 'timeout' : e.message})`);
    }
    if (res.ok) return res.json();
    if ((res.status === 429 || res.status >= 500) && attempt < retries) { await sleep(700 * 2 ** attempt); continue; }
    let detail = '';
    try { const j = await res.json(); detail = [].concat(j.message || j.error || []).join('; '); } catch {}
    throw new Error(`Pendle API HTTP ${res.status} on ${path.split('?')[0]}${detail ? `: ${detail}` : ''}`);
  }
}

async function mapLimit(items, limit, fn) {
  const out = new Array(items.length);
  let next = 0;
  const worker = async () => { while (next < items.length) { const i = next++; out[i] = await fn(items[i], i); } };
  await Promise.all(Array.from({ length: Math.min(limit, items.length) }, worker));
  return out;
}

async function activeMarkets(chainId) {
  const all = [];
  for (let skip = 0; ; skip += 100) {
    const page = await pendle(`/v2/markets/all?chainId=${chainId}&isActive=true&limit=100&skip=${skip}`);
    all.push(...(page.results || []));
    if (!page.results?.length || skip + 100 >= (page.total ?? 0)) break;
  }
  return all;
}

async function dailyHistory(chainId, address, now) {
  // Date-only bounds keep the URL stable for the day, so Pendle's edge cache can serve repeats.
  const start = dayKey(now - (BAND_DAYS + 1) * DAY_MS);
  const end = dayKey(now + DAY_MS);
  const page = await pendle(`/v3/${chainId}/markets/${address}/historical-data?time_frame=day&timestamp_start=${start}&timestamp_end=${end}&fields=timestamp,impliedApy,tvl`);
  return page.results || [];
}

export async function assetPrices(ids) {
  const unique = [...new Set(ids.filter(Boolean))];
  const chunks = [];
  for (let i = 0; i < unique.length; i += 20) chunks.push(unique.slice(i, i + 20));
  const results = await mapLimit(chunks, 4, c => pendle(`/v1/prices/assets?ids=${c.join(',')}`).then(r => r.prices || {}).catch(() => ({})));
  return Object.assign({}, ...results);
}

// Percentile rank of today's rate among past daily closes: share of days lower, ties count half.
function percentileRank(values, x) {
  let below = 0, equal = 0;
  for (const v of values) { if (v < x) below++; else if (v === x) equal++; }
  return ((below + equal / 2) / values.length) * 100;
}

export function computeBand(rows, current, now) {
  const today = dayKey(now);
  const cutoff = dayKey(now - BAND_DAYS * DAY_MS);
  // Day buckets hold that UTC day's close; today's bucket is still moving, so the live rate stands in for it.
  const past = rows.filter(r => {
    const d = dayKey(r.timestamp);
    return d < today && d >= cutoff && Number.isFinite(r.impliedApy) && (r.tvl ?? 0) >= MIN_HISTORY_TVL_USD;
  });
  const values = past.map(r => r.impliedApy);
  const days = values.length + 1;
  const all = [...values, current];
  const band = { status: days >= MIN_BAND_DAYS ? 'formed' : 'forming', days, min: Math.min(...all), max: Math.max(...all), percentile: null };
  if (band.status === 'formed') band.percentile = Math.round(percentileRank(values, current) * 10) / 10;
  const weekAgo = past.find(r => dayKey(r.timestamp) === dayKey(now - 7 * DAY_MS));
  return { band, change7d: weekAgo ? current - weekAgo.impliedApy : null };
}

// YT leverage: dollars of underlying exposure per $1 of YT. From Pendle prices when both are known,
// otherwise from the AMM identity ytPrice = 1 - (1 + implied)^(-t/365).
export function ytLeverage({ impliedApy, days, ytPriceUsd, accountingPriceUsd }) {
  if (ytPriceUsd > 0 && accountingPriceUsd > 0) return { leverage: accountingPriceUsd / ytPriceUsd, source: 'Pendle prices' };
  if (!(days > 0) || !Number.isFinite(impliedApy)) return { leverage: null, source: null };
  const ytPrice = 1 - Math.pow(1 + impliedApy, -days / 365);
  return ytPrice > 0 ? { leverage: 1 / ytPrice, source: 'implied APY' } : { leverage: null, source: null };
}

// Points economics for holding YT to maturity, per $1 spent:
//   points     = leverage x rate x days            (rate = points per $1 of underlying exposure per day)
//   value back = leverage x underlyingApy x days/365 (the yield the YT collects, if the underlying APY holds)
//   decay cost = 1 - value back                      (what the points actually cost you)
export function farmMath({ leverage, rate, underlyingApy, days }) {
  if (!(leverage > 0) || !(days > 0)) return null;
  const valueBack = leverage * Math.max(0, underlyingApy || 0) * (days / 365);
  const decayCost = 1 - valueBack;
  const out = { valueBackRatio: valueBack, decayCostRatio: decayCost, ptsPerDay100: null, pointsPerDollar: null, costPer1k: null };
  if (rate > 0) {
    out.ptsPerDay100 = 100 * leverage * rate;
    out.pointsPerDollar = leverage * rate * days;
    out.costPer1k = Math.max(0, decayCost) / out.pointsPerDollar * 1000;
  }
  return out;
}

function pointsProfile(m, id, prices) {
  const cfgMarket = POINTS_CONFIG.markets?.[id] || {};
  const listed = (m.points || []).filter(p => p.pendleAsset === 'basic' && Number(p.value) > 0);
  const primary = listed[0] || null;
  const cfgProgram = primary ? POINTS_CONFIG.programs?.[primary.key] || {} : {};
  let rate = null, rateSource = null, unit = null;
  if (Number(cfgMarket.pointsPerDollarDay) > 0) {
    rate = Number(cfgMarket.pointsPerDollarDay); rateSource = 'points-config.json'; unit = 'program points';
  } else if (primary && Number(cfgProgram.basePointsPerDollarDay) > 0) {
    rate = Number(cfgProgram.basePointsPerDollarDay) * Number(primary.value); rateSource = 'Pendle multiplier x config base'; unit = 'program points';
  } else if (primary?.type === 'multiplier') {
    rate = Number(primary.value); rateSource = 'Pendle multiplier'; unit = 'Pendle units';
  } else if (primary?.type === 'points-per-asset') {
    const unitPrice = prices[m.accountingAsset] || 1;
    rate = Number(primary.value) / (unitPrice > 0 ? unitPrice : 1); rateSource = 'Pendle points per asset'; unit = 'program points';
  }
  const status = cfgMarket.status || (primary ? 'confirmed points' : 'none known');
  return {
    status,
    project: cfgMarket.project || cfgProgram.project || m.protocol || null,
    program: cfgMarket.program || cfgProgram.program || primary?.key || null,
    programs: listed.map(p => ({ name: p.key, type: p.type, value: Number(p.value) })),
    multiplier: primary?.type === 'multiplier' ? Number(primary.value) : null,
    rate, rateSource, unit,
    guideUrl: cfgMarket.guideUrl || cfgProgram.guideUrl || null,
    note: cfgMarket.note || null,
  };
}

async function buildMarkets() {
  const now = Date.now();
  const warnings = [];
  const lists = await Promise.all(CHAINS.map(async c => {
    try { return (await activeMarkets(c.id)).map(m => ({ ...m, chainId: c.id, chainName: c.name, minLiq: c.minLiquidityUsd })); }
    catch (e) { warnings.push(`${c.name}: ${e.message}`); return []; }
  }));
  if (lists.every(l => !l.length) && warnings.length) throw new Error(warnings.join('; '));

  const listed = lists.flat().filter(m => {
    const d = m.details || {};
    return Number.isFinite(d.impliedApy) && (d.liquidity ?? 0) >= m.minLiq && new Date(m.expiry).getTime() > now;
  });

  const prices = await assetPrices([`${ROBINHOOD_CHAIN_ID}-${NATIVE}`, ...listed.flatMap(m => [m.yt, m.accountingAsset])]);

  const markets = await mapLimit(listed, CONCURRENCY, async m => {
    const d = m.details;
    const id = `${m.chainId}-${m.address}`;
    const days = Math.max(0, (new Date(m.expiry).getTime() - now) / DAY_MS);
    const ytPriceUsd = prices[m.yt] ?? null;
    const lev = ytLeverage({ impliedApy: d.impliedApy, days, ytPriceUsd, accountingPriceUsd: prices[m.accountingAsset] });
    const points = pointsProfile(m, id, prices);
    const flags = [];
    if (Math.abs(d.impliedApy) > GUARD.maxApy || Math.abs(d.underlyingApy || 0) > GUARD.maxApy) flags.push('extreme APY');
    if ((d.liquidity ?? 0) < GUARD.thinLiquidityUsd) flags.push('thin liquidity');
    if (days < GUARD.nearExpiryDays) flags.push('near expiry');
    const out = {
      id,
      venue: 'pendle',
      chainId: m.chainId,
      chainName: m.chainName,
      address: m.address,
      name: m.name,
      protocol: m.protocol || null,
      categories: m.categoryIds || [],
      expiry: m.expiry,
      daysToMaturity: Math.ceil(days),
      impliedApy: d.impliedApy,
      underlyingApy: Number.isFinite(d.underlyingApy) ? d.underlyingApy : null,
      liquidityUsd: d.liquidity,
      totalTvlUsd: d.totalTvl ?? null,
      volume24hUsd: d.tradingVolume ?? null,
      yt: addr(m.yt),
      pt: addr(m.pt),
      underlying: addr(m.underlyingAsset),
      ytPriceUsd,
      leverage: lev.leverage,
      leverageSource: lev.source,
      hasPoints: points.programs.length > 0,
      points: { ...points, ...(farmMath({ leverage: lev.leverage, rate: points.rate, underlyingApy: d.underlyingApy, days }) || {}) },
      flags,
      distorted: flags.length > 0,
      change7d: null,
      band: { status: 'unavailable', days: 0, min: null, max: null, percentile: null },
    };
    try {
      Object.assign(out, computeBand(await dailyHistory(m.chainId, m.address, now), d.impliedApy, now));
    } catch (e) {
      warnings.push(`${m.name} (${m.chainName}) history: ${e.message}`);
    }
    return out;
  });

  const order = new Map(CHAINS.map((c, i) => [c.id, i]));
  return {
    updatedAt: new Date(now).toISOString(),
    source: 'api-v2.pendle.finance',
    ethUsd: prices[`${ROBINHOOD_CHAIN_ID}-${NATIVE}`] ?? null,
    minLiquidityUsd: MIN_LIQUIDITY_USD,
    guard: GUARD,
    bandDays: BAND_DAYS,
    minBandDays: MIN_BAND_DAYS,
    pointsUnit: POINTS_CONFIG.unit,
    chains: CHAINS.map(({ id, name, short, explorer, minLiquidityUsd }) => ({ id, name, short, explorer, minLiquidityUsd })),
    markets: markets.sort((a, b) => order.get(a.chainId) - order.get(b.chainId) || b.liquidityUsd - a.liquidityUsd),
    warnings,
  };
}

// Five-minute in-memory cache per warm instance, with concurrent callers sharing one fetch.
let cache = null;
let inflight = null;
export async function getMarkets({ maxAgeMs = CACHE_TTL_MS } = {}) {
  if (cache && Date.now() - cache.at < maxAgeMs) return cache.data;
  if (!inflight) {
    inflight = buildMarkets()
      .then(data => { cache = { at: Date.now(), data }; return data; })
      .finally(() => { inflight = null; });
  }
  try {
    return await inflight;
  } catch (e) {
    if (cache) return cache.data; // serve the last good board rather than an error
    throw e;
  }
}
