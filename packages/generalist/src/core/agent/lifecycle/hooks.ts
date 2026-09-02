/* oxlint-disable effecttsgo/any-unknown-in-error-context, typescript/no-unsafe-type-assertion -- Public hooks intentionally accept arbitrary typed failures and event-specific replacement values; this boundary converts failures to HookFailed and validates decisions before applying them. */
import { Cause, Effect, Option, Schema } from "effect"
import { Prompt } from "effect/unstable/ai"
import {
  Continue,
  Decision,
  HookFailed,
  Hooks,
  type Declaration,
  type Decision as HookDecision,
  type Event as HookEvent,
  type Hook,
  type ApprovalRequestInput,
  type CompactionInput,
  type ChildEndInput,
  type ChildStartInput,
  type ModelCallInput,
  type RunStartInput,
  type RunEndInput,
  type SteerInput,
  type ToolCallInput,
  type ToolResultInput,
  type TurnStartInput,
} from "../../../hooks/index.js"
import { DriverInterpreter } from "../../durable/driver/interpreter.js"
import { LoopDriverState } from "../../durable/loop-driver-state.js"
import { DriverError, DriverStateInvalid } from "../../durable/service.js"
import type { RunId } from "../../durable/run-id.js"
import type { Middleware } from "../../model/middleware.js"
import { AgentError } from "../event.js"

/** Result of one complete ordered hook declaration chain. */
export interface Result<Input> {
  readonly input: Input
  readonly decisions: ReadonlyArray<HookDecision>
  readonly blocked: string | undefined
  readonly asked: boolean
}

type ApplyDecision<Input> = (input: Input, decision: HookDecision) => Input

const hookFailure = (event: HookEvent, cause: Cause.Cause<unknown>): Effect.Effect<never, HookFailed> =>
  Cause.hasInterrupts(cause)
    ? Effect.interrupt
    : Effect.fail(
        HookFailed.make({
          event,
          cause: Cause.squash(cause),
        }),
      )

const invoke = <Input>(declaration: Declaration, input: Input): Effect.Effect<HookDecision, HookFailed> => {
  // SAFETY: evaluate filters declarations by event, and each event helper supplies that declaration's exact input.
  const hook = declaration.hook as Hook<Input>
  return Effect.suspend(() => hook(input)).pipe(
    Effect.catchCause((cause) => hookFailure(declaration.event, cause)),
    Effect.flatMap((decision) =>
      decision === undefined
        ? Effect.succeed<HookDecision>(Continue())
        : Schema.decodeEffect(Decision)(decision).pipe(
            Effect.mapError((cause) =>
              HookFailed.make({
                event: declaration.event,
                cause,
              }),
            ),
          ),
    ),
  )
}

// SAFETY: typed prompt hook constructors only admit Replace<Prompt.RawInput>; replay restores that recorded value.
const replacementPrompt = (value: typeof Schema.Unknown.Type): Prompt.Prompt => Prompt.make(value as Prompt.RawInput)

// SAFETY: onRunEnd ties Replace's value to the Agent's Output type; replay uses the same registered Agent.
const replacementOutput = <Output>(value: typeof Schema.Unknown.Type): Output => value as Output

const apply = <Input>(
  input: Input,
  decisions: ReadonlyArray<HookDecision>,
  applyDecision: ApplyDecision<Input>,
): Result<Input> => {
  let current = input
  let blocked: string | undefined
  let asked = false
  for (const decision of decisions) {
    current = applyDecision(current, decision)
    if (decision._tag === "Ask") asked = true
    if (decision._tag === "Block") {
      blocked = decision.reason
      break
    }
  }
  return { input: current, decisions, blocked, asked }
}

const loadRecorded = (
  interpreter: Option.Option<typeof DriverInterpreter.Service>,
  key: string,
  event: HookEvent,
): Effect.Effect<Option.Option<import("../../../hooks/index.js").Checkpoint>, DriverStateInvalid> => {
  if (Option.isNone(interpreter)) return Effect.succeed(Option.none())
  return Effect.gen(function* () {
    const checkpoint = yield* interpreter.value.checkpoint
    const state = yield* Schema.decodeUnknownEffect(LoopDriverState)(checkpoint.state).pipe(
      Effect.mapError((error) => DriverStateInvalid.make({ message: String(error) })),
    )
    const recorded = state.hooks?.find((entry) => entry.key === key)
    if (recorded !== undefined && recorded.event !== event) {
      return yield* DriverStateInvalid.make({
        message: `Hook checkpoint ${key} changed from ${recorded.event} to ${event}`,
      })
    }
    return Option.fromNullishOr(recorded)
  })
}

/** Run or replay one keyed hook chain through the current durable checkpoint. */
export const evaluate = <Input>(options: {
  readonly key: string
  readonly event: HookEvent
  readonly input: Input
  readonly applyDecision: ApplyDecision<Input>
}): Effect.Effect<Result<Input>, HookFailed | DriverError | DriverStateInvalid> =>
  Effect.gen(function* () {
    const interpreter = yield* Effect.serviceOption(DriverInterpreter)
    const recorded = Option.getOrUndefined(yield* loadRecorded(interpreter, options.key, options.event))
    if (recorded?.complete === true) return apply(options.input, recorded.decisions, options.applyDecision)
    const service = yield* Effect.serviceOption(Hooks)
    const declarations = Option.isSome(service)
      ? service.value.declarations.filter((declaration) => declaration.event === options.event)
      : []
    const decisions = [...(recorded?.decisions ?? [])]
    if (declarations.length === 0) return apply(options.input, decisions, options.applyDecision)
    if (decisions.length > declarations.length) {
      return yield* DriverStateInvalid.make({
        message: `Hook checkpoint ${options.key} has more decisions than registered ${options.event} hooks`,
      })
    }
    let current = apply(options.input, decisions, options.applyDecision).input
    for (let index = decisions.length; index < declarations.length; index += 1) {
      const declaration = declarations[index]!
      const decision = yield* invoke(declaration, current)
      decisions.push(decision)
      current = options.applyDecision(current, decision)
      if (Option.isSome(interpreter)) {
        const checkpoint = yield* interpreter.value.recordHookDecisions({
          key: options.key,
          event: options.event,
          decisions,
          complete: decision._tag === "Block" || index === declarations.length - 1,
        })
        if (checkpoint.decisions.length !== decisions.length) {
          return apply(options.input, checkpoint.decisions, options.applyDecision)
        }
      }
      if (decision._tag === "Block") return apply(options.input, decisions, options.applyDecision)
    }
    return apply(options.input, decisions, options.applyDecision)
  })

/** @internal Adapt ModelCall hooks into the one ModelMiddleware prompt chain. */
export const modelCallMiddleware = (runId: RunId): Middleware => ({
  transformPrompt: (prompt, context) =>
    Effect.gen(function* () {
      const result = yield* evaluate<ModelCallInput>({
        key: `hook:model:${context.turn}`,
        event: "ModelCall",
        input: { runId, agentName: context.agentName, turn: context.turn, prompt },
        applyDecision: (current, decision) => {
          if (decision._tag === "Replace") {
            return { ...current, prompt: replacementPrompt(decision.value) }
          }
          if (decision._tag === "AddContext") {
            return { ...current, prompt: Prompt.concat(current.prompt, decision.prompt) }
          }
          return current
        },
      })
      if (result.blocked !== undefined) {
        return yield* AgentError.make({
          message: `ModelCall hook blocked the model call: ${result.blocked}`,
          turn: context.turn,
        })
      }
      return result.input.prompt
    }).pipe(
      Effect.mapError((error) =>
        Schema.is(DriverError)(error) || Schema.is(DriverStateInvalid)(error)
          ? AgentError.make({ message: error.message, turn: context.turn, cause: error })
          : error,
      ),
    ),
})

/** @internal Apply RunStart hooks to the initial prompt. */
export const runStart = (options: { readonly input: RunStartInput; readonly turn: number }) =>
  evaluate({
    key: "hook:run:start",
    event: "RunStart",
    input: options.input,
    applyDecision: (current, decision) => {
      if (decision._tag === "Replace") return { ...current, input: replacementPrompt(decision.value) }
      if (decision._tag === "AddContext") {
        return { ...current, input: Prompt.concat(current.input, decision.prompt) }
      }
      return current
    },
  }).pipe(
    Effect.flatMap((result) =>
      result.blocked === undefined
        ? Effect.succeed(result.input.input)
        : AgentError.make({ message: `RunStart hook blocked the run: ${result.blocked}`, turn: options.turn }),
    ),
  )

interface CompactionPartsInput extends CompactionInput {
  readonly history: Prompt.Prompt
  readonly prompt: Prompt.Prompt
}

/** @internal Apply Compaction hooks while retaining the history/prompt split expected by Compaction. */
export const compaction = (input: CompactionPartsInput) =>
  evaluate({
    key: `hook:compaction:${input.turn}:${input.overflow ? "overflow" : "proactive"}`,
    event: "Compaction",
    input,
    applyDecision: (current, decision) => {
      if (decision._tag === "Replace") {
        const prompt = replacementPrompt(decision.value)
        return { ...current, before: prompt, history: Prompt.empty, prompt }
      }
      if (decision._tag === "AddContext") {
        return {
          ...current,
          before: Prompt.concat(current.before, decision.prompt),
          prompt: Prompt.concat(current.prompt, decision.prompt),
        }
      }
      return current
    },
  })

/** @internal Apply ToolCall hooks before authorization and tool execution. */
export const toolCall = (input: ToolCallInput) =>
  evaluate<ToolCallInput>({
    key: `hook:tool:${input.turn}:${input.call.id}:call`,
    event: "ToolCall",
    input,
    applyDecision: (current, decision) =>
      decision._tag === "Replace"
        ? {
            ...current,
            args: decision.value,
            call: {
              ...current.call,
              params: decision.value,
            },
          }
        : current,
  })

/** @internal Apply ToolResult hooks before the operation result is committed. */
export const toolResult = (input: ToolResultInput) =>
  evaluate<ToolResultInput>({
    key: `hook:tool:${input.turn}:${input.call.id}:result`,
    event: "ToolResult",
    input,
    applyDecision: (current, decision) =>
      decision._tag === "Replace" ? { ...current, result: decision.value } : current,
  })

/** @internal Apply ApprovalRequest hooks before the configured Approvals service resolves it. */
export const approvalRequest = (input: ApprovalRequestInput) =>
  evaluate<ApprovalRequestInput>({
    key: `hook:tool:${input.turn}:${input.call.id}:approval:${input.request.approvalId}`,
    event: "ApprovalRequest",
    input,
    applyDecision: (current) => current,
  })

/** @internal Apply ChildStart hooks before child admission or process-local execution. */
export const childStart = (input: ChildStartInput) =>
  evaluate<ChildStartInput>({
    key: `hook:child:${input.turn}:${input.child.operation}:start`,
    event: "ChildStart",
    input,
    applyDecision: (current) => current,
  })

/** @internal Apply ChildEnd hooks before a child result becomes visible to its parent. */
export const childEnd = (input: ChildEndInput) =>
  evaluate<ChildEndInput>({
    key: `hook:child:${input.turn}:${input.child.operation}:end`,
    event: "ChildEnd",
    input,
    applyDecision: (current, decision) =>
      decision._tag === "Replace" ? { ...current, result: decision.value } : current,
  })

/** @internal Apply TurnStart hooks to the prompt entering one turn. */
export const turnStart = (input: TurnStartInput) =>
  evaluate<TurnStartInput>({
    key: `hook:turn:${input.turn}:start`,
    event: "TurnStart",
    input,
    applyDecision: (current, decision) => {
      if (decision._tag === "Replace") {
        return { ...current, prompt: replacementPrompt(decision.value) }
      }
      if (decision._tag === "AddContext") {
        return { ...current, prompt: Prompt.concat(current.prompt, decision.prompt) }
      }
      return current
    },
  }).pipe(
    Effect.flatMap((result) =>
      result.blocked === undefined
        ? Effect.succeed(result.input.prompt)
        : AgentError.make({
            message: `TurnStart hook blocked turn ${input.turn}: ${result.blocked}`,
            turn: input.turn,
          }),
    ),
  )

/** @internal Apply Steer hooks to one queue drain before it becomes a turn prompt. */
export const steer = (input: SteerInput) =>
  evaluate<SteerInput>({
    key: `hook:steer:${input.turn}:${input.queue}`,
    event: "Steer",
    input,
    applyDecision: (current, decision) => {
      if (decision._tag === "Replace") {
        return { ...current, prompt: replacementPrompt(decision.value) }
      }
      if (decision._tag === "AddContext") {
        return { ...current, prompt: Prompt.concat(current.prompt, decision.prompt) }
      }
      return current
    },
  }).pipe(
    Effect.flatMap((result) =>
      result.blocked === undefined
        ? Effect.succeed(result.input.prompt)
        : AgentError.make({
            message: `Steer hook blocked ${input.queue} input: ${result.blocked}`,
            turn: input.turn,
          }),
    ),
  )

/** @internal Apply RunEnd hooks before the terminal Completed event is exposed. */
export const runEnd = <Output>(input: RunEndInput<Output>) =>
  evaluate<RunEndInput<Output>>({
    key: "hook:run:end",
    event: "RunEnd",
    input,
    applyDecision: (current, decision) =>
      decision._tag === "Replace" ? { ...current, output: replacementOutput<Output>(decision.value) } : current,
  }).pipe(
    Effect.flatMap((result) =>
      result.blocked === undefined
        ? Effect.succeed(result.input)
        : AgentError.make({
            message: `RunEnd hook blocked completion: ${result.blocked}`,
            turn: Math.max(0, input.turns - 1),
          }),
    ),
  )
