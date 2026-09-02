import { Context, Effect, Schema } from "effect"
import { Prompt } from "effect/unstable/ai"
import { digest } from "../../core/durable/canonical-json.js"
import type { StrategyPart } from "../../core/turn/compaction.js"
import { CompactionError, type Plan, type Request } from "../../core/turn/compaction-service.js"
import { offloadedContextPath, type Pool } from "./sandbox.js"

const markerPattern = /\[generalist:rlm-offload:([a-f0-9]+)\]/u
const OffloadedContext = Schema.Array(Prompt.Message)
const OffloadedContextJson = Schema.fromJsonString(OffloadedContext)

export interface Writer {
  readonly write: (plan: Plan, request: Request) => Effect.Effect<string, CompactionError>
}

export const CurrentWriter = Context.Reference<Writer | undefined>("generalist/unstable/rlm/CurrentWriter", {
  defaultValue: () => undefined,
})

export const markerKey = (prompt: Prompt.Prompt): string | undefined =>
  markerPattern.exec(JSON.stringify(prompt.content))?.[1]

const marker = (key: string): string =>
  [
    `[generalist:rlm-offload:${key}]`,
    "Older conversation turns are available in the RLM sandbox as the `offloadedContext` variable.",
    "Use `exec` to inspect that variable when the current question depends on older context.",
  ].join("\n")

const failure = (cause: unknown): CompactionError =>
  CompactionError.make({ message: "RLM could not offload compacted context to its Sandbox", cause })

export const offloadWriter = (pool: Pool): Writer => ({
  write: (plan, request) =>
    Effect.gen(function* () {
      const key = markerKey(plan.compact) ?? digest(request.compactionId)
      const sandbox = yield* pool.acquire(key)
      const files = yield* sandbox.files
      const existing = yield* files
        .readFileString(offloadedContextPath)
        .pipe(Effect.flatMap(Schema.decodeEffect(OffloadedContextJson)))
      const combined = [...existing, ...plan.compact.content]
      const encoded = yield* Schema.encodeEffect(OffloadedContextJson)(combined)
      yield* files.writeFileString(offloadedContextPath, encoded)
      return marker(key)
    }).pipe(Effect.mapError(failure)),
})

export const offloadStrategyPart = (keepRecentTokens: number): StrategyPart => ({
  keepRecentTokens,
  summarize: (plan, request) =>
    Effect.gen(function* () {
      const writer = yield* CurrentWriter
      if (writer === undefined) {
        return yield* CompactionError.make({
          message: "rlmOffload requires the Compaction effect to be provided with RLM.layer",
        })
      }
      return yield* writer.write(plan, request)
    }),
})
