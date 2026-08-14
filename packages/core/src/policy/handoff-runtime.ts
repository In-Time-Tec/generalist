import { Effect, Function, Option, Ref, Schema } from "effect"
import { Chat, Prompt, Tool } from "effect/unstable/ai"
import {
  edgeCount,
  edgeLabel,
  HandoffCommit,
  HandoffAccepted,
  HandoffLimitExceeded,
  HandoffRequirementsMissing,
  HandoffTargetMissing,
  type HandoffRunState,
  maxHandoffs,
  incrementEdge,
  fromHandoffControlState,
  toHandoffControlState,
} from "../agent/handoff-state.js"
import type { RunOptions } from "../agent/agent.js"
import { assemble, type Candidate } from "../tools/tool-registry.js"
import { intercept, logicalOperationId } from "../durable/driver-run.js"
import { operationKey, type DriverInterpreter } from "../durable/driver-interpreter.js"
import { defaultContextProjection, HandoffInput, type ContextProjection } from "./handoff-projection.js"
import type { HandoffTarget } from "./handoff-target.js"
import { ModelRegistry } from "../model/model-registry.js"
import { validateRef } from "../durable/executable-manifest.js"
import { SessionStore } from "../context/session.js"

export class HandoffRejected extends Schema.TaggedErrorClass<HandoffRejected>()("@batonfx/core/HandoffRejected", {
  handoffId: Schema.String,
  turn: Schema.Finite,
  reason: Schema.String,
}) {}

export interface ExecuteHandoffInput {
  readonly catalog: import("./handoff-target.js").HandoffCatalogInterface
  readonly turn: number
  readonly toolCallId: string
  readonly specialist: string
  readonly params: unknown
  readonly options: RunOptions
  readonly handoffState: Ref.Ref<HandoffRunState>
  readonly chat: Chat.Service
  readonly toolState: Ref.Ref<{
    readonly registry: import("../tools/tool-registry.js").Registry
    readonly activatedSkillBodies: Map<string, string>
  }>
  readonly resolvingToolCallIds?: ReadonlyArray<string>
  readonly projection?: ContextProjection
  readonly maxRepeatedEdge?: number
}

const recordRejected = (
  logicalId: string,
  turn: number,
  handoffId: string,
  reason: string,
): Effect.Effect<void, import("../agent/agent.js").RunError, DriverInterpreter> =>
  intercept(
    {
      kind: "handoff",
      key: operationKey(logicalId, "handoff", "rejected", turn, handoffId),
      turn,
      input: { handoffId, turn, reason },
      replayPolicy: "pure",
    },
    Effect.void,
  )

const staticCandidates = (handoffTarget: HandoffTarget): ReadonlyArray<Candidate> =>
  (
    handoffTarget.agent.toolDeclarations ??
    Object.values(handoffTarget.agent.toolkit.tools).map((tool) => ({
      tool,
      origin: { _tag: "Static" as const, agent: handoffTarget.name },
    }))
  ).map(({ origin, tool }) => ({
    origin,
    tool,
    dispatch: "Static" as const,
  }))

export const executeSameRunHandoff = (input: ExecuteHandoffInput) =>
  Effect.gen(function* () {
    const decoded = yield* Schema.decodeUnknownEffect(HandoffInput)(input.params).pipe(
      Effect.mapError((error) =>
        HandoffRejected.make({
          handoffId: "invalid-input",
          turn: input.turn,
          reason: String(error),
        }),
      ),
    )
    const handoffInput =
      input.resolvingToolCallIds === undefined || input.resolvingToolCallIds.length === 0
        ? decoded
        : {
            ...decoded,
            context: {
              ...(typeof decoded.context === "object" && decoded.context !== null
                ? (decoded.context as Record<string, unknown>)
                : {}),
              resolvingToolCallIds: input.resolvingToolCallIds,
            },
          }
    const resolved = input.catalog.resolve(input.specialist)
    if (resolved === undefined) {
      return yield* HandoffTargetMissing.make({ target: input.specialist, turn: input.turn })
    }
    const logicalId = yield* logicalOperationId
    const current = yield* Ref.get(input.handoffState)
    const source = current.active.name
    const repeated = edgeCount(current.edgeCounts, source, resolved.name)
    const handoffId = operationKey(logicalId, "handoff", input.turn, input.toolCallId, resolved.pin ?? resolved.name)
    const sessionEntryId = `${handoffId}:session-projection`
    const sessionService = yield* Effect.serviceOption(SessionStore)
    if (resolved.agent.model !== undefined) {
      const registry = yield* Effect.serviceOption(ModelRegistry)
      if (Option.isNone(registry)) {
        return yield* HandoffRequirementsMissing.make({
          target: resolved.name,
          message: "Handoff target requires ModelRegistry in context",
          turn: input.turn,
        })
      }
      const available = yield* registry.value.operate(resolved.agent.model, Effect.void).pipe(Effect.exit)
      if (available._tag === "Failure") {
        yield* recordRejected(logicalId, input.turn, handoffId, "target model requirements missing")
        return yield* HandoffRequirementsMissing.make({
          target: resolved.name,
          message: "Handoff target model is not registered",
          turn: input.turn,
        })
      }
    }
    const edge = edgeLabel(source, resolved.name)
    const pinnedRef = input.options.executableRef
    const pinnedManifest = input.options.executableManifest
    if (pinnedRef !== undefined) {
      if (pinnedManifest === undefined || resolved.pin === undefined) {
        return yield* HandoffRejected.make({
          handoffId,
          turn: input.turn,
          reason: "Pinned handoff requires an executable closure and exact target Agent pin",
        })
      }
      yield* Effect.try({
        try: () => validateRef(pinnedRef, pinnedManifest),
        catch: (error) => HandoffRejected.make({ handoffId, turn: input.turn, reason: String(error) }),
      })
      if (!pinnedManifest.entries.some((entry) => entry._tag === "Agent" && entry.pin === resolved.pin)) {
        return yield* HandoffRejected.make({
          handoffId,
          turn: input.turn,
          reason: "Handoff target is outside the closure",
        })
      }
    }
    const commit = yield* intercept(
      {
        kind: "handoff",
        key: handoffId,
        turn: input.turn,
        input: {
          handoffId,
          turn: input.turn,
          target: resolved.name,
          ...(resolved.pin === undefined ? {} : { targetAgentPin: resolved.pin }),
          ...(decoded.reason === undefined ? {} : { reason: decoded.reason }),
        },
        replayPolicy: "pure",
      },
      Effect.gen(function* () {
        const totalLimit = maxHandoffs(input.options, current.active.agent)
        if (totalLimit !== undefined && current.handoffCount >= totalLimit) {
          return yield* HandoffLimitExceeded.make({
            kind: "total",
            turn: input.turn,
            limit: totalLimit,
          })
        }
        const repeatedLimit = input.maxRepeatedEdge ?? 1
        if (repeated >= repeatedLimit) {
          return yield* HandoffLimitExceeded.make({
            kind: "edge",
            turn: input.turn,
            limit: repeatedLimit,
            edge,
          })
        }
        const history = yield* Ref.get(input.chat.history)
        const project = input.projection ?? defaultContextProjection
        const projected = yield* project(history, handoffInput).pipe(
          Effect.mapError((error) => HandoffRejected.make({ handoffId, turn: input.turn, reason: error.message })),
        )
        const projectedHistory = Prompt.fromMessages(
          projected.history.content.filter((message) => message.role !== "system"),
        )
        const sessionParentId = Option.isNone(sessionService)
          ? null
          : ((yield* sessionService.value
              .path()
              .pipe(
                Effect.mapError((error) =>
                  HandoffRejected.make({ handoffId, turn: input.turn, reason: error.message }),
                ),
              )).at(-1)?.id ?? null)
        const next: HandoffRunState = {
          root: current.root,
          active: resolved,
          path: [
            ...current.path,
            {
              handoffId,
              source,
              target: resolved.name,
              turn: input.turn,
              ...(decoded.reason === undefined ? {} : { reason: decoded.reason }),
            },
          ],
          edgeCounts: incrementEdge(current.edgeCounts, source, resolved.name),
          handoffCount: current.handoffCount + 1,
          pendingContinuation: {
            prompt: projected.prompt,
            ...(resolved.agent.instructions === undefined
              ? {}
              : { overrides: { instructions: resolved.agent.instructions } }),
          },
        }
        return {
          _tag: "HandoffCommit",
          state: toHandoffControlState(next),
          sessionEntryId,
          sessionParentId,
          projectedHistory,
          ...(resolved.pin === undefined ? {} : { targetAgentPin: resolved.pin }),
        } satisfies HandoffCommit
      }),
    )
    const durable = yield* Schema.decodeUnknownEffect(HandoffCommit)(commit).pipe(
      Effect.mapError((error) => HandoffRejected.make({ handoffId, turn: input.turn, reason: String(error) })),
    )
    const committedTarget = input.catalog.resolve(durable.state.active)
    if (committedTarget === undefined) {
      return yield* HandoffTargetMissing.make({ target: durable.state.active, turn: input.turn })
    }
    if (Option.isSome(sessionService)) {
      yield* sessionService.value
        .append(
          {
            _tag: "Handoff",
            handoffId,
            target: durable.state.active,
            projectedHistory: durable.projectedHistory,
          },
          {
            id: durable.sessionEntryId,
            expectedLeafId: durable.sessionParentId,
            ...(input.options.sessionOwnerToken === undefined ? {} : { ownerToken: input.options.sessionOwnerToken }),
          },
        )
        .pipe(Effect.mapError((error) => HandoffRejected.make({ handoffId, turn: input.turn, reason: error.message })))
    }
    yield* Ref.set(input.chat.history, durable.projectedHistory)
    const registry = yield* assemble(staticCandidates(committedTarget))
    yield* Ref.set(input.toolState, {
      registry,
      activatedSkillBodies: new Map(),
    })
    yield* Ref.set(input.handoffState, fromHandoffControlState(durable.state, committedTarget))
    const accepted: HandoffAccepted = {
      _tag: "HandoffAccepted",
      handoffId,
      source: durable.state.path.at(-1)?.source ?? source,
      target: durable.state.active,
    }
    return accepted
  })

/** @experimental One same-run handoff tool specification. */
export interface HandoffToolSpecResult {
  readonly tool: Tool.Tool<
    string,
    {
      readonly parameters: typeof HandoffInput
      readonly success: typeof HandoffAccepted
      readonly failure: typeof Schema.String
      readonly failureMode: "return"
    }
  >
  readonly specialist: string
  readonly projection?: ContextProjection
  readonly maxRepeatedEdge?: number
}

export const handoffToolSpec: {
  (options?: {
    readonly nameOverride?: string
    readonly description?: string
    readonly projection?: ContextProjection
    readonly maxRepeatedEdge?: number
  }): (handoffTarget: HandoffTarget) => HandoffToolSpecResult
  (
    handoffTarget: HandoffTarget,
    options?: {
      readonly nameOverride?: string
      readonly description?: string
      readonly projection?: ContextProjection
      readonly maxRepeatedEdge?: number
    },
  ): HandoffToolSpecResult
} = Function.dual(
  (args) => args.length > 1 || "agent" in args[0],
  (
    handoffTarget: HandoffTarget,
    options: {
      readonly nameOverride?: string
      readonly description?: string
      readonly projection?: ContextProjection
      readonly maxRepeatedEdge?: number
    } = {},
  ): HandoffToolSpecResult => {
    const name = options.nameOverride ?? `handoff_to_${handoffTarget.name}`
    const tool = Tool.make(name, {
      ...(options.description === undefined
        ? { description: `Hand off to ${handoffTarget.name} for subsequent turns in this run` }
        : { description: options.description }),
      parameters: HandoffInput,
      success: HandoffAccepted,
      failure: Schema.String,
      failureMode: "return",
    })
    return {
      tool,
      specialist: handoffTarget.name,
      ...(options.projection === undefined ? {} : { projection: options.projection }),
      ...(options.maxRepeatedEdge === undefined ? {} : { maxRepeatedEdge: options.maxRepeatedEdge }),
    }
  },
)
