import { register as registerProjection } from "./session/projection-suite.js"
import "./session/terminalization-suite.js"
import { expect, it } from "@effect/vitest"
import { Effect, Layer, Option, Schema, Stream } from "effect"
import { LanguageModel, Response, Tool, Toolkit } from "effect/unstable/ai"
import { Agent, ExecutableManifest, ToolExecutor } from "../../../src/index.js"
import { Address, ChildRuns, ExecutableResolver } from "../../../src/runtime/index.js"
import * as Runtime from "../../../src/runtime/engine.js"
import { RunStore } from "../../../src/runtime/run/store.js"
import { RunExecutor } from "../../../src/runtime/execution/run-executor.js"
import type { RunEvent } from "../../../src/runtime/run/event.js"
import { registrationsFor } from "../execution/fixtures.js"
import { makeObjectStorage, objectRuntimeLayer, objectWorkerId } from "../execution/object.js"
import { pinnedTestAgent } from "../run/identity.js"
import { provideScoped } from "../execution/scoped-provide.js"

import { allowAllAuthorization } from "../../authorization.js"

registerProjection({ makeObjectStorage })
const probeParameters = Schema.Struct({ marker: Schema.String })
const probe = Tool.make("linear_storage_probe", {
  parameters: probeParameters,
  success: Schema.String,
})
const finish = Response.makePart("finish", {
  reason: "stop",
  usage: Response.Usage.make({
    inputTokens: { total: 1, uncached: 1, cacheRead: undefined, cacheWrite: undefined },
    outputTokens: { total: 1, text: 1, reasoning: undefined },
  }),
  response: undefined,
})

const childCount = 4
const callsPerChild = 10
const parentMarker = (call: number) => `linear-parent-model-${call.toString().padStart(2, "0")}`
const childMarker = (childIndex: number, call: number) =>
  `linear-child-${childIndex}-model-${call.toString().padStart(2, "0")}`

interface FourChildAdmission {
  readonly parentRunId: string
  readonly fanOutId: string
  readonly childRunIds: ReadonlyArray<string>
}

const boundedFailureEvidence = (events: ReadonlyArray<RunEvent>) =>
  events
    .filter(
      (event): event is Extract<RunEvent, { readonly _tag: "RunFailed" | "OperationUnknown" }> =>
        event._tag === "RunFailed" || event._tag === "OperationUnknown",
    )
    .slice(-8)
    .map((event) => {
      if (event._tag === "OperationUnknown") return { _tag: event._tag, operationId: event.operationId }
      const message = event.error.message?.slice(0, 256)
      const failure = {
        _tag: event._tag,
        errorTag: event.error._tag,
      }
      return message === undefined ? failure : { ...failure, message }
    })

const makeFourChildFixture = () => {
  const storage = makeObjectStorage()
  const parent = Agent.make({ name: "linear-four-child-parent", toolkit: Toolkit.make(probe) })
  const child = Agent.make({
    name: "linear-four-child-worker",
    toolkit: Toolkit.make(probe),
  })
  const parentPinned = pinnedTestAgent(parent, "linear-four-child-v1", [{ selection: "worker" }])
  const childPinned = pinnedTestAgent(child, "linear-four-child-v1")
  const entries = [parentPinned, childPinned].map((entry) => ({ _tag: "Agent" as const, ...entry }))
  const profiles = [{ selection: "worker", agent: childPinned.pin }]
  const parentExecutable = ExecutableManifest.make({ root: parentPinned.pin, profiles, entries })
  const parentRef: ExecutableManifest.PinnedExecutable & ExecutableManifest.ExecutableRef = {
    ...parentExecutable,
    ...parentExecutable.ref,
  }
  const childExecutable = ExecutableManifest.make({
    root: parentPinned.pin,
    active: childPinned.pin,
    profiles,
    entries,
  })
  const childRef: ExecutableManifest.PinnedExecutable & ExecutableManifest.ExecutableRef = {
    ...childExecutable,
    ...childExecutable.ref,
  }
  const address = Address.make("agent:linear-four-child")
  const parentCalls: Array<string> = []
  const childCalls = Array.from({ length: childCount }, () => 0)
  const childToolCalls = Array.from({ length: childCount }, () => 0)
  const parentModel = Layer.effect(
    LanguageModel.LanguageModel,
    LanguageModel.make({
      generateText: () => Effect.succeed([{ type: "text", text: "unused" }]),
      streamText: (options) => {
        const call = parentCalls.length
        parentCalls.push(JSON.stringify(options.prompt.content))
        if (call > 1) return Stream.die(new Error(`unexpected parent model call ${call}`))
        return Stream.fromIterable<Response.StreamPartEncoded>(
          call === 0
            ? [
                Response.makePart("tool-call", {
                  id: "linear-four-child-group",
                  name: ChildRuns.runGroupToolName,
                  params: {
                    concurrency: childCount,
                    members: Array.from({ length: childCount }, (_, childIndex) => ({
                      key: `worker-${childIndex}`,
                      selection: "worker",
                      label: childIndex === 0 ? parentMarker(0) : `Worker ${childIndex}`,
                      prompt: `linear-child-${childIndex}-request`,
                    })),
                  },
                  providerExecuted: false,
                }),
                finish,
              ]
            : [
                Response.makePart("text-start", { id: "linear-four-child-answer" }),
                Response.makePart("text-delta", { id: "linear-four-child-answer", delta: parentMarker(1) }),
                Response.makePart("text-end", { id: "linear-four-child-answer" }),
                finish,
              ],
        )
      },
    }),
  )
  const childModel = Layer.effect(
    LanguageModel.LanguageModel,
    LanguageModel.make({
      generateText: () => Effect.succeed([{ type: "text", text: "unused" }]),
      streamText: (options) => {
        const serialized = JSON.stringify(options.prompt.content)
        const childIndex = Array.from({ length: childCount }, (_, index) => index).find((index) =>
          serialized.includes(`linear-child-${index}-request`),
        )
        if (childIndex === undefined) return Stream.die(new Error("child model prompt has no child identity"))
        const call = childCalls[childIndex]!
        childCalls[childIndex] = call + 1
        if (call >= callsPerChild) {
          return Stream.die(new Error(`unexpected child ${childIndex} model call ${call}`))
        }
        for (let prior = 0; prior < call; prior += 1) {
          const priorMarker = childMarker(childIndex, prior)
          if (!serialized.includes(priorMarker) || !serialized.includes(`observed:${priorMarker}`)) {
            return Stream.die(new Error(`child ${childIndex} model call ${call} is missing ${priorMarker}`))
          }
        }
        const marker = childMarker(childIndex, call)
        return Stream.fromIterable<Response.StreamPartEncoded>(
          call + 1 < callsPerChild
            ? [
                Response.makePart("tool-call", {
                  id: `linear-child-${childIndex}-call-${call.toString().padStart(2, "0")}`,
                  name: "linear_storage_probe",
                  params: { marker },
                  providerExecuted: false,
                }),
                finish,
              ]
            : [
                Response.makePart("text-start", { id: `linear-child-${childIndex}-answer` }),
                Response.makePart("text-delta", { id: `linear-child-${childIndex}-answer`, delta: marker }),
                Response.makePart("text-end", { id: `linear-child-${childIndex}-answer` }),
                finish,
              ],
        )
      },
    }),
  )
  const executor = ToolExecutor.layerTest({
    execute: (request) =>
      Effect.sync(() => {
        const marker = Schema.decodeUnknownOption(probeParameters)(request.call.params).pipe(Option.getOrThrow).marker
        const match = /^linear-child-(\d)-model-\d{2}$/.exec(marker)
        if (match === null) throw new Error(`unexpected probe marker ${marker}`)
        childToolCalls[Number(match[1])]! += 1
        return { _tag: "Success" as const, result: `observed:${marker}`, encodedResult: `observed:${marker}` }
      }),
  })
  const handlers = Toolkit.make(probe).toLayer({
    linear_storage_probe: () => Effect.die("ToolExecutor test layer owns execution"),
  })
  const resolverLayer = ExecutableResolver.layerStatic([
    { executable: parentRef, agent: Agent.close(parent, Layer.mergeAll(allowAllAuthorization, parentModel, handlers)) },
    {
      executable: childRef,
      agent: Agent.close(child, Layer.mergeAll(allowAllAuthorization, childModel, executor, handlers)),
    },
  ]).pipe(Layer.orDie)
  return {
    address,
    runtimeLayer: () =>
      objectRuntimeLayer(
        {
          addresses: [{ address, executable: parentRef, registrations: registrationsFor(parentRef) }],
          scheduler: { pollInterval: "1 day" },
        },
        storage,
      ).pipe(Layer.provide(resolverLayer)),
    counts: () => ({
      parentCalls: parentCalls.length,
      childCalls: [...childCalls],
      childToolCalls: [...childToolCalls],
    }),
    resumedParentPrompt: () => parentCalls[1],
  }
}

it.live("preserves 42 provider-free model calls across four durable children and an object-storage reopen", () =>
  Effect.gen(function* () {
    const fixture = makeFourChildFixture()
    yield* Effect.scoped(provideScoped(fixture.runtimeLayer(), Effect.void))

    const admitted = yield* Effect.scoped(
      provideScoped(
        fixture.runtimeLayer(),
        Effect.gen(function* () {
          const runtime = yield* Runtime.Runtime
          const host = yield* RunExecutor
          const store = yield* RunStore
          const parent = yield* runtime.send({
            to: fixture.address,
            sessionId: "session:linear-four-child",
            idempotencyKey: "linear-four-child",
            prompt: "Run the four-child durable storage proof.",
            treePolicy: { maxDepth: 1, maxSessions: 1024, concurrency: { agents: 4, tools: 1024 } },
          })
          yield* host.execute(
            yield* store.claimExecution({
              commandId: "runtime-state-session-store-test-ts-claim-parent-before",
              runId: parent.runId,
              ownerId: objectWorkerId,
            }),
          )
          expect(yield* runtime.inspect(parent.runId)).toMatchObject({ status: "waiting" })
          const history = yield* runtime.history({ runId: parent.runId, limit: 200 })
          const fanOut = history.find((event) => event._tag === "FanOutAdmitted")
          if (fanOut?._tag !== "FanOutAdmitted") return yield* Effect.die("four-child group was not admitted")
          const group = yield* runtime.inspectFanOut(fanOut.fanOutId)
          expect(group.members).toHaveLength(4)
          expect(group.members.map((member) => member.ordinal)).toEqual([0, 1, 2, 3])
          expect(group.members.map((member) => member.readiness)).toEqual(["ready", "ready", "ready", "ready"])
          const childRunIds = group.members.map((member) => member.childRunId)
          yield* Effect.forEach(
            childRunIds.slice(0, 2),
            (runId) =>
              store
                .claimExecution({
                  commandId: `runtime-state-session-store-test-ts-claim-child-before-${runId}`,
                  runId,
                  ownerId: objectWorkerId,
                })
                .pipe(Effect.flatMap((claim) => host.execute(claim))),
            { concurrency: "unbounded", discard: true },
          )
          expect((yield* runtime.inspect(parent.runId)).status).toBe("waiting")
          const childStatuses = yield* Effect.forEach(childRunIds, (runId) =>
            runtime.inspect(runId).pipe(Effect.map((run) => run.status)),
          )
          if (childStatuses.some((status) => status !== "succeeded" && status !== "queued")) {
            const evidence = yield* Effect.forEach(childRunIds, (runId) =>
              runtime.inspect(runId).pipe(
                Effect.flatMap((run) =>
                  runtime.history({ runId, cursor: Math.max(-1, run.lastSequence - 64), limit: 64 }),
                ),
                Effect.map(boundedFailureEvidence),
              ),
            )
            const details = (yield* Schema.encodeEffect(Schema.fromJsonString(Schema.Unknown))({
              statuses: childStatuses,
              evidence,
            }).pipe(Effect.orDie)).slice(0, 4096)
            return yield* Effect.die(new Error(`four-child execution evidence: ${details}`))
          }
          expect(childStatuses).toEqual(["succeeded", "succeeded", "queued", "queued"])
          return { parentRunId: parent.runId, fanOutId: fanOut.fanOutId, childRunIds } satisfies FourChildAdmission
        }),
      ),
    )

    expect(fixture.counts()).toEqual({
      parentCalls: 1,
      childCalls: [10, 10, 0, 0],
      childToolCalls: [9, 9, 0, 0],
    })

    yield* Effect.scoped(
      provideScoped(
        fixture.runtimeLayer(),
        Effect.gen(function* () {
          const runtime = yield* Runtime.Runtime
          const host = yield* RunExecutor
          const store = yield* RunStore
          expect(
            yield* Effect.forEach(admitted.childRunIds, (runId) =>
              runtime.inspect(runId).pipe(Effect.map((run) => run.status)),
            ),
          ).toEqual(["succeeded", "succeeded", "queued", "queued"])
          yield* Effect.forEach(
            admitted.childRunIds.slice(2),
            (runId) =>
              store
                .claimExecution({
                  commandId: `runtime-state-session-store-test-ts-claim-child-after-${runId}`,
                  runId,
                  ownerId: objectWorkerId,
                })
                .pipe(Effect.flatMap((claim) => host.execute(claim))),
            { concurrency: "unbounded", discard: true },
          )
          const resumedParent = yield* runtime.inspect(admitted.parentRunId)
          if (resumedParent.status !== "running") {
            const runIds = [admitted.parentRunId, ...admitted.childRunIds]
            const evidence = yield* Effect.forEach(runIds, (runId) =>
              runtime.inspect(runId).pipe(
                Effect.flatMap((run) =>
                  runtime.history({ runId, cursor: Math.max(-1, run.lastSequence - 64), limit: 64 }),
                ),
                Effect.map(boundedFailureEvidence),
              ),
            )
            const details = (yield* Schema.encodeEffect(Schema.fromJsonString(Schema.Unknown))({
              status: resumedParent.status,
              evidence,
            }).pipe(Effect.orDie)).slice(0, 4096)
            return yield* Effect.die(new Error(`four-child recovery evidence: ${details}`))
          }
          expect(resumedParent.status).toBe("running")
          yield* host.execute(
            yield* store.claimExecution({
              commandId: "runtime-state-session-store-test-ts-claim-parent-after",
              runId: admitted.parentRunId,
              ownerId: objectWorkerId,
            }),
          )
          expect(yield* runtime.inspect(admitted.parentRunId)).toMatchObject({ status: "succeeded" })
          const group = yield* runtime.inspectFanOut(admitted.fanOutId)
          expect(group.status).toBe("succeeded")
          expect(group.members.map((member) => member.status)).toEqual([
            "succeeded",
            "succeeded",
            "succeeded",
            "succeeded",
          ])
          const history = yield* runtime.history({ runId: admitted.parentRunId, limit: 300 })
          expect(history.filter((event) => event._tag === "ChildLinked")).toHaveLength(4)
          expect(history.filter((event) => event._tag === "ChildSettled")).toHaveLength(4)
          expect(history.filter((event) => event._tag === "RunWaiting")).toHaveLength(1)
          expect(history.filter((event) => event._tag === "RunResumed")).toHaveLength(1)
          expect(history.filter((event) => event._tag === "FanOutJoined")).toHaveLength(1)
          const snapshot = yield* store.snapshot(admitted.parentRunId)
          expect(snapshot).toMatchObject({
            outcome: {
              _tag: "Succeeded",
              result: {
                text: "linear-parent-model-01",
                turns: 2,
                session: { sessionId: "session:linear-four-child" },
              },
            },
          })
          const succeeded = Schema.decodeUnknownOption(
            Schema.Struct({ outcome: Schema.TaggedStruct("Succeeded", { result: Schema.Unknown }) }),
          )(snapshot)
          expect(Option.isSome(succeeded)).toBe(true)
        }),
      ),
    )

    expect(fixture.counts()).toEqual({
      parentCalls: 2,
      childCalls: [10, 10, 10, 10],
      childToolCalls: [9, 9, 9, 9],
    })
    const resumedPrompt = fixture.resumedParentPrompt()
    expect(resumedPrompt).toBeDefined()
    const authoredOrder = Array.from({ length: 4 }, (_, childIndex) =>
      resumedPrompt!.indexOf(`linear-child-${childIndex}-model-09`),
    )
    expect(authoredOrder.every((index) => index >= 0)).toBe(true)
    expect(authoredOrder).toEqual([...authoredOrder].toSorted((left, right) => left - right))
  }),
)
