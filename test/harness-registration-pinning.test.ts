import { describe, expect, it } from "@effect/vitest"
import { AgentManifest, ExecutableManifest, Pins } from "../packages/core/src/index.js"
import { HarnessEntry, HarnessRegistration, HarnessSnapshot, HarnessState } from "../packages/harness/src/index.js"
import { ExecutableRegistration } from "../packages/runtime/src/index.js"
import { Effect } from "effect"

const scope = "thread:alpha"
const at = "2024-01-01T00:00:00.000Z"

const entry = (id: string, kind: HarnessEntry.HarnessKind): HarnessEntry.HarnessEntry => ({
  id,
  kind,
  scope,
  title: `title ${id}`,
  content: `content ${id}`,
  createdAt: at,
  updatedAt: at,
  version: 1,
})

const state = HarnessState.make({ scope, entries: [entry("a", "memory"), entry("b", "skill")] })
const pinned = HarnessRegistration.registration(state, "harness")

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
  harness: ExecutableRegistration.ExecutableRegistration,
) => [
  ...[...ExecutableRegistration.requiredPins(target)]
    .filter((pin) => pin !== harness.pin)
    .map((pin) => ({ pin, codec: "test", version: "1", payload: { fixture: "1" } })),
  harness,
]

const harnessRegistration = (overrides: Partial<ExecutableRegistration.ExecutableRegistration> = {}) => ({
  pin: pinned.capability.pin,
  codec: HarnessSnapshot.CODEC,
  version: HarnessSnapshot.VERSION,
  payload: pinned.payload,
  ...overrides,
})

describe("harness snapshot pinning through the runtime registration seam", () => {
  it.effect("validates the registration the harness helper produces and reconstructs the exact state", () =>
    Effect.gen(function* () {
      const validated = yield* ExecutableRegistration.validate(
        executable,
        registrationsFor(executable, harnessRegistration()),
      )
      const carried = validated.find((registration) => registration.pin === pinned.capability.pin)
      expect(carried?.codec).toBe(HarnessSnapshot.CODEC)
      const restored = yield* HarnessSnapshot.decode(pinned.id, carried!.payload)
      expect(HarnessState.allEntries(restored)).toEqual(HarnessState.allEntries(state))
    }),
  )

  it.effect("fails validation typed when the pinned snapshot payload is mutated", () =>
    Effect.gen(function* () {
      const mutated = HarnessSnapshot.encode(
        HarnessState.make({ scope, entries: [entry("a", "memory"), entry("c", "skill")] }),
      )
      const failure = yield* ExecutableRegistration.validate(
        executable,
        registrationsFor(executable, harnessRegistration({ payload: mutated })),
      ).pipe(Effect.flip)
      expect(failure._tag).toBe("@batonfx/runtime/ExecutableRegistrationInvalid")
    }),
  )

  it.effect("fails validation typed when the registration codec is not the harness codec", () =>
    Effect.gen(function* () {
      const failure = yield* ExecutableRegistration.validate(
        executable,
        registrationsFor(executable, harnessRegistration({ codec: "@batonfx/other" })),
      ).pipe(Effect.flip)
      expect(failure._tag).toBe("@batonfx/runtime/ExecutableRegistrationInvalid")
    }),
  )

  it.effect("fails validation typed when the registration version is not the pinned version", () =>
    Effect.gen(function* () {
      const failure = yield* ExecutableRegistration.validate(
        executable,
        registrationsFor(executable, harnessRegistration({ version: "2" })),
      ).pipe(Effect.flip)
      expect(failure._tag).toBe("@batonfx/runtime/ExecutableRegistrationInvalid")
    }),
  )

  it.effect("fails validation typed when the declared harness registration is absent", () =>
    Effect.gen(function* () {
      const failure = yield* ExecutableRegistration.validate(
        executable,
        registrationsFor(executable, harnessRegistration()).filter(
          (registration) => registration.pin !== pinned.capability.pin,
        ),
      ).pipe(Effect.flip)
      expect(failure).toMatchObject({
        _tag: "@batonfx/runtime/ExecutableRegistrationMissing",
        pin: pinned.capability.pin,
      })
    }),
  )

  it("changes the Agent manifest and executable digests when the pinned harness state changes", () => {
    const changed = HarnessRegistration.registration(
      HarnessState.make({ scope, entries: [entry("a", "memory"), entry("b", "skill"), entry("d", "memory")] }),
      "harness",
    )
    const other = executableFor(changed.capability)
    expect(other.manifest.entries[0]?.pin).not.toBe(executable.manifest.entries[0]?.pin)
    expect(other.ref.executable).not.toBe(executable.ref.executable)
  })

  it.effect("rejects a payload pinned for one state supplied against another pinned executable", () =>
    Effect.gen(function* () {
      const changed = HarnessRegistration.registration(
        HarnessState.make({ scope, entries: [entry("a", "memory")] }),
        "harness",
      )
      const other = executableFor(changed.capability)
      const failure = yield* ExecutableRegistration.validate(
        other,
        registrationsFor(other, { ...harnessRegistration(), pin: changed.capability.pin }),
      ).pipe(Effect.flip)
      expect(failure._tag).toBe("@batonfx/runtime/ExecutableRegistrationInvalid")
    }),
  )
})
