import { Duration, Effect, Fiber, Function, Ref, Scope, Stream } from "effect"
import { make, type SandboxProviderService, type SandboxService } from "./service.js"

const wrapSandbox = (
  sandbox: SandboxService,
  duration: Duration.Input,
  scope: Scope.Scope,
): Effect.Effect<SandboxService> =>
  Effect.gen(function* () {
    if (!sandbox.capabilities.pause) return sandbox

    const timer = yield* Ref.make<Fiber.Fiber<void> | undefined>(undefined)
    const paused = yield* Ref.make(false)
    const pause = sandbox.pause.pipe(Effect.tap(() => Ref.set(paused, true)))
    const cancelTimer = Ref.getAndSet(timer, undefined).pipe(
      Effect.flatMap((fiber) => (fiber === undefined ? Effect.void : Fiber.interrupt(fiber))),
    )
    const schedule = Effect.gen(function* () {
      if (yield* Ref.get(paused)) return
      const next = yield* Effect.sleep(duration).pipe(Effect.andThen(pause), Effect.ignore, Effect.forkIn(scope))
      const previous = yield* Ref.getAndSet(timer, next)
      if (previous !== undefined) yield* Fiber.interrupt(previous)
    })
    const active = <A, E, R>(effect: Effect.Effect<A, E, R>): Effect.Effect<A, E, R> =>
      cancelTimer.pipe(Effect.andThen(effect), Effect.ensuring(schedule))

    yield* Scope.addFinalizer(
      scope,
      cancelTimer.pipe(
        Effect.andThen(Ref.get(paused)),
        Effect.flatMap((isPaused) => (isPaused ? Effect.void : pause)),
        Effect.ignore,
      ),
    )
    yield* schedule

    const start: SandboxService["start"] = (command) =>
      cancelTimer.pipe(
        Effect.andThen(sandbox.start(command)),
        Effect.map((execution) => ({
          events: execution.events.pipe(Stream.ensuring(schedule)),
          result: active(execution.result),
        })),
        Effect.onError(() => schedule),
      )

    return make({
      ...sandbox,
      start,
      files: active(sandbox.files),
      pause: cancelTimer.pipe(Effect.andThen(pause)),
      resume: sandbox.resume.pipe(
        Effect.tap(() => Ref.set(paused, false)),
        Effect.tap(() => schedule),
      ),
      snapshot: active(sandbox.snapshot),
      fork: (snapshotId, options) =>
        active(sandbox.fork(snapshotId, options)).pipe(Effect.flatMap((fork) => wrapSandbox(fork, duration, scope))),
    })
  })

/** Add framework-owned inactivity pausing and scope-close pausing to a provider. */
export const autoPause: {
  (duration: Duration.Input): (provider: SandboxProviderService) => SandboxProviderService
  (provider: SandboxProviderService, duration: Duration.Input): SandboxProviderService
} = Function.dual(
  2,
  (provider: SandboxProviderService, duration: Duration.Input): SandboxProviderService => ({
    ...provider,
    acquire: (options) =>
      Effect.gen(function* () {
        const scope = yield* Scope.Scope
        const sandbox = yield* provider.acquire(options)
        return yield* wrapSandbox(sandbox, duration, scope)
      }),
  }),
)
