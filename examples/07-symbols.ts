/**
 * 07 · Symbols — discover tickers and read company detail.
 *
 *   npm run symbols
 *   npm run symbols -- NVDA      # jump straight to a ticker's detail
 *
 * Shows: `symbols.list({ limit, offset })` for discovery (the list endpoint
 * omits description/website) and `symbols.get(ticker)` for full detail.
 *
 * Note the exported model type is named `Symbol`, which shadows the JS global —
 * alias it on import, as below, when you need to reference it.
 */
import { createClient, tickerArg, heading, c } from "./_shared.js";
import type { Symbol as AlphaSymbol } from "alphai-sdk";

const client = createClient();
const symbol = tickerArg("NVDA");

// --- Discovery: first page of the alphabetical ticker list ----------------
heading("Symbol discovery (first 500 tickers, grouped by exchange)");
const symbols: AlphaSymbol[] = await client.symbols.list({ limit: 500, offset: 0 });

const byExchange = new Map<string, number>();
for (const s of symbols) {
  const ex = s.exchange || "(unknown)";
  byExchange.set(ex, (byExchange.get(ex) ?? 0) + 1);
}
console.log(c.dim(`  fetched ${symbols.length} tickers; exchanges in this page:`));
for (const [ex, n] of [...byExchange.entries()].sort((a, b) => b[1] - a[1])) {
  console.log(`    ${ex.padEnd(10)} ${c.cyan(String(n))}`);
}

// A few sample rows.
console.log(c.dim("\n  sample:"));
for (const s of symbols.slice(0, 6)) {
  console.log(`    ${c.bold(s.symbol.padEnd(8))} ${s.name} ${c.dim(`· ${s.sector || "—"}`)}`);
}

// --- Detail: a single company --------------------------------------------
heading(`Detail · ${symbol}`);
const d = await client.symbols.get(symbol);
console.log(`  ${c.bold(d.name)} (${d.symbol})`);
console.log(`  ${c.dim(`${d.exchange || "?"} · ${d.asset_type || "?"} · ${d.sector || "?"} / ${d.industry || "?"}`)}`);
if (d.website) console.log(`  ${c.blue(d.website)}`);
if (d.description) {
  const desc = d.description.length > 280 ? d.description.slice(0, 277) + "…" : d.description;
  console.log(`\n  ${desc}`);
}
