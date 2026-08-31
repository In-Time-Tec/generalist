import { layer as backendLayer } from "generalist/mysql"
import { beforeAll } from "vitest"
import { describe, expect, it, layer } from "@effect/vitest"
import { Deferred, Effect, Layer, Ref, Schema, Stream } from "effect"
import { LanguageModel, Response, Tool, Toolkit } from "effect/unstable/ai"
import { Agent, ToolExecutor } from "generalist"
import { Address, Errors, ExecutableResolver, Runtime, RunStore } from "generalist/runtime"
import { RunClaims, RuntimeWorker } from "generalist/runtime/sql-driver"
import { closedTestAgent, testExecutable } from "../../../../../generalist/test/runtime/run/identity.js"
import {
  assistant,
  assistantAddress,
  assistantRef,
  completedResult,
  registrationsFor,
} from "../../../../../generalist/test/runtime/execution/fixtures.js"
import { provideScoped } from "../../../../../generalist/test/runtime/execution/scoped-provide.js"
import { mysqlAvailable, mysqlClient, mysqlDatabase, uniqueSession } from "../../runtime/environment.js"
import { SqlClient } from "effect/unstable/sql"

const describeMysql = describe.runIf(mysqlAvailable)

const staleWorker = mysqlDatabase("worker-stale")
const modelCancel = mysqlDatabase("worker-model-cancel")
const toolCancel = mysqlDatabase("worker-tool-cancel")

const finish = Response.makePart("finish", {
  reason: "stop",
  usage: Response.Usage.make({
    inputTokens: { total: 1, uncached: 1, cacheRead: undefined, cacheWrite: undefined },
    outputTokens: { total: 1, text: 1, reasoning: undefined },
  }),
  response: undefined,
})

describeMysql("mysql worker cancellation", () => {
  beforeAll(modelCancel.provisioned, 60_000)
  beforeAll(staleWorker.provisioned, 60_000)
  beforeAll(toolCancel.provisioned, 60_000)

  {
    const url = staleWorker.url
    const runtimeLayer = backendLayer({
      url,
      source: "mysql-worker-test",
      addresses: [
        { address: assistantAddress, executable: assistantRef, registrations: registrationsFor(assistantRef) },
      ],
    }).pipe(
      Layer.provide(
        ExecutableResolver.layerStatic([{ executable: assistantRef, agent: closedTestAgent(assistant) }]).pipe(
          Layer.orDie,
        ),
      ),
    )
    layer(staleWorker.provision(runtimeLayer), { excludeTestServices: true })(
      "rejects a stale worker commit after a replacement worker claims the Run",
      (suite) => {
        suite.effect("rejects a stale worker commit after a replacement worker claims the Run", () =>
          Effect.gen(function* () {
            const runtime = yield* Runtime.Runtime
            const claims = yield* RunClaims
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
                yield* sql`UPDATE generalist_runs SET lease_expires_at = '2000-01-01 00:00:00.000' WHERE run_id = ${receipt.runId}`
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
                  session: staleClaim!.session,
                  transition: "complete",
                  result: completedResult("stale result"),
                })
                .pipe(Effect.flip),
            ).toBeInstanceOf(Errors.StaleClaim)
          }),
        )
      },
    )
  }

  it.live(
    "interrupts an active model call from a separate runtime and finalizes worker resources in scope order",
    () => {
      const url = modelCancel.url
      return modelCancel.ready.pipe(
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
              addresses: [{ address, executable, registrations: registrationsFor(executable) }],
            }
            const runtimeLayer = backendLayer(options).pipe(
              Layer.provide(Layer.succeed(ExecutableResolver.ExecutableResolver, resolver)),
            )
            yield* provideScoped(
              RuntimeWorker.layer({
                workerId: "mysql-model-worker",
                cancellationInterval: "10 millis",
                lease: "30 seconds",
              }).pipe(Layer.provideMerge(runtimeLayer)),
              Effect.gen(function* () {
                const runtime = yield* Runtime.Runtime
                const worker = yield* RuntimeWorker.RuntimeWorker
                const sessionId = uniqueSession("cancel-model")
                const receipt = yield* runtime.send({
                  to: address,
                  sessionId,
                  idempotencyKey: "cancel-model",
                  prompt: "wait",
                })
                lifecycle.length = 0
                yield* worker.poll
                yield* Deferred.await(started)
                yield* provideScoped(
                  runtimeLayer,
                  Effect.gen(function* () {
                    const remote = yield* Runtime.Runtime
                    yield* remote.cancel({ runId: receipt.runId, reason: "cancel from another runtime" })
                  }),
                )
                yield* worker.idle
                yield* runtime.awaitSessionTerminal({ sessionId })
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
    const url = toolCancel.url
    return toolCancel.ready.pipe(
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
                  Response.makePart("tool-call", {
                    id: "block-1",
                    name: "block",
                    params: {},
                    providerExecuted: false,
                  }),
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
          const resolver = yield* ExecutableResolver.makeStatic([
            { executable, agent: Agent.close(agent, Layer.mergeAll(model, executor, handlers)) },
          ])
          const options = {
            url,
            source: "mysql-worker-test",
            addresses: [{ address, executable, registrations: registrationsFor(executable) }],
          }
          const runtimeLayer = backendLayer(options).pipe(
            Layer.provide(Layer.succeed(ExecutableResolver.ExecutableResolver, resolver)),
          )
          yield* provideScoped(
            RuntimeWorker.layer({
              workerId: "mysql-tool-worker",
              cancellationInterval: "10 millis",
              lease: "30 seconds",
            }).pipe(Layer.provideMerge(runtimeLayer)),
            Effect.gen(function* () {
              const runtime = yield* Runtime.Runtime
              const store = yield* RunStore.RunStore
              const worker = yield* RuntimeWorker.RuntimeWorker
              const receipt = yield* runtime.send({
                to: address,
                sessionId: uniqueSession("cancel-tool"),
                idempotencyKey: "cancel-tool",
                prompt: "block",
              })
              yield* worker.poll
              yield* Deferred.await(started)
              yield* provideScoped(
                runtimeLayer,
                Effect.gen(function* () {
                  const remote = yield* Runtime.Runtime
                  yield* remote.cancel({ runId: receipt.runId, reason: "cancel from another runtime" })
                }),
              )
              yield* worker.idle
              expect(yield* Ref.get(interrupted)).toBe(true)
              expect((yield* runtime.inspect(receipt.runId)).status).toBe("needs-resolution")
              const history = yield* runtime.history({ runId: receipt.runId, cursor: -1, limit: 100 })
              expect(history.map((event) => event._tag)).not.toContain("RunCancelled")
              const unknown = history.find((event) => event._tag === "OperationUnknown")
              if (unknown?._tag !== "OperationUnknown") return yield* Effect.die("unknown operation event missing")
              expect(
                (yield* store.getOperation({ runId: receipt.runId, operationId: unknown.operationId })).status,
              ).toBe("unknown")
            }),
          )
        }),
      ),
    )
  })
})
if (!mysqlAvailable) it.skip("mysql suite skipped: set GENERALIST_MYSQL_URL or MYSQL_URL", () => undefined)
