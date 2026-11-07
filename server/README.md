# Fileslop server

The server receives files over HTTP, stores them in an S3-compatible object store, and serves them at a public URL.
It has no runtime dependencies. Node.js (24.2 or later) runs the TypeScript sources directly in the container image.
The npm package `fileslop` contains the compiled server. `npx fileslop serve` starts it (see [ADR-020](../docs/architecture/ADR-020.md)).

## HTTP interface

| Request                        | Result                                                                                                                                                                                                                     |
| ------------------------------ | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `POST <prefix>/`               | Upload. Needs `Authorization: Bearer es.fs1.key.…`, `Content-Type`, `X-FS-Filename`. Optional: `X-FS-Username`, `X-FS-Repository`, `X-FS-Repository-Provider`. Returns `201` and `{id, url, filename, contentType, size}`. |
| `GET <prefix>/<id>/<filename>` | Returns the file with its media type. `404` for unknown files.                                                                                                                                                             |
| `GET <prefix>/healthz`         | Returns `{"status":"ok"}`.                                                                                                                                                                                                 |

Errors have the body `{"error": "<code>", "message": "<text>"}`.
The requirements are in [PRD-upload](../docs/prds/PRD-upload.md) and [PRD-retrieval](../docs/prds/PRD-retrieval.md).

## Data

The server needs a config file. The default is `~/.config/fileslop/.env`. `--config <file>` gives a different path.
The data directory holds `keys.txt` (token hashes) and `index.jsonl` (lookup table). It must be on persistent storage.
The default data directory is `~/.config/fileslop`. The container image uses `/data`.
One server instance uses one data directory.
To run the server and issue tokens, see [operations](../docs/operations.md).

## Source modules

| File                 | Purpose                                                       |
| -------------------- | ------------------------------------------------------------- |
| `src/main.ts`        | Commands `serve` and `issue-key`. The client also calls it.   |
| `src/config.ts`      | Reads and checks the `FILESLOP_*` variables.                  |
| `src/app.ts`         | HTTP routes, header checks, upload and download.              |
| `src/store.ts`       | `ObjectStore` port and the S3 adapter for AWS S3 and Hetzner. |
| `src/sigv4.ts`       | AWS Signature Version 4.                                      |
| `src/keys.ts`        | Token format, key file, `issue-key`.                          |
| `src/file-index.ts`  | Lookup table from file id to object key.                      |
| `src/append-line.ts` | Appends a record to a file and flushes it to disk.            |
| `src/validate.ts`    | Header rules and the ISO week.                                |

## Tests

Unit tests are in `test/`. End-to-end tests are in `../e2e/`.

## Known problem

If Real User Monitoring (RUM) is on, the Dynatrace OneAgent changes the HTTP traffic of monitored Node.js processes:

- It removes conditional headers, for example `If-None-Match`, from incoming requests.
  The mock object store of the end-to-end tests then rejects the signature, and the server returns 502.
- It adds a script to HTML responses. Thus HTML files that the server delivers change.

The agent does not change the outgoing requests to the object store.
On such hosts, disable RUM for the process groups of the server and of the tests.
See [Operations](../docs/operations.md) and [ADR-008](../docs/architecture/ADR-008.md).
