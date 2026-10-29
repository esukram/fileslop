# Agent skill

`fileslop/SKILL.md` tells AI agents how to upload artifacts with the `fileslop` CLI.
It also tells them how to attach files to GitHub pull requests: GitHub cannot attach arbitrary files to pull requests, so the agent uploads the file and posts the URL.

Install the skill with the [`skills`](https://github.com/vercel-labs/skills) CLI:

```sh
npx skills add esukram/fileslop
```

The skill is short on purpose. Agents load it into their context, so each line has a cost.
The requirements are in [PRD-agent-skill](../docs/prds/PRD-agent-skill.md).
