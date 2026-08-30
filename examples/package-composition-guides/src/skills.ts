import { Console, Effect, Layer, ManagedRuntime } from "effect"
import { BunServices } from "@effect/platform-bun"
import { SkillCatalog } from "tenetkit"
import { FileSystemCatalog } from "tenetkit/skills"

const skillLayer = FileSystemCatalog.layer({ cwd: ".", roots: [] }).pipe(Layer.provide(BunServices.layer))

const program = SkillCatalog.SkillCatalog.use((source) =>
  source.all.pipe(Effect.flatMap((skills) => Console.log(`discovered ${skills.length} skills`))),
)

const runtime = ManagedRuntime.make(skillLayer)
await runtime.runPromise(program)
