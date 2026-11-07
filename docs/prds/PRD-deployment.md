# PRD: Deployment

## Problem

Operators must run the Fileslop server with little effort.
The server needs object store credentials, a public URL, and persistent local data.
Errors in the configuration must be visible at start, not at the first upload.

## Users

- Operators who run Fileslop on a host or in a container platform.

## Goals

- Run the server from a container image or with `npx fileslop serve`.
- Configure the server with one config file. Environment variables can override its values.
- Keep the index and the key file across restarts and upgrades.

## Non-goals

- Several server instances behind a load balancer.
- TLS termination in the server. Use a reverse proxy.
- A Helm chart or other platform-specific packages.

## Functional requirements

- FR-1: The server MUST read its configuration from `FILESLOP_` environment variables (see [ADR-012](../architecture/ADR-012.md)).
- FR-2: The server MUST read the config file `$XDG_CONFIG_HOME/fileslop/.env` with `process.loadEnvFile()`. The default is `~/.config/fileslop/.env`. `--config <file>` MUST change the path (see [ADR-020](../architecture/ADR-020.md)).
- FR-3: Real environment variables MUST have priority over the config file.
- FR-4: The repository MUST contain `server/.env.sample` with all variables and a comment for each variable.
- FR-5: The server MUST stop at start with exit code 2 if a variable is missing or invalid. The message MUST list all problems.
- FR-6: The server MUST listen on `FILESLOP_HOST` (default `0.0.0.0`) and `FILESLOP_PORT` (default `8080`).
- FR-7: The path of `FILESLOP_PUBLIC_URL` MUST be the route prefix for all endpoints.
- FR-8: The server MUST create `FILESLOP_DATA_DIR` with mode `0700` if it does not exist. The default is `~/.config/fileslop`.
- FR-9: Each release MUST publish a container image to `ghcr.io/esukram/fileslop-server`.
- FR-10: The container image MUST declare `FILESLOP_DATA_DIR` as a volume.
- FR-11: The container MUST run as a user that is not root.
- FR-12: The container MUST support `issue-key <username>` as a command.
- FR-13: The server MUST give `/healthz` under the route prefix for health checks.
- FR-14: `serve` and `issue-key` MUST stop with exit code 2 if the config file does not exist. The message MUST name the path and have a `Fix:` line.
- FR-15: The npm package `fileslop` MUST run the server with `npx fileslop serve` and create tokens with `npx fileslop issue-key <username>`.
- FR-16: The container image MUST read the config file from `/config/fileslop/.env`.

## Deployment procedure

```mermaid
flowchart LR
  users([Clients and browsers]) -- HTTPS --> proxy["TLS reverse proxy<br/>FILESLOP_PUBLIC_URL"]
  proxy -- "HTTP, port 8080" --> app
  subgraph host [Container host]
    env["Config file .env"] -. "mount at /config/fileslop/.env" .-> app["fileslop-server container<br/>user is not root"]
    app --- vol[("Volume fileslop-data<br/>at /data")]
    op([Operator]) -. "docker run … issue-key" .-> vol
  end
  app -- HTTPS --> bucket[("S3 bucket<br/>AWS or Hetzner")]
```

1. Create a bucket in AWS S3 or Hetzner Object Storage.
2. Create an access key with read and write access to the bucket only.
3. Copy `server/.env.sample` to `fileslop.env` on the host.
4. Set the values in `fileslop.env`. Do not set `FILESLOP_DATA_DIR`. The image sets `FILESLOP_DATA_DIR=/data`, and a value in the file overrides it.
5. Make sure that the container user `node` (UID 1000) can read the file.
6. Start the container. Mount the file at `/config/fileslop/.env`. Without the file, the server does not start:

   ```sh
   docker run -v ./fileslop.env:/config/fileslop/.env:ro -v fileslop-data:/data -p 8080:8080 \
     ghcr.io/esukram/fileslop-server:0.2.0
   ```

7. Create a token for each user. Use the same file and the same volume:

   ```sh
   docker run --rm -v ./fileslop.env:/config/fileslop/.env:ro -v fileslop-data:/data \
     ghcr.io/esukram/fileslop-server:0.2.0 issue-key <username>
   ```

8. Give the token to the user. The command shows the token one time only.
9. Configure the reverse proxy to send requests for the route prefix to the server.

Without a container, write the config file to `~/.config/fileslop/.env`. Then do `npx fileslop issue-key <username>` and `npx fileslop serve`.
The data is in `~/.config/fileslop`, also when you start the server from a different folder.

## Non-functional requirements

- NFR-1: Run exactly one server instance for each data folder.
- NFR-2: The data folder MUST be on persistent storage. A loss of `index.jsonl` makes old URLs unavailable.
- NFR-3: The container image MUST contain no runtime dependencies other than Node.js.

## Acceptance criteria

- AC-1: The server starts from environment variables and accepts uploads. (e2e: `e2e/server.test.ts`)
- AC-2: The server stops with exit code 2 if variables are missing or invalid. The message lists all problems, also a missing `FILESLOP_PUBLIC_URL` and a `FILESLOP_S3_ENDPOINT` that is not http(s). (e2e: `e2e/server.test.ts`)
- AC-3: The server starts from the default config file with the `aws_s3` backend. A real environment variable (`FILESLOP_BASE_DIR`) overrides the value in the file. The data is in the config folder. (e2e: `e2e/server.test.ts`)
- AC-4: With `FILESLOP_PUBLIC_URL=https://files.example.org/fileslop/`, `GET /fileslop/healthz` returns 200. (e2e: `e2e/server.test.ts`)
- AC-5: After a restart with the same data folder, old URLs still work. (e2e: `e2e/server.test.ts`)
- AC-6: CI builds the container image and runs its `help` command. Its `serve` command without a config file stops with exit code 2. (CI step in `.github/workflows/ci.yml`)
- AC-7: The release workflow pushes a container image for tag `v0.1.0`. (not automated: manual check of the first release)
- AC-8: Without a config file, `serve` and `issue-key` stop with exit code 2. The message names the default path or the `--config` path. (e2e: `e2e/server.test.ts`)
- AC-9: `fileslop issue-key` and `fileslop serve` run the server from the client entry point. An upload to this server succeeds. (e2e: `e2e/client.test.ts`)
- AC-10: CI packs the npm package. `npx fileslop serve` from the package stops with exit code 2 without a config file. (CI step in `.github/workflows/ci.yml`)
- AC-11: `issue-key` creates a new data folder with mode `0700`. The server creates `index.jsonl` with mode `0600`. (e2e: `e2e/server.test.ts`)
