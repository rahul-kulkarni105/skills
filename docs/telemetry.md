---
name: telemetry
description: Privacy contract, event schema, dashboard checklist, and controls for ai-skills anonymous telemetry.
last_reviewed: 2026-05-10
---

# Telemetry

`ai-skills` supports anonymous, opt-in command telemetry. Telemetry is for
understanding command health, install shape, and failure categories. It is
not a log stream and must not carry user content.

## Privacy Contract

- No secrets, tokens, env var values, absolute paths, file contents, command
  argv values, registry URLs, Git remotes, user names, host names, or package
  manager cache paths.
- No raw error messages or stack traces.
- No telemetry in CI, test runs, or non-TTY runs unless explicitly enabled.
- No telemetry for commands that fail before config is read.
- Telemetry delivery never changes command success or failure.
- One persistent anonymous installation id is stored outside project files.

## Controls

```sh
ai-skills telemetry status
ai-skills telemetry enable
ai-skills telemetry disable
```

Environment controls:

- `AI_SKILLS_TELEMETRY=0` disables telemetry.
- `AI_SKILLS_TELEMETRY=1` enables telemetry unless `DO_NOT_TRACK=1` is set.
- `DO_NOT_TRACK=1` disables telemetry.
- `AI_SKILLS_TELEMETRY_DEBUG=1` prints the local telemetry decision without
  sending events.

Interactive `init` asks once when no decision exists. `--yes`, CI, and
non-TTY runs default to disabled. Events are sent only when a PostHog public
project key is configured through `AI_SKILLS_POSTHOG_KEY`.

## Events

- `command_started`
- `command_completed`
- `command_failed`
- `command_exception_sampled`
- `doctor_check_completed`
- `install_plan_built`
- `install_completed`
- `verify_completed`
- `list_completed`
- `add_completed`
- `remove_completed`
- `eject_completed`
- `telemetry_consent_changed`

## Allowed Properties

- `cli_version`
- `node_major`
- `platform`
- `arch`
- `command`
- `targets`
- `target_count`
- `component_count`
- `id_count`
- `written_count`
- `adopted_count`
- `skipped_count`
- `removed_count`
- `drift_count`
- `duration_ms`
- `exit_code`
- `error_kind`
- `source_kind`
- `user_mode`
- `yes_mode`
- `network_fetch_used`
- `cosign_available`
- `json`
- `force`
- `cascade`
- `has_manifest`
- `telemetry_reason`

Allowed values should be primitive strings, numbers, booleans, or arrays of
those primitives. Unknown property keys are dropped before capture.

## Blocked Properties

Never add these as telemetry properties:

- `installRoot`
- `manifestPath`
- Component source paths or destination paths.
- Raw component ids if they become user-defined.
- Command arguments.
- Exception messages or stack traces.
- Registry owner/repo values.
- User, host, or project names.

If a future event needs registry information, represent only the built-in
registry as `registry_kind: "default"` after adding that key to the allowlist
and updating this document.

## Error Kinds

Failures are grouped by `error_kind` without sending raw messages or stacks:

- `manifest_validation_error`
- `lockfile_error`
- `network_fetch_error`
- `integrity_error`
- `settings_merge_error`
- `filesystem_permission_error`
- `unknown_error`

`command_failed` is emitted for command failures. `command_exception_sampled`
is a sampled companion event with the same sanitized properties so failure
triage can improve without adding stack traces or user content.

## Dashboard Checklist

Track only aggregate trends:

- Command usage by CLI version.
- Failure rate by command, version, and platform.
- Install target mix.
- Verify drift rate.
- Doctor failure categories.
- Telemetry consent rate.

## Release Checklist

Before release, verify this document and the README privacy section match
the event names and property allowlist in `cli/src/telemetry.ts`.
