import { randomBytes } from "node:crypto";
import { appendFile, mkdir, readFile, stat } from "node:fs/promises";
import { dirname } from "node:path";
import { sha256Hex } from "./sigv4.ts";

/** Fixed prefix so that secret scanners can find leaked tokens. */
export const TOKEN_PREFIX = "es.fs1.key.";
export const USERNAME_RE = /^[A-Za-z0-9][A-Za-z0-9._-]{0,63}$/;
const HASH_RE = /^[0-9a-f]{64}$/;

export const generateToken = (): string => TOKEN_PREFIX + randomBytes(32).toString("base64url");

/** Parses the key file: one `username:<sha256 hex of token>` per line. Returns hash → username. */
export function parseKeys(
  text: string,
  warn: (msg: string) => void = console.warn,
): Map<string, string> {
  const keys = new Map<string, string>();
  text.split("\n").forEach((raw, i) => {
    const line = raw.trim();
    if (line === "" || line.startsWith("#")) return;
    const sep = line.indexOf(":");
    const username = line.slice(0, sep).trim();
    const hash = line.slice(sep + 1).trim();
    if (sep < 0 || !USERNAME_RE.test(username) || !HASH_RE.test(hash)) {
      warn(`keys file line ${i + 1}: expected "username:<sha256 hex>", line ignored`);
      return;
    }
    keys.set(hash, username);
  });
  return keys;
}

/** Key file with reload on change, so that `issue-key` works while the server runs. */
export class KeyStore {
  readonly #file: string;
  #version = "";
  #keys = new Map<string, string>();

  constructor(file: string) {
    this.#file = file;
  }

  /** Returns the username for a valid token, otherwise undefined. */
  async authenticate(token: string): Promise<string | undefined> {
    if (!token.startsWith(TOKEN_PREFIX)) return undefined;
    await this.#reload();
    return this.#keys.get(sha256Hex(token));
  }

  get size(): number {
    return this.#keys.size;
  }

  async #reload(): Promise<void> {
    let version: string;
    try {
      const s = await stat(this.#file);
      version = `${s.mtimeMs}:${s.size}`;
    } catch {
      this.#keys = new Map();
      this.#version = "";
      return;
    }
    if (version === this.#version) return;
    this.#keys = parseKeys(await readFile(this.#file, "utf8"));
    this.#version = version;
  }

  async load(): Promise<void> {
    await this.#reload();
  }
}

/** Creates a token for `username`, stores its hash and returns the token. */
export async function issueKey(file: string, username: string): Promise<string> {
  if (!USERNAME_RE.test(username)) {
    throw new Error(`invalid username "${username}": use 1-64 characters of A-Z a-z 0-9 . _ -`);
  }
  const token = generateToken();
  await mkdir(dirname(file), { recursive: true });
  await appendFile(file, `${username}:${sha256Hex(token)}\n`, { mode: 0o600 });
  return token;
}
