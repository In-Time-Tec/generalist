import { Context, Effect, Layer, Scope } from "effect"
import { LanguageModel } from "effect/unstable/ai"
import type { StrategyPart } from "../../core/turn/compaction.js"
import { SandboxProvider } from "../../sandbox/service.js"
import { CurrentWriter, offloadStrategyPart, offloadWriter } from "./offload.js"
import { make } from "./model.js"
import { sandboxPool } from "./sandbox.js"

/** @experimental RLM model layers and recursion limits. */
export interface Options<RootError, RootRequirements, LeafError, LeafRequirements> {
  readonly root: Layer.Layer<LanguageModel.LanguageModel, RootError, RootRequirements>
  readonly leaf: Layer.Layer<LanguageModel.LanguageModel, LeafError, LeafRequirements>
  readonly maxDepth: number
  readonly maxSubCalls: number
}

/** @experimental Options for retaining recent context while moving older turns into the RLM Sandbox. */
export interface RlmOffloadOptions {
  readonly keepRecentTokens: number
}

const safeNonNegativeInteger = (name: string, value: number): number => {
  if (!Number.isSafeInteger(value) || value < 0) throw new TypeError(`${name} must be a non-negative safe integer`)
  return value
}

/** @experimental Provide a Recursive Language Model as an Effect AI LanguageModel. */
export const layer = <RootError, RootRequirements, LeafError, LeafRequirements>(
  options: Options<RootError, RootRequirements, LeafError, LeafRequirements>,
): Layer.Layer<
  LanguageModel.LanguageModel,
  RootError | LeafError,
  SandboxProvider | RootRequirements | LeafRequirements
> => {
  const maxDepth = safeNonNegativeInteger("Options.maxDepth", options.maxDepth)
  const maxSubCalls = safeNonNegativeInteger("Options.maxSubCalls", options.maxSubCalls)
  return Layer.effectContext(
    Effect.gen(function* () {
      const provider = yield* SandboxProvider
      const scope = yield* Scope.Scope
      const rootContext = yield* Layer.build(options.root)
      const leafContext = yield* Layer.build(options.leaf)
      const pool = yield* sandboxPool({ provider, scope })
      const model = yield* make({
        root: Context.get(rootContext, LanguageModel.LanguageModel),
        leaf: Context.get(leafContext, LanguageModel.LanguageModel),
        maxDepth,
        maxSubCalls,
        pool,
      })
      return Context.make(LanguageModel.LanguageModel, model).pipe(Context.add(CurrentWriter, offloadWriter(pool)))
    }),
  )
}

/** @experimental Move compacted turns into the RLM Sandbox instead of summarizing them. */
export const rlmOffload = (options: RlmOffloadOptions): StrategyPart =>
  offloadStrategyPart(safeNonNegativeInteger("RlmOffloadOptions.keepRecentTokens", options.keepRecentTokens))
