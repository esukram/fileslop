import { open } from "node:fs/promises";
import { dirname } from "node:path";

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
  {
    const dir = await open(dirname(file), "r");
    try {
      await dir.sync();
    } finally {
      await dir.close();
    }
  }
}
