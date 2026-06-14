/**
 * Configuration for the news-alert bot, assembled from environment variables
 * (primary) plus a few CLI flags. Everything has a sensible default so the bot
 * runs out of the box in console/dry-run mode.
 */
import type { CategoryFilter } from "alphai-sdk";

/** Credentials/targets for the delivery channels. A channel is active when set. */
export interface NotifierConfig {
  slackWebhookUrl?: string;
  telegramBotToken?: string;
  telegramChatId?: string;
  webhookUrl?: string;
}

export interface AppConfig {
  /** Tickers to watch. Empty array ⇒ whole-market "trending" mode. */
  watchlist: string[];
  /** Minimum relevance score (1–10) for an article to alert. */
  minRelevance: number;
  /** Restrict to these news categories (optional). */
  categories?: CategoryFilter;
  /** Drop these categories (optional). */
  excludeCategories?: CategoryFilter;
  /** Max articles to consider per ticker, per poll. */
  perTickerLimit: number;
  /** Seconds between polls in --watch mode. */
  pollIntervalSeconds: number;
  /** Where the dedup "seen uids" state is persisted. */
  stateFile: string;
  /** Loop forever (--watch) vs. poll once and exit. */
  watch: boolean;
  /** Print only; never POST to remote channels (--dry-run). */
  dryRun: boolean;
  /**
   * On the very first run (no state file yet) deliver at most this many of the
   * newest matching articles, then treat the rest as an already-seen baseline.
   * Default 0 = seed silently so you don't blast the backlog. `--backfill[=N]`.
   */
  firstRunBackfill: number;
  notifiers: NotifierConfig;
}

const DEFAULT_WATCHLIST = ["NVDA", "AAPL", "MSFT", "TSLA"];

function num(name: string, fallback: number): number {
  const raw = process.env[name];
  if (raw === undefined || raw.trim() === "") return fallback;
  const n = Number(raw);
  return Number.isFinite(n) ? n : fallback;
}

function list(name: string): string[] | undefined {
  const raw = process.env[name];
  if (raw === undefined) return undefined;
  const items = raw.split(",").map((s) => s.trim()).filter(Boolean);
  return items.length ? items : undefined;
}

interface Flags {
  watch: boolean;
  dryRun: boolean;
  trending: boolean;
  backfill: number | undefined;
}

function parseFlags(argv: string[]): Flags {
  const flags = argv.slice(2);
  const has = (f: string) => flags.includes(f);

  let backfill: number | undefined;
  const bf = flags.find((f) => f === "--backfill" || f.startsWith("--backfill="));
  if (bf) {
    const value = bf.includes("=") ? bf.split("=")[1] ?? "" : "5";
    backfill =
      value.toLowerCase() === "all"
        ? Number.POSITIVE_INFINITY
        : Math.max(0, Number.parseInt(value, 10) || 0);
  }

  return {
    watch: has("--watch"),
    dryRun: has("--dry-run"),
    trending: has("--trending"),
    backfill,
  };
}

/** Build the effective config from `process.env` and `process.argv`. */
export function loadConfig(argv: string[]): AppConfig {
  const flags = parseFlags(argv);

  // Watchlist: env WATCHLIST, the --trending flag, or the default sample list.
  // WATCHLIST=trending (or --trending, or WATCHLIST=) selects whole-market mode.
  const rawWatch = process.env.WATCHLIST;
  let watchlist: string[];
  if (flags.trending || rawWatch?.trim().toLowerCase() === "trending") {
    watchlist = [];
  } else if (rawWatch === undefined) {
    watchlist = DEFAULT_WATCHLIST;
  } else {
    watchlist = rawWatch.split(",").map((s) => s.trim().toUpperCase()).filter(Boolean);
  }

  return {
    watchlist,
    minRelevance: num("MIN_RELEVANCE", 7),
    categories: list("CATEGORIES"),
    excludeCategories: list("EXCLUDE_CATEGORIES"),
    perTickerLimit: num("PER_TICKER_LIMIT", 5),
    pollIntervalSeconds: num("POLL_INTERVAL_SECONDS", 300),
    stateFile: process.env.STATE_FILE || ".alerts-state.json",
    watch: flags.watch,
    dryRun: flags.dryRun,
    firstRunBackfill: flags.backfill ?? num("FIRST_RUN_BACKFILL", 0),
    notifiers: {
      slackWebhookUrl: process.env.SLACK_WEBHOOK_URL || undefined,
      telegramBotToken: process.env.TELEGRAM_BOT_TOKEN || undefined,
      telegramChatId: process.env.TELEGRAM_CHAT_ID || undefined,
      webhookUrl: process.env.WEBHOOK_URL || undefined,
    },
  };
}
