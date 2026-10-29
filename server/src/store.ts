import { type Credentials, sha256Hex, sign, uriEncode, EMPTY_SHA256 } from "./sigv4.ts";

export interface StoredObject {
  body: ReadableStream<Uint8Array>;
  size: number | undefined;
}

/** Port for object stores. Adapters must never overwrite an existing key. */
export interface ObjectStore {
  put(
    key: string,
    body: Uint8Array,
    contentType: string,
    metadata: Record<string, string>,
  ): Promise<"created" | "exists">;
  get(key: string): Promise<StoredObject | null>;
}

export class StorageError extends Error {}

export type Backend = "aws_s3" | "hetzner";

export interface StoreConfig {
  backend: Backend;
  bucket: string;
  credentials: Credentials;
  /** AWS region, or Hetzner location (fsn1, nbg1, hel1). */
  region: string;
  /** Optional S3-compatible endpoint. Uses path-style URLs. */
  endpoint: URL | undefined;
}

/** Adapter for the S3 protocol. AWS S3 and Hetzner Object Storage both speak it. */
export class S3Store implements ObjectStore {
  readonly #baseUrl: URL;
  readonly #region: string;
  readonly #credentials: Credentials;

  /** `baseUrl` is the bucket root and ends with "/". */
  constructor(baseUrl: URL, region: string, credentials: Credentials) {
    this.#baseUrl = baseUrl;
    this.#region = region;
    this.#credentials = credentials;
  }

  async put(
    key: string,
    body: Uint8Array,
    contentType: string,
    metadata: Record<string, string>,
  ): Promise<"created" | "exists"> {
    const headers: Record<string, string> = {
      "content-type": contentType,
      // Conditional write: the store rejects the request when the key exists.
      "if-none-match": "*",
    };
    for (const [name, value] of Object.entries(metadata)) headers[`x-amz-meta-${name}`] = value;
    const res = await this.#send("PUT", key, headers, body);
    if (res.status === 412 || res.status === 409) {
      await res.body?.cancel();
      return "exists";
    }
    if (!res.ok) throw new StorageError(`PUT ${key}: HTTP ${res.status} ${await res.text()}`);
    await res.body?.cancel();
    return "created";
  }

  async get(key: string): Promise<StoredObject | null> {
    const res = await this.#send("GET", key, {}, undefined);
    if (res.status === 404) {
      await res.body?.cancel();
      return null;
    }
    if (!res.ok || !res.body) {
      throw new StorageError(`GET ${key}: HTTP ${res.status} ${await res.text()}`);
    }
    const length = res.headers.get("content-length");
    return { body: res.body, size: length === null ? undefined : Number(length) };
  }

  async #send(
    method: string,
    key: string,
    headers: Record<string, string>,
    body: Uint8Array | undefined,
  ): Promise<Response> {
    const url = new URL(key.split("/").map(uriEncode).join("/"), this.#baseUrl);
    const signed = sign(
      {
        method,
        url,
        headers,
        payloadHash: body ? sha256Hex(body) : EMPTY_SHA256,
        region: this.#region,
        date: new Date(),
      },
      this.#credentials,
    );
    try {
      return await fetch(url, { method, headers: signed, body: body ?? null });
    } catch (err) {
      throw new StorageError(`${method} ${key}: ${String(err)}`, { cause: err });
    }
  }
}

/** Creates the adapter for the configured backend. */
export function createStore(config: StoreConfig): ObjectStore {
  const { bucket, region, credentials } = config;
  if (config.endpoint) {
    const base = config.endpoint.href.endsWith("/")
      ? config.endpoint.href
      : `${config.endpoint.href}/`;
    return new S3Store(new URL(`${uriEncode(bucket)}/`, base), region, credentials);
  }
  const host =
    config.backend === "aws_s3"
      ? `${bucket}.s3.${region}.amazonaws.com`
      : `${bucket}.${region}.your-objectstorage.com`;
  return new S3Store(new URL(`https://${host}/`), region, credentials);
}
