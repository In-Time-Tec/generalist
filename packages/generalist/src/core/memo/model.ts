import { Effect, Exit, Option, Schema, Stream } from "effect"
import { LanguageModel, Model, Prompt, type Response } from "effect/unstable/ai"
import { promptDigest } from "../agent/prompt-identity.js"
import { digest } from "../durable/canonical-json.js"
import { adapt, type BroadTools } from "../model/service.js"
import { Dependencies, Store } from "./service.js"

const CachedParts = Schema.Array(Schema.Unknown)
const FinishPart = Schema.Struct({ type: Schema.Literal("finish") })

export const memoizeModel = (run: string) => (model: LanguageModel.Service) =>
  adapt(model, {
    streamText: (options, invoke) =>
      Stream.unwrap(
        Effect.gen(function* () {
          const store = yield* Effect.serviceOption(Store)
          const dependencies = yield* Effect.serviceOption(Dependencies)
          const provider = yield* Effect.serviceOption(Model.ProviderName)
          const modelName = yield* Effect.serviceOption(Model.ModelName)
          if (
            Option.isNone(store) ||
            !store.value.modelsEnabled ||
            Option.isNone(dependencies) ||
            Option.isNone(provider) ||
            Option.isNone(modelName)
          ) {
            return invoke()
          }
          const prompt = Prompt.make(options.prompt)
          const key = digest({
            kind: "model",
            provider: provider.value,
            model: modelName.value,
            prompt: promptDigest(prompt.content),
            tenant: dependencies.value.tenant,
            capabilityScope: dependencies.value.capabilityScope,
          })
          const cached = yield* store.value.get(key)
          if (Option.isSome(cached)) {
            const parts = Schema.decodeUnknownOption(CachedParts)(cached.value.value)
            if (Option.isSome(parts) && parts.value.some(Schema.is(FinishPart))) {
              // SAFETY: this store entry was written only after observing Response.StreamPart values and a finish part.
              // oxlint-disable-next-line typescript/no-unsafe-type-assertion
              return Stream.fromIterable(parts.value as ReadonlyArray<Response.StreamPart<BroadTools>>)
            }
          }
          const observed: Array<unknown> = []
          return invoke().pipe(
            Stream.tap((part) => Effect.sync(() => observed.push(part))),
            Stream.onExit((exit) =>
              Exit.isFailure(exit) || !observed.some(Schema.is(FinishPart))
                ? Effect.void
                : store.value.put(key, {
                    value: observed,
                    fromRun: run,
                    fromOperation: `model:${key}`,
                    expiresAtMillis: Number.MAX_SAFE_INTEGER,
                  }),
            ),
          )
        }),
      ),
  })
