/**
 * news-alert bot — a concrete app on top of alphai-sdk.
 *
 *   npm run alerts                 # poll once (cron-friendly), console output
 *   npm run alerts -- --watch      # long-lived: poll every POLL_INTERVAL_SECONDS
 *   npm run alerts -- --dry-run    # never POST to remote channels
 *   npm run alerts -- --backfill=3 # on first run, deliver the 3 newest (else seed silently)
 *
 * Flow each poll: fetch the feed for the watchlist → filter to unseen articles
 * → deliver to every configured channel (Telegram / Slack / webhook / console)
 * → persist the seen-set so nothing is sent twice.
 *
 * Channels are configured via env (see .env.example). With none set, it runs in
 * console-only mode, which is also what --dry-run forces.
 */
import { AlphaAI, MissingAPIKeyError } from "alphai-sdk";
import type { RichNewsArticle } from "alphai-sdk";
import { loadConfig, type AppConfig } from "./config.js";
import { SeenStore } from "./store.js";
import { buildNotifiers, type Notifier } from "./notifiers.js";
import { toAlert } from "./format.js";

function loadEnv(): void {
  try {
    process.loadEnvFile();
  } catch {
    /* no .env file — use the ambient environment */
  }
}

const ts = () => new Date().toISOString().replace("T", " ").slice(0, 19);
const log = (msg: string) => console.log(`${ts()}  ${msg}`);
const sleep = (ms: number) => new Promise<void>((r) => setTimeout(r, ms));

interface Found {
  article: RichNewsArticle;
  ticker: string;
}

/** Fetch the feed(s) and return articles not already in the store. */
async function collectUnseen(
  client: AlphaAI,
  config: AppConfig,
  store: SeenStore,
): Promise<Found[]> {
  const out: Found[] = [];
  const seenThisPoll = new Set<string>();

  const consider = (article: RichNewsArticle, ticker: string) => {
    const uid = article.original.uid;
    if (store.has(uid) || seenThisPoll.has(uid)) return;
    seenThisPoll.add(uid);
    out.push({ article, ticker });
  };

  if (config.watchlist.length === 0) {
    // Whole-market mode: the trending feed (already high-relevance, deduped).
    const trending = await client.news.trending();
    for (const a of trending) consider(a, "");
  } else {
    // Per-ticker mode. Requests are independent → fire them in parallel.
    const pages = await Promise.all(
      config.watchlist.map((symbol) =>
        client.news
          .list({
            symbol,
            minRelevance: config.minRelevance,
            category: config.categories,
            excludeCategories: config.excludeCategories,
            collapseStories: true,
          })
          .then((page) => ({ symbol, page })),
      ),
    );
    for (const { symbol, page } of pages) {
      for (const a of page.results.slice(0, config.perTickerLimit)) consider(a, symbol);
    }
  }

  return out;
}

const byOldestFirst = (a: Found, b: Found) =>
  a.article.original.time_published.localeCompare(b.article.original.time_published);

/** Run one poll: collect, (maybe seed on first run), deliver, persist. */
async function pollOnce(
  client: AlphaAI,
  config: AppConfig,
  store: SeenStore,
  notifiers: Notifier[],
): Promise<void> {
  let found: Found[];
  try {
    found = await collectUnseen(client, config, store);
  } catch (err) {
    log(`⚠ fetch failed: ${(err as Error).message}`);
    return;
  }

  // First-run baseline: avoid blasting the whole backlog. Deliver only the N
  // newest (firstRunBackfill), mark everything else as already-seen.
  let toDeliver = found;
  if (store.isFirstRun) {
    const newestFirst = [...found].sort(byOldestFirst).reverse();
    const deliver = newestFirst.slice(0, config.firstRunBackfill);
    const seedOnly = newestFirst.slice(config.firstRunBackfill);
    for (const item of seedOnly) store.add(item.article.original.uid);
    toDeliver = deliver;
    store.markBaselined(); // only seed on the first poll, not every watch tick
    log(
      `baseline established: ${seedOnly.length} article(s) marked seen, ` +
        `delivering ${deliver.length} (backfill=${config.firstRunBackfill}).`,
    );
  }

  toDeliver.sort(byOldestFirst); // chronological delivery

  if (toDeliver.length === 0) {
    log("no new articles.");
  } else {
    log(`delivering ${toDeliver.length} new article(s) to: ${notifiers.map((n) => n.name).join(", ")}`);
    for (const { article, ticker } of toDeliver) {
      const alert = toAlert(article, ticker);
      const results = await Promise.allSettled(notifiers.map((n) => n.send(alert)));
      results.forEach((r, i) => {
        if (r.status === "rejected") {
          log(`  ✗ ${notifiers[i]?.name}: ${(r.reason as Error).message}`);
        }
      });
      store.add(alert.uid);
    }
  }

  await store.save(new Date().toISOString());

  const rl = client.lastRateLimit;
  if (rl?.limit != null) {
    log(`rate limit: ${rl.remaining ?? "?"}/${rl.limit} remaining`);
  }
}

async function main(): Promise<void> {
  loadEnv();
  const config = loadConfig(process.argv);

  let client: AlphaAI;
  try {
    client = new AlphaAI();
  } catch (err) {
    if (err instanceof MissingAPIKeyError) {
      console.error("✗ No API key. Copy .env.example to .env and set ALPHAI_API_KEY.");
      process.exit(1);
    }
    throw err;
  }

  const store = new SeenStore(config.stateFile);
  await store.load();
  const notifiers = buildNotifiers(config);

  const target = config.watchlist.length ? config.watchlist.join(", ") : "trending (whole market)";
  log(
    `watching ${target} · min relevance ${config.minRelevance} · ` +
      `channels: ${notifiers.map((n) => n.name).join(", ")}` +
      (config.dryRun ? " · DRY RUN" : ""),
  );

  if (!config.watch) {
    await pollOnce(client, config, store, notifiers);
    return;
  }

  // Long-lived watch mode. Poll, sleep, repeat — until Ctrl-C.
  let stopping = false;
  const stop = () => {
    if (stopping) return;
    stopping = true;
    log("shutting down…");
  };
  process.on("SIGINT", stop);
  process.on("SIGTERM", stop);

  log(`watch mode: polling every ${config.pollIntervalSeconds}s (Ctrl-C to stop)`);
  while (!stopping) {
    await pollOnce(client, config, store, notifiers);
    if (stopping) break;
    // Sleep in short slices so Ctrl-C is responsive.
    const until = config.pollIntervalSeconds * 1000;
    for (let waited = 0; waited < until && !stopping; waited += 1000) {
      await sleep(Math.min(1000, until - waited));
    }
  }
  await store.save(new Date().toISOString());
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
