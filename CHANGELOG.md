# Changelog

## 0.50.0

- Split the public surface into stable and unstable tiers. Stable entry points carry no `@experimental` annotation and are `generalist`, `generalist/approvals`, `generalist/compaction`, `generalist/permissions`, `generalist/providers/*`, `generalist/runtime`, `generalist/runtime/sqlite-bun`, `generalist/runtime/sql-driver`, `generalist/instructions`, `generalist/instructions/skills`, `generalist/memory`, `generalist/repl`, `generalist/repl/bun`, `generalist/sandbox`, `generalist/testing`, `generalist/testing/runtime-driver`, `generalist/pg`, and `generalist/mysql`. Everything else moves under `generalist/unstable/`. Import paths change: `generalist/ai/<provider>` → `generalist/providers/<provider>`; `generalist/ai/model-route`, `generalist/ai/openai-account-auth`, and `generalist/ai/openai-account-auth-http` → `generalist/unstable/providers/…`; `generalist/a2a`, `generalist/ag-ui`, `generalist/foldkit`, `generalist/mcp/*`, `generalist/transport/*`, and `generalist/cloudflare/*` → `generalist/unstable/<same>`; `generalist/rivet/actors` → `generalist/unstable/rivet`; `generalist/runtime/external-child-placement` and `generalist/runtime/external-child-store` → `generalist/unstable/runtime/…`; Worker Loader sandbox exports → `generalist/unstable/sandbox/worker-loader`; `Testing.chaos` → `Chaos` from `generalist/unstable/transport` with `layerInterruptAfter`, `layerDropConnection`, and `layerFlakyModel`. The root package no longer re-exports Effect AI's `Prompt`, `Response`, `Tool`, and `Toolkit`; import them from `effect/unstable/ai`. Error tags and service keys keep their existing identities, so durable data is unaffected. An ast-grep rule forbids stable source from importing unstable modules. (#316)

## 0.49.0

- Install instructions, skills, and tools from packages. `PackageCatalog.layer({ packages, cacheDir, lock, allowTools?, npmRegistryUrl?, githubApiUrl? })` from `generalist/instructions` resolves `npm:` specifiers through the registry with SRI-verified tarballs and `github:owner/repository#ref` specifiers through the GitHub commit API to a locked 40-character SHA archive, records both in a lock file, and exposes the packages' `instructions`, `skills`, `toolkit`, and `handlers` (a `Tool.Handler` layer for the normal `ToolExecutor` path). Tools load only when the package manifest declares them and `allowTools: true`. Nothing shells out to `npm` or `git`, and no lifecycle scripts run. `examples/package-catalog` is a runnable program and `examples/packages/generalist-skills-example` is the reference package (not yet published). (#339)
- Rework compaction around the model prompt. `Compaction.Strategy` is now `{ shouldCompact({ tokens, contextWindow }), cut(prompt, keepRecentTokens): Option<Plan>, summarize(plan, request), toolOutputMaxBytes?, keepRecentTokens? }` where `Plan` is `{ keep, compact, recent }` over `Prompt` values, replacing the Entry-valued `head`/`recent` shape. `Compaction.cacheAware({ stablePrefixTurns, keepRecentTokens?, summarize })` keeps the instructions and the first N user turns byte-identical so provider prompt caches stay warm and refuses to summarize when the stable prefix and recent suffix overlap; `Compaction.summarizeWithModel({ model?, prompt? })` summarizes with the ambient or a provided model layer; `Compaction.layer(strategy)` accepts a strategy directly. Truncation stays model-free. (#327)
- Add memory backends and conformance. `Testing.memory({ layer, persistent? })` certifies a `Memory` adapter including close/reopen persistence; `layerPgVector({ table, dimensions })` from `generalist/memory` is a `VectorStore` over the caller's shared `SqlClient` (the `vector` extension must already be enabled); `layerSupermemory({ apiKey, containerTag, containerTagForKey?, endpoint?, limit?, threshold? })` is a hosted `Memory` over Effect `HttpClient` that replaces local embeddings and the vector store; Amazon Bedrock gains `layerEmbedding`/`makeEmbedding` for Titan embeddings. Semantic memory ids use Effect AI's default id generator instead of a resettable process counter. `examples/memory` shows the layers together. (#328)
- Retry and reconnect with jitter. `ModelResilience.defaultPolicy.retrySchedule` is 500 ms exponential with ±20% jitter for five retries. `RunClient.streamSSE({ url, cursor?, reconnect? })` and the WebSocket client reconnect from the last admitted event cursor on socket errors using `RunClient.defaultReconnectSchedule` (250 ms exponential, jittered, up to two minutes) or a caller-supplied `RunClient.ReconnectSchedule`, so a dropped connection replays no duplicates. `ModelCatalog.contextWindow(selection)` returns the catalog context window and compaction sizes itself from it when `RunOptions.compaction.contextWindow` is not set, falling back to `ModelCatalog.conservativeContextWindow` (32,768) for unlisted models. (#324)
- Add hosted sandbox leaves under `generalist/unstable/sandbox`: E2B (`layer({ apiKey, template, autoPauseAfter? })`, microvm; Process commands, files, pause/resume, snapshot/fork, wall-clock limits) and Cloudflare Sandbox (`layer({ binding })`, container; Process commands, files, wall-clock limits), both over Effect `HttpClient`/Durable Object RPC without SDK dependencies. `Testing.sandbox` now certifies capabilities the provider declares, so Process-only leaves pass streaming, wall-clock, and lifecycle checks without TypeScript or JavaScript module support. (#330)

## 0.48.0

- Type Agent input and output. `Agent.make({ input?, output? })` takes Schema codecs (both default to `Schema.String`); `Agent.run(agent, input, options?)` and `Agent.stream(agent, input, options?)` are data-first/data-last duals that take the typed input instead of a prompt, and the terminal `Completed<Output>.output` carries the decoded typed result. A non-string output schema drives a provider-facing `submit` object turn, and a result that fails the output codec is a typed `InvalidOutput` in `RunError`. `Agent.start(agent, input, { executable, registrations, sessionId?, idempotencyKey? })` starts a typed run over the durable Runtime and returns a `RunHandle`. `Agent.generate` and `StructuredOutput` are removed; Agent-as-Tool and Handoff adapters accept string-input/string-output Agents only. Durable completions persist the encoded `output`; historical text-only results still decode. (#315)
- Add `generalist/sandbox`: one `Sandbox` contract with `start`, `exec`, `stream`, `files`, `pause`, `resume`, `snapshot`, and `fork`, a closed `Command` union (`Process`, stateful `TypeScript`, process-local `JavaScriptModule`), factual `isolation`, enforced `limits`, explicit `capabilities`, and typed `Unsupported | Unavailable | ExecutionFailed | LimitExceeded | SnapshotNotFound` failures. `layerBunKernel` (process) and `layerWorkerLoader` (v8-isolate) are the first leaves; `CellTool` and `CodeExecutor` are thin adapters over them, snapshot-capable cells journal their `SnapshotId` as `ToolProgress`, and `Testing.sandbox({ name, isolation, layer })` certifies a provider. (#329)
- Persist permission rules. `Permissions.layerRuleStoreFile({ path })` keeps rules in a Schema-validated JSON or YAML file with atomic 0600 writes and external-change watching; `Permissions.layerRuleStoreSql({ scope? })` keeps them in the shared `generalist_permission_rules` table over any `SqlClient`. `RuleStore` moves to `core/policy/rule-store.ts`, its failure channel widens to `RuleStoreError = PermissionError | InvalidRuleFile`, and both adapters pass `Testing.ruleStore`. The shared SQL Runtime schema baseline moves from v4 to v5 to add the table; existing SQL Runtime databases must be recreated. (#326)
- Publish npm packages from a GitHub-hosted runner so npm accepts `--provenance`.

## 0.47.0

- Publish `generalist/testing`, replacing `generalist/test`. `Testing.runtimeDriver(options)` runs the capability-based durable runtime driver suite against any driver, `Testing.memory({ layer })` and `Testing.ruleStore({ layer })` are conformance suites for `Memory` and `Permissions.RuleStore` adapters, `Testing.chaos.interruptAfter`, `Testing.chaos.dropConnection`, and `Testing.chaos.flakyModel` inject deterministic journal, transport, and model faults, and `Testing.report.write({ path })` writes a certification report of which suites a host ran. Import paths `generalist/test` and `generalist/test/runtime-driver` become `generalist/testing` and `generalist/testing/runtime-driver`; `docs/features/test-kit.md` becomes `docs/features/testing.md`. (#336)
- Move `generalist/pg` onto `@effect/sql-pg` only and drop the `pg` and `@types/pg` optional peer dependencies. Shared SQL code decodes BIGINT columns whether the driver returns a number, string, or bigint. `RunClaims.changes` owns a dedicated scoped LISTEN connection and detects listener loss through `pg_stat_activity` because the pinned `@effect/sql-pg` swallows listener errors; a lost listener fails the stream so subscribers reacquire a fresh one. (#322)

## 0.46.1

- Fix Bun kernel frame delivery silently dying mid-session. The fd-3 frame pump created a fresh `Bun.file(fd).stream().getReader()` per chunk and cancelled it between reads; on Bun 1.4.0/macOS that corrupts frames spanning multiple reads (bytes duplicated or dropped) and a parked read can report a spurious `done` during idle, ending the pump for a live worker. Either way the worker's frames vanished without a trace: cells then waited out their full deadline and the pool killed and rebooted the worker with no surfaced error. The pump now owns one persistent reader for the descriptor's lifetime, recreates the stream only when a `done` arrives while the worker is verifiably alive, and still terminates cleanly on real peer exit.
- Kernel frame drops are no longer invisible: a line that fails the nonce filter or JSON/schema decoding logs `kernel-session.frame-dropped` / `kernel-session.frame-decode-failed` warnings with bounded annotations (byte length, short payload preview without the frame nonce) instead of being silently ignored.
- A failure to answer a worker's host request (for example, the command channel closing mid-cell) now logs `kernel.host-request-answer-failed` with the request id, module, and operation instead of being silently ignored.

## 0.46.0

- Provide models as layers. Every provider now exports `layerModel` — a `Model.Model` layer pinned to one model id over the provider client — so a run receives its model with plain `Effect.provide`: change the model by editing one value, change the provider for that model by swapping one layer. OpenAI, OpenAI Responses, OpenAI Chat Completions, Anthropic, OpenRouter, Amazon Bedrock, and the deterministic test provider all follow the same shape. `ModelRegistry` remains for genuinely dynamic selection by string id.
- Children inherit or choose models per call site. `AgentTool.asTool(child, { model })` and `Handoff.target(child, { model })` accept a model layer, so a supervisor on one model can run a specialist on another; without the option, children inherit the ambient model. `Handoff.target` now takes an options object (`{ pin?, model? }`) instead of a positional pin. A specialist's declared model selection resolves at handoff commit and fails loudly when its registry is missing instead of silently falling back.
- Tool authorization fails fast. A run whose agent has tools or activatable skills now fails at setup with a typed `AgentError` when no `Permissions` or `Approvals` policy is provided, instead of guessing intent. Tool-less runs still require no policy. Provide `Permissions.layerAllowAll` and `Approvals.layerAutoApprove` (or stricter layers) explicitly.
- `WorkingMemory` summarization takes an explicit model layer: `summarize: { model: someModelLayer }` replaces the bespoke `SummaryModel` service and `layerSummaryModel`, which are removed.
- Compaction truncate is layered: `Compaction.layerTruncate(maxTokens)` (requires `Tokenizer`) and `Compaction.layerTruncateEstimated(maxTokens)` replace the `Compaction.truncate` strategy helper, and threshold caching keys on run identity.
- Skill metadata drops the `agent` and `model` string fields; select models with layers, not strings.
- Documentation goes layer-first: the READMEs, providers guide, quickstart, and feature pages lead with `Effect.provide` examples, and the repository documentation records the values/layers/local-provide pattern as a decision.

## 0.45.1

- Rework the documentation. The repository and package READMEs are shorter and plainer, `docs/README.md` maps the Diátaxis-structured documentation, and every feature now has a dedicated code-first document under `docs/features/` — including new pages for middleware, structured output, durable stores, Cloudflare, Rivet, A2A, and AG-UI. The docs site model catalog reference now names the current `find`/`get`/`list` API. No runtime behavior changes.

## 0.45.0

- Rename the project from TenetKit to **Generalist** and consolidate to one package: `tenetkit` → `generalist`, and the adapter packages `@tenetkit/pg`, `@tenetkit/mysql`, `@tenetkit/cloudflare`, and `@tenetkit/rivet` fold into the same `generalist` package as subpath exports — `generalist/pg`, `generalist/mysql`, `generalist/cloudflare/{workers,durable-objects,dynamic-workers}`, and `generalist/rivet/actors`. One tarball, one version, one install; each adapter's host dependencies (`pg`, `@effect/sql-pg`, `@effect/sql-mysql2`, `@effect/sql-sqlite-do`, `es-module-lexer`, `rivetkit`, `@standard-schema/spec`) are optional peers, so consumers install only what their imported subpaths need. `TENETKIT_*` environment variables → `GENERALIST_*`. Boundary error tags, service keys, and the snapshot codec move from `tenetkit/...` to `generalist/...`; durable registrations pinned under an old codec must be re-pinned. Versions up to 0.44.0 remain published under the old names.
- Merge the instructions surface into one module: `tenetkit/agent-guidance` is now `generalist/instructions`, which carries the ordered provider registry, the AGENTS.md/CLAUDE.md file loader, and the versioned guidance engine together; `tenetkit/skills` moves to `generalist/instructions/skills` — skills are lazy instructions.

## 0.44.0

- Finish the current naming contract: FoldKit exposes `Connection.Connection`, test connections implement the scoped `session` API directly, SQL adapters use `RunClaims["Service"]`, and research examples call their concrete capability `WebSearch`. OpenAI model assembly now stays in a private provider module instead of leaking internal helpers from `tenetkit/ai/openai`.
- Make `KernelPool.execute` scoped so abandoning an execution stops its cell and releases its lease, deadline, and abort fibers. A2A streaming now keeps rejected promises and foreign iterator failures in the Effect error channel instead of turning them into defects.
- Simplify the remaining public service vocabulary: service implementation types now live on their owning Effect service classes, OpenAI account seams use `BrowserAuthorization`, `DeviceAuthorizationPresenter`, `OAuthClient`, and `CredentialStore`, model telemetry uses `Sink` and `InvocationLifecycle`, and the root tool-result namespace is `ToolOutput`.
- Make Runtime resolver composition Layer-native. Memory, SQLite, PostgreSQL, and MySQL Runtime layers now require `ExecutableResolver`; static resolver construction is an effect with a typed `ExecutableRegistrationInvalid` failure and `ExecutableResolver.layerStatic` is the standard composition path. Provider `decodeConfig` functions are also effectful and fail with typed `SchemaError` values.
- Strengthen interruption boundaries: Bun kernels are replaced and recover only their last completed snapshot after strong interruption, Cloudflare Dynamic Workers cancel promptly even when loader promises ignore abort, malformed Bun worker commands no longer crash the worker, and invalid WebSocket event capacity fails as typed `InvalidConnectOptions`.
- Rename public APIs around established agent-framework vocabulary: `SkillCatalog`, `MCPClient`, `ProgramHandlers`, `ProgramRunner`, `CodeExecutor`, `RunExecutor`, `HostBindings`, `ModelCatalog`, `OpenAICompatible`, `RunClient`, `SSE`, `WebSocket`, `AGUI`, and Agent Guidance. Public Effect service implementation shapes now use `Service` instead of `Interface`, provider and database adapter options are package-qualified, and Skill values expose flattened metadata with lazy `instructions`.
- Simplify namespace-qualified APIs to the direct `tenetkit/instructions` module, the `tenetkit/memory` root `layer`, `RuntimeWorker.layer`, `Authorship.author`, `Refinement.apply`, `Refinement.applyTrusted`, `Refinement.makeRollback`, `State.merge`, `Overview.format`, `Snapshot.make`, and `Registration.make`; consistently capitalize `OpenAI.normalizeResponsesSSE` and remove leaked root `Core*` and `*Facade` implementation types.
- Finish the naming pass with `Agent.allocateRun`, `KernelResourceAuthority`, `KernelSnapshotStore`, `ToolAuthorization.Authorizer`, `DurableDriver.Journal`, `DurableDriver.DriverJournal`, `Session.Directory`, and the sole in-memory `Runtime.layerMemory`. Cloudflare Durable Object scheduling uses canonical `tenetkit/runtime/sql-driver` APIs, hibernating replay remains under `HibernatingWebSocket`, and PostgreSQL and MySQL expose `RuntimeSchema`.
- Make domain owners the public namespaces and delete mechanical facade and assembly modules. The broad `tenetkit/core` and `tenetkit/ai` exports, runtime driver barrels, and recursive driver wildcards are removed; use the exact feature, provider, transport, and `tenetkit/runtime/sql-driver` entrypoints instead.
- Key agent state by Session identity and fence every mutable Session projection with a monotonically increasing ownership epoch. Model responses now commit their operation, checkpoint, Session history, event, and budget charge atomically, while durable host acknowledgements identify the exact completed model cycle.
- Persist plural authored-order tool waits by `(runId, waitId)`, resume exact siblings independently, project settled results once in authored order, and defer the next model call until the whole batch settles. Steering is now a bounded, idempotent Run-scoped inbox rather than ambient host state.
- Converge cancellation and uncertain-operation handling across memory, SQLite, PostgreSQL, and MySQL. An interrupted non-cancellable operation remains `unknown` and leaves its Run `needs-resolution`; cancellation cannot turn uncertainty into a false terminal result, and stale Session writers lose authority when execution ownership ends.
- Centralize SQL Runtime lifecycle policy behind `tenetkit/runtime/sql-driver`, shared by Bun SQLite, Cloudflare Durable Object SQLite, PostgreSQL, and MySQL. This release establishes clean schema baseline version 4 and refuses older or future layouts; existing SQL Runtime databases must be recreated because there is no migration or backfill shim.
- Add the ESM-only `@tenetkit/rivet/actors` Runtime host over raw `rivetkit@2.3.10`. One actor owns each Runtime partition and its SQLite authority; durable activation rows plus startup and periodic drains make Rivet schedules lossy doorbells, while pinned-engine generation fencing and TenetKit operation recovery prevent stale writes and unknown non-idempotent redispatch.
- Add bounded SQL lifecycle spans and metrics for transitions, claims, locks, replay, schema identity, subscriber lag, MySQL deadlock retries, and Cloudflare drain/recovery without recording Session content, tool payloads, checkpoints, or SQL parameters.
- Add fail-closed permission rules, bound tool outcomes before durable interception, and define conformance contracts for sandbox executors and remotely owned REPL kernels, including exact resource, fencing, recovery, and lifecycle requirements.
- Replace the stale `in-process-v8-wasm` sandbox identity with the honest `sidecar-process-v8-isolate` topology, and record why AgentOS 0.2.15 cannot satisfy typed terminal attribution or bound output before frame decoding and therefore has no TenetKit adapter.
- Upgrade the Effect package cohort to `4.0.0-rc.112`, pin FoldKit to the tested `0.148.2`, isolate optional provider SDKs, and verify exact package exports through clean minimum-dependency Bun, npm/Node, and workerd consumers.

## 0.42.0

- Return complete cell stdout, stderr, display payloads, and terminal values; remove output truncation events, accounting, and profile limits.

## 0.41.4

- Decode PostgreSQL `BIGINT` sequence and tree-position values once at the client boundary, reject out-of-range JavaScript integers, and use the same decoder for runtime, schema, and test clients.
- Compare Session payloads through their canonical durable encoding and reject empty interrupted model responses before committing them, restoring cross-host retry and cancellation behavior for PostgreSQL and MySQL.

## 0.41.0

- Adopt Rika's repository policy as the workspace baseline: all 16 anti-slop rules, all 95 Effect TSGo rules, and Oxlint's correctness, performance, and suspicious defaults fail the build; Oxlint alone enforces the 500-physical-line package-source limit.
- Mirror app and package tests to their exact source paths with deterministic names, kebab-case ownership folders, and a maximum of 12 direct files or directories per governed folder.
- Normalize constructors to the owning module's canonical `make`, `register`, or `start` operation and remove superseded helper aliases. This pre-1.0 release is a clean API break and requires no SQL schema or data migration.

## 0.40.0

- Emit bounded, typed `HostCall` lifecycle events around every cell host-binding invocation, including local and remotely proxied operations.
- Encode JSON-representable cell terminal values as canonical JSON and retain inspected text for values JSON cannot represent.

## 0.39.1

- Retire the exact Bun REPL kernel generation after caller interruption kills its worker, and invalidate the Session's pooled lease before the result settles. Delayed cell effects remain suppressed, while the next execute for the same Session starts a live worker instead of reusing the killed command channel. This release changes no public API and requires no SQL schema or data migration.

## 0.39.0

- Add optional `ToolExecutor.cancel(request)` semantic cancellation with `CancellationRequest`, `CancellationOutcome`, `TerminalOutcome`, and typed `CancellationFailure`. A direct executor may narrow support with `cancellable(request)`; `ToolExecutor.route({ cancel })` and `layerRouter` select cancellation with the same first matching concrete route as execution. Existing executors remain compatible and opt in only by defining `cancel`; callbacks must be idempotent for the stable operation identity.
- Make `Runtime.cancel` durably close operation admission across the target Run tree before executor delivery. The existing operation journal now retains the exact execute request and marks cancellable tool operations `cancelling`; `RunCancelled` commits only after each executor returns definitive `Cancelled` or `AlreadyTerminal`. Callback interruption or host loss before acknowledgement is reclaimed and redelivered with the same operation key, attempt, Session, Run, root, tool-call, tool-name, and execute request without another application `Runtime.cancel` call. Host shutdown, execution interruption, and lease loss never invoke semantic cancellation and retain the existing provider-idempotent/unknown recovery behavior.
- Memory, SQLite, PostgreSQL, and MySQL share cancellation ordering, root/descendant admission-race, route-selection, lease-loss, and cross-host callback-redelivery coverage. Built-in stores require no SQL schema or data migration. Custom `RunStore` implementations must add the cancellation-operation claim and acknowledgement methods and accept the new `cancelling` and `cancelled` operation statuses.

## 0.38.4

- Validate interrupted model responses in the schema's Type-to-wire direction before the atomic failure commit. Provider metadata such as OpenRouter's `DateTime.Utc` timestamp now serializes correctly, so a terminal stream-decode failure durably settles its never-replay model operation and Run as failed instead of leaving a running operation that recovery must mark unknown. Genuinely indeterminate never-replay operations retain their existing `OperationUnknown` and `needs-resolution` behavior. This release requires no SQL schema or data migration.

## 0.38.3

- Add `ToolExecutor.replayPolicy?: (request) => "never" | "provider-idempotent"`, selected synchronously for each concrete Agent tool request before durable scheduling. Omission remains `never`; static tools, handoffs, skill activation, child/code-mode tools, client, MCP, sandbox, and non-idempotent remote routes remain non-replayable. Router policy and execution share first-match precedence, while existing `remote({ idempotent: true, ... })` routes opt into provider-idempotent recovery.
- Re-enter a crashed provider-idempotent Agent tool through its executor with the same `ToolContext.operationKey` / `idempotencyKey`, allowing a durable provider to return or reattach to the original operation instead of redispatching it. Memory, SQLite, PostgreSQL, and MySQL share crash-recovery coverage; `never` recovery still becomes unknown and requires resolution. This release requires no SQL schema or data migration.

## 0.38.2

- Complete crashed framework-tool recovery after explicit resolution: the Agent reconstructs the pending tool batch from the durable Driver checkpoint and authoritative Session history, consumes the persisted outcome through normal tool completion, and continues without redispatching the tool, weakening history validation, or manufacturing a Session result.
- Keep Runs with several unknown operations in `needs-resolution` until every unknown is resolved. Memory, SQLite, PostgreSQL, and MySQL now share this contract; this release requires no SQL schema or data migration.
- Applications upgrading directly from 0.38.0 with a custom `RunStore` must implement the claim-fenced `recoverRunningOperations` operation introduced in 0.38.1. Built-in stores require no application changes.

## 0.38.1

- Reconcile operations left `running` by a crashed execution owner before resolver or Agent entry on every Runtime host. Pure and provider-idempotent operations return to `requested`; a `never` operation becomes `unknown`, emits `OperationUnknown`, and blocks the Run in `needs-resolution` until `Runtime.resolveOperation` records an explicit decision.
- Fence recovery with the current Run claim and commit all operation repairs atomically in memory, SQLite, PostgreSQL, and MySQL. Repeated recovery is idempotent and cannot append another unknown event or start another turn. This release changes no application Runtime API and requires no SQL schema or data migration.

## 0.38.0

- Add staged exact-root admission through `Runtime.admit(input)` and transactionally idempotent release through `Runtime.activate({ runId })`. Admitted roots cannot be claimed before activation; cancellation and activation serialize in memory, SQLite, PostgreSQL, and MySQL, so cancellation that wins remains terminal and duplicate activation emits one attempt.
- Preserve `Runtime.start` as the immediate convenience and all existing typed idempotency, divergent-payload, and Run-ID conflict behavior. This release adds no SQL schema or data migration.

## 0.37.0

- Make the SQL runtime worker a scoped service that owns claim execution, cancellation, polling, health status, and idle settlement without detached fibers.
- Add a claim-admission hook so hosts can durably project each accepted claim before execution starts.
- Move Bun SQLite composition to the explicit `tenetkit/runtime/sqlite-bun` export so the generic Runtime package boundary remains platform-neutral.

## 0.36.0

- Upgrade the complete release train to Bun 1.4.0, Effect 4.0.0-rc.111, and FoldKit 0.148.2.
- Make every integration SDK an optional peer of `tenetkit`; installing Core now requires only Effect, while importing an integration subpath requires its owning SDK explicitly.
- Require Bun 1.4 for the Bun REPL implementation and release verification.

## 0.35.0

- License the workspace and all four published packages under MIT, include the license in every tarball, and make package verification reject missing or inconsistent license metadata.
- Prove the process-local `Agent.generate` path inside real workerd with structured output, finite budgets, fail-closed tool authorization, a denied side effect, and a bundle-time OpenRouter import; add the same request-scoped Worker composition as a runnable recipe.
- Emit non-empty provider-native Effect AI finish metadata unchanged on completed model-attempt telemetry. TenetKit keeps normalized token usage but does not invent a common provider billing schema or discard OpenRouter cost details.

## 0.34.2

- Claim already-running parentless roots without requiring a mailbox lane in PostgreSQL and MySQL, so `Runtime.start` executes exact dynamic roots while queued addressed roots retain lane-head serialization.
- Bind and test cancellation flags with each SQL dialect's native boolean representation. PostgreSQL now uses booleans, MySQL uses `0`/`1`, and SQLite keeps its legacy-compatible integer and text predicates.

## 0.34.1

- Export `tenetkit/runtime/external-child-placement` and `tenetkit/runtime/external-child-store` as narrow Worker-safe entrypoints. Consumers can use the cross-partition protocol without traversing the broad Runtime barrel and its Bun SQLite implementation; the packed-package smoke test now bundles both entrypoints for a browser target.

## 0.34.0

- Complete the TenetKit-owned external-child protocol for independently partitioned Threads. `ExternalChildStore.admitRoot` creates a linked depth-zero child root behind a durable activation gate; `activateRoot`, `inspectRoot`, and `cancelRoot` preserve child lifecycle authority on its partition; and `rootSettlement` plus `acknowledgeRootSettlement` provide restart-safe at-least-once terminal delivery with exact acknowledgement. Parent reservation and exactly-once settlement application remain in the existing `reserve`, `acknowledge`, `cancel`, and `settle` operations. Memory and SQLite now prove idempotent admission, pre-activation cancellation, duplicate settlement handling, and reopen recovery.

## 0.33.1

- Store SQLite cancellation flags canonically as integer `0`/`1`, while decoding rows written by Effect SQL as booleans or legacy text `"true"`/`"false"`. Cancellation reconciliation, operation/program claim release, child-capacity promotion, and external-child placement now preserve cancellation across existing Cloudflare SQLite state; the workerd contract proves integer storage and terminal `cancelled` recovery through the real RunStore path.

## 0.33.0

This release removes the retired `baton` name from every surface TenetKit owns and collapses the SQL schema to a single version-1 baseline. It is a clean break: an existing database created by an earlier release cannot be upgraded and must be recreated.

- Rename every SQL table, index, and constraint from the `baton_` prefix to `tenetkit_`. The 0.28.0 rename kept the old prefix to avoid stranding databases; that reason no longer applies, and the persisted schema now matches the project it belongs to. There is no rename migration.
- Collapse the SQL schema to one baseline at `SCHEMA_VERSION = 1` on SQLite, PostgreSQL, and MySQL. The version-7 and version-8 statement sets, their frozen checksums, and the `external_child_placements` upgrade step are deleted; every backend now creates its complete schema as migration 1, `tenetkit_runtime`, in one transaction. Dirty, checksum mismatch, unsupported forward version, and migration failure remain typed schema errors.
- Detect a foreign schema by the runtime's own table list rather than by name prefix. The prefix test would have matched the `@tenetkit/cloudflare` adapter's `tenetkit_activations` table and refused to create the baseline beside it.
- Rename the remaining brand-bearing identifiers a consumer can observe: the A2A snapshot metadata key `batonCursor` is now `tenetkitCursor`, and the REPL kernel's internal frame, cell, module, and restore filenames carry the `tenetkit-` prefix.
- Rename the `tenetkit/mcp` adapter documentation from the retired `./baton` subpath to the `./tools` subpath it has actually exported since 0.28.0.
- Enforce the removal with the `no-retired-baton-naming` ast-grep rule, which fails `check` on the retired name in any identifier, property, string literal, or comment.
- Delete the `repository-policy` and `repository-graph` scripts, their `tooling/` workspaces, and their `check` steps. A generated import-graph snapshot and a bespoke line-count walker duplicated what `oxlint`, `ast-grep`, and the type checker already enforce, and each needed its own regeneration step on every change.

## 0.32.0

- Add transaction-local Durable Object activation projection, fuel-bounded drain and exclusive-host recovery, hibernating WebSocket replay from authoritative Runtime history, and atomic external-child placement for memory and SQLite stores.
- Add the experimental Cloudflare Worker Loader sandbox adapter with validated module identity, closed capability authority, deadline, cancellation, and output bounds. CPU and subrequest values are only passed through as the Worker Loader stage contract: local `workerd` does not prove target-environment enforcement, so deployments requiring those guarantees remain disabled pending isolated Cloudflare proof.
- Decode OpenRouter persisted configuration from the pinned provider schema, preserving exact routing, provider, plugin, and trace fields while rejecting model and transport overrides, and attach the upstream model-family JSON Schema compiler for corrected tool calls.
- Export `tenetkit/transport/replay` for bounded cursor replay and preserve handler ordering across serialized hibernating WebSocket attachment updates.

## 0.31.0

- Replace the ambiguous OpenAI-compatible provider with explicit `OpenAiResponses` and `OpenAiChatCompletions` adapters. Both support custom provider identities, model strings, base URLs, credentials, request configuration, and package subpath imports; Chat Completions also decodes arbitrary JSON provider extensions without allowing configuration to override the registered model.
- Harden Amazon Bedrock Converse and ConverseStream with typed authentication, throttling, invalid-request, transport, and transient-provider failures; strict stream lifecycle validation; complete finish metadata; safe unknown-event handling; credential recovery; and interruption-owned AWS client cleanup.

## 0.30.0

- Add `@tenetkit/cloudflare` with independent Worker, Durable Object, dynamic Worker, and testing subpath exports. The first Worker surface provides request-owned Effect scopes, `ExecutionContext` and fetch adapters, and allowlisted configuration; the Durable Object surface provides Effect SQL over SQLite and an injected-SQL `RunStore` without adding another run lifecycle.
- Upgrade the workspace and all published package peers to the exact Effect `4.0.0-rc.109` cohort.

## 0.29.0

- Stop delivering a child settlement to the parent Session as model-facing user content. A settled child was projected through `deliveryPrompt` into the steering inbox, so it reached the model as a user message reading `Child run <id> settled with status <status>.` followed by the child's whole result. The parent already receives that outcome as the tool result of the call that started the child, so the settlement repeated content the model held and attributed it to the user. Settlements are now observation-only on every backend, which is what `observationEntry` and the child-settlement read operations were built for; hosts read them through `childSettlements`, `childSettlementChanges`, and `awaitChildSettlement`. `ChildSettlement.modelPrompt` is removed.

## 0.28.1

- Fix OpenAI account routes rejecting every non-streaming Responses call. The ChatGPT account endpoint answers `HTTP 400 {"detail":"Stream must be set to true"}` unless the request body sets `stream`, and only `streamText` set it, so `generateText` and `generateObject` failed outright on account credentials and auto-compaction could never produce a summary. The account client now issues every Responses request as a stream and folds the terminal `response.completed` or `response.incomplete` event into the non-streaming response, whose payload is schema-identical to one. A stream that ends without a terminal event fails typed rather than returning an empty response.
- Stop inferring the account `accept` header by scanning the serialized request body for `"stream":true`. Every account request is now `text/event-stream`.
- Fail account `createEmbedding` with a typed error. The account transport rewrites every request URL to Responses, so an embeddings call had been posting an embeddings body to the Responses endpoint.

## 0.28.0

Baton is now TenetKit. This release renames the project and replaces thirteen scoped packages with one package and two drivers. Every import changes.

- Ship `tenetkit` as a single package with subpath exports in place of `@batonfx/core`, `@batonfx/runtime`, `@batonfx/providers`, and the ten other scoped packages. `tenetkit/ai`, `tenetkit/runtime`, `tenetkit/mcp`, and the rest are subpaths of one package rather than separate installs, so importing the model providers no longer pulls the durable runtime into a bundle that never asked for it. The SQL drivers stay separate as `@tenetkit/pg` and `@tenetkit/mysql` because each carries its own database client dependency.
- Rename every brand-bearing surface a consumer can observe: error tags, service keys, telemetry span attributes, the `tenetkit-run-event-version` SSE header, the `tenetkit-tree:` cursor prefix, and the `TENETKIT_DATABASE_URL` and `TENETKIT_MYSQL_URL` environment variables. SQL table names keep their `baton_` prefix; they are persisted schema, and renaming them would strand every existing database.
- Rename the MCP tool subpath to `tenetkit/mcp/tools` and its `BatonTools` interface to `McpTools`.
- Move the dialect-agnostic runtime worker to `tenetkit/runtime/driver/sql/worker`. It had lived inside the PostgreSQL package, which left `@tenetkit/mysql` unable to export a `RuntimeWorker` at all.
- Stop re-exporting Bun-only SQLite modules from `tenetkit/runtime/driver/sql`. The barrel pulled `bun:sqlite` through its migrator and store, so importing it under Node failed outright rather than at the point of use.
- Resolve `RunClaims` in both SQL drivers. Each package re-exported a local module under that name, shadowing the runtime service it was supposed to provide.
- Exclude `packages/**/test` from the root `tsconfig.json` no longer. The exclusion silently disabled type-aware linting across every test file and hid 242 errors behind a passing gate.
- Name the root release tarball `tenetkit-<version>.tgz`. It packed as `tenetkit-tenetkit-<version>.tgz`, which no publish assertion matched.

- Scale the test suite to the machine's own parallelism instead of the two workers a kernel scope-close hang once forced, and drop the two-minute cleanup ceilings that tolerated it. The suite runs in about half the time and a cleanup regression now fails fast instead of stalling. The cancellation test watches for the suppressed side effect throughout the window rather than sleeping once past it, which is both quicker and stricter.

## 0.27.7

- Stop repeating a joined fan-out result in each member's settlement notification. The join already hands the parent every member outcome as the result of the call that started the group, so the notification delivered the same bytes a second time on a 16KB channel and arrived as a truncation notice for content the parent already held. A member of a joined fan-out now reports its status and nothing else, and a truncated standalone result names its child's terminal event — where the full result actually is — instead of a "result-handoff adapter" that exists nowhere in TenetKit.

## 0.27.6

- State what actually failed when a run ends on `DuplicateToolCallId`, `RunEndedWithoutOutput`, `MiddlewareViolation`, `TurnLimitExceeded`, `TurnPolicyStopped`, `ProgressOverflow`, or `ToolNameCollision`. Those errors carry no `message` field, so squashing their cause produced an empty string that the fallback replaced with `Agent execution failed` — every distinct defect reached the host as the same unactionable sentence and the real cause was unrecoverable from durable state. A cause carrying more than one reason now renders all of them instead of discarding its typed failures, and a bare defect reports the pretty-printed cause rather than a generic phrase.

## 0.27.4

- Spawn the Bun REPL kernel through `Bun.spawn` instead of the `node:child_process` compatibility layer. Bun's Node shim closes an extra-descriptor pipe twice when a kernel is killed while its readers are attached, which killed the host with `EXC_GUARD` on macOS and, on Linux, closed whichever descriptor number had since been reused — a live SQLite handle in practice, surfacing as `disk I/O error` and stalled turns. The kernel now owns its descriptors for the process lifetime, drops Bun's subprocess reference so an idle kernel never holds a host open, and polls the control channel on the real clock so a test clock cannot stall the handshake.

## 0.27.3

- Include the transcript digest in the durable `memory:sync` operation key so a resumed run whose compacted transcript coincidentally matches an earlier turn's message count schedules a new operation instead of dying on a persisted-operation mismatch.

## 0.27.2

- Retire a Run's published model preview frame the moment its response commits, so a committed message stops rendering twice in the TUI while the sink stays open for later attempts in the same Run.

## 0.27.1

- Escalate the conversation cache boundary to the one-hour bucket when a run idles past the five-minute cache lifetime between sends, so long tool executions and user pauses keep reading the warm prefix instead of rewriting it.

## 0.27.0

- Mark provider cache breakpoints on every conversation send: the first system message carries an Anthropic one-hour and a Bedrock cache point, later system messages the five-minute variants, and the last user or tool message its last part, capped at four breakpoints and never persisted. Callers may opt into the Anthropic top-level automatic caching field through provider config, verified against the wire before it becomes a default.
- Add `Agent.make` supplemental instructions emitted as a second system message after the primary block, preserved through Session rebuilds, resume seeding, and durable manifests.

## 0.26.2

- Compare durable Session retries by stable semantic value across persistence transformations, preserving real provider response timestamps while rejecting changed or colliding authored payloads across SQLite, PostgreSQL, and MySQL.

## 0.26.1

- Exclude provider HTTP request and response envelopes from canonical model responses, and safely hydrate v0.26 Session rows whose redacted header values were stored as empty objects without changing their durable digests.

## 0.26.0

- Store each durable model response once as canonical Session content while operations, events, checkpoints, transports, and projections carry compact verified references; consumers hydrate content through public Runtime APIs.
- Recover Session-backed and compacted no-Session model work from exact cursors and semantic request identities, preserving settled `never` outcomes, stream checkpoint advancement, current Agent instructions, and restart-safe child execution.
- Commit Session response entries, compact outcomes, semantic events, checkpoints, and notifications atomically across memory, SQLite, PostgreSQL, and MySQL, with corruption checks for reference identity, parentage, digests, payloads, and denormalized tags.
- Bound tool output inline by default with SHA-256 identity and optional immutable overflow references so large results cannot amplify durable context.

## 0.25.2

- Restore the persisted semantic turn and model-call ordinal when resuming an Agent, so suspended tool work finishes its original turn and the next provider operation advances without regenerating a conflicting durable key.
- Retain suspension through resume binding and clear it only with a durable continuation or terminal transition, preventing a crash between binding and resumed tool completion from losing the restart checkpoint.
- Settle an active failed operation before terminalizing every Run, including deferred Program children after resolver finalizers, so completed `never` operations are never re-dispatched and failures cannot leave a Run permanently active.
- Release ExecutionHost claims on every exit only after scoped resources finalize, fenced by exact owner and attempt across memory, SQLite, PostgreSQL, and MySQL; interrupted Runs become reclaimable while stale cleanup cannot clear a replacement owner.

## 0.25.1

- Keep cancelled child settlements durably observable while excluding cancellation from parent model delivery and later-Run forwarding; successful and failed settlement delivery is unchanged.

## 0.25.0

- Guarantee that every durable framework tool call reaches exactly one terminal Session outcome before its context can be reused, including truthful completed, unknown, failed, and cancelled results across memory, SQLite, PostgreSQL, and MySQL.
- Reject unresolved, duplicate, and mismatched framework tool history before provider invocation, and reject successful Run settlement while a tool call remains unresolved.

## 0.24.0

- Redefine root-pinned `TreePolicy.maxSubagents` as each parent's active direct-child capacity: exact groups may exceed it, persist excess members as queued, and promote them automatically as ready children settle without changing ordered all-settled results.
- Project durable child readiness through Run, tree, and fan-out inspection plus `ChildLinked` and `ChildReadinessChanged`, with equivalent restart-safe admission, promotion, cancellation, and blocking resume across memory, SQLite, PostgreSQL, and MySQL.

## 0.23.0

- Replace direct child Agent-pin edges with version-2 Agent selection allowlists and one version-2 executable-level pinned profile registry, enabling finite self- and mutually recursive profiles without static depth unrolling or digest cycles.
- Derive hosted child-tool availability from persisted Run depth and lifetime direct-child count, and remove Runtime's default `childRuns` / `depth` budget caps so the root-pinned `TreePolicy` is the sole hosted recursion authority.

## 0.22.0

- Add root-pinned bounded recursive subagents with derived depth, per-parent lifetime direct-child quotas, atomic exact group admission, and typed policy failures across memory, SQLite, PostgreSQL, and MySQL.
- Expose replay-safe blocking `run_child` and `run_child_group` hosted tools with durable same-parent resume, complete ordered all-settled results, recursive cancellation, and independent child key, selection, display label, prompt, origin, Run identity, and depth metadata.

## 0.21.6

- Keep the claim-wide model preview sink open across tool continuations so every model call in one execution can publish live frames; provider terminal parts still flush attempt state and final execution cleanup still clears the memory-only lane.

## 0.21.5

- Give every durable steering admission one stable `SteeringReceipt { entryId, sequence }` across idempotent retries, and journal exact `SteeringAccepted`, `SteeringConsumed`, and `SteeringDiscarded` lifecycle facts atomically with steering insertion, model-operation consumption, and terminal disposition in memory, SQLite, PostgreSQL, and MySQL.

## 0.21.4

- Replace cumulative capped model previews with bounded append frames carrying full provider-attempt identity, contiguous sequences, and per-channel UTF-16 offsets. Healthy subscribers can reconstruct output of arbitrary length without retransmission; bounded dropping delivery keeps execution independent while making loss detectable.

## 0.21.3

- Harden live previews: each Run gets its own conflated memory-only preview lane with a retained cumulative snapshot replayed to late subscribers, and a clear tombstone with a generation guard so a stale preview can never publish after commit or interruption. Subscribers register before replay with an atomic high-water so a large replay cannot overflow a bounded queue, and PostgreSQL/MySQL multi-subscriber polling advances the cursor exactly once.
- Keep exact messaging authority: child settlements, mailbox bounds, and exact-parent isolation are unchanged.

## 0.21.2

- Restore delivery of a child settlement that outlives its addressed parent Run: when the parent is terminal and never consumed the notification, the session's next Run receives it through the same exactly-once steering mechanism, so the settlement still appears in the next model turn.

## 0.21.1

- Make durable cancellation converge across stale claims, Session root trees, nested descendants, and non-replayable operation resolution, with explicit Session-wide terminal proof and startup repair of poisoned cancellation state.
- Preserve exact Run, Name, and child-settlement inbox authority while allowing only explicit Session messages to carry forward, including consistent mailbox bounds and delivery across memory, SQLite, PostgreSQL, and MySQL.

## 0.21.0

- Replace durable provider-fragment events with one digest-verified semantic model response per completed or explicitly interrupted call. `Agent.stream` retains process-local `ModelPart` output, while Runtime history, replay, AG-UI, Transport, and FoldKit consume `ModelResponseCommitted` or `ModelResponseInterrupted`.
- Make Session storage the authoritative conversation history across memory, SQLite, PostgreSQL, and MySQL, including deterministic handoff projections, stable idempotent appends, isolated spawned-child Sessions, and sequential owner takeover.
- Add bounded, cumulative, lossy Runtime previews on a non-blocking observer lane. Preview congestion cannot delay cancellation or approval, and final semantic output replaces tentative output.
- Publish Run events only after native transaction commit in every SQL dialect and settle explicit cancellation or terminal failure with one normalized partial response before the terminal Run state.

## 0.19.2

- Export `decodeConfig` from the `OpenRouter` provider namespace so consumers
  can decode persisted provider options through the package root.

## 0.19.1

- Fix the `decodeConfig` return type on the OpenRouter provider: the exported
  `Config` alias no longer includes `undefined`, so persisted provider options
  satisfy the layer options type exactly.

## 0.19.0

- Add `decodeConfig` to the OpenRouter provider so persisted provider options
  (reasoning effort and summary verbosity, sampling parameters, provider
  routing) decode into `OpenRouterLanguageModel` request configuration with the
  same strict unknown-field rejection the OpenAI provider applies.

## 0.18.3

- Persist distinct durable checkpoints when one logical Agent turn suspends more than once. Suspension checkpoints now derive their idempotent compaction-application identity from the encoded suspension itself, so a child-group join followed by a `run_child` retry in the same turn can no longer replay the first suspension's checkpoint and fail rehydration with a blank `ResumeMismatch`.
- Preserve structured terminal failures on `AgentExecutionFailure`: the runtime now carries the exact `RunBudgetExhausted` or `ResumeMismatch` value on the optional `failure` field and always produces a non-empty actionable message instead of `Cause.squash(...).message` being blank.
- Document that hosts remove the cumulative total-token safety cap by giving every agent an explicit budget without `totalTokens`, so long subagents are governed by their pinned Compaction policy instead of accumulated input charges (the Runtime fallback keeps the cap).

## 0.15.0

- Add exact durable executable registration, admission validation, and restart reconstruction from persisted registrations.
- Add finite root-tree watching that drains through root settlement, plus cross-process cancellation watching and finalizer settlement.
- Add durable Agent Program execution, including replay, approvals, cancellation, and persisted child and fan-out recovery.
- Bring MySQL durable Runtime behavior to SQLite and PostgreSQL parity, including migration, claims, steering, cancellation, and Program recovery.
- Add typed admission failures and persisted codecs for executable registrations and Runtime events.

## 0.14.2

- Accept Effect's encoded usage shape across successful model telemetry and turn-completion events in durable Runtime stores.

## 0.14.1

- Accept model finish parts after Effect's encoded form omits undefined response and token-usage fields, preserving them through durable Runtime stores and replay.

## 0.14.0

- Add `tenetkit/runtime` as the authoritative addressable Run lifecycle with replay, inspection, waits, cancellation, memory, SQLite, and PostgreSQL stores.
- Add `tenetkit/a2a` and `tenetkit/ag-ui` as protocol projections over Runtime-owned runs, and move transport and FoldKit onto the same canonical `RunEvent` stream.
- Add the durable model-turn driver, tree run budgets, and same-run agent handoffs with deterministic operation identities and typed suspension propagation.
- Expand the lockstep release train from eight to eleven public packages, publishing thirteen checksummed GitHub assets and the exact package tarballs to npm.

## 0.13.1

- Bound inline-image token estimates across fallback thresholding, recent-context cutting, and post-microcompaction fit checks while preserving text-only estimates.
- Anchor provider-reported context usage to append-only prompt descendants and invalidate it after context rewrites or replacement finishes without valid input usage.
- Suppress unchanged threshold passes only for unchanged usage and conservatively verified plain-JSON context values. Values that serialize lossily or throw during identity inspection fail open, and overflow clears suppression on every exit.

## 0.13.0

- Establish an agent-native topology across runtime, provider, and transport facades with precise Effect AI typing and workspace validation.
- Make Handoff registration structural and closed over run options, and remove the obsolete handoff run path.
- Make tool-schema services truthful by closing their requirements, preserving toolkit dispatch typing, and rejecting inherited toolkit names.
- Tighten Wire fixed and dynamic codecs and public schema predicates, removing schema type rebranding and unsafe casts.

## 0.12.0

- Persist deterministic model-attempt identities before provider construction, settle terminal stream parts even when downstream consumption stops at the boundary, and reject exhausted call ordinals before provider entry.
- Preserve completed concurrent sibling tool results before propagating suspension or failure, including bounded and unbounded execution modes.
- Validate model-emitted tool parameters before middleware, events, authorization, execution, or history. Invalid-tool correction now uses only TenetKit's precise typed signal and the active provider's exact registered tool JSON Schema compiler; generic `InvalidOutputError` values never trigger correction. OpenAI, OpenAI-compatible, Anthropic, and Amazon Bedrock support schema-backed correction. OpenRouter rejects that policy before transport because its pinned adapter does not preserve a permissive dynamic tool's compiled request schema.
- Preserve provider-reported usage from a withheld invalid-tool attempt until its terminal finish, and keep failed-attempt usage separate from the successful terminal attempt.
- Remove `ResponseIdTracker` from the TenetKit surface and mask it inside instrumented calls so Effect's hidden incremental fallback cannot issue an uninstrumented second provider request.
- Make one instrumented model call the sole owner of provider retries and invalid-tool-call correction. Consumer-visible reasoning, text, or tool-call output is an absolute replay barrier; the separate whole-Agent consumed-stream restart path is removed.
- Replace the hidden model-stream liveness backstop with optional `ModelResilience.streamIdleTimeout`. An explicit idle deadline fails with typed `ModelStreamTimeout`, retries only before output, and reports the `timeout` telemetry category.

## 0.11.14

- Resolve provider `error` parts to typed failures before telemetry and replay accounting. Transient failures now retry when only withheld response metadata preceded them, while reasoning, text, and tool-call output remain strict replay barriers. Unknown custom payloads become bounded terminal `UnknownError` values unless `ModelResilience.resolve` maps them explicitly. The same rule covers malformed non-streaming responses, preserves bounded consumed-stream restart, and keeps discarded metadata and errors out of the successful attempt.
- Normalize OpenAI, Anthropic, and OpenRouter stream failures to typed `AiError` values. Known overload, timeout, and rate-limit failures use the default retry policy; request, authentication, permission, content-policy, quota, and unknown failures remain terminal. OpenAI Responses `response.failed` payloads now take the same failure path instead of appearing as successful finish events.

## 0.11.13

- Fail a run whose last turn leaves no assistant text with `RunEndedWithoutOutput` instead of completing it with an empty answer. A provider that ends a turn after reasoning, or reports `"unknown"` because it never said why it stopped, previously produced a successful run with nothing in it. The error carries the provider's finish reason for that turn plus the text and reasoning characters the provider streamed, so a provider that produced nothing is distinguishable from text that was streamed but never committed. Structured-output runs remain judged by their schema value.
- Require `classification` on `ModelCallFailed`. Attempt-level failures carried it and call-level failures did not, so a consumer reading only the call event had to infer retryability from an absent field. Both levels now decide it the same way; they differ only when resilience refuses to replay a retryable failure because output already escaped, where the call reports `terminal`.
- Bound retries of a provider stream that emits an unreplayable part before failing every time. `Stream.retry` resets its schedule as soon as an element passes through, so a lone `response-metadata` part reset it on every attempt and a repeatedly truncating stream retried forever in a busy loop instead of failing. Unreplayable parts are now withheld until the attempt commits, which also stops a discarded attempt's response metadata from being replayed alongside the attempt that replaced it.

## 0.11.9

- Fail a model attempt whose provider stream ends without its terminal `finish` part instead of reporting it as a completed turn with no finish reason and no usage. A clean end with no `finish` now fails with `ModelStreamTruncated`, a stream that goes quiet past the liveness backstop fails with `ModelStreamStalled`, and both are classified `truncated-stream` so an attempt that emitted nothing retries.
- Reset the accumulated turn text between turns. Every turn previously appended to the same buffer, so a run's final text was the concatenation of all its intermediate narration.
- Add a truncating step to the test model so a stream that stops mid-reasoning, mid-text, or mid-tool-call can be scripted.

## 0.11.8

- Retry reactive context-overflow compaction when a provider emits response metadata before its terminal error, while still refusing to replay after assistant text or tool calls escape.

## 0.11.7

- Coalesce adjacent completed response text before committing authoritative chat history so persistence encoders and durable session entries retain the full response during replay.

## 0.11.6

- Commit model responses to authoritative chat history only after the transformed stream is fully consumed, preventing interrupted, failed, or partially consumed response prefixes from conflicting with durable replay.

## 0.11.5

- Compare durable session messages by canonical content so equivalent file data representations, including a URL object and its string value, remain aligned with authoritative Chat history.

## 0.11.4

- Allow agent tool execution policies to select explicit `"unbounded"` concurrency so independent tool calls emitted by one model turn can all start together without an arbitrary numeric cap. Missing policies remain serial by default, and positive integer policies retain bounded execution.

## 0.11.3

- Coalesce adjacent same-options text parts of a user message before it enters the persisted Chat history, and compare the durable session projection against the authoritative Chat history on coalesced messages. The provider-agnostic Chat export encodes a multi-text-part user message by keeping only the first text part, silently dropping the rest; a caller that submits a prompt plus a resolved-context block as two text parts therefore persisted a Chat history that was no longer a prefix of the session projection, failing `syncSession` with "Session projection is not a prefix of authoritative Chat history" and poisoning every later turn in the thread. Coalescing is lossless — providers already concatenate adjacent text — and keeps the persisted Chat history a faithful prefix of the session.

## 0.11.2

- Classify provider context-window overflow by semantic evidence instead of error shape. A shared `ContextOverflow` module owns detection; `ModelRegistry.classifyFailure` falls back to it for every registration, so overflow errors that fail stream-schema decoding, arrive with unexpected framing, or come from providers without a classifier still trigger reactive compaction. Responses SSE normalization now applies regardless of response content-type, joins multi-`data:`-line frames, and flattens nested errors that carry a top-level message. Also isolates the package-smoke consumer install cache so a freshly packed tarball is never masked by a same-version cache entry.

## 0.11.0

- Add stable per-run telemetry delivery IDs, an optional ordered host delivery sink, and atomic Session checkpoint telemetry outboxes with compaction commitments. Structured output events now carry the final successful model call and attempt identity. These are breaking pre-1.0 checkpoint, compaction request, telemetry event, and transport contracts.

## 0.10.1

- Modernize the eight-package release contract around committed lockstep versions, exact Effect peers, build-once npm-compatible tarballs, clean Bun and Node consumer proofs, checksums, provenance evidence, and tag-gated GitHub releases without npm publication.

## 0.10.0

- Add the public `ModelTelemetry` contract: typed model-call, attempt, retry, and compaction lifecycle events in the agent event stream. A stable `modelCallId` joins one prepared input across provider attempts, `modelAttemptId` plus a 0-based `attempt` ordinal name each provider invocation, and every `ModelPart` now carries all three (a breaking `ModelPart` and transport wire change; update fixtures and exhaustive event matches). Timestamps are sampled from the Effect Clock at real operation boundaries, usage and provider metadata stay optional (absent means unknown), failures map onto bounded provider-neutral categories, `ModelResilience` retries emit `ModelRetryScheduled` with classification and accepted backoff, and compaction passes emit started/completed/failed events linking summary work through `compactionId` and `summaryModelCallId`. Telemetry never carries prompts, model bodies, credentials, headers, or arbitrary provider error payloads.

## 0.8.0

- Add the Effect v4 Amazon Bedrock provider with Converse and ConverseStream, tool and structured-output support, signed and redacted reasoning, AWS default-chain and bearer authentication, refreshable per-request credentials, and narrowly gated coalesced expired-credential recovery. Import it as `AmazonBedrock` from `tenetkit/ai` or from `tenetkit/ai/amazon-bedrock`.

## 0.7.1

- Normalize nested OpenAI Responses SSE `error` frames to the flat shape the Effect AI stream schema expects, for both API-key and account registrations. Transient provider server errors now surface as decoded error parts carrying the provider message and request id instead of failing the stream with an `InvalidOutputError` decode error. `OpenAi.normalizeResponsesSse` is exported for custom clients.

## 0.6.0

- Default the turn policy to the new first-class `TurnPolicy.forever`, which carries a distinct portable `Forever` snapshot. Policy-free `Agent.make` no longer caps follow-up turns at eight; a run still completes naturally when a turn leaves no pending tool results. Consumers relying on the old implicit cap must opt into `TurnPolicy.recurs(8)`, and exhaustive `Snapshot` matches must add `Forever`.
- Made `Agent` opaque and invariant in its inferred Effect requirements, added scoped `Agent.provideModel`, and split persisted runs into `persisted`, `persistedObject`, `generatePersisted`, and `generatePersistedObject` entrypoints.

## 0.5.0

- Reject ambiguous static, reserved `activate_skill`, activated-skill, and Handoff tool names with schema-backed origin evidence before advertisement or execution. Use `Agent.make({ tools: [...] })` when duplicate static declarations must remain observable; pre-built Effect AI toolkits remain accepted, but `Toolkit.make` has already erased duplicate inputs.
- Preserve declared tool failures as `DomainFailure { failure, encodedFailure }`, add schema-backed stage-specific `FrameworkFailure` on the executor and run error channels, and transport framework failures through existing failed frames. This breaks exhaustive `Outcome.Failure` matches and message-only placement failure codecs; migrate to `DomainFailure` and `Effect.catchTag("tenetkit/core/FrameworkFailure", ...)`.
- Add the public Effect-native `tenetkit/mcp` OAuth lifecycle, host-owned redacted token store, typed lifecycle errors, authenticated remote transport integration, and deterministic layers.
- Add scripted reasoning parts to `tenetkit/test` with deterministic reasoning stream events and transcript projection distinct from assistant text.
- Preserve host `HttpClient` requirements in base provider, preset, fallback, and embedding constructors; use the matching explicitly named `*Fetch` convenience to retain the previous fetch-backed behavior.
- Preserve typed FoldKit connection and command failures as structured facts while leaving defects and interruption in their Effect causes; `ChatCommand` now exposes its concrete error union instead of `any`.
