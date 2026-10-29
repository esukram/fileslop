# Security policy

## Report a vulnerability

Do not open a public issue for a vulnerability.
Use [private vulnerability reporting](https://github.com/esukram/fileslop/security/advisories/new) on GitHub.
You get an answer in 7 days.

## Supported versions

Only the latest release gets security fixes.

## Leaked tokens

Every Fileslop token starts with `es.fs1.key.`. If you find a leaked token:

1. Remove its line from `keys.txt` on the server. The server reloads the file without a restart.
2. Issue a new token with `issue-key <username>`.
