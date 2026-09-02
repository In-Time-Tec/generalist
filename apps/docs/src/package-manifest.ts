import generalistPackage from "../../../packages/generalist/package.json" with { type: "json" }

export const packageVersion = generalistPackage.version
export const packageSubpathCount = Object.keys(generalistPackage.exports).filter(
  (specifier) => specifier !== ".",
).length
