import { layer as sqliteClientLayer } from "@effect/sql-sqlite-bun/SqliteClient"
import { BunFileSystem } from "@effect/platform-bun"
import { describe, expect, it } from "@effect/vitest"
import { Effect, FileSystem, Layer, Path, PlatformError, Schema } from "effect"
import { Response, Tool } from "effect/unstable/ai"
import { Permissions } from "../../../src/index.js"
import { make as makeAuthorizer } from "../../../src/core/tools/tool-authorization.js"
import { apply as applySqliteSchema } from "../../../src/runtime/sql/migrate.js"
import { Testing } from "../../../src/testing/index.js"
import { postgresAvailable, postgresDatabase } from "../../pg/database.js"

const ruleFile = "/project/.generalist/permissions.json"

const notFound = (method: string, path: string) =>
  PlatformError.systemError({
    _tag: "NotFound",
    module: "RuleStoreTest",
    method,
    pathOrDescriptor: path,
    description: "not found",
  })

const layerMemoryFileSystem = (initial: ReadonlyArray<readonly [string, string]> = []) =>
  Layer.effect(
    FileSystem.FileSystem,
    Effect.sync(() => {
      const files = new Map(initial)
      return FileSystem.makeNoop({
        readFileString: (path) => {
          const text = files.get(path)
          return text === undefined ? Effect.fail(notFound("readFileString", path)) : Effect.succeed(text)
        },
        makeDirectory: () => Effect.void,
        writeFileString: (path, text) => Effect.sync(() => files.set(path, text)).pipe(Effect.asVoid),
        rename: (from, to) => {
          const text = files.get(from)
          return text === undefined
            ? Effect.fail(notFound("rename", from))
            : Effect.sync(() => {
                files.delete(from)
                files.set(to, text)
              })
        },
        remove: (path) => Effect.sync(() => files.delete(path)).pipe(Effect.asVoid),
      })
    }),
  )

const provide =
  <R, E>(layer: Layer.Layer<R, E>) =>
  <A, E2>(effect: Effect.Effect<A, E2, R>): Effect.Effect<A, E | E2> =>
    Effect.scoped(Layer.build(layer).pipe(Effect.flatMap((context) => effect.pipe(Effect.provideContext(context)))))

const fileDependencies = Layer.merge(layerMemoryFileSystem(), Path.layer)
const fileAdapter = Permissions.layerRuleStoreFile({ path: ruleFile })
const fileLayer = fileAdapter.pipe(Layer.provideMerge(fileDependencies))
const invalidFileLayer = Permissions.layerRuleStoreFile({ path: ruleFile }).pipe(
  Layer.provide(
    Layer.merge(layerMemoryFileSystem([[ruleFile, '[{"pattern":"shell","level":"invalid"}]']]), Path.layer),
  ),
)
const sqliteSchema = Layer.effectDiscard(applySqliteSchema("rule-store")).pipe(
  Layer.provideMerge(sqliteClientLayer({ filename: ":memory:" })),
)
const sqlLayer = Permissions.layerRuleStoreSql({ scope: "session:test" }).pipe(Layer.provide(sqliteSchema))

Testing.ruleStore({ layer: fileLayer })
Testing.ruleStore({ layer: sqlLayer })

if (postgresAvailable) {
  const database = postgresDatabase("rule-store")
  Testing.ruleStore({
    layer: database.provision(
      Permissions.layerRuleStoreSql({ scope: "session:test" }).pipe(Layer.provide(database.client)),
    ),
  })
} else {
  describe.skip("PostgreSQL RuleStore conformance (set GENERALIST_DATABASE_URL or DATABASE_URL)", () => undefined)
}

const shell = Tool.make("shell", {
  parameters: Schema.Struct({ command: Schema.String }),
  success: Schema.Unknown,
})

const request = {
  call: Response.makePart("tool-call", {
    id: "remembered-call",
    name: "shell",
    params: { command: "pwd" },
    providerExecuted: false,
  }),
  agentName: "test-agent",
  turn: 1,
  sessionId: "session:test",
  tool: shell,
  active: true,
  activeTools: ["shell"],
  activatedSkills: [],
  messages: [],
  onApprovalRequired: () => Effect.void,
}

describe("durable RuleStore adapters", () => {
  const watchedRuleFile = `/tmp/generalist-permissions-watch-${process.pid}.json`
  const watchedFileLayer = Permissions.layerRuleStoreFile({ path: watchedRuleFile }).pipe(
    Layer.provideMerge(Layer.merge(BunFileSystem.layer, Path.layer)),
  )

  it.live("loads watched external changes", () =>
    Effect.gen(function* () {
      const store = yield* Permissions.RuleStore
      const fileSystem = yield* FileSystem.FileSystem
      yield* Effect.sleep("10 millis")
      yield* fileSystem.writeFileString(watchedRuleFile, '[{"pattern":"shell","level":"allow"}]')
      yield* Effect.sleep("10 millis")
      expect(yield* store.rules).toEqual([{ pattern: "shell", level: "allow" }])
      yield* fileSystem.remove(watchedRuleFile, { force: true })
    }).pipe(provide(watchedFileLayer)),
  )

  it.effect("fails with InvalidRuleFile for invalid persisted rules", () =>
    Effect.gen(function* () {
      const failure = yield* Effect.flip(Effect.void.pipe(provide(invalidFileLayer)))
      expect(failure._tag).toBe("generalist/core/InvalidRuleFile")
      if (failure._tag === "generalist/core/InvalidRuleFile") expect(failure.path).toBe(ruleFile)
    }),
  )

  it.effect("persists an Approved remember rule and honors it after reopening", () =>
    Effect.gen(function* () {
      let approvals = 0
      yield* Effect.scoped(
        Layer.build(fileAdapter).pipe(
          Effect.flatMap((context) =>
            Effect.gen(function* () {
              const store = yield* Permissions.RuleStore
              const first = makeAuthorizer({
                permissions: { evaluate: () => Effect.succeed({ _tag: "Ask", token: "approval:first" }) },
                approvals: {
                  resolve: () => {
                    approvals += 1
                    return Effect.succeed({ _tag: "Approved", remember: { pattern: "shell", level: "allow" } })
                  },
                },
                ruleStore: store,
              })
              expect((yield* first.authorize(request))._tag).toBe("Execute")
            }).pipe(Effect.provideContext(context)),
          ),
        ),
      )
      yield* Effect.scoped(
        Layer.build(fileAdapter).pipe(
          Effect.flatMap((context) =>
            Effect.gen(function* () {
              const store = yield* Permissions.RuleStore
              const second = makeAuthorizer({
                permissions: { evaluate: () => Effect.succeed({ _tag: "Ask", token: "approval:second" }) },
                approvals: { resolve: () => Effect.die("remembered rule should bypass approval") },
                ruleStore: store,
              })
              expect((yield* second.authorize(request))._tag).toBe("Execute")
            }).pipe(Effect.provideContext(context)),
          ),
        ),
      )
      expect(approvals).toBe(1)
    }).pipe(provide(fileDependencies)),
  )
})
