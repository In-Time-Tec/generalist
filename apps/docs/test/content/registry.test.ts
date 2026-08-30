// @vitest-environment happy-dom
import { expect, test } from "vitest"

import { allPages, pageByPath } from "../../src/content/registry"
import { addressedMessaging } from "../../src/pages/guides/agent/addressed-messaging"
import { agentGuidance } from "../../src/pages/guides/agent/guidance"
import { durableCompositeTools } from "../../src/pages/guides/tools/durable-composite-tools"
import { typescriptCells } from "../../src/pages/guides/tools/typescript-cells"
import { kernelBoundaries } from "../../src/pages/learn/kernel-boundaries"
import { cellAgent } from "../../src/pages/start/cell-agent"

/**
 * These pages document contracts that are cheap to describe loosely and expensive to get wrong.
 * Each marker below is a claim proven by a named test in the owning package, so a page that drops
 * it is drifting from the behavior it describes rather than merely being reworded.
 */

test("every new capability page is registered under its Diataxis group", () => {
  const registered = new Map(allPages.map((page) => [page.path, page]))
  for (const page of [
    cellAgent,
    kernelBoundaries,
    typescriptCells,
    agentGuidance,
    durableCompositeTools,
    addressedMessaging,
  ]) {
    expect(registered.get(page.path), page.path).toBe(page)
    expect(pageByPath.get(page.path), page.path).toBe(page)
  }
  expect(cellAgent.group).toBe("Start")
  expect(kernelBoundaries.group).toBe("Learn")
  for (const page of [typescriptCells, agentGuidance, durableCompositeTools, addressedMessaging]) {
    expect(page.group, page.path).toBe("Guides")
  }
})

test("the kernel explanation keeps the child-process reproduction and the two-part frame channel", () => {
  for (const marker of [
    "child process",
    "BunWorker",
    "SIGTRAP",
    "133",
    "five runs out of five",
    "AbortSignal",
    "breakOnSigint",
    "SIGKILL",
    "descriptors 3 and 4",
    "boot",
    "module scope",
    "argv",
    "process table",
    "fabricates its own terminal result",
    "ordinary cell output",
  ]) {
    expect(kernelBoundaries.markdown, marker).toContain(marker)
  }
})

test("the kernel explanation keeps the profile-pin and working-memory contracts", () => {
  for (const marker of [
    "required rather than optional",
    "a profile that never ran",
    "Unknown keys are dropped",
    "foreign protocol version fails to decode",
    "no secret-bearing field",
    "not scanned",
    "working memory",
    "restoredNames",
    "droppedNames",
    "CellOutcomeUnknown",
    "never replayed",
  ]) {
    expect(kernelBoundaries.markdown, marker).toContain(marker)
  }
})

test("the cell guide keeps the execution and failure contracts", () => {
  for (const marker of [
    "typescript",
    "{ maxConcurrency: 1, parallelSafe: [] }",
    'failureMode: "return"',
    "idleTimeToLive",
    "module bindings and live handles do not",
    "workerModule",
    "CellExecutionFailed",
    "KernelUnavailable",
    "KernelProtocolViolation",
    "CellOutcomeUnknown",
    "limits.sourceBytes",
    "returned complete",
  ]) {
    expect(typescriptCells.markdown, marker).toContain(marker)
  }
})

test("the cell tutorial walks a beginner from an epoch to the real kernel", () => {
  for (const marker of [
    "KernelProfile",
    "bun add effect tenetkit tenetkit/repl",
    "TestKernel.layerTestPool",
    "HostModules",
    "tenetkit/repl/bun",
    "bindingsDigest",
    "sequence",
  ]) {
    expect(cellAgent.markdown, marker).toContain(marker)
  }
  // A tutorial has to run start to finish, so every step shows what the reader should see.
  const steps = cellAgent.content.filter((node) => node.kind === "heading")
  expect(steps.length).toBeGreaterThanOrEqual(5)
})

test("the agent-guidance guide keeps the authorship boundary and the durable-store guarantees", () => {
  for (const marker of [
    "Authorship.author",
    "AuthoredProposal",
    "revision",
    "Refinement.apply",
    "Refinement.applyTrusted",
    "Refinement.makeRollback",
    "pinned-revision",
    "compile-time discriminator",
    "rollback-not-newest",
    "FileSystemStore.layer({ path })",
    "0600",
    "0700",
    "corrupt",
    "Registration.make(state, name)",
  ]) {
    expect(agentGuidance.markdown, marker).toContain(marker)
  }
})

test("the composite-tool guide keeps nested identity, render provenance, and admission semantics", () => {
  for (const marker of [
    "NestedOperation.run(request, effect)",
    "<operationKey>#<ordinal>",
    "NestedOperationDivergence",
    "NestedOperationUnknown",
    "NestedOperationDenied",
    "NestedOperationSuspended",
    "never from the request payload",
    "NestedOperation.maxRenderBytes",
    "renderWithheldBytes",
    "ChildAdmission.admit",
    "join does not block",
    "ChildParentageInvalid",
    "ChildOrigin",
    "unforgeable",
    "idempotency key",
    "SessionHistory.pageHistory",
    "hasBefore",
    "compactionCheckpoints",
  ]) {
    expect(durableCompositeTools.markdown, marker).toContain(marker)
  }
})

test("the messaging guide keeps the newest-Run rule and the consumption-ack contract", () => {
  for (const marker of [
    "runAddress",
    "sessionAddress",
    "nameAddress",
    "newest",
    "keyed by session rather than by Run",
    "never carries authority",
    "MessagingUnauthorized",
    "cross-session",
    "only ever widens",
    "directional",
    "fromRunId",
    "duplicate: true",
    "MessageConflict",
    "MailboxFull",
    "MailboxRateLimited",
    "RunTerminal",
    'replayPolicy: "never"',
    "turn boundary",
    "There is no ack call",
    "at-least-once bind, exactly-once consume",
    "deliveredRunId",
    "attribution and diagnostics only",
  ]) {
    expect(addressedMessaging.markdown, marker).toContain(marker)
  }
})
