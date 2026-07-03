# Suspension as a Typed Error

Baton treats human-in-the-loop waits as typed errors on the stream error channel. `AgentSuspended` means the run did not finish and must be re-entered with `RunOptions.resume` after the host resolves the token.

This is better than callbacks for Effect applications because it composes with ordinary failure handling, scopes, interruption, persistence, and durable hosts. The run's event stream can emit `ApprovalRequested`, then fail with `AgentSuspended`; a host records the token and later resumes with the same call identity.

The two suspension reasons are `approval` and `tool-wait`. Baton does not persist suspensions itself. Relay or another durable runtime owns durable wait state.
