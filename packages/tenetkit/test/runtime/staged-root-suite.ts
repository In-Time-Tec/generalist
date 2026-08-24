import { describe, expect, it } from "@effect/vitest"
import { Effect, Layer } from "effect"
import { Errors, Runtime, RunStore } from "../../src/runtime/index.js"
import { assistantRef, registrationsFor, textPrompt } from "./helpers.js"
import { provideScoped } from "./scoped-provide.js"

export interface StagedRootSuiteOptions<StoreError, Extra = never> {
  readonly name: string
  readonly storeLayer: Layer.Layer<Runtime.Runtime | RunStore.RunStore | Extra, StoreError>
  readonly skip?: boolean
}

export const stagedRootSuite = <StoreError, Extra = never>(options: StagedRootSuiteOptions<StoreError, Extra>) => {
  const describeBackend = options.skip === true ? describe.skip : describe
  const provide = <A, E>(effect: Effect.Effect<A, E, Runtime.Runtime | RunStore.RunStore | Extra>) =>
    provideScoped(options.storeLayer, effect)
  const input = (label: string) => ({
    runId: `run:staged:${options.name}:${label}`,
    executable: assistantRef,
    registrations: registrationsFor(assistantRef),
    sessionId: `session:staged:${options.name}:${label}`,
    idempotencyKey: `staged:${label}`,
    prompt: textPrompt(label),
  })
  const tags = (runId: string) =>
    Effect.map(RunStore.RunStore, (store) => store).pipe(
      Effect.flatMap((store) => store.history({ runId, cursor: -1, limit: 100 })),
      Effect.map((events) => events.map((event) => event._tag)),
    )

  describeBackend(`staged root lifecycle (${options.name})`, () => {
    it.live("holds an admitted root behind the execution gate until activation", () =>
      provide(
        Effect.gen(function* () {
          const runtime = yield* Runtime.Runtime
          const store = yield* RunStore.RunStore
          const receipt = yield* runtime.admit(input("gate"))

          expect(receipt).not.toHaveProperty("childRunIds")
          expect(receipt).not.toHaveProperty("fanOuts")
          expect(yield* runtime.inspect(receipt.runId)).toMatchObject({ status: "queued" })
          expect(yield* tags(receipt.runId)).toEqual(["RunAccepted"])
          expect(
            yield* store.claimExecution({ runId: receipt.runId, ownerId: "premature" }).pipe(Effect.flip),
          ).toBeInstanceOf(Errors.RuntimeUnavailable)
          expect(yield* tags(receipt.runId)).toEqual(["RunAccepted"])

          const activated = yield* runtime.activate({ runId: receipt.runId })
          expect(activated).toMatchObject({ runId: receipt.runId, status: "running" })
          const claim = yield* store.claimExecution({ runId: receipt.runId, ownerId: "activated" })
          expect(claim).toMatchObject({ runId: receipt.runId, ownerId: "activated", attempt: 1 })
          yield* store.releaseExecution(claim)
        }),
      ),
    )

    it.live("admits exactly one root when a broader start value carries initial work", () =>
      provide(
        Effect.gen(function* () {
          const runtime = yield* Runtime.Runtime
          const broaderStart: Runtime.StartInput = {
            ...input("one-root"),
            initialChildren: [
              {
                invocationId: "must-not-be-admitted",
                idempotencyKey: "must-not-be-admitted",
                selection: "researcher",
                sessionId: `session:staged:${options.name}:must-not-be-admitted`,
                prompt: textPrompt("must not execute"),
              },
            ],
          }

          const receipt = yield* runtime.admit(broaderStart)
          expect((yield* runtime.inspectTree(receipt.runId)).runs).toHaveLength(1)
          expect(yield* tags(receipt.runId)).toEqual(["RunAccepted"])
        }),
      ),
    )

    it.live("recovers a lost receipt and keeps divergent and Run-ID conflicts typed", () =>
      provide(
        Effect.gen(function* () {
          const runtime = yield* Runtime.Runtime
          const admittedInput = input("receipt")
          const first = yield* runtime.admit(admittedInput)
          expect(yield* runtime.admit(admittedInput)).toEqual({ ...first, duplicate: true })

          yield* runtime.activate({ runId: first.runId })
          expect(yield* runtime.admit(admittedInput)).toEqual({ ...first, duplicate: true })
          expect(yield* runtime.inspect(first.runId)).toMatchObject({ status: "running" })

          expect(
            yield* runtime.admit({ ...admittedInput, prompt: textPrompt("divergent") }).pipe(Effect.flip),
          ).toBeInstanceOf(Errors.IdempotencyConflict)
          expect(
            yield* runtime
              .admit({
                ...admittedInput,
                sessionId: `${admittedInput.sessionId}:other`,
                idempotencyKey: `${admittedInput.idempotencyKey}:other`,
              })
              .pipe(Effect.flip),
          ).toBeInstanceOf(Errors.RunIdConflict)
        }),
      ),
    )

    it.live("keeps a cancelled queued root terminal when activation arrives later", () =>
      provide(
        Effect.gen(function* () {
          const runtime = yield* Runtime.Runtime
          const store = yield* RunStore.RunStore
          const receipt = yield* runtime.admit(input("cancel-first"))

          yield* runtime.cancel({ runId: receipt.runId, reason: "cancel won" })
          const activations = yield* Effect.all(
            Array.from({ length: 8 }, () => runtime.activate({ runId: receipt.runId })),
            { concurrency: "unbounded" },
          )
          expect(activations.every((run) => run.status === "cancelled")).toBe(true)
          expect(yield* tags(receipt.runId)).toEqual(["RunAccepted", "RunCancellationRequested", "RunCancelled"])
          expect(
            yield* store.claimExecution({ runId: receipt.runId, ownerId: "too-late" }).pipe(Effect.flip),
          ).toBeInstanceOf(Errors.RunTerminal)
        }),
      ),
    )

    it.live("applies ordinary cancellation after activation wins", () =>
      provide(
        Effect.gen(function* () {
          const runtime = yield* Runtime.Runtime
          const receipt = yield* runtime.admit(input("activate-first"))

          expect(yield* runtime.activate({ runId: receipt.runId })).toMatchObject({ status: "running" })
          yield* runtime.cancel({ runId: receipt.runId, reason: "cancel after activation" })
          expect(yield* runtime.inspect(receipt.runId)).toMatchObject({ status: "cancelled" })
          expect(yield* tags(receipt.runId)).toEqual([
            "RunAccepted",
            "RunAttemptStarted",
            "RunCancellationRequested",
            "RunCancelled",
          ])
        }),
      ),
    )

    it.live("serializes concurrent duplicate activation to one attempt", () =>
      provide(
        Effect.gen(function* () {
          const runtime = yield* Runtime.Runtime
          const receipt = yield* runtime.admit(input("concurrent-activation"))
          const activations = yield* Effect.all(
            Array.from({ length: 16 }, () => runtime.activate({ runId: receipt.runId })),
            { concurrency: "unbounded" },
          )

          expect(activations.every((run) => run.runId === receipt.runId && run.status === "running")).toBe(true)
          expect((yield* tags(receipt.runId)).filter((tag) => tag === "RunAttemptStarted")).toHaveLength(1)
        }),
      ),
    )

    it.live("preserves ordinary immediate Runtime.start behavior", () =>
      provide(
        Effect.gen(function* () {
          const runtime = yield* Runtime.Runtime
          const startInput = input("ordinary-start")
          const first = yield* runtime.start(startInput)

          expect(yield* runtime.inspect(first.runId)).toMatchObject({ status: "running" })
          expect(yield* tags(first.runId)).toEqual(["RunAccepted", "RunAttemptStarted"])
          expect(yield* runtime.start(startInput)).toEqual({ ...first, duplicate: true })
        }),
      ),
    )
  })
}
