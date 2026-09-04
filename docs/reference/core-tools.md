---
title: "Tools and execution"
description: "ToolExecutor, ToolContext, ToolOutput and its store, and AgentTool for agents-as-tools."
---

Four namespaces of generalist cover tool execution: ToolExecutor optionally overrides where calls run, ToolContext is the ambient per-call context, ToolOutput bounds large results, and AgentTool wraps an agent as a tool.

**Install**

```bash
bun add effect@4.0.0-rc.112 generalist
```

## ToolExecutor

Optional override seam for durable hosts, client-executed tools, remote workers, MCP, sandboxing, and suspension. Ordinary in-process tools use the active Effect AI `Toolkit` handlers directly, so no executor layer is required. When you do provide the service, its interface has an optional synchronous selector `replayPolicy?: (request: Request) => "never" | "provider-idempotent"` and the execution function `execute: (request: Request) => Effect<Outcome, FrameworkFailure | RemoteRetryMisconfigured, ToolContext>`. Direct executor consumers observe typed framework and retry errors; the Agent loop preserves framework failures and wraps RemoteRetryMisconfigured in AgentError with the typed cause retained.

| Request field | Type                                        | Notes                              |
| ------------- | ------------------------------------------- | ---------------------------------- |
| `call`        | `Ai.Response.ToolCallPart<string, unknown>` | The model's tool call              |
| `turn`        | `number`                                    | 0-based turn issuing the call      |
| `agentName`   | `string`                                    | Name of the running agent          |
| `sessionId`   | `string`                                    | Host-assigned run/session identity |

| Outcome         | Fields                      | Loop behavior                                                  |
| --------------- | --------------------------- | -------------------------------------------------------------- |
| `Success`       | `result`, `encodedResult`   | Re-fed to the model as a successful tool result                |
| `DomainFailure` | `failure`, `encodedFailure` | Re-fed as a schema-valid failed tool result; the run continues |
| `Suspend`       | `token`                     | The run fails with `AgentSuspended{ reason: "tool-wait" }`     |

| Constructor                                                        | Notes                                                                                                                                             |
| ------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------- |
| `ToolExecutor.layerToolkit(toolkit)`                               | Executes via a handled `Ai.Toolkit.WithHandler`. Declared handler failures produce `DomainFailure`; missing handlers fail with `FrameworkFailure` |
| `ToolExecutor.route({ tools?, matches?, replayPolicy?, execute })` | Manual route for custom dispatch                                                                                                                  |
| `ToolExecutor.routeToolkit(toolkit)`                               | Route that delegates to Effect AI toolkit handlers                                                                                                |
| `ToolExecutor.layerRouter(routes)`                                 | Layer that tries routes in order and fails unmatched names                                                                                        |
| `ToolExecutor.client({ toolkit, execute })`                        | Route toolkit calls to a user/browser/desktop client                                                                                              |
| `ToolExecutor.remote({ toolkit, idempotent?, execute, ... })`      | Route toolkit calls to a remote worker; one attempt unless explicit idempotency and bounded retry are configured                                  |
| `ToolExecutor.mcp({ toolkit, execute })`                           | Route toolkit calls through an MCP adapter                                                                                                        |
| `ToolExecutor.sandbox({ toolkit, execute })`                       | Route toolkit calls to a workspace or sandbox runtime                                                                                             |
| `ToolExecutor.layerTest(implementation)`                           | Layer from an explicit service                                                                                                                    |

The placement route helpers reuse the original Effect AI tool definitions. The executor receives the original `Tool` value, and successful placement results are decoded and encoded against that tool's `success` schema before Generalist re-feeds the result to the model. Placement domain failures are decoded and encoded against the tool's failure schema. Framework failures remain in the Effect error channel and use stage evidence; they are never emitted as tool-schema output.

Migration: replace exhaustive `outcome._tag === "Failure"` matches with `outcome._tag === "DomainFailure"` and consume `failure` plus `encodedFailure`. Handle `FrameworkFailure` with `Effect.catchTag("generalist/core/FrameworkFailure", ...)`. Remote placement codecs replace message-only Failure with DomainFailure carrying the declared schema value.

Remote routes execute once by default. Retrying requires `idempotent: true`, a stable non-empty `operationKey`, a non-negative finite integer `maxRetries`, and a schedule typed to the executor's infrastructure failure. The remote endpoint must deduplicate the key. An idempotent remote route also selects `"provider-idempotent"` durable recovery; other placement routes remain `"never"`.

The Agent calls the replay selector for the concrete request before durable scheduling. Omission means `"never"`. On provider-idempotent recovery, the executor is re-entered with the same `ToolContext.operationKey` and `ToolContext.idempotencyKey`; the executor must reattach to or deduplicate that provider operation. Router policy and execution both use the first matching route. Static toolkit, child, code-mode, handoff, skill activation, client, MCP, sandbox, and non-idempotent remote paths remain non-replayable unless the exact executor route selects otherwise.

## ToolPlacement

`ToolPlacement` contains the request, response, route, and retry contracts used when a custom host places tools on a client, remote worker, MCP server, or sandbox. A placement endpoint returns `ToolPlacement.PlacementResponse = Success | DomainFailure | Suspend`; adapt that value to the loop's schema-checked outcome with `ToolPlacement.placementOutcome.fromResponse(placement, tool, response)`. Prefer the higher-level `ToolExecutor.client`, `remote`, `mcp`, or `sandbox` constructors unless you are implementing a placement adapter.

## ToolContext

Ambient context available to a tool handler for the current call.

| Member                           | Type                                   | Notes                                                                         |
| -------------------------------- | -------------------------------------- | ----------------------------------------------------------------------------- | ----------------------------------------------------------------------------------- |
| `signal`                         | `AbortSignal`                          | Aborted when the run is interrupted                                           |
| `emit`                           | `(progress: Progress) => Effect<void>` | Emits a `ToolProgress` event; `Progress` is `{ toolCallId, message?, data? }` |
| `sessionId`                      | `string`                               | Host-assigned run/session identity                                            |
| `operationKey`, `idempotencyKey` | `string                                | undefined`                                                                    | Stable Agent tool operation identity, preserved across provider-idempotent recovery |

`ToolContext.layerDefault` provides a never-aborting signal, a no-op `emit`, and sessionId `"local"`. `ToolContext.layerTest(implementation)` provides an explicit one.

## ToolOutput and Store

A bounded tool result is `Output = { inline: unknown; outputPaths?: ReadonlyArray<string> }`. `Store` is the optional seam that stores overflow out of context: `put(toolCallId, content) => Effect<Option<string>, Error>`.

| Export                                               | Notes                                                                                                                                                                                                          |
| ---------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `ToolOutput.bound(result, { toolCallId, maxBytes })` | Returns the result unchanged when it fits, no store is present, or the store declines; otherwise replaces it with a truncated preview `{ truncated, bytes, maxBytes, preview }` plus the spilled `outputPaths` |
| `ToolOutput.layerNoop`                               | Store that always declines (`Option.none`)                                                                                                                                                                     |
| `ToolOutput.layerMemory`                             | In-memory store issuing `mem:tool-output-<n>` paths                                                                                                                                                            |
| `ToolOutput.layerTest(implementation)`               | Layer from an explicit store interface                                                                                                                                                                         |
| `Error`                                              | Tagged error with `message`                                                                                                                                                                                    |

The loop applies `bound` to successful outcomes when `RunOptions.toolOutputMaxBytes` is set.

## AgentTool

`AgentTool.asTool(agent, options?)` returns a handled toolkit exposing the agent as one tool. The tool declares `failure: Schema.String` and `failureMode: "return"`, so child failures come back to the parent model as failed tool results. A child `AgentSuspended` is not translated; it escapes as a defect.

| Option        | Default                                    |
| ------------- | ------------------------------------------ |
| `name`        | `agent.name`                               |
| `description` | none                                       |
| `parameters`  | `Schema.Struct({ prompt: Schema.String })` |
| `success`     | `Schema.String`                            |
| `toPrompt`    | `(params) => params.prompt`                |
| `fromResult`  | `(output) => output`                       |

For handler wiring and spill behavior in practice, see [How to define tools and toolkits](/guides/define-tools). For agents-as-tools composition, see [How to coordinate multiple agents](/guides/multi-agent).
