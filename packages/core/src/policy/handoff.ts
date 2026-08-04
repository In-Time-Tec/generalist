import { Array, Cause, Effect, Exit, Fiber, Function, Layer, Queue, Ref, Schema } from "effect"
import { LanguageModel, Prompt, Tool } from "effect/unstable/ai"
import {
  type Agent,
  type Result,
  type RunError,
  type RunOptions,
  type RunResult,
  type RunRequirements,
  generate,
  make,
} from "../agent/agent.js"
import { AgentError } from "../agent/agent-event.js"
import { type AgentToolToolkit, asTool } from "../agent/agent-tool.js"
import { type ClosedToolSet } from "../tools/tool-executor.js"
import { type TurnPolicy } from "../turn/turn-policy.js"
import { HandoffCatalog, layerCatalog, type HandoffTarget } from "./handoff-target.js"
import { handoffToolSpec } from "./handoff-runtime.js"
import { registerHandoffToolMeta } from "./handoff-tool-meta.js"
import type { ContextProjection } from "./handoff-projection.js"

const defaultDelegateParameters = Schema.Struct({ prompt: Schema.String })

type DefaultDelegateParameters = typeof defaultDelegateParameters

export class RegistrationError extends Schema.TaggedErrorClass<RegistrationError>()("@batonfx/core/RegistrationError", {
  agent: Schema.String,
  message: Schema.String,
  cause: Schema.Unknown,
}) {}

export interface Registration {
  readonly name: string
  readonly run: <O extends RunOptions>(
    options: O,
  ) => Effect.Effect<RunResult<O>, RunError | RegistrationError, RunRequirements<never, O>>
  readonly requirements: (value: never) => never
}

export const register = <Tools extends Record<string, Tool.Any>, R, E>(
  agent: Agent<Tools, R>,
  layer: Layer.Layer<R, E, never>,
): Registration => {
  const registrationLayer = Layer.effectContext(
    Layer.build(layer).pipe(
      Effect.mapError((cause) =>
        RegistrationError.make({
          agent: agent.name,
          message: `Failed to build services for agent '${agent.name}'`,
          cause,
        }),
      ),
    ),
  )
  return {
    name: agent.name,
    run: (options) => generate(agent, options).pipe(Effect.provide(registrationLayer)),
    requirements: (value) => value,
  }
}

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

export interface FanOutChild {
  readonly registration: Registration
  readonly prompt: Prompt.RawInput
  readonly options?: Omit<RunOptions, "prompt" | "output" | "memory" | "persistence">
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

export class FanOutUnsatisfied extends Schema.TaggedErrorClass<FanOutUnsatisfied>()("@batonfx/core/FanOutUnsatisfied", {
  join: Schema.Literals(["FirstSuccess", "Quorum"]),
  required: Schema.Int.check(Schema.isGreaterThan(0)),
  succeeded: Schema.Int.check(Schema.isGreaterThanOrEqualTo(0)),
  settled: Schema.Int.check(Schema.isGreaterThanOrEqualTo(0)),
  total: Schema.Int.check(Schema.isGreaterThanOrEqualTo(0)),
}) {}

export interface Supervisor<R> {
  readonly agent: Agent<Record<string, Tool.Any>, R | LanguageModel.LanguageModel>
  readonly toolkit: ClosedToolSet<never, Tool.Any>
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
      return members.some((member) => member?.status === "failed")
        ? "failed"
        : remaining === 0
          ? "succeeded"
          : undefined
    case "AllSettled":
    case "BestEffort":
      return remaining === 0 ? "succeeded" : undefined
    case "FirstSuccess":
      return succeeded > 0 ? "succeeded" : remaining === 0 ? "failed" : undefined
    case "Quorum":
      return succeeded >= join.required ? "succeeded" : succeeded + remaining < join.required ? "failed" : undefined
  }
}

const recordCompletion = (
  members: globalThis.Array<FanOutMemberResult | undefined>,
  completion: FanOutCompletion,
): void => {
  members[completion.ordinal] = Exit.isSuccess(completion.exit)
    ? { ordinal: completion.ordinal, status: "succeeded", result: completion.exit.value }
    : Cause.hasInterruptsOnly(completion.exit.cause)
      ? { ordinal: completion.ordinal, status: "cancelled", cause: completion.exit.cause }
      : { ordinal: completion.ordinal, status: "failed", cause: completion.exit.cause }
}

const runFanOut = (
  children: ReadonlyArray<FanOutChild>,
  options: FanOutOptions,
): Effect.Effect<
  ReadonlyArray<Result> | ReadonlyArray<FanOutMemberResult>,
  RunError | RegistrationError | FanOutUnsatisfied
> =>
  Effect.gen(function* () {
    const concurrency = yield* positiveConcurrency(options.concurrency)
    const join: FanOutJoin = options.join ?? { _tag: "AllSuccess" }
    if (
      join._tag === "Quorum" &&
      (!Number.isInteger(join.required) || join.required <= 0 || join.required > children.length)
    ) {
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
    const worker: Effect.Effect<void, RunError | RegistrationError> = Effect.suspend(() =>
      Ref.modify(nextOrdinal, (ordinal) =>
        ordinal < children.length ? ([ordinal, ordinal + 1] as const) : ([undefined, ordinal] as const),
      ).pipe(
        Effect.flatMap((ordinal) => {
          if (ordinal === undefined) return Effect.void
          const child = children[ordinal]!
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
      if (decision === "failed" || (decision === "succeeded" && remainder !== "await")) break
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
    const outcomes = members as globalThis.Array<FanOutMemberResult>
    if (join._tag === "AllSuccess") {
      const failed = outcomes.find((member) => member.status === "failed")
      if (failed?.status === "failed") return yield* Effect.failCause(failed.cause)
      const interrupted = outcomes.find((member) => member.status === "cancelled" && member.cause !== undefined)
      if (interrupted?.status === "cancelled" && interrupted.cause !== undefined) {
        return yield* Effect.failCause(interrupted.cause)
      }
      return outcomes.map((member) => (member as Extract<FanOutMemberResult, { status: "succeeded" }>).result)
    }
    if (decision === "failed" && (join._tag === "FirstSuccess" || join._tag === "Quorum")) {
      return yield* FanOutUnsatisfied.make({
        join: join._tag,
        required: join._tag === "Quorum" ? join.required : 1,
        succeeded: outcomes.filter((member) => member.status === "succeeded").length,
        settled: decisionSettled,
        total: children.length,
      })
    }
    return outcomes
  })

type HandoffToolkit = {
  readonly name: string
  readonly tool: Tool.Any
  readonly tools: Record<string, Tool.Any>
  readonly invoke: (params: unknown) => Effect.Effect<unknown, string>
}

const mergeHandoffTools = (toolkits: ReadonlyArray<HandoffToolkit>): ClosedToolSet<never, Tool.Any> => {
  const entries = new Map<string, HandoffToolkit>()
  for (const toolkit of toolkits) {
    if (!entries.has(toolkit.name)) entries.set(toolkit.name, toolkit)
  }
  const tools: Record<string, Tool.Any> = {}
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
  <Parameters extends Schema.Top = DefaultDelegateParameters, Success extends Schema.Top = typeof Schema.String>(
    options?: DelegateOptions<Parameters, Success>,
  ): (target: Registration) => AgentToolToolkit<string, Parameters, Success, never>
  <Parameters extends Schema.Top = DefaultDelegateParameters, Success extends Schema.Top = typeof Schema.String>(
    target: Registration,
    options?: DelegateOptions<Parameters, Success>,
  ): AgentToolToolkit<string, Parameters, Success, never>
} = Function.dual(
  (args) => args.length !== 1 || "run" in args[0],
  <Parameters extends Schema.Top = DefaultDelegateParameters, Success extends Schema.Top = typeof Schema.String>(
    registration: Registration,
    options: DelegateOptions<Parameters, Success> = {},
  ): AgentToolToolkit<string, Parameters, Success, never> =>
    asTool(registration, {
      name: options.nameOverride ?? `delegate_to_${registration.name}`,
      description: options.description ?? `Delegate to ${registration.name} as an inline child run`,
      ...(options.parameters === undefined ? {} : { parameters: options.parameters }),
      ...(options.success === undefined ? {} : { success: options.success }),
      ...(options.toPrompt === undefined ? {} : { toPrompt: options.toPrompt }),
      ...(options.fromResult === undefined ? {} : { fromResult: options.fromResult }),
    }),
)

export const sameRunHandoffTool = (handoffTarget: HandoffTarget, options: HandoffToolOptions = {}): HandoffToolkit => {
  const spec = handoffToolSpec(handoffTarget, options)
  registerHandoffToolMeta(spec.tool.name, {
    specialist: spec.specialist,
    ...(spec.projection === undefined ? {} : { projection: spec.projection }),
    ...(spec.maxRepeatedEdge === undefined ? {} : { maxRepeatedEdge: spec.maxRepeatedEdge }),
  })
  return {
    name: spec.tool.name,
    tool: spec.tool,
    tools: { [spec.tool.name]: spec.tool },
    invoke: () => Effect.fail("Same-run handoff tools execute through the agent loop, not direct invocation"),
  }
}

export const fanOut: {
  (
    options: FanOutCollectOptions,
  ): (
    children: ReadonlyArray<FanOutChild>,
  ) => Effect.Effect<ReadonlyArray<FanOutMemberResult>, RunError | RegistrationError | FanOutUnsatisfied>
  (
    options: FanOutAllSuccessOptions,
  ): (children: ReadonlyArray<FanOutChild>) => Effect.Effect<ReadonlyArray<Result>, RunError | RegistrationError>
  (): (children: ReadonlyArray<FanOutChild>) => Effect.Effect<ReadonlyArray<Result>, RunError | RegistrationError>
  (
    children: ReadonlyArray<FanOutChild>,
    options: FanOutCollectOptions,
  ): Effect.Effect<ReadonlyArray<FanOutMemberResult>, RunError | RegistrationError | FanOutUnsatisfied>
  (
    children: ReadonlyArray<FanOutChild>,
    options?: FanOutAllSuccessOptions,
  ): Effect.Effect<ReadonlyArray<Result>, RunError | RegistrationError>
  (
    children: ReadonlyArray<FanOutChild>,
    options: FanOutOptions,
  ): Effect.Effect<
    ReadonlyArray<Result> | ReadonlyArray<FanOutMemberResult>,
    RunError | RegistrationError | FanOutUnsatisfied
  >
} = Function.dual(
  (args) => args.length > 1 || globalThis.Array.isArray(args[0]),
  (children: ReadonlyArray<FanOutChild>, options: FanOutOptions = {}): ReturnType<typeof runFanOut> =>
    runFanOut(children, options),
)

export const supervisor = (options: SupervisorOptions): Supervisor<never> => {
  const specialists = options.specialists
  const handoffTools = specialists.map((specialist) => sameRunHandoffTool(specialist, options.handoffOptions ?? {}))
  const toolkit = mergeHandoffTools(handoffTools)
  const agent = make({
    name: options.name,
    ...(options.instructions === undefined ? {} : { instructions: options.instructions }),
    tools: Object.values(toolkit.tools),
    ...(options.policy === undefined ? {} : { policy: options.policy }),
  })
  return {
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
export { HandoffCommit, HandoffControlState } from "../agent/handoff-state.js"
