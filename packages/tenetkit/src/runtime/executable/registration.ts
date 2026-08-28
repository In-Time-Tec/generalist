import { AgentManifest, Pins } from "../../core/index.js"
import { Effect, Function, Schema } from "effect"
import { PinnedExecutable } from "./manifest.js"
import { ExecutableRegistrationInvalid, ExecutableRegistrationMissing } from "../errors.js"

const MAX_REGISTRATIONS = 128
const MAX_TEXT_LENGTH = 255
const MAX_PAYLOAD_BYTES = 65_536

/** @experimental Bounded secret-free policy used to reconstruct a pinned compaction service. */
export const CompactionPolicy = Schema.Struct({
  keepRecentTokens: Schema.Int.check(Schema.isGreaterThanOrEqualTo(0)),
  strategyIdentity: Schema.String.check(Schema.isNonEmpty(), Schema.isMaxLength(MAX_TEXT_LENGTH)),
  summaryPromptIdentity: Schema.String.check(Schema.isNonEmpty(), Schema.isMaxLength(MAX_TEXT_LENGTH)),
})
/** @experimental */
export type CompactionPolicy = typeof CompactionPolicy.Type

/** @experimental Secret-free application data used to reconstruct one opaque model or capability pin. */
export const ExecutableRegistration = Schema.Struct({
  pin: Schema.String.check(Schema.isNonEmpty(), Schema.isMaxLength(MAX_TEXT_LENGTH)),
  codec: Schema.String.check(Schema.isNonEmpty(), Schema.isMaxLength(MAX_TEXT_LENGTH)),
  version: Schema.String.check(Schema.isNonEmpty(), Schema.isMaxLength(MAX_TEXT_LENGTH)),
  payload: Schema.Unknown,
})
/** @experimental */
export type ExecutableRegistration = typeof ExecutableRegistration.Type

export const requiredPins = (executable: PinnedExecutable): ReadonlySet<string> => {
  const pins = new Set<string>()
  for (const entry of executable.manifest.entries) {
    if (entry._tag === "Agent") {
      pins.add(entry.manifest.model)
      for (const capability of entry.manifest.tools) pins.add(capability.pin)
      for (const capability of entry.manifest.skills) pins.add(capability.pin)
      for (const capability of entry.manifest.services) pins.add(capability.pin)
      if (entry.manifest.policy._tag === "Pinned") pins.add(entry.manifest.policy.pin)
      if (entry.manifest.compaction !== undefined) {
        pins.add(entry.manifest.compaction.service)
        pins.add(entry.manifest.compaction.summaryModel)
      }
      if (entry.manifest.programAuthority !== undefined) {
        pins.add(entry.manifest.programAuthority.sandbox)
        pins.add(entry.manifest.programAuthority.input)
        pins.add(entry.manifest.programAuthority.output)
        for (const capability of entry.manifest.programAuthority.tools) pins.add(capability.pin)
        for (const capability of entry.manifest.programAuthority.steps) pins.add(capability.pin)
        for (const capability of entry.manifest.programAuthority.agents) pins.add(capability.input)
      }
    } else {
      pins.add(entry.manifest.sandbox)
      pins.add(entry.manifest.input)
      pins.add(entry.manifest.output)
      for (const capability of entry.manifest.capabilities.tools) pins.add(capability.pin)
      for (const capability of entry.manifest.capabilities.steps) pins.add(capability.pin)
      for (const capability of entry.manifest.capabilities.agents) pins.add(capability.input)
    }
  }
  return pins
}

type ManifestEntry = PinnedExecutable["manifest"]["entries"][number]
type ActiveExecutable = PinnedExecutable["ref"]["active"]

const agentPins = (
  entry: Extract<ManifestEntry, { readonly _tag: "Agent" }>,
  pins: Set<string>,
  profiles: ReadonlyMap<string, ActiveExecutable>,
): ReadonlyArray<ActiveExecutable> => {
  pins.add(entry.manifest.model)
  for (const capability of entry.manifest.tools) pins.add(capability.pin)
  for (const capability of entry.manifest.skills) pins.add(capability.pin)
  for (const capability of entry.manifest.services) pins.add(capability.pin)
  if (entry.manifest.policy._tag === "Pinned") pins.add(entry.manifest.policy.pin)
  if (entry.manifest.compaction !== undefined) {
    pins.add(entry.manifest.compaction.service)
    pins.add(entry.manifest.compaction.summaryModel)
  }
  if (entry.manifest.programAuthority !== undefined) {
    pins.add(entry.manifest.programAuthority.sandbox)
    pins.add(entry.manifest.programAuthority.input)
    pins.add(entry.manifest.programAuthority.output)
    for (const capability of entry.manifest.programAuthority.tools) pins.add(capability.pin)
    for (const capability of entry.manifest.programAuthority.steps) pins.add(capability.pin)
    for (const capability of entry.manifest.programAuthority.agents) pins.add(capability.input)
  }
  const profileChildren = entry.manifest.children.flatMap((child) => {
    const agent = profiles.get(child.selection)
    return agent === undefined ? [] : [agent]
  })
  return [...profileChildren, ...(entry.manifest.programAuthority?.agents ?? []).map((child) => child.agent)].toSorted()
}

const programPins = (
  entry: Extract<ManifestEntry, { readonly _tag: "Program" }>,
  pins: Set<string>,
): ReadonlyArray<ActiveExecutable> => {
  pins.add(entry.manifest.sandbox)
  pins.add(entry.manifest.input)
  pins.add(entry.manifest.output)
  for (const capability of entry.manifest.capabilities.tools) pins.add(capability.pin)
  for (const capability of entry.manifest.capabilities.steps) pins.add(capability.pin)
  return entry.manifest.capabilities.agents
    .map((child) => {
      pins.add(child.input)
      return child.agent
    })
    .toSorted()
}

/** @experimental Exact pins one active executable requires, independent of the rest of its closure. */
export const requiredPinsForActiveExecutable = (executable: PinnedExecutable): ReadonlySet<string> => {
  const byPin = new Map(executable.manifest.entries.map((entry) => [entry.pin, entry] as const))
  const profiles = new Map(executable.manifest.profiles.map((profile) => [profile.selection, profile.agent] as const))
  const pins = new Set<string>()
  const visited = new Set<string>()
  const visit = (pin: PinnedExecutable["ref"]["active"]): void => {
    if (visited.has(pin)) return
    visited.add(pin)
    const entry = byPin.get(pin)
    if (entry === undefined) return
    if (entry._tag === "Agent") {
      for (const child of agentPins(entry, pins, profiles)) visit(child)
      return
    }
    for (const child of programPins(entry, pins)) visit(child)
  }
  visit(executable.ref.active)
  return pins
}

const namedCapabilities = (executable: PinnedExecutable): ReadonlyArray<AgentManifest.NamedCapability> => {
  const capabilities: Array<AgentManifest.NamedCapability> = []
  for (const entry of executable.manifest.entries) {
    if (entry._tag === "Agent") {
      capabilities.push(...entry.manifest.tools, ...entry.manifest.skills, ...entry.manifest.services)
      if (entry.manifest.programAuthority !== undefined) {
        capabilities.push(...entry.manifest.programAuthority.tools, ...entry.manifest.programAuthority.steps)
      }
      continue
    }
    capabilities.push(...entry.manifest.capabilities.tools, ...entry.manifest.capabilities.steps)
  }
  return capabilities
}

const pinnedContents = (executable: PinnedExecutable): ReadonlyMap<string, AgentManifest.PinnedContent> => {
  const contents = new Map<string, AgentManifest.PinnedContent>()
  for (const capability of namedCapabilities(executable)) {
    if (capability.content === undefined) continue
    const current = contents.get(capability.pin)
    if (current !== undefined && Pins.digest(current) !== Pins.digest(capability.content)) {
      throw new TypeError(`capability pin has conflicting pinned content: ${capability.pin}`)
    }
    contents.set(capability.pin, capability.content)
  }
  return contents
}

const compactionPolicies = (executable: PinnedExecutable): ReadonlyMap<string, CompactionPolicy> => {
  const policies = new Map<string, CompactionPolicy>()
  for (const entry of executable.manifest.entries) {
    if (entry._tag !== "Agent" || entry.manifest.compaction === undefined) continue
    const { service, keepRecentTokens, strategyIdentity, summaryPromptIdentity } = entry.manifest.compaction
    const policy = { keepRecentTokens, strategyIdentity, summaryPromptIdentity }
    const current = policies.get(service)
    if (current !== undefined && Pins.digest(current) !== Pins.digest(policy)) {
      throw new TypeError(`compaction service has conflicting identities: ${service}`)
    }
    policies.set(service, policy)
  }
  return policies
}

const encoded = (registration: ExecutableRegistration): string =>
  JSON.stringify({
    pin: registration.pin,
    codec: registration.codec,
    version: registration.version,
    payload: registration.payload,
  })

/** @experimental Validate and canonicalize the complete registration set for one exact executable. */
export const validate: {
  (
    registrations: ReadonlyArray<ExecutableRegistration>,
    required?: ReadonlySet<string>,
  ): (
    executable: PinnedExecutable,
  ) => Effect.Effect<
    ReadonlyArray<ExecutableRegistration>,
    ExecutableRegistrationInvalid | ExecutableRegistrationMissing
  >
  (
    executable: PinnedExecutable,
    registrations: ReadonlyArray<ExecutableRegistration>,
    required?: ReadonlySet<string>,
  ): Effect.Effect<ReadonlyArray<ExecutableRegistration>, ExecutableRegistrationInvalid | ExecutableRegistrationMissing>
} = Function.dual(
  (args) => Schema.is(PinnedExecutable)(args[0]),
  (
    executable: PinnedExecutable,
    registrations: ReadonlyArray<ExecutableRegistration>,
    required: ReadonlySet<string> = requiredPins(executable),
  ) =>
    Effect.gen(function* () {
      if (registrations.length > MAX_REGISTRATIONS) {
        return yield* ExecutableRegistrationInvalid.make({ message: `registration count exceeds ${MAX_REGISTRATIONS}` })
      }
      const policies = yield* Effect.try({
        try: () => compactionPolicies(executable),
        catch: (error) => ExecutableRegistrationInvalid.make({ message: String(error) }),
      })
      const contents = yield* Effect.try({
        try: () => pinnedContents(executable),
        catch: (error) => ExecutableRegistrationInvalid.make({ message: String(error) }),
      })
      const byPin = new Map<string, ExecutableRegistration>()
      for (const input of registrations) {
        const registration = yield* Schema.decodeEffect(ExecutableRegistration, {
          onExcessProperty: "error",
        })(input).pipe(Effect.mapError((error) => ExecutableRegistrationInvalid.make({ message: String(error) })))
        const expectedContent = contents.get(registration.pin)
        if (expectedContent !== undefined) {
          if (registration.codec !== expectedContent.codec) {
            return yield* ExecutableRegistrationInvalid.make({
              message: `registration codec does not match pinned content: ${registration.pin}`,
            })
          }
          if (registration.version !== expectedContent.version) {
            return yield* ExecutableRegistrationInvalid.make({
              message: `registration version does not match pinned content: ${registration.pin}`,
            })
          }
          const payloadDigest = yield* Effect.try({
            try: () => Pins.digest(registration.payload),
            catch: (error) => ExecutableRegistrationInvalid.make({ message: String(error) }),
          })
          if (payloadDigest !== expectedContent.digest) {
            return yield* ExecutableRegistrationInvalid.make({
              message: `registration payload does not match pinned content: ${registration.pin}`,
            })
          }
        }
        const expectedPolicy = policies.get(registration.pin)
        if (expectedPolicy !== undefined) {
          const policy = yield* Schema.decodeUnknownEffect(CompactionPolicy, { onExcessProperty: "error" })(
            registration.payload,
          ).pipe(Effect.mapError((error) => ExecutableRegistrationInvalid.make({ message: String(error) })))
          if (Pins.digest(policy) !== Pins.digest(expectedPolicy)) {
            return yield* ExecutableRegistrationInvalid.make({
              message: `compaction registration does not match executable identity: ${registration.pin}`,
            })
          }
        }
        if (!required.has(registration.pin)) {
          return yield* ExecutableRegistrationInvalid.make({
            message: `registration pin is not required by executable: ${registration.pin}`,
          })
        }
        if (byPin.has(registration.pin)) {
          return yield* ExecutableRegistrationInvalid.make({
            message: `duplicate registration pin: ${registration.pin}`,
          })
        }
        const json = yield* Effect.try({
          try: () => encoded(registration),
          catch: (error) => ExecutableRegistrationInvalid.make({ message: String(error) }),
        })
        if (new TextEncoder().encode(json).byteLength > MAX_PAYLOAD_BYTES) {
          return yield* ExecutableRegistrationInvalid.make({
            message: `registration payload exceeds ${MAX_PAYLOAD_BYTES} bytes: ${registration.pin}`,
          })
        }
        yield* Effect.try({
          try: () => Pins.digest(registration.payload),
          catch: (error) => ExecutableRegistrationInvalid.make({ message: String(error) }),
        })
        byPin.set(registration.pin, registration)
      }
      for (const pin of required) {
        if (!byPin.has(pin)) return yield* ExecutableRegistrationMissing.make({ pin })
      }
      return [...byPin.values()].toSorted((left, right) => {
        if (left.pin < right.pin) return -1
        if (left.pin > right.pin) return 1
        return 0
      })
    }),
)

/** @experimental Stable persisted identity of one registration. */
export const digest = (registration: ExecutableRegistration): string => Pins.digest(registration)

export const encodeJson = encoded

/** @experimental Select and validate the exact registrations required by a narrowed executable. */
export const narrow: {
  (
    registrations: ReadonlyArray<ExecutableRegistration>,
  ): (
    executable: PinnedExecutable,
  ) => Effect.Effect<
    ReadonlyArray<ExecutableRegistration>,
    ExecutableRegistrationInvalid | ExecutableRegistrationMissing
  >
  (
    executable: PinnedExecutable,
    registrations: ReadonlyArray<ExecutableRegistration>,
  ): Effect.Effect<ReadonlyArray<ExecutableRegistration>, ExecutableRegistrationInvalid | ExecutableRegistrationMissing>
} = Function.dual(
  2,
  (
    executable: PinnedExecutable,
    registrations: ReadonlyArray<ExecutableRegistration>,
  ): Effect.Effect<
    ReadonlyArray<ExecutableRegistration>,
    ExecutableRegistrationInvalid | ExecutableRegistrationMissing
  > => {
    const required = requiredPinsForActiveExecutable(executable)
    return validate(
      executable,
      registrations.filter((registration) => required.has(registration.pin)),
      required,
    )
  },
)
