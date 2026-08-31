import { describe, expect, it } from "@effect/vitest"
import { AgentManifest, ExecutableManifest as CoreExecutableManifest, Pins } from "../../../../src/index.js"
import { Effect } from "effect"
import { ExecutableRegistration } from "../../../../src/runtime/index.js"

const CODEC = "generalist/instructions/snapshot"
const VERSION = "1"

const payload = { schemaVersion: "1", scope: "thread:alpha", entries: [{ id: "a", kind: "memory" }] }
const contentFor = (value: typeof payload): AgentManifest.PinnedContent => ({
  codec: CODEC,
  version: VERSION,
  digest: Pins.digest(value),
})
const pinFor = (value: typeof payload) => Pins.makeCapability({ codec: CODEC, version: VERSION, payload: value })

const executableWith = (
  skills: ReadonlyArray<AgentManifest.NamedCapability>,
  services: ReadonlyArray<AgentManifest.NamedCapability> = [],
) => {
  const agent = AgentManifest.make({
    name: "pinned",
    model: Pins.makeModel({ fixture: "pinned" }),
    tools: [],
    skills,
    services,
    policy: { _tag: "Pinned", pin: Pins.makeCapability({ fixture: "pinned", policy: "1" }) },
    toolScheduling: { maxConcurrency: 1, parallelSafe: [] },
    budget: {},
    children: [],
  })
  return CoreExecutableManifest.make({ root: agent.pin, entries: [{ _tag: "Agent", ...agent }] })
}

const opaqueRegistrations = (executable: CoreExecutableManifest.PinnedExecutable, exclude: ReadonlySet<string>) =>
  [...ExecutableRegistration.requiredPins(executable)]
    .filter((pin) => !exclude.has(pin))
    .map((pin) => ({ pin, codec: "test", version: "1", payload: { fixture: "1" } }))

const pinnedCapability = { name: "guidance", pin: pinFor(payload), content: contentFor(payload) }
const executable = executableWith([pinnedCapability])
const others = opaqueRegistrations(executable, new Set([pinnedCapability.pin]))
const registrationFor = (overrides: Partial<ExecutableRegistration.ExecutableRegistration> = {}) => ({
  pin: pinnedCapability.pin,
  codec: CODEC,
  version: VERSION,
  payload,
  ...overrides,
})

const validate = (registrations: ReadonlyArray<ExecutableRegistration.ExecutableRegistration>) =>
  ExecutableRegistration.validate(executable, registrations)

describe("pinned content in executable registrations", () => {
  it.effect("accepts the exact registration a pinned capability declares", () =>
    Effect.gen(function* () {
      const validated = yield* validate([...others, registrationFor()])
      expect(validated.some((registration) => registration.pin === pinnedCapability.pin)).toBe(true)
    }),
  )

  it.effect("fails typed when the pinned payload drifts", () =>
    Effect.gen(function* () {
      const failure = yield* validate([
        ...others,
        registrationFor({ payload: { ...payload, entries: [{ id: "a", kind: "skill" }] } }),
      ]).pipe(Effect.flip)
      expect(failure._tag).toBe("generalist/runtime/ExecutableRegistrationInvalid")
      expect(String(failure)).toContain("payload does not match pinned content")
    }),
  )

  it.effect("fails typed when a single nested value in the pinned payload drifts", () =>
    Effect.gen(function* () {
      const failure = yield* validate([
        ...others,
        registrationFor({ payload: { ...payload, scope: "thread:beta" } }),
      ]).pipe(Effect.flip)
      expect(failure._tag).toBe("generalist/runtime/ExecutableRegistrationInvalid")
    }),
  )

  it.effect("fails typed when the pinned digest is mutated", () =>
    Effect.gen(function* () {
      const mutated = executableWith([
        { ...pinnedCapability, content: { ...pinnedCapability.content, digest: Pins.digest({ other: true }) } },
      ])
      const failure = yield* ExecutableRegistration.validate(mutated, [
        ...opaqueRegistrations(mutated, new Set([pinnedCapability.pin])),
        registrationFor(),
      ]).pipe(Effect.flip)
      expect(failure._tag).toBe("generalist/runtime/ExecutableRegistrationInvalid")
      expect(String(failure)).toContain("payload does not match pinned content")
    }),
  )

  it.effect("fails typed on a wrong codec", () =>
    Effect.gen(function* () {
      const failure = yield* validate([...others, registrationFor({ codec: "generalist/other" })]).pipe(Effect.flip)
      expect(failure._tag).toBe("generalist/runtime/ExecutableRegistrationInvalid")
      expect(String(failure)).toContain("codec does not match pinned content")
    }),
  )

  it.effect("fails typed on a wrong version", () =>
    Effect.gen(function* () {
      const failure = yield* validate([...others, registrationFor({ version: "2" })]).pipe(Effect.flip)
      expect(failure._tag).toBe("generalist/runtime/ExecutableRegistrationInvalid")
      expect(String(failure)).toContain("version does not match pinned content")
    }),
  )

  it.effect("fails typed when the registration for a declared pin is missing", () =>
    Effect.gen(function* () {
      const failure = yield* validate(others).pipe(Effect.flip)
      expect(failure).toMatchObject({
        _tag: "generalist/runtime/ExecutableRegistrationMissing",
        pin: pinnedCapability.pin,
      })
    }),
  )

  it.effect("fails typed when one capability pin declares conflicting pinned content", () =>
    Effect.gen(function* () {
      const conflicting = executableWith(
        [pinnedCapability],
        [{ name: "guidance-alias", pin: pinnedCapability.pin, content: { ...pinnedCapability.content, version: "2" } }],
      )
      const failure = yield* ExecutableRegistration.validate(conflicting, [
        ...opaqueRegistrations(conflicting, new Set([pinnedCapability.pin])),
        registrationFor(),
      ]).pipe(Effect.flip)
      expect(failure._tag).toBe("generalist/runtime/ExecutableRegistrationInvalid")
      expect(String(failure)).toContain("conflicting pinned content")
    }),
  )

  it.effect("accepts one capability pin declared twice with identical pinned content", () =>
    Effect.gen(function* () {
      const shared = executableWith(
        [pinnedCapability],
        [{ name: "guidance-alias", pin: pinnedCapability.pin, content: { ...pinnedCapability.content } }],
      )
      const validated = yield* ExecutableRegistration.validate(shared, [
        ...opaqueRegistrations(shared, new Set([pinnedCapability.pin])),
        registrationFor(),
      ])
      expect(validated.some((registration) => registration.pin === pinnedCapability.pin)).toBe(true)
    }),
  )

  it.effect("leaves capabilities without pinned content unconstrained", () =>
    Effect.gen(function* () {
      const opaque = executableWith([{ name: "guidance", pin: pinnedCapability.pin }])
      const validated = yield* ExecutableRegistration.validate(opaque, [
        ...opaqueRegistrations(opaque, new Set([pinnedCapability.pin])),
        registrationFor({ codec: "anything", version: "9", payload: { free: true } }),
      ])
      expect(validated.length).toBe(ExecutableRegistration.requiredPins(opaque).size)
    }),
  )

  it.effect("enforces pinned content on tool and service capabilities too", () =>
    Effect.gen(function* () {
      const agent = AgentManifest.make({
        name: "pinned-service",
        model: Pins.makeModel({ fixture: "pinned-service" }),
        tools: [],
        skills: [],
        services: [pinnedCapability],
        policy: { _tag: "Pinned", pin: Pins.makeCapability({ fixture: "pinned-service", policy: "1" }) },
        toolScheduling: { maxConcurrency: 1, parallelSafe: [] },
        budget: {},
        children: [],
      })
      const serviceExecutable = CoreExecutableManifest.make({
        root: agent.pin,
        entries: [{ _tag: "Agent", ...agent }],
      })
      const failure = yield* ExecutableRegistration.validate(serviceExecutable, [
        ...opaqueRegistrations(serviceExecutable, new Set([pinnedCapability.pin])),
        registrationFor({ version: "2" }),
      ]).pipe(Effect.flip)
      expect(failure._tag).toBe("generalist/runtime/ExecutableRegistrationInvalid")
    }),
  )

  it.effect("narrows to the active executable and still enforces pinned content", () =>
    Effect.gen(function* () {
      const failure = yield* ExecutableRegistration.narrow(executable, [
        ...others,
        registrationFor({ payload: { drift: true } }),
      ]).pipe(Effect.flip)
      expect(failure._tag).toBe("generalist/runtime/ExecutableRegistrationInvalid")
    }),
  )
})
