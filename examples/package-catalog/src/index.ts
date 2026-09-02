import { BunServices } from "@effect/platform-bun"
import { Console, Effect, Layer, ManagedRuntime, Stream } from "effect"
import { FetchHttpClient } from "effect/unstable/http"
import { LanguageModel, Response } from "effect/unstable/ai"
import { Agent, Approvals, ModelMiddleware, Permissions, SkillCatalog } from "generalist"
import { layer as layerInstructions, PackageCatalog } from "generalist/instructions"

const packages = PackageCatalog.layer({
  packages: ["@in-time-tec/generalist-skills-example@^1"],
  cacheDir: ".generalist/packages",
  lock: ".generalist/packages.lock",
  allowTools: true,
})

const usage = Response.Usage.make({
  inputTokens: { uncached: 0, total: 0, cacheRead: 0, cacheWrite: 0 },
  outputTokens: { total: 0, text: 0, reasoning: 0 },
})

const finish = (reason: Response.FinishReason) => Response.makePart("finish", { reason, usage, response: undefined })

let calls = 0

const scriptedModel = Layer.effect(
  LanguageModel.LanguageModel,
  LanguageModel.make({
    generateText: () => Effect.succeed([{ type: "text", text: "unused" }]),
    streamText: () => {
      calls += 1
      return calls === 1
        ? Stream.make(
            Response.makePart("tool-call", {
              id: "echo-1",
              name: "package_echo",
              params: { text: "installed" },
              providerExecuted: false,
            }),
            finish("tool-calls"),
          )
        : Stream.make(
            Response.makePart("text-delta", { id: "assistant", delta: "The package tool echoed: installed" }),
            finish("stop"),
          )
    },
  }),
)

const installed = Layer.unwrap(
  Effect.map(PackageCatalog.PackageCatalog, (catalog) =>
    Layer.mergeAll(
      layerInstructions(catalog.instructions),
      SkillCatalog.layer([Effect.succeed(catalog.skills)]),
      catalog.handlers,
    ),
  ),
).pipe(Layer.provideMerge(packages), Layer.provide(Layer.merge(BunServices.layer, FetchHttpClient.layer)))

const program = Effect.gen(function* () {
  const catalog = yield* PackageCatalog.PackageCatalog
  const agent = Agent.make({
    name: "package-catalog-example",
    instructions: "Use the installed package tools when they fit the request.",
    toolkit: catalog.toolkit,
  })
  const answer = yield* Agent.run(agent, "Echo the word installed through the package tool.")
  yield* Console.log(answer)
})

const runtime = ManagedRuntime.make(
  Layer.mergeAll(
    installed,
    scriptedModel,
    Permissions.layerAllowAll,
    Approvals.layerAutoApprove,
    ModelMiddleware.layerIdentity,
  ),
)
await runtime.runPromise(program)
