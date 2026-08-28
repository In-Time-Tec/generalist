import { inspect as utilInspect, types } from "node:util"

export const formatValue = (value: unknown): string =>
  typeof value === "string"
    ? value
    : types.isNativeError(value)
      ? Bun.inspect(value, { depth: 4, colors: false })
      : utilInspect(value, { depth: 4, colors: false })

const canonicalJson = (value: unknown): string | undefined => {
  try {
    const encoded = JSON.stringify(value)
    if (encoded === undefined) return undefined
    const sort = (current: unknown): unknown =>
      Array.isArray(current)
        ? current.map(sort)
        : current !== null && typeof current === "object"
          ? Object.fromEntries(
              Object.keys(current)
                .sort()
                .map((key) => [key, sort((current as Record<string, unknown>)[key])]),
            )
          : current
    return JSON.stringify(sort(JSON.parse(encoded)))
  } catch {
    return undefined
  }
}

export const resultValue = (value: unknown): string =>
  typeof value === "string" || types.isNativeError(value)
    ? formatValue(value)
    : (canonicalJson(value) ?? formatValue(value))
