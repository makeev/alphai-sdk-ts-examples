/**
 * 07 · Symbols — discover tickers across markets and read company detail.
 *
 *   npm run symbols
 *   npm run symbols -- VOD.L     # jump straight to a ticker's detail
 *   npm run symbols -- BTC-USD   # …crypto and foreign listings work too
 *
 * Shows: `symbols.list({ limit, offset })` for discovery and `symbols.get(ticker)`
 * for full detail — including the multi-market metadata every Symbol carries:
 * `asset_type` ("Stock" | "ETF" | "Crypto"), `country`, `currency`, and
 * `supports_insider` (US SEC names only). The universe spans US equities/ETFs,
 * cryptocurrencies (`BTC-USD`), and foreign listings (Yahoo suffix, e.g. `VOD.L`).
 *
 * Note the exported model type is named `Symbol`, which shadows the JS global —
 * alias it on import, as below, when you need to reference it.
 */
import { createClient, tickerArg, heading, c } from "./_shared.js";
import type { Symbol as AlphaSymbol } from "alphai-sdk";

const client = createClient();
const symbol = tickerArg("NVDA");

/** A compact market tag: asset_type · exchange · country · currency. */
function market(s: AlphaSymbol): string {
  const bits = [s.asset_type || "?", s.exchange || "?"];
  if (s.country) bits.push(s.country);
  if (s.currency) bits.push(s.currency);
  return bits.join(" · ");
}

// --- Discovery: first page of the alphabetical ticker list ----------------
heading("Symbol discovery (first 500 tickers)");
const symbols: AlphaSymbol[] = await client.symbols.list({ limit: 500, offset: 0 });

// Tally by asset type, and count the foreign-listed names (country set).
const byType = new Map<string, number>();
let foreign = 0;
for (const s of symbols) {
  const t = s.asset_type || "(unknown)";
  byType.set(t, (byType.get(t) ?? 0) + 1);
  if (s.country) foreign++;
}
console.log(c.dim(`  fetched ${symbols.length} tickers; by asset type:`));
for (const [t, n] of [...byType.entries()].sort((a, b) => b[1] - a[1])) {
  console.log(`    ${t.padEnd(8)} ${c.cyan(String(n))}`);
}
console.log(c.dim(`    foreign-listed (country set): ${foreign}`));

// A few sample rows, with their market metadata.
console.log(c.dim("\n  sample:"));
for (const s of symbols.slice(0, 6)) {
  console.log(`    ${c.bold(s.symbol.padEnd(10))} ${c.dim(market(s))}  ${s.name}`);
}

// --- Detail: a single company across any market ---------------------------
heading(`Detail · ${symbol}`);
const d = await client.symbols.get(symbol);
console.log(`  ${c.bold(d.name)} (${d.symbol})`);
console.log(`  ${c.dim(market(d))} · ${c.dim(`${d.sector || "?"} / ${d.industry || "?"}`)}`);
console.log(
  `  insider data (SEC Form 4): ${
    d.supports_insider ? c.green("supported") : c.dim("not supported — crypto/foreign")
  }`,
);
if (d.website) console.log(`  ${c.blue(d.website)}`);
if (d.description) {
  const desc = d.description.length > 280 ? d.description.slice(0, 277) + "…" : d.description;
  console.log(`\n  ${desc}`);
}

// --- Multi-market spotlight: a crypto and a foreign listing ----------------
// `symbols.get` takes any supported ticker — crypto carries a `-USD` suffix,
// foreign listings use the Yahoo suffix. Guarded in case the exact sample
// isn't in the current universe.
heading("Multi-market spotlight");
for (const ticker of ["BTC-USD", "VOD.L"]) {
  if (ticker === symbol) continue; // already shown above
  try {
    const s = await client.symbols.get(ticker);
    console.log(`  ${c.bold(s.symbol.padEnd(10))} ${c.dim(market(s))}  ${s.name}`);
  } catch {
    console.log(c.dim(`  ${ticker.padEnd(10)} (not in the current universe)`));
  }
}
