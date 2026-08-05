import { Console, Effect, Layer } from "effect"
import { BunServices } from "@effect/platform-bun"
import { SkillSource } from "@batonfx/core"
import { SkillLoader } from "@batonfx/skills"

const skillLayer = SkillLoader.layer({ cwd: ".", roots: [] }).pipe(Layer.provide(BunServices.layer))

const program = SkillSource.SkillSource.use((source) =>
  source.all.pipe(Effect.flatMap((skills) => Console.log(`discovered ${skills.length} skills`))),
).pipe(Effect.provide(skillLayer))

await Effect.runPromise(program)
