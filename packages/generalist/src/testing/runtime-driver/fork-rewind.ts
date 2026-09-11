import { expect, it } from "@effect/vitest"
import { Effect, Layer, Option, Schema, Stream } from "effect"
import { LanguageModel, Response, Tool, Toolkit } from "effect/unstable/ai"
import { make as makeAgent } from "../../core/agent/service.js"
import { layerAutoApprove } from "../../core/policy/approvals.js"
import { layerAllowAll } from "../../core/policy/permissions.js"
import { AgentExecutionFailure } from "../../runtime/errors.js"
import { make as interruptedResponse } from "../../runtime/execution/model-response/interrupted.js"
import type { ForkRewindCapability, Options, Services } from "./contract.js"
import { registerRetainedAndInherited } from "./payload/inheritance.js"
import { registerTurnCompletedTransition } from "./fork-rewind/turn-completed.js"

interface Registration<LayerError, ClaimsLayerError> {
  readonly options: Options<LayerError, ClaimsLayerError>
  readonly capability: ForkRewindCapability
  readonly prepare: <A, E>(effect: Effect.Effect<A, E>) => Effect.Effect<A, E>
  readonly open: <A, E>(use: (services: Services) => Effect.Effect<A, E>) => Effect.Effect<A, E | LayerError>
  readonly provide: <A, E>(use: (services: Services) => Effect.Effect<A, E>) => Effect.Effect<A, E | LayerError>
}

const finish = Response.makePart("finish", {
  reason: "stop",
  usage: Response.Usage.make({
    inputTokens: { total: 1, uncached: 1, cacheRead: undefined, cacheWrite: undefined },
    outputTokens: { total: 1, text: 1, reasoning: undefined },
  }),
  response: undefined,
})

const slug = (value: string): string => value.replace(/[^A-Za-z0-9]+/g, "-").toLowerCase()
const jsonText = Schema.encodeSync(Schema.fromJsonString(Schema.Unknown))
const awaitTerminal = (services: Services, runId: string) =>
  Effect.gen(function* () {
    let inspection = yield* services.runtime.inspect(runId)
    for (let attempt = 0; attempt < 100; attempt += 1) {
      if (inspection.status === "succeeded" || inspection.status === "failed" || inspection.status === "cancelled")
        return inspection
      yield* Effect.sleep("50 millis")
      inspection = yield* services.runtime.inspect(runId)
    }
    return inspection
  })

const semanticEvent = (event: { readonly runId: string; readonly rootRunId: string; readonly eventId: string }) => {
  const { runId: _runId, rootRunId: _rootRunId, eventId: _eventId, ...semantic } = event
  return semantic
}

const gapFree = (path: ReadonlyArray<{ readonly id: string; readonly parentId: string | null }>): boolean =>
  path.every((entry, index) => entry.parentId === (path[index - 1]?.id ?? null))

/** Register the shared journal-prefix fork and retained-rewind-branch contract. */
export const registerForkRewind = <LayerError, ClaimsLayerError>(
  registration: Registration<LayerError, ClaimsLayerError>,
): void => {
  const { capability, open, options, prepare, provide } = registration
  registerRetainedAndInherited(registration)

  it.effect("keeps inherited interrupted responses self-contained through source rewind and reopen", () => {
    const name = slug(options.name)
    const scenario = (services: Services) =>
      Effect.gen(function* () {
        const receipt = yield* services.runtime.send({
          to: options.address,
          sessionId: `session:conformance:${name}:inherited-interruption`,
          idempotencyKey: `inherited-interruption:${name}`,
          prompt: "retain an interrupted response",
        })
        const claim = yield* capability.claim(services, { runId: receipt.runId, commandId: "inherited-interruption" })
        const operationKey = `${receipt.runId}:model:interrupted`
        const operation = yield* services.store.recordOperation({
          ...claim,
          operationKey,
          kind: "model",
          inputDigest: "interrupted-input",
          input: { turn: 0 },
          replayPolicy: "never",
          attempt: 0,
        })
        yield* services.store.startOperation({
          ...claim,
          commandId: `${claim.runId}:start:${operation.operationId}:0`,
          operationId: operation.operationId,
        })
        yield* services.store.commitInterruptedModelResponse({
          ...claim,
          operationId: operation.operationId,
          outcome: {
            _tag: "Failed",
            error: AgentExecutionFailure.make({ message: "model interrupted after durable output" }),
          },
          event: interruptedResponse({
            turn: 0,
            operationKey,
            modelCallId: `${receipt.runId}:call`,
            modelAttemptId: `${receipt.runId}:attempt`,
            attempt: 0,
            sessionParentId: null,
            response: { content: [Response.makePart("text", { text: "retained partial response" })] },
            reason: "failure",
          }),
        })
        const event = (yield* services.runtime.history({ runId: receipt.runId, limit: 100 })).find(
          (candidate) => candidate._tag === "ModelResponseInterrupted",
        )
        if (event?._tag !== "ModelResponseInterrupted") return yield* Effect.die("missing interrupted response")
        yield* services.store.releaseExecution(claim)
        const forkRunId = `${receipt.runId}:interrupted-fork`
        yield* services.store.fork({
          runId: receipt.runId,
          commandId: `fork:${forkRunId}`,
          newRunId: forkRunId,
          atSequence: event.sequence,
        })
        yield* services.store.rewind({
          runId: receipt.runId,
          commandId: `rewind:${receipt.runId}:interrupted-discarded`,
          branchRunId: `${receipt.runId}:interrupted-discarded`,
          toSequence: 0,
        })
        const copied = (yield* services.runtime.history({ runId: forkRunId, limit: 100 })).find(
          (candidate) => candidate._tag === "ModelResponseInterrupted",
        )
        if (copied?._tag !== "ModelResponseInterrupted") return yield* Effect.die("missing copied interruption")
        const response = yield* services.runtime.resolveModelResponse(copied)
        expect(response.content.some((part) => part.type === "text" && part.text === "retained partial response")).toBe(
          true,
        )
        expect(
          yield* services.store.getOperationByKey({ runId: forkRunId, operationKey: copied.operationKey }),
        ).toMatchObject({
          status: "failed",
          replayPolicy: "never",
        })
        return {
          forkRunId,
          operationKey: copied.operationKey,
        }
      })
    const verify = (services: Services, forkRunId: string, operationKey: string) =>
      Effect.gen(function* () {
        const copied = (yield* services.runtime.history({ runId: forkRunId, limit: 100 })).find(
          (candidate) => candidate._tag === "ModelResponseInterrupted",
        )
        if (copied?._tag !== "ModelResponseInterrupted") return yield* Effect.die("missing reopened interruption")
        yield* services.runtime.resolveModelResponse(copied)
        expect(yield* services.store.getOperationByKey({ runId: forkRunId, operationKey })).toMatchObject({
          status: "failed",
          replayPolicy: "never",
        })
      })
    return prepare(
      open(scenario).pipe(
        Effect.flatMap((result) => open((services) => verify(services, result.forkRunId, result.operationKey))),
        Effect.orDie,
      ),
    )
  })

  it.effect("forks an exact prefix and retains the discarded rewind suffix as a branch", () =>
    provide((services) =>
      Effect.gen(function* () {
        const identity = `conformance:${options.name}:fork-rewind`
        const source = yield* services.runtime.send({
          to: options.address,
          sessionId: `session:${identity}`,
          idempotencyKey: identity,
          prompt: "fork and rewind",
        })
        const plainForkRunId = `${source.runId}:plain-fork`
        yield* services.store.fork({
          runId: source.runId,
          commandId: `fork:${plainForkRunId}`,
          newRunId: plainForkRunId,
          atSequence: 0,
        })
        expect((yield* services.store.inspect(source.runId)).branches).toContainEqual({
          runId: plainForkRunId,
          forkedAt: 0,
        })
        const claim = yield* capability.claim(services, { runId: source.runId, commandId: "fork-rewind" })
        yield* services.store.emitAgentEvent({
          ...claim,
          commandId: `${source.runId}:snapshot-unavailable`,
          event: {
            _tag: "ToolProgress",
            turn: 0,
            toolCallId: "sandbox",
            message: "SandboxSnapshot",
            data: { _tag: "SandboxSnapshotUnavailable" },
          },
        })
        const unavailableAt = (yield* services.store.inspect(source.runId)).lastSequence
        yield* services.store.releaseExecution(claim)
        const noSnapshot = yield* services.store
          .fork({
            runId: source.runId,
            commandId: `fork:${source.runId}:no-snapshot`,
            newRunId: `${source.runId}:no-snapshot`,
            atSequence: unavailableAt,
          })
          .pipe(Effect.flip)
        expect(noSnapshot._tag).toBe("generalist/runtime/NoSnapshot")
        const availableClaim = yield* capability.claim(services, {
          runId: source.runId,
          commandId: "fork-rewind-snapshot-available",
        })
        yield* services.store.emitAgentEvent({
          ...availableClaim,
          commandId: `${source.runId}:snapshot-available`,
          event: {
            _tag: "ToolProgress",
            turn: 0,
            toolCallId: "sandbox",
            message: "SandboxSnapshot",
            data: { _tag: "SandboxSnapshot", snapshotId: "snapshot:fork-rewind" },
          },
        })
        const forkAt = (yield* services.store.inspect(source.runId)).lastSequence
        yield* services.store.emitAgentEvent({
          ...availableClaim,
          commandId: `${availableClaim.runId}:event:TurnStarted:1`,
          event: { _tag: "TurnStarted", turn: 1 },
        })
        yield* services.store.releaseExecution(availableClaim)
        const forkRunId = `${source.runId}:fork`
        yield* services.store.fork({
          runId: source.runId,
          commandId: `fork:${forkRunId}`,
          newRunId: forkRunId,
          atSequence: forkAt,
        })
        const sourcePrefix = yield* services.store.history({ runId: source.runId, cursor: -1, limit: forkAt + 1 })
        const forkPrefix = yield* services.store.history({ runId: forkRunId, cursor: -1, limit: forkAt + 1 })
        expect(forkPrefix.map(semanticEvent)).toEqual(sourcePrefix.map(semanticEvent))
        expect((yield* services.store.inspect(source.runId)).branches).toContainEqual({
          runId: forkRunId,
          forkedAt: forkAt,
        })

        const branchRunId = `${source.runId}:discarded`
        yield* services.store.rewind({
          runId: source.runId,
          commandId: `rewind:${branchRunId}`,
          branchRunId,
          toSequence: forkAt,
        })
        const inspection = yield* services.store.inspect(source.runId)
        // Rewind restores the selected execution branch while retaining the canonical audit suffix.
        expect(inspection.lastSequence).toBeGreaterThan(forkAt)
        const retainedSuffix = yield* services.store.history({ runId: source.runId, cursor: forkAt, limit: 100 })
        expect(retainedSuffix.some((event) => event._tag === "TurnStarted" && event.turn === 1)).toBe(true)
        expect(inspection.branches).toEqual(
          expect.arrayContaining([
            { runId: plainForkRunId, forkedAt: 0 },
            { runId: forkRunId, forkedAt: forkAt },
            { runId: branchRunId, forkedAt: forkAt },
          ]),
        )
        expect((yield* services.store.inspect(branchRunId)).lastSequence).toBeGreaterThan(forkAt)
      }),
    ),
  )

  it.effect("continues a completed-tool rewind on a gap-free Session path without redispatch", () => {
    const name = slug(options.name)
    const sessionId = `session:conformance:${name}:completed-tool-rewind`
    let modelCalls = 0
    let toolCalls = 0
    const lookup = Tool.make("rewind_lookup", {
      parameters: Schema.Struct({ key: Schema.String }),
      success: Schema.String,
    })
    const toolkit = Toolkit.make(lookup)
    const agent = makeAgent({ name: `driver-${name}-completed-tool-rewind`, toolkit })
    const model = Layer.effect(
      LanguageModel.LanguageModel,
      LanguageModel.make({
        generateText: () => Effect.succeed([{ type: "text" as const, text: "unused" }]),
        streamText: () => {
          modelCalls += 1
          if (modelCalls === 1) {
            return Stream.fromIterable<Response.StreamPartEncoded>([
              Response.makePart("tool-call", {
                id: "rewind-lookup-1",
                name: "rewind_lookup",
                params: { key: "status" },
                providerExecuted: false,
              }),
              finish,
            ])
          }
          return Stream.fromIterable<Response.StreamPartEncoded>([
            Response.makePart("text-delta", {
              id: modelCalls === 2 ? "source" : "rewound",
              delta: modelCalls === 2 ? "source future" : "rewound follow-up",
            }),
            finish,
          ])
        },
      }),
    )
    const handlers = toolkit.toLayer({
      rewind_lookup: ({ key }) =>
        Effect.sync(() => {
          toolCalls += 1
          return key === "status" ? "original-blue" : "unknown"
        }),
    })
    const environment = Layer.mergeAll(model, handlers, layerAllowAll, layerAutoApprove)
    const register = (runtime: Services["runtime"]) =>
      Effect.scoped(
        Layer.build(environment).pipe(
          Effect.flatMap((context) => runtime.register(agent).pipe(Effect.provideContext(context))),
        ),
      )
    const inspectSession = (
      services: Services,
      expected: { readonly source: ReadonlyArray<string>; readonly branch: string },
    ) =>
      Effect.gen(function* () {
        const sourceSession = Option.getOrThrow(yield* services.store.sessionReader(sessionId))
        const sourcePath = yield* sourceSession.path()
        expect(sourcePath.map((entry) => entry.id)).toEqual(expected.source)
        expect(gapFree(sourcePath)).toBe(true)
        expect(jsonText(sourcePath)).toContain("rewound follow-up")
        const branchExecution = yield* services.store.loadExecution(expected.branch)
        const branchSession = Option.getOrThrow(yield* services.store.sessionReader(branchExecution.message.sessionId))
        const branchPath = yield* branchSession.path()
        expect(gapFree(branchPath)).toBe(true)
        expect(jsonText(branchPath)).toContain("source future")
      })

    const scenario = (services: Services) =>
      Effect.gen(function* () {
        if (services.executor === undefined) {
          return yield* Effect.die(`${options.name} completed-tool rewind requires RunExecutor`)
        }
        yield* register(services.runtime)
        const handle = yield* services.runtime.start(agent, "Look up the status.", {
          sessionId,
          idempotencyKey: `completed-tool-rewind:${name}`,
        })
        yield* services.executor.execute(
          yield* capability.claim(services, { runId: handle.runId, commandId: "rewind-source" }),
        )
        const initialInspection = yield* awaitTerminal(services, handle.runId)
        const initialHistory = yield* services.runtime.history({ runId: handle.runId, limit: 100 })
        const initialTerminal = initialHistory.findLast(
          (event) => event._tag === "RunCompleted" || event._tag === "RunFailed" || event._tag === "RunCancelled",
        )
        const initialEvidence =
          initialTerminal?._tag === "RunFailed"
            ? `${initialTerminal.error._tag}: ${"message" in initialTerminal.error ? initialTerminal.error.message : "no message"}`
            : (initialTerminal?._tag ?? "no terminal event")
        expect(initialInspection.status, initialEvidence).toBe("succeeded")
        const history = yield* services.runtime.history({ runId: handle.runId, limit: 100 })
        const completedTool = history.find((event) => event._tag === "ToolExecutionCompleted")
        if (completedTool?._tag !== "ToolExecutionCompleted") {
          return yield* Effect.die("completed-tool rewind did not record ToolExecutionCompleted")
        }

        yield* services.runtime.rewind(handle.runId, {
          commandId: "completed-tool-rewind",
          toSequence: completedTool.sequence,
        })
        yield* handle.send("Continue with the exact suffix REWOUND-FOLLOW-UP.", { policy: "steer" })
        yield* services.executor.execute(
          yield* capability.claim(services, { runId: handle.runId, commandId: "rewind-follow-up" }),
        )

        const inspection = yield* awaitTerminal(services, handle.runId)
        const rewoundHistory = yield* services.runtime.history({ runId: handle.runId, limit: 100 })
        const terminal = rewoundHistory.findLast(
          (event) => event._tag === "RunCompleted" || event._tag === "RunFailed" || event._tag === "RunCancelled",
        )
        expect(inspection.status, jsonText(terminal)).toBe("succeeded")
        expect(inspection.branches).toHaveLength(1)
        expect(inspection.branches[0]).toMatchObject({ forkedAt: completedTool.sequence })
        expect(toolCalls).toBe(1)
        expect(modelCalls).toBe(3)
        const sourceSession = Option.getOrThrow(yield* services.store.sessionReader(sessionId))
        const sourcePath = yield* sourceSession.path()
        expect(gapFree(sourcePath)).toBe(true)
        expect(jsonText(sourcePath)).toContain("REWOUND-FOLLOW-UP")
        const branch = inspection.branches[0]!.runId
        yield* inspectSession(services, { source: sourcePath.map((entry) => entry.id), branch })
        return {
          branch,
          source: sourcePath.map((entry) => entry.id),
        }
      })

    return prepare(
      open(scenario).pipe(
        Effect.flatMap((result) => open((services) => inspectSession(services, result))),
        Effect.orDie,
      ),
    )
  })

  registerTurnCompletedTransition(registration)
}
