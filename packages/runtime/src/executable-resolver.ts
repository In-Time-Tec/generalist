import { Context, Effect, Layer, Schema, Scope } from "effect"
import { AgentManifest, type Agent } from "@batonfx/core"
import { decodePinned, ExecutableManifest, ExecutableRef, PinnedExecutable } from "./executable-manifest.js"
import { ExecutablePinMissing } from "./errors.js"
import { RunId } from "./run.js"

/** @experimental Exact persisted identity supplied to executable reconstruction. */
export interface Input {
  readonly runId: string
  readonly ref: ExecutableRef
  readonly manifest: ExecutableManifest
}

export const Input: Schema.Codec<Input, unknown, never, never> = Schema.Struct({
  runId: RunId,
  ref: ExecutableRef,
  manifest: ExecutableManifest,
})

/** @experimental Construct a resolver input only after verifying its paired authority. */
export const makeInput = (input: Input): Input => ({ runId: input.runId, ...decodePinned(input) })

/** @experimental Resolver-owned proof of the reconstructed executable identity. */
export interface Attestation {
  readonly ref: ExecutableRef
  readonly manifest: ExecutableManifest
}

export const Attestation: Schema.Codec<Attestation, unknown, never, never> = Schema.Struct({
  ref: ExecutableRef,
  manifest: ExecutableManifest,
})

/** @experimental Construct resolver attestation only after verifying its paired authority. */
export const makeAttestation = (attestation: Attestation): Attestation => decodePinned(attestation)

/** @experimental Live executable resources owned by the caller's scope. */
export interface Resolution {
  readonly agent: Agent.Agent<any, any, any, any>
  readonly services?: Layer.Layer<any>
  readonly attestation: Attestation
}

/** @experimental */
export interface Interface {
  readonly resolve: (input: Input) => Effect.Effect<Resolution, ExecutablePinMissing, Scope.Scope>
}

/** @experimental */
export class ExecutableResolver extends Context.Service<ExecutableResolver, Interface>()(
  "@batonfx/runtime/ExecutableResolver",
) {}

/** @experimental One exact static executable used by tests and process-local hosts. */
export interface StaticExecutable {
  readonly executable: PinnedExecutable
  readonly agent: Agent.Agent<any, any, any, any>
  readonly services?: Layer.Layer<any>
}

const key = (ref: ExecutableRef): string => `${ref.executable}\0${ref.active}`

/** @experimental Construct an exact static resolver without resolving at admission or startup. */
export const makeStatic = (executables: ReadonlyArray<StaticExecutable>): Interface => {
  const entries = new Map<string, StaticExecutable>()
  for (const entry of executables) {
    const executable = decodePinned(entry.executable)
    const entryKey = key(executable.ref)
    if (entries.has(entryKey)) throw new TypeError(`Duplicate static executable reference: ${executable.ref.active}`)
    const active = executable.manifest.agents.find(({ pin }) => pin === executable.ref.active)!
    const attested = AgentManifest.fromLiveAgent(entry.agent, {
      model: active.manifest.model,
      tools: active.manifest.tools,
      skills: active.manifest.skills,
      services: active.manifest.services,
      policy: active.manifest.policy,
      budget: active.manifest.budget,
      children: active.manifest.children,
    })
    if (attested.pin !== active.pin) {
      throw new TypeError(`Live Agent does not match static executable reference: ${executable.ref.active}`)
    }
    entries.set(entryKey, { ...entry, executable })
  }
  return ExecutableResolver.of({
    resolve: (input) =>
      Effect.gen(function* () {
        const entry = entries.get(key(input.ref))
        if (entry === undefined) return yield* ExecutablePinMissing.make({ runId: input.runId, ref: input.ref })
        return {
          agent: entry.agent,
          ...(entry.services === undefined ? {} : { services: entry.services }),
          attestation: makeAttestation(entry.executable),
        }
      }),
  })
}

/** @experimental Exact static resolver Layer helper. */
export const layerTest = (executables: ReadonlyArray<StaticExecutable>) =>
  Layer.succeed(ExecutableResolver, makeStatic(executables))
