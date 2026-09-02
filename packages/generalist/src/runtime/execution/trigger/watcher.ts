import { Clock, Context, Effect, FileSystem, Layer, Ref, Stream, type PlatformError } from "effect"
import type { WakeEvent } from "../../../core/agent/tools/wake-event.js"

export interface WatchOptions {
  readonly path: string
  readonly recursive?: boolean
}

export interface Service {
  /** Stream typed file changes from the host FileSystem watch capability. */
  readonly watch: (
    options: WatchOptions,
  ) => Stream.Stream<Extract<WakeEvent, { readonly _tag: "FileChanged" }>, PlatformError.PlatformError>
}

export class Watcher extends Context.Service<Watcher, Service>()("generalist/runtime/execution/trigger/watcher") {}

const kind = (event: FileSystem.WatchEvent): "create" | "update" | "remove" => {
  switch (event._tag) {
    case "Create":
      return "create"
    case "Update":
      return "update"
    case "Remove":
      return "remove"
  }
}

export const make: Effect.Effect<Service, never, FileSystem.FileSystem> = Effect.gen(function* () {
  const fileSystem = yield* FileSystem.FileSystem
  const sequence = yield* Ref.make(0)
  return Watcher.of({
    watch: (options) =>
      fileSystem.watch(options.path, { recursive: options.recursive ?? false }).pipe(
        Stream.mapEffect((event) =>
          Effect.all([Clock.currentTimeMillis, Ref.getAndUpdate(sequence, (current) => current + 1)]).pipe(
            Effect.map(([now, current]) => ({
              _tag: "FileChanged" as const,
              dedupeKey: `file:${now}:${current}:${event._tag}:${event.path}`,
              path: event.path,
              kind: kind(event),
            })),
          ),
        ),
      ),
  })
})

/** FileSystem-backed environmental watch capability. Unsupported hosts omit this Layer. */
export const layer: Layer.Layer<Watcher, never, FileSystem.FileSystem> = Layer.effect(Watcher, make)
