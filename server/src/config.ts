import { homedir } from "node:os";
import { join, resolve } from "node:path";
import type { Backend, StoreConfig } from "./store.ts";

export interface Config {
  host: string;
  port: number;
  /** Public URL of the service. Ends with "/". Its path is the route prefix. */
  publicUrl: URL;
  baseDir: string;
  dataDir: string;
  maxUploadBytes: number;
  store: StoreConfig;
}

/** A problem that the operator must correct. `fix` tells the next step. */
export class ConfigError extends Error {
  readonly fix: string;
  constructor(message: string, fix = "Run: fileslop help serve") {
    super(message);
    this.fix = fix;
  }
}

const HETZNER_LOCATIONS = ["fsn1", "nbg1", "hel1"];

/** $XDG_CONFIG_HOME/fileslop, by default ~/.config/fileslop. The client uses the same folder. */
const configDir = (env: NodeJS.ProcessEnv): string =>
  join(env["XDG_CONFIG_HOME"] || join(homedir(), ".config"), "fileslop");

/** Default path of the server config file. */
export const configFile = (env: NodeJS.ProcessEnv): string => join(configDir(env), ".env");

/** Data directory for keys and index. Default: the config folder. */
export const dataDir = (env: NodeJS.ProcessEnv): string =>
  resolve(env["FILESLOP_DATA_DIR"] || configDir(env));

/** Loads the config file into process.env. Real environment variables win over the file. */
export function loadConfigFile(file: string): void {
  try {
    process.loadEnvFile(file);
  } catch (err) {
    const missing = (err as NodeJS.ErrnoException).code === "ENOENT";
    throw new ConfigError(
      missing
        ? `no config file ${file}`
        : `cannot read the config file ${file}: ${err instanceof Error ? err.message : String(err)}`,
      `Create ${file} with the FILESLOP_* variables, or give the path with --config <file>. ` +
        "Sample: https://github.com/esukram/fileslop/blob/main/server/.env.sample",
    );
  }
}

/** Reads the configuration and reports all problems at once. */
export function loadConfig(env: NodeJS.ProcessEnv): Config {
  const problems: string[] = [];
  const get = (name: string, fallback?: string): string => {
    const value = env[name]?.trim() || fallback;
    if (value === undefined) problems.push(`${name} is required`);
    return value ?? "";
  };
  const int = (name: string, fallback: number, min = 1, max = Number.MAX_SAFE_INTEGER): number => {
    const raw = env[name]?.trim();
    if (!raw) return fallback;
    const n = Number(raw);
    if (!Number.isSafeInteger(n) || n < min || n > max) {
      problems.push(`${name} must be an integer from ${min} to ${max}`);
    }
    return n;
  };

  let publicUrl = new URL("http://invalid/");
  const rawUrl = get("FILESLOP_PUBLIC_URL");
  if (rawUrl) {
    try {
      publicUrl = new URL(rawUrl.endsWith("/") ? rawUrl : `${rawUrl}/`);
      if (!["http:", "https:"].includes(publicUrl.protocol) || publicUrl.search || publicUrl.hash) {
        problems.push("FILESLOP_PUBLIC_URL must be an http(s) URL without query or fragment");
      }
    } catch {
      problems.push(`FILESLOP_PUBLIC_URL is not a valid URL: ${rawUrl}`);
    }
  }

  const backend = get("FILESLOP_BACKEND");
  let region = "";
  if (backend === "aws_s3") {
    region = get("FILESLOP_S3_REGION");
  } else if (backend === "hetzner") {
    region = get("FILESLOP_HETZNER_LOCATION");
    if (region && !HETZNER_LOCATIONS.includes(region)) {
      problems.push(`FILESLOP_HETZNER_LOCATION must be one of: ${HETZNER_LOCATIONS.join(", ")}`);
    }
  } else if (backend) {
    problems.push(`FILESLOP_BACKEND must be "aws_s3" or "hetzner", got "${backend}"`);
  }

  let endpoint: URL | undefined;
  const rawEndpoint = env["FILESLOP_S3_ENDPOINT"]?.trim();
  if (rawEndpoint) {
    try {
      endpoint = new URL(rawEndpoint);
      if (!["http:", "https:"].includes(endpoint.protocol)) {
        problems.push("FILESLOP_S3_ENDPOINT must be an http(s) URL");
      }
    } catch {
      problems.push(`FILESLOP_S3_ENDPOINT is not a valid URL: ${rawEndpoint}`);
    }
  }

  const config: Config = {
    host: get("FILESLOP_HOST", "0.0.0.0"),
    port: int("FILESLOP_PORT", 8080, 0, 65535),
    publicUrl,
    baseDir: get("FILESLOP_BASE_DIR", "fileslop").replace(/^\/+|\/+$/g, ""),
    dataDir: dataDir(env),
    maxUploadBytes: int("FILESLOP_MAX_UPLOAD_BYTES", 25 * 1024 * 1024),
    store: {
      backend: backend as Backend,
      bucket: get("FILESLOP_S3_BUCKET"),
      region,
      endpoint,
      credentials: {
        accessKeyId: get("FILESLOP_S3_ACCESS_KEY_ID"),
        secretAccessKey: get("FILESLOP_S3_SECRET_ACCESS_KEY"),
      },
    },
  };
  if (problems.length > 0) {
    throw new ConfigError(
      `invalid configuration:\n  - ${problems.join("\n  - ")}`,
      "Correct the FILESLOP_* variables in the config file or in the environment.",
    );
  }
  return config;
}
