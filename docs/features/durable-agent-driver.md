# Durable agent driver

Core exposes a versioned durable agent driver contract, pinned `AgentRef` identity, and portable `RunBudget` limits that a future `@batonfx/runtime` host and inline `Agent.stream` can share without importing SQL or runtime types into `@batonfx/core`.

## AgentRef

Every durable run pins an immutable `AgentRef { id, version, digest }`. The digest is a canonical hash of an `AgentManifest` projection: agent name, instructions, sorted tool names, portable turn-policy snapshot, model selection, and metadata. `AgentRef.fromAgent(agent, version)` builds the ref; `AgentRef.requireMatch(expected, actual)` fails typed with `AgentRefVersionMismatch` when id, version, or digest differ.

## RunBudget

`RunBudget` tracks allocation, remaining capacity, and tree depth separately from `TurnPolicy`. Limits cover model calls, tool calls, total tokens, child runs, same-run handoffs, max depth, and an ISO deadline. Authoring sets an agent default via `Agent.make({ budget })`; each run may narrow with `RunOptions.budget`. `RunBudget.resolve(agentDefault, runOverride)` merges those layers into one portable value.

`allocate` / `make` construct a root budget; `reserveChild` deducts an explicit child grant and consumes one child-run slot; `narrowChild` reduces a fresh child grant and returns the difference to the parent; `charge` deducts usage; `refundUnused` merges a completed child's remaining grant back into the parent. Grants cannot widen parent remaining on any dimension. Exhaustion fails typed as `RunBudgetExhausted` at schedule boundaries (before execution begins), never mid-provider-stream; widening fails as `RunBudgetGrantWidened`.

Inline `AgentTool` children call `reserveChildBudget` before the nested run and `refundChildBudget` after, passing the reserved grant through `RunOptions.inheritedBudget`. When no limits are configured, runs remain unconstrained until a host or agent author sets explicit defaults.

## Driver contract

`DurableAgentDriver` exposes `initial`, `decide`, and `apply` over schema-backed `DriverCheckpoint`, `DriverOperation`, `DriverDecision`, and `OperationOutcome` values. Checkpoints carry `driverVersion`, pinned `AgentRef`, turn, `RunBudget`, and opaque driver state. Operations carry a deterministic `key`, bounded `kind` (`model`, `tool`, `memory`, `compaction`, `send`, `wait`, `handoff`, `structured-output`), serializable `input`, `inputDigest`, and `replayPolicy` (`pure`, `provider-idempotent`, `never`). Outcomes are `Succeeded`, `Failed`, or `Unknown`. Decisions are `Execute`, `Wait`, `Continue`, or `Complete`.

`DurableDriver.makeTracer(script)` is the canonical in-memory driver used by core tests. It exercises model, tool, wait, budget charging, deterministic operation keys, and unknown-outcome rejection without touching the live agent loop.

## Production integration

`Agent.stream` and `Agent.generate` construct one production `DriverInterpreter` layer per run via `DurableDriver.layerForRun`. The interpreter wraps `makeLoopDriver` and schedules every nondeterministic effect boundary through `decide` → execute → `apply`:

- **Model turns** — `interceptStream` per attempt in `model-turn-driver.ts` with `provider-idempotent` replay policy. Model and tool dimensions charge at schedule time; reported or estimated token usage charges at finish boundaries via `chargeUsage`.
- **Tool execution** — `intercept` in `tool-execution.ts` with `never` replay policy.
- **Same-run handoff** — `intercept` around requested/completed/rejected `handoff` operations in `handoff-runtime.ts`; handoff tools dispatch through the agent loop rather than nested child runs.
- **Compaction** — `intercept` around proactive `maybeCompact` and `applyCompactionResult`; reactive overflow compaction runs inline inside an active model operation without a separate driver record.
- **Memory / session** — `intercept` for recall, remember, and `syncSession` in `compaction-runtime.ts`.
- **Structured output** — `intercept` in `run-loop.ts`.
- **Suspension** — `recordSuspension` on suspend and `bindResume` when `RunOptions.resume` is set.

Control flow still lives in `run-loop.ts`, `model-turn.ts`, and related modules. The driver validates pending operations, charges `RunBudget`, records outcomes, and maintains checkpoint state; it does not yet choose the next loop step (that remains pending-operation-driven rather than fully decide-driven).

Inline runs interpret operations immediately through existing Effect services. Typed failures, interruption, retry barriers, authorization, and Prompt/Response behavior are unchanged; `AgentEvent` ordering is unchanged.

## Runtime seam

`DriverInterpreter` is the single interpreter service agents use at effect boundaries. Optional `DriverJournalService` merges a host journal (`onScheduled`, `onCompleted`) into the run layer so `@batonfx/runtime` can intercept or persist operations without importing runtime concepts into core. `DurableDriver.recorded` exposes the in-run operation log for tests.

`DurableDriver.guardUnknownNeverReplay` rejects `Unknown` outcomes for operations with `never` replay policy before re-execution, failing typed as `DriverUnknownReplay`.

Runtime hosts journal `DriverOperation` records and reconstruct `layerForRun` from the last fenced checkpoint. Core restores instrumentation's next model-call ordinal from that checkpoint's durable loop state, so model call and attempt IDs remain stable across restart and replay without an AgentHost-specific override. The journal also receives checkpoint-only budget mutations so every safe boundary is persisted. Durable persistence, Agent event projection, waits, same-Run resume, and worker orchestration live in `@batonfx/runtime`, not core.

## Not yet intercepted

- **`send`** — addressed messaging is not wired.
- **Isolated `Handoff.register` / `fanOut` children** — still run without the parent interpreter; tree budget reservation for nested runs applies to inline `AgentTool` / `delegateTool` children only.
