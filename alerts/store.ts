/**
 * Dedup state: a capped, insertion-ordered set of article UIDs we've already
 * delivered, persisted to a JSON file between runs. Keeps the bot from
 * re-sending the same story every poll.
 */
import { readFile, writeFile, mkdir } from "node:fs/promises";
import { dirname } from "node:path";

interface StateFile {
  seen: string[];
  updatedAt?: string;
}

export class SeenStore {
  private seen = new Set<string>();
  private order: string[] = [];
  /** True when there was no state file to load (i.e. the first ever run). */
  private freshRun = true;

  constructor(
    private readonly file: string,
    private readonly cap = 5000,
  ) {}

  /** True if no prior state existed when {@link load} ran. */
  get isFirstRun(): boolean {
    return this.freshRun;
  }

  /**
   * Clear the first-run flag once the baseline has been handled, so a
   * long-lived `--watch` loop only seeds on its very first poll.
   */
  markBaselined(): void {
    this.freshRun = false;
  }

  get size(): number {
    return this.seen.size;
  }

  async load(): Promise<void> {
    try {
      const raw = await readFile(this.file, "utf8");
      const data = JSON.parse(raw) as StateFile;
      this.order = Array.isArray(data.seen) ? data.seen : [];
      this.seen = new Set(this.order);
      this.freshRun = false;
    } catch (err) {
      if ((err as NodeJS.ErrnoException).code !== "ENOENT") throw err;
      // No file yet → first run; start with an empty set.
    }
  }

  has(uid: string): boolean {
    return this.seen.has(uid);
  }

  add(uid: string): void {
    if (this.seen.has(uid)) return;
    this.seen.add(uid);
    this.order.push(uid);
    if (this.order.length > this.cap) {
      const drop = this.order.splice(0, this.order.length - this.cap);
      for (const u of drop) this.seen.delete(u);
    }
  }

  async save(updatedAt: string): Promise<void> {
    const dir = dirname(this.file);
    if (dir && dir !== ".") await mkdir(dir, { recursive: true }).catch(() => {});
    const payload: StateFile = { seen: this.order, updatedAt };
    await writeFile(this.file, JSON.stringify(payload));
  }
}
