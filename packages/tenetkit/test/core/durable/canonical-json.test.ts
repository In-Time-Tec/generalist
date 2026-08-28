import { expect, it } from "@effect/vitest"
import { Schema } from "effect"
import { digest, sha256Text } from "../../../src/core/durable/canonical-json.js"

const rotate = (value: number, amount: number): number => (value >>> amount) | (value << (32 - amount))

const primes: Array<number> = []
for (let candidate = 2; primes.length < 64; candidate += 1) {
  if (primes.every((prime) => candidate % prime !== 0)) primes.push(candidate)
}
const fraction = (value: number): number => ((value % 1) * 0x100000000) >>> 0
const constants = primes.map((prime) => fraction(prime ** (1 / 3)))
const initial = primes.slice(0, 8).map((prime) => fraction(Math.sqrt(prime)))

/** The superseded allocating implementation, kept here only as a digest oracle. */
const referenceSha256Text = (text: string): string => {
  const input = new TextEncoder().encode(text)
  const size = Math.ceil((input.length + 9) / 64) * 64
  const bytes = new Uint8Array(size)
  bytes.set(input)
  bytes[input.length] = 0x80
  const view = new DataView(bytes.buffer)
  view.setUint32(size - 8, Math.floor(input.length / 0x20000000))
  view.setUint32(size - 4, input.length << 3)
  const hash = [...initial]
  const words = new Uint32Array(64)
  for (let offset = 0; offset < size; offset += 64) {
    for (let index = 0; index < 16; index += 1) {
      words[index] = view.getUint32(offset + index * 4)
    }
    for (let index = 16; index < 64; index += 1) {
      const left = words[index - 15]!
      const right = words[index - 2]!
      words[index] =
        (words[index - 16]! +
          (rotate(left, 7) ^ rotate(left, 18) ^ (left >>> 3)) +
          words[index - 7]! +
          (rotate(right, 17) ^ rotate(right, 19) ^ (right >>> 10))) >>>
        0
    }
    let [a, b, c, d, e, f, g, h] = hash
    for (let index = 0; index < 64; index += 1) {
      const temporary1 =
        (h! +
          (rotate(e!, 6) ^ rotate(e!, 11) ^ rotate(e!, 25)) +
          ((e! & f!) ^ (~e! & g!)) +
          constants[index]! +
          words[index]!) >>>
        0
      const temporary2 = ((rotate(a!, 2) ^ rotate(a!, 13) ^ rotate(a!, 22)) + ((a! & b!) ^ (a! & c!) ^ (b! & c!))) >>> 0
      ;[a, b, c, d, e, f, g, h] = [(temporary1 + temporary2) >>> 0, a, b, c, (d! + temporary1) >>> 0, e, f, g]
    }
    const next = [a!, b!, c!, d!, e!, f!, g!, h!]
    for (let index = 0; index < 8; index += 1) hash[index] = (hash[index]! + next[index]!) >>> 0
  }
  return hash.map((word) => word.toString(16).padStart(8, "0")).join("")
}

it("matches the published SHA-256 vectors", () => {
  expect(sha256Text("")).toBe("e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855")
  expect(sha256Text("abc")).toBe("ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad")
  expect(sha256Text("abcdbcdecdefdefgefghfghighijhijkijkljklmklmnlmnomnopnopq")).toBe(
    "248d6a61d20638b8e5c026930c3e6039a33ce45964ff2167f6ecedd419db06c1",
  )
})

const textCases: ReadonlyArray<string> = [
  "",
  "a",
  "abc",
  " ",
  "\u0000",
  "\u0000\u0000\u0000",
  "héllo ünicode",
  "😀 emoji with surrogate pairs 🚀🎉",
  "\uD800",
  "\uDFFF",
  "lone \uD800 surrogate",
  "unpaired \uDC00 trailing",
  "\uD800\uD800\uDC00",
  "日本語のテキスト",
  "\u{10FFFF}",
  "line\nbreaks\tand\ttabs\r\n",
  '{"quoted":"json"}',
  "a".repeat(54),
  "a".repeat(55),
  "a".repeat(56),
  "a".repeat(63),
  "a".repeat(64),
  "a".repeat(65),
  "a".repeat(119),
  "a".repeat(120),
  "a".repeat(127),
  "a".repeat(128),
  "a".repeat(255),
  "a".repeat(256),
  "a".repeat(257),
  "a".repeat(1000),
  "a".repeat(4096),
  "ü".repeat(60),
  "😀".repeat(40),
  "z".repeat(65_536),
]

it("keeps every sha256Text digest byte-identical to the superseded implementation", () => {
  for (const text of textCases) {
    expect(sha256Text(text)).toBe(referenceSha256Text(text))
  }
})

it("keeps sha256Text digests identical across pseudorandom inputs of every block alignment", () => {
  let state = 123_456_789
  const next = (): number => {
    state = (state * 1_103_515_245 + 12_345) & 0x7fffffff
    return state
  }
  for (let length = 0; length < 600; length += 1) {
    let text = ""
    for (let index = 0; index < length; index += 1) text += String.fromCodePoint(32 + (next() % 900))
    expect(sha256Text(text)).toBe(referenceSha256Text(text))
  }
})

type CanonicalValue = Schema.Json
const CanonicalArray = Schema.Array(Schema.Json)

const referenceDigest = (value: CanonicalValue): string => referenceSha256Text(digestText(value))

const canonical = (input: CanonicalValue): CanonicalValue => {
  if (Schema.is(CanonicalArray)(input)) return input.map(canonical)
  if (!Schema.is(Schema.JsonObject)(input)) return Object.is(input, -0) ? 0 : input
  return Object.fromEntries(
    Object.keys(input)
      .toSorted()
      .map((key) => {
        const value = input[key]
        if (value === undefined) throw new Error("JSON object values cannot be undefined")
        return [key, canonical(value)]
      }),
  )
}

/** Canonical text used only to drive the oracle, mirroring the shipped canonical form. */
const digestText = (value: CanonicalValue): string => JSON.stringify(canonical(value))

const valueCases: ReadonlyArray<CanonicalValue> = [
  null,
  true,
  false,
  0,
  -0,
  1,
  -1,
  Math.PI,
  1e21,
  Number.MAX_SAFE_INTEGER,
  "",
  "plain string",
  "unicode ünïcödé 😀",
  [],
  {},
  [1, 2, 3],
  [[1, [2, [3, [4]]]]],
  [null, true, "x", 5, [], {}],
  { a: 1 },
  { a: 1, b: 2, c: 3 },
  { nested: { deep: { deeper: { value: [1, 2, { end: true }] } } } },
  { "": "empty key" },
  { "key with spaces": 1, "ünicode-key": 2, "😀": 3 },
  { list: Array.from({ length: 200 }, (_, index) => ({ index, name: `item-${index}` })) },
  { text: "x".repeat(50_000) },
  Array.from({ length: 500 }, (_, index) => index),
]

it("keeps every digest byte-identical to the superseded implementation", () => {
  for (const value of valueCases) {
    expect(digest(value)).toBe(referenceDigest(value))
  }
})

it("derives one digest from object content regardless of key insertion order", () => {
  const forward = { alpha: 1, beta: [1, 2], gamma: { x: "y" } }
  const reverse = { gamma: { x: "y" }, beta: [1, 2], alpha: 1 }
  expect(digest(forward)).toBe(digest(reverse))
  expect(digest(forward)).toBe(referenceDigest(forward))
})

it("separates values that differ only slightly", () => {
  const digests = new Set(
    [{ a: 1 }, { a: 2 }, { a: "1" }, { b: 1 }, [1], ["1"], "a", "b", 0, false, null].map((value) => digest(value)),
  )
  expect(digests.size).toBe(11)
})

it("returns a repeated digest that is exactly the freshly computed digest", () => {
  const closure = { closure: Array.from({ length: 400 }, (_, index) => `entry-${index}`) }
  const first = digest(closure)
  const repeated = Array.from({ length: 50 }, () => digest(structuredClone(closure)))
  for (const value of repeated) expect(value).toBe(first)
  expect(first).toBe(referenceDigest(closure))
})

it("never serves a cached digest for a different value", () => {
  const base = "shared-prefix-".repeat(40)
  const digests = new Map<string, string>()
  for (let index = 0; index < 800; index += 1) {
    const text = `${base}${index}`
    digests.set(text, sha256Text(text))
  }
  for (const [text, hex] of digests) {
    expect(sha256Text(text)).toBe(hex)
    expect(hex).toBe(referenceSha256Text(text))
  }
})

it("beats the superseded implementation by a wide margin on a manifest-sized input", () => {
  const text = JSON.stringify({
    entries: Array.from({ length: 60 }, (_, index) => ({
      name: `capability-${index}`,
      pin: `capability-pin:v1:sha256:${"0".repeat(64)}`,
    })),
    instructions: "You are a durable agent. ".repeat(200),
  })
  expect(text.length).toBeGreaterThan(10_000)

  const measure = (hash: (input: string) => string, iterations: number): number => {
    const unique = Array.from({ length: iterations }, (_, index) => `${text}${index}`)
    for (const input of unique.slice(0, 3)) hash(input)
    const started = performance.now()
    for (const input of unique) hash(input)
    return (text.length * iterations) / 1024 / 1024 / ((performance.now() - started) / 1000)
  }

  // Relative throughput only: an absolute MB/s floor measures the machine, not the implementation, and
  // flakes under parallel test load on shared CI runners.
  const referenceRate = measure(referenceSha256Text, 20)
  const currentRate = measure(sha256Text, 200)
  expect(currentRate).toBeGreaterThan(referenceRate * 4)
})

it("serves a repeated large digest far faster than it recomputes a new one", () => {
  const text = "durable-closure-".repeat(2_000)
  sha256Text(text)
  const started = performance.now()
  for (let index = 0; index < 2_000; index += 1) sha256Text(text)
  const cachedRate = (text.length * 2_000) / 1024 / 1024 / ((performance.now() - started) / 1000)
  expect(cachedRate).toBeGreaterThan(1_000)
  expect(sha256Text(text)).toBe(referenceSha256Text(text))
})
