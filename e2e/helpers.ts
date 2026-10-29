import { spawn } from "node:child_process";
import { mkdtemp } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { ACCESS_KEY_ID, type MockS3, SECRET_ACCESS_KEY } from "./mock-s3.ts";

const ROOT = join(import.meta.dirname, "..");
export const PUBLIC_URL = "https://files.example.org/fileslop/";

export interface RunResult {
  code: number | null;
  stdout: string;
  stderr: string;
}

/** Runs a command with a minimal environment, so that the developer's settings do not leak in. */
export function run(
  args: string[],
  env: Record<string, string>,
  cwd: string,
  timeoutMs = 15_000,
): Promise<RunResult> {
  return new Promise((resolve, reject) => {
    const child = spawn(process.execPath, args, {
      cwd,
      env: { PATH: process.env["PATH"] ?? "", HOME: cwd, ...env },
      timeout: timeoutMs,
    });
    let stdout = "";
    let stderr = "";
    child.stdout.on("data", (c: Buffer) => (stdout += c.toString()));
    child.stderr.on("data", (c: Buffer) => (stderr += c.toString()));
    child.on("error", reject);
    child.on("close", (code) => {
      resolve({ code, stdout, stderr });
    });
  });
}

export const tempDir = (): Promise<string> => mkdtemp(join(tmpdir(), "fileslop-e2e-"));

export function serverEnv(mock: MockS3, dataDir: string, extra: Record<string, string> = {}) {
  return {
    FILESLOP_PUBLIC_URL: PUBLIC_URL,
    FILESLOP_HOST: "127.0.0.1",
    FILESLOP_PORT: "0",
    FILESLOP_BACKEND: "hetzner",
    FILESLOP_HETZNER_LOCATION: "fsn1",
    FILESLOP_S3_ENDPOINT: mock.url,
    FILESLOP_S3_BUCKET: mock.bucket,
    FILESLOP_S3_ACCESS_KEY_ID: ACCESS_KEY_ID,
    FILESLOP_S3_SECRET_ACCESS_KEY: SECRET_ACCESS_KEY,
    FILESLOP_DATA_DIR: dataDir,
    ...extra,
  };
}

export const SERVER = join(ROOT, "server/src/main.ts");
export const CLIENT = join(ROOT, "client/src/cli.ts");

export async function issueKey(dataDir: string, username: string): Promise<string> {
  const result = await run([SERVER, "issue-key", username], { FILESLOP_DATA_DIR: dataDir }, dataDir);
  if (result.code !== 0) throw new Error(`issue-key failed: ${result.stderr}`);
  return result.stdout.trim();
}

export interface RunningServer {
  /** Local address of the upload URL, for example http://127.0.0.1:1234/fileslop/ */
  url: string;
  logs: () => string;
  stop(): Promise<void>;
  /** Maps a public URL to the local server, like a reverse proxy does. */
  local(publicUrl: string): string;
}

export async function startServer(env: Record<string, string>, cwd: string): Promise<RunningServer> {
  const child = spawn(process.execPath, [SERVER, "serve"], {
    cwd,
    env: { PATH: process.env["PATH"] ?? "", ...env },
  });
  let output = "";
  const url = await new Promise<string>((resolve, reject) => {
    const timer = setTimeout(() => {
      reject(new Error(`server did not start:\n${output}`));
    }, 10_000);
    const onData = (chunk: Buffer): void => {
      output += chunk.toString();
      const match = /listening on (http:\/\/\S+)/.exec(output);
      if (match?.[1]) {
        clearTimeout(timer);
        resolve(match[1]);
      }
    };
    child.stdout.on("data", onData);
    child.stderr.on("data", onData);
    child.on("exit", (code) => {
      clearTimeout(timer);
      reject(new Error(`server exited with ${code}:\n${output}`));
    });
  });
  const base = new URL(url);
  return {
    url,
    logs: () => output,
    local: (publicUrl) => new URL(new URL(publicUrl).pathname, base).href,
    stop: () =>
      new Promise((resolve) => {
        child.removeAllListeners("exit");
        child.once("exit", () => resolve());
        child.kill("SIGTERM");
      }),
  };
}
