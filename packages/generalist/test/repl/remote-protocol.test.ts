import { describe, expect, it } from "@effect/vitest"
import { Schema } from "effect"
import { RemoteKernelProtocol } from "../../src/repl/index.js"

const claim = {
  sessionId: "session",
  ownerId: "host-a",
  generation: 2,
  epoch: 3,
  profileDigest: "profile-v1",
  cellId: "cell",
}

describe("RemoteKernelProtocol", () => {
  it("contains only the five public KernelPool operations and requires an exact command claim", () => {
    const commands = [
      { _tag: "Execute", claim, code: "42", deadlineMillis: 1_000 },
      { _tag: "Inspect", claim },
      { _tag: "Interrupt", claim, expectedCell: { ...claim, generation: 1 } },
      { _tag: "Restart", claim, reason: "requested" },
      { _tag: "Close", claim },
    ]
    expect(commands.map((command) => Schema.decodeUnknownSync(RemoteKernelProtocol.Command)(command)._tag)).toEqual([
      "Execute",
      "Inspect",
      "Interrupt",
      "Restart",
      "Close",
    ])
    expect(() =>
      Schema.decodeUnknownSync(RemoteKernelProtocol.Command)({
        _tag: "Execute",
        claim: { ...claim, generation: undefined },
        code: "42",
        deadlineMillis: 1_000,
      }),
    ).toThrow()
    expect(() => Schema.decodeUnknownSync(RemoteKernelProtocol.Command)({ _tag: "Pause", claim })).toThrow()
  })

  it("rejects events and terminal outcomes whose nested identity differs from their command claim", () => {
    const ready = {
      _tag: "KernelReady",
      cellId: "cell",
      sequence: 0,
      sessionId: "session",
      epoch: 3,
      profileDigest: "profile-v1",
    } as const
    expect(Schema.decodeSync(RemoteKernelProtocol.Event)({ _tag: "Event", claim, event: ready })).toBeDefined()
    expect(() =>
      Schema.decodeSync(RemoteKernelProtocol.Event)({
        _tag: "Event",
        claim,
        event: { ...ready, profileDigest: "wrong-profile" },
      }),
    ).toThrow()
    expect(() =>
      Schema.decodeSync(RemoteKernelProtocol.Result)({
        _tag: "Result",
        claim,
        result: {
          cellId: "other-cell",
          epoch: 3,
          sequence: 1,
          value: "42",
          stdout: "",
          stderr: "",
          durationMillis: 0,
        },
      }),
    ).toThrow()
    expect(() =>
      Schema.decodeSync(RemoteKernelProtocol.Failure)({
        _tag: "Failure",
        claim,
        failure: {
          _tag: "generalist/repl/CellOutcomeUnknown",
          sessionId: "session",
          cellId: "cell",
          epoch: 4,
          reason: "transport-lost",
          message: "uncertain",
        },
      }),
    ).toThrow()
  })
})
