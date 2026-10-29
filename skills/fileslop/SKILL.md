---
name: fileslop
description: Upload a file (HTML report, plan, screenshot, log, build output) with the fileslop CLI and get a public URL. Use it to share an artifact, and to attach files to GitHub pull requests or issues, because GitHub cannot attach arbitrary files to pull requests.
---

# Fileslop

Upload a file. Get a public URL. Anyone with the URL can read the file. You cannot delete or change the file.
Do not upload secrets, credentials or private data.

## Upload a file

```sh
npx -y fileslop upload <file>
```

The command prints one line of JSON. Use the `url` value:

```json
{
  "id": "…",
  "url": "https://files.example.org/fileslop/<id>/plan.html",
  "filename": "plan.html",
  "contentType": "text/html; charset=utf-8",
  "size": 1234
}
```

- Unknown file extension: add `--type <media-type>`, for example `--type text/plain`.
- Other name in the URL: add `--name <name>`.
- All options: `npx -y fileslop help upload`.

## Attach a file to a GitHub pull request

```sh
url=$(npx -y fileslop upload report.html | jq -er .url) &&
  gh pr comment <number> --body "Report: $url"
```

For an image, use `![screenshot]($url)` in the comment body.

## When the command fails

Exit code 0 is success. On other exit codes, the CLI writes the problem and a `Fix:` line to stderr. Do the fix.

- Exit code 2: usage or configuration problem. Run `npx -y fileslop config`.
  The CLI needs `FILESLOP_URL` and `FILESLOP_TOKEN`. If they are missing, ask the user. Do not invent values.
- Exit code 1: the upload failed. Read the HTTP status and the `Fix:` line.
- npm cannot find `fileslop`: use `npx -y --allow-remote=all https://github.com/esukram/fileslop/releases/latest/download/fileslop.tgz` in place of `npx -y fileslop`.

## Token

- Do not put the token in command lines, files in the repository, or comments.
- Use the environment variable `FILESLOP_TOKEN` or the config file `~/.config/fileslop/config.json`.
- Never print or log the token.
