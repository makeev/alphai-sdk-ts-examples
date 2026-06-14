/**
 * 05 · Insider trading — SEC Form 4 rollups and the insider news feed.
 *
 *   npm run insider
 *   npm run insider -- AAPL
 *
 * Shows: `symbols.insiderSummary(...)` (a 30-day Form 4 rollup whose money
 * fields are decimal STRINGS, kept precise) and `news.iterateInsider(...)`
 * (the `category=insider` feed: Form 4 filings + institutional stakes).
 */
import { createClient, tickerArg, heading, usd, when, c } from "./_shared.js";

const client = createClient();
const symbol = tickerArg("AAPL");

// --- 30-day Form 4 rollup -------------------------------------------------
heading(`${symbol} · insider summary (last 30 days)`);
const s = await client.symbols.insiderSummary(symbol);

console.log(`  transactions:  ${c.bold(String(s.total_transactions))}`);
console.log(`  buys:          ${c.green(String(s.buy_count))}  worth ${usd(s.buy_value_usd)}`);
console.log(`  sells:         ${c.red(String(s.sell_count))}  worth ${usd(s.sell_value_usd)}`);
console.log(`  10b5-1 plans:  ${s.pct_10b5_1}% of transactions`);

// IMPORTANT: buy_value_usd / sell_value_usd / net_value are decimal STRINGS,
// never coerced to number — JS floats lose precision on large dollar amounts.
// Feed them to a big-decimal library if you need to do arithmetic.
console.log(c.dim(`  (raw buy_value_usd = ${JSON.stringify(s.buy_value_usd)} — a string, not a number)`));

if (s.top_insiders.length) {
  console.log(c.dim("\n  top insiders by net value:"));
  for (const p of s.top_insiders) {
    const role = p.title ? c.dim(` · ${p.title}`) : "";
    console.log(`    ${p.name.padEnd(26)}${role}  net ${usd(p.net_value)}  ${c.dim(`(${p.transaction_count} tx)`)}`);
  }
}

// --- Insider news feed ----------------------------------------------------
heading(`${symbol} · recent insider news`);
let shown = 0;
for await (const article of client.news.iterateInsider({ symbol, maxItems: 8 })) {
  shown += 1;
  console.log(`  ${c.dim(when(article.original.time_published))}  ${article.original.title}`);
}
if (shown === 0) console.log(c.dim("  No insider news in the recent feed for this ticker."));
