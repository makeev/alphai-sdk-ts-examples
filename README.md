# alphai-sdk-ts-examples

Runnable TypeScript examples for [**alphai-sdk**](https://www.npmjs.com/package/alphai-sdk) —
the typed client for the [AlphaAI](https://alphai.io) REST API: relevance-scored,
ticker-linked financial news plus SEC Form 4 insider data.

Each script is small, self-contained, and runs against the live API. Together they
cover the whole SDK surface: the `news.*` and `symbols.*` namespaces, async
pagination, parallel composition, typed errors, and rate-limit inspection.

> The SDK has **zero runtime dependencies** and runs on Node ≥18, browsers, edge,
> Deno, and Bun. These examples use [`tsx`](https://github.com/privatenumber/tsx)
> to run TypeScript directly and Node's built-in `.env` loader, so the only
> dependencies here are dev tooling.

---

## Quick start

```bash
# 1. install
npm install

# 2. add your API key  (get one at https://alphai.io/account/api-keys)
cp .env.example .env
#   then edit .env and paste your ak_live_… key

# 3. run any example
npm run quickstart
npm run dashboard -- TSLA
```

No `.env`? Pass the key inline instead:

```bash
ALPHAI_API_KEY=ak_live_… npm run quickstart
```

---

## The examples

| Script | Command | What it shows |
| --- | --- | --- |
| [`01-quickstart.ts`](examples/01-quickstart.ts) | `npm run quickstart` | Construct a client, `news.list()` with filters, read the enriched fields. |
| [`02-paginate.ts`](examples/02-paginate.ts) | `npm run paginate` | `news.iterate()` async generator with a `maxItems` cap; tally categories while streaming. |
| [`03-trending.ts`](examples/03-trending.ts) | `npm run trending` | `news.trending()` — top stories of the last 48h. |
| [`04-ticker-dashboard.ts`](examples/04-ticker-dashboard.ts) | `npm run dashboard` | Compose **four** endpoints in parallel into one report. |
| [`05-insider.ts`](examples/05-insider.ts) | `npm run insider` | `symbols.insiderSummary()` (decimal-string money) + the insider news feed. |
| [`06-errors-and-ratelimits.ts`](examples/06-errors-and-ratelimits.ts) | `npm run errors` | Typed error hierarchy + `client.lastRateLimit`. |
| [`07-symbols.ts`](examples/07-symbols.ts) | `npm run symbols` | `symbols.list()` discovery and `symbols.get()` detail. |

Most scripts take an optional ticker argument:

```bash
npm run quickstart -- NVDA
npm run dashboard  -- MSFT
npm run insider    -- AAPL
```

Type-check everything without running:

```bash
npm run typecheck
```

---

## A real app: the news-alert bot (`alerts/`)

A small, deployable service that turns the SDK into a **financial-news alerting
bot**. Each poll it fetches the feed for your watchlist, keeps only the unseen
high-relevance stories, and pushes them to **Telegram, Slack, and/or any
webhook** — deduplicating across runs so nothing is delivered twice.

```bash
# Poll once (cron / GitHub Actions friendly), console output:
npm run alerts

# Long-lived: poll every POLL_INTERVAL_SECONDS until Ctrl-C:
npm run alerts:watch

# See it format real alerts right now, without any tokens:
npm run alerts -- --dry-run --backfill=3
```

**Channels** are configured by env (see [`.env.example`](.env.example)); each is
active only when its variables are set. Console output is always on for local
visibility, and `--dry-run` keeps everything local.

| Channel | How to enable |
| --- | --- |
| **Console** | always on (and the only channel under `--dry-run`) |
| **Telegram** | `TELEGRAM_BOT_TOKEN` + `TELEGRAM_CHAT_ID` (Bot API `sendMessage`, HTML) |
| **Slack** | `SLACK_WEBHOOK_URL` (Incoming Webhook, `blocks` + fallback text) |
| **Webhook** | `WEBHOOK_URL` (POSTs `{ "event": "alphai.news.alert", "alert": {…} }`) |

**Tuning** (all optional, with defaults):

| Env | Default | Meaning |
| --- | --- | --- |
| `WATCHLIST` | `NVDA,AAPL,MSFT,TSLA` | Tickers to watch, or `trending` for whole-market mode |
| `MIN_RELEVANCE` | `7` | Minimum relevance score (1–10) to alert |
| `CATEGORIES` / `EXCLUDE_CATEGORIES` | — | Restrict / drop news categories |
| `PER_TICKER_LIMIT` | `5` | Max articles per ticker per poll |
| `POLL_INTERVAL_SECONDS` | `300` | Cadence in `--watch` mode |
| `STATE_FILE` | `.alerts-state.json` | Where the seen-uid dedup state is stored |
| `FIRST_RUN_BACKFILL` | `0` | On first run, deliver N newest; the rest seed silently |

**First-run behavior.** With no state file yet, the bot establishes a *baseline*
— it marks current articles as seen **without** alerting, so you don't get blasted
with the backlog. Pass `--backfill=N` (or `FIRST_RUN_BACKFILL`) to deliver the N
newest on that first run instead.

How the pieces fit:

```
alerts/
├── index.ts      # orchestration: poll → filter unseen → deliver → persist; once or --watch
├── config.ts     # env + CLI flags → typed AppConfig
├── store.ts      # SeenStore: capped, persisted set of delivered article UIDs (dedup)
├── format.ts     # RichNewsArticle → normalized Alert → per-channel renderers
└── notifiers.ts  # Console / Slack / Telegram / Webhook (native fetch, zero deps)
```

Deploy it on a cron (`npm run alerts` every few minutes) or run `npm run
alerts:watch` as a long-lived process under your supervisor of choice.

---

## The 30-second version

```ts
import { AlphaAI } from "alphai-sdk";

const client = new AlphaAI(); // reads ALPHAI_API_KEY from the environment

// One page of NVDA news, only the high-relevance items.
const page = await client.news.list({ symbol: "NVDA", minRelevance: 7 });
for (const article of page.results) {
  console.log(`[${article.enrichment.relevance_score}] ${article.original.title}`);
}

// Auto-paginate — the generator follows next_cursor for you.
for await (const a of client.news.iterate({ symbol: "NVDA", maxItems: 100 })) {
  // …
}

// Compose endpoints in parallel.
const [detail, sentiment, insider] = await Promise.all([
  client.symbols.get("AAPL"),
  client.symbols.sentimentSummary("AAPL"),
  client.symbols.insiderSummary("AAPL"),
]);
```

---

## Things worth knowing

- **Money is decimal strings.** Fields like `buy_value_usd` and `net_value` are
  returned as strings (e.g. `"1284500.00"`) and never coerced to `number` — JS
  floats lose precision on large dollar amounts. Use a big-decimal library if you
  need arithmetic. Timestamps are ISO 8601 strings (no auto-`Date`).
- **`Symbol` type shadows the global.** The symbol model is exported as `Symbol`.
  Alias it when importing: `import type { Symbol as AlphaSymbol } from "alphai-sdk";`
- **Retries are automatic.** Idempotent GETs retry on 429 / 5xx / network errors
  with exponential backoff (configurable `maxRetries`, default 2; `0` to disable).
- **Rate limits** are per account, hourly, sliding window (Free 100 / Basic 1000 /
  Pro 10000 req/hr). Read `client.lastRateLimit` after any keyed call.
- **Never commit your key.** `.env` is git-ignored; only `.env.example` is tracked.

## Links

- SDK on npm — https://www.npmjs.com/package/alphai-sdk
- AlphaAI — https://alphai.io
- API keys — https://alphai.io/account/api-keys

## License

[MIT](LICENSE)
