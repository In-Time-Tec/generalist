import { describe, expect, it } from "@effect/vitest"
import { Effect, Layer } from "effect"
import { ChildAdmission, Runtime, RunStore } from "../../src/runtime/index.js"
import { provideScoped } from "./scoped-provide.js"
import { assistantAddress, completedResult, textPrompt } from "./helpers.js"

const parentRun = <R>(label: string, activate: (runId: string) => Effect.Effect<void, never, R>) =>
  Effect.gen(function* () {
    const runtime = yield* Runtime.Runtime
    const store = yield* RunStore.RunStore
    const receipt = yield* runtime.send({
      to: assistantAddress,
      sessionId: `session:children:${label}`,
      idempotencyKey: `children:${label}`,
      prompt: textPrompt("plan"),
    })
    yield* activate(receipt.runId)
    return { runtime, store, children: ChildAdmission.make(store), parentRunId: receipt.runId }
  })

export interface ChildAdmissionSuiteOptions<StoreError, Extra = never> {
  readonly name: string
  readonly storeLayer: Layer.Layer<Runtime.Runtime | RunStore.RunStore | Extra, StoreError>
  readonly activate?: (runId: string) => Effect.Effect<void, never, Runtime.Runtime | RunStore.RunStore | Extra>
  readonly skip?: boolean
}

export const childAdmissionSuite = <StoreError, Extra = never>(
  options: ChildAdmissionSuiteOptions<StoreError, Extra>,
) => {
  const provide = <A, E>(effect: Effect.Effect<A, E, Runtime.Runtime | RunStore.RunStore | Extra>) =>
    provideScoped(options.storeLayer, effect)
  const describeBackend = options.skip === true ? describe.skip : describe
  const activate = options.activate ?? (() => Effect.void)
  const parentRunFor = (label: string) => parentRun(label, activate)

  describeBackend(`non-blocking child admission (${options.name})`, () => {
    it.live("returns a stable receipt immediately instead of an outcome", () =>
      provide(
        Effect.gen(function* () {
          const { children, parentRunId } = yield* parentRunFor("receipt")
          const receipt = yield* children.admit({
            parentRunId,
            toolCallId: "call-1",
            selection: "researcher",
            prompt: "review the boundary",
            key: "reviewer",
          })
          expect(receipt.childRunId).toBeTypeOf("string")
          expect(receipt.key).toBe("reviewer")
          expect(receipt.duplicate).toBe(false)
          // The receipt is a handle, never an answer: the child has not produced a result yet.
          expect(receipt).not.toHaveProperty("text")
        }),
      ),
    )

    it.live("is idempotent under one admission key", () =>
      provide(
        Effect.gen(function* () {
          const { children, parentRunId } = yield* parentRunFor("idempotent")
          const first = yield* children.admit({
            parentRunId,
            toolCallId: "call-1",
            selection: "researcher",
            prompt: "review",
            key: "reviewer",
          })
          const again = yield* children.admit({
            parentRunId,
            toolCallId: "call-1",
            selection: "researcher",
            prompt: "review",
            key: "reviewer",
          })
          expect(again.childRunId).toBe(first.childRunId)
          expect(again.duplicate).toBe(true)
          expect(yield* children.listDirect(parentRunId)).toHaveLength(1)
        }),
      ),
    )

    it.live("admits distinct children for distinct keys under one tool call", () =>
      provide(
        Effect.gen(function* () {
          const { children, parentRunId } = yield* parentRunFor("distinct-keys")
          const first = yield* children.admit({
            parentRunId,
            toolCallId: "call-1",
            selection: "researcher",
            prompt: "a",
            key: "first",
          })
          const second = yield* children.admit({
            parentRunId,
            toolCallId: "call-1",
            selection: "researcher",
            prompt: "b",
            key: "second",
          })
          expect(second.childRunId).not.toBe(first.childRunId)
          expect(yield* children.listDirect(parentRunId)).toHaveLength(2)
        }),
      ),
    )

    it.live("lists only this parent's direct children", () =>
      provide(
        Effect.gen(function* () {
          const { children, parentRunId } = yield* parentRunFor("list-direct")
          const child = yield* children.admit({
            parentRunId,
            toolCallId: "call-1",
            selection: "researcher",
            prompt: "a",
            key: "first",
          })
          // A grandchild belongs to the child, so it must not appear in the parent's direct list.
          yield* children.admit({
            parentRunId: child.childRunId,
            toolCallId: "call-2",
            selection: "analyst",
            prompt: "b",
            key: "nested",
          })
          const direct = yield* children.listDirect(parentRunId)
          expect(direct.map((entry) => entry.childRunId)).toEqual([child.childRunId])
          expect(yield* children.listDirect(child.childRunId)).toHaveLength(1)
        }),
      ),
    )

    it.live("rejects inspecting a child the caller did not admit", () =>
      provide(
        Effect.gen(function* () {
          const { children, parentRunId } = yield* parentRunFor("forged-inspect")
          const other = yield* parentRunFor("forged-inspect-other")
          const child = yield* children.admit({
            parentRunId,
            toolCallId: "call-1",
            selection: "researcher",
            prompt: "a",
            key: "first",
          })
          // Knowing the child Run id must grant nothing to an unrelated Run.
          const failure = yield* Effect.flip(
            children.inspect({ parentRunId: other.parentRunId, childRunId: child.childRunId }),
          )
          expect(failure).toBeInstanceOf(ChildAdmission.ChildParentageInvalid)
        }),
      ),
    )

    it.live("rejects cancelling a child the caller did not admit", () =>
      provide(
        Effect.gen(function* () {
          const { children, parentRunId } = yield* parentRunFor("forged-cancel")
          const other = yield* parentRunFor("forged-cancel-other")
          const child = yield* children.admit({
            parentRunId,
            toolCallId: "call-1",
            selection: "researcher",
            prompt: "a",
            key: "first",
          })
          const failure = yield* Effect.flip(
            children.cancel({ parentRunId: other.parentRunId, childRunId: child.childRunId }),
          )
          expect(failure).toBeInstanceOf(ChildAdmission.ChildParentageInvalid)
          // The child must survive the rejected attempt.
          const still = yield* children.inspect({ parentRunId, childRunId: child.childRunId })
          expect(still.status).not.toBe("cancelled")
        }),
      ),
    )

    it.live("cancels a child its own parent owns", () =>
      provide(
        Effect.gen(function* () {
          const { children, parentRunId } = yield* parentRunFor("cancel")
          const child = yield* children.admit({
            parentRunId,
            toolCallId: "call-1",
            selection: "researcher",
            prompt: "a",
            key: "first",
          })
          yield* children.cancel({ parentRunId, childRunId: child.childRunId, reason: "no longer needed" })
          const inspected = yield* children.inspect({ parentRunId, childRunId: child.childRunId })
          expect(["cancelled", "running", "queued"]).toContain(inspected.status)
        }),
      ),
    )

    it.live("inspects and joins an admitted child by its durable identity", () =>
      provide(
        Effect.gen(function* () {
          const { children, store, parentRunId } = yield* parentRunFor("join")
          const child = yield* children.admit({
            parentRunId,
            toolCallId: "call-1",
            selection: "researcher",
            prompt: "a",
            key: "first",
          })
          const claim = yield* store.claimExecution({ runId: child.childRunId, ownerId: "child" })
          yield* store.complete({ ...claim, result: completedResult("done") })
          const joined = yield* children.join({ parentRunId, childRunId: child.childRunId })
          expect(joined.childRunId).toBe(child.childRunId)
          expect(joined.status).toBe("succeeded")
        }),
      ),
    )

    it.live("carries the originating operation and ordinal into the child-tree events", () =>
      provide(
        Effect.gen(function* () {
          const { runtime, children, parentRunId } = yield* parentRunFor("origin-events")
          const child = yield* children.admit({
            parentRunId,
            toolCallId: "call-1",
            selection: "researcher",
            prompt: "review",
            key: "reviewer",
            origin: { operationKey: "cell-op", ordinal: 2 },
          })
          // Correlation must be readable from TenetKit's own events, never by parsing the cell source.
          const events = yield* runtime.history({ runId: parentRunId, cursor: -1, limit: 50 })
          const linked = events.find((event) => event._tag === "ChildLinked" && event.childRunId === child.childRunId)
          expect(linked).toBeDefined()
          if (linked === undefined || linked._tag !== "ChildLinked") return
          expect(ChildAdmission.originOf(linked.invocationId)).toEqual({ operationKey: "cell-op", ordinal: 2 })
        }),
      ),
    )

    it.live("orders children of one cell by their host-assigned ordinal", () =>
      provide(
        Effect.gen(function* () {
          const { children, parentRunId } = yield* parentRunFor("origin-order")
          for (const ordinal of [0, 1, 2]) {
            yield* children.admit({
              parentRunId,
              toolCallId: "call-1",
              selection: "researcher",
              prompt: `child ${ordinal}`,
              key: `child-${ordinal}`,
              origin: { operationKey: "cell-op", ordinal },
            })
          }
          const direct = yield* children.listDirect(parentRunId)
          const ordinals = direct.flatMap((entry) => (entry.origin === undefined ? [] : [entry.origin.ordinal]))
          expect([...ordinals].sort((left, right) => left - right)).toEqual([0, 1, 2])
          expect(direct.every((entry) => entry.origin?.operationKey === "cell-op")).toBe(true)
        }),
      ),
    )

    it.live("keeps children of different cells distinguishable under one tool call", () =>
      provide(
        Effect.gen(function* () {
          const { children, parentRunId } = yield* parentRunFor("origin-distinct-cells")
          yield* children.admit({
            parentRunId,
            toolCallId: "call-1",
            selection: "researcher",
            prompt: "a",
            key: "a",
            origin: { operationKey: "cell-one", ordinal: 0 },
          })
          yield* children.admit({
            parentRunId,
            toolCallId: "call-1",
            selection: "researcher",
            prompt: "b",
            key: "b",
            origin: { operationKey: "cell-two", ordinal: 0 },
          })
          const direct = yield* children.listDirect(parentRunId)
          expect(new Set(direct.map((entry) => entry.origin?.operationKey))).toEqual(new Set(["cell-one", "cell-two"]))
        }),
      ),
    )

    it.live("admits without an origin for hosts that do not run cells", () =>
      provide(
        Effect.gen(function* () {
          const { children, parentRunId } = yield* parentRunFor("origin-absent")
          const child = yield* children.admit({
            parentRunId,
            toolCallId: "call-1",
            selection: "researcher",
            prompt: "a",
            key: "plain",
          })
          const direct = yield* children.listDirect(parentRunId)
          expect(direct.find((entry) => entry.childRunId === child.childRunId)?.origin).toBeUndefined()
        }),
      ),
    )

    it.live("rebuilds direct children from durable state rather than caller memory", () =>
      provide(
        Effect.gen(function* () {
          const { store, children, parentRunId } = yield* parentRunFor("rebuild")
          yield* children.admit({
            parentRunId,
            toolCallId: "call-1",
            selection: "researcher",
            prompt: "a",
            key: "first",
          })
          // A fresh operations value holds no memory of the admission.
          const rebuilt = ChildAdmission.make(store)
          expect(yield* rebuilt.listDirect(parentRunId)).toHaveLength(1)
        }),
      ),
    )
  })
}
