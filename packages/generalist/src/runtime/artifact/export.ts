import { Effect, Stream } from "effect"
import type { Service as RunStore } from "../run/store.js"
import type { RuntimeLifecycleService } from "../state/layer.js"
import type { RuntimeAvailabilityError } from "../errors.js"

type ArtifactStore = Pick<
  RunStore,
  | "ensureArtifact"
  | "artifactHead"
  | "artifactSnapshot"
  | "forkArtifact"
  | "appendArtifact"
  | "artifactAppendReceipt"
  | "artifactUpdates"
  | "artifactRunIsFork"
>

/** Object identity permitted to own a private Runtime capability binding. */
interface RuntimeOwner {
  readonly toString: () => string
}

type Guarded<Result> =
  Result extends Effect.Effect<infer Value, infer Error, infer Requirements>
    ? Effect.Effect<Value, Error | RuntimeAvailabilityError, Requirements>
    : Result extends Stream.Stream<infer Value, infer Error, infer Requirements>
      ? Stream.Stream<Value, Error | RuntimeAvailabilityError, Requirements>
      : never

type GuardedMethod<Method> = Method extends (...arguments_: infer Arguments) => infer Result
  ? (...arguments_: Arguments) => Guarded<Result>
  : never

/** @internal Runtime-owned semantic persistence operations for open Artifacts. */
export interface Backend {
  readonly ensure: GuardedMethod<ArtifactStore["ensureArtifact"]>
  readonly head: GuardedMethod<ArtifactStore["artifactHead"]>
  readonly snapshot: GuardedMethod<ArtifactStore["artifactSnapshot"]>
  readonly fork: GuardedMethod<ArtifactStore["forkArtifact"]>
  readonly append: GuardedMethod<ArtifactStore["appendArtifact"]>
  readonly receipt: GuardedMethod<ArtifactStore["artifactAppendReceipt"]>
  readonly updates: GuardedMethod<ArtifactStore["artifactUpdates"]>
  readonly isFork: GuardedMethod<ArtifactStore["artifactRunIsFork"]>
}

const bindings = new WeakMap<object, Backend>()

const guardEffect = <Value, Error, Requirements>(
  lifecycle: RuntimeLifecycleService,
  effect: Effect.Effect<Value, Error, Requirements>,
): Effect.Effect<Value, Error | RuntimeAvailabilityError, Requirements> => lifecycle.run(effect)

const guardStream = <Value, Error, Requirements>(
  lifecycle: RuntimeLifecycleService,
  stream: Stream.Stream<Value, Error, Requirements>,
): Stream.Stream<Value, Error | RuntimeAvailabilityError, Requirements> =>
  Stream.interruptWhen(Stream.unwrap(lifecycle.run(Effect.succeed(stream))), lifecycle.run(Effect.never))

/** @internal Bind one ready Runtime's lifecycle-guarded Artifact persistence capability. */
export const bind = (input: {
  readonly runtime: RuntimeOwner
  readonly store: ArtifactStore
  readonly lifecycle: RuntimeLifecycleService
}): void => {
  const { lifecycle, store } = input
  bindings.set(
    input.runtime,
    Object.freeze({
      ensure: (request) => guardEffect(lifecycle, store.ensureArtifact(request)),
      head: (request) => guardEffect(lifecycle, store.artifactHead(request)),
      snapshot: (request) => guardEffect(lifecycle, store.artifactSnapshot(request)),
      fork: (request) => guardEffect(lifecycle, store.forkArtifact(request)),
      append: (request) => guardEffect(lifecycle, store.appendArtifact(request)),
      receipt: (request) => guardEffect(lifecycle, store.artifactAppendReceipt(request)),
      updates: (request) => guardStream(lifecycle, store.artifactUpdates(request)),
      isFork: (runId) => guardEffect(lifecycle, store.artifactRunIsFork(runId)),
    } satisfies Backend),
  )
}

/** @internal Resolve one Runtime's private Artifact persistence capability. */
export const get = (runtime: RuntimeOwner): Backend | undefined => bindings.get(runtime)

/** @internal Preserve Artifact persistence authority when Runtime creates a guarded facade. */
export const copy = <Runtime extends RuntimeOwner>(input: {
  readonly source: RuntimeOwner
  readonly target: Runtime
}): Runtime => {
  const capability = bindings.get(input.source)
  if (capability !== undefined) bindings.set(input.target, capability)
  return input.target
}
