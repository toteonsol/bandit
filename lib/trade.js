// Builds YT trades on Robinhood Chain through Pendle's hosted convert API (POST /v3/sdk/4663/convert).
// Buys start from native ETH through Pendle's aggregator routing, so a wallet needs nothing but ETH.
import { parseEther } from 'viem';
import { pendle, NATIVE, ROBINHOOD_CHAIN_ID } from './pendle.js';
import { tokenDecimals } from './chain.js';

export const PENDLE_ROUTER = '0x888888888889758f76e7103c6cbf23abbf58f946';

function pickRoute(res) {
  const route = res?.routes?.[0];
  if (!route?.tx?.data) throw new Error('Pendle returned no route for this trade.');
  if (String(route.tx.to).toLowerCase() !== PENDLE_ROUTER) throw new Error('Pendle route targets an unexpected contract, so BANDIT refused it.');
  return route;
}

function summarize(route) {
  const d = route.data || {};
  return {
    priceImpact: Number.isFinite(d.priceImpact) ? d.priceImpact : null,
    feeUsd: d.fee?.usd ?? null,
    impliedApyAfter: d.impliedApy?.after ?? null,
    effectiveApy: Number.isFinite(d.effectiveApy) ? d.effectiveApy : null,
    aggregator: d.aggregatorType || null,
  };
}

// Buy YT with `usd` worth of native ETH, delivered to `receiver`.
export async function quoteBuyYt({ market, usd, receiver, slippage, ethUsd }) {
  if (market.chainId !== ROBINHOOD_CHAIN_ID) throw new Error('BANDIT only trades on Robinhood Chain.');
  if (!(ethUsd > 0)) throw new Error('No ETH price available right now.');
  const wei = parseEther((usd / ethUsd).toFixed(18));
  const res = await pendle(`/v3/sdk/${ROBINHOOD_CHAIN_ID}/convert`, {
    method: 'POST',
    retries: 1,
    timeout: 25_000,
    body: {
      receiver,
      slippage,
      enableAggregator: true,
      inputs: [{ token: NATIVE, amount: wei.toString() }],
      outputs: [market.yt],
      additionalData: 'impliedApy,effectiveApy',
    },
  });
  const route = pickRoute(res);
  const value = BigInt(route.tx.value ?? wei);
  if (value !== wei) throw new Error('Pendle route value does not match the requested amount, so BANDIT refused it.');
  const decimals = await tokenDecimals(market.yt);
  const ytOutRaw = BigInt(route.outputs?.[0]?.amount || '0');
  return {
    side: 'buy',
    marketId: market.id,
    usd,
    ethIn: Number(wei) / 1e18,
    ytOut: Number(ytOutRaw) / 10 ** decimals,
    ytOutRaw: ytOutRaw.toString(),
    ...summarize(route),
    tx: { to: route.tx.to, data: route.tx.data, value: `0x${value.toString(16)}` },
    approvals: res.requiredApprovals || [],
  };
}

// Sell `amountRaw` YT back to native ETH for `receiver`.
export async function quoteSellYt({ market, amountRaw, receiver, slippage, ethUsd }) {
  const res = await pendle(`/v3/sdk/${ROBINHOOD_CHAIN_ID}/convert`, {
    method: 'POST',
    retries: 1,
    timeout: 25_000,
    body: {
      receiver,
      slippage,
      enableAggregator: true,
      inputs: [{ token: market.yt, amount: amountRaw.toString() }],
      outputs: [NATIVE],
      additionalData: 'impliedApy,effectiveApy',
    },
  });
  const route = pickRoute(res);
  if (route.tx.value && BigInt(route.tx.value) !== 0n) throw new Error('A YT sale should not send ETH, so BANDIT refused the route.');
  const decimals = await tokenDecimals(market.yt);
  const ethOut = Number(BigInt(route.outputs?.[0]?.amount || '0')) / 1e18;
  return {
    side: 'sell',
    marketId: market.id,
    ytIn: Number(BigInt(amountRaw)) / 10 ** decimals,
    ytInRaw: amountRaw.toString(),
    ethOut,
    usd: ethUsd > 0 ? ethOut * ethUsd : null,
    ...summarize(route),
    tx: { to: route.tx.to, data: route.tx.data, value: '0x0' },
    approvals: res.requiredApprovals || [],
  };
}
