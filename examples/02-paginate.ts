/**
 * 02 · Pagination — async-iterate the feed and aggregate as you go.
 *
 *   npm run paginate
 *   npm run paginate -- AAPL
 *
 * Shows: `news.iterate(...)`, an AsyncGenerator that follows `next_cursor` for
 * you. We cap the work with `maxItems` and tally categories while streaming —
 * you never touch a cursor yourself.
 */
import { createClient, tickerArg, heading, relevance, c } from "./_shared.js";

const client = createClient();
const symbol = tickerArg("AAPL");
const MAX = 60;

heading(`Streaming up to ${MAX} articles for ${symbol}`);

const byCategory = new Map<string, number>();
let count = 0;
let relevanceSum = 0;

// The generator fetches page after page under the hood, stopping at maxItems.
for await (const article of client.news.iterate({ symbol, maxItems: MAX })) {
  count += 1;
  relevanceSum += article.enrichment.relevance_score;
  const cat = String(article.enrichment.category);
  byCategory.set(cat, (byCategory.get(cat) ?? 0) + 1);

  // Light progress line so you can see the stream advancing (interactive only;
  // \r overwrites in place on a TTY, so skip it when output is piped).
  if (process.stdout.isTTY) {
    process.stdout.write(`\r  ${c.dim(`fetched ${count} articles…`)}        `);
  }
}
if (process.stdout.isTTY) process.stdout.write("\n");
process.stdout.write("\n");

if (count === 0) {
  console.log(c.dim("No articles found for this ticker."));
} else {
  console.log(`${c.bold(String(count))} articles · avg relevance ${relevance(Math.round((relevanceSum / count) * 10) / 10)}`);
  console.log(c.dim("\nbreakdown by category:"));
  for (const [cat, n] of [...byCategory.entries()].sort((a, b) => b[1] - a[1])) {
    const bar = "█".repeat(n);
    console.log(`  ${cat.padEnd(20)} ${c.cyan(bar)} ${c.dim(String(n))}`);
  }
}
