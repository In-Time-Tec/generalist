import { Context, Effect, Schema } from "effect"
import { Tool } from "effect/unstable/ai"
import { FrameworkFailure, type Request } from "../tool-executor.js"

export const Admission = Schema.TaggedStruct("ToolRunAdmitted", {
  runId: Schema.String,
  tool: Schema.String,
})

export class Inline extends Context.Service<Inline, boolean>()("generalist/core/tools/background/Inline") {}

export class BackgroundTools extends Context.Service<
  BackgroundTools,
  {
    readonly admit: (
      tool: Tool.Any,
      input: Request["call"]["params"],
      commandId: string,
    ) => Effect.Effect<typeof Admission.Type, FrameworkFailure>
  }
>()("generalist/core/tools/background/BackgroundTools") {}

export const modelTool = (tool: Tool.Any): Tool.Any | undefined => {
  if (
    Context.getOrElse(tool.annotations, Inline, () => false) ||
    (Tool.isProviderDefined(tool) && !tool.requiresHandler)
  )
    return undefined
  return Object.assign(tool.setSuccess(Admission), {
    description: `${tool.description ?? ""}\nAdmits a background Tool Run. Returns only a ToolRunAdmitted receipt, never the final tool output. Inspect or explicitly wait for that Run to obtain its final result.`,
  })
}
