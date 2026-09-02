import { Effect, Schema, Stream } from "effect"
import { Prompt, Tool } from "effect/unstable/ai"
import type { AgentError, Event } from "../event.js"
import type { PendingToolResult } from "../tools/result.js"
import type { Entry } from "../../context/session.js"
import { PolicyError, type Decision, type TurnOverrides } from "../../turn/policy.js"
import type { Completion } from "../../turn/steering-inbox.js"
import type { Input } from "../../turn/steering.js"
import type { ObjectSchema, RunLoopContext, SchemaServicesD } from "./context.js"
import { checkpoint, setHandoffState, setToolBatch } from "../../durable/driver/run.js"
import type { DriverInterpreter } from "../../durable/driver/interpreter.js"
import { LoopDriverState } from "../../durable/loop-driver-state.js"
import { DriverStateInvalid } from "../../durable/service.js"
import { terminalCompletedEvent, TurnFinish, turnCompletedEvent } from "../model-turn/finish.js"
import { HandoffRequirementsMissing, takePendingContinuation } from "../handoff/state.js"
import type { RunError } from "../service.js"
import { steer as applySteer } from "../lifecycle/hooks.js"
import { GateFailed } from "../gates/definition.js"
import { evaluate as evaluateGates } from "../gates/evaluation.js"
import { retryPrompt as gateRetryPrompt } from "../gates/prompt.js"

interface AfterTurnResult<StructuredOutputSchema extends ObjectSchema> {
  readonly events: Stream.Stream<Event, RunError, SchemaServicesD<StructuredOutputSchema>>
  readonly next?: { readonly prompt: Prompt.RawInput; readonly overrides?: TurnOverrides }
  readonly structuredTurn?: number
}

const takeTerminalCompletion = (
  structured: boolean,
  takeCompletion: () => Effect.Effect<Completion>,
  takeFollowUp: () => Effect.Effect<ReadonlyArray<Input>>,
): Effect.Effect<Completion> => {
  if (!structured) return takeCompletion()
  return takeFollowUp().pipe(
    Effect.map(
      (inputs): Completion =>
        inputs.length === 0 ? { _tag: "Closed" } : { _tag: "Pending", queue: "followUp", inputs },
    ),
  )
}

const withoutPending = <
  Tools extends Record<string, Tool.Any>,
  R,
  P extends R,
  A extends R,
  StructuredOutputSchema extends ObjectSchema,
  OutputValue,
>(input: {
  readonly context: RunLoopContext<Tools, R, P, A, StructuredOutputSchema, OutputValue>
  readonly turn: number
  readonly transcript: Prompt.Prompt
  readonly completed: Event
  readonly completion?: Completion
  readonly steeringPrompt?: Prompt.Prompt
  readonly promptFromSteeringInputs: (inputs: ReadonlyArray<Input>) => Prompt.Prompt
}): AfterTurnResult<StructuredOutputSchema> => {
  if (input.completion?._tag === "Pending") {
    return {
      events: Stream.fromIterable<Event>([
        input.completed,
        input.context.steeringDrainedEvent(input.turn, input.completion.queue, input.completion.inputs),
      ]),
      next: { prompt: input.steeringPrompt ?? input.promptFromSteeringInputs(input.completion.inputs) },
    }
  }
  if (input.context.structured !== undefined) {
    return { events: Stream.fromIterable<Event>([input.completed]), structuredTurn: input.turn + 1 }
  }
  if (input.context.state.text.length === 0) {
    return {
      events: Stream.concat(
        Stream.fromIterable<Event>([input.completed]),
        Stream.fail(TurnFinish.missingOutputFailure(input.context.state, input.turn)),
      ),
    }
  }
  return {
    events: Stream.fromIterable<Event>([
      input.completed,
      terminalCompletedEvent(input.context.state, input.turn, input.transcript, input.context.state.text),
    ]),
  }
}

const closedWithoutPending = <
  Tools extends Record<string, Tool.Any>,
  R,
  P extends R,
  A extends R,
  StructuredOutputSchema extends ObjectSchema,
  OutputValue,
>(input: {
  readonly context: RunLoopContext<Tools, R, P, A, StructuredOutputSchema, OutputValue>
  readonly turn: number
  readonly transcript: Prompt.Prompt
  readonly path: ReadonlyArray<Entry>
  readonly completed: Event
  readonly completion: Completion
  readonly promptFromSteeringInputs: (inputs: ReadonlyArray<Input>) => Prompt.Prompt
}): Effect.Effect<AfterTurnResult<StructuredOutputSchema>, RunError, R | DriverInterpreter> =>
  Effect.gen(function* () {
    const { context, turn, transcript } = input
    if (context.structured === undefined && context.state.text.length > 0) {
      const evaluated = yield* evaluateGates({
        agent: context.agent,
        runVerifier: context.runGateVerifier,
        turn,
        output: context.state.text,
      })
      const gateEvents: ReadonlyArray<Event> = evaluated.results.map((result) => ({
        _tag: "GateResult",
        turn,
        ...result,
      }))
      const retry = evaluated.failed !== undefined && context.agent.onGateFailure === "retry"
      yield* context.rememberTurn(turn, transcript, !retry, input.path)
      if (evaluated.failed === undefined) {
        return {
          events: Stream.fromIterable<Event>([
            input.completed,
            ...gateEvents,
            terminalCompletedEvent(context.state, turn, transcript, context.state.text),
          ]),
        }
      }
      if (retry) {
        return {
          events: Stream.fromIterable<Event>([input.completed, ...gateEvents]),
          next: { prompt: gateRetryPrompt(evaluated.failed) },
        }
      }
      return {
        events: Stream.concat(
          Stream.fromIterable<Event>([input.completed, ...gateEvents]),
          Stream.fail(GateFailed.make({ gate: evaluated.failed })),
        ),
      }
    }
    yield* context.rememberTurn(turn, transcript, true, input.path)
    return withoutPending(input)
  })

/** Finish one model turn, clear its batch checkpoint, and decide the next transcript transition. */
export const afterTurnFor = <
  Tools extends Record<string, Tool.Any>,
  R,
  P extends R,
  A extends R,
  StructuredOutputSchema extends ObjectSchema,
  OutputValue,
>(input: {
  readonly context: RunLoopContext<Tools, R, P, A, StructuredOutputSchema, OutputValue>
  readonly decidePolicy: (input: {
    readonly turn: number
    readonly history: Prompt.Prompt
    readonly pendingToolResults: ReadonlyArray<PendingToolResult>
    readonly budget: import("../../durable/run-budget.js").BudgetLimits
  }) => Effect.Effect<Decision, PolicyError | HandoffRequirementsMissing, R>
  readonly takeFollowUp: () => Effect.Effect<ReadonlyArray<Input>>
  readonly takeSteering: () => Effect.Effect<ReadonlyArray<Input>>
  readonly takeCompletion: () => Effect.Effect<Completion>
  readonly promptFromSteeringInputs: (inputs: ReadonlyArray<Input>) => Prompt.Prompt
}) => {
  const {
    checkpointPending,
    handoffStateRef,
    isPolicyDecision,
    pendingResults,
    rememberTurn,
    state,
    steeringDrainedEvent,
    syncSession,
    withSystem,
  } = input.context
  const applySteering = (turn: number, steering: ReadonlyArray<Input>) =>
    steering.length === 0
      ? Effect.succeed(Prompt.empty)
      : applySteer({
          runId: input.context.inbox.runId,
          agentName: input.context.agent.name,
          turn,
          queue: "steering",
          count: steering.length,
          prompt: input.promptFromSteeringInputs(steering),
        })
  return (
    turn: number,
    alreadyProjectedPending?: ReadonlyArray<PendingToolResult>,
  ): Effect.Effect<
    AfterTurnResult<StructuredOutputSchema>,
    AgentError | PolicyError | RunError,
    R | DriverInterpreter
  > =>
    Effect.gen(function* () {
      const pending = alreadyProjectedPending ?? pendingResults()
      const transcript = yield* checkpointPending(turn, alreadyProjectedPending === undefined ? pending : [])
      const path = yield* syncSession(turn, transcript)
      const current = yield* checkpoint
      const driverState = yield* Schema.decodeUnknownEffect(LoopDriverState)(current.state).pipe(
        Effect.mapError((error) => DriverStateInvalid.make({ message: String(error) })),
      )
      if (driverState.toolBatch !== undefined) yield* setToolBatch(undefined)
      const completed: Event = turnCompletedEvent(state, turn, transcript)
      if (pending.length === 0) {
        const completion = yield* takeTerminalCompletion(
          input.context.structured !== undefined,
          input.takeCompletion,
          input.takeFollowUp,
        )
        if (completion._tag === "Pending") {
          yield* rememberTurn(turn, transcript, true, path)
          const steeringPrompt = yield* applySteer({
            runId: input.context.inbox.runId,
            agentName: input.context.agent.name,
            turn,
            queue: completion.queue,
            count: completion.inputs.length,
            prompt: input.promptFromSteeringInputs(completion.inputs),
          })
          return withoutPending({
            context: input.context,
            turn,
            transcript,
            completed,
            completion,
            steeringPrompt,
            promptFromSteeringInputs: input.promptFromSteeringInputs,
          })
        }
        return yield* closedWithoutPending({
          context: input.context,
          turn,
          transcript,
          path,
          completed,
          completion,
          promptFromSteeringInputs: input.promptFromSteeringInputs,
        })
      }
      yield* rememberTurn(turn, transcript, false, path)
      const evaluated = yield* input.decidePolicy({
        turn: turn + 1,
        history: transcript,
        pendingToolResults: pending,
        budget: current.budget.remaining,
      })
      if (!isPolicyDecision(evaluated)) {
        return yield* PolicyError.make({
          message: "Policy returned an invalid decision; Stop decisions must include a reason",
          cause: evaluated,
        })
      }
      const decision: Decision = evaluated
      if (decision._tag === "Stop") {
        const pendingCalls = pending.map((result) => ({ tool_call_id: result.id, tool_name: result.name }))
        return {
          events: Stream.concat(
            Stream.fromIterable<Event>([completed]),
            Stream.fail(TurnFinish.policyStopFailure(decision, turn + 1, pendingCalls)),
          ),
        }
      }
      state.pending.clear()
      const steering = yield* input.takeSteering()
      const basePrompt = yield* applySteering(turn, steering)
      let continuationOverrides = decision.overrides
      let continuationPrompt = basePrompt
      if (handoffStateRef !== undefined) {
        const pendingContinuation = yield* takePendingContinuation(handoffStateRef, setHandoffState)
        if (pendingContinuation !== undefined) {
          continuationPrompt =
            steering.length === 0
              ? Prompt.make(pendingContinuation.prompt)
              : Prompt.concat(basePrompt, Prompt.make(pendingContinuation.prompt))
          continuationOverrides = { ...decision.overrides, ...pendingContinuation.overrides }
        }
      }
      const prompt =
        continuationOverrides?.instructions === undefined
          ? continuationPrompt
          : withSystem(continuationOverrides.instructions, continuationPrompt)
      return {
        events: Stream.fromIterable<Event>(
          steering.length === 0 ? [completed] : [completed, steeringDrainedEvent(turn, "steering", steering)],
        ),
        next: continuationOverrides === undefined ? { prompt } : { prompt, overrides: continuationOverrides },
      }
    })
}
