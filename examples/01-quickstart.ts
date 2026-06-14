/**
 * 01 · Quickstart — fetch one page of the news feed for a ticker.
 *
 *   npm run quickstart
 *   npm run quickstart -- TSLA      # any ticker
 *
 * Shows: client construction, `news.list(...)` with filters, and reading the
 * enriched fields (relevance score, category, AI sentiment) off each article.
 */
import { createClient, tickerArg, heading, printArticle, sentimentForTicker, sentiment, c, printRateLimit } from "./_shared.js";

const client = createClient();
const symbol = tickerArg("NVDA");

heading(`Top news for ${symbol} (relevance ≥ 7)`);

// One page of the main feed, newest first, filtered to a single ticker.
const page = await client.news.list({
  symbol,
  minRelevance: 7, // 1–10; the server defaults to 6
  collapseStories: true, // fold reprints of the same story into one
});

if (page.results.length === 0) {
  console.log(c.dim("No articles matched. Try a lower relevance or a different ticker."));
} else {
  page.results.forEach((article, i) => {
    printArticle(article, i + 1);
    // Each article carries AlphaAI's per-ticker AI read of the story:
    console.log(`    ${c.dim("AI view:")} ${sentiment(sentimentForTicker(article, symbol))}`);
  });
}

console.log();
console.log(c.dim(`next_cursor: ${page.next_cursor ?? "(end of feed)"}`));
printRateLimit(client);
