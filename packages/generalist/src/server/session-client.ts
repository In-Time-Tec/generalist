import type { Prompt } from "effect/unstable/ai"
import type { HttpApiClient } from "effect/unstable/httpapi"
import type { SessionCreateOptions, QueueCommandOptions, QueueEditOptions } from "../host/index.js"
import type { SessionHistoryInput, SessionRunsInput } from "../runtime/session/page.js"
import type { api } from "./api.js"

type RawClient = HttpApiClient.ForApi<typeof api>["sessions"]

export interface SessionClient {
  readonly submit: (
    options: QueueCommandOptions & { readonly sessionId: string; readonly input: Prompt.Prompt | string },
  ) => ReturnType<RawClient["submit"]>
  readonly updateInput: (
    options: QueueEditOptions & {
      readonly sessionId: string
      readonly id: string
      readonly input: Prompt.Prompt | string
    },
  ) => ReturnType<RawClient["updateInput"]>
  readonly removeInput: (
    options: Omit<QueueEditOptions, "agent"> & { readonly sessionId: string; readonly id: string },
  ) => ReturnType<RawClient["removeInput"]>
  readonly create: (options?: SessionCreateOptions) => ReturnType<RawClient["create"]>
  readonly get: (options: { readonly sessionId: string }) => ReturnType<RawClient["get"]>
  readonly snapshot: (options: { readonly sessionId: string }) => ReturnType<RawClient["snapshot"]>
  readonly history: (options: SessionHistoryInput & { readonly sessionId: string }) => ReturnType<RawClient["history"]>
  readonly runs: (options: SessionRunsInput & { readonly sessionId: string }) => ReturnType<RawClient["runs"]>
  readonly entry: (options: { readonly sessionId: string; readonly entryId: string }) => ReturnType<RawClient["entry"]>
  readonly run: (options: { readonly sessionId: string; readonly runId: string }) => ReturnType<RawClient["run"]>
}

export const make = (raw: RawClient): SessionClient => ({
  create: (options = {}) => raw.create({ payload: options }),
  submit: ({ sessionId, ...payload }) => raw.submit({ params: { id: sessionId }, payload }),
  updateInput: ({ sessionId, id, ...payload }) => raw.updateInput({ params: { id: sessionId, inputId: id }, payload }),
  removeInput: ({ sessionId, id, ...payload }) => raw.removeInput({ params: { id: sessionId, inputId: id }, payload }),
  get: ({ sessionId }) => raw.get({ params: { id: sessionId } }),
  snapshot: ({ sessionId }) => raw.snapshot({ params: { id: sessionId } }),
  history: ({ sessionId, ...payload }) => raw.history({ params: { id: sessionId }, payload }),
  runs: ({ sessionId, ...payload }) => raw.runs({ params: { id: sessionId }, payload }),
  entry: ({ sessionId, entryId }) => raw.entry({ params: { id: sessionId, entryId } }),
  run: ({ sessionId, runId }) => raw.run({ params: { id: sessionId, runId } }),
})
