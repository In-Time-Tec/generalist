/* oxlint-disable effecttsgo/any-unknown-in-error-context, effecttsgo/async-function, effecttsgo/strict-effect-provide -- The packed fixture is an application boundary over Promise-only provider SDK interfaces. */
/* oxlint-disable anti-slop/require-safety-comment-for-type-assertion, typescript/no-unsafe-type-assertion -- The fake S3 client implements the SDK's streaming response boundary with the exact method consumed by Generalist. */
import { layer as bunServices } from "@effect/platform-bun/BunServices"
import { BunCrypto } from "@effect/platform-bun"
import { InMemoryTransport } from "@modelcontextprotocol/sdk/inMemory.js"
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js"
import { CallToolRequestSchema, ListToolsRequestSchema } from "@modelcontextprotocol/sdk/types.js"
import type { GetObjectCommandOutput } from "@aws-sdk/client-s3"
import { Context, Effect, FileSystem, Layer, Option, Schema, Stream } from "effect"
import { LanguageModel, Response } from "effect/unstable/ai"
import { Agent, Approvals, CodeExecutor, Permissions, ProgramCapabilities } from "generalist"
import * as FileObjectStore from "generalist/durability/fs"
import * as S3 from "generalist/durability/s3"
import { Runtime } from "generalist/runtime"
import { layerPeer, layerRoutes } from "generalist/runtime/child-coordination"
import * as Sandbox from "generalist/sandbox"
import { Server } from "generalist/server"
import { MCPClient } from "generalist/unstable/mcp"
import * as MCPTools from "generalist/unstable/mcp/tools"

const assert = (condition: boolean, message: string): void => {
  if (!condition) throw new Error(message)
}

const bytes = (value: string): Uint8Array => new TextEncoder().encode(value)
const text = (value: Uint8Array): string => new TextDecoder().decode(value)

const qualifyObjectStores = Effect.gen(function* () {
  const fileSystem = yield* FileSystem.FileSystem
  const directory = yield* fileSystem.makeTempDirectoryScoped({ prefix: "generalist-packed-fs-" })
  const local = yield* FileObjectStore.make({ dir: directory })
  assert((yield* local.create("receipts/one", bytes("filesystem"))) === "created", "filesystem create failed")
  assert((yield* local.create("receipts/one", bytes("replacement"))) === "conflict", "filesystem overwrote")
  const reopened = yield* FileObjectStore.make({ dir: directory })
  const recovered = yield* reopened.read("receipts/one", { maxBytes: 64 })
  assert(recovered !== undefined && text(recovered.bytes) === "filesystem", "filesystem reopen lost the object")

  const objects = new Map<string, Uint8Array>()
  const client: S3.Client = {
    guarantees: { singleAttempt: true, noRedirects: true },
    getObject: async (input) => {
      const stored = objects.get(input.Key ?? "")
      if (stored === undefined) {
        const missing = new Error("missing")
        missing.name = "NoSuchKey"
        throw missing
      }
      return {
        $metadata: { httpStatusCode: 200 },
        ETag: '"fixture-etag"',
        ContentLength: stored.byteLength,
        Body: { transformToWebStream: () => new globalThis.Response(new Uint8Array(stored)).body! } as NonNullable<
          GetObjectCommandOutput["Body"]
        >,
      }
    },
    createObject: async (input) => {
      const key = input.Key ?? ""
      if (objects.has(key)) {
        const conflict = new Error("conflict")
        conflict.name = "PreconditionFailed"
        throw conflict
      }
      if (!(input.Body instanceof Uint8Array)) throw new Error("expected byte body")
      objects.set(key, new Uint8Array(input.Body))
      return { $metadata: { httpStatusCode: 200 }, ETag: '"fixture-etag"' }
    },
    listObjects: async (input) => ({
      $metadata: { httpStatusCode: 200 },
      IsTruncated: false,
      EncodingType: "url",
      Contents: Array.from(objects.keys())
        .filter((key) => key.startsWith(input.Prefix ?? ""))
        .map((Key) => ({ Key: encodeURIComponent(Key) })),
    }),
  }
  const s3 = yield* S3.make({
    bucket: "packed-qualification",
    region: "us-east-1",
    client,
    capabilities: { conditionalCreate: true, strongReadAfterWrite: true, consistentListing: true },
  })
  assert((yield* s3.create("receipts/two", bytes("s3"))) === "created", "S3 create failed")
  assert((yield* s3.create("receipts/two", bytes("replacement"))) === "conflict", "S3 overwrote")
  const stored = yield* s3.read("receipts/two", { maxBytes: 64 })
  assert(stored !== undefined && text(stored.bytes) === "s3", "S3 read returned the wrong bytes")
  assert((yield* s3.list("receipts/")).keys.join(",") === "receipts/two", "S3 listing returned wrong keys")

  return { directory }
})

const qualifyExecutionSeams = Effect.gen(function* () {
  const sandbox = Sandbox.make({
    isolation: "process",
    limits: {},
    capabilities: {
      commands: ["Process"],
      files: false,
      pause: false,
      resume: false,
      snapshot: false,
      fork: false,
      limits: [],
    },
    start: (command) =>
      command._tag === "Process"
        ? Effect.succeed({
            events: Stream.empty,
            result: Effect.succeed({ stdout: command.arguments.join(" "), stderr: "", exitCode: 0 }),
          })
        : Sandbox.Unsupported.make({ operation: "exec:typescript", message: "fixture supports Process only" }),
    files: Sandbox.Unsupported.make({ operation: "files", message: "fixture has no filesystem" }),
    pause: Sandbox.Unsupported.make({ operation: "pause", message: "fixture cannot pause" }),
    resume: Sandbox.Unsupported.make({ operation: "resume", message: "fixture cannot resume" }),
    snapshot: Sandbox.Unsupported.make({ operation: "snapshot", message: "fixture cannot snapshot" }),
    fork: () => Sandbox.Unsupported.make({ operation: "fork", message: "fixture cannot fork" }),
  })
  const provider = Sandbox.SandboxProvider.of({
    defaultImage: "public-fixture:v1",
    acquire: () => Effect.succeed(sandbox),
  })
  const acquired = yield* provider.acquire()
  const execution = yield* acquired.exec({ _tag: "Process", command: "echo", arguments: ["public", "sandbox"] })
  assert(execution.stdout === "public sandbox", "SandboxProvider returned the wrong execution result")

  const executor = CodeExecutor.CodeExecutor.of({
    identity: CodeExecutor.testIdentity,
    execute: (request) =>
      Effect.succeed({
        protocolVersion: request.protocolVersion,
        requestId: request.requestId,
        sourceDigest: request.sourceDigest,
        inputCodec: request.inputCodec,
        outputCodec: request.outputCodec,
        output: request.input,
      }),
  })
  const signal = yield* Effect.abortSignal
  const request = CodeExecutor.makeRequest({
    requestId: "packed-code-executor",
    source: "export default input => input",
    inputCodec: "fixture:input:v1",
    outputCodec: "fixture:output:v1",
    encodedInput: { answer: 42 },
    signal,
    nowMillis: 0,
    wallTimeMillis: 1_000,
    outputBytes: 1_024,
    toolCalls: 0,
    agentRuns: 0,
    concurrency: 1,
    tokens: 0,
    logBytes: 0,
    tools: [],
    steps: [],
    agents: [],
  })
  const result = yield* executor.execute(request).pipe(
    Effect.provideService(
      ProgramCapabilities.ProgramCapabilities,
      ProgramCapabilities.ProgramCapabilities.of({
        discoverTools: Effect.succeed([]),
        describeTool: () => ProgramCapabilities.ProgramCapabilityMissing.make({ capability: "unused" }),
        callTool: () => ProgramCapabilities.ProgramCapabilityMissing.make({ capability: "unused" }),
        callStep: () => ProgramCapabilities.ProgramCapabilityMissing.make({ capability: "unused" }),
        runAgent: () => ProgramCapabilities.ProgramCapabilityMissing.make({ capability: "unused" }),
        mapAgents: () => ProgramCapabilities.ProgramCapabilityMissing.make({ capability: "unused" }),
        fanOutAgents: () => ProgramCapabilities.ProgramCapabilityMissing.make({ capability: "unused" }),
        log: () => Effect.void,
      }),
    ),
  )
  assert(Schema.is(CodeExecutor.Result)(result), "CodeExecutor returned an invalid protocol result")
  const output = yield* Schema.decodeUnknownEffect(Schema.Struct({ answer: Schema.Int }))(result.output)
  assert(output.answer === 42, "CodeExecutor returned the wrong output")
})

const usage = Response.Usage.make({
  inputTokens: { uncached: 1, total: 1, cacheRead: undefined, cacheWrite: undefined },
  outputTokens: { total: 1, text: 1, reasoning: undefined },
})
const completed = Stream.make(
  Response.makePart("text-delta", { id: "answer", delta: "done" }),
  Response.makePart("finish", { reason: "stop", usage, response: undefined }),
)

const qualifyRuntime = (directory: string) =>
  Effect.gen(function* () {
    const child = Agent.make({ name: "remote-child" })
    const parent = Agent.make({ name: "remote-parent", children: [child.name] })
    const agents = { [parent.name]: parent, [child.name]: child }
    const storage = Layer.merge(FileObjectStore.layer({ dir: directory }), BunCrypto.layer)
    let wakes = 0
    const peer = (partition: string) =>
      layerPeer({
        storage,
        namespace: { environment: "packed", tenant: "qualification", partition },
      })
    const routes = layerRoutes({
      connect: (partition: string) =>
        Effect.succeed(
          partition === "parent" || partition === "child"
            ? Option.some({ endpoint: peer(partition), wake: Effect.sync(() => void wakes++) })
            : Option.none(),
        ),
    })
    let childExecutions = 0
    const executionServices = (scope: Runtime.ExecutionScope<typeof agents>) =>
      Layer.effect(
        LanguageModel.LanguageModel,
        LanguageModel.make({
          generateText: () => Effect.succeed([{ type: "text", text: "unused" }]),
          streamText: () => {
            if (scope.sessionId !== "packed-parent-session") {
              childExecutions++
              return completed
            }
            return Stream.fromEffect(
              Effect.gen(function* () {
                const receipt = yield* scope.children.start({
                  agent: child.name,
                  input: "work",
                  commandId: "packed-child-start",
                  placement: { partition: "child" },
                })
                const outcome = yield* scope.children.await(receipt)
                assert(outcome._tag === "Succeeded" && outcome.output === "done", "external child did not succeed")
              }).pipe(Effect.orDie),
            ).pipe(Stream.flatMap(() => completed))
          },
        }),
      )
    const runtime = (partition: string) =>
      Runtime.layer({
        agents,
        revision: "packed-public-extensions-v1",
        services: Layer.mergeAll(Permissions.layerAllowAll, Approvals.layerAutoApprove, routes),
        executionServices,
        storage,
        namespace: { environment: "packed", tenant: "qualification", partition },
        scheduler: { concurrency: 1, pollInterval: "10 millis" },
      })
    yield* Layer.build(runtime("child"))
    const parentRuntime = Context.get(yield* Layer.build(runtime("parent")), Runtime.Runtime)
    const run = yield* parentRuntime.start(parent, "coordinate", {
      sessionId: "packed-parent-session",
      idempotencyKey: "packed-parent",
      treePolicy: { maxDepth: 1, maxSessions: 2, concurrency: { agents: 1, tools: 1 } },
    })
    assert((yield* run.await.pipe(Effect.timeout("10 seconds"))) === "done", "generic Runtime returned wrong output")
    assert(childExecutions === 1, "generic Runtime did not execute exactly one external child")
    assert(wakes > 0, "cross-partition coordination did not deliver a wake")
  })

const qualifyServer = Effect.gen(function* () {
  const event = Server.ClientEvent.make({
    _tag: "RunChanged",
    sessionId: "packed-session",
    cursor: "4",
    run: {
      runId: "packed-run",
      rootRunId: "packed-run",
      agent: { name: "assistant", revision: "v1" },
      status: "running",
      cursor: "3",
      turn: 1,
    },
  })
  const decoded = yield* Server.eventCodec.decode(yield* Server.eventCodec.encode(event))
  assert(
    decoded._tag === "RunChanged" && decoded.run.runId === "packed-run" && decoded.cursor === "4",
    "server projection did not round-trip",
  )
})

const qualifyMcp = Effect.gen(function* () {
  const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair()
  const server = new McpServer({ name: "packed-calculator", version: "1.0.0" }, { capabilities: { tools: {} } })
  server.server.setRequestHandler(ListToolsRequestSchema, () => ({
    tools: [
      {
        name: "add",
        description: "Add two numbers",
        inputSchema: {
          type: "object" as const,
          properties: { a: { type: "number" }, b: { type: "number" } },
          required: ["a", "b"],
        },
      },
    ],
  }))
  server.server.setRequestHandler(CallToolRequestSchema, (request) => {
    const input = Schema.decodeUnknownSync(Schema.Struct({ a: Schema.Finite, b: Schema.Finite }))(
      request.params.arguments,
    )
    return { content: [{ type: "text" as const, text: String(input.a + input.b) }] }
  })
  yield* Effect.acquireRelease(
    Effect.tryPromise(() => server.connect(serverTransport)),
    () => Effect.tryPromise(() => server.close()).pipe(Effect.ignore),
  )
  const client = yield* MCPClient.fromTransport("packed", clientTransport)
  const tools = yield* MCPTools.toolkit(client)
  assert(Object.keys(tools.tools).join(",") === "packed_add", "MCP discovery returned the wrong toolkit")
  assert((yield* client.callTool("add", { a: 19, b: 23 })) === "42", "MCP call returned the wrong result")
  yield* Layer.build(MCPTools.layerToolkit(client))
})

const program = Effect.gen(function* () {
  const { directory } = yield* qualifyObjectStores
  yield* qualifyExecutionSeams
  yield* qualifyRuntime(directory)
  yield* qualifyServer
  yield* qualifyMcp
  yield* Effect.log("qualified ObjectStore/fs/S3, SandboxProvider/CodeExecutor, Runtime child wake, server, and MCP")
})

await Effect.runPromise(Effect.scoped(program).pipe(Effect.provide(bunServices)))
