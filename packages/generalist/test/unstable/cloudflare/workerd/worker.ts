import { Crypto, Effect, Exit, Layer, PlatformError, Schema } from "effect"
import { activate } from "generalist/durability"
import { Prompt, Response as AiResponse, Tool, Toolkit } from "effect/unstable/ai"
import { Agent, AgentEvent, Approvals, Permissions } from "generalist"
import { decodeConfig as decodeOpenRouterConfig } from "generalist/providers/openrouter"
import { TestModel } from "generalist/testing"
import { Address, Errors, ExecutableManifest, Message } from "generalist/runtime"
import { RunStore as RunStoreFacade } from "../../../../src/runtime/run/store.js"
import { layerRunStore } from "generalist/unstable/cloudflare/durable-objects"
import type { Bucket } from "generalist/durability/r2"

const test = ExecutableManifest.makeTest
const makeMessage = Message.make
const AgentExecutionFailure = Errors.AgentExecutionFailure
const cryptoLayer = Layer.succeed(
  Crypto.Crypto,
  Crypto.make({
    randomBytes: (size) => crypto.getRandomValues(new Uint8Array(size)),
    digest: (algorithm, data) =>
      Effect.tryPromise({
        try: () => crypto.subtle.digest(algorithm, new Uint8Array(data)),
        catch: (cause) =>
          PlatformError.systemError({
            module: "Crypto",
            method: "digest",
            _tag: "Unknown",
            cause,
          }),
      }).pipe(Effect.map((buffer) => new Uint8Array(buffer))),
  }),
)
const RunStore = RunStoreFacade

interface ObjectId {
  readonly name: string
}

interface ObjectNamespace {
  readonly idFromName: (name: string) => ObjectId
  readonly get: (id: ObjectId) => { readonly fetch: (request: Request) => Promise<Response> }
}

interface Env {
  readonly OBJECTS: ObjectNamespace
  readonly BUCKET: Bucket
}

interface DurableObjectState {
  readonly storage: {
    getAlarm(): Promise<number | null>
    setAlarm(time: number): Promise<void>
  }
}

const lookup = Tool.make("lookup", {
  description: "Look up a provider fact",
  parameters: Schema.Struct({ query: Schema.String }),
  success: Schema.String,
})

const purchase = Tool.make("purchase", {
  description: "Make a purchase",
  parameters: Schema.Struct({ item: Schema.String }),
  success: Schema.String,
})

const plannerToolkit = Toolkit.make(lookup, purchase)
const planSchema = Schema.Struct({
  objective: Schema.String,
  facts: Schema.Array(Schema.String),
})
const planner = Agent.make({
  name: "workerd-planner",
  instructions: "Use read-only lookup, then return the structured plan.",
  output: planSchema,
  toolkit: plannerToolkit,
  budget: {
    modelCalls: 3,
    toolCalls: 1,
    totalTokens: 128,
    deadline: "2099-01-01T00:00:00.000Z",
  },
})
const failClosed = Permissions.layerRuleset({
  rules: [{ pattern: "lookup", level: "allow" }],
  fallback: "deny",
})

const agentConformance = Effect.fn("CloudflareWorkerd.agentConformance")(function* () {
  let lookupExecutions = 0
  let deniedExecutions = 0
  const successFixture = yield* TestModel.make([
    TestModel.toolCall("lookup", { query: "Boise provider" }, { id: "lookup-1" }),
    TestModel.text("I found one provider."),
    TestModel.object({ output: { objective: "Arrange service", facts: ["Provider serves Boise"] } }),
  ])
  const successLayer = Layer.mergeAll(
    successFixture.layer,
    plannerToolkit.toLayer({
      lookup: ({ query }) =>
        Effect.sync(() => {
          lookupExecutions += 1
          return `${query}: available`
        }),
      purchase: ({ item }) =>
        Effect.sync(() => {
          deniedExecutions += 1
          return item
        }),
    }),
    failClosed,
    Approvals.layerDenyAll,
  )
  const successServices = yield* Layer.build(successLayer)
  const planned = yield* Agent.run(planner, "Find a provider and propose a plan.").pipe(
    Effect.provideContext(successServices),
  )

  const deniedFixture = yield* TestModel.make([
    TestModel.toolCall("purchase", { item: "unapproved service" }, { id: "purchase-1" }),
  ])
  const deniedServices = yield* Layer.build(
    Layer.mergeAll(
      deniedFixture.layer,
      plannerToolkit.toLayer({
        lookup: ({ query }) => Effect.succeed(query),
        purchase: ({ item }) =>
          Effect.sync(() => {
            deniedExecutions += 1
            return item
          }),
      }),
      failClosed,
      Approvals.layerDenyAll,
    ),
  )
  const denied = yield* Agent.run(planner, "Buy the service.").pipe(Effect.provideContext(deniedServices), Effect.exit)

  const exhaustedFixture = yield* TestModel.make([
    TestModel.turn([TestModel.text("usage exceeds budget")], {
      usage: AiResponse.Usage.make({
        inputTokens: { total: 1, uncached: 1, cacheRead: undefined, cacheWrite: undefined },
        outputTokens: { total: 1, text: 1, reasoning: undefined },
      }),
    }),
  ])
  const exhaustedServices = yield* Layer.build(exhaustedFixture.layer)
  const exhausted = yield* Agent.run(
    Agent.make({ name: "workerd-budget", budget: { tokens: 0 } }),
    "This model call exhausts the budget.",
  ).pipe(Effect.provideContext(exhaustedServices), Effect.exit)
  const exhaustedRequests = yield* exhaustedFixture.requests
  const openRouterConfig = yield* decodeOpenRouterConfig({})

  return Response.json({
    objective: planned.objective,
    facts: planned.facts,
    lookupExecutions,
    denied: Exit.isFailure(denied),
    deniedExecutions,
    budgetExhausted: Exit.isFailure(exhausted),
    budgetModelRequests: exhaustedRequests.length,
    openRouterBundled: Object.keys(openRouterConfig).length === 0,
  })
})

export class RuntimeObject {
  constructor(
    private readonly state: DurableObjectState,
    private readonly env: Env,
  ) {}

  // This fixture has no running executor. Production alarms call LocalScheduler.drain;
  // its canonical obligations remain discoverable by an independent reconciler.
  alarm(): Promise<void> {
    return Promise.resolve()
  }

  fetch(request: Request): Promise<Response> {
    const storage = this.state.storage
    const sequence = Number(new URL(request.url).searchParams.get("sequence"))
    const liveStore = layerRunStore({
      bucket: this.env.BUCKET,
      environment: "workerd",
      tenant: "conformance",
      partition: "shared",
      workerId: "workerd",
      addresses: [],
    }).pipe(Layer.provide(cryptoLayer))
    const live = Layer.effectDiscard(activate).pipe(Layer.provideMerge(liveStore))
    const program = Effect.scoped(
      Effect.flatMap(Layer.build(live), (context) =>
        Effect.gen(function* () {
          const store = yield* RunStore
          const cancellationRunId = `workerd-cancellation-${sequence}`
          const pluralRunId = `workerd-plural-${sequence}`
          const acknowledgementRunId = `workerd-acknowledgement-${sequence}`
          const priorCancellationStatus =
            sequence > 1 ? (yield* store.inspect(`workerd-cancellation-${sequence - 1}`)).status : undefined
          const cancellationExecutable = test("workerd-cancellation", "1")
          const cancellationMessage = makeMessage({
            id: cancellationRunId,
            to: Address.make("agent:test"),
            sessionId: `session:${cancellationRunId}`,
            prompt: Prompt.make("cancel"),
            idempotencyKey: cancellationRunId,
            correlationId: cancellationRunId,
          })
          const pluralMessage = makeMessage({
            id: pluralRunId,
            to: Address.make("agent:test"),
            sessionId: `session:${pluralRunId}`,
            prompt: Prompt.make("wait for three responses"),
            idempotencyKey: pluralRunId,
            correlationId: pluralRunId,
          })
          const acknowledgementMessage = makeMessage({
            id: acknowledgementRunId,
            to: Address.make("agent:test"),
            sessionId: `session:${acknowledgementRunId}`,
            prompt: Prompt.make("acknowledge completed model cycles"),
            idempotencyKey: acknowledgementRunId,
            correlationId: acknowledgementRunId,
          })
          yield* store.admitStart({
            runId: cancellationRunId,
            message: cancellationMessage,
            executableRef: cancellationExecutable.ref,
            executableManifest: cancellationExecutable.manifest,
            registrations: [],
            treePolicy: { maxDepth: 4, maxSessions: 1024, concurrency: { agents: 4, tools: 1024 } },
            initialChildren: [],
            initialFanOuts: [],
          })
          const claim = yield* store.claimExecution({
            runId: cancellationRunId,
            ownerId: "workerd",
            commandId: `${cancellationRunId}:claim`,
          })
          yield* store.cancel({
            runId: cancellationRunId,
            commandId: `${cancellationRunId}:cancel`,
            reason: "close",
          })
          const cancellationRequestedStatus = (yield* store.inspect(cancellationRunId)).status
          yield* store.fail({
            ...claim,
            error: AgentExecutionFailure.make({ message: "execution interrupted" }),
          })
          yield* store.admitStart({
            runId: pluralRunId,
            message: pluralMessage,
            executableRef: cancellationExecutable.ref,
            executableManifest: cancellationExecutable.manifest,
            registrations: [],
            treePolicy: { maxDepth: 4, maxSessions: 1024, concurrency: { agents: 4, tools: 1024 } },
            initialChildren: [],
            initialFanOuts: [],
          })
          const pluralClaim = yield* store.claimExecution({
            runId: pluralRunId,
            ownerId: "workerd",
            commandId: `${pluralRunId}:claim`,
          })
          const pluralWaitIds = ["a", "b", "c"].map((suffix) => `${pluralRunId}:${suffix}`)
          const pluralCalls = pluralWaitIds.map((waitId) => ({
            type: "tool-call" as const,
            id: waitId,
            name: "workerd-conformance",
            params: {},
            providerExecuted: false,
            metadata: {},
          }))
          const pluralSuspension = AgentEvent.AgentSuspended.make({
            checkpoint: {
              turn: 0,
              calls: pluralCalls.map((call) => ({
                call,
                operationKey: `workerd:${call.id}`,
                state: { _tag: "Waiting" as const, reason: "tool-wait" as const, waitId: call.id, token: call.id },
              })),
              activeTools: ["workerd-conformance"],
              authorizationContextDigest: "",
              activatedSkills: [],
              invocationPath: [],
            },
            waits: pluralCalls.map((call, callIndex) => ({
              waitId: call.id,
              token: call.id,
              reason: "tool-wait" as const,
              callIndex,
              call,
            })),
          })
          yield* store.suspend({
            ...pluralClaim,
            waits: pluralWaitIds.map((waitId) => ({
              waitId,
              reason: { _tag: "ToolWait" as const },
              status: "open" as const,
              openedAt: "2026-08-29T00:00:00.000Z",
            })),
            suspension: pluralSuspension,
          })
          const suffixes = (waits: ReadonlyArray<{ readonly waitId: string }>) =>
            waits.map(({ waitId }) => waitId.slice(waitId.lastIndexOf(":") + 1))
          const pluralInitialOrder = suffixes((yield* store.inspect(pluralRunId)).waits)
          const firstResolution = { _tag: "ToolResult" as const, result: "first", encodedResult: "first" }
          yield* store.respond({ runId: pluralRunId, waitId: pluralWaitIds[0]!, resolution: firstResolution })
          yield* store.respond({
            runId: pluralRunId,
            waitId: pluralWaitIds[2]!,
            resolution: { _tag: "ToolResult", result: "third", encodedResult: "third" },
          })
          const pluralRemainingAfterOutOfOrder = suffixes((yield* store.inspect(pluralRunId)).waits)
          yield* store.respond({ runId: pluralRunId, waitId: pluralWaitIds[0]!, resolution: firstResolution })
          const pluralConflict = yield* store
            .respond({
              runId: pluralRunId,
              waitId: pluralWaitIds[0]!,
              resolution: { _tag: "ToolResult", result: "changed", encodedResult: "changed" },
            })
            .pipe(
              Effect.match({
                onFailure: (error) => ({
                  tag: error._tag,
                  reason: error._tag === "generalist/durability/DurabilityFailure" ? error.reason : undefined,
                }),
                onSuccess: () => ({ tag: "success", reason: undefined }),
              }),
            )
          yield* store.respond({
            runId: pluralRunId,
            waitId: pluralWaitIds[1]!,
            resolution: { _tag: "ToolResult", result: "second", encodedResult: "second" },
          })
          const pluralFinalOpen = (yield* store.inspect(pluralRunId)).waits.length
          const pluralEvents = yield* store.history({ runId: pluralRunId, cursor: -1, limit: 100 })
          const pluralResumeEvents = pluralEvents.filter((event) => event._tag === "RunResumed").length

          yield* store.admitStart({
            runId: acknowledgementRunId,
            message: acknowledgementMessage,
            executableRef: cancellationExecutable.ref,
            executableManifest: cancellationExecutable.manifest,
            registrations: [],
            treePolicy: { maxDepth: 4, maxSessions: 1024, concurrency: { agents: 4, tools: 1024 } },
            initialChildren: [],
            initialFanOuts: [],
          })
          const acknowledgementClaim = yield* store.claimExecution({
            runId: acknowledgementRunId,
            ownerId: "workerd",
            commandId: `${acknowledgementRunId}:claim`,
          })
          const acknowledgementInitialSequence = (yield* store.acknowledged(acknowledgementRunId)).sequence
          yield* store.emitAgentEvent({
            ...acknowledgementClaim,
            commandId: `${acknowledgementRunId}:event:turn-completed:0`,
            event: { _tag: "TurnCompleted", turn: 0 },
          })
          yield* store.emitAgentEvent({
            ...acknowledgementClaim,
            commandId: `${acknowledgementRunId}:event:turn-started:1`,
            event: { _tag: "TurnStarted", turn: 1 },
          })
          yield* store.emitAgentEvent({
            ...acknowledgementClaim,
            commandId: `${acknowledgementRunId}:event:turn-completed:1`,
            event: { _tag: "TurnCompleted", turn: 1 },
          })
          yield* store.emitAgentEvent({
            ...acknowledgementClaim,
            commandId: `${acknowledgementRunId}:event:turn-started:2`,
            event: { _tag: "TurnStarted", turn: 2 },
          })
          const acknowledgementHistory = yield* store.history({
            runId: acknowledgementRunId,
            cursor: -1,
            limit: 100,
          })
          const acknowledgementBoundaries = acknowledgementHistory.filter((event) => event._tag === "TurnCompleted")
          const firstAcknowledgementBoundary = acknowledgementBoundaries[0]!.sequence
          const lastAcknowledgementBoundary = acknowledgementBoundaries[1]!.sequence
          const nonBoundary = acknowledgementHistory.find(
            (event) =>
              event.sequence > firstAcknowledgementBoundary &&
              event.sequence < lastAcknowledgementBoundary &&
              event._tag !== "TurnCompleted",
          )!.sequence
          const acknowledgementInvalidTag = yield* store
            .acknowledge({ runId: acknowledgementRunId, sequence: nonBoundary })
            .pipe(Effect.match({ onFailure: (error) => error._tag, onSuccess: () => "success" }))
          yield* store.acknowledge({ runId: acknowledgementRunId, sequence: firstAcknowledgementBoundary })
          yield* store.acknowledge({ runId: acknowledgementRunId, sequence: lastAcknowledgementBoundary })
          yield* store.acknowledge({ runId: acknowledgementRunId, sequence: firstAcknowledgementBoundary })
          const acknowledgedSequence = (yield* store.acknowledged(acknowledgementRunId)).sequence
          const acknowledgementBeyondTag = yield* store
            .acknowledge({ runId: acknowledgementRunId, sequence: lastAcknowledgementBoundary + 1 })
            .pipe(Effect.match({ onFailure: (error) => error._tag, onSuccess: () => "success" }))
          const acknowledgementTailSequences = acknowledgementHistory
            .filter((event) => event.sequence > acknowledgedSequence)
            .map((event) => event.sequence)

          const cancellationTerminalStatus = (yield* store.inspect(cancellationRunId)).status
          yield* Effect.promise(() => storage.setAlarm(4_000_000_000_000))
          return Response.json({
            sequence,
            priorCancellationStatus,
            cancellationRequestedStatus,
            cancellationTerminalStatus,
            alarm: yield* Effect.promise(() => storage.getAlarm()),
            pluralInitialOrder,
            pluralRemainingAfterOutOfOrder,
            pluralConflictingTag: pluralConflict.tag,
            pluralFinalOpen,
            pluralResumeEvents,
            acknowledgementInitialSequence,
            acknowledgedSequence,
            acknowledgementInvalidTag,
            acknowledgementBeyondTag,
            acknowledgementTailSequences,
          })
        }).pipe(Effect.provideContext(context)),
      ),
    )
    return Effect.runPromise(program)
  }
}

export default {
  fetch(request: Request, bindings: Env): Promise<Response> {
    if (new URL(request.url).pathname === "/agent") {
      return Effect.runPromise(Effect.scoped(agentConformance().pipe(Effect.orDie)))
    }
    const namespace = bindings.OBJECTS
    return namespace.get(namespace.idFromName("default")).fetch(request)
  },
}
