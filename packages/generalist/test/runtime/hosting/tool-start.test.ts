import { expect, it } from "@effect/vitest"
import { expectTypeOf } from "vitest"
import { Effect, Layer, Schema, Stream } from "effect"
import { Prompt, Tool, Toolkit } from "effect/unstable/ai"
import { Agent } from "../../../src/index.js"
import { Host, ToolIdentity } from "../../../src/host/index.js"
import { layerAutoApprove } from "../../../src/core/policy/approvals.js"
import { layerAllowAll } from "../../../src/core/policy/permissions.js"
import { layer, text } from "../../../src/testing/model/service.js"
import { layerStatic } from "../../../src/runtime/executable/resolver.js"
import { RunStore } from "../../../src/runtime/run/store.js"
import { Runtime } from "../../../src/runtime/service.js"
import { RunExecutor } from "../../../src/runtime/execution/run-executor.js"
import { digest } from "../../../src/runtime/run/steering.js"
import { makeObjectStorage, objectRuntimeLayer, objectWorkerId } from "../execution/object.js"
import { provideScoped } from "../execution/scoped-provide.js"
import { executeProgramFixture, programAddress, programExecutable, programFixture } from "../program/fixture.js"
import { registrationsFor } from "../execution/fixtures.js"

const tool = Tool.make("lookup", {
  parameters: Schema.Struct({ count: Schema.FiniteFromString }),
  success: Schema.FiniteFromString,
}).annotate(ToolIdentity, { implementation: "lookup-v1", policy: "lookup-v1" })
const other = Tool.make("other", { success: Schema.String }).annotate(ToolIdentity, {
  implementation: "other-v1",
  policy: "other-v1",
})
const execute = (runId: string) =>
  Effect.gen(function* () {
    const store = yield* RunStore
    const executor = yield* RunExecutor
    yield* executor.execute(
      yield* store.claimExecution({ runId, ownerId: objectWorkerId, commandId: `execute:${runId}` }),
    )
  })

it.effect("retrieves Tools on a fresh Host and rejects Agent controls without canonical writes", () => {
  const storage = makeObjectStorage()
  const fresh = () =>
    Layer.mergeAll(
      objectRuntimeLayer({ addresses: [] }, storage).pipe(Layer.provide(layerStatic([]))),
      Toolkit.make(tool, other).toLayer({
        lookup: ({ count }) => Effect.succeed(count + 1),
        other: () => Effect.succeed("other"),
      }),
      layerAutoApprove,
      layerAllowAll,
    )
  return Effect.gen(function* () {
    const runId = yield* Effect.gen(function* () {
      const host = yield* Host.make({ revision: "local", agents: [], tools: [tool, other] })
      return (yield* host.tools.start(tool, { count: 4 }, { commandId: "lookup" })).id
    }).pipe((effect) => provideScoped(fresh(), effect))
    yield* Effect.gen(function* () {
      const host = yield* Host.make({ revision: "local", agents: [], tools: [tool, other] })
      const runtime = yield* Runtime
      const store = yield* RunStore
      const prefix = "environments/test/v1/tenants/runtime/partitions/conformance/commits/"
      const before = yield* storage.store.list(prefix)
      expect(before.cursor).toBeUndefined()
      const run = yield* host.tools.get(tool, runId)
      expectTypeOf<Effect.Success<typeof run.await>>().toEqualTypeOf<number>()
      expect("send" in run).toBe(false)
      expect("spawn" in run).toBe(false)
      expect(yield* host.runs.get(runId).pipe(Effect.flip)).toMatchObject({
        _tag: "generalist/runtime/RunKindUnsupported",
        operation: "getRun",
        kind: "Tool",
      })
      expect(yield* runtime.getRun(runId).pipe(Effect.flip)).toMatchObject({
        _tag: "generalist/runtime/RunKindUnsupported",
        kind: "Tool",
      })
      expect(yield* host.tools.get(other, runId).pipe(Effect.flip)).toMatchObject({
        _tag: "generalist/runtime/ExecutableRegistrationInvalid",
      })
      expect(
        yield* runtime
          .spawn({ parentRunId: runId, invocationId: "unsupported-child", selection: "child", prompt: "unsupported" })
          .pipe(Effect.flip),
      ).toMatchObject({ _tag: "generalist/runtime/ChildSelectionMissing" })
      for (const policy of ["steer", "interrupt", "rollback", "reject"] as const) {
        expect(
          yield* runtime.send(runId, "unsupported", { policy, idempotencyKey: policy }).pipe(Effect.flip),
        ).toMatchObject({ _tag: "generalist/runtime/RunKindUnsupported", operation: "steer" })
        const admission = {
          runId,
          idempotencyKey: `direct:${policy}`,
          policy,
          prompt: Prompt.make("unsupported"),
          from: { system: true as const },
        }
        expect(yield* store.admitSteering({ ...admission, digest: digest(admission) }).pipe(Effect.flip)).toMatchObject(
          { _tag: "generalist/runtime/RunKindUnsupported", operation: "steer" },
        )
        if (policy === "rollback")
          expect(
            yield* store
              .admitRollback({ ...admission, digest: digest(admission), branchRunId: "tool-rollback" })
              .pipe(Effect.flip),
          ).toMatchObject({ _tag: "generalist/runtime/RunKindUnsupported" })
      }
      expect(yield* runtime.fork(runId, { commandId: "fork", atSequence: 0 }).pipe(Effect.flip)).toMatchObject({
        _tag: "generalist/runtime/RunKindUnsupported",
        operation: "fork",
      })
      expect(yield* runtime.rewind(runId, { commandId: "rewind", toSequence: 0 }).pipe(Effect.flip)).toMatchObject({
        _tag: "generalist/runtime/RunKindUnsupported",
        operation: "rewind",
      })
      expect(
        yield* store
          .rewind({ runId, commandId: "direct-rewind", branchRunId: "direct-rewind", toSequence: 0 })
          .pipe(Effect.flip),
      ).toMatchObject({ _tag: "generalist/runtime/RunKindUnsupported", operation: "rewind" })
      expect(yield* storage.store.list(prefix)).toEqual(before)
      expect((yield* store.loadExecution(runId)).continuation).toBeUndefined()
      expect(yield* store.pendingSteering({ runId, limit: 64 })).toEqual([])
      yield* execute(runId)
      expect(yield* run.await).toBe(5)
      expect(yield* (yield* host.tools.get(tool, runId)).await).toBe(5)
      expect((yield* run.events.pipe(Stream.runCollect)).at(-1)).toMatchObject({
        _tag: "RunCompleted",
        result: { _tag: "Tool", value: 5 },
      })
      expect(yield* runtime.getRun(runId).pipe(Effect.flip)).toMatchObject({
        _tag: "generalist/runtime/RunKindUnsupported",
      })
    }).pipe((effect) => provideScoped(fresh(), effect))
  })
})

it.effect("preserves Agent and Program retrieval with their own terminal values", () => {
  const fixture = programFixture()
  const agent = Agent.make({ name: "lookup-agent" })
  return Effect.gen(function* () {
    const host = yield* Host.make({ revision: "local", agents: [agent], tools: [tool] })
    const session = yield* host.sessions.create({ id: "lookup-agent" })
    const run = yield* host.runs.start(session.id, agent, "answer")
    yield* execute(run.id)
    expect(yield* (yield* host.runs.get(run.id)).await).toBe("agent-result")
    const programId = yield* executeProgramFixture
    expect(yield* (yield* host.runs.get(programId)).await).toBe("value:1|value:1")
    for (const id of [run.id, programId])
      expect(yield* host.tools.get(tool, id).pipe(Effect.flip)).toMatchObject({
        _tag: "generalist/runtime/RunKindUnsupported",
        operation: "getTool",
      })
  }).pipe((effect) =>
    provideScoped(
      Layer.mergeAll(
        objectRuntimeLayer({
          addresses: [
            {
              address: programAddress,
              executable: programExecutable,
              registrations: registrationsFor(programExecutable),
            },
          ],
        }).pipe(Layer.provide(fixture.resolverLayer)),
        Toolkit.make(tool).toLayer({ lookup: ({ count }) => Effect.succeed(count) }),
        layerAutoApprove,
        layerAllowAll,
        layer([text("agent-result")]),
      ),
      effect,
    ),
  )
})
