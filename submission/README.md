# BANDIT

**The YT trading agent that works while you sleep.**

Live app: https://bandit.web3wikis.com
Code: https://github.com/toteonsol/bandit
Track: Mainnet & MCP (Robinhood Chain), OpenServ SERV Hackathon Edition 01

A YT's price rises and falls with the yield the market expects, yet nobody tells traders whether a YT is cheap or already at its top. BANDIT grades every Pendle YT for entry against its own last 90 days, answers "which YTs are cheap right now?" in plain words, and runs agents on **Robinhood Chain** that trade your rules only when **SERV Reasoning** agrees. You can watch them work live.

Data and reasoning only. Not financial advice.

## What you can do

**No wallet needed**
- **Markets, graded for entry.** Every YT gets a grade from A to D (or New, or Risky) from its price against its own 90 days (45%), room to run against the downside (25%), time left (15%) and pool size (15%), plus a small bonus for a points program. Best entries come first; tap a row for the plain reasons and one-tap actions.
- **Ask BANDIT.** Ask in plain words. SERV Reasoning ranks the live board for beginners, every pick has actions (watch it with your agent, Telegram alert, trade), and every answer gets a share link and an image card.
- **Home.** Most room to run, already at the top, biggest move this week, and the Robinhood Chain markets (tokenized NVDA, PFE, SGOV and more). Farming points? Cost per 1,000 points for every YT with a points program.
- **Telegram alerts.** Pick a market and a trigger, tap Start in Telegram, and get SERV Reasoning's read when it fires.
- **Agent World.** A live animated scene of an agent at work, driven by real runs: the market board, the rules, SERV Reasoning, Robinhood Chain and Telegram. Stream it fullscreen (or open `/#/stream` as an OBS browser source) and record MP4 clips in 16:9 or 9:16.

**With your own wallet (Rabby, MetaMask, any browser wallet)**
- **My agent.** Free: sign a message, start with $1,000 of practice money, and arm rules like "buy $100 of this YT when it gets cheap". It checks every 10 minutes on its own and SERV has to agree before anything moves. On Robinhood Chain it can prepare real trades you approve with one tap.
- **Activity.** Every check (including the ones where nothing needed doing), every trade and every SERV decision.
- **Trade with BANDIT.** BANDIT builds the Pendle trade on Robinhood Chain from plain ETH, SERV Reasoning confirms or holds off with a reason, and you sign it yourself.
- **Top up Robinhood Chain.** One signature bridges ETH from Base, Arbitrum, Optimism or Ethereum through Relay, with fees and arrival time shown up front. Trades need only ETH, no USDC. BANDIT never holds your funds.

**The house agent (owner)**
- Band rules or Farm mode, checked every 10 minutes. On a trigger it gets a live Pendle quote, and **SERV Reasoning must confirm with a written reason** before anything happens.
- Trades run from the agent wallet on Robinhood Chain with hard caps in code ($25 a trade, $100 a day, 5% maximum price impact, allowlist, kill switch), and every transaction is simulated first. Receipts link each trade to the explorer.

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
2. **Ask BANDIT.** A ranked read for the user's size, goal and risk level.
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
api/ask.js         POST Ask BANDIT (SERV Reasoning)
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
