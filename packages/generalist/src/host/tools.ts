import { Effect } from "effect"
import type { Tool } from "effect/unstable/ai"
import type {
  InspectError,
  Service as Runtime,
  StartExecutionError,
  ToolRunHandle,
  ToolStartOptions,
} from "../runtime/service.js"

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
}

export const make = (runtime: Runtime): Tools => ({
  get: (tool, id) => runtime.getTool(tool, id).pipe(Effect.map(({ runId, ...handle }) => ({ id: runId, ...handle }))),
  start: (tool, input, options) =>
    runtime.startTool(tool, input, options).pipe(Effect.map(({ runId, ...handle }) => ({ id: runId, ...handle }))),
})
