import { Effect, Layer, Schema } from "effect"
import { Agent, SkillCatalog } from "generalist"
import { layer as instructionsLayer, PackageCatalog } from "generalist/instructions"

export const packages = PackageCatalog.layer({
  packages: ["@in-time-tec/generalist-skills-example@^1"],
  cacheDir: ".generalist/packages",
  lock: ".generalist/packages.lock",
  allowTools: true,
  npmRegistryUrl: "http://127.0.0.1:4873",
})

export const services = (catalog: PackageCatalog.Service) =>
  Layer.mergeAll(instructionsLayer(catalog.instructions), SkillCatalog.layer([Effect.succeed(catalog.skills)]))

const tools = (catalog: PackageCatalog.Service) => catalog.executorLayer

const run = (catalog: PackageCatalog.Service) => {
  const agent = Agent.make({
    name: "package-catalog-example",
    input: Schema.Struct({ request: Schema.String }),
    output: Schema.String,
    toolkit: catalog.toolkit,
  })
  return Agent.run(agent, { request: "Confirm the installed package." })
}

void [run, tools]
