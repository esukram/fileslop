import { createHash } from "node:crypto";
import { createServer, type IncomingHttpHeaders } from "node:http";
import type { AddressInfo } from "node:net";
import { sign } from "../server/src/sigv4.ts";

export interface MockObject {
  body: Buffer;
  contentType: string;
  metadata: Record<string, string>;
}

export interface MockS3 {
  url: string;
  bucket: string;
  objects: Map<string, MockObject>;
  requests: { method: string; key: string; headers: IncomingHttpHeaders }[];
  /** Answer every request with HTTP 500. */
  failing: boolean;
  close(): Promise<void>;
}

export const ACCESS_KEY_ID = "test-access-key";
export const SECRET_ACCESS_KEY = "test-secret-key";

/** Recomputes the SigV4 signature from the received headers, as S3 does. */
function validSignature(method: string, url: URL, headers: IncomingHttpHeaders): boolean {
  const auth = headers.authorization ?? "";
  const m = /Credential=[^/]+\/(\d{8})\/([^/]+)\/s3\/aws4_request,SignedHeaders=([^,]+),/.exec(
    auth,
  );
  const amzDate = headers["x-amz-date"];
  if (!m?.[3] || typeof amzDate !== "string" || !amzDate.startsWith(m[1] ?? "-")) return false;
  const signed: Record<string, string> = {};
  for (const name of m[3].split(";")) {
    const value = headers[name];
    if (typeof value !== "string") return false; // A signed header is missing.
    if (name !== "host" && name !== "x-amz-date" && name !== "x-amz-content-sha256") {
      signed[name] = value;
    }
  }
  const date = new Date(
    amzDate.replace(/^(\d{4})(\d\d)(\d\d)T(\d\d)(\d\d)(\d\d)Z$/, "$1-$2-$3T$4:$5:$6Z"),
  );
  const expected = sign(
    {
      method,
      url,
      headers: signed,
      payloadHash: String(headers["x-amz-content-sha256"]),
      region: m[2] ?? "",
      date,
    },
    { accessKeyId: ACCESS_KEY_ID, secretAccessKey: SECRET_ACCESS_KEY },
  );
  return expected["authorization"] === auth;
}

/** Minimal path-style S3: PUT (with If-None-Match), GET. Checks the signature shape and payload hash. */
export async function startMockS3(bucket = "test-bucket"): Promise<MockS3> {
  const mock: MockS3 = {
    url: "",
    bucket,
    objects: new Map(),
    requests: [],
    failing: false,
    close: () =>
      new Promise((resolve) =>
        server.close(() => {
          resolve();
        }),
      ),
  };
  const xmlError = (code: string): string =>
    `<?xml version="1.0" encoding="UTF-8"?><Error><Code>${code}</Code></Error>`;

  const server = createServer((req, res) => {
    const chunks: Buffer[] = [];
    req.on("data", (c: Buffer) => chunks.push(c));
    req.on("end", () => {
      const body = Buffer.concat(chunks);
      const path = decodeURIComponent(new URL(req.url ?? "/", "http://x").pathname);
      const key = path.slice(`/${bucket}/`.length);
      mock.requests.push({ method: req.method ?? "", key, headers: req.headers });
      const reply = (status: number, code: string): void => {
        res.writeHead(status, { "content-type": "application/xml" }).end(xmlError(code));
      };

      if (mock.failing) {
        reply(500, "InternalError");
        return;
      }
      if (!path.startsWith(`/${bucket}/`)) {
        reply(404, "NoSuchBucket");
        return;
      }
      const url = new URL(req.url ?? "/", `http://${req.headers.host ?? "x"}`);
      if (!validSignature(req.method ?? "", url, req.headers)) {
        reply(403, "SignatureDoesNotMatch");
        return;
      }
      const hash = createHash("sha256").update(body).digest("hex");
      if (req.headers["x-amz-content-sha256"] !== hash) {
        reply(400, "XAmzContentSHA256Mismatch");
        return;
      }

      if (req.method === "PUT") {
        if (req.headers["if-none-match"] === "*" && mock.objects.has(key)) {
          reply(412, "PreconditionFailed");
          return;
        }
        const metadata: Record<string, string> = {};
        for (const [name, value] of Object.entries(req.headers)) {
          if (name.startsWith("x-amz-meta-") && typeof value === "string") {
            metadata[name.slice("x-amz-meta-".length)] = value;
          }
        }
        mock.objects.set(key, {
          body,
          contentType: req.headers["content-type"] ?? "binary/octet-stream",
          metadata,
        });
        res.writeHead(200).end();
        return;
      }
      if (req.method === "GET") {
        const object = mock.objects.get(key);
        if (!object) {
          reply(404, "NoSuchKey");
          return;
        }
        res.writeHead(200, {
          "content-type": object.contentType,
          "content-length": object.body.length,
        });
        res.end(object.body);
        return;
      }
      reply(405, "MethodNotAllowed");
    });
  });
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  mock.url = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
  return mock;
}
