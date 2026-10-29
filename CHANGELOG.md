# Changelog

All notable changes to this repository are in this file. The newest entry is at the top.
The format follows [Keep a Changelog](https://keepachangelog.com/en/1.1.0/). The versions follow [Semantic Versioning](https://semver.org/).

## [Unreleased]

### Added

- Documentation: a start page `docs/index.md` that links to all documents.

## [0.1.0] - 2026-10-29

The first release. People and AI agents can now share files with one command. GitHub cannot attach arbitrary files to pull requests, so a link is necessary.

### Added

- Server: upload a file with `POST <prefix>/` and get its public URL as JSON. The server stores the file in AWS S3 or in Hetzner Object Storage.
- Server: read a file with `GET <prefix>/<id>/<filename>`. The response has the media type that the client declared.
- Server: uploads need a token. Every token starts with `es.fs1.key.`, so that secret scanners can find leaked tokens. The server stores only token hashes.
- Server: the `issue-key` command creates a token. The running server accepts new tokens and drops removed tokens without a restart.
- Server: each file gets a new UUID. The server never overwrites a file. Files go to `<base dir>/<ISO year>-<ISO week>/<id>/<filename>` in the bucket.
- Server: the server stores the uploader, the file name, and the optional repository owner, repository and provider as object metadata.
- Server: a container image `ghcr.io/esukram/fileslop-server` for `linux/amd64` and `linux/arm64`.
- Client: the `fileslop` CLI uploads a file and prints the URL as JSON. Its help and error messages tell humans and agents how to fix problems.
- Client: the CLI reads the repository metadata from the git remote `origin`.
- Skill: the `fileslop` agent skill teaches agents to upload artifacts and to attach them to pull requests. Install it with `npx skills add esukram/fileslop`.
- Documentation: product requirements, architecture decisions and an operations guide.
- Repository: CI on Node.js 24 and 26, and a release workflow for the GitHub release, the container image and npm.

[Unreleased]: https://github.com/esukram/fileslop/compare/v0.1.0...HEAD
[0.1.0]: https://github.com/esukram/fileslop/releases/tag/v0.1.0
