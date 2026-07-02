# 05 — Steering and Interrupts

Baton's `Steering` module is the optional in-process seam for injecting prompts into an active agent run. It provides two independent FIFO queues with different drain points: steering input is seen before the next model turn after tool results, while follow-up input is seen only when the agent would otherwise complete.

## Scope

Baton owns:

- the `QueueMode`, queued `Message`, and `Steering` service boundary;
- an in-memory two-queue layer and a `testLayer`;
- Agent drain semantics for steering and follow-up;
- the statement that normal Effect interruption is the run-scoped abort mechanism.

Baton does not own cross-process delivery, durable queue storage, remote-control envelopes, priority modes beyond `all` and `one-at-a-time`, or a cancel-current-tool-but-continue primitive.

## Queue model

- `QueueMode` is `"all" | "one-at-a-time"`.
- `Message` stores an `Ai.Prompt.RawInput` without converting it to a second wire format.
- `takeSteering` and `takeFollowUp` are non-blocking and return `[]` when empty.
- `"all"` drains all currently buffered messages FIFO.
- `"one-at-a-time"` drains at most one message FIFO.
- The default steering mode is `"all"`.
- The default follow-up mode is `"one-at-a-time"`.

`Steering.layer` is non-durable and service-scoped. Hosts that need per-run isolation provide one layer per active run/session.

## Agent drain semantics

`Agent.stream` resolves `Steering` optionally so its static requirement set does not grow. If absent, behavior is unchanged.

- When pending tool results exist and `TurnPolicy` returns `Continue`, Baton drains steering before the next model turn. Drained steering prompts are prepended before `Ai.Prompt.fromResponseParts(pendingToolResults)` using `Ai.Prompt.concat`.
- If pending tool results exist and `TurnPolicy` returns `Stop`, Baton fails with `TurnLimitExceeded` as before; steering does not bypass the policy cap.
- When no pending tool results exist, Baton drains follow-up before emitting `Completed` or before running a terminal structured-output turn. Non-empty follow-up starts another normal streamed turn; structured output waits until the tool/follow-up loop is truly empty.
- Middleware still sees the composed prompt because `modelTurn` applies `ModelMiddleware.transformPrompt` after steering/follow-up composition.

## Interrupt semantics

`Agent.stream` is already interruptible. Interrupting the fiber interrupts the live model stream and scoped tool execution. Baton does not clear `Steering` queues during interruption; messages that have not yet been drained remain in the layer. Messages already drained into a prompt are considered consumed in this milestone.

## Related docs

- `docs/spec/01-baton-agent-framework.md`
- `docs/spec/decisions/ADR-0008-steering-and-run-interrupts.md`
