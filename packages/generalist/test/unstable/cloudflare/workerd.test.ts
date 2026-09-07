import { layer as bunLayer } from "@effect/platform-bun/BunServices"
import { expect, layer } from "@effect/vitest"
import { Effect, FileSystem, Path, Schema } from "effect"
import { build } from "esbuild"
import { Miniflare } from "miniflare"

const ConformanceResponse = Schema.Struct({
  sequence: Schema.Finite,
  priorCancellationStatus: Schema.optionalKey(Schema.Literal("cancelled")),
  cancellationRequestedStatus: Schema.Literal("cancelling"),
  cancellationTerminalStatus: Schema.Literal("cancelled"),
  alarm: Schema.Literal(4_000_000_000_000),
  pluralInitialOrder: Schema.Tuple([Schema.Literal("a"), Schema.Literal("b"), Schema.Literal("c")]),
  pluralRemainingAfterOutOfOrder: Schema.Tuple([Schema.Literal("b")]),
  pluralConflictingTag: Schema.Literal("generalist/runtime/ResponseConflict"),
  pluralFinalOpen: Schema.Literal(0),
  pluralResumeEvents: Schema.Literal(3),
  acknowledgementInitialSequence: Schema.Literal(-1),
  acknowledgedSequence: Schema.Finite,
  acknowledgementInvalidTag: Schema.Literal("generalist/runtime/AckInvalid"),
  acknowledgementBeyondTag: Schema.Literal("generalist/runtime/AckBeyondCommitted"),
  acknowledgementTailSequences: Schema.Tuple([Schema.Finite]),
})

const AgentConformanceResponse = Schema.Struct({
  objective: Schema.Literal("Arrange service"),
  facts: Schema.Array(Schema.Literal("Provider serves Boise")),
  lookupExecutions: Schema.Literal(1),
  denied: Schema.Literal(true),
  deniedExecutions: Schema.Literal(0),
  budgetExhausted: Schema.Literal(true),
  budgetModelRequests: Schema.Literal(1),
  openRouterBundled: Schema.Literal(true),
})

layer(bunLayer, { excludeTestServices: true, timeout: 60_000 })("Miniflare native R2 host", (it) => {
  it.effect("recovers from R2 after discarding every Durable Object and process cache", () =>
    Effect.gen(function* () {
      const fileSystem = yield* FileSystem.FileSystem
      const path = yield* Path.Path
      const directory = yield* fileSystem.makeTempDirectoryScoped({ prefix: "generalist-r2-host-" })
      const bundle = yield* Effect.tryPromise(() => build({
        entryPoints: [path.resolve("packages/generalist/test/unstable/cloudflare/workerd/worker.ts")],
        bundle: true,
        format: "esm",
        logLevel: "silent",
        write: false,
        platform: "browser",
        target: "es2022",
      }))
      const script = bundle.outputFiles[0]!.text
      for (const sequence of [1, 2]) {
        yield* Effect.scoped(Effect.gen(function* () {
          const worker = yield* Effect.acquireRelease(
            Effect.sync(() => new Miniflare({
              modules: true,
              script,
              compatibilityDate: "2026-08-19",
              r2Buckets: ["BUCKET"],
              r2Persist: path.join(directory, "bucket"),
              durableObjects: { OBJECTS: "RuntimeObject" },
              // Each host gets empty local storage; only the canonical bucket survives.
              durableObjectsPersist: path.join(directory, `host-${sequence}`),
            })),
            (worker) => Effect.promise(() => worker.dispose()),
          )
          yield* Effect.promise(() => worker.ready)
          const response = yield* Effect.promise(() => worker.dispatchFetch(`http://host/?sequence=${sequence}`))
          expect(response.status).toBe(200)
          const result = yield* Effect.promise(() => response.json()).pipe(
            Effect.flatMap(Schema.decodeUnknownEffect(ConformanceResponse)),
          )
          expect(result.sequence).toBe(sequence)
          expect(result.priorCancellationStatus).toBe(sequence === 1 ? undefined : "cancelled")
          expect(result.acknowledgementTailSequences).toEqual([result.acknowledgedSequence + 1])
          const agentResponse = yield* Effect.promise(() => worker.dispatchFetch("http://host/agent"))
          expect(agentResponse.status).toBe(200)
          const agent = yield* Effect.promise(() => agentResponse.json()).pipe(
            Effect.flatMap(Schema.decodeUnknownEffect(AgentConformanceResponse)),
          )
          expect(agent.facts).toEqual(["Provider serves Boise"])
        }))
      }
    }),
  )
})
