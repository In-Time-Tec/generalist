import { expect, it } from "@effect/vitest"
import { Effect, Ref, Stream } from "effect"
import { TestClock } from "effect/testing"
import { autoPause } from "../../src/sandbox/auto-pause.js"
import { make, SandboxProvider, type SandboxProviderService } from "../../src/sandbox/service.js"

const fixture = (pauses: Ref.Ref<number>): SandboxProviderService =>
  SandboxProvider.of({
    defaultImage: "fixture",
    acquire: () =>
      Effect.succeed(
        make({
          isolation: "process",
          limits: {},
          capabilities: {
            commands: ["Process"],
            files: false,
            pause: true,
            resume: true,
            snapshot: false,
            fork: false,
            limits: [],
          },
          start: () =>
            Effect.succeed({
              events: Stream.empty,
              result: Effect.succeed({ stdout: "ok", stderr: "", exitCode: 0 }),
            }),
          files: Effect.die("unused"),
          pause: Ref.update(pauses, (count) => count + 1),
          resume: Effect.void,
          snapshot: Effect.die("unused"),
          fork: () => Effect.die("unused"),
        }),
      ),
  })

it.effect("auto-pauses after inactivity and resets after execution", () =>
  Effect.gen(function* () {
    const pauses = yield* Ref.make(0)
    yield* Effect.scoped(
      Effect.gen(function* () {
        const sandbox = yield* autoPause(fixture(pauses), "1 second").acquire()
        yield* TestClock.adjust("999 millis")
        expect(yield* Ref.get(pauses)).toBe(0)
        yield* sandbox.exec({ _tag: "Process", command: "true", arguments: [] })
        yield* TestClock.adjust("999 millis")
        expect(yield* Ref.get(pauses)).toBe(0)
        yield* TestClock.adjust("1 milli")
        expect(yield* Ref.get(pauses)).toBe(1)
      }),
    )
    expect(yield* Ref.get(pauses)).toBe(1)
  }),
)

it.effect("pauses an active sandbox when its acquisition scope closes", () =>
  Effect.gen(function* () {
    const pauses = yield* Ref.make(0)
    yield* Effect.scoped(autoPause(fixture(pauses), "1 hour").acquire())
    expect(yield* Ref.get(pauses)).toBe(1)
  }),
)
