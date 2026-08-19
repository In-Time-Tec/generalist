import { SandboxExecutor } from "tenetkit"

const validName = /^(?!\/)(?!.*(?:^|\/)\.\.(?:\/|$))[A-Za-z0-9._/-]+\.js$/
const imports = /\b(?:import|export)\s+(?:[^"']*?\s+from\s+)?["']([^"']+)["']|\bimport\s*\(\s*["']([^"']+)["']\s*\)/g

const resolve = (from: string, specifier: string): string => {
  const parts = from.split("/")
  parts.pop()
  for (const part of specifier.split("/")) {
    if (part === "." || part === "") continue
    if (part === "..") {
      if (parts.pop() === undefined) throw new TypeError("module import escapes the source root")
    } else parts.push(part)
  }
  return parts.join("/")
}

/** @experimental Validate and normalize an exact ES module graph before loading it. */
export const normalize = (
  request: SandboxExecutor.Request,
): Readonly<{ modules: ReadonlyArray<SandboxExecutor.Module>; record: Readonly<Record<string, string>> }> => {
  const names = new Set<string>()
  const folded = new Set<string>()
  const modules = [...request.modules].toSorted((left, right) => left.name.localeCompare(right.name))
  for (const module of modules) {
    if (!validName.test(module.name) || module.name.includes("//") || module.name.startsWith("./"))
      throw new TypeError("invalid module name")
    if (names.has(module.name) || folded.has(module.name.toLocaleLowerCase()))
      throw new TypeError("duplicate or case-conflicting module name")
    names.add(module.name)
    folded.add(module.name.toLocaleLowerCase())
  }
  if (!names.has(request.entrypoint)) throw new TypeError("entrypoint is absent from the module graph")
  for (const module of modules) {
    for (const match of module.source.matchAll(imports)) {
      const specifier = match[1] ?? match[2]!
      if (!specifier.startsWith("./") && !specifier.startsWith("../"))
        throw new TypeError("only relative ES module imports are supported")
      const target = resolve(module.name, specifier)
      if (!names.has(target)) throw new TypeError("module import is absent from the source graph")
    }
    if (/\brequire\s*\(|\bimport\s*\((?!\s*["'])/.test(module.source))
      throw new TypeError("CommonJS and computed imports are unsupported")
  }
  return { modules, record: Object.fromEntries(modules.map((module) => [module.name, module.source])) }
}

/** @experimental Generated protocol entrypoint; receives only constants and the capability RPC binding. */
export const runner = (entrypoint: string): string => `
import execute from ${JSON.stringify(`./${entrypoint}`)};
const json = (value, status = 200) => new Response(JSON.stringify(value), {
  status, headers: { "content-type": "application/json" }
});
export default {
  async fetch(request, env) {
    try {
      const envelope = await request.json();
      if (envelope.protocolVersion !== env.TENET_PROTOCOL_VERSION || envelope.requestId !== env.TENET_REQUEST_ID)
        return json({ error: "protocol identity mismatch" }, 400);
      const capabilities = Object.freeze({
        call: (operation, input) => env.TENET_CAPABILITIES.call({
          protocolVersion: env.TENET_PROTOCOL_VERSION,
          requestId: env.TENET_REQUEST_ID,
          operation,
          input
        })
      });
      const output = await execute(envelope.input, capabilities);
      return json({
        protocolVersion: env.TENET_PROTOCOL_VERSION,
        requestId: env.TENET_REQUEST_ID,
        sourceDigest: env.TENET_SOURCE_DIGEST,
        inputCodec: env.TENET_INPUT_CODEC,
        outputCodec: env.TENET_OUTPUT_CODEC,
        output
      });
    } catch (_) {
      return json({ error: "sandbox execution failed" }, 500);
    }
  }
};`
