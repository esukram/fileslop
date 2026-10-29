# PRD: Storage backends

## Problem

Operators already use an object store. They need Fileslop to use their store.
Operators in the EU often prefer Hetzner Object Storage. Others use AWS S3.
Stored files must never change after upload.

## Users

- Operators who deploy Fileslop.

## Goals

- Support AWS S3 and Hetzner Object Storage.
- Support other S3-compatible stores through an endpoint override.
- Store useful metadata with each object.
- Organize objects by ISO week.

## Non-goals

- Local file system storage.
- Google Cloud Storage or Azure Blob Storage native APIs.
- Automatic deletion of old objects. Operators use bucket lifecycle rules.
- Replication between stores.

## Functional requirements

- FR-1: The server MUST support `FILESLOP_BACKEND=aws_s3` with the endpoint `https://<bucket>.s3.<region>.amazonaws.com`.
- FR-2: The server MUST support `FILESLOP_BACKEND=hetzner` with the endpoint `https://<bucket>.<location>.your-objectstorage.com`.
- FR-3: For `hetzner`, the location MUST be `fsn1`, `nbg1`, or `hel1`. The location MUST be the signing region.
- FR-4: If `FILESLOP_S3_ENDPOINT` is set, the server MUST use it with path-style URLs.
- FR-5: The server MUST sign each store request with AWS Signature V4 and the SHA-256 payload hash.
- FR-6: The object key MUST have the format `<FILESLOP_BASE_DIR>/<ISO-week-year>-<ISO-week>/<id>/<filename>`. The week MUST have two digits.
- FR-7: The server MUST calculate the ISO 8601 week-year and week from the upload time in UTC.
- FR-8: The server MUST store the content type of the upload as the object `Content-Type`.
- FR-9: The server MUST store this metadata as `x-amz-meta-*` headers: `fs-filename`, `fs-uploader`, and, if present, `fs-username`, `fs-repository`, `fs-repository-provider`.
- FR-10: The server MUST send `If-None-Match: *` with each PUT.
- FR-11: The server MUST return 409 `conflict` if the identifier is already in the index.
- FR-12: The server MUST return 409 `conflict` if the store returns 412 or 409.
- FR-13: The server MUST NOT retry with a new identifier.
- FR-14: The server MUST append one line to `<FILESLOP_DATA_DIR>/index.jsonl` after each successful store write.
- FR-15: The server MUST load the index file at start.

## Non-functional requirements

- NFR-1: The server MUST NOT use a third-party SDK for the store.
- NFR-2: The total metadata size MUST stay below 2 KB.
- NFR-3: Two server instances MUST NOT use the same data folder or the same index.

## Acceptance criteria

- AC-1: The Signature V4 code produces the signature of the official AWS example vector. (unit)
- AC-2: The ISO week function returns `2026-53` for 2027-01-01 and `2026-44` for 2026-10-29. (unit)
- AC-3: The endpoint resolver returns the correct URLs for `aws_s3`, `hetzner`, and the override. (unit)
- AC-4: After an upload, the mock S3 server has the object at the expected key with the expected metadata. (e2e)
- AC-5: A PUT to an existing key in the mock returns 412, and the server returns 409 `conflict`. (e2e)
- AC-6: After a server restart, a GET of an earlier upload returns 200. (e2e)
