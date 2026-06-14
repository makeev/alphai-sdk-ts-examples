/**
 * 06 · Typed errors & rate limits — handle failures and inspect quota.
 *
 *   npm run errors
 *
 * Shows: the typed error hierarchy (catch `NotFoundError` vs `RateLimitError`
 * etc., all extending `AlphaAIError`) and `client.lastRateLimit`, the snapshot
 * the client parses from `X-RateLimit-*` headers after every keyed response.
 */
import {
  AlphaAI,
  NotFoundError,
  RateLimitError,
  AuthenticationError,
  AlphaAIAPIError,
  AlphaAIConnectionError,
} from "alphai-sdk";
import { createClient, heading, printRateLimit, c } from "./_shared.js";

const client = createClient();

// --- 1. A request that succeeds, so we can read the quota -----------------
heading("Rate limit after a successful call");
await client.news.list({ symbol: "NVDA" });
printRateLimit(client); // { limit, remaining, reset } parsed from headers

// --- 2. A request that 404s, caught by type ------------------------------
heading("Catching a typed error (unknown ticker)");
try {
  await client.symbols.get("DEFINITELYNOTATICKER");
  console.log(c.red("  …unexpectedly succeeded"));
} catch (err) {
  // Every error extends AlphaAIError; branch on the specific subclass.
  if (err instanceof NotFoundError) {
    console.log(`  ${c.green("✓ caught NotFoundError")} — status ${err.status}`);
  } else if (err instanceof RateLimitError) {
    console.log(`  rate limited; retry after ${err.retryAfter}s`);
  } else if (err instanceof AuthenticationError) {
    console.log("  bad/missing API key");
  } else if (err instanceof AlphaAIAPIError) {
    console.log(`  other API error: ${err.status}`);
  } else if (err instanceof AlphaAIConnectionError) {
    console.log(`  network problem: ${String(err.cause)}`);
  } else {
    throw err;
  }
}

// --- 3. A bad key surfaces as AuthenticationError -------------------------
heading("A bad API key → AuthenticationError");
const badClient = new AlphaAI({ apiKey: "ak_live_obviously_invalid_key", maxRetries: 0 });
try {
  await badClient.news.list({ symbol: "NVDA" });
  console.log(c.red("  …unexpectedly succeeded"));
} catch (err) {
  if (err instanceof AuthenticationError) {
    console.log(`  ${c.green("✓ caught AuthenticationError")} — status ${err.status}`);
  } else if (err instanceof AlphaAIAPIError) {
    console.log(`  API error ${err.status}: ${JSON.stringify(err.body).slice(0, 120)}`);
  } else {
    throw err;
  }
}

console.log();
console.log(
  c.dim(
    "Tip: idempotent GETs auto-retry on 429/5xx/network with backoff (maxRetries, default 2).",
  ),
);
