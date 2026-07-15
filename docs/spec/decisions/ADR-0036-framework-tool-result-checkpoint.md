# ADR-0036 — Framework Tool-result Checkpoint

## Status

Accepted.

## Context

Baton committed each authoritative model response to Chat when the model stream closed, but retained completed framework tool results only in loop-local pending state. Session synchronization, Memory retention, policy evaluation, persistence, and `TurnCompleted` consequently observed a transcript that ended at the tool calls. The next model turn inserted the pending results as its prompt, which made them available to the model too late for turn-N observers and coupled transcript ownership to turn N+1.

Suspension had a separate trailing checkpoint that appended completed sibling results. Keeping normal completion and suspension on different checkpoint boundaries made exactly-once behavior difficult to preserve across resume.

## Decision

After framework tool execution completes for a turn, Baton appends the ordered pending tool-result parts to Chat once before reading the turn transcript. The append and persisted-chat save run under the same per-Chat semaphore that protects authoritative model commits. Session synchronization, Memory retention, policy evaluation, persistence, and `TurnCompleted` all consume the resulting checkpoint.

Pending state remains available to policy evaluation as decision input. On `Continue`, Baton clears that state and starts the next model turn with only steering or instruction-override input; the model reads tool results from Chat history rather than receiving a second tool-result prompt. A policy stop leaves the checkpoint intact.

Suspension keeps its trailing checkpoint for completed siblings because normal after-turn processing is not reached when a later call suspends. Resume execution uses the normal checkpoint boundary for the resumed result and follows the same no-reappend rule.

No public service or payload type is added. The checkpoint uses Effect AI `Prompt.fromResponseParts`, `Ref`, and Baton's scoped semaphore; persistence failures retain the existing typed `AgentError` mapping, semaphore ownership is released on every exit, and interruption does not manufacture a successful tool result.

## Consequences

- `TurnCompleted`, Session, Memory, and TurnPolicy observe completed framework results in the turn that produced them.
- The next model call receives each result exactly once through Chat history.
- Multiple results preserve sequential framework call order.
- Suspension and resume share the same completed-result ownership rule without re-executing or duplicating completed calls.
- Persisted chats save the result checkpoint before exposing turn completion.

## Rejected alternatives

- Keep results pending until the next model prompt: rejected because turn-N observers and persistence see stale history.
- Append results both at turn completion and in the next prompt: rejected because Chat would contain duplicate tool-result parts.
- Add a public checkpoint service: rejected because Chat and loop state already own the required internal ordering and no consumer-provided behavior is needed.

## Related docs

- `docs/spec/01-baton-agent-framework.md`
- `docs/spec/02-session-event-log.md`
- `docs/spec/09-memory.md`
- `docs/spec/decisions/ADR-0002-tool-context-output-spill.md`
- `docs/spec/decisions/ADR-0025-authoritative-transformed-response.md`
