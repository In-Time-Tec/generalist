import type { Tool } from "effect/unstable/ai"
import type { ToolSchemaServices } from "./tool-result-codec.js"

export type ConcreteSchemaTool<T extends Tool.Any> =
  T extends Tool.Tool<string, infer Config, infer _Requirements>
    ? {
        readonly name: string
        readonly parametersSchema: Config["parameters"]
        readonly successSchema: Config["success"]
        readonly failureSchema: Config["failure"]
      }
    : never

export type PlacementSchemaServices<Tools extends Record<string, Tool.Any>> = ToolSchemaServices<
  ConcreteSchemaTool<Tools[keyof Tools]>
>
