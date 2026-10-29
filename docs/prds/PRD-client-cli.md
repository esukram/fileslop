# PRD: Client CLI

## Problem

Raw HTTP requests need many headers. Humans and agents make errors with them.
Agents need predictable output and clear next steps after an error.

## Users

- Developers who upload files from a shell.
- AI coding agents that upload artifacts.
- CI jobs that publish reports.

## Goals

- Upload a file with one short command.
- Run without a global installation.
- Give machine-readable output and actionable errors.

## Non-goals

- Download of files. Use a browser or `curl`.
- Upload of folders or several files in one command.
- Interactive prompts.

## Functional requirements

- FR-1: The client MUST be the npm package `fileslop`. It MUST run with `npx -y fileslop`.
- FR-2: The client MUST have no runtime dependencies.
- FR-3: The command `upload <file>` MUST upload the file with the headers of [PRD-upload](PRD-upload.md).
- FR-4: `upload` MUST map common file extensions to a media type.
- FR-5: `upload` MUST stop with exit code 2 for an unknown extension without `--type`.
- FR-6: `--type` MUST override the media type.
- FR-7: `--name` MUST override the filename. The default is the base name of `<file>`.
- FR-8: `--username`, `--repository`, and `--provider` MUST set the optional metadata headers.
- FR-9: If `--repository` or `--provider` is absent, the client MUST read `git remote get-url origin`. It MUST derive the missing values from the URL.
- FR-10: If git or the remote is not available, the client MUST continue without these headers.
- FR-11: The client MUST read `FILESLOP_URL` and `FILESLOP_TOKEN` from the environment.
- FR-12: The client MUST read `url` and `token` from `$XDG_CONFIG_HOME/fileslop/config.json`. The default is `~/.config/fileslop/config.json`. `FILESLOP_CONFIG` MUST override the path.
- FR-13: Environment variables MUST have priority over the config file.
- FR-14: The command `config` MUST show the effective URL, the masked token, and the source of each value.
- FR-15: The client MUST NOT print a full token.
- FR-16: `help [command]` MUST show usage for all commands or for one command.
- FR-17: `--version` MUST print the client version.
- FR-18: On success, the client MUST print the server JSON response on stdout.
- FR-19: On error, the client MUST print a message on stderr. The message MUST have a line that starts with `Fix:`.
- FR-20: Exit codes MUST be: 0 for success, 1 for upload, server, or network failure, 2 for usage or configuration errors.

## Non-functional requirements

- NFR-1: The client MUST run on Node.js 24 and later.
- NFR-2: The published package MUST contain compiled JavaScript only.
- NFR-3: All help and error text MUST use Simplified Technical English.

## Acceptance criteria

- AC-1: `fileslop upload plan.html` prints JSON with `url` and exits with 0. (e2e)
- AC-2: `fileslop upload data.xyz` without `--type` exits with 2 and prints a `Fix:` line. (e2e)
- AC-3: `fileslop upload data.xyz --type text/plain` exits with 0. (e2e)
- AC-4: `fileslop upload` without a token exits with 2 and prints a `Fix:` line. (e2e)
- AC-5: An upload with a wrong token exits with 1 and prints the server error. (e2e)
- AC-6: `fileslop config` shows the source `env` or `file` and a masked token. (e2e)
- AC-7: An environment variable has priority over the config file. (e2e)
- AC-8: The MIME map returns `text/html` for `.html` and `image/png` for `.png`. (unit)
