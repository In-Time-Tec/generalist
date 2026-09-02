import { Context, Effect, Layer, Option, Schema } from "effect"
import { AiError, LanguageModel, Prompt } from "effect/unstable/ai"
import { Approvals, type Service as ApprovalsService } from "../../core/policy/approvals.js"
import { RunId } from "../../core/durable/run-id.js"
import { GuidanceId } from "../../instructions/entry.js"
import { Hooks, onRunEnd, type RunEndInput } from "../../hooks/index.js"
import {
  Denied as NestedOperationDenied,
  Operations,
  type Service as OperationsService,
} from "../../core/tools/nested-operation.js"
import { ToolContext, type Service as ToolContextService } from "../../core/tools/tool-context.js"
import { Runtime, type Service as RuntimeService } from "../../runtime/service.js"
import { Trajectory, fromJournal, type Trajectory as TrajectoryValue } from "../../trajectory/index.js"

/** @experimental One exact run turn supporting a proposed change. */
export const TrajectoryRef = Schema.Struct({
  runId: RunId,
  turn: Schema.Int.check(Schema.isGreaterThanOrEqualTo(0)),
})

/** @experimental */
export type TrajectoryRef = typeof TrajectoryRef.Type

/** @experimental Memory input that an application handler may adapt to its Memory service. */
export const MemoryEntry = Schema.Struct({
  key: Schema.Struct({ agent: Schema.String, subject: Schema.String }),
  turn: Schema.Int.check(Schema.isGreaterThanOrEqualTo(0)),
  transcript: Prompt.Prompt,
  terminal: Schema.Boolean,
})

/** @experimental */
export type MemoryEntry = typeof MemoryEntry.Type

/** @experimental A proposed instruction change plus the trajectory turns supporting it. */
export const RefineInstruction = Schema.TaggedStruct("RefineInstruction", {
  target: GuidanceId,
  diff: Schema.String,
  evidence: Schema.Array(TrajectoryRef),
})

/** @experimental */
export type RefineInstruction = typeof RefineInstruction.Type

/** @experimental A proposed skill plus the trajectory turns supporting it. */
export const AuthorSkill = Schema.TaggedStruct("AuthorSkill", {
  name: Schema.String,
  content: Schema.String,
  evidence: Schema.Array(TrajectoryRef),
})

/** @experimental */
export type AuthorSkill = typeof AuthorSkill.Type

/** @experimental A proposed memory entry plus the trajectory turns supporting it. */
export const Remember = Schema.TaggedStruct("Remember", {
  memory: MemoryEntry,
  evidence: Schema.Array(TrajectoryRef),
})

/** @experimental */
export type Remember = typeof Remember.Type

/** @experimental A proposed JSON Lines export of one recorded run. */
export const ExportTrajectory = Schema.TaggedStruct("ExportTrajectory", {
  runId: RunId,
  format: Schema.Literal("jsonl"),
})

/** @experimental */
export type ExportTrajectory = typeof ExportTrajectory.Type

/** @experimental One reviewable change proposed after a run. */
export const Proposal = Schema.Union([RefineInstruction, AuthorSkill, Remember, ExportTrajectory])

/** @experimental */
export type Proposal = typeof Proposal.Type

const Proposals = Schema.Array(Proposal)

/** @experimental Produce reviewable changes from one completed trajectory. */
export interface Proposer<R = never, E = never> {
  readonly propose: (trajectory: TrajectoryValue) => Effect.Effect<ReadonlyArray<Proposal>, E, R>
}

/** @experimental Plain Effect handlers selected only by proposal tag. */
export interface ApplyHandlers<R = never, E = never> {
  readonly RefineInstruction: (proposal: RefineInstruction) => Effect.Effect<void, E, R>
  readonly AuthorSkill: (proposal: AuthorSkill) => Effect.Effect<void, E, R>
  readonly Remember: (proposal: Remember) => Effect.Effect<void, E, R>
  readonly ExportTrajectory: (proposal: ExportTrajectory) => Effect.Effect<void, E, R>
}

/** @experimental */
export interface LayerOptions<ProposeR = never, ProposeE = never, ApplyR = never, ApplyE = never> {
  readonly propose: Proposer<ProposeR, ProposeE>["propose"]
  readonly apply: ApplyHandlers<ApplyR, ApplyE>
}

/** @experimental */
export interface ProposeWithModelOptions<R = never> {
  readonly model: Layer.Layer<LanguageModel.LanguageModel, never, R>
  readonly maxProposals?: number
}

/** @experimental Ask one Effect AI model for a bounded, Schema-decoded proposal list. */
export const proposeWithModel = <R>(
  options: ProposeWithModelOptions<R>,
): Proposer<R, AiError.AiError | Schema.SchemaError>["propose"] => {
  const maxProposals = options.maxProposals ?? 3
  if (!Number.isSafeInteger(maxProposals) || maxProposals < 0) {
    throw new TypeError("maxProposals must be a non-negative safe integer")
  }
  const Output = Schema.Struct({ proposals: Proposals.check(Schema.isMaxLength(maxProposals)) })
  return (trajectory) =>
    Effect.gen(function* () {
      const encoded = yield* Schema.encodeEffect(Schema.fromJsonString(Trajectory))(trajectory)
      const generate = LanguageModel.generateObject({
        objectName: "learning_proposals",
        schema: Output,
        prompt: [
          "Review this completed agent trajectory and propose only durable improvements justified by its evidence.",
          `Return at most ${maxProposals} proposals. Return an empty list when no change is justified.`,
          `Trajectory:\n${encoded}`,
        ].join("\n\n"),
      })
      // oxlint-disable-next-line effecttsgo/strict-effect-provide -- The proposer owns the caller-supplied model Layer for this request.
      const response = yield* generate.pipe(Effect.provide(options.model))
      return response.value.proposals
    })
}

const completedTrajectory = (trajectory: TrajectoryValue, input: RunEndInput): TrajectoryValue => ({
  ...trajectory,
  output: input.output,
  stopReason: trajectory.turns.at(-1)?.response.finishReason ?? "completed",
})

const toolContext = (input: RunEndInput): ToolContextService => ({
  signal: new AbortController().signal,
  emit: () => Effect.succeed(true),
  sessionId: input.runId,
  runId: input.runId,
  agentName: input.agentName,
  turn: Math.max(0, input.turns - 1),
  operationKey: `learning:${input.runId}`,
})

const handlerFor = <R, E>(handlers: ApplyHandlers<R, E>, proposal: Proposal): Effect.Effect<void, E, R> => {
  switch (proposal._tag) {
    case "RefineInstruction":
      return handlers.RefineInstruction(proposal)
    case "AuthorSkill":
      return handlers.AuthorSkill(proposal)
    case "Remember":
      return handlers.Remember(proposal)
    case "ExportTrajectory":
      return handlers.ExportTrajectory(proposal)
  }
}

const applyProposal = <R, E>(options: {
  readonly operations: OperationsService
  readonly approvals: ApprovalsService
  readonly context: Context.Context<R>
  readonly toolContext: ToolContextService
  readonly handlers: ApplyHandlers<R, E>
  readonly proposal: Proposal
}) =>
  options.operations
    .run(
      {
        kind: `learning.${options.proposal._tag}`,
        payload: options.proposal,
        replayPolicy: "never",
        success: Schema.Void,
        approval: { capability: "learning", request: options.proposal },
      },
      handlerFor(options.handlers, options.proposal).pipe(Effect.provide(options.context)),
    )
    .pipe(
      Effect.provideService(Approvals, options.approvals),
      Effect.provideService(ToolContext, options.toolContext),
      Effect.catchIf(Schema.is(NestedOperationDenied), () => Effect.void),
    )

const runLearning = <ProposeR, ProposeE, ApplyR, ApplyE>(options: {
  readonly input: RunEndInput
  readonly runtime: RuntimeService
  readonly operations: OperationsService
  readonly approvals: ApprovalsService
  readonly context: Context.Context<Runtime | Approvals | ProposeR | ApplyR>
  readonly configured: LayerOptions<ProposeR, ProposeE, ApplyR, ApplyE>
}) =>
  Effect.gen(function* () {
    const projected = yield* fromJournal(options.runtime, options.input.runId)
    const trajectory = completedTrajectory(projected, options.input)
    const context = toolContext(options.input)
    const proposals = yield* options.operations
      .run(
        {
          kind: "learning.propose",
          payload: { runId: options.input.runId, turns: options.input.turns },
          replayPolicy: "pure",
          success: Proposals,
        },
        options.configured.propose(trajectory).pipe(Effect.provide(options.context)),
      )
      .pipe(Effect.provideService(ToolContext, context))
    yield* Effect.forEach(
      proposals,
      (proposal) =>
        applyProposal({
          operations: options.operations,
          approvals: options.approvals,
          context: options.context,
          toolContext: context,
          handlers: options.configured.apply,
          proposal,
        }),
      { concurrency: 1, discard: true },
    )
  })

/**
 * @experimental Install one `Hooks.onRunEnd` proposer whose outputs use the hosted Runtime's nested-operation journal.
 */
export const layer = <ProposeR, ProposeE, ApplyR, ApplyE>(
  options: LayerOptions<ProposeR, ProposeE, ApplyR, ApplyE>,
): Layer.Layer<Hooks, never, Runtime | Approvals | ProposeR | ApplyR> =>
  Layer.effect(
    Hooks,
    Effect.gen(function* () {
      const runtime = yield* Runtime
      const approvals = yield* Approvals
      const context = yield* Effect.context<Runtime | Approvals | ProposeR | ApplyR>()
      return Hooks.of({
        declarations: [
          onRunEnd((input) =>
            Effect.gen(function* () {
              const operations = yield* Effect.serviceOption(Operations)
              if (Option.isNone(operations)) {
                return yield* Effect.die(
                  new Error("Learning requires a hosted Runtime nested-operation journal at Hooks.onRunEnd"),
                )
              }
              yield* runLearning({
                input,
                runtime,
                operations: operations.value,
                approvals,
                context,
                configured: options,
              })
            }),
          ),
        ],
      })
    }),
  )
