import { Console, Effect, Layer } from "effect"
import { Permissions } from "@batonfx/core"

export const interactiveLayer: Layer.Layer<Permissions.Permissions> = Permissions.interactive({
  ruleset: {
    rules: [
      { pattern: "read_*", level: "allow" },
      { pattern: "deploy_*", level: "ask" },
    ],
    fallback: "ask",
  },
  onAsk: (pending) =>
    Console.log(`Allow ${pending.tool} with ${JSON.stringify(pending.params)}? [y/N/always]`).pipe(
      Effect.as<Permissions.Answer>({ _tag: "Always" }),
    ),
})

export const ruleStoreLayer: Layer.Layer<Permissions.RuleStore> = Permissions.ruleStoreMemory([
  { pattern: "read_*", level: "allow" },
])
