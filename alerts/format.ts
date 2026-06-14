/**
 * Turn a raw `RichNewsArticle` into a normalized `Alert`, then render it for
 * each delivery channel (console, Telegram HTML, Slack blocks, generic JSON).
 */
import type { RichNewsArticle } from "alphai-sdk";

/** Channel-agnostic, fully-resolved alert payload. */
export interface Alert {
  uid: string;
  /** The watched ticker that surfaced this article ("" in trending mode). */
  ticker: string;
  title: string;
  url: string;
  source: string;
  category: string;
  relevance: number;
  /** ISO 8601. */
  publishedAt: string;
  sentiment?: string;
  summary: string;
  /** All validated tickers AlphaAI linked to the story. */
  tickers: string[];
}

/** Pull the AI sentiment a story assigned to `ticker` (else the first one). */
function sentimentFor(article: RichNewsArticle, ticker: string): string | undefined {
  const analyses = article.enrichment.ai_trading_insights?.ticker_analysis ?? [];
  const match =
    analyses.find((a) => a.ticker.toUpperCase() === ticker.toUpperCase()) ?? analyses[0];
  return match?.impact_analysis?.sentiment;
}

export function toAlert(article: RichNewsArticle, ticker: string): Alert {
  const { original, enrichment } = article;
  return {
    uid: original.uid,
    ticker: ticker.toUpperCase(),
    title: original.title,
    url: original.url,
    source: original.source,
    category: String(enrichment.category),
    relevance: enrichment.relevance_score,
    publishedAt: original.time_published,
    sentiment: sentimentFor(article, ticker),
    summary: original.summary ?? "",
    tickers: enrichment.tickers,
  };
}

/* ----------------------------- presentation ----------------------------- */

export function relevanceEmoji(score: number): string {
  if (score >= 9) return "🔴";
  if (score >= 8) return "🟠";
  return "🟡";
}

export function sentimentEmoji(sentiment?: string): string {
  switch (sentiment) {
    case "positive":
      return "📈";
    case "negative":
      return "📉";
    case "neutral":
      return "➖";
    default:
      return "•";
  }
}

function truncate(text: string, max: number): string {
  const clean = text.replace(/\s+/g, " ").trim();
  return clean.length > max ? clean.slice(0, max - 1).trimEnd() + "…" : clean;
}

function shortTime(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  return d.toLocaleString(undefined, {
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function header(alert: Alert): string {
  const tickerPart = alert.ticker || alert.tickers.slice(0, 3).join(" ") || "market";
  return `${tickerPart} · relevance ${alert.relevance}/10 · ${alert.category}`;
}

/* ------------------------------- console -------------------------------- */

// Tiny self-contained ANSI helpers (respect NO_COLOR / non-TTY).
const color = Boolean(process.stdout.isTTY) && !process.env.NO_COLOR;
const paint = (code: number) => (s: string) => (color ? `\x1b[${code}m${s}\x1b[0m` : s);
const bold = paint(1);
const dim = paint(2);

export function renderConsole(alert: Alert): string {
  const head = `${relevanceEmoji(alert.relevance)} ${bold(alert.title)}`;
  const meta = dim(
    `   ${header(alert)} · ${alert.source} · ${shortTime(alert.publishedAt)}`,
  );
  const ai = dim(
    `   ${sentimentEmoji(alert.sentiment)} ${alert.sentiment ?? "n/a"} — ${truncate(alert.summary, 140)}`,
  );
  const link = dim(`   ${alert.url}`);
  return [head, meta, ai, link].join("\n");
}

/* ------------------------------- Telegram ------------------------------- */

function escapeHtml(s: string): string {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

/** HTML body for the Telegram Bot API `sendMessage` (parse_mode: "HTML"). */
export function renderTelegramHtml(alert: Alert): string {
  return [
    `${relevanceEmoji(alert.relevance)} <b>${escapeHtml(header(alert))}</b>`,
    `<b>${escapeHtml(alert.title)}</b>`,
    `${sentimentEmoji(alert.sentiment)} ${escapeHtml(alert.sentiment ?? "n/a")} — ${escapeHtml(truncate(alert.summary, 220))}`,
    `<i>${escapeHtml(alert.source)} · ${escapeHtml(shortTime(alert.publishedAt))}</i>`,
    `<a href="${escapeHtml(alert.url)}">Read more →</a>`,
  ].join("\n");
}

/* -------------------------------- Slack --------------------------------- */

function escapeSlack(s: string): string {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

/** Payload for a Slack Incoming Webhook (fallback `text` + rich `blocks`). */
export function renderSlack(alert: Alert): Record<string, unknown> {
  const fallback = `[${alert.relevance}/10] ${alert.title}`;
  return {
    text: fallback, // shown in notifications / where blocks aren't rendered
    blocks: [
      {
        type: "section",
        text: {
          type: "mrkdwn",
          text: `${relevanceEmoji(alert.relevance)} *<${alert.url}|${escapeSlack(alert.title)}>*\n${escapeSlack(header(alert))}`,
        },
      },
      {
        type: "context",
        elements: [
          {
            type: "mrkdwn",
            text: `${sentimentEmoji(alert.sentiment)} *${alert.sentiment ?? "n/a"}* · ${escapeSlack(alert.source)} · ${escapeSlack(shortTime(alert.publishedAt))} — ${escapeSlack(truncate(alert.summary, 180))}`,
          },
        ],
      },
    ],
  };
}

/* --------------------------- generic webhook ---------------------------- */

/** A stable JSON envelope for arbitrary consumers (Zapier/Make/n8n/custom). */
export function renderWebhook(alert: Alert): Record<string, unknown> {
  return { event: "alphai.news.alert", alert };
}
