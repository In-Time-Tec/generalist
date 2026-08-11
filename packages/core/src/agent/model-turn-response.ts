import { Option } from "effect"
import { Response, Tool } from "effect/unstable/ai"
import { controller, type Controller, type Interface } from "../model/active-model-response.js"
import { make as makeModelResponse, type CompletedModelResponse } from "../model/model-response-builder.js"
import type { AttemptCompleted } from "../model/model-operation.js"

type PartIdentity = Pick<AttemptCompleted, "modelCallId" | "modelAttemptId" | "attempt">
type Authority = ReturnType<Controller["begin"]>

interface ActiveAttempt extends PartIdentity {
  readonly builder: ReturnType<typeof makeModelResponse<Record<string, Tool.Any>>>
  readonly authority?: Authority
}

/** @internal Own one provider attempt builder and its optional Run-visible authority. */
export const makeAttemptResponse = (input: {
  readonly service: Option.Option<Interface>
  readonly operationKey?: string
  readonly turn: number
}) => {
  const control = Option.isSome(input.service) ? controller(input.service.value) : undefined
  let active: ActiveAttempt | undefined
  const responseFor = (identity: PartIdentity): ActiveAttempt => {
    if (
      active !== undefined &&
      active.modelCallId === identity.modelCallId &&
      active.modelAttemptId === identity.modelAttemptId &&
      active.attempt === identity.attempt
    ) {
      return active
    }
    const authority = control?.begin({
      ...(input.operationKey === undefined ? {} : { operationKey: input.operationKey }),
      turn: input.turn,
      ...identity,
    })
    active = {
      ...identity,
      builder: makeModelResponse<Record<string, Tool.Any>>(),
      ...(authority === undefined ? {} : { authority }),
    }
    return active
  }
  return {
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

/** @internal Clear only the exact attempt whose semantic operation committed. */
export const clearCommittedResponse = (input: {
  readonly service: Option.Option<Interface>
  readonly authority: Authority | undefined
}): void => {
  if (Option.isSome(input.service) && input.authority !== undefined) {
    controller(input.service.value).clearCommitted(input.authority)
  }
}
