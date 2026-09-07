import { Effect, FileSystem, Schema } from "effect"
import { isRunId, type Provider } from "./remote-configuration.js"
import { check } from "./remote-support.js"

export interface FailureEvidence {
  readonly tag: string
  readonly reason?: string
  readonly check?: string
}

export interface CaseEvidence {
  readonly name: string
  readonly result: "passed" | "failed" | "not-run"
  readonly durationMs: number
  readonly failure?: FailureEvidence
}

export interface Evidence {
  readonly schemaVersion: 1
  readonly provider: Provider
  readonly runtime: string
  readonly runId: string
  readonly result: "passed" | "failed"
  readonly startedAt: string
  readonly finishedAt: string
  readonly region: string
  readonly regionMeaning: "configured AWS region" | "R2 signing region, not physical placement"
  readonly namespace: string
  readonly environment: string
  readonly tenant: string
  readonly seed: number
  readonly concurrency: { readonly journal: number; readonly conditionalCreate: 8; readonly listingWrites: 16 }
  readonly retries: { readonly transportAttempts: 1; readonly maxConflictRetries: 64 }
  readonly payloadBytes: {
    readonly fixtureSizes: ReadonlyArray<number>
    readonly attemptedWriteTotal: number
    readonly largestAttemptedWrite: number
  }
  readonly requests: {
    readonly read: number
    readonly create: number
    readonly list: number
    readonly conflicts: number
    readonly continuationPages: number
  }
  readonly cases: ReadonlyArray<CaseEvidence>
  readonly cleanup: {
    readonly result: "retained" | "removed" | "failed"
    readonly removedObjects: number
    readonly writers: "stopped"
    readonly reason?: string
  }
  readonly unmetGates: ReadonlyArray<string>
}

/** Evidence output is a host boundary; it contains only explicit, non-secret qualification fields. */
// oxlint-disable-next-line effecttsgo/missing-pipeable-signature -- evidence writer takes required directory, run ID, and prevalidated JSON evidence.
export const writeEvidence = (directory: string, runId: string, evidence: Schema.Json) =>
  Effect.gen(function* () {
    yield* check(isRunId(runId), "evidence-path", "Evidence requires a safe unique run ID")
    const text = yield* Schema.encodeEffect(Schema.fromJsonString(Schema.Json, { space: 2 }))(evidence)
    const fileSystem = yield* FileSystem.FileSystem
    yield* fileSystem.makeDirectory(directory, { recursive: true })
    const path = `${directory}/${runId}.json`
    yield* fileSystem.writeFileString(path, `${text}\n`)
    return path
  })
