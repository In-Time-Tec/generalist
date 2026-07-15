# ADR-0034 — Tool Domain and Framework Failures

## Status

Accepted.

## Context

`ToolExecutor` previously collapsed declared tool failures, schema failures, missing handlers, routing failures, placement failures, and authorization denials into `Failure { message }`. Agent then emitted `{ error: message }` as both the decoded and encoded tool result even when that object was not admitted by the tool's declared failure schema. This erased domain values, made framework faults indistinguishable from tool-domain outcomes, and could produce invalid Effect AI tool-result payloads.

Effect AI tools already own parameter, success, and failure schemas. Its toolkit handler results preserve decoded and encoded values and identify returned declared failures with `isFailure`. Effect causes separately preserve typed failures, defects, and interruption.

## Decision

Replace `ToolExecutor.Outcome.Failure` with `DomainFailure { failure, encodedFailure }`. A domain failure is validated and encoded with the selected tool's declared failure schema. Agent emits it as a failed Effect AI tool-result part using the decoded value as `result` and the schema-encoded value as `encodedResult`.

Add schema-backed `ToolExecutor.FrameworkFailure` on the executor error channel. Its stage is one of `decode-input`, `handler`, `encode-success`, `encode-domain-failure`, `missing-handler`, `route`, `placement`, or `authorization`; it also carries the tool name and diagnostic message. Framework failures terminate the run, are members of `Agent.RunError`, and use transport's existing `Failed` frame. They never become `ToolExecutionCompleted` or impersonate a tool-domain result.

Expected handler-channel values that match the declared failure schema become `DomainFailure`. Expected handler or Effect AI failures that are not declared domain values become `FrameworkFailure`. Defects and interruptions remain defects and interruptions. Suspension remains the `Suspend` outcome and `AgentSuspended` run error.

Placement adapters return `Success { result }`, `DomainFailure { failure }`, or `Suspend { token }`. Baton decodes and encodes successful results, and validates and encodes decoded domain failures. Placement effects may be retried before an expected infrastructure error becomes a `placement` framework failure; returned domain failures are not retried.

Effect AI's return-mode `ToolResultEncodingError` does not retain whether the failed value came from the success or failure branch. Baton attributes the stage when exactly one declared schema admits the decoded value; overlapping or non-matching schemas use `handler` because branch ownership cannot be proven.

For a completed return-mode failure, Baton re-encodes the decoded failure with the declared failure schema rather than trusting Effect AI's union encoding. Strict transport codecs likewise discriminate success and failure branches with `isFailure`, so overlapping decoded schema types cannot select the success encoding for a domain failure.

Placement routes accept only toolkits whose parameter-decoding and result-encoding schemas require no services. Placement execution sits behind the requirement-closed `ToolExecutor` service, so rejecting serviceful placement schemas at compile time keeps schema requirements visible instead of allowing missing services to defect at runtime.

Permission and approval denials become `authorization` framework failures because Baton cannot invent values in a consumer tool's domain failure schema. The Baton-owned `activate_skill` tool declares its own structured failure schema for expected activation failures.

## Consequences

- Domain failures retain exact decoded values for policy and telemetry and exact schema-encoded values for model and wire payloads.
- Framework failures remain schema-backed errors and are distinct from tool output in events and transport.
- Existing exhaustive matches must replace `Failure` with `DomainFailure` and handle `FrameworkFailure` through the Effect error channel.
- Authorization denials now terminate a run rather than being re-fed as ad hoc tool output.
- A `failureMode: "error"` handler failure is still recoverable as a declared domain failure when it matches the declared failure schema.
- Handler defects and interruption are never normalized into expected failures.

## Migration

Before:

```ts
if (outcome._tag === "Failure") console.log(outcome.message)
```

After:

```ts
if (outcome._tag === "DomainFailure") use(outcome.failure, outcome.encodedFailure)

executor
  .execute(request)
  .pipe(Effect.catchTag("@batonfx/core/FrameworkFailure", (failure) => handleFrameworkFailure(failure)))
```

Remote placement codecs replace `Failure { message }` with `DomainFailure { failure }`. No compatibility constructor is provided because a message-only adapter cannot manufacture schema-valid failure data for an arbitrary tool.

## Related docs

- `docs/spec/01-baton-agent-framework.md`
- `docs/spec/04-permissions-policy.md`
- `docs/spec/07-skills.md`
- `docs/spec/11-transport.md`
