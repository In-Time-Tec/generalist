import { Context, Effect, Function, Layer, Schema, Scope } from "effect"
import type { Program } from "../../core/program/agent-program.js"
import { type AgentManifest, fromLiveAgent } from "../../core/durable/manifest/agent-manifest.js"
import type { Service as CodeExecutorService } from "../../core/program/code-executor.js"
import type { AgentPin, CapabilityPin } from "../../core/durable/pin.js"
import {
  type AnyAgent,
  type AnyStep,
  type AnyTool,
  type Handlers,
  make as makeHandlers,
} from "../../core/program/handlers.js"
import { type PinnedProgram, make as makeProgramManifest } from "../../core/durable/manifest/program-manifest.js"
import { validateHandlers } from "../../core/program/runner.js"
import type { Closed } from "../../core/agent/service.js"
import { decodePinned } from "./manifest-internal.js"
import { ExecutableManifest, ExecutableRef, PinnedExecutable } from "./manifest.js"
import { ExecutablePinMissing, ExecutableRegistrationInvalid, ExecutableRegistrationMissing } from "../errors.js"
import { RunId } from "../run.js"
import {
  ExecutableRegistration,
  requiredPinsForActiveExecutable,
  validate as validateRegistrations,
} from "./registration.js"

/** @experimental Exact persisted identity supplied to executable reconstruction. */
export interface Input {
  readonly runId: string
  readonly ref: ExecutableRef
  readonly manifest: ExecutableManifest
  readonly registrations: ReadonlyArray<ExecutableRegistration>
}

export const Input: Schema.Codec<Input, unknown, never, never> = Schema.Struct({
  runId: RunId,
  ref: ExecutableRef,
  manifest: ExecutableManifest,
  registrations: Schema.Array(ExecutableRegistration),
})

/** @experimental Verify resolver input against its paired authority. */
export const verifyInput = (input: Input): Input => {
  const executable = decodePinned({ ref: input.ref, manifest: input.manifest })
  return {
    runId: input.runId,
    ref: executable.ref,
    manifest: executable.manifest,
    registrations: input.registrations,
  }
}

/** @experimental Resolver-owned proof of the reconstructed executable identity. */
export interface Attestation {
  readonly ref: ExecutableRef
  readonly manifest: ExecutableManifest
}

export const Attestation: Schema.Codec<Attestation, unknown, never, never> = Schema.Struct({
  ref: ExecutableRef,
  manifest: ExecutableManifest,
})

/** @experimental Verify resolver attestation against pinned identity. */
export const verifyAttestation = (attestation: Attestation): Attestation => decodePinned(attestation)

/** @experimental Live executable resources owned by the caller's scope. */
export interface AgentResolution {
  readonly _tag: "Agent"
  readonly agent: Closed
  readonly runOptions?: StaticRunOptions
  readonly attestation: Attestation
}

/** @experimental Resolver-owned static options attested by the persisted Agent manifest. */
export interface StaticRunOptions {
  readonly compaction?: {
    readonly contextWindow: number
    readonly reserveTokens: number
  }
}

const matchesRunOptions = (manifest: AgentManifest, options: StaticRunOptions | undefined): boolean => {
  const expected = manifest.compaction
  const actual = options?.compaction
  return (
    (expected === undefined && actual === undefined) ||
    (expected !== undefined &&
      actual !== undefined &&
      expected.contextWindow === actual.contextWindow &&
      expected.reserveTokens === actual.reserveTokens)
  )
}

/** @experimental Verify resolver-owned static options against the persisted active Agent. */
export const matchesActiveRunOptions: {
  (manifest: ExecutableManifest, options: StaticRunOptions | undefined): (ref: ExecutableRef) => boolean
  (ref: ExecutableRef, manifest: ExecutableManifest, options: StaticRunOptions | undefined): boolean
} = Function.dual(
  3,
  (ref: ExecutableRef, manifest: ExecutableManifest, options: StaticRunOptions | undefined): boolean => {
    const active = manifest.entries.find((entry) => entry._tag === "Agent" && entry.pin === ref.active)
    return active?._tag === "Agent" && matchesRunOptions(active.manifest, options)
  },
)

/** @experimental Live Agent Program resources owned by the caller's scope. */
export interface ProgramResolution {
  readonly _tag: "Program"
  readonly program: Program<unknown, unknown, unknown, unknown>
  readonly executor: CodeExecutorService
  readonly handlers: Handlers
  readonly services?: Layer.Layer<never>
  readonly attestation: Attestation
}

/** @experimental Exactly one reconstructed executable kind. */
export type Resolution = AgentResolution | ProgramResolution

/** @experimental */
export interface Service {
  readonly resolve: (
    input: Input,
  ) => Effect.Effect<
    Resolution,
    ExecutablePinMissing | ExecutableRegistrationInvalid | ExecutableRegistrationMissing,
    Scope.Scope
  >
}

/** @experimental */
export class ExecutableResolver extends Context.Service<ExecutableResolver, Service>()(
  "tenetkit/runtime/executable/resolver/ExecutableResolver",
) {}

/** @experimental One exact static Agent executable bound to its persisted Agent pin. */
export interface StaticAgentExecutable {
  readonly _tag?: "Agent"
  readonly executable: PinnedExecutable
  readonly agent: Closed
  readonly runOptions?: StaticRunOptions
}

/** @experimental One exact static Program executable bound to its persisted Program pin. */
export interface StaticProgramExecutable {
  readonly _tag: "Program"
  readonly executable: PinnedExecutable
  readonly program: Program<unknown, unknown, unknown, unknown>
  readonly executor: CodeExecutorService
  readonly handlers: Handlers
  readonly services?: Layer.Layer<never>
}

/** @experimental One exact static executable used by tests and process-local hosts. */
export type StaticExecutable = StaticAgentExecutable | StaticProgramExecutable

const invalidRegistration = (message: string): ExecutableRegistrationInvalid =>
  ExecutableRegistrationInvalid.make({ message })

const tryRegistration = <A>(evaluate: () => A, fallback: string): Effect.Effect<A, ExecutableRegistrationInvalid> =>
  Effect.try({
    try: evaluate,
    catch: (error) => invalidRegistration(error instanceof Error ? error.message : fallback),
  })

const registerStatic = (
  executables: ReadonlyArray<StaticExecutable>,
): Effect.Effect<ReadonlyMap<string, StaticExecutable>, ExecutableRegistrationInvalid> =>
  Effect.gen(function* () {
    const entries = new Map<string, StaticExecutable>()
    for (const entry of executables) {
      const executable = yield* tryRegistration(
        () => decodePinned(entry.executable),
        "Static executable identity is invalid",
      )
      if (entries.has(executable.ref.active)) {
        return yield* invalidRegistration(`Duplicate static executable reference: ${executable.ref.active}`)
      }
      const active = executable.manifest.entries.find((candidate) => candidate.pin === executable.ref.active)
      if (active === undefined) {
        return yield* invalidRegistration(`Active executable is missing: ${executable.ref.active}`)
      }
      if (entry._tag === "Program") {
        const attested = yield* tryRegistration(
          () => makeProgramManifest(entry.program.pinned.manifest),
          `Live Program is invalid: ${executable.ref.active}`,
        )
        if (active._tag !== "Program" || entry.program.pinned.pin !== attested.pin || attested.pin !== active.pin) {
          return yield* invalidRegistration(
            `Live Program does not match static executable reference: ${executable.ref.active}`,
          )
        }
        yield* validateHandlers(entry.program.pinned, entry.handlers).pipe(
          Effect.mapError((error) =>
            invalidRegistration(
              `Program ${error.kind} handler ${error.name} ${error.reason}: ${executable.ref.active}`,
            ),
          ),
        )
      } else {
        if (active._tag !== "Agent") {
          return yield* invalidRegistration(
            `Static Agent does not match active executable kind: ${executable.ref.active}`,
          )
        }
        const attested = yield* tryRegistration(
          () =>
            entry.agent.open((agent) =>
              fromLiveAgent(agent, {
                model: active.manifest.model,
                tools: active.manifest.tools,
                skills: active.manifest.skills,
                services: active.manifest.services,
                policy: active.manifest.policy,
                budget: active.manifest.budget,
                children: active.manifest.children,
                ...Object.assign(
                  {},
                  active.manifest.programAuthority === undefined
                    ? undefined
                    : { programAuthority: active.manifest.programAuthority },
                ),
                ...Object.assign(
                  {},
                  active.manifest.compaction === undefined ? undefined : { compaction: active.manifest.compaction },
                ),
              }),
            ),
          `Live Agent is invalid: ${executable.ref.active}`,
        )
        if (attested.pin !== active.pin) {
          return yield* invalidRegistration(
            `Live Agent does not match static executable reference: ${executable.ref.active}`,
          )
        }
        if (!matchesRunOptions(active.manifest, entry.runOptions)) {
          return yield* invalidRegistration(
            `Static compaction options do not match Agent manifest: ${executable.ref.active}`,
          )
        }
      }
      entries.set(executable.ref.active, { ...entry, executable })
    }
    return entries
  })

const staticResolution = (entry: StaticExecutable, attestation: Attestation): Resolution => {
  if (entry._tag === "Program") {
    return {
      _tag: "Program",
      program: entry.program,
      executor: entry.executor,
      handlers: entry.handlers,
      attestation,
      ...Object.assign({}, entry.services === undefined ? undefined : { services: entry.services }),
    }
  }
  return {
    _tag: "Agent",
    agent: entry.agent,
    attestation,
    ...Object.assign({}, entry.runOptions === undefined ? undefined : { runOptions: entry.runOptions }),
  }
}

const verifiedInput = (input: Input): Effect.Effect<PinnedExecutable, ExecutablePinMissing> =>
  Effect.try({
    try: () => decodePinned({ ref: input.ref, manifest: input.manifest }),
    catch: () => ExecutablePinMissing.make({ runId: input.runId, ref: input.ref }),
  })

const resolveStatic = (
  entries: ReadonlyMap<string, StaticExecutable>,
  input: Input,
  pinned: PinnedExecutable,
): Effect.Effect<Resolution, ExecutablePinMissing> => {
  const entry = entries.get(pinned.ref.active)
  return entry === undefined
    ? Effect.fail(ExecutablePinMissing.make({ runId: input.runId, ref: input.ref }))
    : Effect.succeed(staticResolution(entry, verifyAttestation(pinned)))
}

/** @experimental Construct an exact static resolver without resolving at admission or startup. */
export const makeStatic = (
  executables: ReadonlyArray<StaticExecutable>,
): Effect.Effect<Service, ExecutableRegistrationInvalid> =>
  registerStatic(executables).pipe(
    Effect.map((entries) =>
      ExecutableResolver.of({
        resolve: (input) => Effect.flatMap(verifiedInput(input), (pinned) => resolveStatic(entries, input, pinned)),
      }),
    ),
  )

/** @experimental Exact static resolver Layer helper. */
export const layerStatic = (
  executables: ReadonlyArray<StaticExecutable>,
): Layer.Layer<ExecutableResolver, ExecutableRegistrationInvalid> =>
  Layer.effect(ExecutableResolver, makeStatic(executables))

/** @experimental Typed failures allowed while reconstructing an admitted executable. */
export type ReconstructionError = ExecutablePinMissing | ExecutableRegistrationInvalid | ExecutableRegistrationMissing

/** @experimental Exact persisted authority for one reconstructed Program capability pin. */
export interface CapabilityRequest {
  readonly runId: string
  readonly ref: ExecutableRef
  readonly manifest: ExecutableManifest
  readonly program: PinnedProgram
  readonly pin: CapabilityPin
  readonly registration: ExecutableRegistration
}

/** @experimental Exact persisted authority for one reconstructed Program boundary codec. */
export interface CodecRequest extends CapabilityRequest {
  readonly boundary: "input" | "output"
}

/** @experimental Exact persisted authority for one reconstructed Program tool or step handler. */
export interface NamedCapabilityRequest extends CapabilityRequest {
  readonly name: string
}

/** @experimental Exact persisted authority for one reconstructed Program Agent handler. */
export interface AgentCapabilityRequest extends CapabilityRequest {
  readonly selection: string
  readonly agent: AgentPin
  readonly agentManifest: AgentManifest
}

/** @experimental Exact persisted authority for the Run-scoped services of one reconstructed Program. */
export interface ServicesRequest {
  readonly runId: string
  readonly ref: ExecutableRef
  readonly manifest: ExecutableManifest
  readonly program: PinnedProgram
  readonly registrations: ReadonlyArray<ExecutableRegistration>
}

/**
 * @experimental Application-owned reconstruction of one admitted Agent Program from its exact persisted
 * registrations. Every member owns its codec, version, and credential dereference, and may acquire scoped
 * resources finalized with the resolver scope.
 */
export interface ProgramReconstruction {
  readonly executor: (
    request: CapabilityRequest,
  ) => Effect.Effect<CodeExecutorService, ReconstructionError, Scope.Scope>
  readonly codec: (
    request: CodecRequest,
  ) => Effect.Effect<Schema.Codec<unknown, unknown>, ReconstructionError, Scope.Scope>
  readonly tool: (request: NamedCapabilityRequest) => Effect.Effect<AnyTool, ReconstructionError, Scope.Scope>
  readonly step: (request: NamedCapabilityRequest) => Effect.Effect<AnyStep, ReconstructionError, Scope.Scope>
  readonly agent: (request: AgentCapabilityRequest) => Effect.Effect<AnyAgent, ReconstructionError, Scope.Scope>
  readonly services?: (request: ServicesRequest) => Effect.Effect<Layer.Layer<never>, ReconstructionError, Scope.Scope>
}

const resolveProgram = (
  reconstruction: ProgramReconstruction,
  input: Input,
  pinned: PinnedExecutable,
  entry: Extract<ExecutableManifest["entries"][number], { readonly _tag: "Program" }>,
): Effect.Effect<ProgramResolution, ReconstructionError, Scope.Scope> =>
  Effect.gen(function* () {
    const registrations = yield* validateRegistrations(
      pinned,
      input.registrations,
      requiredPinsForActiveExecutable(pinned),
    )
    const byPin = new Map(registrations.map((registration) => [registration.pin, registration] as const))
    const program: PinnedProgram = { pin: entry.pin, manifest: entry.manifest }
    const authority = { runId: input.runId, ref: pinned.ref, manifest: pinned.manifest, program }
    const required = (pin: CapabilityPin): Effect.Effect<CapabilityRequest, ExecutableRegistrationMissing> => {
      const registration = byPin.get(pin)
      return registration === undefined
        ? Effect.fail(ExecutableRegistrationMissing.make({ pin }))
        : Effect.succeed({ ...authority, pin, registration })
    }
    const executor = yield* Effect.flatMap(required(entry.manifest.sandbox), reconstruction.executor)
    const inputCodec = yield* Effect.flatMap(required(entry.manifest.input), (request) =>
      reconstruction.codec({ ...request, boundary: "input" }),
    )
    const outputCodec = yield* Effect.flatMap(required(entry.manifest.output), (request) =>
      reconstruction.codec({ ...request, boundary: "output" }),
    )
    const tools = yield* Effect.forEach(entry.manifest.capabilities.tools, (capability) =>
      Effect.flatMap(required(capability.pin), (request) => reconstruction.tool({ ...request, name: capability.name })),
    )
    const steps = yield* Effect.forEach(entry.manifest.capabilities.steps, (capability) =>
      Effect.flatMap(required(capability.pin), (request) => reconstruction.step({ ...request, name: capability.name })),
    )
    const agents = yield* Effect.forEach(entry.manifest.capabilities.agents, (capability) =>
      Effect.gen(function* () {
        const bound = pinned.manifest.entries.find((candidate) => candidate.pin === capability.agent)
        if (bound?._tag !== "Agent") {
          return yield* ExecutablePinMissing.make({
            runId: input.runId,
            ref: { executable: pinned.ref.executable, active: capability.agent },
          })
        }
        const request = yield* required(capability.input)
        return yield* reconstruction.agent({
          ...request,
          selection: capability.selection,
          agent: capability.agent,
          agentManifest: bound.manifest,
        })
      }),
    )
    const handlers = yield* Effect.try({
      try: () =>
        makeHandlers({
          tools,
          steps,
          agents,
        }),
      catch: (error) => ExecutableRegistrationInvalid.make({ message: String(error) }),
    })
    yield* validateHandlers(program, handlers).pipe(
      Effect.mapError((mismatch) =>
        ExecutableRegistrationInvalid.make({
          message: `reconstructed ${mismatch.kind} handler ${mismatch.name} ${mismatch.reason}: ${entry.pin}`,
        }),
      ),
    )
    const services =
      reconstruction.services === undefined
        ? undefined
        : yield* reconstruction.services({ ...authority, registrations })
    return {
      _tag: "Program" as const,
      program: { pinned: program, input: inputCodec, output: outputCodec },
      executor,
      handlers,
      attestation: verifyAttestation(pinned),
      ...Object.assign({}, services === undefined ? undefined : { services }),
    }
  })

/**
 * @experimental Construct the canonical resolver: static Agents keyed by their exact persisted Agent pin, and
 * every admitted Agent Program reconstructed from its exact manifest and persisted registrations.
 */
export const makeDynamic = (options: {
  readonly agents: ReadonlyArray<StaticAgentExecutable>
  readonly program: ProgramReconstruction
}): Effect.Effect<Service, ExecutableRegistrationInvalid> =>
  registerStatic(options.agents).pipe(
    Effect.map((entries) =>
      ExecutableResolver.of({
        resolve: (input) =>
          Effect.gen(function* () {
            const pinned = yield* verifiedInput(input)
            const active = pinned.manifest.entries.find((candidate) => candidate.pin === pinned.ref.active)
            if (active === undefined) return yield* ExecutablePinMissing.make({ runId: input.runId, ref: input.ref })
            return active._tag === "Program"
              ? yield* resolveProgram(options.program, input, pinned, active)
              : yield* resolveStatic(entries, input, pinned)
          }),
      }),
    ),
  )

/** @experimental Canonical resolver Layer helper. */
export const layerDynamic = (options: {
  readonly agents: ReadonlyArray<StaticAgentExecutable>
  readonly program: ProgramReconstruction
}): Layer.Layer<ExecutableResolver, ExecutableRegistrationInvalid> =>
  Layer.effect(ExecutableResolver, makeDynamic(options))
