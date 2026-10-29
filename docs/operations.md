# Operations

This document gives the procedures to run, use and develop Fileslop.
The READMEs describe what each part is. This document describes how to use it.

## Run the server

1. Create a bucket in AWS S3 or in Hetzner Object Storage.
2. Create an access key that can read and write objects in the bucket.
3. Copy `server/.env.sample` to `.env`. Set the values.
4. Start the container:

   ```sh
   docker run -d --name fileslop -p 8080:8080 --env-file .env \
     -v fileslop-data:/data ghcr.io/esukram/fileslop-server:0.1.0
   ```

5. Put a TLS reverse proxy in front of port 8080. The public URL must be the value of `FILESLOP_PUBLIC_URL`.
6. Make sure that `GET <FILESLOP_PUBLIC_URL>healthz` returns `{"status":"ok"}`.

Without a container, run `node src/main.ts serve` in the `server` directory. Node.js 24.2 or later is necessary.

Run one server instance for each data directory. The data directory holds the token hashes and the lookup table.

If the host has the Dynatrace OneAgent, disable Real User Monitoring (RUM) for the process group of the server.
Use the setting `builtin:rum.processgroup` with `enable: false`. If RUM is on, the agent adds a script to the HTML files that the server delivers.

## Manage tokens

To issue a token, do this command. The command prints the token one time:

```sh
docker run --rm -v fileslop-data:/data ghcr.io/esukram/fileslop-server:0.1.0 issue-key alice
```

Without a container, do `node src/main.ts issue-key alice` in the `server` directory.

To revoke a token, remove its line from `keys.txt` in the data directory. The server reads the changed file at the next upload. A restart is not necessary.

## Use the client

1. Get the upload URL and a token from the server administrator.
2. Set the configuration:

   ```sh
   export FILESLOP_URL=https://files.example.org/fileslop/
   export FILESLOP_TOKEN=es.fs1.key.…
   ```

   Alternatively, write `{"url": "…", "token": "…"}` to `~/.config/fileslop/config.json`.

3. Upload a file:

   ```sh
   npx -y fileslop upload plan.html
   ```

If npm cannot find the `fileslop` package, use the tarball of the latest GitHub release:

```sh
npx -y --allow-remote=all https://github.com/esukram/fileslop/releases/latest/download/fileslop.tgz upload plan.html
```

## Install the agent skill

```sh
npx skills add esukram/fileslop
```

## Develop

1. Install Node.js 24.2 or later and pnpm.
2. Do `pnpm install`.
3. Do `pnpm check`. This command runs lint, format check, type check, unit tests and end-to-end tests.

The end-to-end tests use a mock object store. They do not need network access.

On a host with the Dynatrace OneAgent, the end-to-end tests can fail with status 502.
If RUM is on, the agent removes the signed `If-None-Match` header from requests to the mock object store.
Disable RUM for the process group `fileslop-workspace` (setting `builtin:rum.processgroup`, `enable: false`).
Or run the tests on a host or in a container without the agent.

## Release

1. Set the same version in `client/package.json` and `server/package.json`.
2. Add a section for the version to `CHANGELOG.md`.
3. Push a tag `v<version>`, for example `v0.1.0`.

The release workflow creates the GitHub release, attaches the client tarball and pushes the container image.
To publish the client to npm, configure npm trusted publishing for this repository. Then set the repository variable `NPM_PUBLISH` to `true`.
