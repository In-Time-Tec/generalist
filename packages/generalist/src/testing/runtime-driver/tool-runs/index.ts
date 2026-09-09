import { expect, it } from "@effect/vitest"
import { DateTime, Effect } from "effect"
import { Prompt } from "effect/unstable/ai"
import { makeCapability } from "../../../core/durable/pin.js"
import { digest } from "../../../core/durable/canonical-json.js"
import { make as makeToolManifest } from "../../../core/durable/manifest/tool-manifest.js"
import { make as makeExecutable } from "../../../runtime/executable/manifest.js"
import { requiredPins } from "../../../runtime/executable/registration.js"
import { make as makeAddress } from "../../../runtime/address.js"
import type { ExecutionCheckpoint } from "../../../runtime/execution/state.js"
import type { ExecutionClaim } from "../../../runtime/run/store.js"
import { make as makeMessage } from "../../../runtime/messaging/message.js"
import type { Options, Services, ToolRunsCapability } from "../contract.js"
import { toolSuspension } from "../plural-waits.js"

type Provide<LayerError> = <A, E>(use: (services: Services) => Effect.Effect<A, E>) => Effect.Effect<A, E | LayerError>

const pinned = makeToolManifest({
  name: "runtime-driver-tool",
  tool: makeCapability("runtime-driver-tool:v1"),
  input: makeCapability("runtime-driver-tool:input:v1"),
  output: makeCapability("runtime-driver-tool:output:v1"),
  failure: makeCapability("runtime-driver-tool:failure:v1"),
  replay: "never",
})
const executable = makeExecutable({ root: pinned.pin, entries: [{ _tag: "Tool", ...pinned }] })
const registrations = [...requiredPins(executable)].map((pin) => ({ pin, codec: "test", version: "1", payload: {} }))
const checkpoint: ExecutionCheckpoint = { _tag: "Tool", version: "1" }
const policy = { maxDepth: 0, maxSessions: 1, concurrency: { agents: 0, tools: 1 } } as const

const start = (services: Services, id: string, parentRunId?: string) =>
  services.store.admitStart({
    message: makeMessage({
      id: `message:${id}`,
      to: makeAddress("agent:runtime-driver-tool"),
      sessionId: `session:tool:${id}`,
      idempotencyKey: id,
      correlationId: id,
      prompt: Prompt.make("run the bounded tool"),
      metadata: {
        tool: { input: { value: 1 }, ...(parentRunId === undefined ? undefined : { parentRunId }) },
      },
    }),
    executableRef: executable.ref,
    executableManifest: executable.manifest,
    registrations,
    treePolicy: policy,
    initialChildren: [],
    initialFanOuts: [],
  })

const complete = (services: Services, capability: ToolRunsCapability, runId: string, value: number) =>
  Effect.gen(function* () {
    const claim = yield* capability.claim(services, { runId, commandId: `tool-run-complete:${runId}` })
    yield* services.store.complete({
      ...claim,
      commandId: `tool-run-complete:${runId}:result`,
      result: { _tag: "Tool", isFailure: false, value },
    })
  })

const operation = (runId: string, claim: ExecutionClaim, attempt: number) => ({
  ...claim,
  runId,
  operationKey: `tool:${runId}:${pinned.pin}`,
  kind: "tool" as const,
  inputDigest: digest({ value: 1 }),
  input: { request: { value: 1 } },
  replayPolicy: "never" as const,
  attempt,
  checkpoint,
})

/** Shared independently scheduled Tool Run lifecycle, capacity, uncertainty, and cancellation cases. */
export const registerToolRuns = <LayerError, ClaimsLayerError>(input: {
  readonly options: Options<LayerError, ClaimsLayerError>
  readonly capability: ToolRunsCapability
  readonly provide: Provide<LayerError>
}): void => {
  const { capability, options, provide } = input

  it.effect("bounds Tool capacity independently from Agent and Session capacity", () =>
    provide((services) =>
      Effect.gen(function* () {
        const sponsor = yield* start(services, `tool-capacity:${options.name}:sponsor`)
        yield* complete(services, capability, sponsor.runId, 0)
        const first = yield* start(services, `tool-capacity:${options.name}:first`, sponsor.runId)
        const second = yield* start(services, `tool-capacity:${options.name}:second`, sponsor.runId)
        const firstClaim = yield* capability.claim(services, { runId: first.runId, commandId: "tool-capacity:first" })
        expect(
          (yield* Effect.exit(capability.claim(services, { runId: second.runId, commandId: "tool-capacity:second" })))
            ._tag,
        ).toBe("Failure")
        yield* services.store.complete({
          ...firstClaim,
          commandId: "tool-capacity:first:complete",
          result: { _tag: "Tool", isFailure: false, value: 2 },
        })
        yield* complete(services, capability, second.runId, 3)
        expect((yield* services.runtime.inspect(first.runId)).status).toBe("succeeded")
        expect((yield* services.runtime.inspect(second.runId)).status).toBe("succeeded")
        expect(yield* services.store.listHostSessions).toEqual([])
      }),
    ),
  )

  it.effect("keeps an uncertain Tool outcome blocked until one authoritative resolution on a fresh Layer", () =>
    provide((first) =>
      Effect.gen(function* () {
        const receipt = yield* start(first, `tool-unknown:${options.name}`)
        const claim = yield* capability.claim(first, { runId: receipt.runId, commandId: "tool-unknown:claim" })
        const recorded = yield* first.store.recordOperation(operation(receipt.runId, claim, 1))
        yield* first.store.startOperation({
          ...claim,
          operationId: recorded.operationId,
          commandId: "tool-unknown:start",
        })
        yield* first.store.releaseExecution(claim)
        return { runId: receipt.runId, operationId: recorded.operationId }
      }).pipe(
        Effect.flatMap((state) =>
          provide((second) =>
            Effect.gen(function* () {
              const claim = yield* capability.claim(second, { runId: state.runId, commandId: "tool-unknown:recover" })
              expect(
                yield* second.store.recoverRunningOperations({ ...claim, commandId: "tool-unknown:reconcile" }),
              ).toBe("blocked")
              expect((yield* second.runtime.inspect(state.runId)).status).toBe("needs-resolution")
              expect(
                (yield* second.store.getOperation({ runId: state.runId, operationId: state.operationId })).status,
              ).toBe("unknown")
              const resolution = {
                _tag: "Succeeded" as const,
                value: { _tag: "Success" as const, result: 2, encodedResult: "2" },
              }
              yield* second.runtime.resolveOperation({
                runId: state.runId,
                operationId: state.operationId,
                idempotencyKey: "tool-unknown:resolution",
                resolution,
              })
              yield* second.runtime.resolveOperation({
                runId: state.runId,
                operationId: state.operationId,
                idempotencyKey: "tool-unknown:resolution",
                resolution,
              })
              expect(
                (yield* second.store.getOperation({ runId: state.runId, operationId: state.operationId })).status,
              ).toBe("succeeded")
              const freshClaim = yield* capability.claim(second, {
                runId: state.runId,
                commandId: "tool-unknown:finish",
              })
              yield* second.store.complete({
                ...freshClaim,
                commandId: "tool-unknown:finish:result",
                result: { _tag: "Tool", isFailure: false, value: 2 },
              })
              expect((yield* second.runtime.inspect(state.runId)).status).toBe("succeeded")
            }),
          ),
        ),
      ),
    ),
  )

  it.effect("retains one Tool wait and response across fresh Layers without redispatch", () =>
    provide((first) =>
      Effect.gen(function* () {
        const receipt = yield* start(first, `tool-wait:${options.name}`)
        const claim = yield* capability.claim(first, { runId: receipt.runId, commandId: "tool-wait:claim" })
        const recorded = yield* first.store.recordOperation(operation(receipt.runId, claim, 1))
        yield* first.store.startOperation({ ...claim, operationId: recorded.operationId, commandId: "tool-wait:start" })
        yield* first.store.suspend({
          ...claim,
          checkpoint,
          waits: [
            {
              waitId: "tool-wait:result",
              reason: { _tag: "ToolWait" },
              status: "open",
              openedAt: DateTime.formatIso(DateTime.makeUnsafe(0)),
            },
          ],
          suspension: toolSuspension(["tool-wait:result"]),
        })
        return { runId: receipt.runId, operationId: recorded.operationId }
      }).pipe(
        Effect.flatMap((state) =>
          provide((second) =>
            Effect.gen(function* () {
              yield* second.runtime.respond({
                runId: state.runId,
                waitId: "tool-wait:result",
                resolution: { _tag: "ToolResult", result: 4, encodedResult: "4" },
              })
              const claim = yield* capability.claim(second, { runId: state.runId, commandId: "tool-wait:finish" })
              yield* second.store.completeOperation({
                ...claim,
                operationId: state.operationId,
                outcome: { _tag: "Succeeded", value: { _tag: "Success", result: 4, encodedResult: "4" } },
                checkpoint,
              })
              yield* second.store.complete({
                ...claim,
                commandId: "tool-wait:finish:result",
                result: { _tag: "Tool", isFailure: false, value: 4 },
              })
              const events = yield* second.runtime.history({ runId: state.runId, limit: 100 })
              expect(events.filter((event) => event._tag === "RunResumed")).toHaveLength(1)
              expect(
                (yield* second.store.getOperation({ runId: state.runId, operationId: state.operationId })).status,
              ).toBe("succeeded")
              expect((yield* second.runtime.inspect(state.runId)).status).toBe("succeeded")
            }),
          ),
        ),
      ),
    ),
  )

  it.effect("cancels a queued Tool Run without creating an Agent Session or a second terminal event", () =>
    provide((services) =>
      Effect.gen(function* () {
        const receipt = yield* start(services, `tool-cancel:${options.name}`)
        yield* services.runtime.cancel({ runId: receipt.runId, commandId: "tool-cancel:request", reason: "stop" })
        yield* services.runtime.cancel({ runId: receipt.runId, commandId: "tool-cancel:request", reason: "stop" })
        expect((yield* services.runtime.inspect(receipt.runId)).status).toBe("cancelled")
        expect(
          (yield* services.runtime.history({ runId: receipt.runId, limit: 100 })).filter(
            (event) => event._tag === "RunCancelled",
          ),
        ).toHaveLength(1)
        expect(yield* services.store.listHostSessions).toEqual([])
      }),
    ),
  )
}
