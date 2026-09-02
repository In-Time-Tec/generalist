import { layer as bunLayer } from "@effect/platform-bun/BunServices"
import { Effect, FileSystem, Layer, Path } from "effect"
import { ChildProcess, ChildProcessSpawner } from "effect/unstable/process"
import { layerWorktree } from "../../src/sandbox/index.js"
import { Testing } from "../../src/testing/index.js"

const platform = Layer.merge(bunLayer, Path.layer)

const worktree = Layer.unwrap(
  Effect.gen(function* () {
    const files = yield* FileSystem.FileSystem
    const spawner = yield* ChildProcessSpawner.ChildProcessSpawner
    const repo = yield* files.makeTempDirectory({ prefix: "generalist-worktree-" })
    const git = (arguments_: ReadonlyArray<string>) =>
      spawner.string(ChildProcess.make("git", ["-C", repo, ...arguments_])).pipe(Effect.asVoid)
    yield* git(["init"])
    yield* git(["config", "user.name", "Generalist Test"])
    yield* git(["config", "user.email", "generalist@example.test"])
    yield* git(["config", "commit.gpgsign", "false"])
    yield* files.writeFileString(`${repo}/README.md`, "worktree fixture\n")
    yield* git(["add", "README.md"])
    yield* git(["commit", "-m", "Initialize fixture"])
    return layerWorktree({ repo })
  }),
).pipe(Layer.provide(platform))

Testing.sandbox({ name: "Worktree", isolation: "process", layer: worktree })
