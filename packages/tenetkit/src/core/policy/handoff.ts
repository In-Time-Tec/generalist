import { Array, Cause, Effect, Exit, Fiber, Function, Layer, Queue, Ref, Schema } from "effect"
import { LanguageModel, Prompt, Tool } from "effect/unstable/ai"
import {
  type Agent,
  type Result,
  type RunError,
  type RunOptions,
  type RunRequirements,
  make,
} from "../agent/service.js"
import { AgentError } from "../agent/event.js"
import type { HandoffAccepted } from "../agent/handoff/state.js"
import { type AgentToolToolkit, asTool, RegistrationError } from "../agent/tool.js"
import type { Registration } from "../agent/tool/registration.js"
import type { ClosedToolSet } from "../tools/tool-executor.js"
import type { TurnPolicy } from "../turn/policy.js"
import { HandoffCatalog, layerCatalog, type HandoffTarget } from "./handoff-target.js"
import { handoffToolSpec } from "./handoff-runtime.js"
import { registerHandoffToolMeta } from "./handoff-tool-meta.js"
import type { ContextProjection } from "./handoff-projection.js"

const defaultDelegateParameters = Schema.Struct({ prompt: Schema.String })

type DefaultDelegateParameters = typeof defaultDelegateParameters

export interface DelegateOptions<
  Parameters extends Schema.Top = DefaultDelegateParameters,
  Success extends Schema.Top = typeof Schema.String,
> {
  readonly nameOverride?: string
  readonly description?: string
  readonly parameters?: Parameters
  readonly success?: Success
  readonly toPrompt?: (params: Parameters["Type"]) => Prompt.RawInput
  readonly fromResult?: (result: Result) => Success["Type"]
}

export interface HandoffToolOptions {
  readonly nameOverride?: string
  readonly description?: string
  readonly projection?: ContextProjection
  readonly maxRepeatedEdge?: number
}

export interface FanOutChild<Tools extends Record<string, Tool.Any> = Record<string, Tool.Any>, R = never> {
  readonly registration: Registration<Tools, R>
  readonly prompt: Prompt.RawInput
  readonly options?: Omit<RunOptions, "prompt" | "output" | "memory">
}

export type FanOutJoin =
  | { readonly _tag: "AllSuccess" }
  | { readonly _tag: "AllSettled" }
  | { readonly _tag: "FirstSuccess" }
  | { readonly _tag: "Quorum"; readonly required: number }
  | { readonly _tag: "BestEffort" }

export type FanOutRemainder = "await" | "request-cancel" | "terminate"

interface FanOutBaseOptions {
  readonly concurrency?: number
  readonly remainder?: FanOutRemainder
}

interface DelegateToolConfiguration<Parameters extends Schema.Top, Success extends Schema.Top> {
  name: string
  description: string
  parameters?: Parameters
  success?: Success
  toPrompt?: (params: Parameters["Type"]) => Prompt.RawInput
  fromResult?: (result: Result) => Success["Type"]
}
interface HandoffMetadata {
  specialist: string
  projection?: ContextProjection
  maxRepeatedEdge?: number
}
interface SupervisorAgentOptions {
  name: string
  instructions?: string
  tools: ReadonlyArray<HandoffToolkit["tool"]>
  policy?: TurnPolicy
}

export interface FanOutAllSuccessOptions extends FanOutBaseOptions {
  readonly join?: { readonly _tag: "AllSuccess" }
}

export interface FanOutCollectOptions extends FanOutBaseOptions {
  readonly join:
    | { readonly _tag: "AllSettled" }
    | { readonly _tag: "FirstSuccess" }
    | { readonly _tag: "Quorum"; readonly required: number }
    | { readonly _tag: "BestEffort" }
}

export type FanOutOptions = FanOutAllSuccessOptions | FanOutCollectOptions

export type FanOutMemberResult =
  | { readonly ordinal: number; readonly status: "succeeded"; readonly result: Result }
  | {
      readonly ordinal: number
      readonly status: "failed"
      readonly cause: Cause.Cause<RunError | RegistrationError>
    }
  | {
      readonly ordinal: number
      readonly status: "cancelled"
      readonly cause?: Cause.Cause<RunError | RegistrationError>
    }

export class FanOutUnsatisfied extends Schema.TaggedError<FanOutUnsatisfied>()("tenetkit/core/FanOutUnsatisfied", {
  join: Schema.Literals(["FirstSuccess", "Quorum"]),
  required: Schema.Int.check(Schema.isGreaterThan(0)),
  succeeded: Schema.Int.check(Schema.isGreaterThanOrEqualTo(0)),
  settled: Schema.Int.check(Schema.isGreaterThanOrEqualTo(0)),
  total: Schema.Int.check(Schema.isGreaterThanOrEqualTo(0)),
}) {}

export interface Supervisor<R, Tools extends Record<string, Tool.Any> = Record<string, Tool.Any>> {
  readonly agent: Agent<Tools, R | LanguageModel.LanguageModel>
  readonly toolkit: ClosedToolSet<never, Tools[keyof Tools]>
  readonly catalog: Layer.Layer<HandoffCatalog>
}

export interface SupervisorOptions {
  readonly name: string
  readonly instructions?: string
  readonly specialists: ReadonlyArray<HandoffTarget>
  readonly policy?: TurnPolicy
  readonly handoffOptions?: HandoffToolOptions
}

const positiveConcurrency = (value: number | undefined): Effect.Effect<number, AgentError> => {
  const concurrency = value ?? 4
  return Number.isInteger(concurrency) && concurrency > 0
    ? Effect.succeed(concurrency)
    : Effect.fail(
        AgentError.make({
          message: "Handoff.fanOut concurrency must be a positive integer",
          turn: 0,
        }),
      )
}

type FanOutCompletion = {
  readonly ordinal: number
  readonly exit: Exit.Exit<Result, RunError | RegistrationError>
}

type FanOutDecision = "succeeded" | "failed" | undefined

const fanOutDecision = (join: FanOutJoin, members: ReadonlyArray<FanOutMemberResult | undefined>): FanOutDecision => {
  const succeeded = members.filter((member) => member?.status === "succeeded").length
  const settled = members.filter((member) => member !== undefined).length
  const remaining = members.length - settled
  switch (join._tag) {
    case "AllSuccess":
      if (members.some((member) => member?.status === "failed")) return "failed"
      return remaining === 0 ? "succeeded" : undefined
    case "AllSettled":
    case "BestEffort":
      return remaining === 0 ? "succeeded" : undefined
    case "FirstSuccess":
      if (succeeded > 0) return "succeeded"
      return remaining === 0 ? "failed" : undefined
    case "Quorum":
      if (succeeded >= join.required) return "succeeded"
      return succeeded + remaining < join.required ? "failed" : undefined
  }
}

const recordCompletion = (
  members: globalThis.Array<FanOutMemberResult | undefined>,
  completion: FanOutCompletion,
): void => {
  if (Exit.isSuccess(completion.exit)) {
    members[completion.ordinal] = { ordinal: completion.ordinal, status: "succeeded", result: completion.exit.value }
  } else if (Cause.hasInterruptsOnly(completion.exit.cause)) {
    members[completion.ordinal] = { ordinal: completion.ordinal, status: "cancelled", cause: completion.exit.cause }
  } else {
    members[completion.ordinal] = { ordinal: completion.ordinal, status: "failed", cause: completion.exit.cause }
  }
}

const isInvalidQuorum = (join: FanOutJoin, memberCount: number): boolean =>
  join._tag === "Quorum" && (!Number.isInteger(join.required) || join.required <= 0 || join.required > memberCount)

const shouldStopWaiting = (decision: FanOutDecision, remainder: FanOutRemainder): boolean =>
  decision === "failed" || (decision === "succeeded" && remainder !== "await")

const finishFanOut = (
  join: FanOutJoin,
  decision: FanOutDecision,
  decisionSettled: number,
  total: number,
  outcomes: ReadonlyArray<FanOutMemberResult>,
): Effect.Effect<
  ReadonlyArray<Result> | ReadonlyArray<FanOutMemberResult>,
  RunError | RegistrationError | FanOutUnsatisfied
> => {
  if (join._tag === "AllSuccess") {
    const failed = outcomes.find((member) => member.status === "failed")
    if (failed?.status === "failed") return Effect.failCause(failed.cause)
    const interrupted = outcomes.find((member) => member.status === "cancelled" && member.cause !== undefined)
    if (interrupted?.status === "cancelled" && interrupted.cause !== undefined) {
      return Effect.failCause(interrupted.cause)
    }
    return Effect.succeed(outcomes.flatMap((member) => (member.status === "succeeded" ? [member.result] : [])))
  }
  if (decision !== "failed" || (join._tag !== "FirstSuccess" && join._tag !== "Quorum")) {
    return Effect.succeed(outcomes)
  }
  return FanOutUnsatisfied.make({
    join: join._tag,
    required: join._tag === "Quorum" ? join.required : 1,
    succeeded: outcomes.filter((member) => member.status === "succeeded").length,
    settled: decisionSettled,
    total,
  })
}

const runFanOut = <Tools extends Record<string, Tool.Any>, R>(
  children: ReadonlyArray<FanOutChild<Tools, R>>,
  options: FanOutOptions,
): Effect.Effect<
  ReadonlyArray<Result> | ReadonlyArray<FanOutMemberResult>,
  RunError | RegistrationError | FanOutUnsatisfied,
  RunRequirements<Tools, R, { prompt: Prompt.RawInput }>
> =>
  Effect.gen(function* () {
    const concurrency = yield* positiveConcurrency(options.concurrency)
    const join: FanOutJoin = options.join ?? { _tag: "AllSuccess" }
    if (isInvalidQuorum(join, children.length)) {
      return yield* AgentError.make({
        message: "Handoff.fanOut quorum must be a positive integer no greater than the member count",
        turn: 0,
      })
    }
    const remainder = options.remainder ?? "await"
    const completions = yield* Queue.unbounded<FanOutCompletion>()
    const members: globalThis.Array<FanOutMemberResult | undefined> = globalThis.Array.from(
      { length: children.length },
      () => undefined,
    )
    const nextOrdinal = yield* Ref.make(0)
    const worker: Effect.Effect<
      void,
      RunError | RegistrationError,
      RunRequirements<Tools, R, { prompt: Prompt.RawInput }>
    > = Effect.suspend(() =>
      Ref.modify(nextOrdinal, (ordinal) =>
        ordinal < children.length ? ([ordinal, ordinal + 1] as const) : ([undefined, ordinal] as const),
      ).pipe(
        Effect.flatMap((ordinal) => {
          if (ordinal === undefined) return Effect.void
          const child = children[ordinal]
          if (child === undefined) return Effect.void
          return Effect.fiberId.pipe(
            Effect.flatMap((workerId) =>
              child.registration.run({ ...child.options, prompt: child.prompt }).pipe(
                Effect.onExit((exit) => Queue.offer(completions, { ordinal, exit })),
                Effect.catchCause((cause) =>
                  Cause.hasInterruptsOnly(cause) && !Cause.interruptors(cause).has(workerId)
                    ? Effect.failCause(cause)
                    : Effect.void,
                ),
              ),
            ),
            Effect.andThen(worker),
          )
        }),
      ),
    )
    const workers = yield* Effect.forEach(
      globalThis.Array.from({ length: Math.min(concurrency, children.length) }),
      () => Effect.forkChild(worker),
    )
    let settled = 0
    let decision = fanOutDecision(join, members)
    while (settled < children.length) {
      if (shouldStopWaiting(decision, remainder)) break
      const completion = yield* Queue.take(completions)
      if (members[completion.ordinal] === undefined) settled++
      recordCompletion(members, completion)
      decision = fanOutDecision(join, members)
    }
    const decisionSettled = settled
    if (settled < children.length) {
      yield* Fiber.interruptAll(workers)
      for (const completion of yield* Queue.takeAll(completions)) {
        if (members[completion.ordinal] === undefined) settled++
        recordCompletion(members, completion)
      }
      for (let ordinal = 0; ordinal < members.length; ordinal++) {
        if (members[ordinal] === undefined) members[ordinal] = { ordinal, status: "cancelled" }
      }
    } else {
      yield* Fiber.joinAll(workers)
    }
    const outcomes = members.flatMap((member) => (member === undefined ? [] : [member]))
    return yield* finishFanOut(join, decision, decisionSettled, children.length, outcomes)
  })

type HandoffToolkit = {
  readonly name: string
  readonly tool: import("./handoff-runtime.js").HandoffToolSpecResult["tool"]
  readonly tools: Record<string, import("./handoff-runtime.js").HandoffToolSpecResult["tool"]>
  readonly invoke: (params: HandoffParameters) => Effect.Effect<HandoffAccepted, string>
}

type HandoffParameters = typeof Schema.Unknown.Type

const mergeHandoffTools = (toolkits: ReadonlyArray<HandoffToolkit>): ClosedToolSet<never, HandoffToolkit["tool"]> => {
  const entries = new Map<string, HandoffToolkit>()
  for (const toolkit of toolkits) {
    if (!entries.has(toolkit.name)) entries.set(toolkit.name, toolkit)
  }
  const tools: Record<string, HandoffToolkit["tool"]> = {}
  for (const [name, entry] of entries) tools[name] = entry.tool
  return {
    tools,
    invoke: (name, params) => {
      const entry = entries.get(name)
      return entry === undefined ? Effect.fail(`Tool ${name} is not registered`) : entry.invoke(params)
    },
  }
}

export const delegateTool: {
  <
    Tools extends Record<string, Tool.Any> = Record<string, Tool.Any>,
    R = never,
    Parameters extends Schema.Top = DefaultDelegateParameters,
    Success extends Schema.Top = typeof Schema.String,
  >(
    options?: DelegateOptions<Parameters, Success>,
  ): (
    target: Registration<Tools, R>,
  ) => AgentToolToolkit<
    string,
    Parameters,
    Success,
    RunRequirements<Tools, R, { prompt: Prompt.RawInput }> | Parameters["DecodingServices"]
  >
  <
    Tools extends Record<string, Tool.Any> = Record<string, Tool.Any>,
    R = never,
    Parameters extends Schema.Top = DefaultDelegateParameters,
    Success extends Schema.Top = typeof Schema.String,
  >(
    target: Registration<Tools, R>,
    options?: DelegateOptions<Parameters, Success>,
  ): AgentToolToolkit<
    string,
    Parameters,
    Success,
    RunRequirements<Tools, R, { prompt: Prompt.RawInput }> | Parameters["DecodingServices"]
  >
} = Function.dual(
  (args) => args.length !== 1 || "run" in args[0],
  <
    Tools extends Record<string, Tool.Any>,
    R,
    Parameters extends Schema.Top = DefaultDelegateParameters,
    Success extends Schema.Top = typeof Schema.String,
  >(
    registration: Registration<Tools, R>,
    options: DelegateOptions<Parameters, Success> = {},
  ): AgentToolToolkit<
    string,
    Parameters,
    Success,
    RunRequirements<Tools, R, { prompt: Prompt.RawInput }> | Parameters["DecodingServices"]
  > => {
    const toolOptions: DelegateToolConfiguration<Parameters, Success> = {
      name: options.nameOverride ?? `delegate_to_${registration.name}`,
      description: options.description ?? `Delegate to ${registration.name} as an inline child run`,
    }
    if (options.parameters !== undefined) toolOptions.parameters = options.parameters
    if (options.success !== undefined) toolOptions.success = options.success
    if (options.toPrompt !== undefined) toolOptions.toPrompt = options.toPrompt
    if (options.fromResult !== undefined) toolOptions.fromResult = options.fromResult
    return asTool<Tools, R, string, Parameters, Success>(registration, toolOptions)
  },
)

export const sameRunHandoffTool: {
  (options?: HandoffToolOptions): (handoffTarget: HandoffTarget) => HandoffToolkit
  (handoffTarget: HandoffTarget, options?: HandoffToolOptions): HandoffToolkit
} = Function.dual(
  (args) => args.length > 1 || "agent" in args[0],
  (handoffTarget: HandoffTarget, options: HandoffToolOptions = {}): HandoffToolkit => {
    const spec = handoffToolSpec(handoffTarget, options)
    const metadata: HandoffMetadata = { specialist: spec.specialist }
    if (spec.projection !== undefined) metadata.projection = spec.projection
    if (spec.maxRepeatedEdge !== undefined) metadata.maxRepeatedEdge = spec.maxRepeatedEdge
    registerHandoffToolMeta(spec.tool.name, metadata)
    return {
      name: spec.tool.name,
      tool: spec.tool,
      tools: { [spec.tool.name]: spec.tool },
      invoke: () => Effect.fail("Same-run handoff tools execute through the agent loop, not direct invocation"),
    }
  },
)

export const fanOut: {
  <Tools extends Record<string, Tool.Any> = Record<string, Tool.Any>, R = never>(
    options: FanOutCollectOptions,
  ): (
    children: ReadonlyArray<FanOutChild<Tools, R>>,
  ) => Effect.Effect<ReadonlyArray<FanOutMemberResult>, RunError | RegistrationError | FanOutUnsatisfied>
  <Tools extends Record<string, Tool.Any> = Record<string, Tool.Any>, R = never>(
    options?: FanOutAllSuccessOptions,
  ): (
    children: ReadonlyArray<FanOutChild<Tools, R>>,
  ) => Effect.Effect<ReadonlyArray<Result>, RunError | RegistrationError>
  <Tools extends Record<string, Tool.Any> = Record<string, Tool.Any>, R = never>(
    options: FanOutOptions,
  ): (
    children: ReadonlyArray<FanOutChild<Tools, R>>,
  ) => Effect.Effect<
    ReadonlyArray<Result> | ReadonlyArray<FanOutMemberResult>,
    RunError | RegistrationError | FanOutUnsatisfied
  >
  <Tools extends Record<string, Tool.Any> = Record<string, Tool.Any>, R = never>(): (
    children: ReadonlyArray<FanOutChild<Tools, R>>,
  ) => Effect.Effect<ReadonlyArray<Result>, RunError | RegistrationError>
  <Tools extends Record<string, Tool.Any> = Record<string, Tool.Any>, R = never>(
    children: ReadonlyArray<FanOutChild<Tools, R>>,
    options: FanOutCollectOptions,
  ): Effect.Effect<ReadonlyArray<FanOutMemberResult>, RunError | RegistrationError | FanOutUnsatisfied>
  <Tools extends Record<string, Tool.Any> = Record<string, Tool.Any>, R = never>(
    children: ReadonlyArray<FanOutChild<Tools, R>>,
    options?: FanOutAllSuccessOptions,
  ): Effect.Effect<ReadonlyArray<Result>, RunError | RegistrationError>
  <Tools extends Record<string, Tool.Any> = Record<string, Tool.Any>, R = never>(
    children: ReadonlyArray<FanOutChild<Tools, R>>,
    options: FanOutOptions,
  ): Effect.Effect<
    ReadonlyArray<Result> | ReadonlyArray<FanOutMemberResult>,
    RunError | RegistrationError | FanOutUnsatisfied
  >
} = Function.dual(
  (args) => args.length > 1 || globalThis.Array.isArray(args[0]),
  <Tools extends Record<string, Tool.Any>, R>(
    children: ReadonlyArray<FanOutChild<Tools, R>>,
    options: FanOutOptions = {},
  ): ReturnType<typeof runFanOut> => runFanOut(children, options),
)

export const supervisor = (options: SupervisorOptions) => {
  const specialists = options.specialists
  const handoffTools = specialists.map((specialist) => sameRunHandoffTool(specialist, options.handoffOptions ?? {}))
  const toolkit = mergeHandoffTools(handoffTools)
  const agentOptions: SupervisorAgentOptions = {
    name: options.name,
    tools: Object.values(toolkit.tools),
  }
  if (options.instructions !== undefined) agentOptions.instructions = options.instructions
  if (options.policy !== undefined) agentOptions.policy = options.policy
  const agent = make(agentOptions)
  type SupervisorAgentR = typeof agent extends Agent<infer _Tools, infer AgentR> ? AgentR : never
  const result: Supervisor<SupervisorAgentR, HandoffToolkit["tool"] extends infer T ? Record<string, T> : never> = {
    agent: {
      ...agent,
      toolDeclarations: Array.zip(specialists, handoffTools).flatMap(([specialist, handoff]) =>
        Object.values(handoff.tools).map((tool) => ({
          tool,
          origin: { _tag: "Handoff" as const, specialist: specialist.name, mode: "same-run" as const },
        })),
      ),
    },
    toolkit,
    catalog: layerCatalog(specialists),
  }
  return result
}

export { target, layerCatalog, HandoffCatalog, type HandoffTarget } from "./handoff-target.js"
export {
  HandoffInput,
  HandoffOutput,
  defaultContextProjection,
  filterContextProjection,
  HandoffProjectionInvalid,
} from "./handoff-projection.js"
export { executeSameRunHandoff, HandoffRejected } from "./handoff-runtime.js"
export { HandoffCommit, HandoffControlState } from "../agent/handoff/state.js"
export { register, RegistrationError } from "../agent/tool.js"
export type { Registration } from "../agent/tool/registration.js"
