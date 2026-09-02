import { expect, it } from "@effect/vitest"
import { Deferred, Effect, Fiber, Layer, Stream } from "effect"
import { LanguageModel, Response } from "effect/unstable/ai"
import { Agent, ExecutableManifest } from "../../../../../src/index.js"
import { Address, ExecutableResolver, RunExecutor, Runtime, RunStore } from "../../../../../src/runtime/index.js"
import { registrationsFor, textPrompt } from "../../../execution/fixtures.js"
import { closedTestAgent, pinnedTestAgent } from "../../../run/identity.js"
import { provideScoped } from "../../../execution/scoped-provide.js"
import { allowAllAuthorization } from "../../../../authorization.js"

const finish = Response.makePart("finish", {
  reason: "stop",
  usage: Response.Usage.make({
    inputTokens: { total: 1, uncached: 1, cacheRead: undefined, cacheWrite: undefined },
    outputTokens: { total: 1, text: 1, reasoning: undefined },
  }),
  response: undefined,
})

/**
 * One scripted root Agent that can spawn a `researcher` child.
 *
 * Messaging is relationship-scoped, so every delivery test needs a real durable parent/child pair
 * rather than two unrelated Runs.
 */
const scriptedAgent = (name: string) => {
  const agent = Agent.make({ name })
  const childAgent = Agent.make({ name: `${name}-researcher` })
  const childPinned = pinnedTestAgent(childAgent, "1")
  const rootPinned = pinnedTestAgent(agent, "1", [{ selection: "researcher" }])
  const entries = [rootPinned, childPinned].map((pinned) => ({
    _tag: "Agent" as const,
    pin: pinned.pin,
    manifest: pinned.manifest,
  }))
  const profiles = [{ selection: "researcher", agent: childPinned.pin }]
  const executable = ExecutableManifest.make({ root: rootPinned.pin, profiles, entries })
  const ref = { ...executable, ...executable.ref }
  const childExecutable = ExecutableManifest.make({ root: rootPinned.pin, active: childPinned.pin, profiles, entries })
  const childRef = { ...childExecutable, ...childExecutable.ref }
  return { agent, childAgent, ref, childRef, address: Address.make(`agent:${name}`) }
}

it.effect("delivers an addressed message at the next turn boundary without interrupting an active model turn", () =>
  Effect.gen(function* () {
    const started = yield* Deferred.make<void>()
    const release = yield* Deferred.make<void>()
    let finishedFirstTurn = false
    const requests: Array<string> = []
    const { agent, childAgent, ref, childRef, address } = scriptedAgent("boundary-delivery")
    const model = Layer.effect(
      LanguageModel.LanguageModel,
      LanguageModel.make({
        generateText: () => Effect.succeed([{ type: "text", text: "unused" }]),
        streamText: (request) => {
          requests.push(JSON.stringify(request.prompt))
          if (requests.length > 1) {
            return Stream.fromIterable<Response.StreamPartEncoded>([
              Response.makePart("text-delta", { id: "second", delta: "answered" }),
              finish,
            ])
          }
          // Hold the first model turn open across the send so the test observes what a message
          // admitted mid-turn does to a running turn: nothing.
          return Stream.fromEffect(Deferred.succeed(started, undefined)).pipe(
            Stream.drain,
            Stream.concat(Stream.fromEffect(Deferred.await(release)).pipe(Stream.drain)),
            Stream.concat(
              Stream.sync(() => {
                finishedFirstTurn = true
                return Response.makePart("text-delta", { id: "first", delta: "original" })
              }),
            ),
            Stream.concat(Stream.make(finish)),
          )
        },
      }),
    )
    const runtimeLayer = Runtime.layerMemory({
      addresses: [{ address, executable: ref, registrations: registrationsFor(ref) }],
    }).pipe(
      Layer.provide(
        ExecutableResolver.layerStatic([
          { executable: ref, agent: Agent.close(agent, Layer.mergeAll(allowAllAuthorization, model)) },
          { executable: childRef, agent: closedTestAgent(childAgent) },
        ]).pipe(Layer.orDie),
      ),
    )

    yield* provideScoped(
      runtimeLayer,
      Effect.gen(function* () {
        const runtime = yield* Runtime.Runtime
        const host = yield* RunExecutor.RunExecutor
        const store = yield* RunStore.RunStore
        const target = yield* runtime.send({
          to: address,
          sessionId: "session:boundary-delivery",
          idempotencyKey: "run:boundary-delivery",
          prompt: "initial",
        })
        const child = yield* runtime.spawn({
          parentRunId: target.runId,
          invocationId: "invocation:sender",
          selection: "researcher",
          prompt: textPrompt("child"),
        })

        const claim = yield* store.claimExecution({ runId: target.runId, ownerId: "memory" })
        const fiber = yield* host.execute(claim).pipe(Effect.forkChild({ startImmediately: true }))
        yield* Deferred.await(started)

        const targetEntry = yield* store.directory(target.runId)
        yield* runtime.sendMessage({
          fromRunId: child.runId,
          to: targetEntry.address,
          idempotencyKey: "mid-turn",
          prompt: textPrompt("message from child"),
        })

        // The turn that was already running is untouched by the admission.
        expect(requests).toHaveLength(1)
        expect(finishedFirstTurn).toBe(false)

        yield* Deferred.succeed(release, undefined)
        expect((yield* Fiber.await(fiber))._tag).toBe("Success")

        expect(finishedFirstTurn).toBe(true)
        expect(requests).toHaveLength(2)
        expect(requests[1]).toContain("message from child")
        expect((yield* runtime.inspect(target.runId)).status).toBe("succeeded")
        // The entry is consumed exactly once: nothing is left pending for a later Run.
        expect(yield* runtime.messages({ runId: target.runId, limit: 10 })).toEqual([])
      }),
    )
  }),
)

it.effect("carries the authoritative sender into the delivered prompt", () =>
  Effect.gen(function* () {
    const requests: Array<string> = []
    const { agent, childAgent, ref, childRef, address } = scriptedAgent("sender-attribution")
    const model = Layer.effect(
      LanguageModel.LanguageModel,
      LanguageModel.make({
        generateText: () => Effect.succeed([{ type: "text", text: "unused" }]),
        streamText: (request) => {
          requests.push(JSON.stringify(request.prompt))
          return Stream.fromIterable<Response.StreamPartEncoded>([
            Response.makePart("text-delta", { id: `text:${requests.length}`, delta: "ok" }),
            finish,
          ])
        },
      }),
    )
    const runtimeLayer = Runtime.layerMemory({
      addresses: [{ address, executable: ref, registrations: registrationsFor(ref) }],
    }).pipe(
      Layer.provide(
        ExecutableResolver.layerStatic([
          { executable: ref, agent: Agent.close(agent, Layer.mergeAll(allowAllAuthorization, model)) },
          { executable: childRef, agent: closedTestAgent(childAgent) },
        ]).pipe(Layer.orDie),
      ),
    )

    yield* provideScoped(
      runtimeLayer,
      Effect.gen(function* () {
        const runtime = yield* Runtime.Runtime
        const host = yield* RunExecutor.RunExecutor
        const store = yield* RunStore.RunStore
        const target = yield* runtime.send({
          to: address,
          sessionId: "session:sender-attribution",
          idempotencyKey: "run:sender-attribution",
          prompt: "initial",
        })
        const child = yield* runtime.spawn({
          parentRunId: target.runId,
          invocationId: "invocation:child",
          selection: "researcher",
          prompt: textPrompt("child"),
        })
        const targetEntry = yield* store.directory(target.runId)
        yield* runtime.sendMessage({
          fromRunId: child.runId,
          to: targetEntry.address,
          idempotencyKey: "attributed",
          prompt: textPrompt("please review"),
        })

        yield* host.execute(yield* store.claimExecution({ runId: target.runId, ownerId: "memory" }))

        const delivered = requests.find((request) => request.includes("please review"))
        expect(delivered).toBeDefined()
        // The model sees who sent it, and that identity came from the Run record.
        expect(delivered).toContain(child.runId)
      }),
    )
  }),
)

it.effect("holds a message for an idle target until its next execution drains it", () =>
  Effect.gen(function* () {
    const requests: Array<string> = []
    const { agent, childAgent, ref, childRef, address } = scriptedAgent("idle-target")
    const model = Layer.effect(
      LanguageModel.LanguageModel,
      LanguageModel.make({
        generateText: () => Effect.succeed([{ type: "text", text: "unused" }]),
        streamText: (request) => {
          requests.push(JSON.stringify(request.prompt))
          return Stream.fromIterable<Response.StreamPartEncoded>([
            Response.makePart("text-delta", { id: `text:${requests.length}`, delta: "ok" }),
            finish,
          ])
        },
      }),
    )
    const runtimeLayer = Runtime.layerMemory({
      addresses: [{ address, executable: ref, registrations: registrationsFor(ref) }],
    }).pipe(
      Layer.provide(
        ExecutableResolver.layerStatic([
          { executable: ref, agent: Agent.close(agent, Layer.mergeAll(allowAllAuthorization, model)) },
          { executable: childRef, agent: closedTestAgent(childAgent) },
        ]).pipe(Layer.orDie),
      ),
    )

    yield* provideScoped(
      runtimeLayer,
      Effect.gen(function* () {
        const runtime = yield* Runtime.Runtime
        const host = yield* RunExecutor.RunExecutor
        const store = yield* RunStore.RunStore
        const target = yield* runtime.send({
          to: address,
          sessionId: "session:idle-target",
          idempotencyKey: "run:idle-target",
          prompt: "initial",
        })
        const child = yield* runtime.spawn({
          parentRunId: target.runId,
          invocationId: "invocation:child",
          selection: "researcher",
          prompt: textPrompt("child"),
        })
        const targetEntry = yield* store.directory(target.runId)

        // Nothing is executing: the message waits durably rather than being dropped.
        yield* runtime.sendMessage({
          fromRunId: child.runId,
          to: targetEntry.address,
          idempotencyKey: "while-idle",
          prompt: textPrompt("queued while idle"),
        })
        expect(yield* runtime.messages({ runId: target.runId, limit: 10 })).toHaveLength(1)
        expect(requests).toHaveLength(0)

        yield* host.execute(yield* store.claimExecution({ runId: target.runId, ownerId: "memory" }))

        expect(requests.some((request) => request.includes("queued while idle"))).toBe(true)
        expect(yield* runtime.messages({ runId: target.runId, limit: 10 })).toEqual([])
      }),
    )
  }),
)
