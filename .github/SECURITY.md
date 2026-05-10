# Security policy

This repository is **documentation only**. It contains no executable
application code, no dependencies, no build artifacts, and ships no
runtime. The single shell script under [bootstrap/](../bootstrap/) is a
local file-copy helper that runs only when a user explicitly invokes
it.

That said, the content here shapes how AI coding assistants behave in
consumers' projects. Bad guidance can cause real harm — leaked
secrets, destructive commands, insecure defaults. Treat content
issues with the same seriousness as code vulnerabilities.

## What counts as a security issue here

- Instructions that could cause an AI assistant to leak secrets,
  exfiltrate data, or bypass a project's security controls.
- Prompts or skills that encourage destructive shell operations
  (`rm -rf`, force-pushes, credential dumping) without guardrails.
- Examples that hard-code credentials, tokens, or private endpoints.
- Bootstrap script behaviour that writes outside the target directory,
  follows symlinks unsafely, or executes downloaded content.
- Supply-chain risks introduced via the sync strategies documented in
  [docs/sync-strategies.md](../docs/sync-strategies.md).

Spelling, link rot, or stylistic issues are **not** security issues —
open a normal PR or issue for those.

## Reporting

Email **rahulkulkarniatx@gmail.com** with:

- A clear description of the issue and which file(s) it lives in.
- The concrete failure mode — what an AI would do wrong if it
  followed the guidance verbatim.
- Suggested wording or a proposed fix, if you have one.

Please **do not** open a public GitHub issue for an unfixed security
concern. Use email first; once a fix is shipped, a public issue or PR
referencing the change is welcome.

## Response expectations

This is a personal project maintained opportunistically (see
[docs/working-with-ai.md](../docs/working-with-ai.md)). Expect:

- Acknowledgement within 7 days.
- Triage and a fix plan within 30 days for valid reports.
- Public credit in the commit message unless you ask otherwise.

No bug bounty. No formal SLA.

## Scope

In scope: every file in this repo, including the bootstrap script and
documentation under [docs/](../docs/), [instructions/](../instructions/),
[skills/](../skills/), [prompts/](../prompts/), and [stacks/](../stacks/).

Out of scope: vulnerabilities in third-party tools this repo
documents (Claude Code, Copilot, Codex, Gemini CLI, Cursor, Windsurf,
Ollama). Report those upstream.
