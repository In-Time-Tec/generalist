# Suspension and resume

Approval and tool-wait suspension fail the run with `AgentSuspended`. The host resumes with the exact suspension value it received.

Baton stores the suspension token and authorization snapshot on the unresolved transformed call in Chat. Resume first derives the sole unresolved checkpoint and compares token, reason, call identity, parameters, authorization stage, active tools, and activated skills. Missing, stale, changed, fabricated, or repeated resumes fail with `ResumeMismatch` before skill loading, authorization, execution, model work, or persistence.

This is process-local checkpoint validation. Cross-process locking and durable exactly-once execution belong to a durable host.
