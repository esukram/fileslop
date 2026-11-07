import { join } from "node:path";
import { parseArgs } from "node:util";
import { createApp } from "./app.ts";
import { ConfigError, configFile, dataDir, loadConfig, loadConfigFile } from "./config.ts";
import { FileIndex } from "./file-index.ts";
import { issueKey, KeyStore } from "./keys.ts";
import { createStore } from "./store.ts";

export const USAGE = `Usage:
  fileslop serve [--config <file>]                 Start the HTTP server.
  fileslop issue-key <username> [--config <file>]  Create a token for <username>. Print it one time.

The server commands need a config file with FILESLOP_* variables.
Default: ~/.config/fileslop/.env ($XDG_CONFIG_HOME/fileslop/.env when XDG_CONFIG_HOME is set).
Real environment variables win over the file. The sample file shows all variables:
  https://github.com/esukram/fileslop/blob/main/server/.env.sample
FILESLOP_DATA_DIR is the folder for keys.txt and index.jsonl. Default: ~/.config/fileslop

Exit codes: 0 success, 1 failure, 2 usage or configuration error.`;

async function serve(): Promise<void> {
  const config = loadConfig(process.env);
  const keys = new KeyStore(join(config.dataDir, "keys.txt"));
  await keys.load();
  const index = await FileIndex.open(join(config.dataDir, "index.jsonl"));
  const server = createApp({
    publicUrl: config.publicUrl,
    baseDir: config.baseDir,
    maxUploadBytes: config.maxUploadBytes,
    store: createStore(config.store),
    keys,
    index,
  });
  server.listen(config.port, config.host, () => {
    const address = server.address();
    const port = typeof address === "object" && address ? address.port : config.port;
    console.log(
      `fileslop listening on http://${config.host}:${port}${config.publicUrl.pathname} ` +
        `(public URL ${config.publicUrl.href}, ${keys.size} keys, ${index.size} files)`,
    );
  });
  for (const signal of ["SIGINT", "SIGTERM"] as const) {
    process.once(signal, () => {
      server.close(() => process.exit(0));
      server.closeIdleConnections();
    });
  }
}

/** Runs a server command and returns the exit code. After `serve`, the server continues to run. */
export async function main(argv: string[]): Promise<number> {
  try {
    let parsed;
    try {
      parsed = parseArgs({
        args: argv,
        allowPositionals: true,
        options: { config: { type: "string" }, help: { type: "boolean", short: "h" } },
      });
    } catch (err) {
      throw new ConfigError(err instanceof Error ? err.message : String(err));
    }
    const [command = "serve", ...args] = parsed.positionals;
    if (parsed.values.help || command === "help") {
      console.log(USAGE);
      return 0;
    }
    if (command !== "serve" && command !== "issue-key") {
      throw new ConfigError(`unknown command "${command}"`);
    }
    loadConfigFile(parsed.values.config ?? configFile(process.env));
    if (command === "serve") {
      await serve();
      return 0;
    }
    const [username, ...extra] = args;
    if (!username || extra.length > 0) {
      throw new ConfigError(
        "issue-key needs exactly one <username>",
        "Run: fileslop issue-key <username>",
      );
    }
    const keysFile = join(dataDir(process.env), "keys.txt");
    console.log(await issueKey(keysFile, username));
    console.error(`Stored the key hash for "${username}" in ${keysFile}. Keep the token secret.`);
    return 0;
  } catch (err) {
    if (err instanceof ConfigError) {
      console.error(`fileslop: ${err.message}\nFix: ${err.fix}`);
      return 2;
    }
    console.error(`fileslop: ${err instanceof Error ? err.message : String(err)}`);
    return 1;
  }
}

if (import.meta.main) process.exitCode = await main(process.argv.slice(2));
