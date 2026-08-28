const primes: Array<number> = []
for (let candidate = 2; primes.length < 64; candidate += 1) {
  if (primes.every((prime) => candidate % prime !== 0)) primes.push(candidate)
}
const fraction = (value: number): number => ((value % 1) * 0x100000000) >>> 0
const constants = new Uint32Array(primes.map((prime) => fraction(prime ** (1 / 3))))
const initial = new Uint32Array(primes.slice(0, 8).map((prime) => fraction(Math.sqrt(prime))))

import { Function, Schema } from "effect"

const encoder = new TextEncoder()
const schedule = new Uint32Array(64)
let padded = new Uint8Array(1024)
let paddedView = new DataView(padded.buffer)

const cacheEntryLimit = 512
const cacheByteLimit = 8 * 1024 * 1024
const cache = new Map<string, string>()
let cacheBytes = 0

/**
 * Cache one digest under its complete input text. The key is the entire hashed
 * message, so a hit is exactly the digest of that text and never of another value.
 * Map insertion order supplies least-recently-used eviction under both bounds.
 */
const remember = (text: string, hex: string): string => {
  cache.set(text, hex)
  cacheBytes += text.length
  while (cache.size > cacheEntryLimit || cacheBytes > cacheByteLimit) {
    const oldest = cache.keys().next()
    if (oldest.done === true || cache.size === 1) break
    cache.delete(oldest.value)
    cacheBytes -= oldest.value.length
  }
  return hex
}

/** Grow the reusable padding buffer to hold one message and its length block. */
const reserve = (size: number): void => {
  if (padded.length >= size) return
  let capacity = padded.length
  while (capacity < size) capacity *= 2
  padded = new Uint8Array(capacity)
  paddedView = new DataView(padded.buffer)
}

/** Encode text into the reusable buffer with SHA-256 padding and return the padded byte length. */
const pad = (text: string): number => {
  const encoded = encoder.encode(text)
  const written = encoded.length
  reserve(written + 72)
  padded.set(encoded)
  const size = (((written + 8) >>> 6) + 1) << 6
  padded.fill(0, written, size)
  padded[written] = 0x80
  paddedView.setUint32(size - 8, Math.floor(written / 0x20000000))
  paddedView.setUint32(size - 4, written << 3)
  return size
}

const word = (value: number): string => (value >>> 0).toString(16).padStart(8, "0")

/** Inputs below this size hash faster than a cache probe pays for itself. */
const cacheMinimumLength = 256

/** @experimental Synchronous cross-runtime SHA-256 over UTF-8 text. */
export const sha256Text = (text: string): string => {
  const cached = text.length < cacheMinimumLength ? undefined : cache.get(text)
  if (cached !== undefined) {
    cache.delete(text)
    cache.set(text, cached)
    return cached
  }
  const size = pad(text)
  let hash0 = initial[0]!
  let hash1 = initial[1]!
  let hash2 = initial[2]!
  let hash3 = initial[3]!
  let hash4 = initial[4]!
  let hash5 = initial[5]!
  let hash6 = initial[6]!
  let hash7 = initial[7]!
  for (let offset = 0; offset < size; offset += 64) {
    for (let index = 0; index < 16; index += 1) {
      const at = offset + index * 4
      schedule[index] = (padded[at]! << 24) | (padded[at + 1]! << 16) | (padded[at + 2]! << 8) | padded[at + 3]!
    }
    for (let index = 16; index < 64; index += 1) {
      const left = schedule[index - 15]!
      const right = schedule[index - 2]!
      schedule[index] =
        (schedule[index - 16]! +
          (((left >>> 7) | (left << 25)) ^ ((left >>> 18) | (left << 14)) ^ (left >>> 3)) +
          schedule[index - 7]! +
          (((right >>> 17) | (right << 15)) ^ ((right >>> 19) | (right << 13)) ^ (right >>> 10))) |
        0
    }
    let a = hash0
    let b = hash1
    let c = hash2
    let d = hash3
    let e = hash4
    let f = hash5
    let g = hash6
    let h = hash7
    for (let index = 0; index < 64; index += 1) {
      const temporary1 =
        (h +
          (((e >>> 6) | (e << 26)) ^ ((e >>> 11) | (e << 21)) ^ ((e >>> 25) | (e << 7))) +
          ((e & f) ^ (~e & g)) +
          constants[index]! +
          schedule[index]!) |
        0
      const temporary2 =
        ((((a >>> 2) | (a << 30)) ^ ((a >>> 13) | (a << 19)) ^ ((a >>> 22) | (a << 10))) +
          ((a & b) ^ (a & c) ^ (b & c))) |
        0
      h = g
      g = f
      f = e
      e = (d + temporary1) | 0
      d = c
      c = b
      b = a
      a = (temporary1 + temporary2) | 0
    }
    hash0 = (hash0 + a) | 0
    hash1 = (hash1 + b) | 0
    hash2 = (hash2 + c) | 0
    hash3 = (hash3 + d) | 0
    hash4 = (hash4 + e) | 0
    hash5 = (hash5 + f) | 0
    hash6 = (hash6 + g) | 0
    hash7 = (hash7 + h) | 0
  }
  const hex =
    word(hash0) + word(hash1) + word(hash2) + word(hash3) + word(hash4) + word(hash5) + word(hash6) + word(hash7)
  return text.length < cacheMinimumLength ? hex : remember(text, hex)
}

const canonicalize = (value: Schema.Json): Schema.Json => {
  if (Array.isArray(value)) return value.map(canonicalize)
  if (value === null || !Schema.is(Schema.JsonObject)(value)) return Object.is(value, -0) ? 0 : value
  return Object.fromEntries(
    Object.keys(value)
      .toSorted()
      .map((key) => [key, canonicalize(value[key]!)]),
  )
}

/** @experimental Canonical SHA-256 identity for closed JSON values. */
export const digest = Function.flow(Schema.decodeUnknownSync(Schema.Json), canonicalize, JSON.stringify, sha256Text)
