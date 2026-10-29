# Fileslop product requirements

Fileslop stores uploaded files in an object store and returns a stable public URL.
Humans and AI agents use it to share artifacts such as HTML plans, screenshots, logs, and reports.
The main use case is GitHub pull requests, because GitHub cannot attach arbitrary files.
For architecture decisions, see [Architecture](../architecture/architecture.md).

## Product requirements documents

- [PRD-upload](PRD-upload.md): Authenticated upload of one file, with header validation and JSON responses.
- [PRD-retrieval](PRD-retrieval.md): Public delivery of files with safe headers, and the health check endpoint.
- [PRD-authentication](PRD-authentication.md): Bearer tokens, the hashed key file, the `issue-key` command, rotation, and leak detection.
- [PRD-storage-backends](PRD-storage-backends.md): AWS S3 and Hetzner Object Storage, object metadata, key layout, and no overwrite.
- [PRD-client-cli](PRD-client-cli.md): The `fileslop` CLI with configuration, commands, agent-friendly errors, and exit codes.
- [PRD-agent-skill](PRD-agent-skill.md): The agent skill, its installation, and the pull request artifact procedure.
- [PRD-deployment](PRD-deployment.md): Server configuration, `.env.sample`, the container image, and persistent data.
