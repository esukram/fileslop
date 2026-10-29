import { readFile } from "node:fs/promises";
import { dirname } from "node:path";
import { appendLine, makeDir } from "./append-line.ts";

export interface IndexEntry {
  id: string;
  key: string;
  filename: string;
  contentType: string;
  size: number;
  uploader: string;
  createdAt: string;
}

/**
 * Lookup table id → object key, persisted as append-only JSON Lines.
 * ponytail: single process only. Scale-out needs a shared index (for example a database).
 */
export class FileIndex {
  readonly #file: string;
  readonly #entries = new Map<string, IndexEntry>();

  private constructor(file: string) {
    this.#file = file;
  }

  static async open(file: string): Promise<FileIndex> {
    const index = new FileIndex(file);
    await makeDir(dirname(file));
    let text = "";
    try {
      text = await readFile(file, "utf8");
    } catch (err) {
      if ((err as NodeJS.ErrnoException).code !== "ENOENT") throw err;
    }
    text.split("\n").forEach((line, i) => {
      if (line.trim() === "") return;
      try {
        const entry = JSON.parse(line) as IndexEntry;
        index.#entries.set(entry.id, entry);
      } catch {
        console.warn(`index file line ${i + 1}: invalid JSON, line ignored`);
      }
    });
    return index;
  }

  get size(): number {
    return this.#entries.size;
  }

  get(id: string): IndexEntry | undefined {
    return this.#entries.get(id);
  }

  async add(entry: IndexEntry): Promise<void> {
    await appendLine(this.#file, JSON.stringify(entry));
    this.#entries.set(entry.id, entry);
  }
}
