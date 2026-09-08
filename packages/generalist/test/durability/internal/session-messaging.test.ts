import { BunCrypto } from "@effect/platform-bun"
import { expect, it } from "@effect/vitest"
import { Effect, Layer } from "effect"
import { Prompt } from "effect/unstable/ai"
import { make as makeAgent } from "../../../src/core/agent/service.js"
import { durableIdentity } from "../../../src/runtime/executable/registered-agent.js"
import { activate, layerRunStore } from "../../../src/durability/index.js"
import { RunStore } from "../../../src/runtime/run/store.js"
import { ObjectStore } from "../../../src/durability/object-store.js"
import { make as makeSimulator } from "../../../src/testing/durability/index.js"
import { make as address } from "../../../src/runtime/address.js"
import { provideScoped } from "../../runtime/execution/scoped-provide.js"

for (const order of [
  "send-first",
  "settle-first",
  "concurrent",
  "stop-first",
  "send-stop",
  "concurrent-stop",
] as const) {
  it.effect(`delivers a retained child follow-up once across independent hosts (${order})`, () =>
    provideScoped(
      BunCrypto.layer,
      Effect.gen(function* () {
        const bucket = yield* makeSimulator()
        const open = (workerId: string) =>
          Effect.gen(function* () {
            const client = yield* bucket.connect
            const context = yield* Layer.build(
              layerRunStore({
                environment: "test",
                tenant: "messaging",
                partition: order,
                addresses: [],
                workerId,
              }).pipe(Layer.provide(Layer.succeed(ObjectStore, client.store))),
            )
            yield* activate.pipe(Effect.provide(context))
            return yield* RunStore.pipe(Effect.provide(context))
          })
        const first = yield* open("first")
        const second = yield* open("second")
        const { executable, registrations } = durableIdentity(makeAgent({ name: "reviewer", children: ["reviewer"] }))
        const selection = { executableRef: executable.ref, executableManifest: executable.manifest, registrations }
        yield* first.createHostSession({ id: "parent", selection })
        yield* first.submitSessionInput({ sessionId: "parent", commandId: "start", prompt: Prompt.make("coordinate") })
        const parentRunId = (yield* first.hostSession("parent")).activeRunId!
        const message = {
          id: "child",
          to: address(`spawn:${parentRunId}`),
          sessionId: "child",
          prompt: Prompt.make("review"),
          idempotencyKey: "child",
          correlationId: "child",
          metadata: {},
        }
        const child = yield* first.admitSpawn({
          parentRunId,
          invocationId: "child",
          selection: "reviewer",
          prompt: message.prompt,
          message,
        })
        const before = (yield* first.hostSession("child")).retainedSession
        const followup = {
          sessionId: "child",
          commandId: "followup",
          prompt: Prompt.make("check regression"),
          from: { runId: parentRunId },
        }
        const send = second.messageSessionInput(followup)
        if (order === "stop-first" || order === "send-stop" || order === "concurrent-stop") {
          const stop = first.controlSession({ sessionId: "child", commandId: "stop", action: "stop" })
          if (order === "stop-first") {
            yield* stop
            yield* send
          } else if (order === "send-stop") {
            yield* send
            yield* stop
          } else yield* Effect.all([send, stop], { concurrency: "unbounded" })
          const fresh = yield* open("fresh")
          const stopped = yield* fresh.hostSession("child")
          expect(stopped.lifecycle).toBe("stopped")
          expect(stopped.activeRunId).toBeUndefined()
          expect(stopped.queue.map((entry) => entry.id)).toEqual(["followup"])
          expect(stopped.retainedSession).toEqual(before)
          expect((yield* fresh.hostSessionRuns("child")).length).toBe(1)
          expect(yield* fresh.messageSessionInput(followup)).toEqual({ id: "followup", revision: 1 })
          yield* fresh.controlSession({ sessionId: "child", commandId: "resume", action: "resume" })
          expect((yield* fresh.hostSession("child")).activeRunId).not.toBe(child.runId)
          expect((yield* fresh.hostSessionRuns("child")).length).toBe(2)
          return
        }
        const claim = yield* first.claimExecution({ runId: child.runId, ownerId: "first", commandId: "claim" })
        const settle = first.complete({
          ...claim,
          commandId: "complete",
          result: { text: "done", output: "done", turns: 1, session: { sessionId: "child", leafId: null } },
        })
        if (order === "send-first") {
          yield* send
          yield* settle
        } else if (order === "settle-first") {
          yield* settle
          yield* send
        } else yield* Effect.all([send, settle], { concurrency: "unbounded" })
        yield* first.releaseExecution(claim)
        const fresh = yield* open("fresh")
        const retained = yield* fresh.hostSession("child")
        expect(retained.retainedSession).toEqual(before)
        expect(retained.sponsorRunId).toBe(parentRunId)
        expect(retained.activeRunId).toBeDefined()
        const continued = retained.activeRunId === child.runId
        if (order === "send-first") expect(continued).toBe(true)
        if (order === "settle-first") expect(continued).toBe(false)
        expect((yield* fresh.hostSessionRuns("child")).length).toBe(continued ? 1 : 2)
        expect(yield* fresh.messageSessionInput(followup)).toEqual({ id: "followup", revision: 1 })
        expect((yield* fresh.hostSessionRuns("child")).length).toBe(continued ? 1 : 2)
        const execution = yield* fresh.loadExecution(retained.activeRunId!)
        const delivered = continued ? execution.continuation?.prompt : execution.message.prompt
        expect(delivered?.content[0]).toMatchObject({
          role: "user",
          options: { generalist: { message: { from: expect.any(String) } } },
        })
      }),
    ),
  )
}
