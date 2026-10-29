# PRD: Upload

## Problem

Humans and AI agents create artifacts such as HTML plans, screenshots, logs, and reports.
They need a fast way to put an artifact on the web and get a link.
GitHub pull requests cannot attach arbitrary files.

## Users

- Developers who share artifacts with a team.
- AI coding agents that create artifacts during their work.

## Goals

- Upload one file with one authenticated HTTP request.
- Get a stable public URL in the response.
- Get clear, machine-readable errors.

## Non-goals

- Upload of several files in one request.
- Change or deletion of an uploaded file.
- Uploads larger than the configured limit.
- Anonymous uploads.

## Functional requirements

- FR-1: The server MUST accept uploads with `POST <prefix>/`. `<prefix>` is the path of `FILESLOP_PUBLIC_URL`.
- FR-2: The server MUST require a valid Bearer token (see [PRD-authentication](PRD-authentication.md)).
- FR-3: The server MUST require the header `X-FS-Filename` with the pattern `^[A-Za-z0-9][A-Za-z0-9._-]{0,254}$`.
- FR-4: The server MUST accept the optional headers `X-FS-Username`, `X-FS-Repository`, and `X-FS-Repository-Provider` with the pattern `^[A-Za-z0-9][A-Za-z0-9._/-]{0,127}$`.
- FR-5: The server MUST reject an invalid header value. It MUST NOT rewrite the value.
- FR-6: The server MUST require a syntactically valid `Content-Type` header. It MUST NOT infer or sniff the type.
- FR-7: The server MUST reject an empty body.
- FR-8: The server MUST reject a body larger than `FILESLOP_MAX_UPLOAD_BYTES`.
- FR-9: The server MUST create a new UUID v4 identifier for each upload.
- FR-10: The server MUST store the file as described in [PRD-storage-backends](PRD-storage-backends.md).
- FR-11: On success, the server MUST return status 201, a `Location` header with the public URL, and this JSON body:

```json
{
  "id": "550e8400-e29b-41d4-a716-446655440000",
  "url": "https://files.example.org/fileslop/550e8400-e29b-41d4-a716-446655440000/plan.html",
  "filename": "plan.html",
  "contentType": "text/html",
  "size": 1234
}
```

- FR-12: On failure, the server MUST return a JSON body `{"error": "<code>", "message": "<text>"}` with one of these codes:

| Code                   | Status | Cause                                        |
| ---------------------- | ------ | -------------------------------------------- |
| `unauthorized`         | 401    | The token is missing or incorrect.           |
| `invalid_header`       | 400    | A header is missing or has an invalid value. |
| `empty_body`           | 400    | The body is empty.                           |
| `missing_content_type` | 415    | The content type is missing or invalid.      |
| `payload_too_large`    | 413    | The body is larger than the limit.           |
| `conflict`             | 409    | The object already exists.                   |
| `storage_error`        | 502    | The object store failed.                     |

- FR-13: The server MUST NOT write an index line if the store write fails.

## Non-functional requirements

- NFR-1: The server MUST NOT use more than the upload limit of memory for one request body.
- NFR-2: If the `Content-Length` header is larger than the limit, the server MUST return 413 before it reads the body.
- NFR-3: The server MUST NOT write tokens or object store credentials to logs.

## Acceptance criteria

- AC-1: A valid upload returns 201, the JSON body, and a `Location` header. (e2e: upload success)
- AC-2: A GET of the returned URL delivers the same bytes. (e2e: upload and retrieve)
- AC-3: An upload without a token returns 401. (e2e)
- AC-4: An upload with the filename `../x` returns 400 `invalid_header`. (e2e)
- AC-5: An upload without `Content-Type` returns 415 `missing_content_type`. (e2e)
- AC-6: An upload with an empty body returns 400 `empty_body`. (e2e)
- AC-7: An upload larger than the limit returns 413 `payload_too_large`. (e2e with a small limit)
- AC-8: A store failure returns 502 `storage_error`. (e2e with a failing mock)
