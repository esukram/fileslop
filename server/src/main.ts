import { existsSync } from "node:fs";
import { join } from "node:path";
import { createApp } from "./app.ts";
import { ConfigError, dataDir, loadConfig } from "./config.ts";
import { FileIndex } from "./file-index.ts";
import { issueKey, KeyStore } from "./keys.ts";
import { createStore } from "./store.ts";

const USAGE = `Usage: fileslop-server <command>

Commands:
  serve                 Start the HTTP server (default).
  issue-key <username>  Create a new token for <username> and print it once.
  help                  Show this help.

Configuration comes from environment variables or a .env file in the
working directory. See .env.sample for all variables.`;

if (existsSync(".env")) process.loadEnvFile(".env");

const [command = "serve", ...args] = process.argv.slice(2);
const keysFile = join(dataDir(process.env), "keys.txt");

async function serve(): Promise<void> {
  const config = loadConfig(process.env);
  const keys = new KeyStore(keysFile);
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

try {
  switch (command) {
    case "serve":
      await serve();
      break;
    case "issue-key": {
      const username = args[0];
      if (!username) throw new ConfigError(`missing <username>\n\n${USAGE}`);
      const token = await issueKey(keysFile, username);
      console.log(token);
      console.error(`Stored the key hash for "${username}" in ${keysFile}. Keep the token secret.`);
      break;
    }
    case "help":
    case "--help":
    case "-h":
      console.log(USAGE);
      break;
    default:
      throw new ConfigError(`unknown command "${command}"\n\n${USAGE}`);
  }
} catch (err) {
  console.error(`fileslop-server: ${err instanceof Error ? err.message : String(err)}`);
  process.exit(err instanceof ConfigError ? 2 : 1);
}
