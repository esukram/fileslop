# PRD: Agent skill

## Problem

AI agents create artifacts such as HTML plans, screenshots, and test reports.
GitHub cannot attach arbitrary files to a pull request.
Agents do not know Fileslop. They need short and exact instructions.

## Users

- AI coding agents in harnesses that load `SKILL.md` files.
- Developers who install the skill for their agents.

## Goals

- Agents upload artifacts without human help.
- Agents post artifact links on pull requests.
- Agents recover from common errors.

## Non-goals

- An MCP server.
- Support for agent formats other than `SKILL.md`.
- Automatic upload of all files in a pull request.

## Functional requirements

- FR-1: The skill MUST be in `skills/fileslop/SKILL.md`.
- FR-2: The skill MUST have YAML frontmatter with the fields `name` and `description`.
- FR-3: The `description` MUST tell when to use the skill: share a file, publish an artifact, or attach a file to a pull request.
- FR-4: The skill MUST be installable with `npx skills add esukram/fileslop`.
- FR-5: The skill MUST show the upload command `npx -y fileslop upload <file>`.
- FR-6: The skill MUST show the configuration check `npx -y fileslop config`.
- FR-7: The skill MUST tell the agent to use `--type` for unknown extensions.
- FR-8: The skill MUST tell the agent to follow the `Fix:` line after an error.
- FR-9: The skill MUST explain the exit codes: 0 is success, 1 is an upload failure, 2 is a usage or configuration error.
- FR-10: The skill MUST show the pull request procedure:
  1. Upload the artifact.
  2. Read `url` from the JSON output.
  3. Post the URL with `gh pr comment <number> --body "<text with URL>"`.
- FR-11: The skill MUST tell the agent not to put the token in a command line, a file in the repository, or a comment. The skill MUST tell the agent to use the environment variable `FILESLOP_TOKEN` or the config file.
- FR-12: The skill MUST state that uploaded files are public and permanent.
- FR-13: The skill MUST tell the agent not to upload secrets or personal data.

## Non-functional requirements

- NFR-1: The skill MUST have fewer than 80 lines.
- NFR-2: The skill MUST use Simplified Technical English.
- NFR-3: The commands in the skill MUST match the client CLI of the same release.

## Acceptance criteria

- AC-1: `skills/fileslop/SKILL.md` has YAML frontmatter with `name: fileslop` and a `description` of 51 to 1024 characters that contains "pull request". The file has fewer than 80 lines. (e2e: `e2e/skill.test.ts`)
- AC-2: `npx skills add esukram/fileslop` installs the skill. (not automated: manual check before release)
- AC-3: Each command in the skill runs without a usage error against the current client. (not automated: manual check before release)
- AC-4: An agent with the skill uploads an HTML file and posts the URL on a test pull request. (not automated: manual check before release)
