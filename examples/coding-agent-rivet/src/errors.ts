import { Schema } from "effect"

export class RivetOperationFailed extends Schema.TaggedError<RivetOperationFailed>()("RivetOperationFailed", {
  operation: Schema.String,
  message: Schema.String,
  cause: Schema.Defect(),
}) {}

export const rivetFailure =
  (operation: string) =>
  (cause: unknown): RivetOperationFailed =>
    RivetOperationFailed.make({ operation, message: `Rivet ${operation} failed`, cause })
