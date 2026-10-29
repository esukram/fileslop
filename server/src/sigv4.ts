import { createHash, createHmac } from "node:crypto";

// AWS Signature Version 4, header-based, as the S3 API documents it:
// https://docs.aws.amazon.com/AmazonS3/latest/API/sig-v4-header-based-auth.html

export interface Credentials {
  accessKeyId: string;
  secretAccessKey: string;
}

export interface SignInput {
  method: string;
  url: URL;
  /** Headers to sign and send. */
  headers: Record<string, string>;
  payloadHash: string;
  region: string;
  date: Date;
}

export const EMPTY_SHA256 = "e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855";

export const sha256Hex = (data: string | Uint8Array): string =>
  createHash("sha256").update(data).digest("hex");

const hmac = (key: string | Buffer, data: string): Buffer =>
  createHmac("sha256", key).update(data).digest();

/** RFC 3986 encoding, as SigV4 requires. */
export const uriEncode = (s: string): string =>
  encodeURIComponent(s).replace(
    /[!'()*]/g,
    (c) => "%" + c.charCodeAt(0).toString(16).toUpperCase(),
  );

/** Returns the headers to send, including `authorization`. The `host` header is signed, not returned. */
export function sign(input: SignInput, creds: Credentials): Record<string, string> {
  const amzDate = input.date.toISOString().replace(/[-:]|\.\d{3}/g, "");
  const day = amzDate.slice(0, 8);
  const scope = `${day}/${input.region}/s3/aws4_request`;

  const headers: Record<string, string> = {};
  for (const [name, value] of Object.entries(input.headers)) headers[name.toLowerCase()] = value;
  headers["x-amz-date"] = amzDate;
  headers["x-amz-content-sha256"] = input.payloadHash;
  const signed: Record<string, string> = { ...headers, host: input.url.host };

  const names = Object.keys(signed).sort();
  const canonicalHeaders = names
    .map((n) => `${n}:${(signed[n] ?? "").trim().replace(/\s+/g, " ")}\n`)
    .join("");
  const signedHeaders = names.join(";");
  const canonicalQuery = [...input.url.searchParams]
    .map(([k, v]) => `${uriEncode(k)}=${uriEncode(v)}`)
    .sort()
    .join("&");
  // The caller builds the path from already encoded segments; S3 does not double-encode.
  const canonicalRequest = [
    input.method,
    input.url.pathname,
    canonicalQuery,
    canonicalHeaders,
    signedHeaders,
    input.payloadHash,
  ].join("\n");

  const stringToSign = ["AWS4-HMAC-SHA256", amzDate, scope, sha256Hex(canonicalRequest)].join("\n");
  const kDate = hmac(`AWS4${creds.secretAccessKey}`, day);
  const kSigning = hmac(hmac(hmac(kDate, input.region), "s3"), "aws4_request");
  const signature = createHmac("sha256", kSigning).update(stringToSign).digest("hex");

  headers["authorization"] =
    `AWS4-HMAC-SHA256 Credential=${creds.accessKeyId}/${scope},` +
    `SignedHeaders=${signedHeaders},Signature=${signature}`;
  return headers;
}
