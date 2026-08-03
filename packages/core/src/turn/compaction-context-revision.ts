const hasFaithfulJsonIdentity = (value: unknown, ancestors: Set<object> = new Set()): boolean => {
  switch (typeof value) {
    case "string":
    case "boolean":
      return true
    case "number":
      return Number.isFinite(value) && !Object.is(value, -0)
    case "object": {
      if (value === null || ancestors.has(value)) return value === null
      if (Array.isArray(value)) {
        if (Object.getPrototypeOf(value) !== Array.prototype || Object.getOwnPropertySymbols(value).length > 0)
          return false
        for (let index = 0; index < value.length; index += 1) {
          const descriptor = Object.getOwnPropertyDescriptor(value, String(index))
          if (
            descriptor === undefined ||
            "get" in descriptor ||
            !hasFaithfulJsonIdentity(descriptor.value, new Set(ancestors).add(value))
          )
            return false
        }
        return Object.getOwnPropertyNames(value).every((key) => {
          if (key === "length") return true
          const index = Number(key)
          return Number.isInteger(index) && index >= 0 && index < value.length && String(index) === key
        })
      }
      const prototype = Object.getPrototypeOf(value)
      if ((prototype !== Object.prototype && prototype !== null) || Object.getOwnPropertySymbols(value).length > 0)
        return false
      return Object.getOwnPropertyNames(value).every((key) => {
        const descriptor = Object.getOwnPropertyDescriptor(value, key)
        return (
          descriptor !== undefined &&
          descriptor.enumerable &&
          "value" in descriptor &&
          hasFaithfulJsonIdentity(descriptor.value, new Set(ancestors).add(value))
        )
      })
    }
    default:
      return false
  }
}

export const ContextRevision = {
  make: (pathLeafId: unknown, history: unknown, prompt: unknown): string | undefined => {
    try {
      const input = [pathLeafId, history, prompt]
      if (!hasFaithfulJsonIdentity(input)) return undefined
      const context = JSON.stringify(input)
      let hash = 2_166_136_261
      for (let index = 0; index < context.length; index += 1)
        hash = Math.imul(hash ^ context.charCodeAt(index), 16_777_619)
      return `${context.length}:${hash >>> 0}`
    } catch {
      return undefined
    }
  },
}
