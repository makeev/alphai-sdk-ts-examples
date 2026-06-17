/**
 * 04 · Ticker dashboard — compose four endpoints in parallel.
 *
 *   npm run dashboard
 *   npm run dashboard -- MSFT
 *
 * Shows the SDK's namespaces working together: company detail, a 7-day
 * sentiment rollup, a 30-day SEC Form 4 insider rollup, and the latest news —
 * all fired concurrently with `Promise.all`, then printed as one report.
 */
import { createClient, tickerArg, heading, relevance, sentiment, sentimentForTicker, usd, when, c, printRateLimit } from "./_shared.js";

const client = createClient();
const symbol = tickerArg("MSFT");

console.log(c.bold(c.cyan(`\n╔═ ${symbol} dashboard ${"═".repeat(Math.max(0, 30 - symbol.length))}╗`)));

// Four independent requests, one round-trip of wall-clock time.
const [detail, sent, insider, news] = await Promise.all([
  client.symbols.get(symbol),
  client.symbols.sentimentSummary(symbol),
  client.symbols.insiderSummary(symbol),
  client.news.list({ symbol, minRelevance: 6, collapseStories: true }),
]);

// — Company —
heading("Company");
// Market line carries the multi-market metadata: exchange · asset_type, plus
// country/currency for foreign & crypto listings.
const mkt = [detail.exchange || "?", detail.asset_type || "?"];
if (detail.country) mkt.push(detail.country);
if (detail.currency) mkt.push(detail.currency);
console.log(`  ${c.bold(detail.name)} · ${c.dim(mkt.join(" · "))}`);
if (detail.sector || detail.industry) {
  console.log(`  ${c.dim(`${detail.sector ?? ""}${detail.industry ? " / " + detail.industry : ""}`)}`);
}
if (detail.supports_insider === false) {
  console.log(c.dim("  no SEC Form 4 insider data (crypto/foreign listing)"));
}
if (detail.website) console.log(`  ${c.blue(detail.website)}`);

// — 7-day AI sentiment —
heading(`AI sentiment · last ${sent.days} days`);
const total = sent.total || 1;
const pct = (n: number) => `${Math.round((n / total) * 100)}%`;
console.log(
  `  ${c.green("▲ bullish")} ${pct(sent.bullish)}   ` +
    `${c.gray("● neutral")} ${pct(sent.neutral)}   ` +
    `${c.red("▼ bearish")} ${pct(sent.bearish)}   ` +
    c.dim(`(${sent.total} stories)`),
);
// A small sparkline of daily bullish-minus-bearish.
const spark = "▁▂▃▄▅▆▇█";
const net = sent.daily.map((d) => d.bullish - d.bearish);
const span = Math.max(1, ...net.map(Math.abs));
const line = net
  .map((v) => spark[Math.min(spark.length - 1, Math.round(((v + span) / (2 * span)) * (spark.length - 1)))])
  .join("");
if (line) console.log(`  ${c.dim("daily net:")} ${c.cyan(line)}`);

// — 30-day insider activity (SEC Form 4) —
heading(`Insider activity · last ${insider.days} days (SEC Form 4)`);
console.log(
  `  ${c.green(`${insider.buy_count} buys`)} ${usd(insider.buy_value_usd)}   ` +
    `${c.red(`${insider.sell_count} sells`)} ${usd(insider.sell_value_usd)}`,
);
console.log(c.dim(`  ${insider.total_transactions} transactions · ${insider.pct_10b5_1}% under a 10b5-1 plan`));
for (const person of insider.top_insiders.slice(0, 3)) {
  const role = person.title ? c.dim(` · ${person.title}`) : "";
  console.log(`    ${person.name}${role}  net ${usd(person.net_value)}  ${c.dim(`(${person.transaction_count} tx)`)}`);
}

// — Latest news —
heading("Latest news");
for (const article of news.results.slice(0, 5)) {
  console.log(
    `  [${relevance(article.enrichment.relevance_score)}] ${article.original.title}`,
  );
  console.log(
    `      ${c.dim(when(article.original.time_published))} · ${sentiment(sentimentForTicker(article, symbol))}`,
  );
}

console.log();
printRateLimit(client);
