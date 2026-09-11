import { makeObjectStorage, objectRuntimeLayer, objectWorkerId } from "../execution/object.js"
import { expect, it as standalone, layer } from "@effect/vitest"
import { provideScoped } from "../execution/scoped-provide.js"
import { Effect, Layer, Ref, Schema } from "effect"
import { Prompt } from "effect/unstable/ai"
import { Agent, AgentManifest, ExecutableManifest, Pins } from "../../../src/index.js"
import { Address, Errors, ExecutableResolver, RunStore, Runtime } from "../../../src/runtime/index.js"
import {
  alternateAssistant,
  alternateAssistantRef,
  assistant,
  assistantRef,
  completedResult,
  parentRelativeOptions,
  resolverLayer,
  researcherRef,
  textPrompt,
} from "../execution/fixtures.js"
import { unusedModel } from "../run/identity.js"

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

const runtimeLayer = objectRuntimeLayer({
  addresses: [],
}).pipe(
  Layer.provide(
    ExecutableResolver.layerStatic([
      { executable: assistantRef, agent: closedTestAgent(assistant) },
      { executable: alternateAssistantRef, agent: closedTestAgent(alternateAssistant) },
    ]).pipe(Layer.orDie),
  ),
)

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
      const first = yield* runtime.startExecution(input)
      const duplicate = yield* runtime.startExecution(input)
      expect(duplicate.runId).toBe(first.runId)
      expect(duplicate).toEqual(first)
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
      const first = yield* runtime.startExecution(base)
      const changedPrompt = yield* runtime.startExecution({ ...base, prompt: textPrompt("changed") }).pipe(Effect.flip)
      expect(changedPrompt).toBeInstanceOf(Errors.IdempotencyConflict)
      expect(changedPrompt).toMatchObject({
        address: Address.make("runtime:start"),
        sessionId: "conflict-session",
        idempotencyKey: "same",
        existingRunId: first.runId,
      })
      const changedExecutable = yield* runtime
        .startExecution({
          ...base,
          executable: alternateAssistantRef,
          registrations: registrationsFor(alternateAssistantRef),
        })
        .pipe(Effect.flip)
      expect(changedExecutable).toBeInstanceOf(Errors.IdempotencyConflict)
      expect(changedExecutable).toMatchObject({ existingRunId: first.runId })
      const changedRegistrations = yield* runtime
        .startExecution({ ...base, registrations: registrationsFor(assistantRef, "changed") })
        .pipe(Effect.flip)
      expect(changedRegistrations).toBeInstanceOf(Errors.IdempotencyConflict)
      expect(changedRegistrations).toMatchObject({ existingRunId: first.runId })
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
      const first = yield* runtime.startExecution(input)
      expect(yield* runtime.startExecution({ ...input, prompt: filePrompt(new Uint8Array([0, 1, 2, 255])) })).toEqual(
        first,
      )
      const changed = yield* runtime
        .startExecution({ ...input, prompt: filePrompt(new Uint8Array([0, 1, 3, 255])) })
        .pipe(Effect.flip)
      expect(changed).toBeInstanceOf(Errors.IdempotencyConflict)
      expect(changed).toMatchObject({
        sessionId: "file-session",
        idempotencyKey: "file-key",
        existingRunId: first.runId,
      })
    }),
  )

  it.effect("rejects a registration pin mismatch and a missing required pin", () =>
    Effect.gen(function* () {
      const runtime = yield* Runtime.Runtime
      const registrations = registrationsFor(assistantRef)
      const mismatch = yield* runtime
        .startExecution({
          executable: assistantRef,
          registrations: [...registrations, { pin: "capability:unrelated", codec: "test", version: "1", payload: {} }],
          sessionId: "invalid-session",
          idempotencyKey: "mismatch",
          prompt: "hello",
        })
        .pipe(Effect.flip)
      expect(mismatch).toBeInstanceOf(Errors.ExecutableRegistrationInvalid)
      const missing = yield* runtime
        .startExecution({
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
        .startExecution({
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

const initialChildrenLayer = objectRuntimeLayer({ ...parentRelativeOptions, addresses: [] }).pipe(
  Layer.provide(resolverLayer),
)

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
      const first = yield* runtime.startExecution(base)
      const duplicate = yield* runtime.startExecution(base)
      expect(duplicate).toEqual(first)
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
      const childClaim = yield* store.claimExecution({
        commandId: `${child.runId}:start:claim`,
        runId: child.runId,
        ownerId: objectWorkerId,
      })
      yield* store.complete({
        commandId: `${child.runId}:start:complete`,
        ...childClaim,
        result: completedResult("researched"),
      })
      expect((yield* runtime.inspect(child.runId)).status).toBe("waiting")
      expect((yield* runtime.inspect(first.runId)).status).toBe("queued")
      const reviewRunId = childFanOut.childRunIds[0]!
      const reviewClaim = yield* store.claimExecution({
        commandId: `${reviewRunId}:start:claim`,
        runId: reviewRunId,
        ownerId: objectWorkerId,
      })
      yield* store.complete({
        commandId: `${reviewRunId}:start:complete`,
        ...reviewClaim,
        result: completedResult("reviewed"),
      })
      expect((yield* runtime.inspect(child.runId)).status).toBe("succeeded")
      expect((yield* runtime.inspect(first.runId)).status).toBe("running")
    }),
  )

  it.effect("rejects a rewind on a root with admitted children without mutating the Run", () =>
    Effect.gen(function* () {
      const runtime = yield* Runtime.Runtime
      const store = yield* RunStore.RunStore
      const started = yield* runtime.startExecution({
        ...base,
        sessionId: "rewind-initial-root",
        idempotencyKey: "rewind-initial-root",
        initialChildren: [
          {
            ...base.initialChildren[0]!,
            invocationId: "rewind-initial-research",
            idempotencyKey: "rewind-initial-research",
            sessionId: "rewind-initial-child",
          },
        ],
      })
      const childRunId = started.childRunIds[0]!
      const childClaim = yield* store.claimExecution({
        commandId: `${childRunId}:rewind:claim`,
        runId: childRunId,
        ownerId: objectWorkerId,
      })
      yield* store.complete({
        commandId: `${childRunId}:rewind:complete`,
        ...childClaim,
        result: completedResult("researched"),
      })
      expect((yield* runtime.inspect(started.runId)).status).toBe("running")
      const rootClaim = yield* store.claimExecution({
        commandId: `${started.runId}:rewind:claim`,
        runId: started.runId,
        ownerId: objectWorkerId,
      })
      yield* store.complete({
        commandId: `${started.runId}:rewind:complete`,
        ...rootClaim,
        result: completedResult("root done"),
      })
      const before = yield* runtime.inspect(started.runId)
      const historyBefore = yield* runtime.history({ runId: started.runId, limit: 100 })
      expect(before.status).toBe("succeeded")

      const rewind = yield* runtime
        .rewind(started.runId, { commandId: "rewind-initial-root", toSequence: 0 })
        .pipe(Effect.flip)
      expect(rewind).toBeInstanceOf(Errors.RuntimeUnavailable)
      expect(rewind).toMatchObject({ message: `run ${started.runId} has initial children` })

      const inspection = yield* runtime.inspect(started.runId)
      expect(inspection).toEqual(before)
      expect(inspection.status).toBe("succeeded")
      expect(inspection.children).toHaveLength(1)
      expect(yield* runtime.history({ runId: started.runId, limit: 100 })).toEqual(historyBefore)
      expect(historyBefore.some((event) => event._tag === "RunRewound")).toBe(false)
      expect(
        yield* store
          .claimExecution({ commandId: "rewind-initial-root-reclaim", runId: started.runId, ownerId: objectWorkerId })
          .pipe(Effect.flip),
      ).toMatchObject({ _tag: "generalist/runtime/RunTerminal", status: "succeeded" })
    }),
  )

  it.effect("rolls back all admission on an invalid selection and conflicts on changed source", () =>
    Effect.gen(function* () {
      const runtime = yield* Runtime.Runtime
      const before = yield* runtime.list({ limit: 10 })
      const invalid = yield* runtime
        .startExecution({
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

      const first = yield* runtime.startExecution(base)
      const changed = yield* runtime
        .startExecution({
          ...base,
          initialChildren: [{ ...base.initialChildren[0]!, prompt: textPrompt("changed") }],
        })
        .pipe(Effect.flip)
      expect(changed).toBeInstanceOf(Errors.IdempotencyConflict)
      expect(changed).toMatchObject({
        sessionId: "initial-root",
        idempotencyKey: "initial-root",
        existingRunId: first.runId,
      })
      expect((yield* runtime.treeCheckpoint((yield* runtime.startExecution(base)).runId)).inspection.runs).toHaveLength(
        3,
      )
    }),
  )

  it.effect("admits typed file bytes in an initial child prompt", () =>
    Effect.gen(function* () {
      const runtime = yield* Runtime.Runtime
      const receipt = yield* runtime.startExecution({
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
      const first = yield* runtime.startExecution(input)
      const duplicate = yield* runtime.startExecution(input)
      expect(first.childRunIds).toEqual([])
      expect(first.fanOuts).toHaveLength(1)
      expect(duplicate).toEqual(first)
      const fanOut = first.fanOuts[0]!
      expect(fanOut.childRunIds).toEqual([`${fanOut.fanOutId}_0`, `${fanOut.fanOutId}_1`])
      const rootClaim = yield* store.claimExecution({
        commandId: `${first.runId}:start:claim`,
        runId: first.runId,
        ownerId: objectWorkerId,
      })
      yield* store.complete({
        commandId: `${first.runId}:start:complete`,
        ...rootClaim,
        result: completedResult("root result"),
      })
      expect((yield* runtime.inspect(first.runId)).status).toBe("waiting")
      for (const childRunId of fanOut.childRunIds) {
        const claim = yield* store.claimExecution({
          commandId: `${childRunId}:start:claim`,
          runId: childRunId,
          ownerId: objectWorkerId,
        })
        yield* store.complete({
          commandId: `${childRunId}:start:complete`,
          ...claim,
          result: completedResult(childRunId),
        })
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
      const changed = yield* runtime
        .startExecution({
          ...input,
          initialFanOuts: [
            {
              ...input.initialFanOuts[0]!,
              members: [{ ...input.initialFanOuts[0]!.members[0]!, prompt: "changed" }],
            },
          ],
        })
        .pipe(Effect.flip)
      expect(changed).toBeInstanceOf(Errors.IdempotencyConflict)
      expect(changed).toMatchObject({
        sessionId: "initial-fan-out-root",
        idempotencyKey: "initial-fan-out-root",
        existingRunId: first.runId,
      })
    }),
  )

  it.effect("admits typed file bytes in an initial fan-out member prompt", () =>
    Effect.gen(function* () {
      const runtime = yield* Runtime.Runtime
      const receipt = yield* runtime.startExecution({
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

standalone.effect("reopens an atomic object root and initial child admission", () =>
  Effect.gen(function* () {
    const storage = makeObjectStorage()
    const options = { ...parentRelativeOptions, addresses: [] }
    const input = {
      executable: assistantRef,
      registrations: registrationsFor(assistantRef),
      sessionId: "object-initial",
      idempotencyKey: "object-initial",
      prompt: "root",
      initialChildren: [
        {
          invocationId: "research",
          idempotencyKey: "research",
          selection: "researcher",
          sessionId: "object-child",
          prompt: "child",
        },
      ],
    }
    const first = yield* provideScoped(
      objectRuntimeLayer(options, storage).pipe(Layer.provide(resolverLayer)),
      Effect.gen(function* () {
        const runtime = yield* Runtime.Runtime
        expect(
          yield* runtime
            .startExecution({
              ...input,
              initialChildren: [
                ...input.initialChildren,
                {
                  invocationId: "missing",
                  idempotencyKey: "missing",
                  selection: "missing",
                  sessionId: "object-missing",
                  prompt: "missing",
                },
              ],
            })
            .pipe(Effect.flip),
        ).toBeInstanceOf(Errors.ChildSelectionMissing)
        expect(yield* runtime.list({ limit: 10 })).toEqual([])
        const receipt = yield* runtime.startExecution(input)
        expect((yield* runtime.inspect(receipt.runId)).status).toBe("queued")
        const store = yield* RunStore.RunStore
        const childRunId = receipt.childRunIds[0]!
        const claim = yield* store.claimExecution({
          commandId: `${childRunId}:start:claim`,
          runId: childRunId,
          ownerId: objectWorkerId,
        })
        yield* store.complete({
          commandId: `${childRunId}:start:complete`,
          ...claim,
          result: completedResult("researched"),
        })
        expect((yield* runtime.inspect(receipt.runId)).status).toBe("running")
        return receipt
      }),
    )
    const duplicate = yield* provideScoped(
      objectRuntimeLayer(options, storage).pipe(Layer.provide(resolverLayer)),
      Effect.gen(function* () {
        const runtime = yield* Runtime.Runtime
        const receipt = yield* runtime.startExecution(input)
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
    expect(duplicate).toEqual(first)
  }),
)

standalone.effect("loads typed root prompt bytes immediately and after reopening object storage", () =>
  Effect.gen(function* () {
    const storage = makeObjectStorage()
    const options = { ...parentRelativeOptions, addresses: [] }
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
      expect(Schema.decodeUnknownSync(Schema.Uint8Array)(file.data)).toEqual(bytes)
    }
    const input = {
      executable: assistantRef,
      registrations: registrationsFor(assistantRef),
      sessionId: "object-root-file-bytes",
      idempotencyKey: "object-root-file-bytes",
      prompt: filePrompt(bytes),
    }
    const runId = yield* provideScoped(
      objectRuntimeLayer(options, storage).pipe(Layer.provide(resolverLayer)),
      Effect.gen(function* () {
        const runtime = yield* Runtime.Runtime
        const receipt = yield* runtime.startExecution(input)
        const execution = yield* (yield* RunStore.RunStore).loadExecution(receipt.runId)
        assertFileBytes(execution.message.prompt)
        return receipt.runId
      }),
    )
    yield* provideScoped(
      objectRuntimeLayer(options, storage).pipe(Layer.provide(resolverLayer)),
      Effect.gen(function* () {
        assertFileBytes((yield* (yield* RunStore.RunStore).loadExecution(runId)).message.prompt)
      }),
    )
  }),
)

standalone.effect("reloads object registrations without address binding and closes resolver resources", () =>
  Effect.gen(function* () {
    const storage = makeObjectStorage()
    const registrations = registrationsFor(assistantRef).map(({ pin, codec, version }) => ({
      pin,
      codec,
      version,
      payload: { credentialRef: "credential:test" },
    }))
    const firstLayer = objectRuntimeLayer({ addresses: [] }, storage).pipe(
      Layer.provide(
        ExecutableResolver.layerStatic([{ executable: assistantRef, agent: closedTestAgent(assistant) }]).pipe(
          Layer.orDie,
        ),
      ),
    )
    const receipt = yield* provideScoped(
      firstLayer,
      Effect.gen(function* () {
        return yield* (yield* Runtime.Runtime).startExecution({
          executable: assistantRef,
          registrations,
          sessionId: "object-exact",
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
    yield* provideScoped(
      objectRuntimeLayer({ addresses: [] }, storage).pipe(
        Layer.provide(Layer.succeed(ExecutableResolver.ExecutableResolver, resolver)),
      ),
      Effect.gen(function* () {
        const execution = yield* (yield* RunStore.RunStore).loadExecution(receipt.runId)
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
    const persisted = yield* provideScoped(
      objectRuntimeLayer({ addresses: [] }, storage).pipe(Layer.provide(resolverLayer)),
      Effect.gen(function* () {
        return yield* (yield* RunStore.RunStore).loadExecution(receipt.runId)
      }),
    )
    const encodedRegistrations = yield* Schema.encodeEffect(Schema.fromJsonString(Schema.Unknown))(
      persisted.registrations,
    ).pipe(Effect.orDie)
    expect(encodedRegistrations).toContain("credential:test")
    expect(encodedRegistrations).not.toContain("resolved-secret-value")
  }),
)

standalone.effect("recovers an addressed Run from persisted send registrations without a live address binding", () =>
  Effect.gen(function* () {
    const storage = makeObjectStorage()
    const registrations = registrationsFor(assistantRef).map(({ pin, codec, version }) => ({
      pin,
      codec,
      version,
      payload: { credentialRef: "credential:addressed" },
    }))
    const address = Address.make("agent:addressed")
    const receipt = yield* provideScoped(
      objectRuntimeLayer({ addresses: [{ address, executable: assistantRef, registrations }] }, storage).pipe(
        Layer.provide(resolverLayer),
      ),
      Effect.gen(function* () {
        return yield* (yield* Runtime.Runtime).send({
          to: address,
          sessionId: "addressed-session",
          idempotencyKey: "addressed",
          prompt: "recover",
        })
      }),
    )
    const execution = yield* provideScoped(
      objectRuntimeLayer({ addresses: [] }, storage).pipe(Layer.provide(resolverLayer)),
      Effect.gen(function* () {
        return yield* (yield* RunStore.RunStore).loadExecution(receipt.runId)
      }),
    )
    expect(execution.registrations).toEqual(
      [...registrations].toSorted((left, right) => left.pin.localeCompare(right.pin)),
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
  const compactionRuntimeLayer = objectRuntimeLayer({
    addresses: [],
  }).pipe(
    Layer.provide(
      ExecutableResolver.layerStatic([
        {
          executable,
          agent: closedTestAgent(assistant),
          runOptions: {
            compaction: { contextWindow: compaction.contextWindow, reserveTokens: compaction.reserveTokens },
          },
        },
      ]).pipe(Layer.orDie),
    ),
  )

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
              .startExecution({ ...base, idempotencyKey: "invalid-policy", registrations: invalidPolicy })
              .pipe(Effect.flip),
          ).toBeInstanceOf(Errors.ExecutableRegistrationInvalid)
          const missingService = yield* runtime
            .startExecution({
              ...base,
              idempotencyKey: "missing-service",
              registrations: registrations.filter((item) => item.pin !== compaction.service),
            })
            .pipe(Effect.flip)
          const missingSummary = yield* runtime
            .startExecution({
              ...base,
              idempotencyKey: "missing-summary",
              registrations: registrations.filter((item) => item.pin !== compaction.summaryModel),
            })
            .pipe(Effect.flip)
          expect(missingService).toBeInstanceOf(Errors.ExecutableRegistrationMissing)
          expect(missingSummary).toBeInstanceOf(Errors.ExecutableRegistrationMissing)

          yield* runtime.startExecution(base)
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
              .startExecution({ ...base, idempotencyKey: "changed-policy", registrations: changed })
              .pipe(Effect.flip),
          ).toBeInstanceOf(Errors.ExecutableRegistrationInvalid)
        }),
      )
    },
  )
}
