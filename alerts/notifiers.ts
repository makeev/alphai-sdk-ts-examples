/**
 * Delivery channels. Each `Notifier` takes an `Alert` and pushes it somewhere.
 * Console is always on (local visibility); Slack / Telegram / webhook activate
 * when their env vars are present and we're not in --dry-run.
 *
 * All remote calls use the native `fetch` — no HTTP dependency, matching the
 * SDK's zero-dependency philosophy.
 */
import type { AppConfig, NotifierConfig } from "./config.js";
import {
  type Alert,
  renderConsole,
  renderSlack,
  renderTelegramHtml,
  renderWebhook,
} from "./format.js";

export interface Notifier {
  readonly name: string;
  send(alert: Alert): Promise<void>;
}

async function postJson(url: string, body: unknown): Promise<void> {
  const res = await fetch(url, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
    signal: AbortSignal.timeout(15_000),
  });
  if (!res.ok) {
    const detail = await res.text().catch(() => "");
    throw new Error(`HTTP ${res.status} ${res.statusText}${detail ? ` — ${detail.slice(0, 200)}` : ""}`);
  }
}

class ConsoleNotifier implements Notifier {
  readonly name = "console";
  async send(alert: Alert): Promise<void> {
    console.log(renderConsole(alert));
    console.log("");
  }
}

class SlackNotifier implements Notifier {
  readonly name = "slack";
  constructor(private readonly webhookUrl: string) {}
  async send(alert: Alert): Promise<void> {
    await postJson(this.webhookUrl, renderSlack(alert));
  }
}

class TelegramNotifier implements Notifier {
  readonly name = "telegram";
  constructor(
    private readonly token: string,
    private readonly chatId: string,
  ) {}
  async send(alert: Alert): Promise<void> {
    await postJson(`https://api.telegram.org/bot${this.token}/sendMessage`, {
      chat_id: this.chatId,
      text: renderTelegramHtml(alert),
      parse_mode: "HTML",
      disable_web_page_preview: false,
    });
  }
}

class WebhookNotifier implements Notifier {
  readonly name = "webhook";
  constructor(private readonly url: string) {}
  async send(alert: Alert): Promise<void> {
    await postJson(this.url, renderWebhook(alert));
  }
}

/**
 * Assemble the active notifiers. Console is always included so you can see what
 * the bot is doing locally. Remote channels are added when configured, unless
 * `--dry-run` is set (then nothing leaves the machine).
 */
export function buildNotifiers(config: AppConfig): Notifier[] {
  const list: Notifier[] = [new ConsoleNotifier()];
  if (config.dryRun) return list;

  const n: NotifierConfig = config.notifiers;
  if (n.slackWebhookUrl) list.push(new SlackNotifier(n.slackWebhookUrl));
  if (n.telegramBotToken && n.telegramChatId) {
    list.push(new TelegramNotifier(n.telegramBotToken, n.telegramChatId));
  }
  if (n.webhookUrl) list.push(new WebhookNotifier(n.webhookUrl));
  return list;
}
