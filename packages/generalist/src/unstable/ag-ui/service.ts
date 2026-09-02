import { RunAgentInputSchema, type AGUIEvent, type RunAgentInput } from "@ag-ui/core"
import { Context, Effect, Layer, Schema, Stream } from "effect"
import { origin, type Cursor } from "../../runtime/cursor.js"
import type { Address } from "../../runtime/address.js"
import {
  Runtime,
  type ActivateError,
  type EventsError,
  type InspectError,
  type Service as RuntimeService,
  type RespondApprovalError,
  type RespondError,
  type SendError,
  type SessionEntryError,
} from "../../runtime/service.js"
import { CursorExpired, SubscriberLagged } from "../../runtime/errors.js"
import type { RunEvent } from "../../runtime/run/event.js"
import { EventInvalid, InputMalformed, InputRejected, ResumeMismatch, type ValueNotSerializable } from "./errors.js"
import { project, projectModelResponse, stateSnapshot } from "./projection.js"

/** @experimental */
export interface LayerOptions {
  readonly address: Address
}

/** @experimental */
export type RunError =
  | InputMalformed
  | InputRejected
  | ResumeMismatch
  | EventInvalid
  | ValueNotSerializable
  | SendError
  | ActivateError
  | EventsError
  | RespondError
  | RespondApprovalError
  | InspectError
  | SessionEntryError

/** @experimental */
export interface Service {
  readonly run: (input: RunAgentInput) => Stream.Stream<AGUIEvent, RunError>
  readonly snapshot: (runId: string) => Effect.Effect<AGUIEvent, EventInvalid | InspectError>
}

/** @experimental */
export class AGUI extends Context.Service<AGUI, Service>()("generalist/unstable/ag-ui/service/AGUI") {}

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
  return Schema.decodeUnknownEffect(Schema.String)(message.content).pipe(
    Effect.map((prompt) => ({ prompt, messageId: message.id })),
    Effect.mapError(() => InputRejected.make({ reason: "unsupported-user-content" })),
  )
}

const isBoundary = (event: RunEvent): boolean =>
  event._tag === "RunWaiting" ||
  event._tag === "RunCompleted" ||
  event._tag === "RunFailed" ||
  event._tag === "RunCancelled" ||
  event._tag === "OperationUnknown"

const recover = (
  runtime: RuntimeService,
  runId: string,
  threadId: string,
  cursor: Cursor,
): Stream.Stream<AGUIEvent, RunError> =>
  runtime.events({ runId, cursor }).pipe(
    Stream.takeUntil(isBoundary),
    Stream.mapEffect((event) =>
      event._tag === "ModelResponseCommitted" || event._tag === "ModelResponseInterrupted"
        ? runtime
            .resolveModelResponse(event)
            .pipe(Effect.flatMap((response) => projectModelResponse(event, response.content)))
        : project(event, threadId),
    ),
    Stream.flattenIterable,
    Stream.catchIf(
      (error): error is SubscriberLagged | CursorExpired =>
        Schema.is(SubscriberLagged)(error) || Schema.is(CursorExpired)(error),
      () =>
        Stream.unwrap(
          runtime.snapshot(runId).pipe(
            Effect.map((snapshot) =>
              Stream.concat(
                Stream.fromEffect(stateSnapshot(snapshot)),
                Stream.suspend(() => recover(runtime, runId, threadId, snapshot.cursor)),
              ),
            ),
          ),
        ),
    ),
  )

/** @experimental */
export const layer = (options: LayerOptions): Layer.Layer<AGUI, never, Runtime> =>
  Layer.effect(
    AGUI,
    Effect.gen(function* () {
      const runtime = yield* Runtime
      const snapshot = (runId: string) => runtime.snapshot(runId).pipe(Effect.flatMap(stateSnapshot))
      const run = (untrusted: RunAgentInput): Stream.Stream<AGUIEvent, RunError> =>
        Stream.unwrap(
          Effect.gen(function* () {
            const input = yield* validate(untrusted)
            yield* rejectAuthority(input)
            let cursor = origin
            if (input.resume !== undefined && input.resume.length > 0) {
              const current = yield* runtime.snapshot(input.runId)
              const receivedWaitIds = input.resume.map(
                (entry: NonNullable<RunAgentInput["resume"]>[number]) => entry.interruptId,
              )
              const waits = new Map(current.run.waits.map((wait) => [wait.waitId, wait] as const))
              if (
                current.run.status !== "waiting" ||
                new Set(receivedWaitIds).size !== receivedWaitIds.length ||
                input.resume.some((entry) => entry.status !== "resolved" || !waits.has(entry.interruptId))
              ) {
                const expectedWaitId = current.run.waits[0]?.waitId
                const mismatch =
                  expectedWaitId === undefined
                    ? { runId: input.runId, receivedWaitIds }
                    : { runId: input.runId, expectedWaitId, receivedWaitIds }
                return yield* ResumeMismatch.make(mismatch)
              }
              cursor = current.cursor
              const resolutions = yield* Effect.forEach(input.resume, (entry) =>
                Schema.decodeUnknownEffect(Schema.Json)(entry.payload).pipe(
                  Effect.map((payload) => ({ entry, payload })),
                  Effect.mapError(() => InputRejected.make({ reason: "invalid-resume" })),
                ),
              )
              for (const { entry, payload } of resolutions) {
                const wait = waits.get(entry.interruptId)!
                if (wait.reason._tag === "Approval") {
                  yield* runtime.respondApproval({
                    runId: input.runId,
                    approvalId: wait.reason.request.approvalId,
                    decision: payload === false ? { _tag: "Denied" } : { _tag: "Approved" },
                  })
                } else {
                  yield* runtime.respond({
                    runId: input.runId,
                    waitId: entry.interruptId,
                    resolution: { _tag: "ToolResult", result: payload, encodedResult: payload },
                  })
                }
              }
            } else {
              const final = yield* finalPrompt(input)
              const receipt = yield* runtime.send({
                runId: input.runId,
                to: options.address,
                sessionId: input.threadId,
                idempotencyKey: final.messageId,
                messageId: final.messageId,
                prompt: final.prompt,
              })
              yield* runtime.activate({ runId: receipt.runId })
            }
            return recover(runtime, input.runId, input.threadId, cursor)
          }),
        )
      return AGUI.of({ run, snapshot })
    }),
  )
