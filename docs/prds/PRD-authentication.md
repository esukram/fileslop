# PRD: Authentication

## Problem

Only known users can upload files. An open upload endpoint attracts abuse.
Tokens can leak into logs, shell history, and repositories.
A leak of server files must not leak tokens.

## Users

- Operators who issue and revoke keys.
- Developers and AI agents who upload files.

## Goals

- Simple token-based authentication for uploads.
- Key issue, rotation, and revocation without a server restart.
- Detection of leaked tokens.

## Non-goals

- User accounts, passwords, or a web login.
- OAuth or OpenID Connect.
- Token scopes and expiry dates.
- Authentication for retrieval.

## Functional requirements

- FR-1: The server MUST read the token from the header `Authorization: Bearer <token>`.
- FR-2: The server MUST NOT accept a token in the URL.
- FR-3: A token MUST have the format `es.fs1.key.` followed by 43 base64url characters (32 random bytes).
- FR-4: The server MUST read keys from `<FILESLOP_DATA_DIR>/keys.txt`.
- FR-5: Each key line MUST have the format `username:<SHA-256 hex of token>`.
- FR-6: The server MUST ignore lines that start with `#` and empty lines.
- FR-7: The key file MUST allow several keys for one username.
- FR-8: The server MUST NOT store a plaintext token.
- FR-9: The command `issue-key <username>` MUST create a token from a cryptographic random source.
- FR-10: `issue-key` MUST append the hash line to the key file and flush it to disk with `fsync`. If the last line has no newline, `issue-key` MUST add a newline first.
- FR-11: `issue-key` MUST print the token one time on stdout.
- FR-12: The running server MUST reload the key file when its modification time or its size changes.
- FR-13: A missing or incorrect token MUST give status 401, the error code `unauthorized`, and a `WWW-Authenticate` header with the `Bearer` scheme. The server sends `Bearer realm="fileslop"`.
- FR-14: The server MUST store the authenticated username as object metadata `fs-uploader`.
- FR-15: CI MUST fail if a committed file contains a string with the prefix `es.fs1.key.` and a token body.

## Rotation procedure

1. Run `issue-key <username>` to create a new token.
2. Give the new token to the user.
3. Make sure that the user changed the configuration.
4. Remove the old line from `keys.txt`.

## Non-functional requirements

- NFR-1: The server MUST NOT write tokens to logs. A request log line MUST contain the path only, never the query string.
- NFR-2: A key change MUST become active without a restart.

## Acceptance criteria

- AC-1: An upload with a valid token returns 201. (e2e: `e2e/server.test.ts`)
- AC-2: An upload without a token returns 401 with `WWW-Authenticate: Bearer`. (e2e: `e2e/server.test.ts`)
- AC-3: An upload with a wrong token, or with a token without the prefix, returns 401. (e2e: `e2e/server.test.ts`)
- AC-4: `issueKey()` returns a token with the prefix `es.fs1.key.` and 43 characters, and appends one hash line. (unit: `server/test/keys.test.ts`)
- AC-5: `issueKey()` keeps the last record of a key file without a final newline. (unit: `server/test/keys.test.ts`)
- AC-6: A token issued while the server runs works without a restart. (e2e: `e2e/server.test.ts`)
- AC-7: A key line removed while the server runs stops the token without a restart. (e2e: `e2e/server.test.ts`)
- AC-8: The stored object has the metadata `fs-uploader` with the authenticated username. (e2e: `e2e/server.test.ts`)
- AC-9: The key file parser ignores comments and empty lines, and reports invalid lines. (unit: `server/test/keys.test.ts`)
- AC-10: The server log does not contain a token that a client sent in the query string. (e2e: `e2e/server.test.ts`)
- AC-11: `issue-key` with an invalid username exits with code 1. (e2e: `e2e/server.test.ts`)
