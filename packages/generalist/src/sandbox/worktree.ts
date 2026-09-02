import { Effect, FileSystem, Layer, Path, Ref, Schema, Scope, Stream, Types } from "effect"
import { ChildProcess, ChildProcessSpawner } from "effect/unstable/process"
import { rootedFileSystem } from "./file-system.js"
import {
  ExecutionFailed,
  make,
  type AcquireOptions,
  type SandboxProviderService,
  SandboxProvider,
  type SandboxService,
  SnapshotNotFound,
  Unavailable,
  Unsupported,
} from "./service.js"

/** Git worktree sandbox configuration. */
export interface WorktreeOptions {
  readonly repo: string
}

const unsupported = (operation: Unsupported["operation"]): Unsupported =>
  Unsupported.make({ operation, message: `Worktree does not support ${operation}` })

/** Provide a process-isolated Sandbox whose snapshots are hidden Git commits and whose forks are worktrees. */
export const layerWorktree = (
  options: WorktreeOptions,
): Layer.Layer<SandboxProvider, never, FileSystem.FileSystem | Path.Path | ChildProcessSpawner.ChildProcessSpawner> =>
  Layer.effect(
    SandboxProvider,
    Effect.gen(function* () {
      const files = yield* FileSystem.FileSystem
      const path = yield* Path.Path
      const spawner = yield* ChildProcessSpawner.ChildProcessSpawner
      const scope = yield* Effect.scope
      const counter = yield* Ref.make(0)
      const worktrees = yield* Ref.make<ReadonlyArray<string>>([])

      const git = (repo: string, args: ReadonlyArray<string>, environment?: Readonly<Record<string, string>>) =>
        Effect.scoped(
          Effect.gen(function* () {
            const command = ChildProcess.make(
              "git",
              ["-C", repo, ...args],
              environment === undefined ? {} : { env: environment },
            )
            const handle = yield* spawner.spawn(command)
            const [stdout, stderr, exitCode] = yield* Effect.all(
              [
                Stream.mkString(Stream.decodeText(handle.stdout)),
                Stream.mkString(Stream.decodeText(handle.stderr)),
                handle.exitCode,
              ],
              { concurrency: 3 },
            )
            if (Number(exitCode) !== 0) {
              return yield* ExecutionFailed.make({
                message: stderr.trim().length === 0 ? `Git command exited with ${exitCode}` : stderr.trim(),
              })
            }
            return stdout.trim()
          }),
        ).pipe(
          Effect.mapError((cause) =>
            Schema.is(ExecutionFailed)(cause)
              ? cause
              : ExecutionFailed.make({ message: "Unable to execute Git command", cause }),
          ),
        )

      const next = Ref.updateAndGet(counter, (value) => value + 1)
      const registerWorktree = (directory: string) => Ref.update(worktrees, (all) => [...all, directory])
      yield* Scope.addFinalizer(
        scope,
        Ref.get(worktrees).pipe(
          Effect.flatMap((all) =>
            Effect.forEach(
              all.toReversed(),
              (directory) =>
                git(options.repo, ["worktree", "remove", "--force", directory]).pipe(
                  Effect.ignore,
                  Effect.andThen(files.remove(directory, { recursive: true, force: true }).pipe(Effect.ignore)),
                ),
              { discard: true },
            ),
          ),
        ),
      )

      const sandbox = (repo: string): SandboxService => {
        const start: SandboxService["start"] = (command) => {
          if (command._tag !== "Process") {
            return Effect.fail(
              unsupported(command._tag === "TypeScript" ? "exec:typescript" : "exec:javascript-module"),
            )
          }
          return Effect.gen(function* () {
            const cwd = command.cwd === undefined ? repo : path.resolve(repo, command.cwd)
            const collected = yield* Effect.cached(
              Effect.scoped(
                Effect.gen(function* () {
                  const processOptions: Types.Mutable<ChildProcess.CommandOptions> = { cwd }
                  if (command.environment !== undefined) processOptions.env = command.environment
                  if (command.stdin !== undefined) {
                    processOptions.stdin = Stream.encodeText(Stream.succeed(command.stdin))
                  }
                  const handle = yield* spawner.spawn(
                    ChildProcess.make(command.command, command.arguments, processOptions),
                  )
                  const [stdout, stderr, exitCode] = yield* Effect.all(
                    [
                      Stream.mkString(Stream.decodeText(handle.stdout)),
                      Stream.mkString(Stream.decodeText(handle.stderr)),
                      handle.exitCode,
                    ],
                    { concurrency: 3 },
                  )
                  return { stdout, stderr, exitCode: Number(exitCode) }
                }),
              ).pipe(Effect.mapError((cause) => ExecutionFailed.make({ message: "Worktree command failed", cause }))),
            )
            return {
              events: Stream.fromEffect(collected).pipe(
                Stream.flatMap((result) =>
                  Stream.fromIterable([
                    ...(result.stdout.length === 0
                      ? []
                      : [{ _tag: "Output" as const, channel: "stdout" as const, text: result.stdout }]),
                    ...(result.stderr.length === 0
                      ? []
                      : [{ _tag: "Output" as const, channel: "stderr" as const, text: result.stderr }]),
                  ]),
                ),
              ),
              result: collected,
            }
          })
        }

        return make({
          isolation: "process",
          limits: {},
          capabilities: {
            commands: ["Process"],
            files: true,
            pause: false,
            resume: false,
            snapshot: true,
            fork: true,
            limits: [],
          },
          start,
          files: Effect.succeed(rootedFileSystem({ fileSystem: files, path, root: repo })),
          pause: Effect.fail(unsupported("pause")),
          resume: Effect.fail(unsupported("resume")),
          snapshot: Effect.gen(function* () {
            const id = yield* next
            const index = path.join(yield* files.makeTempDirectory(), `index-${id}`)
            const environment = { GIT_INDEX_FILE: index }
            yield* git(repo, ["read-tree", "HEAD"], environment)
            yield* git(repo, ["add", "-A"], environment)
            const tree = yield* git(repo, ["write-tree"], environment)
            const parent = yield* git(repo, ["rev-parse", "HEAD"])
            const commit = yield* git(
              repo,
              ["-c", "commit.gpgSign=false", "commit-tree", tree, "-p", parent, "-m", "Generalist sandbox snapshot"],
              {
                ...environment,
                GIT_AUTHOR_NAME: "Generalist Sandbox",
                GIT_AUTHOR_EMAIL: "sandbox@generalist.local",
                GIT_COMMITTER_NAME: "Generalist Sandbox",
                GIT_COMMITTER_EMAIL: "sandbox@generalist.local",
              },
            )
            const ref = `refs/generalist/snapshots/${commit}`
            yield* git(repo, ["update-ref", ref, commit])
            yield* files.remove(index, { force: true }).pipe(Effect.ignore)
            return ref
          }).pipe(Effect.mapError((cause) => ExecutionFailed.make({ message: "Worktree snapshot failed", cause }))),
          fork: (snapshotId) =>
            Effect.gen(function* () {
              const exists = yield* git(options.repo, ["rev-parse", "--verify", snapshotId]).pipe(
                Effect.as(true),
                Effect.orElseSucceed(() => false),
              )
              if (!exists) return yield* SnapshotNotFound.make({ snapshotId })
              const directory = yield* files
                .makeTempDirectory()
                .pipe(Effect.mapError((cause) => ExecutionFailed.make({ message: "Worktree fork failed", cause })))
              yield* git(options.repo, ["worktree", "add", "--detach", directory, snapshotId]).pipe(
                Effect.mapError((cause) => ExecutionFailed.make({ message: "Worktree fork failed", cause })),
              )
              yield* registerWorktree(directory)
              return sandbox(directory)
            }),
        })
      }

      const provider: SandboxProviderService = {
        defaultImage: "git-worktree",
        acquire: (request: AcquireOptions = {}) => {
          if (request.image !== undefined && request.image !== "git-worktree") {
            return Unavailable.make({ message: `Worktree image ${request.image} is unavailable` })
          }
          if (request.limits?.cpuMs !== undefined) return Effect.fail(unsupported("limit:cpu"))
          if (request.limits?.memoryMb !== undefined) return Effect.fail(unsupported("limit:memory"))
          if (request.limits?.wallClock !== undefined) return Effect.fail(unsupported("limit:wall-clock"))
          return Effect.succeed(sandbox(options.repo))
        },
      }
      return SandboxProvider.of(provider)
    }),
  )
