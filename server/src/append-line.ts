import { mkdir, open } from "node:fs/promises";
import { dirname, resolve } from "node:path";

/**
 * Appends one line and flushes it to disk before it returns.
 * Closes a partial last line first, so that each record stays on its own line.
 */
export async function appendLine(file: string, line: string, mode = 0o644): Promise<void> {
  const handle = await open(file, "a+", mode);
  const { size } = await handle.stat().catch(async (err: unknown) => {
    await handle.close();
    throw err;
  });
  try {
    let prefix = "";
    if (size > 0) {
      const last = Buffer.alloc(1);
      await handle.read(last, 0, 1, size - 1);
      if (last[0] !== 0x0a) prefix = "\n";
    }
    await handle.appendFile(`${prefix}${line}\n`);
    await handle.sync();
  } finally {
    await handle.close();
  }
  // Flush the directory too. A concurrent append can have created the file a moment ago,
  // so do this for each append, not only for the first one.
  await syncDir(dirname(file));
}

async function syncDir(path: string): Promise<void> {
  const dir = await open(path, "r");
  try {
    await dir.sync();
  } finally {
    await dir.close();
  }
}

/**
 * Creates `dir` and its missing parents, then flushes `dir` and each parent up to the root.
 * The flush also covers folders that an earlier process created but did not flush.
 * Callers: server start and `issue-key`, so the few extra fsync calls do not matter.
 */
export async function makeDir(dir: string): Promise<void> {
  await mkdir(dir, { recursive: true });
  for (let d = resolve(dir); ; d = dirname(d)) {
    await syncDir(d);
    if (dirname(d) === d) break;
  }
}
