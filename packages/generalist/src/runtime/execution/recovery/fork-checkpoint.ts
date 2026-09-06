import { Option, Schema } from "effect"
import { LoopDriverState } from "../../../core/durable/loop-driver-state.js"
import { ExecutionCheckpoint } from "../state.js"

/** Rebind one framework-owned operation key without inspecting its opaque suffix. */
const forkOperationKey = (operationKey: string, sourceRunId: string, targetRunId: string): string => {
  const prefix = `${sourceRunId}:`
  return operationKey.startsWith(prefix) ? `${targetRunId}:${operationKey.slice(prefix.length)}` : operationKey
}

/**
 * Copy a checkpoint into a fork's execution namespace.
 *
 * Only fields owned by the durable loop are changed. Model-authored calls, arguments, results,
 * metadata, and every other opaque payload remain byte-for-byte equivalent after schema encoding.
 */
const forkCheckpoint = (
  checkpoint: ExecutionCheckpoint,
  sourceRunId: string,
  targetRunId: string,
  targetSessionId: string,
): ExecutionCheckpoint => {
  const copied = Schema.decodeSync(ExecutionCheckpoint)(Schema.encodeSync(ExecutionCheckpoint)(checkpoint))
  if ("_tag" in copied) return copied
  const decoded = Schema.decodeUnknownOption(LoopDriverState)(copied.state, { onExcessProperty: "error" })
  if (Option.isNone(decoded)) return copied
  const state = decoded.value
  return {
    ...copied,
    state: {
      ...state,
      logicalOperationId: targetRunId,
      sessionId: targetSessionId,
      ...(state.pending === undefined
        ? undefined
        : {
            pending: {
              ...state.pending,
              key: forkOperationKey(state.pending.key, sourceRunId, targetRunId),
            },
          }),
      ...(state.toolBatch === undefined
        ? undefined
        : {
            toolBatch: {
              ...state.toolBatch,
              calls: state.toolBatch.calls.map((entry) => ({
                ...entry,
                operationKey: forkOperationKey(entry.operationKey, sourceRunId, targetRunId),
                state:
                  entry.state._tag === "Waiting"
                    ? {
                        ...entry.state,
                        waitId: forkOperationKey(entry.state.waitId, sourceRunId, targetRunId),
                      }
                    : entry.state,
              })),
            },
          }),
    },
  }
}

export const ForkCheckpoint = { forkOperationKey, forkCheckpoint }
