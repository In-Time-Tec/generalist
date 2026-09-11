/* eslint-disable max-lines -- Host keeps the named and typed Tool entrypoints together. */
import { Effect, Schema } from "effect"
import type { Tool } from "effect/unstable/ai"
import type {
  InspectError,
  Service as Runtime,
  StartExecutionError,
  ToolRunHandle,
  ToolStartOptions,
} from "../runtime/service.js"
import { ToolNotRegistered } from "./errors.js"

export type HostToolRun<Output, Failure> = Omit<ToolRunHandle<Output, Failure>, "runId"> & {
  readonly id: ToolRunHandle<Output, Failure>["runId"]
}

export interface Tools {
  readonly get: <T extends Tool.Any>(
    tool: T,
    runId: string,
  ) => Effect.Effect<
    HostToolRun<T["successSchema"]["Type"], T["failureSchema"]["Type"]>,
    import("../runtime/service.js").GetRunError | import("../runtime/errors.js").ExecutableRegistrationInvalid
  >
  readonly start: <T extends Tool.Any>(
    tool: T,
    input: Tool.Parameters<T>,
    options?: ToolStartOptions,
  ) => Effect.Effect<
    HostToolRun<T["successSchema"]["Type"], T["failureSchema"]["Type"]>,
    StartExecutionError | InspectError
  >
  readonly getByName: (
    name: string,
    runId: string,
  ) => Effect.Effect<
    HostToolRun<unknown, unknown>,
    | import("../runtime/service.js").GetRunError
    | import("../runtime/errors.js").ExecutableRegistrationInvalid
    | ToolNotRegistered
  >
  readonly startByName: (
    name: string,
    input: Schema.Json,
    options?: ToolStartOptions,
  ) => Effect.Effect<HostToolRun<unknown, unknown>, StartExecutionError | InspectError | ToolNotRegistered>
}

// oxlint-disable-next-line effecttsgo/missing-pipeable-signature -- Host construction is an internal composition seam.
export const make = (runtime: Runtime, registered: ReadonlyMap<string, Tool.Any>): Tools => ({
  get: (tool, id) => runtime.getTool(tool, id).pipe(Effect.map(({ runId, ...handle }) => ({ id: runId, ...handle }))),
  start: (tool, input, options) =>
    runtime.startTool(tool, input, options).pipe(Effect.map(({ runId, ...handle }) => ({ id: runId, ...handle }))),
  getByName: (name, id) =>
    Effect.gen(function* () {
      const tool = registered.get(name)
      if (tool === undefined) return yield* ToolNotRegistered.make({ name })
      return yield* runtime.getTool(tool, id).pipe(Effect.map(({ runId, ...handle }) => ({ id: runId, ...handle })))
    }),
  startByName: (name, input, options) =>
    Effect.gen(function* () {
      const tool = registered.get(name)
      if (tool === undefined) return yield* ToolNotRegistered.make({ name })
      return yield* runtime
        .startToolEncoded(tool, input, options)
        .pipe(Effect.map(({ runId, ...handle }) => ({ id: runId, ...handle })))
    }),
})
