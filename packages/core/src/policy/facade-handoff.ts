import {
  transferTool as Handoff_transferTool,
  fanOut as Handoff_fanOut,
  supervisor as Handoff_supervisor,
} from "./handoff.js"
export const Handoff = {
  transferTool: Handoff_transferTool,
  fanOut: Handoff_fanOut,
  supervisor: Handoff_supervisor,
} as typeof import("./handoff.js")
export namespace Handoff {
  export type transferTool = typeof import("./handoff.js").transferTool
  export type fanOut = typeof import("./handoff.js").fanOut
  export type supervisor = typeof import("./handoff.js").supervisor
  export type FanOutChild<
    Tools extends Record<string, import("effect/unstable/ai").Tool.Any>,
    R,
    Options extends Omit<import("../agent/agent.js").RunOptions, "prompt"> | undefined =
      | Omit<import("../agent/agent.js").RunOptions, "prompt">
      | undefined,
  > = import("./handoff.js").FanOutChild<Tools, R, Options>
  export type FanOutOptions = import("./handoff.js").FanOutOptions
  export type Supervisor<R> = import("./handoff.js").Supervisor<R>
  export type SupervisorOptions<
    Specialists extends ReadonlyArray<
      import("../agent/agent.js").Agent<Record<string, import("effect/unstable/ai").Tool.Any>, unknown>
    >,
  > = import("./handoff.js").SupervisorOptions<Specialists>
  export type TransferOptions<
    Parameters extends import("effect").Schema.Top = import("effect").Schema.Top,
    Success extends import("effect").Schema.Top = typeof import("effect").Schema.String,
  > = import("./handoff.js").TransferOptions<Parameters, Success>
}
