import { Console, Effect, Layer } from "effect"
import { Approvals, Permissions } from "tenetkit"

export const policyLayer = Layer.mergeAll(
  Permissions.layerRuleset({
    rules: [
      { pattern: "read_*", level: "allow" },
      { pattern: "deploy_*", level: "ask" },
    ],
    fallback: "ask",
  }),
  Approvals.layerTest({
    resolve: (pending) =>
      Console.log(`Allow ${pending.call.name} with ${JSON.stringify(pending.call.params)}? [y/N/always]`).pipe(
        Effect.as<Approvals.Resolution>({
          _tag: "Approved",
          remember: { pattern: pending.call.name, level: "allow" },
        }),
      ),
  }),
  Permissions.layerRuleStoreMemory([{ pattern: "read_*", level: "allow" }]),
) as unknown
