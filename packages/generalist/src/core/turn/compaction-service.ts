import { Context, type Effect, type Option, Schema } from "effect"
import { LanguageModel, Prompt } from "effect/unstable/ai"
import type { Entry } from "../context/session.js"
import { withCompactionLifecycle } from "./compaction-telemetry.js"

/** @experimental Token accounting for a compaction decision. */
export interface Usage {
  readonly contextTokens: number
  readonly contextWindow: number
  readonly reserveTokens: number
}

/** @experimental Default recent-session suffix target kept verbatim. */
export const defaultKeepRecentTokens = 20_000

/** @experimental What to keep verbatim and what the summary replaces. */
export interface Plan {
  readonly keep: Prompt.Prompt
  readonly compact: Prompt.Prompt
  readonly recent: Prompt.Prompt
}

/** @experimental Request passed to a compaction implementation. */
export interface Request {
  readonly compactionId: string
  readonly agentName: string
  readonly sessionId: string
  /** Durable run identity. Keys the unchanged-threshold cache so concurrent runs never share an entry. */
  readonly runId?: string
  readonly turn: number
  readonly history: Prompt.Prompt
  readonly prompt: Prompt.Prompt
  readonly path?: ReadonlyArray<Entry>
  readonly usage: Usage
  readonly overflow: boolean
  readonly toolOutputMaxBytes?: number
}

/** @experimental Compaction result applied by the agent loop. */
export const Result = Schema.Union([
  Schema.TaggedStruct("Microcompact", { history: Prompt.Prompt, prompt: Prompt.Prompt }),
  Schema.TaggedStruct("Summarize", { history: Prompt.Prompt, prompt: Prompt.Prompt, summary: Schema.String }),
])
/** @experimental */
export type Result = typeof Result.Type
/** @experimental Result from tool-output microcompaction. */
export type MicrocompactResult = Extract<Result, { readonly _tag: "Microcompact" }>
/** @experimental Result from summary checkpointing. */
export type SummarizeResult = Extract<Result, { readonly _tag: "Summarize" }>

/** @experimental Compaction service failure. */
export class CompactionError extends Schema.TaggedError<CompactionError>()("generalist/core/CompactionError", {
  message: Schema.String,
  cause: Schema.optionalKey(Schema.Defect()),
}) {}

/** @experimental Compaction service boundary consulted by the loop. */
export interface Service {
  readonly willCompact?: (input: { readonly usage: Usage; readonly overflow: boolean }) => boolean
  readonly maybeCompact: (
    request: Request,
  ) => Effect.Effect<Option.Option<Result>, CompactionError, LanguageModel.LanguageModel>
}

/** @experimental */
export class Compaction extends Context.Service<Compaction, Service>()(
  "generalist/core/turn/compaction-service/Compaction",
) {}

/** @experimental Wrap custom work after deciding to run; changed results must use this to join their lifecycle. */
export const withLifecycle =
  (request: Request) =>
  <A extends Result, E, R>(work: Effect.Effect<Option.Option<A>, E, R>): Effect.Effect<Option.Option<Result>, E, R> =>
    withCompactionLifecycle(work, request, request.usage)

/** @internal */
export const microcompactResult = (input: {
  readonly history: Prompt.Prompt
  readonly prompt: Prompt.Prompt
}): MicrocompactResult => ({ _tag: "Microcompact", history: input.history, prompt: input.prompt })
