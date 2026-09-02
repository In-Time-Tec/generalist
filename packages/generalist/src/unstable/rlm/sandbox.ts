import { Effect, Ref, Schema, Scope, Semaphore } from "effect"
import { AiError, Prompt } from "effect/unstable/ai"
import {
  ExecutionFailed,
  type ExecResult,
  type SandboxError,
  type SandboxProviderService,
  type SandboxService,
  Unsupported,
} from "../../sandbox/service.js"

export const directory = ".generalist/rlm"
export const offloadedContextPath = `${directory}/offloaded-context.json`

const promptPath = (id: number): string => `${directory}/prompt-${id}.json`
const processPath = (id: number): string => `${directory}/cell-${id}.ts`

const executionFailed = (message: string, cause: unknown): ExecutionFailed => ExecutionFailed.make({ message, cause })

const initialize = (sandbox: SandboxService): Effect.Effect<SandboxService, SandboxError> =>
  Effect.gen(function* () {
    const files = yield* sandbox.files
    yield* files
      .makeDirectory(directory, { recursive: true })
      .pipe(Effect.mapError((cause) => executionFailed("RLM could not create its sandbox directory", cause)))
    yield* files
      .writeFileString(offloadedContextPath, "[]")
      .pipe(Effect.mapError((cause) => executionFailed("RLM could not initialize offloaded context", cause)))
    return sandbox
  })

export interface Pool {
  readonly acquire: (key?: string) => Effect.Effect<SandboxService, SandboxError>
  readonly nextId: Effect.Effect<number>
}

export const sandboxPool = (options: {
  readonly provider: SandboxProviderService
  readonly scope: Scope.Scope
}): Effect.Effect<Pool> =>
  Effect.gen(function* () {
    const sandboxes = yield* Ref.make(new Map<string, SandboxService>())
    const ids = yield* Ref.make(0)
    const lock = yield* Semaphore.make(1)
    const fresh = options.provider
      .acquire()
      .pipe(Effect.provideService(Scope.Scope, options.scope), Effect.flatMap(initialize))
    return {
      nextId: Ref.updateAndGet(ids, (id) => id + 1),
      acquire: (key) => {
        if (key === undefined) return fresh
        return lock.withPermit(
          Effect.gen(function* () {
            const existing = (yield* Ref.get(sandboxes)).get(key)
            if (existing !== undefined) return existing
            const sandbox = yield* fresh
            yield* Ref.update(sandboxes, (current) => {
              const next = new Map(current)
              next.set(key, sandbox)
              return next
            })
            return sandbox
          }),
        )
      },
    }
  })

const aiFailure = (method: string, cause: unknown): AiError.AiError =>
  AiError.make({
    module: "generalist/unstable/rlm",
    method,
    reason: AiError.UnknownError.make({ description: String(cause) }),
  })

const promptSource = (path: string): string =>
  [
    `var prompt = JSON.parse(await (await import("node:fs/promises")).readFile(${JSON.stringify(path)}, "utf8"));`,
    `var offloadedContext = JSON.parse(await (await import("node:fs/promises")).readFile(${JSON.stringify(offloadedContextPath)}, "utf8"));`,
  ].join("\n")

export interface PreparedSandbox {
  readonly sandbox: SandboxService
  readonly promptPath: string
}

export const prepare = (options: {
  readonly pool: Pool
  readonly prompt: Prompt.Prompt
  readonly key: string | undefined
}): Effect.Effect<PreparedSandbox, AiError.AiError> =>
  Effect.gen(function* () {
    const sandbox = yield* options.pool.acquire(options.key)
    const files = yield* sandbox.files
    const id = yield* options.pool.nextId
    const path = promptPath(id)
    const encoded = yield* Schema.encodeEffect(Schema.fromJsonString(Prompt.Prompt))(options.prompt)
    yield* files.writeFileString(path, encoded)
    return { sandbox, promptPath: path }
  }).pipe(Effect.mapError((cause) => aiFailure("prepare", cause)))

const execute = (pool: Pool, prepared: PreparedSandbox, code: string): Effect.Effect<ExecResult, SandboxError> =>
  Effect.gen(function* () {
    const id = yield* pool.nextId
    const source = `${promptSource(prepared.promptPath)}\n${code}`
    if (prepared.sandbox.capabilities.commands.includes("TypeScript")) {
      return yield* prepared.sandbox.exec({ _tag: "TypeScript", cellId: `rlm-${id}`, source })
    }
    if (prepared.sandbox.capabilities.commands.includes("Process")) {
      const files = yield* prepared.sandbox.files
      const path = processPath(id)
      yield* files
        .writeFileString(path, source)
        .pipe(Effect.mapError((cause) => executionFailed("RLM could not write its process source", cause)))
      return yield* prepared.sandbox.exec({ _tag: "Process", command: "bun", arguments: [path] })
    }
    return yield* Unsupported.make({
      operation: "exec:typescript",
      message: "RLM requires a Sandbox with TypeScript or Process commands",
    })
  })

export const exec = (options: {
  readonly pool: Pool
  readonly prepared: PreparedSandbox
  readonly code: string
}): Effect.Effect<string, AiError.AiError> =>
  execute(options.pool, options.prepared, options.code).pipe(
    Effect.flatMap(
      Schema.encodeEffect(
        Schema.fromJsonString(
          Schema.Struct({
            stdout: Schema.String,
            stderr: Schema.String,
            exitCode: Schema.Int,
            value: Schema.optionalKey(Schema.Unknown),
          }),
        ),
      ),
    ),
    Effect.mapError((cause) => aiFailure("exec", cause)),
  )
