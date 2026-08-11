import { Context, Effect, Option } from "effect"
import { Tool } from "effect/unstable/ai"
import type { Builder, CompletedModelResponse } from "./model-response-builder.js"

/** @experimental Identity of the authoritative provider attempt for one model operation. */
export interface AttemptIdentity {
  readonly operationKey?: string
  readonly turn: number
  readonly modelCallId: string
  readonly modelAttemptId: string
  readonly attempt: number
}

/** @experimental A normalized response that was interrupted after producing semantic content. */
export interface Snapshot extends AttemptIdentity {
  readonly response: CompletedModelResponse<Record<string, Tool.Any>>
}

const HandleTypeId: unique symbol = Symbol.for("@batonfx/core/ActiveModelResponse/Handle")

/** @experimental Read-only access to the active model response owned by one Run. */
export interface Interface {
  readonly [HandleTypeId]: typeof HandleTypeId
  readonly snapshot: Effect.Effect<Option.Option<Snapshot>>
}

/** @experimental Run-owned access to the currently authoritative partial model response. */
export class ActiveModelResponse extends Context.Service<ActiveModelResponse, Interface>()(
  "@batonfx/core/model/active-model-response/ActiveModelResponse",
) {}

interface Authority {
  readonly generation: number
  readonly identity: AttemptIdentity
}

/** @internal Core-only mutation authority hidden from the retained Runtime handle. */
export interface Controller {
  readonly begin: (identity: AttemptIdentity) => Authority
  readonly install: (authority: Authority, builder: Builder<Record<string, Tool.Any>>) => void
  readonly discard: (authority: Authority) => void
  readonly clearCommitted: (authority: Authority) => void
}

interface State {
  generation: number
  current:
    | {
        readonly authority: Authority
        readonly builder: Builder<Record<string, Tool.Any>>
      }
    | undefined
}

const controllers = new WeakMap<Interface, Controller>()

const hasSemanticContent = (response: CompletedModelResponse<Record<string, Tool.Any>>): boolean =>
  response.content.some((part) => {
    switch (part.type) {
      case "text":
      case "reasoning":
        return part.text.length > 0
      case "finish":
      case "response-metadata":
        return false
      default:
        return true
    }
  })

/** @experimental Make one opaque accumulator handle for a single Run. */
export const make = (): Interface => {
  const state: State = { generation: 0, current: undefined }
  const service = ActiveModelResponse.of({
    [HandleTypeId]: HandleTypeId,
    snapshot: Effect.sync(() => {
      const current = state.current
      if (current === undefined) return Option.none<Snapshot>()
      const response = current.builder.snapshot()
      return hasSemanticContent(response)
        ? Option.some(Object.freeze({ ...current.authority.identity, response }))
        : Option.none<Snapshot>()
    }),
  })
  const owns = (authority: Authority): boolean =>
    authority.generation === state.generation && state.current?.authority === authority
  controllers.set(service, {
    begin: (identity) => {
      const authority = { generation: state.generation + 1, identity: Object.freeze({ ...identity }) }
      state.generation = authority.generation
      state.current = undefined
      return authority
    },
    install: (authority, builder) => {
      if (authority.generation !== state.generation) return
      state.current = { authority, builder }
    },
    discard: (authority) => {
      if (owns(authority)) state.current = undefined
    },
    clearCommitted: (authority) => {
      if (owns(authority)) state.current = undefined
    },
  })
  return service
}

/** @internal Access Core's mutation side without widening the public retained handle. */
export const controller = (service: Interface): Controller => {
  const value = controllers.get(service)
  if (value === undefined) throw new Error("ActiveModelResponse must be constructed with ActiveModelResponse.make")
  return value
}
