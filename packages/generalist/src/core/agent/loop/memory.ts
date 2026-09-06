import { Effect, Option, Schema } from "effect"
import { Prompt } from "effect/unstable/ai"
import { type Key, type Memory, type MemoryError, projectTranscript } from "../../context/memory.js"
import { type Entry, type SessionStore, buildMemoryContext } from "../../context/session.js"
import { operationKey } from "../../durable/driver/interpreter.js"
import { intercept } from "../../durable/driver/run.js"
import { RunError } from "../run/error.js"
import type { AgentError } from "../event.js"
import { type RecallInput, type RememberInput, RunSupport } from "./run-support.js"
import { DriverStateInvalid } from "../../durable/service.js"
import type { DriverCheckpoint } from "../../durable/driver/contract.js"
import { LoopDriverState } from "../../durable/loop-driver-state.js"

const Remember = Schema.Struct({ turn: Schema.Finite, terminal: Schema.Boolean })
export const pendingRemember = (checkpoint: DriverCheckpoint | undefined) =>
  Effect.gen(function* () {
    if (checkpoint === undefined) return undefined
    const state = yield* Schema.decodeUnknownEffect(LoopDriverState)(checkpoint.state).pipe(
      Effect.mapError((error) => DriverStateInvalid.make({ message: String(error) })),
    )
    return state.pending?.kind === "memory" && Schema.is(Remember)(state.pending.input)
      ? state.pending.input
      : undefined
  })

/** Memory operations share their live and recovered identities. */
export const make = (options: {
  readonly logicalId: string
  readonly runId: string
  readonly activeSession: Option.Option<SessionStore>
  readonly runtime: { readonly key: Key; readonly service: typeof Memory.Service } | undefined
  readonly memoryError: (turn: number, error: MemoryError) => AgentError
}) => {
  const { logicalId, runId, activeSession, runtime, memoryError } = options
  return {
    recallInitialPrompt: (prompt: Prompt.Prompt) =>
      Effect.gen(function* () {
        const recallEffect =
          runtime === undefined
            ? Effect.succeed(prompt)
            : runtime.service.recall({ key: runtime.key, turn: 0, prompt }).pipe(
                Effect.mapError((error) => memoryError(0, error)),
                Effect.map((items) => RunSupport.insertRecalledItems(prompt, items)),
              )
        const input: RecallInput = { turn: 0 }
        if (runtime !== undefined) input.key = runtime.key
        return yield* intercept(
          {
            kind: "memory",
            key: operationKey(logicalId, "memory", "recall", 0),
            input,
            replayPolicy: "pure",
            success: Prompt.Prompt,
            failure: RunError,
          },
          recallEffect,
        )
      }),
    rememberTurn: (turn: number, transcript: Prompt.Prompt, terminal: boolean, path: ReadonlyArray<Entry>) =>
      Effect.gen(function* () {
        const rememberEffect =
          runtime === undefined
            ? Effect.void
            : runtime.service
                .remember({
                  key: runtime.key,
                  turn,
                  transcript: Option.isSome(activeSession) ? buildMemoryContext(path) : projectTranscript(transcript),
                  terminal,
                  evidence: [{ runId, turn }],
                })
                .pipe(Effect.mapError((error) => memoryError(turn, error)))
        const input: RememberInput = { turn, terminal }
        if (runtime !== undefined) input.key = runtime.key
        yield* intercept(
          {
            kind: "memory",
            key: operationKey(logicalId, "memory", "remember", turn, terminal ? 1 : 0),
            turn,
            input,
            replayPolicy: "pure",
            success: Schema.Void,
            failure: RunError,
          },
          rememberEffect,
        )
      }),
  }
}
