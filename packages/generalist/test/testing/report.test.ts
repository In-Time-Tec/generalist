import { expect, it } from "@effect/vitest"
import { Effect, FileSystem, Path, Schema } from "effect"
import { Testing } from "generalist/testing"
import { Certification, record, reset } from "../../src/testing/report.js"

it.effect("writes a sorted schema-backed certification report through FileSystem", () => {
  let writtenPath: string | undefined
  let writtenText: string | undefined
  const fileSystem = FileSystem.layerNoop({
    makeDirectory: () => Effect.void,
    writeFileString: (path, text) =>
      Effect.sync(() => {
        writtenPath = path
        writtenText = text
      }),
  })
  return Effect.gen(function* () {
    yield* reset
    yield* record({ name: "runtimeDriver:zeta", capabilities: ["runtime", "admission"] })
    yield* record({ name: "memory", capabilities: ["remember", "recall"] })
    yield* Testing.report.write({ path: "reports/certification.json" })
    expect(writtenPath).toBe("reports/certification.json")
    expect(yield* Schema.decodeEffect(Schema.fromJsonString(Certification))(writtenText ?? "")).toEqual({
      schemaVersion: 1,
      suites: [
        { name: "memory", capabilities: ["recall", "remember"] },
        { name: "runtimeDriver:zeta", capabilities: ["admission", "runtime"] },
      ],
    })
  }).pipe(Effect.provide([fileSystem, Path.layer]))
})
