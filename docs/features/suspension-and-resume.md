# Suspension and resume

Approval and tool-wait suspension fail the run with `AgentSuspended`. The host resumes with the exact suspension value it received.

Baton stores the suspension token and authorization snapshot on the unresolved transformed call in Chat. Concurrent sibling results that completed before suspension are checkpointed in provider order. Suspension batches contain only replayable call identity: id, name, parameters, and the provider-executed flag. Provider response metadata is excluded because Prompt history does not retain it and it cannot affect framework tool execution. Resume first derives the sole unresolved checkpoint and compares the token, reason, canonical call batch, active tools, and activated skills, then executes only calls that remain unresolved in the authoritative Chat. Missing, stale, changed, fabricated, or repeated resumes fail with `ResumeMismatch` before skill loading, authorization, execution, model work, or persistence.

Authorization resume replays the same linear authorization pass. A client resolution is consumed only when the current pass still reaches `Approvals.resolve` for the checkpointed call; if current Permissions now allows a call that does not require approval, that current policy decision supersedes the stale out-of-band answer.

This is process-local checkpoint validation. Cross-process locking and durable exactly-once execution belong to a durable host.
