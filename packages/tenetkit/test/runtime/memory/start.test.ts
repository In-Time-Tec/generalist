import { expect, it as standalone, layer } from "@effect/vitest"
import { provideScoped } from "../execution/scoped-provide.js"
import { Effect, Ref, Schema } from "effect"
import { Prompt } from "effect/unstable/ai"
import { Database } from "bun:sqlite"
import { Agent, AgentManifest, ExecutableManifest, Pins } from "../../../src/index.js"
import { Address, Errors, ExecutableResolver, RunStore, Runtime } from "../../../src/runtime/index.js"
import {
  alternateAssistant,
  alternateAssistantRef,
  assistant,
  assistantRef,
  completedResult,
  parentRelativeOptions,
  researcherRef,
  textPrompt,
} from "../execution/fixtures.js"
import { unusedModel } from "../run/identity.js"
import { tempDbPath } from "../sql/scenario.js"

import { Runtime as SqliteRuntime } from "../../../src/runtime/sqlite-bun.js"

const closedTestAgent = (agent: Agent.Agent): Agent.Closed => Agent.close(agent, unusedModel)

const filePrompt = (data: Uint8Array): Prompt.Prompt =>
  Prompt.fromMessages([
    Prompt.makeMessage("user", {
      content: [
        Prompt.makePart("text", { text: "inspect this image" }),
        Prompt.makePart("file", { mediaType: "image/png", fileName: "upload.png", data }),
      ],
    }),
  ])

const registrationsFor = (executable: ExecutableManifest.PinnedExecutable, suffix = "1") => {
  const pins = new Set<string>()
  for (const entry of executable.manifest.entries) {
    if (entry._tag === "Agent") {
      pins.add(entry.manifest.model)
      for (const value of [...entry.manifest.tools, ...entry.manifest.skills, ...entry.manifest.services])
        pins.add(value.pin)
      if (entry.manifest.policy._tag === "Pinned") pins.add(entry.manifest.policy.pin)
      if (entry.manifest.compaction !== undefined) {
        pins.add(entry.manifest.compaction.service)
        pins.add(entry.manifest.compaction.summaryModel)
      }
    }
  }
  return [...pins].map((pin) => ({ pin, codec: "test", version: "1", payload: { fixture: suffix } }))
}

const runtimeLayer = Runtime.layerMemory({
  addresses: [],
  resolver: ExecutableResolver.makeStatic([
    { executable: assistantRef, agent: closedTestAgent(assistant) },
    { executable: alternateAssistantRef, agent: closedTestAgent(alternateAssistant) },
  ]),
})

layer(runtimeLayer)("Runtime exact root admission", (it) => {
  it.effect("starts an unseen exact executable and returns one stable duplicate Run ID", () =>
    Effect.gen(function* () {
      const runtime = yield* Runtime.Runtime
      const input = {
        executable: assistantRef,
        registrations: registrationsFor(assistantRef),
        sessionId: "exact-session",
        idempotencyKey: "exact-key",
        prompt: textPrompt("hello"),
      }
      const first = yield* runtime.start(input)
      const duplicate = yield* runtime.start(input)
      expect(duplicate.runId).toBe(first.runId)
      expect(duplicate.duplicate).toBe(true)
    }),
  )

  it.effect("conflicts on changed prompt, executable, and registration", () =>
    Effect.gen(function* () {
      const runtime = yield* Runtime.Runtime
      const base = {
        executable: assistantRef,
        registrations: registrationsFor(assistantRef),
        sessionId: "conflict-session",
        idempotencyKey: "same",
        prompt: textPrompt("hello"),
      }
      yield* runtime.start(base)
      expect(yield* runtime.start({ ...base, prompt: textPrompt("changed") }).pipe(Effect.flip)).toBeInstanceOf(
        Errors.IdempotencyConflict,
      )
      expect(
        yield* runtime
          .start({ ...base, executable: alternateAssistantRef, registrations: registrationsFor(alternateAssistantRef) })
          .pipe(Effect.flip),
      ).toBeInstanceOf(Errors.IdempotencyConflict)
      expect(
        yield* runtime.start({ ...base, registrations: registrationsFor(assistantRef, "changed") }).pipe(Effect.flip),
      ).toBeInstanceOf(Errors.ExecutableRegistrationConflict)
    }),
  )

  it.effect("admits and deduplicates typed file bytes while conflicting on changed bytes", () =>
    Effect.gen(function* () {
      const runtime = yield* Runtime.Runtime
      const input = {
        executable: assistantRef,
        registrations: registrationsFor(assistantRef),
        sessionId: "file-session",
        idempotencyKey: "file-key",
        prompt: filePrompt(new Uint8Array([0, 1, 2, 255])),
      }
      const first = yield* runtime.start(input)
      expect(yield* runtime.start({ ...input, prompt: filePrompt(new Uint8Array([0, 1, 2, 255])) })).toEqual({
        ...first,
        duplicate: true,
      })
      expect(
        yield* runtime.start({ ...input, prompt: filePrompt(new Uint8Array([0, 1, 3, 255])) }).pipe(Effect.flip),
      ).toBeInstanceOf(Errors.IdempotencyConflict)
    }),
  )

  it.effect("rejects a registration pin mismatch and a missing required pin", () =>
    Effect.gen(function* () {
      const runtime = yield* Runtime.Runtime
      const registrations = registrationsFor(assistantRef)
      const mismatch = yield* runtime
        .start({
          executable: assistantRef,
          registrations: [...registrations, { pin: "capability:unrelated", codec: "test", version: "1", payload: {} }],
          sessionId: "invalid-session",
          idempotencyKey: "mismatch",
          prompt: "hello",
        })
        .pipe(Effect.flip)
      expect(mismatch).toBeInstanceOf(Errors.ExecutableRegistrationInvalid)
      const missing = yield* runtime
        .start({
          executable: assistantRef,
          registrations: registrations.slice(1),
          sessionId: "invalid-session",
          idempotencyKey: "missing",
          prompt: "hello",
        })
        .pipe(Effect.flip)
      expect(missing).toBeInstanceOf(Errors.ExecutableRegistrationMissing)
    }),
  )

  it.effect("resolves and attests the executable before admission succeeds", () =>
    Effect.gen(function* () {
      const runtime = yield* Runtime.Runtime
      const store = yield* RunStore.RunStore
      const before = yield* store.list({ limit: 1000 })
      const unresolvable = yield* runtime
        .start({
          executable: researcherRef,
          registrations: registrationsFor(researcherRef),
          sessionId: "unresolvable-session",
          idempotencyKey: "unresolvable",
          prompt: textPrompt("hello"),
        })
        .pipe(Effect.flip)
      expect(unresolvable).toBeInstanceOf(Errors.ExecutablePinMissing)
      expect(yield* store.list({ limit: 1000 })).toHaveLength(before.length)
    }),
  )
})

const initialChildrenLayer = Runtime.layerMemory({ ...parentRelativeOptions, addresses: [] })

layer(initialChildrenLayer)("Runtime atomic initial children", (it) => {
  const base = {
    executable: assistantRef,
    registrations: registrationsFor(assistantRef),
    sessionId: "initial-root",
    idempotencyKey: "initial-root",
    prompt: textPrompt("root"),
    initialChildren: [
      {
        invocationId: "initial-research",
        idempotencyKey: "initial-research",
        selection: "researcher",
        sessionId: "initial-child",
        prompt: textPrompt("research"),
        metadata: { source: "admission" },
      },
    ],
  }

  it.effect("admits, executes, and replays the root and child together", () =>
    Effect.gen(function* () {
      const runtime = yield* Runtime.Runtime
      const store = yield* RunStore.RunStore
      const first = yield* runtime.start(base)
      const duplicate = yield* runtime.start(base)
      expect(duplicate).toEqual({ ...first, duplicate: true })
      expect(first.childRunIds).toHaveLength(1)
      const child = yield* store.loadExecution(first.childRunIds[0]!)
      expect(child.parentRunId).toBe(first.runId)
      expect(child.invocationId).toBe("initial-research")
      expect(child.executableRef).toEqual(researcherRef.ref)
      expect(child.message.metadata).toEqual({ source: "admission" })
      expect(
        (yield* runtime.history({ runId: first.runId, limit: 100 })).find((event) => event._tag === "ChildLinked"),
      ).toMatchObject({
        childRunId: child.runId,
        invocationId: "initial-research",
        selection: "researcher",
        prompt: textPrompt("research"),
      })
      expect((yield* runtime.inspect(first.runId)).status).toBe("queued")
      const childFanOut = yield* runtime.fanOut({
        parentRunId: child.runId,
        idempotencyKey: "child-review",
        members: [{ key: "analysis", selection: "analyst", prompt: "analyze" }],
        concurrency: 1,
        join: { _tag: "AllSuccess" },
        remainder: "await",
      })
      yield* store.complete({
        ...(yield* store.claimExecution({ runId: child.runId, ownerId: "initial-test" })),
        result: completedResult("researched"),
      })
      expect((yield* runtime.inspect(child.runId)).status).toBe("waiting")
      expect((yield* runtime.inspect(first.runId)).status).toBe("queued")
      const reviewRunId = childFanOut.childRunIds[0]!
      yield* store.complete({
        ...(yield* store.claimExecution({ runId: reviewRunId, ownerId: "initial-review" })),
        result: completedResult("reviewed"),
      })
      expect((yield* runtime.inspect(child.runId)).status).toBe("succeeded")
      expect((yield* runtime.inspect(first.runId)).status).toBe("running")
    }),
  )

  it.effect("rolls back all admission on an invalid selection and conflicts on changed source", () =>
    Effect.gen(function* () {
      const runtime = yield* Runtime.Runtime
      const before = yield* runtime.list({ limit: 10 })
      const invalid = yield* runtime
        .start({
          ...base,
          idempotencyKey: "invalid-initial",
          initialChildren: [
            ...base.initialChildren,
            {
              invocationId: "missing",
              idempotencyKey: "missing",
              selection: "missing",
              sessionId: "missing",
              prompt: "missing",
            },
          ],
        })
        .pipe(Effect.flip)
      expect(invalid).toBeInstanceOf(Errors.ChildSelectionMissing)
      expect(yield* runtime.list({ limit: 10 })).toEqual(before)

      yield* runtime.start(base)
      const changed = yield* runtime
        .start({
          ...base,
          initialChildren: [{ ...base.initialChildren[0]!, prompt: textPrompt("changed") }],
        })
        .pipe(Effect.flip)
      expect(changed).toBeInstanceOf(Errors.IdempotencyConflict)
      expect((yield* runtime.treeCheckpoint((yield* runtime.start(base)).runId)).inspection.runs).toHaveLength(3)
    }),
  )

  it.effect("admits typed file bytes in an initial child prompt", () =>
    Effect.gen(function* () {
      const runtime = yield* Runtime.Runtime
      const receipt = yield* runtime.start({
        ...base,
        idempotencyKey: "initial-child-file",
        initialChildren: [{ ...base.initialChildren[0]!, prompt: filePrompt(new Uint8Array([4, 5, 6])) }],
      })
      expect(receipt.childRunIds).toHaveLength(1)
    }),
  )
})

layer(initialChildrenLayer)("Runtime atomic initial fan-out", (it) => {
  const input = {
    executable: assistantRef,
    registrations: registrationsFor(assistantRef),
    sessionId: "initial-fan-out-root",
    idempotencyKey: "initial-fan-out-root",
    prompt: textPrompt("root"),
    initialFanOuts: [
      {
        idempotencyKey: "reviews",
        members: [
          { key: "correctness", selection: "researcher", prompt: "review correctness" },
          { key: "security", selection: "researcher", prompt: "review security" },
        ],
        concurrency: 1,
        join: { _tag: "AllSettled" as const },
        remainder: "await" as const,
      },
    ],
  }

  it.effect("commits deterministic members and holds the original root result until join", () =>
    Effect.gen(function* () {
      const runtime = yield* Runtime.Runtime
      const store = yield* RunStore.RunStore
      const first = yield* runtime.start(input)
      const duplicate = yield* runtime.start(input)
      expect(first.childRunIds).toEqual([])
      expect(first.fanOuts).toHaveLength(1)
      expect(duplicate).toEqual({
        ...first,
        duplicate: true,
        fanOuts: first.fanOuts.map((fanOut) => ({ ...fanOut, duplicate: true })),
      })
      const fanOut = first.fanOuts[0]!
      expect(fanOut.childRunIds).toEqual([`${fanOut.fanOutId}_0`, `${fanOut.fanOutId}_1`])
      const rootClaim = yield* store.claimExecution({ runId: first.runId, ownerId: "initial-fan-out-root" })
      yield* store.complete({ ...rootClaim, result: completedResult("root result") })
      expect((yield* runtime.inspect(first.runId)).status).toBe("waiting")
      for (const childRunId of fanOut.childRunIds) {
        const claim = yield* store.claimExecution({ runId: childRunId, ownerId: `initial:${childRunId}` })
        yield* store.complete({ ...claim, result: completedResult(childRunId) })
      }
      expect((yield* runtime.inspect(first.runId)).status).toBe("succeeded")
      const events = yield* runtime.history({ runId: first.runId, limit: 100 })
      const linked = events.filter((event) => event._tag === "ChildLinked")
      expect(linked.map((event) => event.selection)).toEqual(["researcher", "researcher"])
      expect(linked.map((event) => event.prompt)).toEqual([
        textPrompt("review correctness"),
        textPrompt("review security"),
      ])
      expect(events.at(-2)?._tag).toBe("FanOutJoined")
      expect(events.at(-1)).toMatchObject({ _tag: "RunCompleted", result: completedResult("root result") })
      expect(
        yield* runtime
          .start({
            ...input,
            initialFanOuts: [
              {
                ...input.initialFanOuts[0]!,
                members: [{ ...input.initialFanOuts[0]!.members[0]!, prompt: "changed" }],
              },
            ],
          })
          .pipe(Effect.flip),
      ).toBeInstanceOf(Errors.IdempotencyConflict)
    }),
  )

  it.effect("admits typed file bytes in an initial fan-out member prompt", () =>
    Effect.gen(function* () {
      const runtime = yield* Runtime.Runtime
      const receipt = yield* runtime.start({
        ...input,
        idempotencyKey: "initial-fan-out-file",
        initialFanOuts: [
          {
            ...input.initialFanOuts[0]!,
            members: [
              {
                ...input.initialFanOuts[0]!.members[0]!,
                prompt: filePrompt(new Uint8Array([7, 8, 9])),
              },
            ],
          },
        ],
      })
      expect(receipt.fanOuts[0]?.childRunIds).toHaveLength(1)
    }),
  )
})

standalone.effect("reopens an atomic SQLite root and initial child admission", () =>
  Effect.gen(function* () {
    const filename = tempDbPath("tenetkit-initial-children")
    const options = { ...parentRelativeOptions, filename, addresses: [] }
    const input = {
      executable: assistantRef,
      registrations: registrationsFor(assistantRef),
      sessionId: "sqlite-initial",
      idempotencyKey: "sqlite-initial",
      prompt: "root",
      initialChildren: [
        {
          invocationId: "research",
          idempotencyKey: "research",
          selection: "researcher",
          sessionId: "sqlite-child",
          prompt: "child",
        },
      ],
    }
    const first = yield* provideScoped(
      SqliteRuntime.layerSqlite(options),
      Effect.gen(function* () {
        const runtime = yield* Runtime.Runtime
        expect(
          yield* runtime
            .start({
              ...input,
              initialChildren: [
                ...input.initialChildren,
                {
                  invocationId: "missing",
                  idempotencyKey: "missing",
                  selection: "missing",
                  sessionId: "sqlite-missing",
                  prompt: "missing",
                },
              ],
            })
            .pipe(Effect.flip),
        ).toBeInstanceOf(Errors.ChildSelectionMissing)
        expect(yield* runtime.list({ limit: 10 })).toEqual([])
        const receipt = yield* runtime.start(input)
        expect((yield* runtime.inspect(receipt.runId)).status).toBe("queued")
        const store = yield* RunStore.RunStore
        yield* store.complete({
          ...(yield* store.claimExecution({ runId: receipt.childRunIds[0]!, ownerId: "initial-sqlite-test" })),
          result: completedResult("researched"),
        })
        expect((yield* runtime.inspect(receipt.runId)).status).toBe("running")
        return receipt
      }),
    )
    const duplicate = yield* provideScoped(
      SqliteRuntime.layerSqlite(options),
      Effect.gen(function* () {
        const runtime = yield* Runtime.Runtime
        const receipt = yield* runtime.start(input)
        expect((yield* runtime.treeCheckpoint(receipt.runId)).inspection.runs).toHaveLength(2)
        expect(
          (yield* runtime.history({ runId: receipt.runId, limit: 100 })).find((event) => event._tag === "ChildLinked"),
        ).toMatchObject({
          childRunId: receipt.childRunIds[0],
          invocationId: "research",
          selection: "researcher",
          prompt: textPrompt("child"),
        })
        return receipt
      }),
    )
    expect(duplicate).toEqual({ ...first, duplicate: true })
  }),
)

standalone.effect("loads typed root prompt bytes immediately and after reopening SQLite", () =>
  Effect.gen(function* () {
    const filename = tempDbPath("tenetkit-root-file-bytes")
    const options = { ...parentRelativeOptions, filename, addresses: [] }
    const bytes = new Uint8Array([0, 1, 2, 255])
    const assertFileBytes = (prompt: Prompt.Prompt) => {
      const content = prompt.content[0]?.content
      expect(Array.isArray(content)).toBe(true)
      if (!Array.isArray(content)) throw new Error("expected multipart user content")
      const file = Schema.decodeUnknownSync(Schema.Struct({ type: Schema.Literal("file"), data: Schema.Unknown }))(
        content[1],
      )
      expect(file?.type).toBe("file")
      if (file?.type !== "file") throw new Error("expected file content")
      const restored = Schema.decodeUnknownSync(Schema.toCodecJson(Schema.Uint8Array))(file.data)
      expect(restored).toBeInstanceOf(Uint8Array)
      expect(restored).toEqual(bytes)
    }
    const input = {
      executable: assistantRef,
      registrations: registrationsFor(assistantRef),
      sessionId: "sqlite-root-file-bytes",
      idempotencyKey: "sqlite-root-file-bytes",
      prompt: filePrompt(bytes),
    }

    const runId = yield* provideScoped(
      SqliteRuntime.layerSqlite(options),
      Effect.gen(function* () {
        const runtime = yield* Runtime.Runtime
        const receipt = yield* runtime.start(input)
        const store = yield* RunStore.RunStore
        assertFileBytes((yield* store.loadExecution(receipt.runId)).message.prompt)
        return receipt.runId
      }),
    )
    yield* provideScoped(
      SqliteRuntime.layerSqlite(options),
      Effect.gen(function* () {
        const store = yield* RunStore.RunStore
        assertFileBytes((yield* store.loadExecution(runId)).message.prompt)
      }),
    )
  }),
)

standalone.effect("reloads SQLite registrations without address binding and closes resolver resources", () =>
  Effect.gen(function* () {
    const filename = tempDbPath("tenetkit-exact-start")
    const registrations = registrationsFor(assistantRef).map(({ pin, codec, version }) => ({
      pin,
      codec,
      version,
      payload: { credentialRef: "credential:test" },
    }))
    const firstLayer = SqliteRuntime.layerSqlite({
      filename,
      addresses: [],
      resolver: ExecutableResolver.makeStatic([{ executable: assistantRef, agent: closedTestAgent(assistant) }]),
    })
    const receipt = yield* provideScoped(
      firstLayer,
      Effect.gen(function* () {
        const runtime = yield* Runtime.Runtime
        return yield* runtime.start({
          executable: assistantRef,
          registrations,
          sessionId: "sqlite-exact",
          idempotencyKey: "start",
          prompt: "recover",
        })
      }),
    )

    const finalizers = yield* Ref.make(0)
    const resolver = ExecutableResolver.ExecutableResolver.of({
      resolve: (input) =>
        Effect.acquireRelease(
          Effect.sync(() => {
            expect(input.registrations).toEqual(
              [...registrations].toSorted((left, right) => left.pin.localeCompare(right.pin)),
            )
            return {
              _tag: "Agent" as const,
              agent: closedTestAgent(assistant),
              attestation: { ref: assistantRef.ref, manifest: assistantRef.manifest },
            }
          }),
          () => Ref.update(finalizers, (count) => count + 1),
        ),
    })
    const reopened = SqliteRuntime.layerSqlite({ filename, addresses: [], resolver })
    yield* provideScoped(
      reopened,
      Effect.gen(function* () {
        const store = yield* RunStore.RunStore
        const execution = yield* store.loadExecution(receipt.runId)
        yield* Effect.scoped(
          resolver.resolve({
            runId: execution.runId,
            ref: execution.executableRef,
            manifest: execution.executableManifest,
            registrations: execution.registrations,
          }),
        )
      }),
    )
    expect(yield* Ref.get(finalizers)).toBe(1)

    const database = new Database(filename)
    const rows = database
      .query<{ payload_json: string }, []>("SELECT payload_json FROM tenetkit_executable_registrations")
      .all()
    database.close()
    expect(rows.map((row) => row.payload_json).join("\n")).toContain("credential:test")
    expect(rows.map((row) => row.payload_json).join("\n")).not.toContain("resolved-secret-value")
  }),
)

standalone.effect("recovers an addressed Run from persisted send registrations without a live address binding", () =>
  Effect.gen(function* () {
    const filename = tempDbPath("tenetkit-addressed-send")
    const registrations = registrationsFor(assistantRef).map(({ pin, codec, version }) => ({
      pin,
      codec,
      version,
      payload: { credentialRef: "credential:addressed" },
    }))
    const address = Address.make("agent:addressed")
    const receipt = yield* provideScoped(
      SqliteRuntime.layerSqlite({
        filename,
        addresses: [{ address, executable: assistantRef, registrations }],
        resolver: ExecutableResolver.makeStatic([{ executable: assistantRef, agent: closedTestAgent(assistant) }]),
      }),
      Effect.gen(function* () {
        const runtime = yield* Runtime.Runtime
        return yield* runtime.send({
          to: address,
          sessionId: "addressed-session",
          idempotencyKey: "addressed",
          prompt: "recover",
        })
      }),
    )

    const reopened = SqliteRuntime.layerSqlite({
      filename,
      addresses: [],
      resolver: ExecutableResolver.makeStatic([{ executable: assistantRef, agent: closedTestAgent(assistant) }]),
    })
    yield* provideScoped(
      reopened,
      Effect.gen(function* () {
        const store = yield* RunStore.RunStore
        const execution = yield* store.loadExecution(receipt.runId)
        expect(execution.registrations).toEqual(
          [...registrations].toSorted((left, right) => left.pin.localeCompare(right.pin)),
        )
      }),
    )
  }),
)

{
  const compaction = {
    service: Pins.makeCapability({ service: "compaction", revision: 1 }),
    summaryModel: Pins.makeModel({ model: "summary", revision: 1 }),
    contextWindow: 64_000,
    reserveTokens: 4_000,
    keepRecentTokens: 8_000,
    strategyIdentity: "default:v1",
    summaryPromptIdentity: "summary:v1",
  }
  const pinned = AgentManifest.fromLiveAgent(assistant, {
    model: Pins.makeModel({ model: "conversation", revision: 1 }),
    tools: [],
    skills: [],
    services: [],
    policy: { _tag: "Portable", policy: { _tag: "Forever" } },
    compaction,
    budget: {},
    children: [],
  })
  const executable = ExecutableManifest.make({ root: pinned.pin, entries: [{ _tag: "Agent", ...pinned }] })
  const registrations = registrationsFor(executable).map((registration) => ({
    pin: registration.pin,
    codec: registration.pin === compaction.service ? "compaction-policy" : registration.codec,
    version: registration.version,
    payload:
      registration.pin === compaction.service
        ? { keepRecentTokens: 8_000, strategyIdentity: "default:v1", summaryPromptIdentity: "summary:v1" }
        : registration.payload,
  }))
  const compactionRuntimeLayer = Runtime.layerMemory({
    addresses: [],
    resolver: ExecutableResolver.makeStatic([
      {
        executable,
        agent: closedTestAgent(assistant),
        runOptions: {
          compaction: { contextWindow: compaction.contextWindow, reserveTokens: compaction.reserveTokens },
        },
      },
    ]),
  })

  layer(compactionRuntimeLayer)(
    "requires both pinned compaction registrations and conflicts on changed policy",
    (it) => {
      it.effect("requires both pinned compaction registrations and conflicts on changed policy", () =>
        Effect.gen(function* () {
          const runtime = yield* Runtime.Runtime
          const base = {
            executable,
            registrations,
            sessionId: "compaction-registration",
            idempotencyKey: "compaction-registration",
            prompt: "run",
          }
          const invalidPolicy = registrations.map((registration) => ({
            pin: registration.pin,
            codec: registration.codec,
            version: registration.version,
            payload:
              registration.pin === compaction.service
                ? {
                    keepRecentTokens: 8_000,
                    strategyIdentity: "default:v1",
                    summaryPromptIdentity: "summary:v1",
                    resolvedSecret: "must-not-persist",
                  }
                : registration.payload,
          }))
          expect(
            yield* runtime
              .start({ ...base, idempotencyKey: "invalid-policy", registrations: invalidPolicy })
              .pipe(Effect.flip),
          ).toBeInstanceOf(Errors.ExecutableRegistrationInvalid)
          const missingService = yield* runtime
            .start({
              ...base,
              idempotencyKey: "missing-service",
              registrations: registrations.filter((item) => item.pin !== compaction.service),
            })
            .pipe(Effect.flip)
          const missingSummary = yield* runtime
            .start({
              ...base,
              idempotencyKey: "missing-summary",
              registrations: registrations.filter((item) => item.pin !== compaction.summaryModel),
            })
            .pipe(Effect.flip)
          expect(missingService).toBeInstanceOf(Errors.ExecutableRegistrationMissing)
          expect(missingSummary).toBeInstanceOf(Errors.ExecutableRegistrationMissing)

          yield* runtime.start(base)
          const changed = registrations.map((registration) => ({
            pin: registration.pin,
            codec: registration.codec,
            version: registration.version,
            payload:
              registration.pin === compaction.service
                ? { keepRecentTokens: 4_000, strategyIdentity: "default:v1", summaryPromptIdentity: "summary:v1" }
                : registration.payload,
          }))
          expect(
            yield* runtime
              .start({ ...base, idempotencyKey: "changed-policy", registrations: changed })
              .pipe(Effect.flip),
          ).toBeInstanceOf(Errors.ExecutableRegistrationInvalid)
        }),
      )
    },
  )
}
