import { Effect, Predicate, Schema } from "effect"
import { dual } from "effect/Function"
import type { Tool } from "effect/unstable/ai"
import { Runtime, type RunHandle, type StartEvent, type StartOptions } from "../../../runtime/service.js"
import { AgentTypeId, type Agent } from "./definition.js"

export type { RunHandle, StartEvent, StartOptions }

interface StartFunction {
  <InputValue>(
    input: InputValue,
    options?: StartOptions,
  ): <
    Tools extends Record<string, Tool.Any>,
    R,
    PolicyServices extends R,
    AuthorizationServices extends R,
    InputCodec extends Schema.Top,
    OutputCodec extends Schema.Top,
  >(
    agent: InputValue extends InputCodec["Type"]
      ? Agent<Tools, R, PolicyServices, AuthorizationServices, InputCodec, OutputCodec>
      : never,
  ) => Effect.Effect<RunHandle<OutputCodec["Type"]>, import("../../../runtime/service.js").StartError, Runtime>
  <
    Tools extends Record<string, Tool.Any>,
    R,
    PolicyServices extends R,
    AuthorizationServices extends R,
    InputCodec extends Schema.Top,
    OutputCodec extends Schema.Top,
  >(
    agent: Agent<Tools, R, PolicyServices, AuthorizationServices, InputCodec, OutputCodec>,
    input: InputCodec["Type"],
    options?: StartOptions,
  ): Effect.Effect<RunHandle<OutputCodec["Type"]>, import("../../../runtime/service.js").StartError, Runtime>
}

const isDataFirst = (args: IArguments): boolean => args.length >= 2 && Predicate.hasProperty(args[0], AgentTypeId)

/** Start an Agent previously registered with the durable Runtime. */
export const start: StartFunction = dual(
  isDataFirst,
  <
    Tools extends Record<string, Tool.Any>,
    R,
    PolicyServices extends R,
    AuthorizationServices extends R,
    InputCodec extends Schema.Top,
    OutputCodec extends Schema.Top,
  >(
    agent: Agent<Tools, R, PolicyServices, AuthorizationServices, InputCodec, OutputCodec>,
    input: InputCodec["Type"],
    options?: StartOptions,
  ) => Effect.flatMap(Runtime, (runtime) => runtime.start(agent, input, options)),
)
