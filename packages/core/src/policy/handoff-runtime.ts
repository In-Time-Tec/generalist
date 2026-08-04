import { Effect, Option, Ref, Schema } from "effect"
import { Chat, Tool } from "effect/unstable/ai"
import {
  edgeKey,
  HandoffAccepted,
  HandoffLimitExceeded,
  HandoffRequirementsMissing,
  HandoffTargetMissing,
  type HandoffRunState,
  maxHandoffs,
} from "../agent/handoff-state.js"
import type { RunOptions } from "../agent/agent.js"
import { assemble, type Candidate } from "../tools/tool-registry.js"
import { intercept, logicalOperationId } from "../durable/driver-run.js"
import { operationKey } from "../durable/driver-interpreter.js"
import { generateId } from "../model/model-telemetry.js"
import { defaultContextProjection, HandoffInput, type ContextProjection } from "./handoff-projection.js"
import { HandoffCatalog, type HandoffTarget } from "./handoff-target.js"
import { ModelRegistry } from "../model/model-registry.js"

export class HandoffRejected extends Schema.TaggedErrorClass<HandoffRejected>()("@batonfx/core/HandoffRejected", {
  handoffId: Schema.String,
  turn: Schema.Finite,
  reason: Schema.String,
}) {}

export interface ExecuteHandoffInput {
  readonly turn: number
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
): Effect.Effect<void, import("../agent/agent.js").RunError> =>
  intercept(
    {
      kind: "handoff",
      key: operationKey(logicalId, "handoff", "rejected", turn, handoffId),
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
    const catalog = yield* HandoffCatalog
    const resolved = catalog.resolve(input.specialist)
    if (resolved === undefined) {
      return yield* HandoffTargetMissing.make({ target: input.specialist, turn: input.turn })
    }
    const logicalId = yield* logicalOperationId
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
        const handoffId = yield* generateId
        yield* recordRejected(logicalId, input.turn, handoffId, "target model requirements missing")
        return yield* HandoffRequirementsMissing.make({
          target: resolved.name,
          message: "Handoff target model is not registered",
          turn: input.turn,
        })
      }
    }
    const current = yield* Ref.get(input.handoffState)
    const handoffId = yield* generateId
    const source = current.active.ref
    const targetRef = resolved.ref
    const edge = edgeKey(source, targetRef)
    const totalLimit = maxHandoffs(input.options, current.active.agent)
    if (totalLimit !== undefined && current.handoffCount >= totalLimit) {
      yield* recordRejected(logicalId, input.turn, handoffId, "total handoff limit exceeded")
      return yield* HandoffLimitExceeded.make({
        kind: "total",
        turn: input.turn,
        limit: totalLimit,
      })
    }
    const repeatedLimit = input.maxRepeatedEdge ?? 1
    const edgeCount = current.edgeCounts.get(edge) ?? 0
    if (edgeCount >= repeatedLimit) {
      yield* recordRejected(logicalId, input.turn, handoffId, "repeated handoff edge limit exceeded")
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
      Effect.catchTag("@batonfx/core/HandoffProjectionInvalid", (error) =>
        Effect.gen(function* () {
          yield* recordRejected(logicalId, input.turn, handoffId, error.message)
          return yield* HandoffRejected.make({ handoffId, turn: input.turn, reason: error.message })
        }),
      ),
    )
    yield* intercept(
      {
        kind: "handoff",
        key: operationKey(logicalId, "handoff", "requested", input.turn, handoffId),
        input: {
          handoffId,
          turn: input.turn,
          source: source.id,
          target: targetRef.id,
          reason: decoded.reason,
        },
        replayPolicy: "pure",
      },
      Effect.void,
    )
    yield* Ref.set(input.chat.history, projected.history)
    const registry = yield* assemble(staticCandidates(resolved))
    yield* Ref.set(input.toolState, {
      registry,
      activatedSkillBodies: new Map(),
    })
    const nextEdgeCounts = new Map(current.edgeCounts)
    nextEdgeCounts.set(edge, edgeCount + 1)
    yield* Ref.set(input.handoffState, {
      rootRef: current.rootRef,
      active: resolved,
      path: [
        ...current.path,
        {
          handoffId,
          source: source.id,
          target: targetRef.id,
          turn: input.turn,
          ...(decoded.reason === undefined ? {} : { reason: decoded.reason }),
        },
      ],
      edgeCounts: nextEdgeCounts,
      handoffCount: current.handoffCount + 1,
      pendingContinuation: {
        prompt: projected.prompt,
        ...(resolved.agent.instructions === undefined
          ? {}
          : { overrides: { instructions: resolved.agent.instructions } }),
      },
    })
    yield* intercept(
      {
        kind: "handoff",
        key: operationKey(logicalId, "handoff", "completed", input.turn, handoffId),
        input: { handoffId, turn: input.turn, source: source.id, target: targetRef.id },
        replayPolicy: "pure",
      },
      Effect.void,
    )
    const accepted: HandoffAccepted = {
      _tag: "HandoffAccepted",
      handoffId,
      source: source.id,
      target: targetRef.id,
    }
    return accepted
  })

export const handoffToolSpec = (
  handoffTarget: HandoffTarget,
  options: {
    readonly nameOverride?: string
    readonly description?: string
    readonly projection?: ContextProjection
    readonly maxRepeatedEdge?: number
  } = {},
): {
  readonly tool: Tool.Any
  readonly specialist: string
  readonly projection?: ContextProjection
  readonly maxRepeatedEdge?: number
} => {
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
}
