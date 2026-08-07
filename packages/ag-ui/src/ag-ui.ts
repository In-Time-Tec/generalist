import { RunAgentInputSchema, type AGUIEvent, type RunAgentInput } from "@ag-ui/core"
import { Context, Effect, Layer, Schema, Stream } from "effect"
import { Cursor, type Address, Errors, Runtime } from "@batonfx/runtime"
import { EventInvalid, InputMalformed, InputRejected, ResumeMismatch, type ValueNotSerializable } from "./errors.js"
import { makeState, project, stateSnapshot } from "./projection.js"

const encodeJsonValue = (value: unknown): string =>
  Schema.encodeSync(Schema.UnknownFromJsonString)(value)

/** @experimental */
export interface LayerOptions {
  readonly address: Address.Address
}

/** @experimental */
export type RunError =
  | InputMalformed
  | InputRejected
  | ResumeMismatch
  | EventInvalid
  | ValueNotSerializable
  | Runtime.SendError
  | Runtime.EventsError
  | Runtime.RespondError
  | Runtime.RespondApprovalError
  | Runtime.InspectError

/** @experimental */
export interface Interface {
  readonly run: (input: RunAgentInput) => Stream.Stream<AGUIEvent, RunError>
  readonly snapshot: (runId: string) => Effect.Effect<AGUIEvent, EventInvalid | Runtime.InspectError>
}

/** @experimental */
export class AgUi extends Context.Service<AgUi, Interface>()("@batonfx/ag-ui/AgUi") {}

const validate = (value: RunAgentInput): Effect.Effect<RunAgentInput, InputMalformed> => {
  const parsed = RunAgentInputSchema.safeParse(value)
  return parsed.success
    ? Effect.succeed(parsed.data)
    : Effect.fail(InputMalformed.make({ detail: parsed.error.message }))
}

const rejectAuthority = (input: RunAgentInput): Effect.Effect<void, InputRejected> => {
  if (input.tools.length > 0) return Effect.fail(InputRejected.make({ reason: "client-tools" }))
  if (input.messages.some((message: RunAgentInput["messages"][number]) => message.role === "system")) {
    return Effect.fail(InputRejected.make({ reason: "system-message" }))
  }
  if (input.messages.some((message: RunAgentInput["messages"][number]) => message.role === "developer")) {
    return Effect.fail(InputRejected.make({ reason: "developer-message" }))
  }
  return Effect.void
}

const finalPrompt = (
  input: RunAgentInput,
): Effect.Effect<{ readonly prompt: string; readonly messageId: string }, InputRejected> => {
  const message = input.messages.at(-1)
  if (message?.role !== "user") return Effect.fail(InputRejected.make({ reason: "final-message-not-user" }))
  if (typeof message.content !== "string") {
    return Effect.fail(InputRejected.make({ reason: "unsupported-user-content" }))
  }
  return Effect.succeed({ prompt: message.content, messageId: message.id })
}

const serializablePayload = (payload: unknown): Effect.Effect<unknown, InputRejected> =>
  Effect.try({
    try: () => {
      encodeJsonValue(payload)
      return payload
    },
    catch: () => InputRejected.make({ reason: "invalid-resume" }),
  })

const recover = (
  runtime: Runtime.Interface,
  runId: string,
  threadId: string,
  state: ReturnType<typeof makeState>,
  cursor: Cursor.Cursor,
): Stream.Stream<AGUIEvent, RunError> =>
  runtime.events({ runId, cursor }).pipe(
    Stream.mapEffect((event) => project(state, event, threadId)),
    Stream.flattenIterable,
    Stream.catchIf(
      (error): error is Errors.SubscriberLagged | Errors.CursorExpired =>
        Schema.is(Errors.SubscriberLagged)(error) || Schema.is(Errors.CursorExpired)(error),
      () =>
        Stream.unwrap(
          runtime.snapshot(runId).pipe(
            Effect.map((snapshot) =>
              Stream.concat(
                Stream.fromEffect(stateSnapshot(snapshot)),
                Stream.suspend(() => recover(runtime, runId, threadId, makeState(), snapshot.cursor)),
              ),
            ),
          ),
        ),
    ),
  )

/** @experimental */
export const layer = (options: LayerOptions): Layer.Layer<AgUi, never, Runtime.Runtime> =>
  Layer.effect(
    AgUi,
    Effect.gen(function* () {
      const runtime = yield* Runtime.Runtime
      const snapshot = (runId: string) => runtime.snapshot(runId).pipe(Effect.flatMap(stateSnapshot))
      const run = (untrusted: RunAgentInput): Stream.Stream<AGUIEvent, RunError> =>
        Stream.unwrap(
          Effect.gen(function* () {
            const input = yield* validate(untrusted)
            yield* rejectAuthority(input)
            const state = makeState()
            let cursor = Cursor.origin
            if (input.resume !== undefined && input.resume.length > 0) {
              const current = yield* runtime.snapshot(input.runId)
              const receivedWaitIds = input.resume.map(
                (entry: NonNullable<RunAgentInput["resume"]>[number]) => entry.interruptId,
              )
              const entry = input.resume.length === 1 ? input.resume[0] : undefined
              if (
                current.run.wait?.status !== "open" ||
                entry === undefined ||
                entry.status !== "resolved" ||
                entry.interruptId !== current.run.wait.waitId
              ) {
                return yield* ResumeMismatch.make({
                  runId: input.runId,
                  ...(current.run.wait?.status === "open" ? { expectedWaitId: current.run.wait.waitId } : {}),
                  receivedWaitIds,
                })
              }
              const payload = yield* serializablePayload(entry.payload)
              cursor = current.cursor
              if (current.run.wait.reason._tag === "Approval") {
                yield* runtime.respondApproval({
                  runId: input.runId,
                  approvalId: current.run.wait.reason.request.approvalId,
                  decision: payload === false ? { _tag: "Denied" } : { _tag: "Approved" },
                })
              } else {
                yield* runtime.respond({
                  runId: input.runId,
                  waitId: entry.interruptId,
                  resolution: { _tag: "ToolResult", result: payload, encodedResult: payload },
                  idempotencyKey: `ag-ui:${input.runId}:${entry.interruptId}`,
                })
              }
            } else {
              const final = yield* finalPrompt(input)
              yield* runtime.send({
                runId: input.runId,
                to: options.address,
                sessionId: input.threadId,
                idempotencyKey: final.messageId,
                messageId: final.messageId,
                prompt: final.prompt,
              })
            }
            return recover(runtime, input.runId, input.threadId, state, cursor)
          }),
        )
      return AgUi.of({ run, snapshot })
    }),
  )
