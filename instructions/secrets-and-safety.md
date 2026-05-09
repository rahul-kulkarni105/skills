---
name: secrets-and-safety
description: Never commit secrets. Confirm destructive Git or filesystem operations.
last_reviewed: 2026-05-09
---

# Secrets & safety

## Never commit

- API keys, tokens, passwords, private keys, signing certs.
- `.env`, `.env.*`, `credentials.json`, `*.pem`, `*.key`, `id_rsa*`.
- Cloud provider credential files (`~/.aws/credentials`, `gcloud` json).
- Customer data, PII, internal hostnames not already public.

If a secret is committed by accident: **rotate it first**, then scrub
history (`git filter-repo` or BFG). A revoked secret is safer than a
clean history.

## Staging discipline

- Stage files by name. Avoid `git add -A` and `git add .` — they sweep
  in `.env` files and stray binaries.
- Read the diff before committing. If you don't recognise a hunk, stop.

## Destructive operations need explicit confirmation

Treat as destructive — confirm before running:

- `rm -rf`, `git clean -fd`, `git reset --hard`, `git checkout -- .`,
  `git restore .`, `git branch -D`.
- `git push --force` / `--force-with-lease` to any shared branch.
- `git commit --amend` on a published commit.
- Dropping/truncating database tables, killing processes, terminating
  cloud resources.
- Anything that overwrites uncommitted work.

Never `--force` push to `main` / `master` / `release/*` without an
explicit, in-conversation green light from the user.

## Hooks

Don't bypass hooks (`--no-verify`, `--no-gpg-sign`) unless the user
explicitly asks. If a hook fails, fix the underlying issue.
