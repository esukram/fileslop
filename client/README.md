# fileslop CLI

`fileslop` uploads a file to a Fileslop server and prints the public URL as JSON.
Humans and AI agents use it. The help text and the error messages tell the reader how to fix each problem.
The CLI has no runtime dependencies. It needs Node.js 24.2 or later.

On success, the CLI prints one line of JSON: `{"id","url","filename","contentType","size"}`.
To install and use the CLI, see [operations](https://github.com/esukram/fileslop/blob/main/docs/operations.md#use-the-client).

Each GitHub release also has the package as `fileslop.tgz`.

## Configuration

| Variable          | Config file key | Purpose                                     |
| ----------------- | --------------- | ------------------------------------------- |
| `FILESLOP_URL`    | `url`           | Upload URL of the server.                   |
| `FILESLOP_TOKEN`  | `token`         | Upload token. It starts with `es.fs1.key.`. |
| `FILESLOP_CONFIG` | –               | Path of the config file.                    |

The config file is `~/.config/fileslop/config.json` (or `$XDG_CONFIG_HOME/fileslop/config.json`).
Environment variables win over the config file. `fileslop config` shows the values in use and their source.

## Commands

- `fileslop upload <file> [--type] [--name] [--username] [--repository] [--provider] [--no-git]`
- `fileslop config`
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

`pnpm build` compiles `src/` to `dist/` with `tsc`. Node does not run TypeScript inside `node_modules`, so the package ships JavaScript.
The requirements are in [PRD-client-cli](https://github.com/esukram/fileslop/blob/main/docs/prds/PRD-client-cli.md).
