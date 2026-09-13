import { Context, Effect, Layer, Schema, type Scope } from "effect"
import type { Tool } from "effect/unstable/ai"
import {
  ArtifactCrdt,
  ArtifactError,
  EditResult,
  RangeOperation,
  ReadResult,
  Version,
  type ManagedArtifactTool,
} from "../core/artifact.js"
import type { DriverInterpreter } from "../core/durable/driver/interpreter.js"
import type { ToolContext } from "../core/tools/tool-context.js"

export const ReadParameters = Schema.Struct({})
export const EditParameters = Schema.Struct({ base: Version, operation: RangeOperation })

/** Model-facing tool that journals one exact artifact version read. @experimental */
export type ReadTool = Tool.Tool<
  `artifact_read_${string}`,
  {
    readonly parameters: typeof ReadParameters
    readonly success: typeof ReadResult
    readonly failure: typeof ArtifactError
    readonly failureMode: "return"
  },
  DriverInterpreter | ToolContext
> &
  ManagedArtifactTool

/** Model-facing exact-base text edit tool. @experimental */
export type EditTool = Tool.Tool<
  `artifact_edit_${string}`,
  {
    readonly parameters: typeof EditParameters
    readonly success: typeof EditResult
    readonly failure: typeof ArtifactError
    readonly failureMode: "return"
  },
  DriverInterpreter | ToolContext
> &
  ManagedArtifactTool

export interface Document {
  readonly name: string
  readonly read: Effect.Effect<ReadResult, ArtifactError>
  readonly editTool: EditTool
  readonly readTool: ReadTool
}

/** Configuration for opening one shared text artifact. @experimental */
export interface OpenOptions<Error, Requirements> {
  readonly crdt: Layer.Layer<ArtifactCrdt, Error, Requirements>
  readonly initial?: string
}

/** Artifact operations supplied by one concrete Runtime and BlobStore pair. @experimental */
export interface Service {
  readonly open: <Error, Requirements>(
    name: string,
    options: OpenOptions<Error, Requirements>,
  ) => Effect.Effect<Document, Error | ArtifactError, Requirements | Scope.Scope>
}

/** Process-scoped Artifact capability. @experimental */
// oxlint-disable-next-line effecttsgo/deterministic-keys -- The public service key is specified by the Artifact capability contract.
export class Artifacts extends Context.Service<Artifacts, Service>()("generalist/unstable/artifact/Artifacts") {}
