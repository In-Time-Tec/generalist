import { Console, Effect, Layer, ManagedRuntime } from "effect"
import { BunServices } from "@effect/platform-bun"
import { SkillSource } from "tenetkit"
import { SkillLoader } from "tenetkit/skills"

const skillLayer = SkillLoader.layer({ cwd: ".", roots: [] }).pipe(Layer.provide(BunServices.layer))

const program = SkillSource.SkillSource.use((source) =>
  source.all.pipe(Effect.flatMap((skills) => Console.log(`discovered ${skills.length} skills`))),
)

const runtime = ManagedRuntime.make(skillLayer)
await runtime.runPromise(program)
