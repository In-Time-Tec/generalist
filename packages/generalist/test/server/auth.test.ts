import "./example-auth-suite.js"
import { expect, it as test, layer } from "@effect/vitest"
import { vi } from "vitest"
import { Config, Effect, Layer, Redacted, Schema } from "effect"
import { HttpRouter, HttpServer } from "effect/unstable/http"
import { Agent, Approvals, Permissions } from "generalist"
import { Host } from "generalist/host"
import { ExecutableResolver } from "generalist/runtime"
import { Server, type Principal } from "generalist/server"
import { TestModel } from "generalist/testing"
import { objectRuntimeLayer } from "../runtime/execution/object.js"

test.effect("rejects empty bearer configuration before serving requests", () =>
  Effect.gen(function* () {
    const error = yield* Layer.build(
      Server.authBearer({
        token: Config.succeed(Redacted.make("")),
        principal: { id: "controller", tenantId: "test", role: "controller" },
      }),
    ).pipe(Effect.scoped, Effect.flip)
    expect(Schema.isSchemaError(error)).toBe(true)
  }),
)

const services = Layer.mergeAll(
  objectRuntimeLayer({ addresses: [] }).pipe(Layer.provide(ExecutableResolver.layerStatic([]))),
  TestModel.layer([]),
  Permissions.layerAllowAll,
  Approvals.layerAutoApprove,
)

const mutations = [
  { path: "/sessions", body: { id: "forbidden" } },
  { path: "/sessions/existing/runs", body: { agent: "authorization", input: "forbidden" } },
  { path: "/runs/existing/cancel", body: { commandId: "cancel" } },
  { path: "/runs/existing/approvals/token", body: { decision: { _tag: "Approved" }, operator: "controller" } },
  { path: "/runs/existing/retry", body: { commandId: "retry", operator: "controller" } },
  { path: "/runs/existing/wake", body: { commandId: "wake", operator: "controller" } },
  {
    path: "/runs/existing/resolve-unknown",
    body: {
      commandId: "resolve",
      operationId: "op",
      resolution: { outcome: "succeeded", result: null },
      operator: "controller",
    },
  },
  {
    path: "/runs/existing/extend-budget",
    body: { commandId: "budget", delta: { modelSteps: 1 }, operator: "controller" },
  },
] as const

layer(services)("Server authorization", (it) => {
  it.effect("validates the application principal before installing static bearer authentication", () =>
    Effect.gen(function* () {
      const invalid = yield* Layer.build(
        Server.authBearer({
          token: Config.succeed(Redacted.make("test-token")),
          principal: { id: "", tenantId: "test", role: "controller" },
        }),
      ).pipe(Effect.flip)
      expect(invalid instanceof Schema.SchemaError).toBe(true)
    }),
  )
  for (const deniedBy of ["spectator", "tenant", "resource"] as const) {
    it.effect(`denies every declared mutation before Host calls by ${deniedBy}`, () =>
      Effect.gen(function* () {
        const agent = Agent.make({ name: `authorization-${deniedBy}` })
        const host = yield* Host.make({ revision: "local", agents: [agent] })
        const principal: Principal = {
          id: "application-user",
          tenantId: deniedBy === "tenant" ? "other" : "test",
          role: deniedBy === "spectator" ? "spectator" : "controller",
        }
        const spies = [
          vi.spyOn(host.sessions, "create"),
          vi.spyOn(host.runs, "startByName"),
          vi.spyOn(host.runs, "cancel"),
          vi.spyOn(host.approvals, "resolve"),
          vi.spyOn(host.operator, "retry"),
          vi.spyOn(host.operator, "wake"),
          vi.spyOn(host.operator, "resolveUnknown"),
          vi.spyOn(host.operator, "extendBudget"),
          vi.spyOn(host.attachments, "put"),
        ]
        yield* Effect.addFinalizer(() =>
          Effect.sync(() => {
            for (const spy of spies) spy.mockRestore()
          }),
        )
        const app = HttpRouter.toWebHandler(
          Server.layer({
            host,
            auth: Server.authBearer({ token: Config.succeed(Redacted.make("test-token")), principal }),
            authorization: { tenantId: "test", authorize: () => Effect.succeed(deniedBy !== "resource") },
            operator: true,
          }).pipe(Layer.provide(HttpServer.layerServices)),
          { disableLogger: true },
        )
        yield* Effect.addFinalizer(() => Effect.promise(app.dispose))
        for (const mutation of mutations) {
          const body = yield* Schema.encodeEffect(Schema.fromJsonString(Schema.Unknown))({
            ...mutation.body,
            role: "controller",
            tenantId: "test",
          })
          const response = yield* Effect.promise(() =>
            app.handler(
              new Request(`http://generalist.test${mutation.path}?role=controller&tenantId=test`, {
                method: "POST",
                headers: { authorization: "Bearer test-token", "content-type": "application/json" },
                body,
              }),
            ),
          )
          expect({ path: mutation.path, status: response.status }).toEqual({ path: mutation.path, status: 403 })
        }
        const attachment = yield* Effect.promise(() =>
          app.handler(
            new Request("http://generalist.test/attachments", {
              method: "POST",
              headers: {
                authorization: "Bearer test-token",
                "content-type": "application/octet-stream",
                "x-media-type": "text/plain",
              },
              body: "forbidden",
            }),
          ),
        )
        expect(attachment.status).toBe(403)
        for (const spy of spies) expect(spy).not.toHaveBeenCalled()
      }),
    )
  }

  for (const deniedBy of ["tenant", "resource"] as const) {
    it.effect(`denies reads and subscriptions before Host calls by ${deniedBy}`, () =>
      Effect.gen(function* () {
        const host = yield* Host.make({ revision: "local", agents: [] })
        const spies = [
          vi.spyOn(host.sessions, "get"),
          vi.spyOn(host.sessions, "list"),
          vi.spyOn(host.sessions, "snapshot"),
          vi.spyOn(host.runs, "list"),
          vi.spyOn(host.runs, "inspect"),
          vi.spyOn(host.events, "subscribe"),
          vi.spyOn(host.artifacts, "read"),
          vi.spyOn(host.artifacts, "subscribe"),
          vi.spyOn(host.attachments, "get"),
          vi.spyOn(host.operator, "explain"),
        ]
        yield* Effect.addFinalizer(() =>
          Effect.sync(() => {
            for (const spy of spies) spy.mockRestore()
          }),
        )
        const app = HttpRouter.toWebHandler(
          Server.layer({
            host,
            auth: Server.authBearer({
              token: Config.succeed(Redacted.make("test-token")),
              principal: { id: "reader", tenantId: deniedBy === "tenant" ? "other" : "test", role: "spectator" },
            }),
            authorization: { tenantId: "test", authorize: () => Effect.succeed(deniedBy !== "resource") },
          }).pipe(Layer.provide(HttpServer.layerServices)),
          { disableLogger: true },
        )
        yield* Effect.addFinalizer(() => Effect.promise(app.dispose))
        for (const path of [
          "/sessions",
          "/sessions/existing",
          "/sessions/existing/snapshot",
          "/sessions/existing/runs",
          "/runs/existing",
          "/runs/existing/explain",
          "/sessions/existing/events",
          "/sessions/existing/ws",
          "/artifacts/existing",
          "/artifacts/existing/ws",
          `/attachments/${"0".repeat(64)}`,
        ]) {
          const response = yield* Effect.promise(() =>
            app.handler(
              new Request(`http://generalist.test${path}?tenantId=test&role=controller`, {
                headers: { authorization: "Bearer test-token" },
              }),
            ),
          )
          expect({ path, status: response.status }).toEqual({ path, status: 403 })
        }
        for (const spy of spies) expect(spy).not.toHaveBeenCalled()
      }),
    )
  }
})
