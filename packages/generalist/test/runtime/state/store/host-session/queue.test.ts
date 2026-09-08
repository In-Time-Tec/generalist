import { BunCrypto } from "@effect/platform-bun"
import { expect, it } from "@effect/vitest"
import { Effect, Layer } from "effect"
import { Prompt } from "effect/unstable/ai"
import { activate, layerRunStore } from "../../../../../src/durability/index.js"
import { ObjectStore } from "../../../../../src/durability/object-store.js"
import { RunStore } from "../../../../../src/runtime/run/store.js"
import { make as makeSimulator, type Client } from "../../../../../src/testing/durability/index.js"
import { alternateAssistantRef, assistantRef, registrationsFor } from "../../../execution/fixtures.js"
import { programExecutable } from "../../../program/fixture.js"
import { provideScoped } from "../../../execution/scoped-provide.js"

const selection = {
  executableRef: assistantRef.ref,
  executableManifest: assistantRef.manifest,
  registrations: registrationsFor(assistantRef),
}

const open = (client: Client, workerId: string) =>
  Effect.gen(function* () {
    const context = yield* Layer.build(
      layerRunStore({ environment: "test", tenant: "queue", partition: "reopen", workerId, addresses: [] }).pipe(
        Layer.provide(Layer.succeed(ObjectStore, client.store)),
      ),
    )
    yield* activate.pipe(Effect.provide(context))
    return yield* RunStore.pipe(Effect.provide(context))
  })

it.effect("fresh Session queue hosts retain selection and exact receipts without duplicate admission", () =>
  provideScoped(
    BunCrypto.layer,
    Effect.gen(function* () {
      const bucket = yield* makeSimulator({ pageSize: 1 })
      const sessionId = "session:queue:reopen"
      const first = { sessionId, commandId: "first", prompt: Prompt.make("first"), selection }
      const pending = { sessionId, commandId: "pending", prompt: Prompt.make("pending") }
      const removed = { sessionId, commandId: "removed", prompt: Prompt.make("removed") }
      const replacementSelection = {
        executableRef: alternateAssistantRef.ref,
        executableManifest: alternateAssistantRef.manifest,
        registrations: registrationsFor(alternateAssistantRef),
        treePolicy: { maxDepth: 2, maxSessions: 1024, concurrency: { agents: 3, tools: 1024 } },
        budget: { tokens: 1200, toolCalls: 4 },
      }
      const edit = {
        ...pending,
        id: "pending",
        commandId: "edit",
        expectedRevision: 1,
        prompt: Prompt.make("edited"),
        selection: replacementSelection,
      }
      const remove = { sessionId, id: "removed", commandId: "remove", expectedRevision: 1 }
      const runId = yield* Effect.scoped(
        Effect.gen(function* () {
          const store = yield* open(bucket, "first-host")
          yield* store.createHostSession({ id: sessionId })
          yield* store.submitSessionInput(first)
          yield* store.submitSessionInput(pending)
          yield* store.submitSessionInput(removed)
          yield* store.updateSessionInput(edit)
          yield* store.removeSessionInput(remove)
          return (yield* store.hostSession(sessionId)).activeRunId!
        }),
      )
      const promoted = yield* Effect.scoped(
        Effect.gen(function* () {
          const store = yield* open(yield* bucket.connect, "second-host")
          expect(yield* store.submitSessionInput(first)).toEqual({ id: "first", revision: 1 })
          expect(yield* store.submitSessionInput(removed)).toEqual({ id: "removed", revision: 1 })
          expect(yield* store.removeSessionInput(remove)).toEqual({ id: "removed", revision: 2 })
          expect(yield* store.updateSessionInput(edit)).toEqual({ id: "pending", revision: 2 })
          expect(yield* store.hostSession(sessionId)).toMatchObject({
            activeRunId: runId,
            selection,
            queue: [{ id: "pending", revision: 2, prompt: edit.prompt, selection: replacementSelection }],
          })
          expect(yield* store.loadExecution(runId)).toMatchObject({ executableRef: selection.executableRef })
          expect(yield* store.hostSessionRuns(sessionId)).toHaveLength(1)
          const claim = yield* store.claimExecution({ runId, ownerId: "second-host", commandId: "claim" })
          yield* store.complete({
            ...claim,
            commandId: "complete",
            result: { text: "done", output: "done", turns: 1, session: { sessionId, leafId: null } },
          })
          return (yield* store.hostSession(sessionId)).activeRunId!
        }),
      )
      expect(promoted).not.toBe(runId)
      const store = yield* open(yield* bucket.connect, "third-host")
      expect(yield* store.submitSessionInput(pending)).toEqual({ id: "pending", revision: 1 })
      expect(yield* store.updateSessionInput(edit)).toEqual({ id: "pending", revision: 2 })
      expect(
        yield* store.updateSessionInput({ ...edit, prompt: Prompt.make("divergent") }).pipe(Effect.flip),
      ).toMatchObject({ reason: "input-conflict" })
      expect(yield* store.removeSessionInput({ ...remove, expectedRevision: 2 }).pipe(Effect.flip)).toMatchObject({
        reason: "input-conflict",
      })
      expect(yield* store.hostSession(sessionId)).toMatchObject({ activeRunId: promoted, queue: [], selection })
      expect(yield* store.loadExecution(promoted)).toMatchObject({
        message: { prompt: edit.prompt },
        executableRef: replacementSelection.executableRef,
        executableManifest: replacementSelection.executableManifest,
        registrations: replacementSelection.registrations,
        treePolicy: replacementSelection.treePolicy,
      })
      expect(yield* store.hostSessionRuns(sessionId)).toHaveLength(2)
    }),
  ).pipe(Effect.scoped),
)

it.effect("rejects a pinned Program selection without creating a conversational Run", () =>
  provideScoped(
    BunCrypto.layer,
    Effect.gen(function* () {
      const store = yield* open(yield* makeSimulator(), "program-host")
      const sessionId = "session:queue:program"
      yield* store.createHostSession({ id: sessionId })
      expect(
        yield* store
          .submitSessionInput({
            sessionId,
            commandId: "program",
            prompt: Prompt.make("program"),
            selection: {
              executableRef: programExecutable.ref,
              executableManifest: programExecutable.manifest,
              registrations: [],
            },
          })
          .pipe(Effect.flip),
      ).toMatchObject({ reason: "selection" })
      expect(yield* store.hostSessionRuns(sessionId)).toEqual([])
      expect(yield* store.hostSession(sessionId)).toMatchObject({ queue: [] })
    }),
  ).pipe(Effect.scoped),
)
