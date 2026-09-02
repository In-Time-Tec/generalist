import { describe, expect, it } from "@effect/vitest"
import { Effect, Layer } from "effect"
import { RuleStore } from "../core/policy/permissions.js"
import { record } from "./report.js"

/** Configuration for the permission RuleStore conformance suite. */
export interface Options<E = never> {
  readonly layer: Layer.Layer<RuleStore, E, never>
}

const provide = <A, E, LayerError>(options: Options<LayerError>, effect: Effect.Effect<A, E, RuleStore>) =>
  Effect.scoped(
    Layer.build(options.layer).pipe(Effect.flatMap((context) => effect.pipe(Effect.provideContext(context)))),
  )

/** Registers the authoritative permission RuleStore conformance suite. */
export const ruleStore = <E>(options: Options<E>): void => {
  describe("Generalist RuleStore conformance", () => {
    it.effect("retains concurrent writes and replaces an identical pattern", () =>
      provide(
        options,
        record({ name: "ruleStore", capabilities: ["remember", "rules", "replace-pattern"] }).pipe(
          Effect.andThen(
            Effect.gen(function* () {
              const store = yield* RuleStore
              const rules = Array.from({ length: 16 }, (_, index) => ({
                pattern: `testing-tool-${index}`,
                level: "allow" as const,
              }))
              yield* Effect.all(rules.map(store.remember), { concurrency: 4 })
              yield* store.remember({ pattern: "testing-tool-0", level: "deny", reason: "revoked" })
              const remembered = yield* store.rules
              expect(remembered).toHaveLength(16)
              expect(remembered.filter((rule) => rule.pattern === "testing-tool-0")).toEqual([
                { pattern: "testing-tool-0", level: "deny", reason: "revoked" },
              ])
            }),
          ),
        ),
      ),
    )
  })
}
