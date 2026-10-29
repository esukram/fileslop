# Fileslop

Fileslop stores a file and gives you a public link to it.

[![CI](https://github.com/esukram/fileslop/actions/workflows/ci.yml/badge.svg)](https://github.com/esukram/fileslop/actions/workflows/ci.yml)

## Why

AI agents and developers make many artifacts: HTML plans, reports, screenshots, logs.
They must share these artifacts with people. Often the right place is a GitHub pull request.
GitHub cannot attach arbitrary files to a pull request. A link can go anywhere.

Fileslop closes this gap. You upload a file with one command. You get a URL. You paste the URL where people read it.

## What

- **A small HTTP server.** It keeps the files in your own object store: AWS S3 or Hetzner Object Storage.
  Uploads need a token. Reading a file needs only its URL.
- **A command line client.** `npx -y fileslop upload plan.html` prints the URL as JSON.
  Its help and error messages tell humans and agents how to fix problems.
- **An agent skill.** `npx skills add esukram/fileslop` teaches coding agents to upload artifacts and to attach them to pull requests.

```sh
$ npx -y fileslop upload plan.html
{"id":"550e8400-e29b-41d4-a716-446655440000","url":"https://files.example.org/fileslop/550e8400-e29b-41d4-a716-446655440000/plan.html","filename":"plan.html","contentType":"text/html; charset=utf-8","size":1234}
```

## Principles

- **Your storage, your data.** Files stay in a bucket that you control.
- **Nothing is replaced.** Each upload gets a new ID. Fileslop never overwrites a file.
- **No guessing.** The client declares the media type of each file. The server does not infer it.
- **Leaked tokens are easy to find.** Every token starts with `es.fs1.key.`, so secret scanners can find it.
- **Few dependencies.** The server and the client use only the Node.js standard library at run time.

## More information

- [Documentation index](docs/index.md): start here to find the right document
- [Server](server/README.md), [client](client/README.md) and [skill](skills/README.md)
- [Operations](docs/operations.md): run the server, issue tokens, install the client and the skill
- [Product requirements](docs/prds/prds.md) and [architecture decisions](docs/architecture/architecture.md)
- [Changelog](CHANGELOG.md)

## License

[MIT](LICENSE)
