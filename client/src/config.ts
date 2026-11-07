import { readFileSync } from "node:fs";
import { homedir } from "node:os";
import { dirname, join } from "node:path";
import { parseEnv } from "node:util";

export const TOKEN_PREFIX = "es.fs1.key.";

export interface Setting {
  value: string | undefined;
  source: string;
}

export interface ClientConfig {
  file: string;
  /** The .env file in the folder of `file`. The server reads the same file name. */
  envFile: string;
  url: Setting;
  token: Setting;
  /** Problem with a config file, if any. */
  fileError: string | undefined;
}

export function configFile(env: NodeJS.ProcessEnv): string {
  if (env["FILESLOP_CONFIG"]) return env["FILESLOP_CONFIG"];
  const base = env["XDG_CONFIG_HOME"] || join(homedir(), ".config");
  return join(base, "fileslop", "config.json");
}

/** Priority: environment variables, then the .env file, then config.json. */
export function resolveConfig(env: NodeJS.ProcessEnv): ClientConfig {
  const file = configFile(env);
  const envFile = join(dirname(file), ".env");
  let fromFile: Record<string, unknown> = {};
  let fromEnvFile: Record<string, string | undefined> = {};
  let fileError: string | undefined;
  try {
    fromEnvFile = parseEnv(readFileSync(envFile, "utf8"));
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code !== "ENOENT") {
      fileError = `cannot read ${envFile}: ${err instanceof Error ? err.message : String(err)}`;
    }
  }
  try {
    const parsed: unknown = JSON.parse(readFileSync(file, "utf8"));
    if (typeof parsed === "object" && parsed !== null) fromFile = parsed as Record<string, unknown>;
    else fileError ??= `${file} must contain a JSON object`;
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code !== "ENOENT") {
      fileError ??= `cannot read ${file}: ${err instanceof Error ? err.message : String(err)}`;
    }
  }
  const setting = (envName: string, key: string): Setting => {
    const fromEnv = env[envName]?.trim();
    if (fromEnv) return { value: fromEnv, source: `environment variable ${envName}` };
    const fromDotenv = fromEnvFile[envName]?.trim();
    if (fromDotenv) return { value: fromDotenv, source: `config file ${envFile}` };
    const value = fromFile[key];
    if (typeof value === "string" && value.trim()) {
      return { value: value.trim(), source: `config file ${file}` };
    }
    return { value: undefined, source: "not set" };
  };
  return {
    file,
    envFile,
    url: setting("FILESLOP_URL", "url"),
    token: setting("FILESLOP_TOKEN", "token"),
    fileError,
  };
}

export const maskToken = (token: string): string =>
  token.startsWith(TOKEN_PREFIX)
    ? `${token.slice(0, TOKEN_PREFIX.length + 4)}…`
    : "(invalid: does not start with es.fs1.key.)";
