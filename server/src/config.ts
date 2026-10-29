import { resolve } from "node:path";
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

export class ConfigError extends Error {}

const HETZNER_LOCATIONS = ["fsn1", "nbg1", "hel1"];

/** Data directory for keys and index. Only needs FILESLOP_DATA_DIR. */
export const dataDir = (env: NodeJS.ProcessEnv): string =>
  resolve(env["FILESLOP_DATA_DIR"] || "./data");

/** Reads the configuration and reports all problems at once. */
export function loadConfig(env: NodeJS.ProcessEnv): Config {
  const problems: string[] = [];
  const get = (name: string, fallback?: string): string => {
    const value = env[name]?.trim() || fallback;
    if (value === undefined) problems.push(`${name} is required`);
    return value ?? "";
  };
  const int = (name: string, fallback: number, min = 1): number => {
    const raw = env[name]?.trim();
    if (!raw) return fallback;
    const n = Number(raw);
    if (!Number.isSafeInteger(n) || n < min) problems.push(`${name} must be an integer >= ${min}`);
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
    } catch {
      problems.push(`FILESLOP_S3_ENDPOINT is not a valid URL: ${rawEndpoint}`);
    }
  }

  const config: Config = {
    host: get("FILESLOP_HOST", "0.0.0.0"),
    port: int("FILESLOP_PORT", 8080, 0),
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
    throw new ConfigError(`invalid configuration:\n  - ${problems.join("\n  - ")}`);
  }
  return config;
}
