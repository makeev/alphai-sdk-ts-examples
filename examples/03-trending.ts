/**
 * 03 · Trending — the top stories across the market right now.
 *
 *   npm run trending
 *
 * Shows: `news.trending()` — up to 10 ranked, high-relevance (score ≥ 8)
 * stories from the last 48 hours, reprints already collapsed. Not paginated.
 */
import { createClient, heading, printArticle, c, printRateLimit } from "./_shared.js";

const client = createClient();

heading("Trending in the last 48h");

const stories = await client.news.trending();

if (stories.length === 0) {
  console.log(c.dim("Nothing trending right now."));
} else {
  stories.forEach((article, i) => {
    printArticle(article, i + 1);
    // trending() summaries are AI-generated and safe to redistribute.
    const summary = article.original.summary;
    if (summary) {
      const trimmed = summary.length > 160 ? summary.slice(0, 157) + "…" : summary;
      console.log(`    ${c.dim(trimmed)}`);
    }
  });
}

console.log();
printRateLimit(client);
