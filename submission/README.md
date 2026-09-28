# BANDIT

**Pendle yield bands, read by SERV Reasoning.**

Live demo: https://bandit-bands.vercel.app
Code: https://github.com/toteonsol/bandit

BANDIT is a yield-band agent for Pendle PT and YT markets. It pulls the live implied APY of every liquid Pendle market on Ethereum and Arbitrum, places today's rate inside that market's own 90-day history, and ranks the markets on a band board. Then you tell it your position size and risk level, and SERV Reasoning reads the band data and explains, in plain language, where each market sits and what the trade-offs are.

Data and reasoning only. Not financial advice.

## What you see

- **Band board.** Every Pendle market above the liquidity threshold, with its 90-day band (lowest to highest daily implied APY), today's position inside it as a percentile, days to maturity, liquidity, underlying APY, and the 7-day change in implied APY. Filter by chain, sort by any column.
- **Signal cards.** The market nearest its band floor, the one nearest its band top, and the newest market still forming its band.
- **Band notes.** Bottom and top decile readings, the biggest 7-day move, and markets close to maturity.
- **Ask BANDIT.** Enter a position size in USD, pick low, medium, or high risk, and optionally ask a question. SERV Reasoning returns a ranked read of the best-fitting markets for that risk level, the reasoning for each, and the main risks: time decay near maturity, thin liquidity, and bands that are still forming.

## How BANDIT reads a band

| Term | Meaning |
| --- | --- |
| Band | Lowest to highest daily implied APY over the last 90 days, including today. |
| Percentile | Share of those days with a lower implied APY than right now. P12 means 12% of days were lower, near floor. P90 means near top. |
| Band forming | Under 14 days of history. BANDIT shows the rate but no percentile until the band has enough days. |
| 7-day change | Implied APY now minus implied APY 7 days ago, in percentage points. |

A low percentile means the PT fixed rate sits near the bottom of its range, and YT exposure is priced near its 90-day low. A high percentile means the fixed rate sits near the top of its range.

## How it uses SERV Reasoning

`/api/ask` is a serverless function that calls SERV Reasoning through the OpenAI SDK:

- Base URL `https://inference-api.openserv.ai/v1`, model `gpt-5.4-mini` (set `SERV_MODEL` to use any other model from the SERV catalog).
- The system prompt holds BANDIT's analyst role, how to read band data, how to rank for each risk level, and the wording rules (describe, never instruct, no advice language). It stays fixed so SERV can cache its reasoning prompt.
- The user message carries the user's size, risk level, and question, plus the top 20 markets by liquidity as structured JSON: implied and underlying APY, band min, max, percentile and status, 7-day change, days to maturity, liquidity, and the position as a share of pool liquidity.
- SERV returns strict JSON (`response_format: json_schema`, `strict: true`): a headline, a ranked list with a band read, why it fits, trade-offs and watch tags per market, and the main risks. BANDIT renders each ranked market with its live band gauge next to SERV's reasoning.
- If the SERV call fails, the UI shows the error. There is no fallback model.

The key lives only in the `SERV_API_KEY` environment variable on the server. It never reaches the browser.

## Architecture

```
public/index.html   static page: board, signal cards, band notes, Ask BANDIT
api/markets.js      GET  /api/markets  live Pendle data plus computed bands, cached 5 minutes
api/ask.js          POST /api/ask      SERV Reasoning call
lib/pendle.js       Pendle API client and band math
dev-server.mjs      local server that runs the same functions
```

Data comes from Pendle's public hosted API (`api-v2.pendle.finance`): active markets per chain, current market data, and daily implied APY history. Markets below `MIN_LIQUIDITY_USD` (one constant in `lib/pendle.js`) are left out. `/api/markets` is cached for 5 minutes at the edge and in memory, so the page loads fast and Pendle is not hammered.

## Run it locally

```bash
git clone https://github.com/toteonsol/bandit
cd bandit
npm install
cp .env.example .env.local   # then paste your SERV key into SERV_API_KEY
npm run dev                  # http://localhost:3000
```

Get a SERV key at console.openserv.ai under API Keys.

## Deploy

Static page plus two serverless functions on Vercel. Add `SERV_API_KEY` under Project Settings, Environment Variables, then redeploy.

## Roadmap

A Pro tier: alerts when a market crosses a band threshold you set (for example P10 or P90), custom band windows, more chains, and more venues.

Built for the OpenServ SERV Hackathon, Edition 01, Open Track.
