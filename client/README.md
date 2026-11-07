# fileslop CLI

`fileslop` uploads a file to a Fileslop server and prints the public URL as JSON.
It can also run the server: `npx fileslop serve`.
Humans and AI agents use it. The help text and the error messages tell the reader how to fix each problem.
The CLI has no runtime dependencies. It needs Node.js 24.2 or later.

Install it one time with `npm install -g fileslop`. Without installation, use `npx -y fileslop`.

On success, the CLI prints one line of JSON: `{"id","url","filename","contentType","size"}`.
To install and use the CLI, see [operations](https://github.com/esukram/fileslop/blob/main/docs/operations.md#use-the-client).

Each GitHub release also has the package as `fileslop.tgz`.

## Configuration

| Variable          | `config.json` key | Purpose                                                  |
| ----------------- | ----------------- | -------------------------------------------------------- |
| `FILESLOP_URL`    | `url`             | Upload URL of the server.                                |
| `FILESLOP_TOKEN`  | `token`           | Upload token. It starts with `es.fs1.key.`.              |
| `FILESLOP_CONFIG` | –                 | Path of `config.json`. The `.env` file is in its folder. |

Set the values in the environment, in `~/.config/fileslop/.env`, or in `~/.config/fileslop/config.json`.
The folder is `$XDG_CONFIG_HOME/fileslop` when `XDG_CONFIG_HOME` is set.
The priority is: environment variables, then `.env`, then `config.json`. `fileslop config` shows the values in use and their source.

## Commands

- `fileslop upload <file> [--type] [--name] [--username] [--repository] [--provider] [--no-git]`
- `fileslop config`
- `fileslop serve [--config <file>]` and `fileslop issue-key <username> [--config <file>]`: run the server and create tokens. See [operations](https://github.com/esukram/fileslop/blob/main/docs/operations.md#run-the-server).
- `fileslop help [command]`, `fileslop --version`

When you do not give `--username`, `--repository` or `--provider`, the CLI reads them from `git remote get-url origin`.
The media type comes from the file extension. Unknown extensions need `--type`.

Exit codes: `0` success, `1` upload failed, `2` usage or configuration problem.

## Source

| File            | Purpose                                    |
| --------------- | ------------------------------------------ |
| `src/cli.ts`    | Commands, help text, upload, git metadata. |
| `src/config.ts` | Environment and config file.               |
| `src/mime.ts`   | Media types for common file extensions.    |

`pnpm build` compiles `src/` and `../server/src/` to `dist/client/src/` and `dist/server/src/` with `tsc`.
Node does not run TypeScript inside `node_modules`, so the package ships JavaScript.
The requirements are in [PRD-client-cli](https://github.com/esukram/fileslop/blob/main/docs/prds/PRD-client-cli.md).
