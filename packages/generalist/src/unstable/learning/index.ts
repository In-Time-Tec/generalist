import { Context, Effect, Layer, Option, Schema } from "effect"
import { AiError, LanguageModel } from "effect/unstable/ai"
import { Memory, type MemoryError } from "../../core/context/memory.js"
import { ModelRegistry } from "../../core/model/registry.js"
import { Approvals, type Service as ApprovalsService } from "../../core/policy/approvals.js"
import { type Declaration, Hooks, onRunEnd, type RunEndInput } from "../../hooks/index.js"
import {
  Denied as NestedOperationDenied,
  Operations,
  type Service as OperationsService,
} from "../../core/tools/nested-operation.js"
import { ToolContext, type Service as ToolContextService } from "../../core/tools/tool-context.js"
import { DuplicateAgent } from "../../runtime/errors.js"
import { Runtime, type ScheduleError, type Service as RuntimeService } from "../../runtime/service.js"
import { Trajectory, fromJournal, type Trajectory as TrajectoryValue } from "../../trajectory/index.js"
import {
  agent as consolidationAgent,
  configurationOf,
  consolidate,
  ConsolidationInvalid,
  type ConsolidationProposer,
  isConsolidationAgent,
  resolveModel,
  runStartDeclaration,
} from "./consolidate.js"
import {
  type ApplyHandlers,
  AuthorSkill,
  type ConsolidationApplyHandlers,
  ExportTrajectory,
  Forget,
  ForgetEntry,
  handlerFor,
  MemoryEntry,
  Proposal,
  Proposals,
  RefineInstruction,
  Remember,
  TrajectoryRef,
} from "./proposal.js"

export {
  AuthorSkill,
  consolidate,
  ConsolidationInvalid,
  ExportTrajectory,
  Forget,
  ForgetEntry,
  MemoryEntry,
  Proposal,
  RefineInstruction,
  Remember,
  TrajectoryRef,
}
export type { ConsolidateOptions } from "./consolidate.js"
export type {
  ApplyHandlers,
  AuthorSkill as AuthorSkillProposal,
  ConsolidationApplyHandlers,
  ExportTrajectory as ExportTrajectoryProposal,
  Forget as ForgetProposal,
  ForgetEntry as ForgetEntryInput,
  MemoryEntry as MemoryEntryInput,
  RefineInstruction as RefineInstructionProposal,
  Remember as RememberProposal,
  TrajectoryRef as TrajectoryReference,
} from "./proposal.js"

/** @experimental Produce reviewable changes from one completed trajectory. */
export interface Proposer<R = never, E = never> {
  readonly propose: (trajectory: TrajectoryValue) => Effect.Effect<ReadonlyArray<Proposal>, E, R>
}

/** @experimental */
export interface LayerOptions<ProposeR = never, ProposeE = never, ApplyR = never, ApplyE = never> {
  readonly propose: Proposer<ProposeR, ProposeE>["propose"]
  readonly apply: ApplyHandlers<ApplyR, ApplyE>
}

/** @experimental */
export interface ConsolidationLayerOptions<ApplyR = never, ApplyE = never> {
  readonly propose: ConsolidationProposer
  readonly apply: ConsolidationApplyHandlers<ApplyR, ApplyE>
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

const completeApplyHandlers = <R, E>(
  handlers: ApplyHandlers<R, E> | ConsolidationApplyHandlers<R, E>,
): ApplyHandlers<R, E> => ({
  RefineInstruction: handlers.RefineInstruction,
  Remember: handlers.Remember,
  Forget: handlers.Forget,
  AuthorSkill:
    "AuthorSkill" in handlers
      ? handlers.AuthorSkill
      : () => Effect.die("Scheduled consolidation cannot propose AuthorSkill"),
  ExportTrajectory:
    "ExportTrajectory" in handlers
      ? handlers.ExportTrajectory
      : () => Effect.die("Scheduled consolidation cannot propose ExportTrajectory"),
})

const applyProposal = <R, E>(options: {
  readonly operations: OperationsService
  readonly approvals: ApprovalsService
  readonly context: Context.Context<R>
  readonly toolContext: ToolContextService
  readonly handlers: ApplyHandlers<R, E>
  readonly proposal: Proposal
}) =>
  Effect.gen(function* () {
    const payload = yield* Schema.encodeEffect(Proposal)(options.proposal)
    yield* options.operations.run(
      {
        kind: `learning.${options.proposal._tag}`,
        payload,
        replayPolicy: "never",
        success: Schema.Void,
        approval: { capability: "learning", request: payload },
      },
      handlerFor(options.handlers, options.proposal).pipe(Effect.provide(options.context)),
    )
  }).pipe(
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
    const consolidation = configurationOf(options.configured.propose)
    if (consolidation !== undefined && !isConsolidationAgent(options.input.agentName)) return
    const trajectory: TrajectoryValue =
      consolidation === undefined
        ? completedTrajectory(yield* fromJournal(options.runtime, options.input.runId), options.input)
        : {
            runId: options.input.runId,
            agent: options.input.agentName,
            input: options.input.transcript,
            output: options.input.output,
            gates: [],
            turns: [],
            stopReason: "completed",
          }
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
 * @experimental Build one `Hooks.onRunEnd` declaration whose proposals use the hosted Runtime's nested-operation
 * journal. Compose it with other declarations through `Hooks.layer([...])` or a Host plugin's `hooks`.
 */
export const declaration = <ProposeR, ProposeE, ApplyR, ApplyE>(
  options: LayerOptions<ProposeR, ProposeE, ApplyR, ApplyE>,
): Effect.Effect<Declaration, never, Runtime | Approvals | ProposeR | ApplyR> =>
  Effect.gen(function* () {
    const runtime = yield* Runtime
    const approvals = yield* Approvals
    const context = yield* Effect.context<Runtime | Approvals | ProposeR | ApplyR>()
    return onRunEnd((input) =>
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
    )
  })

/**
 * @experimental Provide `Hooks` consisting of the learning declaration alone. Use `declaration` when the environment
 * already has other hook declarations.
 */
export function layer<ApplyR, ApplyE>(
  options: ConsolidationLayerOptions<ApplyR, ApplyE>,
): Layer.Layer<
  Hooks,
  ConsolidationInvalid | DuplicateAgent | ScheduleError,
  Runtime | Approvals | Memory | ModelRegistry | ApplyR
>
export function layer<ProposeR, ProposeE, ApplyR, ApplyE>(
  options: LayerOptions<ProposeR, ProposeE, ApplyR, ApplyE>,
): Layer.Layer<Hooks, never, Runtime | Approvals | ProposeR | ApplyR>
export function layer<ProposeR, ProposeE, ApplyR, ApplyE>(
  options: LayerOptions<ProposeR, ProposeE, ApplyR, ApplyE> | ConsolidationLayerOptions<ApplyR, ApplyE>,
) {
  const configured = { propose: options.propose, apply: completeApplyHandlers(options.apply) }
  return Layer.effect(
    Hooks,
    Effect.gen(function* () {
      const learning = yield* declaration<
        ProposeR | Memory,
        ProposeE | ConsolidationInvalid | MemoryError | Schema.SchemaError,
        ApplyR,
        ApplyE
      >(configured)
      const configuration = configurationOf(configured.propose)
      if (configuration === undefined) return Hooks.of({ declarations: [learning] })
      const runtime = yield* Runtime
      const memory = yield* Memory
      const models = yield* ModelRegistry
      const hooks = Hooks.of({ declarations: [runStartDeclaration(runtime, memory, configuration), learning] })
      const background = consolidationAgent(
        configuration,
        yield* resolveModel(configuration.model, yield* models.registrations),
      )
      const context = yield* Effect.context<Runtime | Approvals | ProposeR | ApplyR>()
      yield* runtime
        .register(background)
        .pipe(Effect.provideContext(Context.add(Context.add(context, Hooks, hooks), ModelRegistry, models)))
      yield* runtime.schedule(background, "Consolidate recent journal episodes.", {
        rrule: configuration.schedule,
        sessionId: "learning",
        budget: configuration.budget,
        scheduleId: "schedule_generalist_learning_consolidation",
      })
      return hooks
    }),
  )
}
