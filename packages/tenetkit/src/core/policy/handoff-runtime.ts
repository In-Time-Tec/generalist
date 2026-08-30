import { Effect, Function, Option, Ref, Schema } from "effect"
import { Chat, Prompt, Tool } from "effect/unstable/ai"
import {
  edgeCount,
  edgeLabel,
  Commit,
  HandoffAccepted,
  HandoffLimitExceeded,
  HandoffRequirementsMissing,
  TargetMissing,
  type HandoffRunState,
  maxHandoffs,
  incrementEdge,
  fromControlState,
  toControlState,
} from "../agent/handoff/state.js"
import type { RunOptions } from "../agent/service.js"
import { RunError } from "../agent/run/error.js"
import { assemble, type Candidate } from "../tools/tool-registry.js"
import { intercept, logicalOperationId } from "../durable/driver/run.js"
import { operationKey, type DriverInterpreter } from "../durable/driver/interpreter.js"
import { defaultContextProjection, Input, type ContextProjection } from "./handoff-projection.js"
import type { Catalog, Target } from "./handoff-target.js"
import { ModelRegistry } from "../model/registry.js"
import { validateRef } from "../durable/manifest/executable-manifest.js"
import type { SessionStore } from "../context/session.js"
import { Rejected } from "./handoff-rejected.js"

export { Rejected }

export interface ExecuteInput {
  readonly catalog: Catalog["Service"]
  readonly turn: number
  readonly toolCallId: string
  readonly specialist: string
  readonly params: unknown
  readonly options: RunOptions
  readonly session: Option.Option<SessionStore>
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
): Effect.Effect<void, RunError, DriverInterpreter> =>
  intercept(
    {
      kind: "handoff",
      key: operationKey(logicalId, "handoff", "rejected", turn, handoffId),
      turn,
      input: { handoffId, turn, reason },
      replayPolicy: "pure",
      success: Schema.Void,
      failure: RunError,
    },
    Effect.void,
  )

const staticCandidates = (handoffTarget: Target): ReadonlyArray<Candidate> =>
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

const withResolvingToolCalls = (decoded: Input, resolvingToolCallIds: ReadonlyArray<string> | undefined): Input => {
  if (resolvingToolCallIds === undefined || resolvingToolCallIds.length === 0) return decoded
  return {
    ...decoded,
    context: { ...decoded.context, resolvingToolCallIds },
  }
}

const verifyTargetModel = (target: Target, turn: number, logicalId: string, handoffId: string) => {
  const model = target.agent.model
  return model === undefined
    ? Effect.void
    : Effect.gen(function* () {
        const registry = yield* Effect.serviceOption(ModelRegistry)
        if (Option.isNone(registry)) {
          return yield* HandoffRequirementsMissing.make({
            target: target.name,
            message: "Handoff target requires ModelRegistry in context",
            turn,
          })
        }
        const available = yield* registry.value.withModel(model, Effect.void).pipe(Effect.exit)
        if (available._tag === "Failure") {
          yield* recordRejected(logicalId, turn, handoffId, "target model requirements missing")
          return yield* HandoffRequirementsMissing.make({
            target: target.name,
            message: "Handoff target model is not registered",
            turn,
          })
        }
      })
}

const verifyPinnedTarget = (target: Target, options: RunOptions, handoffId: string, turn: number) =>
  Effect.gen(function* () {
    const pinnedRef = options.executableRef
    if (pinnedRef === undefined) return
    const pinnedManifest = options.executableManifest
    if (pinnedManifest === undefined || target.pin === undefined) {
      return yield* Rejected.make({
        handoffId,
        turn,
        reason: "Pinned handoff requires an executable closure and exact target Agent pin",
      })
    }
    yield* Effect.try({
      try: () => validateRef(pinnedRef, pinnedManifest),
      catch: (error) => Rejected.make({ handoffId, turn, reason: String(error) }),
    })
    if (!pinnedManifest.entries.some((entry) => entry._tag === "Agent" && entry.pin === target.pin)) {
      return yield* Rejected.make({
        handoffId,
        turn,
        reason: "Handoff target is outside the closure",
      })
    }
  })

export const executeSameRunHandoff = (input: ExecuteInput) =>
  Effect.gen(function* () {
    const decoded = yield* Schema.decodeUnknownEffect(Input)(input.params).pipe(
      Effect.mapError((error) =>
        Rejected.make({
          handoffId: "invalid-input",
          turn: input.turn,
          reason: String(error),
        }),
      ),
    )
    const handoffInput = withResolvingToolCalls(decoded, input.resolvingToolCallIds)
    const resolved = input.catalog.resolve(input.specialist)
    if (resolved === undefined) {
      return yield* TargetMissing.make({ target: input.specialist, turn: input.turn })
    }
    const logicalId = yield* logicalOperationId
    const current = yield* Ref.get(input.handoffState)
    const source = current.active.name
    const repeated = edgeCount(current.edgeCounts, source, resolved.name)
    const handoffId = operationKey(logicalId, "handoff", input.turn, input.toolCallId, resolved.pin ?? resolved.name)
    const sessionEntryId = `${handoffId}:session-projection`
    const sessionService = input.session
    yield* verifyTargetModel(resolved, input.turn, logicalId, handoffId)
    const edge = edgeLabel(source, resolved.name)
    yield* verifyPinnedTarget(resolved, input.options, handoffId, input.turn)
    const requiredCommitInput = {
      handoffId,
      turn: input.turn,
      target: resolved.name,
    }
    const pinnedCommitInput =
      resolved.pin === undefined ? requiredCommitInput : { ...requiredCommitInput, targetAgentPin: resolved.pin }
    const commitInput =
      decoded.reason === undefined ? pinnedCommitInput : { ...pinnedCommitInput, reason: decoded.reason }
    const commit = yield* intercept(
      {
        kind: "handoff",
        key: handoffId,
        turn: input.turn,
        input: commitInput,
        replayPolicy: "pure",
        success: Commit,
        failure: RunError,
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
          Effect.mapError((error) => Rejected.make({ handoffId, turn: input.turn, reason: error.message })),
        )
        const projectedHistory = Prompt.fromMessages(
          projected.history.content.filter((message) => message.role !== "system"),
        )
        const sessionParentId = Option.isNone(sessionService)
          ? null
          : ((yield* sessionService.value
              .path()
              .pipe(
                Effect.mapError((error) => Rejected.make({ handoffId, turn: input.turn, reason: error.message })),
              )).at(-1)?.id ?? null)
        const frame =
          decoded.reason === undefined
            ? { handoffId, source, target: resolved.name, turn: input.turn }
            : { handoffId, source, target: resolved.name, turn: input.turn, reason: decoded.reason }
        const pendingContinuation =
          resolved.agent.instructions === undefined
            ? { prompt: projected.prompt }
            : { prompt: projected.prompt, overrides: { instructions: resolved.agent.instructions } }
        const next: HandoffRunState = {
          root: current.root,
          active: resolved,
          path: [...current.path, frame],
          edgeCounts: incrementEdge(current.edgeCounts, source, resolved.name),
          handoffCount: current.handoffCount + 1,
          pendingContinuation,
        }
        const durableCommit = {
          _tag: "Commit",
          state: toControlState(next),
          sessionEntryId,
          sessionParentId,
          projectedHistory,
        } satisfies Commit
        return resolved.pin === undefined ? durableCommit : { ...durableCommit, targetAgentPin: resolved.pin }
      }),
    )
    const durable = yield* Schema.decodeEffect(Commit)(commit).pipe(
      Effect.mapError((error) => Rejected.make({ handoffId, turn: input.turn, reason: String(error) })),
    )
    const committedTarget = input.catalog.resolve(durable.state.active)
    if (committedTarget === undefined) {
      return yield* TargetMissing.make({ target: durable.state.active, turn: input.turn })
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
          { id: durable.sessionEntryId, expectedLeafId: durable.sessionParentId },
        )
        .pipe(Effect.mapError((error) => Rejected.make({ handoffId, turn: input.turn, reason: error.message })))
    }
    yield* Ref.set(input.chat.history, durable.projectedHistory)
    const registry = yield* assemble(staticCandidates(committedTarget))
    yield* Ref.set(input.toolState, {
      registry,
      activatedSkillBodies: new Map(),
    })
    yield* Ref.set(input.handoffState, fromControlState(durable.state, committedTarget))
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
      readonly parameters: typeof Input
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
  }): (handoffTarget: Target) => HandoffToolSpecResult
  (
    handoffTarget: Target,
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
    handoffTarget: Target,
    options: {
      readonly nameOverride?: string
      readonly description?: string
      readonly projection?: ContextProjection
      readonly maxRepeatedEdge?: number
    } = {},
  ): HandoffToolSpecResult => {
    const name = options.nameOverride ?? `handoff_to_${handoffTarget.name}`
    const tool = Tool.make(name, {
      description: options.description ?? `Hand off to ${handoffTarget.name} for subsequent turns in this run`,
      parameters: Input,
      success: HandoffAccepted,
      failure: Schema.String,
      failureMode: "return",
    })
    const result = {
      tool,
      specialist: handoffTarget.name,
    }
    if (options.projection === undefined) {
      return options.maxRepeatedEdge === undefined ? result : { ...result, maxRepeatedEdge: options.maxRepeatedEdge }
    }
    return options.maxRepeatedEdge === undefined
      ? { ...result, projection: options.projection }
      : { ...result, projection: options.projection, maxRepeatedEdge: options.maxRepeatedEdge }
  },
)
