import { expect, it } from "@effect/vitest"
import { Effect, Layer, Stream } from "effect"
import { LanguageModel, Prompt, Response, Toolkit } from "effect/unstable/ai"
import { Agent, Approvals, Permissions } from "../../src/index.js"
import { ExecutableResolver, RunExecutor, RunStore, Runtime } from "../../src/runtime/index.js"
import { Runtime as SqliteRuntime } from "../../src/runtime/sqlite-bun.js"
import {
  layer as learningLayer,
  proposeWithModel,
  type ApplyHandlers,
  type Proposal,
  type Proposer,
} from "../../src/unstable/learning/index.js"
import { TestModel } from "../../src/testing/index.js"
import type { Trajectory } from "../../src/trajectory/index.js"
import { provideScoped } from "../runtime/execution/scoped-provide.js"
import { tempDbPath } from "../runtime/sql/scenario.js"

const usage = Response.Usage.make({
  inputTokens: { total: 1, uncached: 1, cacheRead: undefined, cacheWrite: undefined },
  outputTokens: { total: 1, text: 1, reasoning: undefined },
})

const model = Layer.effect(
  LanguageModel.LanguageModel,
  LanguageModel.make({
    generateText: () => Effect.succeed([{ type: "text", text: "unused" }]),
    streamText: () =>
      Stream.fromIterable<Response.StreamPartEncoded>([
        Response.makePart("text-delta", { id: "learning", delta: "done" }),
        Response.makePart("finish", { reason: "stop", usage, response: undefined }),
      ]),
  }),
)

const agent = Agent.make({ name: "learning-approval", toolkit: Toolkit.empty })

const runtimeLayer = Runtime.layerMemory({ addresses: [], scheduler: { pollInterval: "1 hour" } }).pipe(
  Layer.provide(ExecutableResolver.layerStatic([]).pipe(Layer.orDie)),
)

const trajectory: Trajectory = {
  runId: "run:learning-model",
  agent: "learning-model",
  input: Prompt.make("review this run"),
  output: "done",
  turns: [
    {
      prompt: Prompt.make("review this run"),
      response: {
        content: [
          Response.makePart("text", { text: "done" }),
          Response.makePart("finish", { reason: "stop", usage, response: undefined }),
        ],
        usage,
        finishReason: "stop",
      },
      toolCalls: [],
      usage: [],
    },
  ],
  stopReason: "stop",
  gates: [],
}

const sqliteLayer = (filename: string) =>
  SqliteRuntime.layerSqlite({ filename, addresses: [], scheduler: { pollInterval: "1 hour" } }).pipe(
    Layer.provide(ExecutableResolver.layerStatic([]).pipe(Layer.orDie)),
  )

const handlers = (apply: (proposal: Proposal) => Effect.Effect<void>): ApplyHandlers => ({
  RefineInstruction: apply,
  AuthorSkill: apply,
  Remember: apply,
  ExportTrajectory: apply,
})

const registration = (
  runtime: Runtime.Service,
  approvals: Layer.Layer<Approvals.Approvals>,
  propose: Proposer["propose"],
  apply: ApplyHandlers,
) =>
  Layer.mergeAll(
    model,
    Permissions.layerAllowAll,
    approvals,
    learningLayer({ propose, apply }).pipe(
      Layer.provide(Layer.merge(Layer.succeed(Runtime.Runtime, runtime), approvals)),
    ),
  )

it.effect("asks the configured model for Schema-decoded proposals", () =>
  Effect.gen(function* () {
    const fixture = yield* TestModel.make([
      TestModel.object({
        proposals: [{ _tag: "ExportTrajectory", runId: trajectory.runId, format: "jsonl" }],
      }),
    ])
    const propose = proposeWithModel({ model: fixture.layer, maxProposals: 1 })

    expect(yield* propose(trajectory)).toEqual([{ _tag: "ExportTrajectory", runId: trajectory.runId, format: "jsonl" }])
    expect((yield* fixture.requests)[0]?.operation).toBe("generateObject")
  }),
)

it.effect("journals and applies an approved proposal exactly once", () => {
  const requests: Array<Approvals.Pending> = []
  let proposeCalls = 0
  let applyCalls = 0
  const approvals = Approvals.layerTest({
    resolve: (pending) =>
      Effect.sync(() => {
        requests.push(pending)
        return Approvals.Approved()
      }),
  })
  return provideScoped(
    runtimeLayer,
    Effect.gen(function* () {
      const runtime = yield* Runtime.Runtime
      const executor = yield* RunExecutor.RunExecutor
      const store = yield* RunStore.RunStore
      const propose: Proposer["propose"] = (completed) =>
        Effect.sync(() => {
          proposeCalls += 1
          return [{ _tag: "ExportTrajectory", runId: completed.runId, format: "jsonl" }]
        })
      const apply = handlers(() =>
        Effect.sync(() => {
          applyCalls += 1
        }),
      )
      const context = yield* Layer.build(registration(runtime, approvals, propose, apply))
      yield* runtime.register(agent).pipe(Effect.provideContext(context))
      const handle = yield* runtime.start(agent, "finish and learn", {
        sessionId: "session:learning-approved",
        idempotencyKey: "learning-approved",
      })

      yield* executor.execute(yield* store.claimExecution({ runId: handle.runId, ownerId: "learning-approved" }))

      expect(yield* handle.await).toBe("done")
      expect(proposeCalls).toBe(1)
      expect(applyCalls).toBe(1)
      expect(requests).toHaveLength(1)
      expect(requests[0]).toMatchObject({
        level: "ask",
        call: {
          name: "learning",
          params: { _tag: "ExportTrajectory", runId: handle.runId, format: "jsonl" },
        },
      })
      expect(
        yield* store.getOperationByKey({ runId: handle.runId, operationKey: `learning:${handle.runId}#0` }),
      ).toMatchObject({ status: "succeeded", replayPolicy: "pure" })
      expect(
        yield* store.getOperationByKey({ runId: handle.runId, operationKey: `learning:${handle.runId}#1` }),
      ).toMatchObject({ status: "succeeded", replayPolicy: "never" })
    }),
  )
})

it.effect("journals a denied proposal reason without applying it", () => {
  const requests: Array<Approvals.Pending> = []
  let applyCalls = 0
  const approvals = Approvals.layerTest({
    resolve: (pending) =>
      Effect.sync(() => {
        requests.push(pending)
        return Approvals.Denied({ reason: "insufficient evidence" })
      }),
  })
  return provideScoped(
    runtimeLayer,
    Effect.gen(function* () {
      const runtime = yield* Runtime.Runtime
      const executor = yield* RunExecutor.RunExecutor
      const store = yield* RunStore.RunStore
      const propose: Proposer["propose"] = (completed) =>
        Effect.succeed([{ _tag: "ExportTrajectory", runId: completed.runId, format: "jsonl" }])
      const apply = handlers(() =>
        Effect.sync(() => {
          applyCalls += 1
        }),
      )
      const context = yield* Layer.build(registration(runtime, approvals, propose, apply))
      yield* runtime.register(agent).pipe(Effect.provideContext(context))
      const handle = yield* runtime.start(agent, "finish without learning", {
        sessionId: "session:learning-denied",
        idempotencyKey: "learning-denied",
      })

      yield* executor.execute(yield* store.claimExecution({ runId: handle.runId, ownerId: "learning-denied" }))

      expect(yield* handle.await).toBe("done")
      expect(applyCalls).toBe(0)
      expect(requests).toHaveLength(1)
      expect(
        yield* store.getOperationByKey({ runId: handle.runId, operationKey: `learning:${handle.runId}#1` }),
      ).toMatchObject({
        status: "failed",
        error: {
          _tag: "generalist/core/NestedOperationDenied",
          capability: "learning",
          reason: "insufficient evidence",
        },
      })
    }),
  )
})

it.live("recovers a pending proposal, approves it through the operator, and applies it once", () => {
  const filename = tempDbPath("learning-recovery")
  const requests: Array<Approvals.Pending> = []
  const approvals = Approvals.layerTest({
    resolve: (pending) =>
      Effect.sync(() => {
        requests.push(pending)
        return pending
      }),
  })
  let proposeCalls = 0
  let recoveredProposeCalls = 0
  let applyCalls = 0

  return Effect.gen(function* () {
    const suspended = yield* provideScoped(
      sqliteLayer(filename),
      Effect.gen(function* () {
        const runtime = yield* Runtime.Runtime
        const executor = yield* RunExecutor.RunExecutor
        const store = yield* RunStore.RunStore
        const propose: Proposer["propose"] = (completed) =>
          Effect.sync(() => {
            proposeCalls += 1
            return [{ _tag: "ExportTrajectory", runId: completed.runId, format: "jsonl" }]
          })
        const apply = handlers(() =>
          Effect.sync(() => {
            applyCalls += 1
          }),
        )
        const context = yield* Layer.build(registration(runtime, approvals, propose, apply))
        yield* runtime.register(agent).pipe(Effect.provideContext(context))
        const handle = yield* runtime.start(agent, "finish after approval", {
          sessionId: "session:learning-recovery",
          idempotencyKey: "learning-recovery",
        })

        yield* executor.execute(
          yield* store.claimExecution({ runId: handle.runId, ownerId: "learning-before-restart" }),
        )

        expect(yield* runtime.inspect(handle.runId)).toMatchObject({
          status: "waiting",
          suspension: { _tag: "generalist/core/NestedOperationSuspended" },
        })
        expect(requests).toHaveLength(1)
        expect(proposeCalls).toBe(1)
        expect(applyCalls).toBe(0)
        expect((yield* runtime.operator.explain(handle.runId)).decision).toEqual({
          _tag: "AwaitApproval",
          token: requests[0]!.token,
        })
        return { runId: handle.runId, token: requests[0]!.token }
      }),
    )

    yield* provideScoped(
      sqliteLayer(filename),
      Effect.gen(function* () {
        const runtime = yield* Runtime.Runtime
        const executor = yield* RunExecutor.RunExecutor
        const store = yield* RunStore.RunStore
        const propose: Proposer["propose"] = () =>
          Effect.sync(() => {
            recoveredProposeCalls += 1
            return []
          })
        const apply = handlers(() =>
          Effect.sync(() => {
            applyCalls += 1
          }),
        )
        const context = yield* Layer.build(registration(runtime, approvals, propose, apply))
        yield* runtime.register(agent).pipe(Effect.provideContext(context))

        expect((yield* runtime.operator.explain(suspended.runId)).decision).toEqual({
          _tag: "AwaitApproval",
          token: suspended.token,
        })
        yield* runtime.operator
          .resolveApproval(suspended.token, Approvals.Approved(), "operator:learning-recovery")
          // oxlint-disable-next-line effecttsgo/strict-effect-provide -- The test owns this short-lived in-memory RuleStore Layer.
          .pipe(Effect.provide(Permissions.layerRuleStoreMemory()))
        yield* executor.execute(
          yield* store.claimExecution({ runId: suspended.runId, ownerId: "learning-after-restart" }),
        )

        expect(yield* runtime.inspect(suspended.runId)).toMatchObject({ status: "succeeded" })
        expect(proposeCalls).toBe(1)
        expect(recoveredProposeCalls).toBe(0)
        expect(applyCalls).toBe(1)
        expect(
          yield* store.getOperationByKey({
            runId: suspended.runId,
            operationKey: `learning:${suspended.runId}#1`,
          }),
        ).toMatchObject({ status: "succeeded", replayPolicy: "never" })
        const [action] = (yield* store.recoveryJournal(suspended.runId)).actions
        expect(action).toMatchObject({
          operator: "operator:learning-recovery",
          action: { _tag: "ResolveApproval", token: suspended.token },
        })
      }),
    )
  })
})
