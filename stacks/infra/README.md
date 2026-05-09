---
name: stacks-infra
description: Infrastructure stack — AWS, Terraform, Cloudflare, Vercel, PCF (legacy).
last_reviewed: 2026-05-09
---

# Infrastructure

Cloud, edge, and IaC. Span is wide; per-tech files are added as
patterns harden.

## Files that will live here

- `aws.md` — service selection, IAM minimums, region defaults.
- `terraform.md` — module structure, state backends, drift
  discipline.
- `cloudflare.md` — Workers vs Pages, KV vs R2 vs D1, cache rules.
- `vercel.md` — project config, edge vs node functions, env vars.
- `pcf.md` — **legacy**. Pivotal Cloud Foundry / VMware Tanzu
  guidance. Add only if active work is happening there.

## Cross-cutting rules

- **IaC or it didn't happen.** Manual cloud changes are a debugging
  trap — reproducible only via "I clicked some things". Push every
  durable resource into Terraform.
- **State is a secret.** Never commit `terraform.tfstate`. Use a
  remote backend with locking (S3 + DynamoDB, or equivalent).
- **Least-privilege IAM.** Start from `Deny *`, add only what's used.
- **Region pinning**: every project has a primary region. Fan-out is
  a deliberate decision, not a default.
- **Edge vs node**: edge runtimes (Cloudflare Workers, Vercel Edge)
  don't have full Node APIs. Don't import `node:fs` and assume it
  works.
- **Cost lives in code review.** A new resource should mention
  expected cost in the PR body, even roughly.

## PCF / Tanzu (legacy)

PCF is flagged legacy. New workloads should not target it. Existing
workloads:

- Document migration target if known.
- Don't deepen the dependency — no new buildpacks, no new
  PCF-only patterns.
- Migrate test infra first (CI runners, smoke tests) before app
  workloads.

## Tools to reach for first

- AWS docs: <https://docs.aws.amazon.com>
- Terraform: <https://developer.hashicorp.com/terraform>
- Cloudflare: <https://developers.cloudflare.com>
- Vercel: <https://vercel.com/docs>

## Anti-patterns

- `count = var.enabled ? 1 : 0` everywhere — Terraform's `for_each`
  is usually clearer.
- Cross-region replication "just in case". Pay for it once you need
  it.
- Edge functions that quietly fall back to a Node-only branch.
- IAM policies with `Resource: "*"` outside read-only contexts.
