import { describe, expect, it } from "@effect/vitest"
import { AgentManifest, ExecutableManifest, Pins } from "../packages/tenetkit/src/index.js"
import { Entry, Registration, Snapshot, State } from "../packages/tenetkit/src/agent-guidance/index.js"
import { ExecutableRegistration } from "../packages/tenetkit/src/runtime/index.js"
import { Effect } from "effect"

const scope = "thread:alpha"
const at = "2024-01-01T00:00:00.000Z"

const entry = (id: string, kind: Entry.GuidanceKind): Entry.GuidanceEntry => ({
  id,
  kind,
  scope,
  title: `title ${id}`,
  content: `content ${id}`,
  createdAt: at,
  updatedAt: at,
  version: 1,
})

const state = State.make({ scope, entries: [entry("a", "memory"), entry("b", "skill")] })
const pinned = Registration.make(state, "guidance")

const executableFor = (capability: AgentManifest.NamedCapability) => {
  const agent = AgentManifest.make({
    name: "conversational",
    model: Pins.makeModel({ fixture: "conversational" }),
    tools: [],
    skills: [capability],
    services: [],
    policy: { _tag: "Pinned", pin: Pins.makeCapability({ fixture: "conversational", policy: "1" }) },
    toolScheduling: { maxConcurrency: 1, parallelSafe: [] },
    budget: {},
    children: [],
  })
  return ExecutableManifest.make({ root: agent.pin, entries: [{ _tag: "Agent", ...agent }] })
}

const executable = executableFor(pinned.capability)

const registrationsFor = (
  target: ExecutableManifest.PinnedExecutable,
  guidance: ExecutableRegistration.ExecutableRegistration,
) => [
  ...[...ExecutableRegistration.requiredPins(target)]
    .filter((pin) => pin !== guidance.pin)
    .map((pin) => ({ pin, codec: "test", version: "1", payload: { fixture: "1" } })),
  guidance,
]

const guidanceRegistration = (overrides: Partial<ExecutableRegistration.ExecutableRegistration> = {}) => ({
  pin: pinned.capability.pin,
  codec: Snapshot.codec,
  version: Snapshot.version,
  payload: pinned.payload,
  ...overrides,
})

describe("agent-guidance snapshot pinning through the runtime registration seam", () => {
  it.effect("validates the registration the guidance helper produces and reconstructs the exact state", () =>
    Effect.gen(function* () {
      const validated = yield* ExecutableRegistration.validate(
        executable,
        registrationsFor(executable, guidanceRegistration()),
      )
      const carried = validated.find((registration) => registration.pin === pinned.capability.pin)
      expect(carried?.codec).toBe(Snapshot.codec)
      const restored = yield* Snapshot.decode(pinned.id, carried!.payload)
      expect(State.allEntries(restored)).toEqual(State.allEntries(state))
    }),
  )

  it.effect("fails validation typed when the pinned snapshot payload is mutated", () =>
    Effect.gen(function* () {
      const mutated = Snapshot.encode(State.make({ scope, entries: [entry("a", "memory"), entry("c", "skill")] }))
      const failure = yield* ExecutableRegistration.validate(
        executable,
        registrationsFor(executable, guidanceRegistration({ payload: mutated })),
      ).pipe(Effect.flip)
      expect(failure._tag).toBe("tenetkit/runtime/ExecutableRegistrationInvalid")
    }),
  )

  it.effect("fails validation typed when the registration codec is not the guidance codec", () =>
    Effect.gen(function* () {
      const failure = yield* ExecutableRegistration.validate(
        executable,
        registrationsFor(executable, guidanceRegistration({ codec: "@tenetkit/other" })),
      ).pipe(Effect.flip)
      expect(failure._tag).toBe("tenetkit/runtime/ExecutableRegistrationInvalid")
    }),
  )

  it.effect("fails validation typed when the registration version is not the pinned version", () =>
    Effect.gen(function* () {
      const failure = yield* ExecutableRegistration.validate(
        executable,
        registrationsFor(executable, guidanceRegistration({ version: "2" })),
      ).pipe(Effect.flip)
      expect(failure._tag).toBe("tenetkit/runtime/ExecutableRegistrationInvalid")
    }),
  )

  it.effect("fails validation typed when the declared guidance registration is absent", () =>
    Effect.gen(function* () {
      const failure = yield* ExecutableRegistration.validate(
        executable,
        registrationsFor(executable, guidanceRegistration()).filter(
          (registration) => registration.pin !== pinned.capability.pin,
        ),
      ).pipe(Effect.flip)
      expect(failure).toMatchObject({
        _tag: "tenetkit/runtime/ExecutableRegistrationMissing",
        pin: pinned.capability.pin,
      })
    }),
  )

  it("changes the Agent manifest and executable digests when the pinned guidance state changes", () => {
    const changed = Registration.make(
      State.make({ scope, entries: [entry("a", "memory"), entry("b", "skill"), entry("d", "memory")] }),
      "guidance",
    )
    const other = executableFor(changed.capability)
    expect(other.manifest.entries[0]?.pin).not.toBe(executable.manifest.entries[0]?.pin)
    expect(other.ref.executable).not.toBe(executable.ref.executable)
  })

  it.effect("rejects a payload pinned for one state supplied against another pinned executable", () =>
    Effect.gen(function* () {
      const changed = Registration.make(State.make({ scope, entries: [entry("a", "memory")] }), "guidance")
      const other = executableFor(changed.capability)
      const failure = yield* ExecutableRegistration.validate(
        other,
        registrationsFor(other, { ...guidanceRegistration(), pin: changed.capability.pin }),
      ).pipe(Effect.flip)
      expect(failure._tag).toBe("tenetkit/runtime/ExecutableRegistrationInvalid")
    }),
  )
})
