# ai-skills CLI

Selective installer for AI coding-assistant skills, rules, prompts, and
instructions.

```sh
npx @rahulkulkarniskills/ai-skills init --ref <tag-or-commit>
```

For local development against the source checkout:

```sh
npm --prefix cli install
npm --prefix cli run build
node cli/bin/ai-skills.js init --manifest ./manifest.json
```

## Telemetry

Anonymous telemetry is opt-in. Interactive `init` asks once; `--yes`, CI, and
non-TTY runs stay disabled unless `AI_SKILLS_TELEMETRY=1` is set. Telemetry is
sent only when a PostHog project key is configured.

```sh
ai-skills telemetry status
ai-skills telemetry enable
ai-skills telemetry disable
```

`DO_NOT_TRACK=1` and `AI_SKILLS_TELEMETRY=0` are respected. Telemetry never
sends secrets, absolute paths, file contents, registry URLs, Git remotes, raw
command arguments, user names, host names, raw error messages, or stack traces.

Full source and documentation:
https://github.com/rahul-kulkarni105/skills
