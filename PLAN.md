# Baton And Rika Native Execution Plan

## Purpose

This file is the sole implementation and acceptance plan for making Baton the only agent-execution authority used by Rika, releasing the resulting Baton and Rika versions, and archiving Relay. It replaces the former handoff and design-blog accounts.

This is a clean-break greenfield migration. Do not preserve Relay APIs, execution schemas, event names, identifiers, cursors, database tables, workflow contracts, compatibility packages, fallback runtimes, or deprecated aliases. Delete every replaced path when its replacement lands.

`CONTEXT.md` owns implemented vocabulary and boundaries. Feature docs and executable interfaces own implemented behavior. This file owns target interfaces, unfinished work, dependency order, deletion scope, and release acceptance. Code examples below describe the required end state; they are not compatibility contracts and must be corrected when source evidence proves a better canonical interface.

## Repositories And Release Order

- Work only in the dedicated Baton native-runtime, Rika Baton-native-runtime, and Relay archive worktrees.
- Do not modify, clean, reset, stash, or discard work in original checkouts.
- Do not commit `.pi-subagents/` or `release/` artifacts.
- Do not hardcode developer-machine paths in source, tests, package metadata, or durable documentation.
- Publish through GitHub release workflows; local npm authentication is not assumed.
- Release Baton before pinning and releasing Rika.
- Release Rika before merging the Relay archive commit and archiving the repository.
- Commit, push, pull request, merge, tag, release, and archive operations require explicit user authorization. This plan does not grant it.

Dependency sequencing is strict:

- Rika's installed `@batonfx/runtime@0.14.2` does not contain the native execution interfaces in this plan.
- Use the source-alias Vitest configuration only to verify Rika against the current Baton worktree.
- Do not rewrite Rika around the stale `Runtime.send` and static address-registration API.
- Release Baton `0.15.0` before normal Rika typecheck, package, and release verification.
- Remove source aliases after Rika pins the published Baton packages.

## Final Mental Model

- Baton runs Agents.
- `Agent.stream` and `Agent.generate` are direct process-bound execution and require no Runtime.
- A memory Runtime adds managed IDs, addressing, inspection, events, children, steering, cancellation, and concurrency while remaining process-bound.
- A durable Runtime adds persistent state, claims, fencing, replay, waits, recovery, and restart-safe coordination.
- Direct execution, memory Runtime, and durable Runtime share one Agent, Tool, event, child, fan-out, and program model.
- Do not add a durability mode to individual operations.
- A Run inherits the Runtime and store through which it was admitted for its entire lifetime.
- Runtime capability reporting uses `ephemeral` and `durable`, not `volatile` and `durable`.
- Rika production composes one durable SQLite Runtime.
- Temporary sandboxes may execute inside a durable Run; sandbox lifetime and execution durability are independent.

## Non-Negotiable Decisions

- Baton is one framework with direct, memory-hosted, and durable execution, not separate ephemeral and durable products.
- Runtime Layer composition determines hosted durability. No operation accepts a durability flag, and a Run never migrates between Runtime identities or stores.
- `Runtime.start` is the one exact root-admission operation. `Runtime.send` remains addressed mailbox admission.
- Recovery reconstructs the exact admitted executable from immutable, secret-free registrations. It never reads Rika rows, scans Turns at startup, adopts current configuration, or uses a static fallback.
- Rika exposes only `startTurn`, `cancelTurn`, `steerTurn`, `watchTurn`, and `inspectTurn` across its execution boundary.
- One Rika Turn owns one Baton root Run. Titles, specialists, and delegated work are child Runs; reviews use Baton fan-out.
- Baton Run IDs, child IDs, registration pins, and projection cursors remain opaque to Rika. Rika never derives topology by parsing an identifier.
- Agent-authored Programs replace predefined workflows. There is no workflow compatibility package, command, schema, or execution path.
- Program source receives only typed capabilities. It receives no ambient credentials, environment, filesystem, database, unrestricted network, host objects, Runtime services, or handler values.
- Baton owns the exact model-facing transcript, continuation, compaction, model attempts, and raw usage. Rika owns user-facing transcript projections, pricing, aggregation, and presentation.
- Rika keeps reasoning and fast modes as product route intent implemented through Baton-native Agents and provider registrations.
- Rika's canonical process vocabulary is Server, not Resident. Removed process and Relay vocabulary must not survive as aliases.
- Tests use deterministic Baton model Layers. Production has no in-memory execution fallback.
- Pre-release databases are disposable. Baton and Rika each ship one current baseline migration per supported dialect, with no compatibility migration chain or startup repair of obsolete schemas.
- Runtime `import()` is not an orchestration or dependency-injection mechanism. Use static imports and Effect Layers unless a genuine module-loading boundary requires dynamic import.
- No commit, compatibility shim, fallback, or release claim may hide an unproven durability or restart invariant.

## Baton Scope Closure

The migration is incomplete until Baton owns and proves every execution concern below. These are separate acceptance concerns even when one implementation serves several of them.

- Run identity and lifecycle: admission, stable IDs, status, inspection, and one terminal outcome.
- Recovery supervision: discover, claim, resume, reconcile, or fail recoverable Runs after restart.
- Claims and leases: worker ownership, fencing, expiry, takeover, and stale-commit rejection.
- Cancellation and settlement: root and child interruption, finalization, and terminal reconciliation.
- Run-tree quiescence: terminal means all owned work has reached the selected settlement policy.
- Steering: idempotent admission, durable FIFO inbox, safe-boundary delivery, and restart recovery.
- Child execution: parent links, invocation identity, deterministic admission, observation, and settlement.
- Fan-out: immutable members, bounded concurrency, joins, quorum, remainder policy, cancellation, and recovery.
- Agent Programs: exact model-authored source replacing developer-registered workflow definitions.
- Code Mode: sandboxed capability execution without returning large intermediate work to model context.
- Tool-call protocol: call identity, order, invocation context, deadlines, waits, and outcomes.
- Operation certainty: replayable, recorded, failed, or unknown outcomes with no blind repeat.
- Generic tool envelope: timeout, interruption, progress, output bounds or spill, and checkpoints.
- Approvals and permissions: durable waits, remembered rules, typed resolution, and resume.
- Model-facing transcript: exact messages and tool results entering history once.
- Context continuation: structured initial context and exact continued model state.
- Compaction: pressure, reserves, summaries, checkpoints, recovery, and typed events.
- Raw model usage: stable logical-call and provider-attempt identities with provider-reported usage.
- Canonical Run-tree events: one typed root-tree history and live stream.
- Replay cursors: one opaque consumer cursor, with Baton owning traversal and ordering.
- Agent-loop mechanics: turns, retries, correction, handoff, budgets, suspension, and completion.
- Generic delegation: child spawn, await, and collect beneath coding tools without a Rika protocol.
- Agent registration: opaque versioned identities and exact immutable pins.
- Parent-relative child definitions: child selection resolves from the parent Run's admitted closure.
- Model registration: provider codecs, opaque pins, and restart reconstruction.
- Provider execution: request shaping, candidate fallback, streaming, retry, caching, and usage decode.
- Provider authentication: reusable PKCE, refresh, JWT, and device-flow state machines where supported.
- Skills during execution: model-facing listing, activation, tool integration, and exact pins.
- MCP runtime: transport, discovery, calls, OAuth exchange, and token-store ports.
- Executable extension pins: tools, skills, MCP, services, and authorization identity.
- Run-scoped services: resolve workspace and application capabilities from durable metadata.
- Run-scoped finalization: interrupt and finalize acquired resources before cancellation settles.
- Hosted scheduling: internal queues, worker scheduling, address sequencing, and bounded concurrency.
- Execution parity: direct, memory-hosted, and durable paths share one Agent, Tool, event, child, fan-out, and Program model.

## Ownership

### Baton Owns

- the Agent loop and model turns
- Run identity, status, admission, terminal outcome, and canonical events
- worker claims, leases, fencing, takeover, and recovery
- addressed sessions, internal Run queues, and Run scheduling
- exact model-facing transcript and continuation state
- model attempts, provider execution, retries, usage capture, and malformed response handling
- tool-call IDs, ordering, invocation context, interruption, timeout enforcement, progress, and results
- durable operation identity, replay policy, idempotency, unknown outcomes, and resolution
- waits, approvals, remembered permission rules, responses, and resume
- steering admission, persistence, delivery, and recovery
- children, parent links, invocation identity, cancellation, and settlement
- fan-out membership, concurrency, scheduling, joins, remainder policy, and recovery
- agent-authored program execution, sandbox capability interception, replay, approvals, and budgets
- context-window accounting, compaction execution, summaries, and compaction checkpoints
- immutable model, Agent, tool, skill, MCP, extension, and executable capability pins
- Run-scoped service resolution and Run-scoped resource finalization
- skills integration inside execution
- generic MCP transport, discovery, call protocol, OAuth exchange, and token-store ports
- provider protocol adapters and reusable provider-auth state machines
- canonical root Run-tree history and live event traversal

### Rika Owns

- Threads, Turns, Pending Turns, Workspaces, modes, and product profiles
- the one-active-Turn-per-Thread rule and editable Pending Turn queue
- product prompts, specialist names, review lanes, title policy, and summary policy
- global/workspace configuration precedence and product model aliases
- provider selection, credential references, login UX, and profile-local secret storage
- workspace guidance, mention, file, image, and Thread-reference selection
- coding tool definitions and implementations
- workspace containment and local safety policy
- shell process registry and Rika shell polling semantics
- web-research and media adapters
- extension discovery, trust, configuration, and activation policy
- MCP server provenance, configuration, browser launch, callback host, and token-file adapter
- transcript units, ordering, paging, search, rendering, and disposable projection caches
- usage pricing, Turn/Thread aggregation, analytics, and presentation
- Thread relationships, result delivery, titles, summaries, and recorded-shell Turns
- server process ownership, WebSocket transport, clients, replacement, grace, and terminal behavior

### Split Boundaries

- Rika selects context sources; Baton stores and continues their structured model representation.
- Rika declares tool semantics and product policy; Baton enforces generic execution, approval, interruption, replay, and uncertainty.
- Rika chooses route intent; Baton owns opaque executable model and Agent pins.
- Rika supplies credentials through scoped capabilities; Baton providers execute protocols without reading Rika files or ambient environment.
- Rika discovers extensions and skills; Baton pins and executes the resulting capability set.
- Rika presents approvals; Baton owns the durable wait and applies the resolution.
- Rika decides when a title or review is wanted; Baton executes title children and review fan-outs.
- Baton emits raw usage facts; Rika prices and aggregates them.
- Baton owns Run history; Rika stores only opaque projection progress and product read models.
- Rika implements shell effects; Baton records the enclosing tool operation and handles uncertain interruption.

## Canonical Interfaces

### Direct Agent

```ts
const events = Agent.stream(agent, {
  prompt,
  sessionId,
  logicalOperationId,
  executableRef,
  executableManifest,
})
```

Acceptance:

- no Runtime dependency
- Effect AI Prompt, Response, Tool, and Toolkit remain canonical
- interruption closes model, tool, child, and sandbox scopes
- direct steering and fan-out are process-bound
- no API implies restart recovery

### Hosted Runtime

The hosted service surface remains Baton-shaped rather than application-shaped:

```ts
interface Runtime {
  readonly start: (input: StartInput) => Effect.Effect<StartReceipt, StartError>
  readonly send: (input: SendInput) => Effect.Effect<RunReceipt, SendError>
  readonly spawn: (input: SpawnInput) => Effect.Effect<RunReceipt, SpawnError>
  readonly events: (input: EventsInput) => Stream.Stream<RunEvent, EventsError>
  readonly snapshot: (runId: string) => Effect.Effect<RunSnapshot, InspectError>
  readonly history: (input: HistoryInput) => Effect.Effect<ReadonlyArray<RunEvent>, EventsError>
  readonly treeHistory: (input: RunTree.HistoryInput) => Effect.Effect<RunTree.TreePage, TreeEventsError>
  readonly inspectTree: (rootRunId: string) => Effect.Effect<RunTree.Inspection, InspectError>
  readonly list: (input: ListInput) => Effect.Effect<ReadonlyArray<RunInspection>, RuntimeUnavailable>
  readonly respond: (input: RespondInput) => Effect.Effect<void, RespondError>
  readonly signal: (input: SignalInput) => Effect.Effect<void, SignalError>
  readonly cancel: (input: CancelInput) => Effect.Effect<void, CancelError>
  readonly steer: (input: SteerInput) => Effect.Effect<void, SteerError>
  readonly resolveOperation: (input: ResolveOperationInput) => Effect.Effect<void, ResolveOperationError>
  readonly inspect: (runId: string) => Effect.Effect<RunInspection, InspectError>
  readonly fanOut: (input: FanOutInput) => Effect.Effect<FanOutReceipt, FanOutError>
  readonly inspectFanOut: (fanOutId: string) => Effect.Effect<FanOutInspection, InspectFanOutError>
  readonly awaitFanOut: (fanOutId: string) => Effect.Effect<FanOutInspection, AwaitFanOutError>
}
```

There is no separate hosted `watch` or `resume` method. Use `events` for live Run observation.
Use `history` for finite replay. Use `respond` to resolve a wait.

Runtime Layers share one option shape:

```ts
interface LayerOptions {
  readonly addresses: ReadonlyArray<AddressBinding>
  readonly resolver: ExecutableResolver.Interface
  readonly subscriberQueueCapacity?: number
  readonly scheduler?: {
    readonly concurrency?: number
    readonly pollInterval?: Duration.Input
  }
}

const MemoryLive = Runtime.layerMemory({ addresses, resolver })
const SQLiteLive = Runtime.layerSqlite({ filename, addresses, resolver })
const PostgresLive = Runtime.layerPostgres({ url, addresses, resolver })
const MysqlLive = Runtime.layerMysql({ url, addresses, resolver })
```

Memory and SQLite include `LocalScheduler`. PostgreSQL and MySQL require worker composition.
SQLite rejects multi-worker configuration. PostgreSQL and MySQL support external workers and claims.

Acceptance:

- one Runtime interface on memory and durable stores
- memory reports `ephemeral`
- SQLite reports `durable`
- callers do not pass durability to `start`, `send`, `spawn`, `steer`, or program operations
- exact idempotency replay returns one stable Run ID
- conflicting reuse fails typed
- a Run cannot migrate between Runtime identities

### Exact Root Admission

`Runtime.start` admits an application-selected exact `PinnedExecutable` and its immutable resolver registrations. It is
the root-execution operation for applications such as Rika. `Runtime.send` remains addressed mailbox admission and does
not gain mutable address registration.

Addressed admission must use a static exact binding:

```ts
interface AddressBinding {
  readonly address: Address
  readonly executable: PinnedExecutable
  readonly registrations: ReadonlyArray<ExecutableRegistration>
}
```

The implemented `registrations` field makes each address binding immutable and recoverable.
`Runtime.send` must validate and persist the binding registrations with the admitted Run.
Recovery must not depend on the current Layer configuration.

```ts
interface StartInput {
  readonly runId?: string
  readonly executable: PinnedExecutable
  readonly registrations: ReadonlyArray<ExecutableRegistration>
  readonly sessionId: string
  readonly idempotencyKey: string
  readonly prompt: Prompt.Prompt | Prompt.RawInput
  readonly messageId?: string
  readonly causationId?: string
  readonly correlationId?: string
  readonly metadata?: Metadata
  readonly initialChildren?: ReadonlyArray<InitialChildInput>
  readonly initialFanOuts?: ReadonlyArray<InitialFanOutInput>
}

interface InitialChildInput {
  readonly invocationId: string
  readonly idempotencyKey: string
  readonly selection: string
  readonly prompt: Prompt.Prompt | Prompt.RawInput
  readonly sessionId: string
  readonly messageId?: string
  readonly correlationId?: string
  readonly metadata?: Metadata
}

interface InitialFanOutInput extends Omit<FanOutInput, "parentRunId"> {}

interface StartReceipt extends RunReceipt {
  readonly childRunIds: ReadonlyArray<string>
  readonly fanOuts: ReadonlyArray<FanOutReceipt>
}

type StartError =
  | IdempotencyConflict
  | RunIdConflict
  | ExecutableRegistrationInvalid
  | ExecutableRegistrationConflict
  | ExecutableRegistrationMissing
  | ExecutablePinMissing
  | ExecutableIdentityMismatch
  | ChildSelectionMissing
  | StartInvalid
  | FanOutConflict
  | FanOutInvalid
  | FanOutRemainderUnsupported
  | RuntimeUnavailable

type SendError =
  | AddressNotFound
  | IdempotencyConflict
  | RunIdConflict
  | ExecutableRegistrationInvalid
  | ExecutableRegistrationConflict
  | ExecutableRegistrationMissing
  | ExecutablePinMissing
  | ExecutableIdentityMismatch
  | RuntimeUnavailable
```

The implemented error unions include resolver and initial fan-out admission failures.

Rika must use this admission shape:

```ts
const startRikaTurn = Effect.gen(function* () {
  const configured = yield* configure({
    executionRoute: input.executionRoute,
    workspace: input.workspace,
    agentServices: options.agentServices?.(input.workspace),
    modelServices: options.modelServices,
  })

  return yield* runtime.start({
    executable: configured.executable,
    registrations: configured.registrations,
    sessionId: input.threadId,
    idempotencyKey: input.turnId,
    prompt: prompt(input),
    metadata: {
      threadId: input.threadId,
      turnId: input.turnId,
    },
    initialChildren,
    initialFanOuts,
  })
})
```

Required semantics:

- validate the exact executable and every registration required by its pins
- persist bounded, secret-free registration payloads keyed by opaque pin in the same transaction as Run admission
- treat an equivalent registration as idempotent and changed payload under one pin as a typed conflict
- persist no API key, token, or resolved credential value
- reconstruct execution after restart from the Baton Run and registration catalog without reading application rows or
  current application configuration
- let the application resolver own registration codecs, provider reconstruction, credential dereference, and scoped
  resource finalization
- fail missing or unsupported registrations typed; never substitute current configuration or a static fallback
- keep `send` as addressed admission
- add one immutable registration set to each address binding
- persist that registration set with each addressed Run
- reject address binding changes by the existing typed conflict rules
- admit no more than 64 initial children
- admit no more than 64 initial fan-outs
- reject duplicate initial-child invocation IDs
- reject duplicate initial-child session and idempotency pairs
- limit one registration set to 128 records
- limit each encoded registration to 65,536 bytes
- limit registration pin, codec, and version strings to 255 characters
- invoke the application resolver during admission, not only after a worker claims the Run
- reject an unsupported codec, version, pin, or executable before `start` returns success

The generic registration payload is unknown data. The application registration codec must reject credential values.
Baton enforces bounds, canonical digestibility, and exact pin coverage. Rika persists credential references only.

The executable closure and resolver use these public shapes:

```ts
interface PinnedExecutable {
  readonly ref: ExecutableRef
  readonly manifest: ExecutableManifest
}

const executable = ExecutableManifest.make({
  root: rootAgent.pin,
  entries: [
    { _tag: "Agent", ...rootAgent },
    { _tag: "Agent", ...reviewerAgent },
  ],
})

namespace ExecutableResolver {
  interface Input {
    readonly runId: string
    readonly ref: ExecutableRef
    readonly manifest: ExecutableManifest
    readonly registrations: ReadonlyArray<ExecutableRegistration>
  }

  interface Interface {
    readonly resolve: (
      input: Input,
    ) => Effect.Effect<
      Resolution,
      ExecutablePinMissing | ExecutableRegistrationInvalid | ExecutableRegistrationMissing,
      Scope.Scope
    >
  }
}
```

An Agent resolution contains the exact Agent, services, static Run options, and attestation.
A Program resolution contains the Program, sandbox, bindings, services, and attestation.
The resolver scope owns all reconstructed resources and their finalization.
An empty registration set is valid only when the executable manifest requires no registrations.

For the pre-release clean break, old nonempty Runtime databases without registration records are discarded. There is no
Rika Turn scan or compatibility migration.

### Child Admission And Tool

Applications can admit a child through the hosted Runtime:

```ts
interface SpawnInput {
  readonly parentRunId: string
  readonly invocationId: string
  readonly selection: string
  readonly prompt: Prompt.Prompt | Prompt.RawInput
  readonly sessionId?: string
  readonly idempotencyKey?: string
  readonly messageId?: string
  readonly correlationId?: string
  readonly metadata?: Metadata
}

const spawnChild = Effect.gen(function* () {
  return yield* runtime.spawn({
    parentRunId: parent.runId,
    invocationId: "review:security",
    selection: "reviewer",
    prompt: "Review this patch.",
  })
})
```

Model-authored child work uses one generic Baton tool:

```ts
const Parameters = Schema.Struct({
  selection: Schema.String,
  prompt: Schema.String,
})

const Result = Schema.Union([
  Schema.TaggedStruct("Succeeded", {
    childRunId: Schema.String,
    text: Schema.String,
    turns: Schema.Int,
  }),
  Schema.TaggedStruct("Failed", {
    childRunId: Schema.String,
    message: Schema.String,
  }),
  Schema.TaggedStruct("Cancelled", {
    childRunId: Schema.String,
    reason: Schema.optionalKey(Schema.String),
  }),
])

const runChild = Tool.make("run_child", {
  description: "Run one declared child Agent and wait for its durable result.",
  parameters: Parameters,
  success: Result,
})
```

Child selection is relative to the parent's pinned executable closure.
The Agent composition must declare the tool and route `ChildRuns.route`.
`ExecutionHost` provides the service. It does not add the route to an Agent.

### Rika Execution Gateway

Rika product packages do not mirror Runtime. They depend on a narrow product port:

```ts
const ExecutionLink = Schema.Struct({
  runId: Schema.String,
  turnId: Schema.String,
  threadId: Schema.String,
})

interface StartTurn {
  readonly threadId: string
  readonly turnId: string
  readonly workspace: string
  readonly prompt: string
  readonly promptParts?: ReadonlyArray<PromptPart>
  readonly executionRoute: ExecutionRouteSnapshot
  readonly titleIntent?: {
    readonly _tag: "GenerateThreadTitle"
    readonly expectedTitle: string
  }
}

interface ExecutionGateway {
  readonly startTurn: (input: StartTurn) => Effect.Effect<ExecutionLink, StartTurnFailure>
  readonly cancelTurn: (link: ExecutionLink, reason?: string) => Effect.Effect<void, CancelTurnFailure>
  readonly steerTurn: (
    link: ExecutionLink,
    input: { readonly text: string; readonly idempotencyKey: string },
  ) => Effect.Effect<void, SteeringFailure>
  readonly watchTurn: (link: ExecutionLink, cursor?: string) => Stream.Stream<Event, WatchTurnFailure>
  readonly inspectTurn: (
    link: ExecutionLink,
  ) => Effect.Effect<{ readonly status: Status | "unavailable"; readonly cursor?: string }, InspectTurnFailure>
}
```

The product flow depends only on that port:

```ts
const controlTurn = Effect.gen(function* () {
  const link = yield* gateway.startTurn(startTurn)
  const events = gateway.watchTurn(link, projectionCursor)

  yield* gateway.steerTurn(link, steeringInput)
  yield* gateway.cancelTurn(link, "user requested cancellation")
  const view = yield* gateway.inspectTurn(link)

  return { events, view }
})
```

Acceptance:

- Rika product code has no RunStore, AgentHost, claim, lease, fence, wait, child-ID codec, or Baton cursor logic
- one adapter maps Turn intent to Baton Run operations
- `startTurn` builds one exact executable and registration set from the persisted Turn route, then calls `Runtime.start`
- product projections consume typed adapter events
- no generic fan-out, workflow, approval, or recovery authority remains in this port
- Runtime recovery does not read Rika Turn rows or current workspace configuration

### Rika Executable Configuration And Recovery

Rika builds one exact executable closure from the persisted route and workspace.

```ts
interface ConfiguredExecutable {
  readonly executable: ExecutableManifest.PinnedExecutable
  readonly registrations: ReadonlyArray<ExecutableRegistration.ExecutableRegistration>
  readonly resolverEntries: ReadonlyArray<ExecutableResolver.StaticExecutable>
  readonly profiles: Readonly<Record<string, AgentManifest.PinnedAgent>>
}

const makeResolver = (options: ResolverOptions = {}): ExecutableResolver.Interface =>
  ExecutableResolver.ExecutableResolver.of({
    resolve: (input) =>
      Effect.gen(function* () {
        const configured = yield* configurePersistedRegistration(input, options)
        yield* verifyExactRegistrationDigests(input.registrations, configured.registrations)
        return yield* resolveStaticExecutable(input, configured.resolverEntries)
      }),
  })
```

The helper names inside `resolve` describe required work. They do not create new public APIs.

Acceptance:

- Persist the complete ordered provider route for each role.
- Persist model, model registry, compaction, workspace, route, role, and tool registrations.
- Recompute registration digests during recovery.
- Require the recomputed digest list to equal the persisted digest list.
- Fail a missing, changed, or unsupported registration with a typed error.
- Do not use `any` in executable, resolver, service Layer, or operation admission boundaries.

### Rika Agent Graph

Rika configures these Baton roles:

- Root
- Title
- Compaction
- Oracle
- Librarian
- Painter
- ReadThread
- Surgeon
- Task

Root can select Title, Oracle, Librarian, Painter, ReadThread, Surgeon, and Task.
Task can select Oracle, Librarian, Painter, ReadThread, and Surgeon.
Task cannot select Task or Title.

Rika product tools map to Baton child selections at one adapter boundary:

```ts
const childSelections = {
  title: "Title",
  oracle: "Oracle",
  librarian: "Librarian",
  painter: "Painter",
  read_thread: "ReadThread",
  surgeon: "Surgeon",
  task: "Task",
} as const
```

The adapter calls Baton's generic child tool and child route. Rika does not define a second child protocol.

Nested child execution must preserve this request sequence:

1. Root requests Task.
2. Task requests Oracle.
3. Oracle returns its report.
4. Task receives the Oracle report and returns the Task report.
5. Root receives the Task report and returns the root result.

Each child result enters its parent's next model request once. Resume must not substitute the original parent prompt.

### Atomic Title Admission

Title generation is an initial child of the root Run.

```ts
const initialChildren = input.titleIntent
  ? [
      {
        invocationId: "rika.thread-title",
        selection: "Title",
        prompt: `Generate a title for this request:\n\n${input.prompt}`,
        idempotencyKey: `${input.turnId}:title`,
        sessionId: input.threadId,
        metadata: {
          threadId: input.threadId,
          turnId: input.turnId,
          productIntent: "thread-title",
          expectedTitle: input.titleIntent.expectedTitle,
        },
      },
    ]
  : undefined
```

Admission must persist the root and title child atomically. Projection emits one `thread.title.generated` event.
Projection must suppress ordinary child output for this invocation.

## Durable Steering

Prove the required durable semantics for the existing idempotent `Runtime.steer` operation.

```ts
interface SteerInput {
  readonly runId: string
  readonly idempotencyKey: string
  readonly prompt: Prompt.Prompt | Prompt.RawInput
}

const steerRun = Effect.gen(function* () {
  yield* runtime.steer({
    runId,
    idempotencyKey: "steer:1",
    prompt: "Focus on the database race.",
  })
})
```

Required semantics:

- admission persists a per-Run inbox entry before success returns
- steering never interrupts an active model stream or tool call
- steering drains at the next safe turn boundary after tool work settles
- steering accepted before completion forces another turn
- completion and steering admission are transactionally ordered
- if completion wins, steering fails with `RunTerminal`
- if steering wins, completion observes pending input and does not strand it
- consumed entries are identified durably before the next model operation begins
- restart replays accepted but unconsumed steering exactly once
- duplicate equivalent steering is idempotent
- changed content under one idempotency key fails typed
- memory Runtime implements equivalent process-bound semantics
- direct Agent steering keeps the existing in-memory seam

Required tests:

- admission during model streaming
- admission during sequential and concurrent tools
- crash before drain
- crash after drain event and before next model call
- admission versus terminal completion race
- duplicate and conflicting admission
- cancellation with pending steering

## Fan-Out And Join

Fan-out means controlled parallel work: one immutable member set, one concurrency limit, and one join rule.

```ts
const runReviews = Effect.gen(function* () {
  const receipt = yield* runtime.fanOut({
    parentRunId,
    idempotencyKey: "reviews:v1",
    members: reviewers.map((selection, ordinal) => ({
      key: `review-${ordinal}`,
      selection,
      prompt: "Review the proposed change.",
    })),
    concurrency: 2,
    join: { _tag: "AllSettled" },
    remainder: "await",
  })

  return yield* runtime.awaitFanOut(receipt.fanOutId)
})
```

Required join modes:

- all success
- all settled
- first success
- quorum
- best effort where product semantics require it

Required remainder policies:

- await
- request cancellation
- terminate where the host can prove termination
- abandon only when explicitly chosen and reported

Required semantics:

- idempotent fan-out admission
- immutable ordered members
- stable member and child identities
- bounded concurrency enforced by transactional claims
- results ordered by member ordinal
- child completion updates membership and join state atomically
- quorum impossibility fails without waiting forever
- first-success and quorum may cancel unnecessary members
- parent cancellation reconciles every owned member
- restart cannot duplicate member admission
- parent events contain fan-out decisions; child details remain child-owned
- direct execution offers equivalent process-bound fan-out through structured Effect concurrency
- hosted Runtime rejects `terminate` unless that host can prove active termination
- callers use `request-cancel` or `await` when hosted termination is unavailable

Required tests:

- every join mode
- concurrency one, bounded concurrency, and full concurrency
- crash before member spawn
- crash after child admission
- crash after child terminal event and before join transition
- simultaneous terminal members
- cancellation before and after satisfaction
- stale worker claim
- deterministic result order

## Agent-Authored Programs

Delete the predefined developer-workflow model. The canonical abstraction is an Agent Program: model-written sandboxed code that composes approved tools and Agents.

Program capabilities include:

- tool discovery and focused type description
- typed tool calls
- `agent.run`
- bounded `agent.map`
- named durable steps
- named fan-outs
- loops, branches, filtering, aggregation, and result shaping
- approvals and resume
- structured logs and structured result

The application-facing Program boundary remains schema-first and host-owned:

```ts
const program = AgentProgram.make({
  name: "review",
  source,
  sandbox: sandboxPin,
  input: Input,
  inputPin,
  output: Output,
  outputPin,
  tools: [{ name: "search", pin: searchPin }],
  steps: [{ name: "shape", pin: shapePin }],
  agents: [
    {
      selection: "reviewer",
      agent: reviewerPin,
      input: reviewerInputPin,
    },
  ],
  budget,
})

const direct = Effect.gen(function* () {
  return yield* AgentProgram.run(program, input).pipe(
    Effect.provide(ProgramHost.layerDirect({ sandbox, bindings })),
    Effect.scoped,
  )
})
```

Program source sees only the allowlisted capability protocol:

```ts
interface ProgramCapabilities {
  readonly discoverTools: () => Effect.Effect<ReadonlyArray<ToolSummary>>
  readonly describeTool: (name: string) => Effect.Effect<ToolDescription, ProgramCapabilityMissing>
  readonly callTool: (input: ToolCallInput) => Effect.Effect<unknown, CapabilityFailure>
  readonly callStep: (input: StepCallInput) => Effect.Effect<unknown, CapabilityFailure>
  readonly runAgent: (input: AgentRunInput) => Effect.Effect<AgentRunResult, CapabilityFailure>
  readonly mapAgents: (input: AgentMapInput) => Effect.Effect<ReadonlyArray<AgentMemberResult>, CapabilityFailure>
  readonly fanOutAgents: (input: AgentFanOutInput) => Effect.Effect<ReadonlyArray<AgentMemberResult>, CapabilityFailure>
  readonly log: (input: LogInput) => Effect.Effect<void, CapabilityFailure>
}
```

The exported schemas and codecs in `@batonfx/core` are the executable authority.
Do not add a second Rika Program protocol.

Rika supplies one production QuickJS `SandboxExecutor` Layer:

```ts
interface Options {
  readonly memoryBytes?: number
  readonly stackBytes?: number
}

const JavaScriptSandboxLive = JavaScriptSandbox.layer({
  memoryBytes: 64 * 1024 * 1024,
  stackBytes: 512 * 1024,
})
```

The sandbox uses a JSON-only host protocol. It validates every capability input and output.
It owns a scoped QuickJS runtime and context. It enforces memory, stack, wall-time, and output limits.
It exposes no `process`, `Bun`, `require`, `fetch`, `WebSocket`, `Deno`, or retained host bridge.

Rika must connect this Layer to an admitted Program executable. Providing the Layer alone does not complete Code Mode.

Execution paths:

- direct ephemeral program without Runtime
- memory-hosted ephemeral program when addressability is useful
- durable hosted program with replay, waits, and recovery

Sandbox rules:

- no ambient credentials
- no database handles
- no unrestricted host objects
- no unrestricted network by default
- no `process.env`
- all effects cross typed host capabilities
- schemas validate every capability argument and result
- budgets bound Agents, concurrency, tools, tokens, wall time, logs, and output
- cancellation interrupts the sandbox and active capabilities

Durable rules:

- pin source, digest, input, capabilities, versions, and budget
- record every external operation
- use stable named identities, not nondeterministic arrival order
- replay completed calls from recorded results
- resume unfinished children and fan-outs
- pause before approval-gated effects
- rerun source in a fresh sandbox after resume or restart
- detect replay divergence
- never repeat unknown non-idempotent effects automatically

Required tests:

- direct tool composition
- filtering large intermediate results outside model context
- sequential dependencies
- bounded parallel Agents
- approval pause and replay
- crash after each operation boundary
- source or argument replay divergence
- unknown external outcome
- cancellation and budget exhaustion
- sandbox escape attempts

## Execution Context And Compaction

Rika passes structured initial sources. Baton owns the exact model-facing history thereafter.

Acceptance:

- user prompt, trusted guidance, untrusted references, Thread excerpts, and images remain structurally distinguishable
- tool calls and results enter model history exactly once
- steering enters model history exactly once
- Baton stores exact continuation state
- context pressure is computed from authoritative model usage
- compaction policy and summary model are pinned
- compaction commits before the compacted projection is applied
- crash cannot apply compaction twice
- Baton emits typed compaction events
- Rika may project a user-visible compaction block but cannot execute or recover compaction

## Tool Execution

Baton ToolContext must expose durable invocation facts needed by host tools:

```ts
namespace ToolContext {
  interface Interface {
    readonly signal: AbortSignal
    readonly emit: (progress: Progress) => Effect.Effect<void>
    readonly sessionId: string
    readonly runId?: string
    readonly rootRunId?: string
    readonly toolCallId?: string
    readonly operationKey?: string
    readonly idempotencyKey?: string
    readonly attempt?: number
    readonly admittedAt?: string
    readonly deadline?: string
  }
}
```

- Run ID and root Run ID
- tool call ID
- operation key and idempotency key
- attempt
- admitted time and optional deadline
- interruption signal
- progress emitter
- session and invocation metadata without hidden database handles

Acceptance:

- Rika deletes its duplicate ToolInvocation protocol
- Rika tools retain their input/output schemas and product-specific behavior
- Baton owns generic timeout, interruption, output spill/bounds, replay, and uncertainty
- Rika owns product-specific remediation copy
- unsafe interrupted effects become unknown or require resolution
- handler scopes finalize before Run cancellation reports settled

## Approvals And Permissions

Acceptance:

- pending approval inspection returns unresolved waits only
- approval is bound to call and argument digest
- equivalent duplicate response is idempotent
- changed duplicate conflicts
- stale response fails typed
- `Always` persists an explicit permission rule before the Run resumes
- Rika displays the request and captures the answer but stores no competing wait ledger
- approval survives server restart

## Models, Providers, Agents, Skills, MCP, And Extensions

Acceptance:

- Baton issues opaque versioned model pins
- provider-specific options are validated by provider codecs
- request shaping, candidate fallback, streaming-only behavior, prompt caching, retries, and usage decoding live in Baton providers
- credentials enter as redacted scoped capabilities
- account authentication and refresh are supported without Baton reading Rika storage
- Agent identity includes instructions, model pin, tools, skills, services, policy, and budget
- each Rika role pins and executes its intended toolkit; supplying handler services without tool declarations is invalid
- child Agent selection is relative to the parent Run pin
- historical pins resolve lazily during recovery
- missing pins fail typed and do not silently adopt current configuration
- the full ordered provider candidate list survives Turn admission and executes Baton's provider fallback policy
- Runtime passes the pinned context-window hint into `RunOptions.compaction` and composes the pinned summary model/service
- Baton handles model-facing skill listing and activation
- Rika supplies skill sources and product installation policy
- Baton handles MCP transport, discovery, calls, and generic OAuth exchange
- Rika supplies MCP configuration, provenance, browser/callback, and token storage
- executable extension capabilities are pinned in Baton, not reconstructed from a Rika Turn row
- Run-scoped workspace capabilities never default to `process.cwd()`

## Canonical Events, Tree History, And Usage

Baton exposes one tree stream. Rika keeps the tree cursor opaque.

```ts
interface TreeEvent {
  readonly rootRunId: string
  readonly runId: string
  readonly parentRunId?: string
  readonly invocationId?: string
  readonly modelCallId?: string
  readonly modelAttemptId?: string
  readonly toolCallId?: string
  readonly event: RunEvent
  readonly cursor: TreeCursor
}

const observe = Effect.gen(function* () {
  const first = yield* RunTree.history({ rootRunId, limit: 100 })
  return RunTree.events({ rootRunId, cursor: first.cursor })
})
```

Acceptance:

- each Run has one canonical event stream with stable event ID and increasing sequence
- tree history is derived by Baton and exposes explicit Run, parent, invocation, and call identities
- Rika never infers parentage from encoded strings
- one tree cursor resumes a projection without recursively discovering children
- compaction and authoritative raw usage are present in Baton events or snapshots
- raw usage includes stable model-call and attempt identity
- Rika stores only product aggregates, pricing, and an opaque projection revision/cursor
- Rika does not persist a second raw lifecycle fold

The root tree stream must cover these projection families:

- Run admission, start, completion, failure, and cancellation
- model input, text, reasoning, and tool-call deltas
- tool start, progress, result, and failure
- steering delivery
- model call, attempt, retry, fallback, and raw usage
- compaction
- wait and resume
- child admission and settlement
- fan-out admission and join
- Program log and unknown operation

The watcher stops only when the root and all descendants satisfy the selected settlement policy.
Root completion must remain visible after nested child traversal.

### Rika Review Fan-Out

Review is a product policy over Baton's generic fan-out.

Required production flow:

1. Rika selects immutable review lanes and prompts.
2. Rika admits one Baton fan-out beneath the root Run.
3. Baton enforces the concurrency and join policies.
4. Baton records each member and join decision.
5. Rika projects review progress and results.

The production adapter admits the review fan-out atomically with the root through `Runtime.start.initialFanOuts`. It uses
the immutable `correctness`, `security`, and `quality` lanes, concurrency `3`, `AllSettled`, and `await`. The returned
`StartReceipt.fanOuts` supplies Baton-owned fan-out identities. Rika keeps no fan-out ledger.

### Rika Server Composition

Rika composes one lazy execution backend. Product parsing and queries must not initialize Baton.

```ts
const executionLayer = BatonExecution.layer({
  filename: batonDatabase,
  agentServices: (workspace) => agentServicesForWorkspace(workspace),
  modelServices,
}).pipe(Layer.provide(JavaScriptSandbox.layer()))

const productLayer = Operation.productLayer.pipe(
  Layer.provide(lazyExecutionBackend(executionLayer)),
  Layer.provide(productRepositories),
)
```

The helper names describe the required composition roles. Current exported Layer constructors remain authoritative.

Acceptance:

- Use separate Baton and Rika SQLite databases.
- Build product repositories before the product operation Layer.
- Resolve workspace tool services from the admitted workspace.
- Give product operations only `ExecutionGateway.Service`.
- Keep route selection and product configuration outside Baton.
- Gate start, cancellation, and steering during Server replacement.
- Keep watch and inspection available during Server replacement.
- Do not provide an unavailable backend or an in-memory production backend.

## Rika Deletion Inventory

Delete or replace all of the following without compatibility shims:

- `packages/relay-execution`
- every `@relayfx/*` dependency and import
- the broad execution Runtime mirror
- predefined workflow contracts, service, dispatch, CLI, tests, and documentation
- generic child and fan-out contracts in product
- generic approval and canonical execution-inspection contracts in product
- ProductAgentService forwarding facade
- generic delegation protocol under coding-tools
- execution recovery that starts, fails, or repairs Runs from Rika rows
- stop-intent persistence and settlement
- Turn `last_cursor` execution authority
- recursive child following and quiescence polling
- review fan-out owner persistence
- in-memory execution admission authority
- execution extension pins required to reconstruct Runs
- startup scanning of product rows to rebuild model registrations
- raw usage fold persistence
- provider usage decoding in transcript presentation
- child-parent identity parsing from encoded IDs
- unavailable production execution layers
- local Baton links
- in-memory production fallbacks
- direct Baton SQLite-table access
- stale Relay and predefined-workflow docs
- Resident process names, aliases, commands, composition modules, and documentation
- hardcoded developer-machine paths

This pre-release migration does not preserve historical database upgrades. Consolidate Baton and Rika to one current baseline migration for each supported dialect, discard old development databases, and recreate them from that baseline. Do not add compatibility migrations, schema-version dispatch, startup Turn scans, or product-row repair for obsolete schemas.

## Rika Keep Inventory

Retain and simplify:

- Thread and Turn records
- Pending Turn queue, claims, editing, removal, steering conversion, and promotion policy
- transcript units, paging, search, rendering, and one opaque projection cursor
- usage pricing and materialized Turn/Thread aggregates
- context source selection and diagnostics
- coding tool implementations and workspace policy
- shell process registry
- product modes, profiles, prompts, route intent, and configuration
- reasoning and fast mode behavior through Baton-native route and Agent selection
- credential UX and storage adapters
- extension and skill source discovery
- MCP configuration and host adapters
- server process, transport, client lifecycle, and terminal behavior

## Rika Product Store Acceptance

- Baton execution database is separate from `rika.db`
- product database does not contain canonical Run status, Run cursors, stop intent, fan-out state, waits, claims, or operation journal
- Pending Turn product queue remains durable in Rika
- transcript and usage tables are explicitly disposable/materialized projections
- one opaque Baton source cursor and projection version may be stored
- stale projections rebuild from Baton history
- missing Baton execution reports unavailable product history rather than synthesizing a replacement Run

## Verified Evidence Accounts And Remaining Holds

The following accounts record verified source and command evidence. Rika publication and Relay archival remain pending
until their applicable stop conditions are satisfied.

### Admission Validation — closed

`Runtime.start` now resolves the executable through the application resolver inside a closed scope and compares the returned attestation with the admitted pin before admission succeeds. An unresolvable pin fails `ExecutablePinMissing` and admits nothing. Unsupported codecs and versions surface from the resolver, which is their only competent owner.

### Registration Secrets — closed

`ExecutableRegistration.payload` is unknown data. Baton cannot identify a credential value by type alone.

Baton address bindings carry immutable registrations. `Runtime.send` persists them with the admitted Run, and an addressed
Run reloads its exact registrations after restart without a live binding. Rika registration codecs accept credential
references only. Exact registration and restart proofs inspect persisted payloads and reject API keys, tokens, and resolved
credential values.

### PostgreSQL Resume And Cancellation Race — closed

One canonical `lockRun` helper takes the run advisory lock and then the run row, in that order, for admission, steering, response, resume, timeout, cancellation, completion, and failure. A concurrent response-versus-cancellation test runs both operations unbounded across eight rounds and proves one ordered outcome and that an accepted response is never lost.

### MySQL Parity — closed

MySQL ran zero live tests before because its baseline migration was broken. Fixed: `ESCAPE '\'` was a MySQL syntax error, the migration lock was acquired on a pooled connection that never held it, `LIMIT ?` is rejected by `mysqld_stmt_execute`, and a suspended Run never released its owner or lease so no worker could resume it. The steering test now expects `SteeringPending`, and a full durable Program contract suite covers tool/log replay, approval reservation, ordered children, finalizer counts, and cancellation.

### Cross-Process Cancellation — closed

The worker watches each claimed Run and interrupts local execution when another process persists cancellation, bounded by `cancellationInterval`. Fresh PostgreSQL and MySQL suites prove cancellation during active model and tool calls, stale-worker fencing, and resolver, service, model, and tool finalizer order before terminal cancellation settles.

### Cancellation With Unknown Operations — closed

A Run with an unknown operation stays `needs-resolution` across an admitted cancellation and settles to `cancelled` only once the operation is resolved. `Runtime.cancel` remains `Effect<void>` and is prompt admission, not settlement. Rika projects `execution.resolution.required` and returns the Turn to `waiting`. Memory, SQLite, PostgreSQL, MySQL, and source-aliased Rika tests prove the contract.

### Hosted Termination — bounded policy

Hosted fan-out declares `terminate`, but every current hosted store rejects it.

The typed rejection remains correct when a host cannot prove termination. Rika review uses `await`, not `terminate`.
Any future hosted termination support requires a separate proof before use.

### Rika Program And Review Paths — closed

Rika admits an exact durable Program executable through `Runtime.start`. QuickJS receives only the pinned typed capability
protocol. Exact registration, restart reconstruction, cancellation, and credential-payload proofs pass. Production review
admission uses atomic `Runtime.start.initialFanOuts` with the `correctness`, `security`, and `quality` lanes, concurrency
`3`, `AllSettled`, and `await`. The adapter stores no Rika fan-out ledger. Projection closure passes for this flow.

### Test And Type Debt — closed

The asserted nested-child regression replaces the focused debug test. Central executable, resolver, service Layer, and
operation-admission boundaries are typed without `any`. Fresh live PostgreSQL and MySQL suites are independent of suite
order and schema residue. Repository policy and graph checks pass.

### Baton Publication — closed

Baton release commit `8c26eee` was pushed atomically to `main`, `release`, and annotated tag `v0.15.0`. GitHub release
workflow `31014573121` passed all three jobs. The public release has 13 assets, and all 11 `@batonfx/*` packages resolve
from npm at `0.15.0`.

### Rika Normal Verification — closed

Rika pins the six used `@batonfx/*` packages to published version `0.15.0`; the source-alias Vitest configuration is
deleted, and a frozen install passes. The canonical `bun run check` passes all 20 tasks and 1,787 unit tests. The full
process gate passes. The TUI fixture now emits deterministic current execution, child, tool, steering, usage, and
terminal events instead of an obsolete one-step model approximation. Its 19 tests pass: the child-stream file completes
in 5.65 seconds and the application file completes in 16.50 seconds. Failed waits now terminate cleanup instead of
stalling the suite.

### Rika Publication — closed

The `darwin-arm64` `0.2.0` archive builds and release smoke passes. Its contract contains `rika`, `.rika-interactive`,
`.rika-server`, `.rika-performance`, and `INSTALL`; SHA-256 is
`049a30b46bced5ba930747344c2992edb4b57572c0f78416fba03a6fa8e8f8ce`. All 22 release contract tests pass. Linux
artifacts require their native OpenTUI packages, and the canonical publish workflow builds and verifies `linux-arm64`
and `linux-x64` on native runners.

PRs `264` and `265` merged the migration and bounded the two durable cancellation integration waits. Merge commit
`fd1df5a690c6331cb30735c6c3eb93525d721f92` passes `main` CI run `31031001774`: quality, process, TUI, and aggregate
checks all pass. Annotated tag `v0.2.0` resolves to that commit. Publish workflow `31031284335` passes native package and
smoke jobs for all three targets, release aggregation and attestations, GitHub publication, and npm publication. The
public release contains the three archives, `SHA256SUMS`, and `release-evidence.json`; their checksums and revision agree.
The four public npm packages are `@rikafx/cli`, `@rikafx/cli-darwin-arm64`, `@rikafx/cli-linux-arm64`, and
`@rikafx/cli-linux-x64` at `0.2.0`. A clean registry install reports `rika v0.2.0`.

## Implementation Order

Steps 1 through 17 are complete through the applicable local and public gates. Baton also fixed real defects
found while proving the completed steps: undecodable persisted suspensions silently replayed the original prompt instead of
the child result; a cancelled root reported terminal before every owned child settled; concurrent admission raced on
registration inserts; and the four MySQL faults recorded above.

1. Nested child execution — closed.

   `LocalScheduler.tick` selected Runs whose owner already equals this worker, including Runs the same process was actively executing. Re-claiming bumped the attempt fence and interrupted the in-flight fiber mid-operation, so a depth-2 grandchild was interrupted inside its first durable journal write and never settled; every ancestor then waited forever and `watchTurn` never terminated. Confirmed by raising the poll interval, which made the whole nested chain pass unchanged.

   `ActiveExecutions` now reports the Run IDs this process is executing and the scheduler skips them. The scheduler also interrupts local executions of Runs that entered `cancelling`, which is the local-runtime counterpart of the worker cancellation watcher. The Rika nested-child test now passes at the default 10 ms poll: two `child_run.spawned` events, the oracle and task reports reach the parent, and requests 4 and 5 contain the exact child results once.

2. Root cancellation and finite root-tree watching — closed.

   The prior missing-root diagnosis was false. The durable database contained both terminal rows and ordered child `RunCancelled`, parent `ChildSettled`, and root `RunCancelled` events. Rika stopped its stream on the child terminal event after a current-state inspection observed the already-terminal tree, so the later root event remained unread. Baton now owns page-draining finite traversal through `RunTree.watch`. The watcher drains through the settled inspection cursor and supports terminal-tree and externally-blocked settlement without truncating root events. Rika delegates traversal settlement to that interface. The source-aliased suite proves nested completion, title-child traversal, child-before-root cancellation, unknown-operation blocking, and cursor-safe root completion.

3. Connect Rika QuickJS to an exact durable Program executable — closed.
4. Prove Program replay, approval, restart, cancellation, finalization, uncertainty, and budgets on all stores — closed.
5. Implement Rika review admission with Baton fan-out — closed.
6. Prove review ordering, concurrency, restart, cancellation, join, and remainder policy — closed.
7. Complete root-tree projection. Retain root completion after child traversal — closed by step 2.
8. Delete unreachable cross-Thread coordination — closed.
9. Resolve Rika Server Layer environment and type errors — closed.
10. Replace `any` at central executable, resolver, Layer, and operation boundaries — closed.
11. Run Baton local release gates — closed. `bun run check` passes after graph generation (620 files and 2,835 imports). `bun run test` passes 1,120 tests with 79 live-database skips. The configured live PostgreSQL suite passes 5 files and 40 tests. The live MySQL suite passes 6 files and 34 tests. Core, Runtime, and root typechecks pass. Package smoke passes 11 tarballs, and the runtime tarball is 142,631 bytes, below the 150,000-byte limit. Publication and registry verification remain step 12 work.
12. With explicit authorization, release and verify Baton `0.15.0` — closed.
13. Pin Rika to the published Baton packages. Remove source aliases — closed.
14. Run all Rika release gates — closed.
15. With explicit authorization, release and verify Rika `0.2.0` — closed.
16. Confirm that Relay has no open pull requests — closed; GitHub reports zero open pull requests.
17. With explicit authorization, merge the archive commit and archive Relay — closed. PR `384` merged archive commit
    `5b1a1868` in merge commit `c0508570`; the temporary branch is deleted, GitHub reports zero open pull requests, and
    `In-Time-Tec/relayfx` reports `isArchived: true`.

## Baton Release Acceptance

- root `bun run check` passes
- full deterministic test suite passes
- package typechecks, lints, and builds pass
- direct Agent, memory Runtime, and SQLite Runtime interface walks pass
- SQLite close/reopen tests cover successful, failed, cancelled, waiting, steered, child, fan-out, program, compaction, and usage states
- PostgreSQL store contracts and crash/takeover tracers pass serially against a disposable live database
- MySQL store contracts, parity tests, and restart verification pass against a disposable live database
- `Runtime.start` resolves and attests the executable before it returns success
- `Runtime.send` persists the exact address-binding registrations with each admitted Run
- addressed Runs recover after restart without current Layer registration data
- registration tests prove that persisted payloads contain references and no resolved secrets
- resolving a SQL child wait records the resolution, marks the wait responded, and resumes only from the decoded persisted suspension
- PostgreSQL concurrent response-versus-cancellation tests prove one ordered outcome
- a nested child result reaches the parent's next model request exactly once; the original prompt is not replayed as the resume value
- root cancellation emits attributable child cancellation events and settles every owned child before the root reports terminal
- PostgreSQL and MySQL tests prove active model and tool cancellation across worker boundaries
- cancellation projects `needs-resolution` when an interrupted operation has an unknown outcome
- resolve-then-cancel tests prove recovery from an unknown operation
- Program restart tests cover child wake-up, approval pause, finalizer ordering, replay divergence, cancellation, budget exhaustion, and unknown external outcomes
- MySQL runs the same durable Program contract as SQLite and PostgreSQL
- no blind repeat of unknown effects
- stale claims cannot commit
- every package `src` file satisfies the 500-line limit without a new lint exception
- canonical package tarballs and checksums verify
- packed package declarations and exports import under both Node and Bun
- GitHub release assets and every published npm package verify from the registry
- docs describe only implemented behavior
- no Relay compatibility package or API remains

## Rika Release Acceptance

- production uses released Baton packages only
- no local links
- no source-alias verification config is required after Baton `0.15.0` is published
- no `@relayfx/*` dependency or import
- no `packages/relay-execution`
- no predefined workflow command or contract
- no broad Runtime mirror in product
- no Rika execution ledger or recovery scheduler
- no in-memory production fallback
- no Baton table access
- one Turn maps to one Baton root Run
- title and subagents use child Runs
- reviews use Baton fan-out
- nested Task and Oracle children return their actual reports to the parent model request exactly once
- root-tree streaming retains root completion while projecting nested child output
- steering survives restart and arrives at a safe boundary
- cancellation settles the Run tree through Baton and projects child-attributed cancellation
- agent programs support Code Mode and bounded multi-Agent orchestration
- QuickJS exposes only the pinned Program capability protocol and no ambient host, environment, credential, filesystem, database, or network authority
- dynamic Program resolution reconstructs the exact sandbox, schemas, bindings, Agents, tools, services, and budget admitted with the root Run
- model-facing context and compaction are Baton-owned
- transcript, usage, title, summary, search, and UI projections remain Rika-owned
- raw usage projection is driven by Baton's authoritative model-attempt events rather than a Rika lifecycle alias
- multiple workspaces resolve Run-scoped capabilities correctly
- persisted pins recover under the exact original Agent and model definitions
- a previously unseen workspace route starts without startup pre-registration
- restart reconstructs the admitted executable from Baton's immutable registration catalog without reading Rika rows
- persisted registration payloads contain credential references but no credential values
- deterministic test provider supports process, TUI, and performance tests
- one current product migration baseline creates the exact schema fingerprint on a fresh database; obsolete development schemas are rejected or discarded rather than repaired
- diagnostics, repository policy, graph checks, formatting, typecheck, lint, build, and all unit tests pass
- TUI and process suites pass
- all three release targets package: `darwin-arm64`, `linux-arm64`, `linux-x64`
- release smoke passes against packaged artifacts
- GitHub release assets, checksums, evidence, and npm publication verify

## Relay Archive Acceptance

- Rika `0.2.0` is publicly released and verified
- Relay has no open pull requests
- archive commit contains the read-only notice and removes active CI/release automation
- archive commit is merged without unrelated changes
- `gh repo archive In-Time-Tec/relayfx --yes` succeeds
- repository reports `isArchived: true`

## Stop Conditions

Do not release Baton if durability claims are unproven.

Do not release Rika if any production execution path is unavailable, process-bound, Relay-backed, table-coupled, or reconstructed from Rika product state.

Do not archive Relay until Rika is released against the published Baton runtime.

Do not solve a blocker with compatibility code. Correct the owning interface, migrate every caller, and delete the replaced path.
