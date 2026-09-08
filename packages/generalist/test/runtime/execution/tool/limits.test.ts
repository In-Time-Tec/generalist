import { expect, it } from "@effect/vitest"
import { Deferred, Effect, Fiber, Layer, Schema } from "effect"
import { TestClock } from "effect/testing"
import { Tool, Toolkit } from "effect/unstable/ai"
import { Generalist, ToolIdentity } from "../../../../src/host/index.js"
import { layerAutoApprove } from "../../../../src/core/policy/approvals.js"
import { layerAllowAll } from "../../../../src/core/policy/permissions.js"
import { ToolContext } from "../../../../src/core/tools/tool-context.js"
import { ToolExecutor, type Outcome } from "../../../../src/core/tools/tool-executor.js"
import { layerStatic } from "../../../../src/runtime/executable/resolver.js"
import { RunExecutor } from "../../../../src/runtime/execution/run-executor.js"
import { RunStore } from "../../../../src/runtime/run/store.js"
import { limits } from "../../../../src/runtime/execution/tool/limits.js"
import { objectRuntimeLayer, objectWorkerId } from "../object.js"

const tool = Tool.make("bounded_work", { parameters: Schema.Struct({}), success: Schema.String }).annotate(
  ToolIdentity,
  { implementation: "bounded-v1", policy: "bounded-policy-v1" },
)
const environment = Layer.mergeAll(
  objectRuntimeLayer({ addresses: [] }).pipe(Layer.provide(layerStatic([]))),
  layerAllowAll,
  layerAutoApprove,
  Toolkit.make(tool).toLayer({ bounded_work: () => Effect.succeed("unused") }),
)
const execute = (runId: string) =>
  Effect.gen(function* () {
    const store = yield* RunStore
    const executor = yield* RunExecutor
    yield* executor.execute(
      yield* store.claimExecution({ runId, ownerId: objectWorkerId, commandId: `execute:${runId}` }),
    )
  })
const scopedWith = <A, E, R>(effect: Effect.Effect<A, E, R>, executor: typeof ToolExecutor.Service) =>
  Effect.scoped(
    Effect.gen(function* () {
      const context = yield* Layer.build(Layer.merge(environment, Layer.succeed(ToolExecutor, executor)))
      return yield* effect.pipe(Effect.provideContext(context))
    }),
  )

for (const [name, outcome] of [
  ["output bytes", { _tag: "Success", result: "x", encodedResult: "x".repeat(limits.outputBytes + 1) }],
  [
    "artifact count",
    {
      _tag: "Success",
      result: "ok",
      encodedResult: "ok",
      outputPaths: Array.from({ length: limits.artifactReferences + 1 }, () => "artifact:ref"),
    },
  ],
  [
    "artifact reference bytes",
    {
      _tag: "Success",
      result: "ok",
      encodedResult: "ok",
      outputPaths: ["x".repeat(limits.artifactReferenceBytes + 1)],
    },
  ],
] satisfies ReadonlyArray<readonly [string, Outcome & { readonly outputPaths?: ReadonlyArray<string> }]>) {
  it.effect(`rejects excess ${name} without persisting a fabricated typed success`, () =>
    scopedWith(
      Effect.gen(function* () {
        const host = yield* Generalist.create({ agents: [], tools: [tool] })
        const run = yield* host.tools.start(tool, {}, { commandId: "bounded" })
        yield* execute(run.id)
        expect(yield* run.inspect).toMatchObject({ status: "needs-resolution" })
        const store = yield* RunStore
        const history = yield* store.history({ runId: run.id, cursor: -1, limit: 100 })
        expect(history.some((event) => event._tag === "RunCompleted")).toBe(false)
      }),
      ToolExecutor.of({ execute: () => Effect.succeed(outcome) }),
    ),
  )
}

it.effect("declines oversized and excess diagnostics without changing the typed result", () =>
  scopedWith(
    Effect.gen(function* () {
      const host = yield* Generalist.create({ agents: [], tools: [tool] })
      const run = yield* host.tools.start(tool, {})
      yield* execute(run.id)
      expect(yield* run.await).toBe("typed result")
      const history = yield* RunStore.use((store) => store.history({ runId: run.id, cursor: -1, limit: 100 }))
      expect(history.filter((event) => event._tag === "ToolProgress")).toHaveLength(limits.progressEvents)
    }),
    ToolExecutor.of({
      execute: () =>
        Effect.gen(function* () {
          const context = yield* ToolContext
          for (let index = 0; index < limits.progressEvents; index += 1) {
            expect(yield* context.emit({ toolCallId: "untrusted", message: "progress" })).toBe(true)
          }
          expect(yield* context.emit({ toolCallId: "untrusted", message: "overflow" })).toBe(false)
          expect(yield* context.emit({ toolCallId: "untrusted", message: "x".repeat(limits.progressBytes + 1) })).toBe(
            false,
          )
          return { _tag: "Success", result: "typed result", encodedResult: "typed result" }
        }),
    }),
  ),
)

it.effect("expires a held-open external operation at its deadline without blind redispatch", () =>
  Effect.gen(function* () {
    const entered = yield* Deferred.make<void>()
    let calls = 0
    yield* scopedWith(
      Effect.gen(function* () {
        const host = yield* Generalist.create({ agents: [], tools: [tool] })
        const run = yield* host.tools.start(tool, {})
        const fiber = yield* execute(run.id).pipe(Effect.forkChild)
        yield* Deferred.await(entered)
        yield* TestClock.adjust(limits.deadlineMs)
        yield* Fiber.join(fiber)
        expect(yield* run.inspect).toMatchObject({ status: "needs-resolution" })
        expect(calls).toBe(1)
      }),
      ToolExecutor.of({
        execute: () =>
          Effect.gen(function* () {
            calls += 1
            yield* Deferred.succeed(entered, undefined)
            return yield* Effect.never
          }),
      }),
    )
  }),
)
