import { expect } from "@effect/vitest"
import { Effect } from "effect"
import { AgentSuspended } from "../../core/agent/event.js"
import type { Address } from "../../runtime/address.js"
import { ResponseConflict, RuntimeUnavailable } from "../../runtime/errors.js"
import type { RuntimeCapability, Services } from "./index.js"

export const toolSuspension = (waitIds: readonly [string, ...Array<string>]): AgentSuspended => {
  const calls = waitIds.map((waitId) => ({
    type: "tool-call" as const,
    id: waitId,
    name: "conformance",
    params: {},
    providerExecuted: false,
    metadata: {},
  }))
  return AgentSuspended.make({
    checkpoint: {
      turn: 0,
      calls: calls.map((call) => ({
        call,
        operationKey: `conformance:${call.id}`,
        state: { _tag: "Waiting", reason: "tool-wait", waitId: call.id, token: call.id },
      })),
      activeTools: [calls[0]!.name],
      activatedSkills: [],
      invocationPath: [],
    },
    waits: calls.map((call, callIndex) => ({
      waitId: call.id,
      token: call.id,
      reason: "tool-wait" as const,
      callIndex,
      call,
    })),
  })
}

export const pluralWaitsConformance = (input: {
  readonly name: string
  readonly address: Address
  readonly services: Services
  readonly capability: RuntimeCapability
}) =>
  Effect.gen(function* () {
    const prefix = `conformance:${input.name.replace(/[^A-Za-z0-9]+/g, "-").toLowerCase()}:runtime-plural-waits`
    const receipt = yield* input.services.runtime.send({
      to: input.address,
      sessionId: `session:${prefix}`,
      idempotencyKey: prefix,
      prompt: "wait for three responses",
    })
    const claim = yield* input.capability.claim(input.services, { runId: receipt.runId, workerId: "plural-a" })
    const waitIds = ["a", "b", "c"].map((suffix) => `${prefix}:${suffix}`)
    const waits = waitIds.map((waitId, authoredOrder) => ({
      waitId,
      reason: { _tag: "ToolWait" as const },
      status: "open" as const,
      openedAt: `2026-08-29T00:00:0${authoredOrder}.000Z`,
    }))
    const suspension = toolSuspension([waitIds[0]!, waitIds[1]!, waitIds[2]!])
    yield* input.services.store.suspend({ ...claim, waits, suspension })
    expect((yield* input.services.runtime.inspect(receipt.runId)).waits.map((wait) => wait.waitId)).toEqual(waitIds)

    const firstResolution = { _tag: "ToolResult" as const, result: "first", encodedResult: "first" }
    const thirdResolution = { _tag: "ToolResult" as const, result: "third", encodedResult: "third" }
    yield* Effect.all(
      [
        input.services.runtime.respond({ runId: receipt.runId, waitId: waitIds[0]!, resolution: firstResolution }),
        input.services.runtime.respond({ runId: receipt.runId, waitId: waitIds[2]!, resolution: thirdResolution }),
      ],
      { concurrency: "unbounded" },
    )
    expect((yield* input.services.runtime.inspect(receipt.runId)).waits.map((wait) => wait.waitId)).toEqual([
      waitIds[1],
    ])

    yield* input.services.runtime.respond({ runId: receipt.runId, waitId: waitIds[0]!, resolution: firstResolution })
    const conflict = yield* input.services.runtime
      .respond({
        runId: receipt.runId,
        waitId: waitIds[0]!,
        resolution: { _tag: "ToolResult", result: "changed", encodedResult: "changed" },
      })
      .pipe(Effect.flip)
    expect(conflict).toBeInstanceOf(ResponseConflict)
    expect((yield* input.services.runtime.inspect(receipt.runId)).waits.map((wait) => wait.waitId)).toEqual([
      waitIds[1],
    ])

    yield* input.services.runtime.respond({
      runId: receipt.runId,
      waitId: waitIds[1]!,
      resolution: { _tag: "ToolResult", result: "second", encodedResult: "second" },
    })
    expect((yield* input.services.runtime.inspect(receipt.runId)).waits).toEqual([])
    const beforeReopen = yield* input.services.runtime.history({ runId: receipt.runId, limit: 100 })
    const resumed = beforeReopen.filter((event) => event._tag === "RunResumed")
    expect(resumed).toHaveLength(3)
    expect(resumed.map((event) => event.waitId).toSorted()).toEqual(waitIds.toSorted())

    const reclaim = yield* input.capability.claim(input.services, { runId: receipt.runId, workerId: "plural-b" })
    const reopen = yield* input.services.store.suspend({ ...reclaim, waits, suspension }).pipe(Effect.flip)
    expect(reopen).toBeInstanceOf(RuntimeUnavailable)
    expect((yield* input.services.runtime.inspect(receipt.runId)).waits).toEqual([])
    expect(yield* input.services.runtime.history({ runId: receipt.runId, limit: 100 })).toEqual(beforeReopen)
  })
