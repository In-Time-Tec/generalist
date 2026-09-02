import { Context, Duration, Effect, Option, Schema } from "effect"
import type { Tool } from "effect/unstable/ai"
import { digest } from "../durable/canonical-json.js"
import { Outcome } from "../tools/tool-result-codec.js"
import { type Registry, get } from "../tools/tool-registry.js"
import { Dependencies, Store, expiresAt, type Provenance } from "./service.js"

export interface PureOptions {
  readonly ttl: Duration.Input
  readonly dependsOn?: ReadonlyArray<string>
}

class Pure extends Context.Service<Pure, PureOptions>()("generalist/core/memo/tool/Pure") {}

export const pure =
  (options: PureOptions) =>
  <
    Name extends string,
    Config extends {
      readonly parameters: Schema.Constraint
      readonly success: Schema.Constraint
      readonly failure: Schema.Constraint
      readonly failureMode: Tool.FailureMode
    },
    Requirements,
  >(
    tool: Tool.Tool<Name, Config, Requirements>,
  ): Tool.Tool<Name, Config, Requirements> => {
    const ttl = Duration.fromInputUnsafe(options.ttl)
    if (!Duration.isFinite(ttl) || Duration.toMillis(ttl) <= 0)
      throw new TypeError("Memo.pure ttl must be positive and finite")
    return tool.annotate(Pure, { ttl, dependsOn: [...(options.dependsOn ?? [])] })
  }

export const declaration = (tool: Tool.Any): Option.Option<PureOptions> => Context.getOption(tool.annotations, Pure)

export const memoize = <E, R>(input: {
  readonly tool: Tool.Any
  readonly params: unknown
  readonly run: string
  readonly operation: string
  readonly execute: Effect.Effect<Outcome, E, R>
}) =>
  Effect.gen(function* () {
    const configured = declaration(input.tool)
    if (Option.isNone(configured)) return yield* input.execute
    const store = yield* Effect.serviceOption(Store)
    const dependencies = yield* Effect.serviceOption(Dependencies)
    if (Option.isNone(store) || Option.isNone(dependencies)) return yield* input.execute
    const args = Schema.decodeUnknownOption(Schema.Json)(input.params)
    if (Option.isNone(args)) return yield* input.execute
    const versions = yield* Effect.forEach(configured.value.dependsOn ?? [], (name) =>
      dependencies.value.version(name).pipe(Effect.map((version) => [name, version] as const)),
    )
    const key = digest({
      kind: "tool",
      tool: String(input.tool.name),
      args: args.value,
      dependencies: Object.fromEntries(versions),
      tenant: dependencies.value.tenant,
      capabilityScope: dependencies.value.capabilityScope,
    })
    const cached = yield* store.value.get(key)
    if (Option.isSome(cached)) {
      const decoded = Schema.decodeUnknownOption(Outcome)(cached.value.value)
      if (Option.isSome(decoded) && decoded.value._tag === "Success") {
        return { ...decoded.value, memoized: source(cached.value) }
      }
    }
    const outcome = yield* input.execute
    if (outcome._tag === "Success") {
      yield* store.value.put(key, {
        value: outcome,
        fromRun: input.run,
        fromOperation: input.operation,
        expiresAtMillis: yield* expiresAt(configured.value.ttl),
      })
    }
    return outcome
  })

const source = (entry: Provenance): Provenance => ({
  fromRun: entry.fromRun,
  fromOperation: entry.fromOperation,
})

export const memoizeRegistered = <E, R>(input: {
  readonly registry: Registry
  readonly name: string
  readonly skillActivation: boolean
  readonly handoff: boolean
  readonly params: unknown
  readonly run: string
  readonly operation: string
  readonly execute: Effect.Effect<Outcome, E, R>
}): Effect.Effect<Outcome, E, R> => {
  const tool = get(input.registry, input.name)?.tool
  return tool === undefined || input.skillActivation || input.handoff ? input.execute : memoize({ ...input, tool })
}
