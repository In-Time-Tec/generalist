import { describe, expect, it } from "@effect/vitest"
import { Deferred, Effect, Fiber, Layer, Option, Scope, Stream } from "effect"
import { LanguageModel, Prompt, Response } from "effect/unstable/ai"
import { Agent, Session, ToolContext } from "../../../src/index.js"
import { layerMemory } from "../../../src/core/context/session-memory.js"
import { Json } from "../json.js"
import { withProviderFinish } from "../provider-finish.js"

type ModelParams = Parameters<typeof LanguageModel.make>[0]

const modelLayer = (streamText: ModelParams["streamText"]) =>
  Layer.effect(
    LanguageModel.LanguageModel,
    LanguageModel.make({
      generateText: () => Effect.succeed([{ type: "text", text: "unused" }]),
      streamText: (options) => withProviderFinish(streamText(options)),
    }),
  )

const textDelta = (text: string) => Response.makePart("text-delta", { id: "text", delta: text })

const user = (text: string): Prompt.Message =>
  Prompt.makeMessage("user", { content: [Prompt.makePart("text", { text })] })

const pathText = (path: ReadonlyArray<Session.Entry>): string => Json.stringify(Session.buildContext(path).content)

const provideScoped = <A, E, R>(
  services: Layer.Layer<R>,
  effect: Effect.Effect<A, E, R | Scope.Scope>,
): Effect.Effect<A, E> =>
  Effect.scoped(Effect.flatMap(Layer.build(services), (context) => Effect.provideContext(effect, context)))

describe("memory SessionDirectory binding", () => {
  it.effect("runs different IDs concurrently without sharing history", () => {
    let started = 0
    let bothStarted: Deferred.Deferred<void> | undefined
    const prompts: Array<string> = []
    const layer = Layer.merge(
      layerMemory,
      modelLayer((options) =>
        Stream.fromEffect(
          Effect.gen(function* () {
            prompts.push(Json.stringify(options.prompt.content))
            started += 1
            if (started === 2 && bothStarted !== undefined) yield* Deferred.succeed(bothStarted, undefined)
            if (bothStarted === undefined) return yield* Effect.die("missing model barrier")
            yield* Deferred.await(bothStarted)
            return textDelta("done")
          }),
        ),
      ),
    )

    return provideScoped(
      layer,
      Effect.gen(function* () {
        bothStarted = yield* Deferred.make<void>()
        yield* Effect.scoped(
          Effect.gen(function* () {
            const alice = yield* Session.acquire("alice")
            yield* alice.append({ _tag: "Message", message: user("alice seed") }, { commandId: "fixture-58" })
          }),
        )
        yield* Effect.scoped(
          Effect.gen(function* () {
            const bob = yield* Session.acquire("bob")
            yield* bob.append({ _tag: "Message", message: user("bob seed") }, { commandId: "fixture-64" })
          }),
        )

        yield* Effect.all(
          [
            Agent.run(Agent.make({ name: "alice-agent" }), "alice next", {
              sessionId: "alice",
            }),
            Agent.run(Agent.make({ name: "bob-agent" }), "bob next", {
              sessionId: "bob",
            }),
          ],
          { concurrency: "unbounded" },
        )

        expect(prompts).toHaveLength(2)
        const alicePrompt = prompts.find((prompt) => prompt.includes("alice next")) ?? ""
        const bobPrompt = prompts.find((prompt) => prompt.includes("bob next")) ?? ""
        expect(alicePrompt).toContain("alice seed")
        expect(alicePrompt).not.toContain("bob seed")
        expect(bobPrompt).toContain("bob seed")
        expect(bobPrompt).not.toContain("alice seed")

        const alicePath = yield* Effect.scoped(
          Session.acquire("alice").pipe(Effect.flatMap((session) => session.path())),
        )
        const bobPath = yield* Effect.scoped(Session.acquire("bob").pipe(Effect.flatMap((session) => session.path())))
        expect(pathText(alicePath)).toContain("alice next")
        expect(pathText(alicePath)).not.toContain("bob next")
        expect(pathText(bobPath)).toContain("bob next")
        expect(pathText(bobPath)).not.toContain("alice next")
      }),
    )
  })

  it.effect("holds one ID for the complete Run while another ID proceeds", () => {
    let firstStarted: Deferred.Deferred<void> | undefined
    let releaseFirst: Deferred.Deferred<void> | undefined
    let queuedStarted: Deferred.Deferred<void> | undefined
    let otherStarted: Deferred.Deferred<void> | undefined
    let queuedPrompt = ""
    const layer = Layer.merge(
      layerMemory,
      modelLayer((options) => {
        const prompt = Json.stringify(options.prompt.content)
        return Stream.fromEffect(
          Effect.gen(function* () {
            if (prompt.includes("queued prompt")) {
              queuedPrompt = prompt
              if (queuedStarted === undefined) return yield* Effect.die("missing queued latch")
              yield* Deferred.succeed(queuedStarted, undefined)
            } else if (prompt.includes("other prompt")) {
              if (otherStarted === undefined) return yield* Effect.die("missing other latch")
              yield* Deferred.succeed(otherStarted, undefined)
            } else {
              if (firstStarted === undefined || releaseFirst === undefined) {
                return yield* Effect.die("missing first-run latches")
              }
              yield* Deferred.succeed(firstStarted, undefined)
              yield* Deferred.await(releaseFirst)
            }
            return textDelta("done")
          }),
        )
      }),
    )

    return provideScoped(
      layer,
      Effect.gen(function* () {
        firstStarted = yield* Deferred.make<void>()
        releaseFirst = yield* Deferred.make<void>()
        queuedStarted = yield* Deferred.make<void>()
        otherStarted = yield* Deferred.make<void>()
        const agent = Agent.make({ name: "linear-session-agent" })
        const first = yield* Agent.run(agent, "hold first", {
          sessionId: "shared",
        }).pipe(Effect.forkChild({ startImmediately: true }))
        yield* Deferred.await(firstStarted)
        const queued = yield* Agent.run(agent, "queued prompt", {
          sessionId: "shared",
        }).pipe(Effect.forkChild({ startImmediately: true }))
        const other = yield* Agent.run(agent, "other prompt", {
          sessionId: "other",
        }).pipe(Effect.forkChild({ startImmediately: true }))

        yield* Deferred.await(otherStarted)
        yield* Fiber.join(other)
        expect(Option.isNone(yield* Deferred.poll(queuedStarted))).toBe(true)
        yield* Deferred.succeed(releaseFirst, undefined)
        yield* Fiber.join(first)
        yield* Fiber.join(queued)

        expect(queuedPrompt).toContain("hold first")
        expect(queuedPrompt).toContain("queued prompt")
        expect(queuedPrompt).not.toContain("other prompt")
      }),
    )
  })

  it.effect("does not acquire or mutate a Session when sessionId is omitted", () => {
    let acquisitions = 0
    const directory = Session.layerTest({
      acquire: () =>
        Effect.sync(() => {
          acquisitions += 1
          return undefined
        }).pipe(Effect.andThen(Effect.die("an omitted sessionId must not acquire a Session"))),
    })
    const layer = Layer.merge(
      directory,
      modelLayer(() => Stream.make(textDelta("ephemeral"))),
    )

    return provideScoped(
      layer,
      Effect.gen(function* () {
        const result = yield* Agent.run(Agent.make({ name: "ephemeral-agent" }), "no session")

        expect(result).toBe("ephemeral")
        expect(acquisitions).toBe(0)
      }),
    )
  })

  it.effect("rejects a nested Run requesting its active parent Session before model execution", () => {
    let modelCalls = 0
    const layer = Layer.mergeAll(
      layerMemory,
      ToolContext.layerTest({
        signal: new AbortController().signal,
        emit: () => Effect.succeed(true),
        sessionId: "parent",
        toolCallId: "child-call",
      }),
      modelLayer(() => {
        modelCalls += 1
        return Stream.make(textDelta("must not run"))
      }),
    )

    return provideScoped(
      layer,
      Effect.gen(function* () {
        const failure = yield* Agent.run(Agent.make({ name: "nested-agent" }), "nested", {
          sessionId: "parent",
        }).pipe(Effect.flip)

        expect(failure._tag).toBe("generalist/core/AgentError")
        expect(String(failure)).toContain("cannot acquire its active parent Session parent")
        expect(modelCalls).toBe(0)
      }),
    )
  })
})

describe("memory Session command receipts", () => {
  it.effect("reuses reservations without consuming another invocation's identity", () =>
    provideScoped(
      layerMemory,
      Effect.gen(function* () {
        const store = yield* Session.acquire("reservations")
        const reserve = store.reserveEntryId("first-checkpoint")
        const first = yield* reserve
        const second = yield* store.reserveEntryId("second-checkpoint")
        expect(yield* reserve).toBe(first)
        expect(second).not.toBe(first)
        const appended = yield* store.append(
          { _tag: "Message", message: user("not a reserved checkpoint") },
          { commandId: "append" },
        )
        expect([first, second]).not.toContain(appended.id)
      }),
    ),
  )

  it.effect("returns the original append receipt and rejects changed input after the leaf moves", () =>
    provideScoped(
      layerMemory,
      Effect.gen(function* () {
        const store = yield* Session.acquire("append-receipts")
        const input: Session.AppendInput = { _tag: "Message", message: user("A") }
        const options = { commandId: "first-A" }
        const append = store.append(input, options)
        const first = yield* append
        const second = yield* store.append({ _tag: "Message", message: user("B") }, { commandId: "B" })
        expect(yield* append).toEqual(first)
        expect(yield* store.path()).toEqual([first, second])
        const changed = yield* Effect.flip(store.append({ _tag: "Message", message: user("changed") }, options))
        const changedExpectation = yield* Effect.flip(store.append(input, { ...options, expectedLeafId: null }))
        expect(changed).toMatchObject({ _tag: "generalist/core/SessionConflict", reason: "entry-id-reused" })
        expect(changedExpectation).toMatchObject({
          _tag: "generalist/core/SessionConflict",
          reason: "entry-id-reused",
        })
        yield* store.setLeaf(null, "new-branch")
        const laterA = yield* store.append(input, { commandId: "later-A" })
        expect(laterA.id).not.toBe(first.id)
        expect(yield* append).toEqual(first)
        expect(yield* store.path()).toEqual([laterA])
      }),
    ),
  )

  it.effect("does not replay old leaf changes over newer invocations", () =>
    provideScoped(
      layerMemory,
      Effect.gen(function* () {
        const store = yield* Session.acquire("leaf-receipts")
        const first = yield* store.append({ _tag: "Message", message: user("A") }, { commandId: "A" })
        const second = yield* store.append({ _tag: "Message", message: user("B") }, { commandId: "B" })
        yield* store.setLeaf(first.id, "select-A")
        yield* store.setLeaf(second.id, "select-B")
        yield* store.setLeaf(first.id, "select-A")
        expect(yield* store.leaf).toBe(second.id)
        const reused = yield* Effect.flip(store.setLeaf(second.id, "select-A"))
        expect(reused).toMatchObject({ _tag: "generalist/core/SessionStoreError", reason: "conflict" })
        yield* store.setLeaf(first.id, "select-A-again")
        expect(yield* store.leaf).toBe(first.id)
      }),
    ),
  )

  it.effect("allocates distinct Session entries for new Runs with repeated branch content", () =>
    provideScoped(
      Layer.merge(
        layerMemory,
        modelLayer(() => Stream.make(textDelta("done"))),
      ),
      Effect.gen(function* () {
        const agent = Agent.make({ name: "repeated-branch-agent" })
        const paths: Array<ReadonlyArray<Session.Entry>> = []
        for (const [invocation, prompt] of ["A", "B", "A"].entries()) {
          yield* Agent.run(agent, prompt, { sessionId: "repeated-branch" })
          const path = yield* Effect.scoped(
            Effect.gen(function* () {
              const store = yield* Session.acquire("repeated-branch")
              const entries = yield* store.path()
              yield* store.setLeaf(null, `next-branch-${invocation}`)
              return entries
            }),
          )
          expect(
            Session.buildContext(path).content.map((message) => ({
              role: message.role,
              text:
                message.role === "system"
                  ? message.content
                  : message.content.map((part) => (part.type === "text" ? part.text : "")).join(""),
            })),
          ).toEqual([
            { role: "user", text: prompt },
            { role: "assistant", text: "done" },
          ])
          paths.push(path)
        }
        const first = paths[0]![0]!
        const repeated = paths[2]![0]!
        expect(repeated.id).not.toBe(first.id)
        expect(new Set(paths.flatMap((path) => path.map((entry) => entry.id))).size).toBe(6)
      }),
    ),
  )
})
