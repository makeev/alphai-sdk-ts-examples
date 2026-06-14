/**
 * Shared helpers for the examples: env loading, a client factory, tiny
 * zero-dependency ANSI helpers, and a few formatters for AlphaAI models.
 *
 * Nothing here is required to use the SDK — it just keeps the example scripts
 * focused on the API calls rather than on console plumbing.
 */
import { AlphaAI, MissingAPIKeyError } from "alphai-sdk";
import type { RichNewsArticle } from "alphai-sdk";

/**
 * Load `.env` from the project root if it exists (Node ≥20.12). If there's no
 * `.env` file we silently fall back to whatever is already in the environment,
 * so `ALPHAI_API_KEY=… npm run quickstart` works too.
 */
export function loadEnv(): void {
  try {
    process.loadEnvFile();
  } catch {
    /* no .env file — rely on the ambient environment */
  }
}

/** Build a client from `ALPHAI_API_KEY`, with a friendly error if it's missing. */
export function createClient(): AlphaAI {
  loadEnv();
  try {
    // No apiKey passed → the SDK reads process.env.ALPHAI_API_KEY for us.
    return new AlphaAI();
  } catch (err) {
    if (err instanceof MissingAPIKeyError) {
      console.error(
        `${c.red("✗ No API key found.")}\n` +
          `  Copy ${c.bold(".env.example")} to ${c.bold(".env")} and add your key, or run:\n` +
          `  ${c.dim("ALPHAI_API_KEY=ak_live_… npm run quickstart")}\n` +
          `  Get a key at ${c.cyan("https://alphai.io/account/api-keys")}`,
      );
      process.exit(1);
    }
    throw err;
  }
}

/** Read a ticker from the CLI (`npm run dashboard -- TSLA`), with a default. */
export function tickerArg(fallback: string): string {
  const arg = process.argv[2];
  return (arg && arg.trim() ? arg.trim() : fallback).toUpperCase();
}

/* --------------------------------------------------------------------------
 * Tiny ANSI color helpers — no dependency, respects NO_COLOR and non-TTY pipes.
 * ------------------------------------------------------------------------ */
const useColor = Boolean(process.stdout.isTTY) && !process.env.NO_COLOR;
const sgr = (code: number) => (s: string | number) =>
  useColor ? `\x1b[${code}m${s}\x1b[0m` : String(s);

export const c = {
  bold: sgr(1),
  dim: sgr(2),
  red: sgr(31),
  green: sgr(32),
  yellow: sgr(33),
  blue: sgr(34),
  magenta: sgr(35),
  cyan: sgr(36),
  gray: sgr(90),
};

/** A section header printed above each block of output. */
export function heading(title: string): void {
  console.log(`\n${c.bold(c.cyan(`▸ ${title}`))}`);
  console.log(c.dim("─".repeat(Math.min(title.length + 2, 60))));
}

/* --------------------------------------------------------------------------
 * Formatters for AlphaAI response models.
 * ------------------------------------------------------------------------ */

/** Color a 1–10 relevance score: green ≥8, yellow ≥6, gray below. */
export function relevance(score: number): string {
  const label = `${score}/10`;
  if (score >= 8) return c.green(c.bold(label));
  if (score >= 6) return c.yellow(label);
  return c.gray(label);
}

/** Turn an AI sentiment string into a small colored indicator. */
export function sentiment(value?: string): string {
  switch (value) {
    case "positive":
      return c.green("▲ positive");
    case "negative":
      return c.red("▼ negative");
    case "neutral":
      return c.gray("● neutral");
    default:
      return c.dim("– n/a");
  }
}

/** Short, human local timestamp from an ISO 8601 string. */
export function when(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  return d.toLocaleString(undefined, {
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

/**
 * Format a monetary value WITHOUT losing precision. AlphaAI returns money as
 * decimal strings on purpose (JS floats lose precision on large dollar
 * amounts), so we only insert thousands separators — never `parseFloat`.
 */
export function usd(value: string | null): string {
  if (value == null) return c.dim("—");
  const negative = value.startsWith("-");
  const [intPart = "0", frac] = value.replace("-", "").split(".");
  const grouped = intPart.replace(/\B(?=(\d{3})+(?!\d))/g, ",");
  return `${negative ? "-" : ""}$${grouped}${frac ? "." + frac : ""}`;
}

/**
 * Pull the AI sentiment a given article assigned to a specific ticker
 * (an article can mention several tickers, each analyzed separately).
 */
export function sentimentForTicker(
  article: RichNewsArticle,
  ticker: string,
): string | undefined {
  const analyses = article.enrichment.ai_trading_insights?.ticker_analysis ?? [];
  const match = analyses.find((a) => a.ticker.toUpperCase() === ticker.toUpperCase());
  return match?.impact_analysis?.sentiment;
}

/** Print one article as a compact, readable block. */
export function printArticle(article: RichNewsArticle, index?: number): void {
  const { original, enrichment } = article;
  const n = index === undefined ? "" : c.dim(`${String(index).padStart(2)}. `);
  const tickers = enrichment.tickers.length
    ? c.magenta(enrichment.tickers.join(" "))
    : c.dim("(no tickers)");

  console.log(
    `${n}[${relevance(enrichment.relevance_score)}] ${c.bold(original.title)}`,
  );
  console.log(
    `    ${c.dim(original.source)} · ${c.dim(when(original.time_published))} · ` +
      `${c.blue(String(enrichment.category))} · ${tickers}`,
  );
  if (article.sources_count && article.sources_count > 1) {
    console.log(c.dim(`    ↳ collapsed story across ${article.sources_count} sources`));
  }
}

/** Print the rate-limit snapshot the client captured from the last response. */
export function printRateLimit(client: AlphaAI): void {
  const rl = client.lastRateLimit;
  if (!rl || rl.limit == null) {
    console.log(c.dim("rate limit: (not reported on this response)"));
    return;
  }
  const reset = rl.reset ? new Date(rl.reset * 1000).toLocaleTimeString() : "?";
  console.log(
    c.dim(
      `rate limit: ${rl.remaining ?? "?"}/${rl.limit} remaining · resets ${reset}`,
    ),
  );
}
