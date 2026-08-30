import { Effect, Option } from "effect"
import { Tool } from "effect/unstable/ai"
import type { Builder, CompletedModelResponse } from "../response/builder.js"
import type { AttemptIdentity, Service, Snapshot } from "./active-model-response.js"

interface Authority {
  readonly generation: number
  readonly identity: AttemptIdentity
}

/** @internal Core-only mutation authority hidden from the retained Runtime handle. */
export interface Writer {
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

interface WriterState {
  readonly writer: Writer
  readonly snapshot: Effect.Effect<Option.Option<Snapshot>>
}

interface WriterBinding {
  readonly service: Service
  readonly writer: Writer
}

const writers = new WeakMap<Service, Writer>()

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

export const make = (): WriterState => {
  const state: State = { generation: 0, current: undefined }
  const owns = (authority: Authority): boolean =>
    authority.generation === state.generation && state.current?.authority === authority
  return {
    snapshot: Effect.sync(() => {
      const current = state.current
      if (current === undefined) return Option.none<Snapshot>()
      const response = current.builder.snapshot()
      return hasSemanticContent(response)
        ? Option.some(Object.freeze({ ...current.authority.identity, response }))
        : Option.none<Snapshot>()
    }),
    writer: {
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
    },
  }
}

export const install = (binding: WriterBinding): void => {
  writers.set(binding.service, binding.writer)
}

export const writer = (service: Service): Writer => {
  const value = writers.get(service)
  if (value === undefined) throw new Error("ActiveModelResponse must be constructed with ActiveModelResponse.make")
  return value
}
