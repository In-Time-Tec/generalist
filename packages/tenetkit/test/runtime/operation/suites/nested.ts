import { describe, expect, it } from "@effect/vitest"
import { Effect, Layer, Ref, Schema } from "effect"
import { Approvals, NestedOperation, ToolContext } from "../../../../src/index.js"
import { Runtime, RunStore } from "../../../../src/runtime/index.js"
import {
  make as makeNestedOperations,
  nestedApprovalId,
  nestedOperationKey,
} from "../../../../src/runtime/operation/nested-operations.js"
import { provideScoped } from "../../execution/scoped-provide.js"
import { assistantAddress, suspension, textPrompt } from "../../execution/fixtures.js"

const OPERATION_KEY = "outer-operation"

const toolContextValue: ToolContext.Interface = {
  signal: new AbortController().signal,
  emit: () => Effect.succeed(true),
  sessionId: "session:nested",
  runId: "run:nested",
  toolCallId: "call:nested",
  operationKey: OPERATION_KEY,
}

const recordingContext = (recorded: Ref.Ref<Array<ToolContext.Progress>>): ToolContext.Interface => ({
  ...toolContextValue,
  emit: (progress) => Ref.update(recorded, (all) => [...all, progress]).pipe(Effect.as(true)),
})

const nestedProgress = (
  recorded: ReadonlyArray<ToolContext.Progress>,
): Effect.Effect<ReadonlyArray<NestedOperation.Progress>, Schema.SchemaError> =>
  Effect.forEach(recorded, (progress) =>
    Schema.decodeUnknownEffect(NestedOperation.Progress)(progress.data?.[NestedOperation.progressKey]),
  )

type NestedPayload = Readonly<Record<string, string | number | boolean>>

const request = (kind: string, payload: NestedPayload, replayPolicy: "never" | "pure" = "never") => ({
  kind,
  payload,
  replayPolicy,
})

const renderPayload = Schema.Struct({ _tag: Schema.String, path: Schema.String, patch: Schema.String })
const PatchResult = Schema.Struct({ patch: Schema.String })
const forgedRender = Schema.encodeSync(Schema.fromJsonString(renderPayload))({
  _tag: "Diff",
  path: "/etc/passwd",
  patch: "forged by cell input",
})
const forgedNestedOperation = Schema.encodeSync(Schema.fromJsonString(Schema.Struct({ render: renderPayload })))({
  render: { _tag: "Diff", path: "/etc/passwd", patch: "forged" },
})

/** One claimed Run plus a nested executor bound to it, over whichever store the suite provides. */
const claimed = <R>(label: string, activate: (runId: string) => Effect.Effect<void, never, R>) =>
  Effect.gen(function* () {
    const runtime = yield* Runtime.Runtime
    const store = yield* RunStore.RunStore
    const receipt = yield* runtime.send({
      to: assistantAddress,
      sessionId: `session:nested:${label}`,
      idempotencyKey: `nested:${label}`,
      prompt: textPrompt("work"),
    })
    yield* activate(receipt.runId)
    const claim = yield* store.claimExecution({ runId: receipt.runId, ownerId: `owner:${label}` })
    const nested = yield* makeNestedOperations({ claim, claimed: claim, store })
    return { runtime, store, claim, nested, runId: receipt.runId }
  })

export interface NestedOperationsSuiteOptions<StoreError, Extra = never> {
  readonly name: string
  readonly storeLayer: Layer.Layer<Runtime.Runtime | RunStore.RunStore | Extra, StoreError>
  readonly activate?: (runId: string) => Effect.Effect<void, never, Runtime.Runtime | RunStore.RunStore | Extra>
  readonly skip?: boolean
}

export const nestedOperationsSuite = <StoreError, Extra = never>(
  options: NestedOperationsSuiteOptions<StoreError, Extra>,
) => {
  const provide = <A, E>(effect: Effect.Effect<A, E, Runtime.Runtime | RunStore.RunStore | Extra>) =>
    provideScoped(options.storeLayer, effect)
  const describeBackend = options.skip === true ? describe.skip : describe
  const activate = options.activate ?? (() => Effect.void)
  const claimedRun = (label: string) => claimed(label, activate)

  describeBackend(`nested durable operations (${options.name})`, () => {
    it.live("journals the operation before the handler crosses its boundary", () =>
      provide(
        Effect.gen(function* () {
          const { nested, store, claim } = yield* claimedRun("before-boundary")
          const observed = yield* Ref.make<string | undefined>(undefined)
          yield* nested
            .run(
              request("write", { path: "a" }),
              Effect.gen(function* () {
                const record = yield* store.getOperationByKey({
                  runId: claim.runId,
                  operationKey: nestedOperationKey({ operationKey: OPERATION_KEY, ordinal: 0 }),
                })
                yield* Ref.set(observed, record?.status)
                return "done"
              }),
            )
            .pipe(Effect.provideService(ToolContext.ToolContext, toolContextValue))
          // The journal must already say "running" from inside the handler, or a crash mid-boundary
          // would leave no record that the side effect was ever attempted.
          expect(yield* Ref.get(observed)).toBe("running")
        }),
      ),
    )

    it.live("records a succeeded outcome the store can read back", () =>
      provide(
        Effect.gen(function* () {
          const { nested, store, claim } = yield* claimedRun("succeeded")
          const value = yield* nested
            .run(request("write", { path: "a" }), Effect.succeed({ bytes: 3 }))
            .pipe(Effect.provideService(ToolContext.ToolContext, toolContextValue))
          expect(value).toEqual({ bytes: 3 })
          const record = yield* store.getOperationByKey({
            runId: claim.runId,
            operationKey: nestedOperationKey({ operationKey: OPERATION_KEY, ordinal: 0 }),
          })
          expect(record?.status).toBe("succeeded")
          expect(record?.kind).toBe("nested")
          expect(record?.result).toEqual({ bytes: 3 })
        }),
      ),
    )

    it.live("records a failed outcome without losing the handler's typed error", () =>
      provide(
        Effect.gen(function* () {
          const { nested, store, claim } = yield* claimedRun("failed")
          const failure = yield* Effect.flip(
            nested
              .run(request("write", { path: "a" }), Effect.fail("denied" as const))
              .pipe(Effect.provideService(ToolContext.ToolContext, toolContextValue)),
          )
          expect(failure).toBe("denied")
          const record = yield* store.getOperationByKey({
            runId: claim.runId,
            operationKey: nestedOperationKey({ operationKey: OPERATION_KEY, ordinal: 0 }),
          })
          expect(record?.status).toBe("failed")
          expect(record?.error).toBe("denied")
        }),
      ),
    )

    it.live("returns the recorded outcome for a duplicate identity instead of repeating the effect", () =>
      provide(
        Effect.gen(function* () {
          const { store, claim } = yield* claimedRun("duplicate")
          const calls = yield* Ref.make(0)
          const first = yield* makeNestedOperations({ claim, claimed: claim, store })
          const declaration = { ...request("write", { path: "a" }), success: Schema.Finite }
          const value = yield* first
            .run(
              declaration,
              Ref.updateAndGet(calls, (n) => n + 1),
            )
            .pipe(Effect.provideService(ToolContext.ToolContext, toolContextValue))
          expect(value).toBe(1)
          // A fresh executor replays the same ordinal sequence, exactly as a retried attempt would.
          const replayed = yield* makeNestedOperations({ claim, claimed: claim, store })
          const again = yield* replayed
            .run(
              declaration,
              Ref.updateAndGet(calls, (n) => n + 1),
            )
            .pipe(Effect.provideService(ToolContext.ToolContext, toolContextValue))
          expect(again).toBe(1)
          expect(yield* Ref.get(calls)).toBe(1)
        }),
      ),
    )

    it.live("fails typed when the same identity is reused with a divergent payload", () =>
      provide(
        Effect.gen(function* () {
          const { store, claim } = yield* claimedRun("divergence")
          const first = yield* makeNestedOperations({ claim, claimed: claim, store })
          yield* first
            .run(request("write", { path: "a" }), Effect.succeed("ok"))
            .pipe(Effect.provideService(ToolContext.ToolContext, toolContextValue))
          const replayed = yield* makeNestedOperations({ claim, claimed: claim, store })
          const failure = yield* Effect.flip(
            replayed
              .run(request("write", { path: "DIFFERENT" }), Effect.succeed("ok"))
              .pipe(Effect.provideService(ToolContext.ToolContext, toolContextValue)),
          )
          expect(failure).toBeInstanceOf(NestedOperation.NestedOperationDivergence)
        }),
      ),
    )

    it.live("fails typed when the same identity is reused with a divergent kind", () =>
      provide(
        Effect.gen(function* () {
          const { store, claim } = yield* claimedRun("divergent-kind")
          const first = yield* makeNestedOperations({ claim, claimed: claim, store })
          yield* first
            .run(request("write", { path: "a" }), Effect.succeed("ok"))
            .pipe(Effect.provideService(ToolContext.ToolContext, toolContextValue))
          const replayed = yield* makeNestedOperations({ claim, claimed: claim, store })
          const failure = yield* Effect.flip(
            replayed
              .run(request("read", { path: "a" }), Effect.succeed("ok"))
              .pipe(Effect.provideService(ToolContext.ToolContext, toolContextValue)),
          )
          expect(failure).toBeInstanceOf(NestedOperation.NestedOperationDivergence)
        }),
      ),
    )

    it.live("assigns ordinals from the host so two calls never collide", () =>
      provide(
        Effect.gen(function* () {
          const { nested, store, claim } = yield* claimedRun("ordinals")
          yield* nested
            .run(request("write", { n: 1 }), Effect.succeed("a"))
            .pipe(Effect.provideService(ToolContext.ToolContext, toolContextValue))
          yield* nested
            .run(request("write", { n: 2 }), Effect.succeed("b"))
            .pipe(Effect.provideService(ToolContext.ToolContext, toolContextValue))
          const zero = yield* store.getOperationByKey({
            runId: claim.runId,
            operationKey: nestedOperationKey({ operationKey: OPERATION_KEY, ordinal: 0 }),
          })
          const one = yield* store.getOperationByKey({
            runId: claim.runId,
            operationKey: nestedOperationKey({ operationKey: OPERATION_KEY, ordinal: 1 }),
          })
          expect(zero?.result).toBe("a")
          expect(one?.result).toBe("b")
        }),
      ),
    )

    it.live("parks an unobserved non-idempotent outcome as unknown for explicit resolution", () =>
      provide(
        Effect.gen(function* () {
          const { nested, store, claim } = yield* claimedRun("unknown")
          // Interruption is the real path by which an outcome is never observed.
          yield* Effect.exit(
            nested
              .run(request("write", { path: "a" }), Effect.interrupt)
              .pipe(Effect.provideService(ToolContext.ToolContext, toolContextValue)),
          )
          const record = yield* store.getOperationByKey({
            runId: claim.runId,
            operationKey: nestedOperationKey({ operationKey: OPERATION_KEY, ordinal: 0 }),
          })
          expect(record?.status).toBe("unknown")
        }),
      ),
    )

    it.live("re-reports a parked unknown rather than silently repeating the side effect", () =>
      provide(
        Effect.gen(function* () {
          const { store, claim } = yield* claimedRun("unknown-replay")
          const first = yield* makeNestedOperations({ claim, claimed: claim, store })
          yield* Effect.exit(
            first
              .run(request("write", { path: "a" }), Effect.interrupt)
              .pipe(Effect.provideService(ToolContext.ToolContext, toolContextValue)),
          )
          const calls = yield* Ref.make(0)
          const replayed = yield* makeNestedOperations({ claim, claimed: claim, store })
          const failure = yield* Effect.flip(
            replayed
              .run(
                request("write", { path: "a" }),
                Ref.updateAndGet(calls, (n) => n + 1),
              )
              .pipe(Effect.provideService(ToolContext.ToolContext, toolContextValue)),
          )
          expect(failure).toBeInstanceOf(NestedOperation.NestedOperationUnknown)
          expect(yield* Ref.get(calls)).toBe(0)
        }),
      ),
    )

    it.live("suspends for an approval the host has not yet resolved", () =>
      provide(
        Effect.gen(function* () {
          const { nested } = yield* claimedRun("approval-pending")
          const approvals: Approvals.Interface = { resolve: (pending) => Effect.succeed(pending) }
          const failure = yield* Effect.flip(
            nested
              .run(
                { ...request("write", { path: "a" }), approval: { capability: "write" } },
                Effect.succeed("never runs"),
              )
              .pipe(
                Effect.provideService(ToolContext.ToolContext, toolContextValue),
                Effect.provideService(Approvals.Approvals, approvals),
              ),
          )
          expect(failure).toBeInstanceOf(NestedOperation.NestedOperationSuspended)
        }),
      ),
    )

    it.live("opens a wait carrying the nested operation's own approval identity", () =>
      provide(
        Effect.gen(function* () {
          const { nested } = yield* claimedRun("approval-wait")
          const approvals: Approvals.Interface = { resolve: (pending) => Effect.succeed(pending) }
          const failure = yield* Effect.flip(
            nested
              .run(
                { ...request("write", { path: "a" }), approval: { capability: "write" } },
                Effect.succeed("never runs"),
              )
              .pipe(
                Effect.provideService(ToolContext.ToolContext, toolContextValue),
                Effect.provideService(Approvals.Approvals, approvals),
              ),
          )
          if (!Schema.is(NestedOperation.NestedOperationSuspended)(failure)) throw new Error("expected suspension")
          const expected = nestedApprovalId(nestedOperationKey({ operationKey: OPERATION_KEY, ordinal: 0 }))
          expect(failure.token).toBe(expected)
          const suspended = suspension({
            waitId: failure.token,
            token: failure.token,
            reason: "approval",
            toolCallId: "call:nested",
            toolName: "write",
            toolParams: {},
          })
          const wait = yield* nested.waitFor(suspended.waits[0]!)
          expect(wait?.waitId).toBe(expected)
          expect(wait?.reason._tag).toBe("Approval")
        }),
      ),
    )

    it.live("does not cross the boundary when the host denies the approval", () =>
      provide(
        Effect.gen(function* () {
          const { nested, store, claim } = yield* claimedRun("approval-denied")
          const calls = yield* Ref.make(0)
          const approvals: Approvals.Interface = {
            resolve: () => Effect.succeed({ _tag: "Denied", reason: "not allowed" }),
          }
          const failure = yield* Effect.flip(
            nested
              .run(
                { ...request("write", { path: "a" }), approval: { capability: "write" } },
                Ref.updateAndGet(calls, (n) => n + 1),
              )
              .pipe(
                Effect.provideService(ToolContext.ToolContext, toolContextValue),
                Effect.provideService(Approvals.Approvals, approvals),
              ),
          )
          expect(failure).toBeInstanceOf(NestedOperation.NestedOperationDenied)
          expect(yield* Ref.get(calls)).toBe(0)
          const record = yield* store.getOperationByKey({
            runId: claim.runId,
            operationKey: nestedOperationKey({ operationKey: OPERATION_KEY, ordinal: 0 }),
          })
          expect(record?.status).toBe("failed")
        }),
      ),
    )

    it.live("crosses the boundary once the host approves", () =>
      provide(
        Effect.gen(function* () {
          const { nested } = yield* claimedRun("approval-approved")
          const approvals: Approvals.Interface = { resolve: () => Effect.succeed({ _tag: "Approved" }) }
          const value = yield* nested
            .run({ ...request("write", { path: "a" }), approval: { capability: "write" } }, Effect.succeed("wrote"))
            .pipe(
              Effect.provideService(ToolContext.ToolContext, toolContextValue),
              Effect.provideService(Approvals.Approvals, approvals),
            )
          expect(value).toBe("wrote")
        }),
      ),
    )

    it.live("emits the status-only payload for an operation that declares no projection", () =>
      provide(
        Effect.gen(function* () {
          const { nested } = yield* claimedRun("progress-default")
          const recorded = yield* Ref.make<Array<ToolContext.Progress>>([])
          yield* nested
            .run(request("write", { path: "a" }), Effect.succeed({ bytes: 3 }))
            .pipe(Effect.provideService(ToolContext.ToolContext, recordingContext(recorded)))
          const emitted = yield* Ref.get(recorded)
          expect(emitted.map((progress) => progress.message)).toEqual(["write running", "write succeeded"])
          for (const progress of emitted) {
            const data = yield* Schema.decodeUnknownEffect(Schema.Record(Schema.String, Schema.Unknown))(
              progress.data?.[NestedOperation.progressKey],
            )
            expect(Object.keys(data).toSorted()).toEqual(["kind", "ordinal", "status"])
          }
        }),
      ),
    )

    it.live("carries a declared artifact projection to the succeeded progress record", () =>
      provide(
        Effect.gen(function* () {
          const { nested } = yield* claimedRun("progress-artifact")
          const recorded = yield* Ref.make<Array<ToolContext.Progress>>([])
          yield* nested
            .run(
              {
                ...request("attach", { path: "/w/shot.png" }),
                render: (value: { readonly path: string; readonly bytes: number }) => ({
                  _tag: "Artifact" as const,
                  path: value.path,
                  mimeType: "image/png",
                  byteSize: value.bytes,
                  width: 64,
                  height: 48,
                }),
              },
              Effect.succeed({ path: "/w/shot.png", bytes: 4096 }),
            )
            .pipe(Effect.provideService(ToolContext.ToolContext, recordingContext(recorded)))
          const [running, succeeded] = yield* nestedProgress(yield* Ref.get(recorded))
          expect(running?.status).toBe("running")
          expect(running?.render).toBeUndefined()
          expect(succeeded?.render).toEqual({
            _tag: "Artifact",
            path: "/w/shot.png",
            mimeType: "image/png",
            byteSize: 4096,
            width: 64,
            height: 48,
          })
        }),
      ),
    )

    it.live("carries a declared diff projection to the succeeded progress record", () =>
      provide(
        Effect.gen(function* () {
          const { nested } = yield* claimedRun("progress-diff")
          const recorded = yield* Ref.make<Array<ToolContext.Progress>>([])
          yield* nested
            .run(
              {
                ...request("replace", { path: "/w/a.ts" }),
                render: (value: { readonly patch: string }) => ({
                  _tag: "Diff" as const,
                  path: "/w/a.ts",
                  patch: value.patch,
                }),
              },
              Effect.succeed({ patch: "@@ -1 +1 @@\n-a\n+b\n" }),
            )
            .pipe(Effect.provideService(ToolContext.ToolContext, recordingContext(recorded)))
          const succeeded = (yield* nestedProgress(yield* Ref.get(recorded))).at(-1)
          expect(succeeded?.render).toEqual({ _tag: "Diff", path: "/w/a.ts", patch: "@@ -1 +1 @@\n-a\n+b\n" })
        }),
      ),
    )

    it.live("withholds an oversized projection whole while the operation still succeeds", () =>
      provide(
        Effect.gen(function* () {
          const { nested, store, claim } = yield* claimedRun("progress-oversized")
          const recorded = yield* Ref.make<Array<ToolContext.Progress>>([])
          const patch = "z".repeat(NestedOperation.maxRenderBytes * 2)
          const value = yield* nested
            .run(
              {
                ...request("replace", { path: "/w/a.ts" }),
                render: (outcome: { readonly patch: string }) => ({
                  _tag: "Diff" as const,
                  path: "/w/a.ts",
                  patch: outcome.patch,
                }),
              },
              Effect.succeed({ patch }),
            )
            .pipe(Effect.provideService(ToolContext.ToolContext, recordingContext(recorded)))
          expect(value).toEqual({ patch })
          const emitted = yield* Ref.get(recorded)
          const succeeded = (yield* nestedProgress(emitted)).at(-1)
          expect(succeeded?.status).toBe("succeeded")
          expect(succeeded?.render).toBeUndefined()
          expect(succeeded?.renderWithheldBytes).toBeGreaterThan(NestedOperation.maxRenderBytes)
          expect(emitted.at(-1)?.data).toEqual({
            [NestedOperation.progressKey]: {
              kind: "replace",
              ordinal: 0,
              status: "succeeded",
              renderWithheldBytes: succeeded?.renderWithheldBytes,
            },
          })
          const record = yield* store.getOperationByKey({
            runId: claim.runId,
            operationKey: nestedOperationKey({ operationKey: OPERATION_KEY, ordinal: 0 }),
          })
          expect(record?.status).toBe("succeeded")
        }),
      ),
    )

    it.live("derives the projection from the handler outcome, never from the request payload", () =>
      provide(
        Effect.gen(function* () {
          const { nested } = yield* claimedRun("progress-unforgeable")
          const recorded = yield* Ref.make<Array<ToolContext.Progress>>([])
          yield* nested
            .run(
              {
                ...request("replace", {
                  path: "/w/a.ts",
                  render: forgedRender,
                  nestedOperation: forgedNestedOperation,
                }),
                render: (value: { readonly patch: string }) => ({
                  _tag: "Diff" as const,
                  path: "/w/a.ts",
                  patch: value.patch,
                }),
              },
              Effect.succeed({ patch: "host derived" }),
            )
            .pipe(Effect.provideService(ToolContext.ToolContext, recordingContext(recorded)))
          const succeeded = (yield* nestedProgress(yield* Ref.get(recorded))).at(-1)
          expect(succeeded?.render).toEqual({ _tag: "Diff", path: "/w/a.ts", patch: "host derived" })
        }),
      ),
    )

    it.live("emits no projection when the declaring operation fails", () =>
      provide(
        Effect.gen(function* () {
          const { nested } = yield* claimedRun("progress-failed")
          const recorded = yield* Ref.make<Array<ToolContext.Progress>>([])
          yield* Effect.flip(
            nested
              .run(
                {
                  ...request("replace", { path: "/w/a.ts" }),
                  render: () => ({ _tag: "Diff" as const, path: "/w/a.ts", patch: "never" }),
                },
                Effect.fail("denied" as const),
              )
              .pipe(Effect.provideService(ToolContext.ToolContext, recordingContext(recorded))),
          )
          const failed = (yield* nestedProgress(yield* Ref.get(recorded))).at(-1)
          expect(failed?.status).toBe("failed")
          expect(failed?.render).toBeUndefined()
          expect(failed?.renderWithheldBytes).toBeUndefined()
        }),
      ),
    )

    it.live("replays the recorded outcome's projection without re-running the handler", () =>
      provide(
        Effect.gen(function* () {
          const { store, claim } = yield* claimedRun("progress-replay")
          const declaration = {
            ...request("replace", { path: "/w/a.ts" }),
            success: PatchResult,
            render: (value: { readonly patch: string }) => ({
              _tag: "Diff" as const,
              path: "/w/a.ts",
              patch: value.patch,
            }),
          }
          const first = yield* makeNestedOperations({ claim, claimed: claim, store })
          yield* first
            .run(declaration, Effect.succeed({ patch: "recorded" }))
            .pipe(Effect.provideService(ToolContext.ToolContext, toolContextValue))
          const recorded = yield* Ref.make<Array<ToolContext.Progress>>([])
          const calls = yield* Ref.make(0)
          const replayed = yield* makeNestedOperations({ claim, claimed: claim, store })
          yield* replayed
            .run(declaration, Ref.updateAndGet(calls, (n) => n + 1).pipe(Effect.as({ patch: "re-run" })))
            .pipe(Effect.provideService(ToolContext.ToolContext, recordingContext(recorded)))
          expect(yield* Ref.get(calls)).toBe(0)
          const succeeded = (yield* nestedProgress(yield* Ref.get(recorded))).at(-1)
          expect(succeeded?.render).toEqual({ _tag: "Diff", path: "/w/a.ts", patch: "recorded" })
        }),
      ),
    )

    it.live("keeps the operation's identity independent of whether it declares a projection", () =>
      provide(
        Effect.gen(function* () {
          const { store, claim } = yield* claimedRun("progress-identity")
          const first = yield* makeNestedOperations({ claim, claimed: claim, store })
          yield* first
            .run(request("replace", { path: "/w/a.ts" }), Effect.succeed({ patch: "recorded" }))
            .pipe(Effect.provideService(ToolContext.ToolContext, toolContextValue))
          const replayed = yield* makeNestedOperations({ claim, claimed: claim, store })
          const value = yield* replayed
            .run(
              {
                ...request("replace", { path: "/w/a.ts" }),
                success: PatchResult,
                render: (outcome: { readonly patch: string }) => ({
                  _tag: "Diff" as const,
                  path: "/w/a.ts",
                  patch: outcome.patch,
                }),
              },
              Effect.succeed({ patch: "re-run" }),
            )
            .pipe(Effect.provideService(ToolContext.ToolContext, toolContextValue))
          expect(value).toEqual({ patch: "recorded" })
        }),
      ),
    )

    it.live("keeps pure in-worker computation out of the journal entirely", () =>
      provide(
        Effect.gen(function* () {
          const { store, claim } = yield* claimedRun("no-journal")
          const record = yield* store.getOperationByKey({
            runId: claim.runId,
            operationKey: nestedOperationKey({ operationKey: OPERATION_KEY, ordinal: 0 }),
          })
          expect(record).toBeUndefined()
        }),
      ),
    )
  })
}
