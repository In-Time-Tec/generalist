import { describe, expect, it } from "@effect/vitest"
import { Duration, Effect, Layer, Schema, Stream } from "effect"
import { Testing } from "generalist/testing"
import {
  ExecutionFailed,
  LimitExceeded,
  SandboxProvider,
  Unavailable,
  Unsupported,
} from "../../../../src/sandbox/service.js"
import {
  makeProvider,
  type ExecOptions,
  type ProviderOptions,
  type SandboxStub,
} from "../../../../src/unstable/sandbox/cloudflare/index.js"

interface ExecCall {
  readonly command: string
  readonly options: ExecOptions
}

type FixtureFailure = { readonly code: "CONTAINER_UNAVAILABLE" | "COMMAND_TIMEOUT" } | Error

const result = (
  overrides: Partial<{ readonly stdout: string; readonly stderr: string; readonly exitCode: number }> = {},
) => ({
  success: (overrides.exitCode ?? 0) === 0,
  exitCode: overrides.exitCode ?? 0,
  stdout: overrides.stdout ?? "cloudflare",
  stderr: overrides.stderr ?? "",
  command: "fixture",
  duration: 1,
  timestamp: "2026-09-02T00:00:00.000Z",
})

it.effect("shapes Cloudflare Sandbox RPC calls and finalizes the container", () =>
  Effect.gen(function* () {
    const execs: Array<ExecCall> = []
    const sandboxIds: Array<string> = []
    let destroys = 0
    const stub: SandboxStub = {
      exec: (command, options) => {
        execs.push({ command, options })
        return Promise.resolve(result({ stdout: "hello", stderr: "warning", exitCode: 3 }))
      },
      mkdir: (path) => Promise.resolve({ success: true, path }),
      writeFile: (path) => Promise.resolve({ success: true, path }),
      readFile: (path) =>
        Promise.resolve({ success: true, path, content: "stored", timestamp: "2026-09-02T00:00:00.000Z" }),
      destroy: () => {
        destroys += 1
        return Promise.resolve()
      },
    }
    const provider = yield* makeProvider({
      getSandbox: (id) => {
        sandboxIds.push(id)
        return stub
      },
    })
    yield* Effect.scoped(
      Effect.gen(function* () {
        const sandbox = yield* provider.acquire({ key: "sandbox-key", limits: { wallClock: Duration.millis(500) } })
        const files = yield* sandbox.files
        yield* files.makeDirectory("/work", { recursive: true })
        yield* files.writeFileString("/work/file.txt", "stored")
        expect(yield* files.readFileString("/work/file.txt")).toBe("stored")
        const execution = yield* sandbox.start({
          _tag: "Process",
          command: "printf",
          arguments: ["%s", "a'b"],
          cwd: "/work",
          environment: { LANG: "C" },
          stdin: "input",
        })
        expect(yield* execution.result).toEqual({ stdout: "hello", stderr: "warning", exitCode: 3 })
        expect(yield* Stream.runCollect(execution.events)).toHaveLength(2)
      }),
    )

    expect(execs).toHaveLength(1)
    expect(sandboxIds).toEqual(["sandbox-key"])
    expect(execs[0]?.command).toBe(`printf %s 'input' | 'printf' '%s' 'a'"'"'b'`)
    expect(execs[0]?.options).toMatchObject({ cwd: "/work", env: { LANG: "C" }, timeout: 500 })
    expect(destroys).toBe(1)
  }),
)

it.effect("maps Cloudflare SDK failures and unsupported operations", () =>
  Effect.gen(function* () {
    let failure: FixtureFailure = { code: "CONTAINER_UNAVAILABLE" }
    const stub: SandboxStub = {
      exec: () => Promise.reject(failure),
      mkdir: (path) => Promise.resolve({ success: true, path }),
      writeFile: (path) => Promise.resolve({ success: true, path }),
      readFile: (path) =>
        Promise.resolve({ success: true, path, content: "stored", timestamp: "2026-09-02T00:00:00.000Z" }),
      destroy: () => Promise.resolve(),
    }
    const provider = yield* makeProvider({ getSandbox: () => stub })
    yield* Effect.scoped(
      Effect.gen(function* () {
        const sandbox = yield* provider.acquire({ key: "sandbox-key", limits: { wallClock: Duration.millis(25) } })
        const unavailable = yield* sandbox.exec({ _tag: "Process", command: "true", arguments: [] }).pipe(Effect.flip)
        expect(Schema.is(Unavailable)(unavailable)).toBe(true)

        failure = { code: "COMMAND_TIMEOUT" }
        const limited = yield* sandbox.exec({ _tag: "Process", command: "sleep", arguments: ["1"] }).pipe(Effect.flip)
        expect(Schema.is(LimitExceeded)(limited)).toBe(true)

        failure = new Error("command failed")
        const execution = yield* sandbox.exec({ _tag: "Process", command: "false", arguments: [] }).pipe(Effect.flip)
        expect(Schema.is(ExecutionFailed)(execution)).toBe(true)

        for (const [effect, operation] of [
          [sandbox.pause, "pause"],
          [sandbox.resume, "resume"],
          [sandbox.snapshot, "snapshot"],
          [sandbox.fork("snapshot"), "fork"],
        ] as const) {
          const unsupported = yield* effect.pipe(Effect.flip)
          expect(Schema.is(Unsupported)(unsupported)).toBe(true)
          if (Schema.is(Unsupported)(unsupported)) expect(unsupported.operation).toBe(operation)
        }
      }),
    )
  }),
)

// SAFETY: This optional test-only global is supplied by the Cloudflare Worker test host with this factory contract.
const liveFactory = (
  globalThis as typeof globalThis & {
    readonly GENERALIST_CLOUDFLARE_SANDBOX_FACTORY?: ProviderOptions["getSandbox"]
  }
).GENERALIST_CLOUDFLARE_SANDBOX_FACTORY

describe.skipIf(liveFactory === undefined)("Cloudflare live Sandbox", () => {
  if (liveFactory === undefined) return
  Testing.sandbox({
    name: "Cloudflare Sandbox",
    isolation: "container",
    layer: Layer.effect(SandboxProvider, makeProvider({ getSandbox: liveFactory })),
  })
})
