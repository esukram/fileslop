# Fileslop server

The server receives files over HTTP, stores them in an S3-compatible object store, and serves them at a public URL.
It has no runtime dependencies. Node.js (24.2 or later) runs the TypeScript sources directly.

## HTTP interface

| Request | Result |
| --- | --- |
| `POST <prefix>/` | Upload. Needs `Authorization: Bearer es.fs1.key.…`, `Content-Type`, `X-FS-Filename`. Optional: `X-FS-Username`, `X-FS-Repository`, `X-FS-Repository-Provider`. Returns `201` and `{id, url, filename, contentType, size}`. |
| `GET <prefix>/<id>/<filename>` | Returns the file with its media type. `404` for unknown files. |
| `GET <prefix>/healthz` | Returns `{"status":"ok"}`. |

Errors have the body `{"error": "<code>", "message": "<text>"}`.
The requirements are in [PRD-upload](../docs/prds/PRD-upload.md) and [PRD-retrieval](../docs/prds/PRD-retrieval.md).

## Run

1. Copy `.env.sample` to `.env` and set the values.
2. Create a token: `node src/main.ts issue-key alice`. The command prints the token one time.
3. Start the server: `node src/main.ts serve`.

With the container image:

```sh
docker run -d -p 8080:8080 --env-file .env -v fileslop-data:/data ghcr.io/esukram/fileslop-server:0.1.0
docker run --rm -v fileslop-data:/data ghcr.io/esukram/fileslop-server:0.1.0 issue-key alice
```

The data directory holds `keys.txt` (token hashes) and `index.jsonl` (lookup table). Keep it on persistent storage.
Run one server instance per data directory.

## Source modules

| File | Purpose |
| --- | --- |
| `src/main.ts` | Entry point: commands `serve` and `issue-key`. |
| `src/config.ts` | Reads and checks the `FILESLOP_*` variables. |
| `src/app.ts` | HTTP routes, header checks, upload and download. |
| `src/store.ts` | `ObjectStore` port and the S3 adapter for AWS S3 and Hetzner. |
| `src/sigv4.ts` | AWS Signature Version 4. |
| `src/keys.ts` | Token format, key file, `issue-key`. |
| `src/file-index.ts` | Lookup table from file id to object key. |
| `src/validate.ts` | Header rules and the ISO week. |

## Test

Run `pnpm test` in the repository root. Unit tests are in `test/`. End-to-end tests are in `../e2e/`.

## Known problem

Some APM agents (for example the Dynatrace OneAgent) change outgoing HTTP requests.
On such hosts the agent removes the signed `If-None-Match` header, and the object store rejects the signature.
Disable the agent's HTTP request injection for this process. See [ADR-008](../docs/architecture/ADR-008.md).
