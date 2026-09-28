# BANDIT

**The YT trading agent that works while you sleep.**

Live app: https://bandit-bands.vercel.app
Code: https://github.com/toteonsol/bandit
Track: Mainnet & MCP (Robinhood Chain), OpenServ SERV Hackathon Edition 01

A YT's price moves with its implied APY, yet nobody shows traders whether a YT is cheap or expensive against its own history. BANDIT places every Pendle YT in its own 90-day range and shows its **room to run**: what it would gain if its rate returned to its 90-day high, and what it would lose back at its low, before decay runs out the clock. Then it runs an autonomous agent on **Robinhood Chain** that trades your rules only when **SERV Reasoning** agrees. Farming points? BANDIT also prices a point: **cost per 1,000 points**.

Data and reasoning only. Not financial advice.

## What you can do

**No wallet needed**
- **Home.** Where the YTs sit right now: most room to run, already at the top, biggest 7-day move. Robinhood Chain markets come first, including tokenized NVDA, PFE and SGOV, each with its range and room to run.
- **Points.** For airdrop hunters: every YT with a points program, points per day per $100, cost per 1,000 points, decay by maturity and YT leverage.
- **Band board.** Implied APY placed in its 90-day band: P12 means only 12% of days were lower.
- **Ask BANDIT.** Ask in plain words ("Which YTs are near their floor right now?", "Is YT-NVDA a good entry?"). Free, no wallet needed, nothing is traded. SERV Reasoning ranks the YTs and says where each one sits against its own history, how far it could run, and what could go wrong. Every pick has one-tap actions (watch it with your agent, Telegram alert, trade on Robinhood Chain) and every answer gets a share link and an image card.
- **Telegram alerts.** Pick a market and a band trigger, tap Start in Telegram, and get SERV Reasoning's read when it fires.

**With your own wallet (Rabby, MetaMask, any browser wallet)**
- **Trade with BANDIT.** BANDIT builds the Pendle trade on Robinhood Chain from plain ETH, SERV Reasoning confirms or holds off with a reason, and you sign it yourself. BANDIT never holds your funds.

**Autonomous agent (owner)**
- Set a **band rule** (enter or exit a YT when its band percentile crosses a level) or **Farm mode** (buy the cheapest points under your max cost, skip the top 20% of each band, rotate near maturity or when another market is 30% cheaper per point).
- Every 10 minutes the watcher checks each rule. On a trigger it gets a live Pendle quote, and **SERV Reasoning must confirm with a written reason** before anything happens.
- Trades run on Robinhood Chain from the agent wallet, and every one is simulated first. Telegram gets the points math and the reason. Receipts link each trade to the explorer, and a points ledger tracks estimated points and decay.
- **Agent Live** visualizes each run step by step: scan, rules, quote, SERV Reasoning, Robinhood Chain, Telegram.

## How BANDIT reads a range

YT price in underlying is `1 - (1 + implied)^(-days/365)`, so a YT gains when its implied APY rises. BANDIT takes the lowest and highest daily implied APY of the last 90 days (the band), places today's rate in it as a percentile, and computes room to run: the YT's value at the band high and at the band low, divided by its value now. A big gain with a small loss reads as room to run. About zero gain reads as already at the top.

## How BANDIT prices a point

For a YT held to maturity, per $1 spent:

| Quantity | Formula |
| --- | --- |
| YT leverage | underlying exposure per $1 of YT, from Pendle prices (falls back to `1 / (1 - (1 + implied)^(-days/365))`) |
| Points earned | leverage x points rate x days to maturity |
| Value back | leverage x underlying APY x days / 365 (the yield the YT collects, if rates hold) |
| Decay cost | 1 - value back |
| Cost per 1,000 points | decay cost / points earned x 1,000 |

- The points rate comes from Pendle's published multipliers, in Pendle units: 1 point is a 1x multiplier on $1 for 1 day.
- `points-config.json` holds what Pendle does not publish: project names, statuses (confirmed points, speculative airdrop, none known), optional base rates to convert to a program's real points, and AirdropSea guide links.
- BANDIT never invents a rate. Unknown rates show as "rate unknown" and stay out of the cost ranking.
- **Outlier guard:** markets with APY above 200%, under $50K of liquidity, or under 7 days to maturity are labelled distorted and kept out of rankings and agent entries.

## How it uses SERV Reasoning

Three places, all through the OpenAI SDK against `https://inference-api.openserv.ai/v1` (model `gpt-5.4-mini`, strict `json_schema` output):

1. **Risk gate.** Before the agent acts, or before a user signs, SERV weighs band position, points cost, decay, liquidity and the live price impact. It returns `confirm` or `reject` with a headline and a plain-language reason, for example "cheapest points on the board, but only 9 days left, so decay is fast". Only a confirmed trigger proceeds, and the code still enforces the hard caps on top.
2. **Ask BANDIT.** A ranked, plain-language read of the live board for the user's question, size and risk level. Answers are saved for 30 days so they can be shared by link.
3. **Alerts.** A short read attached to each Telegram alert.

There is no fallback model. If SERV fails, the agent does nothing and the UI says so.

## Safety

- Hard caps in code: $25 per trade, $100 per day, 5% maximum price impact, 3% maximum slippage, no entries under 3 days to maturity.
- Only allowlisted Robinhood Chain markets are traded, and distorted ones are refused.
- Transactions only go to Pendle's router, and every one is simulated before it is sent.
- Dry run by default. Nothing is sent until `AGENT_LIVE=true`, and `AGENT_PAUSED=true` stops everything.
- Secrets live only in server env vars and never reach the browser. Trading rules need the owner key.

## Architecture

```
public/            index.html, app.css, app.js, art/ (illustrations)
api/markets.js     GET  live Pendle markets, bands, points economics (cached 5 min)
api/ask.js         POST Ask BANDIT (SERV Reasoning); GET a saved answer by id
api/share.js       GET  /a/<id> share links with preview tags for X and Telegram
api/agent.js       GET  agent status, rules, receipts, ledger, last run trace; POST rules, run now, alerts
api/watch.js       GET  scheduled watcher (Vercel cron, every 10 minutes)
api/trade.js       POST Trade with BANDIT: quote plus SERV review for a user's own wallet
api/telegram.js    POST Telegram bot webhook (/start deep links)
lib/pendle.js      Pendle API client, band math, points math
lib/agent.js       rules, SERV gate, caps, execution, watcher, ledger
lib/trade.js       Pendle convert API (ETH to YT and back) on Robinhood Chain
lib/chain.js       Robinhood Chain clients (viem)
lib/serv.js        SERV Reasoning client
lib/store.js       Upstash Redis (rules, receipts, positions)
lib/telegram.js    Telegram Bot API
points-config.json editable points data
```

Data comes from Pendle's hosted API (`api-v2.pendle.finance`): active markets, daily implied APY history, asset prices, and `POST /v3/sdk/4663/convert` for trade calldata on Robinhood Chain (chain 4663).

## Run it

```bash
git clone https://github.com/toteonsol/bandit && cd bandit
npm install
cp .env.example .env.local   # fill in what you have
npm run dev                  # http://localhost:3000
```

Environment variables: `SERV_API_KEY`, `OWNER_KEY`, `TELEGRAM_BOT_TOKEN`, `AGENT_PRIVATE_KEY` (a fresh wallet funded with a little ETH on Robinhood Chain), Upstash Redis (`KV_REST_API_URL` and `KV_REST_API_TOKEN`), optional `AGENT_LIVE=true`, `AGENT_PAUSED=true`, `CRON_SECRET`, `SERV_MODEL`, `PUBLIC_URL`.

## Roadmap

- Agent accounts for everyone: a smart account per user (email or passkey login), funded by the user, with a session key that lets BANDIT trade only within that user's caps. That gives the same one-tap feel without BANDIT holding anyone's money.
- A Pro tier with more rules, faster checks, more markets and chains, and custom band thresholds, plus an optional per-trade fee.
- Verified base rates per points program, so costs read in each program's real points.
