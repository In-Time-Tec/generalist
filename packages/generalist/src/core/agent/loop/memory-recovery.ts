import { Effect, Ref, Stream } from "effect"
import { Prompt, Response } from "effect/unstable/ai"
import type { Event } from "../event.js"
import type { AgentRunState } from "../model-turn/provider-output-state.js"
import type { PendingToolResult } from "../tools/result.js"
import type { TurnOverrides } from "../../turn/policy.js"
import { DriverStateInvalid } from "../../durable/service.js"

/** Resume the turn after its remembered transcript, without redispatching model or tools. */
export const resume = <E, R>(input: {
  readonly turn: number
  readonly state: AgentRunState
  readonly history: Ref.Ref<Prompt.Prompt>
  readonly afterTurn: (
    turn: number,
    pending: ReadonlyArray<PendingToolResult>,
  ) => Effect.Effect<
    {
      readonly events: Stream.Stream<Event, E, R>
      readonly next?: { readonly prompt: Prompt.RawInput; readonly overrides?: TurnOverrides }
      readonly structuredTurn?: number
    },
    E,
    R
  >
  readonly runTurn: (turn: number, prompt: Prompt.RawInput, overrides?: TurnOverrides) => Stream.Stream<Event, E, R>
  readonly structuredFinalEvents: (
    turn: number,
    onPending: (input: { readonly prompt: Prompt.RawInput }) => void,
  ) => Stream.Stream<Event, E, R>
}) =>
  Stream.unwrap(
    Effect.gen(function* () {
      const { turn, state } = input
      const history = yield* Ref.get(input.history)
      const assistantIndex = history.content.findLastIndex((message) => message.role === "assistant")
      const assistant = history.content[assistantIndex]
      if (assistant?.role !== "assistant") {
        return yield* DriverStateInvalid.make({ message: "Pending remember has no committed assistant transcript" })
      }
      state.turn = turn
      state.text = assistant.content.flatMap((part) => (part.type === "text" ? [part.text] : [])).join("")
      const pending: Array<PendingToolResult> = []
      for (const message of history.content.slice(assistantIndex + 1)) {
        if (message.role !== "tool") break
        for (const part of message.content) {
          if (part.type !== "tool-result" || part.providerExecuted) continue
          pending.push(
            Object.assign(
              Response.toolResultPart({
                id: part.id,
                name: part.name,
                result: part.result,
                encodedResult: part.result,
                isFailure: part.isFailure,
                providerExecuted: false,
                preliminary: false,
                metadata: part.options,
              }),
              { taint: [] },
            ),
          )
        }
      }
      const result = yield* input.afterTurn(turn, pending)
      return Stream.concat(
        result.events,
        Stream.suspend(() => {
          if (result.next !== undefined) return input.runTurn(turn + 1, result.next.prompt, result.next.overrides)
          if (result.structuredTurn === undefined) return Stream.empty
          const finalTurn = result.structuredTurn
          let next: { readonly prompt: Prompt.RawInput } | undefined
          return Stream.concat(
            input.structuredFinalEvents(finalTurn, (continuation) => {
              next = continuation
            }),
            Stream.suspend(() => (next === undefined ? Stream.empty : input.runTurn(finalTurn + 1, next.prompt))),
          )
        }),
      )
    }),
  )
