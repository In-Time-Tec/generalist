const rotate = (value: number, amount: number): number => (value >>> amount) | (value << (32 - amount))

const primes: Array<number> = []
for (let candidate = 2; primes.length < 64; candidate += 1) {
  if (primes.every((prime) => candidate % prime !== 0)) primes.push(candidate)
}
const fraction = (value: number): number => ((value % 1) * 0x100000000) >>> 0
const constants = primes.map((prime) => fraction(prime ** (1 / 3)))
const initial = primes.slice(0, 8).map((prime) => fraction(Math.sqrt(prime)))

/** @experimental Synchronous cross-runtime SHA-256 over UTF-8 text. */
export const sha256Text = (text: string): string => {
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

const canonicalize = (value: unknown, seen: Set<object>): unknown => {
  if (value === null || typeof value === "string" || typeof value === "boolean") return value
  if (typeof value === "number") {
    if (!Number.isFinite(value)) throw new TypeError("Unsupported number")
    return Object.is(value, -0) ? 0 : value
  }
  if (typeof value !== "object") throw new TypeError("Unsupported value")
  if (seen.has(value)) throw new TypeError("Cyclic value")
  seen.add(value)
  try {
    if (Array.isArray(value)) {
      if (Object.getOwnPropertySymbols(value).length > 0) throw new TypeError("Unsupported symbol property")
      const descriptors = Object.getOwnPropertyDescriptors(value)
      for (let index = 0; index < value.length; index += 1) {
        const descriptor = descriptors[String(index)]
        if (descriptor === undefined) throw new TypeError("Sparse array")
        if (!("value" in descriptor) || !descriptor.enumerable) {
          throw new TypeError("Unsupported array property")
        }
      }
      const expected = new Set(["length", ...Array.from({ length: value.length }, (_, index) => String(index))])
      if (Reflect.ownKeys(descriptors).some((key) => typeof key !== "string" || !expected.has(key))) {
        throw new TypeError("Unsupported extra array property")
      }
      return Array.from(value, (item) => canonicalize(item, seen))
    }
    if (Object.getPrototypeOf(value) !== Object.prototype && Object.getPrototypeOf(value) !== null) {
      throw new TypeError("Unsupported object")
    }
    if (Object.getOwnPropertySymbols(value).length > 0) throw new TypeError("Unsupported symbol property")
    const descriptors = Object.getOwnPropertyDescriptors(value)
    for (const descriptor of Object.values(descriptors)) {
      if (!("value" in descriptor) || !descriptor.enumerable) {
        throw new TypeError("Unsupported property")
      }
    }
    return Object.fromEntries(
      Object.keys(descriptors)
        .toSorted()
        .map((key) => [key, canonicalize(descriptors[key]!.value, seen)]),
    )
  } finally {
    seen.delete(value)
  }
}

/** @experimental Canonical SHA-256 identity for closed JSON values. */
export const digest = (value: unknown): string => sha256Text(JSON.stringify(canonicalize(value, new Set())))
