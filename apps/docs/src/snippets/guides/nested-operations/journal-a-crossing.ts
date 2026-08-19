import { Effect, Schema } from "effect"
import { NestedOperation, ToolContext, ToolExecutor } from "tenetkit"

interface Written {
  readonly path: string
  readonly patch: string
}

class WriteFailed extends Schema.TaggedError<WriteFailed>()("@tenetkit/docs/WriteFailed", {
  path: Schema.String,
}) {}

declare const writeToDisk: (path: string, text: string) => Effect.Effect<Written, WriteFailed>

type InExecution = NestedOperation.NestedOperations | ToolContext.ToolContext

/**
 * One boundary crossing inside a composite tool call. Identity is derived from the ambient
 * ToolContext plus a host-assigned ordinal, so the handler cannot choose or collide with it.
 *
 * `render` is applied to the handler's real outcome, never read from `payload`, so input that
 * plants a `render` field cannot dictate what the host displays.
 */
export const applyPatch = (input: {
  readonly path: string
  readonly text: string
}): Effect.Effect<Written, WriteFailed | NestedOperation.Failure, InExecution> =>
  NestedOperation.run(
    {
      kind: "replace",
      payload: { path: input.path },
      replayPolicy: "never",
      approval: { capability: "workspace-write" },
      render: (value: Written) => ({ _tag: "Diff" as const, path: value.path, patch: value.patch }),
    },
    writeToDisk(input.path, input.text),
  )

const returned = (tag: string, detail: string): Effect.Effect<ToolExecutor.Outcome> =>
  Effect.succeed({
    _tag: "DomainFailure",
    failure: { _tag: tag, detail },
    encodedFailure: { _tag: tag, detail },
  })

/**
 * A crossing whose approval the host cannot settle in process fails NestedOperationSuspended.
 * `catchSuspension` converts exactly that error into the executor's Suspend outcome; every other
 * failure is mapped first, so the suspension is still on the error channel when it reaches it.
 */
export const route: ToolExecutor.Route<InExecution> = ToolExecutor.route<InExecution>({
  tools: ["edit_file"],
  execute: (request) =>
    NestedOperation.catchSuspension(
      applyPatch({ path: String(request.call.id), text: "next" }).pipe(
        Effect.map(
          (written): ToolExecutor.Outcome => ({
            _tag: "Success",
            result: written,
            encodedResult: { path: written.path, patch: written.patch },
          }),
        ),
        Effect.catchTag("@tenetkit/docs/WriteFailed", (failure) =>
          Effect.succeed<ToolExecutor.Outcome>({
            _tag: "DomainFailure",
            failure,
            encodedFailure: { _tag: failure._tag, path: failure.path },
          }),
        ),
        // Divergence, an unobserved outcome, and a denial are decisions the model should read, so
        // they come back as schema-valid failed tool results rather than failing the run.
        Effect.catchTags({
          "tenetkit/core/NestedOperationDenied": (failure) => returned(failure._tag, failure.reason),
          "tenetkit/core/NestedOperationDivergence": (failure) =>
            returned(failure._tag, `recorded ${failure.recordedKind}, requested ${failure.requestedKind}`),
          "tenetkit/core/NestedOperationUnknown": (failure) => returned(failure._tag, failure.operationId),
        }),
      ),
    ),
})
