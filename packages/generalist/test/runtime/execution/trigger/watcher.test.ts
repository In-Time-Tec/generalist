import { expect, it } from "@effect/vitest"
import { Effect, FileSystem, Layer, Stream } from "effect"
import { Watcher } from "generalist"
import { provideScoped } from "../scoped-provide.js"

const fileSystem = FileSystem.layerNoop({
  watch: () =>
    Stream.fromIterable([
      { _tag: "Create" as const, path: "/workspace/new.ts" },
      { _tag: "Update" as const, path: "/workspace/new.ts" },
      { _tag: "Remove" as const, path: "/workspace/new.ts" },
    ]),
})

it.effect("maps the optional FileSystem watch capability into typed wake events", () =>
  provideScoped(
    Watcher.layer.pipe(Layer.provide(fileSystem)),
    Effect.gen(function* () {
      const watcher = yield* Watcher.Watcher
      const events = yield* watcher.watch({ path: "/workspace", recursive: true }).pipe(Stream.runCollect)
      expect(Array.from(events, (event) => ({ tag: event._tag, path: event.path, kind: event.kind }))).toEqual([
        { tag: "FileChanged", path: "/workspace/new.ts", kind: "create" },
        { tag: "FileChanged", path: "/workspace/new.ts", kind: "update" },
        { tag: "FileChanged", path: "/workspace/new.ts", kind: "remove" },
      ])
      expect(new Set(Array.from(events, (event) => event.dedupeKey)).size).toBe(3)
    }),
  ),
)
