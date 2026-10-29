import { randomUUID } from "node:crypto";
import { createServer, type IncomingMessage, type Server, type ServerResponse } from "node:http";
import { Readable } from "node:stream";
import { pipeline } from "node:stream/promises";
import type { FileIndex, IndexEntry } from "./file-index.ts";
import type { KeyStore } from "./keys.ts";
import { type ObjectStore, StorageError } from "./store.ts";
import { FILENAME_RE, ID_RE, isMediaType, isoWeek, METADATA_RE } from "./validate.ts";

export interface AppDeps {
  publicUrl: URL;
  baseDir: string;
  maxUploadBytes: number;
  store: ObjectStore;
  keys: KeyStore;
  index: FileIndex;
  now?: () => Date;
  newId?: () => string;
}

/** Optional request headers, stored as object metadata. */
const METADATA_HEADERS = {
  "x-fs-username": "fs-username",
  "x-fs-repository": "fs-repository",
  "x-fs-repository-provider": "fs-repository-provider",
} as const;

class HttpError extends Error {
  readonly status: number;
  readonly code: string;
  readonly headers: Record<string, string>;

  constructor(status: number, code: string, message: string, headers: Record<string, string> = {}) {
    super(message);
    this.status = status;
    this.code = code;
    this.headers = headers;
  }
}

function sendJson(
  res: ServerResponse,
  status: number,
  body: unknown,
  headers: Record<string, string> = {},
): void {
  const json = JSON.stringify(body) + "\n";
  res.writeHead(status, {
    ...headers,
    "content-type": "application/json; charset=utf-8",
    "content-length": Buffer.byteLength(json),
  });
  res.end(json);
}

/** Reads the body up to `limit` bytes. Returns null when the body is larger. */
function readBody(req: IncomingMessage, limit: number): Promise<Buffer | null> {
  return new Promise((resolve, reject) => {
    const chunks: Buffer[] = [];
    let size = 0;
    const onData = (chunk: Buffer): void => {
      size += chunk.length;
      if (size > limit) {
        req.off("data", onData);
        req.pause();
        resolve(null);
      } else {
        chunks.push(chunk);
      }
    };
    req.on("data", onData);
    req.on("end", () => {
      resolve(Buffer.concat(chunks));
    });
    req.on("error", reject);
  });
}

export function createApp(deps: AppDeps): Server {
  const prefix = deps.publicUrl.pathname; // Ends with "/".
  const now = deps.now ?? (() => new Date());
  const newId = deps.newId ?? randomUUID;
  /** Ids of uploads in progress, so that two uploads cannot get the same id. */
  const pending = new Set<string>();
  const tooLarge = new HttpError(
    413,
    "payload_too_large",
    `The file is larger than the limit of ${deps.maxUploadBytes} bytes.`,
  );

  async function upload(req: IncomingMessage, res: ServerResponse): Promise<void> {
    const auth = /^Bearer[ ]+(\S+)$/i.exec(req.headers.authorization ?? "");
    const uploader = auth?.[1] ? await deps.keys.authenticate(auth[1]) : undefined;
    if (!uploader) {
      throw new HttpError(
        401,
        "unauthorized",
        "Send a valid token in the header 'Authorization: Bearer es.fs1.key.…'.",
        { "www-authenticate": 'Bearer realm="fileslop"' },
      );
    }

    const contentType = req.headers["content-type"]?.trim() ?? "";
    if (!isMediaType(contentType)) {
      throw new HttpError(
        415,
        "missing_content_type",
        "Send the media type of the file in the Content-Type header, for example 'text/html'.",
      );
    }

    const filename = req.headers["x-fs-filename"];
    if (typeof filename !== "string" || !FILENAME_RE.test(filename)) {
      throw new HttpError(
        400,
        "invalid_header",
        "Send the header X-FS-Filename with 1-255 characters of A-Z a-z 0-9 . _ - that start with a letter or digit.",
      );
    }
    const metadata: Record<string, string> = { "fs-uploader": uploader, "fs-filename": filename };
    for (const [header, name] of Object.entries(METADATA_HEADERS)) {
      const value = req.headers[header];
      if (value === undefined) continue;
      if (typeof value !== "string" || !METADATA_RE.test(value)) {
        throw new HttpError(
          400,
          "invalid_header",
          `Header ${header} must have 1-128 characters of A-Z a-z 0-9 . _ / - that start with a letter or digit.`,
        );
      }
      metadata[name] = value;
    }

    if (Number(req.headers["content-length"]) > deps.maxUploadBytes) throw tooLarge;
    const body = await readBody(req, deps.maxUploadBytes);
    if (body === null) {
      // The rest of the body is not read, so the connection cannot be used again.
      res.setHeader("connection", "close");
      throw tooLarge;
    }
    const id = newId();
    if (deps.index.get(id) || pending.has(id)) {
      throw new HttpError(409, "conflict", `The file id ${id} exists already. Upload again.`);
    }
    pending.add(id);
    try {
      await store(res, id, filename, contentType, uploader, metadata, body);
    } finally {
      pending.delete(id);
    }
  }

  async function store(
    res: ServerResponse,
    id: string,
    filename: string,
    contentType: string,
    uploader: string,
    metadata: Record<string, string>,
    body: Buffer,
  ): Promise<void> {
    const key = [deps.baseDir, isoWeek(now()), id, filename].filter(Boolean).join("/");
    if ((await deps.store.put(key, body, contentType, metadata)) === "exists") {
      throw new HttpError(409, "conflict", `The object ${key} exists already. Upload again.`);
    }
    const entry: IndexEntry = {
      id,
      key,
      filename,
      contentType,
      size: body.length,
      uploader,
      createdAt: now().toISOString(),
    };
    await deps.index.add(entry);

    const url = new URL(`${id}/${filename}`, deps.publicUrl).href;
    sendJson(res, 201, { id, url, filename, contentType, size: body.length }, { location: url });
  }

  async function download(res: ServerResponse, id: string, filename: string): Promise<void> {
    const entry = deps.index.get(id);
    const object = entry?.filename === filename ? await deps.store.get(entry.key) : null;
    if (!entry || !object) {
      throw new HttpError(404, "not_found", "No file exists at this URL.");
    }
    const headers: Record<string, string | number> = {
      "content-type": entry.contentType,
      "content-disposition": `inline; filename="${entry.filename}"`,
      "x-content-type-options": "nosniff",
      // HTML runs in an opaque origin: scripts work, same-origin access does not.
      "content-security-policy": "sandbox allow-scripts",
      "cache-control": "public, max-age=31536000, immutable",
    };
    if (object.size !== undefined) headers["content-length"] = object.size;
    res.writeHead(200, headers);
    await pipeline(Readable.fromWeb(object.body), res);
  }

  async function route(req: IncomingMessage, res: ServerResponse): Promise<void> {
    const path = new URL(req.url ?? "/", "http://localhost").pathname;
    const method = req.method ?? "GET";
    const read = method === "GET" || method === "HEAD";

    if (path === prefix || path === prefix.slice(0, -1)) {
      if (method === "POST") return upload(req, res);
      throw new HttpError(405, "method_not_allowed", "Use POST to upload a file.", {
        allow: "POST",
      });
    }
    if (path === `${prefix}healthz`) {
      if (read) {
        sendJson(res, 200, { status: "ok" });
        return;
      }
      throw new HttpError(405, "method_not_allowed", "Use GET.", { allow: "GET, HEAD" });
    }
    const match = path.startsWith(prefix) ? path.slice(prefix.length).split("/") : [];
    if (match.length === 2 && ID_RE.test(match[0] ?? "") && match[1]) {
      if (read) return download(res, match[0] ?? "", match[1]);
      throw new HttpError(405, "method_not_allowed", "Use GET to read a file.", {
        allow: "GET, HEAD",
      });
    }
    throw new HttpError(404, "not_found", "No file exists at this URL.");
  }

  return createServer((req, res) => {
    const started = performance.now();
    res.on("finish", () => {
      const ms = Math.round(performance.now() - started);
      // Log the path only: a query string can contain secrets.
      const path = (req.url ?? "-").split("?")[0] ?? "-";
      console.log(`${req.method ?? "-"} ${path} ${res.statusCode} ${ms}ms`);
    });
    route(req, res).catch((err: unknown) => {
      if (res.headersSent) {
        res.destroy(err instanceof Error ? err : undefined);
        return;
      }
      if (err instanceof HttpError) {
        sendJson(res, err.status, { error: err.code, message: err.message }, err.headers);
        return;
      }
      console.error(err);
      if (err instanceof StorageError) {
        sendJson(res, 502, {
          error: "storage_error",
          message: "The object store failed. Try again later.",
        });
        return;
      }
      sendJson(res, 500, {
        error: "internal_error",
        message: "The server failed. Try again later.",
      });
    });
  });
}
