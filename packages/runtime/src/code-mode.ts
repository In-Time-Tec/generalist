import { Effect, type Layer, Option, Schema } from "effect"
import { Tool } from "effect/unstable/ai"
import { Agent, AgentEvent, ExecutableManifest, Pins, ProgramManifest, ToolContext, ToolExecutor } from "@batonfx/core"
import type { AgentManifest } from "@batonfx/core"
import type {
  AdmitProgramChildInput,
  ExecutionClaim,
  ExecutionRecord,
  Interface as RunStoreInterface,
} from "./run-store.js"
import type { ExecutionCheckpoint } from "./execution-state.js"
import type { ExecutionContinuation } from "./steering.js"
import { make as makeAddress } from "./address.js"
import { make as makeMessage } from "./message.js"
import { narrow as narrowRegistrations } from "./executable-registration.js"
import { normalizePrompt } from "./memory/prompt.js"

const CapabilityNames = Schema.Array(Schema.String.check(Schema.isNonEmpty(), Schema.isMaxLength(128))).pipe(
  Schema.check(Schema.isMaxLength(64)),
)

/** @experimental Exact model-authored Program request admitted only through an authorized Agent Run. */
export const Parameters = Schema.Struct({
  source: Schema.String,
  input: Schema.String,
  tools: CapabilityNames,
  agents: CapabilityNames,
  steps: CapabilityNames,
  budget: ProgramManifest.ProgramBudget,
})
/** @experimental */
export type Parameters = typeof Parameters.Type

/** @experimental */
export class ProgramAuthorityMissing extends Schema.TaggedErrorClass<ProgramAuthorityMissing>()(
  "@batonfx/runtime/ProgramAuthorityMissing",
  { runId: Schema.String },
) {}

/** @experimental */
export class ProgramAuthorityExceeded extends Schema.TaggedErrorClass<ProgramAuthorityExceeded>()(
  "@batonfx/runtime/ProgramAuthorityExceeded",
  { dimension: Schema.String, message: Schema.String },
) {}

/** @experimental */
export class ProgramAdmissionFailed extends Schema.TaggedErrorClass<ProgramAdmissionFailed>()(
  "@batonfx/runtime/ProgramAdmissionFailed",
  { message: Schema.String },
) {}

/** @experimental Runtime-owned Effect AI tool for bounded dynamic Program admission. */
export const tool = Tool.make("code_mode", {
  description: "Run exact JavaScript in the host sandbox using a narrowed set of approved capabilities and budgets.",
  parameters: Parameters,
  success: Schema.Unknown,
  failure: Schema.Union([ProgramAuthorityMissing, ProgramAuthorityExceeded, ProgramAdmissionFailed]),
})

const selected = <A>(
  requested: ReadonlyArray<string>,
  allowed: ReadonlyArray<A>,
  nameOf: (value: A) => string,
  dimension: string,
): Effect.Effect<ReadonlyArray<A>, ProgramAuthorityExceeded> =>
  Effect.gen(function* () {
    if (new Set(requested).size !== requested.length) {
      return yield* ProgramAuthorityExceeded.make({ dimension, message: `${dimension} must be unique` })
    }
    const byName = new Map(allowed.map((value) => [nameOf(value), value] as const))
    const values: Array<A> = []
    for (const name of requested) {
      const value = byName.get(name)
      if (value === undefined) {
        return yield* ProgramAuthorityExceeded.make({ dimension, message: `${name} is not authorized` })
      }
      values.push(value)
    }
    return values
  })

const narrowBudget = (
  requested: ProgramManifest.ProgramBudget,
  maximum: ProgramManifest.ProgramBudget,
): Effect.Effect<void, ProgramAuthorityExceeded> =>
  Effect.gen(function* () {
    for (const key of Object.keys(maximum) as Array<keyof ProgramManifest.ProgramBudget>) {
      if (requested[key] > maximum[key]) {
        return yield* ProgramAuthorityExceeded.make({
          dimension: key,
          message: `${requested[key]} exceeds ${maximum[key]}`,
        })
      }
    }
  })

const closureFor = (
  manifest: ExecutableManifest.ExecutableManifest,
  roots: ReadonlyArray<string>,
): ReadonlyArray<Extract<ExecutableManifest.ExecutableEntry, { readonly _tag: "Agent" }>> => {
  const byPin = new Map<string, ExecutableManifest.ExecutableEntry>(
    manifest.entries.map((entry) => [entry.pin, entry] as const),
  )
  const entries = new Map<string, Extract<ExecutableManifest.ExecutableEntry, { readonly _tag: "Agent" }>>()
  const visit = (pin: string): void => {
    if (entries.has(pin)) return
    const entry = byPin.get(pin)
    if (entry?._tag !== "Agent") throw new TypeError(`Program Agent is not in the parent executable: ${pin}`)
    entries.set(pin, entry)
    for (const child of [...entry.manifest.children, ...(entry.manifest.programAuthority?.agents ?? [])])
      visit(child.agent)
  }
  for (const root of roots) visit(root)
  return [...entries.values()]
}

export interface Interface {
  readonly invoke: (request: Parameters & { readonly toolCallId: string }) => Effect.Effect<ToolExecutor.Outcome>
  readonly admitSuspension: (input: {
    readonly suspension: AgentEvent.AgentSuspended
    readonly openedAt: string
    readonly checkpoint?: ExecutionCheckpoint
    readonly transcript?: import("effect/unstable/ai").Prompt.Prompt
    readonly continuation?: ExecutionContinuation | null
  }) => Effect.Effect<void, ProgramAdmissionFailed>
}

/** @experimental Construct the Run-attempt scoped implementation; applications still own sandbox and bindings resolution. */
export const make = (input: {
  readonly claim: ExecutionClaim
  readonly claimed: ExecutionRecord
  readonly authority: AgentManifest.ProgramAuthority
  readonly store: RunStoreInterface
}): Interface => {
  const prepare = (request: Parameters & { readonly toolCallId: string }) =>
    Effect.gen(function* () {
      const sourceBytes = new TextEncoder().encode(request.source).byteLength
      if (sourceBytes > input.authority.maxSourceBytes) {
        return yield* ProgramAuthorityExceeded.make({
          dimension: "sourceBytes",
          message: `${sourceBytes} exceeds ${input.authority.maxSourceBytes}`,
        })
      }
      yield* narrowBudget(request.budget, input.authority.budget)
      const tools = yield* selected(request.tools, input.authority.tools, (value) => value.name, "tools")
      const agents = yield* selected(request.agents, input.authority.agents, (value) => value.selection, "agents")
      const steps = yield* selected(request.steps, input.authority.steps, (value) => value.name, "steps")
      const program = ProgramManifest.make({
        name: `code_mode:${request.toolCallId}`,
        source: { language: "javascript", text: request.source },
        sandbox: input.authority.sandbox,
        input: input.authority.input,
        output: input.authority.output,
        capabilities: { tools, agents, steps },
        budget: request.budget,
      })
      const executable = ExecutableManifest.make({
        root: program.pin,
        entries: [
          { _tag: "Program", ...program },
          ...closureFor(
            input.claimed.executableManifest,
            agents.map((agent) => agent.agent),
          ).map((entry) => ({ _tag: "Agent" as const, pin: entry.pin, manifest: entry.manifest })),
        ],
      })
      const registrations = yield* narrowRegistrations(executable, input.claimed.registrations)
      const childRunId = `run_code_${Pins.digest({ parentRunId: input.claim.runId, toolCallId: request.toolCallId }).slice(0, 32)}`
      const idempotencyKey = `code-mode:${input.claim.runId}:${request.toolCallId}`
      const message = makeMessage({
        id: `code-mode:${request.toolCallId}`,
        to: makeAddress(`code-mode:${input.claim.runId}`),
        sessionId: `code-mode:${input.claim.runId}`,
        idempotencyKey,
        correlationId: input.claimed.rootRunId,
        prompt: normalizePrompt(request.input),
        metadata: {
          runtimeChildTool: true,
          codeMode: true,
          parentRunId: input.claim.runId,
          parentToolCallId: request.toolCallId,
        },
      })
      return {
        ...input.claim,
        childRunId,
        invocationId: request.toolCallId,
        message,
        executableRef: executable.ref,
        executableManifest: executable.manifest,
        registrations,
      } satisfies AdmitProgramChildInput
    })
  const admissionFailure = (failure: unknown) =>
    ProgramAdmissionFailed.make({
      message:
        typeof failure === "object" && failure !== null && "message" in failure
          ? String(failure.message)
          : String(failure),
    })
  return {
    invoke: (request) =>
      prepare(request).pipe(
        Effect.map((prepared) => ({ _tag: "Suspend" as const, token: prepared.childRunId })),
        Effect.catch((failure) => {
          const typed =
            Schema.is(ProgramAuthorityExceeded)(failure) || Schema.is(ProgramAuthorityMissing)(failure)
              ? failure
              : ProgramAdmissionFailed.make({
                  message: "message" in failure ? String(failure.message) : String(failure),
                })
          return Effect.succeed({ _tag: "DomainFailure" as const, failure: typed, encodedFailure: typed })
        }),
      ),
    admitSuspension: ({ suspension, openedAt, ...state }) =>
      Schema.decodeUnknownEffect(Parameters, { onExcessProperty: "error" })(suspension.tool_params).pipe(
        Effect.flatMap((parameters) => prepare({ ...parameters, toolCallId: suspension.tool_call_id })),
        Effect.filterOrFail(
          (prepared) => prepared.childRunId === suspension.token,
          () => ProgramAdmissionFailed.make({ message: "code_mode suspension token does not match its child Run" }),
        ),
        Effect.flatMap((prepared) =>
          input.store.admitProgramChildAndSuspend({
            ...prepared,
            ...state,
            suspension,
            wait: {
              waitId: suspension.tool_call_id,
              reason: suspension.reason,
              status: "open",
              openedAt,
            },
          }),
        ),
        Effect.asVoid,
        Effect.mapError(admissionFailure),
      ),
  }
}

/** @experimental Add the Runtime-owned declaration without changing the resolved Agent identity. */
export const withTool = <Tools extends Record<string, Tool.Any>, R>(
  agent: Agent.Agent<Tools, R>,
): Agent.Agent<Record<string, Tool.Any>, R> => Agent.withTools(agent, [tool])

/** @experimental Route only code_mode to Runtime and preserve the resolved Agent's existing executor behavior. */
export const makeExecutor = <Tools extends Record<string, Tool.Any>, R>(options: {
  readonly agent: Agent.Agent<Tools, R>
  readonly environment: Layer.Layer<Agent.ClosedServices<Tools, R>>
  readonly implementation: Interface
  readonly upstream: Option.Option<ToolExecutor.Interface>
}): ToolExecutor.Interface =>
  ToolExecutor.ToolExecutor.of({
    execute: (request) =>
      request.call.name === tool.name
        ? Schema.decodeUnknownEffect(Parameters, { onExcessProperty: "error" })(request.call.params).pipe(
            Effect.flatMap((parameters) =>
              options.implementation.invoke({ ...parameters, toolCallId: request.call.id }),
            ),
            Effect.mapError(() =>
              ToolExecutor.FrameworkFailure.make({
                stage: "decode-input",
                tool: tool.name,
                message: "code_mode input does not match its schema",
              }),
            ),
          )
        : Option.isSome(options.upstream)
          ? options.upstream.value.execute(request)
          : Effect.flatMap(Effect.context<ToolContext.ToolContext>(), (context) =>
              ToolExecutor.executeToolkit(options.agent.toolkit, request).pipe(
                Effect.provideContext(context),
                Effect.provide(options.environment),
              ),
            ),
  })
