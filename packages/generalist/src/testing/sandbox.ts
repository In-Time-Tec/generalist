import { describe, expect, it } from "@effect/vitest"
import { Clock, Context, Duration, Effect, Layer, Schema, Scope, Stream } from "effect"
import {
  ProgramCapabilities,
  ProgramCapabilityMissing,
  type Service as ProgramCapabilitiesService,
} from "../core/program/capabilities.js"
import {
  protocolVersion,
  Result as ProgramResult,
  sourceDigest,
  type Request as ProgramRequest,
} from "../core/program/code-executor.js"
import { CellResult } from "../repl/cell.js"
import {
  type Command,
  type Isolation,
  LimitExceeded,
  type SandboxError,
  type SandboxProviderService,
  SandboxProvider,
  type SandboxService,
  Unsupported,
} from "../sandbox/index.js"
import { record } from "./report.js"

/** @experimental One provider registered against the public Sandbox conformance suite. */
export interface Options<E = never> {
  readonly name: string
  readonly isolation: Isolation
  readonly layer: Layer.Layer<SandboxProvider, E, never>
}

const capabilities: ProgramCapabilitiesService = ProgramCapabilities.of({
  discoverTools: Effect.succeed([]),
  describeTool: (name) => Effect.fail(ProgramCapabilityMissing.make({ capability: name })),
  callTool: () => Effect.fail(ProgramCapabilityMissing.make({ capability: "callTool" })),
  callStep: () => Effect.fail(ProgramCapabilityMissing.make({ capability: "callStep" })),
  runAgent: () => Effect.fail(ProgramCapabilityMissing.make({ capability: "runAgent" })),
  mapAgents: () => Effect.fail(ProgramCapabilityMissing.make({ capability: "mapAgents" })),
  fanOutAgents: () => Effect.fail(ProgramCapabilityMissing.make({ capability: "fanOutAgents" })),
  log: () => Effect.void,
})

let nextRequest = 0
const moduleRequest = (source: string, input: unknown, deadlineMillis: number): ProgramRequest => {
  const modules = [{ name: "program.js", source }]
  const identity = { modules, entrypoint: "program.js", inputCodec: "testing:v1", outputCodec: "testing:v1" }
  return {
    protocolVersion,
    requestId: `sandbox-conformance-${++nextRequest}`,
    sourceDigest: sourceDigest(identity),
    ...identity,
    input: input ?? null,
    signal: new AbortController().signal,
    deadlineMillis,
    limits: { cpuMillis: 1_000, subrequests: 1, outputBytes: 4_096 },
    capabilities: [],
  }
}

const withProvider = <A, E, LayerError>(
  options: Options<LayerError>,
  use: (provider: SandboxProviderService) => Effect.Effect<A, E, Scope.Scope>,
): Effect.Effect<A, E | LayerError> =>
  Effect.scoped(
    Layer.build(options.layer).pipe(
      Effect.flatMap((context) => {
        const provider = Context.get(context, SandboxProvider)
        return record({
          name: `sandbox:${options.name}`,
          capabilities: ["exec", "files", "pause", "resume", "snapshot", "fork", "limits"],
        }).pipe(Effect.andThen(use(provider)))
      }),
    ),
  )

const expectUnsupported = <A, R>(effect: Effect.Effect<A, SandboxError, R>, operation: Unsupported["operation"]) =>
  Effect.gen(function* () {
    const failure = yield* effect.pipe(Effect.flip)
    expect(Schema.is(Unsupported)(failure)).toBe(true)
    if (Schema.is(Unsupported)(failure)) expect(failure.operation).toBe(operation)
  })

const executeValue = (sandbox: SandboxService, source: string) =>
  Effect.gen(function* () {
    if (sandbox.capabilities.commands.includes("TypeScript")) {
      const result = yield* sandbox.exec({ _tag: "TypeScript", cellId: `cell-${++nextRequest}`, source })
      return (yield* Schema.decodeUnknownEffect(CellResult)(result.value)).value
    }
    if (sandbox.capabilities.commands.includes("JavaScriptModule")) {
      const now = yield* Clock.currentTimeMillis
      const request = moduleRequest(`export default () => (${source})`, undefined, now + 5_000)
      const result = yield* sandbox.exec({ _tag: "JavaScriptModule", request, capabilities })
      return (yield* Schema.decodeUnknownEffect(ProgramResult)(result.value)).output
    }
    const result = yield* sandbox.exec({ _tag: "Process", command: "printf", arguments: [source] })
    return result.stdout
  })

const command = (tag: Command["_tag"]): Effect.Effect<Command> =>
  Effect.gen(function* () {
    switch (tag) {
      case "Process":
        return { _tag: "Process", command: "printf", arguments: ["unsupported"] }
      case "TypeScript":
        return { _tag: "TypeScript", cellId: `unsupported-${++nextRequest}`, source: "42" }
      case "JavaScriptModule": {
        const now = yield* Clock.currentTimeMillis
        return {
          _tag: "JavaScriptModule",
          request: moduleRequest("export default () => 42", undefined, now + 5_000),
          capabilities,
        }
      }
    }
  })

const commandOperation = (tag: Command["_tag"]): Unsupported["operation"] => {
  switch (tag) {
    case "Process":
      return "exec:process"
    case "TypeScript":
      return "exec:typescript"
    case "JavaScriptModule":
      return "exec:javascript-module"
  }
}

/** @experimental Registers the authoritative Sandbox service conformance suite. */
export const sandbox = <E>(options: Options<E>): void => {
  describe(`Generalist Sandbox conformance (${options.name})`, () => {
    it.live("executes through its declared command and reports its factual isolation", () =>
      withProvider(options, (provider) =>
        Effect.gen(function* () {
          const service = yield* provider.acquire()
          expect(service.isolation).toBe(options.isolation)
          expect(service.capabilities.commands).not.toHaveLength(0)
          const expected = service.capabilities.commands.includes("JavaScriptModule") ? 42 : "42"
          expect(yield* executeValue(service, "42")).toBe(expected)
        }),
      ),
    )

    it.live("returns typed Unsupported for every undeclared command kind", () =>
      withProvider(options, (provider) =>
        Effect.gen(function* () {
          const service = yield* provider.acquire()
          for (const tag of ["Process", "TypeScript", "JavaScriptModule"] as const) {
            if (service.capabilities.commands.includes(tag)) continue
            yield* expectUnsupported(service.exec(yield* command(tag)), commandOperation(tag))
          }
        }),
      ),
    )

    it.live("streams ordered output when its command produces output", () =>
      withProvider(options, (provider) =>
        Effect.gen(function* () {
          const service = yield* provider.acquire()
          if (!service.capabilities.commands.includes("TypeScript")) {
            const now = yield* Clock.currentTimeMillis
            const events = yield* Stream.runCollect(
              service.stream({
                _tag: "JavaScriptModule",
                request: moduleRequest("export default () => 42", undefined, now + 5_000),
                capabilities,
              }),
            )
            expect(Array.from(events)).toEqual([])
            return
          }
          const events = yield* Stream.runCollect(
            service.stream({
              _tag: "TypeScript",
              cellId: `stream-${++nextRequest}`,
              source: "console.log('alpha'); 42",
            }),
          )
          expect(Array.from(events).some((event) => event._tag === "Output" && event.text.includes("alpha"))).toBe(true)
        }),
      ),
    )

    it.live("writes and reads files or returns typed Unsupported", () =>
      withProvider(options, (provider) =>
        Effect.gen(function* () {
          const service = yield* provider.acquire()
          if (!service.capabilities.files) return yield* expectUnsupported(service.files, "files")
          const files = yield* service.files
          yield* files.makeDirectory("conformance", { recursive: true })
          yield* files.writeFileString("conformance/file.txt", "sandbox-file")
          expect(yield* files.readFileString("conformance/file.txt")).toBe("sandbox-file")
        }),
      ),
    )

    it.live("pause and resume preserve files or report both operations as Unsupported", () =>
      withProvider(options, (provider) =>
        Effect.gen(function* () {
          const service = yield* provider.acquire()
          if (!service.capabilities.pause) {
            yield* expectUnsupported(service.pause, "pause")
            yield* expectUnsupported(service.resume, "resume")
            return
          }
          const files = yield* service.files
          yield* files.makeDirectory("conformance", { recursive: true })
          yield* files.writeFileString("conformance/pause.txt", "retained")
          yield* service.pause
          yield* service.resume
          expect(yield* files.readFileString("conformance/pause.txt")).toBe("retained")
        }),
      ),
    )

    it.live("forks isolated state from a snapshot or reports both operations as Unsupported", () =>
      withProvider(options, (provider) =>
        Effect.gen(function* () {
          const service = yield* provider.acquire()
          if (!service.capabilities.snapshot) {
            yield* expectUnsupported(service.snapshot, "snapshot")
            yield* expectUnsupported(service.fork("missing"), "fork")
            return
          }
          expect(service.capabilities.commands).toContain("TypeScript")
          expect(yield* executeValue(service, "let sandboxCounter = 41; sandboxCounter")).toBe("41")
          const snapshotId = yield* service.snapshot
          const fork = yield* service.fork(snapshotId)
          expect(yield* executeValue(fork, "sandboxCounter += 1")).toBe("42")
          expect(yield* executeValue(service, "sandboxCounter")).toBe("41")
        }),
      ),
    )

    it.live("enforces declared limits and rejects unsupported limits", () =>
      withProvider(options, (provider) =>
        Effect.gen(function* () {
          const baseline = yield* provider.acquire()
          if (baseline.capabilities.limits.includes("cpu")) {
            expect((yield* provider.acquire({ limits: { cpuMs: 1 } })).limits.cpuMs).toBe(1)
          } else {
            yield* expectUnsupported(provider.acquire({ limits: { cpuMs: 1 } }), "limit:cpu")
          }
          if (baseline.capabilities.limits.includes("memory")) {
            expect((yield* provider.acquire({ limits: { memoryMb: 1 } })).limits.memoryMb).toBe(1)
          } else {
            yield* expectUnsupported(provider.acquire({ limits: { memoryMb: 1 } }), "limit:memory")
          }

          if (!baseline.capabilities.limits.includes("wall-clock")) return
          const service = yield* provider.acquire({ limits: { wallClock: Duration.millis(25) } })
          const failure = service.capabilities.commands.includes("TypeScript")
            ? yield* service
                .exec({
                  _tag: "TypeScript",
                  cellId: `limit-${++nextRequest}`,
                  source: "await new Promise(() => {})",
                })
                .pipe(Effect.flip)
            : yield* Effect.gen(function* () {
                const now = yield* Clock.currentTimeMillis
                return yield* service
                  .exec({
                    _tag: "JavaScriptModule",
                    request: moduleRequest("export default () => new Promise(() => {})", undefined, now + 25),
                    capabilities,
                  })
                  .pipe(Effect.flip)
              })
          expect(Schema.is(LimitExceeded)(failure)).toBe(true)
          if (Schema.is(LimitExceeded)(failure)) expect(failure.resource).toBe("wall-clock")
        }),
      ),
    )
  })
}
