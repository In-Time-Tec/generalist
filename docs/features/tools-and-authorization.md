# Tools and authorization

Effect AI `Tool` and `Toolkit` values remain the schema and handler authority. Generalist adds one registry, authorization pass, execution-placement seam, durable cancellation, progress context, and bounded output.

## Usage

```ts
import { Effect, Layer, Schema } from "effect"
import { Agent, Approvals, Permissions, Tool, Toolkit } from "generalist"
const search = Tool.make("search_docs", {
  description: "Search documentation",
  parameters: Schema.Struct({ query: Schema.String }),
  success: Schema.Array(Schema.String),
  failure: Schema.String,
  failureMode: "return",
  needsApproval: true,
})
const toolkit = Toolkit.make(search)
const handlers = toolkit.toLayer({
  search_docs: ({ query }) => Effect.succeed([`Result for ${query}`]),
})
const agent = Agent.make({ name: "docs", toolkit })
const policy = Layer.mergeAll(
  Permissions.layerFailClosed([{ pattern: "search_docs:*", level: "ask" }]),
  Permissions.layerRuleStoreMemory(),
  Approvals.layerAutoApprove,
)
const runnable = agent.run({ prompt: "Find authorization docs" }).pipe(Effect.provide(Layer.merge(handlers, policy)))
```

For rules that survive process restarts, replace the memory store with a file or SQL store:

```ts
const projectRules = Permissions.layerRuleStoreFile({ path: ".generalist/permissions.json" }).pipe(
  Layer.provideMerge(platformLayer), // FileSystem and Path
)

const sessionRules = Permissions.layerRuleStoreSql({ scope: sessionId }).pipe(Layer.provideMerge(runtimeSqlClientLayer))
```

The file store accepts a schema-validated JSON or YAML array of `{ pattern, level, reason? }`, watches the file for external changes, and writes remembered rules through a same-directory temporary file plus rename. Missing files start empty; malformed content fails as `InvalidRuleFile { path, issues }` rather than silently dropping rules. The SQL store uses `generalist_permission_rules`, replaces rules by `(scope, pattern)`, and shares the Runtime `SqlClient`; omitting `scope` uses the `"sessionId"` scope key.

## What runs

```text
agent.run({ prompt: "Find authorization docs" })
├── assemble registry: "search_docs" -> Tool + handler
├── LanguageModel generates ToolCall
│   └── { id: "call-1", name: "search_docs",
│        params: { query: "authorization" } }
├── ToolAuthorizer.authorize()
│   ├── active-registry membership
│   ├── Permissions.evaluate() -> Ask
│   └── Approvals.resolve(Pending) -> Approved
├── toolkit handler -> ["Result for authorization"]
├── ToolOutput.bound(maxBytes: 51200) -> Success
└── LanguageModel receives schema-valid tool result
```

## Execution routes and recovery

```text
ToolExecutor.layerRouter([routeA, routeB])
└── firstMatchingRoute(request)
    ├── replayPolicy(request) -> "never" | "provider-idempotent"
    ├── execute(request) -> Success | DomainFailure | Suspend
    └── cancel(CancellationRequest) -> Cancelled | AlreadyTerminal
Placement helpers
├── client()   user, browser, or desktop
├── remote()   worker or service
├── mcp()      MCP adapter
└── sandbox()  workspace or sandbox runtime
```

Only an idempotent `remote` placement helper opts in automatically to bounded infrastructure retries and `provider-idempotent` replay. It requires a stable non-empty operation key, non-negative finite integer `maxRetries`, a schedule, and endpoint deduplication or reattachment; domain failures are never retried.

## Failure paths

```text
tool call
├── declared handler failure -> DomainFailure -> model
├── decode/handler/route/placement/authorization fault
│   └── FrameworkFailure (typed Effect error channel)
├── permission Deny / approval Denied -> PermissionDenied
└── approval Pending -> Suspend(token) -> durable wait
```

Successful output is JSON-sized at the common post-codec boundary before durable interception. Over 50 KiB by default becomes `{ inline: { truncated, bytes, maxBytes, digest, preview }, outputPaths }`; an optional `ToolOutput.Store.put` preserves the full value at immutable paths.

## Invariants

- The immutable per-turn registry owns advertisement, lookup, authorization, and dispatch; duplicate names fail before model or tool work.
- `Agent.streamToolCalls` admits one non-empty authored-order batch from an external model loop and never invokes a `LanguageModel`.
- Fresh admission requires the exact active static-tool snapshot, Session and logical-operation identities, turn, immutable authorization messages, and optional budget, invocation, and executable identity.
- Recovery accepts only the persisted driver checkpoint, matching executable identity and authorization-message digest, plus an exact suspension resolution when resolving a wait.
- The checkpoint is authoritative for calls, indexes, keys, active tools, turn, and remaining budget; hosts cannot inject a scheduler, authorizer, executor, toolkit, call index, or provider payload at recovery.
- Authorization checks active membership, evaluates base permissions with remembered `RuleStore` rules as a last-match overlay, then calls `Approvals.resolve(Pending)` once for `Ask` or `needsApproval`.
- `Approved` executes and remembers only an explicit `remember` rule; `Denied` fails; `Pending` suspends once.
- `ApprovalRequested` contains canonical `{ approvalId, operation, capability, input }`; its ID is the permission token or `approval:<tool-call-id>`, never an adapter replacement.
- `Permissions.layerFailClosed` asks on unmatched calls; `layerRuleset` also defaults to `ask` unless `fallback` says otherwise; `layerAllowAll` is the explicit trusted-job, development, or test posture.
- A tooled agent with no authorization policy in context fails fast with `AgentError` before the first model call; there is no implicit default. Provide `Permissions` and `Approvals` (for example `Permissions.layerAllowAll` with `Approvals.layerAutoApprove`), a `ToolAuthorizer` layer, or set `Agent.authorization`. Tool-less agents need no policy.
- Approval suspension coordinates execution, not business authorization; hosts own durable approval records and domain policy outside Generalist suspension and Runtime state.
- `ToolContext` carries Session/run identities, scoped `AbortSignal`, progress emission, attempt metadata, and stable `operationKey`/`idempotencyKey`; provider-idempotent recovery reuses the keys.
- `ToolExecutor.replayPolicy` is synchronous and defaults to `never`; routing policy, execution, and cancellation use the same first matching route.
- Local toolkit, client, MCP, sandbox, child, code-mode, skill-activation, handoff, and non-idempotent remote paths remain `never` unless their exact executor route selects otherwise.
- Direct cancellation requires `cancel` and may be narrowed by `cancellable`; router cancellation requires `cancel` on the first execution route.
- `CancellationRequest` preserves execution plus operation key, attempt, Session, Run, root Run, tool-call, and tool-name identities; cancellation callbacks must be idempotent for that identity.
- Cancellation acknowledges only `Cancelled` or `AlreadyTerminal` with terminal success/domain failure; failure or interruption is redelivered after reclaim.
- Generic Effect interruption, host shutdown, and lease loss never invoke semantic cancellation; an abort signal is cooperative and does not prove an external side effect stopped.
- The bounded outcome is identical in durable operation, replay, completion event, Session result, terminal fallback, and provider prompt; committed replay neither executes nor spills again.
- Without a `ToolOutput.Store`, only the bounded preview enters model context and durable state; spans record limits, truncation, spill status, digest, and path count, never raw output.
- `activate_skill` uses the same bound; live execution, replay, and resume rebuild its run-local registry from the original success, and may reload a bounded body from `SkillCatalog`.
- Tool and authorization producers belong to the Agent stream scope; interruption requests producer interruption and waits for children, finalizers, and actual exit without an abandoning teardown timeout.
- `ToolContext.emit` returns whether progress was accepted; cancellation releases a blocked offer with `false`, and later offers remain `false`.
- Calls form one authored-order batch; absent `parallelSafe` calls are exclusive barriers, adjacent safe calls use positive `maxConcurrency`, and one call is the singular form.

## Related

- Source: `packages/generalist/src/core/tools/`, `packages/generalist/src/core/policy/permissions.ts`, `packages/generalist/src/core/policy/approvals.ts`
- Site: `/docs/guides/define-tools`, `/docs/guides/permissions`, `/docs/guides/approvals`, `/docs/guides/durable-composite-tools`, `/docs/reference/core-tools`
- Decisions/tradeoffs: [Typed tool boundaries](../decisions/typed-tool-boundaries.md), [Strict tool registry](../tradeoffs/strict-tool-registry.md)
