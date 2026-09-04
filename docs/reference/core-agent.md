---
title: "Agent and run functions"
description: "Typed Agent.make input/output, run, stream, start, truthful requirements, RunError, and Resume."
---

The Agent namespace defines a typed agent value, process-local run and stream projections, a durable Runtime start, and every option and service a run consumes.

**Install**

```bash
bun add effect@4.0.0-rc.112 generalist
```

## Agent.make

An `Agent<Tools, R, ..., InputSchema, OutputSchema>` is a plain value `{ name, input, output, instructions?, toolkit, policy, model?, memory?, metadata? }`, not a service. `Agent.make(options)` fills defaults:

| Option         | Type                                | Default                |
| -------------- | ----------------------------------- | ---------------------- |
| `name`         | `string`                            | required               |
| `input`        | `Schema`                            | `Schema.String`        |
| `output`       | `Schema`                            | `Schema.String`        |
| `instructions` | `string`                            | none                   |
| `toolkit`      | `Ai.Toolkit.Toolkit<Tools>`         | `Ai.Toolkit.empty`     |
| `policy`       | `Policy.Policy`                     | `Policy.defaultPolicy` |
| `model`        | `ModelRegistry.ModelSelection`      | none                   |
| `memory`       | `Memory.Key`                        | none                   |
| `metadata`     | `Readonly<Record<string, unknown>>` | none                   |

`model` is a default model selection resolved through `ModelRegistry` at run time. `memory` is the default memory key unless `RunOptions.memory.key` overrides it. `metadata` is host data carried with the agent value for registries and durable hosts.

`R` contains every required service selected by the definition. A direct-model agent carries `LanguageModel`; setting `model` replaces it with `ModelRegistry.ModelRegistry`; setting `memory` adds `Memory`. Static tools add their handler and codec requirements. The visible `model` field is the only agent-level model default. For a registry-free run, omit it and provide a concrete `LanguageModel` layer at the `Agent.run` or `Agent.stream` run boundary, where the layer requirements and scoped lifetime remain visible.

## Run functions

| Function            | Signature                                                                                                                | Notes                                                                                                 |
| ------------------- | ------------------------------------------------------------------------------------------------------------------------ | ----------------------------------------------------------------------------------------------------- |
| `Agent.allocateRun` | `(agent: Agent<..., I, O>, options: RunOptions) => Effect<RunHandle<Event<O.Type>, ...>, Steering.PolicyInvalid, Scope>` | Allocates one Run ID, event stream, and producer-only steer/followUp capability before lazy execution |
| `Agent.stream`      | `(agent: Agent<..., I, O>, input: I.Type, options?) => Stream<Event<O.Type>, RunError, ...>`                             | Streams the loop and ends with Completed carrying the decoded output                                  |
| `Agent.run`         | `(agent: Agent<..., I, O>, input: I.Type, options?) => Effect<O.Type, RunError, ...>`                                    | Folds the same stream to its schema-decoded output; supports data-last use                            |
| `Agent.start`       | `(agent, input, options) => Effect<RunHandle, StartError, Runtime>`                                                      | Starts an Agent registered by unique name with Runtime and returns typed await/events                 |

## RunOptions

| Field                      | Type                            | Notes                                                                                            |
| -------------------------- | ------------------------------- | ------------------------------------------------------------------------------------------------ |
| `history`                  | `Ai.Prompt.RawInput` (optional) | Prior transcript, used verbatim as the initial chat history; no system message is prepended      |
| `system`                   | `string` (optional)             | Overrides the derived system message when `history` is not set                                   |
| `resume`                   | `Resume` (optional)             | Re-entry after `AgentSuspended`: verify and execute the checkpointed call                        |
| `sessionId`                | `string` (optional)             | Sole host-assigned Session identity; it never selects the process-local Run inbox                |
| `steering`                 | `Steering.Options` (optional)   | Finite per-Run lane capacities, drain modes, overload behavior, and aggregate pending-byte bound |
| `toolOutputMaxBytes`       | `number` (optional)             | Spill successful tool outputs whose encoded size exceeds this byte limit                         |
| `compaction.contextWindow` | `number` (optional)             | Context-window hint for optional compaction                                                      |
| `memory.key`               | `Memory.Key` (optional)         | Consult the Memory service for this run, overriding `agent.memory` when present                  |

## Requirements

A no-tool run needs a model, either as a direct `Ai.LanguageModel.LanguageModel` layer or as `agent.model` resolved through `ModelRegistry`. Static toolkits conservatively retain their Effect AI handler and codec requirements. A `ToolExecutor` override can handle calls at runtime but does not discharge those configured requirements. Configured or run-specific memory adds `Memory`. Ambient enhancements such as approvals, compaction, instructions, middleware, resilience, permissions, sessions, skills, tokenization, tool execution overrides, and output spill remain optional. Steering is owned directly by each RunHandle, not discovered as an ambient service.

| Service                           | When it is needed                                                    |
| --------------------------------- | -------------------------------------------------------------------- |
| `Ai.LanguageModel.LanguageModel`  | When the agent has no `model` default                                |
| `ModelRegistry.ModelRegistry`     | When the agent has a `model` default                                 |
| `Ai.Tool.HandlersFor<Tools>`      | When local toolkit handlers execute in-process                       |
| `Memory.Memory`                   | When agent or run configuration selects a memory key                 |
| `Input["EncodingServices"]`       | When the Agent input schema needs services                           |
| `Output["DecodingServices"]`      | When the Agent output schema needs services                          |
| `ToolExecutor.ToolExecutor`       | Optional override for remote, client, MCP, sandbox, or durable tools |
| `Approvals.Approvals`             | Ambient optional approval behavior                                   |
| `ModelMiddleware.ModelMiddleware` | Ambient optional model input/output middleware                       |

## RunError

The error channel of every run function is the union `AgentError | InvalidOutput | AgentSuspended | ResumeMismatch | Error | PolicyStopped | TurnLimitExceeded | MiddlewareViolation | DuplicateToolCallId | ProgressOverflow | ToolNameCollision | AiError | LanguageModelNotRegistered | FrameworkFailure`. Field shapes are tabulated in [AgentEvent and errors](/reference/core-events).

## Resume

`Resume` is `{ suspension: AgentSuspended }`. The host passes the exact `AgentSuspended` error as `RunOptions.resume`; the run verifies it against the authoritative checkpoint before executing the unresolved call.

## Typed result

| Type                      | Shape                                                            |
| ------------------------- | ---------------------------------------------------------------- |
| `Agent.run(agent, input)` | `Effect<Agent.Output<typeof agent>, ...>`                        |
| `Completed<A>`            | `{ output: A; text: string; turns: number; transcript: Prompt }` |

For the loop behind these functions, see [The agent loop](/learn/agent-loop). For structured runs, see [How to get schema-validated output](/guides/structured-output); for deterministic runs in CI, see [How to test agents and run evals in CI](/guides/testing-evals).

## Agent Program hosting

| Export                | Purpose                                                                                                       | Minimal use                                                                                                                               |
| --------------------- | ------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------- |
| `ProgramManifest`     | Schema and canonical pin for sandboxed JavaScript source, codecs, allowed capabilities, and bounded resources | `ProgramManifest.make({ name, source, sandbox, input, output, capabilities, budget })` returns the validated manifest and its content pin |
| `ProgramCapabilities` | Host-owned encoded operations available only while sandboxed Program source is running                        | `yield* ProgramCapabilities.ProgramCapabilities` resolves the service before calling `callTool`, `callStep`, `runAgent`, or `log`         |
