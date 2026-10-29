#!/usr/bin/env node
import { execFileSync } from "node:child_process";
import { readFileSync, statSync } from "node:fs";
import { basename } from "node:path";
import { parseArgs } from "node:util";
import { maskToken, resolveConfig, TOKEN_PREFIX } from "./config.ts";
import { mediaTypeFor } from "./mime.ts";

const VERSION = (
  JSON.parse(readFileSync(new URL("../package.json", import.meta.url), "utf8")) as {
    version: string;
  }
).version;

const HELP = `fileslop ${VERSION} - upload a file to a Fileslop server and get a public URL.

Usage:
  fileslop upload <file> [options]   Upload a file. Prints JSON with the URL.
  fileslop config                    Show the configuration in use.
  fileslop help [command]            Show help for a command.
  fileslop --version                 Show the version.

Configuration (environment variables win over the config file):
  FILESLOP_URL      Upload URL of the server, for example https://files.example.org/fileslop/
  FILESLOP_TOKEN    Upload token. It starts with ${TOKEN_PREFIX}
  FILESLOP_CONFIG   Path of the config file. Default: ~/.config/fileslop/config.json
                    ($XDG_CONFIG_HOME/fileslop/config.json when XDG_CONFIG_HOME is set)
  Config file: {"url": "https://files.example.org/fileslop/", "token": "${TOKEN_PREFIX}..."}

Exit codes: 0 success, 1 upload failed, 2 usage or configuration error.`;

const UPLOAD_HELP = `Usage: fileslop upload <file> [options]

Upload <file>. On success, print one line of JSON to stdout:
  {"id":"...","url":"https://.../<id>/<name>","filename":"...","contentType":"...","size":123}

Options:
  -t, --type <media-type>  Media type, for example text/html. Default: from the file extension.
                           Unknown extensions need --type.
  -n, --name <filename>    File name in the URL. Default: the base name of <file>.
                           Allowed characters: A-Z a-z 0-9 . _ -
      --username <owner>   Repository owner, stored as metadata.
      --repository <repo> Repository name, stored as metadata.
      --provider <name>    Repository provider (github, gitlab, ...), stored as metadata.
      --no-git             Do not read owner, repository and provider from
                           "git remote get-url origin".
  -h, --help               Show this help.

Examples:
  fileslop upload plan.html
  fileslop upload build.log --type text/plain
  fileslop upload ./out/report.html --name pr-42-report.html
  url=$(fileslop upload shot.png | jq -r .url)
  gh pr comment 42 --body "![screenshot]($url)"`;

const CONFIG_HELP = `Usage: fileslop config

Show the server URL and a masked token, and where each value comes from.
Exit code 2 when a value is missing or invalid.`;

/** Hints for agents and humans, by HTTP status. */
const FIXES: Record<number, string> = {
  400: "Check --name and the metadata options. Allowed characters: A-Z a-z 0-9 . _ - (metadata also /).",
  401: `Check FILESLOP_TOKEN. It must be a valid token that starts with ${TOKEN_PREFIX}. Ask the server admin for a token.`,
  404: "Check FILESLOP_URL. It must be the upload URL, for example https://files.example.org/fileslop/",
  405: "Check FILESLOP_URL. It must be the upload URL, for example https://files.example.org/fileslop/",
  409: "Run the same command again.",
  413: "The file is too large for this server. Compress or split the file.",
  415: "Pass the media type with --type, for example --type text/html.",
};

class UsageError extends Error {
  readonly fix: string;
  constructor(message: string, fix: string) {
    super(message);
    this.fix = fix;
  }
}

class UploadError extends UsageError {}

interface GitMetadata {
  username?: string;
  repository?: string;
  provider?: string;
}

/** Reads owner, repository and provider from a git remote URL (https, ssh or scp form). */
export function parseRemote(url: string): GitMetadata {
  const m = /^(?:[a-z+]+:\/\/)?(?:[^@/]+@)?([^/:]+)(?::\d+)?[:/](.+?)(?:\.git)?\/?$/i.exec(url);
  const host = m?.[1]?.toLowerCase();
  const path = m?.[2];
  const slash = path?.lastIndexOf("/") ?? -1;
  if (!host || !path || slash < 1) return {};
  const known: Record<string, string> = {
    "github.com": "github",
    "gitlab.com": "gitlab",
    "bitbucket.org": "bitbucket",
    "codeberg.org": "codeberg",
  };
  return {
    username: path.slice(0, slash),
    repository: path.slice(slash + 1),
    provider: known[host] ?? host,
  };
}

function gitMetadata(): GitMetadata {
  try {
    const remote = execFileSync("git", ["remote", "get-url", "origin"], {
      encoding: "utf8",
      stdio: ["ignore", "pipe", "ignore"],
    });
    return parseRemote(remote.trim());
  } catch {
    return {};
  }
}

/** Makes a local file name valid for the server. */
export function safeName(name: string): string {
  const clean = name
    .replace(/[^A-Za-z0-9._-]+/g, "-")
    .replace(/^[^A-Za-z0-9]+/, "")
    .slice(0, 255);
  return clean || "file";
}

const METADATA_RE = /^[A-Za-z0-9][A-Za-z0-9._/-]{0,127}$/;

function requireConfig(): { url: string; token: string } {
  const config = resolveConfig(process.env);
  if (config.fileError) throw new UsageError(config.fileError, `Fix the JSON in ${config.file}.`);
  const url = config.url.value;
  const token = config.token.value;
  if (!url) {
    throw new UsageError(
      "no server URL",
      `Set FILESLOP_URL, for example export FILESLOP_URL=https://files.example.org/fileslop/ , or add "url" to ${config.file}.`,
    );
  }
  if (!token) {
    throw new UsageError(
      "no upload token",
      `Set FILESLOP_TOKEN=${TOKEN_PREFIX}... , or add "token" to ${config.file}. Ask the server admin for a token.`,
    );
  }
  if (!token.startsWith(TOKEN_PREFIX)) {
    throw new UsageError(
      `the token from ${config.token.source} does not start with ${TOKEN_PREFIX}`,
      "Use the full token that the server admin gave you.",
    );
  }
  try {
    const parsed = new URL(url);
    if (!["http:", "https:"].includes(parsed.protocol)) throw new Error("not http(s)");
  } catch {
    throw new UsageError(
      `the server URL from ${config.url.source} is not a valid http(s) URL: ${url}`,
      "Use the upload URL, for example https://files.example.org/fileslop/",
    );
  }
  return { url: url.endsWith("/") ? url : `${url}/`, token };
}

async function upload(argv: string[]): Promise<void> {
  const { values, positionals } = parseArgs({
    args: argv,
    allowPositionals: true,
    allowNegative: true,
    options: {
      type: { type: "string", short: "t" },
      name: { type: "string", short: "n" },
      username: { type: "string" },
      repository: { type: "string" },
      provider: { type: "string" },
      git: { type: "boolean", default: true },
      help: { type: "boolean", short: "h" },
    },
  });
  if (values.help) {
    console.log(UPLOAD_HELP);
    return;
  }
  const [path, ...extra] = positionals;
  if (!path || extra.length > 0) {
    throw new UsageError("upload needs exactly one <file>", "Run: fileslop upload <file>");
  }
  const { url, token } = requireConfig();

  let body: Buffer;
  try {
    if (!statSync(path).isFile()) throw new Error("not a file");
    body = readFileSync(path);
  } catch {
    throw new UsageError(
      `cannot read the file ${path}`,
      "Check the path. Upload one regular file.",
    );
  }

  const name = values.name ?? safeName(basename(path));
  const type = values.type ?? mediaTypeFor(name);
  if (!type) {
    throw new UsageError(
      `unknown media type for ${name}`,
      "Pass the media type with --type, for example --type text/plain or --type application/octet-stream.",
    );
  }

  // Values from git that the server does not accept are left out; values from flags are sent.
  const git = values.git ? gitMetadata() : {};
  const fromGit = (value: string | undefined): string | undefined =>
    value !== undefined && METADATA_RE.test(value) ? value : undefined;
  const metadata: Record<string, string | undefined> = {
    "x-fs-username": values.username ?? fromGit(git.username),
    "x-fs-repository": values.repository ?? fromGit(git.repository),
    "x-fs-repository-provider": values.provider ?? fromGit(git.provider),
  };
  const headers: Record<string, string> = {
    authorization: `Bearer ${token}`,
    "content-type": type,
    "x-fs-filename": name,
  };
  for (const [header, value] of Object.entries(metadata)) {
    if (value !== undefined) headers[header] = value;
  }

  let status: number;
  let text: string;
  try {
    const res = await fetch(url, { method: "POST", headers, body });
    status = res.status;
    text = await res.text();
  } catch (err) {
    const cause =
      err instanceof Error && err.cause instanceof Error ? err.cause.message : String(err);
    throw new UploadError(
      `cannot reach ${url}: ${cause}`,
      "Check FILESLOP_URL and your network connection.",
    );
  }
  let parsed: unknown;
  try {
    parsed = JSON.parse(text);
  } catch {
    // Not JSON, for example an error page of a proxy.
  }
  const reply = (typeof parsed === "object" && parsed !== null ? parsed : {}) as Record<
    string,
    unknown
  >;
  if (status !== 201) {
    const detail =
      typeof reply["error"] === "string"
        ? `${reply["error"]}: ${typeof reply["message"] === "string" ? reply["message"] : ""}`
        : text.trim().slice(0, 200);
    throw new UploadError(
      `upload failed: HTTP ${status} ${detail}`,
      FIXES[status] ?? "The server or its object store failed. Try again later.",
    );
  }
  if (typeof reply["url"] !== "string") {
    throw new UploadError(
      `the server answered 201 without a "url": ${text.trim().slice(0, 200)}`,
      "Check FILESLOP_URL. It must point to a Fileslop server.",
    );
  }
  console.log(JSON.stringify(reply));
}

function showConfig(): void {
  const config = resolveConfig(process.env);
  console.log(
    JSON.stringify(
      {
        url: config.url.value ?? null,
        urlSource: config.url.source,
        token: config.token.value === undefined ? null : maskToken(config.token.value),
        tokenSource: config.token.source,
        configFile: config.file,
        ...(config.fileError ? { configFileError: config.fileError } : {}),
      },
      null,
      2,
    ),
  );
  requireConfig();
}

export async function main(argv: string[]): Promise<number> {
  const [command, ...rest] = argv;
  try {
    switch (command) {
      case "upload":
        await upload(rest);
        return 0;
      case "config":
        if (rest.includes("--help") || rest.includes("-h")) console.log(CONFIG_HELP);
        else showConfig();
        return 0;
      case undefined:
      case "help":
      case "--help":
      case "-h": {
        const topic = rest[0];
        console.log(topic === "upload" ? UPLOAD_HELP : topic === "config" ? CONFIG_HELP : HELP);
        return 0;
      }
      case "--version":
      case "-V":
        console.log(VERSION);
        return 0;
      default:
        throw new UsageError(`unknown command "${command}"`, "Run: fileslop help");
    }
  } catch (err) {
    if (err instanceof UsageError) {
      console.error(`fileslop: ${err.message}\nFix: ${err.fix}`);
      return err instanceof UploadError ? 1 : 2;
    }
    // parseArgs reports unknown or malformed options with TypeError.
    if (err instanceof TypeError && "code" in err) {
      console.error(`fileslop: ${err.message}\nFix: Run: fileslop help ${command ?? ""}`.trimEnd());
      return 2;
    }
    throw err;
  }
}

if (import.meta.main) process.exitCode = await main(process.argv.slice(2));
