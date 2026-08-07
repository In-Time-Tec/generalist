import { describe, expect, it, layer } from "@effect/vitest"
import { Deferred, Effect, Fiber, Layer, Ref, Schema, Stream } from "effect"
import { LanguageModel, Response, Tool, Toolkit } from "effect/unstable/ai"
import { Agent, ToolExecutor } from "@batonfx/core"
import { Address, Errors, ExecutableResolver, RunClaims, Runtime, RuntimeWorker } from "../../src/index.js"
import { closedTestAgent, testExecutable } from "../identity.js"
import { assistant, assistantAddress, assistantRef, completedResult, registrationsFor } from "../helpers.js"
import { provideScoped } from "../scoped-provide.js"
import { mysqlAvailable, mysqlClient, mysqlUrl, prepareMysql, uniqueSession } from "./helpers.js"
import { SqlClient } from "effect/unstable/sql"

const describeMysql = mysqlAvailable ? describe.sequential : describe.skip

const finish = Response.makePart("finish", {
  reason: "stop",
  usage: Response.Usage.make({
    inputTokens: { total: 1, uncached: 1, cacheRead: undefined, cacheWrite: undefined },
    outputTokens: { total: 1, text: 1, reasoning: undefined },
  }),
  response: undefined,
})

describeMysql("mysql worker cancellation", () => {
  {
    const url = mysqlUrl!
    layer(
      Runtime.layerMysql({
        url,
        source: "mysql-worker-test",
        resolver: ExecutableResolver.makeStatic([{ executable: assistantRef, agent: closedTestAgent(assistant) }]),
        addresses: [
          { address: assistantAddress, executable: assistantRef, registrations: registrationsFor(assistantRef) },
        ],
      }),
      { excludeTestServices: true },
    )("rejects a stale worker commit after a replacement worker claims the Run", (suite) => {
      suite.effect("rejects a stale worker commit after a replacement worker claims the Run", () =>
        prepareMysql(url).pipe(
          Effect.andThen(
            Effect.gen(function* () {
              const runtime = yield* Runtime.Runtime
              const claims = yield* RunClaims.RunClaims
              const receipt = yield* runtime.send({
                to: assistantAddress,
                sessionId: uniqueSession("stale-worker"),
                idempotencyKey: "stale-worker",
                prompt: "work",
              })
              const [staleClaim] = yield* claims.claimReadyRuns({
                workerId: "stale-worker",
                limit: 1,
                lease: "30 seconds",
              })
              yield* provideScoped(
                mysqlClient(url),
                Effect.gen(function* () {
                  const sql = yield* SqlClient.SqlClient
                  yield* sql`UPDATE baton_runs SET lease_expires_at = '2000-01-01 00:00:00.000' WHERE run_id = ${receipt.runId}`
                }),
              )
              const [replacementClaim] = yield* claims.claimReadyRuns({
                workerId: "replacement-worker",
                limit: 1,
                lease: "30 seconds",
              })
              expect(replacementClaim!.attemptFence).toBeGreaterThan(staleClaim!.attemptFence)
              expect(
                yield* claims
                  .commitWithClaim({
                    runId: receipt.runId,
                    workerId: staleClaim!.workerId,
                    attemptFence: staleClaim!.attemptFence,
                    transition: "complete",
                    result: completedResult("stale result"),
                  })
                  .pipe(Effect.flip),
              ).toBeInstanceOf(Errors.StaleClaim)
            }),
          ),
        ),
      )
    })
  }

  it.live(
    "interrupts an active model call from a separate runtime and finalizes worker resources in scope order",
    () => {
      const url = mysqlUrl!
      return prepareMysql(url).pipe(
        Effect.andThen(
          Effect.gen(function* () {
            const started = yield* Deferred.make<void>()
            const finalized = yield* Deferred.make<void>()
            const lifecycle: Array<string> = []
            const agent = Agent.make({ name: "mysql-cancel-model" })
            const executable = testExecutable(agent, "mysql-cancel-model-v1")
            const address = Address.make("agent:mysql-cancel-model")
            const model = Layer.effect(
              LanguageModel.LanguageModel,
              LanguageModel.make({
                generateText: () => Effect.succeed([{ type: "text", text: "unused" }]),
                streamText: () =>
                  Stream.fromEffect(Deferred.succeed(started, undefined)).pipe(
                    Stream.flatMap(() => Stream.never),
                    Stream.ensuring(Deferred.succeed(finalized, undefined).pipe(Effect.asVoid)),
                  ),
              }),
            )
            const resources = Layer.effectDiscard(
              Effect.acquireRelease(
                Effect.sync(() => lifecycle.push("service acquired")),
                () => Effect.sync(() => lifecycle.push("service finalized")),
              ),
            )
            const resolver = ExecutableResolver.ExecutableResolver.of({
              resolve: () =>
                Effect.gen(function* () {
                  lifecycle.push("resolver acquired")
                  yield* Effect.addFinalizer(() => Effect.sync(() => lifecycle.push("resolver finalized")))
                  return {
                    _tag: "Agent" as const,
                    agent: Agent.close(agent, Layer.merge(model, resources)),
                    attestation: executable,
                  }
                }),
            })
            const options = {
              url,
              source: "mysql-worker-test",
              resolver,
              addresses: [{ address, executable, registrations: registrationsFor(executable) }],
            }
            yield* provideScoped(
              RuntimeWorker.layerWorker({
                workerId: "mysql-model-worker",
                cancellationInterval: "10 millis",
                lease: "30 seconds",
              }).pipe(Layer.provideMerge(Runtime.layerMysql(options))),
              Effect.gen(function* () {
                const runtime = yield* Runtime.Runtime
                const worker = yield* RuntimeWorker.RuntimeWorker
                const receipt = yield* runtime.send({
                  to: address,
                  sessionId: uniqueSession("cancel-model"),
                  idempotencyKey: "cancel-model",
                  prompt: "wait",
                })
                lifecycle.length = 0
                const executing = yield* worker.execute.pipe(Effect.forkChild({ startImmediately: true }))
                yield* Deferred.await(started)
                yield* provideScoped(
                  Runtime.layerMysql(options),
                  Effect.gen(function* () {
                    const remote = yield* Runtime.Runtime
                    yield* remote.cancel({ runId: receipt.runId, reason: "cancel from another runtime" })
                  }),
                )
                yield* Fiber.join(executing)
                expect((yield* runtime.inspect(receipt.runId)).status).toBe("cancelled")
                yield* Deferred.await(finalized)
                expect(lifecycle).toEqual([
                  "resolver acquired",
                  "service acquired",
                  "service finalized",
                  "resolver finalized",
                ])
              }),
            )
          }),
        ),
      )
    },
  )

  it.live("interrupts an active tool call when another runtime persists cancellation", () => {
    const url = mysqlUrl!
    return prepareMysql(url).pipe(
      Effect.andThen(
        Effect.gen(function* () {
          const started = yield* Deferred.make<void>()
          const interrupted = yield* Ref.make(false)
          const tool = Tool.make("block", { parameters: Schema.Struct({}), success: Schema.String })
          const agent = Agent.make({ name: "mysql-cancel-tool", toolkit: Toolkit.make(tool) })
          const executable = testExecutable(agent, "mysql-cancel-tool-v1")
          const address = Address.make("agent:mysql-cancel-tool")
          const model = Layer.effect(
            LanguageModel.LanguageModel,
            LanguageModel.make({
              generateText: () => Effect.succeed([{ type: "text", text: "unused" }]),
              streamText: () =>
                Stream.fromIterable<Response.StreamPartEncoded>([
                  Response.makePart("tool-call", { id: "block-1", name: "block", params: {}, providerExecuted: false }),
                  finish,
                ]),
            }),
          )
          const executor = ToolExecutor.layerTest({
            execute: () =>
              Deferred.succeed(started, undefined).pipe(
                Effect.andThen(Effect.never),
                Effect.onInterrupt(() => Ref.set(interrupted, true)),
              ),
          })
          const handlers = Toolkit.make(tool).toLayer({ block: () => Effect.die("ToolExecutor owns tool execution") })
          const resolver = ExecutableResolver.makeStatic([
            { executable, agent: Agent.close(agent, Layer.mergeAll(model, executor, handlers)) },
          ])
          const options = {
            url,
            source: "mysql-worker-test",
            resolver,
            addresses: [{ address, executable, registrations: registrationsFor(executable) }],
          }
          yield* provideScoped(
            RuntimeWorker.layerWorker({
              workerId: "mysql-tool-worker",
              cancellationInterval: "10 millis",
              lease: "30 seconds",
            }).pipe(Layer.provideMerge(Runtime.layerMysql(options))),
            Effect.gen(function* () {
              const runtime = yield* Runtime.Runtime
              const worker = yield* RuntimeWorker.RuntimeWorker
              const receipt = yield* runtime.send({
                to: address,
                sessionId: uniqueSession("cancel-tool"),
                idempotencyKey: "cancel-tool",
                prompt: "block",
              })
              const executing = yield* worker.execute.pipe(Effect.forkChild({ startImmediately: true }))
              yield* Deferred.await(started)
              yield* provideScoped(
                Runtime.layerMysql(options),
                Effect.gen(function* () {
                  const remote = yield* Runtime.Runtime
                  yield* remote.cancel({ runId: receipt.runId, reason: "cancel from another runtime" })
                }),
              )
              yield* Fiber.join(executing)
              expect(yield* Ref.get(interrupted)).toBe(true)
              expect((yield* runtime.inspect(receipt.runId)).status).toBe("needs-resolution")
              expect(
                (yield* runtime.history({ runId: receipt.runId, cursor: -1, limit: 100 })).map((event) => event._tag),
              ).toContain("OperationUnknown")
            }),
          )
        }),
      ),
    )
  })
})
if (!mysqlAvailable) it.skip("mysql suite skipped: set BATON_MYSQL_URL or MYSQL_URL", () => undefined)
