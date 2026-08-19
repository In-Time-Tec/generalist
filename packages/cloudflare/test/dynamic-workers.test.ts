/* oxlint-disable effecttsgo/async-function, effecttsgo/global-date */
import { expect, it } from "@effect/vitest"
import { Effect } from "effect"
import { ProgramCapabilities, SandboxExecutor } from "tenetkit"
import { make, type CapabilityRpc, type WorkerCode } from "@tenetkit/cloudflare/dynamic-workers"

const capabilities = ProgramCapabilities.ProgramCapabilities.of({
  discoverTools: Effect.succeed([]),
  describeTool: (name) => Effect.fail(ProgramCapabilities.ProgramCapabilityMissing.make({ capability: name })),
  callTool: (input) => Effect.succeed(input.input),
  callStep: (input) => Effect.succeed(input.input),
  runAgent: () => Effect.die("not used"),
  mapAgents: () => Effect.die("not used"),
  fanOutAgents: () => Effect.die("not used"),
  log: () => Effect.void,
})

const request = (signal = new AbortController().signal): SandboxExecutor.Request => {
  const modules = [{ name: "program.js", source: "export default async input => ({ value: input.value + 1 })" }]
  const identity = { modules, entrypoint: "program.js", inputCodec: "input:v1", outputCodec: "output:v1" }
  return {
    protocolVersion: "1",
    requestId: "run-1:attempt-1",
    sourceDigest: SandboxExecutor.sourceDigest(identity),
    ...identity,
    input: { value: 1 },
    signal,
    deadlineMillis: Date.now() + 10_000,
    limits: { cpuMillis: 50, subrequests: 3, outputBytes: 1_024 },
    capabilities: [{ operation: "callTool", names: ["echo"] }],
  }
}

it.effect("loads exact cold WorkerCode with only the capability binding and pinned constants", () =>
  Effect.gen(function* () {
    const loaded: Array<WorkerCode> = []
    const executor = make({
      compatibilityDate: "2026-08-19",
      capabilityBinding: (rpc) => rpc,
      loader: {
        load: (code) => {
          loaded.push(code)
          return {
            getEntrypoint: () => ({
              fetch: async (raw) => {
                const envelope = (await raw.json()) as { readonly input: unknown }
                return Response.json({
                  protocolVersion: "1",
                  requestId: code.env.TENET_REQUEST_ID,
                  sourceDigest: code.env.TENET_SOURCE_DIGEST,
                  inputCodec: code.env.TENET_INPUT_CODEC,
                  outputCodec: code.env.TENET_OUTPUT_CODEC,
                  output: envelope.input,
                })
              },
            }),
          }
        },
      },
    })
    const first = yield* executor
      .execute(request())
      .pipe(Effect.provideService(ProgramCapabilities.ProgramCapabilities, capabilities))
    const second = yield* executor
      .execute(request())
      .pipe(Effect.provideService(ProgramCapabilities.ProgramCapabilities, capabilities))
    expect(first.output).toEqual({ value: 1 })
    expect(loaded).toHaveLength(2)
    expect(loaded[0]).toMatchObject({
      compatibilityDate: "2026-08-19",
      mainModule: "__tenetkit_runner.js",
      globalOutbound: null,
      limits: { cpuMs: 50, subrequests: 3 },
    })
    expect(Object.keys(loaded[0]!.env).toSorted()).toEqual([
      "TENET_CAPABILITIES",
      "TENET_INPUT_CODEC",
      "TENET_OUTPUT_CODEC",
      "TENET_PROTOCOL_VERSION",
      "TENET_REQUEST_ID",
      "TENET_SOURCE_DIGEST",
    ])
    expect(second.requestId).toBe(first.requestId)
  }),
)

it.effect("rejects invalid source before WorkerLoader.load", () =>
  Effect.gen(function* () {
    let loads = 0
    const executor = make({
      compatibilityDate: "2026-08-19",
      capabilityBinding: (rpc: CapabilityRpc) => rpc,
      loader: {
        load: () => {
          loads += 1
          throw new Error("must not load")
        },
      },
    })
    const failure = yield* Effect.flip(
      executor
        .execute({ ...request(), sourceDigest: "invalid" })
        .pipe(Effect.provideService(ProgramCapabilities.ProgramCapabilities, capabilities)),
    )
    expect(failure).toBeInstanceOf(SandboxExecutor.SandboxSourceInvalid)
    expect(loads).toBe(0)
  }),
)
