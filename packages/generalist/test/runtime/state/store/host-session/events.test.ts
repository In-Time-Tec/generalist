import { expect, it } from "@effect/vitest"
import { Prompt } from "effect/unstable/ai"
import { RunId } from "../../../../../src/runtime/run.js"
import type { RunAccepted } from "../../../../../src/runtime/run/event.js"
import { emptyState, type StoredRun } from "../../../../../src/runtime/state/projection.js"
import { append } from "../../../../../src/runtime/state/store/host-session/events.js"
import { assistantAddress, assistantRef } from "../../../execution/fixtures.js"

it("does not create a Host Session for a child without canonical family admission", () => {
  const run: StoredRun = {
    runId: RunId.make("unretained-child"),
    parentRunId: "parent",
    rootRunId: "parent",
    status: "queued",
    executableRef: assistantRef.ref,
    executableManifest: assistantRef.manifest,
    address: assistantAddress,
    message: {
      id: "message",
      to: assistantAddress,
      sessionId: "unretained-session",
      prompt: Prompt.make("work"),
      idempotencyKey: "admit",
      correlationId: "parent",
      metadata: {},
    },
    depth: 1,
    treePolicy: { maxDepth: 3, maxSessions: 1024, concurrency: { agents: 4, tools: 4 } },
    lastSequence: -1,
    lastTurnCompletedSequence: -1,
    attempt: 0,
    attemptFence: 0,
    cancellationRequested: false,
    children: [],
    events: [],
    subscribers: new Map(),
    steering: [],
    registrations: [],
    checkpoints: new Map(),
  }
  const event: RunAccepted = {
    _tag: "RunAccepted",
    specVersion: "1",
    eventId: "accepted",
    runId: run.runId,
    rootRunId: RunId.make("parent"),
    depth: 1,
    sequence: 0,
    executableRef: run.executableRef,
    occurredAt: "2026-09-08T00:00:00.000Z",
    messageId: "message",
    address: assistantAddress,
  }
  const state = emptyState({ addressBindings: new Map(), subscriberQueueCapacity: 16 })
  const result = append({ state, run, event })
  expect(result.hostSessions.size).toBe(0)
  expect(result.publications).toEqual([])
})
