# PRD: Deployment

## Problem

Operators must run the Fileslop server with little effort.
The server needs object store credentials, a public URL, and persistent local data.
Errors in the configuration must be visible at start, not at the first upload.

## Users

- Operators who run Fileslop on a host or in a container platform.

## Goals

- Run the server from a container image or from source.
- Configure the server with environment variables only.
- Keep the index and the key file across restarts and upgrades.

## Non-goals

- Several server instances behind a load balancer.
- TLS termination in the server. Use a reverse proxy.
- A Helm chart or other platform-specific packages.

## Functional requirements

- FR-1: The server MUST read its configuration from `FILESLOP_` environment variables (see [ADR-012](../architecture/ADR-012.md)).
- FR-2: The server MUST read an optional `.env` file with `process.loadEnvFile()`.
- FR-3: Real environment variables MUST have priority over the `.env` file.
- FR-4: The repository MUST contain `server/.env.sample` with all variables and a comment for each variable.
- FR-5: The server MUST stop at start with a clear message if a required variable is missing or invalid.
- FR-6: The server MUST listen on `FILESLOP_HOST` (default `0.0.0.0`) and `FILESLOP_PORT` (default `8080`).
- FR-7: The path of `FILESLOP_PUBLIC_URL` MUST be the route prefix for all endpoints.
- FR-8: The server MUST create `FILESLOP_DATA_DIR` if it does not exist.
- FR-9: Each release MUST publish a container image to `ghcr.io/esukram/fileslop-server`.
- FR-10: The container image MUST declare `FILESLOP_DATA_DIR` as a volume.
- FR-11: The container MUST run as a user that is not root.
- FR-12: The container MUST support `issue-key <username>` as a command.
- FR-13: The server MUST give `/healthz` under the route prefix for health checks.

## Deployment procedure

1. Create a bucket in AWS S3 or Hetzner Object Storage.
2. Create an access key with read and write access to the bucket only.
3. Copy `server/.env.sample` to `.env`.
4. Set the values in `.env`.
5. Mount a persistent volume on the data folder.
6. Start the container.
7. Run `issue-key <username>` in the container to create a token.
8. Configure the reverse proxy to send requests for the route prefix to the server.

## Non-functional requirements

- NFR-1: Run exactly one server instance for each data folder.
- NFR-2: The data folder MUST be on persistent storage. A loss of `index.jsonl` makes old URLs unavailable.
- NFR-3: The container image MUST contain no runtime dependencies other than Node.js.

## Acceptance criteria

- AC-1: The server starts with only the required variables set. (e2e)
- AC-2: The server stops with exit code other than 0 and a clear message if `FILESLOP_PUBLIC_URL` is missing. (e2e)
- AC-3: A `.env` value is used, and a real environment variable overrides it. (unit)
- AC-4: With `FILESLOP_PUBLIC_URL=http://host/files/`, `GET /files/healthz` returns 200. (e2e)
- AC-5: After a restart with the same data folder, old URLs still work. (e2e)
- AC-6: The release workflow pushes a container image for tag `v0.1.0`. (manual check of the first release)
