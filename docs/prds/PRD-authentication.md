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
- FR-10: `issue-key` MUST append the hash line to the key file.
- FR-11: `issue-key` MUST print the token one time on stdout.
- FR-12: The running server MUST reload the key file when its modification time changes.
- FR-13: A missing or incorrect token MUST give status 401, the error code `unauthorized`, and the header `WWW-Authenticate: Bearer`.
- FR-14: The server MUST store the authenticated username as object metadata `fs-uploader`.
- FR-15: CI MUST fail if a committed file contains a string with the prefix `es.fs1.key.` and a token body.

## Rotation procedure

1. Run `issue-key <username>` to create a new token.
2. Give the new token to the user.
3. Make sure that the user changed the configuration.
4. Remove the old line from `keys.txt`.

## Non-functional requirements

- NFR-1: The server MUST NOT write tokens to logs.
- NFR-2: A key change MUST become active without a restart.

## Acceptance criteria

- AC-1: An upload with a valid token returns 201. (e2e)
- AC-2: An upload without a token returns 401 with `WWW-Authenticate: Bearer`. (e2e)
- AC-3: An upload with a wrong token returns 401. (e2e)
- AC-4: `issue-key alice` prints a token with the prefix `es.fs1.key.` and appends one line. (unit)
- AC-5: A token issued while the server runs works without a restart. (e2e)
- AC-6: A removed key line stops the token without a restart. (e2e)
- AC-7: The stored object has the metadata `fs-uploader` with the authenticated username. (e2e: mock S3 metadata)
- AC-8: The key file parser ignores comments and empty lines. (unit)
