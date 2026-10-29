# Agent skill

`fileslop/SKILL.md` tells AI agents how to upload artifacts with the `fileslop` CLI.
GitHub cannot attach arbitrary files to pull requests. The skill tells the agent to upload the file and post its URL.

The [`skills`](https://github.com/vercel-labs/skills) CLI installs the skill. See [operations](../docs/operations.md#install-the-agent-skill).

The skill is short on purpose. Agents load it into their context, so each line has a cost.
The requirements are in [PRD-agent-skill](../docs/prds/PRD-agent-skill.md).
