import { readFileSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";

export const TOKEN_PREFIX = "es.fs1.key.";

export interface Setting {
  value: string | undefined;
  source: string;
}

export interface ClientConfig {
  file: string;
  url: Setting;
  token: Setting;
  /** Problem with the config file, if any. */
  fileError: string | undefined;
}

export function configFile(env: NodeJS.ProcessEnv): string {
  if (env["FILESLOP_CONFIG"]) return env["FILESLOP_CONFIG"];
  const base = env["XDG_CONFIG_HOME"] || join(homedir(), ".config");
  return join(base, "fileslop", "config.json");
}

/** Environment variables win over the config file. */
export function resolveConfig(env: NodeJS.ProcessEnv): ClientConfig {
  const file = configFile(env);
  let fromFile: Record<string, unknown> = {};
  let fileError: string | undefined;
  try {
    const parsed: unknown = JSON.parse(readFileSync(file, "utf8"));
    if (typeof parsed === "object" && parsed !== null) fromFile = parsed as Record<string, unknown>;
    else fileError = `${file} must contain a JSON object`;
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code !== "ENOENT") {
      fileError = `cannot read ${file}: ${err instanceof Error ? err.message : String(err)}`;
    }
  }
  const setting = (envName: string, key: string): Setting => {
    const fromEnv = env[envName]?.trim();
    if (fromEnv) return { value: fromEnv, source: `environment variable ${envName}` };
    const value = fromFile[key];
    if (typeof value === "string" && value.trim()) {
      return { value: value.trim(), source: `config file ${file}` };
    }
    return { value: undefined, source: "not set" };
  };
  return {
    file,
    url: setting("FILESLOP_URL", "url"),
    token: setting("FILESLOP_TOKEN", "token"),
    fileError,
  };
}

export const maskToken = (token: string): string =>
  token.startsWith(TOKEN_PREFIX)
    ? `${token.slice(0, TOKEN_PREFIX.length + 4)}…`
    : "(invalid: does not start with es.fs1.key.)";
