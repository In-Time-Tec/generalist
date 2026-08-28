import { describe, expect, it } from "@effect/vitest"
import { Schema } from "effect"
import { Cell } from "../../src/repl/index"

const profileDigest = "digest-a"
const sessionId = "session-a"
const cellId = "cell-a"

describe("Cell schemas", () => {
  it("round-trips a cell result through its codec", () => {
    const result: Cell.CellResult = {
      cellId,
      epoch: 3,
      sequence: 7,
      value: "42",
      stdout: "hello\n",
      stderr: "",
      durationMillis: 12,
      truncation: [{ channel: "stdout", droppedBytes: 128, droppedEvents: 2 }],
    }
    const encoded = Schema.encodeSync(Cell.CellResult)(result)
    expect(Schema.decodeUnknownSync(Cell.CellResult)(encoded)).toEqual(result)
  })

  it("rejects a negative sequence", () => {
    expect(() =>
      Schema.decodeUnknownSync(Cell.CellResult)({
        cellId,
        epoch: 0,
        sequence: -1,
        value: "",
        stdout: "",
        stderr: "",
        durationMillis: 0,
        truncation: [],
      }),
    ).toThrow()
  })

  it("rejects a fractional epoch", () => {
    expect(() =>
      Schema.decodeUnknownSync(Cell.CellResult)({
        cellId,
        epoch: 1.5,
        sequence: 0,
        value: "",
        stdout: "",
        stderr: "",
        durationMillis: 0,
        truncation: [],
      }),
    ).toThrow()
  })

  it("rejects an empty cell identity", () => {
    expect(() => Schema.decodeUnknownSync(Cell.CellId)("")).toThrow()
  })

  it("round-trips every cell event tag", () => {
    const events: ReadonlyArray<Cell.CellEvent> = [
      { _tag: "KernelStarting", cellId, sequence: 0, sessionId, epoch: 0 },
      { _tag: "KernelReady", cellId, sequence: 1, sessionId, epoch: 0, profileDigest },
      { _tag: "Stdout", cellId, sequence: 2, text: "out" },
      { _tag: "Stderr", cellId, sequence: 3, text: "err" },
      { _tag: "Display", cellId, sequence: 4, mediaType: "image/png", data: "AAA", name: "chart" },
      { _tag: "OutputTruncated", cellId, sequence: 5, channel: "stdout", droppedBytes: 10, droppedEvents: 1 },
      { _tag: "StateRestored", cellId, sequence: 6, epoch: 1, names: ["a"], restoredBySource: ["f"] },
      { _tag: "StateLost", cellId, sequence: 7, epoch: 1, droppedNames: ["proc"], reason: "live-handle" },
      { _tag: "KernelRestarted", cellId, sequence: 8, sessionId, epoch: 1, reason: "killed" },
      {
        _tag: "HostCall",
        cellId,
        sequence: 9,
        requestId: "hr-1",
        module: "workspace",
        operation: "read",
        inputSummary: '{"path":"a.ts"}',
        status: "returned",
        durationMillis: 4,
        message: '{"text":"a"}',
      },
      { _tag: "Result", cellId, sequence: 10, value: "42", durationMillis: 5 },
    ]
    for (const event of events) {
      const encoded = Schema.encodeSync(Cell.CellEvent)(event)
      expect(Schema.decodeUnknownSync(Cell.CellEvent)(encoded)).toEqual(event)
    }
    expect(new Set(events.map((event) => event._tag))).toEqual(new Set(Cell.eventTags))
  })

  it("keeps the event union closed", () => {
    expect(() => Schema.decodeUnknownSync(Cell.CellEvent)({ _tag: "Whatever", cellId, sequence: 0 })).toThrow()
  })

  it("rejects an unknown truncation channel", () => {
    expect(() => Schema.decodeUnknownSync(Cell.Channel)("network")).toThrow()
  })

  it("exposes the cell-local ordinal of every event", () => {
    expect(Cell.sequenceOf({ _tag: "Stdout", cellId, sequence: 4, text: "x" })).toBe(4)
  })
})

describe("Cell failure taxonomy", () => {
  const failures: ReadonlyArray<Cell.CellFailure> = [
    Cell.CellExecutionFailed.make({
      cellId,
      epoch: 0,
      sequence: 2,
      name: "TypeError",
      message: "boom",
      stack: "TypeError: boom",
      stdout: "",
      stderr: "boom",
      durationMillis: 1,
      truncation: [],
    }),
    Cell.KernelUnavailable.make({ sessionId, reason: "start-failed", message: "no kernel" }),
    Cell.KernelProtocolViolation.make({ sessionId, cellId, message: "bad frame" }),
    Cell.CellOutcomeUnknown.make({ sessionId, cellId, epoch: 0, reason: "host-terminated", message: "unknown" }),
  ]

  it("covers exactly the four documented failure tags", () => {
    expect(failures.map((failure) => failure._tag)).toEqual([...Cell.failureTags])
    expect(new Set(Cell.failureTags).size).toBe(4)
  })

  it("round-trips every failure through the union codec", () => {
    for (const failure of failures) {
      const encoded = Schema.encodeUnknownSync(Cell.CellFailure)(failure)
      const decoded = Schema.decodeUnknownSync(Cell.CellFailure)(encoded)
      expect(decoded._tag).toBe(failure._tag)
      expect(Schema.encodeUnknownSync(Cell.CellFailure)(decoded)).toEqual(encoded)
    }
  })

  it("tags every failure under the package scope", () => {
    for (const tag of Cell.failureTags) expect(tag.startsWith("tenetkit/repl/")).toBe(true)
  })

  it("rejects an unknown failure tag", () => {
    expect(() => Schema.decodeUnknownSync(Cell.CellFailure)({ _tag: "tenetkit/repl/Nope", message: "x" })).toThrow()
  })

  it("keeps an execution failure carrying the surviving epoch", () => {
    const failure = failures[0]
    expect(Schema.is(Cell.CellExecutionFailed)(failure)).toBe(true)
    if (Schema.is(Cell.CellExecutionFailed)(failure)) expect(failure.epoch).toBe(0)
  })
})

describe("Cell sequence monotonicity", () => {
  const stdout = (sequence: number, id = cellId): Cell.CellEvent => ({
    _tag: "Stdout",
    cellId: id,
    sequence,
    text: "x",
  })

  it("accepts a run of strictly increasing sequences from zero", () => {
    expect(Cell.validateSequence({ sessionId: sessionId, events: [stdout(0), stdout(1), stdout(2)] })).toBeUndefined()
  })

  it("accepts an empty event run", () => {
    expect(Cell.validateSequence({ sessionId: sessionId, events: [] })).toBeUndefined()
  })

  it("rejects a run that does not start at zero", () => {
    const violation = Cell.validateSequence({ sessionId: sessionId, events: [stdout(1)] })
    expect(violation?.message).toContain("expected sequence 0")
  })

  it("rejects a gap", () => {
    const violation = Cell.validateSequence({ sessionId: sessionId, events: [stdout(0), stdout(2)] })
    expect(violation?.message).toContain("expected sequence 1")
  })

  it("rejects a repeated sequence", () => {
    expect(Cell.validateSequence({ sessionId: sessionId, events: [stdout(0), stdout(0)] })).toBeDefined()
  })

  it("rejects events from a second cell", () => {
    const violation = Cell.validateSequence({ sessionId: sessionId, events: [stdout(0), stdout(1, "cell-b")] })
    expect(violation?.message).toContain("expected cell cell-a")
  })
})
