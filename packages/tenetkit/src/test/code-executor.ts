/* oxlint-disable effecttsgo/abort-controller-in-effect, effecttsgo/global-date */
import { describe, expect, it } from "@effect/vitest"
import { Clock, Context, Effect, Fiber, Layer, Schema, Scope } from "effect"
import { ProgramCapabilities, ProgramCapabilityMissing } from "../core/program/capabilities.js"
import {
  admit,
  Identity,
  protocolVersion,
  SandboxCancelled,
  SandboxDeadlineExceeded,
  CodeExecutor,
  SandboxInputInvalid,
  SandboxSourceInvalid,
  sourceDigest,
  testIdentity,
  type ExecutionFailure,
  type Service,
  type Request,
  type Result,
} from "../core/program/code-executor.js"

/** @experimental Small provider seam used by the public CodeExecutor conformance suite. */
export interface Options {
  readonly name: string
  readonly layer: Layer.Layer<CodeExecutor>
  /** Inspect provider-owned resources after every Exit. The assertion must observe zero live invocation resources. */
  readonly assertClean?: Effect.Effect<void>
}

const capabilities = ProgramCapabilities.of({
  discoverTools: Effect.succeed([{ name: "echo" }, { name: "hidden" }]),
  describeTool: (name) =>
    name === "echo"
      ? Effect.succeed({ name, inputSchema: {}, outputSchema: {} })
      : Effect.fail(ProgramCapabilityMissing.make({ capability: name })),
  callTool: (input) => Effect.succeed(input.input),
  callStep: (input) => Effect.succeed(input.input),
  runAgent: () => Effect.die("unused conformance capability"),
  mapAgents: () => Effect.die("unused conformance capability"),
  fanOutAgents: () => Effect.die("unused conformance capability"),
  log: () => Effect.void,
})

const request = (source: string, input: Request["input"] = { value: 1 }, overrides: Partial<Request> = {}): Request => {
  const modules = [{ name: "program.js", source }]
  const identity = { modules, entrypoint: "program.js", inputCodec: "input:v1", outputCodec: "output:v1" }
  return {
    protocolVersion,
    requestId: "conformance:request",
    sourceDigest: sourceDigest(identity),
    ...identity,
    input,
    signal: new AbortController().signal,
    deadlineMillis: 60_000,
    limits: { cpuMillis: 1_000, subrequests: 8, outputBytes: 4_096 },
    capabilities: [{ operation: "callTool", names: ["echo"] }],
    ...overrides,
  }
}

const provide = <A, E>(
  options: Options,
  use: (executor: Service) => Effect.Effect<A, E, Scope.Scope>,
): Effect.Effect<A, E> =>
  Effect.scoped(
    Effect.flatMap(Layer.build(options.layer), (context) =>
      use(Context.get(context, CodeExecutor)).pipe(Effect.onExit(() => options.assertClean ?? Effect.void)),
    ),
  )

const execute = (options: Options, input: Request): Effect.Effect<Result, ExecutionFailure> =>
  provide(options, (executor) => executor.execute(input).pipe(Effect.provideService(ProgramCapabilities, capabilities)))

/**
 * @experimental Register protocol and observable isolation requirements against a provider's public execute boundary.
 *
 * These tests prove request/result semantics and provider behavior observable through that boundary. They do not prove
 * a vendor's physical isolate, microVM, or hypervisor implementation; providers must document that evidence separately.
 */
export const codeExecutorConformance = (options: Options): void => {
  interface CircularInput {
    self?: CircularInput
  }

  describe(`${options.name} CodeExecutor provider conformance`, () => {
    it.effect("declares persistable production identity and admits its exact request", () =>
      provide(options, (executor) =>
        Effect.gen(function* () {
          const encoded = yield* Schema.encodeEffect(Identity)(executor.identity)
          const decoded = yield* Schema.decodeEffect(Identity, { onExcessProperty: "error" })(encoded)
          expect(decoded).toEqual(executor.identity)
          expect(Object.isFrozen(executor.identity)).toBe(true)
          expect(Object.isFrozen(executor.identity.limits)).toBe(true)
          expect(Object.isFrozen(executor.identity.knownLimitations)).toBe(true)
          expect(executor.identity.physicalIsolation).not.toBe("trusted-test")
          expect(executor.identity.persistence).toBe("fresh-per-execution")
          expect(executor.identity.network.posture).toBe("default-deny")
          yield* admit(
            executor.identity,
            request("export default input => input", undefined, { deadlineMillis: 61_000 }),
            1_000,
          )
          expect(
            yield* admit(
              testIdentity,
              request("export default input => input", undefined, { deadlineMillis: 61_000 }),
              1_000,
            ).pipe(Effect.flip),
          ).toMatchObject({
            _tag: "@tenetkit/core/SandboxGuaranteeUnavailable",
            guarantee: "physicalIsolation",
          })
        }),
      ),
    )

    it.effect("returns exact result identity and a fresh global and module namespace", () =>
      Effect.gen(function* () {
        const source = `
globalThis.__tenetkitConformance = (globalThis.__tenetkitConformance ?? 0) + 1;
export default input => ({ input, global: globalThis.__tenetkitConformance });`
        const first = yield* execute(options, request(source, { run: 1 }, { requestId: "fresh:1" }))
        const second = yield* execute(options, request(source, { run: 2 }, { requestId: "fresh:2" }))
        expect(first).toMatchObject({
          protocolVersion: "1",
          requestId: "fresh:1",
          inputCodec: "input:v1",
          outputCodec: "output:v1",
          output: { input: { run: 1 }, global: 1 },
        })
        expect(second).toMatchObject({ requestId: "fresh:2", output: { input: { run: 2 }, global: 1 } })
      }),
    )

    it.effect("closes capability authority to the exact operation and name grants", () =>
      Effect.gen(function* () {
        const result = yield* execute(
          options,
          request(`
export default async (_input, capabilities) => {
  const allowed = await capabilities.call("callTool", { operation: "allowed", tool: "echo", input: "ok" });
  let denied = false;
  try {
    await capabilities.call("callTool", { operation: "denied", tool: "hidden", input: "no" });
  } catch {
    denied = true;
  }
  return { allowed, denied };
};`),
        )
        expect(result.output).toEqual({ allowed: "ok", denied: true })
      }),
    )

    it.effect("denies ambient credentials, host process objects, network, and filesystem imports", () =>
      Effect.gen(function* () {
        const result = yield* execute(
          options,
          request(`
export default async () => {
  let networkDenied = false;
  try { await fetch("https://example.com/"); } catch { networkDenied = true; }
  return {
    process: typeof globalThis.process,
    bun: typeof globalThis.Bun,
    require: typeof globalThis.require,
    ambientSecret: typeof globalThis.TENETKIT_CONFORMANCE_SECRET,
    networkDenied
  };
};`),
        )
        expect(result.output).toEqual({
          process: "undefined",
          bun: "undefined",
          require: "undefined",
          ambientSecret: "undefined",
          networkDenied: true,
        })

        const imported = request('import "node:fs"; export default () => null')
        expect(yield* execute(options, imported).pipe(Effect.flip)).toBeInstanceOf(SandboxSourceInvalid)
      }),
    )

    it.effect("rejects malformed source and input before evaluation", () =>
      Effect.gen(function* () {
        expect(yield* execute(options, request("export default (")).pipe(Effect.flip)).toBeInstanceOf(
          SandboxSourceInvalid,
        )
        const circular: CircularInput = {}
        circular.self = circular
        expect(
          yield* execute(options, request("export default input => input", circular)).pipe(Effect.flip),
        ).toBeInstanceOf(SandboxInputInvalid)
      }),
    )

    it.effect("bounds output while streaming before result decoding", () =>
      Effect.gen(function* () {
        const failure = yield* execute(
          options,
          request('export default () => "x".repeat(4096)', undefined, {
            limits: { cpuMillis: 1_000, subrequests: 8, outputBytes: 128 },
          }),
        ).pipe(Effect.flip)
        expect(failure).toMatchObject({
          _tag: "@tenetkit/core/SandboxResourceExceeded",
          resource: "output",
          limit: 128,
        })
      }),
    )

    it.live("stops non-cooperative execution on caller cancellation and deadline", () =>
      Effect.gen(function* () {
        const source = "export default () => new Promise(() => {})"
        const controller = new AbortController()
        const now = yield* Clock.currentTimeMillis
        const cancelled = yield* execute(
          options,
          request(source, undefined, { signal: controller.signal, deadlineMillis: now + 60_000 }),
        ).pipe(Effect.forkChild)
        yield* Effect.sleep("10 millis")
        controller.abort()
        expect(yield* Fiber.join(cancelled).pipe(Effect.flip)).toBeInstanceOf(SandboxCancelled)

        const interrupted = yield* execute(options, request(source, undefined, { deadlineMillis: now + 60_000 })).pipe(
          Effect.forkChild,
        )
        yield* Effect.sleep("10 millis")
        yield* Fiber.interrupt(interrupted)

        expect(
          yield* execute(options, request(source, undefined, { deadlineMillis: now + 25 })).pipe(Effect.flip),
        ).toBeInstanceOf(SandboxDeadlineExceeded)
      }),
    )

    it.live("fences capability calls scheduled after termination", () =>
      Effect.gen(function* () {
        const now = yield* Clock.currentTimeMillis
        let calls = 0
        const observed = ProgramCapabilities.of({
          ...capabilities,
          callTool: (input) =>
            Effect.sync(() => {
              calls += 1
              return input.input
            }),
        })
        const input = request(
          `
export default (_input, capabilities) => {
  setTimeout(() => capabilities.call("callTool", {
    operation: "late", tool: "echo", input: "must-not-run"
  }).catch(() => {}), 10);
  return "done";
};`,
          undefined,
          { deadlineMillis: now + 60_000 },
        )
        yield* provide(options, (executor) =>
          executor.execute(input).pipe(Effect.provideService(ProgramCapabilities, observed)),
        )
        yield* Effect.sleep("50 millis")
        expect(calls).toBe(0)
      }),
    )
  })
}
