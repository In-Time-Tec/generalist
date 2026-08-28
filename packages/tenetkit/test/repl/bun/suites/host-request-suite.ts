import { expect, layer } from "@effect/vitest"
import { Deferred, Effect, Fiber, Schema } from "effect"
import { HostBindingRegistry } from "../../../../src/repl/index.js"
import { collect, platform, runCell, withPool } from "../../bun-harness.js"

class SlowFailure extends Schema.TaggedError<SlowFailure>()("tenetkit/repl/test/SlowFailure", {
  message: Schema.String,
}) {}

const slowModule = (input: {
  readonly arrived: Deferred.Deferred<void>
  readonly gate: Deferred.Deferred<void>
}): HostBindingRegistry.Module => ({
  name: "host",
  operations: [
    {
      name: "delayed",
      input: Schema.Struct({ value: Schema.Finite }),
      output: Schema.Finite,
      failure: SlowFailure,
      handle: (request) =>
        Schema.decodeUnknownEffect(Schema.Struct({ value: Schema.Finite }))(request).pipe(
          Effect.tap(() => Deferred.succeed(input.arrived, undefined)),
          Effect.flatMap(({ value }) => Deferred.await(input.gate).pipe(Effect.as(value * 2))),
        ),
    },
  ],
})

const textModule: HostBindingRegistry.Module = {
  name: "workspace",
  operations: [
    {
      name: "read",
      input: Schema.Struct({ path: Schema.String }),
      output: Schema.Struct({ text: Schema.String, truncated: Schema.Boolean }),
      failure: SlowFailure,
      handle: () => Effect.succeed({ text: '{"answer":42}', truncated: false }),
    },
  ],
}

const echoModule: HostBindingRegistry.Module = {
  name: "host",
  operations: [
    {
      name: "echo",
      input: Schema.Struct({ text: Schema.String }),
      output: Schema.String,
      failure: SlowFailure,
      handle: (input) =>
        Schema.decodeUnknownEffect(Schema.Struct({ text: Schema.String }))(input).pipe(
          Effect.map(({ text }) => text.toUpperCase()),
        ),
    },
    {
      name: "boom",
      input: Schema.Struct({}),
      output: Schema.String,
      failure: SlowFailure,
      handle: () => Effect.fail(SlowFailure.make({ message: "the host refused" })),
    },
  ],
}

layer(platform)("Bun kernel host requests", (it) => {
  it.effect("completes a cell that awaits a host reply the host delays", () =>
    Effect.gen(function* () {
      const arrived = yield* Deferred.make<void>()
      const gate = yield* Deferred.make<void>()
      return yield* withPool({
        overrides: { modules: [slowModule({ arrived, gate })] },
        use: ({ pool }) =>
          Effect.gen(function* () {
            const running = yield* Effect.forkChild(
              runCell({
                pool,
                sessionId: "s",
                cellId: "c1",
                code: "const doubled = await host.delayed({ value: 21 }); doubled",
              }),
            )
            yield* Deferred.await(arrived)
            expect(running.pollUnsafe()).toBeUndefined()
            yield* Deferred.succeed(gate, undefined)
            const result = yield* Fiber.join(running)
            expect(result.value).toBe("42")
          }),
      })
    }),
  )

  it.effect("answers a host request raised by a cell", () =>
    withPool({
      overrides: { modules: [echoModule] },
      use: ({ pool }) =>
        Effect.gen(function* () {
          const result = yield* runCell({
            pool,
            sessionId: "s",
            cellId: "c1",
            code: 'await host.echo({ text: "quiet" })',
          })
          expect(result.value).toBe("QUIET")
        }),
    }),
  )

  it.effect("emits one host-call lifecycle around the registry bridge", () =>
    withPool({
      overrides: { modules: [echoModule] },
      use: ({ pool }) =>
        Effect.gen(function* () {
          const observed = yield* collect({
            pool,
            sessionId: "s",
            cellId: "c1",
            code: 'await host.echo({ text: "ledger" })',
          })
          yield* observed.result
          const calls = observed.events.filter((event) => event._tag === "HostCall")
          expect(calls).toHaveLength(2)
          expect(calls[0]).toMatchObject({
            module: "host",
            operation: "echo",
            inputSummary: '{"text":"ledger"}',
            status: "started",
          })
          expect(calls[1]).toMatchObject({
            requestId: calls[0]?.requestId,
            status: "returned",
            message: '"LEDGER"',
          })
          expect(calls[1]?.durationMillis).toBeTypeOf("number")
        }),
    }),
  )

  it.effect("keeps a host-answered value in the namespace for later cells", () =>
    withPool({
      overrides: { modules: [echoModule] },
      use: ({ pool }) =>
        Effect.gen(function* () {
          yield* runCell({
            pool,
            sessionId: "s",
            cellId: "c1",
            code: 'const shout = await host.echo({ text: "kept" })',
          })
          const result = yield* runCell({ pool, sessionId: "s", cellId: "c2", code: "shout" })
          expect(result.value).toBe("KEPT")
        }),
    }),
  )

  it.effect("surfaces a typed host failure as a thrown value inside the cell", () =>
    withPool({
      overrides: { modules: [echoModule] },
      use: ({ pool }) =>
        Effect.gen(function* () {
          const result = yield* runCell({
            pool,
            sessionId: "s",
            cellId: "c1",
            code: [
              "let caught = 'none';",
              "try { await host.boom({}) } catch (error) { caught = JSON.stringify(error) }",
              "caught;",
            ].join("\n"),
          })
          expect(result.value).toContain("SlowFailure")
        }),
    }),
  )

  it.effect("rejects a request for a module that is not mounted", () =>
    withPool({
      use: ({ pool }) =>
        Effect.gen(function* () {
          const observed = yield* collect({
            pool,
            sessionId: "s",
            cellId: "c1",
            code: "typeof host",
          })
          yield* observed.result
          expect(observed.events.at(-1)?._tag).toBe("Result")
        }),
    }),
  )

  it.effect("makes text-result object misuse actionable without changing access or serialization", () =>
    withPool({
      overrides: { modules: [textModule] },
      use: ({ pool }) =>
        Effect.gen(function* () {
          const result = yield* runCell({
            pool,
            sessionId: "s",
            cellId: "c1",
            code: [
              'const readResult = await workspace.read({ path: "data.json" })',
              "let sliceError = ''",
              "let parseError = ''",
              "try { readResult.slice(0, 1) } catch (error) { sliceError = error.message }",
              "try { JSON.parse(readResult) } catch (error) { parseError = error.message }",
              "[sliceError, parseError, readResult.text, JSON.stringify(readResult), typeof ({ text: 'local' }).slice].join('\\n---\\n')",
            ].join("\n"),
          })
          const [sliceError, parseError, text, serialized, localSlice] = result.value.split("\n---\n")
          expect(sliceError).toBe("workspace.read returns an object; did you mean `.text`?")
          expect(parseError).toBe("workspace.read returns an object; did you mean `.text`?")
          expect(text).toBe('{"answer":42}')
          expect(serialized).toBe('{"text":"{\\"answer\\":42}","truncated":false}')
          expect(localSlice).toBe("undefined")
        }),
    }),
  )

  it.effect("renders a returned text-result object as canonical JSON", () =>
    withPool({
      overrides: { modules: [textModule] },
      use: ({ pool }) =>
        Effect.gen(function* () {
          const result = yield* runCell({
            pool,
            sessionId: "s",
            cellId: "c1",
            code: 'await workspace.read({ path: "data.json" })',
          })
          expect(result.value).toBe('{"text":"{\\"answer\\":42}","truncated":false}')
        }),
    }),
  )

  it.effect("keeps a decorated text result snapshotable", () =>
    withPool({
      overrides: { modules: [textModule] },
      use: ({ pool }) =>
        Effect.gen(function* () {
          yield* runCell({
            pool,
            sessionId: "s",
            cellId: "c1",
            code: 'const keptRead = await workspace.read({ path: "data.json" })',
          })
          const restart = yield* pool.restart("s", "requested")
          expect(restart.restoredNames).toContain("keptRead")
          const restored = yield* runCell({
            pool,
            sessionId: "s",
            cellId: "c2",
            code: "JSON.stringify(keptRead)",
          })
          expect(restored.value).toBe('{"text":"{\\"answer\\":42}","truncated":false}')
        }),
    }),
  )

  it.effect("serves several host requests from one cell in order", () =>
    withPool({
      overrides: { modules: [echoModule] },
      use: ({ pool }) =>
        Effect.gen(function* () {
          const result = yield* runCell({
            pool,
            sessionId: "s",
            cellId: "c1",
            code: [
              'const a = await host.echo({ text: "one" });',
              'const b = await host.echo({ text: "two" });',
              "[a, b].join('-');",
            ].join("\n"),
          })
          expect(result.value).toBe("ONE-TWO")
        }),
    }),
  )
})
