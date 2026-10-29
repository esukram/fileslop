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
- FR-7: `--name` MUST override the filename. The client MUST send the `--name` value without a change. The server validates it.
  Without `--name`, the client MUST make the filename from the base name of `<file>` with these rules:
  1. Replace each sequence of characters other than `A-Z a-z 0-9 . _ -` with one `-`.
  2. Remove the characters at the start that are not letters or digits.
  3. Keep the first 255 characters.
  4. If the result is empty, use `file`.
- FR-8: `--username`, `--repository`, and `--provider` MUST set the optional metadata headers.
- FR-9: For each of these options that is absent, the client MUST read `git remote get-url origin` and derive the value from the URL.
  The client MUST NOT send a value from git that does not match the server pattern. `--no-git` MUST stop the read of the git remote.
- FR-10: If git or the remote is not available, the client MUST continue without these headers.
- FR-11: The client MUST read `FILESLOP_URL` and `FILESLOP_TOKEN` from the environment.
- FR-12: The client MUST read `url` and `token` from `$XDG_CONFIG_HOME/fileslop/config.json`. The default is `~/.config/fileslop/config.json`. `FILESLOP_CONFIG` MUST override the path.
- FR-13: Environment variables MUST have priority over the config file.
- FR-14: The command `config` MUST print a JSON object on stdout with these fields:

| Field             | Value                                                                                                                         |
| ----------------- | ----------------------------------------------------------------------------------------------------------------------------- |
| `url`             | The effective server URL, or `null`.                                                                                          |
| `urlSource`       | The source of the URL.                                                                                                        |
| `token`           | The masked token: the prefix `es.fs1.key.`, the next 4 characters, and `…`. `null` if not set. A note if the prefix is wrong. |
| `tokenSource`     | The source of the token.                                                                                                      |
| `configFile`      | The path of the config file.                                                                                                  |
| `configFileError` | Only if the client cannot read the config file: the problem.                                                                  |

A source is one of these strings: `environment variable FILESLOP_URL` (or `FILESLOP_TOKEN`), `config file <path>`, or `not set`.
`config` MUST exit with code 2 if a value is missing or invalid, or if the client cannot read the config file.

- FR-15: The client MUST NOT print a full token.
- FR-16: `help [command]` MUST show usage for all commands or for one command.
- FR-17: `--version` MUST print the client version.
- FR-18: On success, the client MUST print the server JSON response on stdout.
- FR-19: On error, the client MUST print a message on stderr. The message MUST have a line that starts with `Fix:`.
- FR-20: Exit codes MUST be: 0 for success, 1 for upload, server, or network failure, 2 for usage or configuration errors.

## Non-functional requirements

- NFR-1: The client MUST run on Node.js 24.2 or later.
- NFR-2: The published package MUST contain compiled JavaScript only.
- NFR-3: All help and error text MUST use Simplified Technical English.

## Acceptance criteria

- AC-1: `fileslop upload plan.html` prints JSON with `url` and exits with 0. (e2e: `e2e/client.test.ts`)
- AC-2: `fileslop upload data.bin` without `--type` exits with 2 and prints a `Fix:` line. (e2e: `e2e/client.test.ts`)
- AC-3: `fileslop upload data.bin --type application/octet-stream` exits with 0. (e2e: `e2e/client.test.ts`)
- AC-4: `fileslop upload` without a token exits with 2 and prints a `Fix:` line. (e2e: `e2e/client.test.ts`)
- AC-5: An upload with a wrong token exits with 1 and prints the server error. (e2e: `e2e/client.test.ts`)
- AC-6: With a config file, `fileslop config` shows `tokenSource` `config file <path>` and a masked token. The output does not contain the full token. (e2e: `e2e/client.test.ts`)
- AC-7: An environment variable has priority over the config file. (unit: `client/test/cli.test.ts`)
- AC-8: The MIME map returns `text/html; charset=utf-8` for `.html` and `image/png` for `.png`. (unit: `client/test/cli.test.ts`)
- AC-9: The default filename rules change `my report (final).pdf` to `my-report-final-.pdf`, `.env` to `env`, and `äöü` to `file`. (unit: `client/test/cli.test.ts`)
- AC-10: The flags `--name` and `--repository` override the defaults. `--no-git` sends no git metadata. (e2e: `e2e/client.test.ts`)
- AC-11: A server that answers 201 without `url` gives exit code 1 and a `Fix:` line. (e2e: `e2e/client.test.ts`)
- AC-12: A server that does not answer gives exit code 1 and a `Fix:` line. (e2e: `e2e/client.test.ts`)
