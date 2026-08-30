import "./suites/session-suite.js"
import { describe, expect, it as standalone, layer } from "@effect/vitest"
import { Effect, Layer } from "effect"
import { DurableDriver, ToolContext } from "../../../src/index.js"
import { ChildAdmission, Runtime, RunStore } from "../../../src/runtime/index.js"
import { assistantAddress, memoryLayer, textPrompt } from "../execution/fixtures.js"
import { provideScoped } from "../execution/scoped-provide.js"

const sessionId = "session:child-origin"

const ambient = (input: { readonly runId?: string; readonly toolCallId?: string; readonly operationKey?: string }) => {
  const base = {
    signal: new AbortController().signal,
    emit: () => Effect.succeed(true),
    sessionId,
  }
  const withRun = input.runId === undefined ? base : { ...base, runId: input.runId }
  const withToolCall = input.toolCallId === undefined ? withRun : { ...withRun, toolCallId: input.toolCallId }
  const context: ToolContext.Service =
    input.operationKey === undefined ? withToolCall : { ...withToolCall, operationKey: input.operationKey }
  return ToolContext.layerTest(context)
}

const interpreter = DurableDriver.layerTest({
  driver: DurableDriver.makeLoopDriver({ logicalOperationId: "run:child-origin", sessionId }),
  initial: {
    driverVersion: DurableDriver.currentDriverVersion,
    turn: 0,
    budget: { allocation: {}, remaining: {}, depth: 0 },
    state: {
      logicalOperationId: "run:child-origin",
      sessionId,
      modelCallOrdinal: 0,
      modelCallOrdinalStart: 0,
    },
  },
  journal: {
    onScheduled: () => Effect.void,
    onCompleted: () => Effect.void,
    onCheckpoint: () => Effect.void,
  },
})

const withCell =
  (input: { readonly runId?: string; readonly toolCallId?: string; readonly operationKey?: string }) =>
  <A, E, R>(effect: Effect.Effect<A, E, R>) =>
    provideScoped(Layer.merge(ambient(input), interpreter), effect)

const parentRun = (label: string) =>
  Effect.gen(function* () {
    const runtime = yield* Runtime.Runtime
    const store = yield* RunStore.RunStore
    const receipt = yield* runtime.send({
      to: assistantAddress,
      sessionId: `${sessionId}:${label}`,
      idempotencyKey: `child-origin:${label}`,
      prompt: textPrompt("plan"),
    })
    return {
      runtime,
      store,
      operations: ChildAdmission.make(store),
      children: ChildAdmission.makeAgentChildren(store),
      parentRunId: receipt.runId,
    }
  })

const spawn = (key: string) => ({ selection: "researcher", prompt: `work ${key}`, key })

/** A realistic durable operation key: colon-joined by the loop driver, exactly as production builds it. */
const cellOperationKey = "run:child-origin:tool:0:call-1:typescript"

describe("child origin encoding", () => {
  standalone("round-trips an operation key that contains the separators the encoding uses", () => {
    const invocationId = ChildAdmission.invocationIdFor({
      toolCallId: "call-1",
      key: "reviewer",
      origin: { operationKey: cellOperationKey, ordinal: 3 },
    })
    expect(ChildAdmission.originOf(invocationId)).toEqual({ operationKey: cellOperationKey, ordinal: 3 })
  })

  standalone("round-trips an admission key that contains separators", () => {
    const invocationId = ChildAdmission.invocationIdFor({
      toolCallId: "call:1",
      key: "a:b#c",
      origin: { operationKey: "cell#7", ordinal: 0 },
    })
    expect(ChildAdmission.originOf(invocationId)).toEqual({ operationKey: "cell#7", ordinal: 0 })
  })

  standalone("reads no origin from an invocation id that carries none", () => {
    expect(
      ChildAdmission.originOf(ChildAdmission.invocationIdFor({ toolCallId: "call-1", key: "plain" })),
    ).toBeUndefined()
  })

  standalone("reads no origin from an unrelated invocation id", () => {
    expect(ChildAdmission.originOf("invocation:first")).toBeUndefined()
  })

  standalone("distinguishes two operation keys that differ only where a separator sits", () => {
    const left = ChildAdmission.invocationIdFor({
      toolCallId: "call-1",
      key: "k",
      origin: { operationKey: "a:b", ordinal: 0 },
    })
    const right = ChildAdmission.invocationIdFor({
      toolCallId: "call-1",
      key: "k",
      origin: { operationKey: "a", ordinal: 0 },
    })
    expect(left).not.toBe(right)
    expect(ChildAdmission.originOf(left)?.operationKey).toBe("a:b")
    expect(ChildAdmission.originOf(right)?.operationKey).toBe("a")
  })
})

layer(memoryLayer)("child origin from the in-execution cell seam", (it) => {
  it.effect("assigns ordinals 0 and 1 to two children admitted from one cell, in admission order", () =>
    Effect.gen(function* () {
      const { children, operations, parentRunId } = yield* parentRun("two-children")
      const cell = { runId: parentRunId, toolCallId: "call-1", operationKey: cellOperationKey }

      const first = yield* children.admit(spawn("first")).pipe(withCell(cell))
      const second = yield* children.admit(spawn("second")).pipe(withCell(cell))

      const direct = yield* operations.listDirect(parentRunId)
      const originOf = (childRunId: string) => direct.find((entry) => entry.childRunId === childRunId)?.origin
      expect(originOf(first.childRunId)).toEqual({ operationKey: cellOperationKey, ordinal: 0 })
      expect(originOf(second.childRunId)).toEqual({ operationKey: cellOperationKey, ordinal: 1 })
    }),
  )

  it.effect("keeps ordinals dense and ordered for many children of one cell", () =>
    Effect.gen(function* () {
      const { children, operations, parentRunId } = yield* parentRun("many-children")
      const cell = { runId: parentRunId, toolCallId: "call-1", operationKey: cellOperationKey }
      const keys = ["a", "b", "c", "d", "e"]

      const receipts = yield* Effect.forEach(keys, (key) => children.admit(spawn(key)).pipe(withCell(cell)), {
        concurrency: 1,
      })

      const direct = yield* operations.listDirect(parentRunId)
      const ordinals = receipts.map(
        (receipt) => direct.find((entry) => entry.childRunId === receipt.childRunId)?.origin?.ordinal,
      )
      expect(ordinals).toEqual([0, 1, 2, 3, 4])
    }),
  )

  it.effect("distinguishes children of different cells under one tool call", () =>
    Effect.gen(function* () {
      const { children, operations, parentRunId } = yield* parentRun("distinct-cells")
      const firstCell = "run:child-origin:tool:0:call-1:typescript"
      const secondCell = "run:child-origin:tool:1:call-1:typescript"

      const first = yield* children
        .admit(spawn("from-first"))
        .pipe(withCell({ runId: parentRunId, toolCallId: "call-1", operationKey: firstCell }))
      const second = yield* children
        .admit(spawn("from-second"))
        .pipe(withCell({ runId: parentRunId, toolCallId: "call-1", operationKey: secondCell }))

      const direct = yield* operations.listDirect(parentRunId)
      const originOf = (childRunId: string) => direct.find((entry) => entry.childRunId === childRunId)?.origin
      expect(originOf(first.childRunId)).toEqual({ operationKey: firstCell, ordinal: 0 })
      expect(originOf(second.childRunId)).toEqual({ operationKey: secondCell, ordinal: 0 })
    }),
  )

  it.effect("restarts ordinals per cell rather than sharing one counter across cells", () =>
    Effect.gen(function* () {
      const { children, operations, parentRunId } = yield* parentRun("per-cell-counter")
      const firstCell = "cell:one"
      const secondCell = "cell:two"

      yield* children.admit(spawn("a")).pipe(withCell({ runId: parentRunId, toolCallId: "c", operationKey: firstCell }))
      yield* children.admit(spawn("b")).pipe(withCell({ runId: parentRunId, toolCallId: "c", operationKey: firstCell }))
      const third = yield* children
        .admit(spawn("c"))
        .pipe(withCell({ runId: parentRunId, toolCallId: "c", operationKey: secondCell }))

      const direct = yield* operations.listDirect(parentRunId)
      expect(direct.find((entry) => entry.childRunId === third.childRunId)?.origin).toEqual({
        operationKey: secondCell,
        ordinal: 0,
      })
    }),
  )

  it.effect("survives into the real ChildLinked event and back out through originOf", () =>
    Effect.gen(function* () {
      const { runtime, children, parentRunId } = yield* parentRun("child-linked")
      const cell = { runId: parentRunId, toolCallId: "call-1", operationKey: cellOperationKey }

      yield* children.admit(spawn("first")).pipe(withCell(cell))
      const receipt = yield* children.admit(spawn("second")).pipe(withCell(cell))

      const events = yield* runtime.history({ runId: parentRunId, cursor: -1, limit: 50 })
      const linked = events.find((event) => event._tag === "ChildLinked" && event.childRunId === receipt.childRunId)
      expect(linked).toBeDefined()
      if (linked === undefined || linked._tag !== "ChildLinked") return
      expect(ChildAdmission.originOf(linked.invocationId)).toEqual({ operationKey: cellOperationKey, ordinal: 1 })
    }),
  )

  it.effect("ignores an origin and ordinal supplied by the caller payload", () =>
    Effect.gen(function* () {
      const { children, operations, parentRunId } = yield* parentRun("forged-origin")
      const cell = { runId: parentRunId, toolCallId: "call-1", operationKey: cellOperationKey }
      const forged = Object.assign(spawn("forger"), {
        ...spawn("forger"),
        origin: { operationKey: "attacker-cell", ordinal: 99 },
        operationKey: "attacker-cell",
      })

      const receipt = yield* children.admit(forged).pipe(withCell(cell))

      const direct = yield* operations.listDirect(parentRunId)
      expect(direct.find((entry) => entry.childRunId === receipt.childRunId)?.origin).toEqual({
        operationKey: cellOperationKey,
        ordinal: 0,
      })
    }),
  )

  it.effect("cannot be pushed out of order by a caller-supplied ordinal on a later admission", () =>
    Effect.gen(function* () {
      const { children, operations, parentRunId } = yield* parentRun("forged-order")
      const cell = { runId: parentRunId, toolCallId: "call-1", operationKey: cellOperationKey }

      const first = yield* children.admit(spawn("first")).pipe(withCell(cell))
      const second = yield* children
        .admit(
          Object.assign(spawn("second"), {
            origin: { operationKey: cellOperationKey, ordinal: 0 },
          }),
        )
        .pipe(withCell(cell))

      const direct = yield* operations.listDirect(parentRunId)
      const originOf = (childRunId: string) => direct.find((entry) => entry.childRunId === childRunId)?.origin
      expect(originOf(first.childRunId)?.ordinal).toBe(0)
      expect(originOf(second.childRunId)?.ordinal).toBe(1)
    }),
  )

  it.effect("keeps one admission key naming one child when the cell re-admits it", () =>
    Effect.gen(function* () {
      const { children, operations, parentRunId } = yield* parentRun("idempotent-ordinal")
      const cell = { runId: parentRunId, toolCallId: "call-1", operationKey: cellOperationKey }

      const first = yield* children.admit(spawn("reviewer")).pipe(withCell(cell))
      const again = yield* children.admit(spawn("reviewer")).pipe(withCell(cell))

      expect(again.childRunId).toBe(first.childRunId)
      expect(again.duplicate).toBe(true)
      expect(yield* operations.listDirect(parentRunId)).toHaveLength(1)
    }),
  )

  it.effect("gives a re-admitted key its original ordinal rather than advancing the counter", () =>
    Effect.gen(function* () {
      const { children, operations, parentRunId } = yield* parentRun("stable-ordinal")
      const cell = { runId: parentRunId, toolCallId: "call-1", operationKey: cellOperationKey }

      yield* children.admit(spawn("first")).pipe(withCell(cell))
      yield* children.admit(spawn("first")).pipe(withCell(cell))
      const second = yield* children.admit(spawn("second")).pipe(withCell(cell))

      const direct = yield* operations.listDirect(parentRunId)
      expect(direct).toHaveLength(2)
      expect(direct.find((entry) => entry.childRunId === second.childRunId)?.origin?.ordinal).toBe(1)
    }),
  )

  it.effect("scopes the counter per parent Run so one cell key cannot leak ordinals across Runs", () =>
    Effect.gen(function* () {
      const store = yield* RunStore.RunStore
      const children = ChildAdmission.makeAgentChildren(store)
      const operations = ChildAdmission.make(store)
      const left = yield* parentRun("scope-left")
      const right = yield* parentRun("scope-right")

      yield* children
        .admit(spawn("a"))
        .pipe(withCell({ runId: left.parentRunId, toolCallId: "call-1", operationKey: "shared-cell" }))
      const other = yield* children
        .admit(spawn("b"))
        .pipe(withCell({ runId: right.parentRunId, toolCallId: "call-1", operationKey: "shared-cell" }))

      const direct = yield* operations.listDirect(right.parentRunId)
      expect(direct.find((entry) => entry.childRunId === other.childRunId)?.origin).toEqual({
        operationKey: "shared-cell",
        ordinal: 0,
      })
    }),
  )

  it.effect("returns the same children when a replayed cell re-admits the same spawns", () =>
    Effect.gen(function* () {
      const { children, operations, parentRunId } = yield* parentRun("replayed-cell")
      const cell = { runId: parentRunId, toolCallId: "call-1", operationKey: cellOperationKey }

      const first = yield* children.admit(spawn("first")).pipe(withCell(cell))
      const second = yield* children.admit(spawn("second")).pipe(withCell(cell))

      // The execution is replayed: the cell runs again and issues the identical spawns.
      const replayedFirst = yield* children.admit(spawn("first")).pipe(withCell(cell))
      const replayedSecond = yield* children.admit(spawn("second")).pipe(withCell(cell))

      expect(replayedFirst.childRunId).toBe(first.childRunId)
      expect(replayedSecond.childRunId).toBe(second.childRunId)
      expect(replayedFirst.duplicate).toBe(true)
      expect(replayedSecond.duplicate).toBe(true)
      expect(yield* operations.listDirect(parentRunId)).toHaveLength(2)
    }),
  )

  it.effect("keeps ordinals stable across a host restart that loses every in-process counter", () =>
    Effect.gen(function* () {
      const store = yield* RunStore.RunStore
      const { children, operations, parentRunId } = yield* parentRun("restarted-host")
      const cell = { runId: parentRunId, toolCallId: "call-1", operationKey: cellOperationKey }

      yield* children.admit(spawn("first")).pipe(withCell(cell))
      const second = yield* children.admit(spawn("second")).pipe(withCell(cell))

      // A restarted Server builds a fresh value that holds no memory of either admission.
      const restarted = ChildAdmission.makeAgentChildren(store)
      const afterRestart = yield* restarted.admit(spawn("second")).pipe(withCell(cell))
      const third = yield* restarted.admit(spawn("third")).pipe(withCell(cell))

      expect(afterRestart.childRunId).toBe(second.childRunId)
      expect(afterRestart.duplicate).toBe(true)
      const direct = yield* operations.listDirect(parentRunId)
      expect(direct).toHaveLength(3)
      expect(direct.find((entry) => entry.childRunId === third.childRunId)?.origin?.ordinal).toBe(2)
    }),
  )

  it.effect("does not duplicate a child when a restarted host re-admits one spawn of many", () =>
    Effect.gen(function* () {
      const store = yield* RunStore.RunStore
      const { children, operations, parentRunId } = yield* parentRun("partial-replay")
      const cell = { runId: parentRunId, toolCallId: "call-1", operationKey: cellOperationKey }

      yield* Effect.forEach(["a", "b", "c"], (key) => children.admit(spawn(key)).pipe(withCell(cell)), {
        concurrency: 1,
      })

      // Only the middle spawn is re-issued after the restart; it must keep its original ordinal.
      const restarted = ChildAdmission.makeAgentChildren(store)
      const again = yield* restarted.admit(spawn("b")).pipe(withCell(cell))

      const direct = yield* operations.listDirect(parentRunId)
      expect(direct).toHaveLength(3)
      expect(direct.find((entry) => entry.childRunId === again.childRunId)?.origin?.ordinal).toBe(1)
    }),
  )

  it.effect("never reuses an ordinal already taken under the operation, even a sparse one", () =>
    Effect.gen(function* () {
      const store = yield* RunStore.RunStore
      const { operations, parentRunId } = yield* parentRun("sparse-ordinals")
      const children = ChildAdmission.makeAgentChildren(store)
      const cell = { runId: parentRunId, toolCallId: "call-1", operationKey: cellOperationKey }

      // A host-level admission recorded ordinal 4 directly, leaving 0..3 unused.
      yield* operations.admit({
        parentRunId,
        toolCallId: "call-1",
        selection: "researcher",
        prompt: "sparse",
        key: "sparse",
        origin: { operationKey: cellOperationKey, ordinal: 4 },
      })

      const next = yield* children.admit(spawn("after-sparse")).pipe(withCell(cell))

      const direct = yield* operations.listDirect(parentRunId)
      const taken = direct.flatMap((entry) => (entry.origin === undefined ? [] : [entry.origin.ordinal]))
      expect(direct.find((entry) => entry.childRunId === next.childRunId)?.origin?.ordinal).toBe(5)
      expect(new Set(taken).size).toBe(taken.length)
    }),
  )

  it.effect("admits without an origin when the execution carries no operation key", () =>
    Effect.gen(function* () {
      const { children, operations, parentRunId } = yield* parentRun("no-operation-key")

      const receipt = yield* children.admit(spawn("plain")).pipe(withCell({ runId: parentRunId, toolCallId: "call-1" }))

      const direct = yield* operations.listDirect(parentRunId)
      expect(direct.find((entry) => entry.childRunId === receipt.childRunId)?.origin).toBeUndefined()
    }),
  )

  it.effect("does not spend an ordinal on an admission that never reaches the store", () =>
    Effect.gen(function* () {
      const { children, operations, parentRunId } = yield* parentRun("failed-admission")
      const cell = { runId: parentRunId, toolCallId: "call-1", operationKey: cellOperationKey }

      // No tool call in the ambient context: identity is derived and refused before an ordinal is assigned.
      yield* children
        .admit(spawn("refused"))
        .pipe(withCell({ runId: parentRunId, operationKey: cellOperationKey }), Effect.flip)
      const admitted = yield* children.admit(spawn("accepted")).pipe(withCell(cell))

      const direct = yield* operations.listDirect(parentRunId)
      expect(direct).toHaveLength(1)
      expect(direct.find((entry) => entry.childRunId === admitted.childRunId)?.origin?.ordinal).toBe(0)
    }),
  )
})
