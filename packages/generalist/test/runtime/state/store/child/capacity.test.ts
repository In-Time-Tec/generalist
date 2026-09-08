import { BunCrypto } from "@effect/platform-bun"
import { expect, it } from "@effect/vitest"
import { Effect, Layer, Option, Schema } from "effect"
import { Tool, Toolkit } from "effect/unstable/ai"
import { Agent } from "../../../../../src/index.js"
import { Generalist, ToolIdentity } from "../../../../../src/host/index.js"
import { layerAutoApprove } from "../../../../../src/core/policy/approvals.js"
import { layerAllowAll } from "../../../../../src/core/policy/permissions.js"
import { ObjectStore } from "../../../../../src/durability/object-store.js"
import { make as openState } from "../../../../../src/durability/internal/runtime.js"
import { RunStore } from "../../../../../src/runtime/run/store.js"
import { Runtime } from "../../../../../src/runtime/service.js"
import { familyRuns, reserveSessions } from "../../../../../src/runtime/state/store/child/capacity.js"
import { layerStatic } from "../../../../../src/runtime/executable/resolver.js"
import { layer } from "../../../../../src/testing/model/service.js"
import { makeObjectStorage, objectRuntimeLayer, objectWorkerId } from "../../../execution/object.js"
import { provideScoped } from "../../../execution/scoped-provide.js"

it.effect("retains Tool families across fresh hosts without materializing Sessions or reserving Agent capacity", () => {
  const storage = makeObjectStorage()
  const tool = Tool.make("count", { parameters: Schema.Struct({}), success: Schema.Int }).annotate(ToolIdentity, {
    implementation: "count-v1",
    policy: "count-v1",
  })
  const parent = Agent.make({ name: "parent", children: ["parent"] })
  const fresh = () =>
    Layer.mergeAll(
      objectRuntimeLayer({ addresses: [] }, storage).pipe(Layer.provide(layerStatic([]))),
      Toolkit.make(tool).toLayer({ count: () => Effect.succeed(1) }),
    layer([]),
      layerAutoApprove,
      layerAllowAll,
    )
  const options = {
    agents: [parent],
    tools: [tool],
    limits: {
      tree: { maxDepth: 1, maxSessions: 2 },
      concurrency: { agents: 1, tools: 1 },
    },
  }
  const canonical = (
    parentId: string,
    rootToolId: string,
    sponsored: ReadonlyArray<string>,
    independent: ReadonlyArray<string>,
  ) =>
    Effect.gen(function* () {
      const runtime = yield* openState({
        environment: "test",
        tenant: "runtime",
        partition: "conformance",
        addresses: [],
      })
      const state = yield* runtime.readState
      expect([...state.sessions.keys()].toSorted()).toEqual(["agent-child", "agent-session"])
      expect(state.sessions.get("agent-session")!.family!.childSessionIds).toEqual(["agent-child"])
      expect(state.sessions.get("agent-session")!.family!.runIds).toEqual([parentId])
      expect(
        familyRuns(state, parentId)
          .map((run) => run.runId)
          .toSorted(),
      ).toEqual([parentId, state.sessions.get("agent-child")!.family!.runIds[0]!, ...sponsored].toSorted())
      expect(
        familyRuns(state, rootToolId)
          .map((run) => run.runId)
          .toSorted(),
      ).toEqual(independent.toSorted())
      expect(state.runs.get(sponsored[1]!)!.parentRunId).toBe(sponsored[0])
      expect(state.runs.get(independent[1]!)!.parentRunId).toBe(rootToolId)
      yield* reserveSessions(state, state.runs.get(parentId)!, ["agent-child"])
      expect(yield* reserveSessions(state, state.runs.get(parentId)!, ["third-agent"]).pipe(Effect.flip)).toMatchObject(
        { _tag: "generalist/runtime/ChildLimitExceeded", current: 2, limit: 2 },
      )
    }).pipe(Effect.provideService(ObjectStore, storage.store), (effect) => provideScoped(BunCrypto.layer, effect))
  return Effect.gen(function* () {
    const ids = yield* Effect.gen(function* () {
      const host = yield* Generalist.create(options)
      const session = yield* host.sessions.create({ id: "agent-session" })
      const agent = yield* host.runs.start(session.id, parent, "parent")
      const first = yield* host.tools.start(tool, {}, { commandId: "first", parentRunId: agent.id })
      const nested = yield* host.tools.start(tool, {}, { commandId: "nested", parentRunId: first.id })
      const root = yield* host.tools.start(tool, {}, { commandId: "root" })
      const rootNested = yield* host.tools.start(tool, {}, { commandId: "root-nested", parentRunId: root.id })
      const store = yield* RunStore
      const agentClaim = yield* store.claimExecution({
        runId: agent.id,
        ownerId: objectWorkerId,
        commandId: "agent-claim",
      })
      expect(agentClaim.session).toBeDefined()
      const { session: _, ...runOnlyAgent } = agentClaim
      expect(
        yield* store.retryExecution({ ...runOnlyAgent, commandId: "agent-without-session" }).pipe(Effect.flip),
      ).toMatchObject({ _tag: "generalist/runtime/StaleClaim" })
      const claim = yield* store.claimExecution({ runId: first.id, ownerId: objectWorkerId, commandId: "first-claim" })
      expect(claim.session).toBeUndefined()
      expect(Option.isNone(yield* store.claimedSessionStore(claim))).toBe(true)
      expect(
        yield* store
          .retryExecution({ ...claim, session: agentClaim.session!, commandId: "tool-with-session" })
          .pipe(Effect.flip),
      ).toMatchObject({ _tag: "generalist/runtime/StaleClaim" })
      yield* store.releaseExecution(agentClaim)
      yield* store.complete({
        ...claim,
        commandId: "first-complete",
        result: { _tag: "Tool", isFailure: false, value: 1 },
      })
      yield* Runtime.use((runtime) =>
        runtime.spawn({
          parentRunId: agent.id,
          invocationId: "agent-child",
          selection: "parent",
          prompt: "child",
          sessionId: "agent-child",
        }),
      )
      return {
        parentId: agent.id,
        rootToolId: root.id,
        sponsored: [first.id, nested.id],
        independent: [root.id, rootNested.id],
      }
    }).pipe((effect) => provideScoped(fresh(), effect))
    yield* canonical(ids.parentId, ids.rootToolId, ids.sponsored, ids.independent)
    yield* Effect.gen(function* () {
      yield* Generalist.create(options)
      const store = yield* RunStore
      for (const runId of [ids.sponsored[1]!, ...ids.independent]) {
        const claim = yield* store.claimExecution({ runId, ownerId: objectWorkerId, commandId: `fresh:${runId}` })
        expect(claim.session).toBeUndefined()
        expect(Option.isNone(yield* store.claimedSessionStore(claim))).toBe(true)
        yield* store.complete({
          ...claim,
          commandId: `complete:${runId}`,
          result: { _tag: "Tool", isFailure: false, value: 1 },
        })
      }
    }).pipe((effect) => provideScoped(fresh(), effect))
    yield* canonical(ids.parentId, ids.rootToolId, ids.sponsored, ids.independent)
  })
})
