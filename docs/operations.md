# Operations

This document gives the procedures to run, use and develop Fileslop.
The READMEs describe what each part is. This document describes how to use it.

## Run the server

1. Create a bucket in AWS S3 or in Hetzner Object Storage.
2. Create an access key that can read and write objects in the bucket.
3. Copy `server/.env.sample` to `fileslop.env`. Set the values.
4. Make sure that the container user `node` (UID 1000) can read the file.
5. Start the container. Mount the config file at `/config/fileslop/.env`. Without the file, the server does not start:

   ```sh
   docker run -d --name fileslop -p 8080:8080 \
     -v ./fileslop.env:/config/fileslop/.env:ro \
     -v fileslop-data:/data ghcr.io/esukram/fileslop-server:0.2.0
   ```

6. Put a TLS reverse proxy in front of port 8080. The public URL must be the value of `FILESLOP_PUBLIC_URL`.
7. Make sure that `GET <FILESLOP_PUBLIC_URL>healthz` returns `{"status":"ok"}`.

Without a container, use `npx`. Node.js 24.2 or later is necessary.

1. Write the config file to `~/.config/fileslop/.env`.
2. Do `chmod 600 ~/.config/fileslop/.env`. The file contains the secret key of the object store.
3. Do `npx fileslop serve`.

The server keeps its data in `~/.config/fileslop`, also when you start it from a different folder.
`--config <file>` gives a different config file. `fileslop help serve` shows all options.
For development, do `node src/main.ts serve --config <file>` in the `server` directory.

Run one server instance for each data directory. The data directory holds the token hashes and the lookup table.

If the host has the Dynatrace OneAgent, disable Real User Monitoring (RUM) for the process group of the server.
Use the setting `builtin:rum.processgroup` with `enable: false`. If RUM is on, the agent adds a script to the HTML files that the server delivers.

## Manage tokens

To issue a token, do this command. The command prints the token one time:

```sh
docker run --rm -v ./fileslop.env:/config/fileslop/.env:ro \
  -v fileslop-data:/data ghcr.io/esukram/fileslop-server:0.2.0 issue-key alice
```

Without a container, do `npx fileslop issue-key alice`.

To revoke a token, remove its line from `keys.txt` in the data directory. The server reads the changed file at the next upload. A restart is not necessary.

## Use the client

1. Get the upload URL and a token from the server administrator.
2. Install the client one time: `npm install -g fileslop`. `pnpm add -g fileslop` and `bun add -g fileslop` also work.
3. Write the configuration to `~/.config/fileslop/.env`:

   ```sh
   FILESLOP_URL=https://files.example.org/fileslop/
   FILESLOP_TOKEN=es.fs1.key.…
   ```

4. Do `chmod 600 ~/.config/fileslop/.env`. The file contains the token.
5. Do `fileslop config`. The command shows the URL, the masked token and their sources.
6. Upload a file:

   ```sh
   fileslop upload plan.html
   ```

Environment variables with the same names have priority over the file. `~/.config/fileslop/config.json` (`{"url": "…", "token": "…"}`) also works.

To get a new version, do `npm update -g fileslop`. A global installation does not update itself.

Without a global installation, for example in CI or in a sandbox, use `npx -y fileslop` in place of `fileslop`.
Give the values as environment variables, for example as CI secrets:

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
3. Push an annotated tag `v<version>`, for example `git tag -a v0.2.0 -m v0.2.0 && git push origin v0.2.0`.

The release workflow creates the GitHub release, attaches the client tarball and pushes the container image.
When the repository variable `NPM_PUBLISH` is `true`, it also publishes the client to npm with provenance.

## Set up npm publishing

The release workflow publishes through npm trusted publishing (OIDC). It needs no npm token.
`npm trust` needs a package that exists. This repository published the first version by hand.
The maintainer did these steps one time for 0.1.0:

1. Enable two-factor authentication for your npm account. Then do `npm login`.
   With a passkey and no authenticator app, run the npm commands in an interactive terminal. npm shows a URL to approve in the browser.
2. Publish the attested tarball of the first GitHub release:

   ```sh
   gh release download v0.1.0 -p fileslop.tgz -D /tmp/fileslop
   gh attestation verify /tmp/fileslop/fileslop.tgz --repo esukram/fileslop
   npm publish /tmp/fileslop/fileslop.tgz --access public --provenance=false
   ```

   `--provenance=false` is necessary because npm makes provenance only in CI. Later versions have provenance.

3. Trust the release workflow:

   ```sh
   npm trust github fileslop --repo esukram/fileslop --file release.yml --env npm --allow-publish
   ```

4. Create the GitHub environment `npm`. Only tags `v*` can deploy to it, so a workflow on a branch cannot publish. Then enable the npm job:

   ```sh
   gh api -X PUT repos/esukram/fileslop/environments/npm \
     -F 'deployment_branch_policy[protected_branches]=false' \
     -F 'deployment_branch_policy[custom_branch_policies]=true'
   gh api -X POST repos/esukram/fileslop/environments/npm/deployment-branch-policies -f name='v*' -f type=tag
   gh variable set NPM_PUBLISH --body true
   ```

5. On npmjs.com, open the package settings. Set publishing access to "Require two-factor authentication and disallow tokens". Then do `npm logout`.
6. Release the next version. Make sure that the package page on npmjs.com shows provenance.
