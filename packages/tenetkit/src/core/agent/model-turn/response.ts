import { Effect, Option, Ref } from "effect"
import { Chat, Prompt, Response, Tool } from "effect/unstable/ai"
import { controller, type Controller, type Service } from "../../model/result/active-model-response.js"
import { make as makeModelResponse, type CompletedModelResponse } from "../../model/response/builder.js"
import type { AttemptCompleted } from "../../model/operation.js"
import { coalesceAdjacentText } from "../../context/session-sync.js"

type PartIdentity = Pick<AttemptCompleted, "modelCallId" | "modelAttemptId" | "attempt">
type Authority = ReturnType<Controller["begin"]>

interface ActiveAttempt extends PartIdentity {
  readonly builder: ReturnType<typeof makeModelResponse<Record<string, Tool.Any>>>
  readonly authority?: Authority
}

/** @internal Own one provider attempt builder and its optional Run-visible authority. */
export const attemptResponse = (input: {
  readonly service: Option.Option<Service>
  readonly operationKey?: string
  readonly turn: number
}) => {
  const control = Option.isSome(input.service) ? controller(input.service.value) : undefined
  let active: ActiveAttempt | undefined
  let sessionParentId: string | null | undefined
  const responseFor = (identity: PartIdentity): ActiveAttempt => {
    if (
      active !== undefined &&
      active.modelCallId === identity.modelCallId &&
      active.modelAttemptId === identity.modelAttemptId &&
      active.attempt === identity.attempt
    ) {
      return active
    }
    const attemptIdentity: Parameters<Controller["begin"]>[0] = {
      turn: input.turn,
      ...identity,
    }
    if (input.operationKey !== undefined) Object.assign(attemptIdentity, { operationKey: input.operationKey })
    if (sessionParentId !== undefined) Object.assign(attemptIdentity, { sessionParentId })
    const authority = control?.begin(attemptIdentity)
    const next: ActiveAttempt = {
      ...identity,
      builder: makeModelResponse<Record<string, Tool.Any>>(),
    }
    if (authority !== undefined) Object.assign(next, { authority })
    active = next
    return responseFor(identity)
  }
  return {
    setSessionParentId: (value: string | null): string | null => (sessionParentId = value),
    accept: (identity: PartIdentity, part: Response.StreamPart<Record<string, Tool.Any>>): void => {
      const response = responseFor(identity)
      response.builder.accept(part)
      if (response.authority !== undefined) control?.install(response.authority, response.builder)
    },
    complete: (identity: PartIdentity): CompletedModelResponse<Record<string, Tool.Any>> =>
      responseFor(identity).builder.complete(),
    authority: (): Authority | undefined => active?.authority,
    discard: (): void => {
      if (active?.authority !== undefined) control?.discard(active.authority)
    },
  }
}

export const replayMessages = (input: {
  readonly chat: Chat.Service
  readonly activePrompt: Prompt.Prompt
  readonly replayFromHistory: boolean
}): Effect.Effect<ReadonlyArray<Prompt.Message>> =>
  Ref.get(input.chat.history).pipe(
    Effect.map((history) =>
      input.replayFromHistory
        ? history.content
        : Prompt.concat(history, Prompt.fromMessages(input.activePrompt.content.map(coalesceAdjacentText))).content,
    ),
  )

export const clearCommittedResponse = (input: {
  readonly service: Option.Option<Service>
  readonly authority: Authority | undefined
}): void => {
  if (Option.isSome(input.service) && input.authority !== undefined) {
    controller(input.service.value).clearCommitted(input.authority)
  }
}
